/* ═══ BANC — partage/portail.js, le socle commun des pages (14/09/2026) ═══
   Le VRAI fichier est exécuté dans une fenêtre simulée (fetch, PERF,
   performance). On vérifie ce que les six copies faisaient chacune de leur
   côté, réuni en une seule fonction — puis que staff.html, première page
   à rejoindre le socle, n'a plus de copie locale. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8');

function fenetre(opts) {
  opts = opts || {};
  const appels = [], perf = [];
  const win = { VIEW_CODE: opts.viewCode, PERF: opts.perf ? { appel: (...a) => perf.push(a) } : undefined };
  const ctx = {
    console, JSON, Date, Math, String, Error, Promise, setTimeout, clearTimeout,
    AbortController, performance: { now: () => 42 },
    fetch: (url, o) => {
      appels.push({ url, body: JSON.parse(o.body) });
      if (opts.lent) return new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(new Error('abandon'))); });
      return Promise.resolve({ status: opts.status || 200, json: async () => opts.reponse || { success: true, data: { x: 1 } } });
    },
  };
  ctx.window = win; win.fetch = ctx.fetch;
  Object.assign(win, ctx);
  vm.createContext(ctx);
  if (opts.avant) vm.runInContext(opts.avant, ctx);
  vm.runInContext(SRC, ctx);
  return { win, appels, perf };
}

(async () => {
  console.log('═══ portail.js — miroirRead unique ═══');
  {
    const f = fenetre({ viewCode: 'CODEPAGE' });
    V('MIROIR_URL est posé par le socle', f.win.MIROIR_URL === 'https://miroir.planningmedic.workers.dev', f.win.MIROIR_URL);
    const r = await f.win.miroirRead(['config_admin', 'indispos_2027'], 'ADMINX');
    V('le code passé en paramètre est celui présenté au relais (staff.html)', f.appels[0].body.code === 'ADMINX', f.appels[0].body);
    V('les clés demandées partent telles quelles', JSON.stringify(f.appels[0].body.keys) === '["config_admin","indispos_2027"]');
    V('l\'adresse appelée est /read du miroir', f.appels[0].url === 'https://miroir.planningmedic.workers.dev/read');
    V('la réponse du relais est rendue telle quelle', r && r.success === true && r.data.x === 1, r);
  }
  {
    const f = fenetre({ viewCode: 'CODEPAGE' });
    await f.win.miroirRead(['planning_2027']);
    V('sans code en paramètre, c\'est le VIEW_CODE de la page (index, planning, indispos…)', f.appels[0].body.code === 'CODEPAGE', f.appels[0].body);
  }
  {
    /* Le cas réel : les pages déclarent `let VIEW_CODE = ''` puis l'assignent au
       login. Un `let` de script n'est PAS window.VIEW_CODE — le socle doit le
       lire par son nom. */
    const f = fenetre({ avant: "let VIEW_CODE = ''; VIEW_CODE = 'LETCODE';" });
    await f.win.miroirRead(['releve_liberal_2026', 'secteurs']);
    V('un VIEW_CODE déclaré par `let` dans la page est bien vu (suivi-liberal, index, planning…)', f.appels[0].body.code === 'LETCODE', f.appels[0].body);
  }
  {
    const f = fenetre({ viewCode: 'C', lent: true, avant: 'window.MIROIR_DELAI = 40;' });
    const t0 = Date.now();
    const r = await f.win.miroirRead(['x']);
    V('le délai se règle PAR PAGE (window.MIROIR_DELAI — admin.html : 10 s)', r === null && Date.now() - t0 < 1000, { r, ms: Date.now() - t0 });
  }
  {
    const f = fenetre({ viewCode: 'C', lent: true });
    const t0 = Date.now();
    const r = await f.win.miroirRead(['x'], null, { delai: 50 });
    V('délai dépassé → null (le repli serveur décide), sans exception', r === null && Date.now() - t0 < 1000, { r, ms: Date.now() - t0 });
  }
  {
    const f = fenetre({ viewCode: 'C', perf: true, reponse: { success: false, error: 'cle refusee' } });
    await f.win.miroirRead(['vacances_admin']);
    V('avec window.PERF, l\'appel est mesuré (index.html)', f.perf.length === 1 && f.perf[0][0] === 'miroir:vacances_admin', f.perf);
    V('…et un échec du relais est noté comme tel', /ECHEC/.test(f.perf[0][4]) && /cle refusee/.test(f.perf[0][4]), f.perf[0]);
  }
  {
    const f = fenetre({ viewCode: 'C' });
    await f.win.miroirRead(['x']);
    V('sans window.PERF, aucune mesure et aucune erreur', f.perf.length === 0 && f.appels.length === 1);
  }
  {
    const f = fenetre({ avant: "window.miroirRead = function () { return 'LOCALE'; }; window.MIROIR_URL = 'https://autre';" });
    V('une copie locale encore présente dans la page garde la main (migration page par page)',
      f.win.miroirRead() === 'LOCALE' && f.win.MIROIR_URL === 'https://autre');
  }

  console.log('\n═══ staff.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'staff.html'), 'utf8');
    V('staff.html charge partage/portail.js', /<script src="partage\/portail\.js"><\/script>/.test(page));
    V('…avant son script principal', page.indexOf('partage/portail.js') < page.indexOf("const API="));
    V('plus de miroirRead locale dans staff.html', !/function miroirRead\(/.test(page));
    V('plus d\'adresse du miroir écrite en dur dans staff.html', !/const MIROIR_URL/.test(page) && !/workers\.dev/.test(page));
    V('staff.html appelle toujours miroirRead (4 lectures)', (page.match(/miroirRead\(/g) || []).length === 4, (page.match(/miroirRead\(/g) || []).length);
  }
  console.log('\n═══ suivi-liberal.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'suivi-liberal.html'), 'utf8');
    V('suivi-liberal.html charge partage/portail.js après session.js', page.indexOf('partage/portail.js') > page.indexOf('partage/session.js') && page.indexOf('partage/portail.js') > 0);
    V('…avant son script principal', page.indexOf('partage/portail.js') < page.indexOf("let VIEW_CODE"));
    V('plus de miroirRead locale ni d\'adresse en dur', !/function miroirRead\(/.test(page) && !/const MIROIR_URL/.test(page) && !/workers\.dev/.test(page));
    V('ses 2 lectures du miroir sont intactes', (page.match(/miroirRead\(/g) || []).length === 2, (page.match(/miroirRead\(/g) || []).length);
  }
  console.log('\n═══ indispos.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'indispos.html'), 'utf8');
    V('indispos.html charge partage/portail.js après session.js', page.indexOf('partage/portail.js') > page.indexOf('partage/session.js') && page.indexOf('partage/portail.js') > 0);
    V('…avant repriseSession (le défaut TDZ du 26/08 devient impossible)', page.indexOf('partage/portail.js') < page.indexOf('async function repriseSession'));
    /* Les <link rel="preconnect"> vers le relais restent : ce sont des indices de
       performance pour le navigateur, pas une copie de l'adresse dans le code. */
    V('plus de miroirRead locale ni de const MIROIR_URL', !/function miroirRead\(/.test(page) && !/const MIROIR_URL/.test(page));
    V('ses 3 lectures du miroir sont intactes', (page.match(/miroirRead\(/g) || []).length === 3, (page.match(/miroirRead\(/g) || []).length);
  }
  console.log('\n═══ planning.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'planning.html'), 'utf8');
    V('planning.html charge partage/portail.js après session.js', page.indexOf('partage/portail.js') > page.indexOf('partage/session.js') && page.indexOf('partage/portail.js') > 0);
    V('…avant son script principal', page.indexOf('partage/portail.js') < page.indexOf('let VIEW_CODE'));
    V('plus de miroirRead locale ni de const MIROIR_URL', !/function miroirRead\(/.test(page) && !/const MIROIR_URL/.test(page));
    V('ses 6 lectures du miroir sont intactes', (page.match(/miroirRead\(/g) || []).length === 6, (page.match(/miroirRead\(/g) || []).length);
  }
  console.log('\n═══ Reprise de session PAR LE MIROIR, jusqu\'au bout (défaut de production du 14/09) ═══');
  /* Le 14/09 au soir, planning.html poussée avec le socle redemandait le code :
     la copie locale avait emporté `const _MIROIR_PRE` en partant. Le miroir
     répondait, puis la page plantait juste après et croyait la connexion
     ratée. Compter les appels ne suffit pas : on rejoue la reprise ENTIÈRE
     dans un navigateur simulé — app installée, code mémorisé, miroir qui
     répond — et l'écran de code doit rester fermé. */
  {
    const { JSDOM } = require('jsdom');
    async function reprise(page) {
      let html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8')
        .replace(/<script src="[^"]*lucide[^"]*"><\/script>/, '').replace(/<script src="version.js"><\/script>/, '');
      const appels = [], erreurs = [];
      const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://planningmedic.github.io/' + page,
        beforeParse(win) {
          win.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
          win.Element.prototype.scrollIntoView = function () {};
          win.navigator.sendBeacon = () => true;   // le journal de connexion de l'accueil part à fond perdu
          win.sessionStorage.setItem('pmViewCode', 'CODE1234');
          win.fetch = async (url, o) => {
            let body = null; try { body = JSON.parse(o.body); } catch (e) {}
            appels.push({ url: String(url), code: body && body.code, action: body && body.action });
            const Y = new Date().getFullYear();
            const data = { annees: { active: Y, annees: [Y] }, secteurs: [], config_admin: { medecins: [] } };
            data['planning_' + Y] = { ok: 1 }; data['affectations_' + Y] = { affectations: {} };
            data['indispos_' + Y] = { medecins: [], dates: [], data: {} }; data['indispos_' + (Y + 1)] = { medecins: [], dates: [], data: {} };
            return { ok: true, status: 200, json: async () => ({ success: true, data, identite: { id: 'X', name: 'X', role: 'mar', isAdmin: false } }) };
          };
          win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'session.js'), 'utf8'));
          win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8'));
          win.addEventListener('error', e => erreurs.push(String(e.message)));
        } });
      await new Promise(r => setTimeout(r, 600));
      const w = dom.window;
      const overlay = w.document.getElementById('viewAuthOverlay') || w.document.getElementById('loginScreen');
      const visible = overlay ? (overlay.style.display !== 'none' && w.getComputedStyle(overlay).display !== 'none') : null;
      const portal = w.document.getElementById('portal');
      const portalVisible = portal ? portal.style.display !== 'none' : null;
      let myId = null; try { myId = w.eval('typeof MY_ID !== "undefined" ? MY_ID : null'); } catch (e) {}
      return { appels, erreurs, visible, overlayTrouve: !!overlay, portalVisible, myId };
    }
    const rp = await reprise('planning.html');
    V('planning : le miroir est interrogé avec le code mémorisé', rp.appels.some(a => /workers\.dev\/read/.test(a.url) && a.code === 'CODE1234'), rp.appels);
    V('planning : aucune erreur de script pendant la reprise', rp.erreurs.length === 0, rp.erreurs);
    V('planning : l\'écran de code reste fermé (la page s\'ouvre sans ressaisie)', rp.overlayTrouve && rp.visible === false, rp);
    V('planning : l\'identité livrée par le miroir est bien posée', rp.myId === 'X', rp.myId);
    V('planning : le serveur n\'est pas réveillé quand le miroir répond', !rp.appels.some(a => /script\.google/.test(a.url)), rp.appels.map(a => a.url));
    const ri = await reprise('index.html');
    V('accueil : le miroir est interrogé avec le code mémorisé', ri.appels.some(a => /workers\.dev\/read/.test(a.url) && a.code === 'CODE1234'), ri.appels);
    V('accueil : aucune erreur de script pendant la reprise', ri.erreurs.length === 0, ri.erreurs);
    V('accueil : l\'écran de code reste fermé et le portail est affiché', ri.overlayTrouve && ri.visible === false && ri.portalVisible === true, ri);
    /* L'accueil s'affiche de façon OPTIMISTE avant même la réponse : un écran ouvert
       ne prouve rien. La preuve, c'est l'identité posée par le miroir. */
    V('accueil : l\'identité livrée par le miroir est bien posée (la reprise est allée au bout)', ri.myId === 'X', ri.myId);
    V('accueil : le serveur n\'est pas réveillé (le journal part à fond perdu)', !ri.appels.some(a => /script\.google/.test(a.url)), ri.appels.map(a => a.url));
  }
  console.log('\n═══ index.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    V('index.html charge partage/portail.js après session.js', page.indexOf('partage/portail.js') > page.indexOf('partage/session.js') && page.indexOf('partage/portail.js') > 0);
    V('plus de miroirRead locale ni de const MIROIR_URL', !/function miroirRead\(/.test(page) && !/const MIROIR_URL/.test(page));
    V('ses 7 lectures du miroir sont intactes', (page.match(/miroirRead\(/g) || []).length === 7, (page.match(/miroirRead\(/g) || []).length);
  }
  console.log('\n═══ admin.html a rejoint le socle ═══');
  {
    const page = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    V('admin.html charge partage/portail.js avant dispo_jour.js', page.indexOf('partage/portail.js') > 0 && page.indexOf('partage/portail.js') < page.indexOf('partage/dispo_jour.js'));
    V('plus de miroirRead locale ni de const MIROIR_URL', !/function miroirRead\(/.test(page) && !/const MIROIR_URL/.test(page));
    V('le délai de 10 s du comité est conservé, posé par la page', /window\.MIROIR_DELAI = 10000;/.test(page));
    V('ses 11 lectures du miroir sont intactes', (page.match(/miroirRead\(/g) || []).length === 11, (page.match(/miroirRead\(/g) || []).length);
    V('le dépôt au journal (_journalDeposer) utilise toujours MIROIR_URL', /fetch\(MIROIR_URL \+ '\/ecrire'/.test(page));
  }
  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  if (ko) process.exit(1);
})();
