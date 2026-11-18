/* ═══ BANC — TOPOS / BIBLIO : dossiers fermés à l'ouverture (21/09/2026) ═══
   La vraie page index.html, pilotée au clic. Un dossier arrive FERMÉ ; son
   en-tête l'ouvre et le referme ; un topo à document unique s'ouvre comme avant.
   (18/11/2026) + rangement par année : le VRAI listTopos/getTopo de portail.gs
   sur un faux Drive (étagères « 2026 », « 2027 »), puis la page pilotée au clic
   — écran des années → topos de l'année → retour. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { extraireFonction } = require('./stubs');
const PORTAIL = path.join(__dirname, '..', 'gas', 'portail.gs');

/* ── Faux Drive : dossiers et fichiers chaînés à leurs parents ── */
let nId = 0;
const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
function dossier(nom, contenu) {
  const d = { id: 'D' + (++nId), nom, fichiers: [], sous: [], parents: [] };
  (contenu || []).forEach(x => { x.parents.push(d); (x.estDossier ? d.sous : d.fichiers).push(x); });
  d.estDossier = true;
  d.getId = () => d.id; d.getName = () => d.nom; d.getUrl = () => 'https://drive/' + d.id;
  d.getFiles = () => iter(d.fichiers); d.getFolders = () => iter(d.sous); d.getParents = () => iter(d.parents);
  return d;
}
function pdf(nom, taille) {
  const f = { id: 'F' + (++nId), nom, parents: [] };
  f.getId = () => f.id; f.getName = () => f.nom; f.getSize = () => taille || 70000;
  f.getMimeType = () => (/\.pdf$/i.test(nom) ? 'application/pdf' : 'application/json');
  f.getLastUpdated = () => new Date('2026-10-01T08:00:00Z');
  f.getParents = () => iter(f.parents);
  f.getBlob = () => ({ getContentType: () => 'application/pdf', getBytes: () => [1, 2, 3] });
  return f;
}
function serveur(racine, horsRacine) {
  const tous = {};
  const indexer = d => { d.fichiers.forEach(f => { tous[f.id] = f; }); d.sous.forEach(indexer); };
  indexer(racine); (horsRacine || []).forEach(f => { tous[f.id] = f; });
  const c = vm.createContext({
    console, JSON, Date, String, Object, Array, Math, RegExp,
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    Utilities: { formatDate: d => new Date(d).toISOString().slice(0, 10), base64Encode: b => Buffer.from(b).toString('base64') },
    DriveApp: {
      getFoldersByName: n => iter(n === 'Planning-Med-Topos' ? [racine] : []),
      createFolder: () => { throw new Error('ne doit pas créer'); },
      getFileById: id => { if (!tous[id]) throw new Error('introuvable'); return tous[id]; },
    },
  });
  vm.runInContext(fs.readFileSync(PORTAIL, 'utf8').match(/const TOPOS_FOLDER *=[^;]+;/)[0], c);
  ['_isPdf', '_stripPdf', '_fileMeta', '_fileWithinFolder', '_getToposFolder', '_toposDe', 'listTopos', 'getTopo']
    .forEach(n => vm.runInContext(extraireFonction(PORTAIL, n), c));
  return c;
}
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

