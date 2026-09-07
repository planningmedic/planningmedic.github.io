// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_PORTAIL = '2026-09-07.1';

/**
 * portail.gs — actions du PORTAIL équipe (dashboard.html).
 * 5e fichier du projet Apps Script. Ne touche PAS au planning.
 *
 * Routeur délégué appelé par doGet (Indispos.gs) via un bloc gardé
 * `typeof portailRoute === 'function'`. L'auth (checkCode) est déjà
 * faite en amont : toute action ci-dessous est donc code-gated d'office.
 *
 * Renvoie un ContentService (JSON) si l'action est gérée, sinon null
 * (doGet poursuit alors vers son rejet "Action inconnue" habituel).
 */

const TOPOS_FOLDER = 'Planning-Med-Topos';

function portailRoute(action, payload, user) {
  switch (action) {
    case 'listTopos': return _portailJson(listTopos());
    case 'getTopo':   return _portailJson(getTopo(payload && payload.id));
    case 'listStaffs': return _portailJson(listStaffs());
    case 'listStaffsAll': return _portailJson(listStaffsAll());
    case 'listProtocoles': return _portailJson(listProtocoles());
    case 'getProtocole':   return _portailJson(getProtocole(payload && payload.id));
    case 'listAnnuaire':   return _portailJson(listAnnuaire());
    case 'getSecteurs':    return _portailJson(getSecteurs());
    case 'getSpecialites': return _portailJson(getSpecialites());   // lecture : pas de verrou
    case 'getCotationsType': return _portailJson(getCotationsType());  // lecture : pas de verrou
    /* Fabrique des cotations types (17/08/2026). listCotationsTypeEdit rend AUSSI
       le droit de supprimer : masquer un bouton ne ferme rien, seul le serveur
       decide. */
    case 'listCotationsTypeEdit': return _portailJson(listCotationsTypeEdit(payload, user));
    case 'saveCotationType':      return _portailJson(saveCotationType(payload, user));
    case 'deleteCotationType':    return _portailJson(deleteCotationType(payload, user));
    // Releve financier du groupement : RESERVE AUX MEMBRES (LIBERAL=O de MEDECINS).
    // Decision Arthur 29/07/2026 : masquer la tuile ne suffit pas, seul le serveur
    // ferme la porte (meme principe que les marges de getConsultAbsences).
    // L'appel INTERNE depuis getConsultAbsences (Indispos.gs) ne passe pas par ce
    // routeur : il reste fonctionnel, ses marges sont deja filtrees la-bas.
    case 'getReleveLiberal':
      if (!user || user.role !== 'mar' || !user.liberal) {
        return _portailJson({ success: false, error: 'Réservé aux membres du groupement libéral.' });
      }
      return _portailJson(getReleveLiberal(payload));  // lecture : pas de verrou
    // Statistiques d'usage du portail (29/08/2026). ADMIN uniquement : masquer la
    // tuile ne ferme rien, seul le serveur decide (meme principe que getReleveLiberal).
    case 'getStatsUsage': return _portailJson(getStatsUsage(user));
    case 'getCsTemplate':  return _portailJson(getCsTemplate());
    case 'getVeille':  return _portailJson(getVeille(user));   // (2026-08-08.2) repli GAS : marques du MAR fusionnées
    case 'markVeille': return _portailJson(markVeille(payload && payload.pmid, payload && payload.field, payload && payload.value, user));
    case 'genererCRH': return _portailJson(genererCRH_(payload, user));
    // Declaration d'intervention liberale (onglet LIBERAL_{Y}). declareLiberal et
    // deleteLiberal ECRIVENT : elles sont dans WRITE_ACTIONS_LOCK (Indispos.gs), le
    // verrou etant pris AVANT cette delegation. listLiberal est une lecture.
    case 'declareLiberal': return _portailJson(declareLiberal(payload, user));
    case 'deleteLiberal':  return _portailJson(deleteLiberal(payload, user));
    case 'listLiberal':    return _portailJson(listLiberal(payload, user));
    // Lecture COMITE : toutes les declarations d'un jour, tous MAR confondus.
    // Reservee a l'admin (listLiberal, elle, filtre sur le MAR connecte). Lecture
    // seule => volontairement ABSENTE du WRITE_ACTIONS_LOCK.
    case 'listLiberalJour': return _portailJson(listLiberalJour(payload, user));
    default:          return null;   // pas une action portail → doGet continue
  }
}

function _portailJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Dossier Topos (auto-création si absent), rangé dans le Drive du compte
// planningmedic — même principe que Planning-Med-JSON.
function _getToposFolder() {
  const it = DriveApp.getFoldersByName(TOPOS_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(TOPOS_FOLDER);
}

function _isPdf(file) {
  if (file.getMimeType() === 'application/pdf') return true;
  return /\.pdf$/i.test(file.getName());
}
function _stripPdf(name) { return String(name).replace(/\.pdf$/i, ''); }

function _fileMeta(file) {
  return {
    id:    file.getId(),
    title: _stripPdf(file.getName()),
    date:  Utilities.formatDate(file.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    size:  file.getSize(),
  };
}

// Liste les topos : PDF à la racine = topo 1 doc ; sous-dossier = topo N docs
// (nom du sous-dossier = titre). UN SEUL niveau de sous-dossier. Tri alpha
// partout (topos entre eux + docs dans un sous-dossier).
function listTopos() {
  const root = _getToposFolder();
  const topos = [];

  // 1) PDF directement à la racine → topos à 1 document
  const files = root.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (!_isPdf(f)) continue;
    const m = _fileMeta(f);
    topos.push({ title: m.title, multi: false, date: m.date, docs: [m] });
  }

  // 2) sous-dossiers → topos à plusieurs documents
  const subs = root.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const docs = [];
    const sf = sub.getFiles();
    while (sf.hasNext()) {
      const f = sf.next();
      if (_isPdf(f)) docs.push(_fileMeta(f));
    }
    if (!docs.length) continue;                        // sous-dossier sans PDF → ignoré
    docs.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    const lastDate = docs.reduce((mx, d) => (d.date > mx ? d.date : mx), docs[0].date);
    topos.push({ title: sub.getName(), multi: true, date: lastDate, docs: docs });
  }

  // tri des topos entre eux : alphabétique sur le titre
  topos.sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  return { success: true, folderUrl: root.getUrl(), count: topos.length, topos: topos };
}

// Sert un PDF en base64 — le MAR ne touche JAMAIS au Drive directement
// (cohérent avec la façon dont le planning est servi).
// Sécurité : on n'accepte que les fichiers RÉELLEMENT situés dans le dossier
// Topos (racine ou sous-dossier direct), pour qu'un code valide ne puisse pas
// lire un fichier arbitraire du Drive via un id forgé.
function getTopo(id) {
  if (!id) return { success: false, error: 'Identifiant manquant' };
  let file;
  try { file = DriveApp.getFileById(id); }
  catch (e) { return { success: false, error: 'Document introuvable' }; }
  if (!_fileInTopos(file)) return { success: false, error: 'Accès refusé' };
  const blob = file.getBlob();
  return {
    success:  true,
    name:     file.getName(),
    mimeType: blob.getContentType() || 'application/pdf',
    dataB64:  Utilities.base64Encode(blob.getBytes()),
  };
}

// Vrai si le fichier est dans le dossier Topos, ou dans un sous-dossier direct
// de ce dossier (un seul niveau, cohérent avec listTopos).
function _fileInTopos(file) {
  const toposId = _getToposFolder().getId();
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    if (p.getId() === toposId) return true;            // fichier à la racine Topos
    const grand = p.getParents();
    while (grand.hasNext()) {
      if (grand.next().getId() === toposId) return true; // fichier dans un sous-dossier direct
    }
  }
  return false;
}

// ── À exécuter UNE FOIS dans l'éditeur (menu Exécuter) après recopie ──
// Déclenche l'autorisation Drive, crée le dossier Topos s'il manque, et
// journalise l'URL du dossier + ce que listTopos voit.
function testPortail() {
  const r = listTopos();
  Logger.log('📁 Dossier Topos : ' + r.folderUrl);
  Logger.log('📚 Topos vus : ' + r.count);
  r.topos.forEach(function (t) {
    Logger.log('  • ' + t.title + ' (' + t.docs.length + ' doc' + (t.docs.length > 1 ? 's' : '') + ')');
  });
  Logger.log('✅ testPortail OK — dépose tes PDF dans le dossier ci-dessus, puis relance pour vérifier.');
}


// ══════════════════════════════════════════════════════════════════════
//  STAFFS À VENIR
//  Source = onglet STAFFS du classeur (1 ligne = 1 staff). Auto-créé avec
//  ses en-têtes s'il manque. Seuls les staffs à venir (date >= aujourd'hui)
//  sont renvoyés, triés du plus proche au plus lointain.
//  Colonnes : DATE | HEURE | THÈME | INTERVENANT | LIEU
//  (seules DATE + THÈME sont requises ; HEURE/INTERVENANT/LIEU facultatives)
// ══════════════════════════════════════════════════════════════════════

const STAFFS_TAB = 'STAFFS';

function getOrCreateStaffsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(STAFFS_TAB);
  if (!sh) {
    sh = ss.insertSheet(STAFFS_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['DATE', 'HEURE', 'THÈME', 'INTERVENANT', 'LIEU']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 320);
  }
  return sh;
}

// Normalise une valeur de cellule (Date OU texte) en 'yyyy-MM-dd'. Gère les
// formats FR (jj/mm/aaaa, jj-mm-aa…). Renvoie '' si non interprétable.
function _staffDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = '20' + y;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? '' : Utilities.formatDate(d2, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _staffTabUrl(sh) {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl() + '#gid=' + sh.getSheetId();
}

function listStaffs() {
  const sh = getOrCreateStaffsTab();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const data = sh.getDataRange().getValues();
  const staffs = [];
  for (let r = 1; r < data.length; r++) {
    const iso = _staffDate(data[r][0]);
    if (!iso) continue;                                   // pas de date valide → ignoré
    const theme = String(data[r][2] || '').trim();
    const interv = String(data[r][3] || '').trim();
    if (!theme && !interv) continue;                      // ligne vide → ignorée
    if (iso < today) continue;                            // staff passé → masqué
    staffs.push({
      date:        iso,
      heure:       String(data[r][1] || '').trim(),
      theme:       theme,
      intervenant: interv,
      lieu:        String(data[r][4] || '').trim(),
    });
  }
  staffs.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.heure).localeCompare(String(b.heure));
  });
  return { success: true, tabUrl: _staffTabUrl(sh), count: staffs.length, staffs: staffs };
}

// Variante NON filtrée : tous les staffs (passés inclus), sans tri obligatoire.
// Utilisée par l'export Excel du planning pour retrouver le staff du vendredi
// de n'importe quelle semaine affichée (même passée).
function listStaffsAll() {
  const sh = getOrCreateStaffsTab();
  const data = sh.getDataRange().getValues();
  const staffs = [];
  for (let r = 1; r < data.length; r++) {
    const iso = _staffDate(data[r][0]);
    if (!iso) continue;
    const heure = String(data[r][1] || '').trim();
    const theme = String(data[r][2] || '').trim();
    if (!theme && !heure) continue;
    staffs.push({ date: iso, heure: heure, theme: theme });
  }
  return { success: true, staffs: staffs };
}

// ── À exécuter UNE FOIS dans l'éditeur après recopie ──
// Crée l'onglet STAFFS s'il manque et journalise son URL + les staffs à venir.
function testStaffs() {
  const r = listStaffs();
  Logger.log('🗓️ Onglet STAFFS : ' + r.tabUrl);
  Logger.log('📋 Staffs à venir : ' + r.count);
  r.staffs.forEach(function (s) {
    Logger.log('  • ' + s.date + (s.heure ? ' ' + s.heure : '') + ' — ' + s.theme + (s.intervenant ? ' (' + s.intervenant + ')' : ''));
  });
  Logger.log('✅ testStaffs OK — remplis l\'onglet STAFFS (1 ligne = 1 staff), puis relance.');
}


// ══════════════════════════════════════════════════════════════════════
//  _isoDate — RESTE ICI VOLONTAIREMENT.
//  Elle vivait dans le bloc VEILLE, par accident : elle ne normalise que
//  des dates. Elle est utilisée 9 fois dans ce fichier (module libéral)
//  et 6 fois dans Indispos.gs (absences). La déplacer dans veille.gs
//  ferait dépendre les absences d'un module bibliographique — et tout
//  casserait le jour où ce module serait retiré.
//  DÉFINITION UNIQUE du projet.
// ══════════════════════════════════════════════════════════════════════

// Une cellule DATE_PUB peut avoir été convertie en objet Date par Sheets :
// on renormalise systématiquement en 'yyyy-MM-dd' (sinon String(Date) = texte long).
function _isoDate(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  return m ? (m[1] + '-' + m[2] + '-' + m[3]) : s;
}

// ══════════════════════════════════════════════════════════════════════
//  PROTOCOLES  (clone de Topos, mais sous-dossiers = SPÉCIALITÉS)
//  Dossier Drive Planning-Med-Protocoles (auto-créé). PDF à la racine =
//  protocole "Général" ; chaque sous-dossier = une spécialité, chaque PDF
//  dedans = un protocole. Servi en flux privé. Réutilise _isPdf/_fileMeta.
// ══════════════════════════════════════════════════════════════════════

const PROTOS_FOLDER = 'Planning-Med-Protocoles';

