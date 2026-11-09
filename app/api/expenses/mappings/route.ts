import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole } from '@/lib/settlement-auth';

export type ExpenseKind = 'operator_expense' | 'rashut_expense' | 'reservation' | 'parent_payment';

export interface UploadMappingDoc {
  _id?: ObjectId;
  kind: ExpenseKind;
  label: string;
  date_column: string;
  amount_column: string;
  description_column: string;
  category_column: string;
  key_columns: string[];
  created_at?: Date;
  updated_at?: Date;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const kind = req.nextUrl.searchParams.get('kind');
  const db = await getDb();
  const mappings = await db
    .collection('UPLOAD_MAPPINGS')
    .find(kind ? { kind } : {})
    .sort({ label: 1 })
    .toArray();

  return NextResponse.json({ mappings: mappings.map((m) => ({ ...m, _id: String(m._id) })) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as UploadMappingDoc & { _id?: string };
  const { _id, kind, label, date_column, amount_column, description_column, category_column, key_columns } = body;

  if (!kind || !label || !amount_column || !key_columns?.length) {
    return NextResponse.json({ ok: false, error: 'חסרים שדות חובה (סוג, שם, עמודת סכום, עמודות מפתח)' }, { status: 400 });
  }

  const db = await getDb();
  const doc = {
    kind,
    label,
    date_column: date_column ?? '',
    amount_column,
    description_column: description_column ?? '',
    category_column: category_column ?? '',
    key_columns,
    updated_at: new Date(),
  };

  if (_id) {
    await db.collection('UPLOAD_MAPPINGS').updateOne({ _id: new ObjectId(_id) }, { $set: doc });
    return NextResponse.json({ ok: true, id: _id });
  }

  const result = await db.collection('UPLOAD_MAPPINGS').insertOne({ ...doc, created_at: new Date() });
  return NextResponse.json({ ok: true, id: String(result.insertedId) });
}
