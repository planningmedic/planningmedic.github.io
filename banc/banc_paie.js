/* ═══ BANC — VUE PAIE (18/10/2026) ═══
   Deux secrétaires saisissent gardes et vacances dans le logiciel de paie. Elles
   reçoivent une page en LECTURE SEULE (paie.html) et un mail à chaque changement.
   Ce banc exécute le VRAI code :
     P1. le routeur : le code paie n'atteint que login + getPlanningPaie ; tout rôle
         autre que admin/mar sans liste blanche est refusé (refus par défaut) ;
     P2. checkCode : le code paie ouvre le rôle « paie », sans défaut ;
     P3. getPlanningPaie : seuls G, G2, V sortent — jamais un autre motif ;
         la porte : paie, comité, MAR qui a la tuile cachée `paie` ;
     P4. le mail : don, échange, vacances, changement de secteur muet, échec d'envoi,
         mode d'essai, origine du changement ;
     P5. le branchement dans la tournée des mails : indépendant de NOTIF_ACTIVE,
         isolé des mails aux MAR, l'année revient dans la file en cas d'échec ;
     P6. la page : grille du mois, totaux, cadre orange, mois voisins, accès refusé
         sans déconnexion du portail ;
     P7. la tuile cachée du portail.
   CONTRE-ÉPREUVES : (a) avec l'ancien refus écrit pour le seul nom « secretariat »,
   le code paie atteindrait creerEchange ; (b) sans le tri des codes, un code brut
   (CTP) et un repos (RG) sortiraient vers la page.
   P4 ter (25/11/2026) : vacances, TP et formation partent toujours par mail ; une
   garde seulement si elle tombe au plus tard le dimanche de la semaine prochaine
   (passé compris) ; une garde lointaine entre quand même dans les derniers
   changements. Contre-épreuves : sans le filtre, la garde lointaine partirait ;
   avec l'ancien tri (vacances seules), TP et formation se tairaient. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { extraireFonction } = require('./stubs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

function extraireConst(fichier, nom) {
  const src = fs.readFileSync(fichier, 'utf8');
  const i = src.indexOf('const ' + nom + ' ');
  if (i < 0) throw new Error(nom + ' introuvable dans ' + fichier);
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{' || ch === '[' || ch === '(') prof++;
    else if (ch === '}' || ch === ']' || ch === ')') prof--;
    else if (ch === ';' && prof === 0) return src.slice(i, j + 1);
  }
  throw new Error('fin de ' + nom + ' introuvable');
}
const IND = path.join(__dirname, '..', 'gas', 'Indispos.gs');
const CODE = path.join(__dirname, '..', 'gas', 'code.gs');
const GARDES = path.join(__dirname, '..', 'gas', 'gardes.gs');

const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => t, _t: t }) };

/* ── Un planning publié de démonstration : novembre 2026, quatre médecins ── */
const FERIES = { '2026-11-01': 1, '2026-11-11': 1, '2026-11-19': 1 };
function fabriquerPlanning(regle) {
  const days = [];
  for (let d = 1; d <= 30; d++) {
    const date = '2026-11-' + String(d).padStart(2, '0');
    const dow = new Date(date + 'T12:00:00').getDay();
    days.push({ date, day: d, dow, isWeekend: dow === 0 || dow === 6, isFerie: !!FERIES[date] });
  }
  const ids = ['MAR01', 'MAR02', 'MAR03', 'MAR04'];
  const doctors = ids.map(id => ({ id, initials: id.slice(-2), days: days.map(j => {
    const st = (regle[id] && regle[id][j.date]) || '';
    return { status: st, morning: st ? '' : 'VIS', afternoon: st ? '' : 'VIS', cs: '' };
  }) }));
  return { months: [{ id: '2026-11', label: 'Novembre 2026', year: 2026, month: 11, days, doctors }] };
}
const BASE = {
  MAR01: { '2026-11-14': 'G', '2026-11-03': 'G', '2026-11-05': 'CTP', '2026-11-09': 'F', '2026-11-10': 'A' },
  MAR02: { '2026-11-21': 'G2', '2026-11-12': 'G', '2026-11-16': 'RG', '2026-11-17': '18' },
  MAR03: { '2026-11-27': 'G2', '2026-11-02': 'VAC', '2026-11-03': 'V', '2026-11-04': 'V', '2026-11-18': 'CL' },
  MAR04: { '2026-11-07': 'G2', '2026-11-24': 'TP', '2026-11-25': 'R' },
};
const copie = o => JSON.parse(JSON.stringify(o));

