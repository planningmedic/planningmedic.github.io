// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_CODE = '2026-09-08.2';

// ── Reconstruire STATS_GARDES_2026 depuis GARDES_2026 (année reconstruite) ──
// Renvoie le classeur contenant l'onglet demandé : classeur actif si présent,
// sinon le classeur d'archive (année clôturée dont les onglets ont été déplacés).
function _ssWithSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(sheetName)) return ss;
  try { const arch = SpreadsheetApp.openById(ARCHIVE_SS_ID); if (arch.getSheetByName(sheetName)) return arch; } catch (e) {}
  return null;
}

// ── Stats LIVE : recalcule depuis GARDES_YYYY (échanges/dons inclus), cibles lues dans STATS_GARDES ──
function computeStatsLive(year) {
  const ss = _ssWithSheet(`GARDES_${year}`) || SpreadsheetApp.getActiveSpreadsheet();
  const gardes = ss.getSheetByName(`GARDES_${year}`);
  if (!gardes) throw new Error(`GARDES_${year} introuvable`);
  const data = gardes.getDataRange().getValues();
  const dateToCol = buildDateToCol(data, year);
  const colToDate = {};
  Object.keys(dateToCol).forEach(d => { colToDate[dateToCol[d]] = d; });
  const jf = getJoursFeries(year), jfn = getJoursFeries(year + 1);
  const isF = d => jf.has(d) || jfn.has(d);
  const NOEL = new Set([`${year}-12-24`,`${year}-12-25`,`${year}-12-31`,`${year+1}-01-01`]);
  const KEYS = ['dim','lun','mar','mer','jeu','ven','sam'];
  const nextDay = d => {
    const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1);
    return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  };
  const cibById = {};
  const stSheet = ss.getSheetByName(`STATS_GARDES_${year}`);
  if (stSheet) {
    const sd = stSheet.getDataRange().getValues();
    for (let r = 1; r < sd.length; r++) {
      const id = String(sd[r][0]).trim(); if (!id) continue;
      /* (05/09/2026) cJf : colonne 22 de STATS_GARDES, écrite par le générateur
         depuis toujours mais jamais lue. L'écran d'équité mesurait donc CINQ axes
         quand le générateur en surveille SIX — et le sixième, les jours fériés,
         est justement celui où le résidu se concentre (11 fériés dans l'année,
         part individuelle ~1,4 : l'arrondi n'a que 1 ou 2 à proposer). */
      cibById[id] = { cible:Number(sd[r][1])||0, cSat:Number(sd[r][17])||0,
        cJeu:Number(sd[r][18])||0, cVd:Number(sd[r][19])||0, cVjf:Number(sd[r][21])||0,
        cJf:Number(sd[r][22])||0 };
    }
  }
  const stats = [];
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    const c = {total:0,g:0,g2:0,lun:0,mar:0,mer:0,jeu:0,ven:0,sam:0,dim:0,recupR:0,h18:0,jf:0,vjf:0,vd:0,noelAn:0};
    Object.keys(colToDate).forEach(col => {
      const date = colToDate[col];
      const val = String(data[r][Number(col)] || '').trim().toUpperCase();
      if (val === 'R')  c.recupR++;
      if (val === '18') c.h18++;
      if (val !== 'G' && val !== 'G2') return;
      const dow = new Date(date + 'T12:00:00').getDay();
      c.total++;
      if (val === 'G') c.g++; else c.g2++;
      c[KEYS[dow]]++;
      if (isF(date)) c.jf++;
      if (dow === 5) c.vd++;
      if (!isF(date) && isF(nextDay(date)) && dow >= 1 && dow <= 4) c.vjf++;
      if (NOEL.has(date)) c.noelAn++;
    });
    const cb = cibById[id] || {cible:0,cSat:0,cJeu:0,cVd:0,cVjf:0,cJf:0};
    stats.push({medecin:id, cible:cb.cible, total:c.total, g:c.g, g2:c.g2,
      lun:c.lun, mar:c.mar, mer:c.mer, jeu:c.jeu, ven:c.ven, sat:c.sam, dim:c.dim,
      recupR:c.recupR, h18:c.h18, jf:c.jf, vjf:c.vjf, vd:c.vd,
      cSat:cb.cSat, cJeu:cb.cJeu, cVd:cb.cVd, cVjf:cb.cVjf, cJf:cb.cJf});
  }
  return stats;
}
// ── CONFIG ─────────────────────────────────────────────────────────────
const GITHUB_USER = 'planningmedic';

/* ── MEMO DE CONFIG (28/07/2026) ───────────────────────────────────────
   L'onglet CONFIG etait relu jusqu'a QUATRE fois dans une seule execution :
   TEST_YEAR (ligne 9 d'Indispos.gs, code global -> joue a CHAQUE appel),
   checkCode, getIndisposYear, _indisposOuverte_. Chaque getValues() est un
   aller-retour vers les serveurs Sheets, le geste le plus lent d'Apps Script.
   Mesure du 28/07 : doPost median 3,3 s.
   Ce memo ne vit QUE le temps d'une execution : Apps Script repart d'un
   contexte neuf a chaque appel, rien ne survit d'une requete a l'autre.
   ⚠️ Toute action qui ECRIT dans CONFIG doit appeler _configReset_() juste
   apres son ecriture, sinon la suite de la MEME execution relirait l'ancienne
   valeur. Concernees a ce jour : saveConfig, setActiveYear, setIndisposYear,
   clearIndisposYear (Indispos.gs).
   Le memo est porte par la fonction elle-meme (et non par une variable
   globale) : l'ordre d'execution des fichiers .gs n'est pas garanti, une
   variable declaree en let/const dans un autre fichier serait inaccessible. */
/* ══════════════════════════════════════════════════════════════════════
   CACHE DES ONGLETS DE CONFIGURATION (01/08/2026)
   ══════════════════════════════════════════════════════════════════════
   POURQUOI. Mesure du 01/08, deux ouvertures d'admin a trois minutes
   d'ecart, code identique :

       onglets SEUILS + CS_TEMPLATE :   702 ms  puis  6 956 ms   (x10)
       onglet  SECTEURS             :   432 ms  puis  1 291 ms   (x3)
       fichiers Drive (planning)    :   548 ms  puis    542 ms   (x1,0)

   Les lectures Drive sont stables ; les lectures d'ONGLETS explosent.
   L'instabilite d'une ouverture vient donc du service Sheets, et chaque
   aller-retour vers lui est une occasion de tomber sur un mauvais moment.
   Le bootstrap en faisait SIX. Ce cache en supprime TROIS, dont celui qui
   a coute 7 secondes.

   CE QUI EST MIS EN CACHE : uniquement des onglets de CONFIGURATION, qui
   changent deux ou trois fois par an — CONFIG, SECTEURS, CS_TEMPLATE,
   SEUILS. JAMAIS de donnees de planning, JAMAIS MEDECINS (reecrit par les
   formulaires : 1 s ne vaut pas ce risque).

   PEREMPTION. Trois filets, du plus rapide au plus lent :
     1. toute action d'ECRITURE vide le cache (voir _routeRequete_) ;
     2. le bouton « Vider le cache » de l'onglet Maintenance ;
     3. une duree de vie de 10 minutes.
   Consequence a connaitre : une modification faite A LA MAIN dans le
   classeur (un seuil, un secteur, un code d'acces) met jusqu'a 10 minutes
   a prendre effet — ou est visible tout de suite avec le bouton.

   ⚠️ CONFIG porte ADMIN_CODE et SECRETARIAT_CODE. Un code revoque a la
   main reste donc valable jusqu'a 10 minutes. En cas de revocation
   urgente : utiliser le bouton « Vider le cache ».
   ══════════════════════════════════════════════════════════════════════ */
const CACHE_CONFIG_TTL = 600;                       // 10 minutes
const CACHE_CONFIG_CLES = ['cfg:CONFIG', 'cfg:SECTEURS', 'cfg:CS_TEMPLATE', 'cfg:SEUILS'];

// Les cellules d'un onglet peuvent contenir des Date, que JSON ne sait pas
// restituer (elle reviendrait en chaine, et String(date) ne donnerait pas la
// meme chose). On les marque a l'aller et on les reconstruit au retour.
function _serDate_(v)   { return (v instanceof Date) ? { __d: v.getTime() } : v; }
function _deserDate_(v) { return (v && typeof v === 'object' && typeof v.__d === 'number') ? new Date(v.__d) : v; }

function _cacheLire_(cle) {
  try { const t = CacheService.getScriptCache().get(cle); return t ? JSON.parse(t) : null; }
  catch (e) { return null; }          // cache indisponible : on relira l'onglet
}
function _cacheEcrire_(cle, valeur) {
  try {
    const t = JSON.stringify(valeur);
    if (t.length < 95000) CacheService.getScriptCache().put(cle, t, CACHE_CONFIG_TTL);
  } catch (e) { /* jamais bloquant */ }
}
function viderCacheConfig() {
  try { CacheService.getScriptCache().removeAll(CACHE_CONFIG_CLES); } catch (e) {}
  try { _configRows_._v = null; } catch (e) {}
  try { _pairesEviteesCache = null; } catch (e) {}   // dérivé de CONFIG : même durée de vie
}

function _configRows_() {
  if (_configRows_._v) return _configRows_._v;
  const _c = _cacheLire_('cfg:CONFIG');
  if (_c) { _configRows_._v = _c.map(function (l) { return l.map(_deserDate_); }); return _configRows_._v; }
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  _configRows_._v = sh ? sh.getDataRange().getValues() : [];
  _cacheEcrire_('cfg:CONFIG', _configRows_._v.map(function (l) { return l.map(_serDate_); }));
  return _configRows_._v;
}
function _configReset_() { _configRows_._v = null; _pairesEviteesCache = null; }

let _ghTokenCache = null;
function getGithubToken() {
  if (_ghTokenCache !== null) return _ghTokenCache;
  _ghTokenCache = '';
  {
    const data = _configRows_();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === 'GITHUB_TOKEN') { _ghTokenCache = String(data[r][1]).trim(); break; }
    }
  }
  return _ghTokenCache;
}
const GITHUB_REPO = 'planningmedic.github.io';
const GITHUB_BRANCH = 'main';

// ── MÉDECINS ───────────────────────────────────────────────────────────
// NOTE : sera chargé dynamiquement depuis l'onglet MEDECINS à terme (P-backlog)
/* (08/09/2026) LA LISTE NOMINATIVE A ETE SUPPRIMEE.
   Vingt-cinq noms de medecins vivaient ici, dans un depot public, pour servir
   de repli si l'onglet MEDECINS etait absent ou vide. index.html avait deja
   retire la sienne pour la meme raison — « code mort + noms en clair ».
   Le repli lui-meme etait dangereux : un onglet momentanement illisible
   faisait publier un planning bati sur un effectif fige et perime, en
   silence. Desormais getDoctorsFromMedecins() echoue franchement. Un ecran
   d'erreur se voit ; un planning faux, non. */
// ── C1 : roster dynamique depuis l'onglet MEDECINS ────────────────────
// La publication lit l'effectif réel (MAR actifs) au lieu de la liste en dur.
// Repli sur DOCTORS si MEDECINS absent/vide (sécurité).
function getDoctorsFromMedecins() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('MEDECINS');
  if (!sheet) throw new Error("Onglet MEDECINS introuvable — effectif indisponible, rien n'est publié.");
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    if (String(data[r][3]).trim().toUpperCase() !== 'O') continue; // ACTIF = O
    list.push({ id, name: String(data[r][1]).trim(), initials: String(data[r][2]).trim() });
  }
  if (!list.length) {
    throw new Error("Aucun MAR actif dans MEDECINS — effectif vide, rien n'est publié.");
  }
  return list;
}

// ── C2 : flags par médecin externalisés dans l'onglet MEDECINS ─────────
// Colonnes (après dect=8) : 9 date_debut, 10 date_fin, 11 no_garde,
// 12 only_18, 13 no_weekend, 14 rythme_2sur2, 15 souhait_plafond,
// 16 tp_jours_fixes. Lit MEDECINS une seule fois ; repli vide si absent.
// Jours tp_jours_fixes : LUN=1 MAR=2 MER=3 JEU=4 VEN=5 SAM=6 DIM=0.
let _medFlagsCache = null;
function getMedecinFlags() {
  if (_medFlagsCache !== null) return _medFlagsCache; // (C2-D3) lecture unique de MEDECINS
  const flags = {
    noGarde: new Set(), only18: new Set(), noWeekend: new Set(),
    rythme2sur2: new Set(), souhaitPlafond: new Set(),
    dateDebut: {}, dateFin: {}, tpJoursFixes: {},
  };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
  if (!sheet) return flags;
  const data = sheet.getDataRange().getValues();
  const JOUR_NUM = { LUN:1, MAR:2, MER:3, JEU:4, VEN:5, SAM:6, DIM:0 };
  const isO = v => String(v).trim().toUpperCase() === 'O';
  const toDate = v => {
    if (!v) return '';
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    return String(v).trim();
  };
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id) continue;
    if (isO(data[r][11])) flags.noGarde.add(id);
    if (isO(data[r][12])) flags.only18.add(id);
    if (isO(data[r][13])) flags.noWeekend.add(id);
    if (isO(data[r][14])) flags.rythme2sur2.add(id);
    if (isO(data[r][15])) flags.souhaitPlafond.add(id);
    const dd = toDate(data[r][9]);  if (dd) flags.dateDebut[id] = dd;
    const df = toDate(data[r][10]); if (df) flags.dateFin[id]   = df;
    const tp = String(data[r][16] || '').trim().toUpperCase();
    if (tp) {
      const jours = new Set();
      tp.split(/[,;\s]+/).forEach(tok => {
        const t = tok.trim();
        if (t && JOUR_NUM[t] !== undefined) jours.add(JOUR_NUM[t]);
      });
      if (jours.size) flags.tpJoursFixes[id] = jours;
    }
  }
  _medFlagsCache = flags;
  return flags;
}

