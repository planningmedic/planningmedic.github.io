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
  const envois = [], purges = [];
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
   '_act_viderCacheConfig', '_act_getMedecins', '_act_sendCodes', '_act_sendCodesMar']
    .forEach(n => vm.runInContext(extraireFonction(G('equipe.gs'), n), ctx));
  vm.runInContext(corpsDiag || extraireFonction(G('diagnostic.gs'), '_act_diagComplet'), ctx);
  const appel = (nom, user, payload) => {
    const r = ctx['_act_' + nom]({ e: { parameter: {} }, payload: payload || {}, action: nom, code: 'X', user });
    return JSON.parse(r);
  };
  return { ctx, appel, envois, purges };
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

console.log('\n═══ M2. Les cinq actions ═══');
{
  const { appel, envois, purges } = monterServeur(TP);
  for (const a of ['diagComplet', 'viderCacheConfig', 'sendCodes']) {
    const r = appel(a, MOI);
    V(a + ' : le MAR qui a la clé passe', r.success === true, r);
    V(a + ' : le code comité est REFUSÉ', appel(a, COMITE).error === 'Accès refusé');
    V(a + ' : un MAR sans la clé est refusé', appel(a, AUTRE).error === 'Accès refusé');
  }
  V('le vidage du cache a bien été fait (une fois par passage autorisé)', purges.length === 1, purges.length);
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
    if (c.action === 'sendCodesMar') return c.medecin === 'MAR03' ? { success: false, error: 'Envoi échoué pour Dr Trois : quota' } : { success: true, sent: 1 };
    return { success: false, error: 'Action non autorisée pour ce code' };
  };

  console.log('\n═══ M3. La page Maintenance ═══');
  {
    const { d, appels, erreurs } = await monter(serveurMoi, 'MOI');
    V('avec la clé, la page s\'ouvre d\'elle-même (code du portail repris)', !d.getElementById('main').hidden && d.getElementById('authOverlay').style.display === 'none');
    V('la connexion n\'appelle QUE getMedecins', appels.length === 1 && appels[0].action === 'getMedecins' && appels[0].code === 'MOI', appels);
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