/* ═══ P1. Le routeur ═══ */
console.log('\n═══ P1. Routeur : le code paie n\'atteint que ses deux actions ═══');
function monterRouteur(srcRouteur) {
  const ctx = vm.createContext({ JSON, String, Set, Object, Array, console, ContentService,
    WRITE_ACTIONS_LOCK: new Set(['creerEchange', 'saveIndispos']),
    _statsActionIncr_: () => {}, viderCacheConfig: () => {},
    LockService: { getScriptLock: () => ({ tryLock: () => true }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
    checkCode: c => ({ PAIE: { role: 'paie', id: 'PAIE' }, SECR: { role: 'secretariat', id: 'SECRETARIAT' },
                       MAR: { role: 'mar', id: 'MAR01' }, ADM: { role: 'admin', id: 'ADMIN' },
                       BIZ: { role: 'inconnu', id: 'X' } })[c] || null,
  });
  ['SECRETARIAT_ACTIONS', 'PAIE_ACTIONS'].forEach(n => vm.runInContext(extraireConst(IND, n), ctx));
  vm.runInContext(extraireFonction(IND, '_listeBlancheRole_'), ctx);
  vm.runInContext(srcRouteur, ctx);
  const actions = ['login', 'getPlanningPaie', 'getConsultAbsences', 'creerEchange', 'getPlanningJson',
                   'getAffectationsJson', 'getIndispos', 'saveIndispos', 'getStatsLive'];
  const avecCode = {};
  actions.forEach(a => { avecCode[a] = { fn: () => 'ATTEINT:' + a }; });
  ctx._actions_ = () => ({ sansCode: {}, avecCode });
  return (code, action) => {
    const r = ctx._routeRequete_({ parameter: { payload: JSON.stringify({ action, code }) } });
    return typeof r === 'string' && r.indexOf('ATTEINT:') === 0 ? 'atteint' : (JSON.parse(r).error || '?');
  };
}
const SRC_ROUTEUR = extraireFonction(IND, '_routeRequete_');
{
  const appel = monterRouteur(SRC_ROUTEUR);
  V('code paie → login atteint', appel('PAIE', 'login') === 'atteint');
  V('code paie → getPlanningPaie atteint', appel('PAIE', 'getPlanningPaie') === 'atteint');
  ['creerEchange', 'getPlanningJson', 'getAffectationsJson', 'getConsultAbsences', 'getIndispos', 'saveIndispos', 'getStatsLive', 'actionDuPortail']
    .forEach(a => V('code paie → ' + a + ' REFUSÉ', appel('PAIE', a) === 'Action non autorisée pour ce code', appel('PAIE', a)));
  V('code secrétariat (consultations) → getPlanningPaie REFUSÉ', appel('SECR', 'getPlanningPaie') === 'Action non autorisée pour ce code');
  V('code secrétariat → getConsultAbsences toujours atteint', appel('SECR', 'getConsultAbsences') === 'atteint');
  V('code secrétariat → creerEchange toujours refusé', appel('SECR', 'creerEchange') === 'Action non autorisée pour ce code');
  V('rôle inconnu sans liste blanche → même login refusé (refus par défaut)', appel('BIZ', 'login') === 'Action non autorisée pour ce code');
  V('un MAR passe toujours à la table (le corps décide)', appel('MAR', 'creerEchange') === 'atteint' && appel('MAR', 'getPlanningPaie') === 'atteint');
  V('le comité passe toujours à la table', appel('ADM', 'getPlanningPaie') === 'atteint');
  V('code inconnu → « Code invalide »', appel('ZZZ', 'login') === 'Code invalide');

  // CONTRE-ÉPREUVE (a) : l'ancien refus, écrit pour le seul nom « secretariat ».
  const ancien = SRC_ROUTEUR.replace(/if \(user\.role !== 'admin' && user\.role !== 'mar'\) \{[\s\S]*?\n    \}\n/,
    "if (user.role === 'secretariat' && !SECRETARIAT_ACTIONS.has(action)) { return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Action non autorisée pour ce code' })).setMimeType(ContentService.MimeType.JSON); }\n");
  V('contre-épreuve : le remplacement de l\'ancien refus a bien eu lieu', ancien !== SRC_ROUTEUR);
  const appelAncien = monterRouteur(ancien);
  V('contre-épreuve : avec l\'ancien refus, le code paie ATTEIGNAIT creerEchange', appelAncien('PAIE', 'creerEchange') === 'atteint');
}

/* ═══ P2. checkCode ═══ */
console.log('\n═══ P2. checkCode : le code paie ouvre le rôle « paie » ═══');
function monterCheck(config) {
  const ctx = vm.createContext({ String, Object, Array, console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
    _configRows_: () => [['CLE', 'VALEUR']].concat(config),
    _medecinsRows_: () => [], _tuilesPriveesDe_: () => [] });
  vm.runInContext(extraireFonction(IND, 'checkCode'), ctx);
  return c => ctx.checkCode(c);
}
{
  const cc = monterCheck([['ADMIN_CODE', 'ADM123'], ['SECRETARIAT_CODE', 'SEC456'], ['PAIE_CODE', 'PAY789']]);
  const u = cc('PAY789');
  V('PAIE_CODE → rôle paie', u && u.role === 'paie' && u.id === 'PAIE', u);
  V('casse ignorée (saisie sur PC en minuscules)', (cc('pay789') || {}).role === 'paie');
  V('le code secrétariat reste le secrétariat', (cc('SEC456') || {}).role === 'secretariat');
  V('le code du comité reste le comité', (cc('ADM123') || {}).role === 'admin');
  V('rien ne fuit : ni nom de médecin, ni tuiles dans l\'identité paie', !('tuiles' in u) && !('rpps' in u));
  V('un code vide n\'ouvre rien', cc('') === null && cc('   ') === null);
  const sans = monterCheck([['ADMIN_CODE', 'ADM123']]);
  V('sans clé PAIE_CODE dans CONFIG, le rôle n\'existe pas', sans('PAY789') === null);
  const vide = monterCheck([['PAIE_CODE', '']]);
  V('une clé PAIE_CODE vide n\'ouvre rien', vide('') === null);
  const meme = monterCheck([['SECRETARIAT_CODE', 'X1'], ['PAIE_CODE', 'X1']]);
  V('deux codes identiques : le secrétariat gagne (le moins de motifs)', (meme('X1') || {}).role === 'secretariat');
}

/* ═══ socle commun « code.gs paie » ═══ */
function monterPaie(extra) {
  const props = {};
  const drive = {};
  const mails = [];
  const ctx = vm.createContext(Object.assign({ console, JSON, String, Array, Object, Number, Date, Math,
    ContentService,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    readPlanningFromDrive: n => (n in drive ? drive[n] : null),
    savePlanningToDrive: (n, c) => { drive[n] = c; },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: o => { if (ctx.__panne) throw new Error(ctx.__panne); mails.push(o); } },
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 16).replace('T', ' ') },
    _echangesDr_: id => 'Dr ' + id,
    // (11/11/2026) Rythme 2/2 simulé : MAR02 est en semaine off du 23 au 29/11.
    estSemaineOff: (id, d) => id === 'MAR02' && d >= '2026-11-23' && d <= '2026-11-29',
    _configRows_: () => [['CLE', 'VALEUR']].concat(ctx.__config || []),
    _echangesLignes_: () => ({ lignes: ctx.__echanges || [] }),
  }, extra || {}));
  ['NOTIF_JOURS', 'NOTIF_MOIS', 'NOTIF_PROP_TEST', 'PAIE_LIB', 'PAIE_ABS', 'PAIE_DEMI', 'PAIE_SITE', 'PAIE_PROP_RECENTS', 'PAIE_RECENTS_JOURS']
    .forEach(n => vm.runInContext(extraireConst(CODE, n), ctx));
  ['_paieCode_', '_paieCodeJour_', '_paieDr_', '_paieNomSession_', '_paieAplatir_', '_planningPaie_', '_paieDiff_', '_paiePlages_',
   '_paieTotaux_', '_paieNb_', '_paieOrigine_', '_paieHeure_', '_paieJoli_', '_paieMoisJoli_', '_paieTag_', '_paieAbsLib_', '_paieListe_', '_paieCourt_', '_paieQuand_', '_paieApercu_',
   '_paieSujet_', '_paieGestes_', '_paieTexte_', '_paieHtml_', '_paieDestinataires_', '_paieRecentsLire_',
   '_paieRecentsAjouter_', '_paieLimiteGardes_', '_paieAEnvoyer_', '_paieEnvoyerAnnee_']
    .forEach(n => vm.runInContext(extraireFonction(CODE, n), ctx));
  return { ctx, props, drive, mails };
}

