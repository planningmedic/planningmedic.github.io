/* ═══ BANC — V, S, D ET WE = SAMEDIS + DIMANCHES (12/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE. Vu le 12/11/2026 sur les gardes 2027 attribuées :
   un MAR à 13 samedis + dimanches, d'autres à 10, même quotité — et l'écran
   d'équité ne le montrait pas. Sa case « week-ends » lisait la colonne VD de
   l'onglet de statistiques, fausse : 92 pour 104 vendredis de garde (le compteur
   du générateur perdait les vendredis de fêtes imposés et ceux que ses dernières
   passes déplacent). Décision du responsable : V, S, D, et WE = S + D comparé à
   sa part.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. La lecture de l'onglet (champsWeStats_) : V = VEN, WE = SAM + DIM, part =
      samedis + dimanches de l'année au prorata des parts exactes samedis +
      vendredis-dimanches, arrondie au plus près ; même part ⇒ même cible ;
      années sans parts : pas de cible.
   2. Une vraie génération : colonne VD = vendredis de la grille ; les lecteurs
      rendent V et WE égaux au recompte de la grille ; fêtes imposées comprises.
   3. Le report d'une année sur l'autre lit les vendredis dans VEN, plus dans VD.
   4. L'instantané : V = vendredis, WE = samedis + dimanches réels.
   5. L'écran : barres Ven, Sam, Dim (neutre), WE avec sa part ; verdicts.
   Contre-preuves (code d'avant, commit de5426d) : le vendredi de fête imposé
   manquait à VD, le report lisait VD, aucune case WE à l'écran. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const AVANT = 'de5426d';   // dernier commit avant le comptage des week-ends
const avant = f => { try { return execSync('git show ' + AVANT + ':' + f, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const H = require(path.join(RACINE, 'simulateur', 'harness.js'));

const CODE = lire('gas/code.gs');
const extraire = (src, nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return null;
  let k = src.indexOf('{', i), n = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) return src.slice(i, j + 1); } } return null; };
const gas = {}; vm.createContext(gas); vm.runInContext(extraire(CODE, 'champsWeStats_'), gas);
const AX = [['total','cTot','total'],['sa','cSa','samedis'],['je','cJe','jeudis'],['vd','cVd','vendredis'],['we','cWe','week-ends'],['vjf','cVjf','veilles fériés'],['jf','cJf','fériés']];
function charger(src) { const ctx = { window: {} }; ctx.window.AX_EQUITE = AX; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window; }
const W = charger(lire('partage/rendu_equite.js'));

console.log('\n─── 1. Lecture de l\'onglet de statistiques ───');
const HDR = ['MEDECIN', 'VEN', 'SAM', 'DIM', 'VD', 'PART EXACTE SAM', 'PART EXACTE VD'];
const T1 = [HDR, ['A', 7, 6, 7, 6, '5,512', '5,512'], ['B', 5, 5, 5, 4, 5.512, 5.512], ['C', 5, 5, 5, 4, 5.512, 5.512], ['D', 4, 5, 4, 4, 4.961, 4.961]];
const a = gas.champsWeStats_(T1, 1), b = gas.champsWeStats_(T1, 2), c = gas.champsWeStats_(T1, 3), d = gas.champsWeStats_(T1, 4);
V('V = la colonne VEN (7), pas la colonne VD (6)', a.vd === 7, a);
V('WE = samedis + dimanches (6 + 7 = 13)', a.we === 13, a);
const tot = 13 + 10 + 10 + 9, part = x => tot * x / (3 * 11.024 + 9.922);
V('part = samedis + dimanches de l\'année au prorata des parts exactes, arrondie', a.cWe === Math.round(part(11.024)) && d.cWe === Math.round(part(9.922)), [a.cWe, d.cWe, part(11.024), part(9.922)]);
V('même part ⇒ même cible (A, B, C)', a.cWe === b.cWe && b.cWe === c.cWe, [a.cWe, b.cWe, c.cWe]);
V('les parts écrites « 5,512 » (virgule) se lisent', a.cWe === b.cWe);
const sans = gas.champsWeStats_([['MEDECIN', 'VEN', 'SAM', 'DIM'], ['A', 7, 6, 7]], 1);
V('sans colonnes de part (années d\'avant) : WE affiché, pas de cible', sans.we === 13 && sans.cWe === undefined, sans);

console.log('\n─── 2. Une vraie génération (simulateur) ───');
const { ss, error, ctx } = H.runScenario({ year: 2027 });
V('génération sans erreur', !error, error);
const st = H.readStats(ss, 2027), stRows = ss.getSheetByName('STATS_GARDES_2027')._rows;
const g = ss.getSheetByName('GARDES_2027')._rows, NC = g[2].length;
const debut = new Date(2027, 0, 4, 12), dateCol = k => { const x = new Date(debut); x.setDate(x.getDate() + k - 1); return x; };
const recompte = {};
for (let r = 3; r < g.length; r++) { const id = g[r][0]; if (!id) continue; const o = { ven: 0, sam: 0, dim: 0 };
  for (let k = 1; k < NC; k++) if (g[r][k] === 'G' || g[r][k] === 'G2') { const w = dateCol(k).getDay(); if (w === 5) o.ven++; if (w === 6) o.sam++; if (w === 0) o.dim++; }
  recompte[id] = o; }
const ids = Object.keys(st.byId).filter(id => recompte[id]);
V('l\'onglet garde ses 33 colonnes (aucune colonne ajoutée)', st.hdr.length === 33 && st.hdr[20] === 'VD', st.hdr.length);
const vdKo = ids.filter(id => +st.byId[id]['VD'] !== recompte[id].ven);
V('colonne VD = vendredis de la grille finale, pour chaque MAR', vdKo.length === 0, vdKo);
const lus = ids.map(id => [id, gas.champsWeStats_(stRows, stRows.findIndex(x => x[0] === id))]);
V('lecteur : V = vendredis de la grille, pour chaque MAR', lus.every(([id, o]) => o.vd === recompte[id].ven));
V('lecteur : WE = samedis + dimanches de la grille, pour chaque MAR', lus.every(([id, o]) => o.we === recompte[id].sam + recompte[id].dim));
const parCible = {}; lus.forEach(([id, o]) => { const k = st.byId[id]['PART EXACTE SAM'] + '|' + st.byId[id]['PART EXACTE VD']; (parCible[k] = parCible[k] || new Set()).add(o.cWe); });
V('même part ⇒ même cible de week-ends, pour tous', Object.values(parCible).every(x => x.size === 1));
V('au moins deux MAR partagent une part (sinon le test serait vide)', lus.length - Object.keys(parCible).length >= 2);

/* Les fêtes imposées par le comité (onglet FETES) : le vendredi 24/12 seul d'un
   binôme manquait au compteur VD. Même scénario, code d'avant et d'après. */
