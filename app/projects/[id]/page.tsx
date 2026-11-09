'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import ExpenseUpload from '@/app/components/ExpenseUpload';

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
  overheadPct: number;
  overheadAmount: number;
  advancePct: number;
  advanceAmount: number;
  calculatedTotal: number;
  operatorBudgetIsNegative: boolean;
}

interface ParamRecord {
  _id: string;
  overhead_pct: number;
  advance_pct: number;
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

const TABS = ['מצב נוכחי', 'פרמטרים', 'הוצאות וקיזוזים', 'דוחות התחשבנות'] as const;
type Tab = typeof TABS[number];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const canManage = role === 'admin' || role === 'program_manager';
  const hasAccess = canManage || role === 'operator';

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [tab, setTab] = useState<Tab>('מצב נוכחי');
  const [error, setError] = useState('');

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [params, setParams] = useState<ParamRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const [newOverhead, setNewOverhead] = useState('');
  const [newAdvance, setNewAdvance] = useState('');
  const [newEffective, setNewEffective] = useState('');
  const [savingParams, setSavingParams] = useState(false);

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
      loadParams();
      loadRuns();
    }
  }, [hasAccess, id, loadProject, loadBreakdown, loadParams, loadRuns]);

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
        body: JSON.stringify({ overhead_pct: Number(newOverhead) / 100, advance_pct: Number(newAdvance) / 100, effective_from: newEffective }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה');
      setNewOverhead(''); setNewAdvance(''); setNewEffective('');
      loadParams();
      loadBreakdown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSavingParams(false);
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
            {project.model === 'joint' && <Row label="הוצאות רשות" value={-breakdown.rashutExpensesTotal} />}
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
                  <th className="px-4 py-2 text-xs font-medium text-[#636c76]">ע&quot;י</th>
                </tr>
              </thead>
              <tbody>
                {params.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-xs text-[#636c76]">אין פרמטרים מוגדרים</td></tr>
                ) : params.map((p) => (
                  <tr key={p._id} className="border-b border-[#f0f3f6]">
                    <td className="px-4 py-2 text-[#1f2328]">{new Date(p.effective_from).toLocaleDateString('he-IL')}</td>
                    <td className="px-4 py-2 text-[#636c76]">{(p.overhead_pct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-[#636c76]">{(p.advance_pct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-[#636c76] text-xs" dir="ltr">{p.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'הוצאות וקיזוזים' && (
        <div className="space-y-4">
          <ExpenseUpload projectId={id} kind="operator_expense" label="הוצאות מפעיל" canEdit={canManage || role === 'operator'} locked={locked} />
          {project.model === 'joint' && (
            <ExpenseUpload projectId={id} kind="rashut_expense" label="הוצאות רשות" canEdit={canManage} locked={locked} />
          )}
          <ExpenseUpload projectId={id} kind="reservation" label="שיריונים (קיזוז)" canEdit={canManage} locked={locked} />
          <ExpenseUpload projectId={id} kind="parent_payment" label="כספי הורים (קיזוז)" canEdit={canManage} locked={locked} />
        </div>
      )}

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
