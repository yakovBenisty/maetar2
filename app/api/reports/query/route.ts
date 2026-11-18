import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { Document, Filter } from 'mongodb';
import { yyyymmExprFromField, monthToYYYYMM } from '@/lib/report-date-utils';

function buildMonthRangeExpr(field: string, from?: string, to?: string): Record<string, unknown> | null {
  if (!from && !to) return null;
  const normalized = yyyymmExprFromField(field);
  const conds: unknown[] = [{ $ne: [normalized, null] }];
  if (from) conds.push({ $gte: [normalized, monthToYYYYMM(from)] });
  if (to) conds.push({ $lte: [normalized, monthToYYYYMM(to)] });
  return { $and: conds };
}

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
    const errors: Record<string, string> = {};

    for (const colName of collections) {
      const query: Filter<Document> = {};
      const exprConds: unknown[] = [];

      if (calc_month) {
        const exact = monthToYYYYMM(calc_month);
        exprConds.push({ $eq: [yyyymmExprFromField('חודש_חישוב'), exact] });
      } else {
        const calcExpr = buildMonthRangeExpr('חודש_חישוב', from_month, to_month);
        if (calcExpr) exprConds.push(calcExpr);
      }

      const tachulaExpr = buildMonthRangeExpr('חודש_תחולה', from_tachula, to_tachula);
      if (tachulaExpr) exprConds.push(tachulaExpr);

      if (exprConds.length > 0) {
        query['$expr'] = (exprConds.length === 1 ? exprConds[0] : { $and: exprConds }) as unknown as Filter<Document>['$expr'];
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
        errors[colName] = colErr instanceof Error ? colErr.message : 'שגיאה';
        console.error(`Error querying collection ${colName}:`, colErr);
      }
    }

    const total = Object.values(result).reduce((sum, rows) => sum + rows.length, 0);

    // כשלא חזרו רשומות — מחזירים גם את טווח חודשי החישוב הקיימים בכל קולקשן, כדי שהמסך
    // יוכל להסביר אם הסינון פשוט חורג מהנתונים (למשל חודש שמית"ר טרם פרסם).
    let available: Record<string, { from: string; to: string } | null> | undefined;
    if (total === 0) {
      const fmt = (d: unknown) =>
        d instanceof Date ? `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '';
      available = {};
      for (const colName of collections) {
        try {
          const col = db.collection(colName);
          const dated = { חודש_חישוב: { $type: 'date' } } as Filter<Document>;
          const first = await col.find(dated).sort({ חודש_חישוב: 1 }).limit(1).project({ _id: 0, חודש_חישוב: 1 }).next();
          const last = await col.find(dated).sort({ חודש_חישוב: -1 }).limit(1).project({ _id: 0, חודש_חישוב: 1 }).next();
          available[colName] = first && last ? { from: fmt(first.חודש_חישוב), to: fmt(last.חודש_חישוב) } : null;
        } catch {
          available[colName] = null;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: result,
      meta: { total, errors: Object.keys(errors).length ? errors : undefined, available },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
