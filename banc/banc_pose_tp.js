/* ═══ BANC — POSE DES TEMPS PARTIELS APRÈS GÉNÉRATION (lot 1, 22/08/2026) ═══
   Le socle serveur du chantier TP : phase déduite (_phaseTp_), routage d'année,
   verrou par type sur saveIndispos, et le juge de bande (_poserTp_) qui tranche
   chaque jour NOUVEAU sur l'état réel du classeur — vert ≥ 15 → TP validé,
   jaune 13-14 → TPA (sous réserve), noir ≤ 12 → refus.
   Tout le code exécuté ici est EXTRAIT des fichiers livrés, bloc routeur
   compris : recopier la logique dans le test prouverait le test, pas le code.
   Les seuils 15 / 13 / 12 sont VERROUILLÉS en dur dans les vérifications. */
const vm = require('vm'), fs = require('fs');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const SRC_IND = fs.readFileSync('../gas/Indispos.gs', 'utf8');

/* Le bloc routeur `if (action === 'saveIndispos') { … }` est découpé du vrai
   fichier par appariement d'accolades, puis enveloppé dans une fonction. */
function extraireBlocHandler() {
  const marque = "if (action === 'saveIndispos') {";
  const i = SRC_IND.indexOf(marque);
  if (i < 0) throw new Error('bloc saveIndispos introuvable');
  let prof = 0, j = SRC_IND.indexOf('{', i);
  for (; j < SRC_IND.length; j++) {
    if (SRC_IND[j] === '{') prof++;
    else if (SRC_IND[j] === '}') { prof--; if (prof === 0) break; }
  }
  return 'function handlerSaveIndispos(action, payload, user) {\n' +
         SRC_IND.slice(i, j + 1) + '\n  return null;\n}';
}

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
    Utilities: { formatDate: (d, tz, fmt) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => 'Europe/Paris' } });
  ctx.globalThis = ctx;
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
  ['getActiveYear', 'getPremierJourPlanning', 'reconstruireDatesHeaders', 'buildDateToCol', 'getJoursFeries'].forEach(n =>
    vm.runInContext('let _medFlagsCacheDummy;' === n ? '' : extraireFonction('../gas/code.gs', n), ctx));
  vm.runInContext('let _medFlagsCache = null;', ctx);
  vm.runInContext(extraireFonction('../gas/code.gs', 'getMedecinFlags'), ctx);
  vm.runInContext(extraireFonction('../gas/generateur_gardes.gs', 'estSemaineOff'), ctx);
  vm.runInContext('let _quotasCache = null;', ctx);
  vm.runInContext(extraireConst('CODES_COMITE'), ctx);
  vm.runInContext("const TP_CLE_REPUBLIER = 'TP_ANNEES_A_REPUBLIER';", ctx);
  ['_indisposOuverte_', 'getIndisposYear', '_phaseTp_', 'getIndisposForDoctor', 'saveIndisposForDoctor',
   '_fusionIndispos_', '_loadQuotasConges', 'getQuotasConges', '_tpFixeDe_', '_quotiteDe_',
   '_tpFermesSheet_', '_tpFermes_', '_tpFermerJour_', '_tpRouvrirJour_', '_tpJourLisible_', '_tpNotifier_',
  '_tpGrilleEcrire_', '_tpGrilleLire_', '_tpRetirerDIndispos_', '_tpRepublier_', 'tpRepublicationDifferee',
   '_tpDemandesSheet_', '_tpDemandes_', '_tpDemandeAjouter_', '_tpDemandeRetirer_',
   '_tpMondePresence_', '_poserTp_', '_error'].forEach(n =>
    vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx));
  vm.runInContext(extraireBlocHandler(), ctx);
  const appel = (payload, user) => vm.runInContext(
    `handlerSaveIndispos('saveIndispos', ${JSON.stringify(payload)}, ${JSON.stringify(user)})`, ctx);
  const lireInd = (id, annee) => vm.runInContext(`getIndisposForDoctor('${id}', ${annee})`, ctx);
  return { cl, ctx, appel, lireInd, envois, republications, declencheurs,
           file: () => JSON.parse(propsSim['TP_ANNEES_A_REPUBLIER'] || '[]'),
           jouerDifferee: () => vm.runInContext('tpRepublicationDifferee()', ctx),
           lireGarde: (id, ds) => vm.runInContext(`_tpGrilleLire_(2027, ${JSON.stringify(id)})[${JSON.stringify(ds)}] || ''`, ctx),
           demandes: () => vm.runInContext('JSON.parse(JSON.stringify(_tpDemandes_(2027)))', ctx) };
}
const MAR = { role: 'mar', id: 'POSEUR' };
const ADMIN = { role: 'admin', id: 'ADMIN' };

console.log('\n═══ PT01 · la phase se DÉDUIT — GARDES seul ne suffit pas, LIENS_R non plus ═══');
{
  let b = monde({});
  let ph = vm.runInContext('_phaseTp_()', b.ctx);
  V('GARDES_2027 + LIENS_R_2027 → phase active pour 2027', ph.actif === true && ph.annee === 2027, ph);

  b = monde({ liens2027: false, gardes2026: true });
  ph = vm.runInContext('_phaseTp_()', b.ctx);
  V('année tenue à la main (GARDES sans LIENS_R) → phase FERMÉE', ph.actif === false, ph);

  b = monde({ gardes2027: false, gardes2026: true });
  ph = vm.runInContext('_phaseTp_()', b.ctx);
  V('GARDES_2027 supprimé pour régénérer → la phase se referme SEULE, sans retomber sur 2026', ph.actif === false, ph);
}

console.log('\n═══ PT02 · routage d\'année : les TP vont dans 2027, jamais dans l\'année de repli ═══');
{
  const b = monde({});   // campagne FERMÉE : getIndisposYear() se replie sur 2026
  const an = vm.runInContext('getIndisposYear()', b.ctx);
  V('témoin : getIndisposYear() répond bien 2026 (le repli silencieux)', an === 2026, an);
  const rep = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, MAR);
  V('la pose réussit', rep && rep.success === true, rep);
  V('la réponse annonce 2027', rep.annee === 2027, rep.annee);
  V('le TP est écrit dans GARDES_2027, l\'onglet maître du planning', b.lireGarde('POSEUR', '2027-03-01') === 'TP');
  V('INDISPOS_2026 est resté vierge — aucune fuite', Object.keys(b.lireInd('POSEUR', 2026)).length === 0, b.lireInd('POSEUR', 2026));
}

console.log('\n═══ PT03 · verrou par type : hors campagne, la saisie classique est refusée ═══');
{
  const b = monde({});
  const rep = b.appel({ indispos: { '2027-04-01': 'INDISPO' } }, MAR);
  V('rôle mar, hors campagne → refus explicite', rep && rep.success === false && /campagne/.test(rep.error || ''), rep);
  V('rien n\'a été écrit', Object.keys(b.lireInd('POSEUR', 2026)).length === 0);
  const b2 = monde({ campagne: true });
  const rep2 = b2.appel({ indispos: { '2027-04-01': 'INDISPO' } }, MAR);
  V('campagne ouverte → la même saisie passe', rep2 && rep2.success === true, rep2);
  V('…et va dans l\'année de campagne (2027)', b2.lireInd('POSEUR', 2027)['2027-04-01'] === 'INDISPO');
  const b3 = monde({});
  const rep3 = b3.appel({ doctorId: 'ZORRO', indispos: { '2026-04-02': 'VAC' } }, ADMIN);
  V('le comité, lui, n\'est pas verrouillé — il corrige l\'année active (2026), comportement historique', rep3 && rep3.success === true && b3.lireInd('ZORRO', 2026)['2026-04-02'] === 'VAC', [rep3, b3.lireInd('ZORRO', 2026)]);
}

/* (LOT A · 01/09/2026) PT04 RETOURNÉ. Ce bloc éprouvait la doctrine du 23/08 :
   « le circuit campagne ignore les TP ». Le comité a tranché l'inverse le
   01/09 — le temps partiel se pose PENDANT la campagne, avec les
   indisponibilités et les gardes souhaitées. Le test n'est pas supprimé : il
   vérifie désormais la règle nouvelle, et sert de trace de ce renversement. */
console.log('\n═══ PT04 · le circuit campagne ACCEPTE les TP (lot A, 01/09/2026) ═══');
{
  const b = monde({ campagne: true, indispos: [['POSEUR', '2027-03-09', 'TP'], ['POSEUR', '2027-03-15', 'INDISPO']] });
  const rep = b.appel({ indispos: { '2027-03-09': 'TP', '2027-03-16': 'INDISPO', '2027-05-05': 'TP' } }, MAR);
  V('l\'enregistrement campagne réussit', rep && rep.success === true, rep);
  const relu = b.lireInd('POSEUR', 2027);
  V('un TP déjà en base et renvoyé est CONSERVÉ', relu['2027-03-09'] === 'TP', relu['2027-03-09']);
  V('un TP neuf posé pendant la campagne est ENREGISTRÉ dans INDISPOS', relu['2027-05-05'] === 'TP', relu['2027-05-05']);
  V('l\'INDISPO retirée est bien partie, la nouvelle est là', !relu['2027-03-15'] && relu['2027-03-16'] === 'INDISPO', relu);
  /* Une date absente de l'envoi vaut retrait — pour le TP comme pour le reste. */
  const rep2 = b.appel({ indispos: { '2027-03-16': 'INDISPO' } }, MAR);
  V('un TP absent du nouvel envoi est retiré', rep2.success === true && !b.lireInd('POSEUR', 2027)['2027-05-05']);
}

