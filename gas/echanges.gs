/* ═══════════════════════════════════════════════════════════════════════
   echanges.gs — Échanges et dons de gardes entre MAR (phase 3)
   ═══════════════════════════════════════════════════════════════════════

   CIRCUIT (décisions arrêtées les 11-12/08/2026, ROADMAP « Priorité 2 ter ») :
   MAR ↔ MAR, AUCUNE validation du comité. Un MAR propose (don à un collègue
   nommé, ou échange de deux gardes datées), l'autre reçoit une notification,
   accepte ou refuse. S'il accepte, le planning s'écrit par applyModification
   (Indispos.gs) — le chemin d'écriture existant, avec TOUS ses garde-fous.

   RÈGLES DE CE FICHIER :
   - Les contrôles sont joués DEUX fois : à la CRÉATION (dryRun — un refus
     est immédiat, jamais 48 h plus tard) et à l'ACCEPTATION (pour de vrai —
     le planning a pu bouger entre-temps). JAMAIS de contrôle dupliqué ici :
     c'est applyModification qui juge, dans les deux cas.
   - Le demandeur est TOUJOURS user.id (résolu par checkCode), jamais lu du
     payload : personne ne crée une demande au nom d'un autre.
   - Lecture des écrans : JAMAIS le GAS, toujours le miroir (clé `echanges`,
     poussée à chaque écriture + filet horaire).
   - Une notification qui rate ne fait JAMAIS échouer le geste (notifierPush_
     avale tout).
   - Samedi qui change de mains : transfert du R de CE samedi, retrouvé dans
     LIENS_R_{année} (générateur 2026-08-13.1+). Jamais de création d'un R
     neuf. Si le transfert est impossible (pas de lien — année 2026 —, R déjà
     pris, receveur indisponible), l'échange aboutit QUAND MÊME et le comité
     est notifié pour replacer à la main.
   - Échange samedi ↔ samedi : aucun R ne bouge (décision du 12/08 — le
     compte de samedis de chacun ne change pas). Les lignes LIENS_R gardent
     alors leur tenant d'origine : accepté par conception.

   ÉTATS D'UNE DEMANDE : attente → acceptee | refusee | expiree | impossible.
   `impossible` (ajout du 13/08) : l'acceptation a rejoué les contrôles et le
   planning ne permet plus le geste (il a bougé depuis la création). Les deux
   MAR sont prévenus ; la grille reste INTACTE.

   EXPIRATION : 48 h sans réponse → expirée, demandeur notifié. Rappel
   UNIQUE au receveur à 24 h. Déclencheur horaire à installer UNE fois
   depuis l'éditeur : installerDeclencheurEchanges().
   ═══════════════════════════════════════════════════════════════════════ */

const GAS_VERSION_ECHANGES = '2026-08-27.1';

const ECHANGES_ONGLET = 'ECHANGES';
const ECHANGES_ENTETE = ['ID', 'CREE_LE', 'TYPE', 'ANNEE', 'DATE', 'DATE2',
  'DEMANDEUR', 'RECEVEUR', 'ETAT', 'REPONDU_LE', 'RAPPEL_LE', 'INFO'];
const ECHANGES_EXPIRATION_H = 48;
const ECHANGES_RAPPEL_H = 24;

/* ── LES DATES FACE À GOOGLE SHEETS (14/08/2026 — défaut trouvé au premier
   test réel) ──────────────────────────────────────────────────────────
   Sheets transforme d'office un texte « 2027-09-03 » en VRAIE date. À la
   relecture : un objet Date, qui s'affiche « Fri Sep 03 2027 00:00:00
   GMT+0200… » et que getDateIndex ne reconnaît pas — l'acceptation partait
   en `impossible`. Double blindage : (1) TOUTE lecture normalise (répare
   aussi les lignes déjà écrites), (2) toute écriture passe la plage en
   format texte d'abord. Même défaut, même remède pour LIENS_R (générateur
   + _transfererR_). La doublure du banc coerce désormais comme le vrai. */
