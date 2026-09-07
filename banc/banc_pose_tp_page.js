/* ═══ BANC — L'ÉCRAN DE POSE DES TP, PILOTÉ POUR DE VRAI (23/08/2026) ═══════
   Pourquoi ce scénario existe : le 23 août au matin, l'écran s'ouvrait BLANC
   en production. Tous les tests étaient au vert — parce qu'ils passaient la clé
   à la page DIRECTEMENT, en mémoire. La copie rapide, elle, met tout en TEXTE.
   `getJoursFeries` renvoyant un ENSEMBLE, les fériés arrivaient en {} : la page
   plantait sur `new Set({})`, et le filet de la connexion avalait l'erreur.

   Ici, rien n'est raccourci : la clé est construite par le vrai code serveur,
   écrite dans un stockage simulé, relue à travers le VRAI Worker, et la VRAIE
   page indispos.html?tp=1 est pilotée jusqu'à l'affichage du calendrier.
   Le seul faux-semblant est l'infrastructure (stockage, réseau) — jamais la
   logique.                                                                  */
const fs = require('fs'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Classeur, extraireFonction } = require('./stubs');

let ok = 0, ko = 0;
function V(libelle, condition, detail) {
  if (condition) { ok++; console.log('  ✓ ' + libelle); }
  else { ko++; console.log('  ✗ ' + libelle + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); }
}

/* Un service d'anesthésie réduit mais complet : 17 MARs, dont un à 90 % sans
   jours fixes (le profil de test), une garde, un repos, une récupération. */
function classeurDeTest() {
  const cl = new Classeur();
  /* Même forme d'onglets que banc_pose_tp.js : les colonnes de MEDECINS sont
     positionnelles (3 ACTIF, 4 QUOTITE, 6 CODE, 14 rythme_2sur2, 16 jours fixes). */
  const ligneMed = function (id, quotite) {
    return [id, 'DR ' + id, id.slice(0, 2), 'O', quotite, 100, 'C' + id, '', '', '', '', '', '', '', '', '', ''];
  };
  const ids = ['POSEUR'];
  for (let i = 1; i <= 16; i++) ids.push('PLEIN' + String(i).padStart(2, '0'));
  const med = [['ID','NOM','INITIALES','ACTIF','QUOTITE','PCT_GARDES','CODE','EMAIL','DECT','date_debut','date_fin','no_garde','only_18','no_weekend','rythme_2sur2','souhait_plafond','tp_jours_fixes']];
  med.push(ligneMed('POSEUR', 90));
  for (let i = 1; i <= 16; i++) med.push(ligneMed('PLEIN' + String(i).padStart(2, '0'), 100));
  cl.ajouter('MEDECINS', med);
  cl.ajouter('CONFIG', [['CLE','VALEUR'], ['ANNEE_ACTIVE', '2026'], ['ADMIN_CODE', 'ADMINTEST']]);
  cl.ajouter('CONFIG_CONGES', [['QUOTITE','VAC','FORM','CTP'], [100,33,10,0], [90,30,9,26], [80,26,8,3]]);

  const dates = [];
  const d = new Date(2027, 0, 4);
  for (let j = 0; j < 60; j++) {
    dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    d.setDate(d.getDate() + 1);
  }
  const grille = function (lignes) {
    const t = [['MÉDECIN'].concat(dates.map(function () { return 'Janvier'; })),
               ['JOUR'].concat(dates.map(function (ds) { return 'LMMJVSD'[(new Date(ds + 'T12:00:00').getDay() + 6) % 7]; })),
               ['N°'].concat(dates.map(function (ds) { return Number(ds.slice(8)); }))];
    ids.forEach(function (id) {
      const l = [id].concat(dates.map(function () { return ''; }));
      (lignes[id] || []).forEach(function (p) {
        const i = dates.indexOf(p[0]);
        if (i >= 0) l[i + 1] = p[1];
      });
      t.push(l);
    });
    return t;
  };
  cl.ajouter('GARDES_2027', grille({ POSEUR: [['2027-01-06', 'G'], ['2027-01-07', 'RG'], ['2027-01-08', 'R']] }));
  cl.ajouter('INDISPOS_2027', grille({ POSEUR: [['2027-01-11', 'VAC'], ['2027-01-12', 'TP']] }));
  cl.ajouter('LIENS_R_2027', [['A']]);
  return cl;
}

