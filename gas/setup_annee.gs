// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_SETUP = '2026-11-27.1';   // (27/11/2026) .1 : onglet JANVIER_SUIVANT rangé avec la préparation de l'année · (26/11/2026) .3 : onglets CPA_EXPORT et CPA_SALLES (export CPA) rangés avec les onglets écrits par l'interface · .2 : onglet RELIQUATS rangé avec la préparation de l'année ; la clôture fige le reliquat de vacances de l'année (dès 2027) avant de déplacer GARDES · .1 : onglet PATIENTS_LIB (patients lib des consultations) rangé avec les onglets écrits par l'interface · (25/11/2026) .1 : onglet SALLES_TYPE (semaine type des salles) rangé avec la configuration · (19/11/2026) onglet PLANNING_NOTES (interne et infos du jour) rangé avec les onglets écrits par l'interface · (17/11/2026) onglet VERIF_PREVENUS (cases « Prévenu » des points à vérifier) rangé avec les onglets écrits par l'interface · (15/11/2026) .4 : part de gardes lue dans CIBLE quand PART EXACTE manque (statistiques 2026) ; la répétition dit aussi « aucune ligne à déplacer » · (15/11/2026) .3 lot C : la clôture emporte aussi REA1_ et FETES_ de l'année, le libéral de l'année précédente, et les lignes de l'année dans ECHANGES, TP_DEMANDES, TP_FERMES, ABSENCES_LONGUES (sans doublon à la relance) ; HISTORIQUE gagne PART EXACTE et JOURS TP · (15/11/2026) .2 : date du refus de clôture écrite en français (« lundi 4 janvier 2027 ») · (15/11/2026) clôture d'année en un seul geste (cloturerAnnee_) : contrôles bloquants (date, année suivante, case ANNEE_ACTIVE, archive, homonymes, sauvegardes), copie de sécurité du classeur, bilan, déplacement sûr (archiveMoveTabs_, LIENS_R compris), bascule relue, campagne fermée, contrôle d'après, mail ; répétition à blanc (clotureVerifier_) ; archiveYear depuis l'éditeur passe par les mêmes refus ; lanceurs d'essai retirés · (10/11/2026) rangement des onglets en 7 familles, tous les onglets annuels reconnus quelle que soit l'année


// ══════════════════════════════════════════════════════════════════════
//  RANGEMENT DES ONGLETS  (one-shot, réversible)
// ══════════════════════════════════════════════════════════════════════
// (10/11/2026) Sept familles, dans cet ordre. Chaque famille a sa couleur ;
// certains onglets, que personne n'édite à la main, sont MASQUÉS.
// Le guide du fichier maître suit exactement ce découpage.
//
// ⚠️ Masquer ne casse RIEN : getSheetByName() lit et écrit un onglet masqué
// exactement comme un onglet visible. Aucun code n'est concerné.
// Pour tout revoir : menu Affichage ▸ Feuilles masquées, ou lancer
// afficherTousLesOnglets().
//
// Un onglet absent est simplement ignoré (pas d'erreur). Un onglet inconnu
// reste visible, à la fin, et il est signalé dans le journal d'exécution.
// ⚠️ Tout NOUVEL onglet créé par le code doit être ajouté ici : le banc
// (banc_rangement_onglets.js) échoue sinon.
//
//   fixes   : onglets visibles, dans cet ordre
//   annuels : préfixes des onglets {PREFIXE}_{année} de la famille, dans
//             l'ordre voulu à l'intérieur d'une année ; années décroissantes
//   masques : onglets masqués, rangés en fin de famille
const _FAMILLES_ONGLETS = [
  { nom: 'Réglages permanents', c: '#1D4ED8',
    fixes: ['CONFIG', 'MEDECINS', 'SECTEURS', 'CS_TEMPLATE', 'SALLES_TYPE', 'SEUILS', 'ANNUAIRE', 'ETABLISSEMENT'] },
  { nom: "Préparation de l'année", c: '#60A5FA',
    fixes: ['GROUPES_VAC', 'PERIODES_VAC', 'CONFIG_CONGES', 'RELIQUATS', 'JANVIER_SUIVANT', 'CONFIG_TRANSITION'] },
  { nom: 'Années', c: '#166534',
    // ce qui entre dans l'algorithme → ce qui en sort → les affectations
    annuels: ['INDISPOS', 'REA1', 'FETES', 'GARDES', 'LIENS_R', 'STATS_GARDES', 'AFFECTATIONS'] },
  { nom: "Écrits par l'interface", c: '#C2410C',
    fixes: ['PLANNING_OVERRIDES', 'PLANNING_NOTES', 'TP_DEMANDES', 'TP_FERMES', 'ECHANGES', 'ABSENCES_LONGUES', 'VERIF_PREVENUS', 'PATIENTS_LIB', 'CPA_EXPORT', 'CPA_SALLES'] },
  { nom: 'Libéral', c: '#0D9488',
    fixes: ['SPECIALITES', 'COTATIONS_TYPE'],
    annuels: ['LIBERAL', 'LIBERAL_CA'] },
  { nom: 'Contenu du portail', c: '#7E22CE',
    fixes: ['VEILLE_CFG', 'STAFFS'],
    masques: ['VEILLE', 'VEILLE_MARQUES', 'VEILLE_ARCHIVE', 'VEILLE_ABONNES'] },
  { nom: 'Mémoires et journaux', c: '#9CA3AF',
    masques: ['HISTORIQUE', 'TRACES', 'NOEL_AN_HISTORIQUE', 'CONNEXIONS', 'LOGS',
              'NOTIFS_JOURNAL', 'STATS_HEURES', 'STATS_ACTIONS', 'STATS_SEMAINE'] },
];

// Famille d'un onglet d'après son nom : { famille, annee, rang, masque } ou null.
// Le préfixe le plus long gagne : LIBERAL_CA_2027 n'est pas un LIBERAL_.
function familleDOnglet_(nom) {
  nom = String(nom || '');
  for (let i = 0; i < _FAMILLES_ONGLETS.length; i++) {
    const f = _FAMILLES_ONGLETS[i];
    const k = (f.fixes || []).indexOf(nom);
    if (k >= 0) return { famille: f.nom, i: i, annee: 0, rang: k, masque: false };
    const m = (f.masques || []).indexOf(nom);
    if (m >= 0) return { famille: f.nom, i: i, annee: 0, rang: 100 + m, masque: true };
  }
  const r = /^([A-Z0-9_]+)_(\d{4})$/.exec(nom);
  if (!r) return null;
  for (let i = 0; i < _FAMILLES_ONGLETS.length; i++) {
    const a = _FAMILLES_ONGLETS[i].annuels || [];
    const k = a.indexOf(r[1]);
    if (k >= 0) return { famille: _FAMILLES_ONGLETS[i].nom, i: i, annee: Number(r[2]),
                         rang: 50 + k, masque: false };
  }
  return null;
}

function organiserOnglets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const toutes = ss.getSheets();

  // 1) Tout afficher d'abord : un onglet masqué ne peut pas être déplacé.
  toutes.forEach(function (sh) { try { sh.showSheet(); } catch (e) {} });

  // 2) Chaque onglet reçoit sa famille ; les inconnus restent à la fin.
  const connus = [], orphelins = [];
  toutes.forEach(function (sh) {
    const nom = sh.getName(), f = familleDOnglet_(nom);
    if (f) connus.push({ sh: sh, n: nom, f: f }); else orphelins.push(nom);
  });
  // Ordre : famille → fixes → annuels (année décroissante, puis rang) → masqués.
  connus.sort(function (a, b) {
    return (a.f.i - b.f.i)
        || ((a.f.rang >= 100) - (b.f.rang >= 100))
        || (b.f.annee - a.f.annee)
        || (a.f.rang - b.f.rang);
  });

  // 3) Déplacer, colorer, masquer.
  let pos = 0, cachés = 0;
  connus.forEach(function (x) {
    pos++;
    ss.setActiveSheet(x.sh);
    ss.moveActiveSheet(pos);
    try { x.sh.setTabColor(_FAMILLES_ONGLETS[x.f.i].c); } catch (e) {}
  });
  // Masquer en dernier, en gardant un onglet visible (Google refuse de tout masquer).
  ss.setActiveSheet(ss.getSheets()[0]);
  connus.forEach(function (x) {
    if (x.f.masque) { try { x.sh.hideSheet(); cachés++; } catch (e) {} }
  });

  Logger.log('✅ ' + connus.length + ' onglet(s) rangé(s) en ' + _FAMILLES_ONGLETS.length
           + ' familles, ' + cachés + ' masqué(s).');
  Logger.log('   Visibles : ' + (connus.length - cachés + orphelins.length));
  if (orphelins.length) Logger.log('   ⚠️ Non prévus, laissés à la fin : ' + orphelins.join(', '));
  Logger.log('   Pour tout revoir : afficherTousLesOnglets()');
  return { ranges: connus.length, caches: cachés, orphelins: orphelins };
}

// Réaffiche TOUS les onglets (annule le masquage, garde l'ordre et les couleurs).
function afficherTousLesOnglets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let n = 0;
  ss.getSheets().forEach(function (sh) {
    if (sh.isSheetHidden()) { sh.showSheet(); n++; }
  });
  Logger.log('✅ ' + n + ' onglet(s) réaffiché(s) — ' + ss.getSheets().length + ' au total.');
  return n;
}

