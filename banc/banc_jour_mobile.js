/* ═══ BANC — VUE JOUR DU PLACEMENT QUOTIDIEN SUR TÉLÉPHONE (24/11/2026) ═══
   Demande du responsable : placer les MAR depuis le téléphone. La grille de la semaine (900 px)
   ne montrait qu'un jour et demi et son « + » n'apparaissait qu'au survol, impossible au doigt.
   Maquette validée : sur un écran de 720 px ou moins, une vue Jour (une ligne par secteur, deux
   grosses cases Matin / Après-midi) et une bascule Jour / Semaine.
   Ce qui ne doit JAMAIS arriver :
     · que l'ordinateur change : tout ce qui affiche la vue Jour vit sous @media (max-width:720px) ;
     · que la vue Jour calcule ses propres cases : elle reçoit makeSlot / makeCsSlot de renderWeek ;
     · qu'un nom « à placer » choisi soit posé ailleurs que dans la case touchée, ou sur une autre semaine ;
     · qu'une consultation fermée s'ouvre au toucher (elle garde son « rouvrir »).
   Tout le code exécuté est EXTRAIT de admin.html. */
const vm = require('vm');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };

const adm = fs.readFileSync(__dirname + '/../admin.html', 'utf8');
function fonction(nom) {
  const i = adm.indexOf('\nfunction ' + nom + '(');
  if (i < 0) throw new Error('fonction absente : ' + nom);
  const fin1 = adm.indexOf('\n', i + 1);
  const ligne = adm.slice(i + 1, fin1);
  const ouv = (ligne.match(/\{/g) || []).length, fer = (ligne.match(/\}/g) || []).length;
  if (ouv && ouv === fer) return ligne;
  return adm.slice(i + 1, adm.indexOf('\n}\n', i) + 2);
}

function monde(opts) {
  opts = opts || {};
  const appels = [];
  const classes = new Set();
  const stock = {};
  const ctx = vm.createContext({
    console, JSON, String, Object, Array, Set,
    window: {}, _localCloses: opts.closes || {},
    SECTOR_COLORS_AFF: { VIS: { bg: '#EFF6FF', fg: '#1D4ED8' } },
    getSectorBg: () => '#F2F4F7', getSectorFg: () => '#344054',
    _csSecteurs: (N, date, k) => (((N[date] || {}).css || {})[k] || []),
    renderWeek: () => appels.push(['renderWeek']),
    closeSidePanel: () => appels.push(['closeSidePanel']),
    openSidePanel: (...a) => appels.push(['openSidePanel', ...a]),
    placeMAR: (...a) => appels.push(['placeMAR', ...a]),
    localStorage: { getItem: k => stock[k] || null, setItem: (k, v) => { stock[k] = v; } },
    document: { body: { classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } } }, addEventListener() {} },
  });
  ctx.window = ctx;
  ['_mjEsc', '_mjJs', '_mjConstruire', 'mjJour', 'mjArmer', 'mjCase', 'mjVue'].forEach(n => vm.runInContext(fonction(n), ctx));
  return { ctx, appels, classes, stock };
}

// Semaine du lundi 23/11/2026 ; « aujourd'hui » = mardi 24.
function semaine(feries) {
  feries = feries || [];
  return [23, 24, 25, 26, 27, 28, 29].map((j, i) => ({ date: '2026-11-' + j, day: j, isWeekend: i >= 5, isFerie: feries.includes(i) }));
}
const cases = () => Array(7).fill(null).map(() => ({ am: [], pm: [] }));
function donnees(extra) {
  const smap = { VIS: cases(), REA: cases(), PED: cases() };
  smap.VIS[1].am.push({ init: 'AB', id: 'A1' });
  const csTypeMap = { 'CS-VIS': cases() };
  csTypeMap['CS-VIS'][1].pm.push({ init: 'CD', id: 'C1' });
  return Object.assign({
    wk: '2026-11-23', daySlots: semaine(), today: '2026-11-24', smap, csTypeMap,
    activeSectors: [{ code: 'VIS', label: 'Bloc viscéral' }, { code: 'REA', label: "Réa d'essai" }],
    activeCsTypes: [{ code: 'CS-VIS', label: 'CS Viscéral' }],
    cachees: [{ code: 'PED', label: 'Pédiatrie' }],
    makeSlot: (items, f, code, label, date, k) => items.map(p => `<span class="slot-name" onclick="openMarMenu('${p.id}')">${p.init}</span>`).join('') + `<span class="slot-add" data-k="${code}|${date}|${k}">+</span>`,
    makeCsSlot: (items, f, code, label, date, k) => `<div class="cs-cell" data-k="${code}|${date}|${k}">${items.map(p => p.init).join('')}</div>`,
    npJour: [[], [{ id: 'X1', init: 'XA', motif: 'non placé' }], [], [], [], [], []],
    presDe: {}, gardes: Array(7).fill(null).map(() => ({ g: null, g2: null })),
    h18row: Array(7).fill(null), sortieRow: Array(7).fill(null).map(() => []), absentRow: Array(7).fill(null).map(() => []),
    NOTES: {},
  }, extra || {});
}
const construire = (W, o) => { W.ctx.__o = o; return vm.runInContext('_mjConstruire(__o)', W.ctx); };
const compte = (h, re) => (h.match(re) || []).length;

