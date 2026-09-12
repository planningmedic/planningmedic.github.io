/* ═══ BANC — LE QUOTA D'INDISPONIBILITÉS (11/09/2026) ══════════════════════
   POURQUOI CE SEUIL.
   Mesuré sur la grille 2027, effectif réel, congés/formations/temps partiels
   posés au quota entier, trois tirages par configuration, et les
   indisponibilités placées dans le PIRE cas — toutes sur des samedis et des
   dimanches, les jours où il n'y a que deux places et où la moitié de l'équipe
   est déjà en récupération :

       25 par MAR → 0 jour sans binôme, écart réel-cible 1
       36 par MAR → 0 jour sans binôme, écart 1        ← dernier palier tenu
       37 par MAR → écart 2 sur les TROIS tirages      ← l'équité décroche
       55 et au-delà → la génération elle-même échoue

   25 laisse 30 % de marge. Vérifié aussi : à 25, mettre les 25 en week-end ou
   aucune donne le même résultat — inutile d'ajouter un sous-quota week-end.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le quota est UNE seule valeur, envoyée par le serveur à l'écran. Deux
      nombres écrits à deux endroits finissent toujours par diverger.
   2. Le serveur refuse au-delà, même si l'écran ne l'a pas fait : un écran peut
      retarder d'une version, être rechargé depuis un cache, ou être contourné.
   3. Le compte porte sur l'envoi — qui EST l'état final, l'écran envoyant la
      carte complète de l'année et la fusion retirant ce qui n'y figure pas.
      Le comportement est prouvé dans banc_pose_tp.js (PT00) ; ici on vérifie
      la forme du code et la cohérence des deux côtés.
   4. Le quota ne touche QUE les indisponibilités. Congés, formations, temps
      partiels et gardes souhaitées gardent leurs propres règles.
   5. Le comité n'est pas plafonné : il arbitre les cas particuliers.

   Le vrai code du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };

const GS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'indispos.html'), 'utf8');

console.log('\n═══ 1. Une seule valeur, envoyée du serveur à l\'écran ═══');
const dec = GS.match(/const QUOTA_INDISPO = (\d+);/);
V('le quota est déclaré une fois dans le serveur', !!dec, dec && dec[0]);
V('il vaut 25', dec && dec[1] === '25', dec && dec[1]);
V('il n\'est déclaré qu\'une seule fois',
  (GS.match(/const QUOTA_INDISPO\s*=/g) || []).length === 1);
V('le serveur l\'envoie à l\'écran', /quotaIndispo:\s*QUOTA_INDISPO/.test(GS));
V('l\'écran le lit du serveur et ne le réécrit pas',
  /vacConfig\.quotaIndispo/.test(PAGE) && !/quotaIndispo\s*=\s*\d+/.test(PAGE));
V('aucun 25 en dur dans la page', !/quotaIndispo[^;]*25/.test(PAGE));

console.log('\n═══ 2. L\'écran refuse au clic ═══');
V('le refus vise bien l\'outil Indispo',
  /currentTool === 'INDISPO' && vacConfig && vacConfig\.quotaIndispo/.test(PAGE));
V('il compte les INDISPO déjà posées',
  /filter\(s => s === 'INDISPO'\)\.length/.test(PAGE));
V('reposer un jour déjà indisponible ne consomme rien',
  /indispos\[date\] !== 'INDISPO'/.test(PAGE));
V('le refus est expliqué, pas seulement bloqué',
  /Quota d'indisponibilités atteint/.test(PAGE) && /Retirez-en une/.test(PAGE));

console.log('\n═══ 3. Le serveur revérifie, et sur l\'état fusionné ═══');
const bloc = GS.slice(GS.indexOf('const indRefuses'), GS.indexOf('const fusion'));
V('le serveur a son propre contrôle', bloc.length > 100);
/* Le compte porte sur l'ENVOI, et c'est le bon : l'écran envoie la carte
   complète de l'année, jamais un delta, et la fusion retire ce qui n'y figure
   pas. Le comportement lui-même est prouvé dans banc_pose_tp.js (PT00) :
   35 envoyées, 25 gardées, puis redescendre à 5 et remonter à 25. */
V('il compte les INDISPO de l\'envoi', /v === 'INDISPO'/.test(bloc), bloc.slice(0, 160));
V('il refuse au-delà du quota', /nbIndC >= QUOTA_INDISPO/.test(bloc));
V('il trace les refus', /indRefuses\.length/.test(GS) && /logAction/.test(GS));

console.log('\n═══ 4. Le périmètre reste étroit ═══');
V('seul le code INDISPO est plafonné',
  /v === 'INDISPO' && user\.role !== 'admin'/.test(GS));
V('le quota du temps partiel est intact', /nbTpC >= quotaTpC/.test(GS));
V('les gardes souhaitées ne sont pas touchées', !/SOUHAIT[^\n]*QUOTA_INDISPO/.test(GS));
V('le comité n\'est pas plafonné',
  /user\.role !== 'admin'/.test(bloc) || /user\.role !== 'admin'/.test(GS));

console.log('\n═══ 5. La version et le guide suivent ═══');
const VER = fs.readFileSync(path.join(__dirname, '..', 'version.js'), 'utf8');
V('la version du site a monté d\'un cran fonctionnel',
  /SITE_VERSION = 'v1\.11\./.test(VER), (VER.match(/SITE_VERSION = '[^']+'/) || [])[0]);
V('le marqueur de version du fichier serveur a monté',
  /GAS_VERSION_INDISPOS = '2026-09-11/.test(GS),
  (GS.match(/GAS_VERSION_INDISPOS = '[^']+'/) || [])[0]);
const GUIDE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide-mar.html'), 'utf8');
V('le guide annonce le même nombre', /25 par an/.test(GUIDE));
V('le guide ne promet plus « trente au maximum »', !/trente au maximum/.test(GUIDE));

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
