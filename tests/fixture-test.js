/* Fixture suite: each block list stands in for a drawing the plugin will meet.
   Asserts the behaviour, not just "it ran".
   Run: node tests/fixture-test.js                                        */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const csvCheck = require('./csv-check');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'cli', 'wpe-plan.js');
const dir = path.join(root, 'tests', 'samples');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpe-fixture-'));
let failures = 0;

function assert(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

function run(file, hall, extra) {
  const extraArgs = extra || [];
  const csv = path.join(tmp, file.replace(/\.csv$/, '') + '.plan.csv');
  const args = [cli, '--blocks', path.join(dir, file), '--hall', hall,
    '--json', '--csv', csv].concat(extraArgs);
  let code = 0, out = '', err = '';
  try {
    out = execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status;
    out = e.stdout || '';
    err = String(e.stderr || '');
  }
  let json = null;
  try { json = out ? JSON.parse(out) : null; } catch (e) { json = null; }
  const plan = fs.existsSync(csv) ? fs.readFileSync(csv, 'utf8') : '';
  return { code: code, json: json, stderr: err, plan: plan };
}

/* a rectangle's long/short sides, so a turned machine still counts */
const sides = (r) => [Math.min(r.w, r.h), Math.max(r.w, r.h)].join('x');

const cases = [
  { file: 'baseline-24x13.csv', hall: '24000x13000', code: 0, status: 'ok', rules: '8/8', robots: 3,
    check: (r) => r.json.flow_m > 13 && r.json.flow_m < 16,
    why: 'baseline plans and passes' },
  { file: 'mixed-machine-sizes.csv', hall: '30000x15000', code: 0, status: 'ok', rules: '8/8', robots: 3,
    check: (r) => {
      const machines = csvCheck.parse(r.plan).filter((x) => /machine/i.test(x.label));
      const got = machines.map(sides).sort();
      return machines.length === 2 && got.join(' ') === '1000x1000 1200x10000';
    },
    why: 'a 10 m machine and a 1 m machine keep their own sizes' },
  { file: 'tight-hall.csv', hall: '14000x9000', code: 1, status: 'infeasible',
    why: 'a 14 x 9 m hall is refused, not fudged' },
  { file: 'no-extents.csv', hall: '24000x13000', code: 0, status: 'ok', rules: '8/8',
    check: (r) => r.json.sizes.source === 'catalogue' && r.json.size_notes.length > 0,
    why: 'a block list without extents falls back to the catalogue and says so' },
  { file: 'unrecognised-blocks.csv', hall: '24000x13000', code: 2,
    why: 'unnamed blocks fail loudly instead of planning nothing' }
];

cases.forEach((c) => {
  console.log('\n' + c.file);
  const r = run(c.file, c.hall);
  assert(r.code === c.code, 'exit code ' + r.code + ' (expected ' + c.code + ') — ' + c.why);
  if (c.status) assert(r.json && r.json.status === c.status, 'status ' + (r.json && r.json.status));
  if (c.rules) assert(r.json.rules === c.rules, 'rules ' + r.json.rules);
  if (c.robots != null) assert(r.json.found.robots === c.robots, 'robots recognised: ' + r.json.found.robots);
  if (c.check) assert(c.check(r), 'domain check');
  if (c.code === 0) {
    const v = csvCheck.validate(r.plan);
    assert(v.ok, 'plan CSV sound' + (v.ok ? '' : ': ' + v.errors.join('; ')));
  }
  if (c.code === 2) assert(/no robot blocks/i.test(r.stderr), 'clear message on stderr');
});

/* the line rate must move the resource requirement, and say so */
console.log('\nline rate lever');
const at30 = run('baseline-24x13.csv', '24000x13000', ['--jph', '30']);
const at60 = run('baseline-24x13.csv', '24000x13000', ['--jph', '60']);
const at120 = run('baseline-24x13.csv', '24000x13000', ['--jph', '120']);
assert(at30.json.status === 'ok' && at120.json.status === 'ok', 'every rate still plans and passes');
assert(at30.json.found.robots === 3 && at120.json.found.robots === 3,
  'inventory comes from the drawing, not from JPH');
const note30 = (at30.json.notes || []).join(' ');
const note60 = (at60.json.notes || []).join(' ');
const note120 = (at120.json.notes || []).join(' ');
assert(/suggests 2 robot/.test(note30), '30 JPH: two robots suffice, drawing has three — flagged');
assert(!/suggests/.test(note60), '60 JPH matches the drawing exactly — no warning');
assert(/suggests 5 robot/.test(note120), '120 JPH: five robots needed — flagged');

/* an absurd measurement must be refused, not trusted */
console.log('\nbad extents');
const bad = path.join(tmp, 'bad.csv');
fs.writeFileSync(bad, 'name,x,y,w,h\nROBOT-01,0,0,999999,999999\nROBOT-02,0,0,800,800\n' +
  'MACHINE-1,0,0,3200,2200\nLOAD-FIXTURE,0,0,1400,1000\nUNLOAD-FIXTURE,0,0,1400,1000\n', 'utf8');
let badCode = 0, badOut = '';
try {
  badOut = execFileSync(process.execPath, [cli, '--blocks', bad, '--hall', '24000x13000', '--json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  badCode = e.status;
  badOut = String(e.stdout || '');
}
assert(badCode === 0, 'a nonsense measurement does not abort the run');
assert(/outside the hall/.test(badOut), 'it is reported instead of used');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }

console.log(failures ? '\n' + failures + ' assertion(s) failed' : '\nAll fixture assertions passed');
process.exit(failures ? 1 : 0);
