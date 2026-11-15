// ═══ EMPREINTE DES SCÉNARIOS LOURDS — ce qu'ils lisent a-t-il changé ? ═══
// Appelé par lancer.sh : node empreinte.js <scénarios…>
// Écrit « scénario empreinte » sur la sortie standard, un par ligne.
//
// (15/11/2026) Les scénarios qui génèrent une année de gardes font 91 % de la
// durée du banc (24 min sur 2 processeurs, mesuré le 15/11). La plupart des
// pushs ne touchent ni au générateur ni au simulateur : ces scénarios
// rejouaient alors exactement le même calcul pour le même verdict.
// Après un banc COMPLET au vert, lancer.sh garde l'empreinte de chacun dans
// empreintes.txt ; au banc suivant, un scénario dont l'empreinte n'a pas bougé
// est repris tel quel au lieu d'être relancé.
//
// L'empreinte est volontairement LARGE (en cas de doute, on relance). Elle
// couvre, pour un scénario :
//   - son propre texte ;
//   - TOUS les fichiers de banc/ qui ne sont pas des scénarios (modules,
//     jeux de données, référence, dépendances), sauf README.md et lancer.sh ;
//   - TOUT simulateur/, et dans gas/ le code commun et le générateur (ce que
//     le harnais charge toujours) ;
//   - TOUT gas/ et sauvegarde.gs si le scénario charge un module qui lit les
//     .gs par listage (stubs, monde) ou liste lui-même gas/ ;
//   - tout fichier du dépôt dont le nom apparaît dans le scénario ou dans un
//     module qu'il charge ;
//   - le générateur du dernier commit, si le scénario relit « HEAD » ;
//   - la version de Node.
// Un scénario qui liste un dossier hors de gas/ n'a pas d'empreinte : il est
// toujours relancé (on ne sait pas ce qu'il lit).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execSync } = require('child_process');

const BANC = __dirname, RACINE = path.join(__dirname, '..');
const scenarios = process.argv.slice(2);
const lire = f => { try { return fs.readFileSync(f); } catch (e) { return Buffer.from(''); } };
const suivis = execSync('git ls-files', { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean);
const estScenario = f => /^banc\/(banc\S*|e2e|interface)\.(js|mjs)$/.test(f);

// Socle commun : banc/ hors scénarios et hors empreintes.txt, simulateur/, et
// les deux .gs que le harnais charge toujours (simulateur/harness.js).
const socle = suivis.filter(f =>
  (f.startsWith('banc/') && !estScenario(f) && f !== 'banc/empreintes.txt' && f !== 'banc/README.md' && f !== 'banc/lancer.sh') ||
  f.startsWith('simulateur/') || f === 'gas/code.gs' || f === 'gas/generateur_gardes.gs').sort();
const toutGs = suivis.filter(f => f.startsWith('gas/') || f.endsWith('.gs'));
// Des fichiers non suivis par git peuvent aussi être lus (copie de travail) :
// on prend le contenu sur disque, pas celui du dernier commit.
const hSocle = crypto.createHash('sha256');
socle.forEach(f => { hSocle.update(f + '\0'); hSocle.update(lire(path.join(RACINE, f))); hSocle.update('\0'); });
const empSocle = hSocle.digest('hex');

// Texte d'un scénario + modules auxiliaires qu'il charge, de proche en proche
// (même règle que selection.js).
const modules = {};
socle.filter(f => /\.m?js$/.test(f)).forEach(f => { modules[path.basename(f).replace(/\.m?js$/, '')] = path.join(RACINE, f); });
const cite = (t, nom) => new RegExp('[\'"/`]' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\'"`]|\\.m?js)').test(t);
// Modules qui lisent les .gs par listage du dossier gas/ (même liste que
// selection.js ; harness.js, lui, ne charge que code.gs et le générateur).
const LECTEURS_GS = ['stubs', 'monde'];
function texteComplet(fichier) {
  const vus = new Set(), noms = new Set(); let texte = ''; const pile = [path.join(BANC, fichier)];
  while (pile.length) {
    const f = pile.pop(); if (vus.has(f)) continue; vus.add(f);
    const t = lire(f).toString('utf8'); texte += '\n' + t;
    Object.keys(modules).forEach(m => { if (cite(t, m)) { noms.add(m); pile.push(modules[m]); } });
  }
  return { texte, lecteurGs: LECTEURS_GS.some(m => noms.has(m)) };
}

let headGas = null;
const teteGas = () => {
  if (headGas === null) { try { headGas = execSync('git rev-parse HEAD:gas', { cwd: RACINE, encoding: 'utf8' }).trim(); } catch (e) { headGas = 'inconnu'; } }
  return headGas;
};

scenarios.forEach(s => {
  const propre = lire(path.join(BANC, s)).toString('utf8');
  // Liste un dossier autre que gas/ (déjà couvert) : pas d'empreinte.
  const listages = propre.match(/readdirSync\([^)]*\)/g) || [];
  if (listages.some(l => !/'gas'/.test(l))) { console.log(s + ' -'); return; }
  const { texte, lecteurGs } = texteComplet(s);
  const gsLus = (lecteurGs || listages.length) ? toutGs : [];
  const h = crypto.createHash('sha256');
  h.update(process.version + '\0' + empSocle + '\0' + s + '\0'); h.update(propre);
  suivis.filter(f => !socle.includes(f) && f !== 'banc/' + s && (gsLus.includes(f) || texte.indexOf(path.basename(f)) >= 0))
    .sort().forEach(f => { h.update('\0' + f + '\0'); h.update(lire(path.join(RACINE, f))); });
  if (/git show HEAD/.test(texte)) h.update('\0HEAD:gas=' + teteGas());
  console.log(s + ' ' + h.digest('hex').slice(0, 16));
});
