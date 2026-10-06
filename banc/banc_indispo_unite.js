/* ═══ BANC — INDISPONIBILITÉS : UNITÉS DE GARDE ET QUOTA EN WEEK-ENDS (05/10/2026) ═══
   La garde de week-end est assurée d'un bloc, vendredi + dimanche, par le même
   binôme. Avant, une indisponibilité posée le vendredi seul sortait son auteur
   du week-end entier sans le compter comme tel, et bloquer un VSD consommait
   3 des 8 jours de week-end : deux week-ends par an.
   Règle désormais, éprouvée ici sur le VRAI applyTool d'indispos.html :
   1. l'outil Indispo couple les jours comme les souhaits (même fonction) :
      vendredi ⇄ dimanche, jeudi férié ⇄ samedi suivant, samedi ⇄ lundi férié ;
   2. 40 jours (30 jusqu'au 06/10/2026), dont 5 week-ends ; un week-end est compté une fois (par son
      samedi), compléter un week-end déjà touché ne consomme rien de plus ;
   3. le contrôle porte sur l'unité ENTIÈRE : tout ou rien ;
   4. effacer un jour couplé retire l'unité.
   Mesure (simulateur, vrai générateur, 3 tirages) : 5 week-ends VSD tiennent
   même quand tous visent les mêmes 12 week-ends ; 6 cassent dans 2 cas sur 3. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const PAGE = path.join(__dirname, '..', 'indispos.html');
function extraireDuHtml(nom) {
  const src = fs.readFileSync(PAGE, 'utf8');
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable');
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, j + 1);
}
function ecran(ind, outil, quotas) {
  const ctx = vm.createContext({ Date, String, Object, Number, Math, Set, console, setTimeout: () => {},
    window: {}, indispos: ind || {}, currentTool: outil || 'INDISPO', isDragging: false,
    joursFeries: new Set(['2027-05-06', '2027-05-17']),   // Ascension (jeudi), lundi de Pentecôte
    vacConfig: Object.assign({ quotaIndispo: 40, quotaIndispoWe: 5 }, quotas || {}), messages: [], aides: [],
    showToast: m => ctx.messages.push(m), renderMonth: () => {}, updateStats: () => {},
    document: { getElementById: () => null } });
  ctx.globalThis = ctx; ctx.YEAR = 2027;
  ['premierJourAnneePlanning', 'bornesAnneePlanning', 'cleWeIndispo', 'applyTool'].forEach(n => vm.runInContext(extraireDuHtml(n), ctx));
  vm.runInContext('function majBoutonSave(){}', ctx);
  vm.runInContext('function hintRefus(m){ aides.push(m); }', ctx);
  ctx.clic = d => vm.runInContext(`applyTool('${d}')`, ctx);
  return ctx;
}
const ind = c => Object.keys(c.indispos).filter(d => c.indispos[d] === 'INDISPO').sort();

console.log('\n═══ 1. Les jours vont par unité de garde ═══');
{ const c = ecran(); c.clic('2027-01-08');
  V('vendredi → le dimanche se coche aussi, pas le samedi', JSON.stringify(ind(c)) === '["2027-01-08","2027-01-10"]', ind(c));
  V('le MAR en est prévenu', c.messages.some(m => /vont ensemble/.test(m)), c.messages); }
{ const c = ecran(); c.clic('2027-01-24');
  V('dimanche → le vendredi se coche aussi', JSON.stringify(ind(c)) === '["2027-01-22","2027-01-24"]', ind(c)); }
{ const c = ecran(); c.clic('2027-01-16');
  V('un samedi ordinaire se pose seul', JSON.stringify(ind(c)) === '["2027-01-16"]', ind(c)); }
{ const c = ecran(); c.clic('2027-05-06');
  V('jeudi férié → le samedi suivant vient avec', JSON.stringify(ind(c)) === '["2027-05-06","2027-05-08"]', ind(c)); }
{ const c = ecran(); c.clic('2027-05-17');
  V('lundi férié → le samedi d\'avant vient avec', JSON.stringify(ind(c)) === '["2027-05-15","2027-05-17"]', ind(c)); }
{ const c = ecran(); c.clic('2027-01-12');
  V('un mardi ordinaire se pose seul', JSON.stringify(ind(c)) === '["2027-01-12"]', ind(c)); }
{ const c = ecran({ '2027-01-10': 'VAC' }); c.clic('2027-01-08');
  V('dimanche en congé : le vendredi se pose seul, le congé reste', c.indispos['2027-01-08'] === 'INDISPO' && c.indispos['2027-01-10'] === 'VAC', c.indispos); }
{ const c = ecran({ '2027-01-10': 'SOUHAIT' }); c.clic('2027-01-08');
  V('un souhait sur le dimanche est remplacé par l\'indispo', c.indispos['2027-01-10'] === 'INDISPO', c.indispos); }

console.log('\n═══ 2. Effacer retire l\'unité ═══');
{ const c = ecran({ '2027-01-08': 'INDISPO', '2027-01-10': 'INDISPO', '2027-01-09': 'INDISPO' }, 'ERASE'); c.clic('2027-01-10');
  V('effacer le dimanche retire aussi le vendredi', !c.indispos['2027-01-08'] && !c.indispos['2027-01-10'], c.indispos);
  V('le samedi posé à part reste', c.indispos['2027-01-09'] === 'INDISPO', c.indispos); }
{ const c = ecran({ '2027-01-12': 'INDISPO' }, 'ERASE'); c.clic('2027-01-12');
  V('effacer un jour seul marche toujours', !c.indispos['2027-01-12'], c.indispos); }

console.log('\n═══ 3. Quota week-end : 5 week-ends, comptés une fois ═══');
const samedis = n => { const o = {}; for (let k = 0; k < n; k++) { const d = new Date(Date.UTC(2027, 0, 9 + 7 * k)); o[d.toISOString().slice(0, 10)] = 'INDISPO'; } return o; };
{ const c = ecran(); ['2027-01-08', '2027-01-09'].forEach(c.clic);
  V('un VSD complet = 3 jours', ind(c).length === 3, ind(c)); }
{ const c = ecran(samedis(5)); c.clic('2027-03-12');
  V('5 week-ends touchés : un vendredi d\'un week-end NOUVEAU est refusé', !c.indispos['2027-03-12'] && !c.indispos['2027-03-14'], c.indispos);
  V('refus expliqué en week-ends', c.aides.some(m => /5 week-ends/.test(m)), c.aides); }
{ const c = ecran(samedis(5)); c.clic('2027-01-10');
  V('5 week-ends touchés : compléter un week-end déjà touché passe (V + D)', c.indispos['2027-01-08'] === 'INDISPO' && c.indispos['2027-01-10'] === 'INDISPO', c.indispos); }
{ const c = ecran(samedis(4)); c.clic('2027-03-12');
  V('4 touchés : le 5e (vendredi + dimanche) passe', c.indispos['2027-03-12'] === 'INDISPO' && c.indispos['2027-03-14'] === 'INDISPO', c.indispos); }
{ const c = ecran(samedis(5)); c.clic('2027-03-11');
  V('le quota week-end ne bloque pas les jours de semaine', c.indispos['2027-03-11'] === 'INDISPO', c.indispos); }

console.log('\n═══ 4. Quota de 40 jours : l\'unité passe entière ou pas du tout ═══');
const semaine = n => { const o = {}; let k = 0; const d = new Date(Date.UTC(2027, 1, 1));
  while (Object.keys(o).length < n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + k++); const w = x.getUTCDay();
    if (w >= 1 && w <= 4 && x.toISOString().slice(0, 10) !== '2027-05-06' && x.toISOString().slice(0, 10) !== '2027-05-17') o[x.toISOString().slice(0, 10)] = 'INDISPO'; }
  return o; };
{ const c = ecran(semaine(39)); c.clic('2027-01-08');
  V('39 posés : vendredi + dimanche (2 jours) refusés, rien de posé', !c.indispos['2027-01-08'] && !c.indispos['2027-01-10'], c.indispos);
  V('le refus dit combien il en faut et combien il en reste', c.aides.some(m => /il en faut 2, il vous en reste 1/.test(m)), c.aides); }
{ const c = ecran(semaine(39)); c.clic('2027-01-09');
  V('39 posés : un samedi seul passe (40)', c.indispos['2027-01-09'] === 'INDISPO' && ind(c).length === 40, ind(c).length); }
{ const c = ecran(semaine(40)); c.clic('2027-01-12');
  V('40 posés : plus rien', !c.indispos['2027-01-12'], ind(c).length); }

console.log('\n═══ 5. Une seule règle pour souhaits et indispos ═══');
{ const src = fs.readFileSync(PAGE, 'utf8');
  V('une seule fonction d\'unité dans la page', (src.match(/const _uniteGarde = /g) || []).length === 1 && !/_uniteSouhait/.test(src));
  V('l\'outil Souhait l\'utilise', /currentTool === 'SOUHAIT'[^\n]*\n\s*const u = _uniteGarde\(date\)/.test(src));
  V('l\'outil Indispo l\'utilise', /currentTool === 'INDISPO' && indispos\[date\] !== 'INDISPO'\) \{[\s\S]{0,120}_uniteGarde\(date\)/.test(src)); }
{ const c = ecran({}, 'SOUHAIT'); c.clic('2027-01-08');
  V('les souhaits couplent toujours vendredi + dimanche', c.indispos['2027-01-08'] === 'SOUHAIT' && c.indispos['2027-01-10'] === 'SOUHAIT', c.indispos); }

/* (06/10/2026) LE DÉCOMPTE VISIBLE. Le plafond n'apparaissait qu'au refus : le
   MAR ne voyait pas où il en était. Deux jauges, nourries par la MÊME clé de
   week-end que le refus au clic (cleWeIndispo) — on vérifie ici le vrai
   updateStats de la page, et que les deux comptent pareil. */
