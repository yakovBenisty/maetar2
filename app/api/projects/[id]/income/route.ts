import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole } from '@/lib/settlement-auth';
import { getIncomeBreakdown } from '@/lib/income-matching';
import {
  resolveTopicFiles,
  getDetailTotals,
  getInstitutionRows,
  getInvoiceTotalsByTopic,
  getManualAdvanceByTopic,
} from '@/lib/income-detail';

/**
 * הכנסות משרד החינוך לפרויקט: חשבוניות + מקדמות ידניות; כשנבחרו מוסדות — פירוט לפי מוסד
 * מהקבצים המפורטים; ובכל מצב בקרת פער בין החשבוניות (כל המוסדות) לבין הקבצים המפורטים.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = await getDb();
  const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(id) });
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 });

  if (role === 'operator' && !(project.operator_emails ?? []).includes(session?.user?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const noseCodes = (project.noseme_codes ?? []) as string[];
  const mosadCodes = ((project.mosad_codes ?? []) as string[]).map(String);
  const byInstitution = mosadCodes.length > 0;
  const result = await getIncomeBreakdown(noseCodes, project.date_from, project.date_to);

  if (noseCodes.length === 0) {
    return NextResponse.json({ ok: true, ...result, mode: 'all', mosadCodes, reconciliation: null, institutionRows: [], unavailableTopics: [] });
  }

  const [nosemeDocs, topicFiles, invoices, manual] = await Promise.all([
    db.collection('NOSEME').find({ code: { $in: noseCodes } }, { projection: { code: 1, name: 1, direction: 1 } }).toArray(),
    resolveTopicFiles(db, noseCodes),
    getInvoiceTotalsByTopic(db, noseCodes, project.date_from, project.date_to),
    getManualAdvanceByTopic(db, noseCodes, project.date_from, project.date_to),
  ]);
  const nosemeByCode = new Map(nosemeDocs.map((n) => [String(n.code), n]));

  // בקרת פער — תמיד על כל המוסדות, בלי קשר לבחירה בפרויקט.
  const detailAll = await getDetailTotals(db, topicFiles, project.date_from, project.date_to);
  const rows = detailAll.map((t) => {
    const inv = invoices.get(t.code) ?? 0;
    const man = manual.get(t.code) ?? 0;
    return {
      code: t.code,
      name: nosemeByCode.get(t.code)?.name ?? '',
      direction: nosemeByCode.get(t.code)?.direction ?? '',
      file: t.file,
      fileSource: t.source,
      invoices: inv,
      manualAdvance: man,
      invoicesTotal: inv + man,
      detail: t.total,
      diff: t.total === null ? null : inv + man - t.total,
    };
  });
  const comparable = rows.filter((r) => r.detail !== null);
  const reconciliation = {
    rows,
    invoicesTotal: comparable.reduce((s, r) => s + r.invoicesTotal, 0),
    detailTotal: comparable.reduce((s, r) => s + (r.detail ?? 0), 0),
    diffTotal: comparable.reduce((s, r) => s + (r.diff ?? 0), 0),
    incomplete: rows.length !== comparable.length,
  };

  let institutionRows: Awaited<ReturnType<typeof getInstitutionRows>> = [];
  let unavailableTopics: { code: string; name: string; file: string | null; generalInvoiceTotal: number }[] = [];
  if (byInstitution) {
    institutionRows = await getInstitutionRows(db, topicFiles, project.date_from, project.date_to, mosadCodes);
    unavailableTopics = topicFiles
      .filter((t) => !t.institutionLevel)
      .map((t) => ({
        code: t.code,
        name: nosemeByCode.get(t.code)?.name ?? '',
        file: t.file,
        generalInvoiceTotal: invoices.get(t.code) ?? 0,
      }));
  }

  return NextResponse.json({
    ok: true,
    ...result,
    mode: byInstitution ? 'institutions' : 'all',
    mosadCodes,
    reconciliation,
    institutionRows,
    unavailableTopics,
  });
}
