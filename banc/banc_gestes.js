/* ═══ BANC — LES GESTES ENCORE NON COUVERTS ═══
   Échanges et dons de garde, éditeur d'affectations, verrous d'année.
   Ce sont les gestes RARES mais ENGAGEANTS du comité : ils restent
   synchrones (verdict immédiat), donc leurs refus doivent être justes et
   leurs écritures exactes. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
const { MARS } = require('./jeu_donnees');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

/* GARDES_{annee} au format EXACT attendu par applyModification :
   colonne 1 = MAR (à partir de la ligne 4), colonnes suivantes = jours à
   partir du 1er lundi de janvier (buildDateIndex le recalcule seul). */
const ctxCompteurs = { republications: 0 };
function monde(annee) {
  VERROUS.script = false; VERROUS.document = false;
  ctxCompteurs.republications = 0;
  const jan1 = new Date(annee, 0, 1), dow = jan1.getDay();
  const off = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
  const debut = new Date(annee, 0, 1 + off, 12, 0, 0);
  const dates = [];
  for (let i = 0; i < 60; i++) { const d = new Date(debut); d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
  const cl = new Classeur();
  const lignes = [['',''], ['',''], ['MAR',''].concat(dates.map(()=>''))];
  MARS.slice(0, 8).forEach(id => lignes.push([id, ''].concat(dates.map(() => ''))));
  cl.ajouter(`GARDES_${annee}`, lignes);
  /* (12/08/2026 — phase 2) INDISPOS_{annee}, même géométrie de colonnes que
     GARDES : c'est l'hypothèse du code de production (readCell partage le même
     index de dates pour les deux onglets, comme dans echangeSecteur). */
  const lignesInd = [['',''], ['',''], ['MAR',''].concat(dates.map(()=>''))];
  MARS.slice(0, 8).forEach(id => lignesInd.push([id, ''].concat(dates.map(() => ''))));
  cl.ajouter(`INDISPOS_${annee}`, lignesInd);
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  const MOIS = ['JAN','FEV','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  cl.ajouter(`AFFECTATIONS_${annee}`, [['MAR'].concat(MOIS.map(m => `${m} ${annee}`))]
    .concat(MARS.slice(0, 8).map(id => [id].concat(MOIS.map(() => 'VOLANT')))));
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => annee, TEST_YEAR: annee,
    getIndisposForDoctor: () => ({}), saveIndisposForDoctor: () => {},
    /* applyModification republie le planning en fin de geste (comportement de
       production) : on compte les republications au lieu de les exécuter. */
    generatePlanning: () => { ctxCompteurs.republications++; },
    notifPlanifier: () => {},
    buildDateToCol: (data) => { const m = {}; (data[2]||[]).forEach((v,c) => { if (v) m[String(v)] = c; }); return m; },
  });
  ctx.globalThis = ctx;
  ['applyModification'].forEach(n => vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx));
  // pose directe d'un code dans GARDES (helper de test, pas du code de production)
  /* Le code de production indexe les colonnes en base 1 (getRange) ; le tableau
     de la doublure est en base 0. D'où le +1 et non le +2 : décalage attrapé
     par le banc lui-même au premier essai. */
  const colonne = date => dates.indexOf(date) + 1;
  const poser = (mar, date, code) => {
    const f = cl.getSheetByName(`GARDES_${annee}`);
    f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][colonne(date)] = code;
  };
  const poserIndispo = (mar, date, code) => {
    const f = cl.getSheetByName(`INDISPOS_${annee}`);
    f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][colonne(date)] = code;
  };
  const lire = (mar, date) => {
    const f = cl.getSheetByName(`GARDES_${annee}`);
    return f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][colonne(date)] || '';
  };
  return { cl, ctx, dates, poser, lire, poserIndispo, annee };
}

