// מנוע חישוב ההתחשבנות מול מפעיל — PRD: docs/PRD-hotzaot-hitchashvenut-mafil.md סעיף 4.
//
// החישוב הוא "מצטבר עד היום" ולא תוספתי בין דוחות: כל דוח מחושב מחדש מכל
// נתוני ההכנסה/הוצאה/קיזוז שנטענו לפרויקט עד כה, בניכוי סך כל מה ששולם
// בפועל בכל הדוחות הקודמים לאותו פרויקט. זה שקול מתמטית ל"יתרת פתיחה
// עוברת לדוח הבא" (ה-PRD), בלי הצורך לפצל נתונים בין תקופות דוח — תואם גם
// לכך שהפקת דוח אינה כבולה לתקופה קבועה.

export interface SettlementParams {
  overheadPct: number; // אחוז תקורה, כשבר עשרוני (0.12 = 12%)
  advancePct: number; // אחוז מקדמה, כשבר עשרוני
  // התפלגות תקציב בהפעלה משותפת (אופציונלי) — "רצפה" לחלק הרשות, לא תחליף
  // להוצאות רשות בפועל: אם החלק המוצהר (אחוז מההכנסה, או סכום קבוע) גדול
  // מהוצאות הרשות שנטענו בפועל, הוא גובר; אם ההוצאות בפועל גבוהות ממנו, הן גוברות.
  rashutSplitType?: 'percentage' | 'fixed';
  rashutSplitValue?: number; // אחוז כשבר עשרוני (0.3 = 30%), או סכום קבוע אם fixed
}

export interface SettlementInputTotals {
  // סה"כ התקבל ברשות: נושאי "זכות" ב-CHESHBONIT (לפי קודי נושא + תחולה) + מקדמות ידניות מ-YADANIIM.
  incomeTotal: number;
  // נושאי "חובה" (למשל 633 — ניצנים הזנה): המשרד מקזז אותם ישירות מהתשלום. בגיליונות
  // ההתחשבנות הם מוצגים כהוצאת רשות ("ניצנים הזנה") ולא כהפחתת הכנסה — כך גם כאן.
  ministryDeductionsTotal?: number;
  rashutExpensesTotal: number; // הוצאות רשות שנטענו למערכת (ללא קיזוזי המשרד)
  operatorExpensesTotal: number; // הוצאות מפעיל בפועל שעליהן מחושבת תקורה
  // ביצוע מפעיל שכבר כולל תקורה (יתרת פתיחה שהועברה מגיליון ההתחשבנות) — לא מחושבת עליו תקורה נוספת.
  operatorExecutionOpeningTotal?: number;
  reservationsTotal: number; // שיריונים
  parentPaymentsTotal: number; // כספי הורים
  previouslyPaidTotal: number; // סה"כ ששולם בפועל בכל הדוחות הקודמים לפרויקט זה
}

export interface SettlementBreakdown extends SettlementInputTotals {
  ministryDeductionsTotal: number;
  operatorExecutionOpeningTotal: number;
  operatorBudget: number; // תקציב הפעלה למפעיל = הכנסה - חלק הרשות האפקטיבי
  rashutShareEffective: number; // חלק הרשות הכולל שנוכה מההכנסה: קיזוזי משרד + max(הוצאות רשות שנטענו, החלק המוצהר)
  rashutSplitType?: 'percentage' | 'fixed';
  rashutSplitValue?: number;
  overheadPct: number;
  overheadAmount: number;
  advancePct: number;
  advanceAmount: number;
  executionTotal: number; // סה"כ לתשלום בגין ביצוע ותקורה (כולל יתרת פתיחה)
  receivablePending: number; // "כספים שעדיין לא התקבלו": ביצוע שחורג מתקציב ההפעלה — לא משולם עד שיתקבל תקציב
  calculatedTotal: number; // יתרה לתשלום למפעיל בדוח הנוכחי
  operatorBudgetIsNegative: boolean; // תקציב הפעלה שלילי — מצריך התרעה במסך, לא חסימה
}

export function calculateSettlement(
  totals: SettlementInputTotals,
  params: SettlementParams
): SettlementBreakdown {
  const ministryDeductionsTotal = totals.ministryDeductionsTotal ?? 0;
  const operatorExecutionOpeningTotal = totals.operatorExecutionOpeningTotal ?? 0;

  // החלק המוצהר של הרשות (אחוז, או סכום קבוע) הוא "רצפה" להוצאות הרשות עצמה — מעבר
  // לקיזוזי המשרד. אחוז מחושב מההכנסה נטו (אחרי קיזוזי המשרד).
  const declaredRashutShare =
    params.rashutSplitType === 'fixed'
      ? (params.rashutSplitValue ?? 0)
      : params.rashutSplitType === 'percentage'
        ? (params.rashutSplitValue ?? 0) * (totals.incomeTotal - ministryDeductionsTotal)
        : 0;
  const rashutShareEffective = ministryDeductionsTotal + Math.max(totals.rashutExpensesTotal, declaredRashutShare);

  const operatorBudget = totals.incomeTotal - rashutShareEffective;
  const overheadAmount = params.overheadPct * totals.operatorExpensesTotal;
  const executionTotal = operatorExecutionOpeningTotal + totals.operatorExpensesTotal + overheadAmount;

  // נוסחאות גיליון ההתחשבנות ("סיכום דוח"):
  //   מקדמה = אחוז המקדמה × יתרת התקציב שטרם בוצעה  (=IF((תקציב-ביצוע)>1,(תקציב-ביצוע)*אחוז,0))
  //   כספים שלא התקבלו = MAX(ביצוע - כספי הורים - תקציב, 0)
  const unexecutedBudget = operatorBudget - executionTotal;
  const advanceAmount = unexecutedBudget > 1 ? params.advancePct * unexecutedBudget : 0;
  const receivablePending = Math.max(executionTotal - totals.parentPaymentsTotal - operatorBudget, 0);

  const calculatedTotal =
    executionTotal +
    advanceAmount -
    totals.reservationsTotal -
    totals.parentPaymentsTotal -
    receivablePending -
    totals.previouslyPaidTotal;

  return {
    ...totals,
    ministryDeductionsTotal,
    operatorExecutionOpeningTotal,
    operatorBudget,
    rashutShareEffective,
    rashutSplitType: params.rashutSplitType,
    rashutSplitValue: params.rashutSplitValue,
    overheadPct: params.overheadPct,
    overheadAmount,
    advancePct: params.advancePct,
    advanceAmount,
    executionTotal,
    receivablePending,
    calculatedTotal,
    operatorBudgetIsNegative: operatorBudget < 0,
  };
}
