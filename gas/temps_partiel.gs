/* ═══════════════════════════════════════════════════════════════════════
   TEMPS_PARTIEL — Temps partiel : pose, campagne, grille, décisions du comité, fermetures
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_TP = '2026-09-15.2';

/* ── (POSE TP · 22/08/2026) PHASE DE POSE DES TEMPS PARTIELS — DÉDUITE, JAMAIS ÉCRITE ──
   Les jours de temps partiel se posent APRÈS la génération des gardes (décision
   du responsable, 22/08/2026). La phase n'est stockée nulle part : elle se DÉDUIT de
   l'état du classeur, donc supprimer GARDES_{Y} pour régénérer la referme seule.
   Une année ne compte « générée » que si GARDES_{Y} ET LIENS_R_{Y} existent :
   le générateur crée toujours les deux, alors que 2026 (tenue à la main) a un
   GARDES_2026 mais pas de LIENS_R_2026 — vérifié dans le classeur le 22/08.
   ⚠️ Sans ce double test, supprimer GARDES_2027 en octobre ferait retomber la
   phase sur 2026 et des TP fuiraient dans INDISPOS_2026.
   On regarde active+1 PUIS active : en régime de croisière (année en cours
   générée, suivante pas encore), la pose continue sur l'année en cours. */
function _phaseTp_() {
  /* (LOT 5 · 22/08/2026) La phase est MULTI-ANNÉES — arbitrage le responsable : « il
     faut pouvoir poser encore dans l'année en cours même si N+1 est ouvert ».
     Fin 2027, GARDES_2027 et GARDES_2028 coexistent : les DEUX années sont
     ouvertes à la pose. `annees` les porte toutes (croissant) ; `annee` reste
     la plus récente, pour les appelants qui n'en veulent qu'une. */
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const a = getActiveYear();
    const annees = [];
    for (let y = a; y <= a + 1; y++) {
      if (ss.getSheetByName(`GARDES_${y}`) && ss.getSheetByName(`LIENS_R_${y}`)) annees.push(y);
    }
    if (annees.length) return { actif: true, annee: annees[annees.length - 1], annees: annees };
  } catch (e) {}
  return { actif: false, annee: null, annees: [] };
}

// Le MAR est-il hors du dispositif TP ? (règle SANS nom en dur : jours fixes
// déclarés, ou rythme 2 semaines sur 2 — même règle que getVacConfig.)
function _tpFixeDe_(marId) {
  try {
    const f = getMedecinFlags();
    return f.rythme2sur2.has(marId) || !!f.tpJoursFixes[marId];
  } catch (e) { return false; }
}

function _quotiteDe_(marId) {
  const data = _medecinsRows_();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][COL_MED.ID]).trim() === String(marId).trim()) return Number(data[r][COL_MED.QUOTITE]) || 100;
  }
  return 100;
}

/* ── L'EFFECTIF PRÉSENT, CÔTÉ SERVEUR — réplique de _rPresents du générateur ──
   Même définition que generateur_gardes.gs (validée contre la ligne
   « TOTAL PRESENTS » du planning du service) : tous les MAR actifs sauf DRUGE,
   bornés par date_debut/date_fin ; absent = VAC/FORM/CL/TP/CTP/CP/A lu dans
   INDISPOS_{Y} (JAMAIS dans GARDES, qui écrit RG par-dessus TP — l.≈1535),
   semaine off du rythme 2/2, jour fixe tp_jours_fixes, et RG/R lus dans
   GARDES_{Y}. Les gardes G/G2 comptent PRÉSENTES (le MAR travaille au bloc).
   TPA ne compte pas absent — voir l'en-tête du circuit.
   Tout est lu UNE fois par appel, puis compté en mémoire. */
