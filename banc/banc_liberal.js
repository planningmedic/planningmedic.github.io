/* ═══ BANC — MODULE LIBÉRAL ═══
   Le relevé mensuel du groupement : ce que le classeur rend vraiment, et ce
   que les deux écrans qui le lisent (suivi-liberal.html, absences.html) en
   font. Défaut fondateur, constaté à l'écran le 17/08/2026 : le mois écrit
   « 2026-07 » revenait sous forme de DATE, la page affichait
   « cumul janvier → undefined Wed », et le « dernier mois » — choisi par un
   tri alphabétique — comparait des noms de jours anglais.
   Ce fichier fait tourner le VRAI getReleveLiberal du dépôt sur un classeur
   qui se comporte comme le vrai Sheets (la doublure coerce « 2026-07 » en
   date, exactement comme Google). */
const vm = require('vm'), fs = require('fs');
const { Classeur, extraireFonction, socleMedecins } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

/* Les constantes du fichier de production (en-têtes d'onglet) sont reprises
   TELLES QUELLES : les recopier ici les ferait diverger en silence. */
function extraireConst(fichier, nom) {
  const src = fs.readFileSync(fichier, 'utf8');
  const i = src.indexOf('const ' + nom);
  if (i < 0) throw new Error(nom + ' introuvable dans ' + fichier);
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '[' || c === '(') prof++;
    else if (c === ']' || c === ')') prof--;
    else if (c === ';' && prof === 0) return src.slice(i, j + 1);
  }
  throw new Error(nom + ' : fin de déclaration introuvable');
}

const MEMBRES = ['ALPHA', 'BRAVO', 'CHARLIE'];

function monde(annee) {
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [['ID', 'NOM', 'INITIALES', 'ACTIF', 'LIBERAL']]
    .concat(MEMBRES.map(id => [id, 'Dr ' + id, id.slice(0, 2), 'O', 'O']))
    .concat([['DELTA', 'Dr DELTA', 'DE', 'O', 'N']]));           // hors groupement
  const MOIS = ['JAN', 'FEV', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOUT', 'SEPT', 'OCT', 'NOV', 'DEC'];
  cl.ajouter('AFFECTATIONS_' + annee, [['MAR'].concat(MOIS.map(m => m + ' ' + annee))]
    .concat(MEMBRES.map(id => [id].concat(MOIS.map(() => 'ORL')))));

  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN, isFinite, parseInt, parseFloat, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    Utilities: { formatDate: (d, tz, f) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) },
  });
  ctx.globalThis = ctx;
  socleMedecins(ctx);   // (14/09/2026) COL_MED, _medecinsRows_, _medecinsInvalider_ (code.gs)
  ['LIBERAL_CA_HEADER'].forEach(n => vm.runInContext(extraireConst('../gas/portail.gs', n), ctx));
  ['_libCaSheetName', '_membresLiberal_', 'getOrCreateLiberalCaTab', '_libMoisISO_',
   '_todayISO_', '_libYearOf', 'getReleveLiberal']
    .forEach(n => vm.runInContext(extraireFonction('../gas/portail.gs', n), ctx));
  return { cl, ctx, annee };
}

/* Écrit une ligne de relevé comme le responsable le fait à la main : on ne touche QUE
   les six nombres, la colonne MOIS reste celle que le code a posée. */
function saisir(cl, annee, mois, marId, tCcam, pctCcam, excCcam) {
  const sh = cl.getSheetByName('LIBERAL_CA_' + annee);
  const cible = String(mois);
  for (let r = 1; r < sh.lignes.length; r++) {
    const m = sh.lignes[r][0];
    const iso = (m && typeof m.getFullYear === 'function')
      ? m.getFullYear() + '-' + ('0' + (m.getMonth() + 1)).slice(-2) : String(m);
    if (iso === cible && String(sh.lignes[r][1]).trim() === marId) {
      sh.lignes[r][2] = tCcam; sh.lignes[r][3] = pctCcam; sh.lignes[r][4] = excCcam;
      return true;
    }
  }
  return false;
}

console.log('\n═══ 1. Le relevé créé par le code se relit au bon format ═══');
{
  const { cl, ctx, annee } = monde(2026);
  vm.runInContext('getOrCreateLiberalCaTab(' + annee + ')', ctx);
  const sh = cl.getSheetByName('LIBERAL_CA_' + annee);
  V('l\'onglet est pré-rempli : 12 mois × 3 membres', sh.lignes.length === 1 + 36, sh.lignes.length);
  V('le non-membre du groupement n\'y figure pas',
    !sh.lignes.some(l => String(l[1]) === 'DELTA'));

  /* LE PIÈGE : la colonne MOIS n'est PAS du texte dans le classeur. La
     doublure coerce comme le vrai Sheets ; si un jour ce n'était plus vrai,
     cette vérification le dirait — sans elle, tout ce qui suit ne prouve rien. */
  V('⚠ le classeur a bien transformé « 2026-01 » en DATE (comme le vrai Sheets)',
    !!(sh.lignes[1][0] && typeof sh.lignes[1][0].getFullYear === 'function'), String(sh.lignes[1][0]));

  V('saisie de juin acceptée', saisir(cl, annee, '2026-06', 'ALPHA', 10000, 35.8, 1200));
  const r = vm.runInContext('getReleveLiberal({year:2026})', ctx);
  V('le relevé remonte la seule ligne saisie', r.items.length === 1, r.items.length);
  V('le mois revient au format AAAA-MM, jamais une date bavarde',
    /^\d{4}-\d{2}$/.test(r.items[0].mois), r.items[0].mois);
  V('c\'est bien juin', r.items[0].mois === '2026-06', r.items[0].mois);
  /* Ce que fait la page pour écrire « cumul janvier → juin » : sans un mois
     numérique, elle affichait « undefined ». */
  const mm = parseInt(r.items[0].mois.slice(5, 7), 10);
  V('la page peut en tirer un numéro de mois lisible (1-12)', mm === 6, mm);
  V('le nom du membre accompagne l\'identifiant', r.items[0].nom === 'Dr ALPHA', r.items[0].nom);
}

console.log('\n═══ 2. Le dernier mois saisi est le plus RÉCENT, pas le plus alphabétique ═══');
/* Cœur du défaut : les deux écrans retiennent le dernier mois par
   `items.map(i => i.mois).sort().pop()`. Avec des dates, ce tri comparait
   « Sat Aug… » à « Wed Jul… » et gardait juillet. On rejoue tous les couples
   de mois de 2026 : aucun ne doit se tromper. */
{
  const { cl, ctx, annee } = monde(2026);
  vm.runInContext('getOrCreateLiberalCaTab(' + annee + ')', ctx);
  for (let m = 1; m <= 12; m++) {
    const mois = '2026-' + ('0' + m).slice(-2);
    saisir(cl, annee, mois, 'ALPHA', 1000 * m, 30 + m, 100 * m);
  }
  const r = vm.runInContext('getReleveLiberal({year:2026})', ctx);
  V('les 12 mois saisis remontent', r.items.length === 12, r.items.length);
  const dernier = r.items.map(i => i.mois).sort().pop();     // la ligne exacte des deux pages
  V('le tri des pages retient DÉCEMBRE, pas juillet', dernier === '2026-12', dernier);

  const suite = r.items.map(i => i.mois).sort();
  V('les mois sortent dans l\'ordre du calendrier',
    suite.join(',') === Array.from({length:12}, (_,i) => '2026-' + ('0'+(i+1)).slice(-2)).join(','), suite);
}

console.log('\n═══ 3. Août ne doit plus se faire voler la vedette par juillet ═══');
/* Le cas exact qui allait se produire : le relevé d'août recopié en
   septembre, la page continuant d'afficher juillet sans rien dire. */
{
  const { cl, ctx, annee } = monde(2026);
  vm.runInContext('getOrCreateLiberalCaTab(' + annee + ')', ctx);
  saisir(cl, annee, '2026-07', 'ALPHA', 10000, 36.0, 1500);
  saisir(cl, annee, '2026-08', 'ALPHA', 12000, 34.0, 1300);
  const r = vm.runInContext('getReleveLiberal({year:2026})', ctx);
  const dernier = r.items.map(i => i.mois).sort().pop();
  V('août l\'emporte sur juillet', dernier === '2026-08', dernier);
  const lignes = r.items.filter(i => i.mois === dernier);
  V('la page n\'affiche que les lignes du mois retenu', lignes.length === 1 && lignes[0].pctCcam === 34.0, lignes);
}

console.log('\n═══ 4. Un mois saisi autrement reste lisible ═══');
{
  const { cl, ctx, annee } = monde(2026);
  vm.runInContext('getOrCreateLiberalCaTab(' + annee + ')', ctx);
  const sh = cl.getSheetByName('LIBERAL_CA_' + annee);
  // ligne 2 : mois réécrit à la main en TEXTE (format texte forcé dans Sheets)
  sh.lignes[1][0] = '2026-01'; sh.lignes[1][2] = 5000; sh.lignes[1][3] = 25;
  // ligne 3 : mois posé sur un jour quelconque du mois (saisie « 15/02/2026 »)
  sh.lignes[2][0] = new Date(2026, 1, 15); sh.lignes[2][2] = 6000; sh.lignes[2][3] = 26;
  const r = vm.runInContext('getReleveLiberal({year:2026})', ctx);
  const mois = r.items.map(i => i.mois).sort();
  V('un mois resté en texte est accepté tel quel', mois.indexOf('2026-01') >= 0, mois);
  V('une date au 15 du mois est ramenée au mois', mois.indexOf('2026-02') >= 0, mois);
  V('aucun mois illisible ne passe', r.items.every(i => /^\d{4}-\d{2}$/.test(i.mois)), mois);
}

console.log('\n═══ 5. Ce qui n\'est pas saisi n\'existe pas ═══');
{
  const { cl, ctx, annee } = monde(2026);
  vm.runInContext('getOrCreateLiberalCaTab(' + annee + ')', ctx);
  const r = vm.runInContext('getReleveLiberal({year:2026})', ctx);
  V('un onglet pré-rempli mais vierge ne remonte AUCUNE ligne', r.items.length === 0, r.items.length);
  V('la réponse reste un succès (ce n\'est pas une erreur)', r.success === true);
  const r2 = vm.runInContext('getReleveLiberal({year:2019})', ctx);
  V('une année sans onglet renvoie une liste vide, pas une panne',
    r2.success === true && r2.items.length === 0, r2);
}

