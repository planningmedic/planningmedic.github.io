/* ═══ BANC — WIDGET « PATIENTS LIB » (30/10/2026) ═══════════════════════════
   La chaîne entière, avec le VRAI code de chaque maillon :
     1. le chiffrement (même code dans le pense-bête et dans le widget),
        comparé à ChaCha20-Poly1305 de Node (OpenSSL) ;
     2. le VRAI worker.js et sa boîte chiffrée (KV simulé) ;
     3. le VRAI pense-bête (jsdom) : activer, envoyer, désactiver — et rien en
        clair ne part, et rien ne part tant que le widget est éteint ;
     4. le VRAI script Scriptable, dans une imitation de Scriptable : il relit la
        boîte, déchiffre et dessine grand widget et écran verrouillé.
   Ce que le banc ne prouve PAS : le rendu réel dans Scriptable sur iPhone, ni
   l'heure à laquelle iOS rafraîchit le widget. Cela se vérifie à la main. */
import fs from 'fs';
import vm from 'vm';
import nodeCrypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const PAGE = fs.readFileSync('../pense-bete/index.html', 'utf8');
const SCRIPT = fs.readFileSync('../pense-bete/widget-scriptable.js', 'utf8');
const WORKER = fs.readFileSync('../cloudflare/worker.js', 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms));
const TEMOIN = 'ZQ';

