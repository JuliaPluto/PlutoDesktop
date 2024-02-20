import { generateSecret } from './util';

export class Globals {
  public static JULIA: string;
  public static JULIA_PROJECT: string;
  public static PLUTO_LOCATION: string;
  public static PLUTO_SECRET: string = generateSecret();
}
