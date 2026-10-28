"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, AtSign, Check, ChevronDown, Clock, Copy, Database, FolderKanban, History, Plus, RotateCcw, Sparkles, Square, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { deleteChat, listChats, loadChat, type ChatSummary } from "@/app/chat-actions";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { starters, TOOL_LABELS, type AskMessage, type AskProject } from "@/lib/assistant";
import { cn } from "@/lib/utils";

export type PanelProps = {
  projects: AskProject[];
  /** The project on screen. A new chat starts @-mentioning it. */
  current?: string;
  /** A recorded conversation to play back read-only: previews and /explore. No model calls. */
  recorded?: AskMessage[];
  /** Text already typed in the box, e.g. "@har" to show the mention menu in a preview. */
  draft?: string;
  /** An error to show as if the last request failed. Previews only. */
  failure?: string;
  onClose?: () => void;
  className?: string;
};

/** The chat itself. Used in the drawer, and on its own in /design. */
export function AskPanel({ projects, current, recorded, draft, failure, onClose, className }: PanelProps) {
  // A new chat has no id until its first message is sent (see askTransport).
  const [chat, setChat] = useState<{ key: number; id: string | null; messages: AskMessage[] }>({ key: 0, id: null, messages: [] });
  const [view, setView] = useState<"chat" | "history">("chat");

  const open = async (id: string) => {
    const messages = await loadChat(id);
    if (messages) setChat((c) => ({ key: c.key + 1, id, messages }));
    setView("chat");
  };
  const fresh = () => { setChat((c) => ({ key: c.key + 1, id: null, messages: [] })); setView("chat"); };

  return (
    <section
      onKeyDown={(e) => e.stopPropagation()}
      className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground", className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_100%_at_20%_0%,color-mix(in_oklab,var(--electric)_22%,transparent),transparent)]" />
      <header className="relative flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <Orb />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Ask ARGUS</p>
          <p className="truncate text-[11px] text-muted-foreground">{recorded ? "Recorded conversation · replay" : "Muse Spark reads your data · code does the maths"}</p>
        </div>
        {!recorded && (
          <>
            <IconButton label={view === "history" ? "Back to chat" : "Past chats"} onClick={() => setView(view === "history" ? "chat" : "history")} active={view === "history"}><History className="size-4" /></IconButton>
            <IconButton label="New chat" onClick={fresh}><Plus className="size-4" /></IconButton>
          </>
        )}
        {onClose && <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>}
      </header>

      {view === "history" ? (
        <HistoryList onOpen={open} active={chat.id} />
      ) : recorded ? (
        <ChatView projects={projects} current={current} messages={recorded} status="ready" draft={draft} error={failure} replay />
      ) : (
        <LiveChat key={chat.key} id={chat.id} initial={chat.messages} projects={projects} current={current} draft={draft} failure={failure} />
      )}
    </section>
  );
}

function LiveChat({ id, initial, projects, current, draft, failure }: { id: string | null; initial: AskMessage[]; projects: AskProject[]; current?: string; draft?: string; failure?: string }) {
  const [transport] = useState(() => askTransport(id, current));
  const { messages, sendMessage, status, error, stop, regenerate } = useChat<AskMessage>({ id: useId(), messages: initial, transport });
  return (
    <ChatView
      projects={projects}
      current={current}
      messages={messages}
      status={status}
      draft={draft}
      error={failure ?? (error ? friendly(error.message) : undefined)}
      onSend={(text, mentions) => void sendMessage({ text, metadata: { mentions } })}
      onStop={() => void stop()}
      onRetry={() => void regenerate()}
    />
  );
}

/** Posts to /api/chat. A new chat gets its id on the first send, so nothing random runs while rendering. */
function askTransport(id: string | null, home?: string) {
  let chatId = id;
  return new DefaultChatTransport<AskMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages, body }) => {
      chatId ??= crypto.randomUUID();
      return { body: { ...body, messages, id: chatId, home } };
    },
  });
}

function friendly(message: string) {
  let text = message;
  try { text = (JSON.parse(message) as { error?: string }).error ?? message; } catch {}
  if (/META_API_KEY/.test(text)) return "The AI is not connected on this server yet. Add META_API_KEY and try again.";
  if (/Not signed in/.test(text)) return "Sign in to ask about your projects.";
  return text || "Something went wrong. Try again.";
}

