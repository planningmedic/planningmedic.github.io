const ALR_PERIPHERIQUE_MAP = {
  "PTH": ["PENG bloc", "Bloc fémoral"],
  "PTG": ["Bloc saphène", "Bloc obturateur", "Bloc fémoral"],
  "Ostéosynthèse cheville": ["Bloc sciatique au creux poplité", "Bloc saphène"],
  "Ostéosynthèse poignet": ["Bloc axillaire", "Blocs distaux"],
  "Canal carpien": ["Bloc axillaire", "Blocs distaux"],
  "Hallux valgus": ["Bloc sciatique", "Blocs de cheville"],
  "Clou gamma": ["Bloc cutané latéral de cuisse", "Bloc fémoral"],
  "Prothèse d'épaule": ["Bloc inter-scalénique"],
  "Arthroscopie de genou": ["Bloc saphène", "Bloc fémoral"],
  "Arthroscopie d'épaule": ["Bloc inter-scalénique"],

  "Hernie inguinale": ["Bloc ilio-inguinal", "TAP bloc"],
  "Hernie ombilicale": ["TAP bloc", "Bloc des grands droits"],
  "Hémorroïdectomie": ["Bloc pudendal"],
  "Colectomie": ["TAP bloc"],
  "Mastectomie totale": ["Bloc paravertébral", "PECS bloc"],

"Lobectomie pulmonaire": [
  "Bloc paravertébral",
  "Bloc érecteur du rachis"
],

"Segmentectomie": [
  "Bloc paravertébral",
  "Bloc érecteur du rachis"
],

"Talcage pleural": [
  "Bloc paravertébral",
  "Bloc érecteur du rachis"
]
};

const ALR_NEURAXIAL_MAP = {
  "Duodénopancréatectomie céphalique": ["Péridurale thoracique"],
  "Œsophagectomie Lewis-Santy": ["Péridurale thoracique"],
  "CHIP": ["Péridurale thoracique"],
  "Lobectomie pulmonaire": ["Péridurale thoracique"],
  "Segmentectomie": ["Péridurale thoracique"],
  "Talcage pleural": ["Péridurale thoracique"],
  "Césarienne": ["Rachianesthésie", "Péridurale"],
  "Curetage": ["Rachianesthésie"],
  "Cerclage": ["Rachianesthésie"],
  "Cystectomie totale": ["Péridurale thoracique"]
};

/* ANTIBIOPROPHYLAXIE — source : RFE SFAR/SPILF « Antibioprophylaxie en chirurgie
   et médecine interventionnelle » 2024, V3.0 du 04/05/2026 (PDF infectiologie.com).
   (29/10/2026) Lignes corrigées ou ajoutées d'après ce document : page en commentaire.
   Une intervention absente de ce tableau vaut « Aucune ». */
