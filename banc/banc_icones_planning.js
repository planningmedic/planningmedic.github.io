/* ═══ BANC — ICÔNES DU PLANNING EN LOCAL (27/11/2026) ═══
   DÉFAUT TROUVÉ AU DIAGNOSTIC : planning.html chargeait la bibliothèque d'icônes
   ENTIÈRE (758 Ko) sur un site extérieur, par une balise bloquante en tête de
   page, dans sa version « latest ». Tant que ce site n'avait pas répondu, la page
   restait blanche ; une nouvelle version de la bibliothèque pouvait changer les
   icônes sans aucune publication de notre part. L'accueil avait déjà son paquet
   local ; le planning le rejoint.
   Ici : aucune page servie ne dépend d'un script extérieur pour s'afficher ; le
   paquet local connaît toutes les icônes que le planning demande, sous les deux
   écritures (« HeartPulse » de l'onglet SECTEURS, « heart-pulse ») ; une icône
   inconnue ne bloque rien et déclenche le secours en arrière-plan, une seule fois. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const R = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(R, f), 'utf8');
const PAQUET = lire('assets/vendor/lucide-icons.js'), PLANNING = lire('planning.html');

console.log('\n═══ IC 1. Aucune page ne dépend d\'un script extérieur pour s\'afficher ═══');
{
  const pages = fs.readdirSync(R).filter(f => f.endsWith('.html')).concat(['acr/index.html', 'pense-bete/index.html', 'cr-anesthesie/index.html']);
  const fautives = [];
  pages.forEach(p => { (lire(p).match(/<script[^>]+src=["']https?:\/\/[^"']+["'][^>]*>/g) || []).forEach(b => fautives.push(p + ' : ' + b)); });
  V('aucune balise <script src="http…"> dans les pages servies', fautives.length === 0, fautives);
  V('planning.html charge le paquet local', /<script src="assets\/vendor\/lucide-icons\.js"><\/script>/.test(PLANNING));
  V('plus aucune version « latest » d\'une bibliothèque', !/@latest/.test(PLANNING));
}

console.log('\n═══ IC 2. Le paquet connaît les icônes du planning, sous les deux écritures ═══');
const page = (html) => { const d = new JSDOM('<body>' + html + '</body>', { runScripts: 'outside-only' }); d.window.console.warn = () => {}; d.window.eval(PAQUET); return d.window; };
{
  /* Les icônes de l'onglet SECTEURS au 27/11/2026 (écriture du classeur) et celle de l'en-tête des consultations. */
  const secteurs = ['Activity', 'HeartPulse', 'Bone', 'Syringe', 'Eye', 'Microscope', 'Heart', 'Zap', 'Baby'];
  const statiques = [...PLANNING.matchAll(/data-lucide="([A-Za-z0-9-]+)"/g)].map(m => m[1]);
  V('l\'icône écrite en dur dans la page est relevée (stethoscope)', statiques.indexOf('stethoscope') !== -1, statiques);
  const w = page(secteurs.concat(statiques).map(n => '<i data-lucide="' + n + '" class="sector-icon-svg"></i>').join(''));
  w.lucide.createIcons();
  V('toutes sont dessinées', w.document.querySelectorAll('svg.lucide').length === secteurs.length + statiques.length && w.document.querySelectorAll('i[data-lucide]').length === 0,
    [...w.document.querySelectorAll('i[data-lucide]')].map(i => i.getAttribute('data-lucide')));
  V('aucune n\'est signalée absente', w.lucide.absentes.length === 0, w.lucide.absentes);
  V('la classe de la page est conservée sur le dessin', w.document.querySelectorAll('svg.sector-icon-svg').length === secteurs.length + statiques.length);
  V('« HeartPulse » et « heart-pulse » donnent le même dessin', (() => { const a = page('<i data-lucide="HeartPulse"></i><i data-lucide="heart-pulse"></i>'); a.lucide.createIcons();
    const s = a.document.querySelectorAll('svg'); return s.length === 2 && s[0].innerHTML === s[1].innerHTML && s[0].innerHTML.length > 20; })());
  V('un nom avec chiffre reste reconnu (bar-chart-2, BarChart2)', (() => { const a = page('<i data-lucide="bar-chart-2"></i><i data-lucide="BarChart2"></i>'); a.lucide.createIcons(); return a.document.querySelectorAll('svg').length === 2; })());
}

console.log('\n═══ IC 3. Icône inconnue : rien ne casse, secours en arrière-plan, une seule fois ═══');
{
  const w = page('<i data-lucide="IconeQuiNexistePas"></i><i data-lucide=""></i><i data-lucide="Baby"></i>');
  w.lucide.createIcons(); w.lucide.createIcons();
  V('l\'icône connue est dessinée, l\'inconnue reste en place sans erreur', w.document.querySelectorAll('svg').length === 1 && w.document.querySelectorAll('i[data-lucide]').length === 2);
  V('elle est notée une seule fois dans lucide.absentes', w.lucide.absentes.length === 1, w.lucide.absentes);
  V('un nom vide n\'est pas une icône absente', w.lucide.absentes.indexOf('') === -1);
  /* La vraie fonction de la page. */
  const m = PLANNING.match(/var _icoSecours = false;[^\n]*\nfunction dessinerIcones\(\)\{[\s\S]*?\n\}/);
  V('dessinerIcones est lisible dans planning.html', !!m);
  if (m) {
    w.eval(m[0]);
    w.eval('dessinerIcones(); dessinerIcones(); dessinerIcones();');
    const sec = [...w.document.querySelectorAll('script[src]')];
    V('le secours est demandé UNE fois', sec.length === 1, sec.length);
    V('…en arrière-plan (async), sur une version figée — jamais « latest »', sec.length === 1 && sec[0].async === true && /lucide@\d+\.\d+\.\d+\//.test(sec[0].src) && !/latest/.test(sec[0].src), sec[0] && sec[0].src);
    const w2 = page('<i data-lucide="Baby"></i>'); w2.eval(m[0]); w2.eval('dessinerIcones();');
    V('toutes les icônes connues : aucun appel extérieur', w2.document.querySelectorAll('script[src]').length === 0);
    const w3 = new JSDOM('<body></body>', { runScripts: 'outside-only' }).window; w3.eval(m[0]);
    let err = null; try { w3.eval('dessinerIcones();'); } catch (e) { err = e.message; }
    V('paquet non chargé : dessinerIcones ne fait rien et ne plante pas', err === null, err);
  }
  V('les deux dessins de la page passent par dessinerIcones', (PLANNING.match(/dessinerIcones\(\);|requestAnimationFrame\(dessinerIcones\)/g) || []).length >= 2);
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
