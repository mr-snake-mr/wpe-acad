# WPE for AutoCAD

Layout optimiser that runs on a drawing: named blocks in, checked layout out.

This is a **separate project** from the web application — the web app is untouched. Here the engine is driven from
AutoCAD (or from the command line) and the result is drawn into the DWG.

```
drawing blocks ─► planner + 8-rule checker ─► layout on WPE-* layers
```

## DWG only — DXF is not part of the product

The runtime path never touches a file format:

```
open DWG → blocks read from the live database → temp CSV → engine → temp CSV → drawn back into the same DWG
```

No export, no conversion, no intermediate drawing. The plugin works on the drawing that is open.

DXF appears **only in `tests/`**, as a synthetic stand-in for "a drawing containing blocks", because the build machine
has no AutoCAD. It is a test fixture, not a dependency: nothing in `lisp/` or the planner reads one.

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

## Fixture suite — five drawings the plugin will meet

`npm test` runs both suites. Each fixture is a stand-in for a real drawing, and the assertion is about behaviour, not
just "it ran":

| Fixture | What it proves |
|---|---|
| `hall-24x13-with-machines` | The baseline: 3 robots, both machines, plans and passes 8/8 |
| `varied-machine-sizes` | A 4.2 × 2.6 m and a 1.8 × 1.4 m machine coexist, 4 robots, still 8/8 |
| `tight-hall` | A 14 × 9 m hall is **refused** (exit 1, `infeasible`) instead of drawing something impossible |
| `rotated-blocks` | Inserts rotated 90°/180° are detected and reported; footprints come from the catalogue |
| `units-metres` | A drawing in metres scales to 24 × 13 m correctly |
| `unrecognised-blocks` | Unnameable blocks fail loudly (exit 2) rather than planning an empty cell |

The line rate is exercised too: 30 JPH → "two robots suffice, three in the drawing", 60 JPH → no warning, 120 JPH →
"five needed". The inventory always comes from the drawing; JPH only judges whether it is enough.

## Inside AutoCAD

1. `APPLOAD` → `lisp/WPE.lsp`
2. `(setq WPEDIR "C:/path/to/WpeAcad")`
3. `WPEBLOCKS` first — read-only audit: writes `wpe-blocks.csv` next to the drawing, listing every block name and
   count, so the naming convention can be checked before planning anything.
4. `WPEPLAN` — plans and draws.

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