/* ═══ P3. getPlanningPaie ═══ */
console.log('\n═══ P3. getPlanningPaie : seuls G, G2, V, TP et F sortent ═══');
{
  const { ctx, drive } = monterPaie({
    getActiveYear: () => 2026,
    _deny: () => JSON.stringify({ success: false, error: 'Accès refusé' }),
    _error: m => JSON.stringify({ success: false, error: m }),
    _aDroitTuile_: (id, cle) => id === 'MAR01' && cle === 'paie',
  });
  vm.runInContext(extraireFonction(GARDES, '_act_getPlanningPaie'), ctx);
  // (11/11/2026) + une semaine off du 2/2 pour MAR02 (A du lundi 23 au dimanche 29)
  // et un TP posé sur le férié du 11 : ni le week-end ni le férié ne sortent en TP.
  const BASE_TP = copie(BASE);
  ['23', '24', '25', '26', '27', '28', '29'].forEach(j => { BASE_TP.MAR02['2026-11-' + j] = 'A'; });
  BASE_TP.MAR04['2026-11-11'] = 'TP';
  drive['planning_2026.json'] = JSON.stringify(fabriquerPlanning(BASE_TP));
  const lire = (user, year) => JSON.parse(ctx._act_getPlanningPaie({ payload: { year: year || 2026 }, user }));

  const r = lire({ role: 'paie', id: 'PAIE' });
  V('le code paie lit le mois', r.success === true && r.role === 'paie', r);
  const valeurs = [].concat(...Object.values(r.cases).map(c => Object.values(c)));
  V('chaque case vaut G, G2, V, TP ou F — rien d\'autre', valeurs.length > 0 && valeurs.every(v => ['G', 'G2', 'V', 'TP', 'F'].indexOf(v) > -1), valeurs);
  // (25/11/2026) La formation est servie à la page (elle part aussi par mail).
  V('F : une formation est servie comme F', r.cases.MAR01['2026-11-09'] === 'F', r.cases.MAR01);
  V('le compte est exact : 3 G, 3 G2, 3 V', valeurs.filter(v => v === 'G').length === 3 && valeurs.filter(v => v === 'G2').length === 3 && valeurs.filter(v => v === 'V').length === 3);
  V('VAC est servi comme V (même saisie dans le logiciel de paie)', r.cases.MAR03['2026-11-02'] === 'V');
  // (11/11/2026) Jours de TP : TP et CTP servis comme TP, un jour ouvré seulement.
  V('TP : un jour TP est servi comme TP', r.cases.MAR04['2026-11-24'] === 'TP');
  V('TP : un jour CTP est servi comme TP', r.cases.MAR01['2026-11-05'] === 'TP');
  V('TP : un « A » hors rythme 2/2 (statut A) reste écarté', !('2026-11-10' in r.cases.MAR01));
  V('TP : un TP posé un jour férié ne sort pas', !('2026-11-11' in r.cases.MAR04));
  const off = Object.keys(r.cases.MAR02 || {}).filter(d => r.cases.MAR02[d] === 'TP').sort();
  V('TP : la semaine off du 2/2 (A) sort en TP, du lundi au vendredi seulement',
    off.join(',') === '2026-11-23,2026-11-24,2026-11-25,2026-11-26,2026-11-27', off);
  const brut = JSON.stringify(r);
  ['"CTP"', '"A"', '"RG"', '"18"', '"CL"', '"R"', 'VIS', 'morning', 'afternoon'].forEach(x =>
    V('la réponse ne contient nulle part ' + x, brut.indexOf(x) < 0));
  V('les jours portent week-end et férié', r.jours.find(j => j.date === '2026-11-14').we === true && r.jours.find(j => j.date === '2026-11-19').fe === true);
  V('les noms sont lisibles (Dr …)', r.noms.MAR02 === 'Dr MAR02');
  V('le mois liste ses médecins', r.mois[0].id === '2026-11' && r.mois[0].ids.length === 4);
  V('le nom de session des secrétaires', r.nom === 'Secrétariat paie');

  V('le comité lit aussi', lire({ role: 'admin', id: 'ADMIN' }).success === true);
  const m1 = lire({ role: 'mar', id: 'MAR01' });
  V('un MAR qui a la tuile cachée lit, avec son nom', m1.success === true && m1.nom === 'Dr MAR01');
  V('un MAR SANS la tuile est refusé', lire({ role: 'mar', id: 'MAR02' }).error === 'Accès refusé');
  V('le secrétariat des consultations est refusé (aussi dans le corps)', lire({ role: 'secretariat', id: 'SECRETARIAT' }).error === 'Accès refusé');
  const a27 = lire({ role: 'paie', id: 'PAIE' }, 2027);
  V('année sans planning publié : réponse propre « absent »', a27.success === true && a27.absent === true);

  // CONTRE-ÉPREUVE (b) : un tri qui laisserait passer le code brut.
  const { ctx: c2 } = monterPaie();
  vm.runInContext('_paieCode_ = function (st) { return String(st || "").trim(); };', c2);
  const fuite = JSON.stringify(c2._planningPaie_(fabriquerPlanning(BASE), 2026, []));
  V('contre-épreuve : sans le tri, CTP et RG sortiraient vers la page', fuite.indexOf('"CTP"') > -1 && fuite.indexOf('"RG"') > -1);
}

