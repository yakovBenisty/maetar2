'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import MultiSelectSearch from '@/app/components/MultiSelectSearch';

interface OperatorRecord {
  _id: string;
  name: string;
  emails: string[];
}

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
  tabar_section: string;
  noseme_codes: string[];
  date_from: string;
  date_to: string;
  status: 'open' | 'locked';
}

type FormState = Omit<ProjectRecord, '_id' | 'status'> & { _id?: string };

const EMPTY_FORM: FormState = {
  name: '',
  budget_year: '',
  model: 'operator',
  operator_name: '',
  operator_emails: [],
  tabar_section: '',
  noseme_codes: [],
  date_from: '',
  date_to: '',
};

function toDateInput(d?: string): string {
  if (!d) return '';
  return d.slice(0, 10);
}

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const canManage = role === 'admin' || role === 'super_admin' || role === 'program_manager';
  const hasAccess = canManage || role === 'operator';

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [showLocked, setShowLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [nosemeOptions, setNosemeOptions] = useState<{ value: string; label: string }[]>([]);
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [addingOperator, setAddingOperator] = useState(false);
  const [newOperatorName, setNewOperatorName] = useState('');
  const [overheadPct, setOverheadPct] = useState('');
  const [advancePct, setAdvancePct] = useState('');
  const [rashutSplitType, setRashutSplitType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [rashutSplitValue, setRashutSplitValue] = useState('');
  const [newOperatorEmails, setNewOperatorEmails] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!hasAccess) router.replace('/');
  }, [status, hasAccess, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה בטעינה');
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNoseme = useCallback(async () => {
    const res = await fetch('/api/noseme');
    const data = await res.json();
    setNosemeOptions((data.noseme ?? []).map((n: { code: string; name?: string }) => ({ value: String(n.code), label: n.name ? `${n.code} — ${n.name}` : String(n.code) })));
  }, []);

  const loadOperators = useCallback(async () => {
    const res = await fetch('/api/operators');
    const data = await res.json();
    setOperators(data.operators ?? []);
  }, []);

  useEffect(() => {
    if (hasAccess) load();
    if (canManage) { loadNoseme(); loadOperators(); }
  }, [hasAccess, canManage, load, loadNoseme, loadOperators]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setSelectedOperatorId('');
    setOverheadPct('');
    setAdvancePct('');
    setRashutSplitType('none');
    setRashutSplitValue('');
    setShowForm(true);
    setError('');
  }

  function openEdit(p: ProjectRecord) {
    setForm({
      _id: p._id,
      name: p.name,
      budget_year: p.budget_year,
      model: p.model,
      operator_name: p.operator_name,
      operator_emails: p.operator_emails,
      tabar_section: p.tabar_section,
      noseme_codes: p.noseme_codes,
      date_from: toDateInput(p.date_from),
      date_to: toDateInput(p.date_to),
    });
    setSelectedOperatorId(operators.find((o) => o.name === p.operator_name)?._id ?? '');
    setShowForm(true);
    setError('');
  }

  function selectOperator(id: string) {
    setSelectedOperatorId(id);
    const op = operators.find((o) => o._id === id);
    if (op) setForm({ ...form, operator_name: op.name, operator_emails: op.emails });
  }

  async function handleAddOperator() {
    if (!newOperatorName.trim()) return;
    const emails = newOperatorEmails.split(',').map((s) => s.trim()).filter(Boolean);
    const res = await fetch('/api/operators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newOperatorName.trim(), emails }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      await loadOperators();
      setSelectedOperatorId(data.id);
      setForm({ ...form, operator_name: newOperatorName.trim(), operator_emails: emails });
      setNewOperatorName('');
      setNewOperatorEmails('');
      setAddingOperator(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה בשמירה');

      // פרויקט חדש (לא עריכה) ועם נתוני פרמטרים ראשוניים — שומר רשומת PROJECT_PARAMS ראשונה,
      // כך שלא צריך לעבור למסך הפרויקט בנפרד רק כדי להגדיר תקורה/מקדמה/חלוקת תקציב.
      if (!form._id && (overheadPct || advancePct || rashutSplitType !== 'none')) {
        await fetch(`/api/projects/${data.id}/params`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overhead_pct: Number(overheadPct || 0) / 100,
            advance_pct: Number(advancePct || 0) / 100,
            effective_from: form.date_from,
            ...(rashutSplitType !== 'none'
              ? { rashut_split_type: rashutSplitType, rashut_split_value: rashutSplitType === 'percentage' ? Number(rashutSplitValue) / 100 : Number(rashutSplitValue) }
              : {}),
          }),
        });
      }

      setShowForm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק פרויקט זה? פעולה זו אינה הפיכה.')) return;
    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה במחיקה');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  if (status === 'loading' || !hasAccess) {
    return <div className="p-8 text-[#636c76] text-sm">טוען...</div>;
  }

  const visibleProjects = showLocked ? projects : projects.filter((p) => p.status !== 'locked');

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1f2328]">ניהול פרויקטים</h1>
          <p className="text-sm text-[#636c76] mt-0.5">נושאים תפעוליים (ניצנים, קייטנות וכו׳) להתחשבנות מול מפעילים</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLocked((v) => !v)}
            className="px-4 py-2 text-sm text-[#636c76] border border-[#d1d9e0] rounded-lg hover:bg-[#f0f3f6] transition-colors"
          >
            {showLocked ? 'הצג רק פרויקטים פתוחים' : 'הצג גם פרויקטים סגורים'}
          </button>
          {canManage && (
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-[#0969da] text-white text-sm font-medium rounded-lg hover:bg-[#0860ca] transition-colors"
            >
              + פרויקט חדש
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">{error}</div>
      )}

      {showForm && (
        <div className="mb-6 bg-white border border-[#d1d9e0] rounded-xl p-5">
          <h2 className="text-base font-semibold text-[#1f2328] mb-4">{form._id ? 'עריכת פרויקט' : 'פרויקט חדש'}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">שם הפרויקט *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" placeholder="ניצנים תשפ&quot;ו" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">שנת תקציב *</label>
              <input required value={form.budget_year} onChange={(e) => setForm({ ...form, budget_year: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" placeholder="תשפ&quot;ו" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">דגם הפעלה *</label>
              <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as ModelType })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] bg-white">
                <option value="self">הרשות מפעילה בעצמה</option>
                <option value="operator">מפעיל חוץ</option>
                <option value="joint">הפעלה משותפת</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">סעיף תב&quot;ר</label>
              <input value={form.tabar_section} onChange={(e) => setForm({ ...form, tabar_section: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">מפעיל</label>
              <select value={selectedOperatorId} onChange={(e) => (e.target.value === '__new__' ? setAddingOperator(true) : selectOperator(e.target.value))}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] bg-white">
                <option value="">— ללא / בחר מפעיל —</option>
                {operators.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
                <option value="__new__">+ הוסף מפעיל חדש...</option>
              </select>
              {addingOperator && (
                <div className="mt-2 p-3 bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg space-y-2">
                  <input value={newOperatorName} onChange={(e) => setNewOperatorName(e.target.value)} placeholder="שם המפעיל *"
                    className="w-full border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
                  <input value={newOperatorEmails} onChange={(e) => setNewOperatorEmails(e.target.value)} placeholder="מיילים (מופרדים בפסיק)" dir="ltr"
                    className="w-full border border-[#d1d9e0] rounded px-2 py-1.5 text-sm" />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setAddingOperator(false)} className="text-xs text-[#636c76]">ביטול</button>
                    <button type="button" onClick={handleAddOperator} className="text-xs px-3 py-1 bg-[#1f883d] text-white rounded">הוסף ובחר</button>
                  </div>
                </div>
              )}
              {form.operator_emails.length > 0 && (
                <p className="text-xs text-[#8c959f] mt-1" dir="ltr">{form.operator_emails.join(', ')}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">קודי נושא</label>
              <MultiSelectSearch
                options={nosemeOptions}
                selected={form.noseme_codes}
                onChange={(codes) => setForm({ ...form, noseme_codes: codes })}
                placeholder="חפש נושא לפי קוד או שם..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">מתאריך (תחולה) *</label>
              <input required type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">עד תאריך (תחולה) *</label>
              <input required type="date" value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" />
            </div>
            {!form._id && (
              <div className="sm:col-span-2 border-t border-[#d1d9e0] pt-3 mt-1">
                <p className="text-xs font-medium text-[#636c76] mb-2">פרמטרים ראשוניים (ניתן לשנות מאוחר יותר בעמוד הפרויקט)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-[#636c76] mb-1">אחוז תקורה (%)</label>
                    <input type="number" step="0.1" value={overheadPct} onChange={(e) => setOverheadPct(e.target.value)}
                      className="w-full border border-[#d1d9e0] rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#636c76] mb-1">אחוז מקדמה (%)</label>
                    <input type="number" step="0.1" value={advancePct} onChange={(e) => setAdvancePct(e.target.value)}
                      className="w-full border border-[#d1d9e0] rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  {form.model === 'joint' && (
                    <>
                      <div>
                        <label className="block text-xs text-[#636c76] mb-1">חלק הרשות (רצפה)</label>
                        <select value={rashutSplitType} onChange={(e) => setRashutSplitType(e.target.value as 'none' | 'percentage' | 'fixed')}
                          className="w-full border border-[#d1d9e0] rounded-lg px-2 py-1.5 text-sm bg-white">
                          <option value="none">לפי הוצאות בפועל בלבד</option>
                          <option value="percentage">אחוז מההכנסה</option>
                          <option value="fixed">סכום קבוע</option>
                        </select>
                      </div>
                      {rashutSplitType !== 'none' && (
                        <div>
                          <label className="block text-xs text-[#636c76] mb-1">{rashutSplitType === 'percentage' ? 'אחוז (%)' : 'סכום (₪)'}</label>
                          <input type="number" step="0.1" value={rashutSplitValue} onChange={(e) => setRashutSplitValue(e.target.value)}
                            className="w-full border border-[#d1d9e0] rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="sm:col-span-2 flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-[#636c76] border border-[#d1d9e0] rounded-lg hover:bg-[#f0f3f6] transition-colors">ביטול</button>
              <button type="submit" disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-[#0969da] text-white rounded-lg hover:bg-[#0860ca] transition-colors disabled:opacity-60">
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#636c76]">טוען פרויקטים...</div>
        ) : visibleProjects.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636c76]">
            {showLocked ? 'אין פרויקטים' : 'אין פרויקטים פתוחים — ייתכן שיש פרויקטים סגורים, לחץ/י "הצג גם פרויקטים סגורים"'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שם</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שנה</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">דגם</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">מפעיל</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">סטטוס</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((p) => (
                <tr key={p._id} className="border-b border-[#f0f3f6] hover:bg-[#f6f8fa]">
                  <td className="px-4 py-3 text-[#1f2328] font-medium">
                    <Link href={`/projects/${p._id}`} className="hover:underline text-[#0969da]">{p.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-[#636c76]">{p.budget_year}</td>
                  <td className="px-4 py-3 text-[#636c76]">{MODEL_LABELS[p.model]}</td>
                  <td className="px-4 py-3 text-[#636c76]">{p.operator_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'locked' ? 'bg-[#fff8c5] text-[#9a6700]' : 'bg-[#dafbe1] text-[#1a7f37]'
                    }`}>
                      {p.status === 'locked' ? 'נעול' : 'פתוח'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/projects/${p._id}`} className="text-xs text-[#0969da] hover:underline">כניסה</Link>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(p)} className="text-xs text-[#0969da] hover:underline">עריכה</button>
                          <button onClick={() => handleDelete(p._id)} className="text-xs text-[#cf222e] hover:underline">מחיקה</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