const ANTIBIO_MAP = {
  "PTH": "Céfazoline",
  "PTG": "Céfazoline",
  "Ostéosynthèse cheville": "Céfazoline",
  "Ostéosynthèse poignet": "Céfazoline",
  "Recalibrage": "Aucune", // rachis sans matériel (canal lombaire étroit), p. 39
  "Canal carpien": "Aucune",
  "Hallux valgus": "Céfazoline",
  "Clou gamma": "Céfazoline",
  "Prothèse d'épaule": "Céfazoline",
  "Arthroscopie de genou": "Aucune",
  "Arthroscopie d'épaule": "Aucune",
  "Ostéosynthèse plateau tibial": "Céfazoline", // fracture fermée, foyer ouvert, p. 75

  "Duodénopancréatectomie céphalique": "Céfoxitine",
  "Œsophagectomie Lewis-Santy": "Céfazoline",
  "Appendicectomie": "Céfoxitine",
  "Hernie inguinale": "Céfazoline",
  "Hernie ombilicale": "Céfazoline",
  "Hémorroïdectomie": "Métronidazole",
  "Colectomie": "Céfoxitine",
  "Coelioscopie exploratrice": "Aucune",
  "Cholécystectomie": "Aucune",
  "Promontofixation": "Céfazoline",
  "Mastectomie partielle": "Céfazoline",
  "Mastectomie totale": "Céfazoline",
  "Injection Bulkamide": "Aucune",
  "Annexectomie": "Céfazoline",
  "Hystérectomie": "Céfoxitine", // hystérectomie totale, toute voie, p. 67-68
  "CHIP": "Céfoxitine",
  "Kystectomie ovarienne": "Aucune", // annexes par cœlioscopie, p. 66
  "Segmentectomie hépatique": "Céfazoline", // hépatectomie sans geste biliaire, p. 82

  "Lobectomie pulmonaire": "Céfazoline",
  "Segmentectomie": "Céfazoline",
  "Talcage pleural": "Aucune",
  "Médiastinoscopie": "Aucune",

  "Gastroscopie": "Aucune",
  "Coloscopie": "Aucune",
  "Echo-endoscopie haute": "Aucune",
  "RSF": "Aucune",
  "ERCP": "Céfoxitine",
  "Pose de prothèse biliaire": "Céfoxitine",
  "Dissection sous-muqueuse": "Aucune",
  "Mucosectomie": "Aucune",
  "POEM": "Amoxicilline / Acide clavulanique",

  "Ablation de FA": "Aucune",
  "Ablation de flutter": "Aucune",

  "Vertébroplastie": "Céfazoline",
  "Embolisation": "Aucune",

  "Césarienne": "Céfazoline",
  "Conisation": "Aucune",
  "Nymphoplastie de réduction": "Aucune",
  "Curetage": "Aucune",
  "Cerclage": "Aucune",

  "Prostatectomie totale": "Aucune",
  "Biopsies de prostate": "Céfazoline",
  "REP HOLEP": "Céfazoline",
  "REV": "Aucune", // RTUV, GRADE 1, p. 88
  "URS + Laser": "Céfazoline",
  "Montée de JJ": "Céfazoline",
  "Cystectomie totale": "Céfoxitine",
  "Néphrectomie": "Aucune", // chirurgie du rein, p. 89
  "Posthectomie": "Aucune", // verge sans prothèse, p. 89

  "Septoplastie": "Aucune",
  "Rhinoplastie": "Aucune",
  "Thyroïdectomie totale": "Aucune",
  "Thyroïdectomie partielle": "Aucune",
  "Extraction DDS": "Amoxicilline", // dents incluses ou ectopiques, GRADE 1, p. 43-44
  "Carcinome cutané": "Aucune",
  "Cholestéatome": "Aucune",
  "Adénoidectomie": "Aucune",
  "DTT": "Aucune",
  "Turbinoplastie": "Aucune",
  "Adénoamygdalectomie": "Aucune",

  "Varices": "Aucune",
  "Cataracte": "Céfuroxime intracamérulaire", // GRADE 1, p. 45
  "Blépharoplastie": "Aucune", // paupières, GRADE 1, p. 45
  "Amputation abdomino-périnéale": "Céfoxitine",
"Sigmoïdectomie": "Céfoxitine",
"Résection grêlique": "Céfoxitine",
"Rétablissement de continuité": "Céfoxitine",
"Cure d’éventration": "Céfazoline",
"Cure de hernie hiatale": "Céfazoline",
"Sleeve gastrectomie": "Céfoxitine",
"Bypass gastrique": "Céfoxitine",
"Splénectomie": "Céfazoline",
"Surrénalectomie": "Aucune",
"Parathyroïdectomie": "Aucune",
};

const ANTIBIO_DOSES = {
  "Céfazoline": "2 g",
  "Céfoxitine": "2 g",
  "Amoxicilline / Acide clavulanique": "2 g",
  "Métronidazole": "1 g",
  "Amoxicilline": "2 g", // p. 43-44
  "Céfuroxime intracamérulaire": "1 mg/0,1 mL en fin d'intervention", // p. 45
  "Pipéracilline-tazobactam": "4 g", // p. 83
  "Fosfomycine-trométamol": "3 g per os, 2 à 4 h avant le geste" // p. 88
};

/* (29/10/2026) Interventions dont l'antibioprophylaxie dépend du geste réel
   (RFE SFAR/SPILF 2024 V3.0). La page pose la question, sans réponse cochée
   d'office ; sans réponse, rien n'est coché et le CR écrit « à préciser ».
   Ces règles priment sur ANTIBIO_MAP. */
