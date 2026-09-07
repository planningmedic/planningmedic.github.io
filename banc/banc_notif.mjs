/* ═══ BANC — NOTIFICATIONS PUSH (12/08/2026, phase 1) ═══
   Le VRAI Worker est exécuté. On vérifie :
   1. les trois routes et leurs refus (code, rôle, jeton) ;
   2. que l'abonnement est INATTEIGNABLE par /read et /push ;
   3. le chiffrement : le banc joue le NAVIGATEUR — il génère ses clés,
      s'abonne, reçoit la charge chiffrée et la DÉCHIFFRE réellement
      (RFC 8291). Si le déchiffré = le message, Apple saura faire pareil ;
   4. la purge des abonnements morts (410). */
import fs from 'fs';
import vm from 'vm';
import { webcrypto } from 'crypto';
const crypto = webcrypto;
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 180) : '')); } };

/* ── charge du vrai worker ── */
const envoisHTTP = [];              // ce que le worker POSTe aux services de push
let statutPushService = 201;        // réponse simulée d'Apple/Google
const fauxFetch = async (url, opts) => { envoisHTTP.push({ url, opts }); return { status: statutPushService }; };
const src = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
const ctx = vm.createContext({ globalThis: {}, console, crypto, TextEncoder, TextDecoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise, DataView, Uint8Array, atob, btoa, fetch: fauxFetch });
ctx.globalThis = ctx; vm.runInContext(src, ctx);
const W = ctx.__W, M = new Map();
const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k, v) => { M.set(k, v); }, delete: async k => { M.delete(k); },
  list: async ({ prefix } = {}) => ({ keys: [...M.keys()].filter(k => k.startsWith(prefix || '')).map(name => ({ name })) }) };
const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
const b64u = buf => Buffer.from(buf).toString('base64url');

const ADMIN = 'COMITE2027', MAR_A = 'MARALPHA1';
M.set('acces', JSON.stringify({ users: [
  { h: await sha(ADMIN), role: 'admin', id: 'DURAND', name: 'DURAND', initials: 'AF' },
  { h: await sha(MAR_A), role: 'mar', id: 'ALPHA', name: 'ALPHA', initials: 'AL' },
] }));

/* clés VAPID de test (le banc joue AUSSI le service) */
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey));
const vapidJwk = await crypto.subtle.exportKey('jwk', vapid.privateKey);
const env = { KV, PUSH_TOKEN: 'JETON-BANC', VAPID_PUBLIC: b64u(vapidPubRaw), VAPID_PRIVATE: vapidJwk.d };

const appel = async (chemin, corps) => {
  const rep = await W.fetch(new Request('https://miroir.test' + chemin, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corps || {}) }), env);
  return JSON.parse(await rep.text());
};

console.log('\n═══ N1. Routes et refus ═══');
const rc = await appel('/notif-cle', {});
V('/notif-cle livre la clé publique', rc.success && rc.cle === env.VAPID_PUBLIC, rc);
V('/notif-abonner sans code → refus', !(await appel('/notif-abonner', {})).success);
V('/notif-abonner mauvais code → refus', !(await appel('/notif-abonner', { code: 'FAUX', subscription: {} })).success);
const rMar = await appel('/notif-abonner', { code: MAR_A, subscription: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'a', auth: 'b' } } });
V('rôle mar → refusé (phase 1 : admin seul)', !rMar.success && /comité/i.test(rMar.error || ''), rMar);
V('abonnement incomplet → refus', !(await appel('/notif-abonner', { code: ADMIN, subscription: { endpoint: 'https://x' } })).success);
V('/notif-envoyer sans jeton → 403', !(await appel('/notif-envoyer', { titre: 'x' })).success);
V('/notif-envoyer mauvais jeton → 403', !(await appel('/notif-envoyer', { token: 'FAUX' })).success);

