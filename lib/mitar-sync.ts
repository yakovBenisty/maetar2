import { getDb } from './mongo';
import { openMitarSession, listAvailableMonths, downloadMonthZip } from './mitar-client';
import { ingestMitarZip, type IngestMonthResult, type MitarSyncSource } from './mitar-ingest';

const BENEFICIARY_CODE = process.env.MITAR_BENEFICIARY_CODE || '10402469';
// כמה מהחודשים העדכניים ביותר (מתוך רשימת מית"ר) לבדוק/לייבא בכל ריצה.
// מספיק קטן כדי לא להעמיס על שרת משרד החינוך, אך מכסה גם חודש שפורסם באיחור.
const MONTHS_PER_RUN = Number(process.env.MITAR_SYNC_MONTHS_PER_RUN || 2);

export interface MitarSyncResult {
  ok: boolean;
  syncRunId: string;
  startedAt: Date;
  finishedAt: Date;
  checkedMonths: number;
  results: IngestMonthResult[];
  error?: string;
}

/**
 * מריץ את תהליך המית"ר כולו משרת ה-Next עצמו: פותח session, מוריד ZIP ומייבא.
 * שימושי רק כשלשרת יש גישת רשת אל apps.education.gov.il — ברוב ספקי ה-cloud
 * בחו"ל (כגון Render/Railway) האתר חוסם את הגישה והקריאה תיכשל ב-timeout. במצב כזה
 * מריצים את אותה פונקציה ממחשב בישראל (scripts/mitar-sync-local.ts, source='local'),
 * או relay שפונה ל-/api/mitar-sync/ingest (ראו lib/mitar-ingest.ts).
 */
export async function runMitarSync(source: MitarSyncSource = 'server'): Promise<MitarSyncResult> {
  const db = await getDb();
  const syncRunId = `MITAR_SYNC_${Date.now()}`;
  const startedAt = new Date();
  const results: IngestMonthResult[] = [];

  try {
    const cookie = await openMitarSession(BENEFICIARY_CODE);
    const available = await listAvailableMonths(cookie);
    const toCheck = available.slice(0, MONTHS_PER_RUN);

    for (const { month, year } of toCheck) {
      try {
        const zipBuf = await downloadMonthZip(cookie, month, year);
        results.push(await ingestMitarZip(month, year, zipBuf, source));
      } catch (monthError) {
        const message = monthError instanceof Error ? monthError.message : 'שגיאה לא ידועה';
        await db.collection('MITAR_SYNC_RUNS').insertOne({
          sync_run_id: syncRunId,
          month,
          year,
          status: 'error',
          error: message,
          source,
          started_at: new Date(),
          finished_at: new Date(),
        });
        results.push({ month, year, status: 'error', error: message });
      }
    }

    return {
      ok: !results.some((r) => r.status === 'error'),
      syncRunId,
      startedAt,
      finishedAt: new Date(),
      checkedMonths: toCheck.length,
      results,
    };
  } catch (sessionError) {
    const message = sessionError instanceof Error ? sessionError.message : 'שגיאה לא ידועה בהתחברות למית"ר';
    await db.collection('MITAR_SYNC_RUNS').insertOne({
      sync_run_id: syncRunId,
      status: 'error',
      error: message,
      source,
      started_at: startedAt,
      finished_at: new Date(),
    });
    return {
      ok: false,
      syncRunId,
      startedAt,
      finishedAt: new Date(),
      checkedMonths: 0,
      results: [],
      error: message,
    };
  }
}
