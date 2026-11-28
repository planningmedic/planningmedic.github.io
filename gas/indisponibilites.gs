/* ═══════════════════════════════════════════════════════════════════════
   INDISPONIBILITES — Indisponibilités : lecture/écriture des INDISPOS_<annee>, souhaits, figeage, vacances (périodes, groupes, quotas), absences longues, fériés et ponts
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_INDISPOS_METIER = '2026-11-28.4';   // (28/11/2026) .4 : Mes consultations — une ligne de l'export retirée est servie grisée (retire), pour pouvoir la remettre · .3 : PDF du récapitulatif aux couleurs uniques du portail (Réa bleu, Mater-Bloc rouge, 18 h orange, formation jaune) · .2 : Mes consultations — les confrères placés dans le secteur de la consultation passent en tête de « Qui appeler » (placements servis à la page) · (28/11/2026) .1 : Mes consultations — un patient « réglé » (avec ou sans confrère nommé) n'est plus montré qu'à celui qui l'a noté ; numéros de DECT du groupement servis à la page · (27/11/2026) .7 : congé long — les offres de bourse et propositions devenues sans objet sont fermées aussitôt · .6 : saveIndisposBatch enregistre janvier N+1 (JANVIER_SUIVANT), getVacancesConfig l'envoie · .5 : plus aucun montant de marge envoyé, seulement le rang · .4 : getVacancesConfig envoie les reliquats (onglet Récap du comité) · .3 : patients lib ouverts à tout le groupement libéral · .2 : getVacConfig envoie le reliquat de l'année précédente (staff vacances : janvier pris d'abord dessus) · .1 : marge NGAP renvoyée avec la marge CCAM (classement des confrères) · (26/11) .4 : consultation du secteur sans patient lib : plus montrée · .3 : consultations tenues par le secteur — les MAR du secteur du bloc la voient, celui qui la fait la prend (op secteur), choix « aucune salle » · .2 : export CPA — importCpa (droit maintenance, onglet CPA_EXPORT), rattachement des consultations aux salles (CPA_SALLES), lignes CPA servies dans getConsultAbsences, op salle et lignes cpa| dans patientsLib · .1 : patients lib d'une consultation — action patientsLib (droit patlib, onglet PATIENTS_LIB) et patients servis dans getConsultAbsences · (25/11/2026) .2 : action getRecapPdf (PDF du récapitulatif pour le MAR connecté) ; getOrdreVacances répond aussi pour y+2 · .1 : saveIndispos accepte la pose libre des vacances (payload.vac, voir _poserVac_ dans temps_partiel.gs) · (20/11/2026) .1 : setIndisposYear et envoyerRecapIndispos réservés au responsable · (15/11/2026) clearIndisposYear réservé au droit Maintenance (clôture d'année) · (10/11/2026) PDF récapitulatif par document Google (les couleurs passent) + renvoyerRecapPdf2027 · (09/11/2026) mail « Vos gardes » : 18 h, souhaits honorés, gardes qui allongent les vacances · (27/10/2026) VM/VA posés à la main : jamais écrasés par un enregistrement (MAR ou staff)
// précédente : '2026-10-22.2'

// La campagne de saisie des indispos est-elle EN COURS ?
// La ligne INDISPOS_ACTIVE de CONFIG n'existe que pendant la campagne :
//   - Wizard 1 (octobre)  → setIndisposYear() la CRÉE
//   - Wizard 3 (clôture)  → clearIndisposYear() la SUPPRIME
// Sa seule présence est donc l'indicateur — aucun réglage supplémentaire à tenir
// à jour. Attention : getIndisposYear() ne permet PAS de le savoir, car il se
// replie silencieusement sur getActiveYear() quand la ligne est absente.
/* (26/08/2026) Campagne FIGÉE : le planning de l'année de campagne existe déjà
   (généré), les indispos ne changent plus rien — l'écran indispos passe en
   lecture seule et la tuile du portail l'annonce. SOURCE UNIQUE : l'écran
   (getVacConfig) et la clé `acces` du miroir lisent tous deux ici. */
function _indisposFigees_() {
  return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GARDES_' + getIndisposYear());
}

/* (11/10/2026) FIN DE SAISIE. La ligne INDISPOS_FIN de CONFIG (une date) ferme la
   saisie des MAR à minuit le soir de cette date, heure de Paris : le 30/10/2026
   ferme le samedi 31/10 à 00:00. Le comité génère ensuite (le lundi suivant).
   L'administrateur peut toujours enregistrer. Sans la ligne : pas de date limite
   (comportement d'avant). Ouvrir une campagne la pose d'office au dernier vendredi
   d'octobre de l'année précédente (_dernierVendrediOctobre_). */
function _finSaisieIndispos_() {
  try {
    const data = _configRows_();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() !== 'INDISPOS_FIN') continue;
      const v = data[r][1];
      if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Europe/Paris', 'yyyy-MM-dd');
      const t = String(v).trim();
      let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return t;
      m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      return null;
    }
  } catch (e) {}
  return null;
}
function _saisieClose_(maintenant) {
  const fin = _finSaisieIndispos_();
  if (!fin) return false;
  return Utilities.formatDate(maintenant || new Date(), 'Europe/Paris', 'yyyy-MM-dd') > fin;
}
function _dernierVendrediOctobre_(annee) {
  const d = new Date(annee, 9, 31, 12, 0, 0);
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  return annee + '-10-' + ('0' + d.getDate()).slice(-2);
}
function _libelleFinSaisie_(fin) {
  const J = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, Number(fin.slice(8, 10)), 12);
  return J[d.getDay()] + ' ' + d.getDate() + ' ' + M[d.getMonth()];
}

function _indisposOuverte_() {
  try {
    const data = _configRows_();   // memo de CONFIG (code.gs)
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
        return !isNaN(parseInt(String(data[r][1]).trim()));
      }
    }
  } catch (e) {}
  return false;
}

// ── LIRE INDISPOS D'UN MAR ────────────────────────────────────────────
function getIndisposForDoctor(doctorId, year) {
  year = year || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, year); // (C3b) helper unifié
  // MARs à partir de la ligne 4 (index 3)
  for (let r = 3; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(doctorId).trim()) {
      const indispos = {};
      dates.forEach((date, i) => {
        if (!date) return;
        const val = String(data[r][i+1]||'').trim();
        if (val) indispos[date] = val;
      });
      return indispos;
    }
  }
  return {};
}

function _fusionIndispos_(existant, envoye, estRoleComite) {
  const out = {};
  const auComite = v => CODES_COMITE.has(String(v || '').trim().toUpperCase());
  const demiVac = v => CODES_DEMI_VAC.has(String(v || '').trim().toUpperCase());
  // 1) conserver les cases de L'AUTRE proprietaire, telles qu'en base —
  //    et TOUJOURS les demi-journees de vacances (VM/VA), posees a la main
  //    dans le classeur : aucun ecran n'en est proprietaire.
  Object.keys(existant || {}).forEach(function (d) {
    const v = String(existant[d] || '').trim();
    if (v && (demiVac(v) || auComite(v) !== estRoleComite)) out[d] = v;
  });
  // 2) poser MES cases telles qu'envoyees (une date absente = retrait)
  Object.keys(envoye || {}).forEach(function (d) {
    const v = String(envoye[d] || '').trim();
    if (!v) return;
    if (demiVac(v) || demiVac(out[d])) return;  // VM/VA : intouchables depuis un ecran
    if (auComite(v) !== estRoleComite) return;  // code hors de mon perimetre : ignore
    if (estRoleComite) { out[d] = v; return; }  // le comite ecrase (verrou vacances)
    if (out[d]) return;                         // MAR : case VAC/FORM intouchable
    out[d] = v;
  });
  return out;
}

// ── SAUVEGARDER INDISPOS D'UN MAR ────────────────────────────────────
function saveIndisposForDoctor(doctorId, indisposMap, year) {
  year = year || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, year); // (C3b) helper unifié
  // MARs à partir de la ligne 4 (index 3)
  for (let r = 3; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(doctorId).trim()) {
      const rowValues = dates.map(date => date ? (indisposMap[date] || '') : '');
      sheet.getRange(r + 1, 2, 1, rowValues.length).setValues([rowValues]);
      return true;
    }
  }
  return false;
}

/* ── (23/08/2026) ÉCRIRE LE TEMPS PARTIEL DANS LA GRILLE DU PLANNING ──────
   GARDES_{Y} est l'onglet MAÎTRE. Un TP accordé s'y écrit, et nulle part
   ailleurs. Règles gravées :
     · on n'écrit QUE dans une case VIDE — jamais par-dessus une garde, un
       repos, une récupération, un 18h, un congé ou une formation ;
     · on n'efface QUE si la case porte exactement TP ;
     · lecture immédiatement avant écriture : entre l'affichage et le clic, un
       échange de gardes a pu remplir la case.
   Renvoie true si la grille a changé — l'appelant republie alors le planning. */
/* (LOT A · 01/09/2026) Efface la case TP d'un MAR dans INDISPOS_{Y}, et rien
   d'autre : si la case porte un autre code (vacances posées depuis par le
   comité, indisponibilité), on n'y touche pas. Silencieux si l'onglet ou la
   date n'existent pas — un retrait ne doit jamais faire échouer une pose. */
function _tpRetirerDIndispos_(annee, marId, ds) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('INDISPOS_' + annee);
    if (!sh) return false;
    const d = sh.getDataRange().getValues();
    const dates = reconstruireDatesHeaders(d, annee);
    const col = dates.indexOf(ds);
    if (col < 0) return false;
    for (let r = 3; r < d.length; r++) {
      if (String(d[r][0]).trim() !== String(marId).trim()) continue;
      if (String(d[r][col + 1] || '').trim().toUpperCase() !== 'TP') return false;
      sh.getRange(r + 1, col + 2).setValue('');
      return true;
    }
  } catch (e) { logAction('_tpRetirerDIndispos_ ' + marId + ' ' + ds + ' : ' + e.message); }
  return false;
}

// ── (RH-1) GARANTIR LES LIGNES D'UN MAR DANS LES ONGLETS ANNUELS ──────
// Un MAR créé/réactivé APRÈS l'init d'une année n'a de ligne ni dans
// INDISPOS_{Y}, ni dans GARDES_{Y}, ni dans AFFECTATIONS_{Y} → indispos
// impossibles à saisir (échec silencieux), don/échange/garde exceptionnelle
// en erreur « introuvable », affectations sautées. Ce helper ajoute les
// lignes manquantes (année active et suivantes) ; idempotent, n'écrase rien.
function ensureMarRows(marId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const id = String(marId).trim().toUpperCase();
  const created = [];
  if (!id) return created;
  const activeYear = getActiveYear();
  const years = [];
  ss.getSheets().forEach(sh => {
    const m = sh.getName().match(/^INDISPOS_(\d{4})$/);
    if (m && Number(m[1]) >= activeYear) years.push(Number(m[1]));
  });
  years.sort();
  years.forEach(y => {
    _ensureRowInSheet_(ss, `INDISPOS_${y}`, id, 4, created);      // MARs dès la ligne 4
    _ensureRowInSheet_(ss, `GARDES_${y}`, id, 4, created);        // idem (si année générée)
    _ensureRowInSheet_(ss, `AFFECTATIONS_${y}`, id, 2, created);  // MARs dès la ligne 2
  });
  return created;
}

// Ajoute une ligne [id] en bas de sheetName si l'id n'y figure pas déjà.
// firstDataRow = première ligne de données MAR (1-indexé). Copie le format
// de la dernière ligne existante (zébrures WE, bordures) pour rester lisible.
function _ensureRowInSheet_(ss, sheetName, id, firstDataRow, created) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;                                  // onglet absent → rien à faire
  const last = sheet.getLastRow();
  if (last >= firstDataRow) {
    const ids = sheet.getRange(firstDataRow, 1, last - firstDataRow + 1, 1).getValues();
    for (let i = 0; i < ids.length; i++)
      if (String(ids[i][0]).trim().toUpperCase() === id) return;  // déjà présent
  }
  const newRow = Math.max(last, firstDataRow - 1) + 1;
  if (last >= firstDataRow) {
    const nCols = sheet.getLastColumn();
    sheet.getRange(last, 1, 1, nCols).copyTo(sheet.getRange(newRow, 1, 1, nCols), {formatOnly: true});
  }
  sheet.getRange(newRow, 1).setValue(id);
  created.push(sheetName);
}

function _getVacShared(year) {
  if (_VAC_SHARED[year]) return _VAC_SHARED[year];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gs = ss.getSheetByName('GROUPES_VAC');
  const ps = ss.getSheetByName('PERIODES_VAC');
  const is_ = ss.getSheetByName(`INDISPOS_${year}`);
  const ms = ss.getSheetByName('MEDECINS');
  _VAC_SHARED[year] = {
    groupData: gs ? gs.getDataRange().getValues() : [],
    perData:   ps ? ps.getDataRange().getValues() : [],
    indData:   is_ ? is_.getDataRange().getValues() : null,
    medData:   ms ? _medecinsRows_() : [],
    jfYear:     getJoursFeries(year),
    jfNextYear: getJoursFeries(year + 1),
  };
  return _VAC_SHARED[year];
}

/* ── ORDRE DE PASSAGE DES VACANCES — bandeau « Mes congés » ───────────────
   (13/08/2026) Répond pour DEUX années d'un coup, et c'est ce qui impose une
   fonction séparée de getVacConfig : celle-ci part de PERIODES_VAC, qui ne
   contient que les périodes de l'année de campagne, et de INDISPOS_{Y}, qui
   n'existe pas encore pour l'année suivante. L'ordre de passage, lui, ne
   dépend que de GROUPES_VAC et de l'année : il est donc calculable pour
   n'importe quelle année, même sans campagne ouverte.

   SENS DE ROTATION : à DROITE, le dernier repasse premier — pour les groupes
   entre eux comme pour les membres d'un groupe. C'est le sens de l'écran
   d'arbitrage, seul à faire foi (défaut du 30/07/2026 : le serveur tournait à
   gauche, les deux ordres ne coïncidaient qu'une année sur trois).

   NE RENVOIE QUE DES IDENTIFIANTS de MAR, jamais d'adresse ni de code. */
function getOrdreVacances(doctorId, annees) {
  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };
  const PERIODES = [
    ['Hiver','HIVER'], ['Printemps','PRINTEMPS'], ['Été','ETE'],
    ['Toussaint','TOUSSAINT'], ['Noël','NOEL'],
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gs = ss.getSheetByName('GROUPES_VAC');
  if (!gs) return { annees: [] };
  const gd = gs.getDataRange().getValues();

  const groupes = { A: [], B: [], C: [] };
  const ordreBase = { A: {}, B: {}, C: {} };
  for (let r = 1; r < gd.length; r++) {
    const grp = String(gd[r][0]).trim();
    const id  = String(gd[r][1]).trim();
    const ord = Number(gd[r][2]);
    if (!id || !groupes[grp]) continue;
    groupes[grp].push(id);
    ordreBase[grp][id] = ord;
  }

  const out = [];
  (annees || []).forEach(function (an) {
    const offset = Number(an) - 2026;
    const ordonne = {};
    ['A','B','C'].forEach(function (g) {
      const tri = [...groupes[g]].sort((a,b) => ordreBase[g][a] - ordreBase[g][b]);
      const n = tri.length;
      const sh = n ? (((n - (offset % n)) % n) + n) % n : 0;
      ordonne[g] = [...tri.slice(sh), ...tri.slice(0, sh)];
    });

    let monGroupe = null, monRang = 0;
    ['A','B','C'].forEach(function (g) {
      const i = ordonne[g].indexOf(doctorId);
      if (i > -1) { monGroupe = g; monRang = i + 1; }
    });

    const gsh = (((3 - (offset % 3)) % 3) + 3) % 3;
    const periodes = PERIODES.map(function (p) {
      const arr = (ORDRE_BASE_2026[p[1]] || 'ABC').split('');
      return { nom: p[0], ordre: [...arr.slice(gsh), ...arr.slice(0, gsh)] };
    });

    out.push({
      annee: Number(an),
      monGroupe: monGroupe,
      monRang: monRang,
      tailleGroupe: monGroupe ? ordonne[monGroupe].length : 0,
      groupes: ordonne,
      periodes: periodes,
    });
  });
  return { annees: out };
}

