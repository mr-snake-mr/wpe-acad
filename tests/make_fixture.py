"""Builds a sample DWG-equivalent DXF: a 24 x 13 m hall with named equipment blocks.
Run: python tests/make_fixture.py
"""
import pathlib

import ezdxf
from ezdxf import units

OUT = pathlib.Path(__file__).parent / "samples"
OUT.mkdir(parents=True, exist_ok=True)

doc = ezdxf.new("R2010")
doc.units = units.MM
msp = doc.modelspace()

# hall boundary, closed polyline on the reserved layer
msp.add_lwpolyline([(0, 0), (24000, 0), (24000, 13000), (0, 13000)],
                   close=True, dxfattribs={"layer": "WPE-HALL"})

BLOCKS = {
    "ROBOT-01": (800, 800),
    "ROBOT-02": (800, 800),
    "ROBOT-03": (800, 800),
    "MACHINE-1": (3200, 2200),
    "MACHINE-2": (2600, 2000),
    "LOAD-FIXTURE": (1400, 1000),
    "UNLOAD-FIXTURE": (1400, 1000),
    "TROLLEY-01": (1200, 800),
    "TROLLEY-02": (1200, 800),
    "TROLLEY-03": (1200, 800),
    "TROLLEY-T2-01": (1000, 800),
}

for name, (w, h) in BLOCKS.items():
    blk = doc.blocks.new(name=name)
    blk.add_lwpolyline([(0, 0), (w, 0), (w, h), (0, h)], close=True,
                       dxfattribs={"layer": "EQUIP"})

# rough starting positions, deliberately not the final answer
POSITIONS = {
    "ROBOT-01": (5000, 6000),
    "ROBOT-02": (6500, 6000),
    "ROBOT-03": (8000, 6000),
    "MACHINE-1": (11000, 6000),
    "MACHINE-2": (15000, 6000),
    "LOAD-FIXTURE": (2000, 6000),
    "UNLOAD-FIXTURE": (19000, 6000),
    "TROLLEY-01": (3000, 500),
    "TROLLEY-02": (5000, 500),
    "TROLLEY-03": (7000, 500),
    "TROLLEY-T2-01": (9000, 500),
}

for name, (x, y) in POSITIONS.items():
    msp.add_blockref(name, (x, y), dxfattribs={"layer": "EQUIP"})

path = OUT / "hall-24x13-with-machines.dxf"
doc.saveas(path)
print("wrote", path)
