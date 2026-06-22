// Skin & Scalp Advisor — backend
// Serves the app and runs the scan + detailed consultation via Groq.
// Key stays on the server. No user answers are stored.

const express = require("express");
const path = require("path");
const fs = require("fs");
const products = require("./data/products");

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    else if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
  }
}));

const API_KEY = process.env.GROQ_API_KEY;
const TEXT_MODEL = process.env.TEXT_MODEL || process.env.MODEL || "openai/gpt-oss-120b";
const VISION_MODEL = process.env.VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Leads are saved to a local JSON file. For a busy production app, swap this for a
// real database. Set OWNER_PASSWORD to protect the owner dashboard.
const LEADS_FILE = path.join(__dirname, "data", "leads.json");
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "dewleaf-admin";
function readLeads() { try { return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")); } catch { return []; } }

// ---- helpers ----
function byCategory(category) { return products.filter((p) => p.category === (category === "hair" ? "hair" : "face")); }
function find(id) { return products.find((p) => p.id === id); }
function catalogText(category) {
  return byCategory(category)
    .map((p) => `- id:${p.id} | ${p.name} | $${p.price} | role:${p.role} | suits:${p.skinTypes.join(",")} | helps:${p.concerns.join(",")} | key:${p.keyIngredient}`)
    .join("\n");
}
function safeParse(t) { const c = String(t).replace(/```json|```/g, "").trim(); try { return JSON.parse(c); } catch { return null; } }
async function callGroq(model, messages, extra = {}) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model, max_tokens: 1800, temperature: 0.5, response_format: { type: "json_object" }, messages, ...extra })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "Groq error");
  return data.choices?.[0]?.message?.content || "";
}
function hydrateGroups(rawGroups, category) {
  const pool = byCategory(category);
  const groups = (Array.isArray(rawGroups) ? rawGroups : []).map((g) => ({
    title: g.title || "Routine",
    steps: (Array.isArray(g.steps) ? g.steps : [])
      .map((s) => { const p = pool.find((x) => x.id === s.id); return p ? { step: s.step || "", note: s.note || "", product: p } : null; })
      .filter(Boolean)
  })).filter((g) => g.steps.length);
  const seen = new Set(); const flat = [];
  groups.forEach((g) => g.steps.forEach((s) => { if (!seen.has(s.product.id)) { seen.add(s.product.id); flat.push(s.product); } }));
  return { groups, products: flat };
}

// ---- concern flags ----
function flags(category, answers) {
  const t = [answers.type, answers.scalp, answers.concerns, answers.goal].filter(Boolean).join(" ").toLowerCase();
  return {
    oily: /oily|oil|greasy|shine/.test(t), dry: /dry|flaky|tight/.test(t),
    sensitive: /sensitive|redness|irritat/.test(t), combination: /combination/.test(t),
    acne: /acne|breakout|pimple|spot/.test(t), dark: /dark spot|pigment/.test(t),
    dull: /dull|glow|bright/.test(t), fine: /fine line|aging|wrinkle/.test(t),
    dand: /dandruff|flake/.test(t), itch: /itch/.test(t), frizz: /frizz/.test(t),
    hairfall: /hair fall|thinning|shed|breakage/.test(t), volume: /volume|flat|limp/.test(t)
  };
}

// ---- cosmetic snapshot (friendly, not medical) ----
function buildSnapshot(category, f) {
  if (category === "hair") {
    return [
      { label: "Moisture", value: f.dry || f.frizz ? 30 : f.oily ? 58 : 52 },
      { label: "Scalp oil", value: f.oily ? 80 : f.dry ? 28 : 50 },
      { label: "Sensitivity", value: f.sensitive || f.itch ? 72 : 34 }
    ];
  }
  return [
    { label: "Hydration", value: f.dry ? 28 : f.oily ? 56 : f.sensitive ? 50 : 55 },
    { label: "Oil level", value: f.oily ? 82 : f.dry ? 22 : f.combination ? 62 : 48 },
    { label: "Sensitivity", value: f.sensitive ? 76 : 34 }
  ];
}

