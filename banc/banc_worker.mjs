/* ═══ BANC — le VRAI worker.js exécuté, avec un KV simulé ═══ */
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
const ctx = vm.createContext({ globalThis: {}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise, btoa, atob });
ctx.globalThis = ctx; vm.runInContext(src, ctx);
const W = ctx.__W;

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

// KV simulé
const M = new Map();
const KV = {
  get: async k => (M.has(k) ? M.get(k) : null),
  put: async (k, v) => { M.set(k, v); },
  delete: async k => { M.delete(k); },
  list: async ({ prefix, limit }) => ({ keys: [...M.keys()].filter(k => k.startsWith(prefix)).slice(0, limit || 1000).map(name => ({ name })) }),
};
const sha256hex = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
const CODE_ADMIN = 'CODEADMIN99', CODE_MAR = 'CODEMAR11';
M.set('acces', JSON.stringify({ users: [
  { h: await sha256hex(CODE_ADMIN), role: 'admin', id: 'DURAND' },
  { h: await sha256hex(CODE_MAR), role: 'mar', id: 'BOISSY' },
]}));
const env = { KV, PUSH_TOKEN: 'JETON-SECRET' };
const appel = (chemin, corps) => W.fetch(new Request('https://x' + chemin, { method: 'POST', body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } }), env).then(r => r.json().then(j => ({ statut: r.status, j })));

console.log('\n═══ 3. Le VRAI Worker, exécuté ═══');
// dépôt admin
let r = await appel('/ecrire', { code: CODE_ADMIN, intention: { type: 'placements', year: 2027, items: [{ date: '2027-03-03', marId: 'CHAPUIS', morning: 'MAT' }] } });
V('dépôt admin accepté', r.j.success === true && /^j_/.test(r.j.cle), r.j);
const cle1 = r.j.cle;
// refus MAR
r = await appel('/ecrire', { code: CODE_MAR, intention: { type: 'placements', year: 2027, items: [] } });
V('dépôt refusé pour un MAR (403)', r.statut === 403 && r.j.success === false, r);
// refus code inconnu
r = await appel('/ecrire', { code: 'FAUX', intention: { type: 'publier', year: 2027 } });
V('dépôt refusé pour un code inconnu', r.statut === 403);
// type inconnu
r = await appel('/ecrire', { code: CODE_ADMIN, intention: { type: 'bidule' } });
V('type d\'intention inconnu refusé (400)', r.statut === 400, r.j);
// ordre : 2e dépôt
await new Promise(res => setTimeout(res, 5));
r = await appel('/ecrire', { code: CODE_ADMIN, intention: { type: 'publier', year: 2027 } });
const cle2 = r.j.cle;
V('les clés sont croissantes (ordre garanti)', cle1 < cle2, [cle1, cle2]);
// tirer : jeton
r = await appel('/tirer', { token: 'MAUVAIS' });
V('/tirer refuse un mauvais jeton', r.statut === 403);
r = await appel('/tirer', { token: 'JETON-SECRET' });
V('/tirer rend les 2 fiches', r.j.success && r.j.fiches.length === 2, r.j.fiches && r.j.fiches.length);
V('la fiche porte son auteur', r.j.fiches[0].valeur.par === 'DURAND', r.j.fiches[0].valeur);
// état
r = await appel('/journal-etat', { code: CODE_ADMIN });
V('/journal-etat (code admin) : 2 en attente', r.j.enAttente === 2, r.j.enAttente);
// purge avec résultats
r = await appel('/purger', { token: 'JETON-SECRET', resultats: [{ cle: cle1, ok: true, detail: '1 placement' }, { cle: cle2, ok: false, detail: 'erreur test' }] });
V('/purger retire les 2 fiches', r.j.purgees === 2, r.j);
r = await appel('/tirer', { token: 'JETON-SECRET' });
V('la file est vide après purge', r.j.fiches.length === 0);
r = await appel('/journal-etat', { code: CODE_ADMIN });
V('le registre garde les 2 fiches appliquées', r.j.dernieresAppliquees.length === 2, r.j.dernieresAppliquees.length);
V('l\'échec est tracé avec son motif', r.j.dernieresAppliquees.some(f => f.ok === false && f.detail === 'erreur test'));
// non-régression : /read fonctionne toujours
M.set('planning_2027', JSON.stringify({ mois: 'test' }));
r = await appel('/read', { code: CODE_ADMIN, keys: ['planning_2027'] });
V('NON-RÉGRESSION : /read rend bien la valeur demandée', r.j.success === true && !!(r.j.data && r.j.data.planning_2027), r.j);
r = await appel('/read', { code: CODE_MAR, keys: ['config_admin'] });
V('NON-RÉGRESSION : un MAR n\'obtient pas config_admin', !(r.j.data && r.j.data.config_admin), r.j);
// clé mail : admin seul
M.set('mail_nonlus', JSON.stringify({ success: true, nonLus: 4 }));
r = await appel('/read', { code: CODE_ADMIN, keys: ['mail_nonlus'] });
V('compteur courrier lisible par l\'admin', !!(r.j.data && r.j.data.mail_nonlus), r.j.data);
r = await appel('/read', { code: CODE_MAR, keys: ['mail_nonlus'] });
V('compteur courrier REFUSÉ à un MAR', !(r.j.data && r.j.data.mail_nonlus), r.j.data);

