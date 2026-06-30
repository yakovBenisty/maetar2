'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';

/* ─── Types ──────────────────────────────────────────────── */
interface FieldDiff { field: string; prev: number; curr: number; diff: number }

interface DetailRow {
  group:        Record<string, unknown>;
  qty_diffs:    FieldDiff[];
  detail_diffs: FieldDiff[];
  has_qty_diff: boolean;
  has_any_diff: boolean;
}

interface AuditItem {
  חודש_תחולה:      string;
  case_type:       'שוטף' | 'הפרש';
  compare_month:   string;
  no_comparison:   boolean;
  no_payment:      boolean;
  payment_amount:  number;
  has_diff:        boolean;
  subtopic_fields: string[];
  quantity_fields: string[];
  detail_fields:   string[];
  group_by:        string[];
  rows:            DetailRow[];
}

interface TopicResult {
  code:          string;
  name:          string | null;
  collection:    string;
  has_diff:      boolean;
  total_payment: number;
  items:         AuditItem[];
}

interface AuditResult {
  ok: boolean; calc_month: string; compare_month: string; topics: TopicResult[];
}

/* ─── Month formatting ────────────────────────────────────── */
const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

function fmtMonth(raw: string): string {
  const s = String(raw ?? '').trim();
  const iso = s.match(/^(\d{4})[.\-\/](\d{1,2})/);
  if (iso) { const y = +iso[1], mo = +iso[2]; if (y > 1990 && mo >= 1 && mo <= 12) return `${HE_MONTHS[mo-1]} ${y}`; }
  const rev = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (rev) { const mo = +rev[1], y = +rev[2]; if (y > 1990 && mo >= 1 && mo <= 12) return `${HE_MONTHS[mo-1]} ${y}`; }
  if (/^\d{6}$/.test(s)) { const y = +s.slice(0,4), mo = +s.slice(4); if (y>1990 && mo>=1 && mo<=12) return `${HE_MONTHS[mo-1]} ${y}`; }
  return s;
}

/* ─── Number formatting ───────────────────────────────────── */
function fmt(n: number)       { return Math.round(Math.abs(n)).toLocaleString('he-IL'); }
function fmtSigned(n: number) { return (n >= 0 ? '+' : '−') + Math.round(Math.abs(n)).toLocaleString('he-IL'); }
function fmtMoney(n: number)  { return (n < 0 ? '−' : '+') + Math.round(Math.abs(n)).toLocaleString('he-IL') + ' ₪'; }

const DIFF_POS = 'text-[#116329] font-semibold';
const DIFF_NEG = 'text-[#cf222e] font-semibold';
function diffCls(d: number) { return d < 0 ? DIFF_NEG : DIFF_POS; }

