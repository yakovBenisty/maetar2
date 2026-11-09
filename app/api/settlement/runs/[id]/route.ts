import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';

/** עדכון "סה"כ שולם בפועל" על רשומת תשלום קיימת — עם היסטוריית ביקורת מלאה (ללא מחיקה/עריכה של רשומות קודמות). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { paid_total: number; note?: string };

  if (body.paid_total == null || Number.isNaN(Number(body.paid_total)) || Number(body.paid_total) < 0) {
    return NextResponse.json({ ok: false, error: 'סכום שולם לא תקין' }, { status: 400 });
  }

  const db = await getDb();
  const run = await db.collection('SETTLEMENT_RUNS').findOne({ _id: new ObjectId(id) });
  if (!run) return NextResponse.json({ ok: false, error: 'דוח לא נמצא' }, { status: 404 });

  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(run.project_id) }, { projection: { status: 1 } });
  if (project?.status === 'locked') {
    return NextResponse.json({ ok: false, error: 'הפרויקט נעול — לא ניתן לעדכן תשלום' }, { status: 400 });
  }

  const auditEntry = {
    amount: Number(body.paid_total),
    note: body.note ?? '',
    updated_at: new Date(),
    updated_by: session?.user?.email ?? '',
  };

  await db.collection('SETTLEMENT_RUNS').updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { paid_total: auditEntry.amount },
      $push: { paid_audit: auditEntry } as never,
    }
  );

  return NextResponse.json({ ok: true });
}
