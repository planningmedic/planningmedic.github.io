/* ═══ BANC — PAGE MAINTENANCE RÉSERVÉE (01/11/2026) ═══
   Les outils de l'ancien onglet Maintenance de admin.html (diagnostic, vidage du
   cache, renvoi des codes) quittent l'écran du comité pour maintenance.html,
   ouverte par la tuile cachée `maintenance` (CONFIG / TUILES_PRIVEES).
   Ce banc exécute le VRAI code :
     M1. la porte serveur (_droitMaintenance_) : seul un MAR qui a la clé passe —
         le code comité, un MAR sans la clé, le code paie sont refusés ;
     M2. les cinq actions touchées : diagComplet, viderCacheConfig, sendCodes
         (maintenance seule), getMedecins et sendCodesMar (comité OU maintenance,
         l'assistant d'arrivée d'un MAR en dépend) ; getMedecins dit à la page si
         elle peut s'ouvrir ;
     M3. la page : ouverture avec la clé, refus du code comité sans déconnexion du
         portail, diagnostic rendu, cache, liste des codes, envoi en deux appuis ;
     M4. la tuile du portail et le retrait de l'onglet dans admin.html.
   CONTRE-ÉPREUVES : (a) avec l'ancien contrôle (rôle admin), le code comité
   lancerait le diagnostic ; (b) une ligne TUILES_PRIVEES sans la clé ferme la
   porte au même MAR. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { extraireFonction, socleMedecins } = require('./stubs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const G = f => path.join(__dirname, '..', 'gas', f);
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => t, _t: t }) };

/* ── Le serveur : les VRAIES fonctions, une doublure de classeur ── */
function monterServeur(tuilesPrivees, corpsDiag) {
  const envois = [], purges = [], syncs = [];
  const MED = [
    ['ID', 'NOM', 'INITIALES', 'ACTIF', 'QUOTITE', 'PCT', 'CODE', 'EMAIL'],
    ['MAR01', 'Dr Un', 'M1', 'O', 100, 100, 'CODE01', 'un@exemple.fr'],
    ['MAR02', 'Dr Deux', 'M2', 'O', 100, 100, 'CODE02', ''],
  ];
  const ctx = vm.createContext({ JSON, String, Object, Array, Number, console, ContentService,
    _deny: () => JSON.stringify({ success: false, error: 'Accès refusé' }),
    _error: m => JSON.stringify({ success: false, error: m }),
    _configRows_: () => [['CLE', 'VALEUR'], ['TUILES_PRIVEES', tuilesPrivees]],
    viderCacheConfig: () => { purges.push(1); },
    miroirSyncComplet: () => { syncs.push(1); return { success: true, ecrites: 2, cles: 40 }; },
    Date,
    diagnosticComplet: () => ({ ok: true, results: ['✅ tout va bien'] }),
    _buildMedecins_: () => ({ medecins: [{ id: 'MAR01', nom: 'Dr Un', actif: true, email: 'un@exemple.fr' }] }),
    _quotaEmailInsuffisant_: () => null, _marsAvecEmail_: () => 1,
    _mailCodeAcces_: (nom, code) => ({ subject: 'code', body: code }),
    MailApp: { sendEmail: o => envois.push(o.to) },
    logAction: () => {},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => ({ getDataRange: () => ({ getValues: () => MED }) }) }) },
  });
  ctx._medecinsRows_ = () => MED;
  try { socleMedecins(ctx); } catch (e) {}
  ctx._medecinsRows_ = () => MED;
  ['_tuilesPriveesDe_', '_aDroitTuile_', '_droitMaintenance_',
   '_act_viderCacheConfig', '_act_miroirSyncMaintenant', '_act_getMedecins', '_act_sendCodes', '_act_sendCodesMar']
    .forEach(n => vm.runInContext(extraireFonction(G('equipe.gs'), n), ctx));
  vm.runInContext(corpsDiag || extraireFonction(G('diagnostic.gs'), '_act_diagComplet'), ctx);
  const appel = (nom, user, payload) => {
    const r = ctx['_act_' + nom]({ e: { parameter: {} }, payload: payload || {}, action: nom, code: 'X', user });
    return JSON.parse(r);
  };
  return { ctx, appel, envois, purges, syncs };
}
const MOI = { role: 'mar', id: 'AXE' }, AUTRE = { role: 'mar', id: 'WY' };
const COMITE = { role: 'admin', id: 'ADMIN' }, PAIE = { role: 'paie', id: 'PAIE' };
const TP = 'AXE:crh,stats,maintenance;WY:liberal';

