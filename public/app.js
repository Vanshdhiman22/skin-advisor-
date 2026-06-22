// Skin & Scalp Advisor — frontend.
(function () {
  const $ = (id) => document.getElementById(id);
  const views = {
    home: $("view-home"), scan: $("view-scan"), intake: $("view-intake"),
    loading: $("view-loading"), result: $("view-result")
  };
  const cartCountEl = $("cart-count");
  const toast = $("toast");

  let category = "face", answers = {}, detected = null, language = "English";
  let questions = [], stepIndex = 0, multi = new Set();
  let cart = 0, stream = null, cameraReady = false, busy = false, lastResultData = null;

  const QUESTIONS = {
    face: [
      { key: "type", type: "single", q: "What's your skin like most days?", options: ["Oily", "Dry", "Combination", "Sensitive", "Not sure"] },
      { key: "concerns", type: "multi", q: "What would you like to work on?", help: "Pick all that apply.",
        options: ["Acne / breakouts", "Excess oil", "Dryness", "Redness / sensitivity", "Dark spots", "Fine lines", "Dullness", "Large pores"] },
      { key: "duration", type: "single", q: "How long has this been going on?", options: ["Just started (under a month)", "A few months", "About a year", "Several years"] },
      { key: "severity", type: "single", q: "How would you describe it right now?", options: ["Mild", "Moderate", "Significant"] },
      { key: "family", type: "single", q: "Does it tend to run in your family?", help: "Some skin tendencies are hereditary — this helps tailor advice.", options: ["Yes", "No", "Not sure"] },
      { key: "routine", type: "single", q: "What does your current routine look like?", options: ["Nothing yet", "Just cleanse & moisturise", "A few products", "A full routine"] },
      { key: "lifestyle", type: "multi", storeKeys: true, q: "Any of these sound like you?", help: "Optional — pick any that apply.",
        options: [{ label: "Low water intake", value: "lowwater" }, { label: "Poor sleep", value: "poorsleep" }, { label: "High stress", value: "stress" }, { label: "Lots of sugar / dairy", value: "diet" }, { label: "Lots of sun exposure", value: "sun" }] },
      { key: "allergies", type: "text", q: "Anything that irritates your skin?", help: "Allergies or ingredients to avoid — or just write 'none'.", placeholder: "e.g. fragrance, or 'none'" },
      { key: "goal", type: "single", q: "What's your main goal?", options: ["Clear breakouts", "Calm & soothe", "Brighten & even tone", "Smooth fine lines", "A simple daily routine"] }
    ],
    hair: [
      { key: "scalp", type: "single", q: "What's your scalp like?", options: ["Oily", "Dry", "Sensitive", "Normal", "Not sure"] },
      { key: "concerns", type: "multi", q: "What would you like to work on?", help: "Pick all that apply.",
        options: ["Dandruff / flakes", "Hair fall / thinning", "Itchy scalp", "Frizz / dryness", "Oily roots", "Dullness", "Lack of volume"] },
      { key: "duration", type: "single", q: "How long has this been going on?", options: ["Just started (under a month)", "A few months", "About a year", "Several years"] },
      { key: "severity", type: "single", q: "How noticeable is it right now?", options: ["Mild", "Moderate", "Significant"] },
      { key: "family", type: "single", q: "Does hair thinning run in your family?", help: "This helps us set the right expectations.", options: ["Yes", "No", "Not sure"] },
      { key: "washing", type: "single", q: "How often do you wash your hair?", options: ["Daily", "Every 2-3 days", "Twice a week", "Weekly"] },
      { key: "treatments", type: "single", q: "Do you heat-style or chemically treat your hair?", help: "Colouring, straightening, frequent heat, etc.", options: ["Often", "Sometimes", "Rarely"] },
      { key: "lifestyle", type: "multi", storeKeys: true, q: "Any of these sound like you?", help: "Optional — pick any that apply.",
        options: [{ label: "High stress", value: "stress" }, { label: "Poor sleep", value: "poorsleep" }, { label: "Low-protein diet", value: "lowprotein" }, { label: "Hard water", value: "hardwater" }] },
      { key: "goal", type: "single", q: "What's your main goal?", options: ["Stop the flakes", "Reduce hair fall", "Add moisture & shine", "Add volume", "A simple care routine"] }
    ]
  };

  // ---- helpers ----
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function show(name) { Object.values(views).forEach((v) => (v.hidden = true)); views[name].hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); }
  function showToast(t) { toast.textContent = t; toast.classList.add("show"); clearTimeout(showToast._t); showToast._t = setTimeout(() => toast.classList.remove("show"), 1800); }
  function optLabel(o) { return typeof o === "string" ? o : o.label; }
  function optValue(o) { return typeof o === "string" ? o : o.value; }

  function stepCard(product, stepLabel) {
    const card = el("div", "rec");
    const sw = el("div", "rec-swatch");
    sw.style.background = `linear-gradient(145deg, ${product.gradient[0]}, ${product.gradient[1]})`;
    const body = el("div", "rec-body");
    if (stepLabel) body.appendChild(el("span", "rec-step", stepLabel));
    const name = el("div", "rec-name");
    name.appendChild(el("span", null, product.name));
    name.appendChild(el("span", "rec-price", "$" + product.price));
    body.appendChild(name);
    body.appendChild(el("div", "rec-why", product.blurb));
    if (product.keyIngredient) {
      const toggle = el("button", "ingredient-toggle", "Why it works ▾"); toggle.type = "button";
      const detail = el("div", "ingredient-detail");
      detail.appendChild(el("strong", null, product.keyIngredient + " — "));
      detail.appendChild(document.createTextNode(product.ingredientNote || ""));
      detail.hidden = true;
      toggle.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        toggle.textContent = detail.hidden ? "Why it works ▾" : "Why it works ▴";
      });
      body.appendChild(toggle); body.appendChild(detail);
    }
    const add = el("button", "rec-add", "Add"); add.type = "button";
    add.addEventListener("click", () => {
      cart += 1; cartCountEl.textContent = String(cart);
      add.textContent = "Added"; add.classList.add("added");
      showToast(product.name + " added to cart");
    });
    card.appendChild(sw); card.appendChild(body); card.appendChild(add);
    return card;
  }

  // ---- camera ----
  async function startCamera() {
    const msg = $("camera-msg"); msg.hidden = true; cameraReady = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const v = $("video"); v.srcObject = stream; await v.play(); cameraReady = true;
    } catch (e) {
      msg.hidden = false; msg.textContent = "Camera isn't available — no problem, tap below to continue with the questions.";
      $("capture-btn").textContent = "Continue to questions";
    }
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } cameraReady = false; }
  function captureFrame() {
    const v = $("video"), c = $("canvas"), maxW = 640, scale = Math.min(1, maxW / (v.videoWidth || maxW));
    c.width = (v.videoWidth || maxW) * scale; c.height = (v.videoHeight || maxW * 0.75) * scale;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }

  // ---- flow ----
  function openCategory(cat) {
    category = cat; answers = {}; detected = null;
    language = $("lang") ? $("lang").value : "English";
    $("capture-btn").textContent = "Scan & continue";
    show("scan"); startCamera();
  }
  async function analyzeAndContinue(image) {
    if (busy) return; busy = true;
    const btn = $("capture-btn"), cam = document.querySelector(".camera");
    if (btn) { btn.disabled = true; btn.textContent = "Analysing…"; }
    if (cam) cam.classList.add("scanning");
    const minDelay = new Promise((r) => setTimeout(r, 1100));
    try {
      if (image) {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, category }) });
        const data = await res.json();
        if (data && data.profile) detected = data.profile;
      }
    } catch (e) {}
    await minDelay;
    if (cam) cam.classList.remove("scanning");
    if (btn) { btn.disabled = false; btn.textContent = "Scan & continue"; }
    busy = false;
    stopCamera(); startIntake();
  }

  function runScan() {
    let image = null;
    if (cameraReady) { try { image = captureFrame(); } catch (e) { image = null; } }
    analyzeAndContinue(image);
  }

  // read an uploaded image file, downscale it, return a small jpeg data URL
  function fileToDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800, scale = Math.min(1, maxW / img.width);
        const c = $("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }
  function startIntake() { questions = QUESTIONS[category]; stepIndex = 0; show("intake"); renderStep(); }

  function renderStep() {
    const q = questions[stepIndex]; multi = new Set();
    $("progress-bar").style.width = ((stepIndex + 1) / questions.length) * 100 + "%";
    $("step-count").textContent = `Question ${stepIndex + 1} of ${questions.length}`;
    $("step-q").textContent = q.q;
    const help = $("step-help");
    if (q.help) { help.hidden = false; help.textContent = q.help; } else help.hidden = true;
    const opts = $("step-options"), input = $("step-input"), next = $("step-next");
    opts.innerHTML = ""; input.hidden = true; next.hidden = true;

    if (q.type === "text") {
      input.hidden = false; input.value = answers[q.key] || ""; input.placeholder = q.placeholder || "Type your answer…";
      next.hidden = false; next.textContent = "Next"; input.focus();
      next.onclick = () => { answers[q.key] = input.value.trim(); advance(); };
      return;
    }
    q.options.forEach((o) => {
      const row = el("button", "opt", null); row.type = "button";
      row.appendChild(el("span", null, optLabel(o))); row.appendChild(el("span", "opt-check"));
      if (q.type === "single") row.addEventListener("click", () => { answers[q.key] = optLabel(o); advance(); });
      else row.addEventListener("click", () => {
        const v = optValue(o);
        if (multi.has(v)) { multi.delete(v); row.classList.remove("selected"); }
        else { multi.add(v); row.classList.add("selected"); }
        next.hidden = multi.size === 0;
      });
      opts.appendChild(row);
    });
    if (q.type === "multi") {
      next.textContent = "Next";
      next.onclick = () => {
        const chosen = q.options.filter((o) => multi.has(optValue(o)));
        answers[q.key] = chosen.map(optLabel).join(", ");
        if (q.storeKeys) answers.lifestyleKeys = chosen.map(optValue);
        advance();
      };
    }
  }
  function advance() { if (stepIndex < questions.length - 1) { stepIndex++; renderStep(); } else submitConsult(); }
  function stepBack() { if (stepIndex > 0) { stepIndex--; renderStep(); } else show("home"); }

  async function submitConsult() {
    show("loading");
    let data = null;
    try {
      const res = await fetch("/api/consult", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, answers, detected, language }) });
      data = await res.json();
    } catch (e) {}
    if (!data) data = { summary: "Here's a simple routine to start with.", routine: [], lifestyle: [], snapshot: [] };
    renderResult(data);
  }

  function renderResult(data) {
    cart = 0; cartCountEl.textContent = "0";
    lastResultData = data;
    resetLead();
    const profile = $("profile");
    if (data.profile && (data.profile.type || (data.profile.tags || []).length)) {
      profile.hidden = false;
      $("profile-eyebrow").textContent = category === "hair" ? "Your scalp & hair" : "Your skin";
      $("profile-type").textContent = data.profile.type || "";
      const tags = $("profile-tags"); tags.innerHTML = "";
      (data.profile.tags || []).forEach((t) => tags.appendChild(el("span", "tag", t)));
    } else profile.hidden = true;

    const snap = $("snapshot");
    if (Array.isArray(data.snapshot) && data.snapshot.length) {
      snap.hidden = false;
      $("snapshot-h").textContent = category === "hair" ? "Your scalp snapshot" : "Your skin snapshot";
      const bars = $("bars"); bars.innerHTML = "";
      data.snapshot.forEach((b) => {
        const row = el("div", "bar-row");
        row.appendChild(el("span", "bar-label", b.label));
        const track = el("div", "bar-track");
        const fill = el("div", "bar-fill");
        fill.style.width = Math.max(0, Math.min(100, b.value || 0)) + "%";
        track.appendChild(fill); row.appendChild(track);
        bars.appendChild(row);
      });
    } else snap.hidden = true;

    $("result-summary").textContent = data.summary || "";
    const pro = $("pro-note");
    if (data.seeProfessional) { pro.hidden = false; pro.textContent = data.seeProfessional; } else pro.hidden = true;

    const routine = $("routine"); routine.innerHTML = "";
    (data.routine || []).forEach((g) => {
      const block = el("div", "routine-group");
      block.appendChild(el("h4", "routine-title", g.title));
      const steps = el("div", "recs");
      (g.steps || []).forEach((s) => steps.appendChild(stepCard(s.product, s.step)));
      block.appendChild(steps);
      routine.appendChild(block);
    });

    const life = $("lifestyle"), list = $("lifestyle-list");
    if (data.lifestyle && data.lifestyle.length) { life.hidden = false; list.innerHTML = ""; data.lifestyle.forEach((t) => list.appendChild(el("li", null, t))); }
    else life.hidden = true;

    show("result");
  }

  // ---- lead capture ----
  function resetLead() {
    const form = $("lead-form"); if (!form) return;
    form.hidden = false; $("lead-done").hidden = true; $("lead-error").hidden = true;
    $("lead-name").value = ""; $("lead-email").value = ""; $("lead-consent").checked = false;
    const b = $("lead-submit"); b.disabled = false; b.textContent = "Save my routine";
  }
  async function submitLead() {
    const email = $("lead-email").value.trim();
    const consent = $("lead-consent").checked;
    const err = $("lead-error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.hidden = false; err.textContent = "Please enter a valid email."; return; }
    if (!consent) { err.hidden = false; err.textContent = "Please tick the box so we can save your routine."; return; }
    err.hidden = true;
    const btn = $("lead-submit"); btn.disabled = true; btn.textContent = "Saving…";
    const names = [];
    ((lastResultData && lastResultData.routine) || []).forEach((g) => (g.steps || []).forEach((s) => { if (!names.includes(s.product.name)) names.push(s.product.name); }));
    const payload = {
      category, name: $("lead-name").value.trim(), email, consent: true,
      profile: (lastResultData && lastResultData.profile) || null,
      tags: (lastResultData && lastResultData.profile && lastResultData.profile.tags) || [],
      concerns: answers.concerns || answers.scalp || "",
      duration: answers.duration || "", severity: answers.severity || "",
      products: names
    };
    try {
      const res = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.ok) { $("lead-form").hidden = true; $("lead-done").hidden = false; }
      else { err.hidden = false; err.textContent = "Something went wrong — please try again."; btn.disabled = false; btn.textContent = "Save my routine"; }
    } catch (e) {
      err.hidden = false; err.textContent = "Couldn't save — check your connection."; btn.disabled = false; btn.textContent = "Save my routine";
    }
  }

  // ---- wire up ----
  document.querySelectorAll(".choice").forEach((c) => c.addEventListener("click", () => openCategory(c.dataset.category)));
  $("capture-btn").addEventListener("click", runScan);
  $("upload-photo").addEventListener("click", () => { if (!busy) $("upload-input").click(); });
  $("upload-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || busy) return;
    fileToDataURL(file, (dataURL) => { if (dataURL) analyzeAndContinue(dataURL); else { stopCamera(); startIntake(); } });
  });
  $("skip-scan").addEventListener("click", () => { stopCamera(); startIntake(); });
  $("scan-back").addEventListener("click", () => { stopCamera(); show("home"); });
  $("intake-back").addEventListener("click", stepBack);
  $("result-back").addEventListener("click", () => show("home"));
  $("save-pdf").addEventListener("click", () => window.print());
  $("lead-submit").addEventListener("click", submitLead);

  show("home");
})();