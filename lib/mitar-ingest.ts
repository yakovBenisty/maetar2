import AdmZip from 'adm-zip';
import { getDb } from './mongo';
import { importFiles, type ImportSummaryItem } from './import-engine';

export interface IngestMonthResult {
  month: number;
  year: number;
  status: 'success' | 'error';
  filesCount?: number;
  summary?: ImportSummaryItem[];
  error?: string;
}

export type MitarSyncSource = 'relay' | 'server' | 'local';

// מכסת האחסון של ה-cluster (Atlas M0 = 512MB של נתונים+אינדקסים). חריגה ממנה חוסמת את
// כל הכתיבות במערכת, ולכן ייבוא שלא ייכנס נעצר מראש. 0 מבטל את הבדיקה (cluster בתשלום).
const STORAGE_QUOTA_MB = Number(process.env.MONGO_STORAGE_QUOTA_MB ?? 512);
// יחס גודל מסמכי BSON לגודל ה-CSV שממנו נוצרו (שמות השדות חוזרים בכל שורה), נמדד על MUCARIM.
const BSON_TO_CSV_RATIO = 4;

async function assertStorageAvailable(db: Awaited<ReturnType<typeof getDb>>, csvBytes: number): Promise<void> {
  if (!STORAGE_QUOTA_MB) return;
  const stats = await db.stats();
  const usedMb = (stats.dataSize + stats.indexSize) / 1048576;
  const neededMb = (csvBytes * BSON_TO_CSV_RATIO) / 1048576;
  if (usedMb + neededMb > STORAGE_QUOTA_MB) {
    throw new Error(
      `אין מספיק מקום במסד הנתונים: בשימוש ${usedMb.toFixed(0)}MB מתוך ${STORAGE_QUOTA_MB}MB, והייבוא דורש כ-${neededMb.toFixed(0)}MB נוספים. ` +
        'יש לשדרג את ה-cluster או לפנות נתונים ישנים לפני הייבוא.'
    );
  }
}

/**
 * מייבא ZIP של קובצי מית"ר שהורדו כבר (על ידי קורא שהורדתו הצליחה, למשל ה-relay
 * שרץ ברשת הרשות) — מחלץ את קובצי ה-CSV ומריץ עליהם את מנוע הייבוא הקיים, בדיוק
 * כמו ריצה רגילה של runMitarSync, אך בלי לבצע בעצמו את ה-fetch אל אתר מית"ר.
 */
export async function ingestMitarZip(
  month: number,
  year: number,
  zipBuf: Buffer,
  source: MitarSyncSource = 'relay'
): Promise<IngestMonthResult> {
  const db = await getDb();
  const syncRunId = `MITAR_SYNC_${Date.now()}`;
  const startedAt = new Date();

  try {
    const zip = new AdmZip(zipBuf);
    const files = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.csv'))
      .map((entry) => ({ filename: entry.entryName, buffer: entry.getData() }));

    // רק קבצים שעוד לא יובאו תופסים מקום חדש (אסטרטגיית skip מדלגת על הקיימים).
    let newBytes = 0;
    for (const file of files) {
      const basename = file.filename.split('/').pop() ?? file.filename;
      const collection = /^\d+_\d{1,2}_\d{4}([A-Z0-9]+)\.csv$/i.exec(basename)?.[1].toUpperCase();
      const exists = collection && (await db.collection(collection).findOne({ source_file: basename }, { projection: { _id: 1 } }));
      if (!exists) newBytes += file.buffer.length;
    }
    await assertStorageAvailable(db, newBytes);

    const { runId: importRunId, summary } = await importFiles(files, 'skip');

    await db.collection('MITAR_SYNC_RUNS').insertOne({
      sync_run_id: syncRunId,
      month,
      year,
      status: 'success',
      files_count: files.length,
      import_run_id: importRunId,
      summary,
      source,
      started_at: startedAt,
      finished_at: new Date(),
    });
    return { month, year, status: 'success', filesCount: files.length, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'שגיאה לא ידועה';
    await db.collection('MITAR_SYNC_RUNS').insertOne({
      sync_run_id: syncRunId,
      month,
      year,
      status: 'error',
      error: message,
      source,
      started_at: startedAt,
      finished_at: new Date(),
    });
    return { month, year, status: 'error', error: message };
  }
}
