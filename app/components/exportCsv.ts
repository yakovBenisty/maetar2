export interface CsvColumn {
  header: string;
  field?: string;
  getValue?: (row: Record<string, unknown>) => unknown;
}

export function exportToCsv(
  filename: string,
  columns: CsvColumn[],
  rows: Record<string, unknown>[]
): void {
  const BOM = '\uFEFF';
  const esc = (val: unknown): string => {
    if (val == null) return '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };
  const header = columns.map((c) => esc(c.header)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = c.getValue ? c.getValue(row) : c.field != null ? row[c.field] : '';
          return esc(val);
        })
        .join(',')
    )
    .join('\r\n');
  const csv = BOM + header + '\r\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