console.log('\n═══ 46. Volet libéral : mirrorable, et SANS montants ═══');
{
  M.set('liberal_2027', JSON.stringify({ success: true, annee: 2027, jours: {
    '2027-03-03': [{ marId: 'ALPHA', secteur: 'END', chirurgie: 'cataracte' }] } }));
  let r = await appel('/read', { code: CODE_ADMIN, keys: ['liberal_2027'] });
  V('l\'admin obtient le volet libéral', !!(r.j.data && r.j.data.liberal_2027), Object.keys(r.j.data || {}));
  const brut = JSON.stringify(r.j.data.liberal_2027);
  V('aucun montant ne circule', !/brCcam|brNgap|montant/i.test(brut), brut.slice(0, 120));
  V('les champs sont exactement ceux affichés', /marId/.test(brut) && /secteur/.test(brut) && /chirurgie/.test(brut));
  r = await appel('/read', { code: CODE_MAR, keys: ['liberal_2027'] });
  V('un MAR n\'obtient PAS le volet du comité', !(r.j.data && r.j.data.liberal_2027), r.j.refuses);
}

console.log('\n═══ Lu/★ par MAR : la clé veille_marques, filtrée POUR TOUS ═══');
{
  M.set('veille_marques', JSON.stringify({ parMar: {
    BOISSY:   { lus: ['101', '102'], stars: ['103'] },
    DURAND: { lus: ['201'],        stars: [] },
    CHAPUIS: { lus: ['301'],        stars: ['301'] },
  }, t: Date.now() }));

  // Le MAR ne reçoit que SES marques
  let r = await appel('/read', { code: CODE_MAR, keys: ['veille_marques'] });
  const vmM = r.j.data && r.j.data.veille_marques;
  V('un MAR obtient la clé veille_marques', !!vmM, r.j);
  V('il ne reçoit QUE ses marques (BOISSY seul)', vmM && Object.keys(vmM.parMar).length === 1 && !!vmM.parMar.BOISSY, vmM && Object.keys(vmM.parMar));
  V('ses lus et ses étoiles sont complets', vmM && vmM.parMar.BOISSY.lus.length === 2 && vmM.parMar.BOISSY.stars[0] === '103', vmM && vmM.parMar.BOISSY);
  V('les marques de CHAPUIS ne fuient pas', vmM && !vmM.parMar.CHAPUIS);

  // L'ADMIN AUSSI est filtré — contrairement aux indispos : lire est personnel
  r = await appel('/read', { code: CODE_ADMIN, keys: ['veille_marques'] });
  const vmA = r.j.data && r.j.data.veille_marques;
  V('l\'admin obtient la clé', !!vmA);
  V('l\'admin est filtré LUI AUSSI (DURAND seul, jamais les autres)', vmA && Object.keys(vmA.parMar).length === 1 && !!vmA.parMar.DURAND && !vmA.parMar.BOISSY, vmA && Object.keys(vmA.parMar));

  // Poussée par le GAS : la clé est acceptée à l'écriture /push
  r = await appel('/push', { token: 'JETON-SECRET', items: { veille_marques: JSON.stringify({ parMar: { BOISSY: { lus: ['999'], stars: [] } }, t: 1 }) } });
  V('le GAS peut pousser veille_marques', r.j.success === true, r.j);
  r = await appel('/read', { code: CODE_MAR, keys: ['veille_marques'] });
  V('la nouvelle valeur est servie, toujours filtrée', r.j.data.veille_marques.parMar.BOISSY.lus[0] === '999', r.j.data.veille_marques);
}