// ═══ Détection du "concept" d'une période d'après son nom ═══
function conceptDe(s){
  s = String(s||'');
  if (/toussaint/i.test(s)) return 'toussaint';
  if (/no[eë]l/i.test(s)) return 'noel';
  if (/hiver|f[ée]vrier/i.test(s)) return 'hiver';
  if (/printemps|p[âa]ques/i.test(s)) return 'printemps';
  if (/[ée]t[ée]/i.test(s)) return 'ete';
  return null;
}
var _NOMS_VAC = { toussaint:'Toussaint', noel:'Noël', hiver:'Hiver', printemps:'Printemps', ete:'Été' };

// Calcule les périodes proposées pour `year` (API Nice/Zone B + filet). LECTURE SEULE.
function proposerVacances(year, zone) {
  zone = zone || 'Zone B';
  const out = [];
  function present(concept, anchorYear) {
    return out.some(function(p){ return conceptDe(p.nom) === concept && String(p.debut).startsWith(String(anchorYear) + '-'); });
  }
  const base = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
  [(year-1)+'-'+year, year+'-'+(year+1)].forEach(function(as) {
    const url = base + '?limit=20'
      + '&refine=' + encodeURIComponent('zones:"' + zone + '"')
      + '&refine=' + encodeURIComponent('population:"Élèves"')
      + '&refine=' + encodeURIComponent('population:"-"')
      + '&refine=' + encodeURIComponent('annee_scolaire:"' + as + '"');
    let data;
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) { Logger.log('API ' + resp.getResponseCode() + ' ' + as); return; }
      data = JSON.parse(resp.getContentText());
    } catch (e) { Logger.log('Échec API ' + as + ' : ' + e.message); return; }
    (data.results || []).forEach(function(r) {
      if (!r.start_date || !r.end_date) return;
      const concept = conceptDe(r.description || '');
      const isEte = concept === 'ete';
      const startRaw = new Date(r.start_date), endRaw = new Date(r.end_date);
      if ((endRaw - startRaw)/86400000 < 2 && !isEte) return;
      const debut = Utilities.formatDate(startRaw, 'Europe/Paris', 'yyyy-MM-dd');
      if (!debut.startsWith(String(year))) return;
      let fin;
      if (isEte) { fin = debut.slice(0,4) + '-08-31'; }
      else {
        const f = new Date(Utilities.formatDate(endRaw, 'Europe/Paris', 'yyyy-MM-dd') + 'T12:00:00');
        f.setDate(f.getDate() - 1); fin = toDateStr(f);
      }
      const anchorYear = Number(debut.slice(0,4));
      if (concept && present(concept, anchorYear)) return;
      out.push({ nom: _NOMS_VAC[concept] || (r.description || 'Vacances'), debut: debut, fin: fin, seuil: isEte ? 12 : 8, estime: false });
    });
  });
  const REPERES = [
    { concept:'hiver',     nom:'Hiver',     debut:year+'-02-08', fin:year+'-02-23',     seuil:8  },
    { concept:'printemps', nom:'Printemps', debut:year+'-04-05', fin:year+'-04-20',     seuil:8  },
    { concept:'ete',       nom:'Été',       debut:year+'-07-05', fin:year+'-08-31',     seuil:12 },
    { concept:'toussaint', nom:'Toussaint', debut:year+'-10-18', fin:year+'-11-02',     seuil:8  },
    { concept:'noel',      nom:'Noël',      debut:year+'-12-18', fin:(year+1)+'-01-04', seuil:8  }
  ];
  // (27/08/2026) Les repères ESTIMÉS épousent la forme des vraies vacances :
  // début un SAMEDI (le plus proche du repère), fin le DIMANCHE quinze jours
  // plus tard — sauf l'été, dont la fin reste forcée au 31/08. Sans cela, un
  // repère à date fixe tombait un jour différent chaque année (mardi en 2028)
  // et cassait la convention samedi→dimanche que suivent les périodes de l'API.
  function _samediProche_(ds){
    const d = new Date(ds + 'T12:00:00');
    const av = (d.getDay() + 1) % 7;          // jours en arrière jusqu'au samedi
    const ap = (6 - d.getDay() + 7) % 7;      // jours en avant jusqu'au samedi
    d.setDate(d.getDate() + (ap < av ? ap : -av));
    return toDateStr(d);
  }
  // Noël : samedi SUIVANT ou égal — jamais en arrière, pour que la quinzaine
  // morde toujours sur début janvier, comme les vraies (18/12 en 2027, 23/12 en 2028).
  function _samediApres_(ds){
    const d = new Date(ds + 'T12:00:00');
    d.setDate(d.getDate() + (6 - d.getDay() + 7) % 7);
    return toDateStr(d);
  }
  REPERES.forEach(function(p){
    if (present(p.concept, year)) return;
    const debut = p.concept === 'noel' ? _samediApres_(p.debut) : _samediProche_(p.debut);
    let fin;
    if (p.concept === 'ete') { fin = p.fin; }
    else { const f = new Date(debut + 'T12:00:00'); f.setDate(f.getDate() + 15); fin = toDateStr(f); }
    out.push({ nom:p.nom, debut:debut, fin:fin, seuil:p.seuil, estime:true });
  });
  out.sort(function(a,b){ return a.debut < b.debut ? -1 : 1; });
  return out;
}

// Écrit dans PERIODES_VAC les périodes de `year` absentes (non destructif). Sans popup.
function importerVacancesScolaires_core(year, zone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PERIODES_VAC');
  if (!sheet) { sheet = ss.insertSheet('PERIODES_VAC'); sheet.getRange(1,1,1,4).setValues([['NOM','DEBUT','FIN','SEUIL']]).setFontWeight('bold'); }
  const existing = sheet.getDataRange().getValues().slice(1).map(function(r){
    const d = r[1] instanceof Date ? toDateStr(r[1]) : String(r[1]).trim();
    return { concept: conceptDe(r[0]), debut: d };
  }).filter(function(x){ return x.debut; });
  const propose = proposerVacances(year, zone);
  const ajout = []; const estimes = [];
  propose.forEach(function(p){
    const concept = conceptDe(p.nom);
    const anchorYear = Number(String(p.debut).slice(0,4));
    const dejaLa = existing.some(function(x){ return x.concept === concept && String(x.debut).startsWith(anchorYear + '-'); })
                || ajout.some(function(a){ return conceptDe(a[0]) === concept && String(a[1]).startsWith(anchorYear + '-'); });
    if (dejaLa) return;
    ajout.push([p.nom, p.debut, p.fin, p.seuil]);
    if (p.estime) estimes.push(p.nom);
  });
  if (ajout.length) {
    ajout.sort(function(a,b){ return a[1] < b[1] ? -1 : 1; });
    sheet.getRange(sheet.getLastRow()+1, 1, ajout.length, 4).setValues(ajout);
  }
  return { ajoutes: ajout.length, estimes: estimes };
}

