/* ═══ BANC D'ESSAI — services Google et Cloudflare simulés ═══
   But : exécuter les VRAIES fonctions des fichiers .gs, en isolant chacune
   par extraction de son source (accolades appariées), dans un bac à sable où
   SpreadsheetApp, PropertiesService, LockService, ScriptApp et UrlFetchApp
   sont remplacés par des doublures fidèles aux comportements qui comptent :
   - une feuille = tableau de lignes ; deleteRow décale bien les suivantes ;
   - LockService distingue script/document (le défaut trouvé ce matin) ;
   - ScriptApp compte les déclencheurs créés/supprimés ;
   - UrlFetchApp parle au Worker (port synchrone, comparé au vrai fichier). */
const fs = require('fs');

// ── Feuille de calcul ────────────────────────────────────────────────
class Sheet {
  constructor(nom, lignes) { this.nom = nom; this.lignes = lignes.map(l => l.slice()); }
  getName() { return this.nom; }
  getLastRow() { return this.lignes.length; }
  getDataRange() { const s = this; return { getValues: () => s.lignes.map(l => l.slice()) }; }
  getRange(r, c, nr, nc) {
    const s = this;
    return {
      setValue(v) { _surEcriture(); while (s.lignes.length < r) s.lignes.push([]); s.lignes[r-1][c-1] = _coerceSheets(v); return this; },
      setValues(vals) { _surEcriture(); vals.forEach((ligne, i) => { while (s.lignes.length < r+i) s.lignes.push([]); ligne.forEach((v,j) => s.lignes[r-1+i][c-1+j] = _coerceSheets(v)); }); return this; },
      setNumberFormat() { return this; },   // le format texte du vrai Sheets empêche la coercition ; la doublure reste au PIRE cas : le code doit résister même sans lui
      setFontWeight() { return this; },
      getValues() { const out = []; for (let i=0;i<(nr||1);i++) out.push((s.lignes[r-1+i]||[]).slice(c-1, c-1+(nc||1))); return out; },
      getValue() { return (s.lignes[r-1]||[])[c-1]; },
      clearContent() { _surEcriture(); for (let i=0;i<(nr||1);i++) for (let j=0;j<(nc||1);j++) if (s.lignes[r-1+i]) s.lignes[r-1+i][c-1+j] = ''; return this; },
    };
  }
  deleteRow(n) { _surEcriture(); this.lignes.splice(n-1, 1); }
  /* (29/08/2026) deleteRows MANQUAIT à la doublure alors que le vrai code
     l'appelle en 4 endroits (LOGS, CONNEXIONS, deux remises à zéro). Toute
     fonction passant par ce chemin échouait donc silencieusement au banc :
     la purge n'avait jamais été exercée une seule fois. */
  deleteRows(n, combien) { _surEcriture(); this.lignes.splice(n-1, combien); }
  setFrozenRows() {}
  appendRow(l) { _surEcriture(); this.lignes.push(l.map(_coerceSheets)); }
  setColumnWidth() {}
  getLastColumn() { return Math.max(...this.lignes.map(l => l.length), 0); }
}
/* (14/08/2026 — défaut trouvé au premier test réel) Le VRAI Sheets transforme
   un texte « 2027-09-03 » ou un horodatage ISO en objet Date à l'écriture.
   La doublure était trop polie et rendait les textes tels quels : le banc ne
   pouvait pas voir le défaut. Elle coerce désormais comme le vrai — et
   VOLONTAIREMENT sans tenir compte du format texte (pire cas permanent). */
/* (14/08/2026 — défaut trouvé au deuxième test réel) Dans le vrai Apps
   Script, une relecture faite APRÈS des écritures de la même exécution peut
   être servie d'AVANT elles tant que SpreadsheetApp.flush() n'a pas été
   appelé : la poussée au relais partait avec l'ancien état. Chaque écriture
   passe par ce point d'observation ; un scénario peut s'y brancher pour
   vérifier qu'aucune poussée ne part avec des écritures non validées. */
let _observateurEcriture = null;
function brancherSurEcriture(f) { _observateurEcriture = f; }
function _surEcriture() { if (_observateurEcriture) _observateurEcriture(); }

function _coerceSheets(v) {
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(v)) return new Date(v);
    /* (17/08/2026 — défaut trouvé en production, invisible au banc) Le vrai
       Sheets transforme AUSSI « 2026-07 » (un mois sans jour) en date, au
       1er du mois. La doublure rendait ce texte tel quel : le relevé libéral
       paraissait sain ici alors qu'il ne l'était pas dans le classeur. */
    if (/^\d{4}-\d{2}$/.test(v)) return new Date(v + '-01T00:00:00');
  }
  return v;
}

class Classeur {
  constructor() { this.feuilles = {}; }
  ajouter(nom, lignes) { this.feuilles[nom] = new Sheet(nom, lignes); return this.feuilles[nom]; }
  getSheetByName(n) { return this.feuilles[n] || null; }
  insertSheet(n) { return this.ajouter(n, []); }
  getSpreadsheetTimeZone() { return 'Europe/Paris'; }
  getSheets() { return Object.values(this.feuilles); }
}

// ── Verrous : script ≠ document (le défaut du 05/08) ─────────────────
const VERROUS = { script: false, document: false, user: false };
const journalVerrous = [];
function fabriqueVerrou(type) {
  return {
    waitLock(ms) {
      journalVerrous.push({ type, action: 'waitLock', deja: VERROUS[type] });
      if (VERROUS[type]) throw new Error(`verrou ${type} indisponible (attente ${ms} ms épuisée)`);
      VERROUS[type] = true; return true;
    },
    tryLock(ms) {
      journalVerrous.push({ type, action: 'tryLock', deja: VERROUS[type] });
      if (VERROUS[type]) return false;
      VERROUS[type] = true; return true;
    },
    releaseLock() { VERROUS[type] = false; },
  };
}

// ── Extraction d'une fonction réelle depuis un .gs ───────────────────
function extraireFonction(fichier, nom) {
  const src = fs.readFileSync(fichier, 'utf8');
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(`${nom} introuvable dans ${fichier}`);
  let prof = 0, debutCorps = src.indexOf('{', i), j = debutCorps;
  for (; j < src.length; j++) {
    if (src[j] === '{') prof++;
    else if (src[j] === '}') { prof--; if (prof === 0) break; }
  }
  return src.slice(i, j + 1);
}

module.exports = { Sheet, Classeur, fabriqueVerrou, VERROUS, journalVerrous, extraireFonction, brancherSurEcriture };
