// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_SETUP = '2026-09-05.2';


// ══════════════════════════════════════════════════════════════════════
//  RANGEMENT DES ONGLETS  (one-shot, réversible)
// ══════════════════════════════════════════════════════════════════════
// 22 onglets, c'est beaucoup pour s'y retrouver. On les range en 4 familles,
// on les colore, et on MASQUE ceux que personne n'édite à la main.
//
// ⚠️ Masquer ne casse RIEN : getSheetByName() lit et écrit un onglet masqué
// exactement comme un onglet visible. Aucun code n'est concerné.
// Pour tout revoir : menu Affichage ▸ Feuilles masquées, ou lancer
// afficherTousLesOnglets().
//
// Un onglet absent est simplement ignoré (pas d'erreur).

// Ordre + couleur. Les onglets ANNUELS (GARDES_2026…) sont insérés
// automatiquement après cette liste, du plus récent au plus ancien.
const _ONGLETS_PLAN = [
  // ── Configuration courante — bleu foncé
  { n:'CONFIG',             c:'#1D4ED8' },
  { n:'MEDECINS',           c:'#1D4ED8' },
  { n:'SECTEURS',           c:'#1D4ED8' },
  { n:'CS_TEMPLATE',        c:'#1D4ED8' },
  { n:'ANNUAIRE',           c:'#1D4ED8' },
  { n:'SEUILS',             c:'#1D4ED8' },
  // ── Configuration annuelle (staff d'octobre) — bleu clair
  { n:'GROUPES_VAC',        c:'#60A5FA' },
  { n:'PERIODES_VAC',       c:'#60A5FA' },
  { n:'CONFIG_CONGES',      c:'#60A5FA' },
  { n:'CONFIG_TRANSITION',  c:'#60A5FA' },
  // ── Contenu du portail — violet
  { n:'VEILLE_CFG',         c:'#7E22CE' },
  { n:'STAFFS',             c:'#7E22CE' },
  // ── Technique mais consultable en dépannage — orange (VISIBLE)
  { n:'PLANNING_OVERRIDES', c:'#C2410C' },
  // ── Module libéral — turquoise
  { n:'SPECIALITES',        c:'#0D9488' },
  { n:'COTATIONS_TYPE',     c:'#0D9488' },
  { n:'LIBERAL_2026',       c:'#0D9488' },
  { n:'LIBERAL_CA_2026',    c:'#0D9488' },
];

// Écrits et lus par le code seul : masqués.
const _ONGLETS_MASQUES = [
  'ABSENCES_LONGUES', 'HISTORIQUE',
  'VEILLE', 'VEILLE_MARQUES', 'LOGS', 'CONNEXIONS',
];

const _ONGLET_ANNUEL_RE = /^(GARDES|INDISPOS|AFFECTATIONS|STATS_GARDES)_(\d{4})$/;

