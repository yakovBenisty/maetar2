import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';
import { computeProjectStatus, type ProjectStatus } from '@/lib/settlement-compute';

/** לוח ריכוז חוצה-נושאים (PRD 5.7) — מצב כל הפרויקטים הפתוחים, מחושב חי מהנתונים הקיימים. */
export async function GET() {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb();
  const projects = await db
    .collection('PROJECTS')
    .find({ status: { $ne: 'locked' } })
    .sort({ budget_year: -1, name: 1 })
    .toArray();

  const rows: ProjectStatus[] = await Promise.all(
    projects.map((p) => computeProjectStatus(String(p._id)))
  );

  return NextResponse.json({ rows });
}
