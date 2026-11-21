/**
 * Icons for the phones' bottom tab bar, drawn in the Pacewise style: rounded, even line icons that turn into a
 * filled version on the selected tab (the details are then cut out in the bar's own colour). Original drawings,
 * one consistent set, 24 × 24.
 */
export type TabIconName = "tasks" | "habits" | "calendar" | "profile" | "docs" | "tour" | "alerts" | "more";

/** The colour the cut-out details take on a filled icon (the tab bar's background). */
const CUT = "rgb(var(--canvas))";

export function TabIcon({ name, active, className = "h-[26px] w-[26px]" }: { name: TabIconName; active: boolean; className?: string }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const solid = { fill: "currentColor", stroke: "currentColor", strokeWidth: 1.75, strokeLinejoin: "round" } as const;
  const cut = { fill: "none", stroke: active ? CUT : "currentColor", strokeWidth: active ? 2 : 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const body = active ? solid : line;

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {name === "tasks" && (
        <>
          <rect x="3.5" y="3" width="17" height="18" rx="4" {...body} />
          <path d="M7.4 9l1.6 1.6L12 7.6" {...cut} />
          <path d="M14.5 9.2h2.6" {...cut} />
          <path d="M7.4 15l1.6 1.6L12 13.6" {...cut} />
          <path d="M14.5 15.2h2.6" {...cut} />
        </>
      )}
      {name === "habits" && (
        <>
          <path d="M4.5 19.5C4.5 10.5 9.5 5 20 4c-.6 10.5-5.8 15.5-15.5 15.5z" {...body} />
          <path d="M4.5 19.5L13.5 10.5" {...cut} />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect x="3.5" y="4.5" width="17" height="16" rx="3.5" {...body} />
          {!active && <path d="M3.5 9.5h17" {...line} />}
          <path d="M8 2.75v3.5M16 2.75v3.5" {...line} />
          {[8, 12, 16].flatMap((x) => [13.25, 17].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.05" fill={active ? CUT : "currentColor"} />
          )))}
        </>
      )}
      {name === "profile" && (
        <>
          <circle cx="12" cy="8" r="3.9" {...body} />
          <path d="M4.6 20.25c.55-4.05 3.6-6.6 7.4-6.6s6.85 2.55 7.4 6.6z" {...body} />
        </>
      )}
      {name === "docs" && (
        <>
          <path d="M6.5 2.75h7.25L18.75 7.75v11.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2z" {...body} />
          <path d="M13.5 3v3.5a1.25 1.25 0 0 0 1.25 1.25h3.75" {...cut} />
          <path d="M8 12.25h7M8 16h5" {...cut} />
        </>
      )}
      {name === "tour" && (
        <>
          <circle cx="12" cy="12" r="8.75" {...body} />
          <path d="M15.4 8.6l-1.9 4.9-4.9 1.9 1.9-4.9z" fill={active ? CUT : "none"} stroke={active ? CUT : "currentColor"} strokeWidth={1.75} strokeLinejoin="round" />
        </>
      )}
      {name === "alerts" && (
        <>
          <path d="M12 3.25a6 6 0 0 0-6 6v3.4c0 .7-.25 1.4-.7 1.95L4.2 16c-.5.6-.1 1.5.7 1.5h14.2c.8 0 1.2-.9.7-1.5l-1.1-1.4c-.45-.55-.7-1.25-.7-1.95v-3.4a6 6 0 0 0-6-6z" {...body} />
          <path d="M9.75 19.75a2.4 2.4 0 0 0 4.5 0" {...line} />
        </>
      )}
      {name === "more" && (
        <>
          <circle cx="12" cy="12" r="8.75" {...body} />
          {[8, 12, 16].map((x) => <circle key={x} cx={x} cy="12" r="1.25" fill={active ? CUT : "currentColor"} />)}
        </>
      )}
    </svg>
  );
}
