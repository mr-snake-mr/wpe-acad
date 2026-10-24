"""Builds the synthetic fixture set: DWG-equivalent DXFs with named blocks.

Each file stands in for a drawing the plugin would meet in the wild. They exist
because the build machine has no AutoCAD; nothing in the plugin reads DXF.

Run: python tests/make_fixture.py
"""
import pathlib

import ezdxf
from ezdxf import units

OUT = pathlib.Path(__file__).parent / "samples"
OUT.mkdir(parents=True, exist_ok=True)

BLOCK_SIZES = {
    "ROBOT-01": (800, 800),
    "ROBOT-02": (800, 800),
    "ROBOT-03": (800, 800),
    "ROBOT-04": (800, 800),
    "ROBOT-05": (800, 800),
    "MACHINE-1": (3200, 2200),
    "MACHINE-2": (2600, 2000),
    "MACHINE-1-BIG": (4200, 2600),
    "MACHINE-2-SMALL": (1800, 1400),
    "LOAD-FIXTURE": (1400, 1000),
    "UNLOAD-FIXTURE": (1400, 1000),
    "TROLLEY-01": (1200, 800),
    "TROLLEY-02": (1200, 800),
    "TROLLEY-03": (1200, 800),
    "TROLLEY-04": (1200, 800),
    "TROLLEY-05": (1200, 800),
    "TROLLEY-T2-01": (1000, 800),
    "WELD-CELL-01": (900, 900),
}


def build(filename, hall, placements, unit=units.MM, hall_layer="WPE-HALL", scale=1.0):
    doc = ezdxf.new("R2010")
    doc.units = unit
    msp = doc.modelspace()

    w, h = hall
    msp.add_lwpolyline([(0, 0), (w, 0), (w, h), (0, h)],
                       close=True, dxfattribs={"layer": hall_layer})

    for name in {p[0] for p in placements}:
        bw, bh = BLOCK_SIZES[name]
        blk = doc.blocks.new(name=name)
        blk.add_lwpolyline([(0, 0), (bw, 0), (bw, bh), (0, bh)], close=True,
                           dxfattribs={"layer": "EQUIP"})

    for name, x, y, *rot in placements:
        attribs = {"layer": "EQUIP"}
        if rot:
            attribs["rotation"] = rot[0]
        msp.add_blockref(name, (x * scale, y * scale), dxfattribs=attribs)

    path = OUT / filename
    doc.saveas(path)
    return path


# 1. the baseline: 24 x 13 m, 3 robots, both machines, 8 trolleys
build(
    "hall-24x13-with-machines.dxf",
    (24000, 13000),
    [
        ("ROBOT-01", 5000, 6000), ("ROBOT-02", 6500, 6000), ("ROBOT-03", 8000, 6000),
        ("MACHINE-1", 11000, 6000), ("MACHINE-2", 15000, 6000),
        ("LOAD-FIXTURE", 2000, 6000), ("UNLOAD-FIXTURE", 19000, 6000),
        ("TROLLEY-01", 3000, 500), ("TROLLEY-02", 5000, 500), ("TROLLEY-03", 7000, 500),
        ("TROLLEY-T2-01", 9000, 500),
    ],
)

# 2. very different machine sizes, 4 robots
build(
    "varied-machine-sizes.dxf",
    (28000, 15000),
    [
        ("ROBOT-01", 5000, 7000), ("ROBOT-02", 6000, 7000),
        ("ROBOT-03", 14000, 7000), ("ROBOT-04", 15000, 7000),
        ("MACHINE-1-BIG", 10000, 7000), ("MACHINE-2-SMALL", 19000, 7000),
        ("LOAD-FIXTURE", 2000, 7000), ("UNLOAD-FIXTURE", 23000, 7000),
        ("TROLLEY-01", 4000, 500), ("TROLLEY-02", 6000, 500),
        ("TROLLEY-03", 8000, 500), ("TROLLEY-T2-01", 10000, 500),
    ],
)

# 3. far too small for the line: must be refused, not fudged
build(
    "tight-hall.dxf",
    (14000, 9000),
    [
        ("ROBOT-01", 4000, 4500), ("ROBOT-02", 5000, 4500), ("ROBOT-03", 6000, 4500),
        ("MACHINE-1", 8000, 4500), ("MACHINE-2", 9000, 4500),
        ("LOAD-FIXTURE", 1000, 4500), ("UNLOAD-FIXTURE", 12000, 4500),
        ("TROLLEY-01", 3000, 500), ("TROLLEY-02", 5000, 500),
    ],
)

# 4. blocks rotated 90 degrees on the way in
build(
    "rotated-blocks.dxf",
    (24000, 13000),
    [
        ("ROBOT-01", 5000, 6000, 90), ("ROBOT-02", 6500, 6000, 90), ("ROBOT-03", 8000, 6000, 90),
        ("MACHINE-1", 11000, 6000, 90), ("MACHINE-2", 15000, 6000, 90),
        ("LOAD-FIXTURE", 2000, 6000, 90), ("UNLOAD-FIXTURE", 19000, 6000, 90),
        ("TROLLEY-01", 3000, 500, 180), ("TROLLEY-02", 5000, 500, 180),
    ],
)

# 5. drawing in metres rather than millimetres
build(
    "units-metres.dxf",
    (24, 13),
    [
        ("ROBOT-01", 5.0, 6.0), ("ROBOT-02", 6.5, 6.0), ("ROBOT-03", 8.0, 6.0),
        ("MACHINE-1", 11.0, 6.0), ("MACHINE-2", 15.0, 6.0),
        ("LOAD-FIXTURE", 2.0, 6.0), ("UNLOAD-FIXTURE", 19.0, 6.0),
        ("TROLLEY-01", 3.0, 0.5), ("TROLLEY-02", 5.0, 0.5),
    ],
    unit=units.M,
)

# 6. nothing recognisable: plain blocks the mapper cannot name
build(
    "unrecognised-blocks.dxf",
    (24000, 13000),
    [("WELD-CELL-01", 5000, 6000), ("WELD-CELL-01", 8000, 6000)],
    hall_layer="0",
)

print("fixtures written to", OUT)
for p in sorted(OUT.glob("*.dxf")):
    print("  ", p.name, p.stat().st_size, "bytes")
