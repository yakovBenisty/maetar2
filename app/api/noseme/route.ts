import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function GET() {
  try {
    const db = await getDb();
    const docs = await db
      .collection('NOSEME')
      .find({})
      .sort({ code: 1 })
      .project({ _id: 0 })
      .toArray();
    return NextResponse.json({ noseme: docs });
  } catch (error) {
    return NextResponse.json(
      { noseme: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const code = body.code;
    if (!code) {
      return NextResponse.json({ ok: false, error: 'קוד נושא חסר' }, { status: 400 });
    }

    const db = await getDb();
    await db.collection('NOSEME').updateOne(
      { code },
      { $set: { ...body, updated_at: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    if (!code) {
      return NextResponse.json({ ok: false, error: 'קוד נושא חסר' }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.collection('NOSEME').deleteOne({ code });

    return NextResponse.json({ ok: true, deleted: result.deletedCount });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
