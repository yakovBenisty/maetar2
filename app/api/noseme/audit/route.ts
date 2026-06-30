import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

/* ─── Helpers ─────────────────────────────────────────────── */

function toYYYYMM(raw: unknown): string {
  if (raw instanceof Date) {
    const y = raw.getFullYear(), mo = raw.getMonth() + 1;
    return `${y}-${String(mo).padStart(2, '0')}`;
  }
  const s = String(raw ?? '').trim();
  const iso = s.match(/^(\d{4})[.\-\/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const rev = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (rev) return `${rev[2]}-${rev[1].padStart(2, '0')}`;
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4)}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch { /* ignore */ }
  return s;
}

function prevYYYYMM(yyyymm: string): string {
  const m = yyyymm.match(/^(\d{4})-(\d{2})$/);
  if (!m) return yyyymm;
  let y = +m[1], mo = +m[2];
  mo--; if (mo === 0) { mo = 12; y--; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

/**
 * Build a $or filter covering all storage variants of a month value in a specific field.
 * Handles: number 202604, string "202604", string "2026-04", ISODate range.
 */
function buildFieldMonthFilter(field: string, normMonth: string): Record<string, unknown> {
  const m = normMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { [field]: normMonth };
  const y = +m[1], mo = +m[2];
  const yyyymm  = y * 100 + mo;
  const nextMo  = mo === 12 ? 1 : mo + 1;
  const nextY   = mo === 12 ? y + 1 : y;
  return {
    $or: [
      { [field]: yyyymm },
      { [field]: String(yyyymm) },
      { [field]: normMonth },
      { [field]: { $gte: new Date(y, mo - 1, 1), $lt: new Date(nextY, nextMo - 1, 1) } },
    ],
  };
}

/* ─── Types ─────────────────────────────────────────────────── */

type FieldDiff = { field: string; prev: number; curr: number; diff: number };

interface DetailRow {
  group:        Record<string, unknown>;  // all non-time key fields
  qty_diffs:    FieldDiff[];              // quantity fields
  detail_diffs: FieldDiff[];             // non-quantity compare fields
  has_qty_diff: boolean;
  has_any_diff: boolean;
}

interface AuditItem {
  חודש_תחולה:      string;
  case_type:       'שוטף' | 'הפרש';
  compare_month:   string;
  no_comparison:   boolean;
  no_payment:      boolean;   // שולם = 0 → תשלום ראשון, אין נתוני השוואה
  payment_amount:  number;
  has_diff:        boolean;
  subtopic_fields: string[];
  quantity_fields: string[];
  detail_fields:   string[];
  group_by:        string[];
  rows:            DetailRow[];
}

interface TopicResult {
  code:           string;
  name:           string | null;
  collection:     string;
  has_diff:       boolean;
  total_payment:  number;
  items:          AuditItem[];
}

/* ─── Route ─────────────────────────────────────────────────── */

const TIME_FIELDS = new Set(['חודש_תחולה', 'חודש_חישוב', 'קוד_נושא']);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const calcMonthRaw    = searchParams.get('calc_month');
    const compareMonthRaw = searchParams.get('compare_month');
    const db              = await getDb();

    /* ── List available months ─────────────────────────────── */
    if (!calcMonthRaw) {
      const rawMonths = await db.collection('CHESHBONIT').distinct('חודש_חישוב');
      const normSet   = new Set<string>();
      for (const m of rawMonths) {
        const norm = toYYYYMM(m);
        if (norm && /^\d{4}-\d{2}$/.test(norm)) normSet.add(norm);
      }
      const months = Array.from(normSet).sort((a, b) => b.localeCompare(a));
      return NextResponse.json({ ok: true, months });
    }

    /* ── Run audit ─────────────────────────────────────────── */
    const calcNorm = toYYYYMM(calcMonthRaw);
    const cmpNorm  = compareMonthRaw ? toYYYYMM(compareMonthRaw) : prevYYYYMM(calcNorm);

    /* Step 1: Load CHESHBONIT rows for the calc month
     * Two columns:
     *   הפרש_לתשלום = 0  → skip row entirely (nothing to audit)
     *   שולם         = 0  → first-time payment, no comparison needed
     */
    const cheshbonitRows = await db.collection('CHESHBONIT')
      .find(
        buildFieldMonthFilter('חודש_חישוב', calcNorm),
        { projection: { _id: 0, קוד_נושא: 1, חודש_תחולה: 1, 'הפרש_לתשלום': 1, 'שולם': 1 } },
      )
      .toArray();

    /* Step 2: Group unique (code, חודש_תחולה) + accumulate amounts */
    type ItemKey = { code: string; tachulaNorm: string; caseType: 'שוטף' | 'הפרש' };
    const itemMap      = new Map<string, ItemKey>();
    const paymentMap: Record<string, number> = {};   // הפרש_לתשלום
    const shulamMap:  Record<string, number> = {};   // שולם

    for (const row of cheshbonitRows) {
      const code        = String(row.קוד_נושא ?? '').trim();
      const tachulaNorm = toYYYYMM(row.חודש_תחולה);
      if (!code || !tachulaNorm || !/^\d{4}-\d{2}$/.test(tachulaNorm)) continue;

      /* הפרש_לתשלום = 0 → skip entirely, don't include in report */
      const hefresh = Number((row as Record<string, unknown>)['הפרש_לתשלום'] ?? 0);
      if (hefresh === 0) continue;

      const key = `${code}|${tachulaNorm}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          code,
          tachulaNorm,
          caseType: tachulaNorm === calcNorm ? 'שוטף' : 'הפרש',
        });
      }
      paymentMap[key] = (paymentMap[key] ?? 0) + hefresh;
      shulamMap[key]  = (shulamMap[key]  ?? 0) + Number((row as Record<string, unknown>)['שולם'] ?? 0);
    }

    /* Step 3: Load configs + noseme names */
    const configs = await db.collection('TOPIC_CONFIG')
      .find({ check_collection: { $exists: true, $ne: '' }, exclude_from_audit: { $ne: true } })
      .toArray();
    const configMap = new Map<string, typeof configs[0]>();
    for (const cfg of configs) configMap.set(String(cfg.code ?? '').trim(), cfg);

    const nosemeDocs = await db.collection('NOSEME')
      .find({}, { projection: { _id: 0, code: 1, name: 1 } }).toArray();
    const nosemeNames: Record<string, string> = {};
    for (const d of nosemeDocs)
      nosemeNames[String(d.code ?? '').trim()] = String(d.name ?? '');

    /* Step 4: Process each (code, חודש_תחולה) item */
    const topicMap = new Map<string, TopicResult>();

    for (const [itemKey, { code, tachulaNorm, caseType }] of itemMap) {
      const cfg = configMap.get(code);
      if (!cfg) continue;

      const collection      = String(cfg.check_collection ?? '');
      const group_by        = (cfg.group_by        as string[]) ?? [];
      const subtopic_fields = (cfg.subtopic_fields as string[]) ?? [];
      const quantity_fields = (cfg.quantity_fields as string[]) ?? [];
      const compare_fields  = (cfg.compare_fields  as string[]) ?? [];

      /* שולם = 0 → topic never paid before, no comparison available */
      const paymentAmt = paymentMap[itemKey] ?? 0;
      const shulamAmt  = shulamMap[itemKey]  ?? 0;
      if (shulamAmt === 0) {
        if (!topicMap.has(code)) {
          topicMap.set(code, {
            code, name: nosemeNames[code] ?? null, collection,
            has_diff: false, total_payment: 0, items: [],
          });
        }
        topicMap.get(code)!.items.push({
          חודש_תחולה: tachulaNorm, case_type: caseType,
          compare_month: '', no_comparison: false, no_payment: true,
          payment_amount: paymentAmt, has_diff: false,
          subtopic_fields: [], quantity_fields: [], detail_fields: [],
          group_by, rows: [],
        });
        continue;
      }

      // For שוטף: compare quantity fields only. For הפרש: also compare detail fields.
      const qty_fields    = quantity_fields;
      const detail_fields = caseType === 'הפרש' ? compare_fields : [];

      const allCompareFields = [...new Set([...qty_fields, ...detail_fields])];
      if (!collection || allCompareFields.length === 0) continue;

      const keyFields  = group_by.filter(f => !TIME_FIELDS.has(f));
      const codeNum    = parseInt(code, 10);
      const codeAlts: (string | number)[] = isNaN(codeNum)
        ? [code]
        : [...new Set<string | number>([code, String(codeNum), codeNum])];
      const codeFilter = { $in: codeAlts };

      /* Find comparison month */
      let compareNorm:  string | null = null;
      let noComparison               = false;

      if (caseType === 'שוטף') {
        /*
         * Control 1 (שוטף): find last calc month in CHESHBONIT where this topic
         * was paid (any תחולה), then compare detail collection for that month's
         * תחולה = that same calc month (i.e. last שוטף payment).
         */
        const prevRaw = await db.collection('CHESHBONIT').distinct('חודש_חישוב', {
          $and: [
            { קוד_נושא: codeFilter },
            { 'הפרש_לתשלום': { $ne: 0 } },
          ],
        });
        compareNorm = prevRaw
          .map(toYYYYMM)
          .filter(m => /^\d{4}-\d{2}$/.test(m) && m < calcNorm)
          .sort().reverse()[0] ?? null;
        if (!compareNorm) noComparison = true;
      } else {
        /*
         * Control 2 (הפרש): find last calc month in CHESHBONIT where this specific
         * (topic + חודש_תחולה=X) pair was paid.
         */
        const prevRaw = await db.collection('CHESHBONIT').distinct('חודש_חישוב', {
          $and: [
            { קוד_נושא: codeFilter },
            buildFieldMonthFilter('חודש_תחולה', tachulaNorm),
            { 'הפרש_לתשלום': { $ne: 0 } },
          ],
        });
        compareNorm = prevRaw
          .map(toYYYYMM)
          .filter(m => /^\d{4}-\d{2}$/.test(m) && m < calcNorm)
          .sort().reverse()[0] ?? null;
        if (!compareNorm) noComparison = true;
      }

      /* Build aggregation pipeline */
      const buildPipeline = (calcMonth: string, tachulaMonth: string) => {
        const groupId: Record<string, unknown> = {};
        for (const f of keyFields) groupId[f] = `$${f}`;
        const groupStage: Record<string, unknown> = {
          _id: keyFields.length > 0 ? groupId : null,
        };
        for (const f of allCompareFields) groupStage[f] = { $sum: `$${f}` };

        const match: Record<string, unknown> = {
          $and: [
            buildFieldMonthFilter('חודש_חישוב', calcMonth),
            buildFieldMonthFilter('חודש_תחולה', tachulaMonth),
            { קוד_נושא: codeFilter },
          ],
        };
        return [{ $match: match }, { $group: groupStage }];
      };

      try {
        /*
         * For שוטף: current תחולה = calcNorm, previous תחולה = compareNorm (same month as calc)
         * For הפרש: both use tachulaNorm (the specific offset month)
         */
        const currTachula = caseType === 'שוטף' ? calcNorm    : tachulaNorm;
        const prevTachula = caseType === 'שוטף' ? (compareNorm ?? cmpNorm) : tachulaNorm;

        const [currDocs, prevDocs] = await Promise.all([
          db.collection(collection).aggregate(buildPipeline(calcNorm, currTachula)).toArray(),
          compareNorm
            ? db.collection(collection).aggregate(buildPipeline(compareNorm, prevTachula)).toArray()
            : Promise.resolve([]),
        ]);

        const keyOf   = (doc: Record<string, unknown>) => JSON.stringify(doc._id ?? null);
        const currMap = new Map(currDocs.map(d => [keyOf(d), d]));
        const prevMap = new Map(prevDocs.map(d => [keyOf(d), d]));
        const allKeys = new Set([...currMap.keys(), ...prevMap.keys()]);

        const detailRows: DetailRow[] = [];
        let hasDiff = false;

        for (const key of allKeys) {
          const curr  = currMap.get(key);
          const prev  = prevMap.get(key);
          const group = (curr?._id ?? prev?._id) as Record<string, unknown> ?? {};

          const qty_diffs: FieldDiff[] = [];
          for (const f of qty_fields) {
            const c = Number(curr?.[f] ?? 0), p = Number(prev?.[f] ?? 0);
            const d = c - p;
            if (Math.abs(d) > 0.001) qty_diffs.push({ field: f, prev: p, curr: c, diff: d });
          }

          const detail_diffs: FieldDiff[] = [];
          for (const f of detail_fields) {
            const c = Number(curr?.[f] ?? 0), p = Number(prev?.[f] ?? 0);
            const d = c - p;
            if (Math.abs(d) > 0.001) detail_diffs.push({ field: f, prev: p, curr: c, diff: d });
          }

          const hasQtyDiff = qty_diffs.length > 0;
          const hasAnyDiff = hasQtyDiff || detail_diffs.length > 0;
          if (hasAnyDiff) {
            hasDiff = true;
            detailRows.push({ group, qty_diffs, detail_diffs, has_qty_diff: hasQtyDiff, has_any_diff: hasAnyDiff });
          }
        }

        const auditItem: AuditItem = {
          חודש_תחולה:      tachulaNorm,
          case_type:       caseType,
          compare_month:   compareNorm ?? '',
          no_comparison:   noComparison,
          no_payment:      false,
          payment_amount:  paymentMap[`${code}|${tachulaNorm}`] ?? 0,
          has_diff:        hasDiff,
          subtopic_fields,
          quantity_fields: qty_fields,
          detail_fields,
          group_by,
          rows:            detailRows,
        };

        if (!topicMap.has(code)) {
          topicMap.set(code, {
            code, name: nosemeNames[code] ?? null, collection,
            has_diff: false, total_payment: 0, items: [],
          });
        }
        const topic = topicMap.get(code)!;
        topic.items.push(auditItem);
        topic.total_payment += Math.abs(paymentMap[`${code}|${tachulaNorm}`] ?? 0);
        if (hasDiff) topic.has_diff = true;

      } catch (err) {
        console.error(`[audit] topic ${code} tachula ${tachulaNorm}:`, err);
      }
    }

    /* Step 5: Sort */
    const results = Array.from(topicMap.values());
    results.sort((a, b) => {
      if (a.has_diff !== b.has_diff) return a.has_diff ? -1 : 1;
      return b.total_payment - a.total_payment;
    });
    for (const topic of results) {
      topic.items.sort((a, b) => {
        if (a.has_diff !== b.has_diff) return a.has_diff ? -1 : 1;
        return Math.abs(b.payment_amount) - Math.abs(a.payment_amount);
      });
    }

    return NextResponse.json({
      ok:            true,
      calc_month:    calcNorm,
      compare_month: cmpNorm,
      topics:        results,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
