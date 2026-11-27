const GAS_VERSION_SOLVEUR = '2026-11-27.1';   // (27/11/2026) .1 : tout se termine sur la page Maintenance — l'essai à blanc rend le compte rendu par MAR, l'application arme les notifications et note sa date, action solveurRecaps (mails « Vos gardes », une seule fois sauf demande) · (18/11/2026) .1 : SOLVEUR EXACT — lancer le calcul dans le dépôt privé, suivre son état, l'essayer à blanc puis l'appliquer (page Maintenance)

/* ═══ SOLVEUR EXACT DES GARDES (18/11/2026) ═══════════════════════════════
   Le calcul habituel cherche un bon planning en quelques minutes. Le solveur
   exact (OR-Tools, dans le dépôt GitHub PRIVÉ planningmedic-solveur) cherche LE
   meilleur, critère après critère, et prouve qu'il n'y a pas mieux. Il demande
   15 à 60 minutes : trop pour Google (6 min). Le travail se fait donc en trois
   temps, depuis la page Maintenance :
     1. solveurLancer : le générateur s'arrête juste avant les jours critiques et
        rend ses entrées (opts.exportSolveur) ; elles partent, compressées, dans le
        dépôt privé, et le calcul est lancé. Rien n'est écrit dans le classeur.
     2. solveurEtat : en cours / prêt / impossible (nuits sans binôme nommées) /
        échec, avec le bilan des étapes.
     3. solveurAppliquer : le générateur repart du début avec le planning du
        solveur imposé (opts.planSolveur) et fait le reste comme d'habitude
        (18 h, récupérations, statistiques, écriture). En essai à blanc, rien n'est
        écrit. Pour de vrai, la génération reste verrouillée si GARDES_{année}
        existe : on ne régénère jamais une année déjà générée.
   Le jeton (CONFIG, clé SOLVEUR_TOKEN) n'ouvre QUE le dépôt privé. Les données
   nominatives ne vont que dans ce dépôt privé, jamais dans le dépôt public. */
const SOLVEUR_DEPOT = 'planningmedic/planningmedic-solveur';
const SOLVEUR_TIRAGE = 1;              // même tirage à l'export et à l'application : mêmes gardes fixées
const SOLVEUR_TL = '300';              // secondes par critère

function _solveurJeton_() {
  const data = _configRows_();
  for (let r = 1; r < data.length; r++) if (String(data[r][0]).trim() === 'SOLVEUR_TOKEN') return String(data[r][1]).trim();
  return '';
}
function _solveurApi_(chemin, methode, corps) {
  const o = { method: methode || 'get', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + _solveurJeton_(), Accept: 'application/vnd.github+json' } };
  if (corps) { o.contentType = 'application/json'; o.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + SOLVEUR_DEPOT + chemin, o);
  let j = null; try { j = JSON.parse(r.getContentText() || 'null'); } catch (e) {}
  return { code: r.getResponseCode(), json: j };
}
function _solveurCle_(an) { return 'SOLVEUR_' + an; }
function _solveurSuivi_(an) {
  const v = PropertiesService.getScriptProperties().getProperty(_solveurCle_(an));
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function _solveurRepondre_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
// Année acceptée : à partir de 2028, et pas encore générée (2026 et 2027 sont sanctuarisées).
function _solveurAnnee_(payload) {
  const an = Number(payload && payload.year) || 0;
  if (an < 2028 || an > 2100) return { erreur: 'Année refusée : le solveur sert à partir des gardes 2028.' };
  if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GARDES_' + an))
    return { erreur: 'GARDES_' + an + ' existe déjà : on ne régénère jamais une année déjà générée.' };
  return { an: an };
}
// Lit un fichier compressé du dépôt privé et le rend en objet (null s'il n'existe pas).
function _solveurLireGz_(chemin) {
  const r = _solveurApi_('/contents/' + chemin);
  if (r.code !== 200 || !r.json || !r.json.content) return null;
  const octets = Utilities.base64Decode(String(r.json.content).replace(/\s/g, ''));
  const texte = Utilities.ungzip(Utilities.newBlob(octets, 'application/x-gzip')).getDataAsString();
  return JSON.parse(texte);
}

/* ── action "solveurLancer" (maintenance) ── */
function _act_solveurLancer(R) {
  const { payload, user } = R;
  if (!_droitMaintenance_(user)) return _deny();
  const A = _solveurAnnee_(payload); if (A.erreur) return _solveurRepondre_({ success: false, error: A.erreur });
  if (!_solveurJeton_()) return _solveurRepondre_({ success: false, error: 'Jeton SOLVEUR_TOKEN absent de CONFIG.' });
  const t0 = Date.now();
  let r;
  try { r = generateGardes(A.an, { dryRun: true, tirage: SOLVEUR_TIRAGE, exportSolveur: true }); }
  catch (err) { return _solveurRepondre_({ success: false, error: 'Préparation impossible : ' + String(err && err.message || err) }); }
  if (!r || !r.solveur) return _solveurRepondre_({ success: false, error: 'Le générateur n\'a pas rendu les entrées du solveur.' });
  const base = A.an + '-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd-HHmmss');
  const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(r.solveur), 'application/json', base + '.json'));
  const envoi = _solveurApi_('/contents/entrees/' + base + '.json.gz', 'put',
    { message: 'Entrées ' + base, content: Utilities.base64Encode(gz.getBytes()) });
  if (envoi.code !== 201 && envoi.code !== 200)
    return _solveurRepondre_({ success: false, error: 'Envoi refusé par GitHub (' + envoi.code + ').' });
  const go = _solveurApi_('/actions/workflows/solveur.yml/dispatches', 'post',
    { ref: 'main', inputs: { fichier: base + '.json.gz', tl: SOLVEUR_TL } });
  if (go.code !== 204) return _solveurRepondre_({ success: false, error: 'Lancement refusé par GitHub (' + go.code + ').' });
  const suivi = { base: base, lance: new Date().toISOString() };
  PropertiesService.getScriptProperties().setProperty(_solveurCle_(A.an), JSON.stringify(suivi));
  logAction('Solveur ' + A.an + ' lancé (' + base + ', ' + Math.round(gz.getBytes().length / 1024) + ' Ko)');
  return _solveurRepondre_({ success: true, base: base, ko: Math.round(gz.getBytes().length / 1024), secondes: Math.round((Date.now() - t0) / 1000) });
}