function _getProtosFolder() {
  const it = DriveApp.getFoldersByName(PROTOS_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PROTOS_FOLDER);
}

// Vrai si le fichier est dans le dossier donné (racine ou sous-dossier direct).
function _fileWithinFolder(file, folderId) {
  // Remonte toute la chaîne de dossiers parents (profondeur quelconque).
  const seen = {};
  let level = [file];
  let depth = 0;
  while (level.length && depth < 12) {
    const next = [];
    for (let i = 0; i < level.length; i++) {
      const parents = level[i].getParents();
      while (parents.hasNext()) {
        const p = parents.next();
        const id = p.getId();
        if (id === folderId) return true;
        if (!seen[id]) { seen[id] = true; next.push(p); }
      }
    }
    level = next;
    depth++;
  }
  return false;
}

function listProtocoles() {
  const root = _getProtosFolder();
  const groups = [];

  // PDF à la racine → groupe "Général"
  const rootDocs = [];
  const rf = root.getFiles();
  while (rf.hasNext()) { const f = rf.next(); if (_isPdf(f)) rootDocs.push(_fileMeta(f)); }
  if (rootDocs.length) {
    rootDocs.sort(function (a, b) { return a.title.localeCompare(b.title, 'fr'); });
    groups.push({ specialite: 'Général', protocoles: rootDocs });
  }

  // sous-dossiers = spécialités
  const subGroups = [];
  const subs = root.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    const docs = [];
    // PDF directement dans la spécialité
    const sf = sub.getFiles();
    while (sf.hasNext()) { const f = sf.next(); if (_isPdf(f)) docs.push(_fileMeta(f)); }
    // PDF dans les sous-sous-dossiers (thèmes) → titre préfixé "Thème \u203a "
    const deep = sub.getFolders();
    while (deep.hasNext()) {
      const d = deep.next();
      const theme = d.getName();
      const df = d.getFiles();
      while (df.hasNext()) {
        const f = df.next();
        if (!_isPdf(f)) continue;
        const meta = _fileMeta(f);
        meta.theme = theme;
        meta.title = theme + ' \u203a ' + meta.title;
        docs.push(meta);
      }
    }
    if (!docs.length) continue;
    docs.sort(function (a, b) { return a.title.localeCompare(b.title, 'fr'); });
    subGroups.push({ specialite: sub.getName(), protocoles: docs });
  }
  subGroups.sort(function (a, b) { return a.specialite.localeCompare(b.specialite, 'fr'); });

  const all = groups.concat(subGroups);
  const count = all.reduce(function (n, g) { return n + g.protocoles.length; }, 0);
  return { success: true, folderUrl: root.getUrl(), count: count, groups: all };
}

function getProtocole(id) {
  if (!id) return { success: false, error: 'Identifiant manquant' };
  let file;
  try { file = DriveApp.getFileById(id); }
  catch (e) { return { success: false, error: 'Document introuvable' }; }
  if (!_fileWithinFolder(file, _getProtosFolder().getId())) return { success: false, error: 'Accès refusé' };
  const blob = file.getBlob();
  return {
    success: true, name: file.getName(),
    mimeType: blob.getContentType() || 'application/pdf',
    dataB64: Utilities.base64Encode(blob.getBytes()),
  };
}

// À exécuter UNE FOIS après recopie : crée le dossier Protocoles + logue l'URL.
function testProtocoles() {
  const r = listProtocoles();
  Logger.log('📁 Dossier Protocoles : ' + r.folderUrl);
  Logger.log('📋 Protocoles vus : ' + r.count);
  r.groups.forEach(function (g) { Logger.log('  ▸ ' + g.specialite + ' (' + g.protocoles.length + ')'); });
  Logger.log('✅ testProtocoles OK — crée des sous-dossiers par spécialité et dépose les PDF dedans.');
}


// ══════════════════════════════════════════════════════════════════════
//  ANNUAIRE  (répertoire hôpital, onglet ANNUAIRE auto-créé)
//  + section "Équipe MAR" lue depuis MEDECINS (DECT = colonne 8, actifs).
//  Colonnes ANNUAIRE : CATÉGORIE | LIBELLÉ | NUMÉRO | INFO
// ══════════════════════════════════════════════════════════════════════

const ANNUAIRE_TAB = 'ANNUAIRE';

function getOrCreateAnnuaireTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ANNUAIRE_TAB);
  if (!sh) {
    sh = ss.insertSheet(ANNUAIRE_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['CATÉGORIE', 'LIBELLÉ', 'NUMÉRO', 'INFO']]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 260);
  }
  return sh;
}

function listAnnuaire() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Équipe MAR depuis MEDECINS (actifs) : nom, initiales, DECT (col 8) ──
  const equipe = [];
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const d = med.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      const id = String(d[r][0] || '').trim();
      if (!id) continue;
      if (String(d[r][3] || '').trim().toUpperCase() !== 'O') continue; // ACTIF = O
      equipe.push({
        name:     String(d[r][1] || '').trim() || id,
        initials: String(d[r][2] || '').trim(),
        dect:     String(d[r][8] || '').trim(),
      });
    }
    equipe.sort(function (a, b) { return a.name.localeCompare(b.name, 'fr'); });
  }

  // ── Répertoire hôpital depuis ANNUAIRE, groupé par catégorie ──
  const sh = getOrCreateAnnuaireTab();
  const rows = sh.getDataRange().getValues();
  const map = {}; const order = [];
  for (let r = 1; r < rows.length; r++) {
    const lib = String(rows[r][1] || '').trim();
    const num = String(rows[r][2] || '').trim();
    if (!lib && !num) continue;
    const cat = String(rows[r][0] || '').trim() || 'Divers';
    if (!map[cat]) { map[cat] = []; order.push(cat); }
    map[cat].push({ libelle: lib, numero: num, info: String(rows[r][3] || '').trim() });
  }
  order.sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  const categories = order.map(function (k) { return { categorie: k, entries: map[k] }; });

  return {
    success: true,
    tabUrl: ss.getUrl() + '#gid=' + sh.getSheetId(),
    equipe: equipe,
    categories: categories,
  };
}

// À exécuter UNE FOIS après recopie : crée l'onglet ANNUAIRE + logue l'état.
function testAnnuaire() {
  const r = listAnnuaire();
  Logger.log('🗂️ Onglet ANNUAIRE : ' + r.tabUrl);
  Logger.log('👥 Équipe MAR (DECT) : ' + r.equipe.length + ' actifs');
  Logger.log('☎️ Catégories répertoire : ' + r.categories.length);
  r.categories.forEach(function (c) { Logger.log('  ▸ ' + c.categorie + ' (' + c.entries.length + ')'); });
  Logger.log('✅ testAnnuaire OK — remplis l\'onglet ANNUAIRE (CATÉGORIE | LIBELLÉ | NUMÉRO | INFO).');
}


// ══════════════════════════════════════════════════════════════════════
//  GÉNÉRATEUR DE CRH DE RÉANIMATION (V1) — crh.html
//  Action portail `genererCRH` : synthèse d'un CR à partir des mots
//  d'évolution collés (anonymisés), via l'API Anthropic.
//  Auth : code-gated d'office (checkCode en amont dans doGet).
//  Clé API : ligne ANTHROPIC_TOKEN de l'onglet CONFIG (comme GITHUB_TOKEN).
//  Prompt calé sur les CR validés du service. Modèle configurable ci-dessous.
// ══════════════════════════════════════════════════════════════════════

const CRH_MODELS = {                     // choix manuel depuis l'interface
  sonnet: { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  opus:   { id: 'claude-opus-4-8',   label: 'Opus 4.8' }
};
const CRH_MODEL_DEFAULT = 'sonnet';      // par défaut ; Opus réservé aux séjours longs/complexes
const CRH_ALLOWED = ['DURAND'];      // ids MEDECINS autorisés à générer des CRH (accès nominatif)
const CRH_MAX_TOKENS = 8192;           // plafond de sortie

let _anthropicTokenCache = null;
function getAnthropicToken() {
  if (_anthropicTokenCache !== null) return _anthropicTokenCache;
  _anthropicTokenCache = '';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === 'ANTHROPIC_TOKEN') { _anthropicTokenCache = String(data[r][1]).trim(); break; }
    }
  }
  return _anthropicTokenCache;
}

const CRH_EX_FAV_COURT = `L'évolution en réanimation est rapidement favorable après mise en place de séances de VNI permettant une eupnée et un passage aux lunettes d'O2 dès J1.

Introduction d'AUGMENTIN en probabiliste devant une hyperthermie à 38,5°C, pour une durée de 5 jours prévue (pas de germe retrouvé sur les différents prélèvements réalisés).

Le patient reste adéfaillant par ailleurs, va au fauteuil, mange et boit sans aide.

Il est transféré en pneumologie le 30/06/2026 pour la suite de la prise en charge.`;

const CRH_EX_APPAREIL = `Admission d'une patiente consciente, bien orientée, normotherme à 36,4°C, normotendue à 13/9 mmHg en RRS à 82/min, eupnéique et normoxique sous O2 à 4 L/min aux lunettes.

Les suites post-opératoires sont simples et marquées par :

  - Sur le plan hémodynamique : stabilité hémodynamique, rythme régulier sinusal.

  - Sur le plan respiratoire : sevrage de l'oxygène dans l'après-midi du 01/07/2026, la patiente restant eupnéique et normoxique en air ambiant par la suite.

  - Sur le plan infectieux : patiente apyrétique, sans sepsis clinique. À noter un syndrome inflammatoire très lentement évolutif (CRP à 96 mg/L le 03/07) pour lequel un ECBC est demandé à titre systématique.

  - Sur le plan neurologique : patiente bien orientée, sans signe de localisation. Ablation accidentelle du cathéter d'analgésie péridurale le 01/07/2026 (grattage sur lésion urticarienne au contact du pansement), relayée par une analgésie multimodale efficace.

  - Sur le plan néphrologique : diurèse spontanée, sans dégradation de la fonction rénale.

  - Sur le plan nutritionnel : reprise d'une alimentation normale à compter du 30/06/2026.

Mme X est transférée le 03/07/2026 en unité de chirurgie pour la suite de la prise en charge.`;

const CRH_EX_CHRONO_GRAVE = `Les 24 premières heures, la patiente reste sédatée sous ventilation protectrice devant une instabilité hémodynamique (NORADRENALINE jusqu'à 0,15 µg/kg/min, remplissage par ALBUMINE et RINGER LACTATE), avec une hyperlactatémie maximale à 3,6 mmol/L, une oligurie et une acidose (pH 7,17, HCO3 17 mmol/L) et des troubles électrolytiques. Drainage pleural bilatéral dans les 24 premières heures pour un épanchement de grande abondance.

Extubation à J1, sevrage de la NORADRENALINE à J2, reprise d'une diurèse spontanée et correction des troubles hydro-électrolytiques. Transfusion d'1 CGR.

Analgésie multimodale optimale avec cathéter péridural thoracique, retiré le 18/06. Ablation des drains le 18/06 avec radiographie thoracique de contrôle.

Reprise du transit aux gaz et ablation de la SNG le 14/06 ; alimentation parentérale débutée à J1 puis reprise progressive per os, marquée par des nausées et vomissements cédant sous prokinétiques.

Hors antibiotique, subfébrile, sans syndrome inflammatoire biologique.

Transfert en service de chirurgie le 23/06 pour la suite de la prise en charge.`;

const CRH_EX_CHRONO_DECES = `L'évolution en réanimation est initialement favorable, avec un patient rapidement stable hémodynamiquement sous TAZOCILLINE probabiliste introduite dans le cadre de la pose de prothèse biliaire en peropératoire.

Le scanner réalisé le 26/06 pour contrôle du montage chirurgical devant un syndrome inflammatoire met en évidence fortuitement une embolie pulmonaire distale du lobe inférieur droit, bien tolérée sur les plans hémodynamique et respiratoire, motivant l'introduction d'HNF IVSE.

L'antibiothérapie est adaptée aux prélèvements biliaires peropératoires (Escherichia coli, Enterobacter cloacae complex, Enterococcus faecalis, tous sensibles à la TAZOCILLINE).

À J5, devant une fonction rénale normale et une tolérance satisfaisante, l'anticoagulation curative par HNF IVSE est relayée par LOVENOX 6 000 UI × 2/j en sous-cutané. L'iléus postopératoire est pris en charge par aspiration gastrique et introduction d'ERYTHROMYCINE 250 mg × 2/j. L'alimentation parentérale exclusive est maintenue tout au long du séjour.

Le 30/06 à 7h15, appel pour dégradation hémodynamique brutale avec coma, tachycardie mal tolérée et hypotension, motivant une cardioversion pharmacologique par CORDARONE puis une intubation orotrachéale. Arrêt cardiaque à 7h42 sur bradycardie extrême, sans rythme choquable ; devant une suspicion d'embolie pulmonaire massive à l'échographie de débrouillage (cavités droites dilatées), injection d'ACTILYSE en cours de RCP (45 minutes, 7 mg d'ADRÉNALINE, GLUCONATE DE CALCIUM, BICARBONATE MOLAIRE). En accord avec l'équipe médicale, arrêt de la réanimation.

Le patient décède le 30/06/2026 à 08h30.`;

