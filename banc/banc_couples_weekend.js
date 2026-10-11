/* ═══ BANC — COUPLES DE WEEK-END (11/10/2026) ═══════════════════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Un couple de MAR (déjà déclaré « paire à éviter » : jamais la même nuit)
   demande que, quand l'un fait le vendredi-dimanche, l'autre fasse le samedi du
   MÊME week-end : le foyer bloque moins de week-ends. Ligne CONFIG
   COUPLES_WEEKEND = « A+B ». Aucun nom dans le code.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Sans la ligne : planning identique au générateur d'avant (règle inerte).
   2. Avec la ligne : plus de week-ends liés, moins de week-ends bloqués au foyer.
   3. Équité intacte : chacun reste dans sa part de samedis et de week-ends, aucun
      écart au-delà de 2, aucun jour sans binôme.
   4. Règles dures intactes : jamais la même nuit, pas deux week-ends d'affilée,
      pas de jeudi-samedi, jamais de garde sur une absence.
   5. L'essai à blanc affiche le bon nombre de « week-ends en commun ».
   Effectif fictif (simulateur/) ; le vrai générateur est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027, A = 'GARNIER', B = 'LEBRUN';
const ROSTER = H.defaultRoster().filter(r => !r[3].dateDebut && !r[3].dateFin);
const ABS = D.buildAbsences(YEAR, ROSTER, 3);

function generer(avecCle, src) {
  const cfg = [['CLE', 'VALEUR'], ['PAIRES_A_EVITER', A + '+' + B]];
  if (avecCle) cfg.push(['COUPLES_WEEKEND', A + '+' + B]);
  const feuilles = () => [H.makeSheet('MEDECINS', H.medecinsRows(ROSTER)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, ROSTER, ABS)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)), H.makeSheet('CONFIG', cfg.map(l => l.slice()))];
  const dry = H.buildContext(H.makeSpreadsheet(feuilles()), [], src).generateGardes(YEAR, { dryRun: true, tirage: 1 });
  const ss = H.makeSpreadsheet(feuilles());
  const ctx = H.buildContext(ss, [], src);
  ctx.generateGardes(YEAR, { tirage: 1 });
  const rows = ss.getSheetByName(`GARDES_${YEAR}`)._rows;
  const d0 = ctx.getPremierJourPlanning(YEAR);
  const jours = [];
  for (let c = 1; c < rows[0].length; c++) jours.push(new Date(d0.getTime() + (c - 1) * 86400000));
  const de = (id, c) => { const r = rows.find(x => x[0] === id) || []; const v = String(r[c] || ''); return v === 'G' || v === 'G2'; };
  return { dry, rows, jours, de };
}
/* Comptage INDÉPENDANT du code testé, sur le planning écrit. */
function bilan(g) {
  let lies = 0, bloques = 0, nuits = 0;
  const n = g.jours.length;
  for (let c = 1; c <= n; c++) {
    if (g.de(A, c) && g.de(B, c)) nuits++;
    if (g.jours[c - 1].getDay() === 5 && c + 2 <= n) {
      const ta = [c, c + 1, c + 2].some(k => g.de(A, k)), tb = [c, c + 1, c + 2].some(k => g.de(B, k));
      if (ta || tb) bloques++;
      if ((g.de(A, c) && g.de(A, c + 2) && g.de(B, c + 1)) || (g.de(B, c) && g.de(B, c + 2) && g.de(A, c + 1))) lies++;
    }
  }
  return { lies, bloques, nuits };
}

