'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Row {
  project: { _id: string; name: string; budget_year: string };
  breakdown: { calculatedTotal: number; operatorBudgetIsNegative: boolean };
}

function money(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OperatorReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const canManage = role === 'admin' || role === 'super_admin' || role === 'program_manager';
  const hasAccess = canManage || role === 'operator';

  const [operatorEmail, setOperatorEmail] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!hasAccess) router.replace('/');
  }, [status, hasAccess, router]);

  const load = useCallback(async (email?: string) => {
    setLoading(true);
    setError('');
    try {
      const url = email ? `/api/settlement/operator-report?operator_email=${encodeURIComponent(email)}` : '/api/settlement/operator-report';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setRows(data.rows ?? []);
      setTotalBalance(data.totalBalance ?? 0);
      setOperatorEmail(data.operatorEmail ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'operator') load();
  }, [role, load]);

  if (status === 'loading' || !hasAccess) {
    return <div className="p-8 text-[#636c76] text-sm">טוען...</div>;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1f2328]">דוח מפעיל מאוחד</h1>
        <p className="text-sm text-[#636c76] mt-0.5">יתרה לתשלום בכל הפרויקטים של המפעיל — תשלום עודף בפרויקט אחד מקוזז אוטומטית מול יתרות בפרויקטים אחרים</p>
      </div>

      {canManage && (
        <div className="mb-4 flex items-center gap-2">
          <input
            value={operatorEmail}
            onChange={(e) => setOperatorEmail(e.target.value)}
            placeholder="מייל המפעיל"
            dir="ltr"
            className="border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={() => load(operatorEmail)} className="px-4 py-2 bg-[#0969da] text-white text-sm font-medium rounded-lg hover:bg-[#0860ca]">
            הצג
          </button>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">{error}</div>}

      {loading ? (
        <div className="p-8 text-center text-sm text-[#636c76]">טוען...</div>
      ) : rows.length > 0 ? (
        <>
          <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                  <th className="px-4 py-3 text-xs font-medium text-[#636c76]">פרויקט</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שנה</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#636c76]">יתרה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project._id} className="border-b border-[#f0f3f6] hover:bg-[#f6f8fa]">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${r.project._id}`} className="text-[#0969da] hover:underline font-medium">{r.project.name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-[#636c76]">{r.project.budget_year}</td>
                    <td className={`px-4 py-2.5 font-mono ${r.breakdown.calculatedTotal < 0 ? 'text-[#cf222e]' : 'text-[#1f2328]'}`}>
                      {money(r.breakdown.calculatedTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-[#ddf4ff] border border-[#0969da] rounded-xl flex items-center justify-between">
            <span className="text-sm font-medium text-[#1f2328]">סה&quot;כ מאוחד לתשלום</span>
            <span className="text-lg font-bold text-[#0969da] font-mono">{money(totalBalance)} ₪</span>
          </div>
        </>
      ) : (
        <div className="p-8 text-center text-sm text-[#636c76]">אין פרויקטים להצגה</div>
      )}
    </div>
  );
}
