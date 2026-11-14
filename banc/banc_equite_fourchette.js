/* ═══ BANC — L'ÉCRAN D'ÉQUITÉ PAR FOURCHETTE (14/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE — vu EN PRODUCTION le 14/11/2026, onglet Équité
   2027 du portail. Deux temps pleins, même part exacte (36,66 gardes) : l'un
   affiché « 36 /37 » avec « −1 tot », l'autre « 36 /36 » avec « +1 jeu » (6 jeudis
   pour une « cible » de 5, part 5,30). Le générateur ne vise plus de cible entière
   tirée entre collègues : il tient chacun entre l'arrondi inférieur et supérieur
   de sa part. L'écran comparait encore à la colonne CIBLE, devenue sans objet —
   des écarts fabriqués, sur des MAR tous dans leur fourchette.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le serveur sert la part (PART VISEE, à défaut PART EXACTE) et le nombre de
      week-ends (CIBLE WE) ; sans ces colonnes, rien n'est inventé.
   2. La fourchette : [arrondi inférieur, supérieur] ; WE = un nombre ;
      dimanches = WE moins la fourchette des samedis.
   3. Les cartes : « 36 · 36–37 », plus de « /37 » ; ✓ vert si tout est dedans,
      sinon le pire écart à la fourchette en orange ; 11 cases sur une ligne.
   4. Sans part (années d'avant, serveur pas encore mis à jour) : l'ancien
      affichage, inchangé.
   5. Le certificat : MAR dans leur fourchette, compteurs hors fourchette, total
      par groupe de même part.
   6. Le bouton « Aujourd'hui » ne s'affiche que sur le planning du jour.
   Contre-preuve : le socle commun d'avant (commit 25d44f8) affiche « /37 » et
   « −1 tot » sur ce même cas. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const RACINE = path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const extraire = (src, nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return null;
  let k = src.indexOf('{', i), n = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) return src.slice(i, j + 1); } } return null; };
const AX = [['total','cTot','total'],['sa','cSa','samedis'],['je','cJe','jeudis'],['vd','cVd','vendredis'],['we','cWe','week-ends'],['vjf','cVjf','veilles fériés'],['jf','cJf','fériés']];
function charger(src) { const ctx = { window: {}, console, JSON, Math, String, Number, Set, Array, Object, isFinite }; ctx.window.AX_EQUITE = AX; ctx.window.window = ctx.window; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.window; }
const W = charger(lire('partage/rendu_equite.js'));
const carte = (html, nom) => { const i = html.indexOf('>' + nom + '<'); const d = html.lastIndexOf('<div class="eqv-card', i); const f = html.indexOf('<div class="eqv-card', i); return html.slice(d, f > 0 ? f : undefined); };

console.log('\n─── 1. Le serveur sert la part de chaque compteur ───');
{
  const CODE = lire('gas/code.gs');
  const g = {}; vm.createContext(g); vm.runInContext(extraire(CODE, 'champsWeStats_'), g);
  const H = ['MEDECIN','CIBLE','TOTAL G','VEN','SAM','DIM','PART EXACTE','PART EXACTE SAM','PART EXACTE JEU','PART EXACTE VD','PART EXACTE VJF','PART EXACTE JF','CIBLE WE','PART EXACTE WE','PART VISEE','PART VISEE SAM','PART VISEE JEU','PART VISEE VD','PART VISEE VJF','PART VISEE JF'];
  const L = ['MAR01',"'37.0",36,6,5,6,36.663,5.512,5.299,5.512,0.531,1.382,11,11.024,36.663,5.512,5.299,5.512,0.531,1.382];
  const o = g.champsWeStats_([H, L], 1);
  V('pTot, pSa, pJe, pVd, pVjf, pJf servis depuis PART VISEE', o.pTot === 36.663 && o.pSa === 5.512 && o.pJe === 5.299 && o.pVd === 5.512 && o.pVjf === 0.531 && o.pJf === 1.382, o);
  V('pWe = CIBLE WE (11), le nombre entier de week-ends', o.pWe === 11, o);
  const L2 = L.slice(); L2[14] = ''; L2[16] = '';
  const o2 = g.champsWeStats_([H, L2], 1);
  V('PART VISEE vide → la part exacte prend le relais', o2.pTot === 36.663 && o2.pJe === 5.299, o2);
  const o3 = g.champsWeStats_([['MEDECIN','CIBLE','VEN','SAM','DIM'], ['MAR01', 36, 6, 5, 6]], 1);
  V('onglet sans colonnes de part (années d\'avant) → aucun champ inventé', ['pTot','pSa','pJe','pVd','pVjf','pJf','pWe'].every(k => o3[k] === undefined), o3);
  const L4 = L.slice(); L4[13] = '';
  V('CIBLE WE sans part exacte de week-ends → pas de pWe', g.champsWeStats_([H, L4], 1).pWe === undefined);
  const live = extraire(CODE, 'computeStatsLive');
  V('l\'instantané (computeStatsLive) transmet aussi les parts', /pTot:cb\.pTot/.test(live) && /'pWe'\]\.forEach/.test(live));
  V('GAS_VERSION_CODE incrémentée (2026-11-14.1)', /GAS_VERSION_CODE = '2026-11-14\.1'/.test(CODE));
}

console.log('\n─── 2. La fourchette ───');
{
  const F = W.fourchettesEquite({ pTot: 36.663, pSa: 5.512, pJe: 5.299, pVd: 5.512, pJf: 1.382, pVjf: 0.531, pWe: 11 });
  V('total 36,66 → 36–37', F.total[0] === 36 && F.total[1] === 37, F.total);
  V('jeudis 5,30 → 5–6 ; fériés 1,38 → 1–2 ; veilles 0,53 → 0–1', F.je + '' === '5,6' && F.jf + '' === '1,2' && F.vjf + '' === '0,1', F);
  V('week-ends : un nombre unique (11–11)', F.we[0] === 11 && F.we[1] === 11, F.we);
  V('dimanches = week-ends − samedis : 11 − (5–6) → 5–6', F.di[0] === 5 && F.di[1] === 6, F.di);
  V('part entière (33) → fourchette d\'un seul nombre', W.fourchettesEquite({ pTot: 33 }).total + '' === '33,33');
  V('une part à 32,997 (arrondi flottant) → 32–33, pas 32–32', W.fourchettesEquite({ pTot: 32.997 }).total + '' === '32,33');
  V('écart : dedans 0, en dessous négatif, au-dessus positif', W.ecartFourchette(36, [36, 37]) === 0 && W.ecartFourchette(35, [36, 37]) === -1 && W.ecartFourchette(39, [36, 37]) === 2);
}

console.log('\n─── 3. Les cartes — le cas vu en production ───');
const PARTS = { pTot: 36.663, pSa: 5.512, pJe: 5.299, pVd: 5.512, pJf: 1.382, pVjf: 0.531, pWe: 11 };
const equipe = () => [
  Object.assign({ name: 'MAR01', total: 36, cTot: 37, lu: 6, ma: 3, me: 5, je: 5, cJe: 6, vd: 6, cVd: 5, sa: 5, cSa: 6, di: 6, we: 11, cWe: 11, jf: 1, cJf: 1, vjf: 1, cVjf: 1 }, PARTS),
  Object.assign({ name: 'MAR02', total: 36, cTot: 36, lu: 5, ma: 3, me: 5, je: 6, cJe: 5, vd: 6, cVd: 6, sa: 5, cSa: 5, di: 6, we: 11, cWe: 11, jf: 1, cJf: 2, vjf: 1, cVjf: 1 }, PARTS),
  Object.assign({ name: 'MAR03', total: 37, cTot: 37, lu: 5, ma: 4, me: 5, je: 5, cJe: 5, vd: 5, cVd: 5, sa: 4, cSa: 6, di: 7, we: 11, cWe: 11, jf: 2, cJf: 1, vjf: 0, cVjf: 1 }, PARTS),
  { name: 'PRSOUHAIT', total: 46, cTot: 0, lu: 0, ma: 45, me: 0, je: 1, sa: 0, vd: 0, di: 0, we: 0, jf: 0, vjf: 0, wish: true },
];
{
  const opts = { moiNom: 'MAR01', ouverts: new Set(['MAR02', 'PRSOUHAIT']), sombre: false, neutre: 'var(--surface-2)', axes: AX, fourchette: true };
  const html = W.renderEquiteCards(equipe(), opts);
  const c1 = carte(html, 'MAR01'), c2 = carte(html, 'MAR02'), c3 = carte(html, 'MAR03');
  V('la grille est marquée « fourchette » (eqv-f)', /class="eqv-grid eqv-f"/.test(html));
  V('MAR01 : « 36 · 36–37 », plus de « /37 »', /36<span> · 36–37<\/span>/.test(c1) && !/\/37/.test(c1));
  V('MAR01 et MAR02, même part : même fourchette affichée, aucun « −1 tot » ni « +1 jeu »', /eqv-verdict" style="color:#15803D">✓</.test(c1) && /eqv-verdict" style="color:#15803D">✓</.test(c2) && !/tot<|jeu</.test(c1 + c2));
  V('zone pointillée sur la barre (eqv-fourch), plus de trait de cible', /eqv-fourch/.test(c1) && !/eqv-tick/.test(html));
  V('Dim a sa fourchette (6 · 5–6)', /Dim<\/div>[\s\S]*?6<span> · 5–6<\/span>/.test(c1));
  V('Lun, Mar, Mer restent neutres (gris, sans fourchette)', /Lun<\/div><div class="eqv-track"><div class="eqv-fill" style="width:[\d.]+%;background:#94A3B8/.test(c1));
  V('MAR03 (4 samedis pour 5–6) : verdict orange « −1 sam »', /eqv-verdict" style="color:#C2410C">−1 sam</.test(c3), c3.match(/eqv-verdict[^<]*</));
  const cases = (c3.match(/eqv-case/g) || []).length;
  V('ligne repliée : 11 cases, dont une orange', cases === 11 && (c3.match(/eqv-case" style="background:#EA7A12/g) || []).length >= 1, cases);
  V('le MAR à souhaits garantis reste « souhaits », barres grises', /eqv-verdict" style="color:#7c3aed">souhaits</.test(carte(html, 'PRSOUHAIT')) && !/eqv-fourch/.test(carte(html, 'PRSOUHAIT')));
  const sombre = W.renderEquiteCards(equipe(), Object.assign({}, opts, { sombre: true }));
  V('mode sombre : vert et orange du sombre', /#5BD08B/.test(sombre) && /#F5A04A/.test(sombre));
}

console.log('\n─── 4. Sans part : l\'ancien affichage, inchangé ───');
{
  const sans = equipe().map(x => { const y = Object.assign({}, x); ['pTot','pSa','pJe','pVd','pVjf','pJf','pWe'].forEach(k => delete y[k]); return y; });
  const html = W.renderEquiteCards(sans, { moiNom: 'MAR01', ouverts: new Set(), sombre: false, axes: AX, fourchette: true });
  V('pas de part → grille classique (« /37 », trait de cible)', !/eqv-grid eqv-f/.test(html) && /\/37/.test(html) && /eqv-tick/.test(html));
  const comite = W.renderEquiteCards(equipe(), { moiNom: null, ouverts: new Set(), sombre: false, axes: AX });
  V('page qui ne demande pas la fourchette (comité) → affichage inchangé', !/eqv-grid eqv-f/.test(comite));
  /* Contre-preuve : le socle d'avant affichait « /37 » et « −1 tot » sur ce même cas. */
  let avant = null; try { avant = execSync('git show 25d44f8:partage/rendu_equite.js', { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  if (avant) {
    const Wa = charger(avant);
    const ha = Wa.renderEquiteCards(equipe(), { moiNom: 'MAR01', ouverts: new Set(), sombre: false, axes: AX, fourchette: true });
    V('contre-preuve : l\'ancien socle accusait MAR01 (« 36 /37 », « −1 tot »)', /36<span> \/37/.test(ha) && /-1 tot|−1 tot/.test(ha));
  } else V('contre-preuve : historique disponible (cloner SANS --depth 1)', false);
  const mg = W.morphGrid;
  V('morphGrid refuse de mélanger les deux structures (reconstruction)', /eqv-f/.test(mg.toString()) && /eqv-fourch/.test(mg.toString()));
}

console.log('\n─── 5. Le certificat par fourchette ───');
{
  const PAGE = lire('planning.html');
  const src = extraire(PAGE, 'renderCertificatFourchette');
  V('renderCertificatFourchette existe et le certificat y bascule dès que les parts sont là', !!src && /renderCertificatFourchette\(evalues\.filter/.test(extraire(PAGE, 'renderCertificatMAR')));
  const run = (liste, deplie) => {
    const ctx = { fourchettesEquite: W.fourchettesEquite, ecartFourchette: W.ecartFourchette, CERT_MAR_DEPLIE: !!deplie, currentYear: 2027, Math, String, Number };
    vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.renderCertificatFourchette(liste);
  };
  const tous = equipe().filter(x => !x.wish && x.name !== 'MAR03');
  const autres = [33, 32, 33].map((t, i) => ({ name: 'MAR9' + i, total: t, je: 5, vd: 5, sa: 5, di: 5, we: 10, jf: 1, vjf: 0, pTot: 32.997, pSa: 4.961, pJe: 4.769, pVd: 4.961, pJf: 1.244, pVjf: 0.478, pWe: 10 }));
  const h = run(tous.concat(autres));
  V('conforme : « 5 / 5 MAR dans leur fourchette », « 0 compteur hors fourchette », tampon', /5 \/ 5/.test(h) && />0<\/div><div[^>]*>compteur hors fourchette/.test(h) && /Certifié/.test(h));
  V('total par part : « Temps plein ×2 » 36 face à 36–37, « 90 % ×3 » 32–33 face à 32–33', /Temps plein[\s\S]*?>36<\/b>[\s\S]*?36–37/.test(h) && /90 %[\s\S]*?>32–33<\/b>[\s\S]*?32–33/.test(h), h.slice(0, 200));
  V('plus aucun « écart le plus fort » ni « /37 »', !/écarts les plus forts/.test(h) && !/\/37/.test(h));
  const h2 = run(equipe().filter(x => !x.wish));
  V('un MAR hors fourchette : « à vérifier », listé avec son compteur, pas de tampon', /à vérifier/.test(h2) && /MAR03[\s\S]*?samedis[\s\S]*?−1/.test(h2) && !/Certifié/.test(h2));
}

console.log('\n─── 6. La page ───');
{
  const PAGE = lire('planning.html');
  V('les 11 cases de la ligne repliée tiennent sur une ligne (11 colonnes)', /\.eqv-bande\{flex:1;display:grid;grid-template-columns:repeat\(11,1fr\)/.test(PAGE));
  V('les deux appels de la page demandent la fourchette', (PAGE.match(/axes: AX_EQUITE, fourchette: true \}/g) || []).length === 2);
  V('la carte du MAR connecté annonce « Votre fourchette »', /Votre fourchette : /.test(extraire(PAGE, 'eqLignesMoi')));
  V('« Aujourd\'hui » masqué hors du planning du jour', /isToday \|\| mobilePlanningView !== 'planning'/.test(PAGE) && /_fab && v !== 'planning'/.test(extraire(PAGE, 'mobileSetView')));
}

console.log('\n' + ok + ' ✓, ' + ko + ' ✗');
process.exit(ko ? 1 : 0);
