/* ═══ BANC — PÉRIODE TENDUE SANS SOLUTION PARFAITE : LE MOINS DE DOUBLES WEEK-ENDS (03/11/2026) ═══

   Décision du responsable, 03/11/2026 : « il faudra trouver des parades pour ne
   pas avoir 2 WE d'affilée ». Constaté sur la simulation 2027 du 02/11 : le
   week-end du 20-22/08 demande 4 MAR, et 3 seulement sortent d'un week-end
   libre. La période tendue n'avait aucune solution parfaite : elle partait au
   fil de l'eau, et le dernier recours lâchait la règle sans compter (2 MAR à
   deux week-ends de suite, plus un jeudi→samedi).

   Le correctif relance la recherche d'un bloc en changeant ces deux règles en
   coûts très lourds : le moins possible de doubles week-ends d'abord, puis le
   moins possible de jeudi→samedi. Le comité est prévenu nommément.

   Jeu d'essai : 8 MAR de garde seulement présents du 09 au 29/08 — trois
   week-ends de 4 MAR chacun. Mesuré le 03/11/2026 : sans la seconde
   recherche, 2 doubles week-ends ; avec, 1.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const dow = s => new Date(s + 'T12:00:00').getDay();
const estG = v => v === 'G' || v === 'G2';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

function jeu(tendu) {
  const roster = h.defaultRoster(), im = {};
  const ids = roster.filter(([id, p, q, f]) => !f.noGarde && p > 0 && !f.souhaitPlafond && !f.r2s2 && !f.dateDebut).map(r => r[0]);
  if (tendu) ids.slice(8).forEach(id => { im[id] = {}; for (let k = 0; k < 21; k++) im[id][addD('2027-08-09', k)] = 'VAC'; });
  return { roster, im };
}
function generer({ roster, im }, src) {
  const ss = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const logs = [];
  const ctx = h.buildContext(ss, logs, src); let err = null, ret = null;
  try { ret = ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
  const sh = ss.getSheetByName('GARDES_' + YEAR);
  if (!sh) return { err };
  const G = {};
  sh._rows.slice(3).forEach(r => { if (!r[0]) return; G[r[0]] = {};
    for (let c = 1; c < r.length; c++) { const v = String(r[c] || '').trim(); if (v) G[r[0]][addD(D0, c - 1)] = v; } });
  return { err, G, rows: sh._rows, warnings: (ret && ret.warnings) || [] };
}
const garde = (G, id, d) => estG((G[id] || {})[d]);
/* Doubles week-ends : garde un ven/sam/dim ET le ven/sam/dim de la semaine suivante (hors souhaits — aucun ici). */
function doublesWE(G) {
  const out = [];
  Object.keys(G).forEach(id => { for (let c = 0; c < 364; c++) { const f = addD(D0, c); if (dow(f) !== 5) continue;
    if ([0, 1, 2].some(k => garde(G, id, addD(f, k))) && [7, 8, 9].some(k => garde(G, id, addD(f, k)))) out.push(id + ' ' + f); } });
  return out;
}
/* Jeudi (non férié en août : aucun) puis samedi pour le même MAR, dans la période. */
const jeudiSamedi = G => { const out = []; Object.keys(G).forEach(id => { for (let c = 0; c < 364; c++) { const j = addD(D0, c);
  if (dow(j) === 4 && j >= '2027-08-05' && j <= '2027-09-02' && garde(G, id, j) && garde(G, id, addD(j, 2))) out.push(id + ' ' + j); } }); return out; };
const regles = (G, im) => { let n = 0; Object.keys(G).forEach(id => { const g = Object.keys(G[id]).filter(d => estG(G[id][d])).sort();
  g.forEach((d, a) => { if (g[a + 1] === addD(d, 1)) n++; if (g[a + 3] && g[a + 3] <= addD(d, 5)) n++; if ((im[id] || {})[d]) n++; }); }); return n; };
const couverture = G => { let mal = 0; for (let c = 0; c < 364; c++) { const d = addD(D0, c); let k = 0; Object.keys(G).forEach(id => { if (estG(G[id][d])) k++; }); if (k !== 2) mal++; } return mal; };

/* Contre-preuve : le générateur privé de la seconde recherche.
   (07/11/2026) …et privé aussi de la règle « vendredi-dimanche rompu : on garde
   les MAR de l'autre jour ». Avec cette règle, le placement au fil de l'eau tombe
   à 0 double week-end dans ce jeu d'essai (au prix de 2 week-ends cassés à 3 MAR,
   contre 1 double et 1 week-end cassé avec la seconde recherche) : la
   contre-preuve ne mesurerait plus la seconde recherche. On compare donc à
   l'ancien placement au fil de l'eau, celui que la seconde recherche remplace. */
const LIGNE = '      if(!meilleur){\n        toleranceDeuxWE=true;';
const LIGNE_VD = '    if(dow===0||dow===5){\n      const _autre=';
const SANS = SRC.split(LIGNE).join('      if(false){\n        toleranceDeuxWE=true;')
                .split(LIGNE_VD).join('    if(false){\n      const _autre=');
const J = jeu(true);

console.log('\n═══ 1. Période tendue sans solution parfaite : le moins de doubles week-ends ═══');
V('la seconde recherche est présente dans le générateur du dépôt', SRC.split(LIGNE).length === 2);
V('la règle du vendredi-dimanche rompu est présente (neutralisée dans la contre-preuve)', SRC.split(LIGNE_VD).length === 2);
const A = generer(J, null);
V('la génération aboutit', !A.err, A.err);
if (A.G) {
  const dbl = doublesWE(A.G), js = jeudiSamedi(A.G);
  V('un seul double week-end sur les trois week-ends tendus', dbl.length === 1, dbl);
  V('aucun jeudi→samedi dans la période', js.length === 0, js);
  const w = A.warnings.filter(x => /aucune répartition parfaite/.test(x));
  V('le comité est prévenu, avec le nom du MAR concerné', w.length === 1 && dbl.length === 1 && w[0].indexOf(dbl[0].split(' ')[0]) >= 0, w);
  V('la période n\'est plus posée au fil de l\'eau', !A.warnings.some(x => /posée au fil de l'eau/.test(x)));
  V('aucune nuit couverte en dernier recours', !A.warnings.some(x => /Dernier recours/.test(x)));
  V('toutes les nuits ont leur binôme', couverture(A.G) === 0);
  V('jamais 2 gardes d\'affilée, ni plus de 3 en 6 jours, ni sur une absence', regles(A.G, J.im) === 0, regles(A.G, J.im));
}

console.log('\n═══ 2. Contre-preuve : sans la seconde recherche, la même période est moins bien traitée ═══');
const B = generer(J, SANS);
const casseB = B.G ? doublesWE(B.G).length + jeudiSamedi(B.G).length : -1;
V('SANS elle : plus de doubles week-ends + jeudi→samedi qu\'avec (sinon le test 1 ne prouve rien)',
  A.G && B.G && casseB > doublesWE(A.G).length + jeudiSamedi(A.G).length, { erreur: B.err, sans: casseB });
V('SANS elle : la période repart au fil de l\'eau', B.warnings && B.warnings.some(x => /posée au fil de l'eau/.test(x)));

console.log('\n═══ 3. Sans tension, rien ne change ═══');
const C = generer(jeu(false), null), D = generer(jeu(false), SANS);
V('planning strictement identique avec et sans la seconde recherche', C.rows && D.rows && JSON.stringify(C.rows) === JSON.stringify(D.rows));
V('aucun avertissement de répartition imparfaite', C.warnings && !C.warnings.some(x => /aucune répartition parfaite/.test(x)));

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
