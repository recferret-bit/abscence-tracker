/**
 * Minimal RFC 4180-ish CSV serialiser. No external deps.
 * Fields containing comma, quote, or newline are wrapped in quotes; quotes are doubled.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str =
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map((c) => escape(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => escape(row[c.key])).join(','),
  );
  return [headerLine, ...bodyLines].join('\r\n');
}

/**
 * Triggers a browser download of the given CSV string. Prepends a BOM so Excel
 * opens UTF-8 files correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
