// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_MIROIR = '2026-09-08.2';

/* ═══════════════════════════════════════════════════════════════════════
   MIROIR.GS — alimentation du miroir de lecture Cloudflare
   ═══════════════════════════════════════════════════════════════════════

   POURQUOI. Mesures du 03/08 : un appel Apps Script coûte 2,5 à 5 s quel
   que soit le travail serveur (compilation des ~575 Ko à CHAQUE requête,
   redirection 302, file d'attente par compte). Les pages qui LISENT via
   Apps Script ne peuvent donc jamais s'ouvrir vite. Le miroir Cloudflare
   sert les mêmes données en ~150 ms : ce fichier est le tuyau qui l'alimente.

   PRINCIPE. Apps Script reste le SEUL écrivain des données. Après chaque
   écriture réussie, il dépose une copie à jour chez Cloudflare (POST /push,
   jeton secret). En filet, une synchronisation complète horaire résorbe
   tout écart (envoi raté, modification à la main dans le classeur).

   SÉCURITÉ.
   - Le jeton d'écriture vit dans les PROPRIÉTÉS DU SCRIPT (clé
     MIROIR_PUSH_TOKEN), JAMAIS dans ce fichier ni dans le dépôt.
   - Les codes d'accès ne quittent jamais le script en clair : seules leurs
     empreintes SHA-256 sont déposées (clé `acces`), pour que le Worker
     authentifie sans détenir les codes.
   - Le code du SECRÉTARIAT n'est PAS déposé, même en empreinte : ce rôle
     n'a aucune lecture au miroir (règle de _routeRequete_ conservée), son
     empreinte n'y a donc aucun usage.
   - LISTE ROUGE RÉVISÉE le 17/08/2026 : PARAMETRES/CONFIG, Gmail et les
     journaux n'y transitent toujours JAMAIS. Le RELEVÉ LIBÉRAL, lui, y est
     désormais admis (clé `releve_liberal_{Y}`), sur décision d'Arthur.
     Motif : la page du suivi tombait par intermittence — elle était la
     dernière à ne parler qu'à Apps Script — et un échec s'y affichait
     « aucun relevé saisi », ce qui est un mensonge.
     Ce qui protège : la clé est réservée aux MEMBRES DU GROUPEMENT côté
     Worker (role mar + liberal), soit exactement la règle de l'action
     getReleveLiberal. Mêmes données, mêmes personnes, même code d'accès —
     seul le lieu de stockage change.

   JAMAIS BLOQUANT. Toute fonction de ce fichier avale ses erreurs : un
   miroir en panne ne doit JAMAIS faire échouer une écriture du portail.
   Le filet horaire rattrape ; le client, lui, se replie sur le circuit GAS.

   CONTRAT DES CLÉS (doit rester identique à CLE_VALIDE dans
   cloudflare/worker.js ; le Worker refuse toute clé hors liste) :
     acces, annees, secteurs, config_admin,
     planning_{Y}, affectations_{Y}, indispos_{Y}
   AJOUT 04/08 : clés `topos`, `staffs`, `veille`, `protocoles`, `annuaire`
   (tuiles du dashboard, enveloppes {success:true,…} stockées telles quelles).
   Pas d'accroche d'écriture pour elles : topos/protocoles vivent dans des
   dossiers Drive gérés à la main, veille via son déclencheur hebdo — la
   synchro HORAIRE est leur seule source de fraîcheur (délai assumé : ces
   contenus changent rarement). Décision vacances : getVacConfig est PAR MAR
   (quota, TP) et reste au GAS, appelé SANS bloquer l'affichage — pas de clé
   miroir.
   ═══════════════════════════════════════════════════════════════════ */

const MIROIR_URL = 'https://miroir.planningmedic.workers.dev';

/* Quelles écritures rafraîchissent quelles clés. Table SÉPARÉE de
   WRITE_ACTIONS_LOCK : savePlanningOverridesBatch, par exemple, est une
   écriture avec verrou dédié (code.gs) qui ne figure pas dans LOCK.
   Principe : pousser un peu trop large plutôt que trop étroit — une clé
   repoussée à l'identique ne coûte qu'un envoi, une clé oubliée coûte une
   donnée périmée servie à 23 MARs. */
/* (2026-08-04.5, AUDIT) Une famille = ce que l'action MODIFIE REELLEMENT.
   L'accroche tourne DANS la requete, avant la reponse : chaque famille en
   trop est du temps d'attente utilisateur. Constats de l'audit :
   - un lot de placements n'ecrit que PLANNING_OVERRIDES → config_admin seul
     (le fichier planning ne change qu'a la PUBLICATION) ;
   - setDailyStatus ecrit GARDES + le reflet INDISPOS, ne republie pas ;
   - la generation n'a pas encore publie → pas de famille planning.
   applyModification garde un perimetre large (action rare, doute documente
   sur la mise a jour du fichier). */
const MIROIR_APRES_ECRITURE = {
  publishPlanning:            ['planning', 'affectations', 'annees', 'config_admin', 'gardes', 'stats'],
  setDailyStatus:             ['gardes', 'indispos'],
  applyModification:          ['planning', 'config_admin', 'gardes', 'stats'],
  creerEchange:               ['echanges'],   // (13/08/2026) une demande créée → l'écran des 23 suit
  repondreEchange:            ['planning', 'config_admin', 'gardes', 'stats', 'echanges'],   // acceptation = écriture planning
  deleteOverride:             ['config_admin'],
  savePlanningOverridesBatch: ['config_admin'],
  generateGardes:             ['annees', 'acces', 'config_admin', 'gardes', 'stats'],   // (22/08) `acces` porte la phase TP : la tuile doit suivre la génération
  declareLiberal:             ['liberal'],   // (2026-08-05.9) un MAR déclare → le volet du comité suit
  deleteLiberal:              ['liberal'],
  // (17/08/2026) La bibliotheque de cotations types s'edite depuis une page :
  // ce qui est enregistre doit parvenir aux 19 sans attendre la synchro horaire.
  saveCotationType:           ['cotations_type'],
  deleteCotationType:         ['cotations_type'],
  archiveYear:                ['planning', 'affectations', 'annees', 'acces', 'config_admin', 'gardes', 'stats'],
  setActiveYear:              ['annees', 'acces', 'config_admin'],
  initYear:                   ['annees', 'config_admin'],
  // Affectations sectorielles
  saveAffectations:           ['affectations'],
  saveAffectationsMar:        ['affectations'],
  // Médecins et codes d'accès
  saveMedecin:                ['acces', 'config_admin'],
  resetCodeMar:               ['acces', 'config_admin'],
  addMedecinToGroupe:         ['config_admin'],
  saveConfig:                 ['acces', 'config_admin'],
  savePeriodes:               ['config_admin', 'vacances_admin'],
  saveGroupes:                ['config_admin', 'vacances_admin', 'ordre_vac'],
  // Indisponibilités (l'année de campagne et son état vivent dans `acces`)
  /* (23/08/2026) Un temps partiel s'écrit dans GARDES et republie le planning :
     les deux familles doivent suivre, sinon la grille du comité et le planning
     des 23 restent périmés jusqu'à la synchro horaire. */
  saveIndispos:               ['indispos', 'acces', 'gardes', 'planning'],
  deciderJourTp:              ['indispos', 'acces', 'gardes', 'planning'],
  deciderJourTpLot:           ['indispos', 'acces', 'gardes', 'planning'],
  saveIndisposBatch:          ['indispos', 'acces'],
  poserAbsenceLongue:         ['indispos', 'acces'],
  annulerAbsenceLongue:       ['indispos', 'acces'],
  clearIndisposYear:          ['indispos', 'acces'],
  setIndisposYear:            ['indispos', 'acces'],
  // (2026-08-08.1) Lu/★ par MAR : la marque suit sur les autres appareils
  // en ~1-2 min (accroche différée) ; l'écran qui a marqué est déjà à jour
  // (optimisme + file locale du dashboard).
  markVeille:                 ['veille_marques'],
};

/* ── POINT D'ACCROCHE — appelé par doGet (Indispos.gs) après le routage ──
   `e` : l'événement brut ; `outTexte` : la réponse déjà produite.
   Ne pousse que si l'action est une écriture connue ET que la réponse
   annonce un succès (une écriture refusée ne change rien au classeur).
   Coût pour les LECTURES : un lookup d'objet, ~0 ms. */
/* (2026-08-05.6) ACCROCHE DIFFEREE — mesure du 05/08 au matin : meme avec
   l'audit des familles (.5), la construction + l'envoi au miroir DANS la
   requete coutaient encore ~5 s a chaque ecriture (savePlanningOverridesBatch :
   6,9 s serveur, dont ~1,5-2 s d'ecriture reelle). Desormais la requete se
   contente de NOTER ce qu'il faudra pousser (fusion dans les proprietes du
   script, sous verrou) et de garantir UN declencheur unique : la reponse part
   tout de suite, le declencheur pousse dans la minute qui suit, la synchro
   horaire ramasse tout echec. Fraicheur MAR : ~1-2 min au lieu de ~1 —
   l'ecran qui vient d'ecrire relit de toute facon le circuit DIRECT. */
const MIROIR_CLE_ATTENTE = 'MIROIR_POUSSEES_EN_ATTENTE';

function miroirApresRequete_(e, outTexte) {
  try {
    const payload = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
    const familles = MIROIR_APRES_ECRITURE[payload.action];
    if (!familles) return;
    if (String(outTexte || '').indexOf('"success":true') === -1) return;
    const annee = Number(payload.year) || getActiveYear();
    _miroirNoterPoussee_(familles, annee);
    /* (23/08/2026) TRACE. Cette accroche était entièrement muette : quand une
       écriture ne rafraîchissait pas la copie rapide, rien ne permettait de
       savoir si elle avait été notée, avec quelle année, ni si la poussée
       avait eu lieu. Deux symptômes en production le 23/08 (alertes du comité
       qui reviennent au rechargement, tuile lente) sans aucune trace pour
       trancher. LOGS dit désormais la vérité. */
    logAction('miroir : ' + payload.action + ' → familles [' + familles.join(',') + '] année ' + annee
              + (Number(payload.year) ? '' : ' (ANNÉE ABSENTE du payload — repli sur l\'année active)'));
  } catch (err) { /* jamais bloquant */ }
}

/* Fusionne familles + annee dans la file d'attente persistee, sous verrou
   (deux ecritures paralleles ne s'ecrasent pas), et garantit le declencheur. */
