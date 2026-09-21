/* ═══ BANC — TOPOS / BIBLIO : dossiers fermés à l'ouverture (21/09/2026) ═══
   La vraie page index.html, pilotée au clic. Un dossier arrive FERMÉ ; son
   en-tête l'ouvre et le referme ; un topo à document unique s'ouvre comme avant. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

(async () => {
  console.log('\n═══ 1. Dossiers de topos — fermés d\'emblée, ouverts au clic ═══');
  const vcons = new VirtualConsole(); const erreurs = [];
  vcons.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync('../index.html', 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vcons,
    url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
    beforeParse(win) {
      win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8'));
      win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
      win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
      win.Element.prototype.scrollIntoView = function () {};
      win.scrollTo = () => {};
    } });
  const w = dom.window, doc = w.document;
  w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
  await new Promise(r => setTimeout(r, 400));
  V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));

  const ouverts = []; w.openDoc = (id) => { ouverts.push(id); };
  w.renderToposList({ success:true, count:3, topos: [
    { multi:true,  title:'Dossier A', date:'2026-09-07', docs:[{ id:'a1', title:'Doc A1', size:1000 }, { id:'a2', title:'Doc A2', size:2000 }] },
    { multi:true,  title:'Dossier B', date:'2026-09-10', docs:[{ id:'b1', title:'Doc B1', size:3000 }] },
    { multi:false, title:'Topo seul', date:'2026-09-01', docs:[{ id:'s1', title:'Topo seul', size:500 }] },
  ] });
  const cartes = [...doc.querySelectorAll('#toposList .topo-card')];
  const [A, B, S] = cartes;
  const tete = c => c.querySelector('.topo-card-head'), liste = c => c.querySelector('.doc-list');
  const visible = c => w.getComputedStyle(liste(c)).display !== 'none';
  V('3 cartes : 2 dossiers, 1 topo seul', cartes.length === 3 && !!tete(A) && !!tete(B) && S.classList.contains('single'));
  V('à l\'arrivée, les 2 dossiers sont FERMÉS (documents masqués)', !visible(A) && !visible(B) && !A.classList.contains('open') && !B.classList.contains('open'));
  V('fermé : l\'en-tête l\'annonce (aria-expanded=false) et se comporte en bouton', tete(A).getAttribute('aria-expanded') === 'false' && tete(A).getAttribute('role') === 'button' && tete(A).getAttribute('tabindex') === '0');
  V('le titre et le nombre de documents restent lisibles dossier fermé', /Dossier A/.test(tete(A).textContent) && /2 documents/.test(tete(A).textContent));

  V('orthographe : « 1 document » sans s, « 2 documents » avec', /(^|\D)1 document ·/.test(tete(B).textContent) && !/1 documents/.test(tete(B).textContent) && /2 documents ·/.test(tete(A).textContent), tete(B).textContent);

  tete(A).click();
  V('clic sur l\'en-tête → le dossier s\'ouvre, ses 2 documents apparaissent', visible(A) && liste(A).querySelectorAll('.doc-row').length === 2 && tete(A).getAttribute('aria-expanded') === 'true');
  V('l\'autre dossier reste fermé', !visible(B));
  V('ouvrir un dossier n\'ouvre aucun document', ouverts.length === 0, ouverts);

  liste(A).querySelector('.doc-row').click();
  V('clic sur un document → il s\'ouvre, le dossier reste ouvert', ouverts.join() === 'a1' && visible(A), ouverts);

  tete(A).click();
  V('second clic sur l\'en-tête → le dossier se referme', !visible(A) && tete(A).getAttribute('aria-expanded') === 'false');

  tete(B).dispatchEvent(new w.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
  V('au clavier (Entrée) → le dossier s\'ouvre aussi', visible(B) && tete(B).getAttribute('aria-expanded') === 'true');
  tete(B).dispatchEvent(new w.KeyboardEvent('keydown', { key:' ', bubbles:true, cancelable:true }));
  V('au clavier (Espace) → il se referme', !visible(B));

  S.click();
  V('topo à document unique : inchangé, le clic ouvre le document', ouverts.join() === 'a1,s1' && !S.querySelector('.topo-chev'), ouverts);

  w.renderToposList({ success:true, count:1, topos:[{ multi:true, title:'Dossier A', date:'2026-09-07', docs:[{ id:'a1', title:'Doc A1', size:1000 }] }] });
  V('après un nouveau chargement de la liste, tout repart fermé', !visible(doc.querySelector('#toposList .topo-card')));

  console.log('\n═══ 2. Contrat SOURCE : chaque icône demandée existe dans le lot embarqué ═══');
  {
    const page = fs.readFileSync('../index.html', 'utf8');
    const lot = fs.readFileSync('../assets/vendor/lucide-icons.js', 'utf8');
    const corps = (page.match(/function renderToposList\(data\)\{[\s\S]*?\n\}\n/) || [''])[0];
    const icones = [...new Set([...corps.matchAll(/data-lucide="([a-z0-9-]+)"/g)].map(m => m[1]))];
    const absentes = icones.filter(n => !new RegExp('["\']' + n + '["\']').test(lot));
    V('l\'écran des topos demande des icônes (' + icones.join(', ') + ')', icones.length >= 3, icones);
    V('aucune n\'est absente du lot local (une icône absente ne s\'affiche pas)', absentes.length === 0, absentes);
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
