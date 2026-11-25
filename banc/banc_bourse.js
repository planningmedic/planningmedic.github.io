/* ═══ BANC — BOURSE AUX GARDES (25/11/2026) ═══
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
  /* (12/11/2026) Une année ouverte aux échanges entre MAR a son onglet LIENS_R : le monde l'a
     donc par défaut (vide). `sansLiens` fabrique l'année héritée, sans suivi des récupérations. */
  if (!opts.sansLiens) cl.ajouter(`LIENS_R_${annee}`, [['SAMEDI','MEDECIN','DATE R']].concat(opts.liensR || []));

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
const COL = { ID:0, CREE_LE:1, TYPE:2, ANNEE:3, DATE:4, DATE2:5, DEMANDEUR:6, RECEVEUR:7, ETAT:8, REPONDU_LE:9, RAPPEL_LE:10, INFO:11, OFFRE:12, MODE:13, SOUHAIT:14 };
const user = id => ({ id: id, role: 'mar', name: 'DR ' + id });

const run = (b, code) => vm.runInContext(code, b.ctx);
const essai = (b, code) => { try { return { r: run(b, code) }; } catch (e) { return { err: e.message }; } };
const U = id => JSON.stringify(user(id));
const deposer = (b, id, date, mode, souhait) => run(b, `deposerBourse(${U(id)}, { year:2027, date:${JSON.stringify(date)}, mode:${JSON.stringify(mode||'deux')}, souhait:${JSON.stringify(souhait||'')} })`);
const ligneDe = (b, id) => b.echanges().find(l => l[COL.ID] === id);

/* Remplace l'en-tête du banc : ce scénario éprouve la BOURSE (décisions du 24/11/2026).
   On met sa garde en vitrine, tous la voient, le premier qui la prend l'obtient ;
   un échange se propose sur l'offre et le donneur choisit. */

console.log('\n═══ 1. Déposer : une offre sans destinataire, annoncée à tous ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const r = deposer(b, 'ALPHA', j, 'deux', 'un jour de semaine');
  const l = ligneDe(b, r.id);
  V('l\'offre est créée, type « bourse », en attente', l && l[COL.TYPE] === 'bourse' && l[COL.ETAT] === 'attente', l);
  V('aucun destinataire : elle est pour tout le monde', l && l[COL.RECEVEUR] === '' && l[COL.DEMANDEUR] === 'ALPHA');
  V('ce que le donneur accepte et sa préférence sont gardés', l && l[COL.MODE] === 'deux' && l[COL.SOUHAIT] === 'un jour de semaine', l);
  V('la garde n\'a pas bougé', b.lire('ALPHA', j) === 'G');
  V('la notification part à TOUS (sans cible)', b.notifs.length === 1 && !b.notifs[0].cible && /propose sa garde/.test(b.notifs[0].corps), b.notifs);
  V('la clé `echanges` est poussée', b.kv.some(c => c.indexOf('echanges') > -1));
  V('déposer deux fois la même garde est refusé', /déjà en vitrine/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(j)}, mode:'don' })`).err || ''));
  V('déposer un jour sans garde ni 18 h est refusé', /ni garde ni 18 h/.test(essai(b, `deposerBourse(${U('BRAVO')}, { year:2027, date:${JSON.stringify(j)}, mode:'don' })`).err || ''));
  b.poser('CHARLI', b.dates[12], '18');
  const r18 = deposer(b, 'CHARLI', b.dates[12], 'don');
  V('un 18 h se dépose aussi (type « bourse18 »)', ligneDe(b, r18.id)[COL.TYPE] === 'bourse18');
  V('un choix inconnu est refusé', /Choix inconnu/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(j)}, mode:'vente' })`).err || ''));
  const env = run(b, 'getEchangesEnveloppe()');
  const o = env.echanges.find(e => e.id === r.id);
  V('la copie rapide porte mode et préférence', o && o.mode === 'deux' && o.souhait === 'un jour de semaine' && o.offre === '', o);
}

console.log('\n═══ 2. Prendre en don : le premier qui prend l\'obtient, tout de suite ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lend = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lend, 'RG');
  const r = deposer(b, 'ALPHA', j, 'don');
  b.notifs.length = 0;
  const p = run(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`);
  V('la prise est acceptée', p.etat === 'acceptee', p);
  V('la garde et son repos passent au preneur', b.lire('BRAVO', j) === 'G' && b.lire('BRAVO', lend) === 'RG' && b.lire('ALPHA', j) === '', [b.lire('BRAVO', j), b.lire('ALPHA', j)]);
  const o = ligneDe(b, r.id);
  V('l\'offre est close : « Prise par BRAVO »', o[COL.ETAT] === 'acceptee' && o[COL.INFO] === 'Prise par BRAVO', o);
  const d = ligneDe(b, p.don);
  V('un don ordinaire est tracé, lié à l\'offre', d && d[COL.TYPE] === 'don' && d[COL.DEMANDEUR] === 'ALPHA' && d[COL.RECEVEUR] === 'BRAVO' && d[COL.OFFRE] === r.id && d[COL.ETAT] === 'acceptee', d);
  V('les deux MAR sont prévenus', ['ALPHA','BRAVO'].every(x => b.notifs.some(n => n.cible && n.cible.id === x && n.titre === 'Échange confirmé')), b.notifs);
  const t = essai(b, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r.id)} })`);
  V('le deuxième arrive trop tard', /Trop tard/.test(t.err || ''), t);
  V('prendre sa propre offre est refusé', /propre offre/.test(essai(b, (() => { b.poser('ALPHA', b.dates[20], 'G'); return `prendreBourse(${U('ALPHA')}, { id:${JSON.stringify(deposer(b,'ALPHA',b.dates[20],'don').id)} })`; })()).err || ''));
}