function _echangesTz_() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); }
  catch (e) { return 'Europe/Paris'; }
}
/* Date calendaire → toujours 'AAAA-MM-JJ' (fuseau du classeur). */
function _echangesTexteDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, _echangesTz_(), 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim();
}
/* Horodatage → toujours l'instant ISO (absolu, fuseau indifférent). */
function _echangesTexteInstant_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v == null ? '' : v).trim();
}
/* Pour les yeux : '2027-09-03' → '03/09/2027' (notifications, motifs). */
function _echangesJoli_(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(d);
}

/* ── L'INTERRUPTEUR (13/08/2026 — décision Arthur) ─────────────────────
   Tout est déployé et éprouvé AVANT le staff, mais reste INVISIBLE pour
   les 23 jusqu'à la mise en service. Deux propriétés de script :
   - ECHANGES_OUVERTS ('O' = ouvert à tous) — position de l'interrupteur ;
   - ECHANGES_PILOTES ('ID1,ID2') — identifiants autorisés AVANT l'ouverture
     (le test réel à deux). AUCUN nom dans le dépôt : les identifiants
     vivent dans les propriétés du script, côté serveur.
   Le rôle admin passe toujours. L'état est répliqué au KV (clé
   notif_config, illisible par /read) pour que le Worker applique les MÊMES
   règles à l'abonnement aux notifications et à la lecture de `echanges`.

   MISE EN SERVICE (depuis l'éditeur Apps Script) : ouvrirEchanges().
   Retour arrière : fermerEchanges(). Après modification manuelle de
   ECHANGES_PILOTES : synchroniserEtatEchanges(). Aucun redéploiement,
   ni Worker ni GAS : effet dans la minute. */
function _echangesEtat_() {
  const props = PropertiesService.getScriptProperties();
  const pilotes = String(props.getProperty('ECHANGES_PILOTES') || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  return { ouvert: props.getProperty('ECHANGES_OUVERTS') === 'O', pilotes: pilotes };
}

function _echangesAutorise_(user) {
  if (user && user.role === 'admin') return true;
  const etat = _echangesEtat_();
  if (etat.ouvert) return true;
  return etat.pilotes.indexOf(String(user && user.id || '').toUpperCase()) > -1;
}

function ouvrirEchanges() {
  PropertiesService.getScriptProperties().setProperty('ECHANGES_OUVERTS', 'O');
  const r = synchroniserEtatEchanges();
  Logger.log('Échanges OUVERTS à tous. Sync KV : ' + JSON.stringify(r));
  return r;
}

function fermerEchanges() {
  PropertiesService.getScriptProperties().deleteProperty('ECHANGES_OUVERTS');
  const r = synchroniserEtatEchanges();
  Logger.log('Échanges FERMÉS (admin + pilotes seuls). Sync KV : ' + JSON.stringify(r));
  return r;
}

/* Réplique l'état vers le KV. La clé notif_config n'est PAS dans les clés
   lisibles par /read : le Worker seul la consulte, personne ne la lit. */
function synchroniserEtatEchanges() {
  const jeton = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
  if (!jeton) return { success: false, error: 'MIROIR_PUSH_TOKEN absent' };
  return _miroirEnvoyerLot_({ notif_config: JSON.stringify(_echangesEtat_()) }, jeton);
}

/* ── Onglet ─────────────────────────────────────────────────────────── */
function _echangesFeuille_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ECHANGES_ONGLET);
  if (!sh) {
    sh = ss.insertSheet(ECHANGES_ONGLET);
    sh.getRange(1, 1, 1, ECHANGES_ENTETE.length).setValues([ECHANGES_ENTETE]).setFontWeight('bold');
    // Tout l'onglet en TEXTE : Sheets ne transformera jamais nos dates.
    try { sh.getRange(1, 1, sh.getMaxRows(), ECHANGES_ENTETE.length).setNumberFormat('@'); } catch (e) {}
  }
  return sh;
}

