/* ═══ BANC — OUTIL ACR (27/09/2026) ═══
   L'outil d'aide à l'arrêt cardiaque (acr/) est une page AUTONOME : aucun code,
   aucun serveur, aucun appel réseau. On la charge TELLE QUELLE dans un
   navigateur simulé, avec une horloge pilotée par le test (les minuteurs se
   jouent en secondes simulées, pas en attente réelle), et on la touche comme
   un médecin : Adulte / Enfant, massage, chocs, doses, annulations, fin.

   Puis le service worker de l'outil (acr/sw.js), exécuté tel quel contre un
   cache et un réseau simulés : première ouverture, mode avion, nouvelle
   version publiée, cohabitation avec celui du portail (sw.js).

   Ce que le banc ne prouve PAS : l'installation réelle de l'icône (iPhone,
   Android), le choix par le navigateur du service worker au périmètre le plus
   précis, le mode avion sur un vrai téléphone. Ces points se vérifient à la main.

   Sources des doses : ERC 2025 (adulte, pédiatrie), formules de poids APLS 2011. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const racine = (...p) => path.join(__dirname, '..', ...p);
const lire = f => fs.readFileSync(racine(f), 'utf8');

const PAGE = lire('acr/index.html');
const T0 = new Date(2026, 8, 27, 14, 0, 0).getTime();
const CLE = 'acr-v1';

/* Ouvre la page. Horloge (Date.now) et battement (setInterval) sont sous la
   main du test : `avancer(s)` fait passer s secondes et rejoue le battement. */
