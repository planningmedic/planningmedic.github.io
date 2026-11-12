/* ═══ BANC — ÉCHANGES ET DONS DE GARDES ENTRE MAR (phase 3) ═══
   Le VRAI code : echanges.gs entier + applyModification (Indispos.gs),
   dans un classeur simulé. Les notifications et la poussée KV sont des
   doublures qui ENREGISTRENT les appels : on vérifie qui est notifié,
   jamais « qu'une fonction a été appelée quelque part ».

   Ce qui est éprouvé : le refus DÈS la création (dryRun sans écriture),
   le cycle accepter/refuser, la sécurité (seul le receveur répond, une
   seule fois), l'acceptation d'une demande devenue impossible (grille
   INTACTE), l'expiration 48 h et le rappel unique 24 h, le transfert du
   R d'un samedi via LIENS_R — et ses trois échecs prévus (pas de lien,
   R passé, receveur occupé) qui n'empêchent JAMAIS l'échange. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction , brancherSurEcriture } = require('./stubs');
const { MARS } = require('./jeu_donnees');
let ok = 0, ko = 0;
/* (12/11/2026) Date FIGÉE : depuis que les gardes passées sont refusées, un banc
   à l'heure réelle aurait viré au rouge tout seul en janvier 2027. */
const AUJOURDHUI = '2026-11-11';
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

/* Monde : GARDES + INDISPOS (géométrie identique, comme en production),
   LIENS_R optionnel, echanges.gs + applyModification chargés en entier. */
function monde(annee, opts) {
  opts = opts || {};
  VERROUS.script = false; VERROUS.document = false;
  const jan1 = new Date(annee, 0, 1), dow = jan1.getDay();
  const off = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
  const debut = new Date(annee, 0, 1 + off, 12, 0, 0);
  const dates = [];
  for (let i = 0; i < 90; i++) { const d = new Date(debut); d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
  const cl = new Classeur();
  const grille = () => [['',''], ['',''], ['MAR',''].concat(dates.map(()=>''))]
    .concat(MARS.slice(0, 8).map(id => [id, ''].concat(dates.map(() => ''))));
  cl.ajouter('CONFIG', [['CLE','VALEUR'], ['DIAG_EMAIL','comite@example.test']]);
  cl.ajouter(`GARDES_${annee}`, grille());
  cl.ajouter(`INDISPOS_${annee}`, grille());
  if (opts.liensR) cl.ajouter(`LIENS_R_${annee}`, [['SAMEDI','MEDECIN','DATE R']].concat(opts.liensR));

  const notifs = [], kv = [], journal = [], mails = [], annees = { republie: [], prevenu: [] };
  /* Le piège du 14/08 : des écritures « en attente » tant que flush n'est
     pas appelé. Toute poussée au relais partie dans cet état aurait, en
     vrai, pu embarquer l'ancien état de l'onglet. */
  const attente = { ecritures: false, poussesSansFlush: 0 };
  brancherSurEcriture(() => { attente.ecritures = true; });
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, parseInt, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, flush: () => { attente.ecritures = false; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'MIROIR_PUSH_TOKEN' ? 'JETON' : (k === 'ECHANGES_OUVERTS' ? 'O' : null)), setProperty: () => {}, deleteProperty: () => {} }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }), deleteTrigger: () => {} },
    Utilities: { formatDate: (d) => { const x = new Date(d); if (Math.abs(x - Date.now()) < 60000) return opts.aujourdhui || AUJOURDHUI;
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; } },
    Logger: { log: () => {} }, logAction: m => journal.push(String(m)),
    /* (14/08/2026) L'alerte comité passe par mail, jamais par push. */
    MailApp: { sendEmail: (to, sujet, corps) => { mails.push({ to, sujet, corps }); },
               getRemainingDailyQuota: () => 100 },
    TEST_YEAR: opts.anneeActive || annee,
    generatePlanning: (y) => { ctxCompteurs.republications++; annees.republie.push(y); },
    notifPlanifier: (y) => { annees.prevenu.push(y); },
    /* Doublures ENREGISTREUSES : le banc vérifie les destinataires réels. */
    notifierPush_: (titre, corps, url, cible) => { notifs.push({ titre, corps, url, cible }); return { success: true }; },
    _miroirEnvoyerLot_: (items) => { if (attente.ecritures) attente.poussesSansFlush++; kv.push(Object.keys(items)); return { success: true }; },
  });
  ctx.globalThis = ctx;
  vm.runInContext(extraireFonction('../gas/Indispos.gs', 'applyModification'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', 'echanges.gs'), 'utf8'), ctx);

  const colonne = date => dates.indexOf(date) + 1;
  const feuille = nom => cl.getSheetByName(nom);
  const poser = (mar, date, code, nom) => {
    const f = feuille(nom || `GARDES_${annee}`);
    f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][colonne(date)] = code;
  };
  const lire = (mar, date, nom) => {
    const f = feuille(nom || `GARDES_${annee}`);
    return f.lignes[f.lignes.findIndex(l => String(l[0]).trim() === mar)][colonne(date)] || '';
  };
  const echanges = () => {
    const f = feuille('ECHANGES');
    return f ? f.lignes.slice(1).filter(l => l[0]) : [];
  };
  return { cl, ctx, dates, poser, lire, echanges, notifs, kv, journal, annee, attente, mails, annees };
}
const ctxCompteurs = { republications: 0 };
const COL = { ID:0, CREE_LE:1, TYPE:2, ANNEE:3, DATE:4, DATE2:5, DEMANDEUR:6, RECEVEUR:7, ETAT:8, REPONDU_LE:9, RAPPEL_LE:10, INFO:11 };
const user = id => ({ id: id, role: 'mar', name: 'DR ' + id });

console.log('\n═══ 1. Créer un don : contrôles joués TOUT DE SUITE, rien d\'écrit avant l\'accord ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  V('la demande est créée avec un identifiant', !!r.id);
  const e = b.echanges();
  V('une ligne, état « attente »', e.length === 1 && e[0][COL.ETAT] === 'attente', e[0]);
  V('le demandeur est celui du CODE, le receveur celui du choix', e[0][COL.DEMANDEUR] === 'ALPHA' && e[0][COL.RECEVEUR] === 'BRAVO');
  V('la garde n\'a PAS bougé (personne n\'a encore accepté)', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', j) === '');
  V('le receveur est notifié — et LUI SEUL', b.notifs.length === 1 && b.notifs[0].cible && b.notifs[0].cible.id === 'BRAVO', b.notifs);
  V('la clé `echanges` est poussée au miroir', b.kv.some(cles => cles.indexOf('echanges') > -1), b.kv);
}

console.log('\n═══ 2. Receveur noté en vacances : l\'envoi passe, il confirme en acceptant (11/11/2026) ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', j, 'V'); b.poser('BRAVO', lendemain, 'V');   // l'absence se lit dans GARDES
  let refus = null, r = null;
  try { r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('la proposition part (c\'est au receveur de confirmer)', !refus && r && !!r.id, refus);
  V('sa notification le prévient qu\'il est noté en vacances', b.notifs.length === 1 && /Attention, vous êtes noté en vacances le/.test(b.notifs[0].corps), b.notifs);
  V('la grille est intacte tant que personne n\'a accepté', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', j) === 'V');
  // Il accepte SANS avoir confirmé : la question lui est posée, rien n'est écrit.
  let q = null;
  try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); }
  catch (e) { q = e.message; }
  V('accepter sans confirmer → la question « vous confirmez ? »', /^\[ABS\] Attention, vous êtes noté en vacances le .* et en vacances le .*Vous confirmez \?/.test(q || ''), q);
  V('…la demande reste en attente', b.echanges()[0][COL.ETAT] === 'attente');
  V('…la grille est intacte (garde chez ALPHA, vacances chez BRAVO)', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', j) === 'V' && b.lire('BRAVO', lendemain) === 'V');
  // Il confirme : la garde et le repos s'écrivent par-dessus ses vacances.
  let rep = null, err = null;
  try { rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter', accepteAbsence:true })`, b.ctx); }
  catch (e) { err = e.message; }
  V('il confirme → acceptée', !err && rep && rep.etat === 'acceptee', err || rep);
  V('G puis RG écrits sur ses deux jours de vacances', b.lire('BRAVO', j) === 'G' && b.lire('BRAVO', lendemain) === 'RG');
  V('le donneur est libéré (ni garde ni repos)', b.lire('ALPHA', j) === '' && b.lire('ALPHA', lendemain) === '');
  V('le suivi de la demande dit quelles vacances ont été effacées', /V du .* effacé \(BRAVO, confirmé\)/.test(String(b.echanges()[0][COL.INFO])), b.echanges()[0][COL.INFO]);
}

console.log('\n═══ 2 ter. Échange : le demandeur noté absent confirme à l\'envoi (11/11/2026) ═══');
{
  const prep = () => {
    const b = monde(2027);
    const a = b.dates[9], c = b.dates[20];
    b.poser('ALPHA', a, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
    b.poser('BRAVO', c, 'G2'); b.poser('BRAVO', b.dates[21], 'RG');
    return { b, a, c };
  };
  const creer = (b, a, c, conf) => vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:${JSON.stringify(a)}, date2:${JSON.stringify(c)}, receveur:'BRAVO'${conf ? ', accepteAbsence:true' : ''} })`, b.ctx);
  let { b, a, c } = prep();
  b.poser('ALPHA', c, 'F');   // ALPHA en formation le jour de la garde qu'il recevrait
  let e1 = null; try { creer(b, a, c, false); } catch (e) { e1 = e.message; }
  V('sans confirmer : la question lui est posée, rien ne part', /^\[ABS\] Attention, vous êtes noté en formation le/.test(e1 || '') && b.echanges().length === 0 && b.notifs.length === 0, e1);
  const r = creer(b, a, c, true);
  V('il confirme : la proposition part, sa confirmation est notée', !!r.id && /\[ABS-OK\]/.test(String(b.echanges()[0][COL.INFO])));
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('le receveur accepte sans question (lui n\'est pas absent)', rep.etat === 'acceptee', rep);
  V('la garde reçue écrase la formation du demandeur', b.lire('ALPHA', c) === 'G2' && b.lire('BRAVO', a) === 'G');

  // CONTRE-PREUVE : une absence posée APRÈS l'envoi n'a jamais été confirmée → impossible, grille intacte.
  ({ b, a, c } = prep());
  const r2 = creer(b, a, c, false);
  b.poser('ALPHA', b.dates[21], 'V');   // vacances posées après coup sur son futur repos
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const rep2 = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r2.id)}, reponse:'accepter', accepteAbsence:true })`, b.ctx);
  V('contre-preuve : absence du demandeur jamais confirmée → impossible', rep2.etat === 'impossible' && /ALPHA est indisponible \(V\)/.test(rep2.error), rep2);
  V('contre-preuve : la grille est intacte', JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant);
}