// Lanceur manuel (popup), pour l'éditeur
function importerVacancesScolaires(year, zone) {
  const res = importerVacancesScolaires_core(year, zone);
  let msg = res.ajoutes ? ('✅ ' + res.ajoutes + ' période(s) ajoutée(s) pour ' + year + '.') : 'ℹ️ Rien à ajouter (tout est déjà présent).';
  if (res.estimes.length) msg += '\n\nDates estimées (à caler) : ' + res.estimes.join(', ') + '.';
  SpreadsheetApp.getUi().alert(msg);
}
function IMPORT_vac() { importerVacancesScolaires(2027); }
// ── SETUP ANNÉE ────────────────────────────────────────────────────────
function setupAnnee(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  year = year || 2027;

  const medSheetSetup = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
  const DOCTORS_LIST = [];
  if (medSheetSetup) {
    const medDataSetup = _medecinsRows_();
    for (let r = 1; r < medDataSetup.length; r++) {
      const id = String(medDataSetup[r][COL_MED.ID]).trim();
      const actif = String(medDataSetup[r][COL_MED.ACTIF]).trim().toUpperCase() === 'O';
      if (id && actif) DOCTORS_LIST.push(id);
    }
  }

  // Générer tous les jours de l'année planning (premier lundi jan → veille premier lundi jan N+1)
  const jan1 = new Date(year, 0, 1);
  const dow1 = jan1.getDay();
  const offsetJ1 = dow1 === 1 ? 7 : dow1 === 0 ? 1 : 8 - dow1;
  const startDate = new Date(year, 0, 1 + offsetJ1, 12, 0, 0);

  const jan1Next = new Date(year + 1, 0, 1);
  const dow1Next = jan1Next.getDay();
  const offsetNext = dow1Next === 1 ? 7 : dow1Next === 0 ? 1 : 8 - dow1Next;
  const endDate = new Date(year + 1, 0, offsetNext); // veille du premier lundi N+1

  const allDays = [];
  const dt = new Date(startDate);
  while (dt <= endDate) {
    allDays.push({
      date: `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`,
      day: dt.getDate(),
      month: dt.getMonth(),
      dow: dt.getDay(),
      isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
    });
    dt.setDate(dt.getDate() + 1);
  }

  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const DAYS_INIT = ['D','L','M','M','J','V','S'];
  const RED = '#CE1126';
  const WHITE = '#FFFFFF';
  const GREY_WE = '#CFD8DC';
  const BLANC = '#FFFFFF';

  // ── 1. INDISPOS_YYYY ────────────────────────────────────────────────
  const indisposName = `INDISPOS_${year}`;
  let indSheet = ss.getSheetByName(indisposName);
  if (indSheet) {
    // Garde-fou : ne JAMAIS écraser des indispos déjà saisies sans confirmation.
    const last = indSheet.getLastRow(), lastC = indSheet.getLastColumn();
    let saisies = 0;
    if (last >= 4 && lastC >= 2) {
      const vals = indSheet.getRange(4, 2, last - 3, lastC - 1).getValues();
      saisies = vals.reduce((n, row) => n + row.filter(c => String(c).trim()).length, 0);
    }
    if (saisies > 0) {
      const ui = SpreadsheetApp.getUi();
      const rep = ui.alert(`⚠️ ${indisposName} contient déjà ${saisies} saisie(s)`,
        `Relancer W1 va TOUT effacer et recréer une grille vide.\n\nContinuer quand même ?`,
        ui.ButtonSet.YES_NO);
      if (rep !== ui.Button.YES) { ui.alert('Annulé — la grille existante est conservée.'); return; }
    }
    ss.deleteSheet(indSheet);
  }
  indSheet = ss.insertSheet(indisposName);
  indSheet.setFrozenRows(3);

  const nCols = allDays.length + 1;

  // Ligne 1 : mois fusionnés
  const row1 = ['MÉDECIN']; allDays.forEach(() => row1.push(''));
  indSheet.getRange(1, 1, 1, nCols).setValues([row1]);
  indSheet.getRange(1, 1).setFontWeight('bold').setBackground(RED).setFontColor(WHITE);

  let mStart = 2, prevMonth = allDays[0].month;
  allDays.forEach((day, i) => {
    const col = i + 2, isLast = i === allDays.length - 1;
    if (day.month !== prevMonth || isLast) {
      const mEnd = (day.month !== prevMonth) ? col - 1 : col;
      if (mEnd >= mStart) indSheet.getRange(1, mStart, 1, mEnd - mStart + 1).merge();
      indSheet.getRange(1, mStart).setValue(`${MONTHS_FR[prevMonth]} ${prevMonth < allDays[0].month || mStart === 2 ? year : year + 1}`)
        .setBackground(RED).setFontColor(WHITE).setFontWeight('bold').setHorizontalAlignment('center');
      mStart = col; prevMonth = day.month;
    }
  });

  // Ligne 2 : initiales jours
  const row2 = ['JOUR']; allDays.forEach(d => row2.push(DAYS_INIT[d.dow]));
  indSheet.getRange(2, 1, 1, nCols).setValues([row2]);
  indSheet.getRange(2, 1).setFontWeight('bold').setBackground(RED).setFontColor(WHITE);

  // Ligne 3 : numéros jours
  const row3 = ['N°']; allDays.forEach(d => row3.push(d.day));
  indSheet.getRange(3, 1, 1, nCols).setValues([row3]);
  indSheet.getRange(3, 1).setFontWeight('bold').setBackground(RED).setFontColor(WHITE);

  // Données MAR
  const medRows = DOCTORS_LIST.map(id => [id, ...Array(allDays.length).fill('')]);
  indSheet.getRange(4, 1, medRows.length, nCols).setValues(medRows);

  // Weekends en gris + bordures mensuelles
  const jfSetup = getJoursFeries(year);
  const jfSetupNext = getJoursFeries(year + 1);
  allDays.forEach((day, i) => {
    const col = i + 2;
    const isWE = day.dow === 0 || day.dow === 6;
    const isFerie = jfSetup.has(day.date) || jfSetupNext.has(day.date);
    if (isWE || isFerie) indSheet.getRange(1, col, 3 + medRows.length, 1).setBackground(GREY_WE);
    const nextDay = allDays[i + 1];
    if (!nextDay || nextDay.month !== day.month) {
      indSheet.getRange(1, col, 3 + medRows.length, 1)
        .setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  });

  indSheet.setColumnWidth(1, 120);
  for (let c = 2; c <= nCols; c++) indSheet.setColumnWidth(c, 35);
  indSheet.getRange(1, 2, 3 + medRows.length, nCols - 1).setHorizontalAlignment('center');
  Logger.log(`✅ ${indisposName} créé (${allDays.length} jours)`);

  // ── 2. AFFECTATIONS_YYYY ────────────────────────────────────────────
  const affName = `AFFECTATIONS_${year}`;
  let affSheet = ss.getSheetByName(affName);
  if (affSheet) ss.deleteSheet(affSheet);
  affSheet = ss.insertSheet(affName);

  const MONTHS_SHORT = ['JAN','FEV','MARS','AVRIL','MAI','JUIN',
                        'JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  const affHeaders = ['MÉDECIN', ...MONTHS_SHORT.map(m => `${m} ${year}`)];
  affSheet.getRange(1, 1, 1, affHeaders.length).setValues([affHeaders]);
  affSheet.getRange(1, 1, 1, affHeaders.length)
    .setFontWeight('bold').setBackground(RED).setFontColor(WHITE).setHorizontalAlignment('center');
  affSheet.setColumnWidth(1, 140);
  for (let c = 2; c <= affHeaders.length; c++) affSheet.setColumnWidth(c, 90);
  affSheet.setFrozenRows(1);
  affSheet.setFrozenColumns(1);

  const affRows = DOCTORS_LIST.map(id => [id, ...Array(12).fill('VOLANT')]);
  affSheet.getRange(2, 1, affRows.length, affHeaders.length).setValues(affRows);
  affSheet.getRange(2, 2, affRows.length, 12).setFontColor('#64748B').setHorizontalAlignment('center');
  Logger.log(`✅ ${affName} créé`);

  // ── 3. CONFIG ────────────────────────────────────────────────────────
  let configSheet = ss.getSheetByName('CONFIG');
  if (!configSheet) {
    configSheet = ss.insertSheet('CONFIG');
    configSheet.getRange(1,1,1,2).setValues([['PARAMETRE','VALEUR']]);
    configSheet.getRange(1,1,1,2).setFontWeight('bold').setBackground(RED).setFontColor(WHITE);
    configSheet.getRange(2,1,1,2).setValues([['ANNEE_ACTIVE', year]]);
    configSheet.setColumnWidth(1, 180);
    configSheet.setColumnWidth(2, 120);
  } else {
    const configData = configSheet.getDataRange().getValues();
    let found = false;
    for (let r = 1; r < configData.length; r++) {
      if (configData[r][0] === 'ANNEE_ACTIVE') {
        configSheet.getRange(r+1, 2).setValue(year);
        found = true; break;
      }
    }
    if (!found) configSheet.appendRow(['ANNEE_ACTIVE', year]);
  }
  Logger.log(`✅ CONFIG : ANNEE_ACTIVE = ${year}`);

  // ── 4. PERIODES_VAC : import (proposition) des vacances scolaires ──
  const _vac = importerVacancesScolaires_core(year);
  let _vacMsg = `• PERIODES_VAC : ${_vac.ajoutes} période(s) ajoutée(s)`;
  if (_vac.estimes.length) _vacMsg += ` (à caler : ${_vac.estimes.join(', ')})`;
  _vacMsg += `\n`;

  SpreadsheetApp.getUi().alert(
    `✅ Setup ${year} terminé !\n\n` +
    `• ${indisposName} créé (${allDays.length} jours)\n` +
    `• ${affName} créé (à remplir)\n` +
    `• CONFIG : ANNEE_ACTIVE = ${year}\n` +
    _vacMsg + `\n` +
    `Prochaines étapes :\n` +
    `1. Vérifier/ajuster PERIODES_VAC (dates de vacances)\n` +
    `2. Remplir ${affName} avec les secteurs des MAR\n` +
    `3. Les MAR saisissent leurs indispos sur indispos.html\n` +
    `4. Lancer generateGardes()`
  );
}

// ── BILAN DE L'ANNÉE N (étape de la clôture) ───────────────────────────
/* (15/11/2026, lot A de la clôture) Ce qui était le corps de archiveYear :
   HISTORIQUE (gardes réellement faites), sauvegardes JSON sur Drive, purge des
   retouches quotidiennes. Le DÉPLACEMENT des onglets n'est plus ici : il passe
   par archiveMoveTabs_ (copie, vérification, puis suppression — sans jamais
   effacer un onglet déjà présent dans l'archive). N'est appelé que par
   cloturerAnnee_, qui a fait tous les contrôles avant. */
function _clotureBilan_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = [];

  // Archivage local : les JSON nominatifs (stats, indispos) sont rangés dans le
  // dossier Drive Planning-Med-JSON (jamais sur GitHub — dépôt public).
  function saveArchiveToDrive(fileName, content){
    try { savePlanningToDrive(fileName, content); return true; }
    catch(e){ Logger.log(`❌ Drive ${fileName}: ${e.message}`); return false; }
  }

  // ── 1. STATS_GARDES_N → HISTORIQUE (append idempotent) + sauvegarde JSON ──
  const st = ss.getSheetByName(`STATS_GARDES_${year}`);
  if (!st) {
    results.push(`❌ STATS_GARDES_${year} introuvable — archivage interrompu`);
  } else {
    const d = st.getDataRange().getValues();
    const Hd = d[0].map(x=>String(x).trim());
    const get = (r,n)=>{ const i=Hd.indexOf(n); return i<0?'':d[r][i]; };
    const num = (r,n)=>Number(get(r,n))||0;

    // a) Alimenter HISTORIQUE (créé si absent)
    let h = ss.getSheetByName('HISTORIQUE');
    if (!h) { h = ss.insertSheet('HISTORIQUE');
      h.getRange(1,1,1,18).setValues([['ID','ANNEE','TOTAL','G','G2','LUN','MAR','MER','JEU','VEN','SAM','DIM','VD','VEILLE JF','JF','NOEL/AN','RECUP R','18H']]).setFontWeight('bold');
      h.setFrozenRows(1); h.setColumnWidth(1,140); }
    /* (15/11/2026, lot C) Deux colonnes de plus, figées à la clôture : ce que
       l'année a VÉCU, jamais la quotité de MEDECINS (une seule valeur, sans
       date — recopiée au 4 janvier, elle serait fausse pour un changement en
       cours d'année ou déjà saisi pour l'année suivante).
         PART EXACTE : la part de gardes utilisée pour générer l'année (STATS).
         JOURS TP    : les jours de temps partiel accordés, comptés dans la grille
                       (les jours fixes de MEDECINS ne sont pas dans la grille). */
    if (String(h.getRange(1, 19).getValue()).trim() !== 'PART EXACTE')
      h.getRange(1, 19, 1, 2).setValues([['PART EXACTE', 'JOURS TP']]).setFontWeight('bold');
    const partDe = {};
    /* PART EXACTE n'existe que depuis le générateur de novembre 2026 : les
       statistiques 2026 n'ont que CIBLE (vu en production le 15/11/2026). */
    const colPart = Hd.indexOf('PART EXACTE') > -1 ? 'PART EXACTE' : 'CIBLE';
    for (let r = 1; r < d.length; r++) { const pid = String(d[r][0]).trim(); if (pid) partDe[pid] = num(r, colPart); }
    const hd = h.getDataRange().getValues();
    const seen = new Set();
    for (let r=1;r<hd.length;r++){ const id=String(hd[r][0]).trim(); if(id) seen.add(`${id}|${hd[r][1]}`); }

    // NOEL/AN "réel" : lu dans GARDES_{year} (échanges/dons inclus), pas dans le
    // snapshot STATS figé à la génération. Choix assumé : la rotation Noël/An doit
    // refléter qui a RÉELLEMENT passé Noël / le Jour de l'an de garde (décision 07/2026).
    // La dette, elle, reste calculée sur le snapshot (planning tel que généré).
    // Repli : si GARDES_{year} est absent, on retombe sur la colonne NOEL/AN des stats.
    let noelReel = null;
    const tpDe = {};
    const gSheet = ss.getSheetByName(`GARDES_${year}`);
    if (gSheet) {
      const gd = gSheet.getDataRange().getValues();
      const d2c = buildDateToCol(gd, year);
      const noelCols = [`${year}-12-24`, `${year}-12-25`, `${year}-12-31`, `${year + 1}-01-01`]
        .map(dt => d2c[dt]).filter(c => c != null);
      for (let r = 3; r < gd.length; r++) {
        const tid = String(gd[r][0]).trim(); if (!tid) continue;
        tpDe[tid] = gd[r].slice(1).filter(v => String(v || '').trim().toUpperCase() === 'TP').length;
      }
      if (noelCols.length) {
        noelReel = new Set();
        for (let r = 3; r < gd.length; r++) {
          const gid = String(gd[r][0]).trim(); if (!gid) continue;
          const did = noelCols.some(col => {
            const v = String(gd[r][Number(col)] || '').trim().toUpperCase();
            return v === 'G' || v === 'G2';
          });
          if (did) noelReel.add(gid);
        }
      }
    }

    /* (03/08/2026) HISTORIQUE reflete desormais les gardes REELLEMENT faites — récit : docs/JOURNAL-Planning-Med.md §153 */
    let live = null;
    try { if (gSheet) live = computeStatsLive(year); }
    catch (e) { results.push(`⚠️ Recomptage des gardes ${year} impossible (${e.message}) — HISTORIQUE alimenté depuis STATS`); }

    const hrows=[];
    if (live && live.length) {
      live.forEach(x => {
        const id = String(x.medecin).trim(); if (!id) return;
        if (seen.has(`${id}|${year}`)) return;
        const noelAn = noelReel ? (noelReel.has(id) ? 1 : 0) : 0;
        hrows.push([id, year, x.total, x.g, x.g2,
          x.lun, x.mar, x.mer, x.jeu, x.ven, x.sat, x.dim,
          x.vd, x.vjf, x.jf, noelAn, x.recupR, x.h18, partDe[id] || 0, tpDe[id] || 0]);
      });
    } else {
      for (let r=1;r<d.length;r++){
        const id=String(d[r][0]).trim(); if(!id) continue;
        if (seen.has(`${id}|${year}`)) continue;
        const noelAn = noelReel ? (noelReel.has(id) ? 1 : 0) : num(r,'NOEL/AN');
        hrows.push([id,year, num(r,'TOTAL G'),num(r,'G (REA)'),num(r,'G2 (MAT)'),
          num(r,'LUN'),num(r,'MAR'),num(r,'MER'),num(r,'JEU'),num(r,'VEN'),num(r,'SAM'),num(r,'DIM'),
          num(r,'VD'),num(r,'VEILLE JF'),num(r,'JF'),noelAn,num(r,'RECUP R'),num(r,'18H'),partDe[id] || 0,tpDe[id] || 0]);
      }
    }
    if (hrows.length){ h.getRange(h.getLastRow()+1,1,hrows.length,20).setValues(hrows);
      results.push(`✅ HISTORIQUE : ${hrows.length} ligne(s) ${year} ajoutée(s)${live && live.length ? ' (gardes réellement faites)' : ' (snapshot STATS — repli)'}`); }
    else results.push(`ℹ️ HISTORIQUE : ${year} déjà présent`);

    // b) Sauvegarde JSON (rangée dans archives/)
    const statsObj = d.slice(1).filter(row=>String(row[0]).trim()).map(row=>{ const o={}; Hd.forEach((hn,i)=>o[hn]=row[i]); return o; });
    const ok1 = saveArchiveToDrive(`archives_stats_${year}.json`, JSON.stringify({year, stats:statsObj}, null, 2));
    results.push(ok1?`✅ archives_stats_${year}.json → Drive`:`❌ archivage stats échoué`);

    /* (03/08/2026) Sauvegarde de la GRILLE elle-meme. Seuls les stats et les indispos
       partaient sur Drive : le detail jour par jour n'existait qu'en un exemplaire,
       dans le classeur d'archives. Une copie de plus ne coute rien et c'est la seule
       chose qu'on ne saurait pas reconstituer. */
    if (gSheet) {
      try {
        const gdA = gSheet.getDataRange().getValues();
        const d2cA = buildDateToCol(gdA, year);
        const grille = {};
        Object.keys(d2cA).forEach(dt => {
          const col = Number(d2cA[dt]);
          for (let r = 3; r < gdA.length; r++) {
            const gid = String(gdA[r][0]).trim(); if (!gid) continue;
            const v = String(gdA[r][col] || '').trim();
            if (!v) continue;
            if (!grille[dt]) grille[dt] = {};
            grille[dt][gid] = v;
          }
        });
        const ok3 = saveArchiveToDrive(`archives_gardes_${year}.json`, JSON.stringify({year, gardes:grille}, null, 2));
        results.push(ok3?`✅ archives_gardes_${year}.json → Drive`:`❌ archivage de la grille échoué`);
      } catch (e) { results.push(`⚠️ archives_gardes_${year}.json non créé (${e.message})`); }
    } else results.push(`⚠️ GARDES_${year} introuvable — grille non sauvegardée`);
  }

  // ── 2. INDISPOS_N → sauvegarde JSON ──
  const ind = ss.getSheetByName(`INDISPOS_${year}`);
  if (ind) {
    const idd = ind.getDataRange().getValues();
    const dates = reconstruireDatesHeaders(idd, year);
    const indispos={};
    for (let r=3;r<idd.length;r++){ const id=String(idd[r][0]).trim(); if(!id) continue; indispos[id]={};
      dates.forEach((dt,i)=>{ if(!dt) return; const v=String(idd[r][i+1]||'').trim(); if(v) indispos[id][dt]=v; }); }
    const ok2 = saveArchiveToDrive(`archives_indispos_${year}.json`, JSON.stringify({year, indispos}, null, 2));
    results.push(ok2?`✅ archives_indispos_${year}.json → Drive`:`❌ archivage indispos échoué`);
  } else results.push(`⚠️ INDISPOS_${year} introuvable — ignoré`);

  const archiveOk = results.every(r=>!r.startsWith('❌'));

  // ── 4. Écrémage : purger PLANNING_OVERRIDES des dates de l'année archivée ──
  // Ces retouches quotidiennes ne servent plus une fois l'année close (elles ne sont
  // relues que pour leurs propres dates). On retire l'année ${year} ET les antérieures
  // (auto-nettoyant même si une clôture passée a été manquée). Lignes futures conservées.
  // Réécriture en un bloc (pas de deleteRow en boucle). Gardé sur archiveOk par prudence.
  if (archiveOk) {
    try {
      const po = ss.getSheetByName('PLANNING_OVERRIDES');
      if (po && po.getLastRow() > 1) {
        const pd = po.getDataRange().getValues();
        const width = pd[0].length;
        const yrOf = raw => {
          if (raw instanceof Date) return raw.getFullYear();
          const m = String(raw || '').trim().match(/^(\d{4})-/);
          return m ? Number(m[1]) : null;
        };
        const keep = pd.slice(1).filter(row => { const y = yrOf(row[0]); return y === null || y > year; });
        const removed = (pd.length - 1) - keep.length;
        if (removed > 0) {
          po.getRange(2, 1, pd.length - 1, width).clearContent();
          if (keep.length) po.getRange(2, 1, keep.length, width).setValues(keep);
          results.push(`🧹 PLANNING_OVERRIDES : ${removed} ligne(s) ≤ ${year} purgée(s)`);
        } else {
          results.push(`ℹ️ PLANNING_OVERRIDES : aucune ligne ≤ ${year} à purger`);
        }
      }
    } catch (e) { results.push(`⚠️ Purge PLANNING_OVERRIDES échouée : ${e.message}`); }
  }

  const rapport = results.join('\n');
  Logger.log(`\n── Bilan ${year} ──\n${rapport}`);
  return rapport;
}
// ── AMORÇAGE (une fois) : crée HISTORIQUE et le remplit avec l'existant ──
function creerHistorique() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName('HISTORIQUE');
  if (!h) { h = ss.insertSheet('HISTORIQUE');
    h.getRange(1,1,1,18).setValues([['ID','ANNEE','TOTAL','G','G2','LUN','MAR','MER','JEU','VEN','SAM','DIM','VD','VEILLE JF','JF','NOEL/AN','RECUP R','18H']]).setFontWeight('bold');
    h.setFrozenRows(1); h.setColumnWidth(1,140); }
  const hd = h.getDataRange().getValues();
  const seen = new Set();
  for (let r=1;r<hd.length;r++){ const id=String(hd[r][0]).trim(); if(id) seen.add(`${id}|${hd[r][1]}`); }
  const rows=[];

  // 1) Lignes complètes depuis chaque STATS_GARDES_YYYY présent
  ss.getSheets().forEach(sh=>{
    const m = sh.getName().match(/^STATS_GARDES_(\d{4})$/); if(!m) return;
    const year=Number(m[1]);
    const d=sh.getDataRange().getValues(); const Hd=d[0].map(x=>String(x).trim());
    const num=(r,n)=>{ const i=Hd.indexOf(n); return i<0?0:(Number(d[r][i])||0); };
    for(let r=1;r<d.length;r++){ const id=String(d[r][0]).trim(); if(!id||seen.has(`${id}|${year}`)) continue;
      rows.push([id,year,num(r,'TOTAL G'),num(r,'G (REA)'),num(r,'G2 (MAT)'),
        num(r,'LUN'),num(r,'MAR'),num(r,'MER'),num(r,'JEU'),num(r,'VEN'),num(r,'SAM'),num(r,'DIM'),
        num(r,'VD'),num(r,'VEILLE JF'),num(r,'JF'),num(r,'NOEL/AN'),num(r,'RECUP R'),num(r,'18H')]);
      seen.add(`${id}|${year}`); }
  });

  // 2) Mémoire Noël/An antérieure (NOEL_AN_HISTORIQUE) : lignes minimales NOEL/AN=1
  //    pour les années sans STATS (ex. 2023-2025). Les autres colonnes restent vides.
  const nh = ss.getSheetByName('NOEL_AN_HISTORIQUE');
  if (nh){ const nd=nh.getDataRange().getValues();
    for(let r=1;r<nd.length;r++){ const id=String(nd[r][0]).trim(); const y=Number(nd[r][1])||0;
      if(!id||!y||seen.has(`${id}|${y}`)) continue;
      rows.push([id,y,'','','','','','','','','','','','','',1,'','']); seen.add(`${id}|${y}`); }
  }

  if(rows.length) h.getRange(h.getLastRow()+1,1,rows.length,18).setValues(rows);
  try{ SpreadsheetApp.getUi().alert(`✅ HISTORIQUE amorcé : ${rows.length} ligne(s) ajoutée(s).`); }catch(e){}
  return `${rows.length} lignes`;
}

