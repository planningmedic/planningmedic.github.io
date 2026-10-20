/* ═══ BANC — JAMAIS DE REPOS DE GARDE SUR UN JOUR DE VACANCES (20/10/2026) ═══

   Règle du responsable : le repos qui suit une garde ne peut pas tomber sur un
   jour de vacances, de formation ou de congé long. Avant ce correctif, le RG
   s'écrivait par-dessus la case VAC : mesuré sur les indisponibilités réelles
   2027, 7 repos de garde tombaient sur un jour de vacances (dont 4 à Noël).
   Même logique que le temps partiel du lendemain (banc_garde_veille_tp.js).

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const YEAR = 2027;
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const estG = v => v === 'G' || v === 'G2';

function grilleDe(ss, year) {
  const sh = ss.getSheetByName('GARDES_' + year); if (!sh) return null;
  const rows = sh._rows, ent = rows[2] || [], mois = rows[0] || [], dates = [];
  const MOIS = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7, 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = year, prev = 0;
  for (let c = 1; c < ent.length; c++) {
    const lm = String(mois[c] || '').trim();
    if (MOIS[lm]) { const mm = MOIS[lm]; if (prev && mm < prev) an++; m = mm; prev = mm; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null);
  }
  const g = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; g[id] = {};
    dates.forEach((d, i) => { const v = String(rows[r][i + 1] || '').trim(); if (d && v) g[id][d] = v; }); }
  return g;
}
/* Plusieurs MAR posent des absences dont le premier jour tombe un lundi, un
   mercredi, un samedi, un dimanche : tous les cas où un RG pourrait s'y écrire. */
function scenario() {
  const im = {}, poses = [];
  const bloc = (id, debut, n, code) => { im[id] = im[id] || {}; for (let k = 0; k < n; k++) { const s = addD(debut, k); im[id][s] = code; poses.push([id, s, code]); } };
  const ids = h.defaultRoster().filter(r => !(r[3] || {}).noGarde && (r[1] || 0) > 0 && !(r[3] || {}).souhaitPlafond).map(r => r[0]);
  /* Débuts en semaine (lundi, mardi, mercredi, jeudi) : les cas où le repos coûterait un jour. */
  const debuts = ['2027-02-02', '2027-03-10', '2027-04-15', '2027-05-25', '2027-06-14', '2027-09-08', '2027-10-12', '2027-11-18', '2027-01-20', '2027-07-06'];
  ids.forEach((id, i) => {
    bloc(id, debuts[i % debuts.length], 5, 'VAC');
    bloc(id, debuts[(i + 3) % debuts.length], 3, 'VAC');
    bloc(id, debuts[(i + 6) % debuts.length], 2, i % 2 ? 'FORM' : 'VAC');
  });
  bloc(ids[0], '2027-07-05', 14, 'CL');
  return { im, poses };
}
let FER = new Set();
const ouvre = s => true;   // tous les jours comptent, week-ends et fériés compris
function controle(G, poses) {
  /* Dans GARDES, une absence s'affiche sous son propre code (V, F, CL…). Seuls
     comptent ici les codes du planning : garde, repos, récup, 18h. */
  const sur = poses.filter(([id, s]) => ouvre(s) && G[id] && ['G', 'G2', 'RG', 'R', '18'].includes(G[id][s]));
  const veille = poses.filter(([id, s]) => ouvre(s) && G[id] && estG(G[id][addD(s, -1)]));
  return { sur, veille };
}

console.log('\n═══ 1. Aucun repos de garde sur une absence posée ═══');
{
  const { im, poses } = scenario();
  const { ss, error, ctx } = h.runScenario({ year: YEAR, indisposMap: im });
  FER = new Set([...ctx.getJoursFeries(YEAR), ...ctx.getJoursFeries(YEAR + 1)]);
  V('la génération aboutit', !error, error);
  const G = grilleDe(ss, YEAR);
  V("l'onglet GARDES est écrit", !!G);
  if (G) {
    const { sur, veille } = controle(G, poses);
    V('AUCUN jour de vacances, formation ou congé long écrasé (RG ou garde), week-ends compris', sur.length === 0, sur.slice(0, 6));
    V("aucune garde la VEILLE d'un jour d'absence", veille.length === 0, veille.slice(0, 6));
    /* La pratique du « jour gagné avant les vacances » doit survivre : garde
       l'avant-veille du dernier jour travaillé, RG sur ce dernier jour travaillé. */
    const gain = poses.filter(([id, s, c]) => c === 'VAC' && !(im[id] || {})[addD(s, -1)])
      .some(([id, s]) => { let j = addD(s, -1); while ([0, 6].includes(new Date(j + 'T12:00:00').getDay())) j = addD(j, -1);
        return estG(G[id][addD(j, -1)]) && G[id][j] === 'RG'; });
    V('le jour gagné avant les vacances existe toujours (RG sur le dernier jour travaillé)', gain);
    const ids = Object.keys(im);
    V('les MAR concernés gardent des gardes (pas exclus du tour)', ids.every(id => Object.values(G[id] || {}).some(estG)));
  }
}

console.log('\n═══ 2. Contre-preuve : sans la règle, des repos tombent sur les vacances ═══');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  const LIGNE = "if(absenceLendemain(id,date)) return true;";
  V('la ligne de la règle est présente dans le générateur du dépôt', src.includes(LIGNE));
  const i = src.indexOf(LIGNE); const sans = src.slice(0, i) + src.slice(i + LIGNE.length);
  const { im, poses } = scenario();
  const roster = h.defaultRoster();
  const ss2 = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = h.buildContext(ss2, [], sans); let e2 = null;
  try { ctx.generateGardes(YEAR); } catch (e) { e2 = e.message; }
  const G2 = e2 ? null : grilleDe(ss2, YEAR);
  const n = G2 ? controle(G2, poses).sur.length : 0;
  V('SANS la règle, des absences sont bel et bien écrasées (sinon le test 1 ne prouve rien)', n > 0, { erreur: e2, ecrases: n });
}

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
