/* ═══ BANC — CRÉNEAUX SECRÉTARIAT (07/10/2026) ═══
   Circuit : le patient libéral donne sa date d'intervention et son secteur,
   l'outil propose les consultations qui conviennent.
   [1] la logique pure (partage/creneaux_secretariat.js), règle par règle,
       chaque règle prouvée par un cas qui la viole ;
   [2] la page de démonstration (demo-secretariat.html) dans un navigateur
       simulé : aucun appel réseau, aucun chiffre libéral, les trois exemples
       donnent ce qu'ils annoncent, le clic sur un créneau affiche le rappel.

   Ce que le banc ne prouve PAS : que les vraies données du service (secteur
   d'affectation, rang) arriveront sous cette forme — c'est l'étape suivante,
   côté serveur. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const racine = (...p) => path.join(__dirname, '..', ...p);
const C = require(racine('partage/creneaux_secretariat.js'));

/* ── 1. LOGIQUE ─────────────────────────────────────────────────────────── */
console.log('\n[1] Logique : les cinq conditions et l\'ordre');
const J = ['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16',
           '2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'];
const OP = '2026-10-21';
const base = () => ({
  aujourdhui: '2026-10-12', jours: J.slice(),
  consultations: [
    { date: '2026-10-13', per: 'am', cs: 'CS-END', mar: 'A' },
    { date: '2026-10-14', per: 'pm', cs: 'CS-END', mar: 'A' },
    { date: '2026-10-13', per: 'pm', cs: 'CS-END', mar: 'B' },
    { date: '2026-10-15', per: 'am', cs: 'CS-END', mar: 'V' },   // autre secteur
    { date: '2026-10-16', per: 'pm', cs: 'CS-POLY', mar: 'P' },  // polyvalent, libéral
    { date: '2026-10-16', per: 'am', cs: 'CS-VIS', mar: 'A' },   // mauvais type
  ],
  absences: {}, groupement: { A: true, B: true, V: true, P: true },
  secteurDe: { A: 'END', B: 'END', V: 'VIS', P: 'ORT' }, rang: { A: 2, B: 1, V: 3, P: 4 },
});
const ids = l => l.map(x => x.mar).join(',');
let r = C.proposer(OP, 'END', base());
V('cas nominal : les médecins du secteur, rang 1 en tête', ids(r.enSecteur) === 'B,A', r);
V('les autres secteurs sont séparés, dans l\'ordre des rangs', ids(r.autresSecteurs) === 'V,P', r);
V('une consultation d\'un autre type (viscéral) n\'est pas proposée pour l\'endoscopie',
  r.enSecteur.find(x => x.mar === 'A').creneaux.every(c => c.cs === 'CS-END'));
V('la consultation polyvalente d\'un libéral est proposée', r.autresSecteurs.some(x => x.mar === 'P' && x.creneaux[0].cs === 'CS-POLY'));
V('les créneaux d\'un médecin sont rangés du plus tôt au plus tard',
  r.enSecteur.find(x => x.mar === 'A').creneaux.map(c => c.date).join() === '2026-10-13,2026-10-14');

let c = base(); c.absences = { B: ['2026-10-21'] };
V('absent le jour de l\'intervention → écarté', ids(C.proposer(OP, 'END', c).enSecteur) === 'A');
c = base(); c.absences = { A: [{ d: '2026-10-13' }] };
V('absent le jour de la consultation → ce créneau seul est écarté (forme {d} admise)',
  C.proposer(OP, 'END', c).enSecteur.find(x => x.mar === 'A').creneaux.map(x => x.date).join() === '2026-10-14');
c = base(); delete c.groupement.B;
V('hors groupement libéral → écarté', ids(C.proposer(OP, 'END', c).enSecteur) === 'A');
c = base(); c.consultations.push({ date: OP, per: 'am', cs: 'CS-END', mar: 'B' }, { date: '2026-10-22', per: 'am', cs: 'CS-END', mar: 'B' });
V('une consultation le jour même ou après l\'intervention n\'est pas proposée',
  C.proposer(OP, 'END', c).enSecteur.find(x => x.mar === 'B').creneaux.every(x => x.date < OP));
c = base(); c.aujourdhui = '2026-10-14';
V('une consultation déjà passée n\'est pas proposée',
  C.proposer(OP, 'END', c).enSecteur.every(x => x.creneaux.every(y => y.date >= '2026-10-14')));
c = base(); c.rang = {};
V('sans rang, l\'ordre reste stable (alphabétique)', ids(C.proposer(OP, 'END', c).enSecteur) === 'A,B');
c = base(); c.absences = { A: [OP], B: [OP] };
r = C.proposer(OP, 'END', c);
V('toute l\'équipe du secteur absente → seuls les autres secteurs restent', r.enSecteur.length === 0 && ids(r.autresSecteurs) === 'V,P', r);
r = C.proposer('2026-11-30', 'END', base());
V('intervention hors de la fenêtre connue → refus motivé, jamais « disponible »',
  r.erreur === 'hors_horizon' && r.dernier === '2026-10-23' && !r.enSecteur, r);
