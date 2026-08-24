'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { exportToCsv } from '@/app/components/exportCsv';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import {
  useColumnAggTypes, withFooterCells, buildFooterRow, TableSummaryBar,
  footerRowStyle, footerRowHeight,
} from '@/app/components/tableSummary';
import { useColumnVisibility, ColumnPickerButton } from '@/app/components/columnPicker';

ModuleRegistry.registerModules([AllCommunityModule]);

interface RunRecord {
  _id: string;
  run_id: string;
  calc_month_display: string;
  split_month_display: string;
  status: string;
  commands: number;
  total: number;
  errors: number;
  warnings: number;
  unprocessed: number;
  started_at: string;
  completed_at?: string;
}

function numFmt(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatDateTime(dateStr: string): string {
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

const columnDefs: ColDef<RunRecord>[] = [
  { field: 'run_id', headerName: 'מזהה ריצה', flex: 1, minWidth: 160, filter: true },
  { field: 'calc_month_display', headerName: 'חודש חישוב', width: 130 },
  { field: 'split_month_display', headerName: 'חודש פיצול', width: 130 },
  {
    field: 'status',
    headerName: 'סטטוס',
    width: 110,
    cellRenderer: (p: { value: string }) => {
      const map: Record<string, { label: string; color: string }> = {
        success: { label: 'הצלחה', color: '#1a7f37' },
        error: { label: 'שגיאה', color: '#cf222e' },
        warning: { label: 'אזהרה', color: '#9a6700' },
      };
      const cfg = map[p.value] ?? { label: p.value, color: '#636c76' };
      return <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>;
    },
  },
  { field: 'commands', headerName: 'פקודות', width: 100, type: 'numericColumn', valueFormatter: (p: { value: unknown }) => numFmt(p.value) },
  { field: 'total', headerName: 'סה"כ', flex: 1, minWidth: 130, type: 'numericColumn', valueFormatter: (p: { value: unknown }) => numFmt(p.value) },
  { field: 'errors', headerName: 'שגיאות', width: 90, type: 'numericColumn', cellStyle: { color: '#cf222e' }, valueFormatter: (p: { value: unknown }) => numFmt(p.value) },
  { field: 'warnings', headerName: 'אזהרות', width: 90, type: 'numericColumn', cellStyle: { color: '#9a6700' }, valueFormatter: (p: { value: unknown }) => numFmt(p.value) },
  { field: 'unprocessed', headerName: 'לא נקלטו', width: 100, type: 'numericColumn', valueFormatter: (p: { value: unknown }) => numFmt(p.value) },
  {
    field: 'started_at',
    headerName: 'תאריך ביצוע',
    flex: 1,
    minWidth: 160,
    valueFormatter: (p: { value: string }) => formatDateTime(p.value),
  },
];

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [filteredRuns, setFilteredRuns] = useState<RunRecord[]>([]);
  useEffect(() => setFilteredRuns(runs), [runs]);

  const onFilterChanged = useCallback((p: { api: GridApi<RunRecord> }) => {
    const next: RunRecord[] = [];
    p.api.forEachNodeAfterFilter(node => { if (node.data) next.push(node.data); });
    setFilteredRuns(next);
  }, []);

  const footerFields = useMemo(
    () => columnDefs.map(c => c.field).filter(Boolean).map(f => String(f)),
    []
  );

  const { getAggType, setAggType } = useColumnAggTypes(runs as unknown as Record<string, unknown>[]);

  const colDefsWithFooter = useMemo(
    () => withFooterCells(columnDefs, runs as unknown as Record<string, unknown>[], getAggType, setAggType),
    [runs, getAggType, setAggType]
  );

  const runsSummaryRow = useMemo(
    () => buildFooterRow(filteredRuns as unknown as Record<string, unknown>[], footerFields, getAggType),
    [filteredRuns, footerFields, getAggType]
  );

  const summaryColumns = useMemo(
    () => columnDefs
      .filter(c => !!c.field)
      .map(c => ({ field: String(c.field), headerName: c.headerName })),
    []
  );

  const { visible: visibleFields, toggle: toggleColumn, showAll: showAllColumns, resetToDefault: resetColumns } =
    useColumnVisibility(footerFields);

  const displayedColDefs = useMemo(
    () => colDefsWithFooter.filter(c => !c.field || visibleFields.has(String(c.field))),
    [colDefsWithFooter, visibleFields]
  );

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((d: { runs: RunRecord[]; error?: string }) => {
        setRuns(d.runs ?? []);
        if (d.error) setErrorMsg(d.error);
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">היסטוריית ריצות</h1>
        <p className="text-[#636c76] text-sm">רשימת כל ריצות עיבוד הפקודות</p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-4 bg-[#ffebe9] border border-[#cf222e] rounded-lg text-[#cf222e] text-sm">
          {errorMsg}
        </div>
      )}

      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1f2328]">ריצות עיבוד</h2>
            <p className="text-xs text-[#636c76] mt-1">{runs.length} ריצות</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToCsv('runs', [
                { header: 'מזהה ריצה', field: 'run_id' },
                { header: 'חודש חישוב', field: 'calc_month_display' },
                { header: 'חודש פיצול', field: 'split_month_display' },
                { header: 'סטטוס', field: 'status' },
                { header: 'פקודות', field: 'commands' },
                { header: 'סה"כ', field: 'total' },
                { header: 'שגיאות', field: 'errors' },
                { header: 'אזהרות', field: 'warnings' },
                { header: 'לא נקלטו', field: 'unprocessed' },
                { header: 'תאריך ביצוע', field: 'started_at' },
              ], runs as unknown as Record<string, unknown>[])}
              disabled={runs.length === 0}
              className="px-3 py-1.5 bg-[#f6f8fa] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              📤 יצוא CSV
            </button>
            <button
              onClick={() => {
                setLoading(true);
                fetch('/api/runs')
                  .then((r) => r.json())
                  .then((d: { runs: RunRecord[] }) => setRuns(d.runs ?? []))
                  .finally(() => setLoading(false));
              }}
              className="px-3 py-1.5 bg-[#f6f8fa] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors"
            >
              🔄 רענן
            </button>
            <ColumnPickerButton
              columns={summaryColumns}
              visible={visibleFields}
              onToggle={toggleColumn}
              onShowAll={showAllColumns}
              onReset={resetColumns}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-[#636c76]">
            טוען נתונים...
          </div>
        ) : (
          <>
            <TableSummaryBar rows={runs as unknown as Record<string, unknown>[]} columns={summaryColumns} recordLabel="ריצות" />
            <div className="ag-theme-alpine" style={{ height: 600 }}>
              <AgGridReact<RunRecord>
                theme="legacy"
                rowData={runs}
                columnDefs={displayedColDefs}
                enableRtl={true}
                defaultColDef={{ sortable: true, resizable: true, filter: true }}
                pagination={true}
                paginationPageSize={20}
                onFilterChanged={onFilterChanged}
                pinnedBottomRowData={runsSummaryRow}
                getRowStyle={footerRowStyle}
                getRowHeight={footerRowHeight}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
