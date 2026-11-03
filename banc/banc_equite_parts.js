/* ═══ BANC — L'ÉCRAN D'ÉQUITÉ MONTRE LES PARTS DU GÉNÉRATEUR (03/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE. Sur la simulation 2027 du 03/11, le générateur
   tient chaque MAR à 1 garde près de sa part. L'onglet Équité du portail, lui,
   « ramenait les parts au réel » : un MAR à régime à part prend 9 nuits de plus
   que sa part et des vendredis-dimanches sont coupés, les parts baissaient pour
   tout le monde, deux MAR à +1 passaient à +2 — et l'écran annonçait en rouge
   « écarts importants » aux 23 MAR, le jour même de la génération.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Parts entières (générateur, depuis 2027) : affichées telles quelles.
   2. Parts à virgule (années d'avant, médecin extérieur) : toujours ramenées au
      réel — le défaut de 2026 ne revient pas.
   3. Verdict et couleurs : « WE » et non « wee » ; bleu en dessous, rouge
      au-dessus, à partir de 2 gardes ; les cases repliées aussi.
   4. Le certificat du portail MAR compte « à 1 garde près » ; plus de moyenne ni
      d'étendue ; les fériés comparés à la part ; deux lignes sur la carte du MAR.
   Contre-preuve : la version d'avant (git) recalcule les parts et écrit « wee ». */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const RACINE = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RACINE, 'partage', 'rendu_equite.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(RACINE, 'planning.html'), 'utf8');
const AX = [['total','cTot','total'],['sa','cSa','samedis'],['je','cJe','jeudis'],['vd','cVd','week-ends'],['vjf','cVjf','veilles fériés'],['jf','cJf','fériés']];
function charger(src) { const ctx = { window: {} }; ctx.window.AX_EQUITE = AX; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window; }
const W = charger(SRC);

/* Jeu 2027 : 4 MAR évalués, parts entières dont la somme (148) dépasse le réel
   (145) — exactement la situation créée par un régime à part. */
const L27 = [
  { name: 'A', total: 36, cTot: 37, vd: 7, cVd: 6, sa: 6, cSa: 6 },
  { name: 'B', total: 38, cTot: 37, vd: 5, cVd: 6, sa: 6, cSa: 6 },
  { name: 'C', total: 36, cTot: 37, vd: 6, cVd: 6, sa: 5, cSa: 6 },
  { name: 'D', total: 35, cTot: 37, vd: 4, cVd: 6, sa: 6, cSa: 6 },
];
console.log('\n─── 1. Parts entières : affichées telles quelles ───');
const T = W.ciblesEquite(L27, AX);
V('chaque part totale reste celle du générateur (37)', L27.every(m => T[m.name].cTot === 37), L27.map(m => T[m.name].cTot));
V('chaque part de week-ends reste 6', L27.every(m => T[m.name].cVd === 6), L27.map(m => T[m.name].cVd));
V('un MAR à +1 reste à +1 (n\'est pas poussé à +2)', 38 - T.B.cTot === 1 && 7 - T.A.cVd === 1);
V('un vrai −2 reste visible à −2', 35 - T.D.cTot === -2 && 4 - T.D.cVd === -2);

console.log('\n─── 2. Parts à virgule (années d\'avant) : toujours ramenées au réel ───');
const L26 = [{ name: 'P', total: 34, cTot: 36.54 }, { name: 'Q', total: 35, cTot: 36.54 }, { name: 'R', total: 33, cTot: 35.2 }];
const T26 = W.ciblesEquite(L26, [AX[0]]);
V('la somme des parts suit les gardes réellement posées', L26.reduce((s, m) => s + T26[m.name].cTot, 0) === 102, L26.map(m => T26[m.name].cTot));
V('les parts sont des entiers', L26.every(m => Number.isInteger(T26[m.name].cTot)));

console.log('\n─── 3. Verdict et couleurs ───');
const v1 = W.eqVerdict({ total: 37, vd: 4 }, { cTot: 37, cVd: 6 }, AX);
V('« WE » et non « wee »', v1.t === '-2 WE', v1.t);
V('2 gardes ou plus EN DESSOUS : bleu', v1.c === '#1D4ED8', v1.c);
const v2 = W.eqVerdict({ total: 39, vd: 6 }, { cTot: 37, cVd: 6 }, AX);
V('2 gardes ou plus AU-DESSUS : rouge', v2.t === '+2 tot' && v2.c === '#CE1126', v2);
const v3 = W.eqVerdict({ total: 36, vd: 6 }, { cTot: 37, cVd: 6 }, AX);
V('à 1 garde près : neutre', v3.c === 'var(--ink-3)', v3);
const html = W.renderEquiteCards([{ name: 'D', total: 35, cTot: 37, sa: 6, cSa: 6, je: 6, cJe: 6, vd: 4, cVd: 6, vjf: 0, cVjf: 0, jf: 1, cJf: 1, lu: 3, ma: 3, me: 3 }], { axes: AX });
V('carte repliée : une case bleue pour un compteur à −2', /eqv-case" style="background:#1D4ED8/.test(html));

console.log('\n─── 4. Le certificat et l\'en-tête du portail MAR ───');
V('« à 1 garde près » compte les MAR à ±1', /Math\.abs\(worst\) <= 1\) within1\+\+/.test(PAGE));
V('le verdict vert le dit en clair', /Chaque MAR est à <b>1 garde près<\/b> de sa part/.test(PAGE));
V('le classement colore en bleu les écarts en dessous', /x\.worst <= -SEUIL \? '#1D4ED8'/.test(PAGE));
V('plus de moyenne ni d\'étendue', !/Moyenne \/ MAR/.test(PAGE) && !/eq-kpi-lbl">\\u00c9tendue|eq-kpi-lbl">Étendue/.test(PAGE));
V('la légende ne cite plus de nom d\'onglet', !/STATS_GARDES\)|lues dans STATS_GARDES/.test(PAGE));
V('vue Initiale : les fériés comparés à la part (cJf transmis)', /cVjf:_cibNum\(cb\.cVjf\), cJf:_cibNum\(cb\.cJf\)/.test(PAGE));
V('la carte du MAR connecté reçoit ses deux lignes', /function eqLignesMoi\(/.test(PAGE) && (PAGE.match(/eqLignesMoi\(wrap, list\);/g) || []).length === 2);

console.log('\n─── 5. Contre-preuve : la version d\'avant ───');
let AVANT = null;
try { AVANT = execSync('git show 6b229f1:partage/rendu_equite.js', { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
if (AVANT) {
  const WA = charger(AVANT), TA = WA.ciblesEquite(L27, AX);
  V('AVANT : les parts étaient recalculées (un +1 devenait +2)', 38 - TA.B.cTot === 2 || 7 - TA.A.cVd === 2, { B: TA.B.cTot, A: TA.A.cVd });
  V('AVANT : « wee »', WA.eqVerdict({ total: 37, vd: 4 }, { cTot: 37, cVd: 6 }, AX).t === '-2 wee');
} else V('historique git disponible pour la contre-preuve (cloner sans --depth 1)', false);

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
