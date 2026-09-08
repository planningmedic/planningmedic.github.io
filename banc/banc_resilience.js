/* ═══ BANC — SCÉNARIOS ADVERSES, à l'échelle du service ═══
   Ce que la production nous a appris en deux jours : le réseau ment, Google
   tombe, la page se ferme au mauvais moment, deux personnes travaillent en
   même temps. Chaque scénario ici reproduit un incident RÉELLEMENT observé
   ou redouté, sur le vrai code. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
const { MARS, feuilleGardes, feuilleOverrides } = require('./jeu_donnees');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
/* (14/08/2026) La doublure coerce les dates comme le vrai Sheets : toute
   comparaison du test se normalise, comme le fait le code de production. */
const dstr = v => v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  : String(v).trim();

function monter(optionsTransport) {
  VERROUS.script = false; VERROUS.document = false;
  const g = feuilleGardes(2027, 120);
  const cl = new Classeur();
  cl.ajouter('GARDES_2027', g.lignes);
  cl.ajouter('PLANNING_OVERRIDES', feuilleOverrides(g.dates, 40));
  const PROPS = { MIROIR_PUSH_TOKEN: 'JETON' }, triggers = [], notes = [], trace = [];
  const KV = new Map();
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k,v) => { PROPS[k]=String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    ScriptApp: { getProjectTriggers: () => triggers.slice(),
      newTrigger: nom => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }) }) }),
      deleteTrigger: t => { const i = triggers.findIndex(x=>x.h===t.h); if(i>=0) triggers.splice(i,1); } },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => 2027,
    getIndisposForDoctor: () => ({}), saveIndisposForDoctor: () => {},
    buildDateToCol: (data) => { const m={}; (data[2]||[]).forEach((v,c)=>{ if(v) m[String(v)]=c; }); return m; },
    generatePlanning: y => trace.push('publier:' + y), notifPlanifier: () => {},
    _miroirNoterPoussee_: (f,y) => notes.push({f:f.slice(),y}), MIROIR_URL: 'https://worker',
    UrlFetchApp: { fetch: (url, opt) => (optionsTransport || transportNormal)(url, opt, KV) },
  });
  ctx.globalThis = ctx;
  vm.runInContext('const MIROIR_CLE_ATTENTE = "MIROIR_POUSSEES_EN_ATTENTE";', ctx);
  [['../gas/code.gs',['savePlanningOverridesBatch']], ['../gas/Indispos.gs',['retirerPlacementsPourDates','appliquerStatutJour']],
   ['../gas/journal.gs',['_journalEcrireLots_','journalAppliquer','_journalJeton_','_journalRafraichirMail_']],
   ['../gas/miroir.gs',['_miroirNoterPoussee_','miroirRattrapage','miroirSurEdition']]]
    .forEach(([f, ns]) => ns.forEach(n => { try { vm.runInContext(extraireFonction(f, n), ctx); } catch(e){} }));
  return { cl, ctx, KV, PROPS, notes, trace, triggers, dates: g.dates,
           appliquer: () => vm.runInContext('journalAppliquer()', ctx) };
}
function transportNormal(url, opt, KV) {
  const corps = JSON.parse(opt.payload);
  if (corps.token !== 'JETON') return { getResponseCode: () => 403, getContentText: () => '{"success":false}' };
  if (url.endsWith('/tirer')) {
    const fiches = [...KV.keys()].filter(k => k.startsWith('j_')).sort().map(cle => ({ cle, valeur: JSON.parse(KV.get(cle)) }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches }) };
  }
  if (url.endsWith('/purger')) {
    (corps.resultats||[]).forEach(r => KV.delete(r.cle));
    return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
  }
  return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
}
let n = 0;
const deposer = (KV, intention) => KV.set('j_' + String(Date.now()*1000 + (n++)).padStart(14,'0') + '_x' + n, JSON.stringify(intention));

console.log('\n═══ 8. Rafale à l\'échelle du service (50 placements) ═══');
{
  const b = monter();
  const items = [];
  for (let i = 0; i < 50; i++) items.push({ date: b.dates[10 + (i % 5)], marId: MARS[i % MARS.length], morning: 'REA', comment: 'Comité' });
  deposer(b.KV, { type: 'placements', year: 2027, items });
  const avant = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  b.appliquer();
  const apres = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  V('50 placements appliqués en un seul passage', apres > avant, { avant, apres });
  V('aucune ligne en double (date+MAR unique)', (() => {
    const vus = new Set(); return b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1)
      .every(l => { const k = l[0]+'|'+l[1]; if (vus.has(k)) return false; vus.add(k); return true; });
  })());
  V('la file est vidée', [...b.KV.keys()].filter(k=>k.startsWith('j_')).length === 0);
}

