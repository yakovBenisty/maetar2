import type { Db } from 'mongodb';

// הכנסה לפי מוסד: חשבוניות (CHESHBONIT) מרכזות את כל המוסדות יחד, ולכן כשבפרויקט נבחרו
// מוסדות ההכנסה נלקחת מהקובץ המפורט שבו הנושא מדווח (לפי מיפוי הנושאים, TOPIC_CONFIG).

/** קבצים שיש בהם סמל מוסד ושדה הפרש_מחושב — רק מהם אפשר לגזור הכנסה לפי מוסד. */
export const INSTITUTION_FILES = new Set(['MUCARIM', 'SHARATIM']);
/** קבצים שיש בהם קוד נושא והפרש_מחושב — מספיק כדי להשוות סכום כללי מול החשבוניות. */
const AMOUNT_FILES = new Set(['MUCARIM', 'SHARATIM', 'MUTAVIM', 'HASAOT', 'MOADON', 'SHEFI', 'GY019']);
const AUTO_CANDIDATES = ['MUCARIM', 'MUTAVIM', 'SHARATIM', 'HASAOT', 'MOADON', 'SHEFI', 'GY019'];

export interface TopicFile {
  code: string;
  file: string | null;
  source: 'mapping' | 'auto' | 'none';
  /** אפשר לסנן את הקובץ לפי מוסד */
  institutionLevel: boolean;
  /** בקובץ יש סכום ברמת נושא (הפרש_מחושב) להשוואה מול החשבוניות */
  hasAmounts: boolean;
}

export interface DetailTopicTotal extends TopicFile {
  /** null = אין נתון (אין קובץ מפורט, או שאי אפשר לסנן אותו לפי מוסד) */
  total: number | null;
}

export interface InstitutionRow {
  code: string;
  mosadCode: string;
  mosadName: string;
  total: number;
  rows: number;
}

export const variants = (values: string[]): (string | number)[] =>
  values.flatMap((v) => {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== '' ? [v, n] : [v];
  });

const AUTO_TTL_MS = 10 * 60 * 1000;
const autoCache = new Map<string, { at: number; file: string | null }>();

/** באיזה קובץ מפורט כל נושא מדווח: לפי TOPIC_CONFIG, ואם אין שם — זיהוי לפי הקובץ שבו הנושא מופיע בפועל. */
export async function resolveTopicFiles(db: Db, codes: string[]): Promise<TopicFile[]> {
  if (codes.length === 0) return [];
  const configs = await db
    .collection('TOPIC_CONFIG')
    .find({ code: { $in: codes } }, { projection: { code: 1, check_collection: 1 } })
    .toArray();
  const configured = new Map(configs.map((c) => [String(c.code), c.check_collection ? String(c.check_collection) : null]));

  const out: TopicFile[] = [];
  for (const code of codes) {
    let file = configured.get(code) ?? null;
    let source: TopicFile['source'] = file ? 'mapping' : 'none';

    if (!file) {
      const cached = autoCache.get(code);
      if (cached && Date.now() - cached.at < AUTO_TTL_MS) {
        file = cached.file;
      } else {
        for (const candidate of AUTO_CANDIDATES) {
          const hit = await db.collection(candidate).findOne({ קוד_נושא: { $in: variants([code]) } }, { projection: { _id: 1 } });
          if (hit) { file = candidate; break; }
        }
        autoCache.set(code, { at: Date.now(), file });
      }
      source = file ? 'auto' : 'none';
    }

    out.push({
      code,
      file,
      source,
      institutionLevel: !!file && INSTITUTION_FILES.has(file),
      hasAmounts: !!file && AMOUNT_FILES.has(file),
    });
  }
  return out;
}

/** סכום הפרש_מחושב לכל נושא בטווח התחולה. עם mosadCodes — רק למוסדות אלה, ורק בקבצים שמפרטים לפי מוסד. */
export async function getDetailTotals(
  db: Db,
  topics: TopicFile[],
  from: Date,
  to: Date,
  mosadCodes?: string[]
): Promise<DetailTopicTotal[]> {
  const filterByMosad = !!mosadCodes && mosadCodes.length > 0;
  const result: DetailTopicTotal[] = [];

  for (const t of topics) {
    if (!t.file || !t.hasAmounts || (filterByMosad && !t.institutionLevel)) {
      result.push({ ...t, total: null });
      continue;
    }
    const match: Record<string, unknown> = {
      קוד_נושא: { $in: variants([t.code]) },
      חודש_תחולה: { $gte: from, $lte: to },
    };
    if (filterByMosad) match.סמל_מוסד = { $in: variants(mosadCodes!) };

    const agg = await db
      .collection(t.file)
      .aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$הפרש_מחושב' } } }])
      .toArray();
    result.push({ ...t, total: agg[0]?.total ?? 0 });
  }
  return result;
}

/** פירוט לפי נושא × מוסד, למוסדות שנבחרו, מהקבצים שמפרטים לפי מוסד. */
export async function getInstitutionRows(
  db: Db,
  topics: TopicFile[],
  from: Date,
  to: Date,
  mosadCodes: string[]
): Promise<InstitutionRow[]> {
  const rows: InstitutionRow[] = [];
  for (const t of topics) {
    if (!t.file || !t.institutionLevel) continue;
    const agg = await db
      .collection(t.file)
      .aggregate([
        {
          $match: {
            קוד_נושא: { $in: variants([t.code]) },
            חודש_תחולה: { $gte: from, $lte: to },
            סמל_מוסד: { $in: variants(mosadCodes) },
          },
        },
        { $group: { _id: '$סמל_מוסד', name: { $first: '$שם_מוסד' }, total: { $sum: '$הפרש_מחושב' }, rows: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    for (const r of agg) {
      rows.push({ code: t.code, mosadCode: String(r._id), mosadName: r.name ? String(r.name) : '', total: r.total ?? 0, rows: r.rows ?? 0 });
    }
  }
  return rows;
}

/** סכום כללי של חשבוניות (כל המוסדות) לכל נושא בטווח התחולה — להצגה ליד "אין נתון פר מוסד". */
export async function getInvoiceTotalsByTopic(db: Db, codes: string[], from: Date, to: Date): Promise<Map<string, number>> {
  const agg = await db
    .collection('CHESHBONIT')
    .aggregate([
      { $match: { קוד_נושא: { $in: variants(codes) }, חודש_תחולה: { $gte: from, $lte: to } } },
      { $group: { _id: '$קוד_נושא', total: { $sum: '$יתרת_ביצוע_החודש' } } },
    ])
    .toArray();
  const map = new Map<string, number>();
  for (const r of agg) map.set(String(r._id), (map.get(String(r._id)) ?? 0) + (r.total ?? 0));
  return map;
}

/** סכום מקדמות "מקדמה ידנית" (ידניים) לכל נושא בטווח התחולה, כל המוסדות. */
export async function getManualAdvanceByTopic(db: Db, codes: string[], from: Date, to: Date): Promise<Map<string, number>> {
  const agg = await db
    .collection('YADANIIM')
    .aggregate([
      {
        $match: {
          קוד_נושא: { $in: variants(codes) },
          סוג_תשלום: 'מקדמה ידנית',
          חודש_תחולה: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$קוד_נושא', total: { $sum: '$סכום_מחושב' } } },
    ])
    .toArray();
  const map = new Map<string, number>();
  for (const r of agg) map.set(String(r._id), (map.get(String(r._id)) ?? 0) + (r.total ?? 0));
  return map;
}
