/* ═══ BANC — CONTRÔLE QUALITÉ DE L'ESSAI DE GÉNÉRATION (16/11/2026) ═══

   Demande du responsable : « avoir la meilleure version possible du planning
   avec l'algo ; les seules retouches manuelles seraient sur demande des MAR qui
   auraient mal entré leurs indispos ». L'audit fait à la main le 16/11 sur les
   gardes 2027 (garde-repos-garde, mois chargés, 18 h du vendredi…) est désormais
   refait par l'essai de génération, cas par cas, avec « imposé » ou « le calcul
   avait le choix ».

   Ce scénario exécute le VRAI generateur_gardes.gs et RECOMPTE chaque liste du
   contrôle, de son côté, sur la grille écrite (même tirage) : le contrôle ne doit
   rien inventer ni rien oublier. Une contre-épreuve vérifie que le scénario
   produit bien des cas (sinon « 0 = 0 » ne prouverait rien). */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const dow = s => new Date(s + 'T12:00:00').getDay();
const estG = v => v === 'G' || v === 'G2';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

/* Une année chargée : cinq blocs de vacances et quelques souhaits par MAR (graine fixe). */
function jeu(seed) {
  let s = seed * 7919 + 13; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const roster = h.defaultRoster(), im = {};
  roster.forEach(([id, p, q, f]) => {
    if (f.noGarde) return; im[id] = {};
    for (let b = 0; b < 5; b++) { const st = addD(D0, Math.floor(rnd() * 350)); const n = 5 + Math.floor(rnd() * 10); for (let k = 0; k < n; k++) im[id][addD(st, k)] = 'VAC'; }
    const ns = Math.floor(rnd() * 12); for (let k = 0; k < ns; k++) { const x = addD(D0, Math.floor(rnd() * 355)); if (!im[id][x]) im[id][x] = 'SOUHAIT'; }
  });
  return { roster, im };
}
function classeur({ roster, im }) {
  return h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
}

console.log('\n═══ 1. Le contrôle est bien branché ═══');
V('le calcul à blanc renvoie le contrôle (qualite)', /qualite:qualite/.test(SRC));
V('l\'essai de génération affiche la section CONTRÔLE QUALITÉ', /── CONTRÔLE QUALITÉ · /.test(SRC));

const J = jeu(3);
const ss = classeur(J), ctx = h.buildContext(ss, [], null);
let rep = null, err = null;
try { rep = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
V('la génération aboutit (à blanc puis écrite, même tirage)', !err && rep && rep.qualite, err);
const Q = (rep && rep.qualite) || { grg: [], dense10: [], ven18: [], mois: [], we2: [] };
const sh = ss.getSheetByName('GARDES_' + YEAR), rows = sh ? sh._rows : [], G = {};
for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; G[id] = {};
  for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim(); if (v) G[id][addD(D0, c - 1)] = v; } }
const FER = new Set(ctx.getJoursFeries(YEAR));
const souhait = (id, d) => (J.im[id] || {})[d] === 'SOUHAIT';
const enAnnee = d => d.slice(0, 4) === String(YEAR);

console.log('\n═══ 2. Garde, repos, garde : le contrôle ne rate rien et n\'invente rien ═══');
const grg = [];
Object.keys(G).forEach(id => {
  const d = Object.keys(G[id]).filter(x => estG(G[id][x]) && enAnnee(x)).sort();
  for (let i = 0; i + 1 < d.length; i++) { const a = d[i], b = d[i + 1];
    if (addD(a, 2) !== b || dow(a) === 5) continue;
    if ((dow(a) === 4 && FER.has(a) && dow(b) === 6) || (dow(a) === 6 && dow(b) === 1 && FER.has(b))) continue;
    if (souhait(id, a) && souhait(id, b)) continue;
    grg.push(id + ' ' + a + ' ' + b); }
});
const grgQ = Q.grg.map(c => c.id + ' ' + c.a + ' ' + c.b);
V('même liste que le recomptage sur la grille écrite', JSON.stringify(grg.sort()) === JSON.stringify(grgQ.slice().sort()), { grille: grg, controle: grgQ });
V('chaque cas porte un nombre de MAR libres', Q.grg.every(c => Number.isInteger(c.libres) && c.libres >= 0));

