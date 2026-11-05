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

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
