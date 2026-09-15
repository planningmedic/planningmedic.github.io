/* ═══════════════════════════════════════════════════════════════════════
   GARDES — Gardes : statut du planning, placements manuels (overrides), affectations, panneau du jour, reliquats, Noël, publication
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_GARDES = '2026-09-15.2';

// ── Sonde : les positions de STATS que code.gs lit à l'aveugle ──
function _sondeStatsEntetes_(check, R, annee) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STATS_GARDES_' + annee);
    if (!sh) return;
    /* (05/09/2026) La colonne 23 (CIBLE JF) est désormais lue elle aussi : l'écran
       d'équité surveille les SIX axes du générateur, plus cinq.
       Elle n'est contrôlée que si elle EXISTE : les années antérieures — 2026, dont
       les statistiques ont été reconstruites à la main — s'arrêtent à la colonne 22.
       Exiger la colonne là-bas ferait hurler le diagnostic sur une année qui n'a
       rien à se reprocher ; l'axe fériés y sera simplement absent de l'écran. */
    const nCol = Math.min(23, sh.getLastColumn());
    const h = sh.getRange(1, 1, 1, nCol).getValues()[0].map(v => String(v).trim());
    const attendu = { 0:'MEDECIN', 1:'CIBLE', 17:'CIBLE SAM', 18:'CIBLE JEU', 19:'CIBLE VD', 21:'CIBLE VJF' };
    if (nCol >= 23) attendu[22] = 'CIBLE JF';
    const faux = Object.keys(attendu).filter(i => h[i] !== attendu[i]).map(i => `col ${Number(i)+1} : « ${h[i]} » au lieu de « ${attendu[i]} »`);
    if (faux.length) {
      check(`STATS_GARDES_${annee} : en-tête déplacé — ${faux.join(' · ')} — code.gs lit ces colonnes PAR POSITION, l'équité se casserait en silence`, R.ERR);
      check('   → LE GESTE : remettre les colonnes à leur place (ne jamais insérer/supprimer de colonne dans STATS), ou régénérer les cibles.', R.OK);
    } else check(`STATS_GARDES_${annee} : les ${nCol >= 23 ? 7 : 6} colonnes lues par position sont où le code les attend`, R.OK);
  } catch (e) { check('STATS en-têtes : sonde en échec (' + e.message + ')', R.WARN); }
}

/* Date -> 'AAAA-MM-JJ' du LUNDI de sa semaine. Pas de Utilities ici : la
   fonction doit tourner à l'identique dans le banc, hors environnement Google. */
function _statsLundi_(d) {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dec = (j.getDay() + 6) % 7;          // lundi = 0
  j.setDate(j.getDate() - dec);
  return _statsJour_(j);
}

function _statsJour_(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/* Feuille de compteurs : créée à la demande, jamais dans setup_annee (elle ne
   dépend pas de l'année de planning et ne doit surtout pas être ré-initialisée
   au changement d'année — elle porte l'historique). */
function _statsFeuille_(ss, nom, entete) {
  let f = ss.getSheetByName(nom);
  if (!f) {
    f = ss.insertSheet(nom);
    f.getRange(1, 1, 1, entete.length).setValues([entete]);
    f.getRange(1, 1, 1, entete.length).setFontWeight('bold');
  }
  return f;
}

/* Grille 7 jours × 24 heures, cumulée depuis l'origine. Une case = un compteur.
   Incrémentée à la connexion : aucune dépendance aux lignes brutes. */
function _statsHeureIncr_(ss, d) {
  if (_statsJour_(d) < STATS_ORIGINE) return;
  const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const entete = ['JOUR'];
  for (let h = 0; h < 24; h++) entete.push('H' + String(h).padStart(2, '0'));
  const f = _statsFeuille_(ss, 'STATS_HEURES', entete);
  if (f.getLastRow() < 8) {
    for (let i = 0; i < 7; i++) {
      if (f.getLastRow() < i + 2) {
        const ligne = [JOURS[i]];
        for (let h = 0; h < 24; h++) ligne.push(0);
        f.appendRow(ligne);
      }
    }
  }
  const ligne = ((d.getDay() + 6) % 7) + 2;   // lundi -> ligne 2
  const col   = d.getHours() + 2;             // H00 -> colonne 2
  const cell  = f.getRange(ligne, col, 1, 1);
  cell.setValue(Number(cell.getValue() || 0) + 1);
}

/* Dernière connexion, par médecin. Colonne ajoutée EN FIN d'onglet MEDECINS et
   repérée par son EN-TÊTE : toutes les autres lectures de MEDECINS utilisent des
   index FIGÉS, une insertion au milieu rendrait les codes d'accès inopérants
   (constaté en réel le 21/07/2026). */
function _statsDerniereConnexion_(ss, user, d) {
  if (!user || !user.id || user.id === 'SECRETARIAT') return;
  const f = ss.getSheetByName('MEDECINS');
  if (!f) return;
  const data = f.getDataRange().getValues();
  if (!data.length) return;
  let col = -1;
  for (let c = 0; c < data[0].length; c++) {
    if (String(data[0][c]).trim().toUpperCase() === 'DERNIERE_CONNEXION') { col = c; break; }
  }
  if (col < 0) {
    col = data[0].length;                       // toujours EN FIN
    f.getRange(1, col + 1, 1, 1).setValue('DERNIERE_CONNEXION');  _medecinsInvalider_();   // (14/09/2026) MEDECINS a changé : le memo de la requête est périmé
    f.getRange(1, col + 1, 1, 1).setFontWeight('bold');
  }
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(user.id).trim()) {
      f.getRange(r + 1, col + 1, 1, 1).setValue(_statsJour_(d));  _medecinsInvalider_();   // (14/09/2026) MEDECINS a changé : le memo de la requête est périmé
      return;
    }
  }
}

/* ═══ COMPTEUR D'USAGE PAR RÔLE (31/08/2026) ═══════════════════════════
   Répond à une question que les connexions seules ne tranchent pas : le comité
   OUVRE-t-il la page d'administration, ou s'en SERT-il ?

   Même principe que STATS_HEURES : on incrémente AU MOMENT du geste, on ne
   reconstruit jamais après coup. LOGS ne pouvait pas servir de source — il ne
   garde que 500 lignes et son message est du texte libre, pas une donnée
   rangée.

   Une ligne par couple (rôle, action). '(ouverture)' est l'action des
   connexions. Aucune donnée nominative : le rôle, jamais la personne — le code
   d'administration est de toute façon partagé et ne porte aucun nom.

   PROTÉGÉ PAR UN FILET : tout appelant enveloppe l'appel dans un try/catch.
   Un compteur n'a jamais le droit de faire échouer une publication de planning. */
function _statsActionIncr_(ss, role, action, d) {
  d = d || new Date();
  if (_statsJour_(d) < STATS_ORIGINE) return;
  const r = String(role || '').trim().toLowerCase();
  const a = String(action || '').trim();
  if (!r || !a) return;
  const f = _statsFeuille_(ss, 'STATS_ACTIONS', ['ROLE','ACTION','NOMBRE','DERNIERE']);
  const data = f.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === r &&
        String(data[i][1]).trim() === a) {
      f.getRange(i + 1, 3, 1, 2).setValues([[Number(data[i][2] || 0) + 1, _statsJour_(d)]]);
      return;
    }
  }
  f.appendRow([r, a, 1, _statsJour_(d)]);
}

/* Recalcule les semaines ENCORE OUVERTES depuis les lignes brutes, et les fige
   dès qu'elles sont terminées. Une semaine figée n'est plus jamais retouchée :
   c'est ce qui rend la fonction sûre à rejouer, et ce qui protège la courbe
   quand les lignes brutes commencent à disparaître.
   Posée sur un déclencheur hebdomadaire ET appelée avant toute purge. */
function statsRecalculer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const brut = ss.getSheetByName('CONNEXIONS');
  if (!brut) return 'Aucune connexion enregistrée.';
  const f = _statsFeuille_(ss, 'STATS_SEMAINE',
                           ['SEMAINE','CONNEXIONS','ACTIFS','FIGEE']);

  /* Google Sheets CONVERTIT « 2026-09-07 » en objet Date à l'écriture, et le
     format texte ne suffit pas toujours à l'en empêcher. Une clé relue serait
     donc un Date et ne correspondrait plus à la clé calculée : la semaine
     paraîtrait inconnue, serait recomptée à chaque passage, et RÉTRÉCIRAIT à
     mesure que ses lignes brutes disparaissent. Défaut trouvé au banc le
     29/08/2026. On normalise donc TOUTE clé relue. */
  const _cleSem_ = function (v) {
    /* Volontairement PAS `instanceof Date` : dès qu'il existe deux contextes
       d'exécution (le banc en a un), un Date venu de l'autre contexte échoue au
       test et la normalisation est silencieusement sautée. On reconnaît la date
       à ce qu'elle sait faire, pas à sa filiation. */
    if (v && typeof v.getFullYear === 'function') return _statsJour_(v);
    return String(v).trim();
  };
  const dejaFigees = {};
  const lignesStats = f.getDataRange().getValues();
  const posLigne = {};
  for (let r = 1; r < lignesStats.length; r++) {
    const s = _cleSem_(lignesStats[r][0]);
    if (!s) continue;
    posLigne[s] = r + 1;
    if (String(lignesStats[r][3]).trim().toUpperCase() === 'O') dejaFigees[s] = true;
  }

  const total = {}, gens = {};
  const data = brut.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const h = data[r][0];
    if (!h) continue;
    const d = (h instanceof Date) ? h : new Date(h);
    if (isNaN(d.getTime())) continue;
    if (_statsJour_(d) < STATS_ORIGINE) continue;      // avant l'ouverture au service
    const sem = _statsLundi_(d);
    if (dejaFigees[sem]) continue;                     // jamais recompter une semaine close
    const qui = String(data[r][2] || data[r][1] || '').trim();
    if (!qui) continue;
    total[sem] = (total[sem] || 0) + 1;
    if (!gens[sem]) gens[sem] = {};
    gens[sem][qui] = true;
  }

  /* Une semaine est FIGÉE dès que son lundi + 7 jours est passé. */
  const lundiCourant = _statsLundi_(new Date());
  let ecrites = 0;
  Object.keys(total).sort().forEach(function (sem) {
    const actifs = Object.keys(gens[sem]).length;
    const close  = (sem < lundiCourant) ? 'O' : 'N';
    if (posLigne[sem]) {
      f.getRange(posLigne[sem], 2, 1, 3).setValues([[total[sem], actifs, close]]);
    } else {
      f.appendRow([sem, total[sem], actifs, close]);
    }
    ecrites++;
  });
  return ecrites + ' semaine(s) mise(s) à jour.';
}

