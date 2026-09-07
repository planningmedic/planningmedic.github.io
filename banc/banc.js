/* ═══ BANC D'ESSAI — exécution des vraies fonctions ═══ */
const vm = require('vm');
const { Classeur, fabriqueVerrou, VERROUS, journalVerrous, extraireFonction } = require('./stubs');

const R = { ok: 0, ko: 0, details: [] };
function verifier(titre, condition, obtenu) {
  if (condition) { R.ok++; console.log('  ✓ ' + titre); }
  else { R.ko++; console.log('  ✗ ' + titre + (obtenu !== undefined ? '  → obtenu : ' + JSON.stringify(obtenu) : '')); R.details.push(titre); }
}

function nouveauContexte(classeur, props) {
  const PROPS = props || {};
  const triggers = [];
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => classeur },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in PROPS ? PROPS[k] : null),
      setProperty: (k, v) => { PROPS[k] = String(v); },
      deleteProperty: k => { delete PROPS[k]; },
    })},
    LockService: {
      getScriptLock: () => fabriqueVerrou('script'),
      getDocumentLock: () => fabriqueVerrou('document'),
      getUserLock: () => fabriqueVerrou('user'),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: (nom) => ({
        timeBased: () => ({ after: () => ({ create: () => triggers.push({ h: nom, type: 'after' }) }),
                            everyMinutes: () => ({ create: () => triggers.push({ h: nom, type: 'minutes' }) }),
                            everyHours: () => ({ create: () => triggers.push({ h: nom, type: 'hours' }) }) }),
        forSpreadsheet: () => ({ onEdit: () => ({ create: () => triggers.push({ h: nom, type: 'onEdit' }) }) }),
      }),
      deleteTrigger: (t) => { const i = triggers.findIndex(x => x.h === t.h); if (i >= 0) triggers.splice(i, 1); },
    },
    Logger: { log: (m) => ctx.__logs.push(String(m)) },
    __logs: [], __props: PROPS, __triggers: triggers,
    logAction: (m) => ctx.__logs.push('ACTION ' + m),
    getActiveYear: () => 2027,
    getIndisposForDoctor: () => ({}),
    saveIndisposForDoctor: () => {},
    buildDateToCol: (data, year) => {                 // ligne 2 = dates (comme en production)
      const map = {}; (data[2] || []).forEach((v, c) => { if (v) map[String(v)] = c; }); return map;
    },
    Date, JSON, Math, String, Number, Set, Map, Object, Array, Error, isNaN, parseInt, parseFloat,
  };
  ctx.globalThis = ctx;
  return vm.createContext(ctx);
}

function charger(ctx, fichier, noms) {
  noms.forEach(n => vm.runInContext(extraireFonction(fichier, n), ctx, { filename: fichier + ':' + n }));
}

