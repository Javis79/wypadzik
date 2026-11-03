/* Ruch w świecie „Odbitek”: zdjęcia się wywołują, odbitki się przesuwają po stole,
   a match to błysk flesza, wysuwająca się odbitka, taśma i dopisek markerem. */
(() => {
  const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";
  const developed = new Set();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // zdjęcie „wywołuje się” jak odbitka z aparatu natychmiastowego, raz na zdjęcie w sesji
  function develop(img, key, slow) {
    if (!img || developed.has(key)) return;
    developed.add(key);
    if (RM()) { img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); return; }
    img.animate([
      { filter: "sepia(.55) saturate(.15) brightness(1.75) contrast(.6) blur(4px)", opacity: .35 },
      { filter: "sepia(.3) saturate(.6) brightness(1.2) contrast(.85) blur(1px)", opacity: 1, offset: .55 },
      { filter: "sepia(0) saturate(1) brightness(1) contrast(1) blur(0)", opacity: 1 },
    ], { duration: slow ? 2400 : 1500, easing: "cubic-bezier(.3,.6,.2,1)" });
  }

  // FLIP: odbitki płynnie przesuwają się na nowe miejsca po zmianie sortowania czy filtra
  function flip(container, sel, key, update) {
    if (RM() || !container.offsetParent) return update();
    const before = new Map([...container.querySelectorAll(sel)].map(el => [el.dataset[key], el.getBoundingClientRect()]));
    update();
    let i = 0;
    container.querySelectorAll(sel).forEach(el => {
      const r0 = before.get(el.dataset[key]), r1 = el.getBoundingClientRect();
      if (!r0) {
        el.animate([{ opacity: 0, transform: "translateY(14px) scale(.96)" }, { opacity: 1, transform: "none" }],
          { duration: 420, delay: Math.min(i++ * 30, 240), easing: EASE, fill: "backwards" });
        return;
      }
      const dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 520, easing: EASE });
    });
  }

  // przejście widoku (View Transitions API), z kierunkiem i opcjonalnym wspólnym elementem
  const noVT = { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
  function vt(update, { dir, from } = {}) {
    if (!document.startViewTransition || RM() || document.hidden) { update(); return noVT; }
    const root = document.documentElement;
    if (dir) root.dataset.dir = dir; else delete root.dataset.dir;
    if (from) from.style.viewTransitionName = "hero";
    // zabezpieczenie: gdyby przeglądarka nie wywołała zmiany (np. strona chwilowo nie rysuje), zrób ją sama
    let done = false;
    const run = () => { if (done) return; done = true; if (from) from.style.viewTransitionName = ""; update(); };
    const t = document.startViewTransition(run);
    setTimeout(() => { if (!done) { t.skipTransition(); run(); } }, 500);
    t.ready.catch(() => {}); t.updateCallbackDone.catch(() => {});
    t.finished.finally(() => delete root.dataset.dir);
    return t;
  }

  // migawka: krótki szum i klik, syntetyzowane, bez plików
  let ac;
  function shutter() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime, len = .09;
      const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = .8;
      const g = ac.createGain(); g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + len);
      src.connect(bp).connect(g).connect(ac.destination); src.start(t);
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.setValueAtTime(1800, t + .05); o.frequency.exponentialRampToValueAtTime(500, t + .1);
      og.gain.setValueAtTime(.12, t + .05); og.gain.exponentialRampToValueAtTime(.001, t + .12);
      o.connect(og).connect(ac.destination); o.start(t + .05); o.stop(t + .13);
    } catch {}
  }

  // ścinki: kawałki różowej taśmy i białego papieru, fizyka na canvasie, sama się kończy
  function scraps(canvas, origin) {
    const ctx = canvas.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    const W = canvas.width = innerWidth * dpr, H = canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const cols = ["#f3b8c9", "#e98aa6", "#ffffff", "#ffffff", "#f3b8c9", "#24318f"];
    const P = Array.from({ length: 70 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 7 + Math.random() * 9;
      const tape = i % 3 !== 2;
      return { x: origin.x, y: origin.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: Math.random() * 6, vr: (Math.random() - .5) * .35,
        w: tape ? 16 + Math.random() * 14 : 8 + Math.random() * 6, h: tape ? 7 : 9 + Math.random() * 5, c: cols[i % cols.length], tilt: Math.random() * 6 };
    });
    const t0 = performance.now();
    (function frame(t) {
      const age = (t - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      P.forEach(p => {
        p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.scale(1, Math.cos(age * p.tilt));
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1.6) / .6);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        if (p.c === "#ffffff") { ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      });
      if (age < 2.2) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  // match: błysk, odbitka wysuwa się z aparatu i wywołuje, taśma, dopisek markerem
  function celebrate({ name, photo, line, onCompare }) {
    document.getElementById("match")?.remove();
    const el = document.createElement("div");
    el.id = "match"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", `Match: ${name}`); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="m-dim" aria-hidden="true"></div><canvas class="m-scraps" aria-hidden="true"></canvas><div class="m-flash" aria-hidden="true"></div>
      <div class="m-stage">
        <div class="m-slot" aria-hidden="true"></div>
        <figure class="m-print">
          <span class="m-tape a"></span><span class="m-tape b"></span>
          <div class="m-photo">${photo ? `<img alt="" src="${esc(photo)}">` : ""}<span class="m-k">K ✓</span><span class="m-z">Z ✓</span></div>
          <figcaption><span class="m-write">${esc(name)}!</span><small>${esc(line)}</small></figcaption>
        </figure>
        <div class="m-acts"><button class="btn" data-m="close">Głosujemy dalej</button><button class="btn primary" data-m="cmp">Zobacz w Porównaj</button></div>
      </div>`;
    document.body.appendChild(el);
    const close = () => {
      if (!el.isConnected) return;
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" });
      a.onfinish = () => el.remove();
    };
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-m]");
      if (b?.dataset.m === "cmp") { close(); onCompare && onCompare(); }
      else if (b || e.target === el || e.target.classList.contains("m-stage") || e.target.classList.contains("m-dim")) close();
    });
    addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); removeEventListener("keydown", esc); } });
    el.querySelector("[data-m=cmp]").focus({ preventScroll: true });

    const print = el.querySelector(".m-print"), img = el.querySelector(".m-photo img");
    el.querySelector(".m-dim").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out", fill: "backwards" });
    if (RM()) {
      print.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "backwards" });
      return;
    }
    shutter();
    navigator.vibrate?.([18, 60, 28]);
    el.querySelector(".m-flash").animate([{ opacity: 0 }, { opacity: .95, offset: .15 }, { opacity: 0 }], { duration: 520, easing: "ease-out" });
    el.querySelector(".m-slot").animate([{ transform: "scaleX(.2)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1, offset: .3 }, { transform: "scaleX(1)", opacity: 1, offset: .75 }, { transform: "scaleX(1.05)", opacity: 0 }], { duration: 1300, fill: "forwards" });
    print.animate([
      { transform: "translateY(-115%) rotate(0deg)", clipPath: "inset(0 0 100% 0)" },
      { transform: "translateY(-58%) rotate(0deg)", clipPath: "inset(0 0 0 0)", offset: .45 },
      { transform: "translateY(4%) rotate(-5deg)", clipPath: "inset(0 0 0 0)", offset: .8 },
      { transform: "translateY(0) rotate(-3deg)", clipPath: "inset(0 0 0 0)" },
    ], { duration: 1150, delay: 120, easing: "cubic-bezier(.3,.7,.2,1)", fill: "both" });
    if (img) develop(img, "match:" + name + Date.now(), true);
    el.querySelectorAll(".m-tape").forEach((t, i) => t.animate([
      { transform: `rotate(${i ? 38 : -34}deg) scale(1.7)`, opacity: 0 },
      { transform: `rotate(${i ? 38 : -34}deg) scale(1)`, opacity: .92 },
    ], { duration: 260, delay: 1150 + i * 140, easing: "cubic-bezier(.7,0,.84,0)", fill: "both" }));
    el.querySelector(".m-write").animate([{ clipPath: "inset(-20% 100% -20% 0)" }, { clipPath: "inset(-20% 0 -20% 0)" }],
      { duration: 820, delay: 1450, easing: "cubic-bezier(.45,.05,.4,1)", fill: "both" });
    el.querySelectorAll(".m-k,.m-z").forEach((t, i) => t.animate([{ transform: "scale(0) rotate(-20deg)" }, { transform: "scale(1) rotate(-4deg)" }],
      { duration: 320, delay: 1800 + i * 160, easing: "cubic-bezier(.16,1,.3,1)", fill: "both" }));
    el.querySelectorAll(".m-acts, figcaption small").forEach(t => t.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: 400, delay: 2100, easing: EASE, fill: "both" }));
    setTimeout(() => {
      if (!el.isConnected) return;
      const r = print.getBoundingClientRect();
      scraps(el.querySelector(".m-scraps"), { x: r.left + r.width / 2, y: r.top + r.height * .35 });
    }, 1250);
  }

  window.Motion = { develop, flip, vt, celebrate, RM, EASE };
})();
