/* ═══ BANC — L'HABILLAGE DE NOËL DE L'ACCUEIL (26/11/2026, v2.1.0) ═══════════
   partage/noel.js : du 1er décembre au 6 janvier, neige qui tombe sur
   l'accueil, chapeau de Noël et neige sur le logo, congère sur la carte
   « Prochaine garde ». Le reste de l'année : rien.

   CE QUI EST PROUVÉ
   1. Les dates : actif du 01/12 au 06/01 inclus, jamais le 30/11 ni le 07/01.
   2. Le module seul : hors période, aucune trace (ni classe, ni style, ni
      décor) ; en période, les trois décors et la neige, posés une seule fois
      même si on relance ; tout est inerte au toucher et caché aux lecteurs
      d'écran, sans texte ; aucun appel réseau, aucun stockage ; une page
      sans en-tête ni carte ne casse rien.
   3. La VRAIE page d'accueil : elle charge le fichier ; le 1er décembre,
      les décors sont là ; la neige ne tombe pas sur l'écran du code, tombe
      sur l'accueil, s'efface quand on ouvre une autre rubrique ; immobile
      si le téléphone demande moins d'animations ; le 26 novembre, rien. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const NOEL = lire('partage/noel.js');

/* Fige « aujourd'hui » dans une fenêtre jsdom (new Date() sans argument). */
function figerDate(win, iso) {
  const Vrai = win.Date, t = new Vrai(iso + 'T10:00:00').getTime();
  function D(...a) { return a.length ? new Vrai(...a) : new Vrai(t); }
  D.prototype = Vrai.prototype; D.now = () => t; D.UTC = Vrai.UTC; D.parse = Vrai.parse;
  win.Date = D;
}
/* Faux pinceau : compte les flocons dessinés et les effacements. */
function fauxPinceau(win) {
  const cpt = { arc: 0, efface: 0, der: [] };
  win.HTMLCanvasElement.prototype.getContext = function () {
    return { setTransform() {}, clearRect() { cpt.efface++; cpt.der = []; }, beginPath() {}, arc(x, y) { cpt.arc++; cpt.der.push(x.toFixed(2) + ',' + y.toFixed(2)); }, fill() {}, fillStyle: '' };
  };
  return cpt;
}

