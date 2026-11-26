/* ═══ BANC — PATIENTS LIB D'UNE CONSULTATION (26/11/2026) ═══
   Le MAR note, pour chacune de ses consultations, ses patients lib (date
   opératoire + nombre, AUCUN NOM). Absent le jour du geste : la page montre
   qui peut voir le patient à sa place, puis il le confie après accord verbal.
   Réservé au droit `patlib` (CONFIG / TUILES_PRIVEES) le temps du test.

   1. Serveur — le VRAI code (indisponibilites.gs, equipe.gs, code.gs) dans un
      classeur simulé : droit, délais médico-légaux, propriété des lignes,
      groupement, aucune poussée vers le relais.
   2. Page — absences.html TELLE QUELLE dans un navigateur simulé : boutons
      d'état, contrôle des dates, « qui peut le voir ? » (rattrapage : un
      confrère du groupement présent le jour de MA consultation ET le jour du
      bloc), confier, bandeau, sans droit = rien.
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
    ['../gas/indisponibilites.gs', '_patlibMembre_'], ['../gas/indisponibilites.gs', '_act_patientsLib']]) {
    vm.runInContext(extraireFonction(f, n), ctx);
  }
  const src = lire('gas/indisponibilites.gs');
  for (const c of ['PATLIB_ONGLET', 'PATLIB_ENTETE']) {
    const m = src.match(new RegExp('const ' + c + ' = [^;]+;')); vm.runInContext(m[0], ctx);
  }
  const appel = (id, role, payload) => JSON.parse(ctx._act_patientsLib({ e: null, payload, action: 'patientsLib', code: 'X', user: { id, role } }).getContent());
  const feuille = () => cl.getSheetByName('PATIENTS_LIB');
  return { ctx, cl, appel, feuille };
}

console.log('\n═══ 1. Serveur : action patientsLib ═══');
{
  const { ctx, appel, feuille } = serveur();
  const ajout = (o) => Object.assign({ op: 'ajouter', consult: CONSULT, per: 'pm', bloc: BLOC_OK, nb: 2 }, o || {});
  V('un code du comité est refusé (MAR seulement)', appel('ALPHA', 'admin', ajout()).error === 'Accès refusé');
  V('un MAR sans le droit patlib est refusé', appel('BRAVO', 'mar', ajout()).error === 'Accès refusé');
  V('rien n\'est créé dans le classeur tant que personne n\'a rien noté', feuille() === null);

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
  V('le confrère retrouve la ligne chez lui (même sans le droit, la lecture est prête)',
    ctx._patlibLire_('BRAVO').some(p => p.id === id && p.mar === 'ALPHA'));
  V('un autre MAR ne voit pas la ligne', ctx._patlibLire_('CHARLIE').length === 0);
  V('un autre MAR (avec le droit) ne peut ni la reprendre ni la supprimer',
    !appel('CHARLIE', 'mar', { op: 'reprendre', id }).success && !appel('CHARLIE', 'mar', { op: 'supprimer', id }).success
    && feuille().lignes.length === 2 && feuille().lignes[1][6] === 'BRAVO');
  const rr = appel('ALPHA', 'mar', { op: 'reprendre', id });
  V('reprendre : la ligne n\'est plus confiée', rr.success && rr.patients[0].confieA === '' && ctx._patlibLire_('BRAVO').length === 0);
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
  V('getConsultAbsences ne sert les patients qu\'avec le droit patlib',
    /if \(user\.role === 'mar' && _aDroitTuile_\(user\.id, 'patlib'\)\) \{ patlib = true; patients = _patlibLire_\(user\.id\); \}/.test(ab));
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
    rdv(3, CONSULT, '15:20', 'Consultation UB Pré-anesthésie', BLOC_OK, 'Libéral'),       // agenda sans secteur
    rdv(3, CONSULT, '15:40', 'CPA Urologie Libérale', '', 'Libéral'),                       // sans date opératoire
  ]);
  V('lecture : seuls les patients au régime Libéral avec secteur et dates sont gardés', lu.lignes.length === 4 && lu.rdv === 7 && lu.lib === 6, lu);
  V('lecture : rien d\'autre que jour, demi-journée, salle, secteur, date opératoire, nombre',
    lu.lignes.every(l => Object.keys(l).sort().join() === 'bloc,consult,nb,per,salle,secteur') && !JSON.stringify(lu.lignes).includes('Coloscopie') && !JSON.stringify(lu.lignes).includes('14:'));
  V('lecture : demi-journée (avant 13 h = matin), salle, secteur', lu.lignes[3].per === 'am' && lu.lignes[3].salle === '1' && lu.lignes[3].secteur === 'ORL' && lu.lignes[0].secteur === 'END' && lu.lignes[0].per === 'pm');
  V('lecture : agenda sans secteur et ligne sans date comptés à part', lu.inconnus['Consultation UB Pré-anesthésie'] === 1 && lu.sansDate === 1, lu);
  V('lecture : un autre fichier est refusé avec un message clair', /Colonnes introuvables/.test(lireExportCpa([['A', 'B']]).erreur || ''));

  // Serveur : le planning publié a, mardi après-midi, ALPHA et CHARLIE en endo (deux salles d'endo), DELTA en ORL le matin
  const { ctx, cl, appel, feuille } = serveur();
  const planning = { months: [{ days: [{ date: CONSULT, dow: 2 }], doctors: [
    { id: 'ALPHA', days: [{ afternoon: 'CS-END' }] }, { id: 'CHARLIE', days: [{ afternoon: 'CS-END' }] },
    { id: 'DELTA', days: [{ morning: 'CS-ORL' }] }, { id: 'BRAVO', days: [{ morning: 'END', afternoon: 'END' }] } ] }] };
  ctx.readPlanningFromDrive = () => JSON.stringify(planning);
  ctx.anneePlanning = d => Number(String(d).slice(0, 4));
  const src = lire('gas/indisponibilites.gs');
  for (const c of ['CPA_ONGLET', 'CPA_ENTETE', 'CPA_SALLES_ONGLET', 'CPA_SALLES_ENTETE', 'CPA_SECTEURS']) vm.runInContext(src.match(new RegExp('const ' + c + ' = [^;]+;'))[0], ctx);
  for (const n of ['_cpaSecteur_', '_cpaLire_', '_cpaSallesLire_', '_cpaSalleEcrire_', '_cpaConsultsJours_', '_cpaResoudre_', '_cpaLignes_', '_act_importCpa'])
    vm.runInContext(extraireFonction('../gas/indisponibilites.gs', n), ctx);
  vm.runInContext(extraireFonction('../gas/equipe.gs', '_droitMaintenance_'), ctx);
  cl.getSheetByName('CONFIG').lignes[1][1] = 'ALPHA: consult, patlib, maintenance; CHARLIE: patlib';
  const imp = p => JSON.parse(ctx._act_importCpa({ payload: p, user: { id: 'ALPHA', role: 'mar' } }).getContent());
  V('import : refusé à un MAR sans la clé maintenance', JSON.parse(ctx._act_importCpa({ payload: { lignes: lu.lignes }, user: { id: 'CHARLIE', role: 'mar' } }).getContent()).error === 'Accès refusé');
  const r = imp({ lignes: lu.lignes.concat([{ consult: CONSULT, per: 'pm', salle: '9', secteur: 'XYZ', bloc: BLOC_OK, nb: 1 }]) });
  V('import : accepté, une ligne par salle et date opératoire, la ligne douteuse rejetée', r.success && r.lignes === 4 && r.patients === 4 && r.rejetees === 1, r);
  V('import : bilan — endo à confirmer (2 salles, 2 MAR), ORL rattachée seule', r.bilan.aConfirmer.patients === 3 && r.bilan.auto.patients === 1 && r.bilan.sans.length === 0, r.bilan);
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
  V('le confrère la retrouve chez lui', ctx._patlibLire_('BRAVO').some(p => p.id === abs.id && p.cpa));
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

/* ══ 2. PAGE ═════════════════════════════════════════════════════════════ */
function donnees(patlib) {
  return {
    success: true, role: 'mar', moi: 'ALPHA', name: 'Dr Alpha', motifs: true, patlib,
    noms: { ALPHA: 'Dr Alpha', BRAVO: 'Dr Bravo', CHARLIE: 'Dr Charlie', ECHO: 'Dr Echo', GOLF: 'Dr Golf', HOTEL: 'Dr Hotel' },
    groupement: { ALPHA: true, BRAVO: true, CHARLIE: true, ECHO: true, HOTEL: true },
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
      { id: 'p2', mar: 'BRAVO', consult: lundi, per: 'pm', bloc: plus(lundi, 4), nb: 1, confieA: 'ALPHA' },
    ] : [],
  };
}
async function page(patlib, modif) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
  const envois = [];
  let liste = JSON.parse(JSON.stringify(donnees(patlib).patients));
  const dom = new JSDOM(lire('absences.html'), { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    url: 'https://planningmedic.github.io/absences.html',
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.Element.prototype.scrollIntoView = function () {};
      w.sessionStorage.setItem('pmViewCode', 'CODE-ALPHA');
      w.fetch = async (url, o) => {
        const p = JSON.parse(o.body); envois.push(p);
        if (p.action === 'getConsultAbsences') { const d = donnees(patlib); if (modif) modif(d); return { ok: true, status: 200, json: async () => d }; }
        if (p.action === 'patientsLib') {
          if (p.op === 'ajouter') liste.push({ id: 'n' + envois.length, mar: 'ALPHA', consult: p.consult, per: p.per, bloc: p.bloc, nb: p.nb, confieA: '' });
          if (p.op === 'confier') liste.find(x => x.id === p.id).confieA = p.a;
          if (p.op === 'supprimer') liste = liste.filter(x => x.id !== p.id);
          return { ok: true, status: 200, json: async () => ({ success: true, patients: JSON.parse(JSON.stringify(liste)) }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: false }) };
      };
      w.eval(lire('partage/session.js'));
    } });
  await dodo(400);
  return { w: dom.window, D: dom.window.document, envois, erreurs };
}

