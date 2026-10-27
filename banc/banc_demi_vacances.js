/* ═══ BANC — DEMI-JOURNÉES DE VACANCES VM / VA (27/10/2026) ═══════════════
   POURQUOI CE SCÉNARIO EXISTE.
   La note de la DRH du 26/10/2026 donne une demi-journée de récupération de
   férié. Elle ne se connaît pas au staff vacances : le responsable la pose À LA
   MAIN dans le classeur — INDISPOS_{Y} avant la génération, GARDES_{Y} après —
   avec deux codes : VM (vacances le matin), VA (vacances l'après-midi).

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Aucun écran ne l'efface : ni l'enregistrement d'un MAR, ni celui du staff
      (_fusionIndispos_). Contre-épreuve : sans la protection, le MAR l'effaçait.
   2. Le générateur ne met AUCUNE garde ce jour-là NI la veille (le repos de
      garde tomberait sur la demi-journée), ni de 18 h, et recopie VM/VA tels
      quels dans GARDES. Contre-épreuve sur le générateur d'avant.
   3. Le planning du jour : absent sur la seule demi-journée (case 'V'), présent
      dans son secteur l'autre demi-journée.
   4. La paie : VM/VA affichés, 0,5 dans le total des vacances, un geste Chronos
      qui dit « demi-journée ».
   5. Les compteurs (reliquat, staff, écran MAR) comptent 0,5.

   Effectif synthétique uniquement (simulateur/, monde.js) : aucun nom réel.
   Le vrai code du dépôt est exécuté, jamais recopié. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { extraireFonction } = require('./stubs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
function extraireConst(src, nom) {
  const i = src.indexOf('const ' + nom + ' ');
  if (i < 0) throw new Error(nom + ' introuvable');
  return src.slice(i, src.indexOf(';', i) + 1);
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const veille = ds => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() - 1); return iso(d); };

/* ═══ 1. Aucun enregistrement d'écran n'efface une demi-journée ═══════════ */
console.log('\n═══ 1. _fusionIndispos_ : VM/VA intouchables depuis un écran ═══');
{
  const IND = lire('gas/Indispos.gs'), MET = lire('gas/indisponibilites.gs');
  const monter = (demi) => {
    const ctx = vm.createContext({ Set, String, Object });
    vm.runInContext(extraireConst(IND, 'CODES_COMITE'), ctx);
    vm.runInContext(demi === undefined ? extraireConst(IND, 'CODES_DEMI_VAC') : demi, ctx);
    vm.runInContext(extraireFonction(path.join(RACINE, 'gas/indisponibilites.gs'), '_fusionIndispos_'), ctx);
    return (ex, env, comite) => vm.runInContext('_fusionIndispos_', ctx)(ex, env, comite);
  };
  const fusion = monter();
  // Le MAR enregistre ses indispos : sa page n'envoie pas la VM qu'elle n'a pas posée.
  let r = fusion({ '2027-03-10': 'VM', '2027-03-12': 'INDISPO' }, { '2027-03-12': 'INDISPO', '2027-03-15': 'SOUHAIT' }, false);
  V('MAR : la VM posée à la main survit à son enregistrement', r['2027-03-10'] === 'VM', r);
  V('MAR : ses propres cases sont bien posées', r['2027-03-12'] === 'INDISPO' && r['2027-03-15'] === 'SOUHAIT', r);
  r = fusion({ '2027-03-10': 'VM' }, { '2027-03-10': 'INDISPO' }, false);
  V('MAR : une indispo envoyée SUR la VM ne la remplace pas', r['2027-03-10'] === 'VM', r);
  r = fusion({}, { '2027-04-01': 'VA' }, false);
  V('MAR : un VA envoyé depuis un écran n\'est pas posé', !r['2027-04-01'], r);
  // Le staff (comité) remplace INTÉGRALEMENT ses VAC/FORM : la VA doit rester.
  r = fusion({ '2027-05-04': 'VA', '2027-05-10': 'VAC' }, { '2027-05-11': 'VAC' }, true);
  V('staff : la VA survit à « Valider et verrouiller »', r['2027-05-04'] === 'VA', r);
  V('staff : ses VAC sont bien remplacées (retrait du 10, ajout du 11)', !r['2027-05-10'] && r['2027-05-11'] === 'VAC', r);
  r = fusion({ '2027-05-04': 'VA' }, { '2027-05-04': 'VAC' }, true);
  V('staff : une VAC posée sur la VA ne l\'écrase pas', r['2027-05-04'] === 'VA', r);
  // Contre-épreuve : sans la protection, le code ne connaît pas VM → il appartient
  // au MAR, qui l'efface en enregistrant sans elle.
  const sans = monter('const CODES_DEMI_VAC = new Set([]);');
  r = sans({ '2027-03-10': 'VM' }, { '2027-03-12': 'INDISPO' }, false);
  V('CONTRE-ÉPREUVE : sans la protection, le MAR effaçait la VM', !r['2027-03-10'], r);
  V('le code est défini une fois, dans Indispos.gs', /const CODES_DEMI_VAC = new Set\(\['VM', 'VA'\]\);/.test(IND));
  V('…et utilisé par la fusion', /CODES_DEMI_VAC\.has/.test(MET));
}

