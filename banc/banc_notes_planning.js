/* ═══ BANC — NOTES DU PLANNING ET LIGNES OPTIONNELLES (19/11/2026) ═══
   Demande du responsable, d'après le planning papier S47 :
     · l'interne de réanimation se pose au matin et/ou à l'après-midi (INT) ;
     · les infos du jour (texte libre, saisi à la main par le comité) ;
     · la pédiatrie est une ligne OPTIONNELLE : colonne OPTIONNEL de SECTEURS
       (et de CS_TEMPLATE pour la CS Pédiatrie), lue par son EN-TÊTE.
   Ce qui ne doit JAMAIS arriver :
     · une note écrite dans PLANNING_OVERRIDES (relu partout comme « un MAR ») ;
     · une note posée deux fois en double ligne ;
     · un texte vidé qui laisse une ligne fantôme ;
     · un MAR (rôle mar) qui écrit une note ;
     · un onglet sans colonne OPTIONNEL qui rend un secteur optionnel.
   Tout le code exécuté est EXTRAIT des fichiers livrés. */
const vm = require('vm');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };

function monde() {
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE', 'MAR_ID', 'MATIN', 'APREM', 'COMMENTAIRE']]);
  const logs = [];
  const ctx = vm.createContext({
    console, JSON, Date, String, Number, Object, Array, Math, RegExp, Error,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    logAction: m => logs.push(m),
    _deny: () => ({ t: JSON.stringify({ success: false, error: 'refusé' }), setMimeType() { return this; } }),
    _error: m => ({ t: JSON.stringify({ success: false, error: m }), setMimeType() { return this; } }),
  });
  const src = require('fs').readFileSync('../gas/gardes.gs', 'utf8');
  ['NOTES_ENTETE_', 'NOTES_TYPES_'].forEach(n => vm.runInContext(src.match(new RegExp('const\\s+' + n + '\\s*=[^;]*;'))[0].replace('const ', 'var '), ctx));
  ['_notesOnglet_', '_notesDate_', 'loadPlanningNotes', 'savePlanningNotesBatch', '_act_savePlanningNotes']
    .forEach(n => vm.runInContext(extraireFonction('../gas/gardes.gs', n), ctx));
  return { cl, ctx, logs };
}
const lire = (W) => vm.runInContext('loadPlanningNotes()', W.ctx);
const ecrire = (W, items) => vm.runInContext('savePlanningNotesBatch(' + JSON.stringify(items) + ')', W.ctx);
const action = (W, role, items) => JSON.parse(vm.runInContext(`_act_savePlanningNotes(${JSON.stringify({ payload: { items }, user: { role } })})`, W.ctx).t);

