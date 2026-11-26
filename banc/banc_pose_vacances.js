/* ═══ BANC — POSE LIBRE DES VACANCES APRÈS GÉNÉRATION (25/11/2026) ═══════════
   Décision du responsable (25/11/2026) : une fois l'année générée, chaque MAR
   ajoute, déplace ou retire lui-même ses vacances. Le serveur (_poserVac_,
   temps_partiel.gs) tranche :
   · jour VERT seulement — il resterait ≥ 15 présents (seuil de confort) ;
   · au moins 7 jours à l'avance, pour poser comme pour retirer ;
   · jamais sur un jour occupé (garde, repos, 18 h, formation, TP, récup) ;
   · dans le quota de la quotité (jour 1, 24/12 et 31/12 ½, demi-journée ½).
   Tout le code exécuté ici est EXTRAIT des fichiers livrés — même monde que
   banc_pose_tp.js (16 MAR actifs, 2027 générée). Puis la vraie page
   indispos.html?vac=1 est pilotée, et la tuile du portail vérifiée. */
const vm = require('vm'), fs = require('fs');
const { Classeur, extraireFonction, socleMedecins } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const SRC_IND = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;

/* Le bloc routeur `if (action === 'saveIndispos') { … }` est découpé du vrai
   fichier par appariement d'accolades, puis enveloppé dans une fonction. */
/* (15/09/2026) Le bloc routeur est devenu _act_saveIndispos(R) : même handler, via stubs.blocAction. */
function extraireBlocHandler() { return require('./stubs').blocAction('saveIndispos', 'handlerSaveIndispos'); }

/* Constantes réelles extraites du fichier livré (jamais recopiées à la main). */
function extraireConst(nom) {
  const m = SRC_IND.match(new RegExp('(?:const|let)\\s+' + nom + '[^;\\n]*;'));
  if (!m) throw new Error(nom + ' introuvable dans Indispos.gs');
  return m[0];
}

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function ongletIndispos(annee, ids) {
  const dates = [], e1 = [''], e2 = [''];
  for (let m = 0; m < 12; m++) {
    const nb = new Date(annee, m + 1, 0).getDate();
    for (let j = 1; j <= nb; j++) {
      dates.push(`${annee}-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`);
      e1.push(j === 1 ? `${MOIS[m]} ${annee}` : '');
      e2.push(j);
    }
  }
  const lignes = [e1, [''].concat(dates.map(() => '')), e2];
  ids.forEach(id => lignes.push([id].concat(dates.map(() => ''))));
  return { lignes, dates };
}

/* MEDECINS aux colonnes EXACTES de production (0 id, 3 actif, 4 quotité,
   14 rythme_2sur2, 16 tp_jours_fixes). */
function ligneMed(id, quotite, opts) {
  const l = [id, id, id.slice(0, 2), 'O', quotite, 100, 'C' + id, '', '', '', '', '', '', '',
             (opts && opts.rythme2sur2) ? 'O' : '', '', (opts && opts.tpFixes) || ''];
  return l;
}

/* Le monde : 16 MAR actifs (POSEUR 80 %, ZORRO 90 %, 14 pleins), année active
   2026, planning 2027 généré (GARDES + LIENS_R). Effectif simple à compter :
   ni rythme 2/2 ni jours fixes ici — l'éligibilité a son propre monde. */
