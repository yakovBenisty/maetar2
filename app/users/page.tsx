'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface UserRecord {
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  createdAt?: string;
}

const EMPTY_FORM: Omit<UserRecord, 'createdAt'> = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'user',
};

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<UserRecord, 'createdAt'>>(EMPTY_FORM);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (status === 'loading') return;
    if (session?.user?.role !== 'admin') {
      router.replace('/');
    }
  }, [session, status, router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('שגיאה בטעינת משתמשים');
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') loadUsers();
  }, [session, loadUsers]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingEmail(null);
    setShowForm(true);
    setSuccess('');
    setError('');
  }

  function openEdit(u: UserRecord) {
    setForm({ email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role });
    setEditingEmail(u.email);
    setShowForm(true);
    setSuccess('');
    setError('');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה בשמירה');
      setSuccess(editingEmail ? 'משתמש עודכן בהצלחה' : 'משתמש נוסף בהצלחה');
      setShowForm(false);
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(email: string) {
    if (!confirm(`למחוק את המשתמש ${email}?`)) return;
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה במחיקה');
      setSuccess('משתמש נמחק');
      loadUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  if (status === 'loading' || session?.user?.role !== 'admin') {
    return <div className="p-8 text-[#636c76] text-sm">טוען...</div>;
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#1f2328]">ניהול משתמשים</h1>
          <p className="text-sm text-[#636c76] mt-0.5">הוספה, עריכה ומחיקה של משתמשי המערכת</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-[#0969da] text-white text-sm font-medium rounded-lg hover:bg-[#0860ca] transition-colors"
        >
          + הוסף משתמש
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-[#f0fff4] border border-[#96d6a0] rounded-lg text-sm text-[#1a7f37]">
          {success}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-6 bg-white border border-[#d1d9e0] rounded-xl p-5">
          <h2 className="text-base font-semibold text-[#1f2328] mb-4">
            {editingEmail ? 'עריכת משתמש' : 'הוספת משתמש חדש'}
          </h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">שם פרטי *</label>
              <input
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
                placeholder="ישראל"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">שם משפחה *</label>
              <input
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
                placeholder="ישראלי"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">כתובת מייל *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editingEmail}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] disabled:bg-[#f6f8fa] disabled:text-[#8c959f]"
                placeholder="user@example.com"
                dir="ltr"
              />
              {editingEmail && (
                <p className="text-xs text-[#8c959f] mt-1">לא ניתן לשנות כתובת מייל</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#636c76] mb-1">סוג משתמש *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'user' | 'admin' })}
                className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] bg-white"
              >
                <option value="user">משתמש רגיל</option>
                <option value="admin">מנהל מערכת</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-[#636c76] border border-[#d1d9e0] rounded-lg hover:bg-[#f0f3f6] transition-colors"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-[#0969da] text-white rounded-lg hover:bg-[#0860ca] transition-colors disabled:opacity-60"
              >
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#636c76]">טוען משתמשים...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#636c76]">אין משתמשים עדיין</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שם מלא</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">מייל</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">סוג</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-[#f0f3f6] hover:bg-[#f6f8fa]">
                  <td className="px-4 py-3 text-[#1f2328] font-medium">
                    {u.firstName} {u.lastName}
                    {u.email === session?.user?.email && (
                      <span className="mr-2 text-xs text-[#0969da]">(אתה)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#636c76]" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-[#ddf4ff] text-[#0969da]'
                          : 'bg-[#f0f3f6] text-[#636c76]'
                      }`}
                    >
                      {u.role === 'admin' ? 'מנהל מערכת' : 'משתמש רגיל'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs text-[#0969da] hover:underline"
                      >
                        עריכה
                      </button>
                      {u.email !== session?.user?.email && (
                        <button
                          onClick={() => handleDelete(u.email)}
                          className="text-xs text-[#cf222e] hover:underline"
                        >
                          מחיקה
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-[#8c959f] mt-4">
        סה&quot;כ {users.length} משתמשים. משתמשים חדשים יוכלו להתחבר רק אחרי שנוספו כאן.
      </p>
    </div>
  );
}
