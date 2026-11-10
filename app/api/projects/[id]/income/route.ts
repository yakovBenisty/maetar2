import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole } from '@/lib/settlement-auth';
import { getIncomeBreakdown } from '@/lib/income-matching';

/** הכנסות משרד החינוך לפרויקט: CHESHBONIT + מקדמות YADANIIM שלא נספרו ב-CHESHBONIT. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = await getDb();
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(id) });
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 });

  if (role === 'operator' && !(project.operator_emails ?? []).includes(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const noseCodes = (project.noseme_codes ?? []) as string[];
  const result = await getIncomeBreakdown(noseCodes, project.date_from, project.date_to);
  return NextResponse.json({ ok: true, ...result });
}
