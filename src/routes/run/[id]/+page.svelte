<script>
  // Running a routine: countdown ring, current step (tap or photo check), the steps after it.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { windowOf, advance, stepOf, schedule, hm, onlyOptionalLeft, tickable } from "../../../logic.js";
  import { compare, THRESHOLD } from "../../../photo.js";
  import { app, stOf, mmss, fmtOffset, signed, ic, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import Back from "#lib/components/app/Back.svelte";
  import { Camera, Check, Flag } from "@lucide/svelte";

  const appState = app.state;
  const now = $derived(app.now);
  const today = $derived(app.today);
  const run = $derived(appState.routines.find((routine) => routine.id === page.params.id));
  $effect(() => {
    if (!run) goto("/", { replace: true });
  });
  let photoScore = $state(null),
    busy = $state(false);

  function done(finish = false) {
    app.now = new Date();
    const logEntry = advance(appState, run, app.now, finish);
    if (logEntry) {
      const photo = photoScore != null ? ` · Foto ${photoScore.toFixed(2)}` : "";
      app.banner =
        logEntry.status === "late"
          ? `${logEntry.name} nachträglich erledigt · keine Punkte, keine Strafe`
          : `${logEntry.name} erledigt ${fmtOffset(logEntry.offset)} · ${signed(logEntry.points)}${photo}`;
      goto("/");
    }
  }
  async function checkPhoto(event, step) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    busy = true;
    photoScore = null;
    try {
      photoScore = await compare(step.ref, file);
      if (photoScore >= THRESHOLD) done();
    } catch {
      alert("Das Foto konnte nicht gelesen werden.");
    }
    busy = false;
  }
</script>

