/* ═══ BANC — SEMAINES RÉA 1 ET ÉQUITÉ (24/10/2026) ═══

   Règle du responsable : la semaine Réa 1 est sanctuarisée. Le MAR désigné
   Réa 1 fait la réanimation du lundi au vendredi : aucune garde du dimanche soir
   au jeudi soir, ni récupération ni 18 h du lundi au vendredi. Il garde le
   vendredi soir, le samedi et le week-end qui clôt sa semaine. Le tableau de
   l'équipe réa est collé dans l'onglet REA1_{année}. Les souhaits posés sur une
   nuit Réa 1 de leur auteur sont retirés et signalés.

   « L'équité reste le maître mot » : constaté sur les demandes 2027, bloquer
   ces semaines laissait un MAR de l'équipe réa à 2 VD de sa cible, faute
   d'échange possible (l'optimiseur ne déplace qu'un créneau à la fois). D'où la
   réparation par ÉCHANGE de créneaux (8c-ter) et l'assouplissement automatique
   de la règle du couple de week-end (seconde série de plannings sans son bonus).

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const fr = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const estG = v => v === 'G' || v === 'G2';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

/* Équipe réa de 5 : trois désignés par leurs initiales (colonne INITIALES du
   harnais : deux premières lettres, uniques pour eux), deux par identifiant. */
const EQUIPE = [['AUBERT', 'AU'], ['DURAND', 'DU'], ['FAUVEL', 'FAUVEL'], ['MERCIER', 'ME'], ['ORVAL', 'ORVAL']];
const SOUHAIT_REA = ['AUBERT', '2027-01-05'];   // mardi de sa 1re semaine Réa 1 → doit être retiré

function jeu(seed) {
  let s = seed * 7919 + 13; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const roster = h.defaultRoster(), im = {};
  roster.forEach(([id, p, q, f]) => {
    if (f.noGarde) return; im[id] = {};
    for (let b = 0; b < 4; b++) { const st = addD(D0, Math.floor(rnd() * 350)); const n = 3 + Math.floor(rnd() * 8); for (let k = 0; k < n; k++) im[id][addD(st, k)] = 'VAC'; }
    const ns = Math.floor(rnd() * 10); for (let k = 0; k < ns; k++) { const x = addD(D0, Math.floor(rnd() * 355)); if (!im[id][x]) im[id][x] = 'SOUHAIT'; }
  });
  /* Le tableau réa : chaque semaine un Réa 1 tiré de l'équipe, à tour de rôle.
     Ses vacances posées sur sa propre semaine sont retirées (le tableau de
     l'équipe réa en tient compte dans la vraie vie). */
  const tab = [['Semaine n°', 'Du', 'Au', 'Cycle', 'REA 1 (1re semaine)', 'REA 2 (2e semaine)']];
  for (let w = 0; w < 52; w++) {
    const lun = addD(D0, 7 * w), [id, code] = EQUIPE[w % 5];
    for (let k = -1; k <= 4; k++) { const d = addD(lun, k); if (im[id][d] && im[id][d] !== 'SOUHAIT') delete im[id][d]; }
    tab.push([String(w + 1), fr(lun), fr(addD(lun, 4)), 'A1', code, '']);
  }
  im[SOUHAIT_REA[0]][SOUHAIT_REA[1]] = 'SOUHAIT';
  return { roster, im, tab };
}
function classeur({ roster, im, tab }, avecRea, cfg) {
  const f = [h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', (cfg || [['CLE', 'VALEUR']]).map(l => l.slice()))];
  if (avecRea) f.push(h.makeSheet('REA1_' + YEAR, tab.map(l => l.slice())));
  return h.makeSpreadsheet(f);
}
function generer(j, avecRea, src) {
  const ss = classeur(j, avecRea), logs = [];
  const ctx = h.buildContext(ss, logs, src || null); let err = null, rep = null;
  try { const t = ctx.choisirMeilleurTirage(YEAR); rep = ctx.generateGardes(YEAR, { dryRun: true, tirage: t }); ctx.generateGardes(YEAR, { tirage: t }); }
  catch (e) { err = e.message; }
  const sh = ss.getSheetByName('GARDES_' + YEAR);
  if (!sh) return { err, logs };
  const rows = sh._rows, G = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; G[id] = {};
    for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim(); if (v) G[id][addD(D0, c - 1)] = v; } }
  return { err, G, rep, logs, nCol: rows[3].length - 1 };
}
/* Tout ce qui tombe dans une semaine Réa 1 alors que la règle l'interdit. */
function conflits(G) {
  const out = [];
  for (let w = 0; w < 52; w++) {
    const lun = addD(D0, 7 * w), id = EQUIPE[w % 5][0];
    for (let k = -1; k <= 4; k++) {
      const d = addD(lun, k), v = (G[id] || {})[d];
      if (!v) continue;
      if (k <= 3 && estG(v)) out.push(id + ' ' + d + ' garde');
      if (k >= 0 && k <= 3 && v === 'RG') out.push(id + ' ' + d + ' repos de garde');
      if (k >= 0 && (v === 'R' || v === '18h')) out.push(id + ' ' + d + ' ' + v);
    }
  }
  return out;
}
const couverture = (G, n) => { let mal = 0; for (let c = 0; c < n; c++) { const d = addD(D0, c); let k = 0; Object.keys(G).forEach(id => { if (estG(G[id][d])) k++; }); if (k !== 2) mal++; } return mal; };
const pire = rep => Math.max(...Object.values(rep.ecarts).map(e => e.ecart));

