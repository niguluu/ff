import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export { getFileSkeletonTool, readSymbolTool, replaceSymbolTool } from "./ast.js";

export function resolveAbsPath(pathStr: string): string {
  let p = pathStr;
  if (p.startsWith("~")) {
    p = p.replace("~", process.env.HOME || "~");
  }
  const resolved = resolve(p);
  if (resolved === p || p.startsWith("/")) return resolved;
  return resolve(process.cwd(), p);
}

export async function readFileTool(filename: string) {
  const fullPath = resolveAbsPath(filename);
  try {
    const content = await readFile(fullPath, "utf-8");
    return { file_path: fullPath, content };
  } catch (e: any) {
    return { file_path: fullPath, error: e.message as string };
  }
}

export async function listFilesTool(path: string) {
  const fullPath = resolveAbsPath(path);
  try {
    const items = await readdir(fullPath, { withFileTypes: true });
    return {
      path: fullPath,
      files: items.map((i) => ({
        filename: i.name,
        type: i.isFile() ? "file" : ("dir" as const),
      })),
    };
  } catch (e: any) {
    return { path: fullPath, error: e.message as string };
  }
}

export async function editFileTool(path: string, oldStr: string, newStr: string) {
  const fullPath = resolveAbsPath(path);
  try {
    if (oldStr === "") {
      await writeFile(fullPath, newStr, "utf-8");
      return { path: fullPath, action: "created_file" };
    }
    const original = await readFile(fullPath, "utf-8");
    if (!original.includes(oldStr)) {
      return { path: fullPath, action: "old_str not found" };
    }
    const edited = original.replace(oldStr, newStr);
    await writeFile(fullPath, edited, "utf-8");
    return { path: fullPath, action: "edited" };
  } catch (e: any) {
    return { path: fullPath, error: e.message as string };
  }
}


