'use client';

import { useRef, useState } from 'react';
import ImportInfoButton from '@/app/components/ImportInfoButton';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ModuleRegistry.registerModules([AllCommunityModule]);

interface ImportResult {
  filename: string;
  collection: string;
  rows: number;
  status: 'imported' | 'skipped' | 'replaced' | 'error';
  error?: string;
}

interface ImportResponse {
  ok: boolean;
  runId?: string;
  summary: ImportResult[];
  error?: string;
}

const columnDefs: ColDef<ImportResult>[] = [
  { field: 'filename', headerName: 'שם קובץ', flex: 2, minWidth: 220 },
  { field: 'collection', headerName: 'קולקשן', flex: 1, minWidth: 130 },
  { field: 'rows', headerName: 'שורות', width: 100, type: 'numericColumn', valueFormatter: (p: { value: unknown }) => p.value != null ? Number(p.value).toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '' },
  {
    field: 'status',
    headerName: 'סטטוס',
    flex: 1,
    minWidth: 120,
    cellRenderer: (params: { value: string }) => {
      const map: Record<string, { label: string; color: string }> = {
        imported: { label: 'יובא', color: '#1a7f37' },
        skipped:  { label: 'דולג', color: '#9a6700' },
        replaced: { label: 'הוחלף', color: '#0969da' },
        error:    { label: 'שגיאה', color: '#cf222e' },
      };
      const cfg = map[params.value] ?? { label: params.value, color: '#1f2328' };
      return <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>;
    },
  },
  {
    field: 'error',
    headerName: 'הודעת שגיאה',
    flex: 2,
    minWidth: 200,
    cellStyle: { color: '#cf222e', fontSize: '12px' },
  },
];