(async () => {
  console.log('\n═══ 1. Interne et infos : écrire, relire, effacer ═══');
  {
    const W = monde();
    V('sans onglet : aucune note, aucune erreur', JSON.stringify(lire(W)) === '{}');
    ecrire(W, [{ date: '2026-11-16', type: 'INT', demi: 'am', texte: 'INT' },
               { date: '2026-11-16', type: 'INFO', demi: '', texte: 'ortho 2 salles' },
               { date: '2026-11-17', type: 'INT', demi: 'pm', texte: 'INT' }]);
    const sh = W.cl.getSheetByName('PLANNING_NOTES');
    V('l\'onglet PLANNING_NOTES est créé avec son en-tête', sh && sh.lignes[0].join('|') === 'DATE|TYPE|DEMI|TEXTE', sh && sh.lignes[0]);
    const n = lire(W);
    V('lundi : interne le matin et l\'info', JSON.stringify(n['2026-11-16']) === JSON.stringify({ int: ['am'], info: 'ortho 2 salles' }), n['2026-11-16']);
    V('mardi : interne l\'après-midi seulement', JSON.stringify(n['2026-11-17']) === JSON.stringify({ int: ['pm'] }), n['2026-11-17']);
    V('rien n\'est écrit dans PLANNING_OVERRIDES', W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length === 1);
    ecrire(W, [{ date: '2026-11-16', type: 'INT', demi: 'am', texte: 'INT' }, { date: '2026-11-16', type: 'INFO', texte: 'ortho 1 salle' }]);
    V('reposer la même note ne crée pas de doublon', sh.lignes.length === 4, sh.lignes.length);
    V('une info réécrite remplace l\'ancienne', lire(W)['2026-11-16'].info === 'ortho 1 salle');
    ecrire(W, [{ date: '2026-11-16', type: 'INT', demi: 'am', texte: '' }, { date: '2026-11-16', type: 'INFO', texte: '  ' }]);
    V('texte vide = ligne supprimée (aucune ligne fantôme)', sh.lignes.length === 2 && !lire(W)['2026-11-16'], sh.lignes);
    const res = ecrire(W, [{ date: '16/11/2026', type: 'INT', demi: 'am', texte: 'INT' }, { date: '2026-11-18', type: 'AUTRE', texte: 'x' },
                           { date: '2026-11-18', type: 'INT', demi: 'soir', texte: 'INT' }]);
    V('date, type ou demi-journée invalides : rien n\'est écrit', res.saved === 0 && sh.lignes.length === 2, { res, n: sh.lignes.length });
    V('un texte trop long est tronqué à 400 caractères', (ecrire(W, [{ date: '2026-11-19', type: 'INFO', texte: 'x'.repeat(600) }]), lire(W)['2026-11-19'].info.length === 400));
  }

  console.log('\n═══ 2. L\'action réservée au comité ═══');
  {
    const W = monde();
    const r1 = action(W, 'mar', [{ date: '2026-11-16', type: 'INFO', texte: 'pirate' }]);
    V('un MAR ne peut pas écrire de note', r1.success === false && !W.cl.getSheetByName('PLANNING_NOTES'), r1);
    const r2 = action(W, 'admin', [{ date: '2026-11-16', type: 'INFO', texte: 'endo 2 salles' }]);
    V('le comité écrit, et reçoit les notes relues du classeur', r2.success === true && r2.notes['2026-11-16'].info === 'endo 2 salles', r2);
    V('…et l\'écriture est tracée', W.logs.some(l => /savePlanningNotes/.test(l)));
    const r3 = action(W, 'admin', []);
    V('lot vide refusé', r3.success === false);
  }

  console.log('\n═══ 3. Branchements : routage, verrou, miroir, publication ═══');
  {
    const fs = require('fs');
    const ind = fs.readFileSync('../gas/Indispos.gs', 'utf8'), mir = fs.readFileSync('../gas/miroir.gs', 'utf8'), code = fs.readFileSync('../gas/code.gs', 'utf8');
    V('action routée, rôle admin', /"savePlanningNotes"\s*:\s*\{ role: 'admin'\s*, fn: _act_savePlanningNotes \}/.test(ind));
    V('écriture sous verrou', /WRITE_ACTIONS_LOCK = new Set\(\[[\s\S]*'savePlanningNotes'[\s\S]*\]\)/.test(ind));
    V('le comité relit les notes (config_admin poussé après écriture)', /savePlanningNotes:\s*\['config_admin'\]/.test(mir) && /out\.notes = loadPlanningNotes\(\)/.test(mir));
    V('une correction manuelle de l\'onglet est suivie', /PLANNING_NOTES: \['config_admin'\]/.test(mir));
    V('les MAR les reçoivent avec le planning publié', /JSON\.stringify\(\{months: monthsMin, equiteInitiale, notes\}\)/.test(code));
  }

  console.log('\n═══ 4. Colonne OPTIONNEL (SECTEURS, CS_TEMPLATE), lue par son en-tête ═══');
  {
    const cl = new Classeur();
    const ctx = vm.createContext({ console, JSON, String, Number, Math, Object, Array, SpreadsheetApp: { getActiveSpreadsheet: () => cl } });
    vm.runInContext(`var _cacheLire_ = function(){return null;}, _cacheEcrire_ = function(){}, _XL_BG_DEFAUT='F2F2F2', _XL_ROWS_DEFAUT=1;
      var getOrCreateSecteursTab = function(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SECTEURS'); };
      var getOrCreateCsTemplateTab = function(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CS_TEMPLATE'); };`, ctx);
    vm.runInContext(extraireFonction('../gas/portail.gs', 'getSecteurs'), ctx);
    vm.runInContext(extraireFonction('../gas/portail.gs', 'getCsTemplate'), ctx);
    const H = ['ORDRE','CODE','LABEL','COURT','AFF','ICON','BG','FG','CS','ACTIF','RENDEMENT_LIB','XL_LABEL','XL_BG','XL_ROWS'];
    const lig = (o, c, l, opt) => [o, c, l, l, l, '', '#fff', '#000', '', 'O', 'NUL', l.toUpperCase(), 'F2F2F2', '1'].concat(opt === undefined ? [] : [opt]);
    cl.ajouter('SECTEURS', [H, lig(1, 'VIS', 'Viscéral'), lig(9, 'MAT', 'Maternité')]);
    let sec = vm.runInContext('getSecteurs()', ctx);
    V('onglet sans colonne OPTIONNEL : aucun secteur optionnel', sec.every(x => x.optionnel === false), sec.map(x => x.optionnel));
    cl.ajouter('SECTEURS', [H.concat(['OPTIONNEL']), lig(1, 'VIS', 'Viscéral', ''), lig(9, 'MAT', 'Maternité', ''), lig(10, 'PED', 'Pédiatrie', 'O')]);
    sec = vm.runInContext('getSecteurs()', ctx);
    V('PED optionnel, VIS et MAT non', sec.find(x => x.code === 'PED').optionnel === true && !sec.find(x => x.code === 'VIS').optionnel && !sec.find(x => x.code === 'MAT').optionnel);
    V('la pédiatrie suit la maternité', sec.map(x => x.code).join(',') === 'VIS,MAT,PED', sec.map(x => x.code));
    const HC = ['CODE','LABEL','OUVRABLE','ACTIF','LUN_AM','LUN_PM','MAR_AM','MAR_PM','MER_AM','MER_PM','JEU_AM','JEU_PM','VEN_AM','VEN_PM'];
    cl.ajouter('CS_TEMPLATE', [HC.concat(['XL_LABEL', 'XL_BG', 'OPTIONNEL']),
      ['CS-VIS', 'CS Viscéral', 'O', 'O', 0, 2, 0, 1, 0, 1, 0, 1, 0, 0, '', '', ''],
      ['CS-PED', 'CS Pédiatrie', 'O', 'O', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', '', 'O']]);
    const cs = vm.runInContext('getCsTemplate()', ctx);
    V('CS Pédiatrie optionnelle, sans aucun créneau obligatoire', cs.types.find(t => t.code === 'CS-PED').optionnel === true
      && !Object.values(cs.required).some(d => (d.am['CS-PED'] || d.pm['CS-PED'])), cs.types);
    V('CS Viscéral reste obligatoire comme avant', cs.types.find(t => t.code === 'CS-VIS').optionnel === false && cs.required[0].pm['CS-VIS'] === 2);
  }

  console.log(`\n${ko === 0 ? '✅' : '❌'} banc_notes_planning : ${ok} vérifications, ${ko} échec(s)`);
  process.exit(ko === 0 ? 0 : 1);
})();