const J = jeu(3);

console.log('\n═══ 1. La semaine Réa 1 est sanctuarisée ═══');
const A = generer(J, true);
V('la génération aboutit', !A.err, A.err);
if (A.G) {
  const c = conflits(A.G);
  V('aucune garde du dimanche au jeudi, ni repos de garde, ni récupération, ni 18 h pour le Réa 1', c.length === 0, c.slice(0, 5));
  V('le Réa 1 garde le droit au vendredi, au samedi et au VD de fin de semaine (au moins une telle garde dans l\'année)',
    EQUIPE.some(([id], i) => { for (let w = i; w < 52; w += 5) { const lun = addD(D0, 7 * w); if ([4, 5].some(k => estG((A.G[id] || {})[addD(lun, k)]))) return true; } return false; }));
  V('toutes les nuits ont leur binôme', couverture(A.G, A.nCol) === 0);
  V('l\'équité tient : tout le monde à une garde près de sa cible, sur chaque axe', pire(A.rep) <= 1, A.rep.ecarts);
  V('le souhait posé sur une nuit Réa 1 est retiré et signalé',
    A.rep.rea1.souhaitsRetires.indexOf(SOUHAIT_REA.join(' ')) >= 0 && A.rep.warnings.some(w => /Réa 1 : \d+ souhait/.test(w) && w.indexOf(SOUHAIT_REA.join(' ')) >= 0),
    A.rep.rea1);
  V('les 52 semaines sont lues, initiales et identifiants compris', A.rep.rea1.semaines === 52 && A.rep.rea1.inconnus.length === 0, A.rep.rea1);
}

console.log('\n═══ 2. Contre-preuve : sans l\'onglet, la semaine Réa 1 n\'est pas protégée ═══');
const B = generer(J, false);
V('SANS l\'onglet REA1, au moins une garde, récupération ou 18 h tombe sur une semaine Réa 1 (sinon le test 1 ne prouve rien)',
  B.G && conflits(B.G).length > 0, { erreur: B.err, n: B.G ? conflits(B.G).length : -1 });
V('sans l\'onglet, rien n\'est signalé ni retiré', B.rep && !B.rep.rea1.semaines && !B.rep.warnings.some(w => /Réa 1/.test(w)));

console.log('\n═══ 3. Un nom inconnu est signalé, pas ignoré en silence ═══');
{
  const j = jeu(3); j.tab[10][4] = 'XYZ';
  const ss = classeur(j, true), ctx = h.buildContext(ss, [], null);
  const r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 });
  V('« XYZ » apparaît dans les avertissements', r.warnings.some(w => /nom non reconnu/.test(w) && /XYZ/.test(w)), r.rea1.inconnus);
}

