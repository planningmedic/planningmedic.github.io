/* ═══ L'INTERFACE RÉELLE, PILOTÉE ═══
   La page admin.html du dépôt, rendue dans un navigateur simulé, alimentée par
   un planning produit par le VRAI générateur (generatePlanningFromGardes) sur un
   service fictif de 23 MAR. Je clique dans le DOM comme le ferait un membre du
   comité : case flash → panneau → choix du MAR → Publier. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm');
const monde = require('./monde');

const dodo = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,220) : '')); } };
const dstr = v => v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  : String(v).trim();   // (14/08/2026) la doublure coerce les dates comme le vrai Sheets ; les pages, elles, envoient toujours 'AAAA-MM-JJ'

(async () => {
  // ── 1. Le serveur : monde complet + planning réel ──
  const W = monde.monter(2027);
  const months = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
  const equite = { parMar: {} };
  const planningJson = { months: months.map(m => ({ ...m, doctors: m.doctors })), equiteInitiale: equite };
  const affectations = vm.runInContext('loadAffectations(2027)', W.ctx);
  const medecins = vm.runInContext('getDoctorsFromMedecins()', W.ctx);
  /* Forme EXACTE attendue par la page (SECTEURS_CFG) : code, label, court, aff,
     icon, bg/fg, cs, actif — lue dans admin.html, pas devinée. */
  const ICONES = { VIS:'🔵', REA:'🔴', ORT:'🟠', ORL:'🟣', END:'🟢', MAT:'🩷', CI:'💚', VOLANT:'⚪' };
  const secteurs = monde.SECTEURS.slice(1).map((s, i) => ({
    code: s[0], label: s[1], court: s[1].slice(0, 8), aff: s[1], icon: ICONES[s[0]] || '⚪',
    bg: '#EFF6FF', fg: '#1D4ED8', cs: null, actif: true, ordre: s[2],
  }));
  console.log(`\n  (monde prêt : ${medecins.length} MAR, ${months.length} mois générés)`);

  // ── 2. Le Worker réel, avec ces données ──
  const wsrc = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(wsrc, wctx);
  const WK = wctx.__W, M = new Map();
  const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k,v) => { M.set(k,v); }, delete: async k => { M.delete(k); },
    list: async ({prefix, limit}) => ({ keys: [...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const CODE = 'CODEADMIN99';
  M.set('acces', JSON.stringify({ indisposYear: 2027, indisposOuverte: false, users: [
    { h: await sha(CODE), role: 'admin', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Prénom0' } ] }));
  M.set('annees', JSON.stringify({ success: true, active: 2027, annees: [{ annee: 2027, statut: 'ACTIF' }] }));
  M.set('secteurs', JSON.stringify(secteurs));   // tableau : la page fait Array.isArray(m.data.secteurs)
  /* config_admin.medecins : la page attend le champ `actif` (booléen) et les
     initiales — c'est ce que pousse le miroir en production. */
  const medecinsPage = medecins.map(m => ({ ...m, actif: true, secteur: 'VOLANT' }));
  M.set('config_admin', JSON.stringify({ medecins: medecinsPage, overrides: [], seuils: null,
    anneeStatsFiables: 2027, anneeSuivante: 2028,
    csTemplate: { success: true, lignes: [] } }));
  M.set('planning_2027', JSON.stringify(planningJson));
  /* La page lit pre.affectations.affectations — emballage vérifié dans admin.html. */
  M.set('affectations_2027', JSON.stringify({ affectations }));
  /* gardes_2027 : la carte {date: {MAR: code}} que le module partagé
     (partage/dispo_jour.js) utilise pour calculer le panneau SUR LA PAGE.
     Sans elle, l'étage 2 est inactif et la page repart vers Apps Script —
     c'est précisément ce que le banc doit vérifier. */
  const gsheet = W.cl.getSheetByName('GARDES_2027').lignes;
  const datesG = gsheet[2].slice(2);
  const carte = {};
  datesG.forEach((dt, c) => {
    const jour = {};
    for (let r = 3; r < gsheet.length; r++) { const v = gsheet[r][c + 2]; if (v) jour[gsheet[r][0]] = v; }
    carte[dt] = jour;
  });
  M.set('gardes_2027', JSON.stringify({ success: true, data: carte, year: 2027 }));
  M.set('joursferies_2027', JSON.stringify({ success: true, joursFeries: ['2027-01-01','2027-05-01'] }));
  M.set('mail_nonlus', JSON.stringify({ success: true, nonLus: 3 }));
  const env = { KV, PUSH_TOKEN: 'JETON' };

  // ── 3. La page ──
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  vc.on('error', (...a) => erreurs.push('console.error: ' + a.map(String).join(' ')));
  if (process.env.VERBEUX) { vc.on('log', (...a) => console.log('    [page]', a.map(String).join(' ').slice(0,160))); vc.on('warn', (...a) => console.log('    [page-warn]', a.map(String).join(' ').slice(0,160))); }
  const dom = new JSDOM(fs.readFileSync('../admin.html','utf8'),
    { runScripts:'dangerously', virtualConsole:vc, url:'https://planningmedic.github.io/admin.html', pretendToBeVisual:true });
  const w = dom.window, d = w.document;
  /* Compléments que jsdom n'implémente pas (purement visuels) : sans eux, un
     clic réel lève une erreur et le parcours s'arrête. */
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  /* Le module partagé est chargé par <script src> depuis le dépôt : jsdom ne
     va pas le chercher, on injecte le MÊME fichier depuis le disque. */
  w.eval(fs.readFileSync('../partage/dispo_jour.js', 'utf8'));
  await dodo(400);
  let appelsGAS = 0; const appelsDetail = [];
  w.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('workers.dev')) {
      const chemin = u.replace(/^https:\/\/[^/]+/, '');
      return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
    }
    appelsGAS++;
    let action = '?';
    try { action = JSON.parse(new URLSearchParams(opt.body).get('payload')).action; } catch (e) {
      try { action = JSON.parse(opt.body).action; } catch (e2) {} }
    appelsDetail.push(action);
    return { ok:true, json: async () => ({ success:false, error:'circuit Apps Script indisponible dans le banc' }) };
  };

  console.log('\n═══ 18. J\'ouvre la page et je saisis le code ═══');
  const champ = d.getElementById('authInput');
  V('l\'écran de code s\'affiche', !!champ);
  champ.value = CODE;
  const btn = d.querySelector('.auth-btn');
  V('le bouton « Accéder » existe', !!btn, btn && btn.textContent.trim());
  btn.click();                                   // le vrai bouton, le vrai gestionnaire
  const tClic = Date.now();                      // (v1.28.1) référence : le repli mail part 6 s après le boot
  await dodo(2500);
  // Trace de diagnostic du banc : que s'est-il passé au boot ?
  try {
    const r = await w.miroirRead(['annees','secteurs','config_admin','planning_2027','affectations_2027','mail_nonlus'], CODE);
    console.log('    [diag] miroirRead → success:', r && r.success, '| identite:', r && r.identite && r.identite.role,
                '| cles:', r && r.data ? Object.keys(r.data).join(',') : '-', '| manquants:', r && r.manquants, '| refuses:', r && r.refuses);
  } catch (e) { console.log('    [diag] miroirRead a échoué :', e.message); }
  const errAuth = d.getElementById('authError');
  console.log('    [diag] message d\'erreur affiché :', errAuth ? JSON.stringify(errAuth.textContent.trim()) : '(pas de champ)');
  console.log('    [diag] overlay encore visible :', (d.querySelector('.auth-overlay') || {}).style ? d.querySelector('.auth-overlay').style.display : '?');
  console.log('    [diag] appels Apps Script :', appelsDetail.join(', ') || 'aucun');
  console.log('    [diag] conteneurs :', ['#planningGrid','#gridWrap','#planningTable','.week-grid','.grid','#tab-planning','#planningContent']
    .map(sel => sel + '=' + (d.querySelector(sel) ? 'oui' : 'non')).join(' '));
  console.log('    [diag] ids présents :', [...d.querySelectorAll('[id]')].map(e => e.id).filter(i => /plan|grid|week|sect|tab|content/i.test(i)).slice(0,20).join(' '));
  console.log('    [diag] éléments .slot* :', d.querySelectorAll('[class*="slot"]').length, '| lignes tableau :', d.querySelectorAll('tr').length);
  console.log('    [diag] classes vues :', [...new Set([...d.querySelectorAll('div,td,span')].map(e => e.className).filter(c => typeof c === 'string' && c && c.length < 30))].slice(0, 18).join(' | '));
  console.log('    [diag] AFFM :', w.eval('Object.keys(window.AFFM||{}).length'), 'MAR affectés');
  console.log('    [diag] semaines connues :', w.eval('getAllWeeks().length'),
              '| 1re semaine :', w.eval('JSON.stringify(getAllWeeks()[0] || null)').slice(0,140));
  w.eval('currentWeekIdx = 8; renderWeek();');    // une semaine de mars 2027
  await dodo(400);
  const table = d.getElementById('planTable');
  console.log('    [diag] #planTable lignes :', table ? table.querySelectorAll('tr').length : 'absent',
              '| DATA chargé :', w.eval('typeof DATA !== "undefined" && !!DATA'),
              '| mois dans DATA :', w.eval('(typeof DATA!=="undefined" && DATA && DATA.months) ? DATA.months.length : 0'));
  V('la page est authentifiée (overlay masqué)', d.querySelector('.auth-overlay').style.display === 'none');
  V('les données de planning sont chargées', w.eval('(typeof DATA!=="undefined" && DATA && DATA.months) ? DATA.months.length : 0') > 0);
  V('la grille du planning est rendue', table && table.querySelectorAll('tr').length > 2, table && table.querySelectorAll('tr').length);
  V('AUCUN appel Apps Script à l\'ouverture (v1.25)', appelsGAS === 0, appelsDetail);
  V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));

  console.log('\n═══ 19. Je place des MAR sur des cases à pourvoir ═══');
  const flashes = [...d.querySelectorAll('.slot-flash')];
  V('des cases « à pourvoir » sont présentes', flashes.length > 0, flashes.length + ' cases');
  console.log('    [diag] étage 2 :', w.eval('!!(_ETAGE2 && _ETAGE2.gardes)'),
              '| module partagé :', w.eval('typeof calculerDispoJour'),
              '| dispo locale :', w.eval('(function(){try{var r=_dispoLocale("2027-03-02");return r?r.length+" MAR":"null"}catch(e){return "err:"+e.message}})()'),
              '| affectations vues :', w.eval('_ETAGE2 ? Object.keys(_ETAGE2.affectations||{}).length : 0'),
              '| codes du 02/03 :', w.eval('_ETAGE2 && _ETAGE2.gardes ? Object.keys(_ETAGE2.gardes["2027-03-02"]||{}).length : -1'),
              '| actifs :', w.eval('_ETAGE2 ? (_ETAGE2.actifs||[]).length : 0'));
  let places = 0;
  if (flashes[0]) {
    flashes[0].click(); await dodo(400);
    const pan = d.getElementById('dispoCard');
    console.log('    [diag] panneau :', pan ? pan.id || pan.className : 'introuvable',
                '| contenu :', pan ? pan.textContent.replace(/\s+/g,' ').trim().slice(0,110) : '-');
    const cands = pan ? [...pan.querySelectorAll('[onclick]')] : [];
    console.log('    [diag] éléments cliquables :', cands.length, '| exemples :',
      cands.slice(0, 6).map(c => (c.tagName + '.' + (c.className || '') + ' → ' + (c.getAttribute('onclick') || '').slice(0, 42))).join(' ⋅ '));
  }
  for (const f of flashes.slice(0, 3)) {
    f.click(); await dodo(200);
    const panneau = d.getElementById('dispoCard');
    const candidats = panneau ? [...panneau.querySelectorAll('[onclick*="placeMAR"], .dispo-item, button')] : [];
    const choix = candidats.find(c => /placeMAR/.test(c.getAttribute('onclick') || ''));
    if (choix) { choix.click(); await dodo(200); places++; }
  }
  V('le panneau s\'ouvre et propose des MAR', places > 0, places + ' placement(s) faits');
  const enAttente = Object.keys(w._batchAll()).length;
  V('les placements entrent dans la file de la page', enAttente > 0, enAttente);

  console.log('\n═══ 20. Je publie, puis je ferme la page ═══');
  const via = await w._publierCombine(2027);
  V('la publication part par le journal Cloudflare', via === 'journal', via);
  V('la page ne garde plus rien en attente', Object.keys(w._batchAll()).length === 0, w._batchAll());
  const fiches = [...M.keys()].filter(k => k.startsWith('j_'));
  V('les intentions sont déposées et durables', fiches.length >= 1, fiches.length + ' fiche(s)');
  const ECRITURES = ['savePlanningOverridesBatch', 'publishPlanning', 'setDailyStatus', 'deleteOverride'];
  V('AUCUNE écriture n\'est passée par Apps Script',
    !appelsDetail.some(a => ECRITURES.includes(a)), appelsDetail);
  console.log('    [diag] appels serveur du parcours :', appelsDetail.join(', '));

  // « Je ferme la page » : le serveur applique seul
  const transport = (url, opt) => {
    const corps = JSON.parse(opt.payload);
    if (corps.token !== 'JETON') return { getResponseCode: () => 403, getContentText: () => '{"success":false}' };
    if (url.endsWith('/tirer')) {
      const l = [...M.keys()].filter(k => k.startsWith('j_')).sort().map(cle => ({ cle, valeur: JSON.parse(M.get(cle)) }));
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches: l }) };
    }
    if (url.endsWith('/purger')) {
      /* Même effet que la route réelle du Worker (couverte par banc_worker.mjs) :
         la fiche quitte la file et entre au registre d'audit. */
      (corps.resultats || []).forEach(r => {
        const v = M.get(r.cle);
        if (v) { const f = JSON.parse(v); f.ok = r.ok; f.detail = r.detail; f.applique = new Date().toISOString();
                 M.set('jfait_' + r.cle.slice(2), JSON.stringify(f)); M.delete(r.cle); }
      });
      return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
    }
    return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
  };
  W.ctx.UrlFetchApp = { fetch: transport };
  W.ctx._miroirNoterPoussee_ = () => {};
  W.ctx.logAction = () => {};              // vit dans Indispos.gs, absent du monde chargé ici
  vm.runInContext('var MIROIR_URL = "https://worker";', W.ctx);   // constante de miroir.gs, non chargé ici
  const { VERROUS } = require('./stubs');
  VERROUS.script = false; VERROUS.document = false;
  [['../gas/journal.gs', ['_journalEcrireLots_','journalAppliquer','_journalJeton_','_journalRafraichirMail_']],
   ['../gas/Indispos.gs', ['retirerPlacementsPourDates','appliquerStatutJour']]]
    .forEach(([f, ns]) => ns.forEach(n => { try { vm.runInContext(require('./stubs').extraireFonction(f, n), W.ctx); } catch (e) {} }));
  const avant = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  W.ctx.__diag = (m) => console.log('    [applicateur]', m);
  try {
    vm.runInContext(`
      (function(){
        var t = _journalJeton_();
        var rep = UrlFetchApp.fetch(MIROIR_URL + '/tirer', {method:'post', contentType:'application/json', payload: JSON.stringify({token:t}), muteHttpExceptions:true});
        __diag('tirer → HTTP ' + rep.getResponseCode() + ' · ' + rep.getContentText().slice(0,80));
      })();`, W.ctx);
  } catch (e) { console.log('    [applicateur] échec du tirage :', e.message); }
  try { vm.runInContext('journalAppliquer()', W.ctx); }
  catch (e) { console.log('    [applicateur] exception :', e.message); }
  const apres = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  V('APRÈS FERMETURE : les placements sont au classeur', apres > avant, { avant, apres });
  V('la file du journal est vidée', [...M.keys()].filter(k => k.startsWith('j_')).length === 0);
  V('le registre d\'audit conserve la trace', [...M.keys()].some(k => k.startsWith('jfait_')));

  console.log('\n═══ 21. Un statut posé retire le placement (cas SERVANT) ═══');
  {
    const ovs0 = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1);
    const cible = ovs0[0];
    if (cible) {
      const r = vm.runInContext(`appliquerStatutJour(2027, ${JSON.stringify(cible[1])}, 'TP', ${JSON.stringify([dstr(cible[0])])})`, W.ctx);
      V('le statut TP est posé sur le MAR placé', r.applied.length === 1, r);
      V('son placement de ce jour a disparu tout seul',
        !W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => dstr(l[0]) === dstr(cible[0]) && l[1] === cible[1]),
        { date: cible[0], mar: cible[1] });
      const moisTP = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
      const mTP = moisTP.find(m => m.id === String(cible[0]).slice(0, 7));
      const dTP = mTP && mTP.doctors.find(x => x.id === cible[1]);
      const iTP = mTP && mTP.days.findIndex(j => j.date === cible[0]);
      V('le planning régénéré ne le montre plus dans ce secteur',
        !(dTP && iTP >= 0 && dTP.days[iTP].morning === cible[2]), dTP && iTP >= 0 ? dTP.days[iTP] : null);
    }
  }

  console.log('\n═══ 22. Le planning republié reflète les placements ═══');
  const moisApres = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
  const ovs = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1);
  const un = ovs[0];
  if (un) {
    const moisCible = moisApres.find(m => m.id === dstr(un[0]).slice(0, 7));
    const doc = moisCible && moisCible.doctors.find(x => x.id === un[1]);
    const jourIdx = moisCible && moisCible.days.findIndex(j => j.date === dstr(un[0]));
    const cellule = doc && jourIdx >= 0 ? doc.days[jourIdx] : null;
    V('le placement apparaît dans le planning régénéré',
      !!cellule && (cellule.morning === un[2] || cellule.afternoon === un[3]), { attendu: un.slice(0,4), obtenu: cellule });
  }

  console.log('\n═══ 23. La pastille mail survit au repli des 6 secondes (défaut du 07/08) ═══');
  /* Défaut trouvé en production le 07/08/2026 : le boot miroir affichait la
     pastille (mail_nonlus du miroir, ici 3) puis posait mailNonLus:null dans
     l'objet de boot ; le repli `setTimeout(majCompteurMail, 6000)` partait
     donc SANS valeur et, depuis la v1.25, un appel sans valeur CACHE la
     pastille. Symptôme : visible à l'ouverture, disparue 6 s plus tard.
     Corrigé en v1.28.1 (le boot transmet le nombre du miroir). Ce scénario
     doit s'exécuter STRICTEMENT APRÈS le déclenchement du repli. */
  const resteAvantRepli = 7000 - (Date.now() - tClic);
  if (resteAvantRepli > 0) await dodo(resteAvantRepli);
  const dot = d.getElementById('mailDot');
  V('la pastille existe dans la page', !!dot);
  V('elle affiche le compte du miroir (3)', dot && dot.textContent.trim() === '3', dot && dot.textContent);
  V('elle est TOUJOURS visible après le repli des 6 s', dot && dot.style.display === 'block', dot && dot.style.display);

  console.log('\n═══ 24. Lire un message décrémente la pastille (v1.28.2) ═══');
  /* Avant v1.28.2, le gestionnaire de lecture appelait majCompteurMail() SANS
     valeur, ce qui CACHAIT la pastille (7 non-lus, 1 lu → plus rien d'affiché).
     Désormais il appelle decrementerCompteurMail() : décrément local, sans
     réseau. On exerce la vraie fonction de la page. */
  V('la fonction de décrément existe dans la page', w.eval('typeof decrementerCompteurMail') === 'function');
  V('le gestionnaire de lecture l\'utilise (plus d\'appel sans valeur)',
    /r\.marque\)\s*\{[^}]*decrementerCompteurMail\(\)/.test(fs.readFileSync('../admin.html','utf8')));
  w.eval('decrementerCompteurMail()');
  await dodo(50);
  V('3 non-lus, 1 lu → la pastille affiche 2', dot && dot.textContent.trim() === '2' && dot.style.display === 'block', dot && dot.textContent);
  w.eval('decrementerCompteurMail(); decrementerCompteurMail();');
  await dodo(50);
  V('0 non-lu → la pastille s\'efface', dot && dot.style.display === 'none', dot && dot.style.display);
  w.eval('decrementerCompteurMail()');
  await dodo(50);
  V('décrémenter sous zéro ne fait rien (pas d\'erreur, pastille éteinte)', dot && dot.style.display === 'none' && erreurs.length === 0, erreurs.slice(0,1));

  console.log('\n═══ 25. La fiche d\'un MAR : l\'adresse saisie reste affichée (défaut du 11/08/2026) ═══');
  /* Défaut trouvé en production le 11/08/2026 : une adresse e-mail ajoutée à un
     MAR était bien écrite dans le classeur, mais la page continuait d'afficher
     « — » dans l'onglet Équipe et « ✕ pas d'email » dans Maintenance. Cause :
     saveMAR relisait la liste avec loadEquipe() SANS force, et loadEquipe rend
     la main immédiatement quand marData est déjà en mémoire (il l'est depuis le
     boot). L'écran réaffichait donc l'instantané d'AVANT l'enregistrement.
     Second effet : Maintenance lit marsData, alimenté au seul boot — même
     l'actualisation d'Équipe ne le rafraîchissait pas.
     Ici on simule le SERVEUR (le classeur) et on pilote la vraie fiche. */
  const SERVEUR_MED = medecinsPage.map(m => ({ ...m, email: '' }));
  const CIBLE = SERVEUR_MED[1].id;
  const fetchAvant = w.fetch;
  let ecritures = 0, lectures = 0;
  w.fetch = async (url, opt) => {
    if (String(url).includes('workers.dev')) return fetchAvant(url, opt);
    let corps = {};
    try { corps = JSON.parse(opt.body); } catch (e) {}
    if (corps.action === 'getMedecins') {
      lectures++;
      return { ok:true, json: async () => ({ success:true, medecins: JSON.parse(JSON.stringify(SERVEUR_MED)) }) };
    }
    if (corps.action === 'saveMedecin') {
      ecritures++;
      const m = corps.medecin || {};
      const l = SERVEUR_MED.find(x => x.id === m.id);
      if (l && m.email !== undefined) l.email = String(m.email).trim();   // même règle que saveMedecin (colonne H écrite telle quelle)
      return { ok:true, json: async () => ({ success:true, created:false, rowsCreated:[] }) };
    }
    return { ok:true, json: async () => ({ success:false, error:'action non simulée : ' + corps.action }) };
  };

  w.eval('showTab("equipe")'); await dodo(300);
  const ligneCible = () => [...d.querySelectorAll('#equipeBody tr')]
    .find(tr => tr.textContent.includes(CIBLE));
  V('l\'onglet Équipe affiche le MAR visé', !!ligneCible(), CIBLE);
  V('il n\'a pas encore d\'adresse', ligneCible() && /—/.test(ligneCible().textContent));

  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  V('la fiche s\'ouvre', d.getElementById('modalMAR').classList.contains('open'));
  d.getElementById('marEmail').value = 'test.banc@exemple.fr';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);

  V('l\'enregistrement est parti au serveur', ecritures === 1, ecritures);
  V('le classeur simulé porte la nouvelle adresse',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'test.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  V('la liste est RELUE au serveur après l\'enregistrement (force)', lectures >= 1, lectures);
  V('l\'onglet Équipe affiche l\'adresse tout de suite',
    !!ligneCible() && ligneCible().textContent.includes('test.banc@exemple.fr'),
    ligneCible() && ligneCible().textContent.replace(/\s+/g,' ').trim().slice(0,120));
  V('la liste servant à Maintenance suit aussi',
    w.eval('(marsData.find(function(m){return m.id===' + JSON.stringify(CIBLE) + '})||{}).email') === 'test.banc@exemple.fr',
    w.eval('JSON.stringify((marsData.find(function(m){return m.id===' + JSON.stringify(CIBLE) + '})||{}).email)'));

  w.eval('initMaintenance()'); await dodo(600);
  const ligneMaint = [...d.querySelectorAll('#codesList label')].find(l => l.textContent.includes(CIBLE) || l.textContent.includes('test.banc@exemple.fr'));
  V('Maintenance ne dit plus « pas d\'email » pour ce MAR',
    !!ligneMaint && !/pas d'email/.test(ligneMaint.textContent),
    ligneMaint && ligneMaint.textContent.replace(/\s+/g,' ').trim().slice(0,120));
  V('sa case est cochable (envoi possible)',
    !!ligneMaint && !ligneMaint.querySelector('input').disabled);

  console.log('\n═══ 26. Un champ e-mail vidé ne peut plus effacer l\'adresse en silence ═══');
  /* Le serveur écrit la colonne EMAIL telle qu\'elle arrive : un champ vide
     EFFACE. Tant que l\'écran pouvait montrer une fiche périmée (défaut 25),
     un simple ré-enregistrement suffisait à perdre l\'adresse. Garde-fou :
     on ne demande confirmation QUE pour adresse connue → champ vide. */
  let questions = 0;
  w.confirm = (msg) => { questions++; w.__derniereQuestion = msg; return false; };
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  V('la fiche se rouvre avec l\'adresse enregistrée',
    d.getElementById('marEmail').value === 'test.banc@exemple.fr', d.getElementById('marEmail').value);
  const ecrituresAvant = ecritures;
  d.getElementById('marEmail').value = '';
  d.getElementById('btnSaveMAR').click();
  await dodo(600);
  V('la suppression déclenche une question', questions === 1, questions);
  V('la question nomme le MAR et montre l\'adresse',
    /test\.banc@exemple\.fr/.test(w.__derniereQuestion || ''), (w.__derniereQuestion||'').replace(/\n+/g,' ').slice(0,110));
  V('refusée, RIEN n\'est envoyé au serveur', ecritures === ecrituresAvant, ecritures - ecrituresAvant);
  V('l\'adresse est intacte au classeur',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'test.banc@exemple.fr');

  w.confirm = () => { questions++; return true; };
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marEmail').value = '';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('acceptée, l\'effacement se fait bien', SERVEUR_MED.find(x => x.id === CIBLE).email === '',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  V('l\'écran le reflète immédiatement', !!ligneCible() && /—/.test(ligneCible().textContent),
    ligneCible() && ligneCible().textContent.replace(/\s+/g,' ').trim().slice(0,110));

  questions = 0;
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marEmail').value = 'autre.banc@exemple.fr';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('AJOUTER une adresse ne pose aucune question', questions === 0, questions);
  V('et elle est bien enregistrée', SERVEUR_MED.find(x => x.id === CIBLE).email === 'autre.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  questions = 0;
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marQuotite').value = '80';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('modifier autre chose que l\'e-mail ne pose aucune question', questions === 0, questions);
  V('et l\'adresse survit à cette modification',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'autre.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);

  w.fetch = fetchAvant;

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
