<script>
  // Heute: the next routine as a dark card, other routines, and today's household tasks.
  import { windowOf, canEdit, stepOf, entry, hm, score, dueOn, choreKey } from "../logic.js";
  import { app, stOf, mutate, areaOf, pale, rhythm, isDone, mmss, until, signed, summary, ST, meta, listCard } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import Circle from "#lib/components/app/Circle.svelte";
  import Empty from "#lib/components/app/Empty.svelte";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";
  import { Check, House, Lock } from "@lucide/svelte";

  const s = app.s;
  const now = $derived(app.now);
  const today = $derived(app.today);
  const total = $derived(score(s));
  const sorted = $derived(app.sorted);
  const pending = $derived(sorted.filter((r) => ["open", "upcoming"].includes(stOf(r))));
  const finished = $derived(sorted.filter((r) => !["open", "upcoming"].includes(stOf(r))));
  // The dark "Als Nächstes" card: the first open or upcoming routine; the rest are plain rows.
  const next = $derived(pending[0]);
  const longDate = $derived(now.toLocaleDateString("de-DE", { weekday: "long", month: "short", day: "numeric" }));

  const tasksToday = $derived(s.tasks.filter((t) => dueOn(t, today)));
  const tasksOpen = $derived(tasksToday.filter((t) => !isDone(t)));
  const tasksDone = $derived(tasksToday.filter((t) => isDone(t)));
  const doneBy = (t) => s.chores[choreKey(t.id, today)];
  const toggleChore = (t) => mutate({ t: "chore", id: t.id, day: today, by: isDone(t) ? null : app.hh.name.trim() || "" });
</script>

<header class="flex flex-col gap-2.5 px-6 pt-13 pb-3">
  <div class="flex items-center justify-between">
    <span class="rounded-full px-2.5 py-1 text-[13px] font-semibold" style="background: {pale('#E3B21C')}">{longDate}</span>
    <SettingsBtn />
  </div>
  <div class="flex items-end justify-between gap-4">
    <h1 class="m-0 text-[34px] leading-tight font-bold tracking-tight">Heute</h1>
    <a
      href="/history"
      aria-label="Punkte, zum Verlauf"
      class="num rounded-full bg-secondary px-3 py-1.5 text-sm font-bold text-foreground no-underline">{total} Pkt.</a
    >
  </div>
  <Segmented
    opts={[
      ["all", "Alle"],
      ["me", "Ich"],
      ["home", "Haushalt"],
    ]}
    get={() => app.filter}
    set={(v) => (app.filter = v)}
    label="Filter"
  />
</header>