const SCEN = [['24/12/2027', 'FAUVEL', 'ORVAL'], ['25/12/2027', 'ME', 'DU'], ['26/12/2027', 'AU', 'FAUVEL'],
  ['31/12/2027', 'PELLETIER', 'RIVIERE'], ['01/01/2028', 'SABLON', 'SERVANT'], ['02/01/2028', 'PELLETIER', 'RIVIERE']];
function genFetes(src) {
  const r = H.defaultRoster(), s2 = H.makeSpreadsheet([H.makeSheet('MEDECINS', H.medecinsRows(r)), H.makeSheet('INDISPOS_2027', H.indisposRows(2027, r, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(2027)), H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
    H.makeSheet('FETES_2027', [['Date', 'MAR 1', 'MAR 2']].concat(SCEN.map(l => l.slice())))]);
  const c3 = H.buildContext(s2, [], src); let e3 = null; try { c3.generateGardes(2027, { tirage: 1 }); } catch (e) { e3 = e.message; }
  return { e3, st3: H.readStats(s2, 2027) };
}
const FN = genFetes(null);
V('avec les fêtes imposées : VD = vendredis, pour chaque MAR', !FN.e3 && Object.values(FN.st3.byId).every(o => +o.VD === +o.VEN), FN.e3);
const GAV = avant('gas/generateur_gardes.gs');
if (GAV) {
  const FA = genFetes(GAV);
  const faux = FA.st3 ? Object.entries(FA.st3.byId).filter(([k, o]) => +o.VD !== +o.VEN).map(([k]) => k) : [];
  V('AVANT : le vendredi de fête imposé manquait à VD (FAUVEL, ORVAL)', !FA.e3 && faux.indexOf('FAUVEL') >= 0 && faux.indexOf('ORVAL') >= 0, FA.e3 || faux);
} else V('historique git disponible pour la contre-preuve (cloner sans --depth 1)', false);

console.log('\n─── 3. Le report de l\'année suivante lit les vendredis dans VEN ───');
/* Un onglet 2027 dont la colonne VD est fausse pour un MAR (comme en vrai) :
   la cible de vendredis-dimanches de 2028 ne doit pas en dépendre. */
const faussé = stRows.map(r => r.slice()), iVD = st.hdr.indexOf('VD');
const cobaye = faussé.findIndex((r, k) => k > 0 && +r[iVD] >= 4);
faussé[cobaye][iVD] = 0;
const D2 = require(path.join(RACINE, 'simulateur', 'demographie.js'));
const ROSTER = H.defaultRoster(), imB = D2.buildAbsences(2028, ROSTER, 1);
const gen28 = (prev, src) => { const s3 = H.makeSpreadsheet([H.makeSheet('MEDECINS', H.medecinsRows(ROSTER)), H.makeSheet('INDISPOS_2028', H.indisposRows(2028, ROSTER, imB)),
  H.makeSheet('PERIODES_VAC', H.periodesRows(2028)), H.makeSheet('CONFIG', [['CLE', 'VALEUR']]), H.makeSheet('STATS_GARDES_2027', prev)]);
  const c4 = H.buildContext(s3, [], src); try { c4.generateGardes(2028, { tirage: 1 }); } catch (e) { return null; }
  return H.readStats(s3, 2028); };
const id0 = faussé[cobaye][0];
const n28 = gen28(stRows.map(r => r.slice()), null), f28 = gen28(faussé, null);
V('les deux générations 2028 aboutissent', !!n28 && !!f28);
if (n28 && f28) V('une colonne VD fausse en 2027 ne change rien à la cible 2028 (' + id0 + ')', +n28.byId[id0]['CIBLE VD'] === +f28.byId[id0]['CIBLE VD'], [n28.byId[id0]['CIBLE VD'], f28.byId[id0]['CIBLE VD']]);
if (GAV) {
  const fa = gen28(faussé, GAV), na = gen28(stRows.map(r => r.slice()), GAV);
  V('AVANT : le report lisait VD (la cible 2028 changeait)', !!(fa && na) && +fa.byId[id0]['CIBLE VD'] !== +na.byId[id0]['CIBLE VD'], fa && na && [na.byId[id0]['CIBLE VD'], fa.byId[id0]['CIBLE VD']]);
}

console.log('\n─── 4. L\'instantané (computeStatsLive) ───');
ctx.Session = { getScriptTimeZone: () => 'Europe/Paris' };
ctx.Utilities = { formatDate: x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') };
let live = null; try { live = ctx.computeStatsLive(2027); } catch (e) { live = e.message; }
V('l\'instantané se calcule', Array.isArray(live), live);
if (Array.isArray(live)) {
  const L = {}; live.forEach(x => { L[x.medecin] = x; });
  V('V = vendredis, WE = samedis + dimanches de la grille', ids.every(id => L[id].vd === recompte[id].ven && L[id].we === recompte[id].sam + recompte[id].dim));
  V('la part de week-ends vient de l\'onglet', ids.every(id => L[id].cWe === gas.champsWeStats_(stRows, stRows.findIndex(x => x[0] === id)).cWe));
  /* Un dimanche cédé, comme après un don : WE −1 pour l'un, +1 pour l'autre. */
  let cp = null;
  for (let r = 3; r < g.length && !cp; r++) for (let k = 1; k < NC && !cp; k++)
    if (dateCol(k).getDay() === 0 && /^G2?$/.test(g[r][k])) for (let r2 = 3; r2 < g.length; r2++) if (r2 !== r && g[r2][0] && recompte[g[r2][0]] && !g[r2][k]) { cp = { r, r2, k }; break; }
  V('un dimanche à céder existe', !!cp);
  if (cp) {
    const A = g[cp.r][0], B = g[cp.r2][0];
    g[cp.r2][cp.k] = g[cp.r][cp.k]; g[cp.r][cp.k] = '';
    const L3 = {}; ctx.computeStatsLive(2027).forEach(x => { L3[x.medecin] = x; });
    V('dimanche cédé : WE −1 pour le donneur, +1 pour le receveur, vendredis inchangés',
      L3[A].we === L[A].we - 1 && L3[B].we === L[B].we + 1 && L3[A].vd === L[A].vd && L3[B].vd === L[B].vd, [L[A], L3[A], L[B], L3[B]].map(x => [x.vd, x.we]));
    g[cp.r][cp.k] = g[cp.r2][cp.k]; g[cp.r2][cp.k] = '';
  }
  const AV = avant('gas/code.gs');
  if (AV) {
    const c2 = { console, Logger: { log() {} }, Session: ctx.Session, Utilities: ctx.Utilities,
      SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => { throw new Error('x'); } } };
    c2.globalThis = c2; vm.createContext(c2); vm.runInContext(AV, c2);
    const l2 = c2.computeStatsLive(2027);
    V('AVANT : l\'instantané ne donnait aucun nombre de week-ends', l2.every(x => x.we === undefined));
  }
}

console.log('\n─── 5. L\'écran ───');
const carte = { name: 'A', total: 36, cTot: 37, je: 6, cJe: 6, vd: 7, cVd: 6, sa: 6, cSa: 6, di: 7, we: 13, cWe: 11, vjf: 1, cVjf: 1, jf: 2, cJf: 2, lu: 3, ma: 2, me: 5 };
const html = W.renderEquiteCards([carte, Object.assign({}, carte, { name: 'B', we: 11, di: 5, vd: 6 })], { axes: AX, ouverts: new Set(['A']) });
const ordre = (html.match(/eqv-lbl">(\w+)<\/div>/g) || []).map(x => x.replace(/eqv-lbl">|<\/div>/g, ''));
V('barres dans l\'ordre Ven, Sam, Dim, WE', ordre.join(',').indexOf('Jeu,Ven,Sam,Dim,WE,JF') >= 0, ordre);
V('WE : 13 pour une part de 11, en rouge', /eqv-fill" style="width:[\d.]+%;background:#CE1126"><\/div><div class="eqv-tick"[^>]*><\/div><\/div><div class="eqv-val">13<span> \/11/.test(html));
V('Dim : barre neutre, sans part', /eqv-lbl">Dim<\/div><div class="eqv-track"><div class="eqv-fill" style="width:[\d.]+%;background:#94A3B8;opacity:.5"><\/div><\/div><div class="eqv-val">7<\/div>/.test(html));
const v = W.eqVerdict(carte, { cTot: 37, cSa: 6, cJe: 6, cVd: 6, cWe: 11, cVjf: 1, cJf: 2 }, AX);
V('verdict « +2 WE » en rouge', v.t === '+2 WE' && v.c === '#CE1126', v);
V('les vendredis s\'abrègent « ven »', W.eqVerdict({ total: 37, vd: 4, we: 11 }, { cTot: 37, cVd: 6, cWe: 11 }, AX).t === '-2 ven');
const neutre = W.renderEquiteCards([Object.assign({}, carte, { cWe: undefined })], { axes: AX, ouverts: new Set(['A']) });
V('sans part de week-ends (années d\'avant) : WE neutre', /eqv-lbl">WE<\/div><div class="eqv-track"><div class="eqv-fill" style="width:[\d.]+%;background:#94A3B8;opacity:.5"><\/div><\/div><div class="eqv-val">13<\/div>/.test(neutre));
const PL = lire('planning.html'), AD = lire('admin.html');
V('portail MAR et comité déclarent les axes vendredis et week-ends', [PL, AD].every(x => /\['vd','cVd','vendredis'\],\['we','cWe','week-ends'\]/.test(x)));
V('portail MAR : la vue Initiale lit V et WE dans les statistiques', /vd:\(cb\.vd!==undefined/.test(PL) && /we:\(cb\.we!==undefined/.test(PL));
V('portail MAR et comité transmettent les dimanches', /di:s\.dim\|\|0, we:s\.we\|\|0/.test(PL) && /di:s\.dim\|\|0, we:s\.we\|\|0/.test(AD));
V('carte du MAR : week-ends = samedis + dimanches', /if\(w === 6 \|\| w === 0\) nWe\+\+/.test(PL));
const SRV = ['gas/gardes.gs', 'gas/miroir.gs'].map(lire).join('\n');
V('les quatre lecteurs de l\'onglet passent V et WE', (SRV.match(/champsWeStats_\((data|dChk), r\)/g) || []).length === 4);
const RAV = avant('partage/rendu_equite.js');
if (RAV) V('AVANT : pas de barre WE ni Dim', !/eqv-lbl">(WE|Dim)<\/div>/.test(charger(RAV).renderEquiteCards([carte], { axes: AX, ouverts: new Set(['A']) })));

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
