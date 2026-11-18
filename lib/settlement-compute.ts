import { ObjectId } from 'mongodb';
import { getDb } from './mongo';
import { getActiveParams } from './project-params';
import { calculateSettlement, type SettlementBreakdown } from './settlement';
import { getIncomeBreakdown } from './income-matching';
import { resolveTopicFiles, getDetailTotals, getInvoiceTotalsByTopic } from './income-detail';
import type { ExpenseKind } from '@/app/api/expenses/mappings/route';

export interface ProjectStatus {
  project: {
    _id: string;
    name: string;
    budget_year: string;
    model: string;
    status: string;
    noseme_codes: string[];
    mosad_codes: string[];
  };
  breakdown: SettlementBreakdown;
  incomeInfo: IncomeInfo;
}

export interface IncomeInfo {
  /** all = חשבוניות + מקדמות ידניות (כל המוסדות); institutions = מהקבצים המפורטים, למוסדות שנבחרו */
  mode: 'all' | 'institutions';
  mosadCount: number;
  /** נושאים שאין להם נתון לפי מוסד — ההכנסה שלהם לא נכללת; מוצג רק סכום כללי מהחשבוניות */
  unavailableTopics: { code: string; file: string | null; generalInvoiceTotal: number }[];
}

async function sumExpenseKind(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  kind: ExpenseKind,
  overheadIncluded?: boolean
): Promise<number> {
  // overhead_included מסמן שורת יתרת פתיחה שסכומה כבר כולל תקורה (ראו lib/settlement.ts).
  const flagFilter =
    overheadIncluded === undefined ? {} : overheadIncluded ? { overhead_included: true } : { overhead_included: { $ne: true } };
  const result = await db
    .collection('EXPENSE_ENTRIES')
    .aggregate([
      { $match: { project_id: projectId, kind, ...flagFilter } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
    .toArray();
  return result[0]?.total ?? 0;
}

/** מחשב "חי" (ללא שמירה) את מצב ההתחשבנות הנוכחי של פרויקט, כולל סך כל מה ששולם עד כה. */
export async function computeProjectStatus(projectId: string): Promise<ProjectStatus> {
  const db = await getDb();
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(projectId) });
  if (!project) throw new Error('פרויקט לא נמצא');

  const nosemeCodes = (project.noseme_codes ?? []) as string[];
  const mosadCodes = ((project.mosad_codes ?? []) as string[]).map(String);
  const byInstitution = mosadCodes.length > 0;
  // ייבוא ה-CSV (lib/import-engine.ts) הופך ערכים מספריים כמו "631" למספר Mongo אמיתי —
  // קוד_נושא עשוי להיות שמור כמחרוזת או כמספר, לכן תואמים לשתי הצורות.
  const nosemeCodeVariants = nosemeCodes.flatMap((c) => {
    const n = Number(c);
    return Number.isFinite(n) ? [c, n] : [c];
  });

  const [incomeByCode, nosemeDocs, advances, operatorExpensesTotal, operatorExecutionOpeningTotal, rashutExpensesTotal, reservationsTotal, parentPaymentsTotal, allRuns, params] =
    await Promise.all([
      nosemeCodes.length && !byInstitution
        ? db
            .collection('CHESHBONIT')
            .aggregate([
              {
                $match: {
                  קוד_נושא: { $in: nosemeCodeVariants },
                  חודש_תחולה: { $gte: project.date_from, $lte: project.date_to },
                },
              },
              { $group: { _id: '$קוד_נושא', total: { $sum: '$יתרת_ביצוע_החודש' } } },
            ])
            .toArray()
        : Promise.resolve([]),
      db.collection('NOSEME').find({ code: { $in: nosemeCodes } }, { projection: { code: 1, direction: 1 } }).toArray(),
      // מקדמות ידניות ב-YADANIIM לא מופיעות כשורה חיובית ב-CHESHBONIT, ולכן מתווספות
      // להכנסה בנפרד — בדיוק כמו בגיליונות ההתחשבנות (ראו lib/income-matching.ts).
      byInstitution
        ? Promise.resolve({ cheshbonitRows: [], yadaniimRows: [], unmatchedAdvanceTotal: 0, manualAdvanceTotal: 0 })
        : getIncomeBreakdown(nosemeCodes, project.date_from, project.date_to),
      sumExpenseKind(db, projectId, 'operator_expense', false),
      sumExpenseKind(db, projectId, 'operator_expense', true),
      project.model === 'joint' ? sumExpenseKind(db, projectId, 'rashut_expense') : Promise.resolve(0),
      sumExpenseKind(db, projectId, 'reservation'),
      sumExpenseKind(db, projectId, 'parent_payment'),
      db
        .collection('SETTLEMENT_RUNS')
        .find({ project_id: projectId }, { projection: { source: 1, paid_total: 1, snapshot_date: 1, created_at: 1 } })
        .toArray(),
      getActiveParams(projectId),
    ]);

  // נושא שמוגדר "חובה" בטבלת הנושאים (למשל 633 — ניצנים הזנה) הוא קיזוז של המשרד ולא
  // הכנסה: סכומו (שלילי בחשבוניות) מוצג כהוצאת רשות, כמו בגיליון, ולא מפחית את ההכנסה.
  const debitCodes = new Set(nosemeDocs.filter((n) => n.direction === 'חובה').map((n) => String(n.code)));
  let creditIncome = 0;
  let ministryDeductionsTotal = 0;
  for (const row of incomeByCode) {
    if (debitCodes.has(String(row._id))) ministryDeductionsTotal -= row.total;
    else creditIncome += row.total;
  }

  // נבחרו מוסדות: החשבוניות מרכזות את כל המוסדות, ולכן ההכנסה נלקחת מהקובץ המפורט של כל
  // נושא (לפי מיפוי הנושאים), מסוננת למוסדות. נושא ללא פירוט לפי מוסד — "אין נתון": לא נכלל.
  const incomeInfo: IncomeInfo = { mode: byInstitution ? 'institutions' : 'all', mosadCount: mosadCodes.length, unavailableTopics: [] };
  if (byInstitution && nosemeCodes.length) {
    const topicFiles = await resolveTopicFiles(db, nosemeCodes);
    const totals = await getDetailTotals(db, topicFiles, project.date_from, project.date_to, mosadCodes);
    const unavailable = totals.filter((t) => t.total === null);
    const invoiceTotals = unavailable.length ? await getInvoiceTotalsByTopic(db, unavailable.map((t) => t.code), project.date_from, project.date_to) : new Map<string, number>();
    for (const t of totals) {
      if (t.total === null) continue;
      if (debitCodes.has(t.code)) ministryDeductionsTotal -= t.total;
      else creditIncome += t.total;
    }
    incomeInfo.unavailableTopics = unavailable.map((t) => ({ code: t.code, file: t.file, generalInvoiceTotal: invoiceTotals.get(t.code) ?? 0 }));
  }

  // paid_total בדוחות legacy_import הוא "שולם מצטבר עד לאותו תאריך" כפי שדווח בגיליון
  // המקור (לא תוספתי בין דוחות), ולכן אסור לסכום אותו על פני הסנאפשוטים. הוא גם לא
  // בהכרח עולה עם הזמן (בגיליונות יש תיקונים והחזרים), ולכן "נקודת הפתיחה" היא הסכום
  // שבסנאפשוט ההיסטורי האחרון. לזה מתווסף מה ששולם בדוחות החיים (שם paid_total תוספתי).
  const time = (r: Record<string, unknown>) =>
    new Date((r.snapshot_date ?? r.created_at ?? 0) as string | number | Date).getTime();
  const latestLegacy = allRuns
    .filter((r) => r.source === 'legacy_import')
    .reduce<(typeof allRuns)[number] | null>((latest, r) => (!latest || time(r) >= time(latest) ? r : latest), null);
  const legacyPaidTotal = Number(latestLegacy?.paid_total) || 0;
  const livePaidTotal = allRuns
    .filter((r) => r.source !== 'legacy_import')
    .reduce((sum, r) => sum + (Number(r.paid_total) || 0), 0);

  const breakdown = calculateSettlement(
    {
      incomeTotal: creditIncome + advances.manualAdvanceTotal,
      ministryDeductionsTotal,
      rashutExpensesTotal,
      operatorExpensesTotal,
      operatorExecutionOpeningTotal,
      reservationsTotal,
      parentPaymentsTotal,
      previouslyPaidTotal: legacyPaidTotal + livePaidTotal,
    },
    params
  );

  return {
    project: {
      _id: String(project._id),
      name: project.name,
      budget_year: project.budget_year,
      model: project.model,
      status: project.status,
      noseme_codes: nosemeCodes,
      mosad_codes: mosadCodes,
    },
    breakdown,
    incomeInfo,
  };
}