function _miroirNoterPoussee_(familles, annee) {
  const verrou = LockService.getScriptLock();
  try { verrou.waitLock(5000); } catch (e) { /* sans verrou : on note quand meme */ }
  try {
    const props = PropertiesService.getScriptProperties();
    let attente = {};
    try { attente = JSON.parse(props.getProperty(MIROIR_CLE_ATTENTE) || '{}'); } catch (e) { attente = {}; }
    attente.familles = attente.familles || {};
    attente.annees = attente.annees || {};
    var etaitVide = !Object.keys(attente.familles).length;
    familles.forEach(function (f) { attente.familles[f] = true; });
    attente.annees[String(annee)] = true;
    props.setProperty(MIROIR_CLE_ATTENTE, JSON.stringify(attente));
  } finally {
    try { verrou.releaseLock(); } catch (e) {}
  }
  /* Declencheur verifie SEULEMENT quand la file etait vide : une note deja
     presente implique un declencheur en attente (ou un cas d'echec couvert
     par la synchro horaire). L'ecriture typique ne paie ainsi que la note
     (~100 ms), pas l'inventaire des declencheurs.
     ── INVENTAIRE DES FENETRES DE PERTE (audit du 05/08) — toutes bornees :
     l'ECRITURE DU CLASSEUR, elle, est TOUJOURS synchrone dans l'action ;
     seul le rafraichissement de la COPIE de lecture peut etre retarde.
     (a) echec d'ecriture de la note (quota props) → miroir rattrape par la
         synchro HORAIRE ; (b) verrou indisponible 5 s + deux notes
         simultanees → la derniere gagne, l'autre rattrapee par la synchro ;
     (c) echec de creation du declencheur → idem. Pire cas absolu : copie de
     lecture en retard d'UNE heure, donnees du classeur intactes. */
  /* (23/08/2026) BLOCAGE DÉFINITIF CORRIGÉ. Le déclencheur n'était armé que si
     la file était VIDE : l'idée était qu'une file non vide signifiait qu'un
     déclencheur existait déjà. Faux dès qu'une exécution meurt avant d'avoir
     purgé la file — dépassement de quota, temps limite, erreur non prévue.
     La file restait alors pleine POUR TOUJOURS, plus aucune note n'armait de
     déclencheur, et la copie rapide ne se rafraîchissait plus jamais seule.
     Constaté en production le 23/08 : notes prises à 16h15 et 16h16, aucune
     poussée derrière, alors que celle de 15h56 était passée.
     La condition juste n'est pas « la file était vide » mais « aucun
     déclencheur n'existe » — c'est le seul fait qui compte. */
  const deja = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'miroirRattrapage';
  });
  if (!deja) {
    try { ScriptApp.newTrigger('miroirRattrapage').timeBased().after(1000).create(); }
    catch (e) { try { logAction('miroir : déclencheur impossible — ' + e.message); } catch (e2) {} }
  }
}

/* Execute par le declencheur (~30-60 s apres la note) : pousse le cumul,
   se nettoie. Un echec ici n'est pas grave : la synchro horaire repasse. */
function miroirRattrapage() {
  // Supprimer NOS declencheurs d'abord : meme si la pousse echoue, pas d'orphelins.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'miroirRattrapage') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  const verrou = LockService.getScriptLock();
  let attente = null;
  try { verrou.waitLock(10000); } catch (e) {}
  try {
    const props = PropertiesService.getScriptProperties();
    try { attente = JSON.parse(props.getProperty(MIROIR_CLE_ATTENTE) || 'null'); } catch (e) { attente = null; }
    props.deleteProperty(MIROIR_CLE_ATTENTE);
  } finally {
    try { verrou.releaseLock(); } catch (e) {}
  }
  if (!attente || !attente.familles) return;
  const familles = Object.keys(attente.familles);
  const annees = Object.keys(attente.annees || {}).map(Number);
  if (!annees.length) annees.push(getActiveYear());
  const bilan = [];
  annees.forEach(function (y) {
    try {
      const r = miroirPousserFamilles_(familles, y, false);
      bilan.push(y + (r && r.success === false ? ' ÉCHEC : ' + (r.error || '?') : ' ok')
                 + (r && r.ecrites !== undefined ? ' — ' + r.ecrites + ' écrite(s)' : '')
                 + (r && r.listeEcrites ? ' [' + r.listeEcrites.join(' ') + ']' : '')
                 + (r && r.refusesWorker && r.refusesWorker.length
                    ? ' — ⚠ REFUSÉES PAR LE RELAIS : [' + r.refusesWorker.join(' ') + ']' : '')
                 + (r && r.inchangees ? ', ' + r.inchangees + ' inchangée(s)'
                    + (r.listeInchangees ? ' [' + r.listeInchangees.join(' ') + ']' : '') : ''));
    } catch (e) { bilan.push(y + ' ÉCHEC : ' + e.message); }
  });
  Logger.log('miroirRattrapage : ' + familles.join(',') + ' / annees ' + annees.join(','));
  logAction('miroir : poussée différée [' + familles.join(',') + '] → ' + bilan.join(' · '));
  /* Course rare : une ecriture a note PENDANT cette pousse (sa file n'etait
     pas vide → elle n'a pas cree de declencheur, et le notre est deja
     supprime). On re-arme pour elle. */
  try {
    if (PropertiesService.getScriptProperties().getProperty(MIROIR_CLE_ATTENTE)) {
      ScriptApp.newTrigger('miroirRattrapage').timeBased().after(1000).create();
    }
  } catch (e) { /* synchro horaire */ }
}

/* ── SYNCHRO COMPLÈTE — filet horaire + amorçage initial ─────────────────
   À lancer UNE FOIS à la main depuis l'éditeur Apps Script (Exécuter >
   miroirSyncComplet) pour remplir le miroir, puis automatiquement chaque
   heure via miroirInstallerDeclencheur(). */
function miroirSyncComplet() {
  try { if (typeof _bat_ === 'function') _bat_('miroirSyncComplet'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
  const familles = ['acces', 'annees', 'secteurs', 'config_admin',
                    'planning', 'affectations', 'indispos', 'tuiles',
                    'gardes', 'joursferies', 'stats', 'vacances_admin', 'mail', 'liberal',
                    'specialites', 'cotations_type', 'releve_liberal',
                    'veille_marques', 'ordre_vac', 'echanges', 'notifs'];
  try { PropertiesService.getScriptProperties().deleteProperty(MIROIR_CLE_ATTENTE); } catch (e) {}   // la synchro pousse un sur-ensemble : la note devient caduque
  /* (2026-08-20.1) UNE FOIS PAR JOUR, tout repart sans condition. Le filtre
     différentiel se fie à une mémoire locale ; si elle ment (miroir vidé à la
     main, écriture perdue chez Cloudflare), une donnée resterait figée sans
     que rien ne le signale. Le passage de 4 h efface cette mémoire : ~29
     écritures, une fois par nuit, contre l'assurance qu'aucun écart ne dure
     plus de 24 h. */
  try { if (new Date().getHours() === 4) miroirOublierEmpreintes(); } catch (e) {}
  const res = miroirPousserFamilles_(familles, getActiveYear(), true);   // synchro : toutes les annees consultables
  Logger.log('miroirSyncComplet : ' + JSON.stringify(res));
  return res;
}

/* Installe le déclencheur horaire (idempotent : supprime d'abord les
   déclencheurs existants de miroirSyncComplet pour ne jamais en empiler). */
/* (2026-08-05.8) MODIFICATIONS MANUELLES DU CLASSEUR. Constat du 05/08 :
   une correction faite directement dans le Google Sheet n'était vue par
   personne — aucune requête ne part, donc aucune note miroir ; la copie de
   lecture ne se réalignait qu'à la synchro HORAIRE (attente jusqu'à 1 h,
   affichages incohérents entre pages). Ce déclencheur écoute les éditions du
   classeur et pose la MÊME note que les écritures du portail : la copie suit
   dans la minute. Le planning PUBLIÉ, lui, ne bouge pas — c'est le rôle du
   bouton « Publier », qui reste un acte volontaire du comité. */
/* (2026-08-06.11) Liste établie par INVENTAIRE : pour chaque famille du
   miroir, on est remonté à l'onglet qui l'alimente réellement, au lieu de
   lister les onglets « qui viennent à l'esprit ». Trois manquaient —
   AFFECTATIONS (les cases à pourvoir), STATS_GARDES (l'équité et la dette),
   CS_TEMPLATE et SEUILS (modèle de consultations, bornes de tension) : une
   correction manuelle y attendait la synchro HORAIRE sans que rien ne le dise.
   Toute nouvelle famille du miroir impose de revoir cette table. */
const MIROIR_ONGLETS_SUIVIS = {
  GARDES:       ['gardes', 'indispos', 'stats'],   // statuts et gardes
  STATS_GARDES: ['gardes', 'stats'],               // équité de référence et dette
  INDISPOS:     ['indispos'],
  NOTIFS_JOURNAL: ['notifs'],                      // (23/08 — cloche) une ligne retirée à la main : la copie suit
  MEDECINS:     ['config_admin', 'annees', 'acces'],
  SECTEURS:     ['secteurs'],
  SPECIALITES:  ['specialites'],                   // (17/08/2026) page de cotation
  COTATIONS_TYPE: ['cotations_type'],              // (17/08/2026) page de cotation
  AFFECTATIONS: ['affectations', 'config_admin'],  // détermine les cases à pourvoir
  PLANNING_OVERRIDES: ['config_admin'],
  CS_TEMPLATE:  ['config_admin'],                  // modèle de consultations
  SEUILS:       ['config_admin'],                  // bornes de la carte de tension
  LIBERAL:      ['liberal'],
  /* ⚠️ ORDRE SIGNIFICATIF : 'LIBERAL_CA_2026' commence par 'LIBERAL_' et
     correspond donc AUSSI à l'entrée ci-dessus. La boucle garde la DERNIÈRE
     correspondance : cette ligne doit rester APRÈS 'LIBERAL', sans quoi une
     saisie du relevé rafraîchirait le volet du comité au lieu du relevé. */
  LIBERAL_CA:   ['releve_liberal'],                // (17/08/2026) saisie mensuelle du relevé
  PERIODES_VAC: ['vacances_admin', 'stats'],
  GROUPES_VAC:  ['vacances_admin', 'ordre_vac'],
  VEILLE_MARQUES: ['veille_marques'],              // (2026-08-08.1) correction manuelle d'une marque
  ECHANGES:     ['echanges'],                      // (13/08/2026) correction manuelle d'une demande
};

function miroirSurEdition(e) {
  try {
    const nom = String((e && e.range && e.range.getSheet().getName()) || '').trim().toUpperCase();
    let familles = null, annee = getActiveYear();
    Object.keys(MIROIR_ONGLETS_SUIVIS).forEach(function (prefixe) {
      if (nom === prefixe || nom.indexOf(prefixe + '_') === 0) {
        familles = MIROIR_ONGLETS_SUIVIS[prefixe];
        const m = nom.match(/_(\d{4})$/);            // GARDES_2027, INDISPOS_2026…
        if (m) annee = Number(m[1]);
      }
    });
    if (!familles) return;                            // onglet non concerné : rien à faire
    _miroirNoterPoussee_(familles, annee);            // même file que les écritures du portail
  } catch (err) { /* jamais bloquant pour l'utilisateur du classeur */ }
}

function miroirInstallerDeclencheur() {
  // (2026-08-05.8) Écoute des éditions manuelles, en plus du filet horaire.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'miroirSurEdition') ScriptApp.deleteTrigger(t);
  });
  try {
    ScriptApp.newTrigger('miroirSurEdition')
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
    Logger.log('Déclencheur d\'édition installé sur miroirSurEdition.');
  } catch (e) { Logger.log('Déclencheur d\'édition NON installé : ' + e.message); }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'miroirSyncComplet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('miroirSyncComplet').timeBased().everyHours(1).create();
  Logger.log('Déclencheur horaire installé sur miroirSyncComplet.');
}

