import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ingestMitarZip } from '@/lib/mitar-ingest';

/**
 * Endpoint ייעודי לקבלת ZIP של מית"ר שהורד על ידי ה-relay שרץ ברשת הרשות
 * (ראו scripts/mitar-relay.ts) — מכיוון שהשרת עצמו (Render/Railway) חסום
 * מגישה ל-apps.education.gov.il. מאובטח בטוקן סודי משותף, לא ב-session
 * של משתמש, כי זו קריאת מכונה-למכונה; ראו middleware.ts לגבי הפטור מ-auth.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.MITAR_INGEST_TOKEN;
  if (!expected) return false;
  const provided = req.headers.get('x-mitar-ingest-token') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const month = Number(formData.get('month'));
    const year = Number(formData.get('year'));
    const file = formData.get('file') as File | null;

    if (!month || !year || !file) {
      return NextResponse.json({ ok: false, error: 'חסרים שדות חובה (month, year, file)' }, { status: 400 });
    }

    const zipBuf = Buffer.from(await file.arrayBuffer());
    const result = await ingestMitarZip(month, year, zipBuf, 'relay');

    return NextResponse.json({ ok: result.status === 'success', result }, { status: result.status === 'success' ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאת שרת' },
      { status: 500 }
    );
  }
}
