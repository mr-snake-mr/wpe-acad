#!/usr/bin/env node
/* Headless planner — the same engine the AutoCAD front end calls.
 *
 *   node cli/wpe-plan.js drawing.dxf --jph 60 --out plan.dxf --csv plan.csv
 *   node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 --csv plan.csv
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

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.indexOf('--' + name) >= 0;

const dxfInput = argv.find((a) => !a.startsWith('--') && a.toLowerCase().endsWith('.dxf')) || '';
const blocksFile = opt('blocks', '');
if (!dxfInput && !blocksFile) {
  console.error('usage: node cli/wpe-plan.js <drawing.dxf> [--jph 60] [--objective flow|compact]');
  console.error('       node cli/wpe-plan.js --blocks blocks.csv --hall 24000x13000 [--csv plan.csv]');
  process.exit(2);
}

const jph = parseFloat(opt('jph', '60'));
const objective = opt('objective', 'flow') === 'compact' ? 'compact' : 'flow';
const mode = opt('mode', 'single') === 'dual' ? 'dual' : 'single';
const csvOut = opt('csv', '');
const reportPath = opt('report', '');
const asJson = flag('json');
const label = path.basename(dxfInput || blocksFile);

/* ---------- 1. read the source ---------- */
let inserts = [];
let parsed = null;
let hallW = 0;
let hallH = 0;
let units = null;

if (blocksFile) {
  const lines = fs.readFileSync(blocksFile, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  lines.forEach((line, i) => {
    const c = line.split(',');
    if (i === 0 && /name/i.test(c[0])) return;
    const name = (c[0] || '').trim();
    const x = parseFloat(c[1]);
    const y = parseFloat(c[2]);
    if (name && isFinite(x) && isFinite(y)) inserts.push({ name: name, x: x, y: y });
  });
  const dims = String(opt('hall', '')).toLowerCase().split('x').map((v) => parseFloat(v));
  if (!isFinite(dims[0]) || !isFinite(dims[1])) {
    console.error('--hall WxH is required with --blocks, e.g. --hall 24000x13000');
    process.exit(2);
  }
  hallW = dims[0];
  hallH = dims[1];
} else {
  try {
    parsed = WPE.Importer.parse(fs.readFileSync(dxfInput, 'utf8'));
  } catch (err) {
    console.error('could not read ' + dxfInput + ': ' + err.message);
    process.exit(2);
  }
  if (!parsed.ok) {
    console.error('parse failed: ' + parsed.error);
    process.exit(2);
  }
  inserts = parsed.inserts || [];
  units = parsed.units;
  hallW = Math.round(parsed.bbox.w / 100) * 100;
  hallH = Math.round(parsed.bbox.h / 100) * 100;
}

if (!inserts.length) {
  console.error('no equipment blocks found — nothing to lay out');
  process.exit(2);
}

const rotatedInserts = inserts.filter((it) => Math.abs(((it.rotation || 0) % 360)) > 1).length;
const mapped = WPE.Mapper.toCounts(inserts);
if (mapped.counts.robots === 0) {
  console.error('no robot blocks recognised — check the block naming');
  process.exit(2);
}

/* ---------- 2. plan ---------- */
const state = WPE.Config.cloneState({
  preset: 'custom',
  mode: mode,
  hall: { w: Math.max(4000, hallW), h: Math.max(4000, hallH) },
  rules: WPE.Config.RULES,
  jph: jph,
  activities: WPE.Config.PRESETS.station1.activities,
  counts: mapped.counts,
  countsB: { robots: 0, machine1: 0, machine2: 0 },
  objective: objective
});

const started = Date.now();
const result = WPE.Planner.plan(state);
const ms = Date.now() - started;

/* ---------- 3. write ---------- */
const outPath = opt('out', dxfInput ? dxfInput.replace(/\.dxf$/i, '') + '-plan.dxf' : '');
if (outPath) {
  fs.writeFileSync(outPath, WPE.Exporters.dxf(result.layout, {
    title: 'WPE plan — ' + label,
    jph: jph
  }), 'utf8');
}
if (csvOut) fs.writeFileSync(csvOut, WPE.Exporters.planCsv(result.layout), 'utf8');
if (reportPath) fs.writeFileSync(reportPath, WPE.Exporters.summaryJson(state, result), 'utf8');

/* ---------- 4. summary ---------- */
const m = result.layout.metrics;
const summary = {
  source: label,
  hall: { w: hallW, h: hallH },
  units: units,
  found: mapped.found,
  unknown: mapped.unknown.map((b) => b.name),
  rotatedInserts: rotatedInserts,
  notes: result.notes || [],
  jph: jph,
  status: result.status,
  rules: result.check.passCount + '/' + result.check.rules.length,
  flow_m: +(m.flow / 1000).toFixed(2),
  rows: m.rows,
  footprint_m2: Math.round(m.footprintArea / 1e6),
  alternatives: result.alternatives.length,
  ms: ms,
  dxf: outPath ? path.basename(outPath) : null,
  csv: csvOut ? path.basename(csvOut) : null
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('WPE plan — ' + summary.source);
  console.log('  hall        : ' + (hallW / 1000).toFixed(1) + ' x ' + (hallH / 1000).toFixed(1) + ' m');
  console.log('  found       : ' + JSON.stringify(mapped.found));
  if (mapped.unknown.length) console.log('  unknown     : ' + mapped.unknown.map((b) => b.name).join(', '));
  if (rotatedInserts) console.log('  note        : ' + rotatedInserts + ' block(s) rotated in the drawing; ' +
    'footprints come from the catalogue, not the drawing');
  console.log('  status      : ' + result.status + '   rules ' + summary.rules);
  console.log('  flow        : ' + summary.flow_m + ' m, ' + m.rows + ' row(s), ' +
    summary.footprint_m2 + ' m2 footprint');
  console.log('  candidates  : ' + summary.alternatives + ' in ' + ms + ' ms');
  (result.notes || []).forEach((n) => console.log('  note        : ' + n));
  if (summary.dxf) console.log('  wrote       : ' + summary.dxf);
  if (summary.csv) console.log('  wrote       : ' + summary.csv);
  const meta = {};
  (WPE.Config.RULE_META || []).forEach((r) => { meta[r.id] = r.title; });
  result.check.rules.forEach((r) => {
    console.log('   ' + (r.pass ? 'ok  ' : 'FAIL') + ' ' + r.id + ' ' +
      (meta[r.id] || '') + (r.detail ? ' — ' + r.detail : ''));
  });
}

process.exit(result.status === 'ok' && result.check.compliant ? 0 : 1);
