/* ═══ BOUT EN BOUT : la VRAIE page admin → le VRAI Worker → les VRAIES
   fonctions GAS → le classeur. Seule pièce simulée : le transport entre le
   GAS et Cloudflare (les appels KV du Worker sont asynchrones, Apps Script
   est synchrone) — l'authentification et le routage du Worker sont, eux,
   couverts par banc_worker.mjs sur le vrai fichier. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const dstr = v => v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  : String(v).trim();   // (14/08/2026) la doublure coerce les dates comme le vrai Sheets
const dodo = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── 1. Worker réel + KV ──
  const wsrc = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ globalThis: {}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(wsrc, wctx);
  const W = wctx.__W, M = new Map();
  const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k,v) => { M.set(k,v); }, delete: async k => { M.delete(k); },
    list: async ({prefix, limit}) => ({ keys: [...M.keys()].filter(k => k.startsWith(prefix)).slice(0, limit||1000).map(name => ({name})) }) };
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const CODE = 'CODEADMIN99';
  M.set('acces', JSON.stringify({ users: [{ h: await sha(CODE), role: 'admin', id: 'DURAND' }] }));
  const env = { KV, PUSH_TOKEN: 'JETON' };

  // ── 2. Classeur + GAS réels ──
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  cl.ajouter('GARDES_2027', [['','',''],['','',''],
    ['MAR','','2027-03-01','2027-03-02','2027-03-03','2027-03-04'],
    ['CHAPUIS','','','','',''], ['SERVANT','','','','',''], ['ANCEL','','','','','']]);
  const PROPS = { MIROIR_PUSH_TOKEN: 'JETON' }, triggers = [], notes = [], trace = [];
  const gctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k,v) => { PROPS[k]=String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    ScriptApp: { getProjectTriggers: () => triggers.slice(),
      newTrigger: nom => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({h:nom, getHandlerFunction:()=>nom}) }) }) }),
      deleteTrigger: t => { const i = triggers.findIndex(x=>x.h===t.h); if(i>=0) triggers.splice(i,1); } },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => 2027,
    getIndisposForDoctor: () => ({}), saveIndisposForDoctor: () => {},
    buildDateToCol: (data) => { const m={}; (data[2]||[]).forEach((v,c)=>{ if(v) m[String(v)]=c; }); return m; },
    generatePlanning: y => trace.push('publier:' + y), notifPlanifier: () => {},
    _miroirNoterPoussee_: (f,y) => notes.push({f:f.slice(),y}), MIROIR_URL: 'https://worker',
    // Transport GAS↔KV : synchrone, direct sur le même magasin que le Worker
    UrlFetchApp: { fetch: (url, opt) => {
      const corps = JSON.parse(opt.payload);
      if (corps.token !== env.PUSH_TOKEN) return { getResponseCode: () => 403, getContentText: () => '{"success":false}' };
      if (url.endsWith('/tirer')) {
        const fiches = [...M.keys()].filter(k => k.startsWith('j_')).map(cle => ({ cle, valeur: JSON.parse(M.get(cle)) }));
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches }) };
      }
      if (url.endsWith('/purger')) {
        (corps.resultats||[]).forEach(r => { const v = M.get(r.cle); if (v) { const f = JSON.parse(v); f.ok = r.ok; f.detail = r.detail; M.set('jfait_' + r.cle.slice(2), JSON.stringify(f)); M.delete(r.cle); } });
        return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
      }
      return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
    }},
  });
  gctx.globalThis = gctx;
  vm.runInContext('const MIROIR_CLE_ATTENTE = "MIROIR_POUSSEES_EN_ATTENTE";', gctx);
  [['../gas/code.gs',['savePlanningOverridesBatch']], ['../gas/Indispos.gs',['retirerPlacementsPourDates','appliquerStatutJour']],
   ['../gas/journal.gs',['_journalEcrireLots_','journalAppliquer','_journalJeton_','_journalRafraichirMail_']]]
    .forEach(([f, ns]) => ns.forEach(n => vm.runInContext(extraireFonction(f, n), gctx)));
  const applicateur = () => vm.runInContext('journalAppliquer()', gctx);

  // ── 3. La page réelle ──
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync('../admin.html','utf8'), { runScripts:'dangerously', virtualConsole:vc, url:'https://planningmedic.github.io/admin.html', pretendToBeVisual:true });
  const w = dom.window;
  await dodo(600);
  let appelsGAS = 0;
  w.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('workers.dev')) {
      const chemin = u.replace(/^https:\/\/[^/]+/, '');
      return W.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
    }
    appelsGAS++;   // tout appel Apps Script est compté : il ne doit plus y en avoir
    return { ok:true, json: async () => ({ success:false, error:'GAS non disponible dans le banc' }) };
  };
  /* ADMIN_CODE/ADMIN_YEAR sont des liaisons lexicales du script (let), pas des
     proprietes de window : on les affecte DANS la portee globale de la page. */
  w.eval(`ADMIN_CODE = ${JSON.stringify(CODE)}; ADMIN_YEAR = 2027; _batchPending = {}; _batchInFlight = null;`);
  V('le code d\'acces est bien injecte dans la page', w.eval('ADMIN_CODE') === CODE, w.eval('ADMIN_CODE'));

  console.log('\n═══ 7. BOUT EN BOUT : je clique, le classeur reçoit ═══');

  // (a) trois placements sur cases flash
  w.queueOverride('2027-03-03','CHAPUIS','am','MAT','Comité — MAT AM');
  w.queueOverride('2027-03-03','CHAPUIS','pm','MAT','Comité — MAT PM');
  w.queueOverride('2027-03-04','SERVANT','am','REA','Comité — REA AM');
  V('les 3 gestes sont en attente côté page', Object.keys(w._batchAll()).length === 2, Object.keys(w._batchAll()));
  await w.flushBatch();
  await dodo(50);
  const enFile = [...M.keys()].filter(k => k.startsWith('j_'));
  V('le lot est déposé au journal Cloudflare', enFile.length === 1, enFile);
  V('AUCUN appel Apps Script pour placer', appelsGAS === 0, appelsGAS);

  // (b) le serveur applique
  applicateur();
  const lignes = cl.getSheetByName('PLANNING_OVERRIDES').lignes;
  V('le classeur contient les 2 placements', lignes.length === 3, lignes.map(l=>l.slice(0,4)));
  V('CHAPUIS 03/03 matin ET après-midi', lignes.some(l => dstr(l[0])==='2027-03-03' && l[1]==='CHAPUIS' && l[2]==='MAT' && l[3]==='MAT'), lignes[1]);
  V('la file du journal est vidée', [...M.keys()].filter(k=>k.startsWith('j_')).length === 0);
  V('le registre d\'audit garde la trace', [...M.keys()].some(k=>k.startsWith('jfait_')));
  V('le miroir est noté (copie de lecture à rafraîchir)', notes.length >= 1, notes);

  // (c) changement de statut : SERVANT passe en TP le 04/03
  const r = vm.runInContext("appliquerStatutJour(2027,'SERVANT','TP',['2027-03-04'])", gctx);
  V('statut TP posé', r.applied.length === 1, r);
  V('le placement SERVANT du 04/03 a disparu tout seul',
    !cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => dstr(l[0])==='2027-03-04' && l[1]==='SERVANT'),
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.map(l=>l.slice(0,2)));
  V('les placements de CHAPUIS sont intacts',
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => l[1]==='CHAPUIS'));

  // (d) réquisition : replacer SERVANT APRÈS le TP
  w.queueOverride('2027-03-04','SERVANT','am','REA','Comité — réquisition');
  await w.flushBatch(); await dodo(30); applicateur();
  V('la réquisition (placement postérieur au TP) tient',
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => dstr(l[0])==='2027-03-04' && l[1]==='SERVANT'),
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.map(l=>l.slice(0,2)));

  // (e) publication : lot + publier dans le même geste, puis fermeture de la page
  w.queueOverride('2027-03-01','ANCEL','am','END','Comité — END AM');
  const via = await w._publierCombine(2027);
  V('la publication part par le journal', via === 'journal', via);
  V('la page ne garde plus rien en attente', Object.keys(w._batchAll()).length === 0, w._batchAll());
  V('AUCUN appel Apps Script sur tout le parcours', appelsGAS === 0, appelsGAS);
  // « je ferme la page » : plus aucun code de la page ne tourne
  applicateur();
  V('APRÈS FERMETURE : le placement final est au classeur',
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => l[1]==='ANCEL' && l[2]==='END'),
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.map(l=>l.slice(0,3)));
  V('APRÈS FERMETURE : la publication a bien eu lieu', trace.includes('publier:2027'), trace);
  V('aucune erreur JavaScript sur toute la séance', erreurs.length === 0, erreurs.slice(0,3));

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
