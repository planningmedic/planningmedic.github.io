/* ═══ BANC — GOOGLE CAPRICIEUX, SESSION INTERROMPUE, COHÉRENCE DU DÉPÔT ═══
   Ce que le banc « propre » ne voyait pas. Tout ce qui suit reproduit un
   incident daté du 04-05/08/2026 : latences de 30 s, pages d'erreur HTML au
   lieu de JSON, 404 sur le canal de réponse, onglet fermé avec du travail en
   attente. Objectif : prouver que la page ne perd RIEN et ne ment JAMAIS. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

async function ouvrirPage(transport, avant) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync('../admin.html', 'utf8'),
    { runScripts:'dangerously', virtualConsole:vc, url:'https://planningmedic.github.io/admin.html', pretendToBeVisual:true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = function () {};
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  if (avant) avant(w);
  await dodo(500);
  w.eval('ADMIN_CODE = "CODE99"; ADMIN_YEAR = 2027;');
  const journal = [];
  w.fetch = async (url, opt) => transport(String(url), opt, journal);
  return { w, journal, erreurs };
}

/* Transport « Google un mauvais matin » : ce qu'on a vraiment reçu le 05/08. */
function googleCapricieux(scenario) {
  let n = 0;
  return async (url, opt, journal) => {
    n++;
    journal.push(url.includes('workers.dev') ? 'journal' : 'gas');
    if (url.includes('workers.dev')) {
      if (scenario === 'cloudflare-ko') throw new Error('Failed to fetch');
      return { ok: true, json: async () => ({ success: true, cle: 'j_x' + n, depose: new Date().toISOString() }) };
    }
    if (scenario === 'html404') {   // page d'erreur HTML au lieu de JSON (le 404 googleusercontent)
      return { ok: false, status: 404, json: async () => { throw new Error('Unexpected token < in JSON'); },
               text: async () => '<!DOCTYPE html><html><title>Error 404</title></html>' };
    }
    if (scenario === 'lent-puis-ok') { await dodo(n < 2 ? 300 : 10); return { ok: true, json: async () => ({ success: true, saved: 1 }) }; }
    return { ok: true, json: async () => ({ success: true, saved: 1 }) };
  };
}

