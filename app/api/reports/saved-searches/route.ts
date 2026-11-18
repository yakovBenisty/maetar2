import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';

// חיפושים שמורים של דוח הריכוז — לכל משתמש הרשימה שלו (לפי כתובת המייל).
const COLLECTION = 'SAVED_SEARCHES';
const MAX_LIST = 2000;
const MONTH_RE = /^\d{4}-\d{2}$/;

export interface SavedSearchFilters {
  topics: string[] | null; // null = כל הנושאים (כולל נושאים שייווספו בעתיד)
  mosdot: string[] | null; // null = כל המוסדות
  fromMonth: string;
  toMonth: string;
  fromTachula: string;
  toTachula: string;
  extraCols: string[];
}

function stringList(v: unknown): string[] | null {
  if (v === null) return null;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').slice(0, MAX_LIST);
}

function month(v: unknown): string {
  return typeof v === 'string' && MONTH_RE.test(v) ? v : '';
}

function sanitize(raw: unknown): SavedSearchFilters {
  const f = (raw ?? {}) as Record<string, unknown>;
  return {
    topics: stringList(f.topics ?? null),
    mosdot: stringList(f.mosdot ?? null),
    fromMonth: month(f.fromMonth),
    toMonth: month(f.toMonth),
    fromTachula: month(f.fromTachula),
    toTachula: month(f.toTachula),
    extraCols: stringList(f.extraCols) ?? [],
  };
}

async function currentEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

export async function GET() {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = await getDb();
  const docs = await db.collection(COLLECTION).find({ owner_email: email }).sort({ name: 1 }).toArray();
  return NextResponse.json({
    searches: docs.map((d) => ({ _id: String(d._id), name: d.name, filters: d.filters, updated_at: d.updated_at })),
  });
}

/** שמירה לפי שם: שם קיים של אותו משתמש — מתעדכן; שם חדש — נוצר חיפוש חדש. */
export async function POST(req: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; filters?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) {
    return NextResponse.json({ ok: false, error: 'שם החיפוש חייב להיות בין 1 ל-80 תווים' }, { status: 400 });
  }

  const now = new Date();
  const db = await getDb();
  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { owner_email: email, name },
    { $set: { filters: sanitize(body?.filters), updated_at: now }, $setOnInsert: { owner_email: email, name, created_at: now } },
    { upsert: true, returnDocument: 'after' }
  );
  return NextResponse.json({ ok: true, id: result ? String(result._id) : null });
}

export async function DELETE(req: NextRequest) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id || !ObjectId.isValid(id)) return NextResponse.json({ ok: false, error: 'חסר מזהה' }, { status: 400 });

  const db = await getDb();
  const res = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id), owner_email: email });
  return NextResponse.json({ ok: true, deleted: res.deletedCount });
}
