# 0.3.0 — DWG only, real machine sizes

Build date 2026-10-28. Supersedes 0.2.0, which is withdrawn.

## Interchange-format code removed from the project

0.2.0 still carried a drawing-file reader, a drawing-file writer and a set of drawing-file fixtures inherited from the
web app. Nothing in the AutoCAD path ever called them, but they were in the package and they implied a dependency that
does not exist. They are gone:

| Removed | Was |
|---|---|
| `engine/importer.js` | drawing-file parser |
| `engine/exporters.js` | drawing-file writer (plus JSON/PNG/report helpers) |
| `tests/make_fixture.py` | generator for the drawing-file fixtures |
| `tests/validate_output.py` | validated the written drawing file with an independent CAD library |
| `tests/samples/*` (drawing files) | six drawing-file fixtures |

No interchange-format reader or writer exists in this build. Nothing in the package references one.

The only thing the CAD side consumes is a flat drawing list — `layer,x,y,w,h,label` in millimetres, produced by
`lib/plan-csv.js` and drawn with `entmake`. No drawing file is read or written anywhere in this project.

## Machine sizes now come from the drawing

The plan used to lay out every machine at the catalogue size (3.2 × 2.2 m and 2.6 × 2.0 m), whatever was actually
drawn. A 10 m machine would have been planned as a 3.2 m one.

`WPEPLAN` now measures each INSERT with `vla-getboundingbox` and writes `name,x,y,w,h`; the engine keeps the sizes
**per instance**, so a 10 m machine and a 1 m machine of the same type keep their own footprints. The catalogue is a
fallback only, and a fallback is always reported:

```
  size note   : ROBOT-01: measured 999999 x 999999 mm is outside the hall — catalogue size used
```

Known limits: the measurement is the axis-aligned bounding box (a rotated block reads slightly large, never small), and
robots inside one fenced cell are placed around the largest robot because the cell has one size.

## Fixed in the AutoCAD shell (found by audit, before any CAD run)

- `(defvar …)` is not AutoLISP — it failed at load time. Replaced with a bound check.
- No unit conversion: a drawing in metres was planned as 24 mm. `wpe:scale` now converts both ways using `INSUNITS`.
- LWPOLYLINE was written as a list instead of 10/20 vertex pairs.
- `WPEDEMO` block definitions ignored the drawing's units while the inserts were scaled — the demo measured 3.2 km
  machines in a metre drawing.
- Demo inserts referenced a layer that was never created.
- `WPEDIAG` called two undefined helpers and ran `sslength` on a possibly nil selection.
- The CLI was launched through `cmd /c` quoting and timed out silently; it now prints the engine's own log on failure.

## Tests

Both suites were rewritten against the block list, which is what the plugin actually produces:

- `node tests/cli-test.js` — golden plan, drawing-list contract, infeasible hall.
- `node tests/fixture-test.js` — baseline, mixed 10 m / 1 m machines, tight hall, no extents, unrecognised blocks,
  line-rate lever, nonsense measurement.
- `tests/csv-check.js` — re-reads the drawing list as geometry: inside the hall, no overlaps, legal layers.
- `python tests/lisp-check.py` — parentheses and undefined-call check on the LISP.

## Still outstanding

The shell has not been executed inside AutoCAD. `docs/VERIFICATION.md` level 3 is the ten-minute script that settles
it.
