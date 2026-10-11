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

For each day to watch, from the nearest to the farthest, the app looks for a non-completed slot to **push back by a few days**:

1. The highest Js are tried first (more slack than a J0 or J1); a completed slot is never touched.
2. Maximum delay accepted by J: **1 day** for J0 and J1, **2 days** for J2 and J3, **3 days** beyond.
3. A move is kept only if it **relieves** the starting day (fewer slots outside the window, or fewer minutes above the target) and
   makes **no other day worse**, cascade included: a day without an alert does not receive one, an already busy day must not get worse.
4. If the cascade is on (Settings), the following non-completed Js of the same course are shifted by the same number of days; their
   arrival days are part of the check.
5. If no slot fits, the app says so: **“no simple solution”**. It is then up to you to move a slot by hand or to adjust the working window or
   the target.

Moves are computed one after the other on a simulated state. Each proposal has a **checkbox, everything is checked by default**, and a single
**Accept (N moves)** button whose number follows the boxes. If you uncheck a move that another one relied on (for instance because its
cascade freed some room), the other one is greyed out and not applied: the displayed number is always what will really be done.

## Catching up overdue slots

It is the **same engine** (same cascade, same checks) with a different goal: here the app does not try to relieve a day, it looks for the first
free place.

1. Overdue slots are handled from the oldest to the most recent.
2. Each one is put back **as early as possible from today**, on a day where it makes nothing worse (target and window respected,
   cascade included).
3. With the cascade, the following Js of the same course follow; those that already moved are not proposed a second time.
   As with smoothing, proposals can be checked and unchecked.
4. The search covers the **next 14 days**. Beyond that, or if no day fits: “no simple solution”, to be moved by hand.

## Good to know

- The two plans are independent: applying one recomputes the other. Depending on the order, a day may become impossible to relieve
  (for example if the catch-up filled the following days): the app then says so honestly.
- A single “Plan applied” message with **Undo** puts all slots (and the courses' start dates) back as they were.
- Moved slots are placed back into the working window of their new day, avoiding breaks.
- None of this touches the Firestore rules or the stored data model: only the dates and times of slots change, as with a move done by hand.
