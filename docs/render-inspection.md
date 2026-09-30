Status: optional (R2 T4, 2026-10-01). Agents without MCP skip this file; nothing in the pipeline depends on it.

# Live scene inspection with the Blender MCP connector

Blender's official connector (Blender Lab, needs Blender ≥ 5.1) exposes a running **GUI** Blender to any MCP-capable
agent. Use it in a review / fix round when a defect is easier to understand by asking the scene than by re-reading
`build.py`: which object owns a stray face, what material a mesh carries, where a camera really points, bounding
boxes, instance counts. Install and enable the connector following its own documentation; this page only covers how it
coexists with the render queue.

## What it is for, and what it is not

- Inspect: object / collection names, transforms, bounding boxes, material assignments, modifiers, camera data, light
  data, statistics. Read-only queries are always fine.
- **Do not fix in the GUI scene.** A landmark scene is the output of `blender/landmarks/<id>/build.py`; anything edited
  by hand is lost on the next build. Use what you learned to edit the build script, then re-render (draft / clay / study).
- Never save over a shipped `.blend`, a cache in `.cache/blend`, or anything under `blender/data/`. Open a copy.
- Do not start renders from the GUI (and never switch Cycles to GPU compute there): renders go through the queue.

## The GPU lock and a GUI session

`tools/blender_run.sh` refuses to start while any process named `Blender` runs (`pgrep -x Blender`), then takes the
lock file `/tmp/eden_gpu.lock` for the length of the run. A GUI Blender does not take the lock, but its process name trips
the `pgrep` wait: with the GUI open, queued jobs sit idle (up to `WAIT_MAX`, default 2 h, then exit 3 and retry). The
reverse also matters: opening the GUI while a job runs puts the viewport and the render on the same GPU. So the
session must be fenced by the queue, not by luck:

1. `bash tools/render_queue.sh pause` — new dispatches stop; jobs already running finish normally.
2. `bash tools/render_queue.sh status` — wait until `running: 0` (the status also prints `dispatch: PAUSED`). Do not open
   the GUI while a job is running, and never kill a running job's Blender to make room.
3. Produce the scene you want to look at: rebuild it to a `.blend` with the landmark's `--blend <path>` argument into a
   scratch directory, or open the `.blend` a previous run saved.
4. Open it in GUI Blender with the connector enabled and inspect. Keep the viewport in Solid or Material Preview.
5. Quit Blender, then `bash tools/render_queue.sh resume`. A forgotten pause leaves the queue stalled on purpose:
   `status` shows it, so check after every session.

`pause` only affects a dispatcher that runs the current `tools/render_queue.sh`; after that file changes, restart the
dispatcher (`bash tools/install_renderqueue_agent.sh`) when no job is running.

If you never reach step 5 (session ends early), run `resume` yourself before handing back; a paused queue is a
handoff defect.
