/* ═══ BANC — LES PÉRIODES TENDUES SONT PLANIFIÉES EN PREMIER (23/10/2026) ═══

   Règle du responsable : « l'algo doit d'abord gérer les périodes tendues, pas
   bêtement poser au fil de l'année ». Constaté sur la simulation 2027 : mi-août,
   les deux mêmes groupes de MAR présents deux week-ends de suite. Posé au fil de
   l'eau, le calcul utilisait en semaine des MAR dont il avait besoin le week-end
   suivant, puis levait l'interdit des deux week-ends d'affilée — alors qu'une
   répartition « 4 un week-end, 4 l'autre » existait.

   Jeu d'essai : l'été d'un service où la moitié de l'équipe part en même temps,
   deux week-ends de suite, avec quelques souhaits posés dans la période.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const estG = v => v === 'G' || v === 'G2';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

/* Été tendu : les MAR de garde sont répartis en trois groupes.
   Groupe A : vacances du 31/07 au 15/08.  Groupe B : du 07/08 au 22/08.
   Groupe C : du 14/08 au 29/08. Les week-ends du 14-15 et du 21-22/08 ne
   reposent donc que sur une poignée de MAR, toujours les mêmes. */
function jeu() {
  const roster = h.defaultRoster(), im = {};
  const ids = roster.filter(([id, p, q, f]) => !f.noGarde && p > 0 && !f.souhaitPlafond && !f.r2s2 && !f.dateDebut).map(r => r[0]);
  const bloc = (id, deb, n) => { im[id] = im[id] || {}; for (let k = 0; k < n; k++) im[id][addD(deb, k)] = 'VAC'; };
  ids.forEach((id, i) => {
    const g = i % 4;
    if (g === 0) bloc(id, '2027-07-31', 16);
    else if (g === 1) bloc(id, '2027-08-07', 16);
    else if (g === 2) bloc(id, '2027-08-14', 16);
  });
  /* Des souhaits dans la période : ils doivent rester honorés autant qu'avant. */
  const pres = ids.filter((id, i) => i % 4 === 3);
  pres.forEach(id => { im[id] = im[id] || {}; });
  im[pres[0]]['2027-08-17'] = 'SOUHAIT'; im[pres[1]]['2027-08-19'] = 'SOUHAIT';
  return { roster, im };
}
function generer({ roster, im }, src) {
  const ss = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const logs = [];
  const ctx = h.buildContext(ss, logs, src); let err = null;
  try { ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
  /* Le calcul essaie plusieurs plannings à blanc avant d'écrire le meilleur : seuls
     comptent les messages du planning écrit, après « tirage N retenu ». */
  let i0 = -1; logs.forEach((l, i) => { if (/Multi-départ : tirage \d+ retenu$/.test(l)) i0 = i; });
  logs.splice(0, i0 + 1);
  const sh = ss.getSheetByName('GARDES_' + YEAR);
  if (!sh) return { err, logs };
  const rows = sh._rows, G = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; G[id] = {};
    for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim(); if (v) G[id][addD(D0, c - 1)] = v; } }
  return { err, G, logs, nCol: rows[3].length - 1 };
}
/* Week-ends de garde d'affilée (ven-sam-dim de deux semaines successives), hors souhaits. */
function weConsecutifs(G, im) {
  const out = [];
  Object.keys(G).forEach(id => {
    const lundi = d => { const z = new Date(d + 'T12:00:00'); z.setDate(z.getDate() - (z.getDay() + 6) % 7); return ds(z); };
    const wk = {};
    Object.keys(G[id]).filter(d => estG(G[id][d]) && [5, 6, 0].includes(new Date(d + 'T12:00:00').getDay())).forEach(d => { (wk[lundi(d)] = wk[lundi(d)] || []).push(d); });
    Object.keys(wk).forEach(w => { const w2 = addD(w, 7);
      if (wk[w2] && ![...wk[w], ...wk[w2]].every(d => (im[id] || {})[d] === 'SOUHAIT')) out.push(id + ' ' + w + '/' + w2); });
  });
  return out;
}
const dense = G => { let n = 0; Object.keys(G).forEach(id => { const g = Object.keys(G[id]).filter(d => estG(G[id][d])).sort();
  for (let a = 0; a + 2 < g.length; a++) if ((new Date(g[a + 2]) - new Date(g[a])) / 864e5 <= 5) n++; }); return n; };
const couverture = (G, n) => { let mal = 0; for (let c = 0; c < n; c++) { const d = addD(D0, c); let k = 0; Object.keys(G).forEach(id => { if (estG(G[id][d])) k++; }); if (k !== 2) mal++; } return mal; };

const LIGNE = 'const FRAC_TENSION = 0.5,';
const SANS = SRC.split(LIGNE).join('const FRAC_TENSION = 0,');
const J = jeu();

console.log('\n═══ 1. La période tendue est planifiée d\'un bloc ═══');
V('la passe est présente dans le générateur du dépôt', SRC.split(LIGNE).length === 2);
const A = generer(J, null);
V('la génération aboutit', !A.err, A.err);
if (A.G) {
  V('le calcul a repéré et résolu une période tendue en été',
    A.logs.some(l => /Période tendue 2027-0[78].*posées d'un bloc/.test(l)), A.logs.filter(l => /Période tendue/.test(l)));
  const we = weConsecutifs(A.G, J.im);
  V('aucun MAR n\'enchaîne deux week-ends de garde', we.length === 0, we);
  V('aucune nuit n\'a été couverte en dernier recours', !A.logs.some(l => /Dernier recours/.test(l)) , A.logs.filter(l => /Dernier recours/.test(l)));
  V('toutes les nuits ont leur binôme', couverture(A.G, A.nCol) === 0);
  V('jamais 3 gardes sur 6 jours', dense(A.G) === 0, dense(A.G));
}

console.log('\n═══ 2. Contre-preuve : posée au fil de l\'eau, la même période casse ═══');
const B = generer(J, SANS);
const casse = B.G ? weConsecutifs(B.G, J.im).length + B.logs.filter(l => /Dernier recours/.test(l)).length : -1;
V('SANS la passe, au moins un week-end d\'affilée ou un dernier recours (sinon le test 1 ne prouve rien)', casse > 0, { erreur: B.err, casse });

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
