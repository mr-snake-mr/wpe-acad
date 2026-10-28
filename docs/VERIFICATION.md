# How to verify this without AutoCAD

There is no AutoCAD on the build machine and none can be installed, so the project is split so that **everything except
the AutoCAD shell runs and is tested outside CAD**. Nothing here claims the shell has been executed — it has not.

```
     INSERTs in the open DWG          drawing list (layer,x,y,w,h,label)
              │                                   ▲
              ▼                                   │
        measured block list ──►  ENGINE  ─────────┘
        (name,x,y,w,h)            │
                                  ├── verified here, today (levels 0–2)
                                  └── AutoCAD shell: verified only by the client (level 3)
```

No drawing file is read or written at any point — not on this machine, not on the CAD machine.

## Level 0 — the engine, already proven

`node tests/cli-test.js` — a second, and `node tests/fixture-test.js` — a third. Each prints one line per assertion.

| Assertion | Evidence |
|---|---|
| Reads a measured block list and classifies it | 3 robots, 1 + 1 machines, 2 fixtures, 3 + 1 trolleys found |
| Uses the drawing's sizes, per instance | 11 footprints measured; a 10 m and a 1 m machine keep `1200x10000` and `1000x1000` |
| Plans from a line rate | 60 JPH → 3 robots, derived, not entered |
| All eight rules pass | `8/8`, each rule row prints its measured minimum |
| Search is real | 34 arrangements evaluated |
| Writes a usable drawing list | 19 shapes across `WPE-PLAN`, `WPE-FENCE`, `WPE-WALK` |
| Fails honestly | a 14 × 9 m hall exits 1 instead of drawing an impossible layout |
| Refuses nonsense input | a measurement larger than the hall is reported, and the catalogue is used |

## Level 1 — the drawing list is sound geometry

`tests/csv-check.js` re-reads the output the AutoCAD side consumes and re-measures it independently of the planner:

- every shape lies inside the hall outline;
- no two equipment footprints overlap;
- every layer name is one of `WPE-HALL`, `WPE-WALK`, `WPE-FENCE`, `WPE-PLAN`;
- no zero-size shape, exactly one hall outline, fences and both walkway rings present.

This is the closest thing to "does CAD accept it" without CAD: it checks the same numbers the LISP will hand to
`entmake`, from the outside.

## Level 2 — the shell is small and reviewable

`python tests/lisp-check.py` — balanced parentheses outside strings and comments, 23 defuns, 14 `wpe:` calls, no call to
an undefined function.

`lisp/WPE.lsp` does five things: measure the hall, measure and export the blocks, call the CLI, wait for the answer,
draw it with `entmake`. It contains no planning logic — if the plan is right or wrong, that is decided by code already
tested at levels 0–1.

## Level 3 — the only part the client must run (10 minutes)

1. Unzip, then run `node tests\cli-test.js` with the bundled `node\node.exe` — a failure here means an install problem,
   not a layout problem.
2. AutoCAD: `APPLOAD` → `lisp/WPE.lsp`.
3. At the command line: `(setq WPEDIR "C:/WPE")`.
4. `WPEDEMO`, then `WPEPLAN` — a throwaway 24 × 13 m drawing, no risk to real work.
5. Open a real drawing with named blocks and a closed polyline on `WPE-HALL`, then type `WPEPLAN`.
6. Expect: "Exported N block(s) with measured extents", then "Drew N shape(s) on the WPE-* layers".

If nothing comes back, the command prints the engine's own log, and `WPEDIAG` writes `wpe-diag.txt`. Send back the
command-window text, the saved DWG and that log: that is enough to either confirm the plugin or fix it.

## What still cannot be verified from here

- That `APPLOAD` accepts the file in their AutoCAD release.
- `startapp` timing on their machine (30 s timeout is generous; a cold Node start is about a second).
- Entity handling quirks: text height limits, layer state locks, annotative scale.
- Whether their blocks are proxy objects or live inside xrefs — a proxy with no extents falls back to the catalogue
  and says so in the log.
- Rotated inserts: the bounding box is axis-aligned, so a rotated block measures slightly large. Never small.

Those are exactly the failures the 10-minute script exposes, which is why it exists.

## What would change the picture

A licensed AutoCAD seat (or a QA slot) removes level 3 from their plate. Until then, the honest split is: **the layout
engine is verified; the CAD shell is reviewed, not executed.**
