"""Independently validates the DXF the CLI writes, using ezdxf as a CAD proxy.
Run: python tests/validate_output.py samples/plan.dxf
"""
import sys
from collections import Counter

import ezdxf

path = sys.argv[1] if len(sys.argv) > 1 else "samples/plan.dxf"
doc = ezdxf.readfile(path)
msp = doc.modelspace()

auditor = doc.audit()
layers = sorted(l.dxf.name for l in doc.layers)
kinds = Counter(e.dxftype() for e in msp)
from ezdxf.bbox import extents
bd = extents(msp)
ext = bd.extmax - bd.extmin
w, h = ext.x, ext.y

checks = []


def check(cond, msg):
    checks.append((bool(cond), msg))


check(doc.dxfversion == "AC1009", "DXF is R12 (AC1009): %s" % doc.dxfversion)
check(doc.header.get("$INSUNITS", 0) == 4, "units are millimetres")
check(all(k in layers for k in ("WPE-PLAN", "WPE-FENCE", "WPE-WALK")),
      "plan layers present: %s" % ", ".join(layers))
check(kinds.get("LINE", 0) > 40, "geometry written (%d lines, %d texts)" % (kinds.get("LINE", 0), kinds.get("TEXT", 0)))
check(22000 < w < 26000, "width ~24 m: %.0f mm" % w)
check(11000 < h < 15000, "depth ~13 m: %.0f mm" % h)
check(len(auditor.errors) == 0, "audit clean (%d errors, %d fixes)" % (len(auditor.errors), len(auditor.fixes)))

print(path)
print("  layers :", ", ".join(layers))
print("  entities:", dict(kinds))
print("  extents: %.0f x %.0f mm" % (w, h))
for ok, msg in checks:
    print("  %s %s" % ("PASS" if ok else "FAIL", msg))
bad = [m for ok, m in checks if not ok]
print("  result :", "OK" if not bad else "%d check(s) failed" % len(bad))
sys.exit(1 if bad else 0)
