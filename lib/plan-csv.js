/* The only output format: a flat drawing list the AutoCAD side turns into
   entities with entmake. Everything is millimetres; the LISP converts to
   drawing units on the way in.
     layer,x,y,w,h,label                                                     */
(function (root) {
  'use strict';

  function layerFor(item) {
    if (item.kind === 'fence') return 'WPE-FENCE';
    return 'WPE-PLAN';
  }

  function toCsv(layout) {
    const rows = [['layer', 'x', 'y', 'w', 'h', 'label']];
    const push = (layer, r, label) => rows.push([
      layer, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h),
      String(label || '').replace(/[,;]/g, ' ')
    ]);

    push('WPE-HALL', layout.hall, 'hall');
    if (layout.zones && layout.zones.ring) push('WPE-WALK', layout.zones.ring, 'walkway outer');
    if (layout.zones && layout.zones.production) push('WPE-WALK', layout.zones.production, 'walkway inner');
    (layout.fences || []).forEach((f) => push('WPE-FENCE', f.rect, f.label || 'fence'));
    (layout.items || []).forEach((it) => push(layerFor(it), it.rect, it.label));

    return rows.map((r) => r.join(',')).join('\n') + '\n';
  }

  root.WPE = root.WPE || {};
  root.WPE.PlanCsv = { toCsv, layerFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
