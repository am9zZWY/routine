import { test, expect } from "bun:test";
import { suggest } from "./ai.js";

const cfg = { baseUrl: "http://x/v1/", apiKey: "k", model: "m" };
const fake =
  (content, status = 200, calls = []) =>
  async (url, init) => {
    calls.push([url, init]);
    return { ok: status < 300, status, json: async () => ({ choices: [{ message: { content } }] }) };
  };

test("parses array wrapped in prose and code fences", async () => {
  const calls = [];
  const r = await suggest(
    "Abends runterkommen",
    [{ text: "Zähne putzen" }],
    cfg,
    fake('Klar!\n```json\n[{"text":"Tee kochen","min":5,"optional":false}]\n```\nViel Spaß', 200, calls),
  );
  expect(r).toEqual([{ text: "Tee kochen", min: 5, optional: false }]);
  expect(calls[0][0]).toBe("http://x/v1/chat/completions");
  expect(calls[0][1].headers.Authorization).toBe("Bearer k");
  expect(JSON.parse(calls[0][1].body).messages[1].content).toContain("Zähne putzen");
});

test("drops invalid items, clamps min, caps at 8", async () => {
  const items = [
    { text: "  a  ", min: 0.4 },
    { text: "b", min: 999, optional: true },
    { text: "" },
    { text: "c", optional: "ja" },
    { text: "x".repeat(121) },
    { min: 3 },
    null,
    ...Array.from({ length: 10 }, (_, i) => ({ text: `s${i}`, min: 2.6 })),
  ];
  const r = await suggest("g", [], cfg, fake(JSON.stringify(items)));
  expect(r.length).toBe(8);
  expect(r.slice(0, 3)).toEqual([
    { text: "a", min: 1, optional: false },
    { text: "b", min: 240, optional: true },
    { text: "s0", min: 3, optional: false },
  ]);
  await expect(suggest("g", [], cfg, fake("no json here"))).rejects.toThrow();
});

test("non-OK and network failure throw", async () => {
  await expect(suggest("g", [], cfg, fake("[]", 401))).rejects.toThrow("(401)");
  await expect(
    suggest("g", [], cfg, async () => {
      throw new TypeError("offline");
    }),
  ).rejects.toThrow();
});

test("no Authorization header without key", async () => {
  const calls = [];
  await suggest("g", [], { ...cfg, apiKey: "" }, fake('[{"text":"a"}]', 200, calls));
  expect("Authorization" in calls[0][1].headers).toBe(false);
});
