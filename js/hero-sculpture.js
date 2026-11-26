/*
 * Hero sculpture: scroll-driven 3D WebGL molten-glass ring behind the hero content.
 *
 * Uses the Cinema 4D / Octane Render molten-glass ring artwork (`assets/images/hero-ring-bg.webp`)
 * mapped onto a 3D depth-displaced mesh with real-time normal-mapped studio relighting.
 *
 * Scroll progress through the hero (`p` in [0, 1]) is the sole animation driver:
 *   - 3D axis rotation & perspective tilt of the sculpture mesh,
 *   - Organic torsional flow along the intertwined left and right ribbon coils,
 *   - Dynamic specular highlight & reflection evolution across the glass ridges,
 *   - Subtle depth scale and vertical parallax, plus a smooth fade-out into the next section.
 * Scrolling back up reverses every transformation smoothly back to the exact initial state.
 */
(function () {
  'use strict';

  const host = document.getElementById('hero-sculpture');
  const hero = document.getElementById('home');
  if (!host || !hero) return;
  const canvas = host.querySelector('canvas');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const IMAGE_SRC = 'assets/images/hero-ring-bg.webp';
  const IMAGE_ASPECT = 1376 / 768;
  const GRID_X = 140;
  const GRID_Y = 84;

  const VERT = `
    attribute vec2 a_pos;
    uniform float u_progress;
    uniform float u_aspect;
    uniform float u_imgAspect;
    varying vec2 v_uv;
    varying vec2 v_ndc;
    varying float v_relief;

    // Approximate 3D relief profile of the left and right molten-glass ring masses
    float sculptureRelief(vec2 uv) {
      float leftLobe = exp(-pow((uv.x - 0.19) / 0.22, 2.0) - pow((uv.y - 0.48) / 0.46, 2.0));
      float leftFold = exp(-pow((uv.x - 0.28) / 0.14, 2.0) - pow((uv.y - 0.46) / 0.24, 2.0));
      float rightArch = exp(-pow((uv.x - 0.82) / 0.20, 2.0) - pow((uv.y - 0.44) / 0.48, 2.0));
      return clamp(0.65 * leftLobe + 0.55 * leftFold + 0.70 * rightArch, 0.0, 1.0);
    }

    void main() {
      // a_pos in [-1, 1]^2
      float p = u_progress;

      // Convert mesh coordinates to base image UV [0, 1]^2 (top-left origin for texture)
      vec2 baseUv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
      float relief = sculptureRelief(baseUv);
      v_relief = relief;

      // 3D coordinates of the sculpted surface
      // Overscan slightly (1.06 + p * 0.08) so 3D rotation & tilt never expose viewport borders
      float grow = smoothstep(0.0, 0.45, p);
      float shrink = smoothstep(0.45, 1.0, p);
      float scale = 1.04 + 0.09 * grow - 0.14 * shrink;

      // Scroll-driven 3D rotation around the ring's central axis + subtle 3D perspective tilt
      float rotZ = -p * 0.22;
      float tiltX = p * 0.18;
      float tiltY = -p * 0.20;

      // Z-depth relief of the 3D ribbon masses
      float z = (relief - 0.25) * (0.22 + 0.12 * sin(p * 3.14159));

      // Apply 3D rotations to the sculpted vertex
      vec3 pos = vec3(a_pos.x * u_aspect, a_pos.y, z);

      // Rotate around Z (central ring axis)
      float cz = cos(rotZ), sz = sin(rotZ);
      pos.xy = vec2(cz * pos.x - sz * pos.y, sz * pos.x + cz * pos.y);

      // Rotate around Y (horizontal depth tilt)
      float cy = cos(tiltY), sy = sin(tiltY);
      pos.xz = vec2(cy * pos.x + sy * pos.z, -sy * pos.x + cy * pos.z);

      // Rotate around X (vertical depth tilt)
      float cx = cos(tiltX), sx = sin(tiltX);
      pos.yz = vec2(cx * pos.y - sx * pos.z, sx * pos.y + cx * pos.z);

      // Perspective division + scale + scroll parallax
      float persp = 1.0 / (1.0 - pos.z * 0.28);
      vec2 ndc = (pos.xy / vec2(u_aspect, 1.0)) * scale * persp;

      // Parallax drift: the 3D sculpture trails the scroll slightly and shifts subtly in X/Y
      ndc.y += p * 0.14;
      ndc.x -= p * 0.025;

      v_uv = baseUv;
      v_ndc = a_pos;
      gl_Position = vec4(ndc, 0.0, 1.0);
    }
  `;

  const FRAG = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    varying vec2 v_uv;
    varying vec2 v_ndc;
    varying float v_relief;

    uniform sampler2D u_tex;
    uniform float u_progress;
    uniform float u_aspect;
    uniform float u_imgAspect;

    // Cover-fit UV adjustment so the 16:9 artwork frames both wide desktop and portrait mobile cleanly
    vec2 coverUv(vec2 uv) {
      vec2 c = uv - 0.5;
      if (u_aspect > u_imgAspect) {
        c.y *= u_imgAspect / u_aspect;
      } else {
        // On narrower/mobile viewports, keep both left & right ribbon arches in frame
        float ratio = u_aspect / u_imgAspect;
        c.x *= mix(1.0, ratio, 0.55);
      }
      return c + 0.5;
    }

    // Mirror-clamped sampling so extreme scroll rotations never clip at texture boundaries
    vec2 mirrorUv(vec2 uv) {
      vec2 m = mod(uv, 2.0);
      return mix(m, 2.0 - m, step(1.0, m));
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.35, 0.45, 0.20));
    }

    void main() {
      float p = u_progress;
      vec2 uv = coverUv(v_uv);

      // Organic scroll-driven torsional flow within the left and right ribbon coils:
      // At p = 0, displacement is exactly (0, 0) so the resting frame is 100% pristine.
      vec2 centered = uv - vec2(0.5, 0.48);
      float r = length(centered * vec2(1.15, 0.88));
      float angle = atan(centered.y, centered.x);

      // Swirl & ribbon-twist displacement weighted to the sculpture ring band
      float ringBand = smoothstep(0.16, 0.36, r) * (1.0 - smoothstep(0.68, 0.96, r));
      float twistAngle = p * 0.24 * ringBand * (0.65 + 0.35 * sin(3.0 * angle - p * 2.5));
      float ca = cos(twistAngle), sa = sin(twistAngle);
      vec2 swirled = vec2(ca * centered.x - sa * centered.y, sa * centered.x + ca * centered.y) + vec2(0.5, 0.48);

      // Fine longitudinal wave flow along the glass folds as scroll progresses
      vec2 flowWave = vec2(
        sin(uv.y * 9.0 + uv.x * 5.0 - p * 3.2) * 0.014,
        cos(uv.x * 8.0 - uv.y * 6.0 + p * 2.8) * 0.016
      ) * p * v_relief;

      vec2 finalUv = clamp(mirrorUv(swirled + flowWave), 0.002, 0.998);
      vec3 baseCol = texture2D(u_tex, finalUv).rgb;

      // Extract local surface normal from the molten-glass ridges for scroll-reactive specular relighting
      vec2 eps = vec2(1.0 / 1376.0, 1.0 / 768.0) * 2.2;
      float hL = luma(texture2D(u_tex, clamp(finalUv - vec2(eps.x, 0.0), 0.002, 0.998)).rgb);
      float hR = luma(texture2D(u_tex, clamp(finalUv + vec2(eps.x, 0.0), 0.002, 0.998)).rgb);
      float hD = luma(texture2D(u_tex, clamp(finalUv - vec2(0.0, eps.y), 0.002, 0.998)).rgb);
      float hU = luma(texture2D(u_tex, clamp(finalUv + vec2(0.0, eps.y), 0.002, 0.998)).rgb);

      vec3 normal = normalize(vec3((hL - hR) * 4.5, (hD - hU) * 4.5, 1.0));
      float ridgeStrength = clamp(length(normal.xy) * 1.4, 0.0, 1.0);
      float sculptureMask = smoothstep(0.06, 0.45, baseCol.r) * v_relief;

      // Dynamic studio light that orbits as the user scrolls, sweeping fiery highlights along the glass pleats
      float lightAngle = p * 3.6;
      vec3 lightDir = normalize(vec3(sin(lightAngle) * 0.75 - 0.25, cos(lightAngle * 0.8) * 0.55 + 0.25, 0.65));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      vec3 halfVec = normalize(lightDir + viewDir);

      float spec = pow(max(dot(normal, halfVec), 0.0), 36.0);
      float rimShift = sin(lightAngle + finalUv.y * 6.0 - finalUv.x * 4.0) * 0.5 + 0.5;

      // Add scroll-reactive crimson-rose & copper-amber specular glints (zero at p = 0)
      float dynStrength = sin(p * 3.14159265) * 0.85 + p * 0.35;
      vec3 dynHighlight = vec3(0.96, 0.36, 0.28) * spec * ridgeStrength * sculptureMask * dynStrength * 1.15;
      vec3 dynCaustic = vec3(0.78, 0.16, 0.22) * ridgeStrength * rimShift * sculptureMask * dynStrength * 0.22;

      vec3 col = baseCol + dynHighlight + dynCaustic;
      // Slightly soften peak contrast of the outer ribbon lobes so foreground text remains dominant
      col = mix(vec3(0.08, 0.025, 0.038), col, 0.88);

      // Soft vignette at the outer edges when rotated so the sculpture blends seamlessly into the dark backdrop
      float edgeFade = 1.0 - smoothstep(0.82, 1.02, max(abs(v_ndc.x), abs(v_ndc.y))) * p * 0.55;
      col *= edgeFade;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  let gl = null;
  let program = null;
  let loc = null;
  let tex = null;
  let indexCount = 0;
  let contextLost = false;
  let imageLoaded = false;

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Hero sculpture shader failed: ' + info);
    }
    return shader;
  }

  function setUpGL() {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Hero sculpture program failed: ' + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    loc = {
      u_tex: gl.getUniformLocation(program, 'u_tex'),
      u_progress: gl.getUniformLocation(program, 'u_progress'),
      u_aspect: gl.getUniformLocation(program, 'u_aspect'),
      u_imgAspect: gl.getUniformLocation(program, 'u_imgAspect')
    };

    const verts = new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 2);
    let k = 0;
    for (let y = 0; y <= GRID_Y; y++) {
      const py = -1 + 2 * (y / GRID_Y);
      for (let x = 0; x <= GRID_X; x++) {
        const px = -1 + 2 * (x / GRID_X);
        verts[k++] = px;
        verts[k++] = py;
      }
    }

    const indices = new Uint16Array(GRID_X * GRID_Y * 6);
    k = 0;
    for (let y = 0; y < GRID_Y; y++) {
      for (let x = 0; x < GRID_X; x++) {
        const a = y * (GRID_X + 1) + x;
        const b = a + GRID_X + 1;
        indices[k++] = a; indices[k++] = b; indices[k++] = a + 1;
        indices[k++] = b; indices[k++] = b + 1; indices[k++] = a + 1;
      }
    }
    indexCount = indices.length;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  function uploadTexture(img) {
    if (!gl || contextLost) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  const layout = { w: 1, h: 1, aspect: 1.6, maxOpacity: 1 };

  function measure() {
    const rect = host.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const small = cssW < 900;
    let dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.85);
    const budget = 3.6e6;
    if (cssW * cssH * dpr * dpr > budget) dpr = Math.sqrt(budget / (cssW * cssH));
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    layout.w = cssW;
    layout.h = cssH;
    layout.aspect = cssW / cssH;
    layout.maxOpacity = layout.aspect < 1 ? 0.74 : 0.91;
  }

  function render(p) {
    if (!gl || contextLost || !imageLoaded) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.u_tex, 0);
    gl.uniform1f(loc.u_progress, p);
    gl.uniform1f(loc.u_aspect, layout.aspect);
    gl.uniform1f(loc.u_imgAspect, IMAGE_ASPECT);

    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    canvas.style.opacity = (layout.maxOpacity * (1 - smoothstep(0.55, 0.98, p))).toFixed(3);
  }

  const state = { target: 0, current: 0, raf: 0, last: 0, visible: true, ready: false };

  function readProgress() {
    if (reducedQuery.matches) return 0;
    const range = Math.max(1, hero.offsetHeight);
    return clamp(window.scrollY / range, 0, 1);
  }

  function frame(now) {
    state.raf = 0;
    if (!imageLoaded) return;
    const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 1 / 60;
    state.last = now;
    state.current += (state.target - state.current) * (1 - Math.exp(-dt * 9));
    if (Math.abs(state.target - state.current) < 0.0005) state.current = state.target;
    render(state.current);
    if (!state.ready) {
      state.ready = true;
      host.classList.add('is-ready', 'is-webgl-active');
    }
    if (state.current !== state.target) state.raf = requestAnimationFrame(frame);
    else state.last = 0;
  }

  function request() {
    if (state.raf || contextLost || !imageLoaded) return;
    if (!state.visible && state.ready) {
      state.current = state.target;
      return;
    }
    state.raf = requestAnimationFrame(frame);
  }

  function onScroll() {
    state.target = readProgress();
    if (reducedQuery.matches) state.current = state.target;
    request();
  }

  function onResize() {
    measure();
    state.target = readProgress();
    state.current = state.target;
    state.last = 0;
    request();
  }

  function init() {
    const attrs = {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    };
    gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL unavailable');
    setUpGL();
    measure();

    const img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      imageLoaded = true;
      uploadTexture(img);
      state.target = readProgress();
      state.current = state.target;
      request();
    };
    img.onerror = function () {
      fail(new Error('Failed to load hero sculpture artwork'));
    };
    img.src = IMAGE_SRC;

    window.addEventListener('scroll', onScroll, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(host);
    else window.addEventListener('resize', onResize);
    window.addEventListener('load', onResize);
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onResize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting;
        if (state.visible) request();
      }, { threshold: 0 }).observe(hero);
    }

    canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault();
      contextLost = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
    });
    canvas.addEventListener('webglcontextrestored', function () {
      contextLost = false;
      try {
        setUpGL();
        if (imageLoaded && img.complete) uploadTexture(img);
        onResize();
      } catch (err) {
        fail(err);
      }
    });
  }

  function fail(err) {
    // Keep the CSS background artwork visible if WebGL is unavailable
    host.classList.add('is-ready', 'is-css-fallback');
    if (window.BLITZ_ERRORS) window.BLITZ_ERRORS.report(err, { operation: 'hero-sculpture', kind: 'script', silent: true });
  }

  function start() {
    try { init(); } catch (err) { fail(err); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