console.log('\n═══ 3. 18 h du vendredi sans garde le samedi ═══');
const ven = [];
Object.keys(G).forEach(id => Object.keys(G[id]).forEach(d => {
  if (G[id][d] !== '18' || dow(d) !== 5 || !enAnnee(d)) return;
  const sam = addD(d, 1), titulaires = Object.keys(G).filter(m => estG(G[m][sam]));
  if (titulaires.length && titulaires.indexOf(id) < 0) ven.push(id + ' ' + d);
}));
const venQ = Q.ven18.map(c => c.id + ' ' + c.date);
V('même liste que le recomptage sur la grille écrite', JSON.stringify(ven.sort()) === JSON.stringify(venQ.slice().sort()), { grille: ven, controle: venQ });
V('chaque cas dit « imposé » ou non', Q.ven18.every(c => typeof c.impose === 'boolean'));

console.log('\n═══ 4. Quatre gardes en dix jours ═══');
const d10 = [];
Object.keys(G).forEach(id => {
  const d = Object.keys(G[id]).filter(x => estG(G[id][x]) && enAnnee(x)).sort();
  for (let i = 0; i + 3 < d.length; i++) {
    if ((new Date(d[i + 3] + 'T12:00:00') - new Date(d[i] + 'T12:00:00')) / 864e5 <= 9) {
      if (d.slice(i, i + 4).filter(x => souhait(id, x)).length < 4) d10.push(id + ' ' + d[i]); i += 3; } }
});
V('même liste que le recomptage sur la grille écrite', JSON.stringify(d10.sort()) === JSON.stringify(Q.dense10.map(c => c.id + ' ' + c.a).sort()), { grille: d10, controle: Q.dense10 });

console.log('\n═══ 5. Contre-épreuve : le scénario produit bien des cas ═══');
V('au moins un cas relevé (sinon les recomptages ci-dessus ne prouvent rien)', Q.grg.length + Q.ven18.length + Q.dense10.length > 0, Q);
V('le total « le calcul avait le choix » est cohérent avec les listes',
  Q.nbChoix === Q.grg.filter(c => c.libres > 0).length + Q.dense10.filter(c => c.libres > 0).length + Q.ven18.filter(c => !c.impose).length + Q.mois.length + Q.we2.filter(c => c.libres > 0).length, Q.nbChoix);
V('les deux week-ends d\'affilée portent aussi un nombre de MAR libres', Q.we2.every(c => Number.isInteger(c.libres) && c.libres >= 0));

console.log('\n═══ 6. L\'essai affiche le contrôle, et le planning ne change pas ═══');
{
  const ss2 = classeur(J), c2 = h.buildContext(ss2, [], null);
  let txt = '', e2 = null; try { txt = c2.essaiGenerationGardes(YEAR); } catch (e) { e2 = e.message; }
  V('l\'essai aboutit', !e2, e2);
  V('la section CONTRÔLE QUALITÉ est dans le texte de l\'essai', /── CONTRÔLE QUALITÉ · /.test(txt));
  V('l\'essai n\'écrit aucun onglet GARDES', !ss2.getSheetByName('GARDES_' + YEAR));
  /* Le contrôle est une mesure : la même génération SANS lui (appel neutralisé) écrit la même grille. */
  const SANS = SRC.replace('const qualite=_controleQualite_();', 'const qualite=null;');
  V('la copie sans contrôle est bien différente', SANS !== SRC);
  const ss3 = classeur(J), c3 = h.buildContext(ss3, [], SANS);
  c3.generateGardes(YEAR, { dryRun: true, tirage: 1 }); c3.generateGardes(YEAR, { tirage: 1 });
  V('même grille écrite avec ou sans contrôle', JSON.stringify(ss3.getSheetByName('GARDES_' + YEAR)._rows) === JSON.stringify(rows));
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
