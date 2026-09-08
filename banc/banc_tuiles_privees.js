/* ═══════════════════════════════════════════════════════════════════════
   TUILES RÉSERVÉES — le droit vient du classeur, plus d'un nom en dur
   ═══════════════════════════════════════════════════════════════════════

   CE QUI S'EST PASSÉ (08/09/2026). Cinq tuiles du dashboard — CRH,
   statistiques d'usage, guide technique, consultations, libéral — étaient
   réservées par `only:'FROHLICH'`, écrit dans dashboard.html. Deux défauts
   dans la même ligne : un nom de médecin publié dans un dépôt public, et
   un réglage que personne ne peut changer sans toucher au code. Lors de la
   migration, un remplacement de nom a transformé cet identifiant en un MAR
   inexistant : les cinq tuiles ont disparu pour tout le monde, sans erreur,
   sans trace. Un écran vide ne se plaint pas.

   CE QUE CE BANC GARDE. Le droit vit maintenant dans CONFIG /
   TUILES_PRIVEES et voyage avec l'identité. Deux chemins le portent — la
   copie rapide et la connexion au serveur — et c'est précisément là que
   se situe le risque : un seul des deux couvert, et la tuile clignote au
   gré des pannes du relais. Le précédent `libAdmin` est tombé dans ce
   piège, il n'existe que d'un côté.
   ═══════════════════════════════════════════════════════════════════ */

const fs = require('fs');
let ok = 0, ko = 0;
const V = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); }
};

const DASH = fs.readFileSync('../dashboard.html', 'utf8');
const IND  = fs.readFileSync('../gas/Indispos.gs', 'utf8');
const MIR  = fs.readFileSync('../gas/miroir.gs', 'utf8');
const WRK  = fs.readFileSync('../cloudflare/worker.js', 'utf8');

console.log('\n═══ 1. Plus aucun nom de médecin en dur ═══');
{
  /* La règle qui a coûté cinq tuiles : un identifiant de MAR ne doit plus
     jamais commander un affichage depuis le dépôt. On contrôle la FORME
     (`only:'…'`), pas un nom particulier — sinon le test ne protège que du
     nom d'hier. */
  V('aucune tuile ne porte un identifiant en dur', !/only\s*:\s*['"]/.test(DASH));
  V('le dépôt ne cite plus le nom de l\'administrateur',
    !/FROHLICH|DURAND/i.test(DASH), (DASH.match(/FROHLICH|DURAND/gi) || []).slice(0, 3));
  V('les tuiles réservées sont marquées `prive`', /prive\s*:\s*true/.test(DASH));
  const n = (DASH.match(/prive\s*:\s*true/g) || []).length;
  V('les cinq tuiles réservées sont bien marquées', n === 5, n);
}

console.log('\n═══ 2. La page filtre sur le droit reçu, pas sur une identité ═══');
{
  V('le filtre lit la liste reçue', /!t\.prive\s*\|\|\s*MY_TUILES\.indexOf\(t\.key\)/.test(DASH));
  V('la liste est initialisée vide', /let MY_TUILES = \[\];/.test(DASH));
  V('elle est remplie à la connexion', /MY_TUILES = Array\.isArray\(r\.tuiles\)/.test(DASH));
  /* Une déconnexion qui laisse la liste en place, et le MAR suivant sur le
     même téléphone hérite des tuiles du précédent. */
  V('elle est vidée à la déconnexion', /MY_TUILES=\[\];/.test(DASH));
}

console.log('\n═══ 3. LES DEUX chemins portent le droit ═══');
{
  /* Le cœur du scénario. `libAdmin` n'existe que côté copie rapide : en cas
     de panne du relais, la page bascule sur le serveur et le droit s'évapore.
     On refuse de reproduire ça. */
  V('copie rapide : le champ part avec l\'identité', /tuiles:\s*tuilesParMar\[/.test(MIR));
  V('copie rapide : la clé CONFIG est lue', /TUILES_PRIVEES/.test(MIR));
  V('serveur : le champ part avec l\'identité', /tuiles:\s*_tuilesPriveesDe_\(/.test(IND));
  V('serveur : la clé CONFIG est lue', /_cle === 'TUILES_PRIVEES'/.test(IND));
  V('serveur : la réponse de connexion le transmet', /tuiles:\s*user\.tuiles\s*\|\|\s*\[\]/.test(IND));
  V('le relais transmet le champ sans le juger', /tuiles:\s*Array\.isArray\(user\.tuiles\)/.test(WRK));
}

console.log('\n═══ 4. Lecture de la clé : le défaut est FERMÉ ═══');
{
  /* On exécute la vraie fonction du dépôt, pas une réécriture : un test qui
     réimplémente la règle prouve le test, pas le code. */
  const src = IND.match(/function _tuilesPriveesDe_[\s\S]*?\n}/)[0];
  const lire = new Function(src + '; return _tuilesPriveesDe_;')();

  V('un identifiant cité reçoit ses tuiles',
    JSON.stringify(lire('AFR:crh,stats;WS:liberal', 'AFR')) === '["crh","stats"]',
    lire('AFR:crh,stats;WS:liberal', 'AFR'));
  V('un autre identifiant reçoit les siennes',
    JSON.stringify(lire('AFR:crh,stats;WS:liberal', 'WS')) === '["liberal"]');
  V('un identifiant absent ne reçoit rien',
    JSON.stringify(lire('AFR:crh,stats', 'SULTAN')) === '[]');
  V('clé absente : personne ne voit rien', JSON.stringify(lire('', 'AFR')) === '[]');
  V('clé nulle : personne ne voit rien', JSON.stringify(lire(null, 'AFR')) === '[]');
  V('la casse de l\'identifiant est indifférente',
    JSON.stringify(lire('afr:crh', 'AFR')) === '["crh"]');
  V('les espaces autour des noms sont tolérés',
    JSON.stringify(lire(' AFR : crh , stats ', 'AFR')) === '["crh","stats"]');
  /* Une valeur saisie de travers dans le classeur ne doit pas empêcher la
     connexion : elle ne doit qu'empêcher l'affichage des tuiles réservées. */
  V('une valeur mal formée n\'ouvre rien et ne casse rien',
    JSON.stringify(lire('n\'importe quoi', 'AFR')) === '[]');
  V('un identifiant vide ne reçoit rien', JSON.stringify(lire('AFR:crh', '')) === '[]');
}

console.log('\n═══ 5. Les deux analyseurs comprennent le même format ═══');
{
  /* Deux lectures d'une même clé écrite une seule fois : si elles divergent,
     l'utilisateur voit deux dashboards différents selon l'état du relais. */
  const srcM = MIR.match(/function _tuilesPriveesLire_[\s\S]*?\n}/)[0];
  const lireM = new Function(srcM + '; return _tuilesPriveesLire_;')();
  const srcI = IND.match(/function _tuilesPriveesDe_[\s\S]*?\n}/)[0];
  const lireI = new Function(srcI + '; return _tuilesPriveesDe_;')();

  const essais = [
    'AFR:crh,stats;WS:liberal',
    ' afr : crh , technique ',
    'AFR:crh;AFR:stats',
    '',
    'AFR:',
  ];
  essais.forEach((valeur, i) => {
    ['AFR', 'WS'].forEach((id) => {
      const parMiroir = (lireM(valeur) || {})[id] || [];
      const parServeur = lireI(valeur, id) || [];
      V(`essai ${i + 1}, ${id} : les deux lectures concordent`,
        JSON.stringify(parMiroir) === JSON.stringify(parServeur),
        { valeur, parMiroir, parServeur });
    });
  });
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
