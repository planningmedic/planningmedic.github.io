/* ═══ BANC — UN SEUL PLANNING PAR GÉNÉRATION DANS LE HARNAIS (05/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE. Le banc complet durait 11 minutes : chaque
   génération sans tirage précisé calculait jusqu'à 8 plannings (multi-départ)
   puis réécrivait le meilleur. Les scénarios de RÈGLE n'ont besoin que d'un
   planning : le harnais fixe donc le tirage n° 1 par défaut. Ce qui ne doit
   JAMAIS arriver :
     · que le raccourci touche un appel qui précise son tirage ;
     · que les scénarios qui vérifient le CHOIX du meilleur planning perdent le
       multi-départ (ils posent BANC_MULTI_DEPART=1).
   Le générateur du dépôt n'est pas modifié : seul le harnais l'est. */
const path = require('path'), fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const YEAR = 2027;
const monde = () => { const roster = H.defaultRoster(); const logs = [];
  const ss = H.makeSpreadsheet([H.makeSheet('MEDECINS', H.medecinsRows(roster)), H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)), H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  return { ss, logs, ctx: H.buildContext(ss, logs) }; };

console.log('\n═══ 1. Par défaut : un seul planning, et il est bien écrit ═══');
const A = monde();
A.ctx.generateGardes(YEAR);
V('aucune recherche multi-départ (pas de « Tirage N : »)', !A.logs.some(l => /^Tirage \d+ :/.test(l)), A.logs.filter(l => /^Tirage/.test(l)).slice(0, 2));
V('l\'onglet des gardes est écrit', !!A.ss.getSheetByName(`GARDES_${YEAR}`));
const GEN = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
V('contre-preuve : le multi-départ écrit bien « Tirage N : » quand il tourne (sinon le test 1 ne prouverait rien)', /Logger\.log\('Tirage ' \+ t \+ ' : '/.test(GEN));

console.log('\n═══ 2. Un tirage précisé n\'est pas touché ═══');
const B = monde();
const r = B.ctx.generateGardes(YEAR, { dryRun: true, tirage: 3 });
const C = monde();
const r1 = C.ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 });
V('le tirage 3 demandé est bien calculé (différent du tirage 1)', JSON.stringify(r.compteurs) !== JSON.stringify(r1.compteurs));

console.log('\n═══ 3. Les scénarios du choix du meilleur planning gardent le multi-départ ═══');
for (const f of ['banc_essai_meme_planning.js', 'banc_essai_generation.js', 'banc_nouvel_algo.js', 'banc_periodes_tendues.js']) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const iEnv = s.indexOf("process.env.BANC_MULTI_DEPART = '1'"), iReq = s.search(/require\(.*harness/);
  V(f + ' : BANC_MULTI_DEPART=1 posé AVANT le chargement du harnais', iEnv >= 0 && iReq > iEnv, { iEnv, iReq });
}

console.log('\n═══ 4. Bilan de la vraie génération = bilan du calcul à blanc (15/11/2026) ═══');
/* Les scénarios lourds lisent le bilan sur la vraie génération (genererAvecBilan)
   au lieu de refaire un calcul à blanc : un calcul au lieu de deux. Cela ne vaut
   que si les deux bilans sont identiques et que la capture n'écrit rien d'autre. */
const sansMs = o => JSON.stringify(o, (k, v) => (k === 'ms' ? undefined : v));
const D = monde();
const rb = H.genererAvecBilan(D.ctx, YEAR, { tirage: 1 });
V('le bilan est capturé sur le générateur du dépôt', !!rb && !!rb.compteurs && !!rb.cibles);
V('… et il est identique à celui du calcul à blanc (tirage 1), durées mises à part', !!rb && sansMs(rb) === sansMs(r1));
const E = monde();
E.ctx.generateGardes(YEAR, { tirage: 1 });
const lignes = x => JSON.stringify(x.ss.getSheetByName(`GARDES_${YEAR}`)._rows);
V('le planning écrit avec capture est identique case pour case à celui d\'une génération ordinaire', !!D.ss.getSheetByName(`GARDES_${YEAR}`) && lignes(D) === lignes(E));
V('la capture est rangée après usage (aucun réglage ne traîne dans le contexte)', D.ctx.__BANC_BILAN__ === null);
{ const F = monde(), autre = GEN.replace('  if(DRY){', '  if (DRY) {');
  const ctxF = H.buildContext(F.ss, F.logs, autre);
  V('contre-preuve : un générateur au texte non reconnu rend null (le scénario sait qu\'il doit refaire le calcul à blanc)', autre !== GEN && H.genererAvecBilan(ctxF, YEAR, { tirage: 1 }) === null); }

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