function crhSystemPrompt_() {
  return `Tu es un assistant de rédaction médicale spécialisé en réanimation, pour un anesthésiste-réanimateur.

RÈGLE ABSOLUE DE CONFIDENTIALITÉ : le texte d'entrée doit être anonymisé. Si tu y repères malgré tout un élément identifiant (nom de patient, date de naissance, numéro de dossier/IPP), NE PRODUIS PAS le compte rendu : réponds uniquement « ⚠️ Le texte contient un élément identifiant — retire-le puis relance. » Ne recopie jamais un tel élément dans ta réponse.

ENTRÉE : un bloc unique de mots d'évolution quotidiens ANONYMISÉS (motif/antécédents éventuels en tête, puis les journées repérables par « J1 », « J+3 », dates type 12/06). Repère-les et ordonne-les chronologiquement.

Tu produis un compte rendu d'hospitalisation (CRH) de réanimation dans le format demandé.

═══ PRINCIPE DIRECTEUR — BRIÈVETÉ ET PÉRIMÈTRE ═══
Document TRÈS SYNTHÉTIQUE, centré sur LE SÉJOUR EN RÉANIMATION. Un séjour simple tient en quelques phrases ; un séjour grave/complexe peut être un peu plus développé, mais reste synthétique.
IMPORTANT — SÉJOURS LONGS (plusieurs semaines) : ne rallonge PAS le compte rendu proportionnellement à la durée, et ne fais JAMAIS une chronique jour par jour. Regroupe l'évolution par grands problèmes (respiratoire, infectieux, chirurgical…) et par phases (initiale / complications / récupération), en ne retenant que les événements marquants et les tournants de prise en charge. Condense les périodes stables en une phrase (« évolution stable jusqu'au… »). Même un séjour de 40 à 50 jours doit tenir en une synthèse d'environ une à deux pages.
- Le motif d'admission/transfert en réa tient en une phrase ou est intégré à la synthèse. Ne reprends pas l'histoire ni les soins antérieurs à la réa, ni les découvertes incidentes de bilan (sauf si elles conditionnent le suivi — une demi-phrase).
- Une phrase par plan, uniquement pour les plans ayant présenté un événement notable EN réa. Omets les autres — n'écris JAMAIS « non renseigné ».
- Pas de chronique jour par jour datée. Dans le doute, COUPE.

═══ RÈGLES DE STYLE AFFINÉES (issues des corrections du médecin — à respecter absolument) ═══
1. INTRO sobre et fidèle à la chronologie : « L'évolution en réanimation est rapidement favorable. » Si le séjour se dégrade ou aboutit à un décès, écris « initialement favorable » et laisse le récit dérouler la dégradation — N'ANNONCE PAS l'issue ni le diagnostic complet dans la première phrase. N'accole pas le geste chirurgical à l'intro.
2. ÉTAT DE SORTIE : ne le mentionne QUE s'il est EXPLICITEMENT écrit dans les notes (autonomie, alimentation, mobilisation, absence de défaillance). Dans ce cas seulement, emploie « reste adéfaillant(e), va au fauteuil, mange et boit sans aide » (adéfaillant = sans défaillance d'organe), sans le paraphraser. Sinon, N'AJOUTE RIEN sur l'état de sortie — ne l'invente jamais, ne le déduis pas d'une évolution favorable.
3. ANTIBIOTHÉRAPIE : précise la durée (« pour une durée de X jours », « 48h ») et le résultat des prélèvements (germe identifié, ou « pas de germe retrouvé »).
4. CHIFFRES — distingue :
   • GARDE ceux qui justifient une décision/un geste (drain retiré devant un débit < 100 cc/j), les posologies notables (LOVENOX 6 000 UI × 2/j), les troubles électrolytiques, l'Hb de sortie, et — dans un séjour GRAVE — les marqueurs de défaillance (lactatémie, pH, dose d'amines en µg/kg/min, GDS).
   • SUPPRIME les chiffres purement descriptifs (volume d'un redon → « peu productif ») et les détails de titration progressive.
5. EXAMENS : ne mentionne un examen que s'il modifie la prise en charge, avec son MOTIF et le caractère de la découverte, SANS lister ses résultats exhaustifs. Exception : un examen central au motif d'hospitalisation (TDM cérébrale d'un trauma crânien) peut être décrit. Omets les examens de routine.
6. GESTES/DÉCISIONS : justifie-les brièvement (pourquoi ce switch d'antibiotique, pourquoi ce retrait de drain).
7. Garde les TROUBLES ÉLECTROLYTIQUES suivis (hypokaliémie, hypophosphatémie, hypomagnésémie « en cours de correction »).
8. SERVICE D'AVAL : indique le service de destination réel tel qu'il ressort des notes (« chirurgie viscérale », « urologie », « pneumologie », ou « service de chirurgie » si non précisé), date complète JJ/MM/AAAA. Ne l'invente pas, ne le sur-spécifie pas.
9. Pour un séjour simple, FUSIONNE admission et évolution initiale ; n'ouvre pas chaque segment par « À l'admission (date)… Dès J1 (date)… ».

═══ ÉLÉMENTS RÉCURRENTS (à inclure seulement s'ils sont documentés, jamais à inventer) ═══
- ANALGÉSIE : « Analgésie multimodale optimale / adaptée / efficace », avec le dispositif si présent (péridurale, cathéter de paroi/nerveux) et sa date d'ablation.
- RÉHABILITATION précoce / retour en service, quand mentionnée.
- Pour le format par appareil, si l'état et les constantes d'admission sont fournis, tu PEUX ouvrir par une phrase d'admission : « Admission d'un(e) patient(e) conscient(e), bien orienté(e), [température], [TA] en [rythme], eupnéique/normoxique sous [support O2] ».
- Intitulés d'appareils usuels (adapte à ceux qui sont actifs) : neurologique, respiratoire, hémodynamique, infectieux, rénal (ou rénal/métabolique, néphrologique), digestif (ou digestif/chirurgical), chirurgical, métabolique, nutritionnel.

═══ STYLE MAISON ═══
- Médicaments/molécules/antibiotiques TOUJOURS EN MAJUSCULES (NORADRENALINE, TAZOCILLINE, LINEZOLIDE, LOVENOX).
- Germes nommés précisément (genre + espèce) quand décisifs.
- Dates réelles JJ/MM (JJ/MM/AAAA entrée/sortie) si présentes ; sinon repères Jn. N'INVENTE aucune date.
- Patient : « Mr X » / « Mme X » (ou « le patient »/« la patiente » si genre indéterminable). Aucun identifiant.
- Abréviations médicales conservées (OHDN, VNI, FiO2, SpO2, NAD, KDIGO, IVSE, HNF, RRS, GDS, SNG, ECBU…).
- Phrases denses et causales (« motivant », « permettant », « devant »), 3e personne.
- Conclusion : devenir daté (domicile / transfert / décès daté avec heure si mentionnée), suivi et reprise du traitement personnel éventuels.

═══ FORMAT « PAR APPAREIL » (courts/simples) ═══
Intro brève (ou phrase d'admission si constantes fournies), puis la liste des plans, chacun sur sa propre ligne au format EXACT «   - Sur le plan [appareil] : … » (deux espaces, un tiret, une espace, l'intitulé, puis « : » avant le contenu), pour les seuls plans actifs, puis état de sortie éventuel et conclusion datée.
═══ FORMAT « CHRONOLOGIQUE » (longs/complexes) ═══
Récit synthétique daté regroupé par fil narratif (et non jour par jour), puis état de sortie éventuel et conclusion datée. Pour un séjour long, structure par phases et par problèmes plutôt que par journées ; condense les périodes stables en une phrase.

═══ SÉCURITÉ ═══
N'invente AUCUNE donnée absente. Ne réintroduis aucun identifiant. Brouillon destiné à être relu et validé par le médecin. Ne produis que le compte rendu, sans préambule ni commentaire.

═══ EXEMPLES DE RÉFÉRENCE (calque le ton, la longueur et le niveau ; ne réutilise JAMAIS leur contenu clinique) ═══

[Favorable court — transfert]
${CRH_EX_FAV_COURT}

[Par appareil complet — post-op, transfert]
${CRH_EX_APPAREIL}

[Chronologique — séjour grave, évolution favorable]
${CRH_EX_CHRONO_GRAVE}

[Chronologique — décès]
${CRH_EX_CHRONO_DECES}`;
}

function genererCRH_(payload, user) {
  if (!user || CRH_ALLOWED.indexOf(String(user.id)) === -1) {
    return { success: false, error: 'Accès réservé.' };
  }
  const texte  = String((payload && payload.texte)  || '').trim();
  const format = String((payload && payload.format) || 'appareil').trim();
  if (!texte) return { success: false, error: 'Aucun texte fourni.' };
  // (C1b) Traçabilité : la génération exige la confirmation explicite d'anonymisation.
  // On journalise l'usage (qui, quand) — JAMAIS le contenu clinique.
  if (!(payload && payload.confirmAnonyme === true)) {
    return { success: false, error: "Confirme d'abord l'anonymisation du texte (case à cocher)." };
  }
  try { logAction('CRH généré par ' + user.id + ' — anonymisation confirmée'); } catch (e) {}

  const token = getAnthropicToken();
  if (!token) return { success: false, error: "Cle API absente : ajoute une ligne ANTHROPIC_TOKEN dans l'onglet CONFIG." };

  const fmt = (format === 'chrono')
    ? 'CHRONOLOGIQUE (recit date synthetique)'
    : 'PAR APPAREIL (intro/admission breve puis liste «   - Sur le plan … : … », plans actifs seulement)';

  const userMsg = 'Format demande : ' + fmt + '.\n\n'
    + "Rappel : tres synthetique, centre rea ; applique les regles affinees (intro sans spoiler, "
    + "etat de sortie UNIQUEMENT s'il est explicitement ecrit, duree d'ATB, chiffres decisionnels seulement, "
    + "examens contextualises, service d'aval reel). N'invente rien.\n\n"
    + "Mots d'evolution du sejour (bloc unique a segmenter puis synthetiser) :\n\n" + texte;

  const mkey = (payload && payload.model === 'opus') ? 'opus' : CRH_MODEL_DEFAULT;
  const chosen = CRH_MODELS[mkey] || CRH_MODELS[CRH_MODEL_DEFAULT];

  const body = {
    model: chosen.id,
    max_tokens: CRH_MAX_TOKENS,
    system: crhSystemPrompt_(),
    messages: [{ role: 'user', content: userMsg }]
  };

  let res;
  try {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { success: false, error: 'Appel API impossible : ' + e };
  }

  const code = res.getResponseCode();
  if (code !== 200) {
    let msg = 'Erreur API (' + code + ')';
    if (code === 401)      msg = "Cle API invalide : verifie ANTHROPIC_TOKEN dans l'onglet CONFIG.";
    else if (code === 429) msg = 'Credit epuise ou limite atteinte — recharge le compte API.';
    return { success: false, error: msg };
  }

  let data;
  try { data = JSON.parse(res.getContentText()); }
  catch (e) { return { success: false, error: 'Reponse illisible du serveur.' }; }

  const cr = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n').trim();

  if (!cr) {
    var sr = data.stop_reason || '(non precise)';
    Logger.log('CRH reponse sans texte — stop_reason=' + sr + ' — brut(700c): ' + String(res.getContentText() || '').slice(0, 700));
    return { success: false, error: 'Reponse sans texte (raison : ' + sr + '). Detail dans les logs Apps Script (Executions).' };
  }
  return { success: true, cr: cr, truncated: data.stop_reason === 'max_tokens',
           out_tokens: (data.usage && data.usage.output_tokens) || null, cap: CRH_MAX_TOKENS,
           model_used: chosen.label };
}

// ── À exécuter UNE FOIS après recopie : vérifie la clé + un CR de test ──
function testCRH() {
  const t = getAnthropicToken();
  Logger.log(t ? '🔑 ANTHROPIC_TOKEN présent (longueur ' + t.length + ')' : '❌ ANTHROPIC_TOKEN absent — ajoute-le dans CONFIG.');
  if (!t) return;
  const r = genererCRH_({ texte: 'J1 : patient stable, eupnéique en air ambiant. Transfert en chirurgie le 10/07.', format: 'appareil' });
  Logger.log(r.success ? ('✅ CR de test :\n' + r.cr) : ('❌ ' + r.error));
}



// ════════════════════════════════════════════════════════════════════
//  DÉCLARATION D'INTERVENTION LIBÉRALE — onglet LIBERAL_{Y}
//  (à distinguer de la « déclaration de choix », le document signé par le
//   patient : ici il s'agit de la présence au bloc annoncée AU COMITÉ.)
//
//  Payload FERMÉ, 9 colonnes, AUCUNE donnée patient, AUCUN code CCAM :
//    ID | DATE_CONSULT | DATE_BLOC | MAR_ID | SECTEUR | CHIRURGIE
//       | SPECIALITE | BR_CCAM | BR_NGAP
//  - ID          : poignée aléatoire, pour cibler une ligne (suppression / fusion)
//                  sans dépendre du numéro de ligne (fragile si l'onglet est trié).
//  - DATE_CONSULT: J0, informatif (suivi NGAP plus tard) — pris à aujourd'hui.
//  - DATE_BLOC   : jour de l'acte, ce que lit le comité. Détermine l'ANNÉE de l'onglet.
//  - MAR_ID      : TOUJOURS celui du code d'accès (user.id), jamais une valeur cliente.
//  - SECTEUR     : code SECTEURS, obligatoire (sans lui, rien à placer).
//  - CHIRURGIE   : libellé court libre, facultatif (idée de durée pour le comité).
//
//  - SPECIALITE  : un code de l'onglet SPECIALITES ; maille du rendement.
//  - BR_CCAM     : base de remboursement de l'acte, datée par DATE_BLOC.
//  - BR_NGAP     : base de la consultation, datée par DATE_CONSULT.
//
//  Granularité : UNE LIGNE = UN PATIENT (Lot 2A, 27/07/2026). La fusion
//  « même MAR + même jour + même secteur » a été SUPPRIMÉE : elle rendait
//  les interventions incomptables (8 cataractes = 1 ligne) et interdisait
//  toute mesure de rendement.
// ════════════════════════════════════════════════════════════════════
// Lot 2A (27/07/2026) : 6 -> 9 colonnes. SPECIALITE porte le rendement (elle
// survit au demenagement, le secteur non) ; BR_CCAM / BR_NGAP portent la base de
// remboursement, SEULE grandeur qui charge le quota des 30 % (le DH en est exclu).
// Les colonnes 0-5 n'ont pas bouge : les lignes anciennes restent lisibles.
const LIBERAL_HEADER = ['ID', 'DATE_CONSULT', 'DATE_BLOC', 'MAR_ID', 'SECTEUR', 'CHIRURGIE',
                        'SPECIALITE', 'BR_CCAM', 'BR_NGAP'];

