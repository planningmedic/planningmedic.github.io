/* ═══ BANC — PATIENTS LIB D'UNE CONSULTATION (26/11/2026) ═══
   Le MAR note, pour chacune de ses consultations, ses patients lib (date
   opératoire + nombre, AUCUN NOM). Absent le jour du geste : la page montre
   qui peut voir le patient à sa place, puis il le confie après accord verbal.
   Réservé au droit `patlib` (CONFIG / TUILES_PRIVEES) le temps du test.

   1. Serveur — le VRAI code (indisponibilites.gs, equipe.gs, code.gs) dans un
      classeur simulé : droit, délais médico-légaux, propriété des lignes,
      groupement, aucune poussée vers le relais.
   2. Page — absences.html TELLE QUELLE dans un navigateur simulé. Vue du MAR
      refaite le 28/11/2026 : « À faire », liste compacte, absences, calendrier
      replié, feuille d'une consultation ; « qui appeler » (rattrapage : un
      confrère du groupement présent le jour de MA consultation ET le jour du
      bloc) avec son DECT ; toucher son nom puis confirmer = réglé avec lui,
      vu du seul déclarant ; « Réglé autrement » ; sans droit = rien à saisir.
   3. Accueil — la tuile monte dans Moi avec le droit, et seulement avec lui. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* Dates RELATIVES à aujourd'hui : le code compare au jour réel (lignes passées masquées). */
const plus = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const lundi = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 14); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return iso(d); })();
const CONSULT = plus(lundi, 1);               // mardi
const BLOC_OK = plus(lundi, 3);               // jeudi : 48 h après
const BLOC_ABS = plus(lundi, 8);              // mercredi suivant : le MAR y est absent

/* ══ 1. SERVEUR ══════════════════════════════════════════════════════════ */
function serveur() {
  const cl = new Classeur();
  cl.ajouter('CONFIG', [['PARAMETRE', 'VALEUR'], ['TUILES_PRIVEES', 'ALPHA: consult, patlib; CHARLIE: patlib']]);
  const ent = ['ID', 'NOM', 'INITIALES', 'ACTIF'].concat(Array(13).fill('')).concat(['LIBERAL']);
  const med = (id, actif, lib) => [id, 'Dr ' + id, id.slice(0, 2), actif].concat(Array(13).fill('')).concat([lib]);
  cl.ajouter('MEDECINS', [ent, med('ALPHA', 'O', 'O'), med('BRAVO', 'O', 'O'), med('CHARLIE', 'O', 'O'),
    med('GOLF', 'O', 'N'), med('INDIA', 'N', 'O')]);
  let uuid = 0;
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Set, Math, Error, isNaN, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, flush: () => {} },
    ContentService: { createTextOutput: t => ({ texte: t, setMimeType() { return this; }, getContent() { return this.texte; } }), MimeType: { JSON: 'json' } },
    Utilities: { getUuid: () => 'id-' + (++uuid) },
    _cacheLire_: () => null, _cacheEcrire_: () => {}, _serDate_: x => x, _deserDate_: x => x,
  });
  ctx.globalThis = ctx;
  vm.runInContext('const COL_MED = Object.freeze({ ID:0, NOM:1, INITIALES:2, ACTIF:3 });', ctx);
  for (const [f, n] of [['../gas/code.gs', '_configRows_'], ['../gas/code.gs', '_medecinsRows_'],
    ['../gas/equipe.gs', '_tuilesPriveesDe_'], ['../gas/equipe.gs', '_aDroitTuile_'],
    ['../gas/Indispos.gs', '_deny'], ['../gas/Indispos.gs', '_error'],
    ['../gas/indisponibilites.gs', '_patlibJour_'], ['../gas/indisponibilites.gs', '_patlibFeuille_'],
    ['../gas/indisponibilites.gs', '_patlibLire_'], ['../gas/indisponibilites.gs', '_patlibDelai_'],
    ['../gas/indisponibilites.gs', '_patlibMembre_'], ['../gas/indisponibilites.gs', '_patlibDroit_'], ['../gas/indisponibilites.gs', '_act_patientsLib']]) {
    vm.runInContext(extraireFonction(f, n), ctx);
  }
  const src = lire('gas/indisponibilites.gs');
  for (const c of ['PATLIB_ONGLET', 'PATLIB_ENTETE']) {
    const m = src.match(new RegExp('const ' + c + ' = [^;]+;')); vm.runInContext(m[0], ctx);
  }
  const appel = (id, role, payload, liberal) => JSON.parse(ctx._act_patientsLib({ e: null, payload, action: 'patientsLib', code: 'X', user: { id, role, liberal: !!liberal } }).getContent());
  const feuille = () => cl.getSheetByName('PATIENTS_LIB');
  return { ctx, cl, appel, feuille };
}

