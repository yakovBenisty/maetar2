import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

/**
 * Debug endpoint — helps understand what חודש_חישוב actually looks like in the DB.
 * GET /api/noseme/audit/debug?collection=SHARATIM
 * Returns: type of the field, distinct values (first 10), sample doc
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collection = searchParams.get('collection') ?? 'SHARATIM';
    const db         = await getDb();

    // 1. Get distinct חודש_חישוב values
    const distinct = await db.collection(collection).distinct('חודש_חישוב');
    const sample   = distinct.slice(0, 10).map((v) => ({
      value:    v,
      jsType:   typeof v,
      isDate:   v instanceof Date,
      asString: String(v),
    }));

    // 2. Get one sample document
    const doc = await db.collection(collection).findOne({}, { projection: { _id: 0 } });
    const חודשType = doc ? typeof (doc as Record<string,unknown>)['חודש_חישוב'] : 'not found';

    // 3. Count docs for a specific month value (first distinct value)
    let testCount = 0;
    if (distinct.length > 0) {
      const firstVal = distinct[0];
      testCount = await db.collection(collection).countDocuments({ חודש_חישוב: firstVal });
    }

    return NextResponse.json({
      collection,
      total_docs: await db.collection(collection).estimatedDocumentCount(),
      חודש_חישוב_type: חודשType,
      distinct_sample: sample,
      test_count_first_val: testCount,
      sample_doc_keys: doc ? Object.keys(doc as object) : [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
