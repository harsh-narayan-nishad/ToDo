"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Clock as ClockIcon, FileUp, History, Plus, Trash2 } from "lucide-react";
import { searchSyllabus, syllabusKey, syllabusNote, syllabusPath, syllabusTitle, type SyllabusItem } from "@/lib/neetSyllabus";
import { AnalogClock, ClockPopup } from "@/components/TaskDialogs";
import { addMinutesToTime, clock } from "@/lib/days";
import type { Entry, Priority } from "@/lib/todo";
import { entryPath, searchEntries, useEntries } from "@/lib/entries";
import { cn } from "@/lib/utils";
import { INTERVALS, PATTERNS, parseRepeat, type Repeat } from "@/lib/repeat";
import LiquidGlass from "@/components/LiquidGlass";
import { CellSelect, RoundMenuButton, type DropdownGroup } from "@/components/GlassDropdown";

/**
 * The planner's tasks as a spreadsheet, like Google Sheets: one row per task, type straight into the cells,
 * Tab / Enter to move, and paste a block of cells copied from Google Sheets, Excel or Numbers into any cell —
 * it fills the grid from there and adds rows as needed. A CSV / TSV file (File → Download → CSV in Google Sheets)
 * can be imported too. Columns are matched by their header (Title, Notes, Priority, Date, From, To) when there is one.
 */
/** `repeat` "" = the plan's own Repeat; otherwise this task's. Ignored when the row has a Date. */
export interface SheetRow { key: number; title: string; notes: string; priority: Priority; day: string; repeat: Repeat | ""; allDay: boolean; startTime: string; endTime: string }

let nextKey = 1000;
export const blankRow = (): SheetRow => ({ key: nextKey++, title: "", notes: "", priority: "medium", day: "", repeat: "", allDay: true, startTime: "09:00", endTime: "10:00" });
export const MAX_ROWS = 100;

const COLS = ["title", "notes", "priority", "day", "from", "to", "repeat"] as const;
type Col = (typeof COLS)[number];
const HEADERS: Record<Col, RegExp> = {
  title: /^(title|task|tasks|name|todo|to-?do|item|subject)$/i,
  notes: /^(notes?|description|details?|comments?)$/i,
  priority: /^(priority|prio|importance)$/i,
  day: /^(date|day|due|due ?date|on)$/i,
  repeat: /^(repeat|repeats|recurrence|recurring|frequency|every)$/i,
  from: /^(from|start|start ?time|begins?|time)$/i,
  to: /^(to|end|end ?time|until|ends?)$/i,
};

/**
 * Columns a CSV can have besides the grid's own: All day (per row) and the planner's When settings
 * (Plan From, Plan To, Plan Repeat, Plan Days), read from the first row that fills them in.
 */
type ExtraCol = "allday" | "planFrom" | "planTo" | "planRepeat" | "planDays";
type AnyCol = Col | ExtraCol;
const EXTRA_HEADERS: Record<ExtraCol, RegExp> = {
  allday: /^(all[ -]?day|whole ?day)$/i,
  planFrom: /^(plan ?(from|start|first ?day)|range ?(from|start)|first ?day)$/i,
  planTo: /^(plan ?(to|end|last ?day)|range ?(to|end)|last ?day)$/i,
  planRepeat: /^plan ?repeat$/i,
  planDays: /^(plan ?days|plan ?weekdays|days of (the )?week)$/i,
};

/** The planner's When settings, as read from a CSV (only what the file fills in). */
export interface PlanSettings { from?: string; to?: string; repeat?: Repeat; picked?: boolean[] }

const parseYesNo = (raw: string): boolean | null => {
  const v = raw.trim().toLowerCase();
  if (/^(y|yes|true|1|x|✓|✔|on)$/.test(v)) return true;
  if (/^(n|no|false|0|off)$/.test(v)) return false;
  return null;
};

