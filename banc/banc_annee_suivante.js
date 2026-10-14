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

    const contenu = fs.readFileSync('../index.html', 'utf8');
    const gas = [], miroir = [];
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/index.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));   // (14/09/2026) le socle commun, servi comme le vrai site
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
    V('la tuile affiche quand même la garde de décembre (« Mar. 1 déc. · Réa », v1.23)',
      /^\w+\. \d{1,2} déc\. · /.test(w.document.getElementById('mgHeroMain').textContent),
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
    /* (14/10/2026, v1.23) La carte n'annonce plus « N autres à venir » (allégée à la
       demande du responsable) : on compte dans la liste Mes gardes, qui reçoit les deux années. */
    w.openMesGardes(); await dodo(50);
    const nG = w.document.querySelectorAll('#mesGardesList .staff-card').length;
    V('Mes gardes compte une garde de plus que la seule année en cours (décembre + janvier)', nG === 2, nG);
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
    const contenu = fs.readFileSync('../index.html', 'utf8');
    V('le seuil « dès octobre » (getMonth()>=9) n\'existe plus', !/getMonth\(\)\s*>=\s*9/.test(contenu));
    V('l\'année suivante se lit sans réseau (_planDejaLa)', /function _planDejaLa/.test(contenu));
    V('aucune lecture réseau de l\'année suivante ne subsiste',
      !/_fetchPlanning\(\s*year\s*\+\s*1\s*\)/.test(contenu));
  }

  /* ── C. (14/10/2026, v1.23) Carte « Prochaine garde » : le collègue de l'AUTRE ligne ── */
  console.log(`\n═══ 33. Carte « Prochaine garde » : date courte, délai, collègue de l'autre ligne ═══`);
  {
    const deux = (annee, mois, moi, lui, idLui) => {
      const jours = moi.map((_, i) => ({ date: `${annee}-${String(mois).padStart(2,'0')}-${String(i+1).padStart(2,'0')}` }));
      return { months: [{ year: annee, month: mois, days: jours, doctors: [
        { id: 'ALPHA', days: moi.map(x => ({ status: x })) },
        { id: idLui, days: lui.map(x => ({ status: x })) },
        { id: 'GAMMA', days: moi.map(() => ({ status: 'BLOC' })) },
      ] }], equiteInitiale: {} };
    };
    const a = await ouvrir({ [`planning_${AN}`]: deux(AN, 12, ['G', ''], ['G2', ''], 'BOISSY-AUBERT'), annees });
    const sub = a.w.document.getElementById('mgHeroSub');
    V('Réa le 1er décembre : le collègue en Mater/Bloc ce jour-là est nommé', /avec Boissy-Aubert en Mater\/Bloc/.test(sub.textContent), sub.textContent);
    V('le nom est en gras, sans balise injectée', !!sub.querySelector('b') && sub.querySelector('b').textContent === 'Boissy-Aubert');
    V('…et pas un médecin qui n\'est pas de garde (GAMMA au bloc)', !/Gamma/.test(sub.textContent));
    V('le délai est en tête du sous-titre', /^dans \d+ jours · /.test(sub.textContent), sub.textContent);
    V('la carte ne dit plus « autres à venir »', !/autre/.test(sub.textContent));
    V('aucun appel Apps Script de plus pour trouver le collègue', !a.gas.includes('getPlanningJson'), a.gas);
    const b = await ouvrir({ [`planning_${AN}`]: deux(AN, 12, ['G2', ''], ['G', ''], 'BETA'), annees });
    V('Mater/Bloc : le collègue en Réa est nommé', /Mater\/Bloc$/.test(b.w.document.getElementById('mgHeroMain').textContent)
      && /avec Beta en Réa/.test(b.w.document.getElementById('mgHeroSub').textContent), b.w.document.getElementById('mgHeroSub').textContent);
    const c = await ouvrir({ [`planning_${AN}`]: deux(AN, 12, ['G', ''], ['', ''], 'BETA'), annees });
    V('personne sur l\'autre ligne : seulement le délai, sans « avec »', /^dans \d+ jours$/.test(c.w.document.getElementById('mgHeroSub').textContent), c.w.document.getElementById('mgHeroSub').textContent);
    const D = a.w.document;
    V('sous « Bonjour » : la date du jour au lieu de « Choisissez une rubrique »', /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) \d{1,2} \w+/.test(D.getElementById('helloDate').textContent), D.getElementById('helloDate').textContent);
    V('les tuiles ont chacune leur teinte (Mes congés pêche, Veille rose, Topos bleu)',
      !!D.querySelector('.tile-ico.peche') && !!D.querySelector('#bloc-ressources .tile-ico.rose') && !!D.querySelector('#bloc-ressources .tile-ico.bleu'));
    V('aucune erreur JavaScript', a.erreurs.length === 0 && b.erreurs.length === 0 && c.erreurs.length === 0, a.erreurs.concat(b.erreurs, c.erreurs).slice(0, 2));
    /* (14/10/2026, v1.23.1) Nouvelle version en ligne : l'accueil se recharge seul, jamais ailleurs. */
    V('accueil affiché, rien en cours : rechargement automatique autorisé', a.w.__majRechargeAuto() === true);
    a.w.openView('veille'); await dodo(80);
    V('une rubrique ouverte (Veille) : pas de rechargement automatique (bandeau)', a.w.__majRechargeAuto() === false);
    a.w.backToHome(); await dodo(30);
    const champ = a.w.document.createElement('input'); a.w.document.getElementById('tilesView').appendChild(champ); champ.focus();
    V('un champ en cours de saisie sur l\'accueil : pas de rechargement automatique', a.w.__majRechargeAuto() === false);
  }

  /* ── D. (14/10/2026, v1.24) Pastilles d'information des tuiles ── */
  console.log(`\n═══ 34. Pastilles des tuiles : congés à venir, affectation du jour, J-N des indispos ═══`);
  {
    const iso = d => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
    /* Plannings construits sur les SEULES dates utiles, rangées par année et par mois
       (_extractMyConges suit l'index des jours : une liste creuse suffit). */
    const construire = (moi) => {
      const parAn = {};
      Object.keys(moi).forEach(dt => { const y = +dt.slice(0, 4), m = +dt.slice(5, 7);
        ((parAn[y] = parAn[y] || {})[m] = parAn[y][m] || []).push(dt); });
      const out = {};
      Object.keys(parAn).forEach(y => {
        out['planning_' + y] = { months: Object.keys(parAn[y]).sort((a, b) => a - b).map(m => { const ds = parAn[y][m].sort();
          return { year: +y, month: +m, days: ds.map(date => ({ date })), doctors: [{ id: 'ALPHA', days: ds.map(date => moi[date]) }] }; }), equiteInitiale: {} };
      });
      if (!out['planning_' + AN]) out['planning_' + AN] = { months: [], equiteInitiale: {} };
      return out;
    };
    const tuile = (w, k) => w.document.querySelector('#tilesView [data-key="' + k + '"]');
    const sous = (w, k) => (tuile(w, k).querySelector('.tile-sub') || {}).textContent;
    const badge = (w, k) => { const b = tuile(w, k) && tuile(w, k).querySelector('.tile-badge'); return b ? b.textContent : null; };

    const moi = {};
    moi[j(0)] = { morning: 'ORT', afternoon: 'CS-ANE' };
    moi[j(3)] = { status: 'TP' }; moi[j(10)] = { status: 'TP' };
    moi[j(5)] = { status: 'F' }; moi[j(6)] = { status: 'F' };
    moi[j(20)] = { status: 'R' };
    moi[j(40)] = { status: 'V' }; moi[j(41)] = { status: 'V' };
    const a = await ouvrir(Object.assign(construire(moi), { annees }));
    V('Planning : l\'affectation du jour, matin puis après-midi', sous(a.w, 'planning') === "Aujourd'hui : Ortho, puis Consultation.", sous(a.w, 'planning'));
    V('Mes congés : 3 à venir (formation, récup, vacances) — les jours de TP ne comptent pas', badge(a.w, 'conges') === '3 à venir', badge(a.w, 'conges'));
    const jj = d => d.slice(8, 10) + '/' + d.slice(5, 7);
    V('Mes congés : le prochain, avec ses dates', sous(a.w, 'conges') === 'Prochain : formation du ' + jj(j(5)) + ' au ' + jj(j(6)) + '.', sous(a.w, 'conges'));
    V('aucun appel Apps Script pour ces pastilles', !a.gas.includes('getPlanningJson'), a.gas);

    const enCours = {}; enCours[j(-2)] = { status: 'V' }; enCours[j(0)] = { status: 'V' }; enCours[j(1)] = { status: 'V' };
    const b = await ouvrir(Object.assign(construire(enCours), { annees }));
    V('en congé aujourd\'hui : « Vacances en cours, jusqu\'au … »', sous(b.w, 'conges') === 'Vacances en cours, jusqu\'au ' + jj(j(1)) + '.', sous(b.w, 'conges'));
    V('…et le Planning dit « Aujourd\'hui : Vacances. »', sous(b.w, 'planning') === "Aujourd'hui : Vacances.", sous(b.w, 'planning'));

    const garde = {}; garde[j(0)] = { status: 'G2' };
    const c = await ouvrir(Object.assign(construire(garde), { annees }));
    V('de garde aujourd\'hui : « de garde en Mater/Bloc »', sous(c.w, 'planning') === "Aujourd'hui : de garde en Mater/Bloc.", sous(c.w, 'planning'));
    V('aucun congé à venir : pas de pastille, texte habituel', badge(c.w, 'conges') === null && /Vacances, formation/.test(sous(c.w, 'conges')), [badge(c.w, 'conges'), sous(c.w, 'conges')]);

    const rien = await ouvrir(Object.assign(construire({}), { annees }));
    V('jour sans affectation : le Planning garde son texte habituel', /Qui est où/.test(sous(rien.w, 'planning')), sous(rien.w, 'planning'));

    rien.w.eval("INDISPOS_OUVERTE = true; INDISPOS_FIGEES = false; FIN_SAISIE = '" + j(16) + "'; renderTiles();");
    V('indispos ouvertes : « J-16 » jusqu\'à la date limite', badge(rien.w, 'indispos') === 'J-16', badge(rien.w, 'indispos'));
    rien.w.eval("FIN_SAISIE = '" + j(0) + "'; renderTiles();");
    V('le jour de la date limite : « Dernier jour »', badge(rien.w, 'indispos') === 'Dernier jour', badge(rien.w, 'indispos'));
    rien.w.eval("FIN_SAISIE = '" + j(-1) + "'; renderTiles();");
    V('saisie close : plus de pastille (le cadenas prend le relais)', badge(rien.w, 'indispos') === null);
    rien.w.eval("FIN_SAISIE = '" + j(16) + "'; INDISPOS_FIGEES = true; renderTiles();");
    V('planning de campagne déjà établi : pas de compte à rebours', badge(rien.w, 'indispos') === null);
    V('aucune erreur JavaScript', a.erreurs.length + b.erreurs.length + c.erreurs.length + rien.erreurs.length === 0, a.erreurs.concat(b.erreurs, c.erreurs, rien.erreurs).slice(0, 2));
  }

  /* ── E. (14/10/2026, v1.24.1) Pastille de la tuile Staffs ── */
  console.log(`\n═══ 35. Staffs : le prochain sur la tuile, arrivé avec l'ouverture ═══`);
  {
    const iso = d => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
    const JA = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
    const etiquette = dt => { const p = dt.split('-'); const d = new Date(+p[0], +p[1]-1, +p[2]); return JA[d.getDay()] + ' ' + d.getDate(); };
    const staffs = { success: true, count: 3, staffs: [
      { date: j(-3), heure: '14h', theme: 'Staff passé', intervenant: 'X' },        // la copie du relais peut dater de la veille
      { date: j(9), heure: '14h', theme: 'Mise au point SedLine', intervenant: 'Y' },
      { date: j(2), heure: '14h15', theme: 'Présentation Céfiderocol', intervenant: 'Laboratoire' },
    ] };
    const a = await ouvrir({ [`planning_${AN}`]: planning(AN, 12, ['', '', '']), annees, staffs });
    const t = a.w.document.querySelector('#tilesView [data-key="staffs"]');
    const b = t && t.querySelector('.tile-badge');
    V('la liste des staffs voyage dans l\'appel d\'ouverture (un seul aller-retour)', a.miroir.some(k => k.includes('staffs') && k.includes('echanges')), a.miroir);
    V('pastille : le PROCHAIN staff (pas le passé, pas le plus lointain)', b && b.textContent === etiquette(j(2)), b && b.textContent);
    V('sous-titre : l\'heure et le thème', t.querySelector('.tile-sub').textContent === '14h15 · Présentation Céfiderocol', t.querySelector('.tile-sub').textContent);
    V('aucun appel Apps Script pour la pastille', !a.gas.includes('listStaffs'), a.gas);
    const auj = await ouvrir({ [`planning_${AN}`]: planning(AN, 12, ['', '', '']), annees, staffs: { success: true, staffs: [{ date: j(0), heure: '', theme: '', intervenant: 'Laboratoire Z' }] } });
    const ta = auj.w.document.querySelector('#tilesView [data-key="staffs"]');
    V('staff le jour même : « aujourd\'hui », et l\'intervenant à défaut de thème', ta.querySelector('.tile-badge').textContent === "aujourd'hui" && ta.querySelector('.tile-sub').textContent === 'Laboratoire Z', ta.textContent);
    const sans = await ouvrir({ [`planning_${AN}`]: planning(AN, 12, ['', '', '']), annees });
    const ts = sans.w.document.querySelector('#tilesView [data-key="staffs"]');
    V('aucune liste : pas de pastille, texte habituel', !ts.querySelector('.tile-badge') && /Programme des réunions/.test(ts.querySelector('.tile-sub').textContent));
    V('aucune erreur JavaScript', a.erreurs.length + auj.erreurs.length + sans.erreurs.length === 0, a.erreurs.concat(auj.erreurs, sans.erreurs).slice(0, 2));
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
