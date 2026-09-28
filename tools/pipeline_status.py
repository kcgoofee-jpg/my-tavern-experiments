#!/usr/bin/env python3
"""渲染管线实时看板（只读）。Python 3 标准库，macOS 下用 python3 跑。

    python3 tools/pipeline_status.py            # 每 10 秒刷新
    python3 tools/pipeline_status.py --once      # 只看一次
    python3 tools/pipeline_status.py --no-color --no-cloud --compact
    python3 tools/pipeline_status.py --only mac|cloud|tasks

只读：不派工、不改队列文件——派工是 tools/render_queue.sh dispatch 的事，这个脚本只读
logs/queue/{pending,running,done} 展示状态。云端多实例：优先读 tools/cloud/hosts/*.env
（回退 tools/cloud/remote.env），每个实例一行；查询用 tools/cloud/lib.sh 的 run_ssh，
不直接拼 ssh 参数，云端脚本内部逻辑不在这个文件里重复。
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import termios
import threading
import time
import tty
import unicodedata
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOUD_DIR = os.path.join(ROOT, "tools", "cloud")
QUEUE_DIR = os.path.join(ROOT, "logs", "queue")
TASKS_MD = os.path.join(ROOT, "logs", "pipeline_tasks.md")
RENDER_CSV = os.path.join(ROOT, "logs", "render_times.csv")
LAUNCH_JSON = os.path.join(ROOT, ".claude", "launch.json")

SPINNER = "|/-\\"

# ---------------------------------------------------------------- 宽度/截断 ----

def char_width(ch: str) -> int:
    if unicodedata.east_asian_width(ch) in ("W", "F"):
        return 2
    if unicodedata.combining(ch):
        return 0
    return 1


def strwidth(s: str) -> int:
    return sum(char_width(c) for c in s)


def truncate(s: str, width: int) -> str:
    """按显示宽度截断，超出用… 结尾，绝不换行。"""
    if width <= 0:
        return ""
    if strwidth(s) <= width:
        return s
    if width == 1:
        return "…"
    out = []
    w = 0
    for ch in s:
        cw = char_width(ch)
        if w + cw > width - 1:
            break
        out.append(ch)
        w += cw
    return "".join(out) + "…"


def pad(s: str, width: int) -> str:
    s = truncate(s, width)
    return s + " " * max(0, width - strwidth(s))


# ---------------------------------------------------------------- 颜色 --------

class Colors:
    def __init__(self, enabled: bool):
        self.on = enabled

    def _wrap(self, code: str, s: str) -> str:
        if not self.on or not s:
            return s
        return f"\033[{code}m{s}\033[0m"

    def green(self, s):
        return self._wrap("32", s)

    def yellow(self, s):
        return self._wrap("33", s)

    def magenta(self, s):
        return self._wrap("35", s)

    def dim(self, s):
        return self._wrap("2", s)

    def red(self, s):
        return self._wrap("31", s)

    def cyan(self, s):
        return self._wrap("36", s)

    def bold(self, s):
        return self._wrap("1", s)


def status_color(c: Colors, status: str) -> str:
    if "进行中" in status or status in ("BUSY", "跑" ):
        return c.green(status)
    if "排队" in status or status in ("pending",):
        return c.yellow(status)
    if status.startswith("等用户"):
        return c.magenta(status)
    if "暂停" in status or "以后" in status:
        return c.dim(status)
    return status


def gpu_bar(c: Colors, pct: float, width: int = 20) -> str:
    pct = max(0.0, min(100.0, pct))
    filled = int(round(pct / 100.0 * width))
    bar = "█" * filled + "░" * (width - filled)
    if pct >= 80:
        bar = c.green(bar)
    elif pct >= 30:
        bar = c.yellow(bar)
    else:
        bar = c.dim(bar)
    return f"{bar} {pct:5.1f}%"


# ---------------------------------------------------------------- 表格绘制 ----

def draw_table(headers, rows, widths, c: Colors) -> list:
    """box-drawing 字符对齐表，宽度按 widths 截断，返回行列表（不打印）。"""
    def hline(l, m, r):
        return l + m.join("─" * (w + 2) for w in widths) + r

    out = [hline("┌", "┬", "┐")]
    out.append("│ " + " │ ".join(c.bold(pad(h, w)) for h, w in zip(headers, widths)) + " │")
    out.append(hline("├", "┼", "┤"))
    for row in rows:
        out.append("│ " + " │ ".join(pad(str(v), w) for v, w in zip(row, widths)) + " │")
    out.append(hline("└", "┴", "┘"))
    return out


def fit_widths(headers, rows, total_width, min_widths=None):
    n = len(headers)
    min_widths = min_widths or [4] * n
    natural = [strwidth(h) for h in headers]
    for row in rows:
        for i, v in enumerate(row):
            natural[i] = max(natural[i], strwidth(str(v)))
    natural = [max(nw, mw) for nw, mw in zip(natural, min_widths)]
    overhead = n * 3 + 1  # "│ " * n + trailing "│"
    budget = max(total_width - overhead, n * 4)
    total = sum(natural)
    if total <= budget:
        return natural
    # 按比例缩，最后一列吃剩余
    scale = budget / total
    widths = [max(min_widths[i], int(natural[i] * scale)) for i in range(n)]
    diff = budget - sum(widths)
    widths[-1] = max(min_widths[-1], widths[-1] + diff)
    return widths


# ---------------------------------------------------------------- 数据采集 ----

def run(cmd, timeout=5):
    try:
        r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except Exception:
        return ""


BLENDER_WRAPPER_RE = re.compile(r"tools/blender_run\.sh")
LOG_ARG_RE = re.compile(r"--log\s+(\S+)")
ASSET_ARG_RE = re.compile(r"--asset\s+(\S+)")
OUT_ARG_RE = re.compile(r"--out\s+(\S+)")
RUNPATH_RE = re.compile(r"run_path\('([^']+)'\)")
SAMPLE_RE = re.compile(r"Sample\s+(\d+)\s*/\s*(\d+)")


def job_name_from_argv(argv: str) -> str:
    m = ASSET_ARG_RE.search(argv)
    if m:
        return m.group(1)
    m = OUT_ARG_RE.search(argv)
    if m:
        return os.path.splitext(os.path.basename(m.group(1)))[0]
    m = RUNPATH_RE.search(argv)
    if m:
        return os.path.splitext(os.path.basename(m.group(1)))[0]
    return "job"


def parse_progress(log_path: str):
    """从日志尾部找最新一行 Sample N/M，返回 (pct, "N/M") 或 None。"""
    if not log_path or not os.path.isfile(log_path):
        return None
    try:
        with open(log_path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 8000))
            tail = f.read().decode("utf-8", "ignore")
    except OSError:
        return None
    matches = SAMPLE_RE.findall(tail)
    if not matches:
        return None
    n, m = matches[-1]
    try:
        n, m = int(n), int(m)
        if m <= 0:
            return None
        return (min(100.0, n / m * 100.0), f"{n}/{m}")
    except ValueError:
        return None


def find_local_job():
    """本机：找 blender_run.sh 包装进程，解析出 --log/--asset，回 dict 或 None。"""
    out = run(["ps", "-eo", "etimes,pid,args"])
    for line in out.splitlines():
        line = line.strip()
        if not line or not BLENDER_WRAPPER_RE.search(line) or "grep" in line:
            continue
        parts = line.split(None, 2)
        if len(parts) < 3:
            continue
        etimes, pid, argv = parts
        try:
            elapsed = int(etimes)
        except ValueError:
            elapsed = 0
        log_m = LOG_ARG_RE.search(argv)
        log_path = log_m.group(1) if log_m else None
        if log_path and not os.path.isabs(log_path):
            log_path = os.path.join(ROOT, log_path)
        return {
            "name": job_name_from_argv(argv),
            "elapsed": elapsed,
            "log": log_path,
        }
    return None


def fmt_elapsed(seconds: int) -> str:
    seconds = max(0, int(seconds))
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h{m:02d}m"
    return f"{m}m{s:02d}s"


# ---------------------------------------------------------------- 云端 --------

def cloud_host_names():
    names = []
    if os.path.isfile(os.path.join(CLOUD_DIR, "remote.env")):
        names.append("default")
    hosts_dir = os.path.join(CLOUD_DIR, "hosts")
    if os.path.isdir(hosts_dir):
        for f in sorted(glob.glob(os.path.join(hosts_dir, "*.env"))):
            b = os.path.basename(f)[:-4]
            if b == "example":
                continue
            names.append(b)
    return names


CLOUD_QUERY = (
    "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader 2>&1; "
    "echo '--jobs--'; "
    "ps -eo etimes,args | grep '[t]ools/blender_run.sh' || true; "
    "echo '--uptime--'; "
    "cat /proc/uptime 2>/dev/null | awk '{print $1}'"
)


def query_cloud_host(host_name: str, timeout: int = 5):
    """跑一次 lib.sh 的 run_ssh（单次 ssh），解析 GPU / 任务行 / 开机时长。失败抛异常。"""
    host_flag = [] if host_name == "default" else ["--host", host_name]
    script = (
        f"cd {json.dumps(CLOUD_DIR)} && "
        "source ./lib.sh >/dev/null 2>&1 && "
        f"cloud_parse_host {' '.join(host_flag)} && "
        f"run_ssh {json.dumps(CLOUD_QUERY)} && echo PRICE=$PRICE_PER_HOUR"
    )
    r = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=timeout)
    out = r.stdout
    if r.returncode != 0 and not out.strip():
        raise RuntimeError(r.stderr.strip() or "ssh 失败")
    price = 1.58
    pm = re.search(r"^PRICE=([\d.]+)\s*$", out, re.M)
    if pm:
        try:
            price = float(pm.group(1))
        except ValueError:
            pass
    gpu_line = out.splitlines()[0].strip() if out.splitlines() else ""
    gpu_pct = 0.0
    gm = re.match(r"([\d.]+)\s*%,\s*([\d.]+)\s*MiB,\s*([\d.]+)\s*MiB", gpu_line)
    if gm:
        try:
            gpu_pct = float(gm.group(1))
        except ValueError:
            gpu_pct = 0.0
    jobs_section = re.search(r"--jobs--\n(.*?)\n--uptime--", out, re.S)
    job = None
    if jobs_section:
        for line in jobs_section.group(1).splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            etimes, argv = parts
            try:
                elapsed = int(etimes)
            except ValueError:
                elapsed = 0
            log_m = LOG_ARG_RE.search(argv)
            job = {"name": job_name_from_argv(argv), "elapsed": elapsed, "log": log_m.group(1) if log_m else None}
            break
    uptime_m = re.search(r"--uptime--\n([\d.]+)", out)
    uptime_s = float(uptime_m.group(1)) if uptime_m else None
    return {"gpu_pct": gpu_pct, "job": job, "uptime_s": uptime_s, "price": price, "ok": True}


def tail_remote_log(host_name: str, log_path: str, timeout: int = 5):
    host_flag = [] if host_name == "default" else ["--host", host_name]
    script = (
        f"cd {json.dumps(CLOUD_DIR)} && "
        "source ./lib.sh >/dev/null 2>&1 && "
        f"cloud_parse_host {' '.join(host_flag)} && "
        f"run_ssh {json.dumps('tail -c 8000 ' + log_path + ' 2>/dev/null')}"
    )
    try:
        r = subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except Exception:
        return ""


class CloudPoller:
    """后台线程跑 ssh 查询，避免 UI 卡住；失败保留上一次好结果并标「(Ns 前)」。"""

    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.lock = threading.Lock()
        self.results = {}  # host -> {..., "ts": float, "stale": bool}
        self.busy = set()
        self._stop = False

    def poll_once(self):
        if not self.enabled:
            return
        for host in cloud_host_names():
            if host in self.busy:
                continue
            threading.Thread(target=self._poll_host, args=(host,), daemon=True).start()

    def _poll_host(self, host):
        self.busy.add(host)
        try:
            data = query_cloud_host(host)
            if data.get("job") and data["job"].get("log"):
                tail = tail_remote_log(host, data["job"]["log"])
                if tail:
                    matches = SAMPLE_RE.findall(tail)
                    if matches:
                        n, m = matches[-1]
                        try:
                            n, m = int(n), int(m)
                            if m > 0:
                                data["job"]["progress"] = (min(100.0, n / m * 100.0), f"{n}/{m}")
                        except ValueError:
                            pass
            data["ts"] = time.time()
            data["stale"] = False
            with self.lock:
                self.results[host] = data
        except Exception:
            with self.lock:
                old = self.results.get(host)
                if old:
                    old = dict(old)
                    old["stale"] = True
                    self.results[host] = old
                else:
                    self.results[host] = {"ok": False, "ts": time.time(), "stale": True}
        finally:
            self.busy.discard(host)

    def snapshot(self):
        with self.lock:
            return dict(self.results)


# ---------------------------------------------------------------- 队列/任务 ---

def read_queue():
    counts = {"pending": 0, "running": 0, "done": 0}
    running_jobs = []
    for s in counts:
        d = os.path.join(QUEUE_DIR, s)
        if not os.path.isdir(d):
            continue
        files = [f for f in os.listdir(d) if f.endswith(".job")]
        counts[s] = len(files)
        if s == "running":
            for fn in sorted(files):
                fp = os.path.join(d, fn)
                try:
                    with open(fp, "r", encoding="utf-8", errors="ignore") as fh:
                        line = fh.readline().rstrip("\n")
                    tag, _, args = line.partition("\t")
                except OSError:
                    tag, args = "?", ""
                log_fp = fp + ".log"
                mtime = None
                if os.path.isfile(log_fp):
                    mtime = os.path.getmtime(log_fp)
                running_jobs.append({
                    "id": fn[:-4],
                    "tag": tag or "?",
                    "args": args,
                    "log": log_fp if os.path.isfile(log_fp) else None,
                    "log_mtime": mtime,
                })
    return counts, running_jobs


def guess_device(job_id, args, local_job, cloud_snap):
    if local_job and local_job.get("log") and job_id in (local_job.get("log") or ""):
        return "本机"
    for host, data in cloud_snap.items():
        j = data.get("job")
        if j and j.get("log") and job_id in (j.get("log") or ""):
            return f"云端/{host}"
    m = OUT_ARG_RE.search(args)
    return "未知"


def read_tasks_table():
    if not os.path.isfile(TASKS_MD):
        return None
    lines = []
    with open(TASKS_MD, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.rstrip("\n")
            if line.strip().startswith("|"):
                lines.append(line)
    if not lines:
        return None
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.match(r"^:?-{2,}:?$", c) for c in cells):
            continue  # markdown 分隔行
        rows.append(cells)
    if not rows:
        return None
    header, *body = rows
    return header, body


def read_recent_renders(n=5):
    if not os.path.isfile(RENDER_CSV):
        return None, []
    with open(RENDER_CSV, "r", encoding="utf-8", errors="ignore") as f:
        lines = [l.rstrip("\n") for l in f if l.strip()]
    if not lines:
        return None, []
    header = [c.strip() for c in lines[0].split(",")]
    body = [([c.strip() for c in l.split(",")]) for l in lines[1:]]
    return header, body[-n:]


# ---------------------------------------------------------------- 提醒 --------

def preview_ports_from_launch_json():
    if not os.path.isfile(LAUNCH_JSON):
        return []
    try:
        with open(LAUNCH_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    ports = []
    for cfg in data.get("configurations", []):
        p = cfg.get("port")
        if isinstance(p, int):
            ports.append((cfg.get("name", "?"), p))
    return ports


def listening_ports(ports):
    if not ports:
        return []
    out = run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], timeout=3)
    hit = []
    for name, port in ports:
        if re.search(rf"[:.]{port}\s*\(LISTEN\)", out):
            hit.append((name, port))
    return hit


class ReminderState:
    """维护跨刷新的「空闲从何时开始」，用于 >10 分钟 / >30 分钟这类判断。"""

    def __init__(self):
        self.cloud_idle_since = {}
        self.mac_idle_since = None

    def update_cloud(self, host, busy):
        now = time.time()
        if busy:
            self.cloud_idle_since.pop(host, None)
        else:
            self.cloud_idle_since.setdefault(host, now)

    def update_mac(self, busy):
        now = time.time()
        if busy:
            self.mac_idle_since = None
        else:
            if self.mac_idle_since is None:
                self.mac_idle_since = now


def build_reminders(c: Colors, state: ReminderState, local_job, cloud_snap, running_jobs, pending_count):
    now = time.time()
    out = []
    for host, data in cloud_snap.items():
        if not data.get("ok"):
            continue
        busy = bool(data.get("job"))
        state.update_cloud(host, busy)
        since = state.cloud_idle_since.get(host)
        if since and now - since > 600:
            price = data.get("price", 1.58)
            mins = (now - since) / 60
            out.append(c.yellow(f"⚠ 云端 {host} 已空闲 {mins:.0f} 分钟仍开机，约浪费 ¥{price:.2f}/时"))
    state.update_mac(bool(local_job))
    if state.mac_idle_since and pending_count > 0:
        mins = (now - state.mac_idle_since) / 60
        out.append(c.dim(f"· Mac 空闲 {mins:.0f} 分钟，队列还有 {pending_count} 个待派任务"))
    for job in running_jobs:
        if job.get("log_mtime") is not None and now - job["log_mtime"] > 1800:
            mins = (now - job["log_mtime"]) / 60
            out.append(c.red(f"⚠ 任务 {job['id']}（{job['tag']}）进行中但 {mins:.0f} 分钟没有新渲染输出"))
    ports = preview_ports_from_launch_json()
    for name, port in listening_ports(ports):
        out.append(c.yellow(f"⚠ 预览服务 {name}（端口 {port}）仍在监听，交回前记得清理"))
    return out


# ---------------------------------------------------------------- 渲染帧 ------

class Renderer:
    def __init__(self, args, colors: Colors):
        self.args = args
        self.c = colors
        self.interval = args.interval
        self.show_cloud = not args.no_cloud
        self.show_tasks = True
        self.poller = CloudPoller(self.show_cloud)
        self.reminder_state = ReminderState()
        self.spin_i = 0

    def spinner(self):
        self.spin_i = (self.spin_i + 1) % len(SPINNER)
        return SPINNER[self.spin_i]

    def render(self) -> str:
        cols, _ = shutil.get_terminal_size((100, 30))
        c = self.c
        lines = []
        now = datetime.now().strftime("%H:%M:%S")
        cloud_snap = self.poller.snapshot() if self.show_cloud else {}
        total_cost = sum(
            (d.get("uptime_s") or 0) / 3600 * d.get("price", 1.58)
            for d in cloud_snap.values() if d.get("ok")
        )
        price_bits = "/".join(f"{h}¥{d.get('price', 1.58):.2f}" for h, d in cloud_snap.items() if d.get("ok"))
        header = f" 渲染管线看板  {now}  刷新{self.interval}s"
        if price_bits:
            header += f"  单价 {price_bits}/时"
        header += f"  云端累计约 ¥{total_cost:.2f}"
        lines.append(c.bold(truncate(header, cols)))
        lines.append("─" * cols)

        only = self.args.only
        local_job = find_local_job() if only in (None, "mac") else None

        if only in (None, "mac"):
            lines.append(c.bold("【本机 Mac】"))
            if local_job:
                elapsed = fmt_elapsed(local_job["elapsed"])
                prog = parse_progress(local_job.get("log"))
                if prog:
                    pct, frac = prog
                    lines.append(f"  {c.green('●')} {local_job['name']}  已跑 {elapsed}  {gpu_bar(c, pct, 16)}  ({frac})")
                else:
                    lines.append(f"  {c.green('●')} {local_job['name']}  已跑 {elapsed}  {self.spinner()} 进度未知")
            else:
                lines.append(f"  {c.dim('空闲')}")
            lines.append("")

        if only in (None, "cloud"):
            lines.append(c.bold("【云端】") + (c.dim("  --no-cloud 已关闭") if not self.show_cloud else ""))
            if self.show_cloud:
                hosts = cloud_host_names()
                if not hosts:
                    lines.append("  （未配置 remote.env / hosts/*.env）")
                for h in hosts:
                    d = cloud_snap.get(h)
                    if not d:
                        lines.append(f"  {h}：{self.spinner()} 查询中…")
                        continue
                    if not d.get("ok"):
                        age = int(time.time() - d.get("ts", time.time()))
                        lines.append(f"  {h}：{c.red('连不上')}（{age}s 前）")
                        continue
                    stale = f"  {c.dim('(%ds 前)' % int(time.time() - d['ts']))}" if d.get("stale") else ""
                    bar = gpu_bar(c, d.get("gpu_pct", 0.0))
                    job = d.get("job")
                    if job:
                        elapsed = fmt_elapsed(job["elapsed"])
                        prog = job.get("progress")
                        if prog:
                            pct, frac = prog
                            job_desc = f"{c.green('●')} {job['name']} 已跑 {elapsed} ({frac})"
                        else:
                            job_desc = f"{c.green('●')} {job['name']} 已跑 {elapsed} {self.spinner()}"
                    else:
                        job_desc = c.dim("空闲")
                    hours = (d.get("uptime_s") or 0) / 3600
                    cost = hours * d.get("price", 1.58)
                    line = f"  {h}：{bar}  {job_desc}  开机{hours:.1f}h ¥{cost:.2f}{stale}"
                    lines.append(truncate(line, cols))
            lines.append("")

        counts, running_jobs = read_queue()
        if only in (None, "tasks", "cloud", "mac"):
            lines.append(c.bold("【队列】"))
            lines.append(
                f"  排队 {status_color(c, 'pending' if counts['pending'] else '')}{counts['pending']}"
                f"  进行中 {counts['running']}  已完成 {counts['done']}"
            )
            if running_jobs and not self.args.compact:
                for j in running_jobs:
                    dev = guess_device(j["id"], j["args"], local_job, cloud_snap)
                    lines.append(f"    {truncate(j['id'], 28)}  tag={j['tag']}  设备={dev}")
            lines.append("")

        if self.show_tasks and only in (None, "tasks"):
            lines.append(c.bold("【任务】"))
            tbl = read_tasks_table()
            if tbl:
                header, rows = tbl
                widths = fit_widths(header, rows, cols - 2)
                for row in draw_table(header, rows, widths, c):
                    lines.append("  " + row)
            else:
                lines.append("  （logs/pipeline_tasks.md 无表格）")
            lines.append("")

        if not self.args.compact and only in (None,):
            lines.append(c.bold("【最近完成】"))
            header, rows = read_recent_renders(5)
            if header and rows:
                # tools/blender_run.sh 实际写的是 date,asset,kind,res,spp,minutes,exit（7 列），
                # 但 render_times.csv 现有表头是旧的 date,label,spp,res,minutes,status（6 列）——
                # 表头和实际数据列数不一致时按 blender_run.sh 的真实写法（7 列）按位取，不信表头。
                WRITER_FIELDS = ["date", "label", "kind", "res", "spp", "minutes", "exit"]

                def col(row, name, default=""):
                    names = WRITER_FIELDS if len(row) == len(WRITER_FIELDS) else header
                    try:
                        return row[names.index(name)]
                    except (ValueError, IndexError):
                        return default

                disp_rows = []
                for row in rows:
                    label = col(row, "label") or col(row, "asset")
                    kind = col(row, "kind") or col(row, "status")
                    res = col(row, "res")
                    spp = col(row, "spp")
                    minutes = col(row, "minutes")
                    disp_rows.append([label, kind, res, spp, minutes])
                widths = fit_widths(["标签", "类型", "分辨率", "spp", "分钟"], disp_rows, cols - 2)
                for row in draw_table(["标签", "类型", "分辨率", "spp", "分钟"], disp_rows, widths, c):
                    lines.append("  " + row)
            else:
                lines.append("  （logs/render_times.csv 无记录）")
            lines.append("")

        lines.append(c.bold("【提醒】"))
        reminders = build_reminders(c, self.reminder_state, local_job, cloud_snap, running_jobs, counts["pending"])
        if reminders:
            for r in reminders:
                lines.append("  " + truncate(r, cols - 2))
        else:
            lines.append(f"  {c.dim('无')}")

        keys = "q 退出  r 刷新  c 切云端  t 切任务表  +/- 调间隔"
        lines.append("")
        lines.append(c.dim(truncate(keys, cols)))
        return "\n".join(lines)


# ---------------------------------------------------------------- 键盘 --------

class RawKeys:
    def __init__(self):
        self.enabled = sys.stdin.isatty()
        self.old = None

    def __enter__(self):
        if self.enabled:
            try:
                self.old = termios.tcgetattr(sys.stdin.fileno())
                tty.setcbreak(sys.stdin.fileno())
            except Exception:
                self.enabled = False
        return self

    def __exit__(self, *exc):
        if self.enabled and self.old is not None:
            try:
                termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, self.old)
            except Exception:
                pass

    def poll(self, timeout: float):
        if not self.enabled:
            time.sleep(max(0, timeout))
            return None
        r, _, _ = select.select([sys.stdin], [], [], max(0, timeout))
        if r:
            return sys.stdin.read(1)
        return None


ALT_ON = "\033[?1049h"
ALT_OFF = "\033[?1049l"
CUR_HOME = "\033[H"


def main():
    ap = argparse.ArgumentParser(description="渲染管线看板")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--interval", type=int, default=10)
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--no-cloud", action="store_true")
    ap.add_argument("--compact", action="store_true")
    ap.add_argument("--only", choices=["mac", "cloud", "tasks"], default=None)
    args = ap.parse_args()

    is_tty = sys.stdout.isatty()
    colors = Colors(enabled=(not args.no_color) and is_tty)
    renderer = Renderer(args, colors)

    interactive = is_tty and not args.once

    def cleanup(*_a):
        if interactive:
            sys.stdout.write(ALT_OFF)
            sys.stdout.flush()

    signal.signal(signal.SIGINT, lambda *_a: (cleanup(), sys.exit(0)))

    if args.once:
        if renderer.show_cloud:
            renderer.poller.poll_once()
            time.sleep(min(4, args.interval))
        sys.stdout.write(renderer.render() + "\n")
        return

    if interactive:
        sys.stdout.write(ALT_ON)
        sys.stdout.flush()

    try:
        with RawKeys() as keys:
            next_poll = 0.0
            while True:
                if renderer.show_cloud and time.time() >= next_poll:
                    renderer.poller.poll_once()
                    next_poll = time.time() + renderer.interval
                frame = renderer.render()
                if interactive:
                    sys.stdout.write(CUR_HOME + "\033[J" + frame + "\n")
                else:
                    sys.stdout.write(frame + "\n")
                sys.stdout.flush()

                deadline = time.time() + renderer.interval
                while time.time() < deadline:
                    ch = keys.poll(min(0.5, deadline - time.time()))
                    if ch is None:
                        continue
                    if ch == "q":
                        cleanup()
                        return
                    if ch == "r":
                        break
                    if ch == "c":
                        renderer.show_cloud = not renderer.show_cloud
                        renderer.poller.enabled = renderer.show_cloud
                        break
                    if ch == "t":
                        renderer.show_tasks = not renderer.show_tasks
                        break
                    if ch in ("+", "="):
                        renderer.interval = min(300, renderer.interval + 5)
                        break
                    if ch in ("-", "_"):
                        renderer.interval = max(2, renderer.interval - 5)
                        break
    finally:
        cleanup()


if __name__ == "__main__":
    main()
