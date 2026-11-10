/* ═══ BANC — LOT D'INVERSION RÉA / MATER DEPUIS L'ÉDITEUR (10/11/2026) ═════
   POURQUOI CE SCÉNARIO EXISTE.
   Après la génération 2027, l'écart entre gardes réa (G) et mater (G2)
   atteignait 10 chez certains MAR. La correction inverse les rôles des deux
   MAR d'une même nuit, par un lot (fichier du Drive, jamais dans le code)
   que lotRolesAppliquer() écrit en une fois. Le danger : écrire à moitié,
   écrire sur une nuit qui a bougé entre-temps, ou changer le nombre de
   gardes de quelqu'un.

   CE QUI EST VÉRIFIÉ. Sur une année générée par le vrai générateur (effectif
   synthétique, aucun nom réel) : la vérification seule n'écrit rien ; le lot
   valide inverse exactement les deux rôles de chaque nuit, personne ne change
   de nombre de gardes ni de nuit, repos inchangés ; le planning est republié
   POUR L'ANNÉE DU LOT et les notifications armées ; un lot dont UNE nuit a
   bougé n'écrit RIEN ; une date en double est refusée. */
const path = require('path'), fs = require('fs'), vm = require('vm');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'gardes.gs'), 'utf8');
const DEBUT = '/* ── (10/11/2026) LOT D\'INVERSION RÉA / MATER';

