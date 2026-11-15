<script>
  import { Settings } from "@lucide/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { ic } from "#lib/app.svelte.js";
</script>

<Button variant="ghost" size="icon" href="/settings" aria-label="Einstellungen" class="-mr-2.5 size-11"><Settings {...ic} /></Button>
