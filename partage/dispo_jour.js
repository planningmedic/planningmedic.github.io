// ⚠️ RÈGLE : incrémenter cette version à CHAQUE push, et recopier ce fichier
// À L'IDENTIQUE des deux côtés (Apps Script : fichier `dispo_jour` ; frontend :
// <script src="partage/dispo_jour.js">). Le diagnostic Maintenance compare la
// version déployée côté GAS avec celle du dépôt et signale toute dérive.
const GAS_VERSION_DISPO = '2026-08-04.2';

/* ═══════════════════════════════════════════════════════════════════════
   DISPO_JOUR — module PARTAGÉ serveur / frontend (étage 2, 04/08/2026)
   ═══════════════════════════════════════════════════════════════════════

   POURQUOI. Le tri des disponibles du panneau de placement est la logique
   la plus sensible du comité. La réimplémenter côté navigateur créerait un
   risque de divergence silencieuse — refusé. La seule voie sûre vers un
   panneau à 0 ms : UNE SEULE implémentation, versionnée UNE fois ici, et
   incluse TELLE QUELLE des deux côtés (Apps Script est du JavaScript).

   RÈGLES DE PURETÉ (ce qui rend le partage possible) :
   - Aucune lecture de classeur, aucun DOM, aucun réseau : uniquement
     (date, contexte) → liste triée. Les CALLERS assemblent le contexte
     (serveur : depuis les onglets ; frontend : depuis le miroir).
   - Tolérant aux formes : Set ou Array pour les ensembles (le serveur
     passe des Set, le miroir livre des Array).
   - Toute évolution de la logique se fait ICI et nulle part ailleurs,
     puis se déploie DES DEUX côtés dans la même livraison.

   CONTEXTE ATTENDU (ctx) :
     actifs             [id, …]            MEDECINS actifs
     initiales          {id: 'AB'}         colonne INITIALES
     affectationDuMois  {id: 'VIS'|…}      affectation du MOIS de la date,
                                           DÉJÀ passée par normalizeAffectation
     codeById           {id: 'RG'|'R'|…}   code GARDES du jour, MAJUSCULES
     codesValides       Set|[…]  OPTIONNEL : si fourni, les affectations sont
                        normalisées ICI (alias + validité + VOLANT par défaut) —
                        chemin du FRONTEND, dont les données miroir sont brutes ;
                        si absent, elles passent telles quelles — chemin du
                        SERVEUR, qui normalise en amont.
     flags:
       tpJoursFixes     {id: Set|[dow…]}   jours fixes non travaillés (0=dim)
       dateDebut        {id: 'AAAA-MM-JJ'}
       dateFin          {id: 'AAAA-MM-JJ'}
       rythme2sur2      Set|[id, …]        rythme 2 sem. ON / 2 sem. OFF

   SORTIE : [{id, init, role, secteur, code}, …] triée VOLANT → CTP → R →
   PRESENT → TP. Fidèle au comportement de production du 04/08/2026
   (getMARsDispoJour / getPanneauSemaine, Indispos.gs), prouvé par
   test-oracle avant extraction.
   ═══════════════════════════════════════════════════════════════════ */

// Codes d'absence : un MAR portant l'un d'eux ce jour-là n'est pas proposable.
var DISPO_ABSENT_CODES = ['RG', 'V', 'CP', 'F', 'CTP', 'A', 'CL'];

// Ordre d'affichage des rôles. ⚠️ VOLANT vaut 0 (falsy) : toujours tester la
// PRÉSENCE de la clé, jamais `ordre[role] || 3` (piège corrigé en production).
var DISPO_ROLE_ORDRE = { VOLANT: 0, CTP: 1, R: 2, PRESENT: 3, TP: 4 };

/* Alias de secteurs — COPIE de _AFF_ALIAS (code.gs, normalizeAffectation).
   Toute évolution se fait ICI d'abord, puis se répercute dans code.gs le même
   jour (chantier ultérieur : faire consommer cette table par code.gs). */
var DISPO_AFF_ALIAS = {
  'VISC':'VIS','VISCERAL':'VIS',
  'ENDO':'END','ENDOSCOPIES':'END',
  'REANIMATION':'REA',
  'ORTH':'ORT','ORTHO':'ORT',
  'CARDIO/INTER':'CI','CARDIO':'CI',
  'RADIO/INTER':'RI',
  'MATER':'MAT','MATERNITE':'MAT',
};

