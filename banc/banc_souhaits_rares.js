/* ═══ BANC — SOUHAITS SUR LES JOURS RARES (10/10/2026) ═══════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Jusqu'ici, un MAR n'avait droit qu'à UNE demande honorée par an sur
   l'ensemble des jours rares (samedi, week-end, férié, veille de férié).
   Mesuré sur les vraies demandes 2027 : un MAR qui demandait 17 samedis et
   week-ends en obtenait 3, alors que la plupart tenaient dans sa propre part
   (6 samedis, 6 week-ends dans l'année). Le responsable a jugé ce taux
   inacceptable.

   LA RÈGLE, DÉSORMAIS.
   - Samedis et week-ends : honorés tant qu'ils restent dans la part du MAR
     sur l'axe concerné (déjà vérifié par okSouhaitRare). Plus de « joker ».
   - Fériés et veilles de férié : toujours UNE seule demande par an. Ces axes
     n'offrent qu'environ 0,5 date par personne : sans le joker, l'équité y
     décroche (mesuré le 25/08/2026).
   - Seules les demandes HONORÉES par la passe des souhaits sont verrouillées
     face à l'optimiseur. Avant, toute garde tombant sur un jour souhaité
     l'était, même posée plus tard par le placement chronologique : le
     rééquilibrage ne pouvait plus la déplacer.

   Effectif synthétique uniquement (simulateur/) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const MAR = 'GARNIER';                       // temps plein du roster synthétique
/* Quatre samedis bien espacés et deux week-ends (par le vendredi) : tout tient
   dans la part d'un temps plein (≈ 5 samedis, ≈ 5 week-ends dans ce roster).
   Un samedi de plus que la part serait refusé — c'est voulu, la section 1bis
   le vérifie. */
const SAMEDIS = ['2027-01-30', '2027-03-13', '2027-05-22', '2027-09-18'];
const EN_TROP = ['2027-10-16', '2027-11-23', '2027-11-27', '2027-12-11'];
const VENDREDIS = ['2027-02-12', '2027-06-11'];
const FERIES = ['2027-01-27', '2027-12-08'];   // deux mercredis fériés : un seul doit passer

function essai(map, genSource) {
  const roster = H.defaultRoster();
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ]);
  const ctx = H.buildContext(ss, [], genSource);
  ctx.generateGardes(YEAR);
  const g = ss.getSheetByName(`GARDES_${YEAR}`)._rows;
  const row = g.find(r => r[0] === MAR);
  const d0 = ctx.getPremierJourPlanning(YEAR);
  const de = {};
  for (let c = 1; c < row.length; c++) {
    const d = new Date(d0.getTime() + (c - 1) * 86400000);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    de[ds] = String(row[c] || '');
  }
  const dry = H.buildContext(H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ]), [], genSource).generateGardes(YEAR, { dryRun: true });
  return { de, dry };
}
const deGarde = (r, d) => r.de[d] === 'G' || r.de[d] === 'G2';

const souhaits = { [MAR]: {} };
SAMEDIS.concat(VENDREDIS, FERIES).forEach(d => { souhaits[MAR][d] = 'SOUHAIT'; });

/* ═══ 1. Samedis et week-ends dans sa part : honorés ═══════════════════ */
console.log('\n═══ 1. Samedis et week-ends demandés dans sa part : tous honorés ═══');
const r = essai(souhaits);
const samOk = SAMEDIS.filter(d => deGarde(r, d));
V('les 4 samedis demandés sont de garde', samOk.length === SAMEDIS.length, { obtenus: samOk });
VENDREDIS.forEach(d => {
  const dim = new Date(new Date(d + 'T12:00:00').getTime() + 2 * 86400000).toISOString().slice(0, 10);
  V('le week-end du ' + d + ' est entier (vendredi et dimanche)', deGarde(r, d) && deGarde(r, dim), { ven: r.de[d], dim: r.de[dim] });
});

/* ═══ 1bis. Au-delà de sa part : refusé ═══════════════════════════════ */
console.log('\n═══ 1bis. Des samedis au-delà de sa part : le surplus est refusé ═══');
const trop = { [MAR]: {} };
SAMEDIS.concat(EN_TROP.filter(d => new Date(d + 'T12:00:00').getDay() === 6)).forEach(d => { trop[MAR][d] = 'SOUHAIT'; });
const rt = essai(trop);
const cibleSam = rt.dry.cibles[MAR].sam, samObt = rt.dry.compteurs[MAR].sam;
V('ses samedis ne dépassent pas sa part (' + samObt + ' pour une part de ' + cibleSam + ')', samObt <= Math.ceil(cibleSam), { samObt, cibleSam });

/* ═══ 2. Fériés : le joker annuel tient toujours ═══════════════════════ */
console.log('\n═══ 2. Fériés et veilles de férié : une seule demande par an ═══');
const ferOk = FERIES.filter(d => deGarde(r, d));
V('un seul des deux fériés demandés est honoré', ferOk.length <= 1, { obtenus: ferOk });

/* ═══ 3. L'équité ne bouge pas ════════════════════════════════════════ */
console.log('\n═══ 3. Équité tenue ═══');
const pire = Math.max(...Object.values(r.dry.ecarts).map(e => e.ecart));
V('aucun MAR à plus de 2 gardes de sa cible, tous types confondus', pire <= 2, r.dry.ecarts);
V('l\'année est entièrement pourvue', r.dry.sansBinome === 0, r.dry.sansBinome);

/* ═══ 4. Contre-preuve : l'ancien générateur n'en honorait qu'un ══════ */
console.log('\n═══ 4. Contre-preuve sur le générateur d\'avant ═══');
let ancien = null;
try {
  ancien = execSync('git show 0a6e15b:gas/generateur_gardes.gs',
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { ancien = null; }
if (ancien) {
  const r0 = essai(souhaits, ancien);
  const n0 = SAMEDIS.filter(d => deGarde(r0, d)).length;
  V('l\'ancien générateur honorait moins de samedis demandés (' + n0 + ' contre ' + samOk.length + ')', n0 < samOk.length, { avant: n0, apres: samOk.length });
} else {
  V('contre-preuve sautée (historique git indisponible ici)', true);
}

/* ═══ 5. Contrat de code ══════════════════════════════════════════════ */
console.log('\n═══ 5. Contrat de code ═══');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
V('le joker ne porte plus que sur férié et veille de férié',
  /if\(\(_c\.vjf>0\|\|_c\.ferie>0\|\|_c\.jf>0\)&&souhaitRare\[m\]>=SOUHAIT_QUOTA_RARE\) return false;/.test(src));
V('le verrou de l\'optimiseur ne porte que sur les souhaits honorés',
  /days_\.some\(dd=>_slotSouhait\.has\(dd\+'\|'\+holder\)\)/.test(src));
V('la version du fichier a été montée',
  (src.match(/GAS_VERSION_GENERATEUR = '(\d{4}-\d{2}-\d{2})\.\d+'/) || [, ''])[1] >= '2026-10-10');

console.log('\n' + ok + ' ✓   ' + ko + ' ✗');
if (ko) process.exit(1);
