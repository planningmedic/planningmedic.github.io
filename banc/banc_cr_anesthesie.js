/* ═══ BANC — CR D'ANESTHÉSIE (29/10/2026) ═══
   Le générateur (cr-anesthesie/) avait été retiré le 07/09/2026 : il affichait le
   logo de l'établissement et la liste nominative des praticiens sur une page
   publique. Il revient par décision du responsable, SANS logo et SANS aucun nom :
   anesthésiste et chirurgien se tapent en texte libre.

   Ce scénario garde ces verrous, puis charge la page TELLE QUELLE dans un
   navigateur simulé et la remplit comme un MAR : intervention, noms tapés, copie.

   Ce que le banc ne prouve PAS : l'ouverture réelle sur les PC du bloc
   (filtrage du réseau de l'hôpital), le collage dans le dossier patient. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const DOSSIER = path.join(__dirname, '..', 'cr-anesthesie');
const lire = f => fs.readFileSync(path.join(DOSSIER, f), 'utf8');
const fichiers = fs.readdirSync(DOSSIER);
const textes = fichiers.filter(f => /\.(js|html|css)$/.test(f));

console.log('\n═══ 1. Aucun nom, aucun logo, aucun appel réseau ═══');
{
  /* Un titre suivi d'un prénom et d'un nom en capitales : « Dr Prénom NOM ». */
  const NOM = /\b(Dr|Pr)\.?\s+[A-ZÀ-Ý][a-zà-ÿ'-]+\s+[A-ZÀ-Ý]{2,}/;
  const trouves = textes.filter(f => NOM.test(lire(f)));
  V('aucun « Dr/Pr Prénom NOM » dans le module', trouves.length === 0, trouves);

  /* Contre-preuve : le motif attrape bien une liste comme l'ancienne. */
  V('contre-preuve : le motif reconnaît un nom', NOM.test('"Dr Jeanne EXEMPLE"'));

  const ctx = { window: {} };
  require('vm').runInNewContext(lire('data.js') + ';this.D = DATA;', ctx);
  V('la liste des anesthésistes est vide', Array.isArray(ctx.D.anesthesistes) && ctx.D.anesthesistes.length === 0);
  const pleines = Object.entries(ctx.D.specialites).filter(([, v]) => (v.chirurgiens || []).length).map(([k]) => k);
  V('toutes les listes de chirurgiens sont vides', pleines.length === 0, pleines);

  const images = fichiers.filter(f => /\.(png|jpe?g|gif|svg|webp)$/i.test(f));
  V('une seule image : l\'icône du laryngoscope', JSON.stringify(images) === '["laryngoscope.png"]', images);
  V('aucune balise <img> ne vise un logo', !/<img[^>]*logo/i.test(lire('index.html')));
  V('aucun nom d\'établissement dans l\'en-tête', !/Centre Hospitalier/i.test(lire('index.html')));

  const reseau = textes.filter(f => /\bfetch\s*\(|XMLHttpRequest|script\.google|https?:\/\//.test(lire(f)));
  V('aucun appel réseau ni adresse externe (page autonome)', reseau.length === 0, reseau);
}

console.log('\n═══ 2. La page fonctionne : intervention, noms tapés, compte rendu ═══');
{
  /* Les scripts sont injectés dans la page dans l'ordre de index.html. */
  let html = lire('index.html');
  const ordre = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);
  V('les cinq scripts sont chargés par la page', JSON.stringify(ordre) === '["data.js","rules.js","ui.js","report.js","app.js"]', ordre);
  for (const f of ordre) html = html.replace(`<script src="./${f}"></script>`, `<script>${lire(f)}</script>`);

  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://planningmedic.github.io/cr-anesthesie/' });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const evt = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));

  V('la page se charge sans erreur', erreurs.length === 0, erreurs);
  const anes = d.querySelector('.anesthesiste'), chir = d.querySelector('.chirurgien');
  V('l\'anesthésiste se tape (champ texte, pas une liste)', !!anes && anes.tagName === 'INPUT' && anes.type === 'text');
  V('le chirurgien se tape (champ texte, pas une liste)', !!chir && chir.tagName === 'INPUT' && chir.type === 'text');

  const spe = $('specialite');
  const ophtalmo = [...spe.options].find(o => o.value === 'Ophtalmologie');
  V('la spécialité Ophtalmologie est proposée', !!ophtalmo);
  spe.value = 'Ophtalmologie'; evt(spe, 'change');
  const geste = d.querySelector('.geste-select');
  V('les interventions de la spécialité sont proposées', !!geste && [...geste.options].some(o => o.value === 'Cataracte'));
  geste.value = 'Cataracte'; evt(geste, 'change');

  anes.value = 'Exemple'; evt(anes, 'input');
  const chir2 = d.querySelector('.chirurgien'); // la spécialité a pu reconstruire la ligne
  chir2.value = 'Modèle'; evt(chir2, 'input');
  const cr = $('report').value;
  V('le CR reprend le nom tapé pour l\'anesthésiste', /Anesthésiste : Exemple/.test(cr), cr.slice(0, 160));
  V('le CR reprend le nom tapé pour le chirurgien', /Chirurgien : Modèle/.test(cr), cr.slice(0, 160));
  V('le CR nomme l\'intervention', /Cataracte/.test(cr));
  V('cataracte : céfuroxime intracamérulaire 1 mg/0,1 mL (RFE 2024 V3.0 p. 45)',
    /Antibioprophylaxie par Céfuroxime intracamérulaire 1 mg\/0,1 mL en fin d'intervention\./.test(cr), cr.match(/Antibio.*/));
  /* Sans nom tapé, la ligne reste vide : rien n'est inventé. */
  anes.value = ''; evt(anes, 'input');
  V('sans nom tapé, aucun nom n\'apparaît', /Anesthésiste : \n/.test($('report').value), $('report').value.slice(0, 80));
  V('aucune erreur pendant la saisie', erreurs.length === 0, erreurs);

  /* (29/10/2026) « Réinitialiser » demande confirmation : un clic de trop ne doit
     plus effacer le CR. Refusé, rien ne bouge ; accepté, la page se recharge
     (jsdom ne sait pas recharger : il le signale, c'est la preuve du rechargement). */
  anes.value = 'Exemple'; evt(anes, 'input');
  const avant = $('report').value;
  const questions = [];
  w.confirm = q => { questions.push(q); return false; };
  $('resetBtn').click();
  V('Réinitialiser pose une question avant d\'effacer', questions.length === 1, questions);
  V('la question dit que le CR sera effacé', /effacer/i.test(questions[0] || ''), questions);
  V('refusé, le CR est intact', $('report').value === avant && anes.value === 'Exemple');
  V('refusé, la page ne se recharge pas', erreurs.length === 0, erreurs);
  w.confirm = q => { questions.push(q); return true; };
  $('resetBtn').click();
  V('accepté, la page se recharge', erreurs.some(e => /reload|navigation/i.test(e)), erreurs);

  /* (29/10/2026) Curare non dépolarisant ⇒ TOF coché d'office, mais décochable. */
  erreurs.length = 0;
  spe.value = 'Orthopédie'; evt(spe, 'change');
  const g2 = d.querySelector('.geste-select'); g2.value = 'PTH'; evt(g2, 'change');
  const puce = (zone, txt) => [...$(zone).children].find(c => c.textContent === txt);
  const tofActif = () => !!puce('monitorage', 'TOF') && puce('monitorage', 'TOF').classList.contains('active');
  V('avant le curare, TOF n\'est pas coché', !tofActif());
  puce('curare', 'Rocuronium').click();
  V('Rocuronium coché ⇒ TOF coché d\'office', tofActif());
  V('le CR mentionne le TOF', /TOF/.test($('report').value));
  puce('monitorage', 'TOF').click();
  V('TOF se décoche à la main', !tofActif());
  puce('curare', 'Atracurium').click();
  V('changer de curare ne recoche pas le TOF… sauf s\'il manque : Atracurium ⇒ TOF', tofActif());
  puce('monitorage', 'TOF').click();
  puce('curare', 'Aucun').click();
  V('« Aucun » curare ne coche pas le TOF', !tofActif());
  V('aucune erreur pendant le curare', erreurs.length === 0, erreurs);
}

console.log('\n═══ 2 bis. Antibioprophylaxie : RFE SFAR/SPILF 2024 V3.0 (04/05/2026) ═══');
{
  /* (29/10/2026) Lignes corrigées d'après la RFE ; chaque valeur a été relue dans le PDF. */
  const ctx = {};
  require('vm').runInNewContext(lire('rules.js') + ';this.M = ANTIBIO_MAP; this.D = ANTIBIO_DOSES;', ctx);
  const attendu = {
    'Recalibrage': 'Aucune', 'Ostéosynthèse plateau tibial': 'Céfazoline', 'Hystérectomie': 'Céfoxitine',
    'Kystectomie ovarienne': 'Aucune', 'Segmentectomie hépatique': 'Céfazoline', 'REV': 'Aucune',
    'Néphrectomie': 'Aucune', 'Posthectomie': 'Aucune', 'Extraction DDS': 'Amoxicilline',
    'Cataracte': 'Céfuroxime intracamérulaire', 'Blépharoplastie': 'Aucune', 'POEM': 'Aucune',
  };
  for (const [g, a] of Object.entries(attendu)) V(`${g} → ${a}`, ctx.M[g] === a, ctx.M[g]);
  V('amoxicilline : 2 g (p. 43-44)', ctx.D['Amoxicilline'] === '2 g', ctx.D['Amoxicilline']);
  const sansDose = Object.values(ctx.M).filter(a => a !== 'Aucune' && !ctx.D[a]);
  V('chaque antibiotique proposé a une dose', sansDose.length === 0, [...new Set(sansDose)]);
}

/* Ouvre la page dans un navigateur simulé (même montage qu'au §2). */
function ouvrirPage() {
  let html = lire('index.html');
  for (const f of ['data.js', 'rules.js', 'ui.js', 'report.js', 'app.js'])
    html = html.replace(`<script src="./${f}"></script>`, `<script>${lire(f)}</script>`);
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://planningmedic.github.io/cr-anesthesie/' });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const evt = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
  const puce = (zone, txt) => [...$(zone).children].find(c => c.textContent === txt);
  const visible = id => !$(id).classList.contains('hidden');
  const choisir = (spe, geste) => {
    $('specialite').value = spe; evt($('specialite'), 'change');
    const g = d.querySelector('.geste-select'); g.value = geste; evt(g, 'change');
  };
  return { w, d, $, evt, puce, visible, choisir, erreurs, cr: () => $('report').value };
}

console.log('\n═══ 2 ter. Type d\'anesthésie : AG / AG + ALR / ALR seule (29/10/2026) ═══');
{
  const p = ouvrirPage();
  const { $, puce, visible, choisir, cr } = p;
  const actifs = z => [...$(z).children].filter(c => c.classList.contains('active')).map(c => c.textContent);

  choisir('Orthopédie', 'Canal carpien');
  V('le choix du type est proposé', visible('typeAnesthCard') && !!puce('typeAnesthOptions', 'ALR seule'));
  V('aucun type n\'est coché d\'office', actifs('typeAnesthOptions').length === 0);
  V('sans choix, l\'écran AG reste comme avant', visible('curareCard') && visible('vaCard') && visible('entretienCard'));
  V('sans choix, le CR ne parle pas d\'ALR seule', !/ALR seule/.test(cr()));

  /* Un MAR commence une AG puis se ravise : rien de l'AG ne doit survivre. */
  puce('induction', 'Propofol').click();
  puce('curare', 'Rocuronium').click();
  puce('vaOptions', 'Masque laryngé').click();
  puce('typeAnesthOptions', 'ALR seule').click();
  V('ALR seule : cartes Curare, Voies aériennes, Entretien masquées',
    !visible('curareCard') && !visible('vaCard') && !visible('entretienCard'));
  V('ALR seule : la carte devient « Sédation (facultative) »', /Sédation/.test($('inductionTitle').textContent));
  V('ALR seule : sédation proposée, rien de coché', actifs('induction').length === 0 &&
    ['Midazolam', 'Propofol', 'Sufentanil', 'Kétamine'].every(m => puce('induction', m)));
  V('ALR seule : le CR ne garde ni induction, ni curare, ni voies aériennes',
    !/INDUCTION|curarisation|VOIES AÉRIENNES|masque laryngé/i.test(cr()), cr());
  V('ALR seule : le TOF ajouté par le curare disparaît', !/TOF/.test(cr()), cr());
  V('ALR seule : le CR l\'écrit dans l\'intervention', /Intervention : Canal carpien sous ALR seule/.test(cr()), cr().slice(0, 200));
  V('ALR seule : la carte ALR est ouverte, rien coché', visible('alrCard') && actifs('alrOptions').length === 0);
  V('ALR seule : rachianesthésie et péridurale proposées', visible('neuraxialCard') &&
    !!puce('neuraxialOptions', 'Rachianesthésie') && !!puce('neuraxialOptions', 'Péridurale'));

  puce('induction', 'Midazolam').click();
  V('sédation cochée ⇒ « Sédation par Midazolam »', /SÉDATION\nSédation par Midazolam\./.test(cr()), cr());
  puce('reveilOptions', 'Simples').click();
  V('suites : « Suites simples », sans extubation', /Suites simples\./.test(cr()) && !/extub/i.test(cr()), cr());
  V('suites : aucune destination inventée', !/Transfert en/.test(cr()), cr());

  puce('typeAnesthOptions', 'AG').click();
  V('AG : retour de l\'écran AG', visible('curareCard') && visible('vaCard') && /Induction/.test($('inductionTitle').textContent));
  V('AG : la sédation cochée ne devient pas une induction', !/Midazolam/.test(cr()), cr());
  V('AG : les cartes ALR sont masquées', !visible('alrCard') && !visible('neuraxialCard'));

  puce('typeAnesthOptions', 'AG + ALR').click();
  V('AG + ALR : AG et ALR à l\'écran', visible('curareCard') && visible('alrCard') && visible('neuraxialCard'));
  choisir('Orthopédie', 'Recalibrage');
  V('AG + ALR sans bloc prévu : la carte ALR reste ouverte avec « Autre »', visible('alrCard') && !!puce('alrOptions', 'Autre'));

  choisir('Ophtalmologie', 'Cataracte');
  V('cataracte : le type est masqué (mode sédation imposé)', !visible('typeAnesthCard'));
  V('cataracte : pas de carte ALR restée ouverte', !visible('alrCard') && !visible('neuraxialCard'));
  V('aucune erreur pendant ces bascules', p.erreurs.length === 0, p.erreurs);
}

console.log('\n═══ 2 quater. Détail de l\'ALR, bloc par bloc, rien d\'écrit d\'office (29/10/2026) ═══');
{
  const p = ouvrirPage();
  const { d, $, evt, puce, choisir, cr } = p;
  const section = t => (cr().split(t + '\n')[1] || '').split('\n\n')[0];
  const bloc = n => d.querySelector(`.alr-bloc[data-alr="${n}"]`);

  V('plus de produit ni de volume pré-remplis dans la page', !$('localAgent') && !$('localVolume'));

  choisir('Orthopédie', 'PTG');
  puce('typeAnesthOptions', 'AG + ALR').click();
  puce('alrOptions', 'Bloc fémoral').click();
  V('bloc coché sans rien saisir ⇒ le CR ne nomme que le bloc', section('ALR PÉRIPHÉRIQUE') === 'Bloc fémoral.', section('ALR PÉRIPHÉRIQUE'));
  V('ni échoguidage, ni produit, ni volume inventés', !/écho|mL|caïne/i.test(section('ALR PÉRIPHÉRIQUE')));
  V('un encadré de détail par bloc coché', !!bloc('Bloc fémoral') && d.querySelectorAll('.alr-bloc').length === 1);
  V('dans l\'encadré : produit vide, volume vide, rien coché',
    bloc('Bloc fémoral').querySelector('.alr-produit').value === '' &&
    bloc('Bloc fémoral').querySelector('.alr-volume').value === '' &&
    bloc('Bloc fémoral').querySelectorAll('.chip.active').length === 0);

  const s = bloc('Bloc fémoral').querySelector('.alr-produit'); s.value = 'Ropivacaïne 0,375%'; evt(s, 'change');
  const v = bloc('Bloc fémoral').querySelector('.alr-volume'); v.value = '20'; evt(v, 'input');
  bloc('Bloc fémoral').querySelector('.alr-echo').click();
  V('produit, volume et échoguidage saisis ⇒ écrits',
    section('ALR PÉRIPHÉRIQUE') === 'Bloc fémoral, sous échoguidage, 20 mL de Ropivacaïne 0,375%.', section('ALR PÉRIPHÉRIQUE'));

  bloc('Bloc fémoral').querySelector('.alr-kt').click();
  V('KT coché sans précision ⇒ pas de produit inventé pour le KT',
    /cathéter périnerveux continu\.$/.test(section('ALR PÉRIPHÉRIQUE')) && !/0,2%/.test(section('ALR PÉRIPHÉRIQUE')), section('ALR PÉRIPHÉRIQUE'));
  const k = bloc('Bloc fémoral').querySelector('.alr-kt-texte'); k.value = 'précision du KT'; evt(k, 'input');
  V('KT précisé ⇒ la précision est reprise telle quelle', /cathéter périnerveux continu \(précision du KT\)\./.test(cr()), section('ALR PÉRIPHÉRIQUE'));

  puce('alrOptions', 'Bloc saphène').click();
  V('deuxième bloc : sa propre ligne, sans hériter du premier',
    section('ALR PÉRIPHÉRIQUE').split('\n')[1] === 'Bloc saphène.', section('ALR PÉRIPHÉRIQUE'));
  V('deuxième bloc : son propre encadré', d.querySelectorAll('.alr-bloc').length === 2);

  puce('alrOptions', 'Autre').click();
  $('alrOtherText').value = 'Bloc tapé à la main'; evt($('alrOtherText'), 'input');
  const sa = bloc('Autre').querySelector('.alr-produit'); sa.value = 'Autre'; evt(sa, 'change');
  const pa = bloc('Autre').querySelector('.alr-produit-autre'); pa.value = 'Produit tapé'; evt(pa, 'input');
  V('« Autre » : nom et produit tapés repris', /Bloc tapé à la main, Produit tapé\./.test(cr()), section('ALR PÉRIPHÉRIQUE'));

  puce('alrOptions', 'Bloc fémoral').click();
  V('bloc décoché ⇒ sa ligne et son encadré disparaissent', !/Bloc fémoral/.test(cr()) && !bloc('Bloc fémoral'));

  puce('neuraxialOptions', 'Rachianesthésie').click();
  V('rachianesthésie sans détail ⇒ « Rachianesthésie réalisée. »', /ALR NEURAXIALE\nRachianesthésie réalisée\./.test(cr()), section('ALR NEURAXIALE'));
  const nb = d.querySelector('.neuraxial-bloc[data-technique="Rachianesthésie"]');
  V('rachianesthésie : champs produit/dose et adjuvants, vides', !!nb &&
    nb.querySelector('.neuraxial-produit').value === '' && nb.querySelector('.neuraxial-adjuvants').value === '');
  const np = nb.querySelector('.neuraxial-produit'); np.value = 'produit et dose tapés'; evt(np, 'input');
  const na = nb.querySelector('.neuraxial-adjuvants'); na.value = 'adjuvants tapés'; evt(na, 'input');
  V('rachianesthésie : produit et adjuvants repris',
    /Rachianesthésie réalisée : produit et dose tapés, adjuvants : adjuvants tapés\./.test(cr()), section('ALR NEURAXIALE'));

  puce('neuraxialOptions', 'Péridurale').click();
  $('periduraleNiveau').value = 'L3-L4'; evt($('periduraleNiveau'), 'input');
  V('péridurale : niveau repris, rien d\'autre inventé', /Péridurale réalisée au niveau L3-L4\./.test(cr()), section('ALR NEURAXIALE'));
  V('aucune erreur pendant la saisie de l\'ALR', p.erreurs.length === 0, p.erreurs);
}

console.log('\n═══ 2 quinquies. Antibioprophylaxie selon le geste réel (RFE 2024 V3.0) ═══');
{
  /* (29/10/2026) Chaque règle relue dans le PDF V3.0 ; page entre parenthèses. */
  const ctx = {};
  require('vm').runInNewContext(lire('rules.js') + ';this.C = ANTIBIO_CONDITIONS; this.D = ANTIBIO_DOSES;', ctx);
  const attendu = {
    'Hernie inguinale': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
    'Hernie ombilicale': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
    'Cure de hernie hiatale': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
    'Mastectomie partielle': ['Oui', 'Céfazoline', 'Non (ou ganglion sentinelle)', 'Aucune'],
    'Cholécystectomie': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
    'Duodénopancréatectomie céphalique': ['Oui', 'Pipéracilline-tazobactam', 'Non', 'Céfoxitine'],
    'ERCP': ['Oui', 'Aucune', 'Non (incomplet, ou cholangioscopie)', 'Céfoxitine'],
    'Pose de prothèse biliaire': ['Oui', 'Aucune', 'Non (incomplet)', 'Céfoxitine'],
    'Biopsies de prostate': ['Transrectale', 'Fosfomycine-trométamol', 'Transpérinéale', 'Aucune'],
    'Rhinoplastie': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
    'Varices': ['Oui', 'Céfazoline', 'Non', 'Aucune'],
  };
  for (const [g, [r1, a1, r2, a2]] of Object.entries(attendu)) {
    const c = ctx.C[g] || { options: {} };
    V(`${g} : ${r1} → ${a1} ; ${r2} → ${a2} (${c.source})`,
      c.options[r1] === a1 && c.options[r2] === a2 && Object.keys(c.options).length === 2 && /^p\. \d+$/.test(c.source || ''), c);
  }
  V('aucune autre intervention conditionnelle non vérifiée', Object.keys(ctx.C).length === Object.keys(attendu).length, Object.keys(ctx.C));
  V('pipéracilline-tazobactam 4 g (p. 83)', ctx.D['Pipéracilline-tazobactam'] === '4 g');
  V('fosfomycine-trométamol 3 g per os, 2 à 4 h avant (p. 88)', ctx.D['Fosfomycine-trométamol'] === '3 g per os, 2 à 4 h avant le geste');
  const sansDose = Object.values(ctx.C).flatMap(c => Object.values(c.options)).filter(a => a !== 'Aucune' && !ctx.D[a]);
  V('chaque antibiotique des questions a une dose', sansDose.length === 0, sansDose);

  const p = ouvrirPage();
  const { d, $, puce, choisir, cr } = p;
  const ligne = () => (cr().match(/ANTIBIOPROPHYLAXIE\n(.*)/) || [])[1];
  const actifs = () => [...$('antibioOptions').children].filter(c => c.classList.contains('active')).map(c => c.textContent);
  const repondre = (g, r) => [...d.querySelector(`.antibio-question[data-geste="${g}"]`).querySelectorAll('.chip')].find(c => c.textContent === r).click();

  choisir('Viscéral', 'Hernie inguinale');
  const q = d.querySelector('.antibio-question[data-geste="Hernie inguinale"]');
  V('hernie : la question « Prothèse posée ? » est posée', !!q && /Prothèse posée \?/.test(q.textContent));
  V('hernie : aucune réponse cochée d\'office', q.querySelectorAll('.chip.active').length === 0);
  V('sans réponse : aucun antibiotique coché', actifs().length === 0, actifs());
  V('sans réponse : le CR écrit « à préciser »', ligne() === 'Antibioprophylaxie : à préciser.', ligne());
  V('la source est affichée sous la question', /RFE SFAR\/SPILF 2024 \(V3\.0\), p\. 83/.test(q.textContent));
  repondre('Hernie inguinale', 'Oui');
  V('prothèse : oui ⇒ céfazoline 2 g', ligne() === 'Antibioprophylaxie par Céfazoline 2 g.', ligne());
  repondre('Hernie inguinale', 'Non');
  V('prothèse : non ⇒ pas d\'antibioprophylaxie', ligne() === 'Pas d\'antibioprophylaxie.', ligne());
  repondre('Hernie inguinale', 'Non');
  V('réponse retirée ⇒ de nouveau « à préciser »', ligne() === 'Antibioprophylaxie : à préciser.', ligne());
  puce('antibioOptions', 'Aucune').click();
  V('choix manuel sans répondre : respecté', ligne() === 'Pas d\'antibioprophylaxie.', ligne());

  choisir('Viscéral', 'Colectomie');
  V('intervention sans question : comportement inchangé (céfoxitine)', ligne() === 'Antibioprophylaxie par Céfoxitine 2 g.' && !d.querySelector('.antibio-question'), ligne());
  choisir('Viscéral', 'Hernie inguinale');
  V('revenir sur la hernie : la question est reposée, sans réponse', d.querySelectorAll('.antibio-question .chip.active').length === 0 && ligne() === 'Antibioprophylaxie : à préciser.', ligne());

  choisir('Urologie', 'Biopsies de prostate');
  repondre('Biopsies de prostate', 'Transrectale');
  V('biopsies transrectales ⇒ fosfomycine-trométamol 3 g per os',
    ligne() === 'Antibioprophylaxie par Fosfomycine-trométamol 3 g per os, 2 à 4 h avant le geste.', ligne());
  V('aucune erreur pendant les questions', p.erreurs.length === 0, p.erreurs);
}

console.log('\n═══ 3. Pas de tuile : le module s\'ouvre par son adresse ═══');
{
  /* (29/10/2026) Décision du responsable : outil d'ordinateur du bloc (copier-coller
     dans le dossier patient), ouvert en tapant planningmedic.github.io/cr-anesthesie.
     Aucune tuile sur le portail tant qu'il n'est pas terminé. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  V('aucune tuile du portail ne pointe vers le module', !/cr-anesth/.test(src));
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