// ══════════ SCÉNARIO 1 : poser un TP retire le placement du jour ══════════
console.log('\n═══ 1. Le dernier geste gagne (cas SEVERAC) ═══');
{
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [
    ['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE'],
    ['2027-03-03','CATINEAU','MAT','MAT','Comité — MAT'],
    ['2027-03-03','SEVERAC','REA','REA','Comité — REA'],
    ['2027-03-04','SEVERAC','REA','REA','Comité — REA'],
  ]);
  cl.ajouter('GARDES_2027', [
    ['','',''], ['','',''],
    ['MAR','', '2027-03-03','2027-03-04','2027-03-05'],
    ['SEVERAC','', '', '', ''],
    ['CATINEAU','', '', '', ''],
  ]);
  const ctx = nouveauContexte(cl);
  charger(ctx, '../gas/Indispos.gs', ['retirerPlacementsPourDates', 'appliquerStatutJour']);

  const res = vm.runInContext("appliquerStatutJour(2027, 'SEVERAC', 'TP', ['2027-03-03'])", ctx);
  const lignes = cl.getSheetByName('PLANNING_OVERRIDES').lignes;
  verifier('statut TP appliqué', res.applied.length === 1, res);
  verifier('le placement SEVERAC du 03/03 est retiré',
    !lignes.some(l => l[0] === '2027-03-03' && l[1] === 'SEVERAC'), lignes.map(l => l.slice(0,2)));
  verifier('le placement SEVERAC du 04/03 est INTACT (autre jour)',
    lignes.some(l => l[0] === '2027-03-04' && l[1] === 'SEVERAC'));
  verifier('le placement CATINEAU du 03/03 est INTACT (autre MAR)',
    lignes.some(l => l[0] === '2027-03-03' && l[1] === 'CATINEAU'));
  verifier('la feuille garde bien 3 lignes + entête', lignes.length === 3, lignes.length);

  // Réquisition : replacer APRÈS le TP
  cl.getSheetByName('PLANNING_OVERRIDES').appendRow(['2027-03-03','SEVERAC','REA','REA','Comité — réquisition']);
  const res2 = vm.runInContext("appliquerStatutJour(2027, 'SEVERAC', '18', ['2027-03-03'])", ctx);
  /* (14/08/2026) La doublure coerce désormais les dates écrites (appendRow
     ci-dessus) en objets Date, comme le vrai Sheets. La comparaison du test
     se normalise donc comme le fait le code de production — qui, lui, était
     déjà blindé (`brut instanceof Date`). */
  const dstr = v => v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
    : String(v).trim();
  verifier('« 18 » ne retire PAS le placement (pas une absence)',
    cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => dstr(l[0]) === '2027-03-03' && l[1] === 'SEVERAC'), res2);
}

// ══════════ SCÉNARIO 2 : verrous imbriqués (le défaut corrigé) ══════════
console.log('\n═══ 2. Verrous : l\'applicateur ne bloque pas les écritures ═══');
{
  VERROUS.script = false; VERROUS.document = false; journalVerrous.length = 0;
  const verrouApplicateur = fabriqueVerrou('document');   // journal.gs .3
  verifier('l\'applicateur prend le verrou de document', verrouApplicateur.tryLock(5000) === true);
  const verrouEcriture = fabriqueVerrou('script');        // savePlanningOverridesBatch
  let ok = true; try { verrouEcriture.waitLock(15000); } catch (e) { ok = false; }
  verifier('une écriture obtient le verrou de script SANS attendre', ok);
  verrouEcriture.releaseLock(); verrouApplicateur.releaseLock();

  // Contre-épreuve : l'ancienne version (verrou de script des deux côtés)
  const ancien = fabriqueVerrou('script'); ancien.tryLock(5000);
  let bloque = false; try { fabriqueVerrou('script').waitLock(15000); } catch (e) { bloque = true; }
  verifier('CONTRE-ÉPREUVE : l\'ancienne version aurait bien bloqué 15 s', bloque);
  ancien.releaseLock(); VERROUS.script = false;
}

console.log('\n──────────────────────────────');
console.log(`${R.ok} vérification(s) OK · ${R.ko} en échec`);
if (R.ko) { console.log('ÉCHECS : ' + R.details.join(' | ')); process.exit(1); }