// ---- rule-based routine (fallback) ----
function buildRoutine(category, f) {
  if (category === "hair") {
    const shampoo = f.oily || f.dand ? "sham-dandruff" : "sham-hydrate";
    const cond = f.frizz || f.dry ? "cond-smooth" : "cond-volume";
    const leavein = f.hairfall ? "oil-strength" : f.itch || f.sensitive ? "treat-soothe" : f.oily ? "serum-scalp" : "oil-strength";
    return [
      { title: "In the shower", steps: [{ id: shampoo, step: "Cleanse scalp" }, { id: cond, step: "Condition lengths" }] },
      { title: "Between washes", steps: [{ id: leavein, step: "Treat & nourish" }] }
    ];
  }
  const cleanser = f.oily || f.acne ? "cleanse-gel" : "cleanse-cream";
  const amSerum = f.dark || f.dull ? "serum-vitc" : f.oily || f.acne ? "serum-niacinamide" : "serum-hydra";
  const pmSerum = f.fine ? "serum-retinol" : amSerum;
  const amMoist = f.sensitive ? "moist-calm" : "moist-light";
  const pmMoist = f.dry ? "moist-rich" : f.sensitive ? "moist-calm" : "moist-light";
  const mask = f.oily || f.acne ? "mask-clay" : f.sensitive || f.dry ? "mask-oat" : null;
  const groups = [
    { title: "Morning", steps: [{ id: cleanser, step: "Cleanse" }, { id: amSerum, step: "Treat" }, { id: amMoist, step: "Moisturise" }, { id: "spf-daily", step: "Protect" }] },
    { title: "Evening", steps: [{ id: cleanser, step: "Cleanse" }, { id: pmSerum, step: "Treat" }, { id: pmMoist, step: "Moisturise" }] }
  ];
  if (mask) groups.push({ title: "Once or twice a week", steps: [{ id: mask, step: "Mask" }] });
  return groups;
}

const LIFESTYLE_TIPS = {
  lowwater: "Sip more water through the day — hydration shows on skin and scalp.",
  poorsleep: "Protect your sleep; skin does most of its repair overnight.",
  stress: "Stress can worsen flare-ups — short daily wind-downs really help.",
  diet: "Easing off sugar and dairy can calm breakouts for some people.",
  sun: "Daily SPF is the simplest anti-aging and dark-spot step there is.",
  hardwater: "Hard water can dry the scalp — a clarifying wash now and then helps.",
  lowprotein: "Hair is built from protein; steady protein supports stronger strands.",
  heat: "Give heat styling a rest day or two a week and use a heat protectant."
};

function proSentence(category) {
  return category === "hair"
    ? "Because this has been going on a while, it's worth seeing a dermatologist or trichologist to find the root cause — this routine will still support things in the meantime."
    : "Since this has been going on a while, it's worth checking in with a dermatologist — they can look deeper than any routine can. These steps still help day to day.";
}

// ---- chat (kept for completeness) ----
app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const category = req.body.category === "hair" ? "hair" : "face";
  try {
    if (!API_KEY) return res.json(fallbackChat(messages, category));
    const thing = category === "hair" ? "scalp & hair" : "skin";
    const system = `You are "Dew", a warm ${thing} advisor for Dewleaf. Only recommend from the CATALOG. If unsure of type/concern, ask ONE short question. Otherwise recommend 2-3 with one short reason each. Reply ONLY as JSON: {"reply": string, "recommend": [id,...]}.\nCATALOG:\n${catalogText(category)}`;
    const text = await callGroq(TEXT_MODEL, [{ role: "system", content: system }, ...messages]);
    const p = safeParse(text) || { reply: text, recommend: [] };
    return res.json({ reply: p.reply || "", products: (p.recommend || []).map(find).filter((x) => x && x.category === category) });
  } catch (e) { console.error("chat:", e.message); return res.json(fallbackChat(messages, category)); }
});
function fallbackChat(messages, category) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const f = flags(category, { concerns: last && typeof last.content === "string" ? last.content : "" });
  const { products } = hydrateGroups(buildRoutine(category, f), category);
  return { reply: "Here are a few that fit what you described:", products: products.slice(0, 3) };
}