function _tpMondePresence_(annee) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ABS = new Set(['VAC', 'FORM', 'CL', 'TP', 'CTP', 'CP', 'A', 'RG_TRANSITION']);
  const FLAGS = getMedecinFlags();
  const medData = _medecinsRows_();
  const ids = [];
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    if (!id || id === 'DRUGE') continue;                     // même exclusion que le générateur
    if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
    ids.push(id);
  }
  const indispos = {};
  const shI = ss.getSheetByName(`INDISPOS_${annee}`);
  const dI = shI ? shI.getDataRange().getValues() : [];
  const datesI = dI.length ? reconstruireDatesHeaders(dI, annee) : [];
  for (let r = 3; r < dI.length; r++) {
    const id = String(dI[r][0]).trim(); if (!id) continue;
    indispos[id] = {};
    datesI.forEach((ds, i) => {
      if (!ds) return;
      const v = String(dI[r][i + 1] || '').trim().toUpperCase();
      if (v) indispos[id][ds] = v;
    });
  }
  const enGarde = {}, enRepos = {}, en18 = {}, enTp = {};
  const shG = ss.getSheetByName(`GARDES_${annee}`);
  if (shG) {
    const dG = shG.getDataRange().getValues();
    const d2c = buildDateToCol(dG, annee);
    const c2d = {}; Object.keys(d2c).forEach(ds => { c2d[d2c[ds]] = ds; });
    for (let r = 3; r < dG.length; r++) {
      const id = String(dG[r][0]).trim(); if (!id) continue;
      for (let c = 1; c < dG[0].length; c++) {
        const ds = c2d[c]; if (!ds) continue;
        const v = String(dG[r][c] || '').trim().toUpperCase();
        // Le CODE est conservé (pas un simple booléen) : l'écran de pose
        // distingue GARDE / REPOS / RÉCUP dans ses pastilles.
        if (v === 'G' || v === 'G2') { (enGarde[id] = enGarde[id] || {})[ds] = v; }
        else if (v === 'RG' || v === 'R') { (enRepos[id] = enRepos[id] || {})[ds] = v; }
        // La garde de 18h : PRÉSENT dans l'effectif, mais AU TRAVAIL — un TP
        // (congé) ne peut pas s'y poser. Arbitrage le responsable du 22/08/2026.
        else if (v === '18') { (en18[id] = en18[id] || {})[ds] = v; }
        /* (23/08/2026) LE TP VIT DANS GARDES, plus dans INDISPOS. C'est
           l'onglet maître du planning : un TP écrit là retire le MAR de son
           secteur (il figure dans ABSENT_CODES, code.gs). INDISPOS redevient
           ce qu'il est : la matière première d'AVANT la génération. */
        else if (v === 'TP') { (enTp[id] = enTp[id] || {})[ds] = v; }
      }
    }
  }
  function presents(ds) {
    let n = 0;
    ids.forEach(id => {
      const dd = FLAGS.dateDebut[id], df = FLAGS.dateFin[id];
      if ((dd && ds < dd) || (df && ds >= df)) return;
      if (ABS.has((indispos[id] || {})[ds])) return;
      if (estSemaineOff(id, ds)) return;
      const tpF = FLAGS.tpJoursFixes[id];
      if (tpF && tpF.has(new Date(ds + 'T12:00:00').getDay())) return;
      if (enRepos[id] && enRepos[id][ds]) return;
      if (enTp[id] && enTp[id][ds]) return;          // jour de temps partiel accordé
      n++;
    });
    return n;
  }
  return { presents: presents, enGarde: enGarde, enRepos: enRepos, en18: en18, enTp: enTp,
           ids: ids, indispos: indispos,
           datesValides: new Set(datesI.filter(Boolean)) };
}

