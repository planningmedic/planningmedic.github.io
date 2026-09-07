/* ═══ BANC — EXPORT EXCEL D'UNE SEMAINE À CHEVAL SUR DEUX MOIS ═══
   Défaut trouvé en production le 28/08/2026 : le fichier de la semaine 36
   (lundi 31/08 → dimanche 06/09) sortait mardi et mercredi quasi vides, avec
   des gardes fausses à partir du mardi.

   Cause : l'export choisissait UN SEUL bloc « mois » pour les 7 jours, puis
   lisait chaque jour par son numéro d'ordre dans ce bloc. Pour une semaine à
   cheval, les jours de septembre allaient donc chercher les jours d'août de
   même rang — un décalage de 31 jours. L'écran, lui, lit chaque jour dans SON
   mois : il était juste, le fichier était faux, sans le dire.

   Le scénario joue la vraie page avec deux mois et une semaine à cheval, et
   vérifie que le fichier produit contient bien les données de septembre.
   CONTRE-ÉPREUVE : sur la version d'avant le correctif, les vérifications
   « mardi » échouent (case vide ou garde d'août). */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

// ── Jeu de données : août et septembre 2026 ────────────────────────────────
const MARS = [
  { id: 'ALPHA',  initials: 'AL' },
  { id: 'BRAVO',  initials: 'BR' },
  { id: 'CHARLI', initials: 'CH' },
  { id: 'DELTA',  initials: 'DE' },
];

function moisVide(y, m) {
  const nb = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= nb; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    days.push({
      date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      day: d, weekday: dow, dow,
      isWeekend: dow === 0 || dow === 6, isFerie: false,
    });
  }
  return {
    id: `${y}-${String(m).padStart(2, '0')}`,
    label: `mois ${m} ${y}`, year: y, month: m,
    days,
    doctors: MARS.map(d => ({
      id: d.id, initials: d.initials,
      days: days.map(() => ({ status: '', morning: '', afternoon: '', cs: '' })),
    })),
    weeks: [],
  };
}
const poser = (mois, dateISO, marId, e) => {
  const i = mois.days.findIndex(d => d.date === dateISO);
  const doc = mois.doctors.find(d => d.id === marId);
  Object.assign(doc.days[i], e);
};

const AOUT = moisVide(2026, 8);
const SEPT = moisVide(2026, 9);

// Août : le lundi 31/08 fait bien partie de la semaine testée, il doit rester juste.
poser(AOUT, '2026-08-31', 'ALPHA',  { morning: 'VIS', afternoon: 'VIS' });
poser(AOUT, '2026-08-31', 'BRAVO',  { status: 'G',  morning: 'REA', afternoon: 'REA' });
poser(AOUT, '2026-08-31', 'CHARLI', { status: 'A' });
// Août, début du mois : la donnée « polluante ». Rang 0 et 1 du bloc août,
// c'est-à-dire les rangs qu'occupent mardi 01/09 et mercredi 02/09 en septembre.
poser(AOUT, '2026-08-01', 'DELTA',  { status: 'G',  morning: 'REA', afternoon: 'REA' });
poser(AOUT, '2026-08-02', 'DELTA',  { status: 'G2', morning: 'MAT', afternoon: 'MAT' });

// Septembre : la vérité pour mardi 01/09.
poser(SEPT, '2026-09-01', 'ALPHA',  { morning: 'VIS', afternoon: 'VIS' });
poser(SEPT, '2026-09-01', 'BRAVO',  { status: 'G',  morning: 'REA', afternoon: 'REA' });
poser(SEPT, '2026-09-01', 'CHARLI', { status: 'G2', morning: 'MAT', afternoon: 'MAT' });
poser(SEPT, '2026-09-01', 'DELTA',  { status: 'A' });

const SECTEURS = [
  { code: 'VIS', label: 'Viscéral',  court: 'VIS', aff: 'Viscéral',  icon: '', bg: null, fg: null, cs: 'CS-VIS', actif: true, xlLabel: 'VISCERAL',  xlBg: 'F2F2F2', xlRows: 2, ordre: 1 },
  { code: 'REA', label: 'Réa',       court: 'REA', aff: 'Réa',       icon: '', bg: null, fg: null, cs: null,     actif: true, xlLabel: 'REANIMATION', xlBg: 'F2F2F2', xlRows: 2, ordre: 2 },
  { code: 'MAT', label: 'Maternité', court: 'MAT', aff: 'Maternité', icon: '', bg: null, fg: null, cs: 'CS-MAT', actif: true, xlLabel: 'MATERNITE', xlBg: 'F2F2F2', xlRows: 1, ordre: 3 },
];
const CS = [
  { code: 'CS-VIS',  label: 'CS Viscérale',  xlLabel: ' VISC',  xlBg: 'F2F2F2', ouvrable: true },
  { code: 'CS-MAT',  label: 'CS Maternité',  xlLabel: ' MATER', xlBg: 'F2F2F2', ouvrable: true },
  { code: 'CS-POLY', label: 'CS Polyvalente', xlLabel: ' POLY', xlBg: 'F2F2F2', ouvrable: true },
];

// ── Faux ExcelJS : une grille de cases, rien d'autre ───────────────────────
// `sortie.ws` recevra la feuille produite par l'export.
function fauxExcelJS(sortie) {
  class Workbook {
    constructor() { this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) }; }
    addWorksheet(nom) {
      const cases = new Map();
      const ws = {
        name: nom, views: [], pageSetup: {}, _cases: cases,
        getCell(r, c) {
          const k = r + ':' + c;
          if (!cases.has(k)) cases.set(k, { value: null, font: null, fill: null, alignment: null, border: {} });
          return cases.get(k);
        },
        getRow() { return {}; },
        getColumn() { return {}; },
        mergeCells() {},
      };
      sortie.ws = ws;
      return ws;
    }
  }
  return { Workbook };
}

