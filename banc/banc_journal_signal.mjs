/* ═══ BANC — LE DRAPEAU DE LA FILE (2026-08-20) ═══════════════════════
   Le VRAI worker.js, face à un KV simulé qui COMPTE chaque opération.
   Ce qu'on prouve : la file n'est plus ouverte pour rien, et aucune fiche
   ne peut dormir — ni au dépôt, ni pendant l'ouverture, ni si le drapeau
   se perd en route.

   Origine : relevé Cloudflare du 20/08, 640 ouvertures à 09h38 pour un
   plafond de 1 000/jour. Au-delà, plus rien n'est relevé jusqu'à 2 h du
   matin : le comité publie, l'écran dit « en route », rien ne part. */
import fs from 'fs';
import vm from 'vm';

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

const sha256hex = async t => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const CODE_ADMIN = 'CODEADMIN99';

/* Monte un Worker neuf avec une horloge pilotable : `minute` décide si le
   filet des 3 minutes se déclenche, exactement comme getUTCMinutes(). */
async function monter(minuteDepart) {
  const M = new Map();
  const cpt = { get: 0, put: 0, delete: 0, list: 0 };
  let minute = (minuteDepart === undefined) ? 1 : minuteDepart;
  let pendant = null;
  const KV = {
    get: async k => { cpt.get++; return M.has(k) ? M.get(k) : null; },
    put: async (k, v) => { cpt.put++; M.set(k, v); },
    delete: async k => { cpt.delete++; M.delete(k); },
    list: async ({ prefix, limit }) => { cpt.list++;
      /* Point d'injection : ce qui arrive PENDANT l'ouverture. C'est la
         seule façon d'éprouver l'ordre drapeau-baissé-avant-ouverture. */
      if (pendant) { const f = pendant; pendant = null; await f(); }
      return { keys: [...M.keys()].filter(k => k.startsWith(prefix)).slice(0, limit || 1000).map(name => ({ name })) }; },
  };
  const VraiDate = Date;
  const ctx = vm.createContext({
    globalThis: {}, console, crypto, TextEncoder, Response, Request, URL, JSON,
    Math, Object, Array, String, Number, Set, Promise,
    Date: class extends VraiDate {
      getUTCMinutes() { return minute; }
      static now() { return VraiDate.now(); }
    },
  });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W ='), ctx);
  const W = ctx.__W;

  M.set('acces', JSON.stringify({ users: [{ h: await sha256hex(CODE_ADMIN), role: 'admin', id: 'DURAND' }] }));
  const env = { KV, PUSH_TOKEN: 'JETON-SECRET' };
  const appel = (chemin, corps) => W.fetch(
    new Request('https://x' + chemin, { method: 'POST', body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } }),
    env).then(r => r.json().then(j => ({ statut: r.status, j })));

  return {
    M, cpt, appel,
    minuteEst: m => { minute = m; },
    pendantOuverture: f => { pendant = f; },
    remise: () => { cpt.get = cpt.put = cpt.delete = cpt.list = 0; },
    deposer: (type) => appel('/ecrire', { code: CODE_ADMIN, intention: { type: type || 'publier', year: 2027 } }),
    tirer: (extra) => appel('/tirer', Object.assign({ token: 'JETON-SECRET' }, extra || {})),
    enFile: () => [...M.keys()].filter(k => k.startsWith('j_')).length,
    drapeau: () => M.has('jsignal'),
  };
}

console.log('\n═══ 83. La file n\'est plus ouverte pour rien ═══');
{
  const w = await monter(1);            // minute 1 : hors filet
  w.remise();
  const r = await w.tirer();
  V('file vide, pas de drapeau → AUCUNE ouverture', w.cpt.list === 0, w.cpt);
  V('la réponse garde la forme attendue par l\'applicateur', r.j.success === true && Array.isArray(r.j.fiches) && r.j.fiches.length === 0, r.j);
  V('et elle dit qu\'elle a survolé (pour le diagnostic)', r.j.survole === true, r.j);
  V('une lecture, rien de plus', w.cpt.get === 1 && w.cpt.put === 0 && w.cpt.delete === 0, w.cpt);
}

