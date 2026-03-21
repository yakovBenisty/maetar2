import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { Readable } from 'stream';
import csvParser from 'csv-parser';

function normalizeColumnName(col: string): string {
  return col.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '_');
}

function parseDateString(dateStr: string): Date | null {
  const parts = dateStr.trim().split('/');
  if (parts.length === 2) {
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    if (p1 >= 1 && p1 <= 12 && p2 > 1900) {
      return new Date(Date.UTC(p2, p1 - 1, 1));
    }
  }
  return null;
}

function formatValue(val: unknown): string | number | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  if (!isNaN(num)) return num;
  return trimmed;
}

const FILE_REGEX = /^(\d+)_(\d{1,2})_(\d{4})([A-Z0-9]+)\.csv$/i;

const DATE_FIELDS = new Set(['חודש_חישוב', 'חודש_תחולה']);

interface ImportSummaryItem {
  filename: string;
  collection: string;
  rows: number;
  status: 'imported' | 'skipped' | 'replaced' | 'error';
  error?: string;
}

function parseCSVFromBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    const text = buffer.toString('utf-8');
    const readable = Readable.from([text]);

    readable
      .pipe(
        csvParser({
          mapHeaders: ({ header }: { header: string }) => normalizeColumnName(header),
          quote: '\x00',
          escape: '\x00',
        } as Parameters<typeof csvParser>[0])
      )
      .on('data', (row: Record<string, string>) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          if (DATE_FIELDS.has(key)) {
            const parsed = parseDateString(String(val));
            normalized[key] = parsed ?? formatValue(val);
          } else {
            normalized[key] = formatValue(val);
          }
        }
        rows.push(normalized);
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

export async function POST(req: NextRequest) {
  const summary: ImportSummaryItem[] = [];

  try {
    const formData = await req.formData();
    const strategy = (formData.get('strategy') as string) || 'skip';
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: 'לא נבחרו קבצים' }, { status: 400 });
    }

    const db = await getDb();
    const runId = `RUN_${Date.now()}`;
    const importTimestamp = new Date();

    for (const file of files) {
      // Strip any folder path — take only the base filename
      const filename = (file.name ?? '').split('/').pop()?.split('\\').pop() ?? file.name;

      // Skip non-CSV files silently (e.g. other files in the folder)
      if (!filename.toLowerCase().endsWith('.csv')) continue;

      const match = FILE_REGEX.exec(filename);

      if (!match) {
        summary.push({
          filename,
          collection: 'לא זוהה',
          rows: 0,
          status: 'error',
          error: 'שם הקובץ אינו תואם את הפורמט הנדרש',
        });
        continue;
      }

      const collectionName = match[4].toUpperCase();

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const rows = await parseCSVFromBuffer(buffer);

        const existingCount = await db
          .collection(collectionName)
          .countDocuments({ source_file: filename });

        if (existingCount > 0) {
          if (strategy === 'skip') {
            summary.push({
              filename,
              collection: collectionName,
              rows: rows.length,
              status: 'skipped',
            });
            continue;
          } else if (strategy === 'replace') {
            await db.collection(collectionName).deleteMany({ source_file: filename });
          }
        }

        const docsToInsert = rows.map((row) => ({
          ...row,
          source_file: filename,
          import_timestamp: importTimestamp,
          run_id: runId,
          file_type: collectionName,
        }));

        if (docsToInsert.length > 0) {
          await db.collection(collectionName).insertMany(docsToInsert);
        }

        summary.push({
          filename,
          collection: collectionName,
          rows: docsToInsert.length,
          status: existingCount > 0 && strategy === 'replace' ? 'replaced' : 'imported',
        });
      } catch (fileError) {
        summary.push({
          filename,
          collection: collectionName,
          rows: 0,
          status: 'error',
          error: fileError instanceof Error ? fileError.message : 'שגיאה לא ידועה',
        });
      }
    }

    return NextResponse.json({ ok: true, runId, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'שגיאת שרת',
        summary,
      },
      { status: 500 }
    );
  }
}