function _echangesLignes_() {
  /* LECTURE SEULE : un onglet absent = zéro demande, jamais une création.
     La synchro horaire du miroir passe par ici — un chemin de lecture qui
     écrirait dans le classeur créerait l'onglet au premier passage, avant
     même le premier usage. Seule creerEchange crée l'onglet. */
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ECHANGES_ONGLET);
  if (!sh) return { sh: null, lignes: [] };
  const data = sh.getDataRange().getValues();
  const lignes = [];
  const DATES = { DATE: 1, DATE2: 1 }, INSTANTS = { CREE_LE: 1, REPONDU_LE: 1, RAPPEL_LE: 1 };
  for (let r = 1; r < data.length; r++) {
    if (!String(data[r][0]).trim()) continue;
    const o = {};
    ECHANGES_ENTETE.forEach((h, i) => {
      o[h] = DATES[h] ? _echangesTexteDate_(data[r][i])
           : INSTANTS[h] ? _echangesTexteInstant_(data[r][i])
           : data[r][i];
    });
    o._row = r + 1;
    lignes.push(o);
  }
  return { sh: sh, lignes: lignes };
}

function _echangesMaintenant_() { return new Date().toISOString(); }

/* (14/08/2026) Un humain lit ces messages : « Dr Durand », pas « DURAND ».
   MÊME règle que l'écran (dashboard.html, _meName) — dont le cas particulier
   PRUNET, qui est Pr et non Dr. Mise en forme d'AFFICHAGE seule : les noms
   stockés dans l'onglet ne changent pas, les correspondances non plus. */
function _echangesDr_(id) {
  const brut = String(id == null ? '' : id).trim();
  if (!brut) return '';
  const titre = brut.toUpperCase() === 'PRUNET' ? 'Pr ' : 'Dr ';
  return titre + brut.charAt(0).toUpperCase() + brut.slice(1).toLowerCase();
}

function _echangesEstSamedi_(date) {
  return new Date(date + 'T12:00:00').getDay() === 6;
}

/* Le mod applyModification correspondant à une demande. Une seule table de
   correspondance : la création (dryRun) et l'acceptation jouent LE MÊME mod. */
function _echangesVersMod_(d) {
  if (d.TYPE === 'don') {
    return { type: 'donGarde', year: Number(d.ANNEE), date: d.DATE,
             doctorId: d.DEMANDEUR, doctorId2: d.RECEVEUR };
  }
  if (d.TYPE === 'echange') {
    return { type: 'echangeGardeJours', year: Number(d.ANNEE),
             date: d.DATE, date2: d.DATE2,
             doctorId: d.DEMANDEUR, doctorId2: d.RECEVEUR };
  }
  throw new Error('Type de demande inconnu : ' + d.TYPE);
}

/* ── 1. CRÉER ───────────────────────────────────────────────────────────
   p = { type:'don'|'echange', year, date, date2?, receveur }
   Le demandeur est user.id, point. Les contrôles d'applyModification sont
   joués en dryRun : un refus est renvoyé TOUT DE SUITE, rien n'est écrit. */