/* ═══════════════════════════════════════════════════════════════════════
   CLÔTURE D'ANNÉE EN UN SEUL GESTE (15/11/2026, lot A)
   ═══════════════════════════════════════════════════════════════════════
   Avant : la page admin enchaînait trois appels (archiveYear, setActiveYear,
   clearIndisposYear). Une coupure entre le 1er et le 2e laissait les onglets
   de l'année partis et la case ANNEE_ACTIVE sur l'ancienne année. Les
   garde-fous (date, année suivante prête) ne vivaient que dans l'action du
   portail : archiveYear lancée depuis l'éditeur n'en avait aucun. Le
   déplacement effaçait un éventuel homonyme de l'archive sans vérifier sa
   copie. setActiveYear répondait « succès » même sans rien écrire.
   Maintenant : UNE fonction, cloturerAnnee_(year), appelée par le portail
   (actions cloturerAnnee et archiveYear) ET par archiveYear(year) depuis
   l'éditeur :
     contrôles bloquants → copie de sécurité du classeur → bilan (HISTORIQUE,
     sauvegardes Drive, retouches effacées) → déplacement sûr des onglets →
     bascule de l'année, relue → fermeture de la campagne → contrôle d'après.
   Chaque étape reconnaît qu'elle est déjà faite : relancer reprend là où ça
   s'est arrêté. clotureVerifier_(year) fait les contrôles et le bilan SANS
   RIEN ÉCRIRE (répétition à blanc). */

