# Harnais de non-régression — Wizards (admin.html) + archiveYear (GAS)

Rejoue les **scénarios de panne/reprise** validés lors de l'audit du 15/07/2026, en
extrayant les fonctions **réelles** des fichiers du dépôt (rien à maintenir en double) :

- `launchWizInit` (W1 — démarrage d'année) : échec en cours d'init → reprise sans rejouer les étapes réussies.
- `launchWizardGardes` (W2 — génération) : publication en échec → reprise sans regénérer ; réponse de génération perdue → le verrou GAS « existe déjà » vaut étape acquise ; récaps en échec → non bloquant.
- `launchWizardCloture` (W3 — clôture) : bascule en échec → reprise sans re-archiver.
- `archiveYear` (setup_annee.gs) : garde d'idempotence (déjà archivée → succès · vrai problème → ❌ conservé · archivage normal → transparente).

## Usage

```bash
# depuis la racine du dépôt (fichiers locaux à jour)
node simulateur/wizards/run.js
# ou avec des chemins explicites
node simulateur/wizards/run.js /tmp/admin.html /tmp/setup_annee.gs
```

Code retour `0` = tout passe · `1` = régression (détail affiché).

## Règle

**À lancer avant tout push** qui touche les fonctions `launchWiz*` d'`admin.html`
ou `archiveYear` de `gas/setup_annee.gs`. Si une extraction échoue (« Fonction
introuvable »), c'est qu'un renommage a cassé le harnais : le mettre à jour dans
le même push.

*Créé le 15/07/2026 (audit process). Mock DOM/API minimal, aucune dépendance npm.*
