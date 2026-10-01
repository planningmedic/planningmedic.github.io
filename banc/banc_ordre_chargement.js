/* ═══ BANC — ORDRE DE CHARGEMENT DES FICHIERS APPS SCRIPT (01/10/2026) ═══
   Apps Script charge tous les fichiers dans UN espace global, l'un après
   l'autre, dans l'ordre du projet. Une constante (const) d'un fichier n'existe
   qu'une fois ce fichier chargé : la lire AU CHARGEMENT d'un autre fichier
   suppose un ordre précis.
   Défaut réel : miroir.gs lisait TOPOS_FOLDER (portail.gs) au chargement. Un
   envoi par clasp a rangé les fichiers par ordre alphabétique — miroir avant
   portail — et TOUT le serveur a répondu « TOPOS_FOLDER is not defined »,
   jusqu'au retour à la version précédente.
   Ici, les vrais fichiers du serveur sont chargés dans plusieurs ordres :
   aucun ne doit échouer. */
const vm = require('vm'), fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

// Les fichiers du projet en ligne : gas/*.gs (hors dev.gs, qui n'y est pas), le module partagé et la sauvegarde.
const racine = path.join(__dirname, '..');
const fichiers = fs.readdirSync(path.join(racine, 'gas')).filter(f => f.endsWith('.gs') && f !== 'dev.gs').map(f => 'gas/' + f)
  .concat(['partage/dispo_jour.js', 'sauvegarde.gs']);
const sources = {};
fichiers.forEach(f => { sources[f] = fs.readFileSync(path.join(racine, f), 'utf8'); });

// Services Google : n'importe quel appel rend un objet neutre. Seul compte ce qui s'exécute AU CHARGEMENT.
const neutre = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : neutre), apply: () => neutre, construct: () => neutre });
function charger(ordre) {
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Object, Array, String, Number, RegExp, Error, Set, Map,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: neutre, PropertiesService: neutre, LockService: neutre, ScriptApp: neutre, UrlFetchApp: neutre, Utilities: neutre,
    Logger: neutre, DriveApp: neutre, ContentService: neutre, Session: neutre, MailApp: neutre, GmailApp: neutre, CacheService: neutre,
    HtmlService: neutre, CalendarApp: neutre, DocumentApp: neutre, XmlService: neutre });
  // Un seul script : c'est ainsi qu'Apps Script partage les const entre fichiers.
  const src = ordre.map(f => sources[f]).join('\n;\n');
  try { vm.runInContext(src, ctx); return null; } catch (e) { return e.message; }
}

console.log('\n═══ Les fichiers du serveur se chargent dans n\'importe quel ordre ═══');
const alpha = fichiers.slice().sort((a, b) => path.basename(a).toLowerCase().localeCompare(path.basename(b).toLowerCase()));
V('ordre alphabétique (celui d\'un envoi par clasp)', charger(alpha) === null, charger(alpha));
V('ordre alphabétique inverse', charger(alpha.slice().reverse()) === null, charger(alpha.slice().reverse()));
// Tirages reproductibles : même graine, mêmes ordres à chaque passage.
let graine = 20261001;
const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
let echecs = [];
for (let i = 0; i < 40; i++) {
  const o = fichiers.slice();
  for (let j = o.length - 1; j > 0; j--) { const k = Math.floor(hasard() * (j + 1)); [o[j], o[k]] = [o[k], o[j]]; }
  const err = charger(o);
  if (err) echecs.push(err);
}
V('40 ordres tirés au hasard : aucun accès prématuré', echecs.length === 0, echecs.slice(0, 2));
V('le dossier des documents du miroir se lit à l\'appel, plus au chargement',
  !/^const DOC_DOSSIERS/m.test(sources['gas/miroir.gs']) && /function _docDossiers_\(\)/.test(sources['gas/miroir.gs']));

console.log(`\nbanc_ordre_chargement : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
