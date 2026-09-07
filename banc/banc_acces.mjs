/* ═══ BANC — P1 : ACCÈS ET RÔLES (cahier T001 → T012) ═══
   Automatise les points du cahier qui portent sur l'authentification et le
   cloisonnement des rôles. Le VRAI Worker est exécuté : ce sont ses règles
   qui décident, pas une reconstitution. */
import fs from 'fs';
import vm from 'vm';
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,180) : '')); } };

const src = fs.readFileSync('../cloudflare/worker.js', 'utf8').replace('export default', 'globalThis.__W =');
const ctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
ctx.globalThis = ctx; vm.runInContext(src, ctx);
const W = ctx.__W, M = new Map();
const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
  list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };

const ADMIN = 'COMITE2027', MAR_A = 'MARALPHA1', MAR_B = 'MARBRAVO2', SECRET = 'SECRET123';
M.set('acces', JSON.stringify({ indisposYear: 2027, indisposOuverte: true, users: [
  { h: await sha(ADMIN),  role: 'admin',       id: 'DURAND', name: 'DURAND', initials: 'AF', prenom: 'Arthur', liberal: true },
  { h: await sha(MAR_A),  role: 'mar',         id: 'ALPHA',    name: 'ALPHA',    initials: 'AL', prenom: 'Test' },
  { h: await sha(MAR_B),  role: 'mar',         id: 'BRAVO',    name: 'BRAVO',    initials: 'BR', prenom: 'Test' },
  { h: await sha(SECRET), role: 'secretariat', id: 'SECR',     name: 'Secrétariat', initials: 'SE' },
]}));
M.set('annees', JSON.stringify({ active: 2027, annees: [{annee:2026,archivee:false},{annee:2027,archivee:false}] }));
M.set('planning_2027', JSON.stringify({ months: [], equiteInitiale: {} }));
M.set('config_admin', JSON.stringify({ medecins: [{id:'ALPHA'},{id:'BRAVO'}], overrides: [] }));
M.set('gardes_2027', JSON.stringify({ success:true, data:{} }));
M.set('indispos_2027', JSON.stringify({ parMar: { ALPHA: ['2027-02-02'], BRAVO: ['2027-03-03'] } }));
M.set('mail_nonlus', JSON.stringify({ success:true, nonLus: 2 }));
M.set('liberal_2027', JSON.stringify({ success:true, jours: {} }));
const env = { KV, PUSH_TOKEN: 'JETON' };
const lire = (code, keys) => W.fetch(new Request('https://w/read', { method:'POST', body: JSON.stringify({ code, keys }) }), env)
  .then(r => r.json().then(j => ({ statut: r.status, j })));

console.log('\n═══ T001 · le comité accède, et son identité est juste ═══');
{
  const r = await lire(ADMIN, ['planning_2027', 'config_admin', 'annees']);
  V('accès accordé', r.j.success === true, r.j.error);
  V('rôle admin reconnu', r.j.identite.role === 'admin', r.j.identite);
  V('identité complète (nom, initiales, prénom)', !!(r.j.identite.name && r.j.identite.initials && r.j.identite.prenom), r.j.identite);
  V('l\'empreinte du code ne revient JAMAIS au navigateur', !('h' in r.j.identite), Object.keys(r.j.identite));
  V('l\'année active est transmise', r.j.data.annees.active === 2027, r.j.data.annees);
}

console.log('\n═══ T002 · un MAR accède à ce qui le concerne ═══');
{
  const r = await lire(MAR_A, ['planning_2027', 'annees']);
  V('accès accordé', r.j.success === true);
  V('rôle mar reconnu', r.j.identite.role === 'mar', r.j.identite.role);
  V('le planning lui est servi', !!r.j.data.planning_2027);
}

console.log('\n═══ T003 · le secrétariat ne lit RIEN au miroir ═══');
{
  const r = await lire(SECRET, ['planning_2027']);
  V('refus explicite (règle « dates seules »)', r.j.success === false, r.j);
  V('aucune donnée ne fuit', !r.j.data, r.j.data);
  V('le motif est lisible', /rôle|autoris/i.test(r.j.error || ''), r.j.error);
}