/* ── Drive rangé par année, avec un reste à la racine ── */
const p26a = pdf('Diapo 1.pdf'), p26b = pdf('Diapo 2.pdf'), p27 = pdf('Topo seul 2027.pdf'), pRac = pdf('Vieux topo.pdf');
const pProfond = pdf('Trop profond.pdf'), intrus = pdf('Hors dossier.pdf');
const racine = dossier('Planning-Med-Topos', [
  dossier('2026', [dossier('Céfiderocol 16_10', [p26a, p26b, pdf('notes.json')]), dossier('Vide 01_01', [])]),
  dossier('2027', [p27, dossier('Sous-topo', [dossier('Encore', [pProfond])])]),
  dossier('2025', []),                                        // étagère vide → aucun topo
  pRac,                                                       // resté à la racine
  dossier('Programme 2026 bis', [pdf('A.pdf')]),              // nom qui CONTIENT une année : un topo, pas une étagère
]);
let sortie;
console.log('\n═══ 0. Serveur — topos rangés par année (vrai portail.gs, faux Drive) ═══');
{
  const c = serveur(racine, [intrus]);
  const r = sortie = vm.runInContext('listTopos()', c);
  const vus = r.topos.map(t => t.title + '|' + t.annee);
  V('la liste répond', r.success === true, r);
  V('4 topos : Céfiderocol (2026), Topo seul 2027 (2027), Vieux topo (racine), Programme 2026 bis (racine)',
    r.count === 4 && JSON.stringify(vus.slice().sort()) === JSON.stringify(['Céfiderocol 16_10|2026', 'Programme 2026 bis|', 'Topo seul 2027|2027', 'Vieux topo|'].sort()), vus);
  const cef = r.topos.find(t => t.title === 'Céfiderocol 16_10');
  V('un sous-dossier dans une année reste un topo à plusieurs documents (PDF seuls)', cef && cef.multi && cef.docs.length === 2, cef);
  V('un PDF posé dans une année est un topo à 1 document', r.topos.some(t => t.title === 'Topo seul 2027' && !t.multi && t.annee === '2027'));
  V('un dossier « 2026 » n\'apparaît pas comme un topo', !r.topos.some(t => /^20\d\d$/.test(t.title)), vus);
  V('dossier vide ou trop profond : ignoré, comme avant', !r.topos.some(t => /Vide|Sous-topo|Trop profond/.test(t.title)), vus);
  V('tri alphabétique conservé', JSON.stringify(r.topos.map(t => t.title)) === JSON.stringify(r.topos.map(t => t.title).slice().sort((a, b) => a.localeCompare(b, 'fr'))));

  const o = vm.runInContext('getTopo(' + JSON.stringify(p26a.id) + ')', c);
  V('PDF rangé sous une année (racine > 2026 > topo > PDF) : ouvert', o.success === true && !!o.dataB64, o);
  V('PDF resté à la racine : ouvert', vm.runInContext('getTopo(' + JSON.stringify(pRac.id) + ')', c).success === true);
  const h = vm.runInContext('getTopo(' + JSON.stringify(intrus.id) + ')', c);
  V('PDF hors du dossier Topos : accès refusé', h.success === false && h.error === 'Accès refusé', h);

  const avant = dossier('Planning-Med-Topos', [dossier('Ablation_FA 22_05', [pdf('X.pdf')]), pdf('Y.pdf')]);
  const r2 = vm.runInContext('listTopos()', serveur(avant));
  V('Drive pas encore rangé : mêmes topos qu\'avant, sans année', r2.count === 2 && r2.topos.every(t => t.annee === ''), r2.topos);
}

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

  console.log('\n═══ 1 bis. Page — écran des années, puis les topos de l\'année ═══');
  {
    const titre = () => doc.getElementById('toposTitre').textContent;
    const compte = () => doc.getElementById('toposCount').textContent;
    const annees = () => [...doc.querySelectorAll('#toposList .topo-annee')];
    const libs = () => annees().map(b => b.querySelector('.spec-name').textContent + ':' + b.querySelector('.count').textContent);
    const retour = () => doc.querySelector('#toposView .btn-back').click();
    let accueil = 0; const vraiAccueil = w.backToHome; w.backToHome = () => { accueil++; };
    w.miroirTuile = async () => JSON.parse(JSON.stringify(sortie));
    await w.openTopos();
    V('écran 1 : les années, la plus récente en haut, « Autres » en dernier', JSON.stringify(libs()) === JSON.stringify(['2027:1', '2026:1', 'Autres:2']), libs());
    V('écran 1 : titre et total de tous les topos', titre() === 'Topos / biblio' && compte() === '4 topos', titre() + ' / ' + compte());
    V('écran 1 : aucune carte de topo tant qu\'aucune année n\'est choisie', !doc.querySelector('#toposList .topo-card'));
    annees()[1].click();
    const cartes = [...doc.querySelectorAll('#toposList .topo-card')];
    V('clic sur 2026 → ses topos seulement, titre « Topos 2026 »', titre() === 'Topos 2026' && cartes.length === 1 && /Céfiderocol/.test(cartes[0].textContent) && compte() === '1 topo', titre() + ' / ' + compte());
    retour();
    V('Retour depuis une année → la liste des années (pas l\'accueil)', annees().length === 3 && accueil === 0 && titre() === 'Topos / biblio');
    annees()[2].click();
    V('« Autres » → ce qui est resté à la racine', titre() === 'Autres topos' && doc.querySelectorAll('#toposList .topo-card').length === 2, titre());
    retour(); retour();
    V('Retour depuis les années → l\'accueil', accueil === 1, accueil);
    annees()[0].click();
    await w.openTopos();
    V('rouvrir les topos → repart de l\'écran des années', annees().length === 3 && titre() === 'Topos / biblio');

    w.renderToposList({ success:true, count:0, topos:[] });
    V('aucun topo : message vide, sans erreur', /Aucun topo/.test(doc.getElementById('toposList').textContent));
    w.renderToposList({ success:true, count:1, topos:[{ multi:false, title:'Seul', date:'2026-09-01', docs:[{ id:'z', title:'Seul', size:1 }] }] });
    retour();
    V('liste à plat (aucune année) : Retour va directement à l\'accueil', accueil === 2 && !annees().length, accueil);
    w.backToHome = vraiAccueil;
  }

  console.log('\n═══ 2. Contrat SOURCE : chaque icône demandée existe dans le lot embarqué ═══');
  {
    const page = fs.readFileSync('../index.html', 'utf8');
    const lot = fs.readFileSync('../assets/vendor/lucide-icons.js', 'utf8');
    const corps = ['renderToposList', 'renderToposAnnees', '_toposCartes']
      .map(n => (page.match(new RegExp('function ' + n + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n')) || [''])[0]).join('\n');
    const icones = [...new Set([...corps.matchAll(/data-lucide="([a-z0-9-]+)"/g)].map(m => m[1]))];
    const absentes = icones.filter(n => !new RegExp('["\']' + n + '["\']').test(lot));
    V('l\'écran des topos demande des icônes (' + icones.join(', ') + ')', icones.length >= 3, icones);
    V('aucune n\'est absente du lot local (une icône absente ne s\'affiche pas)', absentes.length === 0, absentes);
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
