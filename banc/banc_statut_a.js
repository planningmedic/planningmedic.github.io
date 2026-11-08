/* ═══ BANC — STATUT « A » : ABSENT DE JOUR, GARDE POSSIBLE (08/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Un MAR sans contrat de jour sur une période (ici trois semaines) peut quand
   même prendre des gardes « en extérieur ». Décision du responsable : ces jours
   se saisissent « A » dans INDISPOS (pas CL, qui interdit la garde et baisse la
   cible). Le générateur ne bloquait déjà pas la garde sur « A », ni la cible, et
   excluait déjà le 18 h et la récupération ; mais il ne RECOPIAIT pas « A » dans
   GARDES : la case restait vide et le planning du jour le croyait présent.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Une garde est possible un jour « A » (souhait honoré).
   2. Les jours « A » sans garde/repos/récup apparaissent « A » dans GARDES.
   3. Jamais de 18 h ni de récupération un jour « A ».
   4. La cible du MAR n'est pas réduite par les jours « A » (≠ CL).
   5. Contre-preuve : le générateur d'avant laisse ces cases vides.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path');
const { execSync } = require('child_process');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const YEAR = 2027, MAR = 'AUBERT';
const jours = []; { const d = new Date(2027, 1, 8, 12); while (d <= new Date(2027, 1, 28, 12)) { jours.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } }
const SOUHAIT = '2027-02-16';

function grille(ss) {
  const sh = ss.getSheetByName('GARDES_' + YEAR); if (!sh) return null;
  const rows = sh._rows, ent = rows[2] || [], mois = rows[0] || [];
  const MOIS = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7, 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = YEAR, prev = 0; const dates = [];
  for (let c = 1; c < ent.length; c++) {
    const lm = String(mois[c] || '').trim().split(' ')[0];
    if (MOIS[lm]) { const mm = MOIS[lm]; if (prev && mm < prev) an++; m = mm; prev = mm; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null);
  }
  const g = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; g[id] = {};
    dates.forEach((d, i) => { if (d) g[id][d] = String(rows[r][i + 1] || '').trim(); }); }
  return g;
}
function monde(code) {
  const roster = h.defaultRoster(), im = {};
  im[MAR] = {}; jours.forEach(d => { im[MAR][d] = code; });
  if (code === 'A') im[MAR][SOUHAIT] = 'SOUHAIT';   // un souhait au milieu : la garde doit être possible
  return { roster, im };
}
function lancer(code, src) {
  const { roster, im } = monde(code);
  const mk = () => h.makeSpreadsheet([
    h.makeSheet('MEDECINS', h.medecinsRows(roster)),
    h.makeSheet(`INDISPOS_${YEAR}`, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const dry = h.buildContext(mk(), [], src).generateGardes(YEAR, { dryRun: true });
  const ss = mk(); let err = null; try { h.buildContext(ss, [], src).generateGardes(YEAR); } catch (e) { err = e.message; }
  return { dry, err, G: grille(ss) };
}

console.log('\n═══ Statut « A » : absent de jour, garde possible ═══');
const A = lancer('A');
V('la génération aboutit', !A.err && A.G, A.err);
if (A.G) {
  const row = A.G[MAR];
  const gardes = jours.filter(d => row[d] === 'G' || row[d] === 'G2');
  V('la garde souhaitée un jour « A » est accordée (garde possible)', row[SOUHAIT] === 'G' || row[SOUHAIT] === 'G2', row[SOUHAIT]);
  const autres = jours.filter(d => !['G', 'G2', 'RG', 'R'].includes(row[d]));
  V('les jours « A » sans garde ni repos apparaissent « A » dans le planning', autres.length > 0 && autres.every(d => row[d] === 'A' || d === SOUHAIT), autres.filter(d => row[d] !== 'A').map(d => d + ':' + row[d]));
  V('jamais de 18 h un jour « A »', jours.every(d => row[d] !== '18'));
  V('jamais de récupération de samedi un jour « A »', jours.every(d => row[d] !== 'R'), jours.filter(d => row[d] === 'R'));
  V('au moins une garde sur la période « A »', gardes.length >= 1, gardes);
}
const L = lancer('CL');
V('repère : avec CL, aucune garde sur la période', L.G && jours.every(d => !['G', 'G2'].includes(L.G[MAR][d])));
V('la cible du MAR n\'est pas réduite par « A » (contrairement à CL)',
  A.dry.cibles[MAR].total > L.dry.cibles[MAR].total, { A: A.dry.cibles[MAR].total, CL: L.dry.cibles[MAR].total });

console.log('\n═══ Contre-preuve : générateur d\'avant le correctif ═══');
let ancien = null;
try { ancien = execSync('git show 4891a92:gas/generateur_gardes.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
if (!ancien) V('version d\'avant lisible dans l\'historique (clone complet requis)', false);
else {
  const O = lancer('A', ancien);
  const row = O.G && O.G[MAR];
  V('l\'ancien générateur laisse les jours « A » vides (le test discrimine)',
    row && jours.filter(d => !['G', 'G2', 'RG', 'R'].includes(row[d])).every(d => row[d] === ''), row && jours.map(d => row[d]).join(','));
}
console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
