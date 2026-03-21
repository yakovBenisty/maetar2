'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImportInfoButton from '@/app/components/ImportInfoButton';
import { exportToCsv } from '@/app/components/exportCsv';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface MosadRecord {
  code: string;
  name: string;
  nihul_atsmi: string;
  hazana: string;
  krav: string;
  sachar: string;
  updated_at?: string;
}

const emptyForm: MosadRecord = {
  code: '',
  name: '',
  nihul_atsmi: '',
  hazana: '',
  krav: '',
  sachar: '',
};

const columnDefs: ColDef<MosadRecord>[] = [
  { field: 'code', headerName: 'קוד מוסד', width: 110, filter: true },
  { field: 'name', headerName: 'שם מוסד', flex: 2, minWidth: 150, filter: true },
  { field: 'nihul_atsmi', headerName: 'ניהול עצמי', flex: 1, minWidth: 120, valueFormatter: (p: { value: unknown }) => p.value != null && p.value !== '' ? Number(p.value).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' },
  { field: 'hazana', headerName: 'הזנה', flex: 1, minWidth: 100, valueFormatter: (p: { value: unknown }) => p.value != null && p.value !== '' ? Number(p.value).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' },
  { field: 'krav', headerName: 'קרב', flex: 1, minWidth: 100, valueFormatter: (p: { value: unknown }) => p.value != null && p.value !== '' ? Number(p.value).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' },
  { field: 'sachar', headerName: 'שכר', flex: 1, minWidth: 100, valueFormatter: (p: { value: unknown }) => p.value != null && p.value !== '' ? Number(p.value).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' },
];

export default function MosdotPage() {
  const [rows, setRows] = useState<MosadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<MosadRecord>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [gridApi, setGridApi] = useState<GridApi<MosadRecord> | null>(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const colPanelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const ALL_COLUMNS = [
    { field: 'code', label: 'קוד מוסד' },
    { field: 'name', label: 'שם מוסד' },
    { field: 'nihul_atsmi', label: 'ניהול עצמי' },
    { field: 'hazana', label: 'הזנה' },
    { field: 'krav', label: 'קרב' },
    { field: 'sachar', label: 'שכר' },
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mosdot');
      const data = await res.json() as { mosdot: MosadRecord[] };
      setRows(data.mosdot ?? []);
    } catch {
      setErrorMsg('שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setShowColPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!gridApi) return;
    ALL_COLUMNS.forEach(({ field }) => {
      gridApi.setColumnsVisible([field], !hiddenCols.has(field));
    });
  }, [hiddenCols, gridApi]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleColumn = useCallback((field: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.code) {
      setErrorMsg('קוד מוסד הוא שדה חובה');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/mosdot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setSuccessMsg(editMode ? 'מוסד עודכן בהצלחה' : 'מוסד נוסף בהצלחה');
        setShowForm(false);
        setForm(emptyForm);
        setEditMode(false);
        await loadData();
      } else {
        setErrorMsg(data.error ?? 'שגיאה בשמירה');
      }
    } catch {
      setErrorMsg('שגיאת רשת');
    } finally {
      setSaving(false);
    }
  }, [form, editMode, loadData]);

  const handleDelete = useCallback(async (code: string) => {
    if (!confirm(`האם למחוק את מוסד ${code}?`)) return;
    setErrorMsg('');
    try {
      const res = await fetch(`/api/mosdot?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setSuccessMsg('מוסד נמחק בהצלחה');
        await loadData();
      } else {
        setErrorMsg(data.error ?? 'שגיאה במחיקה');
      }
    } catch {
      setErrorMsg('שגיאת רשת');
    }
  }, [loadData]);

  const handleEdit = useCallback((row: MosadRecord) => {
    setForm({ ...row });
    setEditMode(true);
    setShowForm(true);
    setErrorMsg('');
    setSuccessMsg('');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);


  const handleImportExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    let data: Record<string, unknown>[];
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: 'string' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    } else {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    }

    let imported = 0;
    for (const row of data) {
      const record: MosadRecord = {
        code: String(row['code'] ?? row['קוד'] ?? ''),
        name: String(row['name'] ?? row['שם'] ?? ''),
        nihul_atsmi: String(row['nihul_atsmi'] ?? row['ניהול_עצמי'] ?? ''),
        hazana: String(row['hazana'] ?? row['הזנה'] ?? ''),
        krav: String(row['krav'] ?? row['קרב'] ?? ''),
        sachar: String(row['sachar'] ?? row['שכר'] ?? ''),
      };
      if (!record.code) continue;
      await fetch('/api/mosdot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      imported++;
    }
    setSuccessMsg(`יובאו ${imported} מוסדות`);
    await loadData();
    e.target.value = '';
  }, [loadData]);

  const mosdotSummaryRow = useMemo<MosadRecord[]>(() => [{
    code: `סה"כ: ${rows.length} רשומות`,
    name: '', nihul_atsmi: '', hazana: '', krav: '', sachar: '',
  }], [rows]);

  const colDefsWithActions: ColDef<MosadRecord>[] = [
    ...columnDefs,
    {
      headerName: 'פעולות',
      width: 140,
      pinned: 'left' as const,
      cellRenderer: (p: { data: MosadRecord }) => {
        const code = p.data?.code ?? '';
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: '100%' }}>
            <button data-action="edit" data-code={code} style={{ padding: '2px 8px', background: '#f0f3f6', border: '1px solid #d1d9e0', color: '#0969da', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>ערוך</button>
            <button data-action="delete" data-code={code} style={{ padding: '2px 8px', background: '#ffebe9', border: '1px solid #cf222e', color: '#cf222e', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>מחק</button>
          </div>
        );
      },
      onCellClicked: (p) => {
        const target = p.event?.target as HTMLButtonElement | null;
        if (!target) return;
        const action = target.dataset['action'];
        const code = target.dataset['code'];
        if (!code) return;
        if (action === 'edit') {
          const row = rows.find((r) => r.code === code);
          if (row) handleEdit(row);
        } else if (action === 'delete') {
          handleDelete(code);
        }
      },
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">ניהול מוסדות</h1>
        <p className="text-[#636c76] text-sm">מוסדות חינוך (mosdot)</p>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4 p-4 bg-[#ffebe9] border border-[#cf222e] rounded-lg text-[#cf222e] text-sm flex justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-[#dafbe1] border border-[#1a7f37] rounded-lg text-[#1a7f37] text-sm flex justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')}>✕</button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => {
            setForm(emptyForm);
            setEditMode(false);
            setShowForm(true);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          className="px-4 py-2 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          + הוסף מוסד
        </button>

        <div className="flex items-center gap-1">
          <label className="px-4 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-2">
            📥 ייבוא מ-Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="hidden" />
          </label>
          <ImportInfoButton
            title="דרישות ייבוא — מוסדות"
            columns={[
              { name: 'קוד', aliases: ['code'], required: true },
              { name: 'שם', aliases: ['name'] },
              { name: 'ניהול_עצמי', aliases: ['nihul_atsmi'] },
              { name: 'הזנה', aliases: ['hazana'] },
              { name: 'קרב', aliases: ['krav'] },
              { name: 'שכר', aliases: ['sachar'] },
            ]}
            extra="כל עמודה מכילה את קוד הסעיף עבור אותו סוג תשלום למוסד."
          />
        </div>

        <button
          onClick={() => exportToCsv('mosdot', [
            { header: 'קוד מוסד', field: 'code' },
            { header: 'שם מוסד', field: 'name' },
            { header: 'ניהול עצמי', field: 'nihul_atsmi' },
            { header: 'הזנה', field: 'hazana' },
            { header: 'קרב', field: 'krav' },
            { header: 'שכר', field: 'sachar' },
          ], rows as unknown as Record<string, unknown>[])}
          disabled={rows.length === 0}
          className="px-4 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          📤 יצוא CSV
        </button>

        <button
          onClick={loadData}
          className="px-4 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors"
        >
          🔄 רענן
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div ref={formRef} className="bg-white border border-[#d1d9e0] rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-4">
            {editMode ? 'עריכת מוסד' : 'הוספת מוסד חדש'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: 'code', label: 'קוד מוסד *', disabled: editMode },
              { key: 'name', label: 'שם מוסד', disabled: false },
              { key: 'nihul_atsmi', label: 'ניהול עצמי', disabled: false },
              { key: 'hazana', label: 'הזנה', disabled: false },
              { key: 'krav', label: 'קרב', disabled: false },
              { key: 'sachar', label: 'שכר', disabled: false },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm text-[#636c76] mb-1">{field.label}</label>
                <input
                  type="text"
                  value={String(form[field.key as keyof MosadRecord] ?? '')}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [field.key]: e.target.value }))
                  }
                  disabled={field.disabled}
                  className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] disabled:opacity-50"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? 'שומר...' : editMode ? 'עדכן' : 'שמור'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(emptyForm); setEditMode(false); }}
              className="px-5 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f0f3f6] flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold text-[#1f2328]">מוסדות ({rows.length})</h2>
            <p className="text-xs text-[#636c76] mt-1">לחץ פעמיים על תא לעריכה מהירה</p>
          </div>
          <div className="relative" ref={colPanelRef}>
            <button
              onClick={() => setShowColPanel((o) => !o)}
              className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              ⚙️ ערוך תצוגת עמודות
            </button>
            {showColPanel && (
              <div className="absolute left-0 top-full mt-1 bg-white border border-[#d1d9e0] rounded-lg shadow-xl z-20 min-w-[180px]">
                <div className="px-3 py-2 border-b border-[#d1d9e0]">
                  <span className="text-xs text-[#636c76] font-medium">בחר עמודות להצגה</span>
                </div>
                {ALL_COLUMNS.map((col) => (
                  <label key={col.field} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f3f6] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(col.field)}
                      onChange={() => toggleColumn(col.field)}
                      className="accent-[#0969da]"
                    />
                    <span className="text-sm text-[#1f2328]">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-64 text-[#636c76]">טוען...</div>
        ) : (
          <div className="ag-theme-alpine" style={{ height: 550 }}>
            <AgGridReact<MosadRecord>
              theme="legacy"
              rowData={rows}
              columnDefs={colDefsWithActions}
              enableRtl={true}
              defaultColDef={{ sortable: true, resizable: true, filter: true }}
              pagination={true}
              paginationPageSize={25}
              onGridReady={(p) => setGridApi(p.api)}
              pinnedBottomRowData={mosdotSummaryRow}
              getRowStyle={(p) => p.node.rowPinned === 'bottom'
                ? { fontWeight: 'bold', background: '#f0f3f6', color: '#0969da' }
                : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
