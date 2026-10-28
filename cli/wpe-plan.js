#!/usr/bin/env node
/* Headless planner — the same engine the AutoCAD front end calls.
 *
 *   node cli/wpe-plan.js drawing.dxf --jph 60 --out plan.dxf --csv plan.csv
 *   node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 --csv plan.csv --log run.log
 *
 * Every path passed in is in millimetres; the LISP front end converts drawing
 * units before calling, and converts the answer back when it draws.
 *
 * Exit codes: 0 compliant, 1 layout does not fit / rules fail, 2 bad input.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
['config.js', 'geometry.js', 'checker.js', 'planner.js', 'importer.js', 'exporters.js']
  .forEach((f) => new Function(fs.readFileSync(path.join(root, 'engine', f), 'utf8'))());
new Function(fs.readFileSync(path.join(root, 'lib', 'mapper.js'), 'utf8'))();

const WPE = globalThis.WPE;
const argv = process.argv.slice(2);

function opt(name, dflt) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}
const flag = (name) => argv.indexOf('--' + name) >= 0;

const logPath = opt('log', '');
const lines = [];
const jsonMode = flag('json');
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

/* ---------------------------------------------------------------- inputs */
const blocksFile = opt('blocks', '');
const dxfFile = opt('dxf', '') || argv.find((a) => !a.startsWith('--') && /\.dxf$/i.test(a));

if (!blocksFile && !dxfFile) {
  say('usage: node cli/wpe-plan.js <drawing.dxf> [--jph 60] [--csv plan.csv] [--out plan.dxf] [--log run.log]');
  say('       node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 --csv plan.csv');
  finish(2);
}

const jph = parseFloat(opt('jph', '60'));
const objective = String(opt('objective', 'flow')).toLowerCase() === 'compact' ? 'compact' : 'flow';
let units = 'mm';

/* ---------------------------------------------------------------- blocks */
let inserts = [];
let bbox = null;