console.log('\n═══ PT05 · les trois bandes, seuils verrouillés : 16→TP · 15→TPA · 13→refus ═══');
{
  const b = monde({ indispos: [
    ['PLEIN01', '2027-03-02', 'VAC'],                                              // mardi : 15 présents
    ['PLEIN01', '2027-03-03', 'VAC'], ['PLEIN02', '2027-03-03', 'VAC'], ['PLEIN03', '2027-03-03', 'VAC'],  // mercredi : 13
  ] });
  const rep = b.appel({ tp: true, indispos: { '2027-03-01': 'TP', '2027-03-02': 'TP', '2027-03-03': 'TP' } }, MAR);
  V('16 présents → il resterait 15 → TP validé', rep.resultat['2027-03-01'] === 'TP', rep.resultat);
  V('15 présents → il resterait 14 → TPA, sous réserve', rep.resultat['2027-03-02'] === 'TPA', rep.resultat);
  V('13 présents → il resterait 12 → REFUSÉ, motif chiffré', /13 présents/.test(rep.resultat['2027-03-03'] || ''), rep.resultat);
  const relu = b.lireInd('POSEUR', 2027);
  V('la GRILLE porte le TP validé, le REGISTRE la demande, et le refus rien',
    b.lireGarde('POSEUR', '2027-03-01') === 'TP'
    && b.demandes().some(x => x.date === '2027-03-02')
    && !b.lireGarde('POSEUR', '2027-03-03'), b.demandes());
  V('le quota ne compte que le validé (1/3)', rep.quota.valides === 1 && rep.quota.total === 3, rep.quota);
}

console.log('\n═══ PT06 · G compte PRÉSENT, RG compte ABSENT — la définition du générateur ═══');
{
  const b = monde({ gardes: [['PLEIN01', '2027-03-01', 'G'], ['PLEIN02', '2027-03-02', 'RG']] });
  const rep = b.appel({ tp: true, indispos: { '2027-03-01': 'TP', '2027-03-02': 'TP' } }, MAR);
  V('un collègue de garde ne baisse pas l\'effectif : jour vert → TP', rep.resultat['2027-03-01'] === 'TP', rep.resultat);
  V('un collègue en repos de garde le baisse : 15 → TPA', rep.resultat['2027-03-02'] === 'TPA', rep.resultat);
}

console.log('\n═══ PT07 · refus individuels : garde, repos, week-end, férié, jour déjà pris ═══');
{
  const b = monde({
    gardes: [['POSEUR', '2027-03-04', 'G'], ['POSEUR', '2027-03-05', 'RG'], ['POSEUR', '2027-03-11', '18']],
    indispos: [['POSEUR', '2027-03-08', 'VAC'], ['POSEUR', '2027-03-09', 'INDISPO'], ['POSEUR', '2027-03-10', 'SOUHAIT']],
  });
  const jf = [...vm.runInContext('getJoursFeries(2027)', b.ctx)]
    .filter(d => { const w = new Date(d + 'T12:00:00').getDay(); return w >= 1 && w <= 5 && d > '2027-01-04' && d < '2027-12-31'; })[0];
  const envoi = { '2027-03-04': 'TP', '2027-03-05': 'TP', '2027-03-06': 'TP', '2027-03-08': 'TP',
                  '2027-03-09': 'TP', '2027-03-10': 'TP', '2027-03-11': 'TP' };
  envoi[jf] = 'TP';
  const rep = b.appel({ tp: true, indispos: envoi }, MAR);
  V('jour de garde → refusé, avec le code du planning', /déjà G/.test(rep.resultat['2027-03-04'] || ''), rep.resultat['2027-03-04']);
  V('repos de garde → refusé, avec le code du planning', /déjà RG/.test(rep.resultat['2027-03-05'] || ''), rep.resultat['2027-03-05']);
  V('samedi → refusé', /week-end/.test(rep.resultat['2027-03-06'] || ''), rep.resultat['2027-03-06']);
  V('jour férié (' + jf + ') → refusé', /férié/.test(rep.resultat[jf] || ''), rep.resultat[jf]);
  V('jour déjà en congés → refusé, code du planning en clair', /déjà V/.test(rep.resultat['2027-03-08'] || ''), rep.resultat['2027-03-08']);
  V('garde de 18h → refusé : on est AU TRAVAIL ce jour-là (arbitrage 22/08)',
    /déjà 18/.test(rep.resultat['2027-03-11'] || ''), rep.resultat['2027-03-11']);
  V('jour INDISPO de campagne → le TP PASSE : vestige sans objet après génération',
    rep.resultat['2027-03-09'] === 'TP', rep.resultat['2027-03-09']);
  V('…et la case porte désormais TP (le vestige est écrasé)',
    b.lireGarde('POSEUR', '2027-03-09') === 'TP', b.lireInd('POSEUR', 2027)['2027-03-09']);
  V('jour SOUHAIT de campagne → le TP passe aussi', rep.resultat['2027-03-10'] === 'TP', rep.resultat['2027-03-10']);
  V('les jours REFUSÉS n\'ont rien écrit — les congés et la garde restent intacts',
    b.lireGarde('POSEUR', '2027-03-08') === 'V' && b.lireGarde('POSEUR', '2027-03-04') === 'G');
}

console.log('\n═══ PT08 · quota : les TP validés le consomment, les TPA jamais ═══');
{
  const b = monde({ indispos: [['PLEIN01', '2027-03-05', 'VAC']] });   // vendredi 05/03 : 15 présents
  const rep = b.appel({ tp: true, indispos: {
    '2027-03-01': 'TP', '2027-03-02': 'TP', '2027-03-03': 'TP',   // 3 jours verts = quota 80 % plein
    '2027-03-04': 'TP',                                            // 4e jour vert → au-delà
    '2027-03-05': 'TP',                                            // jour jaune → TPA malgré le quota plein
  } }, MAR);
  V('les 3 premiers jours verts passent', ['2027-03-01', '2027-03-02', '2027-03-03'].every(d => rep.resultat[d] === 'TP'), rep.resultat);
  V('le 4e est refusé « quota atteint »', /quota/.test(rep.resultat['2027-03-04'] || ''), rep.resultat['2027-03-04']);
  V('quota plein : un jour jaune est REFUSÉ, il ne peut plus devenir une demande',
    /quota atteint/.test(rep.resultat['2027-03-05'] || ''), rep.resultat['2027-03-05']);
  V('quota annoncé : 3/3', rep.quota.valides === 3 && rep.quota.total === 3, rep.quota);
}

console.log('\n═══ PT09 · un jour validé est ACQUIS ; un retrait reste possible ═══');
{
  const b = monde({ indispos: [
    ['POSEUR', '2027-03-03', 'TP'],                                   // déjà validé…
    ['PLEIN01', '2027-03-03', 'VAC'], ['PLEIN02', '2027-03-03', 'VAC'], ['PLEIN03', '2027-03-03', 'VAC'],  // …sur un jour devenu noir
  ] });
  const rep = b.appel({ tp: true, indispos: { '2027-03-03': 'TP' } }, MAR);
  V('le jour conservé reste TP, jamais re-jugé', rep.resultat['2027-03-03'] === 'TP' && b.lireGarde('POSEUR', '2027-03-03') === 'TP', rep.resultat);
  const rep2 = b.appel({ tp: true, indispos: {} }, MAR);
  V('l\'omettre de l\'envoi le retire (rendre un jour reste possible)', rep2.success === true && !b.lireGarde('POSEUR', '2027-03-03'), b.lireInd('POSEUR', 2027));
}

console.log('\n═══ PT10 · un MAR ne s\'auto-valide pas ; le comité, si — et c\'est annulable ═══');
{
  const b = monde({ indispos: [['POSEUR', '2027-03-02', 'TPA']] });
  const rep = b.appel({ tp: true, indispos: { '2027-03-02': 'TP' } }, MAR);
  V('le MAR envoie TP sur son TPA → reste TPA', rep.resultat['2027-03-02'] === 'TPA' && b.demandes().some(x => x.mar === 'POSEUR' && x.date === '2027-03-02'), rep.resultat);
  const rep2 = b.appel({ tp: true, doctorId: 'POSEUR', indispos: { '2027-03-02': 'TP' } }, ADMIN);
  V('renvoyer une demande en attente la LAISSE en attente — seul le comité tranche',
    rep2.resultat['2027-03-02'] === 'TPA' && !b.lireGarde('POSEUR', '2027-03-02'), rep2.resultat);
  const rep3 = b.appel({ tp: true, doctorId: 'POSEUR', indispos: { '2027-03-02': 'TPA' } }, ADMIN);
  V('…et peut revenir en arrière : TP → TPA (décision annulable)', rep3.success === true && b.demandes().some(x => x.mar === 'POSEUR' && x.date === '2027-03-02'), b.lireInd('POSEUR', 2027));
}

