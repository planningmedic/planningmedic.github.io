/* ═══ BANC — L'APPLICATION DEMANDÉE PAR LA PAGE (24/10/2026) ═══════════
   Mesures du 24/10 : `journalAppliquer` tournait chaque minute (1 440 fois
   par jour, ~2,9 s chacune ≈ 69 des 90 min/jour de tâches de fond d'un
   compte gmail) et ouvrait la file Cloudflare ~480 fois par jour (alerte
   « 50 % » du plafond de 1 000 listages).
   Désormais : la page admin demande l'application juste après un dépôt
   (action journalAppliquerMaintenant), le déclencheur ne passe plus que
   toutes les 5 minutes, en filet.
   Ce qu'on prouve :
     · l'appel direct applique la file et le dit, sans toucher au battement
       ni à la relève du courrier (propres au filet) ;
     · le passage du déclencheur est inchangé ;
     · verrou tenu → rien n'est perdu, la fiche reste en file ;
     · l'installation REMPLACE l'ancien déclencheur d'une minute, sans doublon ;
     · l'action est réservée au comité ;
     · la page n'envoie qu'un appel en vol, et UN de plus pour les dépôts
       arrivés entre-temps — jamais un par clic ;
     · un filet de 5 min tombe toujours sur une ouverture de file sous 15 min ;
     · tant que la file n'est pas vide, la page ne lit pas la copie rapide. */
const vm = require('vm'), fs = require('fs');
const { fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

const KV = new Map();
let n = 0;
const deposer = it => KV.set('j_' + String(Date.now() * 1000 + (n++)).padStart(14, '0') + '_z', JSON.stringify(it));
const enFile = () => [...KV.keys()].filter(k => k.startsWith('j_')).length;
const transport = (url, opt) => {
  const corps = JSON.parse(opt.payload);
  if (url.endsWith('/tirer')) {
    const f = [...KV.keys()].filter(k => k.startsWith('j_')).sort().map(cle => ({ cle, valeur: JSON.parse(KV.get(cle)) }));
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches: f }) };
  }
  if (url.endsWith('/purger')) { (corps.resultats || []).forEach(r => KV.delete(r.cle)); }
  return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
};

function monde() {
  VERROUS.script = false; VERROUS.document = false;
  const triggers = [], cpt = { bat: 0, mail: 0, lots: 0, cadences: [] };
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'JETON', setProperty: () => {} }) },
    LockService: { getDocumentLock: () => fabriqueVerrou('document'), getScriptLock: () => fabriqueVerrou('script') },
    ScriptApp: { getProjectTriggers: () => triggers.slice(),
      newTrigger: nom => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => { cpt.cadences.push(m); triggers.push({ h: nom, m, getHandlerFunction: () => nom }); } }) }) }),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => ({ getContent: () => t }) }) },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => 2027,
    _bat_: () => { cpt.bat++; },
    _miroirNoterPoussee_: () => {}, MIROIR_URL: 'https://worker',
    savePlanningOverridesBatch: items => { cpt.lots++; return { saved: items.length }; },
    UrlFetchApp: { fetch: transport },
  });
  ctx.globalThis = ctx;
  ['_journalEcrireLots_', 'journalAppliquer', '_journalJeton_', 'journalInstallerDeclencheur']
    .forEach(f => vm.runInContext(extraireFonction('../gas/journal.gs', f), ctx));
  ['_act_journalAppliquerMaintenant', '_deny'].forEach(f => vm.runInContext(extraireFonction('../gas/Indispos.gs', f), ctx));
  ctx._journalRafraichirMail_ = () => { cpt.mail++; };
  return { ctx, triggers, cpt };
}

