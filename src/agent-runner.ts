import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  executeLLMCall,
  extractToolInvocations,
  type Message,
} from "./llm.js";
import { MAX_TOOL_ROUNDS } from "./config.js";
import { pruneMessages } from "./conversation.js";
import { formatToolResultForDisplay } from "./message-format.js";
import { executeToolInvocation, isReadOnlyTool } from "./tools-registry.js";
import { logger } from "./logger.js";

const WORKING_DIR = resolve(process.env.WORKING_DIR || process.cwd());
// Keep the injected index from blowing up the context on very large projects.
const MAX_INDEX_CHARS = Number(process.env.FFF_MAX_INDEX_CHARS ?? "60000");
// How often (in user prompts) to attach the codebase index to the request.
const INDEX_INJECT_EVERY = Number(process.env.FFF_INDEX_INJECT_EVERY ?? "10");

// Counts user prompts across the whole session so we can re-attach the codebase
// index every Nth prompt (prompt 1, 11, 21, …) rather than on every request.
let promptsHandled = 0;

/** Read codebase-index.yaml from the working dir, or null if it's missing. */
async function loadCodebaseIndex(): Promise<string | null> {
  try {
    const text = await readFile(join(WORKING_DIR, "codebase-index.yaml"), "utf-8");
    if (!text.trim()) return null;
    if (text.length > MAX_INDEX_CHARS) {
      return `${text.slice(0, MAX_INDEX_CHARS)}\n# …[truncated]`;
    }
    return text;
  } catch {
    return null;
  }
}

// Inject the index as an early user message (right after the system prompt) so
// the model treats it as background context. It is added only to the array sent
// to the LLM — never to the persisted conversation/transcript — so it does not
// accumulate or clutter the visible history.
function withCodebaseIndex(messages: Message[], indexText: string): Message[] {
  const indexMsg: Message = {
    role: "user",
    content: `Here is the current codebase index for context (codebase-index.yaml):\n\n${indexText}`,
  };
  const sysIdx = messages.findIndex((m) => m.role === "system");
  if (sysIdx === -1) return [indexMsg, ...messages];
  return [
    ...messages.slice(0, sysIdx + 1),
    indexMsg,
    ...messages.slice(sysIdx + 1),
  ];
}

export type RunAgentOptions = {
  conversation: Message[];
  userInput: string;
  onMessage: (message: Message) => void;
  onConversationChange: (messages: Message[]) => void;
  onStatusChange: (status: "idle" | "thinking") => void;
  onConnectingChange: (value: boolean) => void;
  onStreamingChange: (value: boolean) => void;
  onStreamingTextChange: (value: string) => void;
  appendStreamingText: (chunk: string) => void;
  onAutoScroll: () => void;
  streamingRef: { current: string };
  flushTimerRef: { current: ReturnType<typeof setTimeout> | null };
  isActiveRef: { current: boolean };
  scheduleFlush: () => void;
  flushNow: () => void;
};

