/* ═══════════════════════════════════════════════════════════════════════
   TEMPS_PARTIEL — Temps partiel : pose, campagne, grille, décisions du comité, fermetures
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_TP = '2026-11-27.7';   // (27/11/2026) .7 : refus de vacances — le message dit quand les récupérations du jour ne suffisent pas (l'écran les compte présentes) · .6 : tpDemandesCaduques_ — une demande en attente dont le jour est pris (garde, repos, 18 h…) est retirée, le MAR prévenu · .5 : le lot de décisions appelle la décision directement (un seul verrou d'écriture, pris par le routeur) · .4 : janvier N+1 pour le comité (janvierSuivantCampagne_, _janvierSuivantDuComite_) · .3 : janvier N+1 posé pendant N (onglet JANVIER_SUIVANT) — pose libre et clé de pose · (27/11/2026) .2 : reliquatsCampagne_ — reliquats de l'équipe pour l'onglet Récap du comité · (27/11/2026) .1 : reliquatVacDe_ — le reliquat d'un MAR, pour la jauge du staff vacances · (26/11/2026) .3 : exception « toute l'année » du reliquat (ORIGINE de RELIQUATS, retour de congé long) — pose libre et clé de pose · (26/11/2026) .2 : reliquat de vacances de l'année précédente (onglet RELIQUATS, calcul automatique dès 2027) — les vacances de janvier le consomment d'abord : pose libre, clé de pose · (26/11/2026) .1 : LE TP ET LES VACANCES PASSENT AVANT LA RÉCUP DE SAMEDI — un jour qui n'est pas vert à cause de récups devient vert en les déplaçant (_tpLibererRecups_), à la pose d'un TP ou de vacances par le MAR comme à la validation du comité ; jamais une récup à moins de 30 jours ; le MAR concerné est prévenu ; l'écran de pose compte ces récups comme présentes (_tpRecupsCedables_) · (25/11/2026) .1 : POSE LIBRE DES VACANCES après la génération (_poserVac_) — jour vert seulement, 7 jours d'avance, quota de la quotité, jamais sur un jour occupé ; la clé de pose porte le quota de vacances et les jours fixes de chaque MAR ; toute republication différée (TP, vacances, décisions du comité) arme aussi les mails de changement, dont celui du secrétariat · (24/11/2026) .2 : un jour fermé par le comité se rouvre tout seul s'il redevient vert parce que l'équipe s'est étoffée depuis le refus ; les MAR refusés ce jour-là sont prévenus · (24/11/2026) .1 : effectif présent — une fois l'année générée, les absences (V, F, CL, CP, CTP, A) sont lues dans GARDES, plus dans INDISPOS (GARDES fait foi) ; VM/VA comptent présents · (17/11/2026) .2 : seuils de la pose lus dans l'onglet SEUILS (seuilsPresence_), envoyés à l'écran avec l'effectif · (17/11/2026) effectif présent : un MAR marqué HORS_EFFECTIF dans MEDECINS n'est plus compté (pose des TP, points à vérifier) · (16/11/2026) jour de TP dans sa semaine Réa 1 : non bloquant — semaine envoyée à l'écran (grisée, confirmation), signalée au MAR comme au comité · (12/11/2026) plus aucun nom de personne dans le code (effectif présent) · (10/11/2026) chaque jour de TP posé, retiré, demandé ou tranché laisse une ligne dans l'onglet HISTORIQUE

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
   « TOTAL PRESENTS » du planning du service) : tous les MAR actifs,
   bornés par date_debut/date_fin ; absent = VAC/FORM/CL/TP/CTP/CP/A lu dans
   GARDES_{Y} dès que l'année est générée (V/F/CL/CP/CTP/A — GARDES fait foi,
   24/11/2026 ; un RG écrit par-dessus reste une absence), dans INDISPOS_{Y}
   tant qu'elle ne l'est pas, semaine off du rythme 2/2, jour fixe tp_jours_fixes, et RG/R lus dans
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
    if (!id) continue;
    if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
    /* (17/11/2026) Hors effectif (colonne HORS_EFFECTIF, MEDECINS) : jamais compté
       parmi les présents — décision du responsable, « qu'on ait de la marge ». */
    if (FLAGS.horsEffectif && FLAGS.horsEffectif.has(id)) continue;
    ids.push(id);
  }
  /* (24/11/2026) UNE FOIS L'ANNÉE GÉNÉRÉE, GARDES FAIT FOI — règle du
     responsable. INDISPOS n'est plus modifié après la génération : il ne sert
     plus qu'à revoir la campagne. Les absences (V, F, CL, CP, CTP, A, VM, VA)
     sont donc lues dans GARDES_{Y}, traduites dans le vocabulaire d'INDISPOS
     (V → VAC, F → FORM) pour que les lecteurs de « indispos » ne changent pas.
     Constaté : en 2026, les absences n'existaient QUE dans GARDES_2026 (A, CL,
     F, CP) — la heatmap des Contrôles comptait presque tout le monde présent.
     VM / VA restent PRÉSENTS dans l'effectif (le MAR n'est simplement pas
     placé sur la demi-journée) ; tout autre code (E, I, B…) = présent.
     Année pas encore générée (pas d'onglet GARDES) : lecture d'INDISPOS, comme
     avant — c'est la campagne. Le TP n'entre pas dans « indispos » : il est
     dans enTp, lu plus bas (le compter deux fois serait faux). */
  const DE_GARDES = { V: 'VAC', F: 'FORM', CL: 'CL', CP: 'CP', CTP: 'CTP', A: 'A', VM: 'VM', VA: 'VA' };
  const indispos = {};
  const shG = ss.getSheetByName(`GARDES_${annee}`);
  let datesI = [];
  if (!shG) {
    const shI = ss.getSheetByName(`INDISPOS_${annee}`);
    const dI = shI ? shI.getDataRange().getValues() : [];
    datesI = dI.length ? reconstruireDatesHeaders(dI, annee) : [];
    for (let r = 3; r < dI.length; r++) {
      const id = String(dI[r][0]).trim(); if (!id) continue;
      indispos[id] = {};
      datesI.forEach((ds, i) => {
        if (!ds) return;
        const v = String(dI[r][i + 1] || '').trim().toUpperCase();
        if (v) indispos[id][ds] = v;
      });
    }
  }
  const enGarde = {}, enRepos = {}, en18 = {}, enTp = {};
  if (shG) {
    const dG = shG.getDataRange().getValues();
    const d2c = buildDateToCol(dG, annee);
    const c2d = {}; Object.keys(d2c).forEach(ds => { c2d[d2c[ds]] = ds; });
    datesI = Object.keys(d2c);                       // les jours de l'année : ceux du planning
    for (let r = 3; r < dG.length; r++) {
      const id = String(dG[r][0]).trim(); if (!id) continue;
      for (let c = 1; c < dG[0].length; c++) {
        const ds = c2d[c]; if (!ds) continue;
        const v = String(dG[r][c] || '').trim().toUpperCase();
        if (DE_GARDES[v]) { (indispos[id] = indispos[id] || {})[ds] = DE_GARDES[v]; continue; }
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

/* ── (26/11/2026) LE TP PASSE AVANT LA RÉCUP DE SAMEDI — décision du responsable ──
   « Si quelqu'un ne peut pas poser son TP à cause d'une récup, ce n'est pas
   normal. » Un jour qui n'est pas vert, et qui le deviendrait si une ou deux
   récupérations de samedi (R) de ce jour partaient ailleurs : les R partent,
   le TP passe. Garde-fous :
     · seulement si le déplacement rend le jour VERT (jamais pour passer de
       rouge à orange : on ne bouscule pas un collègue pour une demande que
       le comité pourrait refuser) ;
     · jamais une récup à moins de TP_RECUP_PREAVIS_JOURS jours (« pas au
       dernier moment : le MAR a pu prendre des rendez-vous ») ;
     · la nouvelle date suit les règles habituelles des récups (jour vert,
       lundi ou vendredi d'abord) — n'importe quel jour à venir, sans délai
       (choix du responsable) ; aucune date possible pour un R → rien ne
       bouge, le TP suit son chemin habituel (attente ou refus) ;
     · tout ou rien : on simule d'abord, on n'écrit que si chaque R a sa date.
   Le MAR dont la récup bouge est prévenu (jamais le nom du collègue). La
   republication est celle du TP (_tpRepublier_), pas une de plus.
   `manque` = postables à faire revenir. `M` (_tpMondePresence_) est tenu à
   jour : les jours suivants d'un même envoi voient les R déplacés.
   Renvoie la liste des déplacements, ou null si rien n'a bougé. */
const TP_RECUP_PREAVIS_JOURS = 30;
function _tpLibererRecups_(annee, ds, targetId, manque, M, par, motif) {
  const quoi = motif || 'temps partiel';
  if (!(manque > 0) || typeof _recupsContexte_ !== 'function') return null;
  let cx;
  try { cx = _recupsContexte_(annee); } catch (e) { return null; }
  if (ds < _recupsDecale_(cx.aujourdhui, TP_RECUP_PREAVIS_JOURS)) return null;   // trop proche : la récup reste
  const porteurs = cx.ids.filter(function (m) { return m !== targetId && _recupsCase_(cx, m, ds) === 'R'; });
  if (porteurs.length < manque) return null;
  // Le TP du demandeur compte déjà dans la simulation : un R ne revient pas rendre ce jour non vert.
  if (_recupsCase_(cx, targetId, ds) === '') _recupsEcrireCase_(cx, targetId, ds, 'TP', false);
  const plan = [];
  for (let i = 0; i < porteurs.length && plan.length < manque; i++) {
    const m = porteurs[i];
    // Case occupée par un marqueur neutre : le MAR compte présent ce jour-là et son R ne peut pas y revenir.
    _recupsEcrireCase_(cx, m, ds, 'X', false);
    const lien = cx.liens.find(function (x) { return x.med === m && x.dateR === ds; }) || null;
    const d = _recupsChoisir_(cx, m, lien ? lien.samedi : '');
    if (!d) { _recupsEcrireCase_(cx, m, ds, 'R', false); continue; }
    _recupsEcrireCase_(cx, m, d, 'R', false);
    plan.push({ med: m, samedi: lien ? lien.samedi : '', avant: ds, date: d, lien: lien });
  }
  if (plan.length < manque) return null;   // tout ou rien : rien n'a été écrit
  plan.forEach(function (p) {
    _recupsEcrireCase_(cx, p.med, p.avant, '', true);
    _recupsEcrireCase_(cx, p.med, p.date, 'R', true);
    if (p.lien) _recupsLier_(cx, p.lien.samedi, p.med, p.date, true);
    if (M && M.enRepos) {
      if (M.enRepos[p.med]) delete M.enRepos[p.med][p.avant];
      (M.enRepos[p.med] = M.enRepos[p.med] || {})[p.date] = 'R';
    }
  });
  try { (typeof historiser_ === 'function') && historiser_(plan.map(function (p) {
    return { annee: annee, quoi: 'récupération déplacée (' + quoi + ' d\'un collègue)', mar: p.med, jour: p.date, jour2: p.avant,
             autre: '', par: par || 'automatique', detail: (p.samedi ? 'samedi ' + p.samedi + ' — ' : '') + 'du ' + p.avant + ' au ' + p.date };
  })); } catch (eH) {}
  plan.forEach(function (p) {
    try { logAction('récups — déplacée pour un TP : ' + p.med + ' ' + p.avant + ' → ' + p.date + (p.samedi ? ' (samedi ' + p.samedi + ')' : '')); } catch (eL) {}
    try { notifierPush_('Récupération déplacée', 'Votre récupération' + (p.samedi ? ' du samedi ' + _echangesJoli_(p.samedi) : '')
      + ' passe du ' + _echangesJoli_(p.avant) + ' au ' + _echangesJoli_(p.date) + ' : un collègue prend un jour de ' + quoi + ' le '
      + _echangesJoli_(p.avant) + '.', './index.html', { id: p.med }); } catch (eN) {}
  });
  return plan;
}

/* (26/11/2026) Ce que voit l'écran de pose : un jour où des récups à plus de
   30 jours pourraient céder la place doit s'afficher avec elles COMPTÉES
   PRÉSENTES — sinon il paraît orange alors que le serveur l'accorderait
   (« le jour n'apparaîtra pas en vert », remarque du responsable). Même
   périmètre que la pose : MAR de l'effectif, récups (R) du jour. Le serveur
   reste juge : si une récup ne trouve aucune autre date, le jour suit la
   règle habituelle. */
function _tpRecupsCedables_(M, ds, auj) {
  if (!M || !M.enRepos || !auj) return 0;
  const d = new Date(auj + 'T12:00:00'); d.setDate(d.getDate() + TP_RECUP_PREAVIS_JOURS);
  const limite = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (ds < limite) return 0;
  let n = 0;
  (M.ids || []).forEach(function (id) { if (M.enRepos[id] && M.enRepos[id][ds] === 'R') n++; });
  return n;
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
  /* (23/08/2026 — refonte) LE TP S'ÉCRIT DANS GARDES, L'ONGLET MAÎTRE — récit : docs/JOURNAL-Planning-Med.md §156 */
  const estAdmin = user && user.role === 'admin';
  const M = _tpMondePresence_(annee);
  const jf = new Set(getJoursFeries(annee));
  const FERMES = _tpFermes_(annee);
  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const quotaTotal = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;
  const S = seuilsPresence_();   // (17/11/2026) mêmes seuils que tout le portail (onglet SEUILS)

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
  /* (16/11/2026 — décision du responsable, revue le jour même) SEMAINE RÉA 1 :
     un jour de TP dans SA semaine n'est PAS bloqué. L'écran grise la semaine
     (badge « RÉA 1 ») et demande confirmation avant de poser ; le serveur
     l'accepte et le signale (alertesRea1), pour le MAR comme pour le comité.
     Sans onglet REA1_{année} : rien ne change. */
  const rea1Moi = (typeof _rea1Jours_ === 'function' ? _rea1Jours_(annee)[targetId] : null) || {};
  const alertesRea1 = [];
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
    if (rea1Moi[ds]) alertesRea1.push(ds);

    let presents = M.presents(ds);
    let reste = presents - 1;
    /* (26/11/2026) Le TP passe avant la récup de samedi : si déplacer une ou
       deux récups rend le jour vert, elles partent (quota vérifié d'abord). */
    if (reste < S.confort && nbTP + nbAttente < quotaTotal && typeof _tpLibererRecups_ === 'function'
        && _tpLibererRecups_(annee, ds, targetId, S.confort - reste, M,
             estAdmin ? 'comité (' + (user.id || 'admin') + ')' : String((user && user.id) || targetId))) {
      presents = M.presents(ds); reste = presents - 1;
    }
    if (reste < S.alerte) { resultat[ds] = 'équipe trop réduite (' + presents + ' présents)'; return; }
    if (reste < S.confort) {
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

  /* (10/11/2026) HISTORIQUE : chaque jour qui change d'état, horodaté, avec
     l'auteur (le MAR lui-même, ou le comité pour lui). Les jours renvoyés
     tels quels (déjà acquis, déjà en attente) ne font pas de ligne. */
  { const par = estAdmin ? 'comité (' + (user.id || 'admin') + ')' : String((user && user.id) || targetId);
    const lignes = [];
    Object.keys(resultat).sort().forEach(function (ds) {
      const r = resultat[ds];
      if (r === 'TP' && grille[ds] !== 'TP') lignes.push({ quoi: 'TP posé', jour: ds });
      else if (r === 'TPA' && !enAttente[ds]) lignes.push({ quoi: 'TP demandé (sous réserve du comité)', jour: ds });
      else if (r === 'retiré') lignes.push({ quoi: grille[ds] === 'TP' ? 'TP retiré' : 'demande de TP retirée', jour: ds });
    });
    (typeof historiser_ === 'function') && historiser_(lignes.map(function (l) { return { annee: annee, quoi: l.quoi, mar: targetId, jour: l.jour, par: par,
      detail: nbTP + '/' + quotaTotal + ' posés après ce geste' }; })); }

  logAction('poserTp ' + targetId + ' (' + annee + ') — ' + nbTP + '/' + quotaTotal
            + ' posés, ' + Object.keys(resultat).length + ' jours traités'
            + (grilleTouchee ? ', planning republié' : ''));

  return { success: true, resultat: resultat, annee: annee,
           alertesRea1: alertesRea1.filter(function (ds) { return resultat[ds] === 'TP' || resultat[ds] === 'TPA'; }),
           quota: { valides: nbTP, attente: nbAttente, total: quotaTotal } };
}

/* ══ (25/11/2026) POSE LIBRE DES VACANCES — après la génération des gardes ══
   Décision du responsable (25/11/2026). Le staff vacances reste la pose
   initiale ; une fois l'année générée, chaque MAR ajoute, déplace ou retire
   lui-même ses jours de vacances. Règles, toutes tranchées ICI (l'écran ne fait
   que proposer, la copie rapide pouvant retarder) :
   · un jour NOUVEAU — ou une demi-journée qui devient une journée — se pose
     seulement s'il reste VERT : il resterait au moins le seuil de confort de
     l'onglet SEUILS (15). Pas de jaune, pas de demande au comité : hors vert,
     le MAR s'adresse aux admins ;
   · au moins VAC_PREAVIS_JOURS (7) jours à l'avance, pour poser comme pour
     retirer : le placement quotidien doit pouvoir suivre ;
   · jamais sur un jour déjà occupé : garde, repos de garde, 18 h, formation,
     temps partiel, récupération… (la garde se cède d'abord par un don) ;
   · dans le quota de vacances de sa quotité (CONFIG_CONGES), décompté comme le
     contrôle de l'admin : jour ouvré = 1, 24/12 et 31/12 = ½, VM ou VA = ½,
     jours fixes de temps partiel non comptés.
   Écrit dans GARDES (l'onglet maître). Un jour retiré ou changé l'est aussi
   d'INDISPOS, sinon le contrôle « Indispos ↔ planning » signalerait chaque
   jour déplacé. `envoye` = la photo COMPLÈTE des vacances voulues
   ({date: 'V'|'VM'|'VA'}) : une date absente est un retrait — même sémantique
   que la pose des TP. Renvoie le verdict jour par jour et l'état final. */
const VAC_PREAVIS_JOURS = 7;
const VAC_CODES_LIBRES = { V: true, VM: true, VA: true };
const VAC_LIBELLE_OCCUPE = { G: 'garde', G2: 'garde', RG: 'repos de garde', R: 'récupération', '18': '18 h',
  F: 'formation', TP: 'temps partiel', CTP: 'temps partiel', CL: 'congé long', CP: 'congé', A: 'absence' };

// L'horloge : isolée pour que le banc puisse la régler (infrastructure, pas de logique).
function _vacAujourdhui_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function _vacPlusJours_(ds, n) {
  const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  const p = x => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// Jours fixes de temps partiel d'un MAR (0 = dimanche), en LISTE : une clé de la copie rapide ne porte pas d'ensemble.
function _vacJoursFixes_(id) {
  try { const f = getMedecinFlags().tpJoursFixes[id]; return f ? Array.from(f).sort() : []; } catch (e) { return []; }
}
// Ce que coûte un code de vacances ce jour-là — même décompte que le contrôle « congés » de l'admin.
function _vacPoids_(code, ds, jf, fixes) {
  const w = new Date(ds + 'T12:00:00').getDay();
  if (w === 0 || w === 6 || jf.has(ds)) return 0;
  if (fixes && fixes.indexOf(w) !== -1) return 0;
  if (code === 'V') return /-12-(24|31)$/.test(ds) ? 0.5 : 1;
  if (code === 'VM' || code === 'VA') return 0.5;
  return 0;
}

/* ── (26/11/2026) LE RELIQUAT DE VACANCES DE L'ANNÉE PRÉCÉDENTE ────────────
   Règle légale (responsable, 21/10 et 26/11/2026) : les vacances de l'année N
   se posent jusqu'au 31/01/N+1. Les vacances posées du 1er au 31 janvier N+1
   sont prises D'ABORD sur ce qui reste de N ; le surplus compte sur N+1.
   Toujours à l'avantage du MAR : ce qui reste de N est perdu après le 31/01.
   Ce qui reste de N vient de :
   · une ligne de l'onglet RELIQUATS (MAR = ID ou initiales, ANNEE = N, JOURS).
     Elle gagne toujours : 2026 se saisit à la main (planning 2026 incomplet),
     et toute correction vérifiée avec le secrétariat s'y écrit ;
   · sinon, pour N ≥ RELIQUAT_AUTO_DEPUIS et tant que GARDES_N est au
     classeur : quota de la quotité − vacances posées sur l'année CIVILE N,
     même décompte que _vacPoids_. La clôture de N le recopie dans RELIQUATS
     avant de déplacer GARDES_N (_reliquatsFiger_) ;
   · sinon 0. */
const RELIQUAT_AUTO_DEPUIS = 2027;
const RELIQUATS_ONGLET = 'RELIQUATS';
const RELIQUATS_ENTETE = ['MAR', 'ANNEE', 'JOURS', 'ORIGINE'];
function _vacJanvier_(ds, annee) { return ds >= annee + '-01-01' && ds <= annee + '-01-31'; }
/* (26/11/2026) Exception décidée par le responsable : une ligne dont ORIGINE
   dit « toute l'année » (retour de congé long) vaut sur toute l'année N+1, pas
   seulement en janvier. Le jour ds peut-il être pris sur le reliquat ? */
const RELIQUAT_TOUTE_ANNEE = /toute\s+l.ann[ée]e/i;
function _vacSurReliquatPossible_(ds, annee, touteAnnee) {
  return touteAnnee ? String(ds).slice(0, 4) === String(annee) : _vacJanvier_(ds, annee);
}
// Les MAR dont la ligne saisie vaut toute l'année : { id: true }.
function reliquatsToutAnnee_(annee) {
  const out = {}, origine = Number(annee) - 1;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RELIQUATS_ONGLET);
  if (!sh) return out;
  const d = sh.getDataRange().getValues(), med = _medecinsRows_(), qui = {};
  for (let r = 1; r < med.length; r++) {
    const id = String(med[r][COL_MED.ID] || '').trim(); if (!id) continue;
    qui[id.toUpperCase()] = id;
    const ini = String(med[r][COL_MED.INITIALES] || '').trim().toUpperCase();
    if (ini && !qui[ini]) qui[ini] = id;
  }
  for (let r = 1; r < d.length; r++) {
    const id = qui[String(d[r][0] || '').trim().toUpperCase()];
    if (id && Number(d[r][1]) === origine && RELIQUAT_TOUTE_ANNEE.test(String(d[r][3] || ''))) out[id] = true;
  }
  return out;
}
// Ce qui est pris sur le reliquat : les jours de janvier, dans la limite du reliquat.
function _vacSurReliquat_(poidsJanvier, droit) { return Math.min(Math.max(0, Number(droit) || 0), Math.max(0, Number(poidsJanvier) || 0)); }
// Les lignes saisies de RELIQUATS pour l'année d'origine : { id: jours }.
function _reliquatsSaisis_(origine) {
  const out = {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RELIQUATS_ONGLET);
  if (!sh) return out;
  const d = sh.getDataRange().getValues(), med = _medecinsRows_(), qui = {};
  for (let r = 1; r < med.length; r++) {
    const id = String(med[r][COL_MED.ID] || '').trim(); if (!id) continue;
    qui[id.toUpperCase()] = id;
    const ini = String(med[r][COL_MED.INITIALES] || '').trim().toUpperCase();
    if (ini && !qui[ini]) qui[ini] = id;
  }
  for (let r = 1; r < d.length; r++) {
    const id = qui[String(d[r][0] || '').trim().toUpperCase()];
    if (!id || Number(d[r][1]) !== Number(origine)) continue;
    const brut = String(d[r][2] == null ? '' : d[r][2]).trim().replace(',', '.');
    const n = Number(brut);
    if (brut === '' || !isFinite(n) || n < 0) continue;
    out[id] = n;
  }
  return out;
}
// Calculé sur GARDES_{origine} : { id: jours } pour les MAR actifs, ou null sans l'onglet.
function _reliquatsCalcules_(origine) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GARDES_' + origine);
  if (!sh) return null;
  const d = sh.getDataRange().getValues(), d2c = buildDateToCol(d, origine);
  const jf = new Set(getJoursFeries(origine)), civil = String(origine);
  const cols = Object.keys(d2c).filter(function (ds) { return ds.slice(0, 4) === civil; });
  const poses = {};
  for (let r = 3; r < d.length; r++) {
    const id = String(d[r][0] || '').trim(); if (!id) continue;
    const fixes = _vacJoursFixes_(id);
    let n = 0;
    cols.forEach(function (ds) { n += _vacPoids_(String(d[r][d2c[ds]] || '').trim().toUpperCase(), ds, jf, fixes); });
    poses[id] = n;
  }
  const out = {}, med = _medecinsRows_();
  for (let r = 1; r < med.length; r++) {
    const id = String(med[r][COL_MED.ID] || '').trim(); if (!id) continue;
    if (String(med[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O' || poses[id] === undefined) continue;
    const q = Number(getQuotasConges(Number(med[r][COL_MED.QUOTITE]) || 100).vac) || 0;
    out[id] = Math.max(0, q - poses[id]);
  }
  return out;
}
// Ce qui reste de l'année annee−1, à poser en janvier annee : { id: jours }.
function reliquatsVac_(annee) {
  const origine = Number(annee) - 1;
  const calc = origine >= RELIQUAT_AUTO_DEPUIS ? (_reliquatsCalcules_(origine) || {}) : {};
  return Object.assign({}, calc, _reliquatsSaisis_(origine));
}
/* (27/11/2026) Le reliquat d'UN MAR pour l'année annee (écran du staff
   vacances : janvier N+1 s'y pose avant que les gardes N+1 existent). */
function reliquatVacDe_(id, annee) {
  return { annee: Number(annee) - 1, droit: Number(reliquatsVac_(annee)[id]) || 0, touteAnnee: !!reliquatsToutAnnee_(annee)[id] };
}
/* (27/11/2026) Les reliquats de toute l'équipe pour la campagne de saisie en
   cours (page du comité, onglet Récap) : { annee: N, campagne: N+1,
   parMar: { id: { droit, touteAnnee } } } — seuls les MAR qui en ont un. */
function reliquatsCampagne_() {
  const y = Number(getIndisposYear());
  const d = reliquatsVac_(y), t = reliquatsToutAnnee_(y), parMar = {};
  Object.keys(d).forEach(function (id) { if (Number(d[id]) > 0) parMar[id] = { droit: Number(d[id]), touteAnnee: !!t[id] }; });
  return { annee: y - 1, campagne: y, parMar: parMar };
}
/* ── (27/11/2026) JANVIER N+1 POSÉ PENDANT L'ANNÉE N ───────────────────────
   Règle légale : les vacances de N se posent jusqu'au 31/01/N+1. Tant que le
   planning N+1 n'existe pas (ni INDISPOS ni GARDES N+1), un jour de janvier
   N+1 n'a nulle part où s'écrire : il attend dans l'onglet JANVIER_SUIVANT
   (une ligne par jour) et compte sur le quota de N. Décisions du
   responsable (27/11/2026) : chaque MAR le pose lui-même après la génération
   des gardes N, sans contrôle des présents (hors vacances scolaires, peu de
   monde). À la préparation de N+1 (initYear), ces jours sont recopiés dans
   INDISPOS N+1 et retirés de l'onglet : ils deviennent des vacances de
   janvier N+1, prises d'abord sur le reliquat de N (calculé sans eux). */
const JANVIER_SUIVANT_ONGLET = 'JANVIER_SUIVANT';
const JANVIER_SUIVANT_ENTETE = ['MAR', 'DATE', 'CODE', 'ANNEE', 'POSE_LE', 'PAR'];
function _jsIso_(v) {
  if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  return String(v == null ? '' : v).trim().replace(/^'/, '').slice(0, 10);
}
// Ouvert tant que le planning N+1 n'existe pas encore.
function _janvierSuivantOuvert_(annee) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), n = Number(annee) + 1;
  return !ss.getSheetByName('INDISPOS_' + n) && !ss.getSheetByName('GARDES_' + n);
}
// Les jours de janvier N+1 hors de la grille N (datesValides : Set des jours de la grille N).
function _janvierSuivantDates_(annee, datesValides) {
  const out = [], n = Number(annee) + 1;
  for (let d = 1; d <= 31; d++) {
    const ds = n + '-01-' + String(d).padStart(2, '0');
    if (!datesValides || !datesValides.has(ds)) out.push(ds);
  }
  return out;
}
// Ce qui attend : { id: { ds: code } } (ou { ds: code } pour un MAR).
function _janvierSuivantLire_(annee, marId) {
  const out = {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JANVIER_SUIVANT_ONGLET);
  if (sh) {
    const d = sh.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      const id = String(d[r][0] || '').trim(), ds = _jsIso_(d[r][1]), c = String(d[r][2] || '').trim().toUpperCase();
      if (!id || !ds || !VAC_CODES_LIBRES[c] || Number(d[r][3]) !== Number(annee)) continue;
      (out[id] = out[id] || {})[ds] = c;
    }
  }
  return marId === undefined ? out : (out[String(marId).trim()] || {});
}
/* Écrit les changements d'un MAR ({ ds, avant, apres }) : une ligne par jour,
   effacée quand le jour est retiré. Renvoie l'ensemble des jours faits. */
function _janvierSuivantEcrire_(annee, marId, ecritures, par) {
  const faits = new Set();
  if (!ecritures || !ecritures.length) return faits;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(JANVIER_SUIVANT_ONGLET);
  if (!sh) { sh = ss.insertSheet(JANVIER_SUIVANT_ONGLET); sh.appendRow(JANVIER_SUIVANT_ENTETE); }
  const id = String(marId).trim();
  ecritures.forEach(function (x) {
    const d = sh.getDataRange().getValues();
    let ligne = -1;
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][0] || '').trim() === id && _jsIso_(d[r][1]) === x.ds && Number(d[r][3]) === Number(annee)) { ligne = r + 1; break; }
    }
    const actuel = ligne > 0 ? String(d[ligne - 1][2] || '').trim().toUpperCase() : '';
    if (actuel !== (x.avant || '')) return;              // la case a changé entre-temps : rien n'est fait
    if (!x.apres) { if (ligne > 0) sh.deleteRow(ligne); }
    else if (ligne > 0) sh.getRange(ligne, 3).setValue(x.apres);
    else sh.appendRow([id, "'" + x.ds, x.apres, Number(annee), new Date(), String(par || id)]);
    faits.add(x.ds);
  });
  return faits;
}
/* À la création d'INDISPOS N+1 (initYear) : recopie les jours en attente de
   l'année N (= newYear − 1) dans la grille et les retire de l'onglet. ecrire(id,
   ds, code) écrit une case d'INDISPOS et renvoie vrai si la case existe.
   Renvoie le nombre de jours recopiés. */