/* ═══ 2. Le générateur ══════════════════════════════════════════════════ */
console.log('\n═══ 2. Générateur : pas de garde le jour ni la veille, VM/VA recopiés ═══');
const YEAR = 2027, MAR = 'GARNIER';
/* Douze demi-journées en semaine, espacées : assez pour qu'un générateur qui
   les ignore place forcément une garde sur l'un de ces jours ou leur veille. */
const DEMIS = { '2027-01-19': 'VM', '2027-02-09': 'VA', '2027-03-03': 'VM', '2027-03-23': 'VA',
  '2027-04-13': 'VM', '2027-05-04': 'VA', '2027-06-15': 'VM', '2027-07-06': 'VA',
  '2027-09-14': 'VM', '2027-10-05': 'VA', '2027-11-09': 'VM', '2027-11-30': 'VA' };
function generer(src) {
  const roster = H.defaultRoster();
  const map = { [MAR]: Object.assign({}, DEMIS) };
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, [], src);
  ctx.generateGardes(YEAR);
  const row = ss.getSheetByName(`GARDES_${YEAR}`)._rows.find(x => x[0] === MAR);
  const d0 = ctx.getPremierJourPlanning(YEAR), de = {};
  for (let c = 1; c < row.length; c++) de[iso(new Date(d0.getTime() + (c - 1) * 86400000))] = String(row[c] || '');
  return de;
}
{
  const de = generer(undefined);
  const garde = c => c === 'G' || c === 'G2';
  const surJour = Object.keys(DEMIS).filter(d => garde(de[d]) || de[d] === '18');
  const surVeille = Object.keys(DEMIS).filter(d => garde(de[veille(d)]));
  V('aucune garde ni 18 h un jour de demi-vacances', surJour.length === 0, surJour.map(d => d + ':' + de[d]));
  V('aucune garde la veille d\'une demi-journée de vacances', surVeille.length === 0, surVeille.map(d => veille(d) + ':' + de[veille(d)]));
  const recopies = Object.keys(DEMIS).filter(d => de[d] === DEMIS[d]);
  V('VM / VA recopiés tels quels dans GARDES (12/12)', recopies.length === 12,
    Object.keys(DEMIS).map(d => d + ':' + de[d]));
  V('le MAR garde des gardes dans l\'année (il n\'est pas exclu en bloc)',
    Object.values(de).filter(garde).length >= 10, Object.values(de).filter(garde).length);

  let avant = null;
  try {
    avant = execSync('git show 62b8a9f:gas/generateur_gardes.gs',
      { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { avant = null; }
  if (avant) {
    const d1 = generer(avant);
    const touche = Object.keys(DEMIS).filter(d => garde(d1[d]) || garde(d1[veille(d)]) || d1[d] === '18');
    V('CONTRE-ÉPREUVE : le générateur d\'avant plaçait des gardes sur ces jours ou leur veille',
      touche.length > 0, touche.length);
    V('CONTRE-ÉPREUVE : …et ne recopiait pas VM/VA dans GARDES',
      Object.keys(DEMIS).every(d => d1[d] !== DEMIS[d]));
  } else {
    V('contre-épreuve sautée (historique git indisponible ici)', true);
  }
}

/* ═══ 3. Le planning du jour ══════════════════════════════════════════════ */
console.log('\n═══ 3. Planning du jour : absent sur la seule demi-journée ═══');
{
  process.chdir(__dirname);
  const monde = require('./monde');
  const W = monde.monter(YEAR);
  const sh = W.cl.getSheetByName(`GARDES_${YEAR}`);
  const data = sh.getDataRange().getValues();
  const d2c = vm.runInContext(`buildDateToCol(${JSON.stringify(data)}, ${YEAR})`, W.ctx);
  // Deux MAR présents en journée un mardi ordinaire : on leur pose VM et VA.
  const JOUR = '2027-03-09';
  const col = d2c[JOUR];
  const libres = [];
  for (let r = 3; r < data.length && libres.length < 2; r++) {
    if (String(data[r][0]).trim() && !String(data[r][col] || '').trim()) libres.push(r);
  }
  const idM = String(data[libres[0]][0]).trim(), idA = String(data[libres[1]][0]).trim();
  sh.getRange(libres[0] + 1, col + 1).setValue('VM');
  sh.getRange(libres[1] + 1, col + 1).setValue('VA');
  const months = vm.runInContext(`generatePlanningFromGardes(${YEAR})`, W.ctx);
  const mars = months.find(m => (m.days || []).some(d => d.date === JOUR));
  const i = mars.days.findIndex(d => d.date === JOUR);
  const eM = mars.doctors.find(d => d.id === idM).days[i];
  const eA = mars.doctors.find(d => d.id === idA).days[i];
  V('VM : le statut du jour est VM', eM.status === 'VM', eM);
  V('VM : le matin est marqué V (absent)', eM.morning === 'V', eM);
  V('VM : l\'après-midi, il est dans un secteur', !!eM.afternoon && eM.afternoon !== 'V', eM);
  V('VA : le matin, il est dans un secteur', !!eA.morning && eA.morning !== 'V', eA);
  V('VA : l\'après-midi est marqué V (absent)', eA.afternoon === 'V', eA);
  V('aucune consultation ne reste sur la demi-journée posée',
    eM.cs !== eM.morning || !eM.cs, eM);
  const CODE = lire('gas/code.gs');
  V('VM/VA ne sont PAS dans ABSENT_CODES (le MAR travaille l\'autre demi-journée)',
    !/const ABSENT_CODES = new Set\(\[[^\]]*'VM'/.test(CODE));
  V('la demi-journée est posée APRÈS les overrides (dernier geste)',
    CODE.indexOf('// ── 5. Demi-journée de vacances') > CODE.indexOf('// ── 4. Appliquer PLANNING_OVERRIDES'));

  /* ═══ 4. La paie ═══ */
  console.log('\n═══ 4. Vue paie : VM/VA affichés, 0,5 jour, geste Chronos ═══');
  const run = s => vm.runInContext(s, W.ctx);
  V('_paieCode_ : VM et VA sortent tels quels', run("_paieCode_('VM')") === 'VM' && run("_paieCode_('va')") === 'VA');
  const jours = ['2027-03-08', '2027-03-09', '2027-03-10'].map(d => ({ date: d, isWeekend: false, isFerie: false }));
  const plan = st => ({ months: [{ id: '2027-03', label: 'Mars 2027', days: jours,
    doctors: [{ id: 'M01', days: st.map(s => ({ status: s })) }] }] });
  const av = run(`_paieAplatir_(${JSON.stringify(plan(['V', 'V', '']))})`);
  const ap = run(`_paieAplatir_(${JSON.stringify(plan(['V', 'VM', '']))})`);
  W.ctx.__av = av; W.ctx.__ap = ap;
  const items = run('_paieDiff_(__av, __ap)');
  const demi = items.find(x => x.demi);
  V('un jour entier devenu VM : retrait du jour + ajout d\'une demi-journée',
    items.some(x => x.type === 'vac' && x.sens === 'retrait' && x.du === '2027-03-09' && !x.demi)
    && demi && demi.sens === 'ajout' && demi.demi === 'VM' && demi.n === 0.5, items);
  W.ctx.__items = items;
  const tot = run('_paieTotaux_(__av, __ap, __items)');
  const ligneV = tot[0].lignes.find(l => l.code === 'V');
  V('total des vacances du mois : 2 → 1,5', ligneV.avant === 2 && ligneV.apres === 1.5, tot);
  W.ctx.__demi = demi;
  const geste = run('_paieGestes_(__demi)')[0];
  V('geste Chronos : « une demi-journée de vacances (matin) »', /demi-journée de vacances \(matin\)/.test(geste), geste);
  V('nombres à la française : 1,5', run('_paieNb_(1.5)') === '1,5');
}

/* ═══ 5. Les compteurs et les écrans ═════════════════════════════════════ */
console.log('\n═══ 5. Compteurs (reliquat, staff, écran MAR) et écrans ═══');
{
  const GA = lire('gas/gardes.gs'), ST = lire('staff.html'), INDH = lire('indispos.html'),
        PA = lire('paie.html'), AD = lire('admin.html'), GEN = lire('gas/generateur_gardes.gs');
  V('reliquat : VM/VA comptent 0,5 jour de vacances', /if \(_v === 'VM' \|\| _v === 'VA'\) \{ p\.vac \+= 0\.5; continue; \}/.test(GA));
  V('don / échange : VM/VA bloquent comme une absence', /const ABSENCES = \['V', 'VM', 'VA',/.test(GA));
  V('générateur : VM/VA bloquent la veille (absenceLendemain)', /_sl==='VAC'\|\|_sl==='VM'\|\|_sl==='VA'/.test(GEN));
  V('générateur : VM/VA exclus des 18 h et des récupérations',
    /const ABSENT_18 = new Set\(\['VAC','VM','VA'/.test(GEN) && /const R_ABSENT=new Set\(\['VAC','VM','VA'/.test(GEN));
  V('staff : VM/VA lus, comptés 0,5, jamais cliquables', /demiVac\[m\.id\]\[date\]=val/.test(ST)
    && /\*0\.5/.test(ST) && /if\(estDemiVac\(marId,date\)\)/.test(ST));
  V('écran MAR : VM/VA verrouillés et comptés 0,5', /indispos\[date\] === 'VM' \|\| indispos\[date\] === 'VA'/.test(INDH)
    && /vacOuvres \+= \(s === 'VAC' \? 1 : 0\.5\)/.test(INDH));
  V('page paie : 0,5 dans le total V', /tot\.V \+= 0\.5/.test(PA));
  V('comité : VM/VA ont une couleur et un libellé', /'VM': \{label:'Vacances le matin'/.test(AD));
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