/* ── 1. CHIFFREMENT ──────────────────────────────────────────────────────── */
console.log('\n[1] Chiffrement — même code des deux côtés, identique à Node');
const bloc = t => (t.match(/\/\* ═══ CHIFFREMENT PB1 — début[\s\S]*?═══ CHIFFREMENT PB1 — fin ═══ \*\//) || [''])[0];
V('le bloc de chiffrement est présent dans le pense-bête et dans le widget', bloc(PAGE).length > 2000 && bloc(SCRIPT).length > 2000);
V('…identique caractère pour caractère', bloc(PAGE) === bloc(SCRIPT));
const PB = new Function(bloc(PAGE) + '\nreturn PB;')();
let diff = 0, dec = 0, alt = 0;
const lettres = Array.from('abcZQéèà€·-😀 ');
for (const n of [0, 1, 15, 16, 17, 63, 64, 65, 200, 3000]) for (let k = 0; k < 4; k++) {
  const cle = nodeCrypto.randomBytes(32), nonce = nodeCrypto.randomBytes(12);
  let txt = ''; for (let i = 0; i < n; i++) txt += lettres[Math.floor(Math.random() * lettres.length)];
  const c = nodeCrypto.createCipheriv('chacha20-poly1305', cle, nonce, { authTagLength: 16 });
  const ref = Buffer.concat([nonce, c.update(Buffer.from(txt, 'utf8')), c.final(), c.getAuthTag()]).toString('base64url');
  if (PB.chiffrer(new Uint8Array(cle), txt, new Uint8Array(nonce)) !== ref) diff++;
  if (PB.dechiffrer(new Uint8Array(cle), ref) !== txt) dec++;
  const b = Buffer.from(ref, 'base64url'); b[b.length - 1] ^= 1;
  if (PB.dechiffrer(new Uint8Array(cle), b.toString('base64url')) !== null) alt++;
}
V('40 messages (0 à 3 000 caractères, accents, émoji) : chiffrés exactement comme Node', diff === 0, diff);
V('…et relus par le widget', dec === 0, dec);
V('un message altéré d\'un seul bit est refusé', alt === 0, alt);
const k1 = nodeCrypto.randomBytes(32), k2 = nodeCrypto.randomBytes(32);
V('mauvaise clé : refusé (rien de lisible)', PB.dechiffrer(new Uint8Array(k2), PB.chiffrer(new Uint8Array(k1), 'AB Endos', new Uint8Array(12))) === null);
V('texte chiffré illisible : les initiales n\'y apparaissent pas', !PB.chiffrer(new Uint8Array(k1), JSON.stringify({ p: [{ i: TEMOIN }] }), nodeCrypto.randomBytes(12)).includes(TEMOIN));

/* ── 2. LE VRAI WORKER ──────────────────────────────────────────────────── */
console.log('\n[2] Serveur — la boîte chiffrée');
const ctx = vm.createContext({ globalThis: {}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise, atob, btoa, fetch: () => Promise.reject(new Error('pas de réseau')) });
ctx.globalThis = ctx; vm.runInContext(WORKER.replace('export default', 'globalThis.__W ='), ctx);
const W = ctx.__W;
const M = new Map();
const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k, v) => { M.set(k, v); }, delete: async k => { M.delete(k); },
  list: async ({ prefix }) => ({ keys: [...M.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }) };
const sha = async t => nodeCrypto.createHash('sha256').update(t).digest('hex');
const CODE = 'CODEMAR77', CODE2 = 'CODEADM88';
M.set('acces', JSON.stringify({ users: [{ h: await sha(CODE), role: 'mar', id: 'MARTIN', liberal: true }, { h: await sha(CODE2), role: 'admin', id: 'ADMIN' }] }));
const env = { KV, PUSH_TOKEN: 'JETON-GAS' };
const appel = (ch, corps) => W.fetch(new Request('https://x' + ch, { method: 'POST', body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } }), env).then(r => r.json().then(j => ({ statut: r.status, j })));
const b64 = n => nodeCrypto.randomBytes(n).toString('base64url');
const id = b64(16), jeton = b64(32);
let r = await appel('/pb-ouvrir', { code: 'FAUX', id, jeton });
V('créer une boîte sans code du portail valide : refusé (403)', r.statut === 403, r);
r = await appel('/pb-ouvrir', { code: CODE, id: 'court', jeton });
V('identifiant mal formé : refusé (400)', r.statut === 400, r);
r = await appel('/pb-ouvrir', { code: CODE.toLowerCase(), id, jeton });
V('code valide (même en minuscules) : boîte créée', r.j.success === true && M.has('pbw_' + id) && M.get('pbu_MARTIN') === id, r);
V('…le jeton d\'écriture n\'est gardé que sous forme d\'empreinte', !M.get('pbw_' + id).includes(jeton) && JSON.parse(M.get('pbw_' + id)).h === await sha(jeton));
r = await appel('/pb-depot', { id, jeton: b64(32), c: 'abc' });
V('déposer avec un autre jeton : refusé (403)', r.statut === 403, r);
r = await appel('/pb-depot', { id, jeton, c: 'pas du base64 !' });
V('contenu qui n\'est pas du texte chiffré : refusé (400)', r.statut === 400, r);
r = await appel('/pb-depot', { id, jeton, c: 'A'.repeat(30001) });
V('contenu trop long : refusé', r.statut === 400);
r = await appel('/pb-depot', { id, jeton, c: 'QUJD' });
V('dépôt accepté avec le bon jeton', r.j.success === true && JSON.parse(M.get('pbw_' + id)).c === 'QUJD');
r = await appel('/pb-lire', { id });
V('lecture : le texte chiffré et l\'heure du dépôt', r.j.success && r.j.c === 'QUJD' && r.j.t > 0, r.j);
r = await appel('/pb-lire', { id: b64(16) });
V('boîte inconnue : 404', r.statut === 404);
r = await appel('/read', { code: CODE2, keys: ['pbw_' + id, 'pbu_MARTIN'] });
V('la boîte est invisible au guichet de lecture du portail (même admin)', !JSON.stringify(r.j).includes('QUJD') && !JSON.stringify(r.j.data || {}).includes(id), r.j);
r = await appel('/push', { token: 'JETON-GAS', items: { ['pbw_' + id]: 'x' } });
V('…et intouchable par le guichet d\'écriture du portail', JSON.parse(M.get('pbw_' + id)).c === 'QUJD', r.j);
const id2 = b64(16), jeton2 = b64(32);
await appel('/pb-ouvrir', { code: CODE, id: id2, jeton: jeton2 });
V('une seule boîte par personne : réactiver efface l\'ancienne', !M.has('pbw_' + id) && M.has('pbw_' + id2) && M.get('pbu_MARTIN') === id2);
r = await appel('/pb-fermer', { id: id2, jeton: b64(32) });
V('fermer sans le jeton : refusé', r.statut === 403 && M.has('pbw_' + id2));
r = await appel('/pb-fermer', { id: id2, jeton: jeton2 });
V('fermer avec le jeton : boîte et lien effacés', r.j.success && !M.has('pbw_' + id2) && !M.has('pbu_MARTIN'));
V('version du serveur montée', /const VERSION = 'miroir 2026-10-30\.\d+';/.test(WORKER));

