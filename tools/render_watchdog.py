#!/usr/bin/env python3
"""渲染看门狗：跟 Blender 一起跑，按阶段判断「是不是在白烧钱」，只杀本任务的 Blender PID。

由 tools/blender_run.sh 在起 Blender 之后自动拉起（Mac 与云端同一套），一般不需要手动调用。设计见 docs/cloud-render.md「渲染看门狗」。

  python3 tools/render_watchdog.py watch --log L --pid P [--asset A --kind K --res N --spp N --csv logs/render_times.csv] [--allow-cpu]
  python3 tools/render_watchdog.py estimate --asset A --kind K --res N --spp N [--csv ...]   # 只打印预计分钟数

阶段（来自 tc_common.setup_render_device 注册的 bpy.app.handlers 打的 EDEN_PHASE= 行）：
  build  场景搭建（开始时、以及每次 render_complete 之后）：显卡空闲是正常的。累计超过 3×预计 → 警告；超过硬上限 → 杀（build_timeout）
  render 渲染：每 10 s 采一次 nvidia-smi；所有卡利用率 0 且显存 < 阈值连续 60 s → 杀（gpu_idle）。
         设备行是 CPU 且没给 --allow-cpu → 立即杀（cpu_fallback）。进度（采样/分块）N 分钟不动 → 杀（stall）。
  post / write  合成与写盘：显卡空闲正常，只看停滞。
  总时长超过 3×预计 → 只警告。
blender_run.sh 在任何脚本之前注入 eden_guard.install()，所以即使脚本没调用 helper，render_pre 也会按场景真实状态报 EDEN_DEVICE=；
显卡空闲判定在本次渲染出现 stage=sample 后（或进入渲染 5 分钟后）才生效，避开首次 OptiX 编译内核 / 大场景同步 BVH 的空闲期。
显存优先用 nvidia-smi --query-compute-apps 里本 PID 的占用，查不到（容器 PID 命名空间）再用整卡显存。

输出：<log>.watchdog（中文事件，追加）、<log>.wdstate（一行当前状态，tools/cloud/status.sh 显示）、
      杀进程前写 <log>.wdkill（第一行状态码，第二行原因），blender_run.sh 据此记账、跳过崩溃重试。
只用标准库：云端没有系统 python3，blender_run.sh 会用 Blender 自带的 python 跑本脚本。
"""
import argparse, csv, os, re, signal, statistics, subprocess, sys, time

# ---------------------------------------------------------------- 估时（logs/render_times.csv）
DEFAULT_EST_MIN = 10.0
EST_FLOOR_MIN = 3.0
SCALE_CLAMP = (0.2, 5.0)


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def read_history(path):
    """兼容历史上的几种列布局，返回 [dict(asset, kind, res, spp, minutes, ok)]。
    6 列：date,label,spp,res,minutes,status   7 列：date,asset,kind,res,spp,minutes,exit
    8 列：…,host   11 列：…,host,status,wasted_min,wasted_cny"""
    rows = []
    try:
        f = open(path, encoding='utf-8', newline='')
    except OSError:
        return rows
    with f:
        for r in csv.reader(f):
            if not r or r[0] == 'date':
                continue
            n = len(r)
            if n == 6:
                d = dict(asset=r[1], kind='', spp=_num(r[2]), res=_num(r[3]), minutes=_num(r[4]), ok=r[5] == 'ok')
            elif n >= 7:
                d = dict(asset=r[1], kind=r[2], res=_num(r[3]), spp=_num(r[4]), minutes=_num(r[5]), ok=r[6] == '0',
                         host=r[7] if n >= 8 else '')
                if n >= 9 and r[8]:
                    d['ok'] = d['ok'] and r[8] == 'ok'
            else:
                continue
            if d['minutes'] is None or not d['ok']:
                continue
            rows.append(d)
    return rows


def host_class(h):
    return 'cloud' if str(h or '').startswith('autodl') else 'mac'


