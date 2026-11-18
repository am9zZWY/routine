<script>
  // Routine editor (/routine/new or /routine/<id>): autosave + undo, steps sheet, AI suggestions, share by QR.
  import { untrack } from "svelte";
  import { goto, beforeNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { saveRoutine, canEdit, schedule, hm, uid, shareCode, AREA_COLORS, ICONS } from "../../../logic.js";
  import { thumb } from "../../../photo.js";
  import { loadAi, saveAi, suggest } from "../../../ai.js";
  import qrcode from "qrcode-generator";
  import { app, pick, ic, sectionLabel, listCard, row, field, deleteRoutine } from "#lib/app.svelte.js";
  import RoutineIcon from "#lib/components/app/RoutineIcon.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import Back from "#lib/components/app/Back.svelte";
  import { Camera, Check, Clock, Copy, GripVertical, Minus, Plus, Redo2, Settings, Share, Share2, Sparkles, Undo2 } from "@lucide/svelte";

  const appState = app.state;
  const today = $derived(app.today);
  let draft = $state(null);
  let sheet = $state(null); // step id (step sheet) | "ai" | null
  let insertAt = $state(null); // index new steps go in at; null = end
  let newText = $state("");

  // Open the routine in the URL (or a fresh one, or one from a share link). Locked or unknown ones go back to Heute.
  $effect(() => {
    const id = page.params.id;
    untrack(() => {
      if (draft && (draft.id === id || (id === "new" && !draft.id))) return;
      if (id === "new") {
        const imported = app.importDraft;
        app.importDraft = null;
        return edit(imported);
      }
      const routine = appState.routines.find((other) => other.id === id);
      if (routine && canEdit(appState, routine, new Date())) edit(routine);
      else goto("/", { replace: true });
    });
  });
  // The add-step bar sits above the tab bar (rendered by the layout).
  $effect(() => {
    app.footer = addBar;
    return () => (app.footer = null);
  });
  beforeNavigate(({ to, type, cancel }) => {
    if (type === "leave" || !draft || to?.url.pathname === page.url.pathname) return;
    if (!leaveOk()) cancel();
  });

  function edit(routine) {
    const snap = routine
      ? $state.snapshot(routine)
      : { name: "", time: "07:00", tolerance: 5, steps: [], autoStart: false, color: AREA_COLORS[1][0], icon: "sun" };
    past = [];
    future = [];
    saveMsg = "";
    draft = {
      ...snap,
      autoStart: !!snap.autoStart,
      color: snap.color ?? AREA_COLORS[1][0],
      icon: snap.icon ?? "sun",
      time: snap.pending?.time ?? snap.time,
      tolerance: snap.pending?.tolerance ?? snap.tolerance,
    };
    // Baseline is the draft (with filled-in defaults), so opening alone never counts as an edit:
    // re-saving an existing routine would reset its pending time change and progress.
    lastSnap = keyOf(draft);
    lastSaved = snap.id ? lastSnap : "";
    sheet = insertAt = null;
    newText = aiGoal = aiErr = "";
    aiList = [];
    aiAdded = {};
  }

  // Autosave + undo/redo. Snapshots leave out `id`, so undo never loses the id of a routine that got saved.
  let lastSnap = "",
    lastSaved = "";
  let past = $state([]),
    future = $state([]),
    saveMsg = $state("");
  const keyOf = (current) => {
    const { id, ...rest } = $state.snapshot(current);
    return JSON.stringify(rest);
  };
  const SAVED = "Automatisch gespeichert";
  function problem(candidate) {
    if (!candidate.name.trim()) return "gib einen Namen ein";
    if (!candidate.time) return "leg eine Startzeit fest";
    if (!(candidate.tolerance >= 0)) return "das Zeitfenster muss 0 oder mehr sein";
    if (!candidate.steps.length) return "füg mindestens einen Schritt hinzu";
    if (candidate.steps.some((step) => !step.text.trim())) return "jeder Schritt braucht eine Beschreibung";
    if (candidate.steps.every((step) => step.optional)) return "mindestens ein Schritt muss Pflicht sein";
    if (candidate.steps.some((step) => step.type === "photo" && !step.ref)) return "Foto-Schritte brauchen ein Referenzfoto";
    return "";
  }
  $effect(() => {
    if (!draft) return;
    const json = keyOf(draft);
    const timer = setTimeout(() => commit(json), 400);
    return () => clearTimeout(timer);
  });
  function commit(json) {
    if (json !== lastSnap) {
      past.push(lastSnap);
      if (past.length > 50) past.shift();
      future = [];
      lastSnap = json;
    }
    const candidate = { ...JSON.parse(json), id: draft.id };
    const reason = problem(candidate);
    if (reason) return (saveMsg = `Nicht gespeichert: ${reason}`);
    const routine = appState.routines.find((other) => other.id === candidate.id);
    if (routine && !canEdit(appState, routine, new Date()))
      return (saveMsg = "Nicht gespeichert: gesperrt, solange das Fenster offen ist oder nach einem Verpassen");
    if (json !== lastSaved) {
      saveRoutine(appState, candidate, new Date());
      if (!routine) {
        draft.id = appState.routines.at(-1).id;
        goto(`/routine/${draft.id}`, { replace: true, shallow: true, state: {} });
      }
      lastSaved = json;
      saveMsg = SAVED;
    } else if (saveMsg) saveMsg = SAVED; // back to the saved state after a problem; stays empty right after opening
  }
  function restore(json) {
    lastSnap = json;
    draft = { ...JSON.parse(json), id: draft.id };
  }
  function undo() {
    commit(keyOf(draft)); // record any edit still waiting on the debounce
    if (!past.length) return;
    future.push(lastSnap);
    restore(past.pop());
  }
  function redo() {
    if (!future.length) return;
    past.push(lastSnap);
    restore(future.pop());
  }
  // Leaving the editor: flush the pending save, confirm if it can't be saved.
  function leaveOk() {
    const json = keyOf(draft);
    commit(json);
    return !draft.id || json === lastSaved || confirm("Ungespeicherte Änderungen verwerfen?");
  }
  // Step times are guidance only; they never affect points.
  const draftSched = $derived(draft ? schedule(draft, today) : []);
  // New steps go in at the chosen gap (blue marker), or at the end.
  function insertSteps(list) {
    const at = insertAt ?? draft.steps.length;
    draft.steps.splice(
      at,
      0,
      ...list.map((item) => ({ id: uid(), text: item.text, type: "tap", ref: null, optional: !!item.optional, min: item.min ?? 2 })),
    );
    if (insertAt != null) insertAt = at + list.length;
  }
  function addStep(event) {
    event.preventDefault();
    if (!newText.trim()) return;
    insertSteps([{ text: newText.trim() }]);
    newText = "";
  }
  // Drag to reorder: the grip captures the pointer; crossing a neighbour's midpoint swaps the two steps.
  let drag = $state(null),
    listEl = $state();
  function grab(event, index) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { index };
  }
  function swap(from, to) {
    const st = draft.steps;
    if (to < 0 || to >= st.length) return false;
    [st[from], st[to]] = [st[to], st[from]];
    return true;
  }
  function dragMove(event) {
    if (!drag) return;
    const rows = listEl.querySelectorAll(".srow"),
      index = drag.index;
    const mid = (rowIndex) => {
      const box = rows[rowIndex].getBoundingClientRect();
      return box.top + box.height / 2;
    };
    if (index > 0 && event.clientY < mid(index - 1)) swap(index, index - 1) && (drag.index = index - 1);
    else if (index < rows.length - 1 && event.clientY > mid(index + 1)) swap(index, index + 1) && (drag.index = index + 1);
  }
  const gripKey = (event, index) => {
    const delta = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (delta && swap(index, index + delta)) event.preventDefault();
  };
  const sheetStep = $derived(draft ? draft.steps.findIndex((step) => step.id === sheet) : -1);

  // AI suggestions from an OpenAI-compatible endpoint (see ai.js). aiAdded marks suggestion indexes already inserted.
  let aiGoal = $state(""),
    aiList = $state([]),
    aiAdded = $state({}),
    aiBusy = $state(false),
    aiErr = $state(""),
    aiCfg = $state(loadAi()),
    aiSettings = $state(false);
  function openAi() {
    sheet = "ai";
    aiErr = "";
    if (!aiCfg.apiKey && !aiCfg.baseUrl) aiSettings = true;
  }
  async function askAi(event) {
    event.preventDefault();
    if (aiBusy) return;
    aiBusy = true;
    aiErr = "";
    try {
      aiList = await suggest(aiGoal, $state.snapshot(draft.steps), $state.snapshot(aiCfg));
      aiAdded = {};
    } catch (error) {
      aiErr = error.message;
      if (error.status === 401 || /401/.test(error.message)) aiSettings = true;
    }
    aiBusy = false;
  }
  function takeIdeas(idx) {
    idx = idx.filter((index) => !aiAdded[index]);
    for (const index of idx) aiAdded[index] = true;
    if (idx.length) insertSteps(idx.map((index) => aiList[index]));
  }
  const posHint = $derived(insertAt == null || insertAt >= (draft?.steps.length ?? 0) ? "ans Ende" : `an Position ${insertAt + 1}`);
  async function setRef(event, step) {
    const file = event.target.files[0];
    if (file)
      try {
        step.ref = await thumb(file);
      } catch {
        alert("Das Foto konnte nicht gelesen werden.");
      }
  }
  function remove() {
    const routine = appState.routines.find((other) => other.id === draft.id);
    if (!canEdit(appState, routine, new Date())) return alert("Gesperrt: Das Fenster ist offen oder wurde heute verpasst.");
    if (!confirm(`„${routine.name}“ löschen? Bisherige Punkte bleiben.`)) return;
    deleteRoutine(routine);
    draft = null;
    goto("/");
  }

  // Share by link / QR. Imported routines open as an unsaved new draft; photo refs must be re-taken.
  let shareOpen = $state(false),
    shared = $state(null);
  async function openShare(routine) {
    const url = `${location.origin}/#r=${await shareCode($state.snapshot(routine))}`;
    const qr = qrcode(0, "L");
    qr.addData(url);
    qr.make();
    shared = { name: routine.name, url, svg: qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }) };
    shareOpen = true;
  }
  const copyLink = () =>
    navigator.clipboard.writeText(shared.url).then(
      () => (app.banner = "Link kopiert"),
      () => prompt("Kopier diesen Link", shared.url),
    );
  const nativeShare = () => navigator.share({ title: shared.name, url: shared.url }).catch(() => {});