/* ── action "solveurEtat" (maintenance) ── */
// etat : aucun | en_cours | pret | impossible | echec
function _act_solveurEtat(R) {
  const { payload, user } = R;
  if (!_droitMaintenance_(user)) return _deny();
  const an = Number(payload && payload.year) || 0;
  const s = _solveurSuivi_(an);
  if (!s) return _solveurRepondre_({ success: true, etat: 'aucun' });
  /* (27/11/2026) Gardes déjà créées par « Appliquer » : il ne reste que les récapitulatifs.
     Répondu sans interroger le dépôt privé (le résultat n'a plus à être relu). */
  if (s.applique) return _solveurRepondre_({ success: true, etat: 'applique', base: s.base, applique: s.applique, recaps: s.recaps || null });
  const minutes = Math.round((Date.now() - new Date(s.lance).getTime()) / 60000);
  const res = _solveurLireGz_('sorties/' + s.base + '.json.gz');
  if (res) {
    const etapes = (res.rapport || []).map(x => ({ nom: x.palier, valeur: x.valeur, prouve: !!x.prouve }));
    if (res.echec === 'couverture') return _solveurRepondre_({ success: true, etat: 'impossible', base: s.base, nuits: res.nuits || [], etapes: etapes });
    if (res.echec) return _solveurRepondre_({ success: true, etat: 'echec', base: s.base, error: 'Étape impossible : ' + res.echec, etapes: etapes });
    return _solveurRepondre_({ success: true, etat: 'pret', base: s.base, minutes: minutes, etapes: etapes,
      prouvees: etapes.filter(e => e.prouve).length });
  }
  // Pas encore de résultat : le calcul tourne-t-il encore ?
  const runs = _solveurApi_('/actions/runs?event=workflow_dispatch&per_page=10');
  const liste = (runs.json && runs.json.workflow_runs) || [];
  const run = liste.find(x => new Date(x.created_at).getTime() >= new Date(s.lance).getTime() - 120000);
  if (run && run.status === 'completed' && run.conclusion !== 'success')
    return _solveurRepondre_({ success: true, etat: 'echec', base: s.base, error: 'Le calcul s\'est arrêté (' + run.conclusion + ').' });
  return _solveurRepondre_({ success: true, etat: 'en_cours', base: s.base, minutes: minutes });
}

