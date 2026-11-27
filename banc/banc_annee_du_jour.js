/* banc_annee_du_jour.js — (27/11/2026) LA PAGE PLANNING OUVRE L'ANNÉE DE PLANNING DU JOUR.
   Trouvé en rejouant la clôture 2026 : la page ouvrait l'année ACTIVE, qui ne change qu'à la
   clôture. Du lundi 4 janvier 2027 jusqu'au clic du responsable, elle s'ouvrait sur la semaine
   du 28 décembre, sans rien dire. Décision du responsable : vendredi 1er, samedi 2 et dimanche 3
   restent sur 2026 (ils sont dans ce planning) ; lundi 4, 2027 d'emblée, clôture faite ou non.
   Le vrai code de planning.html est extrait et exécuté ; seuls le réseau et l'écran sont doublés. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { extraireFonction } = require('./stubs');
const RACINE = path.join(__dirname, '..');
let ok = 0, ko = 0;
const V = (nom, cond, detail) => { if (cond) { ok++; console.log('  ✓ ' + nom); } else { ko++; console.log('  ✗ ' + nom + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); } };
const PAGE = path.join(RACINE, 'planning.html');
const SRC = fs.readFileSync(PAGE, 'utf8');
const fonction = nom => { const i = SRC.indexOf('function ' + nom + '('); if (i < 0) throw new Error(nom + ' introuvable'); const d = SRC.lastIndexOf('\n', i) + 1;
  let p = SRC.indexOf('{', i), n = 0; for (let k = p; k < SRC.length; k++) { if (SRC[k] === '{') n++; else if (SRC[k] === '}') { n--; if (!n) return SRC.slice(d, k + 1); } } throw new Error('fin de ' + nom); };

console.log('\n═══ J1. L\'année de planning d\'une date : même règle que le serveur, 2025 → 2046 ═══');
const ctxS = vm.createContext({ Date });
vm.runInContext(extraireFonction(path.join(RACINE, 'gas', 'code.gs'), 'getPremierJourPlanning'), ctxS);
const ctxP = vm.createContext({ Date });
vm.runInContext(fonction('_anneePlanningDuJour'), ctxP);
const an = d => ctxP._anneePlanningDuJour(d);
{
  let ecarts = [];
  for (let y = 2025; y <= 2046; y++) {
    const pj = ctxS.getPremierJourPlanning(y);                       // premier lundi, à midi
    const lundi0 = new Date(pj.getFullYear(), pj.getMonth(), pj.getDate(), 0, 0, 0);
    const veille = new Date(lundi0.getTime() - 60000);               // dimanche, 23 h 59
    if (an(lundi0) !== y) ecarts.push(y + ' : premier lundi 0 h → ' + an(lundi0));
    if (an(veille) !== y - 1) ecarts.push(y + ' : la veille 23 h 59 → ' + an(veille));
    if (an(new Date(y, 0, 1, 9)) !== y - 1) ecarts.push(y + ' : 1er janvier → ' + an(new Date(y, 0, 1, 9)));
    if (an(new Date(y, 5, 15)) !== y || an(new Date(y, 11, 31, 23)) !== y) ecarts.push(y + ' : juin ou 31 décembre');
  }
  V('22 années : le premier lundi à 0 h ouvre l\'année, la minute d\'avant est encore l\'année passée, le 1er janvier aussi', ecarts.length === 0, ecarts.slice(0, 4));
  V('vendredi 1er, samedi 2, dimanche 3 janvier 2027 : planning 2026', [1, 2, 3].every(j => an(new Date(2027, 0, j, 10)) === 2026));
  V('lundi 4 janvier 2027, 0 h 01 : planning 2027', an(new Date(2027, 0, 4, 0, 1)) === 2027);
  V('1er janvier un LUNDI (2029) : pas un début d\'année de planning — 2028 jusqu\'au dimanche 7, 2029 le lundi 8', an(new Date(2029, 0, 1, 10)) === 2028 && an(new Date(2029, 0, 7, 22)) === 2028 && an(new Date(2029, 0, 8, 6)) === 2029);
}

console.log('\n═══ J2. L\'ouverture rapide : quelle année s\'affiche, et à quel prix ═══');
async function ouvrir(jour, cles) {
  const lus = []; let ouverte = null;
  const D0 = new Date(jour).getTime();
  const DateSim = function (...a) { return a.length ? new Date(...a) : new Date(D0); }; DateSim.prototype = Date.prototype; DateSim.now = () => D0;
  const ctx = vm.createContext({ Date: DateSim, Number, Array, Object, JSON,
    miroirRead: async k => { lus.push(k.slice()); const data = {}; k.forEach(x => { if (cles[x] !== undefined) data[x] = cles[x]; }); return { success: true, data, identite: {} }; },
    PLANNING_CACHE: {}, AFF_CACHE: {}, _MIROIR_PRE: { annees: null, secteurs: null }, _ssPlanWrite() {}, applyUserBadge() {},
    document: { getElementById: () => ({ style: {} }) }, init: y => { ouverte = y; } });
  vm.runInContext(fonction('_anneePlanningDuJour') + '\n' + fonction('miroirBoot'), ctx);
  const r = await vm.runInContext('miroirBoot()', ctx);
  return { r, ouverte, lus, cache: Object.keys(ctx.PLANNING_CACHE).map(Number) };
}
const P = y => ({ year: y, months: [] });
const ANNEES = (active, arch) => ({ active, annees: [{ annee: 2026, archivee: !!arch }, { annee: 2027, archivee: false }] });
(async () => {
  const avant = { annees: ANNEES(2026), secteurs: [], planning_2026: P(2026), planning_2027: P(2027), affectations_2026: { affectations: {} }, affectations_2027: { affectations: {} } };
  let o = await ouvrir('2026-11-27T10:00:00', avant);
  V('un jour ordinaire (27/11/2026) : l\'année active, un seul aller-retour — rien ne change', o.ouverte === 2026 && o.lus.length === 1, o);
  o = await ouvrir('2027-01-01T10:00:00', avant);
  V('vendredi 1er janvier 2027, clôture pas faite : 2026 (le jour y est)', o.ouverte === 2026 && o.cache.join() === '2026', o);
  o = await ouvrir('2027-01-03T23:30:00', avant);
  V('dimanche 3 janvier, 23 h 30 : encore 2026', o.ouverte === 2026, o);
  o = await ouvrir('2027-01-04T06:30:00', avant);
  V('lundi 4 janvier, 6 h 30, clôture PAS faite : 2027 d\'emblée', o.ouverte === 2027 && o.cache.join() === '2027', o);
  V('…en UN aller-retour (un de moins qu\'avant : le planning 2027 arrive avec l\'ouverture)', o.lus.length === 1 && o.lus[0].indexOf('planning_2027') > -1, o.lus);
  o = await ouvrir('2027-01-20T09:00:00', avant);
  V('clôture oubliée jusqu\'au 20 janvier : toujours 2027', o.ouverte === 2027, o);
  const sansSuite = Object.assign({}, avant); delete sansSuite.planning_2027;
  o = await ouvrir('2027-01-04T06:30:00', sansSuite);
  V('lundi 4 janvier mais planning 2027 pas publié : on reste sur 2026 (jamais une page vide)', o.ouverte === 2026 && o.r === true, o);
  const apres = Object.assign({}, avant, { annees: ANNEES(2027, true) });
  o = await ouvrir('2027-01-05T09:00:00', apres);
  V('après la clôture : 2027, un seul aller-retour — rien ne change', o.ouverte === 2027 && o.lus.length === 1, o);
  o = await ouvrir('2027-01-02T09:00:00', apres);
  V('clôture faite trop tôt (cas impossible, le serveur la refuse avant le lundi) : l\'année active gagne', o.ouverte === 2027, o);
  const loin = Object.assign({}, avant, { planning_2028: P(2028) });
  o = await ouvrir('2026-12-15T09:00:00', loin);
  V('l\'année suivante publiée en décembre ne passe JAMAIS devant avant son premier lundi', o.ouverte === 2026, o);

  console.log('\n═══ J3. Ouverture par le serveur lent, et bouton « Aujourd\'hui » ═══');
  const init = fonction('init');
  V('le serveur lent suit la même règle (année du jour si elle est publiée, sinon l\'année active)',
    /const _duJour = _anneePlanningDuJour\(\);\s*currentYear = \(_duJour === activeYear \+ 1 && availableYears\.includes\(_duJour\)\) \? _duJour\s*: availableYears\.includes\(activeYear\) \? activeYear : availableYears\[availableYears\.length - 1\];/.test(init));
  V('« Aujourd\'hui » vise l\'année de planning du jour, pas l\'année civile (1er janvier)', /const todayYear = _anneePlanningDuJour\(now\);/.test(fonction('goToToday')) && !/todayYear = now\.getFullYear\(\)/.test(fonction('goToToday')));

  console.log(`\nbanc_annee_du_jour : ${ok} ✓, ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('ÉCHEC', e.stack); process.exit(1); });
