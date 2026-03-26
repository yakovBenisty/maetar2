'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { exportToCsv } from '@/app/components/exportCsv';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

type Phase = 'input' | 'results';

interface SummaryStats {
  total: number;
  totalAmount: number;
  totalIncome: number;
  totalExpense: number;
  period1: number;
  period1Amount: number;
  period2: number;
  period2Amount: number;
  invoiceTotal: number;
  period1InvoiceTotal: number;
  period2InvoiceTotal: number;
  errors: number;
  warnings: number;
  rejected: number;
}

interface ComparisonEntry {
  קוד_נושא: string | number;
  invoiceTotal: number;
  baseTotal: number;
  yadaniTotal: number;
  matched: boolean;
  matchType: 'base' | 'base+yadani' | 'none';
  הפרש?: number;
}

interface ProcessResult {
  ok: boolean;
  runId: string;
  tabs: {
    summary: SummaryStats;
    period1: Record<string, unknown>[];
    period2: Record<string, unknown>[];
    logs: Record<string, unknown>[];
    comparison: ComparisonEntry[];
    rejected: Record<string, unknown>[];
  };
  error?: string;
}

const RESULT_TABS = [
  { key: 'summary', label: 'סיכום' },
  { key: 'period1', label: 'פקודות תקופה ראשונה' },
  { key: 'period2', label: 'פקודות תקופה שנייה' },
  { key: 'logs', label: 'לוג שגיאות' },
  { key: 'rejected', label: 'לא נקלטו' },
] as const;

