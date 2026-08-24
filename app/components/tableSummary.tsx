'use client'

import { useCallback, useMemo, useState } from 'react'
import type { ColDef } from 'ag-grid-community'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AggType = 'sum' | 'avg' | 'max' | 'min' | 'count' | 'distinct'

export const AGG_LABELS: Record<AggType, string> = {
  sum: 'סה"כ',
  avg: 'ממוצע',
  max: 'מקסימום',
  min: 'מינימום',
  count: 'ספירה',
  distinct: 'ספירת ייחודיים',
}

export const NUMERIC_AGGS: AggType[] = ['sum', 'avg', 'max', 'min', 'count', 'distinct']
export const TEXT_AGGS: AggType[] = ['count', 'distinct']

// עמודות שברירת המחדל של הבורר העליון תעדיף — לפי סדר עדיפות
const DEFAULT_TOP_FIELDS = ['הפרש_מחושב', 'הפרש_לתשלום', 'הפרש']

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isNumericField(rows: Record<string, unknown>[], field: string): boolean {
  for (const r of rows) {
    const v = r[field]
    if (v == null || v === '') continue
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  }
  return false
}

export function aggOptionsForField(rows: Record<string, unknown>[], field: string): AggType[] {
  return isNumericField(rows, field) ? NUMERIC_AGGS : TEXT_AGGS
}

export function defaultAggForField(rows: Record<string, unknown>[], field: string): AggType {
  return isNumericField(rows, field) ? 'sum' : 'count'
}

export function computeAgg(rows: Record<string, unknown>[], field: string, agg: AggType): number {
  if (agg === 'count') return rows.length
  if (agg === 'distinct') {
    const set = new Set(rows.map(r => r[field]).filter(v => v != null && v !== ''))
    return set.size
  }
  const nums = rows
    .map(r => r[field])
    .filter(v => v != null && v !== '')
    .map(v => Number(v))
    .filter(n => !isNaN(n))
  if (nums.length === 0) return 0
  switch (agg) {
    case 'sum': return nums.reduce((a, b) => a + b, 0)
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length
    case 'max': return Math.max(...nums)
    case 'min': return Math.min(...nums)
  }
  return 0
}

