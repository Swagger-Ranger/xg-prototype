import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';
import { sceneStart } from './scene-time';
import styles from './SkyScene.module.css';

/**
 * 朝夕 — 60 秒走完一天。WebGL fragment shader 全屏合成。
 * 内容分层（back-to-front）：
 *   天空 → 太阳/光芒 → 月亮 → 晚霞云带 → 繁星 → 流星
 *   远山 → 校园建筑（钟楼/钟面指针/穹顶/主楼/校徽）→ 树
 *   近楼 → 校门 → 路灯 → 夜窗 → 招牌灯
 * 响应式：校园按 16:9 设计 aspect，宽屏屏幕居中收缩（campusW < 1）。
 */

const VERT = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
varying vec2 v_uv;

const float CYCLE = 60.0;
const float PI = 3.14159265359;
const float DESIGN_ASPECT = 1.78;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 skyTop(int n) {
  if (n == 0) return vec3(0.04, 0.05, 0.18);
  if (n == 1) return vec3(0.34, 0.22, 0.58);
  if (n == 2) return vec3(0.42, 0.74, 0.96);
  if (n == 3) return vec3(0.20, 0.55, 0.92);
  if (n == 4) return vec3(0.50, 0.28, 0.55);
  return vec3(0.07, 0.07, 0.24);
}
vec3 skyBot(int n) {
  if (n == 0) return vec3(0.12, 0.10, 0.30);
  if (n == 1) return vec3(0.99, 0.55, 0.36);
  if (n == 2) return vec3(0.99, 0.92, 0.78);
  if (n == 3) return vec3(0.74, 0.90, 0.98);
  if (n == 4) return vec3(0.99, 0.50, 0.30);
  return vec3(0.18, 0.13, 0.40);
}

vec3 paintBuilding(
  vec3 cs, vec2 uv,
  float xa, float xb, float h,
  vec3 baseCol, float pillarN, float floorN, float pillarDepth, float floorDepth
) {
  float aa = 0.0015;
  float mask = smoothstep(xa - aa, xa + aa, uv.x)
             * (1.0 - smoothstep(xb - aa, xb + aa, uv.x))
             * (1.0 - smoothstep(h - aa, h + aa, uv.y));
  if (mask < 0.001) return cs;
  vec3 col = baseCol;
  if (pillarN > 0.5) {
    float pT = (uv.x - xa) / (xb - xa) * pillarN;
    col -= vec3(step(0.90, fract(pT)) * pillarDepth);
  }
  if (floorN > 0.5) {
    float fT = (uv.y / h) * floorN;
    col -= vec3(step(0.88, fract(fT)) * floorDepth);
  }
  float yT = (h - uv.y) / max(h, 0.001);
  col -= vec3(0.025 * yT);
  return mix(cs, col, mask);
}

vec3 paintDisc(vec3 cs, vec2 uv, vec2 c, float r, vec3 fillCol, float aspect) {
  vec2 d = (uv - c) * vec2(aspect, 1.0);
  return mix(cs, fillCol, 1.0 - smoothstep(r - 0.002, r + 0.002, length(d)));
}
vec3 paintDome(vec3 cs, vec2 uv, vec2 c, float r, vec3 fillCol, float aspect) {
  if (uv.y < c.y - 0.001) return cs;
  vec2 d = (uv - c) * vec2(aspect, 1.0);
  return mix(cs, fillCol, 1.0 - smoothstep(r - 0.002, r + 0.002, length(d)));
}

float silhouette(float currentY, float buildingY) {
  return 1.0 - smoothstep(buildingY - 0.003, buildingY + 0.003, currentY);
}

float rectMask(vec2 uv, float xa, float xb, float ya, float yb) {
  float aa = 0.0010;
  return smoothstep(xa - aa, xa + aa, uv.x)
       * (1.0 - smoothstep(xb - aa, xb + aa, uv.x))
       * smoothstep(ya - aa, ya + aa, uv.y)
       * (1.0 - smoothstep(yb - aa, yb + aa, uv.y));
}

