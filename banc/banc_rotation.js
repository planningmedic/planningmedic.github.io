/* ═══ BANC — LA ROTATION D'ÉQUITÉ À PARTIR DE 2028 (15/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Règle du responsable pour les gardes 2028 et suivantes :
   · même fourchette pour tous les MAR d'une même quotité ([arrondi inférieur ;
     arrondi supérieur] de la part exacte), sur chaque compteur ;
   · au plus 1 garde d'écart entre collègues de même part ;
   · le retard cumulé de toutes les années décide seulement qui prend le haut de la
     fourchette (l'été compris) — plus de « dette » qui décale la fourchette ;
   · la part des autres suit le nombre RÉEL de gardes du MAR à régime à part ;
   · Noël et le Jour de l'An sortent des compteurs fins, restent dans le total.
   Mesuré le 15/11/2026 au simulateur (équipe fictive, 2027 → 2040) : 73 écarts de 2
   entre collègues avec le calcul de 2027, 10 avec la rotation.

   CE QUE CE SCÉNARIO VÉRIFIE.
   0. le code : la rotation ne s'allume qu'à partir de 2028, le banc peut la forcer ;
   1. 2027 (déjà publié) se rejoue À L'IDENTIQUE : la rotation n'y touche pas ;
   2. 2028, rotation contre calcul de 2027 (contre-preuve, même monde) : moins d'écarts
      entre collègues, moins de compteurs hors fourchette ;
   3. la somme des parts égale les gardes réellement faites (régime à part compris) ;
   4. les fêtes ne comptent plus dans les fériés, et le total ne bouge pas ;
   5. la mémoire : de deux collègues de même part, celui qui était en retard de samedis
      les années passées n'en a pas moins que celui qui était en avance.

   Effectif et absences fictifs (simulateur/) : aucun nom réel.
   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur.
   Le banc prouve la LOGIQUE : la durée chez Google se mesure à l'essai à blanc. */
