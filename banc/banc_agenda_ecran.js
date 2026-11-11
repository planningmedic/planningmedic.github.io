/* ═══ BANC — « MES GARDES DANS MON CALENDRIER » (dashboard réel, piloté au clic) ═══
   (11/11/2026) Le vrai index.html servi par le VRAI Worker : la carte en haut
   de « Mes gardes », la feuille d'abonnement, le lien personnel, la copie et
   le « nouveau lien » en deux appuis. */
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
    const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise, btoa, atob });
    wctx.globalThis = wctx; vm.runInContext(src, wctx);
    const WK = wctx.__W, M = new Map();
    Object.keys(kvInitial).forEach(k => M.set(k, kvInitial[k]));
    const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
      list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
    const env = { KV, PUSH_TOKEN:'JETON' };
    const contenu = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const appelsMiroir = [], appelsGas = []; appelsAgenda.length = 0;
    const fauxFetch = async (url, opt) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        const chemin = u.replace(/^https:\/\/[^/]+/, '');
        if (chemin === '/agenda-lien') { try { appelsAgenda.push(JSON.parse(opt.body)); } catch(e) {} }
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
    return { w, M, erreurs, appelsMiroir, appelsGas, dom };
  }

  const baseKV = async () => ({
    acces: JSON.stringify({ indisposYear:2027, indisposOuverte:false, users:[
      { h: await sha(CODE), role:'mar', id:'ALPHA', name:'ALPHA', initials:'AL', prenom:'Test' }]}),
    annees: JSON.stringify({ success:true, active:2027, annees:[{annee:2027, statut:'ACTIF'}] }),
    planning_2027: JSON.stringify(planning),
    echanges: JSON.stringify({ success:true, echanges:[demande] }),
  });


  const appelsAgenda = [];
  const kv = {
    acces: JSON.stringify({ indisposYear:2027, indisposOuverte:false, users:[
      { h: await sha(CODE), role:'mar', id:'ALPHA', name:'ALPHA', initials:'AL', prenom:'Test' }]}),
    annees: JSON.stringify({ success:true, active:2027, annees:[{annee:2027, statut:'ACTIF'}] }),
    planning_2027: JSON.stringify(planning),
  };
  const surGas = (charge) => charge.action === 'login' ? { success:true, role:'mar', id:'ALPHA', year:2027 } : { success:true };

  console.log('\n═══ Agenda : la carte, la feuille, le lien ═══');
  const { w, M, erreurs } = await monterPage(kv, surGas, true);
  const d = w.document;
  V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  w.openMesGardes(); await dodo(50);
  const carte = d.getElementById('agCarte');
  V('« Mes gardes » montre la carte « Mes gardes dans mon calendrier »', carte && /Mes gardes dans mon calendrier/.test(carte.textContent));
  V('aucun lien n\'est demandé tant que la carte n\'est pas touchée', appelsAgenda.length === 0);
  V('la feuille est fermée au départ', d.getElementById('agFeuille').style.display === 'none');
  carte.click(); await dodo(300);
  V('un appui ouvre la feuille', d.getElementById('agFeuille').style.display === 'block' && d.getElementById('agVoile').style.display === 'block');
  V('le lien est demandé avec le code du MAR, sans « nouveau »', appelsAgenda.length === 1 && appelsAgenda[0].code === CODE && !appelsAgenda[0].nouveau, appelsAgenda);
  const jeton1 = M.get('agu_ALPHA');
  V('le relais a bien créé SON lien', /^[A-Za-z0-9_-]{32}$/.test(jeton1 || ''));
  V('les boutons deviennent actifs une fois le lien prêt', !d.getElementById('agCopier').disabled && !d.getElementById('agAbonner').disabled);
  d.getElementById('agCopier').click(); await dodo(50);
  const lien = d.getElementById('agLien');
  V('copier affiche le lien complet en https', lien.style.display === 'block' && lien.value === 'https://miroir.planningmedic.workers.dev/agenda/' + jeton1 + '.ics', lien.value);
  // Fermer puis rouvrir : pas de nouvel appel, même lien.
  d.getElementById('agVoile').click(); await dodo(30);
  V('toucher en dehors ferme la feuille', d.getElementById('agFeuille').style.display === 'none');
  carte.click(); await dodo(100);
  V('rouvrir ne redemande pas le lien', appelsAgenda.length === 1);
  // Nouveau lien : deux appuis.
  const bn = d.getElementById('agNouveau');
  bn.click(); await dodo(100);
  V('« nouveau lien » : le 1er appui demande confirmation, rien n\'est envoyé', appelsAgenda.length === 1 && /Appuyez encore/.test(bn.textContent));
  bn.click(); await dodo(300);
  V('le 2e appui demande un nouveau lien', appelsAgenda.length === 2 && appelsAgenda[1].nouveau === true);
  V('le lien a changé au relais, l\'ancien est effacé', M.get('agu_ALPHA') && M.get('agu_ALPHA') !== jeton1 && [...M.keys()].filter(k => k.startsWith('agj_') && M.get(k) === 'ALPHA').length === 1);
  V('le MAR est prévenu que l\'ancien lien ne marche plus', /ancien ne fonctionne plus/.test(d.getElementById('agMsg').textContent));

  console.log(`\n${ok} OK · ${ko} en échec`);
  if (ko) process.exit(1);
  process.exit(0);
})();