console.log('\n═══ 2 quater. Vacances écrasées ET 18 h repris : les deux confirmations, le 18 h suit (11/11/2026) ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', j, 'V'); b.poser('BRAVO', lendemain, '18');
  let e18 = null; try { vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx); } catch (e) { e18 = e.message; }
  V('le donneur est d\'abord prévenu qu\'il reprendra le 18 h', /^\[18\] /.test(e18 || ''), e18);
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO', accepte18:true })`, b.ctx);
  let q = null; try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); } catch (e) { q = e.message; }
  V('puis le receveur est interrogé sur ses vacances', /^\[ABS\] .*en vacances le/.test(q || ''), q);
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter', accepteAbsence:true })`, b.ctx);
  V('acceptée : G sur ses vacances, RG sur son ancien 18 h', rep.etat === 'acceptee' && b.lire('BRAVO', j) === 'G' && b.lire('BRAVO', lendemain) === 'RG', rep);
  V('le 18 h passe au donneur, comme avant', String(b.lire('ALPHA', lendemain)) === '18', b.lire('ALPHA', lendemain));
}

console.log('\n═══ 2 quinquies. Annuler sa proposition (11/11/2026) ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  let e1 = null; try { vm.runInContext(`annulerEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)} })`, b.ctx); } catch (e) { e1 = e.message; }
  V('le collègue ne peut pas annuler la proposition d\'un autre', /Seul celui qui a fait la proposition/.test(e1 || ''), e1);
  V('…elle reste en attente', b.echanges()[0][COL.ETAT] === 'attente');
  b.notifs.length = 0; b.kv.length = 0;
  const rep = vm.runInContext(`annulerEchange(${JSON.stringify(user('ALPHA'))}, { id:${JSON.stringify(r.id)} })`, b.ctx);
  V('le demandeur annule : état « annulee »', rep.etat === 'annulee' && b.echanges()[0][COL.ETAT] === 'annulee' && !!b.echanges()[0][COL.REPONDU_LE], b.echanges()[0]);
  V('le planning n\'a pas bougé', JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant);
  V('le collègue est prévenu, et lui seul', b.notifs.length === 1 && b.notifs[0].cible.id === 'BRAVO' && /a annulé sa proposition du/.test(b.notifs[0].corps), b.notifs);
  V('la clé `echanges` est poussée au miroir', b.kv.some(c => c.indexOf('echanges') > -1), b.kv);
  let e2 = null; try { vm.runInContext(`annulerEchange(${JSON.stringify(user('ALPHA'))}, { id:${JSON.stringify(r.id)} })`, b.ctx); } catch (e) { e2 = e.message; }
  V('annuler deux fois : refusé (plus rien à annuler)', /plus rien à annuler/.test(e2 || ''), e2);
  let e3 = null; try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); } catch (e) { e3 = e.message; }
  V('CONTRE-PREUVE : une proposition annulée ne s\'accepte plus', /déjà annulee/.test(e3 || '') && JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant, e3);
}

console.log('\n═══ 2 sexies. Accepter ou annuler rafraîchit le planning de l\'année DE LA DEMANDE (11/11/2026) ═══');
{
  /* Vu en réel : année active 2026, échange sur 2027. L'accroche ne recevait
     que l'identifiant, se repliait sur 2026 et ne repoussait pas le planning
     2027 : vue annuelle et « Mes gardes » restaient sur l'ancien planning. */
  const b = monde(2027, { anneeActive: 2026 });
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  vm.runInContext(extraireFonction('../gas/miroir.gs', '_miroirAnneeDuPayload_'), b.ctx);
  const an = p => vm.runInContext('_miroirAnneeDuPayload_(' + JSON.stringify(p) + ')', b.ctx);
  V('accepter (identifiant seul) → année 2027, lue dans la demande', an({ action:'repondreEchange', id:r.id, reponse:'accepter' }) === 2027);
  V('annuler (identifiant seul) → année 2027', an({ action:'annulerEchange', id:r.id }) === 2027);
  V('une année envoyée par l\'écran reste prioritaire', an({ action:'repondreEchange', id:r.id, year:2028 }) === 2028);
  V('CONTRE-PREUVE : identifiant inconnu → 0 (repli sur l\'année active, comme avant)', an({ action:'repondreEchange', id:'E-inconnu' }) === 0);
  V('une autre action sans année n\'est pas touchée', an({ action:'saveIndispos' }) === 0);
  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  V('l\'écran envoie l\'année de la demande quand il accepte', /if \(_it && _it\.annee\) charge\.year = Number\(_it\.annee\);/.test(idx));
  V('…et quand il annule', /action:'annulerEchange', id:id \}, _it && _it\.annee \? \{ year: Number\(_it\.annee\) \}/.test(idx));
}

console.log('\n═══ 2 bis. Indisponibilité de campagne seule (INDISPOS) : ne bloque plus, l\'accord fait foi ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', j, 'VAC', `INDISPOS_2027`);
  b.poser('BRAVO', lendemain, 'INDISPO', `INDISPOS_2027`);
  let refus = null, r = null;
  try { r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('la demande est créée malgré INDISPOS', !refus && r && !!r.id, refus);
  let refus2 = null;
  try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r && r.id)}, reponse:'accepter' })`, b.ctx); }
  catch (e) { refus2 = e.message; }
  V('le receveur accepte : la garde et son repos passent chez lui', !refus2 && b.lire('BRAVO', j) === 'G' && b.lire('BRAVO', lendemain) === 'RG', refus2);
}

console.log('\n═══ 3. Créer sans détenir la garde : refus ═══');
{
  const b = monde(2027);
  let refus = null;
  try { vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(b.dates[9])}, receveur:'BRAVO' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('refus « rien à donner »', /rien a donner/i.test(refus || ''), refus);
  V('se proposer une garde à soi-même est refusé', (() => {
    try { vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(b.dates[9])}, receveur:'ALPHA' })`, b.ctx); return false; }
    catch (e) { return /soi-même/i.test(e.message); }
  })());
}

console.log('\n═══ 4. Accepter : le planning s\'écrit tout seul, les DEUX sont prévenus ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('état « acceptée »', rep.etat === 'acceptee' && b.echanges()[0][COL.ETAT] === 'acceptee');
  V('la garde a changé de mains', b.lire('BRAVO', j) === 'G' && b.lire('ALPHA', j) === '');
  V('le repos de garde suit', b.lire('BRAVO', lendemain) === 'RG' && b.lire('ALPHA', lendemain) === '');
  const cibles = b.notifs.map(n => n.cible && n.cible.id).sort();
  V('les deux MAR sont notifiés, chacun nommément', JSON.stringify(cibles) === JSON.stringify(['ALPHA', 'BRAVO']), b.notifs);
  V('l\'horodatage de réponse est posé', !!b.echanges()[0][COL.REPONDU_LE]);
}

