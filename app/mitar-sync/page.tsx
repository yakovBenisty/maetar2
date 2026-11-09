'use client';

import { useEffect, useState } from 'react';

interface SyncRun {
  _id: string;
  sync_run_id: string;
  month?: number;
  year?: number;
  status: 'success' | 'error';
  files_count?: number;
  error?: string;
  started_at: string;
  finished_at: string;
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export default function MitarSyncPage() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadRuns = () => {
    setLoading(true);
    fetch('/api/mitar-sync')
      .then((r) => r.json())
      .then((d: { runs: SyncRun[]; error?: string }) => {
        setRuns(d.runs ?? []);
        if (d.error) setErrorMsg(d.error);
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadRuns, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/mitar-sync', { method: 'POST' });
      const data = await res.json();
      if (!data.ok && data.error) setErrorMsg(data.error);
      loadRuns();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">סנכרון מית&quot;ר</h1>
        <p className="text-[#636c76] text-sm">
          איסוף אוטומטי של קבצי ההכנסות ממערכת מית&quot;ר של משרד החינוך, וייבואם למערכת
        </p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="px-6 py-2.5 bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 disabled:cursor-not-allowed
            text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {syncing ? (
            <>
              <span className="animate-spin inline-block">⏳</span>
              <span>מסנכרן...</span>
            </>
          ) : (
            <>
              <span>🔄</span>
              <span>הרץ סנכרון עכשיו</span>
            </>
          )}
        </button>
        {errorMsg && <p className="text-[#cf222e] text-sm">{errorMsg}</p>}
      </div>

      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1f2328]">היסטוריית סנכרון</h2>
            <p className="text-xs text-[#636c76] mt-1">{runs.length} רשומות</p>
          </div>
          <button
            onClick={loadRuns}
            className="px-3 py-1.5 bg-[#f6f8fa] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors"
          >
            רענן
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-[#636c76]">טוען נתונים...</div>
        ) : runs.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[#636c76] text-sm">
            עדיין לא בוצע סנכרון
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f8fa] text-[#636c76] text-xs border-b border-[#d1d9e0]">
                <th className="px-4 py-2 text-right font-medium">חודש</th>
                <th className="px-4 py-2 text-right font-medium">סטטוס</th>
                <th className="px-4 py-2 text-right font-medium">קבצים</th>
                <th className="px-4 py-2 text-right font-medium">הודעה</th>
                <th className="px-4 py-2 text-right font-medium">תאריך ביצוע</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d1d9e0]">
              {runs.map((run) => (
                <tr key={run._id} className="hover:bg-[#f6f8fa]">
                  <td className="px-4 py-2 text-[#1f2328]">
                    {run.month ? `${MONTH_NAMES[run.month]} ${run.year}` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      style={{ color: run.status === 'success' ? '#1a7f37' : '#cf222e', fontWeight: 600 }}
                    >
                      {run.status === 'success' ? 'הצלחה' : 'שגיאה'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[#1f2328]">{run.files_count ?? ''}</td>
                  <td className="px-4 py-2 text-[#cf222e] text-xs">{run.error ?? ''}</td>
                  <td className="px-4 py-2 text-[#636c76]">{formatDateTime(run.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
