/* ═══ BANC — l'identifiant du classeur d'archive vit dans CONFIG (13/09/2026) ═══
   Avant : `const ARCHIVE_SS_ID = '<identifiant Drive>'` en dur dans
   generateur_gardes.gs, donc dans un dépôt public. Après : la ligne
   ARCHIVE_DRIVE_ID de l'onglet CONFIG (elle existait, personne ne la lisait),
   lue au premier usage puis mémorisée.
   Ce scénario vérifie les trois choses qui comptent :
   1. la valeur de CONFIG est bien celle que voient les appelants ;
   2. sans la ligne, la valeur est vide et l'archivage refuse clairement au
      lieu d'ouvrir n'importe quoi ;
   3. aucun identifiant Drive ne subsiste dans le code GAS du dépôt. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const YEAR = 2027;

function monter(config) {
  const roster = H.defaultRoster();
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']].concat(config)),
  ]);
  return H.buildContext(ss, []);
}

console.log('═══ ARCHIVE_DRIVE_ID (CONFIG) enfin lu par le code ═══');
{
  const ctx = monter([['ARCHIVE_DRIVE_ID', ' id-archive-essai '], ['AUTRE', 'x']]);
  V('la valeur de CONFIG est servie aux appelants, espaces retirés', ctx.ARCHIVE_SS_ID === 'id-archive-essai', ctx.ARCHIVE_SS_ID);
  V('lecture répétée : même valeur (mémorisée)', ctx.ARCHIVE_SS_ID === 'id-archive-essai');
}
{
  const ctx = monter([['AUTRE', 'x']]);
  V('sans ligne ARCHIVE_DRIVE_ID, la valeur est vide', ctx.ARCHIVE_SS_ID === '', ctx.ARCHIVE_SS_ID);
  let msg = '';
  try { ctx.archiveMoveTabs_(YEAR); } catch (e) { msg = e.message; }
  V('l\'archivage refuse avec un message qui nomme la ligne manquante', /ARCHIVE_DRIVE_ID/.test(msg) && /CONFIG/.test(msg), msg);
}
{
  const gas = fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs'))
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8')).join('\n');
  V('aucun identifiant Drive (44 caractères) en dur dans le code GAS',
    !/['"][A-Za-z0-9_-]{44}['"]/.test(gas));
  V('les appelants n\'ont pas changé : openById(ARCHIVE_SS_ID) partout',
    (gas.match(/openById\(ARCHIVE_SS_ID\)/g) || []).length >= 8, (gas.match(/openById\(ARCHIVE_SS_ID\)/g) || []).length);
}

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
