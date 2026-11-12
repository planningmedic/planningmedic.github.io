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
     LIENS_R_{année} (générateur 2026-08-13.1+). Si le transfert à la même
     date est impossible (R déjà pris, receveur occupé), l'échange aboutit
     QUAND MÊME et, depuis le 11/11/2026, un R neuf est posé au receveur
     (section « LES RÉCUPÉRATIONS SE RÈGLENT TOUTES SEULES », en fin de
     fichier). Année sans lien (2026) : rien d'automatique.
   - Échange samedi ↔ samedi : aucun R ne bouge (décision du 12/08 — le
     compte de samedis de chacun ne change pas). Depuis le 11/11/2026, les
     lignes LIENS_R suivent : chaque R, à SA date, est rattaché au samedi que
     son titulaire tient désormais (_recupsCroiserLiens_). Sans cela, le
     bouton « Réparer » prenait l'échange pour une erreur et déplaçait les R.

   ÉTATS D'UNE DEMANDE : attente → acceptee | refusee | expiree | impossible | annulee
   (annulee, 11/11/2026 : le demandeur retire sa proposition).
   `impossible` (ajout du 13/08) : l'acceptation a rejoué les contrôles et le
   planning ne permet plus le geste (il a bougé depuis la création). Les deux
   MAR sont prévenus ; la grille reste INTACTE.

   EXPIRATION : 48 h sans réponse → expirée, demandeur notifié. Rappel
   UNIQUE au receveur à 24 h. Déclencheur horaire à installer UNE fois
   depuis l'éditeur : installerDeclencheurEchanges().
   ═══════════════════════════════════════════════════════════════════════ */

const GAS_VERSION_ECHANGES = '2026-11-12.3';   // (12/11/2026) don d'un 18 h entre MAR (type don18, demande de l'équipe) : le receveur doit être libre ce jour-là ; 18 h reçu la veille, le lendemain ou la même semaine qu'un autre 18 h : dit au MAR, qui confirme ([18H], accepte18h) · (12/11/2026) semaine Réa 1 : une garde ou un 18 h pris dans sa propre semaine Réa 1 est dit au MAR, qui confirme ([REA1], accepteRea1) ; le comité en est averti dans les suites de son geste · (12/11/2026) demandes « sans objet » fermées toutes seules quand la garde a changé de mains ou est passée (_echangesSansObjet_), doublon refusé à l'envoi, garde passée refusée à l'envoi et à l'acceptation · (11/11/2026) échange samedi ↔ samedi : les R gardent leur date, les liens LIENS_R suivent le samedi tenu ; « Réparer » recolle de même un échange passé au lieu de déplacer les R · (11/11/2026) annulerEchange : le demandeur annule sa proposition en attente, le collègue est prévenu · (11/11/2026) don et échange sur un jour d'absence : le MAR concerné confirme ([ABS], accepteAbsence) et ses jours d'absence sont écrasés par la garde et son repos · (11/11/2026) gestes du comité (don, échange) : mêmes suites que entre MAR (_gesteSuites_, appliquerGesteComite_) · (11/11/2026) échange de deux 18 h entre MAR (type echange18) · (11/11/2026) un 18 h écrasé par un don passe au donneur, prévenu avant d'envoyer (accepte18) · (11/11/2026) récupérations automatiques : R neuf quand il ne peut pas suivre son samedi, R écrasé reposé, bouton Réparer (recupsReparer), lien recollé à la pose manuelle · (10/11/2026) l'historique dit qui a accepté (onglet HISTORIQUE)

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

/* ── L'INTERRUPTEUR (13/08/2026 — décision le responsable) ─────────────────────
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

/* (14/08/2026) Un humain lit ces messages — récit : docs/JOURNAL-Planning-Med.md §84 */
function _echangesDr_(id) {
  const brut = String(id == null ? '' : id).trim();
  if (!brut) return '';
  let pr = [];
  try { pr = _effectifTitresGas_().titresPr || []; } catch (e) { pr = []; }
  const titre = pr.indexOf(brut) > -1 ? 'Pr ' : 'Dr ';
  return titre + brut.charAt(0).toUpperCase() + brut.slice(1).toLowerCase();
}

/* (12/11/2026) Deux familles de demandes : un DON n'a qu'une date (garde ou
   18 h), un échange en a deux ; un geste « 18 » porte sur des 18 h. */
function _echangesEstDon_(type) { return String(type) === 'don' || String(type) === 'don18'; }
function _echangesEst18_(type)  { return String(type) === 'echange18' || String(type) === 'don18'; }

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
  if (d.TYPE === 'don18') {   // (12/11/2026) un 18 h donné
    return { type: 'don18Jour', year: Number(d.ANNEE), date: d.DATE,
             doctorId: d.DEMANDEUR, doctorId2: d.RECEVEUR };
  }
  if (d.TYPE === 'echange18') {   // (11/11/2026) deux 18 h échangés
    return { type: 'echange18Jours', year: Number(d.ANNEE),
             date: d.DATE, date2: d.DATE2,
             doctorId: d.DEMANDEUR, doctorId2: d.RECEVEUR };
  }
  if (d.TYPE === 'echange') {
    return { type: 'echangeGardeJours', year: Number(d.ANNEE),
             date: d.DATE, date2: d.DATE2,
             doctorId: d.DEMANDEUR, doctorId2: d.RECEVEUR };
  }
  throw new Error('Type de demande inconnu : ' + d.TYPE);
}

/* ── (11/11/2026) ABSENCES CONFIRMÉES PAR LE MAR ───────────────────────
   Décision du responsable : responsabiliser chacun. Un MAR noté absent un jour
   qu'un don ou un échange lui ferait prendre (la garde ou son repos) n'est plus
   bloqué : l'écran lui dit « vous êtes noté en vacances ce jour, vous
   confirmez ? » ; s'il confirme, la garde et le repos s'écrivent par-dessus.
   - le DEMANDEUR (échange) confirme à l'envoi ; sa confirmation est notée
     [ABS-OK] dans INFO, pour que l'acceptation puisse écraser ses jours ;
   - le RECEVEUR confirme à l'acceptation.
   Le préfixe [ABS] est lu par l'écran, qui demande la confirmation et renvoie
   avec accepteAbsence. Les absences que le geste écraserait sont données par
   applyModification lui-même (dryRun, mod._absencesEcrasees) : aucun contrôle
   n'est dupliqué ici. */
const ECHANGES_LIBELLES_ABSENCE = { V: 'en vacances', VM: 'en vacances le matin', VA: 'en vacances l\'après-midi',
  F: 'en formation', TP: 'en temps partiel', CTP: 'en temps partiel', CL: 'en congé long', CP: 'en congé', A: 'absent' };
function _echangesAbsencesDe_(mod, who) {
  return (mod._absencesEcrasees || []).filter(a => String(a.who) === String(who));
}
function _echangesTexteAbsences_(abs) {
  return abs.map(a => (ECHANGES_LIBELLES_ABSENCE[a.code] || 'absent') + ' le ' + _echangesJoli_(a.jour)).join(' et ');
}
function _echangesQuestionAbsence_(abs) {
  return '[ABS] Attention, vous êtes noté ' + _echangesTexteAbsences_(abs)
    + '. Vous confirmez ? Ce jour sera effacé et remplacé par la garde ou son repos.';
}

/* ── (12/11/2026) SEMAINE RÉA 1 : DITE AU MAR, JAMAIS BLOQUANTE ─────────
   Décision du responsable : un don ou un échange qui fait prendre à un MAR de
   l'équipe réa une garde dans SA semaine Réa 1 doit lui être dit. Il confirme,
   ou il renonce : rien n'est interdit.
   - garde : du dimanche de veille au jeudi (les nuits que le générateur lui
     épargne) ; vendredi et samedi ne déclenchent rien ;
   - 18 h : du lundi au vendredi.
   Le préfixe [REA1] est lu par l'écran, qui demande la confirmation et renvoie
   avec accepteRea1. Seuls les MAR listés dans REA1_{année} sont concernés :
   sans l'onglet, rien ne se passe. */
/* { id: { 'AAAA-MM-JJ': 1 } } — les jours (lundi → vendredi) des semaines Réa 1
   de chacun, lus dans REA1_{année} (colonnes « Du » et « REA 1 »). */
function _rea1Jours_(year) {
  const rea1 = {};
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sr = ss.getSheetByName('REA1_' + year);
    if (sr) {
      const v = sr.getDataRange().getValues();
      const ini = {};
      if (ss.getSheetByName('MEDECINS') && typeof _medecinsRows_ === 'function') {
        _medecinsRows_().slice(1).forEach(function (m) {
          const id = String(m[COL_MED.ID]).trim(), i = String(m[COL_MED.INITIALES] || '').trim().toUpperCase();
          if (id) { ini[id.toUpperCase()] = id; if (i) ini[i] = id; }
        });
      }
      for (let r = 1; r < v.length; r++) {
        let lun = _echangesTexteDate_(v[r][1]);
        if (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(lun)) { const m = lun.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); lun = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
        const id = ini[String(v[r][3] == null ? '' : v[r][3]).trim().toUpperCase()];
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(lun)) continue;
        lun = _recupsDecale_(lun, -((_recupsDow_(lun) + 6) % 7));
        (rea1[id] = rea1[id] || {});
        for (let k = 0; k <= 4; k++) rea1[id][_recupsDecale_(lun, k)] = 1;
      }
    }
  } catch (e) {}
  return rea1;
}
/* Le lundi de la semaine Réa 1 de `id` que toucherait ce jour, ou ''.
   quoi = 'garde' (dimanche de veille → jeudi) ou '18' (lundi → vendredi). */
