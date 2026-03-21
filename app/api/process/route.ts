import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoseData {
  code: string | number;
  name?: string;
  table_type?: string;       // 'שונות' | 'מוסדות'
  direction?: string;        // 'חובה' | 'זכות'
  seif?: string | number;    // סעיף ישיר לנושאי שונות
  mosad_col_name?: string;   // שם שדה ב-MOSDOT לנושאי מוסדות
  seif_hova?: string | number | null;  // legacy fallback
  seif_zhut?: string | number | null;  // legacy fallback
  [key: string]: unknown;
}

interface MosadData {
  code: string | number;
  name?: string;
  [key: string]: unknown;
}

interface CheshbonitDoc {
  קוד_נושא?: string | number;
  תאור_נושא?: string;
  חודש_תחולה?: Date | string | null;
  יתרת_ביצוע_החודש?: number | null;
  סמל_מוטב?: string | number;
  שם_מוטב?: string;
  [key: string]: unknown;
}

interface DetailDoc {
  קוד_נושא?: string | number;
  סמל_מוסד?: string | number;
  שם_מוסד?: string;
  חודש_תחולה?: Date | string | null;
  הפרש_מחושב?: number | null;
  סכום_מחושב?: number | null;
  [key: string]: unknown;
}

interface CommandEntry {
  run_id: string;
  calc_month: Date;
  split_month: Date;
  קוד_נושא: string | number;
  שם_נושא: string;
  table_type: string;
  סמל_מוסד?: string | number;
  שם_מוסד?: string;
  תיאור?: string;
  חודש_תחולה?: Date | string | null;
  תאריך_ערך?: Date;
  סכום_חובה?: number;   // חובה: hefresh * -1
  סכום_זכות?: number;   // זכות: hefresh כפי שהוא
  seif_hova: string | null;
  seif_zhut: string | null;
  תקופה: 'ראשונה' | 'שנייה';
  created_at: Date;
}

interface ComparisonEntry {
  קוד_נושא: string | number;
  invoiceTotal: number;
  baseTotal: number;
  yadaniTotal: number;
  matched: boolean;
  matchType: 'base' | 'base+yadani' | 'none';
}

interface LogEntry {
  type: 'error' | 'warning' | 'info';
  קוד_נושא: string | number;
  message: string;
}

