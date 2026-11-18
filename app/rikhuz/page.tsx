'use client'

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AgGridReact } from 'ag-grid-react'
import { defaultColDefWithFilter } from '@/app/components/gridDefaults'
import { ModuleRegistry, AllCommunityModule, ColDef } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import {
  useColumnAggTypes, withFooterCells, buildFooterRow, TableSummaryBar,
  footerRowStyle, footerRowHeight,
} from '@/app/components/tableSummary'
import MultiSelect from '@/app/components/MultiSelect'
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

interface SavedSearch {
  _id: string
  name: string
  filters: {
    topics: string[] | null
    mosdot: string[] | null
    fromMonth: string
    toMonth: string
    fromTachula: string
    toTachula: string
    extraCols: string[]
  }
}

interface SearchInfo {
  at: Date
  total: number
  filters: string[]
  mosadFiltered: boolean
  otherInstitutions?: Record<string, { rows: number; institutions: number; examples: string[] }>
  available?: Record<string, { from: string; to: string } | null>
  errors?: Record<string, string>
}

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
  const [searchError,   setSearchError]   = useState('')
  const [lastSearch,    setLastSearch]    = useState<SearchInfo | null>(null)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [savedId,       setSavedId]       = useState('')
  const [savedMsg,      setSavedMsg]      = useState('')
  const [lastQuery,     setLastQuery]     = useState<Record<string, unknown> | null>(null)
  const router = useRouter()
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

  // ── Saved searches ──────────────────────────────────────────────────────────

  const loadSaved = useCallback(async (selectId?: string) => {
    try {
      const res = await fetch('/api/reports/saved-searches', { cache: 'no-store' })
      const d = await res.json()
      setSavedSearches(d.searches ?? [])
      if (selectId !== undefined) setSavedId(selectId)
    } catch { /* הרשימה פשוט תישאר ריקה */ }
  }, [])

  useEffect(() => { loadSaved() }, [loadSaved])

  // בחירת חיפוש שמור ממלאת את כל שדות החיפוש; לא מריצה — אפשר לשנות (למשל מוסד אחר) וללחוץ "חפש".
  const applySaved = (id: string) => {
    setSavedId(id)
    setSavedMsg('')
    const s = savedSearches.find(x => x._id === id)
    if (!s) return
    const topicCodes = new Set(topics.map(t => t.code))
    const mosadCodes = new Set(mosdot.map(m => m.code))
    const f = s.filters
    setSelectedTopics(f.topics === null ? topics.map(t => t.code) : f.topics.filter(c => topicCodes.has(c)))
    setSelectedMosdot(f.mosdot === null ? mosdot.map(m => m.code) : f.mosdot.filter(c => mosadCodes.has(c)))
    setFromMonth(f.fromMonth); setToMonth(f.toMonth)
    setFromTachula(f.fromTachula); setToTachula(f.toTachula)
    setExtraCols(f.extraCols.filter(c => allCollections.includes(c)))
  }

  const saveCurrent = async () => {
    const current = savedSearches.find(s => s._id === savedId)
    const name = window.prompt('שם לחיפוש (שם קיים יעודכן):', current?.name ?? '')?.trim()
    if (!name) return
    setSavedMsg('')
    try {
      const res = await fetch('/api/reports/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          filters: {
            topics: selectedTopics.length === topics.length ? null : selectedTopics,
            mosdot: selectedMosdot.length === mosdot.length ? null : selectedMosdot,
            fromMonth, toMonth, fromTachula, toTachula, extraCols,
          },
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? `שגיאת שרת (${res.status})`)
      await loadSaved(d.id ?? '')
      setSavedMsg(`החיפוש "${name}" נשמר`)
    } catch (e) {
      setSavedMsg(`השמירה נכשלה: ${e instanceof Error ? e.message : 'שגיאה'}`)
    }
  }

  const deleteSaved = async () => {
    const current = savedSearches.find(s => s._id === savedId)
    if (!current || !window.confirm(`למחוק את החיפוש השמור "${current.name}"?`)) return
    try {
      await fetch(`/api/reports/saved-searches?id=${encodeURIComponent(current._id)}`, { method: 'DELETE' })
      await loadSaved('')
      setSavedMsg(`החיפוש "${current.name}" נמחק`)
    } catch {
      setSavedMsg('המחיקה נכשלה')
    }
  }

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
    const filters: string[] = []
    if (!allTopicsSel) filters.push(`${selectedTopics.length} נושאים`)
    if (!allMosdotSel) filters.push(`${selectedMosdot.length} מוסדות`)
    if (fromMonth || toMonth) filters.push(`חודש חישוב ${fromMonth || '…'} עד ${toMonth || '…'}`)
    if (fromTachula || toTachula) filters.push(`חודש תחולה ${fromTachula || '…'} עד ${toTachula || '…'}`)

    // כל לחיצה מריצה שאילתה חדשה ומוחקת את התוצאות הקודמות מיד — כך ברור שהחיפוש רץ
    // מחדש, גם כשהתוצאה זהה, ואין צורך ב"אפס" בין חיפוש לחיפוש.
    setLoading(true)
    setSearchError('')
    setData({}); setFilteredRows([]); setHasData(false); setLastSearch(null); setLastQuery(null)
    try {
      const filterBody = {
        nose_codes:   allTopicsSel ? undefined : selectedTopics,
        from_month:   fromMonth   || undefined,
        to_month:     toMonth     || undefined,
        from_tachula: fromTachula || undefined,
        to_tachula:   toTachula   || undefined,
        mosad_codes:  allMosdotSel ? undefined : selectedMosdot,
      }
      const res = await fetch('/api/reports/query', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collections: allCols, ...filterBody }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? `שגיאת שרת (${res.status})`)

      setData(d.data ?? {})
      setHasData(true)
      const firstWithData = allCols.find(c => (d.data?.[c]?.length ?? 0) > 0)
      const tab = firstWithData ?? 'CHESHBONIT'
      setActiveTab(tab)
      setFilteredRows((d.data?.[tab] ?? []) as Record<string, unknown>[])
      setLastQuery(filterBody)
      setLastSearch({ at: new Date(), total: d.meta?.total ?? 0, filters, mosadFiltered: !allMosdotSel, otherInstitutions: d.meta?.otherInstitutions, available: d.meta?.available, errors: d.meta?.errors })
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'שגיאה בביצוע החיפוש')
    } finally {
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
    setSearchError(''); setLastSearch(null)
    setSavedId(''); setSavedMsg('')
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

  // מעביר לפיווט את תיאור החיפוש (לא את השורות) — הפיווט מריץ אותו בעצמו. הלשונית הפעילה נפתחת ראשונה.
  const sendToPivot = () => {
    if (!lastQuery) return
    const withData = allTabs
      .filter(t => (data[t.key]?.length ?? 0) > 0)
      .map(t => ({ collection: t.key, label: t.label }))
      .sort((a, b) => Number(b.collection === activeTab) - Number(a.collection === activeTab))
    if (withData.length === 0) return
    try {
      sessionStorage.setItem('pivot_handoff', JSON.stringify({ v: 1, query: lastQuery, tabs: withData }))
    } catch {
      window.alert('לא ניתן להעביר לפיווט (אחסון הדפדפן חסום).')
      return
    }
    router.push('/reports')
  }

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
    startTransition(() => setFilteredRows(rows))
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

        {/* חיפושים שמורים */}
        <div className="flex items-center gap-2 flex-wrap pb-4 border-b border-[#eaeef2]">
          <label className="text-xs text-[#636c76] font-medium">חיפוש שמור</label>
          <select
            value={savedId}
            onChange={e => applySaved(e.target.value)}
            className="bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-1.5 text-sm min-w-[200px] focus:outline-none focus:border-[#0969da]"
          >
            <option value="">{savedSearches.length ? 'בחר חיפוש שמור…' : 'אין חיפושים שמורים'}</option>
            {savedSearches.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <button
            onClick={saveCurrent}
            className="px-3 py-1.5 border border-[#d1d9e0] bg-white text-[#1f2328] text-sm rounded-lg hover:bg-[#f0f3f6] transition-colors"
          >
            💾 שמור את החיפוש הנוכחי
          </button>
          {savedId && (
            <button
              onClick={deleteSaved}
              className="px-3 py-1.5 border border-[#d1d9e0] bg-white text-[#cf222e] text-sm rounded-lg hover:bg-[#fff0f0] transition-colors"
            >
              🗑 מחק
            </button>
          )}
          {savedMsg && <span className="text-xs text-[#636c76]">{savedMsg}</span>}
        </div>

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
            {loading ? '⏳ טוען...' : hasData ? '🔍 חפש שוב' : '🔍 חפש'}
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
              {lastSearch && ` · הושלם ${lastSearch.at.toLocaleTimeString('he-IL')}`}
            </span>
          )}
        </div>
      </div>

      {searchError && (
        <div className="p-3 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-sm text-[#cf222e]">
          החיפוש נכשל: {searchError}
        </div>
      )}

      {lastSearch?.errors && (
        <div className="p-3 bg-[#fff8c5] border border-[#9a6700] rounded-lg text-sm text-[#9a6700]">
          השאילתה נכשלה בקולקשנים הבאים, ולכן הם מוצגים ריקים:{' '}
          {Object.entries(lastSearch.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}
        </div>
      )}

      {loading && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl py-12 text-center text-sm text-[#636c76]">
          ⏳ מריץ שאילתה חדשה...
        </div>
      )}

      {hasData && !loading && lastSearch && lastSearch.total === 0 && (
        <div className="p-4 bg-[#fff8c5] border border-[#9a6700] rounded-xl text-sm text-[#9a6700] flex flex-col gap-1.5">
          <div className="font-medium">לא נמצאו רשומות עבור הסינון שנבחר.</div>
          {lastSearch.filters.length > 0 && <div>הסינון שהופעל: {lastSearch.filters.join(' · ')}</div>}
          {lastSearch.available && (
            <div>
              חודשי חישוב שקיימים בנתונים:{' '}
              {Object.entries(lastSearch.available)
                .map(([k, v]) => `${allTabs.find(t => t.key === k)?.label ?? k}: ${v ? `${v.from}–${v.to}` : 'ללא תאריך'}`)
                .join(' · ')}
            </div>
          )}
          <div>אפשר לשנות את הסינון וללחוץ &quot;חפש שוב&quot; — אין צורך ב&quot;אפס&quot;.</div>
        </div>
      )}

      {hasData && !loading && lastSearch?.mosadFiltered && (
        <div className="px-4 py-2 bg-[#ddf4ff] border border-[#54aeff] rounded-lg text-xs text-[#0550ae] flex flex-col gap-1">
          <div>
            הסינון לפי מוסד חל על הקבצים שמפרטים מוסד (מוצרים, שירותים וכו׳). חשבוניות וידניים ללא מוסד מוצגים במלואם — החשבוניות מרכזות את כל המוסדות יחד.
          </div>
          {lastSearch.otherInstitutions && Object.entries(lastSearch.otherInstitutions).map(([k, v]) => (
            <div key={k} className="font-medium">
              {allTabs.find(t => t.key === k)?.label ?? k}: אין שורות למוסדות שנבחרו, אבל יש {v.rows.toLocaleString()} שורות ל-{v.institutions} מוסדות אחרים
              {v.examples.length > 0 && ` (למשל: ${v.examples.join(', ')})`}.
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {hasData && !loading && (
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
              <button
                onClick={sendToPivot}
                disabled={!lastQuery || allTabs.every(t => (data[t.key]?.length ?? 0) === 0)}
                className="px-3 py-1.5 text-xs bg-[#0969da] text-white rounded-lg hover:bg-[#0860ca] disabled:opacity-50 flex items-center gap-1 transition-colors"
              >
                📈 העבר לדוח פיווט
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
              defaultColDef={defaultColDefWithFilter}
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
      {!hasData && !loading && !searchError && (
        <div className="bg-white border border-[#d1d9e0] rounded-xl flex flex-col items-center justify-center py-16 text-[#636c76]">
          <div className="text-5xl mb-3 opacity-30">📋</div>
          <div className="text-base font-medium">הגדר פילטרים ולחץ חפש</div>
          <div className="text-sm mt-1 text-[#8c959f]">הדוח יציג נתונים מכל קולקשני הדוח</div>
        </div>
      )}
    </div>
  )
}
