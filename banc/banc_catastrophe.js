/* ═══ BANC — P12 : SCÉNARIOS CATASTROPHE (cahier T134 → T147) ═══
   Les pannes et les pièges du calendrier. Ce qui exige Google réel (quotas,
   espace Drive, sauvegardes) reste manuel — c'est dit dans le cahier. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,180) : '')); } };

function monde() {
  VERROUS.script = false; VERROUS.document = false;
  const cl = new Classeur();
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    Logger: { log: () => {} }, logAction: () => {} });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction('../gas/code.gs', 'savePlanningOverridesBatch'), ctx);
  return { cl, ctx };
}

console.log('\n═══ T134 · deux écritures simultanées : le verrou tient ═══');
{
  VERROUS.script = false;
  const premier = fabriqueVerrou('script');
  V('la première écriture prend le verrou', premier.tryLock(5000) === true);
  const second = fabriqueVerrou('script');
  V('la seconde ne l\'obtient PAS (pas d\'écriture concurrente)', second.tryLock(1000) === false);
  premier.releaseLock();
  V('le verrou libéré, la suivante passe', fabriqueVerrou('script').tryLock(1000) === true);
  VERROUS.script = false;
}

console.log('\n═══ T135 · deux appareils, deux saisies : aucune perte ═══');
{
  const b = monde();
  // deux lots déposés séparément, appliqués l'un après l'autre
  vm.runInContext(`savePlanningOverridesBatch([{date:'2027-03-01',marId:'ALPHA',morning:'REA',comment:'poste'}])`, b.ctx);
  vm.runInContext(`savePlanningOverridesBatch([{date:'2027-03-01',marId:'BRAVO',morning:'MAT',comment:'telephone'}])`, b.ctx);
  const l = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes;
  V('les DEUX écritures aboutissent', l.length === 3, l.length - 1 + ' ligne(s)');
  V('aucune ne recouvre l\'autre', l.some(x=>x[1]==='ALPHA') && l.some(x=>x[1]==='BRAVO'), l.map(x=>x[1]));
}

console.log('\n═══ T137 · double clic nerveux : une seule écriture ═══');
{
  const b = monde();
  const item = `[{date:'2027-03-02',marId:'CHARLI',morning:'ORT',comment:'clic'}]`;
  vm.runInContext(`savePlanningOverridesBatch(${item})`, b.ctx);
  vm.runInContext(`savePlanningOverridesBatch(${item})`, b.ctx);   // le double clic
  vm.runInContext(`savePlanningOverridesBatch(${item})`, b.ctx);   // et un troisième, tant qu'à faire
  const l = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.filter(x => x[1] === 'CHARLI');
  V('UNE seule ligne malgré trois envois identiques', l.length === 1, l.length);
}

console.log('\n═══ T145 · année bissextile : le 29 février 2028 existe ═══');
{
  /* Le générateur balaie du 1er lundi au dernier dimanche : un décalage d'un
     jour sur une bissextile décalerait TOUT le planning. */
  const jours = [];
  const d = new Date(Date.UTC(2028, 1, 26));
  for (let i = 0; i < 5; i++) { jours.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate() + 1); }
  V('le 29/02/2028 est bien dans la suite des jours', jours.includes('2028-02-29'), jours);
  V('et il est suivi du 1er mars', jours[jours.indexOf('2028-02-29') + 1] === '2028-03-01', jours);
  const fev = new Date(Date.UTC(2028, 1, 29));
  V('le 29/02/2028 est un mardi', fev.getUTCDay() === 2, fev.getUTCDay());
  const nonBissextile = new Date(Date.UTC(2027, 1, 29));   // 2027 : n'existe pas
  V('le 29/02/2027 bascule bien au 1er mars (année non bissextile)',
    nonBissextile.toISOString().slice(0,10) === '2027-03-01', nonBissextile.toISOString().slice(0,10));
}

console.log('\n═══ T146 · changement d\'heure : aucun jour perdu ni dupliqué ═══');
{
  /* Le piège classique : additionner 24 h au passage à l'heure d'été donne
     deux fois le même jour, ou en saute un. La production s'appuie sur MIDI. */
  const suite = (depart, n) => {
    const out = []; const d = new Date(depart + 'T12:00:00');
    for (let i = 0; i < n; i++) {
      out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      d.setDate(d.getDate() + 1);
    }
    return out;
  };
  const mars = suite('2027-03-26', 5);      // heure d'été : nuit du 27 au 28 mars 2027
  V('mars : cinq jours distincts', new Set(mars).size === 5, mars);
  V('mars : le 28 est présent, une seule fois', mars.filter(x => x === '2027-03-28').length === 1, mars);
  const octobre = suite('2027-10-29', 5);   // heure d'hiver : nuit du 30 au 31 octobre 2027
  V('octobre : cinq jours distincts', new Set(octobre).size === 5, octobre);
  V('octobre : le 31 est présent, une seule fois', octobre.filter(x => x === '2027-10-31').length === 1, octobre);
}

console.log('\n═══ T147 · apostrophes et accents restitués à l\'identique ═══');
{
  const b = monde();
  const textes = ["L'Hôpital", "Césarienne « urgente »", "Noël/Jour de l'an", "Müller-Weiss", "çà et là — 50 %"];
  textes.forEach((t, i) => {
    vm.runInContext(`savePlanningOverridesBatch([{date:'2027-04-0${i+1}',marId:'DELTA',morning:'REA',comment:${JSON.stringify(t)}}])`, b.ctx);
  });
  /* (14/08/2026) La doublure coerce les dates comme le vrai Sheets ; la
     recherche du test se normalise, comme le code de production le fait. */
  const dstr = v => v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
    : String(v).trim();
  const l = b.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1);
  textes.forEach((t, i) => {
    const ligne = l.find(x => dstr(x[0]) === `2027-04-0${i+1}`);
    V(`« ${t.slice(0,22)} » restitué exactement`, ligne && ligne[4] === t, ligne && ligne[4]);
  });
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
