<script>
  // App shell: tab bar, "+" sheet, banner, and everything that runs on every page
  // (saving, 30s tick with penalties/reminders/sync, theme, share and invite links).
  import { onMount } from "svelte";
  import { goto, afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { dev } from "$app/env";
  import "@fontsource-variable/inter"; // self-hosted, so it works offline
  import "../app.css";
  import { save, evaluate, dayKey, parseShare } from "../logic.js";
  import { app, stOf, sync, syncMe, setMeKey, pale, ic } from "#lib/app.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { Clock, House, List, Plus, Sun } from "@lucide/svelte";

  let { children } = $props();
  const appState = app.state;

  evaluate(appState, new Date());
  let saveOk = $state(true);
  // Save on every change; sync personal data 2 s after the last one (it only uploads if something changed).
  let meTimer;
  $effect(() => {
    saveOk = save(appState);
    clearTimeout(meTimer);
    meTimer = setTimeout(syncMe, 2000);
  });
  $effect(() => {
    try {
      localStorage.setItem("routines-household", JSON.stringify(app.hh));
    } catch {}
  });

  // shadcn's dark mode is the `.dark` class; "system" follows the OS live. app.html applies it before mount.
  $effect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = app.theme === "dark" || (app.theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
      for (const metaTag of document.querySelectorAll('meta[name="theme-color"]')) metaTag.content = dark ? "#141414" : "#fafaf8";
    };
    apply();
    mq.addEventListener("change", apply);
    try {
      localStorage.setItem("routines-theme", app.theme);
    } catch {}
    return () => mq.removeEventListener("change", apply);
  });

  // Penalties, reminders and sync every 30s and on return to foreground; the clock ticks every second for countdowns.
  const notified = new Set();
  function tick() {
    app.now = new Date();
    evaluate(appState, app.now);
    sync();
    syncMe();
    for (const routine of appState.routines) {
      const key = routine.id + dayKey(app.now);
      if (stOf(routine) === "open" && !notified.has(key)) {
        notified.add(key);
        remind(routine);
      }
    }
  }

  let audio;
  // iOS only allows audio after a user gesture, so unlock on first touch.
  const unlockAudio = () => {
    try {
      (audio ??= new AudioContext()).resume();
    } catch {}
  };
  function beep() {
    try {
      audio ??= new AudioContext();
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.2;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.25);
    } catch {}
  }
  function remind(routine) {
    app.banner = `${routine.name} ist jetzt offen`;
    beep();
    if (routine.autoStart && !page.route.id?.startsWith("/routine")) goto(`/run/${routine.id}`);
    if (app.perm !== "granted") return;
    try {
      new Notification("Routine offen", { body: routine.name, icon: "/icon-192.png" });
    } catch {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.showNotification("Routine offen", { body: routine.name })); // Android Chrome
    }
  }

  // Links into the app that carry data in the hash: #r=<code> (shared routine), #join=<code> (household invite,
  // optionally &me=<key> to connect another device of yours), and old #/… URLs from before the app had real pages.
  const OLD = { edit: "routine", new: "routine/new", routines: "lists" };
  async function onHash() {
    const hash = location.hash;
    if (hash.startsWith("#r=")) {
      try {
        app.importDraft = await parseShare(hash.slice(3));
        goto("/routine/new", { replace: true });
      } catch {
        app.banner = "Ungültiger Teilen-Link";
        goto("/", { replace: true });
      }
    } else if (hash.startsWith("#join=")) {
      const params = new URLSearchParams(hash.slice(1));
      app.hh.code = params.get("join");
      if (/^[0-9a-f]{32}$/.test(params.get("me") ?? "")) setMeKey(params.get("me"));
      goto("/settings", { replace: true });
      sync();
      syncMe();
    } else if (hash.startsWith("#/")) {
      const [name = "", ...rest] = hash.slice(2).split("/");
      goto("/" + [OLD[name] ?? name, ...rest].filter(Boolean).join("/"), { replace: true }).catch(() => goto("/", { replace: true }));
    }
  }

  onMount(() => {
    if (!dev && "serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js");
    tick();
    onHash();
    const tickTimer = setInterval(tick, 30000),
      clockTimer = setInterval(() => (app.now = new Date()), 1000);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(tickTimer);
      clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", vis);
    };
  });

  afterNavigate(({ to }) => {
    app.newOpen = false;
    // The task draft only lives across the task editor and Bereiche.
    if (!/^\/(task|areas)/.test(to?.route.id ?? "")) app.tdraft = null;
  });

  const tabOn = (path) => page.url.pathname === path;
