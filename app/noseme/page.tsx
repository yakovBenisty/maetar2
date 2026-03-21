'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImportInfoButton from '@/app/components/ImportInfoButton';
import { exportToCsv } from '@/app/components/exportCsv';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface NosemeRecord {
  code: string;
  name: string;
  table_type: 'שונות' | 'מוסדות' | '';
  direction: 'חובה' | 'זכות' | '';
  seif: string;
  mosad_col_name: string;
  seif_zhut: string;
  seif_hova: string;
  updated_at?: string;
}

const emptyForm: NosemeRecord = {
  code: '',
  name: '',
  table_type: '',
  direction: '',
  seif: '',
  mosad_col_name: '',
  seif_zhut: '',
  seif_hova: '',
};

const columnDefs: ColDef<NosemeRecord>[] = [
  { field: 'code', headerName: 'קוד', width: 100, filter: true },
  { field: 'name', headerName: 'שם נושא', flex: 2, minWidth: 150, filter: true },
  {
    field: 'table_type',
    headerName: 'סוג טבלה',
    width: 130,
    cellRenderer: (p: { value: string }) => {
      const color = p.value === 'שונות' ? '#0969da' : p.value === 'מוסדות' ? '#1a7f37' : '#636c76';
      return <span style={{ color, fontWeight: 500 }}>{p.value ?? ''}</span>;
    },
  },
  {
    field: 'direction',
    headerName: 'כיוון',
    width: 100,
    cellRenderer: (p: { value: string }) => {
      const color = p.value === 'חובה' ? '#cf222e' : p.value === 'זכות' ? '#1a7f37' : '#636c76';
      return <span style={{ color, fontWeight: 500 }}>{p.value ?? ''}</span>;
    },
  },
  { field: 'seif', headerName: 'סעיף (שונות)', flex: 1, minWidth: 120, filter: true },
  { field: 'mosad_col_name', headerName: 'שדה מוסד', flex: 1, minWidth: 120, filter: true },
];

