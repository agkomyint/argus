export type Row = { id: string; type: string; t: number; arrived: number; payload: Record<string, unknown> };
export type Dataset = { type: string; total: number; latest: number | null; rows: Row[] };

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const clock = (t: number) => new Date(t).toISOString().slice(11, 19) + "Z";
