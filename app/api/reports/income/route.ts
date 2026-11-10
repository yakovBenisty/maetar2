import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { yyyymmExprFromField } from '@/lib/report-date-utils';

function yyyymmToDisplay(ym: number | null): string {
  if (ym == null) return '';
  const y = Math.floor(ym / 100);
  const m = ym % 100;
  return `${String(m).padStart(2, '0')}/${y}`;
}

interface GroupKey {
  code: string;
  calc: number | null;
  tach: number | null;
}

/** הכנסות משרד החינוך (CHESHBONIT) — מקובצות לפי נושא, חודש חישוב וחודש תחולה. */
export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .collection('CHESHBONIT')
      .aggregate([
        {
          $addFields: {
            _code: { $toString: '$קוד_נושא' },
            _calcYM: yyyymmExprFromField('חודש_חישוב'),
            _tachYM: yyyymmExprFromField('חודש_תחולה'),
          },
        },
        {
          $group: {
            _id: { code: '$_code', calc: '$_calcYM', tach: '$_tachYM' },
            name: { $first: '$תאור_נושא' },
            total: { $sum: '$יתרת_ביצוע_החודש' },
            rowsCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.tach': -1, '_id.code': 1 } },
      ])
      .toArray();

    const data = rows.map((r) => ({
      code: r._id.code,
      name: r.name ?? '',
      calcMonth: yyyymmToDisplay(r._id.calc),
      tachulaMonth: yyyymmToDisplay(r._id.tach),
      total: r.total ?? 0,
      rowsCount: r.rowsCount,
    }));

    // השוואת מקדמות: CHESHBONIT (שורה עם "מקדמה" בהערות) מול YADANIIM (שורה
    // עם "מקדמה" בסוג_תשלום), לכל (נושא, חודש חישוב, חודש תחולה) — כדי לאתר
    // פערים בין השניים, לא כדי לחבר/להחליף אוטומטית.
    const cheshAdvances = await db
      .collection('CHESHBONIT')
      .aggregate([
        { $match: { הערות: { $regex: 'מקדמה' } } },
        {
          $addFields: {
            _code: { $toString: '$קוד_נושא' },
            _calcYM: yyyymmExprFromField('חודש_חישוב'),
            _tachYM: yyyymmExprFromField('חודש_תחולה'),
          },
        },
        {
          $group: {
            _id: { code: '$_code', calc: '$_calcYM', tach: '$_tachYM' },
            name: { $first: '$תאור_נושא' },
            total: { $sum: '$יתרת_ביצוע_החודש' },
          },
        },
      ])
      .toArray();

    const yadAdvances = await db
      .collection('YADANIIM')
      .aggregate([
        { $match: { סוג_תשלום: { $regex: 'מקדמה' } } },
        {
          $addFields: {
            _code: { $toString: '$קוד_נושא' },
            _calcYM: yyyymmExprFromField('חודש_חישוב'),
            _tachYM: yyyymmExprFromField('חודש_תחולה'),
          },
        },
        {
          $group: {
            _id: { code: '$_code', calc: '$_calcYM', tach: '$_tachYM' },
            name: { $first: '$נושא' },
            total: { $sum: '$סכום_מחושב' },
          },
        },
      ])
      .toArray();

    const keyOf = (k: GroupKey) => `${k.code}|${k.calc}|${k.tach}`;
    const merged = new Map<string, { code: string; name: string; calc: number | null; tach: number | null; cheshbonit: number; yadaniim: number }>();

    for (const r of cheshAdvances) {
      const k = keyOf(r._id);
      merged.set(k, { code: r._id.code, name: r.name ?? '', calc: r._id.calc, tach: r._id.tach, cheshbonit: r.total ?? 0, yadaniim: 0 });
    }
    for (const r of yadAdvances) {
      const k = keyOf(r._id);
      const existing = merged.get(k);
      if (existing) existing.yadaniim = r.total ?? 0;
      else merged.set(k, { code: r._id.code, name: r.name ?? '', calc: r._id.calc, tach: r._id.tach, cheshbonit: 0, yadaniim: r.total ?? 0 });
    }

    const advanceComparison = [...merged.values()]
      .map((r) => ({
        code: r.code,
        name: r.name,
        calcMonth: yyyymmToDisplay(r.calc),
        tachulaMonth: yyyymmToDisplay(r.tach),
        cheshbonit: r.cheshbonit,
        yadaniim: r.yadaniim,
        diff: r.cheshbonit - r.yadaniim,
      }))
      .sort((a, b) => (b.tachulaMonth > a.tachulaMonth ? 1 : -1));

    return NextResponse.json({ ok: true, rows: data, advanceComparison });
  } catch (error) {
    return NextResponse.json(
      { ok: false, rows: [], advanceComparison: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
