# Pacewise To-do

A small Next.js app that extends Pacewise with a to-do list. It uses the **same account** (same e-mail/username and password, or Google), the **same backend**, and the **same design tokens** as Pacewise and the admin app.

## What it does

| Screen | What it shows |
|---|---|
| Tasks | Add a task with a priority, a start day and a due day. Tick it off, edit it, delete it, or **Log time** on it. Grouped into Overdue / Today / Upcoming / Done. |
| History | Pick any day: time worked, tasks added, tasks finished, tasks planned, and every time entry. Below it, the last 30 days at a glance. |
| Profile | Tasks created / finished / open / overdue, total **hours worked**, current and longest streak, active days, **consistency level** (share of the last 30 days that were active), a 7-day chart and a 26-week heatmap. Click any day to open it in History. |

**Calendar.** Every task is also written to the Pacewise calendar (the same `CalendarEvent` collection Pacewise reads), as an all-day event from its start day to its due day. Open tasks show as `☐ title` (secondary colour), finished ones as `✓ title` (outline). Editing or deleting a task updates or removes the event. The Pacewise app itself was not changed.

**Filling in missed days.** Time can be logged for today, yesterday or the day before. Older days are locked, so the history and streak stay honest. A wrong entry can be removed within the same window.

**Consistency.** A day is *active* when you log any time or finish a task (just adding a task does not count). Streaks use the same function as Pacewise's reading streak (`backend/src/modules/tracking/consistency.ts`), so both follow identical rules: your own calendar day, and today's streak stays alive until the day ends. Levels by active days in the last 30: Not started · Starting (<20%) · Building (<40%) · Steady (<60%) · Strong (<80%) · Unstoppable.

## Run it

1. Backend: add this app to `CORS_ORIGINS` in `backend/.env`, e.g. `CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002`, then restart it.
2. Here:
   ```
   cp .env.local.example .env.local
   npm install
   npm run dev      # http://localhost:3002
   ```
3. Sign in with any Pacewise account (for example a demo account from `backend/seed/DEMO_ACCOUNTS.csv`).

## API (all need the normal Pacewise bearer token)

| Method | Path | What it does |
|---|---|---|
| GET | `/todo/tasks?status=open\|done\|all` | Your tasks, each with `loggedMinutes`. |
| POST | `/todo/tasks` | `title`, `notes`, `priority`, `startDay`, `dueDay`, `today`, `tzOffset`. Also creates the calendar event. |
| PATCH | `/todo/tasks/:id` | Any of the above plus `status` (`open`/`done`). Updates the calendar event. |
| DELETE | `/todo/tasks/:id` | Removes the task and its calendar event. Logged time stays in history. |
| POST | `/todo/tasks/:id/logs` | `day`, `minutes`, `note`, `today`. `day` must be today or up to 2 days back; max 24 h per day. |
| GET | `/todo/logs?from=&to=` | Time entries, newest first. |
| DELETE | `/todo/logs/:id?today=` | Remove an entry from the last 3 days. |
| GET | `/todo/summary?today=` | Totals, hours, consistency (streaks + level) and a 182-day heatmap. |
| GET | `/todo/days/:day` | Everything on one day. |

`today` is the browser's own date and `tzOffset` is `Date#getTimezoneOffset()`; the server rejects a `today` more than one day away from its own clock. Code: `backend/src/modules/todo/` (pure maths in `todo.compute.ts`, tested in `todo.compute.test.ts`).