{#if run}
  {@const st = stOf(run)}
  {@const win = windowOf(run, today)}
  {@const current = stepOf(appState, run, now)}
  {@const step = run.steps[current]}
  {@const sc = schedule(run, today)}
  {@const frac = Math.min(1, Math.max(0, (win.close - now) / (win.close - win.open || 1)))}
  <Back title={run.name} />

  <main class="flex flex-1 flex-col gap-5 px-4 pb-8">
    <div class="relative mx-auto my-2 grid size-52 place-items-center">
      <svg viewBox="0 0 236 236" class="absolute inset-0 size-full" aria-hidden="true">
        <circle cx="118" cy="118" r="104" fill="none" class="stroke-border" stroke-width="10" />
        <circle
          cx="118"
          cy="118"
          r="104"
          fill="none"
          class="stroke-brand"
          stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray="{frac * 653.45} 653.45"
          transform="rotate(-90 118 118)"
        />
      </svg>
      <div class="flex flex-col items-center">
        {#if st === "overdue"}
          <b class="text-[34px] leading-none font-bold tracking-tight text-destructive">Zu spät</b>
          <span class="mt-1 text-[13px] text-muted-foreground">heute noch abhaken, 0 Pkt.</span>
        {:else}
          <b class="num text-[44px] leading-none font-bold tracking-tight">{mmss(win.close - now)}</b>
          <span class="mt-1 text-[13px] text-muted-foreground">übrig, endet {hm(win.close)}</span>
        {/if}
      </div>
    </div>

    <ol class="m-0 flex list-none justify-center gap-1.5 p-0" aria-label="Fortschritt">
      {#each run.steps as item, index (item.id)}
        <li
          aria-label={item.text}
          class="h-1.5 rounded-full {index === current
            ? 'w-6 bg-brand'
            : index < current
              ? 'w-1.5 bg-brand'
              : item.optional
                ? 'w-1.5 border border-dashed border-muted-foreground'
                : 'w-1.5 bg-border'}"
        ></li>
      {/each}
    </ol>

    {#if !tickable(st) || !step}
      <Card.Root class="{listCard} p-6"><h2 class="m-0 text-xl font-semibold">Das Fenster ist zu.</h2></Card.Root>
    {:else}
      <Card.Root class="{listCard} gap-4 p-5">
        <div class="flex justify-between text-[13px] text-muted-foreground">
          <span>Schritt {current + 1} von {run.steps.length}</span>
          <span>{step.type === "photo" ? "braucht ein Foto" : step.optional ? "optional" : "antippen"}</span>
        </div>
        <h2 class="m-0 text-2xl leading-tight font-bold tracking-tight">{step.text}</h2>
        {#if sc[current].end >= now}<p class="num m-0 text-[15px] text-muted-foreground">
            <b class="text-foreground">{mmss(sc[current].end - now)}</b> bis {hm(sc[current].end)}
          </p>
        {:else}<p class="num m-0 text-[15px] font-medium text-destructive">+{mmss(now - sc[current].end)} zu spät</p>{/if}
        {#if step.type === "tap"}
          <Button
            class="h-13 w-full rounded-xl bg-brand text-base text-brand-foreground hover:bg-brand/90"
            onclick={() => {
              photoScore = null;
              done();
            }}><Check size={20} strokeWidth={2.5} aria-hidden="true" /> Erledigt</Button
          >
        {:else}
          <div class="flex items-center gap-3">
            <img class="size-13 rounded-xl border object-cover" src={step.ref} alt="Referenz für {step.text}" />
            <label
              class="flex h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-base font-medium text-brand-foreground {busy
                ? 'opacity-60'
                : ''}"
            >
              <Camera size={20} strokeWidth={2} aria-hidden="true" />
              {busy ? "Prüfe…" : "Foto machen"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                class="sr-only"
                disabled={busy}
                onchange={(event) => checkPhoto(event, step)}
              />
            </label>
          </div>
          {#if photoScore != null}
            <p class="num m-0 text-[13px] font-medium {photoScore < THRESHOLD ? 'text-destructive' : 'text-good'}">
              Wert {photoScore.toFixed(2)} (nötig {THRESHOLD}) · {photoScore >= THRESHOLD ? "bestanden" : "nochmal"}
            </p>
          {/if}
        {/if}
        {#if step.optional || onlyOptionalLeft(run, current)}
          <div class="flex gap-2">
            {#if step.optional}<Button
                variant="secondary"
                class="h-11 flex-1 rounded-xl"
                onclick={() => {
                  photoScore = null;
                  done();
                }}>Überspringen</Button
              >{/if}
            {#if onlyOptionalLeft(run, current)}<Button variant="secondary" class="h-11 flex-1 rounded-xl" onclick={() => done(true)}
                ><Flag {...ic} /> Abschließen</Button
              >{/if}
          </div>
        {/if}
      </Card.Root>
      <section class="flex flex-col gap-2">
        <h2 class={sectionLabel}>Alle Schritte</h2>
        <Card.Root class={listCard}>
          {#each run.steps as item, index (item.id)}
            <div
              class="{row} min-h-12 text-[15px] {index === current ? 'bg-brand/8' : ''}"
              aria-current={index === current ? "step" : undefined}
            >
              {#if index < current}
                <span
                  class="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground"
                  aria-label="erledigt"><Check size={14} strokeWidth={3} aria-hidden="true" /></span
                >
              {:else}
                <span
                  class="size-6 shrink-0 rounded-full border-2 {item.optional ? 'border-dashed' : ''} {index === current
                    ? 'border-brand'
                    : 'border-muted-foreground/50'}"
                  aria-label={index === current ? "jetzt" : "offen"}
                ></span>
              {/if}
              <span
                class="flex-1 font-medium {index < current
                  ? 'text-muted-foreground line-through'
                  : item.optional
                    ? 'text-muted-foreground'
                    : ''}">{item.text}</span
              >
              <span class="num text-[13px] text-muted-foreground"
                >{item.type === "photo" ? "Foto · " : item.optional ? "optional · " : ""}{hm(sc[index].start)}</span
              >
            </div>
          {/each}
        </Card.Root>
      </section>
    {/if}
  </main>
{/if}
