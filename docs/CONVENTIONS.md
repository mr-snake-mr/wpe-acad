# Names the plugin recognises

No new naming scheme is imposed. Block names are read exactly as they appear in the drawing, and matched against a
small set of patterns. The table below was produced by running the classifier on those names — it is the actual
behaviour, not an intention.

## How a name is read

1. Lower-cased.
2. `_` `-` `.` `/` become spaces, runs of spaces collapse. So `WPE-DEMO-MACHINE-2`, `wpe_demo_machine_2` and
   `WPE DEMO MACHINE 2` are the same string.
3. The first matching pattern wins — **order matters**, it is not a prefix match.

## Patterns, in the order they are tested

| # | Contains any of | Role |
|---|---|---|
| 1 | `robot`, `rbt`, `manipulator` | robot |
| 2 | `controller`, `cabinet`, `control panel` | controller (informational — not placed) |
| 3 | `trolley`, `cart`, `stillage`, `bin` | trolley 1, or trolley 2 if the name has a standalone `2` or `t2` |
| 4 | `unload`, `outfeed`, `exit` | unload fixture |
| 5 | `load`, `infeed`, `entry` | load fixture |
| 6 | `machine`, `press`, `cnc`, `mill`, `mach` | machine 1, or machine 2 if the name has a standalone `2` or `m2` |

## Verified examples

| Block name | Read as |
|---|---|
| `ROBOT-01`, `WELD-ROBOT`, `RBT_2`, `MANIPULATOR-A` | robot |
| `MACHINE-1`, `PRESS-01`, `CNC-01` | machine 1 |
| `MACHINE-2`, `MACHINE_2`, `PRESS-2` | machine 2 |
| `TROLLEY-01`, `TROLLEY-02`, `CART-1`, `STILLAGE-3`, `BIN-01` | trolley 1 |
| `TROLLEY-2`, `TROLLEY-T2-01` | trolley 2 |
| `LOAD-FIXTURE`, `INFEED`, `ENTRY-STATION` | load fixture |
| `UNLOAD-FIXTURE`, `OUTFEED` | unload fixture |
| `CONTROLLER-01`, `CABINET-1` | controller |
| `M1`, `M2`, `ROBOT-01-A`*, `STATION-7` | **not recognised** |

*Anything with no keyword is ignored, and reported.*

## Traps to know about

| Name | Reads as | Why |
|---|---|---|
| `ROBOT-CONTROLLER` | robot | rule 1 is tested before rule 2 |
| `CABINET-1` | controller | rule 2 fires before `bin` in rule 3 |
| `CARTON-3` | trolley 1 | contains `cart` |
| `GENTRY` | load fixture | contains `entry` |
| `TROLLEY-02` | trolley 1 | `02` is not a standalone `2` |

If any of those words appear in a block name for another reason, use an alias instead of relying on the patterns.

## Aliases — the exact-name escape hatch

`lib/aliases.json` is checked **before** the patterns, keyed on the exact block name (case-insensitive):

```json
{
  "M1-BODY": "machine1",
  "M2-BODY": "machine2",
  "WELD-CELL-A": "robot"
}
```

Roles: `robot`, `machine1`, `machine2`, `fixture_load`, `fixture_unload`, `trolley1`, `trolley2`, `controller`.
Anything beginning with `_` is treated as a comment. No restart of AutoCAD is needed — the file is read on every
`WPEPLAN`.

## Drawing-side conventions

| Item | Requirement |
|---|---|
| Hall boundary | closed polyline on layer `WPE-HALL`. Missing → the command asks for two corners |
| Equipment | blocks (`INSERT`) anywhere in model space; exploded linework cannot be planned |
| Units | read from `INSUNITS`; inches, feet, mm, cm and m are converted to mm and back |
| Output layers | `WPE-PLAN`, `WPE-FENCE`, `WPE-WALK`, `WPE-FLOW`, `WPE-TEXT`, created automatically |
| Block names | must obey AutoCAD's own rules — no `< > / \ " : ; ? * | , =` |

## What happens to a block that is not recognised

It is skipped, listed in the console (`ignored: 3 block(s) — …`) and in the JSON summary. It is never guessed at. If no
robot is recognised at all, the run stops with exit code 2 and says so.
