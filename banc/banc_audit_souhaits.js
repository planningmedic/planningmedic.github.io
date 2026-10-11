/* ═══════════════════════════════════════════════════════════════════════
   BANC AUDIT DES SOUHAITS (étape 2 du wizard de génération) — 2026-08-25

   POURQUOI CE FICHIER. Les souhaits sont désormais posables sur TOUS les
   jours de l'année : le générateur les rationne lui-même (part du MAR sur
   chaque axe, plus une seule demande par an sur les jours rares — samedi,
   week-end, férié). En poser beaucoup est donc légitime et sans effet sur
   l'équité : le surplus est simplement ignoré.

   Or l'écran d'audit du comité BLOQUAIT la génération dès qu'un MAR posait
   plus de souhaits que sa part sur un axe, et lui demandait de « reporter le
   surplus sur des jours libres ». Laissé tel quel, il rendait la nouveauté
   inutilisable : le comité n'aurait jamais pu générer.

   Ce fichier verrouille la règle : les REFUS bloquent, les SOUHAITS informent.
   Sans lui, rien n'empêcherait de rétablir le blocage sans s'en apercevoir.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
function V(nom, cond, detail) {
  if (cond) { ok++; console.log('  ✓ ' + nom); }
  else { ko++; console.log('  ✗ ' + nom + (detail !== undefined ? '  → ' + JSON.stringify(detail).slice(0, 240) : '')); }
}
const lire = f => fs.readFileSync(path.join('..', f), 'utf8');

console.log('\n═══ Audit du comité : les souhaits informent, les refus bloquent ═══');
const admin = lire('admin.html');

// Le bloc d'audit, isolé pour éviter les faux positifs venus d'ailleurs.
const iDeb = admin.indexOf('Audit équité sur TOUS les axes');
const iFin = admin.indexOf('Audit COUVERTURE jour par jour');
V('le bloc d\'audit équité est présent et délimité', iDeb > 0 && iFin > iDeb, { iDeb, iFin });
const bloc = iDeb > 0 && iFin > iDeb ? admin.slice(iDeb, iFin) : '';

// 1) Plus aucun message d'alerte issu des souhaits → plus de blocage possible.
V('aucun message d\'alerte n\'est produit à partir des souhaits',
  !/msgs\.push\(\s*'⭐/.test(bloc));
V('la consigne « reporter le surplus sur des jours libres » a disparu',
  !bloc.includes('reporter le surplus'));
V('le texte n\'accuse plus les souhaits de « monopoliser l\'axe »',
  !bloc.includes('monopolisent l'));

// 2) Les refus, eux, restent bloquants : c'est le seul vrai empêchement.
V('les refus produisent toujours une alerte bloquante',
  /msgs\.push\(\s*'🚫/.test(bloc));
V('le bouton Suivant est bien désactivé quand il reste des alertes',
  /_alertes\.length[\s\S]{0,200}wizGNextBtn'\)\.disabled = true/.test(bloc));
V('le message de blocage parle des REFUS, pas des souhaits',
  bloc.includes('leurs refus ne laissent pas assez de jours'));

// 3) Le tableau des souhaits reste affiché, et se présente comme informatif.
V('le tableau des souhaits est toujours affiché', bloc.includes('Souhaits sur jours à enjeu'));
V('il annonce explicitement qu\'il ne bloque pas',
  bloc.includes('ne bloque pas la génération'));
V('il explique que le surplus est ignoré sans casser l\'équité',
  bloc.includes('le surplus est simplement ignoré'));
V('il rappelle la règle d\'une seule demande par an sur les jours rares',
  bloc.includes('une seule demande par an'));
{
  // On isole STRICTEMENT le corps de _sCell : une regex trop large débordait sur
  // _iCell (les indispos, elles, restent rouges à juste titre) et faisait échouer
  // le test alors que le code était bon.
  const i = bloc.indexOf('const _sCell');
  const corps = i > 0 ? bloc.slice(i, bloc.indexOf('};', i) + 2) : '';
  V('le corps de _sCell est bien isolé', corps.length > 50 && corps.length < 800, corps.length);
  V('les cellules de souhaits ne sont plus peintes en rouge',
    corps.length > 0 && !corps.includes('#FEE2E2') && !corps.includes('#991B1B'), corps.slice(0, 160));
}

// 4) Cohérence avec le guide : il doit décrire la même règle.
//    (06/09/2026) Le guide de l'algorithme a été replié dans le guide du MAR.
const gMar = lire('docs/guide-mar.html');
V('le guide annonce que tous les jours sont demandables',
  /Vous demandez tous les samedis de l'année/.test(gMar) || /n'importe quel jour/.test(gMar));
V('le guide décrit la demande annuelle sur les jours rares',
  /une seule demande par an/.test(gMar));
V('le guide explique les jours couplés', gMar.includes('vont par paire'));
/* (11/10/2026) Choix du responsable : une veille de férié qui tombe un lundi, un
   mardi ou un mercredi se demande comme un jour ordinaire (pas de limite annuelle) ;
   du jeudi au dimanche, elle suit la règle des fériés. Le guide doit dire
   exactement ce que fait le générateur — les deux sont vérifiés ensemble. */
V('le guide dit qu\'une veille de férié du jeudi au dimanche suit la règle des fériés',
  /veille de férié qui tombe un jeudi, un vendredi ou un week-end/.test(gMar));
V('le guide dit qu\'une veille de férié du lundi au mercredi est un jour ordinaire',
  /veille de férié qui tombe un lundi, un mardi ou un mercredi se demande comme un jour ordinaire/.test(gMar));
{
  const _gen = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  V('…et le générateur fait bien cela (lun-mer non férié = jour libre, veille comprise)',
    /const estJourLibre=date=>\{const d=dayByDate\[date\];return !!d&&d\.dow>=1&&d\.dow<=3&&!d\.isFerie;\};/.test(_gen)
    && /\n    if\(!estJourLibre\(date\)\)\{\n/.test(_gen));
}
V('le guide explique comment demander une garde',
  /être de garde un jour précis/i.test(gMar));
V('le guide précise qu\'un souhait ne donne pas de garde en plus',
  gMar.includes('ne vous donne pas une garde en plus'));

// 5) Le générateur porte bien la règle correspondante.
const gen = lire('gas/generateur_gardes.gs');
V('le générateur définit le quota annuel des jours rares',
  /const SOUHAIT_QUOTA_RARE\s*=\s*\d+/.test(gen));
V('le générateur pose les jours couplés en unité complète',
  gen.includes('uniteDeSouhait'));
V('le chemin des jours libres (lun/mar/mer) est explicitement préservé',
  gen.includes('estJourLibre'));

console.log(`\nbanc_audit_souhaits : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
