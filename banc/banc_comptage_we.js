/* ═══ BANC — LES WEEK-ENDS SE COMPTENT D'UNE SEULE FAÇON (12/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE. Vu le 12/11/2026 sur les gardes 2027 attribuées :
   un MAR à 13 week-ends de garde, deux autres à 10, même quotité — et l'écran
   d'équité ne le montrait pas. Trois comptes portaient l'étiquette « week-ends » :
   l'onglet de statistiques (92 vendredis-dimanches pour 104 vendredis de garde :
   le compteur du générateur perdait ceux que ses dernières passes déplacent),
   l'instantané (les vendredis seuls) et la carte du MAR (sans les fériés collés).
   Et le nombre de week-ends de chacun n'était affiché nulle part.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. La règle, sur des cas écrits à la main : un vendredi-dimanche se compte
      par son vendredi (comme le générateur le répartit) ; un week-end compte dès
      une garde ven/sam/dim, le lundi férié qui suit et le jeudi férié qui
      précède comptent avec lui.
   2. Le serveur (compterWeekends_) et la page (compterWeekends) disent la même
      chose, sur 300 plannings tirés au hasard.
   3. Une vraie génération : la colonne VD de l'onglet = le recompte de la grille ;
      WE, CIBLE WE, PART EXACTE WE présentes et justes ; deux MAR de même part
      ont la même cible (aucun départage).
   4. L'instantané compte les vrais vendredis-dimanches et les week-ends.
   5. L'écran : une barre « WE », la case neutre sans cible, « VD » et « WE »
      dans les verdicts ; les deux pages déclarent l'axe ; la carte du MAR
      compte avec la même règle.
   Contre-preuves : le code d'avant (git) compte chaque vendredi, n'écrit pas
   de colonne WE, et n'affiche pas de barre WE. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const avant = f => { try { return execSync('git show HEAD:' + f, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
/* HEAD = le dépôt avant ce lot tant qu'il n'est pas commité ; une fois commité,
   on remonte au commit qui a introduit compterWeekends_. */
function sourceAvant(f) {
  const h = avant(f);
  if (h && h.indexOf('compterWeekends') < 0) return h;
  try {
    const c = execSync('git log --format=%H -S compterWeekends -- ' + f, { cwd: RACINE, encoding: 'utf8' }).trim().split('\n').pop();
    return c ? execSync('git show ' + c + '~1:' + f, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) : null;
  } catch (e) { return null; }
}

/* Le serveur : la fonction seule, extraite de code.gs. */
const CODE = lire('gas/code.gs');
const extraire = (src, nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return null;
  let k = src.indexOf('{', i), n = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) return src.slice(i, j + 1); } } return null; };
const gas = {}; vm.createContext(gas);
['compterWeekends_', 'partsWeekends_', 'champsWeStats_'].forEach(n => { const f = extraire(CODE, n); if (f) vm.runInContext(f, gas); });
/* La page : partage/rendu_equite.js. */
const AX = [['total','cTot','total'],['sa','cSa','samedis'],['je','cJe','jeudis'],['vd','cVd','vendredis-dimanches'],['we','cWe','week-ends'],['vjf','cVjf','veilles fériés'],['jf','cJf','fériés']];
function charger(src) { const ctx = { window: {} }; ctx.window.AX_EQUITE = AX; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window; }
const W = charger(lire('partage/rendu_equite.js'));

