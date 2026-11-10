'use client';

import { useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface IncomeRow {
  code: string;
  name: string;
  calcMonth: string;
  tachulaMonth: string;
  total: number;
  rowsCount: number;
}

interface AdvanceComparisonRow {
  code: string;
  name: string;
  calcMonth: string;
  tachulaMonth: string;
  cheshbonit: number;
  yadaniim: number;
  diff: number;
}

function fmtNum(v: unknown): string {
  const n = Number(v);
  if (v == null || v === '' || isNaN(n)) return '';
  return n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const columnDefs: ColDef<IncomeRow>[] = [
  { field: 'code', headerName: 'קוד נושא', width: 110, filter: true },
  { field: 'name', headerName: 'תאור נושא', flex: 2, minWidth: 200, filter: true },
  { field: 'calcMonth', headerName: 'חודש חישוב', width: 130, filter: true },
  { field: 'tachulaMonth', headerName: 'חודש תחולה', width: 130, filter: true },
  {
    field: 'total',
    headerName: 'הפרש לתשלום',
    type: 'numericColumn',
    flex: 1,
    minWidth: 160,
    valueFormatter: (p: { value: unknown }) => fmtNum(p.value),
  },
  { field: 'rowsCount', headerName: 'מספר שורות מקור', width: 140, type: 'numericColumn' },
];

export default function IncomeReportPage() {
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [advanceComparison, setAdvanceComparison] = useState<AdvanceComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch('/api/reports/income')
      .then((r) => r.json())
      .then((data: { ok: boolean; rows: IncomeRow[]; advanceComparison: AdvanceComparisonRow[]; error?: string }) => {
        setRows(data.rows ?? []);
        setAdvanceComparison(data.advanceComparison ?? []);
        if (!data.ok) setErrorMsg(data.error ?? 'שגיאה בטעינה');
      })
      .catch((err) => setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת'))
      .finally(() => setLoading(false));
  }, []);

  const totalSum = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0), [rows]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">הכנסות משרד החינוך</h1>
        <p className="text-[#636c76] text-sm">
          כל הסכומים (CHESHBONIT) מקובצים לפי נושא, חודש חישוב וחודש תחולה — הפרש לתשלום לכל שורה
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">{errorMsg}</div>
      )}

      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa] flex items-center justify-between">
          <p className="text-xs text-[#636c76]">{rows.length} שורות מקובצות</p>
          <p className="text-sm font-semibold text-[#1f2328]">
            סה&quot;כ: {fmtNum(totalSum)} ₪
          </p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-[#636c76]">טוען נתונים...</div>
        ) : (
          <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
            <AgGridReact<IncomeRow>
              theme="legacy"
              rowData={rows}
              columnDefs={columnDefs}
              enableRtl={true}
              defaultColDef={{ sortable: true, resizable: true }}
            />
          </div>
        )}
      </div>

      {!loading && advanceComparison.length > 0 && (
        <div className="mt-6 bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa]">
            <h2 className="text-base font-semibold text-[#1f2328]">השוואת מקדמות — חשבוניות מול ידניים</h2>
            <p className="text-xs text-[#636c76] mt-1">
              לכל נושא/חודש שבו קיימת שורת &quot;מקדמה&quot; בחשבוניות (לפי הערות) ו/או בידניים (לפי סוג תשלום) — ללא חיבור אוטומטי, רק להשוואה
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f6f8fa] border-b border-[#d1d9e0] text-right">
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">קוד נושא</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">תאור נושא</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש חישוב</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש תחולה</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">מקדמה בחשבוניות</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">מקדמה בידניים</th>
                <th className="px-4 py-2 text-xs font-medium text-[#636c76]">הפרש</th>
              </tr>
            </thead>
            <tbody>
              {advanceComparison.map((r, i) => (
                <tr key={i} className={`border-b border-[#f0f3f6] ${r.diff !== 0 ? 'bg-[#fff8c5]' : ''}`}>
                  <td className="px-4 py-2 text-[#1f2328]">{r.code}</td>
                  <td className="px-4 py-2 text-[#1f2328]">{r.name}</td>
                  <td className="px-4 py-2 text-[#636c76]">{r.calcMonth}</td>
                  <td className="px-4 py-2 text-[#636c76]">{r.tachulaMonth}</td>
                  <td className="px-4 py-2 font-mono text-[#1f2328]">{fmtNum(r.cheshbonit)}</td>
                  <td className="px-4 py-2 font-mono text-[#1f2328]">{fmtNum(r.yadaniim)}</td>
                  <td className={`px-4 py-2 font-mono font-bold ${r.diff !== 0 ? 'text-[#9a6700]' : 'text-[#1a7f37]'}`}>{fmtNum(r.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