function _janvierSuivantTransferer_(newYear, ecrire) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JANVIER_SUIVANT_ONGLET);
  if (!sh) return 0;
  const d = sh.getDataRange().getValues(), aSupprimer = [];
  const CODE_IND = { V: 'VAC', VM: 'VM', VA: 'VA' };
  for (let r = 1; r < d.length; r++) {
    const id = String(d[r][0] || '').trim(), ds = _jsIso_(d[r][1]), c = String(d[r][2] || '').trim().toUpperCase();
    if (Number(d[r][3]) !== Number(newYear) - 1 || !id || !CODE_IND[c]) continue;
    if (ecrire(id, ds, CODE_IND[c])) aSupprimer.push(r + 1);
  }
  aSupprimer.reverse().forEach(function (l) { sh.deleteRow(l); });
  return aSupprimer.length;
}

/* (27/11/2026) Pour la page du comité (staff.html) : janvier N+1 de la
   campagne de saisie N, et ce qui y attend déjà. */
function janvierSuivantCampagne_() {
  const y = Number(getIndisposYear());
  if (!_janvierSuivantOuvert_(y)) return { annee: y, ouvert: false };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INDISPOS_' + y);
  const valides = sh ? new Set(reconstruireDatesHeaders(sh.getDataRange().getValues(), y).filter(Boolean)) : null;
  return { annee: y, ouvert: true, jours: _janvierSuivantDates_(y, valides),
           feries: Array.from(getJoursFeries(y + 1)).filter(function (d) { return d.slice(5, 7) === '01'; }).sort(),
           parMar: _janvierSuivantLire_(y) };
}
/* (27/11/2026) Enregistrement du comité (saveIndisposBatch) : pour chaque MAR
   envoyé, ses journées de vacances de janvier N+1 (hors grille) deviennent
   exactement celles envoyées ; les demi-journées en attente ne bougent pas. */