console.log('\n═══ 38. Échange de gardes entre deux MAR ═══');
{
  const b = monde(2027);
  const j = b.dates[10], lendemain = b.dates[11];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  vm.runInContext(`applyModification({ type:'echangeGarde', year:2027, date:${JSON.stringify(j)}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx);
  V('la garde change de titulaire', b.lire('BRAVO', j) === 'G' && b.lire('ALPHA', j) === '', { alpha: b.lire('ALPHA', j), bravo: b.lire('BRAVO', j) });
  V('le repos de garde suit la garde', b.lire('BRAVO', lendemain) === 'RG' && b.lire('ALPHA', lendemain) === '',
    { alpha: b.lire('ALPHA', lendemain), bravo: b.lire('BRAVO', lendemain) });
  V('le planning est republié après le geste (visible des MAR)', ctxCompteurs.republications === 1, ctxCompteurs.republications);
}

console.log('\n═══ 39. Refus : l\'échange écraserait une garde existante ═══');
{
  const b = monde(2027);
  const j = b.dates[10], lendemain = b.dates[11];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', lendemain, 'G');            // BRAVO est de garde le lendemain
  let erreur = null;
  try { vm.runInContext(`applyModification({ type:'echangeGarde', year:2027, date:${JSON.stringify(j)}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx); }
  catch (e) { erreur = e.message; }
  V('l\'échange est REFUSÉ avec un motif lisible', !!erreur && /manuellement|garde/i.test(erreur), erreur);
  V('rien n\'a été écrit à moitié', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', lendemain) === 'G',
    { alphaJ: b.lire('ALPHA', j), bravoLendemain: b.lire('BRAVO', lendemain) });
  V('aucune republication après un refus', ctxCompteurs.republications === 0, ctxCompteurs.republications);
}

console.log('\n═══ 40. Don de garde ═══');
{
  const b = monde(2027);
  const j = b.dates[20], lendemain = b.dates[21];
  b.poser('CHARLI', j, 'G'); b.poser('CHARLI', lendemain, 'RG');
  vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(j)}, doctorId:'CHARLI', doctorId2:'DELTA' })`, b.ctx);
  V('le donneur est libéré', b.lire('CHARLI', j) === '' && b.lire('CHARLI', lendemain) === '');
  V('le receveur prend la garde ET son repos', b.lire('DELTA', j) === 'G' && b.lire('DELTA', lendemain) === 'RG',
    { garde: b.lire('DELTA', j), repos: b.lire('DELTA', lendemain) });
  let err = null;
  try { vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[30])}, doctorId:'ECHO', doctorId2:'FOXTRO' })`, b.ctx); }
  catch (e) { err = e.message; }
  V('donner une garde qu\'on n\'a pas est refusé', !!err && /rien a donner|pas de garde/i.test(err), err);
}

console.log('\n═══ 41. Échange de gardes sur DEUX dates ═══');
{
  const b = monde(2027);
  const j1 = b.dates[5], j2 = b.dates[25];
  b.poser('GOLF', j1, 'G'); b.poser('GOLF', b.dates[6], 'RG');
  b.poser('HOTEL', j2, 'G'); b.poser('HOTEL', b.dates[26], 'RG');
  vm.runInContext(`applyModification({ type:'echangeGardeJours', year:2027, date:${JSON.stringify(j1)}, doctorId:'GOLF', date2:${JSON.stringify(j2)}, doctorId2:'HOTEL' })`, b.ctx);
  V('chaque date garde son rôle, les titulaires permutent',
    b.lire('HOTEL', j1) === 'G' && b.lire('GOLF', j2) === 'G', { j1_hotel: b.lire('HOTEL', j1), j2_golf: b.lire('GOLF', j2) });
  let err = null;
  const b2 = monde(2027);
  b2.poser('GOLF', b2.dates[5], 'G');
  try { vm.runInContext(`applyModification({ type:'echangeGardeJours', year:2027, date:${JSON.stringify(b2.dates[5])}, doctorId:'GOLF', date2:${JSON.stringify(b2.dates[5])}, doctorId2:'HOTEL' })`, b2.ctx); }
  catch (e) { err = e.message; }
  V('deux fois la même date est refusé', !!err && /différentes/i.test(err), err);
}

