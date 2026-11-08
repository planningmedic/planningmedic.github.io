/* ═══ BANC — LE PLANNING DU JOUR EN TABLEAU AIMANTÉ (03/11/2026, v1.56) ═══
   POURQUOI CE SCÉNARIO EXISTE. Le planning du jour sur téléphone est redessiné
   (maquette B1 validée par le responsable) : un aimant par MAR, posé dans la
   case de son secteur. Le dessin change, les données non. Ce qui ne doit JAMAIS
   arriver :
     · la garde de maternité affichée avant celle de réanimation ;
     · la consultation libérale séparée de l'aimant du MAR qui la fait
       (constat du responsable sur la maquette : « on dirait que le lib est
       séparé ») ;
     · un absent posé dans un secteur, ou oublié « hors du tableau » ;
     · les vacances de 2026 (code « A ») présentées comme une absence ;
     · un MAR qui ne retrouve pas sa propre journée.
   planning.html est chargé TEL QUEL dans un navigateur simulé, avec un jeu
   fictif. Contre-preuve : la version d'avant (git) mettait la maternité en
   premier et n'avait ni aimants ni « hors du tableau ». */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

function monter(html) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/planning.html', pretendToBeVisual: true,
    beforeParse(win) {
      Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.Element.prototype.scrollIntoView = function () {};
      win.scrollTo = () => {};
      win.eval(lire('partage/session.js'));
      win.eval(lire('partage/portail.js'));
      win.eval(lire('partage/rendu_equite.js'));
    } });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  w.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
  return { w, D: w.document, erreurs };
}

/* Jeu fictif : mardi 2 mars 2027 (« aujourd'hui »), mercredi 3, samedi 6. */
const J = (date, day, dow, we) => ({ date, day, dow, isWeekend: !!we, isFerie: false });
const jours = [J('2027-03-02', 2, 2), J('2027-03-03', 3, 3), J('2027-03-06', 6, 6, true), J('2027-03-04', 4, 4)];
const d = (id, initials, days) => ({ id, initials, days });
const MOIS = [{ id: 'm3', year: 2027, month: 3, days: jours, doctors: [
  // QB, garde de MATERNITÉ, listé AVANT le médecin de réanimation
  d('QB', 'QB', [{ status: 'G2', morning: 'MAT' }, {}, {}]),
  d('QA', 'QA', [{ status: 'G', morning: 'REA', afternoon: 'REA' }, {}, {}, { status: 'G' }]),
  d('QC', 'QC', [{ status: '18', morning: 'VIS', afternoon: 'VIS' }, {}, {}]),
  // le MAR connecté : viscéral le matin, consultation libérale d'endoscopie l'après-midi
  d('MOI', 'QM', [{ status: '', morning: 'VIS', afternoon: 'CS-END', lib: true }, { status: 'G', morning: 'REA' }, {}]),
  d('QD', 'QD', [{ status: '', morning: 'ORT', afternoon: 'CS-ORT' }, { status: 'G2' }, {}]),
  d('QE', 'QE', [{ status: 'RG', morning: 'VIS' }, {}, {}]),
  d('QF', 'QF', [{ status: 'A' }, {}, {}]),
  d('QG', 'QG', [{ status: 'TP' }, {}, { status: '18' }]),
] }];
const SECT = [
  { code: 'VIS', label: 'Bloc viscéral', court: 'Viscéral', icon: 'Activity' },
  { code: 'REA', label: 'Réanimation', court: 'Réa', icon: 'HeartPulse' },
  { code: 'ORT', label: 'Orthopédie', court: 'Ortho', icon: 'Bone' },
  { code: 'END', label: 'Endoscopies', court: 'Endo', icon: 'Microscope' },
  { code: 'MAT', label: 'Maternité', court: 'Maternité', icon: 'Baby' },
  { code: 'CS', label: 'Consultation', icon: 'Stethoscope' }];

function jour(w, date, moi, sombre) {
  w.eval(`todayStr = () => '2027-03-02';
    DATA = { months: ${JSON.stringify(MOIS)} };
    SECTORS_DEF = ${JSON.stringify(SECT)};
    MY_ID = ${moi ? "'MOI'" : 'null'};
    ${sombre ? "document.documentElement.setAttribute('data-theme','dark'); IS_DARK = true; SECTOR_COLORS = _themeMap(_SECTOR_BASE);" : ''}
    currentMonthId = 'm3'; buildMobileDayList();
    currentDayIdx = allDaysFlat.findIndex(x => x.date === '${date}');
    renderMobileDay();`);
  return w.document.getElementById('mobileDayContent');
}
const txt = e => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
const aimant = (C, init) => [...C.querySelectorAll('.jb-aim')].filter(a => a.firstChild && a.firstChild.textContent === init);