// Montant -> nombre a 2 decimales, ou '' si absent/invalide. Jamais de negatif :
// une BR negative n'existe pas, et ecrire '' plutot que 0 distingue "non renseigne"
// de "zero euro" au moment du recoupement avec le releve.
function _libMoney_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!isFinite(n) || n < 0) return '';
  return Math.round(n * 100) / 100;
}

// Aujourd'hui en 'yyyy-MM-dd', fuseau du script.
function _todayISO_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _libSheetName(year) { return 'LIBERAL_' + year; }

/* ════════════════════════════════════════════════════════════════════
   RELEVÉ MENSUEL DE L'ADMINISTRATION — onglet LIBERAL_CA_{Y} (Lot 2B).

   ⚠️ AUCUNE ÉCRITURE PAR LE CODE. Arthur recopie le relevé À LA MAIN dans
   l'onglet ; le module ne fait que LIRE. La gestion du libéral n'est pas du
   ressort du comité : rien de tout ceci ne passe par admin.html.

   ⚠️ LE RELEVÉ EST UN CUMUL, pas un flux. Le document de juin s'intitule
   « ACTIVITES 2026 - JANVIER a JUIN 2026 » : il contient deja janvier a juin.
   La periode s'allonge chaque mois jusqu'au releve annuel de decembre. Un seul
   mois suffit donc a connaitre la position ; les mois anterieurs ne servent
   qu'a lire le FLUX (cumul_M moins cumul_M-1).

   ⚠️ LES EXCEDENTS SE RECOPIENT, ILS NE SE RECALCULENT PAS. Repartir d'un
   pourcentage arrondi a 2 decimales fausse le total de plusieurs dizaines
   d'euros et le checksum ne tombe plus.

   Colonnes : MOIS | MAR_ID | T_CCAM | PCT_CCAM | EXC_CCAM | T_NGAP | PCT_NGAP | EXC_NGAP
   Zone de controle (colonnes J a M) : par mois, somme des excedents recopies
   face au total « ACTIVITE LIBERALE » du bas du document. Vert = ca tombe.
   ══════════════════════════════════════════════════════════════════ */
/* À EXÉCUTER DEPUIS L'ÉDITEUR APPS SCRIPT (liste déroulante -> Exécuter) pour créer
   l'onglet du relevé. Sans argument : Arthur n'a rien à taper.
   ⚠️ Poser les O dans la colonne LIBERAL de MEDECINS AVANT de l'exécuter — c'est
   elle qui construit les lignes. La fonction est idempotente : si l'onglet existe
   déjà, elle n'y touche pas (il faudrait le supprimer pour le reconstruire). */
function creerReleveLiberalAnneeEnCours() {
  const y = new Date().getFullYear();
  const sh = getOrCreateLiberalCaTab(y);
  Logger.log('Onglet ' + sh.getName() + ' : ' + (sh.getLastRow() - 1) + ' lignes.');
}

const LIBERAL_CA_HEADER = ['MOIS', 'MAR_ID', 'T_CCAM', 'PCT_CCAM', 'EXC_CCAM',
                           'T_NGAP', 'PCT_NGAP', 'EXC_NGAP'];
function _libCaSheetName(year) { return 'LIBERAL_CA_' + year; }

// Membres du groupement (colonne LIBERAL = O de MEDECINS), dans l'ordre de l'onglet.
function _membresLiberal_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (!data.length) return [];
  let colLib = -1;
  for (let c = 0; c < data[0].length; c++) {
    if (String(data[0][c]).trim().toUpperCase() === 'LIBERAL') { colLib = c; break; }
  }
  if (colLib < 0) return [];
  const out = [];
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0] || '').trim();
    if (!id) continue;
    if (String(data[r][colLib]).trim().toUpperCase() === 'O') out.push(id);
  }
  return out;
}

/* Cree l'onglet de l'annee et le PRE-REMPLIT : 12 mois x N membres, MOIS et MAR_ID
   deja poses. Il ne reste que les six nombres a taper, en face du bon identifiant.
   Idempotente : si l'onglet existe deja, elle n'y touche pas (une saisie manuelle
   fait toujours foi). */
function getOrCreateLiberalCaTab(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = _libCaSheetName(year);
  let sh = ss.getSheetByName(name);
  if (sh) return sh;

  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, LIBERAL_CA_HEADER.length).setValues([LIBERAL_CA_HEADER]).setFontWeight('bold');
  sh.setFrozenRows(1);

  const membres = _membresLiberal_();
  const lignes = [];
  for (let m = 1; m <= 12; m++) {
    const mois = year + '-' + (m < 10 ? '0' + m : String(m));
    membres.forEach(function (id) { lignes.push([mois, id, '', '', '', '', '', '']); });
  }
  if (lignes.length) sh.getRange(2, 1, lignes.length, LIBERAL_CA_HEADER.length).setValues(lignes);

  // ── Zone de controle (J:M), une ligne par mois ──
  const n = lignes.length + 1;                       // derniere ligne de donnees
  sh.getRange(1, 10, 1, 4)
    .setValues([['MOIS', 'SOMME EXC RECOPIES', 'TOTAL DU DOCUMENT', 'CONTROLE']])
    .setFontWeight('bold');
  const ctrl = [];
  for (let m = 1; m <= 12; m++) {
    const mois = year + '-' + (m < 10 ? '0' + m : String(m));
    const r = m + 1;
    ctrl.push([
      mois,
      '=SUMIF($A$2:$A$' + n + ';$J' + r + ';$E$2:$E$' + n + ')+SUMIF($A$2:$A$' + n + ';$J' + r + ';$H$2:$H$' + n + ')',
      '',                                            // a recopier : ligne « ACTIVITE LIBERALE » du PDF
      // ⚠️ FORMULES EN ANGLAIS OBLIGATOIREMENT. setValues() n'accepte QUE les noms
      // anglais, meme dans un classeur en francais : SI/ARRONDI/TEXTE renvoient
      // #NAME? (constate le 27/07/2026). SUMIF ci-dessus marchait par chance.
      // TEXTE/TEXT est en outre a proscrire : son code de format attend une virgule
      // decimale en francais et un point en anglais. Une concatenation simple laisse
      // Sheets formater le nombre selon la langue du classeur.
      '=IF($L' + r + '="";"—";IF(ROUND($K' + r + ';2)=ROUND($L' + r + ';2);"OK";"ECART "&ROUND($K' + r + '-$L' + r + ';2)&" EUR"))'
    ]);
  }
  sh.getRange(2, 10, ctrl.length, 4).setValues(ctrl);
  sh.setColumnWidth(10, 90); sh.setColumnWidth(11, 150);
  sh.setColumnWidth(12, 150); sh.setColumnWidth(13, 170);
  return sh;
}

/* (17/08/2026) LE MOIS DU RELEVE PEUT ETRE UNE DATE, PAS DU TEXTE.
   getOrCreateLiberalCaTab ecrit la chaine '2026-07' ; Sheets la RECONNAIT comme
   une date et stocke une vraie date. getValues() renvoie alors un objet Date,
   dont String() donne 'Wed Jul 01 2026 00:00:00 GMT+0200'. Constate le
   17/08/2026 sur les 228 cellules de LIBERAL_CA_2026. Deux consequences, vues
   a l'ecran : la page affichait « cumul janvier -> undefined Wed », et le
   « dernier mois », choisi par un tri alphabetique, comparait des NOMS DE JOURS
   ANGLAIS — il serait reste bloque sur juillet jusqu'en decembre (Sat, Sun,
   Thu, Tue passent tous avant Wed).
   On normalise ICI, a la lecture : le classeur n'est pas touche, les mois deja
   saisis sont rattrapes, et 'AAAA-MM' se trie de nouveau dans l'ordre.
   Canard-typage volontaire (pas `instanceof Date`) : au banc, la date vient
   d'un autre contexte d'execution et `instanceof` y serait faux. */
function _libMoisISO_(v) {
  if (v && typeof v.getFullYear === 'function' && !isNaN(v.getTime())) {
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
  }
  const m = /^(\d{4})-(\d{2})/.exec(String(v == null ? '' : v).trim());
  return m ? (m[1] + '-' + m[2]) : '';
}

// Lecture : lignes NON VIDES de l'annee. Un mois non encore recopie n'existe pas.
function getReleveLiberal(payload) {
  const year = parseInt(payload && payload.year, 10) || _libYearOf(_todayISO_());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(_libCaSheetName(year));
  if (!sh) return { success: true, year: year, items: [] };
  const rows = sh.getDataRange().getValues();
  const num = function (v) {
    if (v === '' || v === null || v === undefined) return null;
    const x = Number(String(v).replace(',', '.').replace(/\s/g, ''));
    return isFinite(x) ? x : null;
  };
  // Table id -> nom d'affichage : la page ne recoit que des MAR_ID, et aucune autre
  // action ne permet de les traduire (listAnnuaire renvoie les noms SANS les id).
  // Visibilite totale entre membres : l'argent est mutualise (decision 5, §3).
  const noms = {};
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const dm = med.getDataRange().getValues();
    for (let r = 1; r < dm.length; r++) {
      const mid = String(dm[r][0] || '').trim();
      if (mid) noms[mid] = { nom: String(dm[r][1] || '').trim() || mid,
                             initiales: String(dm[r][2] || '').trim() };
    }
  }
  const items = [];
  for (let r = 1; r < rows.length; r++) {
    const mois = _libMoisISO_(rows[r][0]);          // Date OU texte -> 'AAAA-MM'
    const id   = String(rows[r][1] || '').trim();
    if (!mois || !id) continue;
    const meta = noms[id] || {};
    const o = {
      mois: mois, marId: id,
      nom: meta.nom || id, initiales: meta.initiales || id,
      tCcam: num(rows[r][2]), pctCcam: num(rows[r][3]), excCcam: num(rows[r][4]),
      tNgap: num(rows[r][5]), pctNgap: num(rows[r][6]), excNgap: num(rows[r][7]),
    };
    // Ligne pre-remplie mais pas encore saisie : on ne la renvoie pas.
    if (o.tCcam === null && o.tNgap === null) continue;
    items.push(o);
  }

  /* AFFECTATIONS RESTANTES (27/07/2026) — descriptif, rien d'autre.
     Le suivi affiche les secteurs des mois qui restent a courir. On ne dit PAS
     « ca s'arrange » ou « ca s'aggrave » : traduire un mois d'ORL en euros suppose
     le rendement par specialite, pas encore mesure (Lot 2C). Inventer ce chiffre
     reviendrait a dire « vas-y » a quelqu'un qui doit s'arreter.
     ⚠️ Portee VOLONTAIREMENT ETROITE : uniquement les MAR presents dans le releve,
     uniquement les mois >= mois en cours. L'action getAffectations reste reservee
     a l'admin — on n'ouvre pas une action entiere pour une colonne. */
  const moisCourant = new Date().getMonth() + 1;
  const aff = {};
  const shAff = ss.getSheetByName('AFFECTATIONS_' + year);
  if (shAff) {
    const presents = {};
    items.forEach(function (i) { presents[i.marId] = true; });
    const da = shAff.getDataRange().getValues();
    for (let r = 1; r < da.length; r++) {
      const id = String(da[r][0] || '').trim();
      if (!id || !presents[id]) continue;
      const suite = [];
      for (let m = moisCourant; m <= 12; m++) {
        const v = String(da[r][m] || '').trim().toUpperCase();
        if (v) suite.push({ mois: m, secteur: v });
      }
      if (suite.length) aff[id] = suite;
    }
  }
  return { success: true, year: year, moisCourant: moisCourant, affectations: aff, items: items };
}

/* ════════════════════════════════════════════════════════════════════
   SPECIALITES — maille du RENDEMENT liberal (Lot 2A).
   Pourquoi pas le secteur : en janvier 2027 le bloc ORL disparait dans un
   'Bloc Court' mutualise. Un rendement attache au secteur serait perime ce
   jour-la ; attache a la specialite il est permanent (une cataracte rapporte
   autant quelle que soit la salle).
   Plus FINE que le secteur la ou un secteur melange deux rendements :
   OPH separee d'ORL (la cataracte est le moteur), URO separee de VIS.
   Editable en cellule, jamais en dur cote page.
   ══════════════════════════════════════════════════════════════════ */
