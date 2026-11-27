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
  V('les deux MAR sont prévenus', ['ALPHA','BRAVO'].every(x => b.notifs.some(n => n.cible && n.cible.id === x && n.titre === 'Don confirmé')), b.notifs);
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


console.log('\n═══ 9. Aucune journée dégradée : jamais deux gardes au même MAR, jamais un jour sans son binôme ═══');
{
  const b = monde(2027);
  const D = b.dates, M8 = ['ALPHA','BRAVO','CHARLI','DELTA','ECHO','FOXTRO','GOLF','HOTEL'];
  // Planning plein : chaque jour une garde Réa (G) et une Mater (G2), repos le lendemain, jamais deux gardes de suite.
  for (let i = 0; i < 60; i++) {
    const a = M8[(2 * i) % 8], c = M8[(2 * i + 1) % 8];
    b.poser(a, D[i], 'G'); b.poser(c, D[i], 'G2');
    if (i + 1 < 60) { if (!b.lire(a, D[i + 1])) b.poser(a, D[i + 1], 'RG'); if (!b.lire(c, D[i + 1])) b.poser(c, D[i + 1], 'RG'); }
  }
  // a) le binôme du jour ne peut pas prendre la garde de l'autre ligne
  const j = D[10], g = M8[20 % 8], m = M8[21 % 8];
  const o = deposer(b, g, j, 'don');
  const e1 = essai(b, `prendreBourse(${U(m)}, { id:${JSON.stringify(o.id)} })`);
  V('le binôme du jour ne prend pas la garde de l\'autre ligne (il en aurait deux)', !!e1.err && b.lire(g, j) === 'G' && b.lire(m, j) === 'G2', e1);
  // b) garde la veille / le lendemain : refusé
  const veille = M8[18 % 8], lend = M8[22 % 8];
  V('celui qui est de garde la veille ne la prend pas', !!essai(b, `prendreBourse(${U(veille)}, { id:${JSON.stringify(o.id)}, accepteAbsence:true })`).err);
  V('celui qui est de garde le lendemain ne la prend pas', !!essai(b, `prendreBourse(${U(lend)}, { id:${JSON.stringify(o.id)}, accepteAbsence:true })`).err);
  V('après ces refus, l\'offre est toujours en vitrine et rien n\'a bougé', ligneDe(b, o.id)[COL.ETAT] === 'attente' && b.lire(g, j) === 'G');

  // c) Échange devenu impossible en route : la garde proposée est partie ailleurs entre-temps
  const c2 = monde(2027);
  c2.poser('ALPHA', c2.dates[9], 'G'); c2.poser('ALPHA', c2.dates[10], 'RG');
  c2.poser('BRAVO', c2.dates[30], 'G'); c2.poser('BRAVO', c2.dates[31], 'RG');
  const oA = deposer(c2, 'ALPHA', c2.dates[9], 'echange');
  const pB = run(c2, `creerEchange(${U('BRAVO')}, { type:'echange', year:2027, date:${JSON.stringify(c2.dates[30])}, date2:${JSON.stringify(c2.dates[9])}, receveur:'ALPHA', offre:${JSON.stringify(oA.id)} })`);
  const oB = deposer(c2, 'BRAVO', c2.dates[30], 'don');
  run(c2, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(oB.id)} })`);   // la garde proposée par BRAVO part chez CHARLI
  V('la proposition de BRAVO se ferme d\'elle-même (il n\'a plus la garde proposée)', ligneDe(c2, pB.id)[COL.ETAT] === 'sansobjet', ligneDe(c2, pB.id));
  const ch = essai(c2, `repondreEchange(${U('ALPHA')}, { id:${JSON.stringify(pB.id)}, reponse:'accepter' })`);
  V('ALPHA ne peut plus la choisir, et rien n\'est écrit à moitié', !!ch.err && c2.lire('ALPHA', c2.dates[9]) === 'G' && c2.lire('CHARLI', c2.dates[30]) === 'G' && c2.lire('BRAVO', c2.dates[9]) === '', ch);
  V('l\'offre d\'ALPHA reste en vitrine', ligneDe(c2, oA.id)[COL.ETAT] === 'attente');

  // d) 400 gestes au hasard sur le planning plein : les règles tiennent à chaque pas
  let graine = 7; const hasard = n => { graine = (graine * 1103515245 + 12345) % 2147483648; return Math.floor(graine / 65536) % n; };
  const invariants = () => {
    const pb = [];
    for (let i = 0; i < 60; i++) {
      const codes = M8.map(x => b.lire(x, D[i]));
      if (codes.filter(c => c === 'G').length !== 1) pb.push(D[i] + ' : ' + codes.filter(c => c === 'G').length + ' garde(s) réa');
      if (codes.filter(c => c === 'G2').length !== 1) pb.push(D[i] + ' : ' + codes.filter(c => c === 'G2').length + ' garde(s) mater');
      if (i > 0) M8.forEach(x => { if (/^G2?$/.test(b.lire(x, D[i])) && /^G2?$/.test(b.lire(x, D[i - 1]))) pb.push(x + ' deux gardes de suite ' + D[i]); });
    }
    return pb;
  };
  let gestes = 0, refus = 0, problemes = [];
  /* Les gestes visent des cas plausibles (on dépose une garde qu'on tient, on prend plutôt un jour
     où l'on est libre) pour que beaucoup aboutissent ; une part reste refusée, exprès. */
  const tenues = x => D.slice(2, 57).filter(d => /^G2?$/.test(b.lire(x, d)));
  const libre = (x, d) => { const k = D.indexOf(d); return b.lire(x, d) === '' && !/^G2?$/.test(b.lire(x, D[k - 1])) && !/^G2?$/.test(b.lire(x, D[k + 1])); };
  for (let n = 0; n < 600 && !problemes.length; n++) {
    const qui = M8[hasard(8)], quoi = hasard(5);
    const env = () => run(b, 'getEchangesEnveloppe()').echanges;   // dates relues comme le serveur les lit
    const offres = () => env().filter(e => e.type === 'bourse' && e.etat === 'attente').map(e => ({ [COL.ID]: e.id, [COL.DATE]: e.date, [COL.DEMANDEUR]: e.demandeur, [COL.ETAT]: e.etat, mode: e.mode }));
    const choisirOffre = () => { const os = offres().filter(o => o[COL.DEMANDEUR] !== qui || hasard(10) === 0); if (!os.length) return null; const bonnes = os.filter(o => libre(qui, o[COL.DATE])); const l = bonnes.length && hasard(4) ? bonnes : os; return l[hasard(l.length)]; };
    let r;
    if (quoi === 0) { const deja = offres().map(o => o[COL.DATE]); const t = tenues(qui).filter(d => deja.indexOf(d) < 0 || hasard(10) === 0); if (t.length) r = essai(b, `deposerBourse(${U(qui)}, { year:2027, date:${JSON.stringify(t[hasard(t.length)])}, mode:${JSON.stringify(['don','echange','deux'][hasard(3)])} })`); }
    else if (quoi === 1) { const o = choisirOffre(); if (o && (o.mode !== 'echange' || hasard(5) === 0)) r = essai(b, `prendreBourse(${U(qui)}, { id:${JSON.stringify(o[COL.ID])}, accepteAbsence:true, accepteRea1:true, accepte18h:true })`); }
    else if (quoi === 2) { const o = choisirOffre(), t = tenues(qui); if (o && t.length && (o.mode !== 'don' || hasard(5) === 0)) r = essai(b, `creerEchange(${U(qui)}, { type:'echange', year:2027, date:${JSON.stringify(t[hasard(t.length)])}, date2:${JSON.stringify(o[COL.DATE])}, receveur:${JSON.stringify(o[COL.DEMANDEUR])}, offre:${JSON.stringify(o[COL.ID])}, accepteAbsence:true, accepteRea1:true, accepteRea1Lui:true, accepte18:true, accepte18h:true })`); }
    else if (quoi === 3) { const ps = env().filter(e => e.offre && e.etat === 'attente' && e.type === 'echange'); if (ps.length) { const p = ps[hasard(ps.length)]; r = essai(b, `repondreEchange(${U(p.receveur)}, { id:${JSON.stringify(p.id)}, reponse:'accepter', accepteAbsence:true, accepteRea1:true, accepte18h:true })`); } }
    else if (quoi === 4 && hasard(3) === 0) { const os = offres(); if (os.length) { const o = os[hasard(os.length)]; r = essai(b, `retirerBourse(${U(o[COL.DEMANDEUR])}, { id:${JSON.stringify(o[COL.ID])} })`); } }
    if (!r) continue;
    gestes++; if (r.err) refus++;
    problemes = invariants();
  }
  const faits = b.echanges().filter(l => l[COL.ETAT] === 'acceptee' && l[COL.TYPE] !== 'bourse').length;
  V(`${gestes} gestes au hasard (${refus} refusés, ${faits} gardes passées de main) : chaque jour garde UNE réa et UNE mater, personne n'enchaîne deux gardes`, problemes.length === 0 && faits >= 20, problemes.slice(0, 5));
  V('aucune offre conclue ne garde une proposition ouverte derrière elle', !b.echanges().some(l => l[COL.OFFRE] && l[COL.ETAT] === 'attente' && ['acceptee','annulee','sansobjet'].indexOf((ligneDe(b, l[COL.OFFRE]) || [])[COL.ETAT]) > -1));
}


