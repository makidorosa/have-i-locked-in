Have I Locked In? v0.8.3 — persistent timers

Back up your data first. Replace app/lock-in-dashboard.tsx only.

Running sessions are saved under the existing localStorage key and recover after browser/app termination. Timers count wall clock time, capped at their required duration and at the midnight boundary of the start day. Already paused time survives. JSON export now includes active timer state.

Test: start a 2-minute timed assignment, close the tab, return after a minute. Pause and check accumulated time.
