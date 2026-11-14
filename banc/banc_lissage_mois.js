/* ═══ BANC — LISSAGE MENSUEL DES GARDES (14/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Demande du responsable : éviter les mois à 6 gardes et d'autres à 0, sans
   dégrader le reste. Constaté sur l'essai 2027 : un MAR à 7 gardes en octobre,
   19 mois à 5 gardes, l'année étant juste par ailleurs.

   CE QUE LE GÉNÉRATEUR 2026-11-14.1 FAIT (étape 8decies).
   Il échange deux créneaux de MÊME NATURE (même rôle, même apport à tous les
   compteurs, même week-end d'été) entre deux MAR, quand cela rapproche chacun,
   mois par mois, de ce qu'il doit attendre (sa part × ses jours présents du
   mois). Aucun compteur ne bouge : seuls les mois changent.

   CONTRE-PREUVE : le même générateur, lissage coupé (__BANC_LISSAGE__ = false).
   Effectif et absences fictifs (simulateur/) : aucun nom réel. */
const path = require('path'), fs = require('fs');
const RACINE = path.join(__dirname, '..');
const h = require(path.join(RACINE, 'simulateur', 'harness.js'));
const D = require(path.join(RACINE, 'simulateur', 'demographie.js'));
const A = require(path.join(RACINE, 'simulateur', 'analyse.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 260) : '')); } };
const YEAR = 2027, ITERS = 60000;
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');
const feuilles = (w) => [
  h.makeSheet('MEDECINS', h.medecinsRows(w.roster)),
  h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, w.roster, w.im)),
  h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
  h.makeSheet('CONFIG', [['CLE', 'VALEUR']])];

console.log('\n═══ 0. Le code ═══');
V('le lissage est présent, allumé en production, et le banc peut le couper',
  /function _lissageOn_\(\)\{ return \(typeof __BANC_LISSAGE__ === 'boolean'\) \? __BANC_LISSAGE__ : true; \}/.test(SRC));
V('il n\'échange que des créneaux de même nature (rôle, apport à chaque compteur, été, durée)',
  /const _sig = sl => sl\.role \+ '\|' \+ sl\._c\.join\(','\) \+ '\|' \+ sl\._ete \+ '\|' \+ sl\.days\.length;/.test(SRC));
V('jamais un souhait, une fête, un vendredi ou dimanche seul, un créneau verrouillé ; règles dures vérifiées',
  /!sl\.locked && !_fixeP\(sl\)/.test(SRC) && /_souhP\(A, s1\)/.test(SRC) && /_souhP\(B, s2\)/.test(SRC) && /_possible\(A, B, s1, s2\)\) best = \{ d, A, B, s1, s2 \}/.test(SRC));