// ---- scan (vision, optional) ----
app.post("/api/analyze", async (req, res) => {
  const category = req.body.category === "hair" ? "hair" : "face";
  const image = req.body.image;
  const thing = category === "hair" ? "scalp and hair" : "facial skin";
  if (!API_KEY || !image) return res.json({ needInput: true, category });
  try {
    const system = `You are a friendly COSMETIC ${thing} analysis assistant for Dewleaf. Give a light, encouraging read. NOT a medical diagnosis — never name conditions, use everyday words. Reply ONLY as JSON: {"profile": {"type": "short label", "observations": ["short tag", ...]}}`;
    const text = await callGroq(VISION_MODEL, [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: `Quick cosmetic read of my ${thing} from this photo as JSON.` }, { type: "image_url", image_url: { url: image } }] }
    ], { temperature: 0.4 });
    const p = safeParse(text);
    if (!p || !p.profile) return res.json({ needInput: true, category });
    return res.json({ profile: p.profile, category });
  } catch (e) { console.error("analyze:", e.message); return res.json({ needInput: true, category, note: "vision_unavailable" }); }
});

// ---- detailed consultation ----
app.post("/api/consult", async (req, res) => {
  const category = req.body.category === "hair" ? "hair" : "face";
  const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const detected = req.body.detected || null;
  const language = (req.body.language || "English").toString().slice(0, 30);
  const f = flags(category, answers);
  const thing = category === "hair" ? "scalp & hair" : "skin";

  const longstanding = /year|years/i.test(answers.duration || "");
  const significant = /significant|severe/i.test(answers.severity || "");
  const flagPro = (longstanding && significant) || (f.hairfall && longstanding);

  try {
    if (!API_KEY) return res.json(fallbackConsult(category, answers, detected, f, flagPro));
    const groupNames = category === "hair" ? `"In the shower" and "Between washes"` : `"Morning" and "Evening" (add a weekly group if useful)`;
    const system = `You are "Dew", a warm, knowledgeable COSMETIC ${thing} consultant for Dewleaf.
Use the customer's intake answers to write a caring, personal consultation and an ordered routine from the CATALOG.

RULES:
- COSMETIC product guidance only — NOT medical advice or diagnosis. Never name diseases, never claim to treat/cure. Everyday language.
- If the concern is long-standing (a year+) and significant, OR involves notable hair loss, set "seeProfessional" to a short kind sentence suggesting a dermatologist/trichologist.
- Reference their actual answers so it feels personal.
- Build the routine as ordered groups: ${groupNames}. Each step uses a product id from the CATALOG and a short step word (e.g. "Cleanse", "Treat", "Protect"). Never invent products.
- "snapshot" = 3 cosmetic bars (0-100) summarising their ${thing} (friendly, not clinical).
- Give 2-4 short lifestyle tips relevant to their answers.
- Write ALL text fields in ${language}.
- Reply ONLY as JSON, no markdown:
{
 "profile": {"type": "short label", "tags": ["tag","tag"]},
 "snapshot": [{"label":"...","value":0-100}, ...3],
 "summary": "2-3 warm personal sentences",
 "routine": [{"title":"...","steps":[{"id":"product-id","step":"Cleanse","note":"optional short note"}]}],
 "lifestyle": ["tip","tip"],
 "seeProfessional": ""
}
CATALOG:
${catalogText(category)}`;
    const userMsg = `Intake (${thing}):\n${JSON.stringify(answers, null, 2)}${detected ? `\nPhoto read: ${JSON.stringify(detected)}` : ""}`;
    const text = await callGroq(TEXT_MODEL, [{ role: "system", content: system }, { role: "user", content: userMsg }], { max_tokens: 2000 });
    const p = safeParse(text);
    if (!p) return res.json(fallbackConsult(category, answers, detected, f, flagPro));
    const { groups, products: flat } = hydrateGroups(p.routine, category);
    const safeGroups = groups.length ? groups : hydrateGroups(buildRoutine(category, f), category).groups;
    return res.json({
      profile: p.profile || null,
      snapshot: Array.isArray(p.snapshot) && p.snapshot.length ? p.snapshot : buildSnapshot(category, f),
      summary: p.summary || "",
      routine: safeGroups,
      products: flat.length ? flat : hydrateGroups(buildRoutine(category, f), category).products,
      lifestyle: Array.isArray(p.lifestyle) ? p.lifestyle : [],
      seeProfessional: p.seeProfessional || (flagPro ? proSentence(category) : ""),
      language
    });
  } catch (e) { console.error("consult:", e.message); return res.json(fallbackConsult(category, answers, detected, f, flagPro)); }
});

