// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_INDISPOS = '2026-09-15.2';   // (15/09/2026) chantier 9, étape 2 : le routeur est une TABLE (_actions_) ; les corps des 64 actions vivent dans les fichiers métier (_act_<nom>)

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

/* ═══ LA TABLE DES ACTIONS (15/09/2026, chantier 9 — étape 2) ═══
   Une ligne par action : son nom, qui a le droit, quelle fonction. Avant : 64
   « if (action === …) » de 2 700 lignes dans lesquels le contrôle de rôle se
   perdait. Le corps des actions vit dans les fichiers métier (_act_<nom>), le
   contrôle de rôle est resté DANS chaque corps, inchangé ; « role » ci-dessous
   le DÉCLARE, et banc_contrat_routeur.js vérifie que la déclaration et le corps
   disent la même chose. Rôles : admin (refus sec hors comité) · mar seulement ·
   tout code valide (tout code authentifié ; le secrétariat n'accède qu'aux
   SECRETARIAT_ACTIONS) · conditionnel (le rôle décide du périmètre à l'intérieur).
   Les tables sont construites AU PREMIER APPEL, pas au chargement : les fonctions
   _act_… vivent dans d'autres fichiers, et Apps Script charge les fichiers dans un
   ordre qu'il ne garantit pas (piège déjà rencontré avec ARCHIVE_DRIVE_ID). */
let _ACTIONS_MEMO_ = null;
function _actions_() {
  if (_ACTIONS_MEMO_) return _ACTIONS_MEMO_;
  const SANS_CODE = {   // servies AVANT checkCode : des listes d'années, rien de nominatif
    "getActiveYear"               : { role: 'sans code'         , fn: _act_getActiveYear },
    "getAnneesDisponibles"        : { role: 'sans code'         , fn: _act_getAnneesDisponibles },
  };
  const AVEC_CODE = {
    "viderCacheConfig"            : { role: 'admin'             , fn: _act_viderCacheConfig },   // equipe.gs
    "getStatus"                   : { role: 'tout code valide'  , fn: _act_getStatus },   // equipe.gs
    "getStatsLive"                : { role: 'tout code valide'  , fn: _act_getStatsLive },   // gardes.gs
    "login"                       : { role: 'tout code valide'  , fn: _act_login },   // equipe.gs
    "getReliquats"                : { role: 'admin'             , fn: _act_getReliquats },   // gardes.gs
    "getNoelAnEligibles"          : { role: 'tout code valide'  , fn: _act_getNoelAnEligibles },   // gardes.gs
    "getIndispos"                 : { role: 'conditionnel'      , fn: _act_getIndispos },   // indisponibilites.gs
    "deciderJourTpLot"            : { role: 'admin'             , fn: _act_deciderJourTpLot },   // temps_partiel.gs
    "deciderJourTp"               : { role: 'admin'                    , fn: _act_deciderJourTp },   // temps_partiel.gs
    "getPoseTp"                   : { role: 'conditionnel'             , fn: _act_getPoseTp },   // temps_partiel.gs
    "saveIndispos"                : { role: 'conditionnel'      , fn: _act_saveIndispos },   // indisponibilites.gs
    "saveIndisposBatch"           : { role: 'admin'             , fn: _act_saveIndisposBatch },   // indisponibilites.gs
    "getAllIndispos"              : { role: 'admin'             , fn: _act_getAllIndispos },   // indisponibilites.gs
    "applyModification"           : { role: 'admin'             , fn: _act_applyModification },   // gardes.gs
    "creerEchange"                : { role: 'tout code valide'  , fn: _act_creerEchange },   // equipe.gs
    "repondreEchange"             : { role: 'tout code valide'  , fn: _act_repondreEchange },   // equipe.gs
    "getStats"                    : { role: 'admin'             , fn: _act_getStats },   // gardes.gs
    "generateGardes"              : { role: 'admin'             , fn: _act_generateGardes },   // gardes.gs
    "getGardes"                   : { role: 'admin'             , fn: _act_getGardes },   // gardes.gs
    "getJoursFeries"              : { role: 'admin'             , fn: _act_getJoursFeries },   // indisponibilites.gs
    "getOrdreVacances"            : { role: 'mar seulement'     , fn: _act_getOrdreVacances },   // indisponibilites.gs
    "getVacConfig"                : { role: 'tout code valide'  , fn: _act_getVacConfig },   // indisponibilites.gs
    "setActiveYear"               : { role: 'admin'             , fn: _act_setActiveYear },   // Indispos.gs
    "initYear"                    : { role: 'admin'             , fn: _act_initYear },   // Indispos.gs
    "publishPlanning"             : { role: 'admin'             , fn: _act_publishPlanning },   // gardes.gs
    "getVacValidation"            : { role: 'admin'             , fn: _act_getVacValidation },   // indisponibilites.gs
    "getOverrides"                : { role: 'admin'             , fn: _act_getOverrides },   // gardes.gs
    "deleteOverride"              : { role: 'admin'             , fn: _act_deleteOverride },   // gardes.gs
    "getAdminBootstrap"           : { role: 'admin'             , fn: _act_getAdminBootstrap },   // equipe.gs
    "getMedecins"                 : { role: 'admin'             , fn: _act_getMedecins },   // equipe.gs
    "saveMedecin"                 : { role: 'admin'             , fn: _act_saveMedecin },   // equipe.gs
    "getAffectations"             : { role: 'admin'             , fn: _act_getAffectations },   // gardes.gs
    "saveAffectations"            : { role: 'admin'             , fn: _act_saveAffectations },   // gardes.gs
    "getVacancesConfig"           : { role: 'admin'             , fn: _act_getVacancesConfig },   // indisponibilites.gs
    "savePeriodes"                : { role: 'admin'             , fn: _act_savePeriodes },   // indisponibilites.gs
    "saveGroupes"                 : { role: 'admin'             , fn: _act_saveGroupes },   // indisponibilites.gs
    "saveConfig"                  : { role: 'admin'             , fn: _act_saveConfig },   // equipe.gs
    "sendCodes"                   : { role: 'admin'             , fn: _act_sendCodes },   // equipe.gs
    "mailNonLus"                  : { role: 'admin'             , fn: _act_mailNonLus },   // equipe.gs
    "mailListe"                   : { role: 'admin'             , fn: _act_mailListe },   // equipe.gs
    "mailMessage"                 : { role: 'admin'             , fn: _act_mailMessage },   // equipe.gs
    "diagComplet"                 : { role: 'admin'             , fn: _act_diagComplet },   // diagnostic.gs
    "archiveYear"                 : { role: 'admin'             , fn: _act_archiveYear },   // Indispos.gs
    "saveAffectationsMar"         : { role: 'admin'             , fn: _act_saveAffectationsMar },   // gardes.gs
    "addMedecinToGroupe"          : { role: 'admin'             , fn: _act_addMedecinToGroupe },   // equipe.gs
    "resetCodeMar"                : { role: 'admin'             , fn: _act_resetCodeMar },   // equipe.gs
    "sendCodesMar"                : { role: 'admin'             , fn: _act_sendCodesMar },   // equipe.gs
    "getConflitsAll"              : { role: 'admin'             , fn: _act_getConflitsAll },   // indisponibilites.gs
    "envoyerRecapIndispos"        : { role: 'admin'             , fn: _act_envoyerRecapIndispos },   // indisponibilites.gs
    "setIndisposYear"             : { role: 'admin'             , fn: _act_setIndisposYear },   // indisponibilites.gs
    "clearIndisposYear"           : { role: 'admin'             , fn: _act_clearIndisposYear },   // indisponibilites.gs
    "savePlanningOverride"        : { role: 'admin'             , fn: _act_savePlanningOverride },   // gardes.gs
    "savePlanningOverridesBatch"  : { role: 'admin'             , fn: _act_savePlanningOverridesBatch },   // gardes.gs
    "getPanneauSemaine"           : { role: 'admin'             , fn: _act_getPanneauSemaine },   // gardes.gs
    "getMARsDispoJour"            : { role: 'admin'             , fn: _act_getMARsDispoJour },   // gardes.gs
    "setDailyStatus"              : { role: 'admin'             , fn: _act_setDailyStatus },   // gardes.gs
    "poserAbsenceLongue"          : { role: 'admin'             , fn: _act_poserAbsenceLongue },   // indisponibilites.gs
    "getAbsencesLongues"          : { role: 'admin'             , fn: _act_getAbsencesLongues },   // indisponibilites.gs
    "annulerAbsenceLongue"        : { role: 'admin'             , fn: _act_annulerAbsenceLongue },   // indisponibilites.gs
    "getConsultAbsences"          : { role: 'conditionnel'      , fn: _act_getConsultAbsences },   // indisponibilites.gs
    "getPlanningJson"             : { role: 'tout code valide'  , fn: _act_getPlanningJson },   // gardes.gs
    "getAffectationsJson"         : { role: 'tout code valide'  , fn: _act_getAffectationsJson },   // gardes.gs
  };
  _ACTIONS_MEMO_ = { sansCode: SANS_CODE, avecCode: AVEC_CODE };
  return _ACTIONS_MEMO_;
}