(async () => {
  const { w, erreurs } = monter(lire('planning.html'));
  await dodo(300);

  console.log('\n═══ P1. La garde de la nuit : réanimation d\'abord ═══');
  let C = jour(w, '2027-03-02', true);
  const nuit = C.querySelector('.jb-nuit');
  V('le bandeau de garde est en tête de la journée', !!nuit && C.firstElementChild === nuit);
  V('aujourd\'hui : « De garde ce soir »', /De garde ce soir/.test(txt(nuit)));
  const duo = [...nuit.querySelectorAll('.jb-duo > div')].map(txt);
  V('réanimation AVANT maternité, même si la maternité est listée en premier', duo[0] === 'QARéa' && duo[1] === 'QBMaternité', duo);
  V('« Réa » et « Maternité » avec une majuscule', duo.every(x => /Réa$|Maternité$/.test(x)), duo);
  V('aujourd\'hui : « Demain soir », réanimation puis maternité', /Demain soir : QM et QD/.test(txt(nuit)) && !/lendemain/.test(txt(nuit)), txt(nuit));
  V('le MAR connecté de garde demain n\'est pas dit « c\'est vous » ce soir', !/c’est vous/.test(txt(nuit)));

  console.log('\n═══ P2. Votre journée ═══');
  const vous = C.querySelector('.jb-vous');
  V('la carte « Votre journée » est là', !!vous);
  V('votre aimant est rouge', !!vous && vous.querySelector('.jb-aim.moi') && txt(vous.querySelector('.jb-aim.moi')) === 'QM');
  const demis = [...vous.querySelectorAll('.jb-demi')].map(txt);
  V('matin : libellé court du secteur (onglet SECTEURS)', demis[0] === 'MatinViscéral', demis);
  V('après-midi : « Consult. lib. »', demis[1] === 'Après-midiConsult. lib.', demis);
  V('l\'icône du bloc viscéral est le dessin du service (tube digestif)', !!vous.querySelector('svg.jb-ico mask'));

  console.log('\n═══ P3. Les aimants dans les secteurs ═══');
  const rubans = [...C.querySelectorAll('.jb-ruban')].map(txt);
  V('un secteur occupé = une étiquette, dans l\'ordre de l\'onglet', JSON.stringify(rubans) === JSON.stringify(['Bloc viscéral', 'Réanimation', 'Orthopédie', 'Maternité']), rubans);
  V('le médecin de garde porte « G » dans son secteur de journée', aimant(C.querySelector('.jb-plaques'), 'QA').every(a => /G$/.test(txt(a))) && aimant(C.querySelector('.jb-plaques'), 'QA').length === 2);
  V('le 18 h porte « 18 h »', aimant(C.querySelector('.jb-plaques'), 'QC').every(a => a.querySelector('.jb-ong.h')));
  V('le MAR connecté est rouge dans le tableau aussi', aimant(C.querySelector('.jb-plaques'), 'QM').every(a => a.classList.contains('moi')));
  V('case vide : « Libre »', /Libre/.test(txt(C.querySelector('[aria-label="Maternité"]'))));
  V('icône de l\'onglet SECTEURS pour les autres secteurs', !!C.querySelector('[aria-label="Réanimation"] [data-lucide="HeartPulse"]'));

  console.log('\n═══ P4. Consultations : « lib. » collé à l\'aimant ═══');
  const lignes = [...C.querySelectorAll('.jb-ligne')];
  V('une ligne par spécialité', lignes.map(l => txt(l.querySelector('.jb-lib'))).join(',') === 'Ortho,Endoscopies,Maternité'); // mardi : la maternité tient sa consultation
  const endo = lignes.find(l => /Endoscopies/.test(txt(l)));
  const lib = endo && endo.querySelector('.jb-ong.l');
  V('« lib. » est DANS l\'aimant du MAR qui fait la consultation', !!lib && lib.parentElement.classList.contains('jb-aim') && lib.parentElement.firstChild.textContent === 'QM');
  V('aucune pastille « lib. » isolée', !C.querySelector('.tag-lib, .lib-tag'));
  V('pas de « lib. » sur une consultation ordinaire', !lignes[0].querySelector('.jb-ong.l'));

  console.log('\n═══ P5. Hors du tableau ═══');
  const bacs = [...C.querySelectorAll('.jb-bac')].map(b => ({ t: txt(b.querySelector('.jb-bac-t')), m: [...b.querySelectorAll('.jb-aim')].map(txt) }));
  /* (08/11/2026) « A » s'affiche « Absence » et non plus « Vacances » : c'est désormais
     le statut « absent de jour, garde possible » (ex. période hors contrat). */
  V('une ligne par motif, avec son nombre', JSON.stringify(bacs) === JSON.stringify([{ t: 'Repos de garde1', m: ['QE'] }, { t: 'Temps partiel1', m: ['QG'] }, { t: 'Absence1', m: ['QF'] }]), bacs);
  V('le total est dans le titre', /Hors du tableau 3/.test(txt([...C.querySelectorAll('.jb-h2')].find(h => /Hors/.test(txt(h))))));
  V('un repos de garde n\'est posé dans aucun secteur', aimant(C.querySelector('.jb-plaques'), 'QE').length === 0);
  V('légende : G, 18 h, lib., vous', /de garde le soir.*poste jusqu’à 18 h.*consultation libérale.*QM ?vous/.test(txt(C.querySelector('.jb-legende'))));

  console.log('\n═══ P6. Un autre jour, le week-end, sans connexion MAR, en sombre ═══');
  C = jour(w, '2027-03-03', true);
  V('un autre jour : « De garde la nuit » et « c\'est vous »', /De garde la nuit/.test(txt(C.querySelector('.jb-nuit'))) && /c’est vous/.test(txt(C.querySelector('.jb-nuit'))));
  V('un autre jour : « Le lendemain soir », pas « Demain soir »', /Le lendemain soir : QA/.test(txt(C.querySelector('.jb-nuit'))), txt(C.querySelector('.jb-nuit')));
  V('« garde ce soir » sur votre journée', /garde ce soir/.test(txt(C.querySelector('.jb-vous'))));
  C = jour(w, '2027-03-06', true);
  V('week-end : pas de secteurs, la mention du week-end', !C.querySelector('.jb-plaque') && /pas de programme opératoire/.test(txt(C)));
  V('week-end : votre journée dit « Libre »', /Week-end ?Libre/.test(txt(C.querySelector('.jb-vous'))));
  V('week-end : le poste 18 h est montré', /Poste 18 h/.test(txt(C)) && aimant(C, 'QG').length === 1);
  C = jour(w, '2027-03-02', false);
  V('sans MAR connecté : pas de carte « Votre journée » ni « vous » en légende', !C.querySelector('.jb-vous') && !/QM ?vous/.test(txt(C.querySelector('.jb-legende'))));
  C = jour(w, '2027-03-02', true, true);
  V('mode sombre : la journée se dessine', !!C.querySelector('.jb-plaque'));
  V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3));

  console.log('\n═══ P6 bis. Matin et après-midi ont la même largeur (05/11/2026) ═══');
  /* Constat du responsable : 3 aimants (dont un à trois lettres) tenaient sur une ligne le matin
     et passaient à la ligne l'après-midi. Cause : la case de l'après-midi portait le
     pointillé en bordure + 10 px de retrait, soit 12 px de moins. Le banc n'a pas de
     mise en page : il lit la règle CSS de la seconde case. */
  const regleCase = (h) => { const m = h.match(/\.jb-case\+\.jb-case\{([^}]*)\}/); return m ? m[1] : null; };
  const rc = regleCase(lire('planning.html'));
  V('la case de l\'après-midi n\'a ni bordure ni retrait (même largeur que le matin)', rc !== null && !/border-left|padding-left/.test(rc), rc);
  V('le pointillé entre matin et après-midi existe toujours', /\.jb-case\+\.jb-case::before\{[^}]*border-left:2px dotted/.test(lire('planning.html')));

  console.log('\n═══ P7. Contre-preuve : la version d\'avant ═══');
  let AVANT = null;
  try { AVANT = execSync('git show 61e0e77:planning.html', { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (AVANT) {
    const a = monter(AVANT); await dodo(300);
    const CA = jour(a.w, '2027-03-02', true);
    V('AVANT : la maternité passait en premier (« QB + QA »)', /QB \+ QA/.test(txt(CA.querySelector('.m-tonight'))), txt(CA.querySelector('.m-tonight')));
    V('AVANT : ni aimants ni « hors du tableau »', !CA.querySelector('.jb-aim') && !/Hors du tableau/.test(txt(CA)));
  } else V('historique git disponible pour la contre-preuve (cloner sans --depth 1)', false);
  let AVANT2 = null;
  try { AVANT2 = execSync('git show 525e2cf:planning.html', { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (AVANT2) {
    const r2 = regleCase(AVANT2);
    V('AVANT (v1.56.1) : la case de l\'après-midi avait un retrait (12 px de moins)', !!r2 && /padding-left:10px/.test(r2), r2);
  } else V('historique git disponible pour la contre-preuve (cloner sans --depth 1)', false);

  console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