/* ── CONSTRUCTION + ENVOI ────────────────────────────────────────────────
   Traduit des familles logiques en clés concrètes, construit chaque valeur,
   pousse le tout en UN appel HTTP. Une famille qui échoue à se construire
   est simplement omise (le filet horaire retentera). */
/* (2026-08-04.5) `toutesAnnees` : true = synchro horaire (couverture de
   toutes les annees consultables) ; false/absent = accroche d'ecriture —
   SEULE l'annee concernee est reconstruite. C'etait la racine des ecritures
   lentes du 04/08 : chaque pose reconstruisait gardes+stats+planning de
   TOUTES les annees, dans la requete, avant de repondre. */
function miroirPousserFamilles_(familles, annee, toutesAnnees) {
  /* (14/08/2026) Les enveloppes se bâtissent en relisant le classeur DANS la
     même exécution que les écritures de l'action : sans flush, la relecture
     peut être servie d'avant. Un seul flush ici protège toutes les familles
     (gardes, stats, echanges, indispos…). */
  try { SpreadsheetApp.flush(); } catch (e) {}
  const items = {};
  const uniq = {};
  familles.forEach(function (f) { uniq[f] = true; });

  if (uniq['acces'])        _miroirAjoute_(items, 'acces',        _miroirConstruireAcces_);
  if (uniq['annees'])       _miroirAjoute_(items, 'annees',       _miroirConstruireAnnees_);
  if (uniq['secteurs'])     _miroirAjoute_(items, 'secteurs',     function () { return getSecteurs(); });
  /* (17/08/2026) Les deux listes de la page de cotation. Elles bougent
     rarement (un code de specialite, une cotation type ajoutee) mais etaient
     redemandees a Apps Script a CHAQUE ouverture de la page. */
  if (uniq['specialites'])     _miroirAjoute_(items, 'specialites',     function () { return getSpecialites(); });
  /* (17/08/2026) Relevé du groupement. ⚠️ ANNÉE CIVILE, PAS L'ANNÉE ACTIVE :
     le relevé de l'administration est calendaire, alors que l'année active du
     planning bascule dès l'automne (même piège que les onglets LIBERAL_{Y},
     corrigé le 22/07). En janvier, l'onglet de la nouvelle année n'existe pas
     encore : getReleveLiberal rend alors une liste vide, ce qui est juste.
     L'enveloppe complète est déposée telle quelle : la page consomme
     exactement ce que lui rendait l'action, sans transformation. */
  if (uniq['releve_liberal']) {
    const anneeCivile = new Date().getFullYear();
    _miroirAjouteEnveloppe_(items, 'releve_liberal_' + anneeCivile, function () {
      return getReleveLiberal({ year: anneeCivile });
    });
  }
  if (uniq['cotations_type'])  _miroirAjoute_(items, 'cotations_type',  function () { return getCotationsType(); });
  if (uniq['config_admin']) _miroirAjoute_(items, 'config_admin', function () { return _miroirConstruireConfigAdmin_(annee); });

  if (uniq['planning'] || uniq['affectations']) {
    /* (03/08/2026, correctif) TOUTES les annees consultables, pas « active
       + N+1 ». Constate en reel : annee active 2027, selecteur proposant
       2026 → planning_2026 jamais depose au miroir, repli GAS a chaque
       bascule d'annee. Source de la liste : le meme balayage que le
       selecteur (_miroirConstruireAnnees_ : GARDES_{Y} actifs + archives) ;
       chaque annee n'est poussee que si son fichier existe sur le Drive
       (_miroirAjouteFichierDrive_ saute silencieusement les absents). */
    const annees = [];
    if (toutesAnnees) {
      try {
        _miroirConstruireAnnees_().annees.forEach(function (a) { annees.push(Number(a.annee)); });
      } catch (e) { /* repli ci-dessous : au minimum l'annee courante */ }
      try { if (_jsonFilesByName_('planning_' + (annee + 1) + '.json').length > 0 && annees.indexOf(annee + 1) === -1) annees.push(annee + 1); } catch (e) {}
    }
    if (annees.indexOf(annee) === -1) annees.push(annee);
    annees.forEach(function (y) {
      if (uniq['planning'])     _miroirAjouteFichierDrive_(items, 'planning_' + y,     'planning_' + y + '.json');
      if (uniq['affectations']) _miroirAjouteFichierDrive_(items, 'affectations_' + y, 'affectations_' + y + '.json');
    });
  }

  if (uniq['echanges']) {
    // (13/08/2026 — phase 3) Même contrat que les tuiles : enveloppe stockée
    // telle quelle, jamais poussée en échec.
    _miroirAjouteEnveloppe_(items, 'echanges', function () { return getEchangesEnveloppe(); });
  }

  if (uniq['notifs']) {
    /* (23/08/2026 — cloche) Le journal des notifications, 30 jours, groupé
       par destinataire. UNE clé pour tous : une écriture KV par événement,
       pas 23 — le dashboard n'affiche que les entrées de son MAR (et '*'). */
    _miroirAjouteEnveloppe_(items, 'notifs', function () { return _miroirConstruireNotifs_(); });
  }

  if (uniq['tuiles']) {
    // Enveloppes {success:true,…} stockées TELLES QUELLES : le client les
    // consomme comme une réponse apiPost. Garde : jamais pousser un échec.
    _miroirAjouteEnveloppe_(items, 'topos',      function () { return listTopos(); });
    _miroirAjouteEnveloppe_(items, 'staffs',     function () { return listStaffs(); });
    _miroirAjouteEnveloppe_(items, 'veille',     function () { return getVeille(); });
    _miroirAjouteEnveloppe_(items, 'protocoles', function () { return listProtocoles(); });
    _miroirAjouteEnveloppe_(items, 'annuaire',   function () { return listAnnuaire(); });
  }

  if (uniq['gardes'] || uniq['joursferies'] || uniq['stats']) {
    // Memes annees que le planning : toutes les annees consultables.
    const anneesOutils = [];
    if (toutesAnnees) {
      try { _miroirConstruireAnnees_().annees.forEach(function (a) { anneesOutils.push(Number(a.annee)); }); } catch (e) {}
    }
    if (anneesOutils.indexOf(annee) === -1) anneesOutils.push(annee);
    anneesOutils.forEach(function (y) {
      if (uniq['gardes'])      _miroirAjouteEnveloppe_(items, 'gardes_' + y,      function () { return _miroirConstruireGardes_(y); });
      /* (CORRECTIF 23/08/2026) `getJoursFeries` renvoie un ENSEMBLE, qui n'a pas
         de `.concat` : cette cle levait une exception depuis sa creation et
         n'a donc JAMAIS ete poussee — les ecrans du comite retombaient en
         silence sur Apps Script pour connaitre les feries. Meme famille de
         defaut que l'ecran de pose du 23/08 : une LISTE, toujours. */
      if (uniq['joursferies']) _miroirAjouteEnveloppe_(items, 'joursferies_' + y, function () {
        const l = Array.from(getJoursFeries(y)).concat(Array.from(getJoursFeries(y + 1)));
        return { success: true, joursFeries: l.sort(), year: y };
      });
      if (uniq['stats'])       _miroirAjouteEnveloppe_(items, 'stats_' + y,       function () { return _miroirConstruireStats_(y); });
      /* (2026-08-13.2) INSTANTANE D'EQUITE. computeStatsLive recompte les gardes
         REELLEMENT faites sur toute l'annee, echanges et dons compris. C'est le
         calcul le plus lourd du portail : mesure du 13/08, plusieurs dizaines de
         secondes ressenties cote MAR, et c'est lui qui rend le diagnostic long.
         Le faire ici, c'est le payer UNE fois pour les 23, dans le declencheur
         differe — jamais dans la requete d'un MAR, jamais dans l'ecriture du
         comite (celle-ci se contente de noter la poussee depuis le 05/08).
         Memes declencheurs que la famille stats : un echange de garde republie
         donc l'instantane dans la minute. Contrepartie assumee : l'ecran n'est
         plus exact a la seconde mais a la minute — le lien « recalculer » de la
         page reste la pour qui veut la valeur fraiche. */
      if (uniq['stats'])       _miroirAjouteEnveloppe_(items, 'equite_live_' + y, function () {
        return { success: true, stats: computeStatsLive(y) };
      });
    });
  }

  if (uniq['mail']) {
    /* (2026-08-05.7) Compteur de non-lus : un NOMBRE seul, jamais d'objet ni
       d'expediteur. Il vient du miroir pour que le badge s'affiche a
       l'ouverture SANS aucun appel Google — et pour qu'une panne Gmail ne
       laisse plus le comite aveugle (mesure du 05/08 : mailNonLus en echec a
       20 s, badge muet). La LISTE des messages, elle, reste a la demande. */
    _miroirAjouteEnveloppe_(items, 'mail_nonlus', function () {
      const lab = Gmail.Users.Labels.get('me', 'INBOX');
      return { success: true, nonLus: Number(lab.messagesUnread || 0), maj: new Date().toISOString() };
    });
  }

  if (uniq['liberal']) {
    /* (2026-08-05.9) Activité libérale du jour, pour le volet du panneau de
       placement. Contenu STRICTEMENT limité à ce que l'écran affiche : qui
       opère, dans quel secteur, quelle chirurgie. AUCUN montant — ils restent
       au classeur (voir listLiberalJour, portail.gs 2026-08-05.2).
       Clé admin seule. Objectif : le volet s'affiche instantanément au lieu
       des 3,8-9,6 s mesurés le 05/08. */
    _miroirAjouteEnveloppe_(items, 'liberal_' + annee, function () {
      return _miroirConstruireLiberal_(annee);
    });
  }

  if (uniq['liberal']) {
    /* (17/08/2026) MES DECLARATIONS. La cle liberal_{Y} existante est celle du
       COMITE : volontairement allegee (ni identifiant, ni montant, ni
       specialite — decision du 05/08). La page « Mes interventions declarees »
       a besoin de tout cela : identifiant pour supprimer, dates, specialite,
       montants. D'ou une cle SEPAREE, structuree par MAR comme les indispos,
       que le Worker filtre a ses propres lignes. Le comite garde la sienne,
       allegee : il n'a pas besoin des montants. */
    _miroirAjoute_(items, 'liberal_mar_' + annee, function () {
      return _miroirConstruireLiberalMar_(annee);
    });
  }

  if (uniq['vacances_admin']) {
    _miroirAjouteEnveloppe_(items, 'vacances_admin', _miroirConstruireVacancesAdmin_);
  }

  if (uniq['indispos']) {
    const iy = (function () { try { return getIndisposYear(); } catch (e) { return annee; } })();
    _miroirAjoute_(items, 'indispos_' + iy, function () { return _miroirConstruireIndispos_(iy); });
    /* (LOT 3 · 22/08/2026) L'annee de la PHASE TP aussi : une pose de TP ecrit
       dans INDISPOS_{phase} qui peut differer de l'annee de campagne (hors
       campagne, getIndisposYear se replie sur l'annee active). Sans cette
       ligne, la copie rapide de l'ecran de pose resterait figee apres chaque
       enregistrement — le cousin miroir du piege d'annee du 22/08. */
    try {
      const phI = _phaseTp_();
      (phI.annees || []).forEach(function (yPh) {
        if (phI.actif && yPh !== iy) {
          _miroirAjoute_(items, 'indispos_' + yPh, function () { return _miroirConstruireIndispos_(yPh); });
        }
      });
    } catch (ePh) { /* phase indisponible : la cle de campagne suffit */ }
  }

  if (uniq['gardes'] || uniq['indispos']) {
    /* (LOT 3 · 22/08/2026) La cle de l'ecran de pose des TP : effectifs par
       jour + blocages par MAR + quotas (contenu : _construirePoseTp_,
       Indispos.gs). Rebatie des que gardes OU indispos bougent — les deux
       nourrissent l'effectif. Poussee pour l'annee active ET la suivante :
       hors phase, le constructeur renvoie { ferme: true }, empreinte stable
       (une ecriture KV une seule fois), et la cle s'auto-nettoie quand
       GARDES_{Y} est supprime pour regenerer. */
    [annee, annee + 1].forEach(function (yP) {
      _miroirAjouteEnveloppe_(items, 'pose_tp_' + yP, function () { return _construirePoseTp_(yP); });
    });
  }

  if (uniq['ordre_vac']) {
    /* (2026-08-13.1) Ordre de passage des vacances, pour l'annee en cours et la
       suivante. Copie COMMUNE : elle ne contient aucun rang personnel — la page
       cherche son propre identifiant dans les listes ordonnees.
       Pourquoi au miroir : le bandeau de « Mes conges » attendait un
       aller-retour Apps Script a chaque ouverture. Ici il voyage dans le MEME
       appel que le planning, a l'ouverture du portail — aucune requete de plus.
       Les annees sont FIGEES a la poussee : la synchro horaire les reactualise
       au plus tard une heure apres le 1er janvier, et la page compare de toute
       facon les annees recues a celles qu'elle attend. */
    _miroirAjoute_(items, 'ordre_vac', function () {
      const y = new Date().getFullYear();
      const r = getOrdreVacances(null, [y, y + 1]);
      return {
        annees: (r.annees || []).map(function (a) {
          return { annee: a.annee, groupes: a.groupes, periodes: a.periodes };
        }),
        t: Date.now(),
      };
    });
  }

  if (uniq['veille_marques']) {
    // (2026-08-08.1) Meme format que les indispos : {parMar:{ID:…}}, filtré
    // par le Worker — chacun ne reçoit que ses marques, admin compris.
    _miroirAjoute_(items, 'veille_marques', function () {
      return { parMar: _veilleMarquesParMar(), t: Date.now() };
    });
  }

  /* (2026-08-09.1) OUBLI DES ANNEES RETIREES — voir _miroirPurgerAnnees_.
     UNIQUEMENT en synchro complete : une accroche d'ecriture ne connait qu'une
     annee et n'a aucune vue d'ensemble, elle n'a pas a decider d'un effacement. */
  var _purge = null;
  if (toutesAnnees) {
    try { _purge = _miroirPurgerAnnees_(items, annee); }
    catch (e) { _purge = { refus: 'exception : ' + e.message }; }
  }

  if (!Object.keys(items).length) return { success: false, error: 'aucune clé construite' };
  const _res = _miroirEnvoyer_(items);
  if (_purge) _res.purge = _purge;
  return _res;
}

