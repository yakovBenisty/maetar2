'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export interface MultiSelectItem { value: string; label: string }

interface MultiSelectProps {
  label: string
  items: MultiSelectItem[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  allLabel?: string
  searchPlaceholder?: string
}

/** רשימה נפתחת עם חיפוש ובחירה מרובה. "הכל" = כל הפריטים נבחרו. משמשת בדוח ריכוז ובדוח פיווט. */
export default function MultiSelect({ label, items, selected, onChange, placeholder, allLabel = 'הכל', searchPlaceholder = 'חפש...' }: MultiSelectProps) {
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
