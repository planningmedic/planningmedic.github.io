/* ═══ JEU DE DONNÉES RÉALISTE — entièrement FICTIF ═══
   Reproduit la forme et l'échelle du service (23 MAR, une année complète de
   colonnes, gardes, statuts, placements existants) SANS jamais contenir de
   donnée réelle : les identifiants sont inventés. Le dépôt étant public,
   aucun contenu du classeur ne doit y figurer. */
const MARS = ['ALPHA','BRAVO','CHARLI','DELTA','ECHO','FOXTRO','GOLF','HOTEL','INDIA','JULIET',
              'KILO','LIMA','MIKE','NOVEMB','OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO',
              'UNIFOR','VICTOR','WHISKY'];

function datesAnnee(annee, nb) {
  const out = []; const d = new Date(Date.UTC(annee, 0, 4));
  while (out.length < nb) {
    const j = d.getUTCDay();
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/* GARDES_{annee} : 3 lignes d'en-tête (les dates en ligne 3, index 2), puis un
   MAR par ligne — structure identique à la production. */
function feuilleGardes(annee, nbJours) {
  const dates = datesAnnee(annee, nbJours || 120);
  const lignes = [
    ['', ''].concat(dates.map(() => '')),
    ['', ''].concat(dates.map(() => '')),
    ['MAR', ''].concat(dates),
  ];
  MARS.forEach((id, i) => {
    const l = [id, ''];
    dates.forEach((d, j) => {
      let code = '';
      if ((i + j) % 37 === 0) code = 'G';          // garde
      else if ((i + j) % 37 === 1) code = 'RG';    // récup de garde
      else if ((i * 3 + j) % 29 === 0) code = 'V'; // congés
      else if ((i + j * 2) % 41 === 0) code = 'TP';
      l.push(code);
    });
    lignes.push(l);
  });
  return { lignes, dates };
}

function feuilleOverrides(dates, nb) {
  const l = [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']];
  const secteurs = ['REA','MAT','VIS','ORT','END','ORL','CI'];
  for (let i = 0; i < (nb || 40); i++) {
    const d = dates[(i * 7) % dates.length], m = MARS[(i * 5) % MARS.length], s = secteurs[i % secteurs.length];
    l.push([d, m, s, s, 'Comité — ' + s]);
  }
  return l;
}
module.exports = { MARS, datesAnnee, feuilleGardes, feuilleOverrides };
