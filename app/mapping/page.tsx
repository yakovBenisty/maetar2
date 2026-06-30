'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { COLLECTION_DEFAULTS } from '@/lib/collection-defaults';

/* ─── Types ─────────────────────────────────────────────── */

interface TopicMapping {
  code: string;
  name: string | null;
  table_type: string | null;
  direction: string | null;
  in_noseme: boolean;
  collections: string[];
}

interface TopicConfig {
  code: string;
  check_collection: string;
  group_by: string[];
  subtopic_fields: string[];
  quantity_fields: string[];
  compare_fields: string[];
  auto_filled: boolean;
  exclude_from_audit: boolean;
}

/* ─── Helpers ────────────────────────────────────────────── */

const SKIP_COLLECTIONS = new Set([
  'NOSEME', 'MOSDOT', 'COMMANDS', 'runs', 'run_logs', 'run_results', 'run_hashvha', 'USERS', 'TOPIC_CONFIG',
]);
const CHESHBONIT = 'CHESHBONIT';

const COL_LABEL: Record<string, string> = {
  CHESHBONIT:  'חשבוניות',
  MUCARIM:     'מוכרים',
  SHARATIM:    'שרתים',
  YADANIIM:    'ידניים',
  GY003:       'ג"י 003',
  GY019:       "ג\"י 019",
  GY033:       "ג\"י 033",
  HASAOT:      'הסעות',
  HASNET:      'השנת',
  HASMASLULIM: 'מסלולים',
  MISROT:      'משרות',
  MISROTGY:    "משרות ג'י",
  MOADON:      'מועדון',
  MUTAVIM:     'מוטבים',
  SHEFI:       'שפי',
};

function colLabel(c: string) { return COL_LABEL[c] ?? c; }

/* ─── Tag badge ──────────────────────────────────────────── */

function Badge({ label, variant = 'default' }: { label: string; variant?: 'default' | 'blue' | 'green' | 'gray' }) {
  const cls = {
    default: 'bg-[#ddf4ff] text-[#0550ae] border-[#b6e0fe]',
    blue:    'bg-[#ddf4ff] text-[#0550ae] border-[#b6e0fe]',
    green:   'bg-[#dafbe1] text-[#116329] border-[#aef0c5]',
    gray:    'bg-[#f0f3f6] text-[#636c76] border-[#d1d9e0]',
  }[variant];
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs rounded border font-mono ${cls}`}>
      {label}
    </span>
  );
}

/* ─── FieldCheckboxList ──────────────────────────────────── */

function FieldCheckboxList({
  label,
  fields,
  selected,
  onChange,
  loading,
}: {
  label: string;
  fields: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading: boolean;
}) {
  const toggle = (f: string) =>
    onChange(selected.includes(f) ? selected.filter((x) => x !== f) : [...selected, f]);

  return (
    <div>
      <p className="text-xs font-semibold text-[#636c76] uppercase tracking-wide mb-2">{label}</p>
      {loading ? (
        <p className="text-xs text-[#636c76]">טוען שדות...</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-[#636c76]">אין שדות זמינים</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f} className="flex items-center gap-2 text-xs cursor-pointer select-none hover:bg-[#f0f3f6] px-1.5 py-1 rounded">
              <input
                type="checkbox"
                checked={selected.includes(f)}
                onChange={() => toggle(f)}
                className="accent-[#0969da]"
              />
              <span className="font-mono text-[#1f2328]">{f}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CompareFieldLevelList ──────────────────────────────── */
/* Shows each numeric field with a checkbox + level toggle (כמות / פירוט) */

function CompareFieldLevelList({
  fields,
  selected,      // all selected compare fields
  quantityFields, // subset that are "quantity" (level 1)
  onToggleField,
  onToggleLevel,
  loading,
}: {
  fields: string[];
  selected: string[];
  quantityFields: string[];
  onToggleField: (f: string) => void;
  onToggleLevel: (f: string, isQty: boolean) => void;
  loading: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#636c76] uppercase tracking-wide mb-1">שדות השוואה</p>
      <p className="text-[10px] text-[#636c76] mb-2">כמות = מוצג ברמה 1 (מוסד) | פירוט = מוצג ברמה 2 (הרחבה)</p>
      {loading ? (
        <p className="text-xs text-[#636c76]">טוען שדות...</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-[#636c76]">אין שדות זמינים</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto pr-1">
          {fields.map((f) => {
            const isSelected = selected.includes(f);
            const isQty      = quantityFields.includes(f);
            return (
              <div key={f} className="flex items-center gap-2 text-xs px-1.5 py-1 rounded hover:bg-[#f0f3f6]">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleField(f)}
                  className="accent-[#0969da] flex-shrink-0"
                />
                <span className="font-mono text-[#1f2328] flex-1 truncate">{f}</span>
                {isSelected && (
                  <div className="flex rounded border border-[#d1d9e0] overflow-hidden flex-shrink-0">
                    <button
                      onClick={() => onToggleLevel(f, true)}
                      className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                        isQty
                          ? 'bg-[#0969da] text-white'
                          : 'bg-white text-[#636c76] hover:bg-[#f0f3f6]'
                      }`}
                    >כמות</button>
                    <button
                      onClick={() => onToggleLevel(f, false)}
                      className={`px-2 py-0.5 text-[10px] font-semibold transition-colors border-r border-[#d1d9e0] ${
                        !isQty
                          ? 'bg-[#636c76] text-white'
                          : 'bg-white text-[#636c76] hover:bg-[#f0f3f6]'
                      }`}
                    >פירוט</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────── */

