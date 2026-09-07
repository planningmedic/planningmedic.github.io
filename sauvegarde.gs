// GAS_VERSION_SAUVEGARDE = '2026-08-06.1'
// Sauvegarde hebdomadaire du dépôt GitHub vers Drive.
// Déclencheur : hebdomadaire, dimanche entre 3h et 4h (à créer une fois via configurerSauvegarde).

var SAUVEGARDE_DOSSIER = 'Sauvegardes Planning-Med';
var SAUVEGARDE_RETENTION_JOURS = 42; // 6 semaines

function sauvegardeHebdo() {
  var url = 'https://api.github.com/repos/planningmedic/planningmedic.github.io/zipball/main';
  var reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (reponse.getResponseCode() !== 200) {
    throw new Error('Sauvegarde échouée : GitHub a répondu ' + reponse.getResponseCode());
  }

  var dossiers = DriveApp.getFoldersByName(SAUVEGARDE_DOSSIER);
  var dossier = dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(SAUVEGARDE_DOSSIER);

  var dateStr = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  var blob = reponse.getBlob().setName('Planning-Med_' + dateStr + '.zip');
  dossier.createFile(blob);

  // Purge des copies trop anciennes
  var limite = new Date(Date.now() - SAUVEGARDE_RETENTION_JOURS * 24 * 3600 * 1000);
  var fichiers = dossier.getFiles();
  while (fichiers.hasNext()) {
    var f = fichiers.next();
    if (f.getDateCreated() < limite) f.setTrashed(true);
  }
}

function configurerSauvegarde() {
  // À exécuter UNE FOIS à la main : crée le déclencheur hebdomadaire.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sauvegardeHebdo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sauvegardeHebdo')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
}
