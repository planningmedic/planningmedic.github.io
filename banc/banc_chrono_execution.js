/* ═══ BANC — LE CHRONO DE L'EXÉCUTION TIENT LES 6 MINUTES DE GOOGLE (16/11/2026) ═══

   Mesuré le 16/11 sur les indispos 2027 : l'essai de génération a pris 318 s, dont
   ~65 s pour les 8 tirages AVANT le planning retenu. Le seul plafond de temps de la
   passe des week-ends se comptait depuis le début du planning retenu, pas depuis le
   début de l'exécution : la vraie génération (même calcul + écriture) frôlait les
   360 s permises. Les passes lourdes (optimisation finale, week-ends, appariement,
   lissage mensuel) s'arrêtent désormais à temps, comptées depuis le DÉBUT DE
   L'EXÉCUTION, en gardant leur meilleur état déjà validé ; l'essai le dit.

   Le VRAI generateur_gardes.gs est exécuté. __BANC_T0__ simule une exécution déjà
   avancée (comme si les tirages avaient déjà mangé le temps). */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const monde = () => { const roster = h.defaultRoster();
  return h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, {})),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]); };

console.log('\n═══ 1. Le chrono est bien dans le code, compté depuis le début de l\'exécution ═══');
V('un chrono global de l\'exécution existe (relu à chaque exécution)', /const _T0_EXECUTION_ = Date\.now\(\);/.test(SRC));
V('l\'optimisation finale le consulte', /_ecoule_\(\) > OPTIM_FIN_MS/.test(SRC));
V('la passe des week-ends le consulte (plus le début du planning retenu)', /_ecoule_\(\) > WE_LIMITE_MS/.test(SRC) && !/Date\.now\(\) - _tGen > WE_LIMITE_MS/.test(SRC));
V('l\'appariement le consulte', (SRC.match(/_t0Exec_\(\) \+ APP_FIN_MS/g) || []).length === 2 && /_ecoule_\(\) < APP_FIN_MS/.test(SRC));
V('le lissage mensuel le consulte', /_ecoule_\(\) > LISSE_FIN_MS/.test(SRC));
const n = k => Number((SRC.match(new RegExp('const ' + k + ' *= *(\\d+)')) || [])[1]);
V('les plafonds se suivent et laissent au moins 60 s pour l\'écriture', n('OPTIM_FIN_MS') < n('WE_LIMITE_MS') && n('WE_LIMITE_MS') < n('APP_FIN_MS')
  && n('APP_FIN_MS') <= n('LISSE_FIN_MS') && n('LISSE_FIN_MS') <= 300000, { optim: n('OPTIM_FIN_MS'), we: n('WE_LIMITE_MS'), app: n('APP_FIN_MS'), lisse: n('LISSE_FIN_MS') });

console.log('\n═══ 2. Une exécution ordinaire : rien n\'est coupé ═══');
{
  const ctx = h.buildContext(monde(), [], null);
  ctx.__BANC_OPTIM_ITERS__ = 200000;
  const r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 });
  V('aucune passe écourtée', r.ecourtees.length === 0, r.ecourtees);
  V('aucun avertissement de temps', !r.warnings.some(w => /^Temps : passe/.test(w)));
}

console.log('\n═══ 3. Une exécution déjà avancée : les passes s\'arrêtent, le planning reste complet ═══');
const ss = monde(), logs = [], ctx = h.buildContext(ss, logs, null);
ctx.__BANC_T0__ = Date.now() - 400000;   // comme si 400 s étaient déjà passées
ctx.__BANC_OPTIM_ITERS__ = 200000;       // le harnais coupe l'optimisation par défaut : ici on la veut
let r = null, err = null;
try { r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); } catch (e) { err = e.message; }
V('la génération aboutit', !err && r, err);
if (r) {
  V('l\'optimisation finale est coupée', r.ecourtees.some(x => /^optimisation finale/.test(x)), r.ecourtees);
  V('le lissage mensuel est coupé', r.ecourtees.indexOf('lissage mensuel') >= 0, r.ecourtees);
  V('l\'essai l\'annonce : « Temps : passe(s) écourtée(s) … 6 minutes … le meilleur état déjà trouvé est gardé »',
    r.warnings.some(w => /^Temps : passe\(s\) écourtée\(s\) pour rester sous les 6 minutes/.test(w) && /meilleur état déjà trouvé est gardé/.test(w)), r.warnings.slice(0, 5));
  V('toutes les nuits ont leur binôme', r.sansBinome === 0, r.jours);
  V('l\'équité tient quand même (au plus 1 garde d\'écart à la fourchette, chaque axe)', Object.values(r.ecarts).every(e => e.ecart <= 1), r.ecarts);
}
{
  const txt = (() => { const c = h.buildContext(monde(), [], null); c.__BANC_T0__ = Date.now() - 400000; c.__BANC_OPTIM_ITERS__ = 200000; return c.essaiGenerationGardes(YEAR); })();
  V('le texte de l\'essai porte la ligne ⏱️ des passes écourtées', /⏱️ Passe\(s\) écourtée\(s\) pour tenir les 6 minutes/.test(txt));
}

console.log('\n═══ 4. Le journal de l\'essai est écrit en morceaux ═══');
{
  const lg = [], c = h.buildContext(monde(), lg, null), txt = c.essaiGenerationGardes(YEAR);
  const debut = lg.findIndex(l => /═══ ESSAI DE GÉNÉRATION/.test(l)), morceaux = lg.slice(debut);
  V('aucun morceau ne dépasse 6 000 caractères', morceaux.length > 0 && morceaux.every(l => l.length <= 6000), morceaux.map(l => l.length));
  V('mis bout à bout, les morceaux redonnent tout l\'essai', morceaux.join('\n') === txt);
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