console.log('\n═══ 10. Paire à éviter : celui qui prend est prévenu et confirme, sans blocage (25/11/2026) ═══');
{
  const PAIRE = "function getPairesEvitees(){ return { ALPHA: new Set(['BRAVO']), BRAVO: new Set(['ALPHA']) }; }";
  const b = monde(2027);
  run(b, PAIRE);
  const j = b.dates[9];
  b.poser('CHARLI', j, 'G'); b.poser('CHARLI', b.dates[10], 'RG');
  b.poser('BRAVO', j, 'G2'); b.poser('BRAVO', b.dates[10], 'RG');
  const o = deposer(b, 'CHARLI', j, 'deux');
  const n = b.echanges().length;
  const q = essai(b, `prendreBourse(${U('ALPHA')}, { id:${JSON.stringify(o.id)} })`);
  V('ALPHA prend une garde la nuit où BRAVO est de garde : la question [COUPLE] lui est posée', /^\[COUPLE\] Attention, le Dr \S+ est de garde le .* tous les deux de sortie/.test(q.err || ''), q);
  V('rien n\'est écrit, aucune ligne laissée, l\'offre reste en vitrine', b.lire('CHARLI', j) === 'G' && b.echanges().length === n && ligneDe(b, o.id)[COL.ETAT] === 'attente');
  const ok2 = run(b, `prendreBourse(${U('ALPHA')}, { id:${JSON.stringify(o.id)}, accepteCouple:true })`);
  V('après confirmation, la garde passe : ce n\'est pas un blocage', ok2.etat === 'acceptee' && b.lire('ALPHA', j) === 'G', ok2);
  // 18 h du partenaire
  const c = monde(2027); run(c, PAIRE);
  c.poser('CHARLI', c.dates[20], 'G'); c.poser('CHARLI', c.dates[21], 'RG'); c.poser('BRAVO', c.dates[20], '18');
  const o2 = deposer(c, 'CHARLI', c.dates[20], 'don');
  V('BRAVO de 18 h cette nuit-là : même question', /^\[COUPLE\].*de 18 h/.test(essai(c, `prendreBourse(${U('ALPHA')}, { id:${JSON.stringify(o2.id)} })`).err || ''));
  V('un MAR hors paire prend sans question', run(c, `prendreBourse(${U('DELTA')}, { id:${JSON.stringify(o2.id)} })`).etat === 'acceptee');
  // échange : celui qui propose est interrogé à l'envoi, le donneur en choisissant
  const e = monde(2027); run(e, PAIRE);
  e.poser('CHARLI', e.dates[9], 'G'); e.poser('CHARLI', e.dates[10], 'RG'); e.poser('BRAVO', e.dates[9], '18');
  e.poser('ALPHA', e.dates[30], 'G'); e.poser('ALPHA', e.dates[31], 'RG');
  const o3 = deposer(e, 'CHARLI', e.dates[9], 'echange');
  const prop = extra => essai(e, `creerEchange(${U('ALPHA')}, Object.assign({ type:'echange', year:2027, date:${JSON.stringify(e.dates[30])}, date2:${JSON.stringify(e.dates[9])}, receveur:'CHARLI', offre:${JSON.stringify(o3.id)} }, ${extra}))`);
  V('celui qui propose l\'échange est interrogé à l\'envoi', /^\[COUPLE\]/.test(prop('{}').err || ''));
  V('confirmé, la proposition part', !!(prop('{ accepteCouple:true }').r || {}).id);
  const f = monde(2027); run(f, PAIRE);
  f.poser('ALPHA', f.dates[9], 'G'); f.poser('ALPHA', f.dates[10], 'RG');
  f.poser('CHARLI', f.dates[30], 'G'); f.poser('CHARLI', f.dates[31], 'RG'); f.poser('BRAVO', f.dates[30], 'G2'); f.poser('BRAVO', f.dates[31], 'RG');
  const o4 = deposer(f, 'ALPHA', f.dates[9], 'echange');
  const p4 = run(f, `creerEchange(${U('CHARLI')}, { type:'echange', year:2027, date:${JSON.stringify(f.dates[30])}, date2:${JSON.stringify(f.dates[9])}, receveur:'ALPHA', offre:${JSON.stringify(o4.id)} })`);
  V('le donneur qui choisit une garde la nuit de sa paire est interrogé', /^\[COUPLE\]/.test(essai(f, `repondreEchange(${U('ALPHA')}, { id:${JSON.stringify(p4.id)}, reponse:'accepter' })`).err || '') && f.lire('ALPHA', f.dates[9]) === 'G');
  V('confirmé, l\'échange se fait', run(f, `repondreEchange(${U('ALPHA')}, { id:${JSON.stringify(p4.id)}, reponse:'accepter', accepteCouple:true })`).etat === 'acceptee' && f.lire('ALPHA', f.dates[30]) === 'G');
  // sans paire configurée : aucune question (contre-épreuve)
  const g = monde(2027);
  g.poser('CHARLI', g.dates[9], 'G'); g.poser('CHARLI', g.dates[10], 'RG'); g.poser('BRAVO', g.dates[9], 'G2');
  const o5 = deposer(g, 'CHARLI', g.dates[9], 'don');
  V('sans paire dans CONFIG : rien ne change, la garde passe sans question', run(g, `prendreBourse(${U('ALPHA')}, { id:${JSON.stringify(o5.id)} })`).etat === 'acceptee');
}

