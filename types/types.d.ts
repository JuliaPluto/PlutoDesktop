import 'electron-log';

declare module 'electron-log' {
  interface LogFunctions {
    announce(...params: any[]): void;
    log(...params: any[]): void;
    error(code: string, ...params: any[]): void;
  }
}

declare global {
  type Modify<T, R> = Omit<T, keyof R> & R;

  type PlutoURL = {
    url: string;
    port: string;
    secret: string;
  };

  type RunPlutoResponse = 'loading' | 'updating' | 'no_update' | PlutoURL;

  type SettingsStore = {
    readonly 'IMPORTANT-NOTE': string;
    'JULIA-PATH': string;
    'PLUTO-PRECOMPILED': string;
  };

  type UserSettingsStore = {
    'CUSTOM-JULIA-PATH': string;
  };
}

export {};
