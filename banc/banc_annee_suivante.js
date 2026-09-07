/* ═══ BANC — L'ANNÉE SUIVANTE DANS LE PORTAIL ═══
   Les tuiles « prochaine garde » et « mes congés » doivent montrer les gardes
   et congés de janvier N+1 pendant la transition décembre → janvier.
   Défaut corrigé le 08/08/2026 : un seuil « dès octobre » déclenchait un appel
   Apps Script à CHAQUE ouverture tant que le planning N+1 n'était pas généré
   (novembre), et la tuile attendait sa réponse.
   Règle vérifiée ici : l'année suivante arrive avec l'appel d'ouverture, ou
   n'arrive pas — mais elle ne déclenche JAMAIS d'appel supplémentaire. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

const AN = new Date().getFullYear();          // année active = année civile, comme en production
const CODE_MAR = 'MARCODE77';

/* Un planning minimal au format attendu par _extractMyGardes / _extractMyConges :
   months[].days[].date  +  months[].doctors[].days[].status */
function planning(annee, mois, statuts) {
  const jours = statuts.map((_, i) => ({ date: `${annee}-${String(mois).padStart(2,'0')}-${String(i+1).padStart(2,'0')}` }));
  return { months: [{ year: annee, month: mois, days: jours,
    doctors: [{ id: 'ALPHA', days: statuts.map(s => ({ status: s })) }] }], equiteInitiale: {} };
}

(async () => {
  const src = fs.readFileSync('../cloudflare/worker.js','utf8').replace('export default','globalThis.__W =');
  const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(src, wctx);
  const WK = wctx.__W;
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const hash = await sha(CODE_MAR);

  /* Ouvre le portail avec une session déjà authentifiée, sur un miroir donné.
     Renvoie la fenêtre, la liste des actions Apps Script appelées, et le
     nombre d'appels au miroir. */
  async function ouvrir(cles) {
    const M = new Map();
    Object.keys(cles).forEach(k => M.set(k, JSON.stringify(cles[k])));
    M.set('acces', JSON.stringify({ indisposYear: AN, indisposOuverte: false, users: [
      { h: hash, role: 'mar', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Test' }] }));
    const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
      list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
    const env = { KV, PUSH_TOKEN: 'JETON' };

    const contenu = fs.readFileSync('../dashboard.html', 'utf8');
    const gas = [], miroir = [];
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/dashboard.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.HTMLElement.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        try { win.sessionStorage.setItem('pmViewCode', CODE_MAR); } catch (e) {}   // session déjà ouverte
        win.navigator.sendBeacon = () => true;
        /* Le réseau est détourné AVANT l'exécution des scripts : la reprise de
           session (viewAutoLogin) part dès l'analyse de la page. */
        win.fetch = async (url, opt) => {
          const u = String(url);
          if (u.includes('workers.dev')) {
            try { miroir.push(JSON.parse(opt.body).keys || []); } catch (e) { miroir.push([]); }
            const chemin = u.replace(/^https:\/\/[^/]+/, '');
            return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
          }
          let act = '(inconnue)';
          try { act = JSON.parse(opt.body).action || act; } catch (e) {}
          gas.push(act);
          return { ok:true, json: async () => ({ success:false, error:'GAS indisponible dans le banc' }) };
        };
      } });
    const w = dom.window;
    await dodo(900);
    return { w, gas, miroir, erreurs };
  }

  const annees = { success:true, active: AN, annees:[{annee:AN, statut:'ACTIF'}] };

  /* ── A. Le planning de l'année suivante N'EXISTE PAS (cas du 1er octobre au
        jour de la génération, en novembre). ── */
  console.log(`\n═══ 30. Année suivante absente : aucun appel déclenché ═══`);
  {
    const { w, gas, miroir, erreurs } = await ouvrir({
      [`planning_${AN}`]: planning(AN, 12, ['G', '', '']),
      annees,
    });
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    V('aucun appel Apps Script pour un planning',
      !gas.includes('getPlanningJson'), gas);
    V(`l'année suivante est demandée dans l'appel d'ouverture, pas dans un appel à part`,
      miroir.some(k => k.includes(`planning_${AN+1}`)), miroir);
    V('un seul aller-retour au miroir à l\'ouverture', miroir.length <= 2, miroir.length);
    V('le planning de l\'année suivante n\'est PAS en mémoire (il n\'existe pas)',
      w._planDejaLa(AN+1) === null, w._planDejaLa(AN+1));
    V('la tuile affiche quand même la garde de décembre',
      /^\w+ \d{2}\/12 · /.test(w.document.getElementById('mgHeroMain').textContent),
      w.document.getElementById('mgHeroMain').textContent);
    V(`l'étiquette de la tuile annonce « Prochaine garde »`,
      /Prochaine garde/.test(w.document.getElementById('mgHeroLabel').textContent),
      w.document.getElementById('mgHeroLabel').textContent);
    V('le délai est passé en sous-titre, pas en ligne principale',
      /jours|Demain|Aujourd/.test(w.document.getElementById('mgHeroSub').textContent),
      w.document.getElementById('mgHeroSub').textContent);

    /* Pastille du bandeau : les initiales du classeur, pas le nom recalculé.
       Le nom complet reste lisible juste dessous dans « Bonjour Dr X ». */
    const pastille = w.document.getElementById('mePill').textContent.trim();
    V('la pastille du bandeau affiche les initiales du classeur',
      pastille === 'AL', pastille);
    V('elle ne répète plus le nom complet', !/Alpha|ALPHA/.test(pastille), pastille);
    V(`le nom complet reste affiché dans « Bonjour »`,
      /Alpha/i.test(w.document.getElementById('hello').textContent),
      w.document.getElementById('hello').textContent);
  }

  /* ── B. Le planning de l'année suivante EXISTE (après la génération). ── */
  console.log(`\n═══ 31. Année suivante présente : gardes et congés de janvier visibles ═══`);
  {
    const { w, gas, miroir, erreurs } = await ouvrir({
      [`planning_${AN}`]: planning(AN, 12, ['G', '', '']),
      [`planning_${AN+1}`]: planning(AN+1, 1, ['', 'G', 'CA']),
      annees,
    });
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
    V('aucun appel Apps Script pour un planning',
      !gas.includes('getPlanningJson'), gas);
    V('le planning de l\'année suivante est arrivé avec l\'ouverture, sans appel dédié',
      !!w._planDejaLa(AN+1));
    V('la tuile annonce une garde de plus que la seule année en cours',
      /1 autre à venir/.test(w.document.getElementById('mgHeroSub').textContent),
      w.document.getElementById('mgHeroSub').textContent);
    /* Les congés se chargent à la demande : on ouvre la vue comme le ferait un clic. */
    if (typeof w.loadMyConges === 'function') {
      const avant = gas.length;
      await w.loadMyConges();
      V('les lire ne déclenche aucun appel Apps Script', gas.length === avant, gas.slice(avant));
    }
  }

  /* ── C. Le seuil de date a bien disparu du code. ── */
  console.log(`\n═══ 32. Plus aucun seuil de date en dur ═══`);
  {
    const contenu = fs.readFileSync('../dashboard.html', 'utf8');
    V('le seuil « dès octobre » (getMonth()>=9) n\'existe plus', !/getMonth\(\)\s*>=\s*9/.test(contenu));
    V('l\'année suivante se lit sans réseau (_planDejaLa)', /function _planDejaLa/.test(contenu));
    V('aucune lecture réseau de l\'année suivante ne subsiste',
      !/_fetchPlanning\(\s*year\s*\+\s*1\s*\)/.test(contenu));
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
