/* ═══ BANC — LOT DE 18 H DEPUIS L'ÉDITEUR (10/11/2026) ════════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Après la génération 2027, des 18 h tombaient la veille d'une absence et le
   18 h du vendredi n'allait pas toujours à un MAR de garde le samedi. La
   correction se fait par un lot (fichier du Drive, jamais dans le code) que
   lot18hAppliquer() écrit en une fois. Le danger : écrire à moitié, ou écrire
   sur une case qui a bougé entre-temps.

   CE QUI EST VÉRIFIÉ. Sur une année générée par le vrai générateur (effectif
   synthétique, aucun nom réel) : la vérification seule n'écrit rien ; le lot
   valide est écrit, chacun garde son nombre de 18 h, le planning est republié
   et les notifications armées ; un lot dont UNE case a bougé n'écrit RIEN ;
   un lot qui change le nombre de 18 h d'un MAR est refusé. */
const path = require('path'), fs = require('fs'), vm = require('vm');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'gardes.gs'), 'utf8');
const DEBUT = '/* ── (10/11/2026) LOT DE 18 H';

function monde() {
  const roster = H.defaultRoster();
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, []);
  ctx.generateGardes(YEAR);
  return { ss, ctx };
}
function lancer(w, lot, ecrire, src) {
  const appels = { planning: 0, miroir: 0, notif: 0 };
  Object.assign(w.ctx, {
    DriveApp: { getFilesByName: () => { let n = 0; return { hasNext: () => n === 0, next: () => { n++; return { isTrashed: () => false, getBlob: () => ({ getDataAsString: () => JSON.stringify(lot) }) }; } }; } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    logAction: () => {}, generatePlanning: () => { appels.planning++; },
    miroirPousserFamilles_: () => { appels.miroir++; }, notifPlanifier: () => { appels.notif++; } });
  if (!w.ctx.SpreadsheetApp.flush) w.ctx.SpreadsheetApp.flush = () => {};
  const S = src || SRC, a = S.indexOf(DEBUT); if (a < 0) throw new Error('bloc du lot introuvable');
  if (!w.charge) { vm.runInContext(S.slice(a), w.ctx); w.charge = true; }
  const res = w.ctx._lot18h_(ecrire);
  return { res: JSON.parse(JSON.stringify(res)), appels };
}
const w = monde();
const sh = w.ss.getSheetByName('GARDES_' + YEAR);
const d2c = w.ctx.buildDateToCol(sh._rows, YEAR);
const ligne = {}; sh._rows.forEach((r, i) => { if (i >= 3 && r[0]) ligne[String(r[0]).trim()] = i; });
const cell = (id, d) => String(sh._rows[ligne[id]][d2c[d]]).trim();
const h18 = {}; Object.keys(d2c).forEach(d => Object.keys(ligne).forEach(id => { if (cell(id, d) === '18') (h18[id] = h18[id] || []).push(d); }));
const ids = Object.keys(h18);
/* Un échange croisé valide au niveau des cases : A a le 18 h le jour d1 et B est libre ce jour-là ; B a le 18 h le jour d2 et A est libre. */
let lotOk = null;
for (const A of ids) { for (const B of ids) { if (A === B) continue;
  const d1 = h18[A].find(d => cell(B, d) === ''), d2 = h18[B].find(d => cell(A, d) === '');
  if (d1 && d2) { lotOk = { annee: YEAR, motif: 'banc', changements: [{ date: d1, avant: A, apres: B }, { date: d2, avant: B, apres: A }] }; break; } }
  if (lotOk) break; }
V('un échange croisé de 18 h a été trouvé dans l\'année générée', !!lotOk);
const compte = () => { const c = {}; Object.keys(d2c).forEach(d => Object.keys(ligne).forEach(id => { if (cell(id, d) === '18') c[id] = (c[id] || 0) + 1; })); return JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]])); };
const avant = JSON.stringify(sh._rows), c0 = compte();

