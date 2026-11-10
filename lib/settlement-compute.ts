import { ObjectId } from 'mongodb';
import { getDb } from './mongo';
import { getActiveParams } from './project-params';
import { calculateSettlement, type SettlementBreakdown } from './settlement';
import { getIncomeBreakdown } from './income-matching';
import type { ExpenseKind } from '@/app/api/expenses/mappings/route';

export interface ProjectStatus {
  project: {
    _id: string;
    name: string;
    budget_year: string;
    model: string;
    status: string;
    noseme_codes: string[];
  };
  breakdown: SettlementBreakdown;
}

async function sumExpenseKind(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  kind: ExpenseKind
): Promise<number> {
  const result = await db
    .collection('EXPENSE_ENTRIES')
    .aggregate([
      { $match: { project_id: projectId, kind } },
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
  // ייבוא ה-CSV (lib/import-engine.ts) הופך ערכים מספריים כמו "631" למספר Mongo אמיתי —
  // קוד_נושא עשוי להיות שמור כמחרוזת או כמספר, לכן תואמים לשתי הצורות.
  const nosemeCodeVariants = nosemeCodes.flatMap((c) => {
    const n = Number(c);
    return Number.isFinite(n) ? [c, n] : [c];
  });

  const [incomeAgg, unmatchedAdvances, operatorExpensesTotal, rashutExpensesTotal, reservationsTotal, parentPaymentsTotal, allRuns, params] =
    await Promise.all([
      nosemeCodes.length
        ? db
            .collection('CHESHBONIT')
            .aggregate([
              {
                $match: {
                  קוד_נושא: { $in: nosemeCodeVariants },
                  חודש_תחולה: { $gte: project.date_from, $lte: project.date_to },
                },
              },
              { $group: { _id: null, total: { $sum: '$יתרת_ביצוע_החודש' } } },
            ])
            .toArray()
        : Promise.resolve([]),
      // מקדמות ב-YADANIIM שלא קיבלו שורה חיובית מקבילה ב-CHESHBONIT — ההכנסה
      // הזו מעולם לא נספרה ב-יתרת_ביצוע_החודש, ולכן מתווספת בנפרד (ראו lib/income-matching.ts).
      getIncomeBreakdown(nosemeCodes, project.date_from, project.date_to),
      sumExpenseKind(db, projectId, 'operator_expense'),
      project.model === 'joint' ? sumExpenseKind(db, projectId, 'rashut_expense') : Promise.resolve(0),
      sumExpenseKind(db, projectId, 'reservation'),
      sumExpenseKind(db, projectId, 'parent_payment'),
      db
        .collection('SETTLEMENT_RUNS')
        .find({ project_id: projectId }, { projection: { source: 1, paid_total: 1 } })
        .toArray(),
      getActiveParams(projectId),
    ]);

  // paid_total בדוחות legacy_import הוא "שולם מצטבר עד לאותו תאריך" כפי שדווח
  // בגיליון המקור (לא תוספתי בין דוחות) — סכימה שלו עם שאר הדוחות ההיסטוריים
  // תספור את אותו סכום פעמים רבות. "שולם מצטבר" רק גדל עם הזמן, לכן לוקחים
  // את המקסימום מביניהם כ"נקודת הפתיחה", ומוסיפים לו רק את מה ששולם בפועל
  // בדוחות החיים (שם paid_total הוא אכן תוספתי per-דוח, כמתוכנן).
  const legacyPaidTotal = allRuns
    .filter((r) => r.source === 'legacy_import')
    .reduce((max, r) => Math.max(max, Number(r.paid_total) || 0), 0);
  const livePaidTotal = allRuns
    .filter((r) => r.source !== 'legacy_import')
    .reduce((sum, r) => sum + (Number(r.paid_total) || 0), 0);

  const breakdown = calculateSettlement(
    {
      incomeTotal: (incomeAgg[0]?.total ?? 0) + unmatchedAdvances.unmatchedAdvanceTotal,
      rashutExpensesTotal,
      operatorExpensesTotal,
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
    },
    breakdown,
  };
}
