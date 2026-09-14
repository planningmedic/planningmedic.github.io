/* ═══ BANC — les quotas de congés viennent du serveur (14/09/2026, chantier 11) ═══
   staff.html portait une copie figée de CONFIG_CONGES, fausse quatre fois.
   Désormais la table voyage avec la config (action getVacancesConfig et clé
   miroir vacances_admin) ; la page l'affiche. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const STAFF = fs.readFileSync(path.join(__dirname, '..', 'staff.html'), 'utf8');
const IND = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
const MIR = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');

console.log('═══ 1. Le serveur sert la table, par les deux chemins ═══');
V('l\'action getVacancesConfig renvoie quotasConges, lu par _loadQuotasConges (la même lecture que les quotas du serveur)',
  /getVacancesConfig'[\s\S]{0,3000}quotasConges:_loadQuotasConges\(\)/.test(IND));
V('la clé miroir vacances_admin porte la même table', /noel: noel, quotasConges: _loadQuotasConges\(\) \}/.test(MIR));
V('une modification de CONFIG_CONGES rafraîchit vacances_admin', /CONFIG_CONGES: \['vacances_admin'\]/.test(MIR));

console.log('\n═══ 2. staff.html affiche ce que le serveur envoie ═══');
{
  const src = STAFF.slice(STAFF.indexOf('let QUOTAS_SERVEUR=null;'), STAFF.indexOf('\n};', STAFF.indexOf('const getQuota=')) + 3);
  const ctx = vm.createContext({ Number, Math, Object, String });
  vm.runInContext(src + '\nglobalThis.getQuota = getQuota; globalThis.setServeur = t => { QUOTAS_SERVEUR = t; };', ctx);
  V('sans réponse serveur : 0 et un signalement, plus de table locale (repli retiré le 14/09 au soir)', ctx.getQuota('VAC', 100) === 0 && !/QUOTAS_REPLI/.test(STAFF));
  ctx.setServeur({ 100: { vac: 40, form: 11, ctp: 0 }, 80: { vac: 32, form: 9, ctp: 10 }, 50: { vac: 20, form: 6, ctp: 25 } });
  V('avec la table du serveur : ce sont SES chiffres (40 jours, pas 37)', ctx.getQuota('VAC', 100) === 40 && ctx.getQuota('FORM', 100) === 11);
  /* Égalité de distance (90 entre 80 et 100) : le serveur garde le premier palier
     rencontré en ordre croissant — 80. Le client reproduit exactement ce choix. */
  V('quotité absente de la table → palier le plus proche, comme le serveur (90 → 80 par égalité ; 60 → 50)', ctx.getQuota('VAC', 90) === 32 && ctx.getQuota('VAC', 60) === 20, [ctx.getQuota('VAC', 90), ctx.getQuota('VAC', 60)]);
  V('la page branche la table dès la réponse (miroir ou serveur)', /if\(pRes\.quotasConges && Object\.keys\(pRes\.quotasConges\)\.length\) QUOTAS_SERVEUR=pRes\.quotasConges;/.test(STAFF));
  V('plus aucune valeur de quota écrite dans la page', !/100:37|90:33|const QUOTAS=\{/.test(STAFF));
}
console.log('\n═══ 3. Une copie rapide en retard d\'un champ (production, 14/09 22 h) ═══');
V('si la charge miroir n\'a pas de quotasConges, la page redemande la config au serveur, une fois',
  /if\(pRes\.quotasConges===undefined\)\{[\s\S]{0,200}apiCall\(\{action:'getVacancesConfig'\}\)/.test(STAFF));
V('…et ne le fait PAS quand le champ est là (aucun appel serveur superflu)', /pRes\.quotasConges===undefined/.test(STAFF) && !/pRes\.quotasConges===null/.test(STAFF));
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