console.log('\n═══ 11. Offre RÉSERVÉE à un collègue : lui seul la prend (27/11/2026) ═══');
{
  /* Vu en réel : deux MAR d'accord entre eux, un troisième plus rapide a pris la garde. */
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.notifs.length = 0;
  const r = run(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(j)}, mode:'deux', reserve:'BRAVO' })`);
  const l = ligneDe(b, r.id);
  V('l\'offre est déposée, le collègue visé dans RECEVEUR', l && l[COL.TYPE] === 'bourse' && l[COL.RECEVEUR] === 'BRAVO' && l[COL.ETAT] === 'attente' && r.reserve === 'BRAVO', l);
  V('seul BRAVO est prévenu (pas de notification à tous)', b.notifs.length === 1 && b.notifs[0].cible && b.notifs[0].cible.id === 'BRAVO' && /vous réserve sa garde/.test(b.notifs[0].corps), b.notifs);
  V('se réserver sa propre offre est refusé', /propre offre/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(b.dates[20])}, mode:'don', reserve:'ALPHA' })`).err || ''));
  b.poser('ALPHA', b.dates[20], 'G');
  V('réserver à un inconnu du planning est refusé', /Collègue inconnu/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(b.dates[20])}, mode:'don', reserve:'ZOULOU' })`).err || ''));
  const n = b.echanges().length;
  const t = essai(b, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r.id)} })`);
  V('CHARLI, plus rapide, ne peut PAS la prendre', /réservée à un autre MAR/.test(t.err || '') && b.lire('ALPHA', j) === 'G' && b.echanges().length === n, t);
  b.poser('CHARLI', b.dates[30], 'G');
  V('CHARLI ne peut pas non plus proposer d\'échange dessus', /réservée à un autre MAR/.test(essai(b, `creerEchange(${U('CHARLI')}, { type:'echange', year:2027, date:${JSON.stringify(b.dates[30])}, date2:${JSON.stringify(j)}, receveur:'ALPHA', offre:${JSON.stringify(r.id)} })`).err || ''));
  const f = b.cl.getSheetByName('ECHANGES');
  f.lignes.find(x => x[0] === r.id)[COL.CREE_LE] = new Date(Date.now() - 96 * 3600 * 1000).toISOString();
  b.notifs.length = 0; run(b, 'expirerEchanges()');
  V('96 h après, elle reste réservée, sans expiration ni rappel', ligneDe(b, r.id)[COL.ETAT] === 'attente' && ligneDe(b, r.id)[COL.RECEVEUR] === 'BRAVO' && b.notifs.length === 0, [ligneDe(b, r.id), b.notifs]);
  const env = run(b, 'getEchangesEnveloppe()').echanges.find(e => e.id === r.id);
  V('la copie rapide porte le collègue visé (le relais s\'en sert pour la cacher)', env && env.receveur === 'BRAVO');
  const p = run(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`);
  V('BRAVO la prend : la garde et le repos passent', p.etat === 'acceptee' && b.lire('BRAVO', j) === 'G' && b.lire('BRAVO', b.dates[10]) === 'RG', p);
  V('l\'offre est close « Prise par BRAVO »', ligneDe(b, r.id)[COL.ETAT] === 'acceptee' && ligneDe(b, r.id)[COL.INFO] === 'Prise par BRAVO');

  // Échange sur une offre réservée : le collègue visé propose, le donneur choisit
  const c = monde(2027);
  c.poser('ALPHA', c.dates[9], 'G'); c.poser('ALPHA', c.dates[10], 'RG');
  c.poser('BRAVO', c.dates[30], 'G'); c.poser('BRAVO', c.dates[31], 'RG');
  const r2 = run(c, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(c.dates[9])}, mode:'echange', reserve:'BRAVO' })`);
  const pB = run(c, `creerEchange(${U('BRAVO')}, { type:'echange', year:2027, date:${JSON.stringify(c.dates[30])}, date2:${JSON.stringify(c.dates[9])}, receveur:'ALPHA', offre:${JSON.stringify(r2.id)} })`);
  V('le collègue visé propose un échange sur l\'offre', !!pB.id && ligneDe(c, pB.id)[COL.OFFRE] === r2.id);
  const ch = run(c, `repondreEchange(${U('ALPHA')}, { id:${JSON.stringify(pB.id)}, reponse:'accepter' })`);
  V('le donneur choisit : échange fait, offre close', ch.etat === 'acceptee' && c.lire('BRAVO', c.dates[9]) === 'G' && c.lire('ALPHA', c.dates[30]) === 'G' && ligneDe(c, r2.id)[COL.ETAT] === 'acceptee', ch);

  // Décliner
  const d = monde(2027);
  d.poser('ALPHA', d.dates[9], 'G'); d.poser('ALPHA', d.dates[10], 'RG');
  const r3 = run(d, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(d.dates[9])}, mode:'don', reserve:'BRAVO' })`);
  V('un autre que le collègue visé ne peut pas la décliner', /Seul le collègue/.test(essai(d, `declinerBourse(${U('CHARLI')}, { id:${JSON.stringify(r3.id)} })`).err || '')
    && /Seul le collègue/.test(essai(d, `declinerBourse(${U('ALPHA')}, { id:${JSON.stringify(r3.id)} })`).err || ''));
  d.notifs.length = 0; d.kv.length = 0;
  const x = run(d, `declinerBourse(${U('BRAVO')}, { id:${JSON.stringify(r3.id)} })`);
  V('BRAVO décline : l\'offre se ferme, la garde ne bouge pas', x.etat === 'refusee' && ligneDe(d, r3.id)[COL.ETAT] === 'refusee' && d.lire('ALPHA', d.dates[9]) === 'G', ligneDe(d, r3.id));
  V('ALPHA est prévenu, et lui seul', d.notifs.length === 1 && d.notifs[0].cible && d.notifs[0].cible.id === 'ALPHA' && /a décliné/.test(d.notifs[0].corps), d.notifs);
  V('la clé `echanges` est repoussée', d.kv.some(k => k.indexOf('echanges') > -1));
  V('décliner deux fois est refusé', /déjà refusee/.test(essai(d, `declinerBourse(${U('BRAVO')}, { id:${JSON.stringify(r3.id)} })`).err || ''));
  const r4 = run(d, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(d.dates[9])}, mode:'don' })`);
  V('ALPHA peut la redéposer, cette fois pour tous', ligneDe(d, r4.id)[COL.RECEVEUR] === '' && ligneDe(d, r4.id)[COL.ETAT] === 'attente');
  V('décliner une offre ouverte à tous n\'a pas de sens : refusé', /Seul le collègue/.test(essai(d, `declinerBourse(${U('BRAVO')}, { id:${JSON.stringify(r4.id)} })`).err || ''));

  // Retirer une offre réservée : le collègue visé est prévenu
  const e = monde(2027);
  e.poser('ALPHA', e.dates[9], 'G'); e.poser('ALPHA', e.dates[10], 'RG');
  const r5 = run(e, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(e.dates[9])}, mode:'don', reserve:'BRAVO' })`);
  e.notifs.length = 0;
  run(e, `retirerBourse(${U('ALPHA')}, { id:${JSON.stringify(r5.id)} })`);
  V('le donneur la retire : le collègue visé est prévenu', ligneDe(e, r5.id)[COL.ETAT] === 'annulee' && e.notifs.some(n => n.cible && n.cible.id === 'BRAVO' && /retiré/.test(n.corps)), e.notifs);
  // Contre-épreuve : offre ouverte à tous, toujours prise par le premier venu
  const g = monde(2027);
  g.poser('ALPHA', g.dates[9], 'G'); g.poser('ALPHA', g.dates[10], 'RG');
  const r6 = deposer(g, 'ALPHA', g.dates[9], 'don');
  V('contre-épreuve : sans réservation, CHARLI la prend toujours', run(g, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r6.id)} })`).etat === 'acceptee');
}

