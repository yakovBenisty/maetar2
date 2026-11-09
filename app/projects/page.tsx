'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

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
  const canManage = role === 'admin' || role === 'program_manager';
  const hasAccess = canManage || role === 'operator';

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

  function openAdd() {
    setForm(EMPTY_FORM);
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
    setShowForm(true);
    setError('');
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

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1f2328]">ניהול פרויקטים</h1>
          <p className="text-sm text-[#636c76] mt-0.5">נושאים תפעוליים (ניצנים, קייטנות וכו׳) להתחשבנות מול מפעילים</p>
        </div>
        {canManage && (
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-[#0969da] text-white text-sm font-medium rounded-lg hover:bg-[#0860ca] transition-colors"
          >
            + פרויקט חדש
          </button>
        )}
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
              <label className="block text-xs font-medium text-[#636c76] mb-1">שם מפעיל</label>
              <input value={form.operator_name} onChange={(e) => setForm({ ...form, operator_name: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">מייל/ים של המפעיל (מופרדים בפסיק)</label>
              <input value={form.operator_emails.join(', ')}
                onChange={(e) => setForm({ ...form, operator_emails: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" dir="ltr" placeholder="operator@example.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">קודי נושא (מופרדים בפסיק)</label>
              <input value={form.noseme_codes.join(', ')}
                onChange={(e) => setForm({ ...form, noseme_codes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]" dir="ltr" placeholder="631, 632" />
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
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636c76]">אין פרויקטים עדיין</div>
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
              {projects.map((p) => (
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
