/* ═══ BANC — LE CALCUL À BLANC MONTRE LE PLANNING QUI SERA ÉCRIT (05/10/2026)
   POURQUOI CE SCÉNARIO EXISTE.
   La vraie génération calcule jusqu'à 8 plannings et écrit le plus équitable.
   Le calcul à blanc n'en calculait qu'UN, le premier. Quand le premier n'était
   pas retenu, l'essai montrait un autre planning que celui qui serait écrit.
   Constaté le 05/10/2026 sur une campagne 2027 simulée : l'essai annonçait
   « aucune nuit ensemble » pour une paire à éviter, la vraie génération en
   aurait écrit deux.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le jeu d'essai provoque bien le cas : le premier planning n'est PAS
      retenu. Sans cela, le test passerait sans rien démontrer.
   2. L'essai annonce le numéro du planning retenu, et c'est celui de la vraie
      génération.
   3. Ses compteurs par médecin sont ceux du planning réellement écrit.
   4. L'essai n'écrit toujours rien : aucun onglet GARDES créé.
   5. CONTRE-ÉPREUVE : l'essai d'avant (premier planning seul) donne des
      compteurs différents de ceux du planning écrit.

   Campagne entièrement fictive, tirée d'une graine fixe — le dépôt est public. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

// Campagne fictive : été, hiver, Noël pour certains, 14 indispos chacun — graine 1.
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const iso = d => d.toISOString().slice(0, 10);
function campagne(seed) {
  const R = rng(seed), roster = H.defaultRoster(), m = {};
  roster.forEach(([id, p, q, f]) => {
    if (f.noGarde) return; const x = m[id] = {};
    const sem = (sam, n) => { for (let k = 0; k < 7 * n; k++) { const d = new Date(sam); d.setUTCDate(d.getUTCDate() + k); x[iso(d)] = 'VAC'; } };
    sem(Date.UTC(2027, 6, 3 + 7 * Math.floor(R() * 6)), 2 + Math.floor(R() * 2));
    sem(Date.UTC(2027, 1, 20 + 7 * Math.floor(R() * 2)), 1);
    if (R() < 0.6) sem(Date.UTC(2027, 11, 18 + 7 * Math.floor(R() * 2)), 1);
    for (let i = 0; i < 14; i++) { const s = iso(new Date(Date.UTC(2027, 0, 4 + Math.floor(R() * 360)))); if (!x[s]) x[s] = 'INDISPO'; }
  });
  return { roster, m };
}
const { roster, m } = campagne(1);
function monde(genSource) {
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, m)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR'], ['INDISPOS_ACTIVE', String(YEAR)]]),
  ]);
  const logs = [];
  return { ss, logs, ctx: H.buildContext(ss, logs, genSource) };
}
// Totaux de gardes par médecin lus dans la section « PAR MÉDECIN » du rapport
function totauxRapport(txt) {
  const sec = String(txt).split('── PAR MÉDECIN')[1] || '';
  const out = {};
  sec.split('\n').slice(2).some(l => { const x = l.match(/^\s{3}(\S+)\s+(\d+) \(/); if (!x) return /──/.test(l); out[x[1]] = +x[2]; });
  return out;
}

console.log('\n═══ 0. Le correctif est dans le code ═══');
V('l\'essai fait le même choix que la vraie génération', /const _t = NOUVEL_ALGO_GLOBAL \? choisirMeilleurTirage\(an\) : 1;/.test(SRC));

console.log('\n═══ 1. Le jeu d\'essai provoque bien le cas ═══');
const choix = monde();
const T = choix.ctx.choisirMeilleurTirage(YEAR);
V('le premier planning n\'est PAS celui retenu', T > 1, T);

console.log('\n═══ 2. Vraie génération ═══');
const vrai = monde();
let err = null; try { vrai.ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
V('génération sans erreur', !err, err);
const P = A.parsePlanning(vrai.ss, YEAR);
const reel = {};
Object.keys(P.byDoc).forEach(id => { reel[id] = Object.values(P.byDoc[id]).filter(v => v === 'G' || v === 'G2').length; });

console.log('\n═══ 3. Calcul à blanc ═══');
const blanc = monde();
const txt = blanc.ctx.essaiGenerationGardes(YEAR);
V('aucun onglet GARDES créé', !blanc.ss.getSheetByName(`GARDES_${YEAR}`));
V('le rapport annonce le planning retenu, celui de la vraie génération',
  new RegExp('Planning retenu : n° ' + T + ' ').test(txt), (String(txt).match(/Planning retenu.*/) || [''])[0]);
V('le rapport donne la durée totale', /Durée : [\d.]+ s au total/.test(txt));
const tot = totauxRapport(txt);
const ids = Object.keys(tot);
V('le rapport liste les médecins de garde', ids.length >= 15, ids.length);
const ecarts = ids.filter(id => tot[id] !== reel[id]);
V('ses compteurs sont ceux du planning réellement écrit, médecin par médecin', ecarts.length === 0,
  ecarts.map(id => [id, tot[id], reel[id]]));

const section = t => (String(t).split('── PAR MÉDECIN')[1] || '').split('\n\n')[0];
V('deux essais successifs rendent le même tableau, toutes catégories (calcul reproductible)',
  section(txt) === section(monde().ctx.essaiGenerationGardes(YEAR)));
V('la vraie génération a bien écrit ce planning-là', vrai.logs.some(l => l === 'Multi-départ : tirage ' + T + ' retenu'),
  vrai.logs.filter(l => /Multi-départ/.test(l)));

console.log('\n═══ 4. Contre-épreuve : l\'essai d\'avant montrait un autre planning ═══');
const a = 'const _t = NOUVEL_ALGO_GLOBAL ? choisirMeilleurTirage(an) : 1;';
V('la copie sans correctif est bien différente', SRC.indexOf(a) > 0);
const avant = monde(SRC.replace(a, 'const _t = 1;'));
const txtAv = avant.ctx.essaiGenerationGardes(YEAR);
V('sans le correctif, le tableau par médecin n\'est PAS celui du planning écrit', section(txtAv) !== section(txt));
const pire = t => Math.max(...(String(t).split('── ÉQUITÉ')[1] || '').split('── PAR')[0].match(/\d+\.\d+/g).map(Number));
V('…et son pire écart d\'équité est plus mauvais', pire(txtAv) > pire(txt), [pire(txtAv), pire(txt)]);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
