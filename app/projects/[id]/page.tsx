'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import ExpenseUpload, { type ExpenseKind } from '@/app/components/ExpenseUpload';

type ModelType = 'self' | 'operator' | 'joint';

const MODEL_LABELS: Record<ModelType, string> = {
  self: 'הרשות מפעילה בעצמה',
  operator: 'מפעיל חוץ',
  joint: 'הפעלה משותפת',
};

interface ProjectRecord {
  _id: string;
  name: string;
  budget_year: string;
  model: ModelType;
  operator_name: string;
  operator_emails: string[];
  status: 'open' | 'locked';
}

interface Breakdown {
  incomeTotal: number;
  rashutExpensesTotal: number;
  operatorExpensesTotal: number;
  reservationsTotal: number;
  parentPaymentsTotal: number;
  previouslyPaidTotal: number;
  operatorBudget: number;
  rashutShareEffective: number;
  rashutSplitType?: 'percentage' | 'fixed';
  rashutSplitValue?: number;
  overheadPct: number;
  overheadAmount: number;
  advancePct: number;
  advanceAmount: number;
  calculatedTotal: number;
  operatorBudgetIsNegative: boolean;
}

interface CheshbonitAdvanceRow {
  _id: string;
  code: string;
  calcMonth: string | null;
  tachMonth: string | null;
  amount: number;
  isDeduction: boolean;
}

interface YadaniimAdvanceRow {
  _id: string;
  code: string;
  calcMonth: string | null;
  tachMonth: string | null;
  amount: number;
  reason: string | null;
  matched: boolean;
}

interface ParamRecord {
  _id: string;
  overhead_pct: number;
  advance_pct: number;
  rashut_split_type?: 'percentage' | 'fixed';
  rashut_split_value?: number;
  effective_from: string;
  created_by: string;
}

interface RunRecord {
  _id: string;
  breakdown: Breakdown;
  paid_total: number;
  paid_audit: { amount: number; note: string; updated_at: string; updated_by: string }[];
  created_at: string;
  created_by: string;
}

