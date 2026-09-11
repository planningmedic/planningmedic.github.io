/* ═══ BANC — CERTIFICAT D'ÉQUITÉ (05/09/2026) ════════════════════════════
   POURQUOI CE SCÉNARIO EXISTE — un défaut trouvé EN PRODUCTION.
   L'écran d'équité 2026, ouvert à toute l'équipe, annonçait « 19 MAR sur 20
   dépassent 2 gardes d'écart » avec les noms. Vérification faite dans le
   classeur : la colonne CIBLE promet 730,8 gardes alors que 707 seulement ont
   été posées, et 103,7 samedis pour 91 posés. La différence, ce sont les gardes
   assurées par un médecin EXTÉRIEUR au service, absent de la liste. Tout le
   monde apparaissait donc ~1,7 garde trop bas.
   Conséquence mesurée : 5 MAR accusés à tort (dont trois pile à leur part), et
   un MAR à +2,1 qui ne figurait pas dans la liste.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le contrôle qui prouve l'anomalie sans rien supposer : une mesure d'équité
      juste a des écarts qui S'ANNULENT. On l'exige du calcul corrigé.
   2. La correction ne s'applique QU'AUX années antérieures à la première année
      générée. Au-delà, un écart de somme est une vraie anomalie de couverture
      qu'il ne faut surtout pas lisser — c'est la vérification la plus importante
      du fichier.
   3. Les barres individuelles et le certificat lisent la MÊME cible. Deux
      lecteurs d'une même donnée qui divergent, c'est un écran qui se contredit.
   4. La mise en page : des NOMBRES DE PERSONNES et non des pourcentages, un
      classement replié et non un mur de noms, plus d'histogramme.  */
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
const INDEX = fs.readFileSync(path.join(__dirname, '..', 'planning.html'), 'utf8');

/* On extrait la fonction de correction du fichier réel et on l'exécute. Recopier
   la formule ici testerait ce que le banc croit, pas ce que la page fait. */
function extraire(nom, SRC) {
  SRC = SRC || ADMIN;
  const i = SRC.indexOf('function ' + nom + '(');
  if (i < 0) return null;
  let p = SRC.indexOf('{', i), n = 0, j = p;
  for (; j < SRC.length; j++) {
    if (SRC[j] === '{') n++;
    else if (SRC[j] === '}') { n--; if (!n) break; }
  }
  return SRC.slice(i, j + 1);
}

console.log('\n─── 1. La correction ramène les cibles aux gardes réellement posées ───');
const srcF = extraire('ciblesEquite');
V('la fonction de cibles entières existe dans admin.html', !!srcF);
V('…et la MÊME existe dans planning.html (portail MAR)',
  !!extraire('ciblesEquite', INDEX) && extraire('ciblesEquite', INDEX) === srcF);

/* Jeu de données calqué sur le VRAI 2026 lu dans le classeur : cibles nominales
   à 36 pour les temps pleins, mais seulement 707 gardes posées sur 730,8. */
const MARS = [
  { name: 'AUBERT', total: 34, cTot: 36 }, { name: 'AVELINE', total: 32, cTot: 36 },
  { name: 'CHAPUIS', total: 33, cTot: 36 }, { name: 'DURAND', total: 35, cTot: 36 },
  { name: 'FAUVEL', total: 41, cTot: 36 }, { name: 'GARNIER', total: 34, cTot: 36 },
  { name: 'GAUTIER', total: 33, cTot: 36 }, { name: 'LEBRUN', total: 32, cTot: 36 },
  { name: 'LEMAIRE', total: 33, cTot: 32.4 }, { name: 'MERCIER', total: 31, cTot: 36 },
  { name: 'ORVAL', total: 33, cTot: 36 }, { name: 'PELLETIER', total: 35, cTot: 36 },
  { name: 'RIVIERE', total: 31, cTot: 36 }, { name: 'SABLON', total: 34, cTot: 36 },
  { name: 'SERVANT', total: 31, cTot: 28.8 }, { name: 'SUBLET', total: 40, cTot: 36 },
  { name: 'SUREAU', total: 36, cTot: 36 }, { name: 'VALLET', total: 32, cTot: 36 },
  { name: 'ZEVACO', total: 33, cTot: 36 }, { name: 'TESSIER', total: 16, cTot: 18 },
];
const AXES = [['total', 'cTot', 'total']];