console.log('\n═══ 5bis. La fabrique de cotations types ═══');
/* (17/08/2026) L'onglet COTATIONS_TYPE se remplissait A LA MAIN : huit colonnes,
   le bon code CCAM de memoire, « associe » sans accent. Une erreur ne se voyait
   qu'au moment ou quelqu'un cliquait sur le bouton, en consultation.
   Ces verifications portent sur la PORTE (qui peut supprimer) et sur l'ECRITURE
   (une cotation reste une unite : on ne doit jamais en fabriquer une composite). */
{
  const cl = new Classeur();
  cl.ajouter('CONFIG', [['CLE', 'VALEUR'], ['LIBERAL_ADMIN', 'ALPHA']]);
  cl.ajouter('MEDECINS', [['ID', 'NOM', 'ACTIF', 'LIBERAL'],
    ['ALPHA', 'Dr ALPHA', 'O', 'O'], ['BRAVO', 'Dr BRAVO', 'O', 'O']]);
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN, parseInt, parseFloat, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  });
  ctx.globalThis = ctx;
  socleMedecins(ctx);   // (14/09/2026) COL_MED, _medecinsRows_, _medecinsInvalider_ (code.gs)
  ['COTATIONS_TYPE_TAB', '_COTTYPE_HEADER', '_COTTYPE_SEED', '_COTTYPE_ROLES', '_COTTYPE_LC']
    .forEach(n => vm.runInContext(extraireConst('../gas/portail.gs', n), ctx));
  ['_cotTypeFormatTexte_', 'getOrCreateCotationsTypeTab', '_cotTypeTotal_', '_cotTypeRepere_', 'getCotationsType', '_cotTypeAdminId_', '_cotTypeMembre_',
   'listCotationsTypeEdit', '_cotTypeValide_', '_cotTypeLignes_', '_cotTypeRetirer_', 'saveCotationType', 'deleteCotationType']
    .forEach(n => vm.runInContext(extraireFonction('../gas/portail.gs', n), ctx));
  ctx.MAR   = { role:'mar',   id:'ALPHA', liberal:true };
  ctx.AUTRE = { role:'mar',   id:'BRAVO', liberal:true };
  ctx.HORS  = { role:'mar',   id:'CHARLIE', liberal:false };
  ctx.ADMIN = { role:'admin', id:'COMITE' };
  const run = expr => vm.runInContext(expr, ctx);

  // ── La porte ──
  V('un MAR hors groupement ne voit pas la bibliothèque',
    run('listCotationsTypeEdit({}, HORS).success') === false);
  V('le comité non plus — ce n\'est pas son ressort',
    run('listCotationsTypeEdit({}, ADMIN).success') === false);
  V('un membre du groupement la voit', run('listCotationsTypeEdit({}, MAR).success') === true);
  V('les trois cotations d\'endoscopie sont là', run('listCotationsTypeEdit({}, MAR).items.length') === 3);

  // ── Créer ──
  const cree = run(`saveCotationType({groupe:'Ophtalmo', nom:'Cataracte', lc:'CS',
    lignes:[{code:'BFGA004', role:'principal'}]}, AUTRE)`);
  V('n\'importe quel membre peut CRÉER', cree.success === true, cree);
  const apres = run('getCotationsType()');
  const cat = apres.find(c => c.nom === 'Cataracte');
  V('la cotation est relue telle qu\'écrite',
    !!cat && cat.groupe === 'Ophtalmo' && cat.lc === 'CS' && cat.lignes.length === 1, cat);
  V('le modificateur 7 est posé d\'office', !!cat && cat.lignes[0].mod7 === true);
  /* Le modificateur A depend de l'AGE DU PATIENT : il ne peut pas etre fige dans
     une cotation type, il se coche acte par acte au moment de coter. */
  V('le modificateur A, lui, ne l\'est pas', !!cat && cat.lignes[0].modA === false);

  // ── Les refus ──
  V('un code de forme invalide est refusé',
    run(`saveCotationType({groupe:'X', nom:'Y', lc:'', lignes:[{code:'PAS-UN-CODE', role:'principal'}]}, MAR).success`) === false);
  V('un rôle inconnu est refusé',
    run(`saveCotationType({groupe:'X', nom:'Y', lc:'', lignes:[{code:'ABCD001', role:'chef'}]}, MAR).success`) === false);
  V('une cotation sans acte est refusée',
    run(`saveCotationType({groupe:'X', nom:'Y', lc:'CS', lignes:[]}, MAR).success`) === false);
  V('une consultation inconnue est refusée',
    run(`saveCotationType({groupe:'X', nom:'Y', lc:'ZZZ', lignes:[{code:'ABCD001', role:'principal'}]}, MAR).success`) === false);
  V('un homonyme dans le même contexte est refusé, pas écrasé',
    run(`saveCotationType({groupe:'Ophtalmo', nom:'Cataracte', lc:'CS', lignes:[{code:'ABCD001', role:'principal'}]}, MAR).success`) === false);
  V('un MAR hors groupement ne peut rien écrire',
    run(`saveCotationType({groupe:'X', nom:'Y', lc:'CS', lignes:[{code:'ABCD001', role:'principal'}]}, HORS).success`) === false);

  // ── Modifier : une cotation reste UNE unité ──
  const modif = run(`saveCotationType({groupe:'Ophtalmo', nom:'Cataracte', lc:'C',
    lignes:[{code:'BFGA004', role:'principal'}, {code:'ABCD002', role:'associe'}],
    ancienGroupe:'Ophtalmo', ancienNom:'Cataracte'}, MAR)`);
  V('modifier remplace, sans laisser les anciennes lignes', modif.success === true);
  const cat2 = run('getCotationsType()').filter(c => c.nom === 'Cataracte');
  V('il n\'y a toujours QU\'UNE cotation « Cataracte »', cat2.length === 1, cat2.length);
  V('elle porte bien ses deux actes, dans l\'ordre',
    cat2[0].lignes.length === 2 && cat2[0].lignes[0].code === 'BFGA004' && cat2[0].lignes[1].role === 'associe',
    cat2[0].lignes);
  V('la consultation associée a suivi', cat2[0].lc === 'C', cat2[0].lc);

  // ── Renommer ──
  run(`saveCotationType({groupe:'Ophtalmo', nom:'Cataracte simple', lc:'CS',
    lignes:[{code:'BFGA004', role:'principal'}], ancienGroupe:'Ophtalmo', ancienNom:'Cataracte'}, MAR)`);
  const noms = run('getCotationsType()').map(c => c.nom);
  V('renommer ne laisse pas l\'ancien nom derrière',
    noms.indexOf('Cataracte') < 0 && noms.indexOf('Cataracte simple') >= 0, noms);

  // ── Supprimer : réservé ──
  V('un autre membre du groupement ne peut PAS supprimer',
    run(`deleteCotationType({groupe:'Ophtalmo', nom:'Cataracte simple'}, AUTRE).success`) === false);
  V('le responsable, lui, peut',
    run(`deleteCotationType({groupe:'Ophtalmo', nom:'Cataracte simple'}, MAR).success`) === true);
  V('et la cotation a bien disparu',
    run('getCotationsType()').every(c => c.nom !== 'Cataracte simple'));
  V('supprimer deux fois le dit, au lieu de faire semblant',
    run(`deleteCotationType({groupe:'Ophtalmo', nom:'Cataracte simple'}, MAR).success`) === false);
  V('les cotations d\'endoscopie n\'ont pas bougé',
    run('getCotationsType()').filter(c => c.groupe === 'Endoscopie').length === 3);

  /* Sans la clé CONFIG, PERSONNE ne supprime : un droit qui s'ouvrirait tout
     seul par oubli de configuration serait le mauvais défaut. */
  cl.ajouter('CONFIG', [['CLE', 'VALEUR']]);
  V('clé LIBERAL_ADMIN absente : personne ne supprime',
    run(`deleteCotationType({groupe:'Endoscopie', nom:'Colo seule'}, MAR).success`) === false);
  V('et le droit de supprimer n\'est plus annoncé à l\'écran',
    run('listCotationsTypeEdit({}, MAR).peutSupprimer') === false);
}

