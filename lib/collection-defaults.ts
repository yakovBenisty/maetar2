export interface CollectionDefault {
  group_by:        string[];
  subtopic_fields: string[];  // level 1: sub-topic grouping
  quantity_fields: string[];  // level 2: shown per institution
  compare_fields:  string[];  // level 3: detail fields (tariff, amount, etc.)
}

export const COLLECTION_DEFAULTS: Record<string, CollectionDefault> = {
  GY003: {
    group_by:        ['חודש_תחולה', 'קוד_נושא', 'תאור_תת_נושא'],
    subtopic_fields: ['תאור_תת_נושא'],
    quantity_fields: ['מספר_ילדים'],
    compare_fields:  ['עלות', 'אחוז', 'אחוז_הנחה', 'סכום_מחושב'],
  },
  GY019: {
    group_by:        ['חודש_תחולה', 'קוד_נושא', 'תאור_תת_נושא'],
    subtopic_fields: ['תאור_תת_נושא'],
    quantity_fields: ['ילדי_סטיה', 'מספר_ילדי_חובה', 'מספר_משרות_בגני_חובה'],
    compare_fields:  ['סכום_מחושב_קודם'],
  },
  GY033: {
    group_by:        ['חודש_תחולה', 'קוד_נושא', 'תאור_תת_נושא'],
    subtopic_fields: ['תאור_תת_נושא'],
    quantity_fields: [],
    compare_fields:  [],
  },
  SHARATIM: {
    group_by:        ['סמל_מוסד', 'חודש_תחולה', 'טווח_כיתות', 'קוד_נושא'],
    subtopic_fields: ['טווח_כיתות'],
    quantity_fields: ['מספר_יחידות', 'מספר_כיתות'],
    compare_fields:  ['סכום_מחושב'],
  },
  HASAOT: {
    group_by:        ['חודש_תחולה', 'קוד_נושא'],
    subtopic_fields: [],
    quantity_fields: ['ימי_הסעה'],
    compare_fields:  ['מקדם_התיקרות', 'מקדם_מימון', 'סכום_בסיס', 'סכום_מחושב'],
  },
  HASNET: {
    group_by:        ['נושא_תשלום'],
    subtopic_fields: [],
    quantity_fields: [],
    compare_fields:  [],
  },
  MUCARIM: {
    group_by:        ['חודש_תחולה', 'סמל_מוסד', 'קוד_נושא', 'סוג_נגררת', 'תאור_יחידה'],
    subtopic_fields: ['סוג_נגררת', 'תאור_יחידה'],
    quantity_fields: ['מספר_יחידות'],
    compare_fields:  ['עלות', 'סכום_מחושב'],
  },
  SHEFI: {
    group_by:        ['חודש_תחולה', 'קוד_נושא'],
    subtopic_fields: [],
    quantity_fields: ['מספר_משרות'],
    compare_fields:  ['אחוז_השתתפות', 'סכום_מחושב'],
  },
  YADANIIM: {
    group_by:        ['חודש_תחולה', 'קוד_נושא'],
    subtopic_fields: [],
    quantity_fields: ['סכום_מחושב'],
    compare_fields:  ['סיבת_תשלום'],
  },
};