/** "Mon Wed Fri", "Mon, Wed, Fri", "mon;wed;fri" → Mon … Sun flags; null if no weekday is named. */
const parseWeekdays = (raw: string): boolean[] | null => {
  const names = ["mo", "tu", "we", "th", "fr", "sa", "su"];
  const out = [false, false, false, false, false, false, false];
  raw.toLowerCase().split(/[\s,;|/]+/).forEach((w) => { const i = names.indexOf(w.slice(0, 2)); if (i >= 0) out[i] = true; });
  return out.some(Boolean) ? out : null;
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
    case "repeat": {
      const r = parseRepeat(v);
      return { ...row, repeat: !v ? "" : r && r !== "custom" ? r : row.repeat };
    }
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
function headerMap(first: string[]): (AnyCol | null)[] | null {
  const map = first.map((h) =>
    (Object.keys(HEADERS) as Col[]).find((c) => HEADERS[c].test(h.trim()))
    ?? (Object.keys(EXTRA_HEADERS) as ExtraCol[]).find((c) => EXTRA_HEADERS[c].test(h.trim()))
    ?? null);
  return map.includes("title") ? map : null;
}

/** The When settings from a CSV with a header: each one from the first row that fills it in. */
export function readPlan(table: string[][]): PlanSettings {
  const header = headerMap(table[0] ?? []);
  if (!header) return {};
  const first = (col: ExtraCol) => {
    const j = header.indexOf(col);
    return j < 0 ? "" : table.slice(1).map((cells) => (cells[j] ?? "").trim()).find(Boolean) ?? "";
  };
  const plan: PlanSettings = {};
  const from = parseDay(first("planFrom"));
  const to = parseDay(first("planTo"));
  if (from) plan.from = from;
  if (to) plan.to = to;
  const days = parseWeekdays(first("planDays"));
  if (days) plan.picked = days;
  const rep = first("planRepeat");
  const r = /^(custom|pick ?days|picked ?days)$/i.test(rep) ? "custom" : parseRepeat(rep);
  if (r) plan.repeat = r;
  else if (days) plan.repeat = "custom"; // naming the days means "Pick days"
  return plan;
}

/** Puts a pasted / imported table into the rows, starting at row `r`, column `c` (column order of the sheet when there is no header). */
export function applyTable(rows: SheetRow[], table: string[][], r: number, c: number): SheetRow[] {
  const header = headerMap(table[0] ?? []);
  const body = header ? table.slice(1) : table;
  const cols: (AnyCol | null)[] = header ?? COLS.slice(c);
  const isCol = (x: AnyCol | null): x is Col => !!x && (COLS as readonly string[]).includes(x);
  const allDayAt = cols.indexOf("allday");
  const out = [...rows];
  body.forEach((cells, i) => {
    const at = r + i;
    if (at >= MAX_ROWS) return;
    let row = out[at] ?? blankRow();
    cells.forEach((v, j) => { const col = cols[j]; if (isCol(col)) row = setCell(row, col, v); });
    // All day last, so it wins over an empty or filled From / To.
    const allDay = allDayAt >= 0 ? parseYesNo(cells[allDayAt] ?? "") : null;
    if (allDay !== null) row = { ...row, allDay };
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
export function findClashes(rows: SheetRow[], daysFor: (r: SheetRow) => string[]): { keys: Set<number>; message: string | null } {
  const timed = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.title.trim() && !r.allDay && r.endTime > r.startTime);
  const keys = new Set<number>();
  let message: string | null = null;
  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const x = timed[a].r;
      const y = timed[b].r;
      const sameDay = !x.day && !y.day
        ? daysFor(x).some((d) => daysFor(y).includes(d))
        : x.day && y.day ? x.day === y.day : daysFor(x.day ? y : x).includes(x.day || y.day);
      if (!sameDay || !(toMin(x.startTime) < toMin(y.endTime) && toMin(y.startTime) < toMin(x.endTime))) continue;
      keys.add(x.key);
      keys.add(y.key);
      message ??= `Rows ${timed[a].n} and ${timed[b].n} are at the same time (${clock(x.startTime)} – ${clock(x.endTime)} and ${clock(y.startTime)} – ${clock(y.endTime)}). Two tasks cannot happen at once: give one of them another time, or make it all day.`;
    }
  }
  return { keys, message };
}

// ---- the grid -----------------------------------------------------------------------------

/** The app's dropdown menus for the Priority and Repeat columns (cells and headers). */
const PRIORITY_GROUPS: DropdownGroup[] = [{ title: "Priority", items: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }] }];
const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High" };
/** `plan` = the When section's repeat ("Every day"), shown next to "Plan's repeat". */
const repeatGroups = (once: boolean, plan?: string): DropdownGroup[] => [
  { title: "", items: [{ id: "", label: once ? "Once" : "Plan's repeat", meta: once ? undefined : plan }] },
  { title: "Every N days", items: [{ id: "daily", label: "Every 1 day" }, ...INTERVALS.map((x, i) => ({ id: x.id, label: `Every ${i + 2} days` }))] },
  { title: "Pattern", items: PATTERNS.filter((x) => x.id !== "custom" && x.id !== "daily") },
];
const repeatText = (r: Repeat | "") => repeatGroups(false).flatMap((g) => g.items).find((x) => x.id === r)?.label ?? "Plan's repeat";


