import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export async function GET() {
  try {
    const db = await getDb();
    const distinctDates = await db.collection('CHESHBONIT').distinct('חודש_חישוב');

    const formatted: string[] = [];
    for (const d of distinctDates) {
      if (d instanceof Date) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        formatted.push(`${year}-${month}`);
      } else if (typeof d === 'string') {
        formatted.push(d);
      }
    }

    formatted.sort((a, b) => b.localeCompare(a));

    return NextResponse.json({ months: formatted });
  } catch (error) {
    return NextResponse.json(
      { months: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
