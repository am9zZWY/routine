<script>
  // Household task editor (/task/new or /task/<id>): explicit Abbrechen / Sichern, no autosave.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { dayKey, addDays, uid, dueOn, nextDue, GENERAL } from "../../../logic.js";
  import { app, mutate, areaOf, pale, DAYS, DAY_ADV, ic, sectionLabel, field } from "#lib/app.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import { Minus, Plus } from "@lucide/svelte";

  const appState = app.state;
  const today = $derived(app.today);
  const tdraft = $derived(app.tdraft);

  // Open the task in the URL, unless the draft for it is still here from a trip to Bereiche.
  $effect(() => {
    const id = page.params.id;
    untrack(() => {
      const draft = app.tdraft;
      if (draft && (id === "new" ? !draft.id : draft.id === id)) return;
      const task = appState.tasks.find((other) => other.id === id);
      if (id !== "new" && !task) return goto("/lists", { replace: true });
      app.tdraft = task
        ? $state.snapshot(task)
        : { title: "", area: GENERAL, mode: "week", days: [(new Date().getDay() + 6) % 7], every: 2, note: "" };
    });
  });

  function saveTask() {
    if (!tdraft.title.trim()) return alert("Gib der Aufgabe einen Namen.");
    if (tdraft.mode !== "day" && !tdraft.days.length) return alert("Wähl mindestens einen Wochentag.");
    const task = { ...$state.snapshot(tdraft), title: tdraft.title.trim() };
    task.anchor ??= today;
    mutate({ t: "task", task: { ...task, id: task.id ?? uid() } });
    app.listTab = "home";
    goto("/lists");
  }
  function removeTask() {
    if (!confirm(`„${tdraft.title}“ löschen?`)) return;
    mutate({ t: "deltask", id: tdraft.id });
    app.listTab = "home";
    goto("/lists");
  }
  // Interval weeks count from the day the rhythm was last changed (preview and save use the same anchor).
  const reanchor = () => (tdraft.anchor = today);
  function setMode(mode) {
    tdraft.mode = mode;
    reanchor();
    if (mode !== "week") tdraft.days = tdraft.days.slice(0, 1).length ? tdraft.days.slice(0, 1) : [5];
  }
  function pickDay(weekday) {
    reanchor();
    if (tdraft.mode !== "week") return (tdraft.days = [weekday]); // interval/month run on one weekday
    tdraft.days = tdraft.days.includes(weekday) ? tdraft.days.filter((selected) => selected !== weekday) : [...tdraft.days, weekday];
  }
  const fmtDay = (day) => {
    const str = new Date(day + "T12:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
    return day === dayKey(addDays(app.now, 1)) ? `Morgen, ${str}` : str;
  };
</script>

{#if tdraft}
  <header class="flex items-center justify-between px-2 pt-12 pb-2">
    <Button variant="ghost" href="/lists" class="h-11 px-4 text-base font-normal text-muted-foreground">Abbrechen</Button>
    <span class="flex flex-col items-center"
      ><span class="text-base font-semibold">Haushaltsaufgabe</span><span class="text-[12px] text-muted-foreground">für den Haushalt</span
      ></span
    >
    <Button variant="ghost" class="h-11 px-4 text-base font-semibold text-brand hover:text-brand" onclick={saveTask}>Sichern</Button>
  </header>
  <main class="flex flex-1 flex-col gap-6 px-4 pt-2 pb-6">
    <div class="flex flex-col gap-2">
      <Label for="tname" class={sectionLabel}>Name</Label>
      <Input id="tname" bind:value={tdraft.title} placeholder="Bad putzen" class={field} />
    </div>
    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
      <legend class="{sectionLabel} mb-2 p-0">Bereich</legend>
      <div class="flex flex-wrap gap-2">
        {#each appState.areas as area (area.name)}
          {@const on = areaOf(tdraft.area).name === area.name}
          <button
            aria-pressed={on}
            onclick={() => (tdraft.area = area.name)}
            class="flex min-h-11 items-center gap-2 rounded-full pr-4 pl-3 text-[15px] {on
              ? 'border-2 font-semibold'
              : 'border bg-card font-medium'}"
            style={on ? `border-color: ${area.color}; background: ${pale(area.color)}` : ""}
            ><span class="size-2.5 rounded-full" style="background: {area.color}"></span>{area.name}</button
          >
        {/each}
        <a
          href="/areas"
          class="flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/60 pr-4 pl-3 text-[15px] font-medium text-foreground no-underline"
          ><Plus size={16} strokeWidth={2} aria-hidden="true" /> Bereich</a
        >
      </div>
    </fieldset>
    <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
      <legend class="{sectionLabel} mb-2 p-0">Wiederholung</legend>
      <Segmented
        opts={[
          ["day", "Täglich"],
          ["week", "Wochentage"],
          ["interval", "Intervall"],
          ["month", "Monatlich"],
        ]}
        get={() => tdraft.mode}
        set={setMode}
        label="Wiederholung"
      />
      {#if tdraft.mode !== "day"}
        <div class="grid grid-cols-7 gap-1.5">
          {#each DAYS as [short, full], weekday}
            {@const on = tdraft.days.includes(weekday)}
            <button
              aria-pressed={on}
              aria-label={full}
              onclick={() => pickDay(weekday)}
              class="h-11 rounded-full border text-sm font-semibold {on ? 'border-brand bg-brand text-brand-foreground' : 'bg-card'}"
              >{short}</button
            >
          {/each}
        </div>
      {/if}
      {#if tdraft.mode === "interval"}
        <div class="flex min-h-13 items-center justify-between rounded-xl border bg-card pr-2 pl-4">
          <span class="text-base">Alle {tdraft.every} Wochen, {DAY_ADV[tdraft.days[0] ?? 5]}</span>
          <span class="flex">
            <Button
              variant="ghost"
              size="icon"
              class="size-11"
              aria-label="Weniger"
              onclick={() => (reanchor(), (tdraft.every = Math.max(2, tdraft.every - 1)))}><Minus {...ic} /></Button
            >
            <Button
              variant="ghost"
              size="icon"
              class="size-11"
              aria-label="Mehr"
              onclick={() => (reanchor(), (tdraft.every = Math.min(12, tdraft.every + 1)))}><Plus {...ic} /></Button
            >
          </span>
        </div>
      {:else if tdraft.mode === "month"}
        <div class="flex min-h-13 items-center rounded-xl border bg-card px-4 text-base">
          Jeden ersten {DAYS[tdraft.days[0] ?? 5][1]} im Monat
        </div>
      {/if}
      {#if tdraft.mode === "day" || tdraft.days.length}
        {@const nd = nextDue({ ...$state.snapshot(tdraft), anchor: tdraft.anchor ?? today }, today)}
        <span class="mx-2 text-[13px] text-muted-foreground"
          >{dueOn({ ...tdraft, anchor: tdraft.anchor ?? today }, today) ? "Heute fällig, nächstes Mal" : "Nächstes Mal"}: {nd
            ? fmtDay(nd)
            : "—"}</span
        >
      {/if}
    </fieldset>
    <div class="flex flex-col gap-2">
      <Label for="tnote" class={sectionLabel}>Notiz</Label>
      <textarea
        id="tnote"
        rows="4"
        bind:value={tdraft.note}
        placeholder="Was man wissen muss: Mittel, Reihenfolge, Vorsicht"
        class="resize-none rounded-xl border bg-card px-4 py-3.5 text-[15px] leading-normal outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      ></textarea>
    </div>
    {#if tdraft.id}
      <Button
        variant="ghost"
        class="h-12 text-base font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
        onclick={removeTask}>Aufgabe löschen</Button
      >
    {/if}
  </main>
{/if}
