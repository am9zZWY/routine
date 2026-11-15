<script>
  // One empty state for every list: text plus a button that creates the first item.
  import { Plus } from "@lucide/svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Card from "#lib/components/ui/card/index.js";
  import { ic, listCard } from "#lib/app.svelte.js";
  let { text, href, action } = $props();
</script>

<Card.Root class="{listCard} items-center gap-3 p-6 text-center">
  <p class="m-0 text-[13px] text-muted-foreground">{text}</p>
  <Button {href} class="h-11 rounded-full px-5"><Plus {...ic} /> {action}</Button>
</Card.Root>
