'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, ColDef } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import {
  useColumnAggTypes, withFooterCells, buildFooterRow, TableSummaryBar,
  footerRowStyle, footerRowHeight,
} from '@/app/components/tableSummary'
import { useColumnVisibility, ColumnPickerButton, RIKHUZ_DEFAULT_ALIAS_GROUPS } from '@/app/components/columnPicker'

ModuleRegistry.registerModules([AllCommunityModule])

// ─── Types ────────────────────────────────────────────────────────────────────

interface Topic { code: string; name: string }
interface Mosad { code: string; name?: string }

// ─── Collections ──────────────────────────────────────────────────────────────

const STD_COLLECTIONS = [
  { key: 'CHESHBONIT', label: 'חשבוניות' },
  { key: 'MUCARIM',    label: 'מוצרים' },
  { key: 'SHARATIM',   label: 'שירותים' },
  { key: 'YADANIIM',   label: 'ידניים' },
  { key: 'COMMANDS',   label: 'פקודות' },
]

// ─── Number formatter ─────────────────────────────────────────────────────────

function fmtNum(v: unknown): string {
  const n = Number(v)
  if (v == null || v === '' || isNaN(n)) return ''
  return n.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// ─── Column defs ──────────────────────────────────────────────────────────────

const COMMON_COLS: ColDef[] = [
  { field: 'חודש_חישוב', headerName: 'חודש חישוב', minWidth: 110 },
  { field: 'חודש_תחולה', headerName: 'חודש תחולה', minWidth: 110 },
  { field: 'קוד_נושא',   headerName: 'קוד נושא',   width: 100 },
  { field: 'תאור_נושא',  headerName: 'תאור נושא',  flex: 2, minWidth: 180 },
]

const COL_DEFS: Record<string, ColDef[]> = {
  CHESHBONIT: [
    ...COMMON_COLS,
    { field: 'סמל_מוסד',        headerName: 'סמל מוסד',        width: 100 },
    { field: 'שם_מוסד',         headerName: 'שם מוסד',         flex: 1, minWidth: 140 },
    { field: 'ביצוע_חודש_נוכחי', headerName: 'ביצוע חודש נוכחי', type: 'numericColumn', minWidth: 150,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'יתרת_ביצוע_החודש', headerName: 'יתרת ביצוע החודש', type: 'numericColumn', minWidth: 155,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
  ],
  MUCARIM: [
    ...COMMON_COLS,
    { field: 'סמל_מוסד',   headerName: 'סמל מוסד',   width: 100 },
    { field: 'כמות',       headerName: 'כמות',        type: 'numericColumn', minWidth: 90,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'מחיר_יחידה', headerName: 'מחיר יחידה',  type: 'numericColumn', minWidth: 120,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'הפרש_מחושב', headerName: 'הפרש מחושב',  type: 'numericColumn', minWidth: 130,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
  ],
  SHARATIM: [
    ...COMMON_COLS,
    { field: 'סמל_מוסד',   headerName: 'סמל מוסד',   width: 100 },
    { field: 'כמות',       headerName: 'כמות',        type: 'numericColumn', minWidth: 90,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'מחיר_יחידה', headerName: 'מחיר יחידה',  type: 'numericColumn', minWidth: 120,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'הפרש_מחושב', headerName: 'הפרש מחושב',  type: 'numericColumn', minWidth: 130,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
  ],
  YADANIIM: [
    ...COMMON_COLS,
    { field: 'סמל_מוסד', headerName: 'סמל מוסד', width: 100 },
    { field: 'סכום',     headerName: 'סכום',      type: 'numericColumn', minWidth: 120,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'הערה',     headerName: 'הערה',      flex: 1, minWidth: 140 },
  ],
  COMMANDS: [
    { field: 'תאריך_ערך', headerName: 'תאריך ערך', minWidth: 110 },
    { field: 'seif_hova', headerName: 'סעיף חובה', width: 110,
      valueFormatter: (p: { value: unknown }) => (p.value != null && p.value !== 0 && p.value !== '') ? String(p.value) : '' },
    { field: 'seif_zhut', headerName: 'סעיף זכות', width: 110,
      valueFormatter: (p: { value: unknown }) => (p.value != null && p.value !== 0 && p.value !== '') ? String(p.value) : '' },
    { field: 'תיאור',     headerName: 'תיאור',     flex: 2, minWidth: 200 },
    { field: 'קוד_נושא', headerName: 'קוד נושא',  width: 100 },
    { field: 'סמל_מוסד', headerName: 'סמל מוסד',  width: 100 },
    { field: 'סכום_חובה', headerName: 'חובה',      type: 'numericColumn', minWidth: 120,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
    { field: 'סכום_זכות', headerName: 'זכות',      type: 'numericColumn', minWidth: 120,
      valueFormatter: (p: { value: unknown }) => fmtNum(p.value) },
  ],
}

const DEFAULT_COL_DEF_LIST: ColDef[] = [
  ...COMMON_COLS,
  { field: 'סמל_מוסד', headerName: 'סמל מוסד', width: 100 },
]

// ─── Multi-select dropdown ────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string
  items: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  allLabel?: string
  searchPlaceholder?: string
}

function MultiSelect({ label, items, selected, onChange, placeholder, allLabel = 'הכל', searchPlaceholder = 'חפש...' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const allSelected = selected.length === items.length

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q ? items.filter(i => i.label.toLowerCase().includes(q) || i.value.toLowerCase().includes(q)) : items
  }, [items, search])

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  const buttonLabel = allSelected
    ? (allLabel === 'הכל' ? `כל ה${label}` : allLabel)
    : `${selected.length} נבחרו`

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs text-[#636c76] mb-1.5 font-medium">{label}</label>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-[#eaeef2] text-right"
      >
        <span className="truncate">{selected.length === 0 ? (placeholder ?? `בחר ${label}`) : buttonLabel}</span>
        <span className="text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 left-0 z-50 bg-white border border-[#d1d9e0] rounded-xl shadow-lg" style={{ minWidth: 220 }}>
          <div className="p-2 border-b border-[#d1d9e0]">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-xs px-2 py-1.5 border border-[#d1d9e0] rounded-lg focus:outline-none focus:border-[#0969da] bg-[#f0f3f6]"
            />
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-[#d1d9e0]">
            <button onClick={() => onChange(filtered.map(i => i.value))} className="text-[11px] text-[#0969da] hover:underline">
              {search ? 'בחר מסונן' : 'הכל'}
            </button>
            <span className="text-[#d1d9e0]">|</span>
            <button
              onClick={() => onChange(search ? selected.filter(v => !filtered.some(i => i.value === v)) : [])}
              className="text-[11px] text-[#636c76] hover:underline"
            >
              {search ? 'נקה מסונן' : 'נקה'}
            </button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {filtered.map(item => (
              <label key={item.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f0f3f6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(item.value)}
                  onChange={() => toggle(item.value)}
                  className="accent-[#0969da] shrink-0"
                />
                <span className="text-xs text-[#1f2328] truncate">{item.label}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-[#8c959f] text-center">לא נמצאו תוצאות</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RikhuzPage() {
  // Reference data
  const [topics,         setTopics]         = useState<Topic[]>([])
  const [mosdot,         setMosdot]         = useState<Mosad[]>([])
  const [allCollections, setAllCollections] = useState<string[]>([])

  // Filters
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [selectedMosdot, setSelectedMosdot] = useState<string[]>([])
  const [fromMonth,      setFromMonth]      = useState('')
  const [toMonth,        setToMonth]        = useState('')
  const [fromTachula,    setFromTachula]    = useState('')
  const [toTachula,      setToTachula]      = useState('')
  const [extraCols,      setExtraCols]      = useState<string[]>([])

  // UI / results
  const [extraOpen,     setExtraOpen]     = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [hasData,       setHasData]       = useState(false)
  const [activeTab,     setActiveTab]     = useState('CHESHBONIT')
  const [data,          setData]          = useState<Record<string, unknown[]>>({})
  const [filteredRows,  setFilteredRows]  = useState<Record<string, unknown>[]>([])

  const extraRef = useRef<HTMLDivElement>(null)

  // ── Load reference data ─────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/reports/topics')
      .then(r => r.json())
      .then(d => {
        const list: Topic[] = (d.topics ?? []).map((t: { code: string; name?: string }) => ({
          code: String(t.code),
          name: t.name ?? String(t.code),
        }))
        setTopics(list)
        setSelectedTopics(list.map(t => t.code))
      })
      .catch(() => {})

    fetch('/api/mosdot')
      .then(r => r.json())
      .then(d => {
        const list: Mosad[] = d.mosdot ?? []
        setMosdot(list)
        setSelectedMosdot(list.map((m: Mosad) => m.code))
      })
      .catch(() => {})

    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => {
        const cols: string[] = (d.collections ?? []).map((c: { name: string }) => c.name)
        const stdKeys = STD_COLLECTIONS.map(s => s.key)
        setAllCollections(cols.filter(c => !stdKeys.includes(c)))
      })
      .catch(() => {})
  }, [])

  // ── Close extra dropdown on outside click ───────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (extraRef.current && !extraRef.current.contains(e.target as Node)) setExtraOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const allTopicsSel = selectedTopics.length === topics.length
    const allMosdotSel = selectedMosdot.length === mosdot.length
    const allCols = [...STD_COLLECTIONS.map(s => s.key), ...extraCols]
    setLoading(true)
    try {
      const res = await fetch('/api/reports/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections:  allCols,
          nose_codes:   allTopicsSel ? undefined : selectedTopics,
          from_month:   fromMonth   || undefined,
          to_month:     toMonth     || undefined,
          from_tachula: fromTachula || undefined,
          to_tachula:   toTachula   || undefined,
          mosad_codes:  allMosdotSel ? undefined : selectedMosdot,
        }),
      })
      const d = await res.json()
      if (d.ok) {
        setData(d.data ?? {})
        setHasData(true)
        const firstWithData = allCols.find(c => (d.data?.[c]?.length ?? 0) > 0)
        const tab = firstWithData ?? 'CHESHBONIT'
        setActiveTab(tab)
        setFilteredRows((d.data?.[tab] ?? []) as Record<string, unknown>[])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [selectedTopics, topics.length, selectedMosdot, mosdot.length, fromMonth, toMonth, fromTachula, toTachula, extraCols])

  const handleReset = () => {
    setSelectedTopics(topics.map(t => t.code))
    setSelectedMosdot(mosdot.map(m => m.code))
    setFromMonth(''); setToMonth('')
    setFromTachula(''); setToTachula('')
    setExtraCols([])
    setData({}); setHasData(false)
    setActiveTab('CHESHBONIT'); setFilteredRows([])
  }

  // ── Tab switch ─────────────────────────────────────────────────────────────

  const switchTab = (tab: string) => {
    setActiveTab(tab)
    setFilteredRows((data[tab] ?? []) as Record<string, unknown>[])
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  const allTabs = useMemo(() =>
    [...STD_COLLECTIONS, ...extraCols.map(k => ({ key: k, label: k }))],
  [extraCols])

  const activeRows = useMemo(() =>
    (data[activeTab] ?? []) as Record<string, unknown>[],
  [data, activeTab])

  const exportExcel = useCallback(async () => {
    const xlsx = await import('xlsx')
    const wb = xlsx.utils.book_new()
    for (const tab of allTabs) {
      const rows = data[tab.key] ?? []
      if (rows.length === 0) continue
      const ws = xlsx.utils.json_to_sheet(rows as Record<string, unknown>[])
      xlsx.utils.book_append_sheet(wb, ws, tab.label.slice(0, 31))
    }
    xlsx.writeFile(wb, 'דוח_ריכוז.xlsx')
  }, [data, allTabs])

  const exportCsv = useCallback(() => {
    if (activeRows.length === 0) return
    const headers = Object.keys(activeRows[0])
    const csv = [
      headers.join(','),
      ...activeRows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${activeTab}.csv`; a.click()
    URL.revokeObjectURL(url)
  }, [activeRows, activeTab])

  // ── Totals ─────────────────────────────────────────────────────────────────

  const colDefs = useMemo((): ColDef[] => {
    if (activeRows.length === 0) return COL_DEFS[activeTab] ?? DEFAULT_COL_DEF_LIST
    // Build a lookup of formatting hints from the preset defs
    const defLookup = new Map<string, ColDef>()
    for (const d of [...(COL_DEFS[activeTab] ?? []), ...DEFAULT_COL_DEF_LIST]) {
      if (d.field) defLookup.set(d.field, d)
    }
    // Columns derived entirely from what the data actually contains
    return Object.keys(activeRows[0]).map(f =>
      defLookup.get(f) ?? { field: f, headerName: f, minWidth: 110 }
    )
  }, [activeTab, activeRows])

  const footerFields = useMemo(
    () => colDefs.map(c => c.field).filter((f): f is string => !!f),
    [colDefs]
  )

  const { getAggType, setAggType } = useColumnAggTypes(activeRows)

  const colDefsWithFooter = useMemo(
    () => withFooterCells(colDefs, activeRows, getAggType, setAggType),
    [colDefs, activeRows, getAggType, setAggType]
  )

  const { visible: visibleFields, toggle: toggleColumn, showAll: showAllColumns, resetToDefault: resetColumns } =
    useColumnVisibility(footerFields, RIKHUZ_DEFAULT_ALIAS_GROUPS)

  const displayedColDefs = useMemo(
    () => colDefsWithFooter.filter(c => !c.field || visibleFields.has(c.field as string)),
    [colDefsWithFooter, visibleFields]
  )

  // Pinned bottom row — per-column aggregation of the currently filtered rows
  const pinnedBottomRow = useMemo(
    () => buildFooterRow(filteredRows, footerFields, getAggType),
    [filteredRows, footerFields, getAggType]
  )

  const summaryColumns = useMemo(
    () => colDefs
      .filter((c): c is ColDef & { field: string } => !!c.field)
      .map(c => ({ field: c.field, headerName: c.headerName })),
    [colDefs]
  )

  const onFilterChanged = useCallback((p: { api: { forEachNodeAfterFilter: (cb: (n: { data?: unknown }) => void) => void } }) => {
    const rows: Record<string, unknown>[] = []
    p.api.forEachNodeAfterFilter(node => { if (node.data) rows.push(node.data as Record<string, unknown>) })
    setFilteredRows(rows)
  }, [])

  // ── Dropdown items ─────────────────────────────────────────────────────────

  const topicItems = useMemo(() =>
    topics.map(t => ({ value: t.code, label: t.name ? `${t.code} — ${t.name}` : t.code })),
  [topics])

  const mosadItems = useMemo(() =>
    mosdot.map(m => ({ value: m.code, label: m.name ? `${m.code} — ${m.name}` : m.code })),
  [mosdot])

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputCls = 'w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]'

  return (
    <div dir="rtl" className="flex flex-col gap-4 p-4 bg-[#f6f8fa] min-h-screen">

      {/* Header */}
      <h1 className="text-xl font-bold text-[#1f2328]">סינון</h1>

      {/* Filter panel */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl p-5 flex flex-col gap-4">

        {/* Row 1: נושאים + חודשי חישוב */}
        <div className="grid grid-cols-3 gap-4 items-end">
          <MultiSelect
            label="נושאים"
            items={topicItems}
            selected={selectedTopics}
            onChange={setSelectedTopics}
            searchPlaceholder="חפש נושא..."
          />
          <div>
            <label className="block text-xs text-[#636c76] mb-1.5 font-medium">מחודש</label>
            <input type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#636c76] mb-1.5 font-medium">עד חודש</label>
            <input type="month" value={toMonth} onChange={e => setToMonth(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Row 2: מוסדות + חודשי תחולה */}
        <div className="grid grid-cols-3 gap-4 items-end">
          <MultiSelect
            label="מוסדות"
            items={mosadItems}
            selected={selectedMosdot}
            onChange={setSelectedMosdot}
            searchPlaceholder="חפש מוסד..."
          />
          <div>
            <label className="block text-xs text-[#636c76] mb-1.5 font-medium">מחודש תחולה</label>
            <input type="month" value={fromTachula} onChange={e => setFromTachula(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-[#636c76] mb-1.5 font-medium">עד חודש תחולה</label>
            <input type="month" value={toTachula} onChange={e => setToTachula(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Row 3: קולקשנים נוספים */}
        {allCollections.length > 0 && (
          <div className="relative" ref={extraRef}>
            <label className="block text-xs text-[#636c76] mb-1.5 font-medium">קולקשנים נוספים</label>
            <button
              onClick={() => setExtraOpen(o => !o)}
              className="bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#eaeef2] min-w-[220px]"
            >
              <span>{extraCols.length > 0 ? `${extraCols.length} קולקשנים נוספים` : 'הוסף קולקשנים לדוח'}</span>
              <span className="text-[10px]">{extraOpen ? '▲' : '▼'}</span>
            </button>
            {extraOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 bg-white border border-[#d1d9e0] rounded-xl shadow-lg min-w-[220px]">
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {allCollections.map(col => (
                    <label key={col} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f0f3f6] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={extraCols.includes(col)}
                        onChange={() => setExtraCols(p => p.includes(col) ? p.filter(c => c !== col) : [...p, col])}
                        className="accent-[#0969da]"
                      />
                      <span className="text-xs text-[#1f2328] font-mono">{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 bg-[#1a7f37] hover:bg-[#116329] text-white text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-60 transition-colors"
          >
            {hasData && !loading && <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />}
            {loading ? '⏳ טוען...' : '🔍 חפש'}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-[#d1d9e0] bg-white text-[#1f2328] text-sm rounded-lg hover:bg-[#f0f3f6] transition-colors"
          >
            אפס
          </button>
          {hasData && !loading && (
            <span className="text-xs text-[#636c76]">
              {allTabs.reduce((s, t) => s + (data[t.key]?.length ?? 0), 0).toLocaleString()} רשומות בסה&quot;כ
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {hasData && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-[#d1d9e0] overflow-x-auto">
            {allTabs.map(tab => {
              const count = data[tab.key]?.length ?? 0
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => switchTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'text-[#0969da] border-b-2 border-[#0969da] bg-[#ddf4ff]'
                      : 'text-[#636c76] hover:text-[#1f2328] hover:bg-[#f0f3f6]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    active ? 'bg-[#0969da] text-white' : 'bg-[#eaeef2] text-[#636c76]'
                  }`}>{count.toLocaleString()}</span>
                </button>
              )
            })}
          </div>

          {/* Grand total bar */}
          <TableSummaryBar rows={activeRows} columns={summaryColumns} />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#d1d9e0] bg-[#f6f8fa]">
            <span className="text-xs text-[#636c76]">
              מוצגות {filteredRows.length.toLocaleString()} מתוך {activeRows.length.toLocaleString()} רשומות
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCsv}
                disabled={activeRows.length === 0}
                className="px-3 py-1.5 text-xs border border-[#d1d9e0] bg-white rounded-lg hover:bg-[#f0f3f6] disabled:opacity-50 flex items-center gap-1 transition-colors"
              >
                📤 יצוא CSV
              </button>
              <button
                onClick={exportExcel}
                disabled={!hasData}
                className="px-3 py-1.5 text-xs border border-[#d1d9e0] bg-white rounded-lg hover:bg-[#f0f3f6] disabled:opacity-50 flex items-center gap-1 transition-colors"
              >
                📊 יצוא Excel
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

          {/* Grid */}
          <div className="ag-theme-alpine" style={{ height: 520 }}>
            <AgGridReact
              key={activeTab}
              rowData={activeRows}
              columnDefs={displayedColDefs}
              pinnedBottomRowData={pinnedBottomRow}
              enableRtl
              theme="legacy"
              defaultColDef={{ sortable: true, resizable: true, filter: true }}
              onFilterChanged={onFilterChanged}
              onGridReady={p => {
                p.api.sizeColumnsToFit()
                setFilteredRows(activeRows)
              }}
              onGridSizeChanged={p => p.api.sizeColumnsToFit()}
              getRowStyle={footerRowStyle}
              getRowHeight={footerRowHeight}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasData && !loading && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl flex flex-col items-center justify-center py-16 text-[#636c76]">
          <div className="text-5xl mb-3 opacity-30">📋</div>
          <div className="text-base font-medium">הגדר פילטרים ולחץ חפש</div>
          <div className="text-sm mt-1 text-[#8c959f]">הדוח יציג נתונים מכל קולקשני הדוח</div>
        </div>
      )}
    </div>
  )
}
