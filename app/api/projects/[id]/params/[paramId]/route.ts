import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { auth } from '@/auth';
import { getDb } from '@/lib/mongo';
import { isSuperAdmin } from '@/lib/settlement-auth';

/**
 * עריכה/מחיקה של רשומת PROJECT_PARAMS שכבר נוספה — חריגה מכוונת לעקרון
 * "היסטוריה שלא נערכת רטרואקטיבית" (ראו PRD/lib/project-params.ts), מוגבלת
 * בכוונה למנהל-על בלבד. פועלת גם על פרויקט נעול (זו תכליתה).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; paramId: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, paramId } = await params;
  const body = await req.json() as {
    overhead_pct: number;
    advance_pct: number;
    effective_from: string;
    rashut_split_type?: 'percentage' | 'fixed';
    rashut_split_value?: number;
  };

  if (body.overhead_pct == null || body.advance_pct == null || !body.effective_from) {
    return NextResponse.json({ ok: false, error: 'שדות חובה חסרים' }, { status: 400 });
  }

  const db = await getDb();
  const result = await db.collection('PROJECT_PARAMS').updateOne(
    { _id: new ObjectId(paramId), project_id: id },
    {
      $set: {
        overhead_pct: Number(body.overhead_pct),
        advance_pct: Number(body.advance_pct),
        effective_from: new Date(body.effective_from),
        ...(body.rashut_split_type
          ? { rashut_split_type: body.rashut_split_type, rashut_split_value: Number(body.rashut_split_value) || 0 }
          : { rashut_split_type: null, rashut_split_value: null }),
        edited_at: new Date(),
        edited_by: session?.user?.email ?? '',
      },
    }
  );

  if (result.matchedCount === 0) return NextResponse.json({ ok: false, error: 'רשומה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; paramId: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, paramId } = await params;
  const db = await getDb();
  const result = await db.collection('PROJECT_PARAMS').deleteOne({ _id: new ObjectId(paramId), project_id: id });
  return NextResponse.json({ ok: true, deleted: result.deletedCount });
}