/* ═══ COPIE DES DOCUMENTS (topos et protocoles) — 2026-08-10.1 ═══════════
   POURQUOI. Servir un PDF par Apps Script est le geste le plus cher du
   portail : mesure du 08/08, `getProtocole` 6,1 s et `getTopo` 11,5 s,
   quand tout le reste de la page arrive du miroir en 100-270 ms. C'est
   50 a 100 fois plus cher que n'importe quel autre geste, et c'est le seul
   appel lourd que 23 MARs peuvent empiler — d'ou la consigne actuelle de ne
   JAMAIS faire ouvrir un document collectivement en reunion.

   CE QUE FAIT CETTE TACHE. Une fois par heure, elle depose au miroir UN
   document dont la date de modification a change depuis sa derniere copie.
   Un seul par passage : encoder puis transmettre un PDF de plusieurs Mo est
   long, et cette tache ne doit jamais devenir celle qui sature le quota
   quotidien de declencheurs (90 min/jour sur un compte gmail — voir
   ROADMAP). Au premier lancement : 17 documents = 17 heures. Ensuite elle
   ne trouve plus rien et sort en une seconde.

   CE QU'ELLE NE FAIT PAS. Elle ne touche pas aux pages : tant que l'etape 3
   n'est pas livree, `getTopo`/`getProtocole` restent le chemin de lecture.
   Les copies sont deposees et inutilisees — donc aucune regression possible.

   FORME DE LA VALEUR. STRICTEMENT celle que renvoie `getTopo` aujourd'hui
   ({success, name, mimeType, dataB64}), pour que la bascule de l'etape 3 ne
   change QUE la source, jamais le traitement.

   POIDS. Inventaire du 10/08 : 17 PDF, 30,6 Mo, le plus lourd 5,7 Mo. La
   contrainte n'est pas le stockage (25 Mo par cle) mais la MEMOIRE du
   Worker (128 Mo) : recevoir un envoi le fait lire, analyser et controler,
   soit ~3 copies en memoire. A 8 Mo de PDF (10,7 Mo encodes) on reste sous
   la moitie ; au-dela on s'en approche. D'ou le plafond ci-dessous, qui
   ECARTE le document sans jamais le casser : il reste servi par l'ancien
   chemin, et le Diagnostic le signale. */
const DOC_DOSSIERS      = [TOPOS_FOLDER, PROTOS_FOLDER];   // definis dans portail.gs
const DOC_POIDS_MAX     = 8 * 1024 * 1024;                 // au-dela : laisse sur le chemin Apps Script
const DOC_PROP_DATES    = 'MIROIR_DOCS_DATES';             // { idDrive: 'AAAA-MM-JJTHH:MM:SSZ' }
const DOC_PAR_PASSAGE   = 1;                               // un document par heure

/* Recense les PDF des deux dossiers (racine + sous-dossiers, 2 niveaux :
   Topos = 1 niveau, Protocoles = specialite puis sous-dossier). Renvoie
   { ok:true, docs:[{id,nom,maj,taille}] } ou { ok:false } si UN dossier est
   injoignable — dans ce cas on ne conclut RIEN (regle 3 : « je n'ai pas pu
   lire » n'est pas « ca n'existe plus »). */
function _docsRecenser_() {
  const docs = [];
  let ok = true;
  const ajouterFichiers = function (dossier) {
    const it = dossier.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      const nom = String(f.getName());
      if (f.getMimeType() !== 'application/pdf' && !/\.pdf$/i.test(nom)) continue;
      docs.push({ id: f.getId(), nom: nom, taille: f.getSize(),
                  maj: Utilities.formatDate(f.getLastUpdated(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'") });
    }
  };
  DOC_DOSSIERS.forEach(function (nomDossier) {
    try {
      const it = DriveApp.getFoldersByName(nomDossier);
      if (!it.hasNext()) return;                      // dossier absent : normal si jamais cree
      const racine = it.next();
      ajouterFichiers(racine);
      const n1 = racine.getFolders();
      while (n1.hasNext()) {
        const sous = n1.next();
        ajouterFichiers(sous);
        const n2 = sous.getFolders();                 // Protocoles : specialite > sous-dossier
        while (n2.hasNext()) ajouterFichiers(n2.next());
      }
    } catch (e) { ok = false; }
  });
  return { ok: ok, docs: docs };
}

function _docsDatesLues_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(DOC_PROP_DATES) || '{}'); }
  catch (e) { return {}; }
}
function _docsDatesEcrites_(obj) {
  /* Garde-fou de taille : une propriete est plafonnee a 9 Ko. ~60 octets par
     entree → ~150 documents. Au-dela on ne garde que les plus recentes, quitte
     a recopier les plus anciennes une fois de trop (sans dommage). */
  let txt = JSON.stringify(obj);
  if (txt.length > 8000) {
    const entrees = Object.keys(obj).map(function (k) { return [k, obj[k]]; })
      .sort(function (a, b) { return a[1] < b[1] ? 1 : -1; }).slice(0, 100);
    const reduit = {};
    entrees.forEach(function (e) { reduit[e[0]] = e[1]; });
    txt = JSON.stringify(reduit);
  }
  PropertiesService.getScriptProperties().setProperty(DOC_PROP_DATES, txt);
}

/* Tache horaire. Renvoie un compte rendu, ne leve jamais : un echec de copie
   ne doit pas empecher le passage suivant. */
function miroirDocuments() {
  try { if (typeof _bat_ === 'function') _bat_('miroirDocuments'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
  const rec = _docsRecenser_();
  if (!rec.ok) {
    const m = { refus: 'un dossier de documents est injoignable — aucune copie, aucun effacement' };
    Logger.log('miroirDocuments : ' + JSON.stringify(m));
    return m;
  }

  const dates = _docsDatesLues_();
  const vus = {};
  const trop = [];
  const aFaire = [];
  rec.docs.forEach(function (d) {
    vus[d.id] = true;
    if (d.taille > DOC_POIDS_MAX) { trop.push(d.nom + ' (' + Math.round(d.taille / 1048576) + ' Mo)'); return; }
    if (dates[d.id] !== d.maj) aFaire.push(d);
  });

  /* Effacement des documents disparus du Drive (ou devenus trop lourds).
     Meme principe que la purge des annees : on n'efface que ce dont on est
     SUR qu'il n'a plus lieu d'etre, le recensement ayant reussi. */
  const items = {};
  const effaces = [];
  Object.keys(dates).forEach(function (id) {
    if (!vus[id]) { items['doc_' + id] = null; effaces.push(id); }
  });

  const copies = [];
  const erreurs = [];
  aFaire.slice(0, DOC_PAR_PASSAGE).forEach(function (d) {
    try {
      const blob = DriveApp.getFileById(d.id).getBlob();
      items['doc_' + d.id] = JSON.stringify({
        success: true,
        name: d.nom,
        mimeType: blob.getContentType() || 'application/pdf',
        dataB64: Utilities.base64Encode(blob.getBytes()),
      });
      copies.push(d);
    } catch (e) { erreurs.push(d.nom + ' : ' + e.message); }
  });

  /* (banc, 10/08) Ne JAMAIS renvoyer « rien a faire » quand une copie a
     echoue : le compte rendu serait rassurant a tort, et l'echec invisible.
     `erreurs` est toujours present dans le retour. */
  if (!Object.keys(items).length) {
    const m = { rien: !erreurs.length, total: rec.docs.length, ecartes: trop,
                erreurs: erreurs, copies: [], effaces: 0,
                restants: Math.max(0, aFaire.length - copies.length) };
    Logger.log('miroirDocuments : ' + JSON.stringify(m));
    return m;
  }

  const env = _miroirEnvoyer_(items);
  if (env && env.success) {
    copies.forEach(function (d) { dates[d.id] = d.maj; });
    effaces.forEach(function (id) { delete dates[id]; });
    try { _docsDatesEcrites_(dates); } catch (e) { erreurs.push('dates non enregistrees : ' + e.message); }
  }

  const m = {
    copies: copies.map(function (d) { return d.nom; }),
    effaces: effaces.length,
    restants: Math.max(0, aFaire.length - copies.length),
    ecartes: trop,
    erreurs: erreurs,
    envoi: env && env.success,
  };
  Logger.log('miroirDocuments : ' + JSON.stringify(m));
  return m;
}

/* Installe le declencheur horaire (idempotent). A lancer UNE FOIS a la main.
   Decale volontairement de miroirSyncComplet : deux taches lourdes qui
   partent ensemble se disputeraient la file d'execution. */
function miroirDocumentsInstallerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'miroirDocuments') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('miroirDocuments').timeBased().everyHours(1).create();
  Logger.log('Declencheur horaire installe sur miroirDocuments.');
}