/* À lancer UNE fois depuis l'éditeur Apps Script. Idempotent. */
function installStatsTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'statsRecalculer'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('statsRecalculer').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).nearMinute(0).create();
  return 'Declencheur statsRecalculer installe : tous les lundis vers 3 h.';
}

// ── DIAG : localiser les gardes de GARDES_{Y} exclues du planning publié ──
// Rejoue EXACTEMENT les règles du constructeur JSON (generatePlanningFromGardes) :
//  - MAR absent de l'effectif MEDECINS (ACTIF=O) → ligne jamais lue ;
//  - garde hors période d'activité (< date_debut ou ≥ date_fin) → remise à vide ;
//  - colonne dont la date dépasse la borne de l'année → jamais construite ;
//  - ligne en double pour un même id (le JSON ne lit que la dernière).
// Renvoie [{id, date, cell, code, reason}] = les cases comptées « dans l'onglet »
// mais absentes du JSON (donc de l'écart X vs Y du diagnostic).
function _findPhantomGardes_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`GARDES_${year}`);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (!data.length || !data[0]) return [];

  const DOCTORS = getDoctorsFromMedecins();
  const effectif = {}; DOCTORS.forEach(d => { effectif[d.id] = true; });
  const FLAGS = getMedecinFlags();

  const dateToCol = buildDateToCol(data, year);
  const colToDate = {}; Object.keys(dateToCol).forEach(ds => { colToDate[dateToCol[ds]] = ds; });

  const start = getPremierJourPlanning(year);
  const nextStart = getPremierJourPlanning(year + 1);
  const endD = new Date(nextStart); endD.setDate(nextStart.getDate() - 1);
  const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const startStr = fmt(start), endStr = fmt(endD);

  // Ligne retenue par id (la DERNIÈRE gagne, comme le JSON)
  const doctorRow = {};
  for (let r = 3; r < data.length; r++) { const id = String(data[r][0]).trim(); if (id) doctorRow[id] = r; }

  // Cases G/G2 réellement INCLUSES dans le JSON : clé `${id}|${date}`
  const included = {};
  DOCTORS.forEach(doc => {
    const rr = doctorRow[doc.id]; if (rr == null) return;
    const dd0 = FLAGS.dateDebut[doc.id], df0 = FLAGS.dateFin[doc.id];
    for (let c = 1; c < data[0].length; c++) {
      const ds = colToDate[c];
      if (!ds || ds < startStr || ds > endStr) continue;
      if ((dd0 && ds < dd0) || (df0 && ds >= df0)) continue;
      const v = String(data[rr][c] || '').trim().toUpperCase();
      if (v === 'G' || v === 'G2') included[`${doc.id}|${ds}`] = true;
    }
  });

  // Toutes les cases G/G2 de l'onglet ; phantom = non incluse dans le JSON
  const phantoms = [];
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    for (let c = 1; c < data[0].length; c++) {
      const v = String(data[r][c] || '').trim().toUpperCase();
      if (v !== 'G' && v !== 'G2') continue;
      const ds = colToDate[c];
      if (id && ds && included[`${id}|${ds}`]) continue;   // bien publiée
      const dateLabel = ds || `colonne ${c + 1}`;
      let reason;
      if (!id) reason = 'ligne sans identifiant MAR';
      else if (!effectif[id]) reason = `MAR « ${id} » absent de l'effectif MEDECINS (inactif ou id modifié)`;
      else if (!ds || ds < startStr || ds > endStr) reason = 'colonne hors année (date au-delà de la borne du planning)';
      else {
        const dd0 = FLAGS.dateDebut[id], df0 = FLAGS.dateFin[id];
        if (dd0 && ds < dd0) reason = `avant l'arrivée de ${id} (date_debut ${dd0})`;
        else if (df0 && ds >= df0) reason = `après le départ de ${id} (date_fin ${df0})`;
        else reason = `ligne en double pour ${id} dans GARDES_${year}`;
      }
      phantoms.push({ id: id || '—', date: dateLabel, cell: `L${r + 1}C${c + 1}`, code: v, reason });
    }
  }
  return phantoms;
}