/* ── 3. LE VRAI PENSE-BÊTE ──────────────────────────────────────────────── */
console.log('\n[3] Pense-bête — activer, envoyer chiffré, désactiver');
const T0 = new Date(2026, 10, 2, 7, 30, 0).getTime();          // lundi 2 novembre 2026
function ouvrir(stock, w0, reseauCoupe) {
  const vc = new VirtualConsole(); const erreurs = []; vc.on('jsdomError', e => erreurs.push(e.message));
  const envois = [];
  const dom = new JSDOM(PAGE, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) {
      const D = w.Date; w.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
      w.Element.prototype.focus = function () {};
      w.fetch = async (u, o) => {
        envois.push({ u: String(u), o });
        if (reseauCoupe) throw new Error('hors ligne');
        const res = await W.fetch(new Request(String(u).replace('https://miroir.planningmedic.workers.dev', 'https://x'), { method: o.method, body: o.body, headers: o.headers }), env);
        const j = await res.json();
        return { ok: res.ok, status: res.status, json: async () => j };
      };
      if (stock) w.localStorage.setItem('pense-bete-lib-v1', stock);
      if (w0) w.localStorage.setItem('pense-bete-widget-v1', w0);
    } });
  const w = dom.window, $ = i => w.document.getElementById(i);
  return { w, $, envois, erreurs,
    ajouter(d, s, ini, a) { $('pPlus').click(); [...w.document.querySelectorAll('#chips .chip')].find(x => x.dataset.s === s).click(); w.document.querySelector('#pAss .chip[data-a="' + a + '"]').click(); $('dt').value = d; $('ini').value = ini; $('frm').dispatchEvent(new w.Event('submit', { cancelable: true })); $('pOk').click(); },
    etatW() { return JSON.parse(w.localStorage.getItem('pense-bete-widget-v1') || 'null'); } };
}
const P = ouvrir();
P.ajouter('2026-11-02', 'Endos', TEMOIN, 'mc'); P.ajouter('2026-11-02', 'Ortho', 'KL', 'fr'); P.ajouter('2026-11-03', 'ORL', 'PB', 'mc');
P.ajouter('2026-11-20', 'Endos', 'LOIN', 'fr'); P.ajouter('2026-10-20', 'Endos', 'VIEUX', 'mc');
await pause(1700);
V('widget éteint (par défaut) : aucun envoi, même après plusieurs ajouts', P.envois.length === 0, P.envois.length);
V('…Réglages montrent « Activer le widget », bas de page « rien n\'est envoyé »', !P.$('wOff').hidden && P.$('wOnB').hidden && /rien n'est envoyé/.test(P.$('pFoot').textContent));
P.$('wOn').click(); await pause(20);
V('activer sans code : message, aucun envoi', /code du portail/.test(P.$('wMsg').textContent) && P.envois.length === 0);
P.$('wCode').value = 'FAUX'; P.$('wOn').click(); await pause(50);
V('code refusé : « Code refusé. », rien d\'activé', /Code refusé/.test(P.$('wMsg').textContent) && !P.etatW(), P.$('wMsg').textContent);
P.$('wCode').value = CODE; P.$('wOn').click(); await pause(80);
const EW = P.etatW();
V('code accepté : widget activé, état affiché, code effacé du champ', !!EW && P.$('wOff').hidden && !P.$('wOnB').hidden && /dernier envoi chiffré aujourd'hui/.test(P.$('wEtat').textContent) && P.$('wCode').value === '', P.$('wEtat').textContent);
V('…la clé à copier a la forme « PB1.identifiant.clé »', /^PB1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(P.$('wCle').textContent));
V('…le code du portail n\'est gardé nulle part dans l\'appareil', !JSON.stringify(Object.assign({}, P.w.localStorage)).includes(CODE));
const corpsEnvoyes = () => P.envois.map(e => e.o.body).join(' ');
V('ce qui est parti : le code (à l\'activation), l\'identifiant, le jeton, du texte chiffré — aucune initiale, aucun secteur',
  !corpsEnvoyes().includes(TEMOIN) && !corpsEnvoyes().includes('KL') && !/Endos|Ortho|ORL/.test(corpsEnvoyes()) && !corpsEnvoyes().includes(EW.cle), corpsEnvoyes().slice(0, 200));
V('…uniquement vers le serveur du portail, routes de la boîte', P.envois.every(e => /^https:\/\/miroir\.planningmedic\.workers\.dev\/pb-(ouvrir|depot)$/.test(e.u)), P.envois.map(e => e.u));
const boite = () => JSON.parse(M.get('pbw_' + EW.id) || 'null');
const lu = () => JSON.parse(PB.dechiffrer(PB.b64d(EW.cle), boite().c));
V('la boîte déchiffrée avec la clé : les 3 patients des 7 prochains jours, avec secteur et Monaco / France',
  lu().p.length === 3 && lu().p.some(x => x.i === TEMOIN && x.s === 'Endos' && x.a === 'mc' && x.d === '2026-11-02') && lu().le === '2026-11-02', lu());
V('…ni le patient du 20/11 (au-delà de 7 jours), ni le passé', !lu().p.some(x => x.i === 'LOIN' || x.i === 'VIEUX'));
const n0 = P.envois.length;
P.ajouter('2026-11-04', 'Cardio', 'YZ', 'fr'); P.ajouter('2026-11-04', 'Cardio', 'YW', 'fr');
await pause(300);
V('deux ajouts rapprochés : pas d\'envoi immédiat (attente d\'1,5 s)', P.envois.length === n0);
await pause(1500);
V('…puis UN seul envoi, la boîte contient les 5 patients', P.envois.length === n0 + 1 && lu().p.length === 5, [P.envois.length - n0, lu().p.length]);
P.$('wEnv').click(); await pause(50);
V('« Envoyer maintenant » : envoyé', /Envoyé/.test(P.$('wMsg').textContent));
let copie = null; P.w.navigator.clipboard = { writeText: t => { copie = t; return Promise.resolve(); } };
P.$('wCopier').click(); await pause(10);
V('« Copier la clé » copie la clé complète', copie === P.$('wCle').textContent && /Clé copiée/.test(P.$('wMsg').textContent));
// Réouverture le lendemain : la fenêtre avance toute seule
const Q = ouvrir(P.w.localStorage.getItem('pense-bete-lib-v1'), JSON.stringify(Object.assign({}, EW, { jour: '2026-11-01' })));
await pause(80);
V('première ouverture d\'une nouvelle journée : un envoi automatique', Q.envois.length === 1 && /pb-depot$/.test(Q.envois[0].u));
const Q2 = ouvrir(P.w.localStorage.getItem('pense-bete-lib-v1'), JSON.stringify(Object.assign({}, EW, { jour: '2026-11-02' })));
await pause(80);
V('…mais pas à chaque ouverture du même jour', Q2.envois.length === 0);
// Réseau coupé
const H = ouvrir(null, JSON.stringify(Object.assign({}, EW, { jour: '2026-11-01' })), true);   // nouvelle journée : il tente d'envoyer
await pause(50);
V('pas de réseau : l\'état le dit, sans erreur JavaScript', /pas de réseau/.test(H.$('wEtat').textContent) && H.$('wEtat').classList.contains('ko') && H.erreurs.length === 0, H.$('wEtat').textContent);
// Désactiver (deux touchers)
P.$('wOffB').click();
V('désactiver : demande un 2e toucher', /Toucher encore/.test(P.$('wOffB').textContent) && !!P.etatW());
P.$('wOffB').click(); await pause(60);
V('2e toucher : désactivé, clé oubliée, boîte effacée sur le serveur', !P.etatW() && !P.$('wOff').hidden && !M.has('pbw_' + EW.id) && /rien n'est envoyé/.test(P.$('pFoot').textContent));
const n1 = P.envois.length;
P.ajouter('2026-11-05', 'Mater', 'BC', 'mc'); await pause(1700);
V('…et plus aucun envoi ensuite', P.envois.length === n1);
V('pense-bête : aucune erreur JavaScript', P.erreurs.length === 0 && Q.erreurs.length === 0, P.erreurs);
V('la sauvegarde JSON n\'emporte pas la clé du widget', !/widget/.test((PAGE.match(/function svContenu\(\)\{[^}]*\}/) || [''])[0]));

/* ── 4. LE VRAI SCRIPT SCRIPTABLE, dans une imitation de Scriptable ────── */
console.log('\n[4] Widget Scriptable — grand widget et écran verrouillé');
// Une boîte réelle, remplie par le pense-bête
const R = ouvrir(); R.ajouter('2026-11-02', 'Ortho', 'JD', 'mc'); R.ajouter('2026-11-02', 'Endos', 'AB', 'mc'); R.ajouter('2026-11-02', 'Endos', 'ML', 'fr');
R.ajouter('2026-11-03', 'ORL', 'PB', 'mc');
R.$('wCode').value = CODE; R.$('wOn').click(); await pause(80);
const CLE = R.$('wCle').textContent;
function scriptable({ famille, cle, reseauCoupe, cache, maintenant }) {
  const textes = [], trousseau = new Map(cle ? [['patients-lib-cle', cle]] : []), fichiers = new Map(cache ? [['/doc/patients-lib-cache.json', cache]] : []);
  let widget = null, alertes = 0;
  class Color { constructor(h) { this.h = h; } static dynamic(c) { return c; } }
  const Font = { systemFont: n => ({ n }), boldSystemFont: n => ({ n, b: 1 }), semiboldSystemFont: n => ({ n, b: 1 }) };
  const pile = () => ({ addText(t) { const x = { t: String(t) }; textes.push(x); return x; }, addStack() { return pile(); }, addSpacer() {}, layoutHorizontally() {}, layoutVertically() {},
    centerAlignContent() {}, bottomAlignContent() {}, setPadding() {} });
  class ListWidget { constructor() { Object.assign(this, pile()); } presentLarge() { widget = this; } }
  class Request { constructor(u) { this.url = u; } async loadJSON() {
    if (reseauCoupe) throw new Error('hors ligne');
    const res = await W.fetch(new globalThis.Request(this.url.replace('https://miroir.planningmedic.workers.dev', 'https://x'), { method: this.method, body: this.body, headers: this.headers }), env);
    return res.json(); } }
  const D = Date; const DateFixe = class extends D { constructor(...a) { super(...(a.length ? a : [maintenant || T0])); } static now() { return maintenant || T0; } };
  const g = { Color, Font, ListWidget, Request, Date: DateFixe, console,
    Keychain: { contains: k => trousseau.has(k), get: k => trousseau.get(k), set: (k, v) => trousseau.set(k, v) },
    FileManager: { local: () => ({ documentsDirectory: () => '/doc', joinPath: (a, b) => a + '/' + b, fileExists: f => fichiers.has(f), readString: f => fichiers.get(f), writeString: (f, s) => fichiers.set(f, s) }) },
    Alert: class { addTextField() {} addAction() {} addCancelAction() {} async present() { alertes++; return -1; } textFieldValue() { return ''; } },
    Pasteboard: { paste: () => '' }, Script: { setWidget: w => { widget = w; }, complete() {} },
    config: { runsInWidget: true, runsInApp: false, widgetFamily: famille }, args: {}, module: {} };
  return { g, textes, fichiers, get widget() { return widget; }, get alertes() { return alertes; } };
}
async function lancer(o) {
  const s = scriptable(o);
  const fn = new Function(...Object.keys(s.g), 'return (async () => {\n' + SCRIPT + '\n})();');
  let erreur = null; try { await fn(...Object.values(s.g)); } catch (e) { erreur = e.message; }
  return { s, erreur, tout: s.textes.map(x => x.t).join(' | ') };
}
let L1 = await lancer({ famille: 'large', cle: CLE });
V('grand widget : aucune erreur, widget posé', !L1.erreur && !!L1.s.widget, L1.erreur);
V('…titre du jour et nombre : « LUNDI 2 NOVEMBRE », « 3 »', /LUNDI 2 NOVEMBRE/.test(L1.tout) && L1.s.textes.some(x => x.t === '3'), L1.tout);
const tx = t => L1.s.textes.find(x => x.t === t);
V('…initiales par secteur, Endos avant Ortho', L1.tout.indexOf('Endos') < L1.tout.indexOf('Ortho') && !!tx('AB') && !!tx('ML') && !!tx('JD'), L1.tout);
V('…Monaco en rouge, France en bleu', tx('AB').textColor.h === '#C8102E' && tx('JD').textColor.h === '#C8102E' && tx('ML').textColor.h === '#1F4FA3');
V('…pied : « Demain · 1 », « Monaco 2 », « France 1 »', /Demain · 1/.test(L1.tout) && /Monaco 2/.test(L1.tout) && /France 1/.test(L1.tout), L1.tout);
V('…rafraîchissement demandé dans 15 minutes', L1.s.widget.refreshAfterDate && L1.s.widget.refreshAfterDate.getTime() - T0 === 15 * 60000);
V('…liste gardée en secours sur l\'iPhone', L1.s.fichiers.has('/doc/patients-lib-cache.json'));
const L2 = await lancer({ famille: 'accessoryRectangular', cle: CLE });
V('écran verrouillé (rectangle) : seulement « Patients lib » et « 3 aujourd\'hui »', L2.tout === "Patients lib | 3 aujourd'hui", L2.tout);
const L3 = await lancer({ famille: 'accessoryInline', cle: CLE });
V('écran verrouillé (ligne) : « 3 patients lib aujourd\'hui », sans initiales', L3.tout === "3 patients lib aujourd'hui", L3.tout);
const L4 = await lancer({ famille: 'accessoryCircular', cle: CLE });
V('écran verrouillé (rond) : le nombre seul', L4.tout === '3 | lib', L4.tout);
const L5 = await lancer({ famille: 'small', cle: CLE });
V('petit widget : nombre et secteurs, sans initiales', !L5.erreur && L5.s.textes.some(x => x.t === '3') && /Endos \| 2/.test(L5.tout) && !/AB|ML|JD/.test(L5.tout), L5.tout);
const demain = new Date(2026, 10, 3, 8, 0, 0).getTime();
const L6 = await lancer({ famille: 'large', cle: CLE, maintenant: demain });
V('le lendemain, sans nouvel envoi : le widget passe seul au 3 novembre (1 patient, PB)', /MARDI 3 NOVEMBRE/.test(L6.tout) && L6.s.textes.some(x => x.t === 'PB') && !L6.s.textes.some(x => x.t === 'AB'), L6.tout);
const L7 = await lancer({ famille: 'large', cle: CLE, reseauCoupe: true, cache: L1.s.fichiers.get('/doc/patients-lib-cache.json') });
V('sans réseau : la dernière liste, signalée « hors ligne »', L7.s.textes.some(x => x.t === 'AB') && /hors ligne/.test(L7.tout), L7.tout);
const L8 = await lancer({ famille: 'large', cle: CLE.slice(0, -4) + 'AAAA' });
V('mauvaise clé : « Clé incorrecte », aucune initiale', /Clé incorrecte/.test(L8.tout) && !/AB|ML/.test(L8.tout) && !L8.erreur, L8.tout);
const L9 = await lancer({ famille: 'large', cle: '' });
V('sans clé : explique quoi faire, sans planter', /coller la clé/.test(L9.tout) && !L9.erreur, L9.tout);
R.$('wOffB').click(); R.$('wOffB').click(); await pause(60);
const L10 = await lancer({ famille: 'large', cle: CLE });
V('widget désactivé dans le pense-bête : le widget le dit', /Widget désactivé/.test(L10.tout), L10.tout);
V('le script ne contient aucune clé ni aucun code', !/PB1\.[A-Za-z0-9_-]{22}\./.test(SCRIPT) && !SCRIPT.includes(CODE));
const codeSeul = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
V('le widget n\'utilise ni crypto.subtle, ni TextEncoder, ni WebView (code, hors commentaires)', !/crypto\.subtle|TextEncoder|TextDecoder|WebView/.test(codeSeul));

console.log(`\n${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