console.log('\n═══ 6. Le décompte est visible avant le refus ═══');
function barre(ind, quotas) {
  const ctx = vm.createContext({ Date, String, Object, Number, Math, Set, console,
    indispos: ind || {}, joursFeries: new Set(), html: '',
    vacConfig: quotas === null ? null : Object.assign({ quotaIndispo: 40, quotaIndispoWe: 5 }, quotas || {}) });
  ctx.document = { getElementById: id => (id === 'statsBar' ? { set innerHTML(v) { ctx.html = v; } } : null) };
  ['cleWeIndispo', 'updateStats'].forEach(n => vm.runInContext(extraireDuHtml(n), ctx));
  vm.runInContext('updateStats()', ctx);
  return ctx.html.replace(/\s+/g, ' ');
}
const jaugeVal = (h, nom) => { const m = h.match(new RegExp(nom + '</span> <span class="jauge-val"[^>]*>(\\d+)<span>([^<]*)</span>')); return m ? m[1] + m[2] : null; };
{ const ind = Object.assign(semaine(10), { '2027-03-05': 'INDISPO', '2027-03-06': 'INDISPO', '2027-03-07': 'INDISPO', '2027-04-10': 'INDISPO', '2027-04-02': 'SOUHAIT' });
  const h = barre(ind);
  V('jauge des jours : 14 / 40 (les souhaits n\'y entrent pas)', jaugeVal(h, 'Indisponibilités') === '14 / 40 jours', jaugeVal(h, 'Indisponibilités'));
  V('jauge des week-ends : un VSD + un samedi = 2 / 5', jaugeVal(h, 'Week-ends bloqués') === '2 / 5 week-ends', jaugeVal(h, 'Week-ends bloqués'));
  V('les gardes souhaitées restent un simple nombre', /compte-val">1<\/span><span class="compte-nom">gardes souhaitées/.test(h)); }
{ const h = barre(samedis(5));
  V('5 week-ends touchés : la jauge affiche 5 / 5', jaugeVal(h, 'Week-ends bloqués') === '5 / 5 week-ends', jaugeVal(h, 'Week-ends bloqués'));
  const c = ecran(samedis(5)); c.clic('2027-03-13');
  V('…et c\'est bien là que le clic refuse (même compte des deux côtés)', !c.indispos['2027-03-13'], c.indispos); }
{ const h = barre(semaine(3), null);
  V('quota pas encore reçu : pas de « / 0 » trompeur', jaugeVal(h, 'Indisponibilités') === '3 jours', jaugeVal(h, 'Indisponibilités')); }
{ const src = fs.readFileSync(PAGE, 'utf8');
  V('une seule clé de week-end dans la page', (src.match(/function cleWeIndispo\(/g) || []).length === 1 && /const _cleWe = cleWeIndispo;/.test(src)); }

console.log(`\n  ${ok} vérifications OK, ${ko} en échec`);
if (ko) process.exit(1);