/* La règle ne regarde AUCUNE année : elle regarde si les écarts s'annulent.
   On l'exécute donc telle qu'elle est écrite dans la page. */
const fEq = new Function(srcF + '; return ciblesEquite;')();
const T2026 = fEq(MARS, AXES);
const cib = (m, T) => T[m.name].cTot;
V('toutes les cibles sont des ENTIERS',
  MARS.every(m => Number.isInteger(cib(m, T2026))), MARS.slice(0,3).map(m => cib(m, T2026)));
V('la cible d\'un temps plein est ramenée vers le bas (36 promis, ~34 réels)',
  cib(MARS[0], T2026) >= 33 && cib(MARS[0], T2026) <= 35, cib(MARS[0], T2026));
V('l\'anomalie de somme est signalée au lecteur', T2026._corrige === true);

/* LE contrôle : les écarts doivent s'annuler. C'est ce qui prouve qu'une part
   a été attribuée à quelqu'un, et une seule fois. */
const sommeApres = MARS.reduce((s, m) => s + (m.total - cib(m, T2026)), 0);
const sommeAvant = MARS.reduce((s, m) => s + (m.total - m.cTot), 0);
V('avant correction, les écarts NE s\'annulent pas (le défaut est bien là)',
  Math.abs(sommeAvant) > 20, +sommeAvant.toFixed(1));
V('après correction, les écarts s\'annulent EXACTEMENT', sommeApres === 0, sommeApres);
V('la somme des cibles = les gardes réellement réparties',
  MARS.reduce((s, m) => s + cib(m, T2026), 0) === MARS.reduce((s, m) => s + m.total, 0));

console.log('\n─── 2. Qui change de verdict, nommément ───');
const ecart = (m, T) => m.total - cib(m, T);
const avant = MARS.filter(m => Math.abs(m.total - m.cTot) >= 2).map(m => m.name);
const apres = MARS.filter(m => Math.abs(ecart(m, T2026)) >= 2).map(m => m.name);
V('le nombre d\'accusés baisse', apres.length < avant.length, { avant: avant.length, apres: apres.length });
['GARNIER', 'AUBERT', 'SABLON'].forEach(n => {
  V(n + ' n\'est plus signalé à tort', avant.indexOf(n) >= 0 && apres.indexOf(n) < 0);
});
V('LEMAIRE, oublié par l\'ancien calcul, apparaît',
  avant.indexOf('LEMAIRE') < 0 && apres.indexOf('LEMAIRE') >= 0,
  { avant: +(33 - 32.4).toFixed(1), apres: ecart(MARS.find(m => m.name === 'LEMAIRE'), T2026) });
V('FAUVEL reste le plus fort écart, et il grandit',
  ecart(MARS.find(m => m.name === 'FAUVEL'), T2026) > 5,
  ecart(MARS.find(m => m.name === 'FAUVEL'), T2026));

console.log('\n─── 3. Aucune correction quand les comptes tombent juste ───');
/* LA vérification qui compte le plus : une année générée par l'algorithme, où
   toutes les gardes sont réparties, ne doit subir AUCUNE retouche. Sinon la
   correction masquerait un jour non pourvu en le lissant sur tout le monde. */
const JUSTE = [
  { name: 'A', total: 40, cTot: 40 }, { name: 'B', total: 41, cTot: 40 },
  { name: 'C', total: 39, cTot: 40 }, { name: 'D', total: 40, cTot: 40 },
];
const TJ = fEq(JUSTE, AXES);
V('cibles et gardes qui tombent juste : chacun garde sa cible',
  JUSTE.every(m => TJ[m.name].cTot === m.cTot), JUSTE.map(m => TJ[m.name].cTot));
V('…et rien n\'est signalé au lecteur', TJ._corrige === false);
/* Une seule garde manquante sur 160 (0,6 %) reste sous le seuil : on ne touche
   à rien, l'anomalie reste visible telle quelle. */
