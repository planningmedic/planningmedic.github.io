/* ═══ BANC — LES RÉCUPÉRATIONS DE SAMEDI SE RÈGLENT TOUTES SEULES (11/11/2026) ═══
   Défaut trouvé en production le 11/11/2026 (année 2027) : quatre récupérations
   à régler, une seule tracée. Trois R écrasés en silence par des dons acceptés
   sur des jours de récupération ; un samedi donné dont le R n'avait pas suivi,
   laissant un R EN TROP au donneur et un lien samedi → R faux ; et un bouton
   « Récup » annoncé par l'écran mais absent (le serveur refusait le code R).

   Le VRAI code : echanges.gs entier, applyModification et appliquerStatutJour
   (gardes.gs), getJoursFeries (code.gs), dans un classeur simulé d'un an,
   vingt MAR, et les vacances scolaires 2027 (calendrier public).
   Ce qui est éprouvé : les règles de choix d'une date (jamais pendant les
   vacances scolaires, plancher de quinze présents, deux R au plus par jour,
   trois jours d'écart, jamais sur une case occupée, d'abord un jour qui allonge
   un week-end libre), les trois chemins automatiques (samedi qui change de
   mains, R écrasé par un don, bouton Réparer), la pose manuelle d'un R qui
   recolle son lien, et la présence des boutons dans les pages. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
const { MARS } = require('./jeu_donnees');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const GAS = path.join(__dirname, '..', 'gas');
const AUJOURDHUI = '2026-11-11';   // date figée : le banc ne vieillit pas
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

function monde(opts) {
  opts = opts || {};
  VERROUS.script = false; VERROUS.document = false;
  const annee = 2027;
  const debut = new Date(2027, 0, 4, 12, 0, 0);          // premier lundi de 2027
  const dates = [];
  for (let i = 0; i < 364; i++) { const d = new Date(debut); d.setDate(d.getDate() + i); dates.push(iso(d)); }
  const mars = MARS.slice(0, 20);
  const cl = new Classeur();
  cl.ajouter('CONFIG', [['CLE', 'VALEUR']]);
  // Géométrie réelle de GARDES : 3 lignes d'en-tête pleines, la date i en colonne i+1.
  cl.ajouter('GARDES_2027', [['MEDECIN'].concat(dates.map(() => 'm')), ['JOUR'].concat(dates.map(() => 'j')), ['N°'].concat(dates.map(() => 'n'))]
    .concat(mars.map(id => [id].concat(dates.map(() => '')))));
  cl.ajouter('INDISPOS_2027', [['', ''], ['', ''], ['MAR', '']].concat(mars.map(id => [id].concat(dates.map(() => '')))));
  cl.ajouter('PERIODES_VAC', [['NOM', 'DATE_DEBUT', 'DATE_FIN', 'SEUIL'],
    ['Hiver', '2027-02-20', '2027-03-07', 8], ['Printemps', '2027-04-17', '2027-05-02', 8],
    ['Été', '2027-07-03', '2027-09-01', 10], ['Toussaint', '2027-10-23', '2027-11-07', 8], ['Noël', '2027-12-18', '2028-01-02', 11]]);
  if (opts.liens) cl.ajouter('LIENS_R_2027', [['SAMEDI', 'MEDECIN', 'DATE R']].concat(opts.liens));

  const notifs = [], journal = [], republie = [];
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'ECHANGES_OUVERTS' ? 'O' : null), setProperty: () => {}, deleteProperty: () => {} }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    Utilities: { formatDate: (d) => (Math.abs(new Date(d) - Date.now()) < 60000 ? AUJOURDHUI : iso(new Date(d))) },
    Logger: { log: () => {} }, logAction: m => journal.push(String(m)),
    MailApp: { sendEmail: () => {}, getRemainingDailyQuota: () => 100 },
    TEST_YEAR: 2026,
    generatePlanning: y => republie.push(y), notifPlanifier: () => {},
    notifierPush_: (titre, corps, url, cible) => { notifs.push({ titre, corps, cible }); return { success: true }; },
    _miroirEnvoyerLot_: () => ({ success: true }),
    // appliquerStatutJour : ses voisins hors sujet
    retirerPlacementsPourDates: () => 0, getIndisposForDoctor: () => ({}), saveIndisposForDoctor: () => {},
  });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction(path.join(GAS, 'gardes.gs'), 'applyModification'), ctx);
  vm.runInContext(extraireFonction(path.join(GAS, 'gardes.gs'), 'appliquerStatutJour'), ctx);
  vm.runInContext(extraireFonction(path.join(GAS, 'code.gs'), 'buildDateToCol'), ctx);
  vm.runInContext(extraireFonction(path.join(GAS, 'code.gs'), 'getPremierJourPlanning'), ctx);
  vm.runInContext(extraireFonction(path.join(GAS, 'code.gs'), 'getJoursFeries'), ctx);
  vm.runInContext(fs.readFileSync(path.join(GAS, 'echanges.gs'), 'utf8'), ctx);

  const f = nom => cl.getSheetByName(nom);
  const ligne = id => f('GARDES_2027').lignes.findIndex(l => String(l[0]).trim() === id);
  const poser = (id, d, code) => { f('GARDES_2027').lignes[ligne(id)][dates.indexOf(d) + 1] = code; };
  const lire = (id, d) => String(f('GARDES_2027').lignes[ligne(id)][dates.indexOf(d) + 1] || '');
  // La doublure transforme les dates en VRAIES dates (pire cas de Sheets) : on relit en texte.
  const liens = () => (f('LIENS_R_2027') ? f('LIENS_R_2027').lignes.slice(1).map(l => l.slice(0, 3).map(v => v instanceof Date ? iso(v) : String(v == null ? '' : v))) : []);
  const R = id => dates.filter(d => lire(id, d) === 'R');
  const run = code => vm.runInContext(code, ctx);
  const choisir = (id, samedi) => run(`_recupsChoisir_(_recupsContexte_(2027), ${JSON.stringify(id)}, ${JSON.stringify(samedi)})`);
  const garde = (id, d) => { poser(id, d, 'G'); const i = dates.indexOf(d); poser(id, dates[i + 1], 'RG'); };
  return { cl, ctx, dates, mars, poser, lire, liens, R, run, choisir, garde, notifs, journal, republie };
}
const user = id => ({ id, role: 'mar' });

console.log('═══ 1. Choix d\'une date : les règles ═══');
{
  const b = monde();
  b.garde('ALPHA', '2027-03-13');
  V('après le samedi, d\'abord un vendredi qui allonge un week-end libre (lun. 15 = repos de garde, mar.-jeu. sans intérêt)',
    b.choisir('ALPHA', '2027-03-13') === '2027-03-19', b.choisir('ALPHA', '2027-03-13'));
  b.poser('ALPHA', '2027-03-19', '18');
  V('jamais sur une case occupée (un 18 h n\'est pas écrasé) : lundi suivant, week-end libre',
    b.choisir('ALPHA', '2027-03-13') === '2027-03-22', b.choisir('ALPHA', '2027-03-13'));
  b.poser('ALPHA', '2027-03-19', '');
  b.poser('BRAVO', '2027-03-19', 'R'); b.poser('CHARLI', '2027-03-19', 'R');
  V('deux R au plus le même jour', b.choisir('ALPHA', '2027-03-13') === '2027-03-22', b.choisir('ALPHA', '2027-03-13'));
  b.poser('BRAVO', '2027-03-19', ''); b.poser('CHARLI', '2027-03-19', '');
  ['DELTA', 'ECHO', 'FOXTRO', 'GOLF', 'HOTEL'].forEach(id => b.poser(id, '2027-03-19', 'V'));
  V('plancher : 15 présents avec lui, il en resterait 14 après sa récupération — la date est refusée',
    b.choisir('ALPHA', '2027-03-13') === '2027-03-22', b.choisir('ALPHA', '2027-03-13'));
  b.poser('HOTEL', '2027-03-19', '');
  V('plancher : 16 présents, il en reste 15 après sa récupération — la date passe',
    b.choisir('ALPHA', '2027-03-13') === '2027-03-19', b.choisir('ALPHA', '2027-03-13'));
  ['DELTA', 'ECHO', 'FOXTRO', 'GOLF'].forEach(id => b.poser(id, '2027-03-19', ''));
  b.poser('ALPHA', '2027-03-22', 'R');
  V('trois jours d\'écart entre deux R du même MAR (R le 22 : ni le 19, ni le 25)',
    b.choisir('ALPHA', '2027-03-13') === '2027-03-26', b.choisir('ALPHA', '2027-03-13'));
}
{
  const b = monde();
  b.garde('ALPHA', '2027-04-17');
  V('JAMAIS pendant les vacances scolaires : samedi du 17/04 → lundi 03/05, premier jour après les vacances',
    b.choisir('ALPHA', '2027-04-17') === '2027-05-03', b.choisir('ALPHA', '2027-04-17'));
  b.garde('BRAVO', '2027-07-10');
  const d = b.choisir('BRAVO', '2027-07-10');
  V('été : rien entre le 03/07 et le 01/09', d >= '2027-09-02', d);
  b.poser('CHARLI', '2027-05-06', 'V');
  b.garde('CHARLI', '2027-04-24');
  V('un jour collé à des congés déjà posés compte comme utile (mer. 05/05, veille de ses vacances, avant le vendredi suivant)',
    b.choisir('CHARLI', '2027-04-24') === '2027-05-03' || b.choisir('CHARLI', '2027-04-24') === '2027-05-05', b.choisir('CHARLI', '2027-04-24'));
  b.garde('DELTA', '2027-11-13');
  V('pont : jeudi 18/11 avant la fête du 19/11 (vendredi férié) — avant tout autre jour',
    b.choisir('DELTA', '2027-11-13') === '2027-11-18', b.choisir('DELTA', '2027-11-13'));
}
{
  const b = monde();
  b.garde('ALPHA', '2027-12-11');
  // Après le 11/12 : vacances de Noël dès le 18/12. Bloquer la semaine du 13 au 17.
  ['2027-12-13', '2027-12-14', '2027-12-15', '2027-12-16', '2027-12-17'].forEach(d => b.poser('ALPHA', d, 'F'));
  const d = b.choisir('ALPHA', '2027-12-11');
  V('rien après le samedi : on remonte AVANT, au plus près (et jamais pendant les vacances)', d && d < '2027-12-11' && d >= '2027-12-01', d);
}

console.log('\n═══ 2. Un samedi donné dont le R ne peut pas suivre : R rendu, R neuf, lien suivi ═══');
{
  const b = monde({ liens: [['2027-03-13', 'ALPHA', '2027-03-19']] });
  b.garde('ALPHA', '2027-03-13'); b.poser('ALPHA', '2027-03-19', 'R');
  b.poser('BRAVO', '2027-03-19', '18');   // le receveur n'est pas libre le jour du R
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:'2027-03-13', receveur:'BRAVO' })`);
  b.notifs.length = 0;
  const rep = b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('le don aboutit', rep.etat === 'acceptee' && b.lire('BRAVO', '2027-03-13') === 'G', rep);
  V('le donneur rend son R (le samedi n\'est plus le sien)', b.lire('ALPHA', '2027-03-19') === '');
  V('le 18 h du receveur n\'est pas écrasé', b.lire('BRAVO', '2027-03-19') === '18');
  V('le receveur a un R neuf, lundi 22/03 (week-end libre)', b.lire('BRAVO', '2027-03-22') === 'R', b.R('BRAVO'));
  V('le lien suit : samedi 13/03 → BRAVO, 22/03', JSON.stringify(b.liens()) === JSON.stringify([['2027-03-13', 'BRAVO', '2027-03-22']]), b.liens());
  V('chacun a autant de R que de samedis', b.R('ALPHA').length === 0 && b.R('BRAVO').length === 1);
  V('le receveur est prévenu de la date', b.notifs.some(n => n.cible.id === 'BRAVO' && /posée le 22\/03\/2027/.test(n.corps)), b.notifs);
  V('le donneur est prévenu du retrait', b.notifs.some(n => n.cible.id === 'ALPHA' && /retirée/.test(n.corps)), b.notifs);
  V('la confirmation ne prétend pas un « transfert » qui n\'a pas eu lieu', !b.notifs.some(n => /est transférée/.test(n.corps)), b.notifs);
  V('la demande garde la trace du R neuf', /R neuf du 2027-03-22/.test(String(b.cl.getSheetByName('ECHANGES').lignes[1][11])), b.cl.getSheetByName('ECHANGES').lignes[1]);
  V('le planning est republié pour 2027', b.republie.filter(y => y === 2027).length >= 2, b.republie);
}

console.log('\n═══ 3. Un don accepté sur un jour de récupération : le R est reposé ailleurs ═══');
{
  /* Le cas réel du 11/11 : un MAR accepte une garde de semaine qui tombe sur sa
     récupération. Avant : le R disparaissait sans trace. */
  const b = monde({ liens: [['2027-03-13', 'BRAVO', '2027-03-23']] });
  b.garde('BRAVO', '2027-03-13'); b.poser('BRAVO', '2027-03-23', 'R');
  b.garde('CHARLI', '2027-03-23');
  const r = b.run(`creerEchange(${JSON.stringify(user('CHARLI'))}, { type:'don', year:2027, date:'2027-03-23', receveur:'BRAVO' })`);
  b.notifs.length = 0;
  const rep = b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('le don aboutit', rep.etat === 'acceptee' && b.lire('BRAVO', '2027-03-23') === 'G', rep);
  V('le R écrasé est reposé : vendredi 19/03 (week-end libre)', b.lire('BRAVO', '2027-03-19') === 'R', b.R('BRAVO'));
  V('le lien suit la nouvelle date', JSON.stringify(b.liens()) === JSON.stringify([['2027-03-13', 'BRAVO', '2027-03-19']]), b.liens());
  V('toujours un R par samedi', b.R('BRAVO').length === 1);
  V('le MAR est prévenu de la nouvelle date', b.notifs.some(n => n.cible.id === 'BRAVO' && /posée le 19\/03\/2027/.test(n.corps)), b.notifs);
  V('la demande le dit', /R de BRAVO reposé le 2027-03-19/.test(String(b.cl.getSheetByName('ECHANGES').lignes[1][11])), b.cl.getSheetByName('ECHANGES').lignes[1]);
}
{
  const b = monde({ liens: [['2027-03-13', 'BRAVO', '2027-03-24']] });
  b.garde('BRAVO', '2027-03-13'); b.poser('BRAVO', '2027-03-24', 'R');
  b.garde('CHARLI', '2027-03-23');
  const r = b.run(`creerEchange(${JSON.stringify(user('CHARLI'))}, { type:'don', year:2027, date:'2027-03-23', receveur:'BRAVO' })`);
  b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('le repos de garde du lendemain écrase un R : reposé lui aussi', b.lire('BRAVO', '2027-03-24') === 'RG' && b.R('BRAVO').length === 1, b.R('BRAVO'));
}

