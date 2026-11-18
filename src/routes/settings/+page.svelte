<script>
  // Einstellungen: household sharing, export (CSV, print), backup, theme, notifications.
  import { dayKey, addDays, dueOn } from "../../logic.js";
  import { merge, personal } from "../../personal.js";
  import qrcode from "qrcode-generator";
  import { app, sync, areaOf, rhythm, pale, DAYS, download, ic, sectionLabel, listCard, row } from "#lib/app.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import Back from "#lib/components/app/Back.svelte";
  import Segmented from "#lib/components/app/Segmented.svelte";
  import { Bell, Printer, Share2, Smartphone } from "@lucide/svelte";

  const appState = app.state;
  const now = $derived(app.now);
  const THEMES = { system: "System", light: "Hell", dark: "Dunkel" };
  const SYNC = {
    ok: "Verbunden",
    offline: "Server nicht erreichbar, Änderungen werden nachgeschickt",
    denied: "Falscher Haushaltscode",
    nocode: "Gib den Haushaltscode ein",
    error: "Eine Änderung wurde vom Server abgelehnt",
  };

  const inviteUrl = $derived(`${location.origin}/#join=${encodeURIComponent(app.hh.code)}`);
  const invite = () =>
    navigator.share
      ? navigator.share({ title: "Unser Haushalt", url: inviteUrl }).catch(() => {})
      : navigator.clipboard.writeText(inviteUrl).then(
          () => (app.banner = "Einladungslink kopiert"),
          () => prompt("Kopier diesen Link", inviteUrl),
        );
  // Your other devices: the same link plus your personal sync key. Opening it there merges both devices' routines.
  const deviceUrl = $derived(`${inviteUrl}&me=${app.meKey}`);
  let deviceQr = $state("");
  function showDevice() {
    const qr = qrcode(0, "L");
    qr.addData(deviceUrl);
    qr.make();
    deviceQr = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }
  const copyDevice = () =>
    navigator.clipboard.writeText(deviceUrl).then(
      () => (app.banner = "Link kopiert"),
      () => prompt("Kopier diesen Link", deviceUrl),
    );
  const askPermission = async () => {
    app.perm = await Notification.requestPermission();
  };

  // Export / print the household week (Mo–So of the current week).
  let scope = $state("all"); // all | week
  const weekDays = $derived(Array.from({ length: 7 }, (_unused, index) => dayKey(addDays(now, index - ((now.getDay() + 6) % 7)))));
  const planRows = $derived(
    appState.tasks
      .map((task) => ({ task, due: weekDays.map((day) => dueOn(task, day)) }))
      .filter((planRow) => scope === "all" || planRow.due.some(Boolean))
      .sort((first, second) => first.due.indexOf(true) - second.due.indexOf(true) || first.task.title.localeCompare(second.task.title)),
  );
  const weekLabel = $derived(
    `${new Date(weekDays[0] + "T12:00").toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${new Date(weekDays[6] + "T12:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`,
  );
  const noted = $derived(planRows.filter((planRow) => planRow.task.note));
  function exportCsv() {
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [["Aufgabe", "Bereich", "Rhythmus", ...DAYS.map((dayNames) => dayNames[0]), "Notiz"].map(quote).join(";")];
    for (const { task, due } of planRows)
      lines.push(
        [task.title, areaOf(task.area).name, rhythm(task), ...due.map((isDue) => (isDue ? "☐" : "")), task.note ?? ""].map(quote).join(";"),
      );
    download(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv" }), `haushalt-${weekDays[0]}.csv`); // BOM so Excel reads UTF-8
  }

  // Backup of the personal data (routines, points, history); the household lives on the server.
  const exportJson = () => download(new Blob([JSON.stringify(appState)], { type: "application/json" }), `routines-${app.today}.json`);
  async function importJson(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.routines) || !Array.isArray(data.log)) throw new Error();
      if (!confirm("Routinen und Verlauf aus diesem Backup übernehmen?")) return;
      // Merged, not replaced: with sync on, replaced routines would come back from the server anyway.
      Object.assign(
        appState,
        merge(personal($state.snapshot(appState)), { routines: data.routines, log: data.log, progress: data.progress ?? {}, gone: {} }),
      );
    } catch {
      alert("Das ist keine gültige Backup-Datei.");
    }
  }
</script>

