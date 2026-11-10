import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole } from '@/lib/settlement-auth';

export type ExpenseKind = 'operator_expense' | 'rashut_expense' | 'reservation' | 'parent_payment';

/** שכר: מפתח יחודי = ת.ז + חודש שכר. חשבונית (רכש/אחר): מפתח יחודי = מספר חשבונית + ח.פ. */
export type ExpenseNature = 'salary' | 'invoice';

export interface UploadMappingDoc {
  _id?: ObjectId;
  kind: ExpenseKind;
  label: string;
  nature: ExpenseNature;
  amount_column: string;
  description_column?: string;
  // nature=invoice
  date_column?: string;
  invoice_number_column?: string;
  tax_id_column?: string;
  // nature=salary
  tz_column?: string;
  salary_month_column?: string;
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
  const { _id, kind, label, nature, amount_column, description_column, date_column, invoice_number_column, tax_id_column, tz_column, salary_month_column } = body;

  if (!kind || !label || !nature || !amount_column) {
    return NextResponse.json({ ok: false, error: 'חסרים שדות חובה (סוג, שם, מהות, עמודת סכום)' }, { status: 400 });
  }
  if (nature === 'salary' && (!tz_column || !salary_month_column)) {
    return NextResponse.json({ ok: false, error: 'במיפוי שכר יש לבחור עמודת ת.ז ועמודת חודש שכר' }, { status: 400 });
  }
  if (nature === 'invoice' && (!invoice_number_column || !tax_id_column || !date_column)) {
    return NextResponse.json({ ok: false, error: 'במיפוי חשבונית יש לבחור עמודת מספר חשבונית, עמודת ח.פ/ת.ז ועמודת תאריך' }, { status: 400 });
  }

  const db = await getDb();
  const doc = {
    kind,
    label,
    nature,
    amount_column,
    description_column: description_column ?? '',
    date_column: date_column ?? '',
    invoice_number_column: invoice_number_column ?? '',
    tax_id_column: tax_id_column ?? '',
    tz_column: tz_column ?? '',
    salary_month_column: salary_month_column ?? '',
    updated_at: new Date(),
  };

  if (_id) {
    await db.collection('UPLOAD_MAPPINGS').updateOne({ _id: new ObjectId(_id) }, { $set: doc });
    return NextResponse.json({ ok: true, id: _id });
  }

  const result = await db.collection('UPLOAD_MAPPINGS').insertOne({ ...doc, created_at: new Date() });
  return NextResponse.json({ ok: true, id: String(result.insertedId) });
}
