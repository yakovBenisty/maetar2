import { getDb } from './mongo';

export interface YadaniimAdvanceRow {
  _id: string;
  code: string;
  calcMonth: string | null;
  tachMonth: string | null;
  amount: number;
  reason: string | null;
  matched: boolean;
}

export interface CheshbonitAdvanceRow {
  _id: string;
  code: string;
  calcMonth: string | null;
  tachMonth: string | null;
  amount: number;
  isDeduction: boolean;
}

function codeVariants(codes: string[]): (string | number)[] {
  return codes.flatMap((c) => {
    const n = Number(c);
    return Number.isFinite(n) ? [c, n] : [c];
  });
}

function monthKey(d: unknown): string | null {
  if (!(d instanceof Date)) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * מקדמות שמופיעות ב-YADANIIM (סוג_תשלום מכיל "מקדמה") ואין להן שורה חיובית
 * מקבילה ב-CHESHBONIT (אותו קוד נושא + אותה תחולה + סכום תואם, הערות "מקדמה"
 * שאינה "ניכוי מקדמה") — כלומר ההכנסה הזו מעולם לא נספרה ב-CHESHBONIT, ולכן
 * יש להוסיף אותה בנפרד לחישוב ההכנסה (ראו docs/implementation_notes.md).
 */
export async function getIncomeBreakdown(
  noseCodes: string[],
  dateFrom?: Date,
  dateTo?: Date
): Promise<{
  cheshbonitRows: CheshbonitAdvanceRow[];
  yadaniimRows: YadaniimAdvanceRow[];
  unmatchedAdvanceTotal: number;
  manualAdvanceTotal: number;
}> {
  if (noseCodes.length === 0) return { cheshbonitRows: [], yadaniimRows: [], unmatchedAdvanceTotal: 0, manualAdvanceTotal: 0 };

  const db = await getDb();
  const variants = codeVariants(noseCodes);
  const tachulaFilter = dateFrom && dateTo ? { חודש_תחולה: { $gte: dateFrom, $lte: dateTo } } : {};

  const cheshDocs = await db
    .collection('CHESHBONIT')
    .find({ קוד_נושא: { $in: variants }, הערות: { $regex: 'מקדמה' }, ...tachulaFilter })
    .toArray();

  const yadDocs = await db
    .collection('YADANIIM')
    .find({ קוד_נושא: { $in: variants }, סוג_תשלום: { $regex: 'מקדמה' }, ...tachulaFilter })
    .toArray();

  const cheshbonitRows: CheshbonitAdvanceRow[] = cheshDocs.map((d) => ({
    _id: String(d._id),
    code: String(d.קוד_נושא),
    calcMonth: monthKey(d.חודש_חישוב),
    tachMonth: monthKey(d.חודש_תחולה),
    amount: Number(d.יתרת_ביצוע_החודש) || 0,
    isDeduction: typeof d.הערות === 'string' && d.הערות.includes('ניכוי'),
  }));

  // רשומות חיוביות בלבד (לא "ניכוי מקדמה") משמשות כ"כבר נספר" להתאמה.
  const positiveCheshByKey = new Map<string, number[]>();
  for (const r of cheshbonitRows) {
    if (r.isDeduction || r.tachMonth == null) continue;
    const key = `${r.code}|${r.tachMonth}`;
    (positiveCheshByKey.get(key) ?? positiveCheshByKey.set(key, []).get(key)!).push(Math.abs(r.amount));
  }

  const EPSILON = 1; // סף התאמה (₪) לבדיקת סכום תואם, לאחר עיגולים
  const yadaniimRows: YadaniimAdvanceRow[] = yadDocs.map((d) => {
    const code = String(d.קוד_נושא);
    const tachMonth = monthKey(d.חודש_תחולה);
    const amount = Number(d.סכום_מחושב) || 0;
    const key = `${code}|${tachMonth}`;
    const candidates = positiveCheshByKey.get(key) ?? [];
    const matched = candidates.some((c) => Math.abs(c - Math.abs(amount)) <= EPSILON);
    return {
      _id: String(d._id),
      code,
      calcMonth: monthKey(d.חודש_חישוב),
      tachMonth,
      amount,
      reason: d.סיבת_תשלום ?? d.סוג_תשלום ?? null,
      matched,
    };
  });

  const unmatchedAdvanceTotal = yadaniimRows.filter((r) => !r.matched).reduce((sum, r) => sum + r.amount, 0);

  // גיליונות ההתחשבנות מוסיפים להכנסה את כל שורות "מקדמה ידנית" (SUMIFS לפי סוג_תשלום),
  // בלי תנאי התאמה — זה הסכום שנכנס לחישוב; סימון ה"תואם" נשאר להצגה/ביקורת בלבד.
  const manualAdvanceTotal = yadDocs
    .filter((d) => String(d.סוג_תשלום ?? '').trim() === 'מקדמה ידנית')
    .reduce((sum, d) => sum + (Number(d.סכום_מחושב) || 0), 0);

  return { cheshbonitRows, yadaniimRows, unmatchedAdvanceTotal, manualAdvanceTotal };
}