function creerEchange(user, p) {
  const type = String(p.type || '').trim();
  const year = Number(p.year) || TEST_YEAR;
  const date = String(p.date || '').trim();
  const date2 = String(p.date2 || '').trim();
  const receveur = String(p.receveur || '').trim();

  if (type !== 'don' && type !== 'echange') throw new Error('Type de demande inconnu');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide');
  if (type === 'echange' && !/^\d{4}-\d{2}-\d{2}$/.test(date2)) throw new Error('Seconde date invalide');
  if (!receveur) throw new Error('Destinataire absent');
  if (receveur === user.id) throw new Error('On ne se propose pas une garde à soi-même');
  /* Circuit fermé (avant ouvrirEchanges) : le RECEVEUR aussi doit être
     autorisé — sinon il recevrait une notification pour un écran qu'il ne
     voit pas. Après ouverture, ce contrôle laisse tout passer. */
  if (!_echangesAutorise_({ id: receveur, role: 'mar' })) {
    throw new Error('Les échanges ne sont pas encore ouverts à ' + receveur);
  }

  const demande = { TYPE: type, ANNEE: year, DATE: date, DATE2: type === 'echange' ? date2 : '',
                    DEMANDEUR: user.id, RECEVEUR: receveur };
  // Contrôles joués DÈS LA CRÉATION (décision du 11/08) : mêmes juges que
  // l'écriture réelle, aucune duplication. Lève en cas de refus.
  applyModification(Object.assign({ dryRun: true }, _echangesVersMod_(demande)));

  const id = 'E' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const sh = _echangesFeuille_();
  const ligne = sh.getLastRow() + 1;
  const plage = sh.getRange(ligne, 1, 1, ECHANGES_ENTETE.length);
  try { plage.setNumberFormat('@'); } catch (e) {}   // ceinture : l'onglet hérité d'avant le correctif n'est pas en texte
  plage.setValues([[id, _echangesMaintenant_(), type, year, date, demande.DATE2,
                    user.id, receveur, 'attente', '', '', '']]);
  logAction('creerEchange ' + id + ' — ' + type + ' ' + date + (demande.DATE2 ? '/' + demande.DATE2 : '')
    + ' | ' + user.id + ' -> ' + receveur);

  _echangesVersKV_();
  notifierPush_(
    type === 'don' ? 'Proposition de garde' : 'Proposition d\'échange',
    type === 'don'
      ? _echangesDr_(user.id) + ' vous propose sa garde du ' + _echangesJoli_(date) + '.'
      : _echangesDr_(user.id) + ' vous propose sa garde du ' + _echangesJoli_(date) + ' contre la vôtre du ' + _echangesJoli_(demande.DATE2) + '.',
    './dashboard.html', { id: receveur, pastille: _echangesEnAttentePour_(receveur) });
  return { id: id };
}

/* ── 2. RÉPONDRE ────────────────────────────────────────────────────────
   p = { id, reponse:'accepter'|'refuser' } — seul le RECEVEUR répond. */