interface RejectedEntry {
  קוד_נושא: string | number;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthKey(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCFullYear()}`;
}

function lastDayOfMonth(d: Date | string | null | undefined): Date {
  if (!d) return new Date();
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0));
}

function isBefore(tchula: Date | string | null, splitDate: Date): boolean {
  if (!tchula) return true;
  const dt = tchula instanceof Date ? tchula : new Date(tchula);
  return dt < splitDate;
}

// מיפוי שמות עמודות עבריים (כפי שמגיעים מ-Excel/Google Sheets) לשמות שדות ב-MongoDB
const HEBREW_COL_TO_FIELD: Record<string, string> = {
  'ניהול עצמי': 'nihul_atsmi',
  'הזנה':       'hazana',
  'קרב':        'krav',
  'שכר':        'sachar',
  'סעיף זכות':  'seif_zhut',
  'סעיף חובה':  'seif_hova',
  'פרויקטים':   'projects',
};

// פתרון סעיף לפי כיוון + סוג נושא
function resolveSeif(
  nose: NoseData,
  mosad: MosadData | null,
  isDebit: boolean,
  logs?: LogEntry[],
  context?: string
): { hova: string | null; zhut: string | null; colName: string } | null {
  if (nose.table_type === 'שונות') {
    const seif = nose.seif != null && nose.seif !== '' ? String(nose.seif) : null;
    if (!seif) return null;
    return isDebit ? { hova: seif, zhut: null, colName: 'seif' } : { hova: null, zhut: seif, colName: 'seif' };
  }

  // מוסדות: תרגם שם עמודה עברי לשם שדה MongoDB, אחרת fallback לפי כיוון
  const rawCol = nose.mosad_col_name?.trim() || '';
  const colName = HEBREW_COL_TO_FIELD[rawCol] || rawCol || (isDebit ? 'seif_hova' : 'seif_zhut');

  if (!mosad) return null;
  const val = mosad[colName];
  if (val === null || val === undefined || val === '') {
    if (logs && context) {
      logs.push({ type: 'error', קוד_נושא: context, message: `סעיף חסר | עמודה: ${rawCol} (שדה: ${colName})` });
    }
    return null;
  }
  const seif = String(val);
  return isDebit ? { hova: seif, zhut: null, colName } : { hova: null, zhut: seif, colName };
}

// קיבוץ שורות פירוט לפי (סמל_מוסד + חודש_תחולה)
function groupDetailRows(rows: Array<{ mosadId: string; mosadName: string; tchula: Date | string | null; hefresh: number }>) {
  const groups: Record<string, { mosadId: string; mosadName: string; tchula: Date | string | null; total: number }> = {};
  for (const r of rows) {
    const key = `${r.mosadId}|${monthKey(r.tchula)}`;
    if (!groups[key]) {
      groups[key] = { mosadId: r.mosadId, mosadName: r.mosadName, tchula: r.tchula, total: 0 };
    }
    groups[key].total += r.hefresh;
  }
  return groups;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { calc_month: string; split_month: string; value_date?: string };
    const { calc_month, split_month, value_date } = body;

    if (!calc_month || !split_month) {
      return NextResponse.json({ ok: false, error: 'חסרים פרמטרים' }, { status: 400 });
    }

    const [calcYear, calcMonthNum] = calc_month.split('-').map(Number);
    const [splitYear, splitMonthNum] = split_month.split('-').map(Number);

    const calcDate = new Date(Date.UTC(calcYear, calcMonthNum - 1, 1));
    const splitDate = new Date(Date.UTC(splitYear, splitMonthNum - 1, 1));

    // תאריך ערך: מהבקשה אם סופק, אחרת סוף החודש הנוכחי
    const valueDate: Date = value_date
      ? new Date(value_date + 'T00:00:00Z')
      : lastDayOfMonth(new Date());

    const db = await getDb();
    const runId = `RUN_${Date.now()}`;
    const startedAt = new Date();

    // טעינת כל הנתונים
    const [noseme, mosdot, cheshbonit, mucarim, sharatim, yadaniim] = await Promise.all([
      db.collection('NOSEME').find({}).toArray() as unknown as Promise<NoseData[]>,
      db.collection('MOSDOT').find({}).toArray() as unknown as Promise<MosadData[]>,
      db.collection('CHESHBONIT').find({ חודש_חישוב: calcDate }).toArray() as unknown as Promise<CheshbonitDoc[]>,
      db.collection('MUCARIM').find({ חודש_חישוב: calcDate }).toArray() as unknown as Promise<DetailDoc[]>,
      db.collection('SHARATIM').find({ חודש_חישוב: calcDate }).toArray() as unknown as Promise<DetailDoc[]>,
      db.collection('YADANIIM').find({ חודש_חישוב: calcDate }).toArray() as unknown as Promise<DetailDoc[]>,
    ]);

    // מפות
    const noseMap: Record<string, NoseData> = {};
    for (const n of noseme) noseMap[String(n.code)] = n;

    const mosdotMap: Record<string, MosadData> = {};
    for (const m of mosdot) mosdotMap[String(m.code)] = m;

    const commands: CommandEntry[] = [];
    const logs: LogEntry[] = [];
    const rejected: RejectedEntry[] = [];

    // טבלת השוואה: קוד → { invoiceTotal, baseTotal, yadaniTotal }
    const compMap: Record<string, { invoiceTotal: number; baseTotal: number; yadaniTotal: number }> = {};

    // ─── לולאה ראשית: כל שורת חשבונית ────────────────────────────────────────
    for (const inv of cheshbonit) {
      const code = String(inv['קוד_נושא'] ?? '');
      const hefresh = Number(inv['יתרת_ביצוע_החודש'] ?? 0);
      const tchula = inv['חודש_תחולה'] ?? null;

      if (!code || hefresh === 0) continue;

      // עדכון טבלת השוואה - חלק חשבונית
      if (!compMap[code]) compMap[code] = { invoiceTotal: 0, baseTotal: 0, yadaniTotal: 0 };
      compMap[code].invoiceTotal += hefresh;

      // בדיקת נושא
      const nose = noseMap[code];
      if (!nose) {
        logs.push({ type: 'error', קוד_נושא: code, message: `נושא לא קיים בטבלת נושאים | קוד: ${code} | שם: ${inv['תאור_נושא'] ?? ''}` });
        rejected.push({ קוד_נושא: code, reason: 'קוד נושא לא נמצא' });
        continue;
      }

      const noseName = String(nose.name ?? '');
      const tableType = String(nose.table_type ?? '');
      const isDebit = nose.direction === 'חובה';
      const tchulaKey = monthKey(tchula);
      const period: 'ראשונה' | 'שנייה' = isBefore(tchula, splitDate) ? 'ראשונה' : 'שנייה';

      // ═══ שונות ═══════════════════════════════════════════════════════════════
      if (tableType === 'שונות') {
        const seif = resolveSeif(nose, null, isDebit);
        if (!seif) {
          logs.push({ type: 'error', קוד_נושא: code, message: `נושא שונות ללא סעיף | קוד: ${code} | ${noseName}` });
          rejected.push({ קוד_נושא: code, reason: 'סעיף חסר בנושא שונות' });
          continue;
        }

        const rawMosadId = String(inv['סמל_מוטב'] ?? '').trim();
        if (!rawMosadId || isNaN(Number(rawMosadId))) {
          logs.push({ type: 'warning', קוד_נושא: code, message: `נושא שונות: סמל מוטב לא תקין "${rawMosadId}" | קוד: ${code}` });
          rejected.push({ קוד_נושא: code, reason: `סמל מוטב לא תקין: "${rawMosadId}"` });
          continue;
        }
        const mosadName = String(inv['שם_מוטב'] ?? '');
        commands.push({
          run_id: runId,
          calc_month: calcDate,
          split_month: splitDate,
          קוד_נושא: code,
          שם_נושא: noseName,
          table_type: tableType,
          סמל_מוסד: rawMosadId,
          שם_מוסד: mosadName,
          תיאור: `${noseName} | ${code} | ${mosadName} | ${monthKey(tchula)}`,
          חודש_תחולה: tchula,
          תאריך_ערך: valueDate,
          ...(isDebit ? { סכום_חובה: hefresh * -1 } : { סכום_זכות: hefresh }),
          seif_hova: seif.hova,
          seif_zhut: seif.zhut,
          תקופה: period,
          created_at: new Date(),
        });
        continue;
      }

      // ═══ מוסדות ══════════════════════════════════════════════════════════════
      if (tableType === 'מוסדות') {

        // שלב 1: חפש במוכרים לפי נושא + חודש_תחולה (סנן הפרש_מחושב = 0)
        const mucarimRows = mucarim.filter(
          (r) => String(r['קוד_נושא'] ?? '') === code &&
                 monthKey(r['חודש_תחולה']) === tchulaKey &&
                 Number(r['הפרש_מחושב'] ?? 0) !== 0
        );
        let sourceRows = mucarimRows;
        let sourceName = 'מוכרים';

        if (sourceRows.length === 0) {
          // שלב 2: חפש בשרתים (סנן הפרש_מחושב = 0)
          const sharatimRows = sharatim.filter(
            (r) => String(r['קוד_נושא'] ?? '') === code &&
                   monthKey(r['חודש_תחולה']) === tchulaKey &&
                   Number(r['הפרש_מחושב'] ?? 0) !== 0
          );
          if (sharatimRows.length > 0) {
            sourceRows = sharatimRows;
            sourceName = 'שרתים מזכירים';
          }
        }

        if (sourceRows.length === 0) {
          logs.push({ type: 'error', קוד_נושא: code, message: `נושא ${noseName} (${code}) חודש ${tchulaKey} לא נמצא במוכרים ולא בשרתים` });
          rejected.push({ קוד_נושא: code, reason: `לא נמצא במוכרים/שרתים לחודש ${tchulaKey}` });
          continue;
        }

        const sourceSum = sourceRows.reduce((s, r) => s + Number(r['הפרש_מחושב'] ?? 0), 0);

        // עדכון השוואה - חלק בסיס
        compMap[code].baseTotal += sourceSum;

        const tolerance = 1;

        if (Math.abs(hefresh - sourceSum) <= tolerance) {
          // התאמה מלאה
          _buildCommands(sourceRows, [], nose, code, noseName, isDebit, mosdotMap, splitDate,
            runId, calcDate, splitDate, valueDate, commands, rejected, logs);
          continue;
        }

        // שלב 3: הפרש - בדוק ידניים (סנן סכום_מחושב = 0)
        const yadanimRows = yadaniim.filter(
          (r) => String(r['קוד_נושא'] ?? '') === code &&
                 monthKey(r['חודש_תחולה']) === tchulaKey &&
                 Number(r['סכום_מחושב'] ?? 0) !== 0
        );
        const yadanimSum = yadanimRows.reduce((s, r) => s + Number(r['סכום_מחושב'] ?? 0), 0);

        // עדכון השוואה - חלק ידני
        compMap[code].yadaniTotal += yadanimSum;

        if (Math.abs(hefresh - (sourceSum + yadanimSum)) <= tolerance) {
          // התאמה עם ידניים
          logs.push({ type: 'info', קוד_נושא: code, message: `נושא ${noseName} (${code}) חודש ${tchulaKey} | התאמה עם ידניים | ${sourceName}: ${sourceSum.toFixed(2)} | ידניים: ${yadanimSum.toFixed(2)}` });
          _buildCommands(sourceRows, yadanimRows, nose, code, noseName, isDebit, mosdotMap, splitDate,
            runId, calcDate, splitDate, valueDate, commands, rejected, logs);
          continue;
        }

        // לא התאים
        logs.push({ type: 'warning', קוד_נושא: code, message: `חוסר התאמה | נושא ${noseName} (${code}) חודש ${tchulaKey} | חשבונית: ${hefresh.toFixed(2)} | ${sourceName}: ${sourceSum.toFixed(2)} | ידניים: ${yadanimSum.toFixed(2)} | הפרש שנותר: ${(hefresh - sourceSum - yadanimSum).toFixed(2)}` });
        logs.push({ type: 'error', קוד_נושא: code, message: `>>> לא נוצרה פקודה לנושא ${noseName} חודש ${tchulaKey} - יש לבדוק <<<` });
        rejected.push({ קוד_נושא: code, reason: `חוסר התאמה לחודש ${tchulaKey}: חשבונית=${hefresh.toFixed(2)}, ${sourceName}=${sourceSum.toFixed(2)}, ידניים=${yadanimSum.toFixed(2)}` });

      } else {
        logs.push({ type: 'warning', קוד_נושא: code, message: `סוג טבלה לא מוכר: ${tableType}` });
      }
    }

    // ─── מיון פקודות לפי קוד נושא + חודש תחולה ──────────────────────────────
    commands.sort((a, b) => {
      const codeA = String(a['קוד_נושא']);
      const codeB = String(b['קוד_נושא']);
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      const tA = a['חודש_תחולה'] ? new Date(a['חודש_תחולה'] as string).getTime() : 0;
      const tB = b['חודש_תחולה'] ? new Date(b['חודש_תחולה'] as string).getTime() : 0;
      return tA - tB;
    });

    // ─── השוואה ───────────────────────────────────────────────────────────────
    const comparison: ComparisonEntry[] = Object.entries(compMap).map(([code, c]) => {
      let matchType: 'base' | 'base+yadani' | 'none' = 'none';
      if (Math.abs(c.invoiceTotal - c.baseTotal) <= 1) matchType = 'base';
      else if (Math.abs(c.invoiceTotal - (c.baseTotal + c.yadaniTotal)) <= 1) matchType = 'base+yadani';
      return { קוד_נושא: code, ...c, matched: matchType !== 'none', matchType };
    });

    // ─── שמירה ל-DB ───────────────────────────────────────────────────────────
    await db.collection('COMMANDS').deleteMany({ calc_month: calcDate });
    if (commands.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.collection('COMMANDS').insertMany(commands as unknown as any[]);
    }

    const period1Commands = commands.filter((c) => c['תקופה'] === 'ראשונה');
    const period2Commands = commands.filter((c) => c['תקופה'] === 'שנייה');
    const totalIncome  = commands.reduce((s, c) => s + (c.סכום_זכות ?? 0), 0);
    const totalExpense = commands.reduce((s, c) => s + Math.abs(c.סכום_חובה ?? 0), 0);
    const totalAmount  = totalIncome - totalExpense;
    const p1Amount     = period1Commands.reduce((s, c) => s + (c.סכום_זכות ?? 0) - Math.abs(c.סכום_חובה ?? 0), 0);
    const p2Amount     = period2Commands.reduce((s, c) => s + (c.סכום_זכות ?? 0) - Math.abs(c.סכום_חובה ?? 0), 0);

    const runDoc = {
      run_id: runId,
      calc_month: calcDate,
      split_month: splitDate,
      status: logs.some((l) => l.type === 'error') ? 'error' : 'success',
      commands: commands.length,
      total: totalAmount,
      errors: logs.filter((l) => l.type === 'error').length,
      warnings: logs.filter((l) => l.type === 'warning').length,
      unprocessed: rejected.length,
      started_at: startedAt,
      completed_at: new Date(),
    };
    await db.collection('runs').insertOne(runDoc);

    // שורת סיכום (חשבוניות כולל לכל תקופה)
    const p1InvoiceTotal = cheshbonit
      .filter((inv) => isBefore(inv['חודש_תחולה'] ?? null, splitDate))
      .reduce((s, inv) => s + Number(inv['יתרת_ביצוע_החודש'] ?? 0), 0);
    const p2InvoiceTotal = cheshbonit
      .filter((inv) => !isBefore(inv['חודש_תחולה'] ?? null, splitDate))
      .reduce((s, inv) => s + Number(inv['יתרת_ביצוע_החודש'] ?? 0), 0);

    // שורת הסיכום לפי מבנה GS: [seif='7100001000', col_hova=invTotal, col_zhut='']
    const summaryRow = (period: 'ראשונה' | 'שנייה', invTotal: number): CommandEntry => ({
      run_id: runId,
      calc_month: calcDate,
      split_month: splitDate,
      קוד_נושא: '',
      שם_נושא: '',
      table_type: 'סיכום',
      תיאור: 'חוז משרד החינוך',
      תאריך_ערך: valueDate,
      סכום_חובה: invTotal,
      seif_hova: '7100001000',
      seif_zhut: null,
      תקופה: period,
      created_at: new Date(),
    });

    return NextResponse.json({
      ok: true,
      runId,
      tabs: {
        summary: {
          total: commands.length,
          totalAmount,
          totalIncome,
          totalExpense,
          period1: period1Commands.length,
          period1Amount: p1Amount,
          period2: period2Commands.length,
          period2Amount: p2Amount,
          invoiceTotal: p1InvoiceTotal + p2InvoiceTotal,
          period1InvoiceTotal: p1InvoiceTotal,
          period2InvoiceTotal: p2InvoiceTotal,
          errors: logs.filter((l) => l.type === 'error').length,
          warnings: logs.filter((l) => l.type === 'warning').length,
          rejected: rejected.length,
        },
        period1: [...period1Commands, ...(p1InvoiceTotal !== 0 ? [summaryRow('ראשונה', p1InvoiceTotal)] : [])],
        period2: [...period2Commands, ...(p2InvoiceTotal !== 0 ? [summaryRow('שנייה', p2InvoiceTotal)] : [])],
        logs,
        comparison,
        rejected,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאת שרת' },
      { status: 500 }
    );
  }
}

// ─── בניית פקודות מרשימת שורות + ידניים ──────────────────────────────────────
function _buildCommands(
  sourceRows: DetailDoc[],
  yadanimRows: DetailDoc[],
  nose: NoseData,
  code: string,
  noseName: string,
  isDebit: boolean,
  mosdotMap: Record<string, MosadData>,
  splitDate: Date,
  runId: string,
  calcDate: Date,
  splitMonth: Date,
  valueDate: Date,
  commands: CommandEntry[],
  rejected: RejectedEntry[],
  logs: LogEntry[]
) {
  const allRows = [
    ...sourceRows
      .map((r) => ({
        mosadId: String(r['סמל_מוסד'] ?? ''),
        mosadName: String(r['שם_מוסד'] ?? ''),
        tchula: r['חודש_תחולה'] ?? null,
        hefresh: Number(r['הפרש_מחושב'] ?? 0),
      }))
      .filter((r) => r.hefresh !== 0),
    ...yadanimRows
      .map((r) => ({
        mosadId: String(r['סמל_מוסד'] ?? ''),
        mosadName: String(r['שם_מוסד'] ?? ''),
        tchula: r['חודש_תחולה'] ?? null,
        hefresh: Number(r['סכום_מחושב'] ?? 0),
      }))
      .filter((r) => r.hefresh !== 0),
  ];

  const groups = groupDetailRows(allRows);

  for (const grp of Object.values(groups)) {
    const mosadData = mosdotMap[grp.mosadId] ?? null;

    if (!mosadData) {
      logs.push({ type: 'error', קוד_נושא: code, message: `מוסד לא קיים: ${grp.mosadId} | נושא ${noseName}` });
      rejected.push({ קוד_נושא: code, reason: `מוסד לא קיים: ${grp.mosadId}` });
      continue;
    }

    const seif = resolveSeif(nose, mosadData, isDebit, logs, code);
    if (!seif) {
      rejected.push({ קוד_נושא: code, reason: `סעיף חסר למוסד ${grp.mosadId} | עמודה: ${nose.mosad_col_name ?? ''}` });
      continue;
    }

    const period: 'ראשונה' | 'שנייה' = isBefore(grp.tchula, splitDate) ? 'ראשונה' : 'שנייה';
    const finalMosadName = grp.mosadName || String(mosadData.name ?? '');

    commands.push({
      run_id: runId,
      calc_month: calcDate,
      split_month: splitMonth,
      קוד_נושא: code,
      שם_נושא: noseName,
      table_type: String(nose.table_type ?? ''),
      סמל_מוסד: grp.mosadId,
      שם_מוסד: finalMosadName,
      תיאור: `${noseName} | ${code} | ${finalMosadName} | ${monthKey(grp.tchula)}`,
      חודש_תחולה: grp.tchula,
      תאריך_ערך: valueDate,
      ...(isDebit ? { סכום_חובה: grp.total * -1 } : { סכום_זכות: grp.total }),
      seif_hova: seif.hova,
      seif_zhut: seif.zhut,
      תקופה: period,
      created_at: new Date(),
    });
  }
}
