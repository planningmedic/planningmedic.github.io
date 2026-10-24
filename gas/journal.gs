// ⚠️ RÈGLE : incrémenter à CHAQUE push. Fichier Apps Script : `journal`.
const GAS_VERSION_JOURNAL = '2026-10-24.1';   // (24/10/2026) application déclenchée par la page admin + filet toutes les 5 min

/* ═══════════════════════════════════════════════════════════════════════
   JOURNAL D'INTENTIONS — L'APPLICATEUR (05/08/2026)
   ═══════════════════════════════════════════════════════════════════════

   POURQUOI. Mesures des 04-05/08 : parler à Google en direct pour écrire
   expose le comité à sa porte d'entrée (2,5-5 s au mieux, 30 s+ les mauvais
   matins, 404 sur le canal de réponse). Désormais le comité dépose ses
   INTENTIONS chez Cloudflare (~150 ms, accusé garanti, durable) ; CE fichier
   les applique côté serveur, dans l'ordre.

   (24/10/2026) QUAND. La page admin demande l'application juste après un
   dépôt (action `journalAppliquerMaintenant`, appel non attendu) : quelques
   secondes au lieu d'une minute. Le déclencheur ne passe plus que toutes les
   5 minutes, en FILET (appel direct perdu, page fermée trop tôt). Motif,
   mesures du 24/10 : 1 440 passages/jour ≈ 69 min sur les 90 min/jour de
   tâches de fond d'un compte gmail, et ≈ 480 ouvertures de file/jour chez
   Cloudflare (alerte 50 % du plafond de 1 000 listages). Les requêtes des
   pages ne comptent pas dans les 90 min.

   LE CIRCUIT.
   1. admin.html → POST /ecrire au Worker : la fiche (type, données, auteur,
      horodatage Worker) est stockée en KV sous `j_{ts}_{aléa}` — l'ordre est
      l'ordre des horodatages du Worker, source unique.
   2. `journalAppliquer` (appel de la page admin, ou filet toutes les 5 min) → GET /tirer (jeton) →
      applique CHAQUE fiche par les fonctions de production existantes
      (savePlanningOverridesBatch, appliquerStatutJour, generatePlanning) —
      AUCUNE logique métier ici, uniquement l'aiguillage.
   3. → POST /purger (jeton) : les fiches appliquées quittent la file et
      entrent au registre `jfait_…` (audit 90 jours : qui, quoi, quand,
      appliqué quand, résultat).
   4. La note miroir (_miroirNoterPoussee_, miroir.gs) est posée pour les
      familles réellement modifiées — le miroir suit dans la minute.

   GARANTIES.
   - L'écriture du classeur reste la SEULE vérité ; le journal est la file
     d'attente durable devant elle.
   - Crash entre /tirer et /purger → fiches toujours en file → re-tirées au
     passage suivant → idempotentes (placements visés par (date, MAR) ;
     statuts : re-poser la même valeur ; publier : régénérer est sans effet
     de bord).
   - Une fiche qui ÉCHOUE (ex. MAR introuvable) est purgée avec son erreur
     au registre — elle ne bloque JAMAIS la file derrière elle ; le
     diagnostic Maintenance signale les échecs récents.
   - Fiche inconnue (type non prévu) → purgée en erreur, jamais bloquante.
   ═══════════════════════════════════════════════════════════════════ */

const JOURNAL_TYPES_CONNUS = ['placements', 'statut', 'publier'];

/* (24/10/2026) Remplace le déclencheur existant (l'ancien, à 1 minute, était
   conservé tel quel par la version précédente) : à exécuter UNE FOIS à la main
   après la recopie. Idempotent : n'empile jamais deux déclencheurs. */
function journalInstallerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'journalAppliquer') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('journalAppliquer').timeBased().everyMinutes(5).create();
  Logger.log('journalAppliquer : déclencheur installé (filet toutes les 5 minutes)');
}