const UNJOUR = JUSTE.map(m => Object.assign({}, m));
UNJOUR[0].total = 39;
V('une garde manquante ne déclenche aucune mention', fEq(UNJOUR, AXES)._corrige === false,
  { manque: 1, sur: 160 });
V('un écart massif, lui, la déclenche', fEq(MARS, AXES)._corrige === true);

console.log('\n─── 4. Les barres et le certificat lisent la même cible ───');
V('les barres appellent la fonction de cibles entières',
  /const _CIB = ciblesEquite\(list\.filter\(x=>!x\.wish\), AX_EQUITE\);/.test(ADMIN));
V('le certificat appelle la même fonction',
  /const T = ciblesEquite\(evalues, AXfull\);/.test(ADMIN));
V('plus aucune cible brute à l\'affichage (15 décimales vues en production)',
  /const cval=CB\[k\]\?Math\.round\(c\)/.test(ADMIN)
  && /const cval=CB\[k\]\?Math\.round\(c\)/.test(INDEX)
  && /tc>0\?Math\.round\(tc\)/.test(ADMIN) && /tc>0\?Math\.round\(tc\)/.test(INDEX));
V('les deux partent de la même liste d\'axes',
  (ADMIN.match(/AX_EQUITE/g) || []).length >= 3
  && /const AXfull = AX_EQUITE;/.test(ADMIN));
V('le trait de cible du total est entier lui aussi',
  /_tci&&_tci\.cTot!==undefined/.test(ADMIN) && /_tci&&_tci\.cTot!==undefined/.test(INDEX));

console.log('\n─── 5. Mise en page : ce que l\'écran ne doit plus faire ───');
const cert = extraire('renderCertificat');
const certM = extraire('renderCertificatMAR', INDEX);
V('le certificat du portail MAR est refondu lui aussi', !!certM
  && !/pct1|pct2|buckets|spark/.test(certM)
  && /MAR au-delà de 2 gardes/.test(certM)
  && /function certMarBasculer\(\)/.test(INDEX));
V('les barres du portail MAR lisent la même cible entière',
  /const _CIB = ciblesEquite\(list\.filter\(x=>!x\.wish\), AX_EQUITE\);/.test(INDEX));
V('le certificat existe', !!cert);
V('il ne compte plus en pourcentages', !/pct1|pct2|within2/.test(cert));
V('il annonce des NOMBRES de MAR', /MAR au-delà de 2 gardes/.test(cert) && /MAR dans leur juste part/.test(cert));
V('l\'histogramme, dont la légende contredisait les données, est retiré',
  !/buckets|spark|la masse doit être à gauche/.test(cert));
V('le mur de noms est remplacé par un classement trié',
  /lignes\.sort\(\(a, b\) => Math\.abs\(b\.worst\) - Math\.abs\(a\.worst\)\)/.test(cert));
V('le classement est replié à cinq lignes', /lignes\.slice\(0, 5\)/.test(cert));
V('…et dépliable', /function certBasculer\(\)/.test(ADMIN) && /onclick="certBasculer\(\)"/.test(cert));
/* (05/09/2026) Le texte a été raccourci : quatre lignes sur téléphone que
   personne ne lisait. Ce qui doit rester vrai, c'est que le sens du signe est
   donné — pas sa formulation d'origine. */
V('le sens du signe est expliqué au lecteur, dans les deux pages',
  /moins de gardes que sa part/.test(cert) && /moins de gardes que sa part/.test(certM));
V('la parenthèse sur les souhaits garantis est retirée',
  !/souhaits garantis exclu/.test(cert) && !/souhaits garantis exclu/.test(certM));
V('l\'année corrigée porte sa mention d\'explication',
  /médecin <b>extérieur au service<\/b>/.test(cert));