const CELL = "h-11 w-full bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-faint";
/** The active cell, as in a well-made spreadsheet: a fine neutral outline and a slight lift, never a loud colour. */
const TD = "border-b border-r border-overlay/10 p-0 transition-[background-color,box-shadow] duration-150 focus-within:bg-overlay/[0.05] focus-within:shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.45)]";

export function TaskSheet({ rows, setRows, clashes, neet = false, planRepeat, onImportPlan, toolbar }: { rows: SheetRow[]; setRows: (fn: (rows: SheetRow[]) => SheetRow[]) => void; clashes?: Set<number>; neet?: boolean; /** The plan's repeat, shown in rows that follow it. */ planRepeat?: string; /** Gets the When settings an imported CSV fills in (Plan From / To / Repeat / Days). */ onImportPlan?: (plan: PlanSettings) => void; /** Shown in the Import CSV row, on the right (the Contests menu). */ toolbar?: React.ReactNode }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [clockFor, setClockFor] = useState<{ key: number; which: "from" | "to" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** What this person added before, suggested in every Title cell (for everyone, not only NEET). */
  const entries = useEntries();

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
    const plan = readPlan(table);
    const planned = Object.keys(plan).length > 0;
    if (planned) onImportPlan?.(plan);
    setNotice(`Imported ${headerMap(table[0]) ? table.length - 1 : table.length} rows from ${file.name}${planned && onImportPlan ? ", and the When settings" : ""}. Everything can still be changed.`);
  }

  const open = clockFor && rows.find((r) => r.key === clockFor.key);

  /** Column widths: drag a header edge to change one (remembered on this device), double-click it to reset. */
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? "null") as number[] | null;
      if (Array.isArray(saved) && saved.length === SHEET_COLS.length) return saved;
    } catch { /* storage blocked */ }
    return SHEET_COLS.map((c) => c.width);
  });
  const setWidth = (c: number, w: number) => setWidths((list) => {
    const next = list.map((x, i) => (i === c ? Math.round(Math.min(640, Math.max(SHEET_COLS[c].min, w))) : x));
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    return next;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* the CSV icon in a round glass button, with "Import CSV" written beside it (both open the file picker) */}
        <button type="button" data-tour="import" onClick={() => fileRef.current?.click()} className="group inline-flex items-center gap-3 text-sm text-ink outline-none">
          <span className="glass-fab relative grid h-10 w-10 shrink-0 place-items-center rounded-full group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-medium">
            <span className="pointer-events-none absolute inset-0" aria-hidden><LiquidGlass width="100%" height="100%" radius={20} blur={3} /></span>
            <FileUp className="relative h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          Import CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,.xlsx,.xls,.ods,.numbers" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
        {toolbar && <div className="ml-auto">{toolbar}</div>}
      </div>
      {notice && <p className="text-xs text-ink-muted" role="status">{notice}</p>}

      <div className="relative overflow-x-auto rounded-2xl border border-overlay/10 bg-canvas/40">
        <table ref={tableRef} className="border-collapse text-left" style={{ tableLayout: "fixed", width: widths.reduce((x, y) => x + y, 0) }}>
          <colgroup>{widths.map((w, c) => <col key={SHEET_COLS[c].id} style={{ width: w }} />)}</colgroup>
          <thead>
            <tr className="bg-overlay/5 text-xs uppercase tracking-wide text-ink-muted">
              {SHEET_COLS.map((col, c) => (
                <th key={col.id} title={col.hint} className={cn("relative border-b border-overlay/10 py-2 font-medium", c < SHEET_COLS.length - 1 && "border-r", col.center ? "px-2 text-center" : "px-3")}>
                  {col.id === "priority" ? (
                    <HeaderSetAll label="Priority" groups={PRIORITY_GROUPS} onPick={(v) => setRows((list) => list.map((r) => ({ ...r, priority: v as Priority })))} />
                  ) : col.id === "repeat" ? (
                    <HeaderSetAll label="Repeat" groups={repeatGroups(false, planRepeat)} onPick={(v) => setRows((list) => list.map((r) => (r.day ? r : { ...r, repeat: v as Repeat | "" })))} />
                  ) : col.label}
                  {col.resizable && <ResizeHandle onResize={(w) => setWidth(c, w)} onReset={() => setWidth(c, SHEET_COLS[c].width)} width={widths[c]} label={col.label} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="border-b border-r border-overlay/10 bg-overlay/5 text-center text-xs tabular-nums text-ink-faint">{i + 1}</td>
                <td className={TD}><TitleCell neet={neet} entries={entries} row={i} value={r.title} placeholder={i === 0 ? "e.g. Gym" : ""}
                  onChange={(title) => update(r.key, { title })}
                  onPick={(x) => update(r.key, { title: syllabusTitle(x), ...(r.notes.trim() ? {} : { notes: syllabusNote(x) }) })}
                  onPickEntry={(x) => update(r.key, { title: x.title, ...(r.notes.trim() || !x.notes ? {} : { notes: x.notes }), priority: x.priority, allDay: !x.startTime, ...(x.startTime && x.endTime ? { startTime: x.startTime, endTime: x.endTime } : {}) })}
                  onPaste={(e) => onPaste(e, i, 0)} onKeyDown={(e) => onKey(e, i, 0)} /></td>
                <td className={TD}><input data-cell={`${i}-1`} value={r.notes} maxLength={2000} onChange={(e) => update(r.key, { notes: e.target.value })} onPaste={(e) => onPaste(e, i, 1)} onKeyDown={(e) => onKey(e, i, 1)} className={CELL} aria-label={`Row ${i + 1} notes`} /></td>
                <td className={TD}>
                  <CellSelect dataCell={`${i}-2`} value={r.priority} display={PRIORITY_LABEL[r.priority]} groups={PRIORITY_GROUPS} onSelect={(v) => update(r.key, { priority: v as Priority })}
                    onPaste={(e) => onPaste(e, i, 2)} onKeyDown={(e) => onKey(e, i, 2)} label={`Row ${i + 1} priority`} />
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
                <td className={TD}>
                  <CellSelect dataCell={`${i}-6`} value={r.day ? "" : r.repeat} display={r.day ? "Once" : r.repeat ? repeatText(r.repeat) : (planRepeat ?? "Plan's repeat")} groups={repeatGroups(!!r.day, planRepeat)} disabled={!!r.day} muted={!r.repeat}
                    title={r.day ? "A task with a Date is added on that day only" : undefined}
                    onSelect={(v) => update(r.key, { repeat: v as Repeat | "" })} onPaste={(e) => onPaste(e, i, 6)} onKeyDown={(e) => onKey(e, i, 6)} label={`Row ${i + 1} repeat`} />
                </td>
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

/** The sheet's columns, in order, with their starting width and the narrowest they may get. */
const SHEET_COLS: { id: string; label: string; width: number; min: number; resizable?: boolean; center?: boolean; hint?: string }[] = [
  { id: "num", label: "#", width: 44, min: 44, center: true },
  { id: "title", label: "Title", width: 240, min: 100, resizable: true },
  { id: "notes", label: "Notes", width: 220, min: 90, resizable: true },
  { id: "priority", label: "Priority", width: 136, min: 104, resizable: true },
  { id: "date", label: "Date", width: 160, min: 132, resizable: true, hint: "Leave empty to repeat; with a date the task is added on that day only" },
  { id: "allday", label: "All day", width: 76, min: 64, resizable: true, center: true },
  { id: "from", label: "From", width: 140, min: 112, resizable: true },
  { id: "to", label: "To", width: 140, min: 112, resizable: true },
  { id: "repeat", label: "Repeat", width: 176, min: 132, resizable: true, hint: "How often this task repeats; Plan's repeat follows the When section" },
  { id: "del", label: "", width: 52, min: 52 },
];
const WIDTHS_KEY = "pacewise-todo-sheet-widths";

/** The grip on a header's right edge: drag to resize the column, double-click to reset it, or use ← / → when focused. */
function ResizeHandle({ onResize, onReset, width, label }: { onResize: (w: number) => void; onReset: () => void; width: number; label: string }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <span role="separator" aria-orientation="vertical" aria-label={`Resize ${label} column`} aria-valuenow={width} tabIndex={0}
      onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as Element).setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: width }; }}
      onPointerMove={(e) => { if (start.current) onResize(start.current.w + e.clientX - start.current.x); }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}
      onDoubleClick={onReset}
      onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onResize(width + (e.key === "ArrowRight" ? 16 : -16)); } }}
      className="group absolute -right-[3px] top-0 z-10 flex h-full w-[7px] cursor-col-resize touch-none justify-center outline-none">
      <span className="h-full w-px bg-transparent transition-colors duration-150 group-active:bg-ink/60 group-focus-visible:bg-ink/60" />
    </span>
  );
}

