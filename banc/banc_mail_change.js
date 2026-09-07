/* ═══ BANC — MAIL « VOTRE PLANNING A CHANGÉ » (28/08/2026) ═══
   Défaut signalé en production : une carte annonçait « 18h » d'un côté et
   « 18h » de l'autre. Le MAR restait en astreinte 18h mais son SECTEUR avait
   changé, et le mail n'affichait jamais le secteur dès qu'un statut existait.

   On teste ici les vraies fonctions de code.gs :
   - _notifDecrire  : le secteur apparaît sous les statuts qui le méritent ;
   - _notifDiff     : une carte qui n'apprend rien n'est plus émise ;
   - _notifLignes   : matin et après-midi séparés quand ils diffèrent ;
   - _notifHtml     : le gabarit tient (balises équilibrées, pas de flex) ;
   - _notifSemaineExcel : la fenêtre d'annonce des secteurs.

   CONTRE-ÉPREUVE : sans le correctif, « 18h → 18h » est émis tel quel et le
   mail ne contient nulle part le mot du secteur. */
const vm = require('vm');
const fs = require('fs');
const { extraireFonction } = require('./stubs');

// stubs.extraireFonction ne sait extraire que des `function`. Les constantes
// de configuration se lisent ici, jusqu'au « ; » de profondeur zéro.
function extraireConst(fichier, nom) {
  const src = fs.readFileSync(fichier, 'utf8');
  const i = src.indexOf('const ' + nom + ' ');
  if (i < 0) throw new Error(nom + ' introuvable dans ' + fichier);
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{' || ch === '[') prof++;
    else if (ch === '}' || ch === ']') prof--;
    else if (ch === ';' && prof === 0) return src.slice(i, j + 1);
  }
  throw new Error('fin de ' + nom + ' introuvable');
}
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

const F = '../gas/code.gs';
const ctx = vm.createContext({ console, JSON, String, Array, Object, Number, Date, Math,
  logAction: () => {},
  // Configuration du classeur, servie depuis le cache dans la vraie vie.
  getSecteurs: () => ([
    { code: 'VIS', label: 'Bloc viscéral' },
    { code: 'REA', label: 'Réanimation' },
    { code: 'RI',  label: 'Radio interventionnelle' },
    { code: 'CI',  label: 'Cardio interventionnelle' },
  ]),
  getCsTemplate: () => ({ types: [{ code: 'CS-VIS', label: 'Consultation viscérale' }] }),
});
[
  'NOTIF_STATUTS', 'NOTIF_STATUT_AVEC_SECTEUR', 'NOTIF_JOURS', 'NOTIF_MOIS', 'NOTIF_SITE',
].forEach(nom => vm.runInContext(extraireConst(F, nom), ctx));
[
  '_notifSecteurTxt', '_notifDecrire', '_notifLignes', '_notifLibelles', '_notifDatePieces',
  '_notifJourMois', '_notifDateCourte', '_notifDiff', '_notifSemaineExcel', '_notifISO', '_notifHtml',
].forEach(nom => vm.runInContext(extraireFonction(F, nom), ctx));

const appel = (expr) => vm.runInContext(expr, ctx);
const LIB = 'LIB';
vm.runInContext('var LIB = _notifLibelles();', ctx);

console.log('\n═══ M1. Le secteur sous un statut ═══');
{
  const d = c => appel(`_notifDecrire(${JSON.stringify(c)}, LIB)`);
  V('18h volant → « 18h — volant »', d(['18', 'VOLANT', 'VOLANT']) === '18h — volant', d(['18', 'VOLANT', 'VOLANT']));
  V('18h en réa → « 18h — Réanimation »', d(['18', 'REA', 'REA']) === '18h — Réanimation', d(['18', 'REA', 'REA']));
  V('18h matin/après-midi différents', d(['18', 'REA', 'VIS']) === '18h — Réanimation le matin, Bloc viscéral l\'après-midi', d(['18', 'REA', 'VIS']));
  V('une garde ne répète pas son secteur', d(['G', 'REA', 'REA']) === 'garde réanimation', d(['G', 'REA', 'REA']));
  V('des vacances restent des vacances', d(['V', '', '']) === 'vacances', d(['V', '', '']));
  V('un code secteur inconnu reste brut', d(['', 'XYZ', 'XYZ']) === 'XYZ', d(['', 'XYZ', 'XYZ']));
  V('une consultation est traduite', d(['', 'CS-VIS', 'CS-VIS']) === 'Consultation viscérale', d(['', 'CS-VIS', 'CS-VIS']));
  V('rien du tout reste « rien »', d(['', '', '']) === 'rien');
}

console.log('\n═══ M2. Le diff n\'émet plus de carte vide ═══');
{
  const diff = (a, b) => appel(`_notifDiff(${JSON.stringify(a)},${JSON.stringify(b)})`);
  const jour = '2026-09-03';

  const r1 = diff({ X: { [jour]: '18|VOLANT|VOLANT' } }, { X: { [jour]: '18|REA|REA' } });
  V('18h volant → 18h réa : la carte est émise', (r1.X || []).length === 1, r1);
  V('elle dit ce qui a changé', r1.X && r1.X[0].avant !== r1.X[0].apres, r1.X && r1.X[0]);
  V('et ce n\'est pas signalé comme un changement de statut', r1.X && r1.X[0].statut === false);

  const r2 = diff({ X: { [jour]: 'V||' } }, { X: { [jour]: 'VAC||' } });
  V('V → VAC (même libellé, même secteur) : aucune carte', !r2.X, r2);

  const r3 = diff({ X: { [jour]: 'TP||' } }, { X: { [jour]: 'CTP||' } });
  V('TP → CTP : aucune carte non plus', !r3.X, r3);

  const r4 = diff({ X: { [jour]: '|VOLANT|VOLANT' } }, { X: { [jour]: '|VIS|CS-VIS' } });
  V('volant → placé : carte émise', (r4.X || []).length === 1, r4);
  V('les codes bruts sont conservés pour l\'affichage',
    r4.X && r4.X[0].codesApres && r4.X[0].codesApres[1] === 'VIS', r4.X && r4.X[0]);

  const r5 = diff({ X: { [jour]: '|VIS|VIS' } }, { X: { [jour]: 'V||' } });
  V('placé → vacances : signalé comme changement de statut', r5.X && r5.X[0].statut === true, r5.X);
}

console.log('\n═══ M3. Matin et après-midi séparés ═══');
{
  const l = c => appel(`JSON.stringify(_notifLignes(${JSON.stringify(c)}, LIB))`);
  const a = JSON.parse(l(['', 'VIS', 'CS-VIS']));
  V('deux demi-journées différentes → deux lignes', a.length === 2, a);
  V('la première est le matin', a[0].label === 'Matin' && a[0].valeur === 'Bloc viscéral', a[0]);
  V('la seconde l\'après-midi', a[1].label === 'Après-midi' && a[1].valeur === 'Consultation viscérale', a[1]);
  const b = JSON.parse(l(['', 'REA', 'REA']));
  V('deux demi-journées identiques → une ligne « Journée »', b.length === 1 && b[0].label === 'Journée', b);
  const c = JSON.parse(l(['18', 'REA', 'REA']));
  V('un statut → une ligne, secteur compris', c.length === 1 && c[0].valeur === '18h — Réanimation', c);
  const e = JSON.parse(l(['', 'VIS', '']));
  V('une demi-journée vide s\'affiche « — »', e.length === 2 && e[1].valeur === '—', e);
}

console.log('\n═══ M4. Le gabarit du mail ═══');
{
  const chgs = [
    { date: '2026-09-01', statut: false, codesAvant: ['', 'VOLANT', 'VOLANT'], codesApres: ['', 'VIS', 'CS-VIS'] },
    { date: '2026-09-03', statut: false, codesAvant: ['18', 'VOLANT', 'VOLANT'], codesApres: ['18', 'REA', 'REA'] },
    { date: '2026-09-05', statut: true,  codesAvant: ['', '', ''], codesApres: ['G', 'REA', 'REA'] },
  ];
  const html = appel(`_notifHtml('DR EXEMPLE', ${JSON.stringify(chgs)}, 2026, LIB)`);
  const cpt = (t) => (html.match(new RegExp('<' + t + '[ >]', 'g')) || []).length;
  const fin = (t) => (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
  V('balises <table> équilibrées', cpt('table') === fin('table'), [cpt('table'), fin('table')]);
  V('balises <tr> équilibrées', cpt('tr') === fin('tr'), [cpt('tr'), fin('tr')]);
  V('balises <td> équilibrées', cpt('td') === fin('td'), [cpt('td'), fin('td')]);
  V('balises <div> équilibrées', cpt('div') === fin('div'), [cpt('div'), fin('div')]);
  V('aucun flex ni grid (illisible dans Outlook)', !/display\s*:\s*(flex|grid)/.test(html));
  V('aucune feuille de style externe', !/<style|<link/i.test(html));
  V('le secteur du jeudi apparaît enfin', html.indexOf('18h — Réanimation') >= 0);
  V('et son ancien secteur aussi', html.indexOf('18h — volant') >= 0);
  V('les codes sont écrits en clair', html.indexOf('Bloc viscéral') >= 0 && html.indexOf('Consultation viscérale') >= 0);
  V('le résumé annonce le nombre et la période', html.indexOf('3 journées') >= 0 && html.indexOf('1er septembre') >= 0, html.indexOf('3 journées'));
  V('le samedi porte la mention Week-end', html.indexOf('Week-end') >= 0);
  V('le lien vers le planning est présent', html.indexOf(appel('NOTIF_SITE')) >= 0);

  const un = appel(`_notifHtml('DR EXEMPLE', ${JSON.stringify([chgs[1]])}, 2026, LIB)`);
  V('avec un seul changement, le résumé est au singulier',
    un.indexOf('une journée a été modifiée') >= 0 && un.indexOf('journées') < 0, un.indexOf('une journée'));
}

console.log('\n═══ M5. La fenêtre d\'annonce des secteurs ═══');
{
  const f = (iso) => JSON.parse(appel(`JSON.stringify(_notifSemaineExcel(new Date('${iso}')))`));
  const v = f('2026-08-28T16:27:00');
  V('vendredi 16h27 : la fenêtre s\'ouvre le jour même', v.debut === '2026-08-28', v);
  V('et court jusqu\'au dimanche +9', v.fin === '2026-09-06', v);
  const av = f('2026-08-28T15:30:00');
  V('le même vendredi à 15h30 : fenêtre de la semaine précédente', av.debut === '2026-08-21' && av.fin === '2026-08-30', av);
  const lu = f('2026-08-31T09:00:00');
  V('le lundi suivant : toujours la fenêtre du vendredi 28', lu.debut === '2026-08-28' && lu.fin === '2026-09-06', lu);
}

console.log('\n  ' + ok + ' vérifications OK, ' + ko + ' en échec');
if (ko) process.exit(1);
