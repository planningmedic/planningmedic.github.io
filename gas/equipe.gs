/* ═══════════════════════════════════════════════════════════════════════
   EQUIPE — Équipe : médecins, codes d'accès, mails, tuiles privées, connexions, effectif
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_EQUIPE = '2026-09-15.2';

// ── Sonde : les interrupteurs des mails sont-ils cohérents ? ──
function _sondeInterrupteursMails_(check, R, info) {
  try {
    const P = PropertiesService.getScriptProperties();
    const actif = String(P.getProperty('NOTIF_ACTIVE') || '').trim().toUpperCase() === 'O';
    const test  = !!(P.getProperty('NOTIF_EMAIL_TEST') || '').trim();
    if (actif && test) {
      check('Mails ALLUMÉS avec la redirection d\'essai encore posée : tous les messages de changements partent vers l\'adresse de test, les MARs ne reçoivent RIEN — en silence', R.ERR);
      check('   → LE GESTE : Apps Script → Paramètres du projet → Propriétés → supprimer NOTIF_EMAIL_TEST (ou repasser NOTIF_ACTIVE à N si c\'était voulu).', R.OK);
    } else if (actif) check('Mails de changements allumés, redirection absente — les MARs reçoivent leurs messages', R.OK);
    else info('Mails de changements éteints (NOTIF_ACTIVE ≠ O)' + (test ? ' · redirection d\'essai posée' : '') + ' — le notifieur photographie et se tait');
  } catch (e) { check('Interrupteurs des mails illisibles : ' + e.message, R.WARN); }
}

function logConnexion(user) {
  try {
    if (!user) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('CONNEXIONS');
    if (!sheet) {
      sheet = ss.insertSheet('CONNEXIONS');
      sheet.getRange(1, 1, 1, 4).setValues([['HORODATAGE','NOM','INITIALES','ROLE']]);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 200);
    }
    const maintenant = new Date();
    sheet.appendRow([maintenant, user.name || '', user.initials || '', user.role || '']);

    /* Compteurs qui NE dépendent pas des lignes brutes : ils sont incrémentés
       ici, une fois, et ne sont jamais recalculés. */
    try { _statsHeureIncr_(ss, maintenant); } catch (e) {}
    try { _statsDerniereConnexion_(ss, user, maintenant); } catch (e) {}
    /* Ouvertures par rôle : alimente la carte « qui se connecte ». */
    try { _statsActionIncr_(ss, user.role, '(ouverture)', maintenant); } catch (e) {}

    /* Purge — MAIS jamais avant d'avoir figé les semaines concernées.
       L'ordre compte : figer PUIS supprimer. L'inverse perd la semaine. */
    if (sheet.getLastRow() > CONNEXIONS_PLAFOND + 1) {
      try { statsRecalculer(); } catch (e) { return; }   // rien n'est supprimé si le figeage échoue
      sheet.deleteRows(2, sheet.getLastRow() - (CONNEXIONS_PLAFOND + 1));
    }
  } catch(e) {
    Logger.log('logConnexion error: ' + e.message);
  }
}

// ── GÉNÉRATION CODE ACCÈS ─────────────────────────────────────────────
/* PERDUE le 29/08/2026 (commit 2c01cb49, « compteurs d'usage ») : le bloc a été
   écrasé en même temps que la fin de logConnexion. Seul appelant : resetCodeMar,
   qui tombait donc en « generateCode is not defined » sans rien écrire.
   L'alphabet exclut I, O, 0 et 1 (confusions à la dictée). */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── GARDE-FOU QUOTA D'ENVOI ───────────────────────────────────────────