/* ── POSER LES TP D'UN MAR — le serveur juge, il ne croit pas l'écran ─────────
   L'écran calcule ses bandes depuis la copie rapide, qui peut retarder de
   quelques minutes : deux MAR peuvent voir le même jour vert. C'est donc ICI,
   au moment d'écrire, que chaque jour NOUVEAU est tranché, sur l'état réel du
   classeur :  il resterait ≥ 15 → TP validé · 13-14 → TPA (sous réserve) ·
   ≤ 12 → refusé. Un jour DÉJÀ posé est acquis, jamais re-jugé (« revenir sur
   un jour accordé serait pire que le problème »).
   Le rôle mar ne peut PAS transformer son TPA en TP (seul le comité valide) ;
   le rôle admin écrit ce qu'il envoie dans la famille TP/TPA, sans re-jugement :
   la décision du comité est souveraine et annulable.
   Une date absente de l'envoi = retrait (même sémantique que la campagne).
   Renvoie { success, resultat: {date: 'TP'|'TPA'|motif}, quota:{valides,total} } :
   c'est le récapitulatif que l'écran affiche à l'enregistrement. */
function _poserTp_(user, targetId, envoye, annee) {
  /* (23/08/2026 — refonte) LE TP S'ÉCRIT DANS GARDES, L'ONGLET MAÎTRE.
     INDISPOS n'est plus touché : il sert AVANT la génération, pas après.
     Une demande non tranchée n'écrit rien dans le planning — elle attend
     dans TP_DEMANDES. Le comité seul la transforme en TP.

     `envoye` est la photo complète de ce que l'écran croit : { date: 'TP' }.
     Ce qui n'y figure plus est retiré. */
  const estAdmin = user && user.role === 'admin';
  const M = _tpMondePresence_(annee);
  const jf = new Set(getJoursFeries(annee));
  const FERMES = _tpFermes_(annee);
  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const quotaTotal = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;

  /* Le profil d'abord : jours fixes convenus, rythme deux semaines sur deux,
     ou temps plein — ces trois-là n'ont rien à poser. L'écran ne leur montre
     pas la carte, mais l'adresse reste tapable : le serveur tranche. */
  if (_tpFixeDe_(targetId) || quotaTotal <= 0) {
    const refus = {};
    Object.keys(envoye || {}).forEach(function (ds) {
      refus[ds] = 'profil sans jours de temps partiel';
    });
    return { success: true, resultat: refus, annee: annee,
             quota: { valides: 0, total: quotaTotal } };
  }

  const grille = _tpGrilleLire_(annee, targetId);            // ce que dit le planning
  const enAttente = {};                                       // demandes non tranchées
  _tpDemandes_(annee, targetId).forEach(function (x) { enAttente[x.date] = true; });

  const resultat = {};
  let nbTP = 0, nbAttente = 0, grilleTouchee = false;

  // ── Passe 1 : l'ACQUIS et l'ATTENTE ──────────────────────────────────
  Object.keys(grille).forEach(function (ds) {
    if (grille[ds] !== 'TP') return;
    const passe = ds < aujourdHui;
    if (ds in (envoye || {}) || (passe && !estAdmin)) {
      resultat[ds] = 'TP'; nbTP++;                            // conservé (figé si passé)
      return;
    }
    if (_tpGrilleEcrire_(annee, targetId, ds, '')) grilleTouchee = true;
    /* (LOT A · 01/09/2026) Depuis que les TP se posent AUSSI pendant la
       campagne, un même jour peut exister à deux endroits : la case TP dans
       INDISPOS_{Y} (posée avant la génération) et sa recopie dans GARDES_{Y}
       (faite par le générateur). Retirer l'une sans l'autre les fait diverger —
       et le jour reviendrait à la moindre régénération. On retire les deux. */
    _tpRetirerDIndispos_(annee, targetId, ds);
    resultat[ds] = 'retiré';
  });
  Object.keys(enAttente).forEach(function (ds) {
    if (ds in (envoye || {})) { resultat[ds] = 'TPA'; nbAttente++; return; }
    _tpDemandeRetirer_(annee, ds, targetId);
    resultat[ds] = 'retiré';
  });

  // ── Passe 2 : les NOUVEAUTÉS, dans l'ordre du calendrier ─────────────
  const nouveaux = Object.keys(envoye || {})
    .filter(function (ds) { return grille[ds] !== 'TP' && !enAttente[ds]; })
    .sort();

  nouveaux.forEach(function (ds) {
    if (!M.datesValides.has(ds)) { resultat[ds] = 'hors année'; return; }
    if (ds < aujourdHui) { resultat[ds] = 'jour passé'; return; }
    if (FERMES.has(ds)) { resultat[ds] = 'jour fermé par le comité'; return; }
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) { resultat[ds] = 'week-end'; return; }
    if (jf.has(ds)) { resultat[ds] = 'jour férié'; return; }
    const occupe = grille[ds];
    if (occupe) { resultat[ds] = 'jour déjà ' + occupe; return; }

    const presents = M.presents(ds);
    const reste = presents - 1;
    if (reste <= 12) { resultat[ds] = 'équipe trop réduite (' + presents + ' présents)'; return; }
    if (reste < 15) {
      /* Bande jaune : le comité tranchera. Rien n'entre dans le planning,
         le MAR travaille tant qu'il n'a pas de réponse.
         (23/08/2026) PLAFOND : accordés + en attente ne dépassent jamais le
         quota. Sans ça, on pouvait poser 26 jours verts ET 10 demandes, et se
         retrouver à 36 si tout passait. */
      if (nbTP + nbAttente >= quotaTotal) {
        resultat[ds] = 'quota atteint (' + quotaTotal + ', demandes en attente comprises)';
        return;
      }
      _tpDemandeAjouter_(annee, ds, targetId);
      resultat[ds] = 'TPA';
      nbAttente++;
      return;
    }
    if (nbTP + nbAttente >= quotaTotal) {
      resultat[ds] = 'quota atteint (' + quotaTotal
                   + (nbAttente ? ', demandes en attente comprises' : '') + ')';
      return;
    }
    if (!_tpGrilleEcrire_(annee, targetId, ds, 'TP')) {
      resultat[ds] = 'la case vient d\'être occupée'; return;
    }
    grilleTouchee = true;
    nbTP++;
    resultat[ds] = 'TP';
  });

  if (grilleTouchee) _tpRepublier_(annee);

  logAction('poserTp ' + targetId + ' (' + annee + ') — ' + nbTP + '/' + quotaTotal
            + ' posés, ' + Object.keys(resultat).length + ' jours traités'
            + (grilleTouchee ? ', planning republié' : ''));

  return { success: true, resultat: resultat, annee: annee,
           quota: { valides: nbTP, attente: nbAttente, total: quotaTotal } };
}