function monde(opts) {
  opts = opts || {};
  const cl = new Classeur();
  const ids = ['POSEUR', 'ZORRO'];
  for (let i = 1; i <= 14; i++) ids.push('PLEIN' + String(i).padStart(2, '0'));
  const med = [['ID','NOM','INITIALES','ACTIF','QUOTITE','PCT_GARDES','CODE','EMAIL','DECT','date_debut','date_fin','no_garde','only_18','no_weekend','rythme_2sur2','souhait_plafond','tp_jours_fixes']];
  med.push(ligneMed('POSEUR', 80));
  med.push(ligneMed('ZORRO', 90));
  for (let i = 1; i <= 14; i++) med.push(ligneMed('PLEIN' + String(i).padStart(2, '0'), 100));
  if (opts.extras) opts.extras.forEach(l => { med.push(l); ids.push(l[0]); });
  cl.ajouter('MEDECINS', med);
  const cfg = [['CLE','VALEUR'], ['ANNEE_ACTIVE', '2026']];
  if (opts.campagne) cfg.push(['INDISPOS_ACTIVE', '2027']);
  if (opts.finSaisie) cfg.push(['INDISPOS_FIN', opts.finSaisie]);   // (11/10/2026) date limite de saisie
  cl.ajouter('CONFIG', cfg);
  cl.ajouter('CONFIG_CONGES', [['QUOTITE','VAC','FORM','CTP'], [100,33,10,0], [90,30,9,2], [80,26,8,3], [60,20,6,4], [50,17,5,4]]);
  const ind27 = ongletIndispos(2027, ids);
  (opts.indispos || []).forEach(([id, ds, code]) => {
    const r = 3 + ids.indexOf(id), c = 1 + ind27.dates.indexOf(ds);
    ind27.lignes[r][c] = code;
  });
  cl.ajouter('INDISPOS_2027', ind27.lignes);
  cl.ajouter('INDISPOS_2026', ongletIndispos(2026, ids).lignes);   // témoin anti-fuite
  if (opts.gardes2027 !== false) {
    /* GARDES_{Y} : colonnes positionnelles depuis le 1er jour planning
       (buildDateToCol), MAR dès la ligne 4. 04/01/2027 = colonne 1. */
    const nCols = 364;
    const g = [Array(nCols + 1).fill(''), Array(nCols + 1).fill(''), Array(nCols + 1).fill('')];
    const debut = new Date(2027, 0, 4, 12, 0, 0);
    const colDe = ds => {
      const dt = new Date(ds + 'T12:00:00');
      return Math.round((dt - debut) / 86400000) + 1;
    };
    ids.forEach(id => g.push([id].concat(Array(nCols).fill(''))));
    /* (23/08/2026) Le générateur RECOPIE les absences d'INDISPOS dans GARDES
       (V, F, CL) au moment du calcul, et depuis la refonte c'est GARDES qui
       porte les TP. Le décor doit refléter cette réalité, sinon on teste un
       classeur qui n'existe pas. Les demandes en attente (TPA), elles,
       n'entrent nulle part dans le planning : registre TP_DEMANDES. */
    const MAP_GARDES = { VAC: 'V', FORM: 'F', CL: 'CL', CTP: 'TP', TP: 'TP' };
    const demandes = [['ANNEE', 'DATE', 'MAR', 'QUAND']];
    (opts.indispos || []).forEach(([id, ds, code]) => {
      const c = String(code).toUpperCase();
      if (c === 'TPA') { demandes.push([2027, ds, id, '2026-08-23T00:00:00Z']); return; }
      if (MAP_GARDES[c]) g[3 + ids.indexOf(id)][colDe(ds)] = MAP_GARDES[c];
    });
    (opts.gardes || []).forEach(([id, ds, code]) => { g[3 + ids.indexOf(id)][colDe(ds)] = code; });
    cl.ajouter('GARDES_2027', g);
    if (demandes.length > 1) cl.ajouter('TP_DEMANDES', demandes);
  }
  if (opts.liens2027 !== false) cl.ajouter('LIENS_R_2027', [['A']]);
  if (opts.gardes2026) cl.ajouter('GARDES_2026', [['A']]);

  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set, RegExp, parseInt, isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl }, Logger: { log() {} },
    Utilities: { formatDate: (d, tz, fmt) => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } },   // heure LOCALE, comme le vrai formatDate dans le fuseau du script : toISOString() reculait d'un jour hors UTC
    Session: { getScriptTimeZone: () => 'Europe/Paris' } });
  ctx.globalThis = ctx;
  socleMedecins(ctx);   // (14/09/2026) COL_MED, _medecinsRows_, _medecinsInvalider_ (code.gs)
  require('./stubs').socleReliquats(ctx);   // (26/11/2026) reliquat de vacances de l'année précédente
  /* Doublures d'infrastructure (jamais de logique métier) : journal, memo
     CONFIG (lecture directe, pas de cache à invalider), réponse HTTP. */
  vm.runInContext('function logAction(){}', ctx);
  /* Republication du planning : infrastructure. On COMPTE les appels au
     lieu de republier — `monde().republications`. */
  const republications = [];
  ctx.__republications = republications;
  vm.runInContext('function generatePlanning(a){ __republications.push(a); }', ctx);
  /* (23/08/2026) La republication est DIFFÉRÉE : la requête note l'année et
     arme un déclencheur. On simule les deux surfaces d'infrastructure —
     propriétés du script et déclencheurs — pour observer la file et vérifier
     qu'un seul déclencheur est armé, quel que soit le nombre de décisions. */
  const propsSim = {};
  const declencheurs = [];
  ctx.__props = propsSim;
  ctx.__declencheurs = declencheurs;
  vm.runInContext(`
    var PropertiesService = { getScriptProperties: function () { return {
      getProperty: function (k) { return __props[k] === undefined ? null : __props[k]; },
      setProperty: function (k, v) { __props[k] = v; },
      deleteProperty: function (k) { delete __props[k]; } }; } };
    var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
    var ScriptApp = {
      getProjectTriggers: function () { return __declencheurs.map(function (n) {
        return { getHandlerFunction: function () { return n; } }; }); },
      newTrigger: function (n) { return { timeBased: function () { return {
        after: function () { return { create: function () { __declencheurs.push(n); } }; } }; } }; },
      deleteTrigger: function (t) { const i = __declencheurs.indexOf(t.getHandlerFunction());
        if (i >= 0) __declencheurs.splice(i, 1); } };
  `, ctx);
  /* (23/08/2026) Doublure du canal de notification : le comité notifie
     désormais le MAR à chaque réponse. Elle COLLECTE au lieu d'envoyer —
     `monde().envois` porte tout ce qui serait parti. */
  const envois = [];
  ctx.__envois = envois;
  vm.runInContext('function notifierPush_(titre, corps, url, cible) { __envois.push({ titre: titre, corps: corps, url: url, cible: cible }); return { success: true }; }', ctx);
  vm.runInContext('function _configRows_(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG").getDataRange().getValues(); }', ctx);
  vm.runInContext('const ContentService = { MimeType:{JSON:1}, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) };', ctx);
  // Fonctions RÉELLES des fichiers livrés
  ['getActiveYear', 'getPremierJourPlanning', 'reconstruireDatesHeaders', 'buildDateToCol', 'getJoursFeries', 'seuilsPresence_'].forEach(n =>
    vm.runInContext('let _medFlagsCacheDummy;' === n ? '' : extraireFonction('../gas/code.gs', n), ctx));
  vm.runInContext('let _medFlagsCache = null;', ctx);
  vm.runInContext(extraireFonction('../gas/code.gs', 'getMedecinFlags'), ctx);
  vm.runInContext(extraireFonction('../gas/generateur_gardes.gs', 'estSemaineOff'), ctx);
  vm.runInContext('let _quotasCache = null;', ctx);
  vm.runInContext(extraireConst('CODES_COMITE'), ctx);
  vm.runInContext(extraireConst('CODES_DEMI_VAC'), ctx);   // (27/10/2026) lue par _fusionIndispos_
  /* (11/09/2026) Le bloc routeur est découpé du fichier : les constantes qu'il
     lit au niveau du fichier ne suivent pas. Elles sont extraites du fichier
     livré, jamais recopiées ici — un quota écrit en double finit par diverger. */
  vm.runInContext(extraireConst('QUOTA_INDISPO'), ctx);
  vm.runInContext(extraireConst('QUOTA_INDISPO_WE'), ctx);
  vm.runInContext("const TP_CLE_REPUBLIER = 'TP_ANNEES_A_REPUBLIER';", ctx);
  ['_indisposOuverte_', '_finSaisieIndispos_', '_saisieClose_', '_libelleFinSaisie_', 'getIndisposYear', '_phaseTp_', 'getIndisposForDoctor', 'saveIndisposForDoctor',
   '_fusionIndispos_', '_loadQuotasConges', 'getQuotasConges', '_tpFixeDe_', '_quotiteDe_',
   '_tpFermesEntete_', '_tpFermesSheet_', '_tpFermes_', '_tpFermerJour_', '_tpRouvrirJour_', '_tpRouvrirSiLibere_', '_tpJourLisible_', '_tpNotifier_',
  '_tpGrilleEcrire_', '_tpGrilleLire_', '_tpRetirerDIndispos_', '_tpRepublier_', 'tpRepublicationDifferee',
   '_tpDemandesSheet_', '_tpDemandes_', '_tpDemandeAjouter_', '_tpDemandeRetirer_',
   '_tpMondePresence_', '_poserTp_', '_error',
   '_vacPlusJours_', '_vacJoursFixes_', '_vacPoids_', '_vacGrilleEcrire_', '_vacRetirerDIndispos_', '_poserVac_', '_construirePoseTp_'].forEach(n =>
    vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx));
  /* (10/11/2026) Onglet HISTORIQUE : la vraie fonction, extraite du fichier livré. */
  vm.runInContext(extraireConst('HISTORIQUE_ONGLET'), ctx);
  vm.runInContext(extraireConst('HISTORIQUE_ENTETE'), ctx);
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'historiser_'), ctx);
  vm.runInContext(extraireConst('VAC_PREAVIS_JOURS'), ctx);
  vm.runInContext(extraireConst('VAC_CODES_LIBRES'), ctx);
  vm.runInContext(SRC_IND.match(/const VAC_LIBELLE_OCCUPE = \{[\s\S]*?\};/)[0], ctx);
  /* L'horloge est de l'infrastructure : réglable par le banc (ctx.__auj). */
  ctx.__auj = '2026-11-25';
  vm.runInContext('function _vacAujourdhui_(){ return __auj; }', ctx);
  /* Les mails de changement : on COMPTE les années armées au lieu d'armer. */
  ctx.__notifs = [];
  vm.runInContext('function notifPlanifier(y){ __notifs.push(y); }', ctx);
  vm.runInContext(extraireBlocHandler(), ctx);
  const appel = (payload, user) => vm.runInContext(
    `handlerSaveIndispos('saveIndispos', ${JSON.stringify(payload)}, ${JSON.stringify(user)})`, ctx);
  const lireInd = (id, annee) => vm.runInContext(`getIndisposForDoctor('${id}', ${annee})`, ctx);
  const lireIndBrut = (id, ds) => { const sh = cl.getSheetByName('INDISPOS_2027').getDataRange().getValues();
    const dates = vm.runInContext('reconstruireDatesHeaders', ctx)(sh, 2027); const c = dates.indexOf(ds);
    for (let r = 3; r < sh.length; r++) if (sh[r][0] === id) return String(sh[r][c + 1] || ''); return '?'; };
  return { cl, ctx, appel, lireInd, lireIndBrut, envois, republications, declencheurs,
           file: () => JSON.parse(propsSim['TP_ANNEES_A_REPUBLIER'] || '[]'),
           jouerDifferee: () => vm.runInContext('tpRepublicationDifferee()', ctx),
           lireGarde: (id, ds) => vm.runInContext(`_tpGrilleLire_(2027, ${JSON.stringify(id)})[${JSON.stringify(ds)}] || ''`, ctx),
           demandes: () => vm.runInContext('JSON.parse(JSON.stringify(_tpDemandes_(2027)))', ctx) };
}