function _echangesRea1Lundi_(id, ds, quoi) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ds))) return '';
  const dow = _recupsDow_(ds);
  let lundi = '';
  if (quoi === '18') { if (dow >= 1 && dow <= 5) lundi = _recupsDecale_(ds, -(dow - 1)); }
  else if (dow === 0) lundi = _recupsDecale_(ds, 1);
  else if (dow >= 1 && dow <= 4) lundi = _recupsDecale_(ds, -(dow - 1));
  if (!lundi) return '';
  // Le dimanche de veille peut appartenir à l'année d'avant : l'onglet est celui du lundi.
  const jours = _rea1Jours_(Number(lundi.slice(0, 4)))[String(id)];
  return jours && jours[lundi] ? lundi : '';
}
/* Ce que la demande ferait prendre à chacun dans SA semaine Réa 1.
   d = { TYPE, DATE, DATE2, DEMANDEUR, RECEVEUR } ; menaces18 = les 18 h du
   receveur qu'un don ferait passer au donneur. → [{ who, jour, quoi, lundi }] */
function _echangesRea1Prises_(d, menaces18) {
  const dem = String(d.DEMANDEUR), rec = String(d.RECEVEUR);
  let prises = [];
  if (d.TYPE === 'don') {
    prises = [{ who: rec, jour: d.DATE, quoi: 'garde' }]
      .concat((menaces18 || []).map(function (j) { return { who: dem, jour: j, quoi: '18' }; }));
  } else if (d.TYPE === 'echange') {
    prises = [{ who: rec, jour: d.DATE, quoi: 'garde' }, { who: dem, jour: d.DATE2, quoi: 'garde' }];
  } else if (d.TYPE === 'echange18') {
    prises = [{ who: rec, jour: d.DATE, quoi: '18' }, { who: dem, jour: d.DATE2, quoi: '18' }];
  } else if (d.TYPE === 'don18') {   // (12/11/2026) un 18 h donné : seul le receveur prend quelque chose
    prises = [{ who: rec, jour: d.DATE, quoi: '18' }];
  }
  return prises.filter(function (x) { x.lundi = _echangesRea1Lundi_(x.who, x.jour, x.quoi); return !!x.lundi; });
}
function _echangesTexteRea1_(prises) {
  return prises.map(function (x) {
    return (x.quoi === '18' ? 'le 18 h du ' : 'la garde du ') + _echangesJoli_(x.jour)
      + ' tombe dans votre semaine Réa 1 (du ' + _echangesJoli_(x.lundi) + ' au ' + _echangesJoli_(_recupsDecale_(x.lundi, 4)) + ')';
  }).join(' et ');
}
function _echangesQuestionRea1_(prises) {
  return '[REA1] Attention, ' + _echangesTexteRea1_(prises) + '. Vous confirmez ?';
}
/* Pour le suivi (INFO de la demande, message au comité) : sans « votre ». */
function _echangesTraceRea1_(x) {
  return '⚠ ' + (x.quoi === '18' ? '18 h' : 'garde') + ' du ' + x.jour + ' en semaine Réa 1 de ' + x.who;
}

/* ── (12/11/2026) DEUX 18 H RAPPROCHÉS : DIT AU MAR, JAMAIS BLOQUANT ────
   Décision du responsable. Le générateur ne pose jamais deux 18 h de suite ni
   deux 18 h la même semaine (lundi → dimanche) au même MAR. Un don ou un
   échange de 18 h peut le faire : celui qui reçoit le 18 h le lit et confirme,
   ou renonce. Le demandeur d'un échange à l'envoi, le receveur à l'acceptation ;
   la notification de proposition le dit déjà. Préfixe [18H], renvoi accepte18h.
   Le 18 h qu'on rend dans le même geste (échange) ne compte pas. */
function _echanges18Proches_(d) {
  const dem = String(d.DEMANDEUR), rec = String(d.RECEVEUR);
  let prises = [];
  if (d.TYPE === 'don18') prises = [{ who: rec, jour: String(d.DATE), sauf: '' }];
  else if (d.TYPE === 'echange18') prises = [{ who: rec, jour: String(d.DATE), sauf: String(d.DATE2) },
                                             { who: dem, jour: String(d.DATE2), sauf: String(d.DATE) }];
  if (!prises.length) return [];
  let cx;
  try { cx = _recupsContexte_(Number(d.ANNEE)); } catch (e) { return []; }
  const a18 = function (id, ds) { return _echanges18Code_(_recupsCase_(cx, id, ds)) === '18'; };
  return prises.filter(function (x) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.jour)) return false;
    x.suite = [_recupsDecale_(x.jour, -1), _recupsDecale_(x.jour, 1)].filter(function (j) { return j !== x.sauf && a18(x.who, j); });
    const lundi = _recupsDecale_(x.jour, -((_recupsDow_(x.jour) + 6) % 7));
    x.semaine = [];
    for (let k = 0; k <= 6; k++) {
      const j = _recupsDecale_(lundi, k);
      if (j !== x.jour && j !== x.sauf && x.suite.indexOf(j) < 0 && a18(x.who, j)) x.semaine.push(j);
    }
    return x.suite.length > 0 || x.semaine.length > 0;
  });
}
function _echangesTexte18Proches_(prises) {
  return prises.map(function (x) {
    const autres = x.suite.length ? x.suite : x.semaine;
    return 'avec le 18 h du ' + _echangesJoli_(x.jour) + ' vous ferez deux 18 h '
      + (x.suite.length ? 'de suite' : 'la même semaine')
      + ' (vous êtes déjà de 18 h le ' + autres.map(_echangesJoli_).join(' et le ') + ')';
  }).join(' et ');
}
function _echangesQuestion18Proches_(prises) {
  return '[18H] Attention, ' + _echangesTexte18Proches_(prises) + '. Vous confirmez ?';
}
function _echangesTrace18Proches_(x) {
  return '⚠ deux 18 h ' + (x.suite.length ? 'de suite' : 'la même semaine') + ' pour ' + x.who + ' (' + [x.jour].concat(x.suite.length ? x.suite : x.semaine).sort().join(', ') + ')';
}

/* ── 1. CRÉER ───────────────────────────────────────────────────────────
   p = { type:'don'|'don18'|'echange'|'echange18', year, date, date2?, receveur }
   Le demandeur est user.id, point. Les contrôles d'applyModification sont
   joués en dryRun : un refus est renvoyé TOUT DE SUITE, rien n'est écrit. */