/* ─── DiffTable — compact quantity/detail rows ────────────── */
function DiffTable({ rows, qtyFields, detailFields, keyFields, showDetail }: {
  rows: DetailRow[];
  qtyFields: string[];
  detailFields: string[];
  keyFields: string[];
  showDetail: boolean;
}) {
  const fields = showDetail
    ? [...new Set([...qtyFields, ...detailFields])]
    : qtyFields;

  if (fields.length === 0 || rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#f0f3f6]">
            {keyFields.map(f => (
              <th key={f} className="px-2 py-1.5 text-right font-semibold text-[#636c76] border border-[#d1d9e0] whitespace-nowrap">{f}</th>
            ))}
            {fields.map(f => (
              <th key={f} colSpan={3} className="px-2 py-1.5 text-center font-semibold text-[#636c76] border border-[#d1d9e0] whitespace-nowrap">{f}</th>
            ))}
          </tr>
          <tr className="bg-[#f6f8fa]">
            {keyFields.map(f => <th key={f} className="border border-[#d1d9e0]" />)}
            {fields.flatMap(f => [
              <th key={`${f}-p`} className="px-2 py-1 text-[10px] font-normal text-[#636c76] border border-[#d1d9e0]">קודם</th>,
              <th key={`${f}-c`} className="px-2 py-1 text-[10px] font-normal text-[#636c76] border border-[#d1d9e0]">נוכחי</th>,
              <th key={`${f}-d`} className="px-2 py-1 text-[10px] font-semibold text-[#1f2328] border border-[#d1d9e0]">הפרש</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const allDiffs = [...row.qty_diffs, ...row.detail_diffs];
            const diffMap  = Object.fromEntries(allDiffs.map(d => [d.field, d]));
            return (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#f6f8fa]'}>
                {keyFields.map(f => (
                  <td key={f} className="px-2 py-1.5 border border-[#d1d9e0] text-[#1f2328] whitespace-nowrap">{String(row.group[f] ?? '—')}</td>
                ))}
                {fields.flatMap(f => {
                  const d = diffMap[f];
                  return [
                    <td key={`${f}-p`} className="px-2 py-1.5 border border-[#d1d9e0] text-left text-[#636c76]">{d ? fmt(d.prev) : '—'}</td>,
                    <td key={`${f}-c`} className="px-2 py-1.5 border border-[#d1d9e0] text-left text-[#636c76]">{d ? fmt(d.curr) : '—'}</td>,
                    <td key={`${f}-d`} className={`px-2 py-1.5 border border-[#d1d9e0] text-left ${d ? diffCls(d.diff) : 'text-[#636c76]'}`}>
                      {d ? fmtSigned(d.diff) : '—'}
                    </td>,
                  ];
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── SubtopicSection — Level 1 + 2 + 3 ─────────────────── */
function SubtopicSection({ item }: { item: AuditItem }) {
  const [openSubtopics, setOpenSubtopics] = useState<Set<string>>(new Set());
  const [openInstitutions, setOpenInstitutions] = useState<Set<string>>(new Set());

  const TIME = new Set(['חודש_תחולה', 'חודש_חישוב', 'קוד_נושא']);
  const keyFields  = item.group_by.filter(f => !TIME.has(f));
  const instFields = keyFields.filter(f => !item.subtopic_fields.includes(f)); // e.g. סמל_מוסד

  /* Group rows by subtopic key */
  const subtopicGroups = useMemo(() => {
    if (item.subtopic_fields.length === 0) return null;
    const map = new Map<string, { key: string; label: string; rows: DetailRow[] }>();
    for (const row of item.rows) {
      const keyParts = item.subtopic_fields.map(f => String(row.group[f] ?? ''));
      const key = keyParts.join('|');
      if (!map.has(key)) map.set(key, { key, label: keyParts.join(' / '), rows: [] });
      map.get(key)!.rows.push(row);
    }
    return Array.from(map.values());
  }, [item]);

  const toggleSubtopic = (key: string) => {
    setOpenSubtopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleInstitution = (key: string) => {
    setOpenInstitutions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const InstitutionRows = ({ rows, prefix }: { rows: DetailRow[]; prefix: string }) => (
    <>
      {rows.map((row, ri) => {
        const rowKey = `${prefix}|${ri}`;
        const isOpen = openInstitutions.has(rowKey);
        const totQtyDiff = row.qty_diffs.reduce((s, d) => s + d.diff, 0);
        return (
          <div key={ri}>
            {/* Level 2 row — institution + qty summary */}
            <div className={`flex items-center gap-2 px-4 py-1.5 text-xs border-b border-[#e6e9ed] ${ri % 2 === 0 ? 'bg-white' : 'bg-[#fafbfc]'}`}>
              {/* Institution key fields */}
              <div className="flex gap-3 flex-1 min-w-0">
                {instFields.map(f => (
                  <span key={f} className="font-mono text-[#1f2328] truncate">{String(row.group[f] ?? '—')}</span>
                ))}
              </div>
              {/* Qty diff summary */}
              {row.qty_diffs.length > 0 ? (
                <span className={`font-semibold flex-shrink-0 ${diffCls(totQtyDiff)}`}>
                  {fmtSigned(totQtyDiff)}
                </span>
              ) : (
                <span className="text-[#636c76] flex-shrink-0">—</span>
              )}
              {/* Expand button for detail fields */}
              {item.detail_fields.length > 0 && (
                <button
                  onClick={() => toggleInstitution(rowKey)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[#d1d9e0] text-[#636c76] hover:bg-[#f0f3f6] flex-shrink-0"
                >
                  {isOpen ? '▲' : '[+]'}
                </button>
              )}
            </div>
            {/* Level 3 — detail fields per institution */}
            {isOpen && item.detail_fields.length > 0 && (
              <div className="bg-[#f0f3f6] px-6 py-2 border-b border-[#d1d9e0]">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-right text-[#636c76] border border-[#d1d9e0]">שדה</th>
                      <th className="px-2 py-1 text-left  text-[#636c76] border border-[#d1d9e0]">קודם</th>
                      <th className="px-2 py-1 text-left  text-[#636c76] border border-[#d1d9e0]">נוכחי</th>
                      <th className="px-2 py-1 text-left  text-[#636c76] border border-[#d1d9e0]">הפרש</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.detail_diffs.map((d, di) => (
                      <tr key={di} className={di % 2 === 0 ? 'bg-white' : 'bg-[#f6f8fa]'}>
                        <td className="px-2 py-1 border border-[#d1d9e0] font-mono text-[#636c76]">{d.field}</td>
                        <td className="px-2 py-1 border border-[#d1d9e0] text-left text-[#636c76]">{fmt(d.prev)}</td>
                        <td className="px-2 py-1 border border-[#d1d9e0] text-left text-[#636c76]">{fmt(d.curr)}</td>
                        <td className={`px-2 py-1 border border-[#d1d9e0] text-left ${diffCls(d.diff)}`}>{fmtSigned(d.diff)}</td>
                      </tr>
                    ))}
                    {row.qty_diffs.length > 0 && row.detail_diffs.length === 0 && (
                      <tr><td colSpan={4} className="px-2 py-1 text-[#636c76] text-center border border-[#d1d9e0]">אין שדות פירוט עם הפרש</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  /* No subtopic fields — jump straight to institution rows */
  if (!subtopicGroups) {
    return (
      <div>
        {/* Level 2 header */}
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[#f0f3f6] border-b border-[#d1d9e0] text-[10px] font-semibold text-[#636c76] uppercase">
          {instFields.map(f => <span key={f}>{f}</span>)}
          <span className="mr-auto">הפרש כמות</span>
          {item.detail_fields.length > 0 && <span className="w-10" />}
        </div>
        <InstitutionRows rows={item.rows} prefix="root" />
      </div>
    );
  }

  return (
    <div>
      {/* Level 1 header */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-[#e8edf2] border-b border-[#d1d9e0] text-[10px] font-semibold text-[#636c76] uppercase">
        {item.subtopic_fields.map(f => <span key={f}>{f}</span>)}
        <span className="mr-auto">הפרש כמות</span>
      </div>

      {subtopicGroups.map(sg => {
        const isOpen      = openSubtopics.has(sg.key);
        const totQtyDiff  = sg.rows.flatMap(r => r.qty_diffs).reduce((s, d) => s + d.diff, 0);
        const hasDiff     = sg.rows.some(r => r.has_qty_diff);
        return (
          <div key={sg.key}>
            {/* Level 1 row — subtopic summary */}
            <button
              onClick={() => toggleSubtopic(sg.key)}
              className={`w-full flex items-center gap-2 px-4 py-2 text-xs text-right border-b border-[#d1d9e0] hover:bg-[#e8f4fd] transition-colors ${
                hasDiff ? 'bg-[#f6f8fa]' : 'bg-[#f6f8fa]'
              }`}
            >
              <span className="text-[#636c76] w-4 flex-shrink-0">{isOpen ? '▼' : '▶'}</span>
              <span className="font-semibold text-[#1f2328] flex-1 text-right">{sg.label}</span>
              {hasDiff ? (
                <span className={`font-bold flex-shrink-0 ${diffCls(totQtyDiff)}`}>{fmtSigned(totQtyDiff)}</span>
              ) : (
                <span className="text-[#1a7f37] text-[10px] flex-shrink-0">✅ ללא הפרש</span>
              )}
            </button>

            {/* Level 2 — institutions within subtopic */}
            {isOpen && (
              <div className="border-b border-[#d1d9e0]">
                <div className="flex items-center gap-2 px-6 py-1 bg-[#f0f3f6] text-[10px] font-semibold text-[#636c76] uppercase">
                  {instFields.map(f => <span key={f}>{f}</span>)}
                  <span className="mr-auto">הפרש כמות</span>
                  {item.detail_fields.length > 0 && <span className="w-10" />}
                </div>
                <InstitutionRows rows={sg.rows} prefix={sg.key} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── AuditItemSection ────────────────────────────────────── */
function AuditItemSection({ item }: { item: AuditItem }) {
  const isShototf   = item.case_type === 'שוטף';
  const badgeBg     = isShototf ? '#ddf4ff' : '#fff3cd';
  const badgeBorder = isShototf ? '#54aeff' : '#f0a500';
  const badgeText   = isShototf ? '#0969da' : '#7d4e00';
  const badgeIcon   = isShototf ? '🔄' : '🔁';
  const headerBg    = item.has_diff ? (isShototf ? '#fff8f0' : '#fff3cd') : '#f6f8fa';

  return (
    <div className="border-t border-[#d1d9e0] last:border-0">
      {/* Item header */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5" style={{ background: headerBg }}>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0"
            style={{ background: badgeBg, borderColor: badgeBorder, color: badgeText }}
          >
            {badgeIcon} {item.case_type}
          </span>
          <span className="text-sm font-bold text-[#1f2328]">{fmtMonth(item.חודש_תחולה)}</span>
          {item.no_comparison ? (
            <span className="text-xs text-[#9a6700] bg-[#fff8c5] border border-[#e3b341] rounded px-2 py-0.5">ראשון — אין השוואה קודמת</span>
          ) : item.compare_month ? (
            <span className="text-xs text-[#636c76]">מושווה אל: {fmtMonth(item.compare_month)}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs">
          {item.no_payment ? (
            <span className="text-[#1a7f37] font-semibold">✅ תשלום ראשון — לא שולם בעבר</span>
          ) : (
            <>
              {item.payment_amount !== 0 && (
                <span className="text-[#636c76]">
                  💰 <strong className={item.payment_amount < 0 ? 'text-[#cf222e]' : 'text-[#116329]'}>
                    {fmtMoney(item.payment_amount)}
                  </strong>
                </span>
              )}
              {item.has_diff ? (
                <span className="text-[#636c76]">{item.rows.length} שורות עם הפרש</span>
              ) : !item.no_comparison ? (
                <span className="text-[#1a7f37]">✅ ללא הפרשים</span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Rows */}
      {item.has_diff && item.rows.length > 0 && (
        <SubtopicSection item={item} />
      )}
    </div>
  );
}

/* ─── TopicCard ───────────────────────────────────────────── */
function TopicCard({ topic, expanded, onToggle }: {
  topic: TopicResult; expanded: boolean; onToggle: () => void;
}) {
  const shototCount  = topic.items.filter(i => i.case_type === 'שוטף').length;
  const hefreshCount = topic.items.filter(i => i.case_type === 'הפרש').length;
  const diffItems    = topic.items.filter(i => i.has_diff).length;

  const borderColor = !topic.has_diff ? '#1a7f37' : '#e36209';
  const bgHeader    = !topic.has_diff ? '#dafbe1' : '#fff8f0';
  const statusIcon  = !topic.has_diff ? '✅' : '🟡';

  return (
    <div className="rounded-xl overflow-hidden mb-2.5 border" style={{ borderColor }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-right cursor-pointer hover:brightness-95 transition-colors"
        style={{ background: bgHeader }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{statusIcon}</span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#1f2328] truncate">
              נושא {topic.code}{topic.name ? ` — ${topic.name}` : ''}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs font-mono bg-white/70 border border-black/10 rounded px-1.5 py-0.5">{topic.collection}</span>
              <span className="text-xs text-[#636c76]">
                {topic.items.length} פריט{topic.items.length !== 1 ? 'ים' : ''}
                {shototCount > 0 && ` · ${shototCount} שוטף`}
                {hefreshCount > 0 && ` · ${hefreshCount} הפרש`}
              </span>
              {topic.has_diff && (
                <span className="text-xs text-[#e36209]">{diffItems} עם הפרשים</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-left">
            {topic.total_payment > 0 && (
              <p className="text-xs text-[#636c76]">💰 {Math.round(topic.total_payment).toLocaleString('he-IL')} ₪</p>
            )}
          </div>
          <span className="text-[#636c76] text-xs w-4">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div>
          {topic.items.map((item, i) => (
            <AuditItemSection key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Word export ─────────────────────────────────────────── */
function exportToWord(result: AuditResult, userName: string) {
  const topicsWithDiff = result.topics.filter(t => t.has_diff);

  const summaryRows = topicsWithDiff.map(t => `<tr>
    <td>${t.code}</td><td>${t.name ?? '—'}</td><td>${t.collection}</td>
    <td style="text-align:center">${t.items.length}</td>
    <td style="text-align:left">${Math.round(t.total_payment).toLocaleString('he-IL')} ₪</td>
  </tr>`).join('');

  const topicSections = topicsWithDiff.map(t => {
    const TIME = new Set(['חודש_תחולה', 'חודש_חישוב', 'קוד_נושא']);
    const itemSections = t.items.filter(i => i.has_diff).map(item => {
      const keyFields  = item.group_by.filter(f => !TIME.has(f));
      const allFields  = [...new Set([...item.quantity_fields, ...item.detail_fields])];
      const caseLabel  = item.case_type === 'שוטף' ? '🔄 שוטף' : '🔁 הפרש';
      const cmpLabel   = item.no_comparison ? 'ראשון' : `מושווה אל: ${fmtMonth(item.compare_month)}`;
      const payLabel   = item.payment_amount !== 0 ? ` | ${fmtMoney(item.payment_amount)}` : '';

      const headers = [...keyFields, 'שדה', 'קודם', 'נוכחי', 'הפרש'].map(h => `<th>${h}</th>`).join('');
      const bodyRows = item.rows.flatMap(row => {
        const allDiffs = [...row.qty_diffs, ...row.detail_diffs];
        return allDiffs.map(d => {
          const gc  = keyFields.map(f => `<td>${row.group[f] ?? '—'}</td>`).join('');
          const cls = d.diff < 0 ? 'neg' : 'pos';
          return `<tr>${gc}<td>${d.field}</td><td>${fmt(d.prev)}</td><td>${fmt(d.curr)}</td><td class="${cls}">${fmtSigned(d.diff)}</td></tr>`;
        });
      }).join('');

      return `<div style="margin-bottom:12px">
  <p class="item-header">${caseLabel} | חודש תחולה: <strong>${fmtMonth(item.חודש_תחולה)}</strong> | ${cmpLabel}${payLabel}</p>
  <table><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>
</div>`;
    }).join('');

    return `<div class="topic-block">
  <h2>נושא ${t.code}${t.name ? ' — ' + t.name : ''}</h2>
  <p class="meta">קולקשין: <strong>${t.collection}</strong></p>
  ${itemSections}
</div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;direction:rtl;margin:40px 30px;color:#1f2328;font-size:13px;line-height:1.5}
  h1{font-size:22px;color:#0969da;border-bottom:3px solid #0969da;padding-bottom:8px;margin-bottom:8px}
  h2{font-size:15px;background:#f0f3f6;padding:8px 12px;border-right:4px solid #0969da;margin:28px 0 8px}
  .meta,.item-header{color:#636c76;font-size:12px;margin-bottom:6px;background:#f6f8fa;padding:4px 8px;border-radius:4px}
  table{border-collapse:collapse;width:100%;margin-bottom:8px}
  th{background:#0969da;color:white;padding:6px 9px;font-size:12px}
  td{border:1px solid #d1d9e0;padding:5px 8px;font-size:12px}
  tr:nth-child(even) td{background:#f6f8fa}
  .neg{color:#cf222e;font-weight:bold} .pos{color:#116329;font-weight:bold}
  .topic-block{page-break-inside:avoid}
</style></head><body>
<h1>דוח בקרה — ${fmtMonth(result.calc_month)}</h1>
<div class="meta">
  <strong>תאריך הפקה:</strong> ${new Date().toLocaleDateString('he-IL')}
  ${userName ? ` | <strong>הופק ע"י:</strong> ${userName}` : ''}
</div>
<p><strong>${topicsWithDiff.length} נושאים עם הפרשים</strong> מתוך ${result.topics.length}</p>
<table>
  <thead><tr><th>קוד</th><th>שם</th><th>קולקשין</th><th>פריטים</th><th>סה"כ תשלום</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
${topicSections}
</body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `דוח_בקרה_${result.calc_month}.doc` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Main page ───────────────────────────────────────────── */
export default function AuditPage() {
  const { data: session } = useSession();
  const userName = session?.user?.firstName
    ? `${session.user.firstName} ${session.user.lastName ?? ''}`.trim()
    : session?.user?.name ?? '';

  const [months,       setMonths]       = useState<string[]>([]);
  const [calcMonth,    setCalcMonth]    = useState('');
  const [compareMonth, setCompareMonth] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState<AuditResult | null>(null);
  const [error,        setError]        = useState('');
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [showClean,    setShowClean]    = useState(false);

  useEffect(() => {
    fetch('/api/noseme/audit')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.months?.length) {
          setMonths(d.months);
          setCalcMonth(d.months[0]);
          if (d.months.length > 1) setCompareMonth(d.months[1]);
        }
      })
      .catch(() => {});
  }, []);

  const handleCalcChange = (m: string) => {
    setCalcMonth(m);
    const idx = months.indexOf(m);
    if (idx !== -1 && idx < months.length - 1) setCompareMonth(months[idx + 1]);
  };

  const runAudit = async () => {
    if (!calcMonth || !compareMonth) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const params = new URLSearchParams({ calc_month: calcMonth, compare_month: compareMonth });
      const d = await fetch(`/api/noseme/audit?${params}`).then(r => r.json());
      if (d.ok) {
        setResult(d);
        setExpanded(new Set((d.topics as TopicResult[]).filter(t => t.has_diff).map(t => t.code)));
      } else {
        setError(d.error ?? 'שגיאה בהפקת הדוח');
      }
    } catch { setError('שגיאת רשת'); }
    finally { setLoading(false); }
  };

  const toggleExpand = useCallback((code: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }, []);

  const stats = useMemo(() => {
    if (!result) return null;
    return {
      total:    result.topics.length,
      withDiff: result.topics.filter(t => t.has_diff).length,
      clean:    result.topics.filter(t => !t.has_diff).length,
    };
  }, [result]);

  const visibleTopics = useMemo(
    () => result ? (showClean ? result.topics : result.topics.filter(t => t.has_diff)) : [],
    [result, showClean],
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">דוח בקרה</h1>
        <p className="text-[#636c76] text-sm">השוואת נתונים בין חודשי חישוב</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-[#d1d9e0] rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#636c76]">חודש חישוב נוכחי</label>
          <select value={calcMonth} onChange={e => handleCalcChange(e.target.value)}
            className="border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm text-[#1f2328] bg-white focus:outline-none focus:border-[#0969da] min-w-[185px]">
            {months.length === 0 && <option value="">טוען...</option>}
            {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
        <span className="text-[#636c76] text-sm pb-2">מול (שוטף)</span>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#636c76]">חודש השוואה לשוטף</label>
          <select value={compareMonth} onChange={e => setCompareMonth(e.target.value)}
            className="border border-[#d1d9e0] rounded-lg px-3 py-2 text-sm text-[#1f2328] bg-white focus:outline-none focus:border-[#0969da] min-w-[185px]">
            {months.filter(m => m !== calcMonth).map((m, i) => (
              <option key={m} value={m}>{i === 0 ? `${fmtMonth(m)} (חודש קודם)` : fmtMonth(m)}</option>
            ))}
          </select>
        </div>
        <button onClick={runAudit} disabled={loading || !calcMonth || !compareMonth}
          className="px-5 py-2 bg-[#0969da] text-white rounded-lg text-sm font-semibold hover:bg-[#0550ae] disabled:opacity-60 transition-colors">
          {loading ? '⏳ מפיק...' : '▶ הפק דוח'}
        </button>
      </div>

      {error && (
        <div className="bg-[#ffebe9] border border-[#f97583] rounded-xl px-4 py-3 text-[#cf222e] text-sm mb-4">{error}</div>
      )}

      {result && stats && (
        <>
          <div className="bg-white border border-[#d1d9e0] rounded-xl p-4 mb-4 flex flex-wrap gap-6 items-center">
            <div className="flex gap-5">
              {[
                { label: 'נבדקו',      value: stats.total,    color: 'text-[#1f2328]' },
                { label: 'עם הפרשים', value: stats.withDiff, color: 'text-[#e36209]' },
                { label: 'תקינים',    value: stats.clean,    color: 'text-[#1a7f37]' },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs text-[#636c76]">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#636c76] bg-[#f0f3f6] rounded-lg px-3 py-1.5">{fmtMonth(result.calc_month)}</div>
            <div className="flex gap-2 items-center mr-auto flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-[#636c76] cursor-pointer select-none">
                <input type="checkbox" checked={showClean} onChange={e => setShowClean(e.target.checked)} className="accent-[#0969da]" />
                הצג תקינים
              </label>
              <button onClick={() => setExpanded(new Set(result.topics.map(t => t.code)))}
                className="px-2.5 py-1 text-xs rounded-lg border border-[#d1d9e0] text-[#636c76] hover:bg-[#f0f3f6]">פתח הכל</button>
              <button onClick={() => setExpanded(new Set())}
                className="px-2.5 py-1 text-xs rounded-lg border border-[#d1d9e0] text-[#636c76] hover:bg-[#f0f3f6]">סגור הכל</button>
              <button onClick={() => exportToWord(result, userName)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-[#0969da] text-[#0969da] hover:bg-[#ddf4ff] transition-colors font-medium">
                📄 יצוא לוורד
              </button>
            </div>
          </div>

          {visibleTopics.length === 0 ? (
            <div className="bg-[#dafbe1] border border-[#aef0c5] rounded-xl px-4 py-10 text-center text-[#1a7f37]">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold">כל הנושאים תקינים — לא נמצאו הפרשים</p>
              <p className="text-sm mt-1">סמן "הצג תקינים" כדי לראות את הנתונים</p>
            </div>
          ) : visibleTopics.map(topic => (
            <TopicCard
              key={topic.code}
              topic={topic}
              expanded={expanded.has(topic.code)}
              onToggle={() => toggleExpand(topic.code)}
            />
          ))}
        </>
      )}
    </div>
  );
}
