/* ═══ BANC — SOUHAITS RARES ÉTALÉS, JOKER BIEN CHOISI (23/10/2026) ════════
   POURQUOI CE SCÉNARIO EXISTE.
   La passe des souhaits parcourait l'année dans l'ordre des dates. Un MAR qui
   demandait plus de jeudis que sa part obtenait les premiers, de janvier au
   printemps, puis plus rien (vraies demandes 2027 : 13 jeudis pour une part de
   6 → les 6 de janvier à juin, aucun ensuite). Et le joker férié partait sur
   le premier férié demandé, même quand un férié plus loin couvrait deux jours.

   LA RÈGLE. Pour chaque MAR, les demandes prioritaires sont désignées
   d'avance : jeudis, samedis, week-ends au-delà de la part → réparties sur
   toute l'année ; fériés → l'unité qui compte le plus de jours demandés. Une
   première passe honore ces demandes, une seconde le reste comme avant.

   Effectif synthétique uniquement (simulateur/) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027, JEUDISTE = 'GARNIER', FERIE = 'DURAND';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const p2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
/* Un jeudi ordinaire sur deux, toute l'année : bien plus que la part (≈ 5). On
   évite les jeudis fériés et veilles de férié, qui relèvent du joker. */
const EXCLUS = new Set(['2027-05-06', '2027-08-12', '2027-11-18', '2027-12-30', '2027-05-27']);
const JEUDIS = [];
for (let d = new Date('2027-01-07T12:00:00'), i = 0; d.getFullYear() === 2027; d = new Date(d.getTime() + 7 * 864e5), i++)
  if (i % 2 === 0 && !EXCLUS.has(iso(d))) JEUDIS.push(iso(d));
/* Joker : le mercredi 27/01 (férié seul) et la Toussaint, samedi 30/10 + lundi 01/11. */
const FERIES = ['2027-01-27', '2027-10-30', '2027-11-01'];

function essai(src) {
  const roster = H.defaultRoster(); const map = { [JEUDISTE]: {}, [FERIE]: {} };
  JEUDIS.forEach(d => { map[JEUDISTE][d] = 'SOUHAIT'; });
  FERIES.forEach(d => { map[FERIE][d] = 'SOUHAIT'; });
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, [], src);
  const dry = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 });
  ctx.generateGardes(YEAR, { tirage: 1 });
  const g = ss.getSheetByName(`GARDES_${YEAR}`)._rows, d0 = ctx.getPremierJourPlanning(YEAR);
  const garde = (id, ds) => { const r = g.find(x => x[0] === id);
    const i = Math.round((new Date(ds + 'T12:00:00') - new Date(iso(d0) + 'T12:00:00')) / 864e5) + 1;
    return r[i] === 'G' || r[i] === 'G2'; };
  const jeu = JEUDIS.filter(d => garde(JEUDISTE, d));
  return { jeu, s1: jeu.filter(d => d < '2027-07-01').length, s2: jeu.filter(d => d >= '2027-07-01').length,
           fer: FERIES.filter(d => garde(FERIE, d)), part: dry.cibles[JEUDISTE].jeu, dry };
}

const r = essai(SRC);
console.log(`   ${JEUDIS.length} jeudis demandés, part ${r.part.toFixed(2)} → obtenus ${r.jeu.join(' ')}`);
console.log('\n═══ 1. Les jeudis demandés au-delà de la part sont étalés sur l\'année ═══');
V('autant de jeudis demandés obtenus que la part (à 1 près)', r.jeu.length >= Math.floor(r.part) - 1, r.jeu);
V('des jeudis obtenus au 1er ET au 2e semestre', r.s1 >= 2 && r.s2 >= 2, { s1: r.s1, s2: r.s2 });
V('le dernier trimestre n\'est pas vide', r.jeu.some(d => d >= '2027-10-01'), r.jeu);

console.log('\n═══ 2. Le joker férié va à la Toussaint (2 jours), pas au 27/01 ═══');
console.log(`   obtenus : ${r.fer.join(' ') || 'aucun'}`);
V('samedi 30/10 et lundi 01/11 accordés ensemble', r.fer.indexOf('2027-10-30') >= 0 && r.fer.indexOf('2027-11-01') >= 0, r.fer);

console.log('\n═══ 3. L\'équité et la couverture ne bougent pas ═══');
const e = r.dry.ecarts || {};
V('aucun jour sans binôme', r.dry.sansBinome === 0, r.dry.sansBinome);
V('écart ≤ 1 sur le total, les samedis, les jeudis et les week-ends',
  ['total', 'sam', 'jeu', 'vd'].every(k => !e[k] || e[k].ecart <= 1), e);

console.log('\n═══ 4. Contre-épreuve : la version précédente servait les premiers ═══');
let ancien = null;
try { ancien = execSync('git show HEAD:gas/generateur_gardes.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64e6 }); } catch (err) {}
if (ancien && ancien.indexOf('_prioRare') < 0) {
  const r0 = essai(ancien);
  console.log(`   avant : ${r0.jeu.join(' ')} · fériés ${r0.fer.join(' ') || 'aucun'}`);
  V('avant : moins de jeudis obtenus au 2e semestre', r0.s2 < r.s2, { avant: r0.s2, apres: r.s2 });
  V('avant : le joker partait sur le 27/01', r0.fer.indexOf('2027-01-27') >= 0 && r0.fer.indexOf('2027-11-01') < 0, r0.fer);
} else console.log('   (historique indisponible ou déjà à jour : contre-épreuve sautée)');

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