const MAR = { role: 'mar', id: 'PLEIN01' };
const nbV = (b, id, liste) => liste.filter(ds => b.lireGarde(id, ds) === 'V').length;
// Rend un jour « tendu » : n collègues déjà en vacances ce jour-là (16 MAR actifs).
const tendu = (ds, n) => Array.from({ length: n }, (_, i) => ['PLEIN' + String(10 + i).padStart(2, '0'), ds, 'V']);

console.log('\n═══ PV01 · la porte : phase fermée → refus clair ; mauvaise année → refus ═══');
{
  const b = monde({ gardes2027: false });
  const r = b.appel({ vac: true, vacances: { '2027-03-01': 'V' } }, MAR);
  V('aucune année générée → refus, message clair', r && r.success === false && /générée/.test(r.error || ''), r);
  const b2 = monde({});
  const r2 = b2.appel({ vac: true, year: 2030, vacances: {} }, MAR);
  V('année non ouverte → refus qui cite les années ouvertes', r2.success === false && /2027/.test(r2.error || ''), r2);
}

console.log('\n═══ PV02 · un jour vert se pose, au planning, et la republication est armée ═══');
{
  const b = monde({});
  const r = b.appel({ vac: true, year: 2027, vacances: { '2027-03-01': 'V', '2027-03-02': 'VM' } }, MAR);
  V('les deux jours sont posés', r.success && r.resultat['2027-03-01'] === 'V' && r.resultat['2027-03-02'] === 'VM', r);
  V('…écrits dans GARDES (l\'onglet maître)', b.lireGarde('PLEIN01', '2027-03-01') === 'V' && b.lireGarde('PLEIN01', '2027-03-02') === 'VM');
  V('le quota compte 1 + ½ = 1,5 sur 33 (temps plein)', r.quota.poses === 1.5 && r.quota.total === 33, r.quota);
  V('la republication différée est armée, une seule fois', b.declencheurs.filter(n => n === 'tpRepublicationDifferee').length === 1, b.declencheurs);
  b.jouerDifferee();
  V('…et elle arme aussi les mails de changement (le secrétariat est prévenu)', b.ctx.__notifs.indexOf(2027) !== -1, b.ctx.__notifs);
  const h = b.cl.getSheetByName(vm.runInContext('HISTORIQUE_ONGLET', b.ctx));
  V('chaque jour posé laisse une ligne d\'historique', h && h.getDataRange().getValues().filter(l => /vacances|demi-journée/.test(l[2])).length === 2);
}

console.log('\n═══ PV03 · VERT OU RIEN : sous 15 présents, refus et « demandez aux admins » ═══');
{
  // 16 actifs : 2 collègues absents → 14 présents → il en resterait 13 si PLEIN01 partait.
  const b = monde({ gardes: tendu('2027-03-03', 2).concat(tendu('2027-03-04', 1)) });
  const r = b.appel({ vac: true, year: 2027, vacances: { '2027-03-03': 'V', '2027-03-04': 'V', '2027-03-05': 'VA' } }, MAR);
  V('jour à 13 restants → refusé, rien d\'écrit', /demandez aux admins/.test(r.resultat['2027-03-03'] || '') && b.lireGarde('PLEIN01', '2027-03-03') === '', r.resultat);
  V('jour à 14 restants (jaune pour les TP) → refusé aussi : pas de jaune pour les vacances',
    /moins de 15/.test(r.resultat['2027-03-04'] || '') && b.lireGarde('PLEIN01', '2027-03-04') === '', r.resultat);
  V('jour à 15 restants → posé (VERT)', r.resultat['2027-03-05'] === 'VA' || r.resultat['2027-03-05'] === 'V', r.resultat);
  const b2 = monde({ gardes: tendu('2027-03-03', 2) });
  const r2 = b2.appel({ vac: true, year: 2027, vacances: { '2027-03-03': 'VM' } }, MAR);
  V('une demi-journée sur un jour non vert est refusée elle aussi (règle du responsable)', /demandez aux admins/.test(r2.resultat['2027-03-03'] || '') && b2.lireGarde('PLEIN01', '2027-03-03') === '', r2.resultat);
}

console.log('\n═══ PV04 · le préavis : 7 jours, pour poser comme pour retirer ═══');
{
  const b = monde({ gardes: [['PLEIN01', '2027-03-03', 'V'], ['PLEIN01', '2027-03-15', 'V']] });
  b.ctx.__auj = '2027-03-01';
  const r = b.appel({ vac: true, year: 2027, vacances: { '2027-03-05': 'V', '2027-03-15': 'V' } }, MAR);
  V('poser à J+4 → refusé', /moins de 7 jours/.test(r.resultat['2027-03-05'] || '') && b.lireGarde('PLEIN01', '2027-03-05') === '', r.resultat);
  V('retirer à J+2 (absent de l\'envoi) → refusé, le jour reste', b.lireGarde('PLEIN01', '2027-03-03') === 'V' && /moins de 7 jours/.test(r.resultat['2027-03-03'] || ''), r.resultat);
  V('à J+8, posé : la frontière est bien 7 jours', (() => { const r3 = b.appel({ vac: true, year: 2027, vacances: { '2027-03-03': 'V', '2027-03-15': 'V', '2027-03-09': 'V' } }, MAR); return r3.resultat['2027-03-09'] === 'V'; })());
  V('à J+7 exactement → posable (« au moins 7 jours »)', (() => { const r4 = b.appel({ vac: true, year: 2027, vacances: { '2027-03-03': 'V', '2027-03-15': 'V', '2027-03-09': 'V', '2027-03-08': 'V' } }, MAR); return r4.resultat['2027-03-08'] === 'V'; })());
}