console.log('\n═══ 5. Refuser : rien ne bouge au planning, le demandeur est prévenu ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'refuser' })`, b.ctx);
  V('état « refusée »', b.echanges()[0][COL.ETAT] === 'refusee');
  V('la garde n\'a pas bougé', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', j) === '');
  V('seul le demandeur est notifié du refus', b.notifs.length === 1 && b.notifs[0].cible.id === 'ALPHA', b.notifs);
}

console.log('\n═══ 6. Sécurité : seul le receveur répond, et une seule fois ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  let refus = null;
  try { vm.runInContext(`repondreEchange(${JSON.stringify(user('CHARLIE'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('un tiers ne peut pas répondre', /destinataire/i.test(refus || ''), refus);
  V('même le DEMANDEUR ne peut pas accepter sa propre demande', (() => {
    try { vm.runInContext(`repondreEchange(${JSON.stringify(user('ALPHA'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); return false; }
    catch (e) { return /destinataire/i.test(e.message); }
  })());
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'refuser' })`, b.ctx);
  let refus2 = null;
  try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); }
  catch (e) { refus2 = e.message; }
  V('répondre deux fois est refusé — l\'état ne se réécrit pas', /déjà/i.test(refus2 || '') && b.echanges()[0][COL.ETAT] === 'refusee', refus2);
}

console.log('\n═══ 7. Le planning a bougé entre création et acceptation : « impossible », grille INTACTE ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  // Entre-temps, BRAVO reçoit une garde la veille (comité, autre échange…)
  const veille = b.dates[8];
  b.poser('BRAVO', veille, 'G'); b.poser('BRAVO', j, '');
  b.poser('BRAVO', j, ''); b.notifs.length = 0;
  b.poser('BRAVO', b.dates[10], ''); // (le RG de sa veille n'importe pas ici)
  const avant = JSON.stringify([b.lire('ALPHA', j), b.lire('ALPHA', lendemain)]);
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('l\'acceptation rend « impossible » au lieu d\'écrire', rep.etat === 'impossible', rep);
  V('l\'état est posé avec son motif', b.echanges()[0][COL.ETAT] === 'impossible' && !!b.echanges()[0][COL.INFO]);
  V('la grille du demandeur est INTACTE', JSON.stringify([b.lire('ALPHA', j), b.lire('ALPHA', lendemain)]) === avant);
  const cibles = b.notifs.map(n => n.cible && n.cible.id).sort();
  V('les deux MAR sont prévenus de l\'impossibilité', JSON.stringify(cibles) === JSON.stringify(['ALPHA', 'BRAVO']), b.notifs);
}

console.log('\n═══ 8. Échange de deux gardes datées (echangeGardeJours par le circuit) ═══');
{
  const b = monde(2027);
  const j1 = b.dates[9],  l1 = b.dates[10];
  const j2 = b.dates[23], l2 = b.dates[24];
  b.poser('ALPHA', j1, 'G');  b.poser('ALPHA', l1, 'RG');
  b.poser('BRAVO', j2, 'G2'); b.poser('BRAVO', l2, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:${JSON.stringify(j1)}, date2:${JSON.stringify(j2)}, receveur:'BRAVO' })`, b.ctx);
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('chaque date garde son rôle : BRAVO prend G au j1', b.lire('BRAVO', j1) === 'G' && b.lire('ALPHA', j1) === '');
  V('ALPHA prend G2 au j2', b.lire('ALPHA', j2) === 'G2' && b.lire('BRAVO', j2) === '');
  V('les repos suivent chacun leur garde', b.lire('BRAVO', l1) === 'RG' && b.lire('ALPHA', l2) === 'RG');
}

console.log('\n═══ 9. Don d\'un samedi AVEC lien : le R suit, le lien est mis à jour ═══');
{
  const b = monde(2027);
  const samedi = b.dates.find(d => new Date(d + 'T12:00:00').getDay() === 6);
  const lendemain = b.dates[b.dates.indexOf(samedi) + 1];
  const dateR = b.dates[60]; // un jour de semaine lointain, PAS ENCORE PASSÉ (2027 > aujourd'hui)
  b.poser('ALPHA', samedi, 'G'); b.poser('ALPHA', lendemain, 'RG'); b.poser('ALPHA', dateR, 'R');
  /* Comme en PRODUCTION : Sheets a coercé les cellules en objets Date. */
  b.cl.getSheetByName('LIENS_R_2027') || b.cl.ajouter('LIENS_R_2027', [['SAMEDI','MEDECIN','DATE R'], [new Date(samedi+'T00:00:00'), 'ALPHA', new Date(dateR+'T00:00:00')]]);
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(samedi)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('l\'échange est accepté', rep.etat === 'acceptee', rep);
  V('le R a quitté le donneur', b.lire('ALPHA', dateR) === '');
  V('le R est chez le receveur, MÊME date', b.lire('BRAVO', dateR) === 'R');
  const lien = b.cl.getSheetByName('LIENS_R_2027').lignes[1];
  V('la ligne LIENS_R porte le nouveau tenant', lien[1] === 'BRAVO', lien);
  V('la notification annonce le R transféré, aux deux', b.notifs.filter(n => /récupération du/.test(n.corps)).length === 2, b.notifs);
  V('AUCUNE alerte au comité (le transfert a réussi)', b.mails.length === 0 && !b.notifs.some(n => n.cible && n.cible.role === 'admin'), { mails: b.mails });
}