console.log('\n═══ T004 · code inexistant ═══');
{
  const r = await lire('ZZZZ99', ['planning_2027']);
  V('refus', r.j.success === false);
  V('message compréhensible, sans « undefined »', /code invalide/i.test(r.j.error || '') && !/undefined/.test(JSON.stringify(r.j)), r.j.error);
}

console.log('\n═══ T005 · code vide, et code entouré d\'espaces ═══');
{
  const vide = await lire('', ['planning_2027']);
  V('code vide : refus propre', vide.j.success === false && /absent/i.test(vide.j.error || ''), vide.j.error);
  const espaces = await lire('  ' + MAR_A + '  ', ['planning_2027']);
  V('espaces nettoyés : le code fonctionne', espaces.j.success === true, espaces.j.error);
  const minuscules = await lire(MAR_A.toLowerCase(), ['planning_2027']);
  V('casse indifférente', minuscules.j.success === true, minuscules.j.error);
}

console.log('\n═══ T006 · un MAR ne voit que SES données ═══');
{
  const r = await lire(MAR_A, ['indispos_2027']);
  const parMar = r.j.data.indispos_2027 && r.j.data.indispos_2027.parMar;
  V('il reçoit les siennes', !!(parMar && parMar.ALPHA), parMar && Object.keys(parMar));
  V('il ne reçoit PAS celles de son collègue', !(parMar && parMar.BRAVO), parMar && Object.keys(parMar));
  const interdites = await lire(MAR_A, ['config_admin', 'gardes_2027', 'mail_nonlus', 'liberal_2027', 'vacances_admin']);
  V('aucune clé réservée au comité ne lui est servie',
    Object.keys(interdites.j.data || {}).length === 0, Object.keys(interdites.j.data || {}));
  V('les refus sont NOMMÉS (pas silencieux)', (interdites.j.refuses || []).length >= 4, interdites.j.refuses);
}

console.log('\n═══ T010 · le secrétariat ne peut rien forcer, même en console ═══');
{
  for (const cle of ['config_admin', 'planning_2027', 'gardes_2027', 'acces']) {
    const r = await lire(SECRET, [cle]);
    V(`« ${cle} » refusé au secrétariat`, r.j.success === false || !(r.j.data && r.j.data[cle]), r.j);
  }
}

console.log('\n═══ T011 · deux sessions simultanées n\'interfèrent pas ═══');
{
  const [a, b] = await Promise.all([lire(ADMIN, ['config_admin']), lire(MAR_A, ['planning_2027'])]);
  V('l\'admin garde son rôle', a.j.identite.role === 'admin');
  V('le MAR garde le sien', b.j.identite.role === 'mar');
  V('chacun reçoit ce qui lui revient', !!a.j.data.config_admin && !b.j.data.config_admin, { admin: Object.keys(a.j.data), mar: Object.keys(b.j.data) });
}

console.log('\n═══ T012 · campagne figée : le drapeau traverse le Worker ═══');
{
  /* (26/08/2026) `indisposFigees` : le planning de l'année de campagne est déjà
     généré — la tuile indispos du portail passe en consultation seule. Le drapeau
     vit dans la clé `acces` (miroir.gs) et doit ressortir dans l'identité. */
  const avant = M.get('acces');
  const r0 = await lire(MAR_A, ['annees']);
  V('clé « acces » d\'avant le drapeau : valeur sûre false', r0.j.identite.indisposFigees === false, r0.j.identite.indisposFigees);
  const j = JSON.parse(avant); j.indisposFigees = true; M.set('acces', JSON.stringify(j));
  const r1 = await lire(MAR_A, ['annees']);
  V('drapeau posé dans « acces » : l\'identité le porte', r1.j.identite.indisposFigees === true, r1.j.identite.indisposFigees);
  M.set('acces', avant);
}

console.log('\n═══ La clé « acces » elle-même n\'est jamais lisible ═══');
{
  for (const [nom, code] of [['comité', ADMIN], ['MAR', MAR_A], ['secrétariat', SECRET]]) {
    const r = await lire(code, ['acces']);
    V(`« acces » refusé au ${nom} — les empreintes ne sortent jamais`, !(r.j.data && r.j.data.acces), r.j.data);
  }
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
