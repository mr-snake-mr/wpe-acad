# WPE for AutoCAD

Layout optimiser that runs on a drawing: named blocks in, checked layout out.

This is a **separate project** from the web application — the web app is untouched. Here the engine is driven from
AutoCAD (or from the command line) and the result is drawn into the DWG.

```
drawing blocks ─► planner + 8-rule checker ─► layout on WPE-* layers
```

## Quick start (no AutoCAD needed)

```bash
node cli/wpe-plan.js tests/samples/hall-24x13-with-machines.dxf --jph 60 --out samples/plan.dxf --csv samples/plan.csv
node tests/cli-test.js            # 14 assertions, ~1 s
python tests/validate_output.py samples/plan.dxf   # independent CAD parse
```

Output:

```
WPE plan — hall-24x13-with-machines.dxf
  hall        : 24.0 x 13.0 m
  found       : {"robots":3,"machine1":1,"machine2":1,"loadFixture":1,"unloadFixture":1,"trolley1":3,"trolley2":1}
  status      : ok   rules 8/8
  flow        : 14.36 m, 1 row(s), 50 m2 footprint
  candidates  : 34 in 142 ms
```

## Inside AutoCAD

1. `APPLOAD` → `lisp/WPE.lsp`
2. `(setq WPEDIR "C:/path/to/WpeAcad")`
3. `WPEPLAN`

The command exports every INSERT, calls the CLI, and draws the returned plan with `entmake` — no compilation, no .NET,
no admin rights. `docs/VERIFICATION.md` explains what that means for trust.

## Naming

Blocks are identified by name. Anything containing `robot`, `machine 1/2`, `press`, `trolley`, `load`/`unload`,
`controller` is classified; everything else is reported as unrecognised rather than guessed. Hall boundary: one closed
polyline on layer `WPE-HALL`.

Output layers: `WPE-HALL`, `WPE-PLAN`, `WPE-FENCE`, `WPE-WALK`, `WPE-FLOW`, `WPE-TEXT`.

## What is verified, and what is not

| Part | Status |
|---|---|
| Engine (planning + 8 rules) | Tested here — `tests/cli-test.js`, 14 assertions |
| DXF read/write | Tested here — real DXF in, output audited by ezdxf |
| LISP front end | **Not executed** — reviewed only; needs one AutoCAD run (10 min, see verification doc) |

## Layout

```
engine/    planner, checker, geometry, DXF read/write (copied from the web app, unmodified logic)
lib/       mapper: block name → resource role
cli/       headless planner (DXF or block list in, DXF/CSV out)
lisp/      WPE.lsp — AutoCAD command
tests/     fixture generator, golden test, DXF validator
docs/      VERIFICATION.md
```
