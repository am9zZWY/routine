<script>
  // Verlauf: 14-day points chart, then the last 7 days per routine with a running total.
  import { entry, score, dayKey, addDays } from "../../logic.js";
  import { app, fmtOffset, signed, ST, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";

  const appState = app.state;
  const total = $derived(score(appState));
  const pointsOn = (day) => appState.log.reduce((sum, logEntry) => sum + (logEntry.day === day ? logEntry.points : 0), 0);
  const totalUpTo = (day) => score(appState, day);
  const days14 = $derived(Array.from({ length: 14 }, (_unused, index) => dayKey(addDays(app.now, index - 13))));
  const bars = $derived(days14.map(pointsOn));
  // Positive bars above the baseline, negative below; 44 units of height shared by both.
  const up = $derived(Math.max(1, ...bars)),
    dn = $derived(Math.max(0, ...bars.map((value) => -value)));
  const base = $derived(4 + (44 * up) / (up + dn));
  const week = $derived(bars.slice(7).reduce((sum, value) => sum + value, 0));
  const days7 = $derived(days14.slice(7).reverse());
  const names = $derived(
    Object.fromEntries([
      ...appState.log.map((logEntry) => [logEntry.routineId, logEntry.name]),
      ...appState.routines.map((routine) => [routine.id, routine.name]),
    ]),
  );
  const idsOn = (day) => [
    ...new Set([
      ...appState.routines.map((routine) => routine.id),
      ...appState.log.filter((logEntry) => logEntry.day === day).map((logEntry) => logEntry.routineId),
    ]),
  ];
  const label = (day) => new Date(day + "T12:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
  const wd = (day) => new Date(day + "T12:00").toLocaleDateString("de-DE", { weekday: "narrow" });
</script>

<header class="flex flex-col gap-1.5 px-6 pt-14 pb-4">
  <div class="flex items-center justify-between">
    <span class="text-[13px] font-medium text-muted-foreground">Gesamt {total} Pkt.</span>
    <SettingsBtn />
  </div>
  <h1 class="m-0 text-[34px] leading-tight font-bold tracking-tight">Verlauf</h1>
</header>
<main class="flex flex-1 flex-col gap-5 px-4 pb-4">
  <Card.Root class="{listCard} gap-2 p-4">
    <div class="flex items-baseline justify-between text-[13px]">
      <span class="font-semibold">Letzte 14 Tage</span>
      <span class="text-muted-foreground">diese Woche <b class="num {week >= 0 ? 'text-good' : 'text-destructive'}">{signed(week)}</b></span
      >
    </div>
    <svg viewBox="0 0 140 64" class="w-full" aria-hidden="true">
      {#each bars as value, index}
        {@const barHeight = Math.max((Math.abs(value) / (up + dn)) * 44, 6)}
        {#if value || index === 13}
          <rect
            x={index * 10 + 1.5}
            y={value >= 0 ? base - barHeight : base}
            width="7"
            height={barHeight}
            rx="2"
            class={index === 13 && value === 0 ? "fill-border" : value < 0 ? "fill-destructive" : "fill-brand"}
          />
        {/if}
        <text
          x={index * 10 + 5}
          y="62"
          text-anchor="middle"
          class="text-[6px] {index === 13 ? 'fill-foreground font-bold' : 'fill-muted-foreground'}">{wd(days14[index])}</text
        >
      {/each}
      <line x1="0" x2="140" y1={base} y2={base} class="stroke-border" stroke-width="0.5" />
    </svg>
  </Card.Root>

  {#each days7 as day}
    <section class="flex flex-col gap-2">
      <h2 class="{sectionLabel} flex justify-between">
        <span>{label(day)}</span>
        <span class="num font-medium">{signed(pointsOn(day))} · gesamt {totalUpTo(day)}</span>
      </h2>
      <Card.Root class={listCard}>
        {#each idsOn(day) as id}
          {@const logEntry = entry(appState, id, day)}
          <div class="{row} min-h-12 justify-between text-[15px]">
            <span class="font-medium">{names[id]}</span>
            {#if logEntry}
              <span class="num flex items-center gap-2 text-[13px] text-muted-foreground">
                <Badge variant={["done", "late"].includes(logEntry.status) ? "secondary" : "destructive"}
                  >{ST[logEntry.status] ?? logEntry.status}</Badge
                >
                {fmtOffset(logEntry.offset)}
                <b class="font-semibold {logEntry.points < 0 ? 'text-destructive' : 'text-foreground'}">{signed(logEntry.points)}</b>
              </span>
            {:else}<span class="text-muted-foreground">—</span>{/if}
          </div>
        {:else}
          <p class="m-0 p-4 text-[13px] text-muted-foreground">Keine Routinen</p>
        {/each}
      </Card.Root>
    </section>
  {/each}
</main>