/* ── OUBLI DES ANNEES RETIREES (2026-08-09.1) ────────────────────────────
   POURQUOI. Le miroir ne savait pas OUBLIER. `_miroirAjoute_`,
   `_miroirAjouteEnveloppe_` et `_miroirAjouteFichierDrive_` omettent la cle
   quand la source manque : elle n'est ni mise a jour, ni supprimee — elle
   reste servie telle quelle, sans fin. Constate le 09/08 : supprimer les
   onglets et les JSON 2027 ne retirait pas `planning_2027` du miroir, et les
   23 MARs auraient continue de voir des gardes fictives dans « prochaine
   garde » et « mes conges » — d'autant que dashboard.html demande
   `planning_{active+1}` a CHAQUE ouverture depuis la v1.30.2 (le seuil
   « des octobre » a saute le 08/08).

   PRINCIPE. Separer deux questions que le code confondait :
     « je n'ai pas reussi a lire »  → garder l'ancienne valeur (inchange) ;
     « cette donnee n'a plus lieu d'etre » → l'effacer.
   La seconde se tranche sur la STRUCTURE (quels onglets GARDES_{Y} existent),
   jamais sur le succes d'une lecture de donnees. Lister des onglets ne peut
   pas echouer a moitie : soit le classeur s'ouvre, soit il ne s'ouvre pas.

   GARDE-FOUS (un effacement automatique porte sur ce que lisent 23 MARs) :
     1. seules les cles PAR ANNEE sont effacables — jamais une liste commune
        (topos, protocoles, annuaire, secteurs, acces…) ;
     2. si le balayage d'UN des deux classeurs echoue, on n'efface RIEN ;
     3. l'annee active et l'annee de campagne ne sont jamais effacees, meme
        absentes du balayage ;
     4. plafond : au-dela de MIROIR_PURGE_MAX_ANNEES annees d'un coup, refus
        et trace — une annee qui sort est normal, cinq est un defaut.
   Envoyer `null` sur une cle deja absente est sans effet cote Worker. */
/* La fenetre de balayage part de la PLUS ANCIENNE annee reellement connue
   (jamais d'un nombre fixe : le projet date de 2026, remonter 5 ans en
   arriere designait 2021-2023, qui n'ont jamais existe — sept candidates
   pour un plafond de trois, donc refus systematique et fonction inerte.
   Defaut trouve au banc le 09/08, invisible en lecture). */
const MIROIR_PURGE_APRES       = 2;   // annees balayees au-dela de l'annee courante
const MIROIR_PURGE_MAX_ANNEES  = 3;   // plafond de securite par passe
/* (16/08/2026) `equite_live_` manquait à cette liste : la clé est poussée PAR
   ANNÉE depuis le 13/08 (instantané d'équité), donc elle survivait au retrait
   d'une année — exactement le défaut du 09/08, revenu par une famille ajoutée
   depuis. Toute nouvelle clé portant une année DOIT entrer ici le jour même,
   sinon elle reste servie indéfiniment. Le banc compare cette liste aux clés
   réellement construites par année dans _miroirConstruire_ : il refuse qu'une
   famille échappe à l'oubli. */
const MIROIR_CLES_PAR_ANNEE    = ['planning_', 'affectations_', 'indispos_',
                                  'gardes_', 'stats_', 'equite_live_',
                                  'joursferies_', 'liberal_', 'liberal_mar_'];
/* (17/08/2026) 'liberal_mar_' ajoute ICI en meme temps que la cle elle-meme.
   Le banc l'a exige : toute cle datee par annee doit figurer dans les cles
   effacables, sinon elle survit au menage de fin d'annee — c'est exactement
   ce qui etait arrive a 'equite_live_', restee dehors depuis sa creation. */

/* Balayage STRUCTUREL des deux classeurs. `complet` = les deux ont repondu.
   Volontairement distinct de `_miroirConstruireAnnees_` : celui-ci tolere
   l'echec en silence (c'est bon pour un selecteur, jamais pour un effacement). */
function _miroirAnneesAttendues_() {
  const vues = {};
  let complet = true;
  const balaye = function (ouvrir) {
    try {
      ouvrir().getSheets().forEach(function (sh) {
        const m = String(sh.getName()).match(/^GARDES_(\d{4})$/);
        if (m) vues[Number(m[1])] = true;
      });
    } catch (e) { complet = false; }
  };
  balaye(function () { return SpreadsheetApp.getActiveSpreadsheet(); });
  balaye(function () { return SpreadsheetApp.openById(ARCHIVE_SS_ID); });
  return { annees: vues, complet: complet };
}

/* Ajoute a `items` les cles a effacer (valeur null). Renvoie un compte rendu
   destine au journal — jamais une exception : le ménage ne doit pas empecher
   la poussee. */
function _miroirPurgerAnnees_(items, annee) {
  const att = _miroirAnneesAttendues_();
  if (!att.complet) return { refus: 'balayage incomplet (classeur inaccessible) — aucun effacement' };

  const gardees = {};
  Object.keys(att.annees).forEach(function (y) { gardees[Number(y)] = true; });
  gardees[Number(annee)] = true;                                   // garde-fou 3
  try { gardees[Number(getActiveYear())] = true; } catch (e) {}
  try { const iy = getIndisposYear(); if (iy) gardees[Number(iy)] = true; } catch (e) {}

  const connues = Object.keys(att.annees).map(Number);
  if (!connues.length) {
    return { refus: 'aucun onglet GARDES_{Y} dans les deux classeurs — structure anormale, aucun effacement' };
  }

  const base = Number(annee) || new Date().getFullYear();
  const debut = Math.min.apply(null, connues.concat([base]));
  const aEffacer = [];
  for (let y = debut; y <= base + MIROIR_PURGE_APRES; y++) {
    if (!gardees[y]) aEffacer.push(y);
  }
  if (aEffacer.length > MIROIR_PURGE_MAX_ANNEES) {
    return { refus: aEffacer.length + ' annees a effacer (plafond ' + MIROIR_PURGE_MAX_ANNEES
                    + ') — aucun effacement, verifier le classeur', annees: aEffacer };
  }

  const cles = [];
  aEffacer.forEach(function (y) {
    MIROIR_CLES_PAR_ANNEE.forEach(function (prefixe) {
      const cle = prefixe + y;
      if (!(cle in items)) { items[cle] = null; cles.push(cle); }   // jamais ecraser une cle construite
    });
  });
  return { annees: aEffacer, cles: cles.length };
}

/* Construit une valeur et l'ajoute aux items sous forme de chaîne JSON.
   Échec silencieux : la clé est omise, jamais poussée corrompue. */
function _miroirAjoute_(items, cle, construire) {
  try {
    const v = construire();
    if (v !== null && v !== undefined) items[cle] = JSON.stringify(v);
  } catch (err) { /* omise ; filet horaire */ }
}

/* Enveloppe d'action ({success:true,…}) : poussée telle quelle, mais JAMAIS
   si l'action a échoué — un échec figé au miroir serait servi en boucle. */
/* (2026-08-05.9) Déclarations libérales de l'année, groupées PAR DATE :
   { "2027-03-03": [{marId, secteur, chirurgie}, …], … }
   Même forme que ce que renvoie listLiberalJour, pour que le volet consomme
   l'un ou l'autre sans distinction. */
function _miroirConstruireLiberal_(annee) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LIBERAL_' + annee);
  if (!sh || sh.getLastRow() < 2) return { success: true, annee: Number(annee), jours: {} };
  const data = sh.getDataRange().getValues();
  const jours = {};
  for (let r = 1; r < data.length; r++) {
    const brut = data[r][2];
    const date = brut instanceof Date
      ? `${brut.getFullYear()}-${String(brut.getMonth()+1).padStart(2,'0')}-${String(brut.getDate()).padStart(2,'0')}`
      : String(brut || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const marId = String(data[r][3]).trim();
    if (!marId) continue;
    (jours[date] = jours[date] || []).push({
      marId: marId,
      secteur: String(data[r][4]).trim().toUpperCase(),
      chirurgie: String(data[r][5] || '').trim(),
    });
  }
  Object.keys(jours).forEach(function (d) {
    jours[d].sort(function (a, b) { return String(a.marId).localeCompare(String(b.marId)); });
  });
  return { success: true, annee: Number(annee), jours: jours };
}

function _miroirAjouteEnveloppe_(items, cle, construire) {
  try {
    const v = construire();
    if (v && v.success === true) items[cle] = JSON.stringify(v);
  } catch (err) { /* omise ; filet horaire */ }
}

/* Les JSON du Drive sont DÉJÀ des chaînes JSON : envoi tel quel, sans
   parse/stringify inutile (le Worker valide l'analysabilité à la réception). */
function _miroirAjouteFichierDrive_(items, cle, nomFichier) {
  try {
    const brut = readPlanningFromDrive(nomFichier);
    if (brut) items[cle] = brut;
  } catch (err) { /* omise ; filet horaire */ }
}

/* (2026-08-05.10) ENVOI PAR PAQUETS. Le Worker refuse plus de 20 clés par
   appel — garde-fou volontaire contre les requêtes énormes. Or la synchro
   COMPLÈTE construit 11 clés globales + 5 par année consultable + 1 pour les
   indispos : 23 clés avec 2026 et 2027, et 28 dès que 2028 existera. Elle
   échouait donc EN BLOC (« 20 clés maximum », 05/08 17:42) — le filet horaire
   était hors service sans que rien ne le signale à l'écran.
   Découpage en lots de 20 : chaque lot part séparément, et le compte rendu
   agrège les résultats. Un lot en échec n'empêche pas les autres de passer,
   et le rapport dit lequel a échoué. */
const MIROIR_MAX_CLES = 20;

