;;; ==========================================================================
;;; WPE.lsp — AutoCAD front end for the WPE layout engine
;;;
;;; Command: WPEPLAN
;;;   1. reads the hall boundary (closed polyline on layer WPE-HALL, or two
;;;      picked corners)
;;;   2. exports every INSERT in model space to CSV
;;;   3. runs the Node planner on it (the same engine as the web app)
;;;   4. draws the returned plan on WPE-* layers, inside one UNDO mark
;;;
;;; Requires: node.exe on PATH; this file's folder must contain cli\wpe-plan.js
;;; Set the folder once per session:  (setq WPEDIR "C:/work/WpeAcad")
;;;
;;; STATUS: not executed inside AutoCAD by the author — see docs/VERIFICATION.md
;;; ==========================================================================

(vl-load-com)

;; ------------------------------------------------------------------ utilities
(defun wpe:dir (/ d)
  (if (and (boundp 'WPEDIR) WPEDIR (findfile (strcat WPEDIR "/cli/wpe-plan.js")))
    WPEDIR
    (progn
      (setq d (getstring T "\nPath to the WpeAcad folder (contains cli/wpe-plan.js): "))
      (setq WPEDIR d)
      d)))

(defun wpe:temp (tag ext)
  (strcat (vl-filename-mktemp (strcat "wpe-" tag)) ext))

(defun wpe:split (s / out i c token)
  (setq out '() token "" i 1)
  (while (<= i (strlen s))
    (setq c (substr s i 1))
    (if (= c ",")
      (setq out (cons token out) token "")
      (setq token (strcat token c)))
    (setq i (1+ i)))
  (reverse (cons token out)))

(defun wpe:layer (name color)
  (if (not (tblsearch "LAYER" name))
    (entmake (list '(0 . "LAYER") (cons 2 name) '(70 . 0)
                   (cons 62 color) '(6 . "CONTINUOUS")))))

;; ------------------------------------------------------------- export blocks
(defun wpe:write-blocks (file / ss i e ed nm pt f)
  (setq ss (ssget "_X" '((0 . "INSERT"))))
  (if (not ss)
    nil
    (progn
      (setq f (open file "w"))
      (write-line "name,x,y" f)
      (setq i 0)
      (while (< i (sslength ss))
        (setq e  (ssname ss i)
              ed (entget e)
              nm (cdr (assoc 2 ed))
              pt (trans (cdr (assoc 10 ed)) e 1))
        (write-line (strcat nm "," (rtos (car pt) 2 1) "," (rtos (cadr pt) 2 1)) f)
        (setq i (1+ i)))
      (close f)
      (princ (strcat "\nExported " (itoa (sslength ss)) " blocks."))
      T)))

;; ------------------------------------------------------------------ hall size
(defun wpe:hall (/ ss mn mx lo hi)
  (setq ss (ssget "_X" '((0 . "LWPOLYLINE") (8 . "WPE-HALL"))))
  (if ss
    (progn
      (vla-getboundingbox (vlax-ename->vla-object (ssname ss 0)) 'mn 'mx)
      (setq lo (vlax-safearray->list mn) hi (vlax-safearray->list mx))
      (list (abs (- (car hi) (car lo))) (abs (- (cadr hi) (cadr lo)))))
    (progn
      (princ "\nNo closed polyline on layer WPE-HALL — pick the two corners.")
      (setq lo (getpoint "\nFirst corner: "))
      (setq hi (getcorner lo "\nOpposite corner: "))
      (list (abs (- (car hi) (car lo))) (abs (- (cadr hi) (cadr lo)))))))

;; ------------------------------------------------------------ wait for output
(defun wpe:wait (file ms / t0)
  (setq t0 (getvar "MILLISECS"))
  (while (and (not (findfile file)) (< (- (getvar "MILLISECS") t0) ms))
    (command "_.delay" 100))
  (findfile file))

;; -------------------------------------------------------------------- drawing
(defun wpe:rect (layer p1 p2 p3 p4)
  (entmake (list '(0 . "LWPOLYLINE") (cons 8 layer) '(90 . 4) '(70 . 1)
                 (cons 10 p1) (cons 10 p2) (cons 10 p3) (cons 10 p4))))

(defun wpe:label (layer pt txt)
  (entmake (list '(0 . "TEXT") (cons 8 layer) (cons 10 pt) (cons 11 pt)
                 '(40 . 180) '(72 . 1) '(73 . 2) (cons 1 txt))))

(defun wpe:draw-csv (file / f line fields layer x y w h txt n)
  (setq f (open file "r") n 0)
  (while (setq line (read-line f))
    (setq fields (wpe:split line))
    (if (and (nth 4 fields) (numberp (read (nth 1 fields))))
      (progn
        (setq layer (nth 0 fields)
              x (atof (nth 1 fields)) y (atof (nth 2 fields))
              w (atof (nth 3 fields)) h (atof (nth 4 fields))
              txt (nth 5 fields))
        (wpe:layer layer 7)
        (wpe:rect layer (list x y) (list (+ x w) y)
                       (list (+ x w) (+ y h)) (list x (+ y h)))
        (if (>= w 1400)
          (wpe:label layer (list (+ x (/ w 2.0)) (+ y (/ h 2.0))) (if txt txt layer)))
        (setq n (1+ n)))))
  (close f)
  n)

;; -------------------------------------------------------------------- WPEPLAN
(defun c:WPEPLAN (/ dir hb bw bh bfile pfile planexe)
  (setq dir (wpe:dir))
  (setq hb (wpe:hall))
  (setq bw (car hb) bh (cadr hb))
  (setq bfile (wpe:temp "blocks" ".csv"))
  (setq pfile (wpe:temp "plan" ".csv"))
  (setq planexe (strcat dir "/cli/wpe-plan.js"))
  (if (not (wpe:write-blocks bfile))
    (princ "\nAborted: no blocks found in model space.")
    (progn
      (startapp "cmd.exe"
        (strcat "/c node \"" planexe "\" --blocks \"" bfile "\" --hall "
                (rtos bw 2 0) "x" (rtos bh 2 0) " --csv \"" pfile "\""))
      (princ "\nPlanning…")
      (if (wpe:wait pfile 30000)
        (progn
          (command "_.undo" "_BE")
          (princ (strcat "\nDrew " (itoa (wpe:draw-csv pfile)) " shapes on the WPE-* layers."))
          (command "_.undo" "_E")
          (princ "\nIf a rule failed, run the CLI directly for the full report."))
        (princ (strcat "\nNo plan came back within 30 s. Check node is on PATH, then run:"
                       "\n  node \"" planexe "\" --blocks \"" bfile "\" --hall "
                       (rtos bw 2 0) "x" (rtos bh 2 0) " --csv plan.csv")))))
  (princ))

(princ "\nWPE loaded. Type WPEPLAN to generate a layout.")
(princ)