/* ═══ P4. Le mail ═══ */
console.log('\n═══ P4. Le mail des secrétaires de paie ═══');
const MAINTENANT = Date.parse('2026-11-16T09:00:00Z');
{
  const S = monterPaie();
  const { ctx, drive, mails, props } = S;
  const envoyer = regle => ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(regle)), MAINTENANT);

  // 1. Sans adresse : photo prise, rien n'est envoyé.
  let r = envoyer(BASE);
  V('sans PAIE_EMAILS : aucun mail', mails.length === 0 && r.envoye === false && r.motif === 'aucune adresse', r);
  V('… mais la photo suit le planning', !!drive['planning_2026_paie.json']);

  // 2. Adresses présentes, photo absente → première photo seulement.
  delete drive['planning_2026_paie.json'];
  ctx.__config = [['PAIE_EMAILS', 'paie1@exemple.test; paie2@exemple.test']];
  r = envoyer(BASE);
  V('première fois : photo, pas de mail', mails.length === 0 && r.motif === 'première photo', r);

  // 3. Changement de SECTEUR seul : muet.
  const secteur = fabriquerPlanning(BASE);
  secteur.months[0].doctors[3].days[1].morning = 'ORTH';
  r = ctx._paieEnvoyerAnnee_(2026, JSON.stringify(secteur), MAINTENANT);
  V('un changement de secteur ne produit aucun mail', mails.length === 0 && r.motif === 'rien pour la paie', r);

  // 4. (25/11/2026) Un jour de TP (CTP) et une formation ajoutés : UN mail, deux changements.
  const conges = copie(BASE); conges.MAR02['2026-11-06'] = 'CTP'; conges.MAR04['2026-11-10'] = 'F';
  r = envoyer(conges);
  const mc = mails[0] || {};
  V('TP + formation : un mail, deux changements', mails.length === 1 && r.envoye === true && r.nb === 2, r);
  V('… le geste TP : « Saisir 1 jour de temps partiel »', /Saisir 1 jour de temps partiel pour Dr MAR02, le vendredi 6 novembre 2026\./.test(mc.body || ''), mc.body);
  V('… le geste formation : « Saisir 1 jour de formation »', /Saisir 1 jour de formation pour Dr MAR04, le mardi 10 novembre 2026\./.test(mc.body || ''));
  V('… les intitulés accordés (temps partiel ajouté, formation ajoutée)', /temps partiel ajouté/.test(mc.htmlBody || '') && /formation ajoutée/.test(mc.htmlBody || ''));
  V('… les totaux du mois (temps partiel 0 → 1, formation 0 → 1)', /Dr MAR02, novembre 2026 : jour de temps partiel 0 → 1/.test(mc.body || '') && /Dr MAR04, novembre 2026 : formation 0 → 1/.test(mc.body || ''), mc.body);

  // 4 bis. Un jour de TP déplacé (du mardi 24 au jeudi 26) : retiré + ajouté.
  const tp = copie(conges); tp.MAR04['2026-11-26'] = 'TP'; delete tp.MAR04['2026-11-24'];
  r = envoyer(tp);
  const mt = mails[1] || {};
  V('TP déplacé : un mail, retrait et ajout', mails.length === 2 && r.nb === 2
    && /Retirer 1 jour de temps partiel pour Dr MAR04, le mardi 24 novembre 2026\./.test(mt.body || '')
    && /Saisir 1 jour de temps partiel pour Dr MAR04, le jeudi 26 novembre 2026\./.test(mt.body || ''), mt.body);
  V('objet d\'un seul changement de formation', (() => { const f = copie(tp); delete f.MAR04['2026-11-10']; envoyer(f);
    return (mails[2] || {}).subject === 'À saisir : formation retirée · Dr MAR04 · 10/11'; })(), (mails[2] || {}).subject);
  r = envoyer(conges);
  V('retour à l\'état « congés » : un mail de plus', mails.length === 4);
  mails.length = 0;   // la suite compte ses mails à partir de zéro

  // 5. DON : la garde réa du samedi 14 passe de MAR01 à MAR02 (et le congé reste muet).
  ctx.__echanges = [{ TYPE: 'don', DATE: '2026-11-14', DATE2: '', DEMANDEUR: 'MAR01', RECEVEUR: 'MAR02', ETAT: 'acceptee', REPONDU_LE: '2026-11-16T08:42:00.000Z' }];
  const don = copie(conges); delete don.MAR01['2026-11-14']; don.MAR02['2026-11-14'] = 'G';
  r = envoyer(don);
  V('le don part en UN mail', mails.length === 1 && r.envoye === true && r.nb === 1, r);
  const m = mails[0] || {};
  V('aux deux secrétaires ensemble', m.to === 'paie1@exemple.test,paie2@exemple.test', m.to);
  V('objet : « À saisir : », garde, jour et date courte, qui cède à qui', m.subject === 'À saisir : garde réanimation du samedi 14/11 · Dr MAR01 → Dr MAR02', m.subject);
  // (25/11/2026) Aperçu de la boîte de réception (texte caché en tête du mail).
  const apercu = (m.htmlBody.match(/^<div style="display:none[^>]*>([^&<]*)/) || [])[1];
  V('aperçu de la boîte de réception : en tout premier, le geste à faire', apercu === 'Retirer la garde réanimation du samedi 14 novembre 2026 à Dr MAR01. Ajouter la garde réanimation du samedi 14 novembre 2026 à Dr MAR02.', apercu);
  V('… caché à l\'ouverture (display:none, mso-hide:all)', /^<div style="display:none;[^"]*mso-hide:all/.test(m.htmlBody));
  V('… le bandeau « Planning-Med · paie » ne vient qu\'après', m.htmlBody.indexOf('Planning-Med · paie') > m.htmlBody.indexOf(apercu));
  V('le geste à reporter : retirer à MAR01', /Retirer la garde réanimation du samedi 14 novembre 2026 à Dr MAR01\./.test(m.body));
  V('le geste à reporter : ajouter à MAR02', /Ajouter la garde réanimation du samedi 14 novembre 2026 à Dr MAR02\./.test(m.body));
  V('le samedi est signalé « week-end »', /week-end/.test(m.htmlBody) && /\(week-end\)/.test(m.body));
  V('totaux du mois : MAR01 passe de 2 à 1 garde réa', /Dr MAR01, novembre 2026 : garde réanimation 2 → 1/.test(m.body), m.body);
  V('totaux du mois : MAR02 passe de 1 à 2 gardes réa', /Dr MAR02, novembre 2026 : garde réanimation 1 → 2/.test(m.body));
  V('l\'origine : le don, qui l\'a proposé et accepté', /Don de garde proposé par Dr MAR01 et accepté par Dr MAR02/.test(m.body), m.body);
  V('le lien ouvre la page paie sur le bon mois', m.body.indexOf('https://planningmedic.github.io/paie.html?m=2026-11') > -1 && m.htmlBody.indexOf('paie.html?m=2026-11') > -1);
  ['CTP', 'formation', 'temps partiel', 'Bloc', 'VIS'].forEach(x =>
    V('le mail ne dit rien de « ' + x + ' »', m.body.indexOf(x) < 0 && m.htmlBody.indexOf(x) < 0));
  const sansTexte = m.htmlBody.replace(/>[^<]*</g, '><');
  const ouv = (sansTexte.match(/<(table|tr|td|div|span|a|b|br)\b/g) || []).filter(x => x !== '<br').length;
  const fer = (sansTexte.match(/<\/(table|tr|td|div|span|a|b)>/g) || []).length;
  V('gabarit HTML équilibré', ouv === fer, { ouv, fer });
  V('gabarit sans flex ni grid (Outlook)', !/display:\s*(flex|grid)/.test(m.htmlBody));
  V('mail mobile : une carte par changement, geste court « Retirer à » / « Ajouter à »', /Retirer à Dr MAR01/.test(m.htmlBody) && /Ajouter à <b>Dr MAR02<\/b>/.test(m.htmlBody));
  V('mail mobile : plus de tableau à 4 colonnes (Date / Garde / Avant / Après)', !/>Avant<\/td>/.test(m.htmlBody) && !/>Après<\/td>/.test(m.htmlBody));
  V('mail mobile : dates protégées du soulignement automatique de l\'iPhone', /14&zwnj; novembre/.test(m.htmlBody));
  V('photo recalée après envoi', drive['planning_2026_paie.json'] === JSON.stringify(fabriquerPlanning(don)));
  const rec = JSON.parse(props.PAIE_RECENTS || '[]');
  const recDon = rec[rec.length - 1] || {};
  V('mémoire des derniers changements : le don, les deux cases', /garde réanimation du samedi 14/.test(recDon.titre) && recDon.cellules.length === 2 && recDon.cellules[0][1] === '2026-11-14', rec);

  // 6. Rejouer le même état : rien de neuf.
  r = envoyer(don);
  V('même état : aucun second mail', mails.length === 1);

  // 7. ÉCHANGE de gardes maternité 21 ↔ 27 entre MAR02 et MAR03.
  ctx.__echanges.push({ TYPE: 'echange', DATE: '2026-11-21', DATE2: '2026-11-27', DEMANDEUR: 'MAR02', RECEVEUR: 'MAR03', ETAT: 'acceptee', REPONDU_LE: '2026-11-16T08:50:00.000Z' });
  const ech = copie(don); delete ech.MAR02['2026-11-21']; ech.MAR03['2026-11-21'] = 'G2'; delete ech.MAR03['2026-11-27']; ech.MAR02['2026-11-27'] = 'G2';
  r = envoyer(ech);
  const m2 = mails[1] || {};
  V('échange : un mail, deux changements', mails.length === 2 && r.nb === 2, r);
  V('objet d\'un mail à plusieurs changements : les médecins concernés', m2.subject === 'À saisir : 2 changements · Dr MAR02, Dr MAR03', m2.subject);
  const ap2 = (m2.htmlBody.match(/^<div style="display:none[^>]*>([^&<]*)/) || [])[1];
  V('aperçu à plusieurs changements : le résumé de chacun', ap2 === 'Garde mater 21/11 : Dr MAR02 → Dr MAR03 · Garde mater 27/11 : Dr MAR03 → Dr MAR02', ap2);
  V('origine : l\'échange, une seule fois pour les deux dates', (m2.body.match(/Échange de gardes proposé par Dr MAR02 et accepté par Dr MAR03/g) || []).length === 1, m2.body);
  V('totaux inchangés pour un échange (1 → 1)', /Dr MAR02, novembre 2026 : garde maternité 1 → 1/.test(m2.body));

  // 8. VACANCES posées par le comité : vendredi 20 + lundi 23 → une seule plage (le week-end ne coupe pas).
  const vac = copie(ech); vac.MAR04['2026-11-20'] = 'V'; vac.MAR04['2026-11-23'] = 'V';
  r = envoyer(vac);
  const m3 = mails[2] || {};
  V('vacances : une plage du vendredi au lundi, 2 jours', r.nb === 1 && /Saisir 2 jours de vacances pour Dr MAR04, du vendredi 20 novembre 2026 au lundi 23 novembre 2026 inclus\./.test(m3.body), m3.body);
  V('objet vacances : la plage en date courte', m3.subject === 'À saisir : vacances ajoutées · Dr MAR04 · du 20/11 au 23/11', m3.subject);
  V('origine : le comité (aucun échange ne correspond)', /Modification du planning par le comité\./.test(m3.body));
  V('totaux vacances 0 → 2', /Dr MAR04, novembre 2026 : vacances 0 → 2/.test(m3.body));

  // 9. Vacances RETIRÉES.
  const vacMoins = copie(vac); delete vacMoins.MAR03['2026-11-04'];
  envoyer(vacMoins);
  V('vacances retirées : le geste dit « Retirer »', /Retirer 1 jour de vacances pour Dr MAR03, le mercredi 4 novembre 2026\./.test((mails[3] || {}).body || ''), (mails[3] || {}).body);

  // 10. ÉCHEC D'ENVOI : photo NON recalée, le même changement repart ensuite.
  const panne = copie(vacMoins); panne.MAR01['2026-11-28'] = 'G';
  ctx.__panne = 'Service invoked too many times';
  const photoAvant = drive['planning_2026_paie.json'];
  r = envoyer(panne);
  V('échec : rien n\'est perdu, l\'erreur remonte', r.envoye === false && /too many/.test(r.erreur), r);
  V('échec : la photo n\'a PAS bougé', drive['planning_2026_paie.json'] === photoAvant);
  ctx.__panne = null;
  r = envoyer(panne);
  V('passage suivant : le changement part', r.envoye === true && /28\/11/.test(mails[mails.length - 1].subject));

  // 11. Mode d'essai : tout part vers l'adresse d'essai.
  props.NOTIF_EMAIL_TEST = 'essai@exemple.test';
  const essai = copie(panne); essai.MAR02['2026-11-29'] = 'G';
  envoyer(essai);
  V('NOTIF_EMAIL_TEST détourne aussi le mail paie', mails[mails.length - 1].to === 'essai@exemple.test');
  delete props.NOTIF_EMAIL_TEST;

  // 12. Un mois NOUVEAU dans le planning (absent de la photo) ne déverse rien.
  const nouv = fabriquerPlanning(essai);
  nouv.months.push({ id: '2026-12', label: 'Décembre 2026', days: [{ date: '2026-12-01', isWeekend: false, isFerie: false }],
    doctors: [{ id: 'MAR01', days: [{ status: 'G' }] }] });
  const avantNb = mails.length;
  ctx._paieEnvoyerAnnee_(2026, JSON.stringify(nouv), MAINTENANT);
  V('un mois qui apparaît ne produit pas de mail', mails.length === avantNb);

  // 13. Mémoire : les entrées de plus de 14 jours s'effacent.
  const vieux = ctx._paieRecentsLire_(MAINTENANT + 15 * 24 * 3600 * 1000);
  V('au-delà de 14 jours, la mémoire est vide', vieux.length === 0);
  V('dans les 14 jours, elle est lue', ctx._paieRecentsLire_(MAINTENANT).length >= 5);
  // Plafond de taille d'une propriété de script.
  const beaucoup = [];
  for (let i = 0; i < 80; i++) beaucoup.push({ type: 'garde', date: '2026-11-1' + (i % 10), code: 'G', de: ['MAR01'], a: ['MAR02'] });
  ctx._paieRecentsAjouter_(beaucoup, MAINTENANT);
  V('la mémoire tient sous 8 000 caractères', String(props.PAIE_RECENTS).length <= 8000, String(props.PAIE_RECENTS).length);
}

/* ═══ P4 ter. (25/11/2026) Gardes : mail seulement jusqu'à la fin de la semaine prochaine ═══ */
console.log('\n═══ P4 ter. Gardes proches seulement ; vacances, TP, formation toujours ═══');
{
  const S = monterPaie();
  const { ctx, drive, mails, props } = S;
  ctx.__config = [['PAIE_EMAILS', 'paie1@exemple.test']];
  const at = iso => Date.parse(iso);
  // La limite : le dimanche de la semaine prochaine.
  [['2026-11-25T11:00:00Z', '2026-12-06', 'mercredi 25/11'], ['2026-11-27T11:00:00Z', '2026-12-06', 'vendredi 27/11 (jour de saisie)'],
   ['2026-11-28T11:00:00Z', '2026-12-06', 'samedi 28/11'], ['2026-11-29T11:00:00Z', '2026-12-06', 'dimanche 29/11'],
   ['2026-11-30T11:00:00Z', '2026-12-13', 'lundi 30/11'], ['2026-12-28T11:00:00Z', '2027-01-10', 'lundi 28/12 (passage d\'année)']]
    .forEach(([q, att, lib]) => { const l = ctx._paieLimiteGardes_(at(q)); V('limite des gardes, ' + lib + ' → ' + att, l === att, l); });

  // Lundi 2 novembre : limite au dimanche 15.
  const LUNDI = at('2026-11-02T09:00:00Z');
  const envoyerA = (regle, quand) => ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(regle)), quand);
  envoyerA(BASE, LUNDI);   // première photo
  V('première photo prise', !!drive['planning_2026_paie.json'] && mails.length === 0);

  // a) Garde LOINTAINE (samedi 21, au-delà du dimanche 15) : pas de mail, mais dans les derniers changements.
  const loin = copie(BASE); delete loin.MAR02['2026-11-21']; loin.MAR03['2026-11-21'] = 'G2';
  let r = envoyerA(loin, LUNDI);
  V('garde lointaine : aucun mail', mails.length === 0 && r.envoye === false && r.motif === 'gardes lointaines seulement', r);
  V('… la photo suit (elle ne repartira pas plus tard)', drive['planning_2026_paie.json'] === JSON.stringify(fabriquerPlanning(loin)));
  const rec = JSON.parse(props.PAIE_RECENTS || '[]');
  V('… elle entre dans les derniers changements de la page', rec.length === 1 && /garde maternité du samedi 21 novembre 2026/.test(rec[0].titre), rec);

  // b) Garde PROCHE (jeudi 12, avant le dimanche 15) : mail.
  const proche = copie(loin); delete proche.MAR02['2026-11-12']; proche.MAR04['2026-11-12'] = 'G';
  r = envoyerA(proche, LUNDI);
  V('garde de la semaine en cours : mail', mails.length === 1 && r.envoye === true && /jeudi 12\/11/.test(mails[0].subject), r);

  // c) Garde au dernier jour inclus (dimanche 15) : mail.
  const bord = copie(proche); bord.MAR01['2026-11-15'] = 'G';
  r = envoyerA(bord, LUNDI);
  V('garde le dimanche de la semaine prochaine (dernier jour inclus) : mail', mails.length === 2 && /dimanche 15\/11/.test(mails[1].subject), mails[1] && mails[1].subject);

  // d) Garde PASSÉE (mardi 3, corrigée le mercredi 25) : mail, elle est déjà saisie.
  const passe = copie(bord); delete passe.MAR01['2026-11-03']; passe.MAR04['2026-11-03'] = 'G';
  r = envoyerA(passe, at('2026-11-25T11:00:00Z'));
  V('garde déjà passée : mail', mails.length === 3 && /mardi 03\/11/.test(mails[2].subject), mails[2] && mails[2].subject);

  // e) Mélange un lundi : une garde lointaine + des vacances lointaines → mail des vacances SEULES.
  const mix = copie(passe); mix.MAR01['2026-11-28'] = 'G'; mix.MAR02['2026-11-30'] = 'V';
  r = envoyerA(mix, LUNDI);
  const mm = mails[3] || {};
  V('mélange : un mail, un seul changement (les vacances)', mails.length === 4 && r.nb === 1 && r.lointaines >= 1, r);
  V('… les vacances lointaines partent quand même', /Saisir 1 jour de vacances pour Dr MAR02, le lundi 30 novembre 2026\./.test(mm.body || ''), mm.body);
  V('… la garde lointaine n\'est pas dans le mail', !/28 novembre/.test(mm.body || '') && !/garde/.test(mm.subject || ''), mm.subject);
  V('… mais elle est dans les derniers changements', JSON.parse(props.PAIE_RECENTS).some(x => /samedi 28 novembre 2026/.test(x.titre)));
  V('… les totaux du mail ne parlent que des vacances', /Dr MAR02, novembre 2026 : vacances 0 → 1/.test(mm.body || '') && !/Dr MAR01, novembre 2026/.test(mm.body || ''), mm.body);

  // f) Plus de 3 médecins : les 2 premiers, puis « et N autres ».
  const S4 = monterPaie(); S4.ctx.__config = [['PAIE_EMAILS', 'paie1@exemple.test']];
  S4.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(BASE)), LUNDI);
  const quatre = copie(BASE); ['MAR01', 'MAR02', 'MAR03', 'MAR04'].forEach((id, i) => { quatre[id]['2026-11-1' + (6 + i)] = 'F'; });
  S4.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(quatre)), LUNDI);
  V('objet à 4 médecins : « Dr MAR01, Dr MAR02 et 2 autres »', (S4.mails[0] || {}).subject === 'À saisir : 4 changements · Dr MAR01, Dr MAR02 et 2 autres', (S4.mails[0] || {}).subject);

  // CONTRE-ÉPREUVE 1 : sans le filtre, la garde lointaine partait par mail.
  const S2 = monterPaie(); S2.ctx.__config = [['PAIE_EMAILS', 'paie1@exemple.test']];
  vm.runInContext('_paieAEnvoyer_ = function () { return true; };', S2.ctx);
  S2.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(BASE)), LUNDI);
  S2.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(loin)), LUNDI);
  V('contre-épreuve : sans le filtre, la garde lointaine partait par mail', S2.mails.length === 1 && /21\/11/.test(S2.mails[0].subject));

  // CONTRE-ÉPREUVE 2 : avec l'ancien tri (vacances seules), TP et formation se taisaient.
  const S3 = monterPaie(); S3.ctx.__config = [['PAIE_EMAILS', 'paie1@exemple.test']];
  vm.runInContext('delete PAIE_ABS.TP; delete PAIE_ABS.F;', S3.ctx);
  S3.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(BASE)), LUNDI);
  const tf = copie(BASE); tf.MAR02['2026-11-06'] = 'CTP'; tf.MAR04['2026-11-10'] = 'F';
  const r3 = S3.ctx._paieEnvoyerAnnee_(2026, JSON.stringify(fabriquerPlanning(tf)), LUNDI);
  V('contre-épreuve : avec l\'ancien tri, TP et formation ne partaient pas', S3.mails.length === 0 && r3.motif === 'rien pour la paie', r3);
}

