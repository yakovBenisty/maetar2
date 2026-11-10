import type { Session } from 'next-auth';

export type SettlementRole = 'admin' | 'program_manager' | 'operator';

/**
 * גישה למודול ההתחשבנות: admin/program_manager = "מנהל תוכנית" (גישה מלאה),
 * operator = "מפעיל" (מוגבל לפרויקטים שהוקצו לו לפי מייל). תפקיד 'user' הרגיל
 * אינו מקבל גישה — זהו מודול כספי רגיש יותר משאר המערכת. 'super_admin' מקבל
 * את כל הרשאות ה-admin (ראו isSuperAdmin לגבי ההרשאה הנוספת שלו).
 */
export function getSettlementRole(session: Session | null): SettlementRole | null {
  const role = session?.user?.role;
  if (role === 'super_admin') return 'admin';
  if (role === 'admin' || role === 'program_manager' || role === 'operator') return role;
  return null;
}

export function canManageSettlement(role: SettlementRole | null): boolean {
  return role === 'admin' || role === 'program_manager';
}

/**
 * "מנהל על" — תפקיד יחיד מעל admin, שהוא היחיד שיכול לערוך/למחוק רשומות
 * פרמטרים (PROJECT_PARAMS) שכבר נוספו. ברירת המחדל במערכת היא היסטוריה
 * שלא נערכת רטרואקטיבית (ראו PRD) — זו חריגת-תיקון מכוונת, מוגבלת בכוונה
 * לתפקיד אחד בלבד.
 */
export function isSuperAdmin(session: Session | null): boolean {
  return session?.user?.role === 'super_admin';
}
