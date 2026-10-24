# How to verify this without AutoCAD

There is no AutoCAD on the build machine and none can be installed, so the project is split so that **everything except
the AutoCAD shell runs and is tested outside CAD**. Nothing here claims the shell has been executed — it has not.

```
        DXF / block list                 plan + report
drawing ───────────────►  ENGINE  ─────────────────────►  DXF / CSV
                            │
                            ├── verified here, today (levels 0–2)
                            └── AutoCAD shell: verified only by the client (level 3)
```

## Level 0 — the engine, already proven

`node tests/cli-test.js` — 14 assertions, runs in about a second:

| Assertion | Evidence |
|---|---|
| Reads real DXF blocks and classifies them | 3 robots, 1 + 1 machines, 2 fixtures, 3 + 1 trolleys found |
| Plans from a line rate | 60 JPH → 3 robots, derived, not entered |
| All eight rules pass | `8/8`, each rule row prints its measured minimum |
| Search is real | 34 arrangements evaluated |
| Writes a usable drawing | 19 shapes across `WPE-PLAN`, `WPE-FENCE`, `WPE-WALK` |
| Fails honestly | a 9 × 7 m hall exits 1 instead of drawing an impossible layout |

## Level 1 — the drawing it writes is valid CAD

`python tests/validate_output.py samples/plan.dxf` — parses the output with **ezdxf**, an independent CAD library:

```
DXF is R12 (AC1009)        PASS
units are millimetres       PASS
plan layers present         PASS   WPE-HALL WPE-WALK WPE-FENCE WPE-PLAN WPE-FLOW WPE-TEXT
geometry written            PASS   81 lines, 18 texts
width ~24 m / depth ~13 m   PASS   24000 x 14160 mm
audit clean                 PASS   0 errors, 0 fixes
```

This is the closest thing to "does CAD accept it" without CAD: a separate implementation reads the file, finds the
layers, resolves the extents and audits every entity.

## Level 2 — the shell is small and reviewable

`lisp/WPE.lsp` is 140 lines and does only four things: export blocks, call the CLI, wait, draw the returned CSV with
`entmake`. It contains no planning logic — if the plan is right or wrong, that is decided by code already tested at
levels 0–1. Review it in twenty minutes; there is nothing hidden in it.

## Level 3 — the only part the client must run (10 minutes)

1. Copy the folder, run `npm test` once (or just `node tests/cli-test.js`) — a failure here means an install problem,
   not a layout problem.
2. AutoCAD: `APPLOAD` → `lisp/WPE.lsp`.
3. At the command line: `(setq WPEDIR "C:/path/to/WpeAcad")`.
4. Open a drawing containing named blocks and a closed polyline on `WPE-HALL`. Type `WPEPLAN`.
5. Expect: a message that N blocks were exported, then "Drew N shapes on the WPE-* layers".
6. If nothing comes back, the command prints the exact CLI line to run by hand — that line reproduces the whole
   calculation outside CAD.

Send back three things and the plugin is verified or falsified: the text in the command window, the saved DWG, and the
`plan.csv` from the temp folder.

## What still cannot be verified from here

- That `APPLOAD`/`netload` accepts the file in their AutoCAD release.
- Palette/UI behaviour (there is no palette in this version — command line only).
- `startapp` timing on their machine (30 s timeout is generous; a cold Node start is ~1 s).
- Entity handling quirks: text height limits, layer state locks, annotative scale.
- Whether their blocks are proxy objects or live inside xrefs.

Those are exactly the failures the 10-minute script exposes, which is why it exists.

## What would change the picture

A licensed AutoCAD seat (or a QA slot) removes level 3 from their plate. Until then, the honest split is: **the layout
engine is verified; the CAD shell is reviewed, not executed.**
