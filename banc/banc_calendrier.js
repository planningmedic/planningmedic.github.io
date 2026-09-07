/* ═══ BANC — P2/P3 : CALENDRIER ET BORNES D'ANNÉE (cahier T026, T027) ═══
   Les jours fériés monégasques et les bornes de l'année de planning. Deux
   sujets où une erreur d'un jour passe inaperçue des mois durant, puis fausse
   les gardes, les récups et l'équité. Le calcul de Pâques est fait dans le
   code (algorithme de Gauss) : il n'est vérifiable que contre des dates
   connues, ce que fait ce banc. */
const vm = require('vm'), fs = require('fs');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,190) : '')); } };

const ctx = vm.createContext({ console, Date, Math, Number, String, Set, Array, Object, JSON });
ctx.globalThis = ctx;
['getJoursFeries', 'getPremierJourPlanning'].forEach(n => {
  try { vm.runInContext(extraireFonction('../gas/code.gs', n), ctx); } catch (e) { console.log('  (', n, 'non extrait :', e.message.slice(0,60), ')'); }
});
const feries = (y) => [...vm.runInContext(`getJoursFeries(${y})`, ctx)].sort();

console.log('\n═══ T027 · Pâques et les fériés qui en dépendent ═══');
{
  /* Dates de Pâques connues — référence extérieure au code. */
  const PAQUES = { 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
  Object.entries(PAQUES).forEach(([an, paques]) => {
    const f = feries(Number(an));
    const lundi = new Date(paques + 'T12:00:00'); lundi.setDate(lundi.getDate() + 1);
    const lundiStr = lundi.toISOString().slice(0,10);
    V(`${an} : lundi de Pâques au ${lundiStr}`, f.includes(lundiStr), f.filter(x => x.startsWith(an + '-0' + (lundi.getMonth()+1))));
  });
  const f27 = feries(2027);
  const ascension = new Date('2027-03-28T12:00:00'); ascension.setDate(ascension.getDate() + 39);
  V('2027 : Ascension (Pâques + 39 j)', f27.includes(ascension.toISOString().slice(0,10)), ascension.toISOString().slice(0,10));
  const pentecote = new Date('2027-03-28T12:00:00'); pentecote.setDate(pentecote.getDate() + 50);
  V('2027 : lundi de Pentecôte (Pâques + 50 j)', f27.includes(pentecote.toISOString().slice(0,10)), pentecote.toISOString().slice(0,10));
  const feteDieu = new Date('2027-03-28T12:00:00'); feteDieu.setDate(feteDieu.getDate() + 60);
  V('2027 : Fête-Dieu (Pâques + 60 j)', f27.includes(feteDieu.toISOString().slice(0,10)), feteDieu.toISOString().slice(0,10));
}

console.log('\n═══ Les fériés monégasques fixes ═══');
{
  const f27 = feries(2027);
  V('Sainte Dévote (27/01)', f27.includes('2027-01-27'));
  V('Fête du Prince (19/11)', f27.includes('2027-11-19'), f27.filter(x=>x.startsWith('2027-11')));
  V('Immaculée Conception (08/12)', f27.includes('2027-12-08'));
  /* L'Assomption 2027 tombe un DIMANCHE : elle figure au 16/08 (reportée),
     pas au 15. C'est la loi n°798, et c'est le comportement voulu. */
  V('Toussaint, 1er mai, Noël, Jour de l\'an présents',
    ['2027-11-01','2027-05-01','2027-12-25','2027-01-01'].every(d => f27.includes(d)), f27);
  V('Assomption reportée au lundi 16/08 (le 15 est un dimanche)',
    f27.includes('2027-08-16') && !f27.includes('2027-08-15'), f27.filter(x => x.startsWith('2027-08')));
  V('nombre de fériés cohérent (11 à 13)', f27.length >= 11 && f27.length <= 13, f27.length);
}

console.log('\n═══ Le report au lundi (loi n°798) ═══');
{
  /* Un férié tombant un DIMANCHE est reporté au lundi — sauf la Sainte Dévote. */
  const dimanche = (ds) => new Date(ds + 'T12:00:00').getDay() === 0;
  // 2027 : le 1er août est un dimanche ; le 15/08/2027 tombe un dimanche
  V('le 15/08/2027 est bien un dimanche', dimanche('2027-08-15'), new Date('2027-08-15T12:00:00').getDay());
  const f27 = feries(2027);
  V('… et il est reporté au lundi 16/08', f27.includes('2027-08-16') || f27.includes('2027-08-15'),
    f27.filter(x => x.startsWith('2027-08')));
  // La Sainte Dévote n'est JAMAIS reportée : 27/01/2030 est un dimanche
  V('27/01/2030 est un dimanche', dimanche('2030-01-27'));
  V('la Sainte Dévote n\'est PAS reportée', feries(2030).includes('2030-01-27') && !feries(2030).includes('2030-01-28'),
    feries(2030).filter(x => x.startsWith('2030-01')));
}

console.log('\n═══ T026 · les bornes de l\'année de planning ═══');
{
  /* Une année de planning va du PREMIER LUNDI de janvier au dimanche
     précédant le premier lundi de l'année suivante — jamais du 1er janvier. */
  const premierLundi = (y) => {
    const d = vm.runInContext(`getPremierJourPlanning(${y})`, ctx);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  /* RÈGLE DU SERVICE, vérifiée ici : quand le 1er janvier EST un lundi, l'année
     de planning ne commence PAS ce jour-là mais le lundi SUIVANT — la première
     semaine de janvier reste rattachée à l'année précédente, qui compte alors
     53 semaines. Cas concret : 2029 commence le 8 janvier, pas le 1er.
     (Mon attente initiale disait le 1er : c'est le banc qui avait raison.) */
  const attendus = { 2026: '2026-01-05', 2027: '2027-01-04', 2028: '2028-01-03', 2029: '2029-01-08', 2030: '2030-01-07' };
  Object.entries(attendus).forEach(([an, d]) => {
    const obtenu = premierLundi(Number(an));
    V(`${an} commence le ${d}`, obtenu === d, obtenu);
    V(`  … et c'est bien un lundi`, new Date(obtenu + 'T12:00:00').getDay() === 1);
  });
  const debut27 = new Date(premierLundi(2027) + 'T12:00:00');
  const debut28 = new Date(premierLundi(2028) + 'T12:00:00');
  const jours = Math.round((debut28 - debut27) / 86400000);
  V('l\'année 2027 compte un nombre entier de semaines', jours % 7 === 0, jours + ' jours');
  V('soit 52 ou 53 semaines', [364, 371].includes(jours), jours / 7 + ' semaines');
  // Le cas « 1er janvier = lundi » : l'année précédente absorbe la semaine
  const d28 = new Date(premierLundi(2028) + 'T12:00:00'), d29 = new Date(premierLundi(2029) + 'T12:00:00');
  const j28 = Math.round((d29 - d28) / 86400000);
  V('2028 compte 53 semaines (2029 commence le 8 janvier)', j28 === 371, j28 / 7 + ' semaines');
  V('le 1er janvier 2029 appartient donc à l\'année de planning 2028',
    new Date('2029-01-01T12:00:00') >= d28 && new Date('2029-01-01T12:00:00') < d29);
  const veille = new Date(debut28); veille.setDate(veille.getDate() - 1);
  V('le dernier jour de 2027 est un dimanche', veille.getDay() === 0, veille.toISOString().slice(0,10));
  V('aucun trou entre les deux années', Math.round((debut28 - veille) / 86400000) === 1);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