console.log('\n═══ 84. Une fiche déposée est relevée à la minute suivante ═══');
{
  const w = await monter(1);
  const d = await w.deposer('publier');
  V('le dépôt réussit', d.j.success === true && /^j_/.test(d.j.cle), d.j);
  V('le drapeau est levé', w.drapeau() === true);
  V('le drapeau n\'est PAS rangé avec les fiches', !('jsignal').startsWith('j_'));

  w.remise();
  const r = await w.tirer();
  V('la file est ouverte', w.cpt.list === 1, w.cpt);
  V('la fiche est bien relevée', r.j.fiches.length === 1 && r.j.fiches[0].cle === d.j.cle, r.j.fiches);
  V('le motif de l\'ouverture est tracé', r.j.ouverte === 'drapeau', r.j);
  V('le drapeau est rabaissé', w.drapeau() === false);

  w.remise();
  await w.tirer();
  V('passage suivant, file vidée du drapeau → plus d\'ouverture', w.cpt.list === 0, w.cpt);
}

console.log('\n═══ 85. Aucune fiche ne peut dormir ═══');
{
  // (a) Le drapeau est baissé AVANT l'ouverture : une fiche déposée pendant
  //     l'ouverture relève le drapeau et sera vue au passage suivant.
  {
    const w = await monter(1);
    await w.deposer('placements');
    await w.tirer();                     // relève la 1re fiche, baisse le drapeau
    await w.deposer('publier');          // arrivée juste après
    V('la 2e fiche relève le drapeau', w.drapeau() === true);
    w.remise();
    const r = await w.tirer();
    V('elle est relevée au passage suivant, hors filet', r.j.fiches.length === 2 && w.cpt.list === 1, { n: r.j.fiches.length, cpt: w.cpt });
  }

  // (b) Drapeau PERDU (lecture périmée chez Cloudflare, cache de 60 s) :
  //     le filet des 3 minutes rattrape. C'est la raison d'être du filet.
  {
    const w = await monter(1);
    await w.deposer('publier');
    w.M.delete('jsignal');               // le drapeau n'arrive jamais jusqu'ici
    w.remise();
    let r = await w.tirer();
    V('drapeau perdu, hors filet : la fiche dort (constat, pas un défaut)', r.j.fiches.length === 0 && w.cpt.list === 0, w.cpt);
    V('mais elle est TOUJOURS en file, jamais effacée', w.enFile() === 1);
    w.minuteEst(3);                      // minute multiple de 3 → filet
    w.remise();
    r = await w.tirer();
    V('le filet des 3 minutes la rattrape', r.j.fiches.length === 1 && r.j.ouverte === 'filet', r.j);
  }

  // (c) Fiche déposée AVANT le déploiement (aucun drapeau n'a jamais existé)
  {
    const w = await monter(1);
    w.M.set('j_00000000000001_zzzz', JSON.stringify({ type: 'publier', year: 2027 }));
    w.minuteEst(6);
    const r = await w.tirer();
    V('une fiche héritée de l\'ancien Worker est relevée par le filet', r.j.fiches.length === 1, r.j.fiches);
  }

  // (d) Ouverture forcée à la main, sans attendre le filet
  {
    const w = await monter(1);
    w.M.set('j_00000000000002_yyyy', JSON.stringify({ type: 'publier', year: 2027 }));
    w.remise();
    const r = await w.tirer({ forcer: true });
    V('forcer:true ouvre la file immédiatement', r.j.fiches.length === 1 && w.cpt.list === 1, w.cpt);
  }
}

console.log('\n═══ 86. Le filet tombe bien 1 minute sur 3 ═══');
{
  const w = await monter(0);
  const ouvertures = [];
  for (let m = 0; m < 60; m++) {
    w.minuteEst(m);
    w.remise();
    await w.tirer();
    if (w.cpt.list > 0) ouvertures.push(m);
  }
  V('20 ouvertures par heure (une sur trois)', ouvertures.length === 20, ouvertures.length);
  V('ce sont bien les minutes multiples de 3', ouvertures.every(m => m % 3 === 0), ouvertures.slice(0, 6));
  V('soit 480 par jour, au lieu de 1 440', ouvertures.length * 24 === 480, ouvertures.length * 24);
  V('et sous le plafond gratuit de 1 000', ouvertures.length * 24 < 1000);
}