console.log('\n═══ 1. Vérification seule : rien n\'est écrit ═══');
const r1 = lancer(w, lotOk, false);
V('le lot est déclaré conforme', r1.res.ok === true && r1.res.verifie === 2, r1.res);
V('l\'onglet n\'a pas bougé', JSON.stringify(sh._rows) === avant);
V('ni republication ni notification', r1.appels.planning === 0 && r1.appels.notif === 0, r1.appels);

console.log('\n═══ 2. Lot valide : écrit, republié, notifié ═══');
const r2 = lancer(w, lotOk, true);
const [c1, c2] = lotOk.changements;
V('le lot est écrit', r2.res.ok === true && r2.res.ecrit === 2, r2.res);
V('chaque case porte le nouveau titulaire', cell(c1.apres, c1.date) === '18' && cell(c1.avant, c1.date) === '' && cell(c2.apres, c2.date) === '18' && cell(c2.avant, c2.date) === '');
V('chacun garde son nombre de 18 h', compte() === c0);
V('planning republié, portail rafraîchi, notifications armées', r2.appels.planning === 1 && r2.appels.miroir === 1 && r2.appels.notif === 1, r2.appels);

console.log('\n═══ 3. Une case a bougé : RIEN n\'est écrit ═══');
const apres2 = JSON.stringify(sh._rows);
const r3 = lancer(w, lotOk, true);   // rejoué : les cases ne sont plus dans l'état attendu
V('le lot rejoué est refusé', r3.res.ok === false && r3.res.problemes.length >= 1, r3.res);
V('l\'onglet n\'a pas bougé', JSON.stringify(sh._rows) === apres2);
V('ni republication ni notification', r3.appels.planning === 0 && r3.appels.notif === 0, r3.appels);
{ /* Tout ou rien : la première case est valide, la seconde non. */
  const w2 = monde(); const s2 = w2.ss.getSheetByName('GARDES_' + YEAR); const av = JSON.stringify(s2._rows);
  const lotMixte = { annee: YEAR, changements: [lotOk.changements[0], { date: lotOk.changements[1].date, avant: lotOk.changements[0].avant, apres: lotOk.changements[1].apres }] };
  const r4 = lancer(w2, lotMixte, true);
  V('une seule case fausse sur deux : refus, et la bonne case n\'est pas écrite non plus', r4.res.ok === false && JSON.stringify(s2._rows) === av, r4.res); }

console.log('\n═══ 4. Un lot qui change le nombre de 18 h d\'un MAR est refusé ═══');
{ const w3 = monde(); const s3 = w3.ss.getSheetByName('GARDES_' + YEAR); const av = JSON.stringify(s3._rows);
  const r5 = lancer(w3, { annee: YEAR, changements: [lotOk.changements[0]] }, true);
  V('refusé (solde non nul)', r5.res.ok === false && r5.res.problemes.some(p => /nombre de 18 h/.test(p)), r5.res);
  V('rien n\'est écrit', JSON.stringify(s3._rows) === av); }

console.log('\n═══ 4 bis. Contre-épreuve : sans le contrôle, le lot faux serait écrit ═══');
{ const FAUX = SRC.replace('if (pbs.length) {', 'if (false && pbs.length) {');
  V('version sans contrôle construite', FAUX !== SRC);
  const w4 = monde(); const s4 = w4.ss.getSheetByName('GARDES_' + YEAR); const av = JSON.stringify(s4._rows);
  lancer(w4, { annee: YEAR, changements: [lotOk.changements[0]] }, true, FAUX);
  V('… elle écrit le lot déséquilibré : le contrôle est bien ce qui protège', JSON.stringify(s4._rows) !== av); }

console.log('\n═══ 5. Aucun nom dans le code : le lot vit dans le Drive ═══');
V('le code ne contient que le nom du fichier, pas de changement en dur', /const LOT_18H_FICHIER = 'lot-18h-2027\.json';/.test(SRC) && !/avant:\s*'[A-Z]/.test(SRC.slice(SRC.indexOf(DEBUT))));

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
