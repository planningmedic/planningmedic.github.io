/* ═══ BANC — L'ÉCRAN « MES ÉCHANGES » (dashboard réel, piloté au clic) ═══
   Le vrai index.html dans un navigateur simulé, servi par le VRAI
   Worker (interrupteur compris). Trois vérités d'écran :
   1. interrupteur fermé → RIEN n'apparaît (l'invisibilité est côté serveur) ;
   2. pilote → carte avec compteur, liste, Accepter qui écrit et se met à jour ;
   3. proposer → le bon verbe part au serveur avec les bonnes valeurs.
   La clé `echanges` voyage dans l'appel d'OUVERTURE : le banc vérifie
   aussi qu'aucune requête miroir supplémentaire n'est payée au chargement. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n═══ 0. Chaque icône demandée par les pages existe dans le fichier maison ═══');
  {
    /* Défaut trouvé en production le 14/08 : data-lucide="repeat" (et "bell",
       et "plus") demandés par index.html, ABSENTS du mini-bundle local —
       carré vide, sans erreur, exactement comme l'avertissement du fichier
       le prédit. Ce garde-fou rend la récidive impossible : tout nouveau nom
       d'icône doit être ajouté au bundle DANS LE MÊME push. */
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'assets', 'vendor', 'lucide-icons.js'), 'utf8');
    for (const page of ['index.html', 'planning.html', 'admin.html', 'staff.html', 'indispos.html', 'absences.html']) {
      let html = '';
      try { html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8'); } catch (e) { continue; }
      if (!/lucide-icons\.js/.test(html)) continue;   // la page n'utilise pas le bundle
      const demandes = [...new Set([...html.matchAll(/data-lucide="([a-z0-9-]+)"/g)].map(m => m[1]))];
      const absentes = demandes.filter(n => bundle.indexOf('"' + n + '":[') === -1);
      V(page + ' : ' + demandes.length + ' icône(s), toutes présentes dans le bundle', absentes.length === 0, absentes);
    }
  }

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

  console.log('\n═══ 1. Interrupteur FERMÉ : le dashboard d\'un MAR ne montre RIEN ═══');
  {
    const { w, erreurs, appelsMiroir } = await monterPage(await baseKV(), null); // pas de notif_config → fermé
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    const hero = w.document.getElementById('echangesHero');
    V('la carte « Mes échanges » est INVISIBLE', hero && hero.style.display === 'none');
    V('la carte « Activer les notifications » aussi (même interrupteur)',
      w.document.getElementById('notifCard').style.display === 'none');
    V('la clé a bien été demandée dans l\'appel d\'ouverture (et refusée)',
      appelsMiroir.some(k => Array.isArray(k) && k.indexOf('echanges') > -1), appelsMiroir);
    V('AUCUNE requête miroir dédiée aux échanges (elle voyage avec le reste)',
      !appelsMiroir.some(k => Array.isArray(k) && k.length === 1 && k[0] === 'echanges'), appelsMiroir);
  }

  console.log('\n═══ 2. PILOTE : carte, compteur, liste — et Accepter écrit puis rafraîchit ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:false, pilotes:['ALPHA','BRAVO'] });
    const surGas = (charge, M) => {
      if (charge.action === 'repondreEchange') {
        /* (14/08/2026 — vu en test réel) La copie rapide reste VOLONTAIREMENT
           en retard : la propagation peut prendre quelques secondes en vrai,
           et l'écran affichait « EN ATTENTE » sur une demande acceptée.
           L'écran doit croire la réponse du serveur, pas la relecture. */
        return { success:true, etat:'acceptee' };
      }
      if (charge.action === 'login') return { success:true, role:'mar', id:'ALPHA', year:2027 };
      return { success:true };
    };
    const { w, erreurs, appelsGas } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    const hero = w.document.getElementById('echangesHero');
    V('la carte est VISIBLE pour le pilote', hero && hero.style.display !== 'none');
    /* (17/08/2026) Ce test exigeait l'inverse : la carte DEVAIT se montrer au
       pilote, quel que soit l'appareil. Le harnais simule un ordinateur — et
       c'est précisément là qu'elle ne doit plus se proposer. Le cas du téléphone
       est repris au bloc 5. */
    V('sur ordinateur, la carte « Activer les notifications » reste cachée',
      w.document.getElementById('notifCard').style.display === 'none');
    V('le compteur annonce la demande en attente', /1 demande attend/.test(w.document.getElementById('echHeroMain').textContent));

    w.location.hash = '#echanges';
    w.route();
    await dodo(400);
    V('la vue s\'ouvre', w.document.getElementById('echangesView').style.display === 'block');
    const liste = w.document.getElementById('echList').innerHTML;
    V('la demande est affichée — don, les deux noms, la date', /Don de garde/.test(liste) && /Bravo/.test(liste) && /Alpha/.test(liste) && /12\/03\/2027/.test(liste), liste.slice(0,200));
    V('le délai d\'expiration est annoncé', /Expire dans \d+ h/.test(liste));
    const btn = [...w.document.querySelectorAll('.ech-accepter')][0];
    V('le receveur a son bouton Accepter', !!btn);

    btn.click();
    await dodo(500);
    const gas = appelsGas.find(c => c.action === 'repondreEchange');
    V('le verbe part au serveur avec l\'identifiant et la réponse', !!gas && gas.id === 'E1' && gas.reponse === 'accepter', gas);
    const apres = w.document.getElementById('echList').innerHTML;
    V('l\'écran passe à Acceptée MALGRÉ la copie rapide en retard (défaut du 14/08)', /Acceptée/.test(apres) && !/ech-accepter/.test(apres), apres.slice(0,200));
    V('le compteur de la carte s\'éteint', /Mes échanges/.test(w.document.getElementById('echHeroMain').textContent));
  }

  console.log('\n═══ 3. PROPOSER : le panneau construit le bon verbe, avec les bonnes valeurs ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[] });
    let cree = null;
    const surGas = (charge, M) => {
      if (charge.action === 'creerEchange') {
        cree = charge;
        // Miroir volontairement en retard : la demande doit apparaître depuis la réponse.
        return { success:true, id:'E2' };
      }
      if (charge.action === 'login') return { success:true, role:'mar', id:'ALPHA', year:2027 };
      return { success:true };
    };
    const { w, erreurs } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    V('le bouton Proposer est là (rôle MAR)', w.document.getElementById('echProposerBtn').style.display !== 'none');
    await w.echOuvrirProposition();
    await dodo(300);
    const selGarde = w.document.getElementById('echSelGarde');
    V('mes gardes à venir sont proposées (celle du 09/03/2027)', selGarde && /09\/03\/2027/.test(selGarde.innerHTML), selGarde && selGarde.innerHTML.slice(0,150));
    const selQui = w.document.getElementById('echSelQui');
    V('les collègues sont proposés, moi exclu', /BRAVO/.test(selQui.innerHTML) && !/>Dr Alpha</.test(selQui.innerHTML));
    selQui.value = 'BRAVO';
    await w.echMajProposition();
    w.document.getElementById('echEnvoyer').click();
    await dodo(500);
    V('creerEchange part avec type, année, date et receveur exacts',
      !!cree && cree.type === 'don' && cree.year === 2027 && cree.date === '2027-03-09' && cree.receveur === 'BRAVO', cree);
    V('la nouvelle demande apparaît MALGRÉ la copie rapide en retard', /Don de garde/.test(w.document.getElementById('echList').innerHTML));
    V('le panneau se referme', w.document.getElementById('echProposition').style.display === 'none');
  }

  console.log('\n═══ 4. Noté en vacances : l\'écran pose la question, la confirmation repart (11/11/2026) ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    const reponses = [];
    const surGas = (charge) => {
      if (charge.action === 'repondreEchange') {
        reponses.push(charge);
        return charge.accepteAbsence === true ? { success:true, etat:'acceptee' }
          : { success:false, error:'[ABS] Attention, vous êtes noté en vacances le 12/03/2027. Vous confirmez ? Ce jour sera effacé et remplacé par la garde ou son repos.' };
      }
      if (charge.action === 'login') return { success:true, role:'mar', id:'ALPHA', year:2027 };
      return { success:true };
    };
    const { w, erreurs } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    const btn = [...w.document.querySelectorAll('.ech-accepter')][0];
    btn.click();
    await dodo(500);
    const msg = w.document.getElementById('echMsg-E1');
    V('la question s\'affiche, sans le préfixe technique', msg.style.display === 'block' && /^Attention, vous êtes noté en vacances le 12\/03\/2027\. Vous confirmez \?/.test(msg.textContent), msg.textContent);
    V('le bouton devient « Confirmer : je prends cette garde »', /Confirmer : je prends cette garde/.test(btn.textContent) && !btn.disabled, btn.textContent);
    V('la première réponse est partie SANS l\'accord', reponses.length === 1 && reponses[0].accepteAbsence !== true, reponses);
    btn.click();
    await dodo(500);
    V('la confirmation repart AVEC l\'accord', reponses.length === 2 && reponses[1].accepteAbsence === true && reponses[1].reponse === 'accepter', reponses);
    V('l\'écran passe à Acceptée', /Acceptée/.test(w.document.getElementById('echList').innerHTML));
  }

  console.log('\n═══ 3 bis. Proposer relit le planning du moment, jamais la copie gardée en mémoire (11/11/2026) ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[] });
    const { w, M, erreurs } = await monterPage(kv, (c) => c.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : { success:true });
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    // Pendant que l'appli est ouverte, un échange a lieu : ALPHA n'a plus le 09/03, il a le 11/03.
    const neuf = JSON.parse(JSON.stringify(planning));
    neuf.months[0].doctors[0].days = st(['','','','G','RG','']);
    M.set('planning_2027', JSON.stringify(neuf));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    await w.echOuvrirProposition();
    await dodo(300);
    const sel = w.document.getElementById('echSelGarde');
    V('la garde reçue entre-temps est proposée (11/03)', sel && /11\/03\/2027/.test(sel.innerHTML), sel && sel.innerHTML.slice(0,200));
    V('CONTRE-PREUVE : la garde partie (09/03) n\'est plus proposée', sel && !/09\/03\/2027/.test(sel.innerHTML), sel && sel.innerHTML.slice(0,200));
  }
  V('planning.html : au retour dans l\'appli, le planning se relit après 2 minutes (plus 15)',
    /if \(Date\.now\(\) - _lastFetch < 2\*60\*1000\) return;/.test(fs.readFileSync(path.join(__dirname, '..', 'planning.html'), 'utf8')));

  console.log('\n═══ 4 bis. Annuler sa proposition : deux touches, puis « Annulée » (11/11/2026) ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[Object.assign({}, demande, { id:'E9', demandeur:'ALPHA', receveur:'BRAVO' })] });
    const appels = [];
    const surGas = (charge) => {
      if (charge.action === 'annulerEchange') { appels.push(charge); return { success:true, etat:'annulee' }; }
      if (charge.action === 'login') return { success:true, role:'mar', id:'ALPHA', year:2027 };
      return { success:true };
    };
    const { w, erreurs } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    const btn = w.document.querySelector('.ech-annuler');
    V('le demandeur voit « Annuler ma proposition » (et pas Accepter)', !!btn && /Annuler ma proposition/.test(btn.textContent) && !w.document.querySelector('.ech-accepter'));
    btn.click(); await dodo(200);
    V('première touche : on demande confirmation, rien ne part', /Confirmer l'annulation/.test(btn.textContent) && appels.length === 0, btn.textContent);
    btn.click(); await dodo(500);
    V('seconde touche : annulerEchange part avec l\'identifiant', appels.length === 1 && appels[0].id === 'E9', appels);
    V('l\'écran passe à « Annulée »', /Annulée/.test(w.document.getElementById('echList').innerHTML) && !w.document.querySelector('.ech-annuler'));
  }
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    const { w } = await monterPage(kv, (c) => c.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : { success:true });
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    V('le receveur, lui, n\'a pas de bouton Annuler', !w.document.querySelector('.ech-annuler') && !!w.document.querySelector('.ech-accepter'));
  }

  console.log('\n═══ 4 sexies. « Sans objet » : libellé, motif, plus aucun bouton (12/11/2026) ═══');
  {
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[
      Object.assign({}, demande, { id:'E20', demandeur:'BRAVO', receveur:'ALPHA', etat:'sansobjet', reponduLe:'2026-11-12T08:00:00.000Z', info:'Le Dr Bravo n\'a plus la garde du 12/01/2027' }),
      Object.assign({}, demande, { id:'E21', demandeur:'BRAVO', receveur:'ALPHA' }) ] });
    const surGas = (charge) => {
      if (charge.action === 'repondreEchange') return { success:true, etat:'sansobjet', error:'La garde du 12/01/2027 est déjà passée' };
      if (charge.action === 'login') return { success:true, role:'mar', id:'ALPHA', year:2027 };
      return { success:true };
    };
    const { w, erreurs } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    const html = () => w.document.getElementById('echList').innerHTML;
    V('une demande fermée s\'affiche « Sans objet », jamais le mot interne', /Sans objet/.test(html()) && !/>sansobjet</.test(html()), html().slice(0, 300));
    V('…avec son motif en clair', /Motif : Le Dr Bravo n'a plus la garde/.test(html().replace(/&#39;|&#x27;/g, "'")));
    V('…et sans bouton : un seul « Accepter » à l\'écran, celui de la demande en attente', w.document.querySelectorAll('.ech-accepter').length === 1);
    w.document.querySelector('.ech-accepter').click(); await dodo(500);
    V('acceptée trop tard : la carte passe à « Sans objet » avec le motif rendu par le serveur',
      w.document.querySelectorAll('.ech-etat.sansobjet').length === 2 && /déjà passée/.test(html()) && !w.document.querySelector('.ech-accepter'), html().slice(0, 400));
  }

  console.log('\n═══ 4 quinquies. Chacun ne voit que SES échanges (11/11/2026) ═══');
  {
    /* Décision d'Arthur : les échanges des autres ne regardent personne.
       Le serveur filtre (la liste entière partait sur chaque téléphone) et
       le bouton « Tout voir » disparaît pour un MAR. */
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[
      demande,
      Object.assign({}, demande, { id:'E7', demandeur:'CHARLI', receveur:'DELTA' }),
      Object.assign({}, demande, { id:'E8', demandeur:'ALPHA', receveur:'DELTA', etat:'refusee' }) ] });
    const { w } = await monterPage(kv, (c) => c.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : { success:true });
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    const cartes = () => w.document.querySelectorAll('.ech-card').length;
    const html = () => w.document.getElementById('echList').innerHTML;
    V('ALPHA voit ses 2 demandes, pas celle de CHARLI ↔ DELTA', cartes() === 2 && !/Charli/.test(html()), cartes());
    V('« Tout voir » est caché pour un MAR', w.document.getElementById('echFiltres').style.display === 'none');
    w.echFiltrer(true); await dodo(50);
    V('même « Tout voir » forcé : rien des autres (le serveur ne l\'a pas envoyé)', cartes() === 2 && !/Charli/.test(html()), cartes());
  }
  {
    /* Le filtre du Worker en direct : un MAR, puis l'admin. */
    const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
    wctx.globalThis = wctx; vm.runInContext(src, wctx);
    const WK = wctx.__W, M = new Map();
    const tous = [demande, Object.assign({}, demande, { id:'E7', demandeur:'CHARLI', receveur:'DELTA' })];
    M.set('acces', JSON.stringify({ indisposYear:2027, indisposOuverte:false, users:[
      { h: await sha(CODE), role:'mar', id:'ALPHA', name:'ALPHA', initials:'AL' },
      { h: await sha('ADMINBANC9'), role:'admin', id:'ADMIN', name:'ADMIN', initials:'AD' }]}));
    M.set('notif_config', JSON.stringify({ ouvert:true, pilotes:[] }));
    M.set('echanges', JSON.stringify({ success:true, echanges: tous }));
    const env = { KV:{ get: async k => (M.has(k)?M.get(k):null), put: async ()=>{}, delete: async ()=>{}, list: async ()=>({keys:[]}) }, PUSH_TOKEN:'JETON' };
    const lire = async code => (await (await WK.fetch(new Request('https://worker/read', { method:'POST', body: JSON.stringify({ code, keys:['echanges'] }) }), env)).json());
    const rm = await lire(CODE), ra = await lire('ADMINBANC9');
    const lm = (rm.data && rm.data.echanges && rm.data.echanges.echanges) || [];
    const la = (ra.data && ra.data.echanges && ra.data.echanges.echanges) || [];
    V('Worker : un MAR reçoit 1 demande sur 2 (la sienne)', lm.length === 1 && lm[0].id === 'E1' && rm.data.echanges.success === true, rm);
    V('Worker : l\'admin reçoit les 2', la.length === 2, ra);
  }

  console.log('\n═══ 4 ter. Un arrivant en cours d\'année est proposé comme receveur (11/11/2026) ═══');
  {
    /* Vu en réel : un MAR arrivé au 01/11 manquait à la liste « À » — elle ne
       lisait que le 1er mois du planning. CHARLI n'existe qu'au 2e mois. */
    const kv = await baseKV();
    kv.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    kv.echanges = JSON.stringify({ success:true, echanges:[] });
    const jours2 = ['2027-04-05','2027-04-06','2027-04-07'];
    const st2 = arr => jours2.map((d,i)=>({ status: arr[i]||'' }));
    kv.planning_2027 = JSON.stringify({ months: [ planning.months[0], {
      days: jours2.map(d => ({ date: d })),
      doctors: [ { id:'ALPHA', days: st2(['','','']) }, { id:'BRAVO', days: st2(['','','']) },
                 { id:'CHARLI', days: st2(['','G','RG']) } ],
    }] });
    const surGas = (charge) => (charge.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : { success:true });
    const { w, erreurs } = await monterPage(kv, surGas);
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    w.location.hash = '#echanges'; w.route();
    await dodo(400);
    await w.echOuvrirProposition();
    await dodo(300);
    const opts = [...w.document.getElementById('echSelQui').options].map(o => o.value).filter(Boolean);
    V('l\'arrivant (absent du 1er mois) figure dans la liste', opts.indexOf('CHARLI') > -1, opts);
    V('chaque collègue n\'apparaît qu\'une fois, moi exclu',
      opts.length === new Set(opts).size && opts.indexOf('ALPHA') === -1 && opts.indexOf('BRAVO') > -1, opts);
  }

  console.log('\n═══ 5. La carte des notifications : téléphone oui, ordinateur non ═══');
  {
    /* (17/08/2026) Vu par le responsable en se connectant depuis son PC : la carte
       s'affichait, avec un texte écrit en dur « sur ce téléphone ». Elle
       apparaissait partout où le navigateur sait recevoir des notifications —
       donc sur les postes du comité. Or l'annonce n'a d'intérêt que sur le
       téléphone qu'on a sur soi, et sur un poste PARTAGÉ elle s'afficherait
       chez le suivant. */
    const kvA = await baseKV(); kvA.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    const surOrdi = await monterPage(kvA, null, false);
    V('ordinateur : la carte ne se propose pas',
      surOrdi.w.document.getElementById('notifCard').style.display === 'none');

    const kvB = await baseKV(); kvB.notif_config = JSON.stringify({ ouvert:true, pilotes:[] });
    const surTel = await monterPage(kvB, null, true);
    V('téléphone : la carte se propose',
      surTel.w.document.getElementById('notifCard').style.display !== 'none');
    V('et son texte parle bien du téléphone',
      /ce téléphone/.test(surTel.w.document.getElementById('notifEtat').textContent));

    /* L'interrupteur serveur reste maître : fermé, même un téléphone ne voit rien. */
    const ferme = await monterPage(await baseKV(), null, true);
    V('canal fermé : même sur téléphone, rien ne se propose',
      ferme.w.document.getElementById('notifCard').style.display === 'none');
  }

  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  if (ko) process.exit(1);
})();