// ── APPLY MODIFICATION (Comité) ───────────────────────────────────────
function applyModification(mod) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(mod.year) || TEST_YEAR;

  /* (03/08/2026) Verrou explicite sur les annees cloturees. La protection existait
     deja, mais par accident : getSheet() ne cherchant que dans le maitre, une annee
     archivee produisait « Onglet GARDES_YYYY introuvable ». Le jour ou cette fonction
     lira les archives pour une bonne raison, la protection disparaitrait sans que
     personne ne s'en apercoive. La regle est donc ecrite, et le message est lisible. */
  if (!ss.getSheetByName(`GARDES_${year}`)) {
    throw new Error(`Année ${year} archivée — consultation seule, aucune modification possible`);
  }

  function getSheet(name) {
    const s = ss.getSheetByName(name);
    if (!s) throw new Error(`Onglet ${name} introuvable`);
    return s;
  }

  function buildDateIndex(sheet) {
    const jan1 = new Date(year, 0, 1);
    const dow1 = jan1.getDay();
    const off1 = dow1 === 1 ? 7 : dow1 === 0 ? 1 : 8 - dow1;
    const startDate = new Date(year, 0, 1 + off1, 12, 0, 0);
    const nCols = sheet.getLastColumn() - 1;
    const index = {};
    for (let i = 0; i < nCols; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
      index[key] = i + 2;
    }
    return index;
  }

  function getDateIndex(sheet, date) { return buildDateIndex(sheet)[date] || -1; }

  function getDoctorRow(sheet, doctorId) {
    const col = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (let i = 3; i < col.length; i++) {
      if (String(col[i][0]).trim() === doctorId) return i + 1;
    }
    return -1;
  }

  function writeCell(sheetName, doctorId, date, value) {
    const sheet = getSheet(sheetName);
    const col = getDateIndex(sheet, date);
    const row = getDoctorRow(sheet, doctorId);
    if (col < 0) throw new Error(`Date ${date} introuvable dans ${sheetName}`);
    if (row < 0) throw new Error(`Médecin ${doctorId} introuvable dans ${sheetName}`);
    /* (13/08/2026 — échanges, phase 3) Mode dryRun : TOUS les contrôles sont
       joués (la doctrine 2026-08-05.12 garantit qu'ils précèdent la première
       écriture), l'existence des cellules visées comprise — seule l'écriture
       elle-même est neutralisée. C'est ce qui permet de juger une demande
       d'échange DÈS SA CRÉATION sans dupliquer un seul contrôle. */
    if (mod.dryRun) return;
    sheet.getRange(row, col).setValue(value);
  }

  function readCell(sheetName, doctorId, date) {
    const sheet = getSheet(sheetName);
    const col = getDateIndex(sheet, date);
    const row = getDoctorRow(sheet, doctorId);
    if (col < 0 || row < 0) return '';
    return String(sheet.getRange(row, col).getValue()).trim();
  }

  function nextDay(date) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  function prevDay(date) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  /* ── GARDE-FOUS (02/08/2026) ──────────────────────────────────────────────
     Un don / une garde exceptionnelle ecrivait le RG du lendemain SANS regarder
     la case d'arrivee. Constate sur 2027 : la garde du jeudi 25/03 donnee a
     DURAND a fait ecrire 'RG' le vendredi 26/03, ecrasant SA PROPRE garde de
     ce jour-la. Resultat : 26/03/2027 sans G, un RG orphelin le 27, aucun signal.
     Trois regles desormais :
       1. aucune ecriture ne detruit un G/G2 existant ;
       2. personne ne recoit une garde adjacente a une garde qu'il tient deja ;
       3. toutes les cases visees sont verifiees AVANT la premiere ecriture
          (writeCell leve une erreur si le MAR est absent de la grille — ex. un
          MAR actif mais sorti de GARDES_{annee} — et laissait la modification
          a moitie appliquee, donc une garde perdue). */
  const estGarde = v => /^G2?$/i.test(String(v == null ? '' : v).trim());

  function refuseSiGarde(who, jour, motif) {
    const v = readCell(`GARDES_${year}`, who, jour);
    if (estGarde(v)) throw new Error(`${who} est deja de garde (${v}) le ${jour} — ${motif}`);
  }

  function refuseSiAdjacente(who, jour) {
    [prevDay(jour), nextDay(jour)].forEach(d => {
      const v = readCell(`GARDES_${year}`, who, d);
      if (estGarde(v)) throw new Error(`${who} est de garde (${v}) le ${d} — deux gardes consecutives sont impossibles`);
    });
  }

  /* (12/08/2026 — phase 2 échanges) Un don ne regardait que la grille des
     gardes : donner une garde à un MAR en congé passait sans un mot, et son
     absence restait posée sur le même jour que sa nouvelle garde. C'était
     l'œil du comité qui l'attrapait — indispensable avant d'ouvrir les dons
     aux MAR eux-mêmes (phase 4), où plus personne ne relira.
     La source de vérité des absences est INDISPOS_{annee} (même lecture que
     l'échange de secteurs). Un SOUHAIT n'est PAS une absence : recevoir une
     garde un jour qu'on a souhaité est exactement le but. */
  const ABSENCES = ['INDISPO', 'VAC', 'FORM', 'TP', 'CL', 'CTP', 'CP', 'A'];
  function refuseSiIndisponible(who, jour, motif) {
    const v = readCell(`INDISPOS_${year}`, who, jour).toUpperCase();
    if (ABSENCES.indexOf(v) > -1) {
      throw new Error(`${who} est indisponible (${v}) le ${jour} — ${motif}`);
    }
  }

  // Pre-vol : la case existe-t-elle ? Meme controle que writeCell, mais AVANT
  // d'ecrire quoi que ce soit, pour ne jamais laisser une modification a moitie faite.
  function verifieCellules(paires) {
    const sheetName = `GARDES_${year}`;
    const sheet = getSheet(sheetName);
    paires.forEach(([who, jour]) => {
      if (!who || !jour) return;
      if (getDateIndex(sheet, jour) < 0) throw new Error(`Date ${jour} introuvable dans ${sheetName}`);
      if (getDoctorRow(sheet, who)  < 0) throw new Error(`${who} est absent de ${sheetName} — modification impossible`);
    });
  }

  const { type, date, doctorId, doctorId2, value, date2 } = mod;

  // (02/08/2026 - correctif) Le journal etait ecrit APRES le switch : un geste refuse
  // levait une exception et ne laissait donc aucune trace — exactement le cas qu'on
  // veut tracer. On capture, on journalise succes ET refus, puis on relance l'erreur.
  let _echec = null;
  try {

  switch (type) {
    case 'echangeSecteur': {
      /* (2026-08-05.12) Mêmes précautions : les deux cellules sont vérifiées
         avant la première écriture (readCell/writeCell lèvent si le MAR ou la
         date est introuvable — un doctorId2 mal saisi ne doit pas laisser la
         première cellule modifiée). */
      verifieCellules([[doctorId, date], [doctorId2, date]]);
      const valA = readCell(`INDISPOS_${year}`, doctorId,  date);
      const valB = readCell(`INDISPOS_${year}`, doctorId2, date);
      writeCell(`INDISPOS_${year}`, doctorId,  date, valB);
      writeCell(`INDISPOS_${year}`, doctorId2, date, valA);
      break;
    }
    case 'transfertR': {
      /* (13/08/2026 — échanges, phase 3) La récupération d'un samedi transféré
         suit son samedi : le R du donneur (doctorId@date) passe au receveur
         (doctorId2@date), MÊME date — neutre pour l'effectif présent ce
         jour-là, donc aucun critère de pose à rejouer. Jamais de création
         d'un R neuf : les contraintes de pose vivent dans le générateur. */
      verifieCellules([[doctorId, date], [doctorId2, date]]);
      const valR = readCell(`GARDES_${year}`, doctorId, date);
      if (String(valR).toUpperCase() !== 'R') throw new Error(`${doctorId} n'a pas de R le ${date} — rien à transférer`);
      if (readCell(`GARDES_${year}`, doctorId2, date) !== '') throw new Error(`${doctorId2} n'est pas libre le ${date} — R à replacer manuellement`);
      refuseSiIndisponible(doctorId2, date, 'R à replacer manuellement');
      writeCell(`GARDES_${year}`, doctorId, date, '');
      writeCell(`GARDES_${year}`, doctorId2, date, 'R');
      break;
    }
    case 'gardeExceptionnelle': {
      const lendemain = nextDay(date);
      verifieCellules([[doctorId, date], [doctorId, lendemain]]);
      refuseSiGarde(doctorId, date, 'garde exceptionnelle impossible');
      refuseSiAdjacente(doctorId, date);
      writeCell(`GARDES_${year}`, doctorId, date, value || 'G');
      writeCell(`GARDES_${year}`, doctorId, lendemain, 'RG');
      break;
    }
    case 'echangeGarde': {
      /* (2026-08-05.12, CORRECTIF) TOUT VÉRIFIER AVANT D'ÉCRIRE. L'échange de
         la date principale était écrit AVANT le contrôle du repos de garde du
         lendemain : un refus laissait donc le classeur À MOITIÉ modifié — la
         garde avait changé de titulaire, le comité lisait « échange refusé »,
         et personne ne voyait la divergence (défaut trouvé au banc d'essai,
         scénario 39). Un geste doit être entièrement fait, ou entièrement
         refusé. */
      const jourRG = date2 || nextDay(date);
      verifieCellules([[doctorId, date], [doctorId2, date], [doctorId, jourRG], [doctorId2, jourRG]]);
      refuseSiGarde(doctorId,  jourRG, 'l\'echange deplacerait cette garde — a traiter manuellement');
      refuseSiGarde(doctorId2, jourRG, 'l\'echange deplacerait cette garde — a traiter manuellement');
      // Toutes les lectures AVANT la première écriture : aucune ne peut plus échouer ensuite.
      const valGardeA = readCell(`GARDES_${year}`, doctorId,  date);
      const valGardeB = readCell(`GARDES_${year}`, doctorId2, date);
      const valRGA    = readCell(`GARDES_${year}`, doctorId,  jourRG);
      const valRGB    = readCell(`GARDES_${year}`, doctorId2, jourRG);
      writeCell(`GARDES_${year}`, doctorId,  date,   valGardeB);
      writeCell(`GARDES_${year}`, doctorId2, date,   valGardeA);
      writeCell(`GARDES_${year}`, doctorId,  jourRG, valRGB);
      writeCell(`GARDES_${year}`, doctorId2, jourRG, valRGA);
      break;
    }
    case 'donGarde': {
      const valGarde = readCell(`GARDES_${year}`, doctorId, date);
      const jourRG = date2 || nextDay(date);
      verifieCellules([[doctorId, date], [doctorId2, date], [doctorId, jourRG], [doctorId2, jourRG]]);
      if (!estGarde(valGarde)) throw new Error(`${doctorId} n'a pas de garde le ${date} — rien a donner`);
      refuseSiGarde(doctorId2, date,   'don impossible');
      refuseSiGarde(doctorId2, jourRG, 'le repos de garde ecraserait cette garde — don impossible');
      refuseSiAdjacente(doctorId2, date);
      // (12/08/2026 — phase 2) Le receveur doit être disponible le jour de la
      // garde ET le lendemain (son repos de garde) : tout vérifié avant d'écrire.
      refuseSiIndisponible(doctorId2, date,   'don impossible');
      refuseSiIndisponible(doctorId2, jourRG, 'son repos de garde tomberait sur cette absence — don impossible');
      writeCell(`GARDES_${year}`, doctorId,  date,   '');
      writeCell(`GARDES_${year}`, doctorId2, date,   valGarde);
      writeCell(`GARDES_${year}`, doctorId,  jourRG, '');
      writeCell(`GARDES_${year}`, doctorId2, jourRG, 'RG');
      break;
    }
    case 'echangeGardeJours': {
      // Échange de DEUX gardes sur deux dates : doctorId@date <-> doctorId2@date2 (le rôle reste attaché à sa date).
      if (date === date2) throw new Error('Les deux dates doivent être différentes');
      const codeA = readCell(`GARDES_${year}`, doctorId,  date);
      const codeB = readCell(`GARDES_${year}`, doctorId2, date2);
      if (!/^G2?$/.test(String(codeA).toUpperCase())) throw new Error(`Pas de garde G/G2 pour ${doctorId} le ${date}`);
      if (!/^G2?$/.test(String(codeB).toUpperCase())) throw new Error(`Pas de garde G/G2 pour ${doctorId2} le ${date2}`);
      /* (12/08/2026 — demande le responsable) L'échange de deux gardes ADJACENTES
         (lundi/mardi) était refusé « à échanger manuellement ». La raison
         historique : les contrôles regardaient l'état de DÉPART, où le repos
         de l'un tombe sur la garde de l'autre — alors que l'état d'ARRIVÉE
         est parfaitement sain. On traite donc ce cas à part : préconditions
         strictes sur l'état de départ (celui que pose le générateur), puis
         écriture de l'état final calculé, cellule par cellule.
         A garde J, B garde J+1. Après échange : B garde J (repos J+1),
         A garde J+1 (repos J+2). Chaque date conserve son rôle G/G2. */
      const adjacent = (date2 === nextDay(date)) || (date === nextDay(date2));
      if (adjacent) {
        // Normalisation : dA = le premier jour, son titulaire tA ; dB = le lendemain, titulaire tB.
        const ordreDirect = (date2 === nextDay(date));
        const dA = ordreDirect ? date : date2;
        const dB = ordreDirect ? date2 : date;
        const tA = ordreDirect ? doctorId : doctorId2;
        const tB = ordreDirect ? doctorId2 : doctorId;
        const dC = nextDay(dB); // le surlendemain : repos final de tA
        const codeJ1 = readCell(`GARDES_${year}`, tA, dA); // rôle du 1er jour
        const codeJ2 = readCell(`GARDES_${year}`, tB, dB); // rôle du 2e jour
        verifieCellules([[tA, dA], [tB, dA], [tA, dB], [tB, dB], [tA, dC], [tB, dC]]);
        // Préconditions : l'état exact que pose le générateur, sinon on ne devine pas.
        if (String(readCell(`GARDES_${year}`, tA, dB)).toUpperCase() !== 'RG')
          throw new Error(`${tA} n'a pas son repos de garde le ${dB} — échange à traiter manuellement`);
        if (String(readCell(`GARDES_${year}`, tB, dC)).toUpperCase() !== 'RG')
          throw new Error(`${tB} n'a pas son repos de garde le ${dC} — échange à traiter manuellement`);
        if (readCell(`GARDES_${year}`, tB, dA) !== '')
          throw new Error(`${tB} n'est pas libre le ${dA} — échange à traiter manuellement`);
        if (readCell(`GARDES_${year}`, tA, dC) !== '')
          throw new Error(`${tA} n'est pas libre le ${dC} — échange à traiter manuellement`);
        // Vraies adjacences à l'ARRIVÉE : tB garderait dA avec une garde la veille,
        // tA garderait dB avec une garde le surlendemain.
        const veille = prevDay(dA);
        if (estGarde(readCell(`GARDES_${year}`, tB, veille)))
          throw new Error(`${tB} est de garde le ${veille} — deux gardes consecutives sont impossibles`);
        if (estGarde(readCell(`GARDES_${year}`, tA, nextDay(dC))))
          throw new Error(`${tA} est de garde le ${nextDay(dC)} — deux gardes consecutives sont impossibles`);
        // Disponibilité des jours nouvellement reçus (même règle que le don) :
        // tB reçoit la garde du ${dA}, tA reçoit celle du ${dB} et son repos glisse au ${dC}.
        refuseSiIndisponible(tB, dA, 'echange impossible');
        refuseSiIndisponible(tA, dC, 'son repos de garde tomberait sur cette absence — echange impossible');
        // Écriture de l'état final. Tout est vérifié : plus rien ne peut échouer.
        writeCell(`GARDES_${year}`, tA, dA, '');       // tA quitte le 1er jour
        writeCell(`GARDES_${year}`, tB, dA, codeJ1);   // tB le prend (rôle conservé)
        writeCell(`GARDES_${year}`, tA, dB, codeJ2);   // tA prend le 2e jour (écrase son propre RG)
        writeCell(`GARDES_${year}`, tB, dB, 'RG');     // repos de tB après sa nouvelle garde
        writeCell(`GARDES_${year}`, tA, dC, 'RG');     // repos de tA après la sienne
        writeCell(`GARDES_${year}`, tB, dC, '');       // l'ancien repos de tB s'efface
        break;
      }
      const rg1 = nextDay(date), rg2 = nextDay(date2);
      // refus si un MAR a déjà quelque chose à la date d'arrivée (évite d'écraser une garde existante)
      if (readCell(`GARDES_${year}`, doctorId, date2) || readCell(`GARDES_${year}`, doctorId2, date))
        throw new Error('Un des médecins a déjà une garde à l\'autre date — échange à traiter manuellement');
      // échange des gardes (chaque date conserve son rôle G/G2)
      writeCell(`GARDES_${year}`, doctorId,  date,  '');
      writeCell(`GARDES_${year}`, doctorId2, date,  codeA);
      writeCell(`GARDES_${year}`, doctorId2, date2, '');
      writeCell(`GARDES_${year}`, doctorId,  date2, codeB);
      // les repos de garde (RG) du lendemain suivent la personne
      writeCell(`GARDES_${year}`, doctorId,  rg1, '');
      writeCell(`GARDES_${year}`, doctorId2, rg1, 'RG');
      writeCell(`GARDES_${year}`, doctorId2, rg2, '');
      writeCell(`GARDES_${year}`, doctorId,  rg2, 'RG');
      break;
    }
    // (C3b) 'indispo'/'secteur'/'libre' retirés — écrivaient dans OVERRIDES (jamais lu).
    // Le placement secteur réel passe par savePlanningOverride → PLANNING_OVERRIDES.
    default:
      throw new Error(`Type de modification inconnu : ${type}`);
  }

  } catch (e) { _echec = e; }

  // (02/08/2026) Ces gestes ne laissaient aucune trace : LOGS ne disait rien d'un
  // don, d'un echange ou d'une garde exceptionnelle. Diagnostic aveugle garanti.
  logAction(`applyModification ${type} — ${date || ''}${date2 ? ' / ' + date2 : ''}`
    + `${doctorId ? ' | ' + doctorId : ''}${doctorId2 ? ' -> ' + doctorId2 : ''}`
    + `${mod.dryRun ? ' [contrôle seul]' : ''}`
    + `${_echec ? ' — REFUSE : ' + _echec.message : ' — OK'}`);
  if (_echec) throw _echec;

  // (13/08/2026) dryRun : rien n'a été écrit — pas de republication, pas de notifieur.
  if (mod.dryRun) return true;

  generatePlanning();
  // (01/08/2026) Un don, un echange de gardes ou de secteurs modifie le statut ou le
  // secteur des MAR concernes. On arme le notifieur comme le fait publishPlanning :
  // le filtre existant fait le tri (un statut part toujours, un secteur seulement
  // dans la fenetre de l'Excel). Isole : un echec du notifieur ne doit jamais faire
  // echouer la modification, qui est deja ecrite dans le classeur a ce stade.
  try { notifPlanifier(); }
  catch (e) { logAction('notifPlanifier apres modification : ' + e.message); }
  return true;
}

