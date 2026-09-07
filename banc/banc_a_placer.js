/* ═══ BANC — BADGE « À PLACER » ET DATES D'ARRIVÉE / DÉPART ═══
   Défaut signalé en production le 28/08/2026 : LC était réclamée « 1 à placer »
   dès le 1er septembre alors qu'elle ne prend ses fonctions que fin septembre.

   Cause : côté GAS, un MAR est exclu du bloc « mois » seulement si sa période
   d'activité ne recouvre AUCUN jour du mois. Un arrivant du 28/09 figure donc
   dans tout le bloc de septembre, avec statut et secteur vides du 1er au 27 —
   c'est-à-dire exactement la signature d'un « présent non placé ». Le reste de
   l'application (bande de présence, annuaire de l'Excel, comité) passe déjà par
   statActive() ; nonPlacesJour() était le seul endroit qui l'ignorait.

   CONTRE-ÉPREUVE : sans le correctif, LC est réclamée le 02/09. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

// ── Septembre 2026 : un arrivant tardif, un partant, un absent, un vrai trou ──
const MARS = [
  { id: 'LATE',  initials: 'LC' },  // arrive le 28/09
  { id: 'GONE',  initials: 'PA' },  // part le 10/09
  { id: 'TROU',  initials: 'TR' },  // présent, non placé : doit être réclamé
  { id: 'ABSNT', initials: 'AB' },  // en congé : ne doit jamais être réclamé
  { id: 'PLACE', initials: 'PL' },  // placé au bloc : rien à signaler
];

function septembre() {
  const days = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(Date.UTC(2026, 8, d));
    const dow = dt.getUTCDay();
    days.push({ date: `2026-09-${String(d).padStart(2, '0')}`, day: d, weekday: dow, dow,
      isWeekend: dow === 0 || dow === 6, isFerie: false });
  }
  return {
    id: '2026-09', label: 'septembre 2026', year: 2026, month: 9, days, weeks: [],
    doctors: MARS.map(m => ({
      id: m.id, initials: m.initials,
      days: days.map(() => ({ status: '', morning: '', afternoon: '', cs: '' })),
    })),
  };
}
const SEPT = septembre();
const poser = (dateISO, marId, e) => {
  const i = SEPT.days.findIndex(d => d.date === dateISO);
  Object.assign(SEPT.doctors.find(d => d.id === marId).days[i], e);
};
['2026-09-02', '2026-09-15', '2026-09-29'].forEach(d => {
  poser(d, 'ABSNT', { status: 'A' });
  poser(d, 'PLACE', { morning: 'VIS', afternoon: 'VIS' });
});

// MEDECINS tel que le frontend le reçoit (getMedecins).
const MEDECINS = [
  { id: 'LATE',  initiales: 'LC', nom: 'DR LATE',  actif: true, dateDebut: '2026-09-28' },
  { id: 'GONE',  initiales: 'PA', nom: 'DR GONE',  actif: true, dateFin:   '2026-09-10' },
  { id: 'TROU',  initiales: 'TR', nom: 'DR TROU',  actif: true },
  { id: 'ABSNT', initiales: 'AB', nom: 'DR ABSNT', actif: true },
  { id: 'PLACE', initiales: 'PL', nom: 'DR PLACE', actif: true },
];

(async () => {
  console.log('\n═══ BADGE « À PLACER » — arrivées et départs ═══');

  const dom = new JSDOM(fs.readFileSync('../admin.html', 'utf8'), {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
  });
  const w = dom.window;
  await dodo(500);

  const charger = meds => w.eval(`
    DATA = ${JSON.stringify({ months: [SEPT] })};
    marsData = ${JSON.stringify(meds)};
    _localOverrides = {};
    window.AFFM = {};
  `);
  const reclames = (date, half) =>
    JSON.parse(w.eval(`JSON.stringify(nonPlacesJour('${date}').${half}.map(x => x.init))`)).sort();

  charger(MEDECINS);

  // ── Le 2 septembre : LC n'est pas encore là ──
  V('02/09 matin : le vrai trou est réclamé', reclames('2026-09-02', 'am').includes('TR'), reclames('2026-09-02', 'am'));
  V('02/09 matin : LC n\'est PAS réclamée (arrivée le 28/09)', !reclames('2026-09-02', 'am').includes('LC'), reclames('2026-09-02', 'am'));
  V('02/09 après-midi : LC n\'est PAS réclamée', !reclames('2026-09-02', 'pm').includes('LC'), reclames('2026-09-02', 'pm'));
  V('02/09 : le MAR en congé n\'est pas réclamé', !reclames('2026-09-02', 'am').includes('AB'));
  V('02/09 : le MAR placé au bloc n\'est pas réclamé', !reclames('2026-09-02', 'am').includes('PL'));
  V('02/09 : le partant du 10/09 est encore réclamé', reclames('2026-09-02', 'am').includes('PA'), reclames('2026-09-02', 'am'));

  // ── Le 15 septembre : le partant est parti, LC toujours pas là ──
  V('15/09 : le partant n\'est plus réclamé', !reclames('2026-09-15', 'am').includes('PA'), reclames('2026-09-15', 'am'));
  V('15/09 : LC toujours pas réclamée', !reclames('2026-09-15', 'am').includes('LC'), reclames('2026-09-15', 'am'));

  // ── Le 29 septembre : LC a pris ses fonctions, elle DOIT être réclamée ──
  V('29/09 : LC est réclamée (elle est arrivée)', reclames('2026-09-29', 'am').includes('LC'), reclames('2026-09-29', 'am'));
  V('29/09 après-midi : LC est réclamée', reclames('2026-09-29', 'pm').includes('LC'), reclames('2026-09-29', 'pm'));

  // ── Prudence : tant que la fiche MEDECINS n'est pas arrivée, on n'exclut personne ──
  charger([]);
  V('MEDECINS pas encore chargé : personne n\'est retiré à tort', reclames('2026-09-02', 'am').includes('LC'), reclames('2026-09-02', 'am'));

  charger(MEDECINS);
  console.log('\n  ' + ok + ' vérifications OK, ' + ko + ' en échec');
  if (ko) process.exit(1);
})();