// ── PAIRES À ÉVITER ────────────────────────────────────────────────────
/* Deux MAR qui ne doivent jamais se retrouver de garde LA MÊME NUIT : ni tous
   les deux de garde, ni l'un de garde et l'autre de 18h. Deux jours d'affilée
   restent autorisés : ce qui compte est qu'il y ait quelqu'un à la maison
   chaque nuit. Les dates de Noël / Jour de l'An sont exemptées (cf. le
   générateur) : le tour de Noël se joue sur la seule ancienneté.
   SOURCE : onglet CONFIG, ligne PAIRES_A_EVITER, valeur « ID1+ID2 » (plusieurs
   paires séparées par ';'). JAMAIS dans le code : le dépôt est public, et la
   raison d'être d'une paire relève de la vie privée des personnes.
   Absente de CONFIG → aucune contrainte, planning strictement identique à
   avant l'existence de ce mécanisme (vérifié sur 42 années simulées).
   Les échanges de gardes entre médecins ne sont PAS bloqués : si les deux
   acceptent, c'est leur choix. */
let _pairesEviteesCache = null;
function getPairesEvitees() {
  if (_pairesEviteesCache !== null) return _pairesEviteesCache;
  const m = {};
  const data = _configRows_();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() !== 'PAIRES_A_EVITER') continue;
    String(data[r][1] == null ? '' : data[r][1]).split(';').forEach(function (tok) {
      const p = String(tok).split('+').map(function (x) { return String(x).trim().toUpperCase(); })
                           .filter(function (x) { return !!x; });
      if (p.length !== 2 || p[0] === p[1]) return;
      (m[p[0]] || (m[p[0]] = new Set())).add(p[1]);
      (m[p[1]] || (m[p[1]] = new Set())).add(p[0]);
    });
  }
  _pairesEviteesCache = m;
  return m;
}
// Vrai si a et b ne doivent pas partager la même nuit. Symétrique par construction.
function estPaireEvitee(a, b) {
  if (!a || !b || a === b) return false;
  const m = getPairesEvitees();
  return !!(m[a] && m[a].has(b));
}

// ── CODES ABSENTS EN JOURNÉE ───────────────────────────────────────────
// G, G2 = de garde (absent du planning journalier)
// RG = repos de garde
// V = vacances, F = formation, CTP = CTP, R = récup samedi
// A = absent cycle TESSIER
// NB : I (indispo garde) → MAR PRÉSENT en journée dans son secteur
const ABSENT_CODES = new Set(['RG','V','F','CTP','CP','R','A','TP','CL']);
/* (05/08/2026) Codes rendant un PLACEMENT caduc — volontairement PLUS ÉTROIT
   qu'ABSENT_CODES, et identique à DISPO_ABSENT_CODES du module partagé
   (partage/dispo_jour.js) : le panneau propose les TP et les récups (R) en
   dernier recours, donc un placement qui les vise doit tenir. Toute
   modification ici doit être répercutée dans dispo_jour.js, et inversement. */
const CADUC_ABSENT_CODES = new Set(['RG','V','CP','F','CTP','A','CL']);
// (C2-D3) Les gates nominatives d'arrivée/départ ont été retirées — pilotées par
// date_debut/date_fin (MEDECINS), dans generatePlanningFromGardes + getMARsDispoJour.
// ── MAR HABILITÉS DVI (mardi matin uniquement) ─────────────────────────
/* (08/09/2026) Les trois noms vivaient ici, dans un depot public. Ils sont
   desormais dans CONFIG / DVI_HABILITES — identifiants MEDECINS separes par
   des virgules. Cle absente ou vide : personne n'est habilite, donc aucune
   pose de DVI n'est attribuee. Le defaut est FERME : mieux vaut une vacation
   non pourvue, que le comite voit, qu'une pose confiee a un MAR non habilite. */
function _dviHabilites_() {
  try {
    const rows = _configRows_();
    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][0]).trim() !== 'DVI_HABILITES') continue;
      return String(rows[r][1] == null ? '' : rows[r][1]).split(',')
        .map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean);
    }
  } catch (e) { /* classeur illisible : personne */ }
  return [];
}

// ── CS PAR JOUR (après-midi) ───────────────────────────────────────────
// Format : jour_semaine → [ [secteur_affilié, code_cs], ... ]
// Consultations : FALSE = créneaux vides par défaut, placés à la main par le comité
// (les placements comité passent par les overrides). TRUE = auto-affectation.
const GENERER_CONSULTATIONS = false;
const CS_RULES = {
  1: { am: [],                                      pm: [['VIS','CS-VIS'],['VIS','CS-VIS'],['END','CS-END'],['END','CS-END']] },
  2: { am: [['ORL','CS-ORL'],['MAT','CS-MAT']],     pm: [['VIS','CS-VIS'],['END','CS-END'],['ORT','CS-ORT']] },                       // ← CHOIX: 'MAT' ou 'VOLANT'
  3: { am: [['ORL','CS-ORL'],['VOLANT','CS-POLY']], pm: [['VIS','CS-VIS'],['END','CS-END'],['ORT','CS-ORT'],['CI','CS-INTER']] },
  4: { am: [['ORL','CS-ORL'],['MAT','CS-MAT']],     pm: [['VIS','CS-VIS'],['END','CS-END'],['END','CS-END'],['CI','CS-INTER']] },    // ← CHOIX: 'MAT' ou 'VOLANT'
  5: { am: [['ORT','CS-ORT'],['ORL','CS-ORL']],     pm: [] },
};

// ── LIRE L'ANNÉE ACTIVE ───────────────────────────────────────────────
function getActiveYear() {
  const data = _configRows_();   // memo : CONFIG lu une seule fois par execution
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === 'ANNEE_ACTIVE') {
      const year = parseInt(String(data[r][1]).trim());
      if (!isNaN(year)) return year;
    }
  }
  return 2026;
}

// ── PREMIER JOUR DE L'ANNÉE PLANNING ─────────────────────────────────
function getPremierJourPlanning(year) {
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const offset = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
  return new Date(year, 0, 1 + offset, 12, 0, 0);
}

/* ── ANNEE DE PLANNING D'UNE DATE (29/07/2026) ───────────────────────────
   L'annee d'une date n'est PAS ses 4 premiers chiffres. L'annee de planning
   2026 court du 05/01/2026 au 03/01/2027 : le 1er janvier 2027 appartient donc
   au planning 2026, ses gardes sont dans GARDES_2026 et dans planning_2026.json.
   Mesure du 29/07/2026 en rejouant 2025 a 2046 : 1 jour ouvre concerne au
   passage 2026→2027, mais 5 en 2028→2029, 4 en 2029→2030, 3 en 2030→2031.
   Chercher ces jours dans l'onglet de l'annee civile ne renvoie RIEN, donc
   « aucune absence », donc un faux « disponible » — exactement ce que l'ecran
   des consultations doit eviter.
   ⚠️ Toute lecture d'un GARDES_{Y} ou d'un planning_{Y}.json faite A PARTIR
   D'UNE DATE doit passer par ici, jamais par ds.slice(0,4).
   (N'est PAS valable pour les onglets LIBERAL_{Y}, ranges par annee CIVILE de
   la date de bloc — voir _libYearOf dans portail.gs.) */
function anneePlanning(dateISO) {
  const ds = String(dateISO || '').slice(0, 10);
  const y  = Number(ds.slice(0, 4));
  if (!y) return y;
  return (new Date(ds + 'T12:00:00') < getPremierJourPlanning(y)) ? y - 1 : y;
}

// ── SEMAINE ISO ───────────────────────────────────────────────────────
function getISOWeek(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  const tmp = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - ys) / 86400000) + 1) / 7);
}

// (C3) getISOWeekTran supprimé — alias inutile de getISOWeek.

// ── JOURS FÉRIÉS LOCAUX ───────────────────────────────────────────────
function getJoursFeries(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  const paques = new Date(year, month-1, day, 12, 0, 0);
  function addDays(date, days) {
    const d = new Date(date); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dateStr(m, d) {
    return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const feteDieu = addDays(paques, 60);
  // Report au lundi si le férié tombe un dimanche (loi n°798) :
  // 1er janv., 1er mai, Assomption, Toussaint, Fête du Prince,
  // Immaculée Conception (08/12) et Noël.
  // PAS la Sainte Dévote (27/01).
  function reporte(mo, da) {
    const dt = new Date(year, mo - 1, da, 12, 0, 0);
    if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }
  return new Set([
    reporte(1,1), dateStr(1,27), reporte(5,1), reporte(8,15),
    reporte(11,1), reporte(11,19), reporte(12,8), reporte(12,25),
    addDays(paques,1), addDays(paques,39), addDays(paques,50),
    feteDieu,
  ]);
}

// ── EN-TÊTES DE MOIS « ANTI-SCROLL » (GARDES / INDISPOS) ─────────────────
// Problème : un mois fusionné en un seul bloc n'affiche son libellé qu'à sa
// première colonne → dès qu'on scrolle horizontalement, l'en-tête paraît vide.
// Solution : fusion par TRANCHES hebdomadaires (coupure à chaque lundi et à
// chaque changement de mois) ; chaque tranche répète le NOM COMPLET du mois.
// ⚠️ Nom complet OBLIGATOIRE : reconstruireDatesHeaders() parse la ligne 1
// par inclusion du nom de mois — une abréviation casserait la lecture des dates.
// Deux teintes alternées par mois pour matérialiser les frontières au scroll.
// `jours` = [{month:1-12, dow:0-6}, …] dans l'ordre des colonnes (col 2 = jours[0]).
function ecrireEntetesMois(sheet, jours) {
  const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const T1 = '#C0392B', T2 = '#922B21';
  const chunks = [];
  let cs = 0;
  for (let i = 1; i <= jours.length; i++) {
    if (i === jours.length || jours[i].month !== jours[cs].month || jours[i].dow === 1) {
      chunks.push({ from: cs, to: i - 1, month: jours[cs].month });
      cs = i;
    }
  }
  // Libellés écrits en UN appel (le libellé au début de chaque tranche), puis fusions.
  const row1vals = new Array(jours.length).fill('');
  chunks.forEach(ch => { row1vals[ch.from] = MOIS_FR[ch.month - 1]; });
  sheet.getRange(1, 2, 1, jours.length).setValues([row1vals]);
  sheet.getRange(1, 2, 1, jours.length).setBackgrounds([jours.map(j => (j.month % 2 ? T1 : T2))]);
  chunks.forEach(ch => {
    const n = ch.to - ch.from + 1;
    if (n > 1) sheet.getRange(1, ch.from + 2, 1, n).merge();
  });
  sheet.getRange(1, 2, 1, jours.length)
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
}

// Reformate les en-têtes de mois d'un onglet EXISTANT (GARDES_{Y} / INDISPOS_{Y})
// sans toucher aux données. Garde-fou : le nombre de colonnes de jours doit
// correspondre exactement au calendrier de l'année, sinon reformatage annulé.
function reformatEntetesMois_(sheetName, year, labelA1) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) { Logger.log('⏭️ ' + sheetName + ' absent'); return '⏭️ ' + sheetName + ' absent'; }
  const start = getPremierJourPlanning(year);
  const end = new Date(getPremierJourPlanning(year + 1).getTime() - 86400000);
  const jours = [];
  for (const dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1))
    jours.push({ month: dt.getMonth() + 1, dow: dt.getDay() });
  if (sh.getLastColumn() - 1 !== jours.length) {
    const msg = '⚠️ ' + sheetName + ' : ' + (sh.getLastColumn() - 1) + ' colonnes de jours ≠ ' + jours.length + ' attendues — reformatage ANNULÉ';
    Logger.log(msg); return msg;
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).breakApart();
  sh.getRange(1, 1).setValue(labelA1).setFontWeight('bold').setBackground('#C0392B').setFontColor('#FFFFFF');
  ecrireEntetesMois(sh, jours);
  const msg = '✅ ' + sheetName + ' : en-têtes de mois reformatés (' + jours.length + ' jours)';
  Logger.log(msg); return msg;
}