/** A header with a small round glass dropdown button to its right (the app's own menu): picks one value for every row's cell in that column. */
function HeaderSetAll({ label, groups, onPick }: { label: string; groups: DropdownGroup[]; onPick: (v: string) => void }) {
  return (
    <span className="flex items-center gap-2">
      <span className="truncate">{label}</span>
      <RoundMenuButton groups={groups} onSelect={onPick} label={`Set ${label.toLowerCase()} for all rows`} />
    </span>
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

/** Wraps the searched words in <mark>, as the Pacewise docs search does. */
function Marked({ text, q }: { text: string; q: string }) {
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-[#306fdb]/20 px-0.5 text-inherit">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/**
 * A Title cell that is also a search of the NEET syllabus, all in the browser (no request): typing shows matching
 * topics in a list below the cell; ↑ ↓ to move, Enter to pick, Esc to hide. Picking fills the title, and the notes
 * if they are empty. The list floats above the sheet so the table never cuts it off.
 */
function TitleCell({ neet, entries, row, value, placeholder, onChange, onPick, onPickEntry, onPaste, onKeyDown }: {
  neet: boolean; entries: Entry[];
  row: number; value: string; placeholder: string; onChange: (v: string) => void; onPick: (x: SyllabusItem) => void; onPickEntry: (x: Entry) => void;
  onPaste: (e: React.ClipboardEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const hits = useMemo(() => (open && neet ? searchSyllabus(value, 8) : []), [open, value, neet]);
  /** My own entries come first, then the syllabus. */
  const found = useMemo(() => (open ? searchEntries(entries, value) : []), [open, value, entries]);
  const total = found.length + hits.length;
  const show = open && value.trim().length > 0 && total > 0;
  useEffect(() => setActive(-1), [value]);

  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 320), window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    setPos(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
  };
  useLayoutEffect(() => { if (show) place(); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!show) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (x: SyllabusItem) => { onPick(x); setOpen(false); input.current?.focus(); };
  const pickEntry = (x: Entry) => { onPickEntry(x); setOpen(false); input.current?.focus(); };
  const pickAt = (i: number) => (i < found.length ? pickEntry(found[i]) : pick(hits[i - found.length]));

  return (
    <>
      <input ref={input} data-cell={`${row}-0`} value={value} maxLength={120} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={show} aria-autocomplete="list" aria-label={`Row ${row + 1} title`}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onBlur={(e) => { if (!list.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (show) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); return; }
            if (e.key === "Enter" && active >= 0) { e.preventDefault(); pickAt(active); return; }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
          }
          onKeyDown(e);
        }}
        className={CELL} />
      {show && pos && createPortal(
        <ul ref={list} role="listbox" aria-label={neet ? "Your entries and the NEET syllabus" : "Your entries"}
          className="glass-in fixed z-[160] max-h-72 overflow-y-auto rounded-2xl border border-overlay/10 bg-canvas-raised p-1.5 shadow-themed"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
          {found.map((x, i) => (
            <li key={`entry-${x.id}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pickEntry(x)} onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-start gap-3 rounded-xl px-3.5 py-2.5 text-left", i === active && "bg-overlay/[0.06]")}>
                <History className="mt-[3px] h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-ink"><Marked text={x.title} q={value} /></span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">{entryPath(x)}</span>
                </span>
              </button>
            </li>
          ))}
          {hits.map((x, j) => { const i = found.length + j; return (
            <li key={syllabusKey(x)} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)} onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-start gap-3 rounded-xl px-3.5 py-2.5 text-left", i === active && "bg-overlay/[0.06]")}>
                <BookOpen className="mt-[3px] h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-ink"><Marked text={x.topic ?? x.unit} q={value} /></span>
                  <span className="mt-0.5 block text-xs text-ink-muted"><Marked text={syllabusPath(x)} q={value} /></span>
                </span>
              </button>
            </li>
          ); })}
        </ul>,
        document.body,
      )}
    </>
  );
}