console.log('\n═══ 4. Le bouton « Réparer » ═══');
{
  const b = monde({ liens: [
    ['2027-05-08', 'DELTA', '2027-05-10'],   // R écrasé par une garde
    ['2027-06-12', 'ECHO', '2027-06-14'],    // samedi passé à FOXTRO, R resté chez ECHO
    ['2027-10-02', 'HOTEL', '2027-10-04'],   // sain
  ] });
  b.garde('DELTA', '2027-05-08'); b.poser('DELTA', '2027-05-10', 'G2'); b.poser('DELTA', '2027-05-11', 'RG');
  b.garde('FOXTRO', '2027-06-12'); b.poser('ECHO', '2027-06-14', 'R');
  b.poser('GOLF', '2027-09-18', 'G2'); b.poser('GOLF', '2027-09-19', 'RG');   // samedi sans lien
  b.garde('HOTEL', '2027-10-02'); b.poser('HOTEL', '2027-10-04', 'R');
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) + JSON.stringify(b.liens());
  const ap = b.run('recupsReparer(2027, false)');
  V('l\'aperçu n\'écrit RIEN', JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) + JSON.stringify(b.liens()) === avant);
  V('l\'aperçu ne republie rien et ne prévient personne', b.republie.length === 0 && b.notifs.length === 0);
  const q = ap.actions.map(a => a.quoi + ' ' + a.med).join(', ');
  V('l\'aperçu annonce 4 gestes : 3 poses, 1 retrait', ap.actions.length === 4 && q === 'pose DELTA, retrait ECHO, pose FOXTRO, pose GOLF', q);
  V('aucune date proposée pendant les vacances scolaires', ap.actions.filter(a => a.date).every(a => !(a.date >= '2027-07-03' && a.date <= '2027-09-01') && !(a.date >= '2027-10-23' && a.date <= '2027-11-07')), ap.actions);
  const fait = b.run('recupsReparer(2027, true)');
  V('la réparation fait ce que l\'aperçu annonçait', JSON.stringify(fait.actions) === JSON.stringify(ap.actions), fait.actions);
  V('chaque MAR a autant de R que de samedis tenus', ['DELTA', 'ECHO', 'FOXTRO', 'GOLF', 'HOTEL'].every(id =>
    b.R(id).length === b.dates.filter(d => new Date(d + 'T12:00:00').getDay() === 6 && /^G2?$/.test(b.lire(id, d))).length),
    ['DELTA', 'ECHO', 'FOXTRO', 'GOLF', 'HOTEL'].map(id => id + ':' + b.R(id).join('/')));
  const L = b.liens();
  V('les liens disent la vérité : chaque lien pointe un R du bon MAR', L.length === 4 && L.every(l => b.lire(l[1], l[2]) === 'R'), L);
  V('le lien du samedi passé a changé de MAR', L.some(l => l[0] === '2027-06-12' && l[1] === 'FOXTRO'), L);
  V('le lien sain n\'a pas bougé', L.some(l => l.join() === '2027-10-02,HOTEL,2027-10-04'), L);
  V('une seule republication pour toute la réparation', b.republie.length === 1, b.republie);
  V('les MAR concernés sont prévenus (4), pas les autres', b.notifs.length === 4 && !b.notifs.some(n => n.cible.id === 'HOTEL'), b.notifs.map(n => n.cible.id));
  V('relancée, la vérification ne trouve plus rien', b.run('recupsReparer(2027, false)').actions.length === 0);
}
{
  const b = monde();
  V('sans onglet de liens (année 2026), rien n\'est touché', b.run('recupsReparer(2027, true)').actions.length === 0 && b.republie.length === 0);
}