function getVacConfig(doctorId, year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const _ctx = _getVacShared(year);

  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };

  function premierJourAnneePlanning(y) {
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay();
    const offset = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
    const d = new Date(y, 0, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  const groupData = _ctx.groupData;
  const groups = { A: [], B: [], C: [] };
  const ordre2026 = { A: {}, B: {}, C: {} };
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim();
    const id  = String(groupData[r][1]).trim();
    const ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id);
    ordre2026[grp][id] = ord;
  }

  const offset = year - 2026;
  function getOrderedGroup(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const shift = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite, cf. grpShift
    return [...sorted.slice(shift), ...sorted.slice(0, shift)];
  }
  const orderedA = getOrderedGroup('A');
  const orderedB = getOrderedGroup('B');
  const orderedC = getOrderedGroup('C');

  const perData = _ctx.perData;
  const debutAnnee = premierJourAnneePlanning(year);
  const finAnnee = premierJourAnneePlanning(year + 1);

  const indData = _ctx.indData;
  if (!indData) return { periodes: [], quotaVac: 40, totalVacDoc: 0 };

  const jan1Ind = new Date(year, 0, 1);
  const dow1Ind = jan1Ind.getDay();
  const off1Ind = dow1Ind === 1 ? 7 : dow1Ind === 0 ? 1 : 8 - dow1Ind;
  const startInd = new Date(year, 0, 1 + off1Ind, 12, 0, 0);
  const jan1NextInd = new Date(year + 1, 0, 1);
  const dow1NextInd = jan1NextInd.getDay();
  const offNextInd = dow1NextInd === 1 ? 7 : dow1NextInd === 0 ? 1 : 8 - dow1NextInd;
  const endInd = new Date(year + 1, 0, offNextInd);
  const indDates = [];
  const dtInd = new Date(startInd);
  while (dtInd <= endInd) {
    indDates.push(`${dtInd.getFullYear()}-${String(dtInd.getMonth()+1).padStart(2,'00')}-${String(dtInd.getDate()).padStart(2,'00')}`);
    dtInd.setDate(dtInd.getDate() + 1);
  }

  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    indDates.forEach((date, i) => {
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }

  const medData = _ctx.medData;
  let quotite = 100;
  for (let r = 1; r < medData.length; r++) {
    if (String(medData[r][0]).trim() === doctorId) {
      quotite = Number(medData[r][4]) || 100;
      break;
    }
  }
  const quotas = getQuotasConges(quotite);
  const quotaVac = quotas.vac;

  const jfYear = _ctx.jfYear;
  const jfNextYear = _ctx.jfNextYear;
  const totalVacDoc = [...(vacByDoc[doctorId] || [])].filter(date => {
    const dow = new Date(date).getDay();
    return dow !== 0 && dow !== 6 && !jfYear.has(date) && !jfNextYear.has(date);
  }).length;

  const periodes = [];
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const debutRaw = perData[r][1];
    const finRaw   = perData[r][2];
    const debut = debutRaw instanceof Date
      ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
      : String(debutRaw).trim();
    const fin = finRaw instanceof Date
      ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
      : String(finRaw).trim();
    const seuil = Number(perData[r][3]);

    if (debut < debutAnnee || debut >= finAnnee) continue;

    const nomNorm = nom.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const base = ORDRE_BASE_2026[nomNorm] || 'ABC';
    const grpArr = base.split('');
    // ROTATION DROITE — « le dernier devient le premier » : ABC -> CAB -> BCA.
    // (30/07/2026) Le serveur tournait à GAUCHE (offset % 3) alors que staff.html et
    // admin.html tournent à DROITE : les deux ordres n'étaient identiques qu'une année
    // sur trois. Une année sur trois, le MAR désigné comme le moins prioritaire par le
    // calcul des conflits n'était PAS celui affiché au staff. Constaté en réel sur
    // l'hiver 2027. Le sens qui fait foi est celui de l'écran d'arbitrage.
    const grpShift = (3 - (offset % 3)) % 3;
    const orderedGrps = [...grpArr.slice(grpShift), ...grpArr.slice(0, grpShift)];
    const orderedList = [];
    orderedGrps.forEach(g => {
      if (g === 'A') orderedList.push(...orderedA);
      else if (g === 'B') orderedList.push(...orderedB);
      else if (g === 'C') orderedList.push(...orderedC);
    });

    const rang = orderedList.indexOf(doctorId) + 1;
    const joursBloqués = [];
    const joursDisponibles = [];
    const dt = new Date(debut + 'T12:00:00');
    const dtFin = new Date(fin + 'T12:00:00');

    while (dt <= dtFin) {
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'00')}-${String(dt.getDate()).padStart(2,'00')}`;
      const _dow = dt.getDay();
      if (_dow === 0 || _dow === 6 || jfYear.has(dateStr) || jfNextYear.has(dateStr)) {
        joursDisponibles.push(dateStr); dt.setDate(dt.getDate() + 1); continue;
      }
      const marEnVacCeJour = orderedList.filter(id => vacByDoc[id]?.has(dateStr));
      const nbEnVac = marEnVacCeJour.length;
      const rangDansCeJour = marEnVacCeJour.indexOf(doctorId) + 1;

      if (rangDansCeJour > 0 && rangDansCeJour > seuil) joursBloqués.push(dateStr);
else joursDisponibles.push(dateStr);

      dt.setDate(dt.getDate() + 1);
    }

    const aBloqueAuMoinsUnJour = joursBloqués.length > 0;
    const tousBloqués = joursBloqués.length === (joursDisponibles.length + joursBloqués.length);

    periodes.push({
      nom, debut, fin, seuil, rang,
      joursBloqués, joursDisponibles,
      bloque: aBloqueAuMoinsUnJour, tousBloqués,
      marAvantNonValides: 0, marEnVac: 0, seuilAtteint: tousBloqués,
    });
  }

  return { periodes, quotaVac, quotaForm: quotas.form, quotaCtp: quotas.ctp,
           quotaIndispo: QUOTA_INDISPO, quotaIndispoWe: QUOTA_INDISPO_WE, totalVacDoc };
}

// ── R2 — Système de congés (quotas pilotés par CONFIG_CONGES) ──────────
function setupCongesConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('CONFIG_CONGES');
  if (sheet) { SpreadsheetApp.getUi().alert('CONFIG_CONGES existe déjà — rien modifié.'); return; }
  sheet = ss.insertSheet('CONFIG_CONGES');
  sheet.getRange(1, 1, 1, 4).setValues([['QUOTITE', 'VAC', 'FORM', 'CTP']]).setFontWeight('bold');
  const rows = [[100,33,10,0],[90,30,9,12],[80,26,8,26],[60,20,6,62],[50,17,5,104]];
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.setColumnWidth(1, 90); [2,3,4].forEach(c => sheet.setColumnWidth(c, 70));
  sheet.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ CONFIG_CONGES créé.\n\n⚠️ Chiffres à confirmer avec la DRH (surtout CTP).');
}

function _loadQuotasConges() {
  if (_quotasCache !== null) return _quotasCache;
  _quotasCache = {};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG_CONGES');
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      const q = Number(data[r][0]); if (!q) continue;
      _quotasCache[q] = { vac:Number(data[r][1])||0, form:Number(data[r][2])||0, ctp:Number(data[r][3])||0 };
    }
  }
  return _quotasCache;
}

function getQuotasConges(quotite) {
  const q = Number(quotite) || 100;
  const table = _loadQuotasConges();
  if (table[q]) return { vac:table[q].vac, form:table[q].form, ctp:q>=100?0:table[q].ctp };
  const tiers = Object.keys(table).map(Number);
  if (tiers.length) {
    const n = tiers.reduce((a,b) => Math.abs(b-q)<Math.abs(a-q)?b:a);
    return { vac:table[n].vac, form:table[n].form, ctp:q>=100?0:table[n].ctp };
  }
  return { vac:Math.round(17+16*(q-50)/50), form:Math.round(5+5*(q-50)/50), ctp:0 };
}

// ── VALIDATION VACANCES ───────────────────────────────────────────────
function getVacValidation(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };

  function premierJourAnneePlanning(y) {
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay();
    const offset = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
    const d = new Date(y, 0, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupData = groupSheet.getDataRange().getValues();
  const groups = { A: [], B: [], C: [] };
  const ordre2026 = { A: {}, B: {}, C: {} };
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim();
    const id  = String(groupData[r][1]).trim();
    const ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id);
    ordre2026[grp][id] = ord;
  }

  const offset = year - 2026;
  function getOrderedGroup(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const shift = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite, cf. grpShift
    return [...sorted.slice(shift), ...sorted.slice(0, shift)];
  }
  const orderedA = getOrderedGroup('A');
  const orderedB = getOrderedGroup('B');
  const orderedC = getOrderedGroup('C');

  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const perData = perSheet.getDataRange().getValues();
  const debutAnnee = premierJourAnneePlanning(year);
  const finAnnee = premierJourAnneePlanning(year + 1);

  const indSheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!indSheet) return [];

  const jan1Ind = new Date(year, 0, 1);
  const dow1Ind = jan1Ind.getDay();
  const off1Ind = dow1Ind === 1 ? 7 : dow1Ind === 0 ? 1 : 8 - dow1Ind;
  const startInd = new Date(year, 0, 1 + off1Ind, 12, 0, 0);
  const jan1NextInd = new Date(year + 1, 0, 1);
  const dow1NextInd = jan1NextInd.getDay();
  const offNextInd = dow1NextInd === 1 ? 7 : dow1NextInd === 0 ? 1 : 8 - dow1NextInd;
  const endInd = new Date(year + 1, 0, offNextInd);
  const indDates = [];
  const dtInd = new Date(startInd);
  while (dtInd <= endInd) {
    indDates.push(`${dtInd.getFullYear()}-${String(dtInd.getMonth()+1).padStart(2,'00')}-${String(dtInd.getDate()).padStart(2,'00')}`);
    dtInd.setDate(dtInd.getDate() + 1);
  }

  const indData = indSheet.getDataRange().getValues();
  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    indDates.forEach((date, i) => {
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }

  const medSheet = ss.getSheetByName('MEDECINS');
  const medData = _medecinsRows_();
  const nomMap = {};
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    nomMap[id] = String(medData[r][COL_MED.NOM]).trim();
  }

  const jfYear = getJoursFeries(year);
  const jfNextYear = getJoursFeries(year + 1);

  const result = [];
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const debutRaw = perData[r][1];
    const finRaw   = perData[r][2];
    const debut = debutRaw instanceof Date
      ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
      : String(debutRaw).trim();
    const fin = finRaw instanceof Date
      ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
      : String(finRaw).trim();
    const seuil = Number(perData[r][3]);

    if (debut < debutAnnee || debut >= finAnnee) continue;

    const nomNorm = nom.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const base = ORDRE_BASE_2026[nomNorm] || 'ABC';
    const grpArr = base.split('');
    // ROTATION DROITE — « le dernier devient le premier » : ABC -> CAB -> BCA.
    // (30/07/2026) Le serveur tournait à GAUCHE (offset % 3) alors que staff.html et
    // admin.html tournent à DROITE : les deux ordres n'étaient identiques qu'une année
    // sur trois. Une année sur trois, le MAR désigné comme le moins prioritaire par le
    // calcul des conflits n'était PAS celui affiché au staff. Constaté en réel sur
    // l'hiver 2027. Le sens qui fait foi est celui de l'écran d'arbitrage.
    const grpShift = (3 - (offset % 3)) % 3;
    const orderedGrps = [...grpArr.slice(grpShift), ...grpArr.slice(0, grpShift)];
    const orderedList = [];
    orderedGrps.forEach(g => {
      if (g === 'A') orderedList.push(...orderedA);
      else if (g === 'B') orderedList.push(...orderedB);
      else if (g === 'C') orderedList.push(...orderedC);
    });

    const mars = orderedList.map((id, idx) => {
      const rang = idx + 1;
      const joursVac = [...(vacByDoc[id] || [])].filter(d => d >= debut && d <= fin);
      const joursOuvres = joursVac.filter(d => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6 && !jfYear.has(d) && !jfNextYear.has(d);
      });

      let joursValides = 0, joursRefuses = 0;
      joursOuvres.forEach(date => {
        const marEnVacCeJour = orderedList.filter(mid => vacByDoc[mid]?.has(date));
        const rangCeJour = marEnVacCeJour.indexOf(id) + 1;
        if (rangCeJour > 0 && rangCeJour <= seuil) joursValides++;
        else if (rangCeJour > seuil) joursRefuses++;
      });

      let statut;
      if (joursOuvres.length === 0) statut = 'AUCUN';
      else if (joursRefuses === 0) statut = 'VALIDE';
      else if (joursValides === 0) statut = 'REFUSE';
      else statut = 'PARTIEL';

      return {id, nom:nomMap[id]||id, rang,
        joursVac:joursVac.length, joursOuvres:joursOuvres.length,
        joursValides, joursRefuses, statut};
    });

    result.push({ nom, debut, fin, seuil, mars });
  }

  return result;
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "getIndispos" ── */
function _act_getIndispos(R) {
  const { e, payload, action, code, user } = R;
  const targetId = user.role === 'admin' ? payload.doctorId : user.id;
  return ContentService.createTextOutput(JSON.stringify({
    success: true, indispos: getIndisposForDoctor(targetId, getIndisposYear())
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveIndispos" ── */
function _act_saveIndispos(R) {
  const { e, payload, action, code, user } = R;
  const targetId = user.role === 'admin' ? payload.doctorId : user.id;
  /* (POSE TP · 22/08/2026) DEUX CIRCUITS, DEUX ANNÉES — récit : docs/JOURNAL-Planning-Med.md §123 */
  /* (25/11/2026) POSE LIBRE DES VACANCES — même porte que les TP, même phase
     (une année générée), même choix d'année. Le MAR pour lui-même ; le comité
     peut le faire pour un MAR (doctorId), sous les mêmes règles. */
  if (payload.vac === true) {
    const phV = _phaseTp_();
    if (!phV.actif) return _error('La pose des vacances n\'est pas ouverte : aucune année générée.');
    const anneeV = Number(payload.year) || phV.annee;
    if (phV.annees.indexOf(anneeV) === -1) {
      return _error('L\'année ' + anneeV + ' n\'est pas ouverte à la pose (ouvertes : ' + phV.annees.join(', ') + ').');
    }
    return ContentService.createTextOutput(JSON.stringify(
      _poserVac_(user, targetId, payload.vacances, anneeV)
    )).setMimeType(ContentService.MimeType.JSON);
  }
  if (payload.tp === true) {
    const ph = _phaseTp_();
    if (!ph.actif) return _error('La pose des jours de temps partiel n\'est pas ouverte : aucune année générée.');
    /* (LOT 5) Deux années peuvent être ouvertes à la fois (fin 2027 :
       le reliquat 2027 ET 2028). L'écran dit laquelle il montre ; toute
       autre valeur est refusée — jamais de repli silencieux d'année. */
    const anneeTp = Number(payload.year) || ph.annee;
    if (ph.annees.indexOf(anneeTp) === -1) {
      return _error('L\'année ' + anneeTp + ' n\'est pas ouverte à la pose (ouvertes : ' + ph.annees.join(', ') + ').');
    }
    return ContentService.createTextOutput(JSON.stringify(
      _poserTp_(user, targetId, payload.indispos, anneeTp)
    )).setMimeType(ContentService.MimeType.JSON);
  }
  if (user.role !== 'admin' && !_indisposOuverte_()) {
    return _error('La campagne de saisie est fermée : indisponibilités et souhaits ne peuvent plus être enregistrés.');
  }
  if (user.role !== 'admin' && _saisieClose_()) {
    return _error('La saisie est close depuis le ' + _libelleFinSaisie_(_finSaisieIndispos_())
      + ' à minuit : indisponibilités et souhaits ne peuvent plus être modifiés. Contactez le comité.');
  }
  const anneeInd = getIndisposYear();
  /* (LOT A · 01/09/2026) LE TEMPS PARTIEL REVIENT DANS LA CAMPAGNE — récit : docs/JOURNAL-Planning-Med.md §124 */
  const existantC = getIndisposForDoctor(targetId, anneeInd);
  const envoyeC = {}, tpRefuses = [];
  const quotaTpC = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;
  const sansTpProfil = _tpFixeDe_(targetId) || quotaTpC <= 0;
  const jfC = getJoursFeries(anneeInd);
  let nbTpC = 0;
  /* (11/09/2026) QUOTA D'INDISPONIBILITÉS — récit : docs/JOURNAL-Planning-Med.md §125 */
  const indRefuses = [];
  let nbIndC = 0, nbIndWeC = 0;
  /* (05/10/2026) Sous-quota compté en WEEK-ENDS : la clé d'un week-end est son
     samedi. Un vendredi ou un dimanche d'un week-end déjà touché ne consomme rien
     de plus (mais compte toujours un jour dans QUOTA_INDISPO). L'écran couple le
     vendredi au dimanche (même binôme de garde) : un vendredi n'arrive donc
     jamais seul, et le compter ici ferme seulement la porte à un envoi qui
     contournerait l'écran. */
  const weVusC = {};
  Object.keys(payload.indispos || {}).forEach(function (ds) {
    const v = String(payload.indispos[ds] || '').trim().toUpperCase();
    if (v === 'INDISPO' && user.role !== 'admin') {
      if (nbIndC >= QUOTA_INDISPO) { indRefuses.push(ds); return; }
      const _dowI = new Date(ds + 'T12:00:00').getDay();
      if (_dowI === 0 || _dowI === 5 || _dowI === 6) {
        const _sam = new Date(ds + 'T12:00:00');
        _sam.setDate(_sam.getDate() + (_dowI === 5 ? 1 : _dowI === 0 ? -1 : 0));
        const _cleWe = _sam.getFullYear() + '-' + String(_sam.getMonth() + 1).padStart(2, '0') + '-' + String(_sam.getDate()).padStart(2, '0');
        if (!weVusC[_cleWe]) {
          if (nbIndWeC >= QUOTA_INDISPO_WE) { indRefuses.push(ds + ' (week-end)'); return; }
          weVusC[_cleWe] = true; nbIndWeC++;
        }
      }
      nbIndC++; envoyeC[ds] = payload.indispos[ds]; return;
    }
    if (v !== 'TP' && v !== 'TPA') { envoyeC[ds] = payload.indispos[ds]; return; }
    /* TPA n'a pas de sens dans la campagne : il n'y a pas encore de
       planning, donc rien à mettre « sous réserve ». Tout devient TP. */
    if (sansTpProfil) { tpRefuses.push(ds + ' (profil sans jours de temps partiel)'); return; }
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6 || jfC.has(ds)) { tpRefuses.push(ds + ' (jour non travaillé)'); return; }
    if (nbTpC >= quotaTpC) { tpRefuses.push(ds + ' (quota de ' + quotaTpC + ' atteint)'); return; }
    nbTpC++; envoyeC[ds] = 'TP';
  });
  if (tpRefuses.length) logAction('saveIndispos ' + targetId + ' (' + anneeInd + ') : ' +
    tpRefuses.length + ' TP refusés — ' + tpRefuses.slice(0, 20).join(', '));
  if (indRefuses.length) logAction('saveIndispos ' + targetId + ' (' + anneeInd + ') : ' +
    indRefuses.length + ' indispo(s) refusée(s), quota de ' + QUOTA_INDISPO +
    ' atteint — ' + indRefuses.slice(0, 20).join(', '));
  // Fusion par proprietaire de code — voir _fusionIndispos_.
  // NE PAS remonter cette logique dans saveIndisposForDoctor : ce helper
  // sert aussi a l'absence longue, qui doit continuer a poser une ligne
  // complete. La regle de propriete n'a de sens qu'ici, ou l'on connait
  // le role de l'appelant.
  const fusion = _fusionIndispos_(existantC, envoyeC, user.role === 'admin');
  return ContentService.createTextOutput(JSON.stringify({
    success: saveIndisposForDoctor(targetId, fusion, anneeInd)
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveIndisposBatch" ── */
// ── STAFF VACANCES : ENREGISTREMENT DE TOUS LES MARs EN UN APPEL ──
// « Valider et verrouiller » appelait saveIndispos une fois PAR MAR :
// 23 allers-retours serialises par Apps Script, ~3 min en reel, au point
// de passer pour un plantage. Ici : 1 aller-retour, 1 lecture d'onglet,
// 1 ecriture de bloc. Meme regle de fusion que saveIndispos (le comite
// ne remplace que les VAC/FORM et ne touche pas aux saisies des MARs).
function _act_saveIndisposBatch(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const anneeB = getIndisposYear();
  const ssB = SpreadsheetApp.getActiveSpreadsheet();
  const shB = ssB.getSheetByName(`INDISPOS_${anneeB}`);
  if (!shB) return _error(`INDISPOS_${anneeB} introuvable`);
  const dataB = shB.getDataRange().getValues();
  const datesB = reconstruireDatesHeaders(dataB, anneeB);
  const envoi = payload.indispos || {};
  const inconnus = [];
  let touches = 0;
  // matrice complete relue depuis l'onglet : les lignes non visees
  // sont reecrites a l'identique, jamais perdues.
  const bloc = [];
  for (let r = 3; r < dataB.length; r++) {
    bloc.push(datesB.map((d, i) => d ? String(dataB[r][i + 1] || '').trim() : ''));
  }
  Object.keys(envoi).forEach(function (marId) {
    const id = String(marId).trim();
    let ligne = -1;
    for (let r = 3; r < dataB.length; r++) {
      if (String(dataB[r][0]).trim() === id) { ligne = r - 3; break; }
    }
    if (ligne < 0) { inconnus.push(id); return; }
    const existant = {};
    datesB.forEach(function (d, i) { if (d && bloc[ligne][i]) existant[d] = bloc[ligne][i]; });
    const fusion = _fusionIndispos_(existant, envoi[marId], true);  // true = comite
    bloc[ligne] = datesB.map(d => d ? (fusion[d] || '') : '');
    touches++;
  });
  if (bloc.length) shB.getRange(4, 2, bloc.length, datesB.length).setValues(bloc);
  // (27/11/2026) Janvier N+1 (hors grille) : en attente dans JANVIER_SUIVANT, compté sur N.
  const janvierSuivant = _janvierSuivantDuComite_(anneeB, envoi, new Set(datesB.filter(Boolean)), 'comité (' + ((user && user.id) || 'admin') + ')');
  if (janvierSuivant) { try { _tpRepublier_(anneeB); } catch (e) {} }
  logAction(`saveIndisposBatch : ${touches} MAR(s) enregistre(s)` +
            (janvierSuivant ? ` — ${janvierSuivant} jour(s) de janvier ${anneeB + 1}` : '') +
            (inconnus.length ? ` — introuvables : ${inconnus.join(', ')}` : ''));
  return ContentService.createTextOutput(JSON.stringify({
    success: true, saved: touches, inconnus: inconnus, janvierSuivant: janvierSuivant
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getAllIndispos" ── */
function _act_getAllIndispos(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const indYear = Number(payload.year) || getIndisposYear();
  const sheet = ss.getSheetByName(`INDISPOS_${indYear}`);
  if (!sheet) return _error(`INDISPOS_${indYear} introuvable`);
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, indYear); // (C3b) helper unifié
  const result = {};
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    result[id] = {};
    dates.forEach((date, i) => {
      if (!date) return;
      const val = String(data[r][i+1]||'').trim();
      if (val) result[id][date] = val;
    });
  }
  return ContentService.createTextOutput(JSON.stringify({
    success: true, data: result, year: indYear
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getJoursFeries" ── */
function _act_getJoursFeries(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const fYear = Number(payload.year) || TEST_YEAR;
  const jf = [...getJoursFeries(fYear), ...getJoursFeries(fYear + 1)];
  return ContentService.createTextOutput(JSON.stringify({success:true, joursFeries: jf, year: fYear}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getOrdreVacances" ── */
/* (13/08/2026) Bandeau « mon ordre de passage » de la vue Mes congés — récit : docs/JOURNAL-Planning-Med.md §126 */
function _act_getOrdreVacances(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'mar') return _deny();
  const _now = new Date();
  const _an = _now.getFullYear();
  const res = getOrdreVacances(user.id, [_an, _an + 1, _an + 2]);   // (25/11/2026) + y+2 : rang au prochain staff (récapitulatif)
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    annees: res.annees,
    anneePrincipale: (_now.getMonth() + 1) >= 9 ? _an + 1 : _an,
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getVacConfig" ── */
function _act_getVacConfig(R) {
  const { e, payload, action, code, user } = R;
  const indYear = getIndisposYear();
  const cfg = getVacConfig(user.id, indYear);
  const jf = getJoursFeries(indYear);
  const jfNext = getJoursFeries(indYear + 1);
  const _f = getMedecinFlags();
  const tpFixe = _f.rythme2sur2.has(user.id) || !!_f.tpJoursFixes[user.id];
  /* (25/08/2026) `genere` — récit : docs/JOURNAL-Planning-Med.md §127 */
  const _dejaGenere = _indisposFigees_();   // (26/08) source unique — partagée avec la clé acces
  return ContentService.createTextOutput(JSON.stringify({
    success: true, periodes: cfg.periodes, quotaVac: cfg.quotaVac,
    quotaForm: cfg.quotaForm, quotaCtp: cfg.quotaCtp, tpFixe: tpFixe,
    /* (13/09/2026) LES DEUX PLAFONDS D'INDISPONIBILITÉS — récit : docs/JOURNAL-Planning-Med.md §128 */
    quotaIndispo: QUOTA_INDISPO, quotaIndispoWe: QUOTA_INDISPO_WE,
    totalVacDoc: cfg.totalVacDoc, joursFeries: [...jf, ...jfNext],
    /* (27/11/2026) Reliquat de l'année précédente : au staff, les vacances de
       janvier sont prises d'abord dessus (même règle que la pose libre). */
    reliquatVac: reliquatVacDe_(user.id, indYear),
    genere: _dejaGenere, anneeCampagne: indYear,
    /* (11/10/2026) date limite de saisie (AAAA-MM-JJ, ou null) et son état */
    finSaisie: _finSaisieIndispos_(), saisieClose: _saisieClose_(),
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getVacValidation" ── */
function _act_getVacValidation(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  return ContentService.createTextOutput(JSON.stringify({
    success: true, data: getVacValidation(getIndisposYear())
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getVacancesConfig" ── */
function _act_getVacancesConfig(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const perSheet = ss.getSheetByName('PERIODES_VAC');
  let periodes = [];
  if (perSheet) {
    const perData = perSheet.getDataRange().getValues();
    for (let r = 1; r < perData.length; r++) {
      const nom = String(perData[r][0]).trim();
      if (!nom) continue;
      const debutRaw = perData[r][1], finRaw = perData[r][2];
      const debut = debutRaw instanceof Date
        ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
        : String(debutRaw).trim();
      const fin = finRaw instanceof Date
        ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
        : String(finRaw).trim();
      periodes.push({nom, debut, fin, seuil:Number(perData[r][3])||8});
    }
  }
  // Année visée (wizard) : ne garder que ses périodes ; si aucune, proposer (API Nice + filet)
  const wizYear = Number(payload.year) || 0;
  if (wizYear) {
    const pourAnnee = periodes.filter(function(p){ return String(p.debut).startsWith(String(wizYear)); });
    periodes = pourAnnee.length ? pourAnnee : proposerVacances(wizYear);
  }
  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupes = {A:[],B:[],C:[]};
  if (groupSheet) {
    const groupData = groupSheet.getDataRange().getValues();
    const tempGroups = {A:[],B:[],C:[]};
    for (let r = 1; r < groupData.length; r++) {
      const grp = String(groupData[r][0]).trim(), id = String(groupData[r][1]).trim();
      const ord = Number(groupData[r][2])||0;
      if (!id||!tempGroups[grp]) continue;
      tempGroups[grp].push({id, ordre:ord});
    }
    ['A','B','C'].forEach(g => {
      groupes[g] = tempGroups[g].sort((a,b)=>a.ordre-b.ordre).map(m=>({id:m.id}));
    });
  }
  /* (14/09/2026 — chantier 11) LES QUOTAS VOYAGENT AVEC LA CONFIG. staff.html
     portait une copie figée de CONFIG_CONGES et s'est trouvé faux quatre fois
     (33 jours affichés pour 37). Le client affiche, le serveur calcule :
     la table est servie ici, telle que le serveur la lit (_loadQuotasConges). */
  // (27/11/2026) les reliquats de l'année précédente voyagent aussi (onglet Récap du comité)
  return ContentService.createTextOutput(JSON.stringify({success:true, periodes, groupes, quotasConges:_loadQuotasConges(), reliquats:reliquatsCampagne_(), janvierSuivant:janvierSuivantCampagne_()}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "savePeriodes" ── */
function _act_savePeriodes(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const periodes = payload.periodes;
  if (!Array.isArray(periodes)) return _error('Données invalides');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PERIODES_VAC');
  if (!sheet) {
    sheet = ss.insertSheet('PERIODES_VAC');
    sheet.getRange(1,1,1,4).setValues([['NOM','DEBUT','FIN','SEUIL']]);
    sheet.getRange(1,1,1,4).setFontWeight('bold');
  }
  // (30/07/2026) L'onglet porte les periodes de TOUTES les annees (getVacancesConfig
  // filtre par l'annee de DEBUT). L'ancienne version rasait la table entiere : preparer
  // 2028 effacait les periodes de 2027. On ne remplace desormais que l'annee visee,
  // reconnue a l'annee de sa date de debut, exactement comme a la lecture.
  const anneeCible = String(Number(payload.year) || '');
  const _an = v => (v instanceof Date)
    ? String(v.getFullYear())
    : String(v || '').trim().slice(0, 4);
  const conservees = [];
  const ancien = sheet.getDataRange().getValues();
  for (let r = 1; r < ancien.length; r++) {
    const nom = String(ancien[r][0]).trim();
    if (!nom) continue;
    if (anneeCible && _an(ancien[r][1]) === anneeCible) continue;   // remplacee
    conservees.push([ancien[r][0], ancien[r][1], ancien[r][2], Number(ancien[r][3]) || 8]);
  }
  const nouvelles = periodes.map(p => [p.nom, p.debut, p.fin, Number(p.seuil) || 8]);
  // Filet : sans annee ciblee, on refuse de vider une table pleine.
  if (!anneeCible && !nouvelles.length && ancien.length > 1) {
    return _error('Refus : aucune période fournie, la table ne sera pas vidée');
  }
  const finales = anneeCible ? conservees.concat(nouvelles) : nouvelles;
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  if (finales.length > 0) sheet.getRange(2, 1, finales.length, 4).setValues(finales);
  logAction(`savePeriodes${anneeCible ? ' ' + anneeCible : ''} : ${nouvelles.length} période(s) écrite(s), ${conservees.length} conservée(s)`);
  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "saveGroupes" ── */
function _act_saveGroupes(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const groupes = payload.groupes;
  if (!groupes) return _error('Données invalides');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('GROUPES_VAC');
  if (!sheet) {
    sheet = ss.insertSheet('GROUPES_VAC');
    sheet.getRange(1,1,1,3).setValues([['GROUPE','MEDECIN_ID','ORDRE']]);
    sheet.getRange(1,1,1,3).setFontWeight('bold');
  }
  const rows = [];
  ['A','B','C'].forEach(grp => {
    (groupes[grp]||[]).forEach((mar, idx) => rows.push([grp, mar.id, idx+1]));
  });
  // (30/07/2026) Filet : un payload vide effacait GROUPES_VAC en silence, et le
  // wizard affichait « ✓ Groupes sauvegardes ». Cas reel : lecture initiale ratee,
  // wizGroupes reste {A:[],B:[],C:[]}. On refuse plutot que d'ecraser.
  if (!rows.length && sheet.getLastRow() > 1) {
    logAction('saveGroupes REFUSE : payload vide sur une table pleine');
    return _error('Refus : aucun groupe fourni, GROUPES_VAC ne sera pas vidé');
  }
  if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getConflitsAll" ── */
function _act_getConflitsAll(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const year = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const medData = _medecinsRows_();
  const actifs = [];
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    const actif = String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
    const email = String(medData[r][COL_MED.EMAIL]).trim();
    if (id && actif) actifs.push({id, nom: String(medData[r][COL_MED.NOM]).trim(), email});
  }
  const conflits = [];
  actifs.forEach(mar => {
    const cfg = getVacConfig(mar.id, year);
    const periodesConflits = [];
    cfg.periodes.forEach(p => {
      if (p.joursBloqués && p.joursBloqués.length > 0) {
        periodesConflits.push({
          periode: p.nom,
          debut: p.debut,
          fin: p.fin,
          joursBloqués: p.joursBloqués,
          joursDisponibles: p.joursDisponibles,
        });
      }
    });
    if (periodesConflits.length > 0) {
      conflits.push({
        id: mar.id,
        nom: mar.nom,
        email: mar.email,
        periodesConflits,
      });
    }
  });
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    conflits,
    total: actifs.length,
    nbConflits: conflits.length,
    nbResolus: actifs.length - conflits.length,
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── (09/11/2026) PIÈCE JOINTE DU MAIL « VOS GARDES » : L'ANNÉE DU MAR EN UNE PAGE ──
   Demandé par le responsable : le récapitulatif annuel du MAR, sur le modèle de
   la « fiche récap » (tuiles + calendrier des 12 mois), limité à ce que le
   logiciel a posé ou attribué : vacances, formation, temps partiel, gardes et
   18 h. Ni indisponibilités, ni souhaits. Fériés : liseré rouge, même sur une
   case colorée (code habituel du responsable).
   Le PDF est produit par la conversion HTML → PDF de Google, qui ne connaît ni
   flex ni grid : TABLEAUX ET COULEURS SEULEMENT. `codeDu` = codes de la ligne du
   MAR dans GARDES_{year} ({'2027-03-08':'G', …}). Fonction pure, testée au banc. */
function _htmlRecapMar_(nom, year, codeDu, isF) {
  /* (10/11/2026) RENDU « DOCUMENT GOOGLE ». Le PDF ne passe plus par le
     convertisseur HTML direct, qui jetait tous les fonds de couleur (constat sur
     les mails du 10/11 : calendrier tout blanc). Il passe par un document Google
     temporaire (voir _pdfRecapMar_), qui garde les fonds des CASES DE TABLEAU,
     mais pas ceux des blocs ni des pastilles. D'où : tout fond coloré est une
     case de tableau (bandeau, tuiles, légende), avec bgcolor ET background-color,
     et toute case de mise en page porte border:none (sinon : bordure noire). */
  /* (28/11/2026) UN SEUL CODE COULEUR DANS TOUT LE PORTAIL : mêmes couleurs que les
     écrans (partage/theme.css). Réa bleu, Mater-Bloc rouge, 18 h orange, vacances
     bleu pâle, temps partiel violet, formation jaune. Deux écarts voulus, propres au
     papier : le repos de garde est un gris plus soutenu (le gris de l'écran est
     ici le fond des week-ends) et la demi-journée de vacances un bleu plus pâle
     (une case de tableau ne se coupe pas en deux). */
  const COUL = { G:['#1d6fb8','#ffffff'], G2:['#be123c','#ffffff'], '18':['#c2560c','#ffffff'], RG:['#e2e8f0','#475569'],
                 V:['#dbeafe','#1d4ed8'], VA:['#eff6ff','#1d4ed8'], VM:['#eff6ff','#1d4ed8'], F:['#fef9c3','#854d0e'],
                 TP:['#f3e8ff','#6d28d9'], CL:['#cbd5e1','#334155'] };
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const ouvre = ds => { const w = new Date(ds + 'T12:00:00').getDay(); return w >= 1 && w <= 5 && !isF(ds); };
  const SANS = 'border:none;';
  const fond = c => ' bgcolor="' + c + '" style="background-color:' + c + ';';
  let nG = 0, nG2 = 0, n18 = 0, vac = 0, form = 0, tp = 0;
  Object.keys(codeDu).forEach(ds => {
    const c = codeDu[ds];
    if (c === 'G') nG++; else if (c === 'G2') nG2++; else if (c === '18') n18++;
    if (!ouvre(ds)) return;
    if (c === 'V') vac += 1; else if (c === 'VA' || c === 'VM') vac += 0.5;
    else if (c === 'F') form += 1; else if (c === 'TP') tp += 1;
  });
  const fmt = x => String(x).replace('.', ',');
  const tuile = (val, lib, bg, fg) => '<td' + fond(bg) + 'width:20%;padding:6px 8px;border:3px solid #ffffff">'
    + '<p style="margin:0;font-size:17pt;font-weight:bold;color:' + fg + '">' + val + '</p>'
    + '<p style="margin:0;font-size:7.5pt;color:#334155">' + lib + '</p></td>';
  const mois = m => {
    const premier = new Date(year, m, 1, 12), nb = new Date(year, m + 1, 0, 12).getDate();
    let dec = (premier.getDay() + 6) % 7, h = '<table style="border-collapse:collapse;width:100%">'
      + '<tr><td colspan="7" style="' + SANS + 'font-size:8pt;font-weight:bold;color:#0f172a;padding:2px 0 3px">' + MOIS[m] + '</td></tr><tr>';
    ['L','M','M','J','V','S','D'].forEach(j => { h += '<td style="' + SANS + 'font-size:6pt;color:#94a3b8;text-align:center">' + j + '</td>'; });
    h += '</tr><tr>';
    for (let k = 0; k < dec; k++) h += '<td style="' + SANS + '"></td>';
    for (let d = 1; d <= nb; d++) {
      const ds = iso(year, m + 1, d), c = codeDu[ds] || '', w = (dec + d - 1) % 7;
      const col = COUL[c], fer = isF(ds);
      const bg = col ? col[0] : (w >= 5 ? '#f1f5f9' : '#ffffff'), fg = col ? col[1] : '#334155';
      const bord = fer ? '1.5px solid #dc2626' : '1px solid #e2e8f0';
      h += '<td' + fond(bg) + 'width:14%;height:13px;text-align:center;font-size:6.5pt;color:' + fg
        + ';border:' + bord + (c === 'G' || c === 'G2' || c === '18' ? ';font-weight:bold' : '') + '">' + d + '</td>';
      if (w === 6 && d < nb) h += '</tr><tr>';
    }
    return h + '</tr></table>';
  };
  let cal = '<table style="border-collapse:collapse;width:100%">';
  for (let r = 0; r < 4; r++) {
    cal += '<tr>';
    for (let c = 0; c < 3; c++) cal += '<td style="' + SANS + 'vertical-align:top;padding:4px 7px;width:33%">' + mois(r * 3 + c) + '</td>';
    cal += '</tr>';
  }
  cal += '</table>';
  const suite = [1, 2].map(d => iso(year + 1, 1, d)).filter(ds => codeDu[ds] === 'G' || codeDu[ds] === 'G2' || codeDu[ds] === '18')
    .map(ds => ds.slice(8) + '/01/' + (year + 1) + ' : ' + (codeDu[ds] === '18' ? '18 h' : 'garde'));
  const leg = (c, l, bord) => '<td' + fond(c) + 'width:2%;border:' + (bord || '1px solid #cbd5e1') + '"></td>'
    + '<td style="' + SANS + 'width:9.1%;padding:0 3px;font-size:6.5pt;color:#334155">' + l + '</td>';   // (28/11/2026) 9 repères au lieu de 8 : Réa et Mater ont chacune le leur
  return '<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;margin:0;color:#0f172a">'
    + '<table style="border-collapse:collapse;width:100%"><tr><td' + fond('#0f172a') + 'padding:10px 14px;border:none">'
    + '<p style="margin:0;font-size:8pt;color:#94a3b8">PLANNING-MED · RÉCAPITULATIF ' + year + '</p>'
    + '<p style="margin:3px 0 0;font-size:16pt;font-weight:bold;color:#ffffff">' + nom + '</p>'
    + '<p style="margin:2px 0 0;font-size:8pt;color:#cbd5e1">Vacances, formation, temps partiel, gardes et 18 h attribués par le logiciel</p>'
    + '</td></tr></table>'
    + '<table style="border-collapse:collapse;width:100%;margin-top:8px"><tr>'
    + tuile(nG + nG2, 'gardes (' + nG + ' réa · ' + nG2 + ' mat)', '#e8f4fd', '#1d6fb8')
    + tuile(n18, '18 h', '#fff1e6', '#c2560c')
    + tuile(fmt(vac), 'jours de vacances (ouvrés)', '#dbeafe', '#1d4ed8')
    + tuile(fmt(form), 'jours de formation', '#fef9c3', '#854d0e')
    + tuile(tp, 'jours de temps partiel', '#f3e8ff', '#6d28d9')
    + '</tr></table>'
    + cal
    + (suite.length ? '<p style="font-size:7.5pt;color:#334155;margin:4px 7px">Hors calendrier : ' + suite.join(' · ') + '</p>' : '')
    + '<table style="border-collapse:collapse;width:100%;margin:6px 0 0"><tr>'
    + leg('#1d6fb8', 'Garde Réa') + leg('#be123c', 'Garde Mater') + leg('#e2e8f0', 'Repos de garde') + leg('#c2560c', '18 h') + leg('#dbeafe', 'Vacances')
    + leg('#fef9c3', 'Formation') + leg('#f3e8ff', 'Temps partiel') + leg('#cbd5e1', 'Congé long')
    + leg('#ffffff', 'Férié', '1.5px solid #dc2626')
    + '</tr></table>'
    + '<p style="font-size:6.5pt;color:#94a3b8;margin:8px 7px 0">Document généré par Planning-Med. Les échanges ultérieurs n\'y figurent pas : le planning en ligne fait foi.</p>'
    + '</body></html>';
}
function _pdfRecapMar_(nom, year, codeDu, isF) {
  const html = _htmlRecapMar_(nom, year, codeDu, isF), nomPdf = 'Recapitulatif-' + year + '.pdf';
  /* (10/11/2026) Chemin principal : document Google temporaire → PDF (garde les
     couleurs). Repli : l'ancien convertisseur direct (PDF sans fonds, mais le
     mail part quand même avec sa pièce jointe). */
  try { return _pdfParDocGoogle_(html).setName(nomPdf); }
  catch (eDoc) {
    Logger.log('PDF récapitulatif : repli sur le convertisseur direct (' + eDoc.message + ')');
    return Utilities.newBlob(html, 'text/html', 'recap.html').getAs('application/pdf').setName(nomPdf);
  }
}
/* (10/11/2026) HTML → document Google → PDF, par l'API Drive (autorisation
   drive déjà accordée au script). Le document temporaire est supprimé
   définitivement dans tous les cas, même si l'export échoue. */
function _pdfParDocGoogle_(html) {
  const jeton = ScriptApp.getOAuthToken(), ent = { Authorization: 'Bearer ' + jeton };
  const sep = 'pm' + Utilities.getUuid().replace(/-/g, '');
  const meta = JSON.stringify({ name: 'planning-med-recap-temporaire', mimeType: 'application/vnd.google-apps.document' });
  const corps = '--' + sep + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n'
    + '--' + sep + '\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n' + html + '\r\n--' + sep + '--';
  const cree = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'post', contentType: 'multipart/related; boundary=' + sep, headers: ent,
    payload: Utilities.newBlob(corps).getBytes(), muteHttpExceptions: true });
  if (cree.getResponseCode() !== 200) throw new Error('création du document : HTTP ' + cree.getResponseCode());
  const id = JSON.parse(cree.getContentText()).id;
  try {
    const pdf = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=application/pdf',
      { headers: ent, muteHttpExceptions: true });
    if (pdf.getResponseCode() !== 200) throw new Error('export PDF : HTTP ' + pdf.getResponseCode());
    return pdf.getBlob();
  } finally {
    try { UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'delete', headers: ent, muteHttpExceptions: true }); }
    catch (eDel) { Logger.log('document temporaire non supprimé : ' + id); }
  }
}
/* (10/11/2026) RENVOI DU SEUL PDF, à lancer depuis l'éditeur. Le PDF parti
   avec le mail « Vos gardes » 2027 avait perdu ses couleurs, et les 18 h ont
   été réajustés ensuite (lot18hAppliquer). Chaque MAR reçoit un mail court
   avec son récapitulatif à jour ; ni le mail complet ni la notification ne
   repartent. */
function renvoyerRecapPdf2027() {
  const r = JSON.parse(_act_envoyerRecapIndispos({ e: {}, payload: { year: 2027, pdfSeul: true }, user: { role: 'admin' } }).getContent());
  Logger.log('Renvoi du PDF : ' + JSON.stringify(r));
  return r;
}

/* ── action "getRecapPdf" ── (25/11/2026) ─────────────────────────────────
   Le bouton « Télécharger en PDF » du récapitulatif du portail : la même page
   que la pièce jointe du mail « Vos gardes » (_pdfRecapMar_), pour le MAR
   connecté et l'année demandée, depuis GARDES_{année} (l'état du jour). Rien
   n'est écrit : le PDF revient en base 64, la page le propose au téléchargement. */
function _act_getRecapPdf(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'mar') return _deny();
  const year = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + year);
  if (!sh) return _error('Le planning ' + year + ' n\'existe pas encore.');
  const d = sh.getDataRange().getValues();
  const d2c = buildDateToCol(d, year), c2d = {};
  Object.keys(d2c).forEach(function (ds) { c2d[d2c[ds]] = ds; });
  const codeDu = {};
  for (let r = 3; r < d.length; r++) {
    if (String(d[r][0]).trim() !== String(user.id).trim()) continue;
    for (let c = 1; c < d[r].length; c++) {
      const ds = c2d[c], v = String(d[r][c] == null ? '' : d[r][c]).trim().toUpperCase();
      if (ds && v) codeDu[ds] = v;
    }
    break;
  }
  const f1 = getJoursFeries(year), f2 = getJoursFeries(year + 1);
  const isF = function (ds) { return f1.has(ds) || f2.has(ds); };
  const blob = _pdfRecapMar_(user.name || user.id, year, codeDu, isF);
  return ContentService.createTextOutput(JSON.stringify({ success: true, nom: blob.getName(),
    pdf: Utilities.base64Encode(blob.getBytes()) })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "envoyerRecapIndispos" ── */
function _act_envoyerRecapIndispos(R) {
  const { e, payload, action, code, user } = R;
  // (Remplace l'ancien récap indispos) — Récapitulatif des GARDES attribuées (G réa / G2 mat).
  if (user.role !== 'admin') return _deny();
  if (!_droitResponsable_(payload)) return _error(MSG_RESPONSABLE_);
  { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
  const year = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const medData = _medecinsRows_();

  const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
  if (!gardesSheet) return _error(`Onglet GARDES_${year} introuvable`);
  const gData = gardesSheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(gData, year);
  const colToDate = {};
  Object.keys(dateToCol).forEach(d => { colToDate[dateToCol[d]] = d; });

  // Fériés : Set (depuis getJoursFeries déjà déployé) pour savoir QUELS jours, + mapping nom local (mêmes calculs).
  const feriesSet = getJoursFeries(year), feriesSetN = getJoursFeries(year + 1);
  const isF = d => feriesSet.has(d) || feriesSetN.has(d);
  const feriesNamed = (y) => {
    const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
    const h=(19*a+b-d-g+15)%30,ii=Math.floor(c/4),k=c%4,l=(32+2*e+2*ii-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
    const mo=Math.floor((h+l-7*mm+114)/31), da=((h+l-7*mm+114)%31)+1;
    const paques=new Date(y,mo-1,da,12,0,0);
    const fmt=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const add=(dt,n)=>{const x=new Date(dt);x.setDate(x.getDate()+n);return fmt(x);};
    const fix=(m2,d2)=>{const dt=new Date(y,m2-1,d2,12,0,0);if(dt.getDay()===0)dt.setDate(dt.getDate()+1);return fmt(dt);};
    const plain=(m2,d2)=>`${y}-${String(m2).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
    const M={};
    M[fix(1,1)]='Jour de l\'An'; M[plain(1,27)]='Sainte Dévote'; M[fix(5,1)]='Fête du Travail';
    M[fix(8,15)]='Assomption'; M[fix(11,1)]='Toussaint'; M[fix(11,19)]='Fête du Prince';
    M[fix(12,8)]='Immaculée Conception'; M[fix(12,25)]='Noël';
    M[add(paques,1)]='Lundi de Pâques'; M[add(paques,39)]='Ascension'; M[add(paques,50)]='Lundi de Pentecôte'; M[add(paques,60)]='Fête-Dieu';
    return M;
  };
  const fnames = Object.assign({}, feriesNamed(year), feriesNamed(year + 1));

  const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const dd = n => String(n).padStart(2,'0');

  /* (09/11/2026) SOUHAITS DE L'ANNÉE — lus une fois dans INDISPOS_{year}, pour
     marquer dans le mail chaque garde que le MAR avait demandée. Onglet absent :
     aucune étiquette, le mail part quand même. */
  const souhaitsDe = {};
  try {
    const _ind = ss.getSheetByName(`INDISPOS_${year}`);
    if (_ind) {
      const _d = _ind.getDataRange().getValues();
      const _dates = reconstruireDatesHeaders(_d, year);
      for (let _r = 3; _r < _d.length; _r++) {
        const _id = String(_d[_r][0]).trim(); if (!_id) continue;
        _dates.forEach((_dt, _i) => { if (_dt && String(_d[_r][_i + 1] || '').trim().toUpperCase() === 'SOUHAIT') (souhaitsDe[_id] = souhaitsDe[_id] || {})[_dt] = true; });
      }
    }
  } catch (eS0) { /* confort d'affichage, jamais bloquant */ }

  /* (09/11/2026) COUPLES DE WEEK-END (ligne COUPLES_WEEKEND de CONFIG, aucun nom
     dans le code) : chacun des deux reçoit un encadré sur leurs week-ends en
     commun, et le constat chiffré — nuits de garde ensemble, garde pendant le
     18 h de l'autre — lu sur le planning, jamais supposé. */
  let couples = {};
  try { couples = (typeof getCouplesWeekend === 'function') ? getCouplesWeekend() : {}; } catch (eC) { couples = {}; }
  const codesDe = {}, nomDe = {};
  for (let ri = 3; ri < gData.length; ri++) {
    const _id = String(gData[ri][0]).trim(); if (!_id) continue;
    const o = {}; Object.keys(colToDate).forEach(col => { const v = String(gData[ri][Number(col)] || '').trim().toUpperCase(); if (v) o[colToDate[col]] = v; });
    codesDe[_id] = o;
  }
  for (let r0 = 1; r0 < medData.length; r0++) nomDe[String(medData[r0][COL_MED.ID]).trim()] = String(medData[r0][COL_MED.NOM]).trim();

  let sent = 0, skipped = 0;
  const errors = [], pjEchecs = [];

  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    const nom = String(medData[r][COL_MED.NOM]).trim();
    const actif = String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
    const email = String(medData[r][COL_MED.EMAIL]).trim();
    if (!id || !actif) continue;
    if (!email) { skipped++; continue; }

    // Gardes du MAR (G / G2 uniquement)
    const gardes = [], h18 = [], codeDu = {};
    for (let ri = 3; ri < gData.length; ri++) {
      if (String(gData[ri][0]).trim() !== id) continue;
      Object.keys(colToDate).forEach(col => {
        const date = colToDate[col];
        const val = String(gData[ri][Number(col)] || '').trim().toUpperCase();
        if (val) codeDu[date] = val;
        if (val === 'G' || val === 'G2') gardes.push({ date, type: val });
        if (val === '18') h18.push(date);           // (09/11/2026) les 18 h, demandés par le responsable
      });
      break;
    }
    h18.sort();
    const _souh = souhaitsDe[id] || {};
    /* (09/11/2026) GARDE QUI ALLONGE LES VACANCES : son repos tombe sur le dernier
       jour travaillé avant un départ (repos un jour de semaine, puis vacances,
       éventuellement après un samedi-dimanche). C'est ce que cherche la passe
       « confort » du générateur ; on le lit ici sur le planning lui-même. */
    const _plus = (ds, n) => { const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
    const libelleCourt = ds => { const t = new Date(ds + 'T12:00:00'); return JOURS[t.getDay()].toLowerCase() + ' ' + dd(t.getDate()) + '/' + dd(t.getMonth()+1); };
    const allonge = ds => {
      const rep = _plus(ds, 1), wr = new Date(rep + 'T12:00:00').getDay();
      if (codeDu[rep] !== 'RG' || wr === 0 || wr === 6 || isF(rep)) return false;
      for (let k = 2; k <= 4; k++) {
        const x = _plus(ds, k), c = codeDu[x] || '', w = new Date(x + 'T12:00:00').getDay();
        if (c === 'V') return true;
        if (!(w === 0 || w === 6 || isF(x)) || c) return false;
      }
      return false;
    };
    gardes.sort((x,y2) => x.date < y2.date ? -1 : (x.date > y2.date ? 1 : 0));

    let nRea=0, nMat=0, nWe=0, nFer=0, nSouh=0, nAll=0;
    const byMonth = {};
    gardes.forEach(gg => {
      const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
      if (gg.type === 'G') nRea++; else nMat++;
      if (dw === 0 || dw === 5 || dw === 6) nWe++;   // même définition que le marquage
      if (isF(gg.date)) nFer++;
      gg.souh = !!_souh[gg.date]; gg.all = allonge(gg.date);
      if (gg.souh) nSouh++;
      if (gg.all) nAll++;
      const mo = Number(gg.date.slice(5,7)) - 1;
      (byMonth[mo] = byMonth[mo] || []).push(gg);
    });

    /* (25/08/2026) Récapitulatif des souhaits, demandé par le responsable : c'est ici
       qu'il a sa place, dans le mail que chacun reçoit et garde — plutôt que
       dans un bandeau du portail qu'on ferme et qu'on oublie. Colonnes lues
       PAR NOM : absentes des plannings générés avant cette date, d'où le repli
       silencieux (aucun encadré affiché). */
    let souhaitsHtml = '', souhaitsTexte = '';
    try {
      const _stS = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STATS_GARDES_' + year);
      if (_stS && _stS.getLastRow() > 1) {
        const _sd = _stS.getDataRange().getValues();
        const _sh = _sd[0].map(function (x) { return String(x).trim(); });
        const _iP = _sh.indexOf('SOUHAITS POSES'), _iH = _sh.indexOf('SOUHAITS HONORES');
        if (_iP >= 0 && _iH >= 0) {
          for (let _r = 1; _r < _sd.length; _r++) {
            if (String(_sd[_r][0]).trim() !== String(id).trim()) continue;
            const _p = Number(_sd[_r][_iP]) || 0, _h = Number(_sd[_r][_iH]) || 0;
            if (!_p) break;                       // aucun souhait posé : on ne dit rien
            /* (22/10/2026) TAUX RAPPORTÉ AU POSSIBLE. « 6 retenus sur 52 » laissait lire
               12 % à qui avait posé 52 jeudis pour une part de 6, alors que 6 était le
               maximum. Le générateur écrit désormais ce maximum (SOUHAITS POSSIBLES) et
               combien de ceux-là sont obtenus (SOUHAITS POSSIBLES OBTENUS). Colonnes
               absentes (planning généré avant cette date) : l'ancienne phrase. */
            const _iQ = _sh.indexOf('SOUHAITS POSSIBLES'), _iU = _sh.indexOf('SOUHAITS POSSIBLES OBTENUS');
            const _avecPossible = _iQ >= 0 && _iU >= 0 && _sd[_r][_iQ] !== '' && _sd[_r][_iQ] != null;
            const _q = _avecPossible ? (Number(_sd[_r][_iQ]) || 0) : _p;
            const _u = _avecPossible ? Math.min(Number(_sd[_r][_iU]) || 0, _q) : _h;
            const _tous = _q > 0 && _u === _q;
            const _s = n => n > 1 ? 's' : '';
            let _titre, _detail = '';
            if (!_avecPossible) _titre = 'Souhaits : ' + _h + ' retenu' + _s(_h) + ' sur ' + _p;
            else if (!_q) _titre = 'Souhaits : ' + _p + ' demandé' + _s(_p) + ', aucun ne pouvait être accordé vu votre part de gardes';
            else {
              _titre = 'Souhaits : ' + _u + ' retenu' + _s(_u) + ' sur ' + _q + ' possible' + _s(_q)
                     + ' — ' + Math.round(100 * _u / _q) + ' %';
              if (_p > _q) _detail = _p + ' demandés : le possible tient compte de votre part de gardes, qu\'aucun souhait ne peut dépasser.';
            }
            souhaitsHtml =
              '<div style="background:' + (_tous ? '#ecfdf5' : '#f8fafc') + ';border:1px solid '
              + (_tous ? '#cdeee6' : '#eef1f5') + ';border-radius:12px;padding:13px 16px;margin-bottom:22px">'
              + '<div style="font-size:13px;color:' + (_tous ? '#0d9488' : '#334155')
              + ';font-weight:700">' + (_tous ? '✓ ' : '') + _titre + '</div>'
              + (_detail ? '<div style="font-size:12px;color:#64748b;margin-top:4px">' + _detail + '</div>' : '')
              + '</div>';
            souhaitsTexte = _titre + '.\n' + (_detail ? _detail + '\n' : '');
            break;
          }
        }
      }
    } catch (eS) { /* le récapitulatif des souhaits est un confort, jamais bloquant */ }

    let coupleHtml = '', coupleTexte = '';
    const P = couples[String(id).trim().toUpperCase()];
    if (P && codesDe[P]) {
      const moi = codeDu, lui = codesDe[P], nomP = nomDe[P] || P;
      const garde = (c, d) => c[d] === 'G' || c[d] === 'G2';
      let ensemble = 0, sur18 = 0; const weCommuns = [];
      Object.keys(colToDate).map(k => colToDate[k]).sort().forEach(d => {
        if (garde(moi, d) && garde(lui, d)) ensemble++;
        if ((garde(moi, d) && lui[d] === '18') || (garde(lui, d) && moi[d] === '18')) sur18++;
        if (new Date(d + 'T12:00:00').getDay() !== 5) return;
        const j = [d, _plus(d, 1), _plus(d, 2)];
        if (j.some(x => garde(moi, x)) && j.some(x => garde(lui, x))) {
          const qui = c => { const t = j.filter(x => garde(c, x)).map(x => JOURS[new Date(x + 'T12:00:00').getDay()].toLowerCase()); return t.join('-'); };
          weCommuns.push({ d, texte: libelleCourt(d) + ' → ' + libelleCourt(j[2]) + ' : vous ' + qui(moi) + ', ' + nomP + ' ' + qui(lui) });
        }
      });
      const ok = n => n === 0 ? '#047857' : '#b45309';
      coupleHtml = '<div style="background:#fdf4ff;border:1px solid #f5d0fe;border-radius:12px;padding:13px 16px;margin-bottom:22px">'
        + '<div style="font-size:13px;font-weight:700;color:#86198f">Vos week-ends avec ' + nomP + '</div>'
        + '<div style="font-size:12.5px;color:#334155;margin-top:6px"><b>' + weCommuns.length + '</b> week-end' + (weCommuns.length > 1 ? 's' : '') + ' de garde en commun'
        + (weCommuns.length ? ' :' : '.') + '</div>'
        + weCommuns.map(w => '<div style="font-size:12px;color:#475569;margin:3px 0 0 10px">• ' + w.texte + '</div>').join('')
        + '<div style="font-size:12.5px;margin-top:8px;color:' + ok(ensemble) + ';font-weight:700">' + (ensemble === 0 ? '✓ ' : '') + ensemble + ' nuit' + (ensemble > 1 ? 's' : '') + ' de garde en même temps</div>'
        + '<div style="font-size:12.5px;margin-top:2px;color:' + ok(sur18) + ';font-weight:700">' + (sur18 === 0 ? '✓ ' : '') + sur18 + ' jour' + (sur18 > 1 ? 's' : '') + ' où l\'un est de garde pendant le 18 h de l\'autre</div>'
        + '</div>';
      coupleTexte = 'Vos week-ends avec ' + nomP + ' : ' + weCommuns.length + ' en commun' + (weCommuns.length ? ' (' + weCommuns.map(w => w.texte).join(' ; ') + ')' : '')
        + '. ' + ensemble + ' nuit(s) de garde en même temps. ' + sur18 + ' jour(s) où l\'un est de garde pendant le 18 h de l\'autre.\n';
    }

    // ---------- HTML ----------
    const chips = (gardes.length ?
      `<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border:1px solid #dbe6ff;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nRea} réanimation</span>` +
      `<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border:1px solid #cdeee6;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nMat} maternité</span>` : '') +
      (nWe ? `<span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fde3cf;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nWe} jour${nWe>1?'s':''} de week-end</span>` : '') +
      (nFer ? `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fbd5d5;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nFer} férié${nFer>1?'s':''}</span>` : '') +
      (h18.length ? `<span style="display:inline-block;background:#f5f3ff;color:#6d28d9;border:1px solid #e4dcfd;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${h18.length} × 18 h</span>` : '') +
      (nAll ? `<span style="display:inline-block;background:#f0f9ff;color:#0369a1;border:1px solid #cfe8f7;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">☀ ${nAll} garde${nAll>1?'s':''} qui allonge${nAll>1?'nt':''} vos vacances</span>` : '');

    /* (22/10/2026) EN-TÊTE DU MAIL — ces deux blocs étaient utilisés plus bas mais
       définis nulle part : l'envoi s'arrêtait au premier MAR ayant des gardes et
       personne ne recevait rien. Trouvé en rejouant le mail sur les indispos 2027 ;
       aucun scénario du banc ne l'envoyait (banc_mail_recap.js le fait désormais). */
    const summaryHtml =
      '<div style="margin-bottom:18px">'
      + '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:10px">'
      + (gardes.length ? gardes.length + ' garde' + (gardes.length > 1 ? 's' : '') + (h18.length ? ' et ' + h18.length + ' × 18 h' : '') : h18.length + ' × 18 h') + ' en ' + year + '</div>'
      + chips + '</div>';
    const emptyHtml =
      '<div style="background:#f8fafc;border:1px solid #eef1f5;border-radius:12px;padding:13px 16px;'
      + 'margin-bottom:22px;font-size:14px;color:#64748b">Aucune garde programmée pour vous en ' + year + '.</div>';

    let rowsHtml = '';
    /* (26/08/2026) Un week-end de garde (vendredi + dimanche, même binôme) est
       présenté dans UN SEUL encadré : deux lignes séparées donnaient une liste
       hachée où rien ne disait que les deux dates allaient ensemble. Les jours
       sont d'abord regroupés en UNITÉS, puis rangés au mois du vendredi — un
       week-end à cheval sur deux mois reste donc d'un seul tenant. */
    const parDate = {};
    gardes.forEach(gg => { parDate[gg.date] = gg; });
    const dPlus = (ds, n) => {
      const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n);
      return `${x.getFullYear()}-${dd(x.getMonth()+1)}-${dd(x.getDate())}`;
    };
    const pris = {};
    const unites = [];
    gardes.slice().sort((a,b) => a.date < b.date ? -1 : 1).forEach(gg => {
      if (pris[gg.date]) return;
      const dw = new Date(gg.date + 'T12:00:00').getDay();
      if (dw === 5) {
        const dim = dPlus(gg.date, 2), gd = parDate[dim];
        /* (26/08/2026) On lie dès qu'il y a garde le vendredi ET le dimanche : c'est
           le WEEK-END qui compte. Le rôle peut différer entre les deux jours (après
           un échange, par exemple) — chaque ligne porte le sien, le cadre les réunit
           quand même. Exiger le même rôle aurait dissocié ces week-ends à l'affichage. */
        if (gd && !pris[dim]) {
          pris[gg.date] = pris[dim] = 1;
          unites.push({ we: true, jours: [gg, gd] });
          return;
        }
      }
      pris[gg.date] = 1;
      unites.push({ we: false, jours: [gg] });
    });

    h18.forEach(d18 => unites.push({ h18: true, jours: [{ date: d18 }] }));
    unites.sort((a, b) => a.jours[0].date < b.jours[0].date ? -1 : 1);
    const parMois = {};
    unites.forEach(u => {
      const mo = Number(u.jours[0].date.slice(5,7)) - 1;
      (parMois[mo] = parMois[mo] || []).push(u);
    });

    const badgeDe = t => t === 'G'
      ? '<span style="display:inline-block;white-space:nowrap;background:#eef4ff;color:#1d4ed8;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G &middot; Réa</span>'
      : '<span style="display:inline-block;white-space:nowrap;background:#ecfdf5;color:#0d9488;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G2 &middot; Mat</span>';
    const _m = (c, b, t) => '<span style="display:inline-block;white-space:nowrap;font-size:10.5px;font-weight:700;color:' + c + ';background:' + b + ';border-radius:5px;padding:2px 7px;margin:4px 6px 0 0">' + t + '</span>';
    /* Étiquettes sous la date, sur leur propre ligne : sur un téléphone, date,
       étiquettes et badge Réa/Mat ne tiennent pas sur une seule ligne. */
    const marques = g => (g.souh || g.all)
      ? '<div>' + (g.souh ? _m('#047857', '#dcfce7', '★ Souhait') : '') + (g.all ? _m('#0369a1', '#e0f2fe', '☀ Allonge vos vacances') : '') + '</div>' : '';
    const libelle = ds => {
      const dt = new Date(ds + 'T12:00:00');
      return `${JOURS[dt.getDay()]} ${dd(dt.getDate())}/${dd(dt.getMonth()+1)}`;
    };

    Object.keys(parMois).map(Number).sort((p,q)=>p-q).forEach(mo => {
      rowsHtml += `<div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#94a3b8;margin:18px 0 8px 2px">${MOIS[mo]}</div>`;
      parMois[mo].forEach(u => {
        if (u.h18) {
          rowsHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;border:1px dashed #e4dcfd;background:#fbfaff;border-radius:10px;margin-bottom:7px">`
            + `<span style="font-size:13px;font-weight:600;color:#475569">${libelle(u.jours[0].date)}</span>`
            + `<span style="display:inline-block;background:#f5f3ff;color:#6d28d9;border-radius:7px;font-size:12px;font-weight:700;padding:3px 10px">18 h</span></div>`;
          return;
        }
        if (u.we) {
          /* Chaque jour garde SA ligne (sa date, son rôle) ; c'est le cadre qui les
             réunit — le vendredi et le dimanche sont un seul week-end de garde. */
          rowsHtml += `<div style="border:1px solid #fde3cf;background:#fffaf5;border-radius:10px;padding:8px 12px 4px;margin-bottom:7px">`
            + `<div style="font-size:10.5px;font-weight:800;color:#c2410c;letter-spacing:.3px;margin-bottom:2px">WEEK-END</div>`
            + u.jours.map((g, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;`
                + `${i ? 'border-top:1px solid #fde3cf;' : ''}">`
                + `<div><span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(g.date)}</span>${marques(g)}</div>`
                + `${badgeDe(g.type)}</div>`).join('')
            + `</div>`;
          return;
        }
        const gg = u.jours[0];
        const dw = new Date(gg.date + 'T12:00:00').getDay();
        const ferie = isF(gg.date), sam = (dw === 6);
        let rowStyle = 'border:1px solid #eef1f5;', tag = '';
        if (ferie) {
          const nm = fnames[gg.date];
          rowStyle = 'border:1px solid #fbd5d5;background:#fef6f6;';
          tag = `<span style="white-space:nowrap;font-size:10.5px;font-weight:700;color:#b91c1c;background:#fdeaea;border-radius:5px;padding:2px 7px">Férié${nm?' &middot; '+nm:''}</span>`;
        } else if (sam) {
          rowStyle = 'border:1px solid #fde3cf;background:#fffaf5;';
          tag = '<span style="font-size:10.5px;font-weight:700;color:#c2410c;background:#fff1e6;border-radius:5px;padding:2px 7px">Samedi</span>';
        }
        rowsHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;${rowStyle}border-radius:10px;margin-bottom:7px"><div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap">${libelle(gg.date)}</span>${tag}</div>${marques(gg)}</div>${badgeDe(gg.type)}</div>`;
      });
    });

    /* MAR à 18 h seulement : le message « aucune garde », puis ses 18 h. */
    const coreHtml = gardes.length ? (summaryHtml + souhaitsHtml + coupleHtml + rowsHtml)
      : h18.length ? (emptyHtml + summaryHtml + souhaitsHtml + coupleHtml + rowsHtml) : (emptyHtml + souhaitsHtml + coupleHtml);

    const html =
      '<div style="background:#e9edf1;padding:0;margin:0">' +
      '<div style="max-width:600px;margin:0 auto;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
        '<div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8ef">' +
          '<div style="background:#0f172a;padding:22px 26px">' +
            '<div style="color:#cbd5e1;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase">Planning-Med</div>' +
            '<div style="color:#ffffff;font-size:23px;font-weight:800;margin-top:12px">Vos gardes ' + year + '</div>' +
            '<div style="color:#94a3b8;font-size:14px;margin-top:3px">' + nom + '</div>' +
          '</div>' +
          '<div style="padding:22px 26px 8px">' +
            '<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155">Bonjour ' + nom + ',<br>Le planning ' + year + ' vient d\'être généré. Voici vos gardes et vos 18 h pour l\'année — à reporter dans votre agenda. Votre récapitulatif de l\'année (calendrier) est en pièce jointe.</p>' +
            coreHtml +
            '<div style="border-top:1px solid #eef1f5;margin:8px 0 18px"></div>' +
            /* (09/11/2026) Plus de bouton vers le site : sur iPhone, un lien de mail s'ouvre
               dans Safari, jamais dans l'application installée, et redemande le code. */
            '<div style="text-align:center"><p style="margin:0;font-size:13px;color:#475569;line-height:1.5">Retrouvez le planning à jour dans l\'application Planning-Med.</p>' +
            '<p style="margin:10px 0 0;font-size:12px;color:#9aa4b2;line-height:1.5">Une erreur ou un échange à signaler ? Contactez le comité planning.</p></div>' +
          '</div>' +
          '<div style="background:#f8fafc;border-top:1px solid #eef1f5;padding:14px;text-align:center"><div style="font-size:11px;color:#9aa4b2">Le Comité Planning-Med</div></div>' +
        '</div>' +
      '</div>' +
      '</div>';

    // ---------- Texte brut (repli) ----------
    let bodyText = 'Bonjour ' + nom + ',\n\nLe planning ' + year + ' vient d\'être généré. Voici vos gardes :\n\n';
    if (souhaitsTexte) bodyText += souhaitsTexte + '\n';
    if (coupleTexte) bodyText += coupleTexte + '\n';
    if (!gardes.length) {
      bodyText += 'Aucune garde programmée pour vous en ' + year + '.\n';
    } else {
      bodyText += gardes.length + ' garde' + (gardes.length>1?'s':'') + ' — ' + nRea + ' réa / ' + nMat + ' mat'
        + (nWe ? ' \u00b7 ' + nWe + ' jour' + (nWe>1?'s':'') + ' de week-end' : '')
        + (nFer ? ' \u00b7 ' + nFer + ' férié' + (nFer>1?'s':'') : '') + '\n\n';
      Object.keys(byMonth).map(Number).sort((p,q)=>p-q).forEach(mo => {
        bodyText += MOIS[mo] + ' :\n';
        byMonth[mo].forEach(gg => {
          const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
          const nm = fnames[gg.date];
          const tag = isF(gg.date) ? ' [Férié' + (nm?' '+nm:'') + ']' : ((dw===0||dw===5||dw===6) ? ' [week-end]' : '');
          bodyText += '  ' + JOURS[dw] + ' ' + dd(dt.getDate()) + '/' + dd(mo+1) + ' \u2014 ' + (gg.type==='G'?'G (réa)':'G2 (mat)') + tag
            + (gg.souh ? ' [souhait]' : '') + (gg.all ? ' [allonge vos vacances]' : '') + '\n';
        });
      });
    }
    if (h18.length) bodyText += '\n18 h (' + h18.length + ') : ' + h18.map(x => { const t = new Date(x + 'T12:00:00'); return JOURS[t.getDay()] + ' ' + dd(t.getDate()) + '/' + dd(t.getMonth()+1); }).join(', ') + '\n';
    bodyText += '\nRetrouvez le planning à jour dans l\'application Planning-Med.\n\nLe Comité Planning-Med';

    try {
      /* (09/11/2026) Pièce jointe : jamais bloquante. Si la conversion échoue,
         le mail part sans elle et l'échec est compté (pjEchecs). */
      let pj = null;
      try { pj = _pdfRecapMar_(nom, year, codeDu, isF); } catch (ePj) { pjEchecs.push(`${nom} : ${ePj.message}`); }
      const envoi = { to: email, subject: `[Planning-Med ${year}] Vos gardes ${year}`, htmlBody: html, body: bodyText };
      if (payload.pdfSeul) {
        /* (10/11/2026) Renvoi du seul récapitulatif : sans pièce jointe, pas de mail. */
        if (!pj) throw new Error('récapitulatif non produit, mail non envoyé');
        const txt = 'Bonjour ' + nom + ',\n\nVoici votre récapitulatif ' + year + ' corrigé, en pièce jointe : les couleurs manquaient '
          + 'dans celui envoyé avec le mail « Vos gardes ».\n\nLes 18 h ont aussi été réajustés pour toute l\'équipe : le 18 h du '
          + 'vendredi revient autant que possible au MAR de garde le samedi, et aucun 18 h ne tombe la veille d\'une absence. '
          + 'Ce récapitulatif en tient compte.\n\nLe planning en ligne fait foi.\n\nLe Comité Planning-Med';
        envoi.subject = `[Planning-Med ${year}] Votre récapitulatif ${year} (PDF corrigé)`;
        envoi.body = txt;
        envoi.htmlBody = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">'
          + txt.split('\n\n').map(p => '<p>' + p + '</p>').join('') + '</div>';
      }
      if (pj) envoi.attachments = [pj];
      MailApp.sendEmail(envoi);
      sent++;
    } catch(err) {
      errors.push(`${nom} : ${err.message}`);
    }
  }

  logAction(`envoyerRecapGardes ${year} — ${sent} emails, ${skipped} sans email, ${errors.length} erreur(s), ${pjEchecs.length} pièce(s) jointe(s) non produite(s)`);
  pjEchecs.slice(0, 5).forEach(t => logAction('  pièce jointe non produite : ' + t));
  return ContentService.createTextOutput(JSON.stringify({
    success: true, sent, skipped, errors, pjEchecs
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "setIndisposYear" ── */
function _act_setIndisposYear(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  if (!_droitResponsable_(payload)) return _error(MSG_RESPONSABLE_);
  const newYear = Number(payload.year);
  if (!newYear || newYear < 2026) return _error('Année invalide');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CONFIG');
  if (!sheet) return _error('CONFIG introuvable');
  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
      sheet.getRange(r+1, 2).setValue(newYear);
      found = true; break;
    }
  }
  if (!found) sheet.appendRow(['INDISPOS_ACTIVE', newYear]);
  /* (11/10/2026) Date limite de saisie : dernier vendredi d'octobre de l'année
     précédente, posée d'office — sauf si elle est déjà passée (campagne ouverte
     tard) : on n'ouvre pas une campagne déjà close. Modifiable à la main dans CONFIG. */
  const _fin = _dernierVendrediOctobre_(newYear - 1);
  const _auj = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  let _rFin = -1;
  for (let r = 1; r < data.length; r++) { if (String(data[r][0]).trim() === 'INDISPOS_FIN') { _rFin = r; break; } }
  if (_fin >= _auj) {
    if (_rFin > 0) sheet.getRange(_rFin + 1, 2).setValue(_fin); else sheet.appendRow(['INDISPOS_FIN', _fin]);
  } else if (_rFin > 0) {
    sheet.deleteRow(_rFin + 1);
  }
  _configReset_();   // CONFIG modifie : le memo doit repartir a zero
  logAction(`setIndisposYear → ${newYear}`);
  return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "clearIndisposYear" ── */
function _act_clearIndisposYear(R) {
  const { e, payload, action, code, user } = R;
  if (!_droitMaintenance_(user)) return _deny();   // (15/11/2026) page Maintenance seulement (fait partie de la clôture)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CONFIG');
  if (!sheet) return _error('CONFIG introuvable');
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
      sheet.deleteRow(r+1); break;
    }
  }
  _configReset_();   // CONFIG modifie : le memo doit repartir a zero
  logAction('clearIndisposYear — INDISPOS_ACTIVE supprimée');
  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "poserAbsenceLongue" ── */
function _act_poserAbsenceLongue(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const marId = String(payload.marId || '').trim().toUpperCase();
  const d1 = String(payload.dateDebut || '').trim();
  const d2 = String(payload.dateFin   || '').trim();
  if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
  if (d1 > d2) return _error('La date de début est après la date de fin');

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Registre persistant des absences longues -> permet le report auto vers les années pas encore créées (initYear le rejoue)
  {
    let absSheet = ss.getSheetByName('ABSENCES_LONGUES');
    if (!absSheet) { absSheet = ss.insertSheet('ABSENCES_LONGUES'); absSheet.appendRow(['MAR_ID','DATE_DEBUT','DATE_FIN','POSE_LE']); }
    absSheet.getRange('B:C').setNumberFormat('@');   // dates stockées en TEXTE (pas de coercition Date)
    const adata = absSheet.getDataRange().getValues();
    let exists = false;
    for (let r = 1; r < adata.length; r++) {
      if (String(adata[r][0]).trim().toUpperCase() === marId
          && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { exists = true; break; }
    }
    if (!exists) absSheet.appendRow([marId, d1, d2, new Date()]);
  }

  // Toutes les dates calendaires de la plage [d1, d2]
  const allDates = [];
  { const cur = new Date(d1 + 'T12:00:00'), end = new Date(d2 + 'T12:00:00');
    while (cur <= end) {
      allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
      cur.setDate(cur.getDate() + 1);
    } }
  const nextStr = (d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate()+1);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };

  // Années civiles couvrant la plage (1 ou 2 en pratique)
  const years = [];
  for (let y = Number(d1.slice(0,4)); y <= Number(d2.slice(0,4)); y++) years.push(y);

  const freed = [];                 // gardes libérées {date, role}
  const deferred = [];              // années de la plage pas encore créées (report différé à l'init)
  let nbCL = 0;
  const touched = [];

  years.forEach(year => {
    const gSheet = ss.getSheetByName(`GARDES_${year}`);
    if (gSheet) {
      // Année GÉNÉRÉE : CL écrase tout (gardes + RG), on note les gardes libérées
      const data = gSheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, year);
      let row = -1;
      for (let r = 3; r < data.length; r++)
        if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
      if (row < 0) return;
      const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
      if (!inYear.length) return;
      const indMap = getIndisposForDoctor(marId, year);
      inYear.forEach(dt => {
        const col = dateToCol[dt];
        const curv = String(data[row][col] || '').trim().toUpperCase();
        if (curv === 'G' || curv === 'G2') freed.push({ date: dt, role: curv });
        gSheet.getRange(row + 1, col + 1).setValue('CL');
        indMap[dt] = 'CL';
        nbCL++;
      });
      // Nettoie le RG du lendemain d'une garde libérée si ce lendemain est hors plage
      freed.forEach(f => {
        const lend = nextStr(f.date), lc = dateToCol[lend];
        if (lc !== undefined && inYear.indexOf(lend) < 0
            && String(data[row][lc] || '').trim().toUpperCase() === 'RG')
          gSheet.getRange(row + 1, lc + 1).setValue('');
      });
      saveIndisposForDoctor(marId, indMap, year);
      touched.push(`${year} (générée)`);
    } else {
      // Année NON générée : CL dans INDISPOS seulement (zéro garde à reprendre)
      const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
      if (!iSheet) { deferred.push(year); return; }
      const idata = iSheet.getDataRange().getValues();
      const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
      const inYear = allDates.filter(dt => dset.has(dt));
      if (!inYear.length) return;
      const indMap = getIndisposForDoctor(marId, year);
      inYear.forEach(dt => { indMap[dt] = 'CL'; nbCL++; });
      saveIndisposForDoctor(marId, indMap, year);
      touched.push(`${year} (préparation)`);
    }
  });

  if (!nbCL && !deferred.length) return _error('Aucune date de la plage ne correspond à une année configurée (INDISPOS/GARDES).');
  freed.sort((a,b) => a.date < b.date ? -1 : 1);
  logAction(`poserAbsenceLongue — ${marId} ${d1} -> ${d2} : ${nbCL} j CL, ${freed.length} garde(s) liberee(s)${deferred.length ? ', reporté: ' + deferred.join('/') : ''}`);
  /* (27/11/2026) Une garde ou un 18 h que ce MAR avait mis en vitrine, ou proposé en échange,
     n'est plus à lui : l'offre est fermée TOUT DE SUITE (même règle qu'au passage horaire), au
     lieu de rester prenable jusqu'à une heure avec un message technique. Isolé : un échec ici
     ne fait jamais échouer la pose du congé. */
  try {
    if (typeof _echangesSansObjet_ === 'function' && _echangesSansObjet_() > 0 && typeof _echangesVersKV_ === 'function') _echangesVersKV_();
  } catch (eOffres) {}
  return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbCL, freed, touched, deferred }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getAbsencesLongues" ── */
// ── (RH-2) Lister le registre des absences longues ──────────────────
function _act_getAbsencesLongues(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const absSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ABSENCES_LONGUES');
  const absences = [];
  if (absSheet) {
    const adata = absSheet.getDataRange().getValues();
    for (let r = 1; r < adata.length; r++) {
      const id = String(adata[r][0]).trim().toUpperCase();
      if (!id) continue;
      absences.push({ marId: id, dateDebut: _isoDate(adata[r][1]), dateFin: _isoDate(adata[r][2]) });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, absences }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "annulerAbsenceLongue" ── */
// ── (RH-2) Annuler ou raccourcir une absence longue ─────────────────
// Sans nouvelleFin : annulation totale (efface les CL de [d1,d2] + supprime
// la ligne du registre). Avec nouvelleFin : retour anticipé (efface les CL
// de ]nouvelleFin, d2] + met à jour la ligne du registre).
// SÉCURITÉ : on n'efface QUE les cases valant exactement 'CL' — jamais une
// garde, un statut ou toute autre valeur. Les gardes libérées à la pose ne
// sont PAS restaurées (redistribution par don/échange/garde exceptionnelle).
function _act_annulerAbsenceLongue(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const marId = String(payload.marId || '').trim().toUpperCase();
  const d1 = String(payload.dateDebut || '').trim();
  const d2 = String(payload.dateFin   || '').trim();
  const nf = String(payload.nouvelleFin || '').trim();   // optionnel
  if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
  if (nf && !/^\d{4}-\d{2}-\d{2}$/.test(nf)) return _error('nouvelleFin au format YYYY-MM-DD');
  if (nf && (nf < d1 || nf >= d2)) return _error('La nouvelle fin doit être dans la plage (≥ début, < fin actuelle)');

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1) Retrouver la ligne EXACTE du registre (marId + début + fin)
  const absSheet = ss.getSheetByName('ABSENCES_LONGUES');
  if (!absSheet) return _error('Registre ABSENCES_LONGUES introuvable');
  const adata = absSheet.getDataRange().getValues();
  let regRow = -1;
  for (let r = 1; r < adata.length; r++) {
    if (String(adata[r][0]).trim().toUpperCase() === marId
        && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { regRow = r; break; }
  }
  if (regRow < 0) return _error(`Absence introuvable au registre : ${marId} ${d1} -> ${d2}`);

  // 2) Plage à effacer : totale (annulation) ou queue (retour anticipé)
  const clearStart = nf ? (function(){ const x = new Date(nf + 'T12:00:00'); x.setDate(x.getDate()+1);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; })() : d1;
  const clearEnd = d2;
  const allDates = [];
  { const cur = new Date(clearStart + 'T12:00:00'), end = new Date(clearEnd + 'T12:00:00');
    while (cur <= end) {
      allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
      cur.setDate(cur.getDate() + 1);
    } }

  // 3) Effacer les CL année par année (miroir exact de poserAbsenceLongue)
  let nbEfface = 0;
  const touched = [];
  const years = [];
  for (let y = Number(clearStart.slice(0,4)); y <= Number(clearEnd.slice(0,4)); y++) years.push(y);
  years.forEach(year => {
    const gSheet = ss.getSheetByName(`GARDES_${year}`);
    if (gSheet) {
      // Année générée : effacer les CL de GARDES + miroir INDISPOS
      const data = gSheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, year);
      let row = -1;
      for (let r = 3; r < data.length; r++)
        if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
      if (row < 0) return;
      const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
      if (!inYear.length) return;
      const indMap = getIndisposForDoctor(marId, year);
      let n = 0;
      inYear.forEach(dt => {
        const col = dateToCol[dt];
        if (String(data[row][col] || '').trim().toUpperCase() !== 'CL') return; // on ne touche QUE les CL
        gSheet.getRange(row + 1, col + 1).setValue('');
        if (indMap[dt] === 'CL') delete indMap[dt];
        n++;
      });
      if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (générée)`); }
    } else {
      // Année non générée : effacer les CL d'INDISPOS seulement
      const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
      if (!iSheet) return; // année pas créée : rien à effacer, la purge du registre suffit
      const idata = iSheet.getDataRange().getValues();
      const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
      const inYear = allDates.filter(dt => dset.has(dt));
      if (!inYear.length) return;
      const indMap = getIndisposForDoctor(marId, year);
      let n = 0;
      inYear.forEach(dt => { if (indMap[dt] === 'CL') { delete indMap[dt]; n++; } });
      if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (préparation)`); }
    }
  });

  // 4) Registre : mise à jour (raccourci) ou suppression (annulation)
  if (nf) absSheet.getRange(regRow + 1, 3).setValue(nf);
  else    absSheet.deleteRow(regRow + 1);

  logAction(`annulerAbsenceLongue — ${marId} ${d1} -> ${d2}${nf ? ' raccourcie au ' + nf : ' ANNULEE'} : ${nbEfface} CL effacé(s)`);
  return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbEfface, touched, nouvelleFin: nf || null }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "getConsultAbsences" ── */
// ── ACTION : getConsultAbsences (Lot 5-bis) ──────────────────────────
// Alimente l'ecran « Consultations a venir ». LECTURE SEULE, aucune donnee patient.
// Un seul aller-retour : consultations posees + absences de chaque MAR.
// ⚠️ Deux reponses selon le role : le motif d'absence (`c`) n'est JOINT QUE pour
//    'mar' et 'admin'. En session 'secretariat' il n'est meme pas envoye — le
//    masquer cote navigateur le laisserait lisible dans le source de la page.
function _act_getConsultAbsences(R) {
  const { e, payload, action, code, user } = R;
  try {
    const JOURS_CONSULT = 20;  // 4 semaines ouvrees de consultations affichees
    const JOURS_ABS     = 20;  // 4 semaines d'absences APRES la derniere consultation
    const avecMotifs = (user.role !== 'secretariat');
    const _isoD = function (d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
             '-' + String(d.getDate()).padStart(2, '0');
    };
    // 1) Fenetre de jours ouvres a partir d'aujourd'hui. Il en faut
    //    JOURS_CONSULT + JOURS_ABS : chaque consultation regarde 4 semaines DEVANT
    //    elle, donc la derniere consultation affichee a besoin de 4 semaines de plus.
    const jours = [];
    const _cur = new Date(); _cur.setHours(12, 0, 0, 0);
    while (jours.length < JOURS_CONSULT + JOURS_ABS) {
      const _dw = _cur.getDay();
      if (_dw >= 1 && _dw <= 5) jours.push(_isoD(_cur));
      _cur.setDate(_cur.getDate() + 1);
    }
    const joursConsult = jours.slice(0, JOURS_CONSULT);

    // 2) Effectif actif (MEDECINS). Index figes : [0] id, [1] nom, [3] actif.
    const ssL = SpreadsheetApp.getActiveSpreadsheet();
    const medSh = ssL.getSheetByName('MEDECINS');
    if (!medSh) return _error('Onglet MEDECINS introuvable');
    const medD = _medecinsRows_();
    const noms = {};
    // Appartenance au groupement liberal : colonne LIBERAL de MEDECINS, lue PAR
    // TITRE (comme checkCode). ⚠️ Ne JAMAIS deduire l'appartenance du releve : un
    // membre dont le mois n'est pas encore saisi n'y figure pas, il serait retire
    // des remplacants possibles alors qu'il est parfaitement disponible.
    const _hdrMed = (medD[0] || []).map(function (x) { return String(x).trim().toUpperCase(); });
    const colLibC = _hdrMed.indexOf('LIBERAL');
    const groupement = {};
    for (let r = 1; r < medD.length; r++) {
      const id = String(medD[r][COL_MED.ID]).trim();
      if (!id) continue;
      if (String(medD[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue;
      noms[id] = String(medD[r][COL_MED.NOM]).trim();
      if (colLibC >= 0 && String(medD[r][colLibC]).trim().toUpperCase() === 'O') groupement[id] = true;
    }

    // 3) Consultations : lues dans le PLANNING PUBLIE (planning_{Y}.json), pas dans
    //    PLANNING_OVERRIDES. Raison : les overrides ne contiennent que ce que le comite
    //    a pose A LA MAIN ; tout ce qui vient de la generation (dont les affectations de
    //    secteur) n'y figure pas. Le JSON est le rendu final = generation + overrides,
    //    donc exactement ce que voient les MARs dans planning.html. S'il n'est pas publie,
    //    la consultation n'existe pour personne — la source est donc la bonne par
    //    definition. Le JSON est lu ICI, cote serveur : il ne part JAMAIS au navigateur
    //    (il contient le code d'absence brut de chaque MAR dans `status`).
    const consultations = [];
    const vus = {};                       // dedoublonnage date|mar|periode
    const anneesJ = {};
    // anneePlanning (code.gs) et non ds.slice(0,4) : les 1ers jours de janvier
    // appartiennent au planning de l'annee PRECEDENTE (cf. commentaire du helper).
    joursConsult.forEach(function (ds) { anneesJ[anneePlanning(ds)] = true; });
    Object.keys(anneesJ).forEach(function (an) {
      let doc;
      try {
        const raw = readPlanningFromDrive('planning_' + an + '.json');
        if (!raw) return;                  // annee non publiee : rien a lire
        doc = JSON.parse(raw);
      } catch (e) { return; }
      (doc.months || []).forEach(function (mois) {
        const jrs = mois.days || [];
        (mois.doctors || []).forEach(function (md) {
          const id = md.id;
          if (!noms[id]) return;           // MAR inactif ou inconnu
          (md.days || []).forEach(function (cell, i) {
            const j = jrs[i];
            if (!j || !j.date || joursConsult.indexOf(j.date) < 0) return;
            if (j.isWeekend || j.isFerie) return;
            const am = String((cell && cell.morning)   || '');
            const pm = String((cell && cell.afternoon) || '');
            const cs = String((cell && cell.cs)        || '');
            const _add = function (code, per) {
              const k = j.date + '|' + id + '|' + per;
              if (vus[k]) return;
              vus[k] = true;
              consultations.push({date: j.date, mar: id, cs: code, per: per});
            };
            if (am.indexOf('CS-') === 0) _add(am, 'am');
            if (pm.indexOf('CS-') === 0) _add(pm, 'pm');
            if (cs.indexOf('CS-') === 0) _add(cs, 'am');   // champ dedie (defensif)
            // MIROIR MATERNITE — mardi (dow 2) et jeudi (dow 4) matin.
            // Regle existante d'admin.html l.2586 : « la consult CS-MAT et la ligne MAT
            // sont la MEME personne, le MAR de mater fait la consult systematiquement ».
            // Elle n'est ecrite NULLE PART dans les donnees : elle est recalculee a
            // l'affichage. Sans cette reprise, l'ecran raterait toutes les consultations
            // de maternite. Sens unique, comme dans admin.html : etre en MAT implique la
            // consult, l'inverse n'est pas vrai.
            if ((j.dow === 2 || j.dow === 4) && am === 'MAT') _add('CS-MAT', 'am');
          });
        });
      });
    });
    consultations.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.per < b.per ? -1 : 1);
    });

    // 4) Absences par MAR sur toute la fenetre.
    //    Source : GARDES_{Y} (onglet maitre : la campagne d'indispos y est recopiee
    //    par generateur_gardes.gs, et poserAbsenceLongue y ecrit CL directement).
    //    ABSENT_CODES (code.gs) = RG,V,F,CTP,CP,R,A,TP,CL — G/G2 volontairement
    //    ABSENTS de ce jeu : un MAR de garde peut assurer une intervention liberale.
    //    Trois absences ne figurent PAS dans GARDES et sont ajoutees ici, sans quoi
    //    l'ecran afficherait « disponible » a tort :
    //      TP  = jour fixe non travaille (colonne tp_jours_fixes de MEDECINS)
    //      OFF = semaine off du rythme 2/2
    //      HS  = hors periode d'activite (date_debut / date_fin)
    const FL = getMedecinFlags();
    const parAn = {};                                // annee -> {data, dateToCol}
    const _gardes = function (an) {
      if (parAn[an] === undefined) {
        const sh = ssL.getSheetByName('GARDES_' + an);
        if (!sh) { parAn[an] = null; }
        else {
          const dt = sh.getDataRange().getValues();
          const codes = {};
          for (let r = 3; r < dt.length; r++) {      // MARs des la ligne 4
            const gid = String(dt[r][0]).trim();
            if (gid) codes[gid] = dt[r];
          }
          parAn[an] = {codes: codes, col: buildDateToCol(dt, an)};
        }
      }
      return parAn[an];
    };

    const absences = {};
    const horsTotal = [];          // MAR hors service sur TOUTE la fenetre
    Object.keys(noms).forEach(function (id) {
      const liste = [];
      let nbHS = 0;
      const tpj = FL.tpJoursFixes[id];
      const dd  = FL.dateDebut[id], df = FL.dateFin[id];
      jours.forEach(function (ds) {
        let code = '';
        if (dd && ds < dd) code = 'HS';                        // pas encore en poste
        else if (df && ds >= df) code = 'HS';                  // a quitte le service
        else {
          const g = _gardes(anneePlanning(ds));   // pas ds.slice(0,4) : voir code.gs
          if (g) {
            const c = g.col[ds];
            if (c !== undefined && g.codes[id]) {
              code = String(g.codes[id][c] || '').trim().toUpperCase();
            }
          }
          if (!ABSENT_CODES.has(code)) code = '';              // present ce jour-la
          if (!code && tpj && tpj.has(new Date(ds + 'T12:00:00').getDay())) code = 'TP';
          if (!code && estSemaineOff(id, ds)) code = 'OFF';
        }
        if (code === 'HS') nbHS++;
        if (code) liste.push(avecMotifs ? {d: ds, c: code} : {d: ds});
      });
      // Hors service sur TOUS les jours de la fenetre (pas encore arrive, ou deja
      // parti) : il ne fait pas partie de l'effectif pour cette periode.
      if (nbHS === jours.length) { horsTotal.push(id); return; }
      if (liste.length) absences[id] = liste;
    });
    // ⚠️ Retirer AUSSI de `noms` et des consultations, pas seulement des absences :
    // un MAR absent de la carte d'absences serait lu comme PRESENT par le frontend
    // (« pas d'absence ce jour-la »), donc propose comme remplacant alors qu'il
    // n'est pas dans le service. C'est le faux « disponible » que l'outil doit eviter.
    horsTotal.forEach(function (id) { delete noms[id]; delete absences[id]; });
    const consultationsF = consultations.filter(function (c) { return !!noms[c.mar]; });

    // 5) MARGE LIBERALE (axe CCAM) — sert a classer les remplacants possibles.
    //    Une consultation liberale declenche un bloc : c'est le CCAM qui portera
    //    la charge, pas le NGAP. Calculee ICI et non par un appel getReleveLiberal
    //    du navigateur : cette action reste HORS de SECRETARIAT_ACTIONS. Ne sort
    //    qu'UNE valeur derivee par MAR — jamais les tarifs, pourcentages ni exces.
    //    ⚠️ Le jour ou le secretariat prend cette mission : remplacer ici la valeur
    //    par un rang (1, 2, 3…) quand avecMotifs === false. L'ordre reste, les
    //    montants disparaissent, et rien ne change dans la page.
    // (27/11/2026) Aussi l'axe NGAP : le confrère qui reprend un patient fait la consultation
    // (NGAP) ET l'anesthésie (CCAM) — les deux comptent dans ses 30 %.
    let marges = {}, margesNgap = {}, margesMois = '';
    try {
      if (typeof getReleveLiberal === 'function') {
        const rel = getReleveLiberal({});                 // annee liberale par defaut
        const its = (rel && rel.items) || [];
        if (its.length) {
          const dernier = its.map(function (i) { return i.mois; }).sort().pop();
          its.forEach(function (i) {
            if (i.mois !== dernier) return;
            // marge = T x (3 - 10p) / 7 : nulle a 30 %, negative au-dela
            if (i.tCcam !== null && i.pctCcam !== null) marges[i.marId] = i.tCcam * (3 - 10 * (i.pctCcam / 100)) / 7;
            if (i.tNgap !== null && i.tNgap !== undefined && i.pctNgap !== null && i.pctNgap !== undefined)
              margesNgap[i.marId] = i.tNgap * (3 - 10 * (i.pctNgap / 100)) / 7;
          });
          margesMois = dernier;
        }
      }
    } catch (e) { marges = {}; margesNgap = {}; margesMois = ''; }   // confort de tri : jamais bloquant
    // Non-membre du groupement : aucun chiffre. Le masquage de la tuile ne suffit
    // pas — absences.html est une page publique, seul le serveur ferme la porte.
    if (!user.liberal) { marges = {}; margesNgap = {}; margesMois = ''; }
    // (27/11/2026, décision du responsable) AUCUN montant ne quitte le serveur : seulement le
    // RANG de chaque confrère (1 = le plus de place sous les 30 %), d'après la plus serrée
    // des marges CCAM et NGAP. Les montants « risquent de faire des histoires ».
    const rangsMarge = {};
    Object.keys(marges).concat(Object.keys(margesNgap))
      .filter(function (id, i, t) { return t.indexOf(id) === i; })
      .map(function (id) {
        const v = [marges[id], margesNgap[id]].filter(function (x) { return x !== undefined && x !== null; });
        return { id: id, m: Math.min.apply(null, v) };
      })
      .sort(function (a, b) { return b.m - a.m || (a.id < b.id ? -1 : 1); })
      .forEach(function (x, i) { rangsMarge[x.id] = i + 1; });
    // Patients lib : tout MAR du groupement libéral (27/11/2026 ; avant : droit `patlib`, le temps du test).
    let patlib = false, patients = [];
    try {
      if (_patlibDroit_(user)) { patlib = true; patients = _patlibLire_(user.id); }
    } catch (e) { patlib = false; patients = []; }   // jamais bloquant pour le reste de la page
    // (28/11/2026) « Le vrai canal est l'appel au collègue » : le DECT de chaque confrère du
    // groupement (colonne DECT de MEDECINS, la même que l'annuaire du portail). Servi aux seuls
    // MAR qui notent des patients lib — jamais au secrétariat.
    const dects = {};
    if (patlib) {
      for (let r = 1; r < medD.length; r++) {
        const idD = String(medD[r][COL_MED.ID]).trim(), d = String(medD[r][COL_MED.DECT] == null ? '' : medD[r][COL_MED.DECT]).trim();
        if (idD && d && groupement[idD] && noms[idD]) dects[idD] = d;
      }
    }
    // (26/11/2026) Export CPA : salles de mes consultations et leurs patients lib
    let salles = {}, aChoisir = [];
    if (patlib) {
      try {
        const exp = _cpaLire_();
        if (exp.length) {
          const jx = {}; exp.forEach(function (x) { jx[x.consult] = true; });
          const rs = _cpaResoudre_(user.id, _cpaConsultsJours_(Object.keys(jx)), exp, _cpaSallesLire_());
          salles = rs.salles; aChoisir = rs.aChoisir;
          patients = patients.concat(_cpaLignes_(user.id, rs.salles, exp));
          // Consultations du secteur : à valider (MAR du secteur) ou prises (elles deviennent les siennes)
          rs.pris.map(function (c) { return { date: c.date, per: c.per, cs: c.cs, mar: user.id, secteur: true }; })
            .concat(rs.secteurs.map(function (c) { return { date: c.date, per: c.per, cs: c.cs, mar: user.id, secteur: true, aValider: true, nbSecteur: c.nb, enAttente: c.enAttente }; }))
            .forEach(function (c) {
              if (joursConsult.indexOf(c.date) < 0) return;
              if (consultationsF.some(function (o) { return o.date === c.date && o.per === c.per && o.mar === user.id; })) return;
              consultationsF.push(c);
            });
          consultationsF.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.per < b.per ? -1 : 1); });
        }
      } catch (e) { salles = {}; aChoisir = []; }
    }

    // (28/11/2026) Placements au bloc des confrères du groupement, les jours de MES consultations
    // et les jours d'intervention de MES patients : sert à mettre le MAR du secteur en tête.
    let placements = {};
    if (patlib) {
      try {
        const jp = {};
        consultationsF.forEach(function (c) { if (c.mar === user.id) jp[c.date] = true; });
        patients.forEach(function (p) { if (p.mar === user.id) { jp[p.consult] = true; jp[p.bloc] = true; } });
        const garder = {};
        Object.keys(groupement).forEach(function (g) { if (noms[g] && g !== user.id) garder[g] = true; });
        if (Object.keys(jp).length) placements = _cpaPlacements_(Object.keys(jp), garder);
      } catch (e) { placements = {}; }   // confort de tri : jamais bloquant
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      motifs: avecMotifs,          // le frontend sait s'il peut afficher un motif
      groupement: groupement,      // id -> true : membre du groupement liberal
      rangsMarge: rangsMarge,      // id -> rang (1 = le plus de place sous les 30 %), sans montant
      margesMois: margesMois,      // 'AAAA-MM' du releve utilise ('' si aucun)
      role: user.role,                       // (04/08/2026, fusion absences.html) auth + donnees en UN appel
      name: user.name || '',                 //  → le login separe devient un simple journal d'arriere-plan
      moi: user.role === 'mar' ? user.id : null,
      jours: joursConsult,
      noms: noms,
      consultations: consultationsF,
      absences: absences,
      patlib: patlib,              // (26/11/2026) droit « patlib » : saisie des patients lib
      patients: patients,          // ses lignes (aucun nom de patient)
      dects: dects,                // (28/11/2026) id -> DECT des confrères du groupement (vide sans patlib)
      placements: placements,      // (28/11/2026) date -> id -> { am, pm } : secteurs du bloc (vide sans patlib)
      salles: salles,              // (26/11/2026) 'date|per' -> salle CPA de mes consultations
      aChoisir: aChoisir           // consultations dont la salle reste à choisir
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return _error(err.message); }
}

/* ══ PATIENTS LIB D'UNE CONSULTATION (26/11/2026) ══════════════════════════
   Le MAR note, pour chacune de ses consultations, ses patients lib : date
   opératoire + nombre. AUCUN NOM DE PATIENT, nulle part. S'il est absent le
   jour du geste, la page lui montre qui peut voir le patient à sa place ;
   après accord VERBAL, il le « confie » : le confrère le retrouve dans sa page.
   Prévenir le secrétariat des consultations reste un appel, hors de l'outil.
   Réservé au droit `patlib` (CONFIG / TUILES_PRIVEES), comme les autres
   tuiles réservées : le temps du test, puis ouvert au groupement.
   Le verdict (présent / absent) n'est JAMAIS enregistré : la page le
   recalcule à chaque ouverture, une absence posée après coup se voit. */
const PATLIB_ONGLET = 'PATIENTS_LIB';
const PATLIB_ENTETE = ['ID', 'MAR', 'DATE_CONSULT', 'PER', 'DATE_BLOC', 'NB', 'CONFIE_A', 'MAJ'];
function _patlibJour_(v) {
  if (v instanceof Date) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  return String(v == null ? '' : v).trim().slice(0, 10);
}
function _patlibFeuille_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PATLIB_ONGLET);
  if (!sh && creer) {             // créé au premier patient noté, jamais avant
    sh = ss.insertSheet(PATLIB_ONGLET);
    sh.appendRow(PATLIB_ENTETE);
    sh.setFrozenRows(1);
  }
  return sh;
}
/* Ses lignes (MAR), date opératoire à venir seulement : le passé ne sert plus à rien.
   (28/11/2026, décision du responsable) CONFIE_A dit avec qui c'est réglé (identifiant d'un
   confrère, ou « - » : réglé autrement). C'est un pense-bête du MAR qui a noté la ligne :
   il n'est servi qu'à LUI, le confrère nommé ne voit rien de son côté. */
function _patlibLire_(id) {
  const sh = _patlibFeuille_(false);
  if (!sh) return [];
  const auj = _patlibJour_(new Date());
  const out = [];
  sh.getDataRange().getValues().slice(1).forEach(function (l) {
    const mar = String(l[1]).trim(), confie = String(l[6] || '').trim();
    const bloc = _patlibJour_(l[4]);
    if (!l[0] || bloc < auj) return;
    if (mar !== id) return;
    const cpa = String(l[0]).indexOf('cpa|') === 0;
    if (cpa) return;                                         // ma ligne CPA : servie par _cpaLignes_ (nombre 0 = retirée)
    out.push({ id: String(l[0]), mar: mar, consult: _patlibJour_(l[2]), per: String(l[3]).trim(),
               bloc: bloc, nb: Number(l[5]) || 1, confieA: confie, cpa: cpa });
  });
  return out;
}
/* Règle médico-légale : le geste au moins 48 h et au plus un mois après la
   consultation (même quantième le mois suivant), jamais un week-end. */
function _patlibDelai_(consult, bloc) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(consult) || !re.test(bloc)) return 'Date illisible.';
  const c = new Date(consult + 'T12:00:00'), b = new Date(bloc + 'T12:00:00');
  if (b.getDay() === 0 || b.getDay() === 6) return 'Cette date tombe un week-end.';
  const min = new Date(c); min.setDate(min.getDate() + 2);
  const max = new Date(c); max.setMonth(max.getMonth() + 1);
  if (b < min) return 'Trop tôt : la consultation doit avoir lieu au moins 48 h avant le geste.';
  if (b > max) return 'Trop tard : la consultation doit avoir lieu dans le mois qui précède le geste.';
  return '';
}
function _patlibMembre_(id) {        // actif ET membre du groupement libéral (colonne LIBERAL de MEDECINS)
  const med = _medecinsRows_();
  const col = (med[0] || []).map(function (x) { return String(x).trim().toUpperCase(); }).indexOf('LIBERAL');
  if (col < 0) return false;
  for (let r = 1; r < med.length; r++) {
    if (String(med[r][COL_MED.ID]).trim() !== id) continue;
    return String(med[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O' && String(med[r][col]).trim().toUpperCase() === 'O';
  }
  return false;
}
/* (27/11/2026) Ouvert à tout le groupement libéral (colonne LIBERAL de MEDECINS, portée
   par la session). Le droit réservé `patlib` reste reconnu. */
function _patlibDroit_(user) {
  return !!user && user.role === 'mar' && (user.liberal === true || _aDroitTuile_(user.id, 'patlib'));
}
function _act_patientsLib(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'mar') return _deny();
  try {
    if (!_patlibDroit_(user)) return _deny();
    const op = String(payload.op || '');
    const ok = function () {
      return ContentService.createTextOutput(JSON.stringify({ success: true, patients: _patlibLire_(user.id) }))
        .setMimeType(ContentService.MimeType.JSON);
    };
    if (op === 'ajouter') {
      const consult = String(payload.consult || ''), bloc = String(payload.bloc || '');
      const per = payload.per === 'am' ? 'am' : 'pm';
      const nb = Number(payload.nb);
      if (!(nb >= 1 && nb <= 9 && Math.floor(nb) === nb)) return _error('Nombre de patients invalide.');
      const err = _patlibDelai_(consult, bloc);
      if (err) return _error(err);
      _patlibFeuille_(true).appendRow([Utilities.getUuid(), user.id, consult, per, bloc, nb, '', new Date()]);
      return ok();
    }
    if (op === 'salle') {             // (26/11/2026) le MAR choisit sa salle CPA
      const date = String(payload.date || ''), per = payload.per === 'am' ? 'am' : 'pm', salle = String(payload.salle || '');
      const exp = _cpaLire_();
      const rs = _cpaResoudre_(user.id, _cpaConsultsJours_([date]), exp, _cpaSallesLire_());
      const prop = rs.aChoisir.filter(function (x) { return x.date === date && x.per === per; })[0];
      if (!prop || (prop.salles.indexOf(salle) < 0 && !(salle === '-' && prop.aucune))) return _error('Salle non proposée pour cette consultation.');
      _cpaSalleEcrire_(date, per, user.id, salle);
      return ok();
    }
    if (op === 'secteur') {           // (26/11/2026) consultation tenue par le secteur : « c'est moi qui la fais »
      const date = String(payload.date || ''), per = payload.per === 'am' ? 'am' : 'pm', cs = String(payload.cs || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^CS-[A-Z]+$/.test(cs)) return _error('Consultation introuvable.');
      const c = _cpaConsultsJours_([date]).filter(function (x) { return x.secteur && x.per === per && x.cs === cs; })[0];
      if (!c) return _error('Cette consultation n\'est plus tenue par le secteur.');
      const qui = _cpaSallesLire_()[date + '|' + per + '|' + cs] || '';
      if (payload.prendre) {
        if (c.membres.indexOf(user.id) < 0) return _error('Vous n\'êtes pas placé dans ce secteur ce jour-là.');
        if (qui && qui !== user.id) return _error('Un confrère a déjà pris cette consultation.');
        _cpaPrise_(date, per, cs, user.id);
      } else {
        if (qui !== user.id) return _error('Ce n\'est pas vous qui avez pris cette consultation.');
        _cpaPrise_(date, per, cs, '');
      }
      return ok();
    }
    if (String(payload.id || '').indexOf('cpa|') === 0) {   // une ligne venue de l'export CPA
      const p = String(payload.id).split('|');             // cpa|date|per|salle|bloc
      const exp = _cpaLire_();
      const x = exp.filter(function (e) { return e.consult === p[1] && e.per === p[2] && e.salle === p[3] && e.bloc === p[4]; })[0];
      if (!x) return _error('Ligne introuvable.');
      const rs = _cpaResoudre_(user.id, _cpaConsultsJours_([p[1]]), exp, _cpaSallesLire_());
      if (!_cpaASalle_(rs.salles, p[1] + '|' + p[2], p[3])) return _error('Ligne introuvable.');
      let nb = x.nb, confie;
      if (op === 'confier') {
        confie = String(payload.a || '').trim();
        if (confie !== '-' && (!confie || confie === user.id || !_patlibMembre_(confie))) return _error('Ce confrère ne fait pas partie du groupement libéral.');
      } else if (op === 'reprendre') confie = '';
      else if (op === 'supprimer') { nb = 0; confie = ''; }
      else return _error('Opération inconnue.');
      const f = _patlibFeuille_(true), lg = f.getDataRange().getValues();
      const ligne = [String(payload.id), user.id, p[1], p[2], p[4], nb, confie, new Date()];
      let n = -1;
      for (let r = 1; r < lg.length; r++) if (String(lg[r][0]) === String(payload.id)) { n = r; break; }
      if (n < 0) f.appendRow(ligne); else f.getRange(n + 1, 1, 1, 8).setValues([ligne]);
      return ok();
    }
    // Les autres opérations portent sur UNE ligne du MAR lui-même.
    const sh = _patlibFeuille_(false);
    if (!sh) return _error('Ligne introuvable.');
    const lignes = sh.getDataRange().getValues();
    let n = -1;
    for (let r = 1; r < lignes.length; r++) {
      if (String(lignes[r][0]) === String(payload.id || '')) { n = r; break; }
    }
    if (n < 0 || String(lignes[n][1]).trim() !== user.id) return _error('Ligne introuvable.');
    if (op === 'supprimer') { sh.deleteRow(n + 1); return ok(); }
    if (op === 'reprendre') { sh.getRange(n + 1, 7, 1, 2).setValues([['', new Date()]]); return ok(); }
    if (op === 'confier') {
      const a = String(payload.a || '').trim();   // « - » : réglé autrement, sans confrère nommé (28/11/2026)
      if (a !== '-' && (!a || a === user.id || !_patlibMembre_(a))) return _error('Ce confrère ne fait pas partie du groupement libéral.');
      sh.getRange(n + 1, 7, 1, 2).setValues([[a, new Date()]]);
      return ok();
    }
    return _error('Opération inconnue.');
  } catch (err) { return _error(err.message); }
}

/* ══ EXPORT CPA DE LA SEMAINE (26/11/2026) ═════════════════════════════════
   Le responsable importe l'export des 4 salles de CPA (page Maintenance). Le
   fichier est lu DANS LE NAVIGATEUR ; n'arrivent ici, pour chaque patient au
   régime Libéral, que : jour + demi-journée de consultation, salle, secteur,
   date opératoire, nombre. Ni nom, ni heure, ni type d'intervention.
   Une consultation du planning se rattache à sa salle : une seule salle de son
   secteur cette demi-journée (et un seul MAR de ce secteur) → automatique ;
   sinon le MAR choisit (CPA_SALLES). Les patients de la salle deviennent ses
   lignes (id « cpa|date|per|salle|bloc ») ; confier / reprendre / retirer une
   de ces lignes s'écrit dans PATIENTS_LIB sous le même id. */
const CPA_ONGLET = 'CPA_EXPORT';
const CPA_ENTETE = ['DATE_CONSULT', 'PER', 'SALLE', 'SECTEUR', 'DATE_BLOC', 'NB', 'IMPORT'];
const CPA_SALLES_ONGLET = 'CPA_SALLES';
const CPA_SALLES_ENTETE = ['DATE', 'PER', 'MAR', 'SALLE', 'MAJ'];
const CPA_SECTEURS = ['END', 'VIS', 'ORT', 'ORL', 'INTER', 'MAT'];
const CPA_BLOC = { END: 'END', VIS: 'VIS', ORT: 'ORT', ORL: 'ORL', INTER: 'CI', MAT: 'MAT', PED: 'PED' };   // consultation → secteur du bloc
function _cpaSecteur_(cs) { const c = String(cs || '').replace(/^CS-/, ''); return c === 'CI' ? 'INTER' : c; }
function _cpaLire_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CPA_ONGLET);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).filter(function (l) { return l[0]; }).map(function (l) {
    return { consult: _patlibJour_(l[0]), per: String(l[1]).trim(), salle: String(l[2]).trim(),
             secteur: String(l[3]).trim(), bloc: _patlibJour_(l[4]), nb: Number(l[5]) || 1 };
  });
}
function _cpaSallesLire_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CPA_SALLES_ONGLET), out = {};
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (l) {
    if (!l[0]) return;
    const k = _patlibJour_(l[0]) + '|' + String(l[1]).trim(), mar = String(l[2]).trim(), sal = String(l[3]).trim();
    if (sal.indexOf('CS-') === 0) out[k + '|' + sal] = mar;      // consultation du secteur prise par ce MAR
    else out[k + '|' + mar] = sal;                                // salle choisie ('-' : aucune)
  });
  return out;
}
function _cpaSalleEcrire_(date, per, mar, salle) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CPA_SALLES_ONGLET);
  if (!sh) { sh = ss.insertSheet(CPA_SALLES_ONGLET); sh.appendRow(CPA_SALLES_ENTETE); sh.setFrozenRows(1); }
  const lg = sh.getDataRange().getValues();
  for (let r = 1; r < lg.length; r++) {
    if (_patlibJour_(lg[r][0]) === date && String(lg[r][1]).trim() === per && String(lg[r][2]).trim() === mar
        && String(lg[r][3]).trim().indexOf('CS-') !== 0) {
      sh.getRange(r + 1, 4, 1, 2).setValues([[salle, new Date()]]); return;
    }
  }
  sh.appendRow([date, per, mar, salle, new Date()]);
}
/* (26/11/2026) Consultation du secteur : « c'est moi qui la fais » (mar), ou plus personne (''). */
function _cpaPrise_(date, per, cs, mar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CPA_SALLES_ONGLET);
  if (!sh) { if (!mar) return; sh = ss.insertSheet(CPA_SALLES_ONGLET); sh.appendRow(CPA_SALLES_ENTETE); sh.setFrozenRows(1); }
  const lg = sh.getDataRange().getValues();
  for (let r = lg.length - 1; r >= 1; r--) {
    if (_patlibJour_(lg[r][0]) === date && String(lg[r][1]).trim() === per && String(lg[r][3]).trim() === cs) {
      if (mar) { sh.getRange(r + 1, 3, 1, 3).setValues([[mar, cs, new Date()]]); return; }
      sh.deleteRow(r + 1);
    }
  }
  if (mar) sh.appendRow([date, per, mar, cs, new Date()]);
}
/* Une salle de `salles` (valeur : '2' ou ['2','4']) ? */
function _cpaASalle_(salles, k, salle) { const v = salles[k]; return Array.isArray(v) ? v.indexOf(salle) > -1 : v === salle; }
function _cpaAjSalle_(salles, k, salle) {
  const v = salles[k];
  if (v === undefined) salles[k] = salle;
  else if (!_cpaASalle_(salles, k, salle)) salles[k] = [].concat(v, [salle]);
}
function _cpaConsultsJours_(dates) {
  const out = [], vus = {}, ans = {};
  dates.forEach(function (d) { ans[anneePlanning(d)] = true; });
  Object.keys(ans).forEach(function (an) {
    let doc;
    try { const raw = readPlanningFromDrive('planning_' + an + '.json'); if (!raw) return; doc = JSON.parse(raw); }
    catch (e) { return; }
    const membres = {};                 // 'date|per|VIS' -> MAR placés dans ce secteur du bloc
    (doc.months || []).forEach(function (mois) {
      const jrs = mois.days || [];
      (mois.doctors || []).forEach(function (md) {
        (md.days || []).forEach(function (cell, i) {
          const j = jrs[i];
          if (!j || !j.date || dates.indexOf(j.date) < 0 || j.isWeekend || j.isFerie) return;
          const am = String((cell && cell.morning) || ''), pm = String((cell && cell.afternoon) || '');
          const add = function (code, per) {
            const k = j.date + '|' + md.id + '|' + per;
            if (vus[k]) return; vus[k] = true;
            out.push({ date: j.date, mar: md.id, cs: code, per: per });
          };
          if (am.indexOf('CS-') === 0) add(am, 'am');
          if (pm.indexOf('CS-') === 0) add(pm, 'pm');
          if ((j.dow === 2 || j.dow === 4) && am === 'MAT') add('CS-MAT', 'am');
          [['am', am], ['pm', pm]].forEach(function (x) {
            x[1].split('+').forEach(function (t) { t = t.trim(); if (t) (membres[j.date + '|' + x[0] + '|' + t] = membres[j.date + '|' + x[0] + '|' + t] || []).push(md.id); });
          });
        });
      });
    });
    // (26/11/2026) Consultation « tenue par le secteur, sans nom » (page admin, notes du
    // planning `css`) : faite par un des MAR placés dans ce secteur du bloc ce jour-là.
    Object.keys(doc.notes || {}).forEach(function (d) {
      if (dates.indexOf(d) < 0) return;
      const css = (doc.notes[d] || {}).css || {};
      ['am', 'pm'].forEach(function (per) {
        (Array.isArray(css[per]) ? css[per] : []).forEach(function (cs) {
          cs = String(cs);
          if (cs.indexOf('CS-') !== 0 || vus[d + '|' + cs + '|' + per]) return;
          vus[d + '|' + cs + '|' + per] = true;
          const bloc = CPA_BLOC[_cpaSecteur_(cs)] || '';
          out.push({ date: d, mar: '', cs: cs, per: per, secteur: true, membres: (bloc && membres[d + '|' + per + '|' + bloc]) || [] });
        });
      });
    });
  });
  return out;
}
/* (28/11/2026, décision du responsable) « Qui appeler » : priorité au MAR DU SECTEUR, avant tout
   classement lié au libéral. Pour les jours demandés, rend qui est placé dans quel secteur du bloc
   d'après le planning publié : { date: { id: { am: ['VIS'], pm: ['VIS','MAT'] } } }. Un jour dont le
   planning n'est pas encore posé ne rend rien : la page retombe alors sur l'ordre habituel. */
function _cpaPlacements_(dates, garder) {
  const out = {}, ans = {}, blocs = {};
  Object.keys(CPA_BLOC).forEach(function (k) { blocs[CPA_BLOC[k]] = true; });
  dates.forEach(function (d) { ans[anneePlanning(d)] = true; });
  Object.keys(ans).forEach(function (an) {
    let doc;
    try { const raw = readPlanningFromDrive('planning_' + an + '.json'); if (!raw) return; doc = JSON.parse(raw); }
    catch (e) { return; }
    (doc.months || []).forEach(function (mois) {
      const jrs = mois.days || [];
      (mois.doctors || []).forEach(function (md) {
        if (garder && !garder[md.id]) return;
        (md.days || []).forEach(function (cell, i) {
          const j = jrs[i];
          if (!j || !j.date || dates.indexOf(j.date) < 0) return;
          [['am', (cell && cell.morning) || ''], ['pm', (cell && cell.afternoon) || '']].forEach(function (x) {
            const t = String(x[1]).split('+').map(function (s) { return s.trim(); }).filter(function (s) { return blocs[s]; });
            if (!t.length) return;
            const o = (out[j.date] = out[j.date] || {}), m = (o[md.id] = o[md.id] || {});
            m[x[0]] = t;
          });
        });
      });
    });
  });
  return out;
}
/* Salles des consultations d'UN MAR. `choisies` : 'date|per|mar' -> salle. */
function _cpaResoudre_(id, consults, exp, choisies) {
  const salles = {}, aChoisir = [], secteurs = [], pris = [], auj = _patlibJour_(new Date());
  const candidates = function (c, sec) {
    const cand = [];
    exp.forEach(function (x) { if (x.consult === c.date && x.per === c.per && x.secteur === sec && cand.indexOf(x.salle) < 0) cand.push(x.salle); });
    return cand.sort();
  };
  consults.filter(function (c) { return c.mar === id && !c.secteur; }).forEach(function (c) {
    const sec = _cpaSecteur_(c.cs), k = c.date + '|' + c.per;
    const cand = candidates(c, sec);
    if (!cand.length) return;
    const mien = choisies[k + '|' + id];
    if (mien === '-') return;                                                              // « aucune de ces salles »
    if (mien && cand.indexOf(mien) > -1) { salles[k] = mien; return; }
    const autres = consults.filter(function (o) { return o.mar !== id && o.date === c.date && o.per === c.per && _cpaSecteur_(o.cs) === sec; });
    const coll = autres.filter(function (o) { return !o.secteur; }).map(function (o) { return o.mar; });
    const parSecteur = autres.some(function (o) { return o.secteur; });   // le secteur tient aussi une consultation : toujours demander
    const prises = coll.map(function (m) { return choisies[k + '|' + m]; }).filter(Boolean);
    const libres = cand.filter(function (s) { return prises.indexOf(s) < 0; });
    if (!parSecteur && !coll.length && cand.length === 1) { salles[k] = cand[0]; return; }                 // seul de son secteur, une seule salle
    if (!parSecteur && libres.length === 1 && coll.every(function (m) { return choisies[k + '|' + m]; })) { salles[k] = libres[0]; return; }   // les autres ont choisi
    if (libres.length) aChoisir.push(parSecteur ? { date: c.date, per: c.per, salles: libres, aucune: true } : { date: c.date, per: c.per, salles: libres });
  });
  // (26/11/2026) Consultations tenues par le secteur : la salle qui reste quand chaque MAR
  // nommé a choisi la sienne ; montrées aux MAR du secteur, à celui qui la prend ensuite.
  consults.filter(function (c) { return c.secteur; }).forEach(function (c) {
    const k = c.date + '|' + c.per, sec = _cpaSecteur_(c.cs), qui = choisies[k + '|' + c.cs] || '';
    if (qui ? qui !== id : (c.membres || []).indexOf(id) < 0) return;
    const nommes = consults.filter(function (o) { return !o.secteur && o.date === c.date && o.per === c.per && _cpaSecteur_(o.cs) === sec; }).map(function (o) { return o.mar; });
    const enAttente = !nommes.every(function (m) { return choisies[k + '|' + m]; });
    const libres = enAttente ? [] : candidates(c, sec).filter(function (s) { return nommes.every(function (m) { return choisies[k + '|' + m] !== s; }); });
    const nb = exp.filter(function (x) { return x.consult === c.date && x.per === c.per && x.secteur === sec && libres.indexOf(x.salle) > -1 && x.bloc >= auj; })
      .reduce(function (t, x) { return t + x.nb; }, 0);
    if (qui === id) { libres.forEach(function (s) { _cpaAjSalle_(salles, k, s); }); pris.push({ date: c.date, per: c.per, cs: c.cs }); }
    else {
      // (26/11/2026) Sans patient lib, on ne demande rien : ni salle du secteur avec des patients,
      // ni (en attente) aucun patient à venir dans tout ce secteur ce jour-là.
      const total = exp.filter(function (x) { return x.consult === c.date && x.per === c.per && x.secteur === sec && x.bloc >= auj; }).length;
      if (enAttente ? !total : !nb) return;
      secteurs.push({ date: c.date, per: c.per, cs: c.cs, nb: nb, enAttente: enAttente });
    }
  });
  return { salles: salles, aChoisir: aChoisir, secteurs: secteurs, pris: pris };
}
/* Les patients de mes salles, avec ce que j'en ai fait (confié, retiré). */
function _cpaLignes_(id, salles, exp) {
  const auj = _patlibJour_(new Date()), sur = {}, sh = _patlibFeuille_(false), out = [];
  if (sh) sh.getDataRange().getValues().slice(1).forEach(function (l) {
    if (String(l[0]).indexOf('cpa|') === 0 && String(l[1]).trim() === id) sur[String(l[0])] = { nb: Number(l[5]), confie: String(l[6] || '').trim() };
  });
  exp.forEach(function (x) {
    if (!_cpaASalle_(salles, x.consult + '|' + x.per, x.salle) || x.bloc < auj) return;
    const cle = 'cpa|' + x.consult + '|' + x.per + '|' + x.salle + '|' + x.bloc, o = sur[cle];
    // (28/11/2026) Ligne retirée (nombre 0) : servie quand même, grisée, pour pouvoir la remettre.
    if (o && o.nb === 0) { out.push({ id: cle, mar: id, consult: x.consult, per: x.per, bloc: x.bloc, nb: 0, nbExport: x.nb, confieA: '', cpa: true, retire: true }); return; }
    out.push({ id: cle, mar: id, consult: x.consult, per: x.per, bloc: x.bloc, nb: x.nb, confieA: o ? o.confie : '', cpa: true });
  });
  return out;
}
function _act_importCpa(R) {
  const { e, payload, action, code, user } = R;
  if (!_droitMaintenance_(user)) return _deny();
  try {
    const re = /^\d{4}-\d{2}-\d{2}$/, agg = {}, jours = {};
    let rejetees = 0;
    (payload.lignes || []).forEach(function (l) {
      const c = String(l.consult || ''), b = String(l.bloc || ''), per = l.per === 'am' ? 'am' : (l.per === 'pm' ? 'pm' : '');
      const salle = String(l.salle || '').trim(), sec = String(l.secteur || ''), nb = Number(l.nb) || 1;
      if (!re.test(c) || !re.test(b) || !per || !/^\d{1,2}$/.test(salle) || CPA_SECTEURS.indexOf(sec) < 0 || b < c) { rejetees++; return; }
      const k = [c, per, salle, sec, b].join('|');
      agg[k] = (agg[k] || 0) + nb; jours[c] = true;
    });
    const dates = Object.keys(jours).sort();
    if (!dates.length) return _error('Aucun patient lib reconnu dans ce fichier.');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(CPA_ONGLET);
    if (!sh) { sh = ss.insertSheet(CPA_ONGLET); sh.appendRow(CPA_ENTETE); sh.setFrozenRows(1); }
    const vals = sh.getDataRange().getValues();      // un nouvel import des mêmes jours remplace l'ancien
    for (let r = vals.length - 1; r >= 1; r--) if (jours[_patlibJour_(vals[r][0])]) sh.deleteRow(r + 1);
    const maintenant = new Date();
    const lignes = Object.keys(agg).sort().map(function (k) { const p = k.split('|'); return [p[0], p[1], p[2], p[3], p[4], agg[k], maintenant]; });
    sh.getRange(sh.getLastRow() + 1, 1, lignes.length, 7).setValues(lignes);
    // Bilan : chaque salle de chaque demi-journée face aux consultations du planning
    const cons = _cpaConsultsJours_(dates), grp = {};
    lignes.forEach(function (l) { const k = [l[0], l[1], l[2], l[3]].join('|'); grp[k] = (grp[k] || 0) + l[5]; });
    const bilan = { auto: { consultations: 0, patients: 0 }, aConfirmer: { consultations: 0, patients: 0 }, sans: [] };
    Object.keys(grp).sort().forEach(function (k) {
      const p = k.split('|');
      const m = cons.filter(function (c) { return c.date === p[0] && c.per === p[1] && _cpaSecteur_(c.cs) === p[3]; }).length;
      const nbSalles = Object.keys(grp).filter(function (g) { const q = g.split('|'); return q[0] === p[0] && q[1] === p[1] && q[3] === p[3]; }).length;
      if (!m) bilan.sans.push({ date: p[0], per: p[1], salle: p[2], secteur: p[3], nb: grp[k] });
      else if (m === 1 && nbSalles === 1) { bilan.auto.consultations++; bilan.auto.patients += grp[k]; }
      else { bilan.aConfirmer.consultations++; bilan.aConfirmer.patients += grp[k]; }
    });
    return ContentService.createTextOutput(JSON.stringify({ success: true, jours: dates, lignes: lignes.length, rejetees: rejetees,
      patients: lignes.reduce(function (t, l) { return t + l[5]; }, 0), bilan: bilan })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return _error(err.message); }
}
