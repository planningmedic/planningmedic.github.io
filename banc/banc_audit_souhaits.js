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
/* (14/10/2026) Le générateur ne reconnaît une veille de férié que du lundi au jeudi
   (isVjf). Le guide annonçait « du jeudi au dimanche » : la moitié vendredi-dimanche
   n'était pas vérifiée contre le code. Désormais le guide dit ce que fait le code. */
V('le guide : seule la veille de férié du JEUDI suit la règle des fériés, vendredi-dimanche = week-end ordinaire',
  /veille de férié qui tombe un jeudi\. Un vendredi, un samedi ou un dimanche, elle compte comme un week-end ordinaire/.test(gMar)
  && !/veille de férié qui tombe un jeudi, un vendredi ou un week-end/.test(gMar));
V('…et le générateur fait bien cela (veille de férié = lundi à jeudi seulement)',
  /const isVjf=!isFerie&&ferieLend&&dow>=1&&dow<=4;/.test(lire("gas/generateur_gardes.gs")));
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

// 5) (14/10/2026) Relecture du guide MAR contre le générateur : chaque phrase corrigée
//    est verrouillée ici, avec la ligne de code qui la rend vraie.
{
  const txt = gMar.replace(/<[^>]+>/g, '');
  V('guide : la demande « férié » est commune à tous les fériés, ponts et week-ends qui en contiennent un',
    /tous jours fériés confondus/.test(txt) && /week-end ou un samedi de pont qui contient un férié/.test(txt));
  V('…générateur : le joker annuel vaut pour veille, férié de semaine ET tout jour férié de l\'unité',
    /if\(\(_c\.vjf>0\|\|_c\.ferie>0\|\|_c\.jf>0\)&&souhaitRare\[m\]>=SOUHAIT_QUOTA_RARE\) return false;/.test(gen) && /if\(di\.isFerie\)c\.jf\+\+;/.test(gen));
  V('guide : une indisponibilité est toujours respectée pour la garde (plus de « dans la mesure du possible »)',
    /Aucune garde ne vous sera donnée ce jour-là/.test(txt) && !/respectée dans la mesure du possible/.test(txt));
  V('…générateur : INDISPO bloque toujours la garde',
    /if\(s==='INDISPO'\|\|s==='VAC'\|\|s==='FORM'\|\|s==='TP'\|\|s==='CL'\|\|s==='CTP'\) return true;/.test(gen));
  V('guide : chaque férié, quel que soit son jour, compte dans le compteur des fériés',
    /Chaque jour férié, quel que soit son jour, compte dans votre compteur des fériés/.test(txt) && !/Un férié isolé un mardi ou un mercredi est compté à part/.test(txt));
  V('…générateur : le compteur des fériés compte tout jour férié',
    /if\(dayByDate\[date\]\?\.isFerie\)cnt\[id\]\.jf\+\+;/.test(gen));
  V('guide : 18h — garde, repos, absence jamais ; indispo, veille, « un par semaine » cèdent dans cet ordre',
    /jamais de 18h, sans exception/.test(txt) && /une indisponibilité de garde, le « pas deux jours de suite » et le « un par semaine » peuvent céder, dans cet ordre/.test(txt));
  V('…générateur : replis du 18h dans cet ordre (indispo, puis veille, puis semaine), dispo18 jamais levé',
    (() => { const i1 = gen.indexOf("indispos[id]?.[day.date]!=='INDISPO');"), i2 = gen.indexOf("if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date)&&h18A[veille]!==id&&!did18wk(id,day.date));"),
             i3 = gen.indexOf("if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date)&&!did18wk(id,day.date));"), i4 = gen.indexOf("if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date));");
             return i1 > 0 && i1 < i2 && i2 < i3 && i3 < i4; })());
  V('guide : dette limitée à 2 puis 60 % : au plus 1,2 garde par type de jour',
    /au plus 1,2 garde/.test(txt) && /seuls 60 % sont reportés/.test(txt));
  V('…générateur : plafond ±2 puis amortissement 0,6',
    /const DETTE_AMORTI\s*=\s*0\.6;/.test(gen) && /dette\[id\]\[k\]=DETTE_AMORTI\*Math\.max\(-2,Math\.min\(2,dette\[id\]\[k\]\)\)/.test(gen));
  V('guide : plus de « ordre strict » ni de « numéro de tirage » (le calcul ne tire pas au sort)',
    !/ordre strict/.test(txt) && !/numéro de tirage/.test(txt) && /numéro de départage/.test(txt));
}

console.log(`\nbanc_audit_souhaits : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
