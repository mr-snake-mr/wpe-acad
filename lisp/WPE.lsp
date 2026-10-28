;;; ==========================================================================
;;; WPE.lsp — AutoCAD front end for the WPE layout engine
;;;
;;; Commands
;;;   WPEPLAN    read the drawing, plan, draw the result
;;;   WPEBLOCKS  audit: every block name and count -> wpe-blocks.csv
;;;   WPEDIAG    write wpe-diag.txt (environment, units, inventory, node)
;;;   WPEDEMO    build a throwaway 24 x 13 m test drawing
;;;   WPEHELP    list the commands
;;;
;;; Set the folder once per session:  (setq WPEDIR "C:/WPE")
;;;
;;; STATUS: the engine it calls is tested (see docs/VERIFICATION.md); this file
;;; has not been executed inside AutoCAD by its author. WPEDIAG exists so the
;;; first run produces something to send back if it misbehaves.
;;; ==========================================================================

(vl-load-com)

(if (not *wpe-mm*) (setq *wpe-mm* 1.0))   ; millimetres per drawing unit

;; ------------------------------------------------------------------ helpers
(defun wpe:scale (/ u)
  (setq u (getvar "INSUNITS"))
  (cond ((= u 1) 25.4)         ; inches
        ((= u 2) 304.8)        ; feet
        ((= u 4) 1.0)          ; millimetres
        ((= u 5) 10.0)         ; centimetres
        ((= u 6) 1000.0)       ; metres
        (T 1.0)))              ; unitless -> assume mm

