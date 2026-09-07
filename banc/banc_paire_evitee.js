/* ═══ BANC — PAIRES À ÉVITER (07/09/2026) ═══════════════════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Deux MAR du service vivent ensemble. Rien, jusqu'ici, n'empêchait le
   générateur de les envoyer de garde la même nuit : toutes les contraintes du
   moteur portent sur UNE personne (absence, deux gardes d'affilée, week-end,
   quotité), aucune sur le COUPLE de personnes posées le même jour. Relevé sur
   le planning 2026 réel : 5 nuits où aucun des deux n'était à la maison —
   1 garde commune (jeudi 31 décembre) et 4 fois l'un de garde, l'autre de 18h.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. INERTE PAR DÉFAUT — sans ligne PAIRES_A_EVITER dans CONFIG, pas une seule
      décision ne change. C'est la garantie qui permet de livrer ce mécanisme
      sans rien risquer sur une génération déjà prévue. Une ligne vide ou mal
      écrite ne change rien non plus : elle ne doit pas contraindre au hasard.
   2. LA RÈGLE TIENT — ni garde commune, ni garde + 18h, sur toute l'année.
      Le 18h compte : celui qui le fait rentre tard, la maison est vide pareil.
   3. LA COUVERTURE PRIME — la règle ne crée jamais de journée sans binôme, et
      les règles dures du moteur restent intactes.
   4. SYMÉTRIE — « A+B » et « B+A » disent la même chose.
   5. CONTRE-ÉPREUVE — le même scénario rejoué sur une copie du générateur
      privée du correctif DOIT produire des collisions. Sans elle, ce fichier
      ne prouverait rien : un test qui passe aussi sur le code non corrigé ne
      teste que lui-même.

   Le vrai générateur du dépôt est exécuté, jamais recopié.  */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const CODE = fs.readFileSync(path.join(__dirname, '..', 'gas', 'code.gs'), 'utf8');
/* Deux paires D'ESSAI, choisies UNIQUEMENT parce qu'elles se retrouvent souvent
   ensemble dans ce jeu de données (17 et 13 nuits sans la règle) : une paire qui ne
   se croise jamais ferait passer le test sans rien démontrer.
   Elles n'ont aucun rapport avec la configuration réelle du service, qui vit dans le
   classeur et nulle part ailleurs — le dépôt est public. */
const P1 = ['OPPRECHT', 'WIDEHEM'], P2 = ['FERRIERO', 'SALA'];

function lancer(config, genSource) {
  const roster = H.defaultRoster();
  const sheets = [
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']].concat(config || [])),
  ];
  const ss = H.makeSpreadsheet(sheets);
  const logs = [];
  const ctx = H.buildContext(ss, logs, genSource);
  let error = null;
  try { ctx.generateGardes(YEAR); } catch (e) { error = e.message; }
  return { ss, logs, error, ctx, roster };
}
const planning = r => JSON.stringify(r.ss.getSheetByName(`GARDES_${YEAR}`)._rows);
const estGarde = v => v === 'G' || v === 'G2';
// Nuits où les deux sont dehors : tous les deux de garde, ou l'un de garde et
// l'autre de 18h. Rendu détaillé pour que l'échec dise QUELLE date pose problème.
function nuitsCommunes(r, a, b) {
  const P = A.parsePlanning(r.ss, YEAR), out = [];
  P.dates.forEach(d => {
    const x = P.byDoc[a] && P.byDoc[a][d], y = P.byDoc[b] && P.byDoc[b][d];
    if (estGarde(x) && estGarde(y)) out.push([d, 'garde+garde']);
    else if ((estGarde(x) && y === '18') || (estGarde(y) && x === '18')) out.push([d, 'garde+18h']);
  });
  return out;
}

console.log('─── 1. Inerte tant que rien n\'est déclaré ───');
const base = lancer(null);
V('génération sans erreur, sans règle déclarée', !base.error, base.error);
const vide = lancer([['PAIRES_A_EVITER', '']]);
V('une ligne PAIRES_A_EVITER VIDE ne change pas une seule garde',
  planning(vide) === planning(base));
const cassee = lancer([['PAIRES_A_EVITER', 'DUPONT;MARTIN+;+DURAND;MARTIN+MARTIN']]);
V('une ligne mal écrite est ignorée, le planning reste identique',
  planning(cassee) === planning(base));

console.log('\n─── 2. La règle tient ───');
const regle = lancer([['PAIRES_A_EVITER', P1.join('+') + ';' + P2.join('+')]]);
V('génération sans erreur avec la règle', !regle.error, regle.error);
const c1 = nuitsCommunes(regle, P1[0], P1[1]);
const c2 = nuitsCommunes(regle, P2[0], P2[1]);
V(`aucune nuit commune pour ${P1.join('/')}`, c1.length === 0, c1);
V(`aucune nuit commune pour ${P2.join('/')}`, c2.length === 0, c2);

console.log('\n─── 3. La couverture prime, les règles dures tiennent ───');
const P = A.parsePlanning(regle.ss, YEAR);
V('chaque jour a bien un G et un G2',
  P.dates.every(d => P.byDate[d].G && P.byDate[d].G2),
  P.dates.filter(d => !P.byDate[d].G || !P.byDate[d].G2).slice(0, 5));
const feries = new Set([...regle.ctx.getJoursFeries(YEAR), ...regle.ctx.getJoursFeries(YEAR + 1)]);
const inv = A.checkInvariants(P, { ctxFeries: feries, roster: regle.roster });
/* On compare aux invariants du MÊME scénario sans la règle, au lieu d'exiger zéro :
   ce jeu de données a un couplage férié qui casse déjà (samedi 15 mai 2027 / lundi de
   Pentecôte, binôme du samedi indisponible → repli documenté du moteur). Exiger zéro
   ferait échouer ce fichier pour un défaut qui ne le regarde pas ; ce qu'il doit
   prouver, c'est que la règle n'en AJOUTE aucun. */
