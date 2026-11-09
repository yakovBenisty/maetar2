import AdmZip from 'adm-zip';
import { getDb } from './mongo';
import { openMitarSession, listAvailableMonths, downloadMonthZip } from './mitar-client';
import { importFiles, type ImportSummaryItem } from './import-engine';

const BENEFICIARY_CODE = process.env.MITAR_BENEFICIARY_CODE || '10402469';
// כמה מהחודשים העדכניים ביותר (מתוך רשימת מית"ר) לבדוק/לייבא בכל ריצה.
// מספיק קטן כדי לא להעמיס על שרת משרד החינוך, אך מכסה גם חודש שפורסם באיחור.
const MONTHS_PER_RUN = Number(process.env.MITAR_SYNC_MONTHS_PER_RUN || 2);

export interface MitarSyncMonthResult {
  month: number;
  year: number;
  status: 'success' | 'error';
  filesCount?: number;
  summary?: ImportSummaryItem[];
  error?: string;
}

export interface MitarSyncResult {
  ok: boolean;
  syncRunId: string;
  startedAt: Date;
  finishedAt: Date;
  checkedMonths: number;
  results: MitarSyncMonthResult[];
  error?: string;
}

export async function runMitarSync(): Promise<MitarSyncResult> {
  const db = await getDb();
  const syncRunId = `MITAR_SYNC_${Date.now()}`;
  const startedAt = new Date();
  const results: MitarSyncMonthResult[] = [];

  try {
    const cookie = await openMitarSession(BENEFICIARY_CODE);
    const available = await listAvailableMonths(cookie);
    const toCheck = available.slice(0, MONTHS_PER_RUN);

    for (const { month, year } of toCheck) {
      const monthStartedAt = new Date();
      try {
        const zipBuf = await downloadMonthZip(cookie, month, year);
        const zip = new AdmZip(zipBuf);
        const files = zip
          .getEntries()
          .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.csv'))
          .map((entry) => ({ filename: entry.entryName, buffer: entry.getData() }));

        const { runId: importRunId, summary } = await importFiles(files, 'skip');

        await db.collection('MITAR_SYNC_RUNS').insertOne({
          sync_run_id: syncRunId,
          month,
          year,
          status: 'success',
          files_count: files.length,
          import_run_id: importRunId,
          summary,
          started_at: monthStartedAt,
          finished_at: new Date(),
        });
        results.push({ month, year, status: 'success', filesCount: files.length, summary });
      } catch (monthError) {
        const message = monthError instanceof Error ? monthError.message : 'שגיאה לא ידועה';
        await db.collection('MITAR_SYNC_RUNS').insertOne({
          sync_run_id: syncRunId,
          month,
          year,
          status: 'error',
          error: message,
          started_at: monthStartedAt,
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
