/* ═══ BANC — Opérations annuelles réservées au responsable (20/11/2026, v1.97.0) ═══
   Démarrer l'année (initYear, setIndisposYear), générer les gardes
   (generateGardes) et envoyer le récapitulatif des gardes à tous les MAR
   (envoyerRecapIndispos) : une erreur y coûte très cher. Le code comité ne
   suffit plus ; la requête doit porter, dans codeResponsable, le code personnel
   d'un MAR qui a la clé `maintenance`.
     A1. la porte (_droitResponsable_) : vraie fonction, vrais _droitMaintenance_ ;
     A2. les 4 actions refusent le comité seul AVANT de toucher au classeur, et
         laissent passer le responsable ; contre-épreuve : sans la ligne de
         porte, le refus disparaît (le test sait voir la différence) ;
     A3. publishPlanning (geste quotidien du comité) n'est PAS concerné ;
     A4. la page admin : le code personnel part avec ces 4 actions seulement ;
         sans lui, les assistants ne s'ouvrent pas ; plus de cartes annuelles ;
     A5. la page Maintenance : groupe replié, 3 étapes, même onglet. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { extraireFonction } = require('./stubs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const G = f => path.join(__dirname, '..', 'gas', f);
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const CODES = { RESP: { role: 'mar', id: 'AXE' }, AUTRE: { role: 'mar', id: 'WY' }, COMITE: { role: 'admin', id: 'ADMIN' }, PAIE: { role: 'paie', id: 'PAIE' } };
const TOUCHE = 'CLASSEUR_TOUCHE';

function monter(sourceRemplacee) {
  const ctx = vm.createContext({ JSON, String, Object, Array, Number, Error, Date, console,
    _deny: () => JSON.stringify({ success: false, error: 'Accès refusé' }),
    _error: m => JSON.stringify({ success: false, error: m }),
    _configRows_: () => [['CLE', 'VALEUR'], ['TUILES_PRIVEES', 'AXE:crh,maintenance;WY:liberal']],
    checkCode: c => { if (c === 'BOUM') throw new Error('classeur illisible'); return CODES[c] || null; },
    SpreadsheetApp: { getActiveSpreadsheet: () => { throw new Error(TOUCHE); } },
    _quotaEmailInsuffisant_: () => { throw new Error(TOUCHE); }, _marsAvecEmail_: () => [],
    logAction: () => {}, TEST_YEAR: 2027,
  });
  ['_tuilesPriveesDe_', '_aDroitTuile_', '_droitMaintenance_', '_droitResponsable_']
    .forEach(n => vm.runInContext(extraireFonction(G('equipe.gs'), n), ctx));
  const src = fs.readFileSync(G('equipe.gs'), 'utf8');
  const m = src.match(/const MSG_RESPONSABLE_ = '[^']*';/);
  vm.runInContext(m[0].replace('const ', 'var '), ctx);
  const actions = { initYear: 'Indispos.gs', generateGardes: 'gardes.gs', setIndisposYear: 'indisponibilites.gs', envoyerRecapIndispos: 'indisponibilites.gs', publishPlanning: 'gardes.gs' };
  Object.entries(actions).forEach(([a, f]) => {
    let s = extraireFonction(G(f), '_act_' + a);
    if (sourceRemplacee) s = sourceRemplacee(a, s);
    vm.runInContext(s, ctx);
  });
  const appel = (a, user, payload) => {
    try { return JSON.parse(ctx['_act_' + a]({ e: { parameter: {} }, payload: Object.assign({ year: 2027 }, payload || {}), action: a, code: 'X', user })); }
    catch (e) { return { exception: String(e.message || e) }; }
  };
  return { ctx, appel };
}

const { ctx, appel } = monter();
const MSG = ctx.MSG_RESPONSABLE_;

console.log('\n═══ A1. La porte du responsable ═══');
V('le message parle au comité en clair (page Maintenance)', /responsable/.test(MSG) && /Maintenance/.test(MSG), MSG);
V('le code personnel du responsable (clé maintenance) ouvre', ctx._droitResponsable_({ codeResponsable: 'RESP' }) === true);
V('le code comité seul n\'ouvre pas', ctx._droitResponsable_({ codeResponsable: 'COMITE' }) === false);
V('un MAR sans la clé n\'ouvre pas', ctx._droitResponsable_({ codeResponsable: 'AUTRE' }) === false);
V('le code paie n\'ouvre pas', ctx._droitResponsable_({ codeResponsable: 'PAIE' }) === false);
V('code absent, vide ou inconnu : fermé', ctx._droitResponsable_({}) === false && ctx._droitResponsable_({ codeResponsable: '' }) === false && ctx._droitResponsable_({ codeResponsable: 'NIMPORTE' }) === false && ctx._droitResponsable_(null) === false);
V('classeur illisible au contrôle : fermé, sans planter', ctx._droitResponsable_({ codeResponsable: 'BOUM' }) === false);

console.log('\n═══ A2. Les 4 actions annuelles ═══');
['initYear', 'setIndisposYear', 'generateGardes', 'envoyerRecapIndispos'].forEach(a => {
  const sans = appel(a, CODES.COMITE, {});
  V(a + ' : le comité SEUL est refusé, avec le message', sans.error === MSG, sans);
  V(a + ' : …et le classeur n\'est pas touché', !sans.exception);
  V(a + ' : comité + code d\'un MAR sans la clé : refusé', appel(a, CODES.COMITE, { codeResponsable: 'AUTRE' }).error === MSG);
  const avec = appel(a, CODES.COMITE, { codeResponsable: 'RESP' });
  V(a + ' : comité + code du responsable : passe la porte (va au classeur)', avec.exception === TOUCHE || (avec.error !== MSG && avec.error !== 'Accès refusé'), avec);
  V(a + ' : un MAR seul (sans code comité) reste refusé', appel(a, CODES.RESP, { codeResponsable: 'RESP' }).error === 'Accès refusé');
});
{
  /* Contre-épreuve : la même action SANS la ligne de porte laisse passer le comité seul. */
  const { appel: appelSans } = monter((a, s) => s.replace(/\n\s*if \(!_droitResponsable_\(payload\)\) return _error\(MSG_RESPONSABLE_\);/, ''));
  const r = appelSans('generateGardes', CODES.COMITE, {});
  V('contre-épreuve : sans la ligne de porte, le comité seul passerait (le test voit la différence)', r.error !== MSG, r);
}

