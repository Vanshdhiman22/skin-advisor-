// Skin & Scalp Advisor — frontend.
(function () {
  const $ = (id) => document.getElementById(id);
  const views = {
    home: $("view-home"), scan: $("view-scan"), intake: $("view-intake"),
    loading: $("view-loading"), result: $("view-result")
  };
  const cartCountEl = $("cart-count");
  const toast = $("toast");

  let category = "face", answers = {}, language = "English";
  let questions = [], stepIndex = 0, multi = new Set();
  let cart = 0, busy = false, lastResultData = null, scanImage = null;

  const QUESTIONS = {
    face: [
      { key: "name", type: "text", q: "First, what should we call you?", placeholder: "Your name", validate: /^[A-Za-z][A-Za-z .'-]{1,40}$/ },
      { key: "age", type: "single", q: "How old are you?", options: ["Under 18", "18–25", "26–34", "35–44", "45+"] },
      { key: "condition", type: "single", q: "What best describes your main skin concern?",
        options: ["Acne / breakouts", "Dryness & flaking", "Oiliness & shine", "Redness & sensitivity", "Dark spots & uneven tone", "Fine lines & ageing", "Just want a good routine"] },
      { key: "type", type: "single", q: "What's your skin like most days?", options: ["Oily", "Dry", "Combination", "Sensitive", "Not sure"] },
      { key: "concerns", type: "multi", q: "What would you like to work on?", help: "Pick all that apply.",
        options: ["Acne / breakouts", "Excess oil", "Dryness", "Redness / sensitivity", "Dark spots", "Fine lines", "Dullness", "Large pores"] },
      { key: "duration", type: "single", q: "How long has this been going on?", options: ["Just started (under a month)", "A few months", "About a year", "Several years"] },
      { key: "severity", type: "single", q: "How would you describe it right now?", options: ["Mild", "Moderate", "Significant"] },
      { key: "family", type: "single", q: "Does it tend to run in your family?", help: "Some skin tendencies are hereditary — this helps tailor advice.", options: ["Yes", "No", "Not sure"] },
      { key: "routine", type: "single", q: "What does your current routine look like?", options: ["Nothing yet", "Just cleanse & moisturise", "A few products", "A full routine"] },
      { key: "lifestyle", type: "multi", storeKeys: true, optional: true, q: "Any of these sound like you?", help: "Optional — pick any that apply.",
        options: [{ label: "Low water intake", value: "lowwater" }, { label: "Poor sleep", value: "poorsleep" }, { label: "High stress", value: "stress" }, { label: "Lots of sugar / dairy", value: "diet" }, { label: "Lots of sun exposure", value: "sun" }] },
      { key: "allergies", type: "multi", optional: true, q: "Anything that irritates your skin?", help: "Pick any that apply — or tap Next to skip.",
        options: ["Fragrance", "Alcohol / drying ingredients", "Strong actives (acids, retinol)", "Sensitive to many products", "Nothing I know of"] },
      { key: "goal", type: "single", q: "What's your main goal?", options: ["Clear breakouts", "Calm & soothe", "Brighten & even tone", "Smooth fine lines", "A simple daily routine"] }
    ],
    hair: [
      { key: "name", type: "text", q: "First, what should we call you?", placeholder: "Your name", validate: /^[A-Za-z][A-Za-z .'-]{1,40}$/ },
      { key: "age", type: "single", q: "How old are you?", options: ["Under 18", "18–25", "26–34", "35–44", "45+"] },
      { key: "condition", type: "single", q: "What best describes your main scalp/hair concern?",
        options: ["Dandruff & flakes", "Hair fall / thinning", "Dry & frizzy", "Oily scalp", "Itchy / irritated scalp", "Dull, lifeless hair", "Just want a good routine"] },
      { key: "scalp", type: "single", q: "What's your scalp like?", options: ["Oily", "Dry", "Sensitive", "Normal", "Not sure"] },
      { key: "concerns", type: "multi", q: "What would you like to work on?", help: "Pick all that apply.",
        options: ["Dandruff / flakes", "Hair fall / thinning", "Itchy scalp", "Frizz / dryness", "Oily roots", "Dullness", "Lack of volume"] },
      { key: "duration", type: "single", q: "How long has this been going on?", options: ["Just started (under a month)", "A few months", "About a year", "Several years"] },
      { key: "severity", type: "single", q: "How noticeable is it right now?", options: ["Mild", "Moderate", "Significant"] },
      { key: "family", type: "single", q: "Does hair thinning run in your family?", help: "This helps us set the right expectations.", options: ["Yes", "No", "Not sure"] },
      { key: "washing", type: "single", q: "How often do you wash your hair?", options: ["Daily", "Every 2-3 days", "Twice a week", "Weekly"] },
      { key: "treatments", type: "single", q: "Do you heat-style or chemically treat your hair?", help: "Colouring, straightening, frequent heat, etc.", options: ["Often", "Sometimes", "Rarely"] },
      { key: "lifestyle", type: "multi", storeKeys: true, optional: true, q: "Any of these sound like you?", help: "Optional — pick any that apply.",
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

  // simple, self-contained product illustrations (bottle / dropper / jar / tube) per role
  function productArt(role) {
    const map = { cleanser: "tube", shampoo: "bottle", conditioner: "bottle", "serum-am": "dropper", "treatment-pm": "dropper", leavein: "dropper", oil: "dropper", moisturizer: "jar", "moisturizer-pm": "jar", mask: "jar", spf: "tube" };
    const shapes = {
      bottle: '<rect x="8" y="9" width="8" height="11" rx="2"/><rect x="9.5" y="4.5" width="5" height="4.5" rx="1.2"/>',
      dropper: '<rect x="8.5" y="11" width="7" height="9" rx="2"/><rect x="11.2" y="3.6" width="1.6" height="6" rx="0.8"/><circle cx="12" cy="3.3" r="1.5"/>',
      jar: '<rect x="6" y="11" width="12" height="9" rx="2.5"/><rect x="7.2" y="7.5" width="9.6" height="3.6" rx="1.4"/>',
      tube: '<rect x="9" y="8.5" width="6" height="11.5" rx="3"/><rect x="10" y="4.8" width="4" height="3.7" rx="1"/>'
    };
    return '<svg viewBox="0 0 24 24" width="30" height="30" fill="rgba(255,255,255,0.95)" xmlns="http://www.w3.org/2000/svg">' + (shapes[map[role]] || shapes.jar) + "</svg>";
  }

  function stepCard(product, stepLabel) {
    const card = el("div", "rec");
    const sw = el("div", "rec-swatch");
    sw.style.background = `linear-gradient(145deg, ${product.gradient[0]}, ${product.gradient[1]})`;
    if (product.image) { sw.style.backgroundImage = `url("${product.image}")`; sw.style.backgroundSize = "cover"; sw.style.backgroundPosition = "center"; }
    else { sw.innerHTML = productArt(product.role); }
    const body = el("div", "rec-body");
    if (stepLabel) body.appendChild(el("span", "rec-step", stepLabel));
    const name = el("div", "rec-name");
    name.appendChild(el("span", null, product.name));
    name.appendChild(el("span", "rec-price", inr(product.price)));
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

  // ---- flow ----
  function openCategory(cat) {
    category = cat; answers = {}; scanImage = null;
    language = $("lang") ? $("lang").value : "English";
    startIntake();
  }

  // show the optional photo step
  function showPhotoStep() {
    scanImage = null;
    $("upload-preview").hidden = true; $("upload-preview").removeAttribute("src");
    $("upload-placeholder").hidden = false;
    show("scan");
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
      next.textContent = "Next";
      const ok = (val) => { const v = (val || "").trim(); return q.validate ? q.validate.test(v) : !!v; };
      next.hidden = !ok(input.value);
      input.oninput = () => { next.hidden = !ok(input.value); };
      input.focus();
      next.onclick = () => { const v = input.value.trim(); if (!ok(v)) return; answers[q.key] = v; advance(); };
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
        if (!q.optional) next.hidden = multi.size === 0;
      });
      opts.appendChild(row);
    });
    if (q.type === "multi") {
      next.textContent = "Next";
      next.hidden = q.optional ? false : true; // required concerns need a pick; optional lifestyle can be skipped
      next.onclick = () => {
        const chosen = q.options.filter((o) => multi.has(optValue(o)));
        answers[q.key] = chosen.map(optLabel).join(", ");
        if (q.storeKeys) answers.lifestyleKeys = chosen.map(optValue);
        advance();
      };
    }
  }
  function advance() {
    if (stepIndex < questions.length - 1) { stepIndex++; renderStep(); }
    else { showPhotoStep(); }
  }
  function stepBack() { if (stepIndex > 0) { stepIndex--; renderStep(); } else show("home"); }

  async function submitConsult() {
    show("loading");
    let data = null;
    try {
      const res = await fetch("/api/consult", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, answers, language }) });
      data = await res.json();
    } catch (e) {}
    if (!data) data = { summary: "Here's a simple routine to start with.", routine: [], lifestyle: [], snapshot: [] };
    renderResult(data);
  }

  function renderResult(data) {
    cart = 0; cartCountEl.textContent = "0";
    lastResultData = data;
    resetLead();
    const verdictEl = $("verdict");
    const v = data.verdict;
    if (v && v.stage && v.label) {
      verdictEl.hidden = false;
      $("verdict-title").textContent = `${v.label} — Stage ${v.stage} of ${v.stageMax}`;
      $("verdict-fill").style.width = Math.round((v.stage / v.stageMax) * 100) + "%";
      $("verdict-meta").textContent = `Severity: ${v.level}`;
    } else verdictEl.hidden = true;
    const profile = $("profile");
    const photo = $("profile-photo");
    if (data.profile && (data.profile.type || (data.profile.tags || []).length)) {
      profile.hidden = false;
      $("profile-eyebrow").textContent = category === "hair" ? "Your scalp & hair" : "Your skin";
      $("profile-type").textContent = data.profile.type || "";
      const tags = $("profile-tags"); tags.innerHTML = "";
      (data.profile.tags || []).forEach((t) => tags.appendChild(el("span", "tag", t)));
      if (scanImage) { photo.src = scanImage; photo.hidden = false; }
      else { photo.hidden = true; photo.removeAttribute("src"); }
    } else { profile.hidden = true; photo.hidden = true; }

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

    renderExtras(data);

    const life = $("lifestyle"), list = $("lifestyle-list");
    if (data.lifestyle && data.lifestyle.length) { life.hidden = false; list.innerHTML = ""; data.lifestyle.forEach((t) => list.appendChild(el("li", null, t))); }
    else life.hidden = true;

    show("result");
  }

  // ---- honest, generic content for the new sections (no fake stats / no drugs) ----
  const TIMELINE = {
    face: [
      { when: "Week 1–2", head: "Skin settles in", body: "Your skin adjusts to the new routine. A little dryness early on is normal." },
      { when: "Week 3–4", head: "Barrier feels better", body: "Hydration and texture start to improve. Keep going daily." },
      { when: "Month 2", head: "Tone evens out", body: "Marks and unevenness begin to soften with consistent use." },
      { when: "Month 3+", head: "Visible difference", body: "Clearer, smoother, more balanced skin — where consistency pays off." }
    ],
    hair: [
      { when: "Week 1–2", head: "Scalp resets", body: "Your scalp adjusts to the routine. Wash and treat as guided." },
      { when: "Week 3–6", head: "Less shedding", body: "Daily shedding starts to settle as the scalp gets healthier." },
      { when: "Month 2–3", head: "Stronger strands", body: "Hair feels thicker and less fragile at the root." },
      { when: "Month 4+", head: "Fuller look", body: "Density and volume improve with steady, consistent care." }
    ]
  };
  const EXPECT = {
    face: {
      will: ["Build a simple AM/PM routine you'll actually keep", "Target your main concern with the right ingredients", "Support and strengthen your skin barrier over time"],
      wont: ["Fix everything overnight — skin takes weeks", "Replace a dermatologist for medical skin conditions", "Work without consistency — daily use matters most"]
    },
    hair: {
      will: ["Give your scalp a simple, consistent care routine", "Support weaker strands and a healthier scalp", "Improve the look of density over the months"],
      wont: ["Regrow hair in days — it takes months", "Replace a doctor for medical hair loss", "Work if you skip days — consistency is everything"]
    }
  };

  function inr(n) { return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN"); }

  function renderExtras(data) {
    const products = Array.isArray(data.products) ? data.products : [];

    // ---- starter / 1st month kit ----
    const kit = $("kit");
    if (products.length >= 2) {
      kit.hidden = false;
      $("kit-title").textContent = category === "hair" ? "Your 1st month kit" : "Your starter kit";
      const full = products.reduce((s, p) => s + (Number(p.price) || 0), 0);
      const now = Math.round((full * 0.85) / 10) * 10; // 15% bundle saving, rounded
      const pct = Math.max(1, Math.round((1 - now / full) * 100));
      $("kit-badge").textContent = pct + "% off as a kit";
      const wrap = $("kit-items"); wrap.innerHTML = "";
      products.forEach((p) => {
        const row = el("div", "kit-item");
        const thumb = el("div", "kit-thumb");
        if (p.image) { const im = el("img"); im.src = p.image; im.alt = p.name || ""; thumb.appendChild(im); }
        else if (Array.isArray(p.gradient) && p.gradient.length === 2) { thumb.style.background = `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`; }
        row.appendChild(thumb);
        const info = el("div", "kit-info");
        info.appendChild(el("span", "kit-name", p.name || ""));
        if (p.blurb) info.appendChild(el("span", "kit-blurb", p.blurb));
        row.appendChild(info);
        row.appendChild(el("span", "kit-price", inr(p.price)));
        wrap.appendChild(row);
      });
      $("kit-was").textContent = inr(full);
      $("kit-now").textContent = inr(now);
      $("kit-note").textContent = `${products.length} products · one simple routine. Buy together and save ${inr(full - now)}.`;
      const addBtn = $("kit-add");
      addBtn.disabled = false; addBtn.textContent = "Add all to cart";
      addBtn.onclick = () => {
        cart += products.length; cartCountEl.textContent = String(cart);
        addBtn.textContent = "✓ Added to cart"; addBtn.disabled = true;
      };
    } else kit.hidden = true;

    // ---- timeline ----
    const tl = $("timeline"), track = $("timeline-track");
    const steps = TIMELINE[category] || TIMELINE.face;
    if (steps && steps.length) {
      tl.hidden = false;
      $("timeline-title").textContent = category === "hair" ? "Your hair journey, month by month" : "What to expect, week by week";
      track.innerHTML = "";
      steps.forEach((s) => {
        const card = el("div", "tl-card");
        card.appendChild(el("span", "tl-when", s.when));
        card.appendChild(el("span", "tl-head", s.head));
        card.appendChild(el("span", "tl-body", s.body));
        track.appendChild(card);
      });
    } else tl.hidden = true;

    // ---- what this will & won't do ----
    const exp = $("expect");
    const ex = EXPECT[category] || EXPECT.face;
    if (ex) {
      exp.hidden = false;
      const will = $("expect-will"), wont = $("expect-wont");
      will.innerHTML = ""; wont.innerHTML = "";
      ex.will.forEach((t) => will.appendChild(el("li", null, t)));
      ex.wont.forEach((t) => wont.appendChild(el("li", null, t)));
    } else exp.hidden = true;
  }

  // ---- lead capture ----
  function resetLead() {
    const form = $("lead-form"); if (!form) return;
    form.hidden = false; $("lead-done").hidden = true; $("lead-error").hidden = true;
    $("lead-phone").value = ""; $("lead-email").value = ""; $("lead-consent").checked = false;
    const b = $("lead-submit"); b.disabled = false; b.textContent = "Save my routine";
  }
  async function submitLead() {
    const phone = $("lead-phone").value.trim();
    const email = $("lead-email").value.trim();
    const consent = $("lead-consent").checked;
    const err = $("lead-error");
    if (!/^[+\d][\d\s-]{6,}$/.test(phone)) { err.hidden = false; err.textContent = "Please enter a valid phone number."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.hidden = false; err.textContent = "Please enter a valid email."; return; }
    if (!consent) { err.hidden = false; err.textContent = "Please tick the box so we can save your details."; return; }
    err.hidden = true;
    const btn = $("lead-submit"); btn.disabled = true; btn.textContent = "Saving…";
    const names = [];
    ((lastResultData && lastResultData.routine) || []).forEach((g) => (g.steps || []).forEach((s) => { if (!names.includes(s.product.name)) names.push(s.product.name); }));
    const payload = {
      category, name: answers.name || "", age: answers.age || "", phone, email, consent: true,
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
  $("capture-btn").addEventListener("click", () => submitConsult());
  $("upload-photo").addEventListener("click", () => $("upload-input").click());
  $("upload-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    fileToDataURL(file, (dataURL) => {
      if (!dataURL) return;
      scanImage = dataURL;
      const p = $("upload-preview"); p.src = dataURL; p.hidden = false;
      $("upload-placeholder").hidden = true;
    });
  });
  $("scan-back").addEventListener("click", () => { show("intake"); renderStep(); });
  $("intake-back").addEventListener("click", stepBack);
  $("result-back").addEventListener("click", () => show("home"));
  $("save-pdf").addEventListener("click", () => window.print());
  $("lead-submit").addEventListener("click", submitLead);

  show("home");
})();