function creerEchange(user, p) {
  const type = String(p.type || '').trim();
  const year = Number(p.year) || TEST_YEAR;
  const date = String(p.date || '').trim();
  const date2 = String(p.date2 || '').trim();
  const receveur = String(p.receveur || '').trim();

  if (type !== 'don' && type !== 'don18' && type !== 'echange' && type !== 'echange18') throw new Error('Type de demande inconnu');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide');
  if ((type === 'echange' || type === 'echange18') && !/^\d{4}-\d{2}-\d{2}$/.test(date2)) throw new Error('Seconde date invalide');
  if (!receveur) throw new Error('Destinataire absent');
  if (receveur === user.id) throw new Error('On ne se propose pas ' + (_echangesEst18_(type) ? 'un 18 h' : 'une garde') + ' à soi-même');
  /* Circuit fermé (avant ouvrirEchanges) : le RECEVEUR aussi doit être
     autorisé — sinon il recevrait une notification pour un écran qu'il ne
     voit pas. Après ouverture, ce contrôle laisse tout passer. */
  if (!_echangesAutorise_({ id: receveur, role: 'mar' })) {
    throw new Error('Les échanges ne sont pas encore ouverts à ' + receveur);
  }

  const demande = { TYPE: type, ANNEE: year, DATE: date, DATE2: _echangesEstDon_(type) ? '' : date2,
                    DEMANDEUR: user.id, RECEVEUR: receveur };
  /* (12/11/2026 — diagnostic du 11/11) Une garde déjà passée ne se propose
     plus : le planning du passé se réécrivait et la paie recevait un mail.
     Le jour même reste permis. */
  const passee = _echangesPassee_(demande, _recupsAujourdhui_());
  if (passee) throw new Error(passee + ' : ' + (_echangesEst18_(type) ? 'il' : 'elle') + ' ne peut plus être proposé' + (_echangesEst18_(type) ? '' : 'e') + '.');
  /* (12/11/2026 — vu dans le classeur réel) La même garde proposée deux fois
     au même collègue : deux demandes en attente, dont une promise à
     « impossible ». Proposer la même garde à un AUTRE collègue reste permis. */
  const jumelle = _echangesLignes_().lignes.find(l => String(l.ETAT) === 'attente'
    && String(l.TYPE) === type && Number(l.ANNEE) === year && String(l.DATE) === date
    && String(l.DATE2 || '') === demande.DATE2
    && String(l.DEMANDEUR) === user.id && String(l.RECEVEUR) === receveur);
  if (jumelle) throw new Error('Vous avez déjà proposé ' + (_echangesEst18_(type) ? 'ce 18 h' : 'cette garde')
    + ' au ' + _echangesDr_(receveur) + ' : la demande attend sa réponse.');
  // Contrôles joués DÈS LA CRÉATION (décision du 11/08) : mêmes juges que
  // l'écriture réelle, aucune duplication. Lève en cas de refus.
  /* (11/11/2026) Les absences des deux MAR ne bloquent plus à l'envoi : celles
     du demandeur lui sont demandées ici, celles du receveur le seront quand il
     acceptera. Tous les autres contrôles jouent comme avant. */
  const essai = Object.assign({ dryRun: true, ecraserAbsences: [user.id, receveur] }, _echangesVersMod_(demande));
  applyModification(essai);
  const absMoi = _echangesAbsencesDe_(essai, user.id);
  const absLui = _echangesAbsencesDe_(essai, receveur);
  if (absMoi.length && p.accepteAbsence !== true) throw new Error(_echangesQuestionAbsence_(absMoi));

  /* (11/11/2026) Le don écraserait un 18 h du receveur : il passera au
     donneur. Rien ne part tant que le donneur ne l'a pas confirmé. Le préfixe
     [18] est lu par l'écran, qui demande la confirmation. */
  const menaces18 = type === 'don' ? _echanges18Menaces_(year, date, receveur) : [];
  if (menaces18.length && p.accepte18 !== true) {
    throw new Error('[18] Le ' + _echangesDr_(receveur) + ' est de 18 h le ' + menaces18.map(_echangesJoli_).join(' et le ')
      + ' : en lui donnant cette garde, c\'est vous qui ferez ce 18 h. Confirmez pour envoyer la proposition.');
  }

  /* (12/11/2026) Semaine Réa 1 : ce que le demandeur prendrait dans la sienne
     lui est demandé ici ; le receveur sera prévenu, puis interrogé à l'acceptation. */
  const rea1 = _echangesRea1Prises_(demande, menaces18);
  const rea1Moi = rea1.filter(x => x.who === String(user.id)), rea1Lui = rea1.filter(x => x.who === receveur);
  if (rea1Moi.length && p.accepteRea1 !== true) throw new Error(_echangesQuestionRea1_(rea1Moi));

  /* (12/11/2026) Deux 18 h de suite ou la même semaine : même principe. */
  const proches = _echanges18Proches_(demande);
  const prochesMoi = proches.filter(x => x.who === String(user.id)), prochesLui = proches.filter(x => x.who === receveur);
  if (prochesMoi.length && p.accepte18h !== true) throw new Error(_echangesQuestion18Proches_(prochesMoi));

  const id = 'E' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const sh = _echangesFeuille_();
  const ligne = sh.getLastRow() + 1;
  const plage = sh.getRange(ligne, 1, 1, ECHANGES_ENTETE.length);
  try { plage.setNumberFormat('@'); } catch (e) {}   // ceinture : l'onglet hérité d'avant le correctif n'est pas en texte
  plage.setValues([[id, _echangesMaintenant_(), type, year, date, demande.DATE2,
                    user.id, receveur, 'attente', '', '', absMoi.length ? '[ABS-OK]' : '']]);
  logAction('creerEchange ' + id + ' — ' + type + ' ' + date + (demande.DATE2 ? '/' + demande.DATE2 : '')
    + ' | ' + user.id + ' -> ' + receveur);

  _echangesVersKV_();
  notifierPush_(
    type === 'don' ? 'Proposition de garde' : type === 'don18' ? 'Proposition de 18 h' : type === 'echange18' ? 'Proposition d\'échange de 18 h' : 'Proposition d\'échange',
    (type === 'don18'
      ? _echangesDr_(user.id) + ' vous propose son 18 h du ' + _echangesJoli_(date) + '.'
      : type === 'don'
      ? _echangesDr_(user.id) + ' vous propose sa garde du ' + _echangesJoli_(date) + '.'
        + (menaces18.length ? ' En acceptant, votre 18 h du ' + menaces18.map(_echangesJoli_).join(' et du ') + ' passe au ' + _echangesDr_(user.id) + '.' : '')
        + (absLui.length ? ' Attention, vous êtes noté ' + _echangesTexteAbsences_(absLui) + '.' : '')
      : type === 'echange18'
        ? _echangesDr_(user.id) + ' vous propose son 18 h du ' + _echangesJoli_(date) + ' contre le vôtre du ' + _echangesJoli_(demande.DATE2) + '.'
        : _echangesDr_(user.id) + ' vous propose sa garde du ' + _echangesJoli_(date) + ' contre la vôtre du ' + _echangesJoli_(demande.DATE2) + '.'
          + (absLui.length ? ' Attention, vous êtes noté ' + _echangesTexteAbsences_(absLui) + '.' : ''))
      + (rea1Lui.length ? ' Attention, ' + _echangesTexteRea1_(rea1Lui) + '.' : '')
      + (prochesLui.length ? ' Attention, ' + _echangesTexte18Proches_(prochesLui) + '.' : ''),
    './index.html', { id: receveur, pastille: _echangesEnAttentePour_(receveur) });
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
      './index.html', { id: String(d.DEMANDEUR) });
    return { etat: 'refusee' };
  }

  // ACCEPTER : rejouer TOUS les contrôles, pour de vrai cette fois.
  // Le planning a pu bouger depuis la création : un refus ici ne casse
  // rien — état `impossible`, grille intacte, les deux MAR prévenus.
  // (11/11/2026) Les R des deux MAR AVANT le geste : un R écrasé sera reposé.
  /* (11/11/2026) Le receveur noté absent un jour que le geste lui fait prendre :
     on lui pose la question AVANT d'écrire (préfixe [ABS], demande toujours en
     attente). Il renvoie avec accepteAbsence s'il confirme. Les jours du
     demandeur ne sont écrasables que s'il les a confirmés à l'envoi ([ABS-OK]). */
  /* (12/11/2026) Garde passée entre la proposition et la réponse : rien ne
     s'écrit dans le planning, la demande se ferme « sans objet ». */
  const passee = _echangesPassee_(d, _recupsAujourdhui_());
  if (passee) {
    sh.getRange(d._row, colEtat).setValue('sansobjet');
    sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
    sh.getRange(d._row, colInfo).setValue(passee);
    logAction('repondreEchange ' + id + ' — SANS OBJET : ' + passee);
    _echangesVersKV_();
    return { etat: 'sansobjet', error: passee };
  }
  const ecraser = [String(d.RECEVEUR)].concat(/\[ABS-OK\]/.test(String(d.INFO)) ? [String(d.DEMANDEUR)] : []);
  if (p.accepteAbsence !== true) {
    const essai = Object.assign({ dryRun: true, ecraserAbsences: ecraser }, _echangesVersMod_(d));
    let essaiOk = true;
    try { applyModification(essai); } catch (e) { essaiOk = false; }   // le refus est rejoué et tracé juste en dessous
    const absLui = essaiOk ? _echangesAbsencesDe_(essai, d.RECEVEUR) : [];
    if (absLui.length) throw new Error(_echangesQuestionAbsence_(absLui));
  }
  /* (12/11/2026) Semaine Réa 1 du receveur : même principe, préfixe [REA1],
     renvoi avec accepteRea1. La question n'est posée que si le geste passerait :
     une demande devenue impossible suit son chemin habituel, juste en dessous. */
  if (p.accepteRea1 !== true) {
    const r1 = _echangesRea1Prises_(d, []).filter(x => x.who === String(d.RECEVEUR));
    if (r1.length) {
      let passe = true;
      try { applyModification(Object.assign({ dryRun: true, ecraserAbsences: ecraser }, _echangesVersMod_(d))); } catch (e) { passe = false; }
      if (passe) throw new Error(_echangesQuestionRea1_(r1));
    }
  }
  /* (12/11/2026) Deux 18 h de suite ou la même semaine pour le receveur :
     préfixe [18H], renvoi avec accepte18h — posé seulement si le geste passerait.
     Relevé AVANT d'écrire : il sert aussi au suivi de la demande. */
  const proches18 = _echanges18Proches_(d);
  if (p.accepte18h !== true) {
    const p18 = proches18.filter(x => x.who === String(d.RECEVEUR));
    if (p18.length) {
      let passe = true;
      try { applyModification(Object.assign({ dryRun: true, ecraserAbsences: ecraser }, _echangesVersMod_(d))); } catch (e) { passe = false; }
      if (passe) throw new Error(_echangesQuestion18Proches_(p18));
    }
  }
  const releveR = _recupsReleve_(Number(d.ANNEE), [String(d.DEMANDEUR), String(d.RECEVEUR)]);
  const releve18 = _echanges18Releve_(Number(d.ANNEE), [String(d.DEMANDEUR), String(d.RECEVEUR)]);
  const geste = Object.assign({ par: String(d.RECEVEUR) + ' (accepte la demande de ' + String(d.DEMANDEUR) + ')', ecraserAbsences: ecraser }, _echangesVersMod_(d));
  try {
    applyModification(geste);
  } catch (err) {
    sh.getRange(d._row, colEtat).setValue('impossible');
    sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
    sh.getRange(d._row, colInfo).setValue(String(err.message).slice(0, 200));
    logAction('repondreEchange ' + id + ' — IMPOSSIBLE : ' + err.message);
    _echangesVersKV_();
    const corps = 'Le planning a changé depuis la proposition du ' + _echangesJoli_(d.DATE) + ' : ' + err.message;
    notifierPush_('Échange impossible', corps, './index.html', { id: String(d.DEMANDEUR) });
    notifierPush_('Échange impossible', corps, './index.html', { id: String(d.RECEVEUR) });
    return { etat: 'impossible', error: String(err.message) };
  }

  // (11/11/2026) Récupérations et 18 h : mêmes suites pour un geste du comité
  // (appliquerGesteComite_) — une seule source, _gesteSuites_.
  const suites = _gesteSuites_(d, releveR, releve18, String(d.RECEVEUR) + ' (accepte ' + d.ID + ')');
  const rInfos = suites.rInfos;

  sh.getRange(d._row, colEtat).setValue('acceptee');
  sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
  // (11/11/2026) Les absences effacées, confirmées par le MAR, figurent dans le suivi de la demande.
  const infos = (geste._absencesEcrasees || []).map(a => a.code + ' du ' + a.jour + ' effacé (' + a.who + ', confirmé)').concat(suites.infos)
    .concat(proches18.map(_echangesTrace18Proches_));   // (12/11/2026) deux 18 h rapprochés, confirmés par le MAR
  if (infos.length) sh.getRange(d._row, colInfo).setValue(infos.join(' · ').slice(0, 200));
  logAction('repondreEchange ' + id + ' — acceptée' + (infos.length ? ' | ' + infos.join(' · ') : ''));
  // (12/11/2026) Les autres demandes en attente sur une garde qui vient de bouger se ferment seules.
  _echangesSansObjet_();
  _echangesVersKV_();

  let corps = (d.TYPE === 'don18')
    ? 'Le 18 h du ' + _echangesJoli_(d.DATE) + ' passe du ' + _echangesDr_(d.DEMANDEUR) + ' au ' + _echangesDr_(d.RECEVEUR) + '.'
    : (d.TYPE === 'don')
    ? 'La garde du ' + _echangesJoli_(d.DATE) + ' passe du ' + _echangesDr_(d.DEMANDEUR) + ' au ' + _echangesDr_(d.RECEVEUR) + '.'
    : (d.TYPE === 'echange18')
    ? '18 h échangés : le ' + _echangesDr_(d.DEMANDEUR) + ' fait le ' + _echangesJoli_(d.DATE2) + ', le ' + _echangesDr_(d.RECEVEUR) + ' fait le ' + _echangesJoli_(d.DATE) + '.'
    : 'Gardes échangées : le ' + _echangesDr_(d.DEMANDEUR) + ' prend le ' + _echangesJoli_(d.DATE2) + ', le ' + _echangesDr_(d.RECEVEUR) + ' prend le ' + _echangesJoli_(d.DATE) + '.';
  rInfos.forEach(r => { if (r.fait && !r.neuf) corps += ' La récupération du ' + _echangesJoli_(r.dateR) + ' est transférée.'; });
  notifierPush_('Échange confirmé', corps, './index.html', { id: String(d.DEMANDEUR) });
  notifierPush_('Échange confirmé', corps, './index.html', { id: String(d.RECEVEUR) });

  // Aucune date possible pour un R neuf : la trace est laissée par _gesteSuites_
  // (l'onglet Statuts le montre, calculé).
  return { etat: 'acceptee', r: rInfos };
}