const invBase = A.checkInvariants(A.parsePlanning(base.ss, YEAR), { ctxFeries: feries, roster: base.roster });
V('la règle ne casse aucun invariant du moteur (2 gardes d\'affilée, RG, VD, fériés…)',
  inv.errs.every(e => invBase.errs.indexOf(e) >= 0),
  inv.errs.filter(e => invBase.errs.indexOf(e) < 0).slice(0, 5));

console.log('\n─── 4. Symétrie ───');
const inverse = lancer([['PAIRES_A_EVITER', P1[1] + '+' + P1[0]]]);
V('« B+A » interdit autant que « A+B »',
  nuitsCommunes(inverse, P1[0], P1[1]).length === 0);

console.log('\n─── 5. Contre-épreuve — sans le correctif, ça doit rater ───');
// On neutralise le seul prédicat de la règle : le reste du générateur est intact.
const SANS = SRC.replace(/const evite = \(a,b,d\) => [^\n]*\n/,
                         'const evite = (a,b,d) => false;\n');
V('la neutralisation a bien pris', SANS !== SRC);
const sansRegle = lancer([['PAIRES_A_EVITER', P1.join('+') + ';' + P2.join('+')]], SANS);
const d1 = nuitsCommunes(sansRegle, P1[0], P1[1]);
const d2 = nuitsCommunes(sansRegle, P2[0], P2[1]);
V(`sans le correctif, ${P1.join('/')} se retrouvent ensemble`, d1.length > 0, d1.length);
V(`sans le correctif, ${P2.join('/')} se retrouvent ensemble`, d2.length > 0, d2.length);
V('la règle supprime bien toutes ces nuits',
  d1.length + d2.length > 0 && c1.length + c2.length === 0,
  { avant: d1.length + d2.length, apres: c1.length + c2.length });

console.log('\n─── 6. La règle est appliquée PARTOUT où un binôme se forme ───');
V('la source est CONFIG, et aucune paire n\'est écrite dans le dépôt (public)',
  /PAIRES_A_EVITER/.test(CODE) && !/[A-Z]{3,}\s*\+\s*[A-Z]{3,}/.test(CODE + SRC));
V('les quatre dates de Noël / Jour de l\'An sont exemptées',
  /const DATES_EXEMPTES = new Set\(\[`\$\{year\}-12-24`,`\$\{year\}-12-25`,`\$\{year\}-12-31`,`\$\{year\+1\}-01-01`\]\)/.test(SRC));
V('une unité est exemptée dès qu\'UN de ses jours l\'est',
  /Array\.isArray\(d\) \? d\.some\(x=>DATES_EXEMPTES\.has\(x\)\)/.test(SRC));
// La rotation de Noël se joue sur l'ancienneté seule. Si un jour quelqu'un y ajoute
// la règle de paire, ce test doit tomber : c'est une décision, pas un détail.
V('la rotation de Noël est intacte : son choix de paire ignore la règle',
  /const choisirPaire=\(liste,unit\)=>\{[\s\S]{0,600}?\n    \};/.exec(SRC)
  && !/okPaire|evite\(/.test(/const choisirPaire=\(liste,unit\)=>\{[\s\S]{0,600}?\n    \};/.exec(SRC)[0]));
V('la priorité de Noël reste l\'ancienneté (jamais fait, puis le plus ancien)',
  /const overdueKey=\(m\)=>\{const ly=noelHistory\[m\]; return ly==null\?\[0,0,m\]:\[1,ly,m\];\};/.test(SRC));
V('chaque portée de la règle sait de quelle date elle parle',
  (SRC.match(/evite\([^)]*,\s*(date|dd|Dn|d2|serie\[i\]|day\.date|\[date,dimDate\])\)/g) || []).length >= 6);
V('jours critiques : la paire est pénalisée, jamais exclue (sinon série insoluble)',
  /const _pen = evite\(p\[a\],p\[b\],serie\[i\]\) \? 1000 : 0;/.test(SRC));
V('souhaits : le binôme entraîné n\'est jamais le conjoint',
  /const tous=sansPaire\(/.test(SRC) && /const others=sansPaire\(/.test(SRC));
V('placement chronologique et VD : descente vers la meilleure paire autorisée',
  (SRC.match(/=meilleurePaire\(/g) || []).length === 3);   // dernier recours, VD, placement normal
V('optimiseur global : un transfert ne reconstitue pas la paire',
  /if\(role_!==undefined && evite\(B, role_===0\?gg\.g2:gg\.g, dd\)\)return false;/.test(SRC));
V('passe confort : ni le bénéficiaire ni le cédant n\'atterrit à côté du conjoint',
  (SRC.match(/\/\/ \(07\/09\/2026\)[^\n]*conjoint/g) || []).length >= 2);
V('18h : le conjoint du MAR de garde est écarté du vivier',
  /const paireDeGarde18=/.test(SRC) && /_libre\(id\)&&dispo18/.test(SRC));
V('la couverture garde toujours le dernier mot (vivier de repli sans la règle)',
  /dernier recours absolu : la paire cède/.test(SRC));
V('les versions des deux fichiers GAS ont été montées',
  (SRC.match(/GAS_VERSION_GENERATEUR = '(\d{4}-\d{2}-\d{2})\.(\d+)'/) || [,'',''])[0] >= "GAS_VERSION_GENERATEUR = '2026-09-07.2'"
  && (CODE.match(/GAS_VERSION_CODE = '(\d{4}-\d{2}-\d{2})\.(\d+)'/) || [,'',''])[0] >= "GAS_VERSION_CODE = '2026-09-07.2'");

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