function _janvierSuivantDuComite_(annee, envoi, datesGrille, par) {
  if (!_janvierSuivantOuvert_(annee)) return 0;
  const jours = new Set(_janvierSuivantDates_(annee, datesGrille));
  const attente = _janvierSuivantLire_(annee), JF = getJoursFeries(Number(annee) + 1);
  let n = 0;
  Object.keys(envoi || {}).forEach(function (marId) {
    const id = String(marId).trim(), voulu = envoi[marId] || {}, a = attente[id] || {}, ecr = [];
    jours.forEach(function (ds) {
      const w = new Date(ds + 'T12:00:00').getDay();
      const veut = voulu[ds] === 'VAC' && w !== 0 && w !== 6 && !JF.has(ds);
      if (veut && !a[ds]) ecr.push({ ds: ds, avant: '', apres: 'V' });
      else if (!veut && a[ds] === 'V') ecr.push({ ds: ds, avant: 'V', apres: '' });
    });
    n += _janvierSuivantEcrire_(annee, id, ecr, par).size;
  });
  return n;
}
/* Clôture de N : recopie dans RELIQUATS le reliquat calculé de chaque MAR qui
   n'a pas déjà sa ligne (une ligne saisie n'est jamais écrasée). Relançable
   sans doublon. Renvoie un texte pour le compte rendu. */