function _tpGrilleEcrire_(annee, marId, ds, valeur) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + annee);
  if (!sh) return false;
  const d = sh.getDataRange().getValues();
  const col = buildDateToCol(d, annee)[ds];
  if (col === undefined) return false;
  let ligne = -1;
  for (var r = 3; r < d.length; r++) {
    if (String(d[r][0]).trim() === String(marId).trim()) { ligne = r; break; }
  }
  if (ligne < 0) return false;
  const actuel = String(d[ligne][col] || '').trim().toUpperCase();
  if (valeur === 'TP') {
    if (actuel !== '') return false;                 // occupé : on ne touche à rien
    sh.getRange(ligne + 1, col + 1).setValue('TP');
    return true;
  }
  if (actuel !== 'TP') return false;                 // rien à effacer
  sh.getRange(ligne + 1, col + 1).setValue('');
  return true;
}

/* Ce que la grille dit d'un MAR : { date: code } pour toute la ligne. */
function _tpGrilleLire_(annee, marId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + annee);
  const out = {};
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  const c2d = {};
  const dateToCol = buildDateToCol(d, annee);
  Object.keys(dateToCol).forEach(function (ds) { c2d[dateToCol[ds]] = ds; });
  for (var r = 3; r < d.length; r++) {
    if (String(d[r][0]).trim() !== String(marId).trim()) continue;
    for (var c = 1; c < d[r].length; c++) {
      const ds = c2d[c];
      const v = String(d[r][c] || '').trim().toUpperCase();
      if (ds && v) out[ds] = v;
    }
    break;
  }
  return out;
}