console.log('\n═══ PV05 · jamais par-dessus un jour occupé ═══');
{
  const occ = [['2027-03-08', 'G'], ['2027-03-09', 'RG'], ['2027-03-10', '18'], ['2027-03-11', 'F'], ['2027-03-12', 'TP'], ['2027-03-15', 'R']];
  const b = monde({ gardes: occ.map(([ds, c]) => ['PLEIN01', ds, c]) });
  const env = {}; occ.forEach(([ds]) => { env[ds] = 'V'; });
  const r = b.appel({ vac: true, year: 2027, vacances: env }, MAR);
  V('garde, repos, 18 h, formation, TP, récup : tous refusés', occ.every(([ds]) => /jour déjà pris/.test(r.resultat[ds] || '')), r.resultat);
  V('…et la case garde intacte', occ.every(([ds, c]) => b.lireGarde('PLEIN01', ds) === c));
  const fer = [...vm.runInContext('getJoursFeries(2027)', b.ctx)].sort().find(ds => ds >= '2027-02-01' && [1,2,3,4,5].includes(new Date(ds + 'T12:00:00').getDay()));
  const r2 = b.appel({ vac: true, year: 2027, vacances: { '2027-03-06': 'V', [fer]: 'V' } }, MAR);
  V('week-end et férié refusés', r2.resultat['2027-03-06'] === 'week-end' && r2.resultat[fer] === 'jour férié', { fer, r: r2.resultat });
}

console.log('\n═══ PV06 · le quota ; déplacer = retirer puis poser, dans le même envoi ═══');
{
  // 33 jours déjà posés (temps plein, quota 33) : janvier–février, jours ouvrés.
  const jf = new Set(monde({}).ctx && vm.runInContext('Array.from(getJoursFeries(2027))', monde({}).ctx));
  const ouvres = []; const d = new Date(2027, 0, 4, 12);
  while (ouvres.length < 33) { const w = d.getDay(); const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (w > 0 && w < 6 && !jf.has(ds)) ouvres.push(ds); d.setDate(d.getDate() + 1); }
  const b = monde({ gardes: ouvres.map(ds => ['PLEIN01', ds, 'V']) });
  const env = {}; ouvres.forEach(ds => { env[ds] = 'V'; }); env['2027-04-01'] = 'V';
  const r = b.appel({ vac: true, year: 2027, vacances: env }, MAR);
  V('34e jour → « quota atteint », rien d\'écrit', /quota atteint/.test(r.resultat['2027-04-01'] || '') && b.lireGarde('PLEIN01', '2027-04-01') === '', r.resultat['2027-04-01']);
  delete env[ouvres[0]];
  const r2 = b.appel({ vac: true, year: 2027, vacances: env }, MAR);
  V('déplacer : un jour retiré libère la place du nouveau, dans le même envoi',
    r2.resultat[ouvres[0]] === 'retiré' && r2.resultat['2027-04-01'] === 'V' && r2.quota.poses === 33, { r: r2.resultat[ouvres[0]], n: r2.resultat['2027-04-01'], q: r2.quota });
}

console.log('\n═══ PV07 · retirer : GARDES ET INDISPOS (le contrôle « Indispos ↔ planning » reste muet) ═══');
{
  const b = monde({ indispos: [['PLEIN01', '2027-03-15', 'VAC']] });   // le décor recopie VAC → V dans GARDES
  V('décor : le jour est V au planning et VAC dans la saisie', b.lireGarde('PLEIN01', '2027-03-15') === 'V' && b.lireIndBrut('PLEIN01', '2027-03-15') === 'VAC');
  const r = b.appel({ vac: true, year: 2027, vacances: {} }, MAR);
  V('retiré du planning', r.resultat['2027-03-15'] === 'retiré' && b.lireGarde('PLEIN01', '2027-03-15') === '', r.resultat);
  V('…et de la saisie de campagne', b.lireIndBrut('PLEIN01', '2027-03-15') === '');
}

console.log('\n═══ PV08 · demi-journées : ½ dans le quota, et le changement de type ═══');
{
  const b = monde({ gardes: [['PLEIN01', '2027-03-03', 'V'], ['PLEIN01', '2027-03-04', 'VM']].concat(tendu('2027-03-03', 2), tendu('2027-03-04', 2)) });
  const r = b.appel({ vac: true, year: 2027, vacances: { '2027-03-03': 'VA', '2027-03-04': 'V' } }, MAR);
  V('journée → demi-journée sur un jour tendu : accepté (personne de moins)', r.resultat['2027-03-03'] === 'VA' && b.lireGarde('PLEIN01', '2027-03-03') === 'VA', r.resultat);
  V('demi-journée → journée sur un jour tendu : refusé, la demi-journée reste', /demandez aux admins/.test(r.resultat['2027-03-04'] || '') && b.lireGarde('PLEIN01', '2027-03-04') === 'VM', r.resultat);
  V('quota : ½ + ½ = 1', r.quota.poses === 1, r.quota);
  const b2 = monde({});
  const r2 = b2.appel({ vac: true, year: 2027, vacances: { '2027-12-24': 'V', '2027-12-29': 'V' } }, MAR);
  V('le 24/12 ne compte que ½ (après-midi férié) : 0,5 + 1 = 1,5', r2.quota.poses === 1.5, r2.quota);
}

console.log('\n═══ PV09 · une case changée entre la lecture et l\'écriture n\'est jamais écrasée ═══');
{
  const b = monde({});
  const sh = b.cl.getSheetByName('GARDES_2027'), vraie = sh.getDataRange.bind(sh);
  let n = 0;
  sh.getDataRange = function () { n++; const r = vraie(); if (n >= 3) { const v = r.getValues(); const col = vm.runInContext('buildDateToCol', b.ctx)(v, 2027)['2027-03-01']; for (let i = 3; i < v.length; i++) if (v[i][0] === 'PLEIN01') v[i][col] = 'G'; return { getValues: () => v }; } return r; };
  const r = b.appel({ vac: true, year: 2027, vacances: { '2027-03-01': 'V' } }, MAR);
  V('le comité a posé une garde entre-temps → « la case vient de changer », rien d\'écrasé', /vient de changer/.test(r.resultat['2027-03-01'] || ''), r.resultat);
}

console.log('\n═══ PV10 · la clé de pose porte le quota de vacances et les jours fixes ═══');
{
  const b = monde({ extras: [['FIXE', 'FIXE', 'FI', 'O', 80, 100, 'CFIXE', '', '', '', '', '', '', '', '', '', 'lundi']] });
  const k = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  V('quotaVac du temps plein = 33, de 80 % = 26 (CONFIG_CONGES)', k.parMar.PLEIN01.quotaVac === 33 && k.parMar.POSEUR.quotaVac === 26, [k.parMar.PLEIN01.quotaVac, k.parMar.POSEUR.quotaVac]);
  V('les jours fixes voyagent en LISTE (jamais en ensemble)', Array.isArray(k.parMar.FIXE.joursFixes), k.parMar.FIXE.joursFixes);
}

