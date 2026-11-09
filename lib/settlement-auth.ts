import type { Session } from 'next-auth';

export type SettlementRole = 'admin' | 'program_manager' | 'operator';

/**
 * גישה למודול ההתחשבנות: admin/program_manager = "מנהל תוכנית" (גישה מלאה),
 * operator = "מפעיל" (מוגבל לפרויקטים שהוקצו לו לפי מייל). תפקיד 'user' הרגיל
 * אינו מקבל גישה — זהו מודול כספי רגיש יותר משאר המערכת.
 */
export function getSettlementRole(session: Session | null): SettlementRole | null {
  const role = session?.user?.role;
  if (role === 'admin' || role === 'program_manager' || role === 'operator') return role;
  return null;
}

export function canManageSettlement(role: SettlementRole | null): boolean {
  return role === 'admin' || role === 'program_manager';
}
