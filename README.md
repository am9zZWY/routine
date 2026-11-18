# Routine

A small routine-tracker PWA. Built with SvelteKit (`adapter-node`) and Svelte 5. Personal data (routines, points, history) stays in the browser's `localStorage` under `routines-v1`. The household (tasks, areas, ticks) is shared through a small server API and stored in one JSON file. The UI is in German (informal "du"); this README stays English.

## Run locally

```sh
bun install
HOUSEHOLD_CODE=test bun run dev   # dev server with hot reload; --host also exposes it on your LAN
bun test                          # logic, scoring and household-op tests
pre-commit install                # once: gitleaks + prettier run on every commit
bun run build                     # Node server in build/
HOUSEHOLD_CODE=test PORT=3000 node build   # run the built app (service worker only runs in the build)
```

Household data goes to `data/household.json` locally (`DATA_DIR` changes it).

## Run on your NAS (Docker Compose)

Copy the repo to the NAS (or `git clone` it there), then:

```sh
echo "HOUSEHOLD_CODE=$(openssl rand -hex 12)" > .env   # once; compose refuses to start without it
docker compose up -d --build
```

The image builds the app with Bun, runs the tests, and runs the Node server on port **8080** (change it in `compose.yaml`). Open `http://<nas-ip>:8080`. To update, pull and run the same command again.

**Prebuilt image:** every push to `main` builds and publishes `ghcr.io/am9zzwy/routine:latest` (`.github/workflows/docker-publish.yml`). On the NAS you then only need `compose.yaml` and `.env`: `docker compose pull && docker compose up -d`. The package is private by default; make it public under GitHub → Packages → routine → Package settings, or `docker login ghcr.io` on the NAS with a token that has `read:packages`.

**Household:** on your phone open **Einstellungen (gear) → Haushalt teilen**, enter your name and the code from `.env`. **Person einladen** shares a link with the code built in; whoever opens it joins. Everyone then sees the same tasks and ticks, with the name of whoever ticked. Phones sync every 30 s, when the app comes back to the front, and after each change. Changes made while the NAS is unreachable are queued and sent later. Anyone with the code can change the household, so only share it inside your household.

**Data:** the household lives in the Docker volume `household` (`/data/household.json`); back that up. Your routines, points and history are saved on the phone and, once the household code is set, also in `/data/me/<hash>.json` (one file per person, named by a hash of their personal sync key). **Einstellungen → Meine Geräte → Anderes Gerät verbinden** shows a link/QR with that key; open it on your other phone or laptop and both stay in sync. Edits from both are merged: the latest edit of a routine wins, deletions stick, and for each routine and day the best outcome counts (done beats a penalty logged by an offline device). Tasks created on a phone before it first synced are uploaded once, only if the server has no tasks yet.

**HTTPS:** over plain `http://<nas-ip>`, browsers block the **service worker and notifications**, so offline mode, "install" and reminders won't work. Put the container behind your NAS's reverse proxy with a certificate (Synology: Control Panel → Login Portal → Reverse Proxy; or Caddy/Traefik/Tailscale Serve) and open the `https://` URL instead.

## Test on your phone

**Quick (same Wi-Fi):** run `bun run dev` and open the `Network:` URL it prints (e.g. `http://192.168.1.20:5173`) on your phone, or open the NAS URL. Routines, steps and photo checks all work over HTTP.

**Full PWA:** open the HTTPS URL (see above) on your phone:

- **iOS Safari:** Share → Add to Home Screen. Notifications only work from the installed app (iOS 16.4+).
- **Android Chrome:** ⋮ → Install app.

Then tap the share icon (top right of Today) → **Benachrichtigungen** to enable notifications.

## How it works

- **Pages:** each screen is a SvelteKit route: `/` (today), `/lists`, `/history`, `/settings`, `/routine/new`, `/routine/<id>`, `/run/<id>`, `/task/new`, `/task/<id>`, `/areas`. A locked or unknown routine at `/routine/<id>` sends you back to `/`. Old `#/…` links are redirected. Share links (`/#r=…`) and household invites (`/#join=…`) are handled on any page.