(defun wpe:dir (/ d)
  (cond ((and (boundp 'WPEDIR) WPEDIR (findfile (strcat WPEDIR "/cli/wpe-plan.js"))) WPEDIR)
        ((and (boundp 'WPEDIR) WPEDIR) WPEDIR)
        (T (setq d (getstring T "\nFolder containing cli/wpe-plan.js (e.g. C:/WPE): "))
           (if (and d (/= d "")) (setq WPEDIR d) nil))))

(defun wpe:node (dir)
  (if (findfile (strcat dir "/node/node.exe")) (strcat dir "/node/node.exe") "node"))

(defun wpe:temp (tag ext) (strcat (vl-filename-mktemp (strcat "wpe-" tag)) ext))

(defun wpe:layer-color (name)
  (cond ((= name "WPE-FENCE") 1)
        ((= name "WPE-WALK") 4)
        ((= name "WPE-FLOW") 4)
        ((= name "WPE-PLAN") 3)
        (T 7)))

(defun wpe:layer (name)
  (if (not (tblsearch "LAYER" name))
    (entmake (list '(0 . "LAYER") (cons 2 name) '(70 . 0)
                   (cons 62 (wpe:layer-color name)) '(6 . "CONTINUOUS")))))

(defun wpe:split (s / out i c token)
  (setq out '() token "" i 1)
  (while (<= i (strlen s))
    (setq c (substr s i 1))
    (if (= c ",") (setq out (cons token out) token "")
      (setq token (strcat token c)))
    (setq i (1+ i)))
  (reverse (cons token out)))

;; read a text file into a list of lines (nil if missing)
(defun wpe:lines (file / f line out)
  (if (findfile file)
    (progn
      (setq f (open file "r") out '())
      (while (setq line (read-line f)) (setq out (cons line out)))
      (close f)
      (reverse out))))

(defun wpe:tail (lst n / out)
  (setq out lst)
  (if (> (length out) n) (repeat (- (length out) n) (setq out (cdr out))))
  out)

;; ------------------------------------------------------------- inventory
(defun wpe:tally (/ ss i nm tbl)
  (setq ss (ssget "_X" '((0 . "INSERT"))) i 0 tbl '())
  (if ss
    (while (< i (sslength ss))
      (setq nm (cdr (assoc 2 (entget (ssname ss i)))))
      (setq tbl (if (assoc nm tbl)
                  (subst (cons nm (1+ (cdr (assoc nm tbl)))) (assoc nm tbl) tbl)
                  (cons (cons nm 1) tbl)))
      (setq i (1+ i))))
  tbl)

;; coordinates are converted to millimetres here; the planner works in mm only
(defun wpe:write-blocks (file / ss i e ed nm pt sc f)
  (setq sc *wpe-mm*)
  (setq ss (ssget "_X" '((0 . "INSERT"))))
  (if (not ss) nil
    (progn
      (setq f (open file "w"))
      (write-line "name,x,y" f)
      (setq i 0)
      (while (< i (sslength ss))
        (setq e  (ssname ss i)
              ed (entget e)
              nm (cdr (assoc 2 ed))
              pt (trans (cdr (assoc 10 ed)) e 1))
        (write-line (strcat nm "," (rtos (* (car pt) sc) 2 1) "," (rtos (* (cadr pt) sc) 2 1)) f)
        (setq i (1+ i)))
      (close f)
      (princ (strcat "\nExported " (itoa (sslength ss)) " block(s)."))
      T)))

;; ------------------------------------------------------------------ hall
(defun wpe:hall (/ ss mn mx lo hi)
  (setq ss (ssget "_X" '((0 . "*POLYLINE") (8 . "WPE-HALL"))))
  (if ss
    (progn
      (vla-getboundingbox (vlax-ename->vla-object (ssname ss 0)) 'mn 'mx)
      (setq lo (vlax-safearray->list mn) hi (vlax-safearray->list mx))
      (list (* (abs (- (car hi) (car lo))) *wpe-mm*)
            (* (abs (- (cadr hi) (cadr lo))) *wpe-mm*)))
    (progn
      (princ "\nNo polyline on layer WPE-HALL — pick the two corners of the floor.")
      (setq lo (getpoint "\nFirst corner: "))
      (if (not lo) nil
        (progn
          (setq hi (getcorner lo "\nOpposite corner: "))
          (if (not hi) nil
            (list (* (abs (- (car hi) (car lo))) *wpe-mm*)
                  (* (abs (- (cadr hi) (cadr lo))) *wpe-mm*))))))))

;; ------------------------------------------------------------- wait / draw
(defun wpe:wait (file ms / t0)
  (setq t0 (getvar "MILLISECS"))
  (while (and (not (findfile file)) (< (- (getvar "MILLISECS") t0) ms))
    (vl-catch-all-apply 'command (list "_.delay" 100)))
  (findfile file))

(defun wpe:rect (layer p1 p2 p3 p4)
  (entmake (append
             (list '(0 . "LWPOLYLINE") (cons 8 layer) '(90 . 4) '(70 . 1))
             (list (cons 10 (car p1)) (cons 20 (cadr p1))
                   (cons 10 (car p2)) (cons 20 (cadr p2))
                   (cons 10 (car p3)) (cons 20 (cadr p3))
                   (cons 10 (car p4)) (cons 20 (cadr p4))))))

(defun wpe:label (layer pt txt h)
  (entmake (list '(0 . "TEXT") (cons 8 layer) (cons 10 pt) (cons 11 pt)
                 (cons 40 h) '(72 . 1) '(73 . 2) (cons 1 txt))))

;; plan comes back in millimetres; convert to drawing units on the way in
(defun wpe:draw-csv (file / f line fd layer x y w h txt n sc p1 p2 p3 p4)
  (setq f (open file "r") n 0 sc *wpe-mm*)
  (while (setq line (read-line f))
    (setq fd (wpe:split line))
    (if (and (nth 4 fd) (numberp (read (nth 1 fd))))
      (progn
        (setq layer (nth 0 fd)
              x (/ (atof (nth 1 fd)) sc) y (/ (atof (nth 2 fd)) sc)
              w (/ (atof (nth 3 fd)) sc) h (/ (atof (nth 4 fd)) sc)
              txt (nth 5 fd))
        (wpe:layer layer)
        (setq p1 (list x y) p2 (list (+ x w) y)
              p3 (list (+ x w) (+ y h)) p4 (list x (+ y h)))
        (wpe:rect layer p1 p2 p3 p4)
        (if (and txt (/= txt "") (>= w (* 1.2 (/ 180.0 sc))))
          (wpe:label layer (list (+ x (/ w 2.0)) (+ y (/ h 2.0))) txt (/ 180.0 sc)))
        (setq n (1+ n)))))
  (close f)
  n)

;; ------------------------------------------------------------------ WPEPLAN
(defun c:WPEPLAN (/ dir hb bw bh bfile pfile logf cli node cmd found)
  (setq *wpe-mm* (wpe:scale))
  (setq dir (wpe:dir))
  (if (not dir)
    (princ "\nAborted: no folder set.")
    (progn
      (princ (strcat "\nDrawing units scale: x" (rtos *wpe-mm* 2 3) " mm per unit"))
      (setq hb (wpe:hall))
      (if (not hb)
        (princ "\nAborted: no hall boundary.")
        (progn
          (setq bw (car hb) bh (cadr hb))
          (if (or (< bw 4000) (< bh 4000))
            (princ (strcat "\nWarning: hall is only " (rtos (/ bw 1000.0) 2 2) " x "
                           (rtos (/ bh 1000.0) 2 2) " m — check the drawing units.")))
          (setq bfile (wpe:temp "blocks" ".csv")
                pfile (wpe:temp "plan" ".csv")
                logf  (wpe:temp "log" ".txt")
                cli   (strcat dir "/cli/wpe-plan.js")
                node  (wpe:node dir))
          (if (not (wpe:write-blocks bfile))
            (princ "\nAborted: no blocks in model space.")
            (progn
              (setq cmd (strcat "\"" cli "\" --blocks \"" bfile "\" --hall "
                                (rtos bw 2 0) "x" (rtos bh 2 0)
                                " --csv \"" pfile "\" --log \"" logf "\""))
              (princ "\nPlanning…")
              (startapp node cmd)
              (if (wpe:wait pfile 30000)
                (progn
                  (vl-catch-all-apply 'command (list "_.undo" "_BE"))
                  (setq found (wpe:draw-csv pfile))
                  (vl-catch-all-apply 'command (list "_.undo" "_E"))
                  (princ (strcat "\nDrew " (itoa found) " shape(s) on the WPE-* layers."))
                  (foreach l (wpe:tail (wpe:lines logf) 14) (princ (strcat "\n  " l)))
                  (princ "\nIf a rule failed it is listed above. One UNDO removes the plan."))
                (progn
                  (princ "\nNo plan came back within 30 s. What the engine said:")
                  (foreach l (wpe:tail (wpe:lines logf) 20) (princ (strcat "\n  " l)))
                  (princ (strcat "\nLog: " logf))
                  (princ "\nRun WPEDIAG and send wpe-diag.txt plus this log."))))))))))

;; ---------------------------------------------------------------- WPEBLOCKS
(defun c:WPEBLOCKS (/ tbl path f)
  (setq tbl (wpe:tally))
  (if (not tbl)
    (princ "\nNo blocks in model space.")
    (progn
      (setq path (strcat (getvar "DWGPREFIX") "wpe-blocks.csv"))
      (setq f (open path "w"))
      (write-line "block,count" f)
      (foreach k (acad_strlsort (mapcar 'car tbl))
        (write-line (strcat k "," (itoa (cdr (assoc k tbl)))) f))
      (close f)
      (princ (strcat "\n" (itoa (length tbl)) " distinct block name(s) written to " path))))
  (princ))

;; ------------------------------------------------------------------ WPEDEMO
(defun wpe:mkblock (nm w h)
  (if (not (tblsearch "BLOCK" nm))
    (progn
      (entmake (list '(0 . "BLOCK") (cons 2 nm) (cons 3 nm) '(70 . 0) '(10 0.0 0.0 0.0)))
      (entmake (append (list '(0 . "LWPOLYLINE") '(8 . "0") '(90 . 4) '(70 . 1))
                       (list (cons 10 0.0) (cons 20 0.0)
                             (cons 10 (float w)) (cons 20 0.0)
                             (cons 10 (float w)) (cons 20 (float h))
                             (cons 10 0.0) (cons 20 (float h)))))
      (entmake '((0 . "ENDBLK"))))))

(defun c:WPEDEMO (/ sc)
  (setq *wpe-mm* (wpe:scale))
  (setq sc *wpe-mm*)
  (wpe:layer "WPE-HALL")
  (wpe:layer "EQUIP")
  (wpe:mkblock "WPE-DEMO-ROBOT" 800 800)
  (wpe:mkblock "WPE-DEMO-MACHINE-1" 3200 2200)
  (wpe:mkblock "WPE-DEMO-MACHINE-2" 2600 2000)
  (wpe:mkblock "WPE-DEMO-LOAD-FIXTURE" 1400 1000)
  (wpe:mkblock "WPE-DEMO-UNLOAD-FIXTURE" 1400 1000)
  (wpe:mkblock "WPE-DEMO-TROLLEY" 1200 800)
  (entmake (append (list '(0 . "LWPOLYLINE") '(8 . "WPE-HALL") '(90 . 4) '(70 . 1))
                   (list (cons 10 0.0) (cons 20 0.0)
                         (cons 10 (/ 24000.0 sc)) (cons 20 0.0)
                         (cons 10 (/ 24000.0 sc)) (cons 20 (/ 13000.0 sc))
                         (cons 10 0.0) (cons 20 (/ 13000.0 sc)))))
  (foreach p '(("WPE-DEMO-LOAD-FIXTURE" 2000.0 6000.0)
               ("WPE-DEMO-ROBOT" 5200.0 6000.0)
               ("WPE-DEMO-ROBOT" 6700.0 6000.0)
               ("WPE-DEMO-ROBOT" 8200.0 6000.0)
               ("WPE-DEMO-MACHINE-1" 11000.0 6000.0)
               ("WPE-DEMO-MACHINE-2" 15000.0 6000.0)
               ("WPE-DEMO-UNLOAD-FIXTURE" 19000.0 6000.0)
               ("WPE-DEMO-TROLLEY" 3000.0 500.0)
               ("WPE-DEMO-TROLLEY" 5200.0 500.0)
               ("WPE-DEMO-TROLLEY" 7400.0 500.0))
    (entmake (list '(0 . "INSERT") (cons 2 (car p)) '(8 . "EQUIP")
                   (cons 10 (list (/ (cadr p) sc) (/ (caddr p) sc) 0.0)))))
  (vl-catch-all-apply 'command (list "_.zoom" "_E"))
  (princ "\nDemo drawing created: 24 x 13 m hall, 3 robots, 2 machines, 10 blocks.")
  (princ "\nRun WPEPLAN next.")
  (princ))

;; ------------------------------------------------------------------- WPEDIAG
(defun c:WPEDIAG (/ dir tbl path f nf nv lines)
  (setq dir (wpe:dir))
  (setq tbl (wpe:tally))
  (setq nf (wpe:temp "nodever" ".txt"))
  (if dir
    (startapp "cmd.exe" (strcat "/c \"" (wpe:node dir) "\" -v > \"" nf "\" 2>&1")))
  (wpe:wait nf 8000)
  (setq lines (wpe:lines nf))
  (setq nv (if lines (car (wpe:tail lines 1)) "not run"))
  (setq path (strcat (getvar "DWGPREFIX") "wpe-diag.txt"))
  (setq f (open path "w"))
  (write-line (strcat "acadver," (getvar "ACADVER")) f)
  (write-line (strcat "dwg," (getvar "DWGNAME")) f)
  (write-line (strcat "saved," (if (= 1 (getvar "DWGTITLED")) "yes" "no")) f)
  (write-line (strcat "insunits," (itoa (getvar "INSUNITS"))) f)
  (write-line (strcat "mm_per_unit," (rtos (wpe:scale) 2 3)) f)
  (write-line (strcat "wpedir," (if dir dir "NOT SET")) f)
  (write-line (strcat "cli," (if (and dir (findfile (strcat dir "/cli/wpe-plan.js"))) "found" "MISSING")) f)
  (write-line (strcat "node," (if (and dir (findfile (strcat dir "/node/node.exe"))) "bundled" "PATH only")) f)
  (write-line (strcat "nodever," nv) f)
  (write-line (strcat "inserts," (itoa (if (ssget "_X" '((0 . "INSERT")))
                                            (sslength (ssget "_X" '((0 . "INSERT")))) 0))) f)
  (write-line (strcat "distinct_blocks," (itoa (length tbl))) f)
  (write-line (strcat "hall_layer," (if (ssget "_X" '((0 . "*POLYLINE") (8 . "WPE-HALL"))) "found" "missing")) f)
  (foreach nm (acad_strlsort (mapcar 'car tbl))
    (write-line (strcat "block," nm "," (itoa (cdr (assoc nm tbl)))) f))
  (close f)
  (princ (strcat "\nWrote " path))
  (princ "\nSend that file back (with wpe-blocks.csv) if anything failed.")
  (princ))

;; ------------------------------------------------------------------- WPEHELP
(defun c:WPEHELP ()
  (princ "\nWPEPLAN    plan the open drawing and draw the result")
  (princ "\nWPEBLOCKS  list block names and counts -> wpe-blocks.csv")
  (princ "\nWPEDIAG    environment + inventory -> wpe-diag.txt")
  (princ "\nWPEDEMO    build a 24 x 13 m test drawing")
  (princ "\nSet the folder first:  (setq WPEDIR \"C:/WPE\")")
  (princ))

(princ "\nWPE loaded — WPEHELP lists the commands.")
(princ)