console.log('\n═══ M1. La porte serveur ═══');
{
  const { ctx } = monterServeur(TP);
  V('le MAR qui a la clé `maintenance` passe', ctx._droitMaintenance_(MOI) === true);
  V('le code comité ne passe PAS', ctx._droitMaintenance_(COMITE) === false);
  V('un MAR sans la clé ne passe pas', ctx._droitMaintenance_(AUTRE) === false);
  V('le code paie ne passe pas', ctx._droitMaintenance_(PAIE) === false);
  V('aucun utilisateur : porte fermée', ctx._droitMaintenance_(null) === false);
  const sans = monterServeur('AXE:crh,stats;WY:liberal').ctx;
  V('contre-épreuve (b) : la même ligne SANS la clé ferme la porte au même MAR', sans._droitMaintenance_(MOI) === false);
  const forme = monterServeur('axe : maintenance').ctx;
  V('identifiant en minuscules et espaces : même lecture que la tuile du portail', forme._droitMaintenance_(MOI) === true);
}

console.log('\n═══ M2 bis. Republier le planning (25/11/2026) ═══');
{
  /* Le bouton « Publier » de l'admin exige le code comité ; la page Maintenance
     se connecte avec le code personnel du responsable. Action dédiée, même effet :
     planning refait, mail du secrétariat armé, journal. */
  const { ctx, appel } = monterServeur(TP);
  const faits = [], onglets = new Set(['GARDES_2027']);
  ctx.generatePlanning = y => faits.push('planning ' + y);
  ctx.notifPlanifier = y => faits.push('mail ' + y);
  ctx.logAction = m => faits.push('journal : ' + m);
  ctx.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => onglets.has(n) ? {} : null }) };
  vm.runInContext(extraireFonction(G('equipe.gs'), '_act_republierPlanning'), ctx);
  const r = appel('republierPlanning', MOI, { year: 2027 });
  V('le responsable republie 2027', r.success === true && r.year === 2027 && typeof r.secondes === 'number', r);
  V('…le planning est refait, PUIS le mail du secrétariat est armé, PUIS le journal le note',
    JSON.stringify(faits) === JSON.stringify(['planning 2027', 'mail 2027', 'journal : Planning 2027 republié depuis la page Maintenance']), faits);
  faits.length = 0;
  V('le code comité est REFUSÉ (il a déjà « Publier » dans l\'admin)', appel('republierPlanning', COMITE, { year: 2027 }).error === 'Accès refusé' && faits.length === 0);
  V('un MAR sans la clé est refusé, rien n\'est fait', appel('republierPlanning', AUTRE, { year: 2027 }).error === 'Accès refusé' && faits.length === 0);
  const sans = appel('republierPlanning', MOI, { year: 2028 });
  V('année sans gardes : refus lisible, rien n\'est refait', /ne sont pas encore générées/.test(sans.error || '') && faits.length === 0, sans);
  V('année absente ou absurde : refus', /Année invalide/.test(appel('republierPlanning', MOI, {}).error || '') && /Année invalide/.test(appel('republierPlanning', MOI, { year: 'x' }).error || ''));
  ctx.notifPlanifier = () => { throw new Error('minuteur en panne'); };
  V('un minuteur de mail en panne ne fait pas échouer la publication', appel('republierPlanning', MOI, { year: 2027 }).success === true && faits.indexOf('planning 2027') > -1);
  const idx = require('fs').readFileSync(G('Indispos.gs'), 'utf8');
  V('routeur : rôle maintenance, et sous verrou d\'écriture',
    /"republierPlanning"\s*:\s*\{ role: 'maintenance'\s*, fn: _act_republierPlanning \}/.test(idx) && /'publishPlanning', 'republierPlanning',/.test(idx));
}

