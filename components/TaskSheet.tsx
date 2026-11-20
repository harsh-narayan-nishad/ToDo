"use client";
import { useRef, useState } from "react";
import { Check, Clock as ClockIcon, FileUp, Plus, Trash2 } from "lucide-react";
import { AnalogClock, ClockPopup } from "@/components/TaskDialogs";
import { addMinutesToTime, clock } from "@/lib/days";
import type { Priority } from "@/lib/todo";
import { cn } from "@/lib/utils";

/**
 * The planner's tasks as a spreadsheet, like Google Sheets: one row per task, type straight into the cells,
 * Tab / Enter to move, and paste a block of cells copied from Google Sheets, Excel or Numbers into any cell —
 * it fills the grid from there and adds rows as needed. A CSV / TSV file (File → Download → CSV in Google Sheets)
 * can be imported too. Columns are matched by their header (Title, Notes, Priority, Date, From, To) when there is one.
 */
export interface SheetRow { key: number; title: string; notes: string; priority: Priority; day: string; allDay: boolean; startTime: string; endTime: string }

let nextKey = 1000;
export const blankRow = (): SheetRow => ({ key: nextKey++, title: "", notes: "", priority: "medium", day: "", allDay: true, startTime: "09:00", endTime: "10:00" });
export const MAX_ROWS = 100;

const COLS = ["title", "notes", "priority", "day", "from", "to"] as const;
type Col = (typeof COLS)[number];
const HEADERS: Record<Col, RegExp> = {
  title: /^(title|task|tasks|name|todo|to-?do|item|subject)$/i,
  notes: /^(notes?|description|details?|comments?)$/i,
  priority: /^(priority|prio|importance)$/i,
  day: /^(date|day|due|due ?date|on)$/i,
  from: /^(from|start|start ?time|begins?|time)$/i,
  to: /^(to|end|end ?time|until|ends?)$/i,
};

// ---- parsing ------------------------------------------------------------------------------

