declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production";
    readonly VITE_DEV_SERVER_HOST: string;
    readonly VITE_DEV_SERVER_PORT: string;
  }
}

declare global {
  export type PlutoURL = {
    url: string;
    port: string;
    secret: string;
  };

  export type RunPlutoResponse = "loading" | PlutoURL | Error;
}
