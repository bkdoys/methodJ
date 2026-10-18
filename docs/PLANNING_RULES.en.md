# Overload, overdue slots and load smoothing

This page describes exactly what the app does when a day is too busy or when reviews are overdue.
The principle: **it flags and proposes, it never moves anything without your consent**, and every application can be undone in one click.

## When a day has no room left

A slot that no longer finds room inside its day's working window is **neither moved to the next day nor deleted**. It stacks right after
the last slot, so after the end of the window (at most until midnight), in the greyed zone of the planner. The dates of the Js stay
those of the method.

The app flags it in three ways: an amber marker on the slot, an amber day header (multi-day and week views, and badges under “Daily load”
in the Day view), and a “Days to watch” card in the **Dashboard** tab (the tab badge counts them).

A day is “to watch” in two cases:
- **Target exceeded**: the sum of the durations of all its slots goes above the daily target (Settings, `dailyTargetHours`);
- **Slots outside the window**: a non-completed slot is placed after the end (or before the start) of the day's working window, breaks included.
  A “forced” day (open padlock) is never flagged as outside the window, since you lifted the limits on purpose.

## Smoothing a busy day

For each day to watch, from the nearest to the farthest, the app tries two things, in this order.

**First, without changing day.** If a slot runs past the working window while a place is free earlier the same day (for example a slot
placed late by hand, with a gap in the morning), it is **moved up to the first free place** of the day, avoiding breaks. This touches no
other day and no cascade. If the day is only over the target, moving up changes nothing: the app goes on to the next step.

**Then it looks for a non-completed slot to push back by a few days**:

1. The highest Js are tried first (more slack than a J0 or J1); a completed slot is never touched.
2. Maximum delay accepted by J: **1 day** for J0 and J1, **2 days** for J2 and J3, **3 days** beyond. An R review (course in free review) has no interval to respect: it is tried first, up to **3 days**, and never shifts other slots.
3. A slot pushed back is **placed at the first free place of its new day** (as when you move it by hand): the arrival day is judged with that
   time, not with the old one. A slot that would keep an hour that also overflows there is therefore no longer refused when there is room earlier.
4. A move is kept only if it **relieves** the starting day (fewer slots outside the window, or fewer minutes above the target) and
   makes **no other day worse**, cascade included: a day without an alert does not receive one, an already busy day must not get worse.
5. If the cascade is on (Settings), the following non-completed Js of the same course are shifted by the same number of days; their
   arrival days are part of the check.
6. If no slot fits, the app says so: **“no simple solution”**. It is then up to you to move a slot by hand or to adjust the working window or
   the target.

Moves are computed one after the other on a simulated state. Each proposal has a **checkbox, everything is checked by default**, and a single
**Accept (N moves)** button whose number follows the boxes. If you uncheck a move that another one relied on (for instance because its
cascade freed some room), the other one is greyed out and not applied: the displayed number is always what will really be done.

## Catching up overdue slots

It is the **same engine** (same cascade, same checks) with a different goal: here the app does not try to relieve a day, it looks for the first
free place.

1. Overdue slots are handled from the oldest to the most recent.
2. Each one is put back **as early as possible from today**, on a day where it makes nothing worse (target and window respected,
   cascade included), at the first free place of that day.
3. With the cascade, the following Js of the same course follow; those that already moved are not proposed a second time.
   As with smoothing, proposals can be checked and unchecked.
4. The search covers the **next 14 days**. Beyond that, or if no day fits: “no simple solution”, to be moved by hand.

## Revision period

Before an exam, the “Revision period” wizard (Dashboard and Courses view when the exam gets close, or Preferences › Exam) spreads reviews over a date range.

1. Chosen courses on the J method switch to **free review**: their upcoming J are removed, done reviews stay. After the period they stay
   free.
2. Each course gets a **number of passes based on its mastery** (not rated 2, ★ 3, ★★ 3, ★★★ 2, ★★★★ 1), editable in the preview. A free
   course's R already planned in the period count as passes.
3. A course's passes are **evenly spaced**, the last one near the end of the period. Two passes of the same course are always at least
   half that spacing apart.
4. **Disciplines alternate**: courses of the same discipline are staggered, and a discipline never takes more than its share of a day.
5. Other things equal, the **least loaded day** wins (slots already planned included). The period's daily target, hours and breaks are
   respected; a pass with no room is reported, never forced.
6. If it doesn't fit with your usual hours, the app suggests **longer days** (the minimum needed, up to 11 h), then, at 11 h, **a longer
   period** (computed as tightly as possible), or fewer passes.
7. The period has **its own hours, breaks and target**: they replace yours on these dates only (planner, alerts, smoothing), then
   everything goes back to normal. Deleting the period (Settings › Planning) removes them.

The whole wizard is a simulation: nothing changes before “Plan”. “Another spread” draws another arrangement, and a single message with
**Undo** puts everything back.

## Good to know

- The two plans are independent: applying one recomputes the other. Depending on the order, a day may become impossible to relieve
  (for example if the catch-up filled the following days): the app then says so honestly.
- A single “Plan applied” message with **Undo** puts all slots (and the courses' start dates) back as they were.
- Moved slots are placed back into the working window of their new day, avoiding breaks.
- None of this touches the Firestore rules or the stored data model: only the dates and times of slots change, as with a move done by hand.