def estimate_minutes(rows, asset=None, kind=None, res=None, spp=None, host=None):
    """同资产 → 同类型（按 res²×spp 折算，折算系数夹在 0.2–5）→ 默认 10 分钟；下限 3 分钟。返回 (分钟, 来源说明)。
    host 给了（'autodl-…' = 云端，其它 = Mac）时先只看同类机器的行，没有再看全部。
    注意 minutes 是总时长（搭建 + 渲染），拿来当搭建预算是偏宽的（宁可晚杀，不误杀）。"""
    res, spp = _num(res), _num(spp)

    def scaled(rs):
        vals = []
        for r in rs:
            m = max(r['minutes'], 0.5)       # blender_run.sh 按整分钟四舍五入，0 = 不到半分钟
            if res and spp and r['res'] and r['spp']:
                k = (res * res * spp) / (r['res'] * r['res'] * r['spp'])
                m *= min(max(k, SCALE_CLAMP[0]), SCALE_CLAMP[1])
            vals.append(m)
        return statistics.median(vals) if vals else None

    hc = host_class(host) if host is not None else None
    for label, pick in (('同资产', lambda r: asset and r['asset'] == asset),
                        ('同类型', lambda r: kind and r['kind'] == kind)):
        same = [r for r in rows if pick(r)]
        mine = [r for r in same if hc and host_class(r.get('host')) == hc]
        v = scaled(mine) if mine else scaled(same)
        if v is not None:
            return max(v, EST_FLOOR_MIN), label + ('·同机型' if mine else '')
    return DEFAULT_EST_MIN, '默认'


# ---------------------------------------------------------------- 状态机（不碰时钟与进程，便于单测）
RE_KV = re.compile(r'(\w+)=(\S+)')

REASONS = {
    'cpu_fallback': '渲染阶段开始时设备是 CPU（没给 --allow-cpu）：GPU 没配上，按 CPU 渲会白烧钱',
    'gpu_idle': '渲染阶段显卡利用率 0% 且显存低于阈值持续 {idle}s：实际在用 CPU 渲或卡死',
    'stall': '渲染进度 {mins:.0f} 分钟没有前进（阶段 {phase}，最后进度 {key}）',
    'build_timeout': '场景搭建累计 {mins:.1f} 分钟，超过硬上限 {cap:.0f} 分钟（预计 {est:.1f} 分钟）',
}