function formatCurrency(amount: number): string {
  if (amount == null) return '';
  const truncated = Math.trunc(amount * 10) / 10;
  return truncated.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatDateDMY(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

const commandColDefs: ColDef[] = [
  {
    field: 'seif_hova',
    headerName: 'סעיף חובה',
    width: 120,
    valueFormatter: (p: { value: unknown }) => (p.value != null && p.value !== 0 && p.value !== '') ? String(p.value) : '',
  },
  {
    field: 'seif_zhut',
    headerName: 'סעיף זכות',
    width: 120,
    valueFormatter: (p: { value: unknown }) => (p.value != null && p.value !== 0 && p.value !== '') ? String(p.value) : '',
  },
  {
    field: 'תאריך_ערך',
    headerName: 'תאריך ערך',
    width: 110,
    valueFormatter: (p: { value: unknown }) => formatDateDMY(p.value),
  },
  { field: 'תיאור', headerName: 'תיאור', flex: 2, minWidth: 200 },
  { field: 'קוד_נושא', headerName: 'אסמכתא ראשית', width: 120 },
  { field: 'סמל_מוסד', headerName: 'אסמכתא משנית', width: 120 },
  {
    field: 'סכום_חובה',
    headerName: 'חובה',
    width: 130,
    type: 'numericColumn',
    valueGetter: (p: { data: Record<string, unknown> }) =>
      p.data?.['סכום_חובה'] != null ? Number(p.data['סכום_חובה']) : null,
    valueFormatter: (p: { value: number | null }) =>
      p.value != null ? formatCurrency(p.value) : '',
  },
  {
    field: 'סכום_זכות',
    headerName: 'זכות',
    width: 130,
    type: 'numericColumn',
    valueFormatter: (p: { value: number | null }) =>
      p.value != null ? formatCurrency(p.value) : '',
  },
];

const COMMAND_CSV_COLS = [
  { header: 'סעיף חובה', getValue: (row: Record<string, unknown>) =>
      (row['seif_hova'] != null && row['seif_hova'] !== 0 && row['seif_hova'] !== '') ? row['seif_hova'] : '' },
  { header: 'סעיף זכות', getValue: (row: Record<string, unknown>) =>
      (row['seif_zhut'] != null && row['seif_zhut'] !== 0 && row['seif_zhut'] !== '') ? row['seif_zhut'] : '' },
  { header: 'תאריך ערך', getValue: (row: Record<string, unknown>) => formatDateDMY(row['תאריך_ערך']) },
  { header: 'תיאור', field: 'תיאור' },
  { header: 'אסמכתא ראשית', field: 'קוד_נושא' },
  { header: 'אסמכתא משנית', field: 'סמל_מוסד' },
  { header: 'חובה', getValue: (row: Record<string, unknown>) =>
      row['סכום_חובה'] != null ? Math.trunc(Number(row['סכום_חובה']) * 10) / 10 : '' },
  { header: 'זכות', getValue: (row: Record<string, unknown>) =>
      row['סכום_זכות'] != null ? Math.trunc(Number(row['סכום_זכות']) * 10) / 10 : '' },
];

const LOG_CSV_COLS = [
  { header: 'סוג', field: 'type' },
  { header: 'קוד נושא', field: 'קוד_נושא' },
  { header: 'הודעה', field: 'message' },
];

const COMPARISON_CSV_COLS = [
  { header: 'קוד נושא', field: 'קוד_נושא' },
  { header: 'סה"כ חשבונית', field: 'invoiceTotal' },
  { header: 'סה"כ בסיס', field: 'baseTotal' },
  { header: 'סה"כ ידני', field: 'yadaniTotal' },
  { header: 'הפרש לתשלום', field: 'הפרש' },
];

const REJECTED_CSV_COLS = [
  { header: 'קוד נושא', field: 'קוד_נושא' },
  { header: 'סיבה', field: 'reason' },
];

const logColDefs: ColDef[] = [
  {
    field: 'type',
    headerName: 'סוג',
    width: 100,
    cellRenderer: (p: { value: string }) => {
      if (p.value === 'error')   return <span style={{ color: '#cf222e', fontWeight: 600 }}>שגיאה</span>;
      if (p.value === 'warning') return <span style={{ color: '#9a6700', fontWeight: 600 }}>אזהרה</span>;
      return <span style={{ color: '#0969da', fontWeight: 600 }}>מידע</span>;
    },
  },
  { field: 'קוד_נושא', headerName: 'קוד נושא', width: 100 },
  { field: 'message', headerName: 'הודעה', flex: 1, minWidth: 200 },
];

const comparisonColDefs: ColDef[] = [
  { field: 'קוד_נושא', headerName: 'קוד נושא', width: 100 },
  {
    field: 'invoiceTotal',
    headerName: 'סה"כ חשבונית',
    flex: 1,
    type: 'numericColumn',
    valueFormatter: (p: { value: number }) => formatCurrency(p.value ?? 0),
  },
  {
    field: 'baseTotal',
    headerName: 'סה"כ בסיס',
    flex: 1,
    type: 'numericColumn',
    valueFormatter: (p: { value: number }) => formatCurrency(p.value ?? 0),
  },
  {
    field: 'yadaniTotal',
    headerName: 'סה"כ ידני',
    flex: 1,
    type: 'numericColumn',
    valueFormatter: (p: { value: number }) => formatCurrency(p.value ?? 0),
  },
  {
    field: 'הפרש',
    headerName: 'הפרש לתשלום',
    flex: 1,
    type: 'numericColumn',
    valueFormatter: (p: { value: number }) => formatCurrency(p.value ?? 0),
    cellStyle: (p: { value: number }) => ({
      color: Math.abs(p.value ?? 0) > 0.01 ? '#cf222e' : '#1a7f37',
      fontWeight: 'bold',
    }),
  },
];

const rejectedColDefs: ColDef[] = [
  { field: 'קוד_נושא', headerName: 'קוד נושא', width: 120 },
  { field: 'reason', headerName: 'סיבה', flex: 1, minWidth: 200 },
];

function lastDayOfCurrentMonth(): string {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

const SESSION_META_KEY = 'prepare_meta';
const SESSION_RESULT_KEY = 'prepare_result';

export default function PreparePage() {
  const [phase, setPhase] = useState<Phase>('input');
  const [calcMonth, setCalcMonth] = useState('');
  const [splitMonth, setSplitMonth] = useState('');
  const [valueDate, setValueDate] = useState<string>(lastDayOfCurrentMonth());
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [resultTab, setResultTab] = useState<string>('summary');
  const [errorMsg, setErrorMsg] = useState('');
  const isFirstSave = useRef(true);

  // טעינת מצב שמור — פעם אחת בלבד בעת כניסה לדף
  useEffect(() => {
    try {
      const meta = sessionStorage.getItem(SESSION_META_KEY);
      if (meta) {
        const s = JSON.parse(meta);
        if (s.calcMonth)  setCalcMonth(s.calcMonth);
        if (s.splitMonth) setSplitMonth(s.splitMonth);
        if (s.valueDate)  setValueDate(s.valueDate);
        if (s.phase)      setPhase(s.phase);
        if (s.resultTab)  setResultTab(s.resultTab);
      }
      const resultStr = sessionStorage.getItem(SESSION_RESULT_KEY);
      if (resultStr) setResult(JSON.parse(resultStr));
    } catch { /* sessionStorage not available */ }
  }, []);

  // שמירת מצב — מדלג על הריצה הראשונה (לפני שהטעינה מ-sessionStorage הסתיימה)
  useEffect(() => {
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    try {
      sessionStorage.setItem(SESSION_META_KEY, JSON.stringify({
        calcMonth, splitMonth, valueDate, phase, resultTab,
      }));
    } catch { /* ignore */ }
    try {
      if (result) sessionStorage.setItem(SESSION_RESULT_KEY, JSON.stringify(result));
      else        sessionStorage.removeItem(SESSION_RESULT_KEY);
    } catch { /* result too large — skip */ }
  }, [calcMonth, splitMonth, valueDate, phase, result, resultTab]);

  useEffect(() => {
    fetch('/api/mongo/months')
      .then((r) => r.json())
      .then((d: { months: string[] }) => setAvailableMonths(d.months ?? []))
      .catch(() => {});
  }, []);

  const handleProcess = useCallback(async () => {
    if (!calcMonth || !splitMonth || !valueDate) {
      setErrorMsg('יש לבחור חודש חישוב, חודש פיצול ותאריך ערך');
      return;
    }
    setProcessing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calc_month: calcMonth, split_month: splitMonth, value_date: valueDate }),
      });
      const data = await res.json() as ProcessResult;

      // Compute הפרש for each comparison row and filter to non-zero only
      if (data.ok && data.tabs?.comparison) {
        data.tabs.comparison = data.tabs.comparison
          .map((row) => ({
            ...row,
            הפרש: row.invoiceTotal - row.baseTotal - row.yadaniTotal,
          }))
          .filter((row) => Math.abs(row.הפרש ?? 0) > 0.01);
      }

      setResult(data);
      if (data.ok) {
        setPhase('results');
        setResultTab('summary');
      } else {
        setErrorMsg(data.error ?? 'שגיאה בעיבוד');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת');
    } finally {
      setProcessing(false);
    }
  }, [calcMonth, splitMonth, valueDate]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">הכנת פקודה</h1>
        <p className="text-[#636c76] text-sm">עיבוד נתונים והפקת פקודות תשלום</p>
      </div>

      {phase === 'input' && (
        <div className="grid gap-6">
          {/* Month pickers */}
          <div className="bg-white border border-[#d1d9e0] rounded-xl p-6">
            <h2 className="text-base font-semibold text-[#1f2328] mb-4">הגדרת תקופה</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-[#636c76] mb-2">חודש חישוב</label>
                <select
                  value={calcMonth}
                  onChange={(e) => setCalcMonth(e.target.value)}
                  className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
                >
                  <option value="">-- בחר חודש --</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m.split('-')[1]}/{m.split('-')[0]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#636c76] mb-2">חודש פיצול</label>
                <input
                  type="month"
                  value={splitMonth}
                  onChange={(e) => setSplitMonth(e.target.value)}
                  className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
                />
              </div>
              <div>
                <label className="block text-sm text-[#636c76] mb-2">תאריך ערך</label>
                <input
                  type="date"
                  value={valueDate}
                  onChange={(e) => setValueDate(e.target.value)}
                  className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
                />
                <p className="text-xs text-[#636c76] mt-1">ברירת מחדל: סוף החודש הנוכחי</p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleProcess}
              disabled={processing || !calcMonth || !splitMonth}
              className="px-6 py-2.5 bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 disabled:cursor-not-allowed
                text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {processing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>מעבד...</span>
                </>
              ) : (
                <>
                  <span>⚙️</span>
                  <span>הפק פקודה</span>
                </>
              )}
            </button>
            {errorMsg && <p className="text-[#cf222e] text-sm">{errorMsg}</p>}
          </div>
        </div>
      )}

      {phase === 'results' && result?.ok && (
        <div>
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setPhase('input')}
              className="px-4 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] text-[#1f2328] text-sm font-medium rounded-lg transition-colors border border-[#d1d9e0]"
            >
              ← חזור
            </button>
            <div>
              <h2 className="text-lg font-semibold text-[#1f2328]">תוצאות עיבוד</h2>
              <p className="text-xs text-[#636c76]">מזהה ריצה: {result.runId}</p>
            </div>
          </div>

          {/* Result tabs */}
          <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
            <div className="flex border-b border-[#d1d9e0] overflow-x-auto">
              {RESULT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setResultTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    resultTab === tab.key
                      ? 'text-[#0969da] border-b-2 border-[#0969da] bg-[#ddf4ff]'
                      : 'text-[#636c76] hover:text-[#1f2328] hover:bg-[#f0f3f6]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {resultTab === 'summary' && result.tabs?.summary && (() => {
                const s = result.tabs.summary;
                const p1 = (result.tabs.period1 ?? []) as Record<string, unknown>[];
                const p2 = (result.tabs.period2 ?? []) as Record<string, unknown>[];

                const p1Debit  = p1.reduce((sum, r) => sum + (Number(r['סכום_חובה']) || 0), 0);
                const p1Credit = p1.reduce((sum, r) => sum + (Number(r['סכום_זכות']) || 0), 0);
                const p2Debit  = p2.reduce((sum, r) => sum + (Number(r['סכום_חובה']) || 0), 0);
                const p2Credit = p2.reduce((sum, r) => sum + (Number(r['סכום_זכות']) || 0), 0);

                const p1Hoz = p1
                  .filter((r) => String(r['תיאור']).includes('חוז משרד החינוך'))
                  .reduce((sum, r) => sum + (Number(r['סכום_חובה']) || 0) + (Number(r['סכום_זכות']) || 0), 0);
                const p2Hoz = p2
                  .filter((r) => String(r['תיאור']).includes('חוז משרד החינוך'))
                  .reduce((sum, r) => sum + (Number(r['סכום_חובה']) || 0) + (Number(r['סכום_זכות']) || 0), 0);

                const totalDebit  = p1Debit + p2Debit;
                const totalCredit = p1Credit + p2Credit;
                const totalHoz    = p1Hoz + p2Hoz;

                const thCls = 'text-right text-xs font-semibold text-[#636c76] px-4 py-2 bg-[#f0f3f6]';
                const tdCls = 'text-right px-4 py-2.5 font-mono text-sm text-[#1f2328]';
                const tdTotalCls = 'text-right px-4 py-2.5 font-mono text-sm font-bold text-[#1f2328] bg-[#f6f8fa]';
                const labelCls = 'text-right px-4 py-2.5 text-sm font-medium text-[#1f2328]';

                return (
                  <div className="space-y-6">
                    {/* סה"כ בחשבוניות */}
                    <div className="flex justify-end">
                      <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg p-4 min-w-[220px] text-right">
                        <p className="text-xs text-[#636c76] mb-1">סה&quot;כ בחשבוניות</p>
                        <p className="text-xl font-bold text-[#1f2328]">{formatCurrency(s.invoiceTotal)}</p>
                      </div>
                    </div>

                    {/* טבלת זכות / חובה / הפרש */}
                    <div className="overflow-x-auto rounded-lg border border-[#d1d9e0]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#d1d9e0]">
                            <th className={thCls + ' w-40'}></th>
                            <th className={thCls}>תקופה ראשונה</th>
                            <th className={thCls}>תקופה שניה</th>
                            <th className={thCls + ' border-r border-[#d1d9e0]'}>סה&quot;כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-[#d1d9e0]">
                            <td className={labelCls}>זכות</td>
                            <td className={tdCls}>{formatCurrency(p1Credit)}</td>
                            <td className={tdCls}>{formatCurrency(p2Credit)}</td>
                            <td className={tdTotalCls}>{formatCurrency(totalCredit)}</td>
                          </tr>
                          <tr className="border-b border-[#d1d9e0]">
                            <td className={labelCls}>חובה</td>
                            <td className={tdCls}>{formatCurrency(p1Debit)}</td>
                            <td className={tdCls}>{formatCurrency(p2Debit)}</td>
                            <td className={tdTotalCls}>{formatCurrency(totalDebit)}</td>
                          </tr>
                          <tr>
                            <td className={labelCls + ' text-[#636c76]'}>הפרש בין חובה לזכות</td>
                            {[p1Debit - p1Credit, p2Debit - p2Credit, totalDebit - totalCredit].map((diff, i) => (
                              <td key={i} className={`${i === 2 ? tdTotalCls : tdCls} ${Math.abs(diff) > 1 ? 'text-[#cf222e]' : 'text-[#1a7f37]'}`}>
                                {formatCurrency(diff)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* טבלת חוז */}
                    <div className="overflow-x-auto rounded-lg border border-[#d1d9e0]">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#d1d9e0]">
                            <th className={thCls + ' w-40'}></th>
                            <th className={thCls}>תקופה ראשונה</th>
                            <th className={thCls}>תקופה שניה</th>
                            <th className={thCls + ' border-r border-[#d1d9e0]'}>סה&quot;כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className={labelCls}>חוז</td>
                            <td className={tdCls}>{formatCurrency(p1Hoz)}</td>
                            <td className={tdCls}>{formatCurrency(p2Hoz)}</td>
                            <td className={tdTotalCls}>{formatCurrency(totalHoz)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* מצב */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { label: 'שורות תקופה ראשונה', value: p1.length, color: 'text-[#0969da]' },
                        { label: 'שורות תקופה שניה',   value: p2.length, color: 'text-[#0969da]' },
                        { label: 'שגיאות',              value: s.errors,  color: 'text-[#cf222e]' },
                        { label: 'אזהרות',              value: s.warnings, color: 'text-[#9a6700]' },
                        { label: 'לא נקלטו',            value: s.rejected, color: 'text-[#cf222e]' },
                      ].map((card) => (
                        <div key={card.label} className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg p-4">
                          <p className="text-xs text-[#636c76] mb-1">{card.label}</p>
                          <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {resultTab === 'period1' && (
                <>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => exportToCsv('פקודות_תקופה_ראשונה', COMMAND_CSV_COLS, (result.tabs?.period1 ?? []) as Record<string, unknown>[])}
                      disabled={(result.tabs?.period1?.length ?? 0) === 0}
                      className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      📤 יצוא CSV
                    </button>
                  </div>
                  <div className="ag-theme-alpine" style={{ height: 500 }}>
                    <AgGridReact
                      theme="legacy"
                      rowData={result.tabs?.period1 ?? []}
                      columnDefs={commandColDefs}
                      enableRtl={true}
                      defaultColDef={{ sortable: true, resizable: true, filter: true }}
                    />
                  </div>
                </>
              )}

              {resultTab === 'period2' && (
                <>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => exportToCsv('פקודות_תקופה_שניה', COMMAND_CSV_COLS, (result.tabs?.period2 ?? []) as Record<string, unknown>[])}
                      disabled={(result.tabs?.period2?.length ?? 0) === 0}
                      className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      📤 יצוא CSV
                    </button>
                  </div>
                  <div className="ag-theme-alpine" style={{ height: 500 }}>
                    <AgGridReact
                      theme="legacy"
                      rowData={result.tabs?.period2 ?? []}
                      columnDefs={commandColDefs}
                      enableRtl={true}
                      defaultColDef={{ sortable: true, resizable: true, filter: true }}
                    />
                  </div>
                </>
              )}

              {resultTab === 'logs' && (
                <>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => exportToCsv('לוג_שגיאות', LOG_CSV_COLS, (result.tabs?.logs ?? []) as Record<string, unknown>[])}
                      disabled={(result.tabs?.logs?.length ?? 0) === 0}
                      className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      📤 יצוא CSV
                    </button>
                  </div>
                  <div className="ag-theme-alpine" style={{ height: 500 }}>
                    <AgGridReact
                      theme="legacy"
                      rowData={result.tabs?.logs ?? []}
                      columnDefs={logColDefs}
                      enableRtl={true}
                      defaultColDef={{ sortable: true, resizable: true, filter: true }}
                    />
                  </div>
                </>
              )}

{resultTab === 'rejected' && (
                <>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => exportToCsv('לא_נקלטו', REJECTED_CSV_COLS, (result.tabs?.rejected ?? []) as Record<string, unknown>[])}
                      disabled={(result.tabs?.rejected?.length ?? 0) === 0}
                      className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      📤 יצוא CSV
                    </button>
                  </div>
                  <div className="ag-theme-alpine" style={{ height: 500 }}>
                    <AgGridReact
                      theme="legacy"
                      rowData={result.tabs?.rejected ?? []}
                      columnDefs={rejectedColDefs}
                      enableRtl={true}
                      defaultColDef={{ sortable: true, resizable: true, filter: true }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