console.log('\n═══ 87. Le coût déplacé reste très en dessous des plafonds ═══');
{
  /* Ce qu'on ajoute : une lecture par minute (plafond 100 000), une
     écriture et une suppression par geste du comité (plafonds 1 000).
     Ce qu'on enlève : ~960 ouvertures par jour. */
  const w = await monter(1);
  w.remise();
  await w.deposer('publier');
  V('déposer coûte 2 écritures (la fiche + le drapeau)', w.cpt.put === 2, w.cpt);
  V('et aucune ouverture de file', w.cpt.list === 0, w.cpt);

  w.remise();
  await w.tirer();
  V('relever coûte 1 suppression (le drapeau baissé)', w.cpt.delete === 1, w.cpt);

  // journée simulée : 1 440 passages, 40 gestes du comité
  const j = await monter(0);
  for (let m = 0; m < 1440; m++) {
    j.minuteEst(m % 60);
    if (m % 36 === 0) await j.deposer('placements');      // 40 gestes
    await j.tirer();
    const enFile = [...j.M.keys()].filter(k => k.startsWith('j_'));
    if (enFile.length) enFile.forEach(k => j.M.delete(k));  // l'applicateur purge
  }
  V(`journée entière : ${j.cpt.list} ouvertures (plafond 1 000)`, j.cpt.list < 1000, j.cpt.list);
  V(`écritures ajoutées : ${j.cpt.put} (plafond 1 000, le miroir en consomme ~100)`, j.cpt.put <= 100, j.cpt.put);
  V(`suppressions : ${j.cpt.delete} (plafond 1 000)`, j.cpt.delete < 1000, j.cpt.delete);
  V(`lectures : ${j.cpt.get} (plafond 100 000)`, j.cpt.get < 100000, j.cpt.get);
}

console.log('\n═══ 88. Rien d\'autre n\'a bougé ═══');
{
  const w = await monter(1);
  // Le jeton reste exigé, et un refus ne doit RIEN lire ni écrire
  w.remise();
  const r = await w.appel('/tirer', { token: 'MAUVAIS' });
  V('/tirer refuse toujours un mauvais jeton (403)', r.statut === 403 && r.j.success === false, r);
  V('un refus ne touche pas au KV', w.cpt.get === 0 && w.cpt.list === 0, w.cpt);

  // Le dépôt garde ses contrôles
  const r2 = await w.appel('/ecrire', { code: CODE_ADMIN, intention: { type: 'bidule' } });
  V('type d\'intention inconnu toujours refusé (400)', r2.statut === 400, r2.j);
  V('un type refusé ne lève aucun drapeau', w.drapeau() === false);
  const r3 = await w.appel('/ecrire', { code: 'FAUX', intention: { type: 'publier', year: 2027 } });
  V('code invalide toujours refusé (403)', r3.statut === 403);
  V('un code invalide ne lève aucun drapeau non plus', w.drapeau() === false);

  // Le drapeau ne doit jamais être servi par /read ni accepté par /push
  const r4 = await w.appel('/read', { code: CODE_ADMIN, keys: ['jsignal'] });
  V('jsignal n\'est jamais servi à une page', (r4.j.refuses || []).indexOf('jsignal') > -1 && !(r4.j.data || {}).jsignal, r4.j);
  const r5 = await w.appel('/push', { token: 'JETON-SECRET', items: { jsignal: '"x"' } });
  V('le GAS ne peut pas écrire jsignal par /push', (r5.j.refuses || []).indexOf('jsignal') > -1, r5.j);

  // L'ordre des fiches reste garanti
  const w2 = await monter(0);
  const a = await w2.deposer('placements');
  await new Promise(res => setTimeout(res, 5));
  const b = await w2.deposer('publier');
  V('les clés restent croissantes (ordre du journal)', a.j.cle < b.j.cle, [a.j.cle, b.j.cle]);
  const r6 = await w2.tirer();
  V('les deux fiches sortent ensemble', r6.j.fiches.length === 2, r6.j.fiches.length);
}

console.log('\n═══ 89. Une fiche qui arrive PENDANT l\'ouverture n\'est pas perdue ═══');
{
  /* Le cœur de la conception : le drapeau est baissé AVANT d'ouvrir la file.
     Une fiche déposée pendant l'ouverture relève donc le drapeau, et sera vue
     au passage suivant. Baisser APRÈS effacerait ce drapeau-là — et la fiche
     dormirait jusqu'au filet, voire indéfiniment si le filet sautait. */
  const w = await monter(1);
  await w.deposer('placements');
  w.pendantOuverture(async () => { await w.deposer('publier'); });   // arrivée en pleine ouverture
  const r1 = await w.tirer();
  V('l\'ouverture rend au moins la 1re fiche', r1.j.fiches.length >= 1, r1.j.fiches.length);
  V('le drapeau de la fiche arrivée pendant est TOUJOURS levé', w.drapeau() === true);

  w.remise();
  const r2 = await w.tirer();
  V('elle est relevée au passage suivant, hors filet', w.cpt.list === 1, w.cpt);
  const cles = r2.j.fiches.map(f => f.cle);
  V('aucune fiche perdue', w.enFile() === cles.length && cles.length >= 1, { file: w.enFile(), rendues: cles.length });
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
