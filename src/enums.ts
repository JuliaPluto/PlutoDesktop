export const PlutoExport = {
  FILE: 'file',
  HTML: 'html',
  STATE: 'state',
  PDF: 'pdf',
} as const;

export type PlutoExportType = (typeof PlutoExport)[keyof typeof PlutoExport];
