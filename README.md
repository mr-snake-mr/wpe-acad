# WPE for AutoCAD

Layout optimiser that runs on a drawing: named blocks in, checked layout out.

This is a **separate project** from the web application — the web app is untouched. Here the engine is driven from
AutoCAD (or from the command line) and the result is drawn into the DWG.

```
blocks in the open DWG ─► planner + 8-rule checker ─► shapes on WPE-* layers in the same DWG
```

## DWG only — no interchange format

Nothing here reads, writes or converts a drawing file. There is no importer, no exporter, no converter and no fixture
in any other format: the plugin works on the drawing that is open, and nothing else.

The runtime path never touches a file format:

```
open DWG → INSERTs read from the live drawing (name + measured extents)
         → temp CSV → engine → temp CSV → entmake back into the same DWG
```

Nothing is exported or converted. The plugin works on the drawing that is open, and one `UNDO` removes everything it
drew.

## The plan uses your real machine sizes

`WPEPLAN` measures the extents of every INSERT (`vla-getboundingbox`) and passes them to the engine. The catalogue in
`engine/config.js` is only a fallback for blocks whose extents cannot be read.

Sizes are kept **per instance**, not per type. A 10 m machine and a 1 m machine of the same type keep their own
footprints in the plan; they are not averaged and not replaced by a default:

```
$ node cli/wpe-plan.js --blocks tests/samples/mixed-machine-sizes.csv --hall 30000x15000
  sizes       : 9 measured from the drawing
                machine1: 10.00 x 1.20 m
                machine2: 1.00 x 1.00 m
```

A block with no geometry, or a measurement larger than the hall itself, is reported and falls back to the catalogue
instead of being trusted:

```
  size note   : ROBOT-01: measured 999999 x 999999 mm is outside the hall — catalogue size used
```

Two limits, stated plainly: the measurement is the axis-aligned bounding box, so a rotated block reads slightly large
(never small); and robots sharing one fenced cell are placed around the largest measured robot, because the cell has a
single size.

## Handover package

`build-package.ps1` produces `dist/wpe-acad-<version>.zip` — the artefact to put on the CAD machine. It contains the
LISP, the engine, the tests, a bundled `node.exe` and `START-HERE.txt`, so nothing needs installing.

On that machine:

1. `APPLOAD` to `lisp/WPE.lsp`
2. `(setq WPEDIR "C:/WPE")`
3. `WPEDIAG`, then `WPEBLOCKS`, then `WPEPLAN`
4. If anything fails, `collect.ps1 -DrawingFolder <path>` gathers the diagnostics into one zip to send back

Runbook: [docs/RUN-ON-CAD.md](docs/RUN-ON-CAD.md) — Names: [docs/CONVENTIONS.md](docs/CONVENTIONS.md)

## Quick start (no AutoCAD needed)

The engine is the same code the CAD side calls, so it runs from a terminal against a block list shaped exactly like
the one `WPEPLAN` writes — `name,x,y,w,h` in millimetres:

```bash
node cli/wpe-plan.js --blocks tests/samples/baseline-24x13.csv --hall 24000x13000 --csv plan.csv
node tests/cli-test.js            # golden test + CSV contract
node tests/fixture-test.js        # six scenarios, behaviour asserted
```

Output:

```
WPE plan
  hall        : 24.0 x 13.0 m
  recognised  : 3 robots, 1 machine1, 1 machine2, 2 fixtures, 4 trolleys
  sizes       : 11 measured from the drawing
  status      : ok   rules 8/8
  flow        : 14.36 m, 1 row(s), 50 m2 footprint
  candidates  : 34 in 66 ms
```

Exit codes: `0` compliant, `1` does not fit or a rule fails, `2` bad input.

## Fixture suite — what the plugin will meet

| Fixture | What it proves |
|---|---|
| `baseline-24x13` | The baseline: 3 robots, both machines, plans and passes 8/8 |
| `mixed-machine-sizes` | A 10 m and a 1 m machine keep their own footprints |
| `tight-hall` | A 14 × 9 m hall is **refused** (exit 1, `infeasible`) instead of drawing something impossible |
| `no-extents` | A block list without extents falls back to the catalogue and says so |
| `unrecognised-blocks` | Unnameable blocks fail loudly (exit 2) rather than planning an empty cell |
| `blocks` (names only) | The old two-column format still plans |

The line rate is exercised too: 30 JPH → "two robots suffice, three in the drawing", 60 JPH → no warning, 120 JPH →
"five needed". The inventory always comes from the drawing; JPH only judges whether it is enough.

## Inside AutoCAD

1. `APPLOAD` → `lisp/WPE.lsp`
2. `(setq WPEDIR "C:/path/to/WpeAcad")`
3. `WPEBLOCKS` first — read-only audit: writes `wpe-blocks.csv` next to the drawing, listing every block name and
   count, so the naming convention can be checked before planning anything.
4. `WPEPLAN` — plans and draws.

The command measures every INSERT, calls the CLI, and draws the returned plan with `entmake` — no compilation, no .NET,
no admin rights. `docs/VERIFICATION.md` explains what that means for trust.

## Naming

Blocks are identified by name. Anything containing `robot`, `machine 1/2`, `press`, `trolley`, `load`/`unload`,
`controller` is classified; everything else is reported as unrecognised rather than guessed. Hall boundary: one closed
polyline on layer `WPE-HALL`.

Output layers: `WPE-HALL`, `WPE-PLAN`, `WPE-FENCE`, `WPE-WALK`, `WPE-FLOW`, `WPE-TEXT`.

## What is verified, and what is not

| Part | Status |
|---|---|
| Engine (planning + 8 rules) | Tested here — `tests/cli-test.js`, `tests/fixture-test.js` |
| Plan output | Tested here — the CSV is re-checked as geometry: inside the hall, no overlaps, legal layers |
| LISP front end | **Not executed** — reviewed and statically checked; needs one AutoCAD run (10 min, see verification doc) |

## Layout

```
engine/    planner, checker, geometry, config (copied from the web app, unmodified logic)
lib/       mapper (block name → role), plan-csv (the drawing list the LISP consumes)
cli/       headless planner: block list in, drawing list out
lisp/      WPE.lsp — AutoCAD commands
tests/     golden test, fixture suite, plan-CSV checker, LISP static check
docs/      VERIFICATION.md, RUN-ON-CAD.md, CONVENTIONS.md
```