<div class="contents print:hidden">
  <Back title="Einstellungen" />
  <main class="flex flex-1 flex-col gap-7 px-4 pt-2 pb-6">
    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Haushalt teilen</h2>
      <Card.Root class="{listCard} gap-3 p-4">
        <div class="flex flex-col gap-1.5">
          <Label for="hh-name" class="text-[13px] font-semibold text-muted-foreground">Dein Name</Label>
          <Input
            id="hh-name"
            bind:value={app.hh.name}
            placeholder="Steht beim Haken, wenn du etwas erledigst"
            autocomplete="given-name"
            class="h-11 rounded-lg px-3 text-base shadow-none"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="hh-code" class="text-[13px] font-semibold text-muted-foreground">Haushaltscode</Label>
          <Input
            id="hh-code"
            bind:value={app.hh.code}
            onchange={sync}
            placeholder="HOUSEHOLD_CODE vom Server"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="h-11 rounded-lg px-3 text-base shadow-none"
          />
        </div>
        {#if app.syncState}
          <p class="m-0 text-[13px] font-medium {app.syncState === 'ok' ? 'text-good' : 'text-destructive'}">
            {SYNC[app.syncState]}{app.syncState === "ok" && appState.outbox.length ? ` · ${appState.outbox.length} ausstehend` : ""}
          </p>
        {/if}
        <Button variant="outline" class="h-11 rounded-lg bg-card text-base text-brand" disabled={app.syncState !== "ok"} onclick={invite}
          ><Share2 {...ic} /> Person einladen</Button
        >
      </Card.Root>
      <p class="mx-2 my-0 text-[13px] leading-snug text-muted-foreground">
        Eingeladene sehen dieselben Aufgaben und können abhaken. Wer etwas erledigt hat, steht beim Haken. Der Link enthält den Code, schick
        ihn nur an Leute aus deinem Haushalt.
      </p>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Haushalt exportieren</h2>
      <Segmented
        opts={[
          ["all", "Alle Aufgaben"],
          ["week", "Diese Woche"],
        ]}
        get={() => scope}
        set={(value) => (scope = value)}
        label="Umfang"
      />
      <Card.Root class={listCard}>
        <button
          onclick={exportCsv}
          disabled={!appState.tasks.length}
          class="{row} min-h-16 gap-3.5 bg-transparent text-left text-foreground disabled:opacity-50"
        >
          <span
            class="flex size-9 items-center justify-center rounded-lg text-[11px] font-bold tracking-wide text-good"
            style="background: {pale('#3FA066')}">CSV</span
          >
          <span class="flex flex-1 flex-col gap-0.5"
            ><span class="text-base font-medium">CSV-Datei</span><span class="text-[13px] text-muted-foreground"
              >Für Excel, Numbers, Google Sheets. Mit Spalten Mo–So</span
            ></span
          >
        </button>
        <button
          onclick={() => window.print()}
          disabled={!appState.tasks.length}
          class="{row} min-h-16 gap-3.5 bg-transparent text-left text-foreground disabled:opacity-50"
        >
          <span class="flex size-9 items-center justify-center rounded-lg" style="background: {pale('#E3B21C')}"
            ><Printer size={18} strokeWidth={1.75} aria-hidden="true" /></span
          >
          <span class="flex flex-1 flex-col gap-0.5"
            ><span class="text-base font-medium">Drucken</span><span class="text-[13px] text-muted-foreground"
              >Wochenplan auf A4, zum Aufhängen</span
            ></span
          >
        </button>
      </Card.Root>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Meine Geräte</h2>
      <Card.Root class="{listCard} gap-3 p-4">
        <p class="m-0 text-[13px] font-medium {app.meState === 'ok' ? 'text-good' : 'text-destructive'}">
          {app.meState === "ok" ? "Routinen werden synchronisiert" : (SYNC[app.meState] ?? "Noch nicht synchronisiert")}
        </p>
        <Button variant="outline" class="h-11 rounded-lg bg-card text-base text-brand" disabled={app.meState !== "ok"} onclick={showDevice}
          ><Smartphone {...ic} /> Anderes Gerät verbinden</Button
        >
        {#if deviceQr}
          <div class="mx-auto w-52 rounded-xl bg-white p-1" aria-label="QR-Code zum Verbinden">{@html deviceQr}</div>
          <Button variant="secondary" class="h-11 rounded-lg" onclick={copyDevice}>Link kopieren</Button>
        {/if}
      </Card.Root>
      <p class="mx-2 my-0 text-[13px] leading-snug text-muted-foreground">
        Öffne den Link oder scanne den Code auf deinem anderen Gerät. Danach haben beide dieselben Routinen, Punkte und denselben Verlauf.
        Der Link ist dein persönlicher Schlüssel, teil ihn mit niemandem.
      </p>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Backup</h2>
      <Card.Root class={listCard}>
        <button onclick={exportJson} class="{row} min-h-16 gap-3.5 bg-transparent text-left text-foreground">
          <span class="flex size-9 items-center justify-center rounded-lg border text-[11px] font-bold tracking-wide">JSON</span>
          <span class="flex flex-1 flex-col gap-0.5"
            ><span class="text-base font-medium">Backup exportieren</span><span class="text-[13px] text-muted-foreground"
              >Alle Routinen, Punkte und der Verlauf</span
            ></span
          >
        </button>
        <label class="{row} min-h-16 gap-3.5 text-foreground">
          <span class="flex size-9 items-center justify-center rounded-lg border text-[11px] font-bold tracking-wide">JSON</span>
          <span class="flex flex-1 flex-col gap-0.5"
            ><span class="text-base font-medium">Backup importieren</span><span class="text-[13px] text-muted-foreground"
              >Übernimmt Routinen und Verlauf, ersetzt nichts</span
            ></span
          >
          <input type="file" accept="application/json,.json" class="sr-only" onchange={importJson} />
        </label>
      </Card.Root>
      <p class="mx-2 my-0 text-[13px] leading-snug text-muted-foreground">
        Routinen, Punkte und Verlauf liegen auf diesem Gerät und, mit Haushaltscode, auf dem Server. Haushaltsaufgaben liegen auf dem
        Server. Einzelne Routinen teilst du im Editor per Link oder QR-Code.
      </p>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class={sectionLabel}>Darstellung</h2>
      <Segmented opts={Object.entries(THEMES)} get={() => app.theme} set={(value) => (app.theme = value)} label="Darstellung" />
    </section>

    {#if app.perm !== "unsupported"}
      <section class="flex flex-col gap-2">
        <h2 class={sectionLabel}>Erinnerungen</h2>
        <Card.Root class={listCard}>
          <button
            onclick={askPermission}
            disabled={app.perm !== "default"}
            class="{row} min-h-14 bg-transparent text-left text-base disabled:opacity-100"
          >
            <Bell {...ic} class="mx-1.5 {app.perm === 'default' ? 'text-brand' : 'text-muted-foreground'}" />
            <span class="flex-1 {app.perm === 'default' ? 'font-medium text-brand' : ''}">Benachrichtigungen</span>
            <span class="text-[13px] text-muted-foreground">{{ default: "Aktivieren", granted: "An", denied: "Blockiert" }[app.perm]}</span>
          </button>
        </Card.Root>
        <p class="mx-2 my-0 text-[13px] leading-snug text-muted-foreground">
          Erinnert dich, wenn ein Fenster aufgeht, solange die App offen ist.
        </p>
      </section>
    {/if}
  </main>
</div>

<article class="hidden bg-white p-4 text-[#141414] print:flex print:flex-col print:gap-7">
  <header class="flex items-end justify-between border-b-2 border-[#141414] pb-3.5">
    <div class="flex flex-col gap-1">
      <span class="text-[13px] font-semibold tracking-[0.06em] text-[#5f5f5a] uppercase">Haushalt</span>
      <h1 class="m-0 text-[32px] leading-tight font-bold tracking-tight">Wochenplan</h1>
    </div>
    <span class="text-base font-medium">{weekLabel}</span>
  </header>
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="text-[12px] font-semibold text-[#5f5f5a]">
        <th scope="col" class="border-b border-[#141414] py-2 pr-2 text-left">Aufgabe</th>
        <th scope="col" class="border-b border-[#141414] p-2 text-left">Bereich</th>
        {#each DAYS as [short]}<th scope="col" class="w-10 border-b border-[#141414] py-2 text-center">{short}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each planRows as { task, due } (task.id)}
        {@const ref = noted.findIndex((planRow) => planRow.task === task) + 1}
        <tr class="break-inside-avoid">
          <td class="h-10.5 border-b border-[#cfcfca] pr-2 font-medium"
            >{task.title}{#if ref}<sup class="ml-0.5 text-[12px] text-[#5f5f5a]">{ref}</sup>{/if}</td
          >
          <td class="border-b border-[#cfcfca] px-2 text-[#45453f]">{areaOf(task.area).name}</td>
          {#each due as isDue}
            <td class="border-b border-[#cfcfca] text-center">
              {#if isDue}<span class="inline-block size-4.5 rounded-[3px] border-[1.5px] border-[#141414] align-middle"></span>
              {:else}<span class="inline-block h-px w-2 bg-[#b5b5af] align-middle"></span>{/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if noted.length}
    <section class="flex flex-col gap-2">
      <h2 class="m-0 text-[13px] font-semibold tracking-[0.06em] text-[#5f5f5a] uppercase">Notizen</h2>
      <ol class="m-0 flex flex-col gap-1.5 pl-5 text-[13px] leading-normal">
        {#each noted as { task }}<li>{task.title}: {task.note}</li>{/each}
      </ol>
    </section>
  {/if}
  <footer class="flex justify-between border-t border-[#cfcfca] pt-2.5 text-[12px] text-[#5f5f5a]">
    <span>Kästchen = fällig an diesem Tag · zum Abhaken</span>
    <span>Gedruckt am {now.toLocaleDateString("de-DE")}</span>
  </footer>
</article>