/* ═══ P5. Branchement dans la tournée des mails ═══ */
console.log('\n═══ P5. Branchement : indépendant des mails aux MAR ═══');
{
  const props = { NOTIF_ACTIVE: 'N' };
  const drive = { 'planning_2026.json': '{"months":[]}', 'planning_2026_notifie.json': '{"months":[]}' };
  const journal = [];
  let paieAppels = 0, comportement = 'ok';
  const ctx = vm.createContext({ console, JSON, String, Array, Object, Number,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    readPlanningFromDrive: n => drive[n] || null, savePlanningToDrive: (n, c) => { drive[n] = c; },
    logAction: t => journal.push(t),
    _paieEnvoyerAnnee_: () => { paieAppels++; if (comportement === 'plante') throw new Error('boum');
      return comportement === 'echec' ? { envoye: false, nb: 2, erreur: 'quota' } : { envoye: true, nb: 1, erreur: null }; },
    _notifAplatir: () => ({}), _notifDiff: () => ({}), _notifSemaineExcel: () => ({ debut: '', fin: '' }),
    _notifExpedier: () => ({ sent: 0, skipped: 0, errors: [] }),
  });
  vm.runInContext(extraireConst(CODE, 'NOTIF_PROP_YEAR'), ctx);
  vm.runInContext(extraireConst(CODE, 'NOTIF_PROP_TEST'), ctx);
  ['_notifEnvoyerAnnee_', '_notifFileAnnees_', 'notifRecaler'].forEach(n => vm.runInContext(extraireFonction(CODE, n), ctx));
  ctx._notifEnvoyerAnnee_(2026, false);
  V('mails aux MAR éteints : le mail paie passe quand même', paieAppels === 1);
  V('… et les mails aux MAR restent éteints (photo seulement)', journal.some(t => /système éteint/.test(t)));
  comportement = 'echec';
  ctx._notifEnvoyerAnnee_(2026, true);
  V('échec du mail paie : l\'année revient dans la file', JSON.parse(props.NOTIF_YEAR || '[]').indexOf(2026) > -1, props.NOTIF_YEAR);
  V('… et c\'est écrit dans le journal', journal.some(t => /mail paie 2026 — 2 changement\(s\), NON envoyé \(quota\)/.test(t)), journal);
  comportement = 'plante';
  let leve = false;
  try { ctx._notifEnvoyerAnnee_(2026, true); } catch (e) { leve = true; }
  V('une panne du mail paie ne casse pas la tournée des MAR', leve === false && journal.some(t => /mail paie 2026 — erreur : boum/.test(t)));
  ctx.getActiveYear = () => 2026;
  ctx.Logger = { log: () => {} };
  drive['planning_2026.json'] = '{"months":["X"]}';
  ctx.notifRecaler(2026);
  V('notifRecaler recale AUSSI la photo paie', drive['planning_2026_paie.json'] === '{"months":["X"]}' && drive['planning_2026_notifie.json'] === '{"months":["X"]}');
}

