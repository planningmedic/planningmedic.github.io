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
// Week-end : samedi les deux gardes, dimanche la seule garde anesth (réa vacante).
poser(SEPT, '2026-09-05', 'ALPHA',  { status: 'G',  morning: 'REA', afternoon: 'REA' });
poser(SEPT, '2026-09-05', 'BRAVO',  { status: 'G2', morning: 'MAT', afternoon: 'MAT' });
poser(SEPT, '2026-09-06', 'CHARLI', { status: 'G2', morning: 'MAT', afternoon: 'MAT' });

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
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true, beforeParse(win) { win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8')); }   /* (14/09/2026) le socle, comme le vrai site */,
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

  /* ── Week-end : garde réa et garde anesth séparées (17/11/2026) ──
     Défaut vu sur le planning papier de la semaine 47 : l'export mettait les
     deux gardes du week-end dans une seule case « X / Y », sans dire qui
     tenait la réa. CONTRE-ÉPREUVE : sur l'ancienne version, la case réa du
     samedi vaut « AL / BR » et les en-têtes « GARDE ». */
  {
    const SAM = colJour(5), DIM = colJour(6);
    V('samedi : en-tête « GARDE réa » puis « GARDE anesth »',
      val(ws, 6, SAM) === 'GARDE réa' && val(ws, 6, SAM + 2) === 'GARDE anesth', [val(ws, 6, SAM), val(ws, 6, SAM + 2)]);
    V('samedi : réa = AL seul', val(ws, 7, SAM) === 'AL', val(ws, 7, SAM));
    V('samedi : anesth = BR seul', val(ws, 7, SAM + 2) === 'BR', val(ws, 7, SAM + 2));
    V('dimanche : réa vacante affichée « — »', val(ws, 7, DIM) === '—', val(ws, 7, DIM));
    V('dimanche : anesth = CH', val(ws, 7, DIM + 2) === 'CH', val(ws, 7, DIM + 2));
    V('semaine : les en-têtes M / AM restent intacts', val(ws, 6, LUN) === 'M' && val(ws, 6, LUN + 2) === 'AM',
      [val(ws, 6, LUN), val(ws, 6, LUN + 2)]);
  }

  /* ── Aucun numero interne dans le depot public (11/09/2026) ──
     Consigne du DPO. Une table de secours de 23 DECT et quatre numeros de
     service etaient ecrits dans admin.html, donc publies. Ce scenario garde
     la porte : le DECT ne peut venir que du classeur. */
  {
    const src = fs.readFileSync('../admin.html', 'utf8');
    const numeros = (src.match(/['"]\b8\d{4}\b['"]/g) || []);
    V('aucun numero interne ecrit dans la page', numeros.length === 0, numeros.slice(0, 4));
    V('plus de table de secours des DECT', !/DECTFB/.test(src));
    V('plus de liste de numeros de service', !/const FIXED\s*=/.test(src));
    V('le DECT vient du classeur, et de nulle part ailleurs',
      /const dect\s*=\s*m\.dect\s*\|\|\s*''/.test(src));
  }

  /* ── (19/11/2026) Pédiatrie optionnelle, interne de réa, infos du jour, sorties séparées ──
     Demande du responsable (planning papier S47) : la ligne PEDIATRIE n'existe que la
     semaine où elle sert ; l'interne apparaît en réanimation ; les infos du jour
     remplissent INFORMATIONS ; les sorties de garde sont séparées réa / anesth.
     CONTRE-ÉPREUVE : sur la version d'avant, PEDIATRIE est écrite vide chaque semaine,
     INT et l'info manquent, et il n'existe qu'une ligne « SORTIES DE GARDE ». */
  {
    console.log('\n═══ Pédiatrie optionnelle, interne, infos, sorties séparées ═══');
    w.eval(`
      SECTEURS_CFG = SECTEURS_CFG.concat([{ code:'PED', label:'Pédiatrie', court:'PED', aff:null, icon:'', bg:'#EEF8E6', fg:'#3B7D0E', cs:null, actif:true, xlLabel:'PEDIATRIE', xlBg:'92D050', xlRows:1, ordre:4, optionnel:true }]);
      rebuildSecteursDerivations();
      CS_TYPES = CS_TYPES.concat([{ code:'CS-PED', label:'CS Pédiatrie', xlLabel:' CS PEDIA', xlBg:'92D050', ouvrable:true, optionnel:true }]);
      window._PLAN_NOTES = { '2026-09-01': { int: ['am'], info: 'ortho 2 salles' } };
    `);
    await w.exportWeekExcel();
    const ws2 = sortie.ws;
    V('semaine sans pédiatrie : aucune ligne PEDIATRIE', ligneDe(ws2, 'PEDIATRIE') < 0);
    V('…ni de ligne CS Pédiatrie', ligneDe(ws2, 'CS PEDIA') < 0);
    const rR2 = ligneDe(ws2, 'REANIMATION');
    V('interne : INT en réanimation le mardi matin', [val(ws2, rR2, MAR), val(ws2, rR2, MAR + 1)].includes('INT'), [val(ws2, rR2, MAR), val(ws2, rR2, MAR + 1)]);
    V('…et pas l\'après-midi', ![val(ws2, rR2, MAR + 2), val(ws2, rR2, MAR + 3)].includes('INT'));
    V('infos du mardi dans la case INFORMATIONS', val(ws2, ligneDe(ws2, 'INFORMATIONS'), MAR) === 'ortho 2 salles', val(ws2, ligneDe(ws2, 'INFORMATIONS'), MAR));
    V('plus de ligne unique « SORTIES DE GARDE »', ligneDe(ws2, 'SORTIES DE GARDE') < 0);

    w.eval(`(function () {
      const s = DATA.months[1], k = dt => s.days.findIndex(d => d.date === dt), doc = id => s.doctors.find(d => d.id === id);
      doc('BRAVO').days[k('2026-09-02')].status = 'RG';    // garde réa le 01/09
      doc('CHARLI').days[k('2026-09-02')].status = 'RG';   // garde anesth le 01/09
      doc('ALPHA').days[k('2026-09-01')].morning = 'VIS+PED';
    })()`);
    await w.exportWeekExcel();
    const ws3 = sortie.ws;
    const rP = ligneDe(ws3, 'PEDIATRIE');
    V('pédiatrie utilisée : la ligne PEDIATRIE est écrite', rP > 0);
    V('…avec AL le mardi matin', rP > 0 && val(ws3, rP, MAR) === 'AL', rP > 0 && val(ws3, rP, MAR));
    V('sortie de garde réa du mercredi = BR', val(ws3, ligneDe(ws3, 'SORTIE GARDE REA'), MER) === 'BR', val(ws3, ligneDe(ws3, 'SORTIE GARDE REA'), MER));
    V('sortie de garde anesth du mercredi = CH', val(ws3, ligneDe(ws3, 'SORTIE GARDE ANESTH'), MER) === 'CH', val(ws3, ligneDe(ws3, 'SORTIE GARDE ANESTH'), MER));
    V('CS Pédiatrie toujours absente (personne, pas ouverte)', ligneDe(ws3, 'CS PEDIA') < 0);
  }

  /* ── (20/11/2026) Consultation tenue par le secteur, sans nom ──
     Demande du responsable : comme sur l'Excel papier (« VISC », « ORTH »), une consultation
     peut porter le nom du secteur au lieu d'un MAR. CONTRE-ÉPREUVE : sans la lecture des
     notes CSS, la ligne CS Pédiatrie reste absente et la case vide. */
  {
    console.log('\n═══ Consultation au nom du secteur ═══');
    w.eval(`window._PLAN_NOTES = { '2026-09-01': { css: { am: [], pm: ['CS-PED'] } } };`);
    await w.exportWeekExcel();
    const ws4 = sortie.ws;
    const rC = ligneDe(ws4, 'CS PEDIA');
    V('la consultation au nom du secteur fait apparaître sa ligne optionnelle', rC > 0);
    V('…avec « PÉDIATRIE » le mardi après-midi, sans nom de MAR', rC > 0 && [val(ws4, rC, MAR + 2), val(ws4, rC, MAR + 3)].includes('PÉDIATRIE'), rC > 0 && [val(ws4, rC, MAR + 2), val(ws4, rC, MAR + 3)]);
    V('…et rien le matin', rC > 0 && ![val(ws4, rC, MAR), val(ws4, rC, MAR + 1)].includes('PÉDIATRIE'));
    w.eval(`window._PLAN_NOTES = {};`);
  }

  console.log('\n  ' + ok + ' v\u00e9rifications OK, ' + ko + ' en \u00e9chec');
  if (ko) process.exit(1);
})();
