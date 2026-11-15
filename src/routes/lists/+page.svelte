<script>
  // Listen: my routines, or household tasks grouped by area.
  import { canEdit, cfg } from "../../logic.js";
  import { app, areaOf, rhythm, summary, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import Empty from "#lib/components/app/Empty.svelte";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";
  import { Camera, ChartColumn, ChevronRight, Grid2x2, Lock, NotebookText } from "@lucide/svelte";

  const s = app.s;
  const now = $derived(app.now);
  const today = $derived(app.today);
  const sorted = $derived(app.sorted);
  const areaGroups = $derived(
    s.areas.map((a) => ({ ...a, items: s.tasks.filter((t) => areaOf(t.area).name === a.name) })).filter((g) => g.items.length),
  );
</script>

<header class="flex flex-col gap-3.5 px-6 pt-14 pb-3">
  <div class="flex items-center justify-between">
    <h1 class="m-0 text-[34px] leading-tight font-bold tracking-tight">Listen</h1>
    <SettingsBtn />
  </div>
  <Segmented
    opts={[
      ["me", "Ich"],
      ["home", "Haushalt"],
    ]}
    get={() => app.listTab}
    set={(v) => (app.listTab = v)}
    label="Liste wählen"
  />
</header>
<main class="flex flex-1 flex-col gap-5 px-4 pt-1 pb-4">
  {#if app.listTab === "me"}
    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Routinen · nur für dich</h2>
      {#if sorted.length}
        <Card.Root class={listCard}>
          {#each sorted as r (r.id)}
            {@const ok = canEdit(s, r, now)}
            {@const c = cfg(r, today)}
            <a
              href={ok ? `/routine/${r.id}` : undefined}
              aria-disabled={!ok}
              class="{row} min-h-16 gap-3.5 pr-3 text-foreground no-underline"
            >
              <span class="num w-14 text-[15px] font-bold">{c.time}</span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-base font-medium">{r.name}</span>
                <span class="text-[13px] text-muted-foreground"
                  >{r.pending
                    ? `Ab morgen ${r.pending.time} ±${r.pending.tolerance}`
                    : `Täglich · ±${c.tolerance} Min. · ${summary(r.steps)}`}</span
                >
              </span>
              {#if r.steps.some((x) => x.type === "photo")}<Camera
                  size={16}
                  strokeWidth={1.75}
                  class="text-muted-foreground"
                  role="img"
                  aria-label="Mit Fotobeweis"
                />{/if}
              {#if ok}<ChevronRight size={16} strokeWidth={2} class="text-muted-foreground/70" aria-hidden="true" />
              {:else}<Lock
                  size={16}
                  strokeWidth={2}
                  class="text-muted-foreground"
                  role="img"
                  aria-label="Gesperrt, solange das Fenster offen ist oder nach einem Verpassen"
                />{/if}
            </a>
          {/each}
        </Card.Root>
      {:else}
        <Empty
          text={"Noch keine Routinen. Leg deine erste an, zum Beispiel deine Morgenroutine."}
          href={"/routine/new"}
          action={"Neue Routine"}
        />
      {/if}
    </section>
    <a href="/history" class="flex min-h-11 items-center gap-2 self-center text-sm font-semibold text-foreground no-underline"
      ><ChartColumn size={16} strokeWidth={2} aria-hidden="true" /> Verlauf und Punkte</a
    >
  {:else}
    {#each areaGroups as g (g.name)}
      <section class="flex flex-col gap-2">
        <h2 class="{sectionLabel} flex items-center gap-2">
          <span class="size-2.5 rounded-full" style="background: {g.color}"></span>{g.name}
        </h2>
        <Card.Root class={listCard}>
          {#each g.items as t (t.id)}
            <a href="/task/{t.id}" class="{row} pr-3 text-foreground no-underline">
              <span class="flex-1 text-base font-medium">{t.title}</span>
              {#if t.note}<NotebookText size={16} strokeWidth={1.75} class="text-muted-foreground" role="img" aria-label="Hat Notiz" />{/if}
              <span class="text-[13px] whitespace-nowrap text-muted-foreground">{rhythm(t)}</span>
              <ChevronRight size={16} strokeWidth={2} class="text-muted-foreground/70" aria-hidden="true" />
            </a>
          {/each}
        </Card.Root>
      </section>
    {:else}
      <Empty
        text={"Noch keine Haushaltsaufgaben. Leg die erste an, zum Beispiel Pflanzen gießen."}
        href={"/task/new"}
        action={"Neue Aufgabe"}
      />
    {/each}
    <a href="/areas" class="flex min-h-11 items-center gap-2 self-center text-sm font-semibold text-foreground no-underline"
      ><Grid2x2 size={16} strokeWidth={2} aria-hidden="true" /> Bereiche verwalten</a
    >
  {/if}
</main>