console.log('\n═══ 4. Réparation par échange : sans elle, l\'écart remonte ═══');
{
  /* Contre-preuve : la même campagne, réparation coupée. On cherche un tirage où
     elle a servi ; sur ce tirage, sans elle, un axe dépasse une garde d'écart. */
  const LIGNE = "      if(_rep) Logger.log('Réparation par échange : '+_rep+' échange(s)');";
  V('la réparation est présente dans le générateur du dépôt', SRC.split(LIGNE).length === 2);
  const SANS = SRC.split('if(NOUVEL_ALGO){\n      const _tit=').join('if(false){\n      const _tit=');
  V('la contre-preuve neutralise bien la réparation', SANS !== SRC);
  let trouve = null;
  for (const seed of [3, 5, 8, 11, 2]) {
    const j = jeu(seed);
    for (let t = 1; t <= 4 && !trouve; t++) {
      const la = [], ctxA = h.buildContext(classeur(j, true), la, null);
      const ra = ctxA.generateGardes(YEAR, { dryRun: true, tirage: t });
      if (!la.some(l => /Réparation par échange : \d+/.test(l))) continue;
      const rb = h.buildContext(classeur(j, true), [], SANS).generateGardes(YEAR, { dryRun: true, tirage: t });
      trouve = { seed, t, avec: pire(ra), sans: pire(rb) };
    }
    if (trouve) break;
  }
  V('un tirage où la réparation a servi existe dans les jeux d\'essai', !!trouve, trouve);
  if (trouve) V('sur ce tirage, SANS la réparation, l\'écart est plus grand qu\'AVEC', trouve.sans > trouve.avec && trouve.avec <= 1, trouve);
}

console.log('\n═══ 5. Couple de week-end : la règle s\'assouplit au lieu de casser l\'équité ═══');
{
  /* Seuil impossible à atteindre (−1) : la première série échoue forcément.
     Avec un couple déclaré, une seconde série (tirages 9 à 16, sans le bonus du
     couple) doit être tentée ; sans couple, jamais. */
  const SEUIL = SRC.split('const MULTI_DEPART_SEUIL = 1;').join('const MULTI_DEPART_SEUIL = -1;');
  V('le seuil du multi-départ est bien celui attendu', SEUIL !== SRC);
  const j = jeu(3);
  const tirages = cfg => { const L = []; const ctx = h.buildContext(classeur(j, false, cfg), L, SEUIL);
    const t = ctx.choisirMeilleurTirage(YEAR); return { t, n: L.filter(l => /^Tirage \d+ :/.test(l)).length, L }; };
  const avec = tirages([['CLE', 'VALEUR'], ['COUPLES_WEEKEND', 'GARNIER+LEBRUN']]);
  const sans = tirages(null);
  V('avec un couple : 16 plannings essayés, la seconde série sans le bonus du couple', avec.n === 16 && avec.L.some(l => /nouvel essai sans son bonus/.test(l)), { n: avec.n });
  V('sans couple : 8 plannings, aucune seconde série', sans.n === 8 && !sans.L.some(l => /sans son bonus/.test(l)), { n: sans.n });
  /* Seuil normal : avec un couple, la recherche ne s'arrête plus au premier
     planning équitable ; parmi ceux à une garde près, elle garde celui qui donne
     le plus de week-ends en commun. Sans couple, elle s'arrête au premier. */
  {
    const L = [], ctxC = h.buildContext(classeur(j, false, [['CLE', 'VALEUR'], ['COUPLES_WEEKEND', 'GARNIER+LEBRUN']]), L, null);
    const t = ctxC.choisirMeilleurTirage(YEAR);
    const lus = L.map(l => l.match(/^Tirage (\d+) : 0 jour\(s\) sans binôme, pire écart (\d+), week-ends en commun (\d+)/)).filter(Boolean)
      .map(x => ({ t: +x[1], pire: +x[2], lies: +x[3] }));
    const equitables = lus.filter(x => x.pire <= 1);
    const maxLies = Math.max(...equitables.map(x => x.lies));
    V('avec un couple : les 8 plannings sont examinés, même si le premier est équitable', lus.length === 8, lus);
    V('le planning retenu est équitable et donne le plus de week-ends en commun parmi les équitables',
      equitables.some(x => x.t === t && x.lies === maxLies), { t, lus });
    const L2 = [], t2 = h.buildContext(classeur(j, false, null), L2, null).choisirMeilleurTirage(YEAR);
    V('sans couple : arrêt au premier planning équitable (rien ne change)', L2.filter(l => /^Tirage \d+ :/.test(l)).length === t2);
  }
  const ctx = h.buildContext(classeur(j, false, [['CLE', 'VALEUR'], ['COUPLES_WEEKEND', 'GARNIER+LEBRUN']]), [], null);
  const r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 11 });
  V('un planning de la seconde série est annoncé « règle assouplie » au comité', r.coupleAssoupli === true && r.warnings.some(w => /règle assouplie/.test(w)));
  const r1 = ctx.generateGardes(YEAR, { dryRun: true, tirage: 3 });
  V('un planning de la première série ne l\'est pas', r1.coupleAssoupli === false && !r1.warnings.some(w => /règle assouplie/.test(w)));
}

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