vec3 paintTree(vec3 cs, vec2 uv, vec2 base, float r, float seed,
               vec3 foliageCol, vec3 trunkCol, float aspect) {
  float halfBoxX = r * 1.5 / aspect;
  if (uv.x < base.x - halfBoxX || uv.x > base.x + halfBoxX) return cs;
  if (uv.y < base.y - 0.004 || uv.y > base.y + r * 2.5) return cs;
  float trunkHalfW = r * 0.10;
  float trunkH = r * 0.85;
  float dx = abs(uv.x - base.x) * aspect;
  float trunkMask = (1.0 - smoothstep(trunkHalfW, trunkHalfW + 0.0015, dx))
                  * smoothstep(base.y, base.y + 0.001, uv.y)
                  * (1.0 - smoothstep(base.y + trunkH, base.y + trunkH + 0.001, uv.y));
  vec2 fc = base + vec2(0.0, trunkH + r * 0.65);
  vec2 fd = (uv - fc) * vec2(aspect, 1.0);
  float dist = length(fd);
  if (dist > r * 1.4) return mix(cs, trunkCol, trunkMask);
  vec2 ns = fd * 18.0 + vec2(seed * 1.7, seed * 0.93);
  float n = noise(ns) * 0.55 + noise(ns * 2.6) * 0.30 + noise(ns * 5.2) * 0.15;
  float effR = r * (0.78 + (n - 0.5) * 0.55);
  float foliageMask = 1.0 - smoothstep(effR - 0.002, effR + 0.002, dist);
  vec3 col = cs;
  col = mix(col, trunkCol, trunkMask);
  col = mix(col, foliageCol, foliageMask);
  return col;
}