function money(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TABS = ['מצב נוכחי', 'הכנסות משרד החינוך', 'פרמטרים', 'הוצאות וקיזוזים', 'דוחות התחשבנות'] as const;
type Tab = typeof TABS[number];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const isSuperAdmin = role === 'super_admin';
  const canManage = role === 'admin' || isSuperAdmin || role === 'program_manager';
  const hasAccess = canManage || role === 'operator';

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [tab, setTab] = useState<Tab>('מצב נוכחי');
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>('operator_expense');
  const [error, setError] = useState('');

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [cheshbonitRows, setCheshbonitRows] = useState<CheshbonitAdvanceRow[]>([]);
  const [yadaniimRows, setYadaniimRows] = useState<YadaniimAdvanceRow[]>([]);
  const [unmatchedAdvanceTotal, setUnmatchedAdvanceTotal] = useState(0);
  const [loadingIncome, setLoadingIncome] = useState(false);
  const [params, setParams] = useState<ParamRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const [newOverhead, setNewOverhead] = useState('');
  const [newAdvance, setNewAdvance] = useState('');
  const [newEffective, setNewEffective] = useState('');
  const [newRashutSplitType, setNewRashutSplitType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [newRashutSplitValue, setNewRashutSplitValue] = useState('');
  const [savingParams, setSavingParams] = useState(false);

  const [editingParamId, setEditingParamId] = useState<string | null>(null);
  const [editOverhead, setEditOverhead] = useState('');
  const [editAdvance, setEditAdvance] = useState('');
  const [editEffective, setEditEffective] = useState('');
  const [editRashutSplitType, setEditRashutSplitType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [editRashutSplitValue, setEditRashutSplitValue] = useState('');

  const [creatingRun, setCreatingRun] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!hasAccess) router.replace('/');
  }, [status, hasAccess, router]);

  const loadProject = useCallback(async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    const p = (data.projects ?? []).find((x: ProjectRecord) => x._id === id);
    setProject(p ?? null);
  }, [id]);

  const loadBreakdown = useCallback(async () => {
    const res = await fetch(`/api/settlement/preview?project_id=${id}`);
    const data = await res.json();
    if (res.ok) setBreakdown(data.breakdown);
  }, [id]);

  const loadIncome = useCallback(async () => {
    setLoadingIncome(true);
    try {
      const res = await fetch(`/api/projects/${id}/income`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setCheshbonitRows(data.cheshbonitRows ?? []);
        setYadaniimRows(data.yadaniimRows ?? []);
        setUnmatchedAdvanceTotal(data.unmatchedAdvanceTotal ?? 0);
      }
    } finally {
      setLoadingIncome(false);
    }
  }, [id]);

  const loadParams = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/params`);
    const data = await res.json();
    setParams(data.history ?? []);
  }, [id]);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/settlement/runs?project_id=${id}`);
    const data = await res.json();
    setRuns(data.runs ?? []);
  }, [id]);

  useEffect(() => {
    if (hasAccess && id) {
      loadProject();
      loadBreakdown();
      loadIncome();
      loadParams();
      loadRuns();
    }
  }, [hasAccess, id, loadProject, loadBreakdown, loadIncome, loadParams, loadRuns]);

  async function toggleLock() {
    if (!project) return;
    const locked = project.status !== 'locked';
    if (!confirm(locked ? 'לנעול את הפרויקט? לא ניתן יהיה לטעון נתונים חדשים.' : 'לפתוח את הפרויקט מחדש?')) return;
    await fetch(`/api/projects/${id}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked }),
    });
    loadProject();
  }

  async function handleAddParams(e: React.FormEvent) {
    e.preventDefault();
    setSavingParams(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${id}/params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overhead_pct: Number(newOverhead) / 100,
          advance_pct: Number(newAdvance) / 100,
          effective_from: newEffective,
          ...(newRashutSplitType !== 'none'
            ? {
                rashut_split_type: newRashutSplitType,
                rashut_split_value: newRashutSplitType === 'percentage' ? Number(newRashutSplitValue) / 100 : Number(newRashutSplitValue),
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה');
      setNewOverhead(''); setNewAdvance(''); setNewEffective(''); setNewRashutSplitType('none'); setNewRashutSplitValue('');
      loadParams();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSavingParams(false);
    }
  }

  function openEditParam(p: ParamRecord) {
    setEditingParamId(p._id);
    setEditOverhead(String(p.overhead_pct * 100));
    setEditAdvance(String(p.advance_pct * 100));
    setEditEffective(new Date(p.effective_from).toISOString().slice(0, 10));
    if (p.rashut_split_type) {
      setEditRashutSplitType(p.rashut_split_type);
      setEditRashutSplitValue(p.rashut_split_type === 'percentage' ? String((p.rashut_split_value ?? 0) * 100) : String(p.rashut_split_value ?? 0));
    } else {
      setEditRashutSplitType('none');
      setEditRashutSplitValue('');
    }
  }

  async function handleSaveParamEdit() {
    if (!editingParamId) return;
    try {
      const res = await fetch(`/api/projects/${id}/params/${editingParamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overhead_pct: Number(editOverhead) / 100,
          advance_pct: Number(editAdvance) / 100,
          effective_from: editEffective,
          ...(editRashutSplitType !== 'none'
            ? { rashut_split_type: editRashutSplitType, rashut_split_value: editRashutSplitType === 'percentage' ? Number(editRashutSplitValue) / 100 : Number(editRashutSplitValue) }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה');
      setEditingParamId(null);
      loadParams();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  async function handleDeleteParam(paramId: string) {
    if (!confirm('למחוק רשומת פרמטרים זו? פעולה זו אינה הפיכה.')) return;
    try {
      const res = await fetch(`/api/projects/${id}/params/${paramId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה במחיקה');
      loadParams();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  async function handleCreateRun() {
    if (!confirm('להפיק דוח התחשבנות חדש (snapshot) לפי המצב הנוכחי?')) return;
    setCreatingRun(true);
    setError('');
    try {
      const res = await fetch('/api/settlement/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה');
      loadRuns();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setCreatingRun(false);
    }
  }

  function openEditPaid(r: RunRecord) {
    setEditingRunId(r._id);
    setEditAmount(String(r.paid_total));
    setEditNote('');
  }

  async function handleSavePaid() {
    if (!editingRunId) return;
    try {
      const res = await fetch(`/api/settlement/runs/${editingRunId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid_total: Number(editAmount), note: editNote }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה');
      setEditingRunId(null);
      loadRuns();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  if (status === 'loading' || !hasAccess || !project) {
    return <div className="p-8 text-[#636c76] text-sm">טוען...</div>;
  }

  const locked = project.status === 'locked';

  return (
    <div className="max-w-5xl">
      <Link href="/projects" className="text-xs text-[#0969da] hover:underline">← חזרה לרשימת הפרויקטים</Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1f2328]">{project.name}</h1>
          <p className="text-sm text-[#636c76] mt-0.5">{project.budget_year} · {MODEL_LABELS[project.model]}{project.operator_name ? ` · ${project.operator_name}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${locked ? 'bg-[#fff8c5] text-[#9a6700]' : 'bg-[#dafbe1] text-[#1a7f37]'}`}>
            {locked ? 'נעול' : 'פתוח'}
          </span>
          {canManage && (
            <button onClick={toggleLock} className="px-3 py-1.5 text-xs border border-[#d1d9e0] rounded-lg hover:bg-[#f0f3f6]">
              {locked ? 'פתח נעילה' : 'נעל פרויקט'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">{error}</div>}

      <div className="flex gap-1 mb-4 border-b border-[#d1d9e0]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-[#0969da] text-[#0969da]' : 'border-transparent text-[#636c76] hover:text-[#1f2328]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'מצב נוכחי' && breakdown && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl p-5 space-y-3">
          {breakdown.operatorBudgetIsNegative && (
            <div className="p-3 bg-[#fff8c5] border border-[#9a6700] rounded-lg text-sm text-[#9a6700]">
              ⚠️ תקציב הפעלה שלילי — הוצאות הרשות גבוהות מההכנסה. החישוב ממשיך כרגיל.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <Row label="הכנסה ממשרד החינוך" value={breakdown.incomeTotal} />
            {project.model === 'joint' && (
              <>
                <Row label="הוצאות רשות (בפועל)" value={-breakdown.rashutExpensesTotal} />
                {breakdown.rashutSplitType && (
                  <Row
                    label={`חלק רשות מוצהר (${breakdown.rashutSplitType === 'percentage' ? `${(breakdown.rashutSplitValue! * 100).toFixed(1)}%` : 'סכום קבוע'})`}
                    value={-(breakdown.rashutSplitType === 'fixed' ? breakdown.rashutSplitValue! : breakdown.rashutSplitValue! * breakdown.incomeTotal)}
                  />
                )}
                <Row label="חלק רשות בפועל בחישוב (רצפה)" value={-breakdown.rashutShareEffective} />
              </>
            )}
            <Row label="תקציב הפעלה למפעיל" value={breakdown.operatorBudget} strong />
            <Row label="הוצאות מפעיל בפועל" value={breakdown.operatorExpensesTotal} />
            <Row label={`תקורה (${(breakdown.overheadPct * 100).toFixed(1)}%)`} value={breakdown.overheadAmount} />
            <Row label={`מקדמה (${(breakdown.advancePct * 100).toFixed(1)}%)`} value={breakdown.advanceAmount} />
            <Row label="שיריונים (קיזוז)" value={-breakdown.reservationsTotal} />
            <Row label="כספי הורים (קיזוז)" value={-breakdown.parentPaymentsTotal} />
            <Row label="שולם בעבר (קיזוז)" value={-breakdown.previouslyPaidTotal} />
            <Row label="יתרה לתשלום למפעיל" value={breakdown.calculatedTotal} strong highlight />
          </div>
        </div>
      )}

      {tab === 'הכנסות משרד החינוך' && (
        <div className="space-y-4">
          <p className="text-xs text-[#636c76]">
            הכנסה ממשרד החינוך (CHESHBONIT) + מקדמות מ&quot;ידניים&quot; (YADANIIM) שלא קיבלו שורה חיובית מקבילה בחשבוניות
            (כאלה מסומנות &quot;לא תואם&quot; ומתווספות להכנסה בחישוב). בד&quot;כ מקדמה ב-YADANIIM מתאזנת מול &quot;ניכוי מקדמה&quot; בחשבוניות.
          </p>

          {loadingIncome ? (
            <div className="p-8 text-center text-sm text-[#636c76]">טוען...</div>
          ) : (
            <>
              <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
                <div className="px-6 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa]">
                  <h3 className="text-sm font-semibold text-[#1f2328]">חשבוניות (CHESHBONIT) — שורות מקדמה</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">קוד נושא</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש חישוב</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש תחולה</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">סכום</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">סוג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cheshbonitRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-[#636c76]">אין שורות מקדמה בחשבוניות</td></tr>
                    ) : cheshbonitRows.map((r) => (
                      <tr key={r._id} className="border-b border-[#f0f3f6]">
                        <td className="px-4 py-2 text-[#1f2328]">{r.code}</td>
                        <td className="px-4 py-2 text-[#636c76]">{r.calcMonth}</td>
                        <td className="px-4 py-2 text-[#636c76]">{r.tachMonth}</td>
                        <td className="px-4 py-2 font-mono text-[#1f2328]">{money(r.amount)}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.isDeduction ? 'bg-[#ffebe9] text-[#cf222e]' : 'bg-[#dafbe1] text-[#1a7f37]'}`}>
                            {r.isDeduction ? 'ניכוי מקדמה' : 'מקדמה'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
                <div className="px-6 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa]">
                  <h3 className="text-sm font-semibold text-[#1f2328]">ידניים (YADANIIM) — מקדמות</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">קוד נושא</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש חישוב</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש תחולה</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">סכום</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">סיבה</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">התאמה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yadaniimRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-4 text-center text-xs text-[#636c76]">אין מקדמות ב-ידניים</td></tr>
                    ) : yadaniimRows.map((r) => (
                      <tr key={r._id} className={`border-b border-[#f0f3f6] ${!r.matched ? 'bg-[#fff8c5]' : ''}`}>
                        <td className="px-4 py-2 text-[#1f2328]">{r.code}</td>
                        <td className="px-4 py-2 text-[#636c76]">{r.calcMonth}</td>
                        <td className="px-4 py-2 text-[#636c76]">{r.tachMonth}</td>
                        <td className="px-4 py-2 font-mono text-[#1f2328]">{money(r.amount)}</td>
                        <td className="px-4 py-2 text-[#636c76] text-xs">{r.reason}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.matched ? 'bg-[#dafbe1] text-[#1a7f37]' : 'bg-[#fff8c5] text-[#9a6700]'}`}>
                            {r.matched ? 'תואם בחשבוניות' : 'לא תואם — מתווסף להכנסה'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-[#ddf4ff] border border-[#0969da] rounded-xl flex items-center justify-between">
                <span className="text-sm font-medium text-[#1f2328]">סה&quot;כ מקדמות שלא תואמו ונוספו להכנסה</span>
                <span className="text-lg font-bold text-[#0969da] font-mono">{money(unmatchedAdvanceTotal)} ₪</span>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'פרמטרים' && (
        <div className="space-y-4">
          {canManage && !locked && (
            <form onSubmit={handleAddParams} className="bg-white border border-[#d1d9e0] rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-[#636c76] mb-1">אחוז תקורה (%)</label>
                <input required type="number" step="0.1" value={newOverhead} onChange={(e) => setNewOverhead(e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#636c76] mb-1">אחוז מקדמה (%)</label>
                <input required type="number" step="0.1" value={newAdvance} onChange={(e) => setNewAdvance(e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#636c76] mb-1">תחולה מתאריך</label>
                <input required type="date" value={newEffective} onChange={(e) => setNewEffective(e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
              </div>
              {project.model === 'joint' && (
                <div className="col-span-2 sm:col-span-4 flex items-end gap-3 pt-1 border-t border-[#d1d9e0] mt-1">
                  <div>
                    <label className="block text-xs text-[#636c76] mb-1">חלק הרשות (רצפה, להפעלה משותפת)</label>
                    <select value={newRashutSplitType} onChange={(e) => setNewRashutSplitType(e.target.value as 'none' | 'percentage' | 'fixed')} className="border border-[#d1d9e0] rounded px-2 py-1.5 text-sm bg-white">
                      <option value="none">לפי הוצאות רשות בפועל בלבד</option>
                      <option value="percentage">אחוז מההכנסה</option>
                      <option value="fixed">סכום קבוע</option>
                    </select>
                  </div>
                  {newRashutSplitType !== 'none' && (
                    <div>
                      <label className="block text-xs text-[#636c76] mb-1">{newRashutSplitType === 'percentage' ? 'אחוז (%)' : 'סכום (₪)'}</label>
                      <input required type="number" step="0.1" value={newRashutSplitValue} onChange={(e) => setNewRashutSplitValue(e.target.value)} className="w-32 border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-end">
                <button type="submit" disabled={savingParams} className="px-4 py-1.5 bg-[#0969da] text-white text-sm font-medium rounded-lg hover:bg-[#0860ca] disabled:opacity-60">
                  {savingParams ? 'שומר...' : 'הוסף'}
                </button>
              </div>
            </form>
          )}
          <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">תחולה מתאריך</th>
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">תקורה</th>
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">מקדמה</th>
                  {project.model === 'joint' && <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חלק הרשות</th>}
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">ע&quot;י</th>
                  {isSuperAdmin && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {params.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-4 text-center text-xs text-[#636c76]">אין פרמטרים מוגדרים</td></tr>
                ) : params.map((p) => (
                  editingParamId === p._id ? (
                    <tr key={p._id} className="border-b border-[#f0f3f6] bg-[#fff8c5]">
                      <td className="px-4 py-2"><input type="date" value={editEffective} onChange={(e) => setEditEffective(e.target.value)} className="w-32 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" /></td>
                      <td className="px-4 py-2"><input type="number" step="0.1" value={editOverhead} onChange={(e) => setEditOverhead(e.target.value)} className="w-16 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" />%</td>
                      <td className="px-4 py-2"><input type="number" step="0.1" value={editAdvance} onChange={(e) => setEditAdvance(e.target.value)} className="w-16 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" />%</td>
                      {project.model === 'joint' && (
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <select value={editRashutSplitType} onChange={(e) => setEditRashutSplitType(e.target.value as 'none' | 'percentage' | 'fixed')} className="border border-[#d1d9e0] rounded px-1 py-0.5 text-xs bg-white">
                              <option value="none">בפועל בלבד</option>
                              <option value="percentage">אחוז</option>
                              <option value="fixed">סכום</option>
                            </select>
                            {editRashutSplitType !== 'none' && (
                              <input type="number" step="0.1" value={editRashutSplitValue} onChange={(e) => setEditRashutSplitValue(e.target.value)} className="w-16 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" />
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-2 text-[#636c76] text-xs" dir="ltr">{p.created_by}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={handleSaveParamEdit} className="text-xs text-[#1a7f37]">שמור</button>
                          <button onClick={() => setEditingParamId(null)} className="text-xs text-[#636c76]">ביטול</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p._id} className="border-b border-[#f0f3f6]">
                      <td className="px-4 py-2 text-[#1f2328]">{new Date(p.effective_from).toLocaleDateString('he-IL')}</td>
                      <td className="px-4 py-2 text-[#636c76]">{(p.overhead_pct * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2 text-[#636c76]">{(p.advance_pct * 100).toFixed(1)}%</td>
                      {project.model === 'joint' && (
                        <td className="px-4 py-2 text-[#636c76]">
                          {p.rashut_split_type === 'percentage' ? `${((p.rashut_split_value ?? 0) * 100).toFixed(1)}% מההכנסה (רצפה)`
                            : p.rashut_split_type === 'fixed' ? `${money(p.rashut_split_value ?? 0)} ₪ (רצפה)`
                            : 'לפי הוצאות בפועל בלבד'}
                        </td>
                      )}
                      <td className="px-4 py-2 text-[#636c76] text-xs" dir="ltr">{p.created_by}</td>
                      {isSuperAdmin && (
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button onClick={() => openEditParam(p)} className="text-xs text-[#0969da] hover:underline">ערוך</button>
                            <button onClick={() => handleDeleteParam(p._id)} className="text-xs text-[#cf222e] hover:underline">מחק</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
          {isSuperAdmin && (
            <p className="text-xs text-[#9a6700]">
              עריכה/מחיקה של פרמטרים זמינה לך כמנהל על — זו חריגה מהעיקרון שהיסטוריית פרמטרים לא נערכת רטרואקטיבית, מיועדת לתיקון טעויות בלבד.
            </p>
          )}
        </div>
      )}

      {tab === 'הוצאות וקיזוזים' && (() => {
        const kindOptions: { kind: ExpenseKind; label: string; canEdit: boolean }[] = [
          { kind: 'operator_expense', label: 'הוצאות מפעיל', canEdit: canManage || role === 'operator' },
          ...(project.model === 'joint' ? [{ kind: 'rashut_expense' as ExpenseKind, label: 'הוצאות רשות', canEdit: canManage }] : []),
          { kind: 'reservation', label: 'שיריונים (קיזוז)', canEdit: canManage },
          { kind: 'parent_payment', label: 'כספי הורים (קיזוז)', canEdit: canManage },
        ];
        const current = kindOptions.find((k) => k.kind === expenseKind) ?? kindOptions[0];
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">איזה סוג הוצאה טוענים כרגע?</label>
              <div className="flex gap-2 flex-wrap">
                {kindOptions.map((k) => (
                  <button
                    key={k.kind}
                    onClick={() => setExpenseKind(k.kind)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      expenseKind === k.kind ? 'bg-[#0969da] text-white border-[#0969da]' : 'bg-white text-[#636c76] border-[#d1d9e0] hover:bg-[#f0f3f6]'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <ExpenseUpload projectId={id} kind={current.kind} label={current.label} canEdit={current.canEdit} locked={locked} />
          </div>
        );
      })()}

      {tab === 'דוחות התחשבנות' && (
        <div className="space-y-4">
          {canManage && (
            <button onClick={handleCreateRun} disabled={creatingRun || locked} className="px-4 py-2 bg-[#1f883d] text-white text-sm font-medium rounded-lg hover:bg-[#1a7f37] disabled:opacity-50">
              {creatingRun ? 'מפיק...' : '+ הפק דוח התחשבנות חדש'}
            </button>
          )}
          {locked && canManage && <p className="text-xs text-[#9a6700]">הפרויקט נעול — לא ניתן להפיק דוח חדש.</p>}

          <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">תאריך הפקה</th>
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">מחושב</th>
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">שולם בפועל</th>
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">יתרה</th>
                  {canManage && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-[#636c76]">אין דוחות עדיין</td></tr>
                ) : runs.map((r) => (
                  <tr key={r._id} className="border-b border-[#f0f3f6]">
                    <td className="px-4 py-2 text-[#1f2328]">{new Date(r.created_at).toLocaleString('he-IL')}</td>
                    <td className="px-4 py-2 font-mono text-[#1f2328]">{money(r.breakdown.calculatedTotal)}</td>
                    <td className="px-4 py-2 font-mono text-[#1f2328]">
                      {editingRunId === r._id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-24 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" />
                          <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="הערה" className="w-24 border border-[#d1d9e0] rounded px-1 py-0.5 text-xs" />
                          <button onClick={handleSavePaid} className="text-xs text-[#1a7f37]">שמור</button>
                          <button onClick={() => setEditingRunId(null)} className="text-xs text-[#636c76]">ביטול</button>
                        </div>
                      ) : money(r.paid_total)}
                    </td>
                    <td className="px-4 py-2 font-mono text-[#1f2328]">{money(r.breakdown.calculatedTotal - r.paid_total)}</td>
                    {canManage && editingRunId !== r._id && (
                      <td className="px-4 py-2">
                        <button onClick={() => openEditPaid(r)} className="text-xs text-[#0969da] hover:underline">עדכן תשלום</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, highlight }: { label: string; value: number; strong?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-2 rounded-lg ${highlight ? 'bg-[#ddf4ff]' : ''}`}>
      <span className="text-[#636c76]">{label}</span>
      <span className={`font-mono ${strong ? 'font-bold text-[#1f2328]' : 'text-[#1f2328]'}`}>{money(value)} ₪</span>
    </div>
  );
}
