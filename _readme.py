import pathlib

p = pathlib.Path('README.md')
s = p.read_text(encoding='utf-8')
anchor = "## Quick start (no AutoCAD needed)"
add = """## Handover package

`build-package.ps1` produces `dist/wpe-acad-<version>.zip` - the artefact to put on the CAD machine. It contains the
LISP, the engine, the tests, a bundled `node.exe` and `START-HERE.txt`, so nothing needs installing.

On that machine:

1. `APPLOAD` to `lisp/WPE.lsp`
2. `(setq WPEDIR "C:/WPE")`
3. `WPEDIAG`, then `WPEBLOCKS`, then `WPEPLAN`
4. If anything fails, `collect.ps1 -DrawingFolder <path>` gathers the diagnostics into one zip to send back

Runbook: [docs/RUN-ON-CAD.md](docs/RUN-ON-CAD.md) - Names: [docs/CONVENTIONS.md](docs/CONVENTIONS.md)

"""
if "Handover package" not in s:
    s = s.replace(anchor, add + anchor, 1)
    p.write_text(s, encoding='utf-8')
    print("readme updated")
else:
    print("already there")