/** CSV / TSV with quoted cells ("a, b", "say ""hi"""), as Google Sheets and Excel write and copy them. */
export function parseTable(text: string): string[][] {
  const delim = text.includes("\t") ? "\t" : (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** "9", "9:30", "9.30", "930", "9:30 pm", "21:30" → "HH:MM"; anything else → null. */
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().replace(/\s+/g, "").match(/^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.[0];
  if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "2026-11-24", "24/11/2026" (day first unless that cannot be), "24 Nov 2026", "Nov 24, 2026" → "YYYY-MM-DD"; else null. */
export function parseDay(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const a = +m[1];
    const b = +m[2];
    return b > 12 ? ok(y, a, b) : ok(y, b, a); // day first, the way most of the world writes it
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return ok(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const parsePriority = (raw: string): Priority | null => {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("h") || v === "1" || v === "p1" || v === "urgent") return "high";
  if (v.startsWith("l") || v === "3" || v === "p3") return "low";
  if (v.startsWith("m") || v === "2" || v === "p2" || v === "normal") return "medium";
  return null;
};

/** Writes one cell's text into a row (unreadable times / dates / priorities are left as they were). */
function setCell(row: SheetRow, col: Col, raw: string): SheetRow {
  const v = raw.trim();
  switch (col) {
    case "title": return { ...row, title: v.slice(0, 120) };
    case "notes": return { ...row, notes: v.slice(0, 2000) };
    case "priority": return { ...row, priority: parsePriority(v) ?? row.priority };
    case "day": return { ...row, day: v ? parseDay(v) ?? row.day : "" };
    case "from": {
      const t = parseTime(v);
      if (!t) return v ? row : { ...row, allDay: true };
      return { ...row, allDay: false, startTime: t, endTime: row.endTime > t ? row.endTime : addMinutesToTime(t, 60) };
    }
    case "to": {
      const t = parseTime(v);
      return t ? { ...row, allDay: false, endTime: t } : row;
    }
  }
}

/** If the first row is a header, which column holds what; otherwise null. */
function headerMap(first: string[]): (Col | null)[] | null {
  const map = first.map((h) => (Object.keys(HEADERS) as Col[]).find((c) => HEADERS[c].test(h.trim())) ?? null);
  return map.includes("title") ? map : null;
}

/** Puts a pasted / imported table into the rows, starting at row `r`, column `c` (column order of the sheet when there is no header). */
export function applyTable(rows: SheetRow[], table: string[][], r: number, c: number): SheetRow[] {
  const header = headerMap(table[0] ?? []);
  const body = header ? table.slice(1) : table;
  const cols: (Col | null)[] = header ?? COLS.slice(c);
  const out = [...rows];
  body.forEach((cells, i) => {
    const at = r + i;
    if (at >= MAX_ROWS) return;
    let row = out[at] ?? blankRow();
    cells.forEach((v, j) => { const col = cols[j]; if (col) row = setCell(row, col, v); });
    out[at] = row;
  });
  return out;
}

// ---- clashes ------------------------------------------------------------------------------

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Timed rows that would sit at the same time on the same day: a row without a Date lands on every planned day,
 * a row with one only on that day. Returns each clashing row's key, and a sentence naming the first clash.
 */
export function findClashes(rows: SheetRow[], days: string[]): { keys: Set<number>; message: string | null } {
  const daySet = new Set(days);
  const timed = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.title.trim() && !r.allDay && r.endTime > r.startTime);
  const keys = new Set<number>();
  let message: string | null = null;
  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const x = timed[a].r;
      const y = timed[b].r;
      const sameDay = !x.day && !y.day ? days.length > 0 : x.day && y.day ? x.day === y.day : daySet.has(x.day || y.day);
      if (!sameDay || !(toMin(x.startTime) < toMin(y.endTime) && toMin(y.startTime) < toMin(x.endTime))) continue;
      keys.add(x.key);
      keys.add(y.key);
      message ??= `Rows ${timed[a].n} and ${timed[b].n} are at the same time (${clock(x.startTime)} – ${clock(x.endTime)} and ${clock(y.startTime)} – ${clock(y.endTime)}). Two tasks cannot happen at once: give one of them another time, or make it all day.`;
    }
  }
  return { keys, message };
}

// ---- the grid -----------------------------------------------------------------------------

const CELL = "h-11 w-full bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-faint";
/** The active cell, as in a well-made spreadsheet: a fine neutral outline and a slight lift, never a loud colour. */
const TD = "border-b border-r border-overlay/10 p-0 transition-[background-color,box-shadow] duration-150 focus-within:bg-overlay/[0.05] focus-within:shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.45)]";

export function TaskSheet({ rows, setRows, clashes }: { rows: SheetRow[]; setRows: (fn: (rows: SheetRow[]) => SheetRow[]) => void; clashes?: Set<number> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [clockFor, setClockFor] = useState<{ key: number; which: "from" | "to" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (key: number, patch: Partial<SheetRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const focusCell = (r: number, c: number) => setTimeout(() => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus(), 0);

  /** Pasting several cells (copied from any spreadsheet) fills the grid from the cell you pasted into. */
  function onPaste(e: React.ClipboardEvent, r: number, c: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // one plain value: a normal paste
    e.preventDefault();
    const table = parseTable(text);
    setRows((list) => applyTable(list, table, r, c));
    setNotice(`Pasted ${table.length} row${table.length === 1 ? "" : "s"}.`);
  }

  /** Enter moves down a row (adding one at the bottom), like a spreadsheet. */
  function onKey(e: React.KeyboardEvent, r: number, c: number) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (r === rows.length - 1 && rows.length < MAX_ROWS) setRows((list) => [...list, blankRow()]);
    focusCell(r + 1, c);
  }

  async function importFile(file: File) {
    if (/\.(xlsx|xls|ods|numbers)$/i.test(file.name)) {
      setNotice("Save the sheet as CSV first (Google Sheets: File → Download → CSV; Excel: Save As → CSV), or copy the cells and paste them into the grid.");
      return;
    }
    const table = parseTable(await file.text());
    if (table.length === 0) { setNotice("That file has no rows."); return; }
    setRows((list) => {
      const kept = list.filter((r) => r.title.trim() || r.notes.trim());
      return applyTable(kept, table, kept.length, 0);
    });
    setNotice(`Imported ${headerMap(table[0]) ? table.length - 1 : table.length} rows from ${file.name}.`);
  }

  const open = clockFor && rows.find((r) => r.key === clockFor.key);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-overlay/15 bg-overlay/5 px-4 py-1.5 text-sm text-ink">
          <FileUp className="h-4 w-4" /> Import CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls,.ods,.numbers" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        <span className="text-xs text-ink-faint">or copy cells in Google Sheets / Excel and paste them into any cell</span>
      </div>
      {notice && <p className="text-xs text-ink-muted" role="status">{notice}</p>}

      <div className="overflow-x-auto rounded-2xl border border-overlay/10 bg-canvas/40">
        <table ref={tableRef} className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="bg-overlay/5 text-xs uppercase tracking-wide text-ink-muted">
              <th className="w-10 border-b border-r border-overlay/10 px-2 py-2 text-center font-medium">#</th>
              <th className="border-b border-r border-overlay/10 px-3 py-2 font-medium">Title</th>
              <th className="border-b border-r border-overlay/10 px-3 py-2 font-medium">Notes</th>
              <th className="w-28 border-b border-r border-overlay/10 px-3 py-2 font-medium">Priority</th>
              <th className="w-36 border-b border-r border-overlay/10 px-3 py-2 font-medium" title="Leave empty to repeat on every planned day">Date</th>
              <th className="w-16 border-b border-r border-overlay/10 px-2 py-2 text-center font-medium">All day</th>
              <th className="w-32 border-b border-r border-overlay/10 px-3 py-2 font-medium">From</th>
              <th className="w-32 border-b border-r border-overlay/10 px-3 py-2 font-medium">To</th>
              <th className="w-10 border-b border-overlay/10" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="border-b border-r border-overlay/10 bg-overlay/5 text-center text-xs tabular-nums text-ink-faint">{i + 1}</td>
                <td className={TD}><input data-cell={`${i}-0`} value={r.title} maxLength={120} placeholder={i === 0 ? "e.g. Gym" : ""} onChange={(e) => update(r.key, { title: e.target.value })} onPaste={(e) => onPaste(e, i, 0)} onKeyDown={(e) => onKey(e, i, 0)} className={CELL} aria-label={`Row ${i + 1} title`} /></td>
                <td className={TD}><input data-cell={`${i}-1`} value={r.notes} maxLength={2000} onChange={(e) => update(r.key, { notes: e.target.value })} onPaste={(e) => onPaste(e, i, 1)} onKeyDown={(e) => onKey(e, i, 1)} className={CELL} aria-label={`Row ${i + 1} notes`} /></td>
                <td className={TD}>
                  <select data-cell={`${i}-2`} value={r.priority} onChange={(e) => update(r.key, { priority: e.target.value as Priority })} onPaste={(e) => onPaste(e, i, 2)} className={cn(CELL, "sheet-native cursor-pointer pr-1")} aria-label={`Row ${i + 1} priority`}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </td>
                <td className={TD}><input data-cell={`${i}-3`} type="date" value={r.day} onChange={(e) => update(r.key, { day: e.target.value })} onPaste={(e) => onPaste(e, i, 3)} className={cn(CELL, "sheet-native pr-1", !r.day && "text-ink-faint")} aria-label={`Row ${i + 1} date (empty = every planned day)`} /></td>
                <td className={cn(TD, "text-center")}><SheetCheck checked={r.allDay} onChange={(on) => update(r.key, on ? { allDay: true } : { allDay: false, ...nextFreeSlot(rows, r.key) })} label={`Row ${i + 1} all day`} /></td>
                {(["from", "to"] as const).map((which, k) => (
                  <td key={which} className={cn(TD, clashes?.has(r.key) && "bg-accent-extreme/10 text-accent-extreme")} title={clashes?.has(r.key) ? "At the same time as another task" : undefined}>
                    <TimeCell cell={`${i}-${4 + k}`} value={which === "from" ? r.startTime : r.endTime} disabled={r.allDay}
                      onChange={(t) => update(r.key, which === "from" ? { startTime: t, endTime: r.endTime > t ? r.endTime : addMinutesToTime(t, 60) } : { endTime: t })}
                      onPaste={(e) => onPaste(e, i, 4 + k)} onKeyDown={(e) => onKey(e, i, 4 + k)}
                      onClock={() => setClockFor({ key: r.key, which })} label={`Row ${i + 1} ${which === "from" ? "start" : "end"} time`} />
                  </td>
                ))}
                <td className="border-b border-overlay/10 text-center">
                  {rows.length > 1 && <button type="button" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} aria-label={`Remove row ${i + 1}`} className="grid h-9 w-9 place-items-center rounded-full text-ink-faint"><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {rows.length < MAX_ROWS && (
          <button type="button" onClick={() => { setRows((list) => [...list, blankRow()]); focusCell(rows.length, 0); }} className="inline-flex items-center gap-2 rounded-full border border-dashed border-overlay/25 px-4 py-2 text-sm text-ink-muted">
            <Plus className="h-4 w-4" /> Add row
          </button>
        )}
        <span className="text-xs text-ink-faint">Rows with a Date are added on that day only; rows without one repeat on every planned day.</span>
      </div>

      {open && clockFor && (
        <ClockPopup title={clockFor.which === "from" ? "Start time" : "End time"} onClose={() => setClockFor(null)}>
          {clockFor.which === "from" ? (
            <AnalogClock label="Start time" value={open.startTime} onChange={(t) => update(open.key, { allDay: false, startTime: t, endTime: open.endTime > t ? open.endTime : addMinutesToTime(t, 60) })} />
          ) : (
            <AnalogClock label="End time" value={open.endTime} from={open.startTime} onChange={(t) => update(open.key, { allDay: false, endTime: t })} />
          )}
        </ClockPopup>
      )}
    </div>
  );
}

/**
 * The time a row gets when All day is unticked: the first free hour from 9:00 AM that does not overlap any other
 * timed row on the same day (filled in or not, so rows ticked one after another line up 9–10, 10–11, 11–12 …).
 * Rows on different dates never get in each other's way.
 */
function nextFreeSlot(rows: SheetRow[], key: number): { startTime: string; endTime: string } {
  const self = rows.find((r) => r.key === key);
  const others = rows.filter((r) => r.key !== key && !r.allDay && r.endTime > r.startTime && (!self?.day || !r.day || r.day === self.day));
  const busy = others.map((r) => [toMin(r.startTime), toMin(r.endTime)] as const);
  const free = (s: number) => s + 60 <= 24 * 60 - 1 && busy.every(([a, b]) => s + 60 <= a || s >= b);
  const candidates = [9 * 60, ...busy.map(([, b]) => b)].filter((s) => s >= 9 * 60).sort((x, y) => x - y);
  const start = candidates.find(free) ?? [0, ...busy.map(([, b]) => b)].sort((x, y) => x - y).find(free);
  if (start === undefined) return { startTime: self?.startTime ?? "09:00", endTime: self?.endTime ?? "10:00" }; // the day is full: leave it, the clash check will say so
  const t = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
  return { startTime: t, endTime: addMinutesToTime(t, 60) };
}

/** The All day box: a small rounded square in the app's ink colour (filled with a check when on), not the browser's own. */
function SheetCheck({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="flex h-11 w-full cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="peer sr-only" />
      <span aria-hidden className={cn(
        "grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-colors duration-150",
        checked ? "border-ink bg-ink text-canvas" : "border-overlay/30 bg-transparent text-transparent",
      )}>
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    </label>
  );
}

/** A time cell: type "9:30 pm" (or "21:30", "930") straight in, or open the analog clock with the icon. */
function TimeCell({ cell, value, disabled, onChange, onPaste, onKeyDown, onClock, label }: {
  cell: string; value: string; disabled: boolean; onChange: (t: string) => void; onPaste: (e: React.ClipboardEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void; onClock: () => void; label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  if (disabled) return <span className="flex h-11 items-center px-3 text-sm text-ink-faint">—</span>;
  return (
    <div className="flex items-center">
      <input data-cell={cell} value={text ?? clock(value)} aria-label={label}
        onFocus={() => setText(clock(value))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { const t = text === null ? null : parseTime(text); if (t) onChange(t); setText(null); }}
        onPaste={onPaste} onKeyDown={onKeyDown}
        className={cn(CELL, "min-w-0 tabular-nums")} />
      <button type="button" onClick={onClock} aria-label={`${label}: open clock`} className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted"><ClockIcon className="h-4 w-4" /></button>
    </div>
  );
}