V('date mal formée → refus', C.proposer('21/10/2026', 'END', base()).erreur === 'format');
V('secteur inconnu → refus', C.proposer(OP, 'XYZ', base()).erreur === 'secteur');
V('la sortie ne contient aucun rang ni chiffre libéral',
  !/rang|marge|%/.test(JSON.stringify(C.proposer(OP, 'END', base()))));

/* ── 2. PAGE DE DÉMONSTRATION ───────────────────────────────────────────── */
console.log('\n[2] Page de démonstration');
const PAGE = fs.readFileSync(racine('demo-secretariat.html'), 'utf8');
V('la page charge version.js et porte un emplacement data-version',
  /<script src="version\.js"><\/script>/.test(PAGE) && /data-version/.test(PAGE));
V('la page annonce des données fictives', /fictifs/.test(PAGE));
V('aucune mention de la règle des 30 % ni d\'un montant', !/30\s*%|marge|€|euro/i.test(PAGE.replace(/<!--[\s\S]*?-->/g, '')));
V('aucun appel serveur dans la page', !/fetch\(|XMLHttpRequest|script\.google|workers\.dev/.test(PAGE));

const T0 = new Date(2026, 9, 7, 15, 0, 0).getTime();   // mercredi 7 octobre 2026
const vc = new VirtualConsole(); const erreurs = []; const reseau = [];
vc.on('jsdomError', e => erreurs.push(e.message));
const fichiers = { 'version.js': fs.readFileSync(racine('version.js'), 'utf8'),
                   'partage/creneaux_secretariat.js': fs.readFileSync(racine('partage/creneaux_secretariat.js'), 'utf8') };
const html = PAGE.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => fichiers[f] ? '<script>' + fichiers[f] + '</script>' : m);
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  url: 'https://planningmedic.github.io/demo-secretariat.html',
  beforeParse(w) {
    const D = w.Date; w.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
    w.fetch = u => { reseau.push(String(u)); return Promise.reject(new Error('interdit')); };
    w.XMLHttpRequest = function () { reseau.push('xhr'); this.open = () => {}; this.send = () => {}; };
  },
});
const w = dom.window, $ = id => w.document.getElementById(id);
(async () => {
await new Promise(res => w.addEventListener('load', res));   // DOMContentLoaded passé : version.js a posé son numéro
const txt = () => $('res').textContent;
V('la page s\'ouvre sans erreur', erreurs.length === 0, erreurs);
V('le numéro de version s\'affiche', /^v\d+\.\d+/.test(w.document.querySelector('[data-version]').textContent));
V('six secteurs proposés, Endoscopie choisi par défaut',
  w.document.querySelectorAll('.chip').length === 6 &&
  w.document.querySelector('.chip[aria-checked="true"]').dataset.s === 'END');

$('ex1').click();
const grp1 = [...$('res').querySelectorAll('.grp-t')].map(e => e.textContent);
V('exemple 1 : des médecins de l\'endoscopie sont proposés', grp1.length === 1 && /Endoscopie/.test(grp1[0]) && $('res').querySelectorAll('.mar:not(.autre)').length >= 2, txt());
V('exemple 1 : un médecin hors groupement n\'apparaît jamais', !/Givre|Houle/.test(txt()));
V('exemple 1 : les autres secteurs sont repliés derrière un bouton', !!$('btnAutres') && $('res').querySelectorAll('.mar.autre').length === 0);
$('btnAutres').click();
V('… et s\'affichent au clic', $('res').querySelectorAll('.mar.autre').length >= 1);
const s0 = $('res').querySelector('.slot'); const nom0 = s0.closest('.mar').querySelector('h3').textContent;
s0.click();
V('le clic sur un créneau affiche le rappel à noter', /À noter dans l'agenda/.test(txt()) && txt().includes(nom0), txt());
V('le créneau choisi est marqué', $('res').querySelectorAll('.slot[aria-pressed="true"]').length === 1);

$('ex2').click();
V('exemple 2 : équipe d\'endoscopie absente → message et médecins d\'autres secteurs',
  /Aucun médecin de l'Endoscopie/.test(txt()) && $('res').querySelectorAll('.mar.autre').length >= 1 &&
  $('res').querySelectorAll('.mar:not(.autre)').length === 0, txt());
V('exemple 2 : aucun membre de l\'équipe d\'endoscopie absente n\'est proposé', !/Ambre|Bruyère|Cèdre/.test(txt()));

$('ex3').click();
V('exemple 3 : date trop lointaine → « pas encore connu », aucun créneau',
  /pas encore connu/.test(txt()) && $('res').querySelectorAll('.slot').length === 0, txt());

$('dt').value = '2026-10-10'; $('dt').dispatchEvent(new w.Event('change'));
V('un samedi est refusé', /pas un jour d'intervention/.test(txt()));
V('aucun appel réseau pendant toute la séance', reseau.length === 0, reseau);

console.log(`\n${ok} ✓   ${ko} ✗`);
if (ko) process.exit(1);
})();
