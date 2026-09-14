/* ═══════════════════════════════════════════════════════════════════════
   DEV.GS — FONCTIONS DE TEST MANUEL. NE PAS RECOPIER DANS APPS SCRIPT.
   (14/09/2026, chantier 2)

   Douze fonctions « test… » et « diag… » vivaient dans les fichiers de
   production : jamais appelées par le site ni par le comité, elles servent à
   un développeur qui les lance à la main depuis l'éditeur. Elles encombraient
   le menu « fonction à exécuter » (un clic malheureux sur testArchiveMove…)
   et 300 lignes que chaque déploiement recopiait. Elles sont rassemblées ici,
   dans le dépôt, hors déploiement. Si l'une d'elles doit un jour être
   exécutée, la coller temporairement dans l'éditeur, puis la retirer.

   Ne sont PAS ici : essaiGenerationGardes / essaiEnchainementGardes (outil de
   mesure documenté du comité, testé par le banc), diagnosticComplet, diagHebdo,
   diagSentinelle (le vrai Diagnostic). */

/* ── depuis gas/Indispos.gs ── */
function testNotifierConflits() {
  const year = 2027;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const medSheet = ss.getSheetByName('MEDECINS');
  const medData = medSheet.getDataRange().getValues();
  const actifs = [];
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][0]).trim();
    if (!id || String(medData[r][3]).trim().toUpperCase() !== 'O') continue;
    actifs.push({id, nom: String(medData[r][1]).trim(), email: String(medData[r][7]).trim()});
  }
  Logger.log('MARs actifs: ' + actifs.length);
  
  const indSheet = ss.getSheetByName('INDISPOS_' + year);
  if (!indSheet) { Logger.log('INDISPOS_' + year + ' introuvable'); return; }
  const indData = indSheet.getDataRange().getValues();
  Logger.log('INDISPOS lignes: ' + indData.length + ' cols: ' + indData[0].length);
  
  const dates = [];
  let curY = year, curM = null;
  const MM = {'janvier':1,'février':2,'mars':3,'avril':4,'mai':5,'juin':6,'juillet':7,'août':8,'septembre':9,'octobre':10,'novembre':11,'décembre':12};
  for (let c = 1; c < indData[0].length; c++) {
    const cell = indData[0][c];
    if (cell) {
      if (cell instanceof Date) { curY = cell.getFullYear(); curM = cell.getMonth()+1; }
      else { const low = String(cell).toLowerCase(); const m2 = String(cell).match(/(\d{4})/); if (m2) curY = parseInt(m2[1]); Object.entries(MM).forEach(([n,v]) => { if (low.includes(n)) curM = v; }); }
    }
    const dn = indData[2][c];
    dates.push((dn && curY && curM) ? curY+'-'+String(curM).padStart(2,'0')+'-'+String(Number(dn)).padStart(2,'0') : null);
  }
  Logger.log('Dates non-nulles: ' + dates.filter(Boolean).length);
  
  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    dates.forEach((date, i) => {
      if (!date) return;
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }
  const nonVides = Object.entries(vacByDoc).filter(([k,v]) => v.size > 0);
  Logger.log('MARs avec VAC: ' + nonVides.length);

  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupData = groupSheet.getDataRange().getValues();
  const groups = {A:[],B:[],C:[]}, ordre2026 = {A:{},B:{},C:{}};
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim(), id = String(groupData[r][1]).trim(), ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id); ordre2026[grp][id] = ord;
  }
  const offset = year - 2026;
  function getOrd(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const sh = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite
    return [...sorted.slice(sh), ...sorted.slice(0, sh)];
  }
  const ordA = getOrd('A'), ordB = getOrd('B'), ordC = getOrd('C');

  const testDate = '2027-02-22';
  const ORDRE_BASE = {HIVER:'CAB',PRINTEMPS:'ABC',ETE:'ABC',TOUSSAINT:'BCA',NOEL:'CAB'};
  const base = ORDRE_BASE['HIVER'];
  const ga = base.split(''); const gs = (3 - (offset % 3)) % 3;   // rotation droite
  const og = [...ga.slice(gs), ...ga.slice(0, gs)];
  const ol = []; og.forEach(g => { if (g==='A') ol.push(...ordA); else if (g==='B') ol.push(...ordB); else ol.push(...ordC); });
  const marEnVac = ol.filter(id => vacByDoc[id] && vacByDoc[id].has(testDate));
  Logger.log('MARs en VAC le ' + testDate + ': ' + marEnVac.length);

  // Tester le filtre des périodes
  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const perData = perSheet.getDataRange().getValues();

  function premierJour(y) {
    const j = new Date(y,0,1); const d = j.getDay(); 
    const o = d===1?7:d===0?1:8-d; 
    const r = new Date(y,0,1+o); 
    return r.getFullYear()+'-'+String(r.getMonth()+1).padStart(2,'0')+'-'+String(r.getDate()).padStart(2,'0');
  }
  const debutAnnee = premierJour(year);
  const finAnnee = premierJour(year+1);
  Logger.log('debutAnnee: ' + debutAnnee + ' finAnnee: ' + finAnnee);
  
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const dr = perData[r][1];
    const debut = dr instanceof Date 
      ? dr.getFullYear()+'-'+String(dr.getMonth()+1).padStart(2,'0')+'-'+String(dr.getDate()).padStart(2,'0') 
      : String(dr).trim();
    const passe = debut >= debutAnnee && debut < finAnnee;
    Logger.log('Periode ' + nom + ' debut=' + debut + ' → ' + (passe ? '✅ incluse' : '❌ EXCLUE'));
  }
}