console.log('\n═══ PT11 · deux MAR, le même jour : la cascade juste ═══');
{
  // Jour VERT à 16 présents : le 1er valide (16→15), le 2e passe sous réserve (15→14).
  const b = monde({});
  b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, MAR);
  const rep = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, { role: 'mar', id: 'ZORRO' });
  V('après un TP VALIDÉ, le même jour glisse en TPA pour le suivant', rep.resultat['2027-03-01'] === 'TPA', rep.resultat);
  // Jour JAUNE à 15 présents : deux TPA ne se bloquent pas mutuellement.
  const b2 = monde({ indispos: [['PLEIN01', '2027-03-02', 'VAC']] });
  b2.appel({ tp: true, indispos: { '2027-03-02': 'TP' } }, MAR);
  const rep2 = b2.appel({ tp: true, indispos: { '2027-03-02': 'TP' } }, { role: 'mar', id: 'ZORRO' });
  V('un TPA ne baisse PAS l\'effectif : la 2e demande obtient aussi TPA', rep2.resultat['2027-03-02'] === 'TPA', rep2.resultat);
  V('les deux demandes coexistent dans le REGISTRE, pas dans le planning',
    b2.demandes().filter(x => x.date === '2027-03-02').length === 2
    && !b2.lireGarde('POSEUR', '2027-03-02') && !b2.lireGarde('ZORRO', '2027-03-02'), b2.demandes());
}

console.log('\n═══ PT12 · éligibilité SANS nom en dur : plein temps, jours fixes, rythme 2/2 ═══');
{
  const b = monde({ extras: [
    ligneMed('FIXE', 60, { tpFixes: 'JEU, VEN' }),
    ligneMed('CYCLE', 50, { rythme2sur2: true }),
  ] });
  const r1 = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, { role: 'mar', id: 'PLEIN01' });
  V('quotité 100 → aucun jour posé, motif de profil',
    /profil/.test(r1.resultat['2027-03-01'] || '') && r1.quota.total === 0, r1);
  const r2 = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, { role: 'mar', id: 'FIXE' });
  V('jours fixes déclarés → aucun jour posé (BONNET s\'exclut par sa colonne)',
    /profil/.test(r2.resultat['2027-03-01'] || ''), r2);
  const r3 = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, { role: 'mar', id: 'CYCLE' });
  V('rythme 2 semaines sur 2 → aucun jour posé', /profil/.test(r3.resultat['2027-03-01'] || ''), r3);
  const r4 = b.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, MAR);
  V('quotité 80 sans jours fixes → accepté', r4.success === true && r4.resultat['2027-03-01'] === 'TP', r4);
}

console.log('\n═══ PT13 · une date hors année ou la phase fermée n\'écrivent RIEN ═══');
{
  const b = monde({});
  const rep = b.appel({ tp: true, indispos: { '2026-06-01': 'TP', '2028-02-02': 'TP' } }, MAR);
  V('dates hors 2027 → refusées « hors année »', rep.resultat['2026-06-01'] === 'hors année' && rep.resultat['2028-02-02'] === 'hors année', rep.resultat);
  const b2 = monde({ gardes2027: false });
  const rep2 = b2.appel({ tp: true, indispos: { '2027-03-01': 'TP' } }, MAR);
  V('phase fermée → refus global, message clair', rep2 && rep2.success === false && /générée/.test(rep2.error || ''), rep2);
}

console.log('\n═══ PT14 · la tuile du portail : visible pour les bons MAR, aux bons moments ═══');
{
  /* On extrait le VRAI tableau TILES et LA ligne de filtrage de dashboard.html
     (même méthode que banc_pages_mar §29) et on les fait tourner dans un bac
     à sable où l'on règle l'état du monde. */
  const src = fs.readFileSync('../dashboard.html', 'utf8');
  const mTiles = src.match(/const TILES = \[[\s\S]*?\n\];/);
  const mFiltre = src.match(/TILES\.filter\((t => [\s\S]*?)\)\.map\(t =>/);
  V('le tableau des tuiles et le filtre sont lisibles dans la page', !!mTiles && !!mFiltre);
  const etat = (monde) => {
    const bac = vm.createContext(Object.assign({ window: { innerWidth: 1440 },
      MY_ID: 'POSEUR', MY_LIBERAL: false, INDISPOS_OUVERTE: false,
      PHASE_TP: null, MY_QUOTITE: 100, MY_TPFIXE: false }, monde));
    vm.runInContext(mTiles[0], bac);
    return vm.runInContext(`TILES.filter(${mFiltre[1]}).map(t => t.key)`, bac);
  };
  const vieux = etat({});   // vieux serveur : phaseTp jamais renvoyé
  V('vieux serveur (pas de phaseTp) → la tuile TP n\'existe pour personne', !vieux.includes('tp'), vieux);
  const normal = etat({ PHASE_TP: { actif: true, annee: 2027 }, MY_QUOTITE: 80 });
  V('phase active + quotité 80 → la tuile TP apparaît', normal.includes('tp'), normal);
  V('…et hors campagne, la tuile campagne reste absente', !normal.includes('indispos'), normal);
  const octobre = etat({ PHASE_TP: { actif: true, annee: 2027 }, MY_QUOTITE: 80, INDISPOS_OUVERTE: true });
  V('octobre : campagne ET pose TP cohabitent — les deux tuiles', octobre.includes('tp') && octobre.includes('indispos'), octobre);
  const plein = etat({ PHASE_TP: { actif: true, annee: 2027 }, MY_QUOTITE: 100 });
  V('quotité 100 → jamais de tuile TP', !plein.includes('tp'), plein);
  const fixe = etat({ PHASE_TP: { actif: true, annee: 2027 }, MY_QUOTITE: 60, MY_TPFIXE: true });
  V('jours fixes ou rythme 2/2 → jamais de tuile TP', !fixe.includes('tp'), fixe);
  const perdues = vieux.filter(k => !normal.includes(k) && k !== 'indispos');
  V('le nouveau filtre ne fait disparaître aucune AUTRE tuile', perdues.length === 0, perdues);
}

console.log('\n═══ PT15 · toute icône demandée par une tuile existe dans le bundle local ═══');
{
  /* Le bundle lucide n'embarque QUE les icônes listées : un nom absent donne
     un carré vide, sans erreur. On vérifie CHAQUE icône du tableau TILES —
     la tuile TP d'aujourd'hui, et toutes celles de demain. */
  const src = fs.readFileSync('../dashboard.html', 'utf8');
  const bundle = fs.readFileSync('../assets/vendor/lucide-icons.js', 'utf8');
  const mIcons = bundle.match(/var ICONS = (\{[\s\S]*?\});/);
  const dispo = new Set(Object.keys(JSON.parse(mIcons[1])));
  const demandees = [...src.match(/const TILES = \[[\s\S]*?\n\];/)[0].matchAll(/icon:'([a-z-]+)'/g)].map(m => m[1]);
  V('au moins 10 icônes de tuiles trouvées (le listage fonctionne)', demandees.length >= 10, demandees.length);
  const absentes = demandees.filter(n => !dispo.has(n));
  V('chaque icône de tuile est dans le bundle — dont calendar-clock', absentes.length === 0 && demandees.includes('calendar-clock'), absentes);
}

console.log('\n═══ PT16 · la clé pose_tp : effectifs anonymes, blocages par MAR, auto-fermeture ═══');
{
  const b = monde({ gardes: [['POSEUR', '2027-03-04', 'G'], ['POSEUR', '2027-03-05', 'RG'], ['ZORRO', '2027-03-05', 'R'], ['POSEUR', '2027-03-18', '18']],
                    indispos: [['POSEUR', '2027-03-09', 'TP'], ['POSEUR', '2027-03-15', 'VAC'], ['PLEIN01', '2027-03-02', 'VAC'], ['POSEUR', '2027-03-22', 'INDISPO']] });
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b.ctx);
  const cle = vm.runInContext('_construirePoseTp_(2027)', b.ctx);
  V('la clé se construit, année 2027', cle.success === true && !cle.ferme && cle.year === 2027, cle.year);
  V('les effectifs sont des NOMBRES par jour ouvré — aucun week-end dedans',
    cle.presents['2027-03-01'] === 16 && cle.presents['2027-03-06'] === undefined, cle.presents['2027-03-01']);
  V('un TP posé et une VAC comptent absents : 15 présents ces jours-là',
    cle.presents['2027-03-09'] === 15 && cle.presents['2027-03-02'] === 15, [cle.presents['2027-03-09'], cle.presents['2027-03-02']]);
  V('un férié n\'apparaît pas dans les effectifs (jamais posable)', cle.presents['2027-01-01'] === undefined);
  const moi = cle.parMar['POSEUR'];
  V('mes blocages portent le CODE exact : G, RG, VAC, TP', moi.jours['2027-03-04'] === 'G' && moi.jours['2027-03-05'] === 'RG'
    && moi.jours['2027-03-15'] === 'VAC' && moi.jours['2027-03-09'] === 'TP', moi.jours);
  V('la récup R du collègue est distinguée de RG', cle.parMar['ZORRO'].jours['2027-03-05'] === 'R', cle.parMar['ZORRO'].jours['2027-03-05']);
  V('ma garde de 18h apparaît en blocage (code 18)', moi.jours['2027-03-18'] === '18', moi.jours['2027-03-18']);
  V('mon INDISPO de campagne N\'apparaît PAS : le jour est jugé par sa bande', moi.jours['2027-03-22'] === undefined, moi.jours['2027-03-22']);
  V('…mais il compte toujours PRÉSENT dans l\'effectif (INDISPO ≠ absent)', cle.presents['2027-03-22'] === 16, cle.presents['2027-03-22']);
  V('mon quota vient de CONFIG_CONGES (80 % → 3)', moi.quota === 3, moi.quota);
  V('le plein temps est marqué : quota 0', cle.parMar['PLEIN01'].quota === 0, cle.parMar['PLEIN01'].quota);
  const b2 = monde({ gardes2027: false });
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b2.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b2.ctx);
  const cle2 = vm.runInContext('_construirePoseTp_(2027)', b2.ctx);
  V('GARDES_2027 supprimé → la clé dit { ferme } : elle s\'auto-nettoie', cle2.ferme === true, cle2);
}

