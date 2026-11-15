<script>
  // Bereiche: add and remove household areas. "Allgemein" is fixed; tasks of a removed area move there.
  import { AREA_COLORS, GENERAL } from "../../logic.js";
  import { app, mutate, areaOf, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { ChevronLeft, Plus, X } from "@lucide/svelte";

  const s = app.s;
  // Coming from the task editor: go back to it, with its unsaved draft.
  const backTo = $derived(app.tdraft ? (app.tdraft.id ? `/task/${app.tdraft.id}` : "/task/new") : "/lists");
  const SUGGEST = ["Flur", "Keller", "Garten", "Arbeitszimmer", "Kinderzimmer", "Auto", "Haustiere"];
  let areaName = $state(""),
    areaColor = $state("#D9467A");
  const countOf = (name) => s.tasks.filter((t) => areaOf(t.area).name === name).length;
  function addArea(name, color) {
    name = name.trim();
    if (!name || s.areas.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    mutate({ t: "area", area: { name, color } });
    areaName = "";
  }
  function removeArea(a) {
    if (app.tdraft?.area === a.name) app.tdraft.area = GENERAL;
    mutate({ t: "delarea", name: a.name });
  }
</script>

<header class="flex items-center justify-between px-2 pt-12 pb-2">
  <Button variant="ghost" size="icon" href={backTo} aria-label="Zurück" class="size-11"
    ><ChevronLeft size={22} strokeWidth={2} aria-hidden="true" /></Button
  >
  <span class="text-base font-semibold">Bereiche</span>
  <Button variant="ghost" href={backTo} class="h-11 px-4 text-base font-semibold text-brand hover:text-brand">Fertig</Button>
</header>
<main class="flex flex-1 flex-col gap-6.5 px-4 pt-2 pb-6">
  <section class="flex flex-col gap-2">
    <h2 class={sectionLabel}>Eure Bereiche</h2>
    <Card.Root class={listCard}>
      {#each s.areas as a (a.name)}
        {@const n = countOf(a.name)}
        <div class="{row} min-h-14 pr-1.5">
          <span class="size-3.5 shrink-0 rounded-full" style="background: {a.color}"></span>
          <span class="flex flex-1 flex-col gap-0.5">
            <span class="text-base font-medium">{a.name}</span>
            <span class="text-[12px] text-muted-foreground">{n === 0 ? "Keine Aufgaben" : n === 1 ? "1 Aufgabe" : `${n} Aufgaben`}</span>
          </span>
          {#if a.name === GENERAL}<span class="pr-3 text-[12px] text-muted-foreground">Standard</span>
          {:else}<Button
              variant="ghost"
              size="icon"
              class="size-11 text-muted-foreground"
              aria-label="{a.name} entfernen"
              onclick={() => removeArea(a)}><X size={18} strokeWidth={2} aria-hidden="true" /></Button
            >{/if}
        </div>
      {/each}
    </Card.Root>
    <p class="mx-2 my-0 text-[13px] leading-snug text-muted-foreground">
      Aufgaben eines entfernten Bereichs landen in „{GENERAL}“. Nichts geht verloren.
    </p>
  </section>
  <section class="flex flex-col gap-2.5">
    <h2 class={sectionLabel}>Eigenen Bereich anlegen</h2>
    <form class="flex flex-col gap-3 rounded-xl border bg-card p-3.5" onsubmit={(e) => (e.preventDefault(), addArea(areaName, areaColor))}>
      <Input
        bind:value={areaName}
        aria-label="Name des Bereichs"
        placeholder="z. B. Keller, Garage, Arbeitszimmer"
        class="h-12 rounded-lg bg-background px-3.5 text-base shadow-none"
      />
      <div role="group" aria-label="Farbe" class="flex flex-wrap gap-1.5">
        {#each AREA_COLORS as [c, name]}
          <button
            type="button"
            aria-label="Farbe {name}"
            aria-pressed={areaColor === c}
            onclick={() => (areaColor = c)}
            class="flex size-11 items-center justify-center rounded-full border-2 bg-transparent {areaColor === c
              ? 'border-foreground'
              : 'border-transparent'}"><span class="size-6 rounded-full" style="background: {c}"></span></button
          >
        {/each}
      </div>
      <Button type="submit" class="h-11.5 rounded-lg text-[15px]">Hinzufügen</Button>
    </form>
  </section>
  {#if SUGGEST.some((n) => !s.areas.some((a) => a.name === n))}
    <section class="flex flex-col gap-2.5">
      <h2 class={sectionLabel}>Vorschläge</h2>
      <div class="flex flex-wrap gap-2">
        {#each SUGGEST.filter((n) => !s.areas.some((a) => a.name === n)) as n}
          <button
            aria-label="{n} hinzufügen"
            onclick={() => addArea(n, AREA_COLORS[s.areas.length % AREA_COLORS.length][0])}
            class="flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/60 bg-transparent pr-3.5 pl-2.5 text-sm font-medium"
            ><Plus size={14} strokeWidth={2} aria-hidden="true" />{n}</button
          >
        {/each}
      </div>
    </section>
  {/if}
</main>
