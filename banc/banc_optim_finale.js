/* ═══ BANC — OPTIMISATION FINALE PAR RECUIT SIMULÉ (09/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Le 09/11/2026, sur les indispos réelles 2027 : aucun des 200 ordres de départ
   ne battait le planning retenu sur tous les critères, mais une recherche
   locale partant de lui (centaines de milliers de transferts et d'échanges,
   contrôlés par canHold) donnait 10 souhaits de plus, 6 écarts d'une garde de
   moins, 0 « garde, repos, garde » au lieu de 1, 11 gardes de confort de plus,
   sans recul. Barème fixé par le responsable (OPTIM_POIDS).

   CE QUE CES VÉRIFICATIONS TIENNENT (effectif fictif, simulateur/demographie.js,
   60 000 essais au lieu de 400 000 pour la durée du banc).
   1. Rien ne recule : écarts, souhaits, week-ends coupés, garde-repos-garde,
      doubles week-ends, confort ; pire écart ≤ 1 ; aucune nuit sans binôme ;
      aucune règle dure de plus enfreinte (contrôle indépendant du simulateur).
   2. Le calcul à blanc annonce exactement le planning écrit.
   3. Le garde-fou tient : avec un barème absurde (qui récompense les souhaits
      refusés), le planning écrit ne perd aucun souhait.
   4. Le choix du tirage se fait sans l'optimisation (opts.selection).
   5. Contre-preuve : sans la passe, le planning est moins bon.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
process.env.BANC_MULTI_DEPART = '1';
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027, ITERS = 60000;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
V('la passe d\'optimisation finale est présente', /8sexies\. \(09\/11\/2026\) OPTIMISATION FINALE/.test(SRC));
V('graine et nombre d\'essais fixes dans le code (le calcul à blanc = la génération)', /const OPTIM_ITERS\s*=\s*\d+;/.test(SRC) && /const OPTIM_GRAINE\s*=\s*\d+;/.test(SRC));

function monde(k) {
  const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  const im = D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true });
  return { roster, im };
}
function lancer(w, iters, src) {
  const mk = () => h.makeSpreadsheet([
    h.makeSheet('MEDECINS', h.medecinsRows(w.roster)),
    h.makeSheet(`INDISPOS_${YEAR}`, h.indisposRows(YEAR, w.roster, w.im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const c0 = h.buildContext(mk(), [], src || SRC); c0.__BANC_OPTIM_ITERS__ = iters;
  const r = c0.generateGardes(YEAR, { dryRun: true, tirage: 1 });
  const ss = mk(); const c1 = h.buildContext(ss, [], src || SRC); c1.__BANC_OPTIM_ITERS__ = iters;
  c1.generateGardes(YEAR, { tirage: 1 });
  const feries = new Set([...c1.getJoursFeries(YEAR), ...c1.getJoursFeries(YEAR + 1)]);
  const P = A.parsePlanning(ss, YEAR);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: feries, roster: w.roster });
  const sel = c0.generateGardes(YEAR, { dryRun: true, tirage: 1, selection: true });
  return { r, ss, inv, sel };
}
/* Souhaits honorés, relus sur l'onglet écrit (indépendant du générateur). */
function souhaitsEcrits(ss, im) {
  const rows = ss.getSheetByName('GARDES_' + YEAR)._rows, ent = rows[2], mois = rows[0];
  const MO = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7, 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = YEAR, prev = 0; const dates = [];
  for (let c = 1; c < ent.length; c++) { const lm = String(mois[c] || '').trim().split(' ')[0];
    if (MO[lm]) { if (prev && MO[lm] < prev) an++; m = MO[lm]; prev = MO[lm]; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10); dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null); }
  let n = 0;
  for (let i = 3; i < rows.length; i++) { const id = rows[i][0]; if (!id) continue;
    dates.forEach((d, k) => { const v = String(rows[i][k + 1] || '').trim(); if (d && (v === 'G' || v === 'G2') && (im[id] || {})[d] === 'SOUHAIT') n++; }); }
  return n;
}
const CR = ['n2', 'n1', 'sh', 'split', 'j2', 'dwe', 'conf'];
const recul = (a, b) => CR.filter(k => (k === 'sh' || k === 'conf') ? b[k] < a[k] : b[k] > a[k]);

console.log('\n═══ 1-2. Rien ne recule, et le calcul à blanc annonce le planning écrit ═══');
let ameliore = 0, okRecul = true, okInv = true, okBlanc = true, okPire = true, okSel = true; const det = [];
for (const k of [1, 2, 3, 8]) {
  const w = monde(k), N = lancer(w, ITERS), Z = lancer(w, 0);
  const o = N.r.optim;
  if (!o) { okRecul = false; det.push(k + ' pas de bilan'); continue; }
  const rec = recul(o.avant, o.apres); if (rec.length) { okRecul = false; det.push(k + ' recule ' + rec); }
  if (JSON.stringify(o.apres) !== JSON.stringify(o.avant)) ameliore++;
  if (o.apres.pire > Math.max(1, o.avant.pire) || o.apres.n2 > o.avant.n2 || N.r.sansBinome !== 0) { okPire = false; det.push(k + ' pire/binôme'); }
  if (N.inv.errs.length > Z.inv.errs.length) { okInv = false; det.push(k + ' règles ' + N.inv.errs.slice(0, 3)); }
  const lu = souhaitsEcrits(N.ss, w.im), annonce = Object.values(N.r.souhaits).reduce((t, x) => t + x.honores, 0);
  if (lu !== annonce) { okBlanc = false; det.push(k + ' souhaits écrits ' + lu + ' / annoncés ' + annonce); }
  if (souhaitsEcrits(N.ss, w.im) < souhaitsEcrits(Z.ss, w.im)) { okRecul = false; det.push(k + ' moins de souhaits que sans la passe'); }
  if (N.sel.optim !== null) { okSel = false; det.push(k + ' optimisation pendant le choix du tirage'); }
}
V('aucun critère ne recule, sur 4 années fictives', okRecul, det);
V('équité principale jamais dégradée (pire écart, gardes au-delà d\'une d\'écart) et aucune nuit sans binôme', okPire, det);
V('aucune règle dure de plus enfreinte qu\'un générateur sans la passe', okInv, det);
V('les souhaits relus dans l\'onglet écrit = ceux qu\'annonce le calcul à blanc', okBlanc, det);
V('le choix du tirage se fait sans l\'optimisation', okSel, det);
V('contre-preuve : la passe améliore effectivement au moins 3 années sur 4', ameliore >= 3, ameliore);

console.log('\n═══ 3. Le garde-fou tient, même avec un barème absurde ═══');
{ const ABSURDE = SRC.replace(/const OPTIM_POIDS\s*=\s*\{[^}]*\};/, 'const OPTIM_POIDS = { ecart:0, souhait:-5, split:0, j2:0, dwe:0, couple:0, confort:0 };');
  V('barème absurde injecté (il récompense les souhaits refusés)', ABSURDE !== SRC);
  const w = monde(8), N = lancer(w, ITERS, ABSURDE), Z = lancer(w, 0, ABSURDE);
  const o = N.r.optim;
  V('le planning écrit ne perd aucun souhait malgré le barème', o && o.apres.sh >= o.avant.sh && souhaitsEcrits(N.ss, w.im) >= souhaitsEcrits(Z.ss, w.im), o);
  V('et rien d\'autre ne recule', o && recul(o.avant, o.apres).length === 0, o); }

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
