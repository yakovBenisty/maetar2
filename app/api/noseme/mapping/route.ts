import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

// All input collections that may contain קוד_נושא
const INPUT_COLLECTIONS = [
  'CHESHBONIT', 'MUCARIM', 'SHARATIM', 'YADANIIM',
  'GY003', 'GY019', 'GY033', 'HASAOT', 'HASNET', 'HASMASLULIM',
  'MISROT', 'MISROTGY', 'MOADON', 'MUTAVIM', 'SHEFI',
];

export async function GET() {
  try {
    const db = await getDb();

    // 1. Get all existing collection names in the DB
    const allCollections = await db.listCollections().toArray();
    const existingNames = new Set(allCollections.map((c) => c.name));

    // 2. For each input collection that exists, get distinct קוד_נושא values
    const collectionsToQuery = INPUT_COLLECTIONS.filter((c) => existingNames.has(c));
    const codeToCollections: Record<string, string[]> = {};

    for (const colName of collectionsToQuery) {
      try {
        const codes = await db.collection(colName).distinct('קוד_נושא');
        for (const raw of codes) {
          const code = String(raw).trim();
          if (!code) continue;
          if (!codeToCollections[code]) codeToCollections[code] = [];
          codeToCollections[code].push(colName);
        }
      } catch { /* collection exists but query failed — skip */ }
    }

    // 3. Load NOSEME reference data
    const nosemeDocs = await db.collection('NOSEME').find({}, { projection: { _id: 0 } }).toArray();
    const nosemeMap: Record<string, { name?: string; table_type?: string; direction?: string }> = {};
    for (const doc of nosemeDocs) {
      const code = String(doc.code ?? '').trim();
      if (code) nosemeMap[code] = { name: doc.name, table_type: doc.table_type, direction: doc.direction };
    }

    // 4. Union of all codes (from files + NOSEME)
    const allCodes = new Set([...Object.keys(codeToCollections), ...Object.keys(nosemeMap)]);

    const topics = Array.from(allCodes)
      .map((code) => ({
        code,
        name:        nosemeMap[code]?.name        ?? null,
        table_type:  nosemeMap[code]?.table_type  ?? null,
        direction:   nosemeMap[code]?.direction   ?? null,
        in_noseme:   !!nosemeMap[code],
        collections: codeToCollections[code] ?? [],
      }))
      .sort((a, b) => {
        const na = isNaN(Number(a.code)) ? a.code : String(Number(a.code)).padStart(10, '0');
        const nb = isNaN(Number(b.code)) ? b.code : String(Number(b.code)).padStart(10, '0');
        return na.localeCompare(nb);
      });

    return NextResponse.json({ ok: true, topics, available_collections: collectionsToQuery });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