function _journalJeton_() {
  const t = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
  if (!t) throw new Error('MIROIR_PUSH_TOKEN absent des propriétés du script');
  return t;
}

/* État de la file (pour le diagnostic Maintenance). */
function journalEtat_() {
  const rep = UrlFetchApp.fetch(MIROIR_URL + '/journal-etat', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ token: _journalJeton_() }),
    muteHttpExceptions: true,
  });
  if (rep.getResponseCode() !== 200) throw new Error('HTTP ' + rep.getResponseCode());
  return JSON.parse(rep.getContentText());
}

/* (2026-08-05.2) Le compteur de courrier non lu est rafraichi ICI, hors de
   la file du comite : l'applicateur tourne deja (filet de 5 min), on interroge
   Gmail au plus toutes les 5 minutes (garde d'horodatage). Le badge du
   comite lit ensuite le miroir, sans aucun appel Google. */
const JOURNAL_CLE_MAIL = 'JOURNAL_MAIL_DERNIER';
function _journalRafraichirMail_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const dernier = Number(props.getProperty(JOURNAL_CLE_MAIL) || 0);
    if (Date.now() - dernier < 300000) return;          // < 5 min : rien a faire
    props.setProperty(JOURNAL_CLE_MAIL, String(Date.now()));
    miroirPousserFamilles_(['mail'], getActiveYear(), false);
  } catch (e) { /* jamais bloquant : le badge est un confort */ }
}

/* `opts.direct` (24/10/2026) : appel de la page admin (journalAppliquerMaintenant).
   Le déclencheur, lui, passe un objet événement sans `direct` : comportement
   inchangé. En direct : ni battement (il mesure le FILET), ni relève du
   courrier (cadence propre au filet), et une attente de verrou plus longue —
   si le filet tient la file, on attend sa fin plutôt que de laisser la
   nouvelle fiche dormir jusqu'au filet suivant. Renvoie le nombre de fiches
   traitées (0 si rien, -1 si verrou indisponible). */
