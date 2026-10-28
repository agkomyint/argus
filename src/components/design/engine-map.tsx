import type { AgentKind, AgentState } from "@/components/design/agent-kit";

export type EngineNode = { id: string; col: number; label: string; sub: string; kind: AgentKind | "source" | "product"; state: AgentState; rate?: string };
export type EngineEdge = [from: string, to: string];

export const COLUMNS = ["Data sources", "Agents", "Fusion", "Unified layers", "Data products"] as const;
