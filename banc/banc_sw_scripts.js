/* ═══ BANC — SCRIPTS COMMUNS À JOUR DÈS L'OUVERTURE (27/11/2026) ═══
   DÉFAUT RELU DANS L'HISTORIQUE : le service worker demande les pages au
   réseau mais sert scripts et feuilles de style depuis la copie de l'appareil,
   rafraîchie en fond pour la fois suivante. Après une publication, la page
   neuve tournait donc une fois avec les scripts d'avant. Le 14/11 (v1.75.0),
   planning.html appelait une fonction créée le même jour dans
   partage/rendu_equite.js : onglet Équité en erreur à la première ouverture.

   Ici le VRAI sw.js tourne dans un navigateur simulé (copies en mémoire, réseau
   dont on change le contenu) :
     · même numéro de version → les scripts restent servis de la copie ;
     · numéro changé → la page ouverte reçoit les scripts publiés, pas ceux d'avant ;
     · RIEN n'est jamais jeté : si le réseau tombe ou traîne juste après l'arrivée
       de la page, elle garde les scripts qu'elle avait (sinon : page sans script,
       interface bloquée — le scénario que la première version du correctif créait) ;
     · sans réseau, ou numéro de version qui tarde → comme avant, sans erreur.
   Contre-épreuve : le sw.js d'avant le correctif (lu dans l'historique git)
   sert bien l'ancien script à la page neuve. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

const RACINE = path.join(__dirname, '..');
const ORIGINE = 'https://exemple.test';
const SW_ACTUEL = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
const AVANT_CORRECTIF = '139d5481579bc3d5b0328be89bc7509ada0e1192';   // dernier commit avant le correctif

/* Un navigateur : des copies (Cache Storage) et un réseau dont le contenu change. */
function navigateur(srcSw) {
  const reseau = {}, journal = [], magasins = {};
  let enLigne = true, versionLente = false;
  const enPanne = new Set(), pendus = new Set();   // chemins dont le réseau échoue / ne répond jamais
  const cleDe = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGINE + '/').href;
  const magasin = (nom) => {
    if (!magasins[nom]) {
      const m = new Map();
      magasins[nom] = {
        _m: m,
        async match(r) { const v = m.get(cleDe(r)); return v === undefined ? undefined : new Response(v.corps, { headers: v.entetes }); },
        async put(r, res) { m.set(cleDe(r), { corps: await res.text(), entetes: [...res.headers.entries()] }); },
        async keys() { return [...m.keys()].map(u => ({ url: u })); },
        async delete(r) { return m.delete(cleDe(r)); },
      };
    }
    return magasins[nom];
  };
  const caches = {
    async open(nom) { return magasin(nom); },
    async keys() { return Object.keys(magasins); },
    async delete(nom) { return delete magasins[nom]; },
    async match(r) { for (const n of Object.keys(magasins)) { const v = await magasins[n].match(r); if (v) return v; } return undefined; },
  };
  const fetch = async (r, options) => {
    const u = new URL(typeof r === 'string' ? r : r.url, ORIGINE + '/');
    journal.push({ chemin: u.pathname, options: options || null });
    if (!enLigne) throw new Error('hors réseau');
    if (versionLente && u.pathname === '/version.js') return new Promise(() => {});   // ne répond jamais
    if (enPanne.has(u.pathname)) throw new Error('réseau coupé');
    if (pendus.has(u.pathname)) return new Promise(() => {});
    const corps = reseau[u.pathname];
    if (corps === undefined) return new Response('absent', { status: 404 });
    return new Response(corps, { status: 200 });
  };
  const ecouteurs = {};
  const self = { location: { origin: ORIGINE }, registration: { scope: ORIGINE + '/' },
    addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting() {}, clients: { claim: async () => {} } };
  /* Les délais du service worker (1,5 s, 4 s, 6 s) sont joués 50 fois plus vite. */
  const minuterie = (f, ms) => setTimeout(f, Math.max(1, Math.round((ms || 0) / 50)));
  const ctx = { self, caches, fetch, URL, Response, Headers, console, setTimeout: minuterie, clearTimeout, Promise, Date };
  vm.createContext(ctx); vm.runInContext(srcSw, ctx);
  const demander = async (chemin, mode) => {
    let reponse = null;
    ecouteurs.fetch({ request: { method: 'GET', url: ORIGINE + chemin, mode: mode || 'no-cors' }, respondWith(p) { reponse = p; } });
    if (!reponse) return null;                       // non intercepté : le navigateur irait au réseau
    const res = await reponse;
    return res && typeof res.text === 'function' ? res.text() : null;
  };
  const repos = () => new Promise(r => setTimeout(r, 20));   // laisse finir les rafraîchissements de fond
  const intercepte = (methode, chemin) => { let pris = false; ecouteurs.fetch({ request: { method: methode, url: ORIGINE + chemin, mode: 'no-cors' }, respondWith(p) { pris = true; Promise.resolve(p).catch(() => {}); } }); return pris; };
  return { reseau, journal, magasins, demander, repos, intercepte, copies: (nom) => caches.open(nom),
    ouvrir: (page) => demander(page, 'navigate'),
    horsReseau: (b) => { enLigne = !b; }, versionLente: (b) => { versionLente = b; }, enPanne, pendus };
}
const publier = (n, v) => {
  n.reseau['/version.js'] = "window.SITE_VERSION = '" + v + "';";
  n.reseau['/planning.html'] = 'page ' + v;
  n.reseau['/partage/rendu_equite.js'] = 'script ' + v;
  n.reseau['/partage/theme.css'] = 'style ' + v;
  n.reseau['/assets/logo.png'] = 'image ' + v;
};
const chargerPage = async (n) => ({
  page: await n.ouvrir('/planning.html'),
  script: await n.demander('/partage/rendu_equite.js'),
  style: await n.demander('/partage/theme.css'),
  image: await n.demander('/assets/logo.png'),
});

