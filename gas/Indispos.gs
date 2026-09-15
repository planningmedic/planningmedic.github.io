// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_INDISPOS = '2026-09-15.1';   // (15/09/2026) chantier 9, étape 1 : les fonctions métier sont parties dans gardes.gs, indisponibilites.gs, temps_partiel.gs, equipe.gs, diagnostic.gs ; ici restent le routeur, checkCode, doGet/doPost

/* ── (01/08/2026) MARQUEUR DE TEMPS GLOBAL — mesure, ne change rien ───────
   `_srv_ms` chronometre l'INTERIEUR de doGet. Or avant que doGet soit appele,
   Apps Script evalue toutes les constantes de premier niveau — dont TEST_YEAR,
   juste en dessous, qui ouvre le classeur et lit CONFIG. Ce temps etait compte
   comme « attente Google » alors qu'il est a NOUS.
   Ce marqueur permet a doGet de renvoyer `_glob_ms` = temps ecoule entre ici et
   l'entree dans doGet. Il ne mesure PAS la compilation du code (545 Ko), qui a
   lieu avant toute execution : pour celle-la, comparer avec la duree totale
   affichee dans le menu « Executions » d'Apps Script.
   Cout : un Date.now(). A retirer si le diagnostic conclut. */
const _T_GLOBAUX = Date.now();

// ── CONFIG ─────────────────────────────────────────────────────────────
const GITHUB_USER_INDISPOS = 'planningmedic';
const GITHUB_REPO_INDISPOS = 'planningmedic.github.io';
const TEST_YEAR = getActiveYear();

function getIndisposYear() {
  const data = _configRows_();   // memo de CONFIG (code.gs)
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
      const y = parseInt(String(data[r][1]).trim());
      if (!isNaN(y)) return y;
    }
  }
  return getActiveYear();
}

// (C3) MEDECINS_LIST supprimé — l'effectif vient de l'onglet MEDECINS.

/* ═════════ DIAGNOSTIC EN TROIS QUESTIONS + SENTINELLE (27/08/2026) ═════════
   Recul pris après trois incidents silencieux la même semaine : le dépôt juste
   mais le site servant l'ancien (événement Pages perdu), une donnée fausse dans
   PERIODES_VAC (Toussaint 2027), et le constat que les déclencheurs peuvent
   mourir sans laisser de trace. Le diagnostic devient : trois QUESTIONS
   (chapitres) au lieu de sections d'inventaire, des sondes de bout en bout,
   des battements de cœur, et une sentinelle quotidienne qui n'écrit QUE si ❌.
   Contrainte du responsable : rester loin sous la minute — chaque sonde réseau
   attrape ses erreurs et rend ⚠️ « injoignable » plutôt que de bloquer. */

function logAction(message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('LOGS');
    if (!sheet) {
      sheet = ss.insertSheet('LOGS');
      sheet.getRange(1, 1, 1, 2).setValues([['TIMESTAMP','MESSAGE']]);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 400);
    }
    sheet.appendRow([new Date(), message]);
    if (sheet.getLastRow() > 501) sheet.deleteRows(2, sheet.getLastRow() - 501);
  } catch(e) {
    Logger.log('logAction error: ' + e.message);
  }
}

// ── JOURNAL DES CONNEXIONS (qui se connecte, quand, avec quel rôle) ────
/* (29/08/2026) Trois besoins, trois durées de vie — et une règle qui tient
   l'ensemble : on ne RECONSTRUIT jamais une statistique depuis les lignes
   brutes après coup, on la FIGE pendant qu'elles existent encore.

   CONNEXIONS    : le détail nominatif récent. Plafonné, donc borné.
   STATS_SEMAINE : une ligne par semaine (52/an), figée dès la semaine finie.
   STATS_HEURES  : grille 7 × 24 cumulée, incrémentée à chaque connexion.

   Conséquence : purger CONNEXIONS ne fait perdre aucune courbe. Sans ce
   dispositif, le plafond détruirait l'historique en continu — à 25 MAR, les
   10 000 lignes couvrent environ trois mois, donc la première année d'usage
   aurait disparu avant d'avoir pu être lue. */
const CONNEXIONS_PLAFOND = 10000;    // ~3 mois de détail nominatif à 25 MAR
const STATS_ORIGINE      = '2026-09-04';  // présentation au service = jour zéro

// (C3) setupIndispos supprimé — remplacé par initYear / setupAnnee.

// ── FUSION DES DEUX PROPRIETAIRES DE INDISPOS_{Y} ────────────────────
// L'onglet porte DEUX familles de codes, avec un proprietaire net :
//    VAC / FORM             -> le comite (staff.html, staff vacances)
//    INDISPO / SOUHAIT / TP -> le MAR    (indispos.html)
// Avant le 30/07/2026, saveIndispos REECRIVAIT la ligne entiere avec ce
// qu'envoyait la page. Deux pertes silencieuses en decoulaient :
//  1) « Valider et verrouiller » du staff n'envoie QUE les VAC/FORM :
//     revalider apres la campagne effacait toutes les saisies des MARs ;
//  2) une page MAR ouverte AVANT la pose des vacances les effacait en
//     enregistrant plus tard (elle renvoyait sa photo perimee).
// Regle posee : chacun remplace INTEGRALEMENT ses propres cases — un
// retrait reste donc possible des deux cotes — et ne touche JAMAIS
// celles de l'autre. En cas de conflit sur une date, la case du comite
// gagne : c'est le verrou des vacances, cote SERVEUR et non navigateur.
const CODES_COMITE = new Set(['VAC', 'FORM']);
/* ═══ (POSE TP · 22/08/2026) LE CIRCUIT DE POSE DES TEMPS PARTIELS ═══════════
   Les TP se posent APRÈS la génération, dans ce qui reste. Trois familles de
   codes cohabitent désormais dans INDISPOS_{Y}, chacune avec son propriétaire :
     VAC / FORM        -> le comité   (staff vacances)
     INDISPO / SOUHAIT -> le MAR, pendant la campagne (indispos.html)
     TP / TPA          -> le MAR, via CE circuit, toute l'année
   TPA = « TP en attente » (jour jaune, sous réserve du comité). Il ne compte
   NI comme absence NI dans le quota : sinon la demande ferait elle-même
   baisser l'effectif, et deux demandes le même jour se bloqueraient. */

/* Republier le planning : le fichier que lisent les 23 est figé à la
   publication, écrire dans GARDES ne suffit pas. On ne réveille PAS le
   notifieur de changement de planning — la notification dédiée du circuit TP
   est plus précise, et deux messages pour un même événement se contredisent. */
/* (23/08/2026) REPUBLICATION DIFFÉRÉE — mesure du 09/08 : republier coûte
   ~10 s. Dans la requête, chaque validation du comité ferait attendre dix
   secondes, cinquante sur une série de cinq. On NOTE donc l'année à republier
   et on garantit UN déclencheur unique : la réponse part tout de suite, la
   republication tombe dans la minute. Même mécanisme que l'accroche différée
   de la copie rapide (miroir.gs, 05/08), et mêmes garanties : au pire, le
   planning publié a une minute de retard — le classeur, lui, est déjà juste.
   Le déclencheur porte un nom distinct de celui du miroir : les deux files
   doivent pouvoir vivre en parallèle. */
const TP_CLE_REPUBLIER = 'TP_ANNEES_A_REPUBLIER';

/* Qui porte le titre « Pr », qui releve du regime de souhaits garantis.
   Lu dans MEDECINS : colonne B = NOM, colonne P = souhait_plafond. Les MAR
   inactifs sont inclus — un nom affiche dans un planning passe doit rester
   correct. Miroir exact de _effectifTitres_ (miroir.gs) : une seule regle,
   deux lecteurs. Resultat memorise le temps d'une execution. */
var _EFFECTIF_TITRES_MEMO = null;
function checkCode(code) {
  /* CASSE IGNOREE (27/07/2026). Le code etait compare a l'identique : taper son
     code en minuscules donnait « Code incorrect », sans indice. Le piege etait
     invisible parce que les champs de saisie portent autocapitalize="characters" :
     le telephone corrigeait tout seul, PAS l'ordinateur. Meme code, accepte sur
     mobile et refuse sur PC — incomprehensible pour l'utilisateur.
     Sans risque de collision : generateCode() n'emet que des MAJUSCULES
     (ABCDEFGHJKLMNPQRSTUVWXYZ23456789) et resetCodeMar verifie deja l'unicite en
     majuscules. Deux codes ne peuvent donc pas differer par la seule casse.
     ⚠️ Si un code est un jour saisi A LA MAIN dans le classeur, il doit rester
     unique une fois mis en majuscules. */
  const _normCode = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
  const codeN = _normCode(code);
  // Un code vide ne doit JAMAIS ouvrir de session : sans ce garde-fou, il
  // correspondrait a la cellule vide d'un MAR sans code.
  if (!codeN) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminCode = null;   // AUCUN code par défaut : ADMIN_CODE doit exister dans CONFIG
  // Code PARTAGE du secretariat d'anesthesie (lecture seule). Meme regime que
  // ADMIN_CODE : aucun defaut, la cle doit exister dans CONFIG pour que le role vive.
  let secretariatCode = null;
  /* (08/09/2026) Tuiles reservees — cle CONFIG / TUILES_PRIVEES. Lue ICI, dans
     la boucle qui parcourt deja CONFIG : aucune lecture supplementaire du
     classeur a chaque connexion. */
  let tuilesBrut = null;
  {
    const configData = _configRows_();   // memo de CONFIG (code.gs)
    for (let r = 1; r < configData.length; r++) {
      const _cle = String(configData[r][0]).trim();
      // Premiere occurrence gagnante pour chaque cle (comportement d'origine conserve :
      // le `break` initial faisait deja gagner la premiere ligne ADMIN_CODE).
      if (_cle === 'ADMIN_CODE'       && adminCode === null)       adminCode = String(configData[r][1]).trim();
      else if (_cle === 'SECRETARIAT_CODE' && secretariatCode === null) secretariatCode = String(configData[r][1]).trim();
      else if (_cle === 'TUILES_PRIVEES'   && tuilesBrut === null)      tuilesBrut = String(configData[r][1]);
    }
  }
  if (adminCode && _normCode(adminCode) === codeN) return {role: 'admin', id: 'ADMIN'};
  // ROLE SECRETARIAT (Lot 5-bis). Code partage, donc perimetre verrouille par la
  // liste blanche SECRETARIAT_ACTIONS dans doGet — refus par defaut de tout le reste.
  // Aucune donnee nominative renvoyee ici (ni nom, ni RPPS, ni prenom).
  // `name` sert uniquement de libelle dans le journal CONNEXIONS (logConnexion lit
  // user.name) : le code etant partage, on ne peut pas savoir QUI s'est connecte.
  if (secretariatCode && _normCode(secretariatCode) === codeN) {
    return {role: 'secretariat', id: 'SECRETARIAT', name: 'Secrétariat', initials: 'SEC'};
  }

  const sheet = ss.getSheetByName('MEDECINS');
  if (!sheet) return null;
  const data = _medecinsRows_();
  // Colonnes reperees par leur EN-TETE et non par un index fige : leur position peut
  // donc changer sans toucher au code.
  // ⚠️ Cela ne vaut QUE pour ces colonnes-ci. Toutes les autres lectures de MEDECINS
  // utilisent des index FIGES ([0] id, [1] nom, [2] initiales, [3] actif, [6] code,
  // [8] dect, [9..16] gardes). Consequence : une NOUVELLE colonne s'ajoute TOUJOURS
  // EN FIN d'onglet. Une insertion au milieu decale tout et rend les codes d'acces
  // inoperants -- constate en reel le 21/07/2026 (checkCode lisait la colonne voisine,
  // symptome : « code refuse » alors que le code est correct dans le classeur).
  const _colParTitre = function (titre) {
    if (!data.length) return -1;
    for (let c = 0; c < data[0].length; c++) {
      if (String(data[0][c]).trim().toUpperCase() === titre) return c;
    }
    return -1;
  };
  const colLib  = _colParTitre('LIBERAL');   // O/N : membre du groupement liberal
  const colRpps = _colParTitre('RPPS');      // n° RPPS, pre-remplissage des devis
  // PRENOM : colonne DEDIEE, ajoutee en fin d'onglet. Surtout NE PAS mettre le prenom
  // dans la colonne NOM : celle-ci alimente le planning, le dashboard et l'export Excel,
  // ou un nom rallonge deborderait partout.
  const colPre  = _colParTitre('PRENOM');
  for (let r = 1; r < data.length; r++) {
    if (_normCode(data[r][COL_MED.CODE]) === codeN) {
      return {role:'mar', id:data[r][COL_MED.ID], name:data[r][COL_MED.NOM], initials:data[r][COL_MED.INITIALES],
              // (POSE TP · 22/08/2026) Quotité (col. E) : pilote l'éligibilité à la
              // tuile « Mes jours de temps partiel » et le quota annuel (CONFIG_CONGES).
              quotite: Number(data[r][COL_MED.QUOTITE]) || 100,
              liberal: colLib >= 0 && String(data[r][colLib]).trim().toUpperCase() === 'O',
              // DONNEE NOMINATIVE. Le RPPS vit UNIQUEMENT dans le classeur prive, jamais
              // dans le depot (public). Il n'est renvoye qu'au MAR identifie par SON code
              // personnel, et pour sa seule ligne : personne ne recoit le RPPS d'un autre.
              rpps: colRpps >= 0 ? String(data[r][colRpps] == null ? '' : data[r][colRpps]).trim() : '',
              // DONNEE NOMINATIVE, meme regime que le RPPS : classeur prive uniquement,
              // renvoyee au seul MAR identifie par son propre code.
              prenom: colPre >= 0 ? String(data[r][colPre] == null ? '' : data[r][colPre]).trim() : '',
              /* (08/09/2026) Tuiles reservees. Ce champ existe AUSSI dans la cle
                 `acces` de la copie rapide (miroir.gs, meme format CONFIG). Les
                 DEUX chemins doivent le porter : sinon la tuile s'affiche quand
                 le relais repond et disparait des qu'il est en panne. */
              tuiles: _tuilesPriveesDe_(tuilesBrut, data[r][COL_MED.ID])};
    }
  }
  return null;
}

// ── JOURS FÉRIÉS ─────────────────────────────────────────────────────
// (C3) Définition unique : getJoursFeries() est global, défini dans code.gs.

// ── CALCUL PRIORITÉS VACANCES ─────────────────────────────────────────
// ── Cache PAR-EXÉCUTION des onglets partagés (process neuf à chaque requête →
// jamais de données périmées). Évite que getVacConfig relise GROUPES_VAC / PERIODES_VAC /
// INDISPOS / MEDECINS une fois PAR médecin (getConflitsAll boucle sur ~20 MARs).
var _VAC_SHARED = {};
/* (11/09/2026) QUOTA D'INDISPONIBILITÉS — source unique.
   Mesuré sur la grille 2027, effectif réel, congés/formations/temps partiels
   posés au quota entier, trois tirages par configuration, et les
   indisponibilités placées dans le PIRE cas — toutes sur des samedis et des
   dimanches. L'équité (écart réel-cible ≤ 1) tient jusqu'à 36 par MAR et
   décroche à 37 sur les trois tirages ; la couverture tient bien au-delà.
   25 laisse donc 30 % de marge, et cette marge n'est pas du luxe : la mesure
   tire les dates au hasard, la vraie vie fait converger tout le monde sur les
   mêmes ponts. Vérifié aussi : à 25, la part de week-end n'a AUCUN effet —
   inutile de compliquer la règle par un sous-quota. */
const QUOTA_INDISPO = 20;
/* (11/09/2026) SOUS-QUOTA WEEK-END — vendredis, samedis et dimanches, 8 par an.
   POURQUOI LE VENDREDI EN FAIT PARTIE. La garde de week-end est une UNITÉ
   vendredi+dimanche, assurée par le même binôme ; le samedi revient à d'autres.
   Bloquer le seul vendredi sort donc de l'unité entière. Compter samedi et
   dimanche seuls laissait une faille béante : une indisponibilité de vendredi
   évitait tout le week-end sans rien consommer du sous-quota. Les trois jours
   comptés sont exactement ceux qui retirent d'un axe de garde.
   À DIRE HONNÊTEMENT : ce plafond ne protège PAS de ce qu'on croit. Mesuré,
   trois week-ends bloqués PAR TOUT LE MONDE suffisent à rendre la génération
   impossible, et 3 est en dessous de 8 : vingt personnes qui visent le même
   pont n'en dépensent qu'un chacune, quel que soit le plafond. Ce que 8 réduit,
   c'est l'empilement ACCIDENTEL, quand chacun pose au hasard.
   Ce qui protégerait vraiment de l'empilement volontaire est un seuil PAR DATE,
   comme le vert/jaune/noir des congés — mesuré à 18 personnes sur 22 pour un
   même week-end. Ce n'est pas construit : si la question revient, c'est là
   qu'il faut aller, pas vers un plafond par personne plus bas. */
const QUOTA_INDISPO_WE = 8;   // vendredi, samedi ou dimanche

let _quotasCache = null;
// ── (RH-C) ACTIONS D'ÉCRITURE SÉRIALISÉES PAR VERROU ─────────────────
// Toute action de cette liste prend le verrou de script avant de s'exécuter :
// les écritures se font une par une, jamais entremêlées. Élimine les courses
// « lire-modifier-écrire » (écrasement de ligne d'indispos, don de garde
// dupliqué, suppression de la mauvaise ligne après décalage).
// EXCLUS volontairement :
//  - savePlanningOverride : verrou dédié déjà en place (même verrou de script
//    → exclusion mutuelle assurée avec deleteOverride et les autres écritures) ;
//  - savePlanningOverridesBatch : même verrou dédié (code.gs), mêmes garanties ;
//  - markVeille : écriture d'une cellule ciblée, lignes jamais supprimées ;
// INCLUS (routées par portail.gs mais écrivantes — le verrou est vérifié AVANT
// la délégation, par nom d'action) :
//  - declareLiberal : lire-modifier-écrire avec fusion sur LIBERAL_{Y} ;
//  - deleteLiberal  : supprime une ligne (décalage → ciblage par ID, pas par n° de ligne).
//  - genererCRH : aucune écriture de données ;
//  - sendCodes* / envoyerRecapIndispos : emails (lents, pas d'écriture à risque).
// NB : pas de releaseLock explicite — Google libère le verrou automatiquement
// à la fin de chaque exécution.
// (18/08/2026) _rangRole_ supprimé : le rang de tri vit dans le module partagé
// dispo_jour (partage/dispo_jour.js) — la copie locale n'avait plus d'appelant.

const WRITE_ACTIONS_LOCK = new Set([
  'addMedecinToGroupe', 'annulerAbsenceLongue', 'applyModification',
  'archiveYear', 'clearIndisposYear', 'creerEchange', 'deleteOverride',
  'generateGardes', 'initYear', 'poserAbsenceLongue', 'publishPlanning',
  'repondreEchange',
  'saveAffectations', 'saveAffectationsMar', 'saveConfig', 'saveGroupes',
  'resetCodeMar',
  'saveIndispos', 'saveIndisposBatch', 'saveMedecin', 'savePeriodes', 'setActiveYear',
  'setDailyStatus', 'setIndisposYear',
  'declareLiberal', 'deleteLiberal',
]);