export default function MappingPage() {
  // Topics list
  const [topics, setTopics]         = useState<TopicMapping[]>([]);
  const [configs, setConfigs]       = useState<Record<string, TopicConfig>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError]   = useState('');

  // Selected topic for editing
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  // Config editor state
  const [editCol, setEditCol]                   = useState('');
  const [editGroupBy, setEditGroupBy]           = useState<string[]>([]);
  const [editSubtopic, setEditSubtopic]         = useState<string[]>([]);
  const [editQuantity, setEditQuantity]         = useState<string[]>([]);
  const [editCompare, setEditCompare]           = useState<string[]>([]);
  const [editExclude, setEditExclude]           = useState(false);
  const [allFields, setAllFields]               = useState<string[]>([]);
  const [numericFields, setNumericFields]       = useState<string[]>([]);
  const [loadingFields, setLoadingFields]       = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [saveMsg, setSaveMsg]                   = useState('');

  // Auto-fill
  const [autoFilling, setAutoFilling]   = useState(false);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterMode, setFilterMode]     = useState<'all' | 'unconfigured' | 'missing_noseme' | 'excluded'>('all');

  /* Load topics + configs */
  useEffect(() => {
    Promise.all([
      fetch('/api/noseme/mapping').then((r) => r.json()),
      fetch('/api/noseme/mapping/config').then((r) => r.json()),
    ])
      .then(([mappingRes, configRes]) => {
        if (mappingRes.ok)  setTopics(mappingRes.topics);
        else                setListError('שגיאה בטעינת הנושאים');
        if (configRes.ok)   setConfigs(configRes.configs ?? {});
      })
      .catch(() => setListError('שגיאת רשת'))
      .finally(() => setLoadingList(false));
  }, []);

  /* Load fields when collection or selected code changes */
  useEffect(() => {
    if (!editCol) { setAllFields([]); setNumericFields([]); return; }
    setLoadingFields(true);
    const params = new URLSearchParams({ collection: editCol });
    if (selectedCode) params.set('code', selectedCode);
    fetch(`/api/noseme/mapping/fields?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setAllFields(d.all_fields); setNumericFields(d.numeric_fields); }
      })
      .catch(() => {})
      .finally(() => setLoadingFields(false));
  }, [editCol, selectedCode]);

  /* When selecting a topic, populate editor */
  const selectTopic = useCallback((code: string, topic: TopicMapping) => {
    setSelectedCode(code);
    setSaveMsg('');

    const saved = configs[code];
    if (saved) {
      setEditCol(saved.check_collection);
      setEditGroupBy(saved.group_by);
      setEditSubtopic(saved.subtopic_fields ?? []);
      setEditQuantity(saved.quantity_fields ?? []);
      setEditCompare(saved.compare_fields);
      setEditExclude(saved.exclude_from_audit ?? false);
    } else {
      setEditExclude(false);
      // Guess collection: first non-CHESHBONIT collection this topic appears in
      const detailCols = topic.collections.filter(
        (c) => c !== CHESHBONIT && !SKIP_COLLECTIONS.has(c)
      );
      const guessCol = detailCols[0] ?? CHESHBONIT;
      setEditCol(guessCol);

      // Pre-fill from COLLECTION_DEFAULTS if known
      const def = COLLECTION_DEFAULTS[guessCol];
      setEditGroupBy(def?.group_by ?? []);
      setEditSubtopic(def?.subtopic_fields ?? []);
      setEditQuantity(def?.quantity_fields ?? []);
      setEditCompare(def?.compare_fields ?? []);
    }
  }, [configs]);

  /* Handle collection change in editor */
  const handleColChange = (col: string) => {
    setEditCol(col);
    const def = COLLECTION_DEFAULTS[col];
    if (def) {
      setEditGroupBy(def.group_by);
      setEditSubtopic(def.subtopic_fields);
      setEditQuantity(def.quantity_fields);
      setEditCompare(def.compare_fields);
    } else {
      setEditGroupBy([]);
      setEditSubtopic([]);
      setEditQuantity([]);
      setEditCompare([]);
    }
  };

  /* Save config */
  const saveConfig = async () => {
    if (!selectedCode || !editCol) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/noseme/mapping/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code:               selectedCode,
          check_collection:   editCol,
          group_by:           editGroupBy,
          subtopic_fields:    editSubtopic,
          quantity_fields:    editQuantity,
          compare_fields:     editCompare,
          exclude_from_audit: editExclude,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSaveMsg('נשמר בהצלחה');
        setConfigs((prev) => ({
          ...prev,
          [selectedCode]: {
            code:               selectedCode,
            check_collection:   editCol,
            group_by:           editGroupBy,
            subtopic_fields:    editSubtopic,
            quantity_fields:    editQuantity,
            compare_fields:     editCompare,
            auto_filled:        false,
            exclude_from_audit: editExclude,
          },
        }));
      } else {
        setSaveMsg('שגיאה בשמירה');
      }
    } catch {
      setSaveMsg('שגיאת רשת');
    } finally {
      setSaving(false);
    }
  };

  /* Auto-fill */
  const autoFill = async () => {
    setAutoFilling(true);
    try {
      const res = await fetch('/api/noseme/mapping/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_fill: true }),
      });
      const d = await res.json();
      if (d.ok) {
        // Reload configs
        const configRes = await fetch('/api/noseme/mapping/config').then((r) => r.json());
        if (configRes.ok) setConfigs(configRes.configs ?? {});
        setSaveMsg(`מולאו אוטומטית ${d.saved} נושאים`);
      }
    } catch {}
    finally { setAutoFilling(false); }
  };

  /* Filtered topic list */
  const filteredTopics = useMemo(() => {
    let list = topics;
    if (filterMode === 'unconfigured')   list = list.filter((t) => !configs[t.code]);
    if (filterMode === 'missing_noseme') list = list.filter((t) => !t.in_noseme);
    if (filterMode === 'excluded')       list = list.filter((t) => configs[t.code]?.exclude_from_audit);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) => String(t.code).includes(q) || (t.name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [topics, configs, filterMode, search]);

  const selectedTopic = topics.find((t) => t.code === selectedCode) ?? null;
  const detailCols = selectedTopic
    ? selectedTopic.collections.filter((c) => c !== CHESHBONIT && !SKIP_COLLECTIONS.has(c))
    : [];

  const stats = useMemo(() => ({
    total:       topics.length,
    configured:  Object.keys(configs).length,
    missingNoseme: topics.filter((t) => !t.in_noseme).length,
  }), [topics, configs]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">מיפוי נושאים לקבצים</h1>
        <p className="text-[#636c76] text-sm">הגדרת קולקשין ושדות בקרה לכל נושא</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'סה"כ נושאים',   value: stats.total,         color: 'text-[#1f2328]' },
          { label: 'מוגדרים',        value: stats.configured,    color: 'text-[#1a7f37]' },
          { label: 'חסרים בנושאים', value: stats.missingNoseme, color: 'text-[#cf222e]' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#d1d9e0] rounded-xl p-3">
            <p className="text-xs text-[#636c76] mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Auto-fill + filters row */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl p-3 mb-3 flex flex-wrap gap-3 items-center">
        <button
          onClick={autoFill}
          disabled={autoFilling}
          className="px-3 py-1.5 text-sm rounded-lg bg-[#0969da] text-white hover:bg-[#0550ae] disabled:opacity-60 transition-colors"
        >
          {autoFilling ? '⏳ ממלא...' : '⚡ מלא אוטומטית'}
        </button>
        <div className="w-px h-6 bg-[#d1d9e0]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש קוד / שם..."
          className="bg-[#f0f3f6] border border-[#d1d9e0] text-[#1f2328] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#0969da] w-48"
        />
        <div className="flex gap-1.5">
          {([
            { key: 'all',            label: 'הכל' },
            { key: 'unconfigured',   label: 'לא מוגדרים' },
            { key: 'missing_noseme', label: 'חסרים בנושאים' },
            { key: 'excluded',       label: 'מוחרגים' },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterMode(f.key)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                filterMode === f.key
                  ? 'bg-[#0969da] text-white border-[#0969da]'
                  : 'bg-[#f0f3f6] text-[#1f2328] border-[#d1d9e0] hover:bg-[#e2e7ec]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {saveMsg && (
          <span className={`text-xs font-medium mr-auto ${saveMsg.includes('שגיאה') ? 'text-[#cf222e]' : 'text-[#1a7f37]'}`}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex gap-3 min-h-0">

        {/* LEFT: Topic list */}
        <div className="w-80 flex-shrink-0 bg-white border border-[#d1d9e0] rounded-xl flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-[#d1d9e0] text-xs text-[#636c76]">
            {filteredTopics.length.toLocaleString('he-IL')} נושאים
          </div>
          {loadingList ? (
            <div className="flex-1 flex items-center justify-center text-[#636c76] text-sm">⏳ טוען...</div>
          ) : listError ? (
            <div className="flex-1 flex items-center justify-center text-[#cf222e] text-sm">{listError}</div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-[#d1d9e0]">
              {filteredTopics.map((t) => {
                const cfg = configs[t.code];
                const isSelected = selectedCode === t.code;
                return (
                  <li key={t.code}>
                    <button
                      onClick={() => selectTopic(t.code, t)}
                      className={`w-full text-right px-3 py-2.5 flex flex-col gap-0.5 transition-colors ${
                        isSelected
                          ? 'bg-[#ddf4ff]'
                          : !t.in_noseme
                          ? 'bg-[#fff8c5] hover:bg-[#fef2a0]'
                          : 'hover:bg-[#f0f3f6]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-[#636c76]">{t.code}</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {cfg?.exclude_from_audit && (
                            <Badge label="מוחרג" variant="gray" />
                          )}
                          {cfg && !cfg.exclude_from_audit ? (
                            <Badge label={colLabel(cfg.check_collection)} variant="green" />
                          ) : !cfg ? (
                            <Badge label="לא מוגדר" variant="gray" />
                          ) : null}
                        </div>
                      </div>
                      <span className="text-xs text-[#1f2328] truncate">{t.name ?? '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT: Config editor */}
        <div className="flex-1 bg-white border border-[#d1d9e0] rounded-xl flex flex-col min-h-0 overflow-y-auto">
          {!selectedCode ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#636c76] gap-2 p-8">
              <span className="text-3xl">🗂️</span>
              <p className="text-sm">בחר נושא מהרשימה כדי להגדיר את שדות הבקרה שלו</p>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {/* Topic header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#1f2328]">
                    {selectedTopic?.name ?? selectedCode}
                  </h2>
                  <p className="text-xs text-[#636c76] font-mono">קוד: {selectedCode}</p>
                  {selectedTopic && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {selectedTopic.in_noseme ? (
                        <Badge label="בטבלת נושאים" variant="green" />
                      ) : (
                        <Badge label="לא בטבלת נושאים" variant="gray" />
                      )}
                      {selectedTopic.table_type && <Badge label={selectedTopic.table_type} />}
                      {selectedTopic.direction   && <Badge label={selectedTopic.direction} />}
                    </div>
                  )}
                </div>
                <button
                  onClick={saveConfig}
                  disabled={saving || !editCol}
                  className="px-4 py-2 text-sm rounded-lg bg-[#1a7f37] text-white hover:bg-[#116329] disabled:opacity-60 transition-colors flex-shrink-0"
                >
                  {saving ? 'שומר...' : '💾 שמור'}
                </button>
              </div>

              {/* Exclude from audit toggle */}
              <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer select-none transition-colors ${
                editExclude
                  ? 'bg-[#ffebe9] border-[#f97583] text-[#cf222e]'
                  : 'bg-[#f0f3f6] border-[#d1d9e0] text-[#636c76]'
              }`}>
                <input
                  type="checkbox"
                  checked={editExclude}
                  onChange={(e) => setEditExclude(e.target.checked)}
                  className="accent-[#cf222e] w-4 h-4"
                />
                <div>
                  <p className="text-sm font-semibold">
                    {editExclude ? '⛔ נושא זה מוחרג מדוח הבקרה' : '✅ נושא זה נכלל בדוח הבקרה'}
                  </p>
                  <p className="text-xs opacity-75">
                    {editExclude
                      ? 'סמן כדי לבטל החרגה ולהכניס לדוח'
                      : 'סמן כדי להוציא נושא זה מדוח ההשוואה'}
                  </p>
                </div>
              </label>

              <hr className="border-[#d1d9e0]" />

              {/* Collection selector */}
              <div>
                <p className="text-xs font-semibold text-[#636c76] uppercase tracking-wide mb-2">
                  קולקשין לבדיקה
                </p>
                <p className="text-xs text-[#636c76] mb-2">
                  חשבוניות (CHESHBONIT) נבדקות תמיד בנוסף לקולקשין שנבחר
                </p>
                {detailCols.length === 0 ? (
                  <div className="bg-[#ddf4ff] border border-[#b6e0fe] rounded-lg px-3 py-2 text-xs text-[#0550ae]">
                    נושא זה לא מופיע בקולקשין נפרד — ייבדק מול <strong className="font-mono">CHESHBONIT</strong> בלבד
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {detailCols.map((c) => (
                      <label key={c} className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="check_collection"
                          value={c}
                          checked={editCol === c}
                          onChange={() => handleColChange(c)}
                          className="accent-[#0969da]"
                        />
                        <span className="text-sm font-mono text-[#1f2328]">{c}</span>
                        <span className="text-xs text-[#636c76]">({colLabel(c)})</span>
                      </label>
                    ))}
                    {editCol && editCol !== CHESHBONIT && !detailCols.includes(editCol) && (
                      <span className="text-xs text-[#9a6700]">
                        מוגדר: <strong className="font-mono">{editCol}</strong> (לא נמצא בנתונים הנוכחיים)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Fields — side by side */}
              {editCol && (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    <FieldCheckboxList
                      label="שדות קיבוץ (Group By)"
                      fields={allFields}
                      selected={editGroupBy}
                      onChange={setEditGroupBy}
                      loading={loadingFields}
                    />
                    <CompareFieldLevelList
                      fields={numericFields}
                      selected={[...editQuantity, ...editCompare]}
                      quantityFields={editQuantity}
                      onToggleField={(f) => {
                        const allSelected = [...editQuantity, ...editCompare];
                        if (allSelected.includes(f)) {
                          setEditQuantity(editQuantity.filter(x => x !== f));
                          setEditCompare(editCompare.filter(x => x !== f));
                        } else {
                          // Default new field to "פירוט"
                          setEditCompare([...editCompare, f]);
                        }
                      }}
                      onToggleLevel={(f, isQty) => {
                        if (isQty) {
                          setEditQuantity(prev => prev.includes(f) ? prev : [...prev, f]);
                          setEditCompare(prev => prev.filter(x => x !== f));
                        } else {
                          setEditCompare(prev => prev.includes(f) ? prev : [...prev, f]);
                          setEditQuantity(prev => prev.filter(x => x !== f));
                        }
                      }}
                      loading={loadingFields}
                    />
                  </div>

                  {/* Subtopic fields selector — from group_by non-time fields */}
                  {editGroupBy.length > 0 && (() => {
                    const TIME = new Set(['חודש_תחולה', 'חודש_חישוב', 'קוד_נושא', 'סמל_מוסד']);
                    const subtopicCandidates = editGroupBy.filter(f => !TIME.has(f));
                    if (subtopicCandidates.length === 0) return null;
                    return (
                      <div>
                        <p className="text-xs font-semibold text-[#636c76] uppercase tracking-wide mb-1">שדות תת-נושא (רמה 1)</p>
                        <p className="text-[10px] text-[#636c76] mb-2">שדות אלו ישמשו לקיבוץ ביניים לפני פירוט לפי מוסד</p>
                        <div className="flex flex-wrap gap-2">
                          {subtopicCandidates.map(f => (
                            <label key={f} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={editSubtopic.includes(f)}
                                onChange={() => setEditSubtopic(prev =>
                                  prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
                                )}
                                className="accent-[#0969da]"
                              />
                              <span className="font-mono text-[#1f2328]">{f}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Current selection summary */}
              {editCol && (
                <div className="bg-[#f0f3f6] rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-[#636c76]">הגדרה נוכחית</p>
                  <div className="text-xs text-[#1f2328] space-y-0.5">
                    <p><span className="text-[#636c76]">קולקשין:</span> <span className="font-mono">{editCol}</span></p>
                    <p>
                      <span className="text-[#636c76]">קיבוץ:</span>{' '}
                      {editGroupBy.length > 0
                        ? editGroupBy.map((f) => <code key={f} className="bg-white border border-[#d1d9e0] rounded px-1 ml-1">{f}</code>)
                        : <span className="text-[#9a6700]">לא הוגדר</span>}
                    </p>
                    {editSubtopic.length > 0 && (
                      <p>
                        <span className="text-[#636c76]">תת-נושא:</span>{' '}
                        {editSubtopic.map((f) => <code key={f} className="bg-[#ddf4ff] border border-[#b6e0fe] rounded px-1 ml-1 text-[#0550ae]">{f}</code>)}
                      </p>
                    )}
                    {editQuantity.length > 0 && (
                      <p>
                        <span className="text-[#636c76]">כמויות:</span>{' '}
                        {editQuantity.map((f) => <code key={f} className="bg-[#dafbe1] border border-[#aef0c5] rounded px-1 ml-1 text-[#116329]">{f}</code>)}
                      </p>
                    )}
                    {editCompare.length > 0 && (
                      <p>
                        <span className="text-[#636c76]">פירוט:</span>{' '}
                        {editCompare.map((f) => <code key={f} className="bg-white border border-[#d1d9e0] rounded px-1 ml-1">{f}</code>)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex gap-4 text-xs text-[#636c76]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[#fff8c5] border border-[#d1d9e0]" />
          נושא לא מוגדר בטבלת נושאים
        </span>
        <span className="flex items-center gap-1.5">
          <Badge label="לא מוגדר" variant="gray" />
          עדיין לא הוגדר קולקשין לבדיקה
        </span>
        <span className="flex items-center gap-1.5">
          <Badge label="שם קולקשין" variant="green" />
          הוגדר קולקשין לבדיקה
        </span>
      </div>
    </div>
  );
}