console.log('\n═══ PV13 · les vacances passent avant la récup de samedi ; l\'écran compte ces récups présentes ═══');
{
  /* (26/11/2026) Décision du responsable : comme le TP, une vacance n'est pas
     bloquée par une récup de samedi à plus de 30 jours — la récup part sur un
     autre jour vert. L'écran de pose colore en comptant ces récups présentes. */
  const SRC_ECH = fs.readFileSync('../gas/echanges.gs', 'utf8'), SRC_TP = fs.readFileSync('../gas/temps_partiel.gs', 'utf8');
  const constDe = (src, nom) => { const m = src.match(new RegExp('const\\s+' + nom + '[^;\\n]*;')); if (!m) throw new Error(nom); return m[0]; };
  const JOUR = '2027-03-15';
  const mondeR = (gardes) => {
    const b = monde({ gardes: gardes, liens2027: false });
    b.cl.ajouter('LIENS_R_2027', [['SAMEDI', 'MED', 'DATE_R'], ['2027-03-13', 'PLEIN05', JOUR]]);
    ['RECUP_PLANCHER_REPLI', 'RECUP_MAX_PAR_JOUR', 'RECUP_ECART_JOURS', 'RECUP_ABSENTS', 'RECUP_CONGES'].forEach(n => vm.runInContext(constDe(SRC_ECH, n), b.ctx));
    vm.runInContext(constDe(SRC_TP, 'TP_RECUP_PREAVIS_JOURS'), b.ctx);
    ['_echangesTz_', '_echangesTexteDate_', '_echangesJoli_', '_rea1Jours_', '_recupsDecale_', '_recupsDow_', '_recupsAujourdhui_',
     '_recupsContexte_', '_recupsCase_', '_recupsEcrireCase_', '_recupsHorsService_', '_recupsPresents_', '_recupsNbR_',
     '_recupsEligible_', '_recupsUtile_', '_recupsChoisir_', '_recupsLier_'].forEach(n => vm.runInContext(extraireFonction('../gas/echanges.gs', n), b.ctx));
    ['_tpLibererRecups_', '_tpRecupsCedables_'].forEach(n => vm.runInContext(extraireFonction('../gas/temps_partiel.gs', n), b.ctx));
    return b;
  };
  const deuxR = [['PLEIN05', JOUR, 'R'], ['PLEIN06', JOUR, 'R'], ['PLEIN05', '2027-03-13', 'G']];
  let b = mondeR(deuxR);
  let k = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  V('écran : les deux récups à plus de 30 jours comptent présentes (16, vert) au lieu de 14', k.presents[JOUR] === 16, k.presents[JOUR]);
  const r = b.appel({ vac: true, year: 2027, vacances: { [JOUR]: 'V' } }, MAR);
  V('pose : la vacance est ACCORDÉE, les deux récups ont quitté ce jour',
    r.resultat[JOUR] === 'V' && b.lireGarde('PLEIN01', JOUR) === 'V' && b.lireGarde('PLEIN05', JOUR) === '' && b.lireGarde('PLEIN06', JOUR) === '', r.resultat);
  const notif = b.envois.filter(e => e.titre === 'Récupération déplacée');
  V('…les deux MAR sont prévenus (« jour de vacances »)', notif.length === 2 && notif.every(e => /jour de vacances le 15\/03\/2027/.test(e.corps)), notif);
  b = mondeR(deuxR);
  b.ctx.Utilities = { formatDate: () => '2027-02-20' };
  k = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  V('écran : récups dans 23 jours → comptées absentes (14), comme le serveur', k.presents[JOUR] === 14, k.presents[JOUR]);
  b = mondeR([['PLEIN05', JOUR, 'R']].concat(tendu(JOUR, 1).map(x => [x[0], x[1], 'V'])));
  const r2 = b.appel({ vac: true, year: 2027, vacances: { [JOUR]: 'V' } }, MAR);
  V('une récup ne suffit pas (une vacance en plus ce jour) : elle reste, la vacance est refusée',
    /il resterait/.test(r2.resultat[JOUR] || '') && b.lireGarde('PLEIN05', JOUR) === 'R', r2.resultat);
}

console.log('\n═══ PV14 · janvier pris d\'abord sur le reliquat de l\'année précédente (26/11/2026) ═══');
{
  /* Règle légale (responsable, 26/11/2026) : les vacances de N se posent
     jusqu'au 31/01/N+1. PLEIN01 a déjà ses 33 jours 2027 (mars → mai) ; son
     reliquat 2026 est saisi à la main dans RELIQUATS (2026 : pas de calcul). */
  const jfS = new Set(vm.runInContext('Array.from(getJoursFeries(2027))', monde({}).ctx));
  const ouvres = []; const d = new Date(2027, 2, 1, 12);
  while (ouvres.length < 33) { const w = d.getDay(); const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (w > 0 && w < 6 && !jfS.has(ds)) ouvres.push(ds); d.setDate(d.getDate() + 1); }
  const avecReliquat = (lignes) => { const b = monde({ gardes: ouvres.map(ds => ['PLEIN01', ds, 'V']) });
    if (lignes) b.cl.ajouter('RELIQUATS', [['MAR', 'ANNEE', 'JOURS', 'ORIGINE']].concat(lignes)); return b; };
  const env = () => { const e = {}; ouvres.forEach(ds => { e[ds] = 'V'; }); return e; };
  {
    const b = avecReliquat(null);
    b.ctx.__auj = '2026-12-01';
    const e = env(); e['2027-01-12'] = 'V';
    const r = b.appel({ vac: true, year: 2027, vacances: e }, MAR);
    V('sans reliquat : un jour de janvier dépasse le quota 2027 → refusé (le défaut d\'avant)', /quota atteint/.test(r.resultat['2027-01-12'] || ''), r.resultat['2027-01-12']);
  }
  const b = avecReliquat([['PLEIN01', 2026, 2, ''], ['PO', 2026, '1,5', 'initiales, virgule'], ['PLEIN02', 2025, 9, 'autre année']]);
  b.ctx.__auj = '2026-12-01';
  const e = env(); Object.assign(e, { '2027-01-12': 'V', '2027-01-13': 'V', '2027-01-14': 'V' });
  const r = b.appel({ vac: true, year: 2027, vacances: e }, MAR);
  V('reliquat 2026 de 2 : les 2 premiers jours de janvier sont posés, le 3e refusé (quota 2027 plein)',
    r.resultat['2027-01-12'] === 'V' && r.resultat['2027-01-13'] === 'V' && /quota atteint/.test(r.resultat['2027-01-14'] || ''), r.resultat);
  V('…et le quota 2027 reste 33/33 : janvier ne l\'a pas touché', r.quota.poses === 33 && r.quota.total === 33, r.quota);
  V('la réponse donne le reliquat : 2026, droit 2, pris 2', r.quota.reliquat && r.quota.reliquat.annee === 2026 && r.quota.reliquat.droit === 2 && r.quota.reliquat.pris === 2, r.quota.reliquat);
  const e2 = env(); e2['2027-01-12'] = 'V'; e2['2027-01-13'] = 'V'; delete e2[ouvres[0]]; e2['2027-01-15'] = 'V';
  const r2 = b.appel({ vac: true, year: 2027, vacances: e2 }, MAR);
  V('au-delà du reliquat, janvier compte sur l\'année : un jour de mai retiré libère un 3e jour de janvier',
    r2.resultat[ouvres[0]] === 'retiré' && r2.resultat['2027-01-15'] === 'V' && r2.quota.poses === 33 && r2.quota.reliquat.pris === 2, { q: r2.quota, n: r2.resultat['2027-01-15'] });
  const k = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  V('clé de pose : reliquat 2026 de 2 pour PLEIN01, 1,5 pour POSEUR (saisi par ses initiales), 0 pour les autres',
    k.parMar.PLEIN01.reliquatVac.annee === 2026 && k.parMar.PLEIN01.reliquatVac.droit === 2 && k.parMar.POSEUR.reliquatVac.droit === 1.5 && k.parMar.PLEIN02.reliquatVac.droit === 0,
    [k.parMar.PLEIN01.reliquatVac, k.parMar.POSEUR.reliquatVac, k.parMar.PLEIN02.reliquatVac]);
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'computeReliquats'), b.ctx);
  const cr = vm.runInContext('JSON.parse(JSON.stringify(computeReliquats(2027)))', b.ctx);
  const l1 = cr.lignes.find(x => x.id === 'PLEIN01') || {};
  V('compteur du comité : 33/33 sur 2027, plus « reliquat 2026 : 2/2 en janvier »',
    l1.vac && l1.vac.pose === 33 && l1.vac.reste === 0 && l1.vac.reliquat && l1.vac.reliquat.pris === 2 && l1.vac.reliquat.droit === 2, l1.vac);
  V('…un MAR sans reliquat n\'a pas de ligne de reliquat', (cr.lignes.find(x => x.id === 'PLEIN03') || {}).vac.reliquat === null);
  // Calcul automatique dès 2027, et la clôture qui le fige
  const SRC_TP = fs.readFileSync('../gas/temps_partiel.gs', 'utf8');
  V('2026 se saisit à la main, le calcul automatique commence avec 2027', /const RELIQUAT_AUTO_DEPUIS = 2027;/.test(SRC_TP));
  const c = monde({ gardes: [['PLEIN01', '2027-03-01', 'V'], ['PLEIN01', '2027-03-02', 'VM'], ['PLEIN01', '2027-12-24', 'V'], ['POSEUR', '2027-03-03', 'V']] });
  const auto = vm.runInContext('JSON.parse(JSON.stringify(reliquatsVac_(2028)))', c.ctx);
  V('reliquat 2027 calculé sur GARDES_2027 : 33 − (1 + ½ + ½) = 31 ; 80 % : 26 − 1 = 25', auto.PLEIN01 === 31 && auto.POSEUR === 25 && auto.PLEIN02 === 33, auto);
  V('reliquat 2026 jamais calculé (pas de GARDES_2026 fiable) : vide sans saisie', Object.keys(vm.runInContext('reliquatsVac_(2027)', c.ctx)).length === 0);
  c.cl.ajouter('RELIQUATS', [['MAR', 'ANNEE', 'JOURS', 'ORIGINE'], ['PLEIN01', 2027, 28, 'vérifié avec le secrétariat']]);
  V('une ligne saisie gagne sur le calcul (28 au lieu de 31)', vm.runInContext('reliquatsVac_(2028).PLEIN01', c.ctx) === 28);
  const t = vm.runInContext('_reliquatsFiger_(2027)', c.ctx);
  const lig = c.cl.getSheetByName('RELIQUATS').getDataRange().getValues().filter(l => Number(l[1]) === 2027);
  V('clôture 2027 : une ligne par MAR actif, la ligne saisie n\'est ni doublée ni écrasée',
    lig.length === 16 && lig.filter(l => l[0] === 'PLEIN01').length === 1 && lig.find(l => l[0] === 'PLEIN01')[2] === 28 && lig.find(l => l[0] === 'POSEUR')[2] === 25, { t, n: lig.length });
  vm.runInContext('_reliquatsFiger_(2027)', c.ctx);
  V('relancée : aucun doublon', c.cl.getSheetByName('RELIQUATS').getDataRange().getValues().filter(l => Number(l[1]) === 2027).length === 16);
  c.cl.supprimer ? c.cl.supprimer('GARDES_2027') : delete c.cl.feuilles['GARDES_2027'];
  V('après la clôture (GARDES_2027 parti), le reliquat se lit dans RELIQUATS', vm.runInContext('reliquatsVac_(2028).POSEUR', c.ctx) === 25);
  V('clôture 2026 : rien à calculer, le texte renvoie à la saisie manuelle', /saisi à la main/.test(vm.runInContext('_reliquatsFiger_(2026)', c.ctx)));
}