function ouvrir(o = {}) {
  const H = { t: o.t != null ? o.t : T0 };
  const tics = new Map(); let n = 0;
  const reponses = o.reponses || [];
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const inv = { appels: 0 };
  const dom = new JSDOM(o.src || PAGE, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://planningmedic.github.io/acr/',
    beforeParse(w) {
      w.Date.now = () => H.t;
      w.setInterval = (f) => { n++; tics.set(n, f); return n; };
      w.clearInterval = (id) => { tics.delete(id); };
      w.matchMedia = (q) => ({ matches: !!(o.installe && /standalone/.test(q)), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      w.prompt = () => (reponses.length ? reponses.shift() : null);
      if (o.stockage) for (const [k, v] of Object.entries(o.stockage)) if (v != null) w.localStorage.setItem(k, v);
    },
  });
  const w = dom.window;
  const $ = id => w.document.getElementById(id);
  return {
    w, $, H, erreurs, reponses, inv,
    avancer(s) { H.t += s * 1000; for (const f of tics.values()) f(); },
    etat() { return JSON.parse(w.localStorage.getItem(CLE)); },
    stock() { return { [CLE]: w.localStorage.getItem(CLE) }; },
    visible(id) { return !$(id).classList.contains('cache'); },
    texte(id) { return $(id).textContent; },
    fermer() { w.close(); },
  };
}
function demarrerEnfant(p, unite, v) {
  p.$('btn-enfant').click();
  p.w.document.querySelector(`#ages button[data-u="${unite}"][data-v="${v}"]`).click();
  p.$('btn-demarrer-enfant').click();
}
function annulerLigne(p, bout) {
  const l = [...p.w.document.querySelectorAll('#journal .ligne')]
    .find(x => !x.classList.contains('barre') && x.querySelector('.quoi').textContent.includes(bout));
  l.querySelector('[data-annul]').click();
}
/* La ligne dont le texte COMMENCE par `bout` : « Annulation : Adrénaline n°1 »
   contient aussi « Adrénaline n°1 », et la chronologie liste le plus récent en tête. */
function ligne(p, bout) {
  return [...p.w.document.querySelectorAll('#journal .ligne')].find(x => x.querySelector('.quoi').textContent.startsWith(bout));
}
function conseils(p) { return [...p.w.document.querySelectorAll('#conseils .conseil')].map(x => x.textContent); }
async function finir(p, id) { p.$(id).click(); await dodo(450); return p.texte('resume'); }

(async () => {

console.log('\n═══ A1. La page se charge, seule, sans rien demander au réseau ═══');
{
  const p = ouvrir();
  V('aucune erreur au chargement', p.erreurs.length === 0, p.erreurs.slice(0, 2));
  V('l\'accueil est affiché (Adulte / Enfant)', p.visible('ecran-accueil') && !!p.$('btn-adulte') && !!p.$('btn-enfant'));
  V('le bandeau « Maquette » a disparu', !/Maquette/i.test(PAGE) && !/à valider/i.test(PAGE.replace(/<!--[\s\S]*?-->/g, '')));
  V('aucun appel réseau dans la page (ni fetch, ni XMLHttpRequest)', !/\bfetch\s*\(/.test(PAGE) && !/XMLHttpRequest/.test(PAGE));
  const externes = [...PAGE.matchAll(/\s(?:src|href)="(https?:)?\/\/[^"]*"/g)].map(m => m[0].trim());
  V('aucune ressource externe (police, script, feuille de style)', externes.length === 0 && !/@import|url\(\s*["']?https?:/.test(PAGE), externes);
  V('aucune adresse du portail ni du relais dans la page', !/workers\.dev|script\.google|partage\//.test(PAGE));
  V('la mention de licence Font Awesome (CC BY 4.0) accompagne les icônes',
    /Font Awesome Free 7\.3\.1/.test(PAGE) && /CC BY 4\.0/.test(PAGE) && /faPerson/.test(PAGE) && /faBaby/.test(PAGE));
  V('la page n\'est pas référencée (noindex)', /<meta name="robots" content="noindex, nofollow">/.test(PAGE));
  p.fermer();
}

console.log('\n═══ A2. Valeurs modifiables centralisées en tête du script ═══');
{
  const script = PAGE.match(/<script>([\s\S]*?)<\/script>/)[1];
  const tete = script.slice(0, script.indexOf('var CLE'));
  ['TEL_REA', 'TEL_CCT', 'EXPIRATION_H', 'ADRE_MIN_S', 'ADRE_MAX_S', 'CHOC_DELAI_S', 'ADULTE', 'ENFANT', 'ENERGIES_ADULTE', 'ENERGIE_AUTRE', 'POIDS']
    .forEach(c => V(`${c} est déclaré dans le bloc de tête`, new RegExp('var ' + c + '\\s*=').test(tete)));
  V('délai d\'effacement : 2 h', /var EXPIRATION_H = 2;/.test(tete));
  V('numéro réanimateur : 3636', /var TEL_REA = "3636";/.test(tete));
  V('numéro CCT : vide pour l\'instant', /var TEL_CCT = "";/.test(tete));
  V('le numéro 3636 n\'est écrit nulle part ailleurs', (PAGE.match(/3636/g) || []).length === 1);

  const p = ouvrir(); p.$('btn-adulte').click();
  V('le numéro réanimateur s\'affiche en tête', p.texte('tel-rea') === '3636', p.texte('tel-rea'));
  V('CCT vide : la case ECMO affiche « ECMO » seul, sans ligne de numéro',
    !p.visible('ecmo-tel') && p.$('a-ecmo').textContent.trim() === 'ECMO', p.$('a-ecmo').textContent);
  p.fermer();
  const q = ouvrir({ src: PAGE.replace('var TEL_CCT = "";', 'var TEL_CCT = "12 34";') }); q.$('btn-adulte').click();
  V('CCT renseigné : la ligne « CCT : numéro » apparaît, sans autre retouche', q.visible('ecmo-tel') && q.texte('ecmo-tel') === 'CCT : 12 34', q.texte('ecmo-tel'));
  q.fermer();
}

console.log('\n═══ B1. Poids estimé par l\'âge (APLS 2011) ═══');
{
  const p = ouvrir(); const C = p.w.ACR_CALCUL;
  const cas = [['mois', 0, 4], ['mois', 6, 7], ['mois', 9, 8.5], ['ans', 1, 10], ['ans', 5, 18], ['ans', 6, 25], ['ans', 12, 43]];
  cas.forEach(([u, v, kg]) => V(`${v} ${u} → ${kg} kg`, C.poidsEstime({ unite: u, v }).kg === kg, C.poidsEstime({ unite: u, v })));
  V('formule affichée avant 1 an : 0,5 × mois + 4', C.poidsEstime({ unite: 'mois', v: 9 }).formule === '0,5 × 9 mois + 4');
  V('formule affichée de 1 à 5 ans : 2 × âge + 8', C.poidsEstime({ unite: 'ans', v: 5 }).formule === '2 × 5 ans + 8');
  V('formule affichée de 6 à 12 ans : 3 × âge + 7', C.poidsEstime({ unite: 'ans', v: 6 }).formule === '3 × 6 ans + 7');
  p.$('btn-enfant').click();
  p.w.document.querySelector('#ages button[data-u="mois"][data-v="9"]').click();
  V('à l\'écran, 9 mois → « 8,5 kg »', /8,5 kg/.test(p.texte('estimation')), p.texte('estimation'));
  V('l\'écran ne dit plus « formule à valider »', !/valider/.test(p.texte('estimation')));
  V('Démarrer n\'est actif qu\'une fois l\'âge choisi', p.$('btn-demarrer-enfant').disabled === false);
  p.fermer();
}

console.log('\n═══ B2. Doses et plafonds ═══');
{
  const p = ouvrir(); const C = p.w.ACR_CALCUL;
  V('adrénaline enfant : 10 µg/kg (16 kg → 160 µg)', C.adreEnfantUg(16).dose === 160);
  V('adrénaline enfant plafonnée à 1 mg (150 kg → 1 000 µg)', C.adreEnfantUg(150).dose === 1000 && C.adreEnfantUg(150).plafond === true);
  V('amiodarone enfant 1re dose : 5 mg/kg (43 kg → 215 mg)', C.amioEnfantMg(43, 1).dose === 215 && !C.amioEnfantMg(43, 1).plafond);
  V('amiodarone enfant 1re dose plafonnée à 300 mg (80 kg)', C.amioEnfantMg(80, 1).dose === 300 && C.amioEnfantMg(80, 1).plafond);
  V('amiodarone enfant 2e dose plafonnée à 150 mg (43 kg → 150)', C.amioEnfantMg(43, 2).dose === 150 && C.amioEnfantMg(43, 2).plafond);
  V('choc enfant : 4 J/kg (16 kg → 64 J)', C.joulesEnfant(16) === 64);
  p.fermer();

  const e = ouvrir(); demarrerEnfant(e, 'ans', 12);
  V('enfant 12 ans (43 kg) : adrénaline 430 µg affichée', e.texte('adre-dose') === '430 µg IV/IO', e.texte('adre-dose'));
  V('…amiodarone 1re dose 215 mg', e.texte('amio-dose') === '215 mg IV/IO', e.texte('amio-dose'));
  e.$('a-amio').click();
  V('…2e dose plafonnée : 150 mg', e.texte('amio-dose') === '150 mg IV/IO', e.texte('amio-dose'));
  e.$('a-amio').click();
  V('…le calcul et le plafond sont écrits dans la chronologie', /215 mg → plafond 150 mg/.test(ligne(e, 'Amiodarone 2e dose').textContent));
  V('…choc par défaut : 172 J (4 J/kg × 43 kg)', e.texte('choc-dose') === '172 J (4 J/kg × 43 kg)', e.texte('choc-dose'));
  e.fermer();

  const a = ouvrir(); a.$('btn-adulte').click();
  V('adulte : adrénaline 1 mg', a.texte('adre-dose') === '1 mg IV/IO', a.texte('adre-dose'));
  V('adulte : amiodarone 300 mg', a.texte('amio-dose') === '300 mg IV/IO');
  a.$('a-amio').click();
  V('adulte : puis 150 mg', a.texte('amio-dose') === '150 mg IV/IO');
  a.$('a-amio').click();
  V('adulte : après deux doses, « Doses faites »', a.texte('amio-dose') === 'Doses faites');
  a.$('a-amio').click();
  V('une 3e amiodarone n\'est pas notée (×2 reste ×2)', a.texte('amio-compte') === '×2' && a.etat().evts.filter(x => x.type === 'amio').length === 2);
  a.fermer();
}

console.log('\n═══ B3. Totaux du compte rendu, en mg, doses annulées exclues ═══');
{
  const p = ouvrir(); demarrerEnfant(p, 'ans', 4);
  V('enfant de 4 ans : 16 kg estimés', /16 kg/.test(p.texte('patient')), p.texte('patient'));
  p.$('a-adre').click(); p.avancer(200); p.$('a-adre').click(); p.avancer(200); p.$('a-adre').click();
  annulerLigne(p, 'Adrénaline n°3');
  const cr = await finir(p, 'a-stop');
  V('2 adrénalines retenues, la 3e annulée : total 0,32 mg', /Adrénaline : 2 doses — total 0,32 mg/.test(cr), cr.split('\n').find(l => /^Adrénaline/.test(l)));
  V('la dose annulée reste visible dans la chronologie, marquée', /Adrénaline n°3 .*\[ANNULÉ à/.test(cr));
  p.fermer();
  const a = ouvrir(); a.$('btn-adulte').click();
  a.$('a-amio').click(); a.$('a-amio').click();
  const cra = await finir(a, 'a-racs');
  V('adulte : amiodarone 300 + 150 → total 450 mg', /Amiodarone : 2 doses — total 450 mg/.test(cra));
  a.fermer();
}

console.log('\n═══ C1. Bouton Choc et rythme ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  V('au départ, le choc est possible', p.$('a-choc').disabled === false);
  p.$('r-nonchoc').click();
  V('« Non choquable » rend le bouton Choc inactif', p.$('a-choc').disabled === true);
  p.$('a-choc').click();
  V('…et un appui dessus ne note aucun choc', p.etat().evts.filter(x => x.type === 'choc').length === 0);
  p.$('r-choc').click();
  V('« Choquable » le réactive', p.$('a-choc').disabled === false);
  p.$('a-choc').click();
  V('…et le choc est noté (×1)', p.texte('choc-compte') === '×1');
  p.fermer();
}

console.log('\n═══ C2. Rappels « 3 chocs » et « 5 chocs » (rythme choquable) ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click(); p.$('r-choc').click();
  p.$('a-choc').click(); p.$('a-choc').click();
  V('2 chocs : aucun rappel', conseils(p).length === 0, conseils(p));
  p.$('a-choc').click();
  V('3e choc : adrénaline ET amiodarone recommandées', conseils(p).some(t => /adrénaline et amiodarone/.test(t)), conseils(p));
  p.$('a-adre').click();
  V('adrénaline donnée : il ne reste que l\'amiodarone (1re dose)', conseils(p).length === 1 && /amiodarone \(1re dose\)/.test(conseils(p)[0]), conseils(p));
  p.$('a-amio').click();
  V('amiodarone donnée : plus de rappel « 3 chocs »', !conseils(p).some(t => /3 chocs/.test(t)), conseils(p));
  p.$('a-choc').click();
  V('4 chocs : rien de nouveau', !conseils(p).some(t => /5 chocs/.test(t)));
  p.$('a-choc').click();
  V('5e choc : 2e dose d\'amiodarone recommandée', conseils(p).some(t => /5 chocs.*2e dose/.test(t)), conseils(p));
  p.$('a-amio').click();
  V('2e amiodarone donnée : le rappel disparaît', !conseils(p).some(t => /5 chocs/.test(t)));
  p.fermer();

  const q = ouvrir(); q.$('btn-adulte').click(); q.$('r-choc').click();
  q.$('a-choc').click(); q.$('a-choc').click(); q.$('a-choc').click(); q.$('a-amio').click();
  V('amiodarone donnée sans adrénaline : le rappel ne cite que l\'adrénaline', conseils(q).length === 1 && /adrénaline recommandée/.test(conseils(q)[0]) && !/amiodarone/.test(conseils(q)[0]), conseils(q));
  q.$('r-nonchoc').click();
  V('en rythme non choquable, pas de rappel lié aux chocs', conseils(q).length === 0, conseils(q));
  q.fermer();
}

console.log('\n═══ C3. Minuteur Adrénaline : 3 min, 5 min, remise à zéro ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  const pas = () => p.$('adre-etat');
  V('avant toute dose : « À donner »', pas().textContent === 'À donner');
  p.$('a-adre').click();
  V('juste après la dose : « Dans 3:00 »', pas().textContent === 'Dans 3:00', pas().textContent);
  p.avancer(179);
  V('à 2:59 : « Dans 0:01 »', pas().textContent === 'Dans 0:01', pas().textContent);
  p.avancer(1);
  V('à 3:00 pile : « Maintenant »', pas().textContent === 'Maintenant' && pas().classList.contains('pret'), pas().textContent);
  p.avancer(119);
  V('à 4:59 : toujours « Maintenant »', pas().textContent === 'Maintenant');
  p.avancer(1);
  V('à 5:00 pile : « Retard +0:00 »', pas().textContent === 'Retard +0:00' && pas().classList.contains('retard'), pas().textContent);
  p.avancer(72);
  V('à 6:12 : « Retard +1:12 »', pas().textContent === 'Retard +1:12', pas().textContent);
  V('le rappel texte « depuis la dernière dose » n\'existe plus', !conseils(p).some(t => /dernière dose/.test(t)) && !/depuis la dernière dose/.test(PAGE));
  p.$('a-adre').click();
  V('nouvelle dose : le minuteur repart à « Dans 3:00 »', pas().textContent === 'Dans 3:00' && !pas().classList.contains('retard'), pas().textContent);
  V('le compteur affiche ×2', p.texte('adre-compte') === '×2');
  p.avancer(60);
  annulerLigne(p, 'Adrénaline n°2');
  V('dose annulée : le minuteur repart de la dose précédente (7:12 → Retard)', /^Retard/.test(pas().textContent), pas().textContent);
  p.fermer();
}

console.log('\n═══ C4. Minuteur Choc : 2 min, remise à zéro, masqué en non choquable ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  const ch = () => p.$('choc-etat');
  V('avant tout choc : pas de minuteur', ch().classList.contains('cache'));
  V('avant tout choc : pas de compteur', p.texte('choc-compte') === '');
  p.$('a-choc').click();
  V('juste après le choc : « Prochain dans 2:00 »', !ch().classList.contains('cache') && ch().textContent === 'Prochain dans 2:00', ch().textContent);
  p.avancer(119);
  V('à 1:59 : « Prochain dans 0:01 »', ch().textContent === 'Prochain dans 0:01', ch().textContent);
  p.avancer(1);
  V('à 2:00 pile : « Analyse maintenant »', ch().textContent === 'Analyse maintenant' && ch().classList.contains('pret'), ch().textContent);
  p.$('a-choc').click();
  V('nouveau choc : repart à « Prochain dans 2:00 »', ch().textContent === 'Prochain dans 2:00' && !ch().classList.contains('pret'));
  V('le compteur affiche ×2', p.texte('choc-compte') === '×2');
  p.$('r-nonchoc').click();
  V('rythme non choquable : minuteur masqué', ch().classList.contains('cache'));
  p.$('r-choc').click();
  V('rythme choquable à nouveau : minuteur réaffiché', !ch().classList.contains('cache'));
  p.fermer();
}

console.log('\n═══ C5. Un choc ne touche ni au cycle de massage ni au masseur ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  p.$('btn-massage').click(); p.avancer(50);
  const avant = { reste: p.texte('cycle-reste'), info: p.texte('cycle-info'), debut: p.etat().cycleDebut, no: p.etat().cycleNo };
  V('cycle en cours : 1:10 restant, masseur n°1', avant.reste === '1:10' && avant.info === 'Masseur n°1', avant);
  p.$('a-choc').click();
  const apres = { reste: p.texte('cycle-reste'), info: p.texte('cycle-info'), debut: p.etat().cycleDebut, no: p.etat().cycleNo };
  V('après un choc : même temps restant, même masseur', apres.reste === avant.reste && apres.info === avant.info, apres);
  V('après un choc : début de cycle et numéro de masseur inchangés en mémoire', apres.debut === avant.debut && apres.no === avant.no);
  p.$('a-adre').click();
  V('une adrénaline non plus', p.texte('cycle-reste') === '1:10' && p.etat().cycleNo === 1);
  p.avancer(30);
  p.$('btn-analyse').click();
  V('le relais, lui, relance le cycle (2:00) et passe au masseur n°2', p.texte('cycle-reste') === '2:00' && p.texte('cycle-info') === 'Masseur n°2');
  V('…sans remettre à zéro les minuteurs du choc et de l\'adrénaline (0:30 écoulées)',
    p.texte('choc-etat') === 'Prochain dans 1:30' && p.texte('adre-etat') === 'Dans 2:30', [p.texte('choc-etat'), p.texte('adre-etat')]);
  p.fermer();
}

console.log('\n═══ C6. Adrénaline, Amiodarone, Choc : même structure ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  ['a-choc', 'a-adre', 'a-amio'].forEach(id => {
    const b = p.$(id);
    V(`${id} : nom, dose, puis bas (minuteur à gauche, compteur à droite)`,
      !!b.querySelector('.titre') && !!b.querySelector('.dose-l') && !!b.querySelector('.bas') && !!b.querySelector('.compte'));
  });
  p.$('a-amio').click();
  V('les compteurs s\'écrivent « ×N »', p.texte('amio-compte') === '×1');
  p.fermer();
}

console.log('\n═══ D1. Compte rendu : no-flow, low-flow, pas de 4H/4T ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  p.avancer(45); p.$('btn-massage').click();
  p.w.document.querySelector('#hdt button[data-hdt="0"]').click();
  p.avancer(600);
  const cr = await finir(p, 'a-racs');
  V('durée totale 10:45', /Durée totale : 10:45/.test(cr), cr.split('\n')[2]);
  V('no-flow « au moins » : de l\'ouverture au début du massage (00:45)', /No-flow : au moins 00:45/.test(cr));
  V('low-flow : du début du massage à la fin (10:00)', /Low-flow : 10:00/.test(cr));
  V('aucune ligne 4H/4T dans le compte rendu', !/Cause éliminée|4H|4T|Hypoxie/.test(cr));
  V('…alors qu\'elle figure bien à l\'écran pendant la réanimation', p.etat().evts.some(x => x.type === 'hdt'));
  V('la fin est titrée « Reprise d\'activité circulatoire »', p.texte('fin-titre') === 'Reprise d\'activité circulatoire');
  p.fermer();
  const q = ouvrir(); q.$('btn-adulte').click(); q.avancer(300);
  const crq = await finir(q, 'a-stop');
  V('massage non enregistré : no-flow et low-flow « non calculables »', /No-flow et low-flow : non calculables/.test(crq) && !/Low-flow :/.test(crq));
  q.fermer();
}

console.log('\n═══ D2. Annulation : barrée, jamais supprimée ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click();
  p.$('a-adre').click();
  const avant = p.w.document.querySelectorAll('#journal .ligne').length;
  annulerLigne(p, 'Adrénaline n°1');
  const l = ligne(p, 'Adrénaline n°1');
  V('la ligne annulée reste, barrée', !!l && l.classList.contains('barre'));
  V('une ligne « Annulation : … » s\'ajoute (rien n\'est retiré)', p.w.document.querySelectorAll('#journal .ligne').length === avant + 1);
  V('le compteur ne compte plus la dose annulée', p.texte('adre-compte') === '' && p.$('adre-etat').textContent === 'À donner');
  V('une ligne annulée ne peut pas l\'être deux fois', !l.querySelector('[data-annul]'));
  p.$('btn-massage').click(); p.avancer(20);
  V('massage démarré : le cycle tourne', p.visible('cycle') && !p.visible('btn-massage'));
  annulerLigne(p, 'Début du massage');
  V('annuler « Début du massage » remet le minuteur en attente', !p.visible('cycle') && p.visible('btn-massage'));
  V('…et remet le masseur à n°1, sans début de massage retenu', p.etat().cycleNo === 1 && p.etat().massage === null);
  const cr = await finir(p, 'a-stop');
  V('…et le compte rendu dit alors « non calculables »', /non calculables/.test(cr));
  p.fermer();
}

console.log('\n═══ E1. Chronologie : reprise, ACR terminé, effacement à 2 h ═══');
{
  const p = ouvrir(); p.$('btn-adulte').click(); p.$('btn-massage').click(); p.$('a-choc').click();
  const sto = p.stock(); const t = p.H.t; p.fermer();
  const q = ouvrir({ stockage: sto, t: t + 5 * 60000 });
  V('rouverte en cours d\'ACR : la réanimation reprend (pas l\'accueil)', q.visible('ecran-arret') && !q.visible('ecran-accueil'));
  V('…avec ses gestes (×1 choc) et son chronomètre (05:00)', q.texte('choc-compte') === '×1' && q.texte('chrono') === '05:00', [q.texte('choc-compte'), q.texte('chrono')]);
  V('…et le signale', /reprise/.test(q.texte('toast')));
  await finir(q, 'a-racs');
  const sto2 = q.stock(); const t2 = q.H.t; q.fermer();
  const r = ouvrir({ stockage: sto2, t: t2 + 10 * 60000 });
  V('ACR terminé puis rouvert : l\'accueil s\'affiche', r.visible('ecran-accueil') && !r.visible('ecran-arret'));
  V('…avec le lien vers le dernier compte rendu', !!r.$('voir-dernier'));
  r.$('voir-dernier').click();
  V('…qui ouvre ce compte rendu', r.visible('ecran-fin') && /Compte rendu ACR — adulte/.test(r.texte('resume')) && r.texte('fin-titre') === 'Dernier ACR');
  r.fermer();
  const dernier = JSON.parse(sto2[CLE]).evts.slice(-1)[0].t;
  const s = ouvrir({ stockage: sto2, t: dernier + 2 * 3600000 + 1000 });
  V('2 h et 1 s sans activité : la chronologie est effacée', s.w.localStorage.getItem(CLE) === null && !s.$('voir-dernier'));
  s.fermer();
  const u = ouvrir({ stockage: sto2, t: dernier + 2 * 3600000 - 60000 });
  V('1 h 59 : elle est encore là', u.w.localStorage.getItem(CLE) !== null && !!u.$('voir-dernier'));
  u.fermer();
}

console.log('\n═══ F1. Énergie du choc ═══');
{
  const a = ouvrir(); a.$('btn-adulte').click();
  const actif = p => (p.w.document.querySelector('#energie button.actif') || {}).textContent;
  V('adulte : DSA par défaut', actif(a) === 'DSA' && a.texte('choc-dose') === 'DSA (énergie automatique)', actif(a));
  V('adulte : raccourcis 150 J et 200 J proposés', /150 J/.test(a.texte('energie')) && /200 J/.test(a.texte('energie')));
  a.w.document.querySelector('#energie button[data-e="200"]').click();
  a.$('a-choc').click();
  V('le choc est noté avec l\'énergie choisie', /Choc n°1 — 200 J/.test(ligne(a, 'Choc n°1').textContent));
  const essai = (rep) => { a.reponses.push(rep); a.w.document.querySelector('#energie button[data-e="autre"]').click(); return a.texte('choc-dose'); };
  V('« Autre » 250 → 250 J', essai('250') === '250 J');
  V('« Autre » 400 accepté (borne haute)', essai('400') === '400 J');
  V('« Autre » 1 accepté (borne basse)', essai('1') === '1 J');
  V('« Autre » « 200 J » accepté', essai('200 J') === '200 J');
  ['0', '401', 'abc', '-5', '1,5', '', '1000'].forEach(x => V(`« Autre » « ${x} » refusé (énergie inchangée)`, essai(x) === '200 J'));
  const C = a.w.ACR_CALCUL;
  V('la saisie annulée (bouton Annuler) ne change rien', (a.reponses.push(null), a.w.document.querySelector('#energie button[data-e="autre"]').click(), a.texte('choc-dose')) === '200 J');
  V('contrôle direct : 1 à 400 seulement', C.energieSaisie('400') === 400 && C.energieSaisie('401') === null && C.energieSaisie('0') === null);
  a.fermer();
  const e = ouvrir(); demarrerEnfant(e, 'ans', 4);
  V('enfant : 4 J/kg par défaut (16 kg → 64 J)', actif(e) === '64 J' && e.texte('choc-dose') === '64 J (4 J/kg × 16 kg)', e.texte('choc-dose'));
  V('enfant : pas de raccourcis adultes 150 / 200 J', !/150 J|200 J/.test(e.texte('energie')));
  e.fermer();
}

console.log('\n═══ G1. Encart d\'installation (médecins hors portail) ═══');
{
  const p = ouvrir();
  V('dans le navigateur : l\'encart « Mettre l\'outil sur ce téléphone » est là', p.visible('installer') && /iPhone/.test(p.texte('installer')) && /Android/.test(p.texte('installer')));
  V('le bouton « Installer maintenant » est caché tant que le navigateur ne le propose pas', !p.visible('btn-installer'));
  let invite = 0;
  const ev = new p.w.Event('beforeinstallprompt'); ev.prompt = () => { invite++; };
  p.w.dispatchEvent(ev);
  V('Chrome propose l\'installation : le bouton apparaît', p.visible('btn-installer'));
  p.$('btn-installer').click();
  V('…et le toucher ouvre la demande d\'installation du navigateur', invite === 1 && !p.visible('btn-installer'));
  p.fermer();
  const q = ouvrir({ installe: true });
  V('ouvert depuis l\'icône installée : l\'encart disparaît', !q.visible('installer'));
  q.fermer();
}

console.log('\n═══ H1. Forme de la page : balises équilibrées, id uniques ═══');
{
  const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const doublons = ids.filter((x, i) => ids.indexOf(x) !== i);
  V(`id uniques (${ids.length})`, doublons.length === 0, doublons);
  const nu = PAGE.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
  const vides = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'area', 'base', 'col', 'embed', 'wbr', '!doctype']);
  const pile = []; const fautes = [];
  for (const m of nu.matchAll(/<(\/?)([a-zA-Z!][a-zA-Z0-9-]*)[^>]*?(\/?)>/g)) {
    const nom = m[2].toLowerCase();
    if (vides.has(nom) || m[3] === '/') continue;
    if (!m[1]) pile.push(nom);
    else if (pile.pop() !== nom) fautes.push(nom);
  }
  V('balises HTML équilibrées', fautes.length === 0 && pile.length === 0, { fautes, reste: pile });
  /* Largeurs 320 et 375 px : mesurées au navigateur le 27/09/2026 (capture). Le
     banc ne sait pas mesurer une largeur de texte ; il garde les TROIS réglages
     qui ont fait disparaître les débordements, pour qu'un retouche ne les défasse pas. */
  V('4H/4T : colonnes bornées (minmax), « Hypo/hyperthermie » ne pousse plus la colonne 4T hors de l\'écran',
    /\.hdt-grille\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/.test(PAGE) && /h\.nom\.replace\("\/", "\/<wbr>"\)/.test(PAGE));
  V('boutons Adrénaline / Amiodarone : le compteur ×N ne peut pas être poussé hors du bouton',
    /\.act-med \.bas \.compte\{flex:none\}/.test(PAGE) && /\.pastille\{overflow:hidden;text-overflow:ellipsis\}/.test(PAGE));
  V('jusqu\'à 400 px (iPhone 375–393) : texte des pastilles resserré', /@media \(max-width:400px\)\{[\s\S]*?\.pastille\{padding:2px 5px;font-size:12px/.test(PAGE));
  const p = ouvrir(); p.$('btn-adulte').click();
  const hyp = [...p.w.document.querySelectorAll('#hdt .nom')].find(x => /hyperthermie/.test(x.textContent));
  V('la case s\'affiche « Hypo/hyperthermie » (coupure possible, texte intact)', hyp && hyp.textContent === 'Hypo/hyperthermie' && hyp.innerHTML.includes('<wbr>'));
  p.w.document.querySelector('#hdt button[data-hdt="3"]').click();
  V('…et la cocher fonctionne toujours (✓, 1/8)', p.texte('hdt-compte') === '1/8' && /✓ Hypo/.test(p.$('hdt').textContent));
  p.fermer();
}

console.log('\n═══ I1. Application installable, distincte de Planning-Med ═══');
{
  const m = JSON.parse(lire('acr/manifest.webmanifest'));
  const portail = JSON.parse(lire('manifest.webmanifest'));
  V('nom et nom court : « ACR »', m.name === 'ACR' && m.short_name === 'ACR');
  V('id et adresse de départ : /acr/', m.id === '/acr/' && m.start_url === '/acr/');
  V('périmètre : /acr/', m.scope === '/acr/');
  V('affichage plein écran (standalone)', m.display === 'standalone');
  V('couleur identique au portail', m.theme_color === portail.theme_color, [m.theme_color, portail.theme_color]);
  const base = 'https://planningmedic.github.io/';
  const idPortail = new URL(portail.id || portail.start_url, base).href;
  const idAcr = new URL(m.id, base + 'acr/manifest.webmanifest').href;
  V('identifiants distincts : installer ACR ne remplace pas Planning-Med', idAcr !== idPortail, [idAcr, idPortail]);
  V('le manifeste du portail n\'est pas touché (même id implicite, périmètre racine)',
    !portail.id && portail.start_url === './' && portail.scope === './' && portail.name === 'Planning-Med');
  V('la page déclare SON manifeste, pas celui du portail', /<link rel="manifest" href="manifest\.webmanifest">/.test(PAGE));
  const png = f => { const b = fs.readFileSync(racine('acr', f)); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  const attendus = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };
  Object.entries(attendus).forEach(([f, t]) => V(`${f} : PNG ${t}×${t}`, JSON.stringify(png(f)) === JSON.stringify([t, t]), png(f)));
  V('chaque icône du manifeste existe', m.icons.every(i => fs.existsSync(racine('acr', i.src))));
  V('une icône « maskable » est déclarée', m.icons.some(i => i.purpose === 'maskable' && i.src === 'icon-maskable-512.png'));
  V('apple-touch-icon déclaré dans la page', /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/.test(PAGE));
}

console.log('\n═══ J1. Service worker de l\'outil : hors réseau et mises à jour ═══');
{
  const SCOPE = 'https://planningmedic.github.io/acr/';
  /* Un navigateur réduit à ce dont un service worker a besoin : caches, réseau
     (coupable à volonté), fenêtres ouvertes. Le fichier sw.js est exécuté tel quel. */
  function monde(fichier, scope, serveur) {
    const noms = new Map();
    const reseau = { en: true, appels: 0 };
    const messages = [];
    const cle = r => { const u = new URL(typeof r === 'string' ? r : r.url); return u.origin + u.pathname; };
    class Cache {
      constructor() { this.m = new Map(); }
      async match(r) { const v = this.m.get(cle(r)); return v ? v.clone() : undefined; }
      async put(r, res) { this.m.set(cle(r), res); }
      async add(r) { const res = await ctx.fetch(r); if (!res.ok) throw new Error('add'); this.m.set(cle(r), res); }
      async addAll(l) { for (const r of l) await this.add(r); }
    }
    const caches = {
      async open(n) { if (!noms.has(n)) noms.set(n, new Cache()); return noms.get(n); },
      async keys() { return [...noms.keys()]; },
      async delete(n) { return noms.delete(n); },
      async match(r) { for (const c of noms.values()) { const x = await c.match(r); if (x) return x; } },
    };
    const h = {};
    const ctx = {
      URL, Request, Response, Promise, console, caches,
      addEventListener: (t, f) => { h[t] = f; },
      skipWaiting: async () => {}, location: new URL(scope + 'sw.js'),
      registration: { scope, showNotification: async () => {} },
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: m => messages.push(m) }] },
      fetch: async (r) => {
        reseau.appels++;
        if (!reseau.en) throw new TypeError('Failed to fetch');
        const u = new URL(typeof r === 'string' ? r : r.url);
        const corps = serveur[u.pathname];
        return corps == null ? new Response('absent', { status: 404 }) : new Response(corps, { status: 200 });
      },
    };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(lire(fichier), ctx);
    async function vie(type) { let p; h[type]({ waitUntil: x => { p = x; } }); await p; }
    function requete(url, mode = 'no-cors', method = 'GET') {
      let rep; const att = [];
      h.fetch({ request: { url, mode, method }, respondWith: x => { rep = Promise.resolve(x); }, waitUntil: x => att.push(x) });
      return { intercepte: rep !== undefined, reponse: () => rep, fini: () => Promise.all(att) };
    }
    return { noms, reseau, messages, vie, requete, h };
  }
  const SERVEUR = () => ({ '/acr/': 'PAGE-v1', '/acr/manifest.webmanifest': '{}', '/acr/icon-192.png': 'i192', '/acr/icon-512.png': 'i512',
    '/acr/icon-maskable-512.png': 'im512', '/acr/apple-touch-icon.png': 'a180' });

  const srv = SERVEUR();
  const w = monde('acr/sw.js', SCOPE, srv);
  await w.vie('install');
  const c = w.noms.get('acr-v1');
  V('première ouverture : page, manifeste et 4 icônes copiés sur le téléphone', !!c && c.m.size === 6, c && [...c.m.keys()]);
  await w.vie('activate');

  w.reseau.en = false;
  let r = w.requete(SCOPE, 'navigate');
  V('mode avion : la page est servie depuis le téléphone', r.intercepte && (await (await r.reponse()).text()) === 'PAGE-v1');
  r = w.requete(SCOPE + 'index.html', 'navigate');
  V('mode avion : /acr/index.html sert la même page', (await (await r.reponse()).text()) === 'PAGE-v1');
  r = w.requete(SCOPE + 'icon-192.png');
  V('mode avion : les icônes aussi', (await (await r.reponse()).text()) === 'i192');
  await r.fini();

  w.reseau.en = true; srv['/acr/'] = 'PAGE-v2';
  r = w.requete(SCOPE, 'navigate');
  V('nouvelle version publiée : l\'ouverture reste immédiate (copie du téléphone)', (await (await r.reponse()).text()) === 'PAGE-v1');
  await r.fini();
  V('…la nouvelle version remplace la copie en fond, sans geste', (await (await c.match(SCOPE)).text()) === 'PAGE-v2');
  V('…et la page ouverte en est prévenue (rechargement si aucun ACR en cours)', w.messages.some(m => m.type === 'acr-nouvelle-version'));
  r = w.requete(SCOPE, 'navigate');
  V('ouverture suivante : la nouvelle version s\'affiche', (await (await r.reponse()).text()) === 'PAGE-v2');
  const avant = w.messages.length; await r.fini();
  V('version inchangée : aucune alerte de mise à jour', w.messages.length === avant);

  c.m.clear();
  r = w.requete(SCOPE, 'navigate'); await r.reponse(); await r.fini();
  V('cache vidé par un tiers : tout est recopié à la première ouverture avec réseau', c.m.size === 6, c.m.size);

  const x = monde('acr/sw.js', SCOPE, SERVEUR());
  x.reseau.en = false;
  r = x.requete(SCOPE, 'navigate');
  const rep = await r.reponse();
  V('jamais ouverte et sans réseau : un message clair, pas une page blanche', rep.status === 503 && /Pas de réseau/.test(await rep.text()));

  V('hors de /acr/ (le portail) : rien n\'est intercepté', !w.requete('https://planningmedic.github.io/index.html', 'navigate').intercepte
    && !w.requete('https://planningmedic.github.io/version.js').intercepte);
  V('autre site : rien n\'est intercepté', !w.requete('https://exemple.fr/acr/').intercepte);
  V('une requête POST n\'est jamais interceptée', !w.requete(SCOPE, 'navigate', 'POST').intercepte);

  await w.noms.set('acr-v0', new (w.noms.get('acr-v1').constructor)());
  w.noms.set('pm-sw-v2-assets', new (w.noms.get('acr-v1').constructor)());
  await w.vie('activate');
  V('activation : l\'ancien cache de l\'outil (acr-v0) est supprimé', !w.noms.has('acr-v0'));
  V('…mais celui du portail (pm-sw-v2-assets) est laissé intact', w.noms.has('pm-sw-v2-assets'));

  const p = monde('sw.js', 'https://planningmedic.github.io/', {});
  ['acr-v1', 'pm-sw-v1-assets', 'pm-sw-v2-assets', 'pm-sw-v2-fonts'].forEach(n => p.noms.set(n, {}));
  await p.vie('activate');
  V('service worker du portail : il garde le cache de l\'outil ACR', p.noms.has('acr-v1'));
  V('…et continue de supprimer ses propres anciens caches', !p.noms.has('pm-sw-v1-assets') && p.noms.has('pm-sw-v2-assets') && p.noms.has('pm-sw-v2-fonts'));
  V('la page enregistre son service worker dans son propre périmètre',
    /navigator\.serviceWorker\.register\("sw\.js", \{ scope: "\.\/" \}\)/.test(PAGE));
}

console.log('\n═══ K1. Tuile ACR du portail : visible par tous ═══');
{
  const src = lire('index.html');
  const mTiles = src.match(/const TILES = \[[\s\S]*?\n\];/);
  const mFiltre = src.match(/TILES\.filter\((t => [\s\S]*?)\)\.map\(t =>/);
  V('le tableau des tuiles et le filtre sont lisibles', !!mTiles && !!mFiltre);
  const passe = (monde) => {
    const bac = vm.createContext(Object.assign({ window: { innerWidth: 390 }, MY_ID: 'ALPHA', INDISPOS_OUVERTE: false,
      MY_LIBERAL: false, PHASE_TP: null, MY_QUOTITE: 100, MY_TPFIXE: false, MY_TUILES: [] }, monde));
    vm.runInContext(mTiles[0], bac);
    return { cles: vm.runInContext(`TILES.filter(${mFiltre[1]}).map(t => t.key)`, bac), tuile: vm.runInContext(`TILES.find(t => t.key === 'acr')`, bac) };
  };
  const mar = passe({});
  V('un MAR sans tuile réservée voit la tuile ACR', mar.cles.includes('acr'), mar.cles);
  V('la tuile n\'est pas réservée (pas de « prive »)', !!mar.tuile && !mar.tuile.prive && !mar.tuile.liberal && !mar.tuile.campagne);
  V('la tuile ouvre /acr/', mar.tuile && mar.tuile.href === 'acr/');
  V('la teinte rouge existe dans la feuille de style', /\.tile-ico\.rouge\s*\{/.test(src));
  const bundle = lire('assets/vendor/lucide-icons.js');
  V('l\'icône heart-pulse est dans le mini-bundle local', /"heart-pulse":\[/.test(bundle));
}

console.log('\n═══ L1. Guide des MAR : bloc ACR ═══');
{
  const g = lire('docs/guide-mar.html');
  const bloc = (g.match(/<details class="sec" id="s26">[\s\S]*?\n<\/details>/) || [''])[0];
  V('la section 26 existe et est repliée', !!bloc && !/id="s26"[^>]*\sopen/.test(bloc));
  const t = bloc.replace(/<[^>]+>/g, ' ').toLowerCase();
  const interdits = ['miroir', 'journal', 'cloudflare', 'gas'].filter(m => new RegExp('(^|[^a-zà-ÿ])' + m + '($|[^a-zà-ÿ])').test(t));
  V('vocabulaire interdit absent (miroir, journal, Cloudflare, GAS)', interdits.length === 0, interdits);
  V('les gestes : ouvrir, installer, dérouler, copier',
    /planningmedic\.github\.io\/acr/.test(bloc) && /écran d'accueil/.test(bloc) && /Début du massage/.test(bloc) && /Copier la chronologie/.test(bloc));
  V('le guide dit que l\'adresse se transmet hors du service', /autre service/.test(bloc));
  V('la liste des tuiles de la section 03 cite ACR', /<b>ACR<\/b><span>/.test(g) && /href="#s26"/.test(g));
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