const SPECIALITES_TAB = 'SPECIALITES';
const _SPECIALITES_HEADER = ['CODE', 'LABEL', 'ACTIF'];
const _SPECIALITES_SEED = [
  ['OPH', 'Ophtalmologie (cataracte)', 'O'],
  ['ORL', 'ORL / stomatologie',        'O'],
  ['VIS', 'Visceral / digestif',       'O'],
  ['URO', 'Urologie',                  'O'],
  ['ORT', 'Orthopedie',                'O'],
  ['END', 'Endoscopies digestives',    'O'],
  ['GYN', 'Gynecologie / obstetrique', 'O'],
  ['PED', 'Pediatrie',                 'O'],
  ['CI',  'Cardiologie interventionnelle', 'O'],
  ['RI',  'Radiologie interventionnelle', 'O'],
  ['VAS', 'Vasculaire',                'O'],
  ['AUT', 'Autre',                     'O'],
];

/* ════════════════════════════════════════════════════════════════════
   COTATIONS_TYPE — combinaisons de cotation frequentes (27/07/2026).
   Motif : la cotation devient necessaire pour TOUS les patients liberaux, pas
   seulement ceux qui ont un depassement. Le creneau le plus charge est la
   consultation d'endoscopie du mardi et du jeudi apres-midi, composee a 100 % de
   patients liberaux. Une cotation type remplit le tableau de cotation en un clic.

   ⚠️ UNIQUEMENT DES LIGNES D'ACTIVITE 4. Sur un releve de gastro-colo, les lignes
   d'activite 1 appartiennent a l'operateur (le gastro-enterologue) : les inclure
   gonflerait la BR du MAR d'environ 300 EUR et son quota des 30 % avec.

   ⚠️ AUCUN TARIF ICI. Le tarif vient de l'index CCAM (ccam_actes.json) a partir du
   code : une seule source, pas de valeur a maintenir a deux endroits.

   ⚠️ PAS DE MODIFICATEUR D'URGENCE (S, U, O, F, P). Il n'y a pas de liberal en
   urgence au service (regle Arthur, 27/07). Le modificateur 7 (presence permanente de
   l'anesthesiste, +6 %) est en revanche systematique sur les releves observes.

   GROUPE : contexte de travail (ex. « Endoscopie »). La page n'affiche QUE les
   cotations types du groupe choisi, et RIEN tant qu'aucun groupe n'est choisi.
   Motif : au-dela d'une dizaine de boutons l'affichage devient illisible ; grouper
   par contexte tient a 50 comme a 3. Un groupe se cree en le tapant dans la cellule.

   Colonnes : GROUPE | NOM | ORDRE | CODE | ROLE | MOD7 | MODA | LC
   ROLE : principal | associe (50 %) | complement (100 % en sus)
   LC   : lettre-cle de la consultation associee, sur la 1re ligne de la cotation type.
   ══════════════════════════════════════════════════════════════════ */
const COTATIONS_TYPE_TAB = 'COTATIONS_TYPE';
const _COTTYPE_HEADER = ['GROUPE', 'NOM', 'ORDRE', 'CODE', 'ROLE', 'MOD7', 'MODA', 'LC'];
const _COTTYPE_SEED = [
  ['Endoscopie', 'Gastro + colo', 1, 'HHQE002', 'principal', 'O', 'N', 'CS'],
  ['Endoscopie', 'Gastro + colo', 2, 'ZZLP025', 'associe',   'O', 'N', ''  ],
  ['Endoscopie', 'Gastro seule',  1, 'ZZLP025', 'principal', 'O', 'N', 'CS'],
  ['Endoscopie', 'Colo seule',    1, 'HHQE002', 'principal', 'O', 'N', 'CS'],
];

function getOrCreateCotationsTypeTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(COTATIONS_TYPE_TAB);
  if (!sh) {
    sh = ss.insertSheet(COTATIONS_TYPE_TAB);
    sh.getRange(1, 1, 1, _COTTYPE_HEADER.length).setValues([_COTTYPE_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _COTTYPE_SEED.length, _COTTYPE_HEADER.length).setValues(_COTTYPE_SEED);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180);
  } else if (sh.getLastRow() < 2) {
    sh.getRange(1, 1, 1, _COTTYPE_HEADER.length).setValues([_COTTYPE_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _COTTYPE_SEED.length, _COTTYPE_HEADER.length).setValues(_COTTYPE_SEED);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < _COTTYPE_HEADER.length) {
    // L'onglet a ete cree en 7 colonnes (sans GROUPE) : on insere la colonne en tete
    // et on la remplit avec 'Endoscopie', puisque c'est le seul groupe amorce.
    sh.insertColumnBefore(1);
    sh.getRange(1, 1, 1, _COTTYPE_HEADER.length).setValues([_COTTYPE_HEADER]).setFontWeight('bold');
    const n = sh.getLastRow() - 1;
    if (n > 0) sh.getRange(2, 1, n, 1).setValue('Endoscopie');
    Logger.log('Onglet COTATIONS_TYPE : colonne GROUPE ajoutee.');
  }
  return sh;
}

// Lecture -> [{nom, lc, lignes:[{code, role, mod7, modA}]}], dans l'ordre de l'onglet.
function getCotationsType() {
  const rows = getOrCreateCotationsTypeTab().getDataRange().getValues();
  const out = [], index = {};
  for (let r = 1; r < rows.length; r++) {
    const groupe = String(rows[r][0] || '').trim();
    const nom    = String(rows[r][1] || '').trim();
    const code   = String(rows[r][3] || '').trim().toUpperCase();
    if (!groupe || !nom || !code) continue;            // ligne incomplete : ignoree
    const cle = groupe + '|' + nom;                    // deux groupes peuvent porter le meme nom
    if (!index[cle]) { index[cle] = { groupe: groupe, nom: nom, lc: '', lignes: [] }; out.push(index[cle]); }
    const role = String(rows[r][4] || '').trim().toLowerCase();
    index[cle].lignes.push({
      code:  code,
      ordre: Number(rows[r][2]) || (index[cle].lignes.length + 1),
      role:  (role === 'associe' || role === 'complement') ? role : 'principal',
      mod7:  String(rows[r][5] || '').trim().toUpperCase() === 'O',
      modA:  String(rows[r][6] || '').trim().toUpperCase() === 'O',
    });
    const lc = String(rows[r][7] || '').trim().toUpperCase();
    if (lc && !index[cle].lc) index[cle].lc = lc;      // 1re valeur rencontree
  }
  out.forEach(function (c) { c.lignes.sort(function (a, b) { return a.ordre - b.ordre; }); });
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   ECRITURE DES COTATIONS TYPES (17/08/2026)

   Jusqu'ici l'onglet se remplissait A LA MAIN : huit colonnes, le bon code
   CCAM de memoire, « associe » sans accent, l'ordre en chiffres. Pour trente
   cotations c'est long, et une erreur ne se voit qu'au moment ou quelqu'un
   clique sur le bouton, en consultation, devant un patient.

   ⚠️ CE QUE LE SERVEUR NE PEUT PAS VERIFIER : que le code existe et porte un
   tarif d'anesthesie. Le referentiel CCAM vit dans le depot (ccam_actes.json),
   pas dans le classeur. C'est la PAGE qui refuse un code sans tarif, a la
   source. Le serveur ne controle donc que la FORME du code. Une cotation
   fabriquee autrement qu'avec la page peut poser une ligne a 0 EUR.
   ══════════════════════════════════════════════════════════════════ */
const _COTTYPE_ROLES = { principal: 1, associe: 1, complement: 1 };
const _COTTYPE_LC    = { '': 1, CS: 1, C: 1, APC: 1 };

/* Qui a le droit de SUPPRIMER. Le depot est public : aucun nom n'y est ecrit.
   L'onglet CONFIG porte la cle LIBERAL_ADMIN, dont la valeur est un ID de
   MEDECINS. Absente ou vide, PERSONNE ne supprime — un droit qui s'ouvre tout
   seul par oubli de configuration serait le mauvais defaut. */
function _cotTypeAdminId_() {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    const d = sh ? sh.getDataRange().getValues() : [];
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][0]).trim() === 'LIBERAL_ADMIN') return String(d[r][1] || '').trim().toUpperCase();
    }
  } catch (e) { /* CONFIG illisible : personne ne supprime */ }
  return '';
}

function _cotTypeMembre_(user) {
  return !!(user && user.role === 'mar' && user.liberal);
}

/* Liste + droits, en un appel. La page d'edition ne passe PAS par la copie de
   lecture : apres un enregistrement, elle doit voir l'etat REEL du classeur,
   pas une copie qui peut avoir jusqu'a une heure de retard. */
function listCotationsTypeEdit(payload, user) {
  if (!_cotTypeMembre_(user)) return { success: false, error: 'Réservé aux membres du groupement libéral.' };
  const admin = _cotTypeAdminId_();
  return {
    success: true,
    items: getCotationsType(),
    peutSupprimer: !!admin && String(user.id || '').toUpperCase() === admin,
  };
}

function _cotTypeValide_(payload) {
  const groupe = String((payload && payload.groupe) || '').trim().slice(0, 40);
  const nom    = String((payload && payload.nom)    || '').trim().slice(0, 60);
  const lc     = String((payload && payload.lc)     || '').trim().toUpperCase();
  const brutes = (payload && payload.lignes) || [];
  if (!groupe) return { err: 'Contexte obligatoire.' };
  if (!nom)    return { err: 'Nom obligatoire.' };
  if (!_COTTYPE_LC[lc]) return { err: 'Consultation associée inconnue : ' + lc };
  if (!brutes.length)   return { err: 'Au moins un acte est nécessaire.' };
  if (brutes.length > 12) return { err: 'Douze actes au maximum.' };
  const lignes = [];
  for (let i = 0; i < brutes.length; i++) {
    const code = String(brutes[i].code || '').trim().toUpperCase();
    const role = String(brutes[i].role || '').trim().toLowerCase();
    if (!/^[A-Z]{4}[0-9]{3}$/.test(code)) return { err: 'Code CCAM invalide : ' + code };
    if (!_COTTYPE_ROLES[role])            return { err: 'Rôle inconnu : ' + role };
    lignes.push({ code: code, role: role, modA: !!brutes[i].modA });
  }
  return { groupe: groupe, nom: nom, lc: lc, lignes: lignes };
}

/* Supprime les lignes d'une cotation (groupe|nom) et renvoie le nombre retire.
   De bas en haut : supprimer par le haut decale les indices restants. */
function _cotTypeRetirer_(sh, groupe, nom) {
  const rows = sh.getDataRange().getValues();
  let n = 0;
  for (let r = rows.length - 1; r >= 1; r--) {
    if (String(rows[r][0] || '').trim() === groupe && String(rows[r][1] || '').trim() === nom) {
      sh.deleteRow(r + 1); n++;
    }
  }
  return n;
}

function saveCotationType(payload, user) {
  if (!_cotTypeMembre_(user)) return { success: false, error: 'Réservé aux membres du groupement libéral.' };
  const v = _cotTypeValide_(payload);
  if (v.err) return { success: false, error: v.err };
  const ancienGroupe = String((payload && payload.ancienGroupe) || '').trim();
  const ancienNom    = String((payload && payload.ancienNom)    || '').trim();

  /* Verrou : l'ecriture est un RETRAIT suivi d'un AJOUT. Sans verrou, deux
     enregistrements simultanes entrelaceraient leurs lignes et fabriqueraient
     une cotation composite — que personne ne pourrait attribuer. */
  const verrou = LockService.getScriptLock();
  try { verrou.waitLock(15000); }
  catch (e) { return { success: false, error: 'Classeur occupé, réessayez dans quelques secondes.' }; }
  try {
    const sh = getOrCreateCotationsTypeTab();

    // Renommage : on retire l'ancienne cle. Creation ou modification sur place :
    // on retire la cle courante (idempotent si elle n'existe pas encore).
    if (ancienGroupe && ancienNom && (ancienGroupe !== v.groupe || ancienNom !== v.nom)) {
      _cotTypeRetirer_(sh, ancienGroupe, ancienNom);
    } else if (!ancienNom) {
      // Creation : un homonyme dans le meme contexte serait indistinguable a
      // l'ecran (deux boutons du meme nom) — on refuse plutot que d'ecraser.
      const dejaLa = getCotationsType().some(function (c) { return c.groupe === v.groupe && c.nom === v.nom; });
      if (dejaLa) return { success: false, error: 'Une cotation « ' + v.nom + ' » existe déjà dans ce contexte.' };
    }
    _cotTypeRetirer_(sh, v.groupe, v.nom);

    /* MOD7 TOUJOURS 'O' : la presence permanente de l'anesthesiste est
       systematique sur les releves observes (regle posee le 27/07). Le
       modificateur A, lui, depend de l'AGE DU PATIENT (moins de 4 ans, plus de
       80) : il ne peut pas etre fige dans une cotation type et reste cochable
       acte par acte sur la page de cotation. */
    const lignes = v.lignes.map(function (l, i) {
      return [v.groupe, v.nom, i + 1, l.code, l.role, 'O', l.modA ? 'O' : 'N', i === 0 ? v.lc : ''];
    });
    sh.getRange(sh.getLastRow() + 1, 1, lignes.length, _COTTYPE_HEADER.length).setValues(lignes);
    return { success: true, groupe: v.groupe, nom: v.nom, lignes: lignes.length };
  } finally {
    try { verrou.releaseLock(); } catch (e) {}
  }
}