/* Fiches des MAR pour les contrôles du preneur : la vraie fonction lit MEDECINS ; ici la
   réponse de getMedecinFlags (code.gs) est posée telle qu'elle la rend — des ensembles et
   des dates « aaaa-mm-jj ». */
const fiches = (b, f) => { b.ctx.__fiches = Object.assign({ noGarde: [], only18: [], dateDebut: {}, dateFin: {} }, f);
  run(b, 'function getMedecinFlags(){ return { noGarde: new Set(__fiches.noGarde), only18: new Set(__fiches.only18), dateDebut: __fiches.dateDebut, dateFin: __fiches.dateFin }; }'); };

console.log('\n═══ 12. Le preneur doit pouvoir tenir la garde : sans garde, hors contrat (27/11/2026) ═══');
{
  /* DÉFAUT TROUVÉ AUX SCÉNARIOS DE VIE RÉELLE : rien ne contrôlait le preneur. Un MAR noté
     « sans garde » prenait une garde ; un MAR parti en prenait une un mois après son départ. */
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  const fin = b.dates[5];                                   // contrat de DELTA : fini avant la garde
  fiches(b, { noGarde: ['CHARLI'], only18: ['ECHO'], dateFin: { DELTA: fin }, dateDebut: { FOXTRO: b.dates[40] } });
  const r = deposer(b, 'ALPHA', j, 'deux');
  const n = b.echanges().length;
  const prendre = (id, plus) => essai(b, `prendreBourse(${U(id)}, Object.assign({ id:${JSON.stringify(r.id)} }, ${JSON.stringify(plus || {})}))`);
  let t = prendre('CHARLI');
  V('un MAR « sans garde » ne peut pas prendre une garde, et il lit pourquoi', /Vous ne faites pas de gardes/.test(t.err || '') && b.lire('CHARLI', j) === '' && b.lire('ALPHA', j) === 'G', t);
  V('…rien n\'est écrit, l\'offre reste en vitrine', b.echanges().length === n && ligneDe(b, r.id)[COL.ETAT] === 'attente');
  t = prendre('ECHO');
  V('un MAR « 18 h seulement » non plus', /Vous ne faites pas de gardes/.test(t.err || '') && b.lire('ECHO', j) === '', t);
  t = prendre('DELTA');
  V('un MAR dont le contrat est fini ne peut pas la prendre, la date est dite', /Vous n'êtes pas en poste le/.test(t.err || '') && b.lire('DELTA', j) === '', t);
  t = prendre('FOXTRO');
  V('un MAR pas encore arrivé non plus', /Vous n'êtes pas en poste le/.test(t.err || '') && b.lire('FOXTRO', j) === '', t);
  /* Statut A : « absent de jour, garde possible » (décision du 08/11/2026) — la date de contrat ne bloque pas. */
  b.poser('DELTA', j, 'A');
  t = prendre('DELTA');
  V('hors contrat MAIS statut A ce jour-là : pas de blocage, la question d\'absence habituelle', /^\[ABS\]/.test(t.err || ''), t);
  t = prendre('DELTA', { accepteAbsence: true });
  V('…et confirmée, la garde passe', t.r && t.r.etat === 'acceptee' && b.lire('DELTA', j) === 'G', t);

  /* Réserver : le collègue visé doit pouvoir la tenir. */
  b.poser('ALPHA', b.dates[20], 'G'); b.poser('ALPHA', b.dates[21], 'RG');
  const nAvantReserve = b.echanges().length;
  V('réserver une garde à un MAR sans garde est refusé, avec son nom', /ne fait pas de gardes/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(b.dates[20])}, mode:'don', reserve:'CHARLI' })`).err || ''));
  V('réserver une garde à un MAR parti est refusé', /n'est pas en poste le/.test(essai(b, `deposerBourse(${U('ALPHA')}, { year:2027, date:${JSON.stringify(b.dates[20])}, mode:'don', reserve:'DELTA' })`).err || ''));
  V('…aucune offre n\'a été créée par ces refus', b.echanges().length === nAvantReserve, [nAvantReserve, b.echanges().length]);

  /* Un 18 h reste ouvert au MAR sans garde. */
  b.poser('ALPHA', b.dates[30], '18');
  const r18 = deposer(b, 'ALPHA', b.dates[30], 'don');
  t = essai(b, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r18.id)} })`);
  V('un MAR sans garde peut toujours prendre un 18 h', t.r && t.r.etat === 'acceptee' && String(b.lire('CHARLI', b.dates[30])) === '18', t);

  /* Échange proposé sur une offre : celui qui recevrait la garde de l'offre doit pouvoir la tenir. */
  const c = monde(2027);
  c.poser('ALPHA', c.dates[9], 'G'); c.poser('ALPHA', c.dates[10], 'RG'); c.poser('DELTA', c.dates[3], 'G'); c.poser('DELTA', c.dates[4], 'RG');
  fiches(c, { dateFin: { DELTA: c.dates[5] } });
  const ro = deposer(c, 'ALPHA', c.dates[9], 'echange');
  t = essai(c, `creerEchange(${U('DELTA')}, { type:'echange', year:2027, date:${JSON.stringify(c.dates[3])}, date2:${JSON.stringify(c.dates[9])}, receveur:'ALPHA', offre:${JSON.stringify(ro.id)} })`);
  V('proposer un échange qui me donnerait une garde après mon départ est refusé', /Vous n'êtes pas en poste le/.test(t.err || '') && c.echanges().length === 1, t);

  /* Contre-épreuve : mêmes gestes, fiches sans restriction → tout passe comme avant. */
  const g = monde(2027);
  g.poser('ALPHA', g.dates[9], 'G'); g.poser('ALPHA', g.dates[10], 'RG');
  fiches(g, {});
  const rg = deposer(g, 'ALPHA', g.dates[9], 'don');
  V('contre-épreuve : sans restriction dans sa fiche, CHARLI prend la garde', run(g, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(rg.id)} })`).etat === 'acceptee' && g.lire('CHARLI', g.dates[9]) === 'G');
  V('contre-épreuve : le serveur d\'avant le correctif laissait un MAR sans garde prendre',
    !/_echangesInapte_/.test(require('child_process').execSync('git show 0a54250:gas/echanges.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1e8 })));
}

console.log('\n═══ 13. Le preneur est de 18 h : il le lit et confirme AVANT de prendre (27/11/2026) ═══');
{
  /* DÉFAUT TROUVÉ AUX SCÉNARIOS DE VIE RÉELLE : le 18 h du preneur passe au donneur (règle
     du 11/11). Dans la bourse, personne ne le savait avant : le donneur l'apprenait par
     notification, le preneur n'avait aucun message. */
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG'); b.poser('BRAVO', j, '18');
  const r = deposer(b, 'ALPHA', j, 'don');
  const n = b.echanges().length;
  let t = essai(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`);
  V('premier appui : une question [18P], qui nomme le jour et le donneur', /^\[18P\] Vous êtes de 18 h le /.test(t.err || '') && /votre 18 h passe au /.test(t.err || '') && /Vous confirmez \?$/.test(t.err || ''), t);
  V('…rien n\'est écrit : ni garde, ni 18 h déplacé, ni ligne', b.lire('ALPHA', j) === 'G' && String(b.lire('BRAVO', j)) === '18' && b.echanges().length === n && ligneDe(b, r.id)[COL.ETAT] === 'attente');
  t = essai(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)}, accepte18Passe:true })`);
  V('confirmé : la garde passe au preneur, son 18 h au donneur', t.r && t.r.etat === 'acceptee' && b.lire('BRAVO', j) === 'G' && String(b.lire('ALPHA', j)) === '18', [t, b.lire('BRAVO', j), b.lire('ALPHA', j)]);
  V('le donneur reste prévenu par notification', b.notifs.some(x => x.cible && x.cible.id === 'ALPHA' && /18 h/.test(x.titre + ' ' + x.corps)), b.notifs.slice(-4));

  const c = monde(2027);
  c.poser('ALPHA', c.dates[9], 'G'); c.poser('ALPHA', c.dates[10], 'RG'); c.poser('BRAVO', c.dates[10], '18');
  const rc = deposer(c, 'ALPHA', c.dates[9], 'don');
  t = essai(c, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(rc.id)} })`);
  V('18 h le LENDEMAIN de la garde : même question', /^\[18P\]/.test(t.err || ''), t);

  const g = monde(2027);
  g.poser('ALPHA', g.dates[9], 'G'); g.poser('ALPHA', g.dates[10], 'RG');
  const rg = deposer(g, 'ALPHA', g.dates[9], 'don');
  V('preneur sans 18 h : aucune question, prise au premier appui', run(g, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(rg.id)} })`).etat === 'acceptee');
  /* Un refus franc passe AVANT la question : inutile de confirmer un geste impossible. */
  const d = monde(2027);
  d.poser('ALPHA', d.dates[9], 'G'); d.poser('ALPHA', d.dates[10], 'RG'); d.poser('BRAVO', d.dates[8], 'G2'); d.poser('BRAVO', d.dates[9], 'RG');
  const rd = deposer(d, 'ALPHA', d.dates[9], 'don');
  t = essai(d, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(rd.id)} })`);
  V('preneur de garde la veille : refus net, pas de question', !!t.err && !/^\[/.test(t.err), t);

  const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  V('écran : la question [18P] est connue de la feuille de confirmation', /'\[18P\]':'accepte18Passe'/.test((idx.match(/const _BX_QUESTIONS = \{([^}]*)\}/) || [, ''])[1]));
  V('écran : au dépôt d\'une garde, le donneur lit qu\'il peut hériter du 18 h', /id="bxAvert18"[^>]*>Si le collègue qui prend votre garde est de 18 h ce jour-là ou le lendemain, c\\'est vous qui ferez son 18 h/.test(idx)
    && /getElementById\('bxAvert18'\); if \(av\) av\.style\.display = \(g && g\.type !== '18'\) \? 'block' : 'none'/.test(idx));
}

