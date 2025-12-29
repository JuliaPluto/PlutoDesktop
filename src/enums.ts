// enum PlutoExport {
//   FILE,
//   HTML,
//   STATE,
//   PDF,
// }

const PlutoExport = {
  FILE: 'file',
  HTML: 'html',
  STATE: 'state',
  PDF: 'pdf',
} as const;

// globally available types
declare global {
  type Modify<T, R> = Omit<T, keyof R> & R;

  type TableRow = {
    key: string;
    value: string;
  };

  type PlutoURL = {
    url: string;
    port: string;
    secret: string;
  };

  type RunPlutoResponse = 'loading' | 'updating' | 'no_update' | PlutoURL;

  type SettingsStore = {
    readonly 'IMPORTANT-NOTE': string;
  };
}

export { PlutoExport };
