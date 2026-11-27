/* ═══════════════════════════════════════════════════════════════════════
   EXPORT CPA — lecture de l'export hebdomadaire des salles de CPA (26/11/2026)
   Logique PURE, sans page ni réseau : reçoit les lignes du tableur (tableau
   de tableaux, 1re ligne = titres) et rend ce qui part au serveur.

   GARDÉ, pour chaque rendez-vous au régime Libéral : jour et demi-journée de
   consultation, numéro de salle, secteur, date opératoire. RIEN D'AUTRE : ni
   nom, ni heure, ni type d'intervention ne sortent de cette fonction.
   Les colonnes sont trouvées par leur TITRE, jamais par leur position.

   Secteur = agenda du CPA → secteur du planning (validé le 26/11/2026) :
     Endoscopie, Pneumo → END · Viscérale, Urologie → VIS · Ortho, Rachis et
     prothèses → ORT · ORL/Ophtalmo → ORL · Radio et Cardio interventionnelle
     → INTER · Maternité → MAT.
   (27/11/2026) Agenda sans secteur (ex. « Consultation UB Pré-anesthésie ») : on prend
   le secteur de la salle cette demi-journée-là, d'après TOUS ses rendez-vous (publics
   compris), s'il n'y en a qu'un. Sinon (salle mixte ou vide), compté à part. */
(function (racine) {
  const SECTEURS = [[/endo|pneumo/i, 'END'], [/visc|urolog/i, 'VIS'], [/ortho|rachis/i, 'ORT'],
                    [/orl|ophtalmo/i, 'ORL'], [/radio|cardio/i, 'INTER'], [/mat[eé]rnit/i, 'MAT']];
  const net = v => String(v == null ? '' : v).replace(/ /g, ' ').trim();
  const jour = v => {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    const m = net(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    const f = net(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/); return f ? f[3] + '-' + f[2] + '-' + f[1] : '';
  };
  function lireExportCpa(lignes) {
    const tete = (lignes[0] || []).map(t => net(t).toUpperCase());
    const col = n => tete.indexOf(n);
    const c = { salle: col('SALLE'), date: col('DATE_RDV'), heure: col('HEURE_RDV'), agenda: tete.findIndex(t => /LIBELLE/.test(t)),
                bloc: col('DATE_INTERVENTION'), regime: col('REGIME') };
    const manque = Object.keys(c).filter(k => c[k] < 0);
    if (manque.length) return { erreur: 'Colonnes introuvables : ' + manque.join(', ') + '. Est-ce bien l\'export du CPA ?' };
    const out = [], inconnus = {}, deduits = {}, parSalle = {};
    let rdv = 0, lib = 0, sansDate = 0;
    const cle = l => net(l[c.salle]) + '|' + jour(l[c.date]) + '|' + ((net(l[c.heure]).match(/^(\d{1,2})/) || [])[1] < 13 ? 'am' : 'pm');
    lignes.slice(1).forEach(l => {          // 1er passage : secteurs de chaque salle, demi-journée
      if (!net(l[c.date])) return;
      const s = SECTEURS.find(x => x[0].test(net(l[c.agenda])));
      if (s) (parSalle[cle(l)] = parSalle[cle(l)] || {})[s[1]] = true;
    });
    lignes.slice(1).forEach(l => {
      if (!net(l[c.date])) return;
      rdv++;
      if (!/^lib/i.test(net(l[c.regime]))) return;
      lib++;
      const agenda = net(l[c.agenda]);
      let s = SECTEURS.find(x => x[0].test(agenda));
      if (!s) {
        const secs = Object.keys(parSalle[cle(l)] || {});
        if (secs.length === 1) { s = [null, secs[0]]; deduits[agenda || '(sans agenda)'] = (deduits[agenda || '(sans agenda)'] || 0) + 1; }
      }
      const consult = jour(l[c.date]), bloc = jour(l[c.bloc]);
      const salle = (net(l[c.salle]).match(/(\d+)\s*$/) || [])[1] || '';
      const h = net(l[c.heure]).match(/^(\d{1,2})/);
      if (!s) { inconnus[agenda || '(sans agenda)'] = (inconnus[agenda || '(sans agenda)'] || 0) + 1; return; }
      if (!consult || !bloc || !salle || !h) { sansDate++; return; }
      out.push({ consult, per: Number(h[1]) < 13 ? 'am' : 'pm', salle, secteur: s[1], bloc, nb: 1 });
    });
    return { lignes: out, rdv, lib, sansDate, inconnus, deduits };
  }
  racine.lireExportCpa = lireExportCpa;
  if (typeof module !== 'undefined') module.exports = { lireExportCpa };
})(typeof window !== 'undefined' ? window : globalThis);