function organiserOnglets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const toutes = ss.getSheets();

  // 1) Tout afficher d'abord : un onglet masqué ne peut pas être déplacé.
  toutes.forEach(function (sh) { try { sh.showSheet(); } catch (e) {} });

  // 2) Onglets annuels, groupés par année décroissante (l'année en cours en tête).
  const annuels = [];
  toutes.forEach(function (sh) {
    const m = _ONGLET_ANNUEL_RE.exec(sh.getName());
    if (m) annuels.push({ n: sh.getName(), an: Number(m[2]), fam: m[1] });
  });
  const ordreFam = { GARDES:1, INDISPOS:2, AFFECTATIONS:3, STATS_GARDES:4 };
  annuels.sort(function (a, b) {
    return (b.an - a.an) || ((ordreFam[a.fam] || 9) - (ordreFam[b.fam] || 9));
  });

  // 3) Ordre final : plan → annuels (vert) → masqués (gris)
  const plan = _ONGLETS_PLAN.slice();
  annuels.forEach(function (x) { plan.push({ n: x.n, c: '#166534' }); });
  _ONGLETS_MASQUES.forEach(function (n) { plan.push({ n: n, c: '#9CA3AF', cacher: true } ); });

  let pos = 0, rangés = 0, cachés = 0;
  const absents = [];
  plan.forEach(function (item) {
    const sh = ss.getSheetByName(item.n);
    if (!sh) { absents.push(item.n); return; }
    pos++;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(pos);
    try { sh.setTabColor(item.c); } catch (e) {}
    rangés++;
    if (item.cacher) { try { sh.hideSheet(); cachés++; } catch (e) {} }
  });

  // 4) Tout onglet non prévu reste visible, à la fin, sans couleur imposée.
  const prévus = {};
  plan.forEach(function (i) { prévus[i.n] = true; });
  const orphelins = ss.getSheets().map(function (s) { return s.getName(); })
                      .filter(function (n) { return !prévus[n]; });

  ss.setActiveSheet(ss.getSheets()[0]);
  Logger.log('✅ ' + rangés + ' onglet(s) rangé(s), ' + cachés + ' masqué(s).');
  Logger.log('   Visibles : ' + (rangés - cachés + orphelins.length));
  if (absents.length)   Logger.log('   ℹ️ Prévus mais absents : ' + absents.join(', '));
  if (orphelins.length) Logger.log('   ⚠️ Non prévus, laissés à la fin : ' + orphelins.join(', '));
  Logger.log('   Pour tout revoir : afficherTousLesOnglets()');
  return rangés;
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
    const medDataSetup = medSheetSetup.getDataRange().getValues();
    for (let r = 1; r < medDataSetup.length; r++) {
      const id = String(medDataSetup[r][0]).trim();
      const actif = String(medDataSetup[r][3]).trim().toUpperCase() === 'O';
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

// ── ARCHIVAGE ANNÉE N ──────────────────────────────────────────────────

function archiveYear(year, moveSheets) {
  if (moveSheets === undefined) moveSheets = true;
  if (!year) { try{SpreadsheetApp.getUi().alert("❌ Préciser l'année. Ex : archiveYear(2026)");}catch(e){} return "❌ année manquante"; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = [];

  // ── Garde d'idempotence (15/07/2026) : année déjà archivée ? ──
  // Cas visé : la réponse d'un archivage précédent s'est perdue en transit
  // (ou navigateur fermé en pleine clôture) → le wizard rejoue archiveYear
  // alors que les onglets ont déjà été déplacés. Sans cette garde, l'absence
  // de STATS_GARDES_{year} produirait un « ❌ archivage interrompu » définitif.
  // Détection stricte (les 3 conditions ensemble, sinon on laisse le ❌ normal
  // signaler un vrai problème) :
  //   1. STATS_GARDES_{year} absent du classeur maître
  //   2. l'année figure dans HISTORIQUE
  //   3. STATS_GARDES_{year} présent dans le classeur d'archive
  if (!ss.getSheetByName(`STATS_GARDES_${year}`)) {
    let enHisto = false, enArchive = false;
    try {
      const h0 = ss.getSheetByName('HISTORIQUE');
      if (h0) {
        const hv = h0.getDataRange().getValues();
        for (let r = 1; r < hv.length; r++) {
          if (Number(hv[r][1]) === Number(year)) { enHisto = true; break; }
        }
      }
    } catch (e) {}
    try { enArchive = !!SpreadsheetApp.openById(ARCHIVE_SS_ID).getSheetByName(`STATS_GARDES_${year}`); } catch (e) {}
    if (enHisto && enArchive) {
      const msg = `ℹ️ Année ${year} déjà archivée (HISTORIQUE alimenté, onglets dans le classeur d'archive) — rien à refaire.`;
      Logger.log(msg);
      return msg; // pas de « ❌ » → le dispatcher renvoie success:true → le wizard enchaîne sur la bascule
    }
  }

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
    const hd = h.getDataRange().getValues();
    const seen = new Set();
    for (let r=1;r<hd.length;r++){ const id=String(hd[r][0]).trim(); if(id) seen.add(`${id}|${hd[r][1]}`); }

    // NOEL/AN "réel" : lu dans GARDES_{year} (échanges/dons inclus), pas dans le
    // snapshot STATS figé à la génération. Choix assumé : la rotation Noël/An doit
    // refléter qui a RÉELLEMENT passé Noël / le Jour de l'an de garde (décision 07/2026).
    // La dette, elle, reste calculée sur le snapshot (planning tel que généré).
    // Repli : si GARDES_{year} est absent, on retombe sur la colonne NOEL/AN des stats.
    let noelReel = null;
    const gSheet = ss.getSheetByName(`GARDES_${year}`);
    if (gSheet) {
      const gd = gSheet.getDataRange().getValues();
      const d2c = buildDateToCol(gd, year);
      const noelCols = [`${year}-12-24`, `${year}-12-25`, `${year}-12-31`, `${year + 1}-01-01`]
        .map(dt => d2c[dt]).filter(c => c != null);
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

    /* (03/08/2026) HISTORIQUE reflete desormais les gardes REELLEMENT faites.
       Il recopiait le snapshot STATS, c'est-a-dire le planning tel que genere. Or la
       dette d'equite de l'annee suivante n'est PAS lue ici : le generateur va la
       chercher directement dans STATS_GARDES_{annee-1}, avec repli sur le classeur
       d'archives (generateur_gardes.gs). HISTORIQUE n'est donc pas un moteur, c'est
       la memoire longue du service — et une fois GARDES_{annee} parti aux archives,
       la seule trace qui reste dans le maitre. Autant qu'elle dise la verite.
       Effet de bord voulu : les MAR presents dans la grille mais absents du snapshot
       (arrivee en cours d'annee, ex. ARMAND en novembre 2026) obtiennent enfin leur
       ligne, avec leur Noel reel — sans quoi ils redevenaient eligibles a Noel.
       Repli : si la grille est illisible, on retombe sur l'ancien comportement. */
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
          x.vd, x.vjf, x.jf, noelAn, x.recupR, x.h18]);
      });
    } else {
      for (let r=1;r<d.length;r++){
        const id=String(d[r][0]).trim(); if(!id) continue;
        if (seen.has(`${id}|${year}`)) continue;
        const noelAn = noelReel ? (noelReel.has(id) ? 1 : 0) : num(r,'NOEL/AN');
        hrows.push([id,year, num(r,'TOTAL G'),num(r,'G (REA)'),num(r,'G2 (MAT)'),
          num(r,'LUN'),num(r,'MAR'),num(r,'MER'),num(r,'JEU'),num(r,'VEN'),num(r,'SAM'),num(r,'DIM'),
          num(r,'VD'),num(r,'VEILLE JF'),num(r,'JF'),noelAn,num(r,'RECUP R'),num(r,'18H')]);
      }
    }
    if (hrows.length){ h.getRange(h.getLastRow()+1,1,hrows.length,18).setValues(hrows);
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

  // ── 3. Déplacer les onglets de l'année vers le classeur d'archive ──
  // Le maître reste propre ; la dette N+1 retrouve STATS_GARDES_N via le repli ARCHIVE_SS_ID.
  const archiveOk = results.every(r=>!r.startsWith('❌'));
  if (moveSheets && archiveOk) {
    let arch=null;
    try{ arch=SpreadsheetApp.openById(ARCHIVE_SS_ID); }catch(e){ results.push(`❌ Classeur d'archive inaccessible — onglets conservés, archivage incomplet`); }
    if (arch) {
      [`GARDES_${year}`,`INDISPOS_${year}`,`AFFECTATIONS_${year}`,`STATS_GARDES_${year}`].forEach(name=>{
        const sh=ss.getSheetByName(name);
        if(!sh){ results.push(`⚠️ ${name} introuvable — ignoré`); return; }
        try{ const old=arch.getSheetByName(name); if(old) arch.deleteSheet(old);
          sh.copyTo(arch).setName(name); ss.deleteSheet(sh); results.push(`📦 ${name} → archive`); }
        catch(e){ results.push(`❌ Transfert ${name} échoué : ${e.message} — archivage incomplet`); }
      });
    }
  } else if (moveSheets) results.push(`⏸️ Transfert suspendu (archivage incomplet)`);

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
  Logger.log(`\n── Archivage ${year} ──\n${rapport}`);
  try{ SpreadsheetApp.getUi().alert(`Archivage ${year}\n\n${rapport}`); }catch(e){}
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
// ═══════ TEST — À SUPPRIMER AVANT LA MISE EN SERVICE ═══════
function TEST_remplirIndispos(year, scenario) {
  scenario = scenario || 'normal';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(`INDISPOS_${year}`);
  if (!sh) { SpreadsheetApp.getUi().alert(`❌ INDISPOS_${year} absent — lance d'abord W1.`); return; }
  const data = sh.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, year);
  const nCol = dates.length;
  const dow = dates.map(d => d ? new Date(d+'T12:00:00').getDay() : -1);
  const P = ({normal:{vac:6,form:3,ind:4,souh:4}, charge:{vac:8,form:5,ind:7,souh:6},
              leger:{vac:4,form:1,ind:2,souh:2}})[scenario] || {vac:6,form:3,ind:4,souh:4};
  const rint = n => Math.floor(Math.random()*n);
  const lundis = []; for (let c=0;c<nCol;c++) if (dow[c]===1) lundis.push(c);
  for (let r=3; r<data.length; r++) {
    const id = String(data[r][0]).trim(); if (!id) continue;
    const row = []; for (let c=0;c<nCol;c++) row[c] = String(data[r][c+1]||'');
    let posees=0; const ls=lundis.slice();
    for (let k=ls.length-1;k>0;k--){const j=rint(k+1);[ls[k],ls[j]]=[ls[j],ls[k]];}
    for (const L of ls) { if (posees>=P.vac) break; const dur=(Math.random()<0.5?1:2); let ok=true;
      for (let c=L;c<Math.min(L+dur*7,nCol);c++) if (row[c]) ok=false;
      if (!ok) continue; for (let c=L;c<Math.min(L+dur*7,nCol);c++) if(dates[c]) row[c]='VAC'; posees+=dur; }
    for (let k=0;k<P.form;k++){ const c=rint(nCol); if(dates[c]&&!row[c]&&dow[c]>=1&&dow[c]<=5) row[c]='FORM'; }
    for (let k=0;k<P.ind;k++){ const c=rint(nCol); if(dates[c]&&!row[c]) row[c]='INDISPO'; }
    let s=P.souh; for (let t=0;t<80 && s>0;t++){ const c=rint(nCol);
      if(dates[c]&&!row[c]&&dow[c]>=1&&dow[c]<=3){ row[c]='SOUHAIT'; s--; } }
    sh.getRange(r+1, 2, 1, nCol).setValues([row]);
  }
  SpreadsheetApp.getUi().alert(`✅ INDISPOS_${year} rempli (« ${scenario} »). Lance W2 puis W3.`);
}
function TEST_run() {
  const ANNEE    = 2028;       // ← change l'année ici
  const SCENARIO = 'charge';   // 'normal' | 'charge' | 'leger'
  TEST_remplirIndispos(ANNEE, SCENARIO);
}
/* (05/09/2026) LANCEUR TEMPORAIRE — essai à blanc de l'année 2028 dans une COPIE
   du classeur, pour éprouver le nouvel algorithme sur une année complète dont
   toutes les vacances, formations et TP sont posés (ce qui n'est le cas d'aucune
   année réelle disponible aujourd'hui).
   setupAnnee n'est appelée par AUCUN menu ni bouton — le guide technique la
   décrit comme endormie — et l'éditeur Apps Script ne sait pas passer d'argument
   à une fonction : d'où ce lanceur, sur le modèle de T() et T7().
   ⚠️ À N'EXÉCUTER QUE DANS UNE COPIE. Dans le classeur de production, il
   effacerait la grille d'indisponibilités de 2028 si elle existait. Le garde-fou
   de setupAnnee demande confirmation dès qu'une saisie est présente, mais ne
   comptez pas dessus : vérifiez le nom du classeur avant de lancer.
   ⚠️ À RETIRER avec T() et T7() une fois 2027 publié. */