function _tpRepublier_(annee) {
  try {
    const props = PropertiesService.getScriptProperties();
    const verrou = LockService.getScriptLock();
    try { verrou.waitLock(5000); } catch (eL) { /* on note quand même */ }
    let file = [];
    try { file = JSON.parse(props.getProperty(TP_CLE_REPUBLIER) || '[]'); } catch (eP) { file = []; }
    const etaitVide = file.length === 0;
    if (file.indexOf(Number(annee)) === -1) file.push(Number(annee));
    props.setProperty(TP_CLE_REPUBLIER, JSON.stringify(file));
    try { verrou.releaseLock(); } catch (eR) {}
    /* (23/08/2026) Même piège que la copie rapide, corrigé de la même façon :
       la condition n'est pas « la file était vide » — une exécution morte
       avant purge la laisserait pleine à jamais — mais « aucun déclencheur
       n'existe ». C'est le seul fait qui compte. */
    const deja = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'tpRepublicationDifferee';
    });
    if (!deja) {
      try { ScriptApp.newTrigger('tpRepublicationDifferee').timeBased().after(1000).create(); } catch (eT) {}
    }
  } catch (e) {
    /* Dernier recours : republier tout de suite plutôt que pas du tout. */
    try { generatePlanning(annee); } catch (e2) {
      try { Logger.log('_tpRepublier_ : ' + e2.message); } catch (e3) {}
    }
  }
}

/* Exécuté par le déclencheur (~30-60 s après la note) : republie, se nettoie.
   Un échec n'est pas grave — la note reste, la prochaine décision réarmera. */
function tpRepublicationDifferee() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tpRepublicationDifferee') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  const props = PropertiesService.getScriptProperties();
  let file = [];
  try { file = JSON.parse(props.getProperty(TP_CLE_REPUBLIER) || '[]'); } catch (e) { file = []; }
  props.deleteProperty(TP_CLE_REPUBLIER);
  file.forEach(function (y) {
    try { generatePlanning(y); logAction('Planning ' + y + ' republié (temps partiels)'); }
    catch (e) { try { Logger.log('tpRepublicationDifferee ' + y + ' : ' + e.message); } catch (e2) {} }
  });
}

/* ── LE REGISTRE DES DEMANDES EN ATTENTE — onglet TP_DEMANDES ─────────────
   Une demande non tranchée n'écrit RIEN dans les onglets de planning : tant
   que le comité n'a pas dit oui, le MAR travaille. Elle vit donc ici, et
   seulement ici. Colonnes : ANNEE | DATE | MAR | QUAND. */
function _tpDemandesSheet_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('TP_DEMANDES');
  if (!sh && creer) {
    sh = ss.insertSheet('TP_DEMANDES');
    sh.getRange(1, 1, 1, 4).setValues([['ANNEE', 'DATE', 'MAR', 'QUAND']]);
  }
  return sh;
}

function _tpDemandes_(annee, marId) {
  const sh = _tpDemandesSheet_(false);
  const out = [];
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  for (var r = 1; r < d.length; r++) {
    if (Number(d[r][0]) !== Number(annee)) continue;
    const ds = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    const id = String(d[r][2]).trim();
    if (!ds || !id) continue;
    if (marId && id !== String(marId).trim()) continue;
    out.push({ date: ds, mar: id });
  }
  return out;
}

function _tpDemandeAjouter_(annee, ds, marId) {
  const sh = _tpDemandesSheet_(true);
  const deja = _tpDemandes_(annee, marId).some(function (x) { return x.date === ds; });
  if (deja) return;
  sh.appendRow([Number(annee), ds, String(marId), new Date().toISOString()]);
}

