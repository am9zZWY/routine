<script>
  // Heute: a week strip to pick a day, that day's routines as a timeline (coloured blocks sized by length,
  // a line for "now", a circle to tick), then the household tasks due that day.
  import { goto } from "$app/navigation";
  import {
    windowOf,
    canEdit,
    entry,
    hm,
    score,
    dueOn,
    choreKey,
    cfg,
    span,
    startsOn,
    complete,
    tickable,
    addDays,
    dayKey,
  } from "../logic.js";
  import { app, stOf, mutate, areaOf, pale, rhythm, isDone, signed, ST, meta, listCard } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Circle from "#lib/components/app/Circle.svelte";
  import RoutineIcon from "#lib/components/app/RoutineIcon.svelte";
  import Empty from "#lib/components/app/Empty.svelte";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";
  import { Check, ChevronLeft, ChevronRight, House, Lock } from "@lucide/svelte";

  const appState = app.state;
  const now = $derived(app.now);
  const today = $derived(app.today);
  const day = $derived(app.day ?? today);
  const isToday = $derived(day === today);
  const total = $derived(score(appState));
  const date = (dayString) => new Date(dayString + "T12:00");

  // Week strip (Mo–So) around the picked day; arrows move a week.
  const week = $derived.by(() => {
    const pickedDate = date(day),
      mon = addDays(pickedDate, -((pickedDate.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_unused, index) => dayKey(addDays(mon, index)));
  });
  const pickDay = (picked) => (app.day = picked === today ? null : picked);
  const title = $derived(isToday ? "Heute" : date(day).toLocaleDateString("de-DE", { weekday: "long" }));
  const sub = $derived(date(day).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }));

  // Status on the picked day: live today, from the log in the past, planned in the future.
  const stOn = (routine) => (isToday ? stOf(routine) : day < today ? (entry(appState, routine.id, day)?.status ?? "missed") : "upcoming");
  const items = $derived(
    appState.routines
      .filter((routine) => startsOn(routine, day) || (isToday && stOf(routine) === "new"))
      .sort((first, second) => cfg(first, day).time.localeCompare(cfg(second, day).time)),
  );
  // The "now" line goes before the first routine that starts later.
  const nowAt = $derived(isToday ? items.findIndex((routine) => windowOf(routine, day).target > now) : -2);
  const blockH = (routine) => Math.round(Math.min(120, Math.max(52, span(routine, day) * 1.6)));

  function tick(routine) {
    const logEntry = complete(appState, routine, new Date());
    if (logEntry)
      app.banner =
        logEntry.status === "late"
          ? `${routine.name} nachträglich erledigt · keine Punkte, keine Strafe`
          : `${routine.name} erledigt · ${signed(logEntry.points)}`;
    else goto(`/run/${routine.id}`); // a photo step is left
  }
  const linkOf = (routine, st) =>
    st === "open" || st === "overdue" ? `/run/${routine.id}` : canEdit(appState, routine, now) ? `/routine/${routine.id}` : undefined;
  function subline(routine, st) {
    if (isToday) return meta(routine);
    const time = cfg(routine, day).time,
      len = span(routine, day),
      logEntry = entry(appState, routine.id, day);
    if (day > today) return `${time} · ${len} Min.`;
    return logEntry ? `${time} · ${ST[logEntry.status]} · ${signed(logEntry.points)} Pkt.` : `${time} · ${ST[st]}`;
  }

  const tasksOn = $derived(appState.tasks.filter((task) => dueOn(task, day)));
  const tasksDone = $derived(tasksOn.filter((task) => isDone(task, day)));
  const tasksSorted = $derived([...tasksOn.filter((task) => !isDone(task, day)), ...tasksDone]);
  const doneBy = (task) => appState.chores[choreKey(task.id, day)];
  const toggleChore = (task) => mutate({ t: "chore", id: task.id, day, by: isDone(task, day) ? null : app.hh.name.trim() || "" });
</script>

