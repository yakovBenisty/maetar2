import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole, canManageSettlement } from '@/lib/settlement-auth';
import { computeProjectStatus } from '@/lib/settlement-compute';
import type { SettlementBreakdown } from '@/lib/settlement';

export interface SettlementRunDoc {
  _id?: ObjectId;
  project_id: string;
  breakdown: SettlementBreakdown;
  paid_total: number;
  paid_audit: { amount: number; note: string; updated_at: Date; updated_by: string }[];
  created_at: Date;
  created_by: string;
}

async function assertCanViewProject(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  role: ReturnType<typeof getSettlementRole>,
  userEmail?: string | null
): Promise<boolean> {
  if (role !== 'operator') return true;
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(projectId) }, { projection: { operator_emails: 1 } });
  return !!project && (project.operator_emails ?? []).includes(userEmail);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 });

  const db = await getDb();
  if (!(await assertCanViewProject(db, projectId, role, session?.user?.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const runs = await db
    .collection('SETTLEMENT_RUNS')
    .find({ project_id: projectId })
    .sort({ created_at: -1 })
    .toArray();

  return NextResponse.json({ runs: runs.map((r) => ({ ...r, _id: String(r._id) })) });
}

/** מפיק ושומר דוח התחשבנות חדש (snapshot) — רק מנהל תוכנית, לפי PRD סעיף 3. */
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!canManageSettlement(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { project_id: string };
  if (!body.project_id) return NextResponse.json({ ok: false, error: 'חסר project_id' }, { status: 400 });

  const db = await getDb();
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(body.project_id) }, { projection: { status: 1 } });
  if (!project) return NextResponse.json({ ok: false, error: 'פרויקט לא נמצא' }, { status: 404 });
  if (project.status === 'locked') {
    return NextResponse.json({ ok: false, error: 'הפרויקט נעול — לא ניתן להפיק דוח חדש' }, { status: 400 });
  }

  const { breakdown } = await computeProjectStatus(body.project_id);

  // ברירת מחדל: הדוח מופק כ"שולם במלואו" (תואם לזרימת העבודה הרגילה — תשלום
  // מלא בעת ההפקה); ניתן לערוך בדיעבד אם בפועל שולם סכום אחר (תשלום חלקי).
  const now = new Date();
  const createdBy = session?.user?.email ?? '';
  const doc: SettlementRunDoc = {
    project_id: body.project_id,
    breakdown,
    paid_total: breakdown.calculatedTotal,
    paid_audit: [{ amount: breakdown.calculatedTotal, note: 'ברירת מחדל: שולם במלואו בעת הפקת הדוח', updated_at: now, updated_by: createdBy }],
    created_at: now,
    created_by: createdBy,
  };

  const result = await db.collection('SETTLEMENT_RUNS').insertOne(doc);
  return NextResponse.json({ ok: true, id: String(result.insertedId), run: { ...doc, _id: String(result.insertedId) } });
}