// ── STATUT CYCLE PLANNING ────────────────────────────────────────────
function getPlanningStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = TEST_YEAR;
  const nextYear = year + 1;
  const indNextSheet = ss.getSheetByName('INDISPOS_' + nextYear);
  const indisposN1Exists = !!indNextSheet;
  let indisposN1Complete = false, marsManquants = 0;
  if (indNextSheet) {
    const medSheet = ss.getSheetByName('MEDECINS');
    const medData = medSheet ? _medecinsRows_() : [];
    const actifs = [];
    for (let r = 1; r < medData.length; r++) {
      if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O') actifs.push(String(medData[r][COL_MED.ID]).trim());
    }
    const indData = indNextSheet.getDataRange().getValues();
    const indById = {};
    for (let r = 3; r < indData.length; r++) {
      const id = String(indData[r][0]).trim();
      if (!id) continue;
      indById[id] = indData[r].slice(1).some(v => String(v).trim() !== '');
    }
    marsManquants = actifs.filter(id => !indById[id]).length;
    indisposN1Complete = marsManquants === 0;
  }
  const gardesNextSheet = ss.getSheetByName('GARDES_' + nextYear);
  const gardesN1Generated = !!(gardesNextSheet && gardesNextSheet.getLastRow() > 3);
  // Vérifier la présence de stats_N.json sur GitHub Pages
let gardesNClosed = false;
try {
  const checkUrl = 'https://planningmedic.github.io/stats_' + year + '.json';
  const resp = UrlFetchApp.fetch(checkUrl, {muteHttpExceptions: true});
  gardesNClosed = resp.getResponseCode() === 200;
} catch(e) {
  gardesNClosed = false;
}
  return { indisposN1Exists, indisposN1Complete, marsManquants, gardesN1Generated, gardesNClosed, year, nextYear };
}

function _buildOverrides_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('OVERRIDES');
  if (!sheet) return { success:true, overrides:[], total:0, passed:0, upcoming:0 };
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0,0,0,0);
  const overrides = [];
  for (let r = 1; r < data.length; r++) {
    const raw = data[r][0];
    if (!raw) continue;
    let dateStr = raw instanceof Date
      ? `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'00')}-${String(raw.getDate()).padStart(2,'00')}`
      : String(raw).trim();
    if (!dateStr) continue;
    const isFuture = new Date(dateStr + 'T00:00:00') >= today;
    overrides.push({rowIndex:r+1, date:dateStr,
      doctorId:String(data[r][1]||'').trim().toUpperCase(),
      morning:String(data[r][2]||'').trim().toUpperCase(),
      afternoon:String(data[r][3]||'').trim().toUpperCase(),
      comment:String(data[r][4]||'').trim(), isFuture});
  }
  return { success:true, overrides,
    total:overrides.length,
    passed:overrides.filter(o=>!o.isFuture).length,
    upcoming:overrides.filter(o=>o.isFuture).length };
}

/* (19/08/2026) Écrit la grille complète des affectations dans l'onglet.
   Extrait du routeur pour être éprouvable au banc. Défaut corrigé : un MAR
   sans ligne existante (fiche créée après l'onglet)
   était ignoré EN SILENCE, et le journal comptait les données reçues, pas
   les lignes écrites (« 25 mis à jour » pour 24 écrites, constaté le 19/08
   au matin). La ligne manquante est désormais créée en bas de l'onglet,
   exactement comme le fait saveAffectationsMar trois écrans plus bas. */
function ecrireAffectations(sheet, aff) {
  const data = sheet.getDataRange().getValues();
  const idToRow = {};
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (id) idToRow[id] = r + 1;
  }
  let maj = 0, crees = 0;
  Object.keys(aff).forEach(doctorId => {
    const vals = [];
    for (let m = 1; m <= 12; m++) vals.push(aff[doctorId][m] || 'VOLANT');
    const rowNum = idToRow[doctorId];
    if (rowNum) { sheet.getRange(rowNum, 2, 1, 12).setValues([vals]); maj++; }
    else { sheet.appendRow([doctorId].concat(vals)); crees++; }
  });
  return { maj: maj, crees: crees };
}

// ── doPost — même logique que doGet ──────────────────────────────────
// ── (28/07/2026) CHRONOMETRE SERVEUR DANS CHAQUE REPONSE ─────────────
// Constat du jour : getMARsDispoJour = ~3 s cote serveur, 18,7 s cote
// navigateur — 15 s perdues quelque part entre Google et l'hopital, sans
// pouvoir dire ou. Chaque reponse JSON porte desormais sa duree d'execution
// reelle (_srv_ms) : chronoAPI() (admin.html) separe alors « serveur » et
// « transport+file », et le diagnostic se lit sans ouvrir le menu Executions.
// L'aiguillage historique est INTACT : doGet ne fait plus que le chronometrer.
/* (2026-08-05.11) Retire les lignes de PLANNING_OVERRIDES visant ce MAR à ces
   dates. Ciblage par (date, MAR) — JAMAIS par numéro de ligne : les rangs
   bougent entre le moment où on les lit et celui où on écrit. Même verrou et
   même normalisation de date que savePlanningOverridesBatch ; suppression de
   la FIN vers le DÉBUT (une suppression ne décale que les lignes en dessous). */
