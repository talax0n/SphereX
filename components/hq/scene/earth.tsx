import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, IcosahedronGeometry, type Mesh, MeshStandardMaterial, ShaderMaterial, Vector3 } from "three";
import { ctl } from "../game";
import { OVERLAY } from "./minimap";
import { useModel } from "./models";
import { COAST_GLSL, R, SEA_LEVEL, seaUniform } from "./planet";
import { newLook, skyNow } from "./sky";
import { NOISE_GLSL, SURFACE_UNIFORMS } from "./surface";


const ocean = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.16, metalness: 0, transparent: true });
ocean.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, SURFACE_UNIFORMS, { uSeas: seaUniform() });
  shader.vertexShader =
    "varying vec3 vDir;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDir = normalize(position);");
  shader.fragmentShader = `uniform float uTime;\nuniform float uNight;\nvarying vec3 vDir;\n${COAST_GLSL}${NOISE_GLSL}${shader.fragmentShader}`
    .replace(
      "#include <color_fragment>",
      /* glsl */ `#include <color_fragment>
      float k = coast(vDir);
      float depth = ${SEA_LEVEL.toFixed(3)} - seabed(k);
      if (depth < -0.03) discard;
      vec3 q = vDir * ${R.toFixed(1)};
      float rip = vnoise(q * 2.4 + vec3(uTime * 0.3, 0.0, uTime * 0.22)) * 0.6 + vnoise(q * 5.3 - vec3(0.0, uTime * 0.4, uTime * 0.33)) * 0.4;
      // the waterline itself, then swells rolling in toward it
      float edge = 1.0 - smoothstep(0.0, 0.12, depth + (rip - 0.5) * 0.06);
      float swell = smoothstep(0.72, 0.92, sin(depth * 26.0 - uTime * 1.6 + rip * 2.5) * 0.5 + 0.5) * (1.0 - smoothstep(0.08, 0.38, depth));
      float foam = max(edge, swell * smoothstep(0.35, 0.6, rip));
      vec3 shallow = vec3(0.22, 0.72, 0.68);
      vec3 deep = vec3(0.035, 0.2, 0.52);
      vec3 sea = mix(shallow, deep, smoothstep(0.04, 0.8, depth)) * (0.9 + 0.2 * rip);
      diffuseColor.rgb = mix(sea, vec3(0.95, 0.97, 1.0), foam);
      diffuseColor.a = mix(mix(0.5, 0.94, smoothstep(0.0, 0.5, depth)), 1.0, foam);`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `#include <normal_fragment_maps>
      {
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 r1 = cross(dy, normal), r2 = cross(normal, dx);
        float det = dot(dx, r1);
        vec3 grad = sign(det) * (dFdx(rip) * r1 + dFdy(rip) * r2);
        normal = normalize(abs(det) * normal - 0.03 * (1.0 - foam) * grad);
      }`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * smoothstep(0.8, 0.95, rip) * (1.0 - foam) * mix(0.35, 0.08, uNight);`,
    );
};

/** How far the air reaches above the ground; the glow fades to nothing there. */
const SHELL = R + 2.6;
const atmosphere = new ShaderMaterial({
  uniforms: { uColor: { value: new Color() }, uAlpha: { value: 1 }, uMap: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  // shades by how close each view ray passes the planet's centre, so it reads the same from any distance
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uAlpha;
    uniform float uMap;
    varying vec3 vWorld;
    void main() {
      vec3 d = normalize(vWorld - cameraPosition);
      float b = length(cameraPosition + d * max(-dot(cameraPosition, d), 0.0));
      float a;
      if (gl_FrontFacing) {
        if (b >= ${R.toFixed(1)}) discard;
        a = pow(smoothstep(${(R * 0.6).toFixed(2)}, ${R.toFixed(1)}, b), 4.0) * 0.28 * uMap;
      } else {
        if (b < ${R.toFixed(1)}) discard;
        a = pow(1.0 - clamp((b - ${R.toFixed(1)}) / ${(SHELL - R).toFixed(2)}, 0.0, 1.0), 2.4);
      }
      gl_FragColor = vec4(uColor, a * uAlpha);
      #include <colorspace_fragment>
    }`,
  side: DoubleSide,
  transparent: true,
  depthWrite: false,
});

const cloudMat = new MeshStandardMaterial({ color: "#ffffff", roughness: 1, alphaHash: true, emissive: "#ffffff" });
const CLOUD_UNIFORMS = { uTarget: { value: new Vector3() }, uMap: { value: 0 } };
cloudMat.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, CLOUD_UNIFORMS);
  shader.vertexShader = `attribute vec3 centre;\nuniform vec3 uTarget;\nuniform float uMap;\nvarying float vFade;\n${shader.vertexShader}`.replace(
    "#include <begin_vertex>",
    /* glsl */ `#include <begin_vertex>
    // clouds between the follow cam and the player, or right at the lens, thin out
    vec3 c = (modelMatrix * vec4(centre, 1.0)).xyz;
    vec3 seg = uTarget - cameraPosition;
    vec3 near = cameraPosition + seg * clamp(dot(c - cameraPosition, seg) / dot(seg, seg), 0.0, 1.0);
    vFade = mix(smoothstep(2.6, 4.6, distance(c, near)) * smoothstep(3.0, 7.0, distance(c, cameraPosition)), 1.0, uMap);`,
  );
  shader.fragmentShader = `varying float vFade;\n${shader.fragmentShader}`.replace(
    "#include <color_fragment>",
    "#include <color_fragment>\ndiffuseColor.a *= vFade;",
  );
};

const DAY = new Color("#8fc3ff");
const NIGHT = new Color("#3d55b0");
const dusk = new Color();
const look = newLook();

/** Oceans, the glow of the air at the planet's rim, and drifting clouds. */
export function Earth() {
  const { sea } = useModel("sea");
  const shell = useMemo(() => new IcosahedronGeometry(SHELL, 12), []);
  const { high, low } = useModel("clouds");
  const highRef = useRef<Mesh>(null);
  const lowRef = useRef<Mesh>(null);

  useFrame(({ camera }, dt) => {
    skyNow(look);
    const g = ctl.globe.t;
    const u = atmosphere.uniforms;
    u.uColor.value.copy(NIGHT).lerp(DAY, look.day).lerp(dusk.setHex(look.bottom), look.dusk * 0.7);
    // inside the air the glow would fog the whole view, so it fades in only once the camera is clear of it
    const out = Math.min(1, Math.max(0, (camera.position.length() - SHELL) / 3));
    u.uAlpha.value = (0.4 + 0.5 * look.day + 0.2 * look.dusk) * (0.55 + 0.45 * g) * out;
    u.uMap.value = 0.3 + 0.7 * g;
    CLOUD_UNIFORMS.uTarget.value.copy(ctl.player.n).multiplyScalar(R);
    CLOUD_UNIFORMS.uMap.value = g;
    cloudMat.emissiveIntensity = 0.08 + 0.17 * look.day;
    if (highRef.current) highRef.current.rotation.y += dt * 0.012;
    if (lowRef.current) lowRef.current.rotation.y -= dt * 0.008;
  });

  return (
    <>
      <mesh geometry={sea} material={ocean} />
      <mesh ref={highRef} layers={OVERLAY} geometry={high} material={cloudMat} />
      <mesh ref={lowRef} layers={OVERLAY} geometry={low} material={cloudMat} />
      <mesh layers={OVERLAY} geometry={shell} material={atmosphere} renderOrder={2} />
    </>
  );
}
