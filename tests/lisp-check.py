"""Crude but useful LISP sanity check: balanced parens outside strings/comments,
plus a scan for calls to functions that are never defined in the file."""

import pathlib
import re

src = pathlib.Path(__file__).parent.parent / "lisp" / "WPE.lsp"
text = src.read_text(encoding="utf-8")

depth = 0
line = 1
in_string = False
in_comment = False
min_depth_line = 0
problems = []

i = 0
while i < len(text):
    ch = text[i]
    if ch == "\n":
        line += 1
        in_comment = False
        i += 1
        continue
    if in_comment:
        i += 1
        continue
    if in_string:
        if ch == "\\":
            i += 2
            continue
        if ch == '"':
            in_string = False
        i += 1
        continue
    if ch == ";":
        in_comment = True
        i += 1
        continue
    if ch == '"':
        in_string = True
        i += 1
        continue
    if ch == "(":
        depth += 1
    elif ch == ")":
        depth -= 1
        if depth < 0:
            problems.append("line %d: closing paren with nothing open" % line)
            depth = 0
    i += 1

print("final depth :", depth, "(0 = balanced)")
print("in string   :", in_string)
if depth != 0:
    problems.append("unbalanced parens, depth %d at end" % depth)

defined = set(m.group(1).lower() for m in re.finditer(r"\(defun\s+([^\s()]+)", text, re.I))
called = set(m.group(1).lower() for m in re.finditer(r"\((wpe:[a-z0-9\-]+)\s", text, re.I))
missing = sorted(c for c in called if c not in defined)
print("defuns      :", len(defined))
print("wpe: calls  :", len(called))
print("undefined   :", missing if missing else "none")

for p in problems:
    print("PROBLEM", p)
print("lisp check", "OK" if not problems and not missing else "FAILED")
