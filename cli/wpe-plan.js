#!/usr/bin/env node
/* Headless planner — the same engine the AutoCAD front end calls.
 *
 * In:  a block list exported from the open drawing (name,x,y,w,h — millimetres,
 *      w/h are the measured extents) plus the hall size, both from lisp/WPE.lsp
 * Out: a flat drawing list (layer,x,y,w,h,label) the LISP turns into entities
 *
 *   node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 --csv plan.csv --log run.log
 *
 * No drawing file is read or written at any point.
 * Exit codes: 0 compliant, 1 does not fit / rules fail, 2 bad input.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
['config.js', 'geometry.js', 'checker.js', 'planner.js']
  .forEach((f) => new Function(fs.readFileSync(path.join(root, 'engine', f), 'utf8'))());
['mapper.js', 'plan-csv.js']
  .forEach((f) => new Function(fs.readFileSync(path.join(root, 'lib', f), 'utf8'))());

const WPE = globalThis.WPE;
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};
const jsonMode = argv.indexOf('--json') >= 0;

const logPath = opt('log', '');
const lines = [];
function say(s) {
  if (s === undefined) return;
  lines.push(String(s));
  if (jsonMode) process.stderr.write(String(s) + '\n');
  else console.log(s);
}
function finish(code) {
  if (logPath) {
    try { fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf8'); } catch (e) { /* ignore */ }
  }
  process.exit(code);
}

/* ------------------------------------------------------------------ input */
const blocksFile = opt('blocks', '');
const hallArg = String(opt('hall', '')).toLowerCase().split('x').map(Number);
const jph = parseFloat(opt('jph', '60'));
const objective = String(opt('objective', 'flow')).toLowerCase() === 'compact' ? 'compact' : 'flow';

if (!blocksFile) {
  say('usage: node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 --csv plan.csv [--log run.log]');
  finish(2);
}
if (!fs.existsSync(blocksFile)) {
  say('error: block list not found: ' + blocksFile);
  finish(2);
}
if (!(hallArg.length === 2 && hallArg.every((n) => isFinite(n) && n > 0))) {
  say('error: --hall WxH is required, in millimetres, e.g. --hall 24000x13000');
  finish(2);
}

const inserts = [];
fs.readFileSync(blocksFile, 'utf8').split(/\r?\n/).forEach((line, i) => {
  if (!line.trim()) return;
  const c = line.split(',');
  if (i === 0 && /name/i.test(c[0])) return;
  const name = (c[0] || '').trim();
  const x = parseFloat(c[1]);
  const y = parseFloat(c[2]);
  const w = parseFloat(c[3]);
  const h = parseFloat(c[4]);
  if (name && isFinite(x) && isFinite(y)) inserts.push({ name: name, x: x, y: y, w: w, h: h });
});

if (!inserts.length) {
  say('error: no blocks in ' + blocksFile);
  finish(2);
}

/* ---------------------------------------------------------------- mapping */
let aliases = null;
const aliasPath = opt('aliases', path.join(root, 'lib', 'aliases.json'));
if (fs.existsSync(aliasPath)) {
  try {
    aliases = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));
  } catch (e) {
    say('warning: could not read ' + aliasPath + ' (' + e.message + ')');
  }
}

/* ------------------------------------------------- measured footprints */
/* One size per instance, straight from the drawing. A block whose extents
   could not be read, or that is absurdly small/large for the hall, falls back
   to the catalogue default and is reported — never silently guessed. */
const sizeRows = {};
const sizeNotes = [];
const sane = (b) => isFinite(b.w) && isFinite(b.h) && b.w >= 50 && b.h >= 50 &&
  b.w <= hallArg[0] && b.h <= hallArg[1];

inserts.forEach((b) => {
  const c = WPE.Mapper.resolve(b.name, aliases);
  if (!c.role) return;
  if (!isFinite(b.w) || !isFinite(b.h) || b.w <= 0 || b.h <= 0) {
    sizeNotes.push(b.name + ': no extents in the block list — catalogue size used');
    return;
  }
  if (!sane(b)) {
    sizeNotes.push(b.name + ': measured ' + Math.round(b.w) + ' x ' + Math.round(b.h) +
      ' mm is outside the hall — catalogue size used');
    return;
  }
  (sizeRows[c.role] = sizeRows[c.role] || []).push({ w: Math.round(b.w), h: Math.round(b.h) });
});

const sizes = {
  robots: sizeRows.robot || null,
  controllers: sizeRows.controller || null,
  machine1: sizeRows.machine1 || null,
  machine2: sizeRows.machine2 || null,
  trolley1: sizeRows.trolley1 || null,
  trolley2: sizeRows.trolley2 || null,
  loading_fixture: (sizeRows.fixture_load || [])[0] || null,
  unload_fixture: (sizeRows.fixture_unload || [])[0] || null
};
const measuredCount = Object.keys(sizeRows).reduce((a, k) => a + sizeRows[k].length, 0);

