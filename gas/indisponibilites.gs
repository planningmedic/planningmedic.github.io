/* ═══════════════════════════════════════════════════════════════════════
   INDISPONIBILITES — Indisponibilités : lecture/écriture des INDISPOS_<annee>, souhaits, figeage, vacances (périodes, groupes, quotas), absences longues, fériés et ponts
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_INDISPOS_METIER = '2026-09-15.1';

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