function _clotureMaintenant_() { return new Date(); }   // seul point de lecture de l'heure : le banc le fige

/* Ce que la clôture de `year` emporte. Les cinq premiers passent par
   archiveMoveTabs_ (générateur) ; les autres par _clotureDeplacer_ (même règle :
   copie, vérification, puis suppression).
   (15/11/2026, lot C — le classeur maître ne garde que l'année en cours et la
   suivante) : + REA1_ et FETES_ de l'année (entrées de sa génération, relues
   seulement pour elle) ; + le libéral de l'année PRÉCÉDENTE, qui suit l'année
   civile et dont le relevé de décembre se saisit après le 1er janvier. */
function _clotureOngletsMoteur_(year) {
  return ['GARDES_' + year, 'INDISPOS_' + year, 'AFFECTATIONS_' + year, 'STATS_GARDES_' + year, 'LIENS_R_' + year];
}
function _clotureOngletsEnPlus_(year) {
  return ['REA1_' + year, 'FETES_' + year, 'LIBERAL_' + (year - 1), 'LIBERAL_CA_' + (year - 1)];
}
function _clotureOnglets_(year) {
  return _clotureOngletsMoteur_(year).concat(_clotureOngletsEnPlus_(year));
}

/* Déplace UN onglet : copie dans l'archive, vérifie (lignes et colonnes), puis
   supprime l'original. Un homonyme dans l'archive n'est jamais écrasé (les
   contrôles d'ouverture l'ont refusé avant). */
function _clotureDeplacer_(ss, arch, nom) {
  const sh = ss.getSheetByName(nom);
  if (!sh) return '⏭️ ' + nom + ' absent';
  if (arch.getSheetByName(nom)) return '⚠️ ' + nom + ' déjà dans l\'archive — rien écrasé';
  const copie = sh.copyTo(arch);
  copie.setName(nom);
  if (copie.getLastRow() !== sh.getLastRow() || copie.getLastColumn() !== sh.getLastColumn())
    return '⚠️ ' + nom + ' : copie incohérente, original gardé';
  ss.deleteSheet(sh);
  return '✓ ' + nom + ' déplacé';
}

/* (15/11/2026, lot C) LES LIGNES DE L'ANNÉE dans les onglets qui mélangent les
   années. Chaque ligne qui part est d'abord ajoutée à l'onglet du même nom dans
   l'archive (créé avec l'en-tête au besoin), puis le classeur maître est réécrit
   en un bloc sans elle. Une ligne déjà présente à l'identique dans l'archive
   n'est pas ajoutée deux fois : une relance après coupure ne double rien.
     ECHANGES           ANNEE = year, sauf une demande encore « attente »
     TP_DEMANDES, TP_FERMES   ANNEE ≤ year
     ABSENCES_LONGUES   DATE_FIN avant le premier lundi de year+1 (une absence à
                        cheval sur deux années reste). */