console.log('\n─── 1. La règle, cas par cas (2027) ───');
const FER = new Set(['2027-05-17', '2027-05-27', '2027-11-01', '2027-12-25']);
const fe = d => FER.has(d);
const CAS = [
  ['vendredi + dimanche du même MAR', ['2027-01-29', '2027-01-31'], { we: 1, vd: 1 }],
  ['vendredi seul : 1 week-end, et le vendredi-dimanche compte pour lui', ['2027-01-29'], { we: 1, vd: 1 }],
  ['dimanche seul : 1 week-end, pas de vendredi-dimanche', ['2027-01-31'], { we: 1, vd: 0 }],
  ['samedi seul : 1 week-end', ['2027-02-06'], { we: 1, vd: 0 }],
  ['vendredi-dimanche puis samedi suivant : 2 week-ends', ['2027-01-29', '2027-01-31', '2027-02-06'], { we: 2, vd: 1 }],
  ['samedi + lundi férié : 1 week-end', ['2027-05-15', '2027-05-17'], { we: 1, vd: 0 }],
  ['lundi férié seul : compte avec son week-end', ['2027-11-01'], { we: 1, vd: 0 }],
  ['jeudi férié + samedi : 1 week-end', ['2027-05-27', '2027-05-29'], { we: 1, vd: 0 }],
  ['un mardi : 0 week-end', ['2027-03-02'], { we: 0, vd: 0 }],
  ['un lundi ordinaire : 0 week-end', ['2027-03-01'], { we: 0, vd: 0 }],
  ['fête : samedi 25/12 compte', ['2027-12-25'], { we: 1, vd: 0 }],
  ['vendredi 31/12 + dimanche 02/01 (à cheval sur l\'année)', ['2027-12-31', '2028-01-02'], { we: 1, vd: 1 }],
];
CAS.forEach(([t, j, att]) => {
  const g = gas.compterWeekends_(j, fe), p = W.compterWeekends(j, fe);
  V('serveur — ' + t, g.we === att.we && g.vd === att.vd, g);
  V('page    — ' + t, p.we === att.we && p.vd === att.vd, p);
});

