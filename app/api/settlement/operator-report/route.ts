import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';
import { computeProjectStatus, type ProjectStatus } from '@/lib/settlement-compute';

/**
 * דוח מפעיל מאוחד (PRD 4, 95): כל הפרויקטים של מפעיל אחד + סכום מאוחד.
 * קיזוז תשלום עודף בפרויקט אחד מתבצע באופן טבעי ע"י חיבור calculatedTotal
 * (שיכול להיות שלילי) על פני כל הפרויקטים — אין צורך בלוגיקת קיזוז נפרדת.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const requestedEmail = req.nextUrl.searchParams.get('operator_email');
  let operatorEmail: string;
  if (role === 'operator') {
    operatorEmail = session?.user?.email ?? '';
  } else if (canManageSettlement(role) && requestedEmail) {
    operatorEmail = requestedEmail;
  } else {
    return NextResponse.json({ error: 'חסר operator_email' }, { status: 400 });
  }

  const db = await getDb();
  const projects = await db
    .collection('PROJECTS')
    .find({ operator_emails: operatorEmail, status: { $ne: 'locked' } })
    .sort({ budget_year: -1, name: 1 })
    .toArray();

  const rows: ProjectStatus[] = await Promise.all(
    projects.map((p) => computeProjectStatus(String(p._id)))
  );

  const totalBalance = rows.reduce((sum, r) => sum + r.breakdown.calculatedTotal, 0);

  return NextResponse.json({ operatorEmail, rows, totalBalance });
}
