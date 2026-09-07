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

  const notifs = [], kv = [], journal = [], mails = [];
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
    Utilities: { formatDate: (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; } },
    Logger: { log: () => {} }, logAction: m => journal.push(String(m)),
    /* (14/08/2026) L'alerte comité passe par mail, jamais par push. */
    MailApp: { sendEmail: (to, sujet, corps) => { mails.push({ to, sujet, corps }); },
               getRemainingDailyQuota: () => 100 },
    TEST_YEAR: annee,
    generatePlanning: () => { ctxCompteurs.republications++; },
    notifPlanifier: () => {},
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
  return { cl, ctx, dates, poser, lire, echanges, notifs, kv, journal, annee, attente, mails };
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

console.log('\n═══ 2. Créer vers un receveur indisponible : refus IMMÉDIAT, onglet vide ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lendemain = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lendemain, 'RG');
  b.poser('BRAVO', j, 'VAC', `INDISPOS_2027`);
  let refus = null;
  try { vm.runInContext(`creerEchange(${JSON.stringify(user('ALPHA'))}, { type:'don', year:2027, date:${JSON.stringify(j)}, receveur:'BRAVO' })`, b.ctx); }
  catch (e) { refus = e.message; }
  V('la création est refusée sur-le-champ', !!refus, refus);
  V('le motif nomme l\'indisponibilité', /indisponi|impossible/i.test(refus || ''), refus);
  V('AUCUNE ligne n\'est écrite', b.echanges().length === 0);
  V('AUCUNE notification ne part', b.notifs.length === 0);
  V('la grille est intacte (dryRun sans écriture)', b.lire('ALPHA', j) === 'G' && b.lire('BRAVO', j) === '');
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
  /* (23/08/2026) LE MAIL EST RETIRÉ — un seul canal, décision d'Arthur.
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

console.log('\n═══ 11. Samedi dont le receveur est occupé le jour du R : échange fait, comité prévenu ═══');
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
  V('le R n\'a PAS bougé (rien d\'écrasé)', b.lire('ALPHA', dateR) === 'R' && b.lire('BRAVO', dateR) === '18');
  V('la ligne LIENS_R garde son tenant d\'origine', b.cl.getSheetByName('LIENS_R_2027').lignes[1][1] === 'ALPHA');
  V('la trace porte le motif ET la date du R — sans aucun mail',
    b.mails.length === 0
    && b.journal.some(m => /récup à replacer/i.test(m) && m.indexOf(dateR) > -1), b.journal.slice(-3));
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
  const dash   = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
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

  // Le cas particulier de l'écran : PRUNET est Pr, pas Dr
  const dash = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
  V('l\'écran traite PRUNET en « Pr »', /id==='PRUNET'\?'Pr':'Dr'/.test(dash.replace(/\s/g, '')), 'règle de _meName');
  const gs = fs.readFileSync(path.join(__dirname, '..', 'gas', 'echanges.gs'), 'utf8');
  V('les notifications suivent LA MÊME règle pour PRUNET', /PRUNET' \? 'Pr ' : 'Dr '/.test(gs));
}

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