function deleteCotationType(payload, user) {
  if (!_cotTypeMembre_(user)) return { success: false, error: 'Réservé aux membres du groupement libéral.' };
  /* SUPPRESSION RESERVEE (decision d'Arthur, 17/08/2026). La bibliotheque est
     commune : n'importe lequel des 19 pourrait sinon effacer le travail d'un
     autre, sans trace et sans que personne s'en apercoive avant la prochaine
     consultation. Creer et modifier restent ouverts a tous. */
  const admin = _cotTypeAdminId_();
  if (!admin || String(user.id || '').toUpperCase() !== admin) {
    return { success: false, error: 'La suppression est réservée au responsable du module libéral.' };
  }
  const groupe = String((payload && payload.groupe) || '').trim();
  const nom    = String((payload && payload.nom)    || '').trim();
  if (!groupe || !nom) return { success: false, error: 'Cotation à supprimer non identifiée.' };

  const verrou = LockService.getScriptLock();
  try { verrou.waitLock(15000); }
  catch (e) { return { success: false, error: 'Classeur occupé, réessayez dans quelques secondes.' }; }
  try {
    const n = _cotTypeRetirer_(getOrCreateCotationsTypeTab(), groupe, nom);
    if (!n) return { success: false, error: 'Cotation introuvable — déjà supprimée ?' };
    return { success: true, lignes: n };
  } finally {
    try { verrou.releaseLock(); } catch (e) {}
  }
}

function getOrCreateSpecialitesTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SPECIALITES_TAB);
  if (!sh) {
    sh = ss.insertSheet(SPECIALITES_TAB);
    sh.getRange(1, 1, 1, _SPECIALITES_HEADER.length).setValues([_SPECIALITES_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SPECIALITES_SEED.length, _SPECIALITES_HEADER.length).setValues(_SPECIALITES_SEED);
    sh.setFrozenRows(1);
    sh.setColumnWidth(2, 240);
  } else if (sh.getLastRow() < 2) {
    // Onglet present mais vide (en-tete seul) -> on amorce.
    sh.getRange(1, 1, 1, _SPECIALITES_HEADER.length).setValues([_SPECIALITES_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SPECIALITES_SEED.length, _SPECIALITES_HEADER.length).setValues(_SPECIALITES_SEED);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Liste pour la page : [{code, label, actif}], ordre de l'onglet.
function getSpecialites() {
  const rows = getOrCreateSpecialitesTab().getDataRange().getValues();
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const code = String(rows[r][0] || '').trim().toUpperCase();
    if (!code) continue;
    out.push({
      code:  code,
      label: String(rows[r][1] || '').trim() || code,
      actif: String(rows[r][2] || '').trim().toUpperCase() === 'O',
    });
  }
  return out;
}

// Set des codes ACTIFS, pour valider une declaration.
function _specialitesActives_() {
  const s = {};
  getSpecialites().forEach(function (x) { if (x.actif) s[x.code] = true; });
  return s;
}

// Onglet de l'année du JOUR DE BLOC, créé à la volée (comme SECTEURS).
function _getOrCreateLiberalTab(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = _libSheetName(year);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, LIBERAL_HEADER.length).setValues([LIBERAL_HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, LIBERAL_HEADER.length).setValues([LIBERAL_HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < LIBERAL_HEADER.length) {
    // Migration douce 2A : onglet DEJA REMPLI en 6 colonnes -> on ecrit l'en-tete
    // a 9. Les lignes existantes gardent leurs valeurs et laissent les 3 nouvelles
    // cellules vides : aucune reecriture, aucune perte. Idempotente.
    sh.getRange(1, 1, 1, LIBERAL_HEADER.length).setValues([LIBERAL_HEADER]).setFontWeight('bold');
    Logger.log('Onglet ' + name + ' : colonnes SPECIALITE / BR_CCAM / BR_NGAP ajoutees.');
  }
  return sh;
}

// 'yyyy-MM-dd' → année (nombre). Rejette tout ce qui n'est pas une date ISO.
function _libYearOf(dateBloc) {
  const s = String(dateBloc || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}

function _libNewId() {
  return 'L-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

// ── ÉCRITURE : déclarer (ou compléter) une intervention ──────────────
function declareLiberal(payload, user) {
  if (!user || user.role !== 'mar') return { success: false, error: 'Réservé aux MAR identifiés.' };
  const marId  = user.id;                                    // JAMAIS payload : anti-usurpation
  // _isoDate() : DEFINITION UNIQUE, plus haut dans CE fichier (le doublon
  // d'Indispos.gs a ete supprime le 29/07/2026 — les deux versions divergeaient,
  // l'ordre des fichiers dans Apps Script decidait laquelle tournait).
  // _isoDate(undefined) renvoie '' : la garde ci-dessous reste par prudence.
  const dateBloc = (payload && payload.dateBloc) ? _isoDate(payload.dateBloc) : '';
  const secteur  = String((payload && payload.secteur) || '').trim().toUpperCase();
  const chir     = String((payload && payload.chirurgie) || '').trim().slice(0, 80);
  // _isoDate(undefined) renvoie '' depuis l'unification du 29/07/2026 : la garde
  // reste, elle choisit aujourd'hui quand la valeur est absente.
  const dateCons = (payload && payload.dateConsult) ? _isoDate(payload.dateConsult) : _todayISO_();
  // Lot 2A : specialite (maille du rendement) + BR des deux axes. La BR NGAP se
  // rattache au mois de DATE_CONSULT, la BR CCAM a celui de DATE_BLOC : c'est
  // pour cela que les deux dates sont stockees separement.
  const spec    = String((payload && payload.specialite) || '').trim().toUpperCase();
  const brCcam  = _libMoney_(payload && payload.brCcam);
  const brNgap  = _libMoney_(payload && payload.brNgap);

  if (!dateBloc)  return { success: false, error: 'Jour du bloc manquant ou invalide.' };
  const year = _libYearOf(dateBloc);
  if (!year)      return { success: false, error: 'Jour du bloc invalide.' };
  if (!secteur)   return { success: false, error: 'Secteur obligatoire.' };
  // Specialite VIDE toleree : entre le deploiement du serveur et la mise en ligne
  // de la page enrichie, l'ancienne page envoie encore l'ancien payload. Elle ne
  // doit pas tomber en erreur. Une specialite FOURNIE, en revanche, doit exister
  // et etre active : une faute de frappe creerait une specialite fantome qui
  // fausserait le rendement sans que rien ne le signale.
  if (spec && !_specialitesActives_()[spec]) {
    return { success: false, error: 'Specialite inconnue : ' + spec };
  }

  const sh = _getOrCreateLiberalTab(year);

  /* ══ JETON UNIQUE (17/08/2026) ══════════════════════════════════
     Le reseau peut perdre la REPONSE d'une ecriture qui a reussi : on croit
     l'echec, on recommence, et la declaration part deux fois. Personne ne le
     verrait — deux endoscopies le meme jour dans le meme secteur sont
     parfaitement plausibles. La page joint donc un jeton qu'elle ne change
     PAS entre deux tentatives ; une declaration deja portee par ce jeton
     renvoie un succes SANS rien reecrire. Protege aussi du double appui.
     Le jeton est range dans la colonne ID, prefixe : aucune colonne de plus,
     et il reste unique par construction. */
  const jeton = String((payload && payload.jeton) || '').trim().slice(0, 40);
  if (jeton && /^[A-Za-z0-9_-]+$/.test(jeton)) {
    const dejaVu = sh.getDataRange().getValues();
    for (let r = 1; r < dejaVu.length; r++) {
      if (String(dejaVu[r][0]).trim() === 'J-' + jeton) {
        return { success: true, merged: false, id: 'J-' + jeton, rejoue: true };
      }
    }
  }

  // Lot 2A : PLUS DE FUSION. Une ligne = UN PATIENT. L'ancienne version fusionnait
  // meme MAR + meme jour + meme secteur, ce qui rendait les interventions
  // incomptables (8 cataractes = 1 ligne) et interdisait toute mesure de rendement.
  const id = (jeton && /^[A-Za-z0-9_-]+$/.test(jeton)) ? ('J-' + jeton) : _libNewId();
  sh.appendRow([id, dateCons, dateBloc, marId, secteur, chir, spec, brCcam, brNgap]);
  return { success: true, merged: false, id: id };
}

// ── ÉCRITURE : supprimer une de SES lignes ───────────────────────────
function deleteLiberal(payload, user) {
  if (!user || user.role !== 'mar') return { success: false, error: 'Réservé aux MAR identifiés.' };
  const marId = user.id;
  const id    = String((payload && payload.id) || '').trim();
  const year  = parseInt(payload && payload.year, 10);
  if (!id)   return { success: false, error: 'Identifiant manquant.' };
  if (!year) return { success: false, error: 'Année manquante.' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(_libSheetName(year));
  if (!sh) return { success: false, error: 'Aucune déclaration cette année.' };
  const data = sh.getDataRange().getValues();

  /* (02/08/2026) La recherche se faisait sur le SEUL identifiant, et s'arretait a la
     premiere ligne trouvee. LIBERAL_2026 contient dix lignes partageant un meme ID
     (heritage d'un ancien schema d'ID par fusion) appartenant a des MAR differents :
     tous sauf le proprietaire de la premiere occurrence recevaient « pas la votre »
     et ne pouvaient plus supprimer leur propre declaration. On cherche desormais sur
     ID + MAR_ID, ce qui rend la suppression insensible aux doublons d'identifiant. */
  let trouveAutreMar = false;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() !== id) continue;
    if (String(data[r][3]).trim() === marId) {
      sh.deleteRow(r + 1);
      return { success: true, id: id };
    }
    trouveAutreMar = true;
  }
  if (trouveAutreMar) return { success: false, error: 'Cette déclaration n\'est pas la vôtre.' };
  return { success: false, error: 'Déclaration introuvable (déjà supprimée ?).' };
}

// ── LECTURE COMITÉ : toutes les déclarations d'UN JOUR ───────────────
// Sert au volet « Libéral » du planning (admin.html). Renvoie les MAR_ID bruts :
// admin.html tient déjà `marsData` en mémoire pour résoudre les noms, inutile de
// les transporter. AUCUN jugement de placement n'est calculé ici — le module
// énonce un fait, le comité décide seul.
function listLiberalJour(payload, user) {
  if (!user || user.role !== 'admin') return { success: false, error: 'Réservé au comité.' };
  const date = (payload && payload.date) ? _isoDate(payload.date) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Date invalide.' };
  const year = _libYearOf(date);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(_libSheetName(year));
  if (!sh) return { success: true, date: date, items: [] };   // année sans déclaration : liste vide, pas une erreur

  const data = sh.getDataRange().getValues();
  const items = [];
  for (let r = 1; r < data.length; r++) {
    if (_isoDate(data[r][2]) !== date) continue;
    /* (2026-08-05.2) RÉPONSE ALLÉGÉE. Le volet du comité n'affiche que QUI
       opère, dans quel SECTEUR, et le libellé de chirurgie (vérifié dans
       renderLiberalCard, admin.html) : il regroupe par MAR + secteur et
       compte les interventions. Les montants (br CCAM / NGAP) et la
       spécialité voyageaient donc jusqu'au navigateur SANS AUCUN USAGE.
       Ils restent désormais dans le classeur — moins de donnée sensible en
       circulation, et cette liste devient mirrorable (affichage instantané). */
    items.push({
      marId:     String(data[r][3]).trim(),
      secteur:   String(data[r][4]).trim().toUpperCase(),
      chirurgie: String(data[r][5] || '').trim(),
    });
  }
  items.sort((a, b) => String(a.marId).localeCompare(String(b.marId)));
  return { success: true, date: date, items: items };
}

// ── LECTURE : MES déclarations de l'année (filtrées sur MON id) ───────
function listLiberal(payload, user) {
  if (!user || user.role !== 'mar') return { success: false, error: 'Réservé aux MAR identifiés.' };
  const marId = user.id;
  const year  = parseInt(payload && payload.year, 10) || _libYearOf(_todayISO_());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(_libSheetName(year));
  if (!sh) return { success: true, year: year, items: [] };

  const data = sh.getDataRange().getValues();
  const items = [];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][3]).trim() !== marId) continue;       // JAMAIS les lignes d'un autre
    items.push({
      id:          String(data[r][0]),
      dateConsult: _isoDate(data[r][1]),
      dateBloc:    _isoDate(data[r][2]),
      secteur:     String(data[r][4]).trim().toUpperCase(),
      chirurgie:   String(data[r][5] || '').trim(),
      specialite:  String(data[r][6] || '').trim().toUpperCase(),
      brCcam:      _libMoney_(data[r][7]),
      brNgap:      _libMoney_(data[r][8]),
    });
  }
  items.sort((a, b) => String(a.dateBloc).localeCompare(String(b.dateBloc)));
  return { success: true, year: year, items: items };
}

/* ════════════════════════════════════════════════════════════════════
   SECTEURS — source unique externalisée (étape 2).
   Onglet 'SECTEURS' : redéfinir les secteurs sans toucher au code.
   Colonnes : ORDRE | CODE | LABEL | COURT | AFF | ICON | BG | FG | CS | ACTIF | RENDEMENT_LIB
   RENDEMENT_LIB (FORT/MOYEN/NUL/REA) : attribut de rendement libéral,
   consommé plus tard par le module libéral (réallocation). Éditable en cellule.
   ════════════════════════════════════════════════════════════════════ */
const SECTEURS_TAB = 'SECTEURS';