void main() {
  float t = mod(u_time, CYCLE) / CYCLE;
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;

  // ----- 响应式校园容器：宽屏时校园在中央收缩 -----
  float campusW = min(1.0, DESIGN_ASPECT / aspect);
  float campusLeft = 0.5 - campusW * 0.5;
  // 反向：当前 pixel 在校园设计空间里的位置（用于范围检查）
  float design_x = (uv.x - campusLeft) / campusW;

  // ===== 1. 天空 =====
  float seg = t * 6.0;
  int i = int(floor(seg));
  int j = int(mod(float(i) + 1.0, 6.0));
  float f = smoothstep(0.0, 1.0, fract(seg));
  vec3 top = mix(skyTop(i), skyTop(j), f);
  vec3 bot = mix(skyBot(i), skyBot(j), f);
  vec3 sky = mix(bot, top, pow(uv.y, 1.2));

  // ===== 2. 太阳 =====
  float sp = (t - 0.08) / (0.55 - 0.08);
  float sx = 0.0, sy = -1.0;
  if (sp >= 0.0 && sp <= 1.0) {
    sx = mix(0.18, 0.82, sp);
    sy = sin(sp * PI) * 0.81 - 0.08;
    vec2 d = (uv - vec2(sx, sy)) * vec2(aspect, 1.0);
    float dist = length(d);
    float core = 1.0 - smoothstep(0.050, 0.065, dist);
    float glow = pow(1.0 - smoothstep(0.05, 0.36, dist), 2.0);
    sky = mix(sky, vec3(1.0, 0.97, 0.82), core);
    sky += vec3(1.0, 0.78, 0.45) * glow * 0.55;
  }

  // ===== 2.5 太阳光芒条（日出 / 日落短时） =====
  float rayPhase = smoothstep(0.10, 0.16, t) * (1.0 - smoothstep(0.16, 0.24, t))
                 + smoothstep(0.46, 0.52, t) * (1.0 - smoothstep(0.52, 0.60, t));
  if (rayPhase > 0.01 && sp >= 0.0 && sp <= 1.0 && sy > -0.05) {
    vec2 toSun = (uv - vec2(sx, sy)) * vec2(aspect, 1.0);
    float angle = atan(toSun.y, toSun.x);
    float rays = abs(fract(angle * 6.0 / PI + 0.5) - 0.5) * 2.0;
    rays = pow(1.0 - rays, 8.0);
    float falloff = pow(1.0 - smoothstep(0.0, 0.55, length(toSun)), 1.6);
    sky += vec3(1.0, 0.78, 0.42) * rays * falloff * rayPhase * 0.45;
  }

  // ===== 3. 月亮 =====
  float mp = -1.0;
  if (t >= 0.62) mp = (t - 0.62) / 0.43;
  else if (t < 0.05) mp = (t + 0.38) / 0.43;
  if (mp >= 0.0 && mp <= 1.0) {
    float mx = mix(0.20, 0.80, mp);
    float my = sin(mp * PI) * 0.83 - 0.08;
    vec2 d = (uv - vec2(mx, my)) * vec2(aspect, 1.0);
    float dist = length(d);
    float core = 1.0 - smoothstep(0.045, 0.060, dist);
    float glow = pow(1.0 - smoothstep(0.045, 0.30, dist), 2.0);
    float crater = noise(d * 28.0) * 0.10;
    vec3 moonCol = vec3(0.96, 0.96, 1.0) - crater;
    sky = mix(sky, moonCol, core);
    sky += vec3(0.85, 0.87, 1.0) * glow * 0.30;
  }

  // ===== 4. 朝霞 / 晚霞云带（仅日出与日落时段） =====
  float cloudPhase = smoothstep(0.06, 0.14, t) * (1.0 - smoothstep(0.16, 0.26, t))
                   + smoothstep(0.46, 0.54, t) * (1.0 - smoothstep(0.58, 0.68, t));
  if (cloudPhase > 0.01) {
    for (int k = 0; k < 3; k++) {
      float layerY = 0.40 + float(k) * 0.045;
      float bandHalf = 0.024 - float(k) * 0.004;
      float drift = u_time * (0.0035 + float(k) * 0.0015);
      float yMask = smoothstep(layerY - bandHalf, layerY, uv.y)
                  * (1.0 - smoothstep(layerY, layerY + bandHalf, uv.y));
      if (yMask > 0.001) {
        vec2 cuv = vec2(uv.x * 4.5 + drift + float(k) * 1.7, uv.y * 16.0);
        float n = noise(cuv) * 0.62 + noise(cuv * 2.4) * 0.28 + noise(cuv * 6.0) * 0.10;
        float density = smoothstep(0.46, 0.66, n) * yMask * cloudPhase;
        vec3 cloudWarm = vec3(0.99, 0.58, 0.32);
        vec3 cloudCool = vec3(0.62, 0.42, 0.72);
        // 早晚色调：早晨偏粉橙、傍晚偏紫橙
        float warmness = 1.0 - smoothstep(0.40, 0.55, t);
        vec3 tint = mix(cloudCool, cloudWarm, warmness * 0.5 + 0.35);
        sky = mix(sky, tint, density * 0.55);
      }
    }
  }

  float nightMask = max(1.0 - smoothstep(0.06, 0.18, t), smoothstep(0.66, 0.82, t));

  // ===== 5. 繁星 =====
  if (nightMask > 0.01) {
    vec2 starUV = uv * vec2(aspect, 1.0) * 160.0;
    vec2 cell = floor(starUV);
    vec2 fcell = fract(starUV);
    float h = hash(cell);
    if (h > 0.93) {
      vec2 sp2 = vec2(hash(cell + 1.7), hash(cell + 5.3));
      float dStar = distance(fcell, sp2);
      float br = (1.0 - smoothstep(0.0, 0.05, dStar)) * (0.4 + 0.6 * hash(cell + 9.1));
      float tw = 0.6 + 0.4 * sin(u_time * (2.5 + hash(cell) * 4.0) + hash(cell) * 100.0);
      sky += vec3(1.0, 0.97, 0.92) * br * tw * nightMask;
    }
  }

  // ===== 6. 流星 =====
  float st = (mod(u_time, CYCLE) - CYCLE * 0.88) / 1.0;
  if (st >= 0.0 && st <= 1.0 && nightMask > 0.5) {
    vec2 a = vec2(0.15, 0.85);
    vec2 b = vec2(0.65, 0.45);
    vec2 head = mix(a, b, st);
    vec2 dHead = (uv - head) * vec2(aspect, 1.0);
    float headD = length(dHead);
    float headDot = 1.0 - smoothstep(0.0, 0.012, headD);
    vec2 dir = normalize((b - a) * vec2(aspect, 1.0));
    vec2 toHead = (uv - head) * vec2(aspect, 1.0);
    float along = dot(toHead, -dir);
    float perp = abs(dot(toHead, vec2(-dir.y, dir.x)));
    float trail = 0.0;
    if (along >= 0.0 && along < 0.20) {
      trail = (1.0 - along / 0.20) * (1.0 - smoothstep(0.0, 0.004, perp));
    }
    float life = sin(st * PI);
    sky += vec3(1.0, 0.95, 0.85) * (headDot + trail * 0.7) * life;
  }

  // ===== 7. 远山 =====
  float h_far = 0.06
    + 0.040 * sin(uv.x * 6.5 + 0.4)
    + 0.025 * sin(uv.x * 14.0 + 1.1)
    + 0.015 * sin(uv.x * 28.0);
  h_far = max(h_far, 0.02);
  vec3 farCol = mix(sky * 0.55, vec3(0.06, 0.07, 0.20), 0.45);
  sky = mix(sky, farCol, silhouette(uv.y, h_far));

  // ===== 8. 校园建筑群（mid 层，按 campus 响应式定位） =====
  vec3 midCol = mix(sky * 0.28, vec3(0.04, 0.05, 0.15), 0.58);
  // 把 designX 映射到 real uv.x: campusLeft + dx * campusW
  // 为减少出错，下面直接展开
  sky = paintBuilding(sky, uv, campusLeft + 0.04 * campusW,  campusLeft + 0.22 * campusW,  0.17, midCol, 14.0, 6.0, 0.07, 0.05);
  sky = paintBuilding(sky, uv, campusLeft + 0.285 * campusW, campusLeft + 0.355 * campusW, 0.27, midCol, 6.0, 5.0, 0.09, 0.04);

  // ----- 钟面 + 指针（10:10） -----
  {
    vec2 clockC = vec2(campusLeft + 0.320 * campusW, 0.215);
    float clockR = 0.020;
    vec2 dClock = (uv - clockC) * vec2(aspect, 1.0);
    float dl = length(dClock);
    if (dl < clockR + 0.005) {
      float aa = 0.0012;
      float rimMask = 1.0 - smoothstep(clockR + 0.0035 - aa, clockR + 0.0035 + aa, dl);
      sky = mix(sky, midCol * 0.55, rimMask);
      vec3 faceCol = vec3(0.92, 0.83, 0.55);
      float faceMask = 1.0 - smoothstep(clockR - aa, clockR + aa, dl);
      sky = mix(sky, faceCol, faceMask);
      // 12 刻度
      float ang = atan(dClock.y, dClock.x);
      float tick = abs(fract(ang / (PI / 6.0) + 0.5) - 0.5) * 2.0;
      float tickMask = step(0.93, 1.0 - tick) * faceMask
                     * step(clockR * 0.78, dl) * step(dl, clockR * 0.94);
      sky = mix(sky, midCol * 0.4, tickMask);
      // 时针
      float hourA = 5.0 * PI / 6.0;
      vec2 hDir = vec2(cos(hourA), sin(hourA));
      float hA = dot(dClock, hDir);
      float hP = abs(dot(dClock, vec2(-hDir.y, hDir.x)));
      float hourMask = step(0.0, hA) * (1.0 - smoothstep(0.0115, 0.0125, hA))
                     * (1.0 - smoothstep(0.0015, 0.0019, hP));
      // 分针
      float minA = PI / 6.0;
      vec2 mDir = vec2(cos(minA), sin(minA));
      float mA = dot(dClock, mDir);
      float mP = abs(dot(dClock, vec2(-mDir.y, mDir.x)));
      float minMask = step(0.0, mA) * (1.0 - smoothstep(0.0160, 0.0170, mA))
                    * (1.0 - smoothstep(0.0010, 0.0014, mP));
      // 中心钉
      float centerMask = 1.0 - smoothstep(0.0025, 0.0030, dl);
      vec3 handCol = vec3(0.04, 0.05, 0.10);
      float handsMask = max(max(hourMask, minMask), centerMask) * faceMask;
      sky = mix(sky, handCol, handsMask);
    }
  }

  // ----- 钟楼尖顶 -----
  {
    float spireYa = 0.27, spireYb = 0.325;
    if (uv.y >= spireYa && uv.y <= spireYb) {
      float spT = (uv.y - spireYa) / (spireYb - spireYa);
      float halfW = mix(0.020 * campusW, 0.001, spT);
      float xc = campusLeft + 0.320 * campusW;
      float aa = 0.0015;
      float mask = smoothstep(xc - halfW - aa, xc - halfW + aa, uv.x)
                 * (1.0 - smoothstep(xc + halfW - aa, xc + halfW + aa, uv.x));
      sky = mix(sky, midCol - vec3(0.02), mask);
    }
  }

  // 图书馆 + 半圆穹顶
  sky = paintBuilding(sky, uv, campusLeft + 0.45 * campusW, campusLeft + 0.62 * campusW, 0.18, midCol, 18.0, 4.0, 0.10, 0.03);
  sky = paintDome(sky, uv, vec2(campusLeft + 0.535 * campusW, 0.18), 0.05, midCol, aspect);

  // 现代主楼
  sky = paintBuilding(sky, uv, campusLeft + 0.67 * campusW, campusLeft + 0.81 * campusW, 0.30, midCol, 22.0, 0.0, 0.12, 0.0);

  // ----- 校徽（主楼正面） -----
  {
    vec2 crestC = vec2(campusLeft + 0.740 * campusW, 0.215);
    float r0 = 0.0145;
    vec2 dC = (uv - crestC) * vec2(aspect, 1.0);
    float dl = length(dC);
    if (dl < r0 + 0.003) {
      vec3 gold = vec3(0.96, 0.78, 0.32);
      // 外圈细环
      float ringMask = smoothstep(r0 - 0.0028, r0 - 0.0015, dl)
                     * (1.0 - smoothstep(r0 + 0.0002, r0 + 0.0016, dl));
      // 中心山峰三角
      float triH = r0 * 0.50;
      float triW = r0 * 0.68;
      float triMask = step(dC.y, triH - abs(dC.x / triW) * triH)
                    * step(-r0 * 0.42, dC.y) * step(abs(dC.x), triW);
      float intensity = 0.55 + 0.45 * nightMask;
      sky = mix(sky, gold, ringMask * intensity);
      sky = mix(sky, gold * 0.85, triMask * intensity);
      sky += gold * ringMask * intensity * 0.35 * nightMask;
    }
  }

  // 右附楼
  sky = paintBuilding(sky, uv, campusLeft + 0.86 * campusW, campusLeft + 0.97 * campusW, 0.17, midCol, 12.0, 6.0, 0.08, 0.04);

  // ===== 9. 校园景观树 =====
  vec3 foliageCol = mix(sky * 0.16, vec3(0.04, 0.09, 0.05), 0.62);
  vec3 trunkCol   = mix(sky * 0.10, vec3(0.05, 0.04, 0.03), 0.62);
  sky = paintTree(sky, uv, vec2(campusLeft + 0.255 * campusW, 0.060), 0.032, 1.30, foliageCol, trunkCol, aspect);
  sky = paintTree(sky, uv, vec2(campusLeft + 0.405 * campusW, 0.058), 0.028, 5.70, foliageCol, trunkCol, aspect);
  sky = paintTree(sky, uv, vec2(campusLeft + 0.645 * campusW, 0.062), 0.034, 9.20, foliageCol, trunkCol, aspect);
  sky = paintTree(sky, uv, vec2(campusLeft + 0.835 * campusW, 0.058), 0.028, 12.80, foliageCol, trunkCol, aspect);

  // ===== 10. 近景低楼 =====
  vec3 nearCol = mix(sky * 0.12, vec3(0.02, 0.02, 0.08), 0.62);
  sky = paintBuilding(sky, uv, campusLeft + 0.00 * campusW, campusLeft + 0.10 * campusW, 0.09,  nearCol, 6.0, 0.0, 0.05, 0.0);
  sky = paintBuilding(sky, uv, campusLeft + 0.18 * campusW, campusLeft + 0.30 * campusW, 0.11,  nearCol, 8.0, 0.0, 0.05, 0.0);
  sky = paintBuilding(sky, uv, campusLeft + 0.38 * campusW, campusLeft + 0.48 * campusW, 0.075, nearCol, 5.0, 0.0, 0.05, 0.0);
  sky = paintBuilding(sky, uv, campusLeft + 0.55 * campusW, campusLeft + 0.66 * campusW, 0.13,  nearCol, 8.0, 0.0, 0.06, 0.0);
  sky = paintBuilding(sky, uv, campusLeft + 0.76 * campusW, campusLeft + 0.88 * campusW, 0.10,  nearCol, 7.0, 0.0, 0.05, 0.0);

  // ===== 11. 校门（前景中央） =====
  {
    float gateXC = campusLeft + 0.50 * campusW;
    vec3 gateCol = vec3(0.012, 0.012, 0.05);
    float pH = 0.075;
    float pHW = 0.005;
    float leftXC = gateXC - 0.040 * campusW;
    float rightXC = gateXC + 0.040 * campusW;
    float leftPillar = rectMask(uv, leftXC - pHW, leftXC + pHW, 0.0, pH);
    float rightPillar = rectMask(uv, rightXC - pHW, rightXC + pHW, 0.0, pH);
    float beamMask = rectMask(uv, leftXC - pHW - 0.004, rightXC + pHW + 0.004, pH - 0.014, pH);
    float plateMask = rectMask(uv, gateXC - 0.040 * campusW, gateXC + 0.040 * campusW, pH + 0.004, pH + 0.025);
    float gateMask = max(max(leftPillar, rightPillar), max(beamMask, plateMask));
    sky = mix(sky, gateCol, gateMask);
    // 牌匾上点亮校名：暖色中央光晕（夜里强、白天弱）
    float plateInner = rectMask(uv, gateXC - 0.030 * campusW, gateXC + 0.030 * campusW, pH + 0.009, pH + 0.020);
    sky += vec3(1.0, 0.78, 0.40) * plateInner * (0.18 + 0.62 * nightMask);
  }

  // ===== 12. 路灯（前景，5 盏） =====
  for (int li = 0; li < 5; li++) {
    float lampX = campusLeft + (0.10 + float(li) * 0.18) * campusW;
    float poleHalfW = 0.0010;
    float poleH = 0.052;
    float poleMask = (1.0 - smoothstep(poleHalfW, poleHalfW + 0.0006, abs(uv.x - lampX) * aspect))
                   * smoothstep(0.0, 0.001, uv.y) * (1.0 - smoothstep(poleH - 0.001, poleH, uv.y));
    vec2 lampC = vec2(lampX, poleH + 0.005);
    vec2 dLamp = (uv - lampC) * vec2(aspect, 1.0);
    float lampD = length(dLamp);
    float lampR = 0.0045;
    float lampMask = 1.0 - smoothstep(lampR, lampR + 0.001, lampD);
    vec3 poleCol = vec3(0.025, 0.025, 0.07);
    vec3 lightCol = vec3(1.0, 0.80, 0.38);
    sky = mix(sky, poleCol, poleMask);
    float intensity = 0.30 + 0.70 * nightMask;
    sky = mix(sky, lightCol * intensity, lampMask);
    float glow = pow(1.0 - smoothstep(lampR, lampR + 0.030, lampD), 2.0);
    sky += lightCol * glow * intensity * 0.55;
  }

  // ===== 13. 夜间窗户（按 design_x 检查楼栋范围） =====
  float h_near_local = 0.04;
  if (design_x > 0.00 && design_x < 0.10) h_near_local = 0.09;
  else if (design_x > 0.18 && design_x < 0.30) h_near_local = 0.11;
  else if (design_x > 0.38 && design_x < 0.48) h_near_local = 0.075;
  else if (design_x > 0.55 && design_x < 0.66) h_near_local = 0.13;
  else if (design_x > 0.76 && design_x < 0.88) h_near_local = 0.10;

  float isWindowed = 0.0;
  if (design_x > 0.04 && design_x < 0.22 && uv.y < 0.17 && uv.y > h_near_local) isWindowed = 1.0;
  if (design_x > 0.285 && design_x < 0.355 && uv.y > 0.10 && uv.y < 0.25) isWindowed = 1.0;
  if (design_x > 0.45 && design_x < 0.62 && uv.y > h_near_local && uv.y < 0.17) isWindowed = 1.0;
  if (design_x > 0.67 && design_x < 0.81 && uv.y > h_near_local && uv.y < 0.29) isWindowed = 1.0;
  if (design_x > 0.86 && design_x < 0.97 && uv.y > h_near_local && uv.y < 0.16) isWindowed = 1.0;

  if (isWindowed > 0.5 && nightMask > 0.05) {
    vec2 wU = vec2(design_x * 75.0, uv.y * 60.0);
    vec2 wCell = floor(wU);
    vec2 wF = fract(wU);
    float winRect = step(0.22, wF.x) * step(wF.x, 0.78)
                  * step(0.30, wF.y) * step(wF.y, 0.72);
    float lit = step(0.78, hash(wCell + vec2(13.1, 7.7)));
    float warmth = 0.85 + 0.15 * sin(u_time * 0.8 + hash(wCell) * 30.0);
    sky += vec3(1.0, 0.82, 0.46) * winRect * lit * nightMask * warmth * 0.95;
  }

  // ===== 14. 主楼侧面竖向招牌灯 =====
  {
    float signXC = campusLeft + 0.795 * campusW;
    float signHalfW = 0.0028;
    float signYA = 0.115, signYB = 0.275;
    float xDist = abs(uv.x - signXC) * aspect;
    float yBand = smoothstep(signYA, signYA + 0.004, uv.y)
                * (1.0 - smoothstep(signYB - 0.004, signYB, uv.y));
    if (yBand > 0.001) {
      float core = (1.0 - smoothstep(signHalfW, signHalfW + 0.0012, xDist)) * yBand;
      float glow = pow(1.0 - smoothstep(signHalfW, signHalfW * 6.5, xDist), 2.2) * yBand;
      float charT = (uv.y - signYA) / (signYB - signYA) * 5.5;
      float segDim = 1.0 - 0.30 * step(0.91, fract(charT));
      float intensity = 0.40 + 0.60 * nightMask;
      vec3 signCol = vec3(1.0, 0.78, 0.40);
      sky += signCol * core * intensity * segDim;
      sky += signCol * glow * intensity * 0.30;
    }
  }

  gl_FragColor = vec4(sky, 1.0);
}
`;

export default function SkyScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.classList.add(styles.fallback);
      return;
    }

    const renderer = new Renderer({
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
    });
    const gl = renderer.gl;
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        u_time: { value: 0 },
        u_res: { value: [1, 1] },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.dpr = dpr;
      renderer.setSize(container.clientWidth, container.clientHeight);
      program.uniforms.u_res.value = [gl.canvas.width, gl.canvas.height];
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let rafId = 0;
    let paused = false;
    const start = sceneStart();

    const loop = (now: number) => {
      if (paused) return;
      program.uniforms.u_time.value = (now - start) / 1000;
      renderer.render({ scene: mesh });
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const onVisibility = () => {
      paused = document.hidden;
      if (!paused) rafId = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      cancelAnimationFrame(rafId);
      if (gl.canvas.parentElement === container) {
        container.removeChild(gl.canvas);
      }
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return <div ref={containerRef} className={styles.scene} aria-hidden="true" />;
}
