/* ═══ BANC — L'ÉCRAN DE LA BOURSE AUX GARDES (25/11/2026, décisions du responsable du 24/11) ═══
   Le vrai index.html dans un navigateur simulé, servi par le VRAI Worker.
   Éprouvé : la vitrine servie à tous (et rien d'autre), la tuile, prendre une
   offre (avec la question posée dans la feuille puis la confirmation),
   proposer un échange sur une offre, choisir parmi les échanges reçus,
   retirer son offre, et l'inversion garde ↔ 18 h, seule demande ciblée gardée. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8').replace('export default', 'globalThis.__W =');
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const CODE = 'MARCODE77';

  /* Un planning 2027 minimal mais RÉALISTE : un mois, 6 jours, deux MAR,
     ALPHA tient une garde — la matière du panneau « Proposer ». */
  const jours = ['2027-03-08','2027-03-09','2027-03-10','2027-03-11','2027-03-12','2027-03-13'];
  const st = (arr) => jours.map((d,i)=>({ status: arr[i]||'' }));
  const planning = { months: [{
    days: jours.map(d => ({ date: d })),
    doctors: [
      { id:'ALPHA', days: st(['','G','RG','','','']) },
      { id:'BRAVO', days: st(['','','','','G','RG']) },
    ],
  }] };
  const demande = { id:'E1', creeLe:new Date().toISOString(), type:'don', annee:2027,
    date:'2027-03-12', date2:'', demandeur:'BRAVO', receveur:'ALPHA', etat:'attente', reponduLe:'', info:'' };

  async function monterPage(kvInitial, surGas, mobile) {
    const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
    wctx.globalThis = wctx; vm.runInContext(src, wctx);
    const WK = wctx.__W, M = new Map();
    Object.keys(kvInitial).forEach(k => M.set(k, kvInitial[k]));
    const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
      list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
    const env = { KV, PUSH_TOKEN:'JETON' };
    const contenu = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const appelsMiroir = [], appelsGas = [];
    const fauxFetch = async (url, opt) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        const chemin = u.replace(/^https:\/\/[^/]+/, '');
        if (chemin === '/read') { try { appelsMiroir.push(JSON.parse(opt.body).keys); } catch(e) { appelsMiroir.push(null); } }
        return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
      }
      let charge = {}; try { charge = JSON.parse(opt.body); } catch(e) {}
      appelsGas.push(charge);
      const rep = surGas ? surGas(charge, M) : null;
      return { ok:true, json: async () => (rep || { success:false, error:'GAS indisponible dans le banc' }) };
    };
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/index.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));   // (14/09/2026) le socle commun, servi comme le vrai site
        /* (17/08/2026) L'appareil compte maintenant : la carte des notifications
           ne se propose plus sur ordinateur. `mobile` simule un téléphone via
           l'écran tactile, comme le fait _appareilMobile() pour les iPad. */
        win.matchMedia = q => ({ matches: !!(mobile && /pointer:\s*coarse/.test(String(q))),
          addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        /* Le faux réseau AVANT tout script : l'appel d'ouverture (viewAutoLogin
           → miroirBootDash) part pendant le chargement de la page. */
        win.fetch = fauxFetch;
        if (!win.navigator.sendBeacon) win.navigator.sendBeacon = () => true;
        /* Un navigateur « capable » de notifications : la carte ne dépend
           alors QUE de l'interrupteur côté serveur. */
        Object.defineProperty(win.navigator, 'serviceWorker', { value: { register: async () => ({}) } });
        win.PushManager = function () {};
        win.Notification = { permission: 'default' };
        try { win.sessionStorage.setItem('pmViewCode', CODE); } catch(e) {}
      } });
    const w = dom.window;
    await dodo(900);
    return { w, M, erreurs, appelsMiroir, appelsGas };
  }

  const baseKV = async () => ({
    acces: JSON.stringify({ indisposYear:2027, indisposOuverte:false, users:[
      { h: await sha(CODE), role:'mar', id:'ALPHA', name:'ALPHA', initials:'AL', prenom:'Test' }]}),
    annees: JSON.stringify({ success:true, active:2027, annees:[{annee:2027, statut:'ACTIF'}] }),
    planning_2027: JSON.stringify(planning),
    echanges: JSON.stringify({ success:true, echanges:[demande] }),
  });
  /* La matière : ALPHA (moi) tient la garde du 09/03 et le 18 h du 11/03 ; BRAVO
     la garde du 12/03 ; CHARLI un 18 h le 10/03 (jour de vacances d'ALPHA). */
  const plan2 = JSON.parse(JSON.stringify(planning));
  plan2.months[0].doctors = [
    { id:'ALPHA',  days: st(['','G','V','18','','']) },
    { id:'BRAVO',  days: st(['','','','G','G','RG']) },
    { id:'CHARLI', days: st(['','','18','','','']) },
  ];
  const O = (o) => Object.assign({ creeLe:'2026-11-24T10:00:00.000Z', annee:2027, date2:'', receveur:'', etat:'attente', reponduLe:'', info:'', offre:'', mode:'', souhait:'' }, o);
  const vitrine = [
    O({ id:'B1', type:'bourse',   date:'2027-03-12', demandeur:'BRAVO',  mode:'don' }),
    O({ id:'B2', type:'bourse18', date:'2027-03-10', demandeur:'CHARLI', mode:'deux' }),
    O({ id:'B3', type:'bourse',   date:'2027-03-11', demandeur:'BRAVO',  mode:'echange', souhait:'un jour de semaine' }),
    O({ id:'B4', type:'bourse',   date:'2027-03-09', demandeur:'ALPHA',  mode:'deux' }),
    O({ id:'E5', type:'echange',  date:'2027-03-12', date2:'2027-03-09', demandeur:'BRAVO', receveur:'ALPHA', offre:'B4' }),
    O({ id:'B6', type:'bourse',   date:'2027-03-13', demandeur:'CHARLI', mode:'don', etat:'acceptee', info:'Prise par BRAVO' }),
    O({ id:'E7', type:'echange',  date:'2027-03-13', date2:'2027-03-11', demandeur:'CHARLI', receveur:'BRAVO', offre:'B3' }),
  ];
  const kvBourse = async () => Object.assign(await baseKV(), {
    notif_config: JSON.stringify({ ouvert:true, pilotes:[] }),
    planning_2027: JSON.stringify(plan2),
    echanges: JSON.stringify({ success:true, echanges:vitrine }),
  });
  const login = c => c.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : null;

  console.log('\n═══ 1. Le relais : la vitrine pour tous, le reste à ses seuls acteurs ═══');
  {
    const w = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
    w.globalThis = w; vm.runInContext(src, w);
    const brut = { success:true, echanges:vitrine };
    const vus = id => w.filtreEchanges(brut, id).echanges.map(e => e.id).sort();
    V('un MAR étranger à tout voit les offres en vitrine, et seulement elles', JSON.stringify(vus('DELTA')) === JSON.stringify(['B1','B2','B3','B4']), vus('DELTA'));
    V('ALPHA voit la vitrine et l\'échange proposé sur SON offre', JSON.stringify(vus('ALPHA')) === JSON.stringify(['B1','B2','B3','B4','E5']), vus('ALPHA'));
    V('une offre conclue ne se voit plus que de son donneur', vus('CHARLI').indexOf('B6') > -1 && vus('DELTA').indexOf('B6') === -1);
    V('l\'échange proposé par CHARLI à BRAVO reste entre eux', vus('ALPHA').indexOf('E7') === -1 && vus('BRAVO').indexOf('E7') > -1);
  }

  console.log('\n═══ 2. La tuile et l\'écran ═══');
  {
    const { w, erreurs } = await monterPage(await kvBourse(), c => login(c) || { success:true });
    const d = w.document;
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    V('la tuile : « 1 échange attend votre choix », en rouge', /^1 échange attend votre choix/.test(d.getElementById('echHeroMain').textContent) && d.getElementById('echangesHero').classList.contains('attente'));
    V('la pastille compte les 3 offres des collègues + l\'échange reçu', d.getElementById('echPastille').textContent === '4', d.getElementById('echPastille').textContent);
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    const h = d.getElementById('echList').innerHTML;
    const iO = h.indexOf('<h3>Offres</h3>'), iM = h.indexOf('<h3>Mes offres</h3>');
    V('le titre de l\'écran : « Bourse aux gardes »', d.querySelector('#echangesView h2').textContent === 'Bourse aux gardes');
    V('« Offres » : les 3 offres des collègues, triées par date (10, 11, 12)', iO > -1 && h.indexOf("bxPrendre('B2'") > iO && h.indexOf("bxProposer('B3'") > h.indexOf("bxPrendre('B2'") && h.indexOf("bxPrendre('B1'") > h.indexOf("bxProposer('B3'") && h.indexOf("bxPrendre('B1'") < iM, [h.indexOf("bxPrendre('B2'"), h.indexOf("bxProposer('B3'"), h.indexOf("bxPrendre('B1'")]);
    V('don seul : « Je la prends », pas d\'échange', /bxPrendre\('B1'/.test(h) && !/bxProposer\('B1'/.test(h));
    V('échange seul : pas de « Je la prends », la préférence affichée', !/bxPrendre\('B3'/.test(h) && /Souhaite en échange : un jour de semaine/.test(h));
    V('les deux : « Je le prends » (18 h) et « Échanger »', /bxPrendre\('B2'[^>]*>Je le prends/.test(h) && /bxProposer\('B2'[^>]*>Échanger/.test(h));
    const carteB2 = h.slice(h.lastIndexOf('<div class="ech-card">', h.indexOf("bxPrendre('B2'")), h.indexOf("bxPrendre('B2'"));
    V('mon statut du jour est dit sur la carte (en vacances le 10/03)', /Vous êtes noté en vacances ce jour/.test(carteB2), carteB2.slice(0, 600));
    V('« Mes offres » : mon offre, l\'échange reçu et « Choisir cet échange »', iM > -1 && /repondreEch\('E5','accepter'/.test(h.slice(iM)) && /Choisir cet échange/.test(h.slice(iM)) && /bxRetirer\('B4'/.test(h.slice(iM)));
    V('l\'offre conclue d\'un autre n\'apparaît pas', !/B6/.test(h));
  }

  console.log('\n═══ 3. Prendre : la question dans la feuille, puis la confirmation ═══');
  {
    const appels = [];
    const { w } = await monterPage(await kvBourse(), c => login(c) || (c.action === 'prendreBourse'
      ? (appels.push(c), c.accepteAbsence === true ? { success:true, etat:'acceptee', don:'E9' } : { success:false, error:'[ABS] Attention, vous êtes noté en vacances le 10/03/2027. Vous confirmez ?' })
      : { success:true }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    d.querySelector("[onclick^=\"bxPrendre('B2'\"]").click(); await dodo(50);
    const v = d.getElementById('echVoile');
    V('une feuille demande confirmation, rien n\'est parti', !!v && /Prendre ce 18 h/.test(v.textContent) && appels.length === 0);
    d.getElementById('bxOui').click(); await dodo(300);
    const m = d.getElementById('bxMsg');
    V('prendreBourse part avec l\'identifiant de l\'offre', appels.length === 1 && appels[0].id === 'B2' && appels[0].year === 2027, appels);
    V('la question s\'affiche dans la feuille, sans le préfixe', m.style.display === 'block' && /^Attention, vous êtes noté en vacances/.test(m.textContent), m.textContent);
    V('le bouton devient « Je confirme »', d.getElementById('bxOui').textContent === 'Je confirme');
    d.getElementById('bxOui').click(); await dodo(300);
    V('la confirmation repart avec accepteAbsence', appels.length === 2 && appels[1].accepteAbsence === true, appels);
    const h = d.getElementById('echList').innerHTML;
    V('la feuille se ferme, « C\'est fait » s\'affiche', !d.getElementById('echVoile') && /C'est fait/.test(h.replace(/&#39;/g, "'")));
    V('l\'offre quitte « Offres » et passe dans « Conclues »', !/bxPrendre\('B2'/.test(h) && /Conclues <i>1<\/i>/.test(h), h.slice(0, 300));
  }

  console.log('\n═══ 4. Proposer un échange sur une offre ═══');
  {
    const envois = [];
    const { w } = await monterPage(await kvBourse(), c => login(c) || (c.action === 'creerEchange'
      ? (envois.push(c), c.accepteRea1 === true ? { success:true, id:'E10', type:c.type } : { success:false, error:'[REA1] Attention, la garde du 11/03/2027 tombe dans votre semaine Réa 1. Vous confirmez ?' })
      : { success:true }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    await w.bxProposer('B3'); await dodo(200);
    let v = d.getElementById('echVoile');
    const lignes = v ? [...v.querySelectorAll('[data-valeur]')].map(b => b.getAttribute('data-valeur')) : [];
    V('le choix ne montre que mes GARDES (le 09/03), jamais mon 18 h', JSON.stringify(lignes) === JSON.stringify(['2027-03-09']), lignes);
    v.querySelector('[data-valeur]').click(); await dodo(100);
    V('une feuille récapitule l\'échange', /Proposer cet échange/.test(d.getElementById('echVoile').textContent) && /09\/03/.test(d.getElementById('echVoile').textContent));
    d.getElementById('bxOui').click(); await dodo(300);
    V('creerEchange part lié à l\'offre : ma garde contre la sienne', envois.length === 1 && envois[0].type === 'echange' && envois[0].date === '2027-03-09' && envois[0].date2 === '2027-03-11' && envois[0].receveur === 'BRAVO' && envois[0].offre === 'B3', envois);
    V('la question Réa 1 s\'affiche dans la feuille', /semaine Réa 1/.test(d.getElementById('bxMsg').textContent));
    d.getElementById('bxOui').click(); await dodo(300);
    V('la confirmation repart avec accepteRea1', envois.length === 2 && envois[1].accepteRea1 === true, envois);
    const h = d.getElementById('echList').innerHTML;
    V('la carte dit « Vous avez proposé » et offre « Annuler ma proposition »', /Vous avez proposé votre garde du <b>09\/03<\/b>/.test(h) && /annulerEch\('E10'/.test(h), h.slice(0, 200));
    await w.bxProposer('B2'); await dodo(200);
    v = d.getElementById('echVoile');
    const l18 = v ? [...v.querySelectorAll('[data-valeur]')].map(b => b.getAttribute('data-valeur')) : [];
    V('sur un 18 h : seulement mes 18 h (le 11/03)', JSON.stringify(l18) === JSON.stringify(['2027-03-11']), l18);
  }

  console.log('\n═══ 5. Choisir un échange reçu, retirer son offre ═══');
  {
    const appels = [];
    const { w } = await monterPage(await kvBourse(), c => login(c) || (appels.push(c),
      c.action === 'repondreEchange' ? { success:true, etat:'acceptee' } : { success:true, etat:'annulee' }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    d.querySelector("[onclick^=\"repondreEch('E5'\"]").click(); await dodo(400);
    V('choisir : repondreEchange part (accepter) avec l\'identifiant de l\'échange', appels.some(c => c.action === 'repondreEchange' && c.id === 'E5' && c.reponse === 'accepter'), appels);
    V('la tuile s\'éteint (plus rien n\'attend mon choix)', !d.getElementById('echangesHero').classList.contains('attente'));
    const { w: w2 } = await monterPage(await kvBourse(), c => login(c) || (appels.push(c), { success:true, etat:'annulee' }));
    w2.location.hash = '#echanges'; w2.route(); await dodo(400);
    w2.bxRetirer('B4'); await dodo(50);
    w2.document.getElementById('bxOui').click(); await dodo(300);
    V('retirer : retirerBourse part avec l\'identifiant', appels.some(c => c.action === 'retirerBourse' && c.id === 'B4'), appels.slice(-1));
    const h = w2.document.getElementById('echList').innerHTML;
    V('l\'offre et l\'échange reçu quittent l\'écran', !/bxRetirer\('B4'/.test(h) && !/repondreEch\('E5'/.test(h) && /Offre retirée/.test(h));
  }

  console.log('\n═══ 6. Déposer un 18 h : l\'inversion avec le MAR de garde reste possible ═══');
  {
    const envois = [];
    const kv = await kvBourse();
    kv.echanges = JSON.stringify({ success:true, echanges:[] });
    const p = JSON.parse(JSON.stringify(plan2)); p.months[0].doctors[1].days = st(['','','','G','','']);   // BRAVO de garde le 11/03
    kv.planning_2027 = JSON.stringify(p);
    const { w } = await monterPage(kv, c => login(c) || (envois.push(c), { success:true, id:'E11', type:'inversion' }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    await w.echOuvrirProposition(); await dodo(300);
    V('une garde choisie : pas de bouton d\'inversion', d.getElementById('bxInversion').innerHTML === '');
    const sel = d.getElementById('echSelGarde');
    sel.value = [...sel.options].findIndex(o => /11\/03/.test(o.textContent)); await w.bxMajDepot(); await dodo(50);
    const b = d.querySelector('#bxInversion button');
    V('mon 18 h choisi : « Inverser avec le Dr Bravo, de garde ce jour »', !!b && /Inverser avec le Dr Bravo/.test(b.textContent), b && b.textContent);
    b.click(); await dodo(50); d.getElementById('bxOui').click(); await dodo(300);
    const ce = envois.filter(c => c.action === 'creerEchange');
    V('creerEchange part en don de 18 h avec accepteInversion', ce.length === 1 && ce[0].type === 'don18' && ce[0].receveur === 'BRAVO' && ce[0].accepteInversion === true && ce[0].date === '2027-03-11', ce);
  }


  console.log('\n═══ 7. Paire à éviter : la question s\'affiche, la confirmation repart (25/11/2026) ═══');
  {
    const Q = '[COUPLE] Attention, le Dr Delta est de garde le 12/03/2027 : vous seriez tous les deux de sortie cette nuit-là. Vous confirmez ?';
    const appels = [];
    const { w } = await monterPage(await kvBourse(), c => login(c) || (
      c.action === 'prendreBourse' || c.action === 'repondreEchange'
        ? (appels.push(c), c.accepteCouple === true ? { success:true, etat:'acceptee', don:'E12' } : { success:false, error:Q })
        : { success:true }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    w.bxPrendre('B1'); await dodo(50); d.getElementById('bxOui').click(); await dodo(300);
    V('prendre : la question s\'affiche dans la feuille, sans le préfixe', /^Attention, le Dr Delta est de garde/.test(d.getElementById('bxMsg').textContent));
    d.getElementById('bxOui').click(); await dodo(300);
    V('… et repart avec accepteCouple', appels.filter(c => c.action === 'prendreBourse').length === 2 && appels[1].accepteCouple === true, appels);
    const btn = d.querySelector("[onclick^=\"repondreEch('E5'\"]");
    btn.click(); await dodo(400);
    V('choisir un échange : la question s\'affiche sur la carte, le bouton devient « Je confirme »', /^Attention, le Dr Delta/.test(d.getElementById('echMsg-E5').textContent) && btn.textContent === 'Je confirme');
    btn.click(); await dodo(400);
    const rep = appels.filter(c => c.action === 'repondreEchange');
    V('… et repart avec accepteCouple', rep.length === 2 && rep[1].accepteCouple === true && rep[1].id === 'E5', rep);
  }

  console.log('\n═══ 8. Offre réservée à un collègue (27/11/2026) ═══');
  {
    const w0 = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
    w0.globalThis = w0; vm.runInContext(src, w0);
    const res = vitrine.concat([ O({ id:'B20', type:'bourse', date:'2027-03-11', demandeur:'BRAVO', receveur:'ALPHA', mode:'deux' }) ]);
    const vus = id => w0.filtreEchanges({ success:true, echanges:res }, id).echanges.map(e => e.id);
    V('le relais : l\'offre réservée est servie au donneur et au collègue visé', vus('BRAVO').indexOf('B20') > -1 && vus('ALPHA').indexOf('B20') > -1);
    V('… et à personne d\'autre', vus('DELTA').indexOf('B20') === -1 && vus('CHARLI').indexOf('B20') === -1, vus('DELTA'));
    V('contre-épreuve : les offres ouvertes restent servies à tous', ['B1','B2','B3'].every(x => vus('DELTA').indexOf(x) > -1));

    const kv = await kvBourse();
    kv.echanges = JSON.stringify({ success:true, echanges:res.concat([ O({ id:'B21', type:'bourse', date:'2027-03-12', demandeur:'CHARLI', receveur:'DELTA', mode:'don' }) ]) });
    const appels = [];
    const { w, erreurs } = await monterPage(kv, c => login(c) || (appels.push(c), { success:true, etat:'refusee' }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    const h = d.getElementById('echList').innerHTML;
    const iR = h.indexOf('<h3>Réservées pour vous</h3>'), iO = h.indexOf('<h3>Offres</h3>');
    V('« Réservées pour vous » s\'affiche avant les offres, avec l\'offre de BRAVO', iR > -1 && iR < iO && h.indexOf("bxPrendre('B20'") > iR && h.indexOf("bxPrendre('B20'") < iO, [iR, iO]);
    V('la carte dit « Réservée pour vous par Dr Bravo » et propose « Décliner »', /Réservée pour vous par <strong>Dr Bravo/.test(h) && /bxDecliner\('B20'/.test(h));
    V('une offre réservée à un autre n\'apparaît jamais, même si elle arrivait', !/B21/.test(h));
    V('les offres ouvertes n\'ont pas de « Décliner »', !/bxDecliner\('B1'/.test(h));
    V('la pastille compte l\'offre réservée, pas celle d\'un autre (3 + 1 + 1 échange reçu)', d.getElementById('echPastille').textContent === '5', d.getElementById('echPastille').textContent);
    w.bxDecliner('B20'); await dodo(50);
    d.getElementById('bxOui').click(); await dodo(300);
    V('décliner : declinerBourse part avec l\'identifiant', appels.some(c => c.action === 'declinerBourse' && c.id === 'B20'), appels.slice(-1));
    const h2 = d.getElementById('echList').innerHTML;
    V('l\'offre quitte l\'écran, « Offre déclinée » s\'affiche', !/bxPrendre\('B20'/.test(h2) && /Offre déclinée/.test(h2));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }
  {
    // Côté donneur : déposer en réservant, puis la carte « Réservée au Dr … »
    const envois = [];
    const kv = await kvBourse();
    kv.echanges = JSON.stringify({ success:true, echanges:[] });
    const { w } = await monterPage(kv, c => login(c) || (envois.push(c), { success:true, id:'B30', type:'bourse', mode:c.mode, reserve:c.reserve || '' }));
    const d = w.document;
    w.location.hash = '#echanges'; w.route(); await dodo(400);
    await w.echOuvrirProposition(); await dodo(300);
    const sel = d.getElementById('bxReserve');
    const opts = sel ? [...sel.options].map(o => o.value) : [];
    V('« Pour qui ? » : tous les MAR par défaut, puis les collègues du planning (sans moi)', opts[0] === '' && opts.indexOf('BRAVO') > -1 && opts.indexOf('CHARLI') > -1 && opts.indexOf('ALPHA') === -1, opts);
    V('par défaut : « Mettre en vitrine », tous prévenus', d.getElementById('echEnvoyer').textContent === 'Mettre en vitrine' && /Tous les MAR verront/.test(d.getElementById('bxInfoDepot').textContent));
    sel.value = 'BRAVO'; w.bxMajReserve();
    V('Bravo choisi : « La lui réserver », seul lui verra l\'offre', d.getElementById('echEnvoyer').textContent === 'La lui réserver' && /Seul le Dr Bravo verra/.test(d.getElementById('bxInfoDepot').textContent));
    await w.bxDeposer(d.getElementById('echEnvoyer')); await dodo(300);
    const dep = envois.filter(c => c.action === 'deposerBourse');
    V('deposerBourse part avec reserve: BRAVO', dep.length === 1 && dep[0].reserve === 'BRAVO', dep);
    const h = d.getElementById('echList').innerHTML;
    V('« Mes offres » : la carte dit « Réservée au Dr Bravo »', /Réservée au Dr Bravo/.test(h) && /bxRetirer\('B30'/.test(h), h.slice(0, 300));
    V('le bandeau dit qu\'il est prévenu', /réservée au Dr Bravo, qui est prévenu/.test(h));
  }

  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  if (ko) process.exit(1);
})();
