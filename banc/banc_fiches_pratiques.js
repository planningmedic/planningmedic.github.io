/* ═══ BANC — TUILE « FICHES PRATIQUES » (01/10/2026) ═══
   Ex-« Recommandations ». Un dossier de 1er niveau peut désormais être un
   GROUPE de sources (Recommandations > RFE SFAR > thème > PDF) à côté des
   SOURCES d'avant (Fiches mémo chirurgie lourde > spécialité > PDF).
   1. Serveur : le VRAI listRecommandations de portail.gs sur un faux Drive.
   2. Serveur : getRecommandation ouvre un PDF au 4e niveau, refuse l'extérieur.
   3. Page : la VRAIE index.html, nourrie par la sortie du serveur, pilotée
      au clic — groupe → source → thèmes → fiche, et retour d'un écran à la fois. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

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
      getFoldersByName: n => iter(n === 'Planning-Med-Recommandations' ? [racine] : []),
      createFolder: () => { throw new Error('ne doit pas créer'); },
      getFileById: id => { if (!tous[id]) throw new Error('introuvable'); return tous[id]; },
    },
  });
  vm.runInContext(fs.readFileSync(PORTAIL, 'utf8').match(/const RECOS_FOLDER *=[^;]+;/)[0], c);
  ['_isPdf', '_stripPdf', '_fileMeta', '_fileWithinFolder', '_getRecosFolder', '_recosTri', '_recosPdfs',
   '_recosSource', '_recosEstGroupe', '_recosTriNom', 'listRecommandations', 'getRecommandation']
    .forEach(n => vm.runInContext(extraireFonction(PORTAIL, n), c));
  c.RACINE = racine;
  return c;
}

/* ── L'arborescence voulue, les deux formes mélangées ── */
const ficheSfar  = pdf('RFE 2026 - Prise en charge des voies aériennes.pdf');
const ficheSfar2 = pdf('RFE 2019 - Jeûne préopératoire.pdf');
const ficheSpilf = pdf('SPILF 2024 - Antibioprophylaxie.pdf');
const ficheMemo  = pdf('Duodénopancréatectomie céphalique.pdf', 123456);
const ficheAnc   = pdf('Ancienne 2022 - Fiche.pdf');
const racine = dossier('Planning-Med-Recommandations', [
  dossier('Recommandations', [                                  // GROUPE (4 niveaux)
    dossier('RFE SFAR', [dossier('02 Jeûne', [ficheSfar2]), dossier('01 Voies aériennes', [ficheSfar, pdf('index.json')])]),
    dossier('Recommandations SPILF', [dossier('01 Antibiothérapie', [ficheSpilf])]),
    dossier('Recommandations SRLF', [dossier('01 Réanimation', [])]),   // source vide dans le groupe
  ]),
  dossier('Fiches mémo chirurgie lourde', [                     // SOURCE (3 niveaux)
    dossier('01 Chirurgie digestive', [ficheMemo]),
    dossier('02 Chirurgie thoracique', []),
  ]),
  dossier('Ancienne source', [dossier('01 Thème', [ficheAnc])]), // SOURCE d'avant, intacte
  dossier('Source vide', [dossier('01 Thème vide', [])]),        // source vide → invisible
  dossier('Groupe vide', [dossier('Société', [dossier('01 Thème', [])])]),   // groupe vide → invisible
]);
const intrus = pdf('Hors dossier.pdf');