/* ═══ ENVOI DIFFÉRENTIEL (2026-08-20.1) ═══════════════════════════════
   POURQUOI. Relevé Cloudflare du 20/08 à 09h38 : 380 écritures et 640
   fouilles consommées sur des plafonds gratuits de 1 000/jour. La synchro
   HORAIRE renvoyait ses ~29 clés à chaque passage, identiques ou non — un
   dimanche sans une seule modification coûtait exactement autant qu'un
   mardi de réunion. Le compteur de courrier, réécrit toutes les 5 minutes,
   dépensait à lui seul ~288 écritures pour une pastille qui ne bouge pas.

   PRINCIPE. On garde l'empreinte de ce qui a été RÉELLEMENT écrit au
   miroir. Une clé dont l'empreinte n'a pas bougé n'est pas renvoyée.

   TROIS GARDE-FOUS, chacun contre une façon de figer une donnée :
   1. L'empreinte n'est enregistrée que pour les clés que le Worker déclare
      avoir écrites (`ecrits`) ou supprimées (`supprimes`). Une clé refusée
      — ou un Worker ancien qui ne dit rien — ne laisse aucune empreinte :
      elle repart au passage suivant. La dégradation va vers le renvoi,
      jamais vers le silence.
   2. Une SUPPRESSION (valeur null) n'est jamais filtrée : effacer une clé
      déjà absente est sans effet, tandis que ne PAS effacer laisserait une
      donnée périmée servie à 23 MARs.
   3. Les empreintes sont oubliées une fois par jour (synchro de 4 h) : tout
      repart sans condition. C'est le filet contre une dérive qu'on ne peut
      pas voir d'ici — miroir vidé à la main, écriture perdue côté
      Cloudflare. Au pire, 24 h de décalage sur une clé qui ne bouge jamais.

   ⚠️ HORODATAGES. Six clés portent un `t` ou un `maj` régénéré à chaque
   construction (acces, config_admin, mail_nonlus, ordre_vac,
   veille_marques, indispos_{Y}). Sans précaution leur empreinte changerait
   toujours et le filtre ne servirait à rien sur les six clés les plus
   fréquentes. L'empreinte est donc calculée SANS ces champs. Vérifié le
   20/08 par lecture de admin.html, index.html et dashboard.html : aucune
   page ne lit `t` ni `maj` — seul `mail_nonlus.nonLus` est consommé. La
   VALEUR ENVOYÉE, elle, n'est pas touchée : on ne change que ce qui sert
   à comparer. */
const MIROIR_CLE_EMPREINTES = 'MIROIR_EMPREINTES';
const MIROIR_CLES_HORODATEES = {
  acces: 1, config_admin: 1, mail_nonlus: 1, ordre_vac: 1, veille_marques: 1,
};

/* Valeur privée de son horodatage, pour comparaison SEULEMENT. */
function _miroirValeurStable_(cle, texte) {
  const horodatee = MIROIR_CLES_HORODATEES[cle] === 1 || /^indispos_\d{4}$/.test(cle);
  if (!horodatee) return texte;
  try {
    const o = JSON.parse(texte);
    if (o && typeof o === 'object') { delete o.t; delete o.maj; return JSON.stringify(o); }
  } catch (e) { /* illisible : on compare le brut, au pire on renvoie */ }
  return texte;
}

/* 16 caractères de SHA-256 : assez pour que deux valeurs différentes ne se
   confondent pas, assez court pour que ~40 clés tiennent dans UNE propriété
   de script (limite : 9 Ko par valeur). */
function _miroirEmpreinte_(cle, texte) {
  try { return _miroirSha256_(_miroirValeurStable_(cle, texte)).slice(0, 16); }
  catch (e) { return null; }   // pas d'empreinte = clé renvoyée au prochain passage
}

function _miroirEmpreintesLues_() {
  try {
    const brut = PropertiesService.getScriptProperties().getProperty(MIROIR_CLE_EMPREINTES);
    const o = brut ? JSON.parse(brut) : null;
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function _miroirEmpreintesEcrites_(emp) {
  try { PropertiesService.getScriptProperties().setProperty(MIROIR_CLE_EMPREINTES, JSON.stringify(emp)); }
  catch (e) { /* jamais bloquant : sans empreintes, tout repart — comportement d'avant */ }
}

/* À lancer à la main si le miroir semble figé sur une vieille valeur :
   la poussée suivante renvoie TOUT sans condition. */
function miroirOublierEmpreintes() {
  try { PropertiesService.getScriptProperties().deleteProperty(MIROIR_CLE_EMPREINTES); } catch (e) {}
  Logger.log('Empreintes du miroir oubliées : la prochaine poussée renverra tout.');
  return { success: true };
}

function _miroirEnvoyer_(items) {
  const jeton = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
  if (!jeton) return { success: false, error: 'MIROIR_PUSH_TOKEN absent des propriétés du script' };
  const cles = Object.keys(items || {});
  if (!cles.length) return { success: false, error: 'aucune clé à envoyer' };

  /* Tri du lot : ce qui a bougé part, le reste attend d'avoir bougé.
     Les copies de documents (doc_*) sont déjà différentielles par leur date
     de modification Drive — les filtrer une seconde fois n'apporterait rien
     et gonflerait la table d'empreintes. */
  const empreintes = _miroirEmpreintesLues_();
  const aEnvoyer = {};
  const inchangees = [];
  cles.forEach(function (c) {
    const v = items[c];
    if (v === null) { aEnvoyer[c] = null; return; }              // garde-fou 2
    if (String(c).indexOf('doc_') === 0) { aEnvoyer[c] = v; return; }
    const e = _miroirEmpreinte_(c, v);
    if (e && empreintes[c] === e) { inchangees.push(c); return; }
    aEnvoyer[c] = v;
  });

  const aEnvoyerCles = Object.keys(aEnvoyer);
  if (!aEnvoyerCles.length) {
    return { success: true, ecrites: 0, cles: cles.length, lots: 0,
             inchangees: inchangees.length, listeInchangees: inchangees.slice(0, 12) };
  }

  const lots = [];
  for (let i = 0; i < aEnvoyerCles.length; i += MIROIR_MAX_CLES) {
    const lot = {};
    aEnvoyerCles.slice(i, i + MIROIR_MAX_CLES).forEach(function (c) { lot[c] = aEnvoyer[c]; });
    lots.push(lot);
  }

  const echecs = [];
  const refusesWorker = [];       // (23/08/2026) clés que le Worker a REJETÉES
  let ecrites = 0;
  let empreintesChangees = false;
  lots.forEach(function (lot, n) {
    const r = _miroirEnvoyerLot_(lot, jeton);
    if (r && r.success) {
      /* Le Worker peut refuser une clé (nom inconnu de sa liste, valeur non
         analysable) tout en répondant success:true pour le lot. C'était le
         dernier angle mort : Apps Script comptait l'envoi comme réussi, la
         page ne trouvait rien, et se repliait sur le serveur — dix secondes
         d'attente sans la moindre trace. */
      (Array.isArray(r.refuses) ? r.refuses : []).forEach(function (c) { refusesWorker.push(c); });
      ecrites += (typeof r.ecrites === 'number' ? r.ecrites : Object.keys(lot).length);
      /* Garde-fou 1 : on ne retient que ce que le Worker DIT avoir traité.
         Une clé refusée n'a pas d'empreinte et repart au passage suivant. */
      (Array.isArray(r.supprimes) ? r.supprimes : []).forEach(function (c) {
        if (c in empreintes) { delete empreintes[c]; empreintesChangees = true; }
      });
      (Array.isArray(r.ecrits) ? r.ecrits : []).forEach(function (c) {
        if (String(c).indexOf('doc_') === 0) return;
        if (!(c in lot) || lot[c] === null) return;
        const e = _miroirEmpreinte_(c, lot[c]);
        if (e) { empreintes[c] = e; empreintesChangees = true; }
      });
    } else {
      echecs.push('lot ' + (n + 1) + '/' + lots.length + ' : ' + ((r && r.error) || 'erreur inconnue'));
    }
  });

  if (empreintesChangees) _miroirEmpreintesEcrites_(empreintes);

  if (echecs.length) {
    return { success: false, error: echecs.join(' · '), lots: lots.length, ecrites: ecrites,
             inchangees: inchangees.length };
  }
  return { success: true, ecrites: ecrites, cles: cles.length, lots: lots.length,
           refusesWorker: refusesWorker,
           listeEcrites: aEnvoyerCles.slice(0, 12), listeInchangees: inchangees.slice(0, 12),
           inchangees: inchangees.length };
}

function _miroirEnvoyerLot_(items, jeton) {
  try {
    const rep = UrlFetchApp.fetch(MIROIR_URL + '/push', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ token: jeton, items: items }),
      muteHttpExceptions: true,
    });
    const texte = rep.getContentText();
    try { return JSON.parse(texte); }
    catch (e) { return { success: false, error: 'réponse Worker illisible : ' + String(texte).slice(0, 120) }; }
  } catch (err) {
    return { success: false, error: 'envoi impossible : ' + err.message };
  }
}

/* ── BUILDERS ────────────────────────────────────────────────────────────

   `acces` : empreintes SHA-256 des codes + identité, MÊMES SOURCES que
   checkCode (Indispos.gs) : ADMIN_CODE dans CONFIG, codes MAR en colonne 7
   de MEDECINS, colonnes LIBERAL/RPPS/PRENOM repérées par EN-TÊTE.
   FIDÉLITÉ À checkCode, pas d'interprétation : checkCode ne filtre PAS sur
   la colonne « actif », donc ici non plus — un code présent dans l'onglet
   ouvre une session, au miroir comme au GAS. Le code secrétariat est
   volontairement ABSENT (aucune lecture miroir pour ce rôle). */
