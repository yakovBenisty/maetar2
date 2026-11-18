'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ModuleRegistry,
  AllCommunityModule,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import MultiSelect from '@/app/components/MultiSelect'

ModuleRegistry.registerModules([AllCommunityModule])

// ─── Types ───────────────────────────────────────────────────────────────────

type AggFunc = 'sum' | 'count' | 'avg' | 'min' | 'max'
type ZoneId = 'available' | 'rows' | 'columns' | 'values' | 'filters'
type FilterOp =
  | 'contains' | 'not_contains' | 'starts_with'
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between'
  | 'in' | 'not_in'
  | 'empty' | 'not_empty'
type FieldType = 'string' | 'number' | 'date'
type FilterLogic = 'AND' | 'OR'

interface ValueField { field: string; aggFunc: AggFunc }
interface FilterField {
  field: string
  op: FilterOp
  value: string
  value2: string
  values: string[]
}

interface TabConfig {
  id: string
  label: string
  collection: string
  filterLogic: FilterLogic
  rowFields: string[]
  columnFields: string[]
  valueFields: ValueField[]
  filterFields: FilterField[]
  /** לשונית שמקורה בחיפוש של דוח הריכוז (ולא בקולקשן שלם): השאילתה נשמרת ומורצת מחדש בשחזור */
  source?: { query: Record<string, unknown> }
}

interface TabState extends TabConfig {
  notice?: string
  fieldList: string[]
  fieldTypes: Record<string, FieldType>
  rawData: Record<string, unknown>[] | null
  loading: boolean
}

interface SavedReport {
  _id: string
  name: string
  tabs: TabConfig[]
  createdAt: string
}

interface PivotResult {
  rowData: Record<string, unknown>[]
  colDefs: ColDef[]
  pinnedBottom: Record<string, unknown>[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _tabN = 0
const mkTab = (): TabState => {
  _tabN++
  return {
    id: `t${_tabN}`, label: `טאב ${_tabN}`, collection: '',
    filterLogic: 'AND',
    fieldList: [], fieldTypes: {},
    rowFields: [], columnFields: [], valueFields: [], filterFields: [],
    rawData: null, loading: false,
  }
}

const mkFilter = (field: string): FilterField => ({
  field, op: 'contains', value: '', value2: '', values: [],
})

const AGG_OPTS: AggFunc[] = ['sum', 'count', 'avg', 'min', 'max']
const AGG_HEB: Record<AggFunc, string> = {
  sum: 'סכום', count: 'ספירה', avg: 'ממוצע', min: 'מינ׳', max: 'מקס׳',
}

const FILTER_OPS: { op: FilterOp; label: string; kind: 'noValue' | 'single' | 'between' | 'multi' }[] = [
  { op: 'contains',     label: 'מכיל',        kind: 'single' },
  { op: 'not_contains', label: 'אינו מכיל',   kind: 'single' },
  { op: 'eq',           label: '= שווה',       kind: 'single' },
  { op: 'neq',          label: '≠ שונה',       kind: 'single' },
  { op: 'gt',           label: '> גדול מ',     kind: 'single' },
  { op: 'gte',          label: '≥ גדול/שווה',  kind: 'single' },
  { op: 'lt',           label: '< קטן מ',      kind: 'single' },
  { op: 'lte',          label: '≤ קטן/שווה',   kind: 'single' },
  { op: 'between',      label: 'בין...ל',      kind: 'between' },
  { op: 'starts_with',  label: 'מתחיל ב',      kind: 'single' },
  { op: 'in',           label: 'ברשימה',       kind: 'multi' },
  { op: 'not_in',       label: 'לא ברשימה',    kind: 'multi' },
  { op: 'empty',        label: 'ריק',          kind: 'noValue' },
  { op: 'not_empty',    label: 'לא ריק',       kind: 'noValue' },
]
const opKind = (op: FilterOp) => FILTER_OPS.find(o => o.op === op)?.kind ?? 'single'

// ─── Date / numeric helpers ───────────────────────────────────────────────────

// Flexible date parse: supports MM/YYYY, M/YYYY, YYYY-MM, YYYY-MM-DD
function parseMonthYearFlex(s: string): number {
  const m1 = s.match(/^(\d{1,2})\/(\d{4})$/)
  if (m1) return parseInt(m1[2]) * 100 + parseInt(m1[1])
  const m2 = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?(?:T.*)?$/)
  if (m2) return parseInt(m2[1]) * 100 + parseInt(m2[2])
  return NaN
}

const DATE_RE = /^\d{1,2}\/\d{4}$/

function detectFieldType(rows: Record<string, unknown>[], field: string): FieldType {
  const sample = rows.slice(0, 200).map(r => r[field]).filter(v => v != null && v !== '')
  if (sample.length === 0) return 'string'
  if (sample.filter(v => !isNaN(parseMonthYearFlex(String(v)))).length / sample.length >= 0.8) return 'date'
  if (sample.filter(v => !isNaN(Number(v))).length / sample.length >= 0.8) return 'number'
  return 'string'
}

function detectAllFieldTypes(rows: Record<string, unknown>[], fields: string[]): Record<string, FieldType> {
  const t: Record<string, FieldType> = {}
  fields.forEach(f => { t[f] = detectFieldType(rows, f) })
  return t
}

const FIELD_META: Record<FieldType, { placeholder: string; hint: string; validate: (v: string) => boolean }> = {
  date:   { placeholder: 'MM/YYYY', hint: 'פורמט: MM/YYYY  (לדוג׳ 04/2026)', validate: v => v === '' || DATE_RE.test(v) || !isNaN(parseMonthYearFlex(v)) },
  number: { placeholder: 'מספר',    hint: 'יש להזין מספר',                    validate: v => v === '' || !isNaN(Number(v)) },
  string: { placeholder: 'ערך...',  hint: '',                                  validate: () => true },
}

function compareValues(rowVal: unknown, filterVal: string): number {
  const str = String(rowVal ?? '')
  // Try flexible date comparison first
  const dR = parseMonthYearFlex(str), dF = parseMonthYearFlex(filterVal)
  if (!isNaN(dR) && !isNaN(dF)) return dR - dF
  // Numeric comparison
  const nR = Number(rowVal), nF = Number(filterVal)
  if (!isNaN(nR) && !isNaN(nF)) return nR - nF
  // String fallback
  return str.localeCompare(filterVal, 'he')
}

function applyFilter(rowVal: unknown, ff: FilterField): boolean {
  const op = ff.op ?? 'contains'
  const val = ff.value ?? ''
  const val2 = ff.value2 ?? ''
  const vals = ff.values ?? []
  const str = String(rowVal ?? '')

  if (op === 'empty')     return rowVal == null || rowVal === ''
  if (op === 'not_empty') return rowVal != null && rowVal !== ''
  if (op === 'in')        return vals.length === 0 || vals.includes(str)
  if (op === 'not_in')    return vals.length === 0 || !vals.includes(str)

  if (op === 'between') {
    if (val === '' && val2 === '') return true
    const dF1 = val  === '' ? -Infinity : parseMonthYearFlex(val)
    const dF2 = val2 === '' ? Infinity  : parseMonthYearFlex(val2)
    // Date between: if filter values are dates, row must also be a date
    if (!isNaN(dF1) || !isNaN(dF2)) {
      const dR = parseMonthYearFlex(str)
      if (isNaN(dR)) return false
      return dR >= (isNaN(dF1) ? -Infinity : dF1) && dR <= (isNaN(dF2) ? Infinity : dF2)
    }
    const nF1 = val  === '' ? -Infinity : Number(val)
    const nF2 = val2 === '' ? Infinity  : Number(val2)
    // Numeric between: row must also be numeric
    if (!isNaN(nF1) || !isNaN(nF2)) {
      const nR = Number(rowVal)
      if (isNaN(nR)) return false
      return nR >= (isNaN(nF1) ? -Infinity : nF1) && nR <= (isNaN(nF2) ? Infinity : nF2)
    }
    // String between
    const c1 = val  === '' ? -1 : str.localeCompare(val, 'he')
    const c2 = val2 === '' ?  1 : str.localeCompare(val2, 'he')
    return c1 >= 0 && c2 <= 0
  }

  if (val === '') return true

  if (op === 'contains')     return str.includes(val)
  if (op === 'not_contains') return !str.includes(val)
  if (op === 'starts_with')  return str.startsWith(val)

  // For eq/neq: try exact string match FIRST (avoids locale edge-cases),
  // then try flexible date/numeric comparison so "9/2026" == "09/2026"
  if (op === 'eq')  return str === val || compareValues(rowVal, val) === 0
  if (op === 'neq') return str !== val && compareValues(rowVal, val) !== 0

  const cmp = compareValues(rowVal, val)
  if (op === 'gt')  return cmp > 0
  if (op === 'gte') return cmp >= 0
  if (op === 'lt')  return cmp < 0
  if (op === 'lte') return cmp <= 0
  return true
}

function filterRows(
  rows: Record<string, unknown>[],
  filterFields: FilterField[],
  logic: FilterLogic,
): Record<string, unknown>[] {
  if (filterFields.length === 0) return rows
  const active = filterFields.filter(ff => {
    const k = opKind(ff.op ?? 'contains')
    if (k === 'noValue') return true
    if (k === 'multi') return (ff.values ?? []).length > 0
    if (k === 'between') return ff.value !== '' || ff.value2 !== ''
    return ff.value !== ''
  })
  if (active.length === 0) return rows
  return rows.filter(row => {
    const results = active.map(ff => applyFilter(row[ff.field], ff))
    return logic === 'OR' ? results.some(Boolean) : results.every(Boolean)
  })
}

// ─── Aggregation / Grouping ──────────────────────────────────────────────────

const fmtNum = (v: unknown) => {
  const n = Number(v)
  return isNaN(n) ? String(v ?? '') : n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcAgg(rows: Record<string, unknown>[], v: ValueField): number {
  const vals = rows.map(r => Number(r[v.field] ?? 0)).filter(n => !isNaN(n))
  if (v.aggFunc === 'count') return vals.length
  if (v.aggFunc === 'avg')   return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  if (v.aggFunc === 'min')   return vals.length ? vals.reduce((a, b) => a < b ? a : b, Infinity) : 0
  if (v.aggFunc === 'max')   return vals.length ? vals.reduce((a, b) => a > b ? a : b, -Infinity) : 0
  return vals.reduce((a, b) => a + b, 0)
}

function sortedColVals(vals: Set<string>): string[] {
  return Array.from(vals).sort((a, b) => {
    const da = parseMonthYearFlex(a), db = parseMonthYearFlex(b)
    if (!isNaN(da) && !isNaN(db)) return da - db
    const na = Number(a), nb = Number(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b, 'he')
  })
}

function sortedRowData(rows: Record<string, unknown>[], rowFields: string[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    for (const f of rowFields) {
      const va = String(a[f] ?? ''), vb = String(b[f] ?? '')
      const da = parseMonthYearFlex(va), db = parseMonthYearFlex(vb)
      if (!isNaN(da) && !isNaN(db)) { const d = da - db; if (d !== 0) return d }
      const na = Number(a[f]), nb = Number(b[f])
      if (!isNaN(na) && !isNaN(nb)) { const d = na - nb; if (d !== 0) return d }
      const d = va.localeCompare(vb, 'he'); if (d !== 0) return d
    }
    return 0
  })
}

// ─── Data from a report-query (העברה מדוח ריכוז) ──────────────────────────────

const QUERY_ROW_LIMIT = 100000
const NO_INSTITUTION = 'ללא מוסד'

/** שדה הסכום שמסכמים כברירת מחדל, לפי הקובץ: הפרש_מחושב מצטבר נכון על פני חודשי חישוב; סכום_מחושב לא. */
const AMOUNT_BY_COLLECTION: Record<string, string[]> = {
  CHESHBONIT: ['יתרת_ביצוע_החודש', 'הפרש_לתשלום'],
  YADANIIM: ['סכום_מחושב'],
  COMMANDS: ['סכום_זכות'],
}
const AMOUNT_FALLBACK = ['הפרש_מחושב', 'סכום_מחושב', 'יתרת_ביצוע_החודש', 'סכום_זכות']

function fieldsFromRows(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  for (const r of rows.slice(0, 500)) for (const k of Object.keys(r)) seen.add(k)
  return Array.from(seen)
}

/** שורות בלי מוסד (חשבוניות, רוב הידניים) מקובצות תחת "ללא מוסד" במקום תא ריק או 0. */
function normalizeInstitutionRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows
  const hasCode = rows.some(r => 'סמל_מוסד' in r)
  const hasName = rows.some(r => 'שם_מוסד' in r)
  if (!hasCode && !hasName) return rows
  return rows.map(r => {
    const code = r['סמל_מוסד']
    if (code !== null && code !== undefined && code !== '' && Number(code) !== 0) return r
    const out = { ...r }
    if (hasCode) out['סמל_מוסד'] = NO_INSTITUTION
    if (hasName) out['שם_מוסד'] = NO_INSTITUTION
    return out
  })
}

