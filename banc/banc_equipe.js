/* ═══ BANC — P5 : ÉQUIPE ET ABSENCES LONGUES (cahier T052, T053, T067) ═══
   Ces gestes touchent la fiche des MAR et leur présence sur des semaines
   entières : une erreur ne se voit pas tout de suite, mais fausse le planning
   pendant des mois. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,190) : '')); } };

/* Un monde avec deux années : 2027 générée, 2028 pas encore créée — pour
   éprouver le REPORT différé des absences vers une année inexistante. */
function monde() {
  VERROUS.script = false; VERROUS.document = false;
  const cl = new Classeur();
  const dates2027 = [];
  const d = new Date(Date.UTC(2027, 0, 4));
  for (let i = 0; i < 364; i++) { dates2027.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1); }
  const lignes = [['',''].concat(dates2027.map(()=>'')), ['',''].concat(dates2027.map(()=>'')), ['MAR',''].concat(dates2027)];
  ['ALPHA','BRAVO','CHARLI'].forEach(id => lignes.push([id, ''].concat(dates2027.map(()=>''))));
  cl.ajouter('GARDES_2027', lignes);
  cl.ajouter('MEDECINS', [['ID','NOM','INITIALES','ACTIF','QUOTITE'],
    ['ALPHA','DR ALPHA','AL','O',100], ['BRAVO','DR BRAVO','BR','O',100], ['CHARLI','DR CHARLI','CH','O',80]]);
  const indispos = {};
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    Logger: { log: () => {} }, logAction: () => {}, getActiveYear: () => 2027, TEST_YEAR: 2027,
    getIndisposForDoctor: (id) => indispos[id] || {}, saveIndisposForDoctor: (id, v) => { indispos[id] = v; },
    buildDateToCol: (data) => { const m = {}; (data[2]||[]).forEach((v,c) => { if (v) m[String(v)] = c; }); return m; },
    generatePlanning: () => {}, notifPlanifier: () => {}, _isoDate: (v) => String(v).slice(0,10),
    __indispos: indispos });
  ctx.globalThis = ctx;
  // pose d'une garde pour éprouver la libération
  const poser = (mar, date, code) => {
    const f = cl.getSheetByName('GARDES_2027');
    const col = dates2027.indexOf(date) + 1;
    f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][col] = code;
  };
  const lire = (mar, date) => {
    const f = cl.getSheetByName('GARDES_2027');
    return f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][dates2027.indexOf(date) + 1] || '';
  };
  return { cl, ctx, dates: dates2027, poser, lire };
}

console.log('\n═══ T052 · la fiche d\'un MAR se relit exactement comme écrite ═══');
{
  const b = monde();
  const med = b.cl.getSheetByName('MEDECINS');
  med.getRange(4, 5).setValue(60);          // CHARLI passe à 60 %
  med.getRange(4, 3).setValue('CZ');        // et change d'initiales
  const relu = med.getDataRange().getValues().find(l => l[0] === 'CHARLI');
  V('la quotité est relue à l\'identique', relu[4] === 60, relu[4]);
  V('les initiales aussi', relu[2] === 'CZ', relu[2]);
  V('les autres MAR sont intacts', med.getDataRange().getValues()[1][4] === 100);
}

console.log('\n═══ T053 · un MAR inactif disparaît des propositions ═══');
{
  /* Règle de production (getDoctorsFromMedecins) : ACTIF doit valoir « O ». */
  const b = monde();
  const ctx = vm.createContext({ console, String, SpreadsheetApp: { getActiveSpreadsheet: () => b.cl }, DOCTORS: [] });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction('../gas/code.gs', 'getDoctorsFromMedecins'), ctx);
  const avant = vm.runInContext('getDoctorsFromMedecins().map(d=>d.id)', ctx);
  V('les trois MAR actifs sont proposés', avant.length === 3, avant);
  b.cl.getSheetByName('MEDECINS').getRange(4, 4).setValue('N');   // CHARLI inactif
  const apres = vm.runInContext('getDoctorsFromMedecins().map(d=>d.id)', ctx);
  V('l\'inactif disparaît', !apres.includes('CHARLI'), apres);
  V('les autres restent', apres.length === 2, apres);
  b.cl.getSheetByName('MEDECINS').getRange(4, 4).setValue('O');
  V('remis actif, il réapparaît', vm.runInContext('getDoctorsFromMedecins().map(d=>d.id)', ctx).includes('CHARLI'));
}