console.log('\n═══ 1. Sans la ligne COUPLES_WEEKEND : rien ne change ═══');
let ancien = null;
try {
  ancien = execSync('git show f672cae:gas/generateur_gardes.gs',
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { ancien = null; }
const sans = generer(false);
if (ancien) {
  const ref = generer(false, ancien);
  V('planning identique, case par case, au générateur d\'avant la règle',
    JSON.stringify(sans.rows) === JSON.stringify(ref.rows));
} else {
  V('contre-preuve sautée (historique git indisponible ici)', true);
}
V('l\'essai à blanc n\'affiche aucun couple', Array.isArray(sans.dry.couplesWE) && sans.dry.couplesWE.length === 0, sans.dry.couplesWE);

console.log('\n═══ 2. Avec la ligne : plus de week-ends en commun ═══');
const avec = generer(true);
const b0 = bilan(sans), b1 = bilan(avec);
console.log('     sans la règle : ' + b0.lies + ' week-ends en commun, ' + b0.bloques + ' bloqués au foyer');
console.log('     avec la règle : ' + b1.lies + ' week-ends en commun, ' + b1.bloques + ' bloqués au foyer');
V('plus de week-ends en commun (' + b0.lies + ' → ' + b1.lies + ')', b1.lies > b0.lies, { b0, b1 });
V('moins de week-ends bloqués au foyer (' + b0.bloques + ' → ' + b1.bloques + ')', b1.bloques < b0.bloques, { b0, b1 });
const cb = (avec.dry.couplesWE || [])[0] || {};
V('l\'essai à blanc dit le même nombre de week-ends en commun que le planning écrit',
  cb.lies === b1.lies && cb.bloques === b1.bloques, { essai: cb, planning: b1 });

console.log('\n═══ 3. Équité intacte ═══');
[A, B].forEach(id => {
  const c = avec.dry.compteurs[id], k = avec.dry.cibles[id];
  V(id.slice(0, 2) + '… : samedis ' + c.sam + ' pour une part de ' + (+k.sam).toFixed(1) + ', week-ends ' + c.vd + ' pour ' + (+k.vd).toFixed(1),
    Math.abs(c.sam - k.sam) <= 1 && Math.abs(c.vd - k.vd) <= 1, { c, k });
});
const pire = Math.max(...Object.values(avec.dry.ecarts).map(e => e.ecart));
V('aucun MAR à plus de 2 gardes de sa cible, tous axes (pire : ' + pire + ')', pire <= 2, avec.dry.ecarts);
V('l\'année est entièrement pourvue', avec.dry.sansBinome === 0, avec.dry.sansBinome);

console.log('\n═══ 4. Règles dures intactes ═══');
V('jamais la même nuit', b1.nuits === 0, b1.nuits);
{
  const n = avec.jours.length, bad = { enchaines: [], jeuSam: [], absences: [] };
  [A, B].forEach(id => {
    const we = new Set();
    for (let c = 1; c <= n; c++) {
      if (!avec.de(id, c)) continue;
      const d = avec.jours[c - 1], w = d.getDay();
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if ((ABS[id] || {})[ds]) bad.absences.push(id + ' ' + ds);
      if (w === 5 || w === 6 || w === 0) { const lun = new Date(d); lun.setDate(d.getDate() - ((w + 6) % 7)); we.add(Math.round(lun.getTime() / (7 * 86400000))); }
      if (w === 4 && c + 2 <= n && avec.de(id, c + 2)) bad.jeuSam.push(id + ' ' + ds);
    }
    [...we].forEach(k => { if (we.has(k + 1)) bad.enchaines.push(id); });
  });
  V('pas deux week-ends d\'affilée', bad.enchaines.length === 0, bad.enchaines);
  V('pas de jeudi puis samedi', bad.jeuSam.length === 0, bad.jeuSam);
  V('jamais de garde sur une absence', bad.absences.length === 0, bad.absences);
}

console.log('\n═══ 5. Contrat de code ═══');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
V('la règle se lit dans CONFIG (COUPLES_WEEKEND), aucun identifiant en dur',
  /'COUPLES_WEEKEND'/.test(src) && !/COUPLES_WEEKEND\s*=\s*['"][A-Z]/.test(src));
V('les échanges ciblés exigent la même contribution, le même rôle et canHold des deux côtés',
  /_memeContrib\(x\.contrib,sCible\.contrib\)/.test(src) && /canHold\(Q,sCible\.days,role\)\|\|!canHold\(H,sQ\.days,role\)/.test(src));
V('la version du fichier a été montée',
  (src.match(/GAS_VERSION_GENERATEUR = '(\d{4}-\d{2}-\d{2})\.(\d+)'/) || []).slice(1).join('.') >= '2026-10-11.2');

console.log('\n' + ok + ' ✓   ' + ko + ' ✗');
if (ko) process.exit(1);