let sortie;
console.log('\n═══ 1. Serveur — règle générique groupe / source ═══');
{
  const c = serveur(racine, [intrus]);
  const r = sortie = vm.runInContext('listRecommandations()', c);
  const noms = r.sources.map(s => s.nom);
  V('la liste répond', r.success === true, r);
  V('trois entrées visibles, dans l\'ordre', JSON.stringify(noms) === JSON.stringify(['Ancienne source', 'Fiches mémo chirurgie lourde', 'Recommandations']), noms);
  const grp = r.sources.find(s => s.nom === 'Recommandations');
  V('« Recommandations » (sous-dossiers qui contiennent des dossiers) est un GROUPE', grp && grp.groupe === true && Array.isArray(grp.sources), grp && Object.keys(grp));
  V('le groupe liste ses sociétés savantes non vides (SRLF vide écartée)', grp && JSON.stringify(grp.sources.map(s => s.nom)) === JSON.stringify(['Recommandations SPILF', 'RFE SFAR']), grp && grp.sources.map(s => s.nom));
  V('compte du groupe = somme de ses fiches (3)', grp && grp.count === 3, grp && grp.count);
  const sfar = grp && grp.sources.find(s => s.nom === 'RFE SFAR');
  V('une source du groupe garde ses thèmes, ordre numérique (01 puis 02)', sfar && JSON.stringify(sfar.themes.map(t => t.nom)) === JSON.stringify(['01 Voies aériennes', '02 Jeûne']), sfar && sfar.themes);
  V('les fichiers non PDF sont ignorés', sfar && sfar.themes[0].docs.length === 1, sfar && sfar.themes[0].docs);
  const memo = r.sources.find(s => s.nom === 'Fiches mémo chirurgie lourde');
  V('« Fiches mémo chirurgie lourde » (sous-dossiers sans dossier) reste une SOURCE', memo && !memo.groupe && Array.isArray(memo.themes), memo);
  V('la spécialité vide n\'apparaît pas, la pleine oui', memo && memo.themes.length === 1 && memo.themes[0].nom === '01 Chirurgie digestive', memo && memo.themes);
  const doc = memo && memo.themes[0].docs[0];
  V('nom de fichier libre : titre = nom du fichier sans .pdf', doc && doc.title === 'Duodénopancréatectomie céphalique', doc);
  V('…sans année ni source ajoutées', doc && !/\b(19|20)\d{2}\b/.test(doc.title) && !('source' in doc) && !('an' in doc), doc);
  const anc = r.sources.find(s => s.nom === 'Ancienne source');
  V('une source à 3 niveaux garde exactement la forme d\'avant', anc && !anc.groupe && anc.count === 1 && anc.themes[0].nom === '01 Thème' && anc.themes[0].docs[0].id === ficheAnc.id, anc);
  V('source vide : invisible', !noms.includes('Source vide'), noms);
  V('groupe vide : invisible', !noms.includes('Groupe vide'), noms);
  V('compte total = 5 fiches', r.count === 5, r.count);
  V('aucun nom de dossier dans le code serveur de la règle',
    !/Recommandations'|Fiches mémo/.test(['_recosSource', '_recosEstGroupe', 'listRecommandations'].map(n => extraireFonction(PORTAIL, n)).join('\n')));

  // Uniquement des sources à 3 niveaux (avant réorganisation du Drive) : rien ne change
  const avant = dossier('Planning-Med-Recommandations', [
    dossier('RFE SFAR', [dossier('01 Voies aériennes', [pdf('RFE 2026 - A.pdf')])]),
    dossier('Recommandations SPILF', [dossier('01 Antibio', [pdf('SPILF 2024 - B.pdf')])]),
  ]);
  const r2 = vm.runInContext('listRecommandations()', serveur(avant));
  V('Drive pas encore réorganisé : deux sources, aucun groupe (comportement d\'avant)',
    r2.sources.length === 2 && r2.sources.every(s => !s.groupe && s.themes.length === 1), r2.sources);
}

console.log('\n═══ 2. Serveur — ouverture d\'un PDF au 4e niveau ═══');
{
  const c = serveur(racine, [intrus]);
  const r = vm.runInContext('getRecommandation(' + JSON.stringify(ficheSfar.id) + ')', c);
  V('PDF au 4e niveau (racine > groupe > source > thème) : ouvert', r.success === true && r.name === ficheSfar.nom && !!r.dataB64, r);
  const r3 = vm.runInContext('getRecommandation(' + JSON.stringify(ficheMemo.id) + ')', c);
  V('fiche mémo (3e niveau) : ouverte', r3.success === true, r3);
  const r4 = vm.runInContext('getRecommandation(' + JSON.stringify(intrus.id) + ')', c);
  V('PDF hors du dossier racine : accès refusé', r4.success === false && r4.error === 'Accès refusé', r4);
  const r5 = vm.runInContext('getRecommandation("")', c);
  V('identifiant manquant : refusé', r5.success === false, r5);
}

(async () => {
  console.log('\n═══ 3. Page — la vraie index.html, pilotée au clic ═══');
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

  const tuile = vm.runInContext(doc.documentElement.outerHTML.match(/const TILES = \[[\s\S]*?\n\];/)[0] + ';TILES', vm.createContext({}))
    .find(t => t.key === 'recommandations');
  V('tuile renommée « Fiches pratiques », clé interne inchangée', tuile && tuile.title === 'Fiches pratiques' && tuile.view === 'recommandations', tuile);
  V('sous-titre de la tuile', tuile && tuile.sub === 'Recommandations des sociétés savantes (SFAR, SPILF, SRLF) et fiches mémo de chirurgie lourde.', tuile && tuile.sub);

  // Ce que le serveur renvoie, plus une entrée vide glissée : la page doit l'écarter aussi.
  const donnees = JSON.parse(JSON.stringify(sortie));
  donnees.sources.push({ nom: 'Fantôme vide', count: 0, themes: [] });
  const appels = [];
  w.miroirTuile = async (cle, action) => { appels.push(cle + '/' + action); return donnees; };
  const ouverts = []; w.openDoc = (id, el, action) => { ouverts.push(id + '|' + action); };
  const titre = () => doc.getElementById('recoTitre').textContent;
  const boutons = () => [...doc.querySelectorAll('#recoList .reco-src')];
  const libelles = () => boutons().map(b => b.querySelector('.spec-name').textContent);
  const retour = () => doc.querySelector('#recommandationsView .btn-back').click();
  const vue = id => doc.getElementById(id).style.display;

  await w.openRecommandations();
  V('la liste est lue sous la clé recommandations', appels.join() === 'recommandations/listRecommandations', appels);
  V('écran 1 : titre « Fiches pratiques »', titre() === 'Fiches pratiques', titre());
  V('écran 1 : trois entrées, l\'entrée vide n\'apparaît pas', JSON.stringify(libelles()) === JSON.stringify(['Ancienne source', 'Fiches mémo chirurgie lourde', 'Recommandations']), libelles());

  boutons()[2].click();                                       // Recommandations (groupe)
  V('écran 2 (groupe) : titre « Recommandations »', titre() === 'Recommandations', titre());
  V('écran 2 : la liste des sociétés savantes', JSON.stringify(libelles()) === JSON.stringify(['Recommandations SPILF', 'RFE SFAR']), libelles());

  boutons()[1].click();                                       // RFE SFAR
  V('écran 3 (source) : titre « RFE SFAR »', titre() === 'RFE SFAR', titre());
  const themes = [...doc.querySelectorAll('#recoList .proto-spec .spec-name')].map(e => e.textContent);
  V('écran 3 : thèmes sans leur numéro d\'ordre', JSON.stringify(themes) === JSON.stringify(['Voies aériennes', 'Jeûne']), themes);
  const ligne = doc.querySelector('#recoList .doc-row');
  V('fiche reco : titre et année séparés', ligne.querySelector('.doc-title').textContent === 'Prise en charge des voies aériennes' && ligne.querySelector('.doc-size').textContent === '2026', ligne.textContent);
  ligne.click();
  V('clic sur la fiche (4e niveau) → ouverture par getRecommandation', ouverts.join() === ficheSfar.id + '|getRecommandation', ouverts);

  retour();
  V('retour depuis la source → le groupe', titre() === 'Recommandations' && libelles().length === 2, titre());
  retour();
  V('retour depuis le groupe → la liste', titre() === 'Fiches pratiques' && libelles().length === 3, titre());

  boutons()[1].click();                                       // Fiches mémo (source)
  V('source à 3 niveaux : ouverte directement, sans écran de groupe', titre() === 'Fiches mémo chirurgie lourde' && !boutons().length, titre());
  const spe = [...doc.querySelectorAll('#recoList .proto-spec .spec-name')].map(e => e.textContent);
  V('la spécialité s\'affiche sans « 01 »', JSON.stringify(spe) === JSON.stringify(['Chirurgie digestive']), spe);
  const lm = doc.querySelector('#recoList .doc-row');
  V('nom libre : titre = nom du fichier', lm.querySelector('.doc-title').textContent === 'Duodénopancréatectomie céphalique', lm.textContent);
  V('…et pas d\'année fantôme (la taille à la place)', !/\b(19|20)\d{2}\b/.test(lm.querySelector('.doc-size').textContent), lm.querySelector('.doc-size').textContent);
  retour();
  V('retour depuis une source à 3 niveaux → la liste', titre() === 'Fiches pratiques' && libelles().length === 3, titre());
  retour();
  V('retour depuis la liste → l\'accueil', vue('recommandationsView') === 'none' && vue('tilesView') !== 'none', [vue('recommandationsView'), vue('tilesView')]);

  // Rouvrir la tuile repart toujours de la liste, même après être sorti d'un groupe
  await w.openRecommandations();
  boutons()[2].click(); boutons()[0].click();
  await w.openRecommandations();
  V('rouvrir la tuile repart de la liste', titre() === 'Fiches pratiques' && libelles().length === 3, titre());
  retour();

  // Un Drive sans aucun PDF
  w.miroirTuile = async () => ({ success:true, count:0, sources:[] });
  await w.openRecommandations();
  V('aucune fiche : message d\'attente, aucun bouton', /Aucune fiche/.test(doc.getElementById('recoList').textContent) && !boutons().length);

  V('aucune erreur JavaScript pendant la navigation', erreurs.length === 0, erreurs.slice(0, 2));

  console.log('\nbanc_fiches_pratiques : ' + ok + ' ✓ / ' + ko + ' ✗');
  process.exit(ko ? 1 : 0);
})();