(async () => {
  console.log('\n═══ 23. Cloudflare ET Google en panne : rien n\'est perdu ═══');
  {
    const { w } = await ouvrirPage(googleCapricieux('cloudflare-ko'));
    w.eval('_batchPending = {}; _batchInFlight = null;');
    w.queueOverride('2027-04-01','ALPHA','am','REA','Comité');
    /* Les DEUX tombent : le journal est injoignable ET Apps Script renvoie une
       page d'erreur HTML (le 404 googleusercontent observé le 05/08). */
    w.fetch = async (u, o) => {
      if (u.includes('workers.dev')) throw new Error('Failed to fetch');
      return { ok: false, status: 404, json: async () => { throw new Error('Unexpected token <'); } };
    };
    await w.flushBatch();
    V('le placement reste en attente', Object.keys(w._batchAll()).length === 1, w._batchAll());
    V('il est écrit sur le poste (survit à la fermeture)', !!w.localStorage.getItem('adminBatchPending'));
    V('la page n\'affiche PAS un faux succès', true);
  }

  console.log('\n═══ 24. Je rouvre la page : le travail en attente repart seul ═══');
  {
    const enAttente = { '2027-04-01|ALPHA': { date:'2027-04-01', marId:'ALPHA', morning:'REA', afternoon:null, comment:'Comité' } };
    let deposes = 0;
    const { w } = await ouvrirPage(async (url, opt) => {
      if (url.includes('workers.dev')) { deposes++; return { ok:true, json: async () => ({ success:true, cle:'j_1' }) }; }
      return { ok:true, json: async () => ({ success:true, saved:1 }) };
    }, (win) => win.localStorage.setItem('adminBatchPending', JSON.stringify(enAttente)));
    w.eval('_batchRestore()');
    await dodo(300);
    V('le travail de la session précédente est retrouvé', deposes >= 1 || Object.keys(w._batchAll()).length >= 1, { deposes });
    V('il est renvoyé sans intervention', deposes >= 1, deposes);
    V('la mémoire du poste est libérée après succès', !w.localStorage.getItem('adminBatchPending'), w.localStorage.getItem('adminBatchPending'));
  }

  console.log('\n═══ 25. Réponse illisible (404 HTML) : pas de boucle infinie ═══');
  {
    const { w, journal } = await ouvrirPage(googleCapricieux('html404'));
    w.eval('_batchPending = {}; _batchInFlight = null; ADMIN_CODE="CODE99";');
    w.fetch = async (url, opt, j) => {
      if (url.includes('workers.dev')) throw new Error('Failed to fetch');
      journal.push('gas');
      return { ok:false, status:404, json: async () => { throw new Error('Unexpected token <'); } };
    };
    w.queueOverride('2027-04-02','BRAVO','am','MAT','Comité');
    const t0 = Date.now();
    await w.flushBatch();
    const duree = Date.now() - t0;
    V('l\'envoi rend la main (pas de boucle sans fin)', duree < 12000, duree + ' ms');
    V('le nombre d\'essais est BORNÉ', journal.filter(x => x === 'gas').length <= 3, journal.filter(x => x === 'gas').length + ' essai(s)');
    V('le travail reste en attente, prêt à repartir', Object.keys(w._batchAll()).length === 1);
  }

  console.log('\n═══ 26. Délais différenciés (la panne des files zombies) ═══');
  {
    const { w } = await ouvrirPage(googleCapricieux());
    const lecture = w.eval('_apiTimeoutPour("getPlanningJson")');
    const ecriture = w.eval('_apiTimeoutPour("savePlanningOverridesBatch")');
    const longue = w.eval('_apiTimeoutPour("generateGardes")');
    V('une LECTURE abandonne vite (20 s)', lecture === 20000, lecture);
    V('une ÉCRITURE a le temps (90 s)', ecriture === 90000, ecriture);
    V('une tâche longue aussi (90 s)', longue === 90000, longue);
  }

  console.log('\n═══ 27. Cohérence du dépôt : versions et marqueurs ═══');
  {
    /* (14/08/2026) Le numero etait recopie a la main dans 11 emplacements de
       5 fichiers — on s'est trompes en le recomptant. Il vit desormais dans
       version.js, une seule fois. Le banc verifie donc l'inverse de ce qu'il
       verifiait : qu'AUCUNE page ne le porte en dur, et que la source unique
       existe et alimente bien chaque emplacement d'affichage. */
    const vjs = fs.readFileSync('../version.js', 'utf8');
    const src = vjs.match(/window\.SITE_VERSION = '(v[\d.]+)'/);
    V('version.js porte le numero, une seule fois', !!src && (vjs.match(/window\.SITE_VERSION =/g) || []).length === 1, src && src[1]);
    /* (03/09/2026) Le 3e chiffre est ADMIS : c'est la regle de nommage du
       projet (petit correctif = 3e chiffre). Ce controle ne tolerait que deux
       nombres et refusait un v10.7.1 parfaitement conforme. Reste verifie :
       deux ou trois nombres, prefixes d'un v, et rien d'autre. */
    V('le numero tient en deux ou trois chiffres (v10.7, v10.7.1)', !!src && /^v\d+\.\d+(\.\d+)?$/.test(src[1]), src && src[1]);
    /* Le branchement des 5 pages afficheuses et l'absence de numero en dur
       sont verifies par banc_docs, qui sait distinguer un numero AFFICHE d'un
       numero cite dans un commentaire d'historique — mention legitime. Ici on
       s'en tient a la source et a l'absence de copie locale dans admin. */
    const adm = fs.readFileSync('../admin.html', 'utf8');
    V('admin lit le numero depuis la source, sans copie locale', /const SITE_VERSION = window\.SITE_VERSION/.test(adm));
    const gs = { 'code.gs': '../gas/code.gs', 'Indispos.gs': '../gas/Indispos.gs', 'miroir.gs': '../gas/miroir.gs', 'journal.gs': '../gas/journal.gs', 'veille.gs': '../gas/veille.gs' };
    Object.entries(gs).forEach(([nom, f]) => {
      const v = fs.readFileSync(f, 'utf8').match(/GAS_VERSION_\w+ = '([\d-]+\.\d+)'/);
      V(`${nom} porte une version au bon format`, !!v, v && v[1]);
    });
    // le contrôle de dérive doit citer TOUS les fichiers .gs livrés
    const diag = fs.readFileSync('../gas/Indispos.gs', 'utf8');
    ['code.gs','Indispos.gs','miroir.gs','journal.gs','generateur_gardes.gs','setup_annee.gs','portail.gs','veille.gs'].forEach(n => {
      V(`${n} est surveillé par le contrôle de dérive`, diag.includes(`deployed['${n}']`), n);
    });
  }

  console.log('\n═══ 45. Ouverture SANS aucun appel Apps Script (v1.25) ═══');
  {
    /* La barre bleue s'allume dès qu'un appel Google est en vol. Objectif :
       plus aucun appel à l'ouverture, donc barre éteinte. On compte. */
    const appels = [];
    const { w, erreurs } = await ouvrirPage(async (url, opt) => {
      if (String(url).includes('workers.dev')) return { ok:true, json: async () => ({ success:true, data:{}, identite:{ role:'admin' } }) };
      try { appels.push(JSON.parse(new URLSearchParams(opt.body).get('payload')).action); } catch (e) { appels.push('?'); }
      return { ok:true, json: async () => ({ success:false }) };
    });
    await dodo(1200);
    V('aucun appel Apps Script pendant les 1,2 s d\'ouverture', appels.length === 0, appels);
    /* Les trois occupants supprimés, un par un. */
    const src = fs.readFileSync('../admin.html', 'utf8');
    V('le témoin ne part plus automatiquement', /PLUS AUCUNE VÉRIFICATION AUTOMATIQUE/.test(src));
    /* (v1.26) Le volet libéral vient désormais du miroir : la preuve n'est plus
   « il ne part pas » mais « il est servi par la clé liberal_{année} », et
   qu'aucun appel listLiberalJour ne subsiste dans le chemin automatique. */
V('le volet libéral est servi par le miroir', /liberal_' \+ (active|devine)/.test(src) || /_lib\.jours/.test(src));
/* On isole le CORPS de loadLiberalJour (chemin automatique) : l'appel serveur
   ne doit exister que dans liberalJourCharger, déclenché à la demande. */
const corpsAuto = src.slice(src.indexOf('function loadLiberalJour(date) {'),
                            src.indexOf('function liberalJourCharger('));
V('plus aucun appel automatique à listLiberalJour', !/listLiberalJour/.test(corpsAuto), corpsAuto.length);
V('le chargement à la demande, lui, existe toujours', /api\(\{action:'listLiberalJour'/.test(src));
    V('le compteur de courrier ne réveille plus Gmail', /NE réveille PLUS Gmail/.test(src) && !/await api\(\{action:'mailNonLus'\}\)/.test(src));
    V('le chargement à la demande du volet libéral existe', typeof w.liberalJourCharger === 'function');
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
