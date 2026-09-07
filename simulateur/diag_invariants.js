// ═══ DIAGNOSTIC — d'où viennent les violations d'invariants du générateur ? ═══
// Lecture seule, AUCUN échange appliqué. On génère, on vérifie, et pour chaque
// violation on rassemble le contexte : date, jour, période (Noël ? vacances ?),
// et les avertissements de couverture émis par le générateur ce jour-là.
// Usage : SCEN=0 node simulateur/diag_invariants.js
const H = require('./harness.js'), A = require('./analyse.js'), D = require('./demographie.js');
const SC = +(process.env.SCEN || 0), Y0 = +(process.env.Y0 || 2027), Y1 = +(process.env.Y1 || 2046);
const dow = ds => new Date(ds + 'T12:00:00').getDay();
const JOUR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const addD = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const cas = [];
let prev = null, nAn = 0;
for (let y = Y0; y <= Y1; y++) {
  const roster = D.buildRoster(y, { ageExempt: 60, ageRetraite: 67 });
  const im = D.buildAbsences(y, roster, SC);
  const r = H.runScenario({ year: y, roster, indisposMap: im, statsPrev: prev });
  if (r.error) { prev = null; continue; }
  prev = r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x => x.slice());
  nAn++;
  const fer = new Set([...r.ctx.getJoursFeries(y), ...r.ctx.getJoursFeries(y + 1)]);
  const P = A.parsePlanning(r.ss, y);
  const inv = A.checkInvariants(P, { indisposMap: im, ctxFeries: fer, roster });
  const premier = P.dates[0], dernier = P.dates[P.dates.length - 1];
  // dates citées dans les avertissements de couverture du générateur
  const couv = new Set();
  r.logs.filter(l => /Couverture/.test(l)).forEach(l => (l.match(/\d{4}-\d{2}-\d{2}/g) || []).forEach(d => couv.add(d)));
  const serie = ds => { for (let k = -3; k <= 3; k++) if (couv.has(addD(ds, k))) return true; return false; };

  inv.errs.forEach(e => {
    const dts = (e.match(/\d{4}-\d{2}-\d{2}/g) || []);
    const d0 = dts[0] || '';
    cas.push({
      y, type: e.split(' ')[0] + ' ' + (e.split(' ')[1] || ''), e,
      d0, dow: d0 ? JOUR[dow(d0)] : '',
      ferie: d0 ? fer.has(d0) : false,
      noel: d0 ? (d0.slice(5) >= '12-18' || d0.slice(5) <= '01-06') : false,
      bordDebut: d0 && d0 <= addD(premier, 6),
      bordFin: dts.some(d => d > dernier) || (d0 && d0 >= addD(dernier, -6)),
      horsFenetre: dts.some(d => d < premier || d > dernier),
      tension: d0 ? serie(d0) : false,
    });
  });
}
const par = {};
cas.forEach(c => { par[c.type] = (par[c.type] || 0) + 1; });
console.log(JSON.stringify({ scen: SC, annees: nAn, total: cas.length, parType: par,
  noel: cas.filter(c => c.noel).length, ferie: cas.filter(c => c.ferie).length,
  bordFin: cas.filter(c => c.bordFin).length, bordDebut: cas.filter(c => c.bordDebut).length,
  horsFenetre: cas.filter(c => c.horsFenetre).length, tension: cas.filter(c => c.tension).length,
  exemples: cas.slice(0, 12) }));