/* Normalisation d'un code d'affectation. Fidèle à normalizeAffectation
   (code.gs) : trim + majuscules → alias → validité → sinon VOLANT.
   IDEMPOTENTE : une valeur déjà normalisée ressort inchangée — le serveur,
   qui normalise en amont, peut donc passer par ici sans effet. */
function dispoNormaliserAffectation_(brut, codesValides) {
  if (!brut) return 'VOLANT';
  var v = String(brut).trim().toUpperCase();
  if (DISPO_AFF_ALIAS[v]) v = DISPO_AFF_ALIAS[v];
  if (!codesValides) return v;                       // pas de référentiel fourni → passage direct
  if (dispoContient_(codesValides, v) || v === 'VOLANT') return v;
  return 'VOLANT';
}

function dispoRangRole_(role) {
  return (role in DISPO_ROLE_ORDRE) ? DISPO_ROLE_ORDRE[role] : 3;
}

// Set ou Array → fonction d'appartenance uniforme.
function dispoContient_(ens, valeur) {
  if (!ens) return false;
  if (typeof ens.has === 'function') return ens.has(valeur);
  return Array.isArray(ens) && ens.indexOf(valeur) !== -1;
}

/* Rythme 2 semaines ON / 2 semaines OFF, ancré au lundi 01/06/2026 (semaine
   ISO 23). Compte des semaines RÉELLES écoulées : robuste aux années à 53
   semaines. Copie conforme d'estSemaineOff (production), rendue pure. */
function dispoEstSemaineOff_(id, dateStr, rythme2sur2) {
  if (!dispoContient_(rythme2sur2, id)) return false;
  var ancre = Date.UTC(2026, 5, 1);
  var dt = new Date(dateStr + 'T12:00:00');
  var m = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));   // lundi de la semaine
  var nb = Math.round((m - ancre) / (7 * 86400000));
  return (((nb % 4) + 4) % 4) >= 2;
}

/* ── LE CŒUR — identique pour les deux endpoints serveur et le frontend ──
   Fidélité ligne à ligne avec la production du 04/08/2026 :
   1. code du jour, sinon TP si jour fixe non travaillé ;
   2. codes d'absence → écarté ;
   3. bornes dateDebut (strictement avant → écarté) / dateFin (>= → écarté) ;
   4. semaine OFF du rythme 2/2 → écarté ;
   5. rôle : TP si code TP, R si code R, VOLANT si secteur VOLANT, sinon
      PRESENT ; code affiché 'PRESENT' quand la case du jour est vide ;
   6. tri par rang de rôle (stable : l'ordre d'entrée départage). */
function calculerDispoJour(targetDate, ctx) {
  var flags = (ctx && ctx.flags) || {};
  var affMap = (ctx && ctx.affectationDuMois) || {};
  var codeById = (ctx && ctx.codeById) || {};
  var initiales = (ctx && ctx.initiales) || {};
  var dow = new Date(targetDate + 'T12:00:00').getDay();
  var dispo = [];

  ((ctx && ctx.actifs) || []).forEach(function (id) {
    var code = codeById[id] || '';
    var tp = flags.tpJoursFixes && flags.tpJoursFixes[id];
    if (!code && tp && dispoContient_(tp, dow)) code = 'TP';
    if (DISPO_ABSENT_CODES.indexOf(code) !== -1) return;
    var dd = flags.dateDebut && flags.dateDebut[id];
    var df = flags.dateFin && flags.dateFin[id];
    if (dd && targetDate < dd) return;
    if (df && targetDate >= df) return;
    if (dispoEstSemaineOff_(id, targetDate, flags.rythme2sur2)) return;
    var secteur = ctx && ctx.codesValides
      ? dispoNormaliserAffectation_(affMap[id], ctx.codesValides)
      : (affMap[id] || 'VOLANT');   // serveur : affMap déjà normalisée en amont
    var role;
    if (code === 'TP') role = 'TP';
    else if (code === 'R') role = 'R';
    else if (secteur === 'VOLANT') role = 'VOLANT';
    else role = 'PRESENT';
    dispo.push({ id: id, init: initiales[id] || id, role: role, secteur: secteur, code: code || 'PRESENT' });
  });

  dispo.sort(function (a, b) { return dispoRangRole_(a.role) - dispoRangRole_(b.role); });
  return dispo;
}
