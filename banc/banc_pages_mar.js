/* ═══ BANC — LES PAGES DES MAR (celles de la démo du 4 septembre) ═══
   planning.html, index.html, indispos.html : chargées telles quelles, servies
   par le vrai Worker. Ce que le comité montrera au staff doit s'ouvrir vite et
   sans erreur, avec le rôle MAR (droits réduits). */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,160) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Worker réel + données minimales
  const src = fs.readFileSync('../cloudflare/worker.js','utf8').replace('export default','globalThis.__W =');
  const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(src, wctx);
  const WK = wctx.__W, M = new Map();
  const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
    list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const CODE_MAR = 'MARCODE77';
  M.set('acces', JSON.stringify({ indisposYear: 2027, indisposOuverte: true, users: [
    { h: await sha(CODE_MAR), role: 'mar', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Test' }]}));
  M.set('annees', JSON.stringify({ success:true, active: 2027, annees:[{annee:2027, statut:'ACTIF'}] }));
  M.set('planning_2027', JSON.stringify({ months: [], equiteInitiale: {} }));
  M.set('indispos_2027', JSON.stringify({ parMar: { ALPHA: [], BRAVO: ['2027-02-02'] } }));
  M.set('config_admin', JSON.stringify({ medecins: [] }));
  const env = { KV, PUSH_TOKEN: 'JETON' };

  for (const fichier of ['planning.html', 'index.html', 'indispos.html']) {
    console.log(`\n═══ 28. ${fichier} ═══`);
    let contenu;
    try { contenu = fs.readFileSync('../' + fichier, 'utf8'); }
    catch (e) { console.log('  (absent du banc local — ignoré)'); continue; }
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/' + fichier, pretendToBeVisual:true,
      /* Compléments injectés AVANT l'exécution des scripts : jsdom n'implémente
         pas matchMedia ni scrollIntoView, que les pages utilisent au chargement. */
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        /* jsdom ne va pas chercher les scripts externes : on sert partage/session.js
           comme le fait le vrai site, sinon on ne testerait que le filet de secours. */
        win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
      } });
    const w = dom.window;
    w.Element.prototype.scrollIntoView = function () {};
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    let gas = 0;
    w.fetch = async (url, opt) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        const chemin = u.replace(/^https:\/\/[^/]+/, '');
        return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
      }
      gas++;
      return { ok:true, json: async () => ({ success:false, error:'GAS indisponible dans le banc' }) };
    };
    await dodo(700);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    V('elle expose une lecture par le miroir', typeof w.miroirRead === 'function' || /workers\.dev/.test(contenu));
    // droits : un MAR ne doit jamais obtenir les clés réservées
    const r = await WK.fetch(new Request('https://worker/read', { method:'POST',
      body: JSON.stringify({ code: CODE_MAR, keys: ['config_admin','gardes_2027','vacances_admin','mail_nonlus','planning_2027'] }) }), env);
    const j = await r.json();
    V('le MAR obtient le planning', !!(j.data && j.data.planning_2027));
    V('le MAR n\'obtient AUCUNE clé réservée au comité',
      !j.data.config_admin && !j.data.gardes_2027 && !j.data.vacances_admin && !j.data.mail_nonlus,
      Object.keys(j.data));
    V('les refus sont signalés explicitement', Array.isArray(j.refuses) && j.refuses.length === 4, j.refuses);
  }

  /* Les selecteurs annee/mois quittent le bandeau sur mobile (il y etait trop
     etroit, la pastille du MAR s'y compressait a zero) et reviennent au-dessus
     de 768 px. Regle vitale : ils sont DEPLACES, jamais dupliques. */
  console.log('\n═══ 28b. planning.html · les sélecteurs période changent de place, sans jamais se dupliquer ═══');
  {
    const contenu = fs.readFileSync('../planning.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/planning.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await dodo(400);
    const D = w.document;
    const compte = id => D.querySelectorAll('#' + id).length;
    const parent = id => { const e = D.getElementById(id); return e && e.parentNode ? e.parentNode.id : null; };

    const largeur = px => { Object.defineProperty(w, 'innerWidth', { value: px, configurable: true }); w.checkMobile(); };

    largeur(390);
    V('sur mobile, l\'année passe dans la barre période', parent('yearSelect') === 'mobilePeriod', parent('yearSelect'));
    V('sur mobile, le mois aussi', parent('monthSelect') === 'mobilePeriod', parent('monthSelect'));
    V('un seul #yearSelect existe', compte('yearSelect') === 1, compte('yearSelect'));
    V('un seul #monthSelect existe', compte('monthSelect') === 1, compte('monthSelect'));

    largeur(1200);
    V('sur grand écran, l\'année revient dans le bandeau', parent('yearSelect') === 'headerRight', parent('yearSelect'));
    V('sur grand écran, le mois revient aussi', parent('monthSelect') === 'headerRight', parent('monthSelect'));

    // rotation du telephone : plusieurs allers-retours ne doivent rien casser
    for (let i = 0; i < 3; i++) { largeur(390); largeur(1200); }
    largeur(390);
    V('après 3 rotations, toujours un seul exemplaire de chaque',
      compte('yearSelect') === 1 && compte('monthSelect') === 1,
      [compte('yearSelect'), compte('monthSelect')]);
    V('après 3 rotations, ils sont au bon endroit',
      parent('yearSelect') === 'mobilePeriod' && parent('monthSelect') === 'mobilePeriod',
      [parent('yearSelect'), parent('monthSelect')]);
    V('la valeur choisie survit au déplacement',
      (() => { const e = D.getElementById('yearSelect'); const v = e.value; largeur(1200); largeur(390); return D.getElementById('yearSelect').value === v; })());
    V('aucune erreur JavaScript pendant les déplacements', erreurs.length === 0, erreurs.slice(0,2));
  }

  /* Deux defauts vus en production le 12/08 sur indispos.html : le code
     s'affichait en clair pendant la saisie, et la page redemandait le code
     alors que le MAR etait deja connecte au portail. */
  console.log('\n═══ 28c. indispos.html · code masqué et session partagée avec le portail ═══');
  {
    const contenu = fs.readFileSync('../indispos.html', 'utf8');
    V('le champ de code est de type password (jamais en clair)',
      /id="codeInput"[^>]*type="password"/.test(contenu),
      (contenu.match(/id="codeInput"[^>]*type="[a-z]+"/) || [''])[0]);
    V('la page mémorise le code sous la clé commune du portail',
      /sessionStorage\.setItem\('pmViewCode'/.test(contenu));
    V('elle relit cette clé à l\'ouverture',
      /sessionStorage\.getItem\('pmViewCode'/.test(contenu));
    V('un code refusé est retiré de la session',
      /removeItem\('pmViewCode'\)/.test(contenu));
    V('doLogin accepte un code repris et un mode silencieux',
      /async function doLogin\(codeAuto, silencieux\)/.test(contenu),
      (contenu.match(/async function doLogin\([^)]*\)/) || [''])[0]);

    /* La cle doit etre la MEME que sur les autres pages MAR, sinon la session
       ne se partage pas. staff.html et admin.html sont exclus : ils exigent
       le role admin, leur code n'est pas celui des MAR. */
    for (const p of ['planning.html', 'index.html', 'absences.html', 'crh.html', 'suivi-liberal.html']) {
      const c = fs.readFileSync('../' + p, 'utf8');
      V(`${p} utilise la même clé de session`, /pmViewCode/.test(c));
    }
    const st = fs.readFileSync('../staff.html', 'utf8');
    V('staff.html ne lit PAS la session MAR (réservé au comité)',
      !/pmViewCode/.test(st));
  }

  /* Defaut vu en production le 12/08 : les 5 onglets du bas debordaient a droite
     sur iPhone. La cause de fond n'est pas la police mais l'absence de min-width:0 —
     un element flex:1 refuse de descendre sous la largeur de son contenu. */
  console.log('\n═══ 28d. planning.html · la barre d\'onglets du bas tient dans l\'écran ═══');
  {
    const c = fs.readFileSync('../planning.html', 'utf8');
    const regle = (c.match(/\.mobile-bottom-btn \{[^}]*\}/) || [''])[0];
    V('les onglets peuvent rétrécir (min-width:0)', /min-width:\s*0/.test(regle), regle.slice(0,120));
    V('la police est ramenée à 11 px', /font-size:\s*11px/.test(regle), regle.slice(0,120));
    const barre = (c.match(/\.mobile-bottom-nav \{[^}]*\}/) || [''])[0];
    V('l\'écart entre onglets est réduit à 6 px', /gap:\s*6px/.test(barre), barre.slice(0,160));

    /* Calcul de largeur : 5 onglets, mot le plus long « Médecins ». A 11 px en DM Sans
       le texte fait ~52 pt ; + 16 de padding + 3 de bordure = 71 pt pour le plus large.
       Total avec 4 ecarts de 6 et 2x12 de marge : ~355 pt, sous les 390 pt d'un iPhone. */
    const pad = 8, gap = 6, marge = 12, bord = 3;
    const largeursTexte = { Planning: 45, 'Médecins': 52, 'Équité': 34, Secteurs: 47, 'Année': 34 };
    const total = Object.values(largeursTexte).reduce((a, w) => a + w + 2 * pad + bord, 0)
                  + 4 * gap + 2 * marge;
    V(`la barre tient dans 390 pt (calculé : ${Math.round(total)} pt)`, total <= 390, total);
    V('elle tient même sur un iPhone SE 1re génération (320 pt)', total <= 320 + 40, total);
  }

  /* Defaut vu le 12/08 : ~790 pt de blanc sous les tableaux des onglets Medecins,
     Equite, Secteurs et Annee. #mobileView (hauteur minimale d'un ecran) restait
     affiche sur tous les onglets alors qu'il ne sert qu'a l'onglet Planning. */
  console.log('\n═══ 28e. planning.html · pas de blanc sous les onglets autres que Planning ═══');
  {
    const contenu = fs.readFileSync('../planning.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/planning.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await dodo(400);
    const D = w.document;
    Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
    w.checkMobile();
    const vue = D.getElementById('mobileView');

    /* Le rendu des tableaux echoue faute de donnees chargees ici ; seul l'affichage
       du conteneur nous interesse, et il est fixe AVANT l'appel au rendu. */
    const bascule = v => { try { w.mobileSetView(v); } catch (e) {} };

    bascule('planning');
    V('onglet Planning : le conteneur jour est affiché', vue.style.display === 'flex', vue.style.display);
    for (const onglet of ['medecins', 'equite', 'affect', 'annee']) {
      bascule(onglet);
      V(`onglet ${onglet} : le conteneur jour est masqué (plus de blanc)`,
        vue.style.display === 'none', vue.style.display);
    }
    bascule('planning');
    V('retour sur Planning : il revient', vue.style.display === 'flex', vue.style.display);
    V('un redimensionnement ne le rallume pas sur un autre onglet',
      (() => { bascule('annee'); w.checkMobile(); return vue.style.display === 'none'; })(),
      vue.style.display);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  /* Defaut vu en production le 12/08 : la reprise de session appelait doLogin, qui
     desactive le bouton et ecrit « Connexion... ». Tant que le serveur ne repondait
     pas (jusqu'a 20 s au reveil d'Apps Script), l'ecran de saisie etait FIGE : le MAR
     ne pouvait meme plus taper son code a la main. Regle : la tentative automatique
     est silencieuse et ne touche jamais a l'interface. */
  console.log('\n═══ 28f. indispos.html · la reprise de session ne fige jamais l\'écran ═══');
  {
    const contenu = fs.readFileSync('../indispos.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message.split('\n')[0]));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/indispos.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        try { win.sessionStorage.setItem('pmViewCode', 'ABCD1234'); } catch (e) {}
        /* Le pire cas : un serveur qui ne repond JAMAIS. */
        win.fetch = () => new Promise(() => {});
      } });
    await dodo(600);
    const D = dom.window.document;
    const btn = D.getElementById('loginBtn'), champ = D.getElementById('codeInput');
    V('le bouton reste sur « Accéder → »', /Accéder/.test(btn.textContent), btn.textContent);
    V('le bouton reste CLIQUABLE pendant la tentative', btn.disabled === false, btn.disabled);
    V('le champ de code reste saisissable', champ.disabled === false, champ.disabled);
    V('aucun message d\'erreur n\'est affiché au MAR qui n\'a rien tapé',
      D.getElementById('loginError').style.display !== 'block',
      D.getElementById('loginError').style.display);
    V('la tentative automatique passe bien le drapeau silencieux',
      /doLogin\(saved, true\)/.test(contenu));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  /* Defaut vu en production le 12/08 : on pouvait poser une indispo au-dela de la fin
     de l'annee de planning (a partir du 3 janvier 2028 pour l'annee 2027). Les cases
     etaient grisees mais cliquables, et le SERVEUR ignore ces dates en silence
     (banc T072) : le MAR croyait avoir declare, rien n'etait enregistre. */
  console.log('\n═══ 28g. indispos.html · rien ne se pose hors de l\'année de planning ═══');
  {
    const contenu = fs.readFileSync('../indispos.html', 'utf8');
    const dom = new JSDOM(contenu, { runScripts:'dangerously',
      virtualConsole:new VirtualConsole(), pretendToBeVisual:true,
      url:'https://planningmedic.github.io/indispos.html',
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        win.fetch = () => new Promise(() => {});
      } });
    await dodo(400);
    const w = dom.window;

    /* Les bornes doivent coller a celles du serveur : du premier lundi de janvier Y
       au jour precedant le premier lundi de janvier Y+1. */
    const b = w.bornesAnneePlanning(2027);
    V('année 2027 : début au premier lundi (04/01/2027)', b.debut === '2027-01-04', b.debut);
    V('année 2027 : fin au 02/01/2028 (veille du lundi suivant)', b.fin === '2028-01-02', b.fin);
    const b28 = w.bornesAnneePlanning(2028);
    V('année 2028 : du 03/01/2028 au 07/01/2029', b28.debut === '2028-01-03' && b28.fin === '2029-01-07', b28);

    /* Pose reelle. YEAR et indispos sont des variables de script (let) : invisibles
       depuis l'exterieur, on pilote la page par son propre contexte via eval. */
    w.eval(`YEAR = 2027; indispos = {}; currentTool = 'INDISPO'; isDragging = false;
            renderMonth = function(){}; updateStats = function(){};
            window.__toasts = []; showToast = function(m){ window.__toasts.push(m); };`);
    const pose = d => { w.eval(`applyTool(${JSON.stringify(d)})`); };
    const etat = () => w.eval('JSON.stringify(indispos)');

    pose('2027-03-15');
    V('une date DANS l\'année se pose', JSON.parse(etat())['2027-03-15'] === 'INDISPO', etat());
    pose('2028-01-02');
    V('le dernier jour de l\'année se pose encore', JSON.parse(etat())['2028-01-02'] === 'INDISPO', etat());
    pose('2028-01-03');
    V('le lundi 03/01/2028 est REFUSÉ (défaut vu en production)', !JSON.parse(etat())['2028-01-03'], etat());
    pose('2027-01-01');
    V('le 1er janvier 2027, avant le début, est refusé aussi', !JSON.parse(etat())['2027-01-01'], etat());
    V('rien d\'autre n\'a été écrit', Object.keys(JSON.parse(etat())).length === 2, etat());
    V('le refus est expliqué au MAR', /Hors de l'année de planning/.test((w.__toasts || []).join(' ')), w.__toasts);
  }

  console.log('\n═══ 28h. planning.html · les onglets Équité sont larges et alignés ═══');
  {
    /* (13/08/2026) AVANT : un interrupteur cale a 32 px du bord, epousant la
       largeur de son texte — decentre sur telephone, touche de 27 px. */
    const c = fs.readFileSync('../planning.html', 'utf8');
    const barre = (c.match(/\.eq-switchbar\{[^}]*\}/) || [''])[0];
    const sw    = (c.match(/\.eqv-switch\{[^}]*\}/) || [''])[0];
    const btn   = (c.match(/\.eqv-sw-btn\{[^}]*\}/) || [''])[0];
    const actif = (c.match(/\.eqv-sw-btn\.active\{[^}]*\}/) || [''])[0];
    V('la barre n\'a plus de marge latérale propre (alignement sur les cartes)',
      /padding:14px 0 0/.test(barre), barre);
    V('les deux onglets partagent la largeur en deux',
      /display:grid/.test(sw) && /grid-template-columns:1fr 1fr/.test(sw), sw);
    V('l\'onglet actif est souligné, plus encadré de blanc',
      /border-bottom-color:var\(--red\)/.test(actif) && /background:transparent/.test(actif), actif);
    V('la touche est assez haute pour le doigt (≥ 38 px)',
      /padding:9px 4px 10px/.test(btn) && /font-size:14\.5px/.test(btn), btn);
    V('les deux onglets sont toujours là, et un seul actif au départ',
      (c.match(/class="eqv-sw-btn[^"]*"/g) || []).length === 2 &&
      (c.match(/class="eqv-sw-btn active"/g) || []).length === 1);
  }

  console.log('\n═══ 28i. planning.html · le mois disparaît des vues qui l\'ignorent ═══');
  {
    /* (13/08/2026) Équité, Affectations et Année raisonnent à l'année. Sur mobile,
       la liste des mois restait pourtant affichée à côté de celle des années, et
       en choisir un ne produisait rien. */
    const contenu = fs.readFileSync('../planning.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/planning.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window, D = w.document;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await dodo(400);
    Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true });
    w.checkMobile();
    const moisVisible = () => D.getElementById('monthSelect').style.display !== 'none';
    const anVisible   = () => D.getElementById('yearSelect').style.display !== 'none';

    w.mobileSetView('planning'); await dodo(20);
    V('vue Planning : le mois est proposé', moisVisible());
    w.mobileSetView('equite'); await dodo(20);
    V('vue Équité : le mois disparaît', !moisVisible());
    V('mais l\'année reste', anVisible());
    w.mobileSetView('affect'); await dodo(20);
    V('vue Affectations : le mois disparaît aussi', !moisVisible());
    w.mobileSetView('annee'); await dodo(20);
    V('vue Année : idem', !moisVisible());
    /* La vue Médecins dessine à partir du planning, absent de ce banc : son rendu
       lève, mais le réglage du sélecteur est déjà posé quand il lève. On isole. */
    try { w.mobileSetView('medecins'); } catch (e) {}
    await dodo(20);
    V('vue Médecins : le mois revient', moisVisible());
    try { w.mobileSetView('planning'); } catch (e) {}
    await dodo(20);
    V('retour au Planning : le mois est toujours là', moisVisible());
    /* Le masquage ne doit pas survivre au passage sur grand écran, où c'est la
       feuille de style qui commande les deux listes. */
    w.mobileSetView('equite'); await dodo(20);
    Object.defineProperty(w, 'innerWidth', { value: 1200, configurable: true });
    w.checkMobile(); await dodo(20);
    V('sur grand écran, aucune valeur en dur ne court-circuite la feuille de style',
      D.getElementById('monthSelect').style.display === '',
      D.getElementById('monthSelect').style.display);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  console.log('\n═══ 28o. planning.html · vue Année : le nom du mois est écrit en toutes lettres ═══');
  {
    /* (14/08/2026) DEFAUT VU EN PRODUCTION : la bande du haut de la vue Année
       affichait « Aoû » alors que la colonne fait tout le mois — largement la
       place. Un mois de bord de fenêtre (janvier 2027 : 3 jours) reste abrégé,
       sinon son titre élargirait ses trois colonnes. */
    const contenu = fs.readFileSync('../planning.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/planning.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window, D = w.document;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await dodo(400);

    const mois = (an, m, nb) => ({
      year: an, month: m,
      days: Array.from({ length: nb }, (_, k) => ({
        date: an + '-' + String(m).padStart(2,'0') + '-' + String(k+1).padStart(2,'0'),
        day: k+1, isWeekend:false, isFerie:false })),
      doctors: [{ id:'AFR', initials:'AFR', days: Array.from({ length: nb }, () => ({ status:'' })) }]
    });
    /* Aout complet, puis les 3 jours de janvier 2027 qui ferment l'annee de planning. */
    w.eval('DATA = ' + JSON.stringify({ months: [mois(2026,8,31), mois(2027,1,3)] }) + '; renderAnnee();');
    await dodo(20);

    const bande = [...D.querySelectorAll('.ann-month')].map(t => t.textContent);
    V('un mois complet est ecrit en entier', bande[0] === 'Août', bande);
    V('plus aucune abreviation a trois lettres sur un mois complet',
      !/^(Jan|Fév|Mar|Avr|Jun|Jul|Aoû|Sep|Oct|Nov|Déc)$/.test(bande[0] || ''), bande);
    V('un mois de bord (3 jours) reste abrege avec son annee', bande[1] === 'Jan 2027', bande);
    V('la bande couvre bien tous les jours dessines',
      [...D.querySelectorAll('.ann-month')].reduce((s2,t) => s2 + Number(t.getAttribute('colspan')), 0) === 34);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  console.log('\n═══ 28p. planning.html · fiche MAR : les absences de 2027 comptent, la recup se voit ═══');
  {
    /* (14/08/2026) DEFAUT TROUVE AVANT PRODUCTION : les trois compteurs
       d'absences de l'onglet Medecins additionnaient A + CP + F en dur.
       Releve du classeur le meme jour :
         GARDES_2026 → A 855 · CP 23 · F 114 · V 3   · TP 131 · CL 124
         GARDES_2027 → A   0 · CP  0 · F 207 · V 1013 · TP 224 · CL  56
       A partir de 2027 un mois entier de vacances se serait affiche
       « aucune absence », et le recapitulatif serait tombe sur son repli
       « X jours presents » — deja visible sur janvier 2027.
       Au passage : « 1h » se lisait comme une heure alors que le code 18
       est une JOURNEE 8h-18h, et la recuperation de samedi n'apparaissait
       nulle part. */
    const contenu = fs.readFileSync('../planning.html', 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/planning.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window, D = w.document;
    if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await dodo(400);

    /* Un mois au vocabulaire 2027 : 10 V, 2 TP, 1 CL, 1 F, 2 gardes,
       1 journee 18h, 1 recuperation de samedi. Aucun A, aucun CP. */
    const codes = ['G','RG','18','R','V','V','V','V','V','V','V','V','V','V',
                   'TP','TP','CL','F','G','RG'];
    const mois = {
      id:'2027-03', year:2027, month:3, label:'Mars 2027',
      days: codes.map((_, k) => ({
        date:'2027-03-' + String(k+1).padStart(2,'0'), day:k+1,
        weekday:(k % 7) + 1, isWeekend:false, isFerie:false })),
      doctors: [{ id:'AFR', initials:'AFR',
        days: codes.map(c => ({ status:c, morning:'', afternoon:'' })) }]
    };
    w.eval('DATA = ' + JSON.stringify({ months:[mois] }) + ';'
         + 'AFFECTATIONS_DATA = {};'
         + 'currentMonthId = "2027-03";'
         + 'renderMedecins();'
         + 'openDocPanel("AFR");');
    await dodo(30);

    /* 14 absences : 10 V + 2 TP + 1 CL + 1 F. Ni R ni RG ni 18. */
    const carte = D.getElementById('medGrid').textContent.replace(/\s+/g, ' ');
    V('carte Medecins : les vacances 2027 comptent comme des absences',
      /14 abs\./.test(carte), carte.slice(0, 220));
    const stats = [...D.querySelectorAll('.doc-stat-num')].map(e => e.textContent);
    V('fiche : la case Absences affiche 14, pas 1', stats[2] === '14', stats);
    V('fiche : les gardes et le 18h restent justes',
      stats[0] === '2' && stats[1] === '1', stats);

    const recap = [...D.querySelectorAll('.doc-annual-month-stats')]
      .map(e => e.textContent.replace(/\s+/g, ' ').trim())[0] || '';
    V('recapitulatif : la journee 8h-18h ne se lit plus comme une heure',
      recap.includes('1×18') && !/\b1h\b/.test(recap), recap);
    V('recapitulatif : la recuperation de samedi a sa pastille', /1R/.test(recap), recap);
    V('recapitulatif : les 14 absences y sont aussi', /14A/.test(recap), recap);
    V('recapitulatif : le repli « X jours » ne s\'affiche plus a tort',
      !/\d+j\b/.test(recap), recap);
    /* (14/08/2026) La recuperation de samedi et la journee 8h-18h portaient
       la MEME couleur verte sur la fiche et sur la vue Annee : rien ne les
       distinguait a l'oeil. Le 18 reste vert — comme sur la vue Planning —
       et R prend une teinte propre. */
    const feuille = contenu.replace(/\s*\n\s*/g, ' ');
    V('la recuperation de samedi a sa propre teinte, declaree dans les deux themes',
      (feuille.match(/--recup:/g) || []).length === 2 &&
      (feuille.match(/--recup-soft:/g) || []).length === 2);
    V('la case R du calendrier ne reprend plus le vert du 18h',
      /\.dc-R\s*\{[^}]*var\(--recup-soft\)/.test(feuille) &&
      !/\.dc-R\s*\{[^}]*var\(--ok-soft\)/.test(feuille));
    V('l\'etiquette R et la pastille R du recapitulatif suivent la meme teinte',
      (feuille.match(/background:var\(--recup-soft\);color:var\(--recup\)/g) || []).length === 2);
    V('vue Annee : R et 18 ne partagent plus la meme couleur',
      /'18':\{bg:'#F0FDF4',fg:'#166534'\},'R':\{bg:'#ECFEFF',fg:'#0E7490'\}/.test(feuille));
    V('la journee 8h-18h reste verte sur la vue Planning',
      /\.chip-h18\s*\{\s*background: var\(--ok-soft\); color: var\(--ok\); \}/.test(feuille) &&
      /\.name-tag\.h18\s*\{\s*background: var\(--ok-soft\); color: var\(--ok\); \}/.test(feuille));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  console.log('\n═══ 28n. planning.html · les codes d\'absence, une seule liste ═══');
  {
    /* (13/08/2026) DEFAUT VU EN PRODUCTION : un MAR mis en « V » pour le lendemain
       apparaissait dans les absents cote comite, pas cote MAR.
       Il y avait CINQ listes recopiees a la main, divergentes, et aucune ne
       connaissait V, TP ni CL. Releve du classeur le meme jour :
         GARDES_2026 → A 855 · TP 131 · CL 126 · V 1
         GARDES_2027 → V 1013 · TP 224 · CL 56 · A 0
       Le vocabulaire a change entre les annees : la page ignorait donc, sur toute
       l'annee 2027, 1013 cases de vacances — et comptait ces MAR comme presents. */
    const c = fs.readFileSync('../planning.html', 'utf8');
    const pan = (c.match(/const ABSENT_PANNEAU\s*=\s*\[([^\]]*)\]/) || [null,''])[1];
    const codes = pan.split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
    ['A','V','F','R','CP','TP','CL'].forEach(k => {
      V('« ' + k + ' » compte comme une absence', codes.indexOf(k) > -1, codes);
    });
    V('les deux vocabulaires cohabitent (A pour 2026, V pour 2027)',
      codes.indexOf('A') > -1 && codes.indexOf('V') > -1);
    V('RG n\'est PAS dans le panneau : les sorties de garde ont leur ligne',
      codes.indexOf('RG') === -1);
    V('mais RG retire bien des grilles et des compteurs',
      /const ABSENT_STATUSES = new Set\(\['RG'\]\.concat\(ABSENT_PANNEAU\)\)/.test(c));
    V('plus aucune liste recopiée à la main',
      !/\['RG','A','CP','F','R'\]/.test(c) && !/\['A','CP','F','R'\]/.test(c));
    V('les quatre compteurs de présents emploient la liste commune',
      (c.match(/!ABSENT_STATUSES\.has\(st2?\)/g) || []).length === 4,
      (c.match(/!ABSENT_STATUSES\.has\(st2?\)/g) || []).length);
    V('le panneau hebdomadaire et la vue mobile du jour aussi',
      (c.match(/ABSENT_PANNEAU\.includes\(st\)/g) || []).length === 2);
  }

  console.log('\n═══ 28m. planning.html · l\'instantané d\'équité passe par la copie rapide ═══');
  {
    /* (13/08/2026) computeStatsLive recompte les gardes reellement faites sur
       toute l'annee : le calcul le plus lourd du portail, jusqu'ici paye par
       CHAQUE MAR a CHAQUE clic. Il tourne desormais une fois pour les 23, dans
       le declencheur differe du miroir. L'ecran perd l'exactitude a la seconde
       et gagne l'affichage immediat — le lien « recalculer » rend le choix. */
    const c = fs.readFileSync('../planning.html', 'utf8');
    const worker = fs.readFileSync('../cloudflare/worker.js', 'utf8');
    const miroir = fs.readFileSync('../gas/miroir.gs', 'utf8');
    const fn = (c.match(/async function loadEquiteLive[\s\S]*?\n\}/) || [''])[0];
    V('le Worker accepte la nouvelle clé', /equite_live_\\d\{4\}\|doc_/.test(worker));
    V('il la sert aux MAR comme aux admin',
      /\^equite_live_\\d\{4\}\$\/\.test\(cle\)\) return true/.test(worker));
    V('le miroir la construit sur les mêmes années que les statistiques',
      /_miroirAjouteEnveloppe_\(items, 'equite_live_' \+ y/.test(miroir));
    V('elle contient bien le recalcul, pas la photographie figée',
      /equite_live_[\s\S]{0,300}computeStatsLive\(y\)/.test(miroir));
    V('la page lit la copie avant d\'appeler Google',
      fn.indexOf("miroirRead(['equite_live_'") > -1 &&
      fn.indexOf("miroirRead(['equite_live_'") < fn.indexOf("apiPost({action:'getStatsLive'"));
    V('l\'appel direct reste le repli', /apiPost\(\{action:'getStatsLive'/.test(fn));
    V('« recalculer maintenant » force le calcul direct',
      /loadEquiteLive\(true\)/.test(c) && /if\(!force\)\{/.test(fn));
    V('forcer ignore aussi la mémoire de la page',
      /const cached = force \? null : LIVE_CACHE\[currentYear\]/.test(fn));
    V('la légende annonce la minute, plus « l\'instant T »',
      /à la minute près/.test(c) && !/gardes réelles à l'instant T/.test(c));
  }

  console.log('\n═══ 28l. planning.html · une année préchargée à moitié ne bloque plus ═══');
  {
    /* (13/08/2026) DÉFAUT VU EN PRODUCTION. Le dashboard précharge le planning de
       l'année SUIVANTE dans la mémoire de session partagée (pmPlan:{Y}) mais
       pas ses affectations. planning.html trouvait donc le planning tout de suite et
       partait chercher les affectations chez Google : appel lent, rejoué une fois,
       ATTENDU avant tout affichage. Deux à quatre minutes de témoin d'activité,
       écran figé sur l'année précédente sous le libellé de la nouvelle. */
    const c = fs.readFileSync('../planning.html', 'utf8');
    const bloc = (c.match(/\/\* Affectations sectorielles[\s\S]*?AFFECTATIONS_DATA = \{\}; \}/) || [''])[0];
    V('le bloc des affectations a bien été retrouvé', bloc.length > 0);
    V('le miroir est interrogé quand elles manquent',
      /miroirRead\(\['affectations_' \+ year\]\)/.test(bloc));
    V('Google n\'est appelé qu\'en dernier recours',
      bloc.indexOf('miroirRead') > -1 &&
      bloc.indexOf('miroirRead') < bloc.indexOf("apiPost({action: 'getAffectationsJson'"));
    V('l\'appel direct reste présent comme repli',
      /apiPost\(\{action: 'getAffectationsJson', year\}\)/.test(bloc));
    V('le cache mémoire reste prioritaire sur les deux',
      bloc.indexOf('AFF_CACHE[year]') < bloc.indexOf('miroirRead'));
    V('le résultat est réécrit dans la mémoire de session, affectations comprises',
      /_ssPlanWrite\(year, DATA, AFFECTATIONS_DATA\)/.test(bloc));
    V('une panne du miroir ne laisse pas la page sans affectations',
      /catch\(e\) \{ AFFECTATIONS_DATA = \{\}; \}/.test(bloc));
  }

  console.log('\n═══ 28k. planning.html · changer d\'année redessine la vue affichée ═══');
  {
    /* (13/08/2026) DÉFAUT VU EN PRODUCTION. Le sélecteur passait à 2027 et
       l'écran Équité continuait d'afficher 2026 — totaux ET cibles — sous le
       libellé de la nouvelle année. Le certificat annonçait « 19 écarts au-delà
       de 2 gardes » sur un planning 2027 qui n'en compte aucun. Seul « Médecins »
       était redessiné ; Équité, Affectations et Année étaient oubliés. */
    const c = fs.readFileSync('../planning.html', 'utf8');
    const onchange = (c.match(/sel\.onchange = async \(\) => \{[\s\S]*?\n  \};/) || [''])[0];
    V('le gestionnaire du sélecteur d\'année a bien été retrouvé', onchange.length > 0);
    ['renderMedecins', 'renderEquite', 'renderAffectations', 'renderAnnee'].forEach(f => {
      V('changer d\'année rappelle ' + f, onchange.indexOf(f + '()') > -1);
    });
    V('la bascule mobile est traitée aussi (mobilePlanningView)',
      /mobilePlanningView === 'equite'\) renderEquite\(\)/.test(onchange));
    V('les flèches ‹ Année › passent par le même chemin',
      /function stepYear[\s\S]{0,300}ysel\.onchange\(\)/.test(c));
  }

  console.log('\n═══ 28j. Les cibles d\'équité voyagent par la copie rapide ═══');
  {
    const c = fs.readFileSync('../planning.html', 'utf8');
    const worker = fs.readFileSync('../cloudflare/worker.js', 'utf8');
    /* (13/08/2026) stats_{annee} passe aux MAR. Ce n'est pas un elargissement :
       getStatsLive, qui sert les MEMES chiffres, ne porte aucun controle de role
       dans Indispos.gs, et l'onglet Instantane les affiche deja a tout MAR. */
    const gas = fs.readFileSync('../gas/Indispos.gs', 'utf8');
    const bloc = (gas.match(/if \(action === 'getStatsLive'\)[\s\S]{0,400}?\n    \}/) || [''])[0];
    V('getStatsLive ne filtre effectivement aucun rôle (le fondement de la décision)',
      bloc.length > 0 && !/_deny\(\)/.test(bloc), bloc.slice(0, 120));
    V('la copie rapide sert stats_{année} aux MAR',
      /\^stats_\\d\{4\}\$\/\.test\(cle\)\) return true/.test(worker));
    V('gardes_{année} et joursferies_{année} restent au comité',
      /\(gardes\|joursferies\)_\\d\{4\}[\s\S]{0,120}role === 'admin'/.test(worker));
    V('config_admin et vacances_admin aussi',
      /cle === 'config_admin'\) return user\.role === 'admin'/.test(worker) &&
      /cle === 'vacances_admin' \|\|/.test(worker));
    V('la vue Équité lit la copie avant de demander à Google',
      /miroirRead\(\['stats_' \+ year\]\)/.test(c));
    V('elle garde l\'appel direct en repli',
      /catch\(e\)\{[^}]*\}\s*try\{\s*const j = await apiPost\(\{action:'getStatsLive'/.test(c));
    /* (13/08/2026, révisé le soir) L'instantané passe lui aussi par la copie
       rapide — voir 28m. Ce qui doit rester vrai ici : les deux onglets ne
       lisent PAS la même clé. stats_{annee} est la photographie figée à la
       génération, equite_live_{annee} le recompte sur la grille réelle. Les
       confondre afficherait l'un sous le libellé de l'autre. */
    V('Initiale et Instantané lisent deux clés distinctes',
      (() => { const i = c.indexOf('async function getCiblesFromStats');
               const j = c.indexOf('async function loadEquiteLive');
               const ini = c.slice(i, c.indexOf('\n}', i));
               const liv = c.slice(j, c.indexOf('\n}', j));
               return ini.indexOf("miroirRead(['stats_' + year]") > -1
                   && ini.indexOf('equite_live_') === -1
                   && liv.indexOf("miroirRead(['equite_live_'") > -1
                   && liv.indexOf("miroirRead(['stats_") === -1; })());
  }

  console.log('\n═══ 29. Confidentialité des indispos (règle du secrétariat) ═══');
  {
    const r = await WK.fetch(new Request('https://worker/read', { method:'POST',
      body: JSON.stringify({ code: CODE_MAR, keys: ['indispos_2027'] }) }), env);
    const j = await r.json();
    const parMar = j.data && j.data.indispos_2027 && j.data.indispos_2027.parMar;
    V('un MAR reçoit SES indispos', !!(parMar && parMar.ALPHA), parMar && Object.keys(parMar));
    V('il ne reçoit PAS celles des autres', !(parMar && parMar.BRAVO), parMar && Object.keys(parMar));
  }

  /* ═══ 28d. LA MÉMOIRE DU CODE D'ACCÈS (17/08/2026) ═══
     Le code était gardé le temps d'un onglet : iOS fermant les apps web en
     arrière-plan, un MAR retapait ses 8 caractères à peu près chaque jour.
     Choix d'Arthur : 30 jours glissants, MAIS seulement dans l'app installée —
     depuis un navigateur (donc peut-être un poste du bloc), rien ne reste.
     On exécute ici le VRAI partage/session.js, avec de vrais stockages. */
  console.log('\n═══ 28d. La mémoire du code d\'accès — 30 jours, et seulement dans l\'app ═══');
  {
    const source = fs.readFileSync('../partage/session.js', 'utf8');

    /* Un monde minimal : deux stockages, et un drapeau « app installée ». */
    const monter = (installee) => {
      const mem = { s: {}, l: {} };
      const faux = (bac) => ({
        getItem: k => (k in bac ? bac[k] : null),
        setItem: (k, v) => { bac[k] = String(v); },
        removeItem: k => { delete bac[k]; }
      });
      const win = {
        navigator: { standalone: installee },
        matchMedia: q => ({ matches: installee && /standalone/.test(q) }),
        sessionStorage: faux(mem.s), localStorage: faux(mem.l),
        Date, JSON, Math, String, Number
      };
      win.window = win;
      const ctx = vm.createContext(win);
      vm.runInContext('var sessionStorage = window.sessionStorage, localStorage = window.localStorage;' + source, ctx);
      return { S: win.SessionPortail, mem };
    };

    /* — Dans l'app installée — */
    {
      const { S, mem } = monter(true);
      V('l\'app installée est reconnue', S.estInstallee() === true);
      S.memoriser('MARCODE77');
      V('le code est retenu au-delà de l\'onglet', !!mem.l['pmViewCodeMem'], Object.keys(mem.l));
      V('il est relu tel quel', S.lire() === 'MARCODE77', S.lire());
      V('l\'échéance est bien à 30 jours', S.joursRestants() === 30, S.joursRestants());

      /* Onglet fermé : sessionStorage disparaît, la mémoire longue reste. */
      mem.s = {};
      const { S: S2 } = (() => { const m = monter(true); m.mem.l['pmViewCodeMem'] = mem.l['pmViewCodeMem']; return m; })();
      V('après fermeture de l\'app, le code est retrouvé', S2.lire() === 'MARCODE77', S2.lire());
    }

    /* — Le glissement : ouvrir repousse l'échéance — */
    {
      const { S, mem } = monter(true);
      S.memoriser('MARCODE77');
      const o = JSON.parse(mem.l['pmViewCodeMem']);
      /* 20 jours plus tard : il reste 10 jours. */
      mem.l['pmViewCodeMem'] = JSON.stringify({ c: o.c, exp: Date.now() + 10 * 86400000 });
      V('sans ouverture, l\'échéance approche', S.joursRestants() === 10, S.joursRestants());
      S.lire();
      V('une ouverture la repousse à 30 jours', S.joursRestants() === 30, S.joursRestants());
    }

    /* — Le code périmé — */
    {
      const { S, mem } = monter(true);
      mem.l['pmViewCodeMem'] = JSON.stringify({ c: 'MARCODE77', exp: Date.now() - 1000 });
      V('un code périmé n\'ouvre rien', S.lire() === '', S.lire());
      V('et il est effacé, pas laissé à traîner', !mem.l['pmViewCodeMem'], mem.l);
    }

    /* — Dans un simple navigateur : RIEN ne reste — */
    {
      const { S, mem } = monter(false);
      V('un navigateur n\'est pas l\'app installée', S.estInstallee() === false);
      S.memoriser('MARCODE77');
      V('le code y vit le temps de l\'onglet', mem.s['pmViewCode'] === 'MARCODE77');
      V('RIEN n\'est écrit durablement — poste partagé', !mem.l['pmViewCodeMem'], Object.keys(mem.l));
      V('aucune échéance à annoncer', S.joursRestants() === null);
    }

    /* — La déconnexion efface les DEUX endroits — */
    {
      const { S, mem } = monter(true);
      S.memoriser('MARCODE77');
      S.oublier();
      V('déconnexion : plus rien dans l\'onglet', !mem.s['pmViewCode']);
      V('déconnexion : plus rien dans la mémoire longue', !mem.l['pmViewCodeMem']);
      V('et la relecture ne rend rien', S.lire() === '');
    }

    /* — Stockage refusé (navigation privée) : la page doit s'ouvrir quand même — */
    {
      const mem = { s: {} };
      const cassé = { getItem(){ throw new Error('refusé'); }, setItem(){ throw new Error('refusé'); }, removeItem(){ throw new Error('refusé'); } };
      const win = { navigator:{ standalone:true }, matchMedia:()=>({matches:true}),
        sessionStorage: { getItem:k=>(k in mem.s?mem.s[k]:null), setItem:(k,v)=>{mem.s[k]=v;}, removeItem:k=>{delete mem.s[k];} },
        localStorage: cassé, Date, JSON, Math, String, Number };
      win.window = win;
      const ctx = vm.createContext(win);
      vm.runInContext('var sessionStorage = window.sessionStorage, localStorage = window.localStorage;' + source, ctx);
      const S = win.SessionPortail;
      let leve = false;
      try { S.memoriser('MARCODE77'); S.lire(); S.oublier(); } catch (e) { leve = true; }
      V('un stockage refusé ne fait jamais échouer la page', leve === false);
    }

    /* — La règle : aucune page ne manipule la clé directement — */
    {
      /* La clé ne doit apparaître QUE dans le filet de secours, jamais dans le
         code courant de la page. */
      const horsFilet = f => fs.readFileSync('../' + f, 'utf8').split('\n')
        .filter(l => /sessionStorage\.\w+\('pmViewCode'/.test(l) && !/FALLBACK_SESSION|window\.SessionPortail = window\.SessionPortail/.test(l));
      const fautives = ['index.html', 'planning.html', 'indispos.html'].filter(f => horsFilet(f).length);
      V('aucune page ne touche à la clé sans passer par le partage', fautives.length === 0, fautives);
      /* (17/08/2026) Le banc a trouvé ceci AVANT la production : sans filet, une page
         dont le partage ne se charge pas appelle SessionPortail dans le vide et ne s'ouvre
         PLUS — le MAR ne peut même plus taper son code. */
      const sansFilet = ['index.html', 'planning.html', 'indispos.html']
        .filter(f => !/FALLBACK_SESSION/.test(fs.readFileSync('../' + f, 'utf8')));
      V('chaque page a son filet si le partage ne se charge pas', sansFilet.length === 0, sansFilet);
      const sansPartage = ['index.html', 'planning.html', 'indispos.html']
        .filter(f => !/partage\/session\.js/.test(fs.readFileSync('../' + f, 'utf8')));
      V('les trois pages chargent bien le partage', sansPartage.length === 0, sansPartage);
      const sansDeco = ['index.html', 'planning.html', 'indispos.html']
        .filter(f => !/SessionPortail\.oublier\(\)/.test(fs.readFileSync('../' + f, 'utf8')));
      V('les trois offrent une déconnexion', sansDeco.length === 0, sansDeco);
    }
  }

  /* ═══ 28 ter. Toute icône demandée existe dans le mini-bundle local ═══
     (26/08/2026) DÉFAUT VU EN PRODUCTION LE SOIR MÊME : la tuile figée demandait
     `lock`, absent du mini-bundle — carré ambre VIDE, sans erreur, exactement le
     piège que l'en-tête du bundle décrit. On collecte ici TOUTES les icônes que
     index.html peut demander (statiques `data-lucide`, tableau TILES, et les
     icônes dérivées comme celle de la tuile figée) et on exige leur présence. */
  {
    console.log('\n═══ 28 ter. Toute icône du dashboard existe dans le mini-bundle ═══');
    const page = fs.readFileSync('../index.html', 'utf8');
    const bundle = fs.readFileSync('../assets/vendor/lucide-icons.js', 'utf8');
    const mIcons = bundle.match(/var ICONS = \{[\s\S]*?\n/);
    V('le catalogue du bundle est lisible', !!mIcons);
    const dispo = new Set([...mIcons[0].matchAll(/"([a-z][a-z-]*)":\[/g)].map(m => m[1]));
    V('le catalogue n\'est pas vide', dispo.size > 10, dispo.size);
    const demandees = new Set();
    [...page.matchAll(/data-lucide="([a-z-]+)"/g)].forEach(m => demandees.add(m[1]));
    [...page.matchAll(/icon:\s*'([a-z-]+)'/g)].forEach(m => demandees.add(m[1]));
    const mFige = page.match(/icone = fige \? '([a-z-]+)'/);
    V('l\'icône de la tuile figée est lisible dans la page', !!mFige);
    if (mFige) demandees.add(mFige[1]);
    const absentes = [...demandees].filter(n => !dispo.has(n));
    V('aucune icône demandée n\'est absente du bundle (carré vide sinon)', absentes.length === 0, absentes);
  }

  /* ═══ 28 bis. Campagne figée : la tuile indispos le dit dès le portail ═══
     (26/08/2026) Le planning généré, l'écran indispos passe en lecture seule —
     la tuile doit l'annoncer (cadenas, teinte ambre, « Consultation seule »)
     au lieu d'inviter à « déclarer ». On extrait de la page LES lignes de
     dérivation réellement livrées, comme le test 29 pour le filtre. */
  {
    console.log('\n═══ 28 bis. La tuile indispos annonce la consultation seule ═══');
    const src = fs.readFileSync('../index.html', 'utf8');
    const mDeriv = src.match(/const fige = [\s\S]*?const sousTitre = [\s\S]*?;\n/);
    V('les lignes de dérivation de la tuile sont lisibles dans la page', !!mDeriv);
    V('la teinte ambre existe dans la feuille de style', src.indexOf('.tile-ico.ambre') > -1);
    const derive = (figees) => {
      const bac = { t: { key: 'indispos', icon: 'clock', tint: 'viol', sub: 'Déclarez vos souhaits et vos congés {AN}.' },
                    INDISPOS_FIGEES: figees, INDISPOS_YEAR: 2027, PHASE_TP: null };
      bac.globalThis = bac; vm.createContext(bac);
      vm.runInContext(mDeriv[0] + '\n({fige, icone, teinte, sousTitre})', bac);
      return vm.runInContext('({fige, icone, teinte, sousTitre})', bac);
    };
    const f = derive(true), n = derive(false);
    V('figée : cadenas', f.icone === 'lock', f.icone);
    V('figée : teinte ambre', f.teinte === 'ambre', f.teinte);
    V('figée : « Consultation seule », année comprise', /Consultation seule/.test(f.sousTitre) && /2027/.test(f.sousTitre) && /établi/.test(f.sousTitre), f.sousTitre);
    V('campagne vivante : la tuile ne change pas (horloge, violet)', n.icone === 'clock' && n.teinte === 'viol', n);
    V('campagne vivante : l\'invitation à déclarer, avec l\'année', /Déclarez/.test(n.sousTitre) && /2027/.test(n.sousTitre), n.sousTitre);
  }

  /* ═══ Le module « CR d'anesthésie » a été retiré du portail ═══
     (07/09/2026) Le générateur portait le logo officiel de l'établissement et la
     liste nominative des praticiens sur une page publique sans code d'accès.
     Il a été retiré en entier. Ce scénario remplace l'ancien §29 (qui vérifiait
     que la tuile ne s'affichait que sur grand écran) : il garde la porte fermée
     et échouera si le module revient sans décision explicite. */
  {
    console.log('\n═══ 29. Le module CR d\'anesthésie est absent ═══');
    const src = fs.readFileSync('../index.html', 'utf8');
    V('aucune tuile ne pointe vers le module', !/cr-anesth/.test(src));
    V('le dossier du module n\'existe plus', !fs.existsSync('../cr-anesthesie'));
    V('aucun logo d\'établissement dans le dépôt',
      !fs.existsSync('../cr-anesthesie/logo-etablissement.png'));
    /* La clause `pc` du filtre n'existait que pour cette tuile : elle part avec
       elle, sinon on garde une condition que plus aucune tuile ne déclenche. */
    V('la clause d\'écran du filtre a disparu', !/t\.pc/.test(src));
    /* Les tuiles que tout MAR doit garder, à deux largeurs. */
    const mTiles = src.match(/const TILES = \[[\s\S]*?\n\];/);
    const mFiltre = src.match(/TILES\.filter\((t => [\s\S]*?)\)\.map\(t =>/);
    V('le tableau des tuiles est lisible dans la page', !!mTiles);
    V('la ligne de filtrage est lisible dans la page', !!mFiltre);
    const passe = (largeur) => {
      /* MY_TUILES : liste des tuiles reservees recue avec l'identite (08/09/2026).
         Vide ici — un MAR ordinaire n'en a aucune, et c'est bien ce qu'on mesure. */
      const bac = { window: { innerWidth: largeur }, MY_ID: 'ALPHA', INDISPOS_OUVERTE: true,
                    MY_LIBERAL: false, PHASE_TP: null, MY_QUOTITE: 100, MY_TPFIXE: false,
                    MY_TUILES: [] };
      bac.globalThis = bac;
      vm.createContext(bac);
      vm.runInContext(mTiles[0], bac);
      return vm.runInContext(`TILES.filter(${mFiltre[1]}).map(t => t.key)`, bac);
    };
    const surPC = passe(1440), surTel = passe(390);
    V('le planning reste accessible sur téléphone', surTel.includes('planning'));
    V('les congés restent accessibles sur téléphone', surTel.includes('conges'));
    /* Plus aucune tuile ne doit dépendre de la largeur : PC et téléphone
       proposent exactement la même liste. */
    const ecart = surPC.filter(k => !surTel.includes(k));
    V('PC et téléphone proposent les mêmes tuiles', ecart.length === 0, ecart);
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