// ══════════ SCÉNARIO 4 : l'applicateur du journal (vraie fonction) ══════════
console.log('\n═══ 4. L\'applicateur : ordre, groupage, échec isolé ═══');
{
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  cl.ajouter('GARDES_2027', [['','',''],['','',''],['MAR','','2027-01-12','2027-01-13'],['ARMAND','','',''],['CATINEAU','','','']]);
  const ctx = nouveauContexte(cl, { MIROIR_PUSH_TOKEN: 'JETON' });
  const trace = [];
  ctx.MIROIR_URL = 'https://worker';
  ctx.generatePlanning = (y) => trace.push('publier:' + y);
  ctx.notifPlanifier = () => {};
  ctx._miroirNoterPoussee_ = (f, y) => trace.push('miroir:' + f.join('+') + '@' + y);
  ctx.savePlanningOverridesBatch = (items) => { trace.push('batch:' + items.map(i => i.marId).join('+')); return { saved: items.length }; };
  ctx.appliquerStatutJour = (y, m, st) => { if (m === 'FANTOME') throw new Error(m + ' introuvable dans GARDES_' + y); trace.push('statut:' + m); return { applied: ['2027-01-12'], rejected: [] }; };
  let purge = null;
  ctx.UrlFetchApp = { fetch: (url, opt) => {
    const corps = JSON.parse(opt.payload);
    if (url.endsWith('/tirer')) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches: [
      { cle: 'j_00000000000030_c', valeur: { type: 'publier', year: 2027 } },
      { cle: 'j_00000000000010_a', valeur: { type: 'placements', year: 2027, items: [{ date:'2027-01-12', marId:'CATINEAU' }] } },
      { cle: 'j_00000000000050_e', valeur: { type: 'statut', year: 2027, marId: 'FANTOME', statut: 'V', dates: ['2027-02-01'] } },
      { cle: 'j_00000000000020_b', valeur: { type: 'statut', year: 2027, marId: 'ARMAND', statut: 'F', dates: ['2027-01-12'] } },
      { cle: 'j_00000000000040_d', valeur: { type: 'placements', year: 2027, items: [{ date:'2027-01-13', marId:'BONNET' }] } },
      { cle: 'j_00000000000060_f', valeur: { type: 'inconnu' } },
    ] }) };
    if (url.endsWith('/purger')) { purge = corps.resultats; return { getResponseCode: () => 200, getContentText: () => '{"success":true}' }; }
    return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
  }};
  charger(ctx, '../gas/journal.gs', ['_journalEcrireLots_', 'journalAppliquer', '_journalRafraichirMail_', '_journalJeton_']);
  vm.runInContext('journalAppliquer()', ctx);

  const iBatch1 = trace.indexOf('batch:CATINEAU'), iPub = trace.indexOf('publier:2027'), iBatch2 = trace.indexOf('batch:BONNET');
  verifier('le lot ANTÉRIEUR est écrit AVANT la publication', iBatch1 >= 0 && iPub > iBatch1, trace);
  verifier('le lot POSTÉRIEUR est écrit APRÈS la publication', iBatch2 > iPub, trace);
  verifier('le statut valide est appliqué', trace.includes('statut:ARMAND'));
  verifier('6 fiches traitées, aucune perdue', purge && purge.length === 6, purge && purge.length);
  verifier('2 échecs isolés (MAR fantôme + type inconnu)', purge.filter(r => !r.ok).length === 2, purge.filter(r => !r.ok));
  verifier('l\'échec porte son motif', purge.some(r => !r.ok && /introuvable/.test(r.detail)), purge.filter(r=>!r.ok).map(r=>r.detail));
  verifier('le miroir est noté après application', trace.some(t => t.startsWith('miroir:')), trace);
}

// ══════════ SCÉNARIO 5 : idempotence des placements (rejeu) ══════════
console.log('\n═══ 5. Rejeu d\'un lot : mise à jour, jamais de doublon ═══');
{
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  const ctx = nouveauContexte(cl);
  charger(ctx, '../gas/code.gs', ['savePlanningOverridesBatch']);
  const items = JSON.stringify([{ date:'2027-03-03', marId:'CATINEAU', morning:'MAT', comment:'Comité' }]);
  vm.runInContext(`savePlanningOverridesBatch(${items})`, ctx);
  vm.runInContext(`savePlanningOverridesBatch(${items})`, ctx);   // rejeu (journal re-tiré)
  const l = cl.getSheetByName('PLANNING_OVERRIDES').lignes;
  verifier('une seule ligne après deux envois identiques', l.length === 2, l.length);
  vm.runInContext(`savePlanningOverridesBatch([{date:'2027-03-03',marId:'CATINEAU',afternoon:'REA'}])`, ctx);
  verifier('l\'après-midi complète la même ligne', l.length === 2 && l[1][3] === 'REA', l[1]);
  verifier('le matin est conservé', l[1][2] === 'MAT', l[1]);
}

console.log('\n══════════════════════════════');
console.log(`TOTAL : ${R.ok} OK · ${R.ko} en échec`);
if (R.ko) process.exit(1);
