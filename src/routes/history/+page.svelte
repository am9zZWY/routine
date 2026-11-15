<script>
  // Verlauf: 14-day points chart, then the last 7 days per routine with a running total.
  import { entry, score, dayKey, addDays } from "../../logic.js";
  import { app, fmtOffset, signed, ST, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import SettingsBtn from "#lib/components/app/SettingsBtn.svelte";

  const s = app.s;
  const total = $derived(score(s));
  const pointsOn = (day) => s.log.reduce((a, e) => a + (e.day === day ? e.points : 0), 0);
  const totalUpTo = (day) => score(s, day);
  const days14 = $derived(Array.from({ length: 14 }, (_, i) => dayKey(addDays(app.now, i - 13))));
  const bars = $derived(days14.map(pointsOn));
  // Positive bars above the baseline, negative below; 44 units of height shared by both.
  const up = $derived(Math.max(1, ...bars)),
    dn = $derived(Math.max(0, ...bars.map((v) => -v)));
  const base = $derived(4 + (44 * up) / (up + dn));
  const week = $derived(bars.slice(7).reduce((a, v) => a + v, 0));
  const days7 = $derived(days14.slice(7).reverse());
  const names = $derived(Object.fromEntries([...s.log.map((e) => [e.routineId, e.name]), ...s.routines.map((r) => [r.id, r.name])]));
  const idsOn = (day) => [...new Set([...s.routines.map((r) => r.id), ...s.log.filter((e) => e.day === day).map((e) => e.routineId)])];
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
      {#each bars as v, i}
        {@const h = Math.max((Math.abs(v) / (up + dn)) * 44, 6)}
        {#if v || i === 13}
          <rect
            x={i * 10 + 1.5}
            y={v >= 0 ? base - h : base}
            width="7"
            height={h}
            rx="2"
            class={i === 13 && v === 0 ? "fill-border" : v < 0 ? "fill-destructive" : "fill-brand"}
          />
        {/if}
        <text
          x={i * 10 + 5}
          y="62"
          text-anchor="middle"
          class="text-[6px] {i === 13 ? 'fill-foreground font-bold' : 'fill-muted-foreground'}">{wd(days14[i])}</text
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
          {@const e = entry(s, id, day)}
          <div class="{row} min-h-12 justify-between text-[15px]">
            <span class="font-medium">{names[id]}</span>
            {#if e}
              <span class="num flex items-center gap-2 text-[13px] text-muted-foreground">
                <Badge variant={e.status === "done" ? "secondary" : "destructive"}>{ST[e.status] ?? e.status}</Badge>
                {fmtOffset(e.offset)}
                <b class="font-semibold {e.points < 0 ? 'text-destructive' : 'text-foreground'}">{signed(e.points)}</b>
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
