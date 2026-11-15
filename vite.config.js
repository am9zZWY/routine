import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-node";
import tailwindcss from "@tailwindcss/vite";

// One client-rendered page (screens hash-routed in App.svelte) plus the household API, served by Node (adapter-node).
export default defineConfig({
  plugins: [tailwindcss(), sveltekit({ adapter: adapter(), serviceWorker: { register: false } })],
});