/* ── 2 bis. ANNULER (11/11/2026 — demande du responsable) ─────────────
   p = { id } — seul le DEMANDEUR annule, et seulement une demande encore en
   attente. Rien n'est écrit dans le planning : la demande passe à « annulée »,
   le collègue est prévenu et sa pastille se met à jour. */
function annulerEchange(user, p) {
  const id = String(p.id || '').trim();
  const { sh, lignes } = _echangesLignes_();
  const d = lignes.find(l => String(l.ID) === id);
  if (!d) throw new Error('Demande introuvable');
  if (String(d.DEMANDEUR) !== user.id) throw new Error('Seul celui qui a fait la proposition peut l\'annuler');
  if (String(d.ETAT) !== 'attente') throw new Error('Demande déjà ' + d.ETAT + ' — plus rien à annuler');
  sh.getRange(d._row, ECHANGES_ENTETE.indexOf('ETAT') + 1).setValue('annulee');
  sh.getRange(d._row, ECHANGES_ENTETE.indexOf('REPONDU_LE') + 1).setValue(_echangesMaintenant_());
  logAction('annulerEchange ' + id + ' — annulée par ' + user.id);
  _echangesVersKV_();
  notifierPush_('Proposition annulée',
    _echangesDr_(d.DEMANDEUR) + ' a annulé sa proposition du ' + _echangesJoli_(d.DATE) + '.',
    './index.html', { id: String(d.RECEVEUR), pastille: _echangesEnAttentePour_(String(d.RECEVEUR)) });
  return { etat: 'annulee' };
}

/* ── 2 ter. SANS OBJET (12/11/2026 — diagnostic du 11/11) ──────────────
   Une demande en attente ne suivait pas le planning : garde proposée à deux
   collègues, le premier accepte, la seconde restait « en attente » avec sa
   pastille et finissait en « impossible » au clic. Le responsable en a fermé
   trois à la main le 11/11.
   Une demande n'a plus d'objet quand :
   - la garde (ou le 18 h) proposée est passée ;
   - le demandeur ne tient plus ce qu'il propose ;
   - pour un échange, le receveur ne tient plus ce qui est demandé en retour.
   Elle passe alors à l'état `sansobjet`, motif dans INFO. Aucune notification
   (décision du 12/11) : personne n'a rien à faire. Une grille illisible ou une
   case introuvable ne décide RIEN : la demande reste en attente.
   Appelée après chaque geste réussi (acceptation, don ou échange du comité) et
   par le passage horaire, qui rattrape les autres chemins. Renvoie le nombre
   de demandes fermées ; l'appelant pousse la copie rapide. */
function _echangesPassee_(d, auj) {
  const est18 = _echangesEst18_(d.TYPE);
  const dit = function (ds) { return est18 ? 'Le 18 h du ' + _echangesJoli_(ds) + ' est déjà passé'
                                           : 'La garde du ' + _echangesJoli_(ds) + ' est déjà passée'; };
  if (String(d.DATE) < auj) return dit(String(d.DATE));
  if (!_echangesEstDon_(d.TYPE) && String(d.DATE2 || '') && String(d.DATE2) < auj) return dit(String(d.DATE2));
  return '';
}
function _echangesMotifSansObjet_(d, cx, auj) {
  const passee = _echangesPassee_(d, auj);
  if (passee) return passee;
  if (!cx) return '';
  const est18 = _echangesEst18_(d.TYPE);
  const tient = function (id, ds) {
    const v = _recupsCase_(cx, id, ds);
    if (v === null) return null;                       // ligne ou date introuvable : on ne décide pas
    return est18 ? _echanges18Code_(v) === '18' : (v === 'G' || v === 'G2');
  };
  const dit = function (id, ds) { return 'Le ' + _echangesDr_(id) + ' n\'a plus ' + (est18 ? 'le 18 h' : 'la garde') + ' du ' + _echangesJoli_(ds); };
  if (tient(String(d.DEMANDEUR), String(d.DATE)) === false) return dit(String(d.DEMANDEUR), String(d.DATE));
  if (!_echangesEstDon_(d.TYPE) && tient(String(d.RECEVEUR), String(d.DATE2)) === false) return dit(String(d.RECEVEUR), String(d.DATE2));
  return '';
}
function _echangesSansObjet_() {
  let fermees = 0;
  try {
    SpreadsheetApp.flush();                            // les écritures du geste d'abord, la relecture ensuite
    const { sh, lignes } = _echangesLignes_();
    const attente = lignes.filter(function (d) { return String(d.ETAT) === 'attente'; });
    if (!sh || !attente.length) return 0;
    const auj = _recupsAujourdhui_();
    const grilles = {};
    const grille = function (y) {
      if (!(y in grilles)) { try { grilles[y] = _recupsContexte_(y); } catch (e) { grilles[y] = null; } }
      return grilles[y];
    };
    const colEtat = ECHANGES_ENTETE.indexOf('ETAT') + 1;
    const colRep  = ECHANGES_ENTETE.indexOf('REPONDU_LE') + 1;
    const colInfo = ECHANGES_ENTETE.indexOf('INFO') + 1;
    attente.forEach(function (d) {
      const motif = _echangesMotifSansObjet_(d, grille(Number(d.ANNEE)), auj);
      if (!motif) return;
      sh.getRange(d._row, colEtat).setValue('sansobjet');
      sh.getRange(d._row, colRep).setValue(_echangesMaintenant_());
      sh.getRange(d._row, colInfo).setValue(motif.slice(0, 200));
      logAction('echanges ' + d.ID + ' — sans objet : ' + motif);
      fermees++;
    });
  } catch (e) { try { logAction('_echangesSansObjet_ — erreur : ' + e.message); } catch (e2) {} }
  return fermees;
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
  /* (23/08/2026) LE MAIL EST RETIRÉ — récit : docs/JOURNAL-Planning-Med.md §85 */
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
  if (row < 0) return _recupsSuivreSamedi_(year, base, '', 'lien introuvable pour ce samedi et ce MAR');

  const aujourd = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  if (dateR <= aujourd) return _recupsSuivreSamedi_(year, base, '', 'le R du ' + dateR + ' est déjà passé ou en cours');

  // Le déplacement lui-même passe par le même chemin cellule à cellule
  // qu'applyModification : lecture, contrôles, écriture.
  try {
    applyModification({ type: 'transfertR', year: year, date: dateR, doctorId: donneur, doctorId2: receveur, par: 'transfert du R avec le samedi' });
  } catch (err) {
    return _recupsSuivreSamedi_(year, base, dateR, String(err.message));
  }
  sh.getRange(row, 2).setValue(receveur); // le lien suit : MEDECIN = receveur
  return Object.assign(base, { fait: true, dateR: dateR, resume: 'R du ' + dateR + ' transféré' });
}

