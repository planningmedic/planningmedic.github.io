/* ═══════════════════════════════════════════════════════════════════════
   INDISPONIBILITES — Indisponibilités : lecture/écriture des INDISPOS_<annee>, souhaits, figeage, vacances (périodes, groupes, quotas), absences longues, fériés et ponts
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_INDISPOS_METIER = '2026-09-15.2';

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
  // 1) conserver les cases de L'AUTRE proprietaire, telles qu'en base
  Object.keys(existant || {}).forEach(function (d) {
    const v = String(existant[d] || '').trim();
    if (v && auComite(v) !== estRoleComite) out[d] = v;
  });
  // 2) poser MES cases telles qu'envoyees (une date absente = retrait)
  Object.keys(envoye || {}).forEach(function (d) {
    const v = String(envoye[d] || '').trim();
    if (!v) return;
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
  Object.keys(payload.indispos || {}).forEach(function (ds) {
    const v = String(payload.indispos[ds] || '').trim().toUpperCase();
    if (v === 'INDISPO' && user.role !== 'admin') {
      if (nbIndC >= QUOTA_INDISPO) { indRefuses.push(ds); return; }
      const _dowI = new Date(ds + 'T12:00:00').getDay();
      if (_dowI === 0 || _dowI === 5 || _dowI === 6) {
        if (nbIndWeC >= QUOTA_INDISPO_WE) { indRefuses.push(ds + ' (week-end)'); return; }
        nbIndWeC++;
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
  logAction(`saveIndisposBatch : ${touches} MAR(s) enregistre(s)` +
            (inconnus.length ? ` — introuvables : ${inconnus.join(', ')}` : ''));
  return ContentService.createTextOutput(JSON.stringify({
    success: true, saved: touches, inconnus: inconnus
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
  const res = getOrdreVacances(user.id, [_an, _an + 1]);
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
    genere: _dejaGenere, anneeCampagne: indYear,
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
  return ContentService.createTextOutput(JSON.stringify({success:true, periodes, groupes, quotasConges:_loadQuotasConges()}))
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

/* ── action "envoyerRecapIndispos" ── */
function _act_envoyerRecapIndispos(R) {
  const { e, payload, action, code, user } = R;
  // (Remplace l'ancien récap indispos) — Récapitulatif des GARDES attribuées (G réa / G2 mat).
  if (user.role !== 'admin') return _deny();
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

  const site = 'https://planningmedic.github.io/';
  const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const dd = n => String(n).padStart(2,'0');

  let sent = 0, skipped = 0;
  const errors = [];

  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][COL_MED.ID]).trim();
    const nom = String(medData[r][COL_MED.NOM]).trim();
    const actif = String(medData[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
    const email = String(medData[r][COL_MED.EMAIL]).trim();
    if (!id || !actif) continue;
    if (!email) { skipped++; continue; }

    // Gardes du MAR (G / G2 uniquement)
    const gardes = [];
    for (let ri = 3; ri < gData.length; ri++) {
      if (String(gData[ri][0]).trim() !== id) continue;
      Object.keys(colToDate).forEach(col => {
        const date = colToDate[col];
        const val = String(gData[ri][Number(col)] || '').trim().toUpperCase();
        if (val === 'G' || val === 'G2') gardes.push({ date, type: val });
      });
      break;
    }
    gardes.sort((x,y2) => x.date < y2.date ? -1 : (x.date > y2.date ? 1 : 0));

    let nRea=0, nMat=0, nWe=0, nFer=0;
    const byMonth = {};
    gardes.forEach(gg => {
      const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
      if (gg.type === 'G') nRea++; else nMat++;
      if (dw === 0 || dw === 5 || dw === 6) nWe++;   // même définition que le marquage
      if (isF(gg.date)) nFer++;
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
            const _tous = (_h === _p);
            souhaitsHtml =
              '<div style="background:' + (_tous ? '#ecfdf5' : '#f8fafc') + ';border:1px solid '
              + (_tous ? '#cdeee6' : '#eef1f5') + ';border-radius:12px;padding:13px 16px;margin-bottom:22px">'
              + '<div style="font-size:13px;color:' + (_tous ? '#0d9488' : '#334155')
              + ';font-weight:700">' + (_tous ? '✓ ' : '') + 'Souhaits : ' + _h + ' retenu'
              + (_h > 1 ? 's' : '') + ' sur ' + _p + '</div></div>';
            souhaitsTexte = 'Souhaits : ' + _h + ' retenu' + (_h > 1 ? 's' : '') + ' sur ' + _p + '.\n';
            break;
          }
        }
      }
    } catch (eS) { /* le récapitulatif des souhaits est un confort, jamais bloquant */ }

    // ---------- HTML ----------
    const chips =
      `<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border:1px solid #dbe6ff;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nRea} réanimation</span>` +
      `<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border:1px solid #cdeee6;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nMat} maternité</span>` +
      (nWe ? `<span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fde3cf;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nWe} jour${nWe>1?'s':''} de week-end</span>` : '') +
      (nFer ? `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fbd5d5;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nFer} férié${nFer>1?'s':''}</span>` : '');

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

    const parMois = {};
    unites.forEach(u => {
      const mo = Number(u.jours[0].date.slice(5,7)) - 1;
      (parMois[mo] = parMois[mo] || []).push(u);
    });

    const badgeDe = t => t === 'G'
      ? '<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G &middot; Réa</span>'
      : '<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G2 &middot; Mat</span>';
    const libelle = ds => {
      const dt = new Date(ds + 'T12:00:00');
      return `${JOURS[dt.getDay()]} ${dd(dt.getDate())}/${dd(dt.getMonth()+1)}`;
    };

    Object.keys(parMois).map(Number).sort((p,q)=>p-q).forEach(mo => {
      rowsHtml += `<div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#94a3b8;margin:18px 0 8px 2px">${MOIS[mo]}</div>`;
      parMois[mo].forEach(u => {
        if (u.we) {
          /* Chaque jour garde SA ligne (sa date, son rôle) ; c'est le cadre qui les
             réunit — le vendredi et le dimanche sont un seul week-end de garde. */
          rowsHtml += `<div style="border:1px solid #fde3cf;background:#fffaf5;border-radius:10px;padding:8px 12px 4px;margin-bottom:7px">`
            + `<div style="font-size:10.5px;font-weight:800;color:#c2410c;letter-spacing:.3px;margin-bottom:2px">WEEK-END</div>`
            + u.jours.map((g, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;`
                + `${i ? 'border-top:1px solid #fde3cf;' : ''}">`
                + `<span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(g.date)}</span>`
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
          tag = `<span style="font-size:10.5px;font-weight:700;color:#b91c1c;background:#fdeaea;border-radius:5px;padding:2px 7px">Férié${nm?' &middot; '+nm:''}</span>`;
        } else if (sam) {
          rowStyle = 'border:1px solid #fde3cf;background:#fffaf5;';
          tag = '<span style="font-size:10.5px;font-weight:700;color:#c2410c;background:#fff1e6;border-radius:5px;padding:2px 7px">Samedi</span>';
        }
        rowsHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;${rowStyle}border-radius:10px;margin-bottom:7px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(gg.date)}</span>${tag}</div>${badgeDe(gg.type)}</div>`;
      });
    });

    const coreHtml = gardes.length ? (summaryHtml + souhaitsHtml + rowsHtml) : (emptyHtml + souhaitsHtml);

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
            '<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155">Bonjour ' + nom + ',<br>Le planning ' + year + ' vient d\'être généré. Voici vos gardes pour l\'année — à reporter dans votre agenda.</p>' +
            coreHtml +
            '<div style="border-top:1px solid #eef1f5;margin:8px 0 18px"></div>' +
            '<div style="text-align:center"><a href="' + site + '" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px">Voir le planning complet &rarr;</a>' +
            '<p style="margin:14px 0 0;font-size:12px;color:#9aa4b2;line-height:1.5">Une erreur ou un échange à signaler ? Contactez le comité planning.</p></div>' +
          '</div>' +
          '<div style="background:#f8fafc;border-top:1px solid #eef1f5;padding:14px;text-align:center"><div style="font-size:11px;color:#9aa4b2">Le Comité Planning-Med</div></div>' +
        '</div>' +
      '</div>' +
      '</div>';

    // ---------- Texte brut (repli) ----------
    let bodyText = 'Bonjour ' + nom + ',\n\nLe planning ' + year + ' vient d\'être généré. Voici vos gardes :\n\n';
    if (souhaitsTexte) bodyText += souhaitsTexte + '\n';
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
          bodyText += '  ' + JOURS[dw] + ' ' + dd(dt.getDate()) + '/' + dd(mo+1) + ' \u2014 ' + (gg.type==='G'?'G (réa)':'G2 (mat)') + tag + '\n';
        });
      });
    }
    bodyText += '\nVoir le planning : ' + site + '\n\nLe Comité Planning-Med';

    try {
      MailApp.sendEmail({
        to: email,
        subject: `[Planning-Med ${year}] Vos gardes ${year}`,
        htmlBody: html,
        body: bodyText,
      });
      sent++;
    } catch(err) {
      errors.push(`${nom} : ${err.message}`);
    }
  }

  logAction(`envoyerRecapGardes ${year} — ${sent} emails, ${skipped} sans email, ${errors.length} erreur(s)`);
  return ContentService.createTextOutput(JSON.stringify({
    success: true, sent, skipped, errors
  })).setMimeType(ContentService.MimeType.JSON);
}

/* ── action "setIndisposYear" ── */
function _act_setIndisposYear(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
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
  _configReset_();   // CONFIG modifie : le memo doit repartir a zero
  logAction(`setIndisposYear → ${newYear}`);
  return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── action "clearIndisposYear" ── */
function _act_clearIndisposYear(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
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
    let marges = {}, margesMois = '';
    try {
      if (typeof getReleveLiberal === 'function') {
        const rel = getReleveLiberal({});                 // annee liberale par defaut
        const its = (rel && rel.items) || [];
        if (its.length) {
          const dernier = its.map(function (i) { return i.mois; }).sort().pop();
          its.forEach(function (i) {
            if (i.mois !== dernier) return;
            if (i.tCcam === null || i.pctCcam === null) return;
            // marge = T x (3 - 10p) / 7 : nulle a 30 %, negative au-dela
            marges[i.marId] = i.tCcam * (3 - 10 * (i.pctCcam / 100)) / 7;
          });
          margesMois = dernier;
        }
      }
    } catch (e) { marges = {}; margesMois = ''; }   // confort de tri : jamais bloquant
    // Non-membre du groupement : aucun chiffre. Le masquage de la tuile ne suffit
    // pas — absences.html est une page publique, seul le serveur ferme la porte.
    if (!user.liberal) { marges = {}; margesMois = ''; }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      motifs: avecMotifs,          // le frontend sait s'il peut afficher un motif
      groupement: groupement,      // id -> true : membre du groupement liberal
      marges: marges,              // id -> marge CCAM restante (euros), dernier releve
      margesMois: margesMois,      // 'AAAA-MM' du releve utilise ('' si aucun)
      role: user.role,                       // (04/08/2026, fusion absences.html) auth + donnees en UN appel
      name: user.name || '',                 //  → le login separe devient un simple journal d'arriere-plan
      moi: user.role === 'mar' ? user.id : null,
      jours: joursConsult,
      noms: noms,
      consultations: consultationsF,
      absences: absences
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return _error(err.message); }
}
