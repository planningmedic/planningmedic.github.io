/* ═══ BANC — RÉINITIALISATION DU CODE D'ACCÈS D'UN MAR ═══
   Panne du 03/09/2026 : « generateCode is not defined » à l'envoi d'un nouveau
   code depuis l'onglet Médecins. La fonction avait été écrasée le 29/08/2026
   par le commit des compteurs d'usage ; aucun scénario ne l'exerçait, le banc
   restait vert et la panne n'est apparue qu'en production.

   Ce scénario exécute le VRAI bloc routeur `if (action === 'resetCodeMar')` et
   la VRAIE generateCode, extraits d'Indispos.gs. Rien n'est recopié ici : si la
   fonction disparaît à nouveau du fichier livré, l'extraction échoue et le banc
   tombe en rouge AVANT la mise en ligne. */
const vm = require('vm'), fs = require('fs');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const FICHIER = '../gas/Indispos.gs';
const SRC = fs.readFileSync(FICHIER, 'utf8');

/* Découpe du bloc routeur par appariement d'accolades. */
function extraireBloc(marque, nomFn) {
  const i = SRC.indexOf(marque);
  if (i < 0) throw new Error('bloc introuvable : ' + marque);
  let prof = 0, j = SRC.indexOf('{', i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') prof++;
    else if (SRC[j] === '}') { prof--; if (prof === 0) break; }
  }
  return `function ${nomFn}(action, payload, user) {\n` + SRC.slice(i, j + 1) + '\n  return null;\n}';
}

/* Un classeur minimal : trois MAR, un code admin dans CONFIG.
   Colonnes MEDECINS de production : 0 id, 1 nom, 6 code, 7 email. */
function monde(opts) {
  opts = opts || {};
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [
    ['ID', 'NOM', 'INITIALES', 'ACTIF', 'QUOTITE', 'PCT_GARDES', 'CODE', 'EMAIL'],
    ['MENADE', 'DR MENADE', 'RM', 'O', 100, 100, 'ANCIENRM', opts.sansEmail ? '' : 'rm@exemple.mc'],
    ['ALPHA', 'DR ALPHA', 'AL', 'O', 100, 100, 'CODEALPH', 'al@exemple.mc'],
    ['BRAVO', 'DR BRAVO', 'BR', 'O', 100, 100, 'CODEBRAV', 'br@exemple.mc'],
  ]);
  cl.ajouter('CONFIG', [['CLE', 'VALEUR'], ['ADMIN_CODE', 'CODEADMI']]);

  const envois = [], journal = [];
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Set, Math, Error, RegExp, isNaN, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, flush: () => {} },
    MailApp: {
      sendEmail: (o) => {
        if (opts.mailKo) throw new Error('quota dépassé');
        envois.push(o);
      },
      getRemainingDailyQuota: () => 100,
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ contenu: t, setMimeType() { return this; } }),
    },
    logAction: (m) => journal.push(String(m)),
    _mailCodeAcces_: (nom, code, renouvele) => ({ subject: 'Code', htmlBody: 'x', body: 'x', __code: code, __renouvele: !!renouvele }),
  });
  ctx.globalThis = ctx;

  /* Le VRAI code : generateCode + les deux helpers de réponse + le bloc routeur. */
  vm.runInContext(extraireFonction(FICHIER, 'generateCode'), ctx);
  vm.runInContext(extraireFonction(FICHIER, '_deny'), ctx);
  vm.runInContext(extraireFonction(FICHIER, '_error'), ctx);
  vm.runInContext(extraireBloc("if (action === 'resetCodeMar') {", 'handlerReset'), ctx);

  const appel = (medecin, role) => {
    const r = ctx.handlerReset('resetCodeMar', { medecin }, { role: role || 'admin' });
    return JSON.parse(r.contenu);
  };
  const codeDe = (id) => {
    const l = cl.getSheetByName('MEDECINS').getDataRange().getValues().find(x => String(x[0]) === id);
    return String(l[6]);
  };
  return { cl, ctx, appel, codeDe, envois, journal };
}

console.log('\n═══ C001 · generateCode existe VRAIMENT dans le fichier livré ═══');
{
  /* La panne du 03/09/2026 : la fonction était appelée mais plus définie.
     Extraction depuis le fichier réel — aucune doublure ne peut la masquer. */
  let trouvee = true;
  try { extraireFonction(FICHIER, 'generateCode'); } catch (e) { trouvee = false; }
  V('generateCode définie dans Indispos.gs', trouvee);

  const b = monde();
  const c = b.ctx.generateCode();
  V('code de 8 caractères', c.length === 8, c);
  V('alphabet sans I, O, 0 ni 1 (dictée au téléphone)', !/[IO01]/.test(c), c);
  V('majuscules et chiffres uniquement', /^[A-Z2-9]+$/.test(c), c);
  const cent = new Set();
  for (let i = 0; i < 100; i++) cent.add(b.ctx.generateCode());
  V('100 tirages donnent 100 codes différents', cent.size === 100, cent.size);
}