console.log('\n═══ N2. Abonnement réel (le banc joue le navigateur) ═══');
const nav = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const navPub = new Uint8Array(await crypto.subtle.exportKey('raw', nav.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const rAb = await appel('/notif-abonner', { code: ADMIN.toLowerCase() + '  ', subscription: {
  endpoint: 'https://web.push.apple.com/QP-test', keys: { p256dh: b64u(navPub), auth: b64u(authSecret) } } });
V('admin s\'abonne (code toléré en casse/espaces)', rAb.success && rAb.id === 'DURAND', rAb);
V('l\'abonnement est en KV', M.has('notif_sub_DURAND'));

const rRead = await appel('/read', { code: ADMIN, keys: ['notif_sub_DURAND'] });
V('/read ne peut PAS lire un abonnement', !rRead.data || !rRead.data.notif_sub_DURAND, rRead.refuses);
const rPush = await appel('/push', { token: 'JETON-BANC', items: { notif_sub_DURAND: '"pirate"' } });
V('/push ne peut PAS écrire un abonnement', (rPush.refuses || []).includes('notif_sub_DURAND'), rPush);
V('la valeur en KV n\'a pas bougé', M.get('notif_sub_DURAND').includes('web.push.apple.com'));

console.log('\n═══ N3. Envoi : en-têtes, JWT, et DÉCHIFFREMENT de la charge ═══');
const rEnv = await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'Les gardes 2027 sont générées', corps: 'Planning annuel complet.', url: './admin.html' });
V('envoi déclaré réussi', rEnv.success && rEnv.envoyees === 1 && rEnv.abonnes === 1, rEnv);
V('un seul POST vers le service de push', envoisHTTP.length === 1);
const e = envoisHTTP[0];
V('endpoint respecté', e.url === 'https://web.push.apple.com/QP-test');
V('Content-Encoding aes128gcm', e.opts.headers['Content-Encoding'] === 'aes128gcm');
V('TTL présent', e.opts.headers['TTL'] === '86400');
const auth = e.opts.headers['Authorization'] || '';
V('Authorization vapid t=…, k=clé publique', auth.startsWith('vapid t=') && auth.includes('k=' + env.VAPID_PUBLIC));

/* JWT : signature vérifiée avec la clé publique VAPID */
{
  const jwt = auth.slice(8).split(',')[0].trim();
  const [h, p, s] = jwt.split('.');
  const charge = JSON.parse(Buffer.from(p, 'base64url').toString());
  V('JWT : audience = origine du service', charge.aud === 'https://web.push.apple.com', charge);
  V('JWT : sujet mailto du service', /^mailto:/.test(charge.sub));
  V('JWT : expiration < 24 h (règle des services)', charge.exp - Math.floor(Date.now() / 1000) <= 24 * 3600);
  const okSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey,
    Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + p));
  V('JWT : signature ES256 VALIDE (vérifiée à la clé publique)', okSig);
}

/* Déchiffrement RFC 8291 : exactement ce que fera l'iPhone */
{
  const corps = new Uint8Array(e.opts.body);
  const sel = corps.slice(0, 16);
  const rs = new DataView(corps.buffer, corps.byteOffset + 16, 4).getUint32(0);
  const idlen = corps[20];
  const asPub = corps.slice(21, 21 + idlen);
  const chiffre = corps.slice(21 + idlen);
  V('en-tête : rs=4096, clé serveur 65 octets', rs === 4096 && idlen === 65, { rs, idlen });

  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, nav.privateKey, 256));
  const hkdf = async (s2, ikm, info, L) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s2, info }, k, L * 8));
  };
  const te = s2 => new TextEncoder().encode(s2);
  const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), r = new Uint8Array(n); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
  const ikm = await hkdf(authSecret, ecdh, cat(te('WebPush: info\0'), navPub, asPub), 32);
  const cek = await hkdf(sel, ikm, te('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, ikm, te('Content-Encoding: nonce\0'), 12);
  let clair = null;
  try {
    const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, chiffre));
  } catch (err) { /* échec = charge non conforme */ }
  V('la charge SE DÉCHIFFRE (aes128gcm conforme)', !!clair);
  if (clair) {
    V('délimiteur final 0x02 (dernier bloc)', clair[clair.length - 1] === 2);
    const msg = JSON.parse(new TextDecoder().decode(clair.slice(0, -1)));
    V('titre intact après chiffrement/déchiffrement', msg.titre === 'Les gardes 2027 sont générées', msg);
    V('corps + url intacts', msg.corps === 'Planning annuel complet.' && msg.url === './admin.html', msg);
  }
}