function _reliquatsFiger_(origine) {
  origine = Number(origine);
  if (origine < RELIQUAT_AUTO_DEPUIS) return 'saisi à la main dans ' + RELIQUATS_ONGLET + ' (rien à calculer pour ' + origine + ')';
  const calc = _reliquatsCalcules_(origine);
  if (!calc) return 'GARDES_' + origine + ' absent : rien à figer';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(RELIQUATS_ONGLET);
  if (!sh) { sh = ss.insertSheet(RELIQUATS_ONGLET); sh.appendRow(RELIQUATS_ENTETE); }
  const deja = _reliquatsSaisis_(origine);
  let n = 0;
  Object.keys(calc).sort().forEach(function (id) {
    if (deja[id] !== undefined) return;
    sh.appendRow([id, origine, calc[id], 'calculé à la clôture']);
    n++;
  });
  return n + ' ligne(s) ' + origine + ' écrite(s) dans ' + RELIQUATS_ONGLET + ' — à vérifier avec le secrétariat';
}
/* Écrit plusieurs cases d'une ligne de GARDES en UNE lecture. Chaque écriture
   n'a lieu que si la case contient encore ce qu'on y a lu (`avant`) : un
   collègue ou le comité qui l'aurait changée entre-temps n'est jamais écrasé.
   Renvoie l'ensemble des dates réellement écrites. */