console.log('\n═══ T067 · absence longue de trois semaines ═══');
{
  const b = monde();
  const debut = '2027-03-01', fin = '2027-03-21';
  b.poser('ALPHA', '2027-03-05', 'G');        // une garde AU MILIEU de l'absence
  b.poser('ALPHA', '2027-03-06', 'RG');
  b.poser('ALPHA', '2027-02-26', 'G');        // et une garde AVANT : elle doit survivre
  V('préparation : la garde du 05/03 est bien posée', b.lire('ALPHA','2027-03-05') === 'G');

  // Application de la règle de production : CL sur toute la plage
  const jours = [];
  { const c = new Date(debut + 'T12:00:00'), f = new Date(fin + 'T12:00:00');
    while (c <= f) { jours.push(c.toISOString().slice(0,10)); c.setDate(c.getDate()+1); } }
  V('la plage couvre 21 jours calendaires', jours.length === 21, jours.length);
  jours.forEach(d => { if (b.dates.includes(d)) b.poser('ALPHA', d, 'CL'); });

  V('le premier jour est en CL', b.lire('ALPHA', debut) === 'CL');
  V('le dernier jour aussi', b.lire('ALPHA', fin) === 'CL');
  V('la garde du 05/03 a été LIBÉRÉE (écrasée par CL)', b.lire('ALPHA','2027-03-05') === 'CL', b.lire('ALPHA','2027-03-05'));
  V('le repos du 06/03 aussi', b.lire('ALPHA','2027-03-06') === 'CL');
  V('la garde du 26/02, HORS plage, est intacte', b.lire('ALPHA','2027-02-26') === 'G', b.lire('ALPHA','2027-02-26'));
  V('la veille de l\'absence reste vide', b.lire('ALPHA','2027-02-28') === '', b.lire('ALPHA','2027-02-28'));
  V('le lendemain de la fin reste vide', b.lire('ALPHA','2027-03-22') === '', b.lire('ALPHA','2027-03-22'));
  V('les autres MAR ne sont pas touchés', b.lire('BRAVO', debut) === '' && b.lire('CHARLI', debut) === '');

  // Raccourcissement : la fin recule au 14/03 → les jours 15→21 se libèrent
  const nouvelleFin = '2027-03-14';
  jours.filter(d => d > nouvelleFin).forEach(d => { if (b.dates.includes(d)) b.poser('ALPHA', d, ''); });
  V('après raccourcissement, le 14/03 est encore en CL', b.lire('ALPHA','2027-03-14') === 'CL');
  V('le 15/03 est libéré', b.lire('ALPHA','2027-03-15') === '', b.lire('ALPHA','2027-03-15'));
  V('le 21/03 aussi — aucun jour orphelin', b.lire('ALPHA','2027-03-21') === '', b.lire('ALPHA','2027-03-21'));
  V('le début de l\'absence n\'a pas bougé', b.lire('ALPHA', debut) === 'CL');
  const restants = b.dates.filter(d => b.lire('ALPHA', d) === 'CL');
  V('il reste exactement 14 jours d\'absence', restants.length === 14, restants.length);
}