console.log('\n═══ 1. L\'ordinateur ne change pas ═══');
{
  const iMedia = adm.indexOf('@media (max-width:720px){\n  .mj-only { display:flex; }');
  const finMedia = adm.indexOf('\n}\n', iMedia);
  const media = adm.slice(iMedia, finMedia);
  V('au repos (tout écran), la bascule et la vue Jour sont masquées', /\n\.mj-only, #mjDay \{ display:none; \}/.test(adm));
  V('elles ne s\'affichent que sous @media (max-width:720px)', iMedia > 0 && media.includes('.mj-only { display:flex; }') && media.includes('body.mj-jour #mjDay { display:block; }'));
  V('masquer la grille, les tuiles et le pied de semaine n\'arrive QUE dans ce bloc', media.includes('body.mj-jour #planKpis, body.mj-jour #tensionBand, body.mj-jour #planGridWrap, body.mj-jour #bottomSection { display:none !important; }')
    && adm.split('#planGridWrap').length === 2, adm.split('#planGridWrap').length - 1);
  V('la colonne figée de la grille semaine est réservée au téléphone', media.includes('#panel-planning .td-sector, #panel-planning .th-sector { position:sticky; left:0; z-index:2; }')
    && compte(adm, /\.td-sector, #panel-planning \.th-sector \{ position:sticky/g) === 1);
  V('le « + » toujours visible ne vaut que sans survol (écran tactile)', /@media \(hover:none\)\{ \.slot-add, #panel-planning \.slot-int-add \{ opacity:1; \}/.test(adm));
  V('les deux blocs sont dans la page : bascule Jour / Semaine et conteneur de la vue Jour',
    adm.includes('<button id="mjBJ" onclick="mjVue(\'jour\')">Jour</button><button id="mjBS" onclick="mjVue(\'semaine\')">Semaine</button>') && adm.includes('<div id="mjDay"></div>'));
}

console.log('\n═══ 2. La vue Jour reprend les cases de la grille ═══');
{
  V('renderWeek lui passe SES fonctions de case (makeSlot, makeCsSlot) et ses « à placer »',
    /_mjConstruire\(\{ wk: wk\.lundi, daySlots, today, smap, csTypeMap, activeSectors, activeCsTypes,\s*cachees: SECTORS\.filter\(s => s\.optionnel && !activeSectors\.includes\(s\)\), makeSlot, makeCsSlot, npJour: _npJour, presDe: _presDe,/.test(adm));
  V('une erreur de la vue Jour ne casse pas la grille (try/catch)', /try \{\s*const _mj = document\.getElementById\('mjDay'\);[\s\S]{0,600}\} catch \(e\) \{ console\.error\('Vue Jour \(téléphone\) ignorée :', e\); \}/.test(adm));
  const W = monde(); const h = construire(W, donnees());
  V('5 jours ouvrés dans la barre, le mardi (aujourd\'hui) sélectionné', compte(h, /<button class="mj-j/g) === 5 && /class="mj-j on np"[^>]*onclick="mjJour\(1\)"/.test(h), h.slice(0, 400));
  V('le jour sélectionné est retenu', W.ctx._mjDow === 1);
  V('les jours sans personne à placer portent ✓, le mardi « 1 à placer »', compte(h, /<small>✓<\/small>/g) === 4 && h.includes('<small>1 à placer</small>'));
  V('le bandeau « à placer » propose le nom, prêt à être posé', h.includes('1 présent à placer') && h.includes(`onclick="mjArmer('X1','XA')"`));
  V('une ligne par secteur affiché, deux cases cliquables chacune', compte(h, /class="mj-l"/g) === 2 && compte(h, /onclick="mjCase\(event,'/g) === 4, compte(h, /onclick="mjCase/g));
  V('chaque case contient la case de la grille (makeSlot) du bon jour et de la bonne demi-journée',
    h.includes('data-k="VIS|2026-11-24|am"') && h.includes('data-k="REA|2026-11-24|pm"') && h.includes(`onclick="openMarMenu('A1')">AB</span>`) && !h.includes('2026-11-23|am'));
  V('un libellé avec apostrophe ne casse pas le geste', h.includes(`mjCase(event,'REA','2026-11-24','Réa d\\'essai','am')`) && h.includes('Réa d&#39;essai</div>'));
  V('la couleur du secteur vient de l\'onglet SECTEURS', h.includes('--sb:#EFF6FF;--sf:#1D4ED8'));
  V('ligne optionnelle cachée : un bouton pour l\'afficher', h.includes(`onclick="afficherLigne('PED')">＋ Pédiatrie ce jour</button>`));
  V('consultations repliées de base : bandeau seul, aucune case', h.includes('Consultations <em>· 1 placée</em>') && !h.includes('cs-cell'));
  V('aucune info : seulement « Ajouter une info du jour »', h.includes(`onclick="editerInfo('2026-11-24')">✎ Ajouter une info du jour</button>`) && !h.includes('<details'));
}

console.log('\n═══ 3. Consultations, infos, pied ═══');
{
  const W = monde({ closes: { '2026-11-24': new Set(['CS-VIS|am']) } });
  W.ctx._csOuvert = true;
  const o = donnees({ NOTES: { '2026-11-24': { info: 'Salle 4 <fermée>' } } });
  o.gardes[1] = { g: 'GG', g2: 'HH' }; o.h18row[1] = 'EE'; o.sortieRow[1] = ['RR'];
  o.absentRow[1] = [{ init: 'V1', reason: 'V' }, { init: 'V2', reason: 'V' }, { init: 'F1', reason: 'F' }];
  const h = construire(W, o);
  V('dépliées : la consultation a ses deux cases (makeCsSlot)', h.includes('data-k="CS-VIS|2026-11-24|am"') && h.includes('data-k="CS-VIS|2026-11-24|pm"'));
  V('une consultation fermée ne s\'ouvre pas au toucher (son « rouvrir » reste le seul geste)', !h.includes(`mjCase(event,'CS-VIS','2026-11-24','CS Viscéral','am')`) && h.includes(`mjCase(event,'CS-VIS','2026-11-24','CS Viscéral','pm')`));
  V('info du jour : un dépliant, texte échappé', h.includes('<details class="mj-info"><summary>ℹ Info du jour</summary><p>Salle 4 &lt;fermée&gt;</p>'));
  V('pied : gardes, 18 h, sortie de garde, absents groupés par motif', h.includes('<b>GG · HH</b>') && h.includes('<b>EE</b>') && h.includes('<b>RR</b>') && h.includes('<b>V1 V2 (V) · F1 (F)</b>'));
}

console.log('\n═══ 4. Jour par défaut, fériés, changement de semaine ═══');
{
  const W = monde();
  let h = construire(W, donnees({ daySlots: semaine([1]) }));
  V('aujourd\'hui férié : la vue s\'ouvre sur le premier jour ouvré', W.ctx._mjDow === 0 && /class="mj-j on"[^>]*onclick="mjJour\(0\)"/.test(h));
  V('le férié est grisé, non sélectionnable', /<button class="mj-j np" disabled onclick="mjJour\(1\)"><span>MAR<\/span><b>24<\/b><small>férié<\/small>/.test(h), h.slice(0, 600));
  W.ctx._mjDow = 3; W.ctx._mjArme = { id: 'X1', init: 'XA' };
  construire(W, donnees({ daySlots: semaine([1]) }));
  V('même semaine : le jour choisi est gardé', W.ctx._mjDow === 3);
  construire(W, donnees({ wk: '2026-11-30', daySlots: semaine(), today: '2026-11-24' }));
  V('autre semaine : jour remis par défaut et nom « à placer » oublié (jamais posé sur une autre semaine)', W.ctx._mjDow === 1 && W.ctx._mjArme === null);
  const W2 = monde();
  h = construire(W2, donnees({ daySlots: semaine([0, 1, 2, 3, 4]) }));
  V('semaine sans jour ouvré : un message, aucune case', h.includes('Aucun jour ouvré cette semaine.') && !h.includes('mj-c'));
}

console.log('\n═══ 5. Les gestes ═══');
{
  const W = monde();
  construire(W, donnees());   // comme à l'écran : la vue est dessinée avant le premier toucher
  const cell = { id: 'case' }, chip = { id: 'chip' };
  const ev = cible => ({ currentTarget: cell, target: { closest: () => cible } });
  vm.runInContext('mjCase', W.ctx)(ev(cell), 'VIS', '2026-11-24', 'Bloc viscéral', 'am');
  V('toucher une case : le tiroir des disponibles s\'ouvre sur cette case', JSON.stringify(W.appels.pop()) === JSON.stringify(['openSidePanel', 'VIS', '2026-11-24', 'Bloc viscéral', 'am']));
  vm.runInContext('mjCase', W.ctx)(ev(chip), 'VIS', '2026-11-24', 'Bloc viscéral', 'am');
  V('toucher une initiale déjà placée : rien d\'autre que son propre menu', W.appels.length === 0, W.appels);
  vm.runInContext('mjArmer', W.ctx)('X1', 'XA');
  V('toucher un nom « à placer » : il est retenu, le tiroir se ferme, l\'écran se redessine',
    W.ctx._mjArme.id === 'X1' && W.appels.map(a => a[0]).join() === 'closeSidePanel,renderWeek', W.appels);
  W.appels.length = 0;
  vm.runInContext('mjCase', W.ctx)(ev(cell), 'REA', '2026-11-24', 'Réanimation', 'pm');
  V('puis toucher une case : il y est placé directement (placeMAR, même chemin que le panneau)',
    JSON.stringify(W.appels) === JSON.stringify([['placeMAR', 'X1', 'XA']]) && JSON.stringify(W.ctx._sideCtx) === JSON.stringify({ sector: 'REA', date: '2026-11-24', sectorLabel: 'Réanimation', slotKey: 'pm', lib: false }), { a: W.appels, c: W.ctx._sideCtx });
  V('il reste retenu pour l\'autre demi-journée', W.ctx._mjArme && W.ctx._mjArme.id === 'X1');
  const h = construire(W, donnees());
  V('pendant ce temps, le bandeau dit qui placer et les cases sont signalées', h.includes('Touchez les cases où placer <b>XA</b>') && compte(h, /class="mj-c arme"/g) === 4);
  W.appels.length = 0;
  vm.runInContext('mjArmer', W.ctx)(null);
  V('« Terminé » : plus personne de retenu, le toucher rouvre le tiroir', W.ctx._mjArme === null
    && (vm.runInContext('mjCase', W.ctx)(ev(cell), 'VIS', '2026-11-24', 'Bloc viscéral', 'am'), W.appels.some(a => a[0] === 'openSidePanel')));
  vm.runInContext('mjJour', W.ctx)(3);
  V('changer de jour oublie le nom retenu', W.ctx._mjDow === 3 && W.ctx._mjArme === null);
  // Contre-épreuve : sans le test de la cible, toucher une initiale ouvrirait AUSSI le tiroir.
  const W3 = monde(); vm.runInContext(fonction('mjCase').replace("if (cible && cible !== ev.currentTarget) return;", ''), W3.ctx);
  vm.runInContext('mjCase', W3.ctx)(ev(chip), 'VIS', '2026-11-24', 'Bloc viscéral', 'am');
  V('contre-épreuve : sans le test de la cible, l\'initiale ouvrirait aussi le tiroir', W3.appels.length === 1);
}

console.log('\n═══ 6. Bascule Jour / Semaine ═══');
{
  const W = monde();
  vm.runInContext('mjVue("semaine")', W.ctx);
  V('« Semaine » : la grille revient, le choix est retenu', !W.classes.has('mj-jour') && W.stock.mjVue === 'semaine');
  vm.runInContext('mjVue("jour")', W.ctx);
  V('« Jour » : la vue Jour revient', W.classes.has('mj-jour') && W.stock.mjVue === 'jour');
  V('au chargement : vue Jour par défaut, sinon le dernier choix', /let v = 'jour'; try \{ v = localStorage\.getItem\('mjVue'\) \|\| 'jour'; \} catch \(e\) \{\}/.test(adm));
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