class Watchdog:
    def __init__(self, est_min=DEFAULT_EST_MIN, allow_cpu=False, idle_sec=60, idle_mem_mib=100, arm_grace_sec=300,
                 stall_min=10, kernel_stall_min=20, post_stall_min=15, build_cap_min=None, t0=0.0):
        self.est = float(est_min)
        self.allow_cpu = allow_cpu
        self.idle_sec, self.idle_mem, self.arm_grace = idle_sec, idle_mem_mib, arm_grace_sec
        self.render_t, self.sampled = t0, False    # 本次渲染开始时刻；本次渲染是否已出现 stage=sample
        self.stall_min, self.kernel_stall_min, self.post_stall_min = stall_min, kernel_stall_min, post_stall_min
        self.build_cap = float(build_cap_min) if build_cap_min else max(6 * self.est, 30.0)
        self.t0 = self.t_last = t0
        self.phase, self.phase_src = 'build', 'start'
        self.build_s = 0.0
        self.device = None                 # 'OPTIX' / 'CUDA' / 'METAL' / 'CPU' / None（没调用 helper）
        self.device_allow = False
        self.stage, self.key, self.key_t = None, None, t0
        self.idle_since = None
        self.gpu = None                    # 最近一次采样 [(util, mem)]
        self.warned = set()
        self.killed = None                 # (状态码, 原因)
        self.aborted = None                # 进程内自己中止（EDEN_ABORT=）
        self.renders = 0

    # -- 事件 --
    def _kill(self, code, **fmt):
        if self.killed:
            return []
        self.killed = (code, REASONS[code].format(**fmt))
        return [('kill', code, self.killed[1])]

    def _warn(self, code, msg):
        if code in self.warned:
            return []
        self.warned.add(code)
        return [('warn', code, msg)]

    def _enter(self, phase, t, src='marker'):
        ev = []
        self._advance(t)
        if phase == self.phase:
            return ev
        self.phase, self.phase_src = phase, src
        self.key_t, self.idle_since = t, None
        if phase == 'render':
            self.renders += 1
            self.stage, self.render_t, self.sampled = None, t, False
            if self.device is None:
                ev += self._warn('no_device_line', '进入渲染阶段但日志里没有 EDEN_DEVICE= 行：脚本没调用 setup_render_device，只能靠显卡采样判断')
            elif self.device == 'CPU' and not (self.allow_cpu or self.device_allow):
                ev += self._kill('cpu_fallback')
        return ev

    def _advance(self, t):
        dt = max(0.0, t - self.t_last)
        if self.phase == 'build':
            self.build_s += dt
        self.t_last = max(self.t_last, t)

    def feed(self, line, t):
        """喂一行日志。"""
        if self.killed:
            return []
        ev = []
        s = line.strip()
        if s.startswith('EDEN_DEVICE='):
            kv = dict(RE_KV.findall(s))
            self.device = kv.get('EDEN_DEVICE', '').upper() or None
            self.device_allow = kv.get('allow_cpu') == '1'
            if self.phase == 'render' and self.device == 'CPU' and not (self.allow_cpu or self.device_allow):
                ev += self._kill('cpu_fallback')
        elif s.startswith('EDEN_PHASE='):
            p = s.split('=', 1)[1].split()[0].lower()
            if p in ('done', 'cancel'):
                p = 'build'
            if p in ('build', 'render', 'post', 'write'):
                ev += self._enter(p, t)
        elif s.startswith('EDEN_ABORT='):
            self.aborted = s.split('=', 1)[1].split()[0]
        elif s.startswith('EDEN_PROGRESS'):
            kv = dict(RE_KV.findall(s))
            if self.phase == 'build':
                ev += self._enter('render', t, 'progress')
            self.stage = kv.get('stage')
            if self.stage == 'sample':
                self.sampled = True
            self._progress((kv.get('stage'), kv.get('sample'), kv.get('tile'), kv.get('note')), t)
        return ev + self.tick(t)

    def _progress(self, key, t):
        if key != self.key:
            self.key, self.key_t = key, t

    def gpu_sample(self, samples, t):
        """samples: [(利用率%, 显存MiB 或 None)]；空 / None 表示取不到（不据此杀）。"""
        if self.killed:
            return []
        self.gpu = samples
        ev = []
        known = [s for s in (samples or []) if s[0] is not None and s[1] is not None]
        armed = self.sampled or (t - self.render_t) >= self.arm_grace
        cpu_ok = self.device == 'CPU' and (self.allow_cpu or self.device_allow)   # 明确允许的 CPU 渲染：显卡空闲是应该的
        if self.phase == 'render' and known and armed and not cpu_ok:
            idle = all(u == 0 and m < self.idle_mem for u, m in known)
            if not idle:
                self.idle_since = None
            else:
                if self.idle_since is None:
                    self.idle_since = t
                if t - self.idle_since >= self.idle_sec:
                    ev += self._kill('gpu_idle', idle=int(t - self.idle_since))
        return ev + self.tick(t)

    def tick(self, t):
        if self.killed:
            return []
        self._advance(t)
        ev = []
        total_min = (t - self.t0) / 60
        if total_min > 3 * self.est:
            ev += self._warn('total_over', f'总时长 {total_min:.1f} 分钟，超过预计 {self.est:.1f} 分钟的 3 倍（只警告）')
        bmin = self.build_s / 60
        if self.phase == 'build':
            if bmin > 3 * self.est:
                ev += self._warn('build_over', f'场景搭建累计 {bmin:.1f} 分钟，超过预计的 3 倍（显卡空闲是正常的；{self.build_cap:.0f} 分钟硬上限会杀）')
            if bmin > self.build_cap:
                ev += self._kill('build_timeout', mins=bmin, cap=self.build_cap, est=self.est)
        else:
            lim = self.post_stall_min if self.phase in ('post', 'write') else (
                self.kernel_stall_min if self.stage == 'kernels' else self.stall_min)
            still = (t - self.key_t) / 60
            if still > lim:
                ev += self._kill('stall', mins=still, phase=self.phase, key='/'.join(str(k) for k in (self.key or ()) if k and k != '-') or '无')
        return ev

    def state_line(self, t):
        g = ' '.join(f'{u}%/{m}MiB' if m is not None else f'{u}%' for u, m in (self.gpu or []) if u is not None) or '—'
        k = '/'.join(str(x) for x in (self.key or ()) if x and x != '-') or '—'
        return (f'phase={self.phase} device={self.device or "?"} elapsed={(t - self.t0) / 60:.1f}m est={self.est:.1f}m '
                f'build={self.build_s / 60:.1f}m progress={k} gpu={g}')