function _tpDemandeRetirer_(annee, ds, marId) {
  const sh = _tpDemandesSheet_(false);
  if (!sh) return;
  const d = sh.getDataRange().getValues();
  for (var r = d.length - 1; r >= 1; r--) {
    const dr = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (Number(d[r][0]) === Number(annee) && dr === ds
        && (!marId || String(d[r][2]).trim() === String(marId).trim())) {
      sh.deleteRow(r + 1);
    }
  }
}

/* Une notification ne fait JAMAIS échouer la décision qui la déclenche —
   règle du canal depuis le 12/08. `notifierPush_` avale déjà ses propres
   erreurs ; cette enveloppe protège aussi le cas où elle serait absente
   (miroir.gs non déployé) ou lèverait malgré tout. */
function _tpNotifier_(titre, corps, id) {
  try { notifierPush_(titre, corps, './indispos.html?tp=1', { id: String(id) }); }
  catch (e) { try { Logger.log('_tpNotifier_ : ' + e.message); } catch (e2) {} }
}

/* La date telle qu'on la dit : « jeudi 18 février ». Les notifications sont
   lues sur un écran verrouillé — « 2027-02-18 » n'y a pas sa place. */
function _tpJourLisible_(ds) {
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = new Date(ds + 'T12:00:00');
  if (isNaN(d.getTime())) return String(ds);
  return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
}

/* ── (LOT 4 · 22/08/2026) LES JOURS FERMÉS PAR LE COMITÉ — onglet TP_FERMES ──
   Un refus du comité ne vise pas UNE demande : il dit « ce jour-là, l'équipe
   est trop juste ». Le jour se ferme donc POUR TOUS : noir sur l'écran de
   pose, refusé par le serveur, et les demandes en attente ce jour-là sont
   rendues. Stockage : onglet TP_FERMES (ANNEE | DATE | PAR | QUAND), créé au
   premier refus — la liste voyage dans la clé pose_tp_{Y}. */
function _tpFermesSheet_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('TP_FERMES');
  if (!sh && creer) {
    sh = ss.insertSheet('TP_FERMES');
    sh.getRange(1, 1, 1, 4).setValues([['ANNEE', 'DATE', 'PAR', 'QUAND']]);
  }
  return sh;
}

function _tpFermes_(annee) {
  const sh = _tpFermesSheet_(false);
  const out = new Set();
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  for (var r = 1; r < d.length; r++) {
    if (Number(d[r][0]) !== Number(annee)) continue;
    const ds = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (ds) out.add(ds);
  }
  return out;
}

function _tpFermerJour_(annee, ds, par) {
  const sh = _tpFermesSheet_(true);
  if (_tpFermes_(annee).has(ds)) return;   // déjà fermé : idempotent
  sh.appendRow([Number(annee), ds, String(par || ''), new Date().toISOString()]);
}

function _tpRouvrirJour_(annee, ds) {
  const sh = _tpFermesSheet_(false);
  if (!sh) return;
  const d = sh.getDataRange().getValues();
  for (var r = d.length - 1; r >= 1; r--) {
    const dr = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (Number(d[r][0]) === Number(annee) && dr === ds) sh.deleteRow(r + 1);
  }
}

/* ── (LOT 3 · 22/08/2026) LA CLÉ DE L'ÉCRAN DE POSE — pose_tp_{Y} ─────────────
   Tout ce que l'écran affiche, en UNE lecture de la copie rapide :
     presents    : effectif présent par jour ouvré (anonyme — des NOMBRES,
                   jamais de noms : servi à tout MAR)
     joursFeries : les fériés de l'année (la clé joursferies_{Y} est réservée
                   au comité — l'écran MAR les reçoit donc ICI)
     parMar      : pour chaque MAR, SES blocages (codes INDISPOS + G/G2/RG/R
                   des gardes) et SON quota — le relais filtre à l'identité,
                   comme indispos_{Y}
   Année sans phase active → { ferme: true }, poussé tel quel : la clé
   s'auto-nettoie quand GARDES_{Y} est supprimé pour régénérer (l'écran voit
   « fermé », et le serveur refuse de toute façon).
   Servie par le relais (miroir.gs) ET par l'action getPoseTp (repli GAS). */