console.log('\n═══ PV16 · exception « toute l\'année » (retour de congé long, 26/11/2026) ═══');
{
  /* Décision du responsable : un MAR revenant de congé long pose son reliquat
     2026 sur TOUTE l'année 2027 — ligne de RELIQUATS dont ORIGINE dit
     « toute l'année ». PLEIN01 a déjà ses 33 jours 2027 (mars → mai). */
  const jfS = new Set(vm.runInContext('Array.from(getJoursFeries(2027))', monde({}).ctx));
  const ouvres = []; const d = new Date(2027, 2, 1, 12);
  while (ouvres.length < 33) { const w = d.getDay(); const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); if (w > 0 && w < 6 && !jfS.has(ds)) ouvres.push(ds); d.setDate(d.getDate() + 1); }
  const avec = (origine) => { const b = monde({ gardes: ouvres.map(ds => ['PLEIN01', ds, 'V']) });
    b.cl.ajouter('RELIQUATS', [['MAR', 'ANNEE', 'JOURS', 'ORIGINE'], ['PLEIN01', 2026, 9, origine]]); b.ctx.__auj = '2026-12-01'; return b; };
  const env = () => { const e = {}; ouvres.forEach(ds => { e[ds] = 'V'; }); return e; };
  let b = avec("congé long : toute l'année");
  // 10 jours ouvrés de septembre en plus : 33 + 9 = 42 au total, le 10e est de trop.
  const sept = ['2027-09-06', '2027-09-07', '2027-09-08', '2027-09-09', '2027-09-10', '2027-09-13', '2027-09-14', '2027-09-15', '2027-09-16', '2027-09-17'];
  let e = env(); sept.forEach(ds => { e[ds] = 'V'; });
  let r = b.appel({ vac: true, year: 2027, vacances: e }, MAR);
  V('« toute l\'année » : 9 jours de septembre passent malgré le quota 2027 plein, le 10e est refusé ; 33/33 sur 2027, 9/9 sur le reliquat',
    sept.slice(0, 9).every(ds => r.resultat[ds] === 'V') && /quota atteint/.test(r.resultat['2027-09-17'] || '') && r.quota.poses === 33 && r.quota.reliquat.pris === 9 && r.quota.reliquat.touteAnnee === true,
    { res: sept.map(ds => r.resultat[ds]), q: r.quota });
  const k = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  V('clé de pose : touteAnnee voyage pour lui seul', k.parMar.PLEIN01.reliquatVac.touteAnnee === true && k.parMar.PLEIN02.reliquatVac.touteAnnee === false, [k.parMar.PLEIN01.reliquatVac, k.parMar.PLEIN02.reliquatVac]);
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'computeReliquats'), b.ctx);
  const l1 = (vm.runInContext('JSON.parse(JSON.stringify(computeReliquats(2027)))', b.ctx).lignes.find(x => x.id === 'PLEIN01') || {}).vac || {};
  V('compteur du comité : 33/33 sur 2027, reliquat 9/9 « sur l\'année »', l1.pose === 33 && l1.reliquat && l1.reliquat.pris === 9 && l1.reliquat.droit === 9 && l1.reliquat.touteAnnee === true, l1);
  b = avec("toute l'année");
  r = b.appel({ vac: true, year: 2027, vacances: env() }, MAR);
  V('les 9 PREMIERS jours de l\'année sont pris sur le reliquat, où qu\'ils tombent : les 33 jours de mars → mai = 24 sur 2027 + 9', r.quota.poses === 24 && r.quota.reliquat.pris === 9, r.quota);
  b = avec('');
  e = env(); e['2027-09-06'] = 'V';
  r = b.appel({ vac: true, year: 2027, vacances: e }, MAR);
  V('contre-épreuve : même ligne sans « toute l\'année » → septembre refusé (janvier seulement)', /quota atteint/.test(r.resultat['2027-09-06'] || ''), r.resultat['2027-09-06']);
  V('« Toute l\'année » s\'écrit librement : majuscule, sans accent', vm.runInContext("RELIQUAT_TOUTE_ANNEE.test('Toute l annee') && RELIQUAT_TOUTE_ANNEE.test(\"toute l'année\") && !RELIQUAT_TOUTE_ANNEE.test('saisi le 26/11')", b.ctx));
}

