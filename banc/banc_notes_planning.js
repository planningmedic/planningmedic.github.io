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
  ['_notesOnglet_', '_notesDate_', '_notesCodesCs_', '_notesAides_', 'loadPlanningNotes', 'savePlanningNotesBatch', '_act_savePlanningNotes']
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

  console.log('\n═══ 1 bis. Consultation tenue par le secteur, sans nom (type CSS) ═══');
  {
    /* (20/11/2026) Comme « VISC » sur l'Excel papier : une ligne par demi-journée, les codes de
       consultation séparés par des virgules. Rien dans PLANNING_OVERRIDES : personne n'est affecté. */
    const W = monde();
    ecrire(W, [{ date: '2026-11-17', type: 'CSS', demi: 'pm', texte: 'CS-VIS,CS-ORT' }, { date: '2026-11-17', type: 'CSS', demi: 'am', texte: 'CS-ORL' }]);
    let n = lire(W);
    V('mardi : ORL le matin, viscéral et ortho l\'après-midi', JSON.stringify(n['2026-11-17']) === JSON.stringify({ css: { am: ['CS-ORL'], pm: ['CS-VIS', 'CS-ORT'] } }), n['2026-11-17']);
    V('rien n\'est écrit dans PLANNING_OVERRIDES', W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length === 1);
    ecrire(W, [{ date: '2026-11-17', type: 'CSS', demi: 'pm', texte: 'CS-VIS' }]);
    n = lire(W);
    V('réécrire la demi-journée remplace la liste (ortho retirée), sans doublon de ligne', JSON.stringify(n['2026-11-17'].css.pm) === '["CS-VIS"]' && W.cl.getSheetByName('PLANNING_NOTES').lignes.length === 3, n['2026-11-17']);
    ecrire(W, [{ date: '2026-11-17', type: 'CSS', demi: 'pm', texte: 'cs-vis, VIS, <b>, CS-VIS' }]);
    V('seuls des codes de consultation sont gardés, une fois chacun', JSON.stringify(lire(W)['2026-11-17'].css.pm) === '["CS-VIS"]', lire(W)['2026-11-17']);
    ecrire(W, [{ date: '2026-11-17', type: 'CSS', demi: 'pm', texte: '' }, { date: '2026-11-17', type: 'CSS', demi: 'am', texte: '' }]);
    V('liste vide = ligne supprimée', !lire(W)['2026-11-17'] && W.cl.getSheetByName('PLANNING_NOTES').lignes.length === 1);
    const r = ecrire(W, [{ date: '2026-11-18', type: 'CSS', demi: '', texte: 'CS-VIS' }, { date: '2026-11-18', type: 'CSS', demi: 'am', texte: 'rien' }]);
    V('demi-journée absente ou aucun code valable : rien n\'est écrit', !lire(W)['2026-11-18'], { r, n: lire(W) });
    W.cl.getSheetByName('PLANNING_NOTES').lignes.push(['2026-11-19', 'CSS', 'am', 'CS-VIS,n importe quoi']);
    V('lecture d\'une ligne saisie à la main : codes invalides ignorés', JSON.stringify(lire(W)['2026-11-19']) === JSON.stringify({ css: { am: ['CS-VIS'], pm: [] } }), lire(W)['2026-11-19']);
  }

  console.log('\n═══ 1 ter. La page admin : compte comme pourvue, n\'affecte personne ═══');
  {
    const adm = require('fs').readFileSync('../admin.html', 'utf8');
    const c = vm.createContext({ CS_TYPES: [{ code: 'CS-VIS', label: 'CS Viscéral' }, { code: 'CS-PED', label: 'CS Pédiatrie' }] });
    ['_csSecteurs', '_csLibSecteur'].forEach(f => { const i = adm.indexOf('function ' + f + '('); vm.runInContext(adm.slice(i, adm.indexOf('\n}', i) + 2), c); });
    const N = { '2026-11-17': { css: { am: [], pm: ['CS-VIS'] } } };
    V('lecture des notes : viscéral le mardi après-midi seulement', JSON.stringify(vm.runInContext('_csSecteurs(' + JSON.stringify(N) + ',"2026-11-17","pm")', c)) === '["CS-VIS"]'
      && vm.runInContext('_csSecteurs(' + JSON.stringify(N) + ',"2026-11-17","am")', c).length === 0 && vm.runInContext('_csSecteurs({},"2026-11-17","pm")', c).length === 0);
    V('le nom affiché est celui du secteur, sans « CS »', vm.runInContext('_csLibSecteur("CS-VIS")', c) === 'Viscéral' && vm.runInContext('_csLibSecteur("CS-INCONNU")', c) === 'INCONNU');
    V('la case compte comme pourvue (le « à pourvoir » soustrait la consultation au nom du secteur)',
      /cell\.flash_pm = _cPm \? 0 : Math\.max\(0, \(\(req\.pm && req\.pm\[t\.code\]\) \|\| 0\) - cell\.pm\.length - _sPm\);/.test(adm));
    V('elle ne passe jamais par PLANNING_OVERRIDES (aucun MAR affecté)', /return _enregistrerNotes\(\[\{ date: date, type: 'CSS', demi: demi, texte: css\[demi\]\.join\(','\) \}\], avant\);/.test(adm));
    V('le panneau de la consultation propose « … sans nom »', /« ' \+ _ls \+ ' » sans nom'/.test(adm));
    const pl = require('fs').readFileSync('../planning.html', 'utf8');
    /* (20/11/2026, demande du responsable) l'abrégé du secteur (VISC, ORTH…) plutôt que « secteur », même police que les initiales. */
    V('les MAR la voient avec l\'abrégé : semaine et vue du jour', /<span class="cons-mar">\$\{esc\(_csAbregePl\(c\.spec\)\)\}<\/span>/.test(pl) && /'<span class="jb-aim petit jb-aim-sect">'\+esc\(_csAbregePl\(o\.sp\)\)/.test(pl) && !/le secteur<\/span>|jb-sect">secteur</.test(pl));
    { const cx = vm.createContext({}); vm.runInContext(pl.match(/const CS_ABREGES_PL = \{[^}]*\};/)[0].replace('const ', 'var '), cx); const i = pl.indexOf('function _csAbregePl('); vm.runInContext(pl.slice(i, pl.indexOf('\n', i)), cx);
      V('…mêmes abrégés que l\'Excel du comité : VISC ORTH ORL ENDO INTER MAT POLY PED', vm.runInContext('JSON.stringify(["VIS","CS-ORT","ORL","END","INTER","MAT","POLY","PED"].map(_csAbregePl))', cx) === JSON.stringify(['VISC','ORTH','ORL','ENDO','INTER','MAT','POLY','PED'])); }
    V('plus d\'italique : consultation et aide en même police que les initiales', !/cs-secteur \{[^}]*italic/.test(adm) && !/slot-aide \{[^}]*italic/.test(adm) && !/chip-sect \{[^}]*italic/.test(pl) && !/jb-aim-sect\{[^}]*italic/.test(pl));
  }

  console.log('\n═══ 1 quater. Case de bloc aidée par un autre secteur, sans nom (type AIDE) ═══');
  {
    /* (20/11/2026) Comme « ORL » dans la ligne viscéral de l'Excel papier : une ligne par
       demi-journée, paires SECTEUR_AIDÉ:SECTEUR_QUI_AIDE. Rien dans PLANNING_OVERRIDES. */
    const W = monde();
    ecrire(W, [{ date: '2026-11-23', type: 'AIDE', demi: 'pm', texte: 'VIS:ORL,END:ORT' }]);
    let n = lire(W);
    V('lundi après-midi : ORL aide en viscéral, ortho aide en endoscopie', JSON.stringify(n['2026-11-23']) === JSON.stringify({ aide: { am: [], pm: ['VIS:ORL', 'END:ORT'] } }), n['2026-11-23']);
    V('rien n\'est écrit dans PLANNING_OVERRIDES (personne n\'est affecté)', W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length === 1);
    ecrire(W, [{ date: '2026-11-23', type: 'AIDE', demi: 'pm', texte: 'VIS:ORL' }]);
    V('réécrire la demi-journée remplace la liste, sans doublon de ligne', JSON.stringify(lire(W)['2026-11-23'].aide.pm) === '["VIS:ORL"]' && W.cl.getSheetByName('PLANNING_NOTES').lignes.length === 2);
    ecrire(W, [{ date: '2026-11-23', type: 'AIDE', demi: 'pm', texte: 'vis:orl, VIS:VIS, CS-VIS:ORL, VIS, <b>:x, VIS:ORL' }]);
    V('seules des paires valables sont gardées (minuscules corrigées, ni soi-même, ni consultation, ni doublon)', JSON.stringify(lire(W)['2026-11-23'].aide.pm) === '["VIS:ORL"]', lire(W)['2026-11-23']);
    ecrire(W, [{ date: '2026-11-23', type: 'AIDE', demi: 'pm', texte: '' }]);
    V('liste vide = ligne supprimée', !lire(W)['2026-11-23'] && W.cl.getSheetByName('PLANNING_NOTES').lignes.length === 1);
    ecrire(W, [{ date: '2026-11-24', type: 'AIDE', demi: '', texte: 'VIS:ORL' }]);
    V('demi-journée absente : rien n\'est écrit', !lire(W)['2026-11-24']);
    // Contre-épreuve : sans le type AIDE, la même écriture n'aurait rien donné.
    vm.runInContext('NOTES_TYPES_.AIDE = false', W.ctx);
    ecrire(W, [{ date: '2026-11-25', type: 'AIDE', demi: 'am', texte: 'VIS:ORL' }]);
    V('contre-épreuve : type AIDE retiré → rien n\'est écrit', !lire(W)['2026-11-25']);
    vm.runInContext('NOTES_TYPES_.AIDE = true', W.ctx);

    const adm = require('fs').readFileSync('../admin.html', 'utf8');
    const c = vm.createContext({ SECTEURS_ACTIFS: [{ code: 'VIS', label: 'Bloc viscéral' }, { code: 'ORL', label: 'ORL / Ophtalmologie' }, { code: 'END', label: 'Endoscopies' }] });
    vm.runInContext(adm.match(/const AIDE_ABREGES = \{[^}]*\};/)[0].replace('const ', 'var '), c);
    ['_aideAbrege', '_aideLibelle', '_aidesCase', '_aideLigne'].forEach(f => { const i = adm.indexOf('function ' + f + '('); vm.runInContext(adm.slice(i, adm.indexOf('\n}', i) + 2), c); });
    vm.runInContext('function _escHtml(x){return String(x)} function _notesPlanning(){return N} var N = {}', c);
    const N = { '2026-11-23': { aide: { am: [], pm: ['VIS:ORL', 'END:ORT'] } } };
    vm.runInContext('N = ' + JSON.stringify(N), c);
    V('admin : la case viscéral du lundi après-midi lit « ORL », pas le matin, pas l\'endoscopie pour le viscéral',
      JSON.stringify(vm.runInContext('_aidesCase(N,"2026-11-23","pm","VIS")', c)) === '["ORL"]' && vm.runInContext('_aidesCase(N,"2026-11-23","am","VIS")', c).length === 0
      && JSON.stringify(vm.runInContext('_aidesCase(N,"2026-11-23","pm","END")', c)) === '["ORT"]');
    V('abrégés : VISC ORTH ORL ENDO CARDIO RADIO MAT PED REA DVI (6 lettres au plus pour un nouveau)',
      vm.runInContext('JSON.stringify(["VIS","ORT","ORL","END","CI","RI","MAT","PED","REA","DVI","NOUVEAUSECT"].map(_aideAbrege))', c) === JSON.stringify(['VISC','ORTH','ORL','ENDO','CARDIO','RADIO','MAT','PED','REA','DVI','NOUVEA']));
    const ligne = vm.runInContext('_aideLigne("VIS","2026-11-23","pm",false)', c);
    V('panneau d\'une case de bloc : un bouton par AUTRE secteur, celui posé est actif', /Aide sans nom/.test(ligne) && !/>VISC</.test(ligne) && /class="on"[^>]*>ORL</.test(ligne) && /class=""[^>]*>ENDO</.test(ligne), ligne.slice(0, 200));
    V('…jamais dans le panneau d\'une consultation ni de la consultation libérale', vm.runInContext('_aideLigne("CS-VIS","2026-11-23","pm",false)', c) === '' && vm.runInContext('_aideLigne("END","2026-11-23","pm",true)', c) === '');
    V('admin : elle ne passe jamais par PLANNING_OVERRIDES', /return _enregistrerNotes\(\[\{ date: date, type: 'AIDE', demi: demi, texte: ai\[demi\]\.join\(','\) \}\], avant\);/.test(adm));
    const pl = require('fs').readFileSync('../planning.html', 'utf8');
    V('mêmes abrégés côté MAR que côté comité', (pl.match(/const AIDE_ABREGES = \{[^}]*\};/) || [])[0] === adm.match(/const AIDE_ABREGES = \{[^}]*\};/)[0]);
    const cp = vm.createContext({ DATA: { notes: N } });
    ['_notesDuJour'].forEach(f => { const i = pl.indexOf('function ' + f + '('); vm.runInContext(pl.slice(i, pl.indexOf('\n', i)), cp); });
    vm.runInContext(pl.match(/const AIDE_ABREGES = \{[^}]*\};/)[0].replace('const ', 'var '), cp);
    { const i = pl.indexOf('function _aidesDuJour('); vm.runInContext(pl.slice(i, pl.indexOf('\n', pl.indexOf('\n', i) + 1)), cp); }
    V('MAR : le lundi après-midi, « ORL » en viscéral et « ORTH » en endoscopie', vm.runInContext('JSON.stringify(_aidesDuJour("2026-11-23","pm"))', cp) === JSON.stringify([{ sect: 'VIS', abr: 'ORL' }, { sect: 'END', abr: 'ORTH' }]));
    V('MAR : vue semaine (étiquette en pointillés) et vue du jour (étiquette à la place de l\'aimant)', /p\.status==='SECT'\?'slot-name chip-sect'/.test(pl) && /aimOuSect = i => \(i && typeof i === 'object'\) \? '<span class="jb-aim jb-aim-sect">'/.test(pl));
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