function repondreEchange(user, p) {
  const id = String(p.id || '').trim();
  const reponse = String(p.reponse || '').trim();
  if (reponse !== 'accepter' && reponse !== 'refuser') throw new Error('Réponse inconnue');

  const { sh, lignes } = _echangesLignes_();
  const d = lignes.find(l => String(l.ID) === id);
  if (!d) throw new Error('Demande introuvable');
  if (String(d.RECEVEUR) !== user.id) throw new Error('Seul le destinataire peut répondre à cette demande');
  if (String(d.ETAT) !== 'attente') throw new Error('Demande déjà ' + d.ETAT + ' — plus rien à répondre');

  const colEtat = ECHANGES_ENTETE.indexOf('ETAT') + 1;
  const colRep  = ECHANGES_ENTETE.indexOf('REPONDU_LE') + 1;
  const colInfo = ECHANGES_ENTETE.indexOf('INFO') + 1;

  if (reponse === 'refuser') {
    sh.getRange(d._row, colEtat).setValue('refusee');
    sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
    logAction('repondreEchange ' + id + ' — refusée par ' + user.id);
    _echangesVersKV_();
    notifierPush_('Proposition déclinée',
      _echangesDr_(d.RECEVEUR) + ' a décliné votre proposition du ' + _echangesJoli_(d.DATE) + '.',
      './dashboard.html', { id: String(d.DEMANDEUR) });
    return { etat: 'refusee' };
  }

  // ACCEPTER : rejouer TOUS les contrôles, pour de vrai cette fois.
  // Le planning a pu bouger depuis la création : un refus ici ne casse
  // rien — état `impossible`, grille intacte, les deux MAR prévenus.
  try {
    applyModification(_echangesVersMod_(d));
  } catch (err) {
    sh.getRange(d._row, colEtat).setValue('impossible');
    sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
    sh.getRange(d._row, colInfo).setValue(String(err.message).slice(0, 200));
    logAction('repondreEchange ' + id + ' — IMPOSSIBLE : ' + err.message);
    _echangesVersKV_();
    const corps = 'Le planning a changé depuis la proposition du ' + _echangesJoli_(d.DATE) + ' : ' + err.message;
    notifierPush_('Échange impossible', corps, './dashboard.html', { id: String(d.DEMANDEUR) });
    notifierPush_('Échange impossible', corps, './dashboard.html', { id: String(d.RECEVEUR) });
    return { etat: 'impossible', error: String(err.message) };
  }

  // Samedi qui change de mains → transfert du R de CE samedi.
  // Don : la garde du DATE passe au receveur. Échange : chaque samedi
  // échangé suit la règle « exactement un des deux jours est un samedi ».
  const rInfos = [];
  const y = Number(d.ANNEE);
  if (d.TYPE === 'don' && _echangesEstSamedi_(d.DATE)) {
    rInfos.push(_transfererR_(y, d.DATE, String(d.DEMANDEUR), String(d.RECEVEUR)));
  } else if (d.TYPE === 'echange') {
    const s1 = _echangesEstSamedi_(d.DATE), s2 = _echangesEstSamedi_(d.DATE2);
    if (s1 !== s2) { // exactement UN samedi change de mains
      if (s1) rInfos.push(_transfererR_(y, d.DATE, String(d.DEMANDEUR), String(d.RECEVEUR)));
      else    rInfos.push(_transfererR_(y, d.DATE2, String(d.RECEVEUR), String(d.DEMANDEUR)));
    }
    // samedi ↔ samedi : aucun R ne bouge (décision du 12/08).
  }

  sh.getRange(d._row, colEtat).setValue('acceptee');
  sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
  if (rInfos.length) sh.getRange(d._row, colInfo).setValue(rInfos.map(r => r.resume).join(' · ').slice(0, 200));
  logAction('repondreEchange ' + id + ' — acceptée' + (rInfos.length ? ' | ' + rInfos.map(r => r.resume).join(' · ') : ''));
  _echangesVersKV_();

  let corps = (d.TYPE === 'don')
    ? 'La garde du ' + _echangesJoli_(d.DATE) + ' passe du ' + _echangesDr_(d.DEMANDEUR) + ' au ' + _echangesDr_(d.RECEVEUR) + '.'
    : 'Gardes échangées : le ' + _echangesDr_(d.DEMANDEUR) + ' prend le ' + _echangesJoli_(d.DATE2) + ', le ' + _echangesDr_(d.RECEVEUR) + ' prend le ' + _echangesJoli_(d.DATE) + '.';
  rInfos.forEach(r => { if (r.fait) corps += ' La récupération du ' + _echangesJoli_(r.dateR) + ' est transférée.'; });
  notifierPush_('Échange confirmé', corps, './dashboard.html', { id: String(d.DEMANDEUR) });
  notifierPush_('Échange confirmé', corps, './dashboard.html', { id: String(d.RECEVEUR) });

  // R non transférable : le comité replace à la main (seul cas où il entre en scène).
  rInfos.forEach(r => { if (!r.fait) _echangesAlerterComite_(r); });
  return { etat: 'acceptee', r: rInfos };
}

/* ── Alerte du comité : E-MAIL, jamais push ─────────────────────────────
   (14/08/2026) Le push est le canal du MAR : il ne vit que dans l'app
   installée, c'est-à-dire le portail personnel. Un membre du comité n'ouvre
   pas ce portail en tant que comité — il ouvre l'écran d'administration,
   exprès. Une alerte comité doit donc arriver là où le comité regarde : sa
   boîte mail. MÊME adresse et MÊME source que le diagnostic du lundi
   (DIAG_EMAIL dans l'onglet CONFIG), et MÊME mode d'essai que les mails de
   planning (NOTIF_EMAIL_TEST détourne tout tant qu'il existe).
   Aucune notification du circuit ne cible plus le rôle admin.
   Échec d'envoi = échange VALIDE quand même : la mention « R non transféré »
   reste écrite dans la demande, l'onglet fait foi. */
