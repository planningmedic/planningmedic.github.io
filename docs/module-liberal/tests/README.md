# Tests du module libéral — preuves reproductibles

Ce dossier contient les tests qui **démontrent** les contraintes de sécurité du module
libéral (cf. `../module_liberal_conception.md`, §3.bis et décision 14). Objectif :
face à un audit (CCIN / loi monégasque n° 1.565), fournir une **preuve rejouable**
plutôt qu'une simple déclaration.

## `anti_persistance_devis.test.js`

**Ce qu'il prouve.** Aucun champ patient saisi à l'ouverture du devis (nom, prénom,
mutuelle, RAC nominatif) ne persiste nulle part : ni stockage navigateur, ni réseau,
ni URL, ni DOM après fermeture.

**Trois vérifications :**
1. **Scan statique** — le code ne référence aucune API de stockage navigateur
   (`localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`).
2. **Runtime (jsdom)** — on crée un parcours, on ouvre le devis, on remplit tous les
   champs éditables avec un patient témoin, on ferme le devis, puis on inspecte
   `localStorage` / `sessionStorage` / cookies / DOM : la valeur-témoin ne subsiste
   nulle part.
3. **Réseau** — le remplissage/fermeture du devis ne déclenche aucune requête, et
   aucune requête ne contient le patient témoin.

### Rejouer le test

```bash
npm install jsdom        # dépendance unique
node anti_persistance_devis.test.js [chemin_html] [chemin_ccam_json]
```

Sans argument, le test vise `estimateur-liberal.html` et `ccam_actes.json`
du dossier parent.

### Sortie attendue (code réel)

```
✅ PREUVE ÉTABLIE — aucune donnée patient ne persiste (0 échec).
```
Code de sortie **0**.

### Contrôle de crédibilité

Le test n'est pas complaisant : introduire volontairement une persistance (p. ex.
`localStorage.setItem('patient', …)`) le fait **échouer** (code de sortie 1), à la
fois au scan statique et à l'inspection runtime. Il joue donc aussi le rôle de
**garde-fou anti-régression** : toute évolution future qui réintroduirait un stockage
de données patient est bloquée avant déploiement.

### Périmètre

Ce test couvre le **numérique**. Le devis **imprimé** porte un nom : sa manipulation
relève du circuit documentaire de l'établissement (il remplace un papier déjà
existant). La **conformité juridique** relève de l'établissement / DPO / CCIN — le
module fournit la preuve technique, l'établissement porte la conformité.
