/* Full experience · the night city. three.js is passed in (loaded from jsDelivr only after the click).
   One instanced city of towers, streets of light trails, height fog, and four hologram districts built
   from the page's real data. Post-processing (bloom, grain, vignette, a touch of chromatic aberration)
   is hand-written here, so no extra libraries are needed.
   Lightness first: four quality tiers (pixel ratio capped at 1.5 on desktops and 1.25 on phones, plus a pixel
   budget), one draw call per repeated object (instancing), shared geometries, textures sized to need, videos
   decoded only while their screen is in view, no allocations per frame, and a dispose() that frees everything. */
import { districtFrame } from './film.js';

const TIERS = {
  high: { q: 3, dpr: 1.5, mp: 2.6, half: 26, motes: 900, post: 2 },
  medium: { q: 2, dpr: 1.25, mp: 1.8, half: 22, motes: 450, post: 1 },
  low: { q: 1, dpr: 1, mp: 1.1, half: 18, motes: 160, post: 0 },
  minimal: { q: 0, dpr: 0.85, mp: 0.62, half: 14, motes: 0, post: 0 },
};
export const TIER_ORDER = ['minimal', 'low', 'medium', 'high'];
const PHONE_CROP = [760 / 1280, 29 / 720, 304 / 1280, 660 / 720];   // the Mini App inside telegram.mp4 (1280x720)

const CELL = 30;
const COL = {
  amber: [1.0, 0.64, 0.14], tg: [0.16, 0.67, 0.93], mint: [0.31, 0.86, 0.55], power: [0.62, 0.86, 1.0],
  cool: [0.42, 0.6, 1.0], red: [1.0, 0.33, 0.28], white: [1, 1, 1],
};
const IDS = ['answered', 'booked', 'measured', 'alwayson'];
const TINT_OF = { answered: 1, booked: 2, measured: 3, alwayson: 4 };

/* ------------------------------------------------------------------ GLSL */
const COMMON = /* glsl */`
uniform float uTime;
uniform vec3 uFogColor;
uniform vec3 uHorizon;
uniform float uFogA;
uniform float uFogB;
uniform float uCityHalf;
uniform vec3 uPlant;
uniform float uOutR;
uniform float uInR;
uniform float uPower;
uniform float uExpo;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float powerAt(vec2 xz) {
  float d = length(xz - uPlant.xz);
  float dark = 1.0 - smoothstep(uOutR - 70.0, uOutR, d);
  float relit = 1.0 - smoothstep(uInR - 70.0, uInR, d);
  return (1.0 - dark * (1.0 - relit)) * uPower;
}
float frontAt(vec2 xz) {
  if (uInR < 1.0 || uInR > 2600.0) return 0.0;
  float d = length(xz - uPlant.xz);
  return exp(-abs(d - uInR + 30.0) * 0.045);
}
float fogAmt(vec3 p) {
  vec3 v = p - cameraPosition; float d = length(v); vec3 rd = v / max(d, 0.001);
  float ry = rd.y; if (abs(ry) < 0.0005) ry = 0.0005;
  float amt = (uFogA / uFogB) * exp(-max(cameraPosition.y, 0.0) * uFogB) * (1.0 - exp(-d * ry * uFogB)) / ry;
  float f = 1.0 - exp(-max(amt, 0.0));
  float edge = smoothstep(uCityHalf * 0.7, uCityHalf * 0.97, max(abs(p.x), abs(p.z)));
  return clamp(max(f, edge), 0.0, 1.0);
}
vec3 fogIt(vec3 col, vec3 p) {
  float f = fogAmt(p);
  vec3 rd = normalize(p - cameraPosition);
  vec3 fc = mix(uFogColor, uHorizon, pow(clamp(1.0 - abs(rd.y) * 2.4, 0.0, 1.0), 2.0));
  return mix(col * uExpo, fc, f);
}
float boxEdge(vec3 l, vec3 s, float w) {
  vec3 e = (0.5 - abs(l - vec3(0.0, 0.5, 0.0))) * s;
  float mn = min(e.x, min(e.y, e.z)); float mx = max(e.x, max(e.y, e.z));
  float mid = e.x + e.y + e.z - mn - mx;
  return 1.0 - smoothstep(0.0, w, mid);
}
`;

const TOWER_VS = /* glsl */`
attribute vec4 aInfo;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vInfo; varying vec3 vS;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normal; vL = position; vInfo = aInfo;
  vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TOWER_FS = /* glsl */`
${COMMON}
uniform vec3 uTint[6];
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec4 vInfo; varying vec3 vS;
void main() {
  vec3 n = normalize(vN);
  float seed = vInfo.x;
  float hN = vL.y;
  float dist = length(vW - cameraPosition);
  float pw = powerAt(vW.xz);
  int ti = int(vInfo.y + 0.5);
  vec3 tint = uTint[0];
  for (int i = 1; i < 6; i++) { if (i == ti) tint = uTint[i]; }
  int wi = int(vInfo.w + 0.5);
  vec3 wtint = uTint[0];
  for (int i = 1; i < 6; i++) { if (i == wi) wtint = uTint[i]; }
  float edgeOn = step(0.5, vInfo.y);
  vec3 col = mix(vec3(0.012, 0.02, 0.033), vec3(0.032, 0.048, 0.072), hN * hN);
  if (abs(n.y) < 0.5) {
    bool xf = abs(n.x) > 0.5;
    float u = xf ? vW.z : vW.x;
    vec2 cell = vec2(u / 2.3, vW.y / 3.1);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float win = smoothstep(0.1, 0.2, f.x) * smoothstep(0.9, 0.8, f.x) * smoothstep(0.2, 0.3, f.y) * smoothstep(0.84, 0.74, f.y);
    float r = hash12(id + seed * 91.7 + (xf ? 13.1 : 0.0));
    float lit = step(1.0 - vInfo.z, r);
    float warm = step(0.46, hash12(id * 1.37 + seed * 7.3));
    vec3 wc = mix(vec3(0.5, 0.68, 1.0), vec3(1.0, 0.6, 0.2), warm);
    wc = mix(wc, wtint, 0.55 * step(0.5, vInfo.w));
    float tw = 0.78 + 0.22 * sin(uTime * (0.3 + r * 1.1) + r * 60.0);
    float detail = 1.0 - smoothstep(170.0, 560.0, dist);
    float w = mix(vInfo.z * 0.3, win * lit * tw, detail);
    col += wc * w * 0.85 * pw;
    // falling data on a few facades: the city is made of data
    float colId = floor(u / 2.3);
    float stream = step(0.93, hash12(vec2(colId, seed * 31.0))) * step(0.55, fract(seed * 7.7));
    float fall = fract(vW.y * 0.045 + uTime * (0.25 + hash12(vec2(colId, 3.0)) * 0.5));
    col += tint * stream * smoothstep(0.75, 1.0, fall) * win * 1.1 * pw * detail;
    col += vec3(1.0, 0.55, 0.22) * 0.06 * (1.0 - smoothstep(0.0, 9.0, vW.y)) * pw;
  } else if (n.y > 0.5) {
    col = vec3(0.016, 0.024, 0.036);
    float tall = step(70.0, vS.y);
    float blink = step(0.55, fract(uTime * 0.5 + seed * 3.0));
    float rd = length(vL.xz * vS.xz);
    col += vec3(1.0, 0.12, 0.08) * tall * blink * (1.0 - smoothstep(0.25, 0.6, rd)) * 2.0;
  }
  float e = boxEdge(vL, vS, 0.32);
  col += tint * e * edgeOn * 0.95 * pw;
  col += tint * e * (1.0 - edgeOn) * 0.05 * pw;
  col += vec3(1.0, 0.9, 0.75) * frontAt(vW.xz) * 0.7;
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}`;

const GROUND_VS = /* glsl */`
varying vec3 vW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const GROUND_FS = /* glsl */`
${COMMON}
uniform vec4 uD[5];      // x, z, colour index, glow
uniform vec3 uTint[6];
uniform vec4 uBlvd[4];   // hub x, z -> district x, z
varying vec3 vW;
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 p = vW.xz;
  float pw = powerAt(p);
  vec2 q = abs(fract(p / ${CELL.toFixed(1)} + 0.5) - 0.5) * ${CELL.toFixed(1)};
  float street = 1.0 - smoothstep(3.4, 4.4, min(q.x, q.y));
  vec3 col = mix(vec3(0.008, 0.012, 0.02), vec3(0.02, 0.026, 0.036), street);
  float dash = step(0.5, fract((q.x < q.y ? p.y : p.x) / 7.0));
  float cl = (1.0 - smoothstep(0.06, 0.2, min(q.x, q.y))) * dash;
  col += vec3(1.0, 0.6, 0.2) * 0.1 * cl * pw;
  // boulevards: glowing edges and a moving pulse from the hub outwards
  for (int i = 0; i < 4; i++) {
    vec2 a = uBlvd[i].xy, b = uBlvd[i].zw;
    float d = segD(p, a, b);
    float along = dot(p - a, normalize(b - a));
    float rim = exp(-abs(d - 13.0) * 1.6);
    float pulse = smoothstep(0.86, 1.0, fract(along / 60.0 - uTime * 0.35));
    col += vec3(1.0, 0.64, 0.18) * (rim * 0.22 + (1.0 - smoothstep(0.0, 1.2, d)) * pulse * 0.5) * pw;
    col = mix(col, vec3(0.02, 0.025, 0.035), (1.0 - smoothstep(10.0, 12.0, d)) * 0.4);
  }
  // district plazas: hologram rings
  for (int i = 0; i < 5; i++) {
    vec2 c = uD[i].xy; float g = uD[i].w;
    vec3 t = uTint[0];
    int ci = int(uD[i].z + 0.5);
    for (int k = 1; k < 6; k++) { if (k == ci) t = uTint[k]; }
    float r = length(p - c);
    float ang = atan(p.y - c.y, p.x - c.x);
    float rings = exp(-abs(r - 24.0) * 1.2) + exp(-abs(r - 46.0) * 1.4) * step(0.5, fract(ang * 6.0 + uTime * 0.2)) + exp(-abs(r - 66.0) * 2.0) * 0.6;
    float pool = exp(-r * r / 2600.0) * 0.18;
    col += t * (rings * 0.55 + pool) * g;
    col = mix(col, vec3(0.012, 0.016, 0.024), (1.0 - smoothstep(60.0, 70.0, r)) * 0.5 * step(0.01, g));
  }
  col += vec3(1.0, 0.9, 0.75) * frontAt(p) * 0.5;
  gl_FragColor = vec4(fogIt(col, vW), 1.0);
}`;

