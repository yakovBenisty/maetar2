import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';

function adminOnly(session: Session | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  const session = await auth();
  const err = adminOnly(session);
  if (err) return err;

  const db = await getDb();
  const users = await db
    .collection('USERS')
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const err = adminOnly(session);
  if (err) return err;

  const body = await req.json();
  const { email, firstName, lastName, role } = body as {
    email: string;
    firstName: string;
    lastName: string;
    role: 'user' | 'admin';
  };

  if (!email || !firstName || !lastName) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 });
  }
  if (!['user', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'סוג משתמש לא תקין' }, { status: 400 });
  }

  const db = await getDb();
  await db.collection('USERS').updateOne(
    { email },
    {
      $set: { email, firstName, lastName, role, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const err = adminOnly(session);
  if (err) return err;

  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'חסר email' }, { status: 400 });

  // Prevent deleting yourself
  if (session?.user?.email === email) {
    return NextResponse.json({ error: 'לא ניתן למחוק את עצמך' }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection('USERS').deleteOne({ email });
  return NextResponse.json({ ok: true, deleted: result.deletedCount });
}
