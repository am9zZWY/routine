<script>
  // Icon for a routine (`icon` is one of ICONS in personal.js).
  import { Sun, Moon, Coffee, Dumbbell, BookOpen, Bed, Bath, Briefcase, Utensils, Heart, Pill, Music } from "@lucide/svelte";
  const MAP = {
    sun: Sun,
    moon: Moon,
    coffee: Coffee,
    dumbbell: Dumbbell,
    book: BookOpen,
    bed: Bed,
    bath: Bath,
    briefcase: Briefcase,
    utensils: Utensils,
    heart: Heart,
    pill: Pill,
    music: Music,
  };
  let { icon, size = 20 } = $props();
  const Icon = $derived(MAP[icon] ?? Sun);
</script>

<Icon {size} strokeWidth={1.75} aria-hidden="true" />
