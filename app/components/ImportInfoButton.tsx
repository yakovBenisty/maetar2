'use client';

import { useEffect, useRef, useState } from 'react';

interface Column {
  name: string;
  aliases?: string[];
  required?: boolean;
  note?: string;
}

interface ImportInfoButtonProps {
  columns: Column[];
  title?: string;
  extra?: string;
}

export default function ImportInfoButton({ columns, title = 'דרישות ייבוא', extra }: ImportInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="מידע על דרישות הייבוא"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#d1d9e0] bg-[#f0f3f6] hover:bg-[#e2e7ec] text-[#0969da] text-sm font-bold transition-colors"
      >
        ?
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-80 bg-white border border-[#d1d9e0] rounded-xl shadow-2xl p-4">
          <p className="text-sm font-semibold text-[#1f2328] mb-3 border-b border-[#d1d9e0] pb-2">{title}</p>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[#636c76]">
                <th className="text-right pb-1 pr-1 font-medium">שם עמודה</th>
                <th className="text-right pb-1 pr-1 font-medium">שמות נוספים</th>
                <th className="text-right pb-1 font-medium">חובה</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.name} className="border-t border-[#f0f3f6]">
                  <td className="py-1 pr-1 text-[#1f2328] font-mono font-medium">{col.name}</td>
                  <td className="py-1 pr-1 text-[#636c76]">{col.aliases?.join(', ') ?? '—'}</td>
                  <td className="py-1 text-center">
                    {col.required
                      ? <span className="text-[#cf222e] font-bold">✓</span>
                      : <span className="text-[#8c959f]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {columns.some((c) => c.note) && (
            <div className="mt-3 space-y-1">
              {columns.filter((c) => c.note).map((c) => (
                <p key={c.name} className="text-xs text-[#636c76]">
                  <span className="font-mono text-[#1f2328]">{c.name}</span>: {c.note}
                </p>
              ))}
            </div>
          )}

          {extra && (
            <p className="mt-3 text-xs text-[#636c76] border-t border-[#d1d9e0] pt-2">{extra}</p>
          )}
        </div>
      )}
    </div>
  );
}
