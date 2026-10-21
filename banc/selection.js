// ═══ SÉLECTION DU MODE RAPIDE — quels scénarios lisent ces fichiers ? ═══
// Appelé par lancer.sh : node selection.js <fichiers modifiés…> -- <scénarios…>
// Écrit sur la sortie standard les scénarios à lancer, un par ligne.
//
// (21/10/2026) Le banc complet dure plusieurs minutes, dont les trois quarts
// pour les scénarios qui génèrent une année de gardes. Pendant le travail sur
// une page, on ne relance que les scénarios qui la concernent. Le banc COMPLET
// reste obligatoire avant tout push : cette sélection n'est qu'une aide.
//
// Règle, volontairement large (en cas de doute, on lance) :
//   - un scénario est retenu si le nom du fichier modifié apparaît dans son
//     texte ou dans celui des modules du banc qu'il charge (stubs, monde,
//     harnais du simulateur…) ;
//   - un .gs modifié retient en plus tous les scénarios qui chargent un module
//     capable de lire les .gs par listage (stubs, monde, harnais) ;
//   - un scénario modifié est retenu lui-même ;
//   - un scénario qui liste un dossier (readdirSync) est toujours retenu ;
//   - un fichier qu'aucun scénario ne cite, ou un module du banc modifié,
//     relance TOUT le banc.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const sep = args.indexOf('--');
const cibles = (sep < 0 ? args : args.slice(0, sep)).map(f => path.basename(f));
const scenarios = sep < 0 ? [] : args.slice(sep + 1);
const tout = (raison) => {
  console.error('  → ' + raison + ' : tout le banc est lancé.');
  console.log(scenarios.join('\n'));
  process.exit(0);
};
if (!cibles.length) tout('aucun fichier indiqué');

const BANC = __dirname, SIMU = path.join(__dirname, '..', 'simulateur');
const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };

// Modules auxiliaires : tout .js / .mjs de banc/ qui n'est pas un scénario,
// plus ceux du simulateur.
const modules = {};
fs.readdirSync(BANC).filter(f => /\.m?js$/.test(f) && scenarios.indexOf(f) < 0 && f !== 'selection.js')
  .forEach(f => { modules[f.replace(/\.m?js$/, '')] = path.join(BANC, f); });
fs.readdirSync(SIMU).filter(f => /\.m?js$/.test(f))
  .forEach(f => { if (!modules[f.replace(/\.m?js$/, '')]) modules[f.replace(/\.m?js$/, '')] = path.join(SIMU, f); });
// Modules qui lisent les .gs par listage du dossier gas/ (le nom du fichier
// n'y apparaît pas forcément) : vérifié dans stubs.js, monde.js, harness.js.
const LECTEURS_GS = ['stubs', 'monde', 'harness'];

// Un module auxiliaire modifié peut toucher n'importe quel scénario.
const auxModifie = cibles.find(c => modules[c.replace(/\.m?js$/, '')] && scenarios.indexOf(c) < 0);
if (auxModifie) tout(auxModifie + ' est un module du banc');

const cite = (texte, nom) => new RegExp('[\'"/`]' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\'"`]|\\.m?js)').test(texte);

// Texte d'un scénario + modules chargés, de proche en proche.
function texteComplet(fichier) {
  const vus = new Set(), noms = new Set();
  let texte = '';
  const pile = [path.join(BANC, fichier)];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    const t = lire(f);
    texte += '\n' + t;
    Object.keys(modules).forEach(m => { if (cite(t, m)) { noms.add(m); pile.push(modules[m]); } });
  }
  return { texte, noms };
}

const retenus = [];
const orphelines = new Set(cibles);
scenarios.forEach(s => {
  const { texte, noms } = texteComplet(s);
  const lecteurGs = LECTEURS_GS.some(m => noms.has(m));
  const garde = cibles.filter(c =>
    c === s || texte.indexOf(c) >= 0 || (/\.gs$/.test(c) && lecteurGs));
  if (garde.length) { retenus.push(s); garde.forEach(c => orphelines.delete(c)); }
  // Un scénario qui liste un dossier (readdirSync) peut lire un fichier sans
  // jamais écrire son nom : il est toujours lancé (banc_docs, par exemple,
  // parcourt toutes les pages de docs/).
  else if (/readdirSync/.test(lire(path.join(BANC, s)))) retenus.push(s);
});
if (orphelines.size) tout('aucun scénario ne cite ' + [...orphelines].join(', '));

console.error('  → ' + retenus.length + ' scénario(s) sur ' + scenarios.length + ' concernés.');
console.log(retenus.join('\n'));