console.log('\n═══ C002 · le geste complet : nouveau code écrit ET envoyé ═══');
{
  const b = monde();
  const avant = b.codeDe('MENADE');
  const r = b.appel('MENADE');
  V('réponse en succès', r.success === true, r);
  V('le nom du MAR revient à l\'écran', r.nom === 'DR MENADE', r);
  V('le code a bien changé', b.codeDe('MENADE') !== avant, b.codeDe('MENADE'));
  V('le nouveau code respecte l\'alphabet', /^[A-Z2-9]{8}$/.test(b.codeDe('MENADE')), b.codeDe('MENADE'));
  V('un seul email est parti', b.envois.length === 1, b.envois.length);
  V('il part à la bonne adresse', b.envois[0] && b.envois[0].to === 'rm@exemple.mc', b.envois[0]);
  V('l\'email porte le NOUVEAU code', b.envois[0] && b.envois[0].__code === b.codeDe('MENADE'), b.envois[0] && b.envois[0].__code);
  V('formulation « code renouvelé »', b.envois[0] && b.envois[0].__renouvele === true);
  V('l\'ancien code est tracé AVANT écrasement', b.journal.some(l => l.indexOf(avant) >= 0), b.journal);
  V('les autres MAR ne sont pas touchés', b.codeDe('ALPHA') === 'CODEALPH' && b.codeDe('BRAVO') === 'CODEBRAV');
}

console.log('\n═══ C003 · jamais deux personnes avec le même code ═══');
{
  /* generateCode est bridée pour ne sortir que des codes DÉJÀ pris : le bloc
     doit refuser plutôt que dupliquer un accès (ou offrir le rôle admin). */
  const b = monde();
  const pris = ['CODEALPH', 'CODEBRAV', 'CODEADMI'];
  let i = 0;
  b.ctx.generateCode = () => pris[(i++) % pris.length];
  const avant = b.codeDe('MENADE');
  const r = b.appel('MENADE');
  V('la collision est refusée', r.success === false, r);
  V('le motif est lisible', /collision|impossible/i.test(r.error || ''), r.error);
  V('le code reste INCHANGÉ', b.codeDe('MENADE') === avant, b.codeDe('MENADE'));
  V('aucun email n\'est parti', b.envois.length === 0, b.envois.length);
}
{
  /* Un seul code libre au 4ᵉ tirage : le bloc doit le trouver, pas abandonner. */
  const b = monde();
  const suite = ['CODEALPH', 'CODEADMI', 'CODEBRAV', 'LIBRE234'];
  let i = 0;
  b.ctx.generateCode = () => suite[Math.min(i++, suite.length - 1)];
  const r = b.appel('MENADE');
  V('le premier code libre est retenu', r.success === true && b.codeDe('MENADE') === 'LIBRE234', b.codeDe('MENADE'));
}

console.log('\n═══ C004 · sans email, on ne change RIEN ═══');
{
  /* Sinon le MAR perd son accès sans jamais recevoir le nouveau code. */
  const b = monde({ sansEmail: true });
  const r = b.appel('MENADE');
  V('refus explicite', r.success === false, r);
  V('le motif nomme le MAR', /MENADE/.test(r.error || ''), r.error);
  V('le code reste INCHANGÉ', b.codeDe('MENADE') === 'ANCIENRM', b.codeDe('MENADE'));
}

console.log('\n═══ C005 · email en panne : le dire franchement ═══');
{
  /* Le code EST déjà changé : la réponse doit le porter, sinon l\'admin croit
     à un échec sans conséquence et le MAR se retrouve dehors. */
  const b = monde({ mailKo: true });
  const r = b.appel('MENADE');
  V('réponse en erreur', r.success === false, r);
  V('le nouveau code est donné à l\'admin', (r.error || '').indexOf(b.codeDe('MENADE')) >= 0, r.error);
  V('le classeur porte bien le nouveau code', b.codeDe('MENADE') !== 'ANCIENRM');
  V('l\'échec est tracé avec le nouveau code', b.journal.some(l => /ECHEC EMAIL/.test(l) && l.indexOf(b.codeDe('MENADE')) >= 0), b.journal);
}

console.log('\n═══ C006 · réservé au comité, et médecin inconnu refusé ═══');
{
  const b = monde();
  const r = b.appel('MENADE', 'mar');
  V('un MAR ne peut pas réinitialiser un code', r.success === false, r);
  V('le code reste INCHANGÉ', b.codeDe('MENADE') === 'ANCIENRM');
  V('aucun email n\'est parti', b.envois.length === 0);

  const b2 = monde();
  const r2 = b2.appel('INCONNU');
  V('médecin inconnu refusé', r2.success === false && /introuvable/i.test(r2.error || ''), r2);

  const b3 = monde();
  const r3 = b3.appel('');
  V('médecin manquant refusé', r3.success === false, r3);
  V('aucune écriture', b3.codeDe('MENADE') === 'ANCIENRM');
}

console.log(`\n──────── ${ok} vérifications, ${ko} échec(s) ────────`);
process.exit(ko ? 1 : 0);
