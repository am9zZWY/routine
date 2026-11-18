<script>
  // The design's grey segmented control. `opts` is [[value, name], …].
  let { opts, get, set, label } = $props();
</script>

<div
  role="group"
  aria-label={label}
  class="grid gap-0.5 rounded-xl bg-muted p-0.5"
  style="grid-template-columns: repeat({opts.length}, minmax(0, 1fr))"
>
  {#each opts as [value, name]}
    <button
      aria-pressed={get() === value}
      onclick={() => set(value)}
      class="min-h-10 rounded-[10px] text-sm {get() === value ? 'bg-card font-semibold shadow-sm' : 'bg-transparent font-medium'}"
      >{name}</button
    >
  {/each}
</div>
