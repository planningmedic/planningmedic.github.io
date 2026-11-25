/* ═══ BANC — L'ANNONCE D'UNE VERSION MAJEURE (25/11/2026, v2.0) ═══════════
   partage/annonce_version.js : à la première ouverture du portail après le
   passage à v2.0, une carte plein écran (la baie de nuit, un feu d'artifice,
   « v2.0 », trois nouveautés, un bouton). Une fois par appareil.

   CE QUI EST PROUVÉ
   1. Le module seul : montrée en v2.0, une seule fois (même appareil, même
      page rechargée) ; jamais en v1.x ; ni en v2.0.1 ni en v2.1 après la
      v2.0 ; de nouveau en v3.0 ; fermée par le bouton, par Échap, par un
      toucher hors de la carte ; aucun appel réseau, aucun texte venu
      d'ailleurs ; sans le dessin de la baie, la carte s'ouvre quand même ;
      un stockage local qui refuse ne casse rien.
   2. La VRAIE page d'accueil : chargée telle quelle, elle charge les deux
      fichiers, et l'ouverture du portail (showPortal) montre la carte une
      fois, même si showPortal est rappelé (ouverture optimiste puis
      revalidation). Sans le fichier : l'accueil s'ouvre comme avant.
   3. La version publiée est bien une v2. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const BAIE = lire('partage/attente_baie.js');
const ANNONCE = lire('partage/annonce_version.js');

/* Un « appareil » : une page neuve qui partage le stockage local des précédentes. */
function appareil(version, stock, sansBaie) {
  const dom = new JSDOM('<!DOCTYPE html><body><p id="acc">accueil</p></body>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://planningmedic.github.io/' });
  const w = dom.window;
  if (stock) Object.keys(stock).forEach(k => w.localStorage.setItem(k, stock[k]));
  w.SITE_VERSION = version;
  if (!sansBaie) w.eval(BAIE);
  w.eval(ANNONCE);
  return w;
}
const stockDe = w => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
const carte = w => w.document.querySelector('.av-fond');