function fallbackConsult(category, answers, detected, f, flagPro) {
  const { groups, products } = hydrateGroups(buildRoutine(category, f), category);
  const type = detected && detected.type ? detected.type : answers.type || answers.scalp || "Your profile";
  const dur = answers.duration ? ` You mentioned it's been going on ${answers.duration.toLowerCase()}.` : "";
  const tips = [];
  (answers.lifestyleKeys || []).forEach((k) => { if (LIFESTYLE_TIPS[k]) tips.push(LIFESTYLE_TIPS[k]); });
  if (!tips.length) tips.push("Consistency beats any single product — give a new routine 4-6 weeks.");
  const tags = [];
  if (f.acne) tags.push("breakout-prone"); if (f.oily) tags.push("oily"); if (f.dry) tags.push("dry");
  if (f.sensitive) tags.push("sensitive"); if (f.dand) tags.push("flaky scalp"); if (f.hairfall) tags.push("thinning");
  return {
    profile: { type, tags: tags.slice(0, 3) },
    snapshot: buildSnapshot(category, f),
    summary: `Thanks for the detail.${dur} Here's a simple, ordered routine built around what you told me.`,
    routine: groups,
    products,
    lifestyle: tips.slice(0, 4),
    seeProfessional: flagPro ? proSentence(category) : "",
    language: "English"
  };
}

// ---- lead capture ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
app.post("/api/lead", (req, res) => {
  const b = req.body || {};
  const email = (b.email || "").toString().trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "invalid email" });
  if (!b.consent) return res.status(400).json({ ok: false, error: "consent required" });
  const lead = {
    at: new Date().toISOString(),
    category: b.category === "hair" ? "hair" : "face",
    name: (b.name || "").toString().slice(0, 80),
    email: email.slice(0, 160),
    profile: b.profile && b.profile.type ? String(b.profile.type).slice(0, 120) : "",
    tags: Array.isArray(b.tags) ? b.tags.slice(0, 6).map(String) : [],
    concerns: (b.concerns || "").toString().slice(0, 200),
    duration: (b.duration || "").toString().slice(0, 60),
    severity: (b.severity || "").toString().slice(0, 40),
    products: Array.isArray(b.products) ? b.products.slice(0, 10).map(String) : []
  };
  try {
    const leads = readLeads();
    leads.push(lead);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (e) {
    console.error("lead save:", e.message);
    return res.status(500).json({ ok: false });
  }
  res.json({ ok: true });
});

// ---- owner dashboard data (password protected) ----
app.get("/api/leads", (req, res) => {
  const key = req.headers["x-owner-key"] || req.query.key;
  if (key !== OWNER_PASSWORD) return res.status(401).json({ ok: false, error: "unauthorized" });
  const leads = readLeads();
  const byCategory = leads.reduce((a, l) => { a[l.category] = (a[l.category] || 0) + 1; return a; }, {});
  const tally = {};
  leads.forEach((l) => (l.concerns || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((c) => { tally[c] = (tally[c] || 0) + 1; }));
  const topConcerns = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
  res.json({ ok: true, total: leads.length, byCategory, topConcerns, leads: leads.slice().reverse() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Skin & Scalp Advisor — http://localhost:${PORT}`);
  console.log(`  Owner dashboard — http://localhost:${PORT}/owner.html`);
  if (API_KEY) { console.log(`  AI: on (Groq)\n  Text: ${TEXT_MODEL}\n  Vision: ${VISION_MODEL}\n`); }
  else { console.log(`  AI: off — running on the built-in safety net (set GROQ_API_KEY to enable AI)\n`); }
});// Skin & Scalp Advisor — backend
// Serves the app and runs the scan + detailed consultation via Groq.
// Key stays on the server. No user answers are stored.

const express = require("express");
const path = require("path");
const fs = require("fs");
const products = require("./data/products");

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    else if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
  }
}));