/** מבנה ברירת המחדל: שורות = מוסד, עמודות = חודש תחולה, ערך = סכום (קובץ בלי מוסד — לפי נושא). */
function defaultPivotConfig(collection: string, fields: string[]): Pick<TabConfig, 'rowFields' | 'columnFields' | 'valueFields'> {
  const has = (f: string) => fields.includes(f)
  let rowFields: string[]
  if (has('סמל_מוסד')) {
    rowFields = ['סמל_מוסד', ...(has('שם_מוסד') ? ['שם_מוסד'] : [])]
  } else {
    const topicName = ['תאור_נושא', 'נושא', 'שם_נושא'].find(has)
    rowFields = [...(has('קוד_נושא') ? ['קוד_נושא'] : []), ...(topicName ? [topicName] : [])]
  }
  const columnFields = has('חודש_תחולה') ? ['חודש_תחולה'] : []
  const amount = [...(AMOUNT_BY_COLLECTION[collection] ?? []), ...AMOUNT_FALLBACK].find(has)
  const valueFields: ValueField[] = amount
    ? [{ field: amount, aggFunc: 'sum' }]
    : fields.length > 0 ? [{ field: fields[0], aggFunc: 'count' }] : []
  return { rowFields, columnFields, valueFields }
}

async function fetchQueryRows(
  collection: string,
  query: Record<string, unknown>,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean; errors?: Record<string, string> }> {
  const res = await fetch('/api/reports/query', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...query, collections: [collection], limit: QUERY_ROW_LIMIT + 1 }),
  })
  const d = await res.json().catch(() => null)
  if (!res.ok || !d?.ok) throw new Error(d?.error ?? `שגיאת שרת (${res.status})`)
  let rows = (d.data?.[collection] ?? []) as Record<string, unknown>[]
  const truncated = rows.length > QUERY_ROW_LIMIT
  if (truncated) rows = rows.slice(0, QUERY_ROW_LIMIT)
  return { rows: normalizeInstitutionRows(rows), truncated, errors: d.meta?.errors }
}

// ─── Source-query filters (topics / institutions / months) ──────────────────────

interface RefItem { value: string; label: string }

const FILTER_INPUT_CLS = 'w-full bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]'

/**
 * סרגל סינון של לשונית שמקורה בחיפוש מדוח ריכוז: מציג את הסינונים השמורים בשאילתה
 * (נושאים, מוסדות, חודשי חישוב ותחולה) ומאפשר לשנות אותם ולהריץ מחדש. ללא נושאים/מוסדות
 * בשאילתה = הכל. הטיוטה מקומית עד לחיצה על "החל סינון".
 */
