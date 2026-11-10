import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';

export interface OperatorDoc {
  _id?: ObjectId;
  name: string;
  emails: string[];
  created_at?: Date;
}

export async function GET() {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb();
  const operators = await db.collection('OPERATORS').find({}).sort({ name: 1 }).toArray();
  return NextResponse.json({ operators: operators.map((o) => ({ ...o, _id: String(o._id) })) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { name: string; emails: string[] };
  if (!body.name) return NextResponse.json({ ok: false, error: 'חסר שם מפעיל' }, { status: 400 });

  const db = await getDb();
  const result = await db.collection('OPERATORS').insertOne({
    name: body.name,
    emails: Array.isArray(body.emails) ? body.emails.filter(Boolean) : [],
    created_at: new Date(),
  });
  return NextResponse.json({ ok: true, id: String(result.insertedId) });
}
