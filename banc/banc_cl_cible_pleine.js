/* ═══ BANC — CONGÉ LONG À CIBLE PLEINE (05/10/2026) ═══════════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Un congé long (CL) réduit la cible de gardes au prorata des jours d'absence ;
   la part libérée va aux autres. Un MAR peut préférer l'inverse : garder la
   cible d'une année pleine et la concentrer sur ses mois de présence. Le choix
   se fait dans le classeur, colonne CIBLE_PLEINE du registre ABSENCES_LONGUES.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Sans l'option (registre absent, ancien format à 4 colonnes, case vide) :
      la cible est réduite comme avant — aucun changement de comportement.
   2. Avec l'option : sa part exacte est IDENTIQUE à celle d'un MAR de même
      profil sans absence, sur chaque axe.
   3. Personne ne paie pour lui : les parts des autres sont identiques à celles
      d'une année où il n'aurait pas été absent du tout.
   4. Les jours de CL restent bloqués : aucune garde, aucune 18 h, aucun repos
      n'y est posé.
   5. CONTRE-ÉPREUVE : le générateur d'avant ce correctif, rejoué sur la même
      entrée, doit réduire la cible. Sans elle, ce fichier validerait tout.

   Profils entièrement fictifs — le dépôt est public. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const ID = 'PAPA', TEMOIN = 'AUBERT';          // deux 100 % sans drapeau
const D1 = '2027-02-06', D2 = '2027-03-01';     // 24 jours, J1 inclus
const joursCL = [];
for (let d = new Date(D1 + 'T12:00:00'); d <= new Date(D2 + 'T12:00:00'); d.setDate(d.getDate() + 1))
  joursCL.push(d.toISOString().slice(0, 10));
const indCL = { [ID]: Object.fromEntries(joursCL.map(d => [d, 'CL'])) };

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

function lancer({ cl, registre, genSource }) {
  const roster = H.defaultRoster().map(r => r.slice());
  roster.push([ID, 100, 100, {}]);
  const sheets = [
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, cl ? indCL : {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ];
  if (registre) sheets.push(H.makeSheet('ABSENCES_LONGUES', registre));
  const ss = H.makeSpreadsheet(sheets);
  const logs = [];
  const ctx = H.buildContext(ss, logs, genSource);
  let error = null;
  try { ctx.generateGardes(YEAR); } catch (e) { error = e.message; }
  return { ss, logs, error, st: H.readStats(ss, YEAR) };
}
const ENT4 = ['MAR_ID', 'DATE_DEBUT', 'DATE_FIN', 'POSE_LE'];
const ENT5 = ENT4.concat(['CIBLE_PLEINE']);
const AXES = ['PART EXACTE', 'PART EXACTE SAM', 'PART EXACTE JEU', 'PART EXACTE VD', 'PART EXACTE VJF', 'PART EXACTE JF'];
const part = (r, id, ax) => Number(r.st.byId[id][ax]);

console.log('\n═══ 0. Le correctif est dans le code ═══');
V('le générateur lit la colonne CIBLE_PLEINE du registre', /CIBLE_PLEINE/.test(SRC) && /ABSENCES_LONGUES/.test(SRC));

const sansAbs  = lancer({ cl: false });
const sansOpt  = lancer({ cl: true });
const ancien   = lancer({ cl: true, registre: [ENT4, [ID, D1, D2, '']] });
const caseVide = lancer({ cl: true, registre: [ENT5, [ID, D1, D2, '', '']] });
const plein    = lancer({ cl: true, registre: [ENT5, [ID, D1, D2, '', 'OUI']] });
[['sans absence', sansAbs], ['CL sans option', sansOpt], ['registre ancien format', ancien],
 ['case vide', caseVide], ['cible pleine', plein]].forEach(([n, r]) =>
  V('génération sans erreur — ' + n, !r.error && r.st, r.error));

console.log('\n═══ 1. Sans l\'option, rien ne change : la cible est réduite ═══');
V('CL sans registre : sa part est inférieure à celle du témoin',
  part(sansOpt, ID, 'PART EXACTE') < part(sansOpt, TEMOIN, 'PART EXACTE') - 0.5,
  [part(sansOpt, ID, 'PART EXACTE'), part(sansOpt, TEMOIN, 'PART EXACTE')]);
V('registre à 4 colonnes : mêmes parts qu\'aujourd\'hui, pour tout le monde',
  Object.keys(sansOpt.st.byId).every(id => AXES.every(ax => part(ancien, id, ax) === part(sansOpt, id, ax))));
V('case CIBLE_PLEINE vide : mêmes parts qu\'aujourd\'hui, pour tout le monde',
  Object.keys(sansOpt.st.byId).every(id => AXES.every(ax => part(caseVide, id, ax) === part(sansOpt, id, ax))));

console.log('\n═══ 2. Avec l\'option : la part d\'une année pleine, sur chaque axe ═══');
AXES.forEach(ax => V(`${ax} : identique au témoin sans absence`,
  Math.abs(part(plein, ID, ax) - part(plein, TEMOIN, ax)) < 0.001, [part(plein, ID, ax), part(plein, TEMOIN, ax)]));
V('le journal du calcul signale la cible pleine (24 j)',
  plein.logs.some(l => l.indexOf(ID) >= 0 && /cible pleine \(24 j\)/.test(l)),
  plein.logs.filter(l => /cible pleine/.test(l)));

console.log('\n═══ 3. Personne ne paie pour lui ═══');
const autres = Object.keys(sansAbs.st.byId).filter(id => id !== ID && sansAbs.st.byId[id]['PART EXACTE'] !== '');
V('les parts de tous les autres sont celles d\'une année sans son absence',
  autres.every(id => AXES.every(ax => Math.abs(part(plein, id, ax) - part(sansAbs, id, ax)) < 0.001)),
  autres.filter(id => Math.abs(part(plein, id, 'PART EXACTE') - part(sansAbs, id, 'PART EXACTE')) >= 0.001));
V('sans l\'option, les autres absorbent sa part (contrôle du sens)',
  autres.some(id => part(sansOpt, id, 'PART EXACTE') > part(sansAbs, id, 'PART EXACTE') + 0.001));

console.log('\n═══ 4. Les jours de congé restent bloqués ═══');
const P = A.parsePlanning(plein.ss, YEAR);
const posesSurCL = joursCL.filter(d => P.byDoc[ID][d] && P.byDoc[ID][d] !== 'CL');
V('les 24 jours portent CL au planning, et rien d\'autre', posesSurCL.length === 0 &&
  joursCL.every(d => P.byDoc[ID][d] === 'CL'), posesSurCL.map(d => [d, P.byDoc[ID][d]]));
const gardesReelles = Object.keys(P.byDoc[ID]).filter(d => P.byDoc[ID][d] === 'G' || P.byDoc[ID][d] === 'G2').length;
V('ses gardes réelles tiennent sa cible pleine à une garde près',
  Math.abs(gardesReelles - part(plein, ID, 'PART EXACTE')) <= 1.5, [gardesReelles, part(plein, ID, 'PART EXACTE')]);
V('aucune journée sans binôme', !plein.logs.some(l => /[1-9]\d* jour\(s\) sans bin/.test(l)),
  plein.logs.filter(l => /sans bin/.test(l)).slice(0, 3));

console.log('\n═══ 5. Contre-épreuve : le générateur d\'avant réduisait la cible ═══');
const SRC_AVANT = SRC.replace(/ && !clPlein\[String\(id\)\.toUpperCase\(\)\]\?\.has\(d\.date\)/, '');
V('la copie sans correctif diffère bien du dépôt', SRC_AVANT !== SRC);
const avant = lancer({ cl: true, registre: [ENT5, [ID, D1, D2, '', 'OUI']], genSource: SRC_AVANT });
V('sans le correctif, la même entrée donne une part réduite',
  part(avant, ID, 'PART EXACTE') < part(avant, TEMOIN, 'PART EXACTE') - 0.5,
  [part(avant, ID, 'PART EXACTE'), part(avant, TEMOIN, 'PART EXACTE')]);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
