// AI step suggestions via any OpenAI-compatible endpoint, called straight from the browser.
// Config lives under its own key so the JSON export of "routines-v1" never contains the API key.

export const AI_KEY = "routines-ai";
const DEFAULTS = { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" };

export function loadAi() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(AI_KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAi(cfg) {
  try {
    localStorage.setItem(AI_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

const SYSTEM =
  "Du hilfst beim Planen täglicher Routinen. Schlage 3 bis 6 kurze, konkrete Schritte auf Deutsch vor, " +
  "jeweils mit Dauer in Minuten und ob der Schritt optional ist. Wiederhole keine bereits vorhandenen Schritte. " +
  'Antworte NUR mit einem JSON-Array, ohne weiteren Text: [{"text":"…","min":2,"optional":false}]';

export async function suggest(goal, steps, cfg, fetchFn = fetch) {
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const existing = steps.map((step) => step.text).filter(Boolean);
  const user = `Ziel: ${goal}\nVorhandene Schritte: ${existing.length ? existing.join("; ") : "keine"}`;
  let res;
  try {
    res = await fetchFn(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    throw new Error("KI nicht erreichbar");
  }
  if (!res.ok) throw new Error(`KI-Anfrage fehlgeschlagen (${res.status})`);
  let items = [];
  try {
    const content = (await res.json()).choices[0].message.content;
    items = JSON.parse(content.slice(content.indexOf("["), content.lastIndexOf("]") + 1));
  } catch {}
  const out = (Array.isArray(items) ? items : [])
    .flatMap((item) => {
      const text = typeof item?.text === "string" ? item.text.trim() : "";
      const optional = item?.optional ?? false;
      const minutes = Math.round(Number(item?.min ?? 2));
      if (!text || text.length > 120 || typeof optional !== "boolean" || !Number.isFinite(minutes)) return [];
      return [{ text, min: Math.min(240, Math.max(1, minutes)), optional }];
    })
    .slice(0, 8);
  if (!out.length) throw new Error("KI hat keine brauchbaren Schritte geliefert");
  return out;
}