function _vacGrilleEcrire_(annee, marId, ecritures) {
  const faits = new Set();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GARDES_' + annee);
  if (!sh || !ecritures.length) return faits;
  const d = sh.getDataRange().getValues();
  const d2c = buildDateToCol(d, annee);
  let ligne = -1;
  for (let r = 3; r < d.length; r++) { if (String(d[r][0]).trim() === String(marId).trim()) { ligne = r; break; } }
  if (ligne < 0) return faits;
  ecritures.forEach(function (x) {
    const col = d2c[x.ds];
    if (col === undefined) return;
    const actuel = String(d[ligne][col] || '').trim().toUpperCase();
    if (actuel !== String(x.avant || '')) return;
    sh.getRange(ligne + 1, col + 1).setValue(x.apres);
    faits.add(x.ds);
  });
  return faits;
}
// Retire un code de vacances d'INDISPOS (le jour a changé dans GARDES, qui fait foi).
function _vacRetirerDIndispos_(annee, marId, ds) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INDISPOS_' + annee);
    if (!sh) return false;
    const d = sh.getDataRange().getValues();
    const col = reconstruireDatesHeaders(d, annee).indexOf(ds);
    if (col < 0) return false;
    for (let r = 3; r < d.length; r++) {
      if (String(d[r][0]).trim() !== String(marId).trim()) continue;
      const v = String(d[r][col + 1] || '').trim().toUpperCase();
      if (v !== 'VAC' && v !== 'V' && v !== 'VM' && v !== 'VA') return false;
      sh.getRange(r + 1, col + 2).setValue('');
      return true;
    }
  } catch (e) { logAction('_vacRetirerDIndispos_ ' + marId + ' ' + ds + ' : ' + e.message); }
  return false;
}