console.log('\n═══ PT17 · l\'action getPoseTp : le MAR ne voit que lui, le comité voit tout ═══');
{
  const b = monde({ indispos: [['ZORRO', '2027-03-09', 'TP']] });
  const marque = "if (action === 'getPoseTp') {";
  const i = SRC_IND.indexOf(marque);
  V('le bloc getPoseTp existe dans le routeur', i > 0);
  let prof = 0, j = SRC_IND.indexOf('{', i);
  for (; j < SRC_IND.length; j++) { if (SRC_IND[j] === '{') prof++; else if (SRC_IND[j] === '}') { prof--; if (prof === 0) break; } }
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b.ctx);
  vm.runInContext('function handlerGetPoseTp(action, payload, user) {\n' + SRC_IND.slice(i, j + 1) + '\n return null; }', b.ctx);
  const mar = vm.runInContext("handlerGetPoseTp('getPoseTp', {}, {role:'mar', id:'POSEUR'})", b.ctx);
  V('rôle mar : effectifs présents, parMar réduit à LUI SEUL',
    mar.presents && Object.keys(mar.parMar).length === 1 && !!mar.parMar['POSEUR'], Object.keys(mar.parMar || {}));
  V('…le TP du collègue est invisible', !mar.parMar['ZORRO']);
  const adm = vm.runInContext("handlerGetPoseTp('getPoseTp', {}, {role:'admin', id:'ADMIN'})", b.ctx);
  V('rôle admin : parMar COMPLET (l\'écran comité du lot 4 lira la même chose)',
    Object.keys(adm.parMar).length >= 16 && adm.parMar['ZORRO'].jours['2027-03-09'] === 'TP', Object.keys(adm.parMar).length);
  const b2 = monde({ gardes2027: false });
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b2.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b2.ctx);
  vm.runInContext('function handlerGetPoseTp(action, payload, user) {\n' + SRC_IND.slice(i, j + 1) + '\n return null; }', b2.ctx);
  const ferme = vm.runInContext("handlerGetPoseTp('getPoseTp', {}, {role:'mar', id:'POSEUR'})", b2.ctx);
  V('phase fermée → { ferme:true }, jamais d\'erreur', ferme.success === true && ferme.ferme === true, ferme);
}

console.log('\n═══ PT18 · le relais : la clé est autorisée, validée, filtrée à l\'identité ═══');
{
  const W = fs.readFileSync('../cloudflare/worker.js', 'utf8');
  const wctx = vm.createContext({ console, JSON, Object, String, RegExp });
  const mCle = W.match(/const CLE_VALIDE = [^;]+;/);
  vm.runInContext(mCle[0], wctx);
  ['autorise', 'filtreIndispos', 'filtrePoseTp'].forEach(n => vm.runInContext(extraireFonction('../cloudflare/worker.js', n), wctx));
  V('CLE_VALIDE accepte pose_tp_2027', vm.runInContext("CLE_VALIDE.test('pose_tp_2027')", wctx));
  V('un MAR est autorisé à lire pose_tp_2027', vm.runInContext("autorise({role:'mar'}, 'pose_tp_2027')", wctx));
  V('gardes_2027 reste réservée au comité (rien n\'a bougé)', !vm.runInContext("autorise({role:'mar'}, 'gardes_2027')", wctx));
  const filtre = vm.runInContext(
    "filtrePoseTp({year:2027, presents:{'2027-03-01':16}, joursFeries:['2027-01-01'], parMar:{POSEUR:{jours:{},quota:3}, ZORRO:{jours:{'2027-03-09':'TP'},quota:2}}}, 'POSEUR')", wctx);
  V('le filtre garde effectifs et fériés, réduit parMar à moi',
    filtre.presents['2027-03-01'] === 16 && filtre.joursFeries.length === 1
    && Object.keys(filtre.parMar).length === 1 && !!filtre.parMar['POSEUR'], filtre);
  V('le Worker filtre pose_tp pour un non-admin (câblage /read présent)',
    /pose_tp_\\d\{4\}[\s\S]{0,80}filtrePoseTp/.test(W), 'motif absent');
}