/* (11/11/2026) Le R ne peut pas suivre à la même date : le donneur rend le
   sien (s'il est à venir), le receveur en reçoit un neuf, le lien suit.
   Le comité n'entre en scène que si AUCUNE date n'est possible. */
function _recupsSuivreSamedi_(year, base, dateDonneur, motif) {
  let cx;
  try { cx = _recupsContexte_(year); }
  catch (e) { return Object.assign(base, { motif: motif, resume: 'R non transféré (' + String(motif).slice(0, 80) + ')' }); }
  let retire = '';
  if (dateDonneur && dateDonneur > cx.aujourdhui && _recupsCase_(cx, base.donneur, dateDonneur) === 'R') {
    _recupsEcrireCase_(cx, base.donneur, dateDonneur, '', true);
    cx.journal.push({ quoi: 'retrait', med: base.donneur, samedi: base.samedi, date: dateDonneur });
    retire = dateDonneur;
  }
  const lien = cx.liens.some(function (x) { return x.samedi === base.samedi && x.med === base.donneur; });
  const d = _recupsPoserNeuf_(cx, base.receveur, base.samedi, true, lien ? base.donneur : '');
  _recupsConclure_(cx, 'samedi ' + base.samedi + ' passé de ' + base.donneur + ' à ' + base.receveur);
  if (!d) return Object.assign(base, { dateR: dateDonneur, retire: retire,
    motif: motif + ' — et aucune date possible pour un R neuf',
    resume: 'R à placer par le comité (aucune date possible)' });
  return Object.assign(base, { fait: true, neuf: true, dateR: d, retire: retire,
    resume: 'R neuf du ' + d + (retire ? ' (R du ' + retire + ' retiré au donneur)' : '') });
}
/* ── 3. EXPIRER (déclencheur horaire) ──────────────────────────────────
   attente > 48 h → expirée, demandeur notifié.
   attente > 24 h sans rappel → rappel UNIQUE au receveur. */
function expirerEchanges() {
  try { if (typeof _bat_ === 'function') _bat_('expirerEchanges'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
  /* (12/11/2026) Filet horaire : une garde déplacée par un autre chemin (statut,
     absence longue, saisie dans le classeur) ou passée ferme aussi sa demande. */
  const sansObjet = _echangesSansObjet_();
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
        './index.html', { id: String(d.DEMANDEUR) });
    } else if (age > ECHANGES_RAPPEL_H * 3600 * 1000 && !String(d.RAPPEL_LE).trim()) {
      sh.getRange(d._row, colRap).setValue(_echangesMaintenant_());
      changements++;
      logAction('expirerEchanges ' + d.ID + ' — rappel 24 h');
      notifierPush_('Proposition en attente',
        _echangesDr_(d.DEMANDEUR) + ' attend votre réponse pour ' + (_echangesEst18_(d.TYPE) ? 'le 18 h' : 'la garde') + ' du ' + _echangesJoli_(d.DATE) + ' (expire dans 24 h).',
        './index.html', { id: String(d.RECEVEUR), pastille: _echangesEnAttentePour_(String(d.RECEVEUR)) });
    }
  });
  if (changements || sansObjet) _echangesVersKV_();
  return { changements: changements + sansObjet };
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

/* ═══════════════════════════════════════════════════════════════════════
   (11/11/2026) LES RÉCUPÉRATIONS SE RÈGLENT TOUTES SEULES
   ═══════════════════════════════════════════════════════════════════════
   Constat du 11/11 sur le classeur réel (2027) : quatre récupérations de
   samedi à régler, et une seule avait laissé une trace.
   - Trois R d'un même MAR avaient été ÉCRASÉS en silence : il avait accepté
     des dons de gardes tombant précisément sur ses jours de récupération.
     donGarde ne contrôlait pas le R.
   - Un samedi donné dont le R n'avait pas pu suivre (receveur pris ce
     jour-là) : le donneur gardait une récupération EN TROP, le receveur n'en
     avait aucune, et l'onglet LIENS_R pointait toujours vers le donneur.
   - Le bouton « Récup » promis par l'écran n'avait jamais existé, et le
     serveur refusait le code R : le comité ne pouvait rien replacer.
   Décision du responsable : tout doit être automatique.

   RÈGLES DE CHOIX D'UNE DATE (décidées le 11/11/2026) — celles du générateur
   (plancher de 15 présents, 2 R au plus le même jour, 3 jours entre deux R
   du même MAR), plus :
   - JAMAIS pendant les vacances scolaires (onglet PERIODES_VAC). Pas de
     dérogation : sans date possible, le comité est alerté.
   - D'abord un jour qui allonge un week-end libre (vendredi ou lundi), un
     pont (jeudi avant un vendredi férié, mardi après un lundi férié) ou des
     congés déjà posés ; puis n'importe quel jour.
   - APRÈS le samedi, au plus tôt ; avant seulement en dernier recours, au
     plus près du samedi.
   - Toujours un jour à venir, et sur une case VIDE : on n'écrase rien.
   Le confort (2 R par jour, 3 jours d'écart) cède en dernier recours ; le
   plancher et les vacances scolaires, jamais.

   TROIS CHEMINS L'UTILISENT :
   1. Un samedi change de mains et son R ne peut pas suivre à la même date :
      le R du donneur est retiré (s'il est à venir), un R neuf est posé au
      receveur, le lien suit (_transfererR_).
   2. Un don ou un échange écrase un R : il est reposé ailleurs, le lien suit
      (_recupsReposerPerdus_).
   3. Le bouton « Réparer » de la page Maintenance : rattrape tout écart
      entre samedis tenus, R posés et LIENS_R (recupsReparer).
   Le comité pose aussi un R à la main (onglet Statuts) : le lien se recolle
   tout seul (recupsRelierPose_, appelé par appliquerStatutJour).
   ═══════════════════════════════════════════════════════════════════════ */
const RECUP_PLANCHER = 15;
const RECUP_MAX_PAR_JOUR = 2;
const RECUP_ECART_JOURS = 3;
const RECUP_ABSENTS = ['V', 'VM', 'VA', 'F', 'TP', 'CL', 'CTP', 'CP', 'A', 'R', 'RG'];
const RECUP_CONGES = ['V', 'VM', 'VA', 'F', 'TP', 'CL', 'CTP', 'CP', 'A'];

function _recupsDecale_(ds, n) {
  const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _recupsDow_(ds) { return new Date(ds + 'T12:00:00').getDay(); }
function _recupsAujourdhui_() {
  return Utilities.formatDate(new Date(), _echangesTz_(), 'yyyy-MM-dd');
}

/* Tout ce qu'il faut pour juger une date, lu UNE fois : la grille GARDES,
   les réglages des MAR, les fériés, les vacances scolaires, les semaines
   Réa 1, les liens samedi → R. Les écritures passent par ce contexte, qui
   tient sa grille à jour : deux poses successives se voient. */
function _recupsContexte_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + year);
  if (!sh) throw new Error('GARDES_' + year + ' introuvable');
  const data = sh.getDataRange().getValues();
  const jan1 = new Date(year, 0, 1), dw = jan1.getDay();
  const off = dw === 1 ? 7 : dw === 0 ? 1 : 8 - dw;
  const debut = new Date(year, 0, 1 + off, 12, 0, 0);
  // Même géométrie qu'applyModification (getLastColumn) : la ligne la plus longue.
  const nCols = Math.max(0, data.reduce(function (m, l) { return Math.max(m, (l || []).length); }, 0) - 1);
  const dates = [], col = {};
  for (let i = 0; i < nCols; i++) {
    const d = new Date(debut); d.setDate(d.getDate() + i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    dates.push(k); col[k] = i + 1;
  }
  const ligne = {}, ids = [];
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0] == null ? '' : data[r][0]).trim();
    if (id && ligne[id] === undefined) { ligne[id] = r; ids.push(id); }
  }
  // Actifs : MEDECINS fait foi s'il est lisible ; sinon toute la grille.
  let actifs = ids.slice();
  try {
    if (ss.getSheetByName('MEDECINS') && typeof _medecinsRows_ === 'function') {
      const ok = {};
      _medecinsRows_().slice(1).forEach(function (m) {
        if (String(m[COL_MED.ACTIF]).trim().toUpperCase() === 'O') ok[String(m[COL_MED.ID]).trim()] = 1;
      });
      actifs = ids.filter(function (id) { return ok[id]; });
    }
  } catch (e) {}
  let flags = { dateDebut: {}, dateFin: {}, tpJoursFixes: {} };
  try { if (typeof getMedecinFlags === 'function') flags = getMedecinFlags(); } catch (e) {}
  let feries = new Set();
  try { if (typeof getJoursFeries === 'function') feries = new Set(getJoursFeries(year)); } catch (e) {}
  const vacances = [];
  try {
    const pv = ss.getSheetByName('PERIODES_VAC');
    if (pv) pv.getDataRange().getValues().slice(1).forEach(function (l) {
      const a = _echangesTexteDate_(l[1]), b = _echangesTexteDate_(l[2]);
      if (/^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) vacances.push([a.slice(0, 10), b.slice(0, 10)]);
    });
  } catch (e) {}
  // Semaines Réa 1 (lundi → vendredi) : ni récupération ni 18 h (générateur, 24/10/2026).
  const rea1 = _rea1Jours_(year);
  const liensSh = ss.getSheetByName('LIENS_R_' + year);
  const liens = [];
  if (liensSh) liensSh.getDataRange().getValues().forEach(function (l, i) {
    if (i === 0) return;
    const s = _echangesTexteDate_(l[0]), m = String(l[1] == null ? '' : l[1]).trim();
    if (!s || !m) return;
    liens.push({ row: i + 1, samedi: s.slice(0, 10), med: m, dateR: _echangesTexteDate_(l[2]).slice(0, 10) });
  });
  return { year: year, sh: sh, data: data, dates: dates, col: col, ligne: ligne, ids: ids, actifs: actifs,
           flags: flags, feries: feries, vacances: vacances, rea1: rea1, liensSh: liensSh, liens: liens,
           aujourdhui: _recupsAujourdhui_(), ecrit: false, journal: [] };
}

