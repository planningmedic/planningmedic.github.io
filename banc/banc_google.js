/* ═══ BANC — LES CONTRAINTES D'APPS SCRIPT ═══
   Trois limites de plateforme mesurées en production, reproduites ici :
     1. les exécutions sont SÉRIALISÉES par compte (une file unique) ;
     2. une exécution ne dure pas plus de ~6 minutes ;
     3. la création d'un déclencheur peut être REFUSÉE (autorisation, quota).
   On ne mesure pas des millisecondes réelles : on compte les appels et les
   écritures, ce qui est l'unité qui compte pour la file. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
const { MARS, feuilleGardes, feuilleOverrides } = require('./jeu_donnees');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

function monde(transport, options) {
  VERROUS.script = false; VERROUS.document = false;
  const g = feuilleGardes(2027, 120);
  const cl = new Classeur();
  cl.ajouter('GARDES_2027', g.lignes);
  cl.ajouter('PLANNING_OVERRIDES', feuilleOverrides(g.dates, 20));
  const PROPS = { MIROIR_PUSH_TOKEN: 'JETON' }, triggers = [], compteurs = { ecrituresFeuille: 0, appelsReseau: 0, notes: 0 };
  const cptSheet = cl.getSheetByName('PLANNING_OVERRIDES');
  const vraiRange = cptSheet.getRange.bind(cptSheet);
  cptSheet.getRange = (...a) => { const r = vraiRange(...a); const sv = r.setValue; r.setValue = v => { compteurs.ecrituresFeuille++; return sv.call(r, v); }; return r; };
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k,v) => { PROPS[k]=String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    ScriptApp: { getProjectTriggers: () => triggers.slice(),
      newTrigger: nom => ({
        timeBased: () => ({ after: () => ({ create: () => { if (options && options.refusDeclencheur) throw new Error('Autorisation refusée par Google'); triggers.push({h:nom,getHandlerFunction:()=>nom}); } }),
                            everyMinutes: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }),
                            everyHours: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }) }),
        forSpreadsheet: () => ({ onEdit: () => ({ create: () => { if (options && options.refusDeclencheur) throw new Error('Autorisation refusée par Google'); triggers.push({h:nom,getHandlerFunction:()=>nom}); } }) }) }),
      deleteTrigger: t => { const i = triggers.findIndex(x=>x.h===t.h); if(i>=0) triggers.splice(i,1); } },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => 2027,
    getIndisposForDoctor: () => ({}), saveIndisposForDoctor: () => {},
    buildDateToCol: (data) => { const m={}; (data[2]||[]).forEach((v,c)=>{ if(v) m[String(v)]=c; }); return m; },
    generatePlanning: () => { compteurs.ecrituresFeuille += 50; }, notifPlanifier: () => {},
    _miroirNoterPoussee_: () => { compteurs.notes++; }, MIROIR_URL: 'https://worker',
    SpreadsheetAppDummy: null,
    UrlFetchApp: { fetch: (url, opt) => { compteurs.appelsReseau++; return transport(url, opt); } },
  });
  ctx.globalThis = ctx;
  vm.runInContext('const MIROIR_CLE_ATTENTE = "MIROIR_POUSSEES_EN_ATTENTE";', ctx);
  /* La table des onglets suivis est une CONSTANTE du fichier, pas une fonction :
     sans elle, miroirSurEdition échoue en silence (piège rencontré ici même). */
  vm.runInContext(fs.readFileSync('../gas/miroir.gs', 'utf8').match(/const MIROIR_ONGLETS_SUIVIS = \{[\s\S]*?\};/)[0], ctx);
  [['../gas/code.gs',['savePlanningOverridesBatch']], ['../gas/Indispos.gs',['retirerPlacementsPourDates','appliquerStatutJour']],
   ['../gas/journal.gs',['_journalEcrireLots_','journalAppliquer','_journalJeton_','_journalRafraichirMail_']],
   ['../gas/miroir.gs',['_miroirNoterPoussee_','miroirRattrapage','miroirSurEdition','miroirInstallerDeclencheur']]]
    .forEach(([f, ns]) => ns.forEach(n => { try { vm.runInContext(extraireFonction(f, n), ctx); } catch (e) {} }));
  return { cl, ctx, PROPS, triggers, compteurs, dates: g.dates };
}