console.log('\n═══ 10. Don d\'un samedi SANS lien (2026) : l\'échange aboutit, le comité replace ═══');
{
  const b = monde(2027); // pas d'onglet LIENS_R du tout
  const samedi = b.dates.find(d => new Date(d + 'T12:00:00').getDay() === 6);
  const lendemain = b.dates[b.dates.indexOf(samedi) + 1];
  b.poser('ALPHA', samedi, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(samedi)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('l\'échange aboutit QUAND MÊME', rep.etat === 'acceptee' && b.lire('BRAVO', samedi) === 'G');
  /* (23/08/2026) LE MAIL EST RETIRÉ — un seul canal, décision du responsable.
     Il partait vers DIAG_EMAIL : muet si l'adresse manquait, et incapable de
     dire s'il avait été traité. L'alerte vit désormais dans l'onglet Statuts,
     là où le geste se fait, et se CALCULE : elle disparaît quand le R est posé.
     Ne reste ici que la TRACE, qui parle même écran fermé. */
  V('plus aucun mail n\'est envoyé au comité', b.mails.length === 0, b.mails);
  V('aucune notification ne cible le rôle admin', !b.notifs.some(n => n.cible && n.cible.role === 'admin'), b.notifs);
  V('la trace nomme le samedi, les deux MAR et le motif',
    b.journal.some(m => /récup à replacer/i.test(m) && m.indexOf(samedi) > -1
                        && /ALPHA/.test(m) && /BRAVO/.test(m)), b.journal.slice(-3));
  V('…et renvoie vers l\'écran où le geste se fait',
    b.journal.some(m => /onglet Statuts/.test(m)), b.journal.slice(-3));
}

/* (11/11/2026) Le R ne reste plus chez le donneur : il ne lui est plus dû.
   Le receveur reçoit un R neuf (banc_recups_auto.js) ; ICI, huit MAR
   seulement, le plancher de quinze présents rend toute date impossible :
   c'est le seul cas où le comité entre en scène. */
console.log('\n═══ 11. Samedi dont le receveur est occupé le jour du R, aucune date possible : R rendu, comité prévenu ═══');
{
  const b = monde(2027);
  const samedi = b.dates.find(d => new Date(d + 'T12:00:00').getDay() === 6);
  const lendemain = b.dates[b.dates.indexOf(samedi) + 1];
  const dateR = b.dates[60];
  b.poser('ALPHA', samedi, 'G'); b.poser('ALPHA', lendemain, 'RG'); b.poser('ALPHA', dateR, 'R');
  b.poser('BRAVO', dateR, '18'); // occupé ce jour-là
  b.cl.ajouter('LIENS_R_2027', [['SAMEDI','MEDECIN','DATE R'], [samedi, 'ALPHA', dateR]]);
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(samedi)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('l\'échange aboutit', rep.etat === 'acceptee');
  V('le donneur rend son R (le samedi n\'est plus le sien), rien d\'écrasé chez le receveur', b.lire('ALPHA', dateR) === '' && b.lire('BRAVO', dateR) === '18');
  V('la ligne LIENS_R passe au receveur, sans date', String(b.cl.getSheetByName('LIENS_R_2027').lignes[1][1]) === 'BRAVO' && !b.cl.getSheetByName('LIENS_R_2027').lignes[1][2], b.cl.getSheetByName('LIENS_R_2027').lignes[1]);
  V('la trace porte le motif ET la date du R — sans aucun mail',
    b.mails.length === 0
    && b.journal.some(m => /récup à replacer/i.test(m) && m.indexOf(dateR) > -1), b.journal.slice(-3));
  V('la trace dit qu\'aucune date n\'était possible', b.journal.some(m => /AUCUNE DATE POSSIBLE/.test(m) && /BRAVO/.test(m)), b.journal.slice(-4));
  V('le donneur est prévenu que sa récupération est retirée', b.notifs.some(n => n.cible && n.cible.id === 'ALPHA' && /retirée/.test(n.corps)), b.notifs);
}

console.log('\n═══ 12. Échange samedi ↔ samedi : AUCUN R ne bouge (décision du 12/08) ═══');
{
  const b = monde(2027);
  const samedis = b.dates.filter(d => new Date(d + 'T12:00:00').getDay() === 6);
  const s1 = samedis[0], s2 = samedis[2];
  const l1 = b.dates[b.dates.indexOf(s1) + 1], l2 = b.dates[b.dates.indexOf(s2) + 1];
  const r1 = b.dates[59], r2 = b.dates[60];
  b.poser('ALPHA', s1, 'G'); b.poser('ALPHA', l1, 'RG'); b.poser('ALPHA', r1, 'R');
  b.poser('BRAVO', s2, 'G'); b.poser('BRAVO', l2, 'RG'); b.poser('BRAVO', r2, 'R');
  b.cl.ajouter('LIENS_R_2027', [['SAMEDI','MEDECIN','DATE R'], [s1, 'ALPHA', r1], [s2, 'BRAVO', r2]]);
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:${JSON.stringify(s1)}, date2:${JSON.stringify(s2)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('les gardes sont échangées', b.lire('BRAVO', s1) === 'G' && b.lire('ALPHA', s2) === 'G');
  V('les R restent en place', b.lire('ALPHA', r1) === 'R' && b.lire('BRAVO', r2) === 'R');
  V('aucune alerte comité (ni mail ni push)', b.mails.length === 0 && !b.notifs.some(n => n.cible && n.cible.role === 'admin'));
}

console.log('\n═══ 13. Expiration : rappel UNIQUE à 24 h, expirée à 48 h ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  const f = b.cl.getSheetByName('ECHANGES');
  const ligne = f.lignes.findIndex(l => l[0] === r.id);
  const vieillir = h => { f.lignes[ligne][COL.CREE_LE] = new Date(Date.now() - h * 3600 * 1000).toISOString(); };

  b.notifs.length = 0;
  vieillir(10);
  vm.runInContext('expirerEchanges()', b.ctx);
  V('à 10 h : rien ne se passe', b.notifs.length === 0 && f.lignes[ligne][COL.ETAT] === 'attente');

  vieillir(30);
  vm.runInContext('expirerEchanges()', b.ctx);
  V('à 30 h : rappel au receveur, demande toujours en attente',
    b.notifs.length === 1 && b.notifs[0].cible.id === 'BRAVO' && f.lignes[ligne][COL.ETAT] === 'attente', b.notifs);
  V('l\'horodatage du rappel est posé', !!f.lignes[ligne][COL.RAPPEL_LE]);

  vm.runInContext('expirerEchanges()', b.ctx);
  V('relancer ne rappelle PAS une deuxième fois', b.notifs.length === 1);

  b.notifs.length = 0;
  vieillir(50);
  vm.runInContext('expirerEchanges()', b.ctx);
  V('à 50 h : expirée, demandeur notifié', f.lignes[ligne][COL.ETAT] === 'expiree'
    && b.notifs.length === 1 && b.notifs[0].cible.id === 'ALPHA', b.notifs);
  let refus = null;
  try { vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('une demande expirée ne s\'accepte plus', /expiree/i.test(refus || ''), refus);
}

console.log('\n═══ 14. La lecture pour le miroir reflète l\'onglet, telle quelle ═══');
{
  const b = monde(2027);
  /* Onglet ABSENT (état d'un classeur jamais utilisé) : la synchro horaire
     passe par cette lecture — elle doit renvoyer vide SANS créer l'onglet. */
  const env0 = vm.runInContext('getEchangesEnveloppe()', b.ctx);
  V('onglet absent : enveloppe vide, succès', env0.success === true && env0.echanges.length === 0);
  V('la LECTURE n\'a PAS créé l\'onglet', !b.cl.getSheetByName('ECHANGES'));
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  V('c\'est la CRÉATION d\'une demande qui crée l\'onglet', !!b.cl.getSheetByName('ECHANGES'));
  const env = vm.runInContext('getEchangesEnveloppe()', b.ctx);
  V('enveloppe {success:true, echanges:[…]}', env.success === true && Array.isArray(env.echanges) && env.echanges.length === 1);
  V('la ligne est complète et typée', (() => {
    const e = env.echanges[0];
    return e.type === 'don' && e.demandeur === 'ALPHA' && e.receveur === 'BRAVO' && e.etat === 'attente' && e.annee === 2027;
  })(), env.echanges[0]);
}

console.log('\n═══ 15. Le câblage de la clé `echanges` : Worker, miroir, synchro, accroches ═══');
{
  const worker = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8');
  const miroir = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
  V('le Worker accepte la clé à l\'écriture', /\|echanges\|/.test(worker));
  V('le Worker la sert aux MAR comme aux admin', /cle === 'echanges'\) return true/.test(worker));
  V('le Worker sait cibler une notification par id et par rôle', /cible\.id/.test(worker) && /cible\.role/.test(worker));
  V('le miroir sait construire la famille', /_miroirAjouteEnveloppe_\(items, 'echanges'/.test(miroir));
  V('elle est reconstruite à la synchro horaire', /'echanges'[,\]]/.test(miroir));
  V('créer une demande la republie', /creerEchange:\s*\['echanges'\]/.test(miroir));
  V('répondre republie planning + echanges', /repondreEchange:\s*\[[^\]]*'echanges'/.test(miroir));
  V('une retouche manuelle de l\'onglet ECHANGES la republie', /ECHANGES:\s*\['echanges'\]/.test(miroir));
  V('notifierPush_ transmet la cible au Worker', /charge\.cible = cible/.test(miroir));
}

console.log('\n═══ 16. L\'interrupteur : fermé par défaut, pilotes nominatifs, ouverture en un geste ═══');
{
  /* Monde avec propriétés de script pilotables. */
  const b = monde(2027);
  const PROPS = {};
  b.ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : (k === 'MIROIR_PUSH_TOKEN' ? 'JETON' : null)),
    setProperty: (k, v) => { PROPS[k] = String(v); },
    deleteProperty: k => { delete PROPS[k]; } }) };
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const aut = (id, role) => vm.runInContext(`_echangesAutorise_(${JSON.stringify({ id: id, role: role || 'mar' })})`, b.ctx);

  V('fermé par défaut : un MAR n\'est pas autorisé', aut('ALPHA') === false);
  V('l\'admin passe toujours', aut('DURAND', 'admin') === true);

  PROPS.ECHANGES_PILOTES = 'ALPHA, BRAVO';
  V('les pilotes passent (liste hors dépôt, espaces tolérés)', aut('ALPHA') === true && aut('BRAVO') === true);
  V('les autres MAR restent dehors', aut('CHARLIE') === false);
  let refus = null;
  try { vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'CHARLIE' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('proposer à un NON-pilote est refusé (il ne verrait pas l\'écran)', /pas encore ouverts/.test(refus || ''), refus);
  V('proposer à un pilote passe', !!vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx).id);

  b.kv.length = 0;
  vm.runInContext('ouvrirEchanges()', b.ctx);
  V('ouvrirEchanges : tout le monde passe', aut('CHARLIE') === true);
  V('l\'état est répliqué au KV (notif_config)', b.kv.some(cles => cles.indexOf('notif_config') > -1), b.kv);
  V('l\'état poussé dit « ouvert »', PROPS.ECHANGES_OUVERTS === 'O');
  vm.runInContext('fermerEchanges()', b.ctx);
  V('fermerEchanges : retour au circuit pilotes', aut('CHARLIE') === false && aut('ALPHA') === true);
}

