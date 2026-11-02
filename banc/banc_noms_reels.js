/* ═══ BANC — AUCUN NOM RÉEL DANS LE DÉPÔT (02/11/2026) ═══
   Le dépôt est public et son historique définitif. Ce scénario relit TOUS les
   fichiers texte suivis par git et échoue si un nom réel y apparaît : nom de
   famille d'un MAR, prénom du responsable, nom de l'établissement, initiales
   à trois lettres sans homonyme de code.

   LA LISTE N'EST PAS DANS LE DÉPÔT — ni en clair, ni en empreintes (une
   empreinte de nom de famille se retrouve en quelques secondes en essayant
   tous les noms français : publier les empreintes = publier la liste).
   Elle vit HORS du dépôt : variable NOMS_REELS (chemin d'un fichier), sinon
   ~/.planningmedic/noms_reels.txt. Un nom par ligne, # = commentaire ;
   après la ligne [exact], la casse compte (initiales : XYZ ≠ « xyz »).

   À CHAQUE SESSION, avant le banc : reconstituer le fichier à partir des MAR
   de la copie rapide (clé config_admin du stockage MIROIR, champ nom), plus
   le prénom du responsable et le nom de l'établissement. Fichier absent =
   ÉCHEC, exprès : le contrôle ne doit pas pouvoir être sauté sans se voir.

   Exceptions : un homonyme légitime (auteur d'un article publié, par ex.)
   se déclare dans EXCEPTIONS par fichier ET par motif exact du contexte. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const RACINE = path.join(__dirname, '..');

// Homonymes légitimes : [fichier, contexte exact qui contient le mot]. Aucun nom n'est écrit ici :
// le contexte est déjà dans le fichier concerné.
const EXCEPTIONS = [
  ['banc/banc_veille.js', 'Reignier J, Richard JC'],   // auteurs d'un essai publié (veille biblio)
  ['banc/banc_veille.js', "'Reignier J', 'Richard JC'"],
];

const sansAccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const echap = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

console.log('\n═══ AUCUN NOM RÉEL DANS LE DÉPÔT ═══');
const chemin = process.env.NOMS_REELS || path.join(os.homedir(), '.planningmedic', 'noms_reels.txt');
let brut = null;
try { brut = fs.readFileSync(chemin, 'utf8'); } catch (e) {}
V('la liste des noms (hors dépôt) est présente — sinon la reconstituer depuis la copie rapide, voir l\'en-tête',
  !!brut, chemin);
if (!brut) { console.log(`\n  ${ok} ✓  ${ko} ✗`); process.exit(1); }

const noms = [], exacts = [];
let modeExact = false;
brut.split(/\r?\n/).forEach(l => {
  l = l.trim();
  if (!l || l.startsWith('#')) return;
  if (l === '[exact]') { modeExact = true; return; }
  (modeExact ? exacts : noms).push(l);
});
V('la liste n\'est pas vide (au moins 20 noms)', noms.length >= 20, noms.length);

const fichiers = execSync('git ls-files --cached --others --exclude-standard', { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(f => !/\.(png|jpe?g|gif|ico|woff2?|pdf|xlsx|webp)$/i.test(f));
V('les fichiers du dépôt sont listés', fichiers.length > 100, fichiers.length);

// Un motif par nom ; les espaces internes tolèrent toute suite de blancs.
const motif = (n, i) => new RegExp('(?<![A-Za-z0-9_])' + echap(n).replace(/\s+/g, '\\s+') + '(?![A-Za-z0-9_])', i ? 'gi' : 'g');
const RN = noms.map(n => motif(sansAccent(n), true)), RE = exacts.map(n => motif(n, false));
const trouves = [];
fichiers.forEach(f => {
  let t;
  try { t = fs.readFileSync(path.join(RACINE, f), 'utf8'); } catch (e) { return; }
  if (t.indexOf('\u0000') >= 0) return;   // binaire
  const tn = sansAccent(t);
  const exc = EXCEPTIONS.filter(e => e[0] === f).map(e => e[1]);
  const signaler = (re, texte) => {
    re.lastIndex = 0; let m;
    while ((m = re.exec(texte))) {
      const ctx = texte.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
      if (exc.some(e => ctx.indexOf(sansAccent(e)) >= 0 || ctx.indexOf(e) >= 0)) continue;
      const ligne = texte.slice(0, m.index).split('\n').length;
      trouves.push(f + ':' + ligne);   // jamais le nom lui-même dans la sortie
    }
  };
  RN.forEach(re => signaler(re, tn));
  RE.forEach(re => signaler(re, t));
});
V('aucun nom réel dans les fichiers du dépôt (emplacements seulement, jamais le nom)', trouves.length === 0, trouves.slice(0, 20));

// Contre-épreuve : le détecteur voit bien un nom de la liste glissé dans un texte.
const essai = 'Texte quelconque — ' + noms[0].toLowerCase() + ' — fin.';
V('contre-épreuve : un nom de la liste glissé dans un texte est détecté', RN[0].test(sansAccent(essai)));

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