const API_KEY = process.env.GROQ_API_KEY;
const TEXT_MODEL = process.env.TEXT_MODEL || process.env.MODEL || "openai/gpt-oss-120b";
const VISION_MODEL = process.env.VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Leads are saved to a local JSON file. For a busy production app, swap this for a
// real database. Set OWNER_PASSWORD to protect the owner dashboard.
const LEADS_FILE = path.join(__dirname, "data", "leads.json");
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "dewleaf-admin";
function readLeads() { try { return JSON.parse(fs.readFileSync(LEADS_FILE, "utf8")); } catch { return []; } }

// ---- helpers ----
function byCategory(category) { return products.filter((p) => p.category === (category === "hair" ? "hair" : "face")); }
function find(id) { return products.find((p) => p.id === id); }
function catalogText(category) {
  return byCategory(category)
    .map((p) => `- id:${p.id} | ${p.name} | $${p.price} | role:${p.role} | suits:${p.skinTypes.join(",")} | helps:${p.concerns.join(",")} | key:${p.keyIngredient}`)
    .join("\n");
}
function safeParse(t) { const c = String(t).replace(/```json|```/g, "").trim(); try { return JSON.parse(c); } catch { return null; } }
async function callGroq(model, messages, extra = {}) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model, max_tokens: 1800, temperature: 0.5, response_format: { type: "json_object" }, messages, ...extra })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "Groq error");
  return data.choices?.[0]?.message?.content || "";
}
function hydrateGroups(rawGroups, category) {
  const pool = byCategory(category);
  const groups = (Array.isArray(rawGroups) ? rawGroups : []).map((g) => ({
    title: g.title || "Routine",
    steps: (Array.isArray(g.steps) ? g.steps : [])
      .map((s) => { const p = pool.find((x) => x.id === s.id); return p ? { step: s.step || "", note: s.note || "", product: p } : null; })
      .filter(Boolean)
  })).filter((g) => g.steps.length);
  const seen = new Set(); const flat = [];
  groups.forEach((g) => g.steps.forEach((s) => { if (!seen.has(s.product.id)) { seen.add(s.product.id); flat.push(s.product); } }));
  return { groups, products: flat };
}

// ---- concern flags ----
function flags(category, answers) {
  const t = [answers.type, answers.scalp, answers.concerns, answers.goal].filter(Boolean).join(" ").toLowerCase();
  return {
    oily: /oily|oil|greasy|shine/.test(t), dry: /dry|flaky|tight/.test(t),
    sensitive: /sensitive|redness|irritat/.test(t), combination: /combination/.test(t),
    acne: /acne|breakout|pimple|spot/.test(t), dark: /dark spot|pigment/.test(t),
    dull: /dull|glow|bright/.test(t), fine: /fine line|aging|wrinkle/.test(t),
    dand: /dandruff|flake/.test(t), itch: /itch/.test(t), frizz: /frizz/.test(t),
    hairfall: /hair fall|thinning|shed|breakage/.test(t), volume: /volume|flat|limp/.test(t)
  };
}

// ---- cosmetic snapshot (friendly, not medical) ----
function buildSnapshot(category, f) {
  if (category === "hair") {
    return [
      { label: "Moisture", value: f.dry || f.frizz ? 30 : f.oily ? 58 : 52 },
      { label: "Scalp oil", value: f.oily ? 80 : f.dry ? 28 : 50 },
      { label: "Sensitivity", value: f.sensitive || f.itch ? 72 : 34 }
    ];
  }
  return [
    { label: "Hydration", value: f.dry ? 28 : f.oily ? 56 : f.sensitive ? 50 : 55 },
    { label: "Oil level", value: f.oily ? 82 : f.dry ? 22 : f.combination ? 62 : 48 },
    { label: "Sensitivity", value: f.sensitive ? 76 : 34 }
  ];
}