(async () => {
  console.log('\n═══ 1. Les dates ═══');
  {
    const w = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' }).window;
    figerDate(w, '2026-06-15'); w.eval(NOEL);
    const a = s => w.Noel.actif(new w.Date(s + 'T10:00:00'));
    V('30 novembre : non', a('2026-11-30') === false);
    V('1er décembre : oui', a('2026-12-01') === true);
    V('25 et 31 décembre : oui', a('2026-12-25') && a('2026-12-31'));
    V('1er et 6 janvier : oui', a('2027-01-01') && a('2027-01-06'));
    V('7 janvier : non', a('2027-01-07') === false);
    V('en juin : non', a('2027-06-15') === false);
  }

  console.log('\n═══ 2. Le module seul ═══');
  const PAGE = '<!DOCTYPE html><html><head></head><body><div id="portal" style="display:block"><div class="header"><div class="header-brand">'
    + '<div class="header-flag"><img alt=""></div><div>Planning-Med</div></div></div><div id="tilesView">'
    + '<div id="myGardesHero" class="mg-hero"><div class="mg-hero-main">Samedi</div></div></div></div></body></html>';
  function page(iso, html) {
    const dom = new JSDOM(html || PAGE, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://planningmedic.github.io/' });
    const w = dom.window, reseau = [];
    figerDate(w, iso); const cpt = fauxPinceau(w);
    w.fetch = (...a) => { reseau.push(a); return Promise.resolve({}); };
    w.eval(NOEL);
    return { w, cpt, reseau };
  }
  {
    const { w } = page('2026-11-26');
    await dodo(50);
    const d = w.document;
    V('hors période : pas de classe noel', !d.documentElement.classList.contains('noel'));
    V('hors période : ni style, ni décor, ni neige',
      !d.getElementById('noel-css') && !d.querySelector('.noel-chapeau,.noel-neige-logo,.noel-congere,.noel-flocons'));
    V('hors période : demarrer() répond non', w.Noel.demarrer() === false);
  }
  {
    const { w, cpt, reseau } = page('2026-12-01');
    await dodo(50);   // le module attend que la page soit prête (DOMContentLoaded)
    const d = w.document;
    V('en période : classe noel sur la page', d.documentElement.classList.contains('noel'));
    V('le style est posé une fois', d.querySelectorAll('#noel-css').length === 1);
    V('neige sur le logo (dans le cadre du logo)', !!d.querySelector('.header-flag > .noel-neige-logo'));
    V('chapeau juste après le logo', d.querySelector('.header-flag').nextElementSibling.classList.contains('noel-chapeau'));
    V('congère en tête de la carte Prochaine garde', d.getElementById('myGardesHero').firstElementChild.classList.contains('noel-congere'));
    V('une toile de neige', d.querySelectorAll('canvas.noel-flocons').length === 1);
    w.Noel.demarrer(); w.Noel.demarrer(); w.Noel.poser();
    V('relancé 3 fois : toujours un seul exemplaire de chaque décor',
      ['#noel-css', '.noel-chapeau', '.noel-neige-logo', '.noel-congere', '.noel-flocons'].every(s => d.querySelectorAll(s).length === 1));
    V('le texte de la carte est intact', d.querySelector('.mg-hero-main').textContent === 'Samedi');
    const decors = [...d.querySelectorAll('.noel-chapeau,.noel-neige-logo,.noel-congere,.noel-flocons')];
    V('tous les décors sont cachés aux lecteurs d\'écran', decors.every(e => e.getAttribute('aria-hidden') === 'true'));
    V('aucun texte dans les décors', decors.every(e => e.textContent.trim() === ''));
    const css = d.getElementById('noel-css').textContent;
    V('tous les décors sont inertes au toucher', ['.noel-neige-logo', '.noel-chapeau', '.noel-congere', '.noel-flocons']
      .every(s => new RegExp(s.replace('.', '\\.') + '\\{[^}]*pointer-events:none').test(css)));
    const z = +(/\.noel-flocons\{[^}]*z-index:(\d+)/.exec(css) || [])[1];
    V('la neige passe sous l\'en-tête (300) et sous les panneaux (220)', z > 0 && z < 220, z);
    await dodo(150);
    V('la neige tombe (flocons dessinés)', cpt.arc > 0, cpt);
    V('aucun appel réseau', reseau.length === 0);
    V('aucun stockage local', w.localStorage.length === 0);
    V('rien d\'écrit dans le module qui vienne d\'ailleurs (pas d\'innerHTML, pas de fetch)', !/innerHTML|fetch\(|XMLHttpRequest|localStorage/.test(NOEL));
  }
  {
    let err = null;
    try { page('2026-12-24', '<!DOCTYPE html><html><head></head><body><p>vide</p></body></html>'); } catch (e) { err = e; }
    V('page sans en-tête ni carte : aucune erreur', !err, err && err.message);
  }

  console.log('\n═══ 3. La vraie page d\'accueil ═══');
  const SRC = lire('index.html');
  V('index.html charge partage/noel.js', /<script src="partage\/noel\.js"><\/script>/.test(SRC));
  function accueil(iso, calme) {
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
    let cpt;
    const dom = new JSDOM(SRC, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: 'https://planningmedic.github.io/index.html',
      beforeParse(win) {
        figerDate(win, iso); cpt = fauxPinceau(win);
        win.matchMedia = q => ({ matches: !!calme && /reduced-motion/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        win.eval(lire('version.js'));
        win.eval(lire('partage/session.js'));
        win.eval(lire('partage/portail.js'));
        win.eval(lire('partage/rendu_equite.js'));
        win.eval(lire('partage/attente_baie.js'));
        win.eval(lire('partage/annonce_version.js'));
        win.eval(NOEL);
      } });
    const w = dom.window;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
    return { w, erreurs, cpt: () => cpt };
  }
  {
    const { w, erreurs, cpt } = accueil('2026-12-01');
    await dodo(300);
    const d = w.document;
    V('1er décembre : chapeau et neige sur le logo de l\'en-tête', !!d.querySelector('.header .noel-chapeau') && !!d.querySelector('.header-flag .noel-neige-logo'));
    V('congère sur la carte Prochaine garde', !!d.querySelector('#myGardesHero > .noel-congere'));
    const avant = cpt().arc;
    await dodo(150);
    V('écran du code : aucune neige ne tombe', cpt().arc === avant, cpt());
    w.eval("MY_ID='ALPHA'; MY_ROLE='mar'; MY_TUILES=[]; showPortal();");
    const fond = d.querySelector('.av-fond'); if (fond) fond.remove();   // l'annonce de version, sans rapport ici
    const a1 = cpt().arc; await dodo(150);
    V('accueil ouvert : la neige tombe', cpt().arc > a1, cpt());
    V('la congère est toujours là après l\'ouverture du portail', !!d.querySelector('#myGardesHero > .noel-congere'));
    d.getElementById('tilesView').style.display = 'none';
    await dodo(80); const a2 = cpt().arc; await dodo(150);
    V('autre rubrique ouverte : plus aucun flocon dessiné', cpt().arc === a2, cpt());
    V('aucune erreur de page liée à Noël', !erreurs.some(e => /noel|Noel/.test(e)), erreurs);
  }
  {
    const { w, cpt } = accueil('2026-12-10', true);
    await dodo(200);
    w.eval("MY_ID='ALPHA'; MY_ROLE='mar'; MY_TUILES=[]; showPortal();");
    await dodo(100); const p1 = cpt().der.join(' '); await dodo(150); const p2 = cpt().der.join(' ');
    V('« réduire les animations » : décors posés, flocons visibles mais immobiles',
      !!w.document.querySelector('.noel-chapeau') && p1.length > 0 && p1 === p2, [p1.slice(0, 60), p2.slice(0, 60)]);
  }
  {
    const { w } = accueil('2026-11-26');
    await dodo(200);
    w.eval("MY_ID='ALPHA'; MY_ROLE='mar'; MY_TUILES=[]; showPortal();");
    V('26 novembre : accueil sans aucun décor de Noël', !w.document.querySelector('.noel-chapeau,.noel-congere,.noel-flocons') && !w.document.documentElement.classList.contains('noel'));
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
