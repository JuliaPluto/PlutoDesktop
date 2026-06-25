import fs from "node:fs";
import net from "node:net";

import { Globals } from "./globals";

export function fetchPluto(input: string | URL, init: RequestInit = {}) {
  return fetch(new URL(input, Globals.PLUTO_URL), {
    ...init,
    headers: {
      ...init.headers,
      Connection: "keep-alive",
    },
  });
}

export function withSearchParams(
  input: string | URL,
  params: Record<string, string | null | undefined>,
) {
  const url = new URL(input, Globals.PLUTO_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

export const PLUTO_FILE_EXTENSIONS = [
  ".pluto.jl",
  ".Pluto.jl",
  ".nb.jl",
  ".jl",
  ".plutojl",
  ".pluto",
  ".nbjl",
  ".pljl",
  ".pluto.jl.txt",
  ".jl.txt",
];

export const isExtMatch = (file: string) =>
  PLUTO_FILE_EXTENSIONS.some((extension) => file.endsWith(extension));

export function copyDirectoryRecursive(source: string, destination: string) {
  if (!fs.existsSync(source)) {
    throw new Error(`Source directory does not exist: ${source}`);
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

export async function findOpenPort(start: number) {
  for (let port = start; port < start + 100; port += 1) {
    if (await isPortOpen(port)) return port;
  }
  throw new Error(`Could not find an open port near ${start}.`);
}

function isPortOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