function ChatView({ projects, current, messages, status, draft = "", error, replay = false, onSend, onStop, onRetry }: {
  projects: AskProject[]; current?: string; messages: AskMessage[]; status: ChatStatus; draft?: string; error?: string; replay?: boolean;
  onSend?: (text: string, mentions: string[]) => void; onStop?: () => void; onRetry?: () => void;
}) {
  const [mentions, setMentions] = useState<string[]>(() => (current && projects.some((p) => p.id === current) ? [current] : []));
  const busy = status === "streaming" || status === "submitted";
  const scope = mentions.length ? projects.filter((p) => mentions.includes(p.id)) : projects;
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const lastId = messages.at(-1)?.id;

  const send = (text: string) => {
    if (!text.trim() || busy || replay) return;
    onSend?.(text.trim(), mentions);
  };

  return (
    <>
      <Conversation className="relative min-h-0 flex-1">
        <ConversationContent className="gap-5 px-4 py-3">
          {messages.length === 0 ? (
            <Welcome scope={scope} all={mentions.length === 0} onPick={send} disabled={replay} />
          ) : (
            messages.map((m) => <Bubble key={m.id} m={m} byId={byId} streaming={busy && m.id === lastId} canRetry={!replay && !busy && m.id === lastId} onRetry={onRetry} />)
          )}
          {status === "submitted" && messages.at(-1)?.role === "user" && (
            <div className="flex items-center gap-2.5"><Orb small busy /><Shimmer className="text-sm">Looking at your data…</Shimmer></div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
              <span className="flex-1">{error}</span>
              {onRetry && messages.length > 0 && <button type="button" onClick={onRetry} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">Retry</button>}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3 size-8" />
      </Conversation>

      <Composer
        projects={projects}
        mentions={mentions}
        setMentions={setMentions}
        busy={busy}
        disabled={replay}
        draft={draft}
        onSend={send}
        onStop={onStop}
      />
    </>
  );
}

function Welcome({ scope, all, onPick, disabled }: { scope: AskProject[]; all: boolean; onPick: (t: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-start pt-4">
      <Orb large />
      <h2 className="mt-4 text-xl font-semibold tracking-tight">Hi! What do you want to know?</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {scope.length === 0
          ? "You have no projects yet. Create one in ARGUS Studio, then ask me about it here."
          : all
          ? `I can see all ${scope.length} of your projects. Type @ to pick one.`
          : `Asking about ${scope.map((p) => p.name).join(" and ")}. Remove the tag to ask about everything.`}
      </p>
      <div className="mt-5 grid w-full gap-2">
        {scope.length > 0 && starters(scope).map((q, i) => (
          <motion.button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.25 }}
            className="group flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2.5 text-left text-sm transition-colors hover:border-electric/50 hover:bg-electric/5 disabled:pointer-events-none"
          >
            <Sparkles className="size-3.5 shrink-0 text-electric/70 transition-colors group-hover:text-electric" />
            <span className="flex-1">{q}</span>
            <ArrowUp className="size-3.5 rotate-45 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </motion.button>
        ))}
      </div>
      {scope.length === 0 && <p className="mt-4 text-sm text-muted-foreground">You have no projects yet. Make one and ask away.</p>}
    </div>
  );
}

function Bubble({ m, byId, streaming, canRetry, onRetry }: { m: AskMessage; byId: Map<string, AskProject>; streaming: boolean; canRetry: boolean; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

  if (m.role === "user") {
    const tags = (m.metadata?.mentions ?? []).flatMap((id) => byId.get(id) ?? []);
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
        {tags.length > 0 && <div className="flex flex-wrap justify-end gap-1">{tags.map((p) => <Tag key={p.id} name={p.name} />)}</div>}
        <p className="rounded-2xl rounded-br-md bg-electric px-3.5 py-2 text-sm whitespace-pre-wrap text-white">{text}</p>
      </motion.div>
    );
  }

  const steps = m.parts.filter((p) => p.type.startsWith("tool-"));
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-2.5">
      <Orb small busy={streaming} />
      <div className="min-w-0 flex-1 space-y-2">
        {steps.length > 0 && <Steps parts={steps as unknown as ToolPart[]} byId={byId} />}
        {text ? (
          <MessageResponse className="text-sm leading-relaxed [&_li]:my-0.5 [&_p]:my-2 [&_strong]:text-foreground" isAnimating={streaming}>{text}</MessageResponse>
        ) : streaming ? (
          <Shimmer className="text-sm">Working it out…</Shimmer>
        ) : null}
        {text && !streaming && (
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label={copied ? "Copied" : "Copy"} onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} small>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </IconButton>
            {canRetry && onRetry && <IconButton label="Ask again" onClick={onRetry} small><RotateCcw className="size-3.5" /></IconButton>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

type ToolPart = { type: string; toolCallId: string; state: string; input?: Record<string, unknown>; output?: unknown; errorText?: string };

/** What the model looked up, as a short receipt. Each row opens to the exact rows code returned. */
function Steps({ parts, byId }: { parts: ToolPart[]; byId: Map<string, AskProject> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="overflow-hidden rounded-xl border bg-background/50 text-xs">
      {parts.map((p) => {
        const name = p.type.slice(5);
        const where = typeof p.input?.project === "string" ? byId.get(p.input.project)?.name : undefined;
        const out = p.output as { product?: string } | unknown[] | undefined;
        const what = out && !Array.isArray(out) && typeof out === "object" && "product" in out ? out.product : undefined;
        const count = Array.isArray(out) ? `${out.length} ${out.length === 1 ? "item" : "items"}` : undefined;
        const done = p.state === "output-available";
        const failed = p.state === "output-error";
        const Icon = name === "describeProduct" ? Database : name === "listProjects" ? FolderKanban : Clock;
        return (
          <li key={p.toolCallId} className="border-b last:border-b-0">
            <button type="button" onClick={() => setOpen(open === p.toolCallId ? null : p.toolCallId)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40">
              <Icon className="size-3.5 shrink-0 text-electric" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{TOOL_LABELS[name] ?? name}</span>
                {what && <span className="text-muted-foreground"> · {what}</span>}
                {where && <span className="text-muted-foreground"> · {where}</span>}
              </span>
              {count && <span className="font-mono text-[10px] text-muted-foreground">{count}</span>}
              {failed ? <X className="size-3.5 text-destructive" /> : done ? <Check className="size-3.5 text-signal" /> : <span className="size-3 animate-spin rounded-full border-2 border-electric border-t-transparent" />}
              <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open === p.toolCallId && "rotate-180")} />
            </button>
            {open === p.toolCallId && (
              <pre className="max-h-52 overflow-auto border-t bg-muted/30 px-3 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                {failed ? p.errorText : JSON.stringify(p.output ?? p.input, null, 2)}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Composer({ projects, mentions, setMentions, busy, disabled, draft, onSend, onStop }: {
  projects: AskProject[]; mentions: string[]; setMentions: (m: string[]) => void; busy: boolean; disabled: boolean; draft: string;
  onSend: (text: string) => void; onStop?: () => void;
}) {
  const [text, setText] = useState(draft);
  const [caret, setCaret] = useState(draft.length);
  const [pick, setPick] = useState(0);
  const [hidden, setHidden] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // An "@word" right before the caret opens the project menu.
  const token = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  const query = token?.[2].toLowerCase() ?? null;
  // Names where a word starts with the query rank before plain substring hits ("bo" → Body log, then Harbor).
  const rank = (name: string) => (name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query ?? "")) ? 0 : 1);
  const options = query === null ? [] : projects
    .filter((p) => !mentions.includes(p.id) && p.name.toLowerCase().includes(query))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .slice(0, 6);
  const menu = query !== null && !hidden && !disabled;

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const choose = (p: AskProject) => {
    if (!token) return;
    const start = caret - token[2].length - 1;
    const next = text.slice(0, start) + text.slice(caret);
    setMentions([...mentions, p.id]);
    setText(next);
    setCaret(start);
    setPick(0);
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(start, start); });
  };

  const insertAt = () => {
    const el = area.current;
    const at = el?.selectionStart ?? text.length;
    const pre = text.slice(0, at);
    const add = pre && !/\s$/.test(pre) ? " @" : "@";
    setText(pre + add + text.slice(at));
    setCaret(at + add.length);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + add.length, at + add.length); });
  };

  const submit = () => {
    if (!text.trim() || busy || disabled) return;
    onSend(text);
    setText("");
    setCaret(0);
    requestAnimationFrame(resize);
  };

  return (
    <div className="relative px-3 pb-3">
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            aria-label="Projects"
            className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-xl border bg-popover p-1 shadow-xl"
          >
            <p className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Ask about a project</p>
            {options.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">{mentions.length === projects.length ? "All your projects are tagged." : "No project matches."}</p>
            ) : (
              options.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === pick}
                  onMouseEnter={() => setPick(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left", i === pick && "bg-accent")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-electric/15 text-xs font-semibold text-electric">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{p.products.length ? p.products.join(" · ") : `${p.kind} · no data products yet`}</span>
                  </span>
                  {i === pick && <kbd className="font-mono text-[10px] text-muted-foreground">↵</kbd>}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="rounded-2xl border bg-background shadow-sm transition-shadow focus-within:border-electric/60 focus-within:ring-4 focus-within:ring-electric/10"
      >
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2.5">
          {mentions.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><FolderKanban className="size-3" />All projects</span>
          ) : (
            mentions.flatMap((id) => projects.find((p) => p.id === id) ?? []).map((p) => (
              <Tag key={p.id} name={p.name} onRemove={disabled ? undefined : () => setMentions(mentions.filter((m) => m !== p.id))} />
            ))
          )}
        </div>
        <textarea
          ref={area}
          value={text}
          rows={1}
          disabled={disabled}
          aria-label="Ask ARGUS"
          placeholder={disabled ? "This is a recorded conversation" : "Ask anything · type @ for a project"}
          className="block max-h-40 min-h-10 w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setPick(0); setHidden(false); resize(); }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (menu && options.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setPick((pick + 1) % options.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setPick((pick - 1 + options.length) % options.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[pick]); return; }
            }
            if (menu && e.key === "Escape") { e.preventDefault(); setHidden(true); return; }
            if (e.key === "Backspace" && !text && mentions.length) { setMentions(mentions.slice(0, -1)); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton label="Mention a project" onClick={insertAt} disabled={disabled} small><AtSign className="size-3.5" /></IconButton>
          <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">Answers cite where each number came from</span>
          {busy ? (
            <button type="button" aria-label="Stop" onClick={onStop} className="ml-auto grid size-8 place-items-center rounded-full bg-foreground text-background transition-transform active:scale-95">
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim() || disabled}
              className="ml-auto grid size-8 place-items-center rounded-full bg-electric text-white transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function HistoryList({ onOpen, active }: { onOpen: (id: string) => void; active: string | null }) {
  const [items, setItems] = useState<ChatSummary[] | null>(null);
  useEffect(() => { void listChats().then(setItems); }, []);

  if (!items) return <div className="flex-1 space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/60" />)}</div>;
  if (!items.length) return <p className="flex-1 p-6 text-center text-sm text-muted-foreground">No past chats yet. Ask something and it shows up here.</p>;
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {items.map((c) => (
        <li key={c.id} className={cn("group flex items-center rounded-xl hover:bg-accent/50", c.id === active && "bg-accent/60")}>
          <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
            <span className="block truncate text-sm">{c.title}</span>
            <span className="block text-[11px] text-muted-foreground">{ago(c.updatedAt)}</span>
          </button>
          <IconButton
            label="Delete chat"
            small
            className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => { void deleteChat(c.id); setItems(items.filter((x) => x.id !== c.id)); }}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Tag({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-electric/15 py-0.5 pr-1.5 pl-2 text-[11px] font-medium text-electric">
      <span className="truncate">@{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-3.5 place-items-center rounded-full hover:bg-electric/20">
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

/** The assistant's face: a soft gradient orb that breathes while it works. */
function Orb({ small, large, busy }: { small?: boolean; large?: boolean; busy?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-[conic-gradient(from_140deg,var(--electric),var(--signal),#a78bfa,var(--electric))]",
        small ? "size-6" : large ? "size-11" : "size-8",
        busy && "animate-pulse",
      )}
    >
      <span className={cn("rounded-full bg-card/80 backdrop-blur", small ? "size-4" : large ? "size-8" : "size-5.5")} />
      <Sparkles className={cn("absolute text-electric", small ? "size-2.5" : large ? "size-4" : "size-3")} />
    </span>
  );
}

function IconButton({ label, onClick, children, active, small, disabled, className }: {
  label: string; onClick?: () => void; children: React.ReactNode; active?: boolean; small?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        small ? "size-7" : "size-8",
        active && "bg-accent text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