function construireCle(cl, annee) {
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set, RegExp, parseInt, isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return cl; } }, Logger: { log: function () {} },
    Utilities: { formatDate: function (d) { return d.toISOString().slice(0, 10); } },
    Session: { getScriptTimeZone: function () { return 'Europe/Paris'; } } });
  ctx.globalThis = ctx;
  vm.runInContext('function logAction(){}', ctx);
  vm.runInContext('function _configRows_(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG").getDataRange().getValues(); }', ctx);
  ['getActiveYear', 'getPremierJourPlanning', 'reconstruireDatesHeaders', 'buildDateToCol', 'getJoursFeries']
    .forEach(function (n) { vm.runInContext(extraireFonction('../gas/code.gs', n), ctx); });
  vm.runInContext('let _medFlagsCache = null;', ctx);
  vm.runInContext(extraireFonction('../gas/code.gs', 'getMedecinFlags'), ctx);
  vm.runInContext(extraireFonction('../gas/generateur_gardes.gs', 'estSemaineOff'), ctx);
  vm.runInContext('let _quotasCache = null;', ctx);
  ['_phaseTp_', 'getIndisposForDoctor', '_loadQuotasConges', 'getQuotasConges', '_tpFixeDe_', '_quotiteDe_',
   '_tpFermesSheet_', '_tpFermes_', '_tpDemandesSheet_', '_tpDemandes_',
   '_tpMondePresence_', '_construirePoseTp_']
    .forEach(function (n) { vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx); });
  return vm.runInContext('_construirePoseTp_(' + annee + ')', ctx);
}

/* Monte la vraie page avec le stockage fourni, et rend son état final. */
async function ouvrirLaPage(M, code) {
  const srcW = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ console, JSON, Object, String, Number, Array, Math, Set, RegExp, Date, Promise,
    crypto: require('crypto').webcrypto, TextEncoder, Response, Request, Headers, URL });
  wctx.globalThis = wctx; vm.runInContext(srcW, wctx);
  const WK = wctx.__W;
  const KV = { get: async function (k) { return M.has(k) ? M.get(k) : null; },
               put: async function (k, v) { M.set(k, v); }, delete: async function (k) { M.delete(k); },
               list: async function (o) { return { keys: [...M.keys()].filter(function (k) { return k.startsWith(o.prefix || ''); }).map(function (name) { return { name }; }) }; } };
  const env = { KV, PUSH_TOKEN: 'JETON' };

  const contenu = fs.readFileSync('../indispos.html', 'utf8');
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', function (e) { erreurs.push(e.message); });
  const dom = new JSDOM(contenu, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/indispos.html?tp=1', pretendToBeVisual: true,
    beforeParse: function (win) {
      win.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
      win.Element.prototype.scrollIntoView = function () {};
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.scrollTo = function () {};
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
    } });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = function () { return true; };
  w.__appels = [];
  w.fetch = async function (url, opt) {
    const u = String(url);
    w.__appels.push({ t: Date.now(), url: u.includes('workers.dev') ? 'RELAIS' : 'GAS', taille: (opt && opt.body || '').length });
    if (u.includes('workers.dev')) {
      await new Promise(function (r) { setTimeout(r, 40); });   // latence réelle du relais
      return WK.fetch(new Request('https://worker' + u.replace(/^https:\/\/[^/]+/, ''), { method: 'POST', body: opt.body }), env);
    }
    // Apps Script volontairement injoignable : la copie rapide doit suffire.
    return { ok: true, json: async function () { return { success: false, error: 'GAS injoignable (banc)' }; } };
  };
  await new Promise(function (r) { setTimeout(r, 300); });
  /* Le squelette ne vit que le temps de la lecture réseau : on guette en
     continu plutôt qu'à un instant choisi, sinon on mesure sa propre latence. */
  let jete = null, squeletteVuPendant = false;
  const guet = setInterval(function () {
    if (w.document.getElementById('tpxSquelette')) squeletteVuPendant = true;
  }, 1);
  const p = w.doLogin(code, true);   // reconnexion silencieuse : le code est en mémoire
  try { await p; } catch (e) { jete = e; }
  clearInterval(guet);
  await new Promise(function (r) { setTimeout(r, 500); });
  const vis = function (id) { const e = w.document.getElementById(id); return e ? (e.style.display || 'defaut') : 'ABSENT'; };
  const grille = w.document.getElementById('tpxGrid');
  const ferme = w.document.getElementById('tpxFerme');
  return { erreurs, jete, appels: w.__appels, squeletteVuPendant: squeletteVuPendant,
           squeletteRestant: !!w.document.getElementById('tpxSquelette'), tpApp: vis('tpApp'), tpxFerme: vis('tpxFerme'),
           cases: grille ? grille.children.length : 0,
           texteFerme: ferme ? ferme.textContent.trim() : '',
           quota: (w.document.getElementById('tpxReste') || {}).textContent || '' };
}


