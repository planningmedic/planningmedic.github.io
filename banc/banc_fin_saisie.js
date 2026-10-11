/* ═══ BANC — DATE LIMITE DE SAISIE DES INDISPONIBILITÉS (11/10/2026) ═══════
   POURQUOI CE SCÉNARIO EXISTE.
   La campagne restait ouverte jusqu'à la génération : un MAR pouvait modifier
   ses indisponibilités et ses souhaits pendant que le comité préparait les
   gardes. Le responsable veut une clôture nette : saisie fermée à minuit le soir
   du dernier vendredi d'octobre, génération le lundi suivant, le week-end pour
   travailler sur un état figé.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. La date par défaut est bien le dernier vendredi d'octobre.
   2. La fermeture tombe à minuit, heure de Paris : ouvert le vendredi à 23:59,
      fermé le samedi à 00:00.
   3. Sans ligne INDISPOS_FIN, aucune date limite (comportement d'avant).
   4. Le serveur refuse l'enregistrement d'un MAR après la date, JAMAIS celui
      de l'administrateur, et l'écran passe en lecture seule.
   5. Ouvrir une campagne pose la date d'office, sauf si elle est déjà passée.
   Tout le code exécuté est extrait des fichiers livrés, jamais recopié. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

const GS = path.join(__dirname, '..', 'gas', 'indisponibilites.gs');
const SRC = fs.readFileSync(GS, 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'indispos.html'), 'utf8');

function ctxAvec(lignesConfig) {
  const cl = new Classeur();
  cl.ajouter('CONFIG', [['CLE', 'VALEUR']].concat(lignesConfig || []));
  const ctx = vm.createContext({ Date, String, Number, Math, isNaN, JSON, console,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    /* formatDate dans le fuseau du script (Europe/Paris) : le banc tourne en TZ=Europe/Paris */
    Utilities: { formatDate: (d) => { const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } } });
  vm.runInContext('function _configRows_(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG").getDataRange().getValues(); }', ctx);
  ['_finSaisieIndispos_', '_saisieClose_', '_dernierVendrediOctobre_', '_libelleFinSaisie_']
    .forEach(f => vm.runInContext(extraireFonction(GS, f), ctx));
  ctx.__cl = cl;
  return ctx;
}

console.log('\n═══ 1. Le dernier vendredi d\'octobre ═══');
{
  const c = ctxAvec();
  const f = a => vm.runInContext('_dernierVendrediOctobre_(' + a + ')', c);
  V('2026 → vendredi 30 octobre', f(2026) === '2026-10-30', f(2026));
  V('2027 → vendredi 29 octobre (le 31 est un dimanche)', f(2027) === '2027-10-29', f(2027));
  V('2025 → vendredi 31 octobre (le 31 lui-même)', f(2025) === '2025-10-31', f(2025));
  V('2030 → vendredi 25 octobre', f(2030) === '2030-10-25', f(2030));
  V('le libellé se lit en clair', vm.runInContext('_libelleFinSaisie_("2026-10-30")', c) === 'vendredi 30 octobre');
}

console.log('\n═══ 2. Minuit, heure de Paris ═══');
{
  const c = ctxAvec([['INDISPOS_FIN', '2026-10-30']]);   // la doublure la convertit en date, comme Sheets
  const close = iso => vm.runInContext('_saisieClose_(new Date("' + iso + '"))', c);
  V('la date est lue', vm.runInContext('_finSaisieIndispos_()', c) === '2026-10-30');
  V('lundi 26 octobre : ouvert', close('2026-10-26T10:00:00') === false);
  V('vendredi 30 octobre, 23:59 : encore ouvert', close('2026-10-30T23:59:00') === false);
  V('samedi 31 octobre, 00:00 : fermé', close('2026-10-31T00:00:00') === true);
  V('lundi 2 novembre : fermé', close('2026-11-02T09:00:00') === true);
  const c2 = ctxAvec([['INDISPOS_FIN', '30/10/2026']]);
  V('une date saisie à la française (30/10/2026) est comprise aussi',
    vm.runInContext('_finSaisieIndispos_()', c2) === '2026-10-30');
}