console.log('\n═══ 14. Un geste accepté fait retirer les demandes de temps partiel devenues sans objet (27/11/2026) ═══');
{
  /* La règle elle-même (quelle demande part, qui est prévenu) est éprouvée sur le vrai code
     dans banc_pose_tp.js (PT42). Ici : le branchement — appelée après une prise, pour la
     bonne année, et au passage horaire pour les années ouvertes à la pose. */
  const b = monde(2027);
  const j = b.dates[9];
  b.poser('ALPHA', j, 'G'); b.poser('ALPHA', b.dates[10], 'RG');
  b.ctx.__tp = [];
  run(b, 'function tpDemandesCaduques_(y){ __tp.push(y); return []; } function _phaseTp_(){ return { actif:true, annee:2027, annees:[2027, 2028] }; }');
  const r = deposer(b, 'ALPHA', j, 'don');
  V('un simple dépôt n\'y touche pas', b.ctx.__tp.length === 0, b.ctx.__tp);
  run(b, `prendreBourse(${U('BRAVO')}, { id:${JSON.stringify(r.id)} })`);
  V('après la prise : les demandes de l\'année de la garde sont revues', b.ctx.__tp.length === 1 && b.ctx.__tp[0] === 2027, b.ctx.__tp);
  b.ctx.__tp.length = 0; run(b, 'expirerEchanges()');
  V('au passage horaire : toutes les années ouvertes à la pose', b.ctx.__tp.join() === '2027,2028', b.ctx.__tp);
  run(b, 'tpDemandesCaduques_ = function(){ throw new Error("panne"); }');
  b.poser('ALPHA', b.dates[30], 'G'); b.poser('ALPHA', b.dates[31], 'RG');
  const r2 = deposer(b, 'ALPHA', b.dates[30], 'don');
  V('une panne de ce nettoyage n\'empêche jamais la prise', run(b, `prendreBourse(${U('CHARLI')}, { id:${JSON.stringify(r2.id)} })`).etat === 'acceptee' && b.lire('CHARLI', b.dates[30]) === 'G');
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
