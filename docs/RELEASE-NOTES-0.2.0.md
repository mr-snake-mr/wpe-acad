## WPE for AutoCAD 0.2.0 — first handover build

Everything needed to try the tool on a machine with AutoCAD. No installation: `node.exe` is bundled.

### Start

1. Unzip to `C:\WPE`
2. `APPLOAD` → `C:\WPE\lisp\WPE.lsp`
3. `(setq WPEDIR "C:/WPE")`
4. `WPEDEMO` → `WPEPLAN`

Then on a real drawing: `WPEBLOCKS` (read-only audit) → `WPEPLAN`.

### Commands

| Command | What it does |
|---|---|
| `WPEPLAN` | Plan the open drawing, draw the result on `WPE-*` layers |
| `WPEBLOCKS` | List every block name and count → `wpe-blocks.csv` |
| `WPEDIAG` | Environment, units, inventory, node version → `wpe-diag.txt` |
| `WPEDEMO` | Build a 24 × 13 m test drawing |
| `WPEHELP` | List the commands |

### Verified in this build

- Engine and CLI: 14 assertions on a 24 × 13 m fixture, plus five fixtures (varied machine sizes, tight hall, rotated blocks, metres, unnamed blocks) — all pass from a clean unzip using the bundled node
- Output DXF re-read by an independent CAD library: R12, millimetres, `WPE-*` layers, clean audit
- LISP: paren balance and undefined-call check (static only)

### NOT verified

The LISP has not run inside AutoCAD. `APPLOAD`, `startapp` timing and `entmake` output are unproven. `WPEDIAG` and
`WPEPLAN`'s failure path exist so the first run produces evidence instead of silence.

### Fixed during the pre-handover audit

`defvar` (not AutoLISP) would have broken the load; units were not converted, so a metre drawing would have been planned
as 24 mm; LWPOLYLINE vertices used a non-DXF list form; demo inserts referenced a missing layer; `WPEDIAG` called two
undefined helpers; the wait loop hid the engine's error output.

### If it fails

Run `collect.ps1 -DrawingFolder <folder>` and send the zip, plus the AutoCAD command-window text (F2).
