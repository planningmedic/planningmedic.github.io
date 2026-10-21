/* ═══ BANC — BUDGET DES SOUHAITS DE SEMAINE (21/10/2026) ═════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Un souhait de lundi, mardi ou mercredi est accordé dans la limite d'un
   budget (≈ 10 pour un temps plein : sa part, moins ses jeudis, samedis,
   week-ends et veilles de férié). Le générateur comparait ce budget au TOTAL
   des gardes déjà posées : les jeudis et week-ends souhaités, accordés tôt dans
   l'année, vidaient le budget, et les souhaits de semaine suivants étaient
   refusés alors qu'ils ne gênaient personne. Constaté sur les vraies demandes
   2027 (un MAR : 4 souhaits de semaine sur 10, budget épuisé dès avril).

   LA RÈGLE. Seules les gardes de lundi-mardi-mercredi entament ce budget. Les
   jours rares restent limités par leur propre part (banc_souhaits_rares.js).

   Effectif synthétique uniquement (simulateur/) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027, MAR = 'GARNIER';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
/* Début d'année : 5 jeudis et 1 week-end souhaités (dans sa part). */
const JEUDIS = ['2027-01-14', '2027-02-11', '2027-03-11', '2027-04-08', '2027-04-29'];
const VEND = ['2027-02-26'];
/* Ensuite : 8 souhaits de semaine, espacés, sans conflit avec un collègue. */
const SEMAINE = ['2027-05-11', '2027-06-08', '2027-07-06', '2027-08-31', '2027-09-21', '2027-10-12', '2027-11-09', '2027-11-30'];
function essai(src) {
  const roster = H.defaultRoster(); const map = { [MAR]: {} };
  JEUDIS.concat(VEND, SEMAINE).forEach(d => { map[MAR][d] = 'SOUHAIT'; });
  const mk = () => H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ss = mk(); const ctx = H.buildContext(ss, [], src); ctx.generateGardes(YEAR);
  const row = ss.getSheetByName(`GARDES_${YEAR}`)._rows.find(r => r[0] === MAR);
  const d0 = ctx.getPremierJourPlanning(YEAR); const de = {};
  for (let c = 1; c < row.length; c++) { const d = new Date(d0.getTime() + (c - 1) * 86400000);
    de[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = String(row[c] || ''); }
  const dry = H.buildContext(mk(), [], src).generateGardes(YEAR, { dryRun: true });
  const g = d => de[d] === 'G' || de[d] === 'G2';
  return { sem: SEMAINE.filter(g), jeu: JEUDIS.filter(g), vd: VEND.filter(g), dry };
}
console.log('\n═══ 1. Jeudis et week-end accordés en début d\'année ═══');
const r = essai(SRC);
V('les jeudis souhaités sont accordés (dans sa part)', r.jeu.length >= 4, r.jeu);
V('le week-end souhaité est accordé', r.vd.length === 1, r.vd);
console.log('\n═══ 2. Les souhaits de semaine suivants ne sont plus refusés ═══');
V('au moins 7 souhaits de semaine sur 8 accordés', r.sem.length >= 7, r.sem);
console.log('\n═══ 3. L\'équité ne bouge pas ═══');
const NEUF0 = 'cntLibre(m)<freeBudget[m]';
const av0 = essai(SRC.split(NEUF0).join('cnt[m].total<freeBudget[m]'));
const e = r.dry.ecarts || {}, e0 = av0.dry.ecarts || {};
V('aucun axe d\'équité plus mauvais qu\'avant le correctif', Object.keys(e0).every(k => (e[k] || {}).ecart <= e0[k].ecart), { avant: e0, apres: e });
V('écart du total ≤ 1', (e.total || {}).ecart <= 1, e.total);
V('aucun jour sans binôme', r.dry.sansBinome === 0, r.dry.sansBinome);
console.log('\n═══ 4. Contre-épreuve : l\'ancien test (total des gardes) refusait ces souhaits ═══');
const NEUF = 'cntLibre(m)<freeBudget[m]';
V('le correctif est dans le code (2 endroits)', SRC.split(NEUF).length === 3);
const av = essai(SRC.split(NEUF).join('cnt[m].total<freeBudget[m]'));
V('sans le correctif, moins de souhaits de semaine accordés', av.sem.length < r.sem.length, [av.sem.length, r.sem.length]);
console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