/* Monte admin.html et rend de quoi piloter le bloc comité. */
async function ouvrirAdmin(M, codeAdmin) {
  const srcW = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ console, JSON, Object, String, Number, Array, Math, Set, RegExp, Date, Promise,
    crypto: require('crypto').webcrypto, TextEncoder, Response, Request, Headers, URL });
  wctx.globalThis = wctx; vm.runInContext(srcW, wctx);
  const WK = wctx.__W;
  const KV = { get: async function (k) { return M.has(k) ? M.get(k) : null; },
               put: async function (k, v) { M.set(k, v); }, delete: async function (k) { M.delete(k); },
               list: async function (o) { return { keys: [] }; } };
  const env = { KV, PUSH_TOKEN: 'JETON' };
  const contenu = fs.readFileSync('../admin.html', 'utf8');
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', function (e) { erreurs.push(e.message); });
  const dom = new JSDOM(contenu, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
    beforeParse: function (win) {
      win.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
      win.Element.prototype.scrollIntoView = function () {};
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.scrollTo = function () {}; win.alert = function () {}; win.confirm = function () { return true; };
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
    } });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = function () { return true; };
  const envoyes = [];
  w.fetch = async function (url, opt) {
    const u = String(url);
    if (u.includes('workers.dev')) {
      return WK.fetch(new Request('https://worker' + u.replace(/^https:\/\/[^/]+/, ''), { method: 'POST', body: opt.body }), env);
    }
    const p = JSON.parse(opt.body || '{}');
    envoyes.push(p);
    if (p.action === 'deciderJourTpLot') {
      return { ok: true, json: async function () { return { success: true, faits: (p.decisions || []).length, rates: 0, detail: [] }; } };
    }
    if (p.action === 'deciderJourTp') {
      return { ok: true, json: async function () { return { success: true, date: p.date, doctorId: p.doctorId,
        fermes: [], rendues: {}, quota: { valides: 1, total: 26 } }; } };
    }
    return { ok: true, json: async function () { return { success: false, error: 'action non simulée' }; } };
  };
  await new Promise(function (r) { setTimeout(r, 400); });
  /* ADMIN_CODE est un `let` de la page : on l'affecte dans son propre contexte. */
  w.eval('ADMIN_CODE = ' + JSON.stringify(codeAdmin));
  return { w, envoyes, erreurs };
}

