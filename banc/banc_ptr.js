/* ═══ BANC — RAFRAÎCHIR EN TIRANT LA PAGE (05/08/2026) ═══
   (18/08/2026) Le scénario lisait ../live_index.html et ../live_dashboard.html,
   instantanés locaux d'une session de mise au point, absents du dépôt : il ne
   pouvait donc PAS tourner, et n'avait jamais rejoint lancer.sh. Rebranché sur
   les pages réelles et ajouté au lanceur (banc_docs §13 garde désormais la porte).
   Constat du terrain : en mode application (écran d'accueil), iOS ne fournit
   AUCUN rafraîchissement par glissement — le geste bougeait l'écran sans rien
   recharger, et le guide MAR l'annonçait pourtant. On éprouve ici le geste
   qu'on a écrit nous-mêmes : il doit se déclencher au bon moment, et JAMAIS
   pendant un défilement normal. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,160) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

async function page(fichier) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(fichier, 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    url: 'https://planningmedic.github.io/',
    beforeParse(w) {
      w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = () => {};
      w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    },
  });
  await dodo(500);
  return { w: dom.window, erreurs };
}

function toucher(w, type, y) {
  const e = new w.Event(type, { bubbles: true });
  const pt = [{ clientY: y }];
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : pt });
  Object.defineProperty(e, 'changedTouches', { value: pt });
  w.document.dispatchEvent(e);
}

(async () => {
  for (const [nom, fichier] of [['index.html', '../index.html'], ['dashboard.html', '../dashboard.html']]) {
    console.log(`\n═══ ${nom} ═══`);
    const { w, erreurs } = await page(fichier);
    V('la page se charge sans erreur', erreurs.length === 0, erreurs.slice(0,2));
    V('la fonction de rechargement est exposée', typeof w.__rafraichirDonnees === 'function');
    const ind = w.document.getElementById('ptrInd');
    V('l\'indicateur circulaire est présent', !!ind);
    V('… et caché au repos', ind && /-46px/.test(ind.style.transform), ind && ind.style.transform);

    let appels = 0;
    w.__rafraichirDonnees = async () => { appels++; };

    // (a) glissement franc, page en haut → rafraîchit
    Object.defineProperty(w, 'scrollY', { value: 0, configurable: true });
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 160); toucher(w, 'touchend', 200);
    await dodo(60);
    V('un glissement franc déclenche le rafraîchissement', appels === 1, appels);
    await dodo(420);

    // (b) glissement trop court → ne déclenche pas
    appels = 0;
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 120); toucher(w, 'touchend', 130);
    await dodo(60);
    V('un glissement trop court ne déclenche rien', appels === 0, appels);

    // (c) page déjà défilée → ne déclenche pas (défilement normal)
    Object.defineProperty(w, 'scrollY', { value: 400, configurable: true });
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 200); toucher(w, 'touchend', 260);
    await dodo(60);
    V('page défilée : le geste est ignoré', appels === 0, appels);

    // (d) glissement vers le HAUT → ne déclenche pas
    Object.defineProperty(w, 'scrollY', { value: 0, configurable: true });
    toucher(w, 'touchstart', 300); toucher(w, 'touchmove', 200); toucher(w, 'touchend', 150);
    await dodo(60);
    V('un glissement vers le haut est ignoré', appels === 0, appels);

    // (e) deux glissements rapprochés → un seul rafraîchissement en cours
    appels = 0;
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 170); toucher(w, 'touchend', 210);
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 170); toucher(w, 'touchend', 210);
    await dodo(60);
    V('deux gestes coup sur coup : un seul rechargement', appels === 1, appels);
    await dodo(420);

    // (f) le geste reste possible après coup
    appels = 0;
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 170); toucher(w, 'touchend', 210);
    await dodo(60);
    V('une fois terminé, le geste refonctionne', appels === 1, appels);
    await dodo(420);

    // (g) un échec de rechargement ne bloque pas le geste suivant
    w.__rafraichirDonnees = async () => { throw new Error('réseau'); };
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 170); toucher(w, 'touchend', 210);
    await dodo(500);
    let repris = 0;
    w.__rafraichirDonnees = async () => { repris++; };
    toucher(w, 'touchstart', 100); toucher(w, 'touchmove', 170); toucher(w, 'touchend', 210);
    await dodo(60);
    V('après un échec, le geste fonctionne encore', repris === 1, repris);
  }

  console.log('\n═══ Le journal de connexion : DEUX endroits, pas un de plus ═══');
  {
    /* (23/08/2026) Décision d'Arthur : la traçabilité ne se fait qu'à
       l'ouverture du portail et à la connexion du comité. Ailleurs, c'est la
       même session — l'envoi ne faisait que réveiller Apps Script pour rien. */
    for (const [nom, fichier] of [['dashboard.html', '../dashboard.html'], ['admin.html', '../admin.html']]) {
      const src = fs.readFileSync(fichier, 'utf8');
      V(nom + ' : le journal part à fond perdu (sendBeacon)', /sendBeacon\(API_URL/.test(src));
      V(nom + ' : un repli existe si l\'envoi direct échoue', /if \(!_envoye\)|catch/.test(src));
    }
    for (const [nom, fichier] of [['index.html', '../index.html'], ['indispos.html', '../indispos.html'],
                                  ['staff.html', '../staff.html'], ['absences.html', '../absences.html']]) {
      const src = fs.readFileSync(fichier, 'utf8');
      const journaux = (src.match(/apiCall\('login'[^\n]*catch|apiPost\(\{ ?action ?: ?'login' ?\}\)\.catch|apiCall\(\{action:'login'[^\n]*\)\.catch|sendBeacon\(API_URL/g) || []);
      V(nom + ' : plus aucun journal de connexion en tâche de fond', journaux.length === 0, journaux);
      /* absences.html ne se connecte PAS par 'login' : depuis la fusion du
         04/08, getConsultAbsences authentifie ET livre les données en un seul
         aller-retour. L'authentification doit rester — pas sa forme. */
      V(nom + ' : l\'authentification réelle, elle, subsiste',
        /'login'/.test(src) || /getConsultAbsences/.test(src));
    }
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
