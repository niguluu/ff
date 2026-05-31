import {
  executeLLMCall,
  extractToolInvocations,
  type Message,
} from "./llm.js";
import { MAX_TOOL_ROUNDS } from "./config.js";
import { pruneMessages } from "./conversation.js";
import { formatToolResultForDisplay } from "./message-format.js";
import { executeToolInvocation, isReadOnlyTool } from "./tools-registry.js";

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
      assistantResponse = await executeLLMCall(pruneMessages(conv), (chunk) => {
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