function _clotureLignesRegles_(year) {
  const pj = getPremierJourPlanning(year + 1);
  const debut = new Date(pj.getFullYear(), pj.getMonth(), pj.getDate());
  const jour = v => {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  return [
    { onglet: 'ECHANGES', texte: true, part: (r, c) => Number(r[c.ANNEE]) === year && String(r[c.ETAT]).trim() !== 'attente', cols: ['ANNEE', 'ETAT'] },
    { onglet: 'TP_DEMANDES', part: (r, c) => Number(r[c.ANNEE]) > 0 && Number(r[c.ANNEE]) <= year, cols: ['ANNEE'] },
    { onglet: 'TP_FERMES', part: (r, c) => Number(r[c.ANNEE]) > 0 && Number(r[c.ANNEE]) <= year, cols: ['ANNEE'] },
    { onglet: 'ABSENCES_LONGUES', part: (r, c) => { const f = jour(r[c.DATE_FIN]); return !!f && f < debut; }, cols: ['DATE_FIN'] },
  ];
}
function _clotureLignes_(ss, arch, year, aBlanc) {
  const out = [];
  _clotureLignesRegles_(year).forEach(function (regle) {
    const sh = ss.getSheetByName(regle.onglet);
    if (!sh || sh.getLastRow() < 2) { out.push({ onglet: regle.onglet, n: 0, note: 'vide' }); return; }
    const data = sh.getDataRange().getValues();
    const ent = data[0].map(x => String(x).trim());
    const c = {};
    const manque = regle.cols.filter(function (k) { c[k] = ent.indexOf(k); return c[k] < 0; });
    if (manque.length) { out.push({ onglet: regle.onglet, n: 0, note: 'colonne ' + manque.join(', ') + ' absente — rien déplacé' }); return; }
    const partent = [], restent = [];
    for (let r = 1; r < data.length; r++) {
      if (!data[r].some(v => String(v).trim() !== '')) continue;
      (regle.part(data[r], c) ? partent : restent).push(data[r]);
    }
    if (aBlanc || !partent.length) { out.push({ onglet: regle.onglet, n: partent.length, note: aBlanc ? 'à déplacer' : 'rien à déplacer' }); return; }
    // 1. Ajout dans l'archive (sans doublon)
    let a = arch.getSheetByName(regle.onglet);
    if (!a) {
      a = arch.insertSheet(regle.onglet);
      if (regle.texte) { try { a.getRange(1, 1, Math.max(a.getMaxRows(), partent.length + 1), ent.length).setNumberFormat('@'); } catch (e) {} }
      a.getRange(1, 1, 1, ent.length).setValues([data[0]]);
    }
    /* Une même date peut revenir en date ou en texte (« 2026-06-01 ») selon le
       format de la cellule : la comparaison se fait sur le jour écrit, sinon une
       relance doublerait la ligne (vu au banc, 15/11/2026). */
    const p2 = n => String(n).padStart(2, '0');
    const norme = v => {
      if (v instanceof Date) {
        const j = `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
        return (v.getHours() || v.getMinutes() || v.getSeconds()) ? j + 'T' + p2(v.getHours()) + ':' + p2(v.getMinutes()) : j;
      }
      return String(v).trim();
    };
    const cle = row => JSON.stringify(row.slice(0, ent.length).map(norme));
    const deja = new Set();
    if (a.getLastRow() > 1) a.getRange(2, 1, a.getLastRow() - 1, ent.length).getValues().forEach(row => deja.add(cle(row)));
    const nouvelles = partent.filter(row => !deja.has(cle(row))).map(row => row.slice(0, ent.length));
    const avant = a.getLastRow();
    if (nouvelles.length) a.getRange(avant + 1, 1, nouvelles.length, ent.length).setValues(nouvelles);
    if (a.getLastRow() !== avant + nouvelles.length) throw new Error(regle.onglet + ' : l\'archive n\'a pas reçu toutes les lignes');
    // 2. Réécriture du maître sans elles, en un bloc
    sh.getRange(2, 1, data.length - 1, ent.length).clearContent();
    if (restent.length) sh.getRange(2, 1, restent.length, ent.length).setValues(restent.map(row => row.slice(0, ent.length)));
    out.push({ onglet: regle.onglet, n: partent.length, note: 'déplacée(s)' });
  });
  return out;
}

/* '' si la clôture est permise à cette date, sinon le refus complet. L'année de
   planning commence le PREMIER LUNDI (getPremierJourPlanning), jamais le 1er
   janvier : 2026 court jusqu'au dimanche 03/01/2027. */
/* (15/11/2026) DÈS MINUIT : getPremierJourPlanning rend ce lundi À MIDI. Comparé
   tel quel à l'heure courante, il refusait la clôture tout le lundi matin — le
   moment prévu pour la faire. L'écran avait été corrigé du même défaut le
   17/08/2026 (_premierLundiISO), le serveur non ; l'ancien test vérifiait à 13 h. */
function _clotureRefusDate_(year) {
  const next = Number(year) + 1;
  const pj = getPremierJourPlanning(next);
  const debut = new Date(pj.getFullYear(), pj.getMonth(), pj.getDate(), 0, 0, 0);
  const now = _clotureMaintenant_();
  if (now >= debut) return '';
  /* (15/11/2026) En français, à la main : Utilities.formatDate écrit en anglais
     (« Monday 4 January 2027 », vu en production sur la répétition à blanc). */
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const txt = `${JOURS[debut.getDay()]} ${debut.getDate()} ${MOIS[debut.getMonth()]} ${debut.getFullYear()}`;
  const j = Math.ceil((debut - now) / 86400000);
  return `Clôture refusée : l'année ${next} n'a pas encore commencé. `
    + `La clôture de ${year} sera possible à partir du ${txt} (dans ${j} jour(s)). `
    + `Archiver maintenant déplacerait le planning en cours d'usage et basculerait le service sur ${next}. `
    + `Aucune modification n'a été faite.`;
}

/* Lecture DIRECTE de CONFIG, jamais le cache : la clôture doit voir la vraie case. */
function _clotureConfig_(cle) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sh) return { onglet: false, lignes: [] };
  const d = sh.getDataRange().getValues();
  const lignes = [];
  for (let r = 1; r < d.length; r++) {
    if (String(d[r][0]).trim() === cle) lignes.push({ ligne: r + 1, valeur: d[r][1] });
  }
  return { onglet: true, lignes: lignes };
}

function _clotureEtat_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let arch = null, archErreur = '';
  try {
    if (!ARCHIVE_SS_ID) throw new Error('la ligne ARCHIVE_DRIVE_ID de CONFIG est vide ou absente');
    arch = SpreadsheetApp.openById(ARCHIVE_SS_ID);
  } catch (e) { arch = null; archErreur = e.message; }
  const onglets = {};
  _clotureOnglets_(year).forEach(function (n) {
    onglets[n] = { maitre: !!ss.getSheetByName(n), archive: arch ? !!arch.getSheetByName(n) : null };
  });
  const aa = _clotureConfig_('ANNEE_ACTIVE');
  const active = aa.lignes.length ? Number(aa.lignes[0].valeur) : null;
  let histo = 0;
  const h = ss.getSheetByName('HISTORIQUE');
  if (h) {
    const hv = h.getDataRange().getValues();
    for (let r = 1; r < hv.length; r++) if (String(hv[r][0]).trim() && Number(hv[r][1]) === Number(year)) histo++;
  }
  const g = onglets['GARDES_' + year], s = onglets['STATS_GARDES_' + year];
  const deplaces = g.archive === true && s.archive === true
    && _clotureOnglets_(year).every(function (n) { return !onglets[n].maitre; });
  const campagneOuverte = _clotureConfig_('INDISPOS_ACTIVE').lignes.length > 0;
  return {
    archive: !!arch, archErreur: archErreur, onglets: onglets,
    anneeActive: { lignes: aa.lignes.length, valeur: active },
    campagneOuverte: campagneOuverte, histo: histo, deplaces: deplaces,
    faite: deplaces && histo > 0 && active === Number(year) + 1 && !campagneOuverte,
  };
}

/* Ce qui va être figé, MAR par MAR : gardes réellement faites (dons et échanges
   compris), week-ends, fériés, Noël / Jour de l'An — et qui était de garde
   chacun des quatre jours de fêtes. Lit GARDES_{year} au maître ou à l'archive. */
function _clotureBilanApercu_(year) {
  const live = computeStatsLive(year) || [];
  const fetes = {}, noel = {}, tp = {}, part = {};
  const dates = [`${year}-12-24`, `${year}-12-25`, `${year}-12-31`, `${year + 1}-01-01`];
  const ssG = _ssWithSheet('GARDES_' + year);
  if (ssG) {
    const gd = ssG.getSheetByName('GARDES_' + year).getDataRange().getValues();
    const d2c = buildDateToCol(gd, year);
    for (let r = 3; r < gd.length; r++) {
      const tid = String(gd[r][0]).trim(); if (!tid) continue;
      tp[tid] = gd[r].slice(1).filter(function (v) { return String(v || '').trim().toUpperCase() === 'TP'; }).length;
    }
    dates.forEach(function (dt) {
      fetes[dt] = [];
      const c = d2c[dt];
      if (c == null) return;
      for (let r = 3; r < gd.length; r++) {
        const id = String(gd[r][0]).trim(); if (!id) continue;
        const v = String(gd[r][Number(c)] || '').trim().toUpperCase();
        if (v === 'G' || v === 'G2') { fetes[dt].push(id); noel[id] = 1; }
      }
    });
  }
  const ssS = _ssWithSheet('STATS_GARDES_' + year);
  if (ssS) {
    const sd = ssS.getSheetByName('STATS_GARDES_' + year).getDataRange().getValues();
    const ent = sd[0].map(function (x) { return String(x).trim(); });
    const ip = ent.indexOf('PART EXACTE') > -1 ? ent.indexOf('PART EXACTE') : ent.indexOf('CIBLE');   // 2026 : CIBLE seule
    if (ip > -1) for (let r = 1; r < sd.length; r++) { const pid = String(sd[r][0]).trim(); if (pid) part[pid] = Number(sd[r][ip]) || 0; }
  }
  const mars = live.map(function (x) {
    const id = String(x.medecin || '').trim();
    return { id: id, total: Number(x.total) || 0, weekends: (Number(x.sat) || 0) + (Number(x.dim) || 0),
             feries: Number(x.jf) || 0, noelAn: noel[id] ? 1 : 0, part: part[id] || 0, joursTp: tp[id] || 0 };
  }).filter(function (m) { return m.id; });
  return { mars: mars, fetes: fetes };
}

function _clotureDerniereSauvegarde_() {
  let last = null;
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) {
    const f = it.next().getFiles();
    while (f.hasNext()) { const dc = f.next().getDateCreated(); if (!last || dc > last) last = dc; }
  }
  return last;
}

/* Les contrôles, sans rien écrire. Sert la répétition à blanc ET ouvre la clôture. */
function clotureVerifier_(year, opts) {
  opts = opts || {};
  year = Number(year);
  const controles = [];
  const bloque = function (t) { controles.push({ niveau: 'bloquant', texte: t }); };
  const ok     = function (t) { controles.push({ niveau: 'ok', texte: t }); };
  const info   = function (t) { controles.push({ niveau: 'info', texte: t }); };
  const bilanSiDemande = function () {
    if (opts.sansBilan) return null;
    try { return _clotureBilanApercu_(year); } catch (e) { info(`Bilan ${year} non calculable : ${e.message}`); return null; }
  };
  if (!year || year < 2026) { bloque('Année invalide'); return { year: year, controles: controles, peutClore: false, faite: false }; }
  const next = year + 1;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const etat = _clotureEtat_(year);

  if (etat.faite) {
    info(`L'année ${year} est déjà clôturée — rien à refaire.`);
    return { year: year, controles: controles, peutClore: false, faite: true, etat: etat, bilan: bilanSiDemande() };
  }
  // 1. La date
  const rd = _clotureRefusDate_(year);
  if (rd) bloque(rd); else ok(`Date : l'année ${next} a commencé`);
  // 2. L'année suivante est prête
  const manque = ['INDISPOS_' + next, 'GARDES_' + next, 'STATS_GARDES_' + next].filter(function (n) { return !ss.getSheetByName(n); });
  if (manque.length) bloque(`Année ${next} pas prête : ${manque.join(', ')} absent(s). Faites d'abord « Démarrer l'année ${next} » puis « Générer les gardes ».`);
  else if (ss.getSheetByName('STATS_GARDES_' + next).getLastRow() < 2) bloque(`Gardes ${next} incomplètes : STATS_GARDES_${next} est vide.`);
  else ok(`Année ${next} préparée et générée`);
  // 3. La case de l'année
  const aa = etat.anneeActive;
  if (!aa.lignes) bloque(`La ligne ANNEE_ACTIVE manque dans l'onglet CONFIG : la bascule ne pourrait rien écrire.`);
  else if (aa.lignes > 1) bloque(`La ligne ANNEE_ACTIVE apparaît ${aa.lignes} fois dans CONFIG : n'en garder qu'une.`);
  else if (aa.valeur === year) ok(`Année active : ${year}`);
  else if (aa.valeur === next) info(`Année active déjà sur ${next} : la clôture a été commencée, elle reprendra là où elle s'est arrêtée.`);
  else bloque(`Année active : ${aa.valeur}, attendue ${year}. Rien ne sera fait tant que la case ne correspond pas.`);
  // 4. Le classeur d'archive
  if (!etat.archive) bloque(`Classeur d'archive inaccessible (${etat.archErreur}).`);
  else ok("Classeur d'archive accessible");
  // 5. Les onglets de l'année
  ['GARDES_' + year, 'STATS_GARDES_' + year].forEach(function (n) {
    const o = etat.onglets[n];
    if (!o.maitre && o.archive !== true) bloque(`${n} introuvable, ni dans le classeur principal ni dans l'archive.`);
  });
  if (etat.archive) {
    const doublons = Object.keys(etat.onglets).filter(function (n) { return etat.onglets[n].maitre && etat.onglets[n].archive; });
    if (doublons.length) bloque(`Déjà présent(s) dans le classeur d'archive : ${doublons.join(', ')}. Rien ne sera écrasé : vérifier à la main lequel garder.`);
  }
  const partiront = Object.keys(etat.onglets).filter(function (n) { return etat.onglets[n].maitre; });
  if (partiront.length) info(`Onglets qui partiront à l'archive : ${partiront.join(', ')}`);
  if (etat.histo) info(`HISTORIQUE contient déjà ${etat.histo} ligne(s) ${year} : elles ne seront pas doublées.`);
  if (etat.archive) {
    try {
      const rl = _clotureLignes_(ss, SpreadsheetApp.openById(ARCHIVE_SS_ID), year, true).filter(x => x.n > 0);
      if (rl.length) info(`Lignes ${year} qui partiront à l'archive : ` + rl.map(x => x.onglet + ' (' + x.n + ')').join(', '));
      else info(`Lignes ${year} des onglets partagés (échanges, temps partiel, absences longues) : aucune à déplacer.`);
    } catch (e) { info(`Lignes ${year} des onglets partagés : aperçu impossible (${e.message})`); }
  }
  // 6. La sauvegarde (décision du 15/11/2026 : bloquante) — la clôture fait sa propre copie
  try {
    const d = _clotureDerniereSauvegarde_();
    info((d ? `Dernière sauvegarde : ${Utilities.formatDate(d, 'Europe/Paris', 'dd/MM/yyyy HH:mm')}.` : 'Aucune sauvegarde trouvée.')
      + ' La clôture fera une copie complète du classeur juste avant d\'agir, et s\'arrêtera si elle échoue.');
  } catch (e) { bloque(`Dossier des sauvegardes inaccessible (${e.message}) : la copie de sécurité serait impossible.`); }

  return { year: year, controles: controles, faite: false, etat: etat,
           peutClore: !controles.some(function (c) { return c.niveau === 'bloquant'; }), bilan: bilanSiDemande() };
}

/* Copie complète du classeur avant toute modification. Son nom ne commence pas
   par « Backup » : la rotation hebdomadaire (backupHebdo) ne l'efface jamais. */
function _clotureCopieSecurite_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const dossier = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  const nom = `Avant clôture ${year} — ${Utilities.formatDate(_clotureMaintenant_(), 'Europe/Paris', 'yyyy-MM-dd HH:mm')} — ${ss.getName()}`;
  const copie = DriveApp.getFileById(ss.getId()).makeCopy(nom, dossier);
  if (!copie) throw new Error('la copie n\'a pas été créée');
  return nom;
}

