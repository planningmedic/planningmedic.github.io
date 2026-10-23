#!/bin/bash
# Lance le banc d'essai, plusieurs scénarios à la fois.
#
#   ./lancer.sh                         tout le banc — OBLIGATOIRE avant tout push
#   ./lancer.sh rapide index.html …     seulement les scénarios qui lisent ces
#                                       fichiers (aide pendant le travail)
#   JOBS=1 ./lancer.sh                  un scénario à la fois, comme avant
#
# (21/10/2026) Les scénarios sont indépendants (aucun n'écrit de fichier ni
# n'ouvre de port) : les lancer en parallèle divise la durée par le nombre de
# processeurs. Chaque sortie est gardée à part puis affichée dans l'ordre de la
# liste ; tous les scénarios tournent, et les échecs sont récapitulés à la fin.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install jsdom --silent

SCENARIOS="banc.js banc_worker.mjs banc_journal_signal.mjs banc_notif.mjs banc_cloche.js banc_caducs.js banc_miroir.js banc_miroir_diff.js banc_docs.js banc_resilience.js banc_page.js banc_chaos.js banc_veille.js banc_topos.js banc_fiches_pratiques.js banc_pages_mar.js banc_tuiles_privees.js banc_annee_suivante.js banc_ios.js banc_ptr.js banc_google.js banc_gestes.js banc_synchro.js banc_acces.mjs banc_codes_acces.js banc_pastille_indispos.js banc_catastrophe.js banc_equipe.js banc_annuel.js banc_w1_fin_staff.js banc_indispos.js banc_ordre_vac.js banc_staff_ponts.js banc_staff_cl.js banc_tp.js banc_tp_campagne.js banc_garde_veille_tp.js banc_garde_veille_vac.js banc_pose_tp.js banc_pose_tp_page.js banc_reprise_indispos.js banc_calendrier.js banc_vacances_estimees.js banc_diag_sentinelle.js banc_liens_r.js banc_recups.js banc_echanges.js banc_ecran_echanges.js banc_liberal.js banc_audit_souhaits.js banc_export_excel.js banc_a_placer.js banc_mail_change.js banc_equite_echelle.js banc_equite_certificat.js banc_stats_usage.js banc_stats_admin.js banc_stats_ecran.js banc_reliquats.js banc_wizard_gardes.js banc_essai_generation.js banc_nouvel_algo.js banc_paire_evitee.js banc_cl_cible_pleine.js banc_paire_avertissement.js banc_essai_meme_planning.js banc_archive_id.js banc_medecins_memo.js banc_quotas_serveur.js banc_contrat_routeur.js banc_portail.js banc_equite_commun.js banc_18h_fenetre.js banc_part_exacte.js banc_dette_cumul.js banc_rapport_axes_rares.js banc_quota_indispos.js banc_indispo_unite.js banc_contrat_vacconfig.js banc_acr.js banc_pense_bete.js banc_ordre_chargement.js banc_creneaux_secretariat.js banc_plafond_vjf.js banc_souhaits_rares.js banc_souhaits_semaine.js banc_souhaits_taux.js banc_souhaits_etales.js banc_fin_saisie.js banc_couples_weekend.js banc_ratio18.js banc_accueil_blocs.js banc_paie.js banc_mail_recap.js e2e.js interface.js"

MODE=complet
if [ "$1" = "rapide" ]; then
  shift
  MODE=rapide
  echo "════════ MODE RAPIDE : $* ════════"
  SCENARIOS=$(node selection.js "$@" -- $SCENARIOS) || exit 2
fi

JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)}
SORTIES=$(mktemp -d)
trap 'rm -rf "$SORTIES"' EXIT

# Les scénarios qui génèrent une année de gardes (harnais du simulateur) sont
# les plus longs : on les démarre en premier pour ne pas finir sur eux.
ORDRE=$( for f in $SCENARIOS; do grep -q "simulateur', 'harness" "$f" && echo "$f"; done
         for f in $SCENARIOS; do grep -q "simulateur', 'harness" "$f" || echo "$f"; done )

DEBUT=$(date +%s)
echo "$ORDRE" | xargs -P "$JOBS" -I{} sh -c 'node "$1" > "$2/$1.txt" 2>&1; echo $? > "$2/$1.rc"' _ {} "$SORTIES"
DUREE=$(( $(date +%s) - DEBUT ))

ECHECS=""
for f in $SCENARIOS; do
  echo "──────── $f ────────"
  cat "$SORTIES/$f.txt"
  [ "$(cat "$SORTIES/$f.rc" 2>/dev/null)" = "0" ] || ECHECS="$ECHECS $f"
done

NB=$(echo $SCENARIOS | wc -w | tr -d ' ')
if [ -n "$ECHECS" ]; then
  echo "════════ ÉCHEC — $NB scénarios en ${DUREE} s ; en échec :$ECHECS ════════"
  exit 1
fi
if [ "$MODE" = "rapide" ]; then
  echo "════════ SÉLECTION AU VERT ($NB scénarios, ${DUREE} s) — banc COMPLET obligatoire avant push ════════"
else
  echo "════════ BANC COMPLET AU VERT ($NB scénarios, ${DUREE} s) ════════"
fi
