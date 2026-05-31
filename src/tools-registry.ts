import {
  readFileTool,
  listFilesTool,
  editFileTool,
  atomicOverwriteTool,
} from "./tools.js";

const TOOL_REGISTRY = {
  read_file: readFileTool,
  list_files: listFilesTool,
  edit_file: editFileTool,
  atomic_overwrite: atomicOverwriteTool,
} as const;

type ToolName = keyof typeof TOOL_REGISTRY;

interface ReadFileArgs {
  filename?: string;
  limit?: number;
}

interface ListFilesArgs {
  path?: string;
}

interface EditFileArgs {
  path?: string;
  old_str?: string;
  new_str?: string;
}

interface AtomicOverwriteArgs {
  filename?: string;
  new_content?: string;
  newContent?: string;
}

const TOOL_ARG_PARSERS: Record<ToolName, (args: unknown) => unknown[]> = {
  read_file: (args) => {
    if (typeof args === "string") return [args];
    const a = args as ReadFileArgs;
    const filename = a.filename ?? ".";
    const limit = a.limit;
    return limit !== undefined ? [filename, limit] : [filename];
  },
  list_files: (args) => {
    if (typeof args === "string") return [args];
    const a = args as ListFilesArgs;
    return [a.path ?? "."];
  },
  edit_file: (args) => {
    if (typeof args === "string") {
      throw new Error("edit_file requires an object with path, old_str, new_str");
    }
    const a = args as EditFileArgs;
    return [a.path ?? ".", a.old_str ?? "", a.new_str ?? ""];
  },
  atomic_overwrite: (args) => {
    if (typeof args === "string") {
      throw new Error(
        "atomic_overwrite requires an object with filename, new_content"
      );
    }
    const a = args as AtomicOverwriteArgs;
    return [a.filename ?? ".", a.new_content ?? a.newContent ?? ""];
  },
};

export function isReadOnlyTool(name: string) {
  return name === "read_file" || name === "list_files";
}

export async function executeToolInvocation(name: string, args: unknown) {
  const tool = (TOOL_REGISTRY as Record<string, Function>)[name];
  const parser = (TOOL_ARG_PARSERS as Record<string, Function>)[name];

  if (!tool) {
    return { error: `unknown tool: ${name}` };
  }

  if (!parser) {
    return { error: `no arg parser for tool: ${name}` };
  }

  try {
    const parsedArgs = parser(args);
    return await tool(...parsedArgs);
  } catch (error: any) {
    return { error: error.message ?? String(error) };
  }
}
