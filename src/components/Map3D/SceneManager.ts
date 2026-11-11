import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { REAL_HIGHWAYS, REAL_PARKS } from '../../data/realWorldBlock.ts';
import { GIS_TREES } from '../../data/gisTrees.ts';
import { groundHeight } from '../../utils/terrain.ts';
import { latLngToWorld, worldToLatLng } from '../../utils/geo.ts';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from '../../data/buildings.ts';
import { getFacadeTexture, getRoofTexture, getSatelliteGroundTexture } from '../../utils/buildingTextures.ts';

// Pre-allocated reusable vectors for zero GC in render loop
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export interface SceneCallbacks {
  onSelectBuilding: (building: BuildingPlot | null) => void;
  onGeotagPickPoint?: (lat: number, lng: number, elevation: number) => void;
}

export class ChissinSceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  // 3D Groups
  private realBuildingsGroup = new THREE.Group();
  private streetsGroup = new THREE.Group();
  private parksGroup = new THREE.Group();
  private treesGroup = new THREE.Group();
  private documentsGroup = new THREE.Group();
  private groundMesh: THREE.Mesh | null = null;
  private selectionHighlightBox: THREE.BoxHelper | null = null;

  // Data & State
  private buildings: BuildingPlot[] = [];
  private documents: GeotaggedDocument[] = [];
  private selectedBuildingId: string | null = null;
  private isGeotagModeActive = false;
  private showTrees = true;
  private isArchitecturalMode = false;

  // Render loop control
  private renderBusy = false;
  private renderDirty = false;
  private animFrameId = 0;
  private transitionTarget: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  private callbacks: SceneCallbacks;
  private interactiveMeshes: THREE.Object3D[] = [];
  private pinMeshesMap = new Map<string, THREE.Group>();
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Detect Software WebGL
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Scene with Mediterranean coastal sky tone and subtle distance fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbeafe);
    this.scene.fog = new THREE.Fog(0xdbeafe, 240, 1100);

    // 3. Camera
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    // Position camera overlooking the Chissin block looking toward Habima
    this.camera.position.set(-80, 140, 160);

    // 4. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 5. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 650;
    this.controls.target.set(0, 8, 0);

    this.controls.addEventListener('start', () => {
      this.transitionTarget = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // 6. Environment Map
    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    } catch (e) {
      console.warn('RoomEnvironment fallback:', e);
    }

    // 7. Lighting
    this.setupLighting();

    // 8. Add Groups
    this.scene.add(this.streetsGroup);
    this.scene.add(this.parksGroup);
    this.scene.add(this.realBuildingsGroup);
    this.scene.add(this.treesGroup);
    this.scene.add(this.documentsGroup);

    // 9. Build real terrain, real OSM highways, and real building envelopes!
    this.buildTerrain();
    this.buildRealHighways();
    this.buildRealParks();
    this.buildRealBuildings();

    // 10. Event Listeners
    this.bindEvents();

    this.requestRender();
  }

  private setupLighting() {
    // Warm Mediterranean Key Light (Sun)
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.1);
    sunLight.position.set(150, 220, 120);
    if (!this.isSoftwareGl) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 600;
      const d = 260;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0004;
      sunLight.shadow.normalBias = 0.02;
    }
    this.scene.add(sunLight);

    // Cool Sky & Ground Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0xecfdf5, 0x94a3b8, 1.15);
    hemiLight.position.set(0, 120, 0);
    this.scene.add(hemiLight);

    // Sea Breeze West Fill Light
    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.65);
    fillLight.position.set(-180, 90, -120);
    this.scene.add(fillLight);
  }

  /**
   * Ground surface following the real terrain (the block rises ~15 m from Dizengoff to Chissin).
   */
  private buildTerrain() {
    const size = 1600;
    const groundGeo = new THREE.PlaneGeometry(size, size, 200, 200);
    groundGeo.rotateX(-Math.PI / 2);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      map: getSatelliteGroundTexture(),
      roughness: 0.9,
      metalness: 0.05,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.receiveShadow = !this.isSoftwareGl;
    this.streetsGroup.add(this.groundMesh);
  }

  /**
   * A flat ribbon along a polyline, draped over the terrain.
   */
  private ribbonGeometry(points: { x: number; z: number }[], width: number, lift: number): THREE.BufferGeometry | null {
    // Densify so the ribbon follows the slope
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    pts.push(points[points.length - 1]);
    if (pts.length < 2) return null;

    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const nx = -dz * (width / 2);
      const nz = dx * (width / 2);
      for (const s of [1, -1]) {
        const x = p.x + nx * s;
        const z = p.z + nz * s;
        verts.push(x, groundHeight(x, z) + lift, z);
      }
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Streets and footpaths from OpenStreetMap centre-lines, with widths by street class.
   */
  private buildRealHighways() {
    const groups: Record<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }> = {
      road: {
        mat: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85, metalness: 0.1 }),
        geos: [],
      },
      chissin: {
        mat: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, metalness: 0.1 }),
        geos: [],
      },
      path: {
        mat: new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.95 }),
        geos: [],
      },
    };
    const WIDTH: Record<string, number> = {
      tertiary: 8,
      residential: 6.5,
      living_street: 5.5,
      service: 3.5,
      pedestrian: 4,
      footway: 2.2,
      path: 2.2,
      cycleway: 1.8,
      steps: 2,
    };

    REAL_HIGHWAYS.forEach((hwy) => {
      if (hwy.points.length < 2) return;
      const isPath = ['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(hwy.type);
      const key = isPath ? 'path' : hwy.name.includes('חיסין') ? 'chissin' : 'road';
      const geo = this.ribbonGeometry(
        hwy.points.map((p) => latLngToWorld(p.lat, p.lng)),
        WIDTH[hwy.type] ?? 6,
        isPath ? 0.14 : 0.1
      );
      if (geo) groups[key].geos.push(geo);
    });

    for (const g of Object.values(groups)) {
      if (!g.geos.length) continue;
      const merged = mergeGeometries(g.geos);
      g.geos.forEach((x) => x.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, g.mat);
      mesh.receiveShadow = !this.isSoftwareGl;
      this.streetsGroup.add(mesh);
    }
  }

  /**
   * Public gardens and squares from OpenStreetMap, draped over the terrain.
   */
  private buildRealParks() {
    const tess = new TessellateModifier(4, 6);
    REAL_PARKS.forEach((park) => {
      if (park.polygon.length < 3) return;
      const worldPts = park.polygon.map((p) => latLngToWorld(p.lat, p.lng));
      const shape = new THREE.Shape();
      shape.moveTo(worldPts[0].x, -worldPts[0].z);
      for (let i = 1; i < worldPts.length; i++) shape.lineTo(worldPts[i].x, -worldPts[i].z);
      shape.closePath();

      let geo: THREE.BufferGeometry = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      try {
        geo = tess.modify(geo);
      } catch {
        /* keep the coarse geometry */
      }
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)) + 0.12);
      geo.computeVertexNormals();

      const isPaved = park.name.includes('הבימה');
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: isPaved ? 0xe7e5e4 : 0x9ccc8a, roughness: 0.9 })
      );
      mesh.receiveShadow = !this.isSoftwareGl;
      this.parksGroup.add(mesh);
    });

    this.populateRealTrees();
  }

  /**
   * Trees at their surveyed positions (municipal inventory + 2024 canopy map), drawn as instances.
   */
  private populateRealTrees() {
    const broad = GIS_TREES.filter((t) => !t[4]);
    const palms = GIS_TREES.filter((t) => t[4]);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const color = new THREE.Color();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2c, roughness: 0.85 });
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, GIS_TREES.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, broad.length);
    const palmCrowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), crownMat, Math.max(1, palms.length));

    let ti = 0;
    broad.forEach(([lat, lng, r, h], i) => {
      const w = latLngToWorld(lat, lng);
      const y = groundHeight(w.x, w.z);
      const crownH = Math.max(2.5, h * 0.55);
      const trunkH = h - crownH * 0.75;
      m4.compose(p.set(w.x, y, w.z), q, s.set(0.35 + r * 0.04, trunkH, 0.35 + r * 0.04));
      trunks.setMatrixAt(ti++, m4);
      m4.compose(p.set(w.x, y + h - crownH / 2, w.z), q, s.set(r, crownH / 2, r));
      crowns.setMatrixAt(i, m4);
      // Slight variation of greens (multiplies the crown colour)
      color.setHSL(0.22 + ((i * 37) % 10) / 100, 0.35, 0.62 + ((i * 53) % 10) / 40);
      crowns.setColorAt(i, color);
    });
    palms.forEach(([lat, lng, , h], i) => {
      const w = latLngToWorld(lat, lng);
      const y = groundHeight(w.x, w.z);
      m4.compose(p.set(w.x, y, w.z), q, s.set(0.25, h, 0.25));
      trunks.setMatrixAt(ti++, m4);
      m4.compose(p.set(w.x, y + h, w.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), s.set(2.6, 1.6, 2.6));
      palmCrowns.setMatrixAt(i, m4);
      palmCrowns.setColorAt(i, color.set(0xb5c99a));
    });
    trunks.count = ti;
    palmCrowns.count = palms.length;
    for (const mesh of [trunks, crowns, palmCrowns]) {
      mesh.castShadow = !this.isSoftwareGl;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.treesGroup.add(mesh);
    }
  }

  /**
   * Builds every building of the block from the municipal GIS footprints and measured heights,
   * standing on the real ground level, with open ground floors (pilotis) where the GIS records them.
   */
  private buildRealBuildings() {
    while (this.realBuildingsGroup.children.length > 0) {
      const obj = this.realBuildingsGroup.children[0];
      this.realBuildingsGroup.remove(obj);
      this.disposeObject(obj);
    }

    const roofMat = new THREE.MeshStandardMaterial({ map: getRoofTexture(), roughness: 0.85, metalness: 0.05 });
    const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();
    const getFacadeMat = (levels: number, highlighted: boolean) => {
      const key = `${levels}-${highlighted}`;
      if (!facadeMatCache.has(key)) {
        facadeMatCache.set(
          key,
          new THREE.MeshStandardMaterial({ map: getFacadeTexture(levels, highlighted), roughness: 0.75, metalness: 0.05 })
        );
      }
      return facadeMatCache.get(key)!;
    };
    const plainMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });
    const columnMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const columnGeo = new THREE.CylinderGeometry(0.22, 0.22, 1, 8);
    columnGeo.translate(0, 0.5, 0);
    const edgeMatChissin = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.75 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.4 });

    const SINK = 3; // extend walls below ground so they meet the sloping terrain
    const PILOTIS_H = 3;

    const shapeFrom = (rings: [number, number][][], cx: number, cz: number, scale = 1) => {
      const toXY = ([lat, lng]: [number, number]) => {
        const w = latLngToWorld(lat, lng);
        return new THREE.Vector2((w.x - cx) * scale, -(w.z - cz) * scale);
      };
      const shape = new THREE.Shape(rings[0].map(toXY));
      for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole.map(toXY)));
      return shape;
    };

    /** Extrudes a footprint from y0 to y1 (relative) and maps facade UVs so window rows start at `floorZ`. */
    const extrude = (shape: THREE.Shape, depth: number, floorZ: number, facadeH: number) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
      const uv = geo.attributes.uv;
      if (uv && geo.groups.length >= 2) {
        const roof = geo.groups[0];
        for (let i = roof.start; i < roof.start + roof.count; i++) uv.setXY(i, uv.getX(i) * 0.18, uv.getY(i) * 0.18);
        const side = geo.groups[1];
        for (let i = side.start; i < side.start + side.count; i++) {
          const z = 1 - uv.getY(i); // WorldUVGenerator: v = 1 - z
          uv.setXY(i, uv.getX(i) / 12, Math.max(0, Math.min(1, (z - floorZ) / facadeH)));
        }
        uv.needsUpdate = true;
      }
      geo.rotateX(-Math.PI / 2);
      return geo;
    };

    for (const b of ALL_BUILDINGS) {
      const center = latLngToWorld(b.centerCoordinates.lat, b.centerCoordinates.lng);
      const levels = Math.min(Math.max(b.levels, 1), 12);
      const smallStructure = !!b.kind && b.kind !== 'מבנה ציבור';
      const facadeMat = smallStructure ? plainMat : getFacadeMat(levels, b.isChissin);
      const withPilotis = b.pilotis && b.height > 7;

      b.polygons.forEach((rings, partIdx) => {
        if (rings[0].length < 3) return;
        const shape = shapeFrom(rings, center.x, center.z);
        const bottom = withPilotis ? PILOTIS_H : -SINK;
        const facadeH = b.height - (withPilotis ? PILOTIS_H : 0);
        const geo = extrude(shape, b.height - bottom, withPilotis ? 0 : SINK, facadeH);

        const mesh = new THREE.Mesh(geo, [roofMat, facadeMat]);
        mesh.position.set(center.x, b.baseElevation + bottom, center.z);
        mesh.castShadow = !this.isSoftwareGl;
        mesh.receiveShadow = !this.isSoftwareGl;
        mesh.userData = { type: 'building', id: b.id };
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), b.isChissin ? edgeMatChissin : edgeMat));
        this.realBuildingsGroup.add(mesh);

        if (withPilotis) {
          // Recessed ground floor (lobby / stair core) and columns under the slab
          const coreGeo = extrude(shapeFrom(rings, center.x, center.z, 0.6), PILOTIS_H + SINK, 0, PILOTIS_H + SINK);
          const core = new THREE.Mesh(coreGeo, coreMat);
          core.position.set(center.x, b.baseElevation - SINK, center.z);
          core.castShadow = !this.isSoftwareGl;
          core.userData = { type: 'building', id: b.id };
          this.realBuildingsGroup.add(core);

          const outer = rings[0];
          const step = Math.max(1, Math.ceil(outer.length / 12));
          for (let i = 0; i < outer.length; i += step) {
            const w = latLngToWorld(outer[i][0], outer[i][1]);
            // pull columns slightly inside the footprint
            const x = w.x + (center.x - w.x) * 0.06;
            const z = w.z + (center.z - w.z) * 0.06;
            const g = groundHeight(x, z);
            const top = b.baseElevation + PILOTIS_H;
            const col = new THREE.Mesh(columnGeo, columnMat);
            col.position.set(x, g - 0.5, z);
            col.scale.set(1, top - g + 0.5, 1);
            this.realBuildingsGroup.add(col);
          }
        }

        // Floating address billboard for Chissin buildings
        const chissinAddr = partIdx === 0 ? b.addresses.find((a) => a.street === 'חיסין') : undefined;
        if (chissinAddr) {
          const label = this.createAddressSprite(`${chissinAddr.number}${chissinAddr.entrance}`);
          label.position.set(center.x, b.baseElevation + b.height + 4.5, center.z);
          this.realBuildingsGroup.add(label);
        }
      });
    }
  }

  private createAddressSprite(numberStr: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(10, 10, 236, 108, 16);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(numberStr, 128, 62);

      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`חיסין ${numberStr}`, 128, 96);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6.5, 3.2, 1);
    return sprite;
  }

  /**
   * Sets and renders geotagged 3D document pins
   */
  public setDocuments(docs: GeotaggedDocument[]) {
    this.documents = docs;
    this.pinMeshesMap.clear();

    while (this.documentsGroup.children.length > 0) {
      const obj = this.documentsGroup.children[0];
      this.documentsGroup.remove(obj);
      this.disposeObject(obj);
    }

    // One pin per building, showing how many documents are linked to it.
    const counts = new Map<string, number>();
    docs.forEach((d) => {
      const ids = d.buildingIds?.length ? d.buildingIds : d.buildingId ? [d.buildingId] : [];
      ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });

    counts.forEach((count, buildingId) => {
      const building = BUILDINGS_BY_ID.get(buildingId);
      if (!building) return;
      const pinGroup = this.createBuildingPin(building, count);
      this.documentsGroup.add(pinGroup);
      this.pinMeshesMap.set(buildingId, pinGroup);
    });

    this.updateInteractiveMeshes();
    this.highlightPin(this.selectedBuildingId);
  }

  private createBuildingPin(building: BuildingPlot, count: number): THREE.Group {
    const pinGroup = new THREE.Group();
    const worldPos = latLngToWorld(building.centerCoordinates.lat, building.centerCoordinates.lng);
    const elevation = building.baseElevation + building.height + 7;

    pinGroup.position.set(worldPos.x, elevation, worldPos.z);
    pinGroup.userData = { type: 'buildingPin', buildingId: building.id };

    const pinColor = 0x2563eb;

    // Vertical needle down to the roof
    const needleGeo = new THREE.CylinderGeometry(0.12, 0.02, 6.0, 8);
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.2 });
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.position.y = -3.0;
    pinGroup.add(needle);

    // Head sphere (large enough to tap on a phone)
    const headGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: pinColor,
      roughness: 0.2,
      metalness: 0.4,
      emissive: pinColor,
      emissiveIntensity: 0.35,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.userData = { isPinHead: true };
    headMesh.castShadow = !this.isSoftwareGl;
    pinGroup.add(headMesh);

    // Count badge
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(64, 64, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 60px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 99 ? '99+' : String(count), 64, 68);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    badge.scale.set(3.2, 3.2, 1);
    badge.position.set(0, 3.2, 0);
    badge.renderOrder = 10;
    pinGroup.add(badge);

    return pinGroup;
  }

  private updateInteractiveMeshes() {
    this.interactiveMeshes = [];
    this.documentsGroup.children.forEach((group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.interactiveMeshes.push(child);
        }
      });
    });
    this.realBuildingsGroup.children.forEach((b) => {
      if (b instanceof THREE.Mesh) {
        this.interactiveMeshes.push(b);
      }
    });
  }

  public setBuildings(buildings: BuildingPlot[]) {
    this.buildings = buildings;
    this.requestRender();
  }

  public focusDocument(doc: GeotaggedDocument) {
    const building = doc.buildingId ? BUILDINGS_BY_ID.get(doc.buildingId) : undefined;
    if (building) this.focusBuilding(building);
  }

  public focusBuilding(building: BuildingPlot) {
    const worldPos = latLngToWorld(building.centerCoordinates.lat, building.centerCoordinates.lng);
    // Keep the current viewing direction, just move closer to the building.
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const dist = Math.max(70, building.height * 3);
    const targetLookAt = new THREE.Vector3(worldPos.x, building.baseElevation + building.height / 2, worldPos.z);
    const targetPos = targetLookAt.clone().add(dir.multiplyScalar(dist));
    targetPos.y = Math.max(targetPos.y, building.baseElevation + building.height + 25);

    this.startCameraTransition(targetPos, targetLookAt);
  }

  public setViewPreset(preset: ViewPreset) {
    let targetPos = new THREE.Vector3(-80, 140, 160);
    let targetLook = new THREE.Vector3(0, 8, 0);

    switch (preset) {
      case 'overview':
        targetPos.set(-80, 150, 170);
        targetLook.set(0, 8, 0);
        break;
      case 'street': {
        // Eye level on Chissin street, looking along the street
        const chissin = REAL_HIGHWAYS.filter((h) => h.name.includes('חיסין')).sort((a, b) => b.points.length - a.points.length)[0];
        if (chissin && chissin.points.length > 3) {
          const a = latLngToWorld(chissin.points[1].lat, chissin.points[1].lng);
          const far = chissin.points[Math.min(chissin.points.length - 1, 7)];
          const b = latLngToWorld(far.lat, far.lng);
          targetPos.set(a.x, groundHeight(a.x, a.z) + 2.2, a.z);
          targetLook.set(b.x, groundHeight(b.x, b.z) + 3, b.z);
        } else {
          targetPos.set(10, 6, -15);
          targetLook.set(20, 6, 40);
        }
        break;
      }
      case 'topDown':
        targetPos.set(0, 320, 5);
        targetLook.set(0, 0, 0);
        break;
      case 'habimaView':
        targetPos.set(120, 60, -40);
        targetLook.set(-20, 10, 10);
        break;
      case 'dizengoffView':
        targetPos.set(-180, 75, -80);
        targetLook.set(-10, 15, 0);
        break;
    }

    this.startCameraTransition(targetPos, targetLook);
  }

  private startCameraTransition(pos: THREE.Vector3, target: THREE.Vector3) {
    this.transitionTarget = {
      pos: pos.clone(),
      target: target.clone(),
    };
    this.requestRender();
  }

  private highlightPin(buildingId: string | null) {
    this.pinMeshesMap.forEach((pinGroup, id) => {
      const isSelected = id === buildingId;
      pinGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.isPinHead) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = isSelected ? 0.95 : 0.35;
          child.scale.setScalar(isSelected ? 1.4 : 1.0);
        }
      });
    });
    this.requestRender();
  }

  public highlightBuilding(buildingMesh: THREE.Object3D | null) {
    if (this.selectionHighlightBox) {
      this.scene.remove(this.selectionHighlightBox);
      this.selectionHighlightBox.dispose();
      this.selectionHighlightBox = null;
    }
    if (buildingMesh) {
      this.selectionHighlightBox = new THREE.BoxHelper(buildingMesh, 0x38bdf8); // sky-400 accent
      this.scene.add(this.selectionHighlightBox);
    }
    this.requestRender();
  }

  public selectBuilding(building: BuildingPlot | null) {
    this.selectedBuildingId = building?.id ?? null;
    this.highlightPin(this.selectedBuildingId);
    if (!building) {
      this.highlightBuilding(null);
      return;
    }
    let foundMesh: THREE.Object3D | null = null;
    this.realBuildingsGroup.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData?.type === 'building' && child.userData.id === building.id) {
        foundMesh = child;
      }
    });
    this.highlightBuilding(foundMesh);
  }

  public setGeotagMode(active: boolean) {
    this.isGeotagModeActive = active;
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = active ? 'crosshair' : 'default';
    }
  }

  public toggleTrees(visible: boolean) {
    this.showTrees = visible;
    this.treesGroup.visible = visible;
    this.requestRender();
  }

  public toggleArchitecturalMode(active: boolean) {
    this.isArchitecturalMode = active;
    this.realBuildingsGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = active));
        } else {
          child.material.wireframe = active;
        }
      }
    });
    this.requestRender();
  }

  /** Returns the building id under the pointer (via a building mesh or a document pin). */
  private pickBuildingId(): string | null {
    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(this.interactiveMeshes, false);
    for (const hit of hits) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.scene) {
        if (curr.userData?.type === 'buildingPin') return curr.userData.buildingId;
        if (curr.userData?.type === 'building') return curr.userData.id;
        curr = curr.parent;
      }
    }
    return null;
  }

  private setPointerFromEvent(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private bindEvents() {
    const dom = this.renderer.domElement;
    let hoverFrame = 0;

    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.isGeotagModeActive || e.buttons) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = requestAnimationFrame(() => {
        this.setPointerFromEvent(e);
        dom.style.cursor = this.pickBuildingId() ? 'pointer' : 'default';
      });
    });

    let pointerDown = { x: 0, y: 0, t: 0, type: 'mouse' };

    dom.addEventListener('pointerdown', (e) => {
      pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
      // User is interacting directly — cancel any programmatic camera transition
      this.transitionTarget = null;
    });

    dom.addEventListener('wheel', () => {
      this.transitionTarget = null;
    }, { passive: true });

    dom.addEventListener('click', (e) => {
      // Ignore drags / pans / pinches. Fingers wobble more than a mouse, so allow more slack on touch.
      const slack = pointerDown.type === 'mouse' ? 5 : 14;
      const dragDist = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
      if (dragDist > slack) return;

      this.setPointerFromEvent(e);

      // Geotag Placement Mode: pick coordinate on roof or terrain
      if (this.isGeotagModeActive) {
        _raycaster.setFromCamera(_pointer, this.camera);
        const targets: THREE.Object3D[] = [];
        if (this.groundMesh) targets.push(this.groundMesh);
        this.realBuildingsGroup.traverse((c) => {
          if (c instanceof THREE.Mesh) targets.push(c);
        });
        const hits = _raycaster.intersectObjects(targets, false);
        if (hits.length > 0) {
          const point = hits[0].point;
          const coords = worldToLatLng(point.x, point.z);
          this.callbacks.onGeotagPickPoint?.(coords.lat, coords.lng, Math.max(point.y + 1.5, 2));
          this.setGeotagMode(false);
        }
        return;
      }

      const id = this.pickBuildingId();
      const building = id ? BUILDINGS_BY_ID.get(id) ?? null : null;
      this.selectBuilding(building);
      this.callbacks.onSelectBuilding(building);
    });

    window.addEventListener('resize', this.handleResize);
    // The container also changes size without a window resize (mobile address bar, panels).
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
  }

  private handleResize = () => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  };

  public requestRender() {
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;

    this.animFrameId = requestAnimationFrame(() => {
      this.renderDirty = false;

      let transitionActive = false;
      if (this.transitionTarget) {
        transitionActive = true;
        const delta = 0.055;
        this.camera.position.lerp(this.transitionTarget.pos, delta * 2.2);
        this.controls.target.lerp(this.transitionTarget.target, delta * 2.2);

        if (
          this.camera.position.distanceTo(this.transitionTarget.pos) < 0.25 &&
          this.controls.target.distanceTo(this.transitionTarget.target) < 0.25
        ) {
          this.transitionTarget = null;
          transitionActive = false;
        }
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty || transitionActive) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.afterDraw(done);
      } else {
        done();
      }
    });
  }

  private afterDraw(cb: () => void) {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          window.setTimeout(cb, 60);
        }
      };
      window.setTimeout(poll, 5);
    } catch {
      window.setTimeout(cb, 60);
    }
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }

  public dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.animFrameId);
    this.selectionHighlightBox?.dispose();
    this.controls.dispose();
    this.pmremGenerator?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