console.log('\n═══ 1. L\'appel de la page applique la file tout de suite ═══');
{
  KV.clear();
  const b = monde();
  for (let i = 0; i < 3; i++) deposer({ type: 'placements', year: 2027, items: [{ date: '2027-03-0' + (i + 1), marId: 'ALPHA', morning: 'REA' }] });
  const r = vm.runInContext('journalAppliquer({ direct: true })', b.ctx);
  V('les 3 fiches sont appliquées et purgées', enFile() === 0, enFile());
  V('le nombre de fiches traitées est renvoyé', r === 3, r);
  V('UNE écriture groupée au classeur', b.cpt.lots === 1, b.cpt.lots);
  V('pas de battement : il mesure le filet, pas la page', b.cpt.bat === 0, b.cpt);
  V('pas de relève du courrier : elle suit la cadence du filet', b.cpt.mail === 0, b.cpt);
  V('le verrou est rendu', VERROUS.document === false);
  V('file vide → 0, sans erreur', vm.runInContext('journalAppliquer({ direct: true })', b.ctx) === 0);
}

console.log('\n═══ 2. Le passage du déclencheur est inchangé ═══');
{
  KV.clear();
  const b = monde();
  deposer({ type: 'placements', year: 2027, items: [{ date: '2027-03-01', marId: 'ALPHA', morning: 'REA' }] });
  // Google passe un objet événement, jamais { direct: true }
  vm.runInContext('journalAppliquer({ authMode: "FULL", triggerUid: "123" })', b.ctx);
  V('la fiche est appliquée', enFile() === 0);
  V('le battement est posé', b.cpt.bat === 1, b.cpt);
  V('le courrier est relevé', b.cpt.mail === 1, b.cpt);
}

console.log('\n═══ 3. Verrou tenu par un autre passage : rien ne se perd ═══');
{
  KV.clear();
  const b = monde();
  deposer({ type: 'publier', year: 2027 });
  VERROUS.document = true;
  const r = vm.runInContext('journalAppliquer({ direct: true })', b.ctx);
  V('l\'appel direct rend la main (-1)', r === -1, r);
  V('la fiche RESTE en file pour le passage suivant', enFile() === 1, enFile());
  VERROUS.document = false;
}

console.log('\n═══ 4. L\'installation remplace l\'ancien déclencheur d\'une minute ═══');
{
  const b = monde();
  b.triggers.push({ h: 'journalAppliquer', m: 1, getHandlerFunction: () => 'journalAppliquer' });
  b.triggers.push({ h: 'miroirSyncComplet', m: 60, getHandlerFunction: () => 'miroirSyncComplet' });
  vm.runInContext('journalInstallerDeclencheur()', b.ctx);
  vm.runInContext('journalInstallerDeclencheur()', b.ctx);
  const j = b.triggers.filter(t => t.h === 'journalAppliquer');
  V('un seul déclencheur journalAppliquer après deux installations', j.length === 1, j.length);
  V('il passe toutes les 5 minutes', j[0] && j[0].m === 5, j[0] && j[0].m);
  V('les autres déclencheurs sont intacts', b.triggers.some(t => t.h === 'miroirSyncComplet'));
  V('5 est une cadence que Google accepte (1, 5, 10, 15, 30)', [1, 5, 10, 15, 30].includes(b.cpt.cadences[0]));
}