(async () => {
  console.log('\n═══ 2. Page « Mes consultations » ═══');
  {
    const { D, erreurs } = await page(false);
    V('la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    V('sans le droit patlib : aucun bouton patients, aucun bandeau', !D.querySelector('.puce') && D.getElementById('aconf').innerHTML === '');
    V('… et la liste des consultations est là comme avant', D.querySelectorAll('#file .slot').length === 2);
  }
  {
    const { w, D, envois, erreurs } = await page(true);
    V('avec le droit : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    const puces = [...D.querySelectorAll('#file .puce')];
    V('un bouton d\'état sous chacune de MES consultations (2)', puces.length === 2, puces.length);
    V('consultation avec un patient présent : « tout est réglé »', /1 patient · tout est réglé/.test(puces[0].textContent), puces[0].textContent);
    V('consultation sans patient : « Noter mes patients lib »', /Noter mes patients lib/.test(puces[1].textContent));
    V('les patients confiés par un confrère sont affichés (« reçu »)', /1 patient du Dr Bravo/.test(D.getElementById('aconf').textContent));

    puces[0].click(); await dodo(50);
    V('le bouton ouvre la feuille de saisie', D.getElementById('pFeuille').classList.contains('open'));
    const date = D.getElementById('pfDate');
    V('le calendrier est borné : 48 h après la consultation au plus tôt', date.min === plus(CONSULT, 2), date.min);
    date.value = plus(CONSULT, 1); await w.patAjouter();
    V('date trop tôt : message clair, rien n\'est envoyé',
      /Trop tôt/.test(D.getElementById('pfErr').textContent) && !envois.some(e => e.action === 'patientsLib'));
    date.value = plus(CONSULT, 4); await w.patAjouter();
    V('samedi : refusé', /week-end/.test(D.getElementById('pfErr').textContent));

    date.value = BLOC_ABS; w.patNb(1); await w.patAjouter(); await dodo(50);
    const env = envois.filter(e => e.action === 'patientsLib').pop();
    V('ajout envoyé : consultation, demi-journée, date opératoire, nombre — rien d\'autre',
      env && env.op === 'ajouter' && env.consult === CONSULT && env.per === 'pm' && env.bloc === BLOC_ABS && env.nb === 2
      && Object.keys(env).sort().join() === 'action,bloc,code,consult,nb,op,per', env);
    const liste = D.getElementById('pfListe').textContent;
    V('absent ce jour-là : la ligne le dit et la liste des confrères s\'ouvre seule',
      /Vous êtes absent \(vacances\)/.test(liste) && /Qui peut faire votre consultation/.test(liste), liste.slice(0, 300));
    V('la question porte sur MA consultation et le jour du bloc', /faire votre consultation du/.test(liste) && /et opérer le/.test(liste));
    V('un confrère présent les deux jours est proposé', /Dr Bravo/.test(liste));
    V('… même s\'il n\'a aucune consultation avant le geste (rattrapage : il prend MA consultation)', /Dr Hotel/.test(liste));
    V('absent le jour de MA consultation : pas proposé', !/Dr Charlie/.test(liste));
    V('absent le jour du bloc : pas proposé', !/Dr Echo/.test(liste));
    V('le MAR hors groupement n\'est pas proposé', !/Dr Golf/.test(liste));
    V('moi-même : pas proposé', !/Dr Alpha/.test(D.querySelector('#pfListe .alt').textContent));
    V('le bandeau annonce 2 patients à confier', /2 patients lib à confier/.test(D.getElementById('aconf').textContent));

    [...D.querySelectorAll('#pfListe .person')].find(x => /Dr Bravo/.test(x.textContent)).querySelector('.pbtn.bleu').click(); await dodo(80);
    const conf = envois.filter(e => e.action === 'patientsLib').pop();
    V('« Confier » envoie la ligne et le confrère choisi', conf.op === 'confier' && conf.a === 'BRAVO' && !!conf.id, conf);
    V('la ligne devient « Confiés au Dr Bravo »', /Confiés au Dr Bravo/.test(D.getElementById('pfListe').textContent));
    V('le bandeau « à confier » disparaît', !/à confier/.test(D.getElementById('aconf').textContent));
    V('le bouton d\'état de la consultation se met à jour', /3 patients · tout est réglé/.test(D.querySelector('#file .puce').textContent),
      D.querySelector('#file .puce').textContent);

    D.querySelector('#pfListe .px').click(); await dodo(80);
    V('la croix supprime une ligne, avec « Annuler » proposé',
      envois.filter(e => e.action === 'patientsLib').pop().op === 'supprimer' && /Ligne supprimée/.test(D.getElementById('pfListe').textContent));
  }


  {
    const { w, D, envois, erreurs } = await page(true, d => { d.aChoisir = [{ date: plus(lundi, 2), per: 'pm', salles: ['2', '4'] }]; d.salles = { [CONSULT + '|pm']: '2' }; });
    V('export CPA : la page s\'ouvre sans erreur', !erreurs.length, erreurs);
    const puces = [...D.querySelectorAll('#file .puce')];
    V('la consultation rattachée affiche sa salle', /salle 2/.test(puces[0].textContent), puces[0].textContent);
    V('l\'autre consultation demande « Salle 2 ou salle 4 ? »', puces[1].classList.contains('choix') && puces[1].querySelectorAll('.sal').length === 2);
    puces[1].querySelectorAll('.sal')[1].click(); await dodo(120);
    const sal = envois.filter(e => e.action === 'patientsLib').pop();
    V('le choix part au serveur (jour, demi-journée, salle)', sal && sal.op === 'salle' && sal.date === plus(lundi, 2) && sal.per === 'pm' && sal.salle === '4', sal);
    V('… puis la page relit tout (les patients de la salle arrivent)', envois[envois.length - 1].action === 'getConsultAbsences');
    V('la feuille de choix ne s\'ouvre pas en touchant un bouton de salle', !D.getElementById('pFeuille').classList.contains('open'));
  }
  {
    const m = lire('maintenance.html');
    V('Maintenance : la carte d\'import existe', /id="cCpa"/.test(m) && /id="cpaFichier"/.test(m));
    V('Maintenance : le lecteur de tableur n\'est chargé qu\'au moment de l\'import', /assets\/vendor\/xlsx\.full\.min\.js/.test(m) && !/<script src="assets\/vendor\/xlsx/.test(m)
      && fs.existsSync(path.join(__dirname, '..', 'assets/vendor/xlsx.full.min.js')));
    V('Maintenance : seul ce que rend lireExportCpa part au serveur', /api\(\{ action: 'importCpa', lignes: lu\.lignes \}\)/.test(m));
  }

  console.log('\n═══ 3. Accueil : la tuile « Mes consultations » ═══');
  for (const [droits, attendu] of [[['consult'], 'reserve'], [['consult', 'patlib'], 'moi']]) {
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
    w.eval(`MY_ID = 'ALPHA'; MY_ROLE = 'mar'; MY_TUILES = ${JSON.stringify(droits)}; MY_LIBERAL = true; renderTiles();`);
    await dodo(150);
    const t = w.document.querySelector(`#tiles-${attendu} [data-key="consult"]`);
    V(`droits ${droits.join('+')} : « Mes consultations » est dans ${attendu === 'moi' ? 'Moi' : 'Réservé'}`, !!t);
    if (attendu === 'moi') {
      const b = t && t.querySelector('.tile-badge');
      V('avec le droit : pastille « 2 à confier » (absence le jour du geste)', b && b.textContent === '2 à confier', b && b.textContent);
    } else {
      V('sans le droit : aucune demande de plus au serveur, aucune pastille', !(t && t.querySelector('.tile-badge')));
    }
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  if (ko) process.exit(1);
})();