<main class="flex flex-1 flex-col gap-6 px-4 pt-2 pb-5">
  {#if app.filter !== "home"}
    <section aria-label="Meine Routinen" class="flex flex-col gap-2">
      <div class="mx-2 flex items-center justify-between">
        <h2 class="m-0 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <Lock size={14} strokeWidth={2} aria-hidden="true" /> Ich
        </h2>
        <span class="text-[13px] text-muted-foreground">nur für dich</span>
      </div>
      {#if next}
        {@const st = stOf(next)}
        {@const w = windowOf(next, today)}
        {@const link = st === "open" ? `/run/${next.id}` : canEdit(s, next, now) ? `/routine/${next.id}` : undefined}
        <a href={link} class="flex flex-col gap-3.5 rounded-2xl bg-primary p-4.5 text-primary-foreground no-underline">
          <span class="flex items-center justify-between">
            <span class="rounded-full px-2.5 py-1 text-[12px] font-bold text-foreground" style="background: {pale('#E3B21C')}"
              >{st === "open" ? "Jetzt offen" : "Als Nächstes"}</span
            >
            <span class="num text-sm font-semibold">{hm(w.open)} – {hm(w.close)}</span>
          </span>
          <span class="flex items-end justify-between gap-3">
            <span class="flex min-w-0 flex-col gap-1">
              <span class="text-[22px] font-bold tracking-tight">{next.name}</span>
              <span class="text-[13px] opacity-75"
                >{st === "open" && stepOf(s, next, now)
                  ? `Schritt ${stepOf(s, next, now) + 1} von ${next.steps.length}`
                  : summary(next.steps)}</span
              >
            </span>
            <span class="flex shrink-0 flex-col items-end">
              <span class="num text-[26px] font-bold tracking-tight"
                >{st === "open" ? mmss(w.close - now) : until(w.open).replace("in ", "")}</span
              >
              <span class="text-[12px] opacity-75">{st === "open" ? "übrig" : "bis offen"}</span>
            </span>
          </span>
        </a>
      {:else if !sorted.length}
        <Empty
          text={"Noch keine Routinen. Leg deine erste an, zum Beispiel deine Morgenroutine."}
          href={"/routine/new"}
          action={"Neue Routine"}
        />
      {/if}
      {#each pending.slice(1) as r (r.id)}
        {@const st = stOf(r)}
        {@const link = st === "open" ? `/run/${r.id}` : canEdit(s, r, now) ? `/routine/${r.id}` : undefined}
        <a href={link} class="flex min-h-13 items-center gap-3 rounded-xl border bg-card py-2 pr-4 pl-1 text-foreground no-underline">
          <span class="flex size-11 shrink-0 items-center justify-center"><Circle {st} /></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-[15px] font-medium">{r.name}</span>
            <span class="num text-[13px] {st === 'open' ? 'font-medium text-brand' : 'text-muted-foreground'}">{meta(r)}</span>
          </span>
        </a>
      {/each}
      {#each finished as r (r.id)}
        {@const st = stOf(r)}
        {@const e = entry(s, r.id, today)}
        <div class="flex min-h-13 items-center gap-3 rounded-xl border bg-card pr-4 pl-1">
          <span class="flex size-11 shrink-0 items-center justify-center"><Circle {st} /></span>
          <span class="flex-1 text-[15px] text-muted-foreground {st === 'done' ? 'line-through' : ''}">{r.name}</span>
          <span
            class="num rounded-full px-2 py-0.5 text-[13px] font-semibold {e?.points < 0
              ? 'bg-destructive/12 text-destructive'
              : 'text-good'}"
            style={e?.points < 0 ? "" : `background: ${pale("#3FA066")}`}
            >{st === "done" ? `${hm(new Date(e.at))} · ${signed(e.points)}` : `${ST[st]} · ${signed(e?.points ?? 0)}`}</span
          >
        </div>
      {/each}
    </section>
  {/if}

  {#if app.filter !== "me"}
    <section aria-label="Haushalt heute" class="flex flex-col gap-2">
      <div class="mx-2 flex items-center justify-between">
        <h2 class="m-0 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <House size={14} strokeWidth={2} aria-hidden="true" /> Haushalt
        </h2>
        {#if tasksToday.length}
          <span class="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Progress
              value={tasksDone.length}
              max={tasksToday.length}
              class="h-1 w-12 bg-border *:data-[slot=progress-indicator]:bg-brand"
            />
            <span class="num">{tasksDone.length} von {tasksToday.length}</span>
          </span>
        {/if}
      </div>
      {#if tasksToday.length}
        <Card.Root class={listCard}>
          {#each [...tasksOpen, ...tasksDone] as t (t.id)}
            {@const a = areaOf(t.area)}
            {@const d = isDone(t)}
            <div class="flex gap-3 border-b border-divider pr-4 pl-1.5 last:border-b-0 {d ? 'items-center' : 'items-start py-2'}">
              <button
                class="flex size-11 shrink-0 items-center justify-center bg-transparent"
                aria-label="{d ? 'Als offen markieren' : 'Erledigt'}: {t.title}"
                aria-pressed={d}
                onclick={() => toggleChore(t)}
              >
                {#if d}<span class="flex size-5.5 items-center justify-center rounded-full text-white" style="background: {a.color}"
                    ><Check size={13} strokeWidth={3} aria-hidden="true" /></span
                  >
                {:else}<span class="size-5.5 rounded-full border-2" style="border-color: {a.color}; background: {pale(a.color)}"
                  ></span>{/if}
              </button>
              {#if d}
                <span class="flex-1 text-[15px] text-muted-foreground line-through">{t.title}</span>
                {#if typeof doneBy(t) === "string" && doneBy(t)}<span class="text-[12px] text-muted-foreground">{doneBy(t)}</span>{/if}
              {:else}
                <span class="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
                  <span class="text-base font-medium">{t.title}</span>
                  <span class="flex items-center gap-1.5 text-[13px] text-muted-foreground"
                    ><span class="size-2 shrink-0 rounded-full" style="background: {a.color}"></span>{a.name} · {rhythm(t)}</span
                  >
                  {#if t.note}<span class="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t.note}</span>{/if}
                </span>
              {/if}
            </div>
          {/each}
        </Card.Root>
      {:else}
        <Empty
          text={s.tasks.length
            ? "Heute steht im Haushalt nichts an."
            : "Noch keine Haushaltsaufgaben. Leg die erste an, zum Beispiel Pflanzen gießen."}
          href={"/task/new"}
          action={"Neue Aufgabe"}
        />
      {/if}
    </section>
  {/if}
</main>