</script>

<svelte:window onpointerdown={unlockAudio} onhashchange={onHash} />

{#snippet tab(path, text, Icon)}
  <a
    href={path}
    aria-current={tabOn(path) ? "page" : undefined}
    class="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] no-underline {tabOn(path)
      ? 'font-semibold text-foreground'
      : 'font-medium text-muted-foreground'}"
  >
    <Icon size={22} strokeWidth={1.75} aria-hidden="true" />{text}
  </a>
{/snippet}

<div class="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-[calc(70px+max(env(safe-area-inset-bottom),12px))] print:p-0">
  {#if !saveOk}<p class="mx-4 mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive print:hidden">
      Speichern fehlgeschlagen (Speicher voll?). Exportier jetzt ein Backup.
    </p>{/if}
  {#if app.banner}<button
      class="fixed inset-x-4 top-[max(env(safe-area-inset-top),12px)] z-40 mx-auto max-w-md rounded-xl bg-primary p-3.5 text-left text-[15px] font-medium text-primary-foreground shadow-lg print:hidden"
      onclick={() => (app.banner = "")}>{app.banner}</button
    >{/if}

  {@render children()}

  <!-- Always pinned to the bottom; a page can put a bar right above the tabs (app.footer). -->
  <div class="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md print:hidden">
    {@render app.footer?.()}
    <nav aria-label="Hauptnavigation" class="flex items-center border-t bg-card px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)]">
      {@render tab("/", "Heute", Sun)}
      <Button size="icon" class="size-13 rounded-full" aria-label="Neu anlegen" onclick={() => (app.newOpen = true)}
        ><Plus size={22} strokeWidth={2} aria-hidden="true" /></Button
      >
      {@render tab("/lists", "Listen", List)}
    </nav>
  </div>
</div>

<Drawer.Root bind:open={app.newOpen} shouldScaleBackground={false}>
  <Drawer.Content class="mx-auto max-w-md bg-background">
    <div class="flex flex-col gap-3 px-4 pt-2 pb-[max(env(safe-area-inset-bottom),24px)]">
      <Drawer.Title class="mx-2 mt-2 mb-1 text-xl font-bold tracking-tight">Was möchtest du anlegen?</Drawer.Title>
      <a href="/routine/new" class="flex items-start gap-3.5 rounded-2xl bg-primary p-4 text-primary-foreground no-underline">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground" style="background: {pale('#E3B21C')}"
          ><Clock {...ic} /></span
        >
        <span class="flex flex-col gap-1"
          ><span class="text-[17px] font-semibold">Routine</span><span class="text-[13px] leading-snug opacity-75"
            >Nur für dich. Mit Uhrzeit, Zeitfenster, Schritten und Punkten.</span
          ></span
        >
      </a>
      <a href="/task/new" class="flex items-start gap-3.5 rounded-2xl border bg-card p-4 text-foreground no-underline">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl text-good" style="background: {pale('#3FA066')}"
          ><House {...ic} /></span
        >
        <span class="flex flex-col gap-1"
          ><span class="text-[17px] font-semibold">Haushaltsaufgabe</span><span class="text-[13px] leading-snug text-muted-foreground"
            >Für den Haushalt. Mit Bereich, Wochentagen und Notiz.</span
          ></span
        >
      </a>
    </div>
  </Drawer.Content>
</Drawer.Root>