function _poserVac_(user, targetId, envoye, annee) {
  const estAdmin = user && user.role === 'admin';
  const M = _tpMondePresence_(annee);
  const jf = new Set(getJoursFeries(annee));
  const S = seuilsPresence_();
  const auj = _vacAujourdhui_();
  const limite = _vacPlusJours_(auj, VAC_PREAVIS_JOURS);   // premier jour encore modifiable
  const quota = Number(getQuotasConges(_quotiteDe_(targetId)).vac) || 0;
  const fixes = _vacJoursFixes_(targetId);
  const grille = _tpGrilleLire_(annee, targetId);
  /* (27/11/2026) Janvier N+1 : tant que le planning N+1 n'existe pas, ses
     jours (hors grille N) se posent ici, comptés sur le quota de N, sans
     contrôle des présents (décision du responsable). */
  const jsuiv = _janvierSuivantOuvert_(annee) ? new Set(_janvierSuivantDates_(annee, M.datesValides)) : new Set();
  if (jsuiv.size) {
    getJoursFeries(Number(annee) + 1).forEach(function (d) { jf.add(d); });
    const attente = _janvierSuivantLire_(annee, targetId);
    Object.keys(attente).forEach(function (ds) { if (jsuiv.has(ds)) grille[ds] = attente[ds]; });
  }
  const par = estAdmin ? 'comité (' + (user.id || 'admin') + ')' : String((user && user.id) || targetId);
  const voulu = {};
  Object.keys(envoye || {}).forEach(function (ds) {
    const c = String(envoye[ds] || '').trim().toUpperCase();
    if (VAC_CODES_LIBRES[c]) voulu[ds] = c;
  });
  const resultat = {}, ecritures = [], final = {};
  let total = 0;
  /* (26/11/2026) Le reliquat de l'année précédente : les jours de janvier
     sont pris dessus d'abord, le surplus compte sur l'année (règle légale). */
  const reliquat = Number(reliquatsVac_(annee)[targetId]) || 0;
  const touteAnnee = !!reliquatsToutAnnee_(annee)[targetId];   // exception « toute l'année » (retour de congé long)
  const imputable = function (ds) { return _vacSurReliquatPossible_(ds, annee, touteAnnee); };
  let janvier = 0;
  const ajoute = function (c, ds, s) {
    const p = _vacPoids_(c, ds, jf, fixes) * s;
    total += p; if (imputable(ds)) janvier += p;
  };
  const surAnnee = function () { return total - _vacSurReliquat_(janvier, reliquat); };
  const depasse = function (c, ds) {
    const p = _vacPoids_(c, ds, jf, fixes);
    return total + p - _vacSurReliquat_(janvier + (imputable(ds) ? p : 0), reliquat) > quota;
  };

  // ── Passe 1 : les vacances DÉJÀ au planning ─────────────────────────────
  Object.keys(grille).forEach(function (ds) {
    const c = grille[ds];
    if (!VAC_CODES_LIBRES[c]) return;
    const v = voulu[ds];
    if (v === c) { ajoute(c, ds, 1); final[ds] = c; return; }
    if (ds < limite) {
      /* Figé : passé ou à moins de 7 jours. Il reste tel quel ; si l'écran
         demandait autre chose, le récapitulatif le dit. */
      ajoute(c, ds, 1); final[ds] = c;
      resultat[ds] = 'moins de ' + VAC_PREAVIS_JOURS + ' jours : demandez aux admins';
      return;
    }
    if (!v) { ecritures.push({ ds: ds, avant: c, apres: '' }); resultat[ds] = 'retiré'; }
    // v différent de c : changement de type, jugé en passe 2.
  });

  // ── Passe 2 : les nouveautés et les changements, dans l'ordre du calendrier ──
  Object.keys(voulu).sort().forEach(function (ds) {
    const v = voulu[ds], c = VAC_CODES_LIBRES[grille[ds]] ? grille[ds] : '';
    if (c === v || (c && ds < limite)) return;              // conservé (passe 1)
    if (!M.datesValides.has(ds) && !jsuiv.has(ds)) { resultat[ds] = 'hors année'; return; }
    if (ds < limite) { resultat[ds] = 'moins de ' + VAC_PREAVIS_JOURS + ' jours : demandez aux admins'; return; }
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) { resultat[ds] = 'week-end'; return; }
    if (jf.has(ds)) { resultat[ds] = 'jour férié'; return; }
    if (!c && grille[ds]) { resultat[ds] = 'jour déjà pris : ' + (VAC_LIBELLE_OCCUPE[grille[ds]] || grille[ds]); return; }
    /* Le jour doit être VERT : tout jour nouveau (journée ou demi-journée —
       règle du responsable, « vert obligatoirement »), et la demi-journée qui
       devient journée. Une journée qui devient demi-journée, ou matin ↔
       après-midi, ne retire personne : pas de nouveau jugement. */
    const exigeVert = !jsuiv.has(ds) && (!c || (v === 'V' && c !== 'V'));   // janvier N+1 : sans contrôle des présents
    if (exigeVert) {
      let reste = M.presents(ds) - 1;
      /* (26/11/2026) Les vacances passent avant la récup de samedi, comme le
         TP : si déplacer des récups rend le jour vert, elles partent (quota
         vérifié d'abord, jamais une récup à moins de 30 jours). */
      if (reste < S.confort && !depasse(v, ds) && typeof _tpLibererRecups_ === 'function'
          && _tpLibererRecups_(annee, ds, targetId, S.confort - reste, M,
               estAdmin ? 'comité (' + (user.id || 'admin') + ')' : String((user && user.id) || targetId), 'vacances')) {
        reste = M.presents(ds) - 1;
      }
      if (reste < S.confort) {
        if (c) { final[ds] = c; ajoute(c, ds, 1); }   // le changement refusé laisse le jour tel quel
        /* (27/11/2026) L'écran compte présentes les récups de samedi à plus de 30 jours : il peut
           donc afficher le jour en vert alors que le serveur refuse (pas assez de récups, ou
           aucune autre date pour elles). Le refus le dit, au lieu d'un chiffre qui contredit l'écran. */
        const _ced = typeof _tpRecupsCedables_ === 'function' ? _tpRecupsCedables_(M, ds, auj) : 0;
        resultat[ds] = 'il resterait ' + reste + ' présents (moins de ' + S.confort + ')'
          + (_ced > 0 ? ', les récupérations de ce jour ne suffisent pas à libérer la place' : '') + ' : demandez aux admins';
        return;
      }
    }
    if (depasse(v, ds)) {
      if (c) { final[ds] = c; ajoute(c, ds, 1); }   // le changement refusé laisse le jour tel quel
      resultat[ds] = 'quota atteint (' + String(quota).replace('.', ',') + ' jours)';
      return;
    }
    ecritures.push({ ds: ds, avant: c, apres: v });
    ajoute(v, ds, 1); final[ds] = v; resultat[ds] = v;
  });

  // ── Écriture : une lecture de GARDES, chaque case vérifiée avant d'écrire ──
  const faits = _vacGrilleEcrire_(annee, targetId, ecritures.filter(function (x) { return !jsuiv.has(x.ds); }));
  _janvierSuivantEcrire_(annee, targetId, ecritures.filter(function (x) { return jsuiv.has(x.ds); }), par)
    .forEach(function (ds) { faits.add(ds); });
  ecritures.forEach(function (x) {
    if (faits.has(x.ds)) {
      if (x.avant && !jsuiv.has(x.ds)) _vacRetirerDIndispos_(annee, targetId, x.ds);
      return;
    }
    // La case a changé entre la lecture et l'écriture : rien n'est fait, on le dit.
    resultat[x.ds] = 'la case vient de changer : réessayez';
    if (x.apres) { delete final[x.ds]; ajoute(x.apres, x.ds, -1); }
    if (x.avant) { final[x.ds] = x.avant; ajoute(x.avant, x.ds, 1); }
  });
  if (faits.size) _tpRepublier_(annee);

  /* HISTORIQUE : chaque jour qui change, horodaté, avec l'auteur. */
  { const LIB = { V: 'vacances posées', VM: 'demi-journée de vacances posée (matin)', VA: 'demi-journée de vacances posée (après-midi)' };
    const lignes = [];
    ecritures.forEach(function (x) {
      if (!faits.has(x.ds)) return;
      lignes.push({ annee: annee, quoi: x.apres ? LIB[x.apres] : 'vacances retirées', mar: targetId, jour: x.ds, par: par,
                    detail: String(surAnnee()).replace('.', ',') + '/' + String(quota).replace('.', ',') + ' jours posés après ce geste' });
    });
    (typeof historiser_ === 'function') && historiser_(lignes); }

  logAction('poserVac ' + targetId + ' (' + annee + ') — ' + faits.size + ' jour(s) écrit(s), '
            + String(surAnnee()).replace('.', ',') + '/' + quota + ' posés'
            + (reliquat ? ' (+ ' + String(_vacSurReliquat_(janvier, reliquat)).replace('.', ',') + '/' + reliquat + ' sur ' + (annee - 1) + ')' : ''));
  return { success: true, annee: annee, resultat: resultat, jours: final,
           quota: { poses: surAnnee(), total: quota,
                    reliquat: { annee: annee - 1, droit: reliquat, pris: _vacSurReliquat_(janvier, reliquat), touteAnnee: touteAnnee } }, preavis: VAC_PREAVIS_JOURS };
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
    try {
      generatePlanning(y); logAction('Planning ' + y + ' republié (temps partiels, vacances)');
      /* (25/11/2026) Les mails de changement (dont celui du secrétariat, qui
         saisit les absences) partaient seulement après une publication du
         comité ou un échange : un TP ou des vacances posés par le MAR
         attendaient la publication suivante. Même minuteur que le reste. */
      try { if (typeof notifPlanifier === 'function') notifPlanifier(y); } catch (eN) { logAction('notifPlanifier ' + y + ' : ' + eN.message); }
    }
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

/* ═══ (27/11/2026) DEMANDE DE TEMPS PARTIEL DEVENUE SANS OBJET ═════════════
   DÉFAUT TROUVÉ AUX SCÉNARIOS DE VIE RÉELLE : un MAR a un jour « sous réserve »
   (demande en attente du comité), puis prend une garde ce jour-là. La demande
   restait : « Valider » répondait « la case n'est plus libre », et la seule
   autre réponse, « Refuser », fermait le jour pour toute l'équipe et rendait
   aussi la demande d'un collègue étranger à l'affaire.
   Décision du responsable : la demande disparaît toute seule. Toute demande dont
   la case du planning n'est plus vide est retirée, tracée, et le MAR prévenu.
   Appelée après un don ou un échange accepté, et au passage horaire. */