function _recupsCase_(cx, id, ds) {
  const r = cx.ligne[id], c = cx.col[ds];
  if (r === undefined || c === undefined) return null;
  const v = cx.data[r][c];
  return String(v == null ? '' : v).trim().toUpperCase().replace(/\.0$/, '');
}
function _recupsEcrireCase_(cx, id, ds, code, ecrire) {
  const r = cx.ligne[id], c = cx.col[ds];
  if (r === undefined || c === undefined) throw new Error('case ' + id + ' ' + ds + ' introuvable');
  cx.data[r][c] = code;
  if (ecrire) { cx.sh.getRange(r + 1, c + 1).setValue(code); cx.ecrit = true; }
}
function _recupsHorsService_(cx, id, ds) {
  const f = cx.flags || {};
  const dd = (f.dateDebut || {})[id], df = (f.dateFin || {})[id];
  if ((dd && ds < dd) || (df && ds >= df)) return true;
  const tp = (f.tpJoursFixes || {})[id];
  if (tp && tp.has && tp.has(_recupsDow_(ds))) return true;
  try { if (typeof estSemaineOff === 'function' && estSemaineOff(id, ds)) return true; } catch (e) {}
  return false;
}
function _recupsPresents_(cx, ds) {
  let n = 0;
  cx.actifs.forEach(function (m) {
    if (_recupsHorsService_(cx, m, ds)) return;
    if (RECUP_ABSENTS.indexOf(_recupsCase_(cx, m, ds)) > -1) return;
    n++;
  });
  return n;
}
function _recupsNbR_(cx, ds) {
  let n = 0; cx.ids.forEach(function (m) { if (_recupsCase_(cx, m, ds) === 'R') n++; }); return n;
}
function _recupsEnVacancesScolaires_(cx, ds) {
  return cx.vacances.some(function (p) { return ds >= p[0] && ds <= p[1]; });
}
/* Le jour peut-il recevoir le R de `id` ? `ultime` relâche le confort,
   jamais le plancher ni les vacances scolaires. */
function _recupsEligible_(cx, id, ds, ultime) {
  const dw = _recupsDow_(ds);
  if (dw === 0 || dw === 6 || cx.feries.has(ds)) return false;
  if (ds.slice(0, 4) !== String(cx.year) || ds <= cx.aujourdhui) return false;
  if (_recupsEnVacancesScolaires_(cx, ds)) return false;
  if (_recupsCase_(cx, id, ds) !== '') return false;
  if (_recupsHorsService_(cx, id, ds)) return false;
  if (cx.rea1[id] && cx.rea1[id][ds]) return false;
  if (_recupsPresents_(cx, ds) - 1 < RECUP_PLANCHER) return false;
  if (ultime) return true;
  if (_recupsNbR_(cx, ds) >= RECUP_MAX_PAR_JOUR) return false;
  for (let k = -RECUP_ECART_JOURS; k <= RECUP_ECART_JOURS; k++) {
    if (k && _recupsCase_(cx, id, _recupsDecale_(ds, k)) === 'R') return false;
  }
  return true;
}
/* Un jour qui sert à quelque chose : il allonge un week-end LIBRE, fait un
   pont avec un férié, ou colle à des congés déjà posés. */
function _recupsUtile_(cx, id, ds) {
  const dw = _recupsDow_(ds);
  const libre = function (x) { const v = _recupsCase_(cx, id, x); return v !== 'G' && v !== 'G2' && v !== 'RG'; };
  if (dw === 5 && libre(_recupsDecale_(ds, 1)) && libre(_recupsDecale_(ds, 2))) return true;
  if (dw === 1 && libre(_recupsDecale_(ds, -1)) && libre(_recupsDecale_(ds, -2))) return true;
  if (dw === 4 && cx.feries.has(_recupsDecale_(ds, 1)) && libre(_recupsDecale_(ds, 2)) && libre(_recupsDecale_(ds, 3))) return true;
  if (dw === 2 && cx.feries.has(_recupsDecale_(ds, -1)) && libre(_recupsDecale_(ds, -2)) && libre(_recupsDecale_(ds, -3))) return true;
  return [-1, 1].some(function (k) { return RECUP_CONGES.indexOf(_recupsCase_(cx, id, _recupsDecale_(ds, k))) > -1; });
}
/* La date du R de `id` pour le samedi `samedi` ('' si aucune). */
function _recupsChoisir_(cx, id, samedi) {
  const ref = samedi && samedi > cx.aujourdhui ? samedi : cx.aujourdhui;
  const apres = cx.dates.filter(function (d) { return d > ref; });
  const avant = cx.dates.filter(function (d) { return d < ref; }).reverse();
  const tours = [
    [apres, false, true], [apres, false, false], [apres, true, false],
    [avant, false, true], [avant, false, false], [avant, true, false],
  ];
  for (let t = 0; t < tours.length; t++) {
    const liste = tours[t][0], ultime = tours[t][1], utile = tours[t][2];
    for (let i = 0; i < liste.length; i++) {
      const d = liste[i];
      if (utile && !_recupsUtile_(cx, id, d)) continue;
      if (_recupsEligible_(cx, id, d, ultime)) return d;
    }
  }
  return '';
}
/* Lien samedi → R : met à jour la ligne, ou l'ajoute. */
function _recupsLier_(cx, samedi, med, dateR, ecrire, ancienMed) {
  const l = cx.liens.find(function (x) { return x.samedi === samedi && x.med === (ancienMed || med); });
  if (l) {
    l.med = med; l.dateR = dateR;
    if (ecrire && cx.liensSh) { try { cx.liensSh.getRange(l.row, 1, 1, 3).setNumberFormat('@'); } catch (e) {}
      cx.liensSh.getRange(l.row, 2, 1, 2).setValues([[med, dateR]]); cx.ecrit = true; }
    return;
  }
  const row = cx.liensSh ? cx.liensSh.getLastRow() + 1 : 0;
  cx.liens.push({ row: row, samedi: samedi, med: med, dateR: dateR });
  if (ecrire && cx.liensSh) { try { cx.liensSh.getRange(row, 1, 1, 3).setNumberFormat('@'); } catch (e) {}
    cx.liensSh.getRange(row, 1, 1, 3).setValues([[samedi, med, dateR]]); cx.ecrit = true; }
}
/* (11/11/2026) Rattache un lien existant à un autre samedi, SANS toucher à la
   date du R ni à la grille : seule la colonne SAMEDI de LIENS_R change. */
function _recupsRelierSamedi_(cx, lien, samedi, ecrire) {
  lien.samedi = samedi;
  if (ecrire && cx.liensSh && lien.row) {
    try { cx.liensSh.getRange(lien.row, 1).setNumberFormat('@'); } catch (e) {}
    cx.liensSh.getRange(lien.row, 1).setValue(samedi);
  }
}
/* Échange samedi ↔ samedi accepté : a tenait s1, b tenait s2 ; désormais a
   tient s2 et b tient s1. Chaque R reste à sa date, son lien suit. */
