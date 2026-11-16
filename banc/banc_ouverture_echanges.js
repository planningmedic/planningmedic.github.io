/* ═══ BANC — OUVERTURE PROGRAMMÉE DES ÉCHANGES (14/11/2026) ═══
   Décision du responsable : la tuile « Mes échanges » réapparaît VERROUILLÉE
   jusqu'à une date et une heure fixées, puis s'ouvre toute seule ; l'animation
   du cadenas est vue une fois par chacun, dans les 7 jours.
   Trois maillons, le VRAI code de chacun :
   1. echanges.gs — l'instant (ECHANGES_OUVERTURE) ferme avant, ouvre après,
      sans déclencheur ; programmer / ouvrir / fermer le posent ou l'effacent ;
   2. le Worker — même règle, à la seconde, sur la lecture ET l'abonnement aux
      notifications ; l'instant voyage avec la réponse ;
   3. l'accueil (index.html réel, servi par le vrai Worker) — verrou, compte à
      rebours, toucher qui ne navigue pas, animation une seule fois.
   Contre-épreuves : sans instant, tout se comporte comme avant. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const HEURE = 3600 * 1000, JOUR = 24 * HEURE;
const iso = ms => new Date(ms).toISOString();

(async () => {
  console.log('\n═══ 1. echanges.gs : l\'instant ferme avant, ouvre après — sans déclencheur ═══');
  {
    const GS = path.join(__dirname, '..', 'gas', 'echanges.gs');
    const src = fs.readFileSync(GS, 'utf8');
    const PROPS = {}, pousses = [];
    const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN,
      PropertiesService: { getScriptProperties: () => ({
        getProperty: k => (k in PROPS ? PROPS[k] : (k === 'MIROIR_PUSH_TOKEN' ? 'JETON' : null)),
        setProperty: (k, v) => { PROPS[k] = String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
      Logger: { log: () => {} },
      Utilities: { formatDate: d => d.toISOString() },
      _miroirEnvoyerLot_: (lot) => { pousses.push(lot); return { success: true }; } });
    const constante = src.match(/const ECHANGES_OUVERTURE_A_PROGRAMMER = '[^']*';/);
    V('la date à programmer est une constante lisible en tête de section', !!constante);
    vm.runInContext(constante[0].replace('const ', 'var '), ctx);
    vm.runInContext("var ECHANGES_REPONSES_A_PROGRAMMER = '';", ctx);   // (15/11/2026) dépôt sans course : aucune heure des réponses ici
    ['_echangesOuvertureMs_', '_echangesPoserReponses_', '_echangesEtat_', '_echangesOuvertsMaintenant_', '_echangesAutorise_',
     'ouvrirEchanges', 'programmerOuvertureEchanges', 'annoncerOuvertureEchanges', 'fermerEchanges', 'synchroniserEtatEchanges']
      .forEach(n => vm.runInContext(extraireFonction(GS, n), ctx));
    const aut = id => vm.runInContext(`_echangesAutorise_(${JSON.stringify({ id: id, role: 'mar' })})`, ctx);
    const etatPousse = () => JSON.parse(pousses[pousses.length - 1].notif_config);
    const lever = f => { try { vm.runInContext(f, ctx); return null; } catch (e) { return e.message; } };

    V('contre-épreuve — sans instant : fermé, comme avant', aut('CHARLIE') === false);
    PROPS.ECHANGES_OUVERTURE = iso(Date.now() + HEURE);
    V('instant à venir : un MAR reste dehors', aut('CHARLIE') === false);
    V('instant à venir : l\'admin passe toujours', vm.runInContext(`_echangesAutorise_({ id: 'DURAND', role: 'admin' })`, ctx) === true);
    PROPS.ECHANGES_OUVERTURE = iso(Date.now() - 1000);
    V('instant atteint : tout le monde passe, sans que personne n\'ait rien lancé', aut('CHARLIE') === true);
    V('… et l\'interrupteur, lui, n\'a pas bougé (aucun déclencheur à attendre)', !('ECHANGES_OUVERTS' in PROPS));
    PROPS.ECHANGES_OUVERTURE = 'pas une date';
    V('instant illisible : fermé (jamais ouvert par erreur)', aut('CHARLIE') === false);
    V('l\'état poussé ne transporte pas un instant illisible', vm.runInContext('_echangesEtat_()', ctx).ouverture === '');

    PROPS.ECHANGES_OUVERTS = 'O';
    const avenir = iso(Date.now() + 3 * JOUR);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(avenir)})`, ctx);
    V('programmer : l\'interrupteur est baissé (fermé jusqu\'à l\'instant)', !('ECHANGES_OUVERTS' in PROPS) && aut('CHARLIE') === false);
    V('programmer : l\'instant est noté', PROPS.ECHANGES_OUVERTURE === avenir, PROPS.ECHANGES_OUVERTURE);
    V('programmer : le Worker reçoit l\'instant (notif_config)', etatPousse().ouverture === avenir && etatPousse().ouvert === false, etatPousse());
    V('programmer une date passée est refusé, avec le bon conseil', /déjà passée.*ouvrirEchanges/.test(lever(`programmerOuvertureEchanges(${JSON.stringify(iso(Date.now() - JOUR))})`) || ''));
    V('programmer une date illisible est refusé', /illisible/.test(lever(`programmerOuvertureEchanges('mercredi')`) || ''));
    V('… et le refus ne touche pas l\'instant déjà programmé', PROPS.ECHANGES_OUVERTURE === avenir);
    vm.runInContext(`ECHANGES_OUVERTURE_A_PROGRAMMER = ${JSON.stringify(iso(Date.now() + 2 * JOUR))}`, ctx);
    vm.runInContext('programmerOuvertureEchanges()', ctx);
    V('sans argument : la constante est prise (lancement depuis l\'éditeur)', PROPS.ECHANGES_OUVERTURE === iso(Date.now() + 2 * JOUR) || Math.abs(Date.parse(PROPS.ECHANGES_OUVERTURE) - (Date.now() + 2 * JOUR)) < 5000);

    vm.runInContext(`ECHANGES_OUVERTURE_A_PROGRAMMER = ''`, ctx);
    V('sans argument ni date écrite : refusé, avec le bon conseil', /Aucune date.*annoncerOuvertureEchanges/.test(lever('programmerOuvertureEchanges()') || ''));

    console.log('  — annonce sans date (15/11/2026)');
    PROPS.ECHANGES_OUVERTS = 'O';
    vm.runInContext('annoncerOuvertureEchanges()', ctx);
    V('annoncer : fermé à tous', !('ECHANGES_OUVERTS' in PROPS) && aut('CHARLIE') === false);
    V('annoncer : aucune date (pas de compte à rebours), l\'annonce est notée',
      !('ECHANGES_OUVERTURE' in PROPS) && PROPS.ECHANGES_ANNONCE === 'O');
    V('annoncer : le Worker reçoit l\'annonce', etatPousse().annonce === true && etatPousse().ouverture === '', etatPousse());
    const plusTard = iso(Date.now() + 4 * JOUR);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(plusTard)})`, ctx);
    V('la date fixée ensuite prend le relais (date transmise)', etatPousse().ouverture === plusTard);
    vm.runInContext('annoncerOuvertureEchanges()', ctx);
    vm.runInContext('ouvrirEchanges()', ctx);
    V('ouvrir efface l\'annonce', !('ECHANGES_ANNONCE' in PROPS) && etatPousse().annonce === false);
    vm.runInContext('annoncerOuvertureEchanges()', ctx);

    vm.runInContext('fermerEchanges()', ctx);
    V('fermer : l\'annonce est effacée aussi', !('ECHANGES_ANNONCE' in PROPS) && etatPousse().annonce === false);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(plusTard)})`, ctx);
    vm.runInContext('fermerEchanges()', ctx);
    V('fermer : l\'ouverture programmée est annulée aussi', !('ECHANGES_OUVERTURE' in PROPS) && aut('CHARLIE') === false);
    V('fermer : le Worker n\'a plus d\'instant', etatPousse().ouverture === '', etatPousse());
    vm.runInContext('ouvrirEchanges()', ctx);
    V('ouvrir tout de suite : ouvert, et l\'instant est noté (l\'animation sera jouée)',
      PROPS.ECHANGES_OUVERTS === 'O' && Math.abs(Date.parse(PROPS.ECHANGES_OUVERTURE) - Date.now()) < 5000 && aut('CHARLIE') === true);
    V('le contrôle à l\'envoi d\'une proposition passe par la même règle', /if \(!_echangesAutorise_\(\{ id: receveur/.test(src));
  }

  /* ── Le Worker et la page ── */
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8').replace('export default', 'globalThis.__W =');
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const CODE = 'MARCODE77', CODEADM = 'ADMCODE11';
  const jours = ['2027-03-08','2027-03-09','2027-03-10'];
  const planning = { months: [{ days: jours.map(d => ({ date: d })),
    doctors: [{ id:'ALPHA', days: jours.map(() => ({ status: '' })) }] }] };
  const baseKV = async (cfg) => {
    const kv = {
      acces: JSON.stringify({ indisposYear:2027, indisposOuverte:false, users:[
        { h: await sha(CODE), role:'mar', id:'ALPHA', name:'ALPHA', initials:'AL', prenom:'Test' },
        { h: await sha(CODEADM), role:'admin', id:'ADM', name:'ADM', initials:'AD', prenom:'Adm' }]}),
      annees: JSON.stringify({ success:true, active:2027, annees:[{annee:2027, statut:'ACTIF'}] }),
      planning_2027: JSON.stringify(planning),
      echanges: JSON.stringify({ success:true, echanges:[] }),
    };
    if (cfg) kv.notif_config = JSON.stringify(cfg);
    return kv;
  };
  function worker(kvInitial) {
    const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
    wctx.globalThis = wctx; vm.runInContext(src, wctx);
    const M = new Map(Object.entries(kvInitial));
    const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
      list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
    const env = { KV, PUSH_TOKEN:'JETON' };
    const appel = async (chemin, corps) => (await wctx.__W.fetch(new Request('https://worker' + chemin, { method:'POST', body: JSON.stringify(corps) }), env)).json();
    return { WK: wctx.__W, env, M, appel };
  }
  const abo = { endpoint:'https://push.example/x', keys:{ p256dh:'p', auth:'a' } };

  console.log('\n═══ 2. Le Worker : même règle, à la seconde, lecture ET abonnement ═══');
  {
    const avenir = iso(Date.now() + 2 * HEURE), passe = iso(Date.now() - 60 * 1000);
    let w = worker(await baseKV({ ouvert:false, pilotes:[], ouverture: avenir }));
    let r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('instant à venir : la clé `echanges` est REFUSÉE au MAR', r.refuses.indexOf('echanges') > -1 && !r.data.echanges, r.refuses);
    V('… mais l\'instant lui est servi (compte à rebours)', r.echangesOuverture === avenir, r.echangesOuverture);
    let a = await w.appel('/notif-abonner', { code: CODE, subscription: abo });
    V('instant à venir : l\'abonnement aux notifications reste fermé', a.success === false);
    r = await w.appel('/read', { code: CODEADM, keys: ['echanges'] });
    V('l\'admin lit, et reçoit l\'instant lui aussi', !!r.data.echanges && r.echangesOuverture === avenir);

    w = worker(await baseKV({ ouvert:false, pilotes:[], ouverture: passe }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('instant atteint : la clé est servie, sans qu\'aucune poussée ne soit arrivée', !!(r.data.echanges && r.data.echanges.success) && r.refuses.length === 0, r.refuses);
    V('… et l\'instant voyage encore (animation)', r.echangesOuverture === passe);
    a = await w.appel('/notif-abonner', { code: CODE, subscription: abo });
    V('instant atteint : l\'abonnement s\'ouvre aussi', a.success === true, a);

    w = worker(await baseKV({ ouvert:false, pilotes:[], ouverture: '', annonce: true }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('annoncée sans date : refusée au MAR, « prochainement » lui est servi', r.refuses.indexOf('echanges') > -1 && r.echangesOuverture === 'prochainement', r.echangesOuverture);
    w = worker(await baseKV({ ouvert:false, pilotes:[], ouverture: avenir, annonce: true }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('annoncée PUIS datée : la date l\'emporte', r.echangesOuverture === avenir);
    w = worker(await baseKV({ ouvert:true, pilotes:[], annonce: true }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('annonce restée alors que c\'est ouvert : servi, aucun « prochainement »', !!r.data.echanges && !('echangesOuverture' in r));

    w = worker(await baseKV({ ouvert:false, pilotes:[], ouverture: 'demain' }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('instant illisible : fermé, et rien n\'est servi comme instant', r.refuses.indexOf('echanges') > -1 && !('echangesOuverture' in r));
    w = worker(await baseKV({ ouvert:true, pilotes:[] }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('contre-épreuve — interrupteur levé, sans instant : servi, aucun champ en plus', !!r.data.echanges && !('echangesOuverture' in r));
    r = await w.appel('/read', { code: CODE, keys: ['annees'] });
    V('une lecture sans `echanges` ne paie pas la lecture de notif_config', !('echangesOuverture' in r));
  }

  /* L'accueil réel, servi par le vrai Worker. `vue` : la valeur déjà
     retenue par le téléphone pour l'animation (null : jamais vue). */
  async function monterPage(kvInitial, vue, code) {
    const { WK, env, M } = worker(kvInitial);
    const contenu = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const appelsMiroir = [];
    const fauxFetch = async (url, opt) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        const chemin = u.replace(/^https:\/\/[^/]+/, '');
        if (chemin === '/read') { try { appelsMiroir.push(JSON.parse(opt.body).keys); } catch(e) { appelsMiroir.push(null); } }
        return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
      }
      return { ok:true, json: async () => ({ success:false, error:'GAS indisponible dans le banc' }) };
    };
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/index.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8'));
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        win.fetch = fauxFetch;
        if (!win.navigator.sendBeacon) win.navigator.sendBeacon = () => true;
        try { win.sessionStorage.setItem('pmViewCode', code || CODE); } catch(e) {}
        if (vue != null) { try { win.localStorage.setItem('pmEchOuvertureVue', vue); } catch(e) {} }
      } });
    await dodo(900);
    return { w: dom.window, M, erreurs, appelsMiroir, fermer: () => dom.window.close() };
  }

  console.log('\n═══ 3. L\'accueil AVANT l\'heure : tuile visible, verrouillée, compte à rebours ═══');
  {
    const avenir = Date.now() + (3 * JOUR + 10 * HEURE + 5 * 60 * 1000);
    const { w, erreurs, appelsMiroir, fermer } = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(avenir) }), null);
    const d = w.document, hero = d.getElementById('echangesHero');
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    V('la tuile « Mes échanges » est VISIBLE', hero && hero.style.display !== 'none', hero && hero.style.display);
    V('… et verrouillée (grisée, pleine largeur)', hero.classList.contains('verrou') && hero.classList.contains('large'));
    V('le sous-titre dit le jour et l\'heure d\'ouverture', /^Ouverture \S+ \d+ \S+ à \d+ h/.test(d.getElementById('echHeroSub').textContent), d.getElementById('echHeroSub').textContent);
    V('le compte à rebours est affiché, en jours et heures', d.getElementById('echRebours').style.display !== 'none' && /^3 j 10 h$/.test(d.getElementById('echReboursV').textContent), d.getElementById('echReboursV').textContent);
    V('aucune requête miroir en plus au chargement (l\'instant voyage avec le reste)',
      !appelsMiroir.some(k => Array.isArray(k) && k.length === 1 && k[0] === 'echanges'), appelsMiroir);
    const avant = w.location.hash;
    hero.click();
    V('toucher la tuile ne l\'ouvre PAS', w.location.hash === avant && d.getElementById('echangesView').style.display === 'none');
    V('… le cadenas tremble', hero.classList.contains('secoue'));
    const bulle = d.getElementById('echBulle');
    V('… et l\'heure d\'ouverture s\'affiche, en toutes lettres', bulle.style.display === 'flex' && /ouvrent .+ à \d+ h.*pour tout le monde en même temps/.test(bulle.textContent), bulle.textContent);
    V('aucune animation d\'ouverture avant l\'heure', !hero.classList.contains('ouverture'));
    fermer();
  }

  console.log('\n═══ 3 bis. Date pas encore connue : « Ouverture prochainement », sans compte à rebours ═══');
  {
    const { w, erreurs, appelsMiroir, fermer } = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture:'', annonce:true }), null);
    const d = w.document, hero = d.getElementById('echangesHero');
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    V('la tuile est visible et verrouillée', hero.style.display !== 'none' && hero.classList.contains('verrou'));
    V('le sous-titre dit « Ouverture prochainement »', d.getElementById('echHeroSub').textContent === 'Ouverture prochainement', d.getElementById('echHeroSub').textContent);
    V('aucun compte à rebours', d.getElementById('echRebours').style.display === 'none' && hero.classList.contains('sans-date'));
    hero.click();
    const bulle = d.getElementById('echBulle');
    V('toucher : ne s\'ouvre pas, et annonce « prochainement »', w.location.hash !== '#echanges' && /ouvrent prochainement.*La date s'affichera ici/.test(bulle.textContent), bulle.textContent);
    const n = appelsMiroir.length;
    await dodo(2500);
    V('la page ne redemande rien d\'elle-même (pas d\'heure à attendre)', appelsMiroir.length === n, appelsMiroir.slice(n));
    fermer();
  }

  console.log('\n═══ 4. Le compte à rebours arrive à zéro : la page redemande, le cadenas s\'ouvre ═══');
  {
    const instant = Date.now() + 2500;
    const { w, erreurs, appelsMiroir, fermer } = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(instant) }), null);
    const d = w.document, hero = d.getElementById('echangesHero');
    V('verrouillée juste avant l\'heure, en minutes et secondes', hero.classList.contains('verrou') && /^0 min 0\d$/.test(d.getElementById('echReboursV').textContent), d.getElementById('echReboursV').textContent);
    await dodo(3200);
    V('à l\'heure : la clé a été redemandée toute seule', appelsMiroir.some(k => Array.isArray(k) && k.length === 1 && k[0] === 'echanges'), appelsMiroir);
    V('la tuile n\'est plus verrouillée', !hero.classList.contains('verrou') && hero.style.display === 'flex');
    V('le cadenas s\'ouvre sous les yeux de celui qui est là', hero.classList.contains('ouverture'));
    V('le compte à rebours a disparu', d.getElementById('echRebours').style.display === 'none');
    hero.click();
    V('toucher la tuile ouvre désormais Mes échanges', w.location.hash === '#echanges');
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    fermer();
  }

  console.log('\n═══ 5. Arrivé APRÈS l\'heure : l\'animation, une fois par MAR, dans les 7 jours ═══');
  {
    const instant = Date.now() - 5 * HEURE;
    let p = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(instant) }), null);
    let hero = p.w.document.getElementById('echangesHero');
    V('première ouverture du portail après l\'heure : l\'animation joue', hero.classList.contains('ouverture') && !hero.classList.contains('verrou'));
    const retenu = p.w.localStorage.getItem('pmEchOuvertureVue');
    V('le téléphone retient qu\'elle a été vue (pour CETTE ouverture)', retenu === String(Date.parse(iso(instant))), retenu);
    await dodo(2700);
    V('l\'animation se retire d\'elle-même (2,5 s)', !hero.classList.contains('ouverture'));
    p.fermer();

    p = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(instant) }), retenu);
    hero = p.w.document.getElementById('echangesHero');
    V('seconde ouverture : la tuile est normale, sans animation', hero.style.display === 'flex' && !hero.classList.contains('ouverture'));
    p.fermer();

    p = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(Date.now() - 1000) }), retenu);
    hero = p.w.document.getElementById('echangesHero');
    V('une NOUVELLE ouverture (autre instant) se joue à nouveau', hero.classList.contains('ouverture'));
    p.fermer();

    p = await monterPage(await baseKV({ ouvert:false, pilotes:[], ouverture: iso(Date.now() - 8 * JOUR) }), null);
    hero = p.w.document.getElementById('echangesHero');
    V('retour de vacances après 8 jours : pas de cadenas qui s\'ouvre sur des échanges ouverts depuis longtemps',
      hero.style.display === 'flex' && !hero.classList.contains('ouverture'));
    p.fermer();

    p = await monterPage(await baseKV({ ouvert:true, pilotes:[] }), null);
    hero = p.w.document.getElementById('echangesHero');
    V('contre-épreuve — ouvert sans instant : tuile normale, sans animation ni verrou',
      hero.style.display === 'flex' && !hero.classList.contains('ouverture') && !hero.classList.contains('verrou'));
    p.fermer();

    p = await monterPage(await baseKV(null), null);
    hero = p.w.document.getElementById('echangesHero');
    V('contre-épreuve — fermé sans instant : la tuile reste INVISIBLE, comme avant', hero.style.display === 'none');
    p.fermer();
  }

  console.log('\n═══ 6. L\'accueil ne s\'ouvre jamais tout seul : c\'est le serveur qui décide ═══');
  {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const corps = extraireFonction(path.join(__dirname, '..', 'index.html'), '_echVerrouille');
    V('le verrou ne tombe que si le serveur a servi la clé (ECH_AUTORISE)', /!ECH_AUTORISE/.test(corps), corps);
    V('ECH_AUTORISE ne passe à vrai que sur une réponse du serveur', (html.match(/ECH_AUTORISE = true/g) || []).length === 2);
    V('les animations respectent « réduire les animations » du téléphone', /prefers-reduced-motion[\s\S]{0,200}ech-tuile/.test(html));
  }

  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
