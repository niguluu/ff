import OpenAI from "openai";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, resolve, extname } from "node:path";
import { logger } from "../utils/logger";

const ROOT = resolve(process.env.WORKING_DIR || process.cwd());
const INDEX_MODEL = process.env.FFF_INDEX_MODEL ?? "deepseek-chat";

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".fff",
  "vendor",
  ".cache",
  "coverage",
]);

const CODE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".sh", ".yaml", ".yml", ".md",
]);

interface FileEntry {
  rel: string;
  head: string;
}

async function walk(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await walk(join(dir, e.name), acc);
    } else if (e.isFile()) {
      if (e.name.startsWith(".") && e.name !== ".env.example") continue;
      if (CODE_EXTS.has(extname(e.name)) || e.name === "package.json") {
        acc.push(join(dir, e.name));
      }
    }
  }
}

async function collectFiles(): Promise<FileEntry[]> {
  const paths: string[] = [];
  await walk(ROOT, paths);
  const entries: FileEntry[] = [];
  for (const p of paths) {
    try {
      const s = await stat(p);
      if (s.size > 200_000) continue;
      const text = await readFile(p, "utf-8");
      const head = text.split("\n").slice(0, 30).join("\n").slice(0, 1500);
      entries.push({ rel: relative(ROOT, p), head });
    } catch {
      /* unreadable; skip */
    }
  }
  return entries.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function describeFiles(entries: FileEntry[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    logger.warn("indexer", "no OPENAI_API_KEY; using fallback descriptions");
    for (const e of entries) result.set(e.rel, fallbackDescription(e.rel));
    return result;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1",
  });

  const BATCH = 20;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const listing = batch
      .map((e) => `### ${e.rel}\n${e.head}`)
      .join("\n\n");
    const prompt =
      `For each file below, write ONE concise sentence describing its purpose. ` +
      `Respond ONLY with a JSON object mapping the exact file path to its description. No prose, no markdown fences.\n\n` +
      listing;
    try {
      const resp = await client.chat.completions.create({
        model: INDEX_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: "You summarize source files for a codebase index. Output strict JSON only." },
          { role: "user", content: prompt },
        ],
      });
      const content = resp.choices[0]?.message?.content ?? "";
      const json = extractJson(content);
      const parsed = json ? (JSON.parse(json) as Record<string, string>) : {};
      for (const e of batch) {
        result.set(e.rel, (parsed[e.rel] || fallbackDescription(e.rel)).trim());
      }
    } catch (err: any) {
      logger.error("indexer", "batch failed; using fallback", { error: err?.message });
      for (const e of batch) result.set(e.rel, fallbackDescription(e.rel));
    }
  }
  return result;
}

function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}

function fallbackDescription(rel: string): string {
  return `Source file: ${rel}`;
}

function yamlEscape(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function readProjectMeta(): Promise<{ name: string; version: string; description: string }> {
  try {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf-8"));
    return {
      name: pkg.name ?? "fff",
      version: pkg.version ?? "1.0.0",
      description: pkg.description ?? "Terminal AI coding assistant",
    };
  } catch {
    return { name: "fff", version: "1.0.0", description: "Terminal AI coding assistant" };
  }
}

export async function runIndexer(): Promise<string> {
  logger.info("indexer", "starting", { root: ROOT, model: INDEX_MODEL });
  const entries = await collectFiles();
  const descriptions = await describeFiles(entries);
  const meta = await readProjectMeta();

  const lines: string[] = [];
  lines.push("# fff - Codebase Index");
  lines.push(`# Generated: ${new Date().toISOString()} via ${INDEX_MODEL}`);
  lines.push("");
  lines.push("project:");
  lines.push(`  name: ${meta.name}`);
  lines.push(`  version: ${meta.version}`);
  lines.push(`  description: ${yamlEscape(meta.description)}`);
  lines.push("  language: TypeScript");
  lines.push("  runtime: Bun");
  lines.push("");
  lines.push("files:");
  for (const e of entries) {
    lines.push(`  - path: ${e.rel}`);
    lines.push(`    description: ${yamlEscape(descriptions.get(e.rel) ?? fallbackDescription(e.rel))}`);
  }
  lines.push("");

  const outPath = join(ROOT, "codebase-index.yaml");
  await writeFile(outPath, lines.join("\n"), "utf-8");
  logger.info("indexer", "wrote index", { path: outPath, files: entries.length });
  return outPath;
}