// Le compte Google est un compte GRATUIT : 100 emails/jour, pas 1500.
// Avec ~23 MAR, un envoi groupé consomme un quart du quota ; trois envois dans
// la même journée (codes + récap congés + récap gardes) frôlent la limite.
// Sans contrôle, MailApp échoue EN COURS d'envoi : la moitié des MAR reçoit son
// mail, l'autre non, et rien ne dit où ça s'est arrêté. On refuse donc AVANT
// d'envoyer quoi que ce soit, plutôt que de laisser un envoi à moitié fait.
function _marsAvecEmail_() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
    if (!sheet) return 0;
    const data = _medecinsRows_();
    let n = 0;
    for (let r = 1; r < data.length; r++) {
      if (!String(data[r][COL_MED.ID]).trim()) continue;                          // ligne vide
      if (String(data[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;     // inactif
      if (!String(data[r][COL_MED.EMAIL]).trim()) continue;                          // sans email
      n++;
    }
    return n;
  } catch (e) { return 0; }
}

// Renvoie un message d'erreur si le quota ne suffit pas, sinon null.
// Quota illisible (API indisponible) → on N'EMPÊCHE PAS l'envoi : mieux vaut
// tenter que bloquer le comité sur une lecture qui a échoué.
function _quotaEmailInsuffisant_(besoin) {
  if (!besoin) return null;
  try {
    const reste = MailApp.getRemainingDailyQuota();
    if (reste >= besoin) return null;
    logAction(`Envoi REFUSÉ — besoin ${besoin} emails, quota restant ${reste}`);
    return `Envoi annulé : ${besoin} email(s) à envoyer, il n'en reste que ${reste} aujourd'hui `
         + `(compte Google gratuit, 100/jour). Le quota se réinitialise chaque nuit — réessayez demain. `
         + `AUCUN email n'a été envoyé.`;
  } catch (e) { return null; }
}

// ── MODÈLE UNIQUE DES EMAILS DE CODE D'ACCÈS ──────────────────────────
// SOURCE UNIQUE pour les trois envois (sendCodes, sendCodesMar, resetCodeMar).
// Avant (07/2026) le texte était dupliqué à l'identique dans sendCodes et
// sendCodesMar : la correction d'année n'avait été appliquée qu'à un seul
// endroit. Toute évolution du message se fait DÉSORMAIS ICI, et nulle part ailleurs.
//
// Année : getIndisposYear() (= INDISPOS_ACTIVE, l'année RÉELLEMENT ouverte à la
// saisie), et non TEST_YEAR/getActiveYear qui est l'année du planning en cours.
// Les deux diffèrent pendant le Wizard 1 (octobre) — exactement quand ces emails
// partent en masse.
//   renouvele = true  → formulation « nouveau code, l'ancien ne marche plus »
function _mailCodeAcces_(nom, code, renouvele) {
  const ouvert = _indisposOuverte_();          // campagne en cours ?
  const an     = getIndisposYear();
  const base   = 'https://planningmedic.github.io/';
  const portail  = base + 'index.html';
  const saisie   = base + 'indispos.html';
  const esc = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nomE = esc(nom), codeE = esc(code);

  const titre = renouvele ? "Votre nouveau code d'accès" : "Votre code d'accès";
  const introHtml = renouvele
    ? "Votre code d'accès personnel a été renouvelé. <strong>Le précédent n'est plus valable.</strong>"
    : "Voici votre code d'accès personnel au portail du service.";
  const introText = renouvele
    ? "Votre code d'accès personnel a été renouvelé. Le précédent n'est plus valable."
    : "Voici votre code d'accès personnel au portail du service.";

  // Appel à l'action : pendant la campagne la saisie prime, sinon le portail.
  const btn = (href, txt) =>
    '<a href="' + href + '" style="display:inline-block;background:#15803d;color:#ffffff;'
    + 'text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px">'
    + txt + ' &rarr;</a>';

  const corpsHtml = ouvert
    ? '<p style="margin:0 0 14px;font-size:13px;color:#3a4759">Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.</p>'
      + '<div style="background:#fff8e6;border:1px solid #f3e0b0;border-radius:10px;padding:13px 16px;margin-bottom:16px">'
        + '<div style="font-size:13px;font-weight:700;color:#8a5a00;margin-bottom:4px">Saisie des indisponibilités ' + an + ' ouverte</div>'
        + '<div style="font-size:12.5px;color:#6b5320">C\'est le moment de déclarer vos souhaits et vos congés.</div>'
      + '</div>'
      + btn(saisie, 'Saisir mes indisponibilités')
      + '<p style="margin:16px 0 0;font-size:12.5px;color:#697789">Portail du service : <a href="' + portail + '" style="color:#1d4ed8">' + portail + '</a></p>'
    : '<p style="margin:0 0 16px;font-size:13px;color:#3a4759">Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.</p>'
      + btn(portail, 'Ouvrir le portail');

  const html =
    '<div style="background:#f4f6f9;padding:0;margin:0">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 14px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="background:#ffffff;border:1px solid #e3e8ef;border-radius:14px;overflow:hidden">' +
        '<div style="background:#ce1126;padding:18px 22px">' +
          '<div style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Planning-Med &middot; Anesthésie-Réanimation</div>' +
          '<div style="color:#ffffff;font-size:19px;font-weight:700;margin-top:4px">' + titre + '</div>' +
        '</div>' +
        '<div style="padding:22px">' +
          '<p style="margin:0 0 16px;font-size:14px;color:#3a4759">Bonjour <strong>' + nomE + '</strong>,</p>' +
          '<p style="margin:0 0 16px;font-size:13px;color:#3a4759">' + introHtml + '</p>' +
          '<div style="background:#f4f6f9;border:1px solid #e3e8ef;border-radius:10px;padding:12px 16px;margin-bottom:18px">' +
            '<div style="font-size:11px;color:#697789;text-transform:uppercase;letter-spacing:.5px">Votre code d\'accès</div>' +
            '<div style="font-size:22px;font-weight:700;letter-spacing:2px;color:#ce1126;font-family:monospace">' + codeE + '</div>' +
          '</div>' +
          corpsHtml +
          '<p style="margin:18px 0 0;font-size:12px;color:#9aa4b2">Conservez ce code confidentiel. En cas de difficulté, contactez le comité planning.</p>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-top:14px">Le Comité Planning-Med</div>' +
    '</div>' +
    '</div>';

  const corpsText = ouvert
    ? 'Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.\n\n'
      + 'SAISIE DES INDISPONIBILITÉS ' + an + ' OUVERTE\n'
      + 'C\'est le moment de déclarer vos souhaits et vos congés :\n' + saisie + '\n\n'
      + 'Portail du service : ' + portail + '\n'
    : 'Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.\n\n'
      + portail + '\n';

  const body =
    'Bonjour ' + nom + ',\n\n' + introText + '\n\n' +
    '    ' + code + '\n\n' + corpsText +
    '\nConservez ce code confidentiel.\n\nBonne journée,\nLe Comité Planning-Med';

  return {
    subject: '[Planning-Med] ' + titre,
    htmlBody: html,
    body: body,
    name: 'Comité Planning-Med',
  };
}

// ── VÉRIFIER CODE ACCÈS ───────────────────────────────────────────────
/* Analyse CONFIG / TUILES_PRIVEES pour UN identifiant.
   « AFR:crh,stats;WS:liberal » + « AFR »  ->  ['crh','stats']
   Cle absente, identifiant non cite, valeur mal formee : tableau vide.
   Le defaut est FERME — une tuile reservee ne s'ouvre jamais par accident.
   Meme format que _tuilesPriveesLire_ (miroir.gs) : une seule ecriture dans
   le classeur sert les deux chemins de lecture. */
function _tuilesPriveesDe_(brut, id) {
  try {
    const cible = String(id == null ? '' : id).trim().toUpperCase();
    if (!cible || !brut) return [];
    let trouve = [];
    String(brut).split(';').forEach(function (bloc) {
      const dp = bloc.indexOf(':');
      if (dp < 1) return;
      if (bloc.slice(0, dp).trim().toUpperCase() !== cible) return;
      trouve = trouve.concat(bloc.slice(dp + 1).split(',')
        .map(function (c) { return c.trim(); }).filter(Boolean));
    });
    return trouve;
  } catch (e) { return []; }   /* jamais bloquant : au pire, aucune tuile */
}

/* Ce MAR a-t-il droit a la tuile `cle` ? Lit CONFIG / TUILES_PRIVEES.
   MEME source que la tuile du dashboard : la porte du serveur et l'icone
   affichee ne peuvent plus diverger. C'est exactement le defaut du 29/08
   (tuile filtree sur l'identite, serveur sur le role) — un seul critere,
   un seul endroit. Le role `admin` n'est PAS traite ici : chaque appelant
   decide s'il l'accepte en plus, comme aujourd'hui. */
function _aDroitTuile_(id, cle) {
  try {
    const cible = String(id == null ? '' : id).trim().toUpperCase();
    if (!cible) return false;
    const rows = _configRows_();
    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][0]).trim() !== 'TUILES_PRIVEES') continue;
      return _tuilesPriveesDe_(rows[r][1], cible).indexOf(String(cle)) > -1;
    }
    return false;
  } catch (e) { return false; }   /* porte fermee par defaut */
}