/* ── depuis gas/code.gs ── */
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

/* ── depuis gas/code.gs ── */
// À exécuter UNE FOIS dans l'éditeur Apps Script après recopie :
// déclenche l'autorisation Drive + vérifie écriture/lecture.
function testDrivePlanning() {
  savePlanningToDrive('test_drive.json', JSON.stringify({ok: true, t: new Date().toISOString()}));
  const back = readPlanningFromDrive('test_drive.json');
  Logger.log('Lecture retour : ' + back);
  if (!back || JSON.parse(back).ok !== true) throw new Error('Test Drive ÉCHOUÉ');
  Logger.log('✅ Test Drive OK — autorisation accordée, écriture/lecture fonctionnelles');
}

/* ── depuis gas/code.gs ── */
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

/* ── depuis gas/generateur_gardes.gs ── */
// Lanceur de test (visible dans le menu Exécuter). Change l'année si besoin.
function testArchiveMove() {
  const rapport = archiveMoveTabs_(1999);
  Logger.log(rapport.join('\n'));
  try { SpreadsheetApp.getUi().alert('Archivage test\n\n' + rapport.join('\n')); } catch(e) {}
}

/* ── depuis gas/miroir.gs ── */
/* À lancer depuis l'éditeur Apps Script pour le test réel du canal. */
function testNotificationPush() {
  const r = notifierPush_('Test du canal', 'Si vous lisez ceci sur votre téléphone, le canal fonctionne.', './index.html', null, true);
  Logger.log(JSON.stringify(r));
}

/* ── depuis gas/portail.gs ── */
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

/* ── depuis gas/portail.gs ── */
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

/* ── depuis gas/portail.gs ── */
// À exécuter UNE FOIS après recopie : crée le dossier Protocoles + logue l'URL.
function testProtocoles() {
  const r = listProtocoles();
  Logger.log('📁 Dossier Protocoles : ' + r.folderUrl);
  Logger.log('📋 Protocoles vus : ' + r.count);
  r.groups.forEach(function (g) { Logger.log('  ▸ ' + g.specialite + ' (' + g.protocoles.length + ')'); });
  Logger.log('✅ testProtocoles OK — crée des sous-dossiers par spécialité et dépose les PDF dedans.');
}

/* ── depuis gas/portail.gs ── */
// À exécuter UNE FOIS après recopie : crée l'onglet ANNUAIRE + logue l'état.
function testAnnuaire() {
  const r = listAnnuaire();
  Logger.log('🗂️ Onglet ANNUAIRE : ' + r.tabUrl);
  Logger.log('👥 Équipe MAR (DECT) : ' + r.equipe.length + ' actifs');
  Logger.log('☎️ Catégories répertoire : ' + r.categories.length);
  r.categories.forEach(function (c) { Logger.log('  ▸ ' + c.categorie + ' (' + c.entries.length + ')'); });
  Logger.log('✅ testAnnuaire OK — remplis l\'onglet ANNUAIRE (CATÉGORIE | LIBELLÉ | NUMÉRO | INFO).');
}

/* ── depuis gas/portail.gs ── */
// ── À exécuter UNE FOIS après recopie : vérifie la clé + un CR de test ──
function testCRH() {
  const t = getAnthropicToken();
  Logger.log(t ? '🔑 ANTHROPIC_TOKEN présent (longueur ' + t.length + ')' : '❌ ANTHROPIC_TOKEN absent — ajoute-le dans CONFIG.');
  if (!t) return;
  const r = genererCRH_({ texte: 'J1 : patient stable, eupnéique en air ambiant. Transfert en chirurgie le 10/07.', format: 'appareil' });
  Logger.log(r.success ? ('✅ CR de test :\n' + r.cr) : ('❌ ' + r.error));
}

/* ── depuis gas/veille.gs ── */
function testVeille() {
  const cfg = _readVeilleCfg();
  Logger.log('Veille ' + GAS_VERSION_VEILLE);
  Logger.log('  ' + cfg.revues.length + ' revues directes · ' + cfg.general.length +
             ' croisées · ' + cfg.themes.length + ' thèmes · ' +
             cfg.pubtypes.length + ' types en liste blanche (axe croisé)');
  Logger.log('  liste blanche : ' + (_veilleListeBlanche(cfg) || '(AUCUNE — axe croisé sans restriction !)'));
  Logger.log('  JOURS=' + (cfg.params.JOURS || '180') +
             ' · LANGS=' + (cfg.params.LANGS || 'eng,fre') +
             ' · ANIMAUX=' + (cfg.params.ANIMAUX || 'N') +
             ' · MAX_PASSAGE=' + (cfg.params.MAX_PASSAGE || '700'));
  Logger.log('  filtre : ' + _veilleFiltre(cfg).substring(0, 200) + '…');
  const v = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VEILLE_TAB);
  Logger.log('  onglet VEILLE : ' + (v ? Math.max(v.getLastRow() - 1, 0) : 0) + ' articles en cache');
}

