import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { COLLECTION_DEFAULTS } from '@/lib/collection-defaults';

const CONFIG_COLLECTION = 'TOPIC_CONFIG';
const SKIP_COLLECTIONS  = new Set(['NOSEME', 'MOSDOT', 'COMMANDS', 'runs', 'run_logs', 'run_results', 'run_hashvha', 'USERS']);
const CHESHBONIT        = 'CHESHBONIT';

export async function GET() {
  try {
    const db   = await getDb();
    const docs = await db.collection(CONFIG_COLLECTION).find({}, { projection: { _id: 0 } }).toArray();
    const map: Record<string, unknown> = {};
    for (const d of docs) map[String(d.code)] = d;
    return NextResponse.json({ ok: true, configs: map });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db   = await getDb();
    const body = await req.json() as Record<string, unknown>;

    // --- Single save ---
    if (body.code) {
      const doc = {
        code:                String(body.code),
        check_collection:    String(body.check_collection ?? ''),
        group_by:            (body.group_by         as string[]) ?? [],
        subtopic_fields:     (body.subtopic_fields  as string[]) ?? [],
        quantity_fields:     (body.quantity_fields  as string[]) ?? [],
        compare_fields:      (body.compare_fields   as string[]) ?? [],
        auto_filled:         body.auto_filled === true,
        exclude_from_audit:  body.exclude_from_audit === true,
        updated_at:          new Date(),
      };
      await db.collection(CONFIG_COLLECTION).replaceOne({ code: doc.code }, doc, { upsert: true });
      return NextResponse.json({ ok: true, saved: 1 });
    }

    // --- Toggle exclude_from_audit only ---
    if (body.toggle_exclude && body.toggle_code) {
      const code     = String(body.toggle_code);
      const excluded = body.excluded === true;
      await db.collection(CONFIG_COLLECTION).updateOne(
        { code },
        { $set: { exclude_from_audit: excluded, updated_at: new Date() } },
        { upsert: false },
      );
      return NextResponse.json({ ok: true });
    }

    // --- Auto-fill: fill every topic that has a clear 1-to-1 collection mapping ---
    if (body.auto_fill) {
      // Get mapping data: which collections each code appears in
      const allCols  = await db.listCollections().toArray();
      const existing = new Set(allCols.map((c) => c.name));

      const detailCols = [...existing].filter(
        (c) => !SKIP_COLLECTIONS.has(c) && c !== CHESHBONIT
      );

      // For each detail collection, get distinct קוד_נושא
      const codeToCollections: Record<string, string[]> = {};
      for (const col of detailCols) {
        const codes = await db.collection(col).distinct('קוד_נושא');
        for (const raw of codes) {
          const code = String(raw).trim();
          if (!code) continue;
          if (!codeToCollections[code]) codeToCollections[code] = [];
          codeToCollections[code].push(col);
        }
      }

      // Get already-configured codes
      const alreadyConfigured = new Set(
        (await db.collection(CONFIG_COLLECTION).distinct('code')).map(String)
      );

      const toInsert = [];
      for (const [code, cols] of Object.entries(codeToCollections)) {
        if (alreadyConfigured.has(code)) continue;

        // Find detail collections (non-CHESHBONIT) for this code
        const details = cols.filter((c) => c !== CHESHBONIT);
        if (details.length !== 1) continue; // ambiguous — skip

        const col = details[0];
        const def = COLLECTION_DEFAULTS[col];
        if (!def) continue; // no known config for this collection

        toInsert.push({
          code,
          check_collection: col,
          group_by:         def.group_by,
          subtopic_fields:  def.subtopic_fields,
          quantity_fields:  def.quantity_fields,
          compare_fields:   def.compare_fields,
          auto_filled:      true,
          updated_at:       new Date(),
        });
      }

      if (toInsert.length > 0) {
        // Upsert each
        for (const doc of toInsert) {
          await db.collection(CONFIG_COLLECTION).replaceOne({ code: doc.code }, doc, { upsert: true });
        }
      }

      return NextResponse.json({ ok: true, saved: toInsert.length });
    }

    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
