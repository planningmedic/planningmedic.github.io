function renderReport(){
  const date = formatDateFR($("date").value);
const anesths = [...document.querySelectorAll(".anesthesiste")]
  .map(x=>x.value)
  .filter(Boolean);

  const chirs = [...document.querySelectorAll(".chirurgien")]
    .map(x=>x.value)
    .filter(Boolean);

  const gestes = [...document.querySelectorAll("#gesteContainer > .field")]
  .map(buildGesteLabel)
  .filter(Boolean);

  let txt = "INTERVENTION\n";
txt += `Date : ${date}\n`;
txt += `Anesthésiste : ${anesths.join(", ")}\n`;
  
const intervenantLabel =
  ["Psychiatrie", "Endoscopie digestive"]
    .includes(specialiteSelect.value)
      ? "Intervenant"
      : "Chirurgien";

txt += `${intervenantLabel} : ${chirs.join(", ")}\n`;
  
const labelIntervention =
  gestes.join(" associée à ") +
  (isSedationMode() ? " sous sédation" : "") +
  (state.urgence ? " en urgence" : "");

txt += `Intervention : ${labelIntervention}\n\n`;

  const mon = [];

  if(state.monitorage.includes("Scope")){
    const derivations = $("scopeDerivations")?.value || "3 dérivations";
    mon.push(`Scope cardiotensionnel ${derivations}`);
  }

  if(state.monitorage.includes("SpO2")) mon.push("SpO2");
if(state.monitorage.includes("VVP")){
  if(state.vvpCount === 2){
    mon.push("2 voies veineuses périphériques");
  }else{
    mon.push("Voie veineuse périphérique");
  }
}
  if(state.monitorage.includes("PICC Line")) mon.push("Présence d'un PICC Line");
  if(state.monitorage.includes("Mid Line")) mon.push("Présence d'un Mid Line");
  if(state.monitorage.includes("BIS")) mon.push("BIS");
  if(state.monitorage.includes("TOF")) mon.push("TOF");

const position = $("positionPatient")?.value;

if(position || mon.length || state.monitorage.includes("KTA") || state.monitorage.includes("KTC")){
    txt += "INSTALLATION\n";

    if(position){
      txt += `Patient installé en ${position.toLowerCase()}.\n`;
    }

    if(mon.length){
      txt += mon.join(", ") + ".\n";
    }

    const kta = $("ktaSite")?.value;

    if(kta){
      txt += kta.includes("Radial")
        ? `Mise en place d'un cathéter artériel en ${kta.toLowerCase()} après test d'Allen négatif.\n`
        : `Mise en place d'un cathéter artériel en ${kta.toLowerCase()}.\n`;
    }

    const ktc = $("ktcSite")?.value;

    if(ktc){
      txt += `Mise en place d'un cathéter veineux central échoguidé en ${ktc.toLowerCase()}.\n`;
    }

    txt += "\n";
  }

  let ordre;

if(isECTMode()){
  ordre = ["Propofol","Célocurine","Kétamine"];
}else if(isSedationMode()){
  ordre = ["Midazolam","Propofol","Sufentanil","Kétamine"];
}else{
  ordre = ["Sufentanil","Rémifentanil","Kétamine","Etomidate","Propofol"];
}
  
const meds = ordre
  .filter(x=>state.induction.includes(x))
  .map(x=>{
    if(isECTMode()){
      const dose = state.ectDoses?.[x];

      return dose ? `${x} ${dose} mg` : x;
    }

    return x;
  });  
  
const curares = state.curare.filter(x=>x !== "Aucun");

if(meds.length){

  if(isSedationMode()){

    txt += "SÉDATION\n";
    txt += "Sédation par ";

  }else{

    txt += "INDUCTION\n";
    txt += $("sequenceRapide").checked
      ? "Induction en séquence rapide par "
      : "Induction par ";

  }

    txt += meds.join(", ");

    if(curares.length){
      txt += " puis curarisation par " + curares.join(", ");
    }

    txt += ".\n\n";
  }
if(state.antagonisation){
  if(state.curare.includes("Rocuronium")){
    txt += "Antagonisation de la curarisation par sugammadex.\n\n";
  }else if(state.curare.includes("Atracurium")){
    txt += "Antagonisation de la curarisation par néostigmine.\n\n";
  }
}
  if(state.va){
    txt += "VOIES AÉRIENNES\n";

    if(state.va === "Ventilation spontanée"){
      txt += "Geste effectué en ventilation spontanée.\n";
    }

   if(state.va === "Masque laryngé"){
  txt += `Mise en place atraumatique d'un masque laryngé taille ${$("mlSize")?.value || ""}, absence de bris dentaire.\n`;
}

    if(state.va === "Intubation oro-trachéale"){
      if(!$("sequenceRapide").checked && state.ventilation){
        if(state.ventilation === "Facile") txt += "Ventilation au masque facile.\n";
        if(state.ventilation === "Difficile") txt += "Ventilation au masque difficile.\n";
        if(state.ventilation === "Impossible") txt += "Ventilation au masque impossible.\n";

        if(state.ventilation === "Autre"){
          const precision = $("ventilationPrecision").value;
          if(precision) txt += `Ventilation au masque : ${precision}.\n`;
        }
      }

      const gestesThoraciques = getSelectedGestesRaw();
      const isThoracicSelective =
        gestesThoraciques.includes("Lobectomie pulmonaire") ||
        gestesThoraciques.includes("Segmentectomie") ||
        gestesThoraciques.includes("Œsophagectomie Lewis-Santy");

      if(isThoracicSelective){
        const tailleSelective = $("selectiveTubeSize")?.value || "";
        txt += `Intubation oro-trachéale avec une sonde sélective gauche ${tailleSelective} sans ergot, contrôle fibroscopique de la position.\n`;
      }else{
        txt += `Intubation oro-trachéale atraumatique avec une sonde ${$("tubeSize")?.value || ""}, auscultation symétrique, pression du ballonnet vérifiée au manomètre, absence de bris dentaire.\n`;
      }
    }

    txt += "\n";
  }

  if(state.entretien){
    txt += "ENTRETIEN\n";
    txt += state.entretien === "Sevoflurane"
      ? "Entretien anesthésique par sévoflurane.\n\n"
      : "Entretien anesthésique par propofol en AIVOC.\n\n";
  }

if(state.analgesie.length){
  const analgesies = state.analgesie
    .map(x => x === "Autre" ? $("analgesieOtherText")?.value?.trim() : x)
    .filter(Boolean);

  if(analgesies.length){
    txt += "ANALGÉSIE\n";

    if(isSedationMode()){
      txt += `Analgésie par ${analgesies.join(", ")}.\n\n`;
    }else{
      txt += `Analgésie multimodale par ${analgesies.join(", ")}.\n\n`;
    }
  }
}

  if(state.alr.length){
  const alrList = state.alr
    .map(x => x === "Autre" ? $("alrOtherText")?.value?.trim() : x)
    .filter(Boolean);

  if(alrList.length){
    txt += "ALR PÉRIPHÉRIQUE\n";
    let alrSentence =
  `ALR de type ${alrList.join(", ")} réalisée de manière échoguidée avec ${$("localVolume").value} mL de ${$("localAgent").value}`;

const ktList = [];

alrList.forEach(alr=>{

  if(state.continuousALR?.[alr]){

    let ktTxt =
  `puis mise en place d’un cathéter périnerveux continu`;

const precision =
  state.continuousALRText?.[alr];

if(precision){
  ktTxt += ` (ropivacaïne 0,2% à ${precision} mL/h)`;
}

    ktList.push(ktTxt);
  }
});

if(ktList.length){
  alrSentence += `. ${ktList.join(", ")}`;
}

txt += alrSentence + ".\n\n";
  }
}

  if(state.neuraxial.length){
    txt += "ALR NEURAXIALE\n";

    state.neuraxial.forEach(n=>{
      if(n === "Péridurale" || n === "Péridurale thoracique"){
        const niveau = $("periduraleNiveau").value;
        txt += `${n} réalisée`;
        if(niveau) txt += ` au niveau ${niveau}`;
        txt += ".\n";
      }else{
        txt += `${n} réalisée.\n`;
      }
    });

    txt += "\n";
  }

  const peropVisible = !$("peropCard").classList.contains("hidden");
  const diurese = $("diurese").value;
  const saignement = $("saignement").value;
  const remplissage = $("remplissage").value;
const norad = $("noradToggle").classList.contains("active");
  const noradText = $("noradText").value;
const incident = $("incidentToggle").classList.contains("active");
  const incidentText = $("incidentText").value;

if(peropVisible && (diurese || saignement || remplissage || norad || incident || (state.transfusionActive && state.transfusion.length) || (state.drainsActive && state.drains.length))){
    txt += "PER-OPÉRATOIRE\n";

    if(diurese) txt += `Diurèse : ${diurese} mL.\n`;
    if(saignement) txt += `Saignement estimé : ${saignement} mL.\n`;
    if(remplissage) txt += `Remplissage : ${remplissage}.\n`;
    if(state.transfusionActive && state.transfusion.length){
  const transf = [];

  if(state.transfusion.includes("CGR")){
    const q = $("qteCGR").value;
    transf.push(q ? `${q} CGR` : "CGR");
  }

  if(state.transfusion.includes("PFC")){
    const q = $("qtePFC").value;
    transf.push(q ? `${q} PFC` : "PFC");
  }

  if(state.transfusion.includes("Plaquettes")){
    const q = $("qtePlaquettes").value;
    transf.push(q ? `${q} Plaquettes` : "Plaquettes");
  }

  if(state.transfusion.includes("Fibrinogène")){
  const q = $("qteFibrinogene").value;
  transf.push(q ? `Fibrinogène ${q} g` : "Fibrinogène");
}

if(state.transfusion.includes("Calcium")){
  const q = $("qteCalcium").value;
  transf.push(q ? `Calcium ${q} g` : "Calcium");
}

  if(state.transfusion.includes("Autre")){
    const autre = $("transfusionOtherText").value.trim();
    if(autre) transf.push(autre);
  }

  if(transf.length){
    txt += `Transfusion peropératoire : ${transf.join(", ")}.\n`;
  }
}
  if(state.drainsActive && state.drains.length){
    const drains = [];
  
  if(state.drains.includes("Drain thoracique")){
      const drainThoraciqueVal = $("drainThoraciqueText").value.trim();
      drains.push(drainThoraciqueVal ? `Drain thoracique ${drainThoraciqueVal}` : "Drain thoracique");
    }

  if(state.drains.includes("Redon")){
    const redonVal = $("redonText").value.trim();
    drains.push(redonVal ? `Redon ${redonVal}` : "Redon");
  }

  if(state.drains.includes("Lame")){
    const lameVal = $("lameText").value.trim();
    drains.push(lameVal ? `Lame ${lameVal}` : "Lame");
  }

  if(state.drains.includes("Sonde vésicale")){
    const svVal = $("svText").value.trim();
    drains.push(svVal ? `Sonde vésicale ${svVal} Fr` : "Sonde vésicale");
  }

  if(state.drains.includes("SNG")){
    drains.push("SNG");
  }

  if(state.drains.includes("Autre")){
    const drainsAutreVal = $("drainsOtherText").value.trim();
    if(drainsAutreVal) drains.push(drainsAutreVal);
  }

  if(drains.length){
    txt += `Dispositifs : ${drains.join(", ")}.\n`;
  }
}
    if(norad){
      txt += "Support vasopresseur peropératoire par noradrénaline 16 µg/mL";
      if(noradText) txt += ` (${noradText})`;
      txt += ".\n";
    }

    if(incident && incidentText){
      txt += `Incident peropératoire : ${incidentText}\n`;
    }

    txt += "\n";
  }

  txt += "ANTIBIOPROPHYLAXIE\n";

  if(state.antibio === "Aucune"){
    txt += "Pas d'antibioprophylaxie.\n";
  }else if(state.antibio === "Autre"){
    const autre = $("antibioOtherText").value;
    txt += autre
      ? `Antibioprophylaxie par ${autre}.\n`
      : "Antibioprophylaxie par autre antibiotique à préciser.\n";
  }else{
    const dose = ANTIBIO_DOSES[state.antibio];
    txt += dose
      ? `Antibioprophylaxie par ${state.antibio} ${dose}.\n`
      : `Antibioprophylaxie par ${state.antibio}.\n`;
  }
const reveil = state.reveil || [];

if(reveil.length){

  txt += "SUITES IMMÉDIATES\n";

if(isSedationMode() || isECTMode()){
    if(reveil.includes("Simples")){
      txt += "Suites simples.\n";
    }

    if(reveil.includes("Autre")){
      const txtLibre =
        $("sedationSuitesOtherText")?.value?.trim();

      if(txtLibre){
        txt += txtLibre + ".\n";
      }
    }
    
txt += "Transfert en service pour suite de la prise en charge.\n";
    
  }else{

    const destination = $("destinationPostop")?.value;
    const complicationExtubation =
      $("complicationExtubationText")?.value?.trim();

    const intubeVentileReason =
      $("intubeVentileReason")?.value?.trim();

    const intube =
      reveil.includes("Patient transféré intubé ventilé");

    const complication =
      reveil.includes("Complication extubation");

    const extubation =
      reveil.includes("Extubation");

    if(intube){

      let phrase =
        "Patient transféré intubé ventilé";

      if(destination){
        phrase += " en " + destination.toLowerCase();
      }

      if(intubeVentileReason){
        phrase += " en raison de " + intubeVentileReason;
      }

      txt += phrase + ".\n";

    }else{

      if(complication && complicationExtubation){
        txt += `Complication à l’extubation : ${complicationExtubation}.\n`;
      }else if(extubation){
        txt += "Patient extubé en SSPI sans complication.\n";
      }

      if(destination){
        txt += `Transfert en ${destination.toLowerCase()} pour suite de la prise en charge.\n`;
      }
    }
  }

  txt += "\n";
}
    report.value = txt;
}

function buildDPIReport(){
  let txt = report.value;

  txt = txt.split("INTERVENTION\n").join("");
  txt = txt.split("INSTALLATION\n").join("");
  txt = txt.split("INDUCTION\n").join("");
  txt = txt.split("VOIES AÉRIENNES\n").join("");
  txt = txt.split("ENTRETIEN\n").join("");
  txt = txt.split("ANALGÉSIE\n").join("");
  txt = txt.split("ALR PÉRIPHÉRIQUE\n").join("");
  txt = txt.split("ALR NEURAXIALE\n").join("");
  txt = txt.split("PER-OPÉRATOIRE\n").join("");
  txt = txt.split("ANTIBIOPROPHYLAXIE\n").join("");
  txt = txt.split("SUITES IMMÉDIATES\n").join("");

  return txt;
}
