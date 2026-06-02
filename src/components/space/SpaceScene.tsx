import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Cinematic, photorealistic deep-space scene:
 * - Subtle dark nebula (charcoal + cold-blue whisps + sparse warm amber accents)
 * - Star field weighted toward white / cool-blue with rare warm stars
 * - Silver-grey moon (lunar mares) with white-cold rim light
 * - Faint amber sun glow off-screen
 * - Cosmic dust + rare comets (silver core, warm tail)
 */
export function SpaceScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    camera.position.z = 12;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x05060a, 1);
    mount.appendChild(renderer.domElement);

    // ===== NEBULA (subtle, realistic) =====
    const nebulaUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uScroll: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: nebulaUniforms,
        depthWrite: false,
        depthTest: false,
        transparent: true,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uIntensity;
          uniform float uScroll;
          uniform vec2 uMouse;
          varying vec2 vUv;

          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p); vec2 f = fract(p);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            vec2 u = f*f*(3.0-2.0*f);
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
          }
          float fbm(vec2 p){
            float v = 0.0; float a = 0.5;
            for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
            return v;
          }
          void main(){
            vec2 uv = vUv;
            vec2 p = uv * 2.5 + vec2(uTime * 0.010, uTime * -0.006);
            float n1 = fbm(p);
            float n2 = fbm(p * 1.8 + vec2(uTime*0.015, 0.0) + uMouse*0.15);
            float n3 = fbm(p * 0.7 - vec2(0.0, uTime*0.012));

            // Realistic palette: cold dust, deep slate, sparse warm whisps
            vec3 slate    = vec3(0.10, 0.12, 0.16) * pow(n1, 1.8);
            vec3 coldDust = vec3(0.32, 0.40, 0.52) * pow(n2, 2.6) * 0.55;
            vec3 warm     = vec3(1.00, 0.62, 0.20) * pow(smoothstep(0.72, 0.98, n1*n3), 3.0) * 0.35;

            vec3 col = slate * 0.6 + coldDust + warm;

            // Radial vignette focuses nebula off-center
            float r = distance(uv, vec2(0.62, 0.42));
            float vign = smoothstep(0.15, 1.1, r);
            col *= mix(0.5, 1.2, 1.0 - vign);

            float alpha = (0.12 + uScroll * 0.18) * uIntensity;
            gl_FragColor = vec4(col * alpha * 2.0, alpha);
          }
        `,
      })
    );
    nebula.frustumCulled = false;
    nebula.renderOrder = -10;
    scene.add(nebula);

    // ===== STAR FIELD =====
    const starCount = 4000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starSeeds = new Float32Array(starCount);
    // Weighted palette: mostly white/cool, very few warm stars
    const palette = [
      new THREE.Color(0xffffff),
      new THREE.Color(0xf2f5fa),
      new THREE.Color(0xdfe6f0),
      new THREE.Color(0xc7d2e0),
      new THREE.Color(0x9fb4c7), // cold blue
      new THREE.Color(0xffd9a0), // rare warm
    ];
    const paletteWeights = [40, 25, 15, 10, 7, 3];
    function pickColor() {
      const total = paletteWeights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < palette.length; i++) {
        r -= paletteWeights[i];
        if (r <= 0) return palette[i];
      }
      return palette[0];
    }
    for (let i = 0; i < starCount; i++) {
      const r = 40 + Math.random() * 220;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = -Math.random() * 300 + 20;
      const c = pickColor();
      starColors[i * 3] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
      starSizes[i] = Math.random() * 2.0 + 0.5;
      starSeeds[i] = Math.random() * 10;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
    starGeo.setAttribute("aSeed", new THREE.BufferAttribute(starSeeds, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        varying vec3 vColor;
        varying float vPulse;
        uniform float uTime;
        uniform float uPixelRatio;
        void main(){
          vColor = color;
          vPulse = 0.65 + 0.35 * sin(uTime * (0.5 + aSeed * 0.3) + aSeed * 6.28);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (260.0 / -mv.z) * vPulse;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vPulse;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = smoothstep(0.5, 0.0, d);
          float glow = smoothstep(0.5, 0.15, d) * 0.4;
          float a = core + glow;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor * (core + glow * 0.6), a * vPulse);
        }
      `,
      vertexColors: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ===== COSMIC DUST =====
    const dustCount = 900;
    const dustPos = new Float32Array(dustCount * 3);
    const dustVel = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 80;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
      dustVel[i * 3] = (Math.random() - 0.5) * 0.02;
      dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xc7d2e0,
      size: 0.05,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ===== MOON (lower-right) =====
    const planetGroup = new THREE.Group();
    planetGroup.position.set(7, -4, -3);
    scene.add(planetGroup);

    const planetUniforms = {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(-1, 0.5, 0.7).normalize() },
    };
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: planetUniforms,
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPos;
          void main(){
            vNormal = normalize(normalMatrix * normal);
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uLight;
          varying vec3 vNormal;
          varying vec3 vPos;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
          float noise(vec3 p){
            vec3 i = floor(p); vec3 f = fract(p);
            f = f*f*(3.0-2.0*f);
            float n = mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
            return n;
          }
          float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){v+=a*noise(p); p*=2.05; a*=0.5;} return v; }
          void main(){
            vec3 p = normalize(vPos);
            // Lunar surface: pale silver with darker mares
            float macro = fbm(p * 1.6);
            float mares = smoothstep(0.42, 0.58, fbm(p * 2.4 + vec3(1.3, 0.7, 2.1)));
            float craters = fbm(p * 12.0);

            vec3 highland = vec3(0.82, 0.83, 0.86); // pale silver
            vec3 mareCol  = vec3(0.32, 0.34, 0.38); // dark grey
            vec3 surface  = mix(highland, mareCol, mares * 0.85);
            // crater speckle
            surface *= 0.85 + craters * 0.30;
            surface *= 0.92 + macro * 0.16;

            float lambert = max(dot(vNormal, uLight), 0.0);
            // soft terminator
            float terminator = smoothstep(0.0, 0.25, lambert);
            // cool white rim
            float rim = pow(1.0 - max(dot(vNormal, vec3(0.0,0.0,1.0)), 0.0), 2.6);
            vec3 rimCol = vec3(0.92, 0.95, 1.00);

            vec3 col = surface * (0.08 + terminator * 1.05) + rimCol * rim * 0.35;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    planetGroup.add(planet);

    // Subtle silver atmosphere/glow
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(3.75, 64, 64),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {},
        vertexShader: `
          varying vec3 vNormal;
          void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main(){
            float i = pow(0.85 - dot(vNormal, vec3(0.0,0.0,1.0)), 3.5);
            vec3 c = vec3(0.78, 0.82, 0.90);
            gl_FragColor = vec4(c, i * 0.35);
          }
        `,
      })
    );
    planetGroup.add(halo);

    // ===== DISTANT SUN GLOW (off-screen upper-left) =====
    const sunGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main(){
            float d = distance(vUv, vec2(0.5));
            float core = smoothstep(0.5, 0.0, d);
            float glow = smoothstep(0.5, 0.05, d);
            float pulse = 0.92 + 0.08 * sin(uTime * 0.6);
            vec3 col = mix(vec3(1.0, 0.48, 0.10), vec3(1.0, 0.78, 0.30), core);
            float a = (glow * 0.55 + core * 0.5) * pulse;
            gl_FragColor = vec4(col, a * 0.6);
          }
        `,
      })
    );
    sunGlow.position.set(-14, 8, -18);
    sunGlow.renderOrder = -5;
    scene.add(sunGlow);

    // ===== COMETS =====
    type Comet = {
      head: THREE.Vector3;
      vel: THREE.Vector3;
      trail: THREE.Vector3[];
      line: THREE.Line;
      life: number;
      grand: boolean;
    };
    const comets: Comet[] = [];
    const cometMat = new THREE.LineBasicMaterial({
      color: 0xeef2f8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    function spawnComet() {
      const grand = Math.random() < 0.18;
      const head = new THREE.Vector3(
        (Math.random() - 0.5) * 40 - 25,
        Math.random() * 20 - 5,
        -Math.random() * 10
      );
      const vel = new THREE.Vector3(
        0.25 + Math.random() * 0.2,
        -0.05 - Math.random() * 0.1,
        0
      );
      const trailLen = grand ? 240 : 80;
      const positions = new Float32Array(trailLen * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geo, cometMat.clone());
      scene.add(line);
      const trail: THREE.Vector3[] = [];
      for (let i = 0; i < trailLen; i++) trail.push(head.clone());
      comets.push({ head, vel, trail, line, life: 0, grand });
    }
    let nextCometAt = performance.now() + 3000;

    // ===== Mouse + scroll state =====
    const mouse = new THREE.Vector2(0.5, 0.5);
    const targetMouse = new THREE.Vector2(0.5, 0.5);
    function onMove(e: MouseEvent) {
      targetMouse.x = e.clientX / window.innerWidth;
      targetMouse.y = 1 - e.clientY / window.innerHeight;
    }
    window.addEventListener("mousemove", onMove);

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);

    const warpState = { scroll: 0, intensity: 1.0, planetScale: 1.0 };
    (window as unknown as { __forgeScene?: typeof warpState }).__forgeScene = warpState;

    const clock = new THREE.Clock();
    let frameId = 0;
    function tick() {
      const t = clock.getElapsedTime();
      const dt = clock.getDelta() || 0.016;

      mouse.lerp(targetMouse, 0.06);
      nebulaUniforms.uMouse.value.set(mouse.x, mouse.y);

      const warp = warpState.scroll;
      camera.position.x = (mouse.x - 0.5) * 2.4;
      camera.position.y = (mouse.y - 0.5) * 1.6;
      camera.position.z = 12 - Math.min(warp, 1) * 8;
      camera.lookAt(0, 0, 0);

      nebulaUniforms.uTime.value = t;
      nebulaUniforms.uScroll.value = warp;
      nebulaUniforms.uIntensity.value = warpState.intensity;

      (sunGlow.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      starMat.uniforms.uTime.value = t;
      stars.rotation.y = t * 0.005;
      stars.rotation.x = t * 0.002;

      const dp = dust.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < dustCount; i++) {
        dp[i * 3] += dustVel[i * 3];
        dp[i * 3 + 1] += dustVel[i * 3 + 1];
        if (dp[i * 3] > 40) dp[i * 3] = -40;
        if (dp[i * 3] < -40) dp[i * 3] = 40;
        if (dp[i * 3 + 1] > 30) dp[i * 3 + 1] = -30;
        if (dp[i * 3 + 1] < -30) dp[i * 3 + 1] = 30;
      }
      dust.geometry.attributes.position.needsUpdate = true;

      planet.rotation.y += dt * (Math.PI / 60);
      planetUniforms.uTime.value = t;
      const planetTargetScale = Math.max(0.35, 1.0 - warp * 0.7);
      planetGroup.scale.setScalar(
        THREE.MathUtils.lerp(planetGroup.scale.x, planetTargetScale, 0.05)
      );
      planetGroup.position.x = 7 + warp * 2;
      planetGroup.position.y = -4 - warp * 1.5;

      if (performance.now() > nextCometAt) {
        spawnComet();
        nextCometAt = performance.now() + 14000 + Math.random() * 6000;
      }
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.life += dt;
        c.head.add(c.vel);
        c.trail.pop();
        c.trail.unshift(c.head.clone());
        const arr = c.line.geometry.attributes.position.array as Float32Array;
        for (let j = 0; j < c.trail.length; j++) {
          arr[j * 3] = c.trail[j].x;
          arr[j * 3 + 1] = c.trail[j].y;
          arr[j * 3 + 2] = c.trail[j].z;
        }
        c.line.geometry.attributes.position.needsUpdate = true;
        if (c.head.x > 40 || c.life > 14) {
          scene.remove(c.line);
          c.line.geometry.dispose();
          (c.line.material as THREE.Material).dispose();
          comets.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      starGeo.dispose();
      starMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      planet.geometry.dispose();
      (planet.material as THREE.Material).dispose();
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();
      nebula.geometry.dispose();
      (nebula.material as THREE.Material).dispose();
      sunGlow.geometry.dispose();
      (sunGlow.material as THREE.Material).dispose();
      comets.forEach((c) => {
        scene.remove(c.line);
        c.line.geometry.dispose();
        (c.line.material as THREE.Material).dispose();
      });
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden
    />
  );
}
