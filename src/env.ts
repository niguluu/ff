import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LoadHomeEnvFileOptions {
  homeDir?: string;
  baseEnv?: NodeJS.ProcessEnv;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key.length > 0) {
      parsed[key] = value;
    }
  }

  return parsed;
}

export function loadHomeEnvFile(options: LoadHomeEnvFileOptions = {}): NodeJS.ProcessEnv {
  const homeDir = options.homeDir ?? os.homedir();
  const envFilePath = path.join(homeDir, ".env");
  const baseEnv: NodeJS.ProcessEnv = { ...(options.baseEnv ?? process.env) };

  if (!fs.existsSync(envFilePath)) {
    return baseEnv;
  }

  const parsed = parseEnvFile(fs.readFileSync(envFilePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (baseEnv[key] === undefined) {
      baseEnv[key] = value;
    }
  }

  return baseEnv;
}