console.log('\n═══ PV11 · la tuile du portail ═══');
{
  const src = fs.readFileSync('../index.html', 'utf8');
  const mTiles = src.match(/const TILES = \[[\s\S]*?\n\];/);
  const mFiltre = src.match(/TILES\.filter\((t => [\s\S]*?)\)\.map\(t =>/);
  const etat = (m) => {
    const bac = vm.createContext(Object.assign({ window: { innerWidth: 1440 }, MY_ID: 'X', MY_LIBERAL: false, INDISPOS_OUVERTE: false,
      PHASE_TP: null, MY_QUOTITE: 100, MY_TPFIXE: false, MY_TUILES: [] }, m));
    vm.runInContext(mTiles[0], bac);
    return vm.runInContext(`TILES.filter(${mFiltre[1]}).map(t => t.key)`, bac);
  };
  const ph = { PHASE_TP: { actif: true, annee: 2027 } };
  V('avant la génération : ni « Mes vacances » ni « Mes vacances et TP »', !etat({}).includes('vac') && !etat({}).includes('tp'));
  V('temps plein, année générée : « Mes vacances » seule', etat(Object.assign({ MY_QUOTITE: 100 }, ph)).includes('vac') && !etat(Object.assign({ MY_QUOTITE: 100 }, ph)).includes('tp'));
  V('jours fixes : « Mes vacances » seule', etat(Object.assign({ MY_QUOTITE: 60, MY_TPFIXE: true }, ph)).includes('vac'));
  V('temps partiel : « Mes vacances et TP », jamais les deux', etat(Object.assign({ MY_QUOTITE: 80 }, ph)).includes('tp') && !etat(Object.assign({ MY_QUOTITE: 80 }, ph)).includes('vac'));
  const bac = vm.createContext({}); vm.runInContext(mTiles[0] + ';this.T=TILES;', bac);
  const tp = bac.T.find(t => t.key === 'tp'), vac = bac.T.find(t => t.key === 'vac');
  V('« Mes vacances et TP » ouvre trois choix : vacances (?vac=1), temps partiel (?tp=1), récapitulatif (#conges)',
    tp && tp.title === 'Mes vacances et TP' && tp.split && tp.split.length === 3 && /\?vac=1$/.test(tp.split[0].href) && /\?tp=1$/.test(tp.split[1].href) && tp.split[2].href === '#conges', tp);
  V('« Mes vacances » : deux choix, vacances et récapitulatif (lot 2)', vac && vac.split && vac.split.length === 2 && /indispos\.html\?vac=1$/.test(vac.split[0].href) && vac.split[1].href === '#conges', vac);
  const avant = etat({}), apres = etat(Object.assign({ MY_QUOTITE: 100 }, ph));
  V('« Mon récapitulatif » seul avant la génération, puis il passe dans les choix', avant.includes('conges') && !apres.includes('conges'), { avant, apres });
  const miroirSrc = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('la copie de l\'ordre de passage porte trois années (rang au prochain staff)', /getOrdreVacances\(null, \[y, y \+ 1, y \+ 2\]\)/.test(miroirSrc));
  V('la page d\'accueil lit les clés de pose dans son appel d\'ouverture (pas d\'appel de plus)', /miroirRead\(\['annees'[^\]]*'pose_tp_' \+ devine, 'pose_tp_' \+ \(devine \+ 1\)\]/.test(src));
}

/* ═══ La vraie page, pilotée ═══ */
const { JSDOM, VirtualConsole } = require('jsdom');
async function ouvrir(cle, repondre) {
  const srcW = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ console, JSON, Object, String, Number, Array, Math, Set, RegExp, Date, Promise,
    crypto: require('crypto').webcrypto, TextEncoder, Response, Request, Headers, URL });
  wctx.globalThis = wctx; vm.runInContext(srcW, wctx);
  const WK = wctx.__W, crypto = require('crypto'), CODE = 'CODE1';
  const M = new Map();
  M.set('acces', JSON.stringify({ users: [{ h: crypto.createHash('sha256').update(CODE).digest('hex'),
    id: 'PLEIN01', role: 'mar', name: 'DR PLEIN01', initials: 'PL', quotite: 100, tpFixe: false }],
    phaseTp: { actif: true, annee: 2027, annees: [2027] }, indisposYear: 2027 }));
  M.set('pose_tp_2027', JSON.stringify(cle));
  const KV = { get: async k => M.has(k) ? M.get(k) : null, put: async (k, v) => { M.set(k, v); }, delete: async k => { M.delete(k); },
               list: async o => ({ keys: [...M.keys()].filter(k => k.startsWith(o.prefix || '')).map(name => ({ name })) }) };
  const env = { KV, PUSH_TOKEN: 'JETON' };
  const vc = new VirtualConsole(), erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync('../indispos.html', 'utf8'), { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/indispos.html?vac=1', pretendToBeVisual: true,
    beforeParse: win => {
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.Element.prototype.scrollIntoView = () => {}; win.scrollTo = () => {};
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
      win.eval(fs.readFileSync('../partage/portail.js', 'utf8'));
    } });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  w.__envois = [];
  w.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('workers.dev')) return WK.fetch(new Request('https://worker' + u.replace(/^https:\/\/[^/]+/, ''), { method: 'POST', body: opt.body }), env);
    const p = JSON.parse(opt.body || '{}'); w.__envois.push(p);
    return { ok: true, json: async () => repondre(p) };
  };
  await new Promise(r => setTimeout(r, 300));
  await w.doLogin(CODE, true);
  await new Promise(r => setTimeout(r, 300));
  return { w, erreurs };
}

