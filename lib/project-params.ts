import { getDb } from './mongo';

export interface ProjectParamsDoc {
  project_id: string;
  overhead_pct: number;
  advance_pct: number;
  // התפלגות תקציב בהפעלה משותפת (אופציונלי) — ראו lib/settlement.ts
  rashut_split_type?: 'percentage' | 'fixed';
  rashut_split_value?: number;
  effective_from: Date;
  created_at: Date;
  created_by: string;
}

/** הפרמטרים הפעילים לפרויקט בתאריך נתון (ברירת מחדל: עכשיו) — העדכון האחרון שתחולתו כבר הגיעה. */
export async function getActiveParams(
  projectId: string,
  asOf: Date = new Date()
): Promise<{ overheadPct: number; advancePct: number; rashutSplitType?: 'percentage' | 'fixed'; rashutSplitValue?: number }> {
  const db = await getDb();
  const doc = await db
    .collection('PROJECT_PARAMS')
    .find({ project_id: projectId, effective_from: { $lte: asOf } })
    .sort({ effective_from: -1, created_at: -1 })
    .limit(1)
    .next();

  return {
    overheadPct: doc ? Number(doc.overhead_pct) : 0,
    advancePct: doc ? Number(doc.advance_pct) : 0,
    rashutSplitType: doc?.rashut_split_type,
    rashutSplitValue: doc?.rashut_split_value != null ? Number(doc.rashut_split_value) : undefined,
  };
}
