/* Golden test for the headless planner — the part that can be verified without AutoCAD. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dxf = path.join(root, 'tests', 'samples', 'hall-24x13-with-machines.dxf');
const planCsv = path.join(root, 'tests', 'samples', 'plan.csv');
let failures = 0;

function assert(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { console.log('  FAIL ' + msg); failures++; }
}

if (!fs.existsSync(dxf)) {
  console.error('fixture missing — run: python tests/make_fixture.py');
  process.exit(2);
}

let out = '';
let code = 0;
try {
  out = execFileSync(process.execPath,
    [path.join(root, 'cli', 'wpe-plan.js'), dxf, '--jph', '60', '--json', '--csv', planCsv],
    { encoding: 'utf8' });
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
assert(s.flow_m > 12 && s.flow_m < 17, 'flow in a plausible band (' + s.flow_m + ' m)');
assert(s.alternatives >= 20, 'search evaluated ' + s.alternatives + ' arrangements');

const csv = fs.readFileSync(planCsv, 'utf8').trim().split('\n');
assert(csv.length > 15, 'plan has ' + (csv.length - 1) + ' shapes');
assert(csv[0] === 'layer,x,y,w,h,label', 'CSV header is stable');
assert(csv.some((l) => l.startsWith('WPE-PLAN')), 'equipment lands on WPE-PLAN');
assert(csv.some((l) => l.startsWith('WPE-FENCE')), 'fence drawn');
assert(csv.some((l) => l.startsWith('WPE-WALK')), 'walkway drawn');

/* negative case: a hall too small to hold the line must fail, not fudge */
const tooSmall = path.join(root, 'tests', 'samples', 'blocks.csv');
let negCode = 0;
try {
  execFileSync(process.execPath,
    [path.join(root, 'cli', 'wpe-plan.js'), '--blocks', tooSmall, '--hall', '9000x7000', '--json'],
    { encoding: 'utf8' });
} catch (err) {
  negCode = err.status;
}
assert(negCode === 1, 'infeasible hall exits 1 rather than inventing a layout');

console.log(failures ? '\n' + failures + ' assertion(s) failed' : '\nAll CLI assertions passed');
process.exit(failures ? 1 : 0);
