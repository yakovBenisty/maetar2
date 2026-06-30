import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

// GET ?collection=X&code=Y
// Returns all fields and which are numeric, sampled from docs where קוד_נושא = Y
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collection = searchParams.get('collection');
    const code       = searchParams.get('code');

    if (!collection) {
      return NextResponse.json({ ok: false, error: 'Missing collection param' }, { status: 400 });
    }

    const db = await getDb();

    // Sample up to 20 docs — use code filter if provided
    const filter = code ? { 'קוד_נושא': { $in: [code, Number(code)] } } : {};
    const docs = await db.collection(collection).find(filter, { projection: { _id: 0 } }).limit(20).toArray();

    if (docs.length === 0 && code) {
      // Fallback: sample without code filter
      const fallback = await db.collection(collection).find({}, { projection: { _id: 0 } }).limit(5).toArray();
      docs.push(...fallback);
    }

    // Collect all field names and detect numeric fields
    const fieldTypes: Record<string, Set<string>> = {};
    for (const doc of docs) {
      for (const [k, v] of Object.entries(doc)) {
        if (!fieldTypes[k]) fieldTypes[k] = new Set();
        fieldTypes[k].add(typeof v);
      }
    }

    // Skip internal/id fields
    const SKIP = new Set(['_id', 'קוד_נושא', 'חודש_חישוב', 'מספר_ריצה', 'run_id']);
    const all_fields: string[]     = [];
    const numeric_fields: string[] = [];

    for (const [field, types] of Object.entries(fieldTypes)) {
      if (SKIP.has(field)) continue;
      all_fields.push(field);
      if (types.has('number')) numeric_fields.push(field);
    }

    all_fields.sort();
    numeric_fields.sort();

    return NextResponse.json({ ok: true, all_fields, numeric_fields });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
