import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { Document, Filter } from 'mongodb';

interface QueryBody {
  collections?: string[];
  nose_codes?: string[];
  from_month?: string;
  to_month?: string;
  calc_month?: string;
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
      limit = 1000,
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

      if (nose_codes && nose_codes.length > 0) {
        // Support both string and numeric קוד_נושא in MongoDB
        const numericCodes = nose_codes.map(Number).filter((n) => !isNaN(n));
        const allCodes = [...new Set([...nose_codes, ...numericCodes])];
        query['קוד_נושא'] = { $in: allCodes } as unknown as string;
      }

      // For MUCARIM and SHARATIM: skip rows where הפרש_מחושב === 0
      if (colName === 'MUCARIM' || colName === 'SHARATIM') {
        query['הפרש_מחושב'] = { $ne: 0 } as unknown as number;
      }

      try {
        const docs = await db
          .collection(colName)
          .find(query)
          .limit(limit)
          .project({ _id: 0 })
          .toArray();

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