</script>

{#snippet addBar()}
  <form class="flex flex-col gap-1.5 border-t bg-background/95 px-4 py-2 backdrop-blur" onsubmit={addStep}>
    <span class="mx-2 text-[12px] text-muted-foreground">Neue Schritte kommen {posHint}</span>
    <div class="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="size-12 rounded-xl bg-card text-brand"
        onclick={openAi}
        aria-label="Mit KI Schritte vorschlagen"><Sparkles {...ic} /></Button
      >
      <Input
        bind:value={newText}
        aria-label="Neuer Schritt"
        placeholder="Schritt eingeben, Enter"
        enterkeyhint="done"
        class="h-12 flex-1 rounded-xl bg-card px-4 text-base shadow-none dark:bg-card"
      />
      <Button type="submit" size="icon" class="size-12 rounded-xl" aria-label="Schritt hinzufügen"
        ><Plus size={20} strokeWidth={2} aria-hidden="true" /></Button
      >
    </div>
  </form>
{/snippet}

{#if draft}
  {#snippet editTools()}
    <span class="flex">
      <Button variant="ghost" size="icon" class="size-11" disabled={!past.length} onclick={undo} aria-label="Rückgängig" title="Rückgängig"
        ><Undo2 {...ic} /></Button
      >
      <Button
        variant="ghost"
        size="icon"
        class="size-11"
        disabled={!future.length}
        onclick={redo}
        aria-label="Wiederholen"
        title="Wiederholen"><Redo2 {...ic} /></Button
      >
      {#if draft.id}<Button
          variant="ghost"
          size="icon"
          class="size-11"
          onclick={() => openShare(appState.routines.find((other) => other.id === draft.id))}
          aria-label="Routine teilen"
          title="Routine teilen"><Share2 {...ic} /></Button
        >{/if}
    </span>
  {/snippet}
  <Back title={draft.id ? "Routine" : "Neue Routine"} right={editTools} />

  <main class="flex flex-1 flex-col gap-6 px-4 pt-2 pb-28">
    <p
      class="mx-2 -mt-1 mb-0 min-h-5 text-[13px] {saveMsg && saveMsg !== SAVED ? 'font-medium text-destructive' : 'text-muted-foreground'}"
    >
      {saveMsg}
    </p>

    <div class="flex flex-col gap-2">
      <Label for="name" class={sectionLabel}>Name</Label>
      <Input id="name" bind:value={draft.name} placeholder="Morgenroutine" class={field} />
    </div>

    <div class="flex flex-col gap-2">
      <span class={sectionLabel}>Farbe und Symbol</span>
      <Card.Root class="{listCard} gap-3 p-3">
        <div class="flex flex-wrap gap-1" role="group" aria-label="Farbe">
          {#each AREA_COLORS as [color, name] (color)}
            <button
              class="flex size-10 items-center justify-center rounded-full bg-transparent"
              aria-label={name}
              aria-pressed={draft.color === color}
              onclick={() => (draft.color = color)}
            >
              <span
                class="flex size-7 items-center justify-center rounded-full text-white"
                style="background: {color}; {draft.color === color ? `box-shadow: 0 0 0 2px var(--card), 0 0 0 4px ${color}` : ''}"
                >{#if draft.color === color}<Check size={14} strokeWidth={3} aria-hidden="true" />{/if}</span
              >
            </button>
          {/each}
        </div>
        <div class="grid grid-cols-6 gap-1" role="group" aria-label="Symbol">
          {#each ICONS as name (name)}
            <button
              class="flex h-11 items-center justify-center rounded-xl {draft.icon === name
                ? 'text-white'
                : 'bg-transparent text-muted-foreground'}"
              style={draft.icon === name ? `background: ${draft.color}` : ""}
              aria-label="Symbol {name}"
              aria-pressed={draft.icon === name}
              onclick={() => (draft.icon = name)}><RoutineIcon icon={name} /></button
            >
          {/each}
        </div>
      </Card.Root>
    </div>

    <!-- One card with two rows: two cards side by side overflowed on narrow phones (iOS time inputs are wide). -->
    <Card.Root class={listCard}>
      <label class="{row} justify-between">
        <span class="text-base font-medium">Startzeit</span>
        <Input
          id="time"
          type="time"
          bind:value={draft.time}
          onclick={pick}
          class="num h-11 w-auto min-w-0 rounded-lg border-0 bg-secondary px-3 text-[17px] font-medium shadow-none dark:bg-secondary"
        />
      </label>
      <div class="{row} justify-between pr-1">
        <span class="flex flex-col">
          <span class="text-base font-medium">Zeitfenster</span>
          <span class="num text-[13px] text-muted-foreground">±{draft.tolerance} Min. um die Startzeit</span>
        </span>
        <span class="flex">
          <Button
            variant="ghost"
            size="icon"
            class="size-11"
            onclick={() => (draft.tolerance = Math.max(0, draft.tolerance - 1))}
            aria-label="Fenster kleiner"><Minus {...ic} /></Button
          >
          <Button variant="ghost" size="icon" class="size-11" onclick={() => draft.tolerance++} aria-label="Fenster größer"
            ><Plus {...ic} /></Button
          >
        </span>
      </div>
    </Card.Root>
    {#if draft.id && appState.routines.find((other) => other.id === draft.id)?.pending}
      <p class="mx-2 -mt-3 mb-0 text-[13px] text-muted-foreground">Neue Zeit und neues Fenster gelten ab morgen.</p>
    {/if}

    <label class="flex min-h-15 items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <span class="flex flex-1 flex-col gap-0.5">
        <span class="text-base font-medium">Automatisch starten</span>
        <span class="text-[13px] text-muted-foreground">Öffnet die Routine, sobald ihr Fenster aufgeht</span>
      </span>
      <Switch
        bind:checked={draft.autoStart}
        class="data-checked:bg-brand data-unchecked:bg-muted-foreground/30 dark:data-unchecked:bg-muted-foreground/40"
      />
    </label>

    <section class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between">
        <h2 class={sectionLabel}>Schritte</h2>
        <span class="mx-2 text-[13px] text-muted-foreground">Tippen zum Bearbeiten</span>
      </div>
      {#snippet gap(at, text)}
        {@const on = (insertAt ?? draft.steps.length) === at}
        {#if on || at < draft.steps.length}
          <button
            class="flex h-5 w-full items-center gap-2 bg-transparent px-4 text-[11px] font-semibold {on
              ? 'text-brand'
              : 'text-transparent hover:text-muted-foreground focus-visible:text-muted-foreground'}"
            onclick={() => (insertAt = at === draft.steps.length ? null : at)}
            aria-label={text}
            ><i class="h-px flex-1 {on ? 'bg-brand' : 'bg-transparent'}"></i>{on ? "Neue Schritte hier" : "+"}<i
              class="h-px flex-1 {on ? 'bg-brand' : 'bg-transparent'}"
            ></i></button
          >
        {/if}
      {/snippet}
      <Card.Root class="{listCard} py-1">
        <ol class="m-0 list-none p-0" bind:this={listEl}>
          {#each draft.steps as step, index (step.id)}
            <li>
              {@render gap(index, `Neue Schritte vor „${step.text}“ einfügen`)}
              <div class="srow flex items-center {drag?.index === index ? 'bg-muted' : ''}">
                <button
                  class="flex min-h-13 min-w-0 flex-1 items-center gap-3 bg-transparent pl-4 text-left"
                  onclick={() => (sheet = step.id)}
                >
                  <span
                    class="num flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold {step.optional
                      ? 'border border-dashed border-muted-foreground text-muted-foreground'
                      : 'bg-secondary'}">{index + 1}</span
                  >
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-base font-medium">{step.text}</span>
                    <span class="num text-[13px] text-muted-foreground"
                      >{draftSched[index] ? hm(draftSched[index].start) : ""} · {step.min ?? 2} Min.{step.optional
                        ? " · optional"
                        : ""}</span
                    >
                  </span>
                  {#if step.type === "photo" && !step.ref}<Badge variant="destructive">Foto fehlt</Badge>
                  {:else if step.type === "photo"}<Camera
                      size={16}
                      strokeWidth={1.75}
                      class="text-muted-foreground"
                      role="img"
                      aria-label="Fotobeweis"
                    />{/if}
                </button>
                <span
                  class="flex size-11 shrink-0 touch-none items-center justify-center text-muted-foreground"
                  role="button"
                  tabindex="0"
                  aria-label="Schritt {index + 1} verschieben (Pfeiltasten)"
                  onpointerdown={(event) => grab(event, index)}
                  onpointermove={dragMove}
                  onpointerup={() => (drag = null)}
                  onpointercancel={() => (drag = null)}
                  onkeydown={(event) => gripKey(event, index)}><GripVertical size={18} strokeWidth={1.75} aria-hidden="true" /></span
                >
              </div>
            </li>
          {:else}
            <li class="px-4 py-3 text-[15px] text-muted-foreground">Noch keine Schritte</li>
          {/each}
          <li>{@render gap(draft.steps.length, "Neue Schritte ans Ende")}</li>
        </ol>
      </Card.Root>
    </section>

    {#if draft.id}
      <Button
        variant="ghost"
        class="h-12 text-base font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
        onclick={remove}
      >
        Routine löschen
      </Button>
    {/if}
  </main>

  <Drawer.Root bind:open={() => !!sheet, (open) => !open && (sheet = null)} shouldScaleBackground={false}>
    <Drawer.Content class="mx-auto max-w-md bg-background">
      <div class="flex max-h-[75vh] flex-col gap-5 overflow-y-auto px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        {#if sheetStep >= 0}
          {@const step = draft.steps[sheetStep]}
          <Drawer.Title class="sr-only">Schritt bearbeiten</Drawer.Title>
          <div class="flex flex-col gap-2">
            <Label for="step-text" class={sectionLabel}>Schritt {sheetStep + 1}</Label>
            <Input id="step-text" bind:value={step.text} class={field} />
          </div>
          <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
            <legend class="{sectionLabel} mb-2 p-0">Dauer</legend>
            <div class="flex flex-wrap gap-2">
              {#each [1, 2, 5, 10, 15] as minutes}
                {@const on = (step.min ?? 2) === minutes}
                <button
                  aria-pressed={on}
                  onclick={() => (step.min = minutes)}
                  class="min-h-11 rounded-full border px-4 text-[15px] font-medium {on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card'}">{minutes} Min.</button
                >
              {/each}
            </div>
            <div class="flex items-center gap-2">
              <button
                aria-pressed={!!step.at}
                onclick={() => (step.at ? delete step.at : (step.at = hm(draftSched[sheetStep].start)))}
                class="flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium {step.at
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card'}"><Clock size={16} strokeWidth={2} aria-hidden="true" /> Feste Uhrzeit</button
              >
              {#if step.at}<Input
                  type="time"
                  bind:value={step.at}
                  onclick={pick}
                  aria-label="Uhrzeit"
                  class="num h-11 w-32 rounded-full bg-card px-4 text-[15px] shadow-none dark:bg-card"
                />{/if}
            </div>
          </fieldset>
          <fieldset class="m-0 flex flex-col gap-3 border-0 p-0">
            <legend class="{sectionLabel} mb-2 p-0">Wie hakst du ab?</legend>
            <div class="grid grid-cols-2 gap-0.5 rounded-xl bg-muted p-0.5">
              {#each [["tap", "Antippen", Check], ["photo", "Foto", Camera]] as [type, name, Icon]}
                {@const on = (step.type ?? "tap") === type}
                <button
                  aria-pressed={on}
                  onclick={() => (step.type = type)}
                  class="flex min-h-11 items-center justify-center gap-2 rounded-[10px] text-sm {on
                    ? 'bg-card font-semibold shadow-sm'
                    : 'bg-transparent font-medium'}"><Icon size={16} strokeWidth={2} aria-hidden="true" />{name}</button
                >
              {/each}
            </div>
            {#if step.type === "photo"}
              <label class="flex min-h-16 items-center gap-3.5 rounded-xl border bg-card px-4 py-3">
                {#if step.ref}<img class="size-11 rounded-lg border object-cover" src={step.ref} alt="Referenzfoto" />
                {:else}<span class="flex size-11 items-center justify-center rounded-lg border text-brand"><Camera {...ic} /></span>{/if}
                <span class="flex flex-1 flex-col gap-0.5">
                  <span class="text-base font-medium {step.ref ? '' : 'text-brand'}"
                    >{step.ref ? "Referenzfoto gespeichert" : "Referenzfoto aufnehmen"}</span
                  >
                  <span class="text-[13px] text-muted-foreground"
                    >{step.ref ? "Tippen für ein neues Foto" : "Damit wird später jedes Foto verglichen"}</span
                  >
                </span>
                <input type="file" accept="image/*" capture="environment" class="sr-only" onchange={(event) => setRef(event, step)} />
              </label>
            {/if}
          </fieldset>
          <label class="flex min-h-15 items-center gap-3 rounded-xl border bg-card px-4 py-3">
            <span class="flex flex-1 flex-col gap-0.5">
              <span class="text-base font-medium">Optional</span>
              <span class="text-[13px] text-muted-foreground">Überspringen kostet keine Punkte</span>
            </span>
            <Switch
              bind:checked={step.optional}
              class="data-checked:bg-brand data-unchecked:bg-muted-foreground/30 dark:data-unchecked:bg-muted-foreground/40"
            />
          </label>
          <div class="flex gap-2">
            <Button
              variant="destructive"
              class="h-12 flex-1 rounded-xl text-base"
              onclick={() => {
                draft.steps.splice(sheetStep, 1);
                sheet = null;
              }}>Löschen</Button
            >
            <Button class="h-12 flex-2 rounded-xl text-base" onclick={() => (sheet = null)}>Fertig</Button>
          </div>
        {:else if sheet === "ai"}
          <div class="flex items-center gap-3">
            <span class="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand"><Sparkles {...ic} /></span>
            <Drawer.Title class="flex-1 text-lg font-semibold">Was willst du erreichen?</Drawer.Title>
            <Button
              variant={aiSettings ? "default" : "ghost"}
              size="icon"
              class="size-11"
              aria-pressed={aiSettings}
              onclick={() => (aiSettings = !aiSettings)}
              aria-label="KI-Einstellungen"
              title="KI-Einstellungen"><Settings {...ic} /></Button
            >
          </div>
          {#if aiSettings}
            <div class="flex flex-col gap-3 rounded-xl border bg-card p-4">
              {#each [["baseUrl", "API-URL", "https://api.openai.com/v1", "text"], ["apiKey", "API-Schlüssel", "", "password"], ["model", "Modell", "gpt-4o-mini", "text"]] as [key, name, ph, type]}
                <div class="flex flex-col gap-1.5">
                  <Label for="ai-{key}" class="text-[13px] font-semibold text-muted-foreground">{name}</Label>
                  <Input
                    id="ai-{key}"
                    {type}
                    bind:value={aiCfg[key]}
                    onchange={() => saveAi($state.snapshot(aiCfg))}
                    placeholder={ph}
                    autocomplete="off"
                    class="h-11 rounded-lg px-3 text-base shadow-none"
                  />
                </div>
              {/each}
              <small class="text-[13px] text-muted-foreground">Der Schlüssel bleibt auf diesem Gerät.</small>
            </div>
          {/if}
          <form class="flex flex-col gap-2" onsubmit={askAi}>
            <Label for="ai-goal" class={sectionLabel}>Beschreib es in einem Satz</Label>
            <div class="flex gap-2">
              <Input
                id="ai-goal"
                bind:value={aiGoal}
                placeholder="Abends runterkommen, um 22 Uhr im Bett"
                class="h-12 flex-1 rounded-xl bg-card px-4 text-base shadow-none dark:bg-card"
              />
              <Button type="submit" class="h-12 rounded-xl px-4" disabled={aiBusy || !aiGoal.trim()}
                >{aiBusy ? "Denke nach…" : "Vorschlagen"}</Button
              >
            </div>
          </form>
          {#if aiErr}<p class="m-0 text-[13px] font-medium text-destructive">{aiErr}</p>{/if}
          <section class="flex flex-col gap-2">
            <span class={sectionLabel}>{aiList.length ? `Vorschläge, landen ${posHint}` : "Noch keine Vorschläge"}</span>
            {#if aiList.length}
              <Card.Root class={listCard}>
                {#each aiList as idea, index}
                  {@const got = aiAdded[index]}
                  <div class="{row} pr-2">
                    <span class="flex flex-1 flex-col {got ? 'opacity-50' : ''}">
                      <span class="text-base font-medium">{idea.text}</span>
                      <span class="text-[13px] text-muted-foreground">{idea.min ?? 2} Min.{idea.optional ? " · optional" : ""}</span>
                    </span>
                    <Button
                      variant={got ? "ghost" : "secondary"}
                      size={got ? "default" : "icon"}
                      class={got ? "h-11" : "size-11 rounded-full"}
                      disabled={got}
                      aria-label={got ? `${idea.text} übernommen` : `${idea.text} übernehmen`}
                      onclick={() => takeIdeas([index])}
                      >{#if got}Drin{:else}<Plus {...ic} />{/if}</Button
                    >
                  </div>
                {/each}
              </Card.Root>
            {/if}
          </section>
          <div class="flex gap-2">
            <Button
              variant="secondary"
              class="h-12 flex-1 rounded-xl text-base"
              disabled={!aiList.some((_idea, index) => !aiAdded[index])}
              onclick={() => takeIdeas(aiList.map((_idea, index) => index))}>Alle übernehmen</Button
            >
            <Button class="h-12 flex-1 rounded-xl text-base" onclick={() => (sheet = null)}>Fertig</Button>
          </div>
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}

<Dialog.Root bind:open={shareOpen} onOpenChange={(open) => !open && (shared = null)}>
  <Dialog.Content class="max-w-sm gap-4 rounded-2xl bg-background">
    {#if shared}
      <Dialog.Header>
        <Dialog.Title class="text-lg font-semibold">{shared.name} teilen</Dialog.Title>
        <Dialog.Description>Scannen oder Link schicken. Referenzfotos werden nicht mitgeteilt.</Dialog.Description>
      </Dialog.Header>
      <div class="overflow-hidden rounded-xl border bg-white [&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{@html shared.svg}</div>
      <div class="flex gap-2">
        <Button variant="outline" class="h-12 flex-1 rounded-xl bg-card text-base" onclick={copyLink}><Copy {...ic} /> Link kopieren</Button
        >
        {#if navigator.share}<Button size="icon" class="size-12 rounded-xl" onclick={nativeShare} aria-label="Teilen über…"
            ><Share {...ic} /></Button
          >{/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
