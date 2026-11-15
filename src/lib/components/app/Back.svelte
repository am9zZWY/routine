<script>
  import { ChevronLeft } from "@lucide/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  let { title, href = "/", right } = $props();
</script>

<header class="flex items-center justify-between px-2 pt-12 pb-2">
  <Button variant="ghost" size="icon" {href} aria-label="Zurück" class="size-11"
    ><ChevronLeft size={22} strokeWidth={2} aria-hidden="true" /></Button
  >
  <span class="truncate text-base font-semibold">{title}</span>
  {#if right}{@render right()}{:else}<span class="w-11"></span>{/if}
</header>
