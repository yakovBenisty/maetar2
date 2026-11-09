import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { runMitarSync } from '@/lib/mitar-sync';

export async function GET() {
  try {
    const db = await getDb();
    const runs = await db
      .collection('MITAR_SYNC_RUNS')
      .find({})
      .sort({ started_at: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      ok: true,
      runs: runs.map((r) => ({ ...r, _id: String(r._id) })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, runs: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await runMitarSync();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאת שרת' },
      { status: 500 }
    );
  }
}
