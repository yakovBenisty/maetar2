import { getDb } from './mongo';
import { Readable } from 'stream';
import csvParser from 'csv-parser';

function normalizeColumnName(col: string): string {
  return col.replace(/^﻿/, '').trim().replace(/\s+/g, '_');
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

export interface ImportSummaryItem {
  filename: string;
  collection: string;
  rows: number;
  status: 'imported' | 'skipped' | 'replaced' | 'error';
  error?: string;
}

export interface ImportInputFile {
  filename: string;
  buffer: Buffer;
}

export interface ImportFilesResult {
  runId: string;
  summary: ImportSummaryItem[];
}

interface ParsedFile {
  filename: string;
  collectionName: string;
  rows: Record<string, unknown>[];
}

/**
 * קובצי מית"ר עד אמצע 2024 מקודדים windows-1255 (ללא BOM), והחדשים UTF-8.
 * פענוח קובץ ישן כ-UTF-8 הופך כל אות עברית לתו החלפה (U+FFFD) — כולל שמות
 * העמודות — והשורות נשמרות ב-DB בלתי נראות לכל שאילתה.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString('utf-8');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1255').decode(buffer);
}

function parseCSVFromBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let allHeaders: string[] = [];
    const text = decodeCsvBuffer(buffer);
    const readable = Readable.from([text]);

    readable
      .pipe(
        csvParser({
          mapHeaders: ({ header }: { header: string }) => normalizeColumnName(header),
          quote: '\x00',
          escape: '\x00',
        } as Parameters<typeof csvParser>[0])
      )
      .on('headers', (headers: string[]) => {
        allHeaders = headers;
      })
      .on('data', (row: Record<string, string>) => {
        const normalized: Record<string, unknown> = {};
        // אתחל את כל העמודות ל-null — עמודות חסרות (כגון הערות ריקה) יישמרו כ-null
        for (const h of allHeaders) normalized[h] = null;
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

export async function importFiles(
  files: ImportInputFile[],
  strategy: 'skip' | 'replace'
): Promise<ImportFilesResult> {
  const summary: ImportSummaryItem[] = [];
  const db = await getDb();
  const runId = `RUN_${Date.now()}`;
  const importTimestamp = new Date();

  const parsedFiles: ParsedFile[] = [];

  await Promise.all(
    files.map(async (file) => {
      const filename = file.filename.split('/').pop()?.split('\\').pop() ?? file.filename;
      if (!filename.toLowerCase().endsWith('.csv')) return;

      const match = FILE_REGEX.exec(filename);
      if (!match) {
        summary.push({ filename, collection: 'לא זוהה', rows: 0, status: 'error', error: 'שם הקובץ אינו תואם את הפורמט הנדרש' });
        return;
      }

      try {
        const collectionName = match[4].toUpperCase();
        const rows = await parseCSVFromBuffer(file.buffer);
        parsedFiles.push({ filename, collectionName, rows });
      } catch (parseError) {
        summary.push({
          filename,
          collection: match[4].toUpperCase(),
          rows: 0,
          status: 'error',
          error: parseError instanceof Error ? parseError.message : 'שגיאה בפרסור',
        });
      }
    })
  );

  await Promise.all(
    parsedFiles.map(async ({ filename, collectionName, rows }) => {
      try {
        const existing = await db
          .collection(collectionName)
          .findOne({ source_file: filename }, { projection: { _id: 1 } });

        if (existing) {
          if (strategy === 'skip') {
            summary.push({ filename, collection: collectionName, rows: rows.length, status: 'skipped' });
            return;
          }
          await db.collection(collectionName).deleteMany({ source_file: filename });
        }

        const docsToInsert = rows.map((row) => ({
          ...row,
          source_file: filename,
          import_timestamp: importTimestamp,
          run_id: runId,
          file_type: collectionName,
        }));

        if (docsToInsert.length > 0) {
          await db.collection(collectionName).insertMany(docsToInsert, { ordered: false });
        }

        summary.push({
          filename,
          collection: collectionName,
          rows: docsToInsert.length,
          status: existing ? 'replaced' : 'imported',
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
    })
  );

  return { runId, summary };
}