/* Écrit la case ANNEE_ACTIVE PUIS LA RELIT. Une écriture qui ne se retrouve pas
   à la relecture est un échec, jamais un « succès ». */
function _clotureEcrireAnnee_(newYear) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sh) throw new Error('onglet CONFIG introuvable');
  const c = _clotureConfig_('ANNEE_ACTIVE');
  if (c.lignes.length === 0) throw new Error('la ligne ANNEE_ACTIVE manque dans CONFIG');
  if (c.lignes.length > 1) throw new Error(`la ligne ANNEE_ACTIVE apparaît ${c.lignes.length} fois dans CONFIG`);
  sh.getRange(c.lignes[0].ligne, 2).setValue(Number(newYear));
  try { SpreadsheetApp.flush(); } catch (e) {}
  try { viderCacheConfig(); } catch (e) { try { _configReset_(); } catch (e2) {} }
  const relu = _clotureConfig_('ANNEE_ACTIVE').lignes;
  const v = relu.length ? Number(relu[0].valeur) : null;
  if (v !== Number(newYear)) throw new Error(`la case ANNEE_ACTIVE relue vaut ${v} au lieu de ${newYear}`);
  return v;
}

/* Supprime toutes les lignes INDISPOS_ACTIVE (en partant du bas). Renvoie le nombre. */
function _clotureFermerCampagne_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sh) throw new Error('onglet CONFIG introuvable');
  const lignes = _clotureConfig_('INDISPOS_ACTIVE').lignes;
  lignes.slice().reverse().forEach(function (l) { sh.deleteRow(l.ligne); });
  try { viderCacheConfig(); } catch (e) { try { _configReset_(); } catch (e2) {} }
  if (_clotureConfig_('INDISPOS_ACTIVE').lignes.length) throw new Error('la ligne INDISPOS_ACTIVE est toujours là');
  return lignes.length;
}

/* Le contrôle d'après : ce que la fiche « Bascule d'année » faisait vérifier à la main. */
function _clotureApres_(year) {
  const controles = [];
  const ok = function (t) { controles.push({ niveau: 'ok', texte: t }); };
  const ko = function (t) { controles.push({ niveau: 'echec', texte: t }); };
  const next = Number(year) + 1;
  const e = _clotureEtat_(year);
  if (e.anneeActive.valeur === next) ok(`Année active : ${next}`); else ko(`Année active : ${e.anneeActive.valeur}, attendue ${next}`);
  const restent = Object.keys(e.onglets).filter(function (n) { return e.onglets[n].maitre; });
  if (restent.length) ko(`Encore dans le classeur principal : ${restent.join(', ')}`);
  else ok(`Plus aucun onglet ${year} dans le classeur principal`);
  ['GARDES_' + year, 'STATS_GARDES_' + year].forEach(function (n) {
    if (e.onglets[n].archive === true) ok(`${n} dans le classeur d'archive`); else ko(`${n} absent du classeur d'archive`);
  });
  if (e.histo > 0) ok(`HISTORIQUE : ${e.histo} ligne(s) ${year}`); else ko(`HISTORIQUE : aucune ligne ${year}`);
  if (e.campagneOuverte) ko('La campagne d\'indisponibilités est toujours ouverte'); else ok('Campagne d\'indisponibilités fermée');
  /* La rotation d'équité (générateur, v1.77.0) relit les statistiques de chaque
     année archivée : elles doivent rester trouvables. */
  try {
    const src = _ssWithSheet('STATS_GARDES_' + year);
    if (src && src !== SpreadsheetApp.getActiveSpreadsheet()) ok(`Statistiques ${year} retrouvables pour les gardes ${next + 1}`);
    else ko(`Statistiques ${year} introuvables pour la génération des gardes ${next + 1}`);
  } catch (err) { ko(`Statistiques ${year} : contrôle impossible (${err.message})`); }
  try {
    if (_jsonFilesByName_('planning_' + year + '.json').length > 0) ok(`Planning ${year} toujours consultable`);
    else ko(`planning_${year}.json introuvable : le planning ${year} ne serait plus consultable`);
  } catch (err) { ko(`Planning ${year} : contrôle impossible (${err.message})`); }
  return { ok: !controles.some(function (c) { return c.niveau === 'echec'; }), controles: controles };
}

