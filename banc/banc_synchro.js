/* ═══ BANC — LA SYNCHRO COMPLÈTE ET SON PLAFOND DE CLÉS ═══
   Panne du 05/08 17:42 : « 20 clés maximum ». La synchro complète construit
   plus de clés que le Worker n'en accepte par appel, et échouait EN BLOC —
   filet horaire hors service, sans rien à l'écran. On éprouve ici le
   découpage, à l'échelle d'aujourd'hui ET des années à venir. */
const vm = require('vm'), fs = require('fs');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

function banc(options) {
  const envois = [];
  const PROPS = {};
  const ctx = vm.createContext({
    console, JSON, Object, Array, String, Number, Math, Error, RegExp,
    Logger: { log: () => {} },
    /* (20/08/2026) Le filtre différentiel range ses empreintes ici. Contexte
       neuf à chaque banc() : table vide, donc rien n'est filtré et les
       vérifications de découpage ci-dessous portent bien sur TOUTES les clés. */
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k === 'MIROIR_PUSH_TOKEN'
        ? (options && options.sansJeton ? null : 'JETON')
        : (k in PROPS ? PROPS[k] : null)),
      setProperty: (k, v) => { PROPS[k] = String(v); },
      deleteProperty: k => { delete PROPS[k]; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (a, t) => Array.from(require('crypto').createHash('sha256').update(String(t), 'utf8').digest())
                                   .map(x => (x > 127 ? x - 256 : x)),
    },
    MIROIR_URL: 'https://worker',
    UrlFetchApp: { fetch: (url, opt) => {
      const corps = JSON.parse(opt.payload);
      const n = Object.keys(corps.items || {}).length;
      envois.push(n);
      /* Le VRAI Worker refuse au-delà de 20 : on reproduit sa règle à
         l'identique, sinon le test ne prouverait rien. */
      if (n > 20) return { getContentText: () => JSON.stringify({ success: false, error: '20 clés maximum' }) };
      if (options && options.echecLot === envois.length) return { getContentText: () => JSON.stringify({ success: false, error: 'panne simulée' }) };
      return { getContentText: () => JSON.stringify({ success: true, ecrites: n }) };
    }},
  });
  ctx.globalThis = ctx;
  ['_miroirEnvoyer_', '_miroirEnvoyerLot_', '_miroirSha256_', '_miroirValeurStable_',
   '_miroirEmpreinte_', '_miroirEmpreintesLues_', '_miroirEmpreintesEcrites_']
    .forEach(n => vm.runInContext(extraireFonction('../gas/miroir.gs', n), ctx));
  const src = fs.readFileSync('../gas/miroir.gs', 'utf8');
  vm.runInContext('const MIROIR_MAX_CLES = 20;', ctx);
  vm.runInContext(src.match(/const MIROIR_CLE_EMPREINTES = '[^']*';/)[0], ctx);
  vm.runInContext(src.match(/const MIROIR_CLES_HORODATEES = \{[\s\S]*?\};/)[0], ctx);
  return { ctx, envois, PROPS };
}

/* Clés réelles construites par la synchro complète, pour N années. */
function clesPour(annees) {
  const items = {};
  ['acces','annees','secteurs','config_admin','topos','staffs','veille','protocoles',
   'annuaire','mail_nonlus','vacances_admin'].forEach(c => { items[c] = '{}'; });
  annees.forEach(y => {
    ['planning_','affectations_','gardes_','joursferies_','stats_'].forEach(p => { items[p + y] = '{}'; });
  });
  items['liberal_' + annees[annees.length - 1]] = '{}';
  items['indispos_' + annees[annees.length - 1]] = '{}';
  return items;
}

console.log('\n═══ 48. Aujourd\'hui : 2026 + 2027 ═══');
{
  const items = clesPour([2026, 2027]);
  const n = Object.keys(items).length;
  V(`la synchro construit ${n} clés — au-dessus du plafond de 20`, n > 20, n);
  const b = banc();
  const r = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items)})`, b.ctx);
  V('l\'envoi RÉUSSIT malgré le plafond', r.success === true, r);
  V('découpé en 2 paquets', b.envois.length === 2, b.envois);
  V('aucun paquet ne dépasse 20 clés', b.envois.every(x => x <= 20), b.envois);
  V('toutes les clés sont parties', b.envois.reduce((a, x) => a + x, 0) === n, { envoyees: b.envois.reduce((a,x)=>a+x,0), attendu: n });
  V('le compte rendu dit combien de clés écrites', r.ecrites === n, r);
}

console.log('\n═══ 49. Janvier 2027 : 2026 + 2027 + 2028 ═══');
{
  const items = clesPour([2026, 2027, 2028]);
  const n = Object.keys(items).length;
  const b = banc();
  const r = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items)})`, b.ctx);
  V(`${n} clés : l'envoi passe toujours`, r.success === true, r);
  V('découpé en 2 paquets', b.envois.length === 2, b.envois);
  V('toutes les clés sont parties', b.envois.reduce((a, x) => a + x, 0) === n, b.envois);
}

console.log('\n═══ 50. Cinq années (2026 → 2030) : la limite ne revient pas ═══');
{
  const items = clesPour([2026, 2027, 2028, 2029, 2030]);
  const n = Object.keys(items).length;
  const b = banc();
  const r = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items)})`, b.ctx);
  V(`${n} clés : l'envoi passe`, r.success === true, r);
  V('aucun paquet au-dessus de 20', b.envois.every(x => x <= 20), b.envois);
  V('toutes les clés sont parties', b.envois.reduce((a, x) => a + x, 0) === n, b.envois);
}

console.log('\n═══ 51. Un paquet en échec : les autres passent, le rapport le dit ═══');
{
  const items = clesPour([2026, 2027]);
  const b = banc({ echecLot: 2 });
  const r = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items)})`, b.ctx);
  V('l\'échec est signalé', r.success === false, r);
  V('le rapport nomme le paquet fautif', /lot 2\/2/.test(r.error || ''), r.error);
  V('le premier paquet a bien été écrit', r.ecrites === b.envois[0], { ecrites: r.ecrites, premier: b.envois[0] });
  V('les deux paquets ont été tentés', b.envois.length === 2, b.envois);
}

console.log('\n═══ 52. Cas limites ═══');
{
  const b1 = banc();
  const r1 = vm.runInContext(`_miroirEnvoyer_({})`, b1.ctx);
  V('aucune clé : refus clair, aucun appel', r1.success === false && b1.envois.length === 0, { r1, envois: b1.envois });
  const b2 = banc();
  const items20 = {}; for (let i = 0; i < 20; i++) items20['cle_' + i] = '{}';
  const r2 = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items20)})`, b2.ctx);
  V('exactement 20 clés : UN seul appel', r2.success === true && b2.envois.length === 1, b2.envois);
  const b3 = banc();
  const items21 = Object.assign({ cle_21: '{}' }, items20);
  vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items21)})`, b3.ctx);
  V('21 clés : deux appels (20 + 1)', b3.envois.length === 2 && b3.envois[0] === 20 && b3.envois[1] === 1, b3.envois);
  const b4 = banc({ sansJeton: true });
  const r4 = vm.runInContext(`_miroirEnvoyer_(${JSON.stringify(items20)})`, b4.ctx);
  V('jeton absent : refus AVANT tout appel', r4.success === false && b4.envois.length === 0, { r4, envois: b4.envois });
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
