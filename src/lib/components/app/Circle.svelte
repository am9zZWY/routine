<script>
  // Round status check: empty ring when pending, filled when done. `color` tints done/open (the routine's colour).
  import { Check, X, Play } from "@lucide/svelte";
  let { st, color = "var(--brand)" } = $props();
</script>

{#if st === "done" || st === "late"}
  <span
    class="flex size-6 items-center justify-center rounded-full text-white"
    style="background: {st === 'late' ? 'var(--muted-foreground)' : color}"
  >
    <Check size={14} strokeWidth={3} aria-hidden="true" />
  </span>
{:else if st === "missed" || st === "partial"}
  <span class="flex size-6 items-center justify-center rounded-full bg-destructive text-white dark:text-background">
    <X size={14} strokeWidth={3} aria-hidden="true" />
  </span>
{:else if st === "open"}
  <span class="flex size-6 items-center justify-center rounded-full border-2" style="border-color: {color}; color: {color}">
    <Play size={10} strokeWidth={3} fill="currentColor" aria-hidden="true" />
  </span>
{:else if st === "overdue"}
  <span class="size-6 rounded-full border-2 border-dashed border-destructive"></span>
{:else}
  <span class="size-6 rounded-full border-2 border-muted-foreground/50"></span>
{/if}