- **UI:** built with [shadcn-svelte](https://www.shadcn-svelte.com) (Tailwind v4, components in `src/lib/components/ui`, colors in `src/app.css`). Inter font, warm off-white background, white list cards, one blue accent. Light and dark follow the system, or set them under **Darstellung**.
- **Tabs:** a bottom bar with **Heute**, a round **+** (choose Routine or Haushaltsaufgabe) and **Listen**. **Verlauf** opens from the points pill on Today or from Listen → Ich.
- **Today:** your score pill (never below 0), a week strip to pick a day (arrows move a week), and an **Alle / Ich / Haushalt** filter. _Ich_ is a timeline like the Structured app: each routine is a block in its colour with its icon, as tall as the routine is long, with a red line for "now". The circle on the right ticks the whole routine off (only while open or overdue; routines with a required photo step open the running screen instead). Past days show what was logged, future days what's planned. _Haushalt_ shows today's household tasks with round checkboxes in their area colour, notes, and an "x von y" progress bar.
- **Listen:** _Ich_ lists routines (time, window, steps; lock while not editable). _Haushalt_ lists tasks grouped by area with their rhythm; **Bereiche verwalten** below.
- **Household tasks:** name, area, repeat (daily, weekdays, every N weeks on a weekday, first weekday of the month) and a note. They have no points or windows. Ticking one marks it done for today. **Abbrechen/Sichern** instead of autosave.
- **Bereiche:** add (name + colour, or a suggestion) and remove areas. "Allgemein" is fixed; tasks of a removed area move there.
- **History:** a 14-day points chart (blue up, red down), then the last 7 days per routine with status, offset, points per day and a running total.
- **Einstellungen** (gear, top right of Heute, Listen and Verlauf): household export (all tasks or this week) as CSV with Mo–So columns or as a printable A4 weekly plan, JSON backup export/import (routines, points, history; the household is on the server), theme (System/Hell/Dunkel), and notification permission.
- **Running:** a ring counting down to the window's end, one dot per step, the current step card (**Erledigt**, or **Foto machen** for photo steps, with the match score shown after each try), and all steps below it, finished ones ticked.
- **Edit:** name, colour and icon, start time, window (±N min with −/+), a **Start automatically** switch, and the step list. Each row shows its start time, duration and a "Foto fehlt" badge if a photo step has no reference yet. Tap a row to open the step sheet (text, duration, fixed time, tap/photo check, reference photo, optional, delete); drag the grip to reorder. Tap a "+" gap to choose where new steps go (blue marker), then type in the bottom bar and press enter. Steps open in a bottom drawer. The sparkle button opens the AI suggestions sheet (see below). Routines are locked (not editable) while their window is open, while overdue, and after a miss.
- **Autosave + undo:** there is no Save button. Edits save about 0.4 s after you stop typing, as long as the routine is valid. The line under the header shows "Gespeichert" or "Nicht gespeichert: <reason>". Undo/redo icons step through your edits (up to 50). If you leave an existing routine with invalid changes, you're asked whether to discard them. After the first autosave, time and window changes are pending until tomorrow, like any other edit.
- **Start automatically:** when a routine with this switch on opens while the app is open, the app jumps straight into the running screen.
- **Optional steps** (dashed) have a **Skip** button. Once only optional steps are left, **Finish routine** ends it. If the window closes with only optional steps left, the routine still counts as done. Every routine needs at least one required step.

- **Step times:** each step has a duration (default 2 min) and can have a fixed start time; otherwise it starts when the previous one ends. The edit screen shows each step's start, and the running screen counts down the current step (or shows "+m:ss late"). Step times are guidance only and never change points.
- **Sharing:** on the edit screen of a saved routine, the share icon shows a QR code and a link (`#r=…`), with Copy link and the native share sheet. Opening the link loads the routine as a new draft, which autosaves once it is valid. Reference photos aren't shared, so photo steps need new ones first. **Routine löschen** at the bottom of the edit screen deletes it.

- **Window:** a routine is open from `time − tolerance` to `time + tolerance`. Steps must be done in order.
- **Points:** +10 for finishing, +2 if you finish within ±1 min of the target, and +1 per consecutive day (up to +10). Ticking a routine off after its window but on the same day ("überfällig") gives 0 points and no penalty, and keeps the streak. Not done by midnight costs −20, or −10 if you did some of the steps; that resets the streak. The total never drops below 0: a penalty at 0 just leaves you at 0.
- **Anti-cheat:**
  - Time and tolerance changes apply from tomorrow.
  - A routine is locked while its window is open, while overdue, and after a miss.
  - Deleting a routine keeps its log and points.
  - Windows missed while the app was closed are penalised on the next start, up to 7 days back.
- **Photo check:** both images are downscaled to 32×32. The score is the average of dHash similarity and a colour-histogram intersection. A photo passes at ≥ 0.6. To tune it, change `THRESHOLD` in `src/photo.js`.
- **Reminders:** only while the app is open. It checks every 30s and again when you return to the app. There is no server push, so a closed or backgrounded app (especially on iOS) won't remind you.
- **Backup:** data is saved automatically in `localStorage`. **Einstellungen** exports or imports a JSON backup. Import adds the backup's routines and history to what's there (it doesn't delete anything).

## AI step suggestions

The sparkle button on the edit screen asks any OpenAI-compatible endpoint for step ideas, straight from the browser. Tap the gear in that sheet and fill in:

- **OpenAI:** API-URL `https://api.openai.com/v1`, your API key, model e.g. `gpt-4o-mini`.
- **Local (Ollama):** API-URL `http://localhost:11434/v1`, any or no key, model e.g. `llama3.2`. Ollama blocks browser requests from other origins, so start it with `OLLAMA_ORIGINS` set, e.g. `OLLAMA_ORIGINS="*" ollama serve` (or the app's exact origin). From your phone, use your computer's LAN IP instead of `localhost`, and note that an HTTPS page can't call a plain `http://` URL.

The settings live in `localStorage` under `routines-ai`, separate from your routines, so the JSON backup never contains them. The API key is stored there **in plain text**, so only use this on a device you trust. A 401 opens the settings again.

## Theme

Set it under **Einstellungen → Darstellung**. It's stored under `routines-theme`; `src/app.html` applies it before the app loads, so there's no flash.

## Files

- `src/routes/+layout.svelte`: app shell (tab bar, "+" sheet, banner), saving, the 30 s tick (penalties, reminders, sync), theme, share/invite links; `+layout.js` turns SSR off
- `src/routes/**/+page.svelte`: one file per screen
- `src/lib/app.svelte.js`: state shared by all pages (`app`), household sync (`mutate`, `sync`), formatting helpers
- `src/lib/components/app/`: small shared pieces (status circle, back header, segmented control, empty state, settings button)
- `src/logic.js`: windows, scoring, penalties, household recurrence, storage (tested in `src/logic.test.js`)
- `src/photo.js`: photo matching; `src/ai.js`: AI suggestions
- `src/lib/components/ui`: shadcn-svelte components, imported as `#lib/...` (package.json `imports`)
- `src/service-worker.js`: precaches all built files; offline, every page falls back to the cached shell; `static/manifest.json`: PWA manifest
- `src/household.js`: household ops (shared by browser and server); `src/lib/server/store.js`: JSON file storage and the household-code check; `src/routes/api/household/+server.js`: the household API (`GET`, `POST {ops}`, header `x-household-code`)
- `src/personal.js`: merge and validation for personal sync; `src/routes/api/me/+server.js`: the personal API (`GET`, `POST <state>`, headers `x-household-code` and `x-sync-key`)
- `Dockerfile`, `compose.yaml`: the NAS deployment