# ---------------------------------------------------------------- 采样
def probe_gpu(pid=None):
    """[(util, mem_mib)]；取不到返回 None。EDEN_NVIDIA_SMI 可指向假的 nvidia-smi（测试用）。
    显存：本 PID 出现在 --query-compute-apps 里就用它的占用（不被同卡别的任务骗），否则用整卡显存。
    macOS：ioreg 只给利用率（统一内存，显存阈值无意义），返回 (util, None)——只记录，不据此杀。"""
    smi = os.environ.get('EDEN_NVIDIA_SMI') or 'nvidia-smi'
    try:
        out = subprocess.run([smi, '--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'],
                             capture_output=True, text=True, timeout=15)
        if out.returncode == 0:
            res = []
            for ln in out.stdout.strip().splitlines():
                p = [x.strip() for x in ln.split(',')]
                if len(p) >= 2:
                    res.append((int(float(p[0])), int(float(p[1]))))
            if res and pid:
                try:
                    apps = subprocess.run([smi, '--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'],
                                          capture_output=True, text=True, timeout=15).stdout
                    mine = [int(float(q[1])) for q in (l.split(',') for l in apps.splitlines()) if len(q) >= 2 and q[0].strip() == str(pid)]
                    if mine:
                        res = [(u, sum(mine)) for u, _ in res]
                except (OSError, subprocess.SubprocessError, ValueError):
                    pass
            if res:
                return res
    except (OSError, subprocess.SubprocessError, ValueError):
        pass
    if sys.platform == 'darwin':
        try:
            out = subprocess.run(['ioreg', '-r', '-d', '1', '-c', 'IOAccelerator'], capture_output=True, text=True, timeout=15).stdout
            m = re.search(r'"Device Utilization %"=(\d+)', out)
            if m:
                return [(int(m.group(1)), None)]
        except (OSError, subprocess.SubprocessError):
            pass
    return None


def pid_alive(pid):
    """僵尸进程（已退出、父进程还没回收）算已退出。"""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    try:
        st = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True, timeout=10).stdout.strip()
        return not st.startswith('Z')
    except (OSError, subprocess.SubprocessError):
        return True