(async () => {
  console.log('\n═══ 1. Le module seul ═══');
  {
    let w = appareil('v1.110.0');
    V('le module s\'expose (AnnonceVersion.verifier)', typeof (w.AnnonceVersion && w.AnnonceVersion.verifier) === 'function');
    V('v1.x : aucune carte', w.AnnonceVersion.verifier() === false && !carte(w));
    V('v1.x : rien n\'est retenu (la v2 sera bien annoncée)', w.localStorage.getItem(w.AnnonceVersion.CLE) === null);

    w = appareil('v2.0', stockDe(w));
    V('v2.0 : la carte s\'ouvre', w.AnnonceVersion.verifier() === true && !!carte(w));
    const c = carte(w), txt = c.textContent;
    V('elle annonce « Planning-Med passe en version 2.0 »', /Planning-Med passe en version 2\.0/.test(txt));
    V('le grand numéro « v2.0 »', c.querySelector('.av-num') && c.querySelector('.av-num').textContent === 'v2.0');
    V('trois nouveautés, dont la bourse aux gardes', c.querySelectorAll('.av-liste li').length === 3 && /Bourse aux gardes/.test(txt) && /arrivée de la bourse/.test(txt));
    V('le dessin de la baie est dans la carte', !!c.querySelector('.av-scene .att-baie svg'));
    V('trois feux d\'artifice', c.querySelectorAll('.av-feu').length === 3);
    V('c\'est une boîte de dialogue nommée', c.getAttribute('role') === 'dialog' && /version 2\.0/.test(c.getAttribute('aria-label')));
    V('le 1er chiffre est retenu sur l\'appareil', w.localStorage.getItem(w.AnnonceVersion.CLE) === '2');
    V('rappeler verifier() dans la même page ne rouvre rien', w.AnnonceVersion.verifier() === false && w.document.querySelectorAll('.av-fond').length === 1);
    const html = c.outerHTML + w.document.getElementById('annonce-version-css').textContent;
    V('aucun appel réseau : ni lien, ni image, ni police externe', !/https?:|href=|<image|url\(/i.test(html));
    V('mouvement réduit respecté (prefers-reduced-motion)', /prefers-reduced-motion:reduce/.test(html));
    c.querySelector('.av-btn').click();
    await dodo(600);
    V('« Découvrir » ferme la carte', !carte(w));
    V('l\'accueil derrière est intact', w.document.getElementById('acc').textContent === 'accueil');

    const s2 = stockDe(w);
    w = appareil('v2.0', s2);
    V('page rechargée, même appareil : plus de carte', w.AnnonceVersion.verifier() === false && !carte(w));
    w = appareil('v2.0.1', s2);
    V('v2.0.1 (petit correctif) : pas de carte', w.AnnonceVersion.verifier() === false && !carte(w));
    w = appareil('v2.1', s2);
    V('v2.1 (fonctionnalité) : pas de carte', w.AnnonceVersion.verifier() === false && !carte(w));
    w = appareil('v3.0', s2);
    V('v3.0 : la carte revient, avec le bon numéro', w.AnnonceVersion.verifier() === true && /version 3\.0/.test(carte(w).textContent));

    w = appareil('v2.0');
    V('nouvel appareil en v2.0 : la carte s\'ouvre', w.AnnonceVersion.verifier() === true);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    await dodo(600);
    V('Échap ferme la carte', !carte(w));

    w = appareil('v2.0');
    w.AnnonceVersion.verifier();
    carte(w).querySelector('.av-carte').click();
    await dodo(600);
    V('toucher DANS la carte ne la ferme pas', !!carte(w));
    carte(w).click();
    await dodo(600);
    V('toucher hors de la carte la ferme', !carte(w));

    w = appareil('v2.0', null, true);
    let err = null; try { w.AnnonceVersion.verifier(); } catch (e) { err = e; }
    V('sans le dessin de la baie : la carte s\'ouvre quand même, sans erreur', !err && !!carte(w) && !carte(w).querySelector('.att-baie'));

    w = appareil('v2.0');
    Object.defineProperty(w, 'localStorage', { get() { throw new Error('stockage refusé'); } });
    err = null; let r; try { r = w.AnnonceVersion.verifier(); } catch (e) { err = e; }
    V('stockage local refusé : aucune erreur', !err, err && err.message);

    V('le dessin de la baie s\'exporte seul (AttenteBaie.dessin)', /^<svg/.test(appareil('v1.0').AttenteBaie.dessin()));
  }

  console.log('\n═══ 2. La vraie page d\'accueil ═══');
  const SRC = lire('index.html');
  V('index.html charge le dessin de la baie', /<script src="partage\/attente_baie\.js"><\/script>/.test(SRC));
  V('index.html charge l\'annonce de version', /<script src="partage\/annonce_version\.js"><\/script>/.test(SRC));
  function accueil(avecModule) {
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
    const dom = new JSDOM(SRC, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: 'https://planningmedic.github.io/index.html',
      beforeParse(win) {
        win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        win.eval(lire('version.js'));
        win.eval(lire('partage/session.js'));
        win.eval(lire('partage/portail.js'));
        win.eval(lire('partage/rendu_equite.js'));
        if (avecModule) { win.eval(BAIE); win.eval(ANNONCE); }
      } });
    const w = dom.window;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
    return { w, erreurs };
  }
  {
    const { w, erreurs } = accueil(true);
    await dodo(300);
    V('aucune carte avant l\'ouverture du portail (écran du code)', !carte(w));
    w.eval("MY_ID='ALPHA'; MY_ROLE='mar'; MY_TUILES=[]; showPortal();");
    V('ouverture du portail : la carte s\'ouvre', !!carte(w));
    w.eval('showPortal();');
    V('showPortal rappelé (revalidation) : toujours une seule carte', w.document.querySelectorAll('.av-fond').length === 1);
    V('le portail est bien ouvert derrière', w.document.getElementById('portal').style.display === 'block');
    V('aucune erreur de page', !erreurs.some(e => /AnnonceVersion|annonce|av-/.test(e)), erreurs);
  }
  {
    const { w } = accueil(false);
    await dodo(300);
    let err = null; try { w.eval("MY_ID='ALPHA'; MY_ROLE='mar'; MY_TUILES=[]; showPortal();"); } catch (e) { err = e; }
    V('sans le fichier : l\'accueil s\'ouvre comme avant, sans carte', !err && !carte(w) && w.document.getElementById('portal').style.display === 'block');
  }

  console.log('\n═══ 3. La version publiée ═══');
  const m = /window\.SITE_VERSION = '(v[\d.]+)'/.exec(lire('version.js'));
  V('le site est en v2 (sinon la carte ne s\'ouvrirait chez personne)', m && /^v2\./.test(m[1]), m && m[1]);

  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
