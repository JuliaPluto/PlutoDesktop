import { generateSecret } from './util';

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
