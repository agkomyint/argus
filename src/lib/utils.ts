import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A long file name cut in the middle, so the start and the extension both stay readable: "HD CCTV Camera vi…tore.mp4". */
export function shortName(name: string, max = 28) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const hasExt = dot > 0 && name.length - dot <= 6;
  const end = hasExt ? name.slice(Math.max(0, dot - 4)) : name.slice(-6);
  return `${name.slice(0, Math.max(1, max - end.length - 1))}…${end}`;
}