V('la mention n\'apparaît QUE si une correction a eu lieu', /if\(corrige\)\{/.test(cert));
V('les profils à souhaits garantis restent exclus du verdict',
  /list\.filter\(m => !_spec\(m\.name\)\)/.test(cert));

console.log('\n─── 6. Cartes repliables ───');
/* Vingt-quatre cartes de neuf lignes, c'était deux écrans de défilement avant de
   trouver la sienne. Chaque MAR tient sur UNE ligne ; un clic déplie le détail.
   Les deux pages doivent se comporter pareil : c'est le même écran. */
[['admin.html', ADMIN], ['planning.html', INDEX]].forEach(([nom, SRC]) => {
  const rec = extraire('renderEquiteCards', SRC);
  V(nom + ' : la carte a une ligne repliée cliquable',
    !!rec && /class="eqv-tete" onclick="eqBasculer/.test(rec));
  V(nom + ' : la bande porte une case par axe, dans l\'ordre des barres',
    !!rec && /\['total','cTot'\],\['lu',null\],\['ma',null\],\['me',null\],\['je','cJe'\]/.test(rec)
    && /\['sa','cSa'\],\['vd','cVd'\],\['jf',null\],\['vjf','cVjf'\]/.test(rec));
  V(nom + ' : le détail n\'est rendu QUE si la carte est ouverte',
    !!rec && /\(ouvert\?\('<div style="padding:0 11px 10px">'\+totBar\+bars\+'<\/div>'\):''\)/.test(rec));
  V(nom + ' : le verdict vient de la même source que le certificat',
    /function eqVerdict\(it, cib\)/.test(SRC) && /const cib=_CIB\[it\.name\];/.test(rec));
  V(nom + ' : le dépliage redessine la grille', /function eqBasculer\(nom\)/.test(SRC));
});
V('le portail MAR ouvre d\'office la carte du médecin connecté',
  /const ouvert=_isMe\|\|EQ_OUVERTS\.has\(it\.name\);/.test(INDEX));
V('…et il reste en tête de liste', /if\(_meN\)\{ if\(String\(a\.name\)===_meN\) return -1;/.test(INDEX));
V('la grille passe sur une seule colonne',
  /\.eqv-grid\{display:grid;grid-template-columns:1fr;gap:6px\}/.test(ADMIN)
  && /\.eqv-grid\{display:grid;grid-template-columns:1fr;gap:6px\}/.test(INDEX));

console.log('\n─── 7. Le sixième axe : les jours fériés ───');
/* Le générateur surveille six axes ; l'écran n'en montrait que cinq, faute que la
   colonne CIBLE JF (23e de STATS_GARDES) soit servie au front. Or c'est l'axe où
   le résidu se concentre : 11 fériés dans l'année, part individuelle ~1,4. */
const CODEGS = fs.readFileSync(path.join(__dirname, '..', 'gas', 'code.gs'), 'utf8');
const INDGS  = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
const MIRGS  = fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
V('getStats lit la colonne 23 (CIBLE JF)', /cJf:Number\(sd\[r\]\[22\]\)\|\|0/.test(CODEGS));
V('…et la sert dans la réponse', /cJf:cb\.cJf/.test(CODEGS));
V('le portail la reçoit aussi', /cJf: Number\(r\[22\]\) \|\| 0/.test(CODEGS));
V('les deux autres lecteurs la servent', /cJf:data\[r\]\[22\]/.test(INDGS) && /cJf:data\[r\]\[22\]/.test(MIRGS));
/* La colonne 23 n'est contrôlée QUE si elle existe : 2026, dont les statistiques
   ont été reconstruites à la main, s'arrête à la 22e. L'exiger là ferait hurler le
   diagnostic sur une année qui n'a rien à se reprocher. */
V('la sonde d\'en-tête contrôle la colonne 23 quand elle existe',
  /if \(nCol >= 23\) attendu\[22\] = 'CIBLE JF';/.test(INDGS)
  && /Math\.min\(23, sh\.getLastColumn\(\)\)/.test(INDGS));
V('les six axes sont dans la liste, dans les deux pages',
  /\['jf','cJf','fériés'\]/.test(ADMIN) && /\['jf','cJf','fériés'\]/.test(INDEX));
V('la barre JF est tracée contre une cible, plus contre une moyenne',
  /jf:'cJf'/.test(ADMIN) && /jf:'cJf'/.test(INDEX)
  && !/\['lu','ma','me','jf'\]\.forEach/.test(ADMIN) && !/\['lu','ma','me','jf'\]\.forEach/.test(INDEX));
V('le verdict d\'une ligne porte sur les six axes',
  /const AX=AX_EQUITE;/.test(ADMIN) && /const AX=AX_EQUITE;/.test(INDEX));
/* (06/09/2026) miroir.gs a été remonté depuis, pour le journal de la cloche.
   Figer un numéro exact obligeait à revenir ici à chaque lot du fichier : on
   vérifie que la version est postérieure au lot du 6e axe, pas qu'elle lui est
   égale. */
/* (07/09/2026) La leçon du 06/09 n'avait été appliquée qu'à miroir.gs : les deux
   autres restaient figés au numéro exact, et la migration les a fait échouer alors
   que rien de fonctionnel n'avait bougé. Les trois se contrôlent désormais pareil —
   postérieurs au lot du 6e axe, pas égaux à lui. */
const _dateGas = (src, nom) =>
  (src.match(new RegExp("GAS_VERSION_" + nom + " = '(\\d{4}-\\d{2}-\\d{2})\\.\\d+'")) || [, ''])[1];
V('les versions des trois fichiers GAS ont été montées',
  _dateGas(CODEGS, 'CODE')     >= '2026-09-05'
  && _dateGas(INDGS, 'INDISPOS') >= '2026-09-05'
  && _dateGas(MIRGS, 'MIROIR')   >= '2026-09-05');

V('un écart entier s\'affiche sans décimale',
  /function _fmtEcart\(v\)\{ return Number\.isInteger\(v\) \? String\(v\) : v\.toFixed\(1\); \}/.test(ADMIN)
  && /_fmtEcart\(x\.worst\)/.test(ADMIN) && /_fmtEcart\(x\.worst\)/.test(INDEX));
V('la cible d\'un axe surveillé est affichée entière',
  /const cval=CB\[k\]\?Math\.round\(c\)/.test(ADMIN) && /const cval=CB\[k\]\?Math\.round\(c\)/.test(INDEX));

/* (05/09/2026) DÉFAUT ATTRAPÉ AU RENDU, pas à la lecture. En ajoutant l'axe
   fériés, la barre des années SANS colonne CIBLE JF (2026, statistiques refaites
   à la main) affichait « 2 /0 » EN ROUGE : une cible absente était lue comme une
   cible à zéro, donc une accusation fabriquée. Sans cible, la barre est neutre. */
[['admin.html', ADMIN], ['planning.html', INDEX]].forEach(([nom, SRC]) => {
  const rec = extraire('renderEquiteCards', SRC);
  V(nom + ' : une cible absente rend la barre neutre, pas rouge',
    /if\(CB\[k\] && !\(c>0\)\)\{/.test(rec) && /background:#94A3B8;opacity:\.5/.test(rec));
  V(nom + ' : la case repliée reste neutre elle aussi',
    /cib\[ck\]>0\)\?cib\[ck\]:undefined/.test(rec));
});

console.log('\n─── 8. Version du site ───');
const VJS = fs.readFileSync(path.join(__dirname, '..', 'version.js'), 'utf8');
const v = (VJS.match(/window\.SITE_VERSION = 'v([\d.]+)'/) || [])[1];
/* (06/09/2026) Figer le numéro exact obligeait à revenir ici à chaque lot du
   site. On vérifie que la version est au moins celle de ce lot, et qu'elle a la
   bonne forme — c'est tout ce que ce banc a à en dire. */
/* (11/09/2026) La comparaison se faisait sur le TEXTE : '1.10.0' >= '1.2' est
   faux pour une chaîne. Le banc aurait refusé la première version à deux
   chiffres. On compare désormais nombre par nombre. */
const auMoins = (a, b) => {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
};
V('la version du site est lisible et à jour',
  /^\d+\.\d+(\.\d+)?$/.test(v) && auMoins(v, '1.2'), v);
V('un numéro à deux chiffres n\'est pas pris pour un numéro plus petit',
  auMoins('1.10.0', '1.9.1') && auMoins('2.0', '1.99') && !auMoins('1.9.1', '1.10.0'));
V('le retour à v1.0 est expliqué dans le fichier',
  /RETOUR À v1\.0/.test(VJS) && /4 septembre 2026/.test(VJS));

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
