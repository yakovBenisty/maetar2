import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function GET() {
  try {
    const db = await getDb();

    // Get one sample document from each reports collection
    const collections = ['CHESHBONIT', 'MUCARIM', 'SHARATIM', 'YADANIIM', 'COMMANDS'];
    const samples: Record<string, unknown> = {};

    for (const col of collections) {
      try {
        const doc = await db.collection(col).findOne({}, { projection: { _id: 0 } });
        const count = await db.collection(col).countDocuments();
        samples[col] = { count, sample: doc };
      } catch (e) {
        samples[col] = { error: String(e) };
      }
    }

    return NextResponse.json({ ok: true, collections: samples });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
