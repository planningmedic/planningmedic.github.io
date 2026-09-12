/* ═══ BANC — LE DÉTAIL DES AXES RARES DANS LE CALCUL À BLANC (11/09/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE.
   Le calcul à blanc ne crée aucun onglet : tout ce qu'il ne dit pas est perdu.
   Sur les samedis, chacun en doit cinq par an et un tableau de compteurs suffit.
   Sur les veilles de férié, chacun en doit UNE TOUS LES DEUX ANS : un écart de
   1 ne se lit pas, et surtout rien ne dit POURQUOI celui qui la devait ne l'a
   pas eue. Le rapport liste donc désormais chaque date de l'axe, son binôme, et
   pour ceux qui sont sous leur part, le motif de chaque date manquée.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Toutes les dates de l'axe sont listées, avec un binôme, sans trou.
   2. Les motifs couvrent CHAQUE date : un total qui ne tombe pas juste voudrait
      dire qu'une date a été analysée deux fois ou pas du tout.
   3. Personne n'est annoncé « sous sa part » s'il est à sa part : la comparaison
      se fait sur la part exacte, pas sur la cible arrondie.
   4. Le cumul des années précédentes additionne bien, et il ne s'affiche pas
      quand l'année d'avant ne porte pas la part exacte.
   5. Le rapport reste en LECTURE : aucun onglet créé, aucune notification.

   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 260) : '')); } };

const ROSTER = H.defaultRoster().filter(r => !r[3].dateDebut && !r[3].dateFin);
const CFG = () => H.makeSheet('CONFIG', [['PARAMETRE', 'VALEUR']]);

function monte(year, statsPrev) {
  const sheets = [H.makeSheet('MEDECINS', H.medecinsRows(ROSTER)),
    H.makeSheet(`INDISPOS_${year}`, H.indisposRows(year, ROSTER, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(year)), CFG()];
  if (statsPrev) sheets.push(H.makeSheet(`STATS_GARDES_${year - 1}`, statsPrev));
  const ss = H.makeSpreadsheet(sheets), logs = [];
  const ctx = H.buildContext(ss, logs);
  return { ss, logs, ctx };
}

/* Une année écrite d'abord, pour nourrir le cumul de l'année suivante. */
const a26 = monte(2026);
a26.ctx.generateGardes(2026);
const stats26 = a26.ss.getSheetByName('STATS_GARDES_2026')._rows;
V('l\'année de référence produit ses statistiques', !!stats26 && stats26.length > 1);

const a27 = monte(2027, stats26);
const avant = a27.ss.getSheetNames ? a27.ss.getSheetNames().slice() : null;
a27.ctx.essaiGenerationGardes(2027);
const rapport = String(a27.logs[a27.logs.length - 1] || '');

console.log('\n═══ 1. Les dates de l\'axe sont toutes listées ═══');
V('le rapport a bien été produit', rapport.indexOf('ESSAI DE GÉNÉRATION') >= 0, rapport.slice(0, 120));
V('le bloc des veilles de férié est présent', rapport.indexOf('VEILLES DE FÉRIÉ') >= 0);
V('le bloc des jours fériés est présent', rapport.indexOf('JOURS FÉRIÉS') >= 0);

function bloc(titre) {
  const i = rapport.indexOf('── ' + titre);
  if (i < 0) return [];
  const reste = rapport.slice(i).split('\n');
  const out = [];
  for (let k = 1; k < reste.length; k++) {
    if (/^── /.test(reste[k])) break;
    out.push(reste[k]);
  }
  return out;
}
const bVjf = bloc('VEILLES DE FÉRIÉ');
const entete = (rapport.match(/── VEILLES DE FÉRIÉ · (\d+) date\(s\) ──/) || [])[1];
const datesListees = bVjf.filter(l => /^\s{3}\d{4}-\d{2}-\d{2}/.test(l));
V('l\'en-tête annonce un nombre de dates', !!entete, entete);
V('autant de lignes de date que le nombre annoncé',
  Number(entete) === datesListees.length, { annonce: entete, listees: datesListees.length });
