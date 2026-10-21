HAVE I LOCKED IN? — v0.9 COMBINED UPDATE

BEFORE INSTALLING: export your current JSON backup in the running v0.8.5 app. Retain that file safely. Do NOT clear website data.

Install:
1. Extract this ZIP.
2. Replace app/lock-in-dashboard.tsx with the included lock-in-dashboard.tsx.
3. Replace app/lock-in-theme.css with the included lock-in-theme.css.
4. Copy app/manifest.ts into your project's app/ folder.
5. Copy all files inside the ZIP's public/ directory to your project's public/ directory (including sw.js and icons).
6. Your existing app/page.tsx may remain unchanged. A compatible page.tsx is included for reference.
7. Start with npm run dev; then test npm run build before deploying.
8. Deploy to Vercel; offline caching and PWA install features activate only in production.

WHAT'S INCLUDED
- New Settings tab: Appearance, supportive/strict/menace personality, Pomodoro interval lengths, freezes, semester dates, backup/restore.
- Semester date windows for recurring tasks and class meetings.
- Daily streak freezes for planned exceptions, saved in JSON.
- Deadline entries (due date, course, completed status) counting toward streak.
- Exam-specific study targets, confidence ratings, and practice quiz percentages.
- Study-task suggestion for exams with a target, adjusted for remaining days.
- Focus/break Pomodoro timer with optional manual study log credit.
- Study suggestions for free gaps in today's class timetable.
- Tap/click an hour line in Schedule's day grid to prefill a new event time.
- Lock-In Score separate from streak.
- Academic consequence completion action.
- A PWA manifest, icon assets, and a basic offline service worker.
- Existing timed tasks, flanking, all calendars, schedules, and backups preserved.

BACKWARD COMPATIBILITY
- The localStorage key remains have-i-locked-in-v1.
- JSON backups using original version: 1, tasks, history format (v0.1–v0.8.5) can be imported.
- Missing new fields are supplied safe defaults.
- New exports preserve the original fields plus new optional fields.
- Older app builds will not understand the new features; keep new exports safe before downgrading.

IMPORTANT LIMITATIONS
- Non-midnight daily cutoff is displayed/saved but the engine STILL finalizes at midnight; this setting is not enforced yet.
- Pomodoro intervals do not restore after fully closing the app. Use normal mandatory study timers for streak-critical assignments. Pomodoro completion creates manual study logs and NEVER bypasses a timed task.
- The offline service worker is a basic best-effort page cache, not guaranteed full offline support on every iOS/Next.js environment. Test in production, particularly across deployments.
- Exam study targets and quiz percentages are self-reported progress, not reliable measures of actual readiness.
- Dynamic Island Live Activities still require a native iOS app/extension and are NOT included.
- Before trusting a long streak, verify missed-day rollover, freeze days, and deadline dates on the deployed device. This update has passed TSX syntax/transpilation checks but has not run through your local Next.js production build.