<header class="flex flex-col gap-3 px-5 pt-13 pb-2">
  <div class="flex items-center justify-between">
    <a
      href="/history"
      aria-label="Punkte, zum Verlauf"
      class="num rounded-full bg-secondary px-3 py-1.5 text-sm font-bold text-foreground no-underline">{total} Pkt.</a
    >
    <SettingsBtn />
  </div>
  <div class="flex items-end justify-between gap-3 px-1">
    <div class="flex flex-col">
      <h1 class="m-0 text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
      <span class="text-[15px] text-muted-foreground">{sub}</span>
    </div>
    {#if !isToday}<Button variant="secondary" class="h-9 rounded-full px-3.5" onclick={() => (app.day = null)}>Heute</Button>{/if}
  </div>

  <nav aria-label="Tag wählen" class="flex items-center">
    <Button
      variant="ghost"
      size="icon"
      class="size-9 shrink-0"
      aria-label="Woche zurück"
      onclick={() => pickDay(dayKey(addDays(date(day), -7)))}><ChevronLeft size={18} aria-hidden="true" /></Button
    >
    <ol class="m-0 grid flex-1 list-none grid-cols-7 p-0">
      {#each week as stripDay (stripDay)}
        {@const sel = stripDay === day}
        <li>
          <button
            class="flex w-full flex-col items-center gap-1 rounded-xl bg-transparent py-1.5"
            aria-current={sel ? "date" : undefined}
            aria-label={date(stripDay).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
            onclick={() => pickDay(stripDay)}
          >
            <span class="text-[11px] font-medium text-muted-foreground"
              >{date(stripDay).toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}</span
            >
            <span
              class="num flex size-8 items-center justify-center rounded-full text-[15px] font-semibold {sel
                ? 'bg-primary text-primary-foreground'
                : stripDay === today
                  ? 'text-brand'
                  : ''}">{date(stripDay).getDate()}</span
            >
          </button>
        </li>
      {/each}
    </ol>
    <Button
      variant="ghost"
      size="icon"
      class="size-9 shrink-0"
      aria-label="Woche vor"
      onclick={() => pickDay(dayKey(addDays(date(day), 7)))}><ChevronRight size={18} aria-hidden="true" /></Button
    >
  </nav>

  <Segmented
    opts={[
      ["all", "Alle"],
      ["me", "Ich"],
      ["home", "Haushalt"],
    ]}
    get={() => app.filter}
    set={(value) => (app.filter = value)}
    label="Filter"
  />
</header>

<main class="flex flex-1 flex-col gap-6 px-4 pt-2 pb-5">
  {#if app.filter !== "home"}
    <section aria-label="Meine Routinen" class="flex flex-col gap-2">
      <h2 class="mx-2 my-0 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <Lock size={14} strokeWidth={2} aria-hidden="true" /> Ich
      </h2>
      {#if !appState.routines.length}
        <Empty
          text={"Noch keine Routinen. Leg deine erste an, zum Beispiel deine Morgenroutine."}
          href={"/routine/new"}
          action={"Neue Routine"}
        />
      {:else if !items.length}
        <Card.Root class="{listCard} p-5 text-center text-[13px] text-muted-foreground">An diesem Tag stehen keine Routinen an.</Card.Root>
      {:else}
        <!-- Timeline: a dashed rail through the blocks; each block is as tall as the routine is long (clamped). -->
        <ol class="relative m-0 flex list-none flex-col gap-1 p-0" aria-label="Zeitplan">
          <span class="absolute top-6 bottom-6 left-[76px] border-l-2 border-dashed border-border" aria-hidden="true"></span>
          {#each items as routine, index (routine.id)}
            {@const st = stOn(routine)}
            {@const color = routine.color ?? "var(--brand)"}
            {@const win = windowOf(routine, day)}
            {@const done = ["done", "late"].includes(st)}
            {#if index === nowAt}
              <li class="relative flex items-center gap-2 py-0.5" aria-label="Jetzt {hm(now)}">
                <span class="num w-12 text-right text-[12px] font-bold text-destructive">{hm(now)}</span>
                <span class="h-0.5 flex-1 rounded-full bg-destructive"></span>
              </li>
            {/if}
            <li class="relative flex items-stretch gap-2">
              <span class="num w-12 shrink-0 pt-2 text-right text-[13px] font-medium text-muted-foreground">{hm(win.target)}</span>
              <span
                class="z-1 flex w-11 shrink-0 items-start justify-center rounded-full pt-3 {done ? '' : 'text-white'}"
                style="height: {blockH(routine)}px; background: {done ? pale(color) : color}; color: {done ? color : ''}"
                ><RoutineIcon icon={routine.icon} /></span
              >
              <a
                href={linkOf(routine, st)}
                class="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pl-1 text-foreground no-underline {st === 'new'
                  ? 'opacity-60'
                  : ''}"
              >
                <span class="text-[16px] font-semibold {done ? 'text-muted-foreground line-through' : ''}">{routine.name}</span>
                <span
                  class="num text-[13px] {st === 'open'
                    ? 'font-medium text-brand'
                    : st === 'overdue'
                      ? 'font-medium text-destructive'
                      : 'text-muted-foreground'}">{subline(routine, st)}</span
                >
              </a>
              {#if isToday && tickable(st)}
                <button
                  class="flex size-11 shrink-0 items-center justify-center self-center bg-transparent"
                  aria-label="Abhaken: {routine.name}"
                  onclick={() => tick(routine)}><Circle {st} {color} /></button
                >
              {:else}
                <span class="flex size-11 shrink-0 items-center justify-center self-center" aria-label={ST[st]}
                  ><Circle {st} {color} /></span
                >
              {/if}
            </li>
          {/each}
          {#if nowAt === -1}
            <li class="relative flex items-center gap-2 py-0.5" aria-label="Jetzt {hm(now)}">
              <span class="num w-12 text-right text-[12px] font-bold text-destructive">{hm(now)}</span>
              <span class="h-0.5 flex-1 rounded-full bg-destructive"></span>
            </li>
          {/if}
        </ol>
      {/if}
    </section>
  {/if}

  {#if app.filter !== "me"}
    <section aria-label="Haushalt" class="flex flex-col gap-2">
      <div class="mx-2 flex items-center justify-between">
        <h2 class="m-0 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <House size={14} strokeWidth={2} aria-hidden="true" /> Haushalt
        </h2>
        {#if tasksOn.length}
          <span class="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Progress value={tasksDone.length} max={tasksOn.length} class="h-1 w-12 bg-border *:data-[slot=progress-indicator]:bg-brand" />
            <span class="num">{tasksDone.length} von {tasksOn.length}</span>
          </span>
        {/if}
      </div>
      {#if tasksOn.length}
        <Card.Root class={listCard}>
          {#each tasksSorted as task (task.id)}
            {@const area = areaOf(task.area)}
            {@const checked = isDone(task, day)}
            <div class="flex gap-3 border-b border-divider pr-4 pl-1.5 last:border-b-0 {checked ? 'items-center' : 'items-start py-2'}">
              <button
                class="flex size-11 shrink-0 items-center justify-center bg-transparent disabled:opacity-60"
                aria-label="{checked ? 'Als offen markieren' : 'Erledigt'}: {task.title}"
                aria-pressed={checked}
                disabled={day > today}
                onclick={() => toggleChore(task)}
              >
                {#if checked}<span class="flex size-6 items-center justify-center rounded-full text-white" style="background: {area.color}"
                    ><Check size={14} strokeWidth={3} aria-hidden="true" /></span
                  >
                {:else}<span class="size-6 rounded-full border-2" style="border-color: {area.color}; background: {pale(area.color)}"
                  ></span>{/if}
              </button>
              {#if checked}
                <span class="flex-1 text-[15px] text-muted-foreground line-through">{task.title}</span>
                {#if typeof doneBy(task) === "string" && doneBy(task)}<span class="text-[12px] text-muted-foreground">{doneBy(task)}</span
                  >{/if}
              {:else}
                <span class="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
                  <span class="text-base font-medium">{task.title}</span>
                  <span class="flex items-center gap-1.5 text-[13px] text-muted-foreground"
                    ><span class="size-2 shrink-0 rounded-full" style="background: {area.color}"></span>{area.name} · {rhythm(task)}</span
                  >
                  {#if task.note}<span class="mt-0.5 text-[13px] leading-snug text-muted-foreground">{task.note}</span>{/if}
                </span>
              {/if}
            </div>
          {/each}
        </Card.Root>
      {:else}
        <Empty
          text={appState.tasks.length
            ? "An diesem Tag steht im Haushalt nichts an."
            : "Noch keine Haushaltsaufgaben. Leg die erste an, zum Beispiel Pflanzen gießen."}
          href={"/task/new"}
          action={"Neue Aufgabe"}
        />
      {/if}
    </section>
  {/if}
</main>
