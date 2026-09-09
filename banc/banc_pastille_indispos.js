/* ═══ BANC — LA PASTILLE « INDISPOS N/M » NE VIT QUE PENDANT LA CAMPAGNE ═══
   (03/09/2026) Constaté en production : hors campagne, la pastille affichait
   « Indispos 2026 · 20/24 ». Deux fautes en une.
   1. Elle ne se fiait qu'à INDISPOS_YEAR, qui n'est JAMAIS nul : côté serveur,
      getIndisposForDoctor→getIndisposYear() retombe sur l'année active quand la
      ligne INDISPOS_ACTIVE est absente de CONFIG.
   2. Le compte lui-même n'a d'objet qu'entre l'ouverture de la saisie et la
      génération des gardes. Après, plus personne ne saisit.

   La règle livrée : afficher si et seulement si `indisposOuverte` ET NON
   `indisposFigees` — les deux drapeaux que le serveur et la copie rapide
   posent déjà dans l'identité, et dont index.html se sert pour la tuile.

   Ce scénario exécute la VRAIE admin.html dans un navigateur simulé, appelle
   la VRAIE majIndChip, et lit l'état réel de l'élément. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));

const MARS = [];
for (let i = 1; i <= 24; i++) MARS.push({ id: 'MAR' + String(i).padStart(2, '0'), initiales: 'M' + i, nom: 'Dr ' + i, actif: true });
/* 20 des 24 ont saisi : le chiffre exact vu en production. */
const PARMAR = {};
MARS.forEach((m, i) => { PARMAR[m.id] = (i < 20) ? { '2027-03-02': 'VAC' } : {}; });

async function page(etat) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const dom = new JSDOM(fs.readFileSync('../admin.html', 'utf8'),
    { runScripts: 'dangerously', virtualConsole: vc, url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true });
  const w = dom.window;
  await dodo(500);
  /* La page déclare ses globales en `let` : ce sont des liaisons lexicales, PAS
     des propriétés de window. Un `w.marsData = …` depuis le banc ne touche donc
     rien, et le scénario se serait félicité d'un écran vide. On passe par eval,
     dans le contexte de la page, comme le fait déjà banc_page.js. */
  w.__PM = PARMAR; w.__MARS = MARS;
  w.eval(`INDISPOS_YEAR = ${etat.annee}; INDISPOS_OUVERTE = ${!!etat.ouverte};`
       + ` INDISPOS_FIGEES = ${!!etat.figees}; marsData = __MARS; ADMIN_CODE = 'CODE99';`);
  /* La copie rapide répond ; aucun appel Apps Script au démarrage (règle v1.25). */
  w.eval(`miroirRead = async function(){ return { success:true, data:{ 'indispos_${etat.annee}': { parMar: __PM } } }; };`);
  w.eval(`api = async function(){ return { success:true, data: __PM }; };`);
  return { w, erreurs };
}

const etatChip = w => {
  const el = w.document.getElementById('indChip');
  return { texte: (el.textContent || '').trim(), cache: el.style.display === 'none' };
};

(async () => {

console.log('\n═══ P001 · campagne ouverte, gardes pas encore tirées : la pastille est là ═══');
{
  const { w, erreurs } = await page({ annee: 2027, ouverte: true, figees: false });
  await w.majIndChip();
  const e = etatChip(w);
  V('la pastille est visible', !e.cache, e);
  V('elle nomme l\'année de campagne et le compte', e.texte === 'Indispos 2027 · 20/24', e.texte);
  V('aucune erreur de page', erreurs.length === 0, erreurs);
}

console.log('\n═══ P002 · hors campagne : elle disparaît (la panne du 03/09) ═══');
{
  /* INDISPOS_ACTIVE absente de CONFIG : le serveur renvoie quand même une
     année (repli sur l'année active). Seul indisposOuverte dit la vérité. */
  const { w } = await page({ annee: 2026, ouverte: false, figees: false });
  await w.majIndChip();
  const e = etatChip(w);
  V('la pastille est masquée', e.cache, e);
  V('malgré une année transmise', w.eval('INDISPOS_YEAR') === 2026, w.eval('INDISPOS_YEAR'));
}

console.log('\n═══ P003 · gardes générées : elle disparaît aussi ═══');
{
  /* La campagne n'est pas close pour autant (la clôture est un geste du
     comité), mais plus personne ne saisit : le compte n'a plus d'objet. */
  const { w } = await page({ annee: 2027, ouverte: true, figees: true });
  await w.majIndChip();
  const e = etatChip(w);
  V('la pastille est masquée', e.cache, e);
}

console.log('\n═══ P004 · le fil complet d\'une campagne ═══');
{
  const etapes = [
    ['avant l\'ouverture',        { annee: 2027, ouverte: false, figees: false }, true],
    ['pendant la saisie',         { annee: 2027, ouverte: true,  figees: false }, false],
    ['une fois les gardes tirées',{ annee: 2027, ouverte: true,  figees: true  }, true],
    ['après la clôture',          { annee: 2027, ouverte: false, figees: true  }, true],
  ];
  for (const [nom, etat, masquee] of etapes) {
    const { w } = await page(etat);
    await w.majIndChip();
    V(nom + ' → ' + (masquee ? 'masquée' : 'affichée'), etatChip(w).cache === masquee, etatChip(w));
  }
}

console.log('\n═══ P005 · les drapeaux arrivent par les DEUX chemins d\'ouverture ═══');
{
  /* Sinon la pastille dépendrait du hasard : copie rapide disponible ou non. */
  const src = fs.readFileSync('../admin.html', 'utf8');
  V('le colis de la copie rapide transporte indisposFigees',
    /indisposFigees: !!id\.indisposFigees/.test(src));
  V('le colis de la copie rapide transporte indisposOuverte',
    /indisposOuverte: !!id\.indisposOuverte/.test(src));
  const poses = (src.match(/INDISPOS_OUVERTE = !!data\.indisposOuverte/g) || []).length;
  V('les deux ouvertures de session posent les drapeaux', poses === 2, poses);
  const posesF = (src.match(/INDISPOS_FIGEES\s*= !!data\.indisposFigees/g) || []).length;
  V('idem pour indisposFigees', posesF === 2, posesF);
  V('la garde teste bien les trois conditions',
    /if \(!INDISPOS_YEAR \|\| !INDISPOS_OUVERTE \|\| INDISPOS_FIGEES\)/.test(src));
}

console.log(`\n──────── ${ok} vérifications, ${ko} échec(s) ────────`);
process.exit(ko ? 1 : 0);
})();
