import fs from "node:fs";

import { DEPOT_LOCATION, getAssetPath, getGeneratedAssetPath } from "./paths";
import { generalLogger, juliaLogger } from "./logger";

export const plutoProject =
  process.env.DEBUG_PROJECT_PATH ?? getAssetPath("env_for_julia");

let juliaExecutable: string | null = null;

export function findJulia() {
  if (juliaExecutable) return juliaExecutable;

  const files = fs.existsSync(getGeneratedAssetPath("."))
    ? fs.readdirSync(getGeneratedAssetPath("."))
    : [];
  const juliaDir = files.find((name) => /^julia-\d+\.\d+\.\d+$/.test(name));

  if (!juliaDir) {
    generalLogger.warn(
      "Could not find bundled Julia in generated assets; falling back to `julia`.",
    );
    juliaExecutable = "julia";
  } else {
    juliaExecutable = getGeneratedAssetPath(juliaDir, "bin", "julia.exe");
  }

  return juliaExecutable;
}

let plutoLocation: string | null = null;

export async function findPluto(): Promise<string> {
  if (plutoLocation) return plutoLocation;

  const proc = Bun.spawn(
    [findJulia(), `--project=${plutoProject}`, getAssetPath("locate_pluto.jl")],
    {
      env: { ...process.env, JULIA_DEPOT_PATH: DEPOT_LOCATION },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;

  if (stderr.trim()) juliaLogger.warn(stderr.trim());
  if (code !== 0 || !stdout.trim()) {
    throw new Error("Pluto could not be found with locate_pluto.jl.");
  }

  plutoLocation = stdout.trim();
  return plutoLocation;
}