(async function () {
  console.log('\n═══ PV12 · la vraie page ?vac=1 : la clé fait le voyage, l\'écran s\'affiche ═══');
  const b = monde({ gardes: [['PLEIN01', '2027-01-11', 'G'], ['PLEIN01', '2027-01-12', 'RG'], ['PLEIN01', '2027-01-13', 'V']].concat(tendu('2027-01-14', 2)) });
  const cle = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', b.ctx);
  const { w, erreurs } = await ouvrir(cle, p => {
    if (p.action === 'saveIndispos' && p.vac) return { success: true, resultat: { '2027-01-15': 'V' }, jours: Object.assign({}, p.vacances), quota: { poses: 2, total: 33 } };
    return { success: false, error: 'non simulé' };
  });
  const d = w.document;
  V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3));
  V('l\'écran des vacances est affiché, pas celui des TP', d.getElementById('vacApp').style.display === 'block' && d.getElementById('tpApp').style.display === 'none');
  w.eval('VCX.mois = 0; vcxRendre();');
  const caseDu = ds => d.querySelector('#vcxGrid [data-ds="' + ds + '"]');
  V('le quota du temps plein est affiché (33)', /33/.test(d.getElementById('vcxJv').textContent), d.getElementById('vcxJv').textContent);
  V('la garde et le repos sont gris, avec leur motif', /GARDE/.test(caseDu('2027-01-11').textContent) && /REPOS/.test(caseDu('2027-01-12').textContent));
  V('le jour de vacances existant est bleu', caseDu('2027-01-13').classList.contains('v'));
  V('le jour tendu est noir (« demandez aux admins »)', caseDu('2027-01-14').classList.contains('ferme'));
  V('un jour ordinaire est vert, avec l\'effectif', caseDu('2027-01-15').classList.contains('libre') && /\d+/.test(caseDu('2027-01-15').textContent));
  caseDu('2027-01-14').click();
  V('toucher un jour noir : message, rien de posé', /demandez aux admins/i.test(d.getElementById('vcxHint').textContent) && !Object.keys(w.eval('VCX.pend')).length);
  caseDu('2027-01-15').click();
  V('toucher un jour vert : en attente d\'enregistrement', w.eval('VCX.pend["2027-01-15"]') === 'V' && !d.getElementById('vcxBs').disabled);
  await w.vcxEnregistrer();
  const env = w.__envois.find(p => p.action === 'saveIndispos');
  V('l\'enregistrement envoie la photo complète : l\'existant ET le nouveau, vac:true, année 2027',
    env && env.vac === true && env.year === 2027 && env.vacances['2027-01-13'] === 'V' && env.vacances['2027-01-15'] === 'V', env);
  V('après la réponse, le récapitulatif s\'ouvre et le jour est bleu', d.getElementById('vcxSheet').classList.contains('show') && caseDu('2027-01-15').classList.contains('v'));

  console.log('\n═══ PV15 · la vraie page : le reliquat de l\'année précédente à l\'écran (26/11/2026) ═══');
  {
    // PLEIN01 : quota 2027 plein (33 jours en mars → mai), reliquat 2026 de 2 saisi à la main.
    const jfS = new Set(vm.runInContext('Array.from(getJoursFeries(2027))', monde({}).ctx));
    const ouvres = []; const dd = new Date(2027, 2, 1, 12);
    while (ouvres.length < 33) { const wd = dd.getDay(); const ds = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0'); if (wd > 0 && wd < 6 && !jfS.has(ds)) ouvres.push(ds); dd.setDate(dd.getDate() + 1); }
    const bR = monde({ gardes: ouvres.map(ds => ['PLEIN01', ds, 'V']) });
    bR.cl.ajouter('RELIQUATS', [['MAR', 'ANNEE', 'JOURS', 'ORIGINE'], ['PLEIN01', 2026, 2, '']]);
    const cleR = vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', bR.ctx);
    const { w: wR, erreurs: eR } = await ouvrir(cleR, () => ({ success: false, error: 'non simulé' }));
    const dR = wR.document, caseR = ds => dR.querySelector('#vcxGrid [data-ds="' + ds + '"]');
    wR.eval('VCX.mois = 0; vcxRendre();');
    V('aucune erreur JavaScript', eR.length === 0, eR.slice(0, 3));
    V('la jauge montre 33 / 33 et la ligne du reliquat : 0 / 2, à poser avant le 31/01',
      /33\s*\/\s*33/.test(dR.getElementById('vcxJv').textContent) && dR.getElementById('vcxJr').style.display === 'block'
      && /Reliquat 2026 : 0 \/ 2 j pris en janvier · il vous reste 2 jour\(s\) à poser avant le 31\/01/.test(dR.getElementById('vcxJr').textContent),
      [dR.getElementById('vcxJv').textContent, dR.getElementById('vcxJr').textContent]);
    caseR('2027-01-12').click(); caseR('2027-01-13').click();
    V('deux jours de janvier se posent malgré le quota 2027 plein ; la jauge 2027 ne bouge pas',
      wR.eval('VCX.pend["2027-01-12"]') === 'V' && wR.eval('VCX.pend["2027-01-13"]') === 'V' && /33\s*\/\s*33/.test(dR.getElementById('vcxJv').textContent)
      && /2 \/ 2 j pris en janvier · tout est posé/.test(dR.getElementById('vcxJr').textContent), dR.getElementById('vcxJr').textContent);
    caseR('2027-01-14').click();
    V('un 3e jour de janvier : « quota atteint », rien en attente', /Quota atteint/.test(dR.getElementById('vcxHint').textContent) && !wR.eval('VCX.pend["2027-01-14"]'), dR.getElementById('vcxHint').textContent);
    wR.eval('VCX.mois = 1; vcxRendre();'); caseR('2027-02-01').click();
    V('février : le reliquat ne sert pas, « quota atteint »', /Quota atteint/.test(dR.getElementById('vcxHint').textContent) && !wR.eval('VCX.pend["2027-02-01"]'));
    // (26/11/2026) Exception « toute l'année » : la ligne bleue parle de l'année, et septembre se pose.
    const bT = monde({ gardes: ouvres.map(ds => ['PLEIN01', ds, 'V']) });
    bT.cl.ajouter('RELIQUATS', [['MAR', 'ANNEE', 'JOURS', 'ORIGINE'], ['PLEIN01', 2026, 9, "toute l'année"]]);
    const { w: wT } = await ouvrir(vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', bT.ctx), () => ({ success: false }));
    wT.eval('VCX.mois = 8; vcxRendre();');
    V('« toute l\'année » : les 33 jours déjà posés prennent d\'abord les 9 du reliquat → jauge 24 / 33, ligne « 9 / 9 j pris sur 2027 »',
      /24\s*\/\s*33/.test(wT.document.getElementById('vcxJv').textContent) && /Reliquat 2026 : 9 \/ 9 j pris sur 2027 · tout est posé/.test(wT.document.getElementById('vcxJr').textContent),
      [wT.document.getElementById('vcxJv').textContent, wT.document.getElementById('vcxJr').textContent]);
    wT.document.querySelector('#vcxGrid [data-ds="2027-09-06"]').click();
    V('…et un jour de septembre se pose (25 / 33)', wT.eval('VCX.pend["2027-09-06"]') === 'V' && /25\s*\/\s*33/.test(wT.document.getElementById('vcxJv').textContent), wT.document.getElementById('vcxJv').textContent);
    wT.eval('VCX.pend = {}; VCX.reliquat.droit = 40; vcxRendre();');
    V('ligne « toute l\'année » avec un reste : « … à poser en 2027 », sans « 31/01 »',
      /il vous reste 7 jour\(s\) à poser en 2027$/.test(wT.document.getElementById('vcxJr').textContent), wT.document.getElementById('vcxJr').textContent);
    const { w: wS } = await ouvrir(vm.runInContext('JSON.parse(JSON.stringify(_construirePoseTp_(2027)))', monde({}).ctx), () => ({ success: false }));
    V('sans reliquat, la ligne reste cachée', wS.document.getElementById('vcxJr').style.display === 'none');
  }
  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
