/* ═══ ENVOI DIFFÉRENTIEL DU MIROIR (2026-08-20) ═══════════════════════
   Le vrai _miroirEnvoyer_ du dépôt, face à un Worker simulé qui compte ce
   qu'il reçoit. Ce qu'on prouve ici : une clé identique n'est pas renvoyée,
   et AUCUN des chemins de dégradation ne peut figer une donnée au miroir.

   Origine : relevé Cloudflare du 20/08 (380 écritures, 640 fouilles sur des
   plafonds de 1 000/jour). La synchro horaire renvoyait tout, tout le temps. */
const vm = require('vm');
const fs = require('fs');
const crypto = require('crypto');
const { extraireFonction } = require('./stubs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

const SRC = '../gas/miroir.gs';

/* Worker simulé : accepte tout sauf les clés déclarées interdites, et rend
   le MÊME contrat que cloudflare/worker.js ({success, ecrits, supprimes,
   refuses}). Il retient l'état du KV pour qu'on puisse vérifier ce qui y
   est réellement stocké — pas seulement ce qui a été envoyé. */
function monter(options) {
  const opt = options || {};
  const PROPS = { MIROIR_PUSH_TOKEN: 'JETON' };
  const kv = {};
  const appels = [];          // un par POST /push
  let horloge = 12;           // heure simulée (getHours)

  const ctx = vm.createContext({
    console, JSON, Number, String, Object, Array, Math, Error, RegExp,
    Date: class extends Date {
      getHours() { return horloge; }
      static now() { return 1755000000000; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in PROPS ? PROPS[k] : null),
      setProperty: (k, v) => { PROPS[k] = String(v); },
      deleteProperty: k => { delete PROPS[k]; } }) },
    Logger: { log: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (algo, texte) => {
        const b = crypto.createHash('sha256').update(String(texte), 'utf8').digest();
        return Array.from(b).map(x => (x > 127 ? x - 256 : x));   // octets signés, comme GAS
      },
    },
    UrlFetchApp: { fetch: (url, params) => {
      const corps = JSON.parse(params.payload);
      appels.push(Object.keys(corps.items));
      if (opt.workerKO) return { getResponseCode: () => 500, getContentText: () => '{"success":false,"error":"panne"}' };
      const ecrits = [], supprimes = [], refuses = [];
      Object.keys(corps.items).forEach(c => {
        if ((opt.interdites || []).indexOf(c) > -1) { refuses.push(c); return; }
        if (corps.items[c] === null) { delete kv[c]; supprimes.push(c); return; }
        kv[c] = corps.items[c]; ecrits.push(c);
      });
      const rep = opt.workerAncien
        ? { success: true }                       // Worker qui ne dit pas ce qu'il a fait
        : { success: true, ecrits, supprimes, refuses };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(rep) };
    } },
  });
  ctx.globalThis = ctx;

  // Constantes et fonctions RÉELLES du dépôt.
  const src = fs.readFileSync(SRC, 'utf8');
  ['const MIROIR_MAX_CLES = 20;',
   src.match(/const MIROIR_CLE_EMPREINTES = '[^']*';/)[0],
   src.match(/const MIROIR_CLES_HORODATEES = \{[\s\S]*?\};/)[0],
   "const MIROIR_URL = 'https://exemple.test';"].forEach(l => vm.runInContext(l, ctx));
  ['_miroirSha256_', '_miroirValeurStable_', '_miroirEmpreinte_', '_miroirEmpreintesLues_',
   '_miroirEmpreintesEcrites_', 'miroirOublierEmpreintes', '_miroirEnvoyerLot_', '_miroirEnvoyer_']
    .forEach(n => vm.runInContext(extraireFonction(SRC, n), ctx));

  return {
    ctx, kv, appels, PROPS,
    envoyer: items => { ctx.__items = items; return vm.runInContext('_miroirEnvoyer_(__items)', ctx); },
    oublier: () => vm.runInContext('miroirOublierEmpreintes()', ctx),
    heure: h => { horloge = h; },
    clesEnvoyees: () => appels.reduce((a, l) => a.concat(l), []),
  };
}

const J = o => JSON.stringify(o);
const MIROIR_HORODATEES = ['acces', 'config_admin', 'mail_nonlus', 'ordre_vac', 'veille_marques', 'indispos_2027'];