// En-tête + valeurs d'amorçage = les 9 secteurs actuels, à l'identique.
// (Les 4 valeurs RENDEMENT_LIB sont des défauts éditables : rien ne les
//  consomme encore. REA→REA et ORL→FORT sont établis ; le reste à ajuster.)
// XL_* (07/2026) : ce que l'EXPORT EXCEL doit écrire, qui diffère du web —
// le fichier reprend l'ancien tableau papier (noms courts en MAJUSCULES, couleurs
// franches, certains secteurs sur 1 seule ligne). Ajoutées EN FIN : les index de
// colonne 0-10 utilisés par getSecteurs() restent inchangés.
// Laisser vide = valeur par défaut (voir getSecteurs) : rien ne casse.
const _SECTEURS_HEADER = ['ORDRE','CODE','LABEL','COURT','AFF','ICON','BG','FG','CS','ACTIF','RENDEMENT_LIB',
                          'XL_LABEL','XL_BG','XL_ROWS'];

// Valeurs Excel des 9 secteurs actuels, pour l'amorçage et la migration.
const _SECTEURS_XL = {
  VIS: ['VISCERAL',        'FFE699', 2],
  REA: ['REANIMATION',     '9DC3E6', 2],
  ORT: ['ORTHO',           'F4B183', 2],
  DVI: ['DVI',             'F4B183', 1],
  ORL: ['ORL  OPHTALMO',   'FFF2CC', 2],
  END: ['ENDOSCOPIES',     'C6E0B4', 2],
  CI:  ['CARDIO INTERV.',  'E7E6E6', 1],
  RI:  ['RADIO / INTERV.', 'E7E6E6', 1],
  MAT: ['MATERNITE',       'FFA7A9', 2],
};
const _XL_BG_DEFAUT = 'F2F2F2';   // gris clair, pour un secteur sans couleur choisie
const _XL_ROWS_DEFAUT = 2;
const _SECTEURS_SEED = [
  [1,'VIS','Bloc viscéral',            'Viscéral', 'Viscéral',    'Activity',   '#EFF6FF','#1D4ED8','CS-VIS',   'O','MOYEN', 'VISCERAL'        , 'FFE699'  , 2],
  [2,'REA','Réanimation',              'Réa',      'Réanimation', 'HeartPulse', '#FFF1F2','#BE123C','',         'O','REA'  , 'REANIMATION'     , '9DC3E6'  , 2],
  [3,'ORT','Orthopédie',               'Ortho',    'Ortho',       'Bone',       '#FFF7ED','#C2410C','CS-ORT',   'O','FORT' , 'ORTHO'           , 'F4B183'  , 2],
  [4,'DVI','Pose DVI',                 'DVI',      '',            'Syringe',    '',       '',       '',         'O','NUL'  , 'DVI'             , 'F4B183'  , 1],
  [5,'ORL','ORL / Ophtalmologie',      'ORL',      'ORL',         'Eye',        '#FDF4FF','#7E22CE','CS-ORL',   'O','FORT' , 'ORL  OPHTALMO'   , 'FFF2CC'  , 2],
  [6,'END','Endoscopies',              'Endo',     'Endoscopies', 'Microscope', '#F0FDF4','#166534','CS-END',   'O','MOYEN', 'ENDOSCOPIES'     , 'C6E0B4'  , 2],
  [7,'CI', 'Cardio interventionnelle', 'Cardio',   'Cardio/Inter','Heart',      '#ECFDF5','#065F46','CS-INTER', 'O','MOYEN', 'CARDIO INTERV.'  , 'E7E6E6'  , 1],
  [8,'RI', 'Radio interventionnelle',  'Radio',    'Radio/Inter', 'Zap',        '#FFFBEB','#92400E','',         'O','MOYEN', 'RADIO / INTERV.' , 'E7E6E6'  , 1],
  [9,'MAT','Maternité',                'Maternité','Maternité',   'Baby',       '#FDF2F8','#9D174D','CS-MAT',   'O','NUL'  , 'MATERNITE'       , 'FFA7A9'  , 2],
];

// Crée l'onglet s'il manque, l'amorce s'il est vide. N'écrase JAMAIS des
// lignes existantes (les éditions manuelles font foi).
// ══════════════════════════════════════════════════════════════════════
//  ONGLET CS_TEMPLATE — créneaux de consultation de la semaine type
// ══════════════════════════════════════════════════════════════════════
// ÉTAPE 2a du chantier « secteurs » : on CRÉE l'onglet, on ne le consomme
// pas encore. `admin.html` continue d'utiliser sa table `CS_REQUIRED` : tant
// que l'étape 2c n'est pas faite, éditer cet onglet ne change RIEN à l'écran.
//
// Forme choisie : 1 ligne par type de consultation, 1 colonne par demi-journée
// — la semaine se lit d'un coup d'œil, et LABEL/OUVRABLE/ACTIF ne sont écrits
// qu'une fois (pas de répétition qui pourrait diverger).
//
// CODE     = clé TECHNIQUE. Écrite dans PLANNING_OVERRIDES et le planning publié :
//            ne JAMAIS la renommer sur un onglet en service (les affectations déjà
//            posées deviendraient orphelines). Pour changer d'organisation, ajouter
//            de nouvelles lignes et passer les anciennes à ACTIF=N.
// LABEL    = affichage seul, librement modifiable.
// OUVRABLE = O : le comité peut ouvrir ce créneau à la demande.
// ACTIF    = N : la ligne est ignorée sans être supprimée (garde l'historique).
//            C'est le mécanisme prévu pour le futur passage par secteur
//            (bloc court / bloc long) au lieu de par spécialité.
const CS_TEMPLATE_TAB = 'CS_TEMPLATE';

const _CS_TEMPLATE_HEADER = ['CODE','LABEL','OUVRABLE','ACTIF',
  'LUN_AM','LUN_PM','MAR_AM','MAR_PM','MER_AM','MER_PM','JEU_AM','JEU_PM','VEN_AM','VEN_PM',
  'XL_LABEL','XL_BG'];

// Libellés et couleurs de l'EXPORT EXCEL, qui diffèrent du web (le fichier reprend
// l'ancien tableau papier). Les mentions « / URO. » et « / OPHTALMO. » sont des
// abus de langage assumés : le bloc viscéral couvre viscéral ET uro, le bloc ORL
// couvre ORL ET ophtalmo — il n'existe PAS de code distinct pour ces spécialités.
const _CS_TEMPLATE_XL = {
  'CS-VIS':   [' VISC. / URO.',     'FFE699'],
  'CS-END':   [' ENDOSCOPIES',      'C6E0B4'],
  'CS-ORL':   [' ORL / OPHTALMO.',  'FFF2CC'],
  'CS-ORT':   [' ORTHO.',           'F4B183'],
  'CS-MAT':   [' MATERNITE',        'FFA7A9'],
  'CS-POLY':  [' POLYVALENT',       'F2F2F2'],
  'CS-INTER': [' INTERVENTIONNEL',  'E7E6E6'],
};

// Amorçage = les 23 créneaux actuels, repris À L'IDENTIQUE de CS_REQUIRED
// (admin.html), qui est la table réellement active aujourd'hui.
const _CS_TEMPLATE_SEED = [
  ['CS-VIS',   'CS Viscéral',        'O','O', 0,2, 0,1, 0,1, 0,1, 0,0, ' VISC. / URO.'     , 'FFE699'],
  ['CS-END',   'CS Endoscopies',     'O','O', 0,2, 0,1, 0,1, 0,2, 0,0, ' ENDOSCOPIES'      , 'C6E0B4'],
  ['CS-ORL',   'CS ORL',             'O','O', 0,0, 1,0, 1,0, 1,0, 1,0, ' ORL / OPHTALMO.'  , 'FFF2CC'],
  ['CS-ORT',   'CS Orthopédie',      'O','O', 0,0, 0,1, 0,1, 0,0, 1,0, ' ORTHO.'           , 'F4B183'],
  ['CS-MAT',   'CS Maternité',       'O','O', 0,0, 1,0, 0,0, 1,0, 0,0, ' MATERNITE'        , 'FFA7A9'],
  ['CS-POLY',  'CS Polyvalente',     'O','O', 0,0, 0,0, 1,0, 0,0, 0,0, ' POLYVALENT'       , 'F2F2F2'],
  ['CS-INTER', 'CS Interventionnel', 'O','O', 0,0, 0,0, 0,1, 0,1, 0,0, ' INTERVENTIONNEL'  , 'E7E6E6'],
];

// Crée l'onglet s'il manque, l'amorce s'il est vide. N'écrase JAMAIS de lignes
// existantes : une fois l'onglet rempli, les éditions manuelles font foi.
function getOrCreateCsTemplateTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CS_TEMPLATE_TAB);
  const amorcer = () => {
    sh.getRange(1, 1, 1, _CS_TEMPLATE_HEADER.length).setValues([_CS_TEMPLATE_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _CS_TEMPLATE_SEED.length, _CS_TEMPLATE_HEADER.length).setValues(_CS_TEMPLATE_SEED);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
    sh.setColumnWidth(1, 90);
    sh.setColumnWidth(2, 170);
  };
  if (!sh) { sh = ss.insertSheet(CS_TEMPLATE_TAB); amorcer(); }
  else if (sh.getLastRow() < 2) { amorcer(); }
  // (28/07/2026 perf) Meme raison que pour SECTEURS : getCsTemplate coutait 687 ms
  // parce que la migration relisait tout l'onglet une seconde fois. Elle ne tourne
  // plus que si des colonnes manquent. getCsTemplate() a ses propres defauts pour
  // les cellules XL vides.
  else if (sh.getLastColumn() < _CS_TEMPLATE_HEADER.length) _migrerColonnesXlCs_(sh);
  return sh;
}

// Migration douce (07/2026) : CS_TEMPLATE passe de 14 à 16 colonnes (XL_LABEL / XL_BG).
// Idempotente, n'écrase jamais une cellule déjà saisie.
function _migrerColonnesXlCs_(sh) {
  try {
    if (sh.getLastColumn() < _CS_TEMPLATE_HEADER.length) {
      sh.getRange(1, 1, 1, _CS_TEMPLATE_HEADER.length)
        .setValues([_CS_TEMPLATE_HEADER]).setFontWeight('bold');
      Logger.log('Onglet CS_TEMPLATE : colonnes XL_LABEL / XL_BG ajoutées.');
    }
    const rows = sh.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      const code = String(rows[r][0] || '').trim().toUpperCase();
      const vals = _CS_TEMPLATE_XL[code];
      if (!code || !vals) continue;
      for (let k = 0; k < 2; k++) {
        const cur = rows[r][14 + k];
        if (cur === '' || cur == null) sh.getRange(r + 1, 15 + k).setValue(vals[k]);
      }
    }
  } catch (e) {
    Logger.log('_migrerColonnesXlCs_ : ' + e.message);
  }
}

// One-shot manuel : à lancer une fois dans l'éditeur Apps Script.
// Affiche le récapitulatif pour contrôle visuel avant toute bascule.
function initCsTemplate() {
  const sh = getOrCreateCsTemplateTab();
  const t = getCsTemplate();
  const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
  let total = 0;
  Logger.log('Onglet ' + CS_TEMPLATE_TAB + ' prêt : ' + t.types.length + ' type(s) de consultation.');
  Logger.log('── Semaine type ──');
  for (let d = 0; d < 5; d++) {
    ['am','pm'].forEach(function (half) {
      const m = t.required[d][half], codes = Object.keys(m);
      if (!codes.length) return;
      const txt = codes.map(function (c) {
        total += m[c];
        return c.replace('CS-', '') + (m[c] > 1 ? '×' + m[c] : '');
      }).join(', ');
      Logger.log('  ' + JOURS[d] + ' ' + (half === 'am' ? 'matin     ' : 'après-midi') + ' : ' + txt);
    });
  }
  Logger.log('── TOTAL : ' + total + ' créneaux/semaine (doit valoir 23 au premier amorçage) ──');
  Logger.log('ℹ️ Cet onglet n\'est PAS encore consommé : le modifier ne change rien à l\'écran.');
  return t.types.length;
}