console.log('\n═══ N4. Abonnement mort : purgé au passage ═══');
statutPushService = 410; envoisHTTP.length = 0;
const rMort = await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'x', corps: 'y' });
V('le 410 est rapporté, rien d\'envoyé', rMort.success && rMort.envoyees === 0, rMort);
V('l\'abonnement mort est SUPPRIMÉ du KV', !M.has('notif_sub_DURAND'));
const rVide = await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'x' });
V('sans abonné : succès, zéro envoi', rVide.success && rVide.abonnes === 0, rVide);

console.log('\n═══ N5. sw.js : les gestionnaires existent, la version a monté ═══');
{
  const sw = fs.readFileSync('../sw.js', 'utf8');
  V('version montée (pm-sw-v1)', sw.includes("VERSION = 'pm-sw-v1'"));
V("v4 : la pastille est posée à l'arrivée d'une notification", /setAppBadge\(d\.pastille\)/.test(sw));
  V("gestionnaire 'push' présent", /addEventListener\('push'/.test(sw));
  V("gestionnaire 'notificationclick' présent", /addEventListener\('notificationclick'/.test(sw));
  V('le toucher ouvre une page (openWindow)', sw.includes('clients.openWindow'));
  V("l'API GAS reste non interceptée", sw.includes("indexOf('script.google') > -1"));
}

console.log('\n═══ N6. La cloche : compteur de pastille, /notif-vu, clés protégées ═══');
{
  /* Le déchiffreur du banc (le même que N3), factorisé pour relire la
     pastille dans une charge réelle. */
  const dechiffrer = async (e2) => {
    const corps = new Uint8Array(e2.opts.body);
    const sel = corps.slice(0, 16);
    const idlen = corps[20];
    const asPub = corps.slice(21, 21 + idlen);
    const chiffre = corps.slice(21 + idlen);
    const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, nav.privateKey, 256));
    const hk = async (s2, ikm, info, L) => {
      const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
      return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s2, info }, k, L * 8));
    };
    const te = s2 => new TextEncoder().encode(s2);
    const cat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0), r = new Uint8Array(n); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
    const ikm = await hk(authSecret, ecdh, cat(te('WebPush: info\0'), navPub, asPub), 32);
    const cek = await hk(sel, ikm, te('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hk(sel, ikm, te('Content-Encoding: nonce\0'), 12);
    const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, chiffre));
    return JSON.parse(new TextDecoder().decode(clair.slice(0, -1)));
  };

  statutPushService = 201; envoisHTTP.length = 0;
  M.delete('notif_cpt_DURAND');
  await appel('/notif-abonner', { code: ADMIN, subscription: {
    endpoint: 'https://web.push.apple.com/QP-test', keys: { p256dh: b64u(navPub), auth: b64u(authSecret) } } });

  const e1 = await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'Un', corps: 'x' });
  V('premier envoi : le compteur du destinataire passe à 1', e1.success && M.get('notif_cpt_DURAND') === '1', M.get('notif_cpt_DURAND'));
  await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'Deux', corps: 'x' });
  V('deuxième envoi : compteur à 2', M.get('notif_cpt_DURAND') === '2');
  const m2 = await dechiffrer(envoisHTTP[envoisHTTP.length - 1]);
  V('la pastille voyage dans la charge chiffrée (= le compteur)', m2.pastille === 2, m2);

  V('/notif-vu sans code → refus', !(await appel('/notif-vu', {})).success);
  V('/notif-vu mauvais code → refus', !(await appel('/notif-vu', { code: 'FAUX' })).success);
  const rv = await appel('/notif-vu', { code: ADMIN });
  V('/notif-vu remet le compteur à zéro', rv.success && rv.id === 'DURAND' && M.get('notif_cpt_DURAND') === '0', rv);

  /* Économie du quota : déjà à zéro → AUCUNE écriture KV. */
  const putOrig = KV.put; let nbPuts = 0;
  KV.put = async (k, v) => { nbPuts++; return putOrig(k, v); };
  await appel('/notif-vu', { code: ADMIN });
  V('déjà à zéro → aucune écriture KV (le quota est compté)', nbPuts === 0, nbPuts);
  KV.put = putOrig;

  await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'Trois', corps: 'x' });
  V('après la remise à zéro, la pastille repart à 1',
    M.get('notif_cpt_DURAND') === '1' && (await dechiffrer(envoisHTTP[envoisHTTP.length - 1])).pastille === 1);

  /* (unifiée, 23/08) Les échanges envoyaient leur propre chiffre (demandes
     en attente) : il est désormais IGNORÉ — un seul chiffre sur l'icône,
     le compteur de non-vus. */
  const e4 = await appel('/notif-envoyer', { token: 'JETON-BANC', titre: 'Quatre', corps: 'x', pastille: 7 });
  V('une pastille imposée par l\'appelant est IGNORÉE : le compteur gagne (2)',
    e4.success && (await dechiffrer(envoisHTTP[envoisHTTP.length - 1])).pastille === 2);

  /* Les clés : `notifs` circule FILTRÉE À L'IDENTITÉ, compteurs et
     abonnements restent scellés. */
  M.set('notifs', JSON.stringify({ success: true, notifs: {
    DURAND: [{ q: '2026-08-23T10:00:00.000Z', t: 'Pour moi', c: '', u: './dashboard.html' }],
    ALPHA:    [{ q: '2026-08-23T09:00:00.000Z', t: 'Pour un autre', c: '', u: './dashboard.html' }],
    '*':      [{ q: '2026-08-23T08:00:00.000Z', t: 'Pour tous', c: '', u: './dashboard.html' }] } }));
  const rl = await appel('/read', { code: ADMIN, keys: ['notifs', 'notif_cpt_DURAND'] });
  V('/read livre la clé `notifs`', !!(rl.data && rl.data.notifs && rl.data.notifs.success), rl.refuses);
  V('… filtrée : mes entrées et celles pour tous, RIEN d\'autrui',
    !!rl.data.notifs.notifs.DURAND && !!rl.data.notifs.notifs['*'] && !rl.data.notifs.notifs.ALPHA,
    rl.data.notifs && Object.keys(rl.data.notifs.notifs || {}));
  V('/read ne livre JAMAIS un compteur de pastille', !rl.data.notif_cpt_DURAND && (rl.refuses || []).includes('notif_cpt_DURAND'), rl.refuses);
  const rp = await appel('/push', { token: 'JETON-BANC', items: { notifs: '{"success":true,"notifs":{}}', notif_cpt_DURAND: '"99"' } });
  V('/push accepte `notifs` (la copie rapide) et refuse les compteurs',
    !(rp.refuses || []).includes('notifs') && (rp.refuses || []).includes('notif_cpt_DURAND'), rp);
  /* Le compteur monte à CHAQUE envoi, pastille imposée comprise : 'Trois'
     puis 'Quatre' → 2. Un /push pirate n'y a pas touché. */
  V('le compteur en KV est exactement celui des envois (2), intouché par /push', M.get('notif_cpt_DURAND') === '2');
}

console.log(`\nbanc_notif : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
