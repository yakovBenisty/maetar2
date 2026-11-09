import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as { locked: boolean };

  const db = await getDb();
  await db.collection('PROJECTS').updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: body.locked ? 'locked' : 'open', updated_at: new Date() } }
  );

  return NextResponse.json({ ok: true });
}
