<script>
  // Listen: my routines, or household tasks grouped by area.
  import { canEdit, cfg } from "../../logic.js";
  import { app, areaOf, rhythm, summary, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import Empty from "#lib/components/app/Empty.svelte";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";
  import { Camera, ChartColumn, ChevronRight, Grid2x2, Lock, NotebookText } from "@lucide/svelte";

  const appState = app.state;
  const now = $derived(app.now);
  const today = $derived(app.today);
  const sorted = $derived(app.sorted);
  const areaGroups = $derived(
    appState.areas
      .map((area) => ({ ...area, items: appState.tasks.filter((task) => areaOf(task.area).name === area.name) }))
      .filter((group) => group.items.length),
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
    set={(value) => (app.listTab = value)}
    label="Liste wählen"
  />
</header>
<main class="flex flex-1 flex-col gap-5 px-4 pt-1 pb-4">
  {#if app.listTab === "me"}
    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Routinen · nur für dich</h2>
      {#if sorted.length}
        <Card.Root class={listCard}>
          {#each sorted as routine (routine.id)}
            {@const ok = canEdit(appState, routine, now)}
            {@const config = cfg(routine, today)}
            <a
              href={ok ? `/routine/${routine.id}` : undefined}
              aria-disabled={!ok}
              class="{row} min-h-16 gap-3.5 pr-3 text-foreground no-underline"
            >
              <span class="num w-14 text-[15px] font-bold">{config.time}</span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-base font-medium">{routine.name}</span>
                <span class="text-[13px] text-muted-foreground"
                  >{routine.pending
                    ? `Ab morgen ${routine.pending.time} ±${routine.pending.tolerance}`
                    : `Täglich · ±${config.tolerance} Min. · ${summary(routine.steps)}`}</span
                >
              </span>
              {#if routine.steps.some((step) => step.type === "photo")}<Camera
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
    {#each areaGroups as group (group.name)}
      <section class="flex flex-col gap-2">
        <h2 class="{sectionLabel} flex items-center gap-2">
          <span class="size-2.5 rounded-full" style="background: {group.color}"></span>{group.name}
        </h2>
        <Card.Root class={listCard}>
          {#each group.items as task (task.id)}
            <a href="/task/{task.id}" class="{row} pr-3 text-foreground no-underline">
              <span class="flex-1 text-base font-medium">{task.title}</span>
              {#if task.note}<NotebookText
                  size={16}
                  strokeWidth={1.75}
                  class="text-muted-foreground"
                  role="img"
                  aria-label="Hat Notiz"
                />{/if}
              <span class="text-[13px] whitespace-nowrap text-muted-foreground">{rhythm(task)}</span>
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
