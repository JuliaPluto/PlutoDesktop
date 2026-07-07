import { getRandomValues } from 'node:crypto';

// adapted from PlutoHash.js in fonsp/Pluto.jl
const urlSafeBase64 = (original: string) => {
  return original.replace(/[+/=]/g, (s) => {
    const c = s.charCodeAt(0);
    return c === 43 ? '-' : c === 47 ? '_' : '';
  });
};

const generateSecret = (length = 8) => {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error('Invalid key length');
  }

  const arr = new Uint8Array(Math.ceil((3 * length) / 4));
  getRandomValues(arr);
  const secretBase64 = Buffer.from(arr).toString('base64').slice(0, length);

  return urlSafeBase64(secretBase64);
};

export class Globals {
  public static PLUTO_LOCATION: string;
  public static PLUTO_SECRET: string = generateSecret();
  public static PLUTO_PORT: number;
  public static PLUTO_URL: URL;
  public static get PLUTO_STARTED(): boolean {
    return !!this.PLUTO_URL;
  }

  private static startResolvers: Array<() => void> = [];

  /**
   * Resolves once the Pluto server is up (PLUTO_URL is set). Callers that need
   * the server before acting — e.g. opening a notebook passed on the command
   * line — can await this instead of polling.
   */
  public static whenStarted(): Promise<void> {
    if (this.PLUTO_STARTED) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.startResolvers.push(resolve);
    });
  }

  /** Called by startup() once PLUTO_URL is set, to wake up whenStarted waiters. */
  public static markStarted(): void {
    const resolvers = this.startResolvers;
    this.startResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}
