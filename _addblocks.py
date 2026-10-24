import pathlib

p = pathlib.Path('lisp/WPE.lsp')
s = p.read_text(encoding='utf-8')

add = r'''
;; --------------------------------------------------------------- WPEBLOCKS
;; Audit only: lists every block name in the drawing and how often it occurs,
;; writes <drawing folder>\wpe-blocks.csv. Read-only: no planner, no DXF.
(defun c:WPEBLOCKS (/ ss i nm tbl path f)
  (setq ss (ssget "_X" '((0 . "INSERT"))))
  (if (not ss)
    (princ "\nNo blocks in model space.")
    (progn
      (setq i 0 tbl '())
      (while (< i (sslength ss))
        (setq nm (cdr (assoc 2 (entget (ssname ss i)))))
        (setq tbl (if (assoc nm tbl)
                    (subst (cons nm (1+ (cdr (assoc nm tbl)))) (assoc nm tbl) tbl)
                    (cons (cons nm 1) tbl)))
        (setq i (1+ i)))
      (setq path (strcat (getvar "DWGPREFIX") "wpe-blocks.csv"))
      (setq f (open path "w"))
      (write-line "block,count" f)
      (foreach k (acad_strlsort (mapcar 'car tbl))
        (write-line (strcat k "," (itoa (cdr (assoc k tbl)))) f))
      (close f)
      (princ (strcat "\n" (itoa (length tbl)) " distinct block names written to "))
      (princ path)))
  (princ))

'''

anchor = '(princ "\\nWPE loaded. Type WPEPLAN to generate a layout.")'
if anchor not in s:
    raise SystemExit('anchor not found')

s = s.replace(anchor, add + '(princ "\\nWPE loaded. WPEPLAN plans, WPEBLOCKS audits block names.")', 1)
p.write_text(s, encoding='utf-8')
print('WPEBLOCKS added')