console.log('\n═══ A3. Le geste quotidien du comité n\'est pas concerné ═══');
{
  const r = appel('publishPlanning', CODES.COMITE, {});
  V('publishPlanning : le comité seul n\'est PAS arrêté par la porte du responsable', r.error !== MSG, r);
  const srcs = ['Indispos.gs', 'gardes.gs', 'indisponibilites.gs', 'equipe.gs', 'portail.gs', 'code.gs', 'miroir.gs', 'echanges.gs'].map(f => fs.readFileSync(G(f), 'utf8')).join('\n');
  const n = (srcs.match(/if \(!_droitResponsable_\(payload\)\) return _error\(MSG_RESPONSABLE_\);/g) || []).length;
  V('exactement 4 portes posées côté serveur', n === 4, n);
}

console.log('\n═══ A4. La page admin ═══');
{
  const adm = lire('admin.html');
  const m = adm.match(/const _ACTIONS_RESPONSABLE = new Set\(\[([^\]]*)\]\);/);
  const liste = m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).sort() : [];
  V('la page envoie le code personnel pour les 4 mêmes actions, pas une de plus', JSON.stringify(liste) === JSON.stringify(['envoyerRecapIndispos', 'generateGardes', 'initYear', 'setIndisposYear']), liste);
  V('api() ajoute codeResponsable à ces actions', /if \(payload && _ACTIONS_RESPONSABLE\.has\(payload\.action\) && !payload\.codeResponsable\) payload\.codeResponsable = _codeResponsable\(\);/.test(adm));
  const c = vm.createContext({ toasts: [], URLSearchParams });
  let stock = {};
  c.sessionStorage = { getItem: k => (k in stock ? stock[k] : null) };
  c.toast = (m, t) => c.toasts.push([m, t]);
  { const i = adm.indexOf('function _codeResponsable('); vm.runInContext(adm.slice(i, adm.indexOf('\n', i)), c); }
  { const i = adm.indexOf('function _assistantAutorise('); vm.runInContext(adm.slice(i, adm.indexOf('\n}', i) + 2), c); }
  V('sans code personnel dans l\'onglet : l\'assistant ne s\'ouvre pas, message affiché', c._assistantAutorise() === false && c.toasts.length === 1 && /Maintenance/.test(c.toasts[0][0]), c.toasts);
  stock = { pmViewCode: 'RESP' };
  V('avec le code personnel gardé par Maintenance : l\'assistant s\'ouvre', c._assistantAutorise() === true && c._codeResponsable() === 'RESP');
  V('openWizard et openWizardGardes commencent par ce contrôle',
    /async function openWizard\(\) \{\n  if \(!_assistantAutorise\(\)\) return;/.test(adm) && /async function openWizardGardes\(\) \{\n  if \(!_assistantAutorise\(\)\) return;/.test(adm));
  V('plus aucune carte annuelle dans l\'onglet Planning', !/class="annual-ops-section"/.test(adm) && !/onclick="openWizard\(\)"/.test(adm) && !/onclick="openWizardGardes\(\)"/.test(adm));
  V('l\'assistant demandé s\'ouvre après la saisie du code comité comme après la reconnexion automatique', (adm.match(/_ouvrirAssistantDemande\(\);/g) || []).length === 2);
}

console.log('\n═══ A5. La page Maintenance ═══');
{
  const mt = lire('maintenance.html');
  const i = mt.indexOf('<details class="card grp" id="cAnnuel">'), j = mt.indexOf('</details>', i);
  const grp = i >= 0 ? mt.slice(i, j) : '';
  V('un groupe « Opérations annuelles », replié par défaut', i >= 0 && /🗓️ Opérations annuelles/.test(grp) && !/id="cAnnuel" open/.test(mt));
  V('les 3 étapes, dans l\'ordre : Démarrer, Générer, Clôturer', grp.indexOf('lienW1') > 0 && grp.indexOf('lienW2') > grp.indexOf('lienW1') && grp.indexOf('id="cClot"') > grp.indexOf('lienW2'));
  V('les étapes 1 et 2 rouvrent les assistants de l\'admin', /id="lienW1" href="admin\.html\?wizard=1"/.test(grp) && /id="lienW2" href="admin\.html\?wizard=gardes"/.test(grp));
  V('dans le même onglet (le code personnel y reste)', !/id="lienW[12]"[^>]*target=/.test(grp));
}

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
process.exit(ko ? 1 : 0);
