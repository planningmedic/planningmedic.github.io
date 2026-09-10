/* ═══ BANC — LE W1 SE TERMINE SUR LE STAFF, SANS ENVOI DE CODES ═══
   Retrait du 10/09/2026. Le W1 finissait par un mail à chaque MAR portant
   trois choses : le code d'accès, le récap des congés posés au staff, et
   l'annonce de l'ouverture de la saisie. Les trois ont perdu leur objet — le
   code des indispos est celui du portail, les VAC/FORM verrouillés se
   relisent dans « Mes indispos », et l'annonce se fait de vive voix puisque
   le staff est en séance à ce moment précis.

   Ce que ce scénario protège, c'est la confusion qui a failli se produire en
   décidant : croire que c'était l'envoi qui OUVRAIT la saisie. Il ne l'a
   jamais fait. L'ouverture est écrite deux étapes plus tôt, par
   setIndisposYear. Le premier bloc l'exécute pour de vrai sur un classeur
   simulé : si un jour quelqu'un déplace cette écriture, le banc tombe ici
   AVANT la mise en ligne, et pas en octobre devant 23 MAR qui ne voient
   pas la tuile s'ouvrir. */
const vm = require('vm'), fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Classeur } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const GAS = fs.readFileSync('../gas/Indispos.gs', 'utf8');
const ADMIN = fs.readFileSync('../admin.html', 'utf8');

/* Découpe d'un bloc routeur par appariement d'accolades — même procédé que
   banc_codes_acces.js : rien n'est recopié, c'est le fichier livré qui parle. */
function extraireBloc(marque) {
  const i = GAS.indexOf(marque);
  if (i < 0) throw new Error('bloc introuvable : ' + marque);
  let prof = 0, j = GAS.indexOf('{', i);
  for (; j < GAS.length; j++) {
    if (GAS[j] === '{') prof++;
    else if (GAS[j] === '}' && --prof === 0) break;
  }
  return GAS.slice(i, j + 1);
}

console.log('\n═══ 1. L\'ouverture de la saisie ne dépend d\'AUCUN mail ═══');
{
  const cl = new Classeur();
  cl.ajouter('CONFIG', [['CLE', 'VALEUR'], ['ANNEE_ACTIVE', 2026]]);
  const bloc = extraireBloc("if (action === 'setIndisposYear')");
  const sortie = [];
  const ctx = vm.createContext({
    action: 'setIndisposYear', user: { role: 'admin' }, payload: { year: 2027 },
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    ContentService: { createTextOutput: t => ({ setMimeType: () => sortie.push(JSON.parse(t)) }), MimeType: { JSON: 'json' } },
    _deny: () => sortie.push({ deny: true }), _error: m => sortie.push({ error: m }),
    _configReset_: () => {}, logAction: () => {},
    Number, String, Error,
  });
  ctx.globalThis = ctx;
  vm.runInContext('(function(){ ' + bloc + ' })();', ctx);

  const config = cl.getSheetByName('CONFIG').lignes;
  const ligne = config.find(l => String(l[0]).trim() === 'INDISPOS_ACTIVE');
  V('setIndisposYear existe toujours et répond', sortie.length === 1 && sortie[0].success === true, sortie);
  V('INDISPOS_ACTIVE est écrite au classeur', !!ligne, config);
  V('elle porte bien 2027', ligne && Number(ligne[1]) === 2027, ligne);
  V('ANNEE_ACTIVE n\'a pas bougé', Number(config.find(l => l[0] === 'ANNEE_ACTIVE')[1]) === 2026);
}

console.log('\n═══ 2. Le serveur ne sait plus envoyer de codes en fin de W1 ═══');
{
  V('aucun routeur sendCodesWithRecap dans le fichier livré',
    !/if\s*\(\s*action\s*===\s*'sendCodesWithRecap'\s*\)/.test(GAS));
  V('renderRecapMailBlocks_ est partie avec (plus aucun appelant)',
    !/function\s+renderRecapMailBlocks_/.test(GAS));
  /* Les envois qui RESTENT légitimes ne doivent pas avoir été emportés. */
  V('resetCodeMar est toujours là (outil de Maintenance)',
    /if\s*\(\s*action\s*===\s*'resetCodeMar'\s*\)/.test(GAS));
  V('sendCodesMar est toujours là (arrivée d\'un nouveau MAR)',
    /if\s*\(\s*action\s*===\s*'sendCodesMar'\s*\)/.test(GAS));
}

console.log('\n═══ 3. L\'écran : cinq étapes, la dernière est le staff ═══');
(async () => {
  const vc = new VirtualConsole();
  const dom = new JSDOM(ADMIN, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 500));

  const pastilles = w.document.querySelectorAll('#wizardOverlay .wizard-step');
  V('cinq pastilles d\'étapes, plus six', pastilles.length === 5, pastilles.length);
  V('plus de pastille « Codes »', !/wizStep5|>Codes</.test(ADMIN));

  /* Le geste : on se place sur l'étape du staff et on clique « Le staff est
     terminé ». Aucun appel réseau ne doit partir, et l'écran de fin doit
     s'afficher — c'est lui qui vivait dans la fonction d'envoi. */
  let appels = 0;
  w.fetch = async () => { appels++; return { ok: true, json: async () => ({ success: true }) }; };
  w.eval('YEAR = 2026; wizCurrentStep = 4; window._wizStaffConfirmed = false; renderWizStep(); updateWizNav();');

  const suivant = w.document.getElementById('wizNextBtn');
  V('le bouton Suivant est masqué sur la dernière étape', suivant.style.display === 'none', suivant.style.display);

  w.eval('wizConfirmStaff();');
  const corps = w.document.getElementById('wizBody').innerHTML;
  V('l\'écran de fin s\'affiche', /Année 2027 initialisée/.test(corps), corps.slice(0, 120));
  V('il rappelle que INDISPOS_ACTIVE est passée à 2027', /INDISPOS_ACTIVE\s*→\s*2027/.test(corps));
  V('il ne parle plus de codes envoyés', !/code\(s\) envoyés|codes? par email/i.test(corps));
  V('il rappelle d\'annoncer l\'ouverture de vive voix', /annoncez-le au staff/i.test(corps));
  V('AUCUN appel réseau n\'est parti', appels === 0, appels);
  V('le staff reste confirmé', w.eval('window._wizStaffConfirmed') === true);

  console.log('\n═══ 4. Plus aucune trace de l\'envoi dans la page ═══');
  V('aucun appel à l\'action sendCodesWithRecap', !ADMIN.includes("action:'sendCodesWithRecap'"));
  V('la tuile ne promet plus d\'envoyer les codes', !/configurer les vacances et envoyer les codes/.test(ADMIN));
  V('la promesse fausse de verrouillage a disparu',
    !/seront <strong>verrouillés<\/strong>/.test(ADMIN));

  console.log(`\n  ${ok} vérifications OK, ${ko} en échec`);
  if (ko) process.exit(1);
})();
