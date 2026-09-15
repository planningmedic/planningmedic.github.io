/* ═══════════════════════════════════════════════════════════════════════
   EQUIPE — Équipe : médecins, codes d'accès, mails, tuiles privées, connexions, effectif
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_EQUIPE = '2026-09-15.1';

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
