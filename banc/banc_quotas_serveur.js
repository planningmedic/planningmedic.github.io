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
  const src = STAFF.slice(STAFF.indexOf('const QUOTAS_REPLI'), STAFF.indexOf('};', STAFF.indexOf('const getQuota=')) + 2);
  const ctx = vm.createContext({ Number, Math, Object, String });
  vm.runInContext(src + '\nglobalThis.getQuota = getQuota; globalThis.setServeur = t => { QUOTAS_SERVEUR = t; };', ctx);
  V('sans réponse serveur (fenêtre avant recopie) : le repli donne 37 à un temps plein', ctx.getQuota('VAC', 100) === 37 && ctx.getQuota('FORM', 100) === 10);
  ctx.setServeur({ 100: { vac: 40, form: 11, ctp: 0 }, 80: { vac: 32, form: 9, ctp: 10 }, 50: { vac: 20, form: 6, ctp: 25 } });
  V('avec la table du serveur : ce sont SES chiffres (40 jours, pas 37)', ctx.getQuota('VAC', 100) === 40 && ctx.getQuota('FORM', 100) === 11);
  /* Égalité de distance (90 entre 80 et 100) : le serveur garde le premier palier
     rencontré en ordre croissant — 80. Le client reproduit exactement ce choix. */
  V('quotité absente de la table → palier le plus proche, comme le serveur (90 → 80 par égalité ; 60 → 50)', ctx.getQuota('VAC', 90) === 32 && ctx.getQuota('VAC', 60) === 20, [ctx.getQuota('VAC', 90), ctx.getQuota('VAC', 60)]);
  V('la page branche la table dès la réponse (miroir ou serveur)', /if\(pRes\.quotasConges && Object\.keys\(pRes\.quotasConges\)\.length\) QUOTAS_SERVEUR=pRes\.quotasConges;/.test(STAFF));
  V('la table locale est marquée comme un repli à retirer, plus comme une source', /const QUOTAS_REPLI=/.test(STAFF) && !/^const QUOTAS=\{/m.test(STAFF) && /à retirer une fois la recopie confirmée/.test(STAFF));
}
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