function _routeRequete_(e) {
  try {
    const payload = JSON.parse(e.parameter.payload || '{}');
    const action = payload.action;
    const code = payload.code;

    /* (15/09/2026) Les deux actions sans code : la table SANS_CODE. */
    if (_actions_().sansCode[action]) return _actions_().sansCode[action].fn({ e, payload, action, code, user: null });
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
    /* (15/09/2026) Toute action connue : sa fonction, avec la requête. Le contrôle
       de rôle est dans le corps de chaque action, comme avant. */
    if (_actions_().avecCode[action]) return _actions_().avecCode[action].fn({ e, payload, action, code, user });

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
/* ═══ ACTIONS RESTÉES ICI : l'année (setActiveYear, initYear, archiveYear) et les deux listes sans code ═══ */

/* ── action "getActiveYear" ── */
function _act_getActiveYear(R) {
  const { e, payload, action, code, user } = R;
  return ContentService.createTextOutput(JSON.stringify({
    success: true, year: TEST_YEAR
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getAnneesDisponibles" ── */
/* (03/08/2026) Quelles annees sont consultables ?
   admin.html testait l'existence de « ./archives/stats_{annee}.json » sur le site —
   fichier qui n'a JAMAIS ete cree : depuis le passage au Drive prive, l'archivage
   ecrit « archives_stats_{annee}.json » sur Drive. Le selecteur ne pouvait donc
   jamais proposer une annee cloturee. planning.html, lui, sondait les annees une par
   une (un appel par annee, or Apps Script serialise les executions d'un meme
   utilisateur : 1 sonde en 2026, 5 en 2030, 10 en 2035).
   Un seul appel repond desormais pour les deux pages. Pas de controle de role :
   c'est une liste d'annees, et planning.html est la page des MAR. */
function _act_getAnneesDisponibles(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "setActiveYear" ── */
function _act_setActiveYear(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "initYear" ── */
function _act_initYear(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "archiveYear" ── */
function _act_archiveYear(R) {
  const { e, payload, action, code, user } = R;
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

