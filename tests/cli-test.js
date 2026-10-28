/* Golden test for the headless planner — the part that can be verified without AutoCAD.
   Run: node tests/cli-test.js                                              */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const csvCheck = require('./csv-check');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'cli', 'wpe-plan.js');
const blocks = path.join(root, 'tests', 'samples', 'baseline-24x13.csv');
const planCsv = path.join(root, 'tests', 'samples', '_plan.csv');
let failures = 0;

function assert(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { console.log('  FAIL ' + msg); failures++; }
}

if (!fs.existsSync(blocks)) {
  console.error('fixture missing: ' + blocks);
  process.exit(2);
}

let out = '';
let code = 0;
try {
  out = execFileSync(process.execPath,
    [cli, '--blocks', blocks, '--hall', '24000x13000', '--jph', '60',
      '--json', '--csv', planCsv],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  code = err.status;
  out = err.stdout || '';
}

const s = JSON.parse(out);
assert(code === 0, 'CLI exits 0 on a compliant plan');
assert(s.status === 'ok', 'status is ok');
assert(s.rules === '8/8', 'all eight rules pass (' + s.rules + ')');
assert(s.found.robots === 3, 'three robots recognised');
assert(s.found.machine1 === 1 && s.found.machine2 === 1, 'both machines recognised');
assert(s.unknown.length === 0, 'no unrecognised blocks');
assert(s.flow_m > 13 && s.flow_m < 16, 'flow in a plausible band (' + s.flow_m + ' m)');
assert(s.alternatives >= 20, 'search evaluated ' + s.alternatives + ' arrangements');
assert(s.sizes.source === 'drawing' && s.sizes.measured === 11,
  'every footprint comes from the block list (' + s.sizes.measured + ' measured)');

const text = fs.readFileSync(planCsv, 'utf8');
const rows = text.trim().split(/\r?\n/);
assert(rows[0] === 'layer,x,y,w,h,label', 'CSV header is stable');
assert(rows.length > 15, 'plan has ' + (rows.length - 1) + ' shapes');
assert(rows.some((l) => l.startsWith('WPE-PLAN')), 'equipment lands on WPE-PLAN');
assert(rows.some((l) => l.startsWith('WPE-FENCE')), 'fence drawn');
assert(rows.some((l) => l.startsWith('WPE-WALK')), 'walkway drawn');

/* the CSV is the only thing the drawing side consumes, so check it as geometry */
const v = csvCheck.validate(text);
assert(v.ok, 'plan CSV is geometrically sound' + (v.ok ? '' : ': ' + v.errors.join('; ')));
assert(v.counts.equipment >= 10, v.counts.equipment + ' equipment footprints inside the hall');

/* negative case: a hall too small to hold the line must fail, not fudge */
let negCode = 0;
let negOut = '';
try {
  negOut = execFileSync(process.execPath,
    [cli, '--blocks', path.join(root, 'tests', 'samples', 'tight-hall.csv'),
      '--hall', '14000x9000', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  negCode = err.status;
  negOut = err.stdout || '';
}
assert(negCode === 1, 'infeasible hall exits 1 rather than inventing a layout');
const neg = JSON.parse(negOut);
assert(neg.status === 'infeasible' && !neg.fits, 'infeasible plan is reported as such');
assert((neg.notes || []).some((n) => /extend the hall|could not be placed/.test(n)),
  'it says what to change');

try { fs.unlinkSync(planCsv); } catch (e) { /* leave it */ }

console.log(failures ? '\n' + failures + ' assertion(s) failed' : '\nAll CLI assertions passed');
process.exit(failures ? 1 : 0);
