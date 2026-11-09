import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';

export interface ProjectDoc {
  _id?: ObjectId;
  name: string;
  budget_year: string;
  model: 'self' | 'operator' | 'joint';
  operator_name: string;
  operator_emails: string[];
  tabar_section: string;
  noseme_codes: string[];
  date_from: Date;
  date_to: Date;
  status: 'open' | 'locked';
  created_at?: Date;
  updated_at?: Date;
}

export async function GET() {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb();
  const filter = role === 'operator' ? { operator_emails: session?.user?.email } : {};
  const projects = await db
    .collection('PROJECTS')
    .find(filter)
    .sort({ budget_year: -1, name: 1 })
    .toArray();

  return NextResponse.json({ projects: projects.map((p) => ({ ...p, _id: String(p._id) })) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as Partial<ProjectDoc> & { _id?: string };
  const { _id, name, budget_year, model, operator_name, operator_emails, tabar_section, noseme_codes, date_from, date_to } = body;

  if (!name || !budget_year || !model || !date_from || !date_to) {
    return NextResponse.json({ ok: false, error: 'שדות חובה חסרים' }, { status: 400 });
  }
  if (!['self', 'operator', 'joint'].includes(model)) {
    return NextResponse.json({ ok: false, error: 'דגם הפעלה לא תקין' }, { status: 400 });
  }

  const db = await getDb();
  const doc = {
    name,
    budget_year,
    model,
    operator_name: operator_name ?? '',
    operator_emails: Array.isArray(operator_emails) ? operator_emails.filter(Boolean) : [],
    tabar_section: tabar_section ?? '',
    noseme_codes: Array.isArray(noseme_codes) ? noseme_codes.map(String).filter(Boolean) : [],
    date_from: new Date(date_from),
    date_to: new Date(date_to),
    updated_at: new Date(),
  };

  if (_id) {
    const existing = await db.collection('PROJECTS').findOne({ _id: new ObjectId(_id) }, { projection: { status: 1 } });
    if (existing?.status === 'locked') {
      return NextResponse.json({ ok: false, error: 'הפרויקט נעול — לא ניתן לערוך' }, { status: 400 });
    }
    await db.collection('PROJECTS').updateOne({ _id: new ObjectId(_id) }, { $set: doc });
    return NextResponse.json({ ok: true, id: _id });
  }

  const result = await db.collection('PROJECTS').insertOne({
    ...doc,
    status: 'open',
    created_at: new Date(),
  });
  return NextResponse.json({ ok: true, id: String(result.insertedId) });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'חסר מזהה פרויקט' }, { status: 400 });

  const db = await getDb();
  const runsCount = await db.collection('SETTLEMENT_RUNS').countDocuments({ project_id: id });
  if (runsCount > 0) {
    return NextResponse.json({ ok: false, error: 'לא ניתן למחוק פרויקט עם דוחות התחשבנות — ניתן לנעול אותו' }, { status: 400 });
  }

  const result = await db.collection('PROJECTS').deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true, deleted: result.deletedCount });
}