console.log('\n═══ 1. Serveur : action patientsLib ═══');
{
  const { ctx, appel, feuille } = serveur();
  const ajout = (o) => Object.assign({ op: 'ajouter', consult: CONSULT, per: 'pm', bloc: BLOC_OK, nb: 2 }, o || {});
  V('un code du comité est refusé (MAR seulement)', appel('ALPHA', 'admin', ajout()).error === 'Accès refusé');
  V('un MAR hors groupement libéral (sans le droit patlib) est refusé', appel('BRAVO', 'mar', ajout()).error === 'Accès refusé');
  V('rien n\'est créé dans le classeur tant que personne n\'a rien noté', feuille() === null);
  V('(27/11/2026) un membre du groupement libéral est admis, sans droit réservé', appel('BRAVO', 'mar', { op: 'reprendre', id: 'inexistant' }, true).error !== 'Accès refusé');
  V('… un code du comité reste refusé, même marqué libéral', appel('ALPHA', 'admin', ajout(), true).error === 'Accès refusé');
  V('getConsultAbsences ouvre aussi les patients lib à tout le groupement', /if \(_patlibDroit_\(user\)\) \{ patlib = true;/.test(lire('gas/indisponibilites.gs')));

  const r1 = appel('ALPHA', 'mar', ajout());
  V('ajouter : accepté, et la réponse est la nouvelle liste', r1.success && r1.patients.length === 1 && r1.patients[0].nb === 2, r1);
  V('l\'onglet PATIENTS_LIB est créé au premier patient, avec son en-tête',
    feuille() && JSON.stringify(feuille().lignes[0]) === JSON.stringify(vm.runInContext('PATLIB_ENTETE', ctx)));
  const l = feuille().lignes[1], j = x => (x instanceof Date ? iso(x) : String(x));   // Sheets transforme « 2026-12-15 » en date : relue en date locale
  V('la ligne : identifiant, MAR connecté, dates, demi-journée, nombre — aucun autre texte',
    l[1] === 'ALPHA' && j(l[2]) === CONSULT && l[3] === 'pm' && j(l[4]) === BLOC_OK && l[5] === 2 && l[6] === '' && l.length === 8, l);
  V('les dates transformées par Sheets sont relues justes', r1.patients[0].consult === CONSULT && r1.patients[0].bloc === BLOC_OK, r1.patients[0]);
  V('le MAR est celui du code, jamais celui envoyé par la page',
    appel('ALPHA', 'mar', ajout({ mar: 'BRAVO' })).success && feuille().lignes[2][1] === 'ALPHA');
  feuille().lignes.splice(2, 1);

  const avant = feuille().lignes.length;
  const refus = [
    ['geste la veille de la consultation (moins de 48 h)', ajout({ bloc: plus(CONSULT, 1) }), /Trop tôt/],
    ['geste un samedi', ajout({ bloc: plus(CONSULT, 4) }), /week-end/],
    ['geste plus d\'un mois après', ajout({ bloc: plus(CONSULT, 36) }), /Trop tard/],
    ['nombre nul', ajout({ nb: 0 }), /Nombre/],
    ['nombre à 10', ajout({ nb: 10 }), /Nombre/],
    ['date illisible', ajout({ bloc: '10/12/2026' }), /illisible/],
  ];
  refus.forEach(([t, p, re]) => { const r = appel('ALPHA', 'mar', p); V('refusé : ' + t, !r.success && re.test(r.error || ''), r); });
  V('… et aucune de ces demandes n\'a écrit quoi que ce soit', feuille().lignes.length === avant);
  V('48 h pile (surlendemain) et un mois pile sont acceptés',
    !ctx._patlibDelai_(CONSULT, plus(CONSULT, 2)) && !ctx._patlibDelai_('2027-01-05', '2027-02-05'));

  const id = r1.patients[0].id;
  V('confier à un MAR hors groupement : refusé', !appel('ALPHA', 'mar', { op: 'confier', id, a: 'GOLF' }).success);
  V('confier à un MAR inactif : refusé', !appel('ALPHA', 'mar', { op: 'confier', id, a: 'INDIA' }).success);
  V('confier à soi-même : refusé', !appel('ALPHA', 'mar', { op: 'confier', id, a: 'ALPHA' }).success);
  const rc = appel('ALPHA', 'mar', { op: 'confier', id, a: 'BRAVO' });
  V('confier à un membre du groupement : accepté', rc.success && rc.patients[0].confieA === 'BRAVO', rc);
  V('(28/11/2026) le confrère nommé ne voit RIEN chez lui : la mention reste à celui qui l\'a notée',
    ctx._patlibLire_('BRAVO').length === 0 && ctx._patlibLire_('ALPHA')[0].confieA === 'BRAVO');
  V('un autre MAR ne voit pas la ligne', ctx._patlibLire_('CHARLIE').length === 0);
  V('un autre MAR (avec le droit) ne peut ni la reprendre ni la supprimer',
    !appel('CHARLIE', 'mar', { op: 'reprendre', id }).success && !appel('CHARLIE', 'mar', { op: 'supprimer', id }).success
    && feuille().lignes.length === 2 && feuille().lignes[1][6] === 'BRAVO');
  const rr = appel('ALPHA', 'mar', { op: 'reprendre', id });
  V('reprendre : la ligne n\'est plus réglée', rr.success && rr.patients[0].confieA === '' && ctx._patlibLire_('BRAVO').length === 0);
  const ra = appel('ALPHA', 'mar', { op: 'confier', id, a: '-' });
  V('(28/11/2026) « réglé autrement » : accepté sans confrère nommé (« - »)', ra.success && ra.patients[0].confieA === '-' && feuille().lignes[1][6] === '-', ra);
  V('… une valeur vide reste refusée', !appel('ALPHA', 'mar', { op: 'confier', id, a: '' }).success && feuille().lignes[1][6] === '-');
  appel('ALPHA', 'mar', { op: 'reprendre', id });
  V('opération inconnue : refusée', !appel('ALPHA', 'mar', { op: 'tout-effacer', id }).success);
  const rs = appel('ALPHA', 'mar', { op: 'supprimer', id });
  V('supprimer : la ligne disparaît', rs.success && rs.patients.length === 0 && feuille().lignes.length === 1);
  V('supprimer une ligne inconnue : refusé', !appel('ALPHA', 'mar', { op: 'supprimer', id: 'nimporte' }).success);

  feuille().lignes.push(['vieux', 'ALPHA', '2020-01-06', 'pm', '2020-01-09', 1, '', '']);
  V('une date opératoire passée n\'est plus servie', ctx._patlibLire_('ALPHA').length === 0);

  const ind = lire('gas/Indispos.gs'), mir = lire('gas/miroir.gs'), ab = lire('gas/indisponibilites.gs');
  V('écriture sous verrou (WRITE_ACTIONS_LOCK)', /WRITE_ACTIONS_LOCK = new Set\(\[[\s\S]*'patientsLib'[\s\S]*?\]\);/.test(ind));
  V('aucune poussée vers le relais : le quota de 1 000 écritures n\'est pas touché',
    !/MIROIR_APRES_ECRITURE = \{[\s\S]*?patientsLib[\s\S]*?\};/.test(mir));
  V('getConsultAbsences ne sert les patients qu\'aux MAR du groupement (ou avec le droit patlib)',
    /if \(_patlibDroit_\(user\)\) \{ patlib = true; patients = _patlibLire_\(user\.id\); \}/.test(ab)
    && /user\.role === 'mar' && \(user\.liberal === true \|\| _aDroitTuile_\(user\.id, 'patlib'\)\)/.test(ab));
}


/* ══ 1 bis. EXPORT CPA ═══════════════════════════════════════════════════ */
console.log('\n═══ 1 bis. Export CPA : lecture du fichier, import, salles ═══');
{
  const { lireExportCpa } = require('../partage/export_cpa.js');
  const TETE = ['SALLE', 'DATE_RDV', 'HEURE_RDV', 'paam.paam_libelle', 'DUREE_PREVUE', '', '', '', '', '', 'DATE_INTERVENTION', '', 'REGIME', '', 'ANESTHESISTE_DEMANDE', '', '', 'TYPE_INTERVENTION'];
  const rdv = (salle, date, h, agenda, bloc, regime, type) => {
    const l = Array(18).fill(''); l[0] = 'CPA Salle ' + salle; l[1] = date + ' 00:00:00.0'; l[2] = h; l[3] = agenda; l[4] = '00:10';
    l[10] = bloc ? bloc + ' 00:00:00.0' : ''; l[12] = regime; l[17] = type || 'Coloscopie'; return l; };
  const lu = lireExportCpa([TETE,
    rdv(2, CONSULT, '14:10', 'CPA Endoscopie Libérale', BLOC_OK, 'Libéral'),
    rdv(2, CONSULT, '14:30', 'CPA Endoscopie Publique', BLOC_ABS, 'Libéral'),              // agenda public, patient lib : gardé
    rdv(4, CONSULT, '14:50', 'CPA Endoscopie Libérale', BLOC_OK, 'Libéral'),
    rdv(1, CONSULT, '09:10', 'CPA ORL/Ophtalmo Adulte Libérale', BLOC_OK, 'Libéral'),
    rdv(3, CONSULT, '15:00', 'CPA Viscérale Publique', BLOC_OK, 'Public   '),   // public : ignoré
    rdv(3, CONSULT, '15:20', 'Consultation UB Pré-anesthésie', BLOC_OK, 'Libéral'),       // agenda sans secteur : salle 3 = viscéral
    rdv(3, CONSULT, '15:40', 'CPA Urologie Libérale', '', 'Libéral'),                       // sans date opératoire
    rdv(1, CONSULT, '15:00', 'CPA Maternité Publique', BLOC_OK, 'Public'),
    rdv(1, CONSULT, '15:10', 'CPA ORL/Ophtalmo Pédiatrie Publique', BLOC_OK, 'Public'),
    rdv(1, CONSULT, '15:20', 'Consultation UB Pré-anesthésie', BLOC_OK, 'Libéral'),       // salle mixte : indécidable
  ]);
  V('lecture : seuls les patients au régime Libéral avec secteur et dates sont gardés', lu.lignes.length === 5 && lu.rdv === 10 && lu.lib === 7, lu);
  V('agenda « UB » sans secteur : secteur repris de la salle cette demi-journée (publics compris)',
    lu.lignes.some(l => l.salle === '3' && l.secteur === 'VIS' && l.per === 'pm') && lu.deduits['Consultation UB Pré-anesthésie'] === 1, lu);
  V('lecture : rien d\'autre que jour, demi-journée, salle, secteur, date opératoire, nombre',
    lu.lignes.every(l => Object.keys(l).sort().join() === 'bloc,consult,nb,per,salle,secteur') && !JSON.stringify(lu.lignes).includes('Coloscopie') && !JSON.stringify(lu.lignes).includes('14:'));
  V('lecture : demi-journée (avant 13 h = matin), salle, secteur', lu.lignes[3].per === 'am' && lu.lignes[3].salle === '1' && lu.lignes[3].secteur === 'ORL' && lu.lignes[0].secteur === 'END' && lu.lignes[0].per === 'pm');
  V('… salle mixte (maternité + ORL) : non devinée, comptée à part ; ligne sans date aussi', lu.inconnus['Consultation UB Pré-anesthésie'] === 1 && lu.sansDate === 1, lu);
  V('Maintenance affiche les secteurs repris de la salle', /Secteur repris de la salle/.test(lire('maintenance.html')));
  V('lecture : un autre fichier est refusé avec un message clair', /Colonnes introuvables/.test(lireExportCpa([['A', 'B']]).erreur || ''));

  // Serveur : le planning publié a, mardi après-midi, ALPHA et CHARLIE en endo (deux salles d'endo), DELTA en ORL le matin
  const { ctx, cl, appel, feuille } = serveur();
  const planning = { months: [{ days: [{ date: CONSULT, dow: 2 }], doctors: [
    { id: 'ALPHA', days: [{ afternoon: 'CS-END' }] }, { id: 'CHARLIE', days: [{ afternoon: 'CS-END' }] },
    { id: 'DELTA', days: [{ morning: 'CS-ORL' }] }, { id: 'BRAVO', days: [{ morning: 'END', afternoon: 'END' }] } ] }] };
  ctx.readPlanningFromDrive = () => JSON.stringify(planning);
  ctx.anneePlanning = d => Number(String(d).slice(0, 4));
  const src = lire('gas/indisponibilites.gs');
  for (const c of ['CPA_ONGLET', 'CPA_ENTETE', 'CPA_SALLES_ONGLET', 'CPA_SALLES_ENTETE', 'CPA_SECTEURS', 'CPA_BLOC']) vm.runInContext(src.match(new RegExp('const ' + c + ' = [^;]+;'))[0], ctx);
  for (const n of ['_cpaSecteur_', '_cpaLire_', '_cpaSallesLire_', '_cpaSalleEcrire_', '_cpaPrise_', '_cpaASalle_', '_cpaAjSalle_', '_cpaConsultsJours_', '_cpaResoudre_', '_cpaLignes_', '_act_importCpa'])
    vm.runInContext(extraireFonction('../gas/indisponibilites.gs', n), ctx);
  vm.runInContext(extraireFonction('../gas/equipe.gs', '_droitMaintenance_'), ctx);
  cl.getSheetByName('CONFIG').lignes[1][1] = 'ALPHA: consult, patlib, maintenance; CHARLIE: patlib';
  const imp = p => JSON.parse(ctx._act_importCpa({ payload: p, user: { id: 'ALPHA', role: 'mar' } }).getContent());
  V('import : refusé à un MAR sans la clé maintenance', JSON.parse(ctx._act_importCpa({ payload: { lignes: lu.lignes }, user: { id: 'CHARLIE', role: 'mar' } }).getContent()).error === 'Accès refusé');
  const r = imp({ lignes: lu.lignes.concat([{ consult: CONSULT, per: 'pm', salle: '9', secteur: 'XYZ', bloc: BLOC_OK, nb: 1 }]) });
  V('import : accepté, une ligne par salle et date opératoire, la ligne douteuse rejetée', r.success && r.lignes === 5 && r.patients === 5 && r.rejetees === 1, r);
  V('import : bilan — endo à confirmer (2 salles, 2 MAR), ORL rattachée seule, le patient « UB » de viscéral sans consultation',
    r.bilan.aConfirmer.patients === 3 && r.bilan.auto.patients === 1 && r.bilan.sans.length === 1 && r.bilan.sans[0].secteur === 'VIS', r.bilan);
  const avant = cl.getSheetByName('CPA_EXPORT').lignes.length;
  imp({ lignes: lu.lignes });
  V('réimporter les mêmes jours remplace, sans doublon', cl.getSheetByName('CPA_EXPORT').lignes.length === avant);

  const exp = ctx._cpaLire_(), cons = ctx._cpaConsultsJours_([CONSULT]);
  let rs = ctx._cpaResoudre_('ALPHA', cons, exp, {});
  V('deux salles d\'endo, deux MAR d\'endo : ALPHA doit choisir entre salle 2 et salle 4',
    rs.aChoisir.length === 1 && JSON.stringify(rs.aChoisir[0].salles) === '["2","4"]' && !Object.keys(rs.salles).length, rs);
  V('DELTA, seul en ORL avec une seule salle : rattaché seul', ctx._cpaResoudre_('DELTA', cons, exp, {}).salles[CONSULT + '|am'] === '1');
  V('choisir une salle non proposée : refusé', !appel('ALPHA', 'mar', { op: 'salle', date: CONSULT, per: 'pm', salle: '3' }).success);
  V('choisir la salle 2 : accepté', appel('ALPHA', 'mar', { op: 'salle', date: CONSULT, per: 'pm', salle: '2' }).success);
  const ch = ctx._cpaSallesLire_();
  rs = ctx._cpaResoudre_('ALPHA', cons, exp, ch);
  V('ALPHA est rattaché à la salle 2', rs.salles[CONSULT + '|pm'] === '2' && !rs.aChoisir.length);
  V('CHARLIE, l\'autre MAR d\'endo, est rattaché seul à la salle 4', ctx._cpaResoudre_('CHARLIE', cons, exp, ch).salles[CONSULT + '|pm'] === '4');
  const lignes = ctx._cpaLignes_('ALPHA', rs.salles, exp);
  V('les patients de la salle 2 deviennent les lignes d\'ALPHA (marquées CPA)', lignes.length === 2 && lignes.every(l => l.cpa && l.mar === 'ALPHA') && lignes.reduce((t, l) => t + l.nb, 0) === 2, lignes);
  const abs = lignes.find(l => l.bloc === BLOC_ABS);
  V('confier une ligne CPA à un membre du groupement', appel('ALPHA', 'mar', { op: 'confier', id: abs.id, a: 'BRAVO' }).success
    && ctx._cpaLignes_('ALPHA', rs.salles, exp).find(l => l.id === abs.id).confieA === 'BRAVO');
  V('(28/11/2026) le confrère nommé ne voit rien chez lui', ctx._patlibLire_('BRAVO').length === 0);
  V('… « réglé autrement » marche aussi sur une ligne CPA', appel('ALPHA', 'mar', { op: 'confier', id: abs.id, a: '-' }).success
    && ctx._cpaLignes_('ALPHA', rs.salles, exp).find(l => l.id === abs.id).confieA === '-');
  V('ALPHA ne la voit pas en double', ctx._patlibLire_('ALPHA').every(p => p.id !== abs.id));
  V('CHARLIE (autre salle) ne peut pas toucher aux lignes de la salle 2', !appel('CHARLIE', 'mar', { op: 'supprimer', id: abs.id }).success);
  V('retirer une ligne CPA la masque', appel('ALPHA', 'mar', { op: 'supprimer', id: abs.id }).success
    && !ctx._cpaLignes_('ALPHA', rs.salles, exp).some(l => l.id === abs.id) && !ctx._patlibLire_('BRAVO').length);
  V('la reprendre la remet', appel('ALPHA', 'mar', { op: 'reprendre', id: abs.id }).success && ctx._cpaLignes_('ALPHA', rs.salles, exp).some(l => l.id === abs.id));
  V('une ligne CPA inventée : refusée', !appel('ALPHA', 'mar', { op: 'confier', id: 'cpa|' + CONSULT + '|pm|2|2099-01-01', a: 'BRAVO' }).success);
  const ind = lire('gas/Indispos.gs');
  V('import sous verrou, réservé au droit maintenance', /'importCpa',/.test(ind) && /"importCpa"\s*:\s*\{ role: 'maintenance'/.test(ind));
  V('aucune poussée vers le relais pour l\'import', !/MIROIR_APRES_ECRITURE = \{[\s\S]*?importCpa[\s\S]*?\};/.test(lire('gas/miroir.gs')));
}

/* ══ 1 ter. CONSULTATION TENUE PAR LE SECTEUR ══════════════════════════ */
console.log('\n═══ 1 ter. Export CPA : consultation tenue par le secteur (sans nom) ═══');
{
  // Mardi après-midi : viscéral tenu par le secteur (note `css` de l'admin) ET par NOVEMBER (nommé) ;
  // ALPHA et CHARLIE sont placés au bloc en viscéral ; BRAVO en endo. Deux salles de viscéral.
  const { ctx, cl, appel } = serveur();
  const MER = plus(lundi, 2);
  const planning = { months: [{ days: [{ date: CONSULT, dow: 2 }, { date: MER, dow: 3 }], doctors: [
      { id: 'ALPHA', days: [{ afternoon: 'VIS' }, { afternoon: 'ORT+MAT' }] }, { id: 'CHARLIE', days: [{ afternoon: 'VIS' }, {}] },
      { id: 'BRAVO', days: [{ afternoon: 'END' }, {}] }, { id: 'NOVEMBER', days: [{ afternoon: 'CS-VIS' }, {}] } ] }],
    notes: { [CONSULT]: { css: { am: [], pm: ['CS-VIS'] } }, [MER]: { css: { am: [], pm: ['CS-ORT'] } } } };
  ctx.readPlanningFromDrive = () => JSON.stringify(planning);
  ctx.anneePlanning = d => Number(String(d).slice(0, 4));
  const src = lire('gas/indisponibilites.gs');
  for (const c of ['CPA_ONGLET', 'CPA_ENTETE', 'CPA_SALLES_ONGLET', 'CPA_SALLES_ENTETE', 'CPA_SECTEURS', 'CPA_BLOC']) vm.runInContext(src.match(new RegExp('const ' + c + ' = [^;]+;'))[0], ctx);
  for (const n of ['_cpaSecteur_', '_cpaLire_', '_cpaSallesLire_', '_cpaSalleEcrire_', '_cpaPrise_', '_cpaASalle_', '_cpaAjSalle_', '_cpaConsultsJours_', '_cpaResoudre_', '_cpaLignes_'])
    vm.runInContext(extraireFonction('../gas/indisponibilites.gs', n), ctx);
  cl.getSheetByName('CONFIG').lignes[1][1] = 'ALPHA: consult, patlib; CHARLIE: patlib; NOVEMBER: patlib';
  cl.getSheetByName('MEDECINS').lignes.push(cl.getSheetByName('MEDECINS').lignes[1].slice()); cl.getSheetByName('MEDECINS').lignes[6][0] = 'NOVEMBER';
  cl.ajouter('CPA_EXPORT', [['DATE_CONSULT', 'PER', 'SALLE', 'SECTEUR', 'DATE_BLOC', 'NB', 'IMPORT'],
    [CONSULT, 'pm', '3', 'VIS', BLOC_OK, 2, ''], [CONSULT, 'pm', '4', 'VIS', BLOC_ABS, 1, ''], [MER, 'pm', '1', 'ORT', plus(MER, 3), 1, '']]);
  const exp = ctx._cpaLire_(), cons = () => ctx._cpaConsultsJours_([CONSULT, MER]);
  const sec = cons().filter(c => c.secteur);
  V('la consultation « tenue par le secteur » du planning publié est lue', sec.length === 2 && sec[0].cs === 'CS-VIS' && sec[0].mar === '', sec);
  V('… avec les MAR placés dans ce secteur du bloc ce jour-là (cases combinées comprises)',
    JSON.stringify(sec[0].membres.slice().sort()) === '["ALPHA","CHARLIE"]' && JSON.stringify(sec[1].membres) === '["ALPHA"]', sec);
  let rN = ctx._cpaResoudre_('NOVEMBER', cons(), exp, {});
  V('le MAR nommé n\'est jamais rattaché d\'office quand le secteur tient aussi la consultation',
    !Object.keys(rN.salles).length && rN.aChoisir.length === 1 && rN.aChoisir[0].aucune === true, rN);
  let rA = ctx._cpaResoudre_('ALPHA', cons(), exp, {});
  V('tant que le MAR nommé n\'a pas choisi, la salle du secteur est en attente',
    rA.secteurs.some(s => s.cs === 'CS-VIS' && s.enAttente && s.nb === 0) && !Object.keys(rA.salles).length, rA);
  V('le secteur seul, une seule salle : ses patients sont annoncés aux MAR du secteur',
    rA.secteurs.some(s => s.cs === 'CS-ORT' && !s.enAttente && s.nb === 1), rA.secteurs);
  V('un MAR hors du secteur ne voit rien', !ctx._cpaResoudre_('BRAVO', cons(), exp, {}).secteurs.length);
  {
    const sans = exp.filter(x => x.secteur !== 'ORT');                 // plus aucun patient lib en ortho le mercredi
    V('consultation du secteur sans patient lib : pas montrée (rien à demander)',
      !ctx._cpaResoudre_('ALPHA', cons(), sans, {}).secteurs.some(s => s.cs === 'CS-ORT'));
    const passes = exp.map(x => x.secteur === 'ORT' ? Object.assign({}, x, { bloc: '2020-01-01' }) : x);
    V('… ni quand ses patients sont déjà opérés', !ctx._cpaResoudre_('ALPHA', cons(), passes, {}).secteurs.some(s => s.cs === 'CS-ORT'));
    const autreSec = exp.filter(x => x.secteur !== 'VIS');
    V('en attente du MAR nommé mais aucun patient lib dans le secteur : pas montrée non plus',
      !ctx._cpaResoudre_('ALPHA', cons(), autreSec, {}).secteurs.some(s => s.cs === 'CS-VIS'));
  }
  V('« Aucune » est accepté pour le MAR nommé quand le secteur est en concurrence',
    appel('NOVEMBER', 'mar', { op: 'salle', date: CONSULT, per: 'pm', salle: '-' }).success);
  rA = ctx._cpaResoudre_('ALPHA', cons(), exp, ctx._cpaSallesLire_());
  V('… alors les deux salles reviennent au secteur', rA.secteurs.some(s => s.cs === 'CS-VIS' && !s.enAttente && s.nb === 3), rA.secteurs);
  cl.getSheetByName('CPA_SALLES').lignes[1][3] = '3';                       // NOVEMBER a finalement la salle 3
  rA = ctx._cpaResoudre_('ALPHA', cons(), exp, ctx._cpaSallesLire_());
  V('le MAR nommé a la salle 3 : la salle 4 revient au secteur', rA.secteurs.some(s => s.cs === 'CS-VIS' && s.nb === 1), rA.secteurs);
  V('un MAR hors du secteur ne peut pas la prendre', !appel('BRAVO', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-VIS', prendre: true }).success);
  V('une consultation qui n\'est pas tenue par le secteur : refusée', !appel('ALPHA', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-END', prendre: true }).success);
  V('ALPHA (dans le secteur) la prend : « c\'est moi »', appel('ALPHA', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-VIS', prendre: true }).success);
  V('CHARLIE ne peut plus la prendre', /déjà pris/.test(appel('CHARLIE', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-VIS', prendre: true }).error || ''));
  const ch = ctx._cpaSallesLire_();
  rA = ctx._cpaResoudre_('ALPHA', cons(), exp, ch);
  V('elle devient celle d\'ALPHA : salle 4 rattachée', rA.salles[CONSULT + '|pm'] === '4' && rA.pris.length === 1 && !rA.secteurs.some(s => s.cs === 'CS-VIS'), rA);
  V('le choix de NOVEMBER n\'est pas écrasé par la prise d\'ALPHA', ch[CONSULT + '|pm|NOVEMBER'] === '3' && ch[CONSULT + '|pm|CS-VIS'] === 'ALPHA', ch);
  V('CHARLIE ne la voit plus', !ctx._cpaResoudre_('CHARLIE', cons(), exp, ch).secteurs.some(s => s.cs === 'CS-VIS'));
  const lg = ctx._cpaLignes_('ALPHA', rA.salles, exp);
  V('les patients de la salle 4 sont les lignes d\'ALPHA', lg.length === 1 && lg[0].bloc === BLOC_ABS && lg[0].mar === 'ALPHA', lg);
  V('ALPHA peut confier une de ces lignes', appel('ALPHA', 'mar', { op: 'confier', id: lg[0].id, a: 'BRAVO' }).success);
  V('CHARLIE ne peut pas la rendre à sa place', !appel('CHARLIE', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-VIS', prendre: false }).success);
  V('« Ce n\'est pas moi » : ALPHA la rend, CHARLIE la revoit', appel('ALPHA', 'mar', { op: 'secteur', date: CONSULT, per: 'pm', cs: 'CS-VIS', prendre: false }).success
    && ctx._cpaResoudre_('CHARLIE', cons(), exp, ctx._cpaSallesLire_()).secteurs.some(s => s.cs === 'CS-VIS'));
  const ab = lire('gas/indisponibilites.gs');
  V('getConsultAbsences ajoute à MES consultations celles du secteur (à valider ou prises)',
    /rs\.pris\.map\(/.test(ab) && /aValider: true/.test(ab) && /_cpaConsultsJours_\(Object\.keys\(jx\)\)/.test(ab));
}

/* ══ 2. PAGE ═════════════════════════════════════════════════════════════ */
function donnees(patlib) {
  return {
    success: true, role: 'mar', moi: 'ALPHA', name: 'Dr Alpha', motifs: true, patlib,
    noms: { ALPHA: 'Dr Alpha', BRAVO: 'Dr Bravo', CHARLIE: 'Dr Charlie', ECHO: 'Dr Echo', GOLF: 'Dr Golf', HOTEL: 'Dr Hotel' },
    groupement: { ALPHA: true, BRAVO: true, CHARLIE: true, ECHO: true, HOTEL: true },
    dects: patlib ? { BRAVO: '81234', CHARLIE: '80001', ECHO: '80002' } : {},      // HOTEL : fiche sans numéro
    marges: {}, margesMois: '',
    consultations: [
      { date: plus(lundi, -1 + 0), per: 'pm', cs: 'CS-END', mar: 'BRAVO' },      // dimanche → remplacé ci-dessous
      { date: CONSULT, per: 'pm', cs: 'CS-END', mar: 'ALPHA' },
      { date: plus(lundi, 2), per: 'pm', cs: 'CS-END', mar: 'ALPHA' },
      { date: plus(lundi, 7), per: 'am', cs: 'CS-END', mar: 'HOTEL' },            // la veille du geste : < 48 h
      { date: plus(lundi, 3), per: 'am', cs: 'CS-VIS', mar: 'GOLF' },             // hors groupement
      { date: plus(lundi, 2), per: 'am', cs: 'CS-VIS', mar: 'ECHO' },             // absent le jour du geste
    ].map(c => c.mar === 'BRAVO' ? Object.assign(c, { date: lundi }) : c),
    absences: { ALPHA: [{ d: BLOC_ABS, c: 'V' }], ECHO: [{ d: BLOC_ABS, c: 'RG' }], CHARLIE: [{ d: CONSULT, c: 'F' }] },
    patients: patlib ? [
      { id: 'p1', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_OK, nb: 1, confieA: '' },
      // Une ligne d'un confrère : le serveur ne la sert plus (28/11/2026) ; si un ancien serveur la sert encore, la page l'ignore.
      { id: 'p2', mar: 'BRAVO', consult: lundi, per: 'pm', bloc: plus(lundi, 4), nb: 1, confieA: 'ALPHA' },
    ] : [],
  };
}
async function page(patlib, modif) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
  const envois = [];
  const d0 = donnees(patlib); if (modif) modif(d0);
  let liste = JSON.parse(JSON.stringify(d0.patients));
  const dom = new JSDOM(lire('absences.html'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    url: 'https://planningmedic.github.io/absences.html',
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.Element.prototype.scrollIntoView = function () {};
      w.sessionStorage.setItem('pmViewCode', 'CODE-ALPHA');
      w.fetch = async (url, o) => {
        const p = JSON.parse(o.body); envois.push(p);
        if (p.action === 'getConsultAbsences') { const d = donnees(patlib); if (modif) modif(d); d.patients = JSON.parse(JSON.stringify(liste)); return { ok: true, status: 200, json: async () => d }; }
        if (p.action === 'patientsLib') {
          if (p.op === 'ajouter') liste.push({ id: 'n' + envois.length, mar: 'ALPHA', consult: p.consult, per: p.per, bloc: p.bloc, nb: p.nb, confieA: '' });
          if (p.op === 'confier') liste.find(x => x.id === p.id).confieA = p.a;
          if (p.op === 'reprendre') liste.find(x => x.id === p.id).confieA = '';
          if (p.op === 'supprimer') liste = liste.filter(x => x.id !== p.id);
          return { ok: true, status: 200, json: async () => ({ success: true, patients: JSON.parse(JSON.stringify(liste.filter(x => !x.cpa))) }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: false }) };
      };
      w.eval(lire('partage/session.js'));
    } });
  await dodo(400);
  const D = dom.window.document;
  const pl = () => envois.filter(e => e.action === 'patientsLib');
  const txt = sel => { const e = D.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ') : ''; };
  const touche = async (sel, k) => { const e = typeof sel === 'string' ? D.querySelectorAll(sel)[k || 0] : sel; if (!e) throw new Error('introuvable : ' + sel); e.click(); await dodo(90); };
  return { w: dom.window, D, envois, erreurs, pl, txt, touche };
}

(async () => {
  console.log('\n═══ 2. Page « Mes consultations » — vue du MAR (refonte du 28/11/2026) ═══');
  {
    const { D, erreurs, txt, pl, touche } = await page(false);
    V('hors groupement : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    V('… titre « Mes consultations », sans le mot « libérales »', txt('#titre') === 'Mes consultations' && !/libérales/.test(txt('#pitch')), txt('#pitch'));
    V('… ses 2 consultations sont listées, sans pastille ni bouton : rien à saisir', D.querySelectorAll('.mc .mc-c').length === 2 && !D.querySelector('button.mc-c') && !D.querySelector('.mc-e'));
    V('… pas de bloc « À faire »', !/À faire/.test(txt('#zone')));
    V('… ses absences et le calendrier replié sont là', /Mes absences sur la période/.test(txt('#zone')) && !!D.querySelector('.mc-calb') && !D.querySelector('.mc-cal'));
    await touche('.mc-calb');
    V('… le calendrier s\'ouvre, ses consultations n\'y sont pas des boutons', !!D.querySelector('.mc-cal') && D.querySelectorAll('span.mc-calp').length === 2 && !D.querySelector('button.mc-calp'));
    V('… aucun envoi vers le serveur', pl().length === 0);
  }
  {
    const { D, envois, erreurs, pl, txt, touche } = await page(true);
    V('membre du groupement : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    V('titre « Mes consultations » et phrase d\'accueil', txt('#titre') === 'Mes consultations' && /consultations libérales des 4 prochaines semaines/.test(txt('#pitch')));
    V('l\'ancienne page à deux colonnes n\'est plus servie au MAR', !D.getElementById('file') && !D.getElementById('panel') && !D.querySelector('.puce'));
    V('« À faire » : rien à faire (son patient est opéré un jour où il est là)', /À faire/.test(txt('.mc-k')) && /Rien à faire/.test(txt('.mc-rien')) && !D.querySelector('.mc-af'));
    const lignes = () => [...D.querySelectorAll('button.mc-c')].map(x => x.textContent.replace(/\s+/g, ' '));
    V('la liste : une ligne par consultation (2), les miennes seulement', lignes().length === 2 && lignes().every(t => /Endoscopie/.test(t)), lignes());
    V('… état de la première : « ✓ tout va bien », 1 patient lib', /après-midi · 1 patient lib/.test(lignes()[0]) && /✓ tout va bien/.test(lignes()[0]), lignes()[0]);
    V('… état de la seconde : « ＋ Ajouter », aucun patient lib noté', /aucun patient lib noté/.test(lignes()[1]) && /＋ Ajouter/.test(lignes()[1]), lignes()[1]);
    V('plus de bloc « patients que des confrères vous ont confiés » (la ligne d\'un confrère est ignorée)', !/confiés/.test(txt('#zone')) && !/Dr Bravo/.test(txt('#zone')));
    V('mes absences : une étiquette avec son motif', D.querySelectorAll('.mc-abs span').length === 1 && /Vacances/.test(txt('.mc-abs')), txt('.mc-abs'));

    V('le calendrier est replié à l\'ouverture', !!D.querySelector('.mc-calb') && !D.querySelector('.mc-cal') && D.querySelector('.mc-calb').getAttribute('aria-expanded') === 'false');
    await touche('.mc-calb');
    V('« Voir le calendrier » l\'ouvre : semaines du lundi au vendredi, mes 2 consultations en bleu, mon absence en gris',
      D.querySelectorAll('.mc-calr').length >= 4 && D.querySelectorAll('.mc-calc').length % 5 === 0 && D.querySelectorAll('button.mc-calp').length === 2 && D.querySelectorAll('.mc-calc.off').length === 1,
      [D.querySelectorAll('.mc-calr').length, D.querySelectorAll('.mc-calp').length, D.querySelectorAll('.mc-calc.off').length]);
    await touche('button.mc-calp');
    V('toucher une consultation du calendrier ouvre sa feuille', D.getElementById('mcFeuille').classList.contains('open') && /après-midi/.test(txt('#mcTitre')));
    await touche('.mc-x');
    V('la croix referme la feuille ; le calendrier reste ouvert', !D.getElementById('mcFeuille').classList.contains('open') && !!D.querySelector('.mc-cal'));
    await touche('.mc-calb');
    V('un second toucher replie le calendrier', !D.querySelector('.mc-cal'));

    await touche('button.mc-c');
    V('toucher une ligne ouvre la feuille de la consultation', D.getElementById('mcFeuille').classList.contains('open') && /Endoscopie · 1 patient lib/.test(txt('#mcCtx')), txt('#mcCtx'));
    V('patient opéré un jour où je suis là : « vous êtes là », ✓', /vous êtes là/.test(txt('#mcCorps .mc-pl')) && !!D.querySelector('#mcCorps .mc-ok2'));
    V('« Aucun nom de patient n\'est enregistré » est rappelé', /Aucun nom de patient/.test(txt('#mcCorps')));
    V('le formulaire d\'ajout est replié derrière « ＋ Ajouter un patient lib »', !D.getElementById('mcDate') && /Ajouter un patient lib/.test(txt('.mc-aj')));
    await touche('.mc-aj');
    const date = () => D.getElementById('mcDate');
    V('le calendrier de saisie est borné : 48 h après la consultation au plus tôt', date() && date().min === plus(CONSULT, 2), date() && date().min);
    await touche('[data-g="ajouter"]');
    V('sans date : « Choisissez la date opératoire »', /Choisissez la date/.test(txt('#mcErr')));
    date().value = plus(CONSULT, 1); await touche('[data-g="ajouter"]');
    V('date trop tôt : message clair, rien n\'est envoyé', /Trop tôt/.test(txt('#mcErr')) && pl().length === 0, txt('#mcErr'));
    date().value = plus(CONSULT, 4); await touche('[data-g="ajouter"]');
    V('samedi : refusé', /week-end/.test(txt('#mcErr')) && pl().length === 0);

    date().value = BLOC_ABS; await touche('[data-g="nb"][data-v="1"]'); await touche('[data-g="ajouter"]');
    const env = pl().pop();
    V('ajout envoyé : consultation, demi-journée, date opératoire, nombre — rien d\'autre',
      env && env.op === 'ajouter' && env.consult === CONSULT && env.per === 'pm' && env.bloc === BLOC_ABS && env.nb === 2
      && Object.keys(env).sort().join() === 'action,bloc,code,consult,nb,op,per', env);
    const idN = 'n' + envois.length;
    V('absent ce jour-là : la ligne passe en orange, « vous serez en vacances », avec « Qui appeler, dans l\'ordre »',
      /vous serez en vacances/.test(txt('#mcCorps .mc-pl.amb')) && /Qui appeler, dans l'ordre/.test(txt('#mcCorps .mc-pl.amb')), txt('#mcCorps .mc-pl.amb').slice(0, 200));
    V('« À faire » l\'annonce en tête de page : 2 patients, le jour, le motif, la consultation d\'origine',
      /À faire 1/.test(txt('.mc-k')) && /2 patients opérés le .* : vous serez en vacances/.test(txt('.mc-af.amb .t')) && /Vus à votre consultation du .* après-midi · Endoscopie/.test(txt('.mc-af.amb .sd')), txt('.mc-af.amb').slice(0, 200));
    V('la ligne de la liste passe à « 2 à régler »', /2 à régler/.test(lignes()[0]), lignes()[0]);
    const noms = () => [...D.querySelectorAll('.mc-af.amb .mc-nom span')].map(x => x.textContent);
    V('un confrère présent les deux jours est proposé', noms().includes('Dr Bravo'), noms());
    V('… même s\'il n\'a aucune consultation avant le geste (rattrapage : il prend MA consultation)', noms().includes('Dr Hotel'));
    V('absent le jour de MA consultation : pas proposé', !noms().includes('Dr Charlie'));
    V('absent le jour du bloc : pas proposé', !noms().includes('Dr Echo'));
    V('le MAR hors groupement n\'est pas proposé', !noms().includes('Dr Golf'));
    V('moi-même : pas proposé', !noms().includes('Dr Alpha'));
    const dects = [...D.querySelectorAll('.mc-af.amb .mc-dect')];
    const dB = dects.find(x => /8 1234/.test(x.textContent));
    V('le DECT de chaque confrère : « 81234 » du classeur affiché « 8 1234 »', !!dB && dB.textContent === '☎ 8 1234', dects.map(x => x.textContent));
    V('(28/11/2026) … simple étiquette à lire, PAS un lien d\'appel : un DECT ne se joint que depuis un téléphone de l\'hôpital', dB && dB.tagName === 'SPAN' && !D.querySelector('a[href^="tel:"]'));
    V('… une fiche sans numéro : « DECT — », sans lien', dects.some(x => x.textContent === 'DECT —' && x.tagName === 'SPAN'));
    V('… seuls les DECT des confrères proposés sont à l\'écran', !/8 0001|8 0002/.test(txt('#zone')));
    V('aucun bouton « Confier », la marche à suivre est écrite (appeler, toucher son nom, prévenir le secrétariat)',
      !/Confier/.test(D.body.textContent) && /Appelez-le sur son DECT/.test(txt('.mc-af.amb .mc-note')) && /secrétariat des consultations/.test(txt('.mc-af.amb .mc-note')));

    // Toucher un nom : une question, rien n'est enregistré avant « Oui » (décision du responsable : éviter le faux toucher)
    const avant = pl().length;
    const nomB = () => [...D.querySelectorAll('.mc-af.amb .mc-nom')].find(x => /Dr Bravo/.test(x.textContent));
    await touche(nomB());
    V('toucher le nom du confrère : la question « Le Dr Bravo a accepté ? » s\'ouvre sous son nom', /Le Dr Bravo a accepté \?/.test(txt('.mc-af.amb .mc-conf')) && D.querySelectorAll('.mc-af.amb .mc-conf').length === 1);
    V('… et RIEN n\'est envoyé tant qu\'on n\'a pas confirmé', pl().length === avant && /À faire 1/.test(txt('.mc-k')));
    await touche('.mc-af.amb [data-g="non"]');
    V('« Non » referme la question, sans rien envoyer', !D.querySelector('.mc-conf') && pl().length === avant);
    await touche(nomB()); await touche(nomB());
    V('un second toucher sur le nom la referme aussi', !D.querySelector('.mc-conf') && pl().length === avant);
    await touche(nomB()); await touche('.mc-af.amb [data-g="oui"]');
    const eo = pl().pop();
    V('« Oui » : la mention part au serveur (la ligne, le confrère)', pl().length === avant + 1 && eo.op === 'confier' && eo.id === idN && eo.a === 'BRAVO', eo);
    V('la carte quitte « À faire »', !D.querySelector('.mc-af') && /Rien à faire/.test(txt('.mc-rien')));
    V('dans la feuille, la ligne reste affichée, en vert : « ✓ Réglé avec le Dr Bravo »', /✓ Réglé avec le Dr Bravo/.test(txt('#mcCorps .mc-pl.vert .mc-avec')), txt('#mcCorps .mc-pl.vert'));
    V('la liste repasse à « ✓ tout va bien »', /✓ tout va bien/.test(lignes()[0]));
    V('un message confirme, avec « Annuler »', D.getElementById('mcToast').classList.contains('open') && /réglé avec le Dr Bravo/.test(txt('#mcToastTxt')) && D.getElementById('mcToastBtn').style.display !== 'none');
    await touche('#mcToastBtn');
    V('« Annuler » défait : la ligne n\'est plus réglée', pl().pop().op === 'reprendre' && pl().pop().id === idN && !!D.querySelector('.mc-af.amb') && !D.querySelector('#mcCorps .mc-pl.vert'));

    await touche('.mc-af.amb [data-g="regle"]');
    const er = pl().pop();
    V('« Réglé autrement » : enregistré du premier coup, sans confrère nommé', er.op === 'confier' && er.id === idN && er.a === '-', er);
    V('… la ligne est verte « ✓ Réglé », sans nom', txt('#mcCorps .mc-pl.vert .mc-avec') === '✓ Réglé' && !D.querySelector('.mc-af'), txt('#mcCorps .mc-pl.vert .mc-avec'));
    await touche('#mcCorps [data-g="deregle"]');
    V('« Ce n\'est plus réglé » : la ligne redevient à régler', pl().pop().op === 'reprendre' && !!D.querySelector('#mcCorps .mc-pl.amb') && /À faire 1/.test(txt('.mc-k')));
    V('dans la feuille aussi, on peut toucher le nom du confrère', !!D.querySelector('#mcCorps .mc-pl.amb .mc-nom') && !!D.querySelector('#mcCorps .mc-pl.amb [data-g="regle"]'));

    await touche('#mcCorps .mc-pl.amb .mc-sup');
    V('la croix supprime la ligne, avec « Annuler » proposé', pl().pop().op === 'supprimer' && /Ligne supprimée/.test(txt('#mcCorps .mc-undo')) && !D.querySelector('.mc-af'));
    await touche('#mcCorps [data-g="restaurer"]');
    const ea = pl().pop();
    V('« Annuler » la remet (même date, même nombre)', ea.op === 'ajouter' && ea.bloc === BLOC_ABS && ea.nb === 2 && !!D.querySelector('.mc-af.amb'), ea);
    D.dispatchEvent(new (D.defaultView.KeyboardEvent)('keydown', { key: 'Escape', bubbles: true })); await dodo(30);
    V('Échap referme la feuille', !D.getElementById('mcFeuille').classList.contains('open'));
    V('aucune erreur pendant tous ces gestes', !erreurs.length, erreurs);
  }
  {
    // Supprimer une ligne réglée puis annuler : elle revient RÉGLÉE
    const { D, pl, txt, touche } = await page(true, d => { d.patients.push({ id: 'p7', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: 'HOTEL' }); });
    V('une ligne déjà réglée à l\'ouverture : rien dans « À faire »', !D.querySelector('.mc-af') && /Rien à faire/.test(txt('.mc-rien')));
    await touche('button.mc-c');
    V('… affichée en vert avec le nom du confrère', /✓ Réglé avec le Dr Hotel/.test(txt('#mcCorps .mc-pl.vert')));
    await touche('#mcCorps .mc-pl.vert .mc-sup'); await touche('#mcCorps [data-g="restaurer"]');
    const fin = pl().slice(-2);
    V('supprimée puis annulée : elle revient, et réglée avec le même confrère', fin[0].op === 'ajouter' && fin[1].op === 'confier' && fin[1].a === 'HOTEL' && /✓ Réglé avec le Dr Hotel/.test(txt('#mcCorps .mc-pl.vert')), fin);
  }
  {
    // Personne de disponible ; et un confrère déjà en consultation à la même heure
    const { D, txt } = await page(true, d => {
      d.patients.push({ id: 'p8', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: '' });
      d.absences.BRAVO = [{ d: BLOC_ABS, c: 'V' }]; d.absences.HOTEL = [{ d: CONSULT, c: 'V' }]; });
    V('aucun confrère présent les deux jours : la carte le dit et renvoie au comité', /Aucun confrère du groupement n'est présent ces deux jours-là\. À voir avec le comité/.test(txt('.mc-af.amb .mc-qui')));
    V('… « Réglé autrement » reste proposé, aucun nom à toucher', !!D.querySelector('.mc-af.amb [data-g="regle"]') && !D.querySelector('.mc-af.amb .mc-nom'));
    const o = await page(true, d => {
      d.patients.push({ id: 'p8', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: '' });
      d.consultations.push({ date: CONSULT, per: 'pm', cs: 'CS-VIS', mar: 'BRAVO' }); });
    const b = [...o.D.querySelectorAll('.mc-af.amb .mc-nom')].find(x => /Dr Bravo/.test(x.textContent));
    V('un confrère déjà en consultation à la même heure : proposé, mais signalé', b && /déjà en consultation \(Viscéral\) cet après-midi-là/.test(b.textContent), b && b.textContent);
  }
  {
    const { D, envois, erreurs, pl, txt, touche } = await page(true, d => { d.aChoisir = [{ date: plus(lundi, 2), per: 'pm', salles: ['2', '4'] }]; d.salles = { [CONSULT + '|pm']: '2' }; });
    V('export CPA : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    const lignes = [...D.querySelectorAll('button.mc-c')].map(x => x.textContent.replace(/\s+/g, ' '));
    V('la consultation rattachée affiche sa salle', /après-midi · salle 2 ·/.test(lignes[0]), lignes[0]);
    V('l\'autre consultation est marquée « salle ? »', /salle \?/.test(lignes[1]), lignes[1]);
    const carte = D.querySelector('.mc-af.ind');
    V('« À faire » demande « dans quelle salle serez-vous ? » : Salle 2 ou Salle 4, sans « Aucune »',
      carte && /dans quelle salle serez-vous \?/.test(carte.textContent) && [...carte.querySelectorAll('[data-g="salle"]')].map(b => b.textContent).join() === 'Salle 2,Salle 4', carte && carte.textContent);
    await touche(carte.querySelectorAll('[data-g="salle"]')[1]);
    const sal = pl().pop();
    V('le choix part au serveur (jour, demi-journée, salle)', sal && sal.op === 'salle' && sal.date === plus(lundi, 2) && sal.per === 'pm' && sal.salle === '4', sal);
    V('… puis la page relit tout (les patients de la salle arrivent)', envois[envois.length - 1].action === 'getConsultAbsences');
    V('… un message le confirme, et la feuille ne s\'ouvre pas', /Salle 4/.test(txt('#mcToastTxt')) && !D.getElementById('mcFeuille').classList.contains('open'), txt('#mcToastTxt'));
  }
  {
    // (27/11/2026) Classement des confrères par rang (la plus serrée des marges CCAM/NGAP), SANS montant
    const { D, erreurs, txt } = await page(true, d => {
      d.patients.push({ id: 'p9', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: '' });
      d.rangsMarge = { HOTEL: 1, BRAVO: 2 }; d.margesMois = '2026-10'; });
    V('rangs : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    const ps = [...D.querySelectorAll('.mc-af.amb .mc-qui .p')].map(x => x.textContent);
    V('« dans l\'ordre » : classés selon le rang envoyé par le serveur, numérotés 1, 2', ps.length === 2 && /^1Dr Hotel/.test(ps[0]) && /^2Dr Bravo/.test(ps[1]), ps);
    V('aucun montant à l\'écran (ni €, ni CCAM/NGAP chiffrés)', !/€|CCAM|NGAP/.test(txt('#zone')), txt('.mc-af.amb'));
    const src = lire('gas/indisponibilites.gs');
    V('serveur : la réponse ne contient plus les marges, seulement le rang (plus serrée des deux)',
      /rangsMarge: rangsMarge/.test(src) && !/\n\s+marges: marges,/.test(src) && !/margesNgap: margesNgap/.test(src)
      && /Math\.min\.apply\(null, v\)/.test(src) && /if \(!user\.liberal\) \{ marges = \{\}; margesNgap = \{\};/.test(src));
    V('(28/11/2026) serveur : les DECT ne sont servis qu\'avec les patients lib, pour les membres du groupement, depuis la colonne DECT',
      /const dects = \{\};\s*if \(patlib\) \{/.test(src) && /medD\[r\]\[COL_MED\.DECT\]/.test(src) && /groupement\[idD\] && noms\[idD\]\) dects\[idD\] = d;/.test(src) && /dects: dects,/.test(src));
    V('(28/11/2026) serveur : une ligne n\'est lue que par celui qui l\'a notée', /if \(mar !== id\) return;/.test(src) && !/confie !== id/.test(src));
  }
  {
    // (28/11/2026, décision du responsable) Le MAR du secteur d'abord, indépendamment du libéral
    const base = d => { d.patients.push({ id: 'p9', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: '' });
      d.noms.KILO = 'Dr Kilo'; d.groupement.KILO = true; d.rangsMarge = { HOTEL: 1, BRAVO: 2, KILO: 3 }; };
    const ordre = async pl => { const { D, erreurs } = await page(true, d => { base(d); d.placements = pl; });
      return { e: erreurs, L: [...D.querySelectorAll('.mc-af.amb .mc-qui .p')].map(x => x.textContent) }; };
    let r = await ordre({});
    V('secteur : sans placement connu (planning pas encore posé), l\'ordre habituel et aucune mention', !r.e.length && /^1Dr Hotel/.test(r.L[0]) && /^2Dr Bravo/.test(r.L[1]) && /^3Dr Kilo/.test(r.L[2]) && !/Endoscopie/.test(r.L.join()), r);
    r = await ordre({ [BLOC_ABS]: { KILO: { am: ['END'] } } });
    V('secteur : le confrère placé dans le secteur le jour de l\'intervention passe en tête, malgré son rang 3', /^1Dr Kilo/.test(r.L[0]) && /Endoscopie le jour de l'intervention/.test(r.L[0]) && /^2Dr Hotel/.test(r.L[1]) && /^3Dr Bravo/.test(r.L[2]), r.L);
    r = await ordre({ [BLOC_ABS]: { KILO: { am: ['END'] }, BRAVO: { pm: ['VIS+END'.split('+')[1]] } }, [CONSULT]: { BRAVO: { pm: ['END'] } } });
    V('secteur : celui qui y est les deux jours passe devant celui du seul jour de l\'intervention', /^1Dr Bravo/.test(r.L[0]) && /Endoscopie les deux jours/.test(r.L[0]) && /^2Dr Kilo/.test(r.L[1]) && /^3Dr Hotel/.test(r.L[2]) && !/Endoscopie/.test(r.L[2]), r.L);
    r = await ordre({ [CONSULT]: { KILO: { pm: ['END'] } }, [BLOC_ABS]: { HOTEL: { am: ['VIS'] }, BRAVO: { am: ['END'] } } });
    V('secteur : dans le secteur le seul jour de la consultation, ou dans un AUTRE secteur le jour de l\'intervention : pas de priorité', /^1Dr Bravo/.test(r.L[0]) && /^2Dr Hotel/.test(r.L[1]) && /^3Dr Kilo/.test(r.L[2]) && !/Endoscopie|Viscéral/.test(r.L[1] + r.L[2]), r.L);
    r = await ordre({ [CONSULT]: { KILO: { am: ['END'] } }, [BLOC_ABS]: { KILO: { pm: ['END'] } } });
    V('secteur : le jour de la consultation, c\'est la demi-journée de la consultation qui compte (matin ≠ après-midi)', /^1Dr Kilo/.test(r.L[0]) && /le jour de l'intervention/.test(r.L[0]) && !/les deux jours/.test(r.L[0]), r.L);
    V('… toujours aucun montant à l\'écran', !/€|CCAM|NGAP/.test(r.L.join()));

    // Serveur : _cpaPlacements_ lit le planning publié
    const { ctx } = serveur();
    const planning = { months: [{ days: [{ date: CONSULT, dow: 2 }, { date: BLOC_ABS, dow: 3 }], doctors: [
      { id: 'BRAVO', days: [{ morning: 'CS-END', afternoon: 'END' }, { morning: 'VIS+MAT', afternoon: '' }] },
      { id: 'CHARLIE', days: [{ morning: 'V', afternoon: 'V' }, { morning: 'END', afternoon: 'END' }] },
      { id: 'GOLF', days: [{ morning: 'END' }, { morning: 'END' }] } ] }] };
    ctx.readPlanningFromDrive = () => JSON.stringify(planning);
    ctx.anneePlanning = d => Number(String(d).slice(0, 4));
    const src = lire('gas/indisponibilites.gs');
    vm.runInContext(src.match(/const CPA_BLOC = [^;]+;/)[0], ctx);
    vm.runInContext(extraireFonction('../gas/indisponibilites.gs', '_cpaPlacements_'), ctx);
    const pl = ctx._cpaPlacements_([CONSULT, BLOC_ABS], { BRAVO: true, CHARLIE: true });
    V('serveur : placements lus dans le planning publié, par demi-journée, cases combinées comprises',
      JSON.stringify(pl[CONSULT]) === '{"BRAVO":{"pm":["END"]}}' && JSON.stringify(pl[BLOC_ABS].BRAVO) === '{"am":["VIS","MAT"]}' && JSON.stringify(pl[BLOC_ABS].CHARLIE) === '{"am":["END"],"pm":["END"]}', pl);
    V('serveur : … seulement les secteurs du bloc (ni consultation, ni absence), seulement les confrères demandés', !pl[CONSULT].CHARLIE && !pl[CONSULT].GOLF && !pl[BLOC_ABS].GOLF && !/CS-|"V"/.test(JSON.stringify(pl)));
    V('serveur : un jour hors de la demande n\'est pas servi ; planning absent : rien, sans erreur', !ctx._cpaPlacements_([BLOC_ABS], null)[CONSULT]
      && (ctx.readPlanningFromDrive = () => null, JSON.stringify(ctx._cpaPlacements_([CONSULT], null)) === '{}'));
    V('serveur : servis avec les patients lib seulement, pour les confrères du groupement, jamais bloquant',
      /let placements = \{\};\s*if \(patlib\) \{/.test(src) && /if \(noms\[g\] && g !== user\.id\) garder\[g\] = true;/.test(src) && /catch \(e\) \{ placements = \{\}; \}/.test(src) && /placements: placements,/.test(src));
  }
  {
    // La vue du secrétariat ne change pas : deux colonnes, panneau « qui peut prendre le patient » ouvrable
    const sec = await page(true, d => { (d.consultations || []).forEach(c => { d.absences[c.mar] = [{ d: BLOC_ABS, c: 'V' }]; }); d.role = 'secretariat'; d.motifs = false; d.patlib = false; d.moi = null; d.dects = {}; });
    const zs = sec.D.getElementById('pAnswer');
    V('secrétariat : la page s\'ouvre sans erreur, sur l\'ancienne présentation', !sec.erreurs.length && sec.txt('#titre') === 'Consultations à venir' && sec.D.querySelectorAll('#file .slot').length === 6 && !sec.D.querySelector('.mc'), sec.erreurs);
    V('secrétariat : le panneau reste ouvrable (orientation d\'emblée)', zs && !!zs.querySelector('button.d') && /Cliquez une période/.test(zs.textContent),
      zs && zs.innerHTML.slice(0, 200));
    zs.querySelector('button.d').click(); await dodo(40);
    V('secrétariat : … et s\'ouvre sans erreur ; aucun DECT, aucun geste du MAR', !sec.erreurs.length && !sec.D.querySelector('.mc-dect') && !sec.D.querySelector('[data-g="ouvrir"]') && sec.pl().length === 0, sec.erreurs);
  }
  {
    // Défaut vu en production (26/11/2026) : supprimer une ligne saisie à la main faisait disparaître les lignes CPA
    const { D, envois, erreurs, txt, touche } = await page(true, d => { d.patients.push({ id: 'cpa|' + CONSULT + '|pm|2|' + BLOC_ABS, mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 3, confieA: '', cpa: true }); });
    V('lignes CPA + saisie : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    await touche('button.mc-c');
    V('les deux lignes sont là (saisie et CPA, marquée « CPA »)', D.querySelectorAll('#mcCorps .mc-pl').length === 2 && D.querySelectorAll('#mcCorps .mc-tag').length === 1);
    await touche('#mcCorps .mc-pl:not(.amb) .mc-sup');
    V('supprimer la ligne saisie : la page relit tout (sinon les lignes CPA disparaissent)', envois[envois.length - 1].action === 'getConsultAbsences');
    V('… et la ligne CPA est toujours affichée', D.querySelectorAll('#mcCorps .mc-pl').length === 1 && /CPA/.test(txt('#mcCorps .mc-pl')), txt('#mcCorps').slice(0, 200));
    await touche('#mcCorps .mc-pl.amb [data-g="regle"]');
    V('régler une ligne CPA : envoyé, puis la page relit tout', envois[envois.length - 2].op === 'confier' && envois[envois.length - 2].a === '-' && envois[envois.length - 1].action === 'getConsultAbsences'
      && /✓ Réglé/.test(txt('#mcCorps .mc-pl.vert')), envois.slice(-2));
  }
  {
    const SEC = plus(lundi, 4);
    const { D, envois, erreurs, pl, txt, touche } = await page(true, d => {
      d.consultations.push({ date: SEC, per: 'pm', cs: 'CS-VIS', mar: 'ALPHA', secteur: true, aValider: true, nbSecteur: 3 });
      d.aChoisir = [{ date: plus(lundi, 2), per: 'pm', salles: ['3'], aucune: true }]; });
    V('secteur : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    const cartes = [...D.querySelectorAll('.mc-af.ind')];
    const ps = cartes.find(x => /est-ce vous qui faites cette consultation/.test(x.textContent));
    V('« À faire » demande « est-ce vous qui faites cette consultation ? » et annonce ses patients',
      !!ps && /Viscéral · posée au nom du secteur · 3 patients lib/.test(ps.textContent) && /Oui, c'est moi/.test(ps.textContent), cartes.map(x => x.textContent));
    const li = [...D.querySelectorAll('button.mc-c')].find(x => /Viscéral/.test(x.textContent));
    V('elle apparaît dans MES consultations, « du secteur », « à confirmer »', li && /du secteur/.test(li.textContent) && /à confirmer/.test(li.textContent), li && li.textContent);
    await touche(li);
    V('sa feuille ne propose que la question : pas de saisie tant qu\'elle n\'est pas prise', /Est-ce vous qui faites cette consultation/.test(txt('#mcCorps')) && !D.querySelector('#mcCorps .mc-aj') && !D.getElementById('mcDate'));
    await touche('.mc-x');
    const ch = cartes.find(x => /dans quelle salle/.test(x.textContent));
    V('quand le secteur est en concurrence, le choix de salle propose « Aucune »', ch && [...ch.querySelectorAll('[data-g="salle"]')].some(b => b.textContent === 'Aucune' && b.dataset.v === '-'));
    V('« À faire » compte les 2 questions', /À faire 2/.test(txt('.mc-k')));
    await touche(ps.querySelector('[data-g="moi"]'));
    const e = pl().pop();
    V('« Oui, c\'est moi » part au serveur (jour, demi-journée, consultation)', e && e.op === 'secteur' && e.date === SEC && e.per === 'pm' && e.cs === 'CS-VIS' && e.prendre === true, e);
    V('… puis la page relit tout', envois[envois.length - 1].action === 'getConsultAbsences');
  }
  {
    // Consultation du secteur déjà prise : « Ce n'est pas moi » la rend
    const SEC = plus(lundi, 4);
    const { D, pl, txt, touche } = await page(true, d => { d.consultations.push({ date: SEC, per: 'pm', cs: 'CS-VIS', mar: 'ALPHA', secteur: true }); });
    await touche([...D.querySelectorAll('button.mc-c')].find(x => /Viscéral/.test(x.textContent)));
    V('consultation du secteur prise par moi : la feuille le rappelle', /Consultation du secteur, prise par vous/.test(txt('#mcCorps .mc-info')));
    await touche('#mcCorps [data-g="pasmoi"]');
    const e = pl().pop();
    V('« Ce n\'est pas moi » la rend (prendre = false) et referme la feuille', e && e.op === 'secteur' && e.prendre === false && !D.getElementById('mcFeuille').classList.contains('open'), e);
  }
  {
    // Refus du serveur : le message s'affiche, rien ne change à l'écran
    const { w, D, txt, touche } = await page(true, d => { d.patients.push({ id: 'p8', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 1, confieA: '' }); });
    const f = w.fetch; w.fetch = async (u, o) => (JSON.parse(o.body).action === 'patientsLib' ? { ok: true, status: 200, json: async () => ({ success: false, error: 'Ce confrère ne fait pas partie du groupement libéral.' }) } : f(u, o));
    await touche('.mc-af.amb .mc-nom'); await touche('.mc-af.amb [data-g="oui"]');
    V('refus du serveur : le message est affiché, la carte reste dans « À faire »', /ne fait pas partie du groupement/.test(txt('#mcToastTxt')) && !!D.querySelector('.mc-af.amb') && !D.querySelector('.mc-conf'), txt('#mcToastTxt'));
    V('… et les boutons sont de nouveau utilisables', !D.body.classList.contains('mc-occupe'));
  }
  {
    const m = lire('maintenance.html');
    V('Maintenance : la carte d\'import existe', /id="cCpa"/.test(m) && /id="cpaFichier"/.test(m));
    V('Maintenance : le lecteur de tableur n\'est chargé qu\'au moment de l\'import', /assets\/vendor\/xlsx\.full\.min\.js/.test(m) && !/<script src="assets\/vendor\/xlsx/.test(m)
      && fs.existsSync(path.join(__dirname, '..', 'assets/vendor/xlsx.full.min.js')));
    V('Maintenance : seul ce que rend lireExportCpa part au serveur', /api\(\{ action: 'importCpa', lignes: lu\.lignes \}\)/.test(m));
  }

  console.log('\n═══ 3. Accueil : la tuile « Mes consultations » ═══');
  for (const [liberal, attendu] of [[false, null], [true, 'moi']]) {
    const vc = new VirtualConsole();
    const dom = new JSDOM(lire('index.html'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: 'https://planningmedic.github.io/index.html',
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.Element.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
        w.eval(lire('partage/session.js')); w.eval(lire('partage/portail.js')); w.eval(lire('partage/rendu_equite.js'));
        w.fetch = async (u, o) => { const p = JSON.parse((o && o.body) || '{}');
          if (p.action === 'getConsultAbsences') return { ok: true, json: async () => ({ success: true, patlib: true,
            absences: { ALPHA: [{ d: BLOC_ABS, c: 'V' }] }, patients: [{ id: 'x', mar: 'ALPHA', consult: CONSULT, per: 'pm', bloc: BLOC_ABS, nb: 2, confieA: '' }] }) };
          return { ok: true, json: async () => ({ success: false }) }; };
      } });
    const w = dom.window; await dodo(300);
    w.eval(`MY_ID = 'ALPHA'; MY_ROLE = 'mar'; MY_TUILES = []; MY_LIBERAL = ${liberal}; renderTiles();`);
    await dodo(150);
    if (attendu === 'moi') {
      const t = w.document.querySelector('#tiles-moi [data-key="consult"]');
      V('membre du groupement, sans droit réservé : « Mes consultations » est dans Moi', !!t);
      const b = t && t.querySelector('.tile-badge');
      V('… avec la pastille « 2 à régler » (absence le jour du geste)', b && b.textContent === '2 à régler', b && b.textContent);
    } else {
      V('hors groupement libéral : pas de tuile « Mes consultations », aucune pastille', !w.document.querySelector('[data-key="consult"]'));
    }
  }

  console.log('\n═══ 4. Guide MAR : section 27 ═══');
  {
    const g = lire('docs/guide-mar.html');
    const bloc = (g.match(/<details class="sec" id="s27">[\s\S]*?\n<\/details>/) || [''])[0];
    V('la section 27 existe et est repliée', !!bloc && !/id="s27"[^>]*\sopen/.test(bloc));
    const t = bloc.replace(/<[^>]+>/g, ' ').toLowerCase();
    const interdits = ['miroir', 'journal', 'cloudflare', 'gas'].filter(m => new RegExp('(^|[^a-zà-ÿ])' + m + '($|[^a-zà-ÿ])').test(t));
    V('vocabulaire interdit absent (miroir, journal, Cloudflare, GAS)', interdits.length === 0, interdits);
    V('un bloc « En 2 minutes » et les gestes : choisir sa salle, « Oui, c\'est moi », Qui appeler, secrétariat par téléphone — sans « Confier »',
      /En 2 minutes/.test(bloc) && /Aucune/.test(bloc) && /Oui, c'est moi/.test(bloc) && /Qui appeler/.test(bloc) && !/Confier/.test(bloc) && /téléphone/.test(bloc));
    V('(28/11/2026) le guide décrit la nouvelle vue : À faire, DECT, toucher le nom puis confirmer, Réglé autrement, calendrier replié',
      /À faire/.test(bloc) && /DECT/.test(bloc) && /touchez son nom/i.test(bloc) && /Réglé autrement/.test(bloc) && /Voir le calendrier/.test(bloc) && /vous seul/i.test(bloc));
    V('(28/11/2026) le guide dit que le confrère du secteur est en tête', /Le confrère du secteur est en tête/.test(bloc) && /D'abord le confrère du secteur/.test(bloc));
    V('… et plus les anciens gestes (pastille sous la consultation, « Qui peut le voir ? », « Noter mes patients lib »)',
      !/Qui peut le voir/.test(bloc) && !/pastille orange/.test(bloc) && !/Noter mes patients lib/.test(bloc));
    V('la page d\'accueil (section 03) y renvoie', /href="#s27"/.test(g));
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  if (ko) process.exit(1);
})();
