'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'

// ─── Smart default columns for רדוח ריכוז ──────────────────────────────────────
// לכל עמודת ברירת מחדל — רשימת שמות שדה חלופיים לפי סדר עדיפות, מבוסס על
// בדיקה בפועל של שמות השדות האמיתיים בכל קולקשן ב-Mongo.

export const RIKHUZ_DEFAULT_ALIAS_GROUPS: string[][] = [
  ['תאור_נושא', 'שם_נושא', 'נושא', 'תאור_תת_נושא'],
  ['קוד_נושא'],
  ['חודש_תחולה'],
  ['חודש_חישוב', 'calc_month'],
  ['סמל_מוסד', 'סמל_מוטב', 'סמל_ישוב'],
  ['שם_מוסד', 'שם_מוטב', 'שם_ישוב'],
  ['סכום_מחושב', 'סך_הכל_מגיע', 'סכום_חובה'],
  ['הפרש_לתשלום', 'הפרש_מחושב'],
]

export function pickDefaultVisibleFields(allFields: string[], aliasGroups?: string[][]): Set<string> {
  if (!aliasGroups) return new Set(allFields)
  const picked = new Set<string>()
  for (const group of aliasGroups) {
    const match = group.find(f => allFields.includes(f))
    if (match) picked.add(match)
  }
  // אם אף אחת מהעמודות המבוקשות לא נמצאה בקולקשן הזה — הצג הכל במקום גריד ריק
  return picked.size > 0 ? picked : new Set(allFields)
}

// ─── Hook: which fields are currently visible ──────────────────────────────────

export function useColumnVisibility(allFields: string[], aliasGroups?: string[][]) {
  const [custom, setCustom] = useState<Set<string> | null>(null)

  const defaultVisible = useMemo(
    () => pickDefaultVisibleFields(allFields, aliasGroups),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFields.join('|'), aliasGroups]
  )

  // כשמחליפים טאב/קולקשן (ומתחלף סט השדות) — חוזרים לדיפולט של הטאב החדש
  useEffect(() => { setCustom(null) }, [allFields.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = custom ?? defaultVisible

  const toggle = useCallback((field: string) => {
    setCustom(prev => {
      const base = new Set(prev ?? defaultVisible)
      if (base.has(field)) base.delete(field)
      else base.add(field)
      return base
    })
  }, [defaultVisible])

  const showAll = useCallback(() => setCustom(new Set(allFields)), [allFields])
  const resetToDefault = useCallback(() => setCustom(null), [])

  return { visible, toggle, showAll, resetToDefault, isCustomized: custom !== null }
}

// ─── Column picker dropdown button ─────────────────────────────────────────────

interface ColumnPickerButtonProps {
  columns: { field: string; headerName?: string }[]
  visible: Set<string>
  onToggle: (field: string) => void
  onShowAll: () => void
  onReset: () => void
}

export function ColumnPickerButton({ columns, visible, onToggle, onShowAll, onReset }: ColumnPickerButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (columns.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-3 py-1.5 text-xs border border-[#d1d9e0] bg-white rounded-lg hover:bg-[#f0f3f6] flex items-center gap-1 transition-colors"
      >
        ⚙️ עמודות
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-[#d1d9e0] rounded-xl shadow-lg" style={{ minWidth: 220 }}>
          <div className="flex gap-1 px-2 py-1.5 border-b border-[#d1d9e0]">
            <button onClick={onShowAll} className="text-[11px] text-[#0969da] hover:underline">הצג הכל</button>
            <span className="text-[#d1d9e0]">|</span>
            <button onClick={onReset} className="text-[11px] text-[#636c76] hover:underline">ברירת מחדל</button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {columns.map(c => (
              <label key={c.field} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f0f3f6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={visible.has(c.field)}
                  onChange={() => onToggle(c.field)}
                  className="accent-[#0969da]"
                />
                <span className="text-xs text-[#1f2328] truncate">{c.headerName ?? c.field}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