console.log('\n═══ 17. Le Worker applique le MÊME interrupteur (lecture `echanges` + abonnement) ═══');
{
  const worker = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8');
  V('notif_config est poussable par le GAS', /\|notif_config\|/.test(worker));
  V('notif_config n\'est JAMAIS servie par /read', /cle === 'notif_config'\) \{ refuses/.test(worker) || /\|\| cle === 'notif_config'/.test(worker));
  V('la clé `echanges` est soumise à l\'interrupteur', /cle === 'echanges' && !\(await echangesAutorise/.test(worker));
  V('l\'abonnement s\'ouvre par notif_config, pas par redéploiement', /notif_config/.test(worker.split('notifAbonner')[1] || ''));
}

console.log('\n═══ 17 bis. Le classeur transforme les dates (vrai Sheets) : le module résiste ═══');
{
  /* La doublure coerce désormais '2027-03-XX' en objets Date à CHAQUE écriture,
     comme la production. La création, la lecture, la notification et surtout
     l'ACCEPTATION doivent rendre des textes propres — c'est le défaut du
     14/08 (« Fri Sep 03 2027… introuvable dans GARDES_2027 ») rejoué. */
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  const brutDate = b.cl.getSheetByName('ECHANGES').lignes[1][COL.DATE];
  V('la doublure a bien coercé la date écrite (objet Date)', brutDate instanceof Date, typeof brutDate);
  V('la notification est en date LISIBLE (jj/mm/aaaa), jamais « GMT »',
    /\d{2}\/\d{2}\/\d{4}/.test(b.notifs[0].corps) && b.notifs[0].corps.indexOf('GMT') === -1, b.notifs[0].corps);
  const env = vm.runInContext('getEchangesEnveloppe()', b.ctx);
  V('la lecture rend « AAAA-MM-JJ », pas la date verbeuse', env.echanges[0].date === j, env.echanges[0].date);
  const rep = vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('l\'ACCEPTATION passe malgré la coercition (le défaut du 14/08)', rep.etat === 'acceptee', rep);
  V('la garde a réellement changé de mains', b.lire('BRAVO', j) === 'G' && b.lire('ALPHA', j) === '');
}

console.log('\n═══ 18. La pastille d\'icône : la chaîne complète, du compteur au téléphone ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('ALPHA', b.dates[16], 'G'); b.poser('ALPHA', b.dates[17], 'RG');
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  V('1re demande : la notification porte pastille = 1', b.notifs[0].cible && b.notifs[0].cible.pastille === 1, b.notifs[0]);
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(b.dates[16])}, receveur:'BRAVO' })`, b.ctx);
  V('2e demande au même receveur : pastille = 2', b.notifs[1].cible && b.notifs[1].cible.pastille === 2, b.notifs[1]);

  const miroir = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
  const worker = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8');
  const dash   = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  V('le miroir transporte le nombre', /charge\.pastille = cible\.pastille/.test(miroir));
  /* (23/08 — pastille UNIFIÉE) Le chiffre des échanges voyage toujours
     jusqu'au Worker (les deux vérifications ci-dessus) mais celui-ci
     l'IGNORE : la charge porte le compteur de non-vus, plafonné à 99 —
     prouvé dynamiquement par banc_notif N6, charge déchiffrée à l'appui.
     Le calcul côté échanges est inerte, à retirer au prochain lot echanges. */
  V('le Worker met le COMPTEUR de non-vus dans la charge (plafonné à 99), pas le chiffre imposé',
    /notif_cpt_/.test(worker) && /pastille: pastille/.test(worker) && !/pastilleImposee/.test(worker));
  /* La pose par sw.js (v4) est vérifiée dans banc_notif.mjs : elle part avec
     lui dans le SECOND push (le gel du canal tient jusqu'au 4/09). */
  V('le portail l\'efface à l\'ouverture', /clearAppBadge/.test(dash));
}

console.log('\n═══ 19. Le piège du 14/08 : jamais de poussée au relais avec des écritures non validées ═══');
{
  /* Le vrai Apps Script peut servir une relecture d'AVANT les écritures de la
     même exécution tant que flush n'a pas été appelé : l'acceptation restait
     « en attente » sur les téléphones alors que le classeur disait acceptee.
     Ici, chaque geste du circuit tourne, et la doublure compte toute poussée
     partie avec des écritures encore en attente. Attendu : ZÉRO. */
  const b = monde(2027, { liensR: [] });
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G');
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  const id = String(b.echanges()[0][COL.ID]);
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(id)}, reponse:'accepter' })`, b.ctx);
  V('création puis acceptation : aucune poussée avec écritures en attente', b.attente.poussesSansFlush === 0, b.attente);
  V('l\'onglet dit bien acceptee', String(b.echanges()[0][COL.ETAT]) === 'acceptee');

  const c = monde(2027);
  const k = c.dates[16];
  c.poser('ALPHA', k, 'G');
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(k)}, receveur:'BRAVO' })`, c.ctx);
  const id2 = String(c.echanges()[0][COL.ID]);
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(id2)}, reponse:'refuser' })`, c.ctx);
  V('refus : aucune poussée avec écritures en attente', c.attente.poussesSansFlush === 0, c.attente);
}

