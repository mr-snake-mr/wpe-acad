/* Fixture suite: each DXF stands in for a drawing the plugin will meet.
   Asserts the behaviour, not just "it ran".
   Run: node tests/fixture-test.js                                        */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'cli', 'wpe-plan.js');
const dir = path.join(root, 'tests', 'samples');
let failures = 0;

function assert(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

function run(file, extra) {
  const extraArgs = extra || [];
  const defaultJph = extraArgs.indexOf('--jph') >= 0 ? [] : ['--jph', '60'];
  const args = [cli, path.join(dir, file)].concat(defaultJph, ['--json'], extraArgs);
  try {
    const out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, json: out ? JSON.parse(out) : null, stderr: '' };
  } catch (err) {
    return {
      code: err.status,
      json: err.stdout ? JSON.parse(err.stdout) : null,
      stderr: String(err.stderr || '')
    };
  }
}

const cases = [
  { file: 'hall-24x13-with-machines.dxf', code: 0, status: 'ok', rules: '8/8', robots: 3,
    check: (r) => r.flow_m > 13 && r.flow_m < 16, why: 'baseline plans and passes' },
  { file: 'varied-machine-sizes.dxf', code: 0, status: 'ok', rules: '8/8', robots: 4,
    check: (r) => r.footprint_m2 > 0, why: 'a 4.2 m and a 1.8 m machine coexist' },
  { file: 'tight-hall.dxf', code: 1, status: 'infeasible', why: 'a 14 x 9 m hall is refused, not fudged' },
  { file: 'rotated-blocks.dxf', code: 0, status: 'ok', rules: '8/8', robots: 3,
    check: (r) => r.rotatedInserts === 9, why: 'rotated inserts are reported, not silently ignored' },
  { file: 'units-metres.dxf', code: 0, status: 'ok', rules: '8/8', robots: 3,
    check: (r) => r.hall.w === 24000 && r.hall.h === 13000, why: 'a drawing in metres scales to 24 x 13 m' },
  { file: 'unrecognised-blocks.dxf', code: 2, why: 'unnamed blocks fail loudly instead of planning nothing' }
];

cases.forEach((c) => {
  console.log('\n' + c.file);
  const r = run(c.file);
  assert(r.code === c.code, 'exit code ' + r.code + ' (expected ' + c.code + ') — ' + c.why);
  if (c.status) assert(r.json && r.json.status === c.status, 'status ' + (r.json && r.json.status));
  if (c.rules) assert(r.json.rules === c.rules, 'rules ' + r.json.rules);
  if (c.robots != null) assert(r.json.found.robots === c.robots, 'robots recognised: ' + r.json.found.robots);
  if (c.check) assert(c.check(r.json), 'domain check');
  if (c.code === 2) assert(/no robot blocks/i.test(r.stderr), 'clear message on stderr');
});

/* the line rate must move the resource requirement, and say so */
console.log('\nline rate lever');
const at30 = run('hall-24x13-with-machines.dxf', ['--jph', '30']);
const at60 = run('hall-24x13-with-machines.dxf', ['--jph', '60']);
const at120 = run('hall-24x13-with-machines.dxf', ['--jph', '120']);
assert(at30.json.status === 'ok' && at120.json.status === 'ok', 'every rate still plans and passes');
assert(at30.json.found.robots === 3 && at120.json.found.robots === 3,
  'inventory comes from the drawing, not from JPH');
const note30 = (at30.json.notes || []).join(' ');
const note60 = (at60.json.notes || []).join(' ');
const note120 = (at120.json.notes || []).join(' ');
assert(/suggests 2 robot/.test(note30), '30 JPH: two robots suffice, drawing has three — flagged');
assert(!/suggests/.test(note60), '60 JPH matches the drawing exactly — no warning');
assert(/suggests 5 robot/.test(note120), '120 JPH: five robots needed — flagged');

console.log(failures ? '\n' + failures + ' assertion(s) failed' : '\nAll fixture assertions passed');
process.exit(failures ? 1 : 0);
