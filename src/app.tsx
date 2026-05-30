import { useState, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  readFileTool,
  listFilesTool,
  editFileTool,
  getFileSkeletonTool,
  readSymbolTool,
  replaceSymbolTool,
} from "./tools.js";
import {
  executeLLMCall,
  extractToolInvocations,
  getSystemPrompt,
  type Message,
} from "./llm.js";

const TOOL_REGISTRY: Record<string, (...args: any[]) => Promise<any>> = {
  read_file: readFileTool,
  list_files: listFilesTool,
  edit_file: editFileTool,
  get_file_skeleton: getFileSkeletonTool,
  read_symbol: readSymbolTool,
  replace_symbol: replaceSymbolTool,
};

const SYSTEM_PROMPT = getSystemPrompt();

const YOU_COLOR = "blue";
const ASSISTANT_COLOR = "yellow";
const TOOL_COLOR = "gray";

export default function App() {
  const { exit } = useApp();
  const [displayMessages, setDisplayMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking">("idle");
  const convRef = useRef<Message[]>([
    { role: "system", content: SYSTEM_PROMPT },
  ]);

  const runAgent = useCallback(async (userInput: string) => {
    let conv: Message[] = [
      ...convRef.current,
      { role: "user", content: userInput },
    ];
    convRef.current = conv;
    setDisplayMessages((prev) => [...prev, { role: "user", content: userInput }]);
    setStatus("thinking");

    try {
      while (true) {
        const assistantResponse = await executeLLMCall(conv);
        const toolInvocations = extractToolInvocations(assistantResponse);

        if (toolInvocations.length === 0) {
          conv = [...conv, { role: "assistant", content: assistantResponse }];
          convRef.current = conv;
          setDisplayMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantResponse },
          ]);
          setStatus("idle");
          break;
        }

        conv = [...conv, { role: "assistant", content: assistantResponse }];
        convRef.current = conv;
        setDisplayMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantResponse },
        ]);

        for (const { name, args } of toolInvocations) {
          const tool = TOOL_REGISTRY[name];
          let resp: any;
          if (!tool) {
            resp = { error: `unknown tool: ${name}` };
          } else if (name === "read_file") {
            const filename = typeof args === "string" ? args : (args as any).filename ?? ".";
            resp = await tool(filename);
          } else if (name === "list_files") {
            const path = typeof args === "string" ? args : (args as any).path ?? ".";
            resp = await tool(path);
          } else if (name === "edit_file") {
            if (typeof args === "string") {
              resp = { error: "edit_file requires an object with path, old_str, new_str" };
            } else {
              resp = await tool(
                (args as any).path ?? ".",
                (args as any).old_str ?? "",
                (args as any).new_str ?? ""
              );
            }
          } else if (name === "get_file_skeleton") {
            const filename = typeof args === "string" ? args : (args as any).filename ?? ".";
            resp = await tool(filename);
          } else if (name === "read_symbol") {
            if (typeof args === "string") {
              resp = { error: "read_symbol requires an object with filename, symbol_name" };
            } else {
              resp = await tool(
                (args as any).filename ?? ".",
                (args as any).symbol_name ?? (args as any).symbolName ?? ""
              );
            }
          } else if (name === "replace_symbol") {
            if (typeof args === "string") {
              resp = { error: "replace_symbol requires an object with filename, symbol_name, new_code" };
            } else {
              resp = await tool(
                (args as any).filename ?? ".",
                (args as any).symbol_name ?? (args as any).symbolName ?? "",
                (args as any).new_code ?? (args as any).newCode ?? ""
              );
            }
          } else {
            resp = { error: "unhandled tool" };
          }

          const resultStr = `tool_result(${JSON.stringify(resp)})`;
          conv = [...conv, { role: "user", content: resultStr }];
          convRef.current = conv;
          setDisplayMessages((prev) => [
            ...prev,
            { role: "user", content: resultStr },
          ]);
        }
      }
    } catch (err: any) {
      const errorMsg = `Error: ${err.message ?? String(err)}`;
      conv = [...conv, { role: "assistant", content: errorMsg }];
      convRef.current = conv;
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", content: errorMsg },
      ]);
      setStatus("idle");
    }
  }, []);

  useInput((char, key) => {
    if (key.return) {
      if (input.trim().length > 0 && status === "idle") {
        const text = input.trim();
        setInput("");
        runAgent(text);
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if ((key.ctrl && char === "c") || key.escape) {
      exit();
    } else if (!key.ctrl && !key.meta && char && status === "idle") {
      setInput((prev) => prev + char);
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" flexGrow={1}>
        {displayMessages.map((msg, i) => {
          if (msg.role === "system") return null;
          const isTool = msg.content.startsWith("tool_result(");
          if (msg.role === "user" && !isTool) {
            return (
              <Box key={i} flexDirection="row">
                <Text color={YOU_COLOR} bold>
                  {"You: "}
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );
          }
          if (msg.role === "assistant") {
            return (
              <Box key={i} flexDirection="row">
                <Text color={ASSISTANT_COLOR} bold>
                  {"Assistant: "}
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );
          }
          if (isTool) {
            return (
              <Box key={i} flexDirection="row">
                <Text color={TOOL_COLOR} bold>
                  {"Tool: "}
                </Text>
                <Text color={TOOL_COLOR}>
                  {msg.content.slice(12, msg.content.length - 1)}
                </Text>
              </Box>
            );
          }
          return null;
        })}
        {status === "thinking" && (
          <Box>
            <Text color={ASSISTANT_COLOR} bold>
              {"Assistant: "}
            </Text>
            <Text color={ASSISTANT_COLOR}>Thinking...</Text>
          </Box>
        )}
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Text color={YOU_COLOR} bold>{"> "}</Text>
        <Text>{input}</Text>
        {status === "idle" && <Text color="white">{"█"}</Text>}
      </Box>
    </Box>
  );
}
