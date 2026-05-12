import { getRandomValues } from 'node:crypto';

// adapted from PlutoHash.js in fonsp/Pluto.jl
const urlSafeBase64 = (original: string) => {
  return original.replaceAll(/[\+\/\=]/g, (s) => {
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
  public static JULIA: string;
  public static JULIA_PROJECT: string;
  public static PLUTO_LOCATION: string;
  public static PLUTO_SECRET: string = generateSecret();
  public static PLUTO_URL: URL;
  public static get PLUTO_STARTED(): boolean {
    return !!this.PLUTO_URL;
  }
}
