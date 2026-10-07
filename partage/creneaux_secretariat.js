/* ═══════════════════════════════════════════════════════════════════════
   CRÉNEAUX SECRÉTARIAT — logique PURE, sans page ni réseau (07/10/2026)
   ═══════════════════════════════════════════════════════════════════════

   LE CIRCUIT. Un patient libéral se présente au secrétariat : « je suis opéré
   le 2 novembre en endoscopie, je viens prendre ma consultation ». La
   secrétaire saisit la date et le secteur ; l'outil propose les créneaux de
   consultation qui conviennent.

   UN CRÉNEAU CONVIENT SI, ET SEULEMENT SI :
     1. c'est une consultation du secteur demandé, ou une consultation
        polyvalente (rare : elles vont en général aux MARs hors libéral) ;
     2. délai médico-légal : AU MOINS 48 h et AU PLUS 1 mois avant le jour de
        l'intervention (07/10/2026, Arthur) — et pas avant aujourd'hui.
        48 h = au plus tard l'avant-veille (l'heure du geste n'est pas connue).
        1 mois = même quantième le mois précédent (31 mars → 28/29 février) ;
     3. le médecin est membre du groupement libéral ;
     4. le médecin est PRÉSENT le jour de la consultation ;
     5. le médecin est PRÉSENT le jour de l'intervention.

   L'ORDRE PROPOSÉ :
     · d'abord les médecins AFFECTÉS au secteur demandé (pas de changement de
       secteur le jour de l'intervention) ;
     · ensuite seulement les médecins des autres secteurs ;
     · dans chaque groupe, du plus grand écart à la règle des 30 % au plus
       petit — reçu sous forme de RANG (1 = passe en premier), jamais d'un
       montant : la vue secrétariat ne doit contenir aucun chiffre libéral.

   HORIZON. Les absences ne sont connues que sur la fenêtre `jours`. Une
   intervention hors de cette fenêtre est REFUSÉE avec un motif : sans
   absences connues, tout le monde paraîtrait présent — le faux « disponible »
   que l'outil doit éviter.

   ENTRÉE (ctx) :
     aujourdhui     'AAAA-MM-JJ'
     jours          ['AAAA-MM-JJ', …]  jours ouvrés dont les absences sont connues
     consultations  [{date, per:'am'|'pm', cs:'CS-END', mar}]
     absences       {mar: ['AAAA-MM-JJ', …]}   (ou [{d:'AAAA-MM-JJ'}])
     groupement     {mar: true}
     secteurDe      {mar: 'END'}       secteur d'affectation du médecin
     rang           {mar: 1}           ordre de priorité (absent = en dernier)
   SORTIE :
     {erreur:'format'|'hors_horizon'|'secteur'|'delai_court', …}
     ou {enSecteur:[{mar, creneaux:[…]}], autresSecteurs:[…]}
   ═══════════════════════════════════════════════════════════════════════ */
var CRENEAUX_SECRETARIAT = (function () {
  var SECTEURS = {
    END: { libelle: 'Endoscopie',    cs: 'CS-END' },
    VIS: { libelle: 'Viscéral',      cs: 'CS-VIS' },
    ORL: { libelle: 'ORL',           cs: 'CS-ORL' },
    ORT: { libelle: 'Orthopédie',    cs: 'CS-ORT' },
    MAT: { libelle: 'Maternité',     cs: 'CS-MAT' },
    CI:  { libelle: 'Cardio interv.', cs: 'CS-CI'  }
  };
  var CS_POLY = 'CS-POLY';
  var DELAI_MIN_JOURS = 2;   // 48 h
  var DELAI_MAX_MOIS  = 1;

  function _iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Bornes de la consultation pour une intervention donnée : [auPlusTot, auPlusTard].
  function bornes(dateIntervention) {
    var p = dateIntervention.split('-').map(Number);
    var tard = new Date(p[0], p[1] - 1, p[2] - DELAI_MIN_JOURS, 12);
    var dernierDuMois = new Date(p[0], p[1] - 1 - DELAI_MAX_MOIS + 1, 0, 12).getDate();
    var tot = new Date(p[0], p[1] - 1 - DELAI_MAX_MOIS, Math.min(p[2], dernierDuMois), 12);
    return { auPlusTot: _iso(tot), auPlusTard: _iso(tard) };
  }

  function _absSet(liste) {
    var s = {};
    (liste || []).forEach(function (a) { s[typeof a === 'string' ? a : (a && a.d)] = true; });
    return s;
  }

  function proposer(dateIntervention, secteur, ctx) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIntervention || ''))) return { erreur: 'format' };
    var sect = SECTEURS[secteur];
    if (!sect) return { erreur: 'secteur' };
    var jours = ctx.jours || [];
    if (jours.indexOf(dateIntervention) < 0) {
      return { erreur: 'hors_horizon', premier: jours[0] || null, dernier: jours[jours.length - 1] || null };
    }
    var b = bornes(dateIntervention);
    if (b.auPlusTard < ctx.aujourdhui) return { erreur: 'delai_court', auPlusTard: b.auPlusTard };
    var csAdmis = {}; csAdmis[sect.cs] = true; csAdmis[CS_POLY] = true;
    var abs = {};
    var absentLe = function (mar, d) {
      if (!abs[mar]) abs[mar] = _absSet((ctx.absences || {})[mar]);
      return !!abs[mar][d];
    };
    var parMar = {};
    (ctx.consultations || []).forEach(function (c) {
      if (!c || !csAdmis[c.cs]) return;                                   // 1
      if (c.date > b.auPlusTard || c.date < b.auPlusTot) return;          // 2
      if (c.date < ctx.aujourdhui) return;
      if (!(ctx.groupement || {})[c.mar]) return;                         // 3
      if (absentLe(c.mar, c.date)) return;                                // 4
      if (absentLe(c.mar, dateIntervention)) return;                      // 5
      (parMar[c.mar] = parMar[c.mar] || []).push({ date: c.date, per: c.per, cs: c.cs });
    });
    var rang = ctx.rang || {};
    var r = function (m) { return (typeof rang[m] === 'number') ? rang[m] : 1e9; };
    var liste = Object.keys(parMar).map(function (m) {
      parMar[m].sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.per === 'am' ? -1 : 1);
      });
      return { mar: m, creneaux: parMar[m] };
    }).sort(function (a, b) { return (r(a.mar) - r(b.mar)) || (a.mar < b.mar ? -1 : 1); });
    var sd = ctx.secteurDe || {};
    return {
      auPlusTot: b.auPlusTot, auPlusTard: b.auPlusTard,
      enSecteur:      liste.filter(function (x) { return sd[x.mar] === secteur; }),
      autresSecteurs: liste.filter(function (x) { return sd[x.mar] !== secteur; })
    };
  }

  return { SECTEURS: SECTEURS, CS_POLY: CS_POLY, bornes: bornes, proposer: proposer };
})();
if (typeof module !== 'undefined') module.exports = CRENEAUX_SECRETARIAT;
