# Running it on a CAD machine

Everything below has been prepared but **not executed inside AutoCAD** by the author. This page exists so the first
run produces a verdict and, if it fails, produces enough evidence to fix it without guesswork.

## Before you start

| Requirement | Note |
|---|---|
| AutoCAD, full version | **LT cannot load LISP tools reliably** — check `ACADVER` via `WPEDIAG` |
| Windows | the bundled `node.exe` is Windows x64 |
| Write access | `WPEDIAG` / `WPEBLOCKS` write next to the drawing; use a folder you own |
| Nothing installed | Node is bundled; no admin rights needed |

## The four commands

```
APPLOAD  → C:\WPE\lisp\WPE.lsp
(setq WPEDIR "C:/WPE")
WPEDEMO       ; throwaway drawing, safe
WPEPLAN       ; plan + draw
```

Then on the real drawing: `WPEBLOCKS` (audit, no changes) → `WPEPLAN`.

## What a good run looks like

```
Command: WPEPLAN
Drawing units scale: x1.000 mm per unit
Exported 10 block(s).
Planning…
Drew 24 shape(s) on the WPE-* layers.
  WPE plan — 12345.csv
  hall        : 24.0 x 13.0 m
  recognised  : 3 robots, 1 machine1, 1 machine2, 2 fixtures, 3 trolleys
  status      : ok   rules 8/8
  flow        : 14.36 m, 1 row(s), 50 m2 footprint
  candidates  : 34 in 41 ms
  ok   R0 …
If a rule failed it is listed above. One UNDO removes the plan.
```

The exact numbers depend on the drawing. What matters: a `status` line, a `rules` line, and shapes on `WPE-*` layers.

## When it does not work

| Symptom | Cause | Fix |
|---|---|---|
| `Unknown command "WPEPLAN"` | file not loaded | `APPLOAD` again; check the load message in the command window |
| `APPLOAD` refuses / security warning | untrusted folder | Options → Files → Trusted Locations → add `C:\WPE` |
| `Aborted: no folder set` | `WPEDIR` empty or wrong | `(setq WPEDIR "C:/WPE")`, check `cli/wpe-plan.js` exists there |
| `Aborted: no blocks in model space` | drawing has no INSERTs | blocks are required; exploded linework cannot be planned |
| `No plan came back within 30 s` | node blocked or crashed | the console shows the engine log; also check `WPEDIAG` → `nodever` |
| Everything 1000× too big/small | drawing units not set | `WPEDIAG` → `insunits`, `mm_per_unit`; fix `INSUNITS` or tell us |
| Layer `WPE-HALL` missing | no boundary polyline | either draw one, or let `WPEPLAN` prompt for two corners |

## What to send back

1. `wpe-diag.txt` (from `WPEDIAG`) — version, units, inventory, node
2. `wpe-blocks.csv` (from `WPEBLOCKS`) — the exact names in the drawing
3. The command-window text (F2, select all, copy)
4. If it drew something: a copy of the DWG, or a screenshot

With those four, any failure can be reproduced here against a fixture and fixed without another round trip.

## What we already know is untested

- `APPLOAD` accepting the file
- `startapp` launching the bundled node and the 30 s wait
- `entmake` output appearing where expected
- LISP reading the plan CSV with the drawing's locale (decimal comma locales could matter — worth a look if numbers
  come back wrong)