console.log('\n═══ 20. Un humain lit ces messages : « Dr Durand », jamais « DURAND » ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  const k = b.dates[16], klendemain = b.dates[17];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', k, 'G'); b.poser('BRAVO', klendemain, 'RG');

  // 1. proposition de don
  const r1 = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  V('la proposition dit « Dr Alpha », pas « ALPHA »',
    /Dr Alpha vous propose/.test(b.notifs[0].corps) && !/ALPHA/.test(b.notifs[0].corps), b.notifs[0]);

  // 2. refus
  b.notifs.length = 0;
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r1.id)}, reponse:'refuser' })`, b.ctx);
  V('le refus dit « Dr Bravo a décliné »',
    /Dr Bravo a décliné/.test(b.notifs[0].corps) && !/BRAVO/.test(b.notifs[0].corps), b.notifs[0]);

  // 3. confirmation d'un don
  const r2 = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  b.notifs.length = 0;
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r2.id)}, reponse:'accepter' })`, b.ctx);
  V('la confirmation dit « du Dr Alpha au Dr Bravo »',
    /passe du Dr Alpha au Dr Bravo/.test(b.notifs[0].corps), b.notifs[0]);
  V('les deux MAR reçoivent la confirmation', b.notifs.filter(n => /Échange confirmé/.test(n.titre)).length === 2);

  // 4. proposition d'échange (deux dates)
  const c = monde(2027);
  c.poser('ALPHA', c.dates[9], 'G'); c.poser('ALPHA', c.dates[10], 'RG');
  c.poser('BRAVO', c.dates[16], 'G'); c.poser('BRAVO', c.dates[17], 'RG');
  const r3 = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'echange', year:2027, date:${JSON.stringify(c.dates[9])}, date2:${JSON.stringify(c.dates[16])}, receveur:'BRAVO' })`, c.ctx);
  V('la proposition d\'échange dit « Dr Alpha »', /Dr Alpha vous propose/.test(c.notifs[0].corps), c.notifs[0]);
  c.notifs.length = 0;
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r3.id)}, reponse:'accepter' })`, c.ctx);
  V('la confirmation d\'échange dit « le Dr Alpha … le Dr Bravo »',
    /le Dr Alpha prend le/.test(c.notifs[0].corps) && /le Dr Bravo prend le/.test(c.notifs[0].corps), c.notifs[0]);

  // 5-6. rappel à 24 h et expiration à 48 h
  const d = monde(2027);
  d.poser('ALPHA', d.dates[9], 'G'); d.poser('ALPHA', d.dates[10], 'RG');
  vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(d.dates[9])}, receveur:'BRAVO' })`, d.ctx);
  const f = d.cl.getSheetByName('ECHANGES');
  const vieux = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  f.lignes[1][COL.CREE_LE] = vieux;
  d.notifs.length = 0;
  vm.runInContext('expirerEchanges()', d.ctx);
  V('le rappel à 24 h dit « Dr Alpha attend votre réponse »',
    d.notifs.some(n => /Dr Alpha attend votre réponse/.test(n.corps)), d.notifs);
  f.lignes[1][COL.CREE_LE] = new Date(Date.now() - 60 * 3600 * 1000).toISOString();
  d.notifs.length = 0;
  vm.runInContext('expirerEchanges()', d.ctx);
  V('l\'expiration dit « au Dr Bravo »',
    d.notifs.some(n => /au Dr Bravo est restée/.test(n.corps)), d.notifs);

  /* (08/09/2026) Le titre « Pr » etait attache a un NOM ecrit en dur, des deux
     cotes. Il vient maintenant de la colonne NOM de MEDECINS et voyage avec
     l'identite. Ce que ce scenario garde : que l'ecran et les notifications
     lisent LA MEME source, et qu'aucun des deux ne cite un praticien. */
  const dash = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'gas', 'echanges.gs'), 'utf8');
  V('l\'écran déduit le titre de la liste reçue', /TITRES_PR\.indexOf\(id\)/.test(dash));
  V('les notifications lisent la même source', /_effectifTitresGas_\(\)\.titresPr/.test(gs));
  V('ni l\'écran ni les notifications ne nomment un praticien',
    !/'PERRIN'/.test(dash) && !/'PERRIN'/.test(gs));
  /* La liste est deduite de la colonne NOM par les DEUX chemins d'identite :
     la copie rapide et la connexion au serveur. Un seul des deux, et le titre
     changerait selon que le relais repond ou non. */
  const mir = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
  const ind = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;
  V('la copie rapide porte la liste', /acces\.titresPr/.test(mir));
  V('le serveur porte la même liste', /titresPr: _effectifTitresGas_\(\)/.test(ind));
}

/* (10/11/2026) Défaut trouvé en production : deux dons de 2027 acceptés pendant
   que 2026 était l'année active n'ont jamais atteint les secrétaires de paie —
   le planning et les mails étaient relancés pour 2026. */
console.log('\n═══ ANNÉE · un don de 2027 accepté quand 2026 est l\'année active ═══');
{
  const b = monde(2027, { anneeActive: 2026 });
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G2'); b.poser('ALPHA', lendemain, 'RG');
  const r = vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx);
  vm.runInContext(`repondreEchange(${JSON.stringify(user('BRAVO'))}, { id:${JSON.stringify(r.id)}, reponse:'accepter' })`, b.ctx);
  V('la garde a bien changé de mains', b.lire('BRAVO', j) === 'G2' && b.lire('ALPHA', j) === '');
  V('le planning republié est celui de 2027', b.annees.republie.length > 0 && b.annees.republie.every(y => Number(y) === 2027), b.annees.republie);
  V('les mails (MAR et paie) sont prévus pour 2027', b.annees.prevenu.length > 0 && b.annees.prevenu.every(y => Number(y) === 2027), b.annees.prevenu);
}

/* ═══════════════════════════════════════════════════════════════════════
   (12/11/2026) LOT 1 DU DIAGNOSTIC — sans objet, doublons, gardes passées
   Contre-preuve : ces trois sections échouent sur echanges.gs 2026-11-11.7.
   ═══════════════════════════════════════════════════════════════════════ */
const C3 = MARS[2], C4 = MARS[3];
const creer = (b, qui, p) => { try { return vm.runInContext(`creerEchange(${JSON.stringify(user(qui))}, ${JSON.stringify(p)})`, b.ctx); } catch (e) { return { erreur: e.message }; } };
const repondre = (b, qui, id, rep) => { try { return vm.runInContext(`repondreEchange(${JSON.stringify(user(qui))}, ${JSON.stringify({ id, reponse: rep || 'accepter' })})`, b.ctx); } catch (e) { return { erreur: e.message }; } };
const etats = b => b.echanges().map(e => e[COL.RECEVEUR] + ':' + e[COL.ETAT]);

console.log('\n═══ L1-A. Une garde proposée à deux collègues : le premier accepte, l\'autre demande se ferme seule ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const d1 = creer(b, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
  const d2 = creer(b, 'ALPHA', { type:'don', year:2027, date:j, receveur:C3 });
  V('les deux propositions partent (deux collègues différents : permis)', !!d1.id && !!d2.id, [d1, d2]);
  const nAvant = b.notifs.length;
  const r = repondre(b, 'BRAVO', d1.id);
  V('BRAVO accepte : la garde est à lui', r.etat === 'acceptee' && b.lire('BRAVO', j) === 'G', r);
  const e = b.echanges();
  V('la demande faite à ' + C3 + ' passe « sans objet », plus « en attente »', e[1][COL.ETAT] === 'sansobjet', etats(b));
  V('…avec le motif en clair', /n'a plus la garde du/.test(String(e[1][COL.INFO])), e[1][COL.INFO]);
  V('…et une date de clôture', !!String(e[1][COL.REPONDU_LE]).trim());
  V('la pastille de ' + C3 + ' retombe à 0', vm.runInContext(`_echangesEnAttentePour_(${JSON.stringify(C3)})`, b.ctx) === 0);
  V('aucune notification pour ' + C3 + ' (décision du 12/11 : il n\'a rien à faire)',
    b.notifs.slice(nAvant).every(n => !(n.cible && n.cible.id === C3)), b.notifs.slice(nAvant).map(n => n.cible));
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const r2 = repondre(b, C3, d2.id);
  V(C3 + ' ne peut plus l\'accepter, la grille ne bouge pas', /déjà sansobjet/.test(r2.erreur || '') && JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant, r2);
  V('la copie rapide reçoit la liste à jour après la fermeture', b.kv.length > 0 && b.attente.poussesSansFlush === 0, b.attente);
}

console.log('\n═══ L1-B. Sans objet : échange dont la contrepartie est partie, geste du comité, filet horaire ═══');
{
  // Échange ALPHA(j) ↔ BRAVO(k) en attente ; BRAVO donne k à un tiers → l'échange n'a plus d'objet.
  const b = monde(2027);
  const j = b.dates[9], k = b.dates[30];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.poser('BRAVO', k, 'G2'); b.poser('BRAVO', b.dates[31], 'RG');
  const ech = creer(b, 'ALPHA', { type:'echange', year:2027, date:j, date2:k, receveur:'BRAVO' });
  const don = creer(b, 'BRAVO', { type:'don', year:2027, date:k, receveur:C3 });
  repondre(b, C3, don.id);
  const e = b.echanges();
  V('la garde demandée en retour a changé de mains : l\'échange passe « sans objet »', e[0][COL.ETAT] === 'sansobjet' && /Bravo n'a plus la garde/i.test(String(e[0][COL.INFO])), e[0]);
  V('la garde d\'ALPHA n\'a pas bougé', b.lire('ALPHA', j) === 'G');

  // Geste du comité : la garde proposée est donnée à un autre par le comité.
  const c = monde(2027);
  c.poser('ALPHA', j, 'G'); c.poser('ALPHA', c.dates[10], 'RG');
  creer(c, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
  vm.runInContext(`appliquerGesteComite_({ type:'donGarde', year:2027, date:${JSON.stringify(j)}, doctorId:'ALPHA', doctorId2:${JSON.stringify(C3)} })`, c.ctx);
  V('don fait par le comité : la demande entre MAR se ferme', c.echanges()[0][COL.ETAT] === 'sansobjet', etats(c));
  V('…et la copie rapide est poussée', c.kv.length >= 2, c.kv);

  // Filet horaire : la case est vidée par un autre chemin (saisie dans le classeur).
  const d = monde(2027);
  d.poser('ALPHA', j, 'G'); d.poser('ALPHA', d.dates[10], 'RG');
  creer(d, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
  d.poser('ALPHA', j, 'V');
  const x = vm.runInContext('expirerEchanges()', d.ctx);
  V('passage horaire : garde remplacée par des vacances → sans objet', d.echanges()[0][COL.ETAT] === 'sansobjet' && x.changements === 1, [etats(d), x]);

  // TÉMOINS : ce qui ne doit PAS se fermer.
  const t = monde(2027);
  t.poser('ALPHA', j, 'G'); t.poser('ALPHA', t.dates[10], 'RG');
  t.poser(C3, k, 'G'); t.poser(C3, t.dates[31], 'RG');
  t.poser('ALPHA', t.dates[50], '18'); t.poser('BRAVO', t.dates[52], '18');
  creer(t, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
  creer(t, 'ALPHA', { type:'echange18', year:2027, date:t.dates[50], date2:t.dates[52], receveur:'BRAVO' });
  const autre = creer(t, C3, { type:'don', year:2027, date:k, receveur:C4 });
  repondre(t, C4, autre.id);
  V('témoin : un geste sur une AUTRE garde ne ferme rien', t.echanges()[0][COL.ETAT] === 'attente' && t.echanges()[1][COL.ETAT] === 'attente', etats(t));
  t.poser('BRAVO', t.dates[52], '');
  vm.runInContext('expirerEchanges()', t.ctx);
  V('échange de 18 h : le 18 h demandé en retour a disparu → sans objet, le don reste en attente',
    t.echanges()[1][COL.ETAT] === 'sansobjet' && /n'a plus le 18 h/.test(String(t.echanges()[1][COL.INFO])) && t.echanges()[0][COL.ETAT] === 'attente', t.echanges().map(e => [e[COL.ETAT], e[COL.INFO]]));

  // Grille illisible : on ne décide RIEN.
  const u = monde(2027);
  u.poser('ALPHA', j, 'G'); u.poser('ALPHA', u.dates[10], 'RG');
  creer(u, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
  const f = u.cl.getSheetByName('ECHANGES'); f.lignes[1][COL.ANNEE] = 2031;   // année sans onglet
  vm.runInContext('expirerEchanges()', u.ctx);
  V('onglet de l\'année introuvable : la demande reste en attente (jamais fermée à l\'aveugle)', u.echanges()[0][COL.ETAT] === 'attente', etats(u));
}

console.log('\n═══ L1-C. Doublon : la même garde ne se propose pas deux fois au même collègue ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const p = { type:'don', year:2027, date:j, receveur:'BRAVO' };
  const d1 = creer(b, 'ALPHA', p);
  const nAvant = b.notifs.length;
  const d2 = creer(b, 'ALPHA', p);
  V('second envoi refusé avec un message clair', /déjà proposé cette garde/.test(d2.erreur || ''), d2);
  V('une seule ligne dans ECHANGES', b.echanges().length === 1, etats(b));
  V('le collègue n\'est pas notifié une seconde fois', b.notifs.length === nAvant);
  V('la même garde à un AUTRE collègue reste permise', !!creer(b, 'ALPHA', { type:'don', year:2027, date:j, receveur:C3 }).id);
  repondre(b, 'BRAVO', d1.id, 'refuser');
  V('après un refus, on peut la lui reproposer', !!creer(b, 'ALPHA', p).id, etats(b));
  // même date, mais échange contre une autre garde : ce n'est pas un doublon
  const k = b.dates[30], k2 = b.dates[40];
  b.poser('BRAVO', k, 'G'); b.poser('BRAVO', b.dates[31], 'RG'); b.poser('BRAVO', k2, 'G'); b.poser('BRAVO', b.dates[41], 'RG');
  const e1 = creer(b, 'ALPHA', { type:'echange', year:2027, date:j, date2:k, receveur:'BRAVO' });
  const e2 = creer(b, 'ALPHA', { type:'echange', year:2027, date:j, date2:k2, receveur:'BRAVO' });
  const e3 = creer(b, 'ALPHA', { type:'echange', year:2027, date:j, date2:k2, receveur:'BRAVO' });
  V('deux échanges contre deux gardes différentes : permis ; le même échange deux fois : refusé', !!e1.id && !!e2.id && /déjà proposé/.test(e3.erreur || ''), [e1, e2, e3]);
}

console.log('\n═══ L1-D. Garde passée : ni proposée, ni acceptée ═══');
{
  const b = monde(2027, { aujourdhui: '2027-01-20' });
  const hier = '2027-01-19', jour = '2027-01-20', demain = '2027-01-21';
  [hier, jour].forEach(x => b.poser('ALPHA', x, ''));
  b.poser('ALPHA', hier, 'G'); b.poser('ALPHA', jour, 'RG');
  const avant = JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);
  const r = creer(b, 'ALPHA', { type:'don', year:2027, date:hier, receveur:'BRAVO' });
  V('garde d\'hier : proposition refusée', /est déjà passée/.test(r.erreur || ''), r);
  V('…rien n\'est créé, la grille ne bouge pas', b.echanges().length === 0 && JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes) === avant);

  const c = monde(2027, { aujourdhui: '2027-01-20' });
  c.poser('ALPHA', jour, 'G'); c.poser('ALPHA', demain, 'RG');
  V('garde du JOUR MÊME : toujours donnable', !!creer(c, 'ALPHA', { type:'don', year:2027, date:jour, receveur:'BRAVO' }).id);
  c.poser('BRAVO', hier, 'G'); c.poser('BRAVO', jour, '');
  c.poser(C3, '2027-01-12', 'G'); c.poser(C3, '2027-01-13', 'RG'); c.poser('ALPHA', '2027-02-10', 'G'); c.poser('ALPHA', '2027-02-11', 'RG');
  const e = creer(c, 'ALPHA', { type:'echange', year:2027, date:'2027-02-10', date2:'2027-01-12', receveur:C3 });
  V('échange contre une garde passée du collègue : refusé', /est déjà passée/.test(e.erreur || ''), e);

  // Proposée la veille, acceptée après la garde.
  const horlogeD = { aujourdhui: '2027-01-18' };   // l'horloge du monde se lit à chaque appel : on l'avance
  const d = monde(2027, horlogeD);
  d.poser('ALPHA', hier, 'G'); d.poser('ALPHA', jour, 'RG');
  const dd = creer(d, 'ALPHA', { type:'don', year:2027, date:hier, receveur:'BRAVO' });
  V('proposée la veille : acceptée normalement à l\'envoi', !!dd.id, dd);
  horlogeD.aujourdhui = '2027-01-21';
  const g = JSON.stringify(d.cl.getSheetByName('GARDES_2027').lignes);
  const nAvant = d.notifs.length, repAvant = d.annees.republie.length;
  const rr = repondre(d, 'BRAVO', dd.id);
  V('acceptée APRÈS la garde : fermée « sans objet », motif rendu à l\'écran', rr.etat === 'sansobjet' && /est déjà passée/.test(rr.error || ''), rr);
  V('…le planning du passé n\'est pas réécrit', JSON.stringify(d.cl.getSheetByName('GARDES_2027').lignes) === g);
  V('…aucune republication (donc aucun mail paie), aucune notification', d.annees.republie.length === repAvant && d.notifs.length === nAvant);
  V('…l\'état est écrit dans ECHANGES', d.echanges()[0][COL.ETAT] === 'sansobjet' && /passée/.test(String(d.echanges()[0][COL.INFO])), d.echanges()[0]);

  // Filet horaire : une demande restée en attente dont la garde est passée.
  const horlogeH = { aujourdhui: '2027-01-18' };
  const h = monde(2027, horlogeH);
  h.poser('ALPHA', hier, 'G'); h.poser('ALPHA', jour, 'RG');
  creer(h, 'ALPHA', { type:'don', year:2027, date:hier, receveur:'BRAVO' });
  horlogeH.aujourdhui = '2027-01-20';
  vm.runInContext('expirerEchanges()', h.ctx);
  V('passage horaire : garde passée → sans objet', h.echanges()[0][COL.ETAT] === 'sansobjet', etats(h));
  // Le comité, lui, garde la main sur le passé (correction d'un planning).
  const m = monde(2027, { aujourdhui: '2027-01-25' });
  m.poser('ALPHA', hier, 'G'); m.poser('ALPHA', jour, 'RG');
  let errC = null; try { vm.runInContext(`applyModification({ type:'donGarde', year:2027, date:'${hier}', doctorId:'ALPHA', doctorId2:'BRAVO' })`, m.ctx); } catch (x) { errC = x.message; }
  V('témoin : le comité peut toujours corriger une garde passée', errC === null && m.lire('BRAVO', hier) === 'G', errC);
}

console.log('\n═══ RÉA 1 · une garde prise dans SA semaine Réa 1 est dite au MAR, qui confirme (12/11/2026) ═══');
{
  /* 2027 : dates[0] = lundi 04/01. BRAVO est Réa 1 la semaine du 11/01,
     ALPHA celle du 18/01. Le tableau est écrit comme le vrai : dates en
     JJ/MM/AAAA, initiales (BR, AL) traduites par l'onglet MEDECINS. */
  const prep = (sansRea1) => {
    const b = monde(2027);
    b.cl.ajouter('MEDECINS', [['ID','NOM','INITIALES'], ['ALPHA','DR ALPHA','AL'], ['BRAVO','DR BRAVO','BR'], ['CHARLI','DR CHARLI','CH']]);
    if (!sansRea1) b.cl.ajouter('REA1_2027', [['Semaine n°','Du','Au','REA 1 (1re semaine)','REA 2 (2e semaine)'],
      ['2','11/01/2027','15/01/2027','BR','AL'], ['3','18/01/2027','22/01/2027','AL','BR']]);
    vm.runInContext(`var COL_MED = { ID:0, NOM:1, INITIALES:2 };
      function _medecinsRows_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS').getDataRange().getValues(); }`, b.ctx);
    return b;
  };
  const DIM = '2027-01-10', LUN = '2027-01-11', MAR_ = '2027-01-12', VEN = '2027-01-15', SAM = '2027-01-16';
  const creer = (b, qui, p) => vm.runInContext(`creerEchange(${JSON.stringify(user(qui))}, ${JSON.stringify(p)})`, b.ctx);
  const repondre = (b, qui, p) => vm.runInContext(`repondreEchange(${JSON.stringify(user(qui))}, ${JSON.stringify(p)})`, b.ctx);
  const grille = b => JSON.stringify(b.cl.getSheetByName('GARDES_2027').lignes);

  // A. DON : le receveur prendrait le dimanche, veille de sa semaine Réa 1.
  let b = prep();
  b.poser('ALPHA', DIM, 'G'); b.poser('ALPHA', LUN, 'RG');
  let r = creer(b, 'ALPHA', { type:'don', year:2027, date:DIM, receveur:'BRAVO' });
  V('A. la proposition part (le donneur n\'est pas concerné)', !!r.id);
  V('A. la notification prévient le receveur, semaine nommée', /Attention, la garde du 10\/01\/2027 tombe dans votre semaine Réa 1 \(du 11\/01\/2027 au 15\/01\/2027\)\./.test(b.notifs[0].corps), b.notifs[0].corps);
  let avant = grille(b), q = null;
  try { repondre(b, 'BRAVO', { id:r.id, reponse:'accepter' }); } catch (e) { q = e.message; }
  V('A. accepter sans confirmer → la question [REA1]', /^\[REA1\] Attention, la garde du 10\/01\/2027 tombe dans votre semaine Réa 1 \(du 11\/01\/2027 au 15\/01\/2027\)\. Vous confirmez \?$/.test(q || ''), q);
  V('A. …rien n\'est écrit, la demande attend toujours', grille(b) === avant && b.echanges()[0][COL.ETAT] === 'attente');
  let rep = repondre(b, 'BRAVO', { id:r.id, reponse:'accepter', accepteRea1:true });
  V('A. il confirme → acceptée, la garde est chez lui', rep.etat === 'acceptee' && b.lire('BRAVO', DIM) === 'G' && b.lire('ALPHA', DIM) === '', rep);
  V('A. le suivi de la demande garde la trace', /⚠ garde du 2027-01-10 en semaine Réa 1 de BRAVO/.test(String(b.echanges()[0][COL.INFO])), b.echanges()[0][COL.INFO]);

  // B. Les jours qui ne déclenchent RIEN : vendredi, samedi ; et un MAR hors équipe réa.
  [[VEN, 'vendredi de sa semaine'], [SAM, 'samedi']].forEach(([j, nom]) => {
    const w = prep(); w.poser('ALPHA', j, 'G'); w.poser('ALPHA', w.dates[w.dates.indexOf(j) + 1], 'RG');
    const d = creer(w, 'ALPHA', { type:'don', year:2027, date:j, receveur:'BRAVO' });
    let e = null, a = null; try { a = repondre(w, 'BRAVO', { id:d.id, reponse:'accepter' }); } catch (x) { e = x.message; }
    V('B. garde du ' + nom + ' : aucune question, acceptée d\'un geste', !e && a && a.etat === 'acceptee' && !/Réa 1/.test(w.notifs[0].corps), e);
  });
  {
    const w = prep(); w.poser('ALPHA', MAR_, 'G'); w.poser('ALPHA', '2027-01-13', 'RG');
    const d = creer(w, 'ALPHA', { type:'don', year:2027, date:MAR_, receveur:'CHARLI' });
    let e = null, a = null; try { a = repondre(w, 'CHARLI', { id:d.id, reponse:'accepter' }); } catch (x) { e = x.message; }
    V('B. un MAR hors équipe réa prend la même nuit sans question', !e && a && a.etat === 'acceptee', e);
    V('B. …et aucune trace Réa 1 dans le suivi', !/Réa 1/.test(String(w.echanges()[0][COL.INFO])));
  }
  {
    const w = prep(true); w.poser('ALPHA', DIM, 'G'); w.poser('ALPHA', LUN, 'RG');
    const d = creer(w, 'ALPHA', { type:'don', year:2027, date:DIM, receveur:'BRAVO' });
    let e = null, a = null; try { a = repondre(w, 'BRAVO', { id:d.id, reponse:'accepter' }); } catch (x) { e = x.message; }
    V('B. sans onglet REA1 : rien ne change', !e && a && a.etat === 'acceptee', e);
  }

  // C. ÉCHANGE : le DEMANDEUR prendrait un mardi de sa propre semaine Réa 1 → question à l'envoi.
  b = prep();
  b.poser('ALPHA', '2027-02-10', 'G'); b.poser('ALPHA', '2027-02-11', 'RG');
  b.poser('BRAVO', '2027-01-19', 'G2'); b.poser('BRAVO', '2027-01-20', 'RG');
  q = null; try { creer(b, 'ALPHA', { type:'echange', year:2027, date:'2027-02-10', date2:'2027-01-19', receveur:'BRAVO' }); } catch (e) { q = e.message; }
  V('C. sans confirmer : la question lui est posée, rien ne part', /^\[REA1\] Attention, la garde du 19\/01\/2027 tombe dans votre semaine Réa 1 \(du 18\/01\/2027 au 22\/01\/2027\)/.test(q || '') && b.echanges().length === 0 && b.notifs.length === 0, q);
  r = creer(b, 'ALPHA', { type:'echange', year:2027, date:'2027-02-10', date2:'2027-01-19', receveur:'BRAVO', accepteRea1:true });
  V('C. il confirme : la proposition part', !!r.id && b.echanges().length === 1);
  V('C. le receveur, lui, n\'est pas alerté (sa garde reçue est hors de sa semaine)', !/Réa 1/.test(b.notifs[0].corps), b.notifs[0].corps);
  rep = repondre(b, 'BRAVO', { id:r.id, reponse:'accepter' });
  V('C. le receveur accepte sans question', rep.etat === 'acceptee' && b.lire('ALPHA', '2027-01-19') === 'G2', rep);
  V('C. la trace nomme le demandeur', /⚠ garde du 2027-01-19 en semaine Réa 1 de ALPHA/.test(String(b.echanges()[0][COL.INFO])), b.echanges()[0][COL.INFO]);

  // D. ÉCHANGE DE 18 h : un 18 h reçu du lundi au vendredi de sa semaine.
  b = prep();
  b.poser('ALPHA', '2027-02-10', '18'); b.poser('BRAVO', '2027-01-22', '18');
  q = null; try { creer(b, 'ALPHA', { type:'echange18', year:2027, date:'2027-02-10', date2:'2027-01-22', receveur:'BRAVO' }); } catch (e) { q = e.message; }
  V('D. 18 h du vendredi de sa semaine Réa 1 : la question', /^\[REA1\] Attention, le 18 h du 22\/01\/2027 tombe dans votre semaine Réa 1/.test(q || ''), q);
  r = creer(b, 'ALPHA', { type:'echange18', year:2027, date:'2027-02-10', date2:'2027-01-22', receveur:'BRAVO', accepteRea1:true });
  V('D. confirmé : la proposition part', !!r.id);

  // E. DON : le 18 h du receveur passerait au donneur, dans la semaine Réa 1 du donneur.
  b = prep();
  b.poser('ALPHA', '2027-01-22', 'G'); b.poser('ALPHA', '2027-01-23', 'RG');   // vendredi de sa semaine : permis
  b.poser('BRAVO', '2027-01-22', '18');
  q = null; try { creer(b, 'ALPHA', { type:'don', year:2027, date:'2027-01-22', receveur:'BRAVO' }); } catch (e) { q = e.message; }
  V('E. d\'abord la question du 18 h repris', /^\[18\] /.test(q || ''), q);
  q = null; try { creer(b, 'ALPHA', { type:'don', year:2027, date:'2027-01-22', receveur:'BRAVO', accepte18:true }); } catch (e) { q = e.message; }
  V('E. puis celle de sa semaine Réa 1', /^\[REA1\] Attention, le 18 h du 22\/01\/2027 tombe dans votre semaine Réa 1/.test(q || '') && b.echanges().length === 0, q);
  r = creer(b, 'ALPHA', { type:'don', year:2027, date:'2027-01-22', receveur:'BRAVO', accepte18:true, accepteRea1:true });
  rep = repondre(b, 'BRAVO', { id:r.id, reponse:'accepter' });
  V('E. les deux confirmées : acceptée, le 18 h est chez le donneur', rep.etat === 'acceptee' && String(b.lire('ALPHA', '2027-01-22')) === '18', rep);
  V('E. la trace dit le 18 h en semaine Réa 1', /⚠ 18 h du 2027-01-22 en semaine Réa 1 de ALPHA/.test(String(b.echanges()[0][COL.INFO])), b.echanges()[0][COL.INFO]);

  // F. Demande devenue IMPOSSIBLE : pas de question inutile, le chemin habituel.
  b = prep();
  b.poser('ALPHA', DIM, 'G'); b.poser('ALPHA', LUN, 'RG');
  r = creer(b, 'ALPHA', { type:'don', year:2027, date:DIM, receveur:'BRAVO' });
  b.poser('ALPHA', DIM, ''); b.poser('ALPHA', LUN, '');   // la garde est partie entre-temps
  q = null; rep = null; try { rep = repondre(b, 'BRAVO', { id:r.id, reponse:'accepter' }); } catch (e) { q = e.message; }
  V('F. impossible → dit tout de suite, sans demander de confirmer', !q && rep && rep.etat === 'impossible', q || rep);

  // G. COMITÉ : le geste passe, l'avertissement est rendu dans ses suites.
  b = prep();
  b.poser('ALPHA', DIM, 'G'); b.poser('ALPHA', LUN, 'RG');
  const s = vm.runInContext(`appliquerGesteComite_({ type:'donGarde', year:2027, date:'${DIM}', doctorId:'ALPHA', doctorId2:'BRAVO' })`, b.ctx);
  V('G. le geste du comité s\'écrit', b.lire('BRAVO', DIM) === 'G' && b.lire('ALPHA', DIM) === '');
  V('G. ses suites portent l\'avertissement Réa 1', s.infos.some(t => /⚠ garde du 2027-01-10 en semaine Réa 1 de BRAVO/.test(t)), s.infos);
  V('G. …et le journal aussi', b.journal.some(l => /geste du comité donGarde .*semaine Réa 1 de BRAVO/.test(l)), b.journal.slice(-2));
}

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
