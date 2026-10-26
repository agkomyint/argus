"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Check, Copy, RotateCcw, Square } from "lucide-react";
import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";

const PROMPTS = [
  "What alerts need my review?",
  "Summarise the latest observations",
  "Which files have I uploaded?",
  "Which data products are enabled?",
];

export function Assistant({ projectName, chatId, initialMessages }: { projectName: string; chatId?: string; initialMessages?: UIMessage[] }) {
  const router = useRouter();
  const [id] = useState(() => chatId ?? crypto.randomUUID());
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    id,
    messages: initialMessages,
    onFinish: () => {
      // First reply of a new chat: move to its own URL and refresh the history list.
      if (!chatId && window.location.pathname !== `/dashboard/assistant/${id}`) window.history.replaceState(null, "", `/dashboard/assistant/${id}`);
      router.refresh();
    },
  });
  const busy = status === "streaming" || status === "submitted";

  function send(text: string) {
    if (!text.trim() || busy) return;
    void sendMessage({ text });
    setInput("");
    if (area.current) area.current.style.height = "auto";
  }

  const lastId = messages.at(-1)?.id;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] min-h-96 w-full max-w-3xl flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="gap-6 px-0">
          {messages.length === 0 ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{projectName}</p>
              <h1 className="mt-3 text-3xl font-medium tracking-tight">What do you want to know?</h1>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">Answers come from this project’s real files, observations and alerts. Nothing is guessed.</p>
              <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="border px-4 py-3 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const text = m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("\n");
              return (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.parts.map((part, i) => {
                      if (part.type === "text") return m.role === "assistant" ? <MessageResponse key={i}>{part.text}</MessageResponse> : <span key={i}>{part.text}</span>;
                      if (part.type.startsWith("tool-")) {
                        const t = part as Extract<typeof part, { type: `tool-${string}` }>;
                        return (
                          <Tool key={i}>
                            <ToolHeader type={t.type} state={t.state} />
                            <ToolContent>
                              <ToolInput input={t.input} />
                              <ToolOutput output={t.output} errorText={t.errorText} />
                            </ToolContent>
                          </Tool>
                        );
                      }
                      return null;
                    })}
                    {m.role === "assistant" && !text && busy && m.id === lastId && <Shimmer>Looking at your data…</Shimmer>}
                  </MessageContent>
                  {m.role === "assistant" && text && !(busy && m.id === lastId) && (
                    <MessageActions>
                      <MessageAction
                        label="Copy"
                        tooltip="Copy"
                        onClick={() => {
                          void navigator.clipboard.writeText(text);
                          setCopied(m.id);
                          setTimeout(() => setCopied(null), 1500);
                        }}
                      >
                        {copied === m.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      </MessageAction>
                      {m.id === lastId && (
                        <MessageAction label="Regenerate" tooltip="Regenerate" onClick={() => void regenerate()}>
                          <RotateCcw className="size-3.5" />
                        </MessageAction>
                      )}
                    </MessageActions>
                  )}
                </Message>
              );
            })
          )}
          {status === "submitted" && messages.at(-1)?.role === "user" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error.message}
        </p>
      )}

      {messages.length > 0 && messages.length < 3 && (
        <Suggestions className="pb-2">
          {PROMPTS.map((p) => (
            <Suggestion key={p} suggestion={p} onClick={send} />
          ))}
        </Suggestions>
      )}

      <form
        className="mb-2 flex items-end gap-2 rounded-3xl border bg-background py-2 pl-5 pr-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={area}
          value={input}
          rows={1}
          aria-label="Message ARGUS"
          placeholder="Message ARGUS"
          className="max-h-48 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        {busy ? (
          <button type="button" aria-label="Stop" onClick={() => void stop()} className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim()}
            className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity", !input.trim() && "opacity-30")}
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </form>
      <p className="pb-1 text-center text-[11px] text-muted-foreground">ARGUS can be wrong. Check evidence on the Alerts page before acting.</p>
    </div>
  );
}