console.log('\n═══ PT19 · le miroir pousse la clé, et indispos suit l\'année de PHASE ═══');
{
  const M = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('pose_tp_{Y} est enregistrée quand gardes OU indispos bougent',
    /uniq\['gardes'\] \|\| uniq\['indispos'\][\s\S]{0,900}pose_tp_/.test(M));
  V('…pour l\'année active ET la suivante (auto-nettoyage compris)',
    /\[annee, annee \+ 1\]\.forEach[\s\S]{0,200}pose_tp_/.test(M));
  V('la famille indispos pousse AUSSI toutes les années de la phase TP',
    /uniq\['indispos'\][\s\S]{0,1200}_phaseTp_\(\)[\s\S]{0,500}indispos_' \+ yPh/.test(M));
  V('saveIndispos déclenche bien la famille indispos (mappage existant intact)',
    /saveIndispos:\s*\['indispos', 'acces', 'gardes', 'planning'\]/.test(M));
}

console.log('\n═══ PT20 · l\'écran : mêmes seuils que le serveur, extraits de la vraie page ═══');
{
  const bacE = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set });
  ['tpxBadge', 'tpxAujourdhui', 'tpxEtat', 'tpxCompte'].forEach(n => vm.runInContext(extraireFonction('../indispos.html', n), bacE));
  const regle = (TPX) => { bacE.TPX = TPX; return bacE; };
  const T = { annee: 2027, presents: { '2027-03-01': 16, '2027-03-02': 15, '2027-03-03': 13, '2027-03-17': 18 },
    feries: new Set(['2027-03-24']), fermes: new Set(['2027-03-17']),
    jours: { '2027-03-09': 'TP', '2027-03-10': 'TPA', '2027-03-04': 'G', '2027-03-15': 'VAC' },
    quota: 3, pend: {}, retire: new Set() };
  regle(T);
  const et = (d) => vm.runInContext(`tpxEtat('${d}')`, bacE);
  V('16 présents → vert (il resterait 15)', et('2027-03-01').s === 'libre');
  V('15 présents → jaune', et('2027-03-02').s === 'plein');
  V('13 présents → noir, fermé', et('2027-03-03').s === 'ferme');
  V('samedi → week-end', et('2027-03-06').s === 'weekend');
  V('férié → gris avec badge FÉRIÉ', et('2027-03-24').s === 'bloque' && et('2027-03-24').badge.b === 'FÉRIÉ');
  V('mon TP → violet, mon TPA → orange', et('2027-03-09').s === 'pose' && et('2027-03-10').s === 'reserve');
  V('ma garde et mes congés → gris avec le bon badge',
    et('2027-03-04').badge.b === 'GARDE' && et('2027-03-15').badge.b === 'CONGÉS');
  T.jours['2027-03-16'] = '18'; regle(T);
  V('ma garde de 18h → gris, badge 18H (on est au travail)', et('2027-03-16').s === 'bloque' && et('2027-03-16').badge.b === '18H', et('2027-03-16'));
  V('un jour fermé par le comité → NOIR pour moi, même à 18 présents (lot 4)', et('2027-03-17').s === 'ferme', et('2027-03-17'));
  T.retire.add('2027-03-09'); T.presents['2027-03-09'] = 16; regle(T);
  V('un TP retiré localement redevient un jour jugé par sa bande', et('2027-03-09').s === 'libre');
  T.pend['2027-03-02'] = 'TPA'; regle(T);
  const c = vm.runInContext('tpxCompte()', bacE);
  V('le compteur : 0 posé (TP retiré), 2 sous réserve (TPA + pose locale jaune), 2 en attente',
    c.poses === 0 && c.reserves === 2 && c.attente === 2, c);
  const page = fs.readFileSync('../indispos.html', 'utf8');
  V('l\'enregistrement envoie bien le drapeau du circuit TP ({ tp: true, year })',
    /saveIndispos', \{ tp: true, year: TPX\.annee, indispos: map \}/.test(page));
  V('le bouton « Temps partiel » a quitté l\'écran campagne', !/btnCTP/.test(page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
}


console.log('\n═══ PT21 · TP_FERMES : fermer, refuser pour tous, rouvrir ═══');
{
  const b = monde({});
  vm.runInContext("_tpFermerJour_(2027, '2027-03-02', 'PRUNET')", b.ctx);
  vm.runInContext("_tpFermerJour_(2027, '2027-03-02', 'PRUNET')", b.ctx);   // idempotent
  V('l\'onglet TP_FERMES est créé au premier refus, une seule ligne',
    b.cl.getSheetByName('TP_FERMES').getDataRange().getValues().length === 2);
  V('la liste des fermés porte le jour', vm.runInContext("_tpFermes_(2027).has('2027-03-02')", b.ctx));
  const rep = b.appel({ tp: true, indispos: { '2027-03-02': 'TP' } }, MAR);
  V('poser sur un jour fermé → refus « jour fermé par le comité »',
    /fermé par le comité/.test(rep.resultat['2027-03-02'] || ''), rep.resultat['2027-03-02']);
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b.ctx);
  V('la clé pose_tp expose les jours fermés',
    vm.runInContext("_construirePoseTp_(2027).fermes.indexOf('2027-03-02') >= 0", b.ctx));
  vm.runInContext("_tpRouvrirJour_(2027, '2027-03-02')", b.ctx);
  V('rouvrir retire le jour de la liste', vm.runInContext("!_tpFermes_(2027).has('2027-03-02')", b.ctx));
}

console.log('\n═══ PT22 · deciderJourTp : les quatre gestes du comité, annulables ═══');
{
  const b = monde({ indispos: [['POSEUR', '2027-03-02', 'TPA'], ['ZORRO', '2027-03-02', 'TPA'], ['POSEUR', '2027-03-05', 'TPA']] });
  const marque = "if (action === 'deciderJourTp') {";
  const i = SRC_IND.indexOf(marque);
  V('le bloc deciderJourTp existe dans le routeur', i > 0);
  let prof = 0, j = SRC_IND.indexOf('{', i);
  for (; j < SRC_IND.length; j++) { if (SRC_IND[j] === '{') prof++; else if (SRC_IND[j] === '}') { prof--; if (prof === 0) break; } }
  vm.runInContext('function handlerDecider(action, payload, user) {\n' + SRC_IND.slice(i, j + 1) + '\n return null; }', b.ctx);
  const dec = (p, u) => vm.runInContext(`handlerDecider('deciderJourTp', ${JSON.stringify(p)}, ${JSON.stringify(u)})`, b.ctx);
  V('un rôle mar est refusé', dec({ decision: 'valider', doctorId: 'POSEUR', date: '2027-03-02' }, MAR).success === false);
  const v = dec({ decision: 'valider', doctorId: 'POSEUR', date: '2027-03-02' }, ADMIN);
  V('valider : la TPA devient TP, quota compté', v.success === true && b.lireGarde('POSEUR', '2027-03-02') === 'TP', v);
  const av = dec({ decision: 'annuler_validation', doctorId: 'POSEUR', date: '2027-03-02' }, ADMIN);
  V('annuler la validation : le TP redevient TPA', av.success === true && b.demandes().some(x => x.mar === 'POSEUR' && x.date === '2027-03-02'));
  const r = dec({ decision: 'refuser', date: '2027-03-02' }, ADMIN);
  V('refuser : le jour est fermé et LES DEUX demandes du jour sont rendues',
    r.success === true && r.fermes.indexOf('2027-03-02') >= 0
    && r.rendues['POSEUR'] === 'TPA' && r.rendues['ZORRO'] === 'TPA'
    && !b.lireGarde('POSEUR', '2027-03-02') && !b.lireGarde('ZORRO', '2027-03-02'), r);
  V('…la demande d\'un AUTRE jour n\'est pas touchée', b.demandes().some(x => x.mar === 'POSEUR' && x.date === '2027-03-05'));
  const ar = dec({ decision: 'annuler_refus', date: '2027-03-02', retablir: r.rendues }, ADMIN);
  V('annuler le refus : le jour rouvre, les TPA sont rétablies',
    ar.success === true && ar.fermes.indexOf('2027-03-02') < 0
    && b.demandes().some(x => x.mar === 'POSEUR' && x.date === '2027-03-02') && b.demandes().some(x => x.mar === 'ZORRO' && x.date === '2027-03-02'), ar);
  const M2 = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('deciderJourTp déclenche la famille indispos (l\'écran des 8 suit dans la minute)',
    /deciderJourTp:\s*\['indispos', 'acces', 'gardes', 'planning'\]/.test(M2));
}

console.log('\n═══ PT23 · le bloc comité d\'admin : effectif de l\'INSTANT ═══');
{
  const bacA = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set });
  vm.runInContext(extraireFonction('../admin.html', 'tpcPresentsSi'), bacA);
  bacA.TPC = { presents: { '2027-03-23': 15, '2027-04-02': 15 },
    demandes: [
      { id: 'SEVERAC', jour: '2027-03-23', etat: null },
      { id: 'CATINEAU', jour: '2027-03-23', etat: null },
      { id: 'ZAMARON', jour: '2027-04-02', etat: null }] };
  const psi = (i) => vm.runInContext(`tpcPresentsSi(TPC.demandes[${i}])`, bacA);
  V('avant toute décision : 14 présents si on valide (15 − le demandeur)', psi(0) === 14 && psi(1) === 14, [psi(0), psi(1)]);
  bacA.TPC.demandes[0].etat = 'ok';
  V('SEVERAC validé → la ligne de CATINEAU se recalcule : 13 (le point de la maquette)', psi(1) === 13, psi(1));
  V('…et le jour d\'un AUTRE jour ne bouge pas', psi(2) === 14, psi(2));
  const adm = fs.readFileSync('../admin.html', 'utf8');
  V('le bloc est accroché à l\'onglet Équipe', /name==='equipe'[^\n]*tpcCharger\(\)/.test(adm));
  V('les décisions partent en LOT, plus une par une',
    /action: 'deciderJourTpLot'/.test(adm) && !/action: 'deciderJourTp',/.test(adm));
  V('on peut tout défaire AVANT d\'enregistrer', /function tpcToutAnnuler/.test(adm));
}


console.log('\n═══ PT24 · lot 5 serveur : phase à DEUX années, jours passés figés ═══');
{
  // Phase multi-années : GARDES_2027+LIENS_R_2027 ET GARDES_2028+LIENS_R_2028, active 2027
  const b2a = monde({});
  b2a.cl.ajouter('GARDES_2028', b2a.cl.getSheetByName('GARDES_2027').getDataRange().getValues().map(r => r.slice()));
  b2a.cl.ajouter('LIENS_R_2028', [['A']]);
  b2a.cl.getSheetByName('CONFIG').getDataRange().getValues();   // témoin : lecture ok
  const cfg = b2a.cl.getSheetByName('CONFIG');
  const d = cfg.getDataRange().getValues();
  for (let r = 0; r < d.length; r++) if (String(d[r][0]) === 'ANNEE_ACTIVE') cfg.lignes[r][1] = 2027;
  const ph2 = vm.runInContext('_phaseTp_()', b2a.ctx);
  V('deux années générées → phase ouverte sur LES DEUX, la plus récente en tête',
    ph2.actif === true && JSON.stringify(ph2.annees) === '[2027,2028]' && ph2.annee === 2028, ph2);
  const repMauvaise = b2a.appel({ tp: true, year: 2026, indispos: { '2026-03-01': 'TP' } }, MAR);
  V('demander une année NON ouverte → refus chiffré, jamais de repli',
    repMauvaise.success === false && /2026/.test(repMauvaise.error || ''), repMauvaise.error);
  const rep27 = b2a.appel({ tp: true, year: 2027, indispos: { '2027-03-01': 'TP' } }, MAR);
  V('demander explicitement 2027 alors que 2028 existe → la pose va dans 2027',
    rep27.success === true && rep27.annee === 2027 && b2a.lireGarde('POSEUR', '2027-03-01') === 'TP', rep27);

  // Jours passés figés : « aujourd'hui » forcé au 15/06/2027 dans ce monde
  const b = monde({ indispos: [['POSEUR', '2027-03-09', 'TP'], ['POSEUR', '2027-03-10', 'TPA'], ['POSEUR', '2027-09-06', 'TP']] });
  b.ctx.Utilities = { formatDate: () => '2027-06-15' };
  const repVide = b.appel({ tp: true, indispos: {} }, MAR);
  V('envoi SANS les jours passés → le TP révolu est CONSERVÉ dans la grille (figé)',
    b.lireGarde('POSEUR', '2027-03-09') === 'TP', b.lireGarde('POSEUR', '2027-03-09'));
  V('…et une demande en attente sur un jour révolu EXPIRE : plus personne ne la validera',
    !b.demandes().some(x => x.date === '2027-03-10'), b.demandes());
  V('…et le TP passé reste COMPTÉ dans le quota', repVide.quota.valides >= 1, repVide.quota);
  V('…le TP futur absent de l\'envoi, lui, est bien retiré (règle inchangée)',
    !b.lireGarde('POSEUR', '2027-09-06'), b.lireInd('POSEUR', 2027)['2027-09-06']);
  const repRetro = b.appel({ tp: true, indispos: { '2027-03-09': 'TP', '2027-03-10': 'TPA', '2027-02-01': 'TP' } }, MAR);
  V('poser rétroactivement sur un jour révolu → « jour passé »',
    repRetro.resultat['2027-02-01'] === 'jour passé', repRetro.resultat['2027-02-01']);
  V('un TP passé renvoyé tel quel est figé, pas re-jugé',
    repRetro.resultat['2027-03-09'] === 'TP', repRetro.resultat);
  const bAdm = monde({ indispos: [['ZORRO', '2027-03-09', 'TP']] });
  bAdm.ctx.Utilities = { formatDate: () => '2027-06-15' };
  bAdm.appel({ tp: true, doctorId: 'ZORRO', indispos: {} }, ADMIN);
  V('le comité, lui, PEUT corriger l\'historique (TP passé retiré)',
    !bAdm.lireGarde('ZORRO', '2027-03-09'), bAdm.lireGarde('ZORRO', '2027-03-09'));
}