console.log('\n═══ 78. Miroir : une clé identique n\'est pas renvoyée ═══');
{
  const m = monter();
  const lot = { secteurs: J([{ code: 'VIS' }]), gardes_2027: J({ a: 1 }) };

  const r1 = m.envoyer(lot);
  V('1er envoi : les 2 clés partent', r1.success && r1.ecrites === 2, r1);
  V('le miroir contient bien les 2 clés', Object.keys(m.kv).sort().join(',') === 'gardes_2027,secteurs', Object.keys(m.kv));

  const r2 = m.envoyer({ secteurs: J([{ code: 'VIS' }]), gardes_2027: J({ a: 1 }) });
  V('2e envoi identique : AUCUN appel au Worker', m.appels.length === 1, m.appels);
  V('et le compte rendu le dit (2 inchangées)', r2.success && r2.inchangees === 2 && r2.ecrites === 0, r2);

  const r3 = m.envoyer({ secteurs: J([{ code: 'VIS' }]), gardes_2027: J({ a: 2 }) });
  V('une seule clé modifiée → une seule repart', r3.ecrites === 1 && m.appels[1].join(',') === 'gardes_2027', m.appels[1]);
  V('la valeur au miroir suit la modification', JSON.parse(m.kv.gardes_2027).a === 2, m.kv.gardes_2027);
  V('la clé inchangée reste intacte au miroir', m.kv.secteurs === J([{ code: 'VIS' }]));
}

console.log('\n═══ 79. Les six clés horodatées sont bien filtrées ═══');
{
  /* Sans neutralisation du champ `t`, ces clés repartiraient à CHAQUE
     passage — soit les six plus fréquentes du miroir, et le filtre ne
     servirait à rien. C'est le défaut qui a failli passer. */
  const m = monter();
  const base = { users: [{ h: 'abc', id: 'WS' }] };
  m.envoyer({ acces: J(Object.assign({ t: 1000 }, base)) });
  const r = m.envoyer({ acces: J(Object.assign({ t: 9999 }, base)) });
  V('acces : seul l\'horodatage a changé → pas de renvoi', r.inchangees === 1 && m.appels.length === 1, r);

  const r2 = m.envoyer({ acces: J({ t: 9999, users: [{ h: 'zzz', id: 'WS' }] }) });
  V('acces : un VRAI changement repart bien', r2.ecrites === 1, r2);

  const m2 = monter();
  m2.envoyer({ mail_nonlus: J({ success: true, nonLus: 3, maj: '2026-08-20T08:00:00Z' }) });
  const r3 = m2.envoyer({ mail_nonlus: J({ success: true, nonLus: 3, maj: '2026-08-20T08:05:00Z' }) });
  V('mail_nonlus : même compteur, heure différente → pas de renvoi', r3.inchangees === 1, r3);
  const r4 = m2.envoyer({ mail_nonlus: J({ success: true, nonLus: 4, maj: '2026-08-20T08:10:00Z' }) });
  V('mail_nonlus : le compteur change → renvoi', r4.ecrites === 1, r4);

  const m3 = monter();
  m3.envoyer({ indispos_2027: J({ parMar: { WS: {} }, annee: 2027, t: 1 }) });
  const r5 = m3.envoyer({ indispos_2027: J({ parMar: { WS: {} }, annee: 2027, t: 2 }) });
  V('indispos_{Y} : horodatage neutralisé lui aussi', r5.inchangees === 1, r5);

  /* Contre-épreuve : une clé NON horodatée garde son contenu intact dans la
     comparaison — on ne doit pas se mettre à ignorer un champ `t` légitime
     ailleurs. */
  const m4 = monter();
  m4.envoyer({ secteurs: J({ t: 1, x: 1 }) });
  const r6 = m4.envoyer({ secteurs: J({ t: 2, x: 1 }) });
  V('clé non horodatée : le champ t compte, elle repart', r6.ecrites === 1, r6);
}

