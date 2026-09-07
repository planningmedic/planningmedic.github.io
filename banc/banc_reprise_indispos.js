/* ═══ BANC — LA REPRISE DE SESSION SANS ÉCRAN DE CODE (26/08/2026) ═══════════
   Pourquoi ce scénario existe : en arrivant du portail (tuiles « Mes
   indisponibilités » et « Mes jours de TP »), le MAR déjà connecté voyait
   l'écran « Accès sécurisé » le temps de la revalidation silencieuse. Depuis
   le 26/08, une attente neutre le remplace ; l'écran de code ne revient que si
   la reprise échoue — ou d'un clic sur l'échappatoire « Saisir mon code ».
   On pilote la VRAIE page ; seul le RÉSEAU est simulé (réponses du relais et
   du serveur fabriquées) : la logique de la page, elle, n'est jamais raccourcie. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let ok = 0, ko = 0;
function V(libelle, condition, detail) {
  if (condition) { ok++; console.log('  ✓ ' + libelle); }
  else { ko++; console.log('  ✗ ' + libelle + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); }
}

/* Monte la page avec ou sans session, et un réseau qui répond selon `mode` :
   'succes' → le relais rend l'identité et les indispos ; 'refus' → tout dit non. */
async function ouvrir(mode, avecSession, fichier) {
  const contenu = fs.readFileSync(fichier || '../indispos.html', 'utf8');
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', function (e) { erreurs.push(e.message); });
  let loginVuPendant = false, repriseVuePendant = false;
  const dom = new JSDOM(contenu, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/indispos.html', pretendToBeVisual: true,
    beforeParse: function (win) {
      win.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
      win.Element.prototype.scrollIntoView = function () {};
      win.scrollTo = function () {};
      if (avecSession) { try { win.sessionStorage.setItem('pmViewCode', 'CPOSEUR'); } catch (e) {} }
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
      win.__appels = win.__appels || [];
      win.fetch = async function (url, opt) {
        win.__appels.push(String(url).includes('/read') ? 'RELAIS' : 'GAS');
        await new Promise(function (r) { setTimeout(r, 60); });   // latence : la fenêtre où l'écran fautif se voyait
        const rep = (mode === 'succes' && String(url).includes('/read'))
          ? { success: true, identite: { id: 'POSEUR', name: 'DR POSEUR', indisposYear: 2027 },
              data: { indispos_2027: { parMar: { POSEUR: {} } } }, annee: 2027 }
          : { success: false, error: 'refus (banc)' };
        return { ok: true, status: 200, json: async function () { return rep; } };
      };
    } });
  const w = dom.window;
  const vis = function (id) { const e = w.document.getElementById(id); return e ? w.getComputedStyle(e).display : 'ABSENT'; };
  const guet = setInterval(function () {
    if (vis('loginScreen') !== 'none') loginVuPendant = true;
    if (vis('repriseScreen') === 'flex') repriseVuePendant = true;
  }, 1);
  await new Promise(function (r) { setTimeout(r, 700); });        // la reprise (60 ms de réseau) est finie depuis longtemps
  clearInterval(guet);
  return { w, vis, erreurs, loginVuPendant, repriseVuePendant };
}

(async function () {
  console.log('— Arrivée du portail, session valide : jamais d\'écran de code —');
  let r = await ouvrir('succes', true);
  V('l\'écran de code n\'apparaît à AUCUN moment', !r.loginVuPendant, r.loginVuPendant);
  V('l\'attente neutre a été montrée pendant la revalidation', r.repriseVuePendant);
  V('à l\'issue, l\'attente est effacée', r.vis('repriseScreen') === 'none', r.vis('repriseScreen'));
  V('et le calendrier est ouvert', r.vis('app') === 'block', r.vis('app'));
  V('la reprise est passée par la COPIE RAPIDE (défaut TDZ corrigé : avant le 26/08, elle réveillait Apps Script)',
    r.w.__appels.indexOf('RELAIS') >= 0, r.w.__appels);
  V('aucune erreur de page', r.erreurs.length === 0, r.erreurs);

  console.log('— Session présente mais code révoqué : l\'écran de code revient —');
  r = await ouvrir('refus', true);
  V('l\'attente neutre a été montrée d\'abord', r.repriseVuePendant);
  V('puis l\'écran de code est révélé', r.vis('loginScreen') !== 'none', r.vis('loginScreen'));
  V('l\'attente est effacée', r.vis('repriseScreen') === 'none', r.vis('repriseScreen'));
  V('la session révoquée est oubliée', !r.w.sessionStorage.getItem('pmViewCode'));

  console.log('— Pas de session : l\'écran de code, comme toujours —');
  r = await ouvrir('refus', false);
  V('l\'écran de code est visible', r.vis('loginScreen') !== 'none', r.vis('loginScreen'));
  V('l\'attente neutre n\'apparaît jamais', !r.repriseVuePendant);

  console.log('— L\'échappatoire : « Saisir mon code » pendant l\'attente —');
  const contenu = fs.readFileSync('../indispos.html', 'utf8');
  const dom2 = new JSDOM(contenu, { runScripts: 'dangerously',
    url: 'https://planningmedic.github.io/indispos.html', pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse: function (win) {
      win.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
      win.scrollTo = function () {};
      try { win.sessionStorage.setItem('pmViewCode', 'CPOSEUR'); } catch (e) {}
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
      win.fetch = async function () { await new Promise(function (r2) { setTimeout(r2, 5000); }); // réseau interminable
        return { ok: true, json: async function () { return { success: false }; } }; };
    } });
  await new Promise(function (r2) { setTimeout(r2, 100); });
  const w2 = dom2.window;
  w2.document.querySelector('.reprise-lien').click();
  V('le clic rend l\'écran de code immédiatement', w2.getComputedStyle(w2.document.getElementById('loginScreen')).display !== 'none');
  V('et efface l\'attente', w2.getComputedStyle(w2.document.getElementById('repriseScreen')).display === 'none');

  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  process.exit(ko ? 1 : 0);
})();