const roster = H.defaultRoster();
const ss = H.makeSpreadsheet([
  H.makeSheet('MEDECINS', H.medecinsRows(roster)),
  H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
  H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
  H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
const ctx = H.buildContext(ss, []);
ctx.generateGardes(YEAR);
let charge = false;
function lancer(lot, ecrire) {
  const appels = { planning: [], miroir: 0, notif: [] };
  Object.assign(ctx, {
    DriveApp: { getFilesByName: () => { let n = 0; return { hasNext: () => n === 0, next: () => { n++; return { isTrashed: () => false, getBlob: () => ({ getDataAsString: () => JSON.stringify(lot) }) }; } }; } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    logAction: () => {}, generatePlanning: (y) => { appels.planning.push(y); },
    miroirPousserFamilles_: () => { appels.miroir++; }, notifPlanifier: (y) => { appels.notif.push(y); } });
  if (!ctx.SpreadsheetApp.flush) ctx.SpreadsheetApp.flush = () => {};
  const a = SRC.indexOf(DEBUT); if (a < 0) throw new Error('bloc du lot introuvable');
  if (!charge) { vm.runInContext(SRC.slice(a), ctx); charge = true; }
  return { res: JSON.parse(JSON.stringify(ctx._lotRoles_(ecrire))), appels };
}
const sh = ss.getSheetByName('GARDES_' + YEAR);
const d2c = ctx.buildDateToCol(sh._rows, YEAR);
const ligne = {}; sh._rows.forEach((r, i) => { if (i >= 3 && r[0]) ligne[String(r[0]).trim()] = i; });
const cell = (id, d) => String(sh._rows[ligne[id]][d2c[d]]).trim().toUpperCase();
const qui = (d, code) => Object.keys(ligne).find(id => cell(id, d) === code);
const nuits = Object.keys(d2c).filter(d => qui(d, 'G') && qui(d, 'G2')).sort();
const lotOk = { annee: YEAR, motif: 'banc', changements: [nuits[20], nuits[90]].map(d => ({ date: d, g: qui(d, 'G'), g2: qui(d, 'G2') })) };
V('deux nuits complètes trouvées dans l\'année générée', nuits.length > 100 && lotOk.changements.every(c => c.g && c.g2));
const bilan = () => { const b = {}; Object.keys(d2c).forEach(d => Object.keys(ligne).forEach(id => { const v = cell(id, d);
  if (v) { b[id] = b[id] || {}; b[id][v] = (b[id][v] || 0) + 1; } })); return b; };
const b0 = bilan(), avant = JSON.stringify(sh._rows);

console.log('\n═══ 1. Vérification seule : rien n\'est écrit ═══');
const r1 = lancer(lotOk, false);
V('le lot est déclaré conforme', r1.res.ok === true && r1.res.verifie === 2, r1.res);
V('l\'onglet n\'a pas bougé', JSON.stringify(sh._rows) === avant);
V('ni republication ni notification', r1.appels.planning.length === 0 && r1.appels.notif.length === 0, r1.appels);

console.log('\n═══ 2. Lot valide : rôles inversés, rien d\'autre ne bouge ═══');
const r2 = lancer(lotOk, true);
V('le lot est écrit', r2.res.ok === true && r2.res.ecrit === 2, r2.res);
V('chaque nuit : l\'ancien réa est en mater, l\'ancien mater en réa', lotOk.changements.every(c => cell(c.g, c.date) === 'G2' && cell(c.g2, c.date) === 'G'));
const b1 = bilan();
const tot = (b, id) => ((b[id] || {}).G || 0) + ((b[id] || {}).G2 || 0);
V('personne ne change de nombre de gardes', Object.keys(ligne).every(id => tot(b0, id) === tot(b1, id)));
const autres = c => Object.keys(b0[c] || {}).filter(k => k !== 'G' && k !== 'G2').every(k => (b0[c][k] || 0) === ((b1[c] || {})[k] || 0));
V('repos, récupérations et autres codes inchangés pour tous', Object.keys(ligne).every(autres));
const changees = []; sh._rows.forEach((r, i) => r.forEach((v, j) => { if (String(v) !== String(JSON.parse(avant)[i][j])) changees.push([i, j]); }));
V('exactement 4 cases changées (2 nuits × 2 MAR)', changees.length === 4, changees.length);
V('planning ' + YEAR + ' republié, portail rafraîchi, notifications armées pour ' + YEAR,
  r2.appels.planning.length === 1 && Number(r2.appels.planning[0]) === YEAR && r2.appels.miroir === 1 && r2.appels.notif.length === 1 && Number(r2.appels.notif[0]) === YEAR, r2.appels);

console.log('\n═══ 3. Une nuit a bougé : RIEN n\'est écrit ═══');
const apres2 = JSON.stringify(sh._rows);
const r3 = lancer(lotOk, true);   // rejoué : les rôles ne sont plus dans l'état attendu
V('le lot rejoué est refusé', r3.res.ok === false && r3.res.problemes.length >= 2, r3.res);
V('l\'onglet n\'a pas bougé d\'une case', JSON.stringify(sh._rows) === apres2);
V('ni republication ni notification', r3.appels.planning.length === 0 && r3.appels.notif.length === 0, r3.appels);
const mixte = { annee: YEAR, motif: 'banc', changements: [{ date: nuits[40], g: qui(nuits[40], 'G'), g2: qui(nuits[40], 'G2') }, lotOk.changements[0]] };
const r3b = lancer(mixte, true);
V('une seule nuit périmée suffit à tout refuser (la nuit valide n\'est pas écrite)', r3b.res.ok === false && JSON.stringify(sh._rows) === apres2, r3b.res);

console.log('\n═══ 4. Date en double : refusé ═══');
const d = nuits[60], dbl = { annee: YEAR, motif: 'banc', changements: [{ date: d, g: qui(d, 'G'), g2: qui(d, 'G2') }, { date: d, g: qui(d, 'G'), g2: qui(d, 'G2') }] };
const r4 = lancer(dbl, true);
V('le lot est refusé et rien n\'est écrit', r4.res.ok === false && JSON.stringify(sh._rows) === apres2, r4.res);

console.log('\n═══ 5. Contre-épreuve : sans le contrôle, le lot périmé serait écrit ═══');
{ const FAUX = SRC.replaceAll("if (pbs.length) {\n      Logger.log('LOT REFUSÉ", "if (false && pbs.length) {\n      Logger.log('LOT REFUSÉ");
  const i = FAUX.indexOf('function _lotRoles_('), j = FAUX.indexOf('/* ── (10/11/2026) ONGLET HISTORIQUE');
  V('version sans contrôle construite', FAUX !== SRC && i > 0 && j > i);
  const av = JSON.stringify(sh._rows);
  ctx._lotRoles_ = vm.runInContext('(' + FAUX.slice(i, j).trim() + ')', ctx);   // seule la fonction est remplacée
  ctx._lotRoles_(true);   // le dernier lot (date en double) passe sans contrôle
  V('… elle écrase les nuits : le contrôle est bien ce qui protège', JSON.stringify(sh._rows) !== av); }

console.log('\n═══ 6. Aucun nom dans le code : le lot vit dans le Drive ═══');
{ const bloc = SRC.slice(SRC.indexOf(DEBUT), SRC.indexOf('/* ── (10/11/2026) ONGLET HISTORIQUE'));
  V('le code ne contient que le nom du fichier, aucun changement en dur', /const LOT_ROLES_FICHIER = 'lot-roles-2027\.json';/.test(bloc) && !/g2?:\s*'[A-Z]/.test(bloc)); }

console.log(`\n${ko === 0 ? '✅' : '❌'} banc_lot_roles : ${ok} vérifications, ${ko} échec(s)`);
if (ko > 0) process.exit(1);