console.log('\n═══ 3. Sans ligne INDISPOS_FIN : pas de date limite ═══');
{
  const c = ctxAvec([['INDISPOS_ACTIVE', '2027']]);
  V('aucune date', vm.runInContext('_finSaisieIndispos_()', c) === null);
  V('jamais fermé, même des années plus tard', vm.runInContext('_saisieClose_(new Date("2035-01-01T12:00:00"))', c) === false);
}

console.log('\n═══ 4. Le serveur et l\'écran ═══');
{
  const i = SRC.indexOf('function _act_saveIndispos(R)');
  const corps = SRC.slice(i, SRC.indexOf('\n}\n', i));
  const iFerme = corps.indexOf("user.role !== 'admin' && _saisieClose_()");
  const iEcrit = corps.indexOf('saveIndisposForDoctor(');
  V('l\'enregistrement d\'un MAR est refusé après la date', iFerme > 0);
  V('…et ce refus passe AVANT toute écriture', iFerme > 0 && iEcrit > iFerme, { iFerme, iEcrit });
  V('l\'administrateur n\'est jamais bloqué (le test porte sur le rôle)', /user\.role !== 'admin' && _saisieClose_\(\)/.test(corps));
  V('le refus dit la date et quoi faire', /La saisie est close depuis le ' \+ _libelleFinSaisie_/.test(corps) && /Contactez le comité/.test(corps));
  const j = SRC.indexOf('function _act_getVacConfig(R)');
  const cfg = SRC.slice(j, SRC.indexOf('setMimeType', j));
  V('l\'écran reçoit la date et l\'état', /finSaisie: _finSaisieIndispos_\(\)/.test(cfg) && /saisieClose: _saisieClose_\(\)/.test(cfg));
  V('l\'écran passe en lecture seule une fois la saisie close',
    /else if \(vacConfig\.saisieClose\) verrouillerEcran\(res\.anneeCampagne, 'close'\);/.test(PAGE));
  V('avant la date, l\'écran l\'annonce', /else if \(vacConfig\.finSaisie\) annoncerFinSaisie\(vacConfig\.finSaisie\);/.test(PAGE));
  V('le planning publié garde la priorité sur la clôture',
    PAGE.indexOf('if (res.genere) verrouillerEcran(res.anneeCampagne);') < PAGE.indexOf("verrouillerEcran(res.anneeCampagne, 'close')"));
}

console.log('\n═══ 5. Ouvrir une campagne pose la date d\'office ═══');
{
  function ouvrir(annee, lignes) {
    const c = ctxAvec(lignes);
    c.payload = { year: annee };
    vm.runInContext(extraireFonction(GS, '_act_setIndisposYear'), c);
    vm.runInContext('function _configReset_(){} function logAction(){} function _deny(){ return {refus:1}; } function _error(m){ return {erreur:m}; }'
      + ' var ContentService = { MimeType:{JSON:1}, createTextOutput: function(s){ return { setMimeType: function(){ return JSON.parse(s); } }; } };', c);
    const r = vm.runInContext('_act_setIndisposYear({ payload: payload, user: { role: "admin" } })', c);
    const cfg = c.__cl.getSheetByName('CONFIG').getDataRange().getValues();
    const fin = cfg.find(l => String(l[0]).trim() === 'INDISPOS_FIN');
    return { r, fin: fin ? vm.runInContext('_finSaisieIndispos_()', c) : null, cfg };
  }
  /* Années choisies pour que le test ne dépende pas du jour où il tourne. */
  const a = ouvrir(2031, [['INDISPOS_ACTIVE', '2030']]);
  V('campagne 2031 ouverte : date limite au vendredi 25 octobre 2030', a.fin === '2030-10-25', a.cfg);
  const b = ouvrir(2031, [['INDISPOS_ACTIVE', '2030'], ['INDISPOS_FIN', '2029-10-26']]);
  V('une ancienne date est remplacée, pas dupliquée',
    b.fin === '2030-10-25' && b.cfg.filter(l => String(l[0]).trim() === 'INDISPOS_FIN').length === 1, b.cfg);
  const d = ouvrir(2026, [['INDISPOS_FIN', '2024-10-25']]);
  V('campagne ouverte après sa date limite : pas de date posée (et l\'ancienne retirée)', d.fin === null, d.cfg);
}

console.log('\n' + ok + ' ✓   ' + ko + ' ✗');
if (ko) process.exit(1);
