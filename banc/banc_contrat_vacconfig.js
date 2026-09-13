/* ═══ BANC — LE CONTRAT ENTRE getVacConfig ET L'ÉCRAN (13/09/2026) ══════════
   CE QUI S'EST PASSÉ, ET POURQUOI CE FICHIER EXISTE.
   Les deux plafonds d'indisponibilités (20 par an, 8 en vendredi/samedi/dimanche)
   avaient été ajoutés au retour de la FONCTION INTERNE getVacConfig. Or l'écran
   n'appelle pas cette fonction : il appelle l'ACTION du même nom, qui reconstruit
   sa réponse champ par champ. Les deux quotas étaient calculés, puis jetés au
   moment de répondre.
   L'écran recevait donc `undefined`. Son garde-fou étant écrit
   `if (… && vacConfig.quotaIndispo != null && …)`, il était sauté en entier et
   ne refusait plus rien. Un MAR a pu poser 27 indisponibilités sans qu'aucun
   message n'apparaisse. Le serveur, lui, en écartait bien 7 à l'enregistrement —
   mais sans le dire. Le pire des deux mondes : l'écran promettait, le serveur
   tranchait en silence.
   Rien dans le banc ne pouvait le voir : les deux côtés étaient corrects
   séparément. C'est le CONTRAT entre eux qui était rompu.

   CE QUE CE FICHIER TIENT.
   Tout champ que la page lit dans `vacConfig` doit être renvoyé par l'action.
   La liste des champs lus est extraite de la page, pas recopiée : ajouter demain
   un `vacConfig.machin` sans l'envoyer fera échouer ce test, sans que personne
   ait à y penser.

   CE QU'IL NE TIENT PAS.
   Il ne vérifie pas les VALEURS, seulement la présence des champs. Un quota
   renvoyé à 0 au lieu de 20 passerait ici — c'est banc_quota_indispos.js et
   banc_pose_tp.js qui couvrent ça. */
const path = require('path');
const fs = require('fs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 260) : '')); } };

const GS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'indispos.html'), 'utf8');

console.log('\n═══ 1. Ce que l\'action getVacConfig renvoie ═══');
const i = GS.indexOf("if (action === 'getVacConfig')");
V('l\'action existe', i > 0);
const fin = GS.indexOf('setMimeType', i);
const corps = GS.slice(i, fin);
const jsonStart = corps.indexOf('JSON.stringify({');
V('elle répond en JSON', jsonStart > 0);
const payload = corps.slice(jsonStart);
/* Les champs envoyés : `nom:` en tête de propriété, hors commentaires. */
const sansComm = payload.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const envoyes = new Set((sansComm.match(/(\w+)\s*:/g) || []).map(s => s.replace(/\s*:$/, '')));
V('elle envoie au moins dix champs', envoyes.size >= 10, [...envoyes]);

console.log('\n═══ 2. Ce que la page lit dans vacConfig ═══');
/* Extrait de la PAGE, jamais recopié : c'est ce qui rend le test durable. */
const lus = new Set((PAGE.match(/vacConfig\s*\.\s*(\w+)/g) || [])
  .map(s => s.replace(/vacConfig\s*\.\s*/, '')));
V('la page lit au moins cinq champs', lus.size >= 5, [...lus]);

console.log('\n═══ 3. LE CONTRAT — tout ce qui est lu doit être envoyé ═══');
const manquants = [...lus].filter(c => !envoyes.has(c));
V('aucun champ lu par la page n\'est absent de la réponse', manquants.length === 0,
  { manquants: manquants, envoyes: [...envoyes] });

console.log('\n═══ 4. Les deux plafonds, nommément ═══');
V('quotaIndispo est envoyé', envoyes.has('quotaIndispo'));
V('quotaIndispoWe est envoyé', envoyes.has('quotaIndispoWe'));
V('la page les lit tous les deux', lus.has('quotaIndispo') && lus.has('quotaIndispoWe'));
/* Le garde-fou est conditionné à `!= null` : c'est CE test qui rend l'oubli
   silencieux plutôt que bruyant. On vérifie qu'il est bien écrit ainsi, pour
   que le commentaire ci-dessus reste vrai si quelqu'un le réécrit. */
V('le garde-fou de la page cède si le quota n\'arrive pas (donc le contrat ci-dessus est load-bearing)',
  /vacConfig\.quotaIndispo != null/.test(PAGE));

console.log('\n═══ 5. Le marqueur de version a suivi ═══');
V('GAS_VERSION_INDISPOS est daté du 13/09 ou après',
  /GAS_VERSION_INDISPOS = '2026-09-1[3-9]/.test(GS),
  (GS.match(/GAS_VERSION_INDISPOS = '[^']+'/) || [])[0]);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
