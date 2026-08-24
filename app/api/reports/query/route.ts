import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { Document, Filter } from 'mongodb';

// חודש_חישוב / חודש_תחולה נשמרים ב-Mongo בשלושה פורמטים שונים בפועל
// (Date, מספר YYYYMM, מחרוזת "YYYY/MM") — תלוי אם הערך המקורי ב-CSV
// עמד בפורמט MM/YYYY שהאימפורט יודע לפרסר. לכן ההשוואה נעשית דרך $expr
// שממיר כל אחד מהפורמטים האלה למספר YYYYMM אחיד לפני ההשוואה,
// במקום $gte/$lte ישיר על השדה שמפספס ערכים שאינם מסוג Date.
function yyyymmExprFromField(field: string) {
  return {
    $switch: {
      branches: [
        {
          case: { $eq: [{ $type: `$${field}` }, 'date'] },
          then: { $add: [{ $multiply: [{ $year: `$${field}` }, 100] }, { $month: `$${field}` }] },
        },
        {
          case: { $eq: [{ $type: `$${field}` }, 'string'] },
          then: {
            $let: {
              vars: { parts: { $split: [`$${field}`, '/'] } },
              in: {
                $cond: [
                  { $eq: [{ $size: '$$parts' }, 2] },
                  {
                    $add: [
                      { $multiply: [{ $convert: { input: { $arrayElemAt: ['$$parts', 0] }, to: 'int', onError: null, onNull: null } }, 100] },
                      { $convert: { input: { $arrayElemAt: ['$$parts', 1] }, to: 'int', onError: null, onNull: null } },
                    ],
                  },
                  null,
                ],
              },
            },
          },
        },
        {
          case: { $in: [{ $type: `$${field}` }, ['int', 'long', 'double', 'decimal']] },
          then: `$${field}`,
        },
      ],
      default: null,
    },
  };
}

function monthToYYYYMM(monthStr: string): number {
  const [y, m] = monthStr.split('-').map(Number);
  return y * 100 + m;
}

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