function _recupsCroiserLiens_(year, s1, s2, a, b) {
  let cx;
  try { cx = _recupsContexte_(year); } catch (e) { return ''; }
  if (!cx.liensSh) return '';
  const la = cx.liens.find(function (x) { return x.samedi === s1 && x.med === a; });
  const lb = cx.liens.find(function (x) { return x.samedi === s2 && x.med === b; });
  if (la) _recupsRelierSamedi_(cx, la, s2, true);
  if (lb) _recupsRelierSamedi_(cx, lb, s1, true);
  if (!la && !lb) return '';
  try { logAction('récups — échange de samedis ' + s1 + ' ↔ ' + s2 + ' (' + a + ', ' + b + ') : R à leur date, liens croisés'); } catch (e) {}
  return 'R à leur date, liens des samedis croisés';
}
/* Pose un R neuf pour (samedi, id), lien compris. Renvoie la date ou ''. */
function _recupsPoserNeuf_(cx, id, samedi, ecrire, ancienMed) {
  const d = _recupsChoisir_(cx, id, samedi);
  if (d) _recupsEcrireCase_(cx, id, d, 'R', ecrire);
  if (samedi && cx.liensSh) _recupsLier_(cx, samedi, id, d, ecrire, ancienMed);
  cx.journal.push(d ? { quoi: 'pose', med: id, samedi: samedi, date: d }
                    : { quoi: 'sansDate', med: id, samedi: samedi });
  return d;
}
/* Après des écritures de R : republier, armer les mails, prévenir les MAR. */
function _recupsConclure_(cx, par) {
  if (!cx.ecrit) return;
  try { if (typeof historiser_ === 'function') historiser_(cx.journal.filter(function (j) { return j.quoi !== 'sansDate' && j.quoi !== 'relien'; }).map(function (j) {
    return { annee: cx.year, quoi: j.quoi === 'retrait' ? 'récupération retirée' : 'récupération posée',
             mar: j.med, jour: j.date || '', jour2: j.samedi || '', autre: '', par: par || 'automatique', detail: j.samedi ? 'samedi ' + j.samedi : '' };
  })); } catch (e) {}
  try { generatePlanning(cx.year); } catch (e) { try { logAction('récups : republication impossible — ' + e.message); } catch (_) {} }
  try { notifPlanifier(cx.year); } catch (e) {}
  cx.journal.forEach(function (j) {
    let corps = '';
    if (j.quoi === 'pose') corps = 'Votre récupération' + (j.samedi ? ' du samedi ' + _echangesJoli_(j.samedi) : '') + ' est posée le ' + _echangesJoli_(j.date) + '.';
    else if (j.quoi === 'retrait') corps = 'Votre récupération du ' + _echangesJoli_(j.date) + ' est retirée : le samedi ' + _echangesJoli_(j.samedi) + ' n\'est plus le vôtre.';
    if (corps) { try { notifierPush_('Récupération', corps, './index.html', { id: j.med }); } catch (e) {} }
  });
  cx.journal.forEach(function (j) {
    try { logAction('récups — ' + j.quoi + ' ' + j.med + (j.samedi ? ' samedi ' + j.samedi : '') + (j.date ? ' → ' + j.date : '')
      + (j.quoi === 'sansDate' ? ' : AUCUNE DATE POSSIBLE, à placer par le comité' : '')); } catch (e) {}
  });
}

/* Chemin 2 : relevé des R avant un don ou un échange, puis repose de ceux
   que le geste a écrasés. */
function _recupsReleve_(year, ids) {
  const out = {};
  try {
    const cx = _recupsContexte_(year);
    ids.forEach(function (id) { out[id] = cx.dates.filter(function (d) { return _recupsCase_(cx, id, d) === 'R'; }); });
  } catch (e) {}
  return out;
}
function _recupsReposerPerdus_(year, releve, par) {
  const ids = Object.keys(releve || {});
  if (!ids.length) return [];
  let cx;
  try { cx = _recupsContexte_(year); } catch (e) { return []; }
  ids.forEach(function (id) {
    releve[id].forEach(function (d) {
      if (_recupsCase_(cx, id, d) === 'R' || d <= cx.aujourdhui) return;
      const l = cx.liens.find(function (x) { return x.med === id && x.dateR === d; });
      _recupsPoserNeuf_(cx, id, l ? l.samedi : '', true);
    });
  });
  _recupsConclure_(cx, par);
  return cx.journal;
}

/* Le comité pose un R à la main (onglet Statuts) : il compense le samedi
   de ce MAR dont le lien est cassé (R absent à la date notée), sinon un
   samedi tenu sans lien. Le plus ancien d'abord. */
function recupsRelierPose_(year, id, datesPosees) {
  let cx;
  try { cx = _recupsContexte_(year); } catch (e) { return 0; }
  if (!cx.liensSh) return 0;
  let n = 0;
  datesPosees.slice().sort().forEach(function (d) {
    if (_recupsCase_(cx, id, d) !== 'R') return;
    if (cx.liens.some(function (x) { return x.med === id && x.dateR === d; })) return;
    const tenus = cx.dates.filter(function (s) { return _recupsDow_(s) === 6 && /^G2?$/.test(_recupsCase_(cx, id, s) || ''); });
    const casse = cx.liens.filter(function (x) { return x.med === id && tenus.indexOf(x.samedi) > -1 && _recupsCase_(cx, id, x.dateR) !== 'R'; })
      .sort(function (a, b) { return a.samedi < b.samedi ? -1 : 1; })[0];
    if (casse) { _recupsLier_(cx, casse.samedi, id, d, true); n++; return; }
    const orphelin = tenus.filter(function (s) { return !cx.liens.some(function (x) { return x.samedi === s && x.med === id; }); })[0];
    if (orphelin) { _recupsLier_(cx, orphelin, id, d, true); n++; }
  });
  return n;
}

/* ── Chemin 3 : le bouton « Réparer » (page Maintenance) ────────────────
   appliquer=false : rien n'est écrit, la liste dit ce qui SERAIT fait.
   Pour chaque samedi à venir : ses tenants (G et G2), ses liens, leurs R.
   - lien vers un ancien tenant : son R (s'il est à venir) est retiré, le
     nouveau tenant reçoit un R neuf ;
   - lien vers le tenant mais R absent (écrasé) : R neuf ;
   - tenant sans lien : R neuf.
   Les samedis sont traités dans l'ordre du calendrier, comme au générateur. */
function recupsReparer(year, appliquer) {
  const cx = _recupsContexte_(year);
  if (!cx.liensSh) return { annee: year, actions: [], note: 'pas de liens samedi → récupération pour ' + year };
  const ecrire = !!appliquer;
  const samedis = cx.dates.filter(function (d) { return _recupsDow_(d) === 6 && d > cx.aujourdhui; });
  /* 0. (11/11/2026) Échange samedi ↔ samedi passé : le MAR n'a plus le samedi
     de son lien, mais il tient un autre samedi à venir qui n'a pas de lien à
     son nom. Son R est celui de ce samedi-là : on rattache le lien, on ne
     touche ni à la date ni à la grille (décision du 12/08 : aucun R ne bouge). */
  const _tient = function (id, s) { return /^G2?$/.test(_recupsCase_(cx, id, s) || ''); };
  cx.liens.filter(function (x) { return x.samedi > cx.aujourdhui && !_tient(x.med, x.samedi); }).forEach(function (x) {
    const autre = samedis.filter(function (s) {
      return _tient(x.med, s) && !cx.liens.some(function (y) { return y.samedi === s && y.med === x.med; });
    })[0];
    if (!autre) return;
    cx.journal.push({ quoi: 'relien', med: x.med, samedi: autre, ancien: x.samedi, date: x.dateR });
    _recupsRelierSamedi_(cx, x, autre, ecrire);
  });
  const traites = {};
  samedis.forEach(function (s) {
    const tenants = cx.ids.filter(function (id) { return /^G2?$/.test(_recupsCase_(cx, id, s) || ''); });
    const liensS = cx.liens.filter(function (x) { return x.samedi === s; });
    // 1. liens vers un MAR qui ne tient plus ce samedi
    liensS.filter(function (x) { return tenants.indexOf(x.med) < 0; }).forEach(function (x) {
      const nouveau = tenants.filter(function (t) { return !cx.liens.some(function (y) { return y.samedi === s && y.med === t; }); })[0];
      if (!nouveau) return;   // personne à qui le rattacher : on ne touche à rien
      const ancien = x.med;
      if (x.dateR && x.dateR > cx.aujourdhui && _recupsCase_(cx, ancien, x.dateR) === 'R'
          && !cx.liens.some(function (y) { return y !== x && y.med === ancien && y.dateR === x.dateR; })) {
        _recupsEcrireCase_(cx, ancien, x.dateR, '', ecrire);
        cx.journal.push({ quoi: 'retrait', med: ancien, samedi: s, date: x.dateR });
      }
      _recupsPoserNeuf_(cx, nouveau, s, ecrire, ancien);
      traites[s + '|' + nouveau] = 1;
    });
    // 2. et 3. tenants sans R valable
    tenants.forEach(function (t) {
      if (traites[s + '|' + t]) return;
      const l = cx.liens.find(function (x) { return x.samedi === s && x.med === t; });
      if (l && l.dateR && _recupsCase_(cx, t, l.dateR) === 'R') return;
      if (l && l.dateR && l.dateR <= cx.aujourdhui) return;   // déjà pris
      _recupsPoserNeuf_(cx, t, s, ecrire);
    });
  });
  if (ecrire) {
    _recupsConclure_(cx, 'bouton Réparer');
    logAction('recupsReparer ' + year + ' — ' + cx.journal.length + ' geste(s)');
  }
  return { annee: year, actions: cx.journal };
}

