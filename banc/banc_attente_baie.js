/* ═══ BANC — LE DESSIN D'ATTENTE DES ASSISTANTS (17/11/2026) ═══════════════
   partage/attente_baie.js : la baie et le nouvel hôpital, en cycle jour/nuit,
   pendant les attentes longues de W1 (démarrer l'année), W2 (générer les
   gardes) et de la clôture (page Maintenance). Maquette validée par le
   responsable le 17/11/2026.

   CE QUI EST PROUVÉ
   1. Le module seul : rien avant 1 s, le dessin après ; une attente courte
      ne montre rien ; un conteneur réécrit l'emporte sans erreur ; aucun
      appel réseau ; l'hélicoptère vole nez en avant.
   2. La VRAIE page admin, W2 : le dessin au-dessus de la liste des étapes,
      la liste intacte, le dessin retiré à la fin — succès comme échec.
   3. La vraie page admin, W1 : le dessin au-dessus de la liste, retiré à la fin.
   4. Sans le fichier (pas chargé, réseau capricieux) : W2 tourne pareil.
   5. Maintenance : le fichier est chargé et la clôture pose le dessin. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const MODULE = lire('partage/attente_baie.js');

(async () => {
  console.log('\n═══ 1. Le module seul ═══');
  {
    const dom = new JSDOM('<!DOCTYPE html><div id="c"><p id="liste">étapes</p></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    w.eval(MODULE);
    V('le module s\'expose (AttenteBaie.poser)', typeof (w.AttenteBaie && w.AttenteBaie.poser) === 'function');
    V('le seuil est d\'1 s', w.AttenteBaie.SEUIL_MS === 1000, w.AttenteBaie.SEUIL_MS);
    const c = d.getElementById('c');
    const a = w.AttenteBaie.poser(c);
    const el = c.querySelector('.att-baie');
    V('le dessin est posé en tête du conteneur, avant la liste', el && c.firstElementChild === el && el.nextElementSibling.id === 'liste');
    V('la liste des étapes est intacte', d.getElementById('liste').textContent === 'étapes');
    V('il n\'est pas montré tout de suite', !el.classList.contains('vu'));
    await dodo(500);
    V('toujours pas à 0,5 s (pas de flash sur une attente courte)', !el.classList.contains('vu'));
    await dodo(700);
    V('montré après 1 s', el.classList.contains('vu'));
    a.retirer();
    await dodo(600);
    V('retirer() l\'enlève', !c.querySelector('.att-baie'));

    const b = w.AttenteBaie.poser(c);
    await dodo(300); b.retirer(); await dodo(1200);
    V('attente courte (0,3 s) : jamais montré, et enlevé', !c.querySelector('.att-baie'));

    w.AttenteBaie.poser(c);
    c.innerHTML = '<p>résultat</p>';
    let err = null;
    try { await dodo(1200); } catch (e) { err = e; }
    V('conteneur réécrit : le dessin part avec, sans erreur', !err && !c.querySelector('.att-baie') && c.textContent === 'résultat');

    let jete = null; try { w.AttenteBaie.poser(null).retirer(); } catch (e) { jete = e; }
    V('sans conteneur : rien, et aucune erreur', !jete);

    w.AttenteBaie.poser(c); w.AttenteBaie.poser(c);
    V('la feuille de style n\'est posée qu\'une fois', d.querySelectorAll('#att-baie-css').length === 1);
    const css = d.getElementById('att-baie-css').textContent;
    V('mouvement réduit respecté (prefers-reduced-motion)', /prefers-reduced-motion:reduce/.test(css));
    V('aucune règle hors du dessin (tout préfixé .att-baie ou @keyframes ab…)',
      css.replace(/@keyframes ab\w+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@media[^{]*\{[^{}]*\{[^{}]*\}\}/g, '')
         .split('}').map(s => s.trim()).filter(Boolean).every(r => /^\.att-baie/.test(r)));

    const svg = c.querySelector('.att-baie svg').outerHTML;
    V('aucun appel réseau : ni lien, ni image, ni police externe', !/https?:|href=|<image|url\(/i.test(svg + css));
    V('aucun texte dans le dessin (aucun nom)', !/<text/i.test(svg));
    V('le dessin est muet pour les lecteurs d\'écran', c.querySelector('.att-baie').getAttribute('aria-hidden') === 'true');
    V('les lames de la façade : 10 rangées', (svg.match(/<path d="M218 /g) || []).length === 10);
    // L'hélicoptère avance vers la droite : la queue part vers la GAUCHE du fuselage (défaut de la maquette du 17/11).
    const he = /<g class="k-he"><rect x="(\d+)"[^>]*>.*?<path d="M(\d+) 4 h(-?\d+)/.exec(svg);
    V('l\'hélicoptère vole nez en avant (queue à gauche du fuselage)', he && +he[3] < 0 && +he[2] === +he[1], he && he.slice(1));
    V('il traverse de gauche à droite', /abHe\{0%\{transform:translate\(-40px[^}]*\}100%\{transform:translate\(420px/.test(css));
  }

  /* ── La vraie page admin ── */
  const SRC = lire('admin.html');
  async function admin(avecModule) {
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(SRC, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: 'https://planningmedic.github.io/admin.html',
      beforeParse(win) {
        win.eval(lire('partage/portail.js')); win.eval(lire('partage/rendu_equite.js'));
        if (avecModule) win.eval(MODULE);
      } });
    await dodo(400);
    dom.window.eval('ADMIN_CODE="CODE99"; YEAR=2026; INDISPOS_YEAR=2027;');
    return { w: dom.window, d: dom.window.document, erreurs };
  }
  // Serveur simulé : chaque appel répond après `ms`, ou en échec pour l'action `rate`.
  function serveur(w, ms, rate) {
    const appels = [];
    w.api = async p => { appels.push(p.action); await dodo(ms); return p.action === rate ? { success: false, error: 'refus simulé' } : { success: true }; };
    return appels;
  }

  console.log('\n═══ 2. W2 « Générer les gardes » — la vraie page ═══');
  {
    const { w, d, erreurs } = await admin(true);
    V('admin.html charge le fichier du dessin', /<script src="partage\/attente_baie\.js"><\/script>/.test(SRC));
    const appels = serveur(w, 1500);
    d.getElementById('wizardGardesOverlay').classList.add('open');
    const fin = w.launchWizardGardes();
    await dodo(300);
    const body = d.getElementById('wizGBody'), el = body.querySelector('.att-baie');
    V('le dessin est posé au-dessus de la liste des étapes', el && el.nextElementSibling && el.nextElementSibling.classList.contains('wiz-progress'));
    V('la liste garde ses 3 étapes', body.querySelectorAll('.wiz-progress-item').length === 3);
    V('pas encore montré à 0,3 s', el && !el.classList.contains('vu'));
    await dodo(1000);
    V('montré à 1,3 s, pendant la génération', el && el.classList.contains('vu'));
    V('l\'étape en cours reste lisible sous le dessin', /⏳/.test(d.getElementById('wizg-p1').textContent));
    await fin; await dodo(700);
    V('les 3 appels sont partis, dans l\'ordre', appels.join(',') === 'generateGardes,publishPlanning,envoyerRecapIndispos', appels);
    V('à la fin, le dessin a disparu', !body.querySelector('.att-baie'));
    V('et l\'écran de réussite est là', /générées/.test(body.textContent));
    V('aucune erreur de page', erreurs.length === 0, erreurs);
  }
  {
    const { w, d, erreurs } = await admin(true);
    serveur(w, 1300, 'generateGardes');
    d.getElementById('wizardGardesOverlay').classList.add('open');
    const fin = w.launchWizardGardes();
    await dodo(1150);
    V('échec de génération : le dessin était montré pendant l\'attente', !!d.querySelector('#wizGBody .att-baie.vu'));
    await fin; await dodo(600);
    V('échec : le dessin est retiré', !d.querySelector('#wizGBody .att-baie'));
    V('échec : l\'erreur reste lisible et « Réessayer » est proposé',
      /refus simulé/.test(d.getElementById('wizg-p1').textContent) && d.getElementById('wizGNextBtn').textContent === 'Réessayer');
    V('aucune erreur de page', erreurs.length === 0, erreurs);
  }
  {
    const { w, d } = await admin(true);
    serveur(w, 150);
    d.getElementById('wizardGardesOverlay').classList.add('open');
    let vu = false; const espion = setInterval(() => { if (d.querySelector('#wizGBody .att-baie.vu')) vu = true; }, 50);
    await w.launchWizardGardes(); await dodo(700); clearInterval(espion);
    V('attente courte (3 × 0,15 s) : le dessin n\'apparaît jamais', !vu);
  }
  {
    const { w, d } = await admin(true);
    serveur(w, 50);
    w.eval('wizGCurrentStep=0');
    d.getElementById('wizardGardesOverlay').classList.add('open');
    // L'ouverture de W2 : le chargement de l'assistant (« ~1 min ») porte aussi le dessin.
    const src = SRC.slice(SRC.indexOf('async function openWizardGardes'), SRC.indexOf('function renderWizGLocked'));
    V('l\'ouverture de W2 pose le dessin sur « Chargement de l\'assistant… (~1 min) »',
      /calcul des conflits \(~1 min\)[^\n]*\n\s*_attente\(document\.getElementById\('wizGBody'\)\)/.test(src));
    const src1 = SRC.slice(SRC.indexOf('async function openWizard()'), SRC.indexOf('async function openWizard()') + 1200);
    V('l\'ouverture de W1 aussi, sur son chargement', /Lecture des périodes de vacances et des groupes[^\n]*\n\s*_attente\(document\.getElementById\('wizBody'\)\)/.test(src1));
  }

  console.log('\n═══ 3. W1 « Démarrer l\'année » — la vraie page ═══');
  {
    const { w, d, erreurs } = await admin(true);
    serveur(w, 700, 'setIndisposYear');
    d.getElementById('wizardOverlay').classList.add('open');
    d.getElementById('wizBody').innerHTML = '<div class="wizard-section-title">Initialisation</div><div class="wiz-progress" id="wizInitProgress">'
      + ['wiz-i1', 'wiz-i2', 'wiz-i3', 'wiz-i4'].map(i => '<div class="wiz-progress-item" id="' + i + '">○ étape</div>').join('') + '</div>';
    w.eval('window._wizIndisposExists=false; wizPeriodes=[];');
    const fin = w.launchWizInit();
    await dodo(1200);
    const el = d.querySelector('#wizBody .att-baie');
    V('le dessin est posé juste au-dessus de la liste', el && el.nextElementSibling && el.nextElementSibling.id === 'wizInitProgress');
    V('le titre de section reste au-dessus du dessin', el && el.previousElementSibling && /Initialisation/.test(el.previousElementSibling.textContent));
    V('montré pendant les enregistrements', el && el.classList.contains('vu'));
    await fin; await dodo(600);
    V('à la fin (ici un échec à la 4e étape), le dessin est retiré', !d.querySelector('#wizBody .att-baie'));
    V('l\'erreur reste lisible et « Réessayer » est proposé', /refus simulé/.test(d.getElementById('wiz-i4').textContent) && /Réessayer/.test(d.getElementById('wizNextBtn').textContent));
    V('aucune erreur de page', erreurs.length === 0, erreurs);
  }

  console.log('\n═══ 4. Sans le fichier du dessin : rien ne change ═══');
  {
    const { w, d, erreurs } = await admin(false);
    V('window.AttenteBaie absent', typeof w.AttenteBaie === 'undefined');
    const appels = serveur(w, 200);
    d.getElementById('wizardGardesOverlay').classList.add('open');
    await w.launchWizardGardes(); await dodo(700);
    V('W2 va au bout : 3 appels, écran de réussite', appels.length === 3 && /générées/.test(d.getElementById('wizGBody').textContent));
    V('aucun dessin, aucune erreur', !d.querySelector('.att-baie') && erreurs.length === 0, erreurs);
  }

  console.log('\n═══ 5. Maintenance — la clôture ═══');
  {
    const M = lire('maintenance.html');
    V('maintenance.html charge le fichier du dessin', /<script src="partage\/attente_baie\.js"><\/script>/.test(M));
    const h = M.slice(M.indexOf("deuxAppuis($('btnClot')"), M.indexOf("deuxAppuis($('btnClot')") + 1500);
    const iPose = h.indexOf('AttenteBaie.poser(out)'), iInfo = h.indexOf('une à plusieurs minutes'), iApi = h.indexOf("action:'cloturerAnnee'");
    V('la clôture pose le dessin après le message d\'attente et avant l\'appel', iInfo > 0 && iPose > iInfo && iApi > iPose, [iInfo, iPose, iApi]);
    V('protégé : sans le fichier, la clôture continue', /try \{ if \(window\.AttenteBaie\) AttenteBaie\.poser\(out\); \} catch \(e\) \{\}/.test(h));
    const rep = M.slice(M.indexOf("$('btnClotRep').addEventListener"), M.indexOf("deuxAppuis($('btnClot')"));
    V('la répétition à blanc (quelques secondes) n\'a pas de dessin', rep.length > 100 && !/AttenteBaie/.test(rep));
  }

  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
