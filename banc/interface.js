/* ═══ L'INTERFACE RÉELLE, PILOTÉE ═══
   La page admin.html du dépôt, rendue dans un navigateur simulé, alimentée par
   un planning produit par le VRAI générateur (generatePlanningFromGardes) sur un
   service fictif de 23 MAR. Je clique dans le DOM comme le ferait un membre du
   comité : case flash → panneau → choix du MAR → Publier. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm');
const monde = require('./monde');

const dodo = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,220) : '')); } };
const dstr = v => v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`
  : String(v).trim();   // (14/08/2026) la doublure coerce les dates comme le vrai Sheets ; les pages, elles, envoient toujours 'AAAA-MM-JJ'

(async () => {
  // ── 1. Le serveur : monde complet + planning réel ──
  const W = monde.monter(2027);
  const months = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
  const equite = { parMar: {} };
  const planningJson = { months: months.map(m => ({ ...m, doctors: m.doctors })), equiteInitiale: equite };
  const affectations = vm.runInContext('loadAffectations(2027)', W.ctx);
  const medecins = vm.runInContext('getDoctorsFromMedecins()', W.ctx);
  /* Forme EXACTE attendue par la page (SECTEURS_CFG) : code, label, court, aff,
     icon, bg/fg, cs, actif — lue dans admin.html, pas devinée. */
  const ICONES = { VIS:'🔵', REA:'🔴', ORT:'🟠', ORL:'🟣', END:'🟢', MAT:'🩷', CI:'💚', VOLANT:'⚪' };
  const secteurs = monde.SECTEURS.slice(1).map((s, i) => ({
    code: s[0], label: s[1], court: s[1].slice(0, 8), aff: s[1], icon: ICONES[s[0]] || '⚪',
    bg: '#EFF6FF', fg: '#1D4ED8', cs: null, actif: true, ordre: s[2],
  }));
  console.log(`\n  (monde prêt : ${medecins.length} MAR, ${months.length} mois générés)`);

  // ── 2. Le Worker réel, avec ces données ──
  const wsrc = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
  const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(wsrc, wctx);
  const WK = wctx.__W, M = new Map();
  const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k,v) => { M.set(k,v); }, delete: async k => { M.delete(k); },
    list: async ({prefix, limit}) => ({ keys: [...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const CODE = 'CODEADMIN99';
  M.set('acces', JSON.stringify({ indisposYear: 2027, indisposOuverte: false, users: [
    { h: await sha(CODE), role: 'admin', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Prénom0' } ] }));
  M.set('annees', JSON.stringify({ success: true, active: 2027, annees: [{ annee: 2027, statut: 'ACTIF' }] }));
  M.set('secteurs', JSON.stringify(secteurs));   // tableau : la page fait Array.isArray(m.data.secteurs)
  /* config_admin.medecins : la page attend le champ `actif` (booléen) et les
     initiales — c'est ce que pousse le miroir en production. */
  const medecinsPage = medecins.map(m => ({ ...m, actif: true, secteur: 'VOLANT' }));
  M.set('config_admin', JSON.stringify({ medecins: medecinsPage, overrides: [], seuils: null,
    anneeStatsFiables: 2027, anneeSuivante: 2028,
    csTemplate: { success: true, lignes: [] } }));
  M.set('planning_2027', JSON.stringify(planningJson));
  /* La page lit pre.affectations.affectations — emballage vérifié dans admin.html. */
  M.set('affectations_2027', JSON.stringify({ affectations }));
  /* gardes_2027 : la carte {date: {MAR: code}} que le module partagé
     (partage/dispo_jour.js) utilise pour calculer le panneau SUR LA PAGE.
     Sans elle, l'étage 2 est inactif et la page repart vers Apps Script —
     c'est précisément ce que le banc doit vérifier. */
  const gsheet = W.cl.getSheetByName('GARDES_2027').lignes;
  const datesG = gsheet[2].slice(2);
  const carte = {};
  datesG.forEach((dt, c) => {
    const jour = {};
    for (let r = 3; r < gsheet.length; r++) { const v = gsheet[r][c + 2]; if (v) jour[gsheet[r][0]] = v; }
    carte[dt] = jour;
  });
  M.set('gardes_2027', JSON.stringify({ success: true, data: carte, year: 2027 }));
  M.set('joursferies_2027', JSON.stringify({ success: true, joursFeries: ['2027-01-01','2027-05-01'] }));
  M.set('mail_nonlus', JSON.stringify({ success: true, nonLus: 3 }));
  const env = { KV, PUSH_TOKEN: 'JETON' };

  // ── 3. La page ──
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  vc.on('error', (...a) => erreurs.push('console.error: ' + a.map(String).join(' ')));
  if (process.env.VERBEUX) { vc.on('log', (...a) => console.log('    [page]', a.map(String).join(' ').slice(0,160))); vc.on('warn', (...a) => console.log('    [page-warn]', a.map(String).join(' ').slice(0,160))); }
  const dom = new JSDOM(fs.readFileSync('../admin.html','utf8'),
    { runScripts:'dangerously', virtualConsole:vc, url:'https://planningmedic.github.io/admin.html', pretendToBeVisual:true, beforeParse(win) { win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8')); }   /* (14/09/2026) le socle, comme le vrai site */ });
  const w = dom.window, d = w.document;
  /* Compléments que jsdom n'implémente pas (purement visuels) : sans eux, un
     clic réel lève une erreur et le parcours s'arrête. */
  w.Element.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  /* Le module partagé est chargé par <script src> depuis le dépôt : jsdom ne
     va pas le chercher, on injecte le MÊME fichier depuis le disque. */
  w.eval(fs.readFileSync('../partage/dispo_jour.js', 'utf8'));
  await dodo(400);
  let appelsGAS = 0; const appelsDetail = [];
  w.fetch = async (url, opt) => {
    const u = String(url);
    if (u.includes('workers.dev')) {
      const chemin = u.replace(/^https:\/\/[^/]+/, '');
      return WK.fetch(new Request('https://worker' + chemin, { method:'POST', body: opt.body }), env);
    }
    appelsGAS++;
    let action = '?';
    try { action = JSON.parse(new URLSearchParams(opt.body).get('payload')).action; } catch (e) {
      try { action = JSON.parse(opt.body).action; } catch (e2) {} }
    appelsDetail.push(action);
    return { ok:true, json: async () => ({ success:false, error:'circuit Apps Script indisponible dans le banc' }) };
  };

  console.log('\n═══ 18. J\'ouvre la page et je saisis le code ═══');
  const champ = d.getElementById('authInput');
  V('l\'écran de code s\'affiche', !!champ);
  champ.value = CODE;
  const btn = d.querySelector('.auth-btn');
  V('le bouton « Accéder » existe', !!btn, btn && btn.textContent.trim());
  btn.click();                                   // le vrai bouton, le vrai gestionnaire
  const tClic = Date.now();                      // (v1.28.1) référence : le repli mail part 6 s après le boot
  await dodo(2500);
  // Trace de diagnostic du banc : que s'est-il passé au boot ?
  try {
    const r = await w.miroirRead(['annees','secteurs','config_admin','planning_2027','affectations_2027','mail_nonlus'], CODE);
    console.log('    [diag] miroirRead → success:', r && r.success, '| identite:', r && r.identite && r.identite.role,
                '| cles:', r && r.data ? Object.keys(r.data).join(',') : '-', '| manquants:', r && r.manquants, '| refuses:', r && r.refuses);
  } catch (e) { console.log('    [diag] miroirRead a échoué :', e.message); }
  const errAuth = d.getElementById('authError');
  console.log('    [diag] message d\'erreur affiché :', errAuth ? JSON.stringify(errAuth.textContent.trim()) : '(pas de champ)');
  console.log('    [diag] overlay encore visible :', (d.querySelector('.auth-overlay') || {}).style ? d.querySelector('.auth-overlay').style.display : '?');
  console.log('    [diag] appels Apps Script :', appelsDetail.join(', ') || 'aucun');
  console.log('    [diag] conteneurs :', ['#planningGrid','#gridWrap','#planningTable','.week-grid','.grid','#tab-planning','#planningContent']
    .map(sel => sel + '=' + (d.querySelector(sel) ? 'oui' : 'non')).join(' '));
  console.log('    [diag] ids présents :', [...d.querySelectorAll('[id]')].map(e => e.id).filter(i => /plan|grid|week|sect|tab|content/i.test(i)).slice(0,20).join(' '));
  console.log('    [diag] éléments .slot* :', d.querySelectorAll('[class*="slot"]').length, '| lignes tableau :', d.querySelectorAll('tr').length);
  console.log('    [diag] classes vues :', [...new Set([...d.querySelectorAll('div,td,span')].map(e => e.className).filter(c => typeof c === 'string' && c && c.length < 30))].slice(0, 18).join(' | '));
  console.log('    [diag] AFFM :', w.eval('Object.keys(window.AFFM||{}).length'), 'MAR affectés');
  console.log('    [diag] semaines connues :', w.eval('getAllWeeks().length'),
              '| 1re semaine :', w.eval('JSON.stringify(getAllWeeks()[0] || null)').slice(0,140));
  w.eval('currentWeekIdx = 8; renderWeek();');    // une semaine de mars 2027
  await dodo(400);
  const table = d.getElementById('planTable');
  console.log('    [diag] #planTable lignes :', table ? table.querySelectorAll('tr').length : 'absent',
              '| DATA chargé :', w.eval('typeof DATA !== "undefined" && !!DATA'),
              '| mois dans DATA :', w.eval('(typeof DATA!=="undefined" && DATA && DATA.months) ? DATA.months.length : 0'));
  V('la page est authentifiée (overlay masqué)', d.querySelector('.auth-overlay').style.display === 'none');
  V('les données de planning sont chargées', w.eval('(typeof DATA!=="undefined" && DATA && DATA.months) ? DATA.months.length : 0') > 0);
  V('la grille du planning est rendue', table && table.querySelectorAll('tr').length > 2, table && table.querySelectorAll('tr').length);
  V('AUCUN appel Apps Script à l\'ouverture (v1.25)', appelsGAS === 0, appelsDetail);
  V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));

  console.log('\n═══ 18 bis. (19/11/2026) Refonte de l\'onglet Planning — tuiles, en-têtes, couleurs ═══');
  {
    const kp = d.getElementById('planKpis');
    const tuiles = kp ? kp.querySelectorAll('.pk-t') : [];
    /* (20/11/2026) Plus de cases « à pourvoir ». (26/11/2026) Plus de tuile « Gardes » du jour : deux tuiles, « MAR à placer » en tête. */
    V('deux tuiles au-dessus de la grille, « MAR à placer » en tête', tuiles.length === 2 && /MAR à placer/.test(tuiles[0].textContent) && !/Cases à pourvoir/.test(kp.textContent), tuiles.length);
    V('plus de tuile « Gardes » du jour (elle répétait les lignes de garde de la grille)', !/Gardes ·|garde réa|garde mater/.test(kp.textContent), kp && kp.textContent.slice(0, 200));
    const nAP = Number((tuiles[0] && tuiles[0].querySelector('.pk-n') || {}).textContent);
    V('…rouge s\'il reste quelqu\'un à placer, sombre sinon', tuiles[0] && tuiles[0].classList.contains(nAP ? 'rouge' : 'noir'), { n: nAP, cls: tuiles[0] && tuiles[0].className });
    V('aucune case orange « à pourvoir » dans la grille', !d.querySelector('#planTable .slot-flash') && !d.querySelector('#planTable .cs-apourvoir'));
    const lignes = [...d.querySelectorAll('#planTable tr.sector-row:not(.cs-sub-row)')].length;
    V('toutes les lignes de secteur non optionnelles restent affichées, même vides', lignes === w.eval('SECTEURS_ACTIFS.filter(s => !s.optionnel).length'), { lignes, attendu: w.eval('SECTEURS_ACTIFS.filter(s => !s.optionnel).length') });
    /* (20/11/2026) La pastille « N à pourvoir / ✓ complet » sous chaque jour est retirée. */
    const pastilles = [...d.querySelectorAll('#planTable thead .jst-p')].map(e => e.textContent);
    V('aucune pastille « à pourvoir / complet » sous les jours', !pastilles.some(t => /à pourvoir|complet/.test(t)), pastilles);
    V('les présents restent affichés sous chaque jour ouvré', d.querySelectorAll('#planTable thead .jst-n').length >= 4);
    const tr = [...d.querySelectorAll('#planTable tr.sector-row')].find(r => /Bloc viscéral/.test(r.textContent));
    V('les initiales prennent la couleur du secteur (variables --sb / --sf posées sur la ligne)', tr && /--sb:/.test(tr.getAttribute('style') || '') && /--sf:/.test(tr.getAttribute('style') || ''), tr && tr.getAttribute('style'));
    V('le libellé de semaine est sur deux lignes', /Semaine \d+/.test(d.getElementById('weekLabel').innerHTML) && !!d.querySelector('#weekLabel small'));
    const f0 = d.querySelector('#planTable .slot-add, #planTable .slot-dash-click');
    V('chaque case garde un geste pour ajouter un MAR (ouvre le panneau)', f0 && /openSidePanel\(/.test(f0.getAttribute('onclick') || ''));
    if (f0) { f0.click(); await dodo(300); }
    const ps = d.getElementById('pspContent').textContent;
    V('le panneau dit où est déjà chaque MAR ce demi-jour', /ce matin : |cet après-midi : /.test(ps), ps.slice(0, 160));
    w.eval('closeSidePanel()');
  }

  console.log('\n═══ 18 bis+. (20/11/2026) Un MAR placé puis devenu absent est signalé en rouge ═══');
  {
    /* Filet « ne jamais poster un absent » : le panneau ne propose pas les absents ; mais un placement
       fait AVANT que l'absence soit posée resterait affiché comme présent. Il passe en rouge barré
       (le serveur, lui, ne le publie pas : placement caduc). CONTRE-ÉPREUVE : un MAR présent placé
       de la même façon n'est PAS rouge. */
    const cible = w.eval(`(function(){ const wk = getAllWeeks()[currentWeekIdx]; const ds = getWeekDays(wk.lundi);
      for (const sl of ds.slice(0,5)) { if (!sl || sl.isFerie) continue; const m = DATA.months.find(x => x.days && x.days.some(dd => dd.date === sl.date)); if (!m) continue;
        const i = m.days.findIndex(dd => dd.date === sl.date); let abs = null, pres = null;
        (m.doctors || []).forEach(doc => { const e = (doc.days || [])[i] || {}; if (!abs && e.status === 'V') abs = doc.id; if (!pres && !e.status && (e.morning || '').length) pres = doc.id; });
        if (abs && pres) return JSON.stringify({ date: sl.date, abs, pres }); } return 'null'; })()`);
    const c = JSON.parse(cible);
    V('la semaine du banc contient un MAR en vacances et un MAR présent le même jour', !!c, cible);
    if (c) {
      w.eval(`_localOverrides['${c.date}'] = _localOverrides['${c.date}'] || {}; _localOverrides['${c.date}']['${c.abs}'] = { am: 'VIS', pm: null }; _localOverrides['${c.date}']['${c.pres}'] = { am: 'VIS', pm: null }; renderWeek();`);
      const rouges = [...d.querySelectorAll('#planTable .slot-name.mar-absent')].map(e => e.getAttribute('onclick') || '');
      V('le MAR en vacances placé apparaît en rouge barré', rouges.some(o => o.includes("'" + c.abs + "'")), rouges);
      V('contre-épreuve : le MAR présent placé de même n\'est pas rouge', !rouges.some(o => o.includes("'" + c.pres + "'")));
      w.eval(`delete _localOverrides['${c.date}']['${c.abs}']; delete _localOverrides['${c.date}']['${c.pres}']; if (!Object.keys(_localOverrides['${c.date}']).length) delete _localOverrides['${c.date}']; renderWeek();`);
    }
  }

  console.log('\n═══ 18 ter. (19/11/2026) Pédiatrie optionnelle, interne de réa, infos du jour ═══');
  {
    const sem = JSON.parse(w.eval(`JSON.stringify(getWeekDays(getAllWeeks()[currentWeekIdx].lundi).map(x => x && x.date))`));
    const mardi = sem[1];
    w.eval(`SECTEURS_CFG = SECTEURS_CFG.concat([{ code:'PED', label:'Pédiatrie', court:'PED', aff:null, icon:'', bg:'#EEF8E6', fg:'#3B7D0E', cs:null, actif:true, xlLabel:'PEDIATRIE', xlBg:'92D050', xlRows:1, ordre:99, optionnel:true }]);
      rebuildSecteursDerivations(); window._lignesAffichees = new Set();
      window._PLAN_NOTES = { '${mardi}': { int: ['am'], info: 'ortho 2 salles' } }; renderWeek();`);
    const lignes = () => [...d.querySelectorAll('#planTable tr.sector-row .sector-name-text')].map(e => e.firstChild.textContent.trim());
    V('pédiatrie sans personne : pas de ligne dans la grille', !lignes().includes('Pédiatrie'), lignes());
    const btn = [...d.querySelectorAll('#planTable .opt-btn')].find(b => /Pédiatrie/.test(b.textContent));
    V('…mais un bouton « ＋ Pédiatrie » sous les secteurs', !!btn);
    if (btn) btn.click();
    V('« ＋ Pédiatrie » affiche la ligne pour la semaine', lignes().includes('Pédiatrie'), lignes());
    const trP = [...d.querySelectorAll('#planTable tr.sector-row')].find(r => /Pédiatrie/.test(r.textContent));
    V('…sans aucune case orange (elle n\'est jamais obligatoire)', trP && !trP.querySelector('.slot-flash'));
    const trR = [...d.querySelectorAll('#planTable tr.sector-row')].find(r => /Réanimation/.test(r.textContent));
    const cR = trR ? trR.querySelectorAll('td')[2] : null;   // colonne du mardi
    const sl = cR ? cR.querySelectorAll('.slot') : [];
    V('interne : pastille INT dans la réa du mardi matin', sl[0] && !!sl[0].querySelector('.slot-int'));
    V('…et « ＋ INT » proposé l\'après-midi', sl[1] && !sl[1].querySelector('.slot-int') && !!sl[1].querySelector('.slot-int-add'));
    const th = d.querySelectorAll('#planTable thead th')[2];
    V('infos du mardi : « ℹ Infos » dans l\'en-tête, le texte au survol', th && th.querySelector('.jinfo.on') && th.querySelector('.jinfo.on').getAttribute('title') === 'ortho 2 salles');
    const th3 = d.querySelectorAll('#planTable thead th')[3];
    V('mercredi sans info : seulement le crayon discret', th3 && th3.querySelector('.jinfo') && !th3.querySelector('.jinfo.on'));
    // Le serveur du banc refuse l'écriture : l'écran revient en arrière et le dit.
    await w.eval(`basculerInterne('${mardi}', 'pm')`);
    await dodo(100);
    const sl2 = [...d.querySelectorAll('#planTable tr.sector-row')].find(r => /Réanimation/.test(r.textContent)).querySelectorAll('td')[2].querySelectorAll('.slot');
    V('écriture refusée par le serveur : la pastille de l\'après-midi est retirée', !sl2[1].querySelector('.slot-int'));
    w.eval(`SECTEURS_CFG = SECTEURS_CFG.filter(x => x.code !== 'PED'); rebuildSecteursDerivations(); window._PLAN_NOTES = {}; renderWeek();`);
  }

  console.log('\n═══ 18 quater. (20/11/2026) Consultation au nom du secteur, sans nom ═══');
  {
    /* Une consultation requise « à pourvoir » est mise au nom du secteur : la case affiche le
       secteur, elle n'est plus à pourvoir, et la tuile compte une case de moins. */
    /* Le monde du banc n'a pas de modèle de consultations : on en pose un (viscéral requis le mardi après-midi). */
    w.eval(`window.__csSauve = { t: CS_TYPES, r: CS_REQUIRED }; CS_TYPES = [{ code:'CS-VIS', label:'CS Viscéral', ouvrable:true }];
      CS_REQUIRED = JSON.parse(JSON.stringify(CS_REQUIRED || {})); CS_REQUIRED[1] = { am: {}, pm: { 'CS-VIS': 1 } }; renderWeek();`);
    /* (20/11/2026) Zone des consultations repliée de base : le bandeau compte les placées, un clic déplie. */
    V('repliée de base : aucune ligne de consultation affichée', d.querySelectorAll('#planTable .cs-sub-row').length === 0);
    const bandeau = d.querySelector('#planTable .cs-repli');
    V('…le bandeau compte les consultations placées (0) et se déplie au clic', !!bandeau && /0 placée/.test(bandeau.textContent) && !/pourvoir/.test(bandeau.textContent) && /▸/.test(bandeau.textContent), bandeau && bandeau.textContent.trim().slice(0, 80));
    if (bandeau) { bandeau.click(); await dodo(100); }
    V('…dépliée : les lignes apparaissent, la flèche tourne', d.querySelectorAll('#planTable .cs-sub-row').length === 1 && /▾/.test((d.querySelector('#planTable .cs-repli') || {}).textContent || ''));
    const csAp = [...d.querySelectorAll('#planTable .cs-ouvrir')].filter(e => /openSidePanel\('CS-VIS','[^']+','[^']*','pm'\)/.test(e.getAttribute('onclick') || ''));
    V('pas de « à pourvoir » : la consultation se pose par « + ouvrir »', csAp.length >= 1 && !d.querySelector('#planTable .cs-apourvoir'), csAp.length);
    if (csAp.length) {
      const m = (csAp[0].getAttribute('onclick') || '').match(/openSidePanel\('([^']+)','([^']+)','([^']*)','(am|pm)'\)/);
      csAp[0].click(); await dodo(200);
      const b = d.querySelector('#pspSub .psp-secteur');
      V('le panneau de la consultation propose « … sans nom »', !!b && /sans nom/.test(b.textContent), b && b.textContent);
      if (b && m) {
        w.eval(`window._PLAN_NOTES = { '${m[2]}': { css: { am: [], pm: [] } } }; window._PLAN_NOTES['${m[2]}'].css['${m[4]}'] = ['${m[1]}']; renderWeek();`);
        const chip = d.querySelector('#planTable .cs-chip.cs-secteur');
        V('la case affiche le nom du secteur', !!chip && chip.textContent.length > 1, chip && chip.textContent);
        V('…et le bandeau la compte (1 placée)', /1 placée/.test((d.querySelector('#planTable .cs-repli') || {}).textContent || ''));
      }
    }
    w.eval(`window._PLAN_NOTES = {}; CS_TYPES = window.__csSauve.t; CS_REQUIRED = window.__csSauve.r; window._csOuvert = false; closeSidePanel(); renderWeek();`);
    V('replier à nouveau : un clic referme la zone', (() => { const b = d.querySelector('#planTable .cs-repli'); if (!b) return true; b.click(); const n1 = d.querySelectorAll('#planTable .cs-sub-row').length; d.querySelector('#planTable .cs-repli').click(); return n1 > 0 && d.querySelectorAll('#planTable .cs-sub-row').length === 0; })());
  }

  console.log('\n═══ 18 quinquies. (20/11/2026) Case de bloc aidée par un autre secteur, sans nom ═══');
  {
    /* Comme « ORL » dans la ligne viscéral de l'Excel papier : depuis le panneau d'une case de bloc,
       « Aide sans nom » pose l'abrégé du secteur dans la case, sans affecter personne. */
    w.eval(`window._PLAN_NOTES = {}; renderWeek();`);
    const plus = [...d.querySelectorAll('#planTable tr.sector-row:not(.cs-sub-row) .slot-add')]
      .filter(e => /openSidePanel\('VIS','[^']+','[^']*','pm'\)/.test(e.getAttribute('onclick') || ''));
    V('une case viscéral d\'après-midi offre son « + »', plus.length > 0, plus.length);
    if (plus.length) {
      const m = (plus[0].getAttribute('onclick') || '').match(/openSidePanel\('([^']+)','([^']+)','([^']*)','(am|pm)'\)/);
      const nPlaces = () => d.querySelectorAll('#planTable .slot-name').length;
      const avant = nPlaces();
      plus[0].click(); await dodo(200);
      const ligne = d.querySelector('#pspSub .psp-aide');
      const bOrl = ligne && [...ligne.querySelectorAll('button')].find(b => b.textContent.trim() === 'ORL');
      V('le panneau propose « Aide sans nom » avec un bouton par autre secteur (pas le viscéral lui-même)', !!ligne && !!bOrl && ![...ligne.querySelectorAll('button')].some(b => b.textContent.trim() === 'VISC'), ligne && ligne.textContent);
      if (bOrl && m) {
        /* Le banc n'a pas de circuit serveur pour les notes : l'enregistrement est simulé comme accepté. */
        w.eval(`window.__apiSauve = api; api = async p => (p && p.action === 'savePlanningNotes') ? { success: true } : window.__apiSauve(p);`);
        bOrl.click(); await dodo(300);
        const td = [...d.querySelectorAll('#planTable .slot-aide')].find(e => /openSidePanel\('VIS','/.test(e.getAttribute('onclick') || '') && (e.getAttribute('onclick') || '').indexOf(m[2]) >= 0);
        V('la case viscéral affiche « ORL » en pointillés', !!td && td.textContent.trim() === 'ORL', td && td.textContent);
        V('…personne n\'est placé pour autant (aucune initiale de plus)', nPlaces() === avant, { avant, apres: nPlaces() });
        V('…la note est posée (type AIDE, paire VIS:ORL)', w.eval(`JSON.stringify(((_notesPlanning()['${m[2]}']||{}).aide||{}).pm||[])`) === '["VIS:ORL"]', w.eval(`JSON.stringify(_notesPlanning()['${m[2]}'])`));
        const b2 = [...d.querySelectorAll('#pspSub .psp-aide button')].find(b => b.textContent.trim() === 'ORL');
        V('…et le bouton ORL du panneau est actif', !!b2 && b2.classList.contains('on'));
        const x = td && td.parentNode.querySelector('.cs-chip-x');
        if (x) { x.click(); await dodo(300); }
        V('la croix retire l\'aide', ![...d.querySelectorAll('#planTable .slot-aide')].some(e => (e.getAttribute('onclick') || '').indexOf(m[2]) >= 0 && /'VIS'/.test(e.getAttribute('onclick') || '')));
      }
    }
    w.eval(`if (window.__apiSauve) { api = window.__apiSauve; window.__apiSauve = null; } window._PLAN_NOTES = {}; closeSidePanel(); renderWeek();`);
  }

  console.log('\n═══ 18 sexies. (26/11/2026) Consultation libérale endo : un MAR en LIB, un autre en consultation normale ═══');
  {
    /* Défaut de production du 26/11 : le planning publié (pas encore à jour) gardait le second MAR en
       consultation libérale. Placé ensuite en consultation normale, il « correspondait » déjà au
       publié (même case CS-END) : son placement local était effacé et l'écran le remettait en LIB. */
    w.eval(`window.__csL = CS_TYPES; CS_TYPES = [{ code:'CS-END', label:'CS Endoscopie', ouvrable:true }]; window._csOuvert = true; renderWeek();`);
    const libT = d.querySelector('#planTable .cs-lib');
    const date = libT && (libT.getAttribute('onclick').match(/'(\d{4}-\d\d-\d\d)'/) || [])[1];
    V('la case libérale du jeudi (ou mardi) après-midi offre son marqueur LIB', !!date, libT && libT.getAttribute('onclick'));
    if (date) {
      /* Deux MAR que le panneau propose ce jour-là. */
      libT.click(); await dodo(300);
      const propos = [...d.querySelectorAll('#dispoCard [onclick^="placeMAR"]')].map(x => (x.getAttribute('onclick').match(/^placeMAR\('([^']+)'/) || [])[1]).filter(Boolean);
      w.eval('closeSidePanel()');
      const [A, B] = propos;
      /* Publié périmé : B en consultation libérale ce jour-là. */
      w.eval(`DATA.months.forEach(mo => { const i = (mo.days || []).findIndex(x => x && x.date === '${date}'); if (i < 0) return;
        mo.doctors.forEach(dc => { if (dc.id === '${B}') { dc.days[i] = Object.assign({}, dc.days[i], { afternoon: 'CS-END', lib: true }); } }); }); renderWeek();`);
      const choisir = async id => { const c = [...d.querySelectorAll('#dispoCard [onclick*="placeMAR"]')].find(x => (x.getAttribute('onclick') || '').startsWith("placeMAR('" + id + "'"));
        if (c) { c.click(); await dodo(250); } return !!c; };
      const puces = () => [...d.querySelectorAll('#planTable .cs-chip')].filter(c => (c.getAttribute('onclick') || '').includes(date));
      const estLib = id => puces().some(c => c.classList.contains('cs-chip-lib') && (c.getAttribute('title') || '').startsWith(id + ' '));
      const estLa = id => puces().some(c => (c.getAttribute('onclick') || '').startsWith("openMarMenu('" + id + "'"));
      /* B d'abord retiré de la libérale (comme le comité : ×), puis A en LIB, puis B en consultation normale. */
      const xB = puces().find(c => c.classList.contains('cs-chip-lib'));
      V('point de départ : B est affiché en consultation libérale (publié périmé)', estLib(B), puces().map(c => c.getAttribute('title')));
      w.eval(`removeOneCs('${B}', '${B}', 'CS-END', '${date}', 'pm')`); await dodo(250);
      const lib2 = d.querySelector('#planTable .cs-lib'); if (lib2) { lib2.click(); await dodo(300); }
      const okA = await choisir(A);
      const ouv = [...d.querySelectorAll('#planTable .cs-ouvrir')].find(e => (e.getAttribute('onclick') || '') === `openSidePanel('CS-END','${date}','CS Endoscopie','pm')`);
      if (ouv) { ouv.click(); await dodo(300); }
      const okB = await choisir(B);
      V('A placé par le marqueur LIB, B par « + ouvrir »', okA && okB && !!ouv, { okA, okB, ouv: !!ouv });
      V('A est en consultation libérale', estLib(A), puces().map(c => c.getAttribute('title')));
      V('B est en consultation NORMALE, plus en libérale (malgré le publié périmé)', estLa(B) && !estLib(B), puces().map(c => (c.classList.contains('cs-chip-lib') ? '[LIB] ' : '') + c.getAttribute('title')));
      w.eval('renderWeek()');
      V('…et le reste après un nouveau rendu de la page', estLa(B) && !estLib(B) && estLib(A));
      const f = w._batchAll();
      V('la file enregistre A avec l\'étiquette LIB et B sans', (f[date + '|' + A] || {}).comment === 'LIB' && (f[date + '|' + B] || {}).comment !== 'LIB', f);
      w.eval(`_batchPending = {}; _localOverrides = {}; _localLib = {}; saveLocalEdits();`);
    }
    w.eval(`CS_TYPES = window.__csL; window._csOuvert = false; closeSidePanel(); renderWeek();`);
  }

  console.log('\n═══ 18 septies. (26/11/2026) Bande de présence de l\'onglet Planning, raccord avec l\'onglet Contrôles ═══');
  {
    /* Même compte que la heatmap des Contrôles : le compte du serveur (_tpMondePresence_), jour par jour. */
    ['../gas/temps_partiel.gs', '../gas/gardes.gs'].forEach(f => { try { vm.runInContext(fs.readFileSync(f, 'utf8'), W.ctx); } catch (e) {} });
    const M = vm.runInContext('_tpMondePresence_(2027)', W.ctx);
    const pg = JSON.parse(w.eval('JSON.stringify(tensionJours())')).filter(j => !j.ferie);
    const ecarts = pg.filter(j => j.n !== M.presents(j.date));
    V('compte local de la page = compte du serveur, tous les jours ouvrés (' + pg.length + ' jours)', pg.length > 240 && !ecarts.length, ecarts.slice(0, 3));
    /* Jour fixe de temps partiel portant une garde : le serveur le retire, la page aussi. */
    const r = w.eval(`(function(){ const m = marsData.find(x => x.actif); const av = m.tpJoursFixes; m.tpJoursFixes = 'MAR';
      _tensionJours = null; const j = tensionJours().find(x => !x.ferie && new Date(x.date + 'T12:00:00').getDay() === 2); const sans = j.n;
      m.tpJoursFixes = av; _tensionJours = null; const avec = tensionJours().find(x => x.date === j.date).n; return JSON.stringify({ sans, avec }); })()`);
    const rr = JSON.parse(r);
    V('jour fixe de temps partiel : le MAR est retiré du compte (comme au serveur)', rr.avec - rr.sans === 1, rr);
    /* Contrôles chargés : leurs chiffres font foi, dans la bande, la tuile et sous chaque jour. */
    const d1 = pg[10].date;
    w.eval(`CTL.charge = true; CTL.an = ADMIN_YEAR; CTL.presence = { '${d1}': { p: 7, rg: 0, ab: {} } }; CTL.vacsc = [['${pg[0].date}', '${pg[4].date}']]; renderWeek();`);
    V('contrôles chargés : leur chiffre remplace le compte local (7 le ' + d1 + ')', w.eval(`tensionJours().find(x => x.date === '${d1}').n`) === 7);
    const cel = d.querySelector('#tensionGrid i[onclick*="' + d1 + '"]');
    V('…et la case de la bande le montre, en rouge (moins de seuil − 1)', !!cel && /var\(--h0\)/.test(cel.getAttribute('style') || '') && /7 postables/.test(cel.getAttribute('title') || ''), cel && cel.outerHTML);
    /* Même thème : fond sombre, 52 semaines × 5 jours, quatre couleurs, trait des vacances scolaires. */
    V('52 semaines × 5 jours, comme la heatmap des Contrôles', d.querySelectorAll('#tensionGrid i').length === 260, d.querySelectorAll('#tensionGrid i').length);
    const leg = [...d.querySelectorAll('#tensionLegend span')].map(x => x.textContent.trim());
    V('légende : les quatre couleurs des Contrôles, et les vacances scolaires', leg.length === 5 && /moins de/.test(leg[0]) && /et plus/.test(leg[3]) && /vacances scolaires/.test(leg[4]), leg);
    V('trait bleu des vacances scolaires sous les mois', d.querySelectorAll('#tensionVs i.on').length >= 1);
    V('le résumé compte les jours tendus et donne le plus bas', /jours? tendus? \(moins de \d+ postables\).*plus bas : 7/.test((d.getElementById('tensionSum') || {}).textContent || ''), (d.getElementById('tensionSum') || {}).textContent);
    V('un clic sur un jour ouvre sa semaine', (() => { w.eval('window.scrollTo = function () {}'); cel && cel.click(); return w.eval('getAllWeeks()[currentWeekIdx].lundi') === w.eval(`_lundiDe('${d1}')`); })());
    w.eval(`CTL.charge = false; CTL.presence = {}; CTL.vacsc = []; currentWeekIdx = 0; renderWeek();`);
  }

  console.log('\n═══ 19. Je place des MAR (le « + » de chaque case) ═══');
  /* (20/11/2026) Plus de cases « à pourvoir » : on ajoute par le « + » gris de la case. */
  const flashes = [...d.querySelectorAll('#planTable tr.sector-row:not(.cs-sub-row) .slot-add')];
  V('chaque case de secteur offre son « + »', flashes.length > 0, flashes.length + ' cases');
  console.log('    [diag] étage 2 :', w.eval('!!(_ETAGE2 && _ETAGE2.gardes)'),
              '| module partagé :', w.eval('typeof calculerDispoJour'),
              '| dispo locale :', w.eval('(function(){try{var r=_dispoLocale("2027-03-02");return r?r.length+" MAR":"null"}catch(e){return "err:"+e.message}})()'),
              '| affectations vues :', w.eval('_ETAGE2 ? Object.keys(_ETAGE2.affectations||{}).length : 0'),
              '| codes du 02/03 :', w.eval('_ETAGE2 && _ETAGE2.gardes ? Object.keys(_ETAGE2.gardes["2027-03-02"]||{}).length : -1'),
              '| actifs :', w.eval('_ETAGE2 ? (_ETAGE2.actifs||[]).length : 0'));
  let places = 0;
  if (flashes[0]) {
    flashes[0].click(); await dodo(400);
    const pan = d.getElementById('dispoCard');
    console.log('    [diag] panneau :', pan ? pan.id || pan.className : 'introuvable',
                '| contenu :', pan ? pan.textContent.replace(/\s+/g,' ').trim().slice(0,110) : '-');
    const cands = pan ? [...pan.querySelectorAll('[onclick]')] : [];
    console.log('    [diag] éléments cliquables :', cands.length, '| exemples :',
      cands.slice(0, 6).map(c => (c.tagName + '.' + (c.className || '') + ' → ' + (c.getAttribute('onclick') || '').slice(0, 42))).join(' ⋅ '));
  }
  for (const f of flashes.slice(0, 3)) {
    f.click(); await dodo(200);
    const panneau = d.getElementById('dispoCard');
    const candidats = panneau ? [...panneau.querySelectorAll('[onclick*="placeMAR"], .dispo-item, button')] : [];
    const choix = candidats.find(c => /placeMAR/.test(c.getAttribute('onclick') || ''));
    if (choix) { choix.click(); await dodo(200); places++; }
  }
  V('le panneau s\'ouvre et propose des MAR', places > 0, places + ' placement(s) faits');
  const enAttente = Object.keys(w._batchAll()).length;
  V('les placements entrent dans la file de la page', enAttente > 0, enAttente);

  console.log('\n═══ 20. Je publie, puis je ferme la page ═══');
  const via = await w._publierCombine(2027);
  V('la publication part par le journal Cloudflare', via === 'journal', via);
  V('la page ne garde plus rien en attente', Object.keys(w._batchAll()).length === 0, w._batchAll());
  const fiches = [...M.keys()].filter(k => k.startsWith('j_'));
  V('les intentions sont déposées et durables', fiches.length >= 1, fiches.length + ' fiche(s)');
  const ECRITURES = ['savePlanningOverridesBatch', 'publishPlanning', 'setDailyStatus', 'deleteOverride'];
  V('AUCUNE écriture n\'est passée par Apps Script',
    !appelsDetail.some(a => ECRITURES.includes(a)), appelsDetail);
  console.log('    [diag] appels serveur du parcours :', appelsDetail.join(', '));

  // « Je ferme la page » : le serveur applique seul
  const transport = (url, opt) => {
    const corps = JSON.parse(opt.payload);
    if (corps.token !== 'JETON') return { getResponseCode: () => 403, getContentText: () => '{"success":false}' };
    if (url.endsWith('/tirer')) {
      const l = [...M.keys()].filter(k => k.startsWith('j_')).sort().map(cle => ({ cle, valeur: JSON.parse(M.get(cle)) }));
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, fiches: l }) };
    }
    if (url.endsWith('/purger')) {
      /* Même effet que la route réelle du Worker (couverte par banc_worker.mjs) :
         la fiche quitte la file et entre au registre d'audit. */
      (corps.resultats || []).forEach(r => {
        const v = M.get(r.cle);
        if (v) { const f = JSON.parse(v); f.ok = r.ok; f.detail = r.detail; f.applique = new Date().toISOString();
                 M.set('jfait_' + r.cle.slice(2), JSON.stringify(f)); M.delete(r.cle); }
      });
      return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
    }
    return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
  };
  W.ctx.UrlFetchApp = { fetch: transport };
  W.ctx._miroirNoterPoussee_ = () => {};
  W.ctx.logAction = () => {};              // vit dans Indispos.gs, absent du monde chargé ici
  vm.runInContext('var MIROIR_URL = "https://worker";', W.ctx);   // constante de miroir.gs, non chargé ici
  const { VERROUS } = require('./stubs');
  VERROUS.script = false; VERROUS.document = false;
  [['../gas/journal.gs', ['_journalEcrireLots_','journalAppliquer','_journalJeton_','_journalRafraichirMail_']],
   ['../gas/Indispos.gs', ['retirerPlacementsPourDates','appliquerStatutJour']]]
    .forEach(([f, ns]) => ns.forEach(n => { try { vm.runInContext(require('./stubs').extraireFonction(f, n), W.ctx); } catch (e) {} }));
  const avant = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  W.ctx.__diag = (m) => console.log('    [applicateur]', m);
  try {
    vm.runInContext(`
      (function(){
        var t = _journalJeton_();
        var rep = UrlFetchApp.fetch(MIROIR_URL + '/tirer', {method:'post', contentType:'application/json', payload: JSON.stringify({token:t}), muteHttpExceptions:true});
        __diag('tirer → HTTP ' + rep.getResponseCode() + ' · ' + rep.getContentText().slice(0,80));
      })();`, W.ctx);
  } catch (e) { console.log('    [applicateur] échec du tirage :', e.message); }
  try { vm.runInContext('journalAppliquer()', W.ctx); }
  catch (e) { console.log('    [applicateur] exception :', e.message); }
  const apres = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.length;
  V('APRÈS FERMETURE : les placements sont au classeur', apres > avant, { avant, apres });
  V('la file du journal est vidée', [...M.keys()].filter(k => k.startsWith('j_')).length === 0);
  V('le registre d\'audit conserve la trace', [...M.keys()].some(k => k.startsWith('jfait_')));

  console.log('\n═══ 21. Un statut posé retire le placement (cas SERVANT) ═══');
  {
    const ovs0 = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1);
    const cible = ovs0[0];
    if (cible) {
      const r = vm.runInContext(`appliquerStatutJour(2027, ${JSON.stringify(cible[1])}, 'TP', ${JSON.stringify([dstr(cible[0])])})`, W.ctx);
      V('le statut TP est posé sur le MAR placé', r.applied.length === 1, r);
      V('son placement de ce jour a disparu tout seul',
        !W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.some(l => dstr(l[0]) === dstr(cible[0]) && l[1] === cible[1]),
        { date: cible[0], mar: cible[1] });
      const moisTP = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
      const mTP = moisTP.find(m => m.id === String(cible[0]).slice(0, 7));
      const dTP = mTP && mTP.doctors.find(x => x.id === cible[1]);
      const iTP = mTP && mTP.days.findIndex(j => j.date === cible[0]);
      V('le planning régénéré ne le montre plus dans ce secteur',
        !(dTP && iTP >= 0 && dTP.days[iTP].morning === cible[2]), dTP && iTP >= 0 ? dTP.days[iTP] : null);
    }
  }

  console.log('\n═══ 22. Le planning republié reflète les placements ═══');
  const moisApres = vm.runInContext('generatePlanningFromGardes(2027)', W.ctx);
  const ovs = W.cl.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1);
  const un = ovs[0];
  if (un) {
    const moisCible = moisApres.find(m => m.id === dstr(un[0]).slice(0, 7));
    const doc = moisCible && moisCible.doctors.find(x => x.id === un[1]);
    const jourIdx = moisCible && moisCible.days.findIndex(j => j.date === dstr(un[0]));
    const cellule = doc && jourIdx >= 0 ? doc.days[jourIdx] : null;
    V('le placement apparaît dans le planning régénéré',
      !!cellule && (cellule.morning === un[2] || cellule.afternoon === un[3]), { attendu: un.slice(0,4), obtenu: cellule });
  }

  console.log('\n═══ 23. La pastille mail survit au repli des 6 secondes (défaut du 07/08) ═══');
  /* Défaut trouvé en production le 07/08/2026 : le boot miroir affichait la
     pastille (mail_nonlus du miroir, ici 3) puis posait mailNonLus:null dans
     l'objet de boot ; le repli `setTimeout(majCompteurMail, 6000)` partait
     donc SANS valeur et, depuis la v1.25, un appel sans valeur CACHE la
     pastille. Symptôme : visible à l'ouverture, disparue 6 s plus tard.
     Corrigé en v1.28.1 (le boot transmet le nombre du miroir). Ce scénario
     doit s'exécuter STRICTEMENT APRÈS le déclenchement du repli. */
  const resteAvantRepli = 7000 - (Date.now() - tClic);
  if (resteAvantRepli > 0) await dodo(resteAvantRepli);
  const dot = d.getElementById('mailDot');
  V('la pastille existe dans la page', !!dot);
  V('elle affiche le compte du miroir (3)', dot && dot.textContent.trim() === '3', dot && dot.textContent);
  V('elle est TOUJOURS visible après le repli des 6 s', dot && dot.style.display === 'block', dot && dot.style.display);

  console.log('\n═══ 24. Lire un message décrémente la pastille (v1.28.2) ═══');
  /* Avant v1.28.2, le gestionnaire de lecture appelait majCompteurMail() SANS
     valeur, ce qui CACHAIT la pastille (7 non-lus, 1 lu → plus rien d'affiché).
     Désormais il appelle decrementerCompteurMail() : décrément local, sans
     réseau. On exerce la vraie fonction de la page. */
  V('la fonction de décrément existe dans la page', w.eval('typeof decrementerCompteurMail') === 'function');
  V('le gestionnaire de lecture l\'utilise (plus d\'appel sans valeur)',
    /r\.marque\)\s*\{[^}]*decrementerCompteurMail\(\)/.test(fs.readFileSync('../admin.html','utf8')));
  w.eval('decrementerCompteurMail()');
  await dodo(50);
  V('3 non-lus, 1 lu → la pastille affiche 2', dot && dot.textContent.trim() === '2' && dot.style.display === 'block', dot && dot.textContent);
  w.eval('decrementerCompteurMail(); decrementerCompteurMail();');
  await dodo(50);
  V('0 non-lu → la pastille s\'efface', dot && dot.style.display === 'none', dot && dot.style.display);
  w.eval('decrementerCompteurMail()');
  await dodo(50);
  V('décrémenter sous zéro ne fait rien (pas d\'erreur, pastille éteinte)', dot && dot.style.display === 'none' && erreurs.length === 0, erreurs.slice(0,1));

  console.log('\n═══ 25. La fiche d\'un MAR : l\'adresse saisie reste affichée (défaut du 11/08/2026) ═══');
  /* Défaut trouvé en production le 11/08/2026 : une adresse e-mail ajoutée à un
     MAR était bien écrite dans le classeur, mais la page continuait d'afficher
     « — » dans l'onglet Équipe et « ✕ pas d'email » dans Maintenance. Cause :
     saveMAR relisait la liste avec loadEquipe() SANS force, et loadEquipe rend
     la main immédiatement quand marData est déjà en mémoire (il l'est depuis le
     boot). L'écran réaffichait donc l'instantané d'AVANT l'enregistrement.
     Second effet : Maintenance lit marsData, alimenté au seul boot — même
     l'actualisation d'Équipe ne le rafraîchissait pas.
     Ici on simule le SERVEUR (le classeur) et on pilote la vraie fiche. */
  const SERVEUR_MED = medecinsPage.map(m => ({ ...m, email: '' }));
  const CIBLE = SERVEUR_MED[1].id;
  const fetchAvant = w.fetch;
  let ecritures = 0, lectures = 0;
  w.fetch = async (url, opt) => {
    if (String(url).includes('workers.dev')) return fetchAvant(url, opt);
    let corps = {};
    try { corps = JSON.parse(opt.body); } catch (e) {}
    if (corps.action === 'getMedecins') {
      lectures++;
      return { ok:true, json: async () => ({ success:true, medecins: JSON.parse(JSON.stringify(SERVEUR_MED)) }) };
    }
    if (corps.action === 'saveMedecin') {
      ecritures++;
      const m = corps.medecin || {};
      const l = SERVEUR_MED.find(x => x.id === m.id);
      if (l && m.email !== undefined) l.email = String(m.email).trim();   // même règle que saveMedecin (colonne H écrite telle quelle)
      return { ok:true, json: async () => ({ success:true, created:false, rowsCreated:[] }) };
    }
    return { ok:true, json: async () => ({ success:false, error:'action non simulée : ' + corps.action }) };
  };

  w.eval('showTab("equipe")'); await dodo(300);
  const ligneCible = () => [...d.querySelectorAll('#equipeBody tr')]
    .find(tr => tr.textContent.includes(CIBLE));
  V('l\'onglet Équipe affiche le MAR visé', !!ligneCible(), CIBLE);
  V('il n\'a pas encore d\'adresse', ligneCible() && /—/.test(ligneCible().textContent));

  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  V('la fiche s\'ouvre', d.getElementById('modalMAR').classList.contains('open'));
  d.getElementById('marEmail').value = 'test.banc@exemple.fr';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);

  V('l\'enregistrement est parti au serveur', ecritures === 1, ecritures);
  V('le classeur simulé porte la nouvelle adresse',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'test.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  V('la liste est RELUE au serveur après l\'enregistrement (force)', lectures >= 1, lectures);
  V('l\'onglet Équipe affiche l\'adresse tout de suite',
    !!ligneCible() && ligneCible().textContent.includes('test.banc@exemple.fr'),
    ligneCible() && ligneCible().textContent.replace(/\s+/g,' ').trim().slice(0,120));
  V('la liste interne de la page (marsData) suit aussi',
    w.eval('(marsData.find(function(m){return m.id===' + JSON.stringify(CIBLE) + '})||{}).email') === 'test.banc@exemple.fr',
    w.eval('JSON.stringify((marsData.find(function(m){return m.id===' + JSON.stringify(CIBLE) + '})||{}).email)'));

  /* (01/11/2026) Les deux vérifications « Maintenance » (case cochable, plus de
     « pas d'email ») suivent l'outil sur maintenance.html : banc_maintenance.js. */

  console.log('\n═══ 26. Un champ e-mail vidé ne peut plus effacer l\'adresse en silence ═══');
  /* Le serveur écrit la colonne EMAIL telle qu\'elle arrive : un champ vide
     EFFACE. Tant que l\'écran pouvait montrer une fiche périmée (défaut 25),
     un simple ré-enregistrement suffisait à perdre l\'adresse. Garde-fou :
     on ne demande confirmation QUE pour adresse connue → champ vide. */
  let questions = 0;
  w.confirm = (msg) => { questions++; w.__derniereQuestion = msg; return false; };
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  V('la fiche se rouvre avec l\'adresse enregistrée',
    d.getElementById('marEmail').value === 'test.banc@exemple.fr', d.getElementById('marEmail').value);
  const ecrituresAvant = ecritures;
  d.getElementById('marEmail').value = '';
  d.getElementById('btnSaveMAR').click();
  await dodo(600);
  V('la suppression déclenche une question', questions === 1, questions);
  V('la question nomme le MAR et montre l\'adresse',
    /test\.banc@exemple\.fr/.test(w.__derniereQuestion || ''), (w.__derniereQuestion||'').replace(/\n+/g,' ').slice(0,110));
  V('refusée, RIEN n\'est envoyé au serveur', ecritures === ecrituresAvant, ecritures - ecrituresAvant);
  V('l\'adresse est intacte au classeur',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'test.banc@exemple.fr');

  w.confirm = () => { questions++; return true; };
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marEmail').value = '';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('acceptée, l\'effacement se fait bien', SERVEUR_MED.find(x => x.id === CIBLE).email === '',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  V('l\'écran le reflète immédiatement', !!ligneCible() && /—/.test(ligneCible().textContent),
    ligneCible() && ligneCible().textContent.replace(/\s+/g,' ').trim().slice(0,110));

  questions = 0;
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marEmail').value = 'autre.banc@exemple.fr';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('AJOUTER une adresse ne pose aucune question', questions === 0, questions);
  V('et elle est bien enregistrée', SERVEUR_MED.find(x => x.id === CIBLE).email === 'autre.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);
  questions = 0;
  w.eval('openEditMAR(' + JSON.stringify(CIBLE) + ')'); await dodo(150);
  d.getElementById('marQuotite').value = '80';
  d.getElementById('btnSaveMAR').click();
  await dodo(900);
  V('modifier autre chose que l\'e-mail ne pose aucune question', questions === 0, questions);
  V('et l\'adresse survit à cette modification',
    SERVEUR_MED.find(x => x.id === CIBLE).email === 'autre.banc@exemple.fr',
    SERVEUR_MED.find(x => x.id === CIBLE).email);

  w.fetch = fetchAvant;

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