/* ═══ P6 et P7. La page et la tuile ═══ */
(async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const HTML = fs.readFileSync(path.join(__dirname, '..', 'paie.html'), 'utf8');
  const dodo = ms => new Promise(r => setTimeout(r, ms));
  // La réponse servie à la page est produite par le VRAI tri serveur.
  const { ctx: srv } = monterPaie();
  const recents = [{ le: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), titre: 'garde réanimation du samedi 14 novembre 2026 : Dr MAR01 → Dr MAR02', cellules: [['MAR01', '2026-11-14'], ['MAR02', '2026-11-14']] },
                   { le: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), titre: 'vacances ajoutées pour Dr MAR03 (ancien)', cellules: [['MAR03', '2026-11-02', '2026-11-04']] }];
  const rep2026 = Object.assign({ success: true, nom: 'Secrétariat paie' }, JSON.parse(JSON.stringify(srv._planningPaie_(fabriquerPlanning(BASE), 2026, recents))));

  async function monter(role, reponse, url) {
    const appels = [], erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(HTML, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: url || 'https://planningmedic.github.io/paie.html?m=2026-11',
      beforeParse(win) {
        win.fetch = async (u, opt) => {
          const c = JSON.parse(opt.body); appels.push(c);
          return { ok: true, json: async () => reponse(c, role) };
        };
        try { win.sessionStorage.setItem('pmViewCode', 'CODE1'); } catch (e) {}
      } });
    await dodo(300);
    return { w: dom.window, d: dom.window.document, appels, erreurs };
  }
  const servir = (c, role) => {
    if (c.action !== 'getPlanningPaie') return { success: false, error: 'Action non autorisée pour ce code' };
    if (c.year === 2026) return Object.assign({}, rep2026, { role });
    return { success: true, role, annee: c.year, absent: true };
  };

  console.log('\n═══ P6. La page paie ═══');
  {
    const { w, d, appels, erreurs } = await monter('paie', servir);
    V('la page s\'ouvre sans erreur JavaScript', erreurs.length === 0, erreurs);
    V('la session reprend sans retaper le code (écran de code masqué)', d.getElementById('authOverlay').style.display === 'none');
    V('un seul appel : il authentifie et charge l\'année', appels.length === 1 && appels[0].action === 'getPlanningPaie' && appels[0].year === 2026, appels);
    V('le titre est le mois demandé par le lien', d.getElementById('titreMois').textContent === 'Novembre 2026');
    const lignes = d.querySelectorAll('table.mois tbody tr');
    V('une ligne par médecin : 4', lignes.length === 4);
    V('30 colonnes de jours + 5 totaux (G, G2, V, TP, F)', d.querySelectorAll('table.mois thead th').length === 1 + 30 + 5);
    const textes = [...d.querySelectorAll('table.mois tbody td .c')].map(e => e.textContent).filter(Boolean);
    V('les cases ne montrent que G, G2, V, TP, F', textes.length === 12 && textes.every(t => ['G', 'G2', 'V', 'TP', 'F'].includes(t)), textes);
    V('la formation de Dr MAR01 est affichée F', textes.filter(t => t === 'F').length === 1, textes);
    // (25/11/2026) Retour des secrétaires : sans bordure, on ne voyait pas quel jour c'était.
    const cssB = [...d.querySelectorAll('style')].map(e => e.textContent).join('\n');
    V('bordures : chaque en-tête de jour porte la classe du trait (30)', d.querySelectorAll('table.mois thead th.j').length === 30);
    V('bordures : chaque case de jour aussi (4 × 30)', d.querySelectorAll('table.mois tbody td.j').length === 4 * 30);
    V('bordures : les lundis (2, 9, 16, 23, 30) ont le trait marqué', [...d.querySelectorAll('table.mois thead th.lu')].map(th => th.textContent.replace(/\D/g, '')).join(',') === '2,9,16,23,30'
      && d.querySelectorAll('table.mois tbody td.lu').length === 4 * 5);
    V('bordures : trait fin entre les jours, plus marqué le lundi (CSS)', /table\.mois td\.j,table\.mois thead th\.j\{border-right:1px solid var\(--line-light\)\}/.test(cssB)
      && /table\.mois td\.lu,table\.mois thead th\.lu\{border-left:1px solid var\(--line\)\}/.test(cssB));
    V('la légende explique F', /formation/.test(d.querySelector('.legend').textContent));
    V('les 2 jours de TP (TP et CTP) sont affichés TP', textes.filter(t => t === 'TP').length === 2, textes);
    const l1 = [...lignes].find(tr => tr.querySelector('th').textContent === 'Dr MAR01');
    const tots = [...l1.querySelectorAll('td.tot')].map(t => t.textContent);
    V('totaux de Dr MAR01 : 2 G, 0 G2, 0 V, 1 TP, 1 F', tots.join('|') === '2|||1|1', tots);
    const mods = [...d.querySelectorAll('.c.mod')];
    V('cadre orange sur les 2 cases changées il y a 2 jours (pas sur celles d\'il y a 10 jours)', mods.length === 2, mods.length);
    V('le 19 novembre (férié) est en rouge', [...d.querySelectorAll('table.mois thead th.fe')].some(th => /19/.test(th.textContent)));
    V('les week-ends sont grisés', d.querySelectorAll('table.mois thead th.we').length === 9);
    V('le fil des derniers changements liste les 2 entrées', d.querySelectorAll('#fil li').length === 2);
    V('… replié par défaut, le nombre affiché dans le titre', d.getElementById('blocFil').tagName === 'DETAILS' && !d.getElementById('blocFil').open && /· 2$/.test(d.querySelector('#blocFil summary').textContent), d.querySelector('#blocFil summary').textContent);
    V('les secrétaires n\'ont pas de lien de retour au portail', d.getElementById('lnkBack').style.display === 'none');
    V('le bouton Excel est là', !!d.getElementById('btnXls'));
    V('le pavé « Lecture seule » est affiché', /Lecture seule/.test(d.querySelector('.lock-pill').textContent));

    d.getElementById('btnNext').click(); await dodo(150);
    V('mois suivant : décembre, sans planning publié → message clair', d.getElementById('titreMois').textContent === 'Décembre 2026' && /Pas de planning publié/.test(d.getElementById('zoneGrille').textContent));
    V('… l\'année 2026 n\'est pas redemandée, 2027 l\'est', appels.filter(a => a.year === 2026).length === 1 && appels.some(a => a.year === 2027), appels.map(a => a.year));
    d.getElementById('btnPrev').click(); await dodo(150);
    V('retour en novembre : la grille revient, sans nouvel appel', d.querySelectorAll('table.mois tbody tr').length === 4 && appels.filter(a => a.year === 2026).length === 1);
    V('l\'adresse garde le mois (lien partageable)', /\?m=2026-11$/.test(w.location.href));

    // (24/11/2026) Retour des secrétaires : en descendant vers les derniers médecins, la ligne
    // des jours disparaissait. Elle est figée en haut du cadre de la grille.
    const css = [...d.querySelectorAll('style')].map(e => e.textContent).join('\n');
    const regle = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1].replace(/\s+/g, '') : ''; };
    // (24/11/2026, 2e retour) La page entière descendait : la page tient désormais dans l'écran,
    // seul le tableau défile.
    V('seul le tableau défile : la page tient dans l\'écran (grille)', d.body.classList.contains('fige')
      && /height:100vh/.test(regle('body.fige')) && /min-height:0/.test(regle('body.fige #main'))
      && /flex:1/.test(regle('body.fige .card.grille')) && /overflow:auto/.test(regle('body.fige #zoneGrille')), regle('body.fige'));
    V('… les en-têtes de jours restent en haut, sur fond opaque', /position:sticky/.test(regle('table.mois thead th')) && /top:0/.test(regle('table.mois thead th')) && /background:var\(--white\)/.test(regle('table.mois thead th')), regle('table.mois thead th'));
    V('… le coin « Médecin » passe au-dessus des jours et des noms', /z-index:3/.test(regle('table.mois thead th.nom')));

    // (11/11/2026) Vue « Gardes jour par jour » : une ligne par jour, réa et mater en clair.
    d.getElementById('vueGardes').click(); await dodo(150);
    const rangs = [...d.querySelectorAll('table.gj tbody tr')];
    const jour = n => rangs[n - 1].querySelectorAll('td');
    V('gardes jour par jour : une ligne par jour (30)', rangs.length === 30, rangs.length);
    V('… défilement normal de la page rendu dans cette vue', !d.body.classList.contains('fige'));
    V('… le bouton est enfoncé, la grille a disparu', d.getElementById('vueGardes').getAttribute('aria-pressed') === 'true' && !d.querySelector('table.mois'));
    V('… le 3 : réa Dr MAR01, pas de garde mater ce jour-là', jour(3)[1].textContent === 'Dr MAR01' && jour(3)[2].textContent === '—', [jour(3)[1].textContent, jour(3)[2].textContent]);
    V('… le samedi 21 : mater Dr MAR02, ligne de week-end', jour(21)[2].textContent === 'Dr MAR02' && rangs[20].classList.contains('we'));
    V('… le samedi 14, changé il y a 2 jours : nom encadré d\'orange', jour(14)[1].querySelector('.nm.mod') && jour(14)[1].textContent === 'Dr MAR01');
    V('… un nom non changé n\'est pas encadré', !jour(3)[1].querySelector('.nm.mod'));
    V('… le 19 est marqué férié', /férié/.test(jour(19)[0].textContent) && jour(19)[0].classList.contains('fe'));
    V('… aucun motif autre que G et G2 dans cette vue (ni V ni TP)', d.querySelectorAll('table.gj .nm:not(.G):not(.G2):not(.aucun)').length === 0);
    V('… sans nouvel appel au serveur', appels.filter(a => a.year === 2026).length === 1);
    V('… l\'adresse garde la vue', /\?m=2026-11&vue=gardes$/.test(w.location.href), w.location.href);
    d.getElementById('btnNext').click(); await dodo(150); d.getElementById('btnPrev').click(); await dodo(150);
    V('… changer de mois garde la vue', d.querySelectorAll('table.gj tbody tr').length === 30);
    d.getElementById('vueGrille').click(); await dodo(150);
    V('retour à la grille du mois', d.querySelectorAll('table.mois tbody tr').length === 4 && !d.querySelector('table.gj') && /\?m=2026-11$/.test(w.location.href));
    V('… la ligne des jours est de nouveau figée', d.body.classList.contains('fige'));
  }
  {
    const { d } = await monter('paie', servir, 'https://planningmedic.github.io/paie.html?m=2026-11&vue=gardes');
    V('un lien ?vue=gardes ouvre directement les gardes jour par jour', d.querySelectorAll('table.gj tbody tr').length === 30);
  }
  console.log('\n═══ P6 bis. Janvier vit dans deux plannings : les 1er, 2 et 3 janvier réapparaissent (12/11/2026) ═══');
  {
    // Le planning « 2026 » finit le dimanche 3 janvier 2027 ; le planning « 2027 » commence le lundi 4.
    const jour = (ds, st) => { const x = new Date(ds + 'T12:00:00'); return { date: ds, isWeekend: x.getDay() === 0 || x.getDay() === 6, isFerie: ds === '2027-01-01' }; };
    const jan = (de, a) => { const o = []; for (let i = de; i <= a; i++) o.push('2027-01-' + String(i).padStart(2, '0')); return o; };
    const mois = (dates, docs) => ({ id: '2027-01', label: 'Janvier 2027', days: dates.map(d => jour(d)),
      doctors: Object.keys(docs).map(id => ({ id, days: dates.map(d => ({ status: docs[id][d] || '' })) })) });
    const plan2026 = { months: [mois(jan(1, 3), {
      MAR01: { '2027-01-01': 'G', '2027-01-02': 'RG', '2027-01-03': 'G' },
      MAR02: { '2027-01-01': 'G2', '2027-01-02': 'RG' },
      MAR05: { '2027-01-02': 'G', '2027-01-03': 'RG' } })] };          // MAR05 quitte le service fin 2026
    const plan2027 = { months: [mois(jan(4, 31), {
      MAR01: { '2027-01-04': 'RG', '2027-01-11': 'V', '2027-01-12': 'V' },
      MAR02: { '2027-01-05': 'G2', '2027-01-06': 'RG' },
      MAR03: { '2027-01-04': 'G' } })] };                              // MAR03 arrive en 2027
    const il_y_a = j => new Date(Date.now() - j * 24 * 3600 * 1000).toISOString();
    const r26 = Object.assign({ success: true }, JSON.parse(JSON.stringify(srv._planningPaie_(plan2026, 2026,
      [{ le: il_y_a(1), titre: 'garde réanimation du dimanche 3 janvier 2027 : Dr MAR05 → Dr MAR01', cellules: [['MAR01', '2027-01-03']] }]))));
    const r27 = Object.assign({ success: true }, JSON.parse(JSON.stringify(srv._planningPaie_(plan2027, 2027,
      [{ le: il_y_a(2), titre: 'vacances ajoutées pour Dr MAR01', cellules: [['MAR01', '2027-01-11', '2027-01-12']] }]))));
    const servirJonction = (c, role) => {
      if (c.action !== 'getPlanningPaie') return { success: false, error: 'Action non autorisée pour ce code' };
      if (c.year === 2026) return Object.assign({}, r26, { role });
      if (c.year === 2027) return Object.assign({}, r27, { role });
      return { success: true, role, annee: c.year, absent: true };
    };
    const { d, appels, erreurs } = await monter('paie', servirJonction, 'https://planningmedic.github.io/paie.html?m=2027-01');
    await dodo(200);
    V('la page s\'ouvre sans erreur JavaScript', erreurs.length === 0, erreurs);
    const tetes = [...d.querySelectorAll('table.mois thead th')];
    V('janvier 2027 affiche ses 31 jours (28 avant : le mois commençait le 4)', tetes.length === 1 + 31 + 5, tetes.length);
    V('…dans l\'ordre, du 1er au 31', tetes.slice(1, 32).map(th => th.textContent.replace(/\D/g, '')).join(',') === jan(1, 31).map(x => String(+x.slice(8))).join(','));
    V('…le 1er janvier est marqué férié', /1$/.test(tetes[1].textContent) && tetes[1].classList.contains('fe'));
    const lignes = [...d.querySelectorAll('table.mois tbody tr')];
    const ligne = nom => lignes.find(tr => tr.querySelector('th').textContent === nom);
    V('les médecins des DEUX plannings sont là : celui qui part fin 2026 et celui qui arrive en 2027', lignes.length === 4 && !!ligne('Dr MAR05') && !!ligne('Dr MAR03'), lignes.map(l => l.querySelector('th').textContent));
    const tot = nom => ligne(nom) ? [...ligne(nom).querySelectorAll('td.tot')].map(t => t.textContent).join('|') : 'absent';
    V('Dr MAR01 : ses 2 gardes des 1er et 3 janvier sont comptées, avec ses 2 jours de vacances', tot('Dr MAR01') === '2||2||', tot('Dr MAR01'));
    V('Dr MAR02 : la garde mater du 1er (planning 2026) et celle du 5 (planning 2027)', tot('Dr MAR02') === '|2|||', tot('Dr MAR02'));
    V('Dr MAR05 : sa garde du samedi 2 janvier apparaît', tot('Dr MAR05') === '1||||', tot('Dr MAR05'));
    V('les changements récents des deux plannings sont encadrés (1 + 2 cases)', d.querySelectorAll('.c.mod').length === 3, d.querySelectorAll('.c.mod').length);
    V('le fil liste les changements des deux plannings', d.querySelectorAll('#fil li').length === 2);
    V('deux appels, pas plus : 2027 puis 2026 (le mois est alors complet)', appels.map(a => a.year).join(',') === '2027,2026', appels.map(a => a.year));
    d.getElementById('vueGardes').click(); await dodo(150);
    const rangs = [...d.querySelectorAll('table.gj tbody tr')];
    const g = n => rangs[n - 1] ? [...rangs[n - 1].querySelectorAll('td')].map(td => td.textContent) : ['', '', ''];
    V('gardes jour par jour : 31 lignes', rangs.length === 31, rangs.length);
    V('…vendredi 1er, férié : réa Dr MAR01, mater Dr MAR02', /férié/.test(g(1)[0]) && g(1)[1] === 'Dr MAR01' && g(1)[2] === 'Dr MAR02', g(1));
    V('…samedi 2 : réa Dr MAR05', g(2)[1] === 'Dr MAR05', g(2));
    V('…dimanche 3 : réa Dr MAR01', g(3)[1] === 'Dr MAR01', g(3));
    V('…lundi 4 (planning 2027) : réa Dr MAR03', g(4)[1] === 'Dr MAR03', g(4));
    V('…sans appel de plus au serveur', appels.length === 2, appels.map(a => a.year));
    // Témoin : décembre 2026, complet dans son année, ne lit pas le planning voisin.
    const t = await monter('paie', (c, role) => c.year === 2026
      ? Object.assign({}, { success: true, role }, JSON.parse(JSON.stringify(srv._planningPaie_({ months: [{ id: '2026-12', label: 'Décembre 2026',
          days: Array.from({ length: 31 }, (_, i) => jour('2026-12-' + String(i + 1).padStart(2, '0'))), doctors: [{ id: 'MAR01', days: [{ status: 'G' }] }] }] }, 2026, []))))
      : { success: true, role, annee: c.year, absent: true }, 'https://planningmedic.github.io/paie.html?m=2026-12');
    await dodo(150);
    V('témoin : un mois complet dans son année reste à un seul appel', t.appels.length === 1 && t.d.querySelectorAll('table.mois thead th').length === 1 + 31 + 5, t.appels.map(a => a.year));
  }
  {
    const { d } = await monter('mar', servir);
    V('un MAR (tuile cachée) a le lien de retour au portail', d.getElementById('lnkBack').style.display !== 'none');
  }
  {
    const { w, d } = await monter('mar', () => ({ success: false, error: 'Accès refusé' }));
    V('MAR sans droit : l\'écran de code revient avec un message clair', d.getElementById('authOverlay').style.display === 'flex' && /ne donne pas accès au planning paie/.test(d.getElementById('authErr').textContent));
    V('… et sa session du portail n\'est PAS effacée', w.sessionStorage.getItem('pmViewCode') === 'CODE1');
  }
  {
    const { w } = await monter('paie', () => ({ success: false, error: 'Code invalide' }));
    V('code refusé : la session est oubliée', !w.sessionStorage.getItem('pmViewCode'));
  }

  console.log('\n═══ P7. La tuile cachée du portail ═══');
  {
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const ligne = (idx.match(/\{ key:'paie'[^\n]*\}/) || [''])[0];
    V('la tuile « paie » existe', !!ligne);
    V('elle est réservée (prive:true) — invisible sans la clé', /prive:true/.test(ligne));
    V('elle ouvre paie.html', /href:'paie\.html'/.test(ligne));
    const icone = (ligne.match(/icon:'([^']+)'/) || [])[1];
    const bundle = fs.readFileSync(path.join(__dirname, '..', 'assets', 'vendor', 'lucide-icons.js'), 'utf8');
    V('son icône existe dans le jeu d\'icônes embarqué', !!icone && bundle.indexOf('"' + icone + '"') > -1, icone);
    const corps = extraireFonction(GARDES, '_act_getPlanningPaie');
    V('le serveur contrôle la MÊME clé que la tuile', /_aDroitTuile_\(user\.id, 'paie'\)/.test(corps));
  }

  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  if (ko) process.exit(1);
})().catch(e => { console.log('  ✗ exception : ' + e.stack); process.exit(1); });