function _effectifTitresGas_() {
  if (_EFFECTIF_TITRES_MEMO) return _EFFECTIF_TITRES_MEMO;
  const vide = { titresPr: [], souhaitsPlafond: [] };
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
    if (!sh) return vide;
    const data = _medecinsRows_();
    const titresPr = [], souhaitsPlafond = [];
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][COL_MED.ID] == null ? '' : data[i][COL_MED.ID]).trim();
      if (!id) continue;
      if (/^PR\b/i.test(String(data[i][COL_MED.NOM] == null ? '' : data[i][COL_MED.NOM]).trim())) titresPr.push(id);
      if (String(data[i][COL_MED.SOUHAIT_PLAFOND] == null ? '' : data[i][COL_MED.SOUHAIT_PLAFOND]).trim().toUpperCase() === 'O') souhaitsPlafond.push(id);
    }
    _EFFECTIF_TITRES_MEMO = { titresPr: titresPr, souhaitsPlafond: souhaitsPlafond };
    return _EFFECTIF_TITRES_MEMO;
  } catch (e) { return vide; }
}

// ── API WEB APP — doGet ───────────────────────────────────────────────
// ── Builders partagés (handlers unitaires + getAdminBootstrap) ──
function _buildMedecins_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('MEDECINS');
  if (!sheet) return { error: 'Onglet MEDECINS introuvable' };
  const data = _medecinsRows_();
  const isO = v => String(v).trim().toUpperCase() === 'O';
  const toDate = v => {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return String(v).trim();
  };
  const medecins = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][COL_MED.ID]) continue;
    medecins.push({id:String(data[r][COL_MED.ID]).trim(), nom:String(data[r][COL_MED.NOM]).trim(),
      initiales:String(data[r][COL_MED.INITIALES]).trim(), actif:isO(data[r][COL_MED.ACTIF]),
      quotite:Number(data[r][COL_MED.QUOTITE])||100, pctGardes:Number(data[r][COL_MED.PCT_GARDES])||100,
      hasCode:!!String(data[r][COL_MED.CODE]).trim(), email:String(data[r][COL_MED.EMAIL]).trim(), dect:String(data[r][COL_MED.DECT]).trim(),
      dateDebut:toDate(data[r][COL_MED.DATE_DEBUT]), dateFin:toDate(data[r][COL_MED.DATE_FIN]),
      noGarde:isO(data[r][COL_MED.NO_GARDE]), only18:isO(data[r][COL_MED.ONLY_18]), noWeekend:isO(data[r][COL_MED.NO_WEEKEND]),
      rythme2sur2:isO(data[r][COL_MED.RYTHME_2_2]), souhaitPlafond:isO(data[r][COL_MED.SOUHAIT_PLAFOND]),
      tpJoursFixes:String(data[r][COL_MED.TP_JOURS]||'').trim().toUpperCase()});
  }
  return { medecins };
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "viderCacheConfig" ── */
// (B1 sécurité) getStatus / getStatsLive : désormais code-gated (données nominatives)
// Purge manuelle du cache de configuration (bouton de l'onglet Maintenance).
// Utile apres une modification faite A LA MAIN dans le classeur, ou pour
// rendre immediate la revocation d'un code d'acces.
function _act_viderCacheConfig(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  viderCacheConfig();
  return ContentService.createTextOutput(JSON.stringify({
    success: true, message: 'Cache de configuration vidé — la prochaine lecture ira au classeur.'
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getStatus" ── */
function _act_getStatus(R) {
  const { e, payload, action, code, user } = R;
  return ContentService.createTextOutput(JSON.stringify({
    success: true, status: getPlanningStatus()
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "login" ── */
function _act_login(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "creerEchange" ── */
/* (13/08/2026 — échanges, phase 3) Les DEUX verbes du circuit pair-à-pair — récit : docs/JOURNAL-Planning-Med.md §86 */
function _act_creerEchange(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "repondreEchange" ── */
function _act_repondreEchange(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "getAdminBootstrap" ── */
// ── (perf) BOOTSTRAP ADMIN : tout le boot en UN aller-retour ──
// Regroupe planning + affectations + medecins + overrides. Les handlers unitaires
// (getMedecins, getOverrides, getPlanningJson, getAffectationsJson) restent inchangés
// et partagent les mêmes builders → réponse identique champ à champ.
function _act_getAdminBootstrap(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const jy = parseInt(payload.year) || getActiveYear();
  const out = { success: true, year: jy };
  /* (28/07/2026) L'IDENTITE REJOINT LE BOOTSTRAP — récit : docs/JOURNAL-Planning-Med.md §87 */
  out.role = user.role; out.id = user.id;
  out.name = user.name; out.initials = user.initials;
  out.liberal = !!user.liberal;
  out.rpps = user.rpps || '';
  out.prenom = user.prenom || '';
  /* (01/08/2026) CHRONOMETRE INTERNE — récit : docs/JOURNAL-Planning-Med.md §88 */
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
  /* (28/07/2026, 15 h) LE COMPTEUR DE MAILS REJOINT LE BOOTSTRAP — récit : docs/JOURNAL-Planning-Med.md §89 */
  try {
    const _lab = Gmail.Users.Labels.get('me', 'INBOX');
    out.mailNonLus = Number(_lab.messagesUnread || 0);
  } catch (e) { out.mailNonLus = null; }
  _jalon('compteur de mails (Gmail)');
  /* (28/07/2026, 15 h 50) EXISTENCE DE L'ANNEE SUIVANTE, SANS LA TELECHARGER — récit : docs/JOURNAL-Planning-Med.md §90 */
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

/* ── action "getMedecins" ── */
function _act_getMedecins(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const _m = _buildMedecins_();
  if (_m.error) return _error(_m.error);
  return ContentService.createTextOutput(JSON.stringify({success:true, medecins:_m.medecins}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveMedecin" ── */
function _act_saveMedecin(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "saveConfig" ── */
function _act_saveConfig(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "sendCodes" ── */
function _act_sendCodes(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "mailNonLus" ── */
// Compteur de non-lus. Appele APRES l'affichage de l'admin, en tache de fond :
// ne JAMAIS le mettre dans getAdminBootstrap, il ajouterait ~1 s a chaque
// ouverture pour une fonction consultee occasionnellement.
function _act_mailNonLus(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  try {
    const lab = Gmail.Users.Labels.get('me', 'INBOX');
    return ContentService.createTextOutput(JSON.stringify({
      success: true, nonLus: Number(lab.messagesUnread || 0)
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
}

/* ── action "mailListe" ── */
// Liste des messages recus. Charge au clic sur l'enveloppe (~2-4 s).
function _act_mailListe(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "mailMessage" ── */
// Corps d'un message, en TEXTE BRUT uniquement.
// ⚠️ Ne JAMAIS renvoyer le HTML du message : l'injecter dans admin.html
// executerait du contenu venu de l'exterieur dans la page.
function _act_mailMessage(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "addMedecinToGroupe" ── */
function _act_addMedecinToGroupe(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "resetCodeMar" ── */
function _act_resetCodeMar(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "sendCodesMar" ── */
function _act_sendCodesMar(R) {
  const { e, payload, action, code, user } = R;
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