/* ═══════════════════════════════════════════════════════════════════════
   (11/11/2026) LE 18 H ÉCRASÉ PAR UN DON PASSE AU DONNEUR — ET ON LE DIT AVANT
   ═══════════════════════════════════════════════════════════════════════
   Constat du 11/11 (2027) : un don de garde du dimanche, accepté par un MAR
   de 18 h le lundi. Son repos de garde a remplacé le 18 h sans rien dire :
   le lundi n'avait plus de 18 h. Décision du responsable :
   - le 18 h passe AU DONNEUR, libéré ce jour-là par le geste (sa garde ou
     son repos vient de partir) ;
   - le donneur en est PRÉVENU AVANT d'envoyer : le serveur refuse la
     proposition tant qu'il ne l'a pas confirmée (accepte18), et le receveur
     le lit dans la proposition.
   À l'acceptation, le report se fait sur tout 18 h perdu par l'un des deux
   MAR (don ou échange), vers l'autre s'il est libre ce jour-là ; sinon le
   comité le voit dans les jours à découvert de l'onglet Statuts. */
function _echanges18Code_(v) { return String(v == null ? '' : v).trim().replace(/\.0$/, ''); }

/* Les 18 h du receveur qu'un DON écraserait : le jour de la garde, et le
   lendemain (son repos de garde). */
function _echanges18Menaces_(year, date, receveur) {
  try {
    const cx = _recupsContexte_(year);
    return [date, _recupsDecale_(date, 1)].filter(function (d) { return _echanges18Code_(_recupsCase_(cx, receveur, d)) === '18'; });
  } catch (e) { return []; }
}
function _echanges18Releve_(year, ids) {
  const out = {};
  try {
    const cx = _recupsContexte_(year);
    ids.forEach(function (id) { out[id] = cx.dates.filter(function (d) { return _echanges18Code_(_recupsCase_(cx, id, d)) === '18'; }); });
  } catch (e) {}
  return out;
}
/* releve : { A: [dates 18], B: [...] } AVANT le geste ; les deux MAR du geste. */
function _echanges18Reporter_(year, releve, par) {
  const ids = Object.keys(releve || {});
  if (ids.length !== 2) return [];
  let cx;
  try { cx = _recupsContexte_(year); } catch (e) { return []; }
  const faits = [];
  ids.forEach(function (id, i) {
    const autre = ids[1 - i];
    releve[id].forEach(function (d) {
      if (_echanges18Code_(_recupsCase_(cx, id, d)) === '18') return;
      if (_recupsCase_(cx, autre, d) === '') {
        _recupsEcrireCase_(cx, autre, d, '18', true);
        faits.push({ de: id, a: autre, date: d });
      } else faits.push({ de: id, a: '', date: d });
    });
  });
  if (!faits.length) return [];
  try { if (typeof historiser_ === 'function') historiser_(faits.filter(function (f) { return f.a; }).map(function (f) {
    return { annee: year, quoi: '18 h repris avec la garde', mar: f.a, jour: f.date, jour2: '', autre: f.de, par: par || 'automatique', detail: '' };
  })); } catch (e) {}
  if (cx.ecrit) {
    try { generatePlanning(year); } catch (e) {}
    try { notifPlanifier(year); } catch (e) {}
  }
  faits.forEach(function (f) {
    try {
      if (f.a) {
        notifierPush_('18 h', 'Vous faites le 18 h du ' + _echangesJoli_(f.date) + ', repris du ' + _echangesDr_(f.de) + ' avec la garde.', './index.html', { id: f.a });
        notifierPush_('18 h', 'Votre 18 h du ' + _echangesJoli_(f.date) + ' passe au ' + _echangesDr_(f.a) + '.', './index.html', { id: f.de });
        logAction('18 h du ' + f.date + ' : ' + f.de + ' → ' + f.a + ' (écrasé par le geste, repris par l\'autre MAR)');
      } else {
        logAction('18 h du ' + f.date + ' perdu par ' + f.de + ' : l\'autre MAR n\'est pas libre ce jour-là — jour à découvert (onglet Statuts)');
      }
    } catch (e) {}
  });
  return faits;
}

/* (11/11/2026) LES SUITES D'UN GESTE SUR LES GARDES, une seule source pour les
   échanges entre MAR (repondreEchange) et les gestes du comité (admin, carte
   « Modifier une garde » → appliquerGesteComite_). Défaut trouvé le 11/11 :
   le comité passait directement par applyModification, sans aucune de ces
   suites — la récup du samedi ne suivait pas, un R ou un 18 h écrasé disparaissait.
   d = { TYPE: 'don'|'don18'|'echange'|'echange18', ANNEE, DATE, DATE2, DEMANDEUR, RECEVEUR }.
   À appeler APRÈS applyModification, avec les relevés pris AVANT. */
function _gesteSuites_(d, releveR, releve18, par) {
  const y = Number(d.ANNEE);
  // Un R écrasé par la garde reçue (ou son repos) est reposé ailleurs AVANT les
  // transferts : seuls les R écrasés sont vus manquants.
  const reposes = _recupsReposerPerdus_(y, releveR, par);
  // Un 18 h écrasé passe à l'autre MAR du geste, libéré ce jour-là.
  // Un échange ou un don de 18 h déplace des 18 h exprès : rien à reporter.
  const reports18 = _echangesEst18_(d.TYPE) ? [] : _echanges18Reporter_(y, releve18, par);
  // Samedi qui change de mains → transfert du R de CE samedi.
  // Don : la garde du DATE passe au receveur. Échange : exactement un des deux
  // jours est un samedi ; samedi ↔ samedi, aucun R ne bouge (décision du 12/08).
  const rInfos = [];
  if (d.TYPE === 'don' && _echangesEstSamedi_(d.DATE)) {
    rInfos.push(_transfererR_(y, d.DATE, String(d.DEMANDEUR), String(d.RECEVEUR)));
  } else if (d.TYPE === 'echange') {
    const s1 = _echangesEstSamedi_(d.DATE), s2 = _echangesEstSamedi_(d.DATE2);
    if (s1 !== s2) {
      if (s1) rInfos.push(_transfererR_(y, d.DATE, String(d.DEMANDEUR), String(d.RECEVEUR)));
      else    rInfos.push(_transfererR_(y, d.DATE2, String(d.RECEVEUR), String(d.DEMANDEUR)));
    }
  }
  // (11/11/2026) Samedi ↔ samedi : les R restent à leur date, les liens suivent.
  const croises = (d.TYPE === 'echange' && _echangesEstSamedi_(d.DATE) && _echangesEstSamedi_(d.DATE2))
    ? _recupsCroiserLiens_(y, d.DATE, d.DATE2, String(d.DEMANDEUR), String(d.RECEVEUR)) : '';
  const infos = rInfos.map(r => r.resume).concat(croises ? [croises] : []).concat((reposes || []).map(j =>
    j.quoi === 'pose' ? 'R de ' + j.med + ' reposé le ' + j.date : 'R de ' + j.med + ' à placer par le comité'))
    .concat((reports18 || []).map(f => f.a ? '18 h du ' + f.date + ' : ' + f.de + ' → ' + f.a : '18 h du ' + f.date + ' perdu par ' + f.de));
  // (12/11/2026) Semaine Réa 1 : ce qui vient d'y être pris est dit — au suivi de la
  // demande entre MAR (qui l'ont confirmé), et au comité quand le geste est le sien.
  let enRea1 = [];
  try {
    enRea1 = _echangesRea1Prises_(d, []).concat((reports18 || []).filter(f => f.a).map(function (f) {
      return { who: String(f.a), jour: f.date, quoi: '18', lundi: _echangesRea1Lundi_(f.a, f.date, '18') };
    }).filter(x => x.lundi));
  } catch (e) {}
  enRea1.forEach(x => infos.push(_echangesTraceRea1_(x)));
  rInfos.forEach(r => { if (!r.fait) _echangesAlerterComite_(r); });
  return { rInfos: rInfos, reposes: reposes, reports18: reports18, infos: infos, rea1: enRea1 };
}

/* Un don ou un échange de gardes fait par le comité (page admin) : mêmes
   contrôles (applyModification), mêmes suites que entre MAR. Renvoie les
   suites en clair, que l'écran affiche. Lève si le geste est refusé. */
function appliquerGesteComite_(mod) {
  const TYPES = { donGarde: 'don', echangeGardeJours: 'echange' };
  const d = { TYPE: TYPES[mod.type], ANNEE: Number(mod.year) || TEST_YEAR, DATE: mod.date, DATE2: mod.date2 || '',
              DEMANDEUR: String(mod.doctorId), RECEVEUR: String(mod.doctorId2) };
  const releveR = _recupsReleve_(d.ANNEE, [d.DEMANDEUR, d.RECEVEUR]);
  const releve18 = _echanges18Releve_(d.ANNEE, [d.DEMANDEUR, d.RECEVEUR]);
  applyModification(mod);
  const s = _gesteSuites_(d, releveR, releve18, mod.par || 'comité');
  if (s.infos.length) logAction('geste du comité ' + mod.type + ' ' + d.DATE + ' — ' + s.infos.join(' · '));
  // (12/11/2026) Une demande entre MAR qui portait sur cette garde n'a plus d'objet.
  if (!mod.dryRun && _echangesSansObjet_()) _echangesVersKV_();
  return s;
}