function W1_2028() { setupAnnee(2028); }

/* (05/09/2026) LANCEUR TEMPORAIRE — régénère 2026 sur des indisponibilités
   COMPLÉTÉES, pour éprouver le nouvel algorithme sur les VRAIES absences du
   service, pic de Noël compris (27/12 : 3 gardeurs disponibles sur 20).
   Le seul intérêt de 2026 : c'est la seule année dont les absences sont réelles.
   Le planning existant sert de point de comparaison.

   ⚠️ DANGER — À N'EXÉCUTER QUE DANS UNE COPIE DU CLASSEUR.
   Dans le classeur de production, cette fonction :
     · exige d'abord la suppression manuelle de GARDES_2026 (verrou anti-
       régénération), mais une fois l'onglet supprimé plus rien ne protège ;
     · EFFACE le planning 2026 que l'équipe consulte ;
     · envoie une notification push à tous les MAR abonnés.
   Vérifiez le nom du classeur avant de lancer.
   ⚠️ À RETIRER avec les autres lanceurs une fois 2027 publié. */
function W2_2026() { generateGardes(2026); }

/* (05/09/2026) Visait 2029 alors que TEST_run remplit 2028 : enchaîner les deux
   générait une année VIDE sans que rien ne le signale. Les trois lanceurs
   d'essai parlent désormais de la même année. */
function TEST_W2() { generateGardes(2028); }      // génère le planning
function TEST_W3_safe()  { archiveYear(2029, false); }  // itération rapide
function TEST_W3_reel()  { archiveYear(2027, true);  }  // test du déplacement réel