const mapped = WPE.Mapper.toCounts(inserts, aliases);
if (!mapped.counts.robots) {
  say('error: no robot blocks recognised in the block list');
  say('       run WPEBLOCKS in AutoCAD and check the names against CONVENTIONS.md');
  if (mapped.unknown.length) say('       unrecognised names: ' + mapped.unknown.map((b) => b.name).join(', '));
  finish(2);
}

/* --------------------------------------------------------------- planning */
const state = WPE.Config.cloneState({
  preset: 'custom',
  mode: 'single',
  hall: { w: hallArg[0], h: hallArg[1] },
  rules: WPE.Config.RULES,
  jph: jph,
  activities: WPE.Config.PRESETS.station1.activities,
  counts: mapped.counts,
  sizes: sizes,
  objective: objective
});

const started = Date.now();
let result;
try {
  result = WPE.Planner.plan(state);
} catch (err) {
  say('error: planner failed — ' + err.message);
  finish(2);
}
const elapsed = Date.now() - started;
const m = result.layout.metrics;
const ruleText = result.check.rules.filter((r) => r.pass).length + '/' + result.check.rules.length;

/* ---------------------------------------------------------------- outputs */
const csvPath = opt('csv', '');
if (csvPath) fs.writeFileSync(csvPath, WPE.PlanCsv.toCsv(result.layout), 'utf8');

const reportPath = opt('report', '');
if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');

const summary = {
  status: result.status,
  rules: ruleText,
  compliant: result.check.compliant,
  fits: m.fits,
  hall: { w: Math.round(hallArg[0]), h: Math.round(hallArg[1]) },
  flow_m: +(m.flow / 1000).toFixed(2),
  rows: m.rows,
  footprint_m2: Math.round(m.footprintArea / 1e6),
  utilisation: +(m.utilisation * 100).toFixed(1),
  alternatives: result.alternatives.length,
  elapsed_ms: elapsed,
  found: mapped.found,
  counts_used: mapped.counts,
  unknown: mapped.unknown.map((b) => b.name),
  sizes: {
    source: measuredCount ? 'drawing' : 'catalogue',
    measured: measuredCount,
    per_role: Object.keys(sizeRows).reduce((a, k) => {
      a[k] = sizeRows[k].map((s) => s.w + 'x' + s.h);
      return a;
    }, {})
  },
  size_notes: sizeNotes,
  notes: result.notes || [],
  failed_rules: result.check.rules.filter((r) => !r.pass).map((r) => r.id),
  writes: { csv: csvPath || null, report: reportPath || null }
};

if (jsonMode) {
  console.log(JSON.stringify(summary, null, 2));
  finish(result.check.compliant && m.fits ? 0 : 1);
}

const meta = {};
(WPE.Config.RULE_META || []).forEach((r) => { meta[r.id] = r.title; });

say('WPE plan');
say('  hall        : ' + (hallArg[0] / 1000).toFixed(1) + ' x ' + (hallArg[1] / 1000).toFixed(1) + ' m');
say('  recognised  : ' + mapped.counts.robots + ' robots, ' + mapped.counts.machine1 +
  ' machine1, ' + mapped.counts.machine2 + ' machine2, ' +
  (mapped.found.loadFixture + mapped.found.unloadFixture) + ' fixtures, ' +
  (mapped.counts.trolley1 + mapped.counts.trolley2) + ' trolleys');
if (mapped.unknown.length) {
  say('  ignored     : ' + mapped.unknown.length + ' block(s) — ' + mapped.unknown.map((b) => b.name).join(', '));
}
say('  sizes       : ' + (measuredCount
  ? measuredCount + ' measured from the drawing' + (sizeNotes.length ? ' (' + sizeNotes.length + ' fell back to the catalogue)' : '')
  : 'catalogue defaults — the block list carried no extents'));
if (measuredCount) {
  Object.keys(sizeRows).forEach((role) => {
    const list = sizeRows[role].map((s) => (s.w / 1000).toFixed(2) + ' x ' + (s.h / 1000).toFixed(2) + ' m');
    say('                ' + role + ': ' + list.join(', '));
  });
}
sizeNotes.forEach((n) => say('  size note   : ' + n));
say('  status      : ' + result.status + '   rules ' + ruleText);
say('  flow        : ' + (m.flow / 1000).toFixed(2) + ' m, ' + m.rows + ' row(s), ' +
  Math.round(m.footprintArea / 1e6) + ' m2 footprint');
say('  candidates  : ' + result.alternatives.length + ' in ' + elapsed + ' ms');
(result.notes || []).forEach((n) => say('  note        : ' + n));
if (!m.fits) {
  say('  verdict     : does not fit — needs ' + (m.neededW / 1000).toFixed(1) + ' x ' +
    (m.neededH / 1000).toFixed(1) + ' m');
}
result.check.rules.forEach((r) => {
  say('   ' + (r.pass ? 'ok  ' : 'FAIL') + ' ' + r.id + ' ' + (meta[r.id] || '') +
    (r.detail ? ' — ' + r.detail : ''));
});
if (csvPath) say('  wrote       : ' + csvPath);

finish(result.check.compliant && m.fits ? 0 : 1);