// ---- rule-based routine (fallback) ----
function buildRoutine(category, f) {
  if (category === "hair") {
    const shampoo = f.oily || f.dand ? "sham-dandruff" : "sham-hydrate";
    const cond = f.frizz || f.dry ? "cond-smooth" : "cond-volume";
    const leavein = f.hairfall ? "oil-strength" : f.itch || f.sensitive ? "treat-soothe" : f.oily ? "serum-scalp" : "oil-strength";
    return [
      { title: "In the shower", steps: [{ id: shampoo, step: "Cleanse scalp" }, { id: cond, step: "Condition lengths" }] },
      { title: "Between washes", steps: [{ id: leavein, step: "Treat & nourish" }] }
    ];
  }
  const cleanser = f.oily || f.acne ? "cleanse-gel" : "cleanse-cream";
  const amSerum = f.dark || f.dull ? "serum-vitc" : f.oily || f.acne ? "serum-niacinamide" : "serum-hydra";
  const pmSerum = f.fine ? "serum-retinol" : amSerum;
  const amMoist = f.sensitive ? "moist-calm" : "moist-light";
  const pmMoist = f.dry ? "moist-rich" : f.sensitive ? "moist-calm" : "moist-light";
  const mask = f.oily || f.acne ? "mask-clay" : f.sensitive || f.dry ? "mask-oat" : null;
  const groups = [
    { title: "Morning", steps: [{ id: cleanser, step: "Cleanse" }, { id: amSerum, step: "Treat" }, { id: amMoist, step: "Moisturise" }, { id: "spf-daily", step: "Protect" }] },
    { title: "Evening", steps: [{ id: cleanser, step: "Cleanse" }, { id: pmSerum, step: "Treat" }, { id: pmMoist, step: "Moisturise" }] }
  ];
  if (mask) groups.push({ title: "Once or twice a week", steps: [{ id: mask, step: "Mask" }] });
  return groups;
}

const LIFESTYLE_TIPS = {
  lowwater: "Sip more water through the day — hydration shows on skin and scalp.",
  poorsleep: "Protect your sleep; skin does most of its repair overnight.",
  stress: "Stress can worsen flare-ups — short daily wind-downs really help.",
  diet: "Easing off sugar and dairy can calm breakouts for some people.",
  sun: "Daily SPF is the simplest anti-aging and dark-spot step there is.",
  hardwater: "Hard water can dry the scalp — a clarifying wash now and then helps.",
  lowprotein: "Hair is built from protein; steady protein supports stronger strands.",
  heat: "Give heat styling a rest day or two a week and use a heat protectant."
};

function proSentence(category) {
  return category === "hair"
    ? "Because this has been going on a while, it's worth seeing a dermatologist or trichologist to find the root cause — this routine will still support things in the meantime."
    : "Since this has been going on a while, it's worth checking in with a dermatologist — they can look deeper than any routine can. These steps still help day to day.";
}

// ---- chat (kept for completeness) ----
app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const category = req.body.category === "hair" ? "hair" : "face";
  try {
    if (!API_KEY) return res.json(fallbackChat(messages, category));
    const thing = category === "hair" ? "scalp & hair" : "skin";
    const system = `You are "Dew", a warm ${thing} advisor for Dewleaf. Only recommend from the CATALOG. If unsure of type/concern, ask ONE short question. Otherwise recommend 2-3 with one short reason each. Reply ONLY as JSON: {"reply": string, "recommend": [id,...]}.\nCATALOG:\n${catalogText(category)}`;
    const text = await callGroq(TEXT_MODEL, [{ role: "system", content: system }, ...messages]);
    const p = safeParse(text) || { reply: text, recommend: [] };
    return res.json({ reply: p.reply || "", products: (p.recommend || []).map(find).filter((x) => x && x.category === category) });
  } catch (e) { console.error("chat:", e.message); return res.json(fallbackChat(messages, category)); }
});
function fallbackChat(messages, category) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const f = flags(category, { concerns: last && typeof last.content === "string" ? last.content : "" });
  const { products } = hydrateGroups(buildRoutine(category, f), category);
  return { reply: "Here are a few that fit what you described:", products: products.slice(0, 3) };
}