// (Lot 5-bis) PERIMETRE DU ROLE SECRETARIAT — liste blanche, REFUS PAR DEFAUT.
// Le code du secretariat est PARTAGE : son perimetre se definit ici, en un seul
// endroit, et JAMAIS par des gardes ajoutees action par action (audit du 24/07 :
// 10 actions d'Indispos.gs sont ouvertes a tout code valide, dont saveIndispos
// qui ECRIT, et getStatsLive qui renvoie des stats nominatives).
// ⚠️ NE JAMAIS y ajouter getPlanningJson ni getAffectationsJson : planning_{Y}.json
// contient le CODE D'ABSENCE BRUT de chaque MAR pour toute l'annee (code.gs : la
// valeur de GARDES_{Y} est recopiee dans `status`). Les y autoriser contournerait
// la regle « dates seules » de l'ecran Consultations a venir.
const SECRETARIAT_ACTIONS = new Set([
  'login',
  'getConsultAbsences',
]);

function _routeRequete_(e) {
  try {
    const payload = JSON.parse(e.parameter.payload || '{}');
    const action = payload.action;
    const code = payload.code;

    if (action === 'getActiveYear') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, year: TEST_YEAR
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (03/08/2026) Quelles annees sont consultables ?
       admin.html testait l'existence de « ./archives/stats_{annee}.json » sur le site —
       fichier qui n'a JAMAIS ete cree : depuis le passage au Drive prive, l'archivage
       ecrit « archives_stats_{annee}.json » sur Drive. Le selecteur ne pouvait donc
       jamais proposer une annee cloturee. planning.html, lui, sondait les annees une par
       une (un appel par annee, or Apps Script serialise les executions d'un meme
       utilisateur : 1 sonde en 2026, 5 en 2030, 10 en 2035).
       Un seul appel repond desormais pour les deux pages. Pas de controle de role :
       c'est une liste d'annees, et planning.html est la page des MAR. */
    if (action === 'getAnneesDisponibles') {
      const vues = {};
      const scan = (classeur, archivee) => {
        try {
          classeur.getSheets().forEach(sh => {
            const m = sh.getName().match(/^GARDES_(\d{4})$/);
            if (!m) return;
            const y = Number(m[1]);
            if (vues[y] === undefined) vues[y] = archivee;
          });
        } catch (e) { /* classeur inaccessible : on garde ce qu'on a */ }
      };
      scan(SpreadsheetApp.getActiveSpreadsheet(), false);
      try { scan(SpreadsheetApp.openById(ARCHIVE_SS_ID), true); } catch (e) {}
      const annees = Object.keys(vues).map(Number).sort()
        .map(y => ({ annee: y, archivee: vues[y] }));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, active: TEST_YEAR, annees
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const user = checkCode(code);
    if (!user) {
      /* (01/08/2026) DEUX CAUSES, DEUX MESSAGES.
         Mesure du 01/08 a 13:50 : le premier getAdminBootstrap d'une ouverture est
         revenu « Code invalide » apres 44 s d'attente pour 14 ms de travail serveur.
         Or 14 ms ne correspond qu'a UN chemin dans checkCode : le retour immediat
         sur code vide, avant toute lecture d'onglet (un code faux, lui, coute une
         lecture de MEDECINS). Impossible de trancher : les deux causes rendaient le
         meme message. On les distingue desormais.
         Sans risque : aucun code valide n'est revele, et le message ne dit que si le
         champ etait vide — information que l'appelant possede deja. */
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: String(code == null ? '' : code).trim()
               ? 'Code invalide'
               : 'Code absent de la requête'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    // (Lot 5-bis) REFUS PAR DEFAUT du role secretariat. Place ICI, juste apres
    // checkCode et AVANT le verrou d'ecriture et tout traitement d'action : rien
    // ne peut etre atteint qui ne figure pas dans SECRETARIAT_ACTIONS.
    if (user.role === 'secretariat' && !SECRETARIAT_ACTIONS.has(action)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: 'Action non autorisée pour ce code'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    // (RH-C) Verrou d'écriture global : sérialise les actions qui modifient
    // les données. Les lectures ne prennent jamais le verrou (dashboard fluide).
    /* (01/08/2026) TOUTE ECRITURE VIDE LE CACHE DE CONFIGURATION.
       Place ICI et non action par action : WRITE_ACTIONS_LOCK est la liste de
       reference des ecritures, et l'accrocher a cette liste garantit qu'aucune
       action nouvelle ne sera oubliee. L'invalidation est parfois inutile (une
       ecriture de planning ne touche pas SECTEURS) : cela coute une relecture
       d'onglet, jamais une donnee perimee. Le sens de l'erreur est le bon. */
    if (WRITE_ACTIONS_LOCK.has(action)) {
      /* (31/08/2026) COMPTEUR D'USAGE. Placé ICI pour la même raison que
         l'invalidation du cache juste dessous : WRITE_ACTIONS_LOCK est la liste
         de référence des écritures, s'y accrocher garantit qu'aucune action
         nouvelle ne sera oubliée. On compte la TENTATIVE, pas la réussite : le
         point de sortie est unique ici, il ne l'est plus après. Les lectures ne
         sont JAMAIS comptées — une écriture par ouverture d'écran ralentirait
         tout le portail. */
      try { _statsActionIncr_(SpreadsheetApp.getActiveSpreadsheet(), user.role, action); } catch (e) {}
      try { viderCacheConfig(); } catch (e) {}
      const _wl = LockService.getScriptLock();
      if (!_wl.tryLock(20000)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false,
          error: 'Une autre opération d\'écriture est en cours — réessayez dans quelques secondes.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // (B1 sécurité) getStatus / getStatsLive : désormais code-gated (données nominatives)
    // Purge manuelle du cache de configuration (bouton de l'onglet Maintenance).
    // Utile apres une modification faite A LA MAIN dans le classeur, ou pour
    // rendre immediate la revocation d'un code d'acces.
    if (action === 'viderCacheConfig') {
      if (user.role !== 'admin') return _deny();
      viderCacheConfig();
      return ContentService.createTextOutput(JSON.stringify({
        success: true, message: 'Cache de configuration vidé — la prochaine lecture ira au classeur.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getStatus') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, status: getPlanningStatus()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getStatsLive') {
      const statsYear = Number(payload.year) || TEST_YEAR;
      try {
        return ContentService.createTextOutput(JSON.stringify({success:true, stats:computeStatsLive(statsYear)}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error(err.message); }
    }
    if (action === 'login') {
      logConnexion(user);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, role: user.role, id: user.id,
        // Membre du groupement liberal (colonne LIBERAL de MEDECINS) : pilote
        // l'affichage de la tuile Module liberal du dashboard.
        liberal: !!user.liberal,
        // N° RPPS du MAR connecte (colonne RPPS de MEDECINS) : pre-remplit l'identite
        // du praticien sur les devis du module liberal. Chaine vide si non renseigne.
        rpps: user.rpps || '',
        // Prenom (colonne PRENOM de MEDECINS) : complete le nom sur les devis du
        // module liberal. Chaine vide si la colonne est absente ou non renseignee.
        prenom: user.prenom || '',
        // (08/09/2026) Tuiles reservees (CONFIG / TUILES_PRIVEES) : meme contenu
        // que le champ `tuiles` de l'identite servie par la copie rapide.
        tuiles: user.tuiles || [],
        /* (08/09/2026) Titre affiche et regime de souhaits garantis, deduits de
           MEDECINS. MEME contenu que les champs servis par la copie rapide
           (_effectifTitres_ dans miroir.gs) : les pages ne doivent pas afficher
           « Dr » quand le relais tombe et « Pr » quand il repond. */
        titresPr: _effectifTitresGas_().titresPr,
        souhaitsPlafond: _effectifTitresGas_().souhaitsPlafond,
        name: user.name, initials: user.initials, 
        year: TEST_YEAR, indisposYear: getIndisposYear(),
        // Campagne de saisie en cours ? Pilote l'affichage de la tuile
        // « Mes indisponibilités » du dashboard (masquée hors campagne).
        indisposOuverte: _indisposOuverte_(),
        // (26/08/2026) Campagne figée : la tuile passe en « consultation seule »
        // dès le portail — même information que le verrou de l'écran indispos.
        indisposFigees: _indisposFigees_(),
        // (POSE TP · 22/08/2026) Phase de pose des temps partiels (déduite) +
        // profil du MAR : la tuile « Mes jours de temps partiel » ne s'affiche
        // que si phaseTp.actif ET quotite < 100 ET !tpFixe. Aucun nom en dur :
        // jours fixes et rythme 2/2 s'excluent par leurs colonnes MEDECINS.
        phaseTp: _phaseTp_(),
        quotite: user.quotite || 100,
        tpFixe: _tpFixeDe_(user.id),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (01/09/2026) LE RELIQUAT DE CONGÉS, MAR par MAR.
       Après la génération, le comité place ce qui n'a pas été posé pendant la
       campagne : encore faut-il savoir ce qu'il reste. Le chiffre existait au
       staff, mais seulement pour les vacances, et seulement avant la
       génération. Ici : vacances, formations et temps partiels, à jour.
       ⚠️ La SOURCE change avec l'état de l'année. Tant que le planning n'est
       pas généré, tout vit dans INDISPOS_{Y}. Une fois généré, l'onglet
       Statuts écrit dans GARDES_{Y} et JAMAIS dans INDISPOS : compter dans
       INDISPOS raterait tout ce que le comité a posé depuis. GARDES fait donc
       foi dès qu'il existe. */
    if (action === 'getReliquats') {
      if (user.role !== 'admin') return _deny();
      const anR = Number(payload.year) || getActiveYear();
      return ContentService.createTextOutput(JSON.stringify(computeReliquats(anR)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getNoelAnEligibles') {
      const yr = parseInt(payload.year) || getIndisposYear();
      const _rep = { success: true, year: yr,
                     eligibles: computeNoelAnEligibles(yr, payload.tous === true) };
      /* (01/09/2026) `historique` : l'ÉQUIPE ENTIÈRE avec toutes ses années de
         Noël, pour le tableau du staff. Champ à part, volontairement : le
         contrôle du W2 (admin.html) travaille sur `eligibles`, c'est-à-dire les
         seuls PRIORITAIRES. Élargir cette liste-là ferait signaler comme
         bloquants des MAR que le comité n'a aucune raison de retenir. */
      if (payload.historique === true) _rep.historique = computeNoelAnHistorique(yr);
      return ContentService.createTextOutput(JSON.stringify(_rep))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getIndispos') {
      const targetId = user.role === 'admin' ? payload.doctorId : user.id;
      return ContentService.createTextOutput(JSON.stringify({
        success: true, indispos: getIndisposForDoctor(targetId, getIndisposYear())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (LOT 4 · 22/08/2026) LES DÉCISIONS DU COMITÉ sur les jours sous réserve.
       Quatre gestes, tous annulables depuis l'écran, tous journalisés :
       · valider            : la TPA du MAR devient TP (souveraineté comité,
                              passe par _poserTp_ — quota et journal compris)
       · annuler_validation : le TP redevient TPA (même chemin)
       · refuser            : le JOUR se ferme pour TOUTE l'équipe (TP_FERMES),
                              et chaque TPA posée ce jour-là est rendue — elles
                              ne pourraient jamais être validées. La réponse
                              liste qui a été rendu, pour l'annulation.
       · annuler_refus      : le jour rouvre, les TPA rendues sont rétablies.
       AUCUNE notification : le comité le dit de vive voix (maquette). */
    /* (23/08/2026) DÉCISIONS EN LOT — le comité peut marquer toute sa liste
       puis enregistrer d'un coup. Chaque décision est traitée exactement comme
       une décision isolée (mêmes contrôles, mêmes notifications) ; seule la
       republication est mutualisée, puisqu'elle est de toute façon différée et
       dédoublonnée. Un échec sur une ligne n'arrête pas les autres : la réponse
       dit ce qui est passé et ce qui ne l'est pas. */
    if (action === 'deciderJourTpLot') {
      if (user.role !== 'admin') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Réservé au comité' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const liste = payload.decisions || [];
      const detail = [];
      let faits = 0, rates = 0;
      liste.forEach(function (d) {
        try {
          const r = _routeRequete_({ parameter: { payload: JSON.stringify({
            action: 'deciderJourTp', code: payload.code, year: payload.year,
            decision: d.decision, doctorId: d.doctorId, date: d.date, retablir: d.retablir || {},
          }) } });
          const rep = JSON.parse(r.getContent());
          if (rep && rep.success) faits++; else rates++;
          detail.push({ date: d.date, doctorId: d.doctorId, decision: d.decision,
                        success: !!(rep && rep.success), error: rep && rep.error,
                        rendues: rep && rep.rendues });
        } catch (eL) {
          rates++;
          detail.push({ date: d.date, doctorId: d.doctorId, decision: d.decision,
                        success: false, error: eL.message });
        }
      });
      logAction('deciderJourTpLot par ' + user.id + ' — ' + faits + ' décision(s) appliquée(s), ' + rates + ' échec(s)');
      return ContentService.createTextOutput(JSON.stringify({ success: true, faits: faits, rates: rates, detail: detail }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deciderJourTp') {
      /* (23/08/2026 — refonte) LE COMITÉ ÉCRIT DANS LE PLANNING.
         Valider, c'est écrire TP dans GARDES_{Y} et republier : sans ça, le
         jour resterait un enregistrement sans effet. Refuser, c'est fermer le
         jour pour toute l'équipe — rien n'ayant jamais touché le planning,
         il n'y a rien à défaire. Tout est annulable, tout est journalisé. */
      if (user.role !== 'admin') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Réservé au comité' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const phD = _phaseTp_();
      if (!phD.actif) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Aucune phase de pose active' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ds = String(payload.date || '').trim();
      const anneeD = Number(ds.slice(0, 4));
      if (phD.annees.indexOf(anneeD) === -1) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'L\'année ' + anneeD + ' n\'est pas ouverte à la pose' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const decision = String(payload.decision || '').trim();
      let out = { success: false, error: 'décision inconnue : ' + decision };

      if (decision === 'valider') {
        const cibleId = String(payload.doctorId || '').trim();
        const attend = _tpDemandes_(anneeD, cibleId).some(function (x) { return x.date === ds; });
        if (!attend) {
          out = { success: false, error: 'Cette demande n\'est plus en attente' };
        } else if (!_tpGrilleEcrire_(anneeD, cibleId, ds, 'TP')) {
          out = { success: false, error: 'La case du planning n\'est plus libre ce jour-là' };
        } else {
          _tpDemandeRetirer_(anneeD, ds, cibleId);
          _tpRepublier_(anneeD);
          logAction('deciderJourTp VALIDE ' + ds + ' (' + anneeD + ') ' + cibleId + ' par ' + user.id + ' — planning republié');
          _tpNotifier_('Temps partiel validé',
            'Votre jour du ' + _tpJourLisible_(ds) + ' est validé par le comité.', cibleId);
          out = { success: true, date: ds, doctorId: cibleId };
        }
      }

      if (decision === 'annuler_validation') {
        const cibleId = String(payload.doctorId || '').trim();
        if (!_tpGrilleEcrire_(anneeD, cibleId, ds, '')) {
          out = { success: false, error: 'Ce jour n\'est plus un temps partiel accordé' };
        } else {
          _tpDemandeAjouter_(anneeD, ds, cibleId);      // il repasse en attente
          _tpRepublier_(anneeD);
          logAction('deciderJourTp ANNULE-VALIDATION ' + ds + ' (' + anneeD + ') ' + cibleId + ' par ' + user.id);
          _tpNotifier_('Temps partiel remis en attente',
            'Votre jour du ' + _tpJourLisible_(ds) + ' repasse en attente de validation.', cibleId);
          out = { success: true, date: ds, doctorId: cibleId };
        }
      }

      if (decision === 'refuser') {
        _tpFermerJour_(anneeD, ds, user.id);
        const rendues = {};
        _tpDemandes_(anneeD).forEach(function (x) {
          if (x.date !== ds) return;
          rendues[x.mar] = 'TPA';
          _tpDemandeRetirer_(anneeD, ds, x.mar);
        });
        logAction('deciderJourTp REFUS ' + ds + ' (' + anneeD + ') par ' + user.id +
                  ' — ' + Object.keys(rendues).length + ' demande(s) rendue(s) : ' + Object.keys(rendues).join(', '));
        /* Le jour se ferme pour toute l'équipe, mais SEULS ceux qui l'avaient
           demandé sont prévenus — les autres le verront simplement noir. */
        Object.keys(rendues).forEach(function (idR) {
          _tpNotifier_('Temps partiel refusé',
            'Votre jour du ' + _tpJourLisible_(ds) + ' n\'a pas pu être accordé : l\'équipe serait trop réduite.', idR);
        });
        out = { success: true, date: ds, fermes: Array.from(_tpFermes_(anneeD)).sort(), rendues: rendues };
      }

      if (decision === 'annuler_refus') {
        _tpRouvrirJour_(anneeD, ds);
        const retablies = [];
        Object.keys(payload.retablir || {}).forEach(function (idR) {
          _tpDemandeAjouter_(anneeD, ds, idR);
          retablies.push(idR);
        });
        logAction('deciderJourTp ANNULE-REFUS ' + ds + ' (' + anneeD + ') par ' + user.id +
                  ' — rétabli : ' + (retablies.join(', ') || 'personne'));
        retablies.forEach(function (idR) {
          _tpNotifier_('Temps partiel de nouveau en attente',
            'Le ' + _tpJourLisible_(ds) + ' rouvre : votre demande est rétablie, en attente du comité.', idR);
        });
        out = { success: true, date: ds, fermes: Array.from(_tpFermes_(anneeD)).sort(), retablies: retablies };
      }

      return ContentService.createTextOutput(JSON.stringify(out))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* (LOT 3 · 22/08/2026) Repli GAS de la clé pose_tp_{Y} : même contenu,
       filtré à l'identité pour un rôle mar (le comité voit tout — écran du
       lot 4). Sert quand le relais est injoignable ou la clé pas encore
       poussée. Lecture seule, aucun verrou. */
    if (action === 'getPoseTp') {
      const ph = _phaseTp_();
      if (!ph.actif) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, ferme: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const anneeG = (ph.annees.indexOf(Number(payload.year)) !== -1) ? Number(payload.year) : ph.annee;
      const t = _construirePoseTp_(anneeG);
      t.annees = ph.annees;                      // (LOT 5) l'écran apprend ici quelles années sont ouvertes
      if (user.role !== 'admin') {
        const mien = {};
        if (t.parMar && t.parMar[user.id]) mien[user.id] = t.parMar[user.id];
        t.parMar = mien;
      }
      return ContentService.createTextOutput(JSON.stringify(t))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveIndispos') {
      const targetId = user.role === 'admin' ? payload.doctorId : user.id;
      /* (POSE TP · 22/08/2026) DEUX CIRCUITS, DEUX ANNÉES — jamais l'un vers l'autre.
         · mode TP (payload.tp === true) : vise l'année de la PHASE (_phaseTp_),
           JAMAIS getIndisposYear() — qui se replie en silence sur l'année active
           hors campagne, et enverrait les TP dans la mauvaise année.
         · mode campagne (défaut) : comportement historique, PLUS le verrou qui
           manquait — saveIndispos n'interrogeait jamais _indisposOuverte_ : rien
           n'empêchait un rôle mar d'écrire hors campagne. Le rôle admin n'est pas
           verrouillé : le comité reste maître des corrections VAC/FORM. */
      if (payload.tp === true) {
        const ph = _phaseTp_();
        if (!ph.actif) return _error('La pose des jours de temps partiel n\'est pas ouverte : aucune année générée.');
        /* (LOT 5) Deux années peuvent être ouvertes à la fois (fin 2027 :
           le reliquat 2027 ET 2028). L'écran dit laquelle il montre ; toute
           autre valeur est refusée — jamais de repli silencieux d'année. */
        const anneeTp = Number(payload.year) || ph.annee;
        if (ph.annees.indexOf(anneeTp) === -1) {
          return _error('L\'année ' + anneeTp + ' n\'est pas ouverte à la pose (ouvertes : ' + ph.annees.join(', ') + ').');
        }
        return ContentService.createTextOutput(JSON.stringify(
          _poserTp_(user, targetId, payload.indispos, anneeTp)
        )).setMimeType(ContentService.MimeType.JSON);
      }
      if (user.role !== 'admin' && !_indisposOuverte_()) {
        return _error('La campagne de saisie est fermée : indisponibilités et souhaits ne peuvent plus être enregistrés.');
      }
      const anneeInd = getIndisposYear();
      /* (LOT A · 01/09/2026) LE TEMPS PARTIEL REVIENT DANS LA CAMPAGNE.
         Le 23/08 les TP avaient été sortis d'INDISPOS : ils se posaient APRÈS
         la génération, pour ne pas contraindre l'algorithme. Le comité a
         tranché l'inverse le 01/09 — un MAR à temps partiel pose ses jours EN
         MÊME TEMPS que ses indisponibilités et ses gardes souhaitées, sur le
         même écran. Le reliquat non posé reste plaçable au fil de l'eau, dans
         les trous du planning, par le circuit dédié (payload.tp === true).
         Mesuré avant de rouvrir : 260 jours de TP posables par 8 MAR, ajoutés
         aux indisponibilités réelles 2027, ne dégradent ni l'équité (écart
         maximal 1,6 pour un plafond de 2) ni les gardes rapprochées.
         Le TP est un CONGÉ : il est exclusif d'une indisponibilité ou d'une
         garde souhaitée le même jour — une case ne porte qu'un code, poser un
         TP remplace ce qui s'y trouvait. Le quota annuel (CONFIG_CONGES,
         colonne CTP) est vérifié ICI : l'écran peut retarder, le serveur non. */
      const existantC = getIndisposForDoctor(targetId, anneeInd);
      const envoyeC = {}, tpRefuses = [];
      const quotaTpC = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;
      const sansTpProfil = _tpFixeDe_(targetId) || quotaTpC <= 0;
      const jfC = getJoursFeries(anneeInd);
      let nbTpC = 0;
      /* (11/09/2026) QUOTA D'INDISPONIBILITÉS — vérifié ICI, comme le TP :
         l'écran peut retarder d'une version, le serveur non.
         On compte SUR L'ENVOI, et c'est le bon compte : l'écran envoie toujours
         la carte complète de l'année, jamais un delta, et _fusionIndispos_
         retire ce qui n'y figure pas pour les codes appartenant au MAR. L'envoi
         est donc l'état final de ses indisponibilités.
         Écrit puis corrigé le même jour : la première version ajoutait au compte
         les INDISPO déjà enregistrées absentes de l'envoi — or la fusion allait
         justement les supprimer. Elle facturait deux fois des jours retirés, et
         le banc l'a prise en défaut sur « redescendre à 5 puis remonter à 25 ».
         Le comité n'est pas plafonné : il arbitre des cas particuliers, et le
         refuser l'obligerait à passer par le classeur. */
      const indRefuses = [];
      let nbIndC = 0, nbIndWeC = 0;
      Object.keys(payload.indispos || {}).forEach(function (ds) {
        const v = String(payload.indispos[ds] || '').trim().toUpperCase();
        if (v === 'INDISPO' && user.role !== 'admin') {
          if (nbIndC >= QUOTA_INDISPO) { indRefuses.push(ds); return; }
          const _dowI = new Date(ds + 'T12:00:00').getDay();
          if (_dowI === 0 || _dowI === 5 || _dowI === 6) {
            if (nbIndWeC >= QUOTA_INDISPO_WE) { indRefuses.push(ds + ' (week-end)'); return; }
            nbIndWeC++;
          }
          nbIndC++; envoyeC[ds] = payload.indispos[ds]; return;
        }
        if (v !== 'TP' && v !== 'TPA') { envoyeC[ds] = payload.indispos[ds]; return; }
        /* TPA n'a pas de sens dans la campagne : il n'y a pas encore de
           planning, donc rien à mettre « sous réserve ». Tout devient TP. */
        if (sansTpProfil) { tpRefuses.push(ds + ' (profil sans jours de temps partiel)'); return; }
        const dow = new Date(ds + 'T12:00:00').getDay();
        if (dow === 0 || dow === 6 || jfC.has(ds)) { tpRefuses.push(ds + ' (jour non travaillé)'); return; }
        if (nbTpC >= quotaTpC) { tpRefuses.push(ds + ' (quota de ' + quotaTpC + ' atteint)'); return; }
        nbTpC++; envoyeC[ds] = 'TP';
      });
      if (tpRefuses.length) logAction('saveIndispos ' + targetId + ' (' + anneeInd + ') : ' +
        tpRefuses.length + ' TP refusés — ' + tpRefuses.slice(0, 20).join(', '));
      if (indRefuses.length) logAction('saveIndispos ' + targetId + ' (' + anneeInd + ') : ' +
        indRefuses.length + ' indispo(s) refusée(s), quota de ' + QUOTA_INDISPO +
        ' atteint — ' + indRefuses.slice(0, 20).join(', '));
      // Fusion par proprietaire de code — voir _fusionIndispos_.
      // NE PAS remonter cette logique dans saveIndisposForDoctor : ce helper
      // sert aussi a l'absence longue, qui doit continuer a poser une ligne
      // complete. La regle de propriete n'a de sens qu'ici, ou l'on connait
      // le role de l'appelant.
      const fusion = _fusionIndispos_(existantC, envoyeC, user.role === 'admin');
      return ContentService.createTextOutput(JSON.stringify({
        success: saveIndisposForDoctor(targetId, fusion, anneeInd)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── STAFF VACANCES : ENREGISTREMENT DE TOUS LES MARs EN UN APPEL ──
    // « Valider et verrouiller » appelait saveIndispos une fois PAR MAR :
    // 23 allers-retours serialises par Apps Script, ~3 min en reel, au point
    // de passer pour un plantage. Ici : 1 aller-retour, 1 lecture d'onglet,
    // 1 ecriture de bloc. Meme regle de fusion que saveIndispos (le comite
    // ne remplace que les VAC/FORM et ne touche pas aux saisies des MARs).
    if (action === 'saveIndisposBatch') {
      if (user.role !== 'admin') return _deny();
      const anneeB = getIndisposYear();
      const ssB = SpreadsheetApp.getActiveSpreadsheet();
      const shB = ssB.getSheetByName(`INDISPOS_${anneeB}`);
      if (!shB) return _error(`INDISPOS_${anneeB} introuvable`);
      const dataB = shB.getDataRange().getValues();
      const datesB = reconstruireDatesHeaders(dataB, anneeB);
      const envoi = payload.indispos || {};
      const inconnus = [];
      let touches = 0;
      // matrice complete relue depuis l'onglet : les lignes non visees
      // sont reecrites a l'identique, jamais perdues.
      const bloc = [];
      for (let r = 3; r < dataB.length; r++) {
        bloc.push(datesB.map((d, i) => d ? String(dataB[r][i + 1] || '').trim() : ''));
      }
      Object.keys(envoi).forEach(function (marId) {
        const id = String(marId).trim();
        let ligne = -1;
        for (let r = 3; r < dataB.length; r++) {
          if (String(dataB[r][0]).trim() === id) { ligne = r - 3; break; }
        }
        if (ligne < 0) { inconnus.push(id); return; }
        const existant = {};
        datesB.forEach(function (d, i) { if (d && bloc[ligne][i]) existant[d] = bloc[ligne][i]; });
        const fusion = _fusionIndispos_(existant, envoi[marId], true);  // true = comite
        bloc[ligne] = datesB.map(d => d ? (fusion[d] || '') : '');
        touches++;
      });
      if (bloc.length) shB.getRange(4, 2, bloc.length, datesB.length).setValues(bloc);
      logAction(`saveIndisposBatch : ${touches} MAR(s) enregistre(s)` +
                (inconnus.length ? ` — introuvables : ${inconnus.join(', ')}` : ''));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, saved: touches, inconnus: inconnus
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getAllIndispos') {
  if (user.role !== 'admin') return _deny();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const indYear = Number(payload.year) || getIndisposYear();
  const sheet = ss.getSheetByName(`INDISPOS_${indYear}`);
      if (!sheet) return _error(`INDISPOS_${indYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dates = reconstruireDatesHeaders(data, indYear); // (C3b) helper unifié
      const result = {};
      for (let r = 3; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        result[id] = {};
        dates.forEach((date, i) => {
          if (!date) return;
          const val = String(data[r][i+1]||'').trim();
          if (val) result[id][date] = val;
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true, data: result, year: indYear
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'applyModification') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify({
        success: applyModification(payload.modification)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (13/08/2026 — échanges, phase 3) Les DEUX verbes du circuit pair-à-pair.
       Ouverts aux rôles mar ET admin (le secrétariat est déjà refusé par
       défaut en amont). Le demandeur est TOUJOURS user.id — résolu par
       checkCode, jamais lu du payload. Toute erreur (contrôle refusé à la
       création, demande introuvable, mauvais répondeur…) revient en
       success:false avec son motif : c'est un verdict, pas une panne. */
    if (action === 'creerEchange') {
      if (!_echangesAutorise_(user)) return _deny();
      try {
        return ContentService.createTextOutput(JSON.stringify(Object.assign(
          { success: true }, creerEchange(user, payload)
        ))).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, error: String(err.message)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    if (action === 'repondreEchange') {
      if (!_echangesAutorise_(user)) return _deny();
      try {
        return ContentService.createTextOutput(JSON.stringify(Object.assign(
          { success: true }, repondreEchange(user, payload)
        ))).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, error: String(err.message)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'getStats') {
  if (user.role !== 'admin') return _deny();
  const statsYear = Number(payload.year) || TEST_YEAR;
  // (03/08/2026) Repli archives, meme raison que getGardes ci-dessus.
  const ss = _ssWithSheet(`STATS_GARDES_${statsYear}`) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`STATS_GARDES_${statsYear}`);
  if (!sheet) return _error(`Onglet STATS_GARDES_${statsYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const stats = [];
      for (let r = 1; r < data.length; r++) {
        if (!data[r][0]) continue;
        stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
          g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
          jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
          recupR:data[r][12], h18:data[r][13],
          jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, stats}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'generateGardes') {
  if (user.role !== 'admin') return _deny();
  logAction('DEBUG generateGardes: payload.year=' + payload.year + ' TEST_YEAR=' + TEST_YEAR);
  const yearToGenerate = Number(payload.year) || TEST_YEAR;
  logAction('DEBUG yearToGenerate=' + yearToGenerate);
  if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
      // ── (W2-R) Garde d'idempotence — même principe que archiveYear (15/07/2026).
      // Cas visé : la génération a RÉUSSI côté serveur mais la réponse s'est
      // perdue (réseau, onglet fermé, veille) → au réessai, generateGardes()
      // lèverait « GARDES_{Y} existe déjà — supprimez d'abord l'onglet », un
      // message que l'utilisateur pourrait suivre et DÉTRUIRE un planning valide.
      // Ici : si l'année est déjà générée ET cohérente, on ne régénère pas, on
      // renvoie les stats existantes et le wizard enchaîne sur publication/récaps.
      // Le verrou de generateGardes() reste intact (appel direct depuis l'éditeur).
      {
        const ssChk = SpreadsheetApp.getActiveSpreadsheet();
        const gChk = ssChk.getSheetByName(`GARDES_${yearToGenerate}`);
        const sChk = ssChk.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
        // Cohérence stricte : les DEUX onglets présents et STATS non vide
        // (au moins une ligne de données sous l'en-tête). Sinon → génération
        // réellement incomplète : on laisse le flux normal remonter l'erreur.
        if (gChk && sChk && sChk.getLastRow() > 1) {
          const dChk = sChk.getDataRange().getValues();
          const statsChk = [];
          for (let r = 1; r < dChk.length; r++) {
            if (!dChk[r][0]) continue;
            statsChk.push({medecin:dChk[r][0], cible:dChk[r][1], total:dChk[r][2],
              g:dChk[r][3], g2:dChk[r][4], lun:dChk[r][5], mar:dChk[r][6], mer:dChk[r][7],
              jeu:dChk[r][8], ven:dChk[r][9], sat:dChk[r][10], dim:dChk[r][11],
              recupR:dChk[r][12], h18:dChk[r][13],
              jf:dChk[r][14], vjf:dChk[r][15], vd:dChk[r][20], cSat:dChk[r][17],
              cJeu:dChk[r][18], cVd:dChk[r][19], cVjf:dChk[r][21], cJf:dChk[r][22]});
          }
          logAction(`generateGardes — ${yearToGenerate} déjà générée : reprise sans régénération (${statsChk.length} MARs)`);
          return ContentService.createTextOutput(JSON.stringify({
            success: true, alreadyDone: true, stats: statsChk
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
let _genWarn = { warnings: [], nbWarnings: 0 };
try {
  _genWarn = generateGardes(yearToGenerate) || _genWarn;
  generatePlanning(yearToGenerate);
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
        const data = sheet.getDataRange().getValues();
        const stats = [];
        for (let r = 1; r < data.length; r++) {
          if (!data[r][0]) continue;
          stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
            g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
            jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
            recupR:data[r][12], h18:data[r][13],
            jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
        }
        /* (01/09/2026) LES AVERTISSEMENTS DOIVENT SURVIVRE À LA FERMETURE DE
           L'ASSISTANT. Jusqu'ici LOGS ne gardait que leur NOMBRE : le contenu
           ne partait que dans le journal d'exécution d'Apps Script, invisible
           depuis l'application. Constaté le 01/09 — « il y a eu des
           avertissements mais je ne sais plus ce que c'était », et rien ne
           permettait de les retrouver. C'est précisément le moment où le comité
           en a besoin : ils disent quels replis l'algorithme a dû consentir.
           Plafond de 25 lignes : LOGS est purgé au-delà de 501 lignes, et le
           générateur peut en produire jusqu'à 60 — les écrire toutes chasserait
           le reste du journal. Le compte exact figure sur la ligne de tête. */
        logAction(`generateGardes ${yearToGenerate} — ${_genWarn.nbWarnings} avertissement(s)`);
        {
          const _w = _genWarn.warnings || [];
          const _MAX = 25;
          _w.slice(0, _MAX).forEach(function (t, k) {
            logAction(`  avertissement ${k + 1}/${_genWarn.nbWarnings} · ${yearToGenerate} : ${t}`);
          });
          if (_w.length > _MAX) {
            logAction(`  … ${_w.length - _MAX} avertissement(s) de plus, non détaillés (voir l'écran de génération)`);
          }
        }
        return ContentService.createTextOutput(JSON.stringify({success:true, stats,
          warnings: _genWarn.warnings, nbWarnings: _genWarn.nbWarnings}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        /* (LOT C · 01/09/2026) Un jour sans binôme n'est pas une panne : c'est
           un diagnostic. Le générateur attache la STRUCTURE (err.joursVides) ;
           la renvoyer telle quelle permet à l'écran de la mettre en forme.
           Sans elle, le comité recevait trente lignes aplaties en un seul
           paragraphe rouge, où le levier utile était noyé. */
        if (err && err.joursVides) {
          logAction('generateGardes ' + yearToGenerate + ' — bloqué : ' +
            err.joursVides.length + ' jour(s) sans binôme (' +
            err.joursVides.map(function (o) { return o.date; }).join(', ') + ')');
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: err.joursVides.length + ' jour(s) sans binôme de garde — rien n\'a été écrit.',
            joursVides: err.joursVides,
            messageComplet: err.message
          })).setMimeType(ContentService.MimeType.JSON);
        }
        return _error(err.message);
      }
    }
    if (action === 'getGardes') {
      if (user.role !== 'admin') return _deny();
      const gYear = Number(payload.year) || TEST_YEAR;              // (C3) année paramétrable
      /* (03/08/2026) Repli sur le classeur d'archives : une annee cloturee voit ses
         onglets deplaces hors du maitre, et cet endpoint repondait « introuvable ».
         L'onglet Statuts et l'equite initiale d'une annee passee etaient donc morts. */
      const ss = _ssWithSheet(`GARDES_${gYear}`) || SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(`GARDES_${gYear}`);
      if (!sheet) return _error(`Onglet GARDES_${gYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, gYear);                // (C3) ancré 1er lundi → fin du décalage + queue janvier N+1
      const result = {};
      for (let r = 3; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        Object.keys(dateToCol).forEach(date => {
          const val = String(data[r][dateToCol[date]] || '').trim();
          if (!val) return;
          if (!result[date]) result[date] = {};
          result[date][id] = val;
        });
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, data:result, year:gYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getJoursFeries') {
      if (user.role !== 'admin') return _deny();
      const fYear = Number(payload.year) || TEST_YEAR;
      const jf = [...getJoursFeries(fYear), ...getJoursFeries(fYear + 1)];
      return ContentService.createTextOutput(JSON.stringify({success:true, joursFeries: jf, year: fYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    /* (13/08/2026) Bandeau « mon ordre de passage » de la vue Mes congés.
       Lecture seule, réservée aux MAR : un code secrétariat n'y accède pas
       (liste blanche SECRETARIAT_ACTIONS), un code admin n'a pas d'identifiant
       de MAR et n'aurait donc pas de rang à afficher.
       L'année mise en avant bascule le 1er septembre : jusqu'au 31 août on
       regarde l'année en cours, après on prépare le staff de la suivante.
       C'est une règle d'affichage, tranchée ici pour que la date de référence
       soit celle du service et non celle du téléphone. */
    if (action === 'getOrdreVacances') {
      if (user.role !== 'mar') return _deny();
      const _now = new Date();
      const _an = _now.getFullYear();
      const res = getOrdreVacances(user.id, [_an, _an + 1]);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        annees: res.annees,
        anneePrincipale: (_now.getMonth() + 1) >= 9 ? _an + 1 : _an,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getVacConfig') {
      const indYear = getIndisposYear();
      const cfg = getVacConfig(user.id, indYear);
      const jf = getJoursFeries(indYear);
      const jfNext = getJoursFeries(indYear + 1);
      const _f = getMedecinFlags();
      const tpFixe = _f.rythme2sur2.has(user.id) || !!_f.tpJoursFixes[user.id];
      /* (25/08/2026) `genere` : le planning de l'année de campagne existe déjà.
         L'écran passe alors en LECTURE SEULE — les indispos ne servent plus à
         rien une fois les gardes tirées, et sans ce signal le MAR pouvait
         continuer à saisir pendant des semaines en croyant que ça comptait.
         La campagne n'est PAS fermée pour autant : la clôture (qui archive
         l'année et bascule sur la suivante) reste un geste du comité, sinon
         une simple génération d'essai basculerait tout. */
      const _dejaGenere = _indisposFigees_();   // (26/08) source unique — partagée avec la clé acces
      return ContentService.createTextOutput(JSON.stringify({
        success: true, periodes: cfg.periodes, quotaVac: cfg.quotaVac,
        quotaForm: cfg.quotaForm, quotaCtp: cfg.quotaCtp, tpFixe: tpFixe,
        /* (13/09/2026) LES DEUX PLAFONDS D'INDISPONIBILITÉS. Ils étaient ajoutés
           au retour de la fonction interne getVacConfig — que l'écran n'appelle
           PAS. Cette action-ci reconstruit sa réponse champ par champ : les deux
           quotas étaient calculés puis jetés. L'écran recevait donc null, et son
           garde-fou, conditionné à `quotaIndispo != null`, était sauté en entier.
           Un MAR a pu poser 27 indisponibilités sans rien voir passer.
           Le serveur, lui, refusait bien au-delà de 20 — mais en silence, sans
           dire lesquelles il écartait. Le pire des deux mondes.
           Le banc compare désormais les champs renvoyés ici à ceux que la page
           lit dans vacConfig. */
        quotaIndispo: QUOTA_INDISPO, quotaIndispoWe: QUOTA_INDISPO_WE,
        totalVacDoc: cfg.totalVacDoc, joursFeries: [...jf, ...jfNext],
        genere: _dejaGenere, anneeCampagne: indYear,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'setActiveYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      if (!newYear || newYear < 2026) return _error('Année invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      // (Onglet OVERRIDES retiré : registre inutilisé, jamais alimenté, non branché au planning.)
      const configSheet = ss.getSheetByName('CONFIG');
      const configData = configSheet.getDataRange().getValues();
      for (let r = 1; r < configData.length; r++) {
        if (String(configData[r][0]).trim() === 'ANNEE_ACTIVE') {
          configSheet.getRange(r + 1, 2).setValue(newYear); break;
        }
      }
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'initYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let indSheet = ss.getSheetByName(`INDISPOS_${newYear}`);
      if (indSheet) return _error(`INDISPOS_${newYear} existe déjà`);
      // ── Effectif = onglet MEDECINS (actifs), source unique (plus de MEDECINS_LIST en dur) ──
      const medSheetSrc = ss.getSheetByName('MEDECINS');
      const actifsIds = [];
      if (medSheetSrc) {
        const medSrcData = _medecinsRows_();
        for (let r = 1; r < medSrcData.length; r++) {
          const id = String(medSrcData[r][COL_MED.ID]).trim();
          const actif = String(medSrcData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
          if (id && actif) actifsIds.push(id);
        }
      }
      if (!actifsIds.length) return _error('Aucun MAR actif dans MEDECINS — vérifiez la colonne ACTIF (O/N)');
      indSheet = ss.insertSheet(`INDISPOS_${newYear}`);

      const jan1 = new Date(newYear, 0, 1);
      const dow1 = jan1.getDay();
      const offset = dow1 === 1 ? 7 : dow1 === 0 ? 1 : 8 - dow1;
      const startDate = new Date(newYear, 0, 1 + offset);
      const jan1Next = new Date(newYear + 1, 0, 1);
      const dow1Next = jan1Next.getDay();
      const offsetNext = dow1Next === 1 ? 7 : dow1Next === 0 ? 1 : 8 - dow1Next;
      const endDate = new Date(newYear + 1, 0, offsetNext);
      const days = [];
      const dLoop = new Date(startDate);
      while (dLoop <= endDate) { days.push(new Date(dLoop)); dLoop.setDate(dLoop.getDate() + 1); }

      const ROUGE = '#C0392B', GRIS_WE = '#CFD8DC', BLANC = '#FFFFFF';
      const JOURS_ABR = ['D','L','M','M','J','V','S'];
      const nCols = days.length + 1;
      indSheet.setFrozenRows(3);

      const row1 = ['MÉDECIN']; days.forEach(() => row1.push(''));
      indSheet.getRange(1, 1, 1, nCols).setValues([row1]);
      indSheet.getRange(1, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      // (UX) En-têtes de mois par tranches hebdomadaires : le mois reste visible
      // à toute position de scroll (helper partagé ecrireEntetesMois, code.gs).
      ecrireEntetesMois(indSheet, days.map(d => ({ month: d.getMonth() + 1, dow: d.getDay() })));

      const row2 = ['JOUR']; days.forEach(d => row2.push(JOURS_ABR[d.getDay()]));
      indSheet.getRange(2, 1, 1, nCols).setValues([row2]);
      indSheet.getRange(2, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      const row3 = ['N°']; days.forEach(d => row3.push(d.getDate()));
      indSheet.getRange(3, 1, 1, nCols).setValues([row3]);
      indSheet.getRange(3, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      const medRows = actifsIds.map(id => [id, ...Array(days.length).fill('')]);
      indSheet.getRange(4, 1, medRows.length, nCols).setValues(medRows);

      // ── Report des absences longues (CL) chevauchant cette année (registre ABSENCES_LONGUES) ──
      try {
        const absSheet = ss.getSheetByName('ABSENCES_LONGUES');
        if (absSheet && days.length) {
          const adata = absSheet.getDataRange().getValues();
          const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const planStart = fmt(days[0]), planEnd = fmt(days[days.length - 1]);
          const rowOf = {}; actifsIds.forEach((id, i) => { rowOf[String(id).trim().toUpperCase()] = 4 + i; });
          for (let r = 1; r < adata.length; r++) {
            const id = String(adata[r][0]).trim().toUpperCase();
            const a  = _isoDate(adata[r][1]), b = _isoDate(adata[r][2]);
            if (!id || !a || !b || !(id in rowOf)) continue;
            if (b < planStart || a > planEnd) continue;     // ne chevauche pas l'année planning
            days.forEach((day, i) => { const ds = fmt(day); if (ds >= a && ds <= b) indSheet.getRange(rowOf[id], i + 2).setValue('CL'); });
          }
        }
      } catch(e) {}

      const jfY = getJoursFeries(newYear);
      const jfYn = getJoursFeries(newYear + 1);
      days.forEach((day, i) => {
        const col = i + 2, isWE = day.getDay() === 0 || day.getDay() === 6;
        const ds = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
        const isFerie = jfY.has(ds) || jfYn.has(ds);
        if (isWE || isFerie) indSheet.getRange(2, col, 2 + medRows.length, 1).setBackground(GRIS_WE); // ligne 1 = bandeau des mois, préservé
        const nextDay = days[i + 1];
        if (!nextDay || nextDay.getMonth() !== day.getMonth()) {
          indSheet.getRange(1, col, 3 + medRows.length, 1)
            .setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
        }
      });
      indSheet.setColumnWidth(1, 120);
      for (let c = 2; c <= nCols; c++) indSheet.setColumnWidth(c, 35);
      indSheet.getRange(1, 2, 3 + medRows.length, nCols - 1).setHorizontalAlignment('center');
// ── Créer AFFECTATIONS_newYear si inexistant ──────────────────────
const affName = `AFFECTATIONS_${newYear}`;
let affSheet = ss.getSheetByName(affName);
if (!affSheet) {
  affSheet = ss.insertSheet(affName);
  const RED = '#C0392B', WHITE = '#FFFFFF';
  const MONTHS_SHORT = ['JAN','FEV','MARS','AVRIL','MAI','JUIN',
                        'JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  const affHeaders = ['MÉDECIN', ...MONTHS_SHORT.map(m => `${m} ${newYear}`)];
  affSheet.getRange(1, 1, 1, affHeaders.length).setValues([affHeaders]);
  affSheet.getRange(1, 1, 1, affHeaders.length)
    .setFontWeight('bold').setBackground(RED).setFontColor(WHITE).setHorizontalAlignment('center');
  affSheet.setColumnWidth(1, 140);
  for (let c = 2; c <= affHeaders.length; c++) affSheet.setColumnWidth(c, 90);
  affSheet.setFrozenRows(1);
  affSheet.setFrozenColumns(1);

  // Lire les MARs actifs depuis MEDECINS
  const medSheet2 = ss.getSheetByName('MEDECINS');
  const affRows = [];
  if (medSheet2) {
    const medData2 = _medecinsRows_();
    for (let r = 1; r < medData2.length; r++) {
      const id = String(medData2[r][COL_MED.ID]).trim();
      const actif = String(medData2[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
      if (id && actif) affRows.push([id, ...Array(12).fill('VOLANT')]);
    }
  }
  if (affRows.length > 0) {
    affSheet.getRange(2, 1, affRows.length, affHeaders.length).setValues(affRows);
    affSheet.getRange(2, 2, affRows.length, 12)
      .setFontColor('#64748B').setHorizontalAlignment('center');
  }
  Logger.log(`✅ ${affName} créé (${affRows.length} MARs)`);
}
      return ContentService.createTextOutput(JSON.stringify({
        success: true, message: `INDISPOS_${newYear} créé avec ${days.length} jours`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'publishPlanning') {
      if (user.role !== 'admin') return _deny();
      try {
        /* (2026-08-04.8) PUBLICATION COMBINEE : le lot de placements en
           attente arrive DANS le meme appel (payload.items) — un aller-retour
           au lieu de deux. Meme fonction que l'action dediee : lignes visees
           par (date, MAR), rejouable sans doublon. Lot vide ou absent :
           comportement inchange. */
        let _lotEcrit = 0;
        if (Array.isArray(payload.items) && payload.items.length) {
          const _resLot = savePlanningOverridesBatch(payload.items);
          _lotEcrit = (_resLot && _resLot.saved) || 0;
        }
        generatePlanning(Number(payload.year) || TEST_YEAR);
        // Notifications : arme le minuteur d'accalmie. Isolé : un échec ici
        // ne doit jamais faire échouer la publication.
        try { notifPlanifier(Number(payload.year) || TEST_YEAR); } catch (e) {}
        return ContentService.createTextOutput(JSON.stringify({
          success: true, message: `Planning ${TEST_YEAR} publié`, lotEcrit: _lotEcrit
        })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) { return _error(err.message); }
    }

    if (action === 'getVacValidation') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify({
        success: true, data: getVacValidation(getIndisposYear())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getOverrides') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify(_buildOverrides_()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deleteOverride') {
      if (user.role !== 'admin') return _deny();
      const rowIndex = Number(payload.rowIndex);
      if (!rowIndex || rowIndex < 2) return _error('Index invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('OVERRIDES');
      if (!sheet) return _error('Onglet OVERRIDES introuvable');
      sheet.deleteRow(rowIndex);
      generatePlanning();
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── (perf) BOOTSTRAP ADMIN : tout le boot en UN aller-retour ──
    // Regroupe planning + affectations + medecins + overrides. Les handlers unitaires
    // (getMedecins, getOverrides, getPlanningJson, getAffectationsJson) restent inchangés
    // et partagent les mêmes builders → réponse identique champ à champ.
    if (action === 'getAdminBootstrap') {
      if (user.role !== 'admin') return _deny();
      const jy = parseInt(payload.year) || getActiveYear();
      const out = { success: true, year: jy };
      /* (28/07/2026) L'IDENTITE REJOINT LE BOOTSTRAP — mesure du 28/07 a 10:46 :
         quatre executions lancees ensemble coutent 4 a 7 s chacune, alors qu'une
         execution SEULE coute 1,8 s. Apps Script met les executions d'un meme
         utilisateur en file : le parallelisme ne fait pas gagner de temps, il en
         fait perdre. L'ouverture d'admin appelait login PUIS getAdminBootstrap,
         soit deux executions concurrentes pour une seule information utile.
         En livrant l'identite ici, l'ouverture ne coute plus qu'UNE execution.
         Les champs ci-dessous sont EXACTEMENT ceux de l'action login, qui reste
         en place pour les autres pages et comme repli. */
      out.role = user.role; out.id = user.id;
      out.name = user.name; out.initials = user.initials;
      out.liberal = !!user.liberal;
      out.rpps = user.rpps || '';
      out.prenom = user.prenom || '';
      /* (01/08/2026) CHRONOMETRE INTERNE — mesure, ne change RIEN.
         Mesure du 01/08 a 14:53, ouverture ramenee a UN SEUL appel : doGet vaut
         3 633 ms, soit 53 % du cout total. Le travail du bootstrap est donc
         devenu le premier poste, devant le peage. Restait a savoir laquelle de
         ses dix operations le porte. `_jalon` note le temps ecoule depuis le
         jalon precedent : aucune expression n'est enveloppee, aucun try/catch
         deplace. Le detail part dans out._detail et s'affiche dans chrono(). */
      const _det = {}; let _tp = Date.now();
      const _jalon = function (nom) { const n = Date.now(); _det[nom] = n - _tp; _tp = n; };

      out.indisposYear = getIndisposYear();
      out.indisposOuverte = _indisposOuverte_();
      // (POSE TP · 22/08/2026) Mêmes trois champs que `login` : phase déduite,
      // quotité, exclusion jours fixes / rythme 2/2. Zéro lecture nouvelle
      // (CONFIG et MEDECINS sont déjà lus par ce bootstrap).
      out.phaseTp = _phaseTp_();
      out.quotite = user.quotite || 100;
      out.tpFixe = _tpFixeDe_(user.id);
      _jalon('annee + campagne (CONFIG)');
      logConnexion(user);
      _jalon('journal de connexion (ecriture)');
      try {
        const rawP = readPlanningFromDrive(`planning_${jy}.json`);
        _jalon('planning : lecture Drive');
        out.planning = rawP ? JSON.parse(rawP) : null;
        _jalon('planning : analyse JSON');
        if (!rawP) out.planningError = `planning_${jy}.json introuvable dans le Drive`;
      } catch (e) { out.planning = null; out.planningError = e.message; _jalon('planning : ECHEC'); }
      try {
        const rawA = readPlanningFromDrive(`affectations_${jy}.json`);
        out.affectations = rawA ? JSON.parse(rawA) : null;
      } catch (e) { out.affectations = null; }
      _jalon('affectations (Drive + analyse)');
      const _m = _buildMedecins_();
      out.medecins = _m.error ? [] : _m.medecins;
      _jalon('medecins (onglet)');
      /* (18/08/2026) overrides retirés du bootstrap : le widget « modifications
         en attente » a quitté admin.html — lire l'onglet PLANNING_OVERRIDES à
         chaque ouverture ne servait plus personne. _buildOverrides_ reste servi
         par l'action getOverrides. */
      // (28/07/2026 perf) Secteurs et consultations rejoignent le bootstrap.
      // Motif : chaque aller-retour coute ~1 s de DEMARRAGE (compilation des 5
      // fichiers + liaison au classeur) avant meme la moindre lecture. Deux appels
      // separes valaient donc ~2 s a chaque ouverture d'admin. Un echec ici n'est
      // jamais bloquant : la page repasse par getSecteurs / getCsTemplate.
      try { out.secteurs   = getSecteurs(); }   catch (e) { out.secteurs = null; }
      _jalon('secteurs (onglet)');
      // (01/08/2026) Seuils d'affichage (onglet SEUILS). Jamais bloquant :
      // absent ou illisible, admin.html garde ses valeurs de repli.
      try { out.seuils     = getSeuils(); }     catch (e) { out.seuils = null; }
      // (01/08/2026) Premiere annee generee par l'algorithme : le compteur de recups
      // de samedi n'a de sens qu'a partir de la. Lu ici pour ne PAS figer 2027 dans
      // admin.html — la constante vit dans generateur_gardes.gs, elle seule fait foi.
      try { out.anneeStatsFiables = PREMIERE_ANNEE_STATS_FIABLES; } catch (e) { out.anneeStatsFiables = null; }
      try { out.csTemplate = getCsTemplate(); } catch (e) { out.csTemplate = null; }
      _jalon('seuils + modele de consultations');
      /* (28/07/2026, 15 h) LE COMPTEUR DE MAILS REJOINT LE BOOTSTRAP.
         Un commentaire d'admin.html disait « NE JAMAIS le mettre dans
         getAdminBootstrap : ~1 s ajoutee a chaque ouverture ». Cette regle est
         PERIMEE et remplacee : la mesure du 28/07 donne 129 ms de travail reel
         pour cette action, quand un appel separe coute 2,4 s au total (le peage
         d'entree d'Apps Script, mesure a 2-3 s sur une requete vide). Le fusionner
         SUPPRIME un appel de l'ouverture pour 0,13 s de serveur en plus.
         Echec tolere : le badge est un confort, jamais une donnee critique. */
      try {
        const _lab = Gmail.Users.Labels.get('me', 'INBOX');
        out.mailNonLus = Number(_lab.messagesUnread || 0);
      } catch (e) { out.mailNonLus = null; }
      _jalon('compteur de mails (Gmail)');
      /* (28/07/2026, 15 h 50) EXISTENCE DE L'ANNEE SUIVANTE, SANS LA TELECHARGER.
         Le frontend appelait getPlanningJson sur N+1 pour repondre a une seule
         question : « cette annee existe-t-elle ? ». Cela telechargeait le planning
         COMPLET (255 Ko) a chaque ouverture, soit ~2,5 s, pour un oui/non.
         _jsonFilesByName_ liste les fichiers du dossier Drive SANS lire leur contenu
         (aucun getBlob) : la reponse coute quelques dizaines de ms.
         La detection reste exacte et se met a jour des que N+1 est publiee, puisque
         elle est recalculee a chaque ouverture. */
      try {
        out.anneeSuivante = _jsonFilesByName_('planning_' + (jy + 1) + '.json').length > 0;
      } catch (e) { out.anneeSuivante = null; }
      _jalon('existence annee N+1 (listage Drive)');
      out._detail = _det;
      out._taille = null;
      // La serialisation ne peut pas figurer dans le texte qu'elle produit :
      // on la mesure, puis on l'insere en tete par simple concatenation.
      const _tSer = Date.now();
      const _txtOut = JSON.stringify(out);
      const _dSer = Date.now() - _tSer;
      return ContentService.createTextOutput(
        _txtOut.charAt(1) === '"'
          ? '{"_ser_ms":' + _dSer + ',"_taille":' + _txtOut.length + ',' + _txtOut.slice(1)
          : _txtOut
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getMedecins') {
      if (user.role !== 'admin') return _deny();
      const _m = _buildMedecins_();
      if (_m.error) return _error(_m.error);
      return ContentService.createTextOutput(JSON.stringify({success:true, medecins:_m.medecins}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveMedecin') {
      if (user.role !== 'admin') return _deny();
      const m = payload.medecin;
      if (!m || !m.id) return _error('Données invalides');
      const id = String(m.id).toUpperCase().trim();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('MEDECINS');
      const data = sheet.getDataRange().getValues();

      // ligne existante ? sinon valeurs par défaut
      let rowIdx = -1, ex = [];
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim().toUpperCase() === id) { rowIdx = r; ex = data[r]; break; }
      }
      // fusion : valeur du formulaire si fournie, sinon on garde l'existant
      const old = i => (ex[i] !== undefined && ex[i] !== null) ? ex[i] : '';
      const str = (k, i) => (m[k] !== undefined && m[k] !== null) ? String(m[k]).trim() : old(i);
      const num = (k, i, d) => (m[k] !== undefined && m[k] !== null && m[k] !== '') ? (Number(m[k]) || d) : (old(i) !== '' ? old(i) : d);
      const yn  = (k, i) => (m[k] !== undefined) ? (m[k] ? 'O' : 'N') : (String(old(i)).trim().toUpperCase() === 'O' ? 'O' : 'N');

      const row = [
        id,                        // A id
        str('nom', 1),             // B nom
        str('initiales', 2),       // C initiales
        yn('actif', 3),            // D actif
        num('quotite', 4, 100),    // E quotité
        num('pctGardes', 5, 100),  // F % gardes
        (m.codeAcces ? String(m.codeAcces).trim() : old(6)),  // G code — vide = inchangé (jamais effacé)
        str('email', 7),           // H email
        str('dect', 8),            // I dect
        str('dateDebut', 9),       // J date_debut
        str('dateFin', 10),        // K date_fin
        yn('noGarde', 11),         // L no_garde
        yn('only18', 12),          // M only_18
        yn('noWeekend', 13),       // N no_weekend
        yn('rythme2sur2', 14),     // O rythme_2sur2
        yn('souhaitPlafond', 15),  // P souhait_plafond
        (m.tpJoursFixes !== undefined) ? String(m.tpJoursFixes).trim().toUpperCase() : String(old(16)).trim().toUpperCase()  // Q tp_jours_fixes
      ];
      if (rowIdx >= 0) sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
      else             sheet.appendRow(row);
      _medecinsInvalider_();   // (14/09/2026) MEDECINS a changé : le memo de la requête est périmé

      _medFlagsCache = null;  // invalider le cache des particularités
      // (RH-1) MAR actif → garantir ses lignes dans les onglets annuels
      // (couvre création tardive ET réactivation après une init/génération).
      let rowsCreated = [];
      if (row[3] === 'O') {
        try { rowsCreated = ensureMarRows(id); }
        catch(e) { Logger.log('ensureMarRows: ' + e.message); }
        if (rowsCreated.length) logAction(`ensureMarRows — ${id} : ${rowsCreated.join(', ')}`);
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, created: rowIdx < 0, rowsCreated}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getAffectations') {
  if (user.role !== 'admin') return _deny();
  const affYear = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${affYear}`);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({success:true, affectations:{}}))
        .setMimeType(ContentService.MimeType.JSON);
      const data = sheet.getDataRange().getValues();
      const affectations = {};
      for (let r = 1; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        affectations[id] = {};
        for (let m = 1; m <= 12; m++) {
          const val = String(data[r][m]||'').trim();
          if (val) affectations[id][m] = val;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, affectations}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveAffectations') {
  if (user.role !== 'admin') return _deny();
  const aff = payload.affectations;
  if (!aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affYear = Number(payload.year) || TEST_YEAR;
  const sheetName = `AFFECTATIONS_${affYear}`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return _error(`Onglet ${sheetName} introuvable`);
  const res = ecrireAffectations(sheet, aff);
  logAction(`saveAffectations — ${res.maj} MAR(s) mis à jour` +
            (res.crees ? `, ${res.crees} ligne(s) créée(s)` : ''));
  
  // ← AJOUT : republier le planning après chaque modification d'affectation
  try { generatePlanning(affYear); } catch(e) { Logger.log('generatePlanning error: ' + e.message); }

  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

    if (action === 'getVacancesConfig') {
      if (user.role !== 'admin') return _deny();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const perSheet = ss.getSheetByName('PERIODES_VAC');
      let periodes = [];
      if (perSheet) {
        const perData = perSheet.getDataRange().getValues();
        for (let r = 1; r < perData.length; r++) {
          const nom = String(perData[r][0]).trim();
          if (!nom) continue;
          const debutRaw = perData[r][1], finRaw = perData[r][2];
          const debut = debutRaw instanceof Date
            ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
            : String(debutRaw).trim();
          const fin = finRaw instanceof Date
            ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
            : String(finRaw).trim();
          periodes.push({nom, debut, fin, seuil:Number(perData[r][3])||8});
        }
      }
      // Année visée (wizard) : ne garder que ses périodes ; si aucune, proposer (API Nice + filet)
      const wizYear = Number(payload.year) || 0;
      if (wizYear) {
        const pourAnnee = periodes.filter(function(p){ return String(p.debut).startsWith(String(wizYear)); });
        periodes = pourAnnee.length ? pourAnnee : proposerVacances(wizYear);
      }
      const groupSheet = ss.getSheetByName('GROUPES_VAC');
      const groupes = {A:[],B:[],C:[]};
      if (groupSheet) {
        const groupData = groupSheet.getDataRange().getValues();
        const tempGroups = {A:[],B:[],C:[]};
        for (let r = 1; r < groupData.length; r++) {
          const grp = String(groupData[r][0]).trim(), id = String(groupData[r][1]).trim();
          const ord = Number(groupData[r][2])||0;
          if (!id||!tempGroups[grp]) continue;
          tempGroups[grp].push({id, ordre:ord});
        }
        ['A','B','C'].forEach(g => {
          groupes[g] = tempGroups[g].sort((a,b)=>a.ordre-b.ordre).map(m=>({id:m.id}));
        });
      }
      /* (14/09/2026 — chantier 11) LES QUOTAS VOYAGENT AVEC LA CONFIG. staff.html
         portait une copie figée de CONFIG_CONGES et s'est trouvé faux quatre fois
         (33 jours affichés pour 37). Le client affiche, le serveur calcule :
         la table est servie ici, telle que le serveur la lit (_loadQuotasConges). */
      return ContentService.createTextOutput(JSON.stringify({success:true, periodes, groupes, quotasConges:_loadQuotasConges()}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'savePeriodes') {
      if (user.role !== 'admin') return _deny();
      const periodes = payload.periodes;
      if (!Array.isArray(periodes)) return _error('Données invalides');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('PERIODES_VAC');
      if (!sheet) {
        sheet = ss.insertSheet('PERIODES_VAC');
        sheet.getRange(1,1,1,4).setValues([['NOM','DEBUT','FIN','SEUIL']]);
        sheet.getRange(1,1,1,4).setFontWeight('bold');
      }
      // (30/07/2026) L'onglet porte les periodes de TOUTES les annees (getVacancesConfig
      // filtre par l'annee de DEBUT). L'ancienne version rasait la table entiere : preparer
      // 2028 effacait les periodes de 2027. On ne remplace desormais que l'annee visee,
      // reconnue a l'annee de sa date de debut, exactement comme a la lecture.
      const anneeCible = String(Number(payload.year) || '');
      const _an = v => (v instanceof Date)
        ? String(v.getFullYear())
        : String(v || '').trim().slice(0, 4);
      const conservees = [];
      const ancien = sheet.getDataRange().getValues();
      for (let r = 1; r < ancien.length; r++) {
        const nom = String(ancien[r][0]).trim();
        if (!nom) continue;
        if (anneeCible && _an(ancien[r][1]) === anneeCible) continue;   // remplacee
        conservees.push([ancien[r][0], ancien[r][1], ancien[r][2], Number(ancien[r][3]) || 8]);
      }
      const nouvelles = periodes.map(p => [p.nom, p.debut, p.fin, Number(p.seuil) || 8]);
      // Filet : sans annee ciblee, on refuse de vider une table pleine.
      if (!anneeCible && !nouvelles.length && ancien.length > 1) {
        return _error('Refus : aucune période fournie, la table ne sera pas vidée');
      }
      const finales = anneeCible ? conservees.concat(nouvelles) : nouvelles;
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
      if (finales.length > 0) sheet.getRange(2, 1, finales.length, 4).setValues(finales);
      logAction(`savePeriodes${anneeCible ? ' ' + anneeCible : ''} : ${nouvelles.length} période(s) écrite(s), ${conservees.length} conservée(s)`);
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveGroupes') {
      if (user.role !== 'admin') return _deny();
      const groupes = payload.groupes;
      if (!groupes) return _error('Données invalides');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('GROUPES_VAC');
      if (!sheet) {
        sheet = ss.insertSheet('GROUPES_VAC');
        sheet.getRange(1,1,1,3).setValues([['GROUPE','MEDECIN_ID','ORDRE']]);
        sheet.getRange(1,1,1,3).setFontWeight('bold');
      }
      const rows = [];
      ['A','B','C'].forEach(grp => {
        (groupes[grp]||[]).forEach((mar, idx) => rows.push([grp, mar.id, idx+1]));
      });
      // (30/07/2026) Filet : un payload vide effacait GROUPES_VAC en silence, et le
      // wizard affichait « ✓ Groupes sauvegardes ». Cas reel : lecture initiale ratee,
      // wizGroupes reste {A:[],B:[],C:[]}. On refuse plutot que d'ecraser.
      if (!rows.length && sheet.getLastRow() > 1) {
        logAction('saveGroupes REFUSE : payload vide sur une table pleine');
        return _error('Refus : aucun groupe fourni, GROUPES_VAC ne sera pas vidé');
      }
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
      if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'saveConfig') {
      if (user.role !== 'admin') return _deny();
      const key = String(payload.key||'').trim();
      const value = String(payload.value||'').trim();
      if (!key) return _error('Clé manquante');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('Onglet CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      let found = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === key) {
          sheet.getRange(r+1, 2).setValue(value); found = true; break;
        }
      }
      if (!found) sheet.appendRow([key, value]);
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'sendCodes') {
      if (user.role !== 'admin') return _deny();
      { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const data = _medecinsRows_();
      let sent = 0;
      const errors = [];
      // (07/2026) Les MAR non servis étaient sautés SILENCIEUSEMENT : l'écran
      // annonçait « codes envoyés » sans dire que 2 ou 3 n'avaient rien reçu.
      // On les nomme désormais, en distinguant les deux causes — « sans code »
      // est une anomalie (un MAR actif doit toujours en avoir un), « sans email »
      // est une donnée manquante connue. Les INACTIFS restent ignorés en silence.
      const sansEmail = [], sansCode = [];
      for (let r = 1; r < data.length; r++) {
        const id = String(data[r][COL_MED.ID]).trim(), nom = String(data[r][COL_MED.NOM]).trim();
        const actif = String(data[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
        const code = String(data[r][COL_MED.CODE]).trim(), email = String(data[r][COL_MED.EMAIL]).trim();
        if (!id || !actif) continue;
        if (!email) { sansEmail.push(nom || id); continue; }
        if (!code)  { sansCode.push(nom || id);  continue; }
        try {
          MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, code, false)));
          sent++;
        } catch(err) { errors.push(`${nom} (${email}) : ${err.message}`); }
      }
      const skipped = sansEmail.length + sansCode.length;
      logAction(`sendCodes — ${sent} envoyés`
        + (sansEmail.length ? `, ${sansEmail.length} sans email (${sansEmail.join(', ')})` : '')
        + (sansCode.length  ? `, ${sansCode.length} SANS CODE (${sansCode.join(', ')})`   : '')
        + (errors.length    ? `, ${errors.length} erreur(s)` : ''));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, sent, skipped, sansEmail, sansCode, errors
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── BOITE DE RECEPTION (admin) ───────────────────────────────────────
    // Lecture de planningmedic@gmail.com depuis admin.html.
    // Autorisation declaree : gmail.modify (et non gmail.readonly). Motif : ouvrir un
    // message le marque LU, sans quoi le compteur de non-lus ne bougerait jamais et
    // n'aurait aucun sens pour le comite. gmail.modify n'autorise PAS la suppression
    // definitive — c'est plus etroit que l'acces large accorde jusqu'au 26/07.
    // Le script LIT et MARQUE LU, rien d'autre : il n'envoie ni ne supprime.
    // Repondre depuis l'admin reste une decision distincte, a reprendre explicitement.
    // Passe par le service avance Gmail (et non GmailApp, qui exigerait une
    // autorisation large lire/envoyer/supprimer).

    // Compteur de non-lus. Appele APRES l'affichage de l'admin, en tache de fond :
    // ne JAMAIS le mettre dans getAdminBootstrap, il ajouterait ~1 s a chaque
    // ouverture pour une fonction consultee occasionnellement.
    if (action === 'mailNonLus') {
      if (user.role !== 'admin') return _deny();
      try {
        const lab = Gmail.Users.Labels.get('me', 'INBOX');
        return ContentService.createTextOutput(JSON.stringify({
          success: true, nonLus: Number(lab.messagesUnread || 0)
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    // Liste des messages recus. Charge au clic sur l'enveloppe (~2-4 s).
    if (action === 'mailListe') {
      if (user.role !== 'admin') return _deny();
      try {
        const nb = Math.min(Math.max(parseInt(payload.nb) || 20, 1), 50);
        const liste = Gmail.Users.Messages.list('me', {q: 'in:inbox', maxResults: nb});
        const out = [];
        (liste.messages || []).forEach(function (ref) {
          const m = Gmail.Users.Messages.get('me', ref.id, {format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']});
          const h = {};
          ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name] = x.value; });
          out.push({
            id: m.id,
            de: h.From || '',
            objet: h.Subject || '(sans objet)',
            date: Number(m.internalDate || 0),
            apercu: m.snippet || '',
            nonLu: (m.labelIds || []).indexOf('UNREAD') >= 0
          });
        });
        return ContentService.createTextOutput(JSON.stringify({success: true, messages: out}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    // Corps d'un message, en TEXTE BRUT uniquement.
    // ⚠️ Ne JAMAIS renvoyer le HTML du message : l'injecter dans admin.html
    // executerait du contenu venu de l'exterieur dans la page.
    if (action === 'mailMessage') {
      if (user.role !== 'admin') return _deny();
      try {
        const id = String(payload.id || '').trim();
        if (!id) return _error('Identifiant de message manquant');
        const m = Gmail.Users.Messages.get('me', id, {format: 'full'});
        const h = {};
        ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name] = x.value; });
        // ⚠️ Gmail encode le corps en base64 « URL-safe » et SANS remplissage.
        // Utilities.base64DecodeWebSafe echoue sur ces chaines : mesure le 26/07,
        // ~2 messages sur 3 tombaient en « Impossible de decoder la chaine ».
        // On normalise donc soi-meme (caracteres URL-safe + remplissage) avant de decoder.
        const _decode = function (data) {
          try {
            let b = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b.length % 4) b += '=';
            return Utilities.newBlob(Utilities.base64Decode(b)).getDataAsString('UTF-8');
          } catch (e) { return ''; }   // une partie illisible ne doit pas perdre tout le message
        };
        // Beaucoup de messages n'ont QUE du HTML. On le recupere alors, mais on le convertit
        // en texte ICI, cote serveur : le HTML brut ne quitte jamais le script.
        const _htmlEnTexte = function (h) {
          return String(h || '')
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            // Entites numeriques puis nommees. Les mails en francais en sont pleins
            // (&eacute;, &ucirc;...) : sans cela le texte serait illisible.
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
            .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
            .replace(/&([a-z]+);/gi, function (t, n) {
              const E = {nbsp:' ', eacute:'é', egrave:'è', ecirc:'ê', euml:'ë', agrave:'à',
                acirc:'â', aacute:'á', ccedil:'ç', ugrave:'ù', ucirc:'û', uuml:'ü', icirc:'î',
                iuml:'ï', ocirc:'ô', ouml:'ö', oelig:'œ', aelig:'æ', Eacute:'É', Egrave:'È',
                Ecirc:'Ê', Agrave:'À', Ccedil:'Ç', Ocirc:'Ô', Ucirc:'Û',
                laquo:'«', raquo:'»', deg:'°', euro:'€', hellip:'…', middot:'·',
                rsquo:'\u2019', lsquo:'\u2018', ldquo:'\u201C', rdquo:'\u201D',
                ndash:'\u2013', mdash:'\u2014', apos:"'", quot:'"', lt:'<', gt:'>'};
              return Object.prototype.hasOwnProperty.call(E, n) ? E[n]
                   : (E[n.toLowerCase()] !== undefined ? E[n.toLowerCase()] : t);
            })
            .replace(/&amp;/gi, '&')            // en DERNIER : evite un double decodage
            .replace(/\n{3,}/g, '\n\n').trim();
        };
        // Parcours recursif des parties MIME.
        let texte = '', html = '';
        (function lire(p) {
          if (!p) return;
          const mt = String(p.mimeType || '');
          if (p.body && p.body.data) {
            if (mt === 'text/plain')     texte += _decode(p.body.data) + '\n';
            else if (mt === 'text/html') html  += _decode(p.body.data) + '\n';
          }
          (p.parts || []).forEach(lire);
        })(m.payload);
        if (!texte.trim() && html) texte = _htmlEnTexte(html);
        if (!texte.trim()) texte = m.snippet || '(message sans contenu lisible)';
        // Marquer comme LU (retrait du libelle UNREAD) : sans cela le compteur ne
        // bougerait jamais et serait incomprehensible pour le comite.
        // ⚠️ Ecriture GMAIL, pas Sheets : volontairement PAS dans WRITE_ACTIONS_LOCK.
        // Ce verrou protege le classeur contre les ecritures concurrentes ; l'y mettre
        // sérialiserait la lecture des messages pendant 20 s sans rien proteger.
        // L'operation est idempotente : retirer UNREAD deux fois est sans effet.
        let marque = false;
        try {
          if ((m.labelIds || []).indexOf('UNREAD') >= 0) {
            Gmail.Users.Messages.modify({removeLabelIds: ['UNREAD']}, 'me', id);
            marque = true;
          }
        } catch (e) { /* un echec de marquage ne doit JAMAIS empecher de lire */ }
        return ContentService.createTextOutput(JSON.stringify({
          success: true, de: h.From || '', objet: h.Subject || '(sans objet)',
          date: Number(m.internalDate || 0), texte: texte.trim(), marque: marque
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    if (action === 'diagComplet') {
      if (user.role !== 'admin') return _deny();
      const _d = diagnosticComplet();
      return ContentService.createTextOutput(JSON.stringify({ success:true, ok:_d.ok, results:_d.results }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'archiveYear') {
      if (user.role !== 'admin') return _deny();
      const yearToArchive = Number(payload.year);
      if (!yearToArchive || yearToArchive < 2026) return _error('Année invalide');
      // ── Garde-fou : l'année SUIVANTE doit être prête (W1+W2) avant de clôturer ──
      const _ssArch = SpreadsheetApp.getActiveSpreadsheet();
      const _next = yearToArchive + 1;
      if (!_ssArch.getSheetByName(`INDISPOS_${_next}`))
        return _error(`Année ${_next} non préparée : lancez d'abord « Démarrer l'année » (étape 1) avant de clôturer ${yearToArchive}.`);
      if (!_ssArch.getSheetByName(`STATS_GARDES_${_next}`))
        return _error(`Gardes ${_next} non générées : lancez d'abord la génération des gardes (étape 2) avant de clôturer ${yearToArchive}.`);
      /* ── Garde-fou de DATE (17/08/2026) ────────────────────────────────────
         Découvert la veille de la remise du code comité : les deux conditions
         ci-dessus portent sur l'EXISTENCE des onglets de l'année suivante, pas
         sur la date. Or elles étaient satisfaites dès août par le bac à sable de
         la démonstration du 4 septembre — la clôture était donc à deux clics,
         alors qu'archiver 2026 en août déplace le planning EN COURS D'USAGE et
         bascule le service sur une année fictive. C'est l'erreur la plus coûteuse
         du calendrier, et rien ne l'empêchait : le Diagnostic l'annonce, le guide
         l'écrit, mais une consigne n'est pas un verrou. Un garde-fou ne doit pas
         reposer sur la vigilance de qui clique.
         La clôture n'a de sens qu'une fois l'année suivante COMMENCÉE : le
         premier lundi de planning de _next (jamais le 1er janvier civil — voir
         getPremierJourPlanning). Avant cette date : refus net, avec le jour exact. */
      {
        const _debutNext = getPremierJourPlanning(_next);
        const _now = new Date();
        if (_now < _debutNext) {
          const _tz  = _ssArch.getSpreadsheetTimeZone();
          const _txt = Utilities.formatDate(_debutNext, _tz, 'EEEE d MMMM yyyy');
          const _j   = Math.ceil((_debutNext - _now) / 86400000);
          logAction(`archiveYear REFUSÉ — ${yearToArchive} demandée le ${Utilities.formatDate(_now, _tz, 'yyyy-MM-dd')}, avant le ${_txt}`);
          return _error(
            `Clôture refusée : l'année ${_next} n'a pas encore commencé. `
            + `La clôture de ${yearToArchive} sera possible à partir du ${_txt} (dans ${_j} jour(s)). `
            + `Archiver maintenant déplacerait le planning en cours d'usage et basculerait le service sur ${_next}. `
            + `Aucune modification n'a été faite.`);
        }
      }
      try {
        const rapport = String(archiveYear(yearToArchive) || '');
        const archiveOk = !/(^|\n)❌/.test(rapport);   // une ligne « ❌ » dans le rapport = étape échouée
        return ContentService.createTextOutput(JSON.stringify(
          archiveOk
            ? { success: true, message: rapport || `Archivage ${yearToArchive} terminé` }
            : { success: false,
                error: `Archivage ${yearToArchive} incomplet — une étape a échoué (le plus souvent le push GitHub : vérifie la clé GITHUB_TOKEN dans l'onglet CONFIG). Les onglets GSheet sont conservés, relance l'archivage après correction.`,
                rapport: rapport }
        )).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return _error(err.message);
      }
    }
    if (action === 'saveAffectationsMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  const aff = payload.affectations;
  if (!medecinId || !aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${TEST_YEAR}`);
  if (!sheet) return _error(`Onglet AFFECTATIONS_${TEST_YEAR} introuvable`);
  const data = sheet.getDataRange().getValues();
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(aff[m] || 'VOLANT');
  let found = false;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() === medecinId) {
      sheet.getRange(r + 1, 2, 1, 12).setValues([vals]);
      found = true; break;
    }
  }
  if (!found) {
    sheet.appendRow([medecinId, ...vals]);
  }
  logAction(`saveAffectationsMar — ${medecinId} mis à jour`);
  return ContentService.createTextOutput(JSON.stringify({success: true, created: !found}))
    .setMimeType(ContentService.MimeType.JSON);
}
if (action === 'addMedecinToGroupe') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  const groupe = String(payload.groupe || '').trim().toUpperCase();
  if (!medecinId || !['A','B','C'].includes(groupe)) return _error('Données invalides');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('GROUPES_VAC');
  if (!sheet) {
    sheet = ss.insertSheet('GROUPES_VAC');
    sheet.getRange(1,1,1,3).setValues([['GROUPE','MEDECIN_ID','ORDRE']]);
    sheet.getRange(1,1,1,3).setFontWeight('bold');
  }
  const data = sheet.getDataRange().getValues();
  // Vérifier si le MAR est déjà dans un groupe
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][1]).trim().toUpperCase() === medecinId) {
      sheet.getRange(r + 1, 1).setValue(groupe);
      logAction(`addMedecinToGroupe — ${medecinId} déplacé vers groupe ${groupe}`);
      return ContentService.createTextOutput(JSON.stringify({success: true, moved: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  // Calculer l'ordre max dans ce groupe
  let maxOrdre = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() === groupe) {
      maxOrdre = Math.max(maxOrdre, Number(data[r][2]) || 0);
    }
  }
  sheet.appendRow([groupe, medecinId, maxOrdre + 1]);
  logAction(`addMedecinToGroupe — ${medecinId} ajouté au groupe ${groupe}`);
  return ContentService.createTextOutput(JSON.stringify({success: true, created: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
if (action === 'resetCodeMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  if (!medecinId) return _error('Médecin manquant');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const data = medSheet.getDataRange().getValues();

  // Codes déjà pris (autres MARs + code admin) : le nouveau doit être unique,
  // sinon deux personnes partageraient un accès — ou un MAR hériterait du rôle admin.
  const pris = new Set();
  for (let r = 1; r < data.length; r++) {
    const c = String(data[r][6]).trim();
    if (c) pris.add(c.toUpperCase());
  }
  const cfgSheet = ss.getSheetByName('CONFIG');
  if (cfgSheet) {
    const cfg = cfgSheet.getDataRange().getValues();
    for (let r = 1; r < cfg.length; r++) {
      if (String(cfg[r][0]).trim() === 'ADMIN_CODE') { pris.add(String(cfg[r][1]).trim().toUpperCase()); break; }
    }
  }

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() !== medecinId) continue;
    const nom = String(data[r][1]).trim();
    const ancien = String(data[r][6]).trim();
    const email = String(data[r][7]).trim();
    // Email vérifié AVANT toute écriture : sans lui, on n'invalide rien.
    if (!email) return _error(`Pas d'email pour ${nom} — code inchangé.`);

    let nouveau = '';
    for (let essai = 0; essai < 50; essai++) {
      const c = generateCode();
      if (!pris.has(c.toUpperCase())) { nouveau = c; break; }
    }
    if (!nouveau) return _error('Génération impossible (collision) — code inchangé.');

    // Trace de l'ancien code AVANT écrasement (filet si l'email n'arrive pas).
    logAction(`resetCodeMar — ${nom} (${medecinId}) : ancien code ${ancien || '(vide)'} remplacé`);
    medSheet.getRange(r + 1, 7).setValue(nouveau);  _medecinsInvalider_();   // (14/09/2026) MEDECINS a changé : le memo de la requête est périmé
    SpreadsheetApp.flush();

    try {
      MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, nouveau, true)));
      logAction(`resetCodeMar — nouveau code envoyé à ${nom} (${email})`);
      return ContentService.createTextOutput(JSON.stringify({success: true, nom: nom}))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      // Le code EST déjà changé : le dire franchement plutôt que laisser croire à un échec sans conséquence.
      logAction(`resetCodeMar — ECHEC EMAIL ${nom} : ${err.message} — nouveau code ${nouveau}`);
      return _error(`Code changé pour ${nom} MAIS email non parti (${err.message}). Nouveau code : ${nouveau} — transmets-le en main propre.`);
    }
  }
  return _error(`Médecin ${medecinId} introuvable`);
}

if (action === 'sendCodesMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  if (!medecinId) return _error('Médecin manquant');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const data = _medecinsRows_();
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][COL_MED.ID]).trim();
    if (id.toUpperCase() !== medecinId) continue;
    const nom = String(data[r][COL_MED.NOM]).trim();
    const code = String(data[r][COL_MED.CODE]).trim();
    const email = String(data[r][COL_MED.EMAIL]).trim();
    if (!email) return _error(`Pas d'email pour ${nom}`);
    if (!code) return _error(`Pas de code pour ${nom}`);
    try {
      MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, code, false)));
      logAction(`sendCodesMar — email envoyé à ${nom} (${email})`);
      return ContentService.createTextOutput(JSON.stringify({success: true, sent: 1}))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return _error(`Envoi échoué pour ${nom} : ${err.message}`);
    }
  }
  return _error(`Médecin ${medecinId} introuvable`);
}
if (action === 'getConflitsAll') {
      if (user.role !== 'admin') return _deny();
      const year = Number(payload.year) || TEST_YEAR;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const medData = _medecinsRows_();
      const actifs = [];
      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][COL_MED.ID]).trim();
        const actif = String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
        const email = String(medData[r][COL_MED.EMAIL]).trim();
        if (id && actif) actifs.push({id, nom: String(medData[r][COL_MED.NOM]).trim(), email});
      }
      const conflits = [];
      actifs.forEach(mar => {
        const cfg = getVacConfig(mar.id, year);
        const periodesConflits = [];
        cfg.periodes.forEach(p => {
          if (p.joursBloqués && p.joursBloqués.length > 0) {
            periodesConflits.push({
              periode: p.nom,
              debut: p.debut,
              fin: p.fin,
              joursBloqués: p.joursBloqués,
              joursDisponibles: p.joursDisponibles,
            });
          }
        });
        if (periodesConflits.length > 0) {
          conflits.push({
            id: mar.id,
            nom: mar.nom,
            email: mar.email,
            periodesConflits,
          });
        }
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        conflits,
        total: actifs.length,
        nbConflits: conflits.length,
        nbResolus: actifs.length - conflits.length,
      })).setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'envoyerRecapIndispos') {
      // (Remplace l'ancien récap indispos) — Récapitulatif des GARDES attribuées (G réa / G2 mat).
      if (user.role !== 'admin') return _deny();
      { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
      const year = Number(payload.year) || TEST_YEAR;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const medData = _medecinsRows_();

      const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
      if (!gardesSheet) return _error(`Onglet GARDES_${year} introuvable`);
      const gData = gardesSheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(gData, year);
      const colToDate = {};
      Object.keys(dateToCol).forEach(d => { colToDate[dateToCol[d]] = d; });

      // Fériés : Set (depuis getJoursFeries déjà déployé) pour savoir QUELS jours, + mapping nom local (mêmes calculs).
      const feriesSet = getJoursFeries(year), feriesSetN = getJoursFeries(year + 1);
      const isF = d => feriesSet.has(d) || feriesSetN.has(d);
      const feriesNamed = (y) => {
        const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
        const h=(19*a+b-d-g+15)%30,ii=Math.floor(c/4),k=c%4,l=(32+2*e+2*ii-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
        const mo=Math.floor((h+l-7*mm+114)/31), da=((h+l-7*mm+114)%31)+1;
        const paques=new Date(y,mo-1,da,12,0,0);
        const fmt=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        const add=(dt,n)=>{const x=new Date(dt);x.setDate(x.getDate()+n);return fmt(x);};
        const fix=(m2,d2)=>{const dt=new Date(y,m2-1,d2,12,0,0);if(dt.getDay()===0)dt.setDate(dt.getDate()+1);return fmt(dt);};
        const plain=(m2,d2)=>`${y}-${String(m2).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
        const M={};
        M[fix(1,1)]='Jour de l\'An'; M[plain(1,27)]='Sainte Dévote'; M[fix(5,1)]='Fête du Travail';
        M[fix(8,15)]='Assomption'; M[fix(11,1)]='Toussaint'; M[fix(11,19)]='Fête du Prince';
        M[fix(12,8)]='Immaculée Conception'; M[fix(12,25)]='Noël';
        M[add(paques,1)]='Lundi de Pâques'; M[add(paques,39)]='Ascension'; M[add(paques,50)]='Lundi de Pentecôte'; M[add(paques,60)]='Fête-Dieu';
        return M;
      };
      const fnames = Object.assign({}, feriesNamed(year), feriesNamed(year + 1));

      const site = 'https://planningmedic.github.io/';
      const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const dd = n => String(n).padStart(2,'0');

      let sent = 0, skipped = 0;
      const errors = [];

      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][COL_MED.ID]).trim();
        const nom = String(medData[r][COL_MED.NOM]).trim();
        const actif = String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
        const email = String(medData[r][COL_MED.EMAIL]).trim();
        if (!id || !actif) continue;
        if (!email) { skipped++; continue; }

        // Gardes du MAR (G / G2 uniquement)
        const gardes = [];
        for (let ri = 3; ri < gData.length; ri++) {
          if (String(gData[ri][0]).trim() !== id) continue;
          Object.keys(colToDate).forEach(col => {
            const date = colToDate[col];
            const val = String(gData[ri][Number(col)] || '').trim().toUpperCase();
            if (val === 'G' || val === 'G2') gardes.push({ date, type: val });
          });
          break;
        }
        gardes.sort((x,y2) => x.date < y2.date ? -1 : (x.date > y2.date ? 1 : 0));

        let nRea=0, nMat=0, nWe=0, nFer=0;
        const byMonth = {};
        gardes.forEach(gg => {
          const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
          if (gg.type === 'G') nRea++; else nMat++;
          if (dw === 0 || dw === 5 || dw === 6) nWe++;   // même définition que le marquage
          if (isF(gg.date)) nFer++;
          const mo = Number(gg.date.slice(5,7)) - 1;
          (byMonth[mo] = byMonth[mo] || []).push(gg);
        });

        /* (25/08/2026) Récapitulatif des souhaits, demandé par le responsable : c'est ici
           qu'il a sa place, dans le mail que chacun reçoit et garde — plutôt que
           dans un bandeau du portail qu'on ferme et qu'on oublie. Colonnes lues
           PAR NOM : absentes des plannings générés avant cette date, d'où le repli
           silencieux (aucun encadré affiché). */
        let souhaitsHtml = '', souhaitsTexte = '';
        try {
          const _stS = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STATS_GARDES_' + year);
          if (_stS && _stS.getLastRow() > 1) {
            const _sd = _stS.getDataRange().getValues();
            const _sh = _sd[0].map(function (x) { return String(x).trim(); });
            const _iP = _sh.indexOf('SOUHAITS POSES'), _iH = _sh.indexOf('SOUHAITS HONORES');
            if (_iP >= 0 && _iH >= 0) {
              for (let _r = 1; _r < _sd.length; _r++) {
                if (String(_sd[_r][0]).trim() !== String(id).trim()) continue;
                const _p = Number(_sd[_r][_iP]) || 0, _h = Number(_sd[_r][_iH]) || 0;
                if (!_p) break;                       // aucun souhait posé : on ne dit rien
                const _tous = (_h === _p);
                souhaitsHtml =
                  '<div style="background:' + (_tous ? '#ecfdf5' : '#f8fafc') + ';border:1px solid '
                  + (_tous ? '#cdeee6' : '#eef1f5') + ';border-radius:12px;padding:13px 16px;margin-bottom:22px">'
                  + '<div style="font-size:13px;color:' + (_tous ? '#0d9488' : '#334155')
                  + ';font-weight:700">' + (_tous ? '✓ ' : '') + 'Souhaits : ' + _h + ' retenu'
                  + (_h > 1 ? 's' : '') + ' sur ' + _p + '</div></div>';
                souhaitsTexte = 'Souhaits : ' + _h + ' retenu' + (_h > 1 ? 's' : '') + ' sur ' + _p + '.\n';
                break;
              }
            }
          }
        } catch (eS) { /* le récapitulatif des souhaits est un confort, jamais bloquant */ }

        // ---------- HTML ----------
        const chips =
          `<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border:1px solid #dbe6ff;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nRea} réanimation</span>` +
          `<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border:1px solid #cdeee6;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nMat} maternité</span>` +
          (nWe ? `<span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fde3cf;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nWe} jour${nWe>1?'s':''} de week-end</span>` : '') +
          (nFer ? `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fbd5d5;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nFer} férié${nFer>1?'s':''}</span>` : '');

        let rowsHtml = '';
        /* (26/08/2026) Un week-end de garde (vendredi + dimanche, même binôme) est
           présenté dans UN SEUL encadré : deux lignes séparées donnaient une liste
           hachée où rien ne disait que les deux dates allaient ensemble. Les jours
           sont d'abord regroupés en UNITÉS, puis rangés au mois du vendredi — un
           week-end à cheval sur deux mois reste donc d'un seul tenant. */
        const parDate = {};
        gardes.forEach(gg => { parDate[gg.date] = gg; });
        const dPlus = (ds, n) => {
          const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n);
          return `${x.getFullYear()}-${dd(x.getMonth()+1)}-${dd(x.getDate())}`;
        };
        const pris = {};
        const unites = [];
        gardes.slice().sort((a,b) => a.date < b.date ? -1 : 1).forEach(gg => {
          if (pris[gg.date]) return;
          const dw = new Date(gg.date + 'T12:00:00').getDay();
          if (dw === 5) {
            const dim = dPlus(gg.date, 2), gd = parDate[dim];
            /* (26/08/2026) On lie dès qu'il y a garde le vendredi ET le dimanche : c'est
               le WEEK-END qui compte. Le rôle peut différer entre les deux jours (après
               un échange, par exemple) — chaque ligne porte le sien, le cadre les réunit
               quand même. Exiger le même rôle aurait dissocié ces week-ends à l'affichage. */
            if (gd && !pris[dim]) {
              pris[gg.date] = pris[dim] = 1;
              unites.push({ we: true, jours: [gg, gd] });
              return;
            }
          }
          pris[gg.date] = 1;
          unites.push({ we: false, jours: [gg] });
        });

        const parMois = {};
        unites.forEach(u => {
          const mo = Number(u.jours[0].date.slice(5,7)) - 1;
          (parMois[mo] = parMois[mo] || []).push(u);
        });

        const badgeDe = t => t === 'G'
          ? '<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G &middot; Réa</span>'
          : '<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G2 &middot; Mat</span>';
        const libelle = ds => {
          const dt = new Date(ds + 'T12:00:00');
          return `${JOURS[dt.getDay()]} ${dd(dt.getDate())}/${dd(dt.getMonth()+1)}`;
        };

        Object.keys(parMois).map(Number).sort((p,q)=>p-q).forEach(mo => {
          rowsHtml += `<div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#94a3b8;margin:18px 0 8px 2px">${MOIS[mo]}</div>`;
          parMois[mo].forEach(u => {
            if (u.we) {
              /* Chaque jour garde SA ligne (sa date, son rôle) ; c'est le cadre qui les
                 réunit — le vendredi et le dimanche sont un seul week-end de garde. */
              rowsHtml += `<div style="border:1px solid #fde3cf;background:#fffaf5;border-radius:10px;padding:8px 12px 4px;margin-bottom:7px">`
                + `<div style="font-size:10.5px;font-weight:800;color:#c2410c;letter-spacing:.3px;margin-bottom:2px">WEEK-END</div>`
                + u.jours.map((g, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;`
                    + `${i ? 'border-top:1px solid #fde3cf;' : ''}">`
                    + `<span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(g.date)}</span>`
                    + `${badgeDe(g.type)}</div>`).join('')
                + `</div>`;
              return;
            }
            const gg = u.jours[0];
            const dw = new Date(gg.date + 'T12:00:00').getDay();
            const ferie = isF(gg.date), sam = (dw === 6);
            let rowStyle = 'border:1px solid #eef1f5;', tag = '';
            if (ferie) {
              const nm = fnames[gg.date];
              rowStyle = 'border:1px solid #fbd5d5;background:#fef6f6;';
              tag = `<span style="font-size:10.5px;font-weight:700;color:#b91c1c;background:#fdeaea;border-radius:5px;padding:2px 7px">Férié${nm?' &middot; '+nm:''}</span>`;
            } else if (sam) {
              rowStyle = 'border:1px solid #fde3cf;background:#fffaf5;';
              tag = '<span style="font-size:10.5px;font-weight:700;color:#c2410c;background:#fff1e6;border-radius:5px;padding:2px 7px">Samedi</span>';
            }
            rowsHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;${rowStyle}border-radius:10px;margin-bottom:7px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(gg.date)}</span>${tag}</div>${badgeDe(gg.type)}</div>`;
          });
        });

        const coreHtml = gardes.length ? (summaryHtml + souhaitsHtml + rowsHtml) : (emptyHtml + souhaitsHtml);

        const html =
          '<div style="background:#e9edf1;padding:0;margin:0">' +
          '<div style="max-width:600px;margin:0 auto;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
            '<div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8ef">' +
              '<div style="background:#0f172a;padding:22px 26px">' +
                '<div style="color:#cbd5e1;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase">Planning-Med</div>' +
                '<div style="color:#ffffff;font-size:23px;font-weight:800;margin-top:12px">Vos gardes ' + year + '</div>' +
                '<div style="color:#94a3b8;font-size:14px;margin-top:3px">' + nom + '</div>' +
              '</div>' +
              '<div style="padding:22px 26px 8px">' +
                '<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155">Bonjour ' + nom + ',<br>Le planning ' + year + ' vient d\'être généré. Voici vos gardes pour l\'année — à reporter dans votre agenda.</p>' +
                coreHtml +
                '<div style="border-top:1px solid #eef1f5;margin:8px 0 18px"></div>' +
                '<div style="text-align:center"><a href="' + site + '" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px">Voir le planning complet &rarr;</a>' +
                '<p style="margin:14px 0 0;font-size:12px;color:#9aa4b2;line-height:1.5">Une erreur ou un échange à signaler ? Contactez le comité planning.</p></div>' +
              '</div>' +
              '<div style="background:#f8fafc;border-top:1px solid #eef1f5;padding:14px;text-align:center"><div style="font-size:11px;color:#9aa4b2">Le Comité Planning-Med</div></div>' +
            '</div>' +
          '</div>' +
          '</div>';

        // ---------- Texte brut (repli) ----------
        let bodyText = 'Bonjour ' + nom + ',\n\nLe planning ' + year + ' vient d\'être généré. Voici vos gardes :\n\n';
        if (souhaitsTexte) bodyText += souhaitsTexte + '\n';
        if (!gardes.length) {
          bodyText += 'Aucune garde programmée pour vous en ' + year + '.\n';
        } else {
          bodyText += gardes.length + ' garde' + (gardes.length>1?'s':'') + ' — ' + nRea + ' réa / ' + nMat + ' mat'
            + (nWe ? ' \u00b7 ' + nWe + ' jour' + (nWe>1?'s':'') + ' de week-end' : '')
            + (nFer ? ' \u00b7 ' + nFer + ' férié' + (nFer>1?'s':'') : '') + '\n\n';
          Object.keys(byMonth).map(Number).sort((p,q)=>p-q).forEach(mo => {
            bodyText += MOIS[mo] + ' :\n';
            byMonth[mo].forEach(gg => {
              const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
              const nm = fnames[gg.date];
              const tag = isF(gg.date) ? ' [Férié' + (nm?' '+nm:'') + ']' : ((dw===0||dw===5||dw===6) ? ' [week-end]' : '');
              bodyText += '  ' + JOURS[dw] + ' ' + dd(dt.getDate()) + '/' + dd(mo+1) + ' \u2014 ' + (gg.type==='G'?'G (réa)':'G2 (mat)') + tag + '\n';
            });
          });
        }
        bodyText += '\nVoir le planning : ' + site + '\n\nLe Comité Planning-Med';

        try {
          MailApp.sendEmail({
            to: email,
            subject: `[Planning-Med ${year}] Vos gardes ${year}`,
            htmlBody: html,
            body: bodyText,
          });
          sent++;
        } catch(err) {
          errors.push(`${nom} : ${err.message}`);
        }
      }

      logAction(`envoyerRecapGardes ${year} — ${sent} emails, ${skipped} sans email, ${errors.length} erreur(s)`);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, sent, skipped, errors
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'setIndisposYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      if (!newYear || newYear < 2026) return _error('Année invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      let found = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
          sheet.getRange(r+1, 2).setValue(newYear);
          found = true; break;
        }
      }
      if (!found) sheet.appendRow(['INDISPOS_ACTIVE', newYear]);
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      logAction(`setIndisposYear → ${newYear}`);
      return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'clearIndisposYear') {
      if (user.role !== 'admin') return _deny();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
          sheet.deleteRow(r+1); break;
        }
      }
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      logAction('clearIndisposYear — INDISPOS_ACTIVE supprimée');
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

// ── ACTION : savePlanningOverride ─────────────────────────────────────
// Appelé quand le comité place un MAR dans une case flash
// payload : { action, code, date, marId, morning, afternoon, comment }
if (action === 'savePlanningOverride') {
  if (user.role !== 'admin') return _deny();
  const { date, marId, morning, afternoon, comment } = payload;
  if (!date || !marId) return _error('date et marId requis');
  try {
    // Passer morning/afternoon TELS QUELS : null ou '' = « demi-jour non modifié »
    // (savePlanningOverride ne touchera alors pas cette colonne). Plus de recopie matin→aprem.
    savePlanningOverride(date, marId, morning, afternoon, comment || '');
    logAction(`savePlanningOverride — ${marId} le ${date} → ${morning}`);
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}

// ── ACTION : savePlanningOverridesBatch ───────────────────────────────
// Toute une rafale de placements du comité en UN appel (>20 par session mesurés).
// payload : { action, code, items:[{date, marId, morning, afternoon, comment}, …] }
// Exclue de WRITE_ACTIONS_LOCK comme l'unitaire : verrou dédié dans code.gs
// (même verrou de script → exclusion mutuelle avec l'unitaire et deleteOverride).
if (action === 'savePlanningOverridesBatch') {
  if (user.role !== 'admin') return _deny();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return _error('items requis');
  try {
    const res = savePlanningOverridesBatch(items);
    logAction(`savePlanningOverridesBatch — ${res.saved} placement(s) (${items.length} item(s) reçus)`);
    return ContentService.createTextOutput(JSON.stringify({success: true, saved: res.saved}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}

// ── ACTION : getPanneauSemaine ────────────────────────────────────────
// (28/07/2026) UN SEUL APPEL POUR TOUTE LA SEMAINE.
// Mesure du jour : une requete qui ne fait RIEN (17 ms de travail) coute 2 a 3 s
// d'attente a la porte d'entree Google — identique sur un deploiement neuf, donc
// hors de notre controle. Le seul levier est de payer ce peage moins souvent.
// Le panneau de placement coutait 2 appels PAR JOUR ouvert (dispos + liberal) ;
// il n'en coute plus qu'UN pour les 7 jours, lance en arriere-plan des l'affichage
// de la semaine. Au clic, le panneau s'ouvre sans aucun appel.
// Le surcout serveur est faible : les onglets (GARDES, AFFECTATIONS, MEDECINS)
// sont lus UNE fois pour les 7 jours, la ou getMARsDispoJour les relisait a chaque
// appel. Seule la boucle par jour se repete, sur des donnees deja en memoire.
// payload : { action, code, dates:[ '2026-08-03', … ] }  (1 a 10 dates)
if (action === 'getPanneauSemaine') {
  if (user.role !== 'admin') return _deny();
  const dates = Array.isArray(payload.dates) ? payload.dates.map(function(d){ return String(d||'').trim(); }).filter(Boolean) : [];
  if (!dates.length) return _error('dates requises');
  if (dates.length > 10) return _error('10 dates maximum');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Une seule annee par appel : la semaine a cheval sur deux annees civiles reste
    // dans la meme annee de planning (GARDES_{Y} couvre jusqu'a debut janvier).
    const year = Number(dates[0].slice(0,4));
    const gardesSheet = ss.getSheetByName('GARDES_' + year);
    if (!gardesSheet) return _error('GARDES_' + year + ' introuvable');

    // ── Lectures MUTUALISEES : une fois pour les 7 jours ──
    const gardesData = gardesSheet.getDataRange().getValues();
    const dateToCol  = buildDateToCol(gardesData, year);
    const affSheet   = ss.getSheetByName('AFFECTATIONS_' + year);
    const affData    = affSheet ? affSheet.getDataRange().getValues() : null;
    const medSheet   = ss.getSheetByName('MEDECINS');
    const actifs = [];
    const initMap = {};
    if (medSheet) {
      const medData = _medecinsRows_();
      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][COL_MED.ID]).trim();
        if (!id) continue;
        initMap[id] = String(medData[r][COL_MED.INITIALES] || '').trim();
        if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O') actifs.push(id);
      }
    }
    const FLAGS = getMedecinFlags();
    // Affectations par mois : memoisees, la semaine ne couvre au plus que deux mois.
    const affParMois = {};
    const _affDuMois = function (monthIdx) {
      if (affParMois[monthIdx]) return affParMois[monthIdx];
      const m = {};
      if (affData) {
        for (let r = 1; r < affData.length; r++) {
          const id = String(affData[r][0]).trim();
          if (!id) continue;
          m[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
        }
      }
      affParMois[monthIdx] = m;
      return m;
    };
    /* (04/08/2026, etage 2) CŒUR PARTAGÉ — la logique de tri vit desormais
       dans calculerDispoJour (fichier `dispo_jour`, source unique du depot :
       partage/dispo_jour.js, incluse A L'IDENTIQUE cote frontend).
       Equivalence prouvee par test-oracle (400 cas) avant extraction.
       Toute evolution du tri se fait LA-BAS et se deploie des deux cotes. */
    const jours = {};
    dates.forEach(function (targetDate) {
      const colIdx = dateToCol[targetDate];
      if (colIdx === undefined) { jours[targetDate] = {dispo: [], absent: true}; return; }
      const codeById = {};
      for (let r = 3; r < gardesData.length; r++) {
        const gid = String(gardesData[r][0]).trim();
        if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
      }
      jours[targetDate] = { dispo: calculerDispoJour(targetDate, {
        actifs: actifs, initiales: initMap,
        affectationDuMois: _affDuMois(new Date(targetDate + 'T12:00:00').getMonth() + 1),
        codeById: codeById, flags: FLAGS,
      }) };
    });

    // ── Liberal : l'onglet LIBERAL_{Y} lu UNE fois pour les 7 jours ──
    // (listLiberalJour le relisait entierement a chaque jour ouvert)
    const liberal = {};
    dates.forEach(function (d) { liberal[d] = []; });
    try {
      // ⚠️ Une semaine peut chevaucher DEUX annees civiles (28/12 → 03/01), et les
      // declarations sont rangees par annee civile de la DATE DE BLOC. Lire le seul
      // onglet du lundi faisait disparaitre les interventions de janvier (mesure du
      // 29/07/2026 : 3 jours en 2026→2027, 6 en 2029→2030). On lit chaque annee
      // presente dans la semaine. (Ici c'est bien l'annee CIVILE, pas anneePlanning :
      // les onglets LIBERAL_{Y} suivent le releve, qui est calendaire.)
      const _libAns = {};
      dates.forEach(function (d) { _libAns[_libYearOf(d)] = true; });
      Object.keys(_libAns).forEach(function (_an) {
        const libSh = ss.getSheetByName(_libSheetName(Number(_an)));
        if (!libSh) return;
        const libData = libSh.getDataRange().getValues();
        for (let r = 1; r < libData.length; r++) {
          const dBloc = _isoDate(libData[r][2]);
          if (!liberal.hasOwnProperty(dBloc)) continue;
          liberal[dBloc].push({
            id:         String(libData[r][0]),
            marId:      String(libData[r][3]).trim(),
            secteur:    String(libData[r][4]).trim().toUpperCase(),
            chirurgie:  String(libData[r][5] || '').trim(),
            specialite: String(libData[r][6] || '').trim().toUpperCase(),
            brCcam:     _libMoney_(libData[r][7]),
            brNgap:     _libMoney_(libData[r][8]),
          });
        }
      });
      Object.keys(liberal).forEach(function (d) {
        liberal[d].sort(function (a, b) { return String(a.marId).localeCompare(String(b.marId)); });
      });
    } catch(e) {
      // Le volet liberal est un confort : son echec ne doit jamais priver le comite
      // des dispos. On renvoie des listes vides plutot qu'une erreur.
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true, dates: dates, jours: jours, liberal: liberal
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}

// ── ACTION : getMARsDispoJour ─────────────────────────────────────────
// Retourne les MARs disponibles un jour donné pour le popup "combler case flash"
// Groupés par rôle : VOLANT / CTP / R / autres présents
// payload : { action, code, date }
if (action === 'getMARsDispoJour') {
  if (user.role !== 'admin') return _deny();
  const targetDate = String(payload.date || '').trim();
  if (!targetDate) return _error('date requise');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(targetDate.slice(0,4));
  const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
  if (!gardesSheet) return _error(`GARDES_${year} introuvable`);

  const gardesData = gardesSheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(gardesData, year);
  const colIdx = dateToCol[targetDate];
  if (colIdx === undefined) return _error(`Date ${targetDate} introuvable dans GARDES_${year}`);

  const affSheet = ss.getSheetByName(`AFFECTATIONS_${year}`);
  const medSheet = ss.getSheetByName('MEDECINS');

  // Lire l'affectation de chaque MAR
  const affMap = {}; // marId → secteur
  if (affSheet) {
    const affData = affSheet.getDataRange().getValues();
    const dt = new Date(targetDate + 'T12:00:00');
    const monthIdx = dt.getMonth() + 1; // 1-12
    for (let r = 1; r < affData.length; r++) {
      const id = String(affData[r][0]).trim();
      if (!id) continue;
      // Colonne du mois (1=JAN, 2=FEV, ... 12=DEC)
      affMap[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
    }
  }

  // Lire les actifs depuis MEDECINS
  const actifs = new Set();
  const initMap = {};
  if (medSheet) {
    const medData = _medecinsRows_();
    for (let r = 1; r < medData.length; r++) {
      const id = String(medData[r][COL_MED.ID]).trim();
      if (!id) continue;
      initMap[id] = String(medData[r][COL_MED.INITIALES] || '').trim();   // colonne INITIALES
      if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O') actifs.add(id);
    }
  }

  const FLAGS = getMedecinFlags(); // (C2-D2) date_debut/date_fin externalisées → MEDECINS

  // (C2-D2) Index des codes GARDES par MAR (un MAR sans ligne GARDES → code vide).
  const codeById = {};
  for (let r = 3; r < gardesData.length; r++) {
    const gid = String(gardesData[r][0]).trim();
    if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
  }

  /* (04/08/2026, etage 2) CŒUR PARTAGÉ — meme delegation que getPanneauSemaine :
     calculerDispoJour (fichier `dispo_jour` / partage/dispo_jour.js). L'iteration
     sur l'effectif MEDECINS actifs (C2-D2) et toutes les regles (TP fixes C2-D3,
     bornes, rythme 2/2, tri VOLANT en tete) vivent dans le module. */
  const dispo = calculerDispoJour(targetDate, {
    actifs: Array.from(actifs), initiales: initMap,
    affectationDuMois: affMap, codeById: codeById, flags: FLAGS,
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true, date: targetDate, dispo
  })).setMimeType(ContentService.MimeType.JSON);
}
/* (10/09/2026) ENVOI DES CODES SUPPRIMÉ — l'action `sendCodesWithRecap`
   terminait le W1 par un mail portant trois choses : le code d'accès, le
   récap des congés posés au staff, et l'annonce de l'ouverture.
   Les trois ont perdu leur raison d'être : le code des indispos est devenu
   celui du portail (plus rien à rappeler), les VAC/FORM verrouillés sont
   consultables dans « Mes indispos » avec leur cadenas, et l'ouverture
   s'annonce de vive voix — le staff est justement en séance à ce moment-là.
   `renderRecapMailBlocks_` est partie avec : plus aucun appelant.
   L'ouverture de la saisie N'A JAMAIS été faite ici : elle est écrite à
   l'étape 4, par setIndisposYear (INDISPOS_ACTIVE). Rien n'a changé de ce
   côté. */
if (action === 'setDailyStatus') {
      if (user.role !== 'admin') return _deny();
      /* (2026-08-05.9) Corps extrait dans appliquerStatutJour — une seule
         source pour le routage et l'applicateur du journal. */
      try {
        const res = appliquerStatutJour(
          Number(payload.year) || TEST_YEAR,
          payload.marId, payload.statut,
          Array.isArray(payload.dates) ? payload.dates : (payload.date ? [String(payload.date)] : []));
        return ContentService.createTextOutput(JSON.stringify({ success: true, applied: res.applied, rejected: res.rejected }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (e) { return _error(e.message); }
    }
    if (action === 'poserAbsenceLongue') {
      if (user.role !== 'admin') return _deny();
      const marId = String(payload.marId || '').trim().toUpperCase();
      const d1 = String(payload.dateDebut || '').trim();
      const d2 = String(payload.dateFin   || '').trim();
      if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
      if (d1 > d2) return _error('La date de début est après la date de fin');

      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // Registre persistant des absences longues -> permet le report auto vers les années pas encore créées (initYear le rejoue)
      {
        let absSheet = ss.getSheetByName('ABSENCES_LONGUES');
        if (!absSheet) { absSheet = ss.insertSheet('ABSENCES_LONGUES'); absSheet.appendRow(['MAR_ID','DATE_DEBUT','DATE_FIN','POSE_LE']); }
        absSheet.getRange('B:C').setNumberFormat('@');   // dates stockées en TEXTE (pas de coercition Date)
        const adata = absSheet.getDataRange().getValues();
        let exists = false;
        for (let r = 1; r < adata.length; r++) {
          if (String(adata[r][0]).trim().toUpperCase() === marId
              && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { exists = true; break; }
        }
        if (!exists) absSheet.appendRow([marId, d1, d2, new Date()]);
      }

      // Toutes les dates calendaires de la plage [d1, d2]
      const allDates = [];
      { const cur = new Date(d1 + 'T12:00:00'), end = new Date(d2 + 'T12:00:00');
        while (cur <= end) {
          allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        } }
      const nextStr = (d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate()+1);
        return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };

      // Années civiles couvrant la plage (1 ou 2 en pratique)
      const years = [];
      for (let y = Number(d1.slice(0,4)); y <= Number(d2.slice(0,4)); y++) years.push(y);

      const freed = [];                 // gardes libérées {date, role}
      const deferred = [];              // années de la plage pas encore créées (report différé à l'init)
      let nbCL = 0;
      const touched = [];

      years.forEach(year => {
        const gSheet = ss.getSheetByName(`GARDES_${year}`);
        if (gSheet) {
          // Année GÉNÉRÉE : CL écrase tout (gardes + RG), on note les gardes libérées
          const data = gSheet.getDataRange().getValues();
          const dateToCol = buildDateToCol(data, year);
          let row = -1;
          for (let r = 3; r < data.length; r++)
            if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
          if (row < 0) return;
          const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          inYear.forEach(dt => {
            const col = dateToCol[dt];
            const curv = String(data[row][col] || '').trim().toUpperCase();
            if (curv === 'G' || curv === 'G2') freed.push({ date: dt, role: curv });
            gSheet.getRange(row + 1, col + 1).setValue('CL');
            indMap[dt] = 'CL';
            nbCL++;
          });
          // Nettoie le RG du lendemain d'une garde libérée si ce lendemain est hors plage
          freed.forEach(f => {
            const lend = nextStr(f.date), lc = dateToCol[lend];
            if (lc !== undefined && inYear.indexOf(lend) < 0
                && String(data[row][lc] || '').trim().toUpperCase() === 'RG')
              gSheet.getRange(row + 1, lc + 1).setValue('');
          });
          saveIndisposForDoctor(marId, indMap, year);
          touched.push(`${year} (générée)`);
        } else {
          // Année NON générée : CL dans INDISPOS seulement (zéro garde à reprendre)
          const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
          if (!iSheet) { deferred.push(year); return; }
          const idata = iSheet.getDataRange().getValues();
          const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
          const inYear = allDates.filter(dt => dset.has(dt));
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          inYear.forEach(dt => { indMap[dt] = 'CL'; nbCL++; });
          saveIndisposForDoctor(marId, indMap, year);
          touched.push(`${year} (préparation)`);
        }
      });

      if (!nbCL && !deferred.length) return _error('Aucune date de la plage ne correspond à une année configurée (INDISPOS/GARDES).');
      freed.sort((a,b) => a.date < b.date ? -1 : 1);
      logAction(`poserAbsenceLongue — ${marId} ${d1} -> ${d2} : ${nbCL} j CL, ${freed.length} garde(s) liberee(s)${deferred.length ? ', reporté: ' + deferred.join('/') : ''}`);
      return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbCL, freed, touched, deferred }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── (RH-2) Lister le registre des absences longues ──────────────────
    if (action === 'getAbsencesLongues') {
      if (user.role !== 'admin') return _deny();
      const absSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ABSENCES_LONGUES');
      const absences = [];
      if (absSheet) {
        const adata = absSheet.getDataRange().getValues();
        for (let r = 1; r < adata.length; r++) {
          const id = String(adata[r][0]).trim().toUpperCase();
          if (!id) continue;
          absences.push({ marId: id, dateDebut: _isoDate(adata[r][1]), dateFin: _isoDate(adata[r][2]) });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, absences }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── (RH-2) Annuler ou raccourcir une absence longue ─────────────────
    // Sans nouvelleFin : annulation totale (efface les CL de [d1,d2] + supprime
    // la ligne du registre). Avec nouvelleFin : retour anticipé (efface les CL
    // de ]nouvelleFin, d2] + met à jour la ligne du registre).
    // SÉCURITÉ : on n'efface QUE les cases valant exactement 'CL' — jamais une
    // garde, un statut ou toute autre valeur. Les gardes libérées à la pose ne
    // sont PAS restaurées (redistribution par don/échange/garde exceptionnelle).
    if (action === 'annulerAbsenceLongue') {
      if (user.role !== 'admin') return _deny();
      const marId = String(payload.marId || '').trim().toUpperCase();
      const d1 = String(payload.dateDebut || '').trim();
      const d2 = String(payload.dateFin   || '').trim();
      const nf = String(payload.nouvelleFin || '').trim();   // optionnel
      if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
      if (nf && !/^\d{4}-\d{2}-\d{2}$/.test(nf)) return _error('nouvelleFin au format YYYY-MM-DD');
      if (nf && (nf < d1 || nf >= d2)) return _error('La nouvelle fin doit être dans la plage (≥ début, < fin actuelle)');

      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // 1) Retrouver la ligne EXACTE du registre (marId + début + fin)
      const absSheet = ss.getSheetByName('ABSENCES_LONGUES');
      if (!absSheet) return _error('Registre ABSENCES_LONGUES introuvable');
      const adata = absSheet.getDataRange().getValues();
      let regRow = -1;
      for (let r = 1; r < adata.length; r++) {
        if (String(adata[r][0]).trim().toUpperCase() === marId
            && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { regRow = r; break; }
      }
      if (regRow < 0) return _error(`Absence introuvable au registre : ${marId} ${d1} -> ${d2}`);

      // 2) Plage à effacer : totale (annulation) ou queue (retour anticipé)
      const clearStart = nf ? (function(){ const x = new Date(nf + 'T12:00:00'); x.setDate(x.getDate()+1);
        return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; })() : d1;
      const clearEnd = d2;
      const allDates = [];
      { const cur = new Date(clearStart + 'T12:00:00'), end = new Date(clearEnd + 'T12:00:00');
        while (cur <= end) {
          allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        } }

      // 3) Effacer les CL année par année (miroir exact de poserAbsenceLongue)
      let nbEfface = 0;
      const touched = [];
      const years = [];
      for (let y = Number(clearStart.slice(0,4)); y <= Number(clearEnd.slice(0,4)); y++) years.push(y);
      years.forEach(year => {
        const gSheet = ss.getSheetByName(`GARDES_${year}`);
        if (gSheet) {
          // Année générée : effacer les CL de GARDES + miroir INDISPOS
          const data = gSheet.getDataRange().getValues();
          const dateToCol = buildDateToCol(data, year);
          let row = -1;
          for (let r = 3; r < data.length; r++)
            if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
          if (row < 0) return;
          const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          let n = 0;
          inYear.forEach(dt => {
            const col = dateToCol[dt];
            if (String(data[row][col] || '').trim().toUpperCase() !== 'CL') return; // on ne touche QUE les CL
            gSheet.getRange(row + 1, col + 1).setValue('');
            if (indMap[dt] === 'CL') delete indMap[dt];
            n++;
          });
          if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (générée)`); }
        } else {
          // Année non générée : effacer les CL d'INDISPOS seulement
          const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
          if (!iSheet) return; // année pas créée : rien à effacer, la purge du registre suffit
          const idata = iSheet.getDataRange().getValues();
          const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
          const inYear = allDates.filter(dt => dset.has(dt));
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          let n = 0;
          inYear.forEach(dt => { if (indMap[dt] === 'CL') { delete indMap[dt]; n++; } });
          if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (préparation)`); }
        }
      });

      // 4) Registre : mise à jour (raccourci) ou suppression (annulation)
      if (nf) absSheet.getRange(regRow + 1, 3).setValue(nf);
      else    absSheet.deleteRow(regRow + 1);

      logAction(`annulerAbsenceLongue — ${marId} ${d1} -> ${d2}${nf ? ' raccourcie au ' + nf : ' ANNULEE'} : ${nbEfface} CL effacé(s)`);
      return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbEfface, touched, nouvelleFin: nf || null }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── ACTION : getConsultAbsences (Lot 5-bis) ──────────────────────────
    // Alimente l'ecran « Consultations a venir ». LECTURE SEULE, aucune donnee patient.
    // Un seul aller-retour : consultations posees + absences de chaque MAR.
    // ⚠️ Deux reponses selon le role : le motif d'absence (`c`) n'est JOINT QUE pour
    //    'mar' et 'admin'. En session 'secretariat' il n'est meme pas envoye — le
    //    masquer cote navigateur le laisserait lisible dans le source de la page.
    if (action === 'getConsultAbsences') {
      try {
        const JOURS_CONSULT = 20;  // 4 semaines ouvrees de consultations affichees
        const JOURS_ABS     = 20;  // 4 semaines d'absences APRES la derniere consultation
        const avecMotifs = (user.role !== 'secretariat');
        const _isoD = function (d) {
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                 '-' + String(d.getDate()).padStart(2, '0');
        };
        // 1) Fenetre de jours ouvres a partir d'aujourd'hui. Il en faut
        //    JOURS_CONSULT + JOURS_ABS : chaque consultation regarde 4 semaines DEVANT
        //    elle, donc la derniere consultation affichee a besoin de 4 semaines de plus.
        const jours = [];
        const _cur = new Date(); _cur.setHours(12, 0, 0, 0);
        while (jours.length < JOURS_CONSULT + JOURS_ABS) {
          const _dw = _cur.getDay();
          if (_dw >= 1 && _dw <= 5) jours.push(_isoD(_cur));
          _cur.setDate(_cur.getDate() + 1);
        }
        const joursConsult = jours.slice(0, JOURS_CONSULT);

        // 2) Effectif actif (MEDECINS). Index figes : [0] id, [1] nom, [3] actif.
        const ssL = SpreadsheetApp.getActiveSpreadsheet();
        const medSh = ssL.getSheetByName('MEDECINS');
        if (!medSh) return _error('Onglet MEDECINS introuvable');
        const medD = _medecinsRows_();
        const noms = {};
        // Appartenance au groupement liberal : colonne LIBERAL de MEDECINS, lue PAR
        // TITRE (comme checkCode). ⚠️ Ne JAMAIS deduire l'appartenance du releve : un
        // membre dont le mois n'est pas encore saisi n'y figure pas, il serait retire
        // des remplacants possibles alors qu'il est parfaitement disponible.
        const _hdrMed = (medD[0] || []).map(function (x) { return String(x).trim().toUpperCase(); });
        const colLibC = _hdrMed.indexOf('LIBERAL');
        const groupement = {};
        for (let r = 1; r < medD.length; r++) {
          const id = String(medD[r][COL_MED.ID]).trim();
          if (!id) continue;
          if (String(medD[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
          noms[id] = String(medD[r][COL_MED.NOM]).trim();
          if (colLibC >= 0 && String(medD[r][colLibC]).trim().toUpperCase() === 'O') groupement[id] = true;
        }

        // 3) Consultations : lues dans le PLANNING PUBLIE (planning_{Y}.json), pas dans
        //    PLANNING_OVERRIDES. Raison : les overrides ne contiennent que ce que le comite
        //    a pose A LA MAIN ; tout ce qui vient de la generation (dont les affectations de
        //    secteur) n'y figure pas. Le JSON est le rendu final = generation + overrides,
        //    donc exactement ce que voient les MARs dans planning.html. S'il n'est pas publie,
        //    la consultation n'existe pour personne — la source est donc la bonne par
        //    definition. Le JSON est lu ICI, cote serveur : il ne part JAMAIS au navigateur
        //    (il contient le code d'absence brut de chaque MAR dans `status`).
        const consultations = [];
        const vus = {};                       // dedoublonnage date|mar|periode
        const anneesJ = {};
        // anneePlanning (code.gs) et non ds.slice(0,4) : les 1ers jours de janvier
        // appartiennent au planning de l'annee PRECEDENTE (cf. commentaire du helper).
        joursConsult.forEach(function (ds) { anneesJ[anneePlanning(ds)] = true; });
        Object.keys(anneesJ).forEach(function (an) {
          let doc;
          try {
            const raw = readPlanningFromDrive('planning_' + an + '.json');
            if (!raw) return;                  // annee non publiee : rien a lire
            doc = JSON.parse(raw);
          } catch (e) { return; }
          (doc.months || []).forEach(function (mois) {
            const jrs = mois.days || [];
            (mois.doctors || []).forEach(function (md) {
              const id = md.id;
              if (!noms[id]) return;           // MAR inactif ou inconnu
              (md.days || []).forEach(function (cell, i) {
                const j = jrs[i];
                if (!j || !j.date || joursConsult.indexOf(j.date) < 0) return;
                if (j.isWeekend || j.isFerie) return;
                const am = String((cell && cell.morning)   || '');
                const pm = String((cell && cell.afternoon) || '');
                const cs = String((cell && cell.cs)        || '');
                const _add = function (code, per) {
                  const k = j.date + '|' + id + '|' + per;
                  if (vus[k]) return;
                  vus[k] = true;
                  consultations.push({date: j.date, mar: id, cs: code, per: per});
                };
                if (am.indexOf('CS-') === 0) _add(am, 'am');
                if (pm.indexOf('CS-') === 0) _add(pm, 'pm');
                if (cs.indexOf('CS-') === 0) _add(cs, 'am');   // champ dedie (defensif)
                // MIROIR MATERNITE — mardi (dow 2) et jeudi (dow 4) matin.
                // Regle existante d'admin.html l.2586 : « la consult CS-MAT et la ligne MAT
                // sont la MEME personne, le MAR de mater fait la consult systematiquement ».
                // Elle n'est ecrite NULLE PART dans les donnees : elle est recalculee a
                // l'affichage. Sans cette reprise, l'ecran raterait toutes les consultations
                // de maternite. Sens unique, comme dans admin.html : etre en MAT implique la
                // consult, l'inverse n'est pas vrai.
                if ((j.dow === 2 || j.dow === 4) && am === 'MAT') _add('CS-MAT', 'am');
              });
            });
          });
        });
        consultations.sort(function (a, b) {
          return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.per < b.per ? -1 : 1);
        });

        // 4) Absences par MAR sur toute la fenetre.
        //    Source : GARDES_{Y} (onglet maitre : la campagne d'indispos y est recopiee
        //    par generateur_gardes.gs, et poserAbsenceLongue y ecrit CL directement).
        //    ABSENT_CODES (code.gs) = RG,V,F,CTP,CP,R,A,TP,CL — G/G2 volontairement
        //    ABSENTS de ce jeu : un MAR de garde peut assurer une intervention liberale.
        //    Trois absences ne figurent PAS dans GARDES et sont ajoutees ici, sans quoi
        //    l'ecran afficherait « disponible » a tort :
        //      TP  = jour fixe non travaille (colonne tp_jours_fixes de MEDECINS)
        //      OFF = semaine off du rythme 2/2
        //      HS  = hors periode d'activite (date_debut / date_fin)
        const FL = getMedecinFlags();
        const parAn = {};                                // annee -> {data, dateToCol}
        const _gardes = function (an) {
          if (parAn[an] === undefined) {
            const sh = ssL.getSheetByName('GARDES_' + an);
            if (!sh) { parAn[an] = null; }
            else {
              const dt = sh.getDataRange().getValues();
              const codes = {};
              for (let r = 3; r < dt.length; r++) {      // MARs des la ligne 4
                const gid = String(dt[r][0]).trim();
                if (gid) codes[gid] = dt[r];
              }
              parAn[an] = {codes: codes, col: buildDateToCol(dt, an)};
            }
          }
          return parAn[an];
        };

        const absences = {};
        const horsTotal = [];          // MAR hors service sur TOUTE la fenetre
        Object.keys(noms).forEach(function (id) {
          const liste = [];
          let nbHS = 0;
          const tpj = FL.tpJoursFixes[id];
          const dd  = FL.dateDebut[id], df = FL.dateFin[id];
          jours.forEach(function (ds) {
            let code = '';
            if (dd && ds < dd) code = 'HS';                        // pas encore en poste
            else if (df && ds >= df) code = 'HS';                  // a quitte le service
            else {
              const g = _gardes(anneePlanning(ds));   // pas ds.slice(0,4) : voir code.gs
              if (g) {
                const c = g.col[ds];
                if (c !== undefined && g.codes[id]) {
                  code = String(g.codes[id][c] || '').trim().toUpperCase();
                }
              }
              if (!ABSENT_CODES.has(code)) code = '';              // present ce jour-la
              if (!code && tpj && tpj.has(new Date(ds + 'T12:00:00').getDay())) code = 'TP';
              if (!code && estSemaineOff(id, ds)) code = 'OFF';
            }
            if (code === 'HS') nbHS++;
            if (code) liste.push(avecMotifs ? {d: ds, c: code} : {d: ds});
          });
          // Hors service sur TOUS les jours de la fenetre (pas encore arrive, ou deja
          // parti) : il ne fait pas partie de l'effectif pour cette periode.
          if (nbHS === jours.length) { horsTotal.push(id); return; }
          if (liste.length) absences[id] = liste;
        });
        // ⚠️ Retirer AUSSI de `noms` et des consultations, pas seulement des absences :
        // un MAR absent de la carte d'absences serait lu comme PRESENT par le frontend
        // (« pas d'absence ce jour-la »), donc propose comme remplacant alors qu'il
        // n'est pas dans le service. C'est le faux « disponible » que l'outil doit eviter.
        horsTotal.forEach(function (id) { delete noms[id]; delete absences[id]; });
        const consultationsF = consultations.filter(function (c) { return !!noms[c.mar]; });

        // 5) MARGE LIBERALE (axe CCAM) — sert a classer les remplacants possibles.
        //    Une consultation liberale declenche un bloc : c'est le CCAM qui portera
        //    la charge, pas le NGAP. Calculee ICI et non par un appel getReleveLiberal
        //    du navigateur : cette action reste HORS de SECRETARIAT_ACTIONS. Ne sort
        //    qu'UNE valeur derivee par MAR — jamais les tarifs, pourcentages ni exces.
        //    ⚠️ Le jour ou le secretariat prend cette mission : remplacer ici la valeur
        //    par un rang (1, 2, 3…) quand avecMotifs === false. L'ordre reste, les
        //    montants disparaissent, et rien ne change dans la page.
        let marges = {}, margesMois = '';
        try {
          if (typeof getReleveLiberal === 'function') {
            const rel = getReleveLiberal({});                 // annee liberale par defaut
            const its = (rel && rel.items) || [];
            if (its.length) {
              const dernier = its.map(function (i) { return i.mois; }).sort().pop();
              its.forEach(function (i) {
                if (i.mois !== dernier) return;
                if (i.tCcam === null || i.pctCcam === null) return;
                // marge = T x (3 - 10p) / 7 : nulle a 30 %, negative au-dela
                marges[i.marId] = i.tCcam * (3 - 10 * (i.pctCcam / 100)) / 7;
              });
              margesMois = dernier;
            }
          }
        } catch (e) { marges = {}; margesMois = ''; }   // confort de tri : jamais bloquant
        // Non-membre du groupement : aucun chiffre. Le masquage de la tuile ne suffit
        // pas — absences.html est une page publique, seul le serveur ferme la porte.
        if (!user.liberal) { marges = {}; margesMois = ''; }

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          motifs: avecMotifs,          // le frontend sait s'il peut afficher un motif
          groupement: groupement,      // id -> true : membre du groupement liberal
          marges: marges,              // id -> marge CCAM restante (euros), dernier releve
          margesMois: margesMois,      // 'AAAA-MM' du releve utilise ('' si aucun)
          role: user.role,                       // (04/08/2026, fusion absences.html) auth + donnees en UN appel
          name: user.name || '',                 //  → le login separe devient un simple journal d'arriere-plan
          moi: user.role === 'mar' ? user.id : null,
          jours: joursConsult,
          noms: noms,
          consultations: consultationsF,
          absences: absences
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error(err.message); }
    }

    // ── JSON du planning (Drive) — consommés par planning.html / index.html ──
    // (Reconstruits après la régression de recopie : ils n'existaient qu'en prod.)
    if (action === 'getPlanningJson') {
      const jy = parseInt(payload.year) || getActiveYear();
      const raw = readPlanningFromDrive(`planning_${jy}.json`);
      if (!raw) return _error(`planning_${jy}.json introuvable dans le Drive`);
      return ContentService.createTextOutput(JSON.stringify({success:true, planning: JSON.parse(raw)}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getAffectationsJson') {
      const jy = parseInt(payload.year) || getActiveYear();
      const raw = readPlanningFromDrive(`affectations_${jy}.json`);
      if (!raw) return _error(`affectations_${jy}.json introuvable dans le Drive`);
      return ContentService.createTextOutput(JSON.stringify({success:true, affectations: JSON.parse(raw)}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── PORTAIL (index.html) : délégation au routeur de portail.gs ──
    // Auth déjà faite plus haut (checkCode) → toute action portail est code-gated.
    if (typeof portailRoute === 'function') {
      const _rp = portailRoute(action, payload, user);
      if (_rp) return _rp;
    }

    return ContentService.createTextOutput(JSON.stringify({success:false, error:'Action inconnue'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── HELPERS INTERNES ─────────────────────────────────────────────────
function _deny() {
  return ContentService.createTextOutput(JSON.stringify({success:false, error:'Accès refusé'}))
    .setMimeType(ContentService.MimeType.JSON);
}
function _error(msg) {
  return ContentService.createTextOutput(JSON.stringify({success:false, error:msg}))
    .setMimeType(ContentService.MimeType.JSON);
}
// Normalise une valeur de cellule (texte OU objet Date) en 'yyyy-MM-dd' — évite la coercition date de Sheets.
// _isoDate : DEFINITION UNIQUE dans portail.gs (espace de noms commun Apps Script).
// Le doublon qui vivait ici a ete supprime le 29/07/2026 : les deux versions
// divergeaient et l'ordre des fichiers du projet decidait silencieusement
// laquelle tournait. La version conservee (portail.gs) est la plus stricte.

function doGet(e) {
  const _t0 = Date.now();
  const out = _routeRequete_(e);
  // (03/08/2026, miroir) Après une ÉCRITURE réussie, déposer les données à
  // jour au miroir Cloudflare (miroir.gs). Coût nul pour les lectures (un
  // simple lookup) ; jamais bloquant : une panne du miroir n'affecte
  // aucune réponse du portail.
  try { miroirApresRequete_(e, out.getContent()); } catch (_m) {}
  return _ajouterDureeServeur_(out, _t0);
}
function _ajouterDureeServeur_(out, t0) {
  try {
    /* (01/08/2026) INSERTION PAR TEXTE, PLUS PAR ANALYSE COMPLETE.
       Version du 28/07 : JSON.parse de TOUTE la reponse, ajout des champs, puis
       JSON.stringify. Pour le bootstrap cela fait ~350 Ko analyses puis
       reencodes uniquement pour y glisser deux nombres — sur CHAQUE reponse.
       Ici les champs sont inseres juste apres l'accolade ouvrante, par simple
       concatenation. Le JSON produit est rigoureusement identique.
       CONDITION STRICTE : on n'insere que si le texte commence par `{"`, ce qui
       garantit qu'un objet NON VIDE suit — donc que la virgule ajoutee reste
       valide. Un `{}`, un JSON indente ou un tableau retombent sur l'ancienne
       voie : jamais de JSON invalide produit.
       Le plafond de 400 000 caracteres ne s'applique plus qu'a ce repli : il
       n'existait qu'a cause du cout du parse. */
    const txt = out.getContent();
    if (!txt || txt.charAt(0) !== '{') return out;
    let _g = null;
    try { _g = t0 - _T_GLOBAUX; } catch (e) { _g = null; }
    const _champs = '"_srv_ms":' + (Date.now() - t0)
                  + (_g === null ? '' : ',"_glob_ms":' + _g);
    if (txt.charAt(1) === '"') {
      return ContentService.createTextOutput('{' + _champs + ',' + txt.slice(1))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (txt.length > 400000) return out;          // repli : ancienne voie
    const o = JSON.parse(txt);
    o._srv_ms = Date.now() - t0;
    if (_g !== null) o._glob_ms = _g;
    return ContentService.createTextOutput(JSON.stringify(o))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return out;   // au moindre doute, la reponse d'origine part telle quelle
  }
}

function doPost(e) {
  // Réutiliser doGet en reconstituant e.parameter
  try {
    const payload = JSON.parse(e.postData.contents);
    return doGet({parameter: {payload: JSON.stringify(payload)}});
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}