'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exportToCsv } from '@/app/components/exportCsv';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef, GridApi } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Topic {
  code: string | number;
  name: string;
  table_type?: string;
}

interface QueryResult {
  ok: boolean;
  data: Record<string, Record<string, unknown>[]>;
}

const BASE_COLLECTIONS = [
  { key: 'CHESHBONIT', label: 'חשבוניות' },
  { key: 'MUCARIM', label: 'מוצרים' },
  { key: 'SHARATIM', label: 'שירותים' },
  { key: 'YADANIIM', label: 'ידניים' },
  { key: 'COMMANDS', label: 'פקודות' },
];

const BASE_KEYS = new Set(BASE_COLLECTIONS.map((c) => c.key));

const HEBREW_NAMES: Record<string, string> = {
  CHESHBONIT: 'חשבוניות', MUCARIM: 'מוצרים', SHARATIM: 'שירותים',
  YADANIIM: 'ידניים', COMMANDS: 'פקודות', noseme: 'נושאים', mosdot: 'מוסדות',
  runs: 'ריצות', run_logs: 'לוגים', run_results: 'תוצאות', run_hashvha: 'השוואות',
  GY: 'גן ילדים', HASAOT: 'הסעות', HASNET: 'השנת', HASMASLULIM: 'המסלולים',
  MISROT: 'משרות', MISROTGY: "משרות ג'י", MOADON: 'מועדון', MUTAVIM: 'מוטבים', SHEFI: 'שפי',
};

function numFmt(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function buildColDefs(data: Record<string, unknown>[]): ColDef[] {
  if (!data || data.length === 0) return [];
  return Object.keys(data[0]).map((k) => {
    const isNumeric = data.some((r) => typeof r[k] === 'number');
    return {
      field: k,
      headerName: k,
      flex: 1,
      minWidth: 100,
      filter: true,
      sortable: true,
      resizable: true,
      ...(isNumeric ? {
        type: 'numericColumn',
        valueFormatter: (p: { value: unknown }) => numFmt(p.value),
      } : {}),
    };
  });
}

function downloadExcel(data: Record<string, unknown>[], filename: string) {
  import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'נתונים');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  });
}