const TRAIL_VS = /* glsl */`
attribute vec4 aLane;   // length, speed, seed, type
varying vec2 vUv; varying vec4 vLane; varying vec3 vW;
void main() { vUv = uv; vLane = aLane; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const TRAIL_FS = /* glsl */`
${COMMON}
uniform vec4 uD[5];
uniform float uTrailOn;
varying vec2 vUv; varying vec4 vLane; varying vec3 vW;
void main() {
  float s = vUv.x * vLane.x;
  float spacing = vLane.w > 1.5 ? 40.0 : 24.0;
  float k = s / spacing - uTime * vLane.y / spacing + vLane.z * 17.0;
  float cid = floor(k); float fk = fract(k);
  float on = step(0.42, hash12(vec2(cid, vLane.z * 13.0)));
  float streak = smoothstep(0.0, 0.05, fk) * (1.0 - smoothstep(0.05, 0.62, fk));
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  vec3 c = vLane.w < 0.5 ? vec3(1.0, 0.24, 0.1) : (vLane.w < 1.5 ? vec3(1.0, 0.86, 0.66) : vec3(0.45, 0.85, 1.0));
  float plaza = 1.0;
  for (int i = 0; i < 5; i++) { plaza *= smoothstep(64.0, 80.0, length(vW.xz - uD[i].xy)); }
  float a = streak * on * across * across * plaza * powerAt(vW.xz) * uTrailOn * uExpo;
  a *= 1.0 - fogAmt(vW);
  gl_FragColor = vec4(c * a * 1.4, 1.0);
}`;

const SKY_VS = /* glsl */`varying vec3 vDir; void main() { vDir = position; vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }`;
const SKY_FS = /* glsl */`
uniform vec3 uHorizon; uniform float uGlow; uniform float uTime;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.55); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 top = vec3(0.004, 0.008, 0.016);
  vec3 col = mix(uHorizon, top, smoothstep(-0.02, 0.5, h));
  col += vec3(0.24, 0.12, 0.05) * pow(1.0 - clamp(abs(h) * 5.0, 0.0, 1.0), 3.0) * 0.3 * uGlow;
  vec2 sp = d.xz / max(h, 0.08) * 90.0;
  vec2 id = floor(sp); vec2 f = fract(sp) - 0.5;
  float st = step(0.985, h21(id)) * (1.0 - smoothstep(0.0, 0.12, length(f))) * smoothstep(0.08, 0.3, h);
  col += vec3(0.7, 0.8, 1.0) * st * (0.4 + 0.3 * sin(uTime + h21(id) * 40.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const ADD_VS = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() { vUv = uv; vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

// light pillars / beams: fade with height, brighter at the silhouette
const BEAM_FS = /* glsl */`
${COMMON}
uniform vec3 uColor; uniform float uOn; uniform float uH;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float side = 1.0 - abs(dot(normalize(vN), V));
  float fall = 1.0 - smoothstep(0.0, 1.0, vUv.y);
  float pulse = 0.8 + 0.2 * sin(vW.y * 0.08 - uTime * 2.0);
  float a = (0.25 + side * side * 0.9) * fall * fall * pulse * uOn * uExpo;
  a *= 1.0 - fogAmt(vW) * 0.85;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

// hologram boxes (the guide's sections, the server, the owner, "yours")
const HOLO_VS = /* glsl */`
attribute float aAct;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vAct;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vW = wp.xyz; vL = position; vN = normalize(mat3(m) * normal); vAct = aAct;
  vS = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const HOLO_FS = /* glsl */`
${COMMON}
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uMissCol; uniform float uMiss; uniform float uOn; uniform float uBuild; uniform float uDim;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vAct;
void main() {
  float hy = vL.y * vS.y;
  if (hy > uBuild * vS.y + 0.001) discard;
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
  float e = boxEdge(vL, vS, 0.35);
  float scan = smoothstep(0.88, 1.0, fract(vW.y * 0.06 - uTime * 0.5));
  float lines = step(0.6, fract(vW.y * 0.7)) * 0.12;
  float front = exp(-abs(hy - uBuild * vS.y) * 0.9) * step(uBuild, 0.999);
  float act = vAct;
  vec3 col = mix(uColA, uColB, act);
  col = mix(col, uMissCol, uMiss * 0.7);
  float a = (0.05 + fr * 0.32 + e * 1.0 + scan * 0.22 + lines) * (0.45 + act * 1.7) * (1.0 - uDim * 0.75);
  a += front * 2.0;
  a *= uOn * (1.0 - fogAmt(vW) * 0.9) * uExpo;
  gl_FragColor = vec4(col * a, 1.0);
}`;

// textured screens: billboards, the giant phone, the owner's phone
const SCREEN_FS = /* glsl */`
${COMMON}
uniform sampler2D map; uniform float uBright; uniform float uOn; uniform vec4 uCrop; uniform vec3 uOff; uniform vec3 uOffEdge;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  vec3 c = texture2D(map, uv).rgb * uBright;
  // a screen that is off is a dim glass with a faint edge, never a black hole (uOff is zero for the billboards and the giant phone)
  vec2 e2 = abs(vUv - 0.5) * 2.0; float edge = smoothstep(0.82, 0.98, max(e2.x, e2.y));
  c = c * uOn + (uOff + uOffEdge * edge) * (1.0 - uOn);
  gl_FragColor = vec4(fogIt(c, vW), 1.0);
}`;

const SOLID_FS = /* glsl */`
${COMMON}
uniform vec3 uColor; uniform vec3 uRim; uniform float uRimOn;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
  vec3 c = uColor + uRim * fr * uRimOn;
  gl_FragColor = vec4(fogIt(c, vW), 1.0);
}`;

// the core of the power plant
const CORE_FS = /* glsl */`
${COMMON}
uniform vec3 uColor; uniform float uOn;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float side = 1.0 - abs(dot(normalize(vN), V));
  float bands = 0.55 + 0.45 * sin(vW.y * 0.5 - uTime * 7.0) * sin(vW.y * 0.13 + uTime * 2.0 + vUv.x * 6.283);
  float a = (0.16 + bands * 0.42 + side * 0.4) * uOn;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.12) * a * 0.8 * (1.0 - fogAmt(vW) * 0.8), 1.0);
}`;

// the scraped books: each slab drops into its category tower at its time in the real run
const BOOK_VS = /* glsl */`
attribute vec2 aBook;  // arrival (run seconds), colour variant
uniform float uRunT;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vHot; varying float vVar;
void main() {
  float vis = step(aBook.x, uRunT);
  float k = clamp((uRunT - aBook.x) / 2.4, 0.0, 1.0);
  vec4 wp = modelMatrix * instanceMatrix * vec4(position * vis, 1.0);
  wp.y += (1.0 - k) * (1.0 - k) * 34.0 * vis;
  vW = wp.xyz; vN = normal; vL = position; vHot = (1.0 - k) * vis; vVar = aBook.y;
  vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BOOK_FS = /* glsl */`
${COMMON}
uniform float uOn;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vHot; varying float vVar;
void main() {
  vec3 base = mix(vec3(0.16, 0.62, 0.42), vec3(0.62, 0.88, 1.0), step(0.72, vVar));
  base = mix(base, vec3(1.0, 0.66, 0.2), step(0.94, vVar));
  float e = boxEdge(vL, vS, 0.22);
  float top = step(0.5, vN.y);
  vec3 c = base * (0.32 + e * 0.9 + top * 0.25) + vec3(0.7, 1.0, 0.85) * vHot * 0.55;
  gl_FragColor = vec4(fogIt(c * uOn * powerAt(vW.xz), vW), 1.0);
}`;
const PAD_VS = /* glsl */`
attribute float aT;
varying vec3 vW; varying vec3 vL; varying float vT;
void main() { vT = aT; vL = position; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const PAD_FS = /* glsl */`
${COMMON}
uniform float uRunT; uniform float uOn;
varying vec3 vW; varying vec3 vL; varying float vT;
void main() {
  float on = smoothstep(vT, vT + 0.6, uRunT);
  vec2 e = 0.5 - abs(vL.xz);
  float rim = 1.0 - smoothstep(0.0, 0.08, min(e.x, e.y));
  vec3 c = vec3(0.31, 0.86, 0.55) * (rim * 1.2 + 0.12) * on * uOn;
  gl_FragColor = vec4(c * (1.0 - fogAmt(vW)), 1.0);
}`;
const RAIN_VS = /* glsl */`
attribute vec2 aR;
uniform float uTime;
varying float vA; varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float y = 150.0 - fract(uTime * (0.5 + aR.y * 0.5) + aR.x) * 160.0;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  wp.y += y;
  vA = smoothstep(-10.0, 8.0, y) * (1.0 - smoothstep(110.0, 150.0, y));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RAIN_FS = /* glsl */`
uniform float uOn;
varying float vA; varying vec2 vUv;
void main() { float a = (1.0 - smoothstep(0.0, 1.0, vUv.y)) * (1.0 - abs(vUv.x - 0.5) * 2.0) * vA * uOn; gl_FragColor = vec4(vec3(0.5, 1.0, 0.75) * a * 1.2, 1.0); }`;

const MOTE_VS = /* glsl */`
uniform float uTime; uniform float uPR; uniform vec3 uBox;
attribute float aSeed;
varying float vA; varying float vSeed;
void main() {
  vec3 p = position;
  p.y += uTime * (1.5 + aSeed * 3.0);
  p.x += sin(uTime * 0.3 + aSeed * 20.0) * 4.0;
  p = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vA = smoothstep(4.0, 30.0, d) * (1.0 - smoothstep(120.0, 220.0, d));
  vSeed = aSeed;
  gl_PointSize = (1.2 + aSeed * 2.2) * uPR * (220.0 / max(d, 1.0));
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FS = /* glsl */`
uniform float uOn;
varying float vA; varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = length(c);
  float a = (1.0 - smoothstep(0.1, 0.5, r)) * vA * uOn;
  vec3 col = vSeed > 0.7 ? vec3(1.0, 0.66, 0.25) : vec3(0.5, 0.75, 1.0);
  gl_FragColor = vec4(col * a * 0.55, 1.0);
}`;

const ROUTE_FS = /* glsl */`
${COMMON}
uniform float uDraw; uniform float uOn;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main() {
  float u = vUv.x;
  if (u > uDraw) discard;
  float head = exp(-(uDraw - u) * 60.0);
  float dash = 0.55 + 0.45 * step(0.5, fract(u * 90.0 - uTime * 1.5));
  vec3 c = vec3(1.0, 0.64, 0.16) * (0.7 * dash + head * 2.5);
  gl_FragColor = vec4(c * uOn, 1.0);
}`;

/* ------------------------------------------------------------------ post */
const POST_VS = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThr;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThr, uThr + 0.35, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;
const BLUR_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270;
  c += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;
const COMP_FS = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2;
uniform float uBloom; uniform float uB2; uniform float uTime; uniform float uGrain; uniform float uCA; uniform float uVig; uniform vec2 uRes; uniform float uExposure;
varying vec2 vUv;
float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * uCA * r2;
  vec3 col;
  col.r = texture2D(tScene, vUv + off).r;
  col.g = texture2D(tScene, vUv).g;
  col.b = texture2D(tScene, vUv - off).b;
  vec3 b = texture2D(tB1, vUv).rgb + texture2D(tB2, vUv).rgb * uB2;
  col += b * uBloom;
  col *= uExposure;
  col = col / (1.0 + col * 0.22) * 1.16;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col * vec3(1.05, 0.99, 0.9), smoothstep(0.35, 1.0, lum));
  col += vec3(0.004, 0.009, 0.018) * (1.0 - lum);
  float v = smoothstep(0.92, 0.28, length(d * vec2(1.0, 0.82)));
  col *= mix(1.0, v, uVig);
  col += (h(vUv * uRes + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------------ helpers */
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function v3(THREE, a) { return new THREE.Vector3(a[0], a[1], a[2]); }
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(wx - vx * t, wz - vz * t);
}


/* ------------------------------------------------------------------ the world */
// built in small steps: cfg.pause() hands the main thread back between districts, so a slow phone keeps animating the cold open
export async function createWorld(THREE, canvas, cfg) {
  const pause = cfg.pause || (() => Promise.resolve());
  // this renderer is also the WebGL test (no separate probe): no context here means the 2D version, as without WebGL at all
  const noGL = (e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { xpNoGL: true });
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) { throw noGL(e); }
  const gl = renderer.getContext();
  if (!gl || (gl.isContextLost && gl.isContextLost())) { try { renderer.dispose(); } catch (e) { /* ignore */ } throw noGL(new Error('No WebGL context')); }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x03060a, 1);
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (e) { gpu = ''; }
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu);
  const want = typeof cfg.tier === 'function' ? cfg.tier(gpu) : cfg.tier;   // the caller picks the starting tier from the GPU's name
  const tierName = TIERS[want] ? want : software ? 'minimal' : 'medium';
  const T0 = TIERS[tierName];
  const phone = !!cfg.phone;
  const isGL2 = renderer.capabilities.isWebGL2;

  const L = cfg.layout;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.6, 6000);
  const half = T0.half * CELL;

  /* shared uniforms */
  const U = {
    uTime: { value: 0 },
    uFogColor: { value: v3(THREE, [0.016, 0.026, 0.042]) },
    uHorizon: { value: v3(THREE, [0.075, 0.064, 0.062]) },
    uFogA: { value: 0.0036 },
    uFogB: { value: 0.011 },
    uCityHalf: { value: half },
    uPlant: { value: v3(THREE, [L.alwayson[0], 0, L.alwayson[1]]) },
    uOutR: { value: 0 },
    uInR: { value: 0 },
    uPower: { value: 1 },
    uExpo: { value: T0.post ? 1 : 1.32 },
    uTint: { value: [COL.cool, COL.amber, COL.tg, COL.mint, COL.power, COL.cool].map((c) => v3(THREE, c)) },
  };
  const uD = [...IDS.map((id, i) => new THREE.Vector4(L[id][0], L[id][1], i + 1, 0.6)), new THREE.Vector4(L.hub[0], L.hub[1], 1, 0.25)];
  const uBlvd = IDS.map((id) => new THREE.Vector4(L.hub[0], L.hub[1], L[id][0], L[id][1]));
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  function mat(vs, fs, uniforms, opts) {
    return keep(new THREE.ShaderMaterial(Object.assign({ vertexShader: vs, fragmentShader: fs, uniforms: Object.assign({}, U, uniforms || {}) }, opts || {})));
  }
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

  /* ---------------- sky + ground */
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(4000, 32, 16)), mat(SKY_VS, SKY_FS, { uGlow: { value: 1 } }, { side: THREE.BackSide, depthWrite: false }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const groundGeo = keep(new THREE.PlaneGeometry(half * 2 + 600, half * 2 + 600, 1, 1)); groundGeo.rotateX(-Math.PI / 2);
  const groundMat = mat(GROUND_VS, GROUND_FS, { uD: { value: uD }, uBlvd: { value: uBlvd } });
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.frustumCulled = false; scene.add(ground);
  await pause();

  /* ---------------- the city */
  const frames = {}; IDS.forEach((id) => { frames[id] = districtFrame(L, id); });
  const R = rng(20261022);
  const lots = [];
  const H = T0.half;
  // spots the camera passes through: towers there are kept below its path
  const KO = {}, KC = 40;
  const ko = cfg.keepOut || [];
  for (let i = 0; i < ko.length; i += 3) { const k = Math.floor(ko[i] / KC) + ',' + Math.floor(ko[i + 2] / KC); (KO[k] || (KO[k] = [])).push(ko[i], ko[i + 1], ko[i + 2]); }
  const ceilingAt = (x, z) => {
    let c = 1e9; const cx = Math.floor(x / KC), cz = Math.floor(z / KC);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = KO[(cx + a) + ',' + (cz + b)]; if (!list) continue;
      for (let i = 0; i < list.length; i += 3) if (Math.hypot(list[i] - x, list[i + 2] - z) < 27) c = Math.min(c, list[i + 1] - 13);
    }
    return c;
  };
  for (let gx = -H; gx < H; gx++) {
    if ((gx & 7) === 7) await pause();
    for (let gz = -H; gz < H; gz++) {
      const bx = gx * CELL + CELL / 2, bz = gz * CELL + CELL / 2;
      const sp = R();
      const set = sp < 0.3 ? [[0, 0, 22, 22]]
        : sp < 0.65 ? (R() < 0.5 ? [[-5.75, 0, 10.5, 22], [5.75, 0, 10.5, 22]] : [[0, -5.75, 22, 10.5], [0, 5.75, 22, 10.5]])
          : [[-5.75, -5.75, 10.5, 10.5], [5.75, -5.75, 10.5, 10.5], [-5.75, 5.75, 10.5, 10.5], [5.75, 5.75, 10.5, 10.5]];
      for (const [ox, oz, lw, ld] of set) {
        const x = bx + ox, z = bz + oz;
        const dHub = Math.hypot(x - L.hub[0], z - L.hub[1]);
        if (dHub < 54) continue;
        let near = null, nearD = 1e9, dB = 1e9;
        for (const id of IDS) {
          const d = Math.hypot(x - L[id][0], z - L[id][1]); if (d < nearD) { nearD = d; near = id; }
          dB = Math.min(dB, segDist(x, z, L.hub[0], L.hub[1], L[id][0], L[id][1]));
        }
        if (nearD < 74) continue;
        if (dB < 17) continue;
        const r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R();
        const down = Math.exp(-Math.pow(dHub / 430, 2));
        let h = 6 + Math.pow(r1, 2.1) * (24 + 78 * down);
        if (r2 < 0.045) h += 40 + r3 * 70;
        let canyon = false;
        if (dB < 44) { h = Math.max(h, 42 + r3 * 64); canyon = true; }
        if (nearD < 152) h = Math.min(h, 7 + r4 * 8);
        if (dHub < 112) h = Math.min(h, 10 + r4 * 10);
        const w = lw - 1.6 - r5 * 2.6, d = ld - 1.6 - R() * 2.6;
        h = Math.min(h, ceilingAt(x, z));
        if (h < 4) continue;
        const edgeP = canyon ? 0.34 : nearD < 260 ? 0.2 : 0.08;
        const edge = R() < edgeP ? (nearD < 280 ? TINT_OF[near] : (R() < 0.6 ? 1 : 5)) : 0;
        const wt = nearD < 230 ? TINT_OF[near] : 0;
        lots.push({ x, z, w, d, h, seed: R(), edge, lit: 0.1 + R() * 0.42, wt, dist: Math.max(Math.abs(x), Math.abs(z)) });
      }
    }
  }
  lots.sort((a, b) => a.dist - b.dist);
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1)); boxGeo.translate(0, 0.5, 0);
  const towerGeo = keep(boxGeo.clone());
  const info = new Float32Array(lots.length * 4);
  const towerMat = mat(TOWER_VS, TOWER_FS, {});
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, lots.length);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), p0 = new THREE.Vector3(), s0 = new THREE.Vector3();
  lots.forEach((t, i) => {
    towers.setMatrixAt(i, m4.compose(p0.set(t.x, 0, t.z), q0, s0.set(t.w, t.h, t.d)));
    info.set([t.seed, t.edge, t.lit, t.wt], i * 4);
  });
  towerGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  towers.instanceMatrix.needsUpdate = true; towers.frustumCulled = false;
  scene.add(towers);
  const countFor = (hh) => { const lim = hh * CELL; let n = 0; for (const t of lots) if (t.dist < lim) n++; return n; };
  await pause();

  /* ---------------- light trails on every street, and sky lanes over the boulevards */
  const lanes = [];
  for (let k = -H; k <= H; k++) {
    for (const axis of [0, 1]) {
      for (const side of [-1, 1]) lanes.push({ axis, pos: k * CELL + side * 1.9, dir: side, len: 2 * H * CELL, y: 0.12, w: 1.1, type: side < 0 ? 0 : 1 });
    }
  }
  IDS.forEach((id) => {
    const f = frames[id];
    for (let j = 0; j < 3; j++) lanes.push({ blvd: id, y: 62 + j * 11, off: (j - 1) * 7, len: f.dist, w: 1.6, type: 2, dir: j % 2 ? 1 : -1 });
  });
  const trailGeo = keep(new THREE.PlaneGeometry(1, 1)); trailGeo.rotateX(-Math.PI / 2);
  const laneAttr = new Float32Array(lanes.length * 4);
  const trailMat = mat(TRAIL_VS, TRAIL_FS, { uD: { value: uD }, uTrailOn: { value: 1 } }, additive);
  const trails = new THREE.InstancedMesh(trailGeo, trailMat, lanes.length);
  const qy = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  lanes.forEach((ln, i) => {
    let px, pz, ang;
    if (ln.blvd) {
      const f = frames[ln.blvd];
      px = (L.hub[0] + f.c[0]) / 2 + f.R[0] * ln.off; pz = (L.hub[1] + f.c[1]) / 2 + f.R[1] * ln.off;
      ang = Math.atan2(-(f.c[1] - L.hub[1]), f.c[0] - L.hub[0]);
    } else if (ln.axis === 0) { px = 0; pz = ln.pos; ang = 0; } else { px = ln.pos; pz = 0; ang = Math.PI / 2; }
    if (ln.dir < 0) ang += Math.PI;
    qy.setFromAxisAngle(yAxis, ang);
    trails.setMatrixAt(i, m4.compose(p0.set(px, ln.y, pz), qy, s0.set(ln.len, 1, ln.w)));
    laneAttr.set([ln.len, ln.type === 2 ? 46 : 16 + R() * 14, R(), ln.type], i * 4);
  });
  trailGeo.setAttribute('aLane', new THREE.InstancedBufferAttribute(laneAttr, 4));
  trails.instanceMatrix.needsUpdate = true; trails.frustumCulled = false; trails.renderOrder = 2;
  scene.add(trails);

  /* ---------------- floating data motes */
  const moteN = T0.motes;
  const mp = new Float32Array(moteN * 3), ms = new Float32Array(moteN);
  for (let i = 0; i < moteN; i++) { mp.set([R() * 360, R() * 200, R() * 360], i * 3); ms[i] = R(); }
  const moteGeo = keep(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3)); moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
  const moteMat = mat(MOTE_VS, MOTE_FS, { uPR: { value: 1 }, uBox: { value: new THREE.Vector3(360, 200, 360) }, uOn: { value: 1 } }, additive);
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.renderOrder = 3; scene.add(motes);
  await pause();

  /* ---------------- text on canvas (labels in the world; every caption that matters is also real DOM text) */
  const FONT_D = '"Archivo F", "Arial Narrow", Arial, sans-serif';
  const FONT_M = '"JetBrains F", ui-monospace, Consolas, monospace';
  const FONT_B = '"Inter F", system-ui, Arial, sans-serif';
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); draw(x, w, h);
    const t = keep(new THREE.CanvasTexture(c)); t.anisotropy = 2;
    return { canvas: c, ctx: x, tex: t };
  }
  function label(lines, color, width) {
    const sc = width <= 16 || T0.q < 2 ? 0.5 : 1;   // small labels (and light tiers) get a quarter of the texture memory
    const { tex } = canvasTex(512 * sc, 256 * sc, (x) => {
      const w = 512; x.scale(sc, sc);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = color; x.shadowBlur = 18 * sc;
      x.fillStyle = color; x.font = `500 46px ${FONT_M}`; x.fillText(lines[0], w / 2, 72);
      if (lines[1]) { x.fillStyle = '#ffffff'; x.font = `800 74px ${FONT_D}`; x.fillText(lines[1].toUpperCase(), w / 2, 160, w - 24); }
      if (lines[2]) { x.fillStyle = 'rgba(220,230,240,.85)'; x.font = `500 30px ${FONT_M}`; x.fillText(lines[2], w / 2, 222, w - 24); }
    });
    const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75 })));
    s.scale.set(width, width / 2, 1);
    return s;
  }
  function glowTex(rgb) {
    return canvasTex(128, 128, (x) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.25, `rgba(${rgb},.55)`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }).tex;
  }
  const glowAmber = glowTex('255,180,70'), glowBlue = glowTex('90,190,255'), glowRed = glowTex('255,80,70'), glowMint = glowTex('110,240,170');
  function glowSprite(tex, size) {
    const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.scale.set(size, size, 1); return s;
  }

  const P = (f, along, right, y) => new THREE.Vector3(f.c[0] + f.F[0] * along + f.R[0] * right, y, f.c[1] + f.F[1] * along + f.R[1] * right);
  const faceTo = (obj, f) => { obj.lookAt(obj.position.x + f.F[0], obj.position.y, obj.position.z + f.F[1]); };

  /* beacons: a pillar of light over every district (and the hub, for the finale) */
  const beaconGeo = keep(new THREE.CylinderGeometry(2.6, 2.6, 1000, 20, 1, true)); beaconGeo.translate(0, 500, 0);
  const beacons = [...IDS, 'hub'].map((id, i) => {
    const c = id === 'hub' ? L.hub : L[id];
    const col = id === 'hub' ? COL.amber : [COL.amber, COL.tg, COL.mint, COL.power][i];
    const m = new THREE.Mesh(beaconGeo, mat(ADD_VS, BEAM_FS, { uColor: { value: v3(THREE, col) }, uOn: { value: 0.6 }, uH: { value: 1000 } }, additive));
    m.position.set(c[0], 0, c[1]); m.frustumCulled = false; m.renderOrder = 4; scene.add(m);
    return m;
  });

  /* billboards with the real recorded demos (posters first; the video replaces them where it can play) */
  const billboards = {};
  const blankTex = canvasTex(64, 64, (x) => { x.fillStyle = '#0d1620'; x.fillRect(0, 0, 64, 64); }).tex;
  IDS.forEach((id) => {
    const f = frames[id];
    const side = id === 'booked' ? 46 : id === 'measured' ? -40 : id === 'alwayson' ? 44 : -34;
    const pos = P(f, -122, side, 46);
    const g = new THREE.Group(); g.position.copy(pos); faceTo(g, f);
    const sMat = mat(ADD_VS, SCREEN_FS, { map: { value: blankTex }, uBright: { value: 0.0 }, uOn: { value: 1 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) } });
    const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(46, 27.6)), sMat); g.add(screen);
    const frame = new THREE.Mesh(keep(new THREE.PlaneGeometry(48.4, 30)), mat(ADD_VS, SOLID_FS, { uColor: { value: v3(THREE, [0.02, 0.03, 0.045]) }, uRim: { value: v3(THREE, COL.amber) }, uRimOn: { value: 0 } }));
    frame.position.z = -0.3; g.add(frame);
    const pylon = new THREE.Mesh(boxGeo, mat(ADD_VS, SOLID_FS, { uColor: { value: v3(THREE, [0.02, 0.03, 0.04]) }, uRim: { value: v3(THREE, COL.cool) }, uRimOn: { value: 0.3 } }));
    pylon.scale.set(3, 46 - 14, 3); pylon.position.set(0, -46, -1.5); g.add(pylon);
    const tag = label(['RECORDED DEMO', '', ''], '#f5a524', 22); tag.position.set(-12, 17.6, 0.5); tag.scale.set(22, 11, 1); g.add(tag);
    scene.add(g);
    billboards[id] = { g, sMat, tag, tex: null, video: null };
  });
  await pause();

  /* ---------------- 01 ANSWERED: the guide's sections as glowing towers */
  const A = {}; {
    const f = frames.answered;
    const arcC = P(f, 10, 0, 0);
    const secs = cfg.sections;
    const n = secs.length;
    const holoGeo = keep(boxGeo.clone());
    const act = new Float32Array(n);
    holoGeo.setAttribute('aAct', new THREE.InstancedBufferAttribute(act, 1));
    const hm = mat(HOLO_VS, HOLO_FS, { uColA: { value: v3(THREE, [1.0, 0.55, 0.12]) }, uColB: { value: v3(THREE, [1.0, 0.82, 0.45]) }, uMissCol: { value: v3(THREE, [1.0, 0.3, 0.26]) }, uMiss: { value: 0 }, uOn: { value: 1 }, uBuild: { value: 1 }, uDim: { value: 0 } }, Object.assign({ side: THREE.DoubleSide }, additive));
    const mesh = new THREE.InstancedMesh(holoGeo, hm, n); mesh.frustumCulled = false; mesh.renderOrder = 5;
    const towersA = [];
    for (let k = 0; k < n; k++) {
      const phi = (-78 + (156 * k) / (n - 1)) * Math.PI / 180;
      const dx = -f.F[0] * Math.cos(phi) + f.R[0] * Math.sin(phi), dz = -f.F[1] * Math.cos(phi) + f.R[1] * Math.sin(phi);
      const x = arcC.x + dx * 44, z = arcC.z + dz * 44;
      const h = 30 + ((k * 37) % 17);
      towersA.push({ x, z, h, phi });
      const lab = label([secs[k].n, secs[k].short, secs[k].faq ? 'FAQ' : ''], '#f5a524', 11);
      lab.position.set(x, h + 6, z); scene.add(lab); towersA[k].label = lab;
    }
    scene.add(mesh);
    // the customer's question: an orb over the plaza, linked to the section it cites
    const orb = glowSprite(glowAmber, 16); orb.position.set(arcC.x, 30, arcC.z); scene.add(orb);
    const orbRed = glowSprite(glowRed, 16); orbRed.position.copy(orb.position); scene.add(orbRed);
    const linkGeo = keep(new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true)); linkGeo.translate(0, 0.5, 0); linkGeo.rotateX(Math.PI / 2);
    const link = new THREE.Mesh(linkGeo, mat(ADD_VS, BEAM_FS, { uColor: { value: v3(THREE, [1.0, 0.75, 0.3]) }, uOn: { value: 0 }, uH: { value: 1 } }, additive));
    link.frustumCulled = false; scene.add(link);
    const citeBeam = new THREE.Mesh(beaconGeo, mat(ADD_VS, BEAM_FS, { uColor: { value: v3(THREE, [1.0, 0.7, 0.25]) }, uOn: { value: 0 }, uH: { value: 1000 } }, additive));
    citeBeam.scale.set(0.8, 1, 0.8); citeBeam.frustumCulled = false; scene.add(citeBeam);
    // the search: a radar fan sweeping across the sections
    const fanGeo = keep(new THREE.PlaneGeometry(44, 46)); fanGeo.translate(22, 23, 0);
    const fan = new THREE.Mesh(fanGeo, mat(ADD_VS, `${COMMON}
      uniform float uOn; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
      void main(){ float a = pow(vUv.x, 2.0) * (1.0 - vUv.y * 0.7) * uOn; gl_FragColor = vec4(vec3(1.0, 0.7, 0.3) * a * 0.55, 1.0); }`,
    { uOn: { value: 0 } }, Object.assign({ side: THREE.DoubleSide }, additive)));
    fan.position.copy(arcC); fan.frustumCulled = false; scene.add(fan);
    Object.assign(A, { f, arcC, mesh, act, hm, towersA, orb, orbRed, link, citeBeam, fan, cite: cfg.citeIndex });
  }
  await pause();

  /* ---------------- 02 BOOKED: a giant phone in the sky, the server, the owner's phone */
  const B = {}; {
    const f = frames.booked;
    const W = 27, Hh = 55, rr = 4.6;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2 + rr, -Hh / 2); sh.lineTo(W / 2 - rr, -Hh / 2); sh.quadraticCurveTo(W / 2, -Hh / 2, W / 2, -Hh / 2 + rr);
    sh.lineTo(W / 2, Hh / 2 - rr); sh.quadraticCurveTo(W / 2, Hh / 2, W / 2 - rr, Hh / 2); sh.lineTo(-W / 2 + rr, Hh / 2);
    sh.quadraticCurveTo(-W / 2, Hh / 2, -W / 2, Hh / 2 - rr); sh.lineTo(-W / 2, -Hh / 2 + rr); sh.quadraticCurveTo(-W / 2, -Hh / 2, -W / 2 + rr, -Hh / 2);
    const bodyGeo = keep(new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: true, bevelSize: 0.7, bevelThickness: 0.7, bevelSegments: 2, curveSegments: 6 }));
    bodyGeo.center();
    const phone = new THREE.Group(); phone.position.copy(P(frames.booked, 4, 0, 70)); phone.scale.setScalar(1.36); faceTo(phone, f);
    phone.add(new THREE.Mesh(bodyGeo, mat(ADD_VS, SOLID_FS, { uColor: { value: v3(THREE, [0.012, 0.018, 0.028]) }, uRim: { value: v3(THREE, COL.tg) }, uRimOn: { value: 1.6 } })));
    const mini = canvasTex(T0.q >= 2 ? 512 : 256, T0.q >= 2 ? 1024 : 512, () => {});
    const scrMat = mat(ADD_VS, SCREEN_FS, { map: { value: mini.tex }, uBright: { value: T0.post ? 0.66 : 0.8 }, uOn: { value: 1 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) } });
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(W - 2.2, Hh - 2.2)), scrMat); scr.position.z = 1.86; phone.add(scr);
    const halo = glowSprite(glowBlue, 120); halo.position.z = -6; halo.material.opacity = 0.35; phone.add(halo);
    scene.add(phone);
    const holoBox = (colA, colB, act) => {
      const gg = keep(boxGeo.clone()); gg.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count).fill(act || 0), 1));
      return new THREE.Mesh(gg, mat(HOLO_VS, HOLO_FS, { uColA: { value: v3(THREE, colA) }, uColB: { value: v3(THREE, colB) }, uMissCol: { value: v3(THREE, COL.red) }, uMiss: { value: 0 }, uOn: { value: 1 }, uBuild: { value: 1 }, uDim: { value: 0 } }, additive));
    };
    const server = holoBox(COL.tg, [0.6, 0.9, 1.0]);
    server.position.copy(P(f, -30, -32, 0)); server.scale.set(13, 36, 13); server.frustumCulled = false; scene.add(server);
    const serverLab = label(['SERVER', 'Checks', 'price · hours · holidays'], '#5ac8ff', 15); serverLab.position.copy(server.position).add(new THREE.Vector3(0, 44, 0)); scene.add(serverLab);
    const owner = holoBox(COL.tg, [0.6, 0.9, 1.0], 0.2);
    owner.position.copy(P(f, -2, 46, 0)); owner.scale.set(10, 22, 10); owner.frustumCulled = false; scene.add(owner);
    const ownerTex = canvasTex(256, 512, () => {});
    const ownerScr = new THREE.Mesh(keep(new THREE.PlaneGeometry(10, 20)), mat(ADD_VS, SCREEN_FS, { map: { value: ownerTex.tex }, uBright: { value: 0.8 }, uOn: { value: 0 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOff: { value: v3(THREE, [0.05, 0.086, 0.125]) }, uOffEdge: { value: v3(THREE, [0.07, 0.29, 0.42]) } }));
    ownerScr.position.copy(owner.position).add(new THREE.Vector3(0, 36, 0)); faceTo(ownerScr, f); scene.add(ownerScr);
    const ownerLab = label(['SHOP OWNER', 'Telegram', 'alert'], '#5ac8ff', 13); ownerLab.position.copy(owner.position).add(new THREE.Vector3(0, 51, 0)); scene.add(ownerLab);
    const packet = glowSprite(glowBlue, 9); packet.visible = false; scene.add(packet);
    const ghosts = []; for (let i = 0; i < 10; i++) { const s = glowSprite(glowBlue, 6 - i * 0.45); s.visible = false; scene.add(s); ghosts.push(s); }
    const a0 = phone.position.clone().add(new THREE.Vector3(0, -36, 0)), a1 = server.position.clone().add(new THREE.Vector3(0, 37, 0));
    const b1 = ownerScr.position.clone();
    const curveA = new THREE.QuadraticBezierCurve3(a0, a0.clone().lerp(a1, 0.5).add(new THREE.Vector3(0, 26, 0)), a1);
    const curveB = new THREE.QuadraticBezierCurve3(a1, a1.clone().lerp(b1, 0.5).add(new THREE.Vector3(0, 40, 0)), b1);
    Object.assign(B, { f, phone, mini, scrMat, scrBase: scrMat.uniforms.uBright.value, server, owner, ownerTex, ownerScr, packet, ghosts, curveA, curveB, halo, step: -1, ownerDrawn: false, video: null, vt: null, hot: -1 });
  }
  await pause();

  /* ---------------- 03 MEASURED: 1,000 books build a skyline, 50 categories */
  const M = {}; {
    const f = frames.measured;
    const cats = cfg.cats; // [{name, count, t}]
    const slots = [];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 10; i++) slots.push({ i, j, score: Math.abs(i - 4.5) * 1.0 + j * 0.9 });
    slots.sort((a, b) => a.score - b.score);
    const order = cats.map((c, k) => k).sort((a, b) => cats[b].count - cats[a].count);
    const pos = new Array(cats.length);
    order.forEach((k, r) => { const s = slots[r]; pos[k] = P(f, (s.j - 2) * 8.6 - 6, (s.i - 4.5) * 8.6, 0); });
    const padGeo = keep(boxGeo.clone()); const padT = new Float32Array(cats.length);
    const pads = new THREE.InstancedMesh(padGeo, mat(PAD_VS, PAD_FS, { uRunT: { value: -1 }, uOn: { value: 1 } }, additive), cats.length);
    cats.forEach((c, k) => { pads.setMatrixAt(k, m4.compose(p0.copy(pos[k]).setY(0.05), q0, s0.set(7, 0.3, 7))); padT[k] = c.t; });
    padGeo.setAttribute('aT', new THREE.InstancedBufferAttribute(padT, 1)); pads.frustumCulled = false; scene.add(pads);
    const bookGeo = keep(boxGeo.clone());
    const nb = cfg.books.cat.length;
    const bAttr = new Float32Array(nb * 2);
    const bookMat = mat(BOOK_VS, BOOK_FS, { uRunT: { value: -1 }, uOn: { value: 1 } });
    const books = new THREE.InstancedMesh(bookGeo, bookMat, nb);
    for (let b = 0; b < nb; b++) {
      const k = cfg.books.cat[b], lvl = cfg.books.level[b];
      books.setMatrixAt(b, m4.compose(p0.copy(pos[k]).setY(0.4 + lvl * 0.44), q0, s0.set(6.2, 0.36, 6.2)));
      bAttr[b * 2] = cfg.books.t[b]; bAttr[b * 2 + 1] = R();
    }
    bookGeo.setAttribute('aBook', new THREE.InstancedBufferAttribute(bAttr, 2)); books.frustumCulled = false; scene.add(books);
    // requests raining into the plaza
    const rainGeo = keep(new THREE.PlaneGeometry(0.35, 9)); rainGeo.translate(0, 4.5, 0);
    const rainN = 90, rAttr = new Float32Array(rainN * 2);
    const rain = new THREE.InstancedMesh(rainGeo, mat(RAIN_VS, RAIN_FS, { uOn: { value: 0 } }, Object.assign({ side: THREE.DoubleSide }, additive)), rainN);
    for (let i = 0; i < rainN; i++) {
      qy.setFromAxisAngle(yAxis, R() * Math.PI);
      rain.setMatrixAt(i, m4.compose(P(f, (R() - 0.5) * 50 - 6, (R() - 0.5) * 92, 0), qy, s0.set(1, 1, 1)));
      rAttr[i * 2] = R(); rAttr[i * 2 + 1] = R();
    }
    rainGeo.setAttribute('aR', new THREE.InstancedBufferAttribute(rAttr, 2)); rain.frustumCulled = false; rain.renderOrder = 5; scene.add(rain);
    // the crown floats clear above the tallest stack once every book has landed (drawn over the stacks, never cut by a nearer one)
    let maxLvl = 0; for (let b = 0; b < nb; b++) if (cfg.books.level[b] > maxLvl) maxLvl = cfg.books.level[b];
    const crownY = Math.max(74, 0.4 + maxLvl * 0.44 + 0.36 + 7);
    const crown = label(['books.toscrape.com', '1,000 books', '50 categories'], '#4fd18b', 30); crown.position.copy(P(f, -6, 0, crownY)); crown.material.opacity = 0;
    crown.renderOrder = 8; scene.add(crown);
    Object.assign(M, { f, books, bookMat, pads, rain, crown });
  }
  await pause();

  /* ---------------- 04 ALWAYS ON: the power plant */
  const O = {}; {
    const f = frames.alwayson;
    const c = P(f, 0, 0, 0);
    const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(17, 19, 5, 40)), mat(ADD_VS, SOLID_FS, { uColor: { value: v3(THREE, [0.02, 0.03, 0.045]) }, uRim: { value: v3(THREE, COL.power) }, uRimOn: { value: 0.8 } }));
    base.position.set(c.x, 2.5, c.z); scene.add(base);
    const coreGeo = keep(new THREE.CylinderGeometry(4.6, 4.6, 86, 32, 1, true)); coreGeo.translate(0, 43, 0);
    const coreMat = mat(ADD_VS, CORE_FS, { uColor: { value: v3(THREE, COL.power) }, uOn: { value: 1 } }, Object.assign({ side: THREE.DoubleSide }, additive));
    const core = new THREE.Mesh(coreGeo, coreMat); core.position.copy(c); core.frustumCulled = false; scene.add(core);
    const inner = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.8, 0.8, 86, 12, 1, true)).translate(0, 43, 0), mat(ADD_VS, BEAM_FS, { uColor: { value: v3(THREE, [1, 1, 1]) }, uOn: { value: 1 }, uH: { value: 86 } }, additive));
    inner.position.copy(c); scene.add(inner);
    const ringGeo = keep(new THREE.TorusGeometry(11.5, 0.5, 8, 80)); ringGeo.rotateX(Math.PI / 2);
    const rings = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(ringGeo, mat(ADD_VS, `${COMMON}
        uniform vec3 uColor; uniform float uOn; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
        void main(){ float a = (0.12 + uOn * 1.6) * (0.8 + 0.2 * sin(vUv.x * 40.0 - uTime * 5.0)); gl_FragColor = vec4(uColor * a * (1.0 - fogAmt(vW) * 0.8), 1.0); }`,
      { uColor: { value: v3(THREE, COL.amber) }, uOn: { value: 0 } }, additive));
      m.position.set(c.x, 9 + i * 8.2, c.z); m.scale.setScalar(1 - i * 0.035); scene.add(m); rings.push(m);
    }
    const prof = [[17, 0], [14.5, 8], [12, 18], [11, 26], [11.4, 34], [12.6, 40]].map((p) => new THREE.Vector2(p[0], p[1]));
    const latheGeo = keep(new THREE.LatheGeometry(prof, 36));
    const coolMat = mat(ADD_VS, `${COMMON}
      uniform vec3 uColor; uniform float uOn; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fr = pow(1.0 - abs(dot(normalize(vN), V)), 3.0);
        float lip = smoothstep(37.0, 40.0, vL.y); float stripes = step(0.92, fract(vL.y * 0.25)) * 0.4;
        vec3 c = vec3(0.016, 0.024, 0.036) + uColor * (fr * 0.5 + lip * 1.4 + stripes) * uOn;
        gl_FragColor = vec4(fogIt(c, vW), 1.0); }`, { uColor: { value: v3(THREE, COL.power) }, uOn: { value: 1 } }, { side: THREE.DoubleSide });
    const cools = [];
    for (let k = 0; k < 4; k++) {
      const a = (45 + k * 90) * Math.PI / 180;
      const m = new THREE.Mesh(latheGeo, coolMat);
      m.position.copy(P(f, Math.cos(a) * 46, Math.sin(a) * 46, 0)); scene.add(m); cools.push(m);
    }
    // conduits: power flowing out of the plant along the ground
    const condN = 12, condGeo = keep(new THREE.PlaneGeometry(1, 1)); condGeo.rotateX(-Math.PI / 2); condGeo.translate(0.5, 0, 0);
    const condAttr = new Float32Array(condN * 4);
    const conduits = new THREE.InstancedMesh(condGeo, mat(TRAIL_VS, `${COMMON}
      uniform float uOn; varying vec2 vUv; varying vec4 vLane; varying vec3 vW;
      void main(){ float s = vUv.x * vLane.x; float k = fract(s / 18.0 - uTime * 1.6);
        float a = (0.2 + smoothstep(0.7, 1.0, k) * 1.4) * (1.0 - abs(vUv.y - 0.5) * 2.0) * (1.0 - vUv.x * 0.7) * uOn;
        gl_FragColor = vec4(vec3(0.62, 0.86, 1.0) * a * (1.0 - fogAmt(vW)), 1.0); }`, { uOn: { value: 1 } }, additive), condN);
    for (let i = 0; i < condN; i++) {
      const a = (i / condN) * Math.PI * 2 + 0.2;
      qy.setFromAxisAngle(yAxis, a);
      conduits.setMatrixAt(i, m4.compose(p0.set(c.x + Math.cos(a) * 19, 0.2, c.z - Math.sin(a) * 19), qy, s0.set(170, 1, 1.6)));
      condAttr.set([170, 0, R(), 0], i * 4);
    }
    condGeo.setAttribute('aLane', new THREE.InstancedBufferAttribute(condAttr, 4)); conduits.frustumCulled = false; scene.add(conduits);
    const alarm = glowSprite(glowRed, 30); alarm.position.set(c.x, 92, c.z); alarm.material.opacity = 0; scene.add(alarm);
    const httpsBeam = new THREE.Mesh(beaconGeo, mat(ADD_VS, BEAM_FS, { uColor: { value: v3(THREE, COL.mint) }, uOn: { value: 0 }, uH: { value: 1000 } }, additive));
    httpsBeam.position.set(c.x, 86, c.z); httpsBeam.scale.set(1.6, 1, 1.6); httpsBeam.frustumCulled = false; scene.add(httpsBeam);
    const svcLab = label(['nordlight.service', 'systemd', 'auto-restart'], '#9fdcff', 26); svcLab.position.set(c.x, 104, c.z); scene.add(svcLab);
    Object.assign(O, { f, coreMat, inner, rings, coolMat, conduits, alarm, httpsBeam, base, svcLab });
  }
  await pause();

  /* ---------------- 05 the hub: yours */
  const Y = {}; {
    const parts = [[26, 72, 0], [17, 40, 72], [8, 30, 112]];
    const yg = keep(boxGeo.clone()); yg.setAttribute('aAct', new THREE.BufferAttribute(new Float32Array(yg.attributes.position.count).fill(0.6), 1));
    const meshes = parts.map(([w, h, y0]) => {
      const mm = mat(HOLO_VS, HOLO_FS, { uColA: { value: v3(THREE, COL.amber) }, uColB: { value: v3(THREE, [1.0, 0.85, 0.5]) }, uMissCol: { value: v3(THREE, COL.red) }, uMiss: { value: 0 }, uOn: { value: 0 }, uBuild: { value: 0 }, uDim: { value: 0 } }, Object.assign({ side: THREE.DoubleSide }, additive));
      const m = new THREE.Mesh(yg, mm); m.position.set(L.hub[0], y0, L.hub[1]); m.scale.set(w, h, w); m.frustumCulled = false; scene.add(m); return { m, h, y0 };
    });
    const lab = label(['05', 'Yours', 'next demo'], '#f5a524', 40); lab.position.set(L.hub[0], 162, L.hub[1]); lab.material.opacity = 0; scene.add(lab);
    Object.assign(Y, { meshes, lab, total: 142 });
  }

  /* ---------------- the route (drawn in the flight-plan shot) */
  const route = { mesh: null };
  function setRoute(order) {
    if (route.mesh) { scene.remove(route.mesh); route.mesh.geometry.dispose(); }
    const pts = [new THREE.Vector3(L.hub[0], 40, L.hub[1])].concat(order.map((id) => new THREE.Vector3(L[id][0], 40, L[id][1])));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const geo = new THREE.TubeGeometry(curve, 300, 2.6, 6, false);
    route.mesh = new THREE.Mesh(geo, route.mat || (route.mat = mat(ADD_VS, ROUTE_FS, { uDraw: { value: 0 }, uOn: { value: 0 } }, Object.assign({ depthTest: false }, additive))));
    route.mesh.frustumCulled = false; route.mesh.renderOrder = 20; scene.add(route.mesh);
  }

  /* ---------------- the giant phone's screen: the Mini App, drawn like the real one */
  function rr(x, X, Yy, w, h, r) { x.beginPath(); x.moveTo(X + r, Yy); x.arcTo(X + w, Yy, X + w, Yy + h, r); x.arcTo(X + w, Yy + h, X, Yy + h, r); x.arcTo(X, Yy + h, X, Yy, r); x.arcTo(X, Yy, X + w, Yy, r); x.closePath(); }
  function drawMini(step) {
    const x = B.mini.ctx, w = 512, h = 1024, q = cfg.quote;
    x.setTransform(B.mini.canvas.width / 512, 0, 0, B.mini.canvas.width / 512, 0, 0);
    x.fillStyle = '#eef1f5'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, 86);
    x.fillStyle = '#2aabee'; x.font = `500 24px ${FONT_B}`; x.textAlign = 'left'; x.fillText('Close', 24, 54);
    x.textAlign = 'center'; x.fillStyle = '#111a24'; x.font = `700 25px ${FONT_B}`; x.fillText('NordLight Bikes', w / 2, 46);
    x.fillStyle = '#7d8a99'; x.font = `500 18px ${FONT_B}`; x.fillText('mini app', w / 2, 70);
    if (step >= 6) {
      x.fillStyle = '#ffffff'; rr(x, 24, 120, w - 48, 300, 26); x.fill();
      x.fillStyle = '#1f9d55'; x.beginPath(); x.arc(w / 2, 210, 54, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 12; x.lineCap = 'round'; x.beginPath(); x.moveTo(w / 2 - 24, 210); x.lineTo(w / 2 - 6, 230); x.lineTo(w / 2 + 28, 190); x.stroke();
      x.fillStyle = '#111a24'; x.font = `800 38px ${FONT_B}`; x.fillText('Booking confirmed', w / 2, 320);
      x.fillStyle = '#5a6370'; x.font = `500 22px ${FONT_B}`; x.fillText('See you in Verona!', w / 2, 362);
      x.fillStyle = '#ffffff'; rr(x, 24, 444, w - 48, 380, 26); x.fill();
      const rows = [['Bikes', `${q.bikes}× ${q.bike}`], ['Child seats', String(q.seats)], ['Duration', q.duration], ['Return by', 'closing time'], ['Where', 'Verona shop']];
      x.font = `500 22px ${FONT_B}`;
      rows.forEach((r, i) => { x.textAlign = 'left'; x.fillStyle = '#7d8a99'; x.fillText(r[0], 52, 500 + i * 52); x.textAlign = 'right'; x.fillStyle = '#111a24'; x.fillText(r[1], w - 52, 500 + i * 52); });
      x.textAlign = 'left'; x.fillStyle = '#111a24'; x.font = `800 30px ${FONT_B}`; x.fillText('Total', 52, 790); x.textAlign = 'right'; x.fillText(`€${q.total}`, w - 52, 790);
      B.mini.tex.needsUpdate = true; return;
    }
    x.textAlign = 'left'; x.fillStyle = '#111a24'; x.font = `800 40px ${FONT_B}`; x.fillText('Book an e-bike', 30, 146);
    x.fillStyle = '#6b7684'; x.font = `500 19px ${FONT_B}`; x.fillText('Verona · helmet & lock included', 30, 178);
    x.fillStyle = '#fff1d6'; rr(x, w - 110, 116, 82, 32, 16); x.fill(); x.fillStyle = '#c47d0e'; x.font = `700 16px ${FONT_B}`; x.textAlign = 'center'; x.fillText('DEMO', w - 69, 138);
    // bikes
    x.textAlign = 'left'; x.fillStyle = '#7d8a99'; x.font = `700 17px ${FONT_B}`; x.fillText('BIKE', 30, 228);
    [['City e-bike', 'about 60 km', `from €${q.cityHour}/h`], ['Trekking e-bike', 'about 90 km', `from €${q.trekHour}/h`]].forEach((b, i) => {
      const X = 30 + i * 232, sel = step >= 1 && i === 1;
      x.fillStyle = sel ? '#fff4df' : '#ffffff'; rr(x, X, 244, 220, 150, 20); x.fill();
      x.strokeStyle = sel ? '#f5a524' : '#dde3ea'; x.lineWidth = sel ? 5 : 2; rr(x, X, 244, 220, 150, 20); x.stroke();
      x.fillStyle = '#111a24'; x.font = `700 24px ${FONT_B}`; x.fillText(b[0], X + 18, 296);
      x.fillStyle = '#6b7684'; x.font = `500 18px ${FONT_B}`; x.fillText(b[1], X + 18, 328);
      x.fillStyle = '#111a24'; x.font = `600 19px ${FONT_B}`; x.fillText(b[2], X + 18, 368);
    });
    // duration
    x.fillStyle = '#7d8a99'; x.font = `700 17px ${FONT_B}`; x.fillText('DURATION', 30, 440);
    ['1 hour', 'Half day', 'Full day'].forEach((d, i) => {
      const X = 30 + i * 154, sel = step >= 2 && i === 2;
      x.fillStyle = sel ? '#111a24' : '#ffffff'; rr(x, X, 456, 144, 58, 16); x.fill();
      if (!sel) { x.strokeStyle = '#dde3ea'; x.lineWidth = 2; rr(x, X, 456, 144, 58, 16); x.stroke(); }
      x.fillStyle = sel ? '#ffffff' : '#111a24'; x.font = `600 21px ${FONT_B}`; x.textAlign = 'center'; x.fillText(d, X + 72, 493); x.textAlign = 'left';
    });
    // steppers
    x.fillStyle = '#ffffff'; rr(x, 30, 540, w - 60, 150, 20); x.fill();
    [['Bikes', step >= 3 ? q.bikes : 1], ['Child seats', step >= 3 ? q.seats : 0]].forEach((s, i) => {
      const Yy = 590 + i * 66;
      x.fillStyle = '#111a24'; x.font = `600 23px ${FONT_B}`; x.fillText(s[0], 54, Yy);
      x.strokeStyle = '#cfd6de'; x.lineWidth = 2; rr(x, w - 210, Yy - 30, 44, 44, 12); x.stroke(); rr(x, w - 104, Yy - 30, 44, 44, 12); x.stroke();
      x.fillStyle = '#111a24'; x.font = `600 26px ${FONT_B}`; x.textAlign = 'center';
      x.fillText('−', w - 188, Yy + 1); x.fillText('+', w - 82, Yy + 1); x.fillText(String(s[1]), w - 135, Yy + 1); x.textAlign = 'left';
    });
    // quote
    if (step >= 4) {
      x.fillStyle = '#ffffff'; rr(x, 30, 714, w - 60, 172, 20); x.fill();
      x.fillStyle = '#5a6370'; x.font = `500 20px ${FONT_B}`;
      x.fillText(`${q.bikes}× ${q.bike} · ${q.duration}`, 54, 756); x.textAlign = 'right'; x.fillText(`€${q.bikesTotal}`, w - 54, 756);
      x.textAlign = 'left'; x.fillText(`${q.seats}× child seat`, 54, 790); x.textAlign = 'right'; x.fillText(`€${q.seatsTotal}`, w - 54, 790);
      x.fillStyle = '#111a24'; x.font = `800 32px ${FONT_B}`; x.textAlign = 'left'; x.fillText('Total', 54, 850); x.textAlign = 'right'; x.fillText(`€${q.total}`, w - 54, 850);
      x.textAlign = 'left';
    }
    x.fillStyle = step >= 5 ? '#ffc04a' : (step >= 4 ? '#f5a524' : '#f1c886');
    rr(x, 30, 912, w - 60, 78, 20); x.fill();
    if (step >= 5) { x.strokeStyle = '#ffffff'; x.lineWidth = 6; rr(x, 30, 912, w - 60, 78, 20); x.stroke(); }
    x.fillStyle = '#1c1304'; x.font = `800 28px ${FONT_B}`; x.textAlign = 'center'; x.fillText(step >= 4 ? `Book · €${q.total}` : 'Book', w / 2, 962);
    B.mini.tex.needsUpdate = true;
  }
  function drawOwner() {
    const x = B.ownerTex.ctx, w = 512, h = 1024, q = cfg.quote;
    x.setTransform(0.5, 0, 0, 0.5, 0, 0);
    x.fillStyle = '#0e1621'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#17212b'; x.fillRect(0, 0, w, 120);
    x.fillStyle = '#2aabee'; x.beginPath(); x.arc(70, 60, 34, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.font = `800 34px ${FONT_B}`; x.textAlign = 'center'; x.fillText('N', 70, 72);
    x.textAlign = 'left'; x.font = `700 28px ${FONT_B}`; x.fillText('NordLight Bikes bot', 122, 54);
    x.fillStyle = '#6c7883'; x.font = `500 21px ${FONT_B}`; x.fillText('bot', 122, 86);
    x.fillStyle = '#182533'; rr(x, 28, 300, w - 80, 420, 26); x.fill();
    x.fillStyle = '#5ac8ff'; x.font = `800 34px ${FONT_B}`; x.fillText('New booking', 56, 360);
    x.fillStyle = '#e6edf3'; x.font = `500 27px ${FONT_B}`;
    [`${q.bikes}× ${q.bike}`, `${q.duration} · ${q.seats} child seat`, 'Pickup 09:00', `Total €${q.total}`, 'Pay at pickup'].forEach((l, i) => x.fillText(l, 56, 420 + i * 56));
    B.ownerTex.tex.needsUpdate = true;
  }

  /* ---------------- posters and (where they can play) videos on the billboards */
  const canMp4 = (() => { try { return !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'); } catch (e) { return false; } })();
  // a recording is fetched whole (so no half-finished stream is left hanging), decoded only while it plays, and freed after its scene
  function mkVideo(src) {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    v.xpAbort = ac;
    fetch(src, ac ? { signal: ac.signal } : undefined).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => { if (disposed || v.xpGone) return; v.xpUrl = URL.createObjectURL(blob); v.src = v.xpUrl; })
      .catch(() => { /* the poster or the replica stays: the captions still carry the facts */ });
    return v;
  }
  function freeVideo(v) {
    if (!v) return; v.xpGone = true;
    try { if (v.xpAbort) v.xpAbort.abort(); } catch (e) { /* done */ }
    const clear = () => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* gone */ } if (v.xpUrl) { URL.revokeObjectURL(v.xpUrl); v.xpUrl = null; } };
    const whole = () => { try { const b = v.buffered; return v.readyState >= 2 && b.length && b.end(b.length - 1) >= (v.duration || 1e9) - 0.3; } catch (e) { return true; } };
    if (v.xpUrl && !whole()) {   // still reading its blob: let it finish (a few seconds at most), then let go, so no read is cut off
      let done = false; const go = () => { if (!done && (whole() || v.xpLate)) { done = true; clear(); } };
      v.addEventListener('progress', go); v.addEventListener('canplaythrough', go); v.addEventListener('error', () => { v.xpLate = true; go(); }, { once: true });
      setTimeout(() => { v.xpLate = true; go(); }, 4000);
      try { v.pause(); } catch (e) { /* ignore */ }
    } else clear();
  }
  function loadBillboard(id) {
    const bb = billboards[id]; if (!bb || bb.loading) return; bb.loading = true;
    const img = new Image(); img.decoding = 'async';
    img.onload = () => {
      if (disposed) return;
      // posters are 1920x1154: drawn into a texture sized to the screen they light, not to the file
      const w = T0.q >= 2 ? 1024 : 512, h = Math.round((w * img.height) / img.width), c = document.createElement('canvas');
      c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      const t = keep(new THREE.CanvasTexture(c)); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      bb.tex = t; if (!bb.vt) bb.sMat.uniforms.map.value = t;
    };
    img.onerror = () => { /* the screen stays dark: the DOM captions still carry the facts */ };
    img.src = cfg.posters[id];
    const vurl = cfg.videos && cfg.videos[id];
    if (vurl && T.q >= 2 && canMp4) {
      const v = mkVideo(vurl); v.loop = true;
      v.addEventListener('loadeddata', () => {
        if (disposed || bb.vt || bb.video !== v) return;
        const vt = keep(new THREE.VideoTexture(v)); vt.minFilter = THREE.LinearFilter; vt.generateMipmaps = false; vt.needsUpdate = true;
        bb.vt = vt; bb.sMat.uniforms.map.value = vt; bb.sMat.uniforms.uCrop.value.set(0.03125, 0, 0.9375, 1);
      });
      bb.video = v;
    }
  }
  function releaseBillboard(bb) {   // its scene is over: stop decoding, give the memory back, keep the poster
    freeVideo(bb.video); bb.video = null; bb.loading = false;
    if (bb.vt) { bb.vt.dispose(); bb.vt = null; }
    bb.sMat.uniforms.map.value = bb.tex || blankTex; bb.sMat.uniforms.uCrop.value.set(0, 0, 1, 1);
  }
  // the giant phone: the real recording of the Mini App (telegram.mp4, 176 KB), synced to the film
  function phoneVideo(vt) {
    if (vt < 0) { if (B.video && !B.video.paused) B.video.pause(); return; }
    if (!B.video && cfg.phoneVideo && canMp4) {
      const v = mkVideo(cfg.phoneVideo); v.loop = false;
      v.addEventListener('seeked', () => { if (B.vt && B.video === v) B.vt.needsUpdate = true; });   // a paused video gets no frame callbacks: upload the frame we seeked to
      v.addEventListener('loadeddata', () => {
        if (disposed || B.vt || B.video !== v) return;
        const t = keep(new THREE.VideoTexture(v)); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
        B.vt = t; B.scrMat.uniforms.map.value = t; B.scrMat.uniforms.uCrop.value.set(PHONE_CROP[0], PHONE_CROP[1], PHONE_CROP[2], PHONE_CROP[3]);
      });
      B.video = v;
    }
    const v = B.video; if (!v || v.readyState < 1) return;
    const dur = v.duration || 10, want = Math.min(vt, dur - 0.05);
    if (Math.abs(v.currentTime - want) > 0.3 && (v.paused || vt < dur)) { try { v.currentTime = want; } catch (e) { /* not seekable yet */ } }
    if (vt > 0 && vt < dur - 0.05) { if (v.paused) v.play().catch(() => {}); } else if (!v.paused) v.pause();
  }
  function releasePhone() {
    freeVideo(B.video); B.video = null;
    if (B.vt) { B.vt.dispose(); B.vt = null; }
    B.scrMat.uniforms.map.value = B.mini.tex; B.scrMat.uniforms.uCrop.value.set(0, 0, 1, 1); B.step = -1;
  }

  /* ---------------- post-processing */
  const post = (() => {
    const tri = keep(new THREE.BufferGeometry());
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const ps = new THREE.Scene(); const quad = new THREE.Mesh(tri); quad.frustumCulled = false; ps.add(quad);
    const opt = { depthTest: false, depthWrite: false };
    const bright = keep(new THREE.ShaderMaterial(Object.assign({ vertexShader: POST_VS, fragmentShader: BRIGHT_FS, uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 0.5 } } }, opt)));
    const blur = keep(new THREE.ShaderMaterial(Object.assign({ vertexShader: POST_VS, fragmentShader: BLUR_FS, uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } } }, opt)));
    const comp = keep(new THREE.ShaderMaterial(Object.assign({ vertexShader: POST_VS, fragmentShader: COMP_FS, uniforms: {
      tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uBloom: { value: 1 }, uB2: { value: 0.8 }, uTime: { value: 0 },
      uGrain: { value: 0.04 }, uCA: { value: 0.012 }, uVig: { value: 1 }, uRes: { value: new THREE.Vector2() }, uExposure: { value: 1 } } }, opt)));
    let rts = [], level = 0, W = 1, Hh = 1;
    function free() { rts.forEach((r) => r.dispose()); rts = []; }
    function make(w, h, o) { const r = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), Object.assign({ depthBuffer: false, type: THREE.UnsignedByteType }, o || {})); rts.push(r); return r; }
    let sceneRT, a, b, c, d;
    function setSize(w, h, lvl) {
      free(); level = lvl; W = w; Hh = h;
      if (!lvl) return;
      sceneRT = make(w, h, { depthBuffer: true });
      const k1 = lvl >= 2 ? 2 : 4;
      a = make(w / k1 | 0, h / k1 | 0); b = make(w / k1 | 0, h / k1 | 0);
      c = make(w / (k1 * 2) | 0, h / (k1 * 2) | 0); d = make(w / (k1 * 2) | 0, h / (k1 * 2) | 0);
      comp.uniforms.uRes.value.set(w, h);
    }
    function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(ps, oc); }
    function blurPass(src, tmp, dst, sx, sy) {
      blur.uniforms.tDiffuse.value = src.texture; blur.uniforms.uDir.value.set(sx / src.width, 0); pass(blur, tmp);
      blur.uniforms.tDiffuse.value = tmp.texture; blur.uniforms.uDir.value.set(0, (sy == null ? sx : sy) / tmp.height); pass(blur, dst);
    }
    function render(p) {
      if (!level) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
      bright.uniforms.tDiffuse.value = sceneRT.texture; bright.uniforms.uTexel.value.set(1 / W, 1 / Hh); bright.uniforms.uThr.value = p.thr;
      pass(bright, a);
      blurPass(a, b, a, 1.0);
      blurPass(a, d, c, 1.4, 0.7);  // second, wider level: stretched sideways, like an anamorphic lens
      blurPass(c, d, c, 3.2, 0.5);
      comp.uniforms.uBloom.value = p.bloom;
      comp.uniforms.tScene.value = sceneRT.texture; comp.uniforms.tB1.value = a.texture; comp.uniforms.tB2.value = c.texture;
      comp.uniforms.uB2.value = level >= 2 ? 1.0 : 0.8; comp.uniforms.uTime.value = U.uTime.value;
      comp.uniforms.uGrain.value = p.grain; comp.uniforms.uCA.value = p.ca; comp.uniforms.uVig.value = p.vig; comp.uniforms.uExposure.value = p.exposure;
      pass(comp, null);
    }
    async function compileAsync() {   // the three post passes, compiled before their first use
      if (!level || !renderer.compileAsync) return;
      if (!renderer.extensions.has('KHR_parallel_shader_compile')) { for (const m of [bright, blur, comp]) { quad.material = m; renderer.compile(ps, oc); } return; }
      for (const m of [bright, blur, comp]) { quad.material = m; await renderer.compileAsync(ps, oc); }
    }
    return { setSize, render, free, compileAsync, get level() { return level; } };
  })();

  /* ---------------- sizing and quality */
  let T = T0, tier = tierName, vw = 1, vh = 1, resScale = 1;
  function resize(w, h) {
    vw = w; vh = h;
    // pixel ratio: the tier's, never above 1.5 on desktops / 1.25 on phones, and within the tier's pixel budget
    const budget = Math.sqrt((T.mp * 1e6) / Math.max(1, w * h));
    const dpr = Math.max(0.45, Math.min(window.devicePixelRatio || 1, T.dpr, phone ? 1.25 : 1.5, budget) * resScale);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    moteMat.uniforms.uPR.value = dpr;
    const bw = Math.floor(w * dpr), bh = Math.floor(h * dpr);
    post.setSize(bw, bh, T.post);
  }
  function lowerRes() {   // below the lowest tier: render fewer pixels (once, never back up)
    if (resScale < 1) return false;
    resScale = 0.72; resize(vw, vh); return true;
  }
  function setTier(name) {   // only ever steps down during the film
    if (!TIERS[name] || TIER_ORDER.indexOf(name) >= TIER_ORDER.indexOf(tier)) return;
    tier = name; T = TIERS[name];
    towers.count = countFor(Math.min(T.half, T0.half));
    U.uCityHalf.value = Math.min(T.half, T0.half) * CELL;
    motes.geometry.setDrawRange(0, Math.min(moteN, T.motes)); motes.visible = T.motes > 0;
    U.uExpo.value = T.post ? 1 : 1.32;
    if (T.q < 2) IDS.forEach((id) => { if (billboards[id].video) releaseBillboard(billboards[id]); });
    resize(vw, vh);
  }

  /* ---------------- per frame */
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), upV = new THREE.Vector3(0, 1, 0);
  let lastStep = -1, disposed = false;
  function frame(S) {
    U.uTime.value = S.time;
    // camera
    const c = S.cam;
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    camera.up.copy(upV);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);
    if (c.roll) camera.rotateZ(c.roll);
    if (Math.abs(camera.fov - c.fov) > 0.01) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    const sh = c.shift || [0, 0];
    if (Math.abs(sh[0]) > 1e-4 || Math.abs(sh[1]) > 1e-4) camera.setViewOffset(vw, vh, sh[0] * vw, sh[1] * vh, vw, vh);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    // global light, blackout and relight wave
    U.uOutR.value = S.power.outR; U.uInR.value = S.power.inR; U.uPower.value = S.power.global;
    sky.material.uniforms.uGlow.value = S.power.sky;
    U.uHorizon.value.set(0.075 * S.power.sky + 0.02, 0.064 * S.power.sky + 0.016, 0.062 * S.power.sky + 0.018);
    trailMat.uniforms.uTrailOn.value = S.trails;
    moteMat.uniforms.uOn.value = S.motes;
    for (let i = 0; i < beacons.length; i++) beacons[i].material.uniforms.uOn.value = S.beacons[i];
    for (let i = 0; i < 5; i++) uD[i].w = S.dglow[i];
    if (route.mesh) { route.mat.uniforms.uDraw.value = S.route; route.mat.uniforms.uOn.value = S.route > 0 ? S.routeOn : 0; route.mesh.visible = S.route > 0 && S.routeOn > 0; }
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i], bb = billboards[id], v = S.bill[id] || 0;
      bb.sMat.uniforms.uBright.value = bb.tex || bb.vt ? 0.5 * v : 0;
      bb.tag.material.opacity = v; bb.g.visible = v > 0.002;
      if (bb.video) {   // decoded only while its screen is lit
        if (v > 0.01 && bb.video.paused) bb.video.play().catch(() => {}); else if (v <= 0.01 && !bb.video.paused) bb.video.pause();
        if (!S.load[id] && v <= 0.01 && bb.loading) releaseBillboard(bb);
      }
      if (S.load[id] && !bb.loading) loadBillboard(id);
    }
    phoneVideo(S.video);
    if (B.video && !S.load.booked && S.video < 0) releasePhone();
    // 01 answered (buffers are uploaded only when they change)
    const a = S.ans;
    let actChanged = false;
    for (let k = 0; k < A.act.length; k++) if (A.act[k] !== a.act[k]) { A.act[k] = a.act[k]; actChanged = true; }
    if (actChanged) A.mesh.geometry.attributes.aAct.needsUpdate = true;
    A.hm.uniforms.uMiss.value = a.miss; A.hm.uniforms.uDim.value = a.dim;
    const citeChanged = A.lastCite !== a.cite; A.lastCite = a.cite;
    for (let k = 0; k < A.towersA.length; k++) {
      const t = A.towersA[k], grow = k === A.cite ? 1 + a.cite * 0.32 : 1;
      if (citeChanged && k === A.cite) { A.mesh.setMatrixAt(k, m4.compose(p0.set(t.x, 0, t.z), q0, s0.set(6.4, t.h * grow, 6.4))); A.mesh.instanceMatrix.needsUpdate = true; }
      t.label.position.y = t.h * grow + 6;
      t.label.material.opacity = a.labels * (k === A.cite ? 0.65 + 0.35 * a.cite : 0.55 * (1 - a.cite * 0.85) * a.others) * (1 - a.miss * 0.6);
    }
    A.orb.material.opacity = a.orb * (1 - a.miss); A.orbRed.material.opacity = a.orb * a.miss;
    const ct = A.towersA[A.cite];
    const topY = ct.h * (1 + a.cite * 0.32);
    A.citeBeam.position.set(ct.x, topY, ct.z); A.citeBeam.material.uniforms.uOn.value = a.cite * 1.4;
    tmpV.set(ct.x, topY - 2, ct.z); tmpV2.copy(A.orb.position);
    A.link.position.copy(tmpV2); A.link.lookAt(tmpV); A.link.scale.set(1, 1, tmpV.distanceTo(tmpV2)); A.link.material.uniforms.uOn.value = a.link;
    A.fan.material.uniforms.uOn.value = a.sweepOn;
    { const fx = -A.f.F[0] * Math.cos(a.sweep) + A.f.R[0] * Math.sin(a.sweep), fz = -A.f.F[1] * Math.cos(a.sweep) + A.f.R[1] * Math.sin(a.sweep); A.fan.rotation.y = Math.atan2(-fz, fx); }
    // 02 booked
    const b = S.book;
    if (b.step !== B.step && !B.vt) { B.step = b.step; drawMini(Math.max(0, b.step)); }   // the replica only until the recording plays
    if (!B.ownerDrawn) { drawOwner(); B.ownerDrawn = true; }
    B.phone.position.y = 70 + Math.sin(S.time * 0.6) * b.bob;
    B.phone.rotation.z = Math.sin(S.time * 0.4) * 0.03 * b.bob;
    B.ownerScr.material.uniforms.uOn.value = b.owner;
    B.halo.material.opacity = (0.25 + 0.2 * b.glow) * (0.35 + 0.65 * b.scr);
    B.scrMat.uniforms.uBright.value = B.scrBase * b.scr;   // the screen wakes as the title card leaves
    if (b.pA > 0 && b.pA < 1) showPacket(B.curveA, b.pA);
    else if (b.pB > 0 && b.pB < 1) showPacket(B.curveB, b.pB);
    else if (B.packet.visible) { B.packet.visible = false; for (let i = 0; i < B.ghosts.length; i++) B.ghosts[i].visible = false; }
    B.server.material.uniforms.uDim.value = 1 - b.server;
    if (B.hot !== b.serverHot) { B.hot = b.serverHot; B.server.geometry.attributes.aAct.array.fill(b.serverHot); B.server.geometry.attributes.aAct.needsUpdate = true; }
    // 03 measured
    const mm = S.meas;
    M.bookMat.uniforms.uRunT.value = mm.runT; M.pads.material.uniforms.uRunT.value = mm.runT;
    M.rain.material.uniforms.uOn.value = mm.rain; M.crown.material.opacity = mm.crown * 0.6;   // white type over the lit tower: kept under the bloom threshold
    M.crown.material.depthTest = !(S.seg && S.seg.id === 'measured');   // on top in its own scene; seen from afar later, towers may hide it
    // 04 always on
    const o = S.plant;
    O.coreMat.uniforms.uOn.value = o.core * 0.8; O.inner.material.uniforms.uOn.value = o.core * 0.55;
    for (let i = 0; i < O.rings.length; i++) {
      const r = O.rings[i], on = Math.max(0, Math.min(1, o.steps - i));
      r.material.uniforms.uOn.value = on * o.core + (o.crash > 0 && i === 8 ? o.crash * 0.6 : 0);
      r.material.uniforms.uColor.value.fromArray(on >= 1 ? COL.power : COL.amber);
    }
    O.coolMat.uniforms.uOn.value = o.core;
    O.conduits.material.uniforms.uOn.value = o.core;
    O.alarm.material.opacity = o.alarm;
    O.httpsBeam.material.uniforms.uOn.value = o.https;
    O.svcLab.material.opacity = o.label;
    // 05 yours
    const build = S.yours.build * Y.total;
    for (let i = 0; i < Y.meshes.length; i++) { const p = Y.meshes[i], k = Math.max(0, Math.min(1, (build - p.y0) / p.h)); p.m.visible = k > 0 && S.yours.on > 0; p.m.material.uniforms.uBuild.value = k; p.m.material.uniforms.uOn.value = S.yours.on; }
    Y.lab.material.opacity = S.yours.label;
    post.render(S.post);
  }

  function showPacket(curve, k) {
    B.packet.visible = true; curve.getPointAt(Math.min(1, k), tmpV); B.packet.position.copy(tmpV);
    for (let i = 0; i < B.ghosts.length; i++) {
      const g = B.ghosts[i], kk = k - (i + 1) * 0.022; g.visible = kk > 0;
      if (kk > 0) { curve.getPointAt(Math.min(1, kk), tmpV); g.position.copy(tmpV); g.material.opacity = 0.7 - i * 0.065; }
    }
  }

  function project(x, y, z, out) {
    tmpV.set(x, y, z).project(camera);
    out.x = (tmpV.x * 0.5 + 0.5) * vw; out.y = (-tmpV.y * 0.5 + 0.5) * vh; out.vis = tmpV.z < 1 && tmpV.z > -1;
    return out;
  }

  function compile() { try { renderer.compile(scene, camera); } catch (e) { /* compiled lazily on the first frame */ } }
  // every shader before the first frame, in parallel where the browser offers KHR_parallel_shader_compile: the main thread keeps
  // animating the cold open instead of freezing for half a second (without the extension this is the same one-off compile)
  async function compileAsync() {
    let par = false; try { par = renderer.extensions.has('KHR_parallel_shader_compile'); } catch (e) { /* older three */ }
    if (!renderer.compileAsync || !par) { compile(); try { await post.compileAsync(); } catch (e) { /* first frame */ } return; }   // (asking three without the extension only logs a warning)
    try { await renderer.compileAsync(scene, camera); if (!disposed) await post.compileAsync(); } catch (e) { if (!disposed) compile(); }
  }

  function dispose() {   // everything goes: videos emptied, render targets, geometries, materials, textures, the context
    disposed = true;
    IDS.forEach((id) => { freeVideo(billboards[id].video); billboards[id].video = null; });
    freeVideo(B.video); B.video = null;
    post.free();
    disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* ignore */ } });
    if (route.mesh) route.mesh.geometry.dispose();
    // three's sprites share ONE module-level geometry: it keeps a 'dispose' listener from every renderer that drew it, which would
    // pin this renderer, its context, the canvas and the whole overlay for the life of the page. Disposing it lets them go
    // (a later run simply uploads it again).
    const shared = new Set(); scene.traverse((o) => { if (o.isSprite && o.geometry) shared.add(o.geometry); });
    shared.forEach((g) => { try { g.dispose(); } catch (e) { /* ignore */ } });
    scene.clear();
    renderer.renderLists.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
    canvas.width = 1; canvas.height = 1;
  }

  function pauseMedia(p) { if (!p) return; IDS.forEach((id) => { const vd = billboards[id].video; if (vd && !vd.paused) vd.pause(); }); if (B.video && !B.video.paused) B.video.pause(); }

  // after compileAsync: upload the textures and the geometry a few objects per task (into a tiny target, culling off),
  // so the first real frame does not upload the whole city in one long task
  async function warm() {
    const texs = disposables.filter((d) => d && d.isTexture && !d.isVideoTexture);
    if (renderer.initTexture) for (let i = 0; i < texs.length; i++) { if (disposed) return; try { renderer.initTexture(texs[i]); } catch (e) { /* first frame */ } if (i % 5 === 4) await pause(); }
    const rt = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: true, type: THREE.UnsignedByteType });
    const kids = scene.children.slice(), was = kids.map((o) => o.visible), culled = [];
    scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    kids.forEach((o) => { o.visible = false; });
    try {
      for (let i = 0; i < kids.length; i++) {
        kids[i].visible = was[i];
        if (i % 10 === 9 || i === kids.length - 1) { if (disposed) return; renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); await pause(); }
      }
    } finally {
      if (!disposed) { kids.forEach((o, i) => { o.visible = was[i]; }); culled.forEach((o) => { o.frustumCulled = true; }); }
      rt.dispose();
    }
  }

  await pause();
  drawMini(0); await pause();
  drawOwner(); B.ownerDrawn = true;
  return { renderer, camera, frame, resize, setTier, lowerRes, setRoute, project, compile, compileAsync, warm, dispose, pauseMedia, gpu, software, get tier() { return tier; }, get post() { return T.post; }, get phoneLive() { return !!B.vt; }, towers: lots.length };
}
