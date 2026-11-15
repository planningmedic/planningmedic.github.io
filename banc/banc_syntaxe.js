/* ═══ BANC — SYNTAXE, BALISES, IDENTIFIANTS (15/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Trois contrôles se faisaient à la main avant chaque push (instructions du
   projet, § 8) : vérifier la syntaxe du JavaScript, l'équilibre des balises
   HTML et l'unicité des identifiants (ancres). Faits à la main, ils sont
   oubliés ou faits sur un seul fichier. Ici, ils portent sur TOUT le dépôt, à
   chaque banc.

   1. Syntaxe : chaque fichier .js, .mjs et .gs suivi par git, et chaque bloc
      <script> en ligne des pages HTML, se compile sans erreur (même contrôle
      que node --check, sans rien exécuter).
   2. Balises : dans chaque page HTML, toute balise ouverte est refermée, dans
      le bon ordre (le contenu des <script> et <style> et les commentaires
      sont ignorés ; les éléments vides et ceux dont la fermeture est
      facultative en HTML — p, li, td… — ne sont pas exigés).
   3. Identifiants : aucun id="…" écrit en double dans une même page
      (identifiants écrits dans le HTML ; ceux que le JavaScript fabrique ne
      sont pas vus).
   Chaque contrôle a sa contre-preuve sur un texte fautif construit ici. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 600) : '')); } };
const RACINE = path.join(__dirname, '..');
const suivis = execSync('git ls-files', { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean);
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

/* ─── outils ─────────────────────────────────────────────────────────────── */
// Compile sans exécuter. CommonJS : enveloppé comme le fait Node (un « return »
// au premier niveau est permis). Script classique (.gs, <script>) : tel quel.
function compileScript(src, nom) {
  try { new vm.Script(src.replace(/^#!.*/, ''), { filename: nom }); return null; } catch (e) { return e.message; }
}
function compileCjs(src, nom) {
  return compileScript('(function (exports, require, module, __filename, __dirname) {' + src.replace(/^#!.*/, '') + '\n})', nom);
}
function compileModule(f) {
  try { execSync('node --check ' + JSON.stringify(path.join(RACINE, f)), { stdio: ['ignore', 'ignore', 'pipe'] }); return null; }
  catch (e) { return String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 4).join(' | '); }
}
// Retire commentaires et contenu des <script>/<style>/<textarea> (en gardant
// les balises elles-mêmes) ; rend aussi la liste des scripts en ligne.
function decouper(html) {
  const scripts = [];
  const blanc = t => t.replace(/[^\n]/g, '');   // garde les sauts de ligne : numéros de ligne justes
  const sans = html.replace(/<!--[\s\S]*?-->/g, blanc)
    .replace(/<(script|style|textarea)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (m, tag, attrs, corps) => {
      if (tag.toLowerCase() === 'script' && !/\bsrc\s*=/.test(attrs)) scripts.push({ attrs, corps });
      return '<' + tag + attrs + '>' + blanc(corps) + '</' + tag + '>';
    });
  return { sans, scripts };
}
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const FACULTATIVES = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'option', 'optgroup', 'colgroup', 'caption', 'rt', 'rp', 'html', 'head', 'body']);
function balises(html) {
  const { sans } = decouper(html);
  const pile = [], erreurs = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  const ligne = i => sans.slice(0, i).split('\n').length;
  while ((m = re.exec(sans))) {
    const fermante = m[1] === '/', tag = m[2].toLowerCase(), auto = /\/\s*$/.test(m[3]);
    if (VIDES.has(tag) || FACULTATIVES.has(tag)) continue;
    if (!fermante) { if (!auto) pile.push({ tag, l: ligne(m.index) }); continue; }
    if (pile.length && pile[pile.length - 1].tag === tag) { pile.pop(); continue; }
    const k = pile.map(x => x.tag).lastIndexOf(tag);
    if (k < 0) { erreurs.push('</' + tag + '> sans ouverture, ligne ' + ligne(m.index)); continue; }
    pile.splice(k).slice(1).forEach(x => erreurs.push('<' + x.tag + '> (ligne ' + x.l + ') non refermée avant </' + tag + '>'));
  }
  pile.forEach(x => erreurs.push('<' + x.tag + '> (ligne ' + x.l + ') jamais refermée'));
  return erreurs;
}
function doublonsId(html) {
  const { sans } = decouper(html);
  const vus = {}, dbl = new Set();
  const re = /<[a-zA-Z][^>]*?\sid\s*=\s*("([^"]*)"|'([^']*)')/g; let m;
  while ((m = re.exec(sans))) { const id = m[2] !== undefined ? m[2] : m[3]; if (!id || /\$\{|\{\{/.test(id)) continue; if (vus[id]) dbl.add(id); vus[id] = 1; }
  return [...dbl];
}

/* ─── 1. Syntaxe ─────────────────────────────────────────────────────────── */
console.log('\n═══ 1. Tout le JavaScript du dépôt se compile ═══');
const js = suivis.filter(f => /\.(js|mjs|gs)$/.test(f));
const fautesJs = [];
js.forEach(f => {
  const src = lire(f);
  let err;
  if (/\.gs$/.test(f)) err = compileScript(src, f);
  else if (/\.mjs$/.test(f) || /^\s*(import|export)\s/m.test(src)) err = compileModule(f);
  else {
    err = compileCjs(src, f);
    /* Script Scriptable (iPhone, pense-bete/widget-scriptable.js) : l'appli l'exécute dans
       une fonction asynchrone, un « await » au premier niveau y est valide. */
    if (err && /await is only valid/.test(err)) err = compileScript('(async function () {' + src + '\n})', f);
  }
  if (err) fautesJs.push(f + ' : ' + err);
});
V('au moins 50 fichiers .js / .mjs / .gs trouvés (le listage fonctionne)', js.length >= 50, js.length);
V('chaque fichier .js, .mjs et .gs se compile', fautesJs.length === 0, fautesJs);

// banc/reference/ : copies figées d'anciennes versions, servant de comparaison — pas des pages servies.
const pages = suivis.filter(f => /\.html$/.test(f) && !f.startsWith('banc/reference/'));
const fautesIn = []; let nIn = 0;
pages.forEach(f => decouper(lire(f)).scripts.forEach((s, i) => {
  const type = (s.attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
  if (type && !/^(text|application)\/(javascript|ecmascript)$/i.test(type) && type !== 'module') return;   // JSON, gabarit…
  if (type === 'module') return;   // module en ligne : compilé par le navigateur seulement
  nIn++; const err = compileScript(s.corps, f + ' <script n° ' + (i + 1) + '>');
  if (err) fautesIn.push(f + ' <script n° ' + (i + 1) + '> : ' + err);
}));
V('au moins 20 pages HTML trouvées', pages.length >= 20, pages.length);
V('chaque <script> en ligne des pages se compile (' + nIn + ' blocs)', fautesIn.length === 0, fautesIn);
V('contre-preuve : une accolade manquante est détectée (fichier et <script>)',
  !!compileCjs('function f() { return 1;', 'x.js') && !!compileScript('if (a) {', 'x.gs') &&
  decouper('<p>x</p><script>let a = ;</script>').scripts.length === 1 && !!compileScript(decouper('<script>let a = ;</script>').scripts[0].corps, 'p'));
V('contre-preuve : un « return » au premier niveau d\'un fichier Node est admis, comme pour node --check', compileCjs('return;', 'x.js') === null);

/* ─── 2. Balises ─────────────────────────────────────────────────────────── */
console.log('\n═══ 2. Toute balise ouverte est refermée, dans l\'ordre ═══');
/* Défauts connus, laissés en l'état en attendant la décision du responsable. Chaque ligne
   doit rester vraie : une fois le défaut corrigé, le banc demande de retirer la ligne.
   (15/11/2026) admin.html : <div class="main"> jamais refermé — corrigé en v1.78.2
   (refermé juste avant </body>, là où le navigateur le refermait déjà). Liste vide. */
const CONNUS = [];   // [page, ligne exacte de la balise jamais refermée]
const fautesB = [], connusVus = [];
pages.forEach(f => { const L = lire(f).split('\n'); const e = balises(L.join('\n')).filter(x => {
    const m = x.match(/^<[a-z0-9-]+> \(ligne (\d+)\) jamais refermée$/);
    const c = m && CONNUS.find(k => k[0] === f && (L[Number(m[1]) - 1] || '').trim() === k[1]);
    if (c) connusVus.push(f); return !c; }); if (e.length) fautesB.push(f + ' : ' + e.slice(0, 3).join(' ; ') + (e.length > 3 ? ' (+' + (e.length - 3) + ')' : '')); });
V('chaque page HTML a ses balises équilibrées', fautesB.length === 0, fautesB);
V('les défauts connus listés dans ce scénario existent toujours (sinon retirer la ligne)', connusVus.length === CONNUS.length, { connus: CONNUS.map(k => k[0]), vus: connusVus });
V('contre-preuve : une <div> non refermée est détectée', balises('<div><section></section>').length === 1);
V('contre-preuve : un croisement <div><span></div></span> est détecté', balises('<div><span></div></span>').length >= 1);
V('contre-preuve : ni <br>, ni <p> sans fin, ni le HTML écrit dans un <script> ne sont comptés',
  balises('<div><br><p>a<p>b<img src="x"><svg><path d="M0"/></svg></div><script>const s = "<div>";</script><!-- <div> -->').length === 0);

/* ─── 3. Identifiants ────────────────────────────────────────────────────── */
console.log('\n═══ 3. Aucun identifiant en double dans une page ═══');
const fautesId = [];
pages.forEach(f => { const d = doublonsId(lire(f)); if (d.length) fautesId.push(f + ' : ' + d.slice(0, 8).join(', ')); });
V('aucun id="…" écrit deux fois dans une même page', fautesId.length === 0, fautesId);
V('contre-preuve : un id en double est détecté, pas un id fabriqué par le JavaScript',
  doublonsId('<a id="x"></a><b id=\'x\'></b><i id="y"></i><script>h += \'<i id="y"></i>\';</script>').join() === 'x');

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
