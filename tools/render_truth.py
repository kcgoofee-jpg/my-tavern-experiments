#!/usr/bin/env python3
"""Did a render that exited 0 really succeed?  (R2 T1: guard truthfulness)

A Blender run can exit 0 after its script died with a traceback, or after writing nothing.  This module turns the
log plus the declared outputs into an honest verdict; blender_run.sh calls it after every run and the queue uses
`stale_output` as a second check.

  python3 tools/render_truth.py check --log <log> [--start <epoch>] [--out <path> ...] [--root <dir>]
      exit 0 = clean; exit 1 = failed, `EDEN_TRUTH=<status> <reason>` on stdout
      status: script_error | no_output | stale_output
  python3 tools/render_truth.py outs -- <blender_run.sh args>    # prints the --out values the script args declare

The declared output of a run is every `--out <path>` after the last bare `--` in the arguments (the script's
own argv), plus any --out given to `check` explicitly.  Relative paths resolve against --root.
"""
import argparse, os, re, sys

# Lines that mean "the script failed": Python's own traceback header, or Blender's "Error: ..." report of it.
BAD = re.compile(r'^(Traceback \(most recent call last\)|Error: )')
# Blender chatter that starts with "Error:" but is not a script failure.
BENIGN = re.compile(r'^Error: Not freed memory blocks')
GRACE = 1.0      # seconds of mtime slack (filesystems with 1-2 s granularity)


def log_error(log):
    """First offending log line, or None."""
    try:
        with open(log, errors='replace') as f:
            for n, line in enumerate(f, 1):
                if BAD.match(line) and not BENIGN.match(line):
                    return f'{log}:{n}: {line.strip()[:160]}'
    except OSError:
        return None
    return None


def script_outs(args):
    """--out values in the script argv (after the last bare `--`)."""
    if '--' not in args:
        return []
    tail = args[len(args) - args[::-1].index('--'):]
    return [tail[i + 1] for i, t in enumerate(tail[:-1]) if t == '--out']


def stale_output(out, start, root='.'):
    """None if `out` exists and was written at/after `start`; else a reason string."""
    p = out if os.path.isabs(out) else os.path.join(root, out)
    if not os.path.exists(p):
        return 'no_output', f'declared output missing: {out}'
    if start is not None and not os.path.isdir(p) and os.path.getmtime(p) < start - GRACE:   # a directory's mtime says nothing
        return 'stale_output', f'declared output older than the job start: {out}'
    return None


def verdict(log, outs=(), start=None, root='.'):
    """(status, reason) for a run that exited 0; ('ok', '') when it really succeeded."""
    bad = log_error(log)
    if bad:
        return 'script_error', f'script error in the log although the exit code was 0 ({bad})'
    for o in outs:
        r = stale_output(o, start, root)
        if r:
            return r
    return 'ok', ''


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    c = sp.add_parser('check'); c.add_argument('--log', required=True); c.add_argument('--start', type=float)
    c.add_argument('--out', action='append', default=[]); c.add_argument('--root', default='.')
    o = sp.add_parser('outs'); o.add_argument('args', nargs=argparse.REMAINDER)
    a = ap.parse_args(argv)
    if a.cmd == 'outs':
        args = a.args[1:] if a.args and a.args[0] == '--' else a.args
        print('\n'.join(script_outs(args)))
        return 0
    st, why = verdict(a.log, a.out, a.start, a.root)
    if st == 'ok':
        return 0
    print(f'EDEN_TRUTH={st} {why}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
