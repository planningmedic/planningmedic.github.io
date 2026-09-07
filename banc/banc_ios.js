/* ═══ BANC — LES MÉCANISMES DU MOBILE ═══
   On ne peut pas embarquer Safari dans un test. Mais les pannes de mobile
   vécues les 04-05/08 viennent de trois mécanismes PRÉCIS, et ceux-là se
   reproduisent fidèlement :
     1. l'onglet mis en arrière-plan gèle les minuteurs (requêtes zombies) ;
     2. la fermeture d'onglet (pagehide) doit sauver le travail en vol ;
     3. le cache sert une VIEILLE version de la page contre un serveur à jour.
   Le troisième est le plus sournois : c'est lui qui a fait croire, hier, que
   des correctifs « ne prenaient pas ». */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

async function charger(fichier, options) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(fichier, 'utf8'), {
    runScripts:'dangerously', virtualConsole:vc, pretendToBeVisual:true,
    url:'https://planningmedic.github.io/admin.html',
    beforeParse(win) {
      win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      win.Element.prototype.scrollIntoView = function () {};
      win.HTMLElement.prototype.scrollIntoView = function () {};
      if (options && options.beforeParse) options.beforeParse(win);
    },
  });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  await dodo(450);
  w.eval('ADMIN_CODE = "CODE99"; ADMIN_YEAR = 2027; _batchPending = {}; _batchInFlight = null;');
  return { w, erreurs, dom };
}

(async () => {
  console.log('\n═══ 30. Onglet gelé en arrière-plan (requêtes zombies) ═══');
  {
    /* iOS suspend le fetch ET son minuteur d'abandon ensemble. On reproduit :
       la requête ne répond jamais, et on vérifie que la page ne reste pas
       coincée dessus indéfiniment — c'est la panne des 5 minutes du 05/08. */
    const { w } = await charger('../admin.html');
    let jamaisRepondu = 0;
    w.fetch = (url) => {
      if (String(url).includes('workers.dev')) throw new Error('Failed to fetch');
      jamaisRepondu++;
      return new Promise(() => {});          // suspendue à jamais, comme un onglet gelé
    };
    w.queueOverride('2027-05-03','ALPHA','am','REA','Comité');
    const envoi = w.flushBatch();
    const fini = await Promise.race([envoi.then(() => 'terminé'), dodo(1500).then(() => 'toujours en cours')]);
    V('un envoi suspendu N\'EST PAS abandonné en silence', fini === 'toujours en cours', fini);
    V('le travail reste en mémoire pendant la suspension', Object.keys(w._batchAll()).length === 1);
    V('une seule requête part (pas d\'empilement)', jamaisRepondu === 1, jamaisRepondu);
    const delai = w.eval('_apiTimeoutPour("savePlanningOverridesBatch")');
    V('un garde-fou de temps existe (90 s en écriture)', delai === 90000, delai);
  }

  console.log('\n═══ 31. Fermeture de l\'onglet : le travail en vol est sauvé ═══');
  {
    let beacons = 0;
    const { w } = await charger('../admin.html', {
      beforeParse(win) { win.navigator.sendBeacon = () => { beacons++; return true; }; },
    });
    w.fetch = async (url) => {
      if (String(url).includes('workers.dev')) throw new Error('Failed to fetch');
      return { ok:true, json: async () => ({ success:true, saved:1 }) };
    };
    w.queueOverride('2027-05-04','BRAVO','am','MAT','Comité');
    V('le travail est écrit sur le poste dès le clic', !!w.localStorage.getItem('adminBatchPending'));
    w.dispatchEvent(new w.Event('pagehide'));       // l'utilisateur ferme l'onglet
    await dodo(200);
    V('un envoi de secours part à la fermeture', beacons >= 1, beacons);
    V('le travail reste sur le poste tant qu\'il n\'est pas confirmé', !!w.localStorage.getItem('adminBatchPending'));
  }

  console.log('\n═══ 32. Cache mobile : une VIEILLE page contre un serveur à jour ═══');
  {
    /* Le piège du 05/08 : le téléphone servait v1.21.1 alors que le dépôt
       était plus loin. On charge une ancienne version et on vérifie qu'elle
       ne corrompt RIEN — au pire elle est plus lente. */
    const ancienne = fs.existsSync('../banc/reference/admin_precedent.html') ? '../banc/reference/admin_precedent.html' : null;
    if (!ancienne) { console.log('  (ancienne version absente du banc local — scénario ignoré)'); }
    else {
      const { w, erreurs } = await charger(ancienne);
      let ecrituresGAS = 0, deposesJournal = 0;
      w.fetch = async (url, opt) => {
        const u = String(url);
        if (u.includes('workers.dev')) { deposesJournal++; return { ok:true, json: async () => ({ success:true, cle:'j_1' }) }; }
        ecrituresGAS++;
        return { ok:true, json: async () => ({ success:true, saved:1 }) };
      };
      w.queueOverride('2027-05-05','CHARLI','am','ORT','Comité');
      await w.flushBatch();
      V('l\'ancienne page fonctionne encore (aucune erreur)', erreurs.length === 0, erreurs.slice(0,2));
      V('elle écrit par le circuit d\'origine (pas de perte)', ecrituresGAS >= 1, { ecrituresGAS, deposesJournal });
      V('rien ne reste bloqué en attente', Object.keys(w._batchAll()).length === 0);
      /* (14/08/2026) La page archivee porte encore son numero en dur ; la page
         actuelle le lit dans version.js. On compare donc l'un a l'autre. */
      const vA = fs.readFileSync(ancienne,'utf8').match(/const SITE_VERSION = '(v[\d.]+)'/);
      const vN = fs.readFileSync('../version.js','utf8').match(/window\.SITE_VERSION = '(v[\d.]+)'/);
      V('les deux versions sont bien distinctes (le test a du sens)', vA && vN && vA[1] !== vN[1], [vA && vA[1], vN && vN[1]]);
    }
  }

  console.log('\n═══ 33. Réseau mobile lent : le miroir abandonne à temps ═══');
  {
    const { w } = await charger('../admin.html');
    const src = fs.readFileSync('../admin.html','utf8');
    const m = src.match(/setTimeout\(\(\) => _ctrl\.abort\(\), (\d+)\)/);
    V('le délai d\'abandon du miroir est adapté au mobile (10 s)', m && Number(m[1]) === 10000, m && m[1]);
    let annule = false;
    w.fetch = (url, opt) => new Promise((res, rej) => {
      if (opt && opt.signal) opt.signal.addEventListener('abort', () => { annule = true; rej(new Error('AbortError')); });
    });
    const p = w.miroirRead(['planning_2027'], 'CODE99');
    const r = await Promise.race([p, dodo(800).then(() => 'toujours en attente')]);
    V('la lecture miroir ne bloque pas la page', r === 'toujours en attente' || r === null, typeof r);
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
