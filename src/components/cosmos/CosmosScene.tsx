import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";

/**
 * Cena 3D do cosmos: campo de estrelas profundo + aurora shader + cometa periódico.
 * Tudo otimizado: pausa quando aba escondida, qualidade reduzida em mobile.
 */
export function CosmosScene() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const starCount = isMobile ? 600 : 2200;

  return (
    <Canvas
      dpr={[1, isMobile ? 1.25 : 2]}
      camera={{ position: [0, 0, 1], fov: 75 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Stars count={starCount} />
      <AuroraPlane />
      {!isMobile && <Comet />}
      <CameraDrift />
    </Canvas>
  );
}

/* ─────────── Stars ─────────── */

function Stars({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, sizes, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const palette = [
      [0.92, 0.94, 1.0],   // branco-azulado
      [1.0, 0.95, 0.85],   // creme
      [0.7, 0.85, 1.0],    // azul gelo
      [1.0, 0.85, 0.5],    // dourado raro
    ];
    for (let i = 0; i < count; i++) {
      // distribuição em esfera com bias pra frente
      const r = Math.random() * 600 + 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = -Math.abs(r * Math.cos(phi)) - 50;
      sz[i] = Math.random() * 2 + 0.4;
      const p = palette[Math.random() < 0.04 ? 3 : Math.floor(Math.random() * 3)];
      col[i * 3] = p[0]; col[i * 3 + 1] = p[1]; col[i * 3 + 2] = p[2];
    }
    return { positions: pos, sizes: sz, colors: col };
  }, [count]);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, dt) => {
    if (document.hidden) return;
    uniforms.uTime.value += dt;
    if (ref.current) ref.current.rotation.y += dt * 0.005;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          varying float vTwinkle;
          uniform float uTime;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float seed = position.x * 0.13 + position.y * 0.71 + position.z * 0.37;
            vTwinkle = 0.55 + 0.45 * sin(uTime * 1.4 + seed);
            gl_PointSize = size * (300.0 / -mv.z) * vTwinkle;
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={`
          varying vec3 vColor;
          varying float vTwinkle;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = length(c);
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
            // halo dourado nas grandes
            vec3 glow = vColor + (vColor.r > 0.95 && vColor.g > 0.8 && vColor.b < 0.7 ? vec3(0.4, 0.2, 0.0) * (1.0 - d * 2.0) : vec3(0.0));
            gl_FragColor = vec4(glow, alpha);
          }
        `}
      />
    </points>
  );
}

/* ─────────── Aurora plane (shader plasma) ─────────── */

function AuroraPlane() {
  const ref = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
  }), []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      uniforms.uMouse.value.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [uniforms]);

  useFrame((_, dt) => {
    if (document.hidden) return;
    uniforms.uTime.value += dt * 0.18;
  });

  return (
    <mesh ref={ref} position={[0, 0, -10]}>
      <planeGeometry args={[viewport.width * 4, viewport.height * 4, 1, 1]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          uniform vec2 uMouse;

          // smooth noise
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
          }
          float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
            return v;
          }

          void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.5 + vec2(uTime * 0.1, uTime * 0.05);
            p += uMouse * 0.15;

            float n1 = fbm(p);
            float n2 = fbm(p * 1.7 + n1);
            float n3 = fbm(p * 0.5 - vec2(uTime * 0.07));

            // 3 camadas de cor
            vec3 cBlue   = vec3(0.31, 0.56, 0.97);  // #4F8EF7 ignition
            vec3 cPurple = vec3(0.49, 0.23, 0.93);  // #7C3AED depth
            vec3 cGreen  = vec3(0.06, 0.72, 0.51);  // #10B981 live

            vec3 col = vec3(0.0);
            col += cBlue   * smoothstep(0.4, 0.8, n1) * 0.5;
            col += cPurple * smoothstep(0.5, 0.9, n2) * 0.45;
            col += cGreen  * smoothstep(0.6, 0.95, n3) * 0.25;

            // vinheta — aurora aparece mais nas bordas/topo
            float vignette = 1.0 - smoothstep(0.0, 0.7, length(uv - vec2(0.5, 0.4)));
            float topBand = smoothstep(1.0, 0.3, uv.y);

            float alpha = (n1 * 0.4 + n2 * 0.3) * (vignette * 0.5 + topBand * 0.5) * 0.55;
            gl_FragColor = vec4(col, alpha);
          }
        `}
      />
    </mesh>
  );
}

/* ─────────── Comet ─────────── */

function Comet() {
  const ref = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);
  const state = useRef({ active: false, t: 0, startTime: 0 });

  const trail = useMemo(() => {
    const pos = new Float32Array(40 * 3);
    return pos;
  }, []);

  useFrame((_, dt) => {
    if (document.hidden) return;
    state.current.startTime += dt;
    if (!state.current.active && state.current.startTime > 10 + Math.random() * 8) {
      state.current.active = true;
      state.current.t = 0;
      state.current.startTime = 0;
    }
    if (state.current.active) {
      state.current.t += dt * 0.25;
      if (state.current.t >= 1) {
        state.current.active = false;
        if (ref.current) ref.current.visible = false;
        if (trailRef.current) trailRef.current.visible = false;
        return;
      }
      const t = state.current.t;
      const x = -8 + t * 16;
      const y = 5 - t * 8;
      const z = -15;
      if (ref.current) {
        ref.current.visible = true;
        ref.current.position.set(x, y, z);
      }
      // trail
      if (trailRef.current) {
        trailRef.current.visible = true;
        const arr = (trailRef.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < 40; i++) {
          const k = i / 40;
          arr[i * 3] = x - k * 3;
          arr[i * 3 + 1] = y + k * 1.5;
          arr[i * 3 + 2] = z;
        }
        (trailRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <mesh ref={ref} visible={false}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#ffe9b5" />
      </mesh>
      <points ref={trailRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trail, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffd28a"
          size={0.08}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/* ─────────── Camera drift ─────────── */

function CameraDrift() {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, dt) => {
    if (document.hidden) return;
    const t = state.clock.elapsedTime;
    // drift constante muito lento + parallax do mouse
    const tx = Math.sin(t * 0.05) * 0.6 + mouse.current.x * 0.4;
    const ty = Math.cos(t * 0.04) * 0.4 + mouse.current.y * 0.25;
    camera.position.x += (tx - camera.position.x) * dt * 0.8;
    camera.position.y += (ty - camera.position.y) * dt * 0.8;
    camera.lookAt(0, 0, -50);
  });
  return null;
}
