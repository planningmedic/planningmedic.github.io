/* ═══ BANC — JEUDI FÉRIÉ : FÉRIÉ SEULEMENT, PAS UN JEUDI (15/11/2026) ═══
   POURQUOI CE SCÉNARIO EXISTE. Vu le 15/11/2026 sur les gardes 2027, avant tout
   échange : la vue « Instantané » montrait « +1 jeu » et « +2 jeu » là où la vue
   « Initiale » était verte. Le générateur compte un jeudi férié (Ascension,
   Fête-Dieu) comme férié seulement ; l'instantané le comptait aussi comme
   jeudi.
   CE QUE CES VÉRIFICATIONS TIENNENT. Sur une vraie génération, sans échange,
   l'instantané rend pour chaque MAR exactement les compteurs de l'onglet de
   statistiques (total, jours de la semaine, fériés, veilles). Puis un jeudi
   férié donné à un MAR : +1 férié, +0 jeudi.
   Contre-preuve : le code d'avant (commit a3b280e) comptait le jeudi férié en
   jeudi. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const RACINE = path.join(__dirname, '..');
const AVANT = 'a3b280e';
const avant = f => { try { return execSync('git show ' + AVANT + ':' + f, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const H = require(path.join(RACINE, 'simulateur', 'harness.js'));

console.log('\n─── 1. Sans échange, l\'instantané = la répartition initiale ───');
const { ss, error, ctx } = H.runScenario({ year: 2027 });
V('génération sans erreur', !error, error);
ctx.Session = { getScriptTimeZone: () => 'Europe/Paris' };
ctx.Utilities = { formatDate: x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') };
const st = ss.getSheetByName('STATS_GARDES_2027')._rows;
const S = {}; st.slice(1).forEach(r => { if (r[0]) S[String(r[0]).trim()] = r; });
const live = ctx.computeStatsLive(2027), L = {}; live.forEach(x => { L[x.medecin] = x; });
const COLS = { total: 2, lun: 5, mar: 6, mer: 7, jeu: 8, ven: 9, sat: 10, dim: 11, jf: 14, vjf: 15 };
const ecarts = [];
Object.keys(S).forEach(id => { if (!L[id]) return; Object.keys(COLS).forEach(k => { if (+L[id][k] !== +S[id][COLS[k]]) ecarts.push([id, k, L[id][k], S[id][COLS[k]]]); }); });
V('chaque MAR, chaque compteur : instantané = onglet de statistiques', ecarts.length === 0, ecarts.slice(0, 8));

const g = ss.getSheetByName('GARDES_2027')._rows, NC = g[2].length;
const debut = new Date(2027, 0, 4, 12), dateCol = k => { const x = new Date(debut); x.setDate(x.getDate() + k - 1); return x; };
const iso = x => ctx.Utilities.formatDate(x);
const F = ctx.getJoursFeries(2027);
let tenus = 0; for (let r = 3; r < g.length; r++) for (let k = 1; k < NC; k++) { const x = dateCol(k); if (x.getDay() === 4 && F.has(iso(x)) && /^G2?$/.test(g[r][k])) tenus++; }
V('la génération place des gardes sur des jeudis fériés (le cas est bien joué)', tenus > 0, tenus);

console.log('\n─── 2. Un jeudi férié donné ───');
let cp = null;
for (let k = 1; k < NC && !cp; k++) { const x = dateCol(k); if (x.getDay() !== 4 || !F.has(iso(x))) continue;
  for (let r = 3; r < g.length && !cp; r++) if (/^G2?$/.test(g[r][k])) for (let r2 = 3; r2 < g.length; r2++) if (r2 !== r && g[r2][0] && L[g[r2][0]] && !g[r2][k]) { cp = { r, r2, k }; break; } }
V('un jeudi férié à céder existe', !!cp);
if (cp) {
  const A = g[cp.r][0], B = g[cp.r2][0];
  g[cp.r2][cp.k] = g[cp.r][cp.k]; g[cp.r][cp.k] = '';
  const L2 = {}; ctx.computeStatsLive(2027).forEach(x => { L2[x.medecin] = x; });
  V('receveur : férié +1, jeudi +0, total +1', L2[B].jf === L[B].jf + 1 && L2[B].jeu === L[B].jeu && L2[B].total === L[B].total + 1, [L[B], L2[B]].map(x => [x.total, x.jeu, x.jf]));
  V('donneur : férié −1, jeudi +0, total −1', L2[A].jf === L[A].jf - 1 && L2[A].jeu === L[A].jeu && L2[A].total === L[A].total - 1, [L[A], L2[A]].map(x => [x.total, x.jeu, x.jf]));
  const AV = avant('gas/code.gs');
  if (AV) {
    const c2 = { console, Logger: { log() {} }, Session: ctx.Session, Utilities: ctx.Utilities,
      SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => { throw new Error('x'); } } };
    c2.globalThis = c2; vm.createContext(c2); vm.runInContext(AV, c2);
    const L3 = {}; c2.computeStatsLive(2027).forEach(x => { L3[x.medecin] = x; });
    V('AVANT : le jeudi férié comptait aussi en jeudi', L3[B].jeu > L2[B].jeu, [L3[B].jeu, L2[B].jeu]);
  }
  g[cp.r][cp.k] = g[cp.r2][cp.k]; g[cp.r2][cp.k] = '';
}

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
