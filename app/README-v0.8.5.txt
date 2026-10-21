Have I Locked In? v0.8.5 — UI polish

UPDATE YOUR EXISTING NEXT.JS PROJECT:
1. Export your JSON backup first from the running app.
2. Copy lock-in-dashboard.tsx to app/lock-in-dashboard.tsx (replace the previous file).
3. Copy lock-in-theme.css to app/lock-in-theme.css (NEW file, in the same app folder).
4. Leave your existing app/page.tsx and other project files in place.
5. Run npm run dev, then test. Run npm run build before deploying.

WHAT'S NEW:
- Light/dark mode and six accent presets plus a custom color picker on Home.
- Poppins font (weights 300–900). Google Fonts loads when online; system font is fallback.
- Manual study logs in Planner. Choose a course, date, minutes, and notes; logs affect exam prep calculations and weekly totals, but do NOT unlock mandatory timers or streak tasks.
- Personal events can be marked Done/Undo from Planner, Home and Schedule's day view; done state is retained in backups.
- Imports of older v0.8.x JSON files remain compatible. Same localStorage key.

NOTES:
- This is a source-level syntax-checked patch; it has not been run in your own installed Next.js project. Check mobile Safari color/contrast, timer recovery, and import/export after applying.
- Your preference and logged time are local to each browser unless you export and import your JSON.
- Manually entered sessions are self-reported, so avoid logging the same session twice (once by timer and once manually).
