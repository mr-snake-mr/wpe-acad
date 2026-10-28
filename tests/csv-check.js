/* Independent check of the plan CSV — the artefact the AutoCAD side consumes.
   Verifies what CAD would show, without any drawing file: every shape inside the
   hall, no overlapping equipment, legal layer names, sane sizes. */

'use strict';

const LAYERS = ['WPE-HALL', 'WPE-WALK', 'WPE-FENCE', 'WPE-PLAN'];
const EQUIP = ['WPE-PLAN'];

function parse(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const c = line.split(',');
    if (i === 0 && /layer/i.test(c[0])) return;
    rows.push({
      layer: c[0],
      x: +c[1],
      y: +c[2],
      w: +c[3],
      h: +c[4],
      label: c.slice(5).join(',')
    });
  });
  return rows;
}

const inside = (a, b) =>
  a.x >= b.x - 0.51 && a.y >= b.y - 0.51 &&
  a.x + a.w <= b.x + b.w + 0.51 && a.y + a.h <= b.y + b.h + 0.51;

const overlap = (a, b) =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 &&
  a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

function validate(text) {
  const rows = parse(text);
  const errors = [];

  if (!rows.length) errors.push('no shapes');

  const hall = rows.find((r) => r.layer === 'WPE-HALL');
  if (!hall) errors.push('no hall outline');
  if (rows.filter((r) => r.layer === 'WPE-HALL').length > 1) errors.push('more than one hall outline');

  rows.forEach((r) => {
    if (LAYERS.indexOf(r.layer) < 0) errors.push('unexpected layer: ' + r.layer);
    if (!(r.w > 0) || !(r.h > 0)) errors.push('zero-size shape on ' + r.layer + ' (' + r.label + ')');
    if (hall && r !== hall && !inside(r, hall)) {
      errors.push('outside the hall: ' + r.label + ' on ' + r.layer);
    }
  });

  const equip = rows.filter((r) => EQUIP.indexOf(r.layer) >= 0);
  for (let i = 0; i < equip.length; i++) {
    for (let j = i + 1; j < equip.length; j++) {
      if (overlap(equip[i], equip[j])) {
        errors.push('overlapping: ' + equip[i].label + ' / ' + equip[j].label);
      }
    }
  }

  const fence = rows.filter((r) => r.layer === 'WPE-FENCE');
  const walk = rows.filter((r) => r.layer === 'WPE-WALK');
  if (!fence.length) errors.push('no fence');
  if (walk.length < 2) errors.push('walkway ring not described');

  return {
    ok: errors.length === 0,
    errors: errors,
    counts: {
      rows: rows.length,
      equipment: equip.length,
      fence: fence.length,
      walk: walk.length
    }
  };
}

module.exports = { parse, validate, inside, overlap, LAYERS };
