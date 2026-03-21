import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function GET() {
  try {
    const db = await getDb();
    const runs = await db
      .collection('runs')
      .find({})
      .sort({ started_at: -1 })
      .toArray();

    const formatted = runs.map((run) => {
      // support both old field names (calculation_month) and new (calc_month)
      const calcDate = run.calc_month ?? run.calculation_month;
      const splitDate = run.split_month ?? run.split_date;
      const formatMonth = (d: unknown) => {
        if (d instanceof Date) return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        if (typeof d === 'string') return d.slice(0, 7);
        return '';
      };
      return {
        ...run,
        _id: String(run._id),
        calc_month_display: formatMonth(calcDate),
        split_month_display: formatMonth(splitDate),
        // normalize summary fields
        commands: run.commands ?? run.summary?.commands ?? 0,
        total: run.total ?? run.summary?.total ?? 0,
        errors: run.errors ?? run.errors_count ?? 0,
        warnings: run.warnings ?? run.warnings_count ?? 0,
        unprocessed: run.unprocessed ?? run.unprocessed_count ?? 0,
      };
    });

    return NextResponse.json({ runs: formatted });
  } catch (error) {
    return NextResponse.json(
      { runs: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
