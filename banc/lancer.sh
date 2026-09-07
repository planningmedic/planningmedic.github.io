#!/bin/bash
# Lance tout le banc d'essai. Sort en erreur à la première vérification ratée.
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install jsdom --silent
for f in banc.js banc_worker.mjs banc_journal_signal.mjs banc_notif.mjs banc_cloche.js banc_caducs.js banc_miroir.js banc_miroir_diff.js banc_docs.js banc_resilience.js banc_page.js banc_chaos.js banc_veille.js banc_pages_mar.js banc_annee_suivante.js banc_ios.js banc_ptr.js banc_google.js banc_gestes.js banc_synchro.js banc_acces.mjs banc_codes_acces.js banc_pastille_indispos.js banc_catastrophe.js banc_equipe.js banc_annuel.js banc_indispos.js banc_ordre_vac.js banc_staff_ponts.js banc_tp.js banc_tp_campagne.js banc_garde_veille_tp.js banc_pose_tp.js banc_pose_tp_page.js banc_reprise_indispos.js banc_calendrier.js banc_vacances_estimees.js banc_diag_sentinelle.js banc_liens_r.js banc_recups.js banc_echanges.js banc_ecran_echanges.js banc_liberal.js banc_audit_souhaits.js banc_export_excel.js banc_a_placer.js banc_mail_change.js banc_equite_echelle.js banc_equite_certificat.js banc_stats_usage.js banc_stats_admin.js banc_stats_ecran.js banc_reliquats.js banc_wizard_gardes.js banc_essai_generation.js banc_nouvel_algo.js e2e.js interface.js; do
  echo "──────── $f ────────"
  node "$f"
done
echo "════════ BANC COMPLET AU VERT ════════"
