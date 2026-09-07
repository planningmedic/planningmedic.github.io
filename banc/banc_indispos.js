/* ═══ BANC — P6 : INDISPONIBILITÉS (cahier T069, T070, T072) ═══
   C'est le geste que Wajdi Sultan fera EN DIRECT devant le staff le 4/09 :
   il doit être sans surprise. On éprouve l'écriture réelle
   (saveIndisposForDoctor), la saisie groupée, le retrait partiel, et surtout
   qu'une date hors année n'écrit RIEN. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,190) : '')); } };

/* INDISPOS_{année} à la forme de production : ligne 1 = en-têtes de mois,
   ligne 2 = jours, MAR à partir de la ligne 4. */
function monde(annee) {
  VERROUS.script = false;
  const cl = new Classeur();
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dates = [], entete1 = [''], entete2 = [''];
  for (let m = 0; m < 12; m++) {
    const nb = new Date(annee, m + 1, 0).getDate();
    for (let j = 1; j <= nb; j++) {
      dates.push(`${annee}-${String(m+1).padStart(2,'0')}-${String(j).padStart(2,'0')}`);
      entete1.push(j === 1 ? `${MOIS[m]} ${annee}` : '');
      entete2.push(j);
    }
  }
  /* Structure EXACTE de production, lue dans reconstruireDatesHeaders :
     ligne 1 = libellés de mois · ligne 2 = libre · ligne 3 = numéros de jour ·
     MAR à partir de la ligne 4. Une erreur d'une ligne ici, et tout le banc
     mesurerait des cases vides — c'est ce qui vient d'arriver. */
  const lignes = [entete1, dates.map(()=>'') , entete2];
  ['ALPHA','BRAVO'].forEach(id => lignes.push([id].concat(dates.map(()=>''))));
  cl.ajouter(`INDISPOS_${annee}`, lignes);
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, RegExp, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl }, TEST_YEAR: annee, Logger: { log(){} } });
  ctx.globalThis = ctx;
  ['reconstruireDatesHeaders'].forEach(n => vm.runInContext(extraireFonction('../gas/code.gs', n), ctx));
  ['getIndisposForDoctor','saveIndisposForDoctor'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx));
  return { cl, ctx, dates, annee };
}

console.log('\n═══ T069 · trois jours de vacances : écrits, relus à l\'identique ═══');
{
  const b = monde(2027);
  const jours = { '2027-02-08': 'VAC', '2027-02-09': 'VAC', '2027-02-10': 'VAC' };
  const ecrit = vm.runInContext(`saveIndisposForDoctor('ALPHA', ${JSON.stringify(jours)}, 2027)`, b.ctx);
  V('l\'écriture réussit', ecrit === true, ecrit);
  const relu = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  V('les trois jours reviennent après relecture', Object.keys(relu).filter(d => relu[d] === 'VAC').length === 3, Object.keys(relu).filter(d=>relu[d]));
  V('ce sont exactement les bons jours', ['2027-02-08','2027-02-09','2027-02-10'].every(d => relu[d] === 'VAC'), relu['2027-02-08']);
  V('aucun autre jour n\'a été touché', Object.keys(relu).filter(d => relu[d]).length === 3, Object.keys(relu).filter(d=>relu[d]).length);
  const collegue = vm.runInContext(`getIndisposForDoctor('BRAVO', 2027)`, b.ctx);
  V('le collègue n\'est pas affecté', Object.keys(collegue).filter(d => collegue[d]).length === 0);
}

console.log('\n═══ T070 · deux semaines d\'un coup, puis trois jours retirés au milieu ═══');
{
  const b = monde(2027);
  const periode = {};
  for (let j = 1; j <= 14; j++) periode[`2027-06-${String(j).padStart(2,'0')}`] = 'VAC';
  vm.runInContext(`saveIndisposForDoctor('ALPHA', ${JSON.stringify(periode)}, 2027)`, b.ctx);
  let relu = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  V('les 14 jours sont enregistrés', Object.keys(relu).filter(d => relu[d] === 'VAC').length === 14, Object.keys(relu).filter(d=>relu[d]).length);

  // retrait de trois jours AU MILIEU (7, 8, 9 juin)
  ['2027-06-07','2027-06-08','2027-06-09'].forEach(d => delete periode[d]);
  vm.runInContext(`saveIndisposForDoctor('ALPHA', ${JSON.stringify(periode)}, 2027)`, b.ctx);
  relu = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  V('il reste 11 jours', Object.keys(relu).filter(d => relu[d] === 'VAC').length === 11, Object.keys(relu).filter(d=>relu[d]).length);
  V('les trois jours du milieu sont bien libérés', !relu['2027-06-07'] && !relu['2027-06-08'] && !relu['2027-06-09'],
    [relu['2027-06-07'], relu['2027-06-08'], relu['2027-06-09']]);
  V('les bornes tiennent (1er et 14 juin)', relu['2027-06-01'] === 'VAC' && relu['2027-06-14'] === 'VAC');
  V('le 6 et le 10 juin encadrent bien le trou', relu['2027-06-06'] === 'VAC' && relu['2027-06-10'] === 'VAC');
}

console.log('\n═══ T072 · une date hors année n\'écrit RIEN ═══');
{
  const b = monde(2027);
  const horsAnnee = { '2028-12-31': 'VAC', '2026-01-01': 'VAC', '2027-03-15': 'VAC' };
  vm.runInContext(`saveIndisposForDoctor('ALPHA', ${JSON.stringify(horsAnnee)}, 2027)`, b.ctx);
  const relu = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  V('la date DANS l\'année est écrite', relu['2027-03-15'] === 'VAC', relu['2027-03-15']);
  V('la date de l\'année suivante est ignorée', !relu['2028-12-31'], relu['2028-12-31']);
  V('celle de l\'année précédente aussi', !relu['2026-01-01'], relu['2026-01-01']);
  V('une seule case remplie au total', Object.keys(relu).filter(d => relu[d]).length === 1, Object.keys(relu).filter(d=>relu[d]));
}

console.log('\n═══ Codes de statut : chacun est conservé tel quel ═══');
{
  const b = monde(2027);
  const melange = { '2027-04-01':'VAC', '2027-04-02':'FORM', '2027-04-03':'TP', '2027-04-06':'CL', '2027-04-07':'INDISPO' };
  vm.runInContext(`saveIndisposForDoctor('ALPHA', ${JSON.stringify(melange)}, 2027)`, b.ctx);
  const relu = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  Object.entries(melange).forEach(([d, code]) => V(`« ${code} » conservé au ${d.slice(8)}/04`, relu[d] === code, relu[d]));
  V('le 4 et le 5 avril restent libres', !relu['2027-04-04'] && !relu['2027-04-05']);
}

console.log('\n═══ Un MAR inconnu n\'écrit nulle part ═══');
{
  const b = monde(2027);
  const r = vm.runInContext(`saveIndisposForDoctor('FANTOME', {'2027-05-05':'VAC'}, 2027)`, b.ctx);
  V('l\'écriture est refusée', r === false, r);
  const alpha = vm.runInContext(`getIndisposForDoctor('ALPHA', 2027)`, b.ctx);
  V('aucune ligne existante n\'a été polluée', Object.keys(alpha).filter(d => alpha[d]).length === 0);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
