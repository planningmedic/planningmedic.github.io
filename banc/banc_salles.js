/* ═══ BANC — SALLES / MAR DANS L'ONGLET PLANNING DU COMITÉ (25/11/2026) ═══
   Demande du responsable : le comité regarde dans le planning opératoire combien de salles
   ouvrent pour savoir combien de MAR placer. Aucun export n'est possible depuis ce logiciel :
   une SEMAINE TYPE du nombre de salles (onglet SALLES_TYPE), corrigée au jour le jour, et un
   compteur « salles · placés / attendus » en tête de chaque case.
   Règles du responsable : 1 MAR pour 2 salles (arrondi au-dessus), 1 par salle aux endoscopies ;
   réa, maternité et DVI : directement un nombre de MAR attendus. La correction d'un jour est
   PARTAGÉE par tout le comité (note SALLES du planning, comme l'interne).
   Ce qui ne doit JAMAIS arriver :
     · 5 salles comptées pour 2 MAR (arrondi au-dessous) ;
     · un MAR en consultation le matin (affiché dans son secteur) compté comme tenant une salle ;
     · une correction gardée sur un seul poste ;
     · une case vide de la semaine type qui affiche « 0 » partout ;
     · une correction écrite dans PLANNING_OVERRIDES (relu comme « un MAR, un jour ») ;
     · le code qui crée ou écrit l'onglet SALLES_TYPE (saisi à la main par le responsable).
   Tout le code exécuté est EXTRAIT des fichiers livrés. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const adm = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const gardes = fs.readFileSync(path.join(__dirname, '..', 'gas', 'gardes.gs'), 'utf8');

function fonctionAdm(nom) {
  const i = adm.indexOf('\nfunction ' + nom + '(');
  if (i < 0) throw new Error('fonction absente : ' + nom);
  return adm.slice(i + 1, adm.indexOf('\n}\n', i) + 2);
}

// ── Côté serveur ─────────────────────────────────────────────────────────
function serveur() {
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE', 'MAR_ID', 'MATIN', 'APREM', 'COMMENTAIRE']]);
  const ctx = vm.createContext({ console, JSON, Date, String, Number, Object, Array, Math, RegExp, Error, isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl } });
  ['NOTES_ENTETE_', 'NOTES_TYPES_'].forEach(n => vm.runInContext(gardes.match(new RegExp('const\\s+' + n + '\\s*=[^;]*;'))[0].replace('const ', 'var '), ctx));
  ['_notesOnglet_', '_notesDate_', '_notesCodesCs_', '_notesAides_', '_notesSalles_', 'loadPlanningNotes', 'savePlanningNotesBatch', 'getSallesType']
    .forEach(n => vm.runInContext(extraireFonction('../gas/gardes.gs', n), ctx));
  return { cl, ctx };
}
const ENTETE = ['SECTEUR', 'MODE', 'SALLES_PAR_MAR', 'LUN_AM', 'LUN_PM', 'MAR_AM', 'MAR_PM', 'MER_AM', 'MER_PM', 'JEU_AM', 'JEU_PM', 'VEN_AM', 'VEN_PM'];

// ── Côté page ────────────────────────────────────────────────────────────
function page(cfg, notes) {
  const envois = [];
  const ctx = vm.createContext({ console, JSON, Math, Number, String, Object, Array, Date,
    SECTEURS_CFG: [{ code: 'VIS', label: 'Bloc viscéral' }, { code: 'END', label: 'Endoscopies' }, { code: 'REA', label: 'Réanimation' }],
    _escHtml: s => String(s), renderWeek: () => {}, document: { getElementById: () => null },
    _enregistrerNotes: (items) => { envois.push(items); return Promise.resolve(true); },
    window: {} });
  ctx.window = ctx;
  ctx._PLAN_NOTES = notes || {};
  vm.runInContext('function _notesPlanning() { return window._PLAN_NOTES; }', ctx);
  vm.runInContext(adm.match(/\nlet SALLES_CFG = null;[^\n]*/)[0].replace('let ', 'var '), ctx);
  ['_sallesCase', '_badgeSalles', '_popSalles', 'majSalles'].forEach(n => vm.runInContext(fonctionAdm(n), ctx));
  ctx.SALLES_CFG = cfg;
  return { ctx, envois, ev: e => vm.runInContext(e, ctx) };
}
const semaine = v => Object.fromEntries([0, 1, 2, 3, 4].map(d => [d, { am: v, pm: v }]));
const CFG = {
  secteurs: { VIS: { mode: 'SALLES', parMar: 2 }, END: { mode: 'SALLES', parMar: 1 }, REA: { mode: 'MAR', parMar: 1 } },
  type: { VIS: Object.assign(semaine(4), { 1: { am: 5, pm: null } }), END: semaine(2), REA: semaine(3) },
};
const MARDI = '2026-12-01', LUNDI = '2026-11-30', SAMEDI = '2026-12-05';