function retirerPlacementsPourDates(marId, dates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PLANNING_OVERRIDES');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const cible = String(marId || '').trim().toUpperCase();
  const jours = {};
  (dates || []).forEach(function (d) { jours[String(d).trim()] = true; });
  if (!cible || !Object.keys(jours).length) return 0;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { Logger.log('retirerPlacements : verrou indisponible, on continue'); }
  try {
    const data = sheet.getDataRange().getValues();
    const aSupprimer = [];
    for (let r = 1; r < data.length; r++) {
      const brut = data[r][0];
      const dateStr = brut instanceof Date
        ? `${brut.getFullYear()}-${String(brut.getMonth()+1).padStart(2,'0')}-${String(brut.getDate()).padStart(2,'0')}`
        : String(brut).trim();
      if (!jours[dateStr]) continue;
      if (String(data[r][1]).trim().toUpperCase() !== cible) continue;
      aSupprimer.push(r);
    }
    aSupprimer.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r + 1); });
    return aSupprimer.length;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function appliquerStatutJour(year, marIdBrut, statutBrut, datesBrutes) {
  const payload = { marId: marIdBrut, statut: statutBrut, dates: datesBrutes };
                  const marId  = String(payload.marId || '').trim().toUpperCase();
      const statut = String(payload.statut || '').trim().toUpperCase(); // '' = effacer
      const dates  = Array.isArray(payload.dates)
        ? payload.dates
        : (payload.date ? [String(payload.date)] : []);
      if (!marId || !dates.length) throw new Error('marId et date(s) requis');

      const ALLOWED = new Set(['', 'V', 'F', 'TP', 'CL', 'A', '18']);   // (31/07/2026) « I » retire : l'indispo de garde se pose dans INDISPOS
      if (!ALLOWED.has(statut)) throw new Error(`Statut non autorisé : ${statut}`);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(`GARDES_${year}`);
      if (!sheet) throw new Error(`GARDES_${year} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, year);

      let row = -1;
      for (let r = 3; r < data.length; r++) {
        if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
      }
      if (row < 0) throw new Error(`${marId} introuvable dans GARDES_${year}`);

      const GARDE_BLOCK = new Set(['G', 'G2', 'RG']); // garde + récup → échange/don
      const applied = [], rejected = [];
      dates.forEach(d => {
        const col = dateToCol[d];
        if (col === undefined) { rejected.push(`${d} (hors planning)`); return; }
        const current = String(data[row][col] || '').trim().toUpperCase();
        if (GARDE_BLOCK.has(current)) { rejected.push(`${d} (${current} → échange/don)`); return; }
        sheet.getRange(row + 1, col + 1).setValue(statut);
        applied.push(d);
      });

      if (applied.length) {
        /* (2026-08-05.11) LE DERNIER GESTE GAGNE. Constat de terrain : un MAR
           placé en secteur puis passé en TP restait affiché en secteur — la
           ligne de PLANNING_OVERRIDES survivait au changement de statut, et il
           fallait la supprimer à la main dans le classeur. Désormais, poser un
           statut d'ABSENCE retire les placements de ces jours-là pour ce MAR.
           Le TP y figure : poser un TP annule le placement du jour. L'inverse
           reste vrai et VOLONTAIRE — un MAR en TP peut être réquisitionné en
           dernier recours, il suffit de le placer APRÈS (le panneau le
           propose, et le placement, postérieur, tient).
           « 18 » (8h-18h) et l'effacement ('') ne retirent RIEN : ce ne sont
           pas des absences. */
        const STATUTS_RETIRANT_PLACEMENT = new Set(['V', 'F', 'TP', 'CL', 'A']);
        if (STATUTS_RETIRANT_PLACEMENT.has(statut)) {
          try {
            const _nbRet = retirerPlacementsPourDates(marId, applied);
            if (_nbRet) logAction(`setDailyStatus — ${_nbRet} placement(s) retiré(s) (${marId}, statut ${statut})`);
          } catch (e) { Logger.log('Retrait des placements : ' + e.message); }
        }
        try {
          const indMap = {'':'', 'V':'VAC', 'F':'FORM', 'TP':'TP', 'CL':'CL', 'A':'A', '18':'INDISPO'};
          const existing = getIndisposForDoctor(marId, year);
          applied.forEach(d => { existing[d] = indMap[statut]; });
          saveIndisposForDoctor(marId, existing, year);
        } catch(e) { Logger.log('Miroir INDISPOS: ' + e.message); }
        // (C3) plus d'auto-republication : déclenchée par le bouton « Publier » (action publishPlanning).
      }
      logAction(`setDailyStatus — ${marId} "${statut || '∅'}" ×${applied.length}, ${rejected.length} rejeté(s)`);
      return { applied: applied, rejected: rejected };
}

// ── Éligibles Noël/Jour de l'An (bandeau staff.html) ───────────────────
// Réutilise la rotation overdueKey du générateur : jamais-fait d'abord,
// puis l'année la plus ancienne. Exclut no_garde et les profils souhait_plafond,
// et les MAR hors année planning (date_debut/date_fin).
// PLANCHER = PLAFOND = 8 : il faut EXACTEMENT 8 MAR distincts. Les 4 dates
// (24/12, 25/12, 31/12, 01/01) portent chacune 2 gardes (G rea + G2 mat), et
// elles ne peuvent jamais tomber dans la meme unite de couplage (les couplages
// se font a +/-2 jours, ces dates sont espacees de 1 ou 7). Le bandeau doit
// donc toujours proposer 8 noms, meme si moins de MAR sont "en retard".
// Seuils EN DUR (30/07/2026). La lecture de CONFIG (NOEL_SEUIL_ANS / NOEL_PLANCHER /
// NOEL_PLAFOND) a ete SUPPRIMEE : aucune des trois lignes n'existait dans le classeur,
// donc c'etait une lecture d'onglet a chaque affichage du bandeau pour rien.
// SEUIL = 3 ans : "en retard" = jamais fait, ou pas fait depuis 3 ans.
/* (01/09/2026) CE QU'IL RESTE À POSER, pour chaque MAR.
   Un jour de congé se compte en jours TRAVAILLÉS : ni week-end, ni férié —
   la même règle que le serveur applique déjà au quota de vacances, et que
   l'écran du staff vient d'adopter.
   Les temps partiels en attente d'arbitrage (TPA) sont comptés à part : ils
   ne sont pas acquis, mais ils occupent une place dans le quota. */
function computeReliquats(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gardes = ss.getSheetByName('GARDES_' + year);
  const genere = !!gardes;
  const jf = getJoursFeries(year);
  const jf2 = getJoursFeries(year + 1);
  const ouvre = ds => {
    const d = new Date(ds + 'T12:00:00').getDay();
    return d !== 0 && d !== 6 && !jf.has(ds) && !jf2.has(ds);
  };
  /* Deux jeux de codes pour la même chose : INDISPOS parle en VAC/FORM/TP,
     GARDES en V/F/TP. Une table par source, jamais un mélange des deux. */
  const source = genere ? gardes : ss.getSheetByName('INDISPOS_' + year);
  if (!source) return { success: false, error: 'Ni GARDES_' + year + ' ni INDISPOS_' + year };
  const CODES = genere ? { V: 'vac', F: 'form', TP: 'tp' }
                       : { VAC: 'vac', FORM: 'form', TP: 'tp' };
  const data = source.getDataRange().getValues();
  const dates = genere ? null : reconstruireDatesHeaders(data, year);
  const d2c = genere ? buildDateToCol(data, year) : null;
  const colDate = [];
  if (genere) { Object.keys(d2c).forEach(ds => { colDate[d2c[ds]] = ds; }); }

  const poses = {};
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim(); if (!id) continue;
    const p = poses[id] = { vac: 0, form: 0, tp: 0 };
    for (let c = 1; c < data[r].length; c++) {
      const ds = genere ? colDate[c] : dates[c - 1];
      if (!ds || !ouvre(ds)) continue;
      const k = CODES[String(data[r][c] || '').trim().toUpperCase()];
      if (k) p[k]++;
    }
  }

  // Demandes de temps partiel non encore tranchées par le comité
  const attente = {};
  try { _tpDemandes_(year).forEach(x => { attente[x.mar] = (attente[x.mar] || 0) + 1; }); } catch (e) {}

  const FLAGS = getMedecinFlags();
  const med = _medecinsRows_();
  const lignes = [];
  for (let r = 1; r < med.length; r++) {
    const id = String(med[r][COL_MED.ID]).trim(); if (!id) continue;
    if (String(med[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
    const quotite = Number(med[r][COL_MED.QUOTITE]) || 100;
    const q = getQuotasConges(quotite);
    const p = poses[id] || { vac: 0, form: 0, tp: 0 };
    const att = attente[id] || 0;
    /* Un profil à jours fixes convenus ou en rythme deux semaines sur deux
       n'a pas de temps partiel à poser : afficher un quota lui inventerait
       des jours qu'il n'a pas. */
    const tpQuota = (FLAGS.rythme2sur2.has(id) || FLAGS.tpJoursFixes[id]) ? 0 : q.ctp;
    lignes.push({
      id: id, init: String(med[r][COL_MED.INITIALES] || '').trim() || id,
      nom: String(med[r][COL_MED.NOM] || '').trim(), quotite: quotite,
      vac:  { pose: p.vac,  quota: q.vac,  reste: q.vac  - p.vac },
      form: { pose: p.form, quota: q.form, reste: q.form - p.form },
      tp:   { pose: p.tp,   quota: tpQuota, attente: att,
              reste: Math.max(0, tpQuota - p.tp - att) }
    });
  }
  lignes.sort((a, b) => (b.vac.reste + b.form.reste + b.tp.reste)
                      - (a.vac.reste + a.form.reste + a.tp.reste)
                      || (a.id < b.id ? -1 : 1));
  return { success: true, year: year, genere: genere,
           source: genere ? 'GARDES_' + year : 'INDISPOS_' + year, lignes: lignes };
}

/* (01/09/2026) L'HISTORIQUE BRUT, pour le tableau du staff vacances.
   Une ligne par MAR pouvant tenir Noël, avec TOUTES ses années passées.
   Trié du plus ancien au plus récent — l'ordre de la rotation elle-même.

   AUCUN jugement n'est rendu ici : ni « prioritaire », ni liste des huit à
   servir. Décision du responsable du 01/09/2026 — il y a souvent plus de huit
   candidats légitimes, et désigner huit noms donnerait à un calcul le dernier
   mot sur un arbitrage qui revient au comité. L'écran montre, le comité
   décide. Le générateur, lui, garde sa propre règle pour l'attribution
   automatique : c'est computeNoelAnEligibles, inchangée.

   `postes` dit combien de médecins l'année mobilisait : QUATRE jusqu'en 2024
   (une garde par jour sur les quatre dates), HUIT depuis que la double garde
   est effective — octobre 2025, donc dès le Noël 2025. Sans ce chiffre, une
   année ancienne à quatre noms se lirait comme une année incomplète. */
const NOEL_AN_DOUBLE_GARDE_DEPUIS = 2025;   // 4 postes avant, 8 à partir de là
function noelAnPostes(annee) {
  return Number(annee) >= NOEL_AN_DOUBLE_GARDE_DEPUIS ? 8 : 4;
}

function computeNoelAnHistorique(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const FLAGS = getMedecinFlags();
  const planStart = toDateStr(getPremierJourPlanning(year));
  const planEnd   = toDateStr(new Date(getPremierJourPlanning(year + 1).getTime() - 86400000));
  const horsAnnee = id => { const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    if(df && df<planStart) return true; if(dd && dd>planEnd) return true; return false; };
  const detail = getNoelHistoryDetail(year);
  const out = [];
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const md = _medecinsRows_();
    for (let r = 1; r < md.length; r++) {
      const id = String(md[r][COL_MED.ID]).trim(); if (!id || id === 'DRUGE') continue;
      if (String(md[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
      if (FLAGS.noGarde.has(id)) continue;
      if (FLAGS.souhaitPlafond.has(id)) continue;
      if (horsAnnee(id)) continue;
      const annees = detail[id] || [];
      out.push({ id: id, init: String(md[r][COL_MED.INITIALES] || '').trim() || id,
                 nom: String(md[r][COL_MED.NOM] || '').trim(),
                 annees: annees,
                 last: annees.length ? annees[annees.length - 1] : null });
    }
  }
  out.sort(function (a, b) {
    const ka = a.last == null ? [0, 0] : [1, a.last];
    const kb = b.last == null ? [0, 0] : [1, b.last];
    return ka[0] - kb[0] || ka[1] - kb[1] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  /* Les années à afficher en colonnes, et ce que chacune mobilisait. On part
     de la plus ancienne trouvée, sans jamais dépasser huit colonnes : au-delà
     le tableau devient illisible sur un écran de portable. */
  const toutes = {};
  out.forEach(function (x) { x.annees.forEach(function (a) { toutes[a] = true; }); });
  let liste = Object.keys(toutes).map(Number).sort(function (a, b) { return a - b; });
  const fin = year - 1;
  if (!liste.length) liste = [fin];
  for (let a = liste[liste.length - 1] + 1; a <= fin; a++) liste.push(a);
  if (liste.length > 8) liste = liste.slice(liste.length - 8);
  /* ⚠️ `tenus` compte TOUT l'historique de l'année, pas les seules lignes
     affichées. Un médecin parti n'apparaît plus dans le tableau, mais il a bien
     tenu sa garde : le compter à part ferait annoncer un trou là où l'année est
     complète. Constaté sur les données réelles du 01/09 — deux anciens du
     service faisaient afficher « 3/4 » sur une année pourtant pleine. */
  const annees = liste.map(function (a) {
    let n = 0;
    Object.keys(detail).forEach(function (id) { if (detail[id].indexOf(a) >= 0) n++; });
    return { annee: a, postes: noelAnPostes(a), tenus: n };
  });
  return { mars: out, annees: annees };
}

function computeNoelAnEligibles(year, tous) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const SEUIL = 3, PLANCHER = 8, PLAFOND = 8;

  const FLAGS = getMedecinFlags();
  const planStart = toDateStr(getPremierJourPlanning(year));
  const planEnd   = toDateStr(new Date(getPremierJourPlanning(year + 1).getTime() - 86400000));
  const horsAnnee = id => { const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id]; if(df && df<planStart) return true; if(dd && dd>planEnd) return true; return false; };

  // Effectif éligible : actifs − no_garde − souhait_plafond − hors année
  const initMap = {}, eligibles = [];
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const md = _medecinsRows_();
    for (let r=1;r<md.length;r++){
      const id = String(md[r][COL_MED.ID]).trim(); if(!id || id==='DRUGE') continue;
      initMap[id] = String(md[r][COL_MED.INITIALES]||'').trim() || id;
      if (String(md[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
      if (FLAGS.noGarde.has(id)) continue;
      if (FLAGS.souhaitPlafond.has(id)) continue;
      if (horsAnnee(id)) continue;
      eligibles.push(id);
    }
  }

  // Historique Noël/An : source unique getNoelHistory(year) = HISTORIQUE ∪ onglets
  // GARDES_{Y} présents (voir code.gs). Prend en compte l'année générée mais pas
  // encore archivée, pour ne pas re-proposer qui vient de faire Noël l'an passé.
  const noelHistory = getNoelHistory(year);

  const overdueKey = m => { const ly=noelHistory[m]; return ly==null ? [0,0,m] : [1,ly,m]; };
  const cmp = (a,b)=>a[0]-b[0]||a[1]-b[1]||(a[2]<b[2]?-1:a[2]>b[2]?1:0);
  eligibles.sort((a,b)=>cmp(overdueKey(a),overdueKey(b)));

  // "En retard" = jamais fait OU pas fait depuis ≥ SEUIL ans
  const enRetard = eligibles.filter(id => { const ly=noelHistory[id]; return ly==null || (year-ly)>=SEUIL; });
  let finalIds = enRetard.slice();
  if (finalIds.length < PLANCHER) finalIds = eligibles.slice(0, PLANCHER);
  // (31/07/2026) `tous` : renvoie la liste COMPLETE, sans le plafond de 8. Le bandeau
  // du staff en affiche 8 ; a egalite d'annee le tri est ALPHABETIQUE, donc des
  // prioritaires legitimes restent invisibles. Le controle du W2 doit porter sur tous.
  if (!tous) finalIds = finalIds.slice(0, PLAFOND);

  return finalIds.map(id => ({ id, init: initMap[id]||id, last: (noelHistory[id]!=null ? noelHistory[id] : null) }));
}

/* (24/08/2026) Tri des placements caducs pour le Diagnostic : seul l'avenir
   mérite un avertissement — un conflit passé est de l'histoire, la
   publication a déjà affiché l'absence. Comparaison sur l'ISO 'yyyy-MM-dd' :
   aujourd'hui compte comme à venir. Pure, testée au banc. */
function _caducsTrier_(liste, aujourdhuiIso) {
  const futurs = [], passes = [];
  (liste || []).forEach(function (x) {
    (String(x && x.date) >= aujourdhuiIso ? futurs : passes).push(x);
  });
  return { futurs: futurs, passes: passes };
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "getStatsLive" ── */
function _act_getStatsLive(R) {
  const { e, payload, action, code, user } = R;
  const statsYear = Number(payload.year) || TEST_YEAR;
  try {
    return ContentService.createTextOutput(JSON.stringify({success:true, stats:computeStatsLive(statsYear)}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return _error(err.message); }
}

/* ── action "getReliquats" ── */
/* (01/09/2026) LE RELIQUAT DE CONGÉS, MAR par MAR.
   Après la génération, le comité place ce qui n'a pas été posé pendant la
   campagne : encore faut-il savoir ce qu'il reste. Le chiffre existait au
   staff, mais seulement pour les vacances, et seulement avant la
   génération. Ici : vacances, formations et temps partiels, à jour.
   ⚠️ La SOURCE change avec l'état de l'année. Tant que le planning n'est
   pas généré, tout vit dans INDISPOS_{Y}. Une fois généré, l'onglet
   Statuts écrit dans GARDES_{Y} et JAMAIS dans INDISPOS : compter dans
   INDISPOS raterait tout ce que le comité a posé depuis. GARDES fait donc
   foi dès qu'il existe. */
function _act_getReliquats(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const anR = Number(payload.year) || getActiveYear();
  return ContentService.createTextOutput(JSON.stringify(computeReliquats(anR)))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getNoelAnEligibles" ── */
function _act_getNoelAnEligibles(R) {
  const { e, payload, action, code, user } = R;
  const yr = parseInt(payload.year) || getIndisposYear();
  const _rep = { success: true, year: yr,
                 eligibles: computeNoelAnEligibles(yr, payload.tous === true) };
  /* (01/09/2026) `historique` : l'ÉQUIPE ENTIÈRE avec toutes ses années de
     Noël, pour le tableau du staff. Champ à part, volontairement : le
     contrôle du W2 (admin.html) travaille sur `eligibles`, c'est-à-dire les
     seuls PRIORITAIRES. Élargir cette liste-là ferait signaler comme
     bloquants des MAR que le comité n'a aucune raison de retenir. */
  if (payload.historique === true) _rep.historique = computeNoelAnHistorique(yr);
  return ContentService.createTextOutput(JSON.stringify(_rep))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "applyModification" ── */
function _act_applyModification(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  return ContentService.createTextOutput(JSON.stringify({
    success: applyModification(payload.modification)
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getStats" ── */
function _act_getStats(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const statsYear = Number(payload.year) || TEST_YEAR;
  // (03/08/2026) Repli archives, meme raison que getGardes ci-dessus.
  const ss = _ssWithSheet(`STATS_GARDES_${statsYear}`) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`STATS_GARDES_${statsYear}`);
  if (!sheet) return _error(`Onglet STATS_GARDES_${statsYear} introuvable`);
  const data = sheet.getDataRange().getValues();
  const stats = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
      g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
      jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
      recupR:data[r][12], h18:data[r][13],
      jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
  }
  return ContentService.createTextOutput(JSON.stringify({success:true, stats}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "generateGardes" ── */
function _act_generateGardes(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  logAction('DEBUG generateGardes: payload.year=' + payload.year + ' TEST_YEAR=' + TEST_YEAR);
  const yearToGenerate = Number(payload.year) || TEST_YEAR;
  logAction('DEBUG yearToGenerate=' + yearToGenerate);
  if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
  // ── (W2-R) Garde d'idempotence — même principe que archiveYear (15/07/2026).
  // Cas visé : la génération a RÉUSSI côté serveur mais la réponse s'est
  // perdue (réseau, onglet fermé, veille) → au réessai, generateGardes()
  // lèverait « GARDES_{Y} existe déjà — supprimez d'abord l'onglet », un
  // message que l'utilisateur pourrait suivre et DÉTRUIRE un planning valide.
  // Ici : si l'année est déjà générée ET cohérente, on ne régénère pas, on
  // renvoie les stats existantes et le wizard enchaîne sur publication/récaps.
  // Le verrou de generateGardes() reste intact (appel direct depuis l'éditeur).
  {
    const ssChk = SpreadsheetApp.getActiveSpreadsheet();
    const gChk = ssChk.getSheetByName(`GARDES_${yearToGenerate}`);
    const sChk = ssChk.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
    // Cohérence stricte : les DEUX onglets présents et STATS non vide
    // (au moins une ligne de données sous l'en-tête). Sinon → génération
    // réellement incomplète : on laisse le flux normal remonter l'erreur.
    if (gChk && sChk && sChk.getLastRow() > 1) {
      const dChk = sChk.getDataRange().getValues();
      const statsChk = [];
      for (let r = 1; r < dChk.length; r++) {
        if (!dChk[r][0]) continue;
        statsChk.push({medecin:dChk[r][0], cible:dChk[r][1], total:dChk[r][2],
          g:dChk[r][3], g2:dChk[r][4], lun:dChk[r][5], mar:dChk[r][6], mer:dChk[r][7],
          jeu:dChk[r][8], ven:dChk[r][9], sat:dChk[r][10], dim:dChk[r][11],
          recupR:dChk[r][12], h18:dChk[r][13],
          jf:dChk[r][14], vjf:dChk[r][15], vd:dChk[r][20], cSat:dChk[r][17],
          cJeu:dChk[r][18], cVd:dChk[r][19], cVjf:dChk[r][21], cJf:dChk[r][22]});
      }
      logAction(`generateGardes — ${yearToGenerate} déjà générée : reprise sans régénération (${statsChk.length} MARs)`);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, alreadyDone: true, stats: statsChk
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
let _genWarn = { warnings: [], nbWarnings: 0 };
try {
  _genWarn = generateGardes(yearToGenerate) || _genWarn;
  generatePlanning(yearToGenerate);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
    const data = sheet.getDataRange().getValues();
    const stats = [];
    for (let r = 1; r < data.length; r++) {
      if (!data[r][0]) continue;
      stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
        g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
        jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
        recupR:data[r][12], h18:data[r][13],
        jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
    }
    /* (01/09/2026) LES AVERTISSEMENTS DOIVENT SURVIVRE À LA FERMETURE DE
       L'ASSISTANT. Jusqu'ici LOGS ne gardait que leur NOMBRE : le contenu
       ne partait que dans le journal d'exécution d'Apps Script, invisible
       depuis l'application. Constaté le 01/09 — « il y a eu des
       avertissements mais je ne sais plus ce que c'était », et rien ne
       permettait de les retrouver. C'est précisément le moment où le comité
       en a besoin : ils disent quels replis l'algorithme a dû consentir.
       Plafond de 25 lignes : LOGS est purgé au-delà de 501 lignes, et le
       générateur peut en produire jusqu'à 60 — les écrire toutes chasserait
       le reste du journal. Le compte exact figure sur la ligne de tête. */
    logAction(`generateGardes ${yearToGenerate} — ${_genWarn.nbWarnings} avertissement(s)`);
    {
      const _w = _genWarn.warnings || [];
      const _MAX = 25;
      _w.slice(0, _MAX).forEach(function (t, k) {
        logAction(`  avertissement ${k + 1}/${_genWarn.nbWarnings} · ${yearToGenerate} : ${t}`);
      });
      if (_w.length > _MAX) {
        logAction(`  … ${_w.length - _MAX} avertissement(s) de plus, non détaillés (voir l'écran de génération)`);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true, stats,
      warnings: _genWarn.warnings, nbWarnings: _genWarn.nbWarnings}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    /* (LOT C · 01/09/2026) Un jour sans binôme n'est pas une panne : c'est
       un diagnostic. Le générateur attache la STRUCTURE (err.joursVides) ;
       la renvoyer telle quelle permet à l'écran de la mettre en forme.
       Sans elle, le comité recevait trente lignes aplaties en un seul
       paragraphe rouge, où le levier utile était noyé. */
    if (err && err.joursVides) {
      logAction('generateGardes ' + yearToGenerate + ' — bloqué : ' +
        err.joursVides.length + ' jour(s) sans binôme (' +
        err.joursVides.map(function (o) { return o.date; }).join(', ') + ')');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err.joursVides.length + ' jour(s) sans binôme de garde — rien n\'a été écrit.',
        joursVides: err.joursVides,
        messageComplet: err.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return _error(err.message);
  }
}

/* ── action "getGardes" ── */
function _act_getGardes(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const gYear = Number(payload.year) || TEST_YEAR;              // (C3) année paramétrable
  /* (03/08/2026) Repli sur le classeur d'archives : une annee cloturee voit ses
     onglets deplaces hors du maitre, et cet endpoint repondait « introuvable ».
     L'onglet Statuts et l'equite initiale d'une annee passee etaient donc morts. */
  const ss = _ssWithSheet(`GARDES_${gYear}`) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`GARDES_${gYear}`);
  if (!sheet) return _error(`Onglet GARDES_${gYear} introuvable`);
  const data = sheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(data, gYear);                // (C3) ancré 1er lundi → fin du décalage + queue janvier N+1
  const result = {};
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    Object.keys(dateToCol).forEach(date => {
      const val = String(data[r][dateToCol[date]] || '').trim();
      if (!val) return;
      if (!result[date]) result[date] = {};
      result[date][id] = val;
    });
  }
  return ContentService.createTextOutput(JSON.stringify({success:true, data:result, year:gYear}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "publishPlanning" ── */
function _act_publishPlanning(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  try {
    /* (2026-08-04.8) PUBLICATION COMBINEE : le lot de placements en
       attente arrive DANS le meme appel (payload.items) — un aller-retour
       au lieu de deux. Meme fonction que l'action dediee : lignes visees
       par (date, MAR), rejouable sans doublon. Lot vide ou absent :
       comportement inchange. */
    let _lotEcrit = 0;
    if (Array.isArray(payload.items) && payload.items.length) {
      const _resLot = savePlanningOverridesBatch(payload.items);
      _lotEcrit = (_resLot && _resLot.saved) || 0;
    }
    generatePlanning(Number(payload.year) || TEST_YEAR);
    // Notifications : arme le minuteur d'accalmie. Isolé : un échec ici
    // ne doit jamais faire échouer la publication.
    try { notifPlanifier(Number(payload.year) || TEST_YEAR); } catch (e) {}
    return ContentService.createTextOutput(JSON.stringify({
      success: true, message: `Planning ${TEST_YEAR} publié`, lotEcrit: _lotEcrit
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) { return _error(err.message); }
}

/* ── action "getOverrides" ── */
function _act_getOverrides(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  return ContentService.createTextOutput(JSON.stringify(_buildOverrides_()))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "deleteOverride" ── */
function _act_deleteOverride(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const rowIndex = Number(payload.rowIndex);
  if (!rowIndex || rowIndex < 2) return _error('Index invalide');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('OVERRIDES');
  if (!sheet) return _error('Onglet OVERRIDES introuvable');
  sheet.deleteRow(rowIndex);
  generatePlanning();
  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getAffectations" ── */
function _act_getAffectations(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const affYear = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${affYear}`);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({success:true, affectations:{}}))
    .setMimeType(ContentService.MimeType.JSON);
  const data = sheet.getDataRange().getValues();
  const affectations = {};
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    affectations[id] = {};
    for (let m = 1; m <= 12; m++) {
      const val = String(data[r][m]||'').trim();
      if (val) affectations[id][m] = val;
    }
  }
  return ContentService.createTextOutput(JSON.stringify({success:true, affectations}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveAffectations" ── */
function _act_saveAffectations(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const aff = payload.affectations;
  if (!aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affYear = Number(payload.year) || TEST_YEAR;
  const sheetName = `AFFECTATIONS_${affYear}`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return _error(`Onglet ${sheetName} introuvable`);
  const res = ecrireAffectations(sheet, aff);
  logAction(`saveAffectations — ${res.maj} MAR(s) mis à jour` +
        (res.crees ? `, ${res.crees} ligne(s) créée(s)` : ''));
  
  // ← AJOUT : republier le planning après chaque modification d'affectation
  try { generatePlanning(affYear); } catch(e) { Logger.log('generatePlanning error: ' + e.message); }

  return ContentService.createTextOutput(JSON.stringify({success:true}))
.setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveAffectationsMar" ── */
function _act_saveAffectationsMar(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  const aff = payload.affectations;
  if (!medecinId || !aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${TEST_YEAR}`);
  if (!sheet) return _error(`Onglet AFFECTATIONS_${TEST_YEAR} introuvable`);
  const data = sheet.getDataRange().getValues();
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(aff[m] || 'VOLANT');
  let found = false;
  for (let r = 1; r < data.length; r++) {
if (String(data[r][0]).trim().toUpperCase() === medecinId) {
  sheet.getRange(r + 1, 2, 1, 12).setValues([vals]);
  found = true; break;
}
  }
  if (!found) {
sheet.appendRow([medecinId, ...vals]);
  }
  logAction(`saveAffectationsMar — ${medecinId} mis à jour`);
  return ContentService.createTextOutput(JSON.stringify({success: true, created: !found}))
.setMimeType(ContentService.MimeType.JSON);
}

/* ── action "savePlanningOverride" ── */
// ── ACTION : savePlanningOverride ─────────────────────────────────────
// Appelé quand le comité place un MAR dans une case flash
// payload : { action, code, date, marId, morning, afternoon, comment }
function _act_savePlanningOverride(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const { date, marId, morning, afternoon, comment } = payload;
  if (!date || !marId) return _error('date et marId requis');
  try {
// Passer morning/afternoon TELS QUELS : null ou '' = « demi-jour non modifié »
// (savePlanningOverride ne touchera alors pas cette colonne). Plus de recopie matin→aprem.
savePlanningOverride(date, marId, morning, afternoon, comment || '');
logAction(`savePlanningOverride — ${marId} le ${date} → ${morning}`);
return ContentService.createTextOutput(JSON.stringify({success: true}))
  .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
return _error(e.message);
  }
}

/* ── action "savePlanningOverridesBatch" ── */
// ── ACTION : savePlanningOverridesBatch ───────────────────────────────
// Toute une rafale de placements du comité en UN appel (>20 par session mesurés).
// payload : { action, code, items:[{date, marId, morning, afternoon, comment}, …] }
// Exclue de WRITE_ACTIONS_LOCK comme l'unitaire : verrou dédié dans code.gs
// (même verrou de script → exclusion mutuelle avec l'unitaire et deleteOverride).
function _act_savePlanningOverridesBatch(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return _error('items requis');
  try {
const res = savePlanningOverridesBatch(items);
logAction(`savePlanningOverridesBatch — ${res.saved} placement(s) (${items.length} item(s) reçus)`);
return ContentService.createTextOutput(JSON.stringify({success: true, saved: res.saved}))
  .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
return _error(e.message);
  }
}

/* ── action "getPanneauSemaine" ── */
// ── ACTION : getPanneauSemaine ────────────────────────────────────────
// (28/07/2026) UN SEUL APPEL POUR TOUTE LA SEMAINE.
// Mesure du jour : une requete qui ne fait RIEN (17 ms de travail) coute 2 a 3 s
// d'attente a la porte d'entree Google — identique sur un deploiement neuf, donc
// hors de notre controle. Le seul levier est de payer ce peage moins souvent.
// Le panneau de placement coutait 2 appels PAR JOUR ouvert (dispos + liberal) ;
// il n'en coute plus qu'UN pour les 7 jours, lance en arriere-plan des l'affichage
// de la semaine. Au clic, le panneau s'ouvre sans aucun appel.
// Le surcout serveur est faible : les onglets (GARDES, AFFECTATIONS, MEDECINS)
// sont lus UNE fois pour les 7 jours, la ou getMARsDispoJour les relisait a chaque
// appel. Seule la boucle par jour se repete, sur des donnees deja en memoire.
// payload : { action, code, dates:[ '2026-08-03', … ] }  (1 a 10 dates)
function _act_getPanneauSemaine(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const dates = Array.isArray(payload.dates) ? payload.dates.map(function(d){ return String(d||'').trim(); }).filter(Boolean) : [];
  if (!dates.length) return _error('dates requises');
  if (dates.length > 10) return _error('10 dates maximum');
  try {
const ss = SpreadsheetApp.getActiveSpreadsheet();
// Une seule annee par appel : la semaine a cheval sur deux annees civiles reste
// dans la meme annee de planning (GARDES_{Y} couvre jusqu'a debut janvier).
const year = Number(dates[0].slice(0,4));
const gardesSheet = ss.getSheetByName('GARDES_' + year);
if (!gardesSheet) return _error('GARDES_' + year + ' introuvable');

// ── Lectures MUTUALISEES : une fois pour les 7 jours ──
const gardesData = gardesSheet.getDataRange().getValues();
const dateToCol  = buildDateToCol(gardesData, year);
const affSheet   = ss.getSheetByName('AFFECTATIONS_' + year);
const affData    = affSheet ? affSheet.getDataRange().getValues() : null;
const medSheet   = ss.getSheetByName('MEDECINS');
const actifs = [];
const initMap = {};
if (medSheet) {
  const medData = _medecinsRows_();
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    if (!id) continue;
    initMap[id] = String(medData[r][COL_MED.INITIALES] || '').trim();
    if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O') actifs.push(id);
  }
}
const FLAGS = getMedecinFlags();
// Affectations par mois : memoisees, la semaine ne couvre au plus que deux mois.
const affParMois = {};
const _affDuMois = function (monthIdx) {
  if (affParMois[monthIdx]) return affParMois[monthIdx];
  const m = {};
  if (affData) {
    for (let r = 1; r < affData.length; r++) {
      const id = String(affData[r][0]).trim();
      if (!id) continue;
      m[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
    }
  }
  affParMois[monthIdx] = m;
  return m;
};
/* (04/08/2026, etage 2) CŒUR PARTAGÉ — la logique de tri vit desormais
   dans calculerDispoJour (fichier `dispo_jour`, source unique du depot :
   partage/dispo_jour.js, incluse A L'IDENTIQUE cote frontend).
   Equivalence prouvee par test-oracle (400 cas) avant extraction.
   Toute evolution du tri se fait LA-BAS et se deploie des deux cotes. */
const jours = {};
dates.forEach(function (targetDate) {
  const colIdx = dateToCol[targetDate];
  if (colIdx === undefined) { jours[targetDate] = {dispo: [], absent: true}; return; }
  const codeById = {};
  for (let r = 3; r < gardesData.length; r++) {
    const gid = String(gardesData[r][0]).trim();
    if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
  }
  jours[targetDate] = { dispo: calculerDispoJour(targetDate, {
    actifs: actifs, initiales: initMap,
    affectationDuMois: _affDuMois(new Date(targetDate + 'T12:00:00').getMonth() + 1),
    codeById: codeById, flags: FLAGS,
  }) };
});

// ── Liberal : l'onglet LIBERAL_{Y} lu UNE fois pour les 7 jours ──
// (listLiberalJour le relisait entierement a chaque jour ouvert)
const liberal = {};
dates.forEach(function (d) { liberal[d] = []; });
try {
  // ⚠️ Une semaine peut chevaucher DEUX annees civiles (28/12 → 03/01), et les
  // declarations sont rangees par annee civile de la DATE DE BLOC. Lire le seul
  // onglet du lundi faisait disparaitre les interventions de janvier (mesure du
  // 29/07/2026 : 3 jours en 2026→2027, 6 en 2029→2030). On lit chaque annee
  // presente dans la semaine. (Ici c'est bien l'annee CIVILE, pas anneePlanning :
  // les onglets LIBERAL_{Y} suivent le releve, qui est calendaire.)
  const _libAns = {};
  dates.forEach(function (d) { _libAns[_libYearOf(d)] = true; });
  Object.keys(_libAns).forEach(function (_an) {
    const libSh = ss.getSheetByName(_libSheetName(Number(_an)));
    if (!libSh) return;
    const libData = libSh.getDataRange().getValues();
    for (let r = 1; r < libData.length; r++) {
      const dBloc = _isoDate(libData[r][2]);
      if (!liberal.hasOwnProperty(dBloc)) continue;
      liberal[dBloc].push({
        id:         String(libData[r][0]),
        marId:      String(libData[r][3]).trim(),
        secteur:    String(libData[r][4]).trim().toUpperCase(),
        chirurgie:  String(libData[r][5] || '').trim(),
        specialite: String(libData[r][6] || '').trim().toUpperCase(),
        brCcam:     _libMoney_(libData[r][7]),
        brNgap:     _libMoney_(libData[r][8]),
      });
    }
  });
  Object.keys(liberal).forEach(function (d) {
    liberal[d].sort(function (a, b) { return String(a.marId).localeCompare(String(b.marId)); });
  });
} catch(e) {
  // Le volet liberal est un confort : son echec ne doit jamais priver le comite
  // des dispos. On renvoie des listes vides plutot qu'une erreur.
}

return ContentService.createTextOutput(JSON.stringify({
  success: true, dates: dates, jours: jours, liberal: liberal
})).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
return _error(e.message);
  }
}

/* ── action "getMARsDispoJour" ── */
// ── ACTION : getMARsDispoJour ─────────────────────────────────────────
// Retourne les MARs disponibles un jour donné pour le popup "combler case flash"
// Groupés par rôle : VOLANT / CTP / R / autres présents
// payload : { action, code, date }
function _act_getMARsDispoJour(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const targetDate = String(payload.date || '').trim();
  if (!targetDate) return _error('date requise');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(targetDate.slice(0,4));
  const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
  if (!gardesSheet) return _error(`GARDES_${year} introuvable`);

  const gardesData = gardesSheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(gardesData, year);
  const colIdx = dateToCol[targetDate];
  if (colIdx === undefined) return _error(`Date ${targetDate} introuvable dans GARDES_${year}`);

  const affSheet = ss.getSheetByName(`AFFECTATIONS_${year}`);
  const medSheet = ss.getSheetByName('MEDECINS');

  // Lire l'affectation de chaque MAR
  const affMap = {}; // marId → secteur
  if (affSheet) {
const affData = affSheet.getDataRange().getValues();
const dt = new Date(targetDate + 'T12:00:00');
const monthIdx = dt.getMonth() + 1; // 1-12
for (let r = 1; r < affData.length; r++) {
  const id = String(affData[r][0]).trim();
  if (!id) continue;
  // Colonne du mois (1=JAN, 2=FEV, ... 12=DEC)
  affMap[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
}
  }

  // Lire les actifs depuis MEDECINS
  const actifs = new Set();
  const initMap = {};
  if (medSheet) {
const medData = _medecinsRows_();
for (let r = 1; r < medData.length; r++) {
  const id = String(medData[r][COL_MED.ID]).trim();
  if (!id) continue;
  initMap[id] = String(medData[r][COL_MED.INITIALES] || '').trim();   // colonne INITIALES
  if (String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O') actifs.add(id);
}
  }

  const FLAGS = getMedecinFlags(); // (C2-D2) date_debut/date_fin externalisées → MEDECINS

  // (C2-D2) Index des codes GARDES par MAR (un MAR sans ligne GARDES → code vide).
  const codeById = {};
  for (let r = 3; r < gardesData.length; r++) {
const gid = String(gardesData[r][0]).trim();
if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
  }

  /* (04/08/2026, etage 2) CŒUR PARTAGÉ — meme delegation que getPanneauSemaine :
 calculerDispoJour (fichier `dispo_jour` / partage/dispo_jour.js). L'iteration
 sur l'effectif MEDECINS actifs (C2-D2) et toutes les regles (TP fixes C2-D3,
 bornes, rythme 2/2, tri VOLANT en tete) vivent dans le module. */
  const dispo = calculerDispoJour(targetDate, {
actifs: Array.from(actifs), initiales: initMap,
affectationDuMois: affMap, codeById: codeById, flags: FLAGS,
  });

  return ContentService.createTextOutput(JSON.stringify({
success: true, date: targetDate, dispo
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "setDailyStatus" ── */
/* (10/09/2026) ENVOI DES CODES SUPPRIMÉ — l'action `sendCodesWithRecap`
   terminait le W1 par un mail portant trois choses : le code d'accès, le
   récap des congés posés au staff, et l'annonce de l'ouverture.
   Les trois ont perdu leur raison d'être : le code des indispos est devenu
   celui du portail (plus rien à rappeler), les VAC/FORM verrouillés sont
   consultables dans « Mes indispos » avec leur cadenas, et l'ouverture
   s'annonce de vive voix — le staff est justement en séance à ce moment-là.
   `renderRecapMailBlocks_` est partie avec : plus aucun appelant.
   L'ouverture de la saisie N'A JAMAIS été faite ici : elle est écrite à
   l'étape 4, par setIndisposYear (INDISPOS_ACTIVE). Rien n'a changé de ce
   côté. */
function _act_setDailyStatus(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  /* (2026-08-05.9) Corps extrait dans appliquerStatutJour — une seule
     source pour le routage et l'applicateur du journal. */
  try {
    const res = appliquerStatutJour(
      Number(payload.year) || TEST_YEAR,
      payload.marId, payload.statut,
      Array.isArray(payload.dates) ? payload.dates : (payload.date ? [String(payload.date)] : []));
    return ContentService.createTextOutput(JSON.stringify({ success: true, applied: res.applied, rejected: res.rejected }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) { return _error(e.message); }
}

/* ── action "getAffectationsJson" ── */
function _act_getAffectationsJson(R) {
  const { e, payload, action, code, user } = R;
  const jy = parseInt(payload.year) || getActiveYear();
  const raw = readPlanningFromDrive(`affectations_${jy}.json`);
  if (!raw) return _error(`affectations_${jy}.json introuvable dans le Drive`);
  return ContentService.createTextOutput(JSON.stringify({success:true, affectations: JSON.parse(raw)}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getPlanningJson" ── */
// ── JSON du planning (Drive) — consommés par planning.html / index.html ──
// (Reconstruits après la régression de recopie : ils n'existaient qu'en prod.)
function _act_getPlanningJson(R) {
  const { e, payload, action, code, user } = R;
  const jy = parseInt(payload.year) || getActiveYear();
  const raw = readPlanningFromDrive(`planning_${jy}.json`);
  if (!raw) return _error(`planning_${jy}.json introuvable dans le Drive`);
  return ContentService.createTextOutput(JSON.stringify({success:true, planning: JSON.parse(raw)}))
    .setMimeType(ContentService.MimeType.JSON);
}
