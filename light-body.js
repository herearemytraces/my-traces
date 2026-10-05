/* A light sculpture shaped by the public words currently on the surface. */
(function (scope) {
  "use strict";

  const FRAME_MS = 50;
  const TWO_PI = Math.PI * 2;
  const PALETTE = {
    thought: [212, 209, 195],
    question: [196, 210, 215],
    dream: [202, 194, 221],
    artifact: [214, 202, 174],
    memory: [182, 201, 200],
    restraint: [212, 178, 161]
  };

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function random(seed) {
    let state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      let value = Math.imul(state ^ state >>> 15, state | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function publicationKey(entry) {
    if (!entry || typeof entry !== "object") return "";
    if (!entry.id && !entry.text) return "";
    return [String(entry.id || ""), String(entry.text || ""), String(entry.kind || "")].join("\u001f");
  }

  function formFor(key, kind) {
    const next = random(hash(key || "a surface waiting for a trace"));
    return {
      twist: 1.22 + next() * 1.12,
      phase: next() * TWO_PI,
      bend: (next() - 0.5) * 0.19,
      lobe: 0.11 + next() * 0.17,
      opening: 0.20 + next() * 0.18,
      tilt: (next() - 0.5) * 0.16,
      grain: next(),
      color: PALETTE[kind] || [212, 206, 187]
    };
  }

  function mix(from, to, fraction) {
    const value = {};
    for (const key of ["twist", "phase", "bend", "lobe", "opening", "tilt", "grain"]) {
      value[key] = from[key] + (to[key] - from[key]) * fraction;
    }
    value.color = from.color.map((channel, index) => channel + (to.color[index] - channel) * fraction);
    return value;
  }

  function rgba(color, opacity) {
    return "rgba(" + color.map(Math.round).join(",") + "," + opacity.toFixed(3) + ")";
  }

  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") {
      throw new TypeError("TracesLight.create requires a canvas.");
    }
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return { setPublication: function () {}, setPaused: function () {}, destroy: function () {} };

    const doc = canvas.ownerDocument || scope.document;
    const view = doc.defaultView || scope;
    const media = typeof view.matchMedia === "function" ? view.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let reduced = Boolean(media && media.matches);
    let paused = false;
    let destroyed = false;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let frame = null;
    let timer = null;
    let lastFrame = null;
    let motion = 0;
    let key = "";
    let entries = [];
    let target = formFor("");
    let previous = target;
    let current = target;
    let transition = 1;
    let ghost = null;
    let ghostAge = 0;

    // Each strand belongs to the same form. Depth only changes its visibility.
    function point(form, latitude, longitude, time, offset) {
      const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * latitude)), 0.70);
      const waist = 0.68 + form.lobe * Math.cos(latitude * TWO_PI + form.phase);
      const angle = longitude + latitude * TWO_PI * form.twist + form.phase;
      const breath = reduced ? 0 : Math.sin(time * 0.22 + latitude * 3 + longitude) * 0.018;
      const radius = envelope * (waist + breath);
      const depth = Math.sin(angle);
      const curl = Math.sin(latitude * TWO_PI + form.phase) * form.bend;
      const fold = Math.sin(latitude * Math.PI * 3 + longitude * 0.4) * form.opening * envelope;
      return {
        x: Math.cos(angle) * radius + curl + fold + offset,
        y: (latitude - 0.5) * 2 + form.tilt * Math.cos(angle) * envelope,
        depth: depth
      };
    }

    function sculpture(form, time, opacity, outline) {
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const scaleY = Math.min(height * 0.39, width * 0.77);
      const scaleX = Math.min(width * 0.36, scaleY * 0.69);
      const strands = outline ? 13 : 86;
      const steps = outline ? 44 : 67;
      const drift = reduced ? 0 : Math.sin(time * 0.10) * 0.035;

      // Back and front halves are drawn independently, like layers of glass.
      for (const front of [false, true]) {
        for (let strand = 0; strand < strands; strand += 1) {
          const longitude = strand / strands * TWO_PI + drift;
          let drawing = false;
          context.beginPath();
          for (let step = 0; step <= steps; step += 1) {
            const latitude = step / steps;
            const sample = point(form, latitude, longitude, time, outline ? 0.028 : 0);
            const visible = (sample.depth >= 0) === front;
            if (!visible) { drawing = false; continue; }
            const x = centerX + sample.x * scaleX;
            const y = centerY + sample.y * scaleY;
            if (drawing) context.lineTo(x, y);
            else context.moveTo(x, y);
            drawing = true;
          }
          const seam = strand % 11 === 0;
          const alpha = opacity * (outline ? 0.12 : front ? seam ? 0.54 : 0.24 : 0.085);
          context.strokeStyle = rgba(form.color, alpha);
          context.lineWidth = outline ? 0.45 : seam ? 0.86 : 0.50;
          context.stroke();
        }
      }

      if (outline) return;
      // Sparse cross-sections reveal the folds without becoming a solid globe.
      for (let ring = 1; ring <= 10; ring += 1) {
        const latitude = ring / 11;
        context.beginPath();
        for (let step = 0; step <= 76; step += 1) {
          const sample = point(form, latitude, step / 76 * TWO_PI + drift, time, 0);
          const x = centerX + sample.x * scaleX;
          const y = centerY + sample.y * scaleY;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.strokeStyle = rgba(form.color, opacity * (ring % 3 === 0 ? 0.11 : 0.044));
        context.lineWidth = 0.55;
        context.stroke();
      }

      // Small peripheral marks are seeded by actual entries, never a simulated count.
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const seed = random(hash(publicationKey(entry)));
        const side = seed() < 0.5 ? -1 : 1;
        const x = centerX + side * scaleX * (0.85 + seed() * 0.30);
        const y = centerY + (seed() - 0.5) * scaleY * 1.52;
        const radius = 0.7 + seed() * 0.65;
        context.beginPath();
        context.arc(x, y, radius, 0, TWO_PI);
        context.fillStyle = rgba(PALETTE[entry.kind] || form.color, opacity * 0.38);
        context.fill();
        context.beginPath();
        context.moveTo(x + side * 5, y);
        context.lineTo(x + side * (8 + seed() * 9), y);
        context.strokeStyle = rgba(form.color, opacity * 0.12);
        context.lineWidth = 0.5;
        context.stroke();
      }
    }

    function draw() {
      if (destroyed || width < 1 || height < 1 || doc.hidden) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const halo = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.52);
      halo.addColorStop(0, rgba(current.color, 0.018));
      halo.addColorStop(0.5, rgba(current.color, 0.009));
      halo.addColorStop(1, rgba(current.color, 0));
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      if (ghost && !reduced) sculpture(ghost, motion, Math.max(0, 1 - ghostAge / 12), true);
      sculpture(current, motion, 1, false);
    }

    function cancelFrame() {
      if (frame !== null) view.cancelAnimationFrame(frame);
      if (timer !== null) view.clearTimeout(timer);
      frame = null;
      timer = null;
      lastFrame = null;
    }

    function queueFrame() {
      if (destroyed || reduced || paused || doc.hidden || width < 1 || height < 1 || timer !== null || frame !== null) return;
      timer = view.setTimeout(function () {
        timer = null;
        frame = view.requestAnimationFrame(tick);
      }, FRAME_MS);
    }

    function tick(now) {
      frame = null;
      if (destroyed || reduced || paused || doc.hidden) return;
      const elapsed = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.15);
      lastFrame = now;
      motion += elapsed;
      ghostAge += elapsed;
      if (ghostAge >= 12) ghost = null;
      if (transition < 1) {
        transition = Math.min(1, transition + elapsed / 5);
        const eased = transition * transition * (3 - 2 * transition);
        current = mix(previous, target, eased);
      }
      draw();
      queueFrame();
    }

    function resize() {
      if (destroyed) return;
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(0, bounds.width);
      const nextHeight = Math.max(0, bounds.height);
      const nextRatio = Math.min(2, Math.max(1, view.devicePixelRatio || 1));
      if (width === nextWidth && height === nextHeight && ratio === nextRatio) return;
      width = nextWidth;
      height = nextHeight;
      ratio = nextRatio;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      draw();
      queueFrame();
    }

    function visibilityChanged() {
      cancelFrame();
      if (!doc.hidden) { draw(); queueFrame(); }
    }

    function preferenceChanged() {
      reduced = Boolean(media && media.matches);
      cancelFrame();
      if (reduced) { current = target; transition = 1; ghost = null; }
      draw();
      queueFrame();
    }

    const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    view.addEventListener("resize", resize);
    doc.addEventListener("visibilitychange", visibilityChanged);
    if (media) {
      if (typeof media.addEventListener === "function") media.addEventListener("change", preferenceChanged);
      else if (typeof media.addListener === "function") media.addListener(preferenceChanged);
    }
    resize();

    return {
      setPublication: function (publication) {
        if (destroyed) return;
        const entry = publication && publication.current || null;
        const nextKey = publicationKey(entry);
        const available = publication && Array.isArray(publication.entries) ? publication.entries : [];
        const seen = new Set();
        entries = available.filter(function (item) {
          const itemKey = publicationKey(item);
          if (!itemKey || seen.has(itemKey)) return false;
          seen.add(itemKey);
          return true;
        }).slice(0, 8).map(function (item) {
          return { id: item.id, text: item.text, kind: item.kind };
        });
        if (nextKey !== key) {
          ghost = key ? current : null;
          ghostAge = 0;
          previous = current;
          target = formFor(nextKey, entry && entry.kind);
          transition = reduced || paused || !key ? 1 : 0;
          if (transition === 1) current = target;
          key = nextKey;
        }
        draw();
        queueFrame();
      },
      setPaused: function (value) {
        if (destroyed || paused === Boolean(value)) return;
        paused = Boolean(value);
        cancelFrame();
        draw();
        queueFrame();
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        cancelFrame();
        if (observer) observer.disconnect();
        view.removeEventListener("resize", resize);
        doc.removeEventListener("visibilitychange", visibilityChanged);
        if (media) {
          if (typeof media.removeEventListener === "function") media.removeEventListener("change", preferenceChanged);
          else if (typeof media.removeListener === "function") media.removeListener(preferenceChanged);
        }
        entries = [];
        ghost = null;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }

  scope.TracesLight = { create: create };
})(typeof window !== "undefined" ? window : globalThis);