console.log('\n═══ 5quater. Import des cotations types : colonnes, lot, parseur ═══');
/* (01/10/2026) Trois colonnes de plus dans COTATIONS_TYPE (TOTAL_FR,
   REPERE_BULLE, REPERE_NAS), portées comme LC par la 1re ligne d'une cotation ;
   une écriture EN LOT, tout ou rien ; un parseur qui lit la grille Excel telle
   qu'elle est tenue à la main. Toutes les valeurs ci-dessous sont FICTIVES. */
{
  const { brancherSurEcriture } = require('./stubs');
  const monde5 = (onglet) => {
    const cl = new Classeur();
    cl.ajouter('CONFIG', [['CLE', 'VALEUR'], ['LIBERAL_ADMIN', 'ALPHA']]);
    cl.ajouter('MEDECINS', [['ID', 'NOM', 'ACTIF', 'LIBERAL'], ['ALPHA', 'Dr ALPHA', 'O', 'O'], ['BRAVO', 'Dr BRAVO', 'O', 'O']]);
    if (onglet) cl.ajouter('COTATIONS_TYPE', onglet);
    const ctx = vm.createContext({
      console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN, isFinite, parseInt, parseFloat, RegExp,
      SpreadsheetApp: { getActiveSpreadsheet: () => cl },
      Logger: { log: () => {} },
      LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    });
    ctx.globalThis = ctx;
    socleMedecins(ctx);
    ['COTATIONS_TYPE_TAB', '_COTTYPE_HEADER', '_COTTYPE_SEED', '_COTTYPE_ROLES', '_COTTYPE_LC', '_COTTYPE_LOT_MAX']
      .forEach(n => vm.runInContext(extraireConst('../gas/portail.gs', n), ctx));
    ['_cotTypeFormatTexte_', 'getOrCreateCotationsTypeTab', '_cotTypeTotal_', '_cotTypeRepere_', 'getCotationsType',
     '_cotTypeAdminId_', '_cotTypeMembre_', '_cotTypeValide_', '_cotTypeLignes_', '_cotTypeRetirer_',
     'saveCotationType', 'saveCotationsTypeLot']
      .forEach(n => vm.runInContext(extraireFonction('../gas/portail.gs', n), ctx));
    ctx.MAR = { role:'mar', id:'ALPHA', liberal:true };
    ctx.HORS = { role:'mar', id:'CHARLIE', liberal:false };
    return { cl, run: e => vm.runInContext(e, ctx) };
  };
  const ENTETE11 = 'GROUPE,NOM,ORDRE,CODE,ROLE,MOD7,MODA,LC,TOTAL_FR,REPERE_BULLE,REPERE_NAS';

  // ── Migration douce : onglet en 8 colonnes (état actuel du classeur) ──
  {
    const lignes8 = [['GROUPE','NOM','ORDRE','CODE','ROLE','MOD7','MODA','LC'],
                     ['Essai','Une',1,'HHQE002','principal','O','N','CS'],
                     ['Essai','Une',2,'ZZLP025','associe','O','N','']];
    const { cl, run } = monde5(lignes8);
    run('getOrCreateCotationsTypeTab()');
    const sh = cl.getSheetByName('COTATIONS_TYPE');
    V('8 colonnes → les trois nouvelles s\'ajoutent à droite', sh.lignes[0].join(',') === ENTETE11, sh.lignes[0]);
    V('aucune ligne existante n\'est déplacée ni réécrite',
      sh.lignes[1].slice(0, 8).join(',') === 'Essai,Une,1,HHQE002,principal,O,N,CS' && sh.lignes.length === 3, sh.lignes[1]);
    const c = run('getCotationsType()')[0];
    V('une cotation d\'avant se relit sans total ni repère', c.totalFr === null && c.repereBulle === '' && c.repereNas === '', c);
    run('getOrCreateCotationsTypeTab()');
    V('rejouer la migration ne change rien (pas de colonne en double)',
      sh.lignes[0].join(',') === ENTETE11 && sh.lignes[0].length === 11, sh.lignes[0]);
  }
  // ── Migration de l'onglet d'origine, en 7 colonnes (sans GROUPE) ──
  {
    const { cl, run } = monde5([['NOM','ORDRE','CODE','ROLE','MOD7','MODA','LC'], ['Une',1,'HHQE002','principal','O','N','CS']]);
    run('getOrCreateCotationsTypeTab()');
    const sh = cl.getSheetByName('COTATIONS_TYPE');
    V('7 colonnes → GROUPE inséré en tête ET les trois nouvelles posées', sh.lignes[0].join(',') === ENTETE11, sh.lignes[0]);
    V('la donnée suit sa colonne', sh.lignes[1][0] === 'Endoscopie' && sh.lignes[1][3] === 'HHQE002', sh.lignes[1]);
  }
  // ── Onglet neuf : l'amorce porte bien onze colonnes ──
  {
    const { cl, run } = monde5(null);
    run('getCotationsType()');
    const sh = cl.getSheetByName('COTATIONS_TYPE');
    V('un onglet neuf naît avec onze colonnes, amorce comprise',
      sh.lignes[0].length === 11 && sh.lignes.slice(1).every(l => l.length === 11), sh.lignes.map(l => l.length));
  }

  // ── Aller-retour écriture / lecture ──
  const { cl, run } = monde5(null);
  run('getCotationsType()');
  const w1 = run(`saveCotationType({groupe:'Essai', nom:'Avec total', lc:'CS', totalFr:1234.5,
    repereBulle:'suivant devis OU +50%', repereNas:'150',
    lignes:[{code:'HHQE002', role:'principal'}, {code:'ZZLP025', role:'associe'}]}, MAR)`);
  V('une cotation avec total et repères s\'enregistre', w1.success === true, w1);
  const lu = run('getCotationsType()').find(c => c.nom === 'Avec total');
  V('le total France revient en nombre', lu && lu.totalFr === 1234.5, lu && lu.totalFr);
  V('le repère Bulle revient TEL QUEL', lu && lu.repereBulle === 'suivant devis OU +50%', lu && lu.repereBulle);
  V('le repère NAS « 150 » reste un texte', lu && lu.repereNas === '150', lu && lu.repereNas);
  const shA = cl.getSheetByName('COTATIONS_TYPE');
  const lignesA = shA.lignes.filter(l => l[1] === 'Avec total');
  V('portés par la 1re ligne seulement, comme LC',
    lignesA[0][8] === 1234.5 && lignesA[0][9] && lignesA[1][8] === '' && lignesA[1][9] === '' && lignesA[1][7] === '', lignesA);
  V('un total qui n\'est pas un nombre est refusé par le serveur',
    run(`saveCotationType({groupe:'Essai', nom:'X', lc:'CS', totalFr:'+100 ou 150', lignes:[{code:'HHQE002', role:'principal'}]}, MAR).success`) === false);
  V('un repère de plus de 200 caractères est refusé',
    run(`saveCotationType({groupe:'Essai', nom:'X', lc:'CS', repereNas:'${'x'.repeat(201)}', lignes:[{code:'HHQE002', role:'principal'}]}, MAR).success`) === false);
  V('sans total, la cotation garde un total vide',
    run(`saveCotationType({groupe:'Essai', nom:'Sans total', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]}, MAR).success`) === true
    && run('getCotationsType()').find(c => c.nom === 'Sans total').totalFr === null);

  // ── Écriture en lot : tout ou rien ──
  const avantLot = JSON.stringify(shA.lignes);
  const lotKo = run(`saveCotationsTypeLot({items:[
    {groupe:'Essai', nom:'Lot 1', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]},
    {groupe:'Essai', nom:'Lot 2', lc:'CS', lignes:[{code:'PAS-UN-CODE', role:'principal'}]}]}, MAR)`);
  V('une cotation invalide refuse le lot ENTIER', lotKo.success === false && /n° 2/.test(lotKo.error), lotKo);
  V('et le classeur n\'a pas bougé d\'une case', JSON.stringify(shA.lignes) === avantLot);
  V('un doublon dans le lot est refusé',
    run(`saveCotationsTypeLot({items:[{groupe:'Essai', nom:'D', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]},
      {groupe:'Essai', nom:'D', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]}]}, MAR).success`) === false);
  V('un MAR hors groupement ne peut pas importer',
    run(`saveCotationsTypeLot({items:[{groupe:'Essai', nom:'H', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]}]}, HORS).success`) === false);

  let ecritures = 0;
  brancherSurEcriture(() => { ecritures++; });
  const lot = run(`saveCotationsTypeLot({items:[
    {groupe:'Essai', nom:'Avec total', lc:'CS', totalFr:999, repereBulle:'', repereNas:'200', lignes:[{code:'ZZLP025', role:'principal'}]},
    {groupe:'Essai', nom:'Lot neuf A', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]},
    {groupe:'Autre', nom:'Lot neuf B', lc:'CS', totalFr:50, lignes:[{code:'HHQE002', role:'principal'}, {code:'ZZLP025', role:'associe'}]}]}, MAR)`);
  brancherSurEcriture(null);
  V('le lot passe : 2 créées, 1 remplacée', lot.success === true && lot.crees === 2 && lot.remplacees === 1, lot);
  V('en UNE écriture de données (plus le vidage du surplus)', ecritures <= 2, ecritures);
  const apres = run('getCotationsType()');
  V('la cotation remplacée n\'existe qu\'une fois, avec ses nouvelles valeurs',
    apres.filter(c => c.groupe === 'Essai' && c.nom === 'Avec total').length === 1
    && apres.find(c => c.nom === 'Avec total').totalFr === 999
    && apres.find(c => c.nom === 'Avec total').lignes.map(l => l.code).join() === 'ZZLP025',
    apres.find(c => c.nom === 'Avec total'));
  V('le reste de l\'onglet est intact (amorce, « Sans total »)',
    apres.filter(c => c.groupe === 'Endoscopie').length === 3 && !!apres.find(c => c.nom === 'Sans total'));
  V('aucune ligne orpheline ne traîne en bas de l\'onglet',
    !shA.lignes.slice(1).some(l => (l[0] || l[1]) && !l[3]));
  const relot = run(`saveCotationsTypeLot({items:[{groupe:'Autre', nom:'Lot neuf B', lc:'CS', lignes:[{code:'HHQE002', role:'principal'}]}]}, MAR)`);
  V('réimporter la même cotation la remplace, sans doublon',
    relot.remplacees === 1 && run('getCotationsType()').filter(c => c.nom === 'Lot neuf B').length === 1, relot);

  // ── Producteur → consommateurs : rien ne filtre les nouveaux champs ──
  const mir = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('la copie rapide pousse getCotationsType() tel quel',
    /_miroirAjoute_\(items, 'cotations_type',\s+function \(\) \{ return getCotationsType\(\); \}\)/.test(mir));
  V('un import rafraîchit la copie rapide', /saveCotationsTypeLot:\s*\['cotations_type'\]/.test(mir));
  const portail = fs.readFileSync('../gas/portail.gs', 'utf8');
  V('l\'action d\'import est routée', /case 'saveCotationsTypeLot':\s+return _portailJson\(saveCotationsTypeLot\(payload, user\)\)/.test(portail));
  const fab = fs.readFileSync('../docs/module-liberal/cotations-types.html', 'utf8');
  V('modifier une cotation à la main ne perd ni le total ni les repères',
    /totalFr: edit\.totalFr == null \? null : edit\.totalFr/.test(fab) && /repereBulle: edit\.repereBulle/.test(fab));

  // ── Le parseur, sur une grille FICTIVE qui reprend toutes les formes ──
  const pctx = vm.createContext({ console, Math, String, Number, Object, Array, RegExp, parseFloat, JSON,
    eur: n => (n || 0).toFixed(2).replace('.', ',') + ' €' });
  vm.runInContext(extraireFonction('../docs/module-liberal/cotations-types.html', 'parserGrille'), pctx);
  const CCAMJ = JSON.parse(fs.readFileSync('../docs/module-liberal/ccam_actes.json', 'utf8')).actes;
  const t = (...cases) => cases.join('\t');
  const grille = [
    'Orthopédie',
    t('Geste', 'Code CCAM', 'Secteur 1', 'France avec dépassement', 'Monaco', 'Rose', 'Bulle', 'NAS'),
    t('Geste un', 'HHQE002', '11', '400', '22', '26', 'suivant devis OU +50%', '150'),
    'Note : tous les montants sont fictifs',
    t('Geste associé', 'HHQE002+ZZLP025', '11', '+100 ou 150', '22', '26', '', ''),
    t('Geste pseudo', 'ZZ-ASSOC', '11', '300', '', '', '', ''),
    t('Geste inconnu', 'ABCD999', '11', '300', '', '', '', ''),
    t('Geste trop bas', 'ZZLP025', '11', '5', '', '', '', ''),
    t('"Geste sur', 'deux lignes"', 'HHQE002', '', '310,50', '', '', '', '').replace('"Geste sur\tdeux lignes"\t', '"Geste sur\ndeux lignes"\t'),
    t('Geste un', 'HHQE002', '', '', '', '', '', ''),
    '',
    'Endoscopie',
    // En-tête dans un AUTRE ordre : les colonnes se lisent par leur nom.
    t('NAS', 'Geste', 'Bulle', 'Code CCAM', 'France avec dépassement'),
    t('texte NAS', 'Colo seule', 'texte bulle', 'HHQE002', '250'),
  ].join('\r\n');
  const existants = [{ groupe:'Endoscopie', nom:'Colo seule' }];
  pctx.G = grille; pctx.C = CCAMJ; pctx.E = existants;
  const P = vm.runInContext('parserGrille(G, C, E)', pctx);
  const it = nom => P.items.find(x => x.nom === nom);
  const rj = re => P.rejets.find(x => re.test(x.texte));
  V('la ligne de titre devient le GROUPE des lignes suivantes', it('Geste un') && it('Geste un').groupe === 'Orthopédie', it('Geste un'));
  V('un second titre change de groupe', it('Colo seule') && it('Colo seule').groupe === 'Endoscopie');
  V('en-têtes et lignes « Note : » ignorées, jamais prises pour un titre',
    P.ignorees === 3 && !P.items.some(x => /Note|Geste$/.test(x.groupe)), P.ignorees);
  V('colonnes repérées par leur en-tête, pas leur position',
    it('Colo seule').totalFr === 250 && it('Colo seule').repereBulle === 'texte bulle' && it('Colo seule').repereNas === 'texte NAS',
    it('Colo seule'));
  V('les colonnes de tarifs (secteur 1, Monaco, rose) sont ignorées',
    !JSON.stringify(P.items).includes('"11"') && !('monaco' in it('Geste un')));
  V('valeurs par défaut : rôle principal, consultation CS, MODA = N',
    it('Geste un').lc === 'CS' && it('Geste un').lignes[0].role === 'principal' && it('Geste un').lignes[0].modA === false);
  V('repères conservés tels quels', it('Geste un').repereBulle === 'suivant devis OU +50%' && it('Geste un').repereNas === '150');
  V('« HHQE002+ZZLP025 » : 1er principal, suivant associé',
    it('Geste associé') && it('Geste associé').lignes.map(l => l.code + ':' + l.role).join() === 'HHQE002:principal,ZZLP025:associe',
    it('Geste associé') && it('Geste associé').lignes);
  V('un total en texte libre est importé VIDE…', it('Geste associé').totalFr === null);
  V('…et signalé, jamais deviné', P.signalements.some(s => s.nom === 'Geste associé' && /\+100 ou 150/.test(s.motif)), P.signalements);
  V('un pseudo-code est rejeté avec la syntaxe des associations',
    !!rj(/Geste pseudo/) && /HHQE002\+ZZLP025/.test(rj(/Geste pseudo/).motif), rj(/Geste pseudo/));
  V('un code absent du référentiel est rejeté et nommé',
    !!rj(/Geste inconnu/) && /ABCD999/.test(rj(/Geste inconnu/).motif), rj(/Geste inconnu/));
  V('un total inférieur à la BR calculée est signalé (et importé)',
    !!it('Geste trop bas') && P.signalements.some(s => s.nom === 'Geste trop bas' && /inférieur à la BR/.test(s.motif)));
  V('une case sur deux lignes (guillemets d\'Excel) est lue d\'un bloc',
    !!it('Geste sur deux lignes') && it('Geste sur deux lignes').totalFr === 310.5, P.items.map(x => x.nom));
  V('un doublon dans le collage est rejeté', !!P.rejets.find(x => /en double/.test(x.motif)), P.rejets.map(x => x.motif));
  V('« même GROUPE + NOM » qu\'une cotation existante → remplacée', it('Colo seule').etat === 'remplace' && it('Geste un').etat === 'cree');
  V('le compte de l\'aperçu : 4 créées, 1 remplacée, 3 rejetées',
    P.items.filter(x => x.etat === 'cree').length === 4 && P.items.filter(x => x.etat === 'remplace').length === 1 && P.rejets.length === 3,
    [P.items.length, P.rejets.length]);
  pctx.G2 = t('Geste un', 'HHQE002', '400');
  V('sans ligne d\'en-tête, rien n\'est importé et la page le dit',
    vm.runInContext('parserGrille(G2, C, [])', pctx).items.length === 0 && vm.runInContext('parserGrille(G2, C, [])', pctx).colonnes === null);
  pctx.G3 = ['Essai', t('Geste', 'Code CCAM'), t('X', 'HHQE002')].join('\n');
  const guideL = fs.readFileSync('../docs/guide-liberal.html', 'utf8');
  V('le guide explique l\'import : le geste, les messages, la syntaxe des associations',
    /Importer les cotations types depuis Excel/.test(guideL) && /HHQE002\+ZZLP025/.test(guideL)
    && /n'est pas un code CCAM/.test(guideL) && /code absent du référentiel CCAM/.test(guideL) && /importé vide/.test(guideL));
  V('chaque item produit est accepté tel quel par le serveur',
    run(`saveCotationsTypeLot({items:${JSON.stringify(P.items.map(x => ({ groupe:x.groupe, nom:x.nom, lc:x.lc, lignes:x.lignes,
      totalFr:x.totalFr, repereBulle:x.repereBulle, repereNas:x.repereNas })))}}, MAR).success`) === true);
}

console.log('\n═══ 5ter. Le jeton unique : reessayer sans jamais doubler ═══');
/* (17/08/2026) Le reseau peut perdre la REPONSE d'une ecriture qui a reussi :
   on croit l'echec, on recommence, la declaration part deux fois. Personne ne
   le verrait — deux endoscopies le meme jour dans le meme secteur sont
   plausibles. Le jeton rend le reessai sur. */
{
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [['ID','NOM','ACTIF','LIBERAL'], ['ALPHA','Dr ALPHA','O','O']]);
  cl.ajouter('SPECIALITES', [['CODE','LABEL','ACTIF'], ['END','Endoscopies','O']]);
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN, isFinite, parseInt, parseFloat, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    Utilities: { formatDate: (d) => d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2),
                 getUuid: () => 'u-' + Math.random().toString(16).slice(2) + '-x' },
  });
  ctx.globalThis = ctx;
  socleMedecins(ctx);   // (14/09/2026) COL_MED, _medecinsRows_, _medecinsInvalider_ (code.gs)
  ['SPECIALITES_TAB','_SPECIALITES_HEADER','_SPECIALITES_SEED','LIBERAL_HEADER'].forEach(function(n){
    try { vm.runInContext(extraireConst('../gas/portail.gs', n), ctx); } catch(e) {}
  });
  ['_isoDate','_todayISO_','_libYearOf','_libSheetName','_getOrCreateLiberalTab','_libNewId',
   '_libMoney_','getOrCreateSpecialitesTab','getSpecialites','_specialitesActives_','declareLiberal','listLiberal','deleteLiberal']
    .forEach(n => { try { vm.runInContext(extraireFonction('../gas/portail.gs', n), ctx); } catch(e) {} });
  ctx.MAR = { role:'mar', id:'ALPHA', liberal:true };
  const run = e => vm.runInContext(e, ctx);
  const base = "{dateBloc:'2026-09-15', dateConsult:'2026-09-01', secteur:'END', specialite:'END', brCcam:100, brNgap:46";

  const a = run(`declareLiberal(${base}, jeton:'abc123'}, MAR)`);
  V('la déclaration passe', a.success === true, a);
  V('elle porte le jeton comme identifiant', a.id === 'J-abc123', a.id);
  const b = run(`declareLiberal(${base}, jeton:'abc123'}, MAR)`);
  V('la MÊME déclaration rejouée ne crée pas de doublon', b.success === true && b.rejoue === true, b);
  V('il n\'y a bien qu\'UNE ligne', run('listLiberal({year:2026}, MAR).items.length') === 1,
    run('listLiberal({year:2026}, MAR).items.length'));

  /* Patient suivant : nouveau jeton, donc nouvelle ligne — meme date, meme
     secteur. Deux endoscopies le meme jour, c'est la normale. */
  const c = run(`declareLiberal(${base}, jeton:'def456'}, MAR)`);
  V('un patient suivant, même jour et même secteur, passe bien',
    c.success === true && run('listLiberal({year:2026}, MAR).items.length') === 2);
  /* Sans jeton, l'ancien chemin reste ouvert : entre le deploiement du serveur
     et la mise en ligne de la page, l'ancienne page envoie encore l'ancien
     payload. Elle ne doit pas tomber en erreur. */
  const d0 = run(`declareLiberal(${base}}, MAR)`);
  V('une déclaration sans jeton reste acceptée (ancienne page)', d0.success === true, d0);
  V('un jeton mal formé ne sert pas d\'identifiant',
    run(`declareLiberal(${base}, jeton:'../evasion'}, MAR)`).id.indexOf('J-') !== 0);

  const page = fs.readFileSync('../docs/module-liberal/estimateur-liberal.html', 'utf8');
  V('la page ne change PAS de jeton entre deux tentatives',
    /if\(!JETON_COURANT\) JETON_COURANT/.test(page));
  V('et en tire un neuf au patient suivant', /JETON_COURANT=''/.test(page));
  V('une écriture SANS jeton n\'est jamais réessayée',
    /!LIB_ECRITURES\[action\] \|\| !!\(extra && extra\.jeton\)/.test(page));
  /* « reseau » recouvrait trois causes : on cherchait a l'aveugle. */
  V('« réseau » a laissé place à trois messages distincts',
    /délai dépassé/.test(page) && /connexion perdue/.test(page) && /réponse illisible du portail/.test(page));

  /* le responsable : « on ne fait pas de liberal pour l'AME ». Deux entrees existaient,
     l'une a 1,95 (monegasque), l'autre a 1,00 (francaise) : deux calculs
     opposes sans que rien ne dise lequel choisir. */
  V('l\'AME a disparu de la liste des statuts',
    !/value="ame"/.test(page) && !/ame:\{coeff/.test(page));
  V('et son bandeau d\'incertitude avec elle', !/AME — base de calcul non confirmee/.test(page));
  /* (01/10/2026) « Français — AME / C2S » retiré à son tour : pas de libéral pour
     ces patients. Il ne doit plus être lu NULLE PART — ni statut, ni libellé ou
     taux du devis, ni commentaire qui laisserait croire qu'il existe encore. */
  V('le statut AME / C2S français a disparu de la page, partout', !/frc2s/.test(page));
  V('et du guide', !/Français — AME \/ C2S/.test(fs.readFileSync('../docs/guide-liberal.html', 'utf8')));
}