export default function ReportsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [activeTab, setActiveTab] = useState('CHESHBONIT');
  const [results, setResults] = useState<Record<string, Record<string, unknown>[]>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [showColPanel, setShowColPanel] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Extra collections
  const [availableCollections, setAvailableCollections] = useState<string[]>([]);
  const [extraCollections, setExtraCollections] = useState<Set<string>>(new Set());
  const [extraDropdownOpen, setExtraDropdownOpen] = useState(false);
  const extraDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/reports/topics')
      .then((r) => r.json())
      .then((d: { topics: Topic[] }) => setTopics(d.topics ?? []))
      .catch(() => {});
    // Fetch all available collections
    fetch('/api/dashboard/stats')
      .then((r) => r.json())
      .then((d: { collections?: { name: string }[] }) => {
        const extras = (d.collections ?? [])
          .map((c) => c.name)
          .filter((n) => !BASE_KEYS.has(n));
        setAvailableCollections(extras);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setShowColPanel(false);
      }
      if (extraDropdownRef.current && !extraDropdownRef.current.contains(e.target as Node)) {
        setExtraDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Default visible fields — all others start hidden
  const DEFAULT_VISIBLE_FIELDS = new Set([
    'קוד_נושא', 'חודש_חישוב', 'חודש_תחולה',
    'הפרש_מחושב', 'סכום_מחושב', 'תאור_נושא', 'יתרת_ביצוע_החודש',
  ]);

  const toggleColumn = useCallback((field: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }, []);

  const toggleExtraCollection = useCallback((key: string) => {
    setExtraCollections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // All tabs to show = base + selected extras
  const allCollections = useMemo(() => [
    ...BASE_COLLECTIONS,
    ...Array.from(extraCollections).map((key) => ({
      key,
      label: HEBREW_NAMES[key] ?? key,
    })),
  ], [extraCollections]);

  const filteredTopics = topics.filter(
    (t) =>
      !topicSearch ||
      String(t.code).includes(topicSearch) ||
      t.name?.toLowerCase().includes(topicSearch.toLowerCase())
  );

  const toggleTopic = useCallback((code: string) => {
    setSelectedTopics((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/reports/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: allCollections.map((c) => c.key),
          nose_codes: selectedTopics.length > 0 ? selectedTopics : undefined,
          from_month: fromMonth || undefined,
          to_month: toMonth || undefined,
          limit: 2000,
        }),
      });
      const data = await res.json() as QueryResult;
      if (data.ok) {
        setResults(data.data ?? {});
        // Set active tab to first collection that has results (or first base)
        const firstWithData = allCollections.find((c) => (data.data?.[c.key]?.length ?? 0) > 0);
        if (firstWithData) setActiveTab(firstWithData.key);
      } else {
        setErrorMsg('שגיאה בשאילתה');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת');
    } finally {
      setLoading(false);
    }
  }, [allCollections, selectedTopics, fromMonth, toMonth]);

  const currentData = results[activeTab] ?? [];
  const colDefs = useMemo(() => buildColDefs(currentData), [activeTab, results]);

  // When colDefs change (new results or tab switch), hide all non-default columns
  useEffect(() => {
    if (colDefs.length === 0) return;
    setHiddenCols(new Set(
      colDefs.map((c) => c.field as string).filter((f) => f && !DEFAULT_VISIBLE_FIELDS.has(f))
    ));
  }, [colDefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync column visibility with AG Grid after hiddenCols state updates (outside render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!gridApi) return;
    colDefs.forEach((col) => {
      const field = col.field as string;
      if (field) gridApi.setColumnsVisible([field], !hiddenCols.has(field));
    });
  }, [hiddenCols, gridApi, colDefs]);

  const reportsSummaryRow = useMemo(() => {
    if (currentData.length === 0) return [];
    const summary: Record<string, unknown> = {};
    let isFirst = true;
    for (const col of colDefs) {
      const field = col.field as string;
      if (!field) continue;
      if (isFirst) {
        summary[field] = `סה"כ: ${currentData.length.toLocaleString('he-IL')}`;
        isFirst = false;
      } else {
        const isNumeric = currentData.some((r) => typeof r[field] === 'number');
        summary[field] = isNumeric
          ? currentData.reduce((s, r) => s + (typeof r[field] === 'number' ? (r[field] as number) : 0), 0)
          : '';
      }
    }
    return [summary];
  }, [currentData, colDefs]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">דוחות</h1>
        <p className="text-[#636c76] text-sm">שאילתות וניתוח נתונים</p>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold text-[#1f2328] mb-4">סינון</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Topic multi-select */}
          <div>
            <label className="block text-sm text-[#636c76] mb-2">נושאים</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm text-right flex items-center justify-between"
              >
                <span>
                  {selectedTopics.length === 0
                    ? 'כל הנושאים'
                    : `${selectedTopics.length} נושאים נבחרו`}
                </span>
                <span className="mr-2">{dropdownOpen ? '▲' : '▼'}</span>
              </button>
              {dropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-[#d1d9e0] rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-[#d1d9e0]">
                    <input
                      type="text"
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      placeholder="חפש לפי קוד או שם נושא..."
                      className="w-full bg-[#f6f8fa] border border-[#d1d9e0] text-[#1f2328] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#0969da]"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {filteredTopics.map((topic) => {
                      const code = String(topic.code);
                      const checked = selectedTopics.includes(code);
                      return (
                        <label
                          key={code}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f3f6] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTopic(code)}
                            className="accent-[#0969da]"
                          />
                          <span className="text-xs font-mono text-[#0969da] w-12">{code}</span>
                          <span className="text-sm text-[#1f2328] truncate">{topic.name}</span>
                        </label>
                      );
                    })}
                    {filteredTopics.length === 0 && (
                      <div className="px-3 py-4 text-sm text-[#636c76] text-center">לא נמצאו נושאים</div>
                    )}
                  </div>
                  {selectedTopics.length > 0 && (
                    <div className="p-2 border-t border-[#d1d9e0]">
                      <button
                        onClick={() => setSelectedTopics([])}
                        className="text-xs text-[#cf222e] hover:text-[#ff7b7b]"
                      >
                        נקה בחירה
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* From month */}
          <div>
            <label className="block text-sm text-[#636c76] mb-2">מחודש</label>
            <input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
            />
          </div>

          {/* To month */}
          <div>
            <label className="block text-sm text-[#636c76] mb-2">עד חודש</label>
            <input
              type="month"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
            />
          </div>
        </div>

        {/* Extra collections row */}
        {availableCollections.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm text-[#636c76] mb-2">קולקשנים נוספים</label>
            <div className="relative" ref={extraDropdownRef}>
              <button
                type="button"
                onClick={() => setExtraDropdownOpen((o) => !o)}
                className="bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm flex items-center gap-2"
              >
                <span>
                  {extraCollections.size === 0
                    ? 'הוסף קולקשנים לדוח'
                    : `${extraCollections.size} קולקשנים נוספו`}
                </span>
                <span>{extraDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {extraDropdownOpen && (
                <div className="absolute z-10 mt-1 bg-white border border-[#d1d9e0] rounded-lg shadow-xl min-w-[220px] max-h-64 overflow-y-auto">
                  {availableCollections.map((key) => (
                    <label key={key} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f3f6] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extraCollections.has(key)}
                        onChange={() => toggleExtraCollection(key)}
                        className="accent-[#0969da]"
                      />
                      <span className="text-xs font-mono text-[#0969da] w-24 truncate">{key}</span>
                      <span className="text-sm text-[#1f2328]">{HEBREW_NAMES[key] ?? key}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {loading ? '⏳ מחפש...' : '🔍 חפש'}
          </button>
          <button
            onClick={() => {
              setSelectedTopics([]);
              setFromMonth('');
              setToMonth('');
              setResults({});
            }}
            className="px-5 py-2 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm font-medium rounded-lg transition-colors"
          >
            נקה
          </button>
        </div>

        {errorMsg && (
          <p className="mt-3 text-[#cf222e] text-sm">{errorMsg}</p>
        )}
      </div>

      {/* Results */}
      {Object.keys(results).length > 0 && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-[#d1d9e0] overflow-x-auto">
            {allCollections.map((col) => {
              const count = (results[col.key] ?? []).length;
              return (
                <button
                  key={col.key}
                  onClick={() => setActiveTab(col.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === col.key
                      ? 'text-[#0969da] border-b-2 border-[#0969da] bg-[#ddf4ff]'
                      : 'text-[#636c76] hover:text-[#1f2328] hover:bg-[#f0f3f6]'
                  }`}
                >
                  {col.label}
                  <span className={`mr-1.5 text-xs px-1.5 py-0.5 rounded-full ${count > 0 ? 'bg-[#f0f3f6] text-[#0969da]' : 'bg-[#f0f3f6] text-[#8c959f]'}`}>
                    {count.toLocaleString('he-IL')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Export + column toggle */}
          <div className="px-6 py-3 border-b border-[#d1d9e0] flex justify-between items-center">
            <span className="text-sm text-[#636c76]">
              {currentData.length.toLocaleString('he-IL')} רשומות
            </span>
            <div className="flex items-center gap-2">
              {/* Column visibility panel */}
              {colDefs.length > 0 && (
                <div className="relative" ref={colPanelRef}>
                  <button
                    onClick={() => setShowColPanel((o) => !o)}
                    className="px-3 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors flex items-center gap-2"
                  >
                    ⚙️ ערוך תצוגת עמודות
                  </button>
                  {showColPanel && (
                    <div className="absolute left-0 top-full mt-1 bg-white border border-[#d1d9e0] rounded-lg shadow-xl z-20 min-w-[180px] max-h-64 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-[#d1d9e0] sticky top-0 bg-white">
                        <span className="text-xs text-[#636c76] font-medium">בחר עמודות להצגה</span>
                      </div>
                      {colDefs.map((col) => {
                        const field = col.field ?? '';
                        return (
                          <label key={field} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f0f3f6] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!hiddenCols.has(field)}
                              onChange={() => toggleColumn(field)}
                              className="accent-[#0969da]"
                            />
                            <span className="text-sm text-[#1f2328] truncate">{String(col.headerName ?? field)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => exportToCsv(activeTab, colDefs.map((c) => ({ header: String(c.headerName ?? c.field ?? ''), field: c.field as string })), currentData)}
                disabled={currentData.length === 0}
                className="px-4 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                📤 יצוא CSV
              </button>
              <button
                onClick={() => downloadExcel(currentData, activeTab)}
                disabled={currentData.length === 0}
                className="px-4 py-1.5 bg-[#f0f3f6] hover:bg-[#e2e7ec] border border-[#d1d9e0] text-[#1f2328] text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                📥 ייצוא Excel
              </button>
            </div>
          </div>

          {currentData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-[#636c76]">
              אין נתונים להצגה
            </div>
          ) : (
            <div className="ag-theme-alpine" style={{ height: 500 }}>
              <AgGridReact
                theme="legacy"
                rowData={currentData}
                columnDefs={colDefs}
                enableRtl={true}
                defaultColDef={{ sortable: true, resizable: true, filter: true }}
                pagination={true}
                paginationPageSize={50}
                onGridReady={(p) => setGridApi(p.api)}
                pinnedBottomRowData={reportsSummaryRow}
                getRowStyle={(p) => p.node.rowPinned === 'bottom'
                  ? { fontWeight: 'bold', background: '#f0f3f6', color: '#0969da' }
                  : undefined}
              />
            </div>
          )}
        </div>
      )}

      {Object.keys(results).length === 0 && !loading && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl flex items-center justify-center h-48 text-[#636c76]">
          <div className="text-center">
            <p className="text-4xl mb-3">📈</p>
            <p>בחר פילטרים ולחץ על חפש</p>
          </div>
        </div>
      )}
    </div>
  );
}