if (blocksFile) {
  const rows = fs.readFileSync(blocksFile, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  rows.forEach((line, i) => {
    const c = line.split(',');
    if (i === 0 && /name/i.test(c[0])) return;
    const name = (c[0] || '').trim();
    const x = parseFloat(c[1]);
    const y = parseFloat(c[2]);
    if (name && isFinite(x) && isFinite(y)) inserts.push({ name: name, x: x, y: y, rotation: 0 });
  });
  const hallArg = String(opt('hall', '')).toLowerCase().split('x').map(Number);
  if (!(hallArg.length === 2 && hallArg.every((n) => isFinite(n) && n > 0))) {
    say('error: --hall WxH is required with --blocks (millimetres), e.g. --hall 24000x13000');
    finish(2);
  }
  bbox = { x: 0, y: 0, w: hallArg[0], h: hallArg[1] };
} else {
  const text = fs.readFileSync(dxfFile, 'utf8');
  const parsed = WPE.Importer.parse(text);
  inserts = parsed.inserts || [];
  bbox = parsed.bbox;
  units = ({ 1: 'inches', 2: 'feet', 4: 'mm', 5: 'cm', 6: 'm' })[parsed.units] || 'unitless';
  if (parsed.scale && parsed.scale !== 1) {
    say('note: drawing units are ' + units + ' — scaled to mm on read (x' + parsed.scale + ')');
  }
  if (!bbox) {
    say('error: no closed outline or geometry found in ' + dxfFile);
    finish(2);
  }
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

const rotatedInserts = inserts.filter((it) => Math.abs(((it.rotation || 0) % 360)) > 1).length;
const mapped = WPE.Mapper.toCounts(inserts, aliases);

if (!mapped.counts.robots) {
  say('error: no robot blocks recognised in ' + (blocksFile || dxfFile));
  say('       run WPEBLOCKS in AutoCAD and check the names against CONVENTIONS.md');
  if (mapped.unknown.length) say('       unrecognised names: ' + mapped.unknown.map((b) => b.name).join(', '));
  finish(2);
}

/* ---------------------------------------------------------------- planning */
const state = WPE.Config.cloneState({
  preset: 'custom',
  mode: 'single',
  hall: { w: bbox.w, h: bbox.h },
  rules: WPE.Config.RULES,
  jph: jph,
  activities: WPE.Config.PRESETS.station1.activities,
  counts: mapped.counts,
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
const rules = result.check.rules.filter((r) => r.pass).length + '/' + result.check.rules.length;

/* ---------------------------------------------------------------- outputs */
const csvPath = opt('csv', '');
if (csvPath) {
  fs.writeFileSync(csvPath, WPE.Exporters.planCsv(result.layout), 'utf8');
}
const outDxf = opt('out', '');
if (outDxf) {
  fs.writeFileSync(outDxf, WPE.Exporters.dxf(result.layout, { title: 'WPE plan' }), 'utf8');
}
const reportPath = opt('report', '');
if (reportPath) {
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
}

/* ---------------------------------------------------------------- summary */
const summary = {
  status: result.status,
  rules: rules,
  compliant: result.check.compliant,
  fits: m.fits,
  hall: { w: Math.round(bbox.w), h: Math.round(bbox.h) },
  units_seen: units,
  flow_m: +(m.flow / 1000).toFixed(2),
  rows: m.rows,
  footprint_m2: Math.round(m.footprintArea / 1e6),
  utilisation: +(m.utilisation * 100).toFixed(1),
  alternatives: result.alternatives.length,
  elapsed_ms: elapsed,
  found: mapped.found,
  counts_used: mapped.counts,
  unknown: mapped.unknown.map((b) => b.name),
  rotatedInserts: rotatedInserts,
  notes: result.notes || [],
  failed_rules: result.check.rules.filter((r) => !r.pass).map((r) => r.id),
  writes: { csv: csvPath || null, dxf: outDxf || null, report: reportPath || null }
};

if (jsonMode) {
  console.log(JSON.stringify(summary, null, 2));
  finish(result.check.compliant && m.fits ? 0 : 1);
}

const meta = {};
(WPE.Config.RULE_META || []).forEach((r) => { meta[r.id] = r.title; });

say('WPE plan — ' + (blocksFile || path.basename(dxfFile)));
say('  hall        : ' + (bbox.w / 1000).toFixed(1) + ' x ' + (bbox.h / 1000).toFixed(1) + ' m');
say('  recognised  : ' + mapped.counts.robots + ' robots, ' + mapped.counts.machine1 +
  ' machine1, ' + mapped.counts.machine2 + ' machine2, ' +
  (mapped.found.loadFixture + mapped.found.unloadFixture) + ' fixtures, ' +
  (mapped.counts.trolley1 + mapped.counts.trolley2) + ' trolleys');
if (mapped.unknown.length) {
  say('  ignored     : ' + mapped.unknown.length + ' block(s) — ' + mapped.unknown.map((b) => b.name).join(', '));
}
if (rotatedInserts) {
  say('  rotated     : ' + rotatedInserts + ' block(s) are rotated in the drawing; footprints come from the catalogue');
}
say('  status      : ' + result.status + '   rules ' + rules);
say('  flow        : ' + (m.flow / 1000).toFixed(2) + ' m, ' + m.rows + ' row(s), ' +
  Math.round(m.footprintArea / 1e6) + ' m2 footprint');
say('  candidates  : ' + result.alternatives.length + ' in ' + elapsed + ' ms');
(result.notes || []).forEach((n) => say('  note        : ' + n));
if (!m.fits) {
  say('  verdict     : does not fit — ' + (m.neededW / 1000).toFixed(1) + ' x ' +
    (m.neededH / 1000).toFixed(1) + ' m needed');
}
result.check.rules.forEach((r) => {
  say('   ' + (r.pass ? 'ok  ' : 'FAIL') + ' ' + r.id + ' ' + (meta[r.id] || '') +
    (r.detail ? ' — ' + r.detail : ''));
});
if (csvPath) say('  wrote       : ' + csvPath);
if (outDxf) say('  wrote       : ' + outDxf);

finish(result.check.compliant && m.fits ? 0 : 1);