console.log('\n═══ PT25 · lot 5 écran : le passé figé, le compteur, l\'année au départ ═══');
{
  const bacE = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set });
  ['tpxBadge', 'tpxAujourdhui', 'tpxEtat', 'tpxCompte'].forEach(n => vm.runInContext(extraireFonction('../indispos.html', n), bacE));
  bacE.TPX = { annee: 2025, presents: { '2025-03-03': 16 }, feries: new Set(), fermes: new Set(),
    jours: { '2025-03-04': 'TP', '2025-03-05': 'TPA', '2025-03-06': 'G' }, quota: 26, pend: {}, retire: new Set() };
  const et = (d) => vm.runInContext(`tpxEtat('${d}')`, bacE);
  V('un TP révolu s\'affiche violet mais FIGÉ', et('2025-03-04').s === 'pose' && et('2025-03-04').passe === true, et('2025-03-04'));
  V('une garde révolue garde son badge, figée', et('2025-03-06').s === 'bloque' && et('2025-03-06').passe === true);
  V('un jour révolu resté vide est gris « PASSÉ »', et('2025-03-03').badge && et('2025-03-03').badge.b === 'PASSÉ', et('2025-03-03'));
  const c = vm.runInContext('tpxCompte()', bacE);
  V('le compteur : le TP passé compte POSÉ, la TPA expirée ne compte plus « sous réserve »',
    c.poses === 1 && c.reserves === 0, c);
  const page = fs.readFileSync('../indispos.html', 'utf8');
  V('l\'enregistrement porte l\'année affichée ({ tp, year })',
    /saveIndispos', \{ tp: true, year: TPX\.annee, indispos: map \}/.test(page));
  V('un jour passé ne réagit plus au toucher', /e\.passe[\s\S]{0,80}Ce jour est passé/.test(page));
  V('le sélecteur d\'années existe et reste caché à une seule année ouverte',
    /tpxAnnees/.test(page) && /tpxChangerAnnee/.test(page) && /ans\.length < 2/.test(page));
}