function SourceFilters({ query, topics, mosdot, loading, onApply }: {
  query: Record<string, unknown>
  topics: RefItem[]
  mosdot: RefItem[]
  loading: boolean
  onApply: (q: Record<string, unknown>) => void
}) {
  const str = (k: string) => (typeof query[k] === 'string' ? (query[k] as string) : '')
  const list = (k: string) => (Array.isArray(query[k]) ? (query[k] as unknown[]).map(String) : null)

  const [selTopics, setSelTopics] = useState<string[]>(() => list('nose_codes') ?? topics.map(t => t.value))
  const [selMosdot, setSelMosdot] = useState<string[]>(() => list('mosad_codes') ?? mosdot.map(m => m.value))
  const [fromMonth, setFromMonth] = useState(str('from_month'))
  const [toMonth, setToMonth] = useState(str('to_month'))
  const [fromTachula, setFromTachula] = useState(str('from_tachula'))
  const [toTachula, setToTachula] = useState(str('to_tachula'))

  // הרשימות נטענות אחרי העמוד: כל עוד אין בשאילתה בחירה מפורשת, "הכל" = כל הרשימה שהגיעה.
  const topicsSaved = list('nose_codes')
  const mosdotSaved = list('mosad_codes')
  useEffect(() => { if (!topicsSaved) setSelTopics(topics.map(t => t.value)) }, [topics, topicsSaved])
  useEffect(() => { if (!mosdotSaved) setSelMosdot(mosdot.map(m => m.value)) }, [mosdot, mosdotSaved])

  const allTopics = topics.length > 0 && selTopics.length === topics.length
  const allMosdot = mosdot.length > 0 && selMosdot.length === mosdot.length

  const apply = () => {
    const q: Record<string, unknown> = { ...query }
    const put = (k: string, v: unknown) => { if (v === undefined || v === '') delete q[k]; else q[k] = v }
    put('nose_codes', allTopics || topics.length === 0 ? undefined : selTopics)
    put('mosad_codes', allMosdot || mosdot.length === 0 ? undefined : selMosdot)
    put('from_month', fromMonth); put('to_month', toMonth)
    put('from_tachula', fromTachula); put('to_tachula', toTachula)
    onApply(q)
  }

  const reset = () => {
    setSelTopics(topics.map(t => t.value)); setSelMosdot(mosdot.map(m => m.value))
    setFromMonth(''); setToMonth(''); setFromTachula(''); setToTachula('')
  }

  return (
    <div className="bg-white px-4 py-3 rounded-xl border border-[#d1d9e0] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#1f2328]">סינון הנתונים</span>
        <span className="text-xs text-[#636c76]">שינוי הסינון מריץ מחדש את החיפוש; מבנה הפיווט נשמר.</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <MultiSelect label="נושאים" items={topics} selected={selTopics} onChange={setSelTopics} searchPlaceholder="חפש נושא..." />
        <MultiSelect label="מוסדות" items={mosdot} selected={selMosdot} onChange={setSelMosdot} searchPlaceholder="חפש מוסד..." />
        <div>
          <label className="block text-xs text-[#636c76] mb-1.5 font-medium">מחודש תחולה</label>
          <input type="month" value={fromTachula} onChange={e => setFromTachula(e.target.value)} className={FILTER_INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs text-[#636c76] mb-1.5 font-medium">עד חודש תחולה</label>
          <input type="month" value={toTachula} onChange={e => setToTachula(e.target.value)} className={FILTER_INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs text-[#636c76] mb-1.5 font-medium">מחודש חישוב</label>
          <input type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)} className={FILTER_INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs text-[#636c76] mb-1.5 font-medium">עד חודש חישוב</label>
          <input type="month" value={toMonth} onChange={e => setToMonth(e.target.value)} className={FILTER_INPUT_CLS} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={apply} disabled={loading}
          className="px-4 py-1.5 text-sm bg-[#0969da] text-white rounded-lg hover:bg-[#0550ae] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {loading ? '⏳ טוען...' : '🔍 החל סינון'}
        </button>
        <button onClick={reset} disabled={loading}
          className="px-3 py-1.5 text-sm border border-[#d1d9e0] bg-white text-[#636c76] rounded-lg hover:bg-[#f0f3f6] disabled:opacity-50 transition-colors">
          נקה סינון
        </button>
      </div>
    </div>
  )
}

// ─── Bar chart by application month (SVG, no dependency) ────────────────────────

function TachulaChart({ points }: { points: { month: string; value: number }[] }) {
  const W = 900, H = 200, padL = 8, padR = 8, padT = 14, padB = 40
  if (points.length === 0) return null
  const max = Math.max(0, ...points.map(p => p.value))
  const min = Math.min(0, ...points.map(p => p.value))
  const span = max - min || 1
  const plotH = H - padT - padB
  const y = (v: number) => padT + ((max - v) / span) * plotH
  const zeroY = y(0)
  const slot = (W - padL - padR) / points.length
  const barW = Math.max(2, Math.min(40, slot * 0.7))
  const every = Math.max(1, Math.ceil(points.length / 18))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} direction="ltr">
      <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="#d1d9e0" />
      {points.map((p, i) => {
        const cx = padL + slot * i + slot / 2
        const top = Math.min(y(p.value), zeroY)
        const h = Math.max(1, Math.abs(y(p.value) - zeroY))
        return (
          <g key={p.month}>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} fill={p.value < 0 ? '#cf222e' : '#0969da'} rx={1}>
              <title>{`${p.month}: ${fmtNum(p.value)}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={cx} y={H - padB + 14} fontSize="10" fill="#636c76" textAnchor="middle">{p.month}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Manual pivot table builder ───────────────────────────────────────────────

function buildPivotData(
  data: Record<string, unknown>[],
  rowFields: string[],
  columnFields: string[],
  valueFields: ValueField[],
): PivotResult {
  // 1. Distinct column values (one field → single val; multiple → joined by ' | ')
  const colValSet = new Set<string>()
  data.forEach(row => {
    const combo = columnFields.map(cf => String(row[cf] ?? '')).join(' | ')
    if (combo !== '') colValSet.add(combo)
  })
  const colVals = sortedColVals(colValSet)

  // 2. Group rows by rowFields key ('\0'-separated)
  const rowMap = new Map<string, Record<string, unknown>[]>()
  if (rowFields.length === 0) {
    rowMap.set('', data)
  } else {
    data.forEach(row => {
      const key = rowFields.map(f => String(row[f] ?? '')).join('\0')
      if (!rowMap.has(key)) rowMap.set(key, [])
      rowMap.get(key)!.push(row)
    })
  }

  // Safe field key: replace non-alphanumeric (keep Hebrew) with underscore
  // Replace only dot and slash which AG-Grid may parse as object path separators
  const safeKey = (s: string) => s.replace(/[./]/g, '_')
  const pvField = (colVal: string, fieldName: string) => `pv__${safeKey(colVal)}__${safeKey(fieldName)}`
  const pvTotalField = (fieldName: string) => `pvtotal__${safeKey(fieldName)}`

  const matchColVal = (row: Record<string, unknown>, colVal: string) =>
    columnFields.map(cf => String(row[cf] ?? '')).join(' | ') === colVal

  // 3. Build grid rows
  const rawRows: Record<string, unknown>[] = []
  rowMap.forEach((groupRows, key) => {
    const gridRow: Record<string, unknown> = {}
    if (rowFields.length > 0) {
      key.split('\0').forEach((v, i) => { gridRow[rowFields[i]] = v })
    }
    colVals.forEach(colVal => {
      const colRows = groupRows.filter(r => matchColVal(r, colVal))
      valueFields.forEach(vf => {
        gridRow[pvField(colVal, vf.field)] = calcAgg(colRows, vf)
      })
    })
    // Row total
    valueFields.forEach(vf => {
      gridRow[pvTotalField(vf.field)] = calcAgg(groupRows, vf)
    })
    rawRows.push(gridRow)
  })

  const rowData = rowFields.length > 0 ? sortedRowData(rawRows, rowFields) : rawRows

  // 4. Column totals (pinned bottom)
  const bottomRow: Record<string, unknown> = {}
  if (rowFields.length > 0) { bottomRow[rowFields[0]] = 'סה״כ כולל' }
  colVals.forEach(colVal => {
    const colRows = data.filter(r => matchColVal(r, colVal))
    valueFields.forEach(vf => {
      bottomRow[pvField(colVal, vf.field)] = calcAgg(colRows, vf)
    })
  })
  valueFields.forEach(vf => {
    bottomRow[pvTotalField(vf.field)] = calcAgg(data, vf)
  })

  // 5. Build column definitions
  const headerCols: ColDef[] = rowFields.map(f => ({
    field: f, minWidth: 120, sortable: true, filter: true, pinned: 'right' as const,
  }))

  const numFmt: ColDef['valueFormatter'] = p => p.value != null ? fmtNum(p.value) : ''
  const totalStyle = { fontWeight: 700, background: '#f0f3f6' }

  let dataCols: ColDef[]
  if (valueFields.length === 1) {
    const vf = valueFields[0]
    dataCols = [
      ...colVals.map(colVal => ({
        field: pvField(colVal, vf.field),
        headerName: colVal,
        type: 'numericColumn' as const,
        valueFormatter: numFmt,
        minWidth: 100,
      })),
      {
        field: pvTotalField(vf.field),
        headerName: `סה״כ`,
        type: 'numericColumn' as const,
        valueFormatter: numFmt,
        minWidth: 100,
        cellStyle: totalStyle,
      },
    ]
  } else {
    dataCols = [
      ...colVals.map(colVal => ({
        headerName: colVal,
        children: valueFields.map(vf => ({
          field: pvField(colVal, vf.field),
          headerName: `${AGG_HEB[vf.aggFunc]}(${vf.field})`,
          type: 'numericColumn' as const,
          valueFormatter: numFmt,
          minWidth: 90,
        })),
      })),
      {
        headerName: 'סה״כ',
        children: valueFields.map(vf => ({
          field: pvTotalField(vf.field),
          headerName: `${AGG_HEB[vf.aggFunc]}(${vf.field})`,
          type: 'numericColumn' as const,
          valueFormatter: numFmt,
          minWidth: 90,
          cellStyle: totalStyle,
        })),
      },
    ]
  }

  return { rowData, colDefs: [...headerCols, ...dataCols], pinnedBottom: [bottomRow] }
}

// Normal mode (no column pivot) aggregation — hierarchical with subtotals and collapse support
function buildGroupedRows(
  data: Record<string, unknown>[],
  rowFields: string[],
  valueFields: ValueField[],
): Record<string, unknown>[] {
  if (rowFields.length === 0) return data
  const result: Record<string, unknown>[] = []
  const recurse = (rows: Record<string, unknown>[], fIdx: number, prefix: Record<string, unknown>, level: number, parentKey: string) => {
    const f = rowFields[fIdx]
    const isLast = fIdx === rowFields.length - 1
    const map = new Map<string, Record<string, unknown>[]>()
    rows.forEach(r => {
      const k = String(r[f] ?? '')
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    })
    sortedColVals(new Set(map.keys())).forEach(kStr => {
      const grp = map.get(kStr)!
      const groupKey = parentKey ? `${parentKey}\0${kStr}` : kStr
      const row: Record<string, unknown> = {
        ...prefix, [f]: kStr,
        _level: level, _isSubtotal: !isLast,
        _groupKey: isLast ? '' : groupKey,
        _parentKey: parentKey,
      }
      valueFields.forEach(v => { row[v.field] = calcAgg(grp, v) })
      result.push(row)
      if (!isLast) recurse(grp, fIdx + 1, { ...prefix, [f]: kStr }, level + 1, groupKey)
    })
  }
  recurse(data, 0, {}, 0, '')
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GroupCellRenderer(props: any) {
  const level = (props.data?._level as number) ?? 0
  const isSubtotal = !!(props.data?._isSubtotal)
  const isCollapsed = !!(props.data?._isCollapsed)
  const groupKey = (props.data?._groupKey as string) ?? ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: level * 16 }}>
      {isSubtotal ? (
        <button
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); props.context?.toggleGroup?.(groupKey) }}
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', padding: '0 2px', fontSize: 11, color: '#0550ae', lineHeight: 1, flexShrink: 0 }}>
          {isCollapsed ? '▶' : '▼'}
        </button>
      ) : (
        <span style={{ display: 'inline-block', width: 18, flexShrink: 0 }} />
      )}
      <span>{String(props.value ?? '')}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tabs, setTabs] = useState<TabState[]>(() => [mkTab()])
  const [activeId, setActiveId] = useState<string>('')
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [collections, setCollections] = useState<string[]>([])
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [savedOpen, setSavedOpen] = useState(false)
  const [saveModal, setSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')
  const [valDropdown, setValDropdown] = useState<{ filterIdx: number; search: string } | null>(null)
  const [builderOpen, setBuilderOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const [dragInfo, setDragInfo] = useState<{ field: string; fromZone: ZoneId; fromIdx: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ zone: ZoneId; idx: number } | null>(null)

  const gridApis = useRef<Map<string, GridApi>>(new Map())
  const savedDropdownRef = useRef<HTMLDivElement>(null)
  const valDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setActiveId(tabs[0]?.id ?? '') }, [])

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => setCollections((d.collections ?? []).map((c: { name: string }) => c.name)))
      .catch(() => {})
    loadSavedReports()
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (savedDropdownRef.current && !savedDropdownRef.current.contains(e.target as Node))
        setSavedOpen(false)
      if (valDropdownRef.current && !valDropdownRef.current.contains(e.target as Node))
        setValDropdown(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadSavedReports = () => {
    fetch('/api/pivot/reports').then(r => r.json()).then(d => setSavedReports(d.reports ?? [])).catch(() => {})
  }

  const activeTab = useMemo(() => tabs.find(t => t.id === activeId) ?? tabs[0], [tabs, activeId])

  const updTab = useCallback((id: string, patch: Partial<TabState>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  // רשימות הנושאים והמוסדות לסרגל הסינון של לשוניות שמקורן בדוח ריכוז
  const [topicItems, setTopicItems] = useState<RefItem[]>([])
  const [mosadItems, setMosadItems] = useState<RefItem[]>([])
  useEffect(() => {
    const lbl = (code: string, name?: string) => (name && name !== code ? `${code} — ${name}` : code)
    fetch('/api/reports/topics').then(r => r.json()).then(d => {
      setTopicItems((d.topics ?? []).map((t: { code: string; name?: string }) => ({ value: String(t.code), label: lbl(String(t.code), t.name) })))
    }).catch(() => {})
    fetch('/api/mosdot').then(r => r.json()).then(d => {
      setMosadItems((d.mosdot ?? []).map((m: { code: string; name?: string }) => ({ value: String(m.code), label: lbl(String(m.code), m.name) })))
    }).catch(() => {})
  }, [])

  // ── לשונית שמקורה בחיפוש מדוח ריכוז ────────────────────────────────────────

  const loadSourceTab = async (tab: TabState, applyDefaults: boolean) => {
    if (!tab.source) return
    updTab(tab.id, { loading: true, notice: undefined })
    try {
      const { rows, truncated, errors } = await fetchQueryRows(tab.collection, tab.source.query)
      const fieldList = fieldsFromRows(rows)
      const patch: Partial<TabState> = {
        rawData: rows,
        fieldList,
        fieldTypes: detectAllFieldTypes(rows, fieldList),
        loading: false,
        notice: truncated
          ? `הנתונים קוצצו ל-${QUERY_ROW_LIMIT.toLocaleString()} שורות — כדאי לצמצם את החיפוש בדוח הריכוז.`
          : errors ? `השאילתה נכשלה בקולקשן הזה: ${Object.values(errors).join(', ')}` : undefined,
      }
      if (applyDefaults) Object.assign(patch, defaultPivotConfig(tab.collection, fieldList))
      updTab(tab.id, patch)
    } catch (e) {
      updTab(tab.id, { loading: false, notice: `טעינת הנתונים נכשלה: ${e instanceof Error ? e.message : 'שגיאה'}` })
    }
  }

  // העברה מדוח ריכוז: דוח הריכוז משאיר ב-sessionStorage את תיאור החיפוש (לא את השורות),
  // והפיווט מריץ אותו בעצמו — כך גם דוח שמור משוחזר מנתונים עדכניים.
  useEffect(() => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem('pivot_handoff')
      if (raw) sessionStorage.removeItem('pivot_handoff')
    } catch { /* ללא sessionStorage — פשוט לא מעבירים */ }
    if (!raw) return
    try {
      const h = JSON.parse(raw) as { query: Record<string, unknown>; tabs: { collection: string; label: string }[] }
      const fresh: TabState[] = (h.tabs ?? []).map(t => ({
        ...mkTab(), label: t.label, collection: t.collection, source: { query: h.query }, loading: true,
      }))
      if (fresh.length === 0) return
      setTabs(fresh)
      setActiveId(fresh[0].id)
      fresh.forEach(t => { void loadSourceTab(t, true) })
    } catch { /* תוכן לא תקין — מתעלמים */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Collection ────────────────────────────────────────────────────────────

  const onCollChange = async (tabId: string, col: string) => {
    updTab(tabId, {
      collection: col, fieldList: [], fieldTypes: {},
      rowFields: [], columnFields: [], valueFields: [], filterFields: [], rawData: null,
    })
    if (!col) return
    const r = await fetch(`/api/pivot/fields?collection=${encodeURIComponent(col)}`)
    const d = await r.json()
    updTab(tabId, { fieldList: d.fields ?? [] })
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  const onRun = async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab?.collection) return
    if (tab.source) { await loadSourceTab(tab, false); return }
    updTab(tabId, { loading: true })
    try {
      const r = await fetch('/api/pivot/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: tab.collection }),
      })
      const d = await r.json()
      const data: Record<string, unknown>[] = d.data ?? []
      const tab2 = tabs.find(t => t.id === tabId)
      const fieldTypes = detectAllFieldTypes(data, tab2?.fieldList ?? [])
      updTab(tabId, { rawData: data, fieldTypes, loading: false })
    } catch {
      updTab(tabId, { loading: false })
    }
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const addTab = () => {
    const t = mkTab()
    setTabs(prev => [...prev, t])
    setActiveId(t.id)
  }

  const closeTab = (id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) { const t = mkTab(); setActiveId(t.id); return [t] }
      if (id === activeId) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  const commitLabel = (id: string) => {
    if (editingLabel.trim()) updTab(id, { label: editingLabel.trim() })
    setEditingTabId(null)
  }

  // ── Computed grid data ─────────────────────────────────────────────────────

  const usedFields = useMemo(() => {
    if (!activeTab) return new Set<string>()
    // filterFields are intentionally excluded: the same field can live in both
    // the filters zone AND the rows/columns/values zones simultaneously.
    return new Set([
      ...activeTab.rowFields,
      ...activeTab.columnFields,
      ...activeTab.valueFields.map(v => v.field),
    ])
  }, [activeTab])

  const availableFields = useMemo(() => {
    if (!activeTab) return []
    const q = fieldSearch.toLowerCase()
    return activeTab.fieldList.filter(f => !usedFields.has(f) && (q === '' || f.toLowerCase().includes(q)))
  }, [activeTab, usedFields, fieldSearch])

  // Filtered data (always re-filter from rawData)
  const filteredData = useMemo(() => {
    if (!activeTab?.rawData) return null
    return filterRows(activeTab.rawData, activeTab.filterFields, activeTab.filterLogic ?? 'AND')
  }, [activeTab?.rawData, activeTab?.filterFields, activeTab?.filterLogic])

  // Pivot result (only when columnFields are set)
  const pivotResult = useMemo((): PivotResult | null => {
    if (!filteredData || !(activeTab?.columnFields?.length) || !(activeTab?.valueFields?.length)) return null
    return buildPivotData(
      filteredData, activeTab.rowFields, activeTab.columnFields, activeTab.valueFields,
    )
  }, [filteredData, activeTab?.rowFields, activeTab?.columnFields, activeTab?.valueFields])

  // פילוח לפי חודשי תחולה של מה שמוצג בפיווט: אותם מסננים, ואותו שדה ערך (הראשון) והסיכום שלו.
  const tachulaSummary = useMemo(() => {
    if (!filteredData || !activeTab?.fieldList.includes('חודש_תחולה')) return null
    const vf: ValueField | null = activeTab.valueFields[0] ?? null
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const r of filteredData) {
      const k = String(r['חודש_תחולה'] ?? '')
      if (!k) continue
      const g = groups.get(k)
      if (g) g.push(r); else groups.set(k, [r])
    }
    if (groups.size === 0) return null
    const months = sortedColVals(new Set(groups.keys()))
    const valueOf = (rows: Record<string, unknown>[]) => (vf ? calcAgg(rows, vf) : rows.length)
    const rows = months.map(m => ({ month: m, value: valueOf(groups.get(m)!), count: groups.get(m)!.length }))
    const dated = filteredData.filter(r => r['חודש_תחולה'])
    return { vf, rows, total: valueOf(dated), totalCount: dated.length }
  }, [filteredData, activeTab?.valueFields, activeTab?.fieldList])

  // Final grid data / column defs / pinned bottom
  const { gridRowData, columnDefs, pinnedBottom } = useMemo(() => {
    if (!filteredData) return { gridRowData: null, columnDefs: [], pinnedBottom: [] }

    // ── Pivot mode ──
    if (pivotResult) {
      return {
        gridRowData: pivotResult.rowData,
        columnDefs: pivotResult.colDefs,
        pinnedBottom: pivotResult.pinnedBottom,
      }
    }

    // ── Normal mode (client-side grouping — no Enterprise rowGroup) ──
    if (!activeTab) return { gridRowData: filteredData, columnDefs: [], pinnedBottom: [] }

    const hasRows   = activeTab.rowFields.length > 0
    const hasValues = activeTab.valueFields.length > 0

    if (hasRows && hasValues) {
      const grouped = buildGroupedRows(filteredData, activeTab.rowFields, activeTab.valueFields)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subtotalCellStyle = (p: any) =>
        p.data?._isSubtotal ? { fontWeight: 700, background: '#eaf1fb' } : undefined
      const rowFieldsSnap = [...activeTab.rowFields]
      const defs: ColDef[] = [
        {
          // Single group column replaces individual rowField columns
          headerName: rowFieldsSnap.length === 1 ? rowFieldsSnap[0] : rowFieldsSnap.join(' / '),
          colId: '__group',
          minWidth: 200,
          pinned: 'right' as const,
          sortable: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          valueGetter: (p: any) => {
            const level = (p.data?._level as number) ?? 0
            const field = rowFieldsSnap[level] ?? rowFieldsSnap[0]
            return field ? (p.data?.[field] ?? '') : ''
          },
          cellRenderer: GroupCellRenderer,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cellStyle: (p: any) => subtotalCellStyle(p),
        },
        ...activeTab.valueFields.map(v => ({
          field: v.field,
          headerName: `${v.field} (${AGG_HEB[v.aggFunc]})`,
          type: 'numericColumn' as const,
          valueFormatter: (p: { value: unknown }) => p.value != null ? fmtNum(p.value) : '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cellStyle: (p: any) => subtotalCellStyle(p),
        })),
      ]
      const bottomRow: Record<string, unknown> = {}
      if (activeTab.rowFields.length > 0) { bottomRow[activeTab.rowFields[0]] = 'סה״כ כולל' }
      activeTab.valueFields.forEach(v => { bottomRow[v.field] = calcAgg(filteredData, v) })
      return { gridRowData: grouped, columnDefs: defs, pinnedBottom: [bottomRow] }
    }

    // No grouping: show raw data with all field columns
    const defs: ColDef[] = activeTab.fieldList.map(f => ({
      field: f, sortable: true, filter: true,
    }))
    const pb: Record<string, unknown>[] = []
    if (hasValues) {
      const row: Record<string, unknown> = {}
      activeTab.valueFields.forEach(v => { row[v.field] = calcAgg(filteredData, v) })
      pb.push(row)
    }
    return { gridRowData: filteredData, columnDefs: defs, pinnedBottom: pb }
  }, [filteredData, pivotResult, activeTab])

  // Reset collapsed groups whenever underlying grid data changes (new run, new rowFields, etc.)
  useEffect(() => { setCollapsedGroups(new Set()) }, [gridRowData])

  // Apply collapse filtering on top of gridRowData
  const visibleGroupData = useMemo(() => {
    if (!gridRowData) return null
    if (pivotResult || !activeTab || activeTab.rowFields.length <= 1 || collapsedGroups.size === 0)
      return gridRowData
    return gridRowData
      .filter(row => {
        const parentKey = row._parentKey as string | undefined
        if (!parentKey) return true
        const parts = parentKey.split('\0')
        for (let i = 0; i < parts.length; i++) {
          if (collapsedGroups.has(parts.slice(0, i + 1).join('\0'))) return false
        }
        return true
      })
      .map(row =>
        row._isSubtotal
          ? { ...row, _isCollapsed: collapsedGroups.has(row._groupKey as string) }
          : row
      )
  }, [gridRowData, collapsedGroups, pivotResult, activeTab])

  // Distinct values for multi-select dropdown
  const distinctValues = useMemo(() => {
    if (!valDropdown || !activeTab?.rawData) return []
    const ff = activeTab.filterFields[valDropdown.filterIdx]
    if (!ff) return []
    const vals = new Set<string>()
    activeTab.rawData.forEach(r => {
      const v = r[ff.field]
      if (v != null && v !== '') vals.add(String(v))
    })
    const q = valDropdown.search.toLowerCase()
    return sortedColVals(
      new Set(Array.from(vals).filter(v => q === '' || v.toLowerCase().includes(q)))
    )
  }, [valDropdown?.filterIdx, valDropdown?.search, activeTab?.rawData, activeTab?.filterFields])

  // ── DnD ───────────────────────────────────────────────────────────────────

  const onDragStart = (field: string, fromZone: ZoneId, fromIdx: number) =>
    setDragInfo({ field, fromZone, fromIdx })
  const onDragEnd = useCallback(() => { setDragInfo(null); setDropTarget(null) }, [])

  const onDrop = useCallback((toZone: ZoneId, toIdx: number) => {
    if (!dragInfo) return
    const { field, fromZone, fromIdx } = dragInfo

    setTabs(prev => prev.map(t => {
      if (t.id !== activeId) return t
      let rowFields = [...t.rowFields]
      let columnFields = [...t.columnFields]
      let valueFields = [...t.valueFields]
      let filterFields = [...t.filterFields]

      const origValue  = fromZone === 'values'  ? { ...t.valueFields[fromIdx] }  : null
      const origFilter = fromZone === 'filters' ? { ...t.filterFields[fromIdx] } : null

      // Dropping TO filters is always additive: field stays in the source zone.
      // Exception: reordering WITHIN filters still removes the old position.
      const removeFromSource = toZone !== 'filters' || fromZone === 'filters'
      if (removeFromSource) {
        if (fromZone === 'rows')    rowFields.splice(fromIdx, 1)
        else if (fromZone === 'columns') columnFields.splice(fromIdx, 1)
        else if (fromZone === 'values')  valueFields.splice(fromIdx, 1)
        else if (fromZone === 'filters') filterFields.splice(fromIdx, 1)
      }

      let idx = toIdx
      if (fromZone === toZone && fromIdx < toIdx) idx = Math.max(0, idx - 1)

      if (toZone === 'rows')    rowFields.splice(Math.min(idx, rowFields.length), 0, field)
      else if (toZone === 'columns') columnFields.splice(Math.min(idx, columnFields.length), 0, field)
      else if (toZone === 'values')  valueFields.splice(Math.min(idx, valueFields.length), 0, origValue ?? { field, aggFunc: 'sum' })
      else if (toZone === 'filters') filterFields.splice(Math.min(idx, filterFields.length), 0, origFilter ?? mkFilter(field))

      return { ...t, rowFields, columnFields, valueFields, filterFields }
    }))

    setDragInfo(null); setDropTarget(null)
  }, [dragInfo, activeId])

  const removeField = (zone: ZoneId, idx: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeId) return t
      return {
        ...t,
        rowFields:    zone === 'rows'    ? t.rowFields.filter((_, i) => i !== idx)    : t.rowFields,
        columnFields: zone === 'columns' ? t.columnFields.filter((_, i) => i !== idx) : t.columnFields,
        valueFields:  zone === 'values'  ? t.valueFields.filter((_, i) => i !== idx)  : t.valueFields,
        filterFields: zone === 'filters' ? t.filterFields.filter((_, i) => i !== idx) : t.filterFields,
      }
    }))
  }

  const updateValueAgg = (idx: number, aggFunc: AggFunc) => {
    setTabs(prev => prev.map(t => t.id !== activeId ? t : {
      ...t, valueFields: t.valueFields.map((v, i) => i === idx ? { ...v, aggFunc } : v)
    }))
  }

  const updFilter = (idx: number, patch: Partial<FilterField>) => {
    setTabs(prev => prev.map(t => t.id !== activeId ? t : {
      ...t, filterFields: t.filterFields.map((f, i) => i === idx ? { ...f, ...patch } : f)
    }))
  }

  const toggleFilterValue = (filterIdx: number, val: string) => {
    const ff = activeTab?.filterFields[filterIdx]
    if (!ff) return
    const current = ff.values ?? []
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val]
    updFilter(filterIdx, { values: next })
  }

  const updateFilterLogic = (logic: FilterLogic) => updTab(activeId, { filterLogic: logic })

  // ── Save / Load ───────────────────────────────────────────────────────────

  const saveReport = async () => {
    if (!saveName.trim()) return
    const tabsConfig: TabConfig[] = tabs.map(
      ({ id, label, collection, filterLogic, rowFields, columnFields, valueFields, filterFields, source }) => ({
        id, label, collection, filterLogic, rowFields, columnFields, valueFields, filterFields, source,
      })
    )
    await fetch('/api/pivot/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveName.trim(), tabs: tabsConfig }),
    })
    setSaveModal(false); setSaveName(''); loadSavedReports()
  }

  const loadReport = async (report: SavedReport) => {
    const loaded: TabState[] = await Promise.all(
      report.tabs.map(async tc => {
        let fieldList: string[] = []
        if (tc.collection && !tc.source) {
          try {
            const r = await fetch(`/api/pivot/fields?collection=${encodeURIComponent(tc.collection)}`)
            const d = await r.json()
            fieldList = d.fields ?? []
          } catch { /* ignore */ }
        }
        const filterFields = (tc.filterFields ?? []).map(ff => ({
          ...ff,
          value2: ff.value2 ?? '',
          values: ff.values ?? [],
        }))
        return {
          ...tc,
          filterLogic: tc.filterLogic ?? 'AND',
          columnFields: tc.columnFields ?? [],
          filterFields,
          fieldList, fieldTypes: {}, rawData: null, loading: !!tc.source,
        }
      })
    )
    setTabs(loaded); setActiveId(loaded[0]?.id ?? ''); setSavedOpen(false)
    loaded.filter(t => t.source).forEach(t => { void loadSourceTab(t, false) })
  }

  const deleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/pivot/reports?id=${id}`, { method: 'DELETE' })
    loadSavedReports()
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const exportExcel = async () => {
    const xlsx = await import('xlsx')
    const wb = xlsx.utils.book_new()
    let hasSheet = false
    for (const tab of tabs) {
      if (!tab.rawData || !tab.collection) continue
      const filtered = filterRows(tab.rawData, tab.filterFields, tab.filterLogic ?? 'AND')
      let rows: Record<string, unknown>[]
      if (tab.columnFields.length > 0 && tab.valueFields.length > 0) {
        const pv = buildPivotData(filtered, tab.rowFields, tab.columnFields, tab.valueFields)
        rows = [...pv.rowData, ...pv.pinnedBottom]
      } else {
        rows = tab.rowFields.length > 0
          ? buildGroupedRows(filtered, tab.rowFields, tab.valueFields)
              .map(r => { const clean = { ...r }; delete clean._level; delete clean._isSubtotal; return clean })
          : filtered
      }
      const ws = xlsx.utils.json_to_sheet(rows)
      xlsx.utils.book_append_sheet(wb, ws, tab.label.slice(0, 31))
      hasSheet = true
    }
    if (hasSheet) xlsx.writeFile(wb, 'pivot_report.xlsx')
  }

  // ── DnD helpers ───────────────────────────────────────────────────────────

  const itemDragOver = (e: React.DragEvent, zone: ZoneId, idx: number) => {
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setDropTarget({ zone, idx: e.clientY < rect.top + rect.height / 2 ? idx : idx + 1 })
  }
  const zoneBgDragOver = (e: React.DragEvent, zone: ZoneId, count: number) => {
    e.preventDefault(); setDropTarget({ zone, idx: count })
  }
  const itemDrop = (e: React.DragEvent, zone: ZoneId, idx: number) => {
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    onDrop(zone, e.clientY < rect.top + rect.height / 2 ? idx : idx + 1)
  }
  const dropLineVisible = (zone: ZoneId, idx: number) =>
    !!(dropTarget?.zone === zone && dropTarget.idx === idx && dragInfo)
  const pillCls = (field: string, zone: ZoneId) =>
    'flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-grab select-none group ' +
    'bg-[#ddf4ff] border-[#0969da]/30 text-[#0550ae] ' +
    (dragInfo?.field === field && dragInfo.fromZone === zone ? 'opacity-40' : 'opacity-100')

  // ─── Zone render helper ───────────────────────────────────────────────────

  const renderDropZone = (
    zone: ZoneId,
    label: string,
    sub: string,
    color: string,
    items: string[] | null,
    extra?: React.ReactNode,
  ) => {
    const count = items?.length ?? 0
    const active = !!(dropTarget?.zone === zone && dragInfo)
    return (
      <div
        className="bg-white border-2 rounded-xl p-3 flex flex-col gap-2 transition-colors"
        style={active
          ? { borderColor: color, backgroundColor: `${color}14`, borderStyle: 'solid' }
          : { borderColor: '#d1d9e0', borderStyle: 'dashed' }}
        onDragOver={e => zoneBgDragOver(e, zone, count)}
        onDrop={e => { e.preventDefault(); onDrop(zone, count) }}>
        <div className="text-xs font-semibold text-[#636c76] uppercase tracking-wide border-b border-[#d1d9e0] pb-1.5 flex items-center justify-between">
          <span>{label} <span className="font-normal text-[#8c959f] normal-case">({sub})</span></span>
          {extra}
        </div>
        <div className="flex flex-col gap-1 min-h-[80px]">
          {count === 0 && !dragInfo && (
            <div className="text-xs text-[#8c959f] text-center py-4 pointer-events-none">גרור שדות לכאן</div>
          )}
          {items?.map((f, idx) => (
            <div key={f}>
              {dropLineVisible(zone, idx) && <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />}
              <div draggable className={pillCls(f, zone)}
                onDragStart={e => { e.stopPropagation(); onDragStart(f, zone, idx) }}
                onDragOver={e => itemDragOver(e, zone, idx)}
                onDrop={e => itemDrop(e, zone, idx)} onDragEnd={onDragEnd}>
                <span className="text-[#8c959f] shrink-0">⠿</span>
                <span className="flex-1 truncate">{f}</span>
                <button onClick={() => removeField(zone, idx)}
                  className="opacity-0 group-hover:opacity-100 hover:text-[#cf222e] transition-opacity leading-none text-[10px] px-0.5">✕</button>
              </div>
            </div>
          ))}
          {items && dropLineVisible(zone, items.length) && (
            <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />
          )}
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col bg-[#f6f8fa] p-4 gap-3" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1f2328]">דוחות מתקדמים</h1>
        <div className="flex gap-2">
          <button onClick={() => setSaveModal(true)}
            className="px-3 py-1.5 text-sm bg-[#0969da] text-white rounded-lg hover:bg-[#0550ae] transition-colors">
            שמור דוח
          </button>
          <div className="relative" ref={savedDropdownRef}>
            <button onClick={() => setSavedOpen(o => !o)}
              className="px-3 py-1.5 text-sm border border-[#d1d9e0] bg-white text-[#1f2328] rounded-lg hover:bg-[#f0f3f6] transition-colors flex items-center gap-1">
              דוחות שמורים <span className="text-[10px]">{savedOpen ? '▲' : '▼'}</span>
            </button>
            {savedOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-[#d1d9e0] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {savedReports.length === 0
                  ? <div className="px-3 py-4 text-sm text-[#636c76] text-center">אין דוחות שמורים</div>
                  : savedReports.map(r => (
                    <div key={r._id} onClick={() => loadReport(r)}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-[#f0f3f6] cursor-pointer border-b border-[#d1d9e0] last:border-0 group/item">
                      <div className="min-w-0">
                        <div className="text-sm text-[#1f2328] font-medium truncate">{r.name}</div>
                        <div className="text-xs text-[#8c959f]">{r.tabs.length} טאבים</div>
                      </div>
                      <button onClick={e => deleteReport(r._id, e)}
                        className="opacity-0 group-hover/item:opacity-100 text-[#8c959f] hover:text-[#cf222e] p-1 rounded transition-all shrink-0">✕</button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-end gap-0 border-b border-[#d1d9e0]">
        {tabs.map(tab => (
          <div key={tab.id} onClick={() => setActiveId(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer border-x border-t rounded-t-lg transition-colors select-none whitespace-nowrap ${
              activeId === tab.id
                ? 'bg-white border-[#d1d9e0] text-[#1f2328] font-medium -mb-px z-10 relative'
                : 'bg-[#f0f3f6] border-transparent text-[#636c76] hover:text-[#1f2328] hover:bg-[#eaeef2]'
            }`}>
            {editingTabId === tab.id ? (
              <input autoFocus value={editingLabel} onChange={e => setEditingLabel(e.target.value)}
                onBlur={() => commitLabel(tab.id)}
                onKeyDown={e => { if (e.key === 'Enter') commitLabel(tab.id); if (e.key === 'Escape') setEditingTabId(null) }}
                className="w-20 text-sm border-b border-[#0969da] bg-transparent outline-none"
                onClick={e => e.stopPropagation()} />
            ) : (
              <span onDoubleClick={e => { e.stopPropagation(); setEditingTabId(tab.id); setEditingLabel(tab.label) }}
                title="לחץ פעמיים לשינוי שם">{tab.label}</span>
            )}
            {tabs.length > 1 && (
              <button onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                className="opacity-40 hover:opacity-100 hover:text-[#cf222e] transition-opacity leading-none text-xs">✕</button>
            )}
          </div>
        ))}
        <button onClick={addTab}
          className="px-3 py-2 text-sm text-[#636c76] hover:text-[#0969da] rounded-t-lg transition-colors ml-1">
          + הוסף
        </button>
      </div>

      {/* Active tab */}
      {activeTab && (
        <div className="flex flex-col gap-3">

          {activeTab.source && (
            <SourceFilters
              key={activeTab.id + JSON.stringify(activeTab.source.query)}
              query={activeTab.source.query}
              topics={topicItems}
              mosdot={mosadItems}
              loading={activeTab.loading}
              onApply={q => { const t = { ...activeTab, source: { query: q } }; updTab(t.id, { source: t.source }); void loadSourceTab(t, false) }}
            />
          )}

          {/* Collection bar */}
          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-xl border border-[#d1d9e0] flex-wrap">
            <label className="text-sm font-medium text-[#636c76] shrink-0">קולקשין:</label>
            <select value={activeTab.collection} onChange={e => onCollChange(activeTab.id, e.target.value)}
              disabled={!!activeTab.source}
              className="text-sm border border-[#d1d9e0] rounded-lg px-3 py-1.5 bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] disabled:opacity-70">
              <option value="">בחר...</option>
              {collections.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {activeTab.source && (
              <span className="text-xs text-[#0550ae] bg-[#ddf4ff] px-2 py-1 rounded-full shrink-0">מקור: חיפוש מדוח ריכוז</span>
            )}
            {activeTab.rawData && (
              <span className="text-xs text-[#636c76] bg-[#f0f3f6] px-2 py-1 rounded-full shrink-0">
                {activeTab.rawData.length.toLocaleString()} שורות
              </span>
            )}
            {filteredData !== null && filteredData.length !== activeTab.rawData?.length && (
              <span className="text-xs text-[#9a6700] bg-[#fff8c5] px-2 py-1 rounded-full shrink-0">
                לאחר סינון: {filteredData.length.toLocaleString()}
              </span>
            )}
            {pivotResult && (
              <span className="text-xs text-[#1a7f37] bg-[#dafbe1] px-2 py-1 rounded-full shrink-0">
                Pivot: {pivotResult.rowData.length} שורות × {activeTab.columnFields.length > 0 ? (pivotResult.colDefs.length - activeTab.rowFields.length) : 0} עמודות
              </span>
            )}
            <div className="flex-1" />
            <button onClick={() => setBuilderOpen(o => !o)}
              title={builderOpen ? 'הסתר אזור בנייה' : 'הצג אזור בנייה'}
              className="px-3 py-1.5 text-sm border border-[#d1d9e0] bg-white text-[#636c76] rounded-lg hover:bg-[#f0f3f6] transition-colors flex items-center gap-1 shrink-0">
              {builderOpen ? '▲' : '▼'} מבנה
            </button>
            <button onClick={() => onRun(activeTab.id)} disabled={!activeTab.collection || activeTab.loading}
              className="px-4 py-1.5 text-sm bg-[#1a7f37] text-white rounded-lg hover:bg-[#116329] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0">
              {activeTab.loading ? '⏳ טוען...' : '▶ הרץ'}
            </button>
            <button onClick={exportExcel} disabled={!filteredData?.length}
              className="px-4 py-1.5 text-sm border border-[#d1d9e0] bg-white text-[#1f2328] rounded-lg hover:bg-[#f0f3f6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0">
              יצוא Excel
            </button>
          </div>

          {activeTab.notice && (
            <div className="px-4 py-2 bg-[#fff8c5] border border-[#9a6700] rounded-lg text-xs text-[#9a6700]">{activeTab.notice}</div>
          )}

          {/* Builder zones — collapsible */}
          {!builderOpen && (
            <div className="bg-white px-4 py-2.5 rounded-xl border border-[#d1d9e0] flex items-center gap-4 flex-wrap text-xs text-[#636c76]">
              <span className="font-semibold text-[#1f2328]">מבנה:</span>
              <span>שורות: <span className="text-[#0550ae]">{activeTab.rowFields.length > 0 ? activeTab.rowFields.join(', ') : '—'}</span></span>
              <span>עמודות: <span className="text-[#8250df]">{activeTab.columnFields.length > 0 ? activeTab.columnFields.join(', ') : '—'}</span></span>
              <span>ערכים: <span className="text-[#1a7f37]">{activeTab.valueFields.length > 0 ? activeTab.valueFields.map(v => `${v.field} (${AGG_HEB[v.aggFunc]})`).join(', ') : '—'}</span></span>
              {activeTab.filterFields.length > 0 && (
                <span>סינונים: <span className="text-[#cf222e]">{activeTab.filterFields.length}</span></span>
              )}
            </div>
          )}
          {builderOpen && <div className="grid gap-3" style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1.4fr' }}>

            {/* Available fields */}
            <div className="bg-white border border-[#d1d9e0] rounded-xl p-3 flex flex-col gap-2">
              <div className="text-xs font-semibold text-[#636c76] uppercase tracking-wide">שדות זמינים</div>
              <input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="חפש שדה..."
                className="text-xs px-2 py-1 border border-[#d1d9e0] rounded-lg focus:outline-none focus:border-[#0969da] bg-[#f0f3f6]" />
              <div className="overflow-y-auto flex flex-col gap-1" style={{ maxHeight: 200 }}>
                {!activeTab.collection && <div className="text-xs text-[#8c959f] text-center py-6">בחר קולקשין</div>}
                {activeTab.collection && activeTab.fieldList.length === 0 && <div className="text-xs text-[#8c959f] text-center py-6">טוען שדות...</div>}
                {availableFields.map((f, idx) => (
                  <div key={f} draggable
                    onDragStart={() => onDragStart(f, 'available', idx)} onDragEnd={onDragEnd}
                    className={`flex items-center gap-1 px-2 py-1 rounded bg-[#f0f3f6] border border-[#d1d9e0] text-xs text-[#1f2328] cursor-grab select-none hover:bg-[#eaeef2] transition-colors ${dragInfo?.field === f && dragInfo?.fromZone === 'available' ? 'opacity-40' : ''}`}>
                    <span className="text-[#8c959f]">⠿</span>
                    <span className="truncate">{f}</span>
                  </div>
                ))}
                {availableFields.length === 0 && usedFields.size > 0 && activeTab.fieldList.length > 0 &&
                  <div className="text-xs text-[#8c959f] text-center py-3">כל השדות בשימוש</div>}
              </div>
            </div>

            {/* Rows zone */}
            {renderDropZone('rows', 'שורות', 'קיבוץ', '#0969da', activeTab.rowFields)}

            {/* Columns zone */}
            {renderDropZone('columns', 'עמודות', 'Pivot', '#8250df', activeTab.columnFields)}

            {/* Values zone */}
            <div className="bg-white border-2 rounded-xl p-3 flex flex-col gap-2 transition-colors"
              style={dropTarget?.zone === 'values' && dragInfo
                ? { borderColor: '#1a7f37', backgroundColor: '#dafbe114', borderStyle: 'solid' }
                : { borderColor: '#d1d9e0', borderStyle: 'dashed' }}
              onDragOver={e => zoneBgDragOver(e, 'values', activeTab.valueFields.length)}
              onDrop={e => { e.preventDefault(); onDrop('values', activeTab.valueFields.length) }}>
              <div className="text-xs font-semibold text-[#636c76] uppercase tracking-wide border-b border-[#d1d9e0] pb-1.5">
                ערכים <span className="font-normal text-[#8c959f] normal-case">(אגרגציה)</span>
              </div>
              <div className="flex flex-col gap-1 min-h-[80px]">
                {activeTab.valueFields.length === 0 && !dragInfo && <div className="text-xs text-[#8c959f] text-center py-4 pointer-events-none">גרור שדות לכאן</div>}
                {activeTab.valueFields.map((v, idx) => (
                  <div key={v.field}>
                    {dropLineVisible('values', idx) && <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />}
                    <div draggable className={`${pillCls(v.field, 'values')} flex-wrap`}
                      onDragStart={e => { e.stopPropagation(); onDragStart(v.field, 'values', idx) }}
                      onDragOver={e => itemDragOver(e, 'values', idx)}
                      onDrop={e => itemDrop(e, 'values', idx)} onDragEnd={onDragEnd}>
                      <span className="text-[#8c959f] shrink-0">⠿</span>
                      <span className="truncate max-w-[55px]">{v.field}</span>
                      <select value={v.aggFunc} onChange={e => updateValueAgg(idx, e.target.value as AggFunc)}
                        onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                        className="text-[10px] bg-[#0969da]/10 border border-[#0969da]/20 rounded px-1 text-[#0550ae] cursor-pointer focus:outline-none">
                        {AGG_OPTS.map(a => <option key={a} value={a}>{AGG_HEB[a]}</option>)}
                      </select>
                      <button onClick={() => removeField('values', idx)} className="opacity-0 group-hover:opacity-100 hover:text-[#cf222e] transition-opacity leading-none text-[10px] px-0.5 mr-auto">✕</button>
                    </div>
                  </div>
                ))}
                {dropLineVisible('values', activeTab.valueFields.length) && <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />}
              </div>
            </div>

            {/* Filters zone */}
            <div className="bg-white border-2 rounded-xl p-3 flex flex-col gap-2 transition-colors"
              style={dropTarget?.zone === 'filters' && dragInfo
                ? { borderColor: '#cf222e', backgroundColor: '#ffebe914', borderStyle: 'solid' }
                : { borderColor: '#d1d9e0', borderStyle: 'dashed' }}
              onDragOver={e => zoneBgDragOver(e, 'filters', activeTab.filterFields.length)}
              onDrop={e => { e.preventDefault(); onDrop('filters', activeTab.filterFields.length) }}>

              <div className="flex items-center justify-between border-b border-[#d1d9e0] pb-1.5">
                <div className="text-xs font-semibold text-[#636c76] uppercase tracking-wide">
                  סינונים <span className="font-normal text-[#8c959f] normal-case">(פילטר)</span>
                </div>
                <div className="flex rounded overflow-hidden border border-[#d1d9e0] text-[10px]">
                  {(['AND', 'OR'] as FilterLogic[]).map(l => (
                    <button key={l} onClick={() => updateFilterLogic(l)}
                      className={`px-2 py-0.5 font-semibold transition-colors ${(activeTab.filterLogic ?? 'AND') === l ? 'bg-[#0969da] text-white' : 'bg-white text-[#636c76] hover:bg-[#f0f3f6]'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 min-h-[80px] overflow-y-auto" style={{ maxHeight: 340 }}>
                {activeTab.filterFields.length === 0 && !dragInfo &&
                  <div className="text-xs text-[#8c959f] text-center py-4 pointer-events-none">גרור שדות לכאן</div>}

                {activeTab.filterFields.map((ff, idx) => {
                  const op = ff.op ?? 'contains'
                  const kind = opKind(op)
                  const ftype = activeTab.fieldTypes[ff.field] ?? 'string'
                  const meta = FIELD_META[ftype]
                  const isValValid = (v: string) => kind === 'noValue' || v === '' || meta.validate(v)
                  const isOpen = valDropdown?.filterIdx === idx

                  return (
                    <div key={`${ff.field}-${idx}`}>
                      {dropLineVisible('filters', idx) && <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />}

                      {/* Draggable field pill */}
                      <div draggable className={pillCls(ff.field, 'filters')}
                        onDragStart={e => { e.stopPropagation(); onDragStart(ff.field, 'filters', idx) }}
                        onDragOver={e => itemDragOver(e, 'filters', idx)}
                        onDrop={e => itemDrop(e, 'filters', idx)} onDragEnd={onDragEnd}>
                        <span className="text-[#8c959f] shrink-0">⠿</span>
                        <span className="flex-1 truncate">{ff.field}</span>
                        {ftype !== 'string' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-[#0969da]/10 text-[#0550ae]">
                            {ftype === 'date' ? '📅' : '#'}
                          </span>
                        )}
                        <button onClick={() => removeField('filters', idx)}
                          className="opacity-0 group-hover:opacity-100 hover:text-[#cf222e] transition-opacity leading-none text-[10px] px-0.5">✕</button>
                      </div>

                      {/* Operator select */}
                      <select value={op} onChange={e => updFilter(idx, { op: e.target.value as FilterOp })}
                        className="w-full text-xs px-2 py-1 border border-[#d1d9e0] rounded-lg focus:outline-none focus:border-[#0969da] bg-[#f0f3f6] text-[#1f2328] mt-0.5">
                        {FILTER_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                      </select>

                      {/* Single value input */}
                      {kind === 'single' && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <input value={ff.value} onChange={e => updFilter(idx, { value: e.target.value })}
                            placeholder={meta.placeholder}
                            className={`text-xs px-2 py-1 border rounded-lg focus:outline-none bg-[#f0f3f6] ${isValValid(ff.value) ? 'border-[#d1d9e0] focus:border-[#0969da]' : 'border-[#cf222e]'}`} />
                          {ftype !== 'string' && meta.hint && <span className="text-[10px] text-[#8c959f] px-1">{meta.hint}</span>}
                          {!isValValid(ff.value) && <span className="text-[10px] text-[#cf222e] px-1">{meta.hint}</span>}
                        </div>
                      )}

                      {/* Between inputs */}
                      {kind === 'between' && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="flex items-center gap-1">
                            <input value={ff.value} onChange={e => updFilter(idx, { value: e.target.value })}
                              placeholder={`מ- ${meta.placeholder}`}
                              className={`flex-1 min-w-0 text-xs px-2 py-1 border rounded-lg focus:outline-none bg-[#f0f3f6] ${isValValid(ff.value) ? 'border-[#d1d9e0] focus:border-[#0969da]' : 'border-[#cf222e]'}`} />
                            <span className="text-[10px] text-[#8c959f] shrink-0">—</span>
                            <input value={ff.value2 ?? ''} onChange={e => updFilter(idx, { value2: e.target.value })}
                              placeholder={`עד ${meta.placeholder}`}
                              className={`flex-1 min-w-0 text-xs px-2 py-1 border rounded-lg focus:outline-none bg-[#f0f3f6] ${isValValid(ff.value2 ?? '') ? 'border-[#d1d9e0] focus:border-[#0969da]' : 'border-[#cf222e]'}`} />
                          </div>
                          {ftype !== 'string' && meta.hint && <span className="text-[10px] text-[#8c959f] px-1">{meta.hint}</span>}
                        </div>
                      )}

                      {/* Multi-select */}
                      {kind === 'multi' && (
                        <div className="relative mt-0.5" ref={isOpen ? valDropdownRef : undefined}>
                          {(ff.values ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {(ff.values ?? []).map(v => (
                                <span key={v} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#0969da]/10 text-[#0550ae] text-[10px]">
                                  {v}
                                  <button onClick={() => toggleFilterValue(idx, v)} className="hover:text-[#cf222e] leading-none">×</button>
                                </span>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => setValDropdown(isOpen ? null : { filterIdx: idx, search: '' })}
                            className="w-full text-xs px-2 py-1 border border-[#d1d9e0] rounded-lg bg-[#f0f3f6] text-[#636c76] hover:bg-[#eaeef2] text-right flex items-center justify-between">
                            <span>{(ff.values ?? []).length > 0 ? `${(ff.values ?? []).length} נבחרו` : 'בחר ערכים...'}</span>
                            <span className="text-[10px]">{isOpen ? '▲' : '▼'}</span>
                          </button>
                          {isOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#d1d9e0] rounded-lg shadow-lg z-50" style={{ maxHeight: 220 }}>
                              <div className="p-2 border-b border-[#d1d9e0]">
                                <input autoFocus value={valDropdown.search}
                                  onChange={e => setValDropdown(s => s ? { ...s, search: e.target.value } : null)}
                                  placeholder="חפש ערך..."
                                  className="w-full text-xs px-2 py-1 border border-[#d1d9e0] rounded focus:outline-none focus:border-[#0969da] bg-[#f0f3f6]" />
                              </div>
                              <div className="flex gap-1 px-2 py-1 border-b border-[#d1d9e0]">
                                <button onClick={() => updFilter(idx, { values: distinctValues })}
                                  className="text-[10px] text-[#0969da] hover:underline">הכל</button>
                                <span className="text-[#d1d9e0]">|</span>
                                <button onClick={() => updFilter(idx, { values: [] })}
                                  className="text-[10px] text-[#636c76] hover:underline">נקה</button>
                              </div>
                              <div className="overflow-y-auto" style={{ maxHeight: 150 }}>
                                {!activeTab.rawData
                                  ? <div className="text-xs text-[#8c959f] text-center py-3">הרץ שאילתא תחילה</div>
                                  : distinctValues.length === 0
                                    ? <div className="text-xs text-[#8c959f] text-center py-3">לא נמצאו ערכים</div>
                                    : distinctValues.map(v => {
                                      const checked = (ff.values ?? []).includes(v)
                                      return (
                                        <label key={v} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f0f3f6] cursor-pointer">
                                          <input type="checkbox" checked={checked}
                                            onChange={() => toggleFilterValue(idx, v)}
                                            className="accent-[#0969da]" />
                                          <span className="text-xs text-[#1f2328] truncate">{v}</span>
                                        </label>
                                      )
                                    })
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {dropLineVisible('filters', activeTab.filterFields.length) && (
                  <div className="h-0.5 bg-[#0969da] rounded mx-1 my-0.5 pointer-events-none" />
                )}
              </div>
            </div>
          </div>}

          {/* Grid */}
          <div
            className="rounded-xl border border-[#d1d9e0] overflow-hidden ag-theme-alpine"
            style={{
              height: builderOpen ? 'calc(100vh - 545px)' : 'calc(100vh - 275px)',
              minHeight: '300px',
            }}>
            {gridRowData === null ? (
              <div className="flex flex-col items-center justify-center h-full bg-white text-[#636c76]">
                <div className="text-5xl mb-3 opacity-30">📊</div>
                <div className="text-base font-medium">בחר קולקשין ולחץ הרץ</div>
                <div className="text-sm mt-1 text-[#8c959f]">לאחר מכן גרור שדות לאזורי שורות, עמודות וערכים</div>
              </div>
            ) : (
              <AgGridReact
                key={`${activeId}-${pivotResult ? 'pv' : 'nm'}-${activeTab?.rowFields.join(',')}-${activeTab?.columnFields.join(',')}-${activeTab?.valueFields.map(v=>v.field).join(',')}`}
                rowData={visibleGroupData ?? gridRowData}
                columnDefs={columnDefs}
                pinnedBottomRowData={pinnedBottom}
                animateRows suppressScrollOnNewData enableRtl theme="legacy"
                defaultColDef={{ resizable: true, sortable: true }}
                context={{ toggleGroup }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getRowStyle={(params: any): any => {
                  if (params.node.rowPinned === 'bottom')
                    return { background: '#f0f3f6', fontWeight: '700', borderTop: '2px solid #d1d9e0' }
                  if (params.data?._isSubtotal)
                    return { background: '#eaf1fb', fontWeight: '700' }
                  return undefined
                }}
                onGridReady={(e: GridReadyEvent) => { gridApis.current.set(activeId, e.api); e.api.sizeColumnsToFit() }}
              />
            )}
          </div>

          {/* פילוח לפי חודשי תחולה */}
          {tachulaSummary && (
            <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-[#1f2328]">
                  פילוח לפי חודשי תחולה — {tachulaSummary.vf ? `${AGG_HEB[tachulaSummary.vf.aggFunc]}(${tachulaSummary.vf.field})` : 'מספר שורות'}
                </h3>
                <span className="text-xs text-[#636c76]">מה שמוצג בפיווט כרגע, כולל המסננים</span>
              </div>
              <div className="px-4 pt-3">
                <TachulaChart points={tachulaSummary.rows.map(r => ({ month: r.month, value: r.value }))} />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f6f8fa] border-y border-[#d1d9e0] text-right sticky top-0">
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">חודש תחולה</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">סכום</th>
                      <th className="px-4 py-2 text-xs font-medium text-[#636c76]">שורות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tachulaSummary.rows.map(r => (
                      <tr key={r.month} className="border-b border-[#f0f3f6]">
                        <td className="px-4 py-1.5 text-[#1f2328]">{r.month}</td>
                        <td className={`px-4 py-1.5 font-mono ${r.value < 0 ? 'text-[#cf222e]' : 'text-[#1f2328]'}`}>{fmtNum(r.value)}</td>
                        <td className="px-4 py-1.5 text-[#636c76]">{r.count.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#f6f8fa] font-bold">
                      <td className="px-4 py-2 text-[#1f2328]">סה&quot;כ</td>
                      <td className="px-4 py-2 font-mono">{fmtNum(tachulaSummary.total)}</td>
                      <td className="px-4 py-2 text-[#636c76]">{tachulaSummary.totalCount.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" dir="rtl">
          <div className="bg-white rounded-xl border border-[#d1d9e0] p-6 w-80 shadow-xl">
            <h2 className="text-base font-bold text-[#1f2328] mb-4">שמור דוח</h2>
            <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveReport()}
              placeholder="שם הדוח..."
              className="w-full px-3 py-2 border border-[#d1d9e0] rounded-lg text-sm focus:outline-none focus:border-[#0969da] mb-4" />
            <div className="flex gap-2">
              <button onClick={saveReport} disabled={!saveName.trim()}
                className="px-4 py-2 text-sm bg-[#0969da] text-white rounded-lg hover:bg-[#0550ae] disabled:opacity-50 transition-colors">שמור</button>
              <button onClick={() => { setSaveModal(false); setSaveName('') }}
                className="px-4 py-2 text-sm border border-[#d1d9e0] rounded-lg hover:bg-[#f0f3f6] transition-colors">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