function _miroirConstruireAcces_() {
  const norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
  const users = [];
  /* (17/08/2026) Qui gere la bibliotheque de cotations types. La fabrique
     appelait Apps Script UNIQUEMENT pour connaitre ce droit : en le faisant
     voyager avec l'identite, elle n'a plus aucune lecture a demander au
     serveur. Cle CONFIG / LIBERAL_ADMIN — jamais de nom dans le code. */
  var libAdmin = '';
  /* (08/09/2026) TUILES RESTREINTES. Cinq tuiles du dashboard ne s'adressent
     qu'a une ou deux personnes (CRH, statistiques d'usage, guide technique,
     consultations, liberal en rodage). Leur destinataire etait ECRIT EN DUR
     dans dashboard.html — un nom de medecin dans un depot public, et une
     tuile qui disparait pour tout le monde des que ce nom change.
     Desormais : cle CONFIG / TUILES_PRIVEES, dans le classeur prive.
     Format : ID:tuile,tuile;ID:tuile   (ex. AFR:crh,stats;WS:liberal)
     Cle absente = personne ne voit ces tuiles : le defaut sur : ferme. */
  var tuilesParMar = {};
  try {
    const cfgA = _configRows_();
    for (var ra = 1; ra < cfgA.length; ra++) {
      const cle = String(cfgA[ra][0]).trim();
      if (cle === 'LIBERAL_ADMIN') libAdmin = norm(cfgA[ra][1]);
      else if (cle === 'TUILES_PRIVEES') tuilesParMar = _tuilesPriveesLire_(cfgA[ra][1]);
    }
  } catch (e) { /* sans la cle, personne ne gere : le bon defaut */ }

  // ADMIN_CODE — première occurrence gagnante, comme checkCode.
  try {
    const cfg = _configRows_();
    for (var r = 1; r < cfg.length; r++) {
      if (String(cfg[r][0]).trim() === 'ADMIN_CODE') {
        const c = norm(cfg[r][1]);
        if (c) users.push({ h: _miroirSha256_(c), id: 'ADMIN', role: 'admin',
                            name: 'Comité', initials: 'ADM', prenom: '', liberal: false, rpps: '' });
        break;
      }
    }
  } catch (e) { /* sans ADMIN_CODE, l'admin passera par le repli GAS */ }

  // Codes MAR — colonne 7 ([6]) de MEDECINS, en-têtes pour le reste.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('MEDECINS');
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const colParTitre = function (titre) {
      if (!data.length) return -1;
      for (var c = 0; c < data[0].length; c++) {
        if (String(data[0][c]).trim().toUpperCase() === titre) return c;
      }
      return -1;
    };
    const colLib = colParTitre('LIBERAL'), colRpps = colParTitre('RPPS'), colPre = colParTitre('PRENOM');
    for (var i = 1; i < data.length; i++) {
      const code = norm(data[i][6]);
      if (!code) continue;
      users.push({
        h: _miroirSha256_(code),
        id: String(data[i][0]).trim(), role: 'mar',
        name: data[i][1], initials: data[i][2],
        prenom: colPre >= 0 ? String(data[i][colPre] == null ? '' : data[i][colPre]).trim() : '',
        liberal: colLib >= 0 && String(data[i][colLib]).trim().toUpperCase() === 'O',
        libAdmin: !!libAdmin && norm(data[i][0]) === libAdmin,
        tuiles: tuilesParMar[norm(data[i][0])] || [],
        rpps: colRpps >= 0 ? String(data[i][colRpps] == null ? '' : data[i][colRpps]).trim() : '',
        /* (CORRECTIF 22/08/2026) Éligibilité à la pose des TP. Le portail
           s'ouvre par la COPIE RAPIDE, pas par la connexion au serveur :
           sans ces deux champs ici, la tuile ne peut pas s'afficher. */
        quotite: (function () { try { return _quotiteDe_(String(data[i][0]).trim()); } catch (eQ) { return 100; } })(),
        tpFixe: (function () { try { return _tpFixeDe_(String(data[i][0]).trim()); } catch (eF) { return false; } })(),
      });
    }
  }

  const acces = { users: users, t: Date.now() };
  /* (08/09/2026) DEUX LISTES GLOBALES, DEDUITES DE MEDECINS.
     Elles remplacent des noms de medecins ECRITS EN DUR dans les pages :
       titresPr        — qui s'affiche « Pr » plutot que « Dr » (colonne NOM)
       souhaitsPlafond — regime de souhaits garantis (colonne souhait_plafond),
                         qui retire le MAR des calculs d'equite
     Un depot public n'a pas a nommer un praticien pour savoir comment
     l'appeler. Deduites, donc rien a saisir : la colonne fait foi. */
  try {
    const eff = _effectifTitres_();
    acces.titresPr = eff.titresPr;
    acces.souhaitsPlafond = eff.souhaitsPlafond;
  } catch (e) { acces.titresPr = []; acces.souhaitsPlafond = []; }
  try { acces.indisposYear = getIndisposYear(); } catch (e) { acces.indisposYear = null; }
  try { acces.indisposOuverte = _indisposOuverte_(); } catch (e) { acces.indisposOuverte = false; }
  // (26/08/2026) Campagne figée (planning de l'année de campagne déjà généré) :
  // même source unique que l'écran indispos (_indisposFigees_, Indispos.gs).
  try { acces.indisposFigees = _indisposFigees_(); } catch (e) { acces.indisposFigees = false; }
  try { acces.phaseTp = _phaseTp_(); } catch (e) { acces.phaseTp = { actif: false, annee: null, annees: [] }; }
  return acces;
}

/* Effectif : qui porte le titre « Pr », qui releve du regime de souhaits
   garantis. Lu dans MEDECINS, la seule source. Colonne B = NOM (préfixe « PR »),
   colonne P = souhait_plafond. Les MAR inactifs sont inclus : un nom affiche
   dans un planning passe doit rester correct.
   La MEME liste est calculee par _effectifTitresGas_ (Indispos.gs) pour le
   chemin « connexion au serveur ». Deux lecteurs, une seule regle. */
function _effectifTitres_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
  if (!sh) return { titresPr: [], souhaitsPlafond: [] };
  const data = sh.getDataRange().getValues();
  const titresPr = [], souhaitsPlafond = [];
  for (var i = 1; i < data.length; i++) {
    const id = String(data[i][0] == null ? '' : data[i][0]).trim();
    if (!id) continue;
    if (/^PR\b/i.test(String(data[i][1] == null ? '' : data[i][1]).trim())) titresPr.push(id);
    if (String(data[i][15] == null ? '' : data[i][15]).trim().toUpperCase() === 'O') souhaitsPlafond.push(id);
  }
  return { titresPr: titresPr, souhaitsPlafond: souhaitsPlafond };
}

/* Analyse la valeur de CONFIG / TUILES_PRIVEES.
   « AFR:crh,stats;WS:liberal » -> { AFR:['crh','stats'], WS:['liberal'] }
   Tolerant aux espaces et a la casse des identifiants ; une entree mal
   formee est ignoree plutot que de faire tomber la connexion de tous. */
function _tuilesPriveesLire_(valeur) {
  const out = {};
  String(valeur == null ? '' : valeur).split(';').forEach(function (bloc) {
    const deuxPoints = bloc.indexOf(':');
    if (deuxPoints < 1) return;
    const id = bloc.slice(0, deuxPoints).trim().toUpperCase();
    if (!id) return;
    const cles = bloc.slice(deuxPoints + 1).split(',')
      .map(function (c) { return c.trim(); }).filter(Boolean);
    if (cles.length) out[id] = (out[id] || []).concat(cles);
  });
  return out;
}

function _miroirSha256_(texte) {
  const octets = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texte, Utilities.Charset.UTF_8);
  return octets.map(function (o) {
    const v = (o < 0 ? o + 256 : o).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/* `annees` : même balayage que l'action getAnneesDisponibles (onglets
   GARDES_{Y} du classeur actif + classeur d'archives). */
function _miroirConstruireAnnees_() {
  const vues = {};
  const balaye = function (classeur, archivee) {
    try {
      classeur.getSheets().forEach(function (sh) {
        const m = sh.getName().match(/^GARDES_(\d{4})$/);
        if (!m) return;
        const y = Number(m[1]);
        if (vues[y] === undefined) vues[y] = archivee;
      });
    } catch (e) { /* classeur inaccessible : on garde ce qu'on a */ }
  };
  balaye(SpreadsheetApp.getActiveSpreadsheet(), false);
  try { balaye(SpreadsheetApp.openById(ARCHIVE_SS_ID), true); } catch (e) {}
  const annees = Object.keys(vues).map(Number).sort(function (a, b) { return a - b; })
    .map(function (y) { return { annee: y, archivee: vues[y] }; });
  return { active: getActiveYear(), annees: annees };
}

/* `config_admin` : la part CONFIGURATION du bootstrap admin — médecins,
   overrides, seuils, modèle CS, année stats fiables, existence N+1.
   Chaque morceau tolère l'échec, comme dans getAdminBootstrap.
   ⚠️ Servi par le Worker au SEUL rôle admin (les fiches médecins portent
   emails et RPPS). Les parts VIVANTES du bootstrap (Gmail, journal)
   restent sur le circuit GAS, chargées après l'affichage. */
function _miroirConstruireConfigAdmin_(annee) {
  const out = { t: Date.now(), annee: annee };
  try { const m = _buildMedecins_(); out.medecins = m.error ? [] : m.medecins; } catch (e) { out.medecins = []; }
  try { out.overrides = _buildOverrides_(); } catch (e) { out.overrides = null; }
  try { out.seuils = getSeuils(); } catch (e) { out.seuils = null; }
  try { out.csTemplate = getCsTemplate(); } catch (e) { out.csTemplate = null; }
  try { out.anneeStatsFiables = PREMIERE_ANNEE_STATS_FIABLES; } catch (e) { out.anneeStatsFiables = null; }
  try { out.anneeSuivante = _jsonFilesByName_('planning_' + (annee + 1) + '.json').length > 0; } catch (e) { out.anneeSuivante = null; }
  return out;
}

/* `indispos_{Y}` : même lecture que l'action getAllIndispos (onglet
   INDISPOS_{Y}, dates reconstruites par le helper unifié), emballée dans
   {parMar:{ID:{date:val}}} — le format que le Worker sait FILTRER par MAR. */
function _miroirConstruireIndispos_(annee) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('INDISPOS_' + annee);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, annee);
  const parMar = {};
  for (var r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    parMar[id] = {};
    dates.forEach(function (date, i) {
      if (!date) return;
      const val = String(data[r][i + 1] || '').trim();
      if (val) parMar[id][date] = val;
    });
  }
  return { parMar: parMar, annee: annee, t: Date.now() };
}


/* ── BUILDERS LOT B (04/08/2026) — outils du comite ──────────────────────
   ⚠️ FIDELITE : `gardes`, `stats` et `vacances_admin` sont des COPIES
   CONFORMES des blocs inline de _routeRequete_ (Indispos.gs : actions
   getGardes, getStats, getVacancesConfig SANS parametre year). Ces blocs
   sont de purs dumps d'onglets ; si l'un d'eux change dans Indispos.gs,
   REPERCUTER ICI. `joursferies` appelle la vraie fonction (code.gs) :
   zero duplication. Enveloppes identiques aux actions → le client les
   consomme comme une reponse api(). */

function _miroirConstruireGardes_(gYear) {
  const ss = _ssWithSheet('GARDES_' + gYear) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('GARDES_' + gYear);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(data, gYear);
  const result = {};
  for (var r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    Object.keys(dateToCol).forEach(function (date) {
      const val = String(data[r][dateToCol[date]] || '').trim();
      if (!val) return;
      if (!result[date]) result[date] = {};
      result[date][id] = val;
    });
  }
  return { success: true, data: result, year: gYear };
}

function _miroirConstruireStats_(statsYear) {
  const ss = _ssWithSheet('STATS_GARDES_' + statsYear) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('STATS_GARDES_' + statsYear);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const stats = [];
  for (var r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
      g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
      jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
      recupR:data[r][12], h18:data[r][13],
      jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
  }
  return { success: true, stats: stats };
}

/* Structure identique aux indispos : { parMar: { ID: [ligne, ...] } }. Le
   Worker sait deja filtrer cette forme — une seule mecanique a maintenir. */