function _echangesAlerterComite_(r) {
  /* (23/08/2026) LE MAIL EST RETIRÉ — un seul canal, décision d'Arthur.
     Il partait vers DIAG_EMAIL : muet si l'adresse manquait dans CONFIG, et
     incapable de dire s'il avait été traité. L'alerte vit désormais dans
     l'onglet Statuts, là où le geste se fait, avec une pastille sur l'onglet.
     Elle se CALCULE (écart entre samedis tenus et récups posées) : elle
     disparaît d'elle-même quand le R est posé, et revient si on l'efface.
     La trace, elle, reste — LOGS dit la vérité même quand l'écran est fermé. */
  try {
    logAction('récup à replacer — samedi ' + r.samedi + ' transféré de ' + r.donneur
              + ' à ' + r.receveur + (r.dateR ? ', R du ' + r.dateR : '')
              + ' — ' + r.motif + ' (alerte visible dans l\'onglet Statuts)');
  } catch (e) {}
}

/* ── Transfert du R d'un samedi ─────────────────────────────────────────
   Retrouve dans LIENS_R_{année} le R posé pour (samedi, donneur), vérifie
   qu'il est encore transférable, et le déplace vers le receveur. JAMAIS de
   création d'un R neuf — les sept contraintes de pose vivent dans le
   générateur et n'y sont pas dupliquées. Tout échec → l'échange reste
   valide, le comité replacera (motif renvoyé à l'appelant). */
function _transfererR_(year, samedi, donneur, receveur) {
  const base = { samedi: samedi, donneur: donneur, receveur: receveur, fait: false };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('LIENS_R_' + year);
  if (!sh) return Object.assign(base, { motif: 'aucune correspondance samedi→R pour ' + year + ' (année d\'avant le lien)', resume: 'R non transféré (pas de lien ' + year + ')' });

  const data = sh.getDataRange().getValues();
  let row = -1, dateR = '';
  for (let r = 1; r < data.length; r++) {
    // Blindage Sheets : les cellules peuvent être de VRAIES dates (coercition
    // à l'écriture) — on compare toujours des textes 'AAAA-MM-JJ'.
    if (_echangesTexteDate_(data[r][0]) === samedi && String(data[r][1]).trim() === donneur) {
      row = r + 1; dateR = _echangesTexteDate_(data[r][2]); break;
    }
  }
  if (row < 0) return Object.assign(base, { motif: 'lien introuvable pour ce samedi et ce MAR', resume: 'R non transféré (lien introuvable)' });

  const aujourd = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  if (dateR <= aujourd) return Object.assign(base, { dateR: dateR, motif: 'le R du ' + dateR + ' est déjà passé ou en cours', resume: 'R non transféré (déjà pris le ' + dateR + ')' });

  // Le déplacement lui-même passe par le même chemin cellule à cellule
  // qu'applyModification : lecture, contrôles, écriture.
  try {
    applyModification({ type: 'transfertR', year: year, date: dateR, doctorId: donneur, doctorId2: receveur });
  } catch (err) {
    return Object.assign(base, { dateR: dateR, motif: String(err.message), resume: 'R non transféré (' + String(err.message).slice(0, 80) + ')' });
  }
  sh.getRange(row, 2).setValue(receveur); // le lien suit : MEDECIN = receveur
  return Object.assign(base, { fait: true, dateR: dateR, resume: 'R du ' + dateR + ' transféré' });
}

/* ── 3. EXPIRER (déclencheur horaire) ──────────────────────────────────
   attente > 48 h → expirée, demandeur notifié.
   attente > 24 h sans rappel → rappel UNIQUE au receveur. */
