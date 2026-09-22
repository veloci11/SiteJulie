import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
  type Material,
  type Texture,
} from "three";
import type { InteriorTextures } from "./SurfaceDetails";

const tiledMaps = new WeakMap<Texture, Map<string, Texture>>();
function tiledMap(source: Texture, period: number, color: boolean) {
  let variants = tiledMaps.get(source);
  if (!variants) {
    variants = new Map();
    tiledMaps.set(source, variants);
  }
  const key = `${period}:${color}`;
  const existing = variants.get(key);
  if (existing) return existing;
  const texture = source.clone();
  texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  // Blender UV0 is measured in metres. The separate light atlas stays on UV1.
  texture.channel = 0;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(1 / period);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  variants.set(key, texture);
  return texture;
}

function detailedSurface(
  material: MeshStandardMaterial,
  details?: InteriorTextures,
) {
  const data = material.userData;
  // The circulation floor is one stone specification throughout the museum.
  // Room identity belongs to its walls and lighting, not an abrupt material seam.
  const floorStone = /^SURFACE (hall|extension) stone 1$/.test(material.name);
  const floorJoint = /^SURFACE (hall|extension) mortar 0$/.test(material.name);
  // The exported planter has its own material slot; other stone stays intact.
  const planter = /^SURFACE (hall|extension) stone 0$/.test(material.name);
  const maps = details?.[String(data.surfaceKind)];
  const period = planter
    ? 0.45
    : Math.max(0.02, Number(data.surfacePeriodMeters) || 1);
  const scale = Number(data.lightmapRadianceScale) || 1;
  const normalStrength = planter
    ? 0.055
    : Number(data.surfaceNormalStrength) || 0.35;
  const radiance = material.map;
  if (radiance) {
    radiance.channel = 1;
    radiance.magFilter = LinearFilter;
    radiance.minFilter = LinearMipmapLinearFilter;
    radiance.anisotropy = 4;
  }
  const result = new MeshStandardMaterial({
    name: material.name,
    color: planter
      ? new Color().fromArray(
          material.name.includes("hall")
            ? [0.105, 0.09, 0.067]
            : [0.105, 0.067, 0.044],
        )
      : floorStone
        ? new Color().fromArray([0.69, 0.65, 0.585])
        : floorJoint
          ? new Color().fromArray([0.47, 0.447, 0.39])
          : Array.isArray(data.surfaceColorLinear)
            ? new Color().fromArray(data.surfaceColorLinear)
            : new Color(1, 1, 1),
    map: maps ? tiledMap(maps.base, period, true) : null,
    normalMap: maps ? tiledMap(maps.normal, period, false) : null,
    normalScale: new Vector2(normalStrength, normalStrength),
    roughnessMap: maps?.roughness
      ? tiledMap(maps.roughness, period, false)
      : null,
    roughness: planter ? 0.96 : Number(data.surfaceRoughness) || 0.7,
    envMapIntensity: planter ? 0.25 : 1,
    metalness: 0,
    lightMap: radiance,
    lightMapIntensity: scale * Math.PI,
    side: material.side,
  });
  // The white-albedo bake contains the room's complete diffuse radiance.
  // Apply the detailed albedo once, retaining PBR specular/normal response but
  // avoiding a second diffuse contribution from the foliage/frame lights.
  result.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
      #ifdef USE_LIGHTMAP
        reflectedLight.directDiffuse = vec3(0.);
        reflectedLight.indirectDiffuse = material.diffuseColor *
          texture2D(lightMap, vLightMapUv).rgb * lightMapIntensity * RECIPROCAL_PI;
      #endif`,
    );
  };
  result.customProgramCacheKey = () => "interior-baked-diffuse-pbr-v1";
  result.userData = { ...data, bakedLighting: true };
  return result;
}

let plasterGrain: DataTexture | undefined;
function finePlaster() {
  if (plasterGrain) return plasterGrain;
  const side = 512;
  const pixels = new Uint8Array(side * side * 4);
  let seed = 37043;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Periodic lattices keep all three scales seamless. RGB packs mineral grain,
  // small trowel irregularities and broad plaster variation into the same reads.
  const lattice = (size: number) => ({
    size,
    values: Float32Array.from({ length: size * size }, random),
  });
  const mid = lattice(32);
  const midFine = lattice(64);
  const broad = lattice(4);
  const broadFine = lattice(8);
  const sample = (
    grid: { size: number; values: Float32Array },
    u: number,
    v: number,
  ) => {
    const x = u * grid.size;
    const y = v * grid.size;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = x - ix;
    const ty = y - iy;
    const fx = tx * tx * (3 - 2 * tx);
    const fy = ty * ty * (3 - 2 * ty);
    const nextX = (ix + 1) % grid.size;
    const row = iy * grid.size;
    const nextRow = ((iy + 1) % grid.size) * grid.size;
    const a = grid.values[row + ix] * (1 - fx) + grid.values[row + nextX] * fx;
    const b =
      grid.values[nextRow + ix] * (1 - fx) + grid.values[nextRow + nextX] * fx;
    return a * (1 - fy) + b * fy;
  };
  const sums = [0, 0, 0];
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const u = (x + 0.5) / side;
      const v = (y + 0.5) / side;
      pixels[i] = Math.round(random() * 255);
      pixels[i + 1] = Math.round(
        (sample(mid, u, v) * 0.7 + sample(midFine, u, v) * 0.3) * 255,
      );
      pixels[i + 2] = Math.round(
        (sample(broad, u, v) * 0.65 + sample(broadFine, u, v) * 0.35) * 255,
      );
      pixels[i + 3] = 255;
      for (let c = 0; c < 3; c++) sums[c] += pixels[i + c];
    }
  }
  // Neutral mean preserves the accepted plaster tint and baked exposure.
  const offsets = sums.map((sum) => 128 - sum / (side * side));
  for (let i = 0; i < pixels.length; i += 4)
    for (let c = 0; c < 3; c++)
      pixels[i + c] = Math.max(
        0,
        Math.min(255, Math.round(pixels[i + c] + offsets[c])),
      );
  plasterGrain = new DataTexture(pixels, side, side, RGBAFormat);
  plasterGrain.name = "Mineral plaster — grain, trowel, tonal variation";
  plasterGrain.colorSpace = NoColorSpace;
  plasterGrain.anisotropy = 4;
  plasterGrain.wrapS = plasterGrain.wrapT = RepeatWrapping;
  plasterGrain.magFilter = LinearFilter;
  plasterGrain.minFilter = LinearMipmapLinearFilter;
  plasterGrain.generateMipmaps = true;
  plasterGrain.needsUpdate = true;
  return plasterGrain;
}