console.log('\n═══ 5. L\'action est réservée au comité ═══');
{
  KV.clear();
  const b = monde();
  deposer({ type: 'placements', year: 2027, items: [{ date: '2027-03-01', marId: 'ALPHA', morning: 'REA' }] });
  const refus = vm.runInContext('_act_journalAppliquerMaintenant({ user: { role: "mar" } })', b.ctx).getContent();
  V('un MAR est refusé', /Accès refusé/.test(refus), refus);
  V('et la file n\'est pas touchée', enFile() === 1);
  const rep = JSON.parse(vm.runInContext('_act_journalAppliquerMaintenant({ user: { role: "admin" } })', b.ctx).getContent());
  V('le comité obtient l\'application', rep.success === true && rep.appliquees === 1, rep);
  V('la file est vide', enFile() === 0);
  const idx = fs.readFileSync('../gas/Indispos.gs', 'utf8');
  V('hors du verrou d\'écriture du routeur (la note miroir prend ce verrou)',
    !/WRITE_ACTIONS_LOCK = new Set\(\[[^\]]*journalAppliquerMaintenant/.test(idx));
}

console.log('\n═══ 6. La page : un appel en vol, un de plus au retour, jamais un par clic ═══');
{
  const page = fs.readFileSync('../admin.html', 'utf8');
  const bloc = page.match(/let _jDeclEnVol = false[\s\S]*?\n}\n/);
  V('le déclencheur de la page existe', !!bloc);
  const appels = [];
  let finir = null;
  const ctx = vm.createContext({ Promise, JSON, API_URL: 'https://gas', ADMIN_CODE: 'C',
    fetch: (url, opt) => { appels.push({ url, opt }); return new Promise(r => { finir = r; }); } });
  vm.runInContext(bloc[0], ctx);
  (async () => {
    for (let i = 0; i < 5; i++) vm.runInContext('_journalDeclencher()', ctx);
    V('5 dépôts rapprochés → 1 seul appel en vol', appels.length === 1, appels.length);
    const corps = JSON.parse(appels[0].opt.body);
    V('il demande journalAppliquerMaintenant avec le code du comité', corps.action === 'journalAppliquerMaintenant' && corps.code === 'C', corps);
    V('il survit à la fermeture de la page (keepalive)', appels[0].opt.keepalive === true);
    finir({}); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    V('au retour : UN appel de plus pour les dépôts arrivés entre-temps', appels.length === 2, appels.length);
    finir({}); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    V('puis plus rien', appels.length === 2, appels.length);
    // Un échec réseau ne bloque pas le suivant
    const ctx2 = vm.createContext({ Promise, JSON, API_URL: 'x', ADMIN_CODE: 'C', fetch: () => Promise.reject(new Error('hors ligne')) });
    vm.runInContext(bloc[0], ctx2);
    vm.runInContext('_journalDeclencher()', ctx2);
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    V('après un échec réseau, le déclencheur est libre de repartir', vm.runInContext('_jDeclEnVol', ctx2) === false);

    console.log('\n═══ 7. Branchements dans la page ═══');
    const dep = page.slice(page.indexOf('async function _journalDeposer('), page.indexOf('let _jDeclEnVol'));
    V('chaque dépôt RÉUSSI appelle le déclencheur', /if \(!\(r && r\.success\)\) return null;[\s\S]*_journalDeclencher\(\);/.test(dep));
    const suivi = page.slice(page.indexOf('function _journalSuivre('), page.indexOf('async function _publierCombine('));
    V('tant que la file n\'est pas vide, la garde de fraîcheur est réarmée',
      /enAttente === 0\)[\s\S]*?return;[\s\S]*?_tsEcriturePlanning = Date\.now\(\);/.test(suivi));
    V('plus de promesse « dans la minute » sur l\'écran de publication', !/Le serveur publie dans la minute/.test(page));

    console.log('\n═══ 8. Le filet de 5 minutes ouvre toujours la file sous 15 minutes ═══');
    const w = fs.readFileSync('../cloudflare/worker.js', 'utf8');
    const filet = Number((w.match(/const J_FILET_MINUTES = (\d+)/) || [])[1]);
    let pire = 0;
    for (let depart = 0; depart < 60; depart++) {
      let k = 0; while ((depart + 5 * k) % 60 % filet !== 0) k++;
      pire = Math.max(pire, 5 * k);
    }
    V('quel que soit le décalage du déclencheur, ouverture sous 15 min (pire : ' + pire + ' min)', pire <= 10, pire);
    const diag = fs.readFileSync('../gas/diagnostic.gs', 'utf8');
    const alerte = Number((diag.match(/nom:'journalAppliquer'[^}]*alerte:(\d+)/) || [])[1]);
    V('l\'alerte « ne bat plus » (' + alerte + ' min) laisse passer un filet de 5 min', alerte >= 10, alerte);

    console.log(`\n${ok} OK · ${ko} en échec`);
    if (ko) process.exit(1);
  })().catch(e => { console.log('  ✗ exception : ' + e.message); process.exit(1); });
}
