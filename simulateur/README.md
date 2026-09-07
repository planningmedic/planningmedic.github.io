# Simulateur — banc d'essai du générateur de gardes

Exécute le **vrai** `generateur_gardes.gs` dans Node avec un Google Sheets simulé.
Toute modification du générateur DOIT repasser cette batterie avant push :

    node simulateur/scenarios.js      # batterie de scénarios (invariants + équité)
    node simulateur/avant_apres.js    # comparaison version dépôt vs copie patchée (repo-patched/)
    node simulateur/chain.js          # convergence de la dette sur 4 ans, couplages, 18h
    SCEN=0 node simulateur/staff140.js      # 20 ans d'un tirage : ecart max/an, couverture
    SCEN=0 node simulateur/staff_rythme.js  # 20 ans d'un tirage : intervalles, mois charges

`staff140.js` et `staff_rythme.js` produisent les chiffres affiches dans
`docs/presentation-staff.html`. La serie complete = `SCEN` de 0 a 19, soit
**400 annees** (2027-2046). `SCEN=0` reproduit exactement le tirage par defaut
de `demographie.js` ; les autres valeurs decalent la graine.
Mesure du 29/07/2026 : 292 312 gardes, 0 journee sans binome, ecart median 1,20,
> 3 gardes dans 3 annees sur 400 (toutes dans le creux demographique).

Règle : AUCUNE métrique ne doit se dégrader (errs, écarts par axe, G−G2, warnings).
Invariants vérifiés : binôme complet/jour, jamais 2 gardes consécutives, RG, intégrité
VD, couplages fériés, indispos, NO_WEEKEND/NO_GARDE, jours fixes TP, combo jeu→sam, R≡SAM.
