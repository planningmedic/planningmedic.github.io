#!/usr/bin/env node
/**
 * Harnais de non-régression des WIZARDS (admin.html) et d'archiveYear (setup_annee.gs).
 *
 * Extrait les fonctions RÉELLES des fichiers du dépôt (aucune copie à maintenir),
 * les exécute dans un DOM/API simulés, et rejoue les scénarios de panne/reprise
 * validés lors de l'audit du 15/07/2026.
 *
 * Usage (depuis la racine du dépôt) :
 *   node simulateur/wizards/run.js
 *   node simulateur/wizards/run.js /chemin/admin.html /chemin/setup_annee.gs
 *
 * Code retour : 0 si tous les scénarios passent, 1 sinon.
 * À lancer AVANT tout push touchant les wizards d'admin.html ou archiveYear.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ADMIN = process.argv[2] || 'admin.html';
const SETUP = process.argv[3] || path.join('gas', 'setup_annee.gs');

// ── Extraction d'une déclaration de fonction par comptage d'accolades ──
function extractFn(src, name) {
  const m = src.match(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) throw new Error('Fonction introuvable : ' + name);
  let i = src.indexOf('{', m.index); let depth = 1; i++;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(m.index, i);
}

const adminSrc = fs.readFileSync(ADMIN, 'utf8');
const setupSrc = fs.readFileSync(SETUP, 'utf8');

// ── Mocks DOM ──
const els = {};
function mkEl(id) {
  return {
    id, _cls: new Set(), textContent: '', innerHTML: '', style: {},
    classList: {
      add: c => els[id]._cls.add(c),
      remove: c => els[id]._cls.delete(c),
      contains: c => els[id]._cls.has(c),
    },
  };
}
global.document = {
  getElementById(id) { if (!els[id]) els[id] = mkEl(id); return els[id]; },
  createElement() { return mkEl('tmp' + Math.random()); },
  querySelectorAll() { return []; },
  body: { appendChild() {} },
};
global.window = global;
global.setTimeout = fn => (fn(), 0); // immédiat pour la simulation
global.clearTimeout = () => {};
global.toast = () => {};
global.closeWizard = () => {}; global.closeWizardGardes = () => {}; global.closeWizardCloture = () => {};
global.showTab = () => {};
global.renderWizStep = () => {};
global.YEAR = 2026; global.ADMIN_YEAR = 2026;
global.wizCurrentStep = 0;
global.wizPeriodes = []; global.wizGroupes = { A: [], B: [], C: [] };

// Les items de progression sont re-rendus par innerHTML : on simule le rendu
// (les étapes déjà en done sont re-rendues « done » par les builders _gItem/_cItem).
function renderProgress(ids, doneSet) {
  ids.forEach(id => {
    els[id] = mkEl(id);
    if (doneSet && doneSet.has(id)) { els[id]._cls.add('done'); els[id].textContent = '✓ (rendu)'; }
    else els[id].textContent = '○ étape';
  });
}

// ── Mock API : file de réponses programmées ──
let apiScript = [], apiLog = [];
global.api = async p => {
  apiLog.push(p.action);
  const next = apiScript.shift();
  if (next === 'THROW') throw new Error('Failed to fetch');
  return next;
};
const OK = { success: true }, KO = { success: false, error: 'panne simulée' };

// ── Chargement des fonctions réelles ──
(0, eval)(extractFn(adminSrc, 'launchWizInit'));
(0, eval)(extractFn(adminSrc, 'launchWizardGardes'));
(0, eval)(extractFn(adminSrc, 'launchWizardCloture'));

let failures = 0;
function expect(label, cond) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

(async () => {
  // ═══ W1 : init échoue à l'étape 4 → Réessayer ne rejoue que l'étape 4 ═══
  console.log('━━ W1 : étape 4 KO → reprise ━━');
  ['wiz-i1','wiz-i2','wiz-i3','wiz-i4','wizNextBtn','wizBackBtn'].forEach(id => els[id] = mkEl(id));
  window._wizIndisposExists = false;
  apiScript = [OK, OK, OK, KO]; apiLog = [];
  await launchWizInit();
  const firstLog = apiLog.join(',');
  apiScript = [OK]; apiLog = [];
  await launchWizInit(); // les éléments W1 persistent (pas de re-render)
  expect('1er essai = 4 appels (periodes, groupes, initYear, setIndisposYear)',
    firstLog === 'savePeriodes,saveGroupes,initYear,setIndisposYear');
  expect('retry ne rejoue que setIndisposYear', apiLog.join(',') === 'setIndisposYear');
  expect('les 4 étapes finissent done', ['wiz-i1','wiz-i2','wiz-i3','wiz-i4'].every(id => els[id]._cls.has('done')));

  // ═══ W2-S1 : génération OK, publication KO → reprise sans regénérer ═══
  console.log('━━ W2-S1 : publication KO → reprise ━━');
  window._wizGDone = new Set();
  renderProgress(['wizg-p1','wizg-p2','wizg-p3'], null);
  ['wizGNextBtn','wizGBackBtn','wizGBody'].forEach(id => els[id] = mkEl(id));
  apiScript = [OK, KO]; apiLog = [];
  await launchWizardGardes();
  renderProgress(['wizg-p1','wizg-p2','wizg-p3'], window._wizGDone);
  apiScript = [OK, { success: true, sent: 21 }]; apiLog = [];
  await launchWizardGardes();
  expect('retry ne rejoue PAS generateGardes', !apiLog.includes('generateGardes'));
  expect('publication + récaps rejoués', apiLog.join(',') === 'publishPlanning,envoyerRecapIndispos');

  // ═══ W2-S2 : réponse de génération perdue → le verrou GAS vaut « acquis » ═══
  console.log('━━ W2-S2 : réponse perdue → verrou 🔒 traité comme acquis ━━');
  window._wizGDone = new Set();
  renderProgress(['wizg-p1','wizg-p2','wizg-p3'], null);
  apiScript = ['THROW']; apiLog = [];
  await launchWizardGardes();
  renderProgress(['wizg-p1','wizg-p2','wizg-p3'], window._wizGDone);
  apiScript = [{ success: false, error: '🔒 GARDES_2027 existe déjà — génération verrouillée…' }, OK, OK];
  apiLog = [];
  await launchWizardGardes();
  expect('p1 et p2 finissent done malgré le verrou',
    els['wizg-p1']._cls.has('done') && els['wizg-p2']._cls.has('done'));

  // ═══ W2-S4 : récaps KO = non bloquant ═══
  console.log('━━ W2-S4 : récaps KO non bloquant ━━');
  window._wizGDone = new Set();
  renderProgress(['wizg-p1','wizg-p2','wizg-p3'], null);
  apiScript = [OK, OK, KO]; apiLog = [];
  await launchWizardGardes();
  expect('wizard terminé (🎉) malgré récaps KO', els['wizGBody'].innerHTML.includes('🎉'));

  // ═══ W3 : archivage OK, bascule KO → reprise sans re-archiver ═══
  console.log('━━ W3 : bascule KO → reprise ━━');
  window._wizCDone = new Set(); YEAR = 2026;
  renderProgress(['wizc-p1','wizc-p2','wizc-p3'], null);
  ['wizCNextBtn','wizCBackBtn','wizCBody','headerYear'].forEach(id => els[id] = mkEl(id));
  apiScript = [OK, KO]; apiLog = [];
  await launchWizardCloture();
  renderProgress(['wizc-p1','wizc-p2','wizc-p3'], window._wizCDone);
  apiScript = [OK, OK]; apiLog = [];
  await launchWizardCloture();
  expect('retry ne rejoue PAS archiveYear', !apiLog.includes('archiveYear'));
  expect('YEAR basculé sur 2027', YEAR === 2027);

  // ═══ archiveYear (GAS) : garde d'idempotence ═══
  console.log('━━ archiveYear : garde d\'idempotence ━━');
  function mkSheet(rows) {
    return {
      getDataRange: () => ({ getValues: () => rows }),
      getLastRow: () => rows.length,
      getRange: () => ({ setValues: () => ({ setFontWeight: () => {} }), setFontWeight: () => {}, clearContent: () => {} }),
      setFrozenRows: () => {}, setColumnWidth: () => {},
    };
  }
  let MASTER = {}, ARCHIVE = {};
  global.ARCHIVE_SS_ID = 'fake';
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: n => MASTER[n] || null, insertSheet: n => (MASTER[n] = mkSheet([[]])) }),
    openById: () => ({ getSheetByName: n => ARCHIVE[n] || null }),
    getUi: () => { throw new Error('no UI'); },
  };
  global.Logger = { log: () => {} };
  // (05/08/2026) archiveYear n'écrit plus sur GitHub : les JSON partent sur Drive
  // via savePlanningToDrive (code.gs). On enregistre les écritures pour prouver
  // que le chemin normal est emprunté (l'ancienne sentinelle UrlFetchApp est morte).
  let driveWrites = [];
  global.savePlanningToDrive = name => { driveWrites.push(name); };
  global.buildDateToCol = () => ({});
  global.reconstruireDatesHeaders = () => [];
  (0, eval)(extractFn(setupSrc, 'archiveYear'));
  const dispatchOk = r => !/(^|\n)❌/.test(String(r || ''));

  MASTER = { HISTORIQUE: mkSheet([['ID','ANNEE'],['ABC',2026]]) };
  ARCHIVE = { STATS_GARDES_2026: mkSheet([[]]) };
  expect('déjà archivée → succès (le wizard enchaîne)', dispatchOk(archiveYear(2026)));

  MASTER = { HISTORIQUE: mkSheet([['ID','ANNEE'],['ABC',2025]]) };
  ARCHIVE = {};
  expect('vrai problème → ❌ conservé (blocage protecteur)', !dispatchOk(archiveYear(2026)));

  MASTER = { STATS_GARDES_2026: mkSheet([['ID','TOTAL G'],['ABC',12]]), HISTORIQUE: mkSheet([['ID','ANNEE']]) };
  driveWrites = [];
  const rapNormal = archiveYear(2026, false);
  expect('archivage normal → garde transparente (chemin habituel emprunté)',
    dispatchOk(rapNormal) && driveWrites.includes('archives_stats_2026.json'));

  // ═══ archiveYear : purge PLANNING_OVERRIDES (retouches quotidiennes) ═══
  // Le point sensible de la clôture : la purge supprime les retouches ≤ année close.
  // On prouve : (a) lignes ≤ year supprimées, (b) lignes futures CONSERVÉES,
  // (c) purge SAUTÉE si l'archivage a échoué (garde archiveOk).
  console.log('━━ archiveYear : purge des OVERRIDES ━━');
  function mkOverridesSheet(rows) {
    const sh = mkSheet(rows);
    sh.cleared = false; sh.written = null;
    sh.getRange = () => ({
      clearContent: () => { sh.cleared = true; },
      setValues: v => { sh.written = v; },
      setFontWeight: () => {},
    });
    return sh;
  }

  let po = mkOverridesSheet([
    ['DATE','MAR','SLOT','VAL'],
    ['2025-12-31','X','am','G'],
    ['2026-05-10','Y','pm','G2'],
    ['2027-01-05','Z','am','G'],
  ]);
  MASTER = { STATS_GARDES_2026: mkSheet([['ID','TOTAL G'],['ABC',12]]),
             HISTORIQUE: mkSheet([['ID','ANNEE']]), PLANNING_OVERRIDES: po };
  const rapPurge = archiveYear(2026, false);
  expect('purge : les lignes ≤ 2026 sont supprimées (2 sur 3)',
    /PLANNING_OVERRIDES : 2 ligne\(s\)/.test(String(rapPurge)) && po.cleared);
  expect('purge : la ligne 2027 est conservée',
    !!po.written && po.written.length === 1 && po.written[0][0] === '2027-01-05');

  po = mkOverridesSheet([['DATE'],['2026-05-10']]);
  MASTER = { HISTORIQUE: mkSheet([['ID','ANNEE'],['ABC',2025]]), PLANNING_OVERRIDES: po };
  ARCHIVE = {};
  archiveYear(2026, false);
  expect('archivage en échec → OVERRIDES intacts (purge sautée)', !po.cleared && !po.written);

  console.log(failures === 0 ? '\n🎉 TOUS LES SCÉNARIOS PASSENT' : `\n❌ ${failures} scénario(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH HARNAIS :', e); process.exit(1); });