console.log('\n═══ 5. Le comité pose un R à la main : accepté, lien recollé ═══');
{
  const b = monde({ liens: [['2027-05-08', 'DELTA', '2027-05-10']] });
  b.garde('DELTA', '2027-05-08'); b.poser('DELTA', '2027-05-10', 'G2'); b.poser('DELTA', '2027-05-11', 'RG');
  const res = b.run(`appliquerStatutJour(2027, 'DELTA', 'R', ['2027-05-14'])`);
  V('le serveur accepte le code R', res.applied.length === 1 && b.lire('DELTA', '2027-05-14') === 'R', res);
  V('le lien cassé se recolle sur la date posée', JSON.stringify(b.liens()) === JSON.stringify([['2027-05-08', 'DELTA', '2027-05-14']]), b.liens());
  const res2 = b.run(`appliquerStatutJour(2027, 'DELTA', 'R', ['2027-05-09'])`);
  V('une garde ou un repos de garde reste verrouillé', res2.applied.length === 0, res2);
}

console.log('\n═══ 7. Un don qui écraserait un 18 h : prévenu avant, le 18 h passe au donneur ═══');
{
  /* Le cas réel du 11/11 : don d'une garde du dimanche à un MAR de 18 h le lundi.
     Son repos de garde remplaçait le 18 h sans rien dire. */
  const b = monde();
  b.garde('ALPHA', '2027-05-30'); b.poser('BRAVO', '2027-05-31', '18');
  let err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:'2027-05-30', receveur:'BRAVO' })`); }
  catch (e) { err = String(e.message); }
  V('sans confirmation, la proposition est refusée et le dit (préfixe [18] lu par l\'écran)', /^\[18\] /.test(err) && /31\/05\/2027/.test(err) && /c'est vous qui ferez ce 18 h/.test(err), err);
  V('…et rien n\'est créé', !b.cl.getSheetByName('ECHANGES') || b.cl.getSheetByName('ECHANGES').lignes.slice(1).filter(l => l[0]).length === 0);
  b.notifs.length = 0;
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:'2027-05-30', receveur:'BRAVO', accepte18: true })`);
  V('confirmée, la proposition part', !!r.id);
  V('le receveur lit dans la proposition que son 18 h passera au donneur', b.notifs.some(n => n.cible.id === 'BRAVO' && /votre 18 h du 31\/05\/2027 passe au/.test(n.corps)), b.notifs);
  b.notifs.length = 0;
  b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('à l\'acceptation : garde et repos chez le receveur', b.lire('BRAVO', '2027-05-30') === 'G' && b.lire('BRAVO', '2027-05-31') === 'RG');
  V('le 18 h du lundi passe au donneur — le jour n\'est plus à découvert', String(b.lire('ALPHA', '2027-05-31')) === '18', b.lire('ALPHA', '2027-05-31'));
  V('les deux sont prévenus', b.notifs.some(n => n.cible.id === 'ALPHA' && /Vous faites le 18 h du 31\/05\/2027/.test(n.corps))
    && b.notifs.some(n => n.cible.id === 'BRAVO' && /Votre 18 h du 31\/05\/2027 passe au/.test(n.corps)), b.notifs);
  V('la demande le garde en mémoire', /18 h du 2027-05-31 : BRAVO → ALPHA/.test(String(b.cl.getSheetByName('ECHANGES').lignes[1][11])), b.cl.getSheetByName('ECHANGES').lignes[1]);
}
{
  const b = monde();
  b.garde('ALPHA', '2027-05-26'); b.poser('BRAVO', '2027-05-26', '18');
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:'2027-05-26', receveur:'BRAVO', accepte18: true })`);
  b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('18 h le jour même de la garde : il passe aussi au donneur', b.lire('BRAVO', '2027-05-26') === 'G' && String(b.lire('ALPHA', '2027-05-26')) === '18');
}
{
  const b = monde();
  b.garde('ALPHA', '2027-05-26');
  let err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:'2027-05-26', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('sans 18 h en jeu, aucune confirmation demandée', !err, err);
}

console.log('\n═══ 8. Échanger un 18 h contre un 18 h (demande de l\'équipe, 11/11/2026) ═══');
{
  const b = monde();
  b.poser('ALPHA', '2027-03-10', '18'); b.poser('BRAVO', '2027-03-17', '18');
  b.notifs.length = 0;
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange18', year:2027, date:'2027-03-10', date2:'2027-03-17', receveur:'BRAVO' })`);
  V('la proposition part', !!r.id);
  V('le collègue lit « son 18 h du … contre le vôtre du … »', b.notifs.some(n => n.cible.id === 'BRAVO' && /son 18 h du 10\/03\/2027 contre le vôtre du 17\/03\/2027/.test(n.corps)), b.notifs);
  V('rien n\'est écrit avant l\'acceptation', String(b.lire('ALPHA', '2027-03-10')) === '18' && b.lire('BRAVO', '2027-03-10') === '');
  b.notifs.length = 0;
  const rep = b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('accepté : chacun fait le 18 h de l\'autre', rep.etat === 'acceptee'
    && b.lire('ALPHA', '2027-03-10') === '' && String(b.lire('BRAVO', '2027-03-10')) === '18'
    && b.lire('BRAVO', '2027-03-17') === '' && String(b.lire('ALPHA', '2027-03-17')) === '18', rep);
  V('les deux sont prévenus', b.notifs.filter(n => /18 h échangés/.test(n.corps)).length === 2, b.notifs);
  V('aucun « 18 h perdu » ni report parasite', !b.journal.some(m => /perdu par|repris par l'autre MAR/.test(m)), b.journal.slice(-5));
}
{
  const b = monde();
  b.poser('ALPHA', '2027-03-10', '18'); b.poser('BRAVO', '2027-03-17', '18'); b.poser('BRAVO', '2027-03-10', 'V');
  let err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange18', year:2027, date:'2027-03-10', date2:'2027-03-17', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('refusé dès l\'envoi si le collègue n\'est pas libre le jour qu\'il reçoit', /BRAVO n'est pas libre le 2027-03-10/.test(err), err);
  V('…et rien n\'est créé', !b.cl.getSheetByName('ECHANGES') || b.cl.getSheetByName('ECHANGES').lignes.slice(1).filter(l => l[0]).length === 0);
  b.poser('BRAVO', '2027-03-10', '');
  b.poser('ALPHA', '2027-03-10', '');
  err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange18', year:2027, date:'2027-03-10', date2:'2027-03-17', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('refusé si la date proposée n\'est pas un 18 h du demandeur', /ALPHA n'est pas de 18 h le 2027-03-10/.test(err), err);
  b.poser('ALPHA', '2027-03-10', '18'); b.garde('ALPHA', '2027-03-17');
  err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange18', year:2027, date:'2027-03-10', date2:'2027-03-17', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('jamais un 18 h sur une garde : refusé', /ALPHA n'est pas libre le 2027-03-17 \(G\)/.test(err), err);
}