console.log('\n─── 2. Serveur et page disent la même chose (300 plannings au hasard) ───');
let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const J0 = new Date(2027, 0, 4, 12); let diff = 0;
for (let k = 0; k < 300; k++) {
  const j = []; for (let i = 0; i < 364; i++) if (rnd() < 0.1) { const d = new Date(J0); d.setDate(d.getDate() + i); j.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
  const a = gas.compterWeekends_(j, fe), b = W.compterWeekends(j, fe);
  if (a.we !== b.we || a.vd !== b.vd) diff++;
}
V('aucun écart entre les deux règles', diff === 0, diff);

console.log('\n─── 3. Parts de week-ends : au prorata, sans départage ───');
const P = gas.partsWeekends_([{ id: 'A', we: 13, poids: 11.02 }, { id: 'B', we: 10, poids: 11.02 }, { id: 'C', we: 10, poids: 11.02 }, { id: 'D', we: 9, poids: 9.92 }]);
V('la somme des parts = les week-ends de l\'année (42)', Math.abs(P.A.part + P.B.part + P.C.part + P.D.part - 42) < 0.01, P);
V('même part ⇒ même cible (A, B, C)', P.A.cible === P.B.cible && P.B.cible === P.C.cible, P);
V('la cible est la part arrondie au plus près', P.A.cible === Math.round(P.A.part) && P.D.cible === Math.round(P.D.part), P);
const cs = gas.champsWeStats_(['MEDECIN', 'WE', 'CIBLE WE'], ['X', 12, 11]);
V('lecture par nom de colonne', cs.we === 12 && cs.cWe === 11, cs);
const cs0 = gas.champsWeStats_(['MEDECIN', 'VD'], ['X', 5]);
V('colonne absente (années d\'avant) : champ absent, pas une part à zéro', cs0.we === undefined && cs0.cWe === undefined, cs0);

console.log('\n─── 4. Une vraie génération (simulateur) ───');
const H = require(path.join(RACINE, 'simulateur', 'harness.js'));
const { ss, error, ctx } = H.runScenario({ year: 2027 });
V('génération sans erreur', !error, error);
const st = H.readStats(ss, 2027);
const g = ss.getSheetByName('GARDES_2027')._rows;
const hdrG = g[2];   // numéros de jour ; dates = début du planning + i
const debut = new Date(2027, 0, 4, 12), dateCol = c => { const d = new Date(debut); d.setDate(d.getDate() + c - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const jf = new Set([...ctx.getJoursFeries(2027), ...ctx.getJoursFeries(2028)]);
const recompte = {};
for (let r = 3; r < g.length; r++) { const id = g[r][0]; if (!id) continue; const j = [];
  for (let c = 1; c < hdrG.length; c++) if (g[r][c] === 'G' || g[r][c] === 'G2') j.push(dateCol(c));
  // recompte INDÉPENDANT, écrit ici sans la fonction testée
  const set = new Set(j), ven = new Set(); let vd = 0;
  j.forEach(ds => { const d = new Date(ds + 'T12:00:00'), w = d.getDay(); let f = null;
    if (w === 5) f = 0; else if (w === 6) f = -1; else if (w === 0) f = -2; else if (w === 1 && jf.has(ds)) f = -3; else if (w === 4 && jf.has(ds)) f = 1;
    if (f !== null) { const x = new Date(d); x.setDate(x.getDate() + f); ven.add(x.toDateString()); }
    if (w === 5) vd++; });
  recompte[id] = { we: ven.size, vd }; }
const ids = Object.keys(st.byId).filter(id => recompte[id]);
V('l\'onglet porte les colonnes WE, CIBLE WE, PART EXACTE WE', ['WE', 'CIBLE WE', 'PART EXACTE WE'].every(h => st.hdr.indexOf(h) >= 0), st.hdr.slice(-4));
V('les colonnes d\'avant ne bougent pas (VD reste la 21e, CIBLE JF la 23e)', st.hdr[20] === 'VD' && st.hdr[22] === 'CIBLE JF' && st.hdr[32] === 'SOUHAITS POSSIBLES OBTENUS');
const vdKo = ids.filter(id => +st.byId[id]['VD'] !== recompte[id].vd);
V('VD de l\'onglet = vendredis de garde de la grille finale, pour chaque MAR', vdKo.length === 0, vdKo.map(id => [id, st.byId[id]['VD'], recompte[id].vd]));
const weKo = ids.filter(id => +st.byId[id]['WE'] !== recompte[id].we);
V('WE de l\'onglet = week-ends de garde de la grille, pour chaque MAR', weKo.length === 0, weKo.map(id => [id, st.byId[id]['WE'], recompte[id].we]));
const totWe = ids.reduce((a, id) => a + recompte[id].we, 0), totPart = Object.keys(st.byId).reduce((a, id) => a + (+st.byId[id]['PART EXACTE WE'] || 0), 0);
V('la somme des parts de week-ends = les week-ends de l\'année', Math.abs(totWe - totPart) < 0.05, [totWe, totPart]);
const parPart = {}; Object.keys(st.byId).forEach(id => { const k = String(st.byId[id]['PART EXACTE WE']); (parPart[k] = parPart[k] || new Set()).add(st.byId[id]['CIBLE WE']); });
V('même part ⇒ même cible de week-ends, pour tous', Object.values(parPart).every(x => x.size === 1));
V('au moins deux MAR partagent une part (sinon le test serait vide)', Object.keys(st.byId).length - Object.keys(parPart).length >= 2);

/* Les fêtes imposées par le comité (onglet FETES) : le vendredi 24/12 seul d'un
   binôme n'entrait pas dans le compteur des vendredis-dimanches — sur 2027, le
   même défaut que pour deux MAR de l'équipe. Même scénario, code d'avant et d'après. */
const SCEN_FETES = [['24/12/2027', 'FAUVEL', 'ORVAL'], ['25/12/2027', 'ME', 'DU'], ['26/12/2027', 'AU', 'FAUVEL'],
  ['31/12/2027', 'PELLETIER', 'RIVIERE'], ['01/01/2028', 'SABLON', 'SERVANT'], ['02/01/2028', 'PELLETIER', 'RIVIERE']];
function genFetes(src) {
  const r = H.defaultRoster(), ss2 = H.makeSpreadsheet([H.makeSheet('MEDECINS', H.medecinsRows(r)), H.makeSheet('INDISPOS_2027', H.indisposRows(2027, r, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(2027)), H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
    H.makeSheet('FETES_2027', [['Date', 'MAR 1', 'MAR 2']].concat(SCEN_FETES.map(l => l.slice())))]);
  const c3 = H.buildContext(ss2, [], src); let e3 = null; try { c3.generateGardes(2027, { tirage: 1 }); } catch (e) { e3 = e.message; }
  return { e3, st3: H.readStats(ss2, 2027) };
}
const FN = genFetes(null);
V('avec les fêtes imposées : VD de l\'onglet = vendredis de garde, pour chaque MAR', !FN.e3 && Object.values(FN.st3.byId).every(o => +o.VD === +o.VEN),
  FN.e3 || Object.entries(FN.st3.byId).filter(([k, o]) => +o.VD !== +o.VEN).map(([k, o]) => k + ' ' + o.VD + '/' + o.VEN));
const GAV = sourceAvant('gas/generateur_gardes.gs');
if (GAV) {
  const FA = genFetes(GAV);
  const faux = FA.st3 ? Object.entries(FA.st3.byId).filter(([k, o]) => +o.VD !== +o.VEN).map(([k]) => k) : [];
  V('AVANT : le vendredi de fête imposé manquait au compteur (FAUVEL, ORVAL)', !FA.e3 && faux.indexOf('FAUVEL') >= 0 && faux.indexOf('ORVAL') >= 0, FA.e3 || faux);
  V('AVANT : le générateur n\'écrivait aucune colonne de week-ends', FA.st3 && FA.st3.hdr.indexOf('WE') < 0 && FA.st3.hdr.indexOf('CIBLE WE') < 0);
} else V('historique git disponible pour la contre-preuve', false);

console.log('\n─── 5. L\'instantané (computeStatsLive) ───');
ctx.Session = { getScriptTimeZone: () => 'Europe/Paris' };
ctx.Utilities = { formatDate: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
let live = null; try { live = ctx.computeStatsLive(2027); } catch (e) { live = e.message; }
V('l\'instantané se calcule', Array.isArray(live), live);
if (Array.isArray(live)) {
  const L = {}; live.forEach(x => { L[x.medecin] = x; });
  const lk = ids.filter(id => L[id] && (L[id].vd !== recompte[id].vd || L[id].we !== recompte[id].we));
  V('vendredis-dimanches et week-ends = recompte de la grille', lk.length === 0, lk.map(id => [id, L[id].vd, L[id].we, recompte[id]]));
  V('la cible de week-ends vient de l\'onglet', ids.every(id => L[id].cWe === +st.byId[id]['CIBLE WE']));
  /* Un vendredi-dimanche coupé, comme après un échange : le dimanche passe à
     un autre MAR. Le simulateur n'en produit pas forcément : on le fabrique. */
  let coupe = null;
  for (let r = 3; r < g.length && !coupe; r++) for (let c = 1; c + 2 < hdrG.length && !coupe; c++)
    if (new Date(dateCol(c) + 'T12:00:00').getDay() === 5 && /^G2?$/.test(g[r][c]) && /^G2?$/.test(g[r][c + 2]))
      for (let r2 = 3; r2 < g.length; r2++) if (r2 !== r && g[r2][0] && !g[r2][c + 2] && recompte[g[r2][0]]) { coupe = { r, r2, c: c + 2 }; break; }
  V('un vendredi-dimanche à couper existe', !!coupe);
  if (coupe) {
    g[coupe.r2][coupe.c] = g[coupe.r][coupe.c]; g[coupe.r][coupe.c] = '';
    const id = g[coupe.r][0];
    const L3 = {}; ctx.computeStatsLive(2027).forEach(x => { L3[x.medecin] = x; });
    V('dimanche cédé : son vendredi-dimanche lui reste compté (il tient le vendredi)', L3[id].vd === recompte[id].vd, [L3[id].vd, recompte[id].vd]);
    V('…et son week-end aussi ; celui qui reçoit le dimanche gagne un week-end, pas un vendredi-dimanche', L3[id].we === recompte[id].we && L3[g[coupe.r2][0]].we === recompte[g[coupe.r2][0]].we + 1 && L3[g[coupe.r2][0]].vd === recompte[g[coupe.r2][0]].vd, [L3[id], L3[g[coupe.r2][0]], recompte[g[coupe.r2][0]]]);
    const AV = sourceAvant('gas/code.gs');
    if (AV) {
      const c2 = { console, Logger: { log() {} }, Session: ctx.Session, Utilities: ctx.Utilities,
        SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => { throw new Error('x'); } } };
      c2.globalThis = c2; vm.createContext(c2);
      vm.runInContext(AV, c2);
      const L2 = {}; c2.computeStatsLive(2027).forEach(x => { L2[x.medecin] = x; });
      V('AVANT : aucun nombre de week-ends', ids.every(i => L2[i].we === undefined));
    } else V('historique git disponible pour la contre-preuve (cloner sans --depth 1)', false);
  }
}

console.log('\n─── 6. L\'écran ───');
const carte = { name: 'A', total: 36, cTot: 37, sa: 6, cSa: 6, je: 6, cJe: 6, vd: 7, cVd: 6, we: 13, cWe: 11, vjf: 1, cVjf: 1, jf: 2, cJf: 2, lu: 3, ma: 2, me: 5 };
const html = W.renderEquiteCards([carte, Object.assign({}, carte, { name: 'B', we: 11, vd: 6 })], { axes: AX, ouverts: new Set(['A']) });
V('une barre « WE » sur la carte dépliée', /eqv-lbl">WE<\/div>/.test(html));
V('elle montre 13 pour une part de 11, en rouge', /eqv-fill" style="width:[\d.]+%;background:#CE1126"><\/div><div class="eqv-tick"[^>]*><\/div><\/div><div class="eqv-val">13<span> \/11/.test(html));
const v = W.eqVerdict(carte, { cTot: 37, cSa: 6, cJe: 6, cVd: 6, cWe: 11, cVjf: 1, cJf: 2 }, AX);
V('verdict « +2 WE » en rouge', v.t === '+2 WE' && v.c === '#CE1126', v);
const v2 = W.eqVerdict({ total: 37, vd: 4, we: 11 }, { cTot: 37, cVd: 6, cWe: 11 }, AX);
V('les vendredis-dimanches s\'abrègent « VD »', v2.t === '-2 VD', v2);
const sans = W.renderEquiteCards([Object.assign({}, carte, { cWe: undefined })], { axes: AX, ouverts: new Set(['A']) });
V('sans part de week-ends (années d\'avant) : barre neutre, pas de rouge', /eqv-lbl">WE<\/div><div class="eqv-track"><div class="eqv-fill" style="width:[\d.]+%;background:#94A3B8;opacity:.5"><\/div><\/div><div class="eqv-val">13<\/div>/.test(sans));
const PL = lire('planning.html'), AD = lire('admin.html');
V('portail MAR : l\'axe week-ends est déclaré', /\['vd','cVd','vendredis-dimanches'\],\['we','cWe','week-ends'\]/.test(PL));
V('comité : l\'axe week-ends est déclaré', /\['vd','cVd','vendredis-dimanches'\],\['we','cWe','week-ends'\]/.test(AD));
V('portail MAR : la vue Initiale lit week-ends et vendredis-dimanches recomptés', /we:\(cb\.we!==undefined/.test(PL) && /vd:\(cb\.vd!==undefined/.test(PL));
V('portail MAR : l\'instantané transmet les week-ends', /we:s\.we\|\|0, cWe:_cibOpt\(s\.cWe\)/.test(PL));
V('comité : les week-ends transmis aux cartes', /we:s\.we\|\|0, cWe:/.test(AD));
V('carte du MAR : même règle de compte (compterWeekends)', /window\.compterWeekends\(jours, ds => feries\.has\(ds\)\)/.test(PL));
const SRV = ['gas/gardes.gs', 'gas/miroir.gs'].map(lire).join('\n');
V('les quatre lecteurs de l\'onglet passent les week-ends', (SRV.match(/champsWeStats_\(/g) || []).length === 4, (SRV.match(/champsWeStats_\(/g) || []).length);
const RAV = sourceAvant('partage/rendu_equite.js');
if (RAV) {
  const WA = charger(RAV);
  V('AVANT : pas de barre « WE » sur la carte', !/eqv-lbl">WE<\/div>/.test(WA.renderEquiteCards([carte], { axes: AX, ouverts: new Set(['A']) })));
} else V('historique git disponible pour la contre-preuve', false);

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