console.log('\n═══ Agenda d\'abonnement : gardes et 18h d\'un MAR, qui suivent dons et échanges ═══');
{
  const CODE_SEC = 'CODESEC77', CODE_MAR2 = 'CODEMAR22';
  const acc = JSON.parse(M.get('acces'));
  acc.users.push({ h: await sha256hex(CODE_SEC), role: 'secretariat', id: 'SECR' }, { h: await sha256hex(CODE_MAR2), role: 'mar', id: 'LEROY' });
  M.set('acces', JSON.stringify(acc));
  const jours = ['2026-11-28', '2026-11-29', '2026-11-30'];
  const plan = (boissy, leroy) => JSON.stringify({ months: [{ id: '2026-11', days: jours.map(date => ({ date })),
    doctors: [{ id: 'BOISSY', days: boissy.map(status => ({ status })) }, { id: 'LEROY', days: leroy.map(status => ({ status })) }] }] });
  M.set('annees', JSON.stringify({ active: 2026, annees: [{ annee: 2020 }, { annee: 2026 }] }));
  M.set('planning_2026', plan(['G', 'V', '18'], ['', 'G2', 'G']));
  M.set('planning_2020', JSON.stringify({ months: [{ days: [{ date: '2020-03-03' }], doctors: [{ id: 'BOISSY', days: [{ status: 'G' }] }] }] }));
  const getIcs = chemin => W.fetch(new Request('https://x' + chemin, { method: 'GET' }), env).then(async r => ({ statut: r.status, type: r.headers.get('Content-Type') || '', txt: await r.text() }));

  let r = await appel('/agenda-lien', { code: '' });
  V('agenda : lien refusé sans code', r.statut === 403);
  r = await appel('/agenda-lien', { code: 'FAUX' });
  V('agenda : lien refusé pour un code inconnu', r.statut === 403);
  r = await appel('/agenda-lien', { code: CODE_SEC });
  V('agenda : pas de lien pour le secrétariat', r.statut === 403);
  r = await appel('/agenda-lien', { code: CODE_MAR });
  const ch1 = r.j.chemin;
  V('agenda : un MAR obtient son lien personnel', r.j.success === true && /^\/agenda\/[A-Za-z0-9_-]{32}\.ics$/.test(ch1 || ''), r.j);
  r = await appel('/agenda-lien', { code: CODE_MAR });
  V('agenda : le même lien lui est réaffiché (pas un nouveau à chaque appui)', r.j.chemin === ch1);
  const chL = (await appel('/agenda-lien', { code: CODE_MAR2 })).j.chemin;
  V('agenda : deux MAR, deux liens différents', chL && chL !== ch1);

  let a = await getIcs(ch1);
  V('agenda : servi comme calendrier', a.statut === 200 && /^text\/calendar/.test(a.type), a);
  V('agenda : nom « Mes gardes » et relecture horaire demandée', /X-WR-CALNAME:Mes gardes/.test(a.txt) && /REFRESH-INTERVAL;VALUE=DURATION:PT1H/.test(a.txt));
  V('agenda : la garde réa du 28/11 en journée entière', /DTSTART;VALUE=DATE:20261128\r\nDTEND;VALUE=DATE:20261129\r\nSUMMARY:Garde réa/.test(a.txt), a.txt);
  V('agenda : le 18h du 30/11, fin au 1er décembre', /DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\nSUMMARY:18h/.test(a.txt));
  V('agenda : les vacances n\'y sont pas', (a.txt.match(/BEGIN:VEVENT/g) || []).length === 2, a.txt);
  V('agenda : rien des gardes d\'un collègue', !/Garde mater/.test(a.txt));
  V('agenda : une vieille année (2020) n\'est pas servie', !/2020/.test(a.txt.replace(/DTSTAMP:\S+/g, '')));
  V('agenda : lignes au format calendrier (CRLF)', a.txt.indexOf('\r\n') > 0 && a.txt.split('\r\n').every(l => l.length <= 75));
  const b = await getIcs(chL);
  V('agenda : celui du collègue ne montre que les siennes', /SUMMARY:Garde mater/.test(b.txt) && (b.txt.match(/BEGIN:VEVENT/g) || []).length === 2);

  // DON : la garde réa du 28 passe de BOISSY à LEROY → les deux agendas suivent.
  M.set('planning_2026', plan(['', 'V', '18'], ['G', 'G2', 'G']));
  a = await getIcs(ch1);
  V('agenda : après un don, la garde quitte l\'agenda du donneur', !/20261128/.test(a.txt) && /SUMMARY:18h/.test(a.txt));
  V('agenda : … et arrive dans celui du receveur', /DTSTART;VALUE=DATE:20261128/.test((await getIcs(chL)).txt));

  // NOUVEAU LIEN : l'ancien devient muet.
  r = await appel('/agenda-lien', { code: CODE_MAR, nouveau: true });
  V('agenda : « nouveau lien » en tire un autre', r.j.success && r.j.chemin !== ch1);
  V('agenda : l\'ancien lien ne renvoie plus rien (404)', (await getIcs(ch1)).statut === 404);
  V('agenda : le nouveau fonctionne', (await getIcs(r.j.chemin)).statut === 200);
  V('agenda : un lien inventé → 404', (await getIcs('/agenda/' + 'A'.repeat(32) + '.ics')).statut === 404);
  V('agenda : un chemin mal formé reste refusé (405)', (await getIcs('/agenda/court.ics')).statut === 405);

  // Le GAS ne peut ni écrire ni effacer les liens.
  r = await appel('/push', { token: 'JETON-SECRET', items: { agu_BOISSY: null, ['agj_x']: 'X' } });
  V('agenda : le dépôt du serveur ne touche pas aux liens', M.has('agu_BOISSY') && (r.j.refuses || []).length === 2, r.j);
}

