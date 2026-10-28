/* Map CAD block names to planner roles.
   Deliberately conservative: anything unrecognised is reported, never guessed. */
(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/[_\-./]/g, ' ').replace(/\s+/g, ' ').trim();

  /** resolve one block name to {role, reason} — role is null when unknown */
  function classify(name) {
    const n = norm(name);
    const has = (t) => n.indexOf(t) !== -1;

    if (has('robot') || has('rbt') || has('manipulator')) return { role: 'robot' };
    if (has('controller') || has('cabinet') || has('control panel')) return { role: 'controller' };
    if (has('trolley') || has('cart') || has('stillage') || has('bin'))
      return { role: /(^|\s)2(\s|$)/.test(n) || has('t2') ? 'trolley2' : 'trolley1' };
    if (has('unload') || has('outfeed') || has('exit')) return { role: 'fixture_unload' };
    if (has('load') || has('infeed') || has('entry')) return { role: 'fixture_load' };
    if (has('machine') || has('press') || has('cnc') || has('mill') || has('mach'))
      return { role: /(^|\s)2(\s|$)/.test(n) || has('m2') ? 'machine2' : 'machine1' };
    return { role: null, reason: 'unrecognised name' };
  }

  /** exact-name override first, then the pattern rules */
  function resolve(name, aliases) {
    if (aliases) {
      const key = String(name || '').toLowerCase();
      for (const k in aliases) {
        if (k.charAt(0) === '_') continue;
        if (k.toLowerCase() === key) return { role: aliases[k], reason: 'alias' };
      }
    }
    return classify(name);
  }

  /** counts from block instances; the planner expects one load/unload fixture */
  function toCounts(blocks, aliases) {
    const seen = {};
    const unknown = [];
    blocks.forEach((b) => {
      const c = resolve(b.name, aliases);
      if (!c.role) { unknown.push(b); return; }
      seen[c.role] = (seen[c.role] || 0) + 1;
    });
    return {
      counts: {
        robots: seen.robot || 0,
        machine1: seen.machine1 || 0,
        machine2: seen.machine2 || 0,
        trolley1: seen.trolley1 || 0,
        trolley2: seen.trolley2 || 0
      },
      found: {
        robots: seen.robot || 0,
        controllers: seen.controller || 0,
        machine1: seen.machine1 || 0,
        machine2: seen.machine2 || 0,
        loadFixture: seen.fixture_load || 0,
        unloadFixture: seen.fixture_unload || 0,
        trolley1: seen.trolley1 || 0,
        trolley2: seen.trolley2 || 0
      },
      unknown: unknown
    };
  }

  root.WPE = root.WPE || {};
  root.WPE.Mapper = { classify, resolve, toCounts, norm };
})(typeof globalThis !== 'undefined' ? globalThis : this);