console.log('\n═══ 80. Aucun chemin ne peut figer une donnée au miroir ═══');
{
  // Garde-fou 1 : une clé REFUSÉE par le Worker n'est jamais mémorisée
  {
    const m = monter({ interdites: ['secteurs'] });
    m.envoyer({ secteurs: J([1]), gardes_2027: J([2]) });
    const r = m.envoyer({ secteurs: J([1]), gardes_2027: J([2]) });
    V('clé refusée par le Worker → réessayée au passage suivant', r.ecrites >= 1 && m.appels[1].indexOf('secteurs') > -1, m.appels[1]);
    V('la clé acceptée, elle, n\'est pas renvoyée', m.appels[1].indexOf('gardes_2027') === -1, m.appels[1]);
  }

  // Garde-fou 1 bis : Worker qui ne détaille pas sa réponse
  {
    const m = monter({ workerAncien: true });
    m.envoyer({ secteurs: J([1]) });
    const r = m.envoyer({ secteurs: J([1]) });
    V('Worker muet sur ce qu\'il a écrit → on renvoie (jamais de pari)', r.ecrites === 1 && m.appels.length === 2, m.appels);
  }

  // Garde-fou 1 ter : envoi en échec → aucune empreinte enregistrée
  {
    const m = monter({ workerKO: true });
    const r1 = m.envoyer({ secteurs: J([1]) });
    V('Worker en panne → échec remonté', r1.success === false, r1);
    V('aucune empreinte gardée après un échec', !m.PROPS.MIROIR_EMPREINTES, m.PROPS.MIROIR_EMPREINTES);
  }

  // Garde-fou 2 : une SUPPRESSION n'est jamais filtrée
  {
    const m = monter();
    m.envoyer({ planning_2028: J([1]) });
    m.envoyer({ planning_2028: null });
    V('la suppression atteint le miroir', !('planning_2028' in m.kv), Object.keys(m.kv));
    const r = m.envoyer({ planning_2028: null });
    V('une suppression répétée part quand même (jamais filtrée)', m.appels.length === 3, m.appels);
    V('et l\'empreinte a bien été effacée', !(JSON.parse(m.PROPS.MIROIR_EMPREINTES || '{}').planning_2028));
  }

  // Garde-fou 3 : l'oubli quotidien renvoie tout
  {
    const m = monter();
    m.envoyer({ secteurs: J([1]), gardes_2027: J([2]) });
    m.oublier();
    const r = m.envoyer({ secteurs: J([1]), gardes_2027: J([2]) });
    V('après oubli des empreintes, tout repart', r.ecrites === 2, r);
  }

  // Le miroir vidé à la main SANS que le GAS le sache : la donnée manque
  // jusqu'au passage de 4 h. C'est le prix assumé, on le fige ici pour que
  // personne ne le redécouvre en production sans l'avoir voulu.
  {
    const m = monter();
    m.envoyer({ secteurs: J([1]) });
    delete m.kv.secteurs;                       // effacement hors du GAS
    m.envoyer({ secteurs: J([1]) });
    V('miroir vidé à la main : la clé NE revient pas d\'elle-même', !('secteurs' in m.kv));
    m.oublier();                                 // ce que fait la synchro de 4 h
    m.envoyer({ secteurs: J([1]) });
    V('…mais l\'oubli quotidien la rétablit', m.kv.secteurs === J([1]), m.kv);
  }
}

console.log('\n═══ 81. Les copies de documents restent hors du filtre ═══');
{
  /* doc_* est déjà différentiel (date de modification Drive). Le filtrer une
     seconde fois gonflerait la table d'empreintes sans rien économiser. */
  const m = monter();
  m.envoyer({ doc_abc: J({ n: 'Topo.pdf' }) });
  const r = m.envoyer({ doc_abc: J({ n: 'Topo.pdf' }) });
  V('doc_* repart toujours (différentiel assuré en amont)', r.ecrites === 1 && m.appels.length === 2, m.appels);
  V('aucune empreinte doc_ dans la table', !(JSON.parse(m.PROPS.MIROIR_EMPREINTES || '{}').doc_abc));
}

console.log('\n═══ 82. Découpage en lots et gain mesuré ═══');
{
  // Le Worker refuse plus de 20 clés : le découpage doit porter sur ce qui
  // reste APRÈS filtrage, sinon un lot vide partirait.
  const m = monter();
  const gros = {};
  for (let i = 0; i < 25; i++) gros['planning_' + (2000 + i)] = J([i]);
  const r1 = m.envoyer(gros);
  V('25 clés → 2 lots', r1.lots === 2 && m.appels.length === 2, r1);
  V('aucun lot ne dépasse 20 clés', m.appels.every(l => l.length <= 20), m.appels.map(l => l.length));

  gros.planning_2010 = J(['modifié']);
  const r2 = m.envoyer(gros);
  V('1 clé modifiée sur 25 → 1 seul lot d\'1 clé', r2.lots === 1 && m.appels[2].length === 1, m.appels[2]);

  /* Le gain, chiffré sur le rythme réel : la synchro horaire renvoyait ses
     clés 24 fois par jour. Journée sans aucune modification. */
  const m2 = monter();
  const synchro = {};
  ['acces','annees','secteurs','config_admin','gardes_2027','stats','joursferies',
   'planning_2027','affectations_2027','indispos_2027','mail_nonlus','liberal',
   'specialites','cotations_type','veille_marques','ordre_vac','echanges','tuiles'].forEach((c, i) => {
    synchro[c] = J({ v: i, t: 1 });
  });
  let ecrites = 0;
  for (let h = 0; h < 24; h++) {
    Object.keys(synchro).forEach(c => { if (MIROIR_HORODATEES.indexOf(c) > -1) synchro[c] = J({ v: Object.keys(synchro).indexOf(c), t: h }); });
    const r = m2.envoyer(synchro);
    ecrites += r.ecrites || 0;
  }
  V('24 synchros sans modification : 18 écritures au lieu de 432', ecrites === 18, ecrites);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