function _clotureTexte_(o) {
  const L = [];
  (o.bloquants || []).forEach(function (t) { L.push('⛔ ' + t); });
  (o.etapes || []).forEach(function (s) {
    const ic = s.etat === 'fait' ? '✅' : s.etat === 'déjà fait' ? 'ℹ️' : '❌';
    L.push(ic + ' ' + s.nom + (s.etat === 'déjà fait' ? ' — déjà fait' : '') + (s.detail ? ' — ' + s.detail : ''));
  });
  (o.apres || []).forEach(function (c) { L.push((c.niveau === 'echec' ? '⚠️ ' : '✓ ') + c.texte); });
  if (o.error) L.push('→ ' + o.error);
  return L.join('\n');
}

function _clotureMail_(res) {
  try {
    const c = _clotureConfig_('DIAG_EMAIL').lignes;
    const dest = c.length ? String(c[0].valeur || '').trim() : '';
    if (!dest) return;
    MailApp.sendEmail(dest, (res.success ? '✅' : '⚠️') + ` Clôture ${res.year} — Planning-Med`,
      res.message + '\n\n— Message automatique de la clôture d\'année.');
  } catch (e) { /* le mail n'est qu'un compte rendu : jamais bloquant */ }
}

function cloturerAnnee_(year) {
  year = Number(year);
  const next = year + 1;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const etapes = [];
  const pas = function (nom, etat, detail) { etapes.push({ nom: nom, etat: etat, detail: detail || '' }); };
  const sortie = function (success, extra) {
    const o = Object.assign({ success: success, year: year, etapes: etapes }, extra || {});
    o.message = _clotureTexte_(o);
    try { logAction(`cloturerAnnee ${year} — ${success ? 'OK' : 'ARRÊT'}${o.error ? ' : ' + o.error : ''}`); } catch (e) {}
    return o;
  };

  const v = clotureVerifier_(year, { sansBilan: true });
  if (v.faite) {
    const ap = _clotureApres_(year);
    return sortie(ap.ok, { dejaFaite: true, apres: ap.controles,
      error: ap.ok ? '' : 'Année déjà clôturée, mais le contrôle d\'après signale un écart.' });
  }
  if (!v.peutClore) {
    const b = v.controles.filter(function (c) { return c.niveau === 'bloquant'; }).map(function (c) { return c.texte; });
    return sortie(false, { bloquants: b, error: b[0] || 'Clôture impossible' });
  }
  const etat = v.etat;

  // 1. Copie de sécurité — tant que quelque chose reste à déplacer
  const nomCopie = 'Copie de sécurité du classeur';
  if (etat.onglets['GARDES_' + year].maitre || etat.onglets['STATS_GARDES_' + year].maitre) {
    try { pas(nomCopie, 'fait', _clotureCopieSecurite_(year)); }
    catch (e) {
      pas(nomCopie, 'échec', e.message);
      return sortie(false, { error: `Copie de sécurité impossible (${e.message}) : la clôture s'arrête avant de toucher à quoi que ce soit.` });
    }
  } else pas(nomCopie, 'déjà fait', `les onglets ${year} sont déjà à l'archive`);

  // 2. Bilan : HISTORIQUE, sauvegardes Drive, retouches quotidiennes effacées
  const nomBilan = `Bilan ${year} (HISTORIQUE, sauvegardes Drive, retouches effacées)`;
  if (ss.getSheetByName('STATS_GARDES_' + year)) {
    const lignes = String(_clotureBilan_(year) || '').split('\n').filter(Boolean);
    if (lignes.some(function (l) { return l.indexOf('❌') === 0; })) {
      pas(nomBilan, 'échec', lignes.join(' · '));
      return sortie(false, { error: `Bilan ${year} incomplet. Rien n'a été déplacé et l'année active n'a pas changé : corriger puis relancer la clôture.` });
    }
    pas(nomBilan, 'fait', lignes.join(' · '));
  } else pas(nomBilan, 'déjà fait');

  // 2 bis. (26/11/2026) Reliquat de vacances de l'année, figé tant que GARDES_{year} est encore là
  const nomRel = `Reliquat de vacances ${year} (onglet ${RELIQUATS_ONGLET})`;
  try { pas(nomRel, 'fait', _reliquatsFiger_(year)); }
  catch (e) {
    pas(nomRel, 'échec', e.message);
    return sortie(false, { error: `Reliquat de vacances ${year} non figé (${e.message}). Rien n'a été déplacé et l'année active n'a pas changé : relancer la clôture.` });
  }

  // 3. Déplacement sûr : copie, vérification, puis suppression du maître
  const nomDep = `Onglets ${year} vers le classeur d'archive`;
  if (_clotureOnglets_(year).some(function (n) { return ss.getSheetByName(n); })) {
    let rap = [];
    try { rap = archiveMoveTabs_(year) || []; } catch (e) { rap = ['❌ ' + e.message]; }
    try {
      const arch = SpreadsheetApp.openById(ARCHIVE_SS_ID);
      _clotureOngletsEnPlus_(year).forEach(function (n) { if (ss.getSheetByName(n)) rap.push(_clotureDeplacer_(ss, arch, n)); });
    } catch (e) { rap.push('❌ ' + e.message); }
    const restent = _clotureOnglets_(year).filter(function (n) { return ss.getSheetByName(n); });
    if (restent.length) {
      pas(nomDep, 'échec', rap.join(' · '));
      return sortie(false, { error: `Déplacement incomplet : ${restent.join(', ')} encore dans le classeur principal. L'année active n'a pas changé : relancer la clôture, elle reprendra ici.` });
    }
    pas(nomDep, 'fait', rap.join(' · '));
  } else pas(nomDep, 'déjà fait');

  // 3 bis. (15/11/2026, lot C) Les lignes de l'année dans les onglets partagés
  const nomLig = `Lignes ${year} des onglets partagés vers l'archive`;
  try {
    const rl = _clotureLignes_(ss, SpreadsheetApp.openById(ARCHIVE_SS_ID), year, false);
    const total = rl.reduce((t, x) => t + (x.note === 'déplacée(s)' ? x.n : 0), 0);
    pas(nomLig, total ? 'fait' : 'déjà fait', rl.map(x => x.onglet + ' : ' + x.n + ' ' + x.note).join(' · '));
  } catch (e) {
    pas(nomLig, 'échec', e.message);
    return sortie(false, { error: `Lignes ${year} non déplacées : ${e.message}. L'année active n'a pas changé : relancer la clôture, rien ne sera doublé.` });
  }

  // 4. Bascule, relue
  const nomBasc = `Année active → ${next}`;
  try {
    const cur = _clotureConfig_('ANNEE_ACTIVE').lignes;
    if (cur.length === 1 && Number(cur[0].valeur) === next) pas(nomBasc, 'déjà fait');
    else { _clotureEcrireAnnee_(next); pas(nomBasc, 'fait', 'case relue'); }
  } catch (e) {
    pas(nomBasc, 'échec', e.message);
    return sortie(false, { error: `Bascule impossible : ${e.message}. Les onglets ${year} sont déjà à l'archive : relancer la clôture, elle reprendra ici.` });
  }

  // 5. Fermeture de la campagne d'indisponibilités
  const nomCamp = 'Campagne d\'indisponibilités fermée';
  try { const n = _clotureFermerCampagne_(); pas(nomCamp, n ? 'fait' : 'déjà fait'); }
  catch (e) {
    pas(nomCamp, 'échec', e.message);
    return sortie(false, { error: `Campagne non fermée : ${e.message}. Relancer la clôture.` });
  }

  // 6. Copie rapide des écrans : les deux années (le filet horaire repasse de toute façon)
  try {
    _miroirNoterPoussee_(['planning', 'affectations', 'annees', 'acces', 'config_admin', 'gardes', 'stats', 'indispos'], year);
    _miroirNoterPoussee_(['planning', 'affectations', 'annees', 'acces', 'config_admin', 'gardes', 'stats', 'indispos'], next);
  } catch (e) {}

  // 7. Contrôle d'après, compte rendu par mail
  const ap = _clotureApres_(year);
  const res = sortie(ap.ok, { apres: ap.controles,
    error: ap.ok ? '' : 'Clôture faite, mais le contrôle d\'après signale un écart (voir les lignes ⚠️).' });
  _clotureMail_(res);
  return res;
}

/* Depuis l'éditeur Apps Script : exactement la même clôture, avec les mêmes refus. */
function archiveYear(year) {
  if (!year) return '❌ année manquante — ex. archiveYear(2026)';
  const r = cloturerAnnee_(year);
  try { SpreadsheetApp.getUi().alert(`Clôture ${year}\n\n${r.message}`); } catch (e) {}
  return r.message;
}

/* Depuis l'éditeur : la répétition à blanc, rien n'est écrit. */
function repetitionCloture(year) {
  const v = clotureVerifier_(year || getActiveYear());
  const txt = v.controles.map(function (c) { return (c.niveau === 'bloquant' ? '⛔ ' : c.niveau === 'ok' ? '✓ ' : 'ℹ️ ') + c.texte; }).join('\n');
  Logger.log(txt);
  return txt;
}
