# Onglet `VEILLE_CFG` — mode d'emploi

Cet onglet pilote **toute** la veille. Tu édites des cellules, tu relances `runVeille()`, et c'est appliqué. Aucun code à toucher.

---

## 1. Les 4 colonnes

| Colonne | Rôle |
|---|---|
| **TYPE** | La catégorie de la ligne : `REVUE`, `GENERAL`, `THEME`, `PUBTYPE` ou `PARAM` (voir §2). |
| **CLE** | Le libellé lisible (ex. « Sepsis »). Pour un `PARAM`, c'est le nom du réglage (ex. `JOURS`). |
| **VALEUR** | Le terme technique compris par PubMed (ex. `Anesthesiology`, `"sepsis"[MeSH Terms]`). Pour un `PARAM`, la valeur (ex. `30`). |
| **ACTIF** | `O` = la ligne compte · `N` = ignorée (désactivée sans la supprimer). Pour un `PARAM`, laisse `O`. |

> Pour **désactiver** une revue ou un thème sans le perdre : mets `N` dans ACTIF. Pour le réactiver : remets `O`.

---

## 2. Les 5 types de ligne

| TYPE | Ce qu'il fait |
|---|---|
| **REVUE** | Une revue « cœur » d'anesthésie-réa. On récupère **tout le solide** qu'elle publie. |
| **GENERAL** | Une revue généraliste (NEJM, JAMA…). On ne récupère ses articles **que s'ils touchent un de tes THÈMES** — sinon tu aurais tout le NEJM. |
| **THEME** | Un sujet. On récupère les articles sur ce sujet **dans toutes les revues**. |
| **PUBTYPE** | Un type d'article à **garder** (essai randomisé, méta-analyse…). C'est le filtre principal qui fait chuter le volume. |
| **PARAM** | Un réglage global (fenêtre en jours, langues, humains…). |

**Le filtrage combine tout** : `(REVUES + GÉNÉRALISTES×thèmes + THÈMES)` **puis** on ne garde que les `PUBTYPE` actifs, en `HUMANS` et dans les `LANGS` choisies.

---

## 3. Recettes courantes

### Ajouter une revue cœur
Nouvelle ligne → `REVUE` · libellé · **abréviation PubMed du journal** · `O`.
Exemple : `REVUE | Resuscitation | Resuscitation | O`

### Ajouter une revue généraliste (type NEJM)
Nouvelle ligne → `GENERAL` · libellé · abréviation PubMed · `O`.
Exemple : `GENERAL | Nature Medicine | Nat Med | O`
→ elle ne remontera que sur tes thèmes (sepsis, SDRA, etc.).

### Suivre un nouveau sujet
Nouvelle ligne → `THEME` · libellé · **requête PubMed** · `O`.
Exemple : `THEME | ECMO | "extracorporeal membrane oxygenation"[MeSH Terms] | O`

### Élargir / resserrer le volume
- **Plus d'articles** : active la ligne `PUBTYPE | Revue / mise au point` (passe-la à `O`), ou ajoute des thèmes.
- **Moins d'articles** : baisse `JOURS`, ou désactive un thème trop bruyant, ou retire un `PUBTYPE`.

---

## 4. Les réglages `PARAM`

| CLE | Valeur | Effet |
|---|---|---|
| `JOURS` | `30` | Fenêtre de recherche (jours en arrière). `15` = deux fois moins d'articles. |
| `HUMANS` | `O` | `O` = études humaines seulement (recommandé). `N` = inclut l'animal. |
| `LANGS` | `eng,fre` | Langues gardées (codes PubMed, séparés par virgule). Vide = toutes langues. |
| `ENRICH` | `N` | Résumé + score IA. Reste `N` tant que pas de clé API Anthropic. |
| `ENRICH_MAX` | `60` | Plafond d'articles passés à l'IA par scan (protection budget). |
| `MODEL` | `claude-haiku-4-5` | Modèle utilisé si `ENRICH=O`. Ne pas toucher pour l'instant. |

---

## 5. Les types d'article `PUBTYPE` (le filtre qui compte)

Un article n'est gardé que si son type figure ici en `ACTIF=O`.

| CLE | VALEUR (terme PubMed) | Par défaut |
|---|---|---|
| Essai randomisé | `Randomized Controlled Trial` | O |
| Méta-analyse | `Meta-Analysis` | O |
| Revue systématique | `Systematic Review` | O |
| Recommandations | `Practice Guideline` | O |
| Recommandations (guide) | `Guideline` | O |
| Revue / mise au point | `Review` | **N** |

