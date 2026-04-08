import { writeFileSync } from 'node:fs';

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function writeCsv(rows: Record<string, unknown>[], path: string): void {
  if (rows.length === 0) {
    writeFileSync(path, '');
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n');
}
