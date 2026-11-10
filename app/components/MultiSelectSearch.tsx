'use client';

import { useState, useRef, useEffect } from 'react';

export interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/** תיבת בחירה מרובה עם חיפוש — לבחירת נושאים/קודים מתוך רשימה קיימת. */
export default function MultiSelectSearch({ options, selected, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = options.filter(
    (o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.value.toLowerCase().includes(query.toLowerCase())
  );

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  const selectedOptions = selected.map((v) => options.find((o) => o.value === v) ?? { value: v, label: v });

  return (
    <div ref={containerRef} className="relative">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedOptions.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#ddf4ff] text-[#0969da] border border-[#0969da]">
              {o.label}
              <button type="button" onClick={() => remove(o.value)} className="hover:text-[#cf222e]">✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'חפש...'}
        className="w-full border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0969da]"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-[#d1d9e0] rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#636c76]">אין תוצאות</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                onClick={() => toggle(o.value)}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-[#f6f8fa] flex items-center justify-between ${selected.includes(o.value) ? 'bg-[#ddf4ff]' : ''}`}
              >
                <span>{o.label}</span>
                {selected.includes(o.value) && <span className="text-[#0969da]">✓</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
