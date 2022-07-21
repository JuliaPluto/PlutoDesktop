declare global {
  type PlutoURL = {
    url: string;
    port: string;
    secret: string;
  };

  type RunPlutoResponse = 'loading' | 'updating' | 'no_update' | PlutoURL;

  type SettingsStore = {
    'JULIA-PATH': string;
    'PLUTO-PRECOMPILED': string;
  };

  type UserSettingsStore = {
    'CUSTOM-JULIA-PATH': string;
  };
}

export {};