console.log('\n═══ M2. Les cinq actions ═══');
{
  const { appel, envois, purges, syncs } = monterServeur(TP);
  for (const a of ['diagComplet', 'viderCacheConfig', 'miroirSyncMaintenant', 'sendCodes']) {
    const r = appel(a, MOI);
    V(a + ' : le MAR qui a la clé passe', r.success === true, r);
    V(a + ' : le code comité est REFUSÉ', appel(a, COMITE).error === 'Accès refusé');
    V(a + ' : un MAR sans la clé est refusé', appel(a, AUTRE).error === 'Accès refusé');
  }
  V('le vidage du cache a bien été fait (une fois par passage autorisé)', purges.length === 1, purges.length);
  V('la synchronisation complète n\'est lancée qu\'une fois, par le seul passage autorisé', syncs.length === 1, syncs.length);
  const rs = appel('miroirSyncMaintenant', MOI);
  V('miroirSyncMaintenant renvoie le bilan chiffré de la synchronisation', rs.success === true && rs.ecrites === 2 && rs.cles === 40 && typeof rs.secondes === 'number', rs);
  const gm = appel('getMedecins', MOI);
  V('getMedecins : le MAR qui a la clé lit la liste, page autorisée', gm.success === true && gm.maintenance === true, gm);
  const gc = appel('getMedecins', COMITE);
  V('getMedecins : le comité lit toujours la liste (onglet Équipe), page NON autorisée', gc.success === true && gc.maintenance === false, gc);
  V('getMedecins : un MAR sans la clé est refusé', appel('getMedecins', AUTRE).error === 'Accès refusé');
  const n0 = envois.length;
  V('sendCodesMar : le comité envoie toujours (fin de l\'assistant d\'arrivée)', appel('sendCodesMar', COMITE, { medecin: 'MAR01' }).success === true);
  V('sendCodesMar : la page Maintenance envoie', appel('sendCodesMar', MOI, { medecin: 'MAR01' }).success === true);
  V('sendCodesMar : un MAR sans la clé est refusé', appel('sendCodesMar', AUTRE, { medecin: 'MAR01' }).error === 'Accès refusé');
  V('sendCodesMar : un MAR sans adresse donne une erreur lisible', /Pas d'email/.test(appel('sendCodesMar', MOI, { medecin: 'MAR02' }).error || ''));
  V('les deux envois autorisés sont partis, et eux seuls', envois.length - n0 === 2, envois.slice(n0));
  /* (a) l'ancien contrôle, remis en place : le comité passerait. */
  const ancien = extraireFonction(G('diagnostic.gs'), '_act_diagComplet').replace(/if \(!_droitMaintenance_\(user\)\) return _deny\(\);/, "if (user.role !== 'admin') return _deny();");
  const av = monterServeur(TP, ancien);
  V('contre-épreuve (a) : avec l\'ancien contrôle, le code comité lancerait le diagnostic', av.appel('diagComplet', COMITE).success === true);
}

/* ═══ M3. La page ═══ */
(async () => {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const HTML = lire('maintenance.html');
  const dodo = ms => new Promise(r => setTimeout(r, ms));
  const MEDS = [
    { id: 'MAR01', nom: 'Dr Un', initiales: 'M1', actif: true, email: 'un@exemple.fr' },
    { id: 'MAR02', nom: 'Dr Deux', initiales: 'M2', actif: true, email: '' },
    { id: 'MAR03', nom: 'Dr Trois', initiales: 'M3', actif: true, email: 'trois@exemple.fr' },
    { id: 'MAR04', nom: 'Dr Parti', initiales: 'M4', actif: false, email: 'parti@exemple.fr' },
  ];
  async function monter(servir, code) {
    const appels = [], erreurs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(HTML, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
      url: 'https://planningmedic.github.io/maintenance.html',
      beforeParse(win) {
        win.fetch = async (u, opt) => {
          if (typeof u === 'string' && u.indexOf('ccam_actes.json') > -1)
            return { ok: true, status: 206, text: async () => '{"version":"V83","effet":"' + new Date().toISOString().slice(0, 10) + '"' };
          const c = JSON.parse(opt.body); appels.push(c);
          return { ok: true, json: async () => servir(c) };
        };
        if (code) try { win.sessionStorage.setItem('pmViewCode', code); } catch (e) {}
      } });
    await dodo(250);
    return { w: dom.window, d: dom.window.document, appels, erreurs };
  }
  const serveurMoi = c => {
    if (c.action === 'getMedecins') return { success: true, medecins: MEDS, maintenance: true };
    if (c.action === 'diagComplet') return { success: true, ok: false, results: ['══ CHAPITRE UN ══', '✅ Réglages lus', '❌ Une erreur', '→ LE GESTE : relancer la tâche', '⚠️ Un avertissement'] };
    if (c.action === 'viderCacheConfig') return { success: true, message: 'Cache de configuration vidé.' };
    if (c.action === 'miroirSyncMaintenant') return { success: true, ecrites: 3, cles: 40, secondes: 12 };
    if (c.action === 'republierPlanning') return c.year === 2099 ? { success: false, error: 'Les gardes 2099 ne sont pas encore générées : rien à publier' } : { success: true, year: c.year, secondes: 9 };
    if (c.action === 'sendCodesMar') return c.medecin === 'MAR03' ? { success: false, error: 'Envoi échoué pour Dr Trois : quota' } : { success: true, sent: 1 };
    return { success: false, error: 'Action non autorisée pour ce code' };
  };

  console.log('\n═══ M3. La page Maintenance ═══');
  {
    const { d, appels, erreurs } = await monter(serveurMoi, 'MOI');
    V('avec la clé, la page s\'ouvre d\'elle-même (code du portail repris)', !d.getElementById('main').hidden && d.getElementById('authOverlay').style.display === 'none');
    /* (15/11/2026) La carte de clôture lit l'année active (lecture seule, sans code requis). */
    V('la connexion appelle getMedecins, puis seulement l\'année active (aucune écriture)', appels[0].action === 'getMedecins' && appels[0].code === 'MOI'
      && appels.every(a => a.action === 'getMedecins' || a.action === 'getActiveYear') && appels.length <= 2, appels.map(a => a.action));
    const lignes = [...d.querySelectorAll('#codesListe label')];
    V('seuls les MARs actifs sont listés (3 sur 4)', lignes.length === 3, lignes.length);
    const m2 = lignes.find(l => l.textContent.includes('M2'));
    V('un MAR sans adresse : case grisée et « pas d\'e-mail »', !!m2 && m2.querySelector('input').disabled && /pas d'e-mail/.test(m2.textContent));
    V('les MARs avec adresse sont cochés par défaut', lignes.filter(l => !l.querySelector('input').disabled).every(l => l.querySelector('input').checked));
    V('le compteur dit « 2 / 2 cochés »', /2 \/ 2 coché/.test(d.getElementById('codesNb').textContent), d.getElementById('codesNb').textContent);
    d.getElementById('btnTout').click();
    V('« Tout décocher » décoche tout', /0 \/ 2/.test(d.getElementById('codesNb').textContent) && d.getElementById('btnTout').textContent === 'Tout cocher');
    d.getElementById('btnTout').click();
    V('« Tout cocher » recoche', /2 \/ 2/.test(d.getElementById('codesNb').textContent));

    /* Envoi : le premier appui arme, rien ne part. */
    const btn = d.getElementById('btnEnvoi');
    btn.click(); await dodo(30);
    V('premier appui : le bouton s\'arme, aucun envoi', btn.classList.contains('arm') && /Confirmer : envoyer à 2 MARs/.test(btn.textContent) && !appels.some(a => a.action === 'sendCodesMar'), btn.textContent);
    btn.click(); await dodo(120);
    const envois = appels.filter(a => a.action === 'sendCodesMar').map(a => a.medecin);
    V('second appui : un envoi par MAR coché, pas le MAR sans adresse', JSON.stringify(envois) === JSON.stringify(['MAR01', 'MAR03']), envois);
    const res = d.getElementById('codesRes').textContent;
    V('le résultat compte les envois et nomme l\'échec', /1 code envoyé/.test(res) && /1 échec/.test(res) && /quota/.test(res), res);

    d.getElementById('btnCache').click(); await dodo(80);
    V('vider le cache : l\'action part et le message s\'affiche', appels.some(a => a.action === 'viderCacheConfig') && /Cache de configuration vidé/.test(d.getElementById('cacheRes').textContent));

    const ordre = [...d.querySelectorAll('section.card')].map(c => c.id);
    V('ordre des cartes voulu (18/11/2026, + republier 25/11) : serveur, diagnostic, mise à jour, republier, récups, clôture, calcul exact des gardes, codes, cache en dernier',
      JSON.stringify(ordre) === JSON.stringify(['cMaj', 'cDiag', 'cSync', 'cRepub', 'cRecups', 'cClot', 'cSolveur', 'cCodes', 'cCache']), ordre);
    d.getElementById('btnSync').click(); await dodo(80);
    V('mettre à jour maintenant : l\'action part avec le code, le résultat chiffré s\'affiche',
      appels.some(a => a.action === 'miroirSyncMaintenant' && a.code === 'MOI') && /Portail à jour \(3 éléments modifiés, 12 s\)/.test(d.getElementById('syncRes').textContent)
      && !d.getElementById('btnSync').disabled, d.getElementById('syncRes').textContent);

    /* (25/11/2026) Republier le planning : deux appuis, l'année choisie part avec le code personnel. */
    const anRep = d.getElementById('repubAn'), anC = new Date().getFullYear();
    V('republier : l\'année en cours par défaut, la suivante au choix', anRep.value === String(anC) && [...anRep.options].map(o => o.value).join(',') === anC + ',' + (anC + 1));
    const br = d.getElementById('btnRepub');
    br.click(); await dodo(30);
    V('republier : premier appui, le bouton s\'arme, rien ne part', br.classList.contains('arm') && new RegExp('Confirmer : republier ' + anC).test(br.textContent) && !appels.some(a => a.action === 'republierPlanning'), br.textContent);
    br.click(); await dodo(100);
    V('republier : second appui, l\'action part avec l\'année et le code personnel',
      appels.some(a => a.action === 'republierPlanning' && a.year === anC && a.code === 'MOI'), appels.filter(a => a.action === 'republierPlanning'));
    V('republier : le résultat dit l\'année, la durée et le délai du mail',
      new RegExp('Planning ' + anC + ' republié \\(9 s\\)').test(d.getElementById('repubRes').textContent) && /environ 10 minutes/.test(d.getElementById('repubRes').textContent) && !br.disabled,
      d.getElementById('repubRes').textContent);
    const o99 = d.createElement('option'); o99.value = '2099'; anRep.appendChild(o99); anRep.value = '2099';
    anRep.dispatchEvent(new d.defaultView.Event('change'));
    V('changer d\'année efface le résultat précédent', d.getElementById('repubRes').textContent === '');
    br.click(); await dodo(30); br.click(); await dodo(100);
    V('republier : le refus du serveur s\'affiche tel quel', /❌ Les gardes 2099 ne sont pas encore générées/.test(d.getElementById('repubRes').textContent), d.getElementById('repubRes').textContent);

    d.getElementById('btnDiag').click(); await dodo(150);
    const out = d.getElementById('diagRes');
    V('diagnostic : le résumé compte 1 erreur et 1 avertissement', /1 erreur\(s\) · ⚠️ 1 avertissement/.test(out.textContent), out.textContent.slice(0, 120));
    V('diagnostic : le chapitre devient un bandeau', !!out.querySelector('.diag-chap') && /CHAPITRE UN/.test(out.querySelector('.diag-chap').textContent));
    V('diagnostic : « → LE GESTE » devient un encadré', !!out.querySelector('.diag-geste') && /relancer la tâche/.test(out.querySelector('.diag-geste').textContent));
    V('diagnostic : la ligne de fraîcheur des tarifs est ajoutée côté page', /Index CCAM \(tarifs\)/.test(out.textContent));
    V('diagnostic : « Copier le rapport » devient disponible', !d.getElementById('btnDiagCopie').disabled);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }
  {
    /* Le code comité : la liste est lisible côté serveur, mais la page reste fermée. */
    const { d, w } = await monter(c => c.action === 'getMedecins' ? { success: true, medecins: MEDS, maintenance: false } : { success: false, error: 'Accès refusé' }, 'COMITE');
    V('code comité : la page reste fermée', d.getElementById('main').hidden && d.getElementById('authOverlay').style.display !== 'none');
    V('code comité : message « réservée au responsable technique »', /réservée au responsable technique/.test(d.getElementById('authErr').textContent), d.getElementById('authErr').textContent);
    V('code comité : la liste de l\'équipe n\'est pas affichée', !d.querySelector('#codesListe label'));
    V('le code n\'est PAS oublié (sinon déconnecté du reste du portail)', w.sessionStorage.getItem('pmViewCode') === 'COMITE');
  }
  {
    const { d, w } = await monter(() => ({ success: false, error: 'Accès refusé' }), 'AUTRE');
    V('MAR sans la clé : page fermée, même message, code gardé', d.getElementById('main').hidden
      && /réservée/.test(d.getElementById('authErr').textContent) && w.sessionStorage.getItem('pmViewCode') === 'AUTRE');
  }
  {
    const { d, w } = await monter(() => ({ success: false, error: 'Code invalide' }), 'PERIME');
    V('code périmé : oublié, et dit tel quel', w.sessionStorage.getItem('pmViewCode') === null && /Code invalide/.test(d.getElementById('authErr').textContent));
  }
  {
    const { d, appels } = await monter(serveurMoi, null);
    V('sans code mémorisé : l\'écran de connexion attend, aucun appel', d.getElementById('main').hidden && appels.length === 0);
    d.getElementById('authInput').value = 'moi';
    d.getElementById('authBtn').click(); await dodo(120);
    V('le code tapé en minuscules est envoyé en majuscules et ouvre la page', appels[0] && appels[0].code === 'MOI' && !d.getElementById('main').hidden);
  }

  console.log('\n═══ M5. La clôture d\'année (15/11/2026) ═══');
  {
    const ctrl = (peut) => [{ niveau: 'bloquant', texte: 'Clôture refusée : l\'année 2027 n\'a pas encore commencé.' }].filter(() => !peut)
      .concat([{ niveau: 'ok', texte: 'Année 2027 préparée et générée' }, { niveau: 'info', texte: 'Onglets qui partiront à l\'archive : GARDES_2026' }]);
    const bilan = { mars: [{ id: 'MAR03', total: 60, weekends: 9, feries: 1, noelAn: 1 }, { id: 'MAR01', total: 58, weekends: 10, feries: 2, noelAn: 0 }],
                    fetes: { '2026-12-24': ['MAR03'], '2026-12-25': ['MAR01'], '2026-12-31': [], '2027-01-01': ['MAR03'] } };
    let peut = false, panne = false;
    const serv = c => {
      if (c.action === 'getActiveYear') return { success: true, year: 2026 };
      if (c.action === 'clotureVerifier') return { success: true, year: 2026, peutClore: peut, faite: false, controles: ctrl(peut), bilan };
      if (c.action === 'cloturerAnnee') { if (panne) throw new Error('délai dépassé'); return { success: true, year: 2026, etapes: [{ nom: 'Copie de sécurité du classeur', etat: 'fait' }, { nom: 'Année active → 2027', etat: 'fait' }], apres: [{ niveau: 'ok', texte: 'Année active : 2027' }] }; }
      return serveurMoi(c);
    };
    const servPanne = c => { if (c.action === 'cloturerAnnee' && panne) return Promise.reject(new Error('délai dépassé')); return serv(c); };
    const { d, appels, erreurs } = await monter(c => servPanne(c), 'MOI');
    await dodo(60);
    const etat = d.getElementById('clotEtat').textContent;
    V('la carte dit l\'année active et quand clôturer', /Année active : 2026/.test(etat) && (/possible à partir du lundi 4 janvier 2027/.test(etat) || /clôture à faire/.test(etat)), etat);
    V('le bouton porte l\'année : « Clôturer 2026 », grisé avant toute répétition', d.getElementById('btnClot').textContent === 'Clôturer 2026' && d.getElementById('btnClot').disabled);

    d.getElementById('btnClotRep').click(); await dodo(120);
    const out = d.getElementById('clotRes');
    V('répétition : ⛔ annoncé, la clôture reste grisée', /1 point bloque la clôture/.test(out.textContent) && d.getElementById('btnClot').disabled, out.textContent.slice(0, 120));
    V('répétition : les pastilles sont affichées', out.querySelectorAll('.pas').length === 3 && !!out.querySelector('.pas.bloq'));
    const trs = [...out.querySelectorAll('.bil tr')].slice(1).map(tr => tr.textContent);
    V('bilan : une ligne par MAR, avec ses INITIALES, triées', trs.length === 2 && /^M1/.test(trs[0]) && /^M3/.test(trs[1]) && !/MAR0/.test(out.querySelector('.bil').textContent), trs);
    V('bilan : qui était de garde les jours de fêtes', /24\/12\/2026\s*M3/.test(out.querySelector('.fetes').textContent) && /31\/12\/2026\s*—/.test(out.querySelector('.fetes').textContent), out.querySelector('.fetes').textContent);
    V('répétition : rien d\'écrit (aucun appel de clôture)', !appels.some(a => a.action === 'cloturerAnnee'));

    peut = true;
    d.getElementById('btnClotRep').click(); await dodo(120);
    V('tout au vert : « Tout est prêt » et le bouton s\'allume', /Tout est prêt/.test(out.textContent) && !d.getElementById('btnClot').disabled);
    const b = d.getElementById('btnClot');
    b.click(); await dodo(30);
    V('premier appui : le bouton s\'arme, rien ne part', b.classList.contains('arm') && /Confirmer : clôturer 2026/.test(b.textContent) && !appels.some(a => a.action === 'cloturerAnnee'), b.textContent);
    b.click(); await dodo(150);
    const cl = appels.filter(a => a.action === 'cloturerAnnee');
    V('second appui : UNE clôture part, pour 2026, avec le code personnel', cl.length === 1 && cl[0].year === 2026 && cl[0].code === 'MOI', cl);
    V('résultat : « 2026 clôturée », les étapes et le contrôle d\'après', /2026 clôturée/.test(out.textContent) && /Copie de sécurité du classeur/.test(out.textContent) && /Contrôle d'après/.test(out.textContent), out.textContent.slice(0, 160));
    V('après la clôture, le bouton reste grisé (relancer la répétition d\'abord)', b.disabled);

    panne = true;
    d.getElementById('btnClotRep').click(); await dodo(120);
    b.click(); await dodo(20); b.click(); await dodo(150);
    V('réponse perdue : message clair, « relancez la répétition », sans risque', /La réponse n'est pas arrivée/.test(out.textContent) && /relancez la répétition/.test(out.textContent), out.textContent.slice(0, 200));
    V('réponse perdue : la clôture n\'est JAMAIS renvoyée automatiquement', appels.filter(a => a.action === 'cloturerAnnee').length === 2);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }
  {
    const adm = lire('admin.html');
    V('admin.html n\'a plus d\'assistant de clôture', !/function openWizardCloture/.test(adm) && !/id="wizardClotureOverlay"/.test(adm));
    V('admin.html n\'appelle plus aucune action de clôture', !/action: ?'(archiveYear|cloturerAnnee|clotureVerifier|setActiveYear|clearIndisposYear)'/.test(adm));
    /* (20/11/2026) Les 3 cartes annuelles ont quitté l'admin : elles vivent dans le groupe replié de Maintenance. */
    V('admin.html n\'a plus de cartes « Opérations annuelles »', !/class="annual-ops-section"/.test(adm) && !/onclick="openWizard\(\)"/.test(adm) && !/onclick="openWizardGardes\(\)"/.test(adm));
    const mt = lire('maintenance.html');
    V('Maintenance : un groupe replié « Opérations annuelles » contient les 3 étapes', /<details class="card grp" id="cAnnuel">/.test(mt) && !/<details class="card grp" id="cAnnuel" open/.test(mt)
      && mt.indexOf('id="lienW1" href="admin.html?wizard=1"') > mt.indexOf('id="cAnnuel"') && mt.indexOf('id="lienW2" href="admin.html?wizard=gardes"') > 0
      && mt.indexOf('id="cClot"') > mt.indexOf('id="cAnnuel"') && mt.indexOf('id="cClot"') < mt.indexOf('</details>', mt.indexOf('id="cAnnuel"')));
    V('les liens restent dans le même onglet (le code personnel y est gardé)', !/id="lienW[12]"[^>]*target=/.test(mt));
    V('le bandeau de janvier ne propose plus de bouton de clôture', !/cb-btn" onclick="openWizardCloture/.test(adm) && /à faire depuis la page Maintenance/.test(adm));
    V('aucune autre page n\'appelle la clôture', ['index.html', 'planning.html', 'indispos.html', 'paie.html', 'dashboard.html', 'staff.html'].every(f => !/'(cloturerAnnee|archiveYear|clotureVerifier)'/.test(lire(f))));
  }

  console.log('\n═══ M4. La tuile et l\'écran du comité ═══');
  {
    const idx = lire('index.html');
    const t = (idx.match(/\{ key:'maintenance'[^\n]*\}/) || [''])[0];
    V('la tuile `maintenance` existe dans le portail', !!t, t.slice(0, 80));
    V('elle est RÉSERVÉE (prive:true) et rangée dans le bloc Réservé', /prive:true/.test(t) && /bloc:'reserve'/.test(t));
    V('elle ouvre maintenance.html', /href:'maintenance\.html'/.test(t));
    const ico = (t.match(/icon:'([a-z0-9-]+)'/) || [])[1];
    V('son icône existe dans le paquet local', !!ico && lire('assets/vendor/lucide-icons.js').indexOf('"' + ico + '":[') > -1, ico);
    const adm = lire('admin.html');
    V('admin.html n\'a plus d\'onglet Maintenance', !/showTab\('maintenance'\)/.test(adm) && !/id="panel-maintenance"/.test(adm));
    V('admin.html n\'appelle plus diagComplet ni viderCacheConfig', !/action: ?'diagComplet'/.test(adm) && !/action: ?'viderCacheConfig'/.test(adm));
    V('admin.html garde l\'envoi du code en fin d\'assistant d\'arrivée', /action:'sendCodesMar'/.test(adm));
    V('aucune page n\'appelle diagComplet hormis maintenance.html',
      ['index.html', 'planning.html', 'indispos.html', 'paie.html', 'absences.html'].every(f => !/'diagComplet'/.test(lire(f))));
  }

  console.log('\n' + ok + ' OK · ' + ko + ' en échec');
  if (ko) process.exit(1);
})();