export function formatAggValue(value: number, agg: AggType): string {
  if (agg === 'count' || agg === 'distinct') return value.toLocaleString('he-IL')
  return value.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// ─── Hook: per-column aggregation-type selection ───────────────────────────────

export function useColumnAggTypes(sampleRows: Record<string, unknown>[]) {
  const [overrides, setOverrides] = useState<Record<string, AggType>>({})

  const getAggType = useCallback(
    (field: string): AggType => overrides[field] ?? defaultAggForField(sampleRows, field),
    [overrides, sampleRows]
  )

  const setAggType = useCallback((field: string, agg: AggType) => {
    setOverrides(prev => ({ ...prev, [field]: agg }))
  }, [])

  return { getAggType, setAggType, overrides }
}

// ─── Footer cell (rendered only in the pinned bottom row) ─────────────────────

interface FooterCellParams {
  value?: number
  field: string
  aggType: AggType
  aggOptions: AggType[]
  onAggTypeChange: (field: string, next: AggType) => void
}

function FooterCell(props: FooterCellParams) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 w-full py-1" dir="rtl">
      <span className="font-bold text-[12px] leading-none">
        {formatAggValue(props.value ?? 0, props.aggType)}
      </span>
      <select
        value={props.aggType}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onChange={e => props.onAggTypeChange(props.field, e.target.value as AggType)}
        className="text-[9px] leading-none border border-[#b6d4fb] rounded bg-white px-0.5 py-0 text-[#0550ae] cursor-pointer"
        title="סוג סיכום לעמודה"
      >
        {props.aggOptions.map(a => (
          <option key={a} value={a}>{AGG_LABELS[a]}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Wire a ColDef list up with footer cells + build the pinned bottom row ─────

export function withFooterCells<T = Record<string, unknown>>(
  colDefs: ColDef<T>[],
  sampleRows: Record<string, unknown>[],
  getAggType: (field: string) => AggType,
  setAggType: (field: string, agg: AggType) => void
): ColDef<T>[] {
  return colDefs.map(cd => {
    const field = cd.field as string | undefined
    if (!field) return cd
    const aggOptions = aggOptionsForField(sampleRows, field)
    return {
      ...cd,
      cellRendererSelector: (params: { node: { rowPinned?: string | null }; value?: unknown }) => {
        if (params.node.rowPinned !== 'bottom') return undefined
        return {
          component: FooterCell,
          params: {
            field,
            aggType: getAggType(field),
            aggOptions,
            onAggTypeChange: setAggType,
          },
        }
      },
    } as ColDef<T>
  })
}

export function buildFooterRow(
  rows: Record<string, unknown>[],
  fields: string[],
  getAggType: (field: string) => AggType
): Record<string, unknown>[] {
  if (rows.length === 0) return []
  const row: Record<string, unknown> = {}
  for (const f of fields) {
    row[f] = computeAgg(rows, f, getAggType(f))
  }
  return [row]
}

// ─── Top summary bar — one value, unaffected by grid filters ──────────────────

interface TableSummaryBarProps {
  rows: Record<string, unknown>[]
  columns: { field: string; headerName?: string }[]
  recordLabel?: string
}

export function TableSummaryBar({ rows, columns, recordLabel = 'רשומות' }: TableSummaryBarProps) {
  const defaultField = useMemo(() => {
    const preferred = DEFAULT_TOP_FIELDS.find(f => columns.some(c => c.field === f))
    return preferred ?? columns[0]?.field ?? ''
  }, [columns])

  const [field, setField] = useState(defaultField)
  const [agg, setAgg] = useState<AggType>('sum')

  const activeField = columns.some(c => c.field === field) ? field : defaultField
  const aggOptions = useMemo(() => aggOptionsForField(rows, activeField), [rows, activeField])
  const activeAgg = aggOptions.includes(agg) ? agg : aggOptions[0]

  const value = useMemo(
    () => (activeField ? computeAgg(rows, activeField, activeAgg) : 0),
    [rows, activeField, activeAgg]
  )

  if (columns.length === 0) return null

  return (
    <div className="px-4 py-3 bg-[#f0f6ff] border-b border-[#b6d4fb] flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-bold text-[#0969da] shrink-0">
        סה&quot;כ כולל — {rows.length.toLocaleString('he-IL')} {recordLabel}
      </span>
      <span className="text-sm font-bold text-[#1f2328] px-2">
        {activeField ? formatAggValue(value, activeAgg) : ''}
      </span>
      <select
        value={activeField}
        onChange={e => setField(e.target.value)}
        className="text-xs border border-[#b6d4fb] rounded-lg bg-white px-2 py-1 text-[#1f2328]"
      >
        {columns.map(c => (
          <option key={c.field} value={c.field}>{c.headerName ?? c.field}</option>
        ))}
      </select>
      <select
        value={activeAgg}
        onChange={e => setAgg(e.target.value as AggType)}
        className="text-xs border border-[#b6d4fb] rounded-lg bg-white px-2 py-1 text-[#1f2328]"
      >
        {aggOptions.map(a => (
          <option key={a} value={a}>{AGG_LABELS[a]}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Pinned-bottom-row style, for consistent styling everywhere ───────────────

export const FOOTER_ROW_STYLE = { background: '#e8f3ff', fontWeight: '700', borderTop: '2px solid #b6d4fb', color: '#0550ae' } as const

export function footerRowStyle(p: { node: { rowPinned?: string | null } }) {
  return p.node.rowPinned === 'bottom' ? FOOTER_ROW_STYLE : undefined
}

export function footerRowHeight(p: { node: { rowPinned?: string | null } }): number | undefined {
  return p.node.rowPinned === 'bottom' ? 44 : undefined
}
