/* ═══ BANC — JAMAIS 3 GARDES SUR 6 JOURS (23/10/2026) ═══

   Règle du responsable : « 2 gardes en 3 jours doit être le pire schéma ».
   Garde, repos, garde, puis au moins 4 jours avant la suivante : un MAR ne fait
   jamais 3 gardes sur 6 jours glissants. Constaté sur la simulation 2027
   (indisponibilités réelles) : ven. 15, dim. 17, mar. 19 et jeu. 21/10 pour le
   même MAR — à cheval sur deux semaines, la limite par semaine ne le voyait pas.
   Seule exception : le MAR a souhaité lui-même toutes les gardes de la fenêtre.

   Les jeux d'essai 1 et 5 produisent ce motif avec le générateur d'avant la
   règle : c'est la contre-preuve.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const estG = v => v === 'G' || v === 'G2';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

/* Jeu d'essai pseudo-aléatoire reproductible : 5 blocs de vacances, des
   souhaits et des indispos par MAR. */
function jeu(seed, extra) {
  let s = seed * 7919 + 13; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const roster = h.defaultRoster(), im = {};
  roster.forEach(([id, p, q, f]) => {
    if (f.noGarde) return; im[id] = {};
    for (let b = 0; b < 5; b++) { const st = addD(D0, Math.floor(rnd() * 350)); const n = 3 + Math.floor(rnd() * 10); for (let k = 0; k < n; k++) im[id][addD(st, k)] = 'VAC'; }
    const ns = Math.floor(rnd() * 14); for (let k = 0; k < ns; k++) { const x = addD(D0, Math.floor(rnd() * 355)); if (!im[id][x]) im[id][x] = 'SOUHAIT'; }
    const ni = Math.floor(rnd() * 12); for (let k = 0; k < ni; k++) { const x = addD(D0, Math.floor(rnd() * 355)); if (!im[id][x]) im[id][x] = 'INDISPO'; }
  });
  if (extra) extra(im);
  return { roster, im };
}
function generer({ roster, im }, src) {
  const ss = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = h.buildContext(ss, [], src); let err = null;
  try { ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
  const sh = ss.getSheetByName('GARDES_' + YEAR);
  if (!sh) return { err };
  const rows = sh._rows, G = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; G[id] = {};
    for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim(); if (v) G[id][addD(D0, c - 1)] = v; } }
  return { err, G, nCol: rows[3].length - 1 };
}
/* Fenêtres de 6 jours contenant 3 gardes ou plus, hors fenêtres entièrement
   souhaitées (un vendredi ou un dimanche souhaité vaut pour les deux nuits du week-end). */
const souh = (im, id, d) => { const m = im[id] || {}, w = new Date(d + 'T12:00:00').getDay();
  return m[d] === 'SOUHAIT' || (w === 5 && m[addD(d, 2)] === 'SOUHAIT') || (w === 0 && m[addD(d, -2)] === 'SOUHAIT'); };
function denses(G, im) {
  const out = [];
  Object.keys(G).forEach(id => {
    const ks = Object.keys(G[id]).filter(d => estG(G[id][d])).sort();
    for (let a = 0; a + 2 < ks.length; a++) {
      const span = (new Date(ks[a + 2] + 'T12:00:00') - new Date(ks[a] + 'T12:00:00')) / 864e5;
      if (span <= 5 && !ks.slice(a, a + 3).every(d => souh(im, id, d))) out.push(id + ' ' + ks.slice(a, a + 3).join(','));
    }
  });
  return out;
}
function couverture(G, n) {
  let mal = 0;
  for (let c = 0; c < n; c++) { const d = addD(D0, c); let k = 0; Object.keys(G).forEach(id => { if (estG(G[id][d])) k++; }); if (k !== 2) mal++; }
  return mal;
}
/* Copie du générateur SANS la règle : on relève la limite à 99. */
const LIGNE = 'const DENSITE_MAX = 2, DENSITE_FENETRE = 6;';
const SANS = SRC.split(LIGNE).join('const DENSITE_MAX = 99, DENSITE_FENETRE = 6;');

console.log('\n═══ 1. Jamais 3 gardes sur 6 jours (jeux d\'essai 1 et 5) ═══');
V('la règle est présente dans le générateur du dépôt', SRC.split(LIGNE).length === 2);
const R = {};
[1, 5].forEach(seed => {
  const j = jeu(seed); const r = generer(j, null); R[seed] = { j, r };
  V(`jeu ${seed} : la génération aboutit`, !r.err, r.err);
  if (!r.G) return;
  V(`jeu ${seed} : aucun MAR à 3 gardes ou plus sur 6 jours`, denses(r.G, j.im).length === 0, denses(r.G, j.im).slice(0, 3));
  V(`jeu ${seed} : toutes les nuits ont leur binôme`, couverture(r.G, r.nCol) === 0, couverture(r.G, r.nCol));
});

console.log('\n═══ 2. Contre-preuve : sans la règle, le motif réapparaît ═══');
[1, 5].forEach(seed => {
  const r = generer(jeu(seed), SANS);
  const n = r.G ? denses(r.G, jeu(seed).im).length : 0;
  V(`jeu ${seed} : SANS la règle, au moins un MAR fait 3 gardes en 6 jours (sinon le test 1 ne prouve rien)`, n > 0, { erreur: r.err, cas: n });
});

console.log('\n═══ 3. Exception : 3 gardes souhaitées sur 6 jours restent possibles ═══');
{
  /* Un MAR souhaite ven. 12, dim. 14 et mar. 16 mars : la règle ne doit rien
     lui retirer par rapport au générateur sans la règle. */
  const JOURS = ['2027-03-12', '2027-03-14', '2027-03-16'], QUI = 'AUBERT';
  const extra = im => { for (let k = -3; k <= 10; k++) { const d = addD('2027-03-08', k); if (im[QUI][d] && im[QUI][d] !== 'SOUHAIT') delete im[QUI][d]; }
    JOURS.forEach(d => { im[QUI][d] = 'SOUHAIT'; }); };
  const avec = generer(jeu(2, extra), null), sans = generer(jeu(2, extra), SANS);
  const nb = r => r.G ? JOURS.filter(d => estG(r.G[QUI][d])).length : -1;
  V('la génération aboutit', !avec.err, avec.err);
  V('les souhaits groupés ne sont pas refusés à cause de la règle', nb(avec) === nb(sans), { avec: nb(avec), sans: nb(sans) });
}

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
