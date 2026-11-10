import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = await getDb();
  const history = await db
    .collection('PROJECT_PARAMS')
    .find({ project_id: id })
    .sort({ effective_from: -1 })
    .toArray();

  return NextResponse.json({ history: history.map((h) => ({ ...h, _id: String(h._id) })) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    overhead_pct: number;
    advance_pct: number;
    effective_from: string;
    rashut_split_type?: 'percentage' | 'fixed';
    rashut_split_value?: number;
  };

  if (body.overhead_pct == null || body.advance_pct == null || !body.effective_from) {
    return NextResponse.json({ ok: false, error: 'שדות חובה חסרים' }, { status: 400 });
  }
  if (body.rashut_split_type && !['percentage', 'fixed'].includes(body.rashut_split_type)) {
    return NextResponse.json({ ok: false, error: 'סוג התפלגות לא תקין' }, { status: 400 });
  }

  const db = await getDb();
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(id) }, { projection: { status: 1 } });
  if (project?.status === 'locked') {
    return NextResponse.json({ ok: false, error: 'הפרויקט נעול — לא ניתן לעדכן פרמטרים' }, { status: 400 });
  }

  await db.collection('PROJECT_PARAMS').insertOne({
    project_id: id,
    overhead_pct: Number(body.overhead_pct),
    advance_pct: Number(body.advance_pct),
    ...(body.rashut_split_type ? { rashut_split_type: body.rashut_split_type, rashut_split_value: Number(body.rashut_split_value) || 0 } : {}),
    effective_from: new Date(body.effective_from),
    created_at: new Date(),
    created_by: session?.user?.email ?? '',
  });

  return NextResponse.json({ ok: true });
}