console.log('\n═══ 6. La page de cotation ne dit rien qu\'elle ne sache ═══');
/* (17/08/2026) Trois défauts corrigés le même jour, tous invisibles au banc
   parce qu'aucune vérification ne lisait cette page :
   - deux « socles » écrits en dur (50 000 € à 25 %) alimentaient des cadrans
     « % projeté » et « marge » : chacun y lisait une position qui n'était pas
     la sienne ;
   - un texte promettait un bouton « Déclarer » sur chaque parcours, qui
     n'existe pas ;
   - aucune sortie vers le portail.
   Contre-preuve faite à la main sur la version précédente du fichier :
   ces cinq vérifications y échouent. */
{
  const page = fs.readFileSync('../docs/module-liberal/estimateur-liberal.html', 'utf8');
  V('aucun socle financier écrit en dur',
    !/id="(Tc|Pc|Tn|Pn)"/.test(page));
  V('aucun cadran « % projeté » sur la page de cotation',
    !/id="(pctC|pctN|mrgC|mrgN)"/.test(page) && !/projAxis/.test(page));
  /* (09/09/2026) Le portail est passé de dashboard.html à la racine. Le test
     visait le nom du fichier ; il vise désormais la SORTIE — qu'un lien
     ramène au portail depuis cette page enfouie à deux niveaux. Le chemin
     peut changer encore, l'exigence non. */
  V('une sortie vers le portail existe',
    /href="\.\.\/\.\.\/(index\.html)?"/.test(page));
  V('la page ne promet plus un bouton « Déclarer » par parcours',
    !/bouton <b>📅 Déclarer<\/b> d'un parcours/.test(page));
  V('elle renvoie vers la page qui, elle, connaît la position',
    /Suivi des 30 %/.test(page));

  /* Le guide décrit le même geste : s'il continue d'annoncer un bouton par
     parcours, l'utilisateur le cherchera. */
  const guide = fs.readFileSync('../docs/guide-liberal.html', 'utf8');
  V('le guide décrit l\'encadré de déclaration, pas un bouton de parcours',
    !/📅 Déclarer<\/span> sur le parcours/.test(guide) && /Déclarer une intervention/.test(guide));

  /* Le suivi des 30 %, lui, DOIT garder ses chiffres : c'est sa raison d'être.
     Sans cette vérification, « retirer les cadrans » pourrait un jour être
     appliqué à la mauvaise page. */
  const suivi = fs.readFileSync('../suivi-liberal.html', 'utf8');
  V('la page de suivi garde bien, elle, la position par axe',
    /Axe CCAM/.test(suivi) && /Axe NGAP/.test(suivi) && /getReleveLiberal/.test(suivi));

  /* (17/08/2026) L'index CCAM etait retelecharge a CHAQUE ouverture (cache
     'no-store') : ~160 Ko sur le reseau du telephone, en consultation, par
     patient. Il ne change que deux fois par an. */
  V('le référentiel CCAM n\'est plus retéléchargé à chaque ouverture',
    !/fetch\(u,\s*\{\s*cache:'no-store'\s*\}\)/.test(page) && /ccam_actes\.json\?v=/.test(page));
  const meta = JSON.parse(fs.readFileSync('../docs/module-liberal/ccam_actes.json', 'utf8')).meta;
  V('l\'étiquette de version du fichier suit la version CCAM',
    new RegExp('ccam_actes\\.json\\?v=' + String(meta.version).replace(/\D+/g, '')).test(page),
    [meta.version, (page.match(/ccam_actes\.json\?v=\d+/) || [])[0]]);

  /* Les deux cles ajoutees au relais doivent etre lisibles par un MAR, sans
     quoi la page repart sur les quatre appels d'avant. */
  const worker = fs.readFileSync('../cloudflare/worker.js', 'utf8');
  V('le relais connaît les deux nouvelles listes',
    /specialites\|cotations_type/.test(worker) && /cle === 'specialites' \|\| cle === 'cotations_type'/.test(worker));
  const mir = fs.readFileSync('../gas/miroir.gs', 'utf8');
  V('elles sont rafraîchies quand on modifie leur onglet',
    /SPECIALITES:\s*\['specialites'\]/.test(mir) && /COTATIONS_TYPE:\s*\['cotations_type'\]/.test(mir));
  V('et la synchronisation complète les pousse',
    /'specialites', 'cotations_type'/.test(mir));
}

/* ═══════════════════════════════════════════════════════════════════
   7. LA PAGE, PILOTÉE AU CLIC (17/08/2026)

   La page de cotation n'avait AUCUNE vérification : c'est pourtant la seule
   que les dix-neuf membres du groupement toucheront. On la charge ici telle
   quelle, servie par le VRAI Worker, et on refait le geste complet d'une
   consultation : contexte → cotation type → jour du bloc → déclarer.
   ═══════════════════════════════════════════════════════════════════ */
(async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const vm2 = require('vm');
  const dodo = ms => new Promise(r => setTimeout(r, ms));
  console.log('\n═══ 7. La consultation, du premier clic à la déclaration ═══');

  // ── Le vrai Worker, sur un KV en mémoire ──
  const wsrc = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm2.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL,
                                   JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm2.runInContext(wsrc, wctx);
  const WK = wctx.__W, M = new Map();
  const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k,v) => { M.set(k,v); },
               delete: async k => { M.delete(k); },
               list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
                           return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const CODE = 'MARCODE77';
  M.set('acces', JSON.stringify({ indisposYear: 2026, users: [
    { h: await sha(CODE), role:'mar', id:'ALPHA', name:'Dr ALPHA', initials:'AL', prenom:'Jean', liberal:true, rpps:'10000000001' }]}));
  M.set('secteurs', JSON.stringify([
    { code:'END', label:'Endoscopies',        ordre:5, actif:true, aff:true, rendement:'FORT'  },
    { code:'ORL', label:'ORL / Ophtalmologie', ordre:4, actif:true, aff:true, rendement:'FORT' },
    { code:'REA', label:'Réanimation',        ordre:2, actif:true, aff:true, rendement:'REA'   }]));
  M.set('specialites', JSON.stringify([
    { code:'END', label:'Endoscopies digestives', actif:true },
    { code:'OPH', label:'Ophtalmologie (cataracte)', actif:true },
    { code:'ORL', label:'ORL / stomatologie', actif:true }]));
  M.set('cotations_type', JSON.stringify([
    { groupe:'Endoscopie', nom:'Gastro + colo', lc:'CS', lignes:[
      { code:'HHQE002', ordre:1, role:'principal', mod7:true, modA:false },
      { code:'ZZLP025', ordre:2, role:'associe',   mod7:true, modA:false }]},
    { groupe:'Essai', nom:'Avec total', lc:'CS', totalFr:400, repereBulle:'suivant devis OU +50%', repereNas:'150', lignes:[
      { code:'HHQE002', ordre:1, role:'principal', mod7:true, modA:false }]}]));
  const env = { KV, PUSH_TOKEN:'JETON' };

  // ── La page réelle ──
  const html = fs.readFileSync('../docs/module-liberal/estimateur-liberal.html', 'utf8');
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const envois = [];                       // ce qui part vers Apps Script
  let declarees = [];                      // ce que la doublure Apps Script a retenu
  const dom = new JSDOM(html, { runScripts:'dangerously', virtualConsole:vc, pretendToBeVisual:true,
    url:'https://planningmedic.github.io/docs/module-liberal/estimateur-liberal.html',
    beforeParse(win) {
      win.scrollTo = () => {};
      win.alert = () => {};
      win.confirm = () => true;
      /* La session se pose comme le portail le fait. La page ne lit plus le
         stockage en direct : elle passe par SessionPortail (partage/session.js),
         que jsdom ne va pas chercher — on le sert donc ici, comme le vrai site. */
      win.sessionStorage.setItem('pmViewCode', CODE);
      win.eval(fs.readFileSync('../partage/session.js', 'utf8'));
      win.eval(fs.readFileSync('../partage/portail.js', 'utf8'));   // (14/09/2026) le socle, comme le vrai site
      win.fetch = async (url, opt) => {
        const u = String(url);
        if (u.includes('workers.dev')) {
          const chemin = u.replace(/^https:\/\/[^/]+/, '');
          return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
        }
        if (u.includes('ccam_actes.json')) {
          const j = JSON.parse(fs.readFileSync('../docs/module-liberal/ccam_actes.json', 'utf8'));
          return { ok:true, json: async () => j };
        }
        const p = JSON.parse(opt.body || '{}');
        envois.push(p);
        /* La doublure Apps Script GARDE ce qu'on lui declare : sans cela, la
           relecture qui suit l'ecriture rendait une liste vide et effacait la
           ligne qu'on venait d'ajouter — un artefact du banc, pas du produit. */
        if (p.action === 'declareLiberal') {
          const id = p.jeton ? ('J-' + p.jeton) : ('L-' + (declarees.length + 1));
          if (!declarees.some(x => x.id === id)) {
            declarees.push({ id:id, dateConsult:p.dateConsult, dateBloc:p.dateBloc, secteur:p.secteur,
                             chirurgie:p.chirurgie, specialite:p.specialite,
                             brCcam:p.brCcam, brNgap:p.brNgap });
          }
          return { ok:true, json: async () => ({ success:true, id:id }) };
        }
        if (p.action === 'listLiberal')    return { ok:true, json: async () => ({ success:true, year:2026, items:declarees.slice() }) };
        if (p.action === 'deleteLiberal') {
          declarees = declarees.filter(x => x.id !== p.id);
          return { ok:true, json: async () => ({ success:true }) };
        }
        return { ok:true, json: async () => ({ success:false, error:'Apps Script ne doit pas être appelé ici' }) };
      };
    } });
  const w = dom.window, d = w.document;
  /* `let` au premier niveau d'un script ne se pose PAS sur window : les
     variables d'état de la page (builder, CCAM_INDEX…) se lisent par eval. */
  const ev = expr => w.eval(expr);
  await dodo(900);

  V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  V('le référentiel CCAM est chargé et allégé aux actes tarifés',
    ev('CCAM_INDEX.length') > 3000 && ev('CCAM_INDEX.every(a => a.t > 0)'), ev('CCAM_INDEX.length'));

  /* Le point de départ de toute la refonte : UN aller-retour au démarrage.
     Les quatre appels lancés ensemble faisaient tomber les derniers. */
  V('aucun appel à Apps Script pour les listes du démarrage',
    !envois.some(p => ['getSecteurs','getSpecialites','getCotationsType','login'].indexOf(p.action) >= 0),
    envois.map(p => p.action));

  V('l\'identité est pré-remplie', d.getElementById('cfgPrat').value === 'Jean ALPHA', d.getElementById('cfgPrat').value);
  V('le RPPS aussi', d.getElementById('cfgRPPS').value === '10000000001');
  /* (01/10/2026) Ligne praticien et déclaration : un bloc replié en bas, FERMÉ à
     l'ouverture. Son en-tête dit ce qui manque, pour qu'un bloc fermé ne cache rien. */
  const repli = d.getElementById('repli');
  V('praticien et déclaration sont regroupés dans un bloc repliable',
    !!repli && repli.tagName === 'DETAILS' && repli.contains(d.getElementById('cfgPrat'))
    && repli.contains(d.getElementById('dclSec')) && repli.contains(d.getElementById('dclListWrap')));
  V('fermé par défaut', repli && repli.open === false);
  V('son en-tête dit ce qui manque', /secteur|spécialité/.test(d.getElementById('repliEtat').textContent),
    d.getElementById('repliEtat').textContent);
  V('le message après déclaration et la panne des listes restent HORS du bloc',
    !repli.contains(d.getElementById('dclMsg')) && !repli.contains(d.getElementById('listesKO')));
  const secs = [...d.getElementById('dclSec').options].map(o => o.value).filter(Boolean);
  V('les secteurs sont proposés', secs.indexOf('END') >= 0 && secs.indexOf('ORL') >= 0, secs);
  V('la réanimation, sans libéral, n\'est pas proposée', secs.indexOf('REA') < 0, secs);
  V('les spécialités sont proposées',
    [...d.getElementById('dclSpec').options].map(o => o.value).indexOf('OPH') >= 0);
  V('la barre des cotations types est visible',
    d.getElementById('cotTypeBar').style.display === 'flex', d.getElementById('cotTypeBar').style.display);

  // ── Le geste : contexte → cotation type ──
  w.choisirGroupeCotType('Endoscopie');
  const btns = d.getElementById('cotTypeBtns').querySelectorAll('button');
  V('le contexte Endoscopie propose sa cotation', btns.length === 1, btns.length);
  btns[0].click();
  await dodo(60);
  V('un clic pose la cotation entière (2 actes)', ev('builder.length') === 2, ev('builder.map(l=>l.code)'));
  V('le modificateur 7 est posé', ev('builder.every(l => l.m7 === true)'));
  V('la chirurgie se pré-remplit depuis l\'acte', d.getElementById('dclChir').value.length > 3, d.getElementById('dclChir').value);

  /* (17/08/2026) LE SÉLECTEUR D'AXE A DISPARU — décision du responsable : tout patient
     vu passe ensuite au bloc. Deux endroits parlaient de consultation sans que
     rien ne dise en quoi ils différaient. La COMPTABILITÉ des deux axes, elle,
     ne bouge pas : c'est ce que ces vérifications protègent. */
  V('plus aucun choix d\'axe à l\'écran',
    !/id="axN"/.test(html) && !/function setAxe/.test(html) && !/id="blocNGAP"/.test(html));
  V('la consultation associée reste, elle, sur le parcours',
    d.getElementById('assocWrap').style.display !== 'none' && d.getElementById('assocLc').value === 'CS');

  // ── Déclarer sans jour de bloc : refusé, et la page dit pourquoi ──
  V('sans jour de bloc, le bouton Déclarer reste gris', d.getElementById('dclBtn').disabled === true);
  V('et la page dit ce qui manque', /jour du bloc/i.test(d.getElementById('dclPrev').textContent),
    d.getElementById('dclPrev').textContent);

  /* (15/09/2026) Le jour du bloc était écrit en dur au 15/09 : le 15/09, la date
     de consultation (« aujourd'hui ») tombait dessus et le test croyait à tort
     que les deux dates se confondaient. Un jour de bloc calculé (il y a 3 jours)
     ne peut jamais coïncider avec aujourd'hui. */
  const _bloc = (() => { const t = new Date(); t.setDate(t.getDate() - 3); return t.toISOString().slice(0, 10); })();
  d.getElementById('dInt').value = _bloc;
  w.renderDateHint(); w.majBarre();
  await dodo(30);
  V('le secteur et la spécialité manquants bloquent encore',
    d.getElementById('dclBtn').disabled === true || d.getElementById('dclSpec').value !== '');

  /* La COMPTABILITÉ des deux axes survit à la disparition du sélecteur : les actes
     comptent en CCAM au mois du bloc, la consultation en NGAP au mois où le patient
     a été vu. C'est tout l'intérêt de garder deux compteurs avec un seul écran. */
  const p1 = ev('courant(true)');
  V('la cotation alimente les DEUX compteurs des 30 %',
    !!p1 && p1.brCcam > 0 && p1.brNgap > 0, p1 && [p1.brCcam, p1.brNgap]);
  V('les actes en CCAM, la consultation associée en NGAP',
    !!p1 && Math.abs(p1.brNgap - 46) < 0.01 && p1.brCcam > 100, p1 && [p1.brCcam, p1.brNgap]);
  V('la date qui remonte au comité est le jour du bloc',
    !!p1 && p1.dActe === p1.dInt && p1.dInt !== p1.dCs, p1 && [p1.dActe, p1.dInt, p1.dCs]);

  // ── Le piège de la cataracte ──
  d.getElementById('dclSec').value = 'ORL'; w.dclSecChange();
  V('un secteur qui mélange ORL et ophtalmo ne devine PAS la spécialité',
    d.getElementById('dclSpec').value !== 'ORL', d.getElementById('dclSpec').value);
  V('et la page le dit à l\'écran',
    /ophtalmo/i.test(d.getElementById('specMemo').textContent), d.getElementById('specMemo').textContent);
  V('déclarer sans spécialité est refusé', d.getElementById('dclBtn').disabled === true);

  // ── Le cas courant : endoscopie ──
  d.getElementById('dclSec').value = 'END'; w.dclSecChange();
  await dodo(30);
  V('un secteur non ambigu déduit la spécialité', d.getElementById('dclSpec').value === 'END');
  V('le bouton Déclarer devient actif', d.getElementById('dclBtn').disabled === false);
  V('le bloc s\'est ouvert seul quand il n\'attendait plus que secteur et spécialité',
    d.getElementById('repli').open === true);

  /* ══ L'USAGE DES 50 % (17/08/2026) ══════════════════════════════
     Quand le chirurgien cote aussi en liberal, le depassement de
     l'anesthesiste est cale par usage a 50 % du sien : il n'est PAS libre. La
     page proposait jusqu'ici « le DH optimal » — un montant qu'on n'a pas le
     droit d'appliquer dans ce cas, le plus frequent. */
  V('la question sur le chirurgien ne se pose pas en carte verte',
    d.getElementById('chirRow').style.display === 'none', d.getElementById('chirRow').style.display);

  d.getElementById('statut').value = 'fr';        // assuré français : dépassement libre
  w.onStatut(); w.applyDH();
  await dodo(40);
  V('elle apparaît dès qu\'un dépassement est possible',
    d.getElementById('chirRow').style.display === 'block', d.getElementById('chirRow').style.display);
  V('par défaut, je cote seul — le calibrage garde tout son sens',
    ev('CHIR_LIB') === false && d.getElementById('chirDhWrap').style.display === 'none');

  w.setChir(true);
  await dodo(30);
  V('dire « oui » demande le dépassement du chirurgien',
    d.getElementById('chirDhWrap').style.display === 'block');
  /* Montant inconnu au moment de la consultation : la page ne doit pas bloquer. */
  V('tant qu\'il est inconnu, rien n\'est imposé et la page le dit',
    ev('chirDhPropose()') === null && /libre/i.test(d.getElementById('chirHint').textContent),
    d.getElementById('chirHint').textContent);

  d.getElementById('chirDh').value = '800';
  w.chirChange();
  await dodo(40);
  V('mon dépassement se cale à 50 % du sien', parseFloat(d.getElementById('dh').value) === 400,
    d.getElementById('dh').value);
  V('c\'est 50 % du DÉPASSEMENT, pas des honoraires',
    Math.abs(ev('chirDhPropose()') - 400) < 0.005, ev('chirDhPropose()'));
  /* (01/10/2026) Le bouton « Caler sur l'optimal » et le « total cible » ont
     disparu : le calage est automatique. */
  V('plus de bouton « caler » ni de « total cible » : le calage est automatique',
    !d.getElementById('calerBtn') && !d.getElementById('cible'));
  V('et l\'encadré dit sur quoi le dépassement est calé', /Calé sur le chirurgien/.test(d.getElementById('racTitre').textContent),
    d.getElementById('racTitre').textContent);
  /* Usage et non regle : la valeur reste modifiable. */
  V('le champ reste modifiable — c\'est un usage, pas une règle',
    d.getElementById('dh').disabled === false);

  w.setChir(false);
  await dodo(30);
  V('revenir à « je cote seul » rend le calibrage',
    d.getElementById('chirDhWrap').style.display === 'none' && /Calé sur la mutuelle/.test(d.getElementById('racTitre').textContent));
  d.getElementById('statut').value = 'verte'; w.onStatut(); w.applyDH();
  await dodo(30);

  /* Le devis part de la cotation AFFICHEE : il n'y a plus de liste ou aller le
     chercher. Le generateur de devis lui-meme n'a pas ete touche. */
  /* Le devis imprimé LIT la ligne praticien : la replier ne doit rien lui retirer. */
  d.getElementById('repli').open = false;
  w.ouvrirDevisCourant();
  await dodo(60);
  V('bloc praticien replié, le devis porte quand même le nom et le RPPS',
    d.getElementById('dvPratName').textContent === 'Jean ALPHA' && d.getElementById('dvRPPS').textContent === '10000000001'
    && d.getElementById('dcPratName').textContent === 'Jean ALPHA',
    [d.getElementById('dvPratName').textContent, d.getElementById('dvRPPS').textContent]);
  const ov = d.getElementById('devisOverlay');
  V('le bouton Devis ouvre le devis du patient affiché', !!ov && ov.style.display !== 'none',
    ov && ov.style.display);
  V('le devis porte le nom du praticien, pas celui d\'un patient',
    /ALPHA/.test(d.body.innerHTML) && !/dclPatient/.test(d.body.innerHTML));
  if (typeof w.closeDevis === 'function') w.closeDevis();
  await dodo(30);

  const avant = envois.length;
  await w.declarer();
  await dodo(120);
  const decl = envois.slice(avant).find(p => p.action === 'declareLiberal');
  V('la déclaration part', !!decl, envois.slice(avant).map(p => p.action));
  if (decl) {
    V('elle porte le jour du bloc saisi dans la cotation', decl.dateBloc === _bloc, decl.dateBloc);
    V('la date de consultation est celle du jour', /^\d{4}-\d{2}-\d{2}$/.test(decl.dateConsult), decl.dateConsult);
    V('elle porte le secteur et la spécialité', decl.secteur === 'END' && decl.specialite === 'END', [decl.secteur, decl.specialite]);
    V('elle porte la BR CCAM calculée par la cotation', decl.brCcam > 0, decl.brCcam);
    V('et la BR de la consultation associée', decl.brNgap > 0, decl.brNgap);
    /* Ce qui NE doit jamais partir : le module ne transporte ni patient ni code d'acte. */
    const brut = JSON.stringify(decl);
    V('aucun code d\'acte ne part avec la déclaration', !/HHQE002|ZZLP025/.test(brut), brut.slice(0,160));
    V('aucun identifiant de MAR n\'est envoyé par la page', !decl.marId && !decl.mar, brut.slice(0,160));
  }

  /* ══ LA LIGNE APPARAIT TOUT DE SUITE (17/08/2026, correctif du soir) ══
     La copie rapide n'est PAS rafraichie au moment de l'ecriture : un
     declencheur s'en charge 1 a 2 minutes plus tard. miroir.gs le dit deja —
     « l'ecran qui vient d'ecrire relit de toute facon le circuit DIRECT ».
     En faisant lire la copie EN PREMIER, cette hypothese avait ete cassee : la
     ligne qu'on venait de declarer n'apparaissait pas, et recharger la page
     pour la voir faisait perdre le devis du patient. Constate par le responsable. */
  V('la déclaration apparaît dans la liste SANS attendre la relecture',
    ev('MES_DECL.length') >= 1 && ev('MES_DECL').some(x => x.dateBloc === _bloc),
    ev('MES_DECL').map(x => x.dateBloc));
  V('elle porte tout ce que la liste affiche',
    ev("MES_DECL.filter(function(d){return d.dateBloc==='" + _bloc + "';})[0].secteur") === 'END' &&
    ev("MES_DECL.filter(function(d){return d.dateBloc==='" + _bloc + "';})[0].brCcam") > 0);
  V('après une écriture, la relecture ne passe PAS par la copie rapide',
    /chargerDecl\(true\)/.test(html) && /if\(!direct\) try\{/.test(html));
  V('à l\'ouverture, elle y passe — c\'est là qu\'elle évite les pannes',
    /keys:\['liberal_mar_'\+an\]/.test(html));

  /* ══ LE DEVIS RESTE ROUVRABLE PENDANT LA CONSULTATION (17/08/2026) ══
     Cas reel du responsable : trois patients passes, on s'apercoit que le premier n'a
     pas signe. La cotation d'un patient DECLARE est gardee en memoire vive.
     Rien n'est ecrit nulle part : recharger la page efface ces devis. */
  V('la cotation du patient déclaré est gardée pour la consultation',
    Object.keys(ev('DEVIS_SESSION')).length === 1, Object.keys(ev('DEVIS_SESSION')));
  V('rien n\'en sort du navigateur : aucun stockage, aucun envoi',
    !/DEVIS_SESSION[\s\S]{0,400}(sessionStorage|localStorage|fetch)/.test(
      html.slice(html.indexOf('const DEVIS_SESSION'), html.indexOf('const DEVIS_SESSION') + 400)));
  const idDecl = decl ? Object.keys(ev('DEVIS_SESSION'))[0] : null;
  if (idDecl) {
    w.rouvrirDevis(idDecl);
    await dodo(60);
    const ov2 = d.getElementById('devisOverlay');
    V('un clic rouvre le devis de ce patient-là', !!ov2 && ov2.style.display !== 'none');
    if (typeof w.closeDevis === 'function') w.closeDevis();
    await dodo(20);
  }
  V('une ligne sans devis en mémoire n\'affiche pas d\'icône trompeuse',
    !/DEVIS_SESSION\[d\.id\]\s*\?[^:]*:\s*'[^']/.test(html) || /:\s*''/.test(html));

  /* ══ UN ECHEC N'EST PAS UNE LISTE VIDE (17/08/2026) ══════════════
     Constate par le responsable : deux declarations bien enregistrees ont paru
     « s'effacer brutalement ». Elles etaient dans le classeur ET chez le
     comite — c'est l'ecran qui masquait tout le bloc quand l'appel echouait. */
  ev("DECL_KO = 'portail injoignable'; renderDecl();");
  await dodo(30);
  const koBox = d.getElementById('dclListKO');
  V('un échec de chargement se DIT, au lieu de tout masquer',
    koBox.style.display === 'block' && /Rien n'est perdu/.test(koBox.textContent), koBox.style.display);
  V('et le bloc reste visible', d.getElementById('dclListWrap').style.display !== 'none');
  V('il propose de réessayer', /Réessayer/.test(koBox.innerHTML));
  ev("DECL_KO = ''; renderDecl();");
  await dodo(20);
  V('sans échec, aucun message parasite', d.getElementById('dclListKO').style.display === 'none');

  /* Meme defaut sur la barre des cotations types : elle disparaissait sans un
     mot, et le responsable a cru la fonctionnalite perdue. */
  V('la barre des cotations types sait dire qu\'elle a échoué',
    /function cotTypePanne/.test(html) && /Cotations types indisponibles/.test(html));
  V('elle rappelle que la cotation à la main reste possible',
    /la cotation à la main reste possible/.test(html));

  // ── Patient suivant : écran vide ──
  V('les actes du patient précédent ont disparu', ev('builder.length') === 0, ev('builder.length'));
  V('le jour du bloc est effacé', d.getElementById('dInt').value === '', d.getElementById('dInt').value);
  V('la chirurgie est effacée', d.getElementById('dclChir').value === '');
  V('la date de consultation reste à aujourd\'hui', d.getElementById('dCs').value.length === 10);
  V('le secteur, lui, RESTE : dix endoscopies d\'affilée, zéro geste',
    d.getElementById('dclSec').value === 'END', d.getElementById('dclSec').value);
  V('la mutuelle repart à vide : elle ne calera pas le patient suivant', ev('MUT_PCT') === 0, ev('MUT_PCT'));

  /* ═══════════════════════════════════════════════════════════════
     7bis. LA PAGE ALLÉGÉE (01/10/2026)
     Même logique de calcul, beaucoup moins de texte. Statut en deux boutons,
     deux consultations, cinq niveaux de mutuelle, un seul champ de dépassement
     pré-rempli : chirurgien qui cote → 50 % du sien ; sinon calage mutuelle.
     ═══════════════════════════════════════════════════════════════ */
  console.log('\n═══ 7bis. La page allégée : mêmes calculs, moins de texte ═══');
  {
    const dhv = () => parseFloat(d.getElementById('dh').value);
    const proche = (a, b) => Math.abs(a - b) < 0.011;
    const visible = id => d.getElementById(id).style.display !== 'none';
    const mut = p => { if (ev('MUT_PCT') !== p) w.setMut(p); };   // un clic sur le niveau deja allume l'eteindrait

    // ── Statut : deux boutons, puis la carte pour Monaco ──
    V('le statut n\'est plus une liste déroulante : deux boutons France / Monaco',
      d.getElementById('statut').tagName === 'INPUT' && d.getElementById('statut').type === 'hidden'
      && /France/.test(d.getElementById('stFr').textContent) && /Monaco/.test(d.getElementById('stMc').textContent));
    const ecran = () => d.querySelector('.wrap').textContent;   // le texte AFFICHÉ, pas les commentaires du code
    V('plus aucun libellé « DH 0 / DH +20 % / DH libre » à l\'écran', !/DH 0|DH \+20 %|DH libre/.test(ecran()));
    w.choisirPays('fr'); await dodo(20);
    V('France : la rangée des cartes est masquée', d.getElementById('stCartes').style.display === 'none' && ev('statutCourant()') === 'fr');
    w.choisirPays('mc'); await dodo(20);
    const cartes = [...d.getElementById('stCartes').querySelectorAll('button')].map(b => b.dataset.st);
    V('Monaco : 2e rangée Verte · Rose · Bulle · SPME · NAS',
      visible('stCartes') && cartes.join(',') === 'verte,rose,bulle,spme,nas', cartes);
    V('les valeurs internes et les plafonds ne changent pas',
      ev('JSON.stringify(STATUTS)') === JSON.stringify({ verte:{coeff:1.95,dh:'0'}, rose:{coeff:1.95,dh:'0.20'},
        bulle:{coeff:1.95,dh:'libre'}, fr:{coeff:1, dh:'libre'}, nas:{coeff:1, dh:'libre'}, spme:{coeff:1.95,dh:'0'} }),
      ev('JSON.stringify(STATUTS)'));
    V('frc2s n\'est plus lu nulle part (statuts, libellé et taux du devis)',
      ev("!('frc2s' in STATUTS) && !('frc2s' in ST_LABELS) && !('frc2s' in RO_RATE)"));

    // Une cotation pour calculer : la BR est connue, le reste en découle.
    w.choisirGroupeCotType('Endoscopie');
    d.getElementById('cotTypeBtns').querySelector('button').click();
    await dodo(30);

    // ── Consultation : CS et APC seulement, montants lus dans LC ──
    V('deux consultations seulement : CS et APC',
      !!d.getElementById('lcCS') && !!d.getElementById('lcAPC') && !d.getElementById('assocCoef') && !d.getElementById('assocLibre'));
    V('leurs montants sont affichés depuis LC', /CS 46 €/.test(d.getElementById('lcCS').textContent)
      && /APC 60 €/.test(d.getElementById('lcAPC').textContent),
      [d.getElementById('lcCS').textContent, d.getElementById('lcAPC').textContent]);
    ev('LC.CS = 50; assocChange();');
    V('…et jamais écrits en dur : changer LC change le bouton', /CS 50 €/.test(d.getElementById('lcCS').textContent));
    ev('LC.CS = 46; assocChange();');

    w.setStatut('verte'); await dodo(20);
    w.setAssoc('APC'); await dodo(20);
    V('APC refusée en Monaco : le bouton est grisé et rien ne change',
      d.getElementById('lcAPC').disabled === true && d.getElementById('assocLc').value === 'CS');
    w.setStatut('fr'); w.setAssoc('APC'); await dodo(20);
    V('APC acceptée pour un assuré français', d.getElementById('assocLc').value === 'APC' && proche(ev('assocBR()'), 60));
    w.setStatut('nas'); await dodo(20);
    V('passer en NAS (rangée Monaco) ramène la consultation sur CS',
      d.getElementById('assocLc').value === 'CS' && d.getElementById('lcAPC').disabled === true);

    // ── Mutuelle : cinq boutons, masquée en Verte et SPME ──
    const niveaux = [...d.getElementById('mutBtns').querySelectorAll('button')].map(b => +b.dataset.p);
    V('mutuelle : cinq boutons 100 / 150 / 200 / 250 / 300 %', niveaux.join(',') === '100,150,200,250,300', niveaux);
    const vu = {};
    for (const st of ['fr', 'rose', 'bulle', 'nas', 'verte', 'spme']) { w.setStatut(st); vu[st] = visible('mutRow'); }
    V('mutuelle visible pour France, Rose, Bulle, NAS', vu.fr && vu.rose && vu.bulle && vu.nas, vu);
    V('mutuelle masquée en Verte et en SPME', !vu.verte && !vu.spme, vu);

    let br = ev('parcoursBR()');   // recalculée à chaque statut : 1,95 à Monaco, 1,00 en France
    // ── Rose : plafonnée à +20 % même avec une mutuelle à 300 % ──
    w.setStatut('rose'); mut(300); await dodo(20); br = ev('parcoursBR()');
    V('rose plafonnée à 20 % de la BR avec une mutuelle à 300 %', proche(dhv(), 0.20 * br), [dhv(), 0.20 * br]);
    V('et ce montant n\'est pas modifiable', d.getElementById('dh').disabled === true);

    // ── Calage automatique, plafond non-OPTAM pour un assuré français ──
    w.setStatut('bulle'); mut(300); await dodo(20);
    V('bulle + 300 % : calé sur l\'absorbé, (300 − 100) × BR', proche(dhv(), 2 * br), [dhv(), 2 * br]);
    w.setStatut('fr'); mut(300); await dodo(20); br = ev('parcoursBR()');
    V('français + 300 % : plafond non-OPTAM, 100 % BR seulement', proche(dhv(), br), [dhv(), br]);
    V('et le plafond est signalé', visible('rCapNote'));
    mut(150); await dodo(20);
    V('français + 150 % : absorbé = 50 % BR', proche(dhv(), 0.5 * br), [dhv(), 0.5 * br]);
    w.setMut(150); await dodo(20);
    V('un second clic éteint la mutuelle : plus rien à caler', ev('MUT_PCT') === 0 && proche(dhv(), 0), dhv());

    // ── Priorité chirurgien > mutuelle ──
    mut(200); await dodo(20);
    V('sans chirurgien : calage mutuelle (200 % → 100 % BR)', proche(dhv(), br), [dhv(), br]);
    w.setChir(true); d.getElementById('chirDh').value = '300'; w.chirChange(); await dodo(20);
    V('le chirurgien cote : 50 % du sien, devant la mutuelle', proche(dhv(), 150), dhv());
    V('et le reste à charge suit la mutuelle choisie',
      d.getElementById('rRac').textContent === ev("eur2(Math.max(0,(parcoursBR()+150)-Math.min(coverageCeiling('fr',200,parcoursBR()),parcoursBR()+150)))"),
      d.getElementById('rRac').textContent);
    w.setChir(false); await dodo(20);
    V('il ne cote plus : retour au calage mutuelle', proche(dhv(), br), [dhv(), br]);

    // ── Le champ reste modifiable, et une saisie n'est pas écrasée en douce ──
    d.getElementById('dh').value = '123'; w.dhSaisi();
    ev("upd(0,'mA',true)"); await dodo(20);
    V('une saisie à la main survit à une case cochée dans le tableau', proche(dhv(), 123), dhv());
    mut(250); await dodo(20);
    V('changer de mutuelle relance le calage', !proche(dhv(), 123), dhv());
    ev("upd(0,'mA',false)");

    // ── Les explications ont quitté les cartes ──
    V('plus d\'encadré « Estimateur, pas décompte »', !/Estimateur, pas décompte/.test(ecran()));
    V('plus de formule ni d\'aide dans les cartes',
      !/DH optimal = min|Absorbé = \(/.test(ecran()) && !d.getElementById('hintCCAM') && !d.getElementById('assocHint'));
    V('le lien vers les guides reste en tête', /class="guidelink" href="\.\.\/guide-liberal\.html"/.test(html));
    V('aucune parenthèse explicative dans les rôles', ev("Object.values(ROLES).every(r => !/\\(/.test(r.lab))"));

    w.setStatut('verte'); w.patientSuivant(); await dodo(20);
  }

  /* ═══════════════════════════════════════════════════════════════
     7ter. TOTAL FRANCE ET REPÈRES D'USAGE (01/10/2026)
     La cotation « Essai / Avec total » est servie par le VRAI Worker, depuis
     une copie rapide qui porte totalFr et les deux repères : si le relais les
     filtrait, rien de ce qui suit ne passerait. Valeurs fictives.
     ═══════════════════════════════════════════════════════════════ */
  console.log('\n═══ 7ter. Total France et repères d\'usage ═══');
  {
    const dhv = () => parseFloat(d.getElementById('dh').value);
    const proche = (a, b) => Math.abs(a - b) < 0.011;
    const mut = p => { if (ev('MUT_PCT') !== p) w.setMut(p); };
    const servie = ev("COTTYPE.find(c => c.nom === 'Avec total')");
    V('le relais transmet total et repères sans les filtrer',
      !!servie && servie.totalFr === 400 && servie.repereBulle === 'suivant devis OU +50%' && servie.repereNas === '150', servie);

    w.setStatut('fr');
    w.choisirGroupeCotType('Essai');
    d.getElementById('cotTypeBtns').querySelector('button').click();
    await dodo(30);
    const br = ev('parcoursBR()');
    V('assuré français + total France : dépassement = total − BR', proche(dhv(), 400 - br), [dhv(), 400 - br]);
    V('l\'encadré dit sur quoi il est calé', /total France/.test(d.getElementById('racTitre').textContent));
    mut(200); await dodo(20);
    V('le total France passe AVANT la mutuelle', proche(dhv(), 400 - br), dhv());
    V('le reste à charge, lui, suit la mutuelle choisie',
      d.getElementById('rRac').textContent === ev("eur2(Math.max(0,(parcoursBR()+(400-parcoursBR()))-Math.min(coverageCeiling('fr',200,parcoursBR()),400)))"),
      d.getElementById('rRac').textContent);
    w.setChir(true); d.getElementById('chirDh').value = '100'; w.chirChange(); await dodo(20);
    V('le chirurgien qui cote passe avant le total France', proche(dhv(), 50), dhv());
    w.setChir(false); await dodo(20);
    V('il ne cote plus : retour au total France', proche(dhv(), 400 - br), dhv());
    d.getElementById('dh').value = '77'; w.dhSaisi(); await dodo(10);
    V('le champ reste modifiable', proche(dhv(), 77) && d.getElementById('dh').disabled === false);
    V('en France, aucun repère d\'usage', d.getElementById('dhUsage').style.display === 'none');

    // ── Bulle et NAS : le repère s'affiche TEL QUEL, aucun calcul ──
    w.setStatut('bulle'); mut(200); await dodo(20);
    const brM = ev('parcoursBR()');
    V('Bulle : « Usage : … » affiché tel quel sous le dépassement',
      d.getElementById('dhUsage').style.display === 'block' && d.getElementById('dhUsage').textContent === 'Usage : suivant devis OU +50%',
      d.getElementById('dhUsage').textContent);
    V('…sans calcul : le dépassement reste celui de la mutuelle', proche(dhv(), ev("dhOptimal('bulle',200,parcoursBR())")) && proche(dhv(), brM), dhv());
    V('…et le total France ne s\'applique pas hors assuré français', ev('totalFrCourant()') === null);
    w.setStatut('nas'); await dodo(20);
    V('NAS : son propre repère', d.getElementById('dhUsage').textContent === 'Usage : 150');
    V('« 150 » n\'est pas devenu le dépassement', !proche(dhv(), 150), dhv());
    w.setStatut('rose'); await dodo(20);
    V('en carte rose, aucun repère', d.getElementById('dhUsage').style.display === 'none');
    V('le repère s\'écrit en texte, jamais interprété', /el\.textContent = txt \? 'Usage : '\+txt/.test(html));

    w.setStatut('nas'); w.patientSuivant(); await dodo(20);
    V('patient suivant : la cotation type et son repère disparaissent',
      ev('COTTYPE_COURANTE') === null && d.getElementById('dhUsage').style.display === 'none');
    w.setStatut('verte'); await dodo(10);
  }

  /* (17/08/2026) La session du portail. Ces deux pages la lisaient en direct dans
     l'onglet : dans l'app installée, elles redemandaient le code alors que le
     portail s'en souvenait 30 jours. Constaté en réel. */
  V('la page de cotation passe par la session commune',
    typeof w.SessionPortail === 'object' && /SessionPortail\.lire\(\)/.test(html)
    && !/getItem\('pmViewCode'\)/.test(html.replace(/window\.SessionPortail = window\.SessionPortail[^\n]*/, '')));
  V('elle charge la source unique de session',
    /partage\/session\.js/.test(html) && /FALLBACK_SESSION/.test(html));
  V('la déconnexion efface AUSSI la mémoire longue', /SessionPortail\.oublier\(\)/.test(html));
  /* Les QUATRE pages MAR qui restaient hors de la source unique. Une seule
     oubliée et le MAR retape son code sur elle, en pleine consultation. */
  for (const f of ['suivi-liberal.html', 'absences.html', 'crh.html']) {
    const c = fs.readFileSync('../' + f, 'utf8');
    const sansFilet = c.replace(/window\.SessionPortail = window\.SessionPortail[^\n]*/, '');
    V(f + ' passe par la session commune',
      /partage\/session\.js/.test(c) && /SessionPortail\.lire\(\)/.test(c)
      && /SessionPortail\.oublier\(\)/.test(c));
    V(f + ' ne lit plus le stockage en direct',
      !/sessionStorage\.\w+Item\('pmViewCode'\)/.test(sansFilet),
      (sansFilet.match(/sessionStorage\.\w+Item\('pmViewCode'\)/g) || []).slice(0, 2));
  }

  /* ═══════════════════════════════════════════════════════════════
     8. LE RELEVÉ DANS LA COPIE RAPIDE (17/08/2026)
     La liste rouge a été révisée : le relevé financier du groupement y est
     désormais admis. C'est la porte qui compte — ces vérifications sont le
     seul garde-fou entre « les membres » et « tout le monde ».
     ═══════════════════════════════════════════════════════════════ */
  console.log('\n═══ 8. Le relevé du groupement : qui peut le lire ═══');
  {
    const CODE_HORS = 'HORSGROUPE9', CODE_ADM = 'ADMINCODE9';
    M.set('acces', JSON.stringify({ indisposYear:2026, users:[
      { h: await sha(CODE),      role:'mar',   id:'ALPHA', name:'Dr ALPHA', initials:'AL', prenom:'Jean', liberal:true,  rpps:'1' },
      { h: await sha(CODE_HORS), role:'mar',   id:'BRAVO', name:'Dr BRAVO', initials:'BR', prenom:'Luc',  liberal:false, rpps:'2' },
      { h: await sha(CODE_ADM),  role:'admin', id:'COMITE', name:'Comité',  initials:'CO', prenom:'',     liberal:false, rpps:'' }]}));
    M.set('releve_liberal_2026', JSON.stringify({ success:true, year:2026, moisCourant:8,
      affectations:{}, items:[{ mois:'2026-07', marId:'ALPHA', nom:'Dr ALPHA', initiales:'AL',
        tCcam:1, pctCcam:2, excCcam:3, tNgap:4, pctNgap:5, excNgap:6 }] }));
    const lire = async (code) => {
      const r = await WK.fetch(new Request('https://worker/read', { method:'POST',
        body: JSON.stringify({ code, keys:['releve_liberal_2026'] }) }), env);
      return r.json();
    };
    const membre = await lire(CODE);
    V('un membre du groupement obtient le relevé',
      !!(membre.data && membre.data.releve_liberal_2026), membre.refuses);
    const horsG = await lire(CODE_HORS);
    V('un MAR HORS groupement ne l\'obtient pas',
      !(horsG.data && horsG.data.releve_liberal_2026), Object.keys(horsG.data || {}));
    const adm = await lire(CODE_ADM);
    V('le comité ne l\'obtient pas non plus — le libéral n\'est pas son ressort',
      !(adm.data && adm.data.releve_liberal_2026), Object.keys(adm.data || {}));
    /* (17/08/2026) « Mes interventions declarees » passe par la copie rapide :
       c'etait la derniere lecture du module a dependre d'Apps Script, donc la
       derniere a tomber par intermittence. Cle SEPAREE de celle du comite, qui
       reste allegee (ni montant, ni specialite). */
    M.set('liberal_mar_2026', JSON.stringify({ annee:2026, parMar:{
      ALPHA:[{ id:'L-1', dateBloc:'2026-09-15', dateConsult:'2026-09-01', secteur:'END',
               specialite:'END', chirurgie:'Colo', brCcam:100, brNgap:46 }],
      BRAVO:[{ id:'L-2', dateBloc:'2026-09-16', dateConsult:'2026-09-02', secteur:'ORL',
               specialite:'ORL', chirurgie:'Amygdales', brCcam:200, brNgap:46 }] } }));
    const lireCle = async (code, cle) => {
      const r = await WK.fetch(new Request('https://worker/read', { method:'POST',
        body: JSON.stringify({ code, keys:[cle] }) }), env);
      return r.json();
    };
    const mien = await lireCle(CODE, 'liberal_mar_2026');
    const bloc = mien.data && mien.data.liberal_mar_2026;
    V('un membre reçoit ses propres déclarations', !!bloc && !!bloc.parMar.ALPHA, Object.keys((bloc||{}).parMar||{}));
    /* Filtre pour TOUS : une liste « Mes interventions » qui contiendrait celles
       d'un autre serait inutilisable — la corbeille designerait sa ligne. */
    V('et SEULEMENT les siennes', !!bloc && !bloc.parMar.BRAVO, Object.keys((bloc||{}).parMar||{}));
    const horsG2 = await lireCle(CODE_HORS, 'liberal_mar_2026');
    V('un MAR hors groupement n\'y a pas accès', !(horsG2.data && horsG2.data.liberal_mar_2026));
    const adm2 = await lireCle(CODE_ADM, 'liberal_mar_2026');
    V('le comité non plus — il a sa propre clé, allégée',
      !(adm2.data && adm2.data.liberal_mar_2026));

    /* Le droit de gerer la bibliotheque voyage avec l'identite : la fabrique
       n'appelle plus Apps Script pour le connaitre. */
    const idt = mien.identite || {};
    V('l\'identité porte le droit de gérer les cotations types', 'libAdmin' in idt, Object.keys(idt));
    const mir2 = fs.readFileSync('../gas/miroir.gs', 'utf8');
    /* Le depot est PUBLIC : l'ayant droit se lit dans le classeur, jamais
       ecrit ici. Un identifiant en dur serait un nom dans un historique
       definitif — et il faudrait un push pour changer de responsable. */
    V('ce droit vient de la clé CONFIG, jamais d\'un identifiant en dur',
      /LIBERAL_ADMIN/.test(mir2) &&
      !/libAdmin[^;]{0,80}===\s*[\'"][A-Z]{3,}[\'"]/.test(mir2));
    const fab2 = fs.readFileSync('../docs/module-liberal/cotations-types.html', 'utf8');
    V('la fabrique lit la copie rapide en premier', /chargerParMiroir/.test(fab2));
    V('mais relit le classeur en direct après une écriture', /charger\(true\)/.test(fab2));
    const cot2 = fs.readFileSync('../docs/module-liberal/estimateur-liberal.html', 'utf8');
    V('la liste des déclarations passe par la copie rapide', /liberal_mar_'\+an/.test(cot2));
    V('avec Apps Script en repli', /apiLib\('listLiberal'/.test(cot2));

    const inconnu = await lire('PASUNCODE');
    V('un code inconnu n\'obtient rien du tout', inconnu.success === false, inconnu.error);

    /* La liste rouge n'a bouge que d'un cran : ce qui reste dehors doit le rester. */
    const wk = fs.readFileSync('../cloudflare/worker.js', 'utf8');
    V('PARAMETRES et les journaux restent hors du relais',
      !/parametres|journal_/i.test(wk.match(/const CLE_VALIDE[^;]+;/)[0]));
    V('la révision de la liste rouge est écrite dans les deux fichiers',
      /LISTE ROUGE, révisée/.test(wk) &&
      /LISTE ROUGE RÉVISÉE/.test(fs.readFileSync('../gas/miroir.gs', 'utf8')));

    const suivi = fs.readFileSync('../suivi-liberal.html', 'utf8');
    V('la page du suivi lit la copie rapide en premier',
      /releve_liberal_/.test(suivi) && /miroirRead/.test(suivi));
    V('elle garde Apps Script en repli', /getReleveLiberal/.test(suivi));
    V('un échec ne s\'affiche plus « aucun relevé »',
      /function panne\(/.test(suivi) && /Réessayer/.test(suivi));

    const mir = fs.readFileSync('../gas/miroir.gs', 'utf8');
    /* La bibliotheque s'edite depuis une page : ce qui est enregistre doit
       parvenir aux 19 sans attendre la synchro horaire. */
    V('un enregistrement de cotation type rafraîchit la copie rapide',
      /saveCotationType:\s*\['cotations_type'\]/.test(mir) && /deleteCotationType:\s*\['cotations_type'\]/.test(mir));
    const fab = fs.readFileSync('../docs/module-liberal/cotations-types.html', 'utf8');
    const cot = fs.readFileSync('../docs/module-liberal/estimateur-liberal.html', 'utf8');
    /* (17/08/2026) La fabrique lit desormais la copie rapide EN PREMIER — la
       liste y vit deja, et le droit de supprimer voyage avec l'identite. Mais
       apres une ECRITURE elle relit le classeur en direct : la copie se
       rafraichit dans la foulee, pas dans la meme seconde. */
    V('la fabrique relit le classeur en direct après une écriture',
      /listCotationsTypeEdit/.test(fab) && /charger\(true\)/.test(fab));
    V('elle refuse à la source un acte sans tarif d\'anesthésie',
      /pas de tarif d'anesthésie/.test(fab) && /if\(!a \|\| !a\.t\) return;/.test(fab));
    V('elle passe par la session commune',
      /partage\/session\.js/.test(fab) && /SessionPortail\.lire\(\)/.test(fab));
    V('la page de cotation y mène',
      /href="cotations-types\.html"/.test(cot));
    /* Un MAR qui garde sa page ouverte toute la matinee ne verrait pas une
       cotation creee entre-temps — et conclurait que « ca ne marche pas ». */
    V('la page de cotation redemande la liste en revenant dessus',
      /visibilitychange/.test(cot) && /rafraichirCotTypes/.test(cot));

    V('le relevé est daté sur l\'année CIVILE, pas l\'année active du planning',
      /releve_liberal_' \+ anneeCivile/.test(mir) && /new Date\(\)\.getFullYear\(\)/.test(mir));
    V('saisir le relevé rafraîchit le relevé, pas le volet du comité',
      mir.indexOf("LIBERAL_CA:") > mir.indexOf("LIBERAL:      ['liberal']"));
  }

  /* ═══════════════════════════════════════════════════════════════
     9. L'OUVERTURE NE DOIT PAS MONTRER L'ÉCRAN DE CODE (17/08/2026)
     Constaté sur mobile : le code était mémorisé, mais la page affichait
     quand même l'écran d'authentification quelques secondes, le temps de
     l'aller-retour, puis il disparaissait tout seul. Ça ressemble à une
     panne, et sur un outil de consultation ça décide de son usage.
     ═══════════════════════════════════════════════════════════════ */
  console.log('\n═══ 9. Rouvrir la page ne redemande rien, et ne fait rien croire ═══');
  {
    const sv = fs.readFileSync('../suivi-liberal.html', 'utf8');
    V('le suivi masque l\'écran de code AVANT d\'attendre le serveur',
      /ouvrirEcran\('\)/.test(sv.replace(/\s/g, '')) || /ouvrirEcran\(''\)/.test(sv));
    V('et il le remontre si le code est refusé',
      /fermerEcran\(\)/.test(sv) && /SessionPortail\.oublier\(\)/.test(sv));
    V('un code repris n\'appelle plus Apps Script quand la copie rapide répond',
      sv.indexOf('miroirRead') < sv.indexOf("apiPost({action:'login'})"),
      [sv.indexOf('miroirRead'), sv.indexOf("apiPost({action:'login'})")]);
    V('la copie rapide sert d\'authentification : identité vérifiée avant d\'ouvrir',
      /id\.role !== 'mar' \|\| !id\.liberal/.test(sv));

    const ab = fs.readFileSync('../absences.html', 'utf8');
    V('« Mes consultations » ouvre aussi tout de suite',
      /authOverlay'\)\.style\.display='none';[\s\S]{0,400}doLogin\(saved\)/.test(ab));
    V('et remet l\'écran de code si la session est refusée',
      /Session expirée — retapez votre code/.test(ab));

    /* La porte reste fermée : l'affichage optimiste montre une page VIDE,
       jamais des donnees non authentifiees. */
    V('rien n\'est affiché avant la réponse du serveur',
      /pitch'\)\.textContent = 'Chargement…'/.test(ab));
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  if (ko) process.exit(1);
})();