(async () => {
  console.log('\n═══ 1. Semaine type : lecture de l\'onglet SALLES_TYPE ═══');
  {
    const S = serveur();
    V('onglet absent : aucun compteur, aucune erreur, rien de créé', vm.runInContext('getSallesType()', S.ctx) === null && !S.cl.getSheetByName('SALLES_TYPE'));
    S.cl.ajouter('SALLES_TYPE', [ENTETE,
      ['VIS', 'SALLES', 2, 4, 4, 5, '', 4, 4, 4, 4, 3, 3],
      ['END', 'SALLES', 1, 2, 2, 2, 2, 3, 2, 2, 2, 2, 0],
      ['rea', 'mar', '', 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      ['', 'SALLES', 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ['CS-VIS!', 'SALLES', 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]);
    const t = vm.runInContext('getSallesType()', S.ctx);
    V('trois secteurs lus, lignes sans code ou au code invalide ignorées', JSON.stringify(Object.keys(t.secteurs)) === '["VIS","END","REA"]', Object.keys(t.secteurs));
    V('viscéral : mode salles, 1 MAR pour 2', JSON.stringify(t.secteurs.VIS) === '{"mode":"SALLES","parMar":2}', t.secteurs.VIS);
    V('réa en minuscules : mode MAR reconnu, 1 pour 1', JSON.stringify(t.secteurs.REA) === '{"mode":"MAR","parMar":1}', t.secteurs.REA);
    V('mardi matin viscéral = 5, mardi après-midi vide = null (pas de compteur)', t.type.VIS[1].am === 5 && t.type.VIS[1].pm === null, t.type.VIS[1]);
    V('vendredi après-midi endo : 0 reste 0 (fermé), différent de vide', t.type.END[4].pm === 0, t.type.END[4]);
    V('lecture seule : l\'onglet n\'est jamais réécrit', S.cl.getSheetByName('SALLES_TYPE').lignes.length === 6);
    V('le code ne crée jamais l\'onglet SALLES_TYPE', !/insertSheet\(\s*'SALLES_TYPE'/.test(gardes));
  }

  console.log('\n═══ 2. Correction d\'un jour : note SALLES partagée par le comité ═══');
  {
    const S = serveur();
    const ecrire = items => vm.runInContext('savePlanningNotesBatch(' + JSON.stringify(items) + ')', S.ctx);
    const lire = () => vm.runInContext('loadPlanningNotes()', S.ctx);
    ecrire([{ date: MARDI, type: 'SALLES', demi: 'am', texte: 'VIS:6,END:3' }]);
    V('mardi matin : 6 salles en viscéral, 3 en endo', JSON.stringify(lire()[MARDI]) === JSON.stringify({ salles: { am: { VIS: 6, END: 3 }, pm: {} } }), lire()[MARDI]);
    V('rien n\'est écrit dans PLANNING_OVERRIDES (personne n\'est affecté)', S.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length === 1);
    ecrire([{ date: MARDI, type: 'SALLES', demi: 'am', texte: 'VIS:5' }]);
    V('réécrire la demi-journée remplace la liste, sans doublon de ligne', JSON.stringify(lire()[MARDI].salles.am) === '{"VIS":5}' && S.cl.getSheetByName('PLANNING_NOTES').lignes.length === 2);
    ecrire([{ date: MARDI, type: 'SALLES', demi: 'am', texte: 'vis:4, VIS:9, CS-VIS:2, END:x, ORT:123, <b>:1, ORT:0' }]);
    V('seules les paires valables (une par secteur, 0 compris) sont gardées', JSON.stringify(lire()[MARDI].salles.am) === '{"VIS":4,"ORT":0}', lire()[MARDI]);
    ecrire([{ date: MARDI, type: 'SALLES', demi: 'am', texte: '' }]);
    V('liste vide = ligne supprimée (retour à la semaine type)', !lire()[MARDI] && S.cl.getSheetByName('PLANNING_NOTES').lignes.length === 1);
    ecrire([{ date: MARDI, type: 'SALLES', demi: '', texte: 'VIS:6' }]);
    V('demi-journée absente : rien n\'est écrit', !lire()[MARDI]);
    vm.runInContext('NOTES_TYPES_.SALLES = false', S.ctx);
    ecrire([{ date: MARDI, type: 'SALLES', demi: 'am', texte: 'VIS:6' }]);
    V('contre-épreuve : type SALLES retiré → rien n\'est écrit', !lire()[MARDI]);
  }

  console.log('\n═══ 3. Le calcul : salles → MAR attendus ═══');
  {
    const P = page(CFG, {});
    const c = (s, d, h) => P.ev(`JSON.stringify(_sallesCase('${s}','${d}','${h}'))`);
    V('4 salles de viscéral → 2 MAR attendus', JSON.parse(c('VIS', LUNDI, 'am')).besoin === 2);
    V('5 salles de viscéral → 3 MAR (arrondi au-dessus, jamais 2)', JSON.parse(c('VIS', MARDI, 'am')).besoin === 3, c('VIS', MARDI, 'am'));
    V('endoscopies : 2 salles → 2 MAR (1 par salle)', JSON.parse(c('END', LUNDI, 'am')).besoin === 2);
    V('réa : 3 MAR attendus directement', JSON.parse(c('REA', LUNDI, 'pm')).besoin === 3 && JSON.parse(c('REA', LUNDI, 'pm')).mode === 'MAR');
    V('case vide de la semaine type : pas de compteur', c('VIS', MARDI, 'pm') === 'null');
    V('secteur absent de l\'onglet (ex. ortho) : pas de compteur', c('ORT', LUNDI, 'am') === 'null');
    V('week-end : pas de compteur', c('VIS', SAMEDI, 'am') === 'null');
    V('sans onglet (SALLES_CFG nul) : pas de compteur', (P.ev('SALLES_CFG = null'), c('VIS', LUNDI, 'am') === 'null'));
  }

  console.log('\n═══ 4. Le compteur affiché ═══');
  {
    const P = page(CFG, {});
    const b = (s, d, h, n) => P.ev(`_badgeSalles('${s}','${d}','${h}',${n})`);
    V('2 placés pour 4 salles : « 4 salles · 2/2 » en vert', /4 salles<\/span><span class="sb-r ok">2\/2</.test(b('VIS', LUNDI, 'am', 2)), b('VIS', LUNDI, 'am', 2));
    V('2 placés pour 5 salles : 2/3 en orange (il manque un MAR)', /sb-r manque">2\/3</.test(b('VIS', MARDI, 'am', 2)));
    V('3 placés pour 2 salles d\'endo : 3/2 en gris (un de trop)', /sb-r trop">3\/2</.test(b('END', LUNDI, 'am', 3)));
    V('réa : « 3/3 » sans mention de salles', /^<span class="sb"[^>]*><span class="sb-r ok">3\/3<\/span><\/span>$/.test(b('REA', LUNDI, 'am', 3)), b('REA', LUNDI, 'am', 3));
    V('case vide de la semaine type : rien n\'est ajouté à la case', b('VIS', MARDI, 'pm', 2) === '');
    V('0 salle et personne de placé : rien (case fermée, pas de bruit)', (P.ev('SALLES_CFG.type.END[4].pm = 0'), b('END', '2026-12-04', 'pm', 0) === ''));
    V('0 salle mais un MAR placé : 1/0 en gris (signalé)', /sb-r trop">1\/0</.test(b('END', '2026-12-04', 'pm', 1)));
  }

  console.log('\n═══ 5. Corriger un jour depuis la page ═══');
  {
    const P = page(JSON.parse(JSON.stringify(CFG)), {});
    P.ev(`majSalles('VIS','${MARDI}','am',1)`);
    V('+1 sur 5 salles : la page envoie une note SALLES « VIS:6 » pour mardi matin', JSON.stringify(P.envois[0]) === JSON.stringify([{ date: MARDI, type: 'SALLES', demi: 'am', texte: 'VIS:6' }]), P.envois[0]);
    V('…et l\'affiche tout de suite : 6 salles soulignées, 3 attendus', /sb-n mod">6 salles<\/span><span class="sb-r manque">2\/3</.test(P.ev(`_badgeSalles('VIS','${MARDI}','am',2)`)));
    V('la fenêtre rappelle la semaine type et propose d\'y revenir', /Semaine type : 5 salles/.test(P.ev(`_popSalles('VIS','${MARDI}','am')`)) && /Revenir à la semaine type/.test(P.ev(`_popSalles('VIS','${MARDI}','am')`)));
    P.ev(`majSalles('END','${MARDI}','am',1)`);
    V('une 2e correction le même demi-jour renvoie la liste complète « VIS:6,END:3 »', P.envois[1][0].texte === 'VIS:6,END:3', P.envois[1]);
    P.ev(`majSalles('VIS','${MARDI}','am',-1)`);
    V('revenir à 5 (la valeur type) efface la correction au lieu de l\'écrire', P.envois[2][0].texte === 'END:3', P.envois[2]);
    P.ev(`majSalles('END','${MARDI}','am',null)`);
    V('« Revenir à la semaine type » : note vidée (ligne supprimée côté serveur)', P.envois[3][0].texte === '', P.envois[3]);
    for (let i = 0; i < 8; i++) P.ev(`majSalles('VIS','${LUNDI}','pm',-1)`);
    V('jamais en dessous de 0 salle', JSON.parse(P.ev(`JSON.stringify(_sallesCase('VIS','${LUNDI}','pm'))`)).n === 0);
    V('la correction passe par les notes du planning (partagées), jamais par le poste', /return _enregistrerNotes\(\[\{ date: date, type: 'SALLES', demi: half,/.test(adm) && !/localStorage[^\n]*salles/i.test(adm));
  }

  console.log('\n═══ 6. Branchements dans la page et le serveur ═══');
  {
    V('le MAR en consultation le matin est marqué (mir) quand il s\'affiche dans son secteur', /smap\[secMatin\]\[dow\]\.am\.push\(\{init:doc\.initials, id:doc\.id, status:st, mir:true\}\)/.test(adm));
    V('…et n\'est pas compté comme tenant une salle ; l\'aide sans nom, elle, compte', /_badgeSalles\(sector, date, slotKey, items\.filter\(p => !p\.mir\)\.length \+ _aidesCase\(NOTES, date, slotKey, sector\)\.length\)/.test(adm));
    V('semaine type chargée à l\'ouverture (miroir ou serveur)', /sallesType: cfg\.sallesType \|\| null/.test(adm) && /SALLES_CFG = \(_boot && _boot\.sallesType && _boot\.sallesType\.secteurs\) \? _boot\.sallesType : null;/.test(adm));
    const mir = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
    const eq = fs.readFileSync(path.join(__dirname, '..', 'gas', 'equipe.gs'), 'utf8');
    V('le serveur la sert au comité (copie et bootstrap)', /out\.sallesType = getSallesType\(\)/.test(mir) && /out\.sallesType = getSallesType\(\)/.test(eq));
    V('une édition à la main de SALLES_TYPE rafraîchit la vue du comité', /SALLES_TYPE:\s*\['config_admin'\]/.test(mir));
    const pl = fs.readFileSync(path.join(__dirname, '..', 'planning.html'), 'utf8');
    V('rien côté MAR : la page des MAR ne lit pas les salles', !/\.salles\b/.test(pl));
  }

  console.log('\n═══ 7. Rendu réel de la grille (admin.html chargée telle quelle) ═══');
  {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(adm, { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
      beforeParse(win) { ['portail.js', 'rendu_equite.js'].forEach(f => win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', f), 'utf8'))); win.todayStr = () => LUNDI; } });
    const w = dom.window;
    await new Promise(r => setTimeout(r, 400));
    const jours = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'];
    const days = jours.map((d, i) => ({ date: d, day: +d.slice(8), year: 2026, isWeekend: i >= 5, isFerie: false }));
    const vide = () => jours.map(() => ({ status: '', morning: '', afternoon: '', cs: '' }));
    const docs = ['A1', 'A2', 'A3'].map(id => ({ id, initials: id, days: vide() }));
    docs[0].days[0] = { status: '', morning: 'VIS', afternoon: 'VIS' };
    docs[1].days[0] = { status: '', morning: 'VIS', afternoon: 'VIS' };
    docs[2].days[0] = { status: '', morning: 'CS-VIS', afternoon: 'VIS' };   // consultation le matin, viscéral l'après-midi
    w.__init = `
      SECTEURS_CFG = [{ordre:1,code:'VIS',label:'Bloc viscéral',court:'Viscéral',aff:'Viscéral',icon:'Activity',bg:'#EFF6FF',fg:'#1D4ED8',cs:'CS-VIS',actif:true}];
      rebuildSecteursDerivations();
      loadCsTemplate({ types:[{code:'CS-VIS',label:'CS Viscéral',ouvrable:true}], required:{0:{am:{},pm:{}},1:{am:{},pm:{}},2:{am:{},pm:{}},3:{am:{},pm:{}},4:{am:{},pm:{}}} });
      DATA = ${JSON.stringify({ months: [{ id: '2026-12', year: 2026, month: 12, days, weeks: [], doctors: docs }] })};
      marsData = []; window.AFFM = {}; _localOverrides = {}; currentWeekIdx = 0;
      SALLES_CFG = ${JSON.stringify({ secteurs: { VIS: { mode: 'SALLES', parMar: 2 } }, type: { VIS: semaine(4) } })};
      window._PLAN_NOTES = {};
      renderWeek();`;
    w.eval(w.__init);
    const lundi = () => [...w.document.querySelectorAll('#planTable .sector-row td.td-day')][0];
    const compteurs = () => [...lundi().querySelectorAll('.sb')].map(x => x.textContent);
    V('lundi matin : la consultation du matin n\'est pas comptée → 4 salles · 2/2', compteurs()[0] === '4 salles2/2', compteurs());
    V('lundi après-midi : les trois en salle → 3/2 (un de trop)', compteurs()[1] === '4 salles3/2', compteurs());
    // Contre-épreuve : la même page SANS le marqueur mir compterait la consultation du matin (3/2).
    {
      const dom2 = new JSDOM(adm.replace(', mir:true});', '});'), { runScripts: 'dangerously', virtualConsole: new VirtualConsole(), url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
        beforeParse(win) { ['portail.js', 'rendu_equite.js'].forEach(f => win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', f), 'utf8'))); win.todayStr = () => LUNDI; } });
      await new Promise(r => setTimeout(r, 400));
      dom2.window.eval(w.__init);
      const c2 = [...[...dom2.window.document.querySelectorAll('#planTable .sector-row td.td-day')][0].querySelectorAll('.sb')].map(x => x.textContent);
      V('contre-épreuve : sans le marqueur, la consultation du matin serait comptée (3/2)', c2[0] === '4 salles3/2', c2);
    }
    w.eval(`window._PLAN_NOTES = { '2026-11-30': { salles: { am: { VIS: 6 }, pm: {} } } }; renderWeek();`);
    V('correction partagée relue des notes : 6 salles soulignées → 2/3 en orange', compteurs()[0] === '6 salles2/3' && !!lundi().querySelector('.sb-n.mod') && !!lundi().querySelector('.sb-r.manque'), compteurs());
    w.eval(`SALLES_CFG = null; window._PLAN_NOTES = {}; renderWeek();`);
    V('sans semaine type : la grille est exactement celle d\'avant (aucun compteur)', lundi().querySelectorAll('.sb').length === 0);
  }

  console.log(`\n${ko ? '✗' : '✓'} salles / MAR : ${ok} ✓, ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