export default function NosemePage() {
  const [rows, setRows] = useState<NosemeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<NosemeRecord>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [gridApi, setGridApi] = useState<GridApi<NosemeRecord> | null>(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const colPanelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const ALL_COLUMNS = [
    { field: 'code', label: 'קוד' },
    { field: 'name', label: 'שם נושא' },
    { field: 'table_type', label: 'סוג טבלה' },
    { field: 'direction', label: 'כיוון' },
    { field: 'seif', label: 'סעיף (שונות)' },
    { field: 'mosad_col_name', label: 'שדה מוסד' },
  ];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/noseme');
      const data = await res.json() as { noseme: NosemeRecord[] };
      setRows(data.noseme ?? []);
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
      setErrorMsg('קוד נושא הוא שדה חובה');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/noseme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setSuccessMsg(editMode ? 'נושא עודכן בהצלחה' : 'נושא נוסף בהצלחה');
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
    if (!confirm(`האם למחוק את נושא ${code}?`)) return;
    setErrorMsg('');
    try {
      const res = await fetch(`/api/noseme?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setSuccessMsg('נושא נמחק בהצלחה');
        await loadData();
      } else {
        setErrorMsg(data.error ?? 'שגיאה במחיקה');
      }
    } catch {
      setErrorMsg('שגיאת רשת');
    }
  }, [loadData]);

  const handleEdit = useCallback((row: NosemeRecord) => {
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

    // נרמול מפתחות — מסיר תווים נסתרים (BOM, RTL mark) ומרווחים עודפים
    const normalize = (s: string) =>
      s.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '').trim();

    const normalizedData = data.map((row) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) clean[normalize(k)] = v;
      return clean;
    });

    // lookup גמיש לפי שמות חלופיים (אחרי נרמול)
    const getField = (row: Record<string, unknown>, aliases: string[]): unknown => {
      for (const alias of aliases) {
        const v = row[normalize(alias)];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };

    const FIELD_ALIASES: Array<[keyof NosemeRecord, string[]]> = [
      ['name',          ['name', 'נושא', 'שם', 'שם נושא']],
      ['table_type',    ['table_type', 'איתור סעיף', 'סוג_טבלה', 'סוג טבלה']],
      ['direction',     ['direction', 'כיוון']],
      ['seif',          ['seif', 'סעיף']],
      ['mosad_col_name',['mosad_col_name', 'שם נושא במוסדות', 'שדה_מוסד', 'שדה מוסד']],
      ['seif_zhut',     ['seif_zhut', 'סעיף_זכות', 'סעיף זכות']],
      ['seif_hova',     ['seif_hova', 'סעיף_חובה', 'סעיף חובה']],
    ];

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of normalizedData) {
      const rawCode = getField(row, ['code', 'קוד נושא', 'קוד']);
      const code = rawCode != null ? String(rawCode).trim() : '';
      if (!code || code === '0') { skipped++; continue; }

      // רק שדות עם ערך ישלחו — לא מחליפים ערכים קיימים בריק
      const record: Record<string, string> = { code };
      for (const [key, aliases] of FIELD_ALIASES) {
        const val = getField(row, aliases);
        const str = String(val ?? '').trim();
        if (str !== '') record[key] = str;
      }

      try {
        const res = await fetch('/api/noseme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (res.ok) imported++;
        else failed++;
      } catch {
        failed++;
      }
    }

    const parts = [`יובאו ${imported} רשומות`];
    if (skipped > 0) parts.push(`${skipped} דולגו (ללא קוד)`);
    if (failed > 0) parts.push(`${failed} נכשלו`);
    setSuccessMsg(parts.join(' | '));
    await loadData();
    e.target.value = '';
  }, [loadData]);

  const nosemeSummaryRow = useMemo<NosemeRecord[]>(() => [{
    code: `סה"כ: ${rows.length} רשומות`,
    name: '', table_type: '', direction: '', seif: '', mosad_col_name: '', seif_zhut: '', seif_hova: '',
  }], [rows]);

  const colDefsWithActions: ColDef<NosemeRecord>[] = [
    ...columnDefs,
    {
      headerName: 'פעולות',
      width: 140,
      pinned: 'left' as const,
      cellRenderer: (p: { data: NosemeRecord }) => {
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
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">ניהול נושאים</h1>
        <p className="text-[#636c76] text-sm">נושאי תשלום (noseme)</p>
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
          + הוסף נושא
        </button>

        <div className="flex items-center gap-1">
          <label className="px-4 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-2">
            📥 ייבוא מ-Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="hidden" />
          </label>
          <ImportInfoButton
            title="דרישות ייבוא — נושאים"
            columns={[
              { name: 'קוד נושא', aliases: ['code', 'קוד'], required: true },
              { name: 'נושא', aliases: ['name', 'שם', 'שם נושא'] },
              { name: 'איתור סעיף', aliases: ['table_type', 'סוג טבלה'], note: 'ערכים: שונות / מוסדות' },
              { name: 'כיוון', aliases: ['direction'], note: 'ערכים: חובה / זכות' },
              { name: 'סעיף', aliases: ['seif'], note: 'לנושאי שונות — קוד הסעיף הישיר' },
              { name: 'שם נושא במוסדות', aliases: ['mosad_col_name', 'שדה מוסד'], note: 'לנושאי מוסדות — שם השדה ב-MOSDOT' },
              { name: 'סעיף חובה', aliases: ['seif_hova'] },
              { name: 'סעיף זכות', aliases: ['seif_zhut'] },
            ]}
            extra="שדות ריקים לא מחליפים נתונים קיימים — ניתן לייבא עדכון חלקי."
          />
        </div>

        <button
          onClick={() => exportToCsv('noseme', [
            { header: 'קוד', field: 'code' },
            { header: 'שם נושא', field: 'name' },
            { header: 'סוג טבלה', field: 'table_type' },
            { header: 'כיוון', field: 'direction' },
            { header: 'סעיף (שונות)', field: 'seif' },
            { header: 'שדה מוסד', field: 'mosad_col_name' },
            { header: 'סעיף חובה', field: 'seif_hova' },
            { header: 'סעיף זכות', field: 'seif_zhut' },
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
            {editMode ? 'עריכת נושא' : 'הוספת נושא חדש'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[#636c76] mb-1">קוד נושא *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={editMode}
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm text-[#636c76] mb-1">שם נושא</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#636c76] mb-1">סוג טבלה</label>
              <select
                value={form.table_type}
                onChange={(e) => setForm((f) => ({ ...f, table_type: e.target.value as NosemeRecord['table_type'] }))}
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
              >
                <option value="">-- בחר סוג --</option>
                <option value="שונות">שונות</option>
                <option value="מוסדות">מוסדות</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#636c76] mb-1">כיוון</label>
              <select
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as NosemeRecord['direction'] }))}
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
              >
                <option value="">-- בחר כיוון --</option>
                <option value="חובה">חובה</option>
                <option value="זכות">זכות</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#636c76] mb-1">סעיף (לנושאי שונות)</label>
              <input
                type="text"
                value={form.seif}
                onChange={(e) => setForm((f) => ({ ...f, seif: e.target.value }))}
                placeholder="קוד סעיף ישיר"
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
              />
            </div>
            <div>
              <label className="block text-sm text-[#636c76] mb-1">שדה מוסד (לנושאי מוסדות)</label>
              <input
                type="text"
                value={form.mosad_col_name}
                onChange={(e) => setForm((f) => ({ ...f, mosad_col_name: e.target.value }))}
                placeholder="שם שדה ב-MOSDOT (כגון nihul_atsmi)"
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
              />
            </div>
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
          <h2 className="text-base font-semibold text-[#1f2328]">
            נושאים ({rows.length})
          </h2>
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
            <AgGridReact<NosemeRecord>
              theme="legacy"
              rowData={rows}
              columnDefs={colDefsWithActions}
              enableRtl={true}
              defaultColDef={{ sortable: true, resizable: true, filter: true }}
              pagination={true}
              paginationPageSize={25}
              onGridReady={(p) => setGridApi(p.api)}
              pinnedBottomRowData={nosemeSummaryRow}
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