(async () => {
  console.log('\n═══ SW 1. Même version : les scripts restent servis de la copie ═══');
  {
    const n = navigateur(SW_ACTUEL); publier(n, 'v1');
    const a = await chargerPage(n); await n.repos();
    V('première ouverture : page, script, style et image du réseau', a.page === 'page v1' && a.script === 'script v1' && a.style === 'style v1' && a.image === 'image v1', a);
    n.journal.length = 0;
    const b = await chargerPage(n); await n.repos();
    V('seconde ouverture, même numéro : rien n\'a changé à l\'écran', b.page === 'page v1' && b.script === 'script v1' && b.style === 'style v1', b);
    const nom = Object.keys(n.magasins).find(k => /-assets$/.test(k));
    V('le script est bien gardé en copie', !!nom && n.magasins[nom]._m.has(ORIGINE + '/partage/rendu_equite.js'));
    V('le numéro de version est lu à chaque ouverture de page', n.journal.some(j => j.chemin === '/version.js' && j.options && j.options.cache === 'no-store'), n.journal.map(j => j.chemin));
    V('le numéro vu est mémorisé', Object.keys(n.magasins).some(k => /-meta$/.test(k)));
  }

  console.log('\n═══ SW 2. Publication : la page neuve reçoit les scripts publiés ═══');
  {
    const n = navigateur(SW_ACTUEL); publier(n, 'v1');
    await chargerPage(n); await n.repos();
    publier(n, 'v2'); n.journal.length = 0;
    const a = await chargerPage(n); await n.repos();
    V('la page est la nouvelle', a.page === 'page v2', a.page);
    V('LE DÉFAUT : le script servi est celui de la publication, pas celui d\'avant', a.script === 'script v2', a.script);
    V('la feuille de style aussi', a.style === 'style v2', a.style);
    V('l\'image gardée en copie est servie comme avant', a.image === 'image v1', a.image);
    V('le script est redemandé en faisant revalider le serveur (pas la copie de 10 min du téléphone)',
      n.journal.some(j => j.chemin === '/partage/rendu_equite.js' && j.options && j.options.cache === 'no-cache'), n.journal.filter(j => /rendu/.test(j.chemin)));
    const b = await chargerPage(n);
    V('ouverture suivante : toujours le script publié, de nouveau servi de la copie', b.script === 'script v2', b.script);
  }

  console.log('\n═══ SW 3. Premier passage après la mise à jour du service worker ═══');
  {
    /* Un appareil qui a déjà des copies, mais aucun numéro mémorisé (il arrive de l'ancien sw.js). */
    const n = navigateur(SW_ACTUEL); publier(n, 'v2');
    const nomAssets = (SW_ACTUEL.match(/VERSION\s*=\s*'([^']+)'/) || [])[1] + '-assets';
    const copies = await n.copies(nomAssets);
    await copies.put(ORIGINE + '/partage/rendu_equite.js', new Response('script v1'));
    await copies.put(ORIGINE + '/assets/logo.png', new Response('image v1'));
    const a = await chargerPage(n);
    V('copies sans étiquette (ancien service worker) : redemandées une fois, la page reçoit les bons scripts', a.script === 'script v2', a.script);
    V('…et l\'image gardée reste', a.image === 'image v1', a.image);
  }

  console.log('\n═══ SW 4. Sans réseau, ou numéro de version qui tarde : comme avant ═══');
  {
    const n = navigateur(SW_ACTUEL); publier(n, 'v1');
    await chargerPage(n); await n.repos();
    publier(n, 'v2'); n.horsReseau(true);
    let a = null, erreur = null;
    try { a = await chargerPage(n); } catch (e) { erreur = e.message; }
    V('hors réseau : aucune erreur', erreur === null, erreur);
    V('hors réseau : la dernière page vue et ses scripts, depuis la copie', !!a && a.page === 'page v1' && a.script === 'script v1' && a.style === 'style v1', a);
    n.horsReseau(false); n.versionLente(true);
    const t0 = Date.now();
    const b = await chargerPage(n);
    const duree = Date.now() - t0;
    V('numéro de version qui ne répond pas : la page s\'ouvre quand même', b.page === 'page v2', b.page);
    V('…après une attente bornée', duree < 1000, duree);
    V('…et tant que le numéro n\'est pas connu, les scripts gardés servent, comme avant', b.script === 'script v1', b.script);
    n.versionLente(false); await n.repos();
    const c = await chargerPage(n);
    V('le numéro revenu : l\'ouverture suivante reçoit les scripts publiés', c.page === 'page v2' && c.script === 'script v2', c);
  }

  console.log('\n═══ SW 4 bis. Le réseau lâche juste après l\'arrivée de la page : jamais de page sans script ═══');
  {
    const n = navigateur(SW_ACTUEL); publier(n, 'v1');
    await chargerPage(n); await n.repos();
    publier(n, 'v2');
    n.enPanne.add('/partage/rendu_equite.js'); n.pendus.add('/partage/theme.css');
    const t0 = Date.now();
    const a = await chargerPage(n);
    const duree = Date.now() - t0;
    V('la page neuve est arrivée', a.page === 'page v2', a.page);
    V('script dont le réseau est coupé : la copie d\'avant est servie (pas d\'erreur, pas de page sans script)', a.script === 'script v1', a.script);
    V('feuille de style dont le réseau ne répond pas : la copie d\'avant, après une attente bornée', a.style === 'style v1' && duree < 1500, { style: a.style, duree });
    n.enPanne.clear(); n.pendus.clear(); await n.repos();
    const b = await chargerPage(n);
    V('réseau revenu : l\'ouverture suivante reçoit script et style publiés', b.script === 'script v2' && b.style === 'style v2', b);
    const nom = Object.keys(n.magasins).find(k => /-assets$/.test(k));
    V('aucune copie n\'a jamais été supprimée', !!nom && n.magasins[nom]._m.has(ORIGINE + '/partage/rendu_equite.js') && n.magasins[nom]._m.has(ORIGINE + '/assets/logo.png'));
    /* Serveur en erreur (page d'erreur de l'hébergeur à la place du script). */
    publier(n, 'v3'); n.reseau['/partage/rendu_equite.js'] = undefined;
    const c = await chargerPage(n);
    V('script introuvable en ligne (erreur 404) : la copie d\'avant plutôt qu\'une page d\'erreur', c.script === 'script v2', c.script);
  }

  console.log('\n═══ SW 5. Ce qui ne change pas ═══');
  {
    const n = navigateur(SW_ACTUEL); publier(n, 'v1');
    V('version.js n\'est jamais servi de la copie', await n.demander('/version.js') === null);
    V('une requête POST n\'est pas interceptée', n.intercepte('POST', '/partage/rendu_equite.js') === false);
    V('un script reste intercepté (servi de la copie)', n.intercepte('GET', '/partage/rendu_equite.js') === true);
    V('le nom des copies n\'a pas changé (les appareils gardent pages et images)', /VERSION = 'pm-sw-v2'/.test(SW_ACTUEL));
    V('polices : toujours servies de la copie', /isFont\(url\.hostname\)\) \{ e\.respondWith\(cacheFirst\(req, FONT_CACHE\)\)/.test(SW_ACTUEL));
  }

  console.log('\n═══ SW 6. Contre-épreuve : le service worker d\'avant sert l\'ancien script ═══');
  {
    let ancien = null;
    try { ancien = execSync('git show ' + AVANT_CORRECTIF + ':sw.js', { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
    V('le sw.js d\'avant le correctif est lisible dans l\'historique (clone complet exigé)', !!ancien && !/codeAJour/.test(ancien));
    if (ancien) {
      const n = navigateur(ancien); publier(n, 'v1');
      await chargerPage(n); await n.repos();
      publier(n, 'v2');
      const a = await chargerPage(n);
      V('avant : page neuve…', a.page === 'page v2', a.page);
      V('…mais script d\'avant — le défaut est bien celui que le correctif retire', a.script === 'script v1', a.script);
    }
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('  ✗ exception : ' + (e && e.stack || e)); process.exit(1); });
