/* ═══ BANC — BARRES D'ÉQUITÉ : l'échelle des axes sans cible ═══════════
   Défaut vu en production le 28/08/2026 (portail MAR, onglet Équité) : sur une
   carte, la barre « Mer » (3 gardes) est quatre fois plus longue que la barre
   « Mar » (4 gardes). Cause : chaque axe sans cible (Lun/Mar/Mer) est mis à
   l'échelle sur SON PROPRE maximum d'équipe. Le MAR à souhaits garantis prend
   43 mardis, ce qui étire l'échelle du mardi et écrase celle des 23 autres.
   La même fonction existe dans index.html ET admin.html : les deux sont
   éprouvées ici, sinon la correction d'une page laisserait l'autre fausse.
   Service FICTIF : aucun nom réel, aucune donnée du classeur. */
const vm = require('vm'), path = require('path'), fs = require('fs');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const PAGES = [
  ['index.html', path.join(__dirname, '..', 'index.html')],
  ['admin.html', path.join(__dirname, '..', 'admin.html')]
];
const GRIS = [['Lun', 'lu'], ['Mar', 'ma'], ['Mer', 'me']];

function jeu() {
  const base = (name, lu, ma, me, x) => Object.assign({
    name, lu, ma, me, je: 5, sa: 5, vd: 5, jf: 1, vjf: 0,
    total: 34, cTot: 34.6, cJe: 5, cSa: 5.2, cVd: 5.2, cVjf: 0.5
  }, x || {});
  const l = [base('Dr Alpha', 7, 4, 3), base('Dr Bravo', 1, 9, 4),
             base('Dr Charlie', 8, 2, 3), base('Dr Delta', 2, 3, 9)];
  for (let i = 0; i < 19; i++) l.push(base('Dr N' + i, 5, 3, 5));
  l.push(base('Dr Plafond', 2, 43, 0, {          // régime « souhaits garantis »
    je: 0, sa: 0, vd: 0, jf: 0, vjf: 0, total: 45, cTot: 45,
    cJe: 0, cSa: 0, cVd: 0, cVjf: 0, wish: true
  }));
  return l;
}

/* Relit la largeur réellement produite dans le style inline — ce que le
   navigateur affichera — et non une valeur intermédiaire du calcul. */
function largeurs(fichier, list) {
  /* (05/09/2026) renderEquiteCards s'appuie désormais sur facteursEquite : les
     barres et le certificat doivent lire la MÊME cible. On charge donc la
     dépendance, plutôt que d'ajouter un repli silencieux dans la page pour
     faire passer le banc. Année de mesure = année générée : le facteur vaut 1
     et les largeurs attendues ici sont inchangées. */
  const ctx = vm.createContext({ Math, Number, String, Object, Array,
    IS_DARK: false, MY_ID: null, _meName: () => null,
    marsData: [{ id: 'Dr Plafond', nom: 'Dr Plafond', initiales: 'DP', souhaitPlafond: true }] });
  ctx.globalThis = ctx;
  /* (05/09/2026) L'extraction s'arrêtait au premier « ; », y compris celui d'un
     commentaire écrit DANS la liste : elle rendait un tableau tronqué, et le script
     assemblé ne compilait plus. On coupe désormais sur le « ]; » de fin de liste. */
  const AX_EQ = (fs.readFileSync(fichier, 'utf8').match(/const AX_EQUITE = \[[\s\S]*?\];/) || [''])[0];
  /* (05/09/2026) Les cartes sont repliables : renderEquiteCards s'appuie sur un
     état (EQ_OUVERTS) et sur eqVerdict. On charge les deux, et on ouvre TOUTES
     les cartes — ce banc mesure la longueur des barres, qui n'existent que
     dépliées. */
  const dep = extraireFonction(fichier, 'eqVerdict');
  vm.runInContext('const EQ_OUVERTS = { has: () => true, add(){}, delete(){} }; let EQ_LIST = null;\n'
    + AX_EQ + '\n' + extraireFonction(fichier, 'ciblesEquite') + '\n' + dep + '\n'
    + extraireFonction(fichier, 'renderEquiteCards') + '\nglobalThis.__r = renderEquiteCards;', ctx);
  const out = {};
  ctx.__r(list).split('<div class="eqv-card').slice(1).forEach(c => {
    const nom = (c.match(/class="eqv-name"[^>]*>([^<]+)/) || [, '?'])[1], par = {};
    c.split('<div class="eqv-row').slice(1).forEach(r => {
      const l = (r.match(/class="eqv-lbl">([^<]+)/) || [, '?'])[1];
      par[l] = parseFloat((r.match(/class="eqv-fill" style="width:([\d.]+)%/) || [, '0'])[1]);
    });
    out[nom] = par;
  });
  return out;
}

PAGES.forEach(([nom, fichier]) => {
  console.log('\n═══ ' + nom + ' · une barre sans cible doit se lire comme une quantité ═══');
  const src = jeu(), L = largeurs(fichier, src), A = L['Dr Alpha'];

  V('la carte témoin est rendue', !!A && A.Mar !== undefined, A);

  /* LE DÉFAUT EXACT constaté à l'écran. */
  V('4 mardis font une barre plus longue que 3 mercredis',
    A.Mar > A.Mer, { mar: A.Mar, mer: A.Mer });

  /* Généralisation : pour tout MAR et tout couple d'axes gris, l'ordre des
     longueurs suit l'ordre des nombres. */
  const fautes = [];
  src.filter(m => !m.wish).forEach(m => {
    const c = L[m.name]; if (!c) return;
    GRIS.forEach(([la, ka]) => GRIS.forEach(([lb, kb]) => {
      if (m[ka] > m[kb] && c[la] <= c[lb])
        fautes.push(m.name + ' ' + la + '(' + m[ka] + ')=' + c[la].toFixed(1) + '% ≤ ' + lb + '(' + m[kb] + ')=' + c[lb].toFixed(1) + '%');
    }));
  });
  V('aucune inversion longueur/nombre entre axes sans cible', fautes.length === 0, fautes.slice(0, 3));

  /* Le MAR à souhaits garantis ne doit pas fixer l'échelle des autres :
     retirer sa ligne ne doit RIEN changer aux barres de ses collègues. */
  const L2 = largeurs(fichier, src.filter(m => !m.wish));
  const bouge = src.filter(m => !m.wish).filter(m =>
    GRIS.some(([l]) => Math.abs(L[m.name][l] - L2[m.name][l]) > 0.5)).map(m => m.name);
  V('sa présence ne déforme pas les barres des autres', bouge.length === 0, bouge.slice(0, 4));

  /* Sa propre barre reste dans la piste, et son axe dominant reste dominant. */
  const P = L['Dr Plafond'];
  V('sa barre ne dépasse pas la piste', P.Mar <= 100, P);
  V('son mardi reste le plus long de sa carte', P.Mar >= P.Lun && P.Mar >= P.Mer, P);
});

console.log('\n──── ' + ok + ' vérifications, ' + ko + ' échec' + (ko > 1 ? 's' : ''));
if (ko) process.exit(1);