function monde(k) { const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  return { roster, im: D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true }) }; }
function passer(w, allume) {
  const prep = () => { const ss = h.makeSpreadsheet(feuilles(w)); const ctx = h.buildContext(ss, [], SRC);
    ctx.__BANC_OPTIM_ITERS__ = ITERS; ctx.__BANC_LISSAGE__ = allume; return { ss, ctx }; };
  const a = prep(); let r;
  try { r = a.ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); } catch (e) { return { err: e.message }; }
  const b = prep(); try { b.ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { return { err: e.message }; }
  const P = A.parsePlanning(b.ss, YEAR);
  const fer = new Set([...b.ctx.getJoursFeries(YEAR), ...b.ctx.getJoursFeries(YEAR + 1)]);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: fer, roster: w.roster });
  /* mois relus sur le planning écrit, indépendamment du générateur */
  let m5 = 0, m6 = 0, grg = 0; const parMois = {};
  Object.keys(P.byDoc).forEach(id => { const g = Object.keys(P.byDoc[id]).filter(d => d.slice(0, 4) === String(YEAR) && (P.byDoc[id][d] === 'G' || P.byDoc[id][d] === 'G2')).sort();
    const c = {}; g.forEach(d => { const mo = d.slice(5, 7); c[mo] = (c[mo] || 0) + 1; const d2 = A.addD(d, 2); if (A.DOW(d) !== 5 && (P.byDoc[id][d2] === 'G' || P.byDoc[id][d2] === 'G2')) grg++; });
    Object.values(c).forEach(n => { if (n >= 5) m5++; if (n >= 6) m6++; }); parMois[id] = c; });
  const souhaits = Object.values(r.souhaits || {}).reduce((t, x) => t + (x.honores || 0), 0);
  return { r, m5, m6, grg, inv: inv.errs, souhaits, lis: (r.optim || {}).lissageMois, compteurs: JSON.stringify(Object.keys(r.compteurs).sort().map(id => { const c = Object.assign({}, r.compteurs[id]); delete c.g; delete c.g2; return [id, c]; })), reaMat: Math.max(...Object.values(r.compteurs).map(c => Math.abs((c.g || 0) - (c.g2 || 0)))), sansBinome: r.sansBinome, h18: (r.h18Vendredi || {}).conformes };
}
console.log('\n═══ 1. Trois campagnes fictives, lissage allumé puis coupé ═══');
const W = [monde(1), monde(2), monde(3)];
const ON = W.map(w => passer(w, true)), OFF = W.map(w => passer(w, false));
V('les campagnes se génèrent dans les deux réglages', ON.concat(OFF).every(x => !x.err), ON.concat(OFF).map(x => x.err));
if (ON.concat(OFF).every(x => !x.err)) {
  console.log('    mois à 5 gardes ou plus : ' + ON.map(x => x.m5) + ' contre ' + OFF.map(x => x.m5) + ' sans lissage');
  V('aucun compteur d\'équité ne bouge : mêmes compteurs pour chaque MAR, sur chaque axe', ON.every((x, i) => x.compteurs === OFF[i].compteurs));
  /* réa / maternité : l'inversion des rôles (8octies), qui vient après, repart d'un planning
     différent ; on vérifie que l'écart réa − maternité de chacun ne se creuse pas */
  V('réa / maternité : le pire écart d\'un MAR ne se creuse pas', ON.every((x, i) => x.reaMat <= Math.max(1, OFF[i].reaMat)), ON.map((x, i) => [x.reaMat, OFF[i].reaMat]));
  V('mêmes souhaits accordés', ON.every((x, i) => x.souhaits === OFF[i].souhaits), ON.map((x, i) => [x.souhaits, OFF[i].souhaits]));
  V('le bilan rend le lissage, et son score baisse sur chaque campagne', ON.every(x => x.lis && x.lis.apres.score < x.lis.avant.score), ON.map(x => x.lis && [x.lis.avant.score, x.lis.apres.score]));
  V('jamais plus de mois à 5 gardes ou plus, relus sur le planning écrit', ON.every((x, i) => x.m5 <= OFF[i].m5), ON.map((x, i) => [x.m5, OFF[i].m5]));
  V('moins de mois à 5 gardes ou plus au total (sinon ce scénario ne prouve rien)', ON.reduce((t, x) => t + x.m5, 0) < OFF.reduce((t, x) => t + x.m5, 0), [ON.map(x => x.m5), OFF.map(x => x.m5)]);
  V('lissage coupé : le bilan n\'en rend aucun (la contre-preuve coupe bien)', OFF.every(x => !x.lis));
  console.log('\n═══ 2. Rien d\'autre ne recule ═══');
  V('aucune nuit sans binôme', ON.every(x => x.sansBinome === 0), ON.map(x => x.sansBinome));
  V('aucune règle de plus enfreinte (contrôle indépendant du simulateur)', ON.every((x, i) => x.inv.length <= OFF[i].inv.length), ON.map((x, i) => [x.inv.length, OFF[i].inv.length]));
  V('aucune « garde, repos, garde » de plus', ON.every((x, i) => x.grg <= OFF[i].grg), ON.map((x, i) => [x.grg, OFF[i].grg]));
  V('le calcul tient dans 15 s', ON.every(x => x.lis.ms < 15500), ON.map(x => x.lis.ms));
}
console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