// Lecture → { types:[{code,label,ouvrable,actif}], required:{0..4:{am:{},pm:{}}} }
// `required` a EXACTEMENT la forme de CS_REQUIRED (admin.html) pour que la
// bascule de l'étape 2c soit un simple remplacement de source.
// Les lignes ACTIF=N sont ignorées ; les effectifs à 0 ne sont pas écrits.
function getCsTemplate() {
  // Cache de configuration — voir le bloc en tete de code.gs.
  const _c = _cacheLire_('cfg:CS_TEMPLATE');
  if (_c) return _c;
  const sh = getOrCreateCsTemplateTab();
  const rows = sh.getDataRange().getValues();
  const types = [];
  const required = {};
  for (let d = 0; d < 5; d++) required[d] = { am: {}, pm: {} };

  for (let r = 1; r < rows.length; r++) {
    const code = String(rows[r][0] || '').trim();
    if (!code) continue;
    if (String(rows[r][3] || '').trim().toUpperCase() !== 'O') continue;   // ACTIF=N → ignoré
    types.push({
      code:     code,
      label:    String(rows[r][1] || '').trim(),
      ouvrable: String(rows[r][2] || '').trim().toUpperCase() === 'O',
      actif:    true,
      // Colonnes EXCEL. Vides = défauts, pour qu'une consultation créée sans les
      // remplir apparaisse quand même dans le fichier du vendredi.
      // PAS de .trim() sur le libellé : l'espace initial est VOULU, il décale le
      // texte dans la cellule Excel (' VISC. / URO.'). On ne nettoie qu'à droite.
      xlLabel:  String(rows[r][14] || '').replace(/\s+$/, '')
                || ' ' + String(rows[r][1] || code).replace(/^CS[- ]*/i, '').trim().toUpperCase(),
      xlBg:     String(rows[r][15] || '').trim().replace(/^#/, '').toUpperCase() || 'F2F2F2',
    });
    for (let d = 0; d < 5; d++) {
      ['am', 'pm'].forEach(function (half, hi) {
        const n = Number(rows[r][4 + d * 2 + hi]) || 0;   // col. 5 = LUN_AM, puis 2 par jour
        if (n > 0) required[d][half][code] = n;
      });
    }
  }
  const _out = { types: types, required: required };
  _cacheEcrire_('cfg:CS_TEMPLATE', _out);
  return _out;
}

// ══════════════════════════════════════════════════════════════════════
// ONGLET SEUILS — bornes d'affichage, reglables par le comite
// ══════════════════════════════════════════════════════════════════════
// Trois colonnes : CLE | VALEUR | DESCRIPTION.
// Volontairement SEPARE de CONFIG, qui porte ADMIN_CODE, SECRETARIAT_CODE,
// ANNEE_ACTIVE et INDISPOS_ACTIVE : regler une couleur ne doit pas obliger a
// ouvrir l'onglet des codes d'acces (decision Arthur, 01/08/2026).
// Aucune valeur sensible ici, jamais de code, jamais de donnee nominative.
const SEUILS_TAB = 'SEUILS';
const _SEUILS_HEADER = ['CLE', 'VALEUR', 'DESCRIPTION'];
const _SEUILS_SEED = [
  ['SEUIL_PRESENCE_ALERTE', 13,
   "Bande de presence (onglet Planning) : au-dessous de ce nombre de MAR presents, la journee vire a l'orange puis au rouge."],
  ['SEUIL_PRESENCE_CONFORT', 17,
   'Bande de presence (onglet Planning) : a partir de ce nombre de MAR presents, la journee est verte.'],
];

function getOrCreateSeuilsTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SEUILS_TAB);
  if (!sh) {
    sh = ss.insertSheet(SEUILS_TAB);
    sh.getRange(1, 1, 1, _SEUILS_HEADER.length).setValues([_SEUILS_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SEUILS_SEED.length, _SEUILS_HEADER.length).setValues(_SEUILS_SEED);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 210); sh.setColumnWidth(2, 80); sh.setColumnWidth(3, 520);
  } else if (sh.getLastRow() < 2) {
    sh.getRange(1, 1, 1, _SEUILS_HEADER.length).setValues([_SEUILS_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SEUILS_SEED.length, _SEUILS_HEADER.length).setValues(_SEUILS_SEED);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Renvoie { CLE: nombre }. Une valeur non numerique est ignoree : le client
// garde alors sa valeur de repli plutot que d'afficher n'importe quoi.
function getSeuils() {
  const _c = _cacheLire_('cfg:SEUILS');
  if (_c) return _c;
  const sh = getOrCreateSeuilsTab();
  const rows = sh.getDataRange().getValues();
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    const cle = String(rows[r][0] || '').trim().toUpperCase();
    if (!cle) continue;
    const val = Number(rows[r][1]);
    if (!isFinite(val)) continue;
    out[cle] = val;
  }
  _cacheEcrire_('cfg:SEUILS', out);
  return out;
}

function getOrCreateSecteursTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SECTEURS_TAB);
  if (!sh) {
    sh = ss.insertSheet(SECTEURS_TAB);
    sh.getRange(1, 1, 1, _SECTEURS_HEADER.length).setValues([_SECTEURS_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SECTEURS_SEED.length, _SECTEURS_HEADER.length).setValues(_SECTEURS_SEED);
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 220);
  } else if (sh.getLastRow() < 2) {
    // Onglet présent mais vide (en-tête seul ou rien) → on amorce.
    sh.getRange(1, 1, 1, _SECTEURS_HEADER.length).setValues([_SECTEURS_HEADER]).setFontWeight('bold');
    sh.getRange(2, 1, _SECTEURS_SEED.length, _SECTEURS_HEADER.length).setValues(_SECTEURS_SEED);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < _SECTEURS_HEADER.length) {
    // (28/07/2026 perf) La migration XL de juillet n'est PLUS jouee a chaque appel.
    // Mesure du 28/07 : getSecteurs coutait 749 ms contre ~200 ms pour une lecture
    // simple, parce que _migrerColonnesXL_ relisait l'onglet EN ENTIER une seconde
    // fois — et ecrivait, dans une action de LECTURE qui ne prend pas le verrou.
    // Elle tourne desormais uniquement si des colonnes manquent reellement, ce qui
    // conserve le filet de securite d'un ajout futur de colonne.
    // Les cellules XL vides sont deja couvertes : getSecteurs() applique un defaut
    // (COURT en majuscules pour le libelle, gris clair pour le fond).
    _migrerColonnesXL_(sh);
  }
  return sh;
}

// Migration douce (07/2026) : l'onglet SECTEURS passe de 11 à 14 colonnes
// (XL_LABEL / XL_BG / XL_ROWS). Ajoute les colonnes à un onglet DÉJÀ REMPLI et
// pré-remplit les 9 secteurs connus avec leurs valeurs Excel actuelles.
// Idempotente, et n'écrase JAMAIS une cellule déjà saisie.
function _migrerColonnesXL_(sh) {
  try {
    if (sh.getLastColumn() < _SECTEURS_HEADER.length) {
      sh.getRange(1, 1, 1, _SECTEURS_HEADER.length)
        .setValues([_SECTEURS_HEADER]).setFontWeight('bold');
      Logger.log('Onglet SECTEURS : colonnes XL_LABEL / XL_BG / XL_ROWS ajoutées.');
    }
    // Remplir les cellules VIDES des codes connus (une saisie manuelle fait foi).
    const rows = sh.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      const code = String(rows[r][1] || '').trim().toUpperCase();
      const vals = _SECTEURS_XL[code];
      if (!code || !vals) continue;          // secteur créé par Arthur → défauts de getSecteurs
      for (let k = 0; k < 3; k++) {
        const cur = rows[r][11 + k];
        if (cur === '' || cur == null) sh.getRange(r + 1, 12 + k).setValue(vals[k]);
      }
    }
  } catch (e) {
    Logger.log('_migrerColonnesXL_ : ' + e.message);
  }
}

// One-shot manuel : à lancer une fois dans l'éditeur Apps Script.
function initSecteurs() {
  const sh = getOrCreateSecteursTab();
  Logger.log('Onglet SECTEURS prêt : ' + (sh.getLastRow() - 1) + ' secteurs.');
  return sh.getLastRow() - 1;
}

// Lecture → tableau d'objets (miroir de l'ancien SECTEURS_CFG + rendement).
// '' → null pour aff/bg/fg/cs ; ACTIF 'O' → actif:true.
function getSecteurs() {
  const _c = _cacheLire_('cfg:SECTEURS');
  if (_c) return _c;
  const sh = getOrCreateSecteursTab();
  const rows = sh.getDataRange().getValues();
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const code = String(rows[r][1] || '').trim();
    if (!code) continue;
    const nn = v => { const s = String(v == null ? '' : v).trim(); return s ? s : null; };
    out.push({
      ordre:     Number(rows[r][0]) || (r),
      code:      code,
      label:     String(rows[r][2] || '').trim(),
      court:     String(rows[r][3] || '').trim(),
      aff:       nn(rows[r][4]),
      icon:      String(rows[r][5] || '').trim(),
      bg:        nn(rows[r][6]),
      fg:        nn(rows[r][7]),
      cs:        nn(rows[r][8]),
      actif:     String(rows[r][9] || '').trim().toUpperCase() === 'O',
      rendement: String(rows[r][10] || '').trim().toUpperCase() || null,
      // Colonnes EXCEL. Vides = défauts, pour qu'un secteur créé sans les remplir
      // apparaisse quand même dans le fichier du vendredi.
      xlLabel:   String(rows[r][11] || '').trim()
                 || String(rows[r][3] || code).trim().toUpperCase(),   // défaut : COURT en majuscules
      xlBg:      String(rows[r][12] || '').trim().replace(/^#/, '').toUpperCase()
                 || _XL_BG_DEFAUT,                                     // défaut : gris clair
      xlRows:    Math.max(1, Math.min(3, Number(rows[r][13]) || _XL_ROWS_DEFAUT)),
    });
  }
  out.sort((a, b) => a.ordre - b.ordre);
  _cacheEcrire_('cfg:SECTEURS', out);
  return out;
}


/* ══ STATISTIQUES D'USAGE (29/08/2026) ══════════════════════════════════
   Lit UNIQUEMENT les compteurs figes (STATS_SEMAINE, STATS_HEURES) et la
   colonne DERNIERE_CONNEXION de MEDECINS. Ne touche JAMAIS aux lignes brutes
   de CONNEXIONS : celles-ci sont plafonnees et disparaissent, les compteurs
   non. Une page qui recalculerait depuis le brut afficherait une courbe qui
   retrecit toute seule.
   Aucun total par personne n'est renvoye : la page montre QUI n'a pas ouvert
   le portail, jamais qui l'ouvre le plus. */
/* (29/08/2026, corrige le jour meme) Le controle portait sur user.role ===
   'admin'. Or checkCode ne rend ce role QUE pour le code d'administration, avec
   id 'ADMIN' : ouvert avec son code personnel, l'administrateur du portail est
   un `mar` d'id DURAND, et se voyait refuser sa propre page — la tuile,
   elle, filtre sur l'IDENTITE (only:'DURAND'). Deux criteres differents pour
   la meme porte. On aligne sur le motif deja en place pour le CRH : acces
   NOMINATIF par id. */
const STATS_ALLOWED = ['DURAND'];   // ids MEDECINS, comme CRH_ALLOWED

function getStatsUsage(user) {
  if (!user || (user.role !== 'admin' &&
                STATS_ALLOWED.indexOf(String(user.id)) === -1)) {
    return { success: false, error: 'Accès réservé.' };
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const _jour = function (v) {
    if (v && typeof v.getFullYear === 'function') {
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0')
                             + '-' + String(v.getDate()).padStart(2, '0');
    }
    return String(v || '').trim();
  };

  // ── Semaines ──
  const semaines = [];
  const fs_ = ss.getSheetByName('STATS_SEMAINE');
  if (fs_) {
    const d = fs_.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      const cle = _jour(d[r][0]);
      if (!cle) continue;
      semaines.push({ s: cle, c: Number(d[r][1] || 0), a: Number(d[r][2] || 0) });
    }
    semaines.sort(function (x, y) { return x.s < y.s ? -1 : 1; });
  }

  // ── Grille 7 x 24 ──
  const heures = [];
  const fh = ss.getSheetByName('STATS_HEURES');
  if (fh) {
    const d = fh.getDataRange().getValues();
    for (let r = 1; r < d.length && r <= 7; r++) {
      const l = [];
      for (let c = 1; c <= 24; c++) l.push(Number(d[r][c] || 0));
      heures.push(l);
    }
  }

  // ── Dernière connexion, par médecin actif ──
  const gens = [];
  const fm = ss.getSheetByName('MEDECINS');
  if (fm) {
    const d = fm.getDataRange().getValues();
    let col = -1;
    if (d.length) {
      for (let c = 0; c < d[0].length; c++) {
        if (String(d[0][c]).trim().toUpperCase() === 'DERNIERE_CONNEXION') { col = c; break; }
      }
    }
    for (let r = 1; r < d.length; r++) {
      if (!String(d[r][0]).trim()) continue;
      if (String(d[r][3]).trim().toUpperCase() !== 'O') continue;   // ACTIF=O seulement
      gens.push({ i: String(d[r][2] || '').trim(),
                  d: (col >= 0) ? _jour(d[r][col]) : '' });
    }
  }

  /* ── Ouvertures et modifications, PAR RÔLE (31/08/2026) ──
     Alimente deux cartes : « qui se connecte » et « l'administration au-delà de
     la connexion ». Compteurs figés par _statsActionIncr_ (Indispos.gs), jamais
     reconstruits depuis les lignes brutes.
     Aucune donnée nominative : ces lignes ne portent que le rôle. Le code
     d'administration est partagé et ne porte aucun nom — la page doit donc dire
     « le rôle », jamais « la personne ». */
  const roles = {}, actions = {};
  const fa = ss.getSheetByName('STATS_ACTIONS');
  if (fa) {
    const d = fa.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      const role = String(d[r][0] || '').trim().toLowerCase();
      const act  = String(d[r][1] || '').trim();
      const n    = Number(d[r][2] || 0);
      if (!role || !act) continue;
      if (act === '(ouverture)') {
        if (!roles[role]) roles[role] = { ouvertures: 0, actions: 0 };
        roles[role].ouvertures += n;
      } else {
        if (!roles[role]) roles[role] = { ouvertures: 0, actions: 0 };
        roles[role].actions += n;
        if (!actions[role]) actions[role] = [];
        actions[role].push({ a: act, n: n, d: _jour(d[r][3]) });
      }
    }
    Object.keys(actions).forEach(function (k) {
      actions[k].sort(function (x, y) { return y.n - x.n; });
    });
  }

  return { success: true, origine: STATS_ORIGINE, effectif: gens.length,
           semaines: semaines, heures: heures, medecins: gens,
           roles: roles, actions: actions };
}
