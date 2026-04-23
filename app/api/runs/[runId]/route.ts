import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const db = await getDb();

    const runDoc = await db.collection('runs').findOne({ run_id: runId });
    if (!runDoc) {
      return NextResponse.json({ ok: false, error: 'ריצה לא נמצאה' }, { status: 404 });
    }

    // COMMANDS נמחקים ונשמרים מחדש לפי calc_month — שאילתה לפי חלון חודש
    const calcMonthDate = runDoc.calc_month as Date;
    const y = calcMonthDate.getUTCFullYear();
    const m = calcMonthDate.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd   = new Date(Date.UTC(y, m + 1, 1));

    const [runLogDoc, allCommands] = await Promise.all([
      db.collection('run_logs').findOne({ run_id: runId }),
      db.collection('COMMANDS')
        .find({ calc_month: { $gte: monthStart, $lt: monthEnd } })
        .toArray(),
    ]);

    // הפרד בין פקודות רגילות לשורות סיכום (חוז)
    const period1 = allCommands.filter((c) => c['תקופה'] === 'ראשונה' && c['table_type'] !== 'סיכום');
    const period2 = allCommands.filter((c) => c['תקופה'] === 'שנייה' && c['table_type'] !== 'סיכום');
    const p1Summary = allCommands.find((c) => c['תקופה'] === 'ראשונה' && c['table_type'] === 'סיכום');
    const p2Summary = allCommands.find((c) => c['תקופה'] === 'שנייה' && c['table_type'] === 'סיכום');

    const p1InvoiceTotal: number = Number(p1Summary?.['סכום_חובה'] ?? 0);
    const p2InvoiceTotal: number = Number(p2Summary?.['סכום_חובה'] ?? 0);

    // חשב סכומי סיכום ישירות מהפקודות
    const totalIncome  = [...period1, ...period2].reduce((s, c) => s + (Number(c['סכום_זכות']) || 0), 0);
    const totalExpense = [...period1, ...period2].reduce((s, c) => s + Math.abs(Number(c['סכום_חובה']) || 0), 0);
    const totalAmount  = totalIncome - totalExpense;
    const p1Amount = period1.reduce((s, c) => s + (Number(c['סכום_זכות']) || 0) - Math.abs(Number(c['סכום_חובה']) || 0), 0);
    const p2Amount = period2.reduce((s, c) => s + (Number(c['סכום_זכות']) || 0) - Math.abs(Number(c['סכום_חובה']) || 0), 0);

    // הסר _id של MongoDB לפני החזרה לקליינט
    const cleanDocs = (docs: Record<string, unknown>[]) =>
      docs.map(({ _id, ...rest }) => rest);

    return NextResponse.json({
      ok: true,
      runId,
      tabs: {
        summary: {
          total: period1.length + period2.length,
          totalAmount,
          totalIncome,
          totalExpense,
          period1: period1.length,
          period1Amount: p1Amount,
          period2: period2.length,
          period2Amount: p2Amount,
          invoiceTotal: p1InvoiceTotal + p2InvoiceTotal,
          period1InvoiceTotal: p1InvoiceTotal,
          period2InvoiceTotal: p2InvoiceTotal,
          errors: runDoc.errors ?? 0,
          warnings: runDoc.warnings ?? 0,
          rejected: runDoc.unprocessed ?? 0,
        },
        period1: cleanDocs([
          ...period1,
          ...(p1Summary ? [p1Summary] : []),
        ] as Record<string, unknown>[]),
        period2: cleanDocs([
          ...period2,
          ...(p2Summary ? [p2Summary] : []),
        ] as Record<string, unknown>[]),
        logs: runLogDoc?.logs ?? [],
        comparison: [],
        rejected: runLogDoc?.rejected ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאת שרת' },
      { status: 500 }
    );
  }
}
