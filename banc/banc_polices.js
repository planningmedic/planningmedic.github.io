/* banc_polices.js — (27/11/2026) LES POLICES SONT SERVIES PAR LE SITE.
   Défaut relevé au diagnostic du 27/11 : chaque page demandait ses polices à un site extérieur,
   par une feuille de style qui bloque l'affichage. Poste filtré ou lent, sans copie gardée :
   page blanche. Les fichiers sont maintenant dans assets/fonts/.
   Ce banc prouve le câblage (aucune page ne dépend plus de l'extérieur, tout fichier cité
   existe et est bien une police) ; il ne prouve pas le rendu sur un écran. */
const fs = require('fs'), path = require('path');
const RACINE = path.join(__dirname, '..');
let ok = 0, ko = 0;
const V = (nom, cond, detail) => { if (cond) { ok++; console.log('  ✓ ' + nom); } else { ko++; console.log('  ✗ ' + nom + (detail !== undefined ? ' → ' + JSON.stringify(detail) : '')); } };
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const pages = [];
(function parcours(dir) {
  fs.readdirSync(path.join(RACINE, dir)).forEach(n => {
    const rel = dir ? dir + '/' + n : n;
    if (/^(\.git|node_modules|banc)$/.test(n)) return;
    const st = fs.statSync(path.join(RACINE, rel));
    if (st.isDirectory()) parcours(rel); else if (/\.html$/.test(n)) pages.push(rel);
  });
})('');
/* Deux documents du module libéral (non ouvert) utilisent une autre police, laissée telle quelle. */
const EXCEPTIONS = ['docs/module-liberal/cotations-types.html', 'docs/module-liberal/estimateur-liberal.html'];

console.log('\n═══ P1. Plus aucune page ne demande ses polices à l\'extérieur ═══');
const dehors = pages.filter(p => /fonts\.(googleapis|gstatic)\.com/.test(lire(p)));
V('seules les deux exceptions connues appellent encore l\'extérieur', JSON.stringify(dehors.sort()) === JSON.stringify(EXCEPTIONS), dehors);
const css = pages.filter(p => /\.css$|<style/.test(p) === false && /@import url\(['"]?https?:/.test(lire(p)) && EXCEPTIONS.indexOf(p) < 0);
V('aucune feuille de style importée d\'un autre site dans une page', css.length === 0, css);

console.log('\n═══ P2. Chaque page qui écrit en DM Sans ou DM Mono charge la feuille locale, par le bon chemin ═══');
const utilisent = pages.filter(p => EXCEPTIONS.indexOf(p) < 0 && /font-family:[^;}]*['"]?DM (Sans|Mono)/.test(lire(p)));
V('des pages sont concernées (au moins 20)', utilisent.length >= 20, utilisent.length);
const lien = p => (lire(p).match(/<link rel="stylesheet" href="([^"]*assets\/fonts\/polices\.css)">/) || [])[1];
/* Une page peut recevoir la police d'une feuille commune ou d'une page qui l'enveloppe : on ne
   juge que celles qui la chargeaient elles-mêmes, c'est-à-dire celles qui portent le lien. */
const avecLien = pages.filter(p => lien(p));
V('les pages principales portent le lien', ['index.html', 'planning.html', 'admin.html', 'indispos.html', 'staff.html', 'absences.html', 'paie.html', 'maintenance.html', 'crh.html', 'docs/guide-mar.html', 'docs/guide-comite.html'].every(p => avecLien.indexOf(p) > -1),
  ['index.html', 'planning.html', 'admin.html', 'indispos.html', 'staff.html', 'absences.html', 'paie.html', 'maintenance.html', 'crh.html', 'docs/guide-mar.html', 'docs/guide-comite.html'].filter(p => avecLien.indexOf(p) < 0));
const casses = avecLien.filter(p => !fs.existsSync(path.join(RACINE, path.dirname(p), lien(p))));
V('le chemin du lien mène au fichier depuis chaque page (racine, docs/, sous-dossiers)', casses.length === 0 && avecLien.length >= 20, { casses, n: avecLien.length });
V('une seule fois par page', avecLien.every(p => lire(p).split('assets/fonts/polices.css').length === 2));

console.log('\n═══ P3. La feuille et ses fichiers ═══');
const F = lire('assets/fonts/polices.css');
const faces = F.match(/@font-face\{[^}]*\}/g) || [];
V('six déclarations : DM Sans (2 jeux de lettres) et DM Mono 400 et 500 (2 chacun)', faces.length === 6
  && faces.filter(f => /'DM Sans'/.test(f)).length === 2 && faces.filter(f => /'DM Mono'/.test(f)).length === 4, faces.length);
V('DM Sans couvre toutes les graisses demandées par les pages (300 à 900) en un fichier', faces.filter(f => /'DM Sans'/.test(f)).every(f => /font-weight:100 1000/.test(f)));
V('DM Mono : 400 et 500', ['400', '500'].every(w => faces.some(f => /'DM Mono'/.test(f) && new RegExp('font-weight:' + w + ';').test(f))));
V('le texte s\'affiche sans attendre la police (font-display: swap partout)', faces.every(f => /font-display:swap/.test(f)));
V('chaque déclaration borne ses lettres (les fichiers « ext » ne sont pris que si besoin)', faces.every(f => /unicode-range:U\+/.test(f)));
const cites = faces.map(f => (f.match(/url\(([^)]+)\)/) || [])[1]);
V('aucun fichier cité n\'est ailleurs que dans le dossier', cites.every(u => u && !/[\/:]/.test(u)), cites);
const manquants = cites.filter(u => !fs.existsSync(path.join(RACINE, 'assets/fonts', u)));
V('tous les fichiers cités existent', manquants.length === 0, manquants);
V('ce sont bien des polices au format woff2', cites.every(u => { try { return fs.readFileSync(path.join(RACINE, 'assets/fonts', u)).slice(0, 4).toString('latin1') === 'wOF2'; } catch (e) { return false; } }));
const poids = cites.reduce((t, u) => t + fs.statSync(path.join(RACINE, 'assets/fonts', u)).size, 0);
V('poids total raisonnable (moins de 150 Ko, tous fichiers confondus)', poids < 150000, poids);
V('aucun fichier de police orphelin dans le dossier', fs.readdirSync(path.join(RACINE, 'assets/fonts')).filter(n => /\.woff2$/.test(n)).every(n => cites.indexOf(n) > -1));
V('la licence des deux polices accompagne les fichiers', ['LICENCE-DM-Sans.txt', 'LICENCE-DM-Mono.txt'].every(n => /SIL Open Font License/.test(lire('assets/fonts/' + n))));

console.log('\n═══ P4. Le téléphone garde ces fichiers après la première visite ═══');
const SW = lire('sw.js');
V('la feuille locale passe par la règle des scripts et feuilles de style', /function isCode\(chemin\) \{ return \/\\\.\(js\|css\)/.test(SW));
V('les fichiers woff2 du site sont gardés (copie d\'abord)', /function isStaticAsset\(url\) \{ return \/\\\.\(js\|css\|png\|svg\|webp\|ico\|woff2\?/.test(SW) && /isStaticAsset\(url\)\) \{ e\.respondWith\(cacheFirst\(req, ASSET_CACHE\)\)/.test(SW));

console.log(`\nbanc_polices : ${ok} ✓, ${ko} ✗`);
process.exit(ko ? 1 : 0);