console.log('\n═══ 9. Panne entre l\'application et la purge (le crash) ═══');
{
  const b = monter((url, opt, KV) => {
    if (url.endsWith('/purger')) return { getResponseCode: () => 500, getContentText: () => '{"success":false}' };
    return transportNormal(url, opt, KV);
  });
  deposer(b.KV, { type: 'placements', year: 2027, items: [{ date: b.dates[3], marId: 'ALPHA', morning: 'REA' }] });
  b.appliquer();                              // applique, mais la purge échoue
  V('la fiche RESTE en file après échec de purge', [...b.KV.keys()].filter(k=>k.startsWith('j_')).length === 1);
  const l1 = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  b.appliquer();                              // le passage suivant la rejoue
  const l2 = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  V('le rejeu ne crée PAS de doublon (idempotence)', l1 === l2, { l1, l2 });
}

console.log('\n═══ 10. Worker injoignable (Cloudflare tombe) ═══');
{
  const b = monter(() => { throw new Error('réseau injoignable'); });
  let leve = false;
  try { b.appliquer(); } catch (e) { leve = true; }
  V('l\'applicateur ne LÈVE pas d\'erreur (déclencheur préservé)', !leve);
  V('le classeur est intact', b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length === 41);
}

console.log('\n═══ 11. Deux membres du comité en même temps ═══');
{
  const b = monter();
  deposer(b.KV, { type: 'placements', year: 2027, items: [{ date: b.dates[7], marId: 'BRAVO', morning: 'REA' }], par: 'DURAND' });
  deposer(b.KV, { type: 'placements', year: 2027, items: [{ date: b.dates[7], marId: 'BRAVO', morning: 'MAT' }], par: 'SUBLET' });
  b.appliquer();
  const ligne = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.find(l => dstr(l[0]) === b.dates[7] && l[1] === 'BRAVO');
  V('une seule ligne pour la case disputée', b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.filter(l => dstr(l[0])===b.dates[7] && l[1]==='BRAVO').length === 1);
  V('le DERNIER déposé gagne (ordre du journal)', ligne && ligne[2] === 'MAT', ligne);
}

console.log('\n═══ 12. Statuts : cas limites du terrain ═══');
{
  const b = monter();
  const jourGarde = (() => {            // trouver un jour où ALPHA est de garde
    const gl = b.cl.getSheetByName('GARDES_2027').lignes;
    const dates = gl[2], ligne = gl.find(l => l[0] === 'ALPHA');
    for (let c = 2; c < dates.length; c++) if (ligne[c] === 'G') return dates[c];
    return null;
  })();
  const r = vm.runInContext(`appliquerStatutJour(2027,'ALPHA','V',${JSON.stringify([jourGarde])})`, b.ctx);
  V('un jour de GARDE refuse le statut (échange/don obligatoire)', r.applied.length === 0 && r.rejected.length === 1, r);
  let erreur = null;
  try { vm.runInContext("appliquerStatutJour(2027,'FANTOME','V',['2027-01-05'])", b.ctx); } catch (e) { erreur = e.message; }
  V('un MAR inconnu lève une erreur claire', /FANTOME/.test(erreur || ''), erreur);
  erreur = null;
  try { vm.runInContext("appliquerStatutJour(2027,'ALPHA','ZZZ',['2027-01-05'])", b.ctx); } catch (e) { erreur = e.message; }
  V('un statut non autorisé est refusé', /non autoris/.test(erreur || ''), erreur);
  const r2 = vm.runInContext("appliquerStatutJour(2027,'ALPHA','V',['2099-01-01'])", b.ctx);
  V('une date hors planning est rejetée, pas appliquée', r2.applied.length === 0 && r2.rejected.length === 1, r2);
}

console.log('\n═══ 13. Volume : 200 fiches en attente ═══');
{
  const b = monter();
  for (let i = 0; i < 200; i++) deposer(b.KV, { type: 'placements', year: 2027, items: [{ date: b.dates[i % 100], marId: MARS[i % MARS.length], morning: 'END' }] });
  const t0 = Date.now(); b.appliquer(); const ms = Date.now() - t0;
  V('200 fiches traitées sans erreur', [...b.KV.keys()].filter(k=>k.startsWith('j_')).length === 0);
  V('groupées en écritures raisonnables (< 3 s de calcul)', ms < 3000, ms + ' ms');
  V('le miroir n\'est noté qu\'une fois par année', b.notes.length <= 2, b.notes.length);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