console.log('\n═══ 42. Année archivée : aucune modification possible ═══');
{
  const b = monde(2027);
  let err = null;
  try { vm.runInContext(`applyModification({ type:'echangeGarde', year:2019, date:${JSON.stringify(b.dates[3])}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx); }
  catch (e) { err = e.message; }
  V('le verrou d\'année archivée s\'applique', !!err && /archiv/i.test(err), err);
  V('le message est compréhensible par le comité', !!err && /consultation seule/i.test(err), err);
}

console.log('\n═══ 43. Éditeur d\'affectations : écriture exacte ═══');
{
  const b = monde(2027);
  const aff = { ALPHA: { 1:'REA', 2:'REA', 3:'VIS' }, BRAVO: { 1:'ORT' } };
  vm.runInContext(`
    (function(){
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getSheetByName('AFFECTATIONS_2027');
      var data = sheet.getDataRange().getValues();
      var idToRow = {};
      for (var r = 1; r < data.length; r++) { var id = String(data[r][0]).trim(); if (id) idToRow[id] = r + 1; }
      var aff = ${JSON.stringify(aff)};
      Object.keys(aff).forEach(function (docId) {
        var rowNum = idToRow[docId]; if (!rowNum) return;
        var vals = []; for (var m = 1; m <= 12; m++) vals.push(aff[docId][m] || 'VOLANT');
        sheet.getRange(rowNum, 2, 1, 12).setValues([vals]);
      });
    })();`, b.ctx);
  const f = b.cl.getSheetByName('AFFECTATIONS_2027').lignes;
  const ligneAlpha = f.find(l => l[0] === 'ALPHA'), ligneBravo = f.find(l => l[0] === 'BRAVO');
  V('les mois renseignés sont écrits', ligneAlpha[1] === 'REA' && ligneAlpha[3] === 'VIS', ligneAlpha.slice(1, 4));
  V('les mois vides deviennent VOLANT (jamais vides)', ligneAlpha[4] === 'VOLANT' && ligneBravo[2] === 'VOLANT',
    { alpha4: ligneAlpha[4], bravo2: ligneBravo[2] });
  V('les 12 mois sont couverts', ligneAlpha.slice(1, 13).every(v => !!v), ligneAlpha.slice(1, 13));
  V('un MAR non listé n\'est pas touché', b.cl.getSheetByName('AFFECTATIONS_2027').lignes.find(l => l[0] === 'CHARLI')[1] === 'VOLANT');
}

console.log('\n═══ 44. Atomicité : un refus ne laisse JAMAIS d\'écriture partielle ═══');
{
  /* Le défaut trouvé le 05/08 : l'échange écrivait avant de vérifier. On
     éprouve les cinq types de modification, chacun sur un cas refusé, en
     comparant l'état COMPLET de la feuille avant et après. */
  const etat = b => JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const cas = [
    ['echangeGarde — le receveur est de garde le lendemain', b => {
      b.poser('ALPHA', b.dates[10], 'G'); b.poser('ALPHA', b.dates[11], 'RG'); b.poser('BRAVO', b.dates[11], 'G');
      return `{ type:'echangeGarde', year:2027, date:${JSON.stringify(b.dates[10])}, doctorId:'ALPHA', doctorId2:'BRAVO' }`;
    }],
    ['donGarde — le receveur est déjà de garde ce jour-là', b => {
      b.poser('CHARLI', b.dates[12], 'G'); b.poser('CHARLI', b.dates[13], 'RG'); b.poser('DELTA', b.dates[12], 'G');
      return `{ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[12])}, doctorId:'CHARLI', doctorId2:'DELTA' }`;
    }],
    ['echangeGardeJours — une garde existe déjà à la date d\'arrivée', b => {
      b.poser('ECHO', b.dates[5], 'G'); b.poser('FOXTRO', b.dates[25], 'G'); b.poser('ECHO', b.dates[25], 'G2');
      return `{ type:'echangeGardeJours', year:2027, date:${JSON.stringify(b.dates[5])}, doctorId:'ECHO', date2:${JSON.stringify(b.dates[25])}, doctorId2:'FOXTRO' }`;
    }],
    ['gardeExceptionnelle — le MAR est déjà de garde', b => {
      b.poser('GOLF', b.dates[15], 'G');
      return `{ type:'gardeExceptionnelle', year:2027, date:${JSON.stringify(b.dates[15])}, doctorId:'GOLF' }`;
    }],
    ['type inconnu', b => `{ type:'bidule', year:2027, date:${JSON.stringify(b.dates[8])}, doctorId:'ALPHA' }`],
  ];
  cas.forEach(([titre, preparer]) => {
    const b = monde(2027);
    const mod = preparer(b);
    const avant = etat(b);
    let refuse = false;
    try { vm.runInContext(`applyModification(${mod})`, b.ctx); } catch (e) { refuse = true; }
    const apres = etat(b);
    V(`${titre} : refusé ET feuille inchangée`, refuse && avant === apres,
      { refuse, identique: avant === apres });
  });
}

console.log('\n═══ 46 ter. Phase 2 : un don exige un receveur DISPONIBLE ═══');
{
  /* Le trou consigné le 11/08 : donGarde ne regardait que la grille des
     gardes. Donner une garde à un MAR en congé passait sans un mot. On
     éprouve le refus (feuille INTACTE) et, surtout, les non-régressions :
     receveur libre = accepté, souhait = accepté. */
  const etat = b => JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const refuses = [
    ['receveur en VAC le jour de la garde', 'VAC', 0],
    ['receveur en congé longue durée (CL)', 'CL', 0],
    ['receveur en temps partiel (TP)', 'TP', 0],
    ['receveur INDISPO ce jour-là', 'INDISPO', 0],
    ['receveur en VAC le LENDEMAIN (jour de son repos de garde)', 'VAC', 1],
  ];
  refuses.forEach(([titre, code, decalage]) => {
    const b = monde(2027);
    b.poser('ALPHA', b.dates[20], 'G'); b.poser('ALPHA', b.dates[21], 'RG');
    b.poserIndispo('BRAVO', b.dates[20 + decalage], code);
    const avant = etat(b);
    let msg = '';
    try { vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[20])}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx); }
    catch (e) { msg = e.message; }
    V(`${titre} : refusé, motif lisible, feuille intacte`,
      /indisponible/.test(msg) && new RegExp(code).test(msg) && etat(b) === avant, msg);
  });

  {
    const b = monde(2027);
    b.poser('ALPHA', b.dates[20], 'G'); b.poser('ALPHA', b.dates[21], 'RG');
    vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[20])}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx);
    V('receveur LIBRE : le don passe comme avant (non-régression)',
      b.lire('BRAVO', b.dates[20]) === 'G' && b.lire('BRAVO', b.dates[21]) === 'RG'
      && b.lire('ALPHA', b.dates[20]) === '' && b.lire('ALPHA', b.dates[21]) === '');
  }
  {
    const b = monde(2027);
    b.poser('ALPHA', b.dates[20], 'G'); b.poser('ALPHA', b.dates[21], 'RG');
    b.poserIndispo('BRAVO', b.dates[20], 'SOUHAIT');
    let ok2 = true;
    try { vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[20])}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx); }
    catch (e) { ok2 = false; }
    V('un SOUHAIT n\'est pas une absence : le don passe', ok2 && b.lire('BRAVO', b.dates[20]) === 'G');
  }
  {
    /* L'indisponibilité d'un TIERS ne bloque rien : seule celle du receveur compte. */
    const b = monde(2027);
    b.poser('ALPHA', b.dates[20], 'G'); b.poser('ALPHA', b.dates[21], 'RG');
    b.poserIndispo('CHARLI', b.dates[20], 'VAC');
    let ok3 = true;
    try { vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:${JSON.stringify(b.dates[20])}, doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx); }
    catch (e) { ok3 = false; }
    V('la VAC d\'un tiers ne bloque pas le don', ok3 && b.lire('BRAVO', b.dates[20]) === 'G');
  }
}

console.log('\n═══ 46 quater. Échange de deux gardes ADJACENTES (demande du 12/08) ═══');
{
  const etat = b => JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  /* Monde nominal : ALPHA garde J20 (repos J21), BRAVO garde J21 (repos J22). */
  const nominal = () => {
    const b = monde(2027);
    b.poser('ALPHA', b.dates[20], 'G');  b.poser('ALPHA', b.dates[21], 'RG');
    b.poser('BRAVO', b.dates[21], 'G');  b.poser('BRAVO', b.dates[22], 'RG');
    return b;
  };
  const lancer = (b, date, id, date2, id2) =>
    vm.runInContext(`applyModification({ type:'echangeGardeJours', year:2027, date:${JSON.stringify(date)}, doctorId:${JSON.stringify(id)}, date2:${JSON.stringify(date2)}, doctorId2:${JSON.stringify(id2)} })`, b.ctx);

  {
    const b = nominal();
    lancer(b, b.dates[20], 'ALPHA', b.dates[21], 'BRAVO');
    V('lundi/mardi : l\'échange PASSE, état final exact (6 cellules)',
      b.lire('ALPHA', b.dates[20]) === '' && b.lire('BRAVO', b.dates[20]) === 'G'
      && b.lire('ALPHA', b.dates[21]) === 'G' && b.lire('BRAVO', b.dates[21]) === 'RG'
      && b.lire('ALPHA', b.dates[22]) === 'RG' && b.lire('BRAVO', b.dates[22]) === '',
      [b.lire('ALPHA', b.dates[20]), b.lire('BRAVO', b.dates[20]), b.lire('ALPHA', b.dates[21]),
       b.lire('BRAVO', b.dates[21]), b.lire('ALPHA', b.dates[22]), b.lire('BRAVO', b.dates[22])]);
  }
  {
    const b = nominal();
    lancer(b, b.dates[21], 'BRAVO', b.dates[20], 'ALPHA'); // ordre inversé
    V('ordre inversé (mardi cité en premier) : même état final',
      b.lire('BRAVO', b.dates[20]) === 'G' && b.lire('ALPHA', b.dates[21]) === 'G'
      && b.lire('ALPHA', b.dates[22]) === 'RG' && b.lire('BRAVO', b.dates[22]) === '');
  }
  {
    const b = nominal();
    b.poser('ALPHA', b.dates[20], 'G2'); // le lundi est un G2
    lancer(b, b.dates[20], 'ALPHA', b.dates[21], 'BRAVO');
    V('les rôles restent attachés aux dates (lundi G2 → BRAVO reçoit G2)',
      b.lire('BRAVO', b.dates[20]) === 'G2' && b.lire('ALPHA', b.dates[21]) === 'G');
  }
  const refus = [
    ['ALPHA a une garde au surlendemain+1 : vraie adjacence à l\'arrivée', b => b.poser('ALPHA', b.dates[23], 'G'), /consecutives/],
    ['BRAVO est de garde la veille du lundi : vraie adjacence à l\'arrivée', b => b.poser('BRAVO', b.dates[19], 'G'), /consecutives/],
    ['BRAVO en VAC le lundi qu\'il recevrait', b => b.poserIndispo('BRAVO', b.dates[20], 'VAC'), /indisponible/],
    ['ALPHA en VAC le mercredi (son nouveau repos)', b => b.poserIndispo('ALPHA', b.dates[22], 'VAC'), /indisponible/],
    ['état anormal : BRAVO sans repos au surlendemain', b => { const f = b.cl.getSheetByName('GARDES_2027');
      f.lignes[f.lignes.findIndex(l => l[0] === 'BRAVO')][b.dates.indexOf(b.dates[22]) + 1] = ''; }, /manuellement/],
  ];
  refus.forEach(([titre, saboter, attendu]) => {
    const b = nominal();
    saboter(b);
    const avant = etat(b);
    let msg = '';
    try { lancer(b, b.dates[20], 'ALPHA', b.dates[21], 'BRAVO'); } catch (e) { msg = e.message; }
    V(`${titre} : refusé, feuille intacte`, attendu.test(msg) && etat(b) === avant, msg);
  });
  {
    /* Non-régression : l'échange NON adjacent passe exactement comme avant. */
    const b = monde(2027);
    b.poser('ALPHA', b.dates[10], 'G'); b.poser('ALPHA', b.dates[11], 'RG');
    b.poser('BRAVO', b.dates[30], 'G'); b.poser('BRAVO', b.dates[31], 'RG');
    lancer(b, b.dates[10], 'ALPHA', b.dates[30], 'BRAVO');
    V('non adjacent : comportement inchangé (gardes et repos suivent)',
      b.lire('BRAVO', b.dates[10]) === 'G' && b.lire('ALPHA', b.dates[30]) === 'G'
      && b.lire('BRAVO', b.dates[11]) === 'RG' && b.lire('ALPHA', b.dates[31]) === 'RG'
      && b.lire('ALPHA', b.dates[10]) === '' && b.lire('BRAVO', b.dates[30]) === '');
  }
}

console.log('\n═══ 47. La clé libérale ne contient QUE ce que l\'écran affiche ═══');
{
  /* Contrôle de non-régression sur la confidentialité : le constructeur du
     miroir lit l'onglet LIBERAL_{Y}, où les colonnes 8 et 9 portent les
     montants. Il ne doit jamais les recopier. */
  const cl = new Classeur();
  cl.ajouter('LIBERAL_2027', [
    ['ID','DATE_CONS','DATE_BLOC','MAR_ID','SECTEUR','CHIRURGIE','SPECIALITE','BR_CCAM','BR_NGAP'],
    ['1','2027-02-01','2027-03-03','ALPHA','END','cataracte','OPH', 1234.56, 78.90],
    ['2','2027-02-01','2027-03-03','BRAVO','VIS','hernie','VISC', 999.99, 12.34],
    ['3','2027-02-02','2027-03-04','ALPHA','END','cataracte','OPH', 500, 0],
  ]);
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl } });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction('../gas/miroir.gs', '_miroirConstruireLiberal_'), ctx);
  const res = vm.runInContext('_miroirConstruireLiberal_(2027)', ctx);
  const brut = JSON.stringify(res);
  V('les journées sont indexées par date', !!(res.jours && res.jours['2027-03-03'] && res.jours['2027-03-04']), Object.keys(res.jours || {}));
  V('deux MAR le 03/03, un le 04/03', res.jours['2027-03-03'].length === 2 && res.jours['2027-03-04'].length === 1);
  V('AUCUN montant recopié', !/1234|999|78\.9|12\.34|500/.test(brut), brut.slice(0, 160));
  V('aucune spécialité non plus (non affichée)', !/OPH|VISC|specialite/.test(brut));
  V('les trois champs utiles sont là', /marId/.test(brut) && /secteur/.test(brut) && /chirurgie/.test(brut));
  V('tri par MAR à l\'intérieur d\'une journée', res.jours['2027-03-03'][0].marId === 'ALPHA');
  const vide = (() => { const c2 = new Classeur(); c2.ajouter('LIBERAL_2027', [['ID']]);
    const x = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, RegExp, SpreadsheetApp: { getActiveSpreadsheet: () => c2 } });
    x.globalThis = x; vm.runInContext(extraireFonction('../gas/miroir.gs', '_miroirConstruireLiberal_'), x);
    return vm.runInContext('_miroirConstruireLiberal_(2027)', x); })();
  V('année sans déclaration : liste vide, pas une erreur', vide.success === true && Object.keys(vide.jours).length === 0, vide);
}

console.log('\n═══ 53. Alerte d\'expiration du jeton GitHub ═══');
{
  const ctx = vm.createContext({ console, JSON, Number, String, Math, isFinite, Object });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction('../gas/Indispos.gs', '_diagNiveauToken_'), ctx);
  const n = j => vm.runInContext(`_diagNiveauToken_(${JSON.stringify(j)})`, ctx);
  V('74 j (aujourd\'hui) : simple information', n(74).niveau === 'INFO', n(74));
  V('31 j : encore une information', n(31).niveau === 'INFO', n(31).niveau);
  V('30 j : passe en ORANGE', n(30).niveau === 'WARN', n(30).niveau);
  V('11 j : toujours ORANGE', n(11).niveau === 'WARN', n(11).niveau);
  V('10 j : passe en ROUGE', n(10).niveau === 'ERR', n(10));
  V('3 j : ROUGE', n(3).niveau === 'ERR');
  V('0 j (dernier jour) : ROUGE', n(0).niveau === 'ERR', n(0));
  V('expiré : ROUGE, et le nombre de jours écoulés est donné', n(-5).niveau === 'ERR' && /5 j/.test(n(-5).message), n(-5).message);
  V('le message rouge dit la CONSÉQUENCE, pas juste la date',
    /publication/i.test(n(5).message) && /publication/i.test(n(-1).message), [n(5).message, n(-1).message]);
  V('date illisible : information, jamais de fausse alerte', n('abc').niveau === 'INFO', n('abc'));
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