console.log('\n═══ 3 ter. La version du Worker ne vit qu'+"'"+'à un seul endroit ═══');
{
  /* (16/08/2026) Le fichier portait DEUX versions : un commentaire d'en-tête
     figé à « 2026-08-05.7 » et la constante servie, « 2026-08-13.4 » — huit
     versions d'écart. Le commentaire ne trompait personne en production (c'est
     la constante qui est renvoyée), mais il désignait, un jour de panne, une
     dérive de déploiement inexistante. Le commentaire est supprimé ; ce test
     empêche qu'un second numéro réapparaisse. */
  const brut = fs.readFileSync('../cloudflare/worker.js', 'utf8');
  const constante = brut.match(/const VERSION = '(miroir [\d.-]+)';/);
  V('la constante VERSION est lisible', !!constante, constante && constante[1]);

  /* Toute autre écriture d'une version « miroir AAAA-MM-JJ.N » dans le fichier. */
  const toutes = (brut.match(/miroir \d{4}-\d{2}-\d{2}\.\d+/g) || []);
  V('elle est la SEULE version écrite dans le fichier', toutes.length === 1, toutes);

  /* Et c'est bien elle que le Worker annonce à ses trois guichets. */
  const r = await W.fetch(new Request('https://x/', { method: 'GET' }), env).then(x => x.json());
  V('le guichet de santé annonce cette version exacte',
    r.service === constante[1], { annonce: r.service, fichier: constante[1] });
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