export default function UploadPage() {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folderName, setFolderName] = useState<string>('');
  const [strategy, setStrategy] = useState<'skip' | 'replace'>('skip');
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [runId, setRunId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Filter only CSV files
    const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'));
    setSelectedFiles(csvFiles);
    // Extract folder name from webkitRelativePath
    if (files.length > 0) {
      const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
      const parts = firstPath.split('/');
      setFolderName(parts.length > 1 ? parts[0] : '');
    } else {
      setFolderName('');
    }
  };

  const handleClear = () => {
    setSelectedFiles([]);
    setFolderName('');
    setResults([]);
    setRunId('');
    setErrorMsg('');
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      setErrorMsg('יש לבחור תיקייה עם קבצי CSV');
      return;
    }
    setUploading(true);
    setErrorMsg('');
    setResults([]);
    setRunId('');

    try {
      const formData = new FormData();
      formData.append('strategy', strategy);
      for (const file of selectedFiles) {
        // Use only the base filename (not the full webkitRelativePath)
        const baseName = file.name;
        formData.append('files', file, baseName);
      }

      const res = await fetch('/api/import', { method: 'POST', body: formData });
      const data: ImportResponse = await res.json();
      setResults(data.summary ?? []);
      if (data.runId) setRunId(data.runId);
      if (!data.ok) setErrorMsg(data.error ?? 'שגיאה בייבוא');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'שגיאת רשת');
    } finally {
      setUploading(false);
    }
  };

  const importedCount  = results.filter((r) => r.status === 'imported').length;
  const skippedCount   = results.filter((r) => r.status === 'skipped').length;
  const replacedCount  = results.filter((r) => r.status === 'replaced').length;
  const errorCount     = results.filter((r) => r.status === 'error').length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1f2328] mb-1">העלאת קבצים</h1>
        <p className="text-[#636c76] text-sm">בחר תיקייה עם קבצי CSV ממשרד החינוך — כל הקבצים בתיקייה יעובדו אוטומטית</p>
      </div>

      <div className="grid gap-6">
        {/* Folder selection */}
        <div className="bg-white border border-[#d1d9e0] rounded-xl p-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-4">בחירת תיקייה</h2>

          {/* Drop zone / folder picker */}
          <label
            htmlFor="folder-input"
            className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[#d1d9e0]
              rounded-xl cursor-pointer hover:border-[#0969da] hover:bg-[#f6f8fa] transition-all"
          >
            <div className="text-center">
              <div className="text-4xl mb-2">📁</div>
              {folderName ? (
                <>
                  <p className="text-[#0969da] font-semibold text-sm">{folderName}</p>
                  <p className="text-[#636c76] text-xs mt-1">{selectedFiles.length} קבצי CSV נמצאו</p>
                </>
              ) : (
                <>
                  <p className="text-[#1f2328] text-sm font-medium">לחץ לבחירת תיקייה</p>
                  <p className="text-[#636c76] text-xs mt-1">כל קבצי ה-CSV בתיקייה יטענו אוטומטית</p>
                </>
              )}
            </div>
            <input
              id="folder-input"
              ref={folderInputRef}
              type="file"
              accept=".csv"
              // @ts-expect-error webkitdirectory not in standard types
              webkitdirectory=""
              multiple
              onChange={handleFolderChange}
              className="hidden"
            />
          </label>

          {/* File list preview */}
          {selectedFiles.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#636c76]">
                  {selectedFiles.length} קבצים נבחרו מהתיקייה <strong className="text-[#1f2328]">{folderName}</strong>
                </span>
                <button
                  onClick={handleClear}
                  className="text-xs text-[#cf222e] hover:text-[#a8191e] transition-colors"
                >
                  נקה
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-[#d1d9e0] divide-y divide-[#d1d9e0]">
                {selectedFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between px-3 py-2 hover:bg-[#f6f8fa]">
                    <span className="text-sm text-[#1f2328] font-mono truncate">{file.name}</span>
                    <span className="text-xs text-[#636c76] mr-3 flex-shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="bg-white border border-[#d1d9e0] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-[#1f2328]">אפשרויות ייבוא</h2>
            <ImportInfoButton
              title="דרישות ייבוא — קבצי CSV"
              columns={[
                { name: 'CHESHBONIT', required: true, note: 'חשבוניות — קוד_נושא, חודש_חישוב, חודש_תחולה, יתרת_ביצוע_החודש, סמל_מוטב, שם_מוטב, תאור_נושא' },
                { name: 'MUCARIM', note: 'מוכרים — קוד_נושא, חודש_חישוב, חודש_תחולה, הפרש_מחושב, סמל_מוסד, שם_מוסד' },
                { name: 'SHARATIM', note: 'שרתים מזכירים — קוד_נושא, חודש_חישוב, חודש_תחולה, הפרש_מחושב, סמל_מוסד, שם_מוסד' },
                { name: 'YADANIIM', note: 'ידניים — קוד_נושא, חודש_חישוב, חודש_תחולה, סכום_מחושב, סמל_מוסד, שם_מוסד' },
              ]}
              extra="שם הקובץ (ללא סיומת) חייב להתאים לשם הקולקשן. לדוגמה: CHESHBONIT.csv → קולקשן CHESHBONIT."
            />
          </div>
          <p className="text-sm text-[#636c76] mb-3">טיפול בקבצים שכבר יובאו בעבר:</p>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="strategy"
                value="skip"
                checked={strategy === 'skip'}
                onChange={() => setStrategy('skip')}
                className="mt-0.5 w-4 h-4 accent-[#0969da]"
              />
              <div>
                <span className="text-sm text-[#1f2328] group-hover:text-black font-medium">דלג על קובץ קיים</span>
                <p className="text-xs text-[#636c76] mt-0.5">אם הקובץ כבר קיים במסד — דלג עליו ללא שינוי</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="strategy"
                value="replace"
                checked={strategy === 'replace'}
                onChange={() => setStrategy('replace')}
                className="mt-0.5 w-4 h-4 accent-[#0969da]"
              />
              <div>
                <span className="text-sm text-[#1f2328] group-hover:text-black font-medium">החלף נתונים קיימים</span>
                <p className="text-xs text-[#636c76] mt-0.5">מחק את הנתונים הקיימים מאותו קובץ ויבא מחדש</p>
              </div>
            </label>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={uploading || selectedFiles.length === 0}
            className="px-6 py-2.5 bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 disabled:cursor-not-allowed
              text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <span className="animate-spin inline-block">⏳</span>
                <span>מייבא {selectedFiles.length} קבצים...</span>
              </>
            ) : (
              <>
                <span>📤</span>
                <span>
                  {selectedFiles.length > 0
                    ? `יבא ${selectedFiles.length} קבצים`
                    : 'בחר תיקייה תחילה'}
                </span>
              </>
            )}
          </button>
          {errorMsg && <p className="text-[#cf222e] text-sm">{errorMsg}</p>}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white border border-[#d1d9e0] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#d1d9e0] bg-[#f6f8fa]">
              <h2 className="text-base font-semibold text-[#1f2328]">תוצאות ייבוא</h2>
              {runId && <p className="text-xs text-[#636c76] mt-1">מזהה ריצה: {runId}</p>}
            </div>

            <div className="flex flex-wrap gap-3 px-6 py-4 border-b border-[#d1d9e0]">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#dafbe1] text-[#1a7f37] border border-[#1a7f37]">
                יובאו: {importedCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#fff8c5] text-[#9a6700] border border-[#9a6700]">
                דולגו: {skippedCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#ddf4ff] text-[#0969da] border border-[#0969da]">
                הוחלפו: {replacedCount}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#ffebe9] text-[#cf222e] border border-[#cf222e]">
                שגיאות: {errorCount}
              </span>
            </div>

            <div className="ag-theme-alpine" style={{ height: 400, width: '100%' }}>
              <AgGridReact<ImportResult>
                theme="legacy"
                rowData={results}
                columnDefs={columnDefs}
                enableRtl={true}
                defaultColDef={{ sortable: true, resizable: true }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