// Lit une case du fichier produit. `val` rend le texte, '' si vide.
const val = (ws, r, c) => {
  const k = r + ':' + c;
  const cel = ws._cases.get(k);
  const v = cel ? cel.value : '';
  return v === null || v === undefined ? '' : String(v);
};
// Numéro de la ligne portant ce libellé en colonne 1.
function ligneDe(ws, libelle) {
  for (const [k, cel] of ws._cases) {
    const [r, c] = k.split(':').map(Number);
    if (c === 1 && String(cel.value || '').trim() === libelle.trim()) return r;
  }
  return -1;
}
// Colonne de gauche d'un jour (lundi = 0) — même convention que l'export.
const colJour = dow => (dow < 5 ? 2 + dow * 4 : 22 + (dow - 5) * 4);

(async () => {
  console.log('\n\u2550\u2550\u2550 EXPORT EXCEL \u2014 semaine \u00e0 cheval sur deux mois \u2550\u2550\u2550');

  const vc = new VirtualConsole();
  const dom = new JSDOM(fs.readFileSync('../admin.html', 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
  });
  const w = dom.window;
  await dodo(500);

  const sortie = {};
  w.ExcelJS = fauxExcelJS(sortie);
  w.URL.createObjectURL = () => 'blob:faux';
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};

  w.eval(`
    DATA = ${JSON.stringify({ months: [AOUT, SEPT] })};
    marsData = [];
    _localOverrides = {};
    CONFIG_KO = { secteurs:false, cs:false };
    SECTEURS_CFG = ${JSON.stringify(SECTEURS)};
    rebuildSecteursDerivations();
    CS_TYPES = ${JSON.stringify(CS)};
    CS_REQUIRED = {};
    api = async () => ({ staffs: [] });
    toast = () => {};
  `);

  const idx = w.eval("getAllWeeks().findIndex(x => x.lundi === '2026-08-31')");
  V('la semaine du lundi 31/08 existe dans la navigation', idx >= 0, idx);
  w.eval('currentWeekIdx = ' + idx + ';');

  const jours = JSON.parse(w.eval("JSON.stringify(getWeekDays('2026-08-31').map(s => s && s.date))"));
  V('elle couvre bien 31/08 \u2192 06/09',
    jours.join(',') === '2026-08-31,2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05,2026-09-06', jours);

  await w.exportWeekExcel();
  const ws = sortie.ws;
  V('un fichier a bien \u00e9t\u00e9 produit', !!ws);
  if (!ws) { console.log('\n  ' + ok + ' v\u00e9rifications OK, ' + ko + ' en \u00e9chec'); process.exit(1); }

  const rVIS = ligneDe(ws, 'VISCERAL');
  const rREA = ligneDe(ws, 'REANIMATION');
  const rMAT = ligneDe(ws, 'MATERNITE');
  const rGRE = ligneDe(ws, 'GARDE REA');
  const rGAN = ligneDe(ws, 'GARDE ANESTH');
  const rABS = ligneDe(ws, 'ABSENCES');
  const rCSM = ligneDe(ws, 'MATER');
  V('les lignes attendues sont pr\u00e9sentes', [rVIS, rREA, rMAT, rGRE, rGAN, rABS].every(x => x > 0),
    { rVIS, rREA, rMAT, rGRE, rGAN, rABS });

  const LUN = colJour(0), MAR = colJour(1), MER = colJour(2);

  // ── Le lundi (31/08, dans le mois d'ao\u00fbt) doit rester juste ──
  V('lundi : AL au visc\u00e9ral le matin', val(ws, rVIS, LUN) === 'AL', val(ws, rVIS, LUN));
  V('lundi : garde r\u00e9a = BR', val(ws, rGRE, LUN) === 'BR', val(ws, rGRE, LUN));

  // ── Le mardi (01/09, dans le mois de septembre) : le c\u0153ur du d\u00e9faut ──
  V('mardi : AL au visc\u00e9ral le matin (donn\u00e9e de septembre)', val(ws, rVIS, MAR) === 'AL', val(ws, rVIS, MAR));
  V('mardi : AL au visc\u00e9ral l\'apr\u00e8s-midi', val(ws, rVIS, MAR + 2) === 'AL', val(ws, rVIS, MAR + 2));
  V('mardi : garde r\u00e9a = BR (et pas DE, du 1er ao\u00fbt)', val(ws, rGRE, MAR) === 'BR', val(ws, rGRE, MAR));
  V('mardi : garde anesth = CH', val(ws, rGAN, MAR) === 'CH', val(ws, rGAN, MAR));
  V('mardi : DE figure dans les absences', val(ws, rABS, MAR) === 'DE', val(ws, rABS, MAR));
  V('mardi : aucune trace du 1er ao\u00fbt en r\u00e9animation',
    val(ws, rREA, MAR) === 'BR', val(ws, rREA, MAR));
  V('mardi matin : la consult maternit\u00e9 suit le MAR de MAT', rCSM < 0 || val(ws, rCSM, MAR) === 'CH',
    val(ws, rCSM, MAR));

  // ── Le mercredi (02/09) doit \u00eatre vide, pas rempli par le 2 ao\u00fbt ──
  V('mercredi : rien en maternit\u00e9 (le 2 ao\u00fbt ne d\u00e9borde pas)', val(ws, rMAT, MER) === '', val(ws, rMAT, MER));
  V('mercredi : aucune garde r\u00e9a', val(ws, rGRE, MER) === '', val(ws, rGRE, MER));

  console.log('\n  ' + ok + ' v\u00e9rifications OK, ' + ko + ' en \u00e9chec');
  if (ko) process.exit(1);
})();