console.log('\n═══ PT26 · lot 5 comité : fusion des années ouvertes, demandes expirées écartées ═══');
{
  const adm = fs.readFileSync('../admin.html', 'utf8');
  V('le bloc comité fusionne TOUTES les clés ouvertes', /cles\.forEach[\s\S]{0,300}Object\.assign\(TPC\.presents/.test(adm));
  V('une TPA expirée n\'est pas listée (jour ≥ aujourd\'hui)', /'TPA' && ds >= auj/.test(adm));
  /* (23/08/2026) admin.html parle au serveur par api({action}), jamais par
     apiCall — le motif suit la vraie forme d'appel de la page. */
  V('le repli serveur va chercher les autres années ouvertes',
    /r\.annees[\s\S]{0,240}action: 'getPoseTp', year: yA/.test(adm));
}


console.log('\n═══ PT27 · CORRECTIF : le portail s\'ouvre par le relais — la tuile doit y trouver ses critères ═══');
{
  /* Défaut du 22/08 au soir, trouvé en production : dashboard.html appelle
     miroirBootDash() puis applyUserBadge(m.identite). L\'identité venait de la
     clé `acces` et du Worker, qui ne portaient NI phase NI quotité NI tpFixe :
     la tuile restait invisible pour les 8 éligibles. Les trois étages sont
     testés ici, plus le consommateur (le filtre de tuiles). */
  const b = monde({});
  ['_tpFixeDe_', '_quotiteDe_', '_phaseTp_'].forEach(n => {
    try { vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b.ctx); } catch (e) {}
  });
  vm.runInContext('function _indisposOuverte_() { return false; }', b.ctx);
  vm.runInContext('function getIndisposYear() { return 2026; }', b.ctx);
  vm.runInContext('function _configRows_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG").getDataRange().getValues(); }', b.ctx);
  vm.runInContext('var Utilities = { computeDigest: function () { return [1, 2, 3]; }, DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } };', b.ctx);
  vm.runInContext(extraireFonction('../gas/miroir.gs', '_miroirSha256_'), b.ctx);
  vm.runInContext(extraireFonction('../gas/miroir.gs', '_miroirConstruireAcces_'), b.ctx);
  const acces = vm.runInContext('_miroirConstruireAcces_()', b.ctx);
  V('la clé `acces` porte la phase TP', acces.phaseTp && acces.phaseTp.actif === true && acces.phaseTp.annee === 2027, acces.phaseTp);
  const moi = acces.users.filter(function (u) { return u.id === 'POSEUR'; })[0];
  const plein = acces.users.filter(function (u) { return u.id === 'PLEIN01'; })[0];
  V('chaque MAR porte SA quotité', moi && moi.quotite === 80 && plein && plein.quotite === 100, [moi && moi.quotite, plein && plein.quotite]);
  V('…et son drapeau « jours fixes / rythme 2 sur 2 »', moi && moi.tpFixe === false, moi && moi.tpFixe);

  // Étage Worker : la liste blanche doit laisser passer les trois champs
  const W = fs.readFileSync('../cloudflare/worker.js', 'utf8');
  V('le Worker recopie phaseTp dans l\'identité', /identite = \{[\s\S]{0,900}phaseTp: acces\.phaseTp/.test(W));
  V('…ainsi que quotite et tpFixe', /quotite: Number\(user\.quotite\)[\s\S]{0,120}tpFixe: !!user\.tpFixe/.test(W));
  V('vieille clé `acces` → valeurs sûres, tuile cachée (aucune erreur)',
    /phaseTp: acces\.phaseTp \|\| \{ actif: false/.test(W) && /Number\(user\.quotite\) \|\| 100/.test(W));

  // Le consommateur : le portail ouvre par le relais, PAS par la connexion GAS
  const dash = fs.readFileSync('../dashboard.html', 'utf8');
  V('témoin du défaut : le portail s\'ouvre par le relais, qui pose l\'identité',
    /applyUserBadge\(m\.identite/.test(dash) && /await miroirBootDash\(\) === true/.test(dash));
  V('applyUserBadge lit les trois champs de l\'identité reçue',
    /PHASE_TP = \(r\.phaseTp && r\.phaseTp\.actif\)/.test(dash) && /MY_QUOTITE = Number\(r\.quotite\)/.test(dash) && /MY_TPFIXE = !!r\.tpFixe/.test(dash));

  // La phase vit dans `acces` : générer une année doit reconstruire cette clé
  const M = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('generateGardes reconstruit `acces` (sinon la tuile attendrait la synchro horaire)',
    /generateGardes:\s*\['annees', 'acces'/.test(M));
  V('archiveYear aussi (la phase se referme avec l\'archivage)', /archiveYear:\s*\['planning', 'affectations', 'annees', 'acces'/.test(M));
}


console.log('\n═══ PT28 · LE VOYAGE : la clé mise en texte, servie par le relais, montée dans la VRAIE page ═══');
{
  /* Défaut du 23/08 au matin, trouvé en production : `getJoursFeries` renvoie
     un ENSEMBLE. Le banc passait l'objet directement — intact. La copie rapide,
     elle, met tout en TEXTE : un ensemble y devient {}, et l'écran plantait sur
     `new Set({})`. Écran blanc, erreur avalée par le filet de connexion.
     Ce scénario refait le trajet complet : construction → texte → relais →
     page réelle pilotée, et exige un calendrier affiché. */
  const b = monde({});
  ['_tpFermesSheet_', '_tpFermes_'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), b.ctx));
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_construirePoseTp_'), b.ctx);
  const cle = vm.runInContext('_construirePoseTp_(2027)', b.ctx);

  // 1. Le voyage en texte, celui de la copie rapide
  const apres = JSON.parse(JSON.stringify(cle));
  V('les fériés voyagent en LISTE (un ensemble deviendrait {} — la cause du 23/08)',
    Array.isArray(apres.joursFeries) && apres.joursFeries.length > 0, apres.joursFeries);
  V('les jours fermés aussi', Array.isArray(apres.fermes));
  V('rien ne se perd en route : effectifs et blocages intacts',
    Object.keys(apres.presents).length === Object.keys(cle.presents).length
    && Object.keys(apres.parMar).length === Object.keys(cle.parMar).length);
  const suspects = [];
  (function scanne(o, chemin) {
    if (o instanceof Set || o instanceof Map) { suspects.push(chemin); return; }
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      Object.keys(o).forEach(function (k) { scanne(o[k], chemin + '.' + k); });
    }
  })(cle, 'pose_tp');
  V('aucun ensemble ni table n\'est laissé dans la clé (ils ne survivent pas au voyage)',
    suspects.length === 0, suspects);

  // Le pilotage de la VRAIE page avec cette clé : scénario banc_pose_tp_page.js
}


console.log('\n═══ PT29 · la réponse du comité se NOTIFIE, à la bonne personne ═══');
{
  /* (23/08/2026) Décision d'Arthur : validation ET refus se notifient au MAR
     concerné. Un refus ferme le jour pour toute l'équipe, mais SEULS les
     demandeurs sont prévenus — les autres le verront noir, sans message. */
  const b = monde({ indispos: [['POSEUR', '2027-03-02', 'TPA'], ['ZORRO', '2027-03-02', 'TPA'],
                               ['POSEUR', '2027-03-05', 'TPA']] });
  const envois = b.envois;
  const marque = "if (action === 'deciderJourTp') {";
  const i = SRC_IND.indexOf(marque);
  let prof = 0, j = SRC_IND.indexOf('{', i);
  for (; j < SRC_IND.length; j++) { if (SRC_IND[j] === '{') prof++; else if (SRC_IND[j] === '}') { prof--; if (prof === 0) break; } }
  vm.runInContext('function handlerDecider(action, payload, user) {\n' + SRC_IND.slice(i, j + 1) + '\n return null; }', b.ctx);
  const dec = (p) => vm.runInContext(`handlerDecider('deciderJourTp', ${JSON.stringify(p)}, ${JSON.stringify(ADMIN)})`, b.ctx);

  V('la date se dit en toutes lettres, pas en chiffres',
    vm.runInContext("_tpJourLisible_('2027-02-18')", b.ctx) === 'jeudi 18 février',
    vm.runInContext("_tpJourLisible_('2027-02-18')", b.ctx));

  envois.length = 0;
  dec({ decision: 'valider', doctorId: 'POSEUR', date: '2027-03-02' });
  V('valider → UNE notification, au seul MAR concerné',
    envois.length === 1 && envois[0].cible.id === 'POSEUR', envois);
  V('…elle dit que le jour est validé, avec la date lisible',
    /validé/i.test(envois[0].titre) && /mardi 2 mars/.test(envois[0].corps), envois[0]);
  V('…et elle ramène sur l\'écran de pose', /indispos\.html\?tp=1/.test(envois[0].url), envois[0].url);

  envois.length = 0;
  dec({ decision: 'annuler_validation', doctorId: 'POSEUR', date: '2027-03-02' });
  V('annuler une validation prévient aussi (le jour redevient incertain)',
    envois.length === 1 && /attente/i.test(envois[0].titre), envois);

  envois.length = 0;
  const r = dec({ decision: 'refuser', date: '2027-03-02' });
  const vises = envois.map(function (e) { return e.cible.id; }).sort();
  V('refuser → les DEUX demandeurs de ce jour sont prévenus',
    envois.length === 2 && vises[0] === 'POSEUR' && vises[1] === 'ZORRO', vises);
  V('…et personne d\'autre : les 14 autres MARs verront le jour noir, sans message',
    envois.every(function (e) { return e.cible && e.cible.id; }) && envois.length === 2, envois.length);
  V('le message dit pourquoi, sans jargon',
    /refusé/i.test(envois[0].titre) && /trop réduite/.test(envois[0].corps), envois[0]);

  envois.length = 0;
  dec({ decision: 'annuler_refus', date: '2027-03-02', retablir: r.rendues });
  V('annuler un refus prévient ceux qu\'on rétablit', envois.length === 2, envois.map(function (e) { return e.cible.id; }));

  /* Garde-fou : une notification qui échoue ne doit JAMAIS faire rater la
     décision — c'est la règle du canal depuis le 12/08. */
  vm.runInContext('function notifierPush_() { throw new Error("relais injoignable"); }', b.ctx);
  let jete = null, ok2 = null;
  try { ok2 = dec({ decision: 'valider', doctorId: 'POSEUR', date: '2027-03-05' }); } catch (e) { jete = e; }
  V('une notification en échec ne fait pas échouer la décision',
    !jete && ok2 && ok2.success === true && b.lireGarde('POSEUR', '2027-03-05') === 'TP', jete && jete.message);
}


console.log('\n═══ PT30 · la republication est DIFFÉRÉE : personne n\'attend dix secondes ═══');
{
  /* (23/08/2026) Republier coûte ~10 s (mesure du 09/08). Dans la requête,
     chaque validation ferait attendre le comité — cinquante secondes sur une
     série de cinq. La requête NOTE l'année et arme UN déclencheur unique ;
     la republication tombe dans la minute. Au pire, le planning publié a une
     minute de retard : le classeur, lui, est déjà juste. */
  const b = monde({ indispos: [['POSEUR', '2027-03-02', 'TPA'], ['ZORRO', '2027-03-02', 'TPA'],
                               ['POSEUR', '2027-03-05', 'TPA']] });
  const marque = "if (action === 'deciderJourTp') {";
  const i = SRC_IND.indexOf(marque);
  let prof = 0, j = SRC_IND.indexOf('{', i);
  for (; j < SRC_IND.length; j++) { if (SRC_IND[j] === '{') prof++; else if (SRC_IND[j] === '}') { prof--; if (prof === 0) break; } }
  vm.runInContext('function handlerDecider(action, payload, user) {\n' + SRC_IND.slice(i, j + 1) + '\n return null; }', b.ctx);
  const dec = (p) => vm.runInContext(`handlerDecider('deciderJourTp', ${JSON.stringify(p)}, ${JSON.stringify(ADMIN)})`, b.ctx);

  b.republications.length = 0;
  const v1 = dec({ decision: 'valider', doctorId: 'POSEUR', date: '2027-03-02' });
  V('la décision aboutit sans republier dans la requête',
    v1.success === true && b.republications.length === 0, b.republications);
  V('…l\'année est notée pour plus tard', JSON.stringify(b.file()) === '[2027]', b.file());
  V('…et UN déclencheur est armé', b.declencheurs.filter(x => x === 'tpRepublicationDifferee').length === 1, b.declencheurs);

  const v2 = dec({ decision: 'valider', doctorId: 'ZORRO', date: '2027-03-02' });
  V('une deuxième décision n\'arme PAS un deuxième déclencheur',
    v2.success === true && b.declencheurs.filter(x => x === 'tpRepublicationDifferee').length === 1, b.declencheurs);
  V('…et la file ne double pas l\'année', JSON.stringify(b.file()) === '[2027]', b.file());
  V('le planning est déjà juste dans le classeur, avant même de republier',
    b.lireGarde('POSEUR', '2027-03-02') === 'TP' && b.lireGarde('ZORRO', '2027-03-02') === 'TP');

  b.jouerDifferee();
  V('le déclencheur republie UNE fois pour les deux décisions',
    b.republications.length === 1 && b.republications[0] === 2027, b.republications);
  V('…il se nettoie derrière lui', b.declencheurs.indexOf('tpRepublicationDifferee') === -1, b.declencheurs);
  V('…et vide la file', JSON.stringify(b.file()) === '[]', b.file());

  // Une pose de MAR suit le même chemin
  const b2 = monde({});
  b2.republications.length = 0;
  const rep = b2.appel({ tp: true, indispos: { '2027-03-01': 'TP', '2027-03-03': 'TP' } }, MAR);
  V('une pose de plusieurs jours ne republie pas non plus dans la requête',
    rep.success === true && b2.republications.length === 0 && JSON.stringify(b2.file()) === '[2027]', b2.file());
  b2.jouerDifferee();
  V('…une seule republication pour tout l\'envoi', b2.republications.length === 1, b2.republications);
}


console.log('\n═══ PT31 · deux défauts trouvés en production le 23/08 ═══');
{
  /* (a) L'ANNÉE DOIT VOYAGER. Le serveur choisit les clés à rafraîchir avec
     `payload.year`, sinon il retombe sur l'année ACTIVE. L'écran comité
     n'envoyait rien : après une validation sur 2027, il rafraîchissait 2026 —
     l'alerte restait affichée, et il fallait relancer la synchro à la main. */
  const adm = fs.readFileSync('../admin.html', 'utf8');
  const decisions = (adm.match(/action: 'deciderJourTp'/g) || []).length;
  const avecAnnee = (adm.match(/action: 'deciderJourTp', year: TPC\.annee/g) || []).length;
  V('l\'envoi groupé porte l\'année — sans elle le serveur rafraîchirait 2026',
    /action: 'deciderJourTpLot', year: TPC\.annee/.test(adm), 'année absente');
  V('…et TPC porte bien une année, prise sur la clé la plus récente', /annee: Number\(\(cles\[cles\.length - 1\]/.test(adm));
  const M = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('témoin : le serveur lit l\'année dans le payload, sinon l\'année active',
    /Number\(payload\.year\) \|\| getActiveYear\(\)/.test(M));

  /* (b) RETIRER N'EST PAS REFUSER. Le récapitulatif rangeait tout verdict
     autre que TP/TPA dans les refusés : un MAR qui corrigeait sa propre
     erreur lisait « refusé ». */
  const page = fs.readFileSync('../indispos.html', 'utf8');
  V('le récapitulatif écarte « retiré » des refus', /r\[ds\] !== 'retiré'[\s\S]{0,320}refus\.push/.test(page));
  V('…et l\'annonce pour ce qu\'elle est : un retrait, à la demande du MAR',
    /jour' \+ \(retires\.length > 1 \? 's' : ''\) \+ ' retiré/.test(page) && /reviennent dans votre quota/.test(page));

  /* Le serveur, lui, dit bien « retiré » — c'est ce mot que l'écran lit. */
  const b = monde({ indispos: [['POSEUR', '2027-03-09', 'TP']] });
  const rep = b.appel({ tp: true, indispos: {} }, MAR);
  V('le serveur qualifie un jour rendu de « retiré », jamais de refus',
    rep.resultat['2027-03-09'] === 'retiré', rep.resultat);
  V('…et la case du planning est bien libérée', !b.lireGarde('POSEUR', '2027-03-09'));
}


console.log('\n═══ PT32 · trois nombres, trois mots — accordé, en attente, restant ═══');
{
  /* (23/08/2026, production) « 19 posés » à côté de « 7 sous réserve » et
     « 7 restants sur 26 » se lisait comme si les 19 contenaient les jaunes.
     Vérifié dans le classeur : 19 TP dans GARDES + 7 lignes en attente = 26
     jours posés. Les chiffres étaient justes, le vocabulaire non. */
  const page = fs.readFileSync('../indispos.html', 'utf8');
  /* (06/09/2026) Les trois chiffres ont été remplacés par une JAUGE en trois
     temps — déjà pris, posé à venir, en attente du comité — et une phrase. Le
     vocabulaire reste le point à tenir : « accordés » et « en attente du
     comité », jamais « posés » ni « sous réserve », qui laissaient croire que
     les jaunes étaient acquis. */
  V('le compteur dit « accordés », plus « posés »', /Jours accordés<\/span>/.test(page));
  V('…et « en attente du comité », plus « sous réserve »', /' en attente<\/span>'/.test(page));
  V('la jauge distingue le déjà-pris, le posé à venir et l\'attente',
    /id="tpxJaugePasse"/.test(page) && /id="tpxJauge"/.test(page) && /id="tpxJaugeRes"/.test(page));
  V('…et la phrase annonce ce qu\'il reste à poser', /il vous reste <b>' \+ restants/.test(page));
  V('le récapitulatif ne dit plus « rien à faire » sans nuance',
    /inscrits au planning, rien à faire/.test(page) && !/C\\'est bon, rien à faire/.test(page));
  V('les jours en attente sont annoncés comme un SUPPLÉMENT', /EN PLUS, en attente du comité/.test(page));
  V('…et comme absents du planning', /ne sont <b>pas<\/b> '\s*\+\s*'inscrits au planning/.test(page));
  V('le titre annonce combien de jours attendent', /'s attendent' : ' attend'/.test(page));

  /* Le compteur lui-même : les deux familles ne se mélangent jamais. */
  const bacE = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set });
  ['tpxBadge', 'tpxAujourdhui', 'tpxEtat', 'tpxCompte'].forEach(n => vm.runInContext(extraireFonction('../indispos.html', n), bacE));
  bacE.TPX = { annee: 2027, presents: {}, feries: new Set(), fermes: new Set(), quota: 26,
    jours: { '2027-11-02': 'TP', '2027-11-03': 'TP', '2027-12-15': 'TPA' }, pend: {}, retire: new Set() };
  const c = vm.runInContext('tpxCompte()', bacE);
  V('deux accordés et une demande ne font pas trois accordés',
    c.poses === 2 && c.reserves === 1, c);
}


console.log('\n═══ PT33 · le plafond couvre AUSSI les demandes en attente ═══');
{
  /* (23/08/2026) Sans plafond commun, on pouvait poser tout son quota en vert
     PUIS demander dix jours jaunes de plus — et finir au-dessus du quota si le
     comité disait oui. Accordés + en attente ne dépassent jamais le total. */
  const b = monde({});                       // POSEUR : 80 %, quota 3
  const envoi = {};
  ['2027-03-01', '2027-03-03', '2027-03-08'].forEach(d => { envoi[d] = 'TP'; });
  const r1 = b.appel({ tp: true, indispos: envoi }, MAR);
  const verts = Object.keys(r1.resultat).filter(d => r1.resultat[d] === 'TP').length;
  V('les trois jours du quota sont accordés', verts === 3, r1.resultat);
  envoi['2027-03-02'] = 'TP';                // un jour JAUNE en plus
  const r2 = b.appel({ tp: true, indispos: envoi }, MAR);
  V('une demande de plus est REFUSÉE : le quota est déjà pris',
    /quota atteint/.test(r2.resultat['2027-03-02'] || ''), r2.resultat['2027-03-02']);
  V('…et rien n\'est entré dans le registre', !b.demandes().some(x => x.date === '2027-03-02'), b.demandes());

  // L'inverse : une demande d'abord, puis des verts qui déborderaient.
  // Un absent de plus le 02/03 suffit à rendre ce jour JAUNE (sondé : 15 présents).
  const b2 = monde({ indispos: [['PLEIN01', '2027-03-02', 'VAC']] });
  const e2 = { '2027-03-02': 'TP' };         // jaune → demande
  const r3 = b2.appel({ tp: true, indispos: e2 }, MAR);
  V('un jour jaune part en demande', r3.resultat['2027-03-02'] === 'TPA', r3.resultat);
  V('le compte renvoyé distingue accordés et en attente',
    r3.quota.valides === 0 && r3.quota.attente === 1 && r3.quota.total === 3, r3.quota);
  ['2027-03-01', '2027-03-03', '2027-03-08'].forEach(d => { e2[d] = 'TP'; });
  const r4 = b2.appel({ tp: true, indispos: e2 }, MAR);
  const acc = Object.keys(r4.resultat).filter(d => r4.resultat[d] === 'TP').length;
  V('deux verts passent, le troisième est refusé — la demande occupe une place',
    acc === 2 && Object.keys(r4.resultat).some(d => /quota atteint/.test(r4.resultat[d] || '')), r4.resultat);

  const page = fs.readFileSync('../indispos.html', 'utf8');
  V('l\'écran refuse aussi de dépasser, sans attendre le serveur',
    /c\.poses \+ c\.reserves >= TPX\.quota/.test(page));
}

console.log('\n═══ PT34 · les décisions du comité partent EN LOT ═══');
{
  /* (23/08/2026) Chaque clic partait au serveur : quinze jours à trancher,
     quinze allers-retours. Le comité marque, puis envoie tout d'un coup. */
  const adm = fs.readFileSync('../admin.html', 'utf8');
  V('marquer une décision n\'appelle plus le serveur',
    /function tpcDecider\(i, etat\) \{[\s\S]{0,700}\}/.test(adm)
    && !/function tpcDecider[\s\S]{0,700}await api\(/.test(adm));
  V('un bouton d\'envoi groupé existe', /tpcEnvoyer/.test(adm) && /Enregistrer les décisions/.test(adm));
  V('…et il envoie UNE requête pour toute la série', /action: 'deciderJourTpLot', year: TPC\.annee, decisions/.test(adm));
  V('un refus n\'est envoyé qu\'une fois par jour (le serveur ferme le jour)', /if \(vus\[d\.jour\]\) return;/.test(adm));
  V('« Tout défaire » permet de revenir avant d\'enregistrer', /tpcToutAnnuler/.test(adm));
  V('la barre dit que rien n\'est enregistré avant le clic', /est enregistré tant que/.test(adm));

  const M = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('l\'action de lot rafraîchit les mêmes familles',
    /deciderJourTpLot:\s*\['indispos', 'acces', 'gardes', 'planning'\]/.test(M));
  V('le serveur expose bien l\'action de lot', /if \(action === 'deciderJourTpLot'\)/.test(SRC_IND));
  V('…et chaque ligne passe par le MÊME chemin qu\'une décision isolée',
    /_routeRequete_\(\{ parameter: \{ payload: JSON\.stringify\(\{[\s\S]{0,120}action: 'deciderJourTp'/.test(SRC_IND));
  V('…un échec de ligne n\'arrête pas les autres', /catch \(eL\) \{[\s\S]{0,160}rates\+\+/.test(SRC_IND));
}


console.log('\n═══ PT35 · après un envoi, l\'écran se corrige SANS un appel de plus ═══');
{
  /* (23/08/2026) La copie rapide se rafraîchit ~1 min 45 après une écriture
     (trace LOGS). Deux mauvaises réponses : la relire tout de suite ferait
     revenir les demandes déjà tranchées ; relire le serveur coûterait 10 à
     20 s d'attente. La bonne : la réponse dit ligne par ligne ce qui est
     passé — on retire ces lignes, l'écran est juste instantanément. */
  const adm = fs.readFileSync('../admin.html', 'utf8');
  V('aucune relecture après l\'envoi', !/await tpcCharger\(/.test(adm.slice(adm.indexOf('async function tpcEnvoyer'))));
  V('les lignes traitées sont retirées d\'après le détail du serveur',
    /res\.detail \|\| \[\]/.test(adm) && /TPC\.demandes = TPC\.demandes\.filter/.test(adm));
  V('un refus retire toutes les demandes du jour', /passees\['refuser\|' \+ d\.jour/.test(adm));
  V('la copie rapide reste la source à l\'ouverture — c\'est elle qui est instantanée',
    /const m = await miroirRead\(\['pose_tp_'/.test(adm));
  V('le repli serveur ne sert que si la clé manque', /if \(!cles\.length\) \{\s*\n\s*const r = await api\(\{ action: 'getPoseTp' \}\)/.test(adm));
}

console.log(`\n${ko === 0 ? '✅' : '❌'} banc_pose_tp : ${ok} vérifications, ${ko} échec(s)`);
if (ko > 0) process.exit(1);