export async function runAgent(options: RunAgentOptions) {
  const {
    conversation,
    userInput,
    onMessage,
    onConversationChange,
    onStatusChange,
    onConnectingChange,
    onStreamingChange,
    onStreamingTextChange,
    appendStreamingText,
    onAutoScroll,
    streamingRef,
    flushTimerRef,
    isActiveRef,
    scheduleFlush,
    flushNow,
  } = options;

  if (isActiveRef.current) return conversation;
  isActiveRef.current = true;

  // Attach the codebase index to the request once every INDEX_INJECT_EVERY
  // prompts (the first prompt of each block: 1, 11, 21, …).
  promptsHandled++;
  const shouldInjectIndex = (promptsHandled - 1) % INDEX_INJECT_EVERY === 0;
  let indexText: string | null = null;
  if (shouldInjectIndex) {
    indexText = await loadCodebaseIndex();
    logger.info("agent", "codebase index injection", {
      prompt: promptsHandled,
      attached: indexText !== null,
    });
  }

  let conv: Message[] = [...conversation, { role: "user", content: userInput }];
  onConversationChange(conv);
  onMessage({ role: "user", content: userInput });
  onAutoScroll();
  onStatusChange("thinking");

  let iteration = 0;

  while (true) {
    if (iteration >= MAX_TOOL_ROUNDS) {
      const limitMsg = `Reached maximum of ${MAX_TOOL_ROUNDS} tool rounds. Stopping to prevent infinite loops.`;
      onMessage({ role: "assistant", content: limitMsg });
      conv = [...conv, { role: "assistant", content: limitMsg }];
      onConversationChange(conv);
      break;
    }
    iteration++;

    onAutoScroll();
    onConnectingChange(true);
    onStreamingChange(true);
    onStreamingTextChange("");
    streamingRef.current = "";

    let assistantResponse: string;
    try {
      const llmMessages = indexText
        ? withCodebaseIndex(pruneMessages(conv), indexText)
        : pruneMessages(conv);
      assistantResponse = await executeLLMCall(llmMessages, (chunk) => {
        streamingRef.current += chunk;
        scheduleFlush();
      });

      flushNow();
      const pending = streamingRef.current;
      streamingRef.current = "";
      if (pending) {
        appendStreamingText(pending);
      }
      onConnectingChange(false);
    } catch (error: any) {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      streamingRef.current = "";
      onConnectingChange(false);
      onStreamingTextChange("");
      onStreamingChange(false);

      const errorMsg = `LLM Error: ${error.message ?? String(error)}`;
      onMessage({ role: "assistant", content: errorMsg });
      conv = [...conv, { role: "assistant", content: errorMsg }];
      onConversationChange(conv);
      break;
    }

    if (assistantResponse.trim() === "") {
      assistantResponse = "(received empty response from model)";
    }

    streamingRef.current = "";
    onConnectingChange(false);
    onStreamingTextChange("");
    onStreamingChange(false);

    const { invocations, errors } = extractToolInvocations(assistantResponse);

    if (errors.length > 0) {
      for (const error of errors) {
        const errMsg = `tool_parse_error: ${error.error} in line: ${error.raw}`;
        onMessage({ role: "user", content: errMsg });
        conv = [...conv, { role: "user", content: errMsg }];
        onConversationChange(conv);
      }
    }

    onMessage({ role: "assistant", content: assistantResponse });
    conv = [...conv, { role: "assistant", content: assistantResponse }];
    onConversationChange(conv);

    if (invocations.length === 0) {
      break;
    }

    let index = 0;
    while (index < invocations.length) {
      const invocation = invocations[index]!;

      if (isReadOnlyTool(invocation.name)) {
        const batch = [invocation];
        index++;
        while (index < invocations.length && isReadOnlyTool(invocations[index]!.name)) {
          batch.push(invocations[index]!);
          index++;
        }

        const responses = await Promise.all(
          batch.map(async (item) => ({
            invocation: item,
            response: await executeToolInvocation(item.name, item.args),
          }))
        );

        for (const { invocation: item, response } of responses) {
          conv = [...conv, { role: "user", content: `tool_result(${JSON.stringify(response)})` }];
          onConversationChange(conv);
          onMessage({
            role: "user",
            content: formatToolResultForDisplay(item.name, response),
          });
        }
        continue;
      }

      const response = await executeToolInvocation(invocation.name, invocation.args);
      conv = [...conv, { role: "user", content: `tool_result(${JSON.stringify(response)})` }];
      onConversationChange(conv);
      onMessage({
        role: "user",
        content: formatToolResultForDisplay(invocation.name, response),
      });
      index++;
    }
  }

  const prunedConversation = pruneMessages(conv);
  onConversationChange(prunedConversation);
  onStatusChange("idle");
  isActiveRef.current = false;
  return prunedConversation;
}