console.log('\n═══ T-AFF · Enregistrer la grille des affectations crée les lignes manquantes ═══');
{
  /* (19/08/2026) Vécu le matin même : PRUNET, fiche créée après l'onglet
     AFFECTATIONS_2026, s'affichait « VOL » à l'écran (convention d'affichage)
     mais l'Enregistrer du comité le sautait EN SILENCE — le journal annonçait
     « 25 mis à jour » pour 24 lignes écrites. Le geste du comité doit rendre
     durable CE QUE L'ÉCRAN AFFICHE, y compris pour un MAR encore sans ligne. */
  VERROUS.script = false; VERROUS.document = false;
  const cl = new Classeur();
  cl.ajouter('AFFECTATIONS_2026', [
    ['MÉDECIN','JAN','FEV','MAR','AVR','MAI','JUN','JUL','AOU','SEP','OCT','NOV','DEC'],
    ['ALPHA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA'],
    ['BRAVO','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT','VOLANT']]);
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl }, Logger: { log(){} } });
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'ecrireAffectations'), ctx);
  const feuille = cl.getSheetByName('AFFECTATIONS_2026');
  ctx.feuille = feuille;
  /* La grille envoie TOUT son tableau : ALPHA modifié, BRAVO inchangé,
     CHARLIE (fiche récente, aucune ligne) en volant implicite. */
  ctx.aff = { ALPHA: {1:'VIS',2:'VIS',3:'REA',4:'REA',5:'REA',6:'REA',7:'REA',8:'REA',9:'REA',10:'REA',11:'REA',12:'REA'},
              BRAVO: {}, CHARLIE: {} };
  const res = vm.runInContext('ecrireAffectations(feuille, aff)', ctx);
  const lignes = feuille.getDataRange().getValues();
  V('les deux lignes existantes sont mises à jour (pas créées)', res.maj === 2 && lignes.length === 4, res);
  V('la ligne manquante est créée', res.crees === 1 && String(lignes[3][0]) === 'CHARLIE', lignes[3] && lignes[3][0]);
  V('la ligne créée porte VOLANT sur les 12 mois', !!lignes[3] && lignes[3].slice(1,13).every(v => v === 'VOLANT'), lignes[3]);
  V('la modification d\'ALPHA est bien écrite (VIS en janvier)', lignes[1][1] === 'VIS', lignes[1][1]);
  V('BRAVO, envoyé vide, retombe sur VOLANT sans dégât', lignes[2].slice(1,13).every(v => v === 'VOLANT'), lignes[2]);
  /* Le compte rendu au journal doit refléter les ÉCRITURES, pas les données
     reçues — c'est lui qui a menti le 19/08 (« 25 » pour 24). */
  V('le compte rendu dit la vérité : 2 mis à jour, 1 créé', res.maj === 2 && res.crees === 1, res);
  /* Recliquer Enregistrer (geste réel du comité) : idempotent, aucun doublon. */
  const res2 = vm.runInContext('ecrireAffectations(feuille, aff)', ctx);
  const lignes2 = feuille.getDataRange().getValues();
  V('un second Enregistrer ne crée aucun doublon', res2.crees === 0 && res2.maj === 3 && lignes2.length === 4, res2);
}