function journalAppliquer(opts) {
  const direct = !!(opts && opts.direct === true);
  if (!direct) {
    try { if (typeof _bat_ === 'function') _bat_('journalAppliquer'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
    _journalRafraichirMail_();
  }
  // Un seul applicateur à la fois : deux passages qui se chevauchent
  // appliqueraient les mêmes fiches (sans dégât — idempotence — mais en
  // double travail et double note miroir).
  /* (2026-08-05.3, CORRECTIF) Verrou de DOCUMENT, pas verrou de script — récit : docs/JOURNAL-Planning-Med.md §129 */
  const verrou = LockService.getDocumentLock();
  if (!verrou.tryLock(direct ? 25000 : 5000)) return -1;
  try {
    const rep = UrlFetchApp.fetch(MIROIR_URL + '/tirer', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ token: _journalJeton_() }),
      muteHttpExceptions: true,
    });
    if (rep.getResponseCode() !== 200) return 0;   // Worker indisponible : on repassera
    const corps = JSON.parse(rep.getContentText());
    const fiches = (corps && corps.fiches) || [];
    if (!fiches.length) return 0;

    // Ordre STRICT des horodatages Worker (la clé commence par j_{ts}_).
    fiches.sort(function (a, b) { return a.cle < b.cle ? -1 : 1; });

    const resultats = [];          // {cle, ok, detail} → /purger
    const famillesTouchees = {};   // familles miroir réellement modifiées
    const anneesTouchees = {};
    const lotsPlacements = {};     // annee → items[] (grouper : UN appel classeur par annee)

    fiches.forEach(function (f) {
      const it = f.valeur || {};
      try {
        if (it.type === 'placements' && Array.isArray(it.items) && it.items.length) {
          const y = Number(it.year) || getActiveYear();
          (lotsPlacements[y] = lotsPlacements[y] || []).push({ cle: f.cle, items: it.items });
          return;   // applique plus bas, groupé — résultat rempli là-bas
        }
        if (it.type === 'statut') {
          const y = Number(it.year) || getActiveYear();
          const res = appliquerStatutJour(y, it.marId, it.statut, it.dates || []);
          famillesTouchees['gardes'] = true; famillesTouchees['indispos'] = true;
          anneesTouchees[y] = true;
          resultats.push({ cle: f.cle, ok: true, detail: res.applied.length + ' appliqué(s), ' + res.rejected.length + ' rejeté(s)' });
          return;
        }
        if (it.type === 'publier') {
          const y = Number(it.year) || getActiveYear();
          // Les placements du même passage qui PRÉCÈDENT cette fiche sont déjà
          // groupés : on les écrit MAINTENANT, avant de régénérer.
          _journalEcrireLots_(lotsPlacements, resultats, famillesTouchees, anneesTouchees, f.cle);
          generatePlanning(y);
          try { notifPlanifier(y); } catch (e) {}
          ['planning', 'affectations', 'annees', 'config_admin', 'gardes', 'stats'].forEach(function (fa) { famillesTouchees[fa] = true; });
          anneesTouchees[y] = true;
          resultats.push({ cle: f.cle, ok: true, detail: 'planning ' + y + ' publié' });
          return;
        }
        resultats.push({ cle: f.cle, ok: false, detail: 'type inconnu : ' + it.type });
      } catch (e) {
        resultats.push({ cle: f.cle, ok: false, detail: e.message });
      }
    });

    // Lots de placements restants (aucun `publier` derrière eux)
    _journalEcrireLots_(lotsPlacements, resultats, famillesTouchees, anneesTouchees, null);

    // Purge + registre d'audit chez Cloudflare
    UrlFetchApp.fetch(MIROIR_URL + '/purger', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ token: _journalJeton_(), resultats: resultats }),
      muteHttpExceptions: true,
    });
    // Si /purger échoue : fiches re-tirées au prochain passage, idempotentes.

    // Note miroir (accroche différée, miroir.gs .6) — familles réelles.
    const familles = Object.keys(famillesTouchees);
    if (familles.length) {
      Object.keys(anneesTouchees).forEach(function (y) {
        try { _miroirNoterPoussee_(familles, Number(y)); } catch (e) {}
      });
    }
    logAction('journalAppliquer' + (direct ? ' (page admin)' : '') + ' — ' + resultats.length + ' fiche(s), ' +
              resultats.filter(function (r) { return !r.ok; }).length + ' échec(s)');
    return resultats.length;
  } catch (e) {
    Logger.log('journalAppliquer : ' + e.message);
    return 0;
  } finally {
    try { verrou.releaseLock(); } catch (e) {}
  }
}

/* Écrit les lots de placements groupés par année (UN savePlanningOverridesBatch
   par année), vide `lots`, remplit résultats/familles. `jusquACle` : ne traiter
   que les lots dont la clé précède celle-ci (ordre du journal respecté autour
   d'un `publier`) — null = tous. */
function _journalEcrireLots_(lots, resultats, familles, annees, jusquACle) {
  Object.keys(lots).forEach(function (y) {
    const retenus = [], reportes = [];
    lots[y].forEach(function (l) {
      if (jusquACle === null || l.cle < jusquACle) retenus.push(l); else reportes.push(l);
    });
    if (!retenus.length) { lots[y] = reportes; return; }
    const items = [];
    retenus.forEach(function (l) { l.items.forEach(function (x) { items.push(x); }); });
    try {
      const res = savePlanningOverridesBatch(items);
      retenus.forEach(function (l) {
        resultats.push({ cle: l.cle, ok: true, detail: (res && res.saved) + ' placement(s) écrits (lot ' + y + ')' });
      });
      familles['config_admin'] = true;
      annees[y] = true;
    } catch (e) {
      retenus.forEach(function (l) { resultats.push({ cle: l.cle, ok: false, detail: e.message }); });
    }
    lots[y] = reportes;
  });
}
