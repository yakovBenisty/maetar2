'use client';

import { useEffect, useState, useCallback } from 'react';

export type ExpenseKind = 'operator_expense' | 'rashut_expense' | 'reservation' | 'parent_payment';

interface MappingDoc {
  _id: string;
  kind: ExpenseKind;
  label: string;
  date_column: string;
  amount_column: string;
  description_column: string;
  category_column: string;
  key_columns: string[];
}

interface ExpenseEntry {
  _id: string;
  date: string | null;
  amount: number;
  description: string;
  category: string;
  source: 'file' | 'manual';
  source_file: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

interface Props {
  projectId: string;
  kind: ExpenseKind;
  label: string;
  canEdit: boolean;
  locked: boolean;
}

const NONE = '__none__';

export default function ExpenseUpload({ projectId, kind, label, canEdit, locked }: Props) {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [mappings, setMappings] = useState<MappingDoc[]>([]);
  const [selectedMappingId, setSelectedMappingId] = useState('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState('');
  const [dateCol, setDateCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [descCol, setDescCol] = useState('');
  const [catCol, setCatCol] = useState('');
  const [keyCols, setKeyCols] = useState<string[]>([]);
  const [mappingLabel, setMappingLabel] = useState('');
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip');
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualCat, setManualCat] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses?project_id=${projectId}&kind=${kind}`);
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [projectId, kind]);

  const loadMappings = useCallback(async () => {
    const res = await fetch(`/api/expenses/mappings?kind=${kind}`);
    const data = await res.json();
    setMappings(data.mappings ?? []);
  }, [kind]);

  useEffect(() => {
    loadEntries();
    loadMappings();
  }, [loadEntries, loadMappings]);

  function applyMapping(m: MappingDoc) {
    setSelectedMappingId(m._id);
    setDateCol(m.date_column || '');
    setAmountCol(m.amount_column || '');
    setDescCol(m.description_column || '');
    setCatCol(m.category_column || '');
    setKeyCols(m.key_columns || []);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setSuccess('');

    const XLSX = await import('xlsx');
    let rows: Record<string, unknown>[];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text();
      const wb = XLSX.read(text, { type: 'string' });
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    } else {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    }

    setParsedRows(rows);
    setHeaders(rows.length > 0 ? Object.keys(rows[0]) : []);
  }

  function toggleKeyCol(col: string) {
    setKeyCols((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  }

  async function handleUpload() {
    if (!amountCol || keyCols.length === 0) {
      setError('יש לבחור לפחות עמודת סכום ועמודות מפתח לזיהוי כפילויות');
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      if (saveTemplate && mappingLabel) {
        await fetch('/api/expenses/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            _id: selectedMappingId || undefined,
            kind,
            label: mappingLabel,
            date_column: dateCol,
            amount_column: amountCol,
            description_column: descCol,
            category_column: catCol,
            key_columns: keyCols,
          }),
        });
        loadMappings();
      }

      const rows = parsedRows.map((row) => ({
        row_key: keyCols.map((c) => String(row[c] ?? '')).join('|'),
        date: dateCol ? String(row[dateCol] ?? '') || null : null,
        amount: Number(row[amountCol]) || 0,
        description: descCol ? String(row[descCol] ?? '') : '',
        category: catCol ? String(row[catCol] ?? '') : '',
        raw: row,
      }));

      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, kind, source: 'file', strategy, mapping_id: selectedMappingId || undefined, mapping_label: mappingLabel || undefined, source_file: fileName, rows }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה בטעינה');

      const imported = data.summary.filter((s: { status: string }) => s.status === 'imported').length;
      const skipped = data.summary.filter((s: { status: string }) => s.status === 'skipped').length;
      const replaced = data.summary.filter((s: { status: string }) => s.status === 'replaced').length;
      setSuccess(`נטען: ${imported} שורות חדשות, ${replaced} הוחלפו, ${skipped} דולגו (כפילויות)`);
      setParsedRows([]);
      setHeaders([]);
      setFileName('');
      loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setUploading(false);
    }
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!manualAmount) return;
    setError('');
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          kind,
          source: 'manual',
          rows: [{
            row_key: `manual_${Date.now()}`,
            date: manualDate || null,
            amount: Number(manualAmount) || 0,
            description: manualDesc,
            category: manualCat,
            raw: {},
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה בשמירה');
      setManualDate(''); setManualAmount(''); setManualDesc(''); setManualCat(''); setManualOpen(false);
      loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('למחוק שורה זו?')) return;
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'שגיאה במחיקה');
      loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    }
  }

  const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div className="bg-white border border-[#d1d9e0] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#1f2328]">{label}</h3>
        <span className="text-sm font-mono text-[#1f2328]">
          סה&quot;כ: {total.toLocaleString('he-IL', { minimumFractionDigits: 2 })} ₪
        </span>
      </div>

      {error && <div className="mb-3 p-2 bg-[#fff0f0] border border-[#ffb3b3] rounded-lg text-xs text-[#cf222e]">{error}</div>}
      {success && <div className="mb-3 p-2 bg-[#f0fff4] border border-[#96d6a0] rounded-lg text-xs text-[#1a7f37]">{success}</div>}

      {canEdit && !locked && (
        <div className="mb-4 space-y-3 border border-[#d1d9e0] rounded-lg p-3 bg-[#f6f8fa]">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="px-3 py-1.5 bg-white border border-[#d1d9e0] text-[#1f2328] text-xs font-medium rounded-lg cursor-pointer hover:bg-[#f0f3f6]">
              📄 בחר קובץ Excel/CSV
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
            </label>
            {fileName && <span className="text-xs text-[#636c76]">{fileName} ({parsedRows.length} שורות)</span>}
            <button onClick={() => setManualOpen((v) => !v)} className="text-xs text-[#0969da] hover:underline mr-auto">
              + הזנה ידנית (שורה בודדת)
            </button>
          </div>

          {manualOpen && (
            <form onSubmit={handleManualAdd} className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#d1d9e0]">
              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="border border-[#d1d9e0] rounded px-2 py-1 text-xs" placeholder="תאריך" />
              <input required type="number" step="0.01" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} className="border border-[#d1d9e0] rounded px-2 py-1 text-xs" placeholder="סכום *" />
              <input value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} className="border border-[#d1d9e0] rounded px-2 py-1 text-xs" placeholder="תיאור" />
              <input value={manualCat} onChange={(e) => setManualCat(e.target.value)} className="border border-[#d1d9e0] rounded px-2 py-1 text-xs" placeholder="קטגוריה" />
              <button type="submit" className="col-span-2 sm:col-span-4 px-3 py-1.5 bg-[#1f883d] text-white text-xs font-medium rounded-lg hover:bg-[#1a7f37]">הוסף שורה</button>
            </form>
          )}

          {headers.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#d1d9e0]">
              {mappings.length > 0 && (
                <div>
                  <label className="block text-xs text-[#636c76] mb-1">תבנית מיפוי שמורה</label>
                  <select
                    value={selectedMappingId}
                    onChange={(e) => {
                      const m = mappings.find((x) => x._id === e.target.value);
                      if (m) applyMapping(m);
                      else setSelectedMappingId('');
                    }}
                    className="w-full border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value="">— בחר תבנית (או הגדר חדש למטה) —</option>
                    {mappings.map((m) => <option key={m._id} value={m._id}>{m.label}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs text-[#636c76] mb-1">עמודת תאריך</label>
                  <select value={dateCol} onChange={(e) => setDateCol(e.target.value === NONE ? '' : e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white">
                    <option value={NONE}>— ללא —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#636c76] mb-1">עמודת סכום *</label>
                  <select value={amountCol} onChange={(e) => setAmountCol(e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white">
                    <option value="">— בחר —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#636c76] mb-1">עמודת תיאור</label>
                  <select value={descCol} onChange={(e) => setDescCol(e.target.value === NONE ? '' : e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white">
                    <option value={NONE}>— ללא —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#636c76] mb-1">עמודת קטגוריה</label>
                  <select value={catCol} onChange={(e) => setCatCol(e.target.value === NONE ? '' : e.target.value)} className="w-full border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white">
                    <option value={NONE}>— ללא —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#636c76] mb-1">עמודות מפתח לזיהוי כפילויות * (בחר אחת או יותר)</label>
                <div className="flex flex-wrap gap-2">
                  {headers.map((h) => (
                    <label key={h} className={`text-xs px-2 py-1 rounded border cursor-pointer ${keyCols.includes(h) ? 'bg-[#ddf4ff] border-[#0969da] text-[#0969da]' : 'bg-white border-[#d1d9e0] text-[#636c76]'}`}>
                      <input type="checkbox" checked={keyCols.includes(h)} onChange={() => toggleKeyCol(h)} className="hidden" />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1 text-xs text-[#636c76]">
                  <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
                  שמור כתבנית לשימוש חוזר:
                </label>
                {saveTemplate && (
                  <input value={mappingLabel} onChange={(e) => setMappingLabel(e.target.value)} placeholder="שם התבנית" className="border border-[#d1d9e0] rounded px-2 py-1 text-xs" />
                )}
                <div className="flex items-center gap-2 mr-auto">
                  <label className="text-xs text-[#636c76]">כפילות:</label>
                  <select value={strategy} onChange={(e) => setStrategy(e.target.value as 'skip' | 'replace')} className="border border-[#d1d9e0] rounded px-2 py-1 text-xs bg-white">
                    <option value="skip">דלג</option>
                    <option value="replace">החלף</option>
                  </select>
                </div>
                <button onClick={handleUpload} disabled={uploading} className="px-4 py-1.5 bg-[#1f883d] text-white text-xs font-medium rounded-lg hover:bg-[#1a7f37] disabled:opacity-60">
                  {uploading ? 'מעלה...' : `טען ${parsedRows.length} שורות`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {locked && <p className="text-xs text-[#9a6700] mb-3">הפרויקט נעול — לא ניתן לטעון נתונים חדשים.</p>}

      <div className="border border-[#d1d9e0] rounded-lg overflow-hidden max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-xs text-[#636c76]">טוען...</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#636c76]">אין רשומות עדיין</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#f6f8fa]">
              <tr className="border-b border-[#d1d9e0]">
                <th className="px-3 py-2 text-right font-medium text-[#636c76]">תאריך</th>
                <th className="px-3 py-2 text-right font-medium text-[#636c76]">סכום</th>
                <th className="px-3 py-2 text-right font-medium text-[#636c76]">תיאור</th>
                <th className="px-3 py-2 text-right font-medium text-[#636c76]">קטגוריה</th>
                <th className="px-3 py-2 text-right font-medium text-[#636c76]">מקור</th>
                {canEdit && !locked && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-b border-[#f0f3f6] hover:bg-[#f6f8fa]">
                  <td className="px-3 py-1.5 text-[#636c76]">{e.date ? new Date(e.date).toLocaleDateString('he-IL') : ''}</td>
                  <td className="px-3 py-1.5 font-mono text-[#1f2328]">{Number(e.amount).toLocaleString('he-IL')}</td>
                  <td className="px-3 py-1.5 text-[#1f2328]">{e.description}</td>
                  <td className="px-3 py-1.5 text-[#636c76]">{e.category}</td>
                  <td className="px-3 py-1.5 text-[#636c76]">{e.source === 'manual' ? 'ידני' : e.source_file ?? 'קובץ'}</td>
                  {canEdit && !locked && (
                    <td className="px-3 py-1.5">
                      <button onClick={() => handleDeleteEntry(e._id)} className="text-[#cf222e] hover:underline">מחק</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
