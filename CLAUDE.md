Build a dead-simple routine PWA. SvelteKit (adapter-node), runs as a Docker Compose stack on my NAS.
Svelte. No plain HTML.

CONCEPT

- I create routines (e.g. "Morning routine").
- A routine has: name, start time (HH:MM, daily), tolerance in minutes (default 5),
  and an ordered list of steps.
- A step has: description (e.g. "Wash face") and a verification type:
  - "tap": just press Done
  - "photo": take a photo that must match a reference photo I set when creating the step
- A routine is "open" from (time - tolerance) to (time + tolerance).
  - Before the window: show "opens at HH:MM", check-in disabled.
  - Inside the window: I can complete the steps in order.
  - After the window with steps left: mark the routine "missed" for today.
- Log each completion with the actual time and offset (e.g. "+3 min").

SCREENS (single page, show/hide sections)

1. Today: list of routines with status (upcoming / open / done / missed), sorted by time.
   Tap an open routine to work through its steps.
2. Edit routine: name, time, tolerance, add/remove/reorder steps,
   pick verification type, capture reference photo for photo steps.
3. History: last 7 days per routine with status and offset.

PHOTO VERIFICATION (keep it stupid)

- Use <input type="file" accept="image/*" capture="environment">.
- Downscale both images to 32x32 on a canvas.
- Score = average of (a) dHash similarity (1 - hamming/64) and
  (b) color histogram intersection (4 bins per channel).
- Pass if score >= 0.6. Show the score after each attempt so I can tune it.
- Store only a small JPEG thumbnail (~128px) of the reference photo.

STORAGE

- Personal data (routines, log, points) in localStorage under one key "routines-v1".
- The household (tasks, areas, ticks) is shared via the server API, stored in one JSON file on a Docker volume.
- Wrap reads/writes in try/catch. Add an export/import JSON button as backup.

REMINDERS

- While the app is open, check every 30s. When a window opens, show a banner,
  play a short beep (WebAudio), and fire a Notification if permission is granted.
- Don't attempt server push.

PWA

- manifest.json with name, icons, display: standalone.
- A service worker (src/service-worker.js) that caches the app shell for offline use.
- Must work on mobile Safari and Chrome. Big touch targets, light and dark mode.

Give me a README with how to run locally (e.g. `bunx serve .`) and test on my phone.

ADD: POINTS AND PENALTIES

Scoring (store in the same localStorage object):

- Routine fully completed inside its window: +10
- Bonus for finishing within ±1 min of the target time: +2
- Routine missed (window closed with steps left): -20
- Partially completed when the window closes: -10
- Streak: each consecutive day a routine is completed adds +1 to its reward (cap +10).
  A miss resets the streak.
- The score never goes below 0: penalties floor the running total at 0 (no hidden debt).
  Show it at the top of the Today screen.

Anti-cheat (so I can't dodge penalties):

- Changes to a routine's time or tolerance only take effect from tomorrow.
- A routine can't be edited or deleted while its window is open or after it was missed today.
- Deleting a routine never removes past log entries or points.
- Missed routines are evaluated on app start too: if the app was closed during a window,
  apply the penalty for every missed window since the last check (up to 7 days back).

History screen: show points per day and a running total.
