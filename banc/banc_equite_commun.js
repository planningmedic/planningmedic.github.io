/* ═══ BANC — cartes d'équité communes MAR/comité (partage/rendu_equite.js, 14/09/2026) ═══
   Le VRAI fichier est exécuté dans une fenêtre simulée et appelé comme le font
   les deux pages. On vérifie : le mode « souhaits » (désormais aussi côté
   comité), le MAR connecté en tête et déplié, les couleurs du mode sombre,
   le calcul des cibles — et que les pages n'ont plus de copie locale. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8');
function fenetre(avant) {
  const win = {}; const ctx = { window: win, console, JSON, Math, String, Number, Set, Array, Object };
  win.window = win; vm.createContext(ctx);
  if (avant) vm.runInContext(avant, ctx);
  vm.runInContext(SRC, ctx);
  return win;
}
const AX = [['total','cTot','total'],['sa','cSa','samedis'],['je','cJe','jeudis'],['vd','cVd','vendredis'],['vjf','cVjf','veilles'],['jf','cJf','fériés']];
const equipe = () => [
  { name: 'MAR01', total: 30, cTot: 30, lu: 4, ma: 3, me: 5, je: 6, cJe: 6, sa: 5, cSa: 5, vd: 4, cVd: 4, jf: 1, cJf: 1, vjf: 1, cVjf: 1 },
  { name: 'MAR02', total: 34, cTot: 30, lu: 5, ma: 4, me: 4, je: 8, cJe: 6, sa: 6, cSa: 5, vd: 4, cVd: 4, jf: 1, cJf: 1, vjf: 1, cVjf: 1 },
  { name: 'MAR03', total: 26, cTot: 30, lu: 3, ma: 3, me: 4, je: 4, cJe: 6, sa: 4, cSa: 5, vd: 4, cVd: 4, jf: 1, cJf: 1, vjf: 1, cVjf: 1 },
  { name: 'PRSOUHAIT', total: 43, cTot: 0, lu: 40, ma: 3, me: 0, je: 0, cJe: 0, sa: 0, cSa: 0, vd: 0, cVd: 0, jf: 0, cJf: 0, vjf: 0, cVjf: 0, wish: true },
];
const carte = (html, nom) => { const i = html.indexOf('>' + nom + '<'); const d = html.lastIndexOf('<div class="eqv-card', i); const f = html.indexOf('<div class="eqv-card', i); return html.slice(d, f > 0 ? f : undefined); };

console.log('═══ Le comité voit le mode « souhaits » comme le MAR ═══');
{
  const w = fenetre();
  const html = w.renderEquiteCards(equipe(), { moiNom: null, ouverts: new Set(['PRSOUHAIT', 'MAR02']), sombre: false, neutre: '#EEF1F5', axes: AX });
  const c = carte(html, 'PRSOUHAIT');
  V('le MAR à souhaits garantis porte l\'étiquette « souhaits », pas un verdict', /eqv-verdict[^>]*>souhaits</.test(c), c.match(/eqv-verdict[^<]*</));
  V('…son total dit « 43 souhaits » et non « 43 /— »', /43<span> souhaits<\/span>/.test(c));
  V('…ses barres sont grises (aucune comparaison)', !/background:#CE1126/.test(c) && !/background:#1D4ED8/.test(c) && /background:#94A3B8/.test(c));
  const c2 = carte(html, 'MAR02');
  V('un MAR au-dessus de sa cible garde son verdict rouge (+2 jeu…)', /eqv-verdict" style="color:#CE1126">\+/.test(c2), c2.match(/eqv-verdict[^<]*</));
  V('sans MAR connecté, l\'ordre est alphabétique et aucune carte n\'est marquée « me-card »', html.indexOf('MAR01') < html.indexOf('MAR02') && !/me-card/.test(html));
  V('les cases neutres prennent la couleur demandée par la page (comité : #EEF1F5)', /background:#EEF1F5/.test(html) && !/var\(--surface-2\)/.test(html));
}
console.log('\n═══ Le MAR connecté (planning) ═══');
{
  const w = fenetre();
  const html = w.renderEquiteCards(equipe(), { moiNom: 'MAR03', ouverts: new Set(), sombre: true, neutre: 'var(--surface-2)', axes: AX });
  V('le MAR connecté est en tête, marqué me-card, et déplié sans clic', html.indexOf('MAR03') < html.indexOf('MAR01') && /eqv-card me-card/.test(html) && /MAR03[\s\S]*?▲/.test(carte(html, 'MAR03')));
  V('mode sombre : les couleurs des barres sont celles du sombre', /#7BAAF7|#F4586B|#5BD08B/.test(carte(html, 'MAR03')) && !/background:#15803D"/.test(carte(html, 'MAR03')));
  V('les cases neutres utilisent var(--surface-2)', /var\(--surface-2\)/.test(html));
}
console.log('\n═══ Cibles et verdict ═══');
{
  const w = fenetre();
  const T = w.ciblesEquite(equipe().filter(x => !x.wish), AX);
  V('ciblesEquite ramène les cibles au réel : la somme des cibles « total » vaut la somme des réels (90)', T.MAR01.cTot + T.MAR02.cTot + T.MAR03.cTot === 90, T);
  const v = w.eqVerdict(equipe()[1], T.MAR02, AX);
  V('eqVerdict désigne le pire axe de MAR02 en rouge', v.c === '#CE1126' && /^\+\d/.test(v.t), v);
  const w2 = fenetre("window.renderEquiteCards = function(){ return 'LOCALE'; };");
  V('une copie locale encore présente garde la main', w2.renderEquiteCards() === 'LOCALE');
}
console.log('\n═══ Les deux pages ont rejoint la version commune ═══');
for (const page of ['admin.html', 'planning.html']) {
  const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  V(page + ' : charge rendu_equite.js après le socle, plus de copie de renderEquiteCards/ciblesEquite/eqVerdict',
    src.indexOf('partage/rendu_equite.js') > src.indexOf('partage/portail.js') && !/\nfunction (renderEquiteCards|ciblesEquite|eqVerdict)\b/.test(src));
  V(page + ' : chaque appel passe ses options (ouverts, sombre, neutre, axes)', (src.match(/renderEquiteCards\(/g) || []).length === (src.match(/renderEquiteCards\([^;]*?ouverts:/g) || []).length);
}
console.log('\n═══ Le comité et le MAR construisent la MÊME liste (production, 14/09 19h) ═══');
/* Premier écran du comité avec les cartes communes : un MAR à zéro garde y
   figurait (le portail MAR les filtre), et un temps partiel à jours fixes
   portait l'étiquette « souhaits » (le portail ne la donne qu'aux souhaits
   garantis). Deux lecteurs d'une même donnée qui ne construisent pas la même
   liste : le défaut de toujours, corrigé à la source. */
{
  const A = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  const P = fs.readFileSync(path.join(__dirname, '..', 'planning.html'), 'utf8');
  V('comité : un MAR sans aucune garde ne reçoit pas de carte (filtre total>0, comme le portail)', /const list = stats\.filter\(s=>\(\+s\.total\|\|0\)>0\)\.map/.test(A) && /DATA\.equiteInitiale\.filter\(e=>e\.total>0\)/.test(P));
  V('comité : l\'étiquette « souhaits » ne vise que les souhaits garantis, pas le temps partiel à jours fixes', /wish:estSouhaitPlafond\(s\.medecin\)/.test(A) && /return !!\(x&&x\.souhaitPlafond\);/.test(A));
  V('portail : même définition (SOUHAITS_PLAFOND)', /const _souhaitsGarantisId = id => SOUHAITS_PLAFOND\.indexOf\(id\) > -1;/.test(P));
  V('le certificat du comité garde son test propre, inchangé', /const _spec = name => estSouhaitsGarantis\(name\);/.test(A) && /function estSouhaitsGarantis\(name\)\{/.test(A));
}
console.log('\n═══ Rafraîchissement sans reconstruction : la ligne repliée suit (production, 14/09 22h30) ═══');
/* Portail, onglet Équité : première peinture sans cibles, cibles une seconde
   plus tard. Toutes les cartes repliées → morphGrid ne changeait rien (il ne
   suivait que les barres des cartes dépliées) : bandes grises et « — » jusqu'à
   un clic. Le VRAI morphGrid du socle tourne ici dans un navigateur simulé. */
{
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><div id="w"></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.eval(SRC);
  const sansCibles = equipe().map(m => Object.assign({}, m, { cTot: 0, cJe: 0, cSa: 0, cVd: 0, cVjf: 0, cJf: 0 }));
  const opts = { moiNom: null, ouverts: new Set(), sombre: false, neutre: '#EEF1F5', axes: AX };
  w.document.getElementById('w').innerHTML = w.renderEquiteCards(sansCibles, opts);
  const grid = w.document.querySelector('.eqv-grid');
  const avant = grid.querySelectorAll('.eqv-case[style*="#CE1126"], .eqv-case[style*="#15803D"]').length;
  V('première peinture sans cibles : bandes neutres, verdicts « — »', avant === 0 && [...grid.querySelectorAll('.eqv-verdict')].every(v => v.textContent === '—' || v.textContent === 'souhaits'));
  const ok2 = w.morphGrid(grid, w.renderEquiteCards(equipe(), opts));
  const apres = grid.querySelectorAll('.eqv-case[style*="#CE1126"], .eqv-case[style*="#15803D"]').length;
  const verdicts = [...grid.querySelectorAll('.eqv-verdict')].map(v => v.textContent);
  V('les cibles arrivent : le morph réussit ET les bandes se colorent sans clic', ok2 === true && apres > 0, { ok2, apres });
  V('…et les verdicts aussi (+2 jeu, -2 jeu, souhaits)', verdicts.some(t => /^\+\d/.test(t)) && verdicts.some(t => /^-\d/.test(t)) && verdicts.includes('souhaits'), verdicts);
  const ouvert = w.renderEquiteCards(equipe(), Object.assign({}, opts, { ouverts: new Set(['MAR01']) }));
  V('une carte dépliée d\'un côté et repliée de l\'autre → le morph laisse la place au remplacement complet', w.morphGrid(grid, ouvert) === false);
  for (const page of ['admin.html', 'planning.html']) {
    V(page + ' : plus de copie locale de morphGrid', !/\nfunction morphGrid\b/.test(fs.readFileSync(path.join(__dirname, '..', page), 'utf8')));
  }
}
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