function expirerEchanges() {
  try { if (typeof _bat_ === 'function') _bat_('expirerEchanges'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
  const { sh, lignes } = _echangesLignes_();
  const maintenant = Date.now();
  const colEtat = ECHANGES_ENTETE.indexOf('ETAT') + 1;
  const colRep  = ECHANGES_ENTETE.indexOf('REPONDU_LE') + 1;
  const colRap  = ECHANGES_ENTETE.indexOf('RAPPEL_LE') + 1;
  let changements = 0;

  lignes.forEach(d => {
    if (String(d.ETAT) !== 'attente') return;
    const age = maintenant - new Date(String(d.CREE_LE)).getTime();
    if (!(age > 0)) return; // horodatage illisible : ne rien décider
    if (age > ECHANGES_EXPIRATION_H * 3600 * 1000) {
      sh.getRange(d._row, colEtat).setValue('expiree');
      sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
      changements++;
      logAction('expirerEchanges ' + d.ID + ' — expirée (48 h sans réponse)');
      notifierPush_('Proposition expirée',
        'Votre proposition du ' + _echangesJoli_(d.DATE) + ' au ' + _echangesDr_(d.RECEVEUR) + ' est restée 48 h sans réponse.',
        './dashboard.html', { id: String(d.DEMANDEUR) });
    } else if (age > ECHANGES_RAPPEL_H * 3600 * 1000 && !String(d.RAPPEL_LE).trim()) {
      sh.getRange(d._row, colRap).setValue(_echangesMaintenant_());
      changements++;
      logAction('expirerEchanges ' + d.ID + ' — rappel 24 h');
      notifierPush_('Proposition en attente',
        _echangesDr_(d.DEMANDEUR) + ' attend votre réponse pour la garde du ' + _echangesJoli_(d.DATE) + ' (expire dans 24 h).',
        './dashboard.html', { id: String(d.RECEVEUR), pastille: _echangesEnAttentePour_(String(d.RECEVEUR)) });
    }
  });
  if (changements) _echangesVersKV_();
  return { changements: changements };
}

/* Installe le déclencheur horaire (idempotent — même règle que le miroir :
   on supprime d'abord les déclencheurs existants pour ne jamais empiler).
   À lancer UNE fois depuis l'éditeur Apps Script. */
function installerDeclencheurEchanges() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'expirerEchanges') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('expirerEchanges').timeBased().everyHours(1).create();
  Logger.log('Déclencheur expirerEchanges installé (horaire)');
}

/* ── 4. LECTURE (pour le miroir UNIQUEMENT) ────────────────────────────
   Enveloppe {success:true,…} stockée telle quelle au KV (clé `echanges`),
   même contrat que les tuiles. Les écrans ne lisent JAMAIS le GAS. */
function getEchangesEnveloppe() {
  const { lignes } = _echangesLignes_();
  return { success: true, echanges: lignes.map(d => ({
    id: String(d.ID), creeLe: String(d.CREE_LE), type: String(d.TYPE),
    annee: Number(d.ANNEE), date: String(d.DATE), date2: String(d.DATE2),
    demandeur: String(d.DEMANDEUR), receveur: String(d.RECEVEUR),
    etat: String(d.ETAT), reponduLe: String(d.REPONDU_LE),
    info: String(d.INFO),
  })) };
}

/* Combien de demandes attendent la réponse de CE MAR — la pastille de
   l'icône (posée par le téléphone à l'arrivée de la notification). */
function _echangesEnAttentePour_(id) {
  return _echangesLignes_().lignes.filter(function (d) {
    return String(d.ETAT) === 'attente' && String(d.RECEVEUR) === id;
  }).length;
}

/* Poussée immédiate vers le KV — non bloquante, le filet horaire rattrape. */
function _echangesVersKV_() {
  try {
    const jeton = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
    if (!jeton) return;
    /* (14/08/2026 — vu en test réel) Sans flush, la relecture qui bâtit
       l'enveloppe peut être servie d'AVANT les écritures de la même
       exécution : on poussait « attente » au relais alors que le classeur
       finissait bien en « acceptee ». Les écritures d'abord, l'enveloppe
       ensuite. */
    SpreadsheetApp.flush();
    _miroirEnvoyerLot_({ echanges: JSON.stringify(getEchangesEnveloppe()) }, jeton);
  } catch (e) { try { Logger.log('_echangesVersKV_ : ' + e.message); } catch (_) {} }
}