const KV = new Map();
const transportOK = (url, opt) => {
  const corps = JSON.parse(opt.payload);
  if (url.endsWith('/tirer')) {
    const f = [...KV.keys()].filter(k=>k.startsWith('j_')).sort().map(cle => ({ cle, valeur: JSON.parse(KV.get(cle)) }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success:true, fiches:f }) };
  }
  if (url.endsWith('/purger')) { (corps.resultats||[]).forEach(r => KV.delete(r.cle)); return { getResponseCode: () => 200, getContentText: () => '{"success":true}' }; }
  return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
};
let n = 0;
const deposer = (it) => KV.set('j_' + String(Date.now()*1000 + (n++)).padStart(14,'0') + '_z', JSON.stringify(it));

console.log('\n═══ 34. Budget d\'une exécution (limite des 6 minutes) ═══');
{
  KV.clear();
  const b = monde(transportOK);
  // Une séance de comité chargée : 120 placements sur 4 années-jours + 20 statuts
  for (let i = 0; i < 120; i++) deposer({ type:'placements', year:2027, items:[{ date: b.dates[i % 60], marId: MARS[i % MARS.length], morning:'REA' }] });
  b.ctx.appliquerStatutJour = () => ({ applied:['x'], rejected:[] });
  for (let i = 0; i < 20; i++) deposer({ type:'statut', year:2027, marId: MARS[i % MARS.length], statut:'V', dates:['2027-02-02'] });
  vm.runInContext('journalAppliquer()', b.ctx);
  V('140 intentions traitées en UNE exécution', [...KV.keys()].filter(k=>k.startsWith('j_')).length === 0);
  V('2 appels réseau seulement (tirer + purger)', b.compteurs.appelsReseau === 2, b.compteurs.appelsReseau);
  V('les placements sont GROUPÉS (≤ 3 écritures par ligne visée)',
    b.compteurs.ecrituresFeuille < 400, b.compteurs.ecrituresFeuille + ' écritures de cellule');
  V('le miroir n\'est noté qu\'une fois par année', b.compteurs.notes <= 2, b.compteurs.notes);
}

console.log('\n═══ 35. Google refuse la création d\'un déclencheur ═══');
{
  KV.clear();
  const b = monde(transportOK, { refusDeclencheur: true });
  let leve = false;
  try { vm.runInContext(`_miroirNoterPoussee_(['config_admin'], 2027)`, b.ctx); } catch (e) { leve = true; }
  V('la note est posée malgré le refus', !leve && !!b.PROPS.MIROIR_POUSSEES_EN_ATTENTE, { leve });
  V('aucun déclencheur fantôme n\'est enregistré', b.triggers.length === 0, b.triggers.length);
  let leve2 = false;
  try { vm.runInContext('miroirInstallerDeclencheur()', b.ctx); } catch (e) { leve2 = true; }
  V('l\'installation refusée ne fait pas planter la maintenance', !leve2, { leve2 });
  V('la note reste en attente pour la synchro horaire', !!b.PROPS.MIROIR_POUSSEES_EN_ATTENTE);
}

console.log('\n═══ 36. Édition manuelle en rafale (100 cellules) ═══');
{
  const b = monde(transportOK);
  const edition = nom => vm.runInContext(`miroirSurEdition({ range: { getSheet: () => ({ getName: () => ${JSON.stringify(nom)} }) } })`, b.ctx);
  for (let i = 0; i < 100; i++) edition('GARDES_2027');
  V('100 éditions ne créent qu\'UNE note', !!b.PROPS.MIROIR_POUSSEES_EN_ATTENTE);
  V('et au plus UN déclencheur', b.triggers.filter(t => t.h === 'miroirRattrapage').length <= 1, b.triggers.length);
  V('aucune écriture de feuille déclenchée par une simple lecture', b.compteurs.ecrituresFeuille === 0, b.compteurs.ecrituresFeuille);
}

console.log('\n═══ 37. File Google saturée : le journal attend son tour ═══');
{
  KV.clear();
  let refus = 0;
  const b = monde((url, opt) => { refus++; return { getResponseCode: () => 429, getContentText: () => 'Too Many Requests' }; });
  deposer({ type:'placements', year:2027, items:[{ date: b.dates[1], marId:'ALPHA', morning:'REA' }] });
  let leve = false;
  try { vm.runInContext('journalAppliquer()', b.ctx); } catch (e) { leve = true; }
  V('un refus de service ne fait pas planter l\'applicateur', !leve);
  V('l\'intention RESTE en file (elle sera rejouée)', [...KV.keys()].filter(k=>k.startsWith('j_')).length === 1);
  V('le classeur n\'est pas touché à moitié', b.compteurs.ecrituresFeuille === 0, b.compteurs.ecrituresFeuille);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
