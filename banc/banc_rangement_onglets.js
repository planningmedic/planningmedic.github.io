/* ═══ BANC — CHAQUE ONGLET DU CLASSEUR A SA FAMILLE (10/11/2026) ═══
   Défaut trouvé en production le 10/11/2026 : 14 onglets sur 45 (TRACES,
   ECHANGES, TP_DEMANDES, REA1_2027…) étaient inconnus du rangement. Créés
   par le code au fil des mois, ils s'empilaient en tête du classeur, devant
   MEDECINS, et le rangement ne savait pas où les mettre.

   Ce scénario :
   1. relit TOUT le code serveur et en extrait chaque nom d'onglet (littéral,
      constante *_TAB / *_ONGLET, nom annuel `X_${année}`) ; chacun doit
      avoir une famille — sauf les vestiges déclarés ci-dessous ;
   2. range un faux classeur contenant les 45 onglets réels du 10/11/2026
      (mélangés) plus deux années de plus : aucun orphelin, l'ordre des
      familles est respecté, les années vont de la plus récente à la plus
      ancienne, les bons onglets sont masqués ;
   3. contre-preuve : un onglet inconnu est signalé et laissé à la fin. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const GAS = path.join(__dirname, '..', 'gas');

// Lus par du code mort, absents du classeur, à NE PAS recréer (guide du fichier maître, §26).
const VESTIGES = ['OVERRIDES'];

// Les 45 onglets du classeur maître relevés le 10/11/2026.
const REELS = ['CONFIG', 'TRACES', 'GARDES_2027', 'STATS_GARDES_2027', 'LIENS_R_2027', 'VEILLE_ABONNES',
  'ETABLISSEMENT', 'VEILLE_ARCHIVE', 'INDISPOS_2027', 'AFFECTATIONS_2027', 'STATS_HEURES', 'STATS_ACTIONS',
  'STATS_SEMAINE', 'NOTIFS_JOURNAL', 'REA1_2027', 'FETES_2027', 'TP_FERMES', 'TP_DEMANDES', 'ECHANGES',
  'MEDECINS', 'SECTEURS', 'CS_TEMPLATE', 'ANNUAIRE', 'SEUILS', 'GROUPES_VAC', 'PERIODES_VAC', 'CONFIG_CONGES',
  'CONFIG_TRANSITION', 'VEILLE_CFG', 'STAFFS', 'PLANNING_OVERRIDES', 'SPECIALITES', 'COTATIONS_TYPE',
  'LIBERAL_2026', 'LIBERAL_CA_2026', 'GARDES_2026', 'INDISPOS_2026', 'AFFECTATIONS_2026', 'STATS_GARDES_2026',
  'ABSENCES_LONGUES', 'HISTORIQUE', 'VEILLE', 'VEILLE_MARQUES', 'LOGS', 'CONNEXIONS'];

// ── Faux classeur ──
function classeur(noms) {
  let feuilles = noms.map(n => ({ n, cache: false, couleur: null }));
  let active = null;
  const enveloppe = f => ({
    getName: () => f.n,
    showSheet() { f.cache = false; },
    hideSheet() { if (feuilles.filter(x => !x.cache && x !== f).length === 0) throw new Error('dernier visible'); f.cache = true; },
    setTabColor(c) { f.couleur = c; },
    isSheetHidden: () => f.cache, _f: f,
  });
  const ss = {
    getSheets: () => feuilles.map(enveloppe),
    getSheetByName: n => { const f = feuilles.find(x => x.n === n); return f ? enveloppe(f) : null; },
    setActiveSheet(sh) { active = sh._f; },
    moveActiveSheet(pos) { feuilles = feuilles.filter(x => x !== active); feuilles.splice(pos - 1, 0, active); },
  };
  return { ss, etat: () => feuilles };
}
function monter(ss) {
  const ctx = vm.createContext({ console, JSON, Date, Math, Object, Array, String, Number, RegExp,
    Logger: { log() {} }, SpreadsheetApp: { getActiveSpreadsheet: () => ss }, UrlFetchApp: {}, Utilities: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(GAS, 'setup_annee.gs'), 'utf8'), ctx);
  return ctx;
}

console.log('\n═══ CHAQUE ONGLET DU CLASSEUR A SA FAMILLE ═══');

// ── 1. Tous les noms d'onglets cités par le code serveur ──
console.log('— 1. Les onglets cités par le code —');
const sources = fs.readdirSync(GAS).filter(f => f.endsWith('.gs')).map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n');
const constantes = {};
for (const m of sources.matchAll(/^\s*(?:const|var|let)\s+([A-Z_]*(?:_TAB|_ONGLET))\s*=\s*'([A-Z0-9_]+)'/gm)) constantes[m[1]] = m[2];
const cites = new Set();
for (const m of sources.matchAll(/(?:getSheetByName|insertSheet)\(\s*(?:'([A-Z0-9_]+)'|`([A-Z0-9_]+)_\$\{[^}]+\}`|([A-Z_]+(?:_TAB|_ONGLET)))\s*[,)]/g)) {
  if (m[1]) cites.add(m[1].endsWith('_') ? m[1] + '2027' : m[1]);
  else if (m[2]) cites.add(m[2] + '_2027');
  else if (constantes[m[3]]) cites.add(constantes[m[3]]);
}
for (const m of sources.matchAll(/_statsFeuille_\(\s*ss\s*,\s*'([A-Z0-9_]+)'/g)) cites.add(m[1]);
for (const m of sources.matchAll(/return\s+'([A-Z0-9_]+_)'\s*\+\s*year/g)) cites.add(m[1] + '2027');   // _libSheetName, _libCaSheetName
V('l\'extraction trouve les onglets du code (au moins 40)', cites.size >= 40, cites.size);
['TRACES', 'ECHANGES', 'ETABLISSEMENT', 'VEILLE_ABONNES', 'NOTIFS_JOURNAL', 'STATS_SEMAINE', 'REA1_2027',
 'FETES_2027', 'LIENS_R_2027', 'LIBERAL_2027', 'LIBERAL_CA_2027'].forEach(n =>
  V('l\'extraction voit ' + n, cites.has(n)));

const { ss: ssVide } = classeur(['CONFIG']);
const C0 = monter(ssVide);
const sansFamille = [...cites].filter(n => !VESTIGES.includes(n) && !C0.familleDOnglet_(n));
V('chaque onglet cité par le code a une famille dans le rangement', sansFamille.length === 0, sansFamille);
V('LIBERAL_CA_2027 est un LIBERAL_CA, pas un LIBERAL', (C0.familleDOnglet_('LIBERAL_CA_2027') || {}).rang === 51,
  C0.familleDOnglet_('LIBERAL_CA_2027'));
V('un vestige n\'a pas de famille (il ne doit pas revenir)', VESTIGES.every(n => !C0.familleDOnglet_(n)));
V('les 45 onglets réels ont tous une famille', REELS.every(n => C0.familleDOnglet_(n)),
  REELS.filter(n => !C0.familleDOnglet_(n)));

// ── 2. Ranger le vrai classeur, mélangé, avec deux années de plus ──
console.log('— 2. Le classeur réel, mélangé, plus 2025 et 2028 —');
const melange = REELS.concat(['GARDES_2025', 'INDISPOS_2028', 'LIBERAL_2027', 'LIBERAL_CA_2027'])
  .map((n, i) => [((i * 37) % 53), n]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const { ss, etat } = classeur(melange);
const C = monter(ss);
const rapport = C.organiserOnglets();
const fin = etat();
const ordre = fin.map(f => f.n);
V('aucun orphelin', rapport.orphelins.length === 0, rapport.orphelins);
V('les 49 onglets sont rangés', rapport.ranges === 49, rapport.ranges);
V('aucun onglet perdu ni dupliqué', new Set(ordre).size === melange.length && ordre.length === melange.length);
V('le classeur commence par CONFIG puis MEDECINS', ordre[0] === 'CONFIG' && ordre[1] === 'MEDECINS', ordre.slice(0, 3));
const familles = ordre.map(n => (C.familleDOnglet_(n) || { i: 99 }).i);
V('les familles se suivent dans l\'ordre, sans se mélanger', familles.every((x, k) => k === 0 || x >= familles[k - 1]), familles);
const annees = ordre.filter(n => /^(INDISPOS|REA1|FETES|GARDES|LIENS_R|STATS_GARDES|AFFECTATIONS)_\d{4}$/.test(n));
V('les années vont de la plus récente à la plus ancienne', annees.map(n => +n.slice(-4)).every((a, k, t) => k === 0 || a <= t[k - 1]), annees);
V('2028 vient en tête des années', annees[0] === 'INDISPOS_2028', annees[0]);
V('dans une année : ce qui entre, puis ce qui sort, puis les affectations',
  JSON.stringify(annees.filter(n => n.endsWith('2027'))) ===
  JSON.stringify(['INDISPOS_2027', 'REA1_2027', 'FETES_2027', 'GARDES_2027', 'LIENS_R_2027', 'STATS_GARDES_2027', 'AFFECTATIONS_2027']),
  annees.filter(n => n.endsWith('2027')));
V('le libéral : LIBERAL_2027, LIBERAL_CA_2027, puis 2026',
  JSON.stringify(ordre.filter(n => /^LIBERAL/.test(n))) === JSON.stringify(['LIBERAL_2027', 'LIBERAL_CA_2027', 'LIBERAL_2026', 'LIBERAL_CA_2026']),
  ordre.filter(n => /^LIBERAL/.test(n)));
const caches = fin.filter(f => f.cache).map(f => f.n).sort();
const attendusCaches = ['CONNEXIONS', 'HISTORIQUE', 'LOGS', 'NOTIFS_JOURNAL', 'STATS_ACTIONS', 'STATS_HEURES', 'STATS_SEMAINE',
  'TRACES', 'VEILLE', 'VEILLE_ABONNES', 'VEILLE_ARCHIVE', 'VEILLE_MARQUES'].sort();
V('exactement les 12 onglets de journaux et de veille sont masqués', JSON.stringify(caches) === JSON.stringify(attendusCaches), caches);
V('les réglages restent visibles', ['CONFIG', 'MEDECINS', 'ABSENCES_LONGUES', 'PLANNING_OVERRIDES'].every(n => !fin.find(f => f.n === n).cache));
V('chaque onglet rangé est coloré', fin.every(f => f.couleur));
V('un onglet de la même famille a la même couleur', fin.find(f => f.n === 'GARDES_2025').couleur === fin.find(f => f.n === 'INDISPOS_2028').couleur);

// Le rangement est stable : le relancer ne change rien.
C.organiserOnglets();
V('relancer le rangement ne change rien', JSON.stringify(etat().map(f => f.n)) === JSON.stringify(ordre));

// ── 3. Contre-preuve ──
console.log('— 3. Contre-preuve : un onglet inconnu —');
const t = classeur(['FEUILLE_PERSO', 'MEDECINS', 'CONFIG', 'LOGS']);
const R = monter(t.ss).organiserOnglets();
V('l\'onglet inconnu est signalé', JSON.stringify(R.orphelins) === JSON.stringify(['FEUILLE_PERSO']), R.orphelins);
V('il est laissé à la fin, visible', t.etat().slice(-1)[0].n === 'FEUILLE_PERSO' && !t.etat().slice(-1)[0].cache, t.etat().map(f => f.n));
V('un nom annuel inconnu n\'est pas rangé par erreur', monter(t.ss).familleDOnglet_('BROUILLON_2027') === null);

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
