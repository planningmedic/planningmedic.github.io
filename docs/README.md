# Planning-Med — carte du dépôt

Système web de gestion pour le service d'anesthésie-réanimation du **un service hospitalier** : planning des gardes (équité annuelle), planning quotidien, consultations, contrôle d'absence, portail/Dashboard, veille bibliographique, comptes rendus, et le **module libéral (en service)**. ~23 MARs.

**Le dépôt (branche `main`) est la seule source de vérité.** Tout — code, pages, documents de travail et de conception — vit ici et se lit/s'édite directement.

---

## Où vit quoi

### Racine — l'application (servie par GitHub Pages, ne pas déplacer)
| Fichier | Rôle |
|---|---|
| `index.html` | **Portail** personnel du MAR — le seul carrefour : toutes les autres pages s'ouvrent depuis ses tuiles |
| `admin.html` | Interface **comité** (PC) : planning, équipe, affectations, équité, statuts, maintenance |
| `planning.html` | **Planning** de l'équipe (vue MAR) |
| `indispos.html` | Saisie des **indisponibilités** et souhaits de garde |
| `absences.html` | **Consultations à venir** — contrôle d'absence (deux portes : tuile MAR et session secrétariat) |
| `staff.html` | **Staff Vacances** : pose des vacances et formations en réunion (groupes A/B/C) |
| `suivi-liberal.html` | **Suivi des 30 %** — position de chacun par axe, à partir du relevé mensuel |
| `crh.html` | Générateur de **comptes rendus de réanimation** (accès nominatif restreint) |
| `sw.js`, `manifest.webmanifest`, `assets/` | PWA (service worker, icônes) |

### docs/ — documentation & documents de travail
| Fichier | Rôle |
|---|---|
| `CONTEXTE-Planning-Med.md` | Contexte, architecture, conventions — **à lire en premier** |
| `roadmap.html` | **Roadmap de pilotage** — vue courte et lisible : échéancier, chantiers en cours, règles à ne jamais casser |
| `ROADMAP-Planning-Med.md` | Fait / à faire / écarté — la mémoire longue, historique détaillé |
| `guide-technique.html` | **La référence interne** : architecture, wizards, déploiement, sécurité, dépannage |
| `guide-fichier-maitre.html` | Les 25 onglets du classeur, colonne par colonne |
| `guide-comite.html` | Aide du comité (page `admin.html`) |
| `guide-mar.html` | Guide du MAR : portail, planning, indispos, consultations |
| `guide-liberal.html` | Mode d'emploi de l'**outil** du module libéral |
| `si-ca-tombe.html` | **Urgence, pour le comité** : l'interface ne répond plus, faire tourner le service sans elle |
| `reprise.html` | **Continuité** : accès, propriété, sauvegardes, réparations — à lire si Arthur n'est plus joignable |
| `sauvegarde-compte-perso.md` | Installation de la sauvegarde hors-compte (dimanche 5 h) |
| `VEILLE_CFG-mode-emploi.md` | Pilotage de la veille biblio (onglet `VEILLE_CFG`) |
| `presentation-staff.html` | Deck de présentation du système au service |
| `staff_gardes_demographie.html` | Simulation démographique de la charge de gardes (2026-2050) |
| `maquette-export-excel-secteurs.xlsx` | Maquette de l'export Excel par grand secteur (nouvel établissement) |
| `module-liberal/` | Le **module libéral** (voir ci-dessous) |

#### docs/module-liberal/
| Fichier | Rôle |
|---|---|
| `estimateur-liberal.html` | ⚠️ **Outil de production** malgré son nom : cotation, devis, déclaration d'intervention. C'est la cible de la tuile Libéral du Dashboard. |
| `guide_liberal_MAR.html` | Guide **métier** : comment fonctionne l'activité libérale (cartes, dépassements, règle des 30 %) |
| `module_liberal_conception.md` | Document de conception (règle des 30 % par axe, lots) |
| 
| `ccam_actes.json` | Index CCAM (v84) : libellés officiels et tarifs d'anesthésie, activité 4 |
| `tests/` | Tests JS du module |

### gas/ — backend Google Apps Script
`code.gs`, `Indispos.gs`, `generateur_gardes.gs`, `setup_annee.gs`, `portail.gs`, `miroir.gs`, `journal.gs`, `veille.gs` + `appsscript.json`. **Deux fichiers de l'éditeur vivent ailleurs** : `sauvegarde.gs` (racine du dépôt) et `dispo_jour.gs` (= `partage/dispo_jour.js`). Soit **11 fichiers** dans l'éditeur — carte détaillée dans `gas/README.md`.
**Le dépôt fait foi à 100 %** : toute modif d'un `.gs` doit exister ici, puis être recopiée dans l'éditeur Apps Script **et redéployée** (sinon perdue à la prochaine recopie, ou sans effet).
⚠️ `portail.gs` porte le portail, **tout le module libéral**, la veille et la configuration des secteurs. `Indispos.gs` porte le routeur d'API, le contrôle d'absence et le verrou d'écriture.

### simulateur/ — banc d'essai de l'algorithme de gardes
Scripts Node (scénarios, harness, analyses) + expériences. Campagne de référence : **400 années simulées** (20 scénarios × 20 ans).

---

## Architecture (rappel)
Google Sheets (données) → fichiers GAS (`/exec`) → sortie web. Les JSON publiés (`planning_{Y}.json`, `affectations_{Y}.json`) sont servis depuis un dossier Google Drive privé « Planning-Med-JSON », **jamais** depuis GitHub Pages : aucune donnée de planning ne touche le dépôt public.
