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
}

export interface SettlementInputTotals {
  incomeTotal: number; // סה"כ הכנסה ממשרד החינוך (CHESHBONIT.יתרת_ביצוע_החודש, לפי קודי נושא+טווח תאריכים)
  rashutExpensesTotal: number; // הוצאות רשות (רק בהפעלה משותפת)
  operatorExpensesTotal: number; // הוצאות מפעיל בפועל
  reservationsTotal: number; // שיריונים
  parentPaymentsTotal: number; // כספי הורים
  previouslyPaidTotal: number; // סה"כ ששולם בפועל בכל הדוחות הקודמים לפרויקט זה
}

export interface SettlementBreakdown extends SettlementInputTotals {
  operatorBudget: number; // תקציב הפעלה למפעיל = הכנסה - הוצאות רשות
  overheadPct: number;
  overheadAmount: number;
  advancePct: number;
  advanceAmount: number;
  calculatedTotal: number; // יתרה לתשלום למפעיל בדוח הנוכחי
  operatorBudgetIsNegative: boolean; // תקציב הפעלה שלילי — מצריך התרעה במסך, לא חסימה
}

export function calculateSettlement(
  totals: SettlementInputTotals,
  params: SettlementParams
): SettlementBreakdown {
  const operatorBudget = totals.incomeTotal - totals.rashutExpensesTotal;
  const overheadAmount = params.overheadPct * totals.operatorExpensesTotal;
  const advanceAmount = params.advancePct * operatorBudget;

  const calculatedTotal =
    totals.operatorExpensesTotal +
    overheadAmount +
    advanceAmount -
    totals.reservationsTotal -
    totals.parentPaymentsTotal -
    totals.previouslyPaidTotal;

  return {
    ...totals,
    operatorBudget,
    overheadPct: params.overheadPct,
    overheadAmount,
    advancePct: params.advancePct,
    advanceAmount,
    calculatedTotal,
    operatorBudgetIsNegative: operatorBudget < 0,
  };
}
