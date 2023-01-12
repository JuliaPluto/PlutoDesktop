import 'electron-log';

declare module 'electron-log' {
  interface LogFunctions {
    announce(...params: any[]): void;
    log(...params: any[]): void;
    request(...params: any[]): void;
    response(...params: any[]): void;
    error(code: string, ...params: any[]): void;
  }
}

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
    'JULIA-VERSION': string;
    'JULIA-PATH': string;
  };

  type UserSettingsStore = {
    'CUSTOM-JULIA-PATH': string;
  };
}

export {};