// ---- scan (vision, optional) ----
app.post("/api/analyze", async (req, res) => {
  const category = req.body.category === "hair" ? "hair" : "face";
  const image = req.body.image;
  const thing = category === "hair" ? "scalp and hair" : "facial skin";
  if (!API_KEY || !image) return res.json({ needInput: true, category });
  try {
    const system = `You are a friendly COSMETIC ${thing} analysis assistant for Dewleaf. Give a light, encouraging read. NOT a medical diagnosis — never name conditions, use everyday words. Reply ONLY as JSON: {"profile": {"type": "short label", "observations": ["short tag", ...]}}`;
    const text = await callGroq(VISION_MODEL, [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: `Quick cosmetic read of my ${thing} from this photo as JSON.` }, { type: "image_url", image_url: { url: image } }] }
    ], { temperature: 0.4 });
    const p = safeParse(text);
    if (!p || !p.profile) return res.json({ needInput: true, category });
    return res.json({ profile: p.profile, category });
  } catch (e) { console.error("analyze:", e.message); return res.json({ needInput: true, category, note: "vision_unavailable" }); }
});

// ---- detailed consultation ----
app.post("/api/consult", async (req, res) => {
  const category = req.body.category === "hair" ? "hair" : "face";
  const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const detected = req.body.detected || null;
  const language = (req.body.language || "English").toString().slice(0, 30);
  const f = flags(category, answers);
  const thing = category === "hair" ? "scalp & hair" : "skin";

  const longstanding = /year|years/i.test(answers.duration || "");
  const significant = /significant|severe/i.test(answers.severity || "");
  const flagPro = (longstanding && significant) || (f.hairfall && longstanding);

  try {
    if (!API_KEY) return res.json(fallbackConsult(category, answers, detected, f, flagPro));
    const groupNames = category === "hair" ? `"In the shower" and "Between washes"` : `"Morning" and "Evening" (add a weekly group if useful)`;
    const system = `You are "Dew", a warm, knowledgeable COSMETIC ${thing} consultant for Dewleaf.
Use the customer's intake answers to write a caring, personal consultation and an ordered routine from the CATALOG.

RULES:
- COSMETIC product guidance only — NOT medical advice or diagnosis. Never name diseases, never claim to treat/cure. Everyday language.
- If the concern is long-standing (a year+) and significant, OR involves notable hair loss, set "seeProfessional" to a short kind sentence suggesting a dermatologist/trichologist.
- Reference their actual answers so it feels personal.
- Build the routine as ordered groups: ${groupNames}. Each step uses a product id from the CATALOG and a short step word (e.g. "Cleanse", "Treat", "Protect"). Never invent products.
- "snapshot" = 3 cosmetic bars (0-100) summarising their ${thing} (friendly, not clinical).
- Give 2-4 short lifestyle tips relevant to their answers.
- Write ALL text fields in ${language}.
- Reply ONLY as JSON, no markdown:
{
 "profile": {"type": "short label", "tags": ["tag","tag"]},
 "snapshot": [{"label":"...","value":0-100}, ...3],
 "summary": "2-3 warm personal sentences",
 "routine": [{"title":"...","steps":[{"id":"product-id","step":"Cleanse","note":"optional short note"}]}],
 "lifestyle": ["tip","tip"],
 "seeProfessional": ""
}
CATALOG:
${catalogText(category)}`;
    const userMsg = `Intake (${thing}):\n${JSON.stringify(answers, null, 2)}${detected ? `\nPhoto read: ${JSON.stringify(detected)}` : ""}`;
    const text = await callGroq(TEXT_MODEL, [{ role: "system", content: system }, { role: "user", content: userMsg }], { max_tokens: 2000 });
    const p = safeParse(text);
    if (!p) return res.json(fallbackConsult(category, answers, detected, f, flagPro));
    const { groups, products: flat } = hydrateGroups(p.routine, category);
    const safeGroups = groups.length ? groups : hydrateGroups(buildRoutine(category, f), category).groups;
    return res.json({
      profile: p.profile || null,
      snapshot: Array.isArray(p.snapshot) && p.snapshot.length ? p.snapshot : buildSnapshot(category, f),
      summary: p.summary || "",
      routine: safeGroups,
      products: flat.length ? flat : hydrateGroups(buildRoutine(category, f), category).products,
      lifestyle: Array.isArray(p.lifestyle) ? p.lifestyle : [],
      seeProfessional: p.seeProfessional || (flagPro ? proSentence(category) : ""),
      language
    });
  } catch (e) { console.error("consult:", e.message); return res.json(fallbackConsult(category, answers, detected, f, flagPro)); }
});

