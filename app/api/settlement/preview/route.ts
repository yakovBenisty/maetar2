import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { getSettlementRole } from '@/lib/settlement-auth';
import { computeProjectStatus } from '@/lib/settlement-compute';

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = getSettlementRole(session);
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 });

  try {
    if (role === 'operator') {
      const db = await getDb();
      const project = await db.collection('PROJECTS').findOne({ _id: new ObjectId(projectId) }, { projection: { operator_emails: 1 } });
      if (!project || !(project.operator_emails ?? []).includes(session?.user?.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const status = await computeProjectStatus(projectId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'שגיאה' }, { status: 500 });
  }
}