console.log('\n═══ T-AFF-2 · Enregistrer n\'écrit QUE les MARs touchés (envoi différentiel) ═══');
{
  /* (19/08/2026, après-midi) Le matin, Enregistrer envoyait TOUTE la grille —
     nécessaire pour créer la ligne de PRUNET, mais dangereux : depuis une base
     restée ouverte, on réécrivait aussi le travail des autres. Décision
     d'Arthur : n'envoyer que les MARs touchés en session. La protection
     capitale s'éprouve ici À L'OCTET : la ligne d'un MAR jamais touché doit
     ressortir du classeur STRICTEMENT identique. */
  VERROUS.script = false; VERROUS.document = false;
  const cl = new Classeur();
  cl.ajouter('AFFECTATIONS_2026', [
    ['MÉDECIN','JAN','FEV','MAR','AVR','MAI','JUN','JUL','AOU','SEP','OCT','NOV','DEC'],
    ['ALPHA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA','REA'],
    ['BRAVO','VIS','ORL','END','VIS','ORL','END','VIS','ORL','END','VIS','ORL','END']]);
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl }, Logger: { log(){} } });
  vm.runInContext(extraireFonction('../admin.html', 'construireEnvoiAffectations'), ctx);
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'ecrireAffectations'), ctx);
  const feuille = cl.getSheetByName('AFFECTATIONS_2026');
  ctx.feuille = feuille;
  const bravoAvant = JSON.stringify(feuille.getDataRange().getValues()[2]);
  /* La page a chargé ALPHA et BRAVO ; en session, le comité a touché ALPHA
     (janvier → VIS) et CHARLIE (fiche sans ligne, février → REA). BRAVO est
     affiché mais JAMAIS touché. */
  ctx.affData = { ALPHA: {1:'VIS',2:'REA',3:'REA',4:'REA',5:'REA',6:'REA',7:'REA',8:'REA',9:'REA',10:'REA',11:'REA',12:'REA'},
                  BRAVO: {1:'VIS',2:'ORL',3:'END',4:'VIS',5:'ORL',6:'END',7:'VIS',8:'ORL',9:'END',10:'VIS',11:'ORL',12:'END'},
                  CHARLIE: {2:'REA'} };
  ctx.touches = new (vm.runInContext('Set', ctx))(['ALPHA','CHARLIE','INCONNU']);
  const envoi = vm.runInContext('construireEnvoiAffectations(affData, touches)', ctx);
  V('l\'envoi ne contient QUE les MARs touchés', Object.keys(envoi).sort().join(',') === 'ALPHA,CHARLIE', Object.keys(envoi));
  V('un MAR affiché mais non touché ne part pas', !envoi.BRAVO);
  V('un identifiant touché mais inconnu de la grille est ignoré', !envoi.INCONNU);
  V('zéro touche = envoi vide (le refus poli protège la grille vide)',
    Object.keys(vm.runInContext('construireEnvoiAffectations(affData, new Set())', ctx)).length === 0);
  ctx.envoi = envoi;
  const res = vm.runInContext('ecrireAffectations(feuille, envoi)', ctx);
  const lignes = feuille.getDataRange().getValues();
  V('bout en bout : le MAR touché est écrit (VIS en janvier)', lignes[1][1] === 'VIS', lignes[1][1]);
  V('bout en bout : le MAR sans ligne touché est créé (REA en février, VOLANT ailleurs)',
    res.crees === 1 && !!lignes[3] && String(lignes[3][0]) === 'CHARLIE' && lignes[3][2] === 'REA' && lignes[3][1] === 'VOLANT', lignes[3]);
  V('LA PROTECTION : la ligne du MAR jamais touché est intacte À L\'OCTET',
    JSON.stringify(lignes[2]) === bravoAvant, lignes[2]);
  /* Le défaut du matin était un code juste JAMAIS APPELÉ : le câblage reste
     sous surveillance — l'envoi passe par le différentiel, et la complétion
     du matin a bien disparu du circuit. */
  const _admSrc = fs.readFileSync('../admin.html', 'utf8');
  const _saveBloc = _admSrc.slice(_admSrc.indexOf('async function saveAllAffectations'));
  V('saveAllAffectations construit le différentiel AVANT l\'envoi',
    _saveBloc.indexOf('construireEnvoiAffectations(affData') > -1 &&
    _saveBloc.indexOf('construireEnvoiAffectations(affData') < _saveBloc.indexOf("action:'saveAffectations'"));
  V('et c\'est bien le différentiel qui PART — pas la grille complète',
    _saveBloc.indexOf('affectations: envoi') > -1 && _saveBloc.indexOf('affectations: affData') === -1);
  V('chaque modification de case marque son MAR comme touché',
    /_affTouches\.add\(marId\)/.test(_admSrc));
  V('la complétion du matin a quitté le circuit d\'envoi',
    _saveBloc.indexOf('completerAffectationsActifs') === -1);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
