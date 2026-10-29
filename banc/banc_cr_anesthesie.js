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
    'Cataracte': 'Céfuroxime intracamérulaire', 'Blépharoplastie': 'Aucune',
  };
  for (const [g, a] of Object.entries(attendu)) V(`${g} → ${a}`, ctx.M[g] === a, ctx.M[g]);
  V('amoxicilline : 2 g (p. 43-44)', ctx.D['Amoxicilline'] === '2 g', ctx.D['Amoxicilline']);
  const sansDose = Object.values(ctx.M).filter(a => a !== 'Aucune' && !ctx.D[a]);
  V('chaque antibiotique proposé a une dose', sansDose.length === 0, [...new Set(sansDose)]);
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