console.log('\n═══ 3. Le preneur a un autre statut ce jour-là : on le lui dit, il confirme ═══');
{
  const b = monde(2027);
  const j = b.dates[9], lend = b.dates[10];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', lend, 'RG');
  b.poser('BRAVO', j, 'V'); b.poser('BRAVO', lend, 'V');
  const r = deposer(b, 'ALPHA', j, 'deux');
  const avant = b.echanges().length;
  const q = essai(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`);
  V('la question [ABS] lui est posée', /^\[ABS\]/.test(q.err || ''), q);
  V('rien n\'est écrit : grille intacte, aucune ligne laissée', b.lire('BRAVO', j) === 'V' && b.lire('ALPHA', j) === 'G' && b.echanges().length === avant, b.echanges().length);
  V('l\'offre reste en vitrine', ligneDe(b, r.id)[COL.ETAT] === 'attente');
  const ok2 = run(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)}, accepteAbsence:true })`);
  V('après confirmation, la garde passe et ses vacances sont effacées', ok2.etat === 'acceptee' && b.lire('BRAVO', j) === 'G', ok2);
  V('le suivi garde la trace de l\'absence effacée', /V du .* effacé \(BRAVO, confirmé\)/.test(ligneDe(b, ok2.don)[COL.INFO]), ligneDe(b, ok2.don));
  const c = monde(2027);
  c.poser('ALPHA', c.dates[9], 'G'); c.poser('ALPHA', c.dates[10], 'RG');
  c.poser('BRAVO', c.dates[8], 'G'); c.poser('BRAVO', c.dates[9], 'RG');
  const r2 = deposer(c, 'ALPHA', c.dates[9], 'don');
  const n = c.echanges().length;
  const ref = essai(c, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r2.id)} })`);
  V('un refus franc (repos de garde) est dit tout de suite, sans ligne laissée', !!ref.err && c.echanges().length === n && c.lire('ALPHA', c.dates[9]) === 'G', ref);
}

console.log('\n═══ 4. Offre « échange » : on propose une de ses gardes, le donneur choisit ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.poser('BRAVO', b.dates[30], 'G'); b.poser('BRAVO', b.dates[31], 'RG');
  b.poser('CHARLI', b.dates[40], 'G'); b.poser('CHARLI', b.dates[41], 'RG');
  const r = deposer(b, 'ALPHA', j, 'echange', 'un jour de mars');
  V('prendre en don une offre « échange » est refusé', /attend un échange/.test(essai(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`).err || ''));
  const prop = (id, d) => run(b, `creerEchange(${U(id)}, { type:'echange', year:2027, date:${JSON.stringify(d)}, date2:${JSON.stringify(j)}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`);
  b.notifs.length = 0;
  const pB = prop('BRAVO', b.dates[30]), pC = prop('CHARLI', b.dates[40]);
  V('deux propositions liées à l\'offre', ligneDe(b, pB.id)[COL.OFFRE] === r.id && ligneDe(b, pC.id)[COL.OFFRE] === r.id);
  V('le donneur est prévenu à chaque proposition', b.notifs.filter(n => n.cible && n.cible.id === 'ALPHA').length === 2, b.notifs);
  V('une seconde proposition du même MAR sur la même offre est refusée', /déjà proposé un échange sur cette offre/.test(essai(b, `creerEchange(${U('BRAVO')}, { type:'echange', year:2027, date:${JSON.stringify(b.dates[30])}, date2:${JSON.stringify(j)}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`).err || ''));
  V('une proposition qui ne correspond pas à l\'offre est refusée', /ne correspond pas/.test(essai(b, `creerEchange(${U('DELTA')}, { type:'echange', year:2027, date:${JSON.stringify(b.dates[30])}, date2:${JSON.stringify(b.dates[11])}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`).err || ''));
  b.notifs.length = 0;
  const ch = run(b, `repondreEchange(${U('ALPHA')}, { id:${JSON.stringify(pC.id)}, reponse:'accepter' })`);
  V('le donneur choisit CHARLI : échange fait', ch.etat === 'acceptee' && b.lire('CHARLI', j) === 'G' && b.lire('ALPHA', b.dates[40]) === 'G', ch);
  V('l\'offre est close : « Échangée avec CHARLI »', ligneDe(b, r.id)[COL.ETAT] === 'acceptee' && ligneDe(b, r.id)[COL.INFO] === 'Échangée avec CHARLI', ligneDe(b, r.id));
  V('la proposition de BRAVO est fermée', ligneDe(b, pB.id)[COL.ETAT] === 'sansobjet' && /autre MAR/.test(ligneDe(b, pB.id)[COL.INFO]), ligneDe(b, pB.id));
  V('BRAVO en est prévenu', b.notifs.some(n => n.cible && n.cible.id === 'BRAVO' && /proposition d'échange est fermée/.test(n.corps)), b.notifs);
  V('la garde de BRAVO n\'a pas bougé', b.lire('BRAVO', b.dates[30]) === 'G');
}

console.log('\n═══ 5. Offre « les deux » prise en don : les échanges proposés se ferment ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.poser('BRAVO', b.dates[30], 'G'); b.poser('BRAVO', b.dates[31], 'RG');
  const r = deposer(b, 'ALPHA', j, 'deux');
  const pB = run(b, `creerEchange(${U('BRAVO')}, { type:'echange', year:2027, date:${JSON.stringify(b.dates[30])}, date2:${JSON.stringify(j)}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`);
  b.notifs.length = 0;
  run(b, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r.id)} })`);
  V('CHARLI a la garde', b.lire('CHARLI', j) === 'G');
  V('la proposition de BRAVO est fermée et il est prévenu', ligneDe(b, pB.id)[COL.ETAT] === 'sansobjet' && b.notifs.some(n => n.cible && n.cible.id === 'BRAVO' && /fermée/.test(n.corps)), b.notifs);
}

console.log('\n═══ 6. Retirer son offre ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.poser('BRAVO', b.dates[30], 'G'); b.poser('BRAVO', b.dates[31], 'RG');
  const r = deposer(b, 'ALPHA', j, 'echange');
  const pB = run(b, `creerEchange(${U('BRAVO')}, { type:'echange', year:2027, date:${JSON.stringify(b.dates[30])}, date2:${JSON.stringify(j)}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`);
  V('un autre que le donneur ne peut pas la retirer', /Seul le donneur/.test(essai(b, `retirerBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`).err || ''));
  b.notifs.length = 0;
  const x = run(b, `retirerBourse(${U('ALPHA')}, { id:${JSON.stringify(r.id)} })`);
  V('l\'offre est retirée', x.etat === 'annulee' && ligneDe(b, r.id)[COL.ETAT] === 'annulee');
  V('la proposition liée est fermée, son auteur prévenu', ligneDe(b, pB.id)[COL.ETAT] === 'annulee' && b.notifs.some(n => n.cible && n.cible.id === 'BRAVO'), b.notifs);
  V('la garde n\'a pas bougé', b.lire('ALPHA', j) === 'G');
  V('retirer deux fois est refusé', /déjà annulee/.test(essai(b, `retirerBourse(${U('ALPHA')}, { id:${JSON.stringify(r.id)} })`).err || ''));
}

console.log('\n═══ 7. Une offre n\'expire pas ; elle se ferme quand le donneur ne tient plus la garde ═══');
{
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const r = deposer(b, 'ALPHA', j, 'don');
  const f = b.cl.getSheetByName('ECHANGES');
  f.lignes.find(l => l[0] === r.id)[COL.CREE_LE] = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  b.notifs.length = 0;
  run(b, 'expirerEchanges()');
  V('72 h après, l\'offre est toujours en vitrine, sans rappel', ligneDe(b, r.id)[COL.ETAT] === 'attente' && !ligneDe(b, r.id)[COL.RAPPEL_LE] && b.notifs.length === 0, [ligneDe(b, r.id), b.notifs]);
  b.poser('ALPHA', j, ''); b.poser('BRAVO', j, 'G');   // la garde a changé de mains par un autre chemin
  run(b, 'expirerEchanges()');
  V('le donneur ne tient plus la garde : offre « sans objet »', ligneDe(b, r.id)[COL.ETAT] === 'sansobjet', ligneDe(b, r.id));
}

console.log('\n═══ 8. Onglet d\'avant la bourse : les trois colonnes reçoivent leur titre ═══');
{
  const b = monde(2027);
  b.cl.ajouter('ECHANGES', [['ID','CREE_LE','TYPE','ANNEE','DATE','DATE2','DEMANDEUR','RECEVEUR','ETAT','REPONDU_LE','RAPPEL_LE','INFO']]);
  b.poser('ALPHA', b.dates[9], 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const r = deposer(b, 'ALPHA', b.dates[9], 'don');
  const ent = b.cl.getSheetByName('ECHANGES').lignes[0];
  V('en-tête complété : OFFRE, MODE, SOUHAIT', ent[12] === 'OFFRE' && ent[13] === 'MODE' && ent[14] === 'SOUHAIT', ent);
  V('l\'offre est lisible', run(b, 'getEchangesEnveloppe()').echanges.some(e => e.id === r.id && e.mode === 'don'));
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