def pid_comm(pid):
    try:
        return subprocess.run(['ps', '-o', 'comm=', '-p', str(pid)], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ''


def kill_pid(pid, grace=10.0, expect_comm='lender'):
    """先 TERM，等 grace 秒，还活着再 KILL。只动这一个 PID，且进程名要含 expect_comm（防 PID 复用误杀；
    blender_run.sh 是 Blender 的父进程，回收之前 PID 不会被复用，回收后立刻停掉看门狗）。"""
    if expect_comm and expect_comm not in pid_comm(pid):
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    end = time.time() + grace
    while time.time() < end:
        if not pid_alive(pid):
            return
        time.sleep(0.2)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


# ---------------------------------------------------------------- 主循环
def watch(a):
    log = a.log
    rows = read_history(a.csv) if a.csv else []
    if os.environ.get('EDEN_EST_MIN'):
        est, src = float(os.environ['EDEN_EST_MIN']), '提交端传入'
    else:
        est, src = estimate_minutes(rows, a.asset, a.kind, a.res, a.spp, a.host)
    allow = a.allow_cpu or os.environ.get('EDEN_ALLOW_CPU') == '1'
    t0 = time.time()
    wd = Watchdog(est, allow_cpu=allow, idle_sec=a.idle_sec, idle_mem_mib=a.idle_mem, arm_grace_sec=a.arm_grace_sec, stall_min=a.stall_min,
                  kernel_stall_min=a.kernel_stall_min, post_stall_min=a.post_stall_min,
                  build_cap_min=a.build_cap_min or os.environ.get('EDEN_BUILD_CAP_MIN'), t0=t0)
    for suf in ('.wdkill',):
        try:
            os.remove(log + suf)
        except OSError:
            pass

    def note(msg):
        line = f'{time.strftime("%H:%M:%S")} {msg}'
        print(f'[看门狗] {msg}', flush=True)
        with open(log + '.watchdog', 'a', encoding='utf-8') as f:
            f.write(line + '\n')

    note(f'开始：PID {a.pid}，预计 {est:.1f} 分钟（{src}），搭建硬上限 {wd.build_cap:.0f} 分钟，allow_cpu={int(allow)}')
    pos, buf, next_gpu = 0, '', 0.0
    while True:
        now = time.time()
        ev = []
        try:
            with open(log, 'rb') as f:
                f.seek(pos)
                chunk = f.read()
                pos += len(chunk)
            buf += chunk.decode('utf-8', 'replace')
            *lines, buf = buf.split('\n')
            for ln in lines:
                ev += wd.feed(ln, now)
        except OSError:
            pass
        if now >= next_gpu:
            ev += wd.gpu_sample(probe_gpu(a.pid), now)
            next_gpu = now + a.sample_sec
        ev += wd.tick(now)
        try:
            with open(log + '.wdstate', 'w', encoding='utf-8') as f:
                f.write(f'hb={int(now)} ' + wd.state_line(now) + '\n')
        except OSError:
            pass
        for kind, code, msg in ev:
            if kind == 'warn':
                note(f'警告 {code}：{msg}')
            elif kind == 'kill':
                note(f'终止 {code}：{msg}（只杀 PID {a.pid}）')
                with open(log + '.wdkill', 'w', encoding='utf-8') as f:
                    f.write(f'{code}\n{msg}\n')
                kill_pid(a.pid, a.grace, a.expect_comm)
                return 3
        if not pid_alive(a.pid):
            note(f'Blender 已退出：{wd.state_line(now)}')
            return 0
        time.sleep(a.poll)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('watch', 'estimate'):
        p = sub.add_parser(name)
        p.add_argument('--asset'); p.add_argument('--kind'); p.add_argument('--res'); p.add_argument('--spp'); p.add_argument('--host')
        p.add_argument('--csv', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'logs', 'render_times.csv'))
        if name == 'watch':
            p.add_argument('--log', required=True); p.add_argument('--pid', type=int, required=True)
            p.add_argument('--allow-cpu', action='store_true')
            p.add_argument('--sample-sec', type=float, default=10.0); p.add_argument('--poll', type=float, default=2.0)
            p.add_argument('--idle-sec', type=float, default=60.0); p.add_argument('--idle-mem', type=float, default=100.0)
            p.add_argument('--stall-min', type=float, default=10.0); p.add_argument('--kernel-stall-min', type=float, default=20.0)
            p.add_argument('--post-stall-min', type=float, default=15.0); p.add_argument('--build-cap-min', type=float)
            p.add_argument('--grace', type=float, default=10.0); p.add_argument('--arm-grace-sec', type=float, default=300.0)
            p.add_argument('--expect-comm', default='lender', help='只杀进程名含此串的 PID（测试可设为空）')
    a = ap.parse_args(argv)
    if a.cmd == 'estimate':
        est, src = estimate_minutes(read_history(a.csv), a.asset, a.kind, a.res, a.spp, a.host)
        print(f'{est:.1f}\t{src}')
        return 0
    return watch(a)


if __name__ == '__main__':
    sys.exit(main())