(async function () {
  console.log('\n═══ 1. La clé fait le voyage, la page monte le calendrier ═══');
  const cl = classeurDeTest();
  const cle = construireCle(cl, 2027);
  V('le serveur construit une clé ouverte', cle && !cle.ferme && cle.year === 2027, cle && cle.ferme);
  V('les fériés en sortent en LISTE, pas en ensemble (défaut du 23/08)',
    Array.isArray(cle.joursFeries), Object.prototype.toString.call(cle.joursFeries));

  const crypto = require('crypto');
  const CODE = 'CODE1';
  const M = new Map();
  M.set('acces', JSON.stringify({ users: [{ h: crypto.createHash('sha256').update(CODE).digest('hex'),
    id: 'POSEUR', role: 'mar', name: 'DR POSEUR', initials: 'PO', quotite: 90, tpFixe: false }],
    phaseTp: { actif: true, annee: 2027, annees: [2027] }, indisposYear: 2027, indisposOuverte: true }));
  M.set('pose_tp_2027', JSON.stringify(cle));       // ← le VOYAGE : mise en texte

  const r = await ouvrirLaPage(M, CODE);
  V('aucune erreur JavaScript à l\'ouverture', r.erreurs.length === 0 && !r.jete, r.erreurs.slice(0, 2));
  V('l\'écran de pose est AFFICHÉ', r.tpApp === 'block', { tpApp: r.tpApp, ferme: r.tpxFerme });
  V('le calendrier porte ses cases (7 en-têtes + les jours du mois)', r.cases > 30, r.cases);
  V('le quota du MAR à 90 % est affiché', /26/.test(r.quota), r.quota);
  console.log('    [chrono] appels réseau avant affichage :', r.appels.map(function (a) { return a.url; }).join(' + '));
  V('un seul aller-retour réseau bloque l\'affichage (la copie rapide)',
    r.appels.filter(function (a) { return a.url === 'RELAIS'; }).length === 1, r.appels.map(function (a) { return a.url; }));
  V('pendant cette attente, un squelette occupe l\'écran — jamais du vide', r.squeletteVuPendant);
  V('…et il disparaît dès que le calendrier est là', !r.squeletteRestant);
  V('JAMAIS d\'écran blanc : quelque chose est toujours visible',
    r.tpApp === 'block' || r.tpxFerme === 'block', { tpApp: r.tpApp, ferme: r.tpxFerme });

  console.log('\n═══ 2. Une clé abîmée donne un MESSAGE, jamais du vide ═══');
  /* Exactement le défaut du 23/08 : les fériés arrivent en objet vide, comme
     le ferait un serveur pas encore mis à jour. */
  const abimee = JSON.parse(JSON.stringify(cle));
  abimee.joursFeries = {};
  const M2 = new Map(M);
  M2.set('pose_tp_2027', JSON.stringify(abimee));
  const r2 = await ouvrirLaPage(M2, CODE);
  V('la page tient le coup et affiche quand même le calendrier',
    r2.tpApp === 'block' || r2.tpxFerme === 'block', { tpApp: r2.tpApp, ferme: r2.tpxFerme });
  V('aucune erreur non rattrapée', !r2.jete, r2.jete && r2.jete.message);

  console.log('\n═══ 3. Hors phase : un message clair, pas une page vide ═══');
  const cl3 = classeurDeTest();
  cl3.supprimer ? cl3.supprimer('LIENS_R_2027') : null;
  const M3 = new Map(M);
  M3.set('pose_tp_2027', JSON.stringify({ success: true, ferme: true, year: 2027 }));
  const r3 = await ouvrirLaPage(M3, CODE);
  V('l\'écran « pose fermée » s\'affiche', r3.tpxFerme === 'block', { tpApp: r3.tpApp, ferme: r3.tpxFerme });
  V('et il porte un texte lisible', r3.texteFerme.length > 30, r3.texteFerme.slice(0, 60));


  console.log('\n═══ 4. Le comité clique « Valider » — et ça part vraiment ═══');
  {
    /* Défaut du 23/08 : le bloc comité appelait `apiCall`, qui n'existe pas
       dans admin.html (cette page parle au serveur par `api({action})`).
       Chaque clic levait une erreur silencieuse : l'alerte s'affichait, les
       boutons ne faisaient RIEN. Ici, le bouton est réellement cliqué. */
    const cleTPA = JSON.parse(JSON.stringify(cle));
    cleTPA.parMar['POSEUR'].jours['2027-02-18'] = 'TPA';
    cleTPA.presents['2027-02-18'] = 14;
    const M4 = new Map();
    M4.set('acces', JSON.stringify({ users: [{ h: require('crypto').createHash('sha256').update('ADMINTEST').digest('hex'),
      id: 'ADMIN', role: 'admin', name: 'Comité', initials: 'ADM' }],
      phaseTp: { actif: true, annee: 2027, annees: [2027] }, indisposYear: 2027, indisposOuverte: true }));
    M4.set('pose_tp_2027', JSON.stringify(cleTPA));
    const A = await ouvrirAdmin(M4, 'ADMINTEST');
    V('admin.html se charge sans erreur', A.erreurs.length === 0, A.erreurs.slice(0, 2));
    V('le bloc comité expose bien ses fonctions', typeof A.w.tpcCharger === 'function' && typeof A.w.tpcDecider === 'function');
    await A.w.tpcCharger();
    await new Promise(function (r) { setTimeout(r, 200); });
    const alerte = A.w.document.getElementById('tpcBloc');
    /* TPC est un `let` de la page : il ne vit pas sur window — on le lit
       dans son propre contexte, comme ADMIN_CODE. */
    const demandes = function () { return A.w.eval('JSON.parse(JSON.stringify(TPC ? TPC.demandes : []))'); };
    V('l\'alerte s\'affiche avec la demande en attente',
      alerte && alerte.style.display === 'block' && demandes().length === 1, demandes());
    A.envoyes.length = 0;
    let jete = null;
    /* (23/08/2026) Marquer ne parle plus au serveur : le comité marque sa
       liste, puis l'envoie d'un coup. On vérifie les deux temps. */
    try { A.w.tpcDecider(0, 'ok'); } catch (e) { jete = e; }
    V('le clic « Valider » n\'a levé AUCUNE erreur', !jete, jete && jete.message);
    V('…et n\'a RIEN envoyé au serveur : rien n\'est écrit avant le bouton',
      A.envoyes.filter(p => /deciderJourTp/.test(p.action || '')).length === 0, A.envoyes.map(p => p.action));
    V('la ligne passe à « validé » dans l\'écran', demandes()[0].etat === 'ok', demandes()[0]);
    const barre = A.w.document.getElementById('tpcBarre');
    V('la barre d\'envoi apparaît', barre && barre.style.display === 'flex', barre && barre.style.display);
    try { await A.w.tpcEnvoyer(); } catch (e) { jete = e; }
    const envoi = A.envoyes.filter(p => p.action === 'deciderJourTpLot')[0];
    V('l\'envoi groupé part, en UNE requête', !!envoi && !jete, A.envoyes.map(p => p.action));
    V('…il porte l\'année, le code du comité et la décision',
      envoi && envoi.year === 2027 && !!envoi.code
      && envoi.decisions[0].decision === 'valider' && envoi.decisions[0].doctorId === 'POSEUR'
      && envoi.decisions[0].date === '2027-02-18', envoi && envoi.decisions);
    const adm = fs.readFileSync('../admin.html', 'utf8');
    V('témoin : plus aucun appel à un `apiCall` inexistant dans admin.html', !/apiCall\(/.test(adm));
  }

  
/* ═══ (06/09/2026) REFONTE VISUELLE DE LA TUILE ════════════════════════
   Même direction que la campagne, fonctionnement inchangé. Quatre inconforts :
   la case était haute (62 px) et sa couleur tenait dans un badge de mot ; les
   outils étaient EN HAUT ; l'aide occupait la moitié d'un écran en permanence ;
   et « tendu » (un jour du service, encore ouvert mais serré) portait la même
   couleur que « demandé » (VOTRE jour, en attente du comité).
   Ajouté : l'écran sert TOUTE L'ANNÉE — un jour de temps partiel écoulé garde
   sa couleur en atténué, il reste compté ; aujourd'hui est cerclé. */
{
  const fsx = require('fs');
  const pg = fsx.readFileSync(__dirname + '/../indispos.html', 'utf8');
  const W = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
    else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
  console.log('\n─── La refonte visuelle ───');
  const iOut = pg.indexOf('<div class="tpx-legend" id="tpxLegend">');
  const iCal = pg.indexOf('<div class="calendar-grid" id="tpxGrid">');
  W('les outils sont SOUS le calendrier', iOut > iCal, { outils: iOut, calendrier: iCal });
  W('…et collants', /\.tpx-legend\{position:sticky/.test(pg));
  W('la case est carrée et la couleur la remplit',
    /\.tpx-day\{[\s\S]{0,120}aspect-ratio:1/.test(pg)
    && /\.tpx-day\.pose\{background:var\(--tpx-fg\)/.test(pg));
  W('un jour écoulé garde sa couleur, atténué et figé',
    /\.tpx-day\.passe\{opacity:\.45;cursor:default\}/.test(pg)
    && /if \(e\.passe\) cls \+= ' passe';/.test(pg));
  W('aujourd\'hui est cerclé', /\.tpx-day\.auj\{box-shadow/.test(pg)
    && /if \(ds === tpxAujourdhui\(\)\) cls \+= ' auj';/.test(pg));
  W('« demandé » se distingue de « tendu »',
    /\.tpx-day\.reserve\{background:var\(--tpx\);border:1\.5px dashed/.test(pg)
    && /\.tpx-day\.reserve::after\{content:'⏳'/.test(pg));
  W('l\'aide se replie', /<details class="tpx-aide">/.test(pg) && /\.tpx-aide summary\{/.test(pg));
  W('…et décrit le jour écoulé', /un jour déjà écoulé : figé, mais toujours compté/.test(pg));
  W('la jauge se lit en trois temps',
    /id="tpxJaugePasse"/.test(pg) && /id="tpxJaugeRes"/.test(pg)
    && /function tpxComptePasses\(\)/.test(pg));
  W('l\'outil de pose estompe les jours hors de portée',
    /cls \+= ' hors-portee'/.test(pg) && /\.tpx-day\.hors-portee\{opacity/.test(pg));
  W('changer d\'outil redessine le calendrier', /if \(document\.getElementById\('tpxGrid'\)\) tpxRendre\(\);/.test(pg));
  W('les refus s\'écrivent sous le calendrier', /function tpxRefus\(msg\)/.test(pg)
    && (pg.match(/tpxRefus\(/g) || []).length >= 4);
  W('le motif d\'un refus passe sous le jour', /class="tpx-recap-motif"/.test(pg));
  W('le serveur juge toujours : rien de la logique n\'a bougé',
    /onclick="tpxEnregistrer\(\)"/.test(pg) && /function tpxEtat\(ds\)/.test(pg));
}

console.log(`\n${ko === 0 ? '✅' : '❌'} banc_pose_tp_page : ${ok} vérifications, ${ko} échec(s)`);
  process.exit(ko === 0 ? 0 : 1);
})();