/** Lighting and surface grain use separate scales: no enlarged albedo pixels. */
export function architecturalMaterial(
  material: Material,
  details?: InteriorTextures,
): Material {
  if (
    material instanceof MeshStandardMaterial &&
    material.name === "Daylight vaulted diffuse glazing"
  ) {
    const sky = material.emissiveMap ?? material.map;
    const result = new MeshBasicMaterial({
      name: material.name,
      map: sky,
      side: material.side,
      toneMapped: false,
    });
    // A distant photographic sky, sampled by viewing direction, remains at
    // infinity when walking beneath the roof instead of sliding like wallpaper.
    result.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 skyWorldPosition;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nskyWorldPosition=(modelMatrix*vec4(transformed,1.)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 skyWorldPosition;",
        )
        .replace(
          "#include <map_fragment>",
          `
          vec3 skyDirection = normalize(skyWorldPosition-cameraPosition);
          vec2 skyUv = vec2(fract(atan(skyDirection.z, skyDirection.x)/(2.*PI)+.5), .5-asin(clamp(skyDirection.y,-1.,1.))/PI);
          vec3 skyRadiance = texture2D(map, skyUv).rgb;
          // Slight glazing veil, with cloud contrast retained.
          diffuseColor.rgb *= mix(skyRadiance * 1.65, vec3(.73,.81,.86), .055);
        `,
        );
    };
    result.customProgramCacheKey = () => "vault-photographic-distant-sky-v1";
    return result;
  }
  if (
    material instanceof MeshStandardMaterial &&
    material.name.startsWith("SURFACE ")
  )
    return detailedSurface(material, details);
  const walls = material.name.startsWith("LIGHTMAP ");
  if (
    (!walls && !material.name.startsWith("BAKED ")) ||
    !(material instanceof MeshStandardMaterial)
  )
    return material;
  const scale = Number(
    walls
      ? material.userData.lightmapRadianceScale || 1
      : material.userData.bakeRadianceScale || 1,
  );
  const tint =
    walls && Array.isArray(material.userData.plasterColorLinear)
      ? new Color().fromArray(material.userData.plasterColorLinear)
      : new Color(1, 1, 1);
  if (material.map) {
    material.map.magFilter = LinearFilter;
    material.map.minFilter = LinearMipmapLinearFilter;
    material.map.anisotropy = 4;
  }
  const result = new MeshBasicMaterial({
    name: material.name,
    map: material.map,
    color: tint.multiplyScalar(scale),
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    toneMapped: true,
    vertexColors: false,
  });
  if (walls) {
    const grain = finePlaster();
    result.onBeforeCompile = (shader) => {
      shader.uniforms.plasterGrain = { value: grain };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 plasterPosition; varying vec3 plasterNormal;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nplasterPosition=(modelMatrix*vec4(transformed,1.)).xyz; plasterNormal=mat3(modelMatrix)*normal;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D plasterGrain; varying vec3 plasterPosition; varying vec3 plasterNormal;",
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 weights=abs(normalize(plasterNormal));
          weights/=max(.001,weights.x+weights.y+weights.z);
          // A 1.25m repeat: ~2.4mm grain, 2–4cm trowel marks, 15–30cm tone.
          // Mipmaps average detail naturally with distance; still three reads.
          vec3 plaster =
            texture2D(plasterGrain,plasterPosition.yz*.8).rgb * weights.x +
            texture2D(plasterGrain,plasterPosition.xz*.8).rgb * weights.y +
            texture2D(plasterGrain,plasterPosition.xy*.8).rgb * weights.z;
          float mineralVariation = dot(plaster-vec3(128./255.),vec3(.045,.035,.018));
          diffuseColor.rgb *= 1. + mineralVariation;
        `,
        );
    };
    result.customProgramCacheKey = () => "smooth-lightmap-mineral-plaster-v2";
  }
  result.userData = { ...material.userData, bakedLighting: true };
  return result;
}