function _construirePoseTp_(annee) {
  const ph = _phaseTp_();
  if (!ph.actif || ph.annees.indexOf(Number(annee)) === -1) return { success: true, ferme: true, year: annee };
  const M = _tpMondePresence_(annee);
  const jf = getJoursFeries(annee);
  const jfSet = new Set(jf);
  const presents = {};
  M.datesValides.forEach(function (ds) {
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6 || jfSet.has(ds)) return;   // jamais posables : pas comptés
    presents[ds] = M.presents(ds);
  });
  const attentes = {};
  _tpDemandes_(annee).forEach(function (x) {
    (attentes[x.mar] = attentes[x.mar] || {})[x.date] = true;
  });
  const parMar = {};
  M.ids.forEach(function (id) {
    const jours = {};
    const mesInd = M.indispos[id] || {};
    Object.keys(mesInd).forEach(function (ds) {
      const v = String(mesInd[ds]).trim().toUpperCase();
      if (v === 'INDISPO' || v === 'SOUHAIT') return;   // vestiges de campagne : ne bloquent plus
      /* (LOT A · 01/09/2026) Un TP peut venir de la campagne (INDISPOS) : il
         n'est plus un vestige. On l'ignore ICI quand même, car le générateur
         l'a recopié dans GARDES — l'onglet maître, lu quelques lignes plus
         bas. Le prendre aux deux endroits le compterait deux fois. */
      if (v === 'TP' || v === 'TPA') return;
      jours[ds] = mesInd[ds];
    });
    Object.keys(M.en18[id] || {}).forEach(function (ds) { jours[ds] = '18'; });
    /* (23/08/2026) Le TP accordé vient de GARDES, l'onglet maître. Les demandes
       en attente ne sont écrites nulle part dans le planning : elles vivent
       dans TP_DEMANDES et n'apparaissent ici que pour l'affichage. */
    Object.keys(M.enTp[id] || {}).forEach(function (ds) { jours[ds] = 'TP'; });
    // Les gardes par-dessus : dans GARDES, RG écrase TP — même priorité ici,
    // le MAR voit la vérité du planning publié.
    Object.keys(M.enGarde[id] || {}).forEach(function (ds) { jours[ds] = M.enGarde[id][ds]; });
    Object.keys(M.enRepos[id] || {}).forEach(function (ds) { jours[ds] = M.enRepos[id][ds]; });
    Object.keys(attentes[id] || {}).forEach(function (ds) {
      if (!jours[ds]) jours[ds] = 'TPA';               // en attente : rien dans le planning
    });
    parMar[id] = {
      jours: jours,
      quota: getQuotasConges(_quotiteDe_(id)).ctp || 0,
      tpFixe: _tpFixeDe_(id),
    };
  });
  /* (CORRECTIF 23/08/2026) `getJoursFeries` renvoie un ENSEMBLE. Un ensemble
     mis en texte pour voyager jusqu'à la page devient {} — vide et non
     parcourable : l'écran plantait à l'ouverture. Tout ce qui part dans une
     clé doit être une LISTE ou un objet simple. */
  return { success: true, year: annee, presents: presents,
           joursFeries: Array.from(jf).sort(),
           fermes: Array.from(_tpFermes_(annee)).sort(), parMar: parMar };
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "deciderJourTpLot" ── */
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
function _act_deciderJourTpLot(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "deciderJourTp" ── */
function _act_deciderJourTp(R) {
  const { e, payload, action, code, user } = R;
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

/* ── action "getPoseTp" ── */
/* (LOT 3 · 22/08/2026) Repli GAS de la clé pose_tp_{Y} : même contenu,
   filtré à l'identité pour un rôle mar (le comité voit tout — écran du
   lot 4). Sert quand le relais est injoignable ou la clé pas encore
   poussée. Lecture seule, aucun verrou. */
function _act_getPoseTp(R) {
  const { e, payload, action, code, user } = R;
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