const path = require('path'), fs = require('fs');
const RACINE = path.join(__dirname, '..');
const h = require(path.join(RACINE, 'simulateur', 'harness.js'));
const D = require(path.join(RACINE, 'simulateur', 'demographie.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const ITERS = 60000;
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');
const AXES = ['total', 'sam', 'jeu', 'vd', 'vjf', 'jf'];

console.log('\n═══ 0. Le code ═══');
V('la rotation démarre en 2028', /const ROTATION_DEPUIS = 2028;/.test(SRC));
V('elle suit l\'année générée, et le banc peut la forcer',
  /function _rotOn_\(\)\{ return \(typeof __BANC_ROTATION__ === 'boolean'\) \? __BANC_ROTATION__ : rotationEquiteActive_\(_anneeGen_\); \}/.test(SRC)
  && /function rotationEquiteActive_\(year\)\{ return Number\(year\) >= ROTATION_DEPUIS; \}/.test(SRC)
  && /function generateGardes\(year, opts\)\{\n  _anneeGen_ = Number\(year\) \|\| 0;/.test(SRC));
V('les fêtes hors comptage suivent la même date', /function _fetesHorsOn_\(\)\{ return \(typeof __BANC_FETES_HORS__ === 'boolean'\) \? __BANC_FETES_HORS__ : rotationEquiteActive_\(_anneeGen_\); \}/.test(SRC));
V('l\'été entre dans la mémoire de toutes les années (archives comprises)',
  /ete:_h\.indexOf\('PART EXACTE ETE'\)/.test(SRC) && /CUMUL\[id\]\.ete=_hA\(id,'ete'\)/.test(SRC) && /_hEte\[id\] = \(CUMUL\[id\] && CUMUL\[id\]\.ete\) \|\| 0/.test(SRC));
V('plus de report qui décale la fourchette quand la rotation est allumée',
  /dette\[id\]\[k\]=_rotOn_\(\)\?0:DETTE_AMORTI\*/.test(SRC));
V('aucune variable d\'essai oubliée', !/__ROT__|__FETES_HORS__|__APP_MS__|__REP_MS__/.test(SRC.replace(/__BANC_[A-Z_]+__/g, '')));

function monde(y, k) { const roster = D.buildRoster(y, { ageExempt: 60, ageRetraite: 67 });
  return { roster, im: D.buildAbsences(y, roster, k, { souhaitsEtendus: true }) }; }
function feuilles(y, w, autres) { const f = [h.makeSheet('MEDECINS', h.medecinsRows(w.roster)), h.makeSheet('INDISPOS_' + y, h.indisposRows(y, w.roster, w.im)),
  h.makeSheet('PERIODES_VAC', h.periodesRows(y)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])];
  (autres || []).forEach(([n, rows]) => f.push(h.makeSheet(n, rows.map(r => r.slice())))); return f; }
function generer(y, w, autres, forcer, dry, sansChrono) {
  const ss = h.makeSpreadsheet(feuilles(y, w, autres)), logs = [], ctx = h.buildContext(ss, logs, SRC);
  ctx.__BANC_OPTIM_ITERS__ = ITERS; ctx.__BANC_APP_MS__ = sansChrono ? 1e9 : 10000; ctx.__BANC_REP_MS__ = 6000;
  /* sansChrono : la dernière passe s'arrête au chronomètre ; sur une machine chargée (banc en
     parallèle), deux générations identiques peuvent donc différer. Pour comparer, on la laisse finir. */
  if (forcer !== undefined) { ctx.__BANC_ROTATION__ = forcer; ctx.__BANC_FETES_HORS__ = forcer; }
  try { const r = ctx.generateGardes(y, { dryRun: dry, tirage: 1 }); return { r, ss, logs }; } catch (e) { return { err: e.message }; }
}
const mesure = r => {
  const ids = Object.keys(r.cibles).filter(id => r.cibles[id] && r.cibles[id].total > 0 && r.compteurs[id] && r.partExacte[id] && r.partExacte[id].sam !== undefined);
  let hors = 0; ids.forEach(id => AXES.forEach(ax => { const ex = r.partExacte[id][ax], v = r.compteurs[id][ax] || 0; if (ex === undefined) return;
    if (v < Math.floor(ex + 1e-9) || v > Math.ceil(ex - 1e-9)) hors++; }));
  const grp = {}; ids.forEach(id => { const k = AXES.map(ax => (r.partExacte[id][ax] || 0).toFixed(3)).join('|'); (grp[k] = grp[k] || []).push(id); });
  let ecart2 = 0; Object.values(grp).forEach(L => { if (L.length < 2) return; AXES.forEach(ax => { const v = L.map(id => r.compteurs[id][ax] || 0); if (Math.max(...v) - Math.min(...v) > 1) ecart2++; }); });
  return { hors, ecart2, grp }; };

const W27 = monde(2027, 3), W28 = monde(2028, 3);
/* comme en vrai : le MAR à régime à part prend nettement plus que sa part (46 mardis dans ce monde fictif) */
(function mardis(w, y, n) { const P = w.im.PERRIN; if (!P) return; let k = Object.values(P).filter(x => x === 'SOUHAIT').length;
  for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y && k < n; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().slice(0, 10); if (d.getUTCDay() !== 2 || P[ds] === 'SOUHAIT' || /-12-2[4-6]|-12-31/.test(ds)) continue;
    [-1, 0, 1].forEach(j => { const x = new Date(d.getTime() + j * 864e5).toISOString().slice(0, 10); if (P[x] && P[x] !== 'SOUHAIT') delete P[x]; });
    P[ds] = 'SOUHAIT'; k++; } })(W28, 2028, 46);
console.log('\n═══ 1. 2027 se rejoue à l\'identique ═══');
const g27 = generer(2027, W27, [], undefined, false);
V('2027 se génère', !g27.err, g27.err);
const a = generer(2027, W27, [], undefined, true, true), b = generer(2027, W27, [], false, true, true);
V('2027 par défaut = 2027 avec la rotation coupée (mêmes compteurs pour chaque MAR)',
  !a.err && !b.err && JSON.stringify(a.r.compteurs) === JSON.stringify(b.r.compteurs));
V('mêmes parts exactes', !a.err && !b.err && JSON.stringify(a.r.partExacte) === JSON.stringify(b.r.partExacte));

const st27 = g27.ss && g27.ss.getSheetByName('STATS_GARDES_2027');
const mem = st27 ? [['STATS_GARDES_2027', st27._rows]] : [];
V('les statistiques 2027 écrivent l\'été (lu par la mémoire de 2028)', !!st27 && st27._rows[0].indexOf('ETE') >= 0 && st27._rows[0].indexOf('PART EXACTE ETE') >= 0);

console.log('\n═══ 2. 2028 : rotation contre calcul de 2027 ═══');
const on = generer(2028, W28, mem, undefined, true), off = generer(2028, W28, mem, false, true);
V('2028 se génère avec la rotation (par défaut) et sans', !on.err && !off.err, on.err || off.err);
if (!on.err && !off.err) {
  const mOn = mesure(on.r), mOff = mesure(off.r);
  console.log('    écarts de 2 entre collègues : ' + mOff.ecart2 + ' → ' + mOn.ecart2 + ' · compteurs hors fourchette : ' + mOff.hors + ' → ' + mOn.hors);
  V('pas plus d\'écarts de 2 entre collègues qu\'avec le calcul de 2027', mOn.ecart2 <= mOff.ecart2, [mOn.ecart2, mOff.ecart2]);
  V('au plus 2 écarts de 2 entre collègues sur l\'année', mOn.ecart2 <= 2, mOn.ecart2);
  V('moins de compteurs hors fourchette qu\'avec le calcul de 2027', mOn.hors < mOff.hors, [mOn.hors, mOff.hors]);

  console.log('\n═══ 3. La somme des parts = les gardes faites ═══');
  /* le MAR à régime à part fait ses souhaits : on compte ses gardes RÉELLES, et la part des autres */
  const RP = new Set(W28.roster.filter(x => x[3] && x[3].souhaitPlafond).map(x => x[0]));
  const sP = r => Object.keys(r.partExacte).reduce((t, id) => t + (RP.has(id) ? ((r.compteurs[id] || {}).total || 0) : ((r.partExacte[id] && r.partExacte[id].total) || 0)), 0);
  const sC = r => Object.keys(r.compteurs).reduce((t, id) => t + ((r.compteurs[id] && r.compteurs[id].total) || 0), 0);
  console.log('    parts ' + sP(off.r).toFixed(2) + ' → ' + sP(on.r).toFixed(2) + ' · gardes faites ' + sC(on.r));
  V('un MAR à régime à part existe dans ce monde fictif', RP.size === 1, [...RP]);
  V('avec la rotation, gardes réelles du régime à part + parts des autres = gardes faites (à 1 près)', Math.abs(sP(on.r) - sC(on.r)) < 1, [sP(on.r), sC(on.r)]);
  V('contre-preuve : sans elle, le régime à part fausse la somme', Math.abs(sP(off.r) - sC(off.r)) >= 1, [sP(off.r), sC(off.r)]);

  console.log('\n═══ 4. Les fêtes hors des compteurs fins ═══');
  const s = (r, ax) => Object.keys(r.compteurs).reduce((t, id) => t + ((r.compteurs[id] && r.compteurs[id][ax]) || 0), 0);
  V('le total de gardes ne change pas', s(on.r, 'total') === s(off.r, 'total'), [s(on.r, 'total'), s(off.r, 'total')]);
  V('les fériés comptés baissent (Noël n\'y est plus)', s(on.r, 'jf') < s(off.r, 'jf'), [s(on.r, 'jf'), s(off.r, 'jf')]);
  V('Noël 2028 n\'entre plus dans les parts de fériés', Object.keys(on.r.partExacte).reduce((t, id) => t + ((on.r.partExacte[id] || {}).jf || 0), 0)
    < Object.keys(off.r.partExacte).reduce((t, id) => t + ((off.r.partExacte[id] || {}).jf || 0), 0));

  console.log('\n═══ 5. La mémoire décide qui prend le haut ═══');
  /* deux collègues de même part de samedis : l'un en AVANCE de 3 samedis les années passées, l'autre en RETARD de 3 */
  const L = Object.values(mOn.grp).filter(x => x.length >= 2).sort((x, y) => y.length - x.length)[0] || [];
  const ex = L.length ? on.r.partExacte[L[0]].sam : 0;
  const cand = L.filter(id => st27._rows.some(r => r[0] === id));
  if (cand.length >= 2 && Math.ceil(ex - 1e-9) > Math.floor(ex + 1e-9)) {
    const [AV, RE] = cand, rows = st27._rows.map(r => r.slice()), iS = rows[0].indexOf('SAM');
    rows.forEach(r => { if (r[0] === AV) r[iS] = Number(r[iS]) + 3; if (r[0] === RE) r[iS] = Math.max(0, Number(r[iS]) - 3); });
    const m = generer(2028, W28, [['STATS_GARDES_2027', rows]], undefined, true);
    V('2028 se génère avec la mémoire modifiée', !m.err, m.err);
    if (!m.err) { const vA = m.r.compteurs[AV].sam, vR = m.r.compteurs[RE].sam;
      console.log('    part ' + ex.toFixed(2) + ' samedis · en avance : ' + vA + ' · en retard : ' + vR);
      V('celui qui était en retard n\'a pas moins de samedis que celui qui était en avance', vR >= vA, [vR, vA]);
      V('les deux restent dans la fourchette', [vA, vR].every(v => v >= Math.floor(ex + 1e-9) && v <= Math.ceil(ex - 1e-9)), [vA, vR, ex]); }
  } else V('un groupe de même part pour la mémoire existe dans ce monde fictif', false, { L, ex });
}

console.log('\n═══ 6. L\'écran d\'équité compte comme le calcul ═══');
{ const CODE = fs.readFileSync(path.join(RACINE, 'gas', 'code.gs'), 'utf8');
  const ctx = h.buildContext(h.makeSpreadsheet([h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]), [], SRC);
  const F28 = [...ctx.joursFetesHorsComptage_(2028)].sort();
  /* 2028 : 24/12 dimanche (avec le vendredi 22), 25/12 lundi férié (avec le samedi 23),
     31/12 dimanche (avec le vendredi 29), 1er janvier lundi férié (avec le samedi 30) */
  V('les nuits de fêtes 2028 et leurs jours couplés', F28.join(' ') === '2028-12-22 2028-12-23 2028-12-24 2028-12-25 2028-12-29 2028-12-30 2028-12-31 2029-01-01', F28);
  V('bascule : rien en 2027, tout à partir de 2028', ctx.rotationEquiteActive_(2027) === false && ctx.rotationEquiteActive_(2028) === true && ctx.rotationEquiteActive_(2031) === true);
  V('l\'instantané sort les fêtes des compteurs fins à partir de 2028, comme le calcul',
    /const HORS = \(typeof rotationEquiteActive_ === 'function' && rotationEquiteActive_\(year\)\) \? joursFetesHorsComptage_\(year\) : new Set\(\);/.test(CODE)
    && /if \(HORS\.has\(date\)\) \{ if \(NOEL\.has\(date\)\) c\.noelAn\+\+; return; \}/.test(CODE));
  V('…mais les garde dans le total', CODE.indexOf('c.total++;') < CODE.indexOf('if (HORS.has(date))'));
  V('le calcul et l\'écran lisent la même liste de fêtes', /if\(_fetesHorsOn_\(\)\) joursFetesHorsComptage_\(year\)\.forEach/.test(SRC));
}

console.log(`\n${ok} vérifications, ${ko} en échec`);
process.exit(ko ? 1 : 0);
