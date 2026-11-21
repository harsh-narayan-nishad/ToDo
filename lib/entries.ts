import { useEffect, useState } from "react";
import { todoApi, type Entry } from "@/lib/todo";

/**
 * Suggestions from what this person has added before: every task they create is saved as an entry on the server
 * (one per title, counted again each time it is added or finished), and typing a title searches them, like the
 * NEET syllabus search. Every word typed must appear in the title or the notes; title matches rank first, then the
 * ones finished most often, then the most recently used.
 */
export function searchEntries(entries: Entry[], q: string, limit = 5): Entry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: { e: Entry; score: number; i: number }[] = [];
  entries.forEach((e, i) => {
    const title = e.title.toLowerCase();
    const notes = e.notes.toLowerCase();
    if (!words.every((w) => title.includes(w) || notes.includes(w))) return;
    let score = Math.min(e.done, 20) * 0.25;
    for (const w of words) score += (title.includes(w) ? 6 : 0) + (title.startsWith(w) ? 3 : 0) + (notes.includes(w) ? 1 : 0);
    hits.push({ e, score, i });
  });
  return hits.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map((h) => h.e);
}

/** "Added 3 times · done 2" under an entry. */
export const entryPath = (e: Entry) =>
  [`Added ${e.created === 1 ? "once" : `${e.created} times`}`, e.done ? `done ${e.done}` : "not done yet", e.notes.trim() ? e.notes.trim().slice(0, 80) : ""].filter(Boolean).join(" · ");

/** My entries, loaded once when a panel opens (most recently used first). */
export function useEntries(): Entry[] {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let live = true;
    todoApi.entries().then((list) => { if (live) setEntries(list); }, () => undefined);
    return () => { live = false; };
  }, []);
  return entries;
}