// Lanceur manuel (éditeur Apps Script → Exécuter) : reformate l'année active
// et, s'ils existent déjà, les onglets de l'année suivante.
function reformatEntetesAnneeActive() {
  const Y = getActiveYear();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];
  out.push(reformatEntetesMois_('GARDES_' + Y, Y, 'MEDECIN'));
  out.push(reformatEntetesMois_('INDISPOS_' + Y, Y, 'MÉDECIN'));
  if (ss.getSheetByName('GARDES_' + (Y + 1)))   out.push(reformatEntetesMois_('GARDES_' + (Y + 1), Y + 1, 'MEDECIN'));
  if (ss.getSheetByName('INDISPOS_' + (Y + 1))) out.push(reformatEntetesMois_('INDISPOS_' + (Y + 1), Y + 1, 'MÉDECIN'));
  try { SpreadsheetApp.getUi().alert('Reformatage des en-têtes\n\n' + out.join('\n')); } catch (e) {}
}

// ── LIRE LES AFFECTATIONS SECTEUR ─────────────────────────────────────
function loadAffectations(yearArg) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = yearArg || getActiveYear();
  const DOCTORS = getDoctorsFromMedecins(); // C1 : effectif réel (MEDECINS) au lieu de la liste en dur
  const sheetName = `AFFECTATIONS_${year}`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Onglet ${sheetName} introuvable`);

  const data = sheet.getDataRange().getValues();
  const monthHeaders = data[0].slice(1);

  const MONTH_NAMES = ['JAN','FEV','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  const MONTH_MAP = {};
  for (let m = 1; m <= 12; m++) {
    const variants = [
      `${MONTH_NAMES[m-1]} ${year}`,
      `${MONTH_NAMES[m-1].toLowerCase()} ${year}`,
      `${MONTH_NAMES[m-1].charAt(0)+MONTH_NAMES[m-1].slice(1).toLowerCase()} ${year}`,
    ];
    variants.forEach(v => { MONTH_MAP[v] = m; });
  }
  MONTH_MAP[`SEPTEMBRE  ${year}`] = 9;
  MONTH_MAP[`OCTOBRE ${year}`] = 10;

  const getMonthNum = (hdr) => {
    if (!hdr) return null;
    if (hdr instanceof Date) return hdr.getMonth() + 1;
    return MONTH_MAP[String(hdr).trim()] || null;
  };

  const affectations = {};
  DOCTORS.forEach(d => { affectations[d.id] = {}; });

  for (let r = 1; r < data.length; r++) {
    const rawName = String(data[r][0] || '').trim().toUpperCase()
      .replace('DR ','').replace('PR ','').replace('  ',' ').trim();
    if (!rawName) continue;
    const doctor = DOCTORS.find(d =>
      d.name.toUpperCase().replace('DR ','').replace('PR ','').trim() === rawName ||
      d.id === rawName
    );
    if (!doctor) continue;
    monthHeaders.forEach((hdr, ci) => {
      const monthNum = getMonthNum(hdr);
      if (!monthNum) return;
      const secteur = String(data[r][ci+1] || '').trim().toUpperCase();
      if (secteur) affectations[doctor.id][monthNum] = secteur;
    });
  }

  return affectations;
}

// ── NORMALISER SECTEUR ────────────────────────────────────────────────
// (07/2026) Cette fonction ne connaissait QUE 9 codes en dur : tout autre code
// devenait 'VOLANT' **en silence**. Conséquence : un secteur créé dans l'onglet
// SECTEURS était affectable et coloré à l'écran, puis effacé à la publication.
// Elle accepte désormais TOUT code actif de l'onglet. Les alias historiques
// (VISCERAL→VIS…) restent gérés pour les anciennes saisies libres.
// Un code vraiment inconnu tombe toujours sur VOLANT — mais il est JOURNALISÉ.

// Alias hérités des saisies manuelles d'avant l'onglet SECTEURS.
const _AFF_ALIAS = {
  'VISC':'VIS','VISCERAL':'VIS',
  'ENDO':'END','ENDOSCOPIES':'END',
  'REANIMATION':'REA',
  'ORTH':'ORT','ORTHO':'ORT',
  'CARDIO/INTER':'CI','CARDIO':'CI',
  'RADIO/INTER':'RI',
  'MATER':'MAT','MATERNITE':'MAT',
};

// Codes AFFECTABLES au mois = secteurs de l'onglet SECTEURS qui sont ACTIFS **et
// qui portent un libellé dans la colonne AFF**, + VOLANT.
// La colonne AFF est le discriminant : elle donne le libellé de la vue Affectations.
// Un secteur SANS AFF n'est pas une affectation mensuelle — c'est le cas de DVI,
// qui est une VACATION du mardi matin réservée aux MAR habilités (CONFIG / DVI_HABILITES),
// posée directement par la génération et non via l'affectation du mois.
// Cache par exécution : getSecteurs() lit l'onglet, on ne le fait qu'une fois.
// Repli sur les 8 codes historiques si l'onglet est illisible → jamais bloquant.
var _AFF_CODES_CACHE = null;
function _affCodesValides_() {
  if (_AFF_CODES_CACHE) return _AFF_CODES_CACHE;
  var codes = {};
  try {
    (getSecteurs() || []).forEach(function (s) {
      if (s && s.actif && s.code && String(s.aff || '').trim()) {
        codes[String(s.code).trim().toUpperCase()] = true;
      }
    });
  } catch (e) { /* onglet illisible → repli ci-dessous */ }
  if (!Object.keys(codes).length) {
    ['VIS','REA','ORT','ORL','END','CI','RI','MAT'].forEach(function (c) { codes[c] = true; });
  }
  codes['VOLANT'] = true;   // pseudo-secteur, jamais dans l'onglet
  _AFF_CODES_CACHE = codes;
  return codes;
}

var _AFF_INCONNUS_VUS = {};   // pour ne journaliser qu'une fois par code
function normalizeAffectation(aff) {
  if (!aff) return 'VOLANT';
  var v = String(aff).trim().toUpperCase();
  if (_AFF_ALIAS[v]) v = _AFF_ALIAS[v];
  if (_affCodesValides_()[v]) return v;
  // Code inconnu : on retombe sur VOLANT (comportement inchangé) MAIS on le dit.
  if (!_AFF_INCONNUS_VUS[v]) {
    _AFF_INCONNUS_VUS[v] = true;
    var msg = 'normalizeAffectation — code secteur inconnu « ' + v + ' » → VOLANT. '
            + 'Ajouter ce code dans l\'onglet SECTEURS (ACTIF=O), ou corriger la saisie.';
    Logger.log('⚠️ ' + msg);
    try { logAction('⚠️ ' + msg); } catch (e) {}
  }
  return 'VOLANT';
}

// ── LIRE LES PLANNING OVERRIDES ───────────────────────────────────────
// Onglet PLANNING_OVERRIDES : DATE | MAR_ID | SECTEUR_MATIN | SECTEUR_AM | COMMENTAIRE
// Écrit par le comité via l'interface quand il comble une case flashante
function loadPlanningOverrides() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PLANNING_OVERRIDES');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const overrides = {};
  for (let r = 1; r < data.length; r++) {
    const raw = data[r][0];
    if (!raw) continue;
    const date = raw instanceof Date
      ? `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`
      : String(raw).trim();
    const docId  = String(data[r][1] || '').trim().toUpperCase();
    const matin  = String(data[r][2] || '').trim().toUpperCase();
    const aprem  = String(data[r][3] || '').trim().toUpperCase();
    if (!date || !docId) continue;
    if (!overrides[date]) overrides[date] = {};
    overrides[date][docId] = { morning: matin, afternoon: aprem, tag: String(data[r][4] || '').trim().toUpperCase() };
  }
  return overrides;
}

// (29/07/2026) VALIDATION DE SEMAINE : RETIREE DU SYSTEME.
// L'horizon glissant l'avait deja privee d'objet ; le 29/07 le reste a ete
// retire (action, verrou d'ecriture, branche onEdit, liste des onglets, doc).
// L'onglet SEMAINES_VALIDEES a ete supprime du classeur : plus une seule ligne
// de code ne le lit ni ne l'ecrit.

// ── CONSTRUIRE dateToCol DEPUIS L'ONGLET GARDES ───────────────────────
// Mappe date→colonne par POSITION : colonne 1 = premier lundi de l'année
// planning, +1 jour par colonne. Robuste aux en-têtes texte ("Janvier"…)
// que new Date() ne sait pas parser (cause du bug post-reconstruction).
// ── HISTORIQUE NOËL / JOUR DE L'AN (source unique : rotation ET banderole) ──
// Dernière année (< beforeYear) où chaque MAR a fait Noël/An. Fusionne :
//  - l'onglet HISTORIQUE (années archivées, colonne NOEL/AN) ;
//  - les onglets GARDES_{Y} encore présents (années générées mais PAS encore
//    archivées : ex. 2027 quand on prépare 2028 — l'assignation existe déjà
//    mais n'est pas dans HISTORIQUE).
// Corrige le décalage d'un an : sans ça, générer N ré-attribuerait Noël à la
// personne qui fait déjà Noël N-1. On ne compte QUE les années < beforeYear
// (sinon régénérer une année compterait sa propre assignation) et on garde la
// plus récente par MAR.
/* (01/09/2026) TOUTES les années où chacun a tenu Noël ou le Jour de l'An,
   pas seulement la dernière. Le staff a besoin de l'historique complet pour
   arbitrer ; le générateur, lui, ne veut que la plus récente.
   Une SEULE lecture des sources pour les deux besoins : getNoelHistory ne fait
   plus que prendre le maximum de ce que rend cette fonction. Deux parcours
   séparés auraient fini par diverger — c'est déjà arrivé sur la rotation des
   groupes, où serveur et écran tournaient en sens inverse.
   Rend { id: [années croissantes] }. */
function getNoelHistoryDetail(beforeYear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lim = Number(beforeYear) || Infinity;
  const detail = {};
  const add = (id, y) => {
    if (!id || !(y < lim) || !y) return;
    const l = detail[id] || (detail[id] = []);
    if (l.indexOf(y) < 0) l.push(y);
  };

  // 1) HISTORIQUE (années archivées)
  const h = ss.getSheetByName('HISTORIQUE');
  if (h) {
    const hd = h.getDataRange().getValues();
    const H = hd[0].map(x => String(x).trim());
    const cId = H.indexOf('ID'), cAn = H.indexOf('ANNEE'), cNa = H.indexOf('NOEL/AN');
    if (cId >= 0 && cAn >= 0 && cNa >= 0) {
      for (let r = 1; r < hd.length; r++) {
        const id = String(hd[r][cId]).trim(); if (!id) continue;
        if ((Number(hd[r][cNa]) || 0) <= 0) continue;
        add(id, Number(hd[r][cAn]) || 0);
      }
    }
  }

  // 2) Onglets GARDES_{Y} présents (années générées, pas encore archivées)
  ss.getSheets().forEach(sh => {
    const m = sh.getName().match(/^GARDES_(\d{4})$/);
    if (!m) return;
    const y = Number(m[1]);
    if (y >= lim) return;                       // on ne regarde que les années passées
    const data = sh.getDataRange().getValues();
    const dateToCol = buildDateToCol(data, y);
    const noelCols = [`${y}-12-24`, `${y}-12-25`, `${y}-12-31`, `${y + 1}-01-01`]
      .map(d => dateToCol[d]).filter(c => c != null);
    if (!noelCols.length) return;
    for (let r = 3; r < data.length; r++) {
      const id = String(data[r][0]).trim(); if (!id) continue;
      const did = noelCols.some(col => {
        const v = String(data[r][Number(col)] || '').trim().toUpperCase();
        return v === 'G' || v === 'G2';
      });
      if (did) add(id, y);
    }
  });

  Object.keys(detail).forEach(id => detail[id].sort((a, b) => a - b));
  return detail;
}

function getNoelHistory(beforeYear) {
  /* (01/09/2026) N'est plus qu'une vue de getNoelHistoryDetail : la dernière
     année de chacun. Le comportement rendu est identique à l'octet près, les
     appelants (générateur, éligibles) n'ont pas bougé. */
  const detail = getNoelHistoryDetail(beforeYear);
  const hist = {};
  Object.keys(detail).forEach(id => {
    if (detail[id].length) hist[id] = detail[id][detail[id].length - 1];
  });
  return hist;
}

function buildDateToCol(data, year) {
  const dateToCol = {};
  if (year) {
    const start = getPremierJourPlanning(year);
    for (let c = 1; c < data[0].length; c++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + (c - 1));
      const ds = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      dateToCol[ds] = c;
    }
    return dateToCol;
  }
  // Fallback historique (en-têtes Date) si year non fourni
  let currentYear = null, currentMonth = null;
  for (let c = 1; c < data[0].length; c++) {
    const cell = data[0][c];
    if (cell) {
      const dt = new Date(cell);
      if (!isNaN(dt)) { currentYear = dt.getFullYear(); currentMonth = dt.getMonth() + 1; }
    }
    const dayNum = data[2][c];
    if (!dayNum || !currentYear || !currentMonth) continue;
    dateToCol[`${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(Number(dayNum)).padStart(2,'0')}`] = c;
  }
  return dateToCol;
}
// ── (C3b) Reconstruction de dates depuis les en-têtes INDISPOS/GARDES ──
// Ligne 1 = mois/année ("Janvier 2026" texte ou Date), ligne 3 = numéros.
// dates[i] ↔ colonne i+1 (colonne 0 = libellés MAR) ; null si pas un jour valide.
function reconstruireDatesHeaders(data, yearFallback) {
  const MOIS_MAP = {
    'janvier':1,'février':2,'mars':3,'avril':4,'mai':5,'juin':6,
    'juillet':7,'août':8,'septembre':9,'octobre':10,'novembre':11,'décembre':12
  };
  const dates = [];
  let curY = yearFallback || null, curM = null;
  for (let c = 1; c < data[0].length; c++) {
    const cell = data[0][c];
    if (cell) {
      if (cell instanceof Date) { curY = cell.getFullYear(); curM = cell.getMonth() + 1; }
      else {
        const lower = String(cell).toLowerCase();
        const match = String(cell).match(/(\d{4})/);
        let moisLu = null;
        Object.entries(MOIS_MAP).forEach(([nom, num]) => { if (lower.includes(nom)) moisLu = num; });
        if (match) {
          curY = parseInt(match[1]);            // année écrite : elle fait foi
          if (moisLu) curM = moisLu;
        } else if (moisLu) {
          // (31/07/2026) FRONTIÈRE D'ANNÉE. Un onglet annuel court du 1er lundi de
          // janvier N jusqu'au dimanche précédant le 1er lundi de N+1 : il se termine
          // donc par une QUEUE de janvier N+1. Les libellés ne portent que le mois
          // (« Janvier »), sans année. Sans cette règle, ces colonnes étaient datées
          // en année N : les absences du 1er janvier N+1 devenaient INVISIBLES pour
          // le générateur (gardes attribuées à des MAR en congés, constaté sur la
          // première génération réelle 2027), et les vraies colonnes du 1er janvier N
          // étaient écrasées par elles.
          // Règle : si le mois RECULE, on a franchi le 31 décembre.
          if (curM !== null && moisLu < curM) curY = (curY || 0) + 1;
          curM = moisLu;
        }
      }
    }
    const dayNum = data[2][c];
    if (!dayNum || !curY || !curM) { dates.push(null); continue; }
    dates.push(`${curY}-${String(curM).padStart(2,'0')}-${String(Number(dayNum)).padStart(2,'0')}`);
  }
  return dates;
}
// ── GÉNÉRER LE PLANNING JSON ──────────────────────────────────────────
function generatePlanning(yearOverride) {
  const year = yearOverride || getActiveYear();
  const months = generatePlanningFromGardes(year);
  if (!months) return;

  // ── Mettre à jour CONFIG_TRANSITION ──────────────────────────────────
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
  if (gardesSheet) {
    const nextStart = getPremierJourPlanning(year + 1);
    const dernierJour = new Date(nextStart);
    dernierJour.setDate(dernierJour.getDate() - 1);
    const dernierJourStr = `${dernierJour.getFullYear()}-${String(dernierJour.getMonth()+1).padStart(2,'0')}-${String(dernierJour.getDate()).padStart(2,'0')}`;

    const gardesData = gardesSheet.getDataRange().getValues();
    const dateToCol = buildDateToCol(gardesData, year);
    const colIdx = dateToCol[dernierJourStr];
    let gardeG = '', gardeG2 = '';
    if (colIdx !== undefined) {
      for (let r = 3; r < gardesData.length; r++) {
        const id = String(gardesData[r][0]).trim();
        const val = String(gardesData[r][colIdx] || '').trim();
        if (val === 'G') gardeG = id;
        if (val === 'G2') gardeG2 = id;
      }
    }
    if (gardeG || gardeG2) {
      const transSheet = ss.getSheetByName('CONFIG_TRANSITION');
      if (transSheet) {
        const transData = transSheet.getDataRange().getValues();
        const nextYear = year + 1;
        let found = false;
        for (let r = 1; r < transData.length; r++) {
          if (Number(transData[r][0]) === nextYear) {
            transSheet.getRange(r + 1, 2).setValue(gardeG);
            transSheet.getRange(r + 1, 3).setValue(gardeG2);
            found = true; break;
          }
        }
        if (!found) transSheet.appendRow([nextYear, gardeG, gardeG2]);
      }
    }
  }

  // ── Snapshot d'équité figé à la génération (lu depuis STATS_GARDES) ──
  let equiteInitiale = null;
  try {
    const stSheet = ss.getSheetByName(`STATS_GARDES_${year}`);
    if (stSheet && stSheet.getLastRow() > 1) {
      const sd = stSheet.getDataRange().getValues();
      // colonnes : 0 MEDECIN · 2 TOTAL G · 5 LUN · 6 MAR · 7 MER · 8 JEU · 9 VEN · 10 SAM · 11 DIM · 14 JF · 15 VEILLE JF · 20 VD
      equiteInitiale = sd.slice(1).filter(r => r[0]).map(r => ({
        id: String(r[0]).trim(),
        total: Number(r[2]) || 0,
        lu: Number(r[5]) || 0, ma: Number(r[6]) || 0, me: Number(r[7]) || 0,
        je: Number(r[8]) || 0, ve: Number(r[9]) || 0, sa: Number(r[10]) || 0, di: Number(r[11]) || 0,
        vd: Number(r[20]) || 0, jf: Number(r[14]) || 0, vjf: Number(r[15]) || 0,
        cible: Number(r[1]) || 0, cSa: Number(r[17]) || 0, cJe: Number(r[18]) || 0, cVd: Number(r[19]) || 0, cVjf: Number(r[21]) || 0,
        cJf: Number(r[22]) || 0,   // (05/09/2026) 6e axe : jours fériés
      }));
    }
  } catch(e) { Logger.log('equiteInitiale: ' + e.message); }

  // ── Push planning_YYYY.json ──────────────────────────────────────────
  const monthsMin = months.map(m => Object.assign({}, m, {
    doctors: (m.doctors || []).map(d => Object.assign({}, d, {
      days: (d.days || []).map(e => {
        if (!e || typeof e !== 'object') return e;
        const o = {};
        for (const k in e) { const v = e[k]; if (v !== '' && v != null) o[k] = v; }
        return o;
      })
    }))
  }));
  const _planningJson = JSON.stringify({months: monthsMin, equiteInitiale});
  // (Étape 3 confidentialité) Le Drive privé est le stockage UNIQUE du
  // planning — plus aucune copie publique sur GitHub. Un échec Drive
  // bloque la publication avec un message clair (même logique que le 401).
  try { savePlanningToDrive(`planning_${year}.json`, _planningJson); }
  catch(e) { throw new Error(`Publication échouée : enregistrement Drive impossible pour planning_${year}.json (${e.message}).`); }
  // ── Affectations_YYYY.json (Drive) ────────────────────────────────────
  try {
    const affectations = loadAffectations(year);
    savePlanningToDrive(`affectations_${year}.json`, JSON.stringify({year, affectations}));
  } catch(e) {
    Logger.log(`⚠️ Drive affectations échoué : ${e.message}`);
    logAction(`⚠️ Drive affectations_${year}.json : ${e.message}`);
  }
}

// ── NOUVEAU MOTEUR PLANNING V2 ────────────────────────────────────────
// Principe : MAR présent (pas dans ABSENT_CODES) → dans son secteur AFFECTATIONS_YYYY
// Plus de règles auto complexes. Le comité comble les cases vides via l'interface.
function generatePlanningFromGardes(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`GARDES_${year}`);
  if (!sheet) { Logger.log(`❌ Onglet GARDES_${year} introuvable`); return null; }
  const DOCTORS = getDoctorsFromMedecins(); // C1 : effectif réel (MEDECINS) au lieu de la liste en dur
  const FLAGS = getMedecinFlags(); // (C2-D3) flags/dates externalisés (cache → lecture unique)

  const data = sheet.getDataRange().getValues();
  const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                   'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const JOURS_WD = ['D','L','M','M','J','V','S'];

  const startDate = getPremierJourPlanning(year);
  const nextStart = getPremierJourPlanning(year + 1);
  const endDate = new Date(nextStart);
  endDate.setDate(nextStart.getDate() - 1);

  const jfYear = getJoursFeries(year);
  const jfNextYear = getJoursFeries(year + 1);

  // ── Construire la liste de tous les jours ────────────────────────────
  const allDays = [];
  const dtLoop = new Date(startDate);
  while (dtLoop <= endDate) {
    const dow = dtLoop.getDay();
    const m = dtLoop.getMonth() + 1;
    const d = dtLoop.getDate();
    const y = dtLoop.getFullYear();
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    allDays.push({
      date: ds, day: d, weekday: JOURS_WD[dow], month: m, year: y, dow,
      isWeekend: dow === 0 || dow === 6,
      isFerie: jfYear.has(ds) || jfNextYear.has(ds),
    });
    dtLoop.setDate(dtLoop.getDate() + 1);
  }

  const dateToCol = buildDateToCol(data, year);

  // ── Lire les codes GARDES_YYYY par MAR ───────────────────────────────
  const doctorRows = {};
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (id) doctorRows[id] = data[r];
  }

  // ── Charger les données annexes ──────────────────────────────────────
  const affectations = loadAffectations(year);
  const planningOverrides = loadPlanningOverrides();

  // ── Grouper par mois ─────────────────────────────────────────────────
  const monthsSet = [];
  const seenMonths = new Set();
  allDays.forEach(d => {
    const key = `${d.year}-${d.month}`;
    if (!seenMonths.has(key)) { seenMonths.add(key); monthsSet.push({year: d.year, month: d.month}); }
  });

  const months = [];

  monthsSet.forEach(({year: y, month: m}) => {
    const monthDays = allDays.filter(d => d.year === y && d.month === m);

    // ── Codes GARDES pour ce mois ──────────────────────────────────────
    const gardesCodes = {}; // gardesCodes[marId][dayIndex] = code
    DOCTORS.forEach(doc => {
      gardesCodes[doc.id] = monthDays.map(day => {
        const colIdx = dateToCol[day.date];
        if (colIdx === undefined) return '';
        // (C2-D3) hors période d'activité (date_debut/date_fin) → ni présence ni rythme.
        // Empêche le 'A' du rythme 2/2 avant l'arrivée (ex. LC avant le 28/09) / après le départ.
        const _dd0 = FLAGS.dateDebut[doc.id], _df0 = FLAGS.dateFin[doc.id];
        if ((_dd0 && day.date < _dd0) || (_df0 && day.date >= _df0)) return '';
        let code = String(doctorRows[doc.id]?.[colIdx] || '').trim();
        // Rythme 2/2 généralisé : case vide en semaine "off" → A
        if (!code && estSemaineOff(doc.id, day.date)) code = 'A';
        // (C2-D3) jours fixes non travaillés (ex. jeudi/vendredi) → TP, lus depuis MEDECINS
        const _tp = FLAGS.tpJoursFixes[doc.id];
        if (!code && !day.isFerie && _tp && _tp.has(day.dow)) code = 'TP';
        return code;
      });
    });

    // ── Construire le planning journalier ─────────────────────────────
    const days = monthDays.map(d => ({
      date: d.date, day: d.day, weekday: d.weekday, dow: d.dow,
      isWeekend: d.isWeekend, isFerie: d.isFerie,
    }));

    // (05/08/2026) Placements devenus caducs (MAR absent) — recensés, jamais appliqués.
    const planningCaducs = [];

    // result[marId][dayIdx] = {status, morning, afternoon, cs}
    const result = {};
    DOCTORS.forEach(doc => {
      result[doc.id] = days.map(() => ({status:'', morning:'', afternoon:'', cs:''}));
    });

    days.forEach((day, dayIdx) => {
      const isJourOuvre = !day.isWeekend && !day.isFerie;
      const dow = day.dow;

      // ── 1. Statuts depuis GARDES_YYYY ──────────────────────────────
      DOCTORS.forEach(doc => {
        const code = gardesCodes[doc.id][dayIdx];
        result[doc.id][dayIdx].status = code;
      });

      // ── 2. Weekend / férié : gardes uniquement ─────────────────────
      if (!isJourOuvre) {
        DOCTORS.forEach(doc => {
          const st = result[doc.id][dayIdx].status;
          if (st === 'G') { result[doc.id][dayIdx].morning = 'REA'; result[doc.id][dayIdx].afternoon = 'REA'; }
          if (st === 'G2') { result[doc.id][dayIdx].morning = 'MAT'; result[doc.id][dayIdx].afternoon = 'MAT'; }
        });
        // Appliquer overrides weekend aussi
        const dayOv = planningOverrides[day.date] || {};
        Object.entries(dayOv).forEach(([docId, ov]) => {
          if (!DOCTORS.find(d => d.id === docId)) return;
          /* (05/08/2026) Même règle qu'en semaine (§4) : le statut prime.
             presentsPool n'est pas construit ici → critère identique appliqué
             directement (ABSENT_CODES + fenêtre d'activité). Les gardes G/G2
             posées juste au-dessus ne sont PAS dans ABSENT_CODES : un MAR de
             garde reste plaçable, comme avant. */
          const _stW = gardesCodes[docId] ? gardesCodes[docId][dayIdx] : '';
          const _ddW = FLAGS.dateDebut[docId], _dfW = FLAGS.dateFin[docId];
          if (CADUC_ABSENT_CODES.has(_stW) || (_ddW && day.date < _ddW) || (_dfW && day.date >= _dfW)) {
            planningCaducs.push({ date: day.date, marId: docId, statut: _stW || '(hors activité)' });
            return;
          }
          if (ov.morning)   result[docId][dayIdx].morning   = ov.morning;
          if (ov.afternoon) result[docId][dayIdx].afternoon = ov.afternoon;
        });
        return;
      }

      // ── 3. Jour ouvré : affectation secteur ────────────────────────
      // Déterminer qui est présent en journée
      // Absent = code dans ABSENT_CODES (G, G2, RG, V, F, CTP, R, A)
      // I = indispo garde MAIS présent en journée → inclus
      const presentsPool = DOCTORS.filter(doc => {
        const code = gardesCodes[doc.id][dayIdx];
        if (ABSENT_CODES.has(code)) return false;
        // (C2-D3) gates nominatives → génériques date_debut/date_fin (MEDECINS)
        const _dd = FLAGS.dateDebut[doc.id], _df = FLAGS.dateFin[doc.id];
        if (_dd && day.date < _dd) return false; // pas encore actif
        if (_df && day.date >= _df) return false; // n'est plus actif
        return true;
      });

      const getSecteur = (docId) => normalizeAffectation(affectations[docId]?.[m]);

      // ── 3a. Affecter chaque MAR présent à son secteur ──────────────
      presentsPool.forEach(doc => {
        const secteur = getSecteur(doc.id);
        result[doc.id][dayIdx].morning   = secteur;
        result[doc.id][dayIdx].afternoon = secteur;
      });
// ── 3a-bis. Secteur interventionnel, le JEUDI ────────────────────
      // MATIN  : le MAR affecté CI bascule en RI (jeudi = radio interventionnelle).
      // APRÈS-MIDI : il n'y a JAMAIS de bloc cardio le jeudi. Le code le laissait
      // pourtant en 'CI' « pour justifier la consult CS-INTER » — ce qui affichait
      // quelqu'un dans un bloc fermé (corrigé 07/2026). Il fait sa consultation,
      // il ne peut pas être au bloc en même temps : on vide le secteur de ce
      // demi-jour. Une valeur vide est ignorée au rendu → aucune ligne de bloc.
      if (dow === 4) {
        presentsPool.forEach(doc => {
          if (getSecteur(doc.id) !== 'CI') return;
          if (result[doc.id][dayIdx].morning === 'CI') {
            result[doc.id][dayIdx].morning = 'RI';
          }
          if (result[doc.id][dayIdx].afternoon === 'CI') {
            result[doc.id][dayIdx].afternoon = '';
          }
        });
      }
      // ── 3b. DVI (mardi matin uniquement) ──────────────────────────
      if (dow === 2) {
        const _dvi = _dviHabilites_();
        const dviDoc = presentsPool.find(doc => _dvi.includes(String(doc.id).toUpperCase()));
        if (dviDoc) {
          result[dviDoc.id][dayIdx].morning = 'DVI';
          // L'après-midi reste sur son secteur d'affectation
        }
      }
// ── 3b-bis + 3c. Auto-affectation des consultations ─────────────
      // DÉSACTIVÉE par défaut (GENERER_CONSULTATIONS=false) : le comité place chaque
      // MAR à la main sur des créneaux vides « à pourvoir ». Les placements comité
      // (dont la consult libérale endo, tag LIB) arrivent via les overrides (§4 ci-dessous).
      if (GENERER_CONSULTATIONS) {
      const csAmRules = (CS_RULES[dow] || {am: []}).am || [];
      const csAmUsed = new Set();
      csAmRules.forEach(([secteurAffil, csCode]) => {
        // MAR affilié à ce secteur, posté là le matin, pas déjà pris
        let candidate = presentsPool.find(doc =>
          !csAmUsed.has(doc.id) &&
          getSecteur(doc.id) === secteurAffil &&
          result[doc.id][dayIdx].morning === secteurAffil
        );
        // Fallback : un VOLANT
        if (!candidate) {
          candidate = presentsPool.find(doc =>
            !csAmUsed.has(doc.id) &&
            getSecteur(doc.id) === 'VOLANT' &&
            result[doc.id][dayIdx].morning === 'VOLANT'
          );
        }
        if (candidate) {
          result[candidate.id][dayIdx].morning = csCode;   // consult le matin
          result[candidate.id][dayIdx].cs = csCode;
          // afternoon reste = secteur d'affiliation (posé en 3a) → retour secteur
          csAmUsed.add(candidate.id);
        }
        // sinon → case flash matin (géré côté frontend)
      });
      // ── 3c. CS après-midi ─────────────────────────────────────────
      const csRules = (CS_RULES[dow] || {pm: []}).pm;
      csRules.forEach(([secteurAffil, csCode]) => {
        // Chercher un MAR présent affecté à ce secteur
        let candidate = presentsPool.find(doc =>
          !String(result[doc.id][dayIdx].morning || '').startsWith('CS-') &&
          getSecteur(doc.id) === secteurAffil &&
          result[doc.id][dayIdx].afternoon === secteurAffil
        );
        // Fallback : un VOLANT
        if (!candidate) {
          candidate = presentsPool.find(doc =>
            !String(result[doc.id][dayIdx].morning || '').startsWith('CS-') &&
            getSecteur(doc.id) === 'VOLANT' &&
            result[doc.id][dayIdx].afternoon === 'VOLANT'
          );
        }
        if (candidate) {
          result[candidate.id][dayIdx].afternoon = csCode;
          result[candidate.id][dayIdx].cs = csCode;
        }
        // Si pas de candidate → case flash (cs reste vide, géré côté frontend)
      });
      } // fin if (GENERER_CONSULTATIONS) — sinon consultations laissées vides

      // ── 3d. CS-ORL → désormais géré en 3b-bis (consultation du matin) ─

      // ── 4. Appliquer PLANNING_OVERRIDES (dernier layer) ────────────
      /* (05/08/2026) PLACEMENT CADUC. Constat de terrain : un placement du
         comité s'appliquait SANS JAMAIS consulter le statut du MAR — poser un
         TP (ou V, CL, A…) dans GARDES ne défaisait pas le placement, qui
         continuait d'afficher le MAR en secteur alors qu'il est absent. Seule
         issue : supprimer la ligne à la main dans PLANNING_OVERRIDES.
         Désormais le statut PRIME : un placement visant un MAR absent ce
         jour-là est ignoré et RECENSÉ (planningCaducs) — la ligne reste dans
         le classeur, elle redeviendra active si le statut est retiré. */
      const dayOv = planningOverrides[day.date] || {};
      Object.entries(dayOv).forEach(([docId, ov]) => {
        if (!DOCTORS.find(d => d.id === docId)) return;
        /* (05/08/2026, décision du service) Les critères sont ceux du PANNEAU
           de placement (dispo_jour), PAS ceux de presentsPool : un MAR en TP
           ou en récup (R) reste RÉQUISITIONNABLE en dernier recours — le
           panneau le propose, le placement doit donc tenir. Ne sont écartés
           que les vraies absences (congés, formation, RG, absence longue). */
        if (CADUC_ABSENT_CODES.has(gardesCodes[docId] ? gardesCodes[docId][dayIdx] : '')) {
          planningCaducs.push({ date: day.date, marId: docId,
                                statut: result[docId][dayIdx].status || '(hors activité)' });
          return;
        }
        if (ov.morning)   result[docId][dayIdx].morning   = ov.morning;
        if (ov.afternoon) result[docId][dayIdx].afternoon = ov.afternoon;
        if (ov.tag === 'LIB') result[docId][dayIdx].lib = true;   // consult libérale endo (affectation manuelle du comité)
      });
    });

    // ── Calculer les semaines et leur statut de validation ─────────────
    const weeksInMonth = [];
    const seenWeeks = new Set();
    days.forEach(day => {
      const w = getISOWeek(day.date);
      if (!seenWeeks.has(w)) {
        seenWeeks.add(w);
        weeksInMonth.push({ isoWeek: w });
      }
    });

    // (C2-D3) Exclure du mois publié les MAR dont [date_debut, date_fin] ne recouvre
    // pas (y,m). Reproduit les anciennes gates nominatives et gère tout arrivant/partant
    // (ex. une arrivante : plus de rythme 'A' affiché avant sa prise de fonctions).
    const _firstDay = `${y}-${String(m).padStart(2,'0')}-01`;
    const _lastDom  = new Date(y, m, 0).getDate();
    const _lastDay  = `${y}-${String(m).padStart(2,'0')}-${String(_lastDom).padStart(2,'0')}`;
    const _horsMois = (id) => {
      const dd = FLAGS.dateDebut[id], df = FLAGS.dateFin[id];
      if (df && df <= _firstDay) return true; // parti avant/au 1er du mois (date_fin = 1er jour absent)
      if (dd && dd >  _lastDay)  return true; // arrive après la fin du mois
      return false;
    };
    const doctors = DOCTORS
      .filter(doc => !_horsMois(doc.id))
      .map(doc => ({ id: doc.id, initials: doc.initials, days: result[doc.id] }));

    const label = y === year
      ? `${MOIS_FR[m-1]} ${year}`
      : `${MOIS_FR[m-1]} ${y}`;

    months.push({
      id: `${y}-${String(m).padStart(2,'0')}`,
      label, year: y, month: m,
      days, doctors,
      weeks: weeksInMonth,
    });

    Logger.log(`✅ ${label} généré (${weeksInMonth.length} semaines)`);
    /* (05/08/2026) Trace des placements caducs : le comité doit pouvoir
       comprendre pourquoi un MAR placé n'apparaît pas en secteur. Repris
       aussi par le diagnostic Maintenance.
       (24/08/2026) La mémoire du mois est réécrite À CHAQUE publication,
       même quand il n'y a plus aucun conflit : avant, un mois redevenu
       propre gardait ses vieilles entrées pour toujours et le Diagnostic
       ressortait des fantômes. */
    if (planningCaducs.length) {
      Logger.log(`⚠️ ${label} : ${planningCaducs.length} placement(s) ignoré(s) — MAR absent ce jour-là : ` +
        planningCaducs.slice(0, 8).map(x => `${x.marId} ${x.date} (${x.statut})`).join(', ') +
        (planningCaducs.length > 8 ? ` … et ${planningCaducs.length - 8} autre(s)` : ''));
    }
    try {
      const _p = PropertiesService.getScriptProperties();
      const _prec = JSON.parse(_p.getProperty('PLANNING_CADUCS') || '[]');
      _p.setProperty('PLANNING_CADUCS', JSON.stringify(_caducsFusionner_(_prec, label, planningCaducs)));
    } catch (e) { /* trace best-effort */ }
  });

  return months;
}

// ── STOCKAGE PRIVÉ DRIVE (Étape 1 confidentialité) ────────────────────
// Les JSON du planning sont aussi rangés dans un dossier Drive PRIVÉ
// ("Planning-Med-JSON") du compte planningmedic. À terme (étape 3), ce
// stockage remplacera la copie publique GitHub. Fichier écrasé à chaque
// publication (une seule version par nom).
const DRIVE_JSON_FOLDER = 'Planning-Med-JSON';

function _getDriveJsonFolder() {
  const it = DriveApp.getFoldersByName(DRIVE_JSON_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_JSON_FOLDER);
}

// Tous les fichiers de ce nom situés dans UN dossier nommé DRIVE_JSON_FOLDER
// (gère les doublons de dossier ET de fichier — Drive les autorise).
function _jsonFilesByName_(fileName) {
  const out = [];
  const it = DriveApp.getFilesByName(fileName);
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    const ps = f.getParents();
    let inFolder = false;
    while (ps.hasNext()) { if (ps.next().getName() === DRIVE_JSON_FOLDER) { inFolder = true; break; } }
    if (inFolder) out.push(f);
  }
  out.sort((a, b) => b.getLastUpdated() - a.getLastUpdated()); // plus récent d'abord
  return out;
}

function savePlanningToDrive(fileName, content) {
  const files = _jsonFilesByName_(fileName);
  if (files.length) {
    files[0].setContent(content);                              // met à jour le plus récent
    for (let i = 1; i < files.length; i++) files[i].setTrashed(true); // dédoublonne les anciens
  } else {
    _getDriveJsonFolder().createFile(fileName, content, 'application/json');
  }
  Logger.log(`✅ ${fileName} rangé dans Drive (${DRIVE_JSON_FOLDER}) — ${files.length} copie(s) préexistante(s)` + (files.length > 1 ? `, ${files.length - 1} ancienne(s) mise(s) à la corbeille` : ''));
}

function readPlanningFromDrive(fileName) {
  const files = _jsonFilesByName_(fileName);
  if (!files.length) return null;
  return files[0].getBlob().getDataAsString();               // lit toujours le plus récent
}

// ── DIAGNOSTIC : état des dossiers/fichiers JSON dans le Drive ──
// À lancer depuis l'éditeur Apps Script ; lire le journal (Ctrl+Entrée).
function diagDriveJson() {
  let nbFolders = 0;
  const fit = DriveApp.getFoldersByName(DRIVE_JSON_FOLDER);
  while (fit.hasNext()) { const f = fit.next(); nbFolders++; Logger.log(`📁 Dossier "${DRIVE_JSON_FOLDER}" #${nbFolders} — id=${f.getId()}`); }
  Logger.log(`→ ${nbFolders} dossier(s) nommé(s) "${DRIVE_JSON_FOLDER}"` + (nbFolders > 1 ? ' ⚠️ DOUBLON' : ''));
  ['planning_2026.json', 'planning_2027.json', 'affectations_2027.json'].forEach(name => {
    const files = _jsonFilesByName_(name);
    Logger.log(`\n📄 ${name} : ${files.length} copie(s)` + (files.length > 1 ? ' ⚠️ DOUBLON' : ''));
    files.forEach((f, i) => {
      let nbG = 0;
      try {
        const j = JSON.parse(f.getBlob().getDataAsString());
        (j.months || []).forEach(mo => (mo.doctors || []).forEach(d => (d.days || []).forEach(day => { if (day && (day.status === 'G' || day.status === 'G2')) nbG++; })));
      } catch (e) {}
      Logger.log(`   #${i} maj=${f.getLastUpdated().toISOString()} taille=${f.getSize()}o gardes=${nbG} id=${f.getId()}`);
    });
  });
}