/* ── action "solveurAppliquer" (maintenance) ── */
// payload.essai = true : essai à blanc (rien n'est écrit), sinon génération réelle.
function _act_solveurAppliquer(R) {
  const { payload, user } = R;
  if (!_droitMaintenance_(user)) return _deny();
  const A = _solveurAnnee_(payload); if (A.erreur) return _solveurRepondre_({ success: false, error: A.erreur });
  const s = _solveurSuivi_(A.an);
  if (!s) return _solveurRepondre_({ success: false, error: 'Aucun calcul lancé pour ' + A.an + '.' });
  const res = _solveurLireGz_('sorties/' + s.base + '.json.gz');
  if (!res || res.echec || !res.plan || !res.plan.gardes)
    return _solveurRepondre_({ success: false, error: 'Résultat du solveur absent ou incomplet.' });
  const plan = res.plan.gardes;
  const essai = !!(payload && payload.essai);
  const t0 = Date.now();
  try {
    if (essai) {
      const r = generateGardes(A.an, { dryRun: true, tirage: SOLVEUR_TIRAGE, planSolveur: plan });
      /* (27/11/2026) Le compte rendu par MAR, lu AVANT d'appliquer : compteurs, cibles et part
         exacte, tels que le générateur les calcule (aucun recalcul ici). */
      return _solveurRepondre_({ success: true, essai: true, secondes: Math.round((Date.now() - t0) / 1000),
        sansBinome: r.sansBinome || 0, jours: r.jours || [], qualite: r.qualite || null, ecarts: r.ecarts || null, souhaits: r.souhaits || null,
        compteurs: r.compteurs || null, cibles: r.cibles || null, partExacte: r.partExacte || null,
        jf: r.jf || null, h18: r.h18 || null, noel: r.noel || null });
    }
    const w = generateGardes(A.an, { tirage: SOLVEUR_TIRAGE, planSolveur: plan }) || { warnings: [], nbWarnings: 0 };
    generatePlanning(A.an);
    /* (27/11/2026) Même publication que l'assistant du comité : les notifications sont armées.
       Isolé : un échec ici ne doit jamais faire échouer l'application. */
    try { if (typeof notifPlanifier === 'function') notifPlanifier(A.an); } catch (e) {}
    s.applique = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(_solveurCle_(A.an), JSON.stringify(s));
    logAction('Solveur ' + A.an + ' appliqué (' + s.base + ') — ' + (w.nbWarnings || 0) + ' avertissement(s)');
    return _solveurRepondre_({ success: true, essai: false, secondes: Math.round((Date.now() - t0) / 1000), nbWarnings: w.nbWarnings || 0 });
  } catch (err) {
    return _solveurRepondre_({ success: false, error: String(err && err.message || err) });
  }
}

/* ── action "solveurRecaps" (maintenance) — (27/11/2026) ──
   Dernière étape, sur la même page : le mail « Vos gardes » à chaque MAR. C'est l'envoi de
   l'assistant du comité (_act_envoyerRecapIndispos), appelé tel quel : sa porte « responsable »
   reste fermée au comité seul, et s'ouvre ici avec le code personnel de l'appelant, déjà
   contrôlé (droit Maintenance). Un seul envoi par année, sauf demande explicite (encore). */
function _act_solveurRecaps(R) {
  const { payload, user, code } = R;
  if (!_droitMaintenance_(user)) return _deny();
  const an = Number(payload && payload.year) || 0;
  const s = _solveurSuivi_(an);
  if (!s || !s.applique)
    return _solveurRepondre_({ success: false, error: 'Les gardes ' + an + ' ne sont pas encore créées par le calcul exact : appliquez d\'abord.' });
  if (s.recaps && !(payload && payload.encore === true))
    return _solveurRepondre_({ success: false, deja: true, recaps: s.recaps, error: 'Récapitulatifs ' + an + ' déjà envoyés (' + (s.recaps.envoyes || 0) + ' mails).' });
  let r = null;
  try {
    r = JSON.parse(_act_envoyerRecapIndispos({ e: { parameter: {} }, payload: { year: an, codeResponsable: code },
      action: 'envoyerRecapIndispos', code: code, user: { role: 'admin' } }).getContent());
  } catch (err) { return _solveurRepondre_({ success: false, error: 'Envoi impossible : ' + String(err && err.message || err) }); }
  if (!r || !r.success) return _solveurRepondre_({ success: false, error: (r && r.error) || 'Envoi impossible.' });
  const bilan = { le: new Date().toISOString(), envoyes: r.sent || 0, sansMail: r.skipped || 0, echecs: (r.errors || []).length };
  if (bilan.envoyes > 0) {   // rien de parti : rien n'est noté, l'envoi reste à faire
    s.recaps = bilan;
    PropertiesService.getScriptProperties().setProperty(_solveurCle_(an), JSON.stringify(s));
  }
  logAction('Solveur ' + an + ' : récapitulatifs — ' + bilan.envoyes + ' envoyé(s), ' + bilan.sansMail + ' sans e-mail, ' + bilan.echecs + ' en échec');
  return _solveurRepondre_({ success: true, envoyes: bilan.envoyes, sansMail: bilan.sansMail, echecs: bilan.echecs, pjEchecs: (r.pjEchecs || []).length });
}