function tpDemandesCaduques_(annee) {
  const retirees = [];
  let dem = [];
  try { dem = _tpDemandes_(annee); } catch (e) { return retirees; }
  if (!dem.length) return retirees;
  const LIB = { G: 'de garde', G2: 'de garde', RG: 'en repos de garde', '18': 'de 18 h', R: 'en récupération', V: 'en vacances', VM: 'en vacances', VA: 'en vacances', F: 'en formation', CL: 'en congé', TP: 'déjà en temps partiel' };
  const grilles = {};
  dem.forEach(function (x) {
    const mar = String(x.mar), ds = String(x.date);
    if (!(mar in grilles)) { try { grilles[mar] = _tpGrilleLire_(annee, mar); } catch (e) { grilles[mar] = null; } }
    if (!grilles[mar]) return;
    const code = String(grilles[mar][ds] || '').trim().toUpperCase().replace(/\.0$/, '');
    if (!code) return;                                   // la case est libre : la demande attend toujours le comité
    _tpDemandeRetirer_(annee, ds, mar);
    retirees.push({ mar: mar, date: ds, code: code });
    try { logAction('TP — demande du ' + ds + ' (' + annee + ') de ' + mar + ' retirée : case occupée (' + code + ')'); } catch (e) {}
    try { (typeof historiser_ === 'function') && historiser_([{ annee: annee, quoi: 'Demande de TP retirée (jour pris : ' + code + ')', mar: mar, jour: ds, par: 'automatique' }]); } catch (e) {}
    _tpNotifier_('Temps partiel : demande retirée',
      'Votre demande du ' + _tpJourLisible_(ds) + ' est retirée : vous êtes ' + (LIB[code] || 'occupé') + ' ce jour-là.', mar);
  });
  return retirees;
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
   rendues. Stockage : onglet TP_FERMES (ANNEE | DATE | PAR | QUAND | MARS |
   EFFECTIF), créé au premier refus — la liste voyage dans la clé pose_tp_{Y}.
   (24/11/2026) MARS = ceux dont la demande a été refusée, EFFECTIF = les
   présents au moment du refus : de quoi rouvrir le jour s'il se libère
   (_tpRouvrirSiLibere_). */
function _tpFermesEntete_() { return ['ANNEE', 'DATE', 'PAR', 'QUAND', 'MARS', 'EFFECTIF']; }
function _tpFermesSheet_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('TP_FERMES');
  if (!sh && creer) {
    sh = ss.insertSheet('TP_FERMES');
    sh.getRange(1, 1, 1, _tpFermesEntete_().length).setValues([_tpFermesEntete_()]);
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

function _tpFermerJour_(annee, ds, par, mars, effectif) {
  const sh = _tpFermesSheet_(true);
  if (_tpFermes_(annee).has(ds)) return;   // déjà fermé : idempotent
  /* Onglet créé avant le 24/11/2026 : 4 colonnes d'en-tête, on complète. */
  try {
    const ent = sh.getRange(1, 1, 1, _tpFermesEntete_().length).getValues()[0];
    if (String(ent[4] || '') === '' || String(ent[5] || '') === '') sh.getRange(1, 1, 1, _tpFermesEntete_().length).setValues([_tpFermesEntete_()]);
  } catch (eE) {}
  const eff = (typeof effectif === 'number' && isFinite(effectif)) ? effectif : '';
  sh.appendRow([Number(annee), ds, String(par || ''), new Date().toISOString(), (mars || []).join(','), eff]);
}

/* ── (24/11/2026) RÉOUVERTURE AUTOMATIQUE D'UN JOUR FERMÉ — décision du responsable ──
   Le comité refuse un jour limite (jaune). Si, dans les semaines qui suivent,
   des collègues libèrent ce jour (vacances retirées, formation annulée…) et
   qu'il redevient VERT, la raison du refus a disparu : le jour se rouvre seul,
   et ceux dont la demande avait été refusée reçoivent une notification. Leur
   demande n'est PAS remise en attente d'office : à eux de reposer le jour.
   Deux conditions, toutes deux nécessaires :
     · le jour est vert — il resterait au moins le seuil « confort » après un TP ;
     · l'effectif a MONTÉ depuis le refus. Un refus posé sur un jour déjà vert
       (refus délibéré du comité) n'est donc jamais défait par la machine.
   Une ligne sans effectif enregistré (fermeture d'avant ce correctif) ne
   rouvre jamais seule. Jour passé : on n'y touche plus.
   Appelée à chaque construction de la clé de l'écran de pose — c'est-à-dire
   après toute modification du planning ou des indisponibilités. */
function _tpRouvrirSiLibere_(annee, presents) {
  const rouverts = [];
  const sh = _tpFermesSheet_(false);
  if (!sh) return rouverts;
  const S = seuilsPresence_();
  let auj;
  try { auj = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
  catch (eD) { auj = new Date().toISOString().slice(0, 10); }
  let verrou = null;
  try { verrou = LockService.getScriptLock(); verrou.waitLock(5000); } catch (eL) { verrou = null; }
  try {
    const d = sh.getDataRange().getValues();
    for (var r = d.length - 1; r >= 1; r--) {
      if (Number(d[r][0]) !== Number(annee)) continue;
      const ds = d[r][1] instanceof Date
        ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(d[r][1]).trim();
      if (!ds || ds < auj) continue;
      const effRefus = d[r][5];
      if (effRefus === '' || effRefus === null || effRefus === undefined || !isFinite(Number(effRefus))) continue;
      const p = presents[ds];
      if (p === undefined) continue;
      if (p - 1 < S.confort) continue;              // pas vert : le refus tient
      if (p <= Number(effRefus)) continue;          // rien ne s'est libéré depuis le refus
      sh.deleteRow(r + 1);
      const mars = String(d[r][4] || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      rouverts.push({ date: ds, mars: mars, avant: Number(effRefus), maintenant: p });
    }
  } finally {
    try { if (verrou) verrou.releaseLock(); } catch (eR) {}
  }
  rouverts.forEach(function (x) {
    try { logAction('TP jour rouvert automatiquement ' + x.date + ' (' + annee + ') — ' + x.avant + ' → ' + x.maintenant + ' présents ; prévenus : ' + (x.mars.join(', ') || 'personne')); } catch (eA) {}
    (typeof historiser_ === 'function') && historiser_([{ annee: annee, quoi: 'jour rouvert au TP automatiquement (équipe redevenue suffisante)', jour: x.date, par: 'automatique',
      detail: x.avant + ' → ' + x.maintenant + ' présents ; prévenus : ' + (x.mars.join(', ') || 'aucun') }]);
    x.mars.forEach(function (idR) {
      _tpNotifier_('Temps partiel : jour de nouveau ouvert',
        'Le ' + _tpJourLisible_(x.date) + ' est de nouveau ouvert au temps partiel : l\'équipe est redevenue suffisante. Vous pouvez le redemander.', idR);
    });
  });
  return rouverts;
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
  /* (24/11/2026) Un jour fermé redevenu vert se rouvre ici, avant que la liste
     des fermés ne parte vers l'écran. Jamais bloquant pour la construction.
     Il juge sur l'effectif RÉEL (comparé à l'effectif du refus). */
  try { _tpRouvrirSiLibere_(annee, presents); }
  catch (eRo) { try { Logger.log('_tpRouvrirSiLibere_ : ' + eRo.message); } catch (e2) {} }
  /* (26/11/2026) L'écran, lui, compte présentes les récups qui céderaient la
     place à un TP ou à des vacances (_tpRecupsCedables_) : il colore comme
     le serveur tranchera. */
  let aujP;
  try { aujP = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
  catch (eD) { aujP = new Date().toISOString().slice(0, 10); }
  if (typeof _tpRecupsCedables_ === 'function') Object.keys(presents).forEach(function (ds) { presents[ds] += _tpRecupsCedables_(M, ds, aujP); });
  const attentes = {};
  _tpDemandes_(annee).forEach(function (x) {
    (attentes[x.mar] = attentes[x.mar] || {})[x.date] = true;
  });
  const parMar = {};
  const rea1 = typeof _rea1Jours_ === 'function' ? _rea1Jours_(annee) : {};
  const reliquats = reliquatsVac_(annee);   // (26/11/2026) ce qui reste de l'année précédente, à poser en janvier
  const relToutAn = reliquatsToutAnnee_(annee);   // …ou sur toute l'année (exception)
  // (27/11/2026) Janvier N+1 en attente (planning N+1 pas encore créé) : affiché avec les jours de N.
  const jsOuvert = _janvierSuivantOuvert_(annee);
  const jsAttente = jsOuvert ? _janvierSuivantLire_(annee) : {};
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
    Object.keys(jsAttente[id] || {}).forEach(function (ds) { if (!jours[ds]) jours[ds] = jsAttente[id][ds]; });
    parMar[id] = {
      /* (16/11/2026) Sa semaine Réa 1 (lundi → vendredi) : l'écran la grise et
         demande confirmation. Voyage filtrée à l'identité, comme le reste. */
      rea1: Object.keys((rea1 && rea1[id]) || {}).sort(),
      jours: jours,
      quota: getQuotasConges(_quotiteDe_(id)).ctp || 0,
      tpFixe: _tpFixeDe_(id),
      /* (25/11/2026) Pose libre des vacances : le quota de vacances de sa
         quotité et ses jours fixes de temps partiel (jours de la semaine,
         0 = dimanche), qui ne se décomptent pas — même règle que le serveur. */
      quotaVac: Number(getQuotasConges(_quotiteDe_(id)).vac) || 0,
      joursFixes: _vacJoursFixes_(id),
      /* (26/11/2026) Reliquat de l'année précédente : les vacances du 1er au
         31 janvier le consomment d'abord (même règle que le serveur). */
      reliquatVac: { annee: annee - 1, droit: Number(reliquats[id]) || 0, touteAnnee: !!relToutAn[id] },
    };
  });
  /* (CORRECTIF 23/08/2026) `getJoursFeries` renvoie un ENSEMBLE. Un ensemble
     mis en texte pour voyager jusqu'à la page devient {} — vide et non
     parcourable : l'écran plantait à l'ouverture. Tout ce qui part dans une
     clé doit être une LISTE ou un objet simple. */
  return { success: true, year: annee, presents: presents, seuils: seuilsPresence_(),   // (17/11/2026) l'écran colore avec les seuils du classeur
           joursFeries: Array.from(jf).sort(),
           /* (27/11/2026) Janvier N+1 posable tant que le planning N+1 n'existe pas :
              ses jours (hors grille N) et ses fériés. */
           janvierSuivant: jsOuvert ? { ouvert: true, jours: _janvierSuivantDates_(annee, M.datesValides),
                                        feries: Array.from(getJoursFeries(Number(annee) + 1)).filter(function (d) { return d.slice(5, 7) === '01'; }).sort() }
                                    : { ouvert: false },
           fermes: Array.from(_tpFermes_(annee)).sort(), parMar: parMar };
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "deciderJourTpLot" ── */
/* (LOT 4 · 22/08/2026) LES DÉCISIONS DU COMITÉ sur les jours sous réserve — récit : docs/JOURNAL-Planning-Med.md §157 */
/* (23/08/2026) DÉCISIONS EN LOT — récit : docs/JOURNAL-Planning-Med.md §158 */
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
      /* (27/11/2026) La décision est appelée DIRECTEMENT, plus par le routeur : le lot
         tient déjà le verrou d'écriture (Indispos.gs) et le code a déjà été contrôlé.
         Repasser par le routeur redemanderait le verrou à chaque jour de la série. */
      const r = _act_deciderJourTp({ e: e, action: 'deciderJourTp', code: code, user: user, payload: {
        action: 'deciderJourTp', code: payload.code, year: payload.year,
        decision: d.decision, doctorId: d.doctorId, date: d.date, retablir: d.retablir || {},
      } });
      const rep = JSON.parse(r.getContent());
      if (rep && rep.success) faits++; else rates++;
      detail.push({ date: d.date, doctorId: d.doctorId, decision: d.decision,
                    success: !!(rep && rep.success), error: rep && rep.error,
                    rendues: rep && rep.rendues, alerteRea1: !!(rep && rep.alerteRea1) });
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
      /* (26/11/2026) Le TP passe avant la récup de samedi : la case est
         écrite, le jour est-il vert ? Sinon, une ou deux récups à plus de
         30 jours partent ailleurs si ça suffit. Le comité valide de toute
         façon : sans récup à déplacer, rien ne change. */
      let recupsDeplacees = [];
      try {
        const S = seuilsPresence_();
        const manque = S.confort - _tpMondePresence_(anneeD).presents(ds);   // le TP est déjà écrit : il est compté absent
        if (manque > 0 && typeof _tpLibererRecups_ === 'function') recupsDeplacees = _tpLibererRecups_(anneeD, ds, cibleId, manque, null, 'comité (' + user.id + ')') || [];
      } catch (eR) { try { logAction('deciderJourTp : récups non déplacées — ' + eR.message); } catch (e2) {} }
      _tpDemandeRetirer_(anneeD, ds, cibleId);
      _tpRepublier_(anneeD);
      logAction('deciderJourTp VALIDE ' + ds + ' (' + anneeD + ') ' + cibleId + ' par ' + user.id + ' — planning republié');
      (typeof historiser_ === 'function') && historiser_([{ annee: anneeD, quoi: 'TP validé par le comité', mar: cibleId, jour: ds, par: 'comité (' + user.id + ')' }]);
      _tpNotifier_('Temps partiel validé',
        'Votre jour du ' + _tpJourLisible_(ds) + ' est validé par le comité.', cibleId);
      out = { success: true, date: ds, doctorId: cibleId, recupsDeplacees: recupsDeplacees.length };
      /* (16/11/2026) Validé par le comité dans la semaine Réa 1 du MAR : ça passe,
         mais l'écran du comité le signale. */
      if (typeof _rea1Jours_ === 'function' && (_rea1Jours_(anneeD)[cibleId] || {})[ds]) out.alerteRea1 = true;
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
      (typeof historiser_ === 'function') && historiser_([{ annee: anneeD, quoi: 'validation de TP annulée', mar: cibleId, jour: ds, par: 'comité (' + user.id + ')' }]);
      _tpNotifier_('Temps partiel remis en attente',
        'Votre jour du ' + _tpJourLisible_(ds) + ' repasse en attente de validation.', cibleId);
      out = { success: true, date: ds, doctorId: cibleId };
    }
  }

  if (decision === 'refuser') {
    /* (24/11/2026) On garde la trace de QUI est refusé et de l'effectif du
       moment : c'est ce qui permet de rouvrir le jour s'il se libère. */
    const refuses = _tpDemandes_(anneeD).filter(function (x) { return x.date === ds; })
      .map(function (x) { return x.mar; });
    let effRefus = '';
    try { effRefus = _tpMondePresence_(anneeD).presents(ds); } catch (eM) { effRefus = ''; }
    _tpFermerJour_(anneeD, ds, user.id, refuses, effRefus);
    const rendues = {};
    _tpDemandes_(anneeD).forEach(function (x) {
      if (x.date !== ds) return;
      rendues[x.mar] = 'TPA';
      _tpDemandeRetirer_(anneeD, ds, x.mar);
    });
    logAction('deciderJourTp REFUS ' + ds + ' (' + anneeD + ') par ' + user.id +
              ' — ' + Object.keys(rendues).length + ' demande(s) rendue(s) : ' + Object.keys(rendues).join(', '));
    (typeof historiser_ === 'function') && historiser_(Object.keys(rendues).map(function (idR) { return { annee: anneeD, quoi: 'TP refusé (jour fermé par le comité)', mar: idR, jour: ds, par: 'comité (' + user.id + ')' }; })
      .concat(Object.keys(rendues).length ? [] : [{ annee: anneeD, quoi: 'jour fermé au TP par le comité', jour: ds, par: 'comité (' + user.id + ')' }]));
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
    (typeof historiser_ === 'function') && historiser_([{ annee: anneeD, quoi: 'jour rouvert au TP par le comité', jour: ds, par: 'comité (' + user.id + ')', detail: 'demandes rétablies : ' + (retablies.join(', ') || 'aucune') }]);
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