// À exécuter UNE FOIS dans l'éditeur Apps Script après recopie :
// déclenche l'autorisation Drive + vérifie écriture/lecture.
function testDrivePlanning() {
  savePlanningToDrive('test_drive.json', JSON.stringify({ok: true, t: new Date().toISOString()}));
  const back = readPlanningFromDrive('test_drive.json');
  Logger.log('Lecture retour : ' + back);
  if (!back || JSON.parse(back).ok !== true) throw new Error('Test Drive ÉCHOUÉ');
  Logger.log('✅ Test Drive OK — autorisation accordée, écriture/lecture fonctionnelles');
}

// À exécuter UNE FOIS avant la suppression des JSON publics (étape 3b) :
// copie chaque planning_/affectations_ encore présent sur GitHub vers Drive.
// ── PUSH FICHIER GITHUB ───────────────────────────────────────────────
function pushFileToGitHub(fileName, content) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fileName}`;
  let sha = '';
  try {
    const getResp = UrlFetchApp.fetch(apiUrl, {
      headers: {Authorization: `token ${getGithubToken()}`},
      muteHttpExceptions: true,
    });
    if (getResp.getResponseCode() === 200) sha = JSON.parse(getResp.getContentText()).sha;
  } catch(e) {}

  const body = {
    message: `Update ${fileName} - ${new Date().toISOString()}`,
    content: Utilities.base64Encode(Utilities.newBlob(content).getBytes()),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const resp = UrlFetchApp.fetch(apiUrl, {
    method: 'PUT',
    headers: {Authorization: `token ${getGithubToken()}`, 'Content-Type': 'application/json'},
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code === 200 || code === 201) {
    Logger.log(`✅ ${fileName} mis à jour sur GitHub`);
    return { ok: true, code: code };
  }
  const errBody = resp.getContentText().slice(0, 300);
  Logger.log(`❌ GitHub error ${code} pour ${fileName}: ${errBody}`);
  logAction(`❌ Push échoué ${fileName}: ${errBody.slice(0, 100)}`);
  return { ok: false, code: code, body: errBody };
}

// Message clair (pour l'utilisateur) à partir d'un push GitHub raté.
// (Étape 3) pushToGitHub (rétrocompat) supprimé — aucun appelant.
// pushFileToGitHub est conservé : il sert encore à pousser les pages HTML.

// ── TRIGGERS ─────────────────────────────────────────────────────────
function onEdit(e) {
  const sheetName = e.source.getActiveSheet().getName();
  const year = getActiveYear();
  if (
    sheetName === `AFFECTATIONS_${year}` ||
    sheetName === `GARDES_${year}` ||
    sheetName === 'PLANNING_OVERRIDES'
  ) {
    // Republication auto silencieuse : on log l'échec sans bloquer l'édition de la
    // feuille (c'est le bouton « Publier » qui, lui, remonte les erreurs à l'écran).
    try { generatePlanning(); } catch (err) { Logger.log('onEdit republication échouée : ' + err.message); }
  }
}

// ── ÉCRIRE UN PLANNING OVERRIDE (appelé depuis admin.html via API) ────
// Quand le comité place un MAR dans une case flash
function savePlanningOverride(date, marId, morning, afternoon, comment) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PLANNING_OVERRIDES');
  if (!sheet) {
    sheet = ss.insertSheet('PLANNING_OVERRIDES');
    sheet.getRange(1,1,1,5).setValues([['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
    sheet.getRange(1,1,1,5).setFontWeight('bold');
    sheet.setColumnWidth(1,100); sheet.setColumnWidth(2,100);
    sheet.setColumnWidth(3,80); sheet.setColumnWidth(4,80); sheet.setColumnWidth(5,200);
  }
  // Un demi-jour vaut null OU '' → « non modifié » : on NE touche PAS cette colonne.
  // (Le frontend n'envoie jamais '' comme valeur réelle : un retrait envoie 'VOLANT'.)
  // Plus aucune recopie matin→après-midi : les deux demi-journées sont indépendants.
  const setM = (morning != null && morning !== '');
  const setA = (afternoon != null && afternoon !== '');
  // Verrou : évite que deux poses quasi simultanées créent DEUX lignes pour le même (date, MAR)
  // (cause des doublons type "ORT/REA" + "VOLANT/VOLANT" où la 2e écrasait la 1re à la lecture).
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) { Logger.log('savePlanningOverride : verrou indisponible, on continue'); }
  try {
    const data = sheet.getDataRange().getValues();
    // Toutes les lignes existantes pour ce (date, MAR)
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      const rawDate = data[r][0];
      const existDate = rawDate instanceof Date
        ? `${rawDate.getFullYear()}-${String(rawDate.getMonth()+1).padStart(2,'0')}-${String(rawDate.getDate()).padStart(2,'0')}`
        : String(rawDate).trim();
      if (existDate === date && String(data[r][1]).trim().toUpperCase() === marId.toUpperCase()) rows.push(r);
    }
    if (rows.length) {
      const keep = rows[0];                     // on met à jour la 1re ligne
      if (setM) sheet.getRange(keep+1, 3).setValue(morning);
      if (setA) sheet.getRange(keep+1, 4).setValue(afternoon);
      if (comment) sheet.getRange(keep+1, 5).setValue(comment);
      // Déduplication : supprimer les éventuelles lignes en trop (de la fin vers le début)
      for (let i = rows.length - 1; i >= 1; i--) sheet.deleteRow(rows[i] + 1);
      Logger.log(`✅ Override MAJ : ${marId} le ${date}${rows.length>1?` — ${rows.length-1} doublon(s) supprimé(s)`:''}`);
    } else {
      sheet.appendRow([date, marId.toUpperCase(), setM ? morning : '', setA ? afternoon : '', comment || '']);
      Logger.log(`✅ Override ajouté : ${marId} le ${date} → M:${setM?morning:'—'} A:${setA?afternoon:'—'}`);
    }
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ── ENREGISTRER PLUSIEURS OVERRIDES EN UNE EXÉCUTION (batch) ─────────
// (28/07/2026) Le comité place >20 MARs par session : un appel unitaire par clic
// saturait la Web App (mesure du 28/07 : bridage HTTP 404, 10 poses perdues sur 34,
// 3 à 44 s par appel). Un seul appel = un verrou, UNE lecture de l'onglet,
// toutes les lignes écrites d'un coup.
// Sémantique par demi-jour identique à l'unitaire : null ou '' = « ne pas toucher ».
// REJOUABLE sans risque : chaque ligne est visée par le couple (date, MAR) —
// renvoyer le même lot met à jour, ne duplique jamais.
function savePlanningOverridesBatch(items) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PLANNING_OVERRIDES');
  if (!sheet) {
    sheet = ss.insertSheet('PLANNING_OVERRIDES');
    sheet.getRange(1,1,1,5).setValues([['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
    sheet.getRange(1,1,1,5).setFontWeight('bold');
    sheet.setColumnWidth(1,100); sheet.setColumnWidth(2,100);
    sheet.setColumnWidth(3,80); sheet.setColumnWidth(4,80); sheet.setColumnWidth(5,200);
  }
  // 1. Fusionner les items par (date, MAR) : le comité peut poser le matin PUIS
  //    l'après-midi du même MAR dans la même rafale — le dernier passage gagne,
  //    demi-jour par demi-jour.
  const merged = {};   // 'date|MARID' → {date, marId, morning, afternoon, comment}
  const order = [];
  (items || []).forEach(function(it) {
    const date = String(it.date || '').trim();
    const marId = String(it.marId || '').trim().toUpperCase();
    if (!date || !marId) return;
    const key = date + '|' + marId;
    if (!merged[key]) { merged[key] = {date: date, marId: marId, morning: null, afternoon: null, comment: ''}; order.push(key); }
    if (it.morning != null && it.morning !== '') merged[key].morning = it.morning;
    if (it.afternoon != null && it.afternoon !== '') merged[key].afternoon = it.afternoon;
    if (it.comment) merged[key].comment = it.comment;
  });
  if (!order.length) return {saved: 0};

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) { Logger.log('savePlanningOverridesBatch : verrou indisponible, on continue'); }
  try {
    // 2. UNE lecture, index (date|MAR) → n° de lignes existantes
    //    (même normalisation des dates que l'unitaire : cellule Date ou texte)
    const data = sheet.getDataRange().getValues();
    const rowsByKey = {};
    for (let r = 1; r < data.length; r++) {
      const rawDate = data[r][0];
      const existDate = rawDate instanceof Date
        ? `${rawDate.getFullYear()}-${String(rawDate.getMonth()+1).padStart(2,'0')}-${String(rawDate.getDate()).padStart(2,'0')}`
        : String(rawDate).trim();
      const k = existDate + '|' + String(data[r][1]).trim().toUpperCase();
      (rowsByKey[k] = rowsByKey[k] || []).push(r);
    }
    // 3. Mises à jour des lignes existantes + collecte des ajouts et des doublons
    const toAppend = [];
    const toDelete = [];
    let updated = 0;
    order.forEach(function(key) {
      const it = merged[key];
      const rows = rowsByKey[key];
      const setM = (it.morning != null && it.morning !== '');
      const setA = (it.afternoon != null && it.afternoon !== '');
      if (rows && rows.length) {
        const keep = rows[0];
        if (setM) sheet.getRange(keep+1, 3).setValue(it.morning);
        if (setA) sheet.getRange(keep+1, 4).setValue(it.afternoon);
        if (it.comment) sheet.getRange(keep+1, 5).setValue(it.comment);
        for (let i = 1; i < rows.length; i++) toDelete.push(rows[i]);
        updated++;
      } else {
        toAppend.push([it.date, it.marId, setM ? it.morning : '', setA ? it.afternoon : '', it.comment || '']);
      }
    });
    // 4. Doublons : suppression APRÈS toutes les mises à jour, de la FIN vers le
    //    DÉBUT — une suppression ne décale que les lignes situées en dessous.
    toDelete.sort(function(a,b){ return b-a; }).forEach(function(r){ sheet.deleteRow(r+1); });
    // 5. Ajouts en un seul bloc
    if (toAppend.length) sheet.getRange(sheet.getLastRow()+1, 1, toAppend.length, 5).setValues(toAppend);
    Logger.log(`✅ Batch overrides : ${updated} mise(s) à jour, ${toAppend.length} ajout(s), ${toDelete.length} doublon(s) supprimé(s)`);
    return {saved: updated + toAppend.length};
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// ── SUPPRIMER UN PLANNING OVERRIDE ───────────────────────────────────
function testSetDailyStatus() {
  const year = 2026, marId = 'DURAND', date = '2026-10-13';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = ss.getSheetByName(`GARDES_${year}`).getDataRange().getValues();
  const col = buildDateToCol(data, year)[date];
  let row = -1;
  for (let r = 3; r < data.length; r++) if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
  Logger.log(`${marId} ${date} → row=${row} col=${col} valeur="${(row>=0&&col!==undefined)?data[row][col]:'INTROUVABLE'}"`);
}


// ═════════════════════════════════════════════════════════════════════
// SAUVEGARDE AUTOMATIQUE DU CLASSEUR (assurance-vie du système)
// Copie hebdomadaire du Google Sheet maître dans un dossier Drive dédié,
// avec rotation (8 copies conservées ≈ 2 mois d'historique).
// Installation (une seule fois) : exécuter installBackupTrigger() ci-dessous.
// ═════════════════════════════════════════════════════════════════════
const BACKUP_FOLDER_NAME = 'Planning-Med-Backups';
const BACKUP_KEEP = 8;

function backupHebdo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
  const stamp = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  const name = 'Backup ' + stamp + ' — ' + ss.getName();
  DriveApp.getFileById(ss.getId()).makeCopy(name, folder);

  // Rotation : ne garder que les BACKUP_KEEP copies les plus récentes
  const files = [];
  const fit = folder.getFiles();
  while (fit.hasNext()) { const f = fit.next(); if (f.getName().indexOf('Backup ') === 0) files.push(f); }
  files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  const purged = files.slice(BACKUP_KEEP);
  purged.forEach(f => f.setTrashed(true));

  const msg = `backupHebdo — ${name}` + (purged.length ? ` (${purged.length} ancienne(s) copie(s) purgée(s))` : '');
  Logger.log(msg);
  try { logAction(msg); } catch (e) {}
}

function installBackupTrigger() {
  // Idempotent : supprime les déclencheurs existants puis (ré)installe — lundi ~4 h.
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'backupHebdo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupHebdo').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  Logger.log('✅ Déclencheur backupHebdo installé (lundi ~4 h, rotation ' + BACKUP_KEEP + ' copies)');
}

// ══════════════════════════════════════════════════════════════════════
// NOTIFICATIONS DE CHANGEMENT DE PLANNING
// ══════════════════════════════════════════════════════════════════════
// Principe : on ne surveille PAS les gestes du comité, on compare deux états.
//   - planning_{année}.json          → l'état courant (écrit par generatePlanning)
//   - planning_{année}_notifie.json  → l'état au dernier envoi (écrit ici seulement)
// Un changement posé puis annulé avant l'envoi ne produit donc aucun mail.
//
// Déclenchement : chaque publication arme un minuteur de NOTIF_DELAI_MIN minutes
// et annule le précédent. Les mails ne partent qu'après une accalmie complète.
//
// Ce module ne touche AUCUN chemin d'écriture du planning. S'il échoue, la
// publication reste valide : notifPlanifier() est appelée dans un try/catch.
// ──────────────────────────────────────────────────────────────────────

const NOTIF_DELAI_MIN   = 10;                  // accalmie avant envoi
const NOTIF_PROP_ACTIVE = 'NOTIF_ACTIVE';      // 'O' = système allumé
const NOTIF_PROP_TEST   = 'NOTIF_EMAIL_TEST';  // si renseignée : tout part là
const NOTIF_PROP_YEAR   = 'NOTIF_YEAR';
const NOTIF_SITE        = 'https://planningmedic.github.io/dashboard.html';

// Codes du classeur → français lisible. Un code absent d'ici est traité comme
// un secteur (bloc, consultation…) et non comme un statut.
const NOTIF_STATUTS = {
  'G':   'garde réanimation',
  'G2':  'garde maternité',
  'RG':  'repos de garde',
  'R':   'récupération de samedi',
  '18':  '18h',
  'V':   'vacances',
  'VAC': 'vacances',
  'F':   'formation',
  'FORM':'formation',
  'TP':  'jour de temps partiel',
  'CTP': 'jour de temps partiel',
  'CL':  'congé long',
  'CP':  'congé paternité',
  'A':   'absence',
};

// (28/08/2026) Statuts sous lesquels le MAR travaille QUAND MEME en secteur.
// Pour eux, le secteur fait partie de l'information : une astreinte 18h passee
// de volant a reanimation est un vrai changement. Sans cette table, le mail
// affichait « 18h » des deux cotes de la carte et n'apprenait rien.
// Une garde n'y figure pas : son secteur est deduit (REA / MAT), le repeter
// donnerait « garde reanimation - Reanimation ».
const NOTIF_STATUT_AVEC_SECTEUR = { '18': true };

const NOTIF_JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const NOTIF_MOIS  = ['janvier','février','mars','avril','mai','juin',
                     'juillet','août','septembre','octobre','novembre','décembre'];

// ── Armer / réarmer le minuteur ───────────────────────────────────────
// Appelée après chaque publication. Supprime le minuteur en attente et en
// repose un neuf : tant que le comité publie, rien ne part.
/* (25/08/2026) La propriété ne portait qu'UNE année et l'écrasait à chaque appel :
   publier 2027 faisait oublier les changements de 2026 encore en attente. Leur photo
   n'étant recalée qu'après un envoi réussi, ils s'accumulaient et repartaient tous
   d'un coup à la publication suivante de CETTE année-là — 25 changements et 13 mails
   d'un seul coup le 25/08, pour des modifications remontant au 21.
   La propriété porte désormais une FILE d'années ; notifEnvoyer les traite toutes. */
function notifPlanifier(year) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifEnvoyer') ScriptApp.deleteTrigger(t);
  });
  const props = PropertiesService.getScriptProperties();
  const y = Number(year || getActiveYear());
  const file = _notifFileAnnees_(props);
  if (file.indexOf(y) < 0) file.push(y);
  props.setProperty(NOTIF_PROP_YEAR, JSON.stringify(file));
  ScriptApp.newTrigger('notifEnvoyer')
    .timeBased().after(NOTIF_DELAI_MIN * 60 * 1000).create();
}

/* Lit la file d'années en attente. Accepte l'ancien format (une année seule, ex.
   « 2027 ») pour ne rien perdre au moment de la bascule. */
function _notifFileAnnees_(props) {
  const brut = String(props.getProperty(NOTIF_PROP_YEAR) || '').trim();
  if (!brut) return [];
  try {
    const v = JSON.parse(brut);
    if (Array.isArray(v)) return v.map(Number).filter(function (x) { return x > 0; });
    if (Number(v) > 0) return [Number(v)];
  } catch (e) {
    if (Number(brut) > 0) return [Number(brut)];   // ancien format
  }
  return [];
}

// ── Recaler la photo de référence sans rien envoyer ───────────────────
// À utiliser après une génération annuelle ou le wizard : envoyerRecapGardes
// fait déjà le travail, le notifieur doit se taire.
function notifRecaler(year) {
  const y = year || getActiveYear();
  const courant = readPlanningFromDrive('planning_' + y + '.json');
  if (!courant) { Logger.log('notifRecaler : planning_' + y + '.json introuvable'); return; }
  savePlanningToDrive('planning_' + y + '_notifie.json', courant);
  logAction('notifRecaler ' + y + ' — photo de référence remise à jour, aucun envoi');
}

// ── Envoi (cible du minuteur) ─────────────────────────────────────────
function notifEnvoyer() {
  // Le minuteur est à usage unique : il se supprime lui-même.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifEnvoyer') ScriptApp.deleteTrigger(t);
  });

  const props = PropertiesService.getScriptProperties();
  const actif = String(props.getProperty(NOTIF_PROP_ACTIVE) || '').trim().toUpperCase() === 'O';

  /* Toutes les années en attente sont traitées, pas seulement la dernière publiée.
     La file est vidée d'entrée : si une année échoue, sa photo n'est pas recalée et
     ses changements repartiront à la prochaine publication — jamais perdus. */
  const file = _notifFileAnnees_(props);
  props.deleteProperty(NOTIF_PROP_YEAR);
  const annees = file.length ? file : [getActiveYear()];
  annees.forEach(function (an) { _notifEnvoyerAnnee_(an, actif); });
}

function _notifEnvoyerAnnee_(year, actif) {

  const refName = 'planning_' + year + '_notifie.json';
  const courantRaw = readPlanningFromDrive('planning_' + year + '.json');
  if (!courantRaw) { logAction('notifEnvoyer — planning_' + year + '.json introuvable, abandon'); return; }
  const refRaw = readPlanningFromDrive(refName);

  // Système éteint, ou toute première exécution : on prend la photo, on se tait.
  if (!actif || !refRaw) {
    savePlanningToDrive(refName, courantRaw);
    logAction('notifEnvoyer ' + year + ' — ' +
      (actif ? 'première exécution' : 'système éteint') + ', photo prise, aucun envoi');
    return;
  }

  let avant, apres;
  try {
    avant = _notifAplatir(JSON.parse(refRaw));
    apres = _notifAplatir(JSON.parse(courantRaw));
  } catch (e) {
    logAction('notifEnvoyer — JSON illisible (' + e.message + '), abandon SANS recalage');
    return;
  }

  const parMar = _notifDiff(avant, apres);
  const fenetre = _notifSemaineExcel();

  // Filtre : un statut se signale toujours ; un secteur seulement s'il tombe
  // dans la semaine que le dernier Excel couvrait.
  const retenus = {};
  let nbChang = 0;
  Object.keys(parMar).forEach(function (id) {
    const gardes = parMar[id].filter(function (c) {
      if (c.statut) return true;
      return c.date >= fenetre.debut && c.date <= fenetre.fin;
    });
    if (gardes.length) { retenus[id] = gardes; nbChang += gardes.length; }
  });

  if (!Object.keys(retenus).length) {
    savePlanningToDrive(refName, courantRaw);
    logAction('notifEnvoyer ' + year + ' — aucun changement à signaler');
    return;
  }

  const envoi = _notifExpedier(retenus, year);

  // La photo n'est mise à jour QUE si l'envoi s'est déroulé sans erreur : sinon
  // les changements non annoncés seront repris à la publication suivante.
  if (!envoi.errors.length) savePlanningToDrive(refName, courantRaw);
  else {
    // (25/08/2026) L'année revient dans la file : sans cela, un échec d'envoi la
    // faisait sortir de la file (vidée en début de passe) et ses changements
    // n'auraient été repris qu'à la prochaine publication de cette année précise.
    try {
      const _p = PropertiesService.getScriptProperties();
      const _f = _notifFileAnnees_(_p);
      if (_f.indexOf(year) < 0) _f.push(year);
      _p.setProperty(NOTIF_PROP_YEAR, JSON.stringify(_f));
    } catch (e) { /* la photo non recalée suffit à ne rien perdre */ }
  }

  logAction('notifEnvoyer ' + year + ' — ' + nbChang + ' changement(s), ' +
    envoi.sent + ' mail(s), ' + envoi.skipped + ' sans email, ' +
    envoi.errors.length + ' erreur(s)' +
    (envoi.errors.length ? ' → photo NON recalée' : ''));
}

// ── Aplatir le JSON en table { marId: { date: 'statut|matin|aprem' } } ──
// months[i].days[j].date donne la date de doctors[k].days[j] (même index).
// Les valeurs vides sont retirées du JSON publié : d'où les `|| ''`.
function _notifAplatir(json) {
  const out = {};
  (json.months || []).forEach(function (mois) {
    const dates = (mois.days || []).map(function (d) { return d.date; });
    (mois.doctors || []).forEach(function (doc) {
      if (!doc || !doc.id) return;
      if (!out[doc.id]) out[doc.id] = {};
      (doc.days || []).forEach(function (e, i) {
        const date = dates[i];
        if (!date) return;
        const o = e || {};
        out[doc.id][date] = (o.status || '') + '|' + (o.morning || '') + '|' + (o.afternoon || '');
      });
    });
  });
  return out;
}

// ── Comparer deux tables aplaties ─────────────────────────────────────
function _notifDiff(avant, apres) {
  const parMar = {};
  Object.keys(apres).forEach(function (id) {
    const a = avant[id] || {}, b = apres[id];
    Object.keys(b).forEach(function (date) {
      const va = a[date], vb = b[date];
      if (va === undefined || va === vb) return;   // inconnu avant, ou identique
      const ca = va.split('|'), cb = vb.split('|');
      const statutChange = ca[0] !== cb[0];
      // (28/08/2026) Rien de visible a dire : meme libelle de statut ET meme
      // secteur des deux cotes. Cela arrive quand deux codes partagent un
      // libelle (V/VAC, F/FORM, TP/CTP). Annoncer « vacances — avant :
      // vacances » n'apprend rien et fait douter de tout le mail.
      if (_notifDecrire(ca) === _notifDecrire(cb) && ca[1] === cb[1] && ca[2] === cb[2]) return;
      if (!parMar[id]) parMar[id] = [];
      parMar[id].push({
        date: date,
        statut: statutChange,
        avant: _notifDecrire(ca),
        apres: _notifDecrire(cb),
        codesAvant: ca,   // conserves pour l'affichage en carte (libelles en clair)
        codesApres: cb,
      });
    });
    if (parMar[id]) parMar[id].sort(function (x, y) { return x.date < y.date ? -1 : 1; });
  });
  return parMar;
}

// ── Décrire une journée en français ───────────────────────────────────
// LIB traduit un code secteur/consultation en libellé lisible ; absent, on garde
// le code brut (jamais d'invention). Voir _notifLibelles().
function _notifSecteurTxt(c, LIB) {
  LIB = LIB || function (x) { return x; };
  const am = String(c[1] || '').trim(), pm = String(c[2] || '').trim();
  if (!am && !pm) return '';
  if (am === pm) return LIB(am);
  return (am ? LIB(am) : '—') + ' le matin, ' + (pm ? LIB(pm) : '—') + ' l\'après-midi';
}

function _notifDecrire(c, LIB) {
  const statut = String(c[0] || '').trim();
  if (statut) {
    const base = NOTIF_STATUTS[statut] || statut;  // code inconnu : brut, pas d'invention
    if (NOTIF_STATUT_AVEC_SECTEUR[statut]) {
      const sect = _notifSecteurTxt(c, LIB);
      if (sect) return base + ' — ' + sect;
    }
    return base;
  }
  const sect = _notifSecteurTxt(c, LIB);
  return sect || 'rien';
}

// Découpe pour l'affichage en carte : une ligne par demi-journée quand elles
// diffèrent, sinon une seule ligne « Journée ».
function _notifLignes(c, LIB) {
  LIB = LIB || function (x) { return x; };
  const statut = String(c[0] || '').trim();
  if (statut) return [{ label: 'Journée', valeur: _notifDecrire(c, LIB) }];
  const am = String(c[1] || '').trim(), pm = String(c[2] || '').trim();
  if (!am && !pm) return [{ label: 'Journée', valeur: 'rien' }];
  if (am === pm)  return [{ label: 'Journée', valeur: LIB(am) }];
  return [{ label: 'Matin',       valeur: am ? LIB(am) : '—' },
          { label: 'Après-midi',  valeur: pm ? LIB(pm) : '—' }];
}

// Table code → libellé, construite UNE fois par envoi. getSecteurs() et
// getCsTemplate() passent par le cache de configuration : aucune lecture de
// feuille supplémentaire dans le cas courant. Config illisible → codes bruts.
function _notifLibelles() {
  const map = { 'VOLANT': 'volant' };
  try {
    (getSecteurs() || []).forEach(function (x) {
      if (x && x.code && x.label) map[String(x.code).trim().toUpperCase()] = x.label;
    });
    const cs = getCsTemplate();
    (((cs || {}).types) || []).forEach(function (t) {
      if (t && t.code && t.label) map[String(t.code).trim().toUpperCase()] = t.label;
    });
  } catch (e) { logAction('notif — libellés secteurs illisibles (' + e.message + '), codes bruts'); }
  return function (code) {
    const k = String(code || '').trim().toUpperCase();
    return map[k] || String(code || '').trim();
  };
}

// Morceaux de date pour la pastille façon agenda.
function _notifDatePieces(iso) {
  const d = new Date(iso + 'T12:00:00'), dow = d.getDay();
  return {
    jour: NOTIF_JOURS[dow].slice(0, 3),
    num:  d.getDate(),
    mois: NOTIF_MOIS[d.getMonth()].slice(0, 4) + '.',
    we:   (dow === 0 || dow === 6),
  };
}

function _notifJourMois(iso) {
  const d = new Date(iso + 'T12:00:00');
  return (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + NOTIF_MOIS[d.getMonth()];
}

// ── Semaine couverte par le dernier Excel ─────────────────────────────
// L'Excel part le vendredi vers 16 h et couvre la semaine SUIVANTE
// (lundi → dimanche). On remonte au dernier vendredi 16 h révolu.
function _notifSemaineExcel(maintenant) {
  const now = maintenant || new Date();
  const v = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0);
  // Reculer jusqu'au vendredi 16 h le plus récent déjà passé.
  while (v.getDay() !== 5 || v > now) v.setDate(v.getDate() - 1);
  // (01/08/2026) La fenetre court d'un Excel a l'autre, pas sur la seule semaine
  // affichee. Envoi le vendredi V : l'Excel couvre lundi V+3 -> dimanche V+9, mais
  // le samedi V+1 et le dimanche V+2 appartiennent encore a l'Excel PRECEDENT, donc
  // ils sont diffuses eux aussi. On part donc du vendredi et on va jusqu'au dimanche
  // de la semaine couverte. Elargissement pur : aucune date n'est retiree.
  const debut = new Date(v);                                       // le vendredi de l'envoi
  const fin   = new Date(v); fin.setDate(fin.getDate() + 9);       // dimanche de la semaine couverte
  return { debut: _notifISO(debut), fin: _notifISO(fin) };
}

function _notifISO(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── Expédition ────────────────────────────────────────────────────────
function _notifExpedier(retenus, year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const med = ss.getSheetByName('MEDECINS');
  if (!med) return { sent: 0, skipped: 0, errors: ['Onglet MEDECINS introuvable'] };
  const data = med.getDataRange().getValues();

  // Colonne NOTIF cherchée par son nom : si elle n'existe pas encore, tout le
  // monde est notifié (pas d'index en dur, la feuille peut bouger).
  const entete = (data[0] || []).map(function (h) { return String(h).trim().toUpperCase(); });
  const colNotif = entete.indexOf('NOTIF');

  const testMail = String(
    PropertiesService.getScriptProperties().getProperty(NOTIF_PROP_TEST) || ''
  ).trim();

  const destinataires = [];
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (!id || !retenus[id]) continue;
    if (String(data[r][3]).trim().toUpperCase() !== 'O') continue;           // inactif
    if (colNotif >= 0 && String(data[r][colNotif]).trim().toUpperCase() === 'N') continue;
    destinataires.push({
      id: id,
      nom: String(data[r][1]).trim(),
      email: testMail || String(data[r][7]).trim(),
    });
  }

  const besoin = destinataires.filter(function (d) { return d.email; }).length;
  const quota = MailApp.getRemainingDailyQuota();
  if (quota < besoin) {
    return { sent: 0, skipped: 0,
      errors: ['Quota email insuffisant : ' + quota + ' restants pour ' + besoin + ' destinataires'] };
  }

  // (28/08/2026) Table code → libellé construite une seule fois pour tout l'envoi.
  const LIB = _notifLibelles();

  let sent = 0, skipped = 0;
  const errors = [];
  destinataires.forEach(function (d) {
    if (!d.email) { skipped++; return; }
    const chgs = retenus[d.id];
    try {
      MailApp.sendEmail({
        to: d.email,
        subject: _notifSujet(chgs),
        htmlBody: _notifHtml(d.nom, chgs, year, LIB),
        body: _notifTexte(d.nom, chgs, LIB),
      });
      sent++;
    } catch (err) { errors.push(d.nom + ' : ' + err.message); }
  });
  return { sent: sent, skipped: skipped, errors: errors };
}

// ── Objet du mail : c'est lui qui s'affiche en notification ───────────
function _notifSujet(chgs) {
  if (chgs.length === 1) return 'Votre planning a changé — ' + _notifDateCourte(chgs[0].date);
  return 'Votre planning a changé — ' + chgs.length + ' modifications';
}

function _notifDateCourte(iso) {
  const d = new Date(iso + 'T12:00:00');
  return NOTIF_JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + NOTIF_MOIS[d.getMonth()];
}

// ── Corps texte (repli des clients sans HTML) ─────────────────────────
function _notifTexte(nom, chgs, LIB) {
  let t = 'Bonjour ' + nom + ',\n\nVotre planning a changé :\n\n';
  chgs.forEach(function (c) {
    const ap = c.codesApres ? _notifDecrire(c.codesApres, LIB) : c.apres;
    const av = c.codesAvant ? _notifDecrire(c.codesAvant, LIB) : c.avant;
    t += '  ' + _notifDateCourte(c.date) + ' : ' + ap + ' (avant : ' + av + ')\n';
  });
  t += '\nVous n\'aviez rien demandé, ou ce changement vous pose problème ?\n' +
       'Écrivez à planningmedic@gmail.com\n\n' +
       'Voir votre planning : ' + NOTIF_SITE + '\n\n' +
       'Le Comité Planning — Planning-Med\n';
  return t;
}

// ── Corps HTML ────────────────────────────────────────────────────────
function _notifHtml(nom, chgs, year, LIB) {
  /* (28/08/2026) Carte « agenda » : pastille de date à gauche, matin et
     après-midi sur deux lignes, libellés en clair. Tout en <table> avec des
     styles en ligne : c'est la seule mise en page que Gmail, Outlook et Mail
     iOS rendent pareil. Ni flex, ni grid, ni feuille de style. */
  const ROUGE = '#CE1126', ENCRE = '#0f172a', GRIS = '#64748b', PALE = '#b0bac6';
  const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  let cartes = '';
  chgs.forEach(function (c) {
    const p = _notifDatePieces(c.date);
    const acc  = p.we ? '#c2410c' : ROUGE;
    const past = p.we ? '#fff7ed' : '#fef2f4';
    const lignes = _notifLignes(c.codesApres || ['', '', ''], LIB);
    const avant  = c.codesAvant ? _notifDecrire(c.codesAvant, LIB) : c.avant;

    let corps = '';
    lignes.forEach(function (l) {
      corps +=
        '<tr><td style="padding:0 0 3px;font-size:11px;font-weight:700;color:' + PALE +
        ';text-transform:uppercase;letter-spacing:.4px;width:82px;vertical-align:top">' + l.label + '</td>' +
        '<td style="padding:0 0 3px;font-size:14px;font-weight:700;color:' + ENCRE + '">' + l.valeur + '</td></tr>';
    });
    const tagWe = p.we
      ? '<div style="font-size:10px;font-weight:800;color:#c2410c;text-transform:uppercase;' +
        'letter-spacing:.5px;margin-bottom:4px">Week-end</div>'
      : '';

    cartes +=
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="border-collapse:separate;border-spacing:0;margin-bottom:10px;background:#fff;' +
      'border:1px solid #e8edf3;border-radius:14px"><tr>' +
        '<td width="66" style="padding:14px 0 14px 14px;vertical-align:top">' +
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="52" ' +
          'style="background:' + past + ';border-radius:10px">' +
            '<tr><td align="center" style="padding:8px 0 3px;font-size:10px;font-weight:800;color:' + acc +
            ';text-transform:uppercase;letter-spacing:.5px">' + p.jour + '</td></tr>' +
            '<tr><td align="center" style="padding:0 0 3px;font-size:22px;font-weight:800;color:' + acc +
            ';line-height:1">' + p.num + '</td></tr>' +
            '<tr><td align="center" style="padding:0 0 8px;font-size:10px;color:' + PALE + '">' + p.mois + '</td></tr>' +
          '</table>' +
        '</td>' +
        '<td style="padding:14px 16px 14px 12px;vertical-align:top">' + tagWe +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + corps + '</table>' +
          '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e8edf3;font-size:12.5px;color:' +
          PALE + '">anciennement <span style="color:' + GRIS + '">' + avant + '</span></div>' +
        '</td>' +
      '</tr></table>';
  });

  const resume = (chgs.length === 1)
    ? 'une journée a été modifiée : <b style="color:' + ENCRE + '">' + _notifDateCourte(chgs[0].date) + '</b>.'
    : '<b style="color:' + ENCRE + '">' + chgs.length + ' journées</b> ont été modifiées, du ' +
      _notifJourMois(chgs[0].date) + ' au ' + _notifJourMois(chgs[chgs.length - 1].date) + '.';

  return '' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
  'style="background:#f4f6f9;font-family:' + POLICE + '">' +
  '<tr><td align="center" style="padding:18px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e8edf3">' +
      '<tr><td style="background:' + ROUGE + ';height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:24px 24px 0">' +
        '<div style="font-size:11px;font-weight:800;letter-spacing:.9px;text-transform:uppercase;color:' +
        PALE + '">Planning-Med</div>' +
        '<div style="font-size:22px;font-weight:800;color:' + ENCRE + ';margin-top:7px;line-height:1.25">' +
        'Votre planning a changé</div>' +
        '<div style="margin-top:10px;font-size:13.5px;color:' + GRIS + ';line-height:1.5">Bonjour ' +
        nom + ', ' + resume + '</div>' +
      '</td></tr>' +
      '<tr><td style="padding:18px 18px 0">' + cartes + '</td></tr>' +
      '<tr><td style="padding:8px 24px 4px">' +
        '<a href="' + NOTIF_SITE + '" style="display:block;background:' + ENCRE + ';color:#fff;' +
        'text-decoration:none;border-radius:11px;font-size:15px;font-weight:700;padding:14px 20px;' +
        'text-align:center">Voir mon planning</a>' +
      '</td></tr>' +
      '<tr><td style="padding:16px 24px 0">' +
        '<div style="background:#f8fafc;border-radius:12px;padding:13px 15px;font-size:12.5px;color:' +
        GRIS + ';line-height:1.55">Un changement vous pose problème&nbsp;? Écrivez à ' +
        '<a href="mailto:planningmedic@gmail.com" style="color:' + ROUGE + ';font-weight:700;' +
        'text-decoration:none">planningmedic@gmail.com</a></div>' +
      '</td></tr>' +
      '<tr><td style="padding:16px 24px 24px;font-size:11.5px;color:' + PALE + ';line-height:1.6">' +
        'Le Comité Planning — Planning-Med · message automatique</td></tr>' +
    '</table>' +
  '</td></tr></table>';
}

/* (24/08/2026) Fusion de la mémoire des placements caducs : les entrées du
   mois publié sont TOUTES remplacées par l'état du jour — y compris par
   rien. Pure, testée au banc. Plafond 200, les plus récentes gagnent. */
function _caducsFusionner_(precedents, label, caducsMois) {
  return (precedents || []).filter(function (x) { return x.mois !== label; })
    .concat((caducsMois || []).map(function (x) {
      return { mois: label, marId: x.marId, date: x.date, statut: x.statut };
    }))
    .slice(-200);
}
