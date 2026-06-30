import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { Document, Filter } from 'mongodb';

interface QueryBody {
  collections?: string[];
  nose_codes?: string[];
  from_month?: string;
  to_month?: string;
  calc_month?: string;
  from_tachula?: string;
  to_tachula?: string;
  mosad_codes?: string[];
  limit?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as QueryBody;
    const {
      collections = [],
      nose_codes,
      from_month,
      to_month,
      calc_month,
      from_tachula,
      to_tachula,
      mosad_codes,
      limit,
    } = body;

    const db = await getDb();
    const result: Record<string, unknown[]> = {};

    for (const colName of collections) {
      const query: Filter<Document> = {};

      if (calc_month) {
        const [year, month] = calc_month.split('-').map(Number);
        query['חודש_חישוב'] = new Date(Date.UTC(year, month - 1, 1));
      } else {
        if (from_month || to_month) {
          const dateFilter: Record<string, Date> = {};
          if (from_month) {
            const [y, m] = from_month.split('-').map(Number);
            dateFilter['$gte'] = new Date(Date.UTC(y, m - 1, 1));
          }
          if (to_month) {
            const [y, m] = to_month.split('-').map(Number);
            dateFilter['$lte'] = new Date(Date.UTC(y, m - 1, 1));
          }
          if (Object.keys(dateFilter).length > 0) {
            query['חודש_חישוב'] = dateFilter as unknown as Date;
          }
        }
      }

      if (from_tachula || to_tachula) {
        const tachulaFilter: Record<string, Date> = {};
        if (from_tachula) {
          const [y, m] = from_tachula.split('-').map(Number);
          tachulaFilter['$gte'] = new Date(Date.UTC(y, m - 1, 1));
        }
        if (to_tachula) {
          const [y, m] = to_tachula.split('-').map(Number);
          tachulaFilter['$lte'] = new Date(Date.UTC(y, m - 1, 1));
        }
        query['חודש_תחולה'] = tachulaFilter as unknown as Date;
      }

      if (nose_codes && nose_codes.length > 0) {
        // Support both string and numeric קוד_נושא in MongoDB
        const numericCodes = nose_codes.map(Number).filter((n) => !isNaN(n));
        const allCodes = [...new Set([...nose_codes, ...numericCodes])];
        query['קוד_נושא'] = { $in: allCodes } as unknown as string;
      }

      if (mosad_codes && mosad_codes.length > 0) {
        // Support both string and numeric סמל_מוסד; collections without a
        // סמל_מוסד field (e.g. CHESHBONIT) are returned unfiltered by institution.
        const numericMosad = mosad_codes.map(Number).filter((n) => !isNaN(n));
        const allMosad = [...new Set([...mosad_codes, ...numericMosad])];
        query['$or'] = [
          { סמל_מוסד: { $in: allMosad } },
          { סמל_מוסד: { $exists: false } },
        ] as unknown as Filter<Document>['$or'];
      }

      // For MUCARIM and SHARATIM: skip rows where הפרש_מחושב === 0
      if (colName === 'MUCARIM' || colName === 'SHARATIM') {
        query['הפרש_מחושב'] = { $ne: 0 } as unknown as number;
      }

      try {
        let cursor = db.collection(colName).find(query).project({ _id: 0 });
        if (limit) cursor = cursor.limit(limit);
        const docs = await cursor.toArray();

        result[colName] = docs.map((doc) => {
          const mapped: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(doc)) {
            if (v instanceof Date) {
              mapped[k] = `${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
            } else {
              mapped[k] = v;
            }
          }
          return mapped;
        });
      } catch (colErr) {
        result[colName] = [];
        console.error(`Error querying collection ${colName}:`, colErr);
      }
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