V('chaque date porte un binôme de deux noms',
  datesListees.length > 0 && datesListees.every(l => /\S\s+\+\s+\S/.test(l)), datesListees.slice(0, 3));
V('chaque date est un lundi, mardi, mercredi ou jeudi',
  datesListees.every(l => /\s(lun|mar|mer|jeu)\s/.test(l)), datesListees.slice(0, 3));

console.log('\n═══ 2. Les motifs couvrent chaque date, sans trou ni doublon ═══');
/* Le rapport est du texte : on remonte à la source, qui est ce que le calcul à
   blanc a rendu. Chaque médecin sous sa part doit avoir, motifs plus dates
   obtenues, exactement le nombre de dates de l'axe. */
const r = a27.ctx.generateGardes(2027, { dryRun: true });
V('le calcul à blanc rend le détail des axes rares', !!r.raresDetail && !!r.raresManque);
['vjf', 'jf'].forEach(axe => {
  const n = (r.raresDetail[axe] || []).length;
  const sous = r.raresManque[axe] || [];
  V(`axe ${axe} : ${n} date(s), ${sous.length} médecin(s) sous leur part`, n > 0);
  const faux = sous.filter(m => {
    const somme = Object.keys(m.motifs).reduce((s, k) => s + m.motifs[k], 0);
    return somme !== n;
  });
  V(`axe ${axe} : les motifs totalisent exactement le nombre de dates`,
    faux.length === 0, faux.map(m => [m.id, m.motifs]));
  V(`axe ${axe} : personne n'est listé alors qu'il est à sa part`,
    sous.every(m => m.reel < m.part), sous.filter(m => m.reel >= m.part));
  V(`axe ${axe} : les manquants sont classés du plus lésé au moins lésé`,
    sous.every((m, i) => i === 0 || (sous[i - 1].reel - sous[i - 1].part) <= (m.reel - m.part)),
    sous.map(m => [m.id, +(m.reel - m.part).toFixed(2)]));
});

console.log('\n═══ 3. Le cumul des années précédentes ═══');
V('le bloc de cumul est présent', rapport.indexOf('CUMUL DES ANNÉES') >= 0);
V('il nomme l\'année lue', (r.anneesLues || []).indexOf(2026) >= 0, r.anneesLues);
const cp = r.cumulPrec || {};
const iEx = stats26[0].indexOf('PART EXACTE SAM'), iRe = stats26[0].indexOf('SAM');
const temoin = stats26.slice(1).find(x => x[0] && x[iEx] !== '' && cp[x[0]]);
V('un médecin témoin a été trouvé', !!temoin, temoin && temoin[0]);
V('son cumul vaut bien réel moins part due',
  temoin && Math.abs(cp[temoin[0]].sam - (Number(temoin[iRe]) - Number(temoin[iEx]))) < 0.001,
  temoin && { attendu: Number(temoin[iRe]) - Number(temoin[iEx]), lu: cp[temoin[0]].sam });

/* Des statistiques d'avant la part exacte : le cumul n'a rien à additionner et
   doit rester muet plutôt que d'afficher des zéros trompeurs. */
const ancien = stats26.map(x => x.slice(0, 25));
const a27b = monte(2027, ancien);
a27b.ctx.essaiGenerationGardes(2027);
const rap2 = String(a27b.logs[a27b.logs.length - 1] || '');
V('sans part exacte en N-1, le bloc de cumul ne s\'affiche pas',
  rap2.indexOf('CUMUL DES ANNÉES') < 0);
V('mais le reste du rapport est bien là', rap2.indexOf('VEILLES DE FÉRIÉ') >= 0);

console.log('\n═══ 4. Le rapport ne modifie rien ═══');
V('aucun onglet de gardes n\'a été créé', !a27.ss.getSheetByName('GARDES_2027'));
V('aucun onglet de statistiques n\'a été créé', !a27.ss.getSheetByName('STATS_GARDES_2027'));
V('la part exacte est rendue à côté de la cible',
  !!r.partExacte && Object.keys(r.partExacte).length > 0);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