const ANTIBIO_CONDITIONS = {
  "Hernie inguinale": {
    question: "Prothèse posée ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 83"
  },
  "Hernie ombilicale": {
    question: "Prothèse posée ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 83"
  },
  "Cure de hernie hiatale": {
    question: "Prothèse posée ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 83"
  },
  "Mastectomie partielle": {
    question: "Curage axillaire ?",
    options: { "Oui": "Céfazoline", "Non (ou ganglion sentinelle)": "Aucune" },
    source: "p. 57"
  },
  "Cholécystectomie": {
    question: "Laparotomie, ou patient à haut risque (> 80 ans, grossesse, immunosuppression, cholécystite aiguë récente, ictère, calcul de la VBP, prothèse, conversion, fuite biliaire) ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 81"
  },
  "Duodénopancréatectomie céphalique": {
    question: "Ampullome, ou drainage biliaire / sphinctérotomie préopératoire ?",
    options: { "Oui": "Pipéracilline-tazobactam", "Non": "Céfoxitine" },
    source: "p. 83"
  },
  "ERCP": {
    question: "Drainage biliaire complet ?",
    options: { "Oui": "Aucune", "Non (incomplet, ou cholangioscopie)": "Céfoxitine" },
    source: "p. 84"
  },
  "Pose de prothèse biliaire": {
    question: "Drainage biliaire complet ?",
    options: { "Oui": "Aucune", "Non (incomplet)": "Céfoxitine" },
    source: "p. 84"
  },
  "Biopsies de prostate": {
    question: "Voie d'abord ?",
    options: { "Transrectale": "Fosfomycine-trométamol", "Transpérinéale": "Aucune" },
    source: "p. 88"
  },
  "Rhinoplastie": {
    question: "Greffe de cartilage ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 58"
  },
  "Varices": {
    question: "Abord chirurgical du Scarpa ?",
    options: { "Oui": "Céfazoline", "Non": "Aucune" },
    source: "p. 50"
  }
};

const SIMPLE_PEROP_SPECIALITES = [
  "Endoscopie digestive",
  "ORL",
  "Ophtalmologie",
  "Cardiologie interventionnelle",
  "Radiologie interventionnelle"
];

const SIMPLE_PEROP_GESTES = [
  "Vertébroplastie",
  "Canal carpien",
  "Ostéosynthèse poignet",
  "Ostéosynthèse cheville",
  "Arthroscopie de genou",
  "Arthroscopie d'épaule",
  "Appendicectomie",
  "Cholécystectomie",
  "Hernie inguinale",
  "Hernie ombilicale",
  "Conisation",
  "Cerclage",
  "Nymphoplastie de réduction",
  "Biopsies de prostate",
  "REV",
  "URS + Laser",
  "Montée de JJ"
];

const CONTINUOUS_ALR = [
  "Bloc inter-scalénique",
  "Bloc fémoral",
  "Bloc saphène",
  "Bloc sciatique",
  "Bloc sciatique au creux poplité",
  "PENG bloc",
  "Bloc paravertébral",
  "Bloc érecteur du rachis"
];

const SMART_PRESETS = {

  "Cataracte": {
    monitorage: ["Scope", "SpO2", "VVP"],
    va: "Ventilation spontanée",
    entretien: "",
    induction: ["Midazolam"],
    reveil: ["Simples"]
  },

  "Electroconvulsivothérapie": {
    monitorage: ["Scope", "SpO2", "VVP"],
    induction: ["Propofol", "Célocurine"],
    reveil: ["Simples"]
  },

  "Œsophagectomie Lewis-Santy": {
    monitorage: ["Scope", "SpO2", "VVP", "KTA", "KTC", "BIS", "TOF"]
  },

  "Duodénopancréatectomie céphalique": {
    monitorage: ["Scope", "SpO2", "VVP", "KTA", "KTC", "BIS", "TOF"]
  },

  "Lobectomie pulmonaire": {
    monitorage: ["Scope", "SpO2", "VVP", "KTA", "KTC", "BIS", "TOF"]
  }

};

const ENDOSCOPY_GESTES = [
  "Gastroscopie",
  "Coloscopie",
  "RSF"
];
