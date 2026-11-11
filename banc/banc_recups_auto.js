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

console.log('\n═══ 6. Les pages ═══');
{
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  V('onglet Statuts : le bouton « Récup » existe', /const STAT_POSABLES = \[[^\]]*'R'[^\]]*\]/.test(admin));
  V('le bandeau compte aussi les récupérations en trop', /recupsEcarts\(\)\s*:\s*\[\]/.test(admin) && /en trop/.test(admin));
  const m = fs.readFileSync(path.join(__dirname, '..', 'maintenance.html'), 'utf8');
  V('page Maintenance : Vérifier et Réparer', /id="btnRecVerif"/.test(m) && /id="btnRecRep"/.test(m));
  V('Réparer demande deux appuis et envoie l\'année', /deuxAppuis\(\$\('btnRecRep'\)/.test(m) && /action:'recupsReparer', appliquer: true, year: y/.test(m));
}

console.log(`\n${ko ? '✗' : '✓'} ${ok} vérifications, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