console.log('\n═══ 8 bis. Donner un 18 h (demande de l\'équipe, 12/11/2026) ═══');
{
  const b = monde();
  b.poser('ALPHA', '2027-03-10', '18');
  b.notifs.length = 0;
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' })`);
  V('don de 18 h : la proposition part, sans seconde date', !!r.id);
  V('don de 18 h : le collègue lit « vous propose son 18 h du … »', b.notifs.some(n => n.cible.id === 'BRAVO' && n.titre === 'Proposition de 18 h' && /vous propose son 18 h du 10\/03\/2027\./.test(n.corps)), b.notifs);
  V('don de 18 h : rien n\'est écrit avant l\'acceptation', String(b.lire('ALPHA', '2027-03-10')) === '18' && b.lire('BRAVO', '2027-03-10') === '');
  let err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('don de 18 h : le même 18 h ne se propose pas deux fois au même collègue', /Vous avez déjà proposé ce 18 h/.test(err), err);
  b.notifs.length = 0;
  const rep = b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('don de 18 h accepté : le 18 h passe au receveur, le donneur est libre', rep.etat === 'acceptee'
    && b.lire('ALPHA', '2027-03-10') === '' && String(b.lire('BRAVO', '2027-03-10')) === '18', rep);
  V('don de 18 h : les deux sont prévenus (« Le 18 h du … passe du … au … »)', b.notifs.filter(n => /Le 18 h du 10\/03\/2027 passe du Dr Alpha au Dr Bravo\./.test(n.corps)).length === 2, b.notifs);
  V('don de 18 h : aucun « 18 h perdu » ni report parasite', !b.journal.some(m => /perdu par|repris par l'autre MAR/.test(m)), b.journal.slice(-5));
}
{
  const b = monde();
  b.poser('ALPHA', '2027-03-10', '18'); b.poser('BRAVO', '2027-03-10', 'V');
  let err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('don de 18 h refusé dès l\'envoi si le collègue est en vacances ce jour-là', /BRAVO n'est pas libre le 2027-03-10 \(V\)/.test(err), err);
  b.poser('BRAVO', '2027-03-10', ''); b.garde('BRAVO', '2027-03-10');
  err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' })`); } catch (e) { err = e.message; }
  V('don de 18 h refusé si le collègue est de garde ce jour-là', /BRAVO n'est pas libre le 2027-03-10 \(G2?\)/.test(err), err);
  V('…et rien n\'est créé', !b.cl.getSheetByName('ECHANGES') || b.cl.getSheetByName('ECHANGES').lignes.slice(1).filter(l => l[0]).length === 0);
  err = '';
  try { b.run(`creerEchange(${JSON.stringify(user('BRAVO'))}, { type:'don18', year:2027, date:'2027-03-11', receveur:'ALPHA' })`); } catch (e) { err = e.message; }
  V('don de 18 h refusé si la date n\'est pas un 18 h du demandeur', /BRAVO n'est pas de 18 h le 2027-03-11/.test(err), err);
}
{
  // Le planning bouge entre la proposition et la réponse : la demande se ferme seule.
  const b = monde();
  b.poser('ALPHA', '2027-03-10', '18');
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' })`);
  b.poser('ALPHA', '2027-03-10', '');
  b.run('_echangesSansObjet_()');
  const l = b.cl.getSheetByName('ECHANGES').lignes.slice(1).find(x => x[0] === r.id);
  V('don de 18 h : le donneur n\'a plus ce 18 h → demande « sans objet », motif « n\'a plus le 18 h »', !!l && l.indexOf('sansobjet') > -1 && l.some(c => /n'a plus le 18 h du 10\/03\/2027/.test(String(c))), l);
}

console.log('\n═══ 8 ter. Deux 18 h de suite ou la même semaine : dit au MAR, qui confirme (12/11/2026) ═══');
{
  const creer = (b, qui, p) => { try { return { r: b.run(`creerEchange(${JSON.stringify(user(qui))}, ${JSON.stringify(p)})`) }; } catch (e) { return { q: e.message }; } };
  const repondre = (b, qui, p) => { try { return { r: b.run(`repondreEchange(${JSON.stringify(user(qui))}, ${JSON.stringify(p)})`) }; } catch (e) { return { q: e.message }; } };
  // 2027-03-08 est un lundi. A. DON : le receveur est déjà de 18 h la veille.
  let b = monde();
  b.poser('ALPHA', '2027-03-10', '18'); b.poser('BRAVO', '2027-03-09', '18');
  b.notifs.length = 0;
  let c = creer(b, 'ALPHA', { type:'don18', year:2027, date:'2027-03-10', receveur:'BRAVO' });
  V('A. la proposition part (le donneur n\'est pas concerné)', !!(c.r && c.r.id), c);
  V('A. la notification prévient le receveur : « deux 18 h de suite »', b.notifs.some(n => n.cible.id === 'BRAVO' && /Attention, avec le 18 h du 10\/03\/2027 vous ferez deux 18 h de suite \(vous êtes déjà de 18 h le 09\/03\/2027\)\./.test(n.corps)), b.notifs);
  let a = repondre(b, 'BRAVO', { id:c.r.id, reponse:'accepter' });
  V('A. accepter sans confirmer → la question [18H]', /^\[18H\] Attention, avec le 18 h du 10\/03\/2027 vous ferez deux 18 h de suite \(vous êtes déjà de 18 h le 09\/03\/2027\)\. Vous confirmez \?$/.test(a.q || ''), a);
  V('A. rien n\'est écrit, la demande attend toujours', String(b.lire('ALPHA', '2027-03-10')) === '18' && b.lire('BRAVO', '2027-03-10') === ''
    && b.cl.getSheetByName('ECHANGES').lignes.slice(1).some(l => l[0] === c.r.id && l.indexOf('attente') > -1));
  a = repondre(b, 'BRAVO', { id:c.r.id, reponse:'accepter', accepte18h:true });
  V('A. confirmé : le 18 h passe, jamais bloquant', a.r && a.r.etat === 'acceptee' && String(b.lire('BRAVO', '2027-03-10')) === '18', a);
  V('A. le suivi de la demande garde la trace', b.cl.getSheetByName('ECHANGES').lignes.slice(1).some(l => l.some(x => /⚠ deux 18 h de suite pour BRAVO \(2027-03-09, 2027-03-10\)/.test(String(x)))), b.cl.getSheetByName('ECHANGES').lignes.slice(1));

  // B. DON : même semaine, pas de suite (lundi et jeudi).
  b = monde();
  b.poser('ALPHA', '2027-03-11', '18'); b.poser('BRAVO', '2027-03-08', '18');
  c = creer(b, 'ALPHA', { type:'don18', year:2027, date:'2027-03-11', receveur:'BRAVO' });
  a = repondre(b, 'BRAVO', { id:c.r.id, reponse:'accepter' });
  V('B. même semaine → « deux 18 h la même semaine »', /^\[18H\] Attention, avec le 18 h du 11\/03\/2027 vous ferez deux 18 h la même semaine \(vous êtes déjà de 18 h le 08\/03\/2027\)/.test(a.q || ''), a);

  // C. CONTRE-PREUVE : un 18 h la semaine d'avant (vendredi → lundi) ne déclenche rien.
  b = monde();
  b.poser('ALPHA', '2027-03-15', '18'); b.poser('BRAVO', '2027-03-12', '18');
  c = creer(b, 'ALPHA', { type:'don18', year:2027, date:'2027-03-15', receveur:'BRAVO' });
  a = repondre(b, 'BRAVO', { id:c.r.id, reponse:'accepter' });
  V('C. CONTRE-PREUVE : vendredi puis lundi suivant → aucune question', a.r && a.r.etat === 'acceptee', a);

  // D. ÉCHANGE : le demandeur est interrogé à l'envoi ; le 18 h qu'il rend ne compte pas.
  b = monde();
  b.poser('ALPHA', '2027-03-09', '18'); b.poser('ALPHA', '2027-03-18', '18'); b.poser('BRAVO', '2027-03-17', '18');
  c = creer(b, 'ALPHA', { type:'echange18', year:2027, date:'2027-03-09', date2:'2027-03-17', receveur:'BRAVO' });
  V('D. échange : le demandeur est interrogé avant l\'envoi, rien ne part', /^\[18H\] Attention, avec le 18 h du 17\/03\/2027 vous ferez deux 18 h de suite \(vous êtes déjà de 18 h le 18\/03\/2027\)/.test(c.q || '')
    && (!b.cl.getSheetByName('ECHANGES') || b.cl.getSheetByName('ECHANGES').lignes.slice(1).filter(l => l[0]).length === 0), c);
  c = creer(b, 'ALPHA', { type:'echange18', year:2027, date:'2027-03-09', date2:'2027-03-17', receveur:'BRAVO', accepte18h:true });
  V('D. confirmé : la proposition part', !!(c.r && c.r.id), c);
  b = monde();
  b.poser('ALPHA', '2027-03-09', '18'); b.poser('BRAVO', '2027-03-10', '18');
  c = creer(b, 'ALPHA', { type:'echange18', year:2027, date:'2027-03-09', date2:'2027-03-10', receveur:'BRAVO' });
  V('D. CONTRE-PREUVE : le 18 h rendu dans l\'échange (la veille) ne compte pas', !!(c.r && c.r.id), c);
  a = repondre(b, 'BRAVO', { id:c.r.id, reponse:'accepter' });
  V('D. …ni pour le receveur', a.r && a.r.etat === 'acceptee', a);
}

console.log('\n═══ 9. Les 18 h visibles dans « Mes gardes » (11/11/2026) ═══');
{
  const IDX = path.join(__dirname, '..', 'index.html');
  const pl = (annee, jours) => ({ months: [{ days: jours.map(d => ({ date: d })),
    doctors: [{ id: 'ALPHA', days: jours.map((d, i) => ({ status: i % 2 ? '18' : 'G' })) }, { id: 'BRAVO', days: jours.map(() => ({ status: '18' })) }] }] });
  const c = vm.createContext({ console, Object, Number, String, Array,
    _planCache: { 2027: pl(2027, ['2026-11-02', '2026-11-20', '2027-01-04', '2027-01-05']) },
    _planDejaLa: y => (y === 2028 ? pl(2028, ['2027-12-27', '2028-01-04']) : null),
    _todayStr: () => '2026-11-11', MY_ID: 'ALPHA' });
  vm.runInContext(extraireFonction(IDX, '_ech18De') + '\n' + extraireFonction(IDX, '_mes18'), c);
  const h = vm.runInContext('_mes18()', c).map(x => x.date);
  V('mes 18 h à venir, et seulement les miens (pas ceux d\'un collègue, pas les passés)', JSON.stringify(h) === JSON.stringify(['2026-11-20', '2027-01-05', '2028-01-04']), h);
  const idx = fs.readFileSync(IDX, 'utf8');
  V('la liste « Mes gardes » mêle gardes et 18 h, triés par date, étiquette « 18 h »', /\(MY_GARDES\|\|\[\]\)\.concat\(h18\)\.sort/.test(idx) && /<span class="mg-tag h18">18 h<\/span>/.test(idx));
  V('la carte « Prochaine garde » montre le prochain 18 h', /p18='<br><span style="color:#166534;font-weight:600">18 h · '/.test(idx) && /\+ p18;/.test(idx));
}

console.log('\n═══ 10. Échange de gardes : le repos d\'arrivée n\'écrase plus rien (11/11/2026) ═══');
{
  const essai = (prep) => {
    const b = monde();
    b.garde('ALPHA', '2027-03-09'); b.garde('BRAVO', '2027-03-23');
    prep(b);
    let err = '';
    try { b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:'2027-03-09', date2:'2027-03-23', receveur:'BRAVO' })`); } catch (e) { err = String(e.message); }
    return { b, err };
  };
  /* (11/11/2026) Une absence ne refuse plus : le MAR concerné confirme. Le
     receveur sera interrogé à l'acceptation ; le demandeur l'est dès l'envoi. */
  let t = essai(b => b.poser('BRAVO', '2027-03-10', 'V'));
  V('repos du receveur sur ses vacances : l\'envoi passe (il confirmera en acceptant)', !t.err, t.err);
  t = essai(b => b.poser('ALPHA', '2027-03-24', 'F'));
  V('repos du demandeur sur sa formation : la confirmation lui est demandée à l\'envoi', /^\[ABS\] Attention, vous êtes noté en formation le 24\/03\/2027/.test(t.err), t.err);
  t = essai(b => b.garde('BRAVO', '2027-03-10'));
  V('refusé si le receveur est de garde le lendemain (deux gardes de suite)', /BRAVO est de garde \(G\) le 2027-03-10/.test(t.err), t.err);
  t = essai(b => b.poser('ALPHA', '2027-03-22', 'G'));
  V('refusé si le demandeur est de garde la veille de la garde reçue', /ALPHA est de garde \(G\) le 2027-03-22/.test(t.err), t.err);
  /* (11/11/2026 — vu en réel) Le motif disait « un des médecins a déjà une garde à
     l'autre date » alors que le collègue était en repos de garde : il nomme
     désormais qui, quel jour et pourquoi. */
  t = essai(b => b.garde('BRAVO', '2027-03-08'));   // BRAVO de garde la veille → RG le 09/03
  V('motif clair : le collègue en repos de garde le jour reçu, nommé, date lisible', t.err === 'Dr Bravo est en repos de garde le 09/03/2027 (de garde la veille) : deux gardes de suite sont impossibles — échange impossible', t.err);
  t = essai(b => b.poser('ALPHA', '2027-03-23', '18'));
  V('motif clair : un 18 h sur le jour reçu', /^Dr Alpha est de 18 h le 23\/03\/2027/.test(t.err), t.err);
  V('plus jamais « un des médecins a déjà une garde »', !/Un des médecins/.test(fs.readFileSync(path.join(__dirname, '..', 'gas', 'gardes.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
  t = essai(() => {});
  V('sans conflit, l\'échange se propose comme avant', !t.err, t.err);
}
{
  const b = monde({ liens: [['2027-02-27', 'BRAVO', '2027-03-10']] });
  b.garde('ALPHA', '2027-03-09'); b.garde('BRAVO', '2027-03-23');
  b.poser('BRAVO', '2027-02-27', 'G'); b.poser('BRAVO', '2027-02-28', 'RG'); b.poser('BRAVO', '2027-03-10', 'R');
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:'2027-03-09', date2:'2027-03-23', receveur:'BRAVO' })`);
  b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('un R sur le jour de repos reste permis : il est reposé ailleurs', b.lire('BRAVO', '2027-03-10') === 'RG' && b.R('BRAVO').length === 1, b.R('BRAVO'));
}
{
  const b = monde();
  b.garde('ALPHA', '2027-03-09'); b.garde('BRAVO', '2027-03-23'); b.poser('BRAVO', '2027-03-10', '18');
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:'2027-03-09', date2:'2027-03-23', receveur:'BRAVO' })`);
  b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('un 18 h sur le jour de repos passe à l\'autre MAR, libéré ce jour-là', b.lire('BRAVO', '2027-03-10') === 'RG' && String(b.lire('ALPHA', '2027-03-10')) === '18');
}

console.log('\n═══ 11. Les gestes du COMITÉ ont les mêmes suites (11/11/2026) ═══');
{
  /* Défaut trouvé à la relecture des guides : le comité (admin, « Modifier une
     garde ») passait directement par applyModification, sans aucune suite. */
  const b = monde({ liens: [['2027-03-13', 'ALPHA', '2027-03-19']] });
  b.garde('ALPHA', '2027-03-13'); b.poser('ALPHA', '2027-03-19', 'R');
  const s = b.run(`appliquerGesteComite_({ type:'donGarde', year:2027, date:'2027-03-13', doctorId:'ALPHA', doctorId2:'BRAVO', par:'comité' })`);
  V('don d\'un samedi par le comité : la récup suit, même date', b.lire('BRAVO', '2027-03-19') === 'R' && b.lire('ALPHA', '2027-03-19') === '', s.infos);
  V('le lien suit', JSON.stringify(b.liens()) === JSON.stringify([['2027-03-13', 'BRAVO', '2027-03-19']]), b.liens());
  V('les suites sont rendues en clair pour l\'écran', s.infos.some(t => /R du 2027-03-19 transféré/.test(t)), s.infos);
}
{
  const b = monde({ liens: [['2027-03-13', 'BRAVO', '2027-03-23']] });
  b.garde('BRAVO', '2027-03-13'); b.poser('BRAVO', '2027-03-23', 'R'); b.garde('CHARLI', '2027-03-23');
  b.run(`appliquerGesteComite_({ type:'donGarde', year:2027, date:'2027-03-23', doctorId:'CHARLI', doctorId2:'BRAVO', par:'comité' })`);
  V('don du comité sur un jour de R : le R est reposé', b.lire('BRAVO', '2027-03-23') === 'G' && b.lire('BRAVO', '2027-03-19') === 'R', b.R('BRAVO'));
}
{
  const b = monde();
  b.garde('ALPHA', '2027-05-30'); b.poser('BRAVO', '2027-05-31', '18');
  b.run(`appliquerGesteComite_({ type:'donGarde', year:2027, date:'2027-05-30', doctorId:'ALPHA', doctorId2:'BRAVO', par:'comité' })`);
  V('don du comité qui écrase un 18 h : il passe au donneur', b.lire('BRAVO', '2027-05-31') === 'RG' && String(b.lire('ALPHA', '2027-05-31')) === '18');
}
{
  const b = monde();
  b.garde('ALPHA', '2027-03-09'); b.garde('BRAVO', '2027-03-23'); b.poser('BRAVO', '2027-03-10', 'V');
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  let err = '';
  try { b.run(`appliquerGesteComite_({ type:'echangeGardeJours', year:2027, date:'2027-03-09', date2:'2027-03-23', doctorId:'ALPHA', doctorId2:'BRAVO', par:'comité' })`); } catch (e) { err = e.message; }
  V('un geste refusé lève avec son motif et ne touche à rien', /indisponible \(V\)/.test(err) && JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant, err);
  const g = fs.readFileSync(path.join(GAS, 'gardes.gs'), 'utf8');
  V('le routeur envoie don et échange du comité vers appliquerGesteComite_', /_mod\.type === 'donGarde' \|\| _mod\.type === 'echangeGardeJours'\) && typeof appliquerGesteComite_ === 'function'/.test(g));
  const ad = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  V('l\'écran du comité affiche les suites', /data\.suites\.join\(' · '\)/.test(ad));
  V('l\'avertissement « la récup ne suit pas » ne vaut plus que pour 2026', (ad.match(/Number\(GD\.d1\.slice\(0,4\)\) <= 2026/g) || []).length === 2);
}

console.log('\n═══ 12. Échange samedi ↔ samedi : les R gardent leur date, les liens suivent (11/11/2026) ═══');
{
  /* Vu en réel le 11/11 : un échange de deux samedis accepté ; aucun R ne
     bouge (décision du 12/08), mais LIENS_R pointait toujours l'ancien tenant
     et « Réparer » proposait de retirer et reposer les deux R. */
  const b = monde({ liens: [['2027-03-13', 'ALPHA', '2027-03-15'], ['2027-05-29', 'BRAVO', '2027-05-31']] });
  b.garde('ALPHA', '2027-03-13'); b.poser('ALPHA', '2027-03-15', 'R');
  b.garde('BRAVO', '2027-05-29'); b.poser('BRAVO', '2027-05-31', 'R');
  const r = b.run(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:'2027-03-13', date2:'2027-05-29', receveur:'BRAVO' })`);
  const rep = b.run(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`);
  V('l\'échange passe', rep && rep.etat === 'acceptee' && b.lire('ALPHA', '2027-05-29') === 'G' && b.lire('BRAVO', '2027-03-13') === 'G', rep);
  V('aucun R ne bouge : chacun garde le sien, à sa date',
    JSON.stringify(b.R('ALPHA')) === '["2027-03-15"]' && JSON.stringify(b.R('BRAVO')) === '["2027-05-31"]', [b.R('ALPHA'), b.R('BRAVO')]);
  V('les liens suivent le samedi tenu', JSON.stringify(b.liens()) === JSON.stringify([['2027-05-29', 'ALPHA', '2027-03-15'], ['2027-03-13', 'BRAVO', '2027-05-31']]), b.liens());
  V('« Vérifier » ne signale plus rien', b.run('recupsReparer(2027, false)').actions.length === 0);
}
{
  /* Le cas déjà en place (échange accepté avant ce correctif) : « Réparer »
     recolle les liens, sans retirer ni poser aucun R. */
  const b = monde({ liens: [['2027-05-29', 'ALPHA', '2027-06-07'], ['2027-12-11', 'BRAVO', '2027-12-17']] });
  b.garde('BRAVO', '2027-05-29'); b.garde('ALPHA', '2027-12-11');
  b.poser('ALPHA', '2027-06-07', 'R'); b.poser('BRAVO', '2027-12-17', 'R');
  const grille = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const ap = b.run('recupsReparer(2027, false)').actions;
  V('aperçu : deux rattachements, aucun retrait, aucune pose', ap.length === 2 && ap.every(a => a.quoi === 'relien'), ap);
  const fait = b.run('recupsReparer(2027, true)').actions;
  V('réparé : la grille est INTACTE (dates des R inchangées)', JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === grille && fait.length === 2);
  V('les liens pointent le samedi tenu', JSON.stringify(b.liens()) === JSON.stringify([['2027-12-11', 'ALPHA', '2027-06-07'], ['2027-05-29', 'BRAVO', '2027-12-17']]), b.liens());
  V('aucune notification ni republication pour un simple rattachement', b.notifs.length === 0 && b.republie.length === 0, b.notifs);
  V('relancé : plus rien à corriger', b.run('recupsReparer(2027, false)').actions.length === 0);
}
{
  /* Contre-épreuve : un DON de samedi dont le R n'a pas suivi reste traité
     comme avant (retrait au donneur, R neuf au receveur). */
  const b = monde({ liens: [['2027-03-13', 'ALPHA', '2027-03-19']] });
  b.garde('BRAVO', '2027-03-13'); b.poser('ALPHA', '2027-03-19', 'R');
  const ap = b.run('recupsReparer(2027, false)').actions;
  V('don : retrait au donneur et pose au receveur, pas de rattachement', ap.some(a => a.quoi === 'retrait' && a.med === 'ALPHA') && ap.some(a => a.quoi === 'pose' && a.med === 'BRAVO') && !ap.some(a => a.quoi === 'relien'), ap);
  const m = fs.readFileSync(path.join(__dirname, '..', 'maintenance.html'), 'utf8');
  V('la page Maintenance affiche le rattachement', /a\.quoi === 'relien'/.test(m));
}

console.log('\n═══ 6. Les pages ═══');
{
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  V('onglet Statuts : le bouton « Récup » existe', /const STAT_POSABLES = \[[^\]]*'R'[^\]]*\]/.test(admin));
  V('le bandeau compte aussi les récupérations en trop', /recupsEcarts\(\)\s*:\s*\[\]/.test(admin) && /en trop/.test(admin));
  const m = fs.readFileSync(path.join(__dirname, '..', 'maintenance.html'), 'utf8');
  V('page Maintenance : Vérifier et Réparer', /id="btnRecVerif"/.test(m) && /id="btnRecRep"/.test(m));
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  V('portail : un refus [18] affiche l\'avertissement et demande la confirmation', /\/\^\\\[18\\\] \/\.test\(r\.error/.test(idx) && /Confirmer : je ferai ce 18 h/.test(idx));
  V('portail : la confirmation part avec la demande (accepte18)', /if \(ECH_PROP\.ok18\) charge\.accepte18 = true;/.test(idx));
  V('portail : changer de garde ou de collègue redemande la confirmation', /ECH_PROP\.ok18 = false;/.test(idx));
  V('portail : mes 18 h sont proposables, échangés contre un 18 h du collègue', /st==='18'\) && m\.days\[i\]/.test(idx) && /function _ech18De\(/.test(idx) && /echanger \? 'echange18' : 'don18'/.test(idx) && /Contre son 18 h du/.test(idx));
  V('portail : la question [18H] est lue en proposant et en acceptant, le bouton devient « Confirmer : je prends ce 18 h »', (idx.match(/\/\^\\\[18H\\\] \/\.test\(r\.error/g) || []).length === 2 && (idx.match(/Confirmer : je prends ce 18 h/g) || []).length === 2
    && /if \(ECH_PROP\.ok18h\) charge\.accepte18h = true;/.test(idx) && /if \(confirme18h === true\) charge\.accepte18h = true;/.test(idx) && /ECH_PROP\.ok18h = false;/.test(idx));
  V('portail : la liste affiche « Don de 18 h »', /e\.type==='don18' \? 'Don de 18 h — '/.test(idx));
  V('portail : la liste affiche « Échange de 18 h »', /e\.type==='echange18' \? 'Échange de 18 h — '/.test(idx));
  V('Réparer demande deux appuis et envoie l\'année', /deuxAppuis\(\$\('btnRecRep'\)/.test(m) && /action:'recupsReparer', appliquer: true, year: y/.test(m));
}

console.log(`\n${ko ? '✗' : '✓'} ${ok} vérifications, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