function _miroirConstruireLiberalMar_(annee) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LIBERAL_' + annee);
  if (!sh || sh.getLastRow() < 2) return { annee: Number(annee), parMar: {} };
  const data = sh.getDataRange().getValues();
  const iso = function (v) {
    if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0')
                                + '-' + String(v.getDate()).padStart(2, '0');
    return String(v || '').trim();
  };
  const nombre = function (v) { const n = Number(v); return isFinite(n) ? n : 0; };
  const parMar = {};
  for (let r = 1; r < data.length; r++) {
    const marId = String(data[r][3] || '').trim();
    const dateBloc = iso(data[r][2]);
    if (!marId || !/^\d{4}-\d{2}-\d{2}$/.test(dateBloc)) continue;
    (parMar[marId] = parMar[marId] || []).push({
      id:          String(data[r][0]),
      dateConsult: iso(data[r][1]),
      dateBloc:    dateBloc,
      secteur:     String(data[r][4] || '').trim().toUpperCase(),
      chirurgie:   String(data[r][5] || '').trim(),
      specialite:  String(data[r][6] || '').trim().toUpperCase(),
      brCcam:      nombre(data[r][7]),
      brNgap:      nombre(data[r][8]),
    });
  }
  Object.keys(parMar).forEach(function (k) {
    parMar[k].sort(function (a, b) { return String(a.dateBloc).localeCompare(String(b.dateBloc)); });
  });
  return { annee: Number(annee), parMar: parMar };
}

function _miroirConstruireVacancesAdmin_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const periodes = [];
  if (perSheet) {
    const perData = perSheet.getDataRange().getValues();
    for (var r = 1; r < perData.length; r++) {
      const nom = String(perData[r][0]).trim();
      if (!nom) continue;
      const debutRaw = perData[r][1], finRaw = perData[r][2];
      const debut = debutRaw instanceof Date
        ? debutRaw.getFullYear() + '-' + String(debutRaw.getMonth()+1).padStart(2,'0') + '-' + String(debutRaw.getDate()).padStart(2,'0')
        : String(debutRaw).trim();
      const fin = finRaw instanceof Date
        ? finRaw.getFullYear() + '-' + String(finRaw.getMonth()+1).padStart(2,'0') + '-' + String(finRaw.getDate()).padStart(2,'0')
        : String(finRaw).trim();
      periodes.push({nom: nom, debut: debut, fin: fin, seuil: Number(perData[r][3]) || 8});
    }
  }
  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupes = {A: [], B: [], C: []};
  if (groupSheet) {
    const groupData = groupSheet.getDataRange().getValues();
    const tempGroups = {A: [], B: [], C: []};
    for (var r2 = 1; r2 < groupData.length; r2++) {
      const grp = String(groupData[r2][0]).trim(), id = String(groupData[r2][1]).trim();
      const ord = Number(groupData[r2][2]) || 0;
      if (!id || !tempGroups[grp]) continue;
      tempGroups[grp].push({id: id, ordre: ord});
    }
    ['A', 'B', 'C'].forEach(function (gk) {
      groupes[gk] = tempGroups[gk].sort(function (x, y) { return x.ordre - y.ordre; }).map(function (m) { return {id: m.id}; });
    });
  }
  /* (04/09/2026) L'HISTORIQUE DE NOËL VOYAGE AVEC LES PÉRIODES.
     Constaté au staff du 04/09, devant la salle : le bouton « 🎄 Noël & Jour
     de l'An » a répondu « historique indisponible ». C'était le SEUL appel de
     staff.html qui partait encore en direct sur Apps Script — tout le reste de
     la page (médecins, indispos, fériés, périodes) arrive de la copie rapide.
     Or Apps Script exécute en file : une vingtaine de connexions simultanées
     ont suffi à mettre le clic derrière tout le monde. Le soir, au calme, le
     même bouton répondait.

     POURQUOI ICI et pas dans une clé à part : `vacances_admin` est déjà
     réservée au comité côté Worker, déjà lue au chargement de cet écran, et
     n'est PAS suffixée par année. Une clé neuve aurait imposé les trois choses
     qu'on veut éviter — une entrée dans MIROIR_CLES_PAR_ANNEE (sinon elle
     survit au ménage de fin d'année, défaut déjà vu deux fois), une règle
     d'accès dans le Worker, et donc un déploiement Cloudflare de plus.

     ⚠️ TRY À LUI SEUL, volontairement. `_miroirAjouteEnveloppe_` abandonne la
     clé ENTIÈRE au premier jet : sans ce filet, une erreur sur l'historique de
     Noël emporterait aussi les périodes et les groupes, c'est-à-dire tout
     l'écran du staff vacances. En cas d'échec, `noel` vaut null et la page
     repasse par Apps Script exactement comme avant : dégradé, jamais cassé. */
  var noel = null;
  try {
    var yNoel = getIndisposYear();
    noel = { annee: Number(yNoel), historique: computeNoelAnHistorique(yNoel) };
  } catch (e) { noel = null; }

  return { success: true, periodes: periodes, groupes: groupes, noel: noel };
}


/* ═══ NOTIFICATIONS PUSH (12/08/2026 — phase 1) ══════════════════════
   Le GAS ne chiffre rien : il demande au Worker d'envoyer (jeton
   MIROIR_PUSH_TOKEN, le même que le miroir). JAMAIS bloquant : une
   notification qui rate ne doit jamais faire échouer le geste qui la
   déclenche — tout est avalé, le résultat est journalisé via Logger. */
function notifierPush_(titre, corps, url, cible, sansJournal) {
  /* (23/08/2026 — cloche) Le serveur note ce qu'il ENVOIE, avant même de
     tenter l'envoi : la ligne du journal existe même si le push rate.
     `sansJournal` : réservé au test du canal. Jamais bloquant. */
  if (!sansJournal) _notifJournalNoter_(cible, titre, corps, url);
  try {
    const jeton = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
    if (!jeton) { Logger.log('notifierPush_ : MIROIR_PUSH_TOKEN absent'); return { success: false }; }
    /* (13/08/2026 — phase 3) `cible` optionnelle : { id: 'DURAND' } pour UNE
       personne, { role: 'admin' } pour le comité. Absente = tous les abonnés
       (comportement de la phase 1, inchangé — la génération annonce à tous). */
    const charge = { token: jeton, titre: titre, corps: corps, url: url };
    if (cible && (cible.id || cible.role)) charge.cible = cible;
    /* (pastille) Nombre à poser sur l'icône de l'app du destinataire —
       calculé par l'appelant, transporté tel quel jusqu'au téléphone. */
    if (cible && typeof cible.pastille === 'number') charge.pastille = cible.pastille;
    const rep = UrlFetchApp.fetch(MIROIR_URL + '/notif-envoyer', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(charge),
      muteHttpExceptions: true,
    });
    const r = JSON.parse(rep.getContentText());
    Logger.log('notifierPush_ : ' + rep.getResponseCode() + ' — ' + rep.getContentText().slice(0, 200));
    return r;
  } catch (err) {
    Logger.log('notifierPush_ : échec — ' + err.message);
    return { success: false, error: err.message };
  }
}

/* ═══ LE JOURNAL DES NOTIFICATIONS — la cloche du dashboard (23/08/2026) ═══
   Principe des applis grand public : le serveur tient le registre de ce
   qu'il envoie, la notification push n'est qu'une sonnette. Onglet
   NOTIFS_JOURNAL (QUAND | MAR | TITRE | CORPS | URL) — le classeur reste la
   seule vérité. MAR : un id, ou '*' (adressé à tous, ex. génération). Une
   cible par rôle (comité) n'y entre pas : la cloche est l'écran du MAR.
   Rétention 30 jours, purgée au fil de l'eau — aucun déclencheur dédié.
   Les futurs changements de planning (aujourd'hui par mail) s'y ajouteront
   par UN appel de plus à _notifJournalNoter_ : accueillis par construction. */
const NOTIF_JOURNAL_ONGLET = 'NOTIFS_JOURNAL';
const NOTIF_JOURNAL_JOURS  = 30;

function _notifJournalNoter_(cible, titre, corps, url) {
  try {
    /* (06/09/2026) DÉFAUT VU EN PRODUCTION. Ce garde-fou visait le canal du
       COMITÉ, qui n'a pas de cloche. Il écartait en réalité TOUS les rôles — y
       compris `role:'mar'`, celui de la génération des gardes, c'est-à-dire la
       notification la plus importante de l'année. Le push partait sur les
       téléphones, la cloche restait vide, et rien ne pouvait le révéler puisque
       la notification, elle, arrivait bien.
       Preuve : NOTIFS_JOURNAL ne contenait que deux lignes, du 25/08, écrites
       quand l'appel utilisait encore la cible `*`. La génération du 04/09 n'y
       figure pas.
       Une cible `role:'mar'` s'adresse à TOUS les MAR : c'est le sens de `*`. */
    if (cible && cible.role && cible.role !== 'mar') return;   // comité : pas de cloche
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(NOTIF_JOURNAL_ONGLET);
    if (!sh) {
      sh = ss.insertSheet(NOTIF_JOURNAL_ONGLET);
      sh.appendRow(['QUAND', 'MAR', 'TITRE', 'CORPS', 'URL']);
    }
    /* `role:'mar'` → '*' : tout le monde. Un id nommé garde son id. */
    const mar = (cible && cible.id) ? String(cible.id).trim() : '*';
    sh.appendRow([new Date().toISOString(), mar,
                  String(titre || ''), String(corps || ''), String(url || '')]);
    /* Purge au fil de l'eau : les lignes s'ajoutent en bas, les plus
       anciennes sont donc en tête — on retire tant que la première ligne de
       données a plus de 30 jours. Une ligne illisible arrête la purge sans
       jamais boucler. */
    const limite = Date.now() - NOTIF_JOURNAL_JOURS * 86400 * 1000;
    while (sh.getLastRow() > 1) {
      const v = sh.getRange(2, 1).getValue();
      const t = v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
      if (isNaN(t) || t >= limite) break;
      sh.deleteRow(2);
    }
    _miroirNoterPoussee_(['notifs'], getActiveYear());   // la copie rapide suit dans la minute
  } catch (e) { try { Logger.log('_notifJournalNoter_ : ' + e.message); } catch (e2) {} }
}

/* La clé `notifs` de la copie rapide : { '<ID>': [{q,t,c,u}…], '*': […] },
   30 jours, du plus récent au plus ancien. */
function _miroirConstruireNotifs_() {
  const out = {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTIF_JOURNAL_ONGLET);
  if (sh) {
    const d = sh.getDataRange().getValues();
    const limite = Date.now() - NOTIF_JOURNAL_JOURS * 86400 * 1000;
    for (var r = 1; r < d.length; r++) {
      const v = d[r][0];
      const t = v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
      if (isNaN(t) || t < limite) continue;
      const mar = String(d[r][1] || '*').trim() || '*';
      (out[mar] = out[mar] || []).push({
        q: new Date(t).toISOString(),
        t: String(d[r][2] || ''), c: String(d[r][3] || ''), u: String(d[r][4] || ''),
      });
    }
    Object.keys(out).forEach(function (k) {
      out[k].sort(function (a, b) { return a.q < b.q ? 1 : -1; });
    });
  }
  return { success: true, notifs: out };
}

/* À lancer depuis l'éditeur Apps Script pour le test réel du canal. */
function testNotificationPush() {
  const r = notifierPush_('Test du canal', 'Si vous lisez ceci sur votre téléphone, le canal fonctionne.', './dashboard.html', null, true);
  Logger.log(JSON.stringify(r));
}
