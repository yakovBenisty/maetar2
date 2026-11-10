'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Row {
  project: { _id: string; name: string; budget_year: string; model: string; status: string };
  breakdown: {
    incomeTotal: number;
    rashutExpensesTotal: number;
    operatorBudget: number;
    operatorExpensesTotal: number;
    previouslyPaidTotal: number;
    calculatedTotal: number;
    operatorBudgetIsNegative: boolean;
  };
}

function money(n: number): string {
  return n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function SettlementDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const canManage = session?.user?.role === 'admin' || session?.user?.role === 'super_admin' || session?.user?.role === 'program_manager';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!canManage) router.replace('/');
  }, [status, canManage, router]);

  useEffect(() => {
    if (!canManage) return;
    fetch('/api/settlement/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setRows(d.rows ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canManage]);

  if (status === 'loading' || !canManage) {
    return <div className="p-8 text-[#636c76] text-sm">טוען...</div>;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      income: acc.income + r.breakdown.incomeTotal,
      operatorBudget: acc.operatorBudget + r.breakdown.operatorBudget,
      paid: acc.paid + r.breakdown.previouslyPaidTotal,
      balance: acc.balance + r.breakdown.calculatedTotal,
    }),
    { income: 0, operatorBudget: 0, paid: 0, balance: 0 }
  );

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1f2328]">לוח ריכוז חוצה-נושאים</h1>
        <p className="text-sm text-[#636c76] mt-0.5">מצב כל הפרויקטים — מחושב חי מהנתונים הקיימים</p>
      </div>

      {error && <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">{error}</div>}

      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#636c76]">טוען...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">פרויקט</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שנה</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">סטטוס</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">הכנסה</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">תקציב הפעלה</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">שולם</th>
                <th className="px-4 py-3 text-xs font-medium text-[#636c76]">יתרה לתשלום</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project._id} className="border-b border-[#f0f3f6] hover:bg-[#f6f8fa]">
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${r.project._id}`} className="text-[#0969da] hover:underline font-medium">{r.project.name}</Link>
                    {r.breakdown.operatorBudgetIsNegative && <span className="mr-2 text-xs text-[#9a6700]">⚠️</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[#636c76]">{r.project.budget_year}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${r.project.status === 'locked' ? 'bg-[#fff8c5] text-[#9a6700]' : 'bg-[#dafbe1] text-[#1a7f37]'}`}>
                      {r.project.status === 'locked' ? 'נעול' : 'פתוח'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(r.breakdown.incomeTotal)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(r.breakdown.operatorBudget)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(r.breakdown.previouslyPaidTotal)}</td>
                  <td className="px-4 py-2.5 font-mono font-bold text-[#0969da]">{money(r.breakdown.calculatedTotal)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-[#f6f8fa] border-t-2 border-[#d1d9e0] font-bold">
                  <td className="px-4 py-2.5 text-[#1f2328]" colSpan={3}>סה&quot;כ</td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(totals.income)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(totals.operatorBudget)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#1f2328]">{money(totals.paid)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#0969da]">{money(totals.balance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