Tu peux en **ajouter** (nouvelle ligne `PUBTYPE`), avec le nom exact PubMed, par exemple :
`Observational Study`, `Multicenter Study`, `Clinical Trial`, `Comparative Study`, `Validation Study`.

---

## 6. Trouver les bonnes VALEURS

### Abréviation d'un journal (pour REVUE / GENERAL)
Le plus simple : va sur **pubmed.ncbi.nlm.nih.gov**, ouvre n'importe quel article de la revue → l'abréviation officielle est affichée dans la citation (ex. « *N Engl J Med* »). C'est **exactement** ce que tu mets en VALEUR.
Quelques exemples utiles : `N Engl J Med`, `JAMA`, `Lancet`, `BMJ`, `Nat Med`, `JAMA Surg`, `Chest`, `Am J Respir Crit Care Med`, `Resuscitation`, `Reg Anesth Pain Med`, `J Clin Anesth`.

### Requête d'un thème (pour THEME)
1. Va sur **pubmed.ncbi.nlm.nih.gov**, tape ta requête dans la barre de recherche.
2. Regarde si les résultats sont pertinents.
3. Si oui, copie la requête telle quelle dans la colonne VALEUR.

Formes qui marchent bien :
- `"terme"[MeSH Terms]` → le concept médical officiel (le plus propre).
- `mot[Title/Abstract]` → présence du mot dans le titre/résumé.
- On combine avec `AND` / `OR` : `"delirium"[MeSH Terms] AND "postoperative"[All Fields]`.

> Respecte les guillemets et les crochets `[MeSH Terms]` / `[Journal]` — c'est ce qui rend la recherche précise.

---

## 7. Banque de thèmes prêts à copier

À coller en VALEUR d'une ligne `THEME` (teste-les d'abord sur PubMed si tu veux) :

| Sujet | VALEUR |
|---|---|
| Douleur post-opératoire | `"pain, postoperative"[MeSH Terms]` |
| Anesthésie obstétricale | `"anesthesia, obstetrical"[MeSH Terms]` |
| Anesthésie pédiatrique | `"anesthesia"[MeSH Terms] AND "child"[MeSH Terms]` |
| Neuro-réanimation | `"brain injuries"[MeSH Terms] OR "intracranial hypertension"[MeSH Terms]` |
| Insuffisance rénale aiguë | `"acute kidney injury"[MeSH Terms]` |
| ECMO / assistance | `"extracorporeal membrane oxygenation"[MeSH Terms]` |
| Sevrage ventilatoire | `"ventilator weaning"[MeSH Terms]` |
| Curarisation | `"neuromuscular blockade"[MeSH Terms]` |
| Échographie au lit (POCUS) | `"point-of-care ultrasound"[Title/Abstract]` |
| Nutrition en réanimation | `"critical illness"[MeSH Terms] AND "nutrition therapy"[MeSH Terms]` |

---

## 8. Après chaque modification

- **Appliquer tout de suite** : lance `runVeille()` dans Apps Script. Il ajoute seulement le nouveau (il ne recrée pas les doublons).
- **Repartir totalement propre** (utile après un gros changement de filtre) : `resetVeille()` puis `runVeille()`.
- **Sinon** : le scan automatique du **lundi** appliquera tes réglages tout seul.

Le log de `runVeille()` t'affiche `X nouveaux / Y scannés` — ton thermomètre de volume.

---

## 9. Ta config actuelle (rappel)

- **10 revues cœur** : Anesthesiology, Br J Anaesth, Anaesthesia, Anesth Analg, Intensive Care Med, Crit Care Med, Crit Care, Ann Intensive Care, Anaesth Crit Care Pain Med, Eur J Anaesthesiol.
- **4 généralistes** : N Engl J Med, JAMA, Lancet, BMJ (croisées à tes thèmes).
- **8 thèmes** : sepsis, voies aériennes, SDRA/ventilation, délire post-op, monitorage hémodynamique, ALR, hémorragie/transfusion, arrêt cardiaque.
- **Types gardés** : essais randomisés, méta-analyses, revues systématiques, recommandations. (Mises au point désactivées.)
- **Fenêtre** : 30 jours · **humains** · **anglais + français**.
