import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';
import type { ExpenseKind, ExpenseNature } from './mappings/route';

interface IncomingRow {
  nature: ExpenseNature;
  date: string | null;
  amount: number;
  description: string;
  // nature=invoice
  invoice_number?: string;
  tax_id?: string;
  // nature=salary
  tz?: string;
  salary_month?: string;
  raw: Record<string, unknown>;
}

/** המפתח היחודי נגזר מהמהות — לא נבחר חופשית ע"י המשתמש (מונע כפילות בין קבצים/טעינות). */
function buildRowKey(row: IncomingRow): { key: string; error?: string } {
  if (row.nature === 'salary') {
    if (!row.tz || !row.salary_month) return { key: '', error: 'שורת שכר חייבת ת.ז וחודש שכר' };
    return { key: `salary|${row.tz}|${row.salary_month}` };
  }
  if (!row.invoice_number || !row.tax_id) return { key: '', error: 'שורת חשבונית חייבת מספר חשבונית וח.פ/ת.ז' };
  return { key: `invoice|${row.invoice_number}|${row.tax_id}` };
}

async function assertProjectWritable(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  kind: ExpenseKind,
  role: ReturnType<typeof getSettlementRole>,
  userEmail?: string | null
): Promise<{ error: string; status: number } | null> {
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(projectId) });
  if (!project) return { error: 'פרויקט לא נמצא', status: 404 };
  if (project.status === 'locked') return { error: 'הפרויקט נעול — לא ניתן לטעון נתונים חדשים', status: 400 };

  if (role === 'operator') {
    if (kind !== 'operator_expense') return { error: 'מפעיל יכול לטעון רק הוצאות מפעיל', status: 403 };
    if (!userEmail || !(project.operator_emails ?? []).includes(userEmail)) {
      return { error: 'אין הרשאה לפרויקט זה', status: 403 };
    }
  } else if (!canManageSettlement(role)) {
    return { error: 'Forbidden', status: 403 };
  } else if (kind === 'rashut_expense' && project.model !== 'joint') {
    return { error: 'הוצאות רשות רלוונטיות רק לפרויקט בהפעלה משותפת', status: 400 };
  }

  return null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  const kind = req.nextUrl.searchParams.get('kind') as ExpenseKind | null;
  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 });

  const db = await getDb();

  if (role === 'operator') {
    const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(projectId) }, { projection: { operator_emails: 1 } });
    if (!project || !(project.operator_emails ?? []).includes(session?.user?.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const filter: Record<string, unknown> = { project_id: projectId };
  if (kind) filter.kind = kind;

  const entries = await db
    .collection('EXPENSE_ENTRIES')
    .find(filter)
    .sort({ uploaded_at: -1 })
    .toArray();

  return NextResponse.json({ entries: entries.map((e) => ({ ...e, _id: String(e._id) })) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    project_id: string;
    kind: ExpenseKind;
    source: 'file' | 'manual';
    strategy?: 'skip' | 'replace';
    mapping_id?: string;
    mapping_label?: string;
    source_file?: string;
    rows: IncomingRow[];
  };

  const { project_id, kind, source, strategy, mapping_id, mapping_label, source_file, rows } = body;
  if (!project_id || !kind || !rows?.length) {
    return NextResponse.json({ ok: false, error: 'חסרים שדות חובה' }, { status: 400 });
  }

  const db = await getDb();
  const guardError = await assertProjectWritable(db, project_id, kind, role, session?.user?.email);
  if (guardError) return NextResponse.json({ ok: false, error: guardError.error }, { status: guardError.status });

  const uploadBatchId = `UP_${Date.now()}`;
  const uploadedAt = new Date();
  const summary: { row_key: string; status: 'imported' | 'skipped' | 'replaced' | 'invalid'; error?: string }[] = [];

  for (const row of rows) {
    const { key: rowKey, error: keyError } = buildRowKey(row);
    if (keyError) {
      summary.push({ row_key: '', status: 'invalid', error: keyError });
      continue;
    }

    const existing = await db.collection('EXPENSE_ENTRIES').findOne({ project_id, kind, row_key: rowKey }, { projection: { _id: 1 } });

    if (existing) {
      if (strategy !== 'replace') {
        summary.push({ row_key: rowKey, status: 'skipped' });
        continue;
      }
      await db.collection('EXPENSE_ENTRIES').deleteOne({ _id: existing._id });
    }

    await db.collection('EXPENSE_ENTRIES').insertOne({
      project_id,
      kind,
      source,
      mapping_id: mapping_id ?? null,
      mapping_label: mapping_label ?? null,
      source_file: source_file ?? null,
      row_key: rowKey,
      nature: row.nature,
      date: row.date ? new Date(row.date) : null,
      amount: Number(row.amount) || 0,
      description: row.description ?? '',
      invoice_number: row.invoice_number ?? '',
      tax_id: row.tax_id ?? '',
      tz: row.tz ?? '',
      salary_month: row.salary_month ?? '',
      raw: row.raw ?? {},
      uploaded_by: session?.user?.email ?? '',
      uploaded_at: uploadedAt,
      upload_batch_id: uploadBatchId,
    });
    summary.push({ row_key: rowKey, status: existing ? 'replaced' : 'imported' });
  }

  return NextResponse.json({ ok: true, batchId: uploadBatchId, summary });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'חסר מזהה' }, { status: 400 });

  const db = await getDb();
  const entry = await db.collection('EXPENSE_ENTRIES').findOne({ _id: new ObjectId(id) }, { projection: { project_id: 1 } });
  if (entry) {
    const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(entry.project_id) }, { projection: { status: 1 } });
    if (project?.status === 'locked') {
      return NextResponse.json({ ok: false, error: 'הפרויקט נעול — לא ניתן למחוק' }, { status: 400 });
    }
  }

  const result = await db.collection('EXPENSE_ENTRIES').deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true, deleted: result.deletedCount });
}
