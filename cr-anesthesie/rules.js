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

const ANTIBIO_MAP = {
  "PTH": "Céfazoline",
  "PTG": "Céfazoline",
  "Ostéosynthèse cheville": "Céfazoline",
  "Ostéosynthèse poignet": "Céfazoline",
  "Recalibrage": "Céfazoline",
  "Canal carpien": "Aucune",
  "Hallux valgus": "Céfazoline",
  "Clou gamma": "Céfazoline",
  "Prothèse d'épaule": "Céfazoline",
  "Arthroscopie de genou": "Aucune",
  "Arthroscopie d'épaule": "Aucune",

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
  "Hystérectomie": "Céfazoline",
  "CHIP": "Céfoxitine",
  "Kystectomie ovarienne": "Céfazoline",
  "Segmentectomie hépatique": "Céfoxitine",

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
  "REV": "Céfazoline",
  "URS + Laser": "Céfazoline",
  "Montée de JJ": "Céfazoline",
  "Cystectomie totale": "Céfoxitine",

  "Septoplastie": "Aucune",
  "Rhinoplastie": "Aucune",
  "Thyroïdectomie totale": "Aucune",
  "Thyroïdectomie partielle": "Aucune",
  "Extraction DDS": "Amoxicilline / Acide clavulanique",
  "Carcinome cutané": "Aucune",
  "Cholestéatome": "Aucune",
  "Adénoidectomie": "Aucune",
  "DTT": "Aucune",
  "Turbinoplastie": "Aucune",
  "Adénoamygdalectomie": "Aucune",

  "Varices": "Aucune",
  "Cataracte": "Céfuroxime",
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
  "Céfuroxime": ""
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