function fallbackConsult(category, answers, detected, f, flagPro) {
  const { groups, products } = hydrateGroups(buildRoutine(category, f), category);
  const type = detected && detected.type ? detected.type : answers.type || answers.scalp || "Your profile";
  const dur = answers.duration ? ` You mentioned it's been going on ${answers.duration.toLowerCase()}.` : "";
  const tips = [];
  (answers.lifestyleKeys || []).forEach((k) => { if (LIFESTYLE_TIPS[k]) tips.push(LIFESTYLE_TIPS[k]); });
  if (!tips.length) tips.push("Consistency beats any single product — give a new routine 4-6 weeks.");
  const tags = [];
  if (f.acne) tags.push("breakout-prone"); if (f.oily) tags.push("oily"); if (f.dry) tags.push("dry");
  if (f.sensitive) tags.push("sensitive"); if (f.dand) tags.push("flaky scalp"); if (f.hairfall) tags.push("thinning");
  return {
    profile: { type, tags: tags.slice(0, 3) },
    snapshot: buildSnapshot(category, f),
    summary: `Thanks for the detail.${dur} Here's a simple, ordered routine built around what you told me.`,
    routine: groups,
    products,
    lifestyle: tips.slice(0, 4),
    seeProfessional: flagPro ? proSentence(category) : "",
    language: "English"
  };
}

// ---- lead capture ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
app.post("/api/lead", (req, res) => {
  const b = req.body || {};
  const email = (b.email || "").toString().trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "invalid email" });
  if (!b.consent) return res.status(400).json({ ok: false, error: "consent required" });
  const lead = {
    at: new Date().toISOString(),
    category: b.category === "hair" ? "hair" : "face",
    name: (b.name || "").toString().slice(0, 80),
    email: email.slice(0, 160),
    profile: b.profile && b.profile.type ? String(b.profile.type).slice(0, 120) : "",
    tags: Array.isArray(b.tags) ? b.tags.slice(0, 6).map(String) : [],
    concerns: (b.concerns || "").toString().slice(0, 200),
    duration: (b.duration || "").toString().slice(0, 60),
    severity: (b.severity || "").toString().slice(0, 40),
    products: Array.isArray(b.products) ? b.products.slice(0, 10).map(String) : []
  };
  try {
    const leads = readLeads();
    leads.push(lead);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (e) {
    console.error("lead save:", e.message);
    return res.status(500).json({ ok: false });
  }
  res.json({ ok: true });
});

// ---- owner dashboard data (password protected) ----
app.get("/api/leads", (req, res) => {
  const key = req.headers["x-owner-key"] || req.query.key;
  if (key !== OWNER_PASSWORD) return res.status(401).json({ ok: false, error: "unauthorized" });
  const leads = readLeads();
  const byCategory = leads.reduce((a, l) => { a[l.category] = (a[l.category] || 0) + 1; return a; }, {});
  const tally = {};
  leads.forEach((l) => (l.concerns || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((c) => { tally[c] = (tally[c] || 0) + 1; }));
  const topConcerns = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);
  res.json({ ok: true, total: leads.length, byCategory, topConcerns, leads: leads.slice().reverse() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Skin & Scalp Advisor — http://localhost:${PORT}`);
  console.log(`  Owner dashboard — http://localhost:${PORT}/owner.html`);
  if (API_KEY) { console.log(`  AI: on (Groq)\n  Text: ${TEXT_MODEL}\n  Vision: ${VISION_MODEL}\n`); }
  else { console.log(`  AI: off — running on the built-in safety net (set GROQ_API_KEY to enable AI)\n`); }
});