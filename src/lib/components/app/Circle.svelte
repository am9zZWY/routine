<script>
  // The design's round status check: empty ring when pending, filled when done.
  import { Check, X, Play } from "@lucide/svelte";
  let { st } = $props();
</script>

{#if st === "done"}
  <span class="flex size-5.5 items-center justify-center rounded-full bg-brand text-brand-foreground">
    <Check size={13} strokeWidth={3} aria-hidden="true" />
  </span>
{:else if st === "missed" || st === "partial"}
  <span class="flex size-5.5 items-center justify-center rounded-full bg-destructive text-white dark:text-background">
    <X size={13} strokeWidth={3} aria-hidden="true" />
  </span>
{:else if st === "open"}
  <span class="flex size-5.5 items-center justify-center rounded-full border-[1.5px] border-brand text-brand">
    <Play size={10} strokeWidth={3} fill="currentColor" aria-hidden="true" />
  </span>
{:else}
  <span class="size-5.5 rounded-full border-[1.5px] border-muted-foreground/60"></span>
{/if}
