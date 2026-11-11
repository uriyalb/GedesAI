import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';
import { REAL_HIGHWAYS } from '../../data/realWorldBlock.ts';
import { GIS_CONTEXT } from '../../data/gisContext.ts';
import { groundHeight } from '../../utils/terrain.ts';
import { latLngToWorld, worldToLatLng } from '../../utils/geo.ts';
import { ALL_BUILDINGS, BUILDINGS_BY_ID } from '../../data/buildings.ts';
import { getFacadeAtlas, whiteUV } from '../../utils/facadeAtlas.ts';
import { MeshBuilder, type P2 } from './meshBuilder.ts';
import { buildBuilding, type ModelBuilding } from './buildingModel.ts';
import { Site, buildCars, buildFences, buildGardenFeatures, buildGround, buildVegetation, paintGround, skyTexture } from './environment.ts';

// Pre-allocated reusable vectors for zero GC in render loop
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export interface SceneCallbacks {
  onSelectBuilding: (building: BuildingPlot | null) => void;
  /** Map-click in pick mode: position and scene height of the clicked surface + eye level. */
  onGeotagPickPoint?: (lat: number, lng: number, elevation: number) => void;
  onSelectPhoto?: (docId: string) => void;
}

export interface PhotoMarker {
  docId: string;
  fileId: string;
  lat: number;
  lng: number;
  /** Scene height of the camera position (y). */
  y: number;
  thumbnailLink?: string;
}

export type ThumbnailLoader = (fileId: string, thumbnailLink?: string) => Promise<ImageBitmap | null>;

export class ChissinSceneManager {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  /** Phones / tablets: smaller textures and shadow maps to stay within mobile GPU memory. */
  private isMobile =
    typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 700);
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  // 3D Groups
  private realBuildingsGroup = new THREE.Group();
  private contextGroup = new THREE.Group();
  private labelsGroup = new THREE.Group();
  private site: Site | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private buildingMaterial: THREE.MeshStandardMaterial | null = null;
  private streetsGroup = new THREE.Group();
  private parksGroup = new THREE.Group();
  private treesGroup = new THREE.Group();
  private documentsGroup = new THREE.Group();
  private photosGroup = new THREE.Group();
  private photoKey = '';
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
        // ?hq=1 forces full quality (shadows, large textures) on software renderers
        if (new URLSearchParams(window.location.search).get('hq') === '1') return false;
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Scene with Mediterranean coastal sky tone and subtle distance fog
    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xd3dfe6, 420, 1500);

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
    this.renderer.toneMappingExposure = 0.95;
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
      this.scene.environmentIntensity = 0.3;
    } catch (e) {
      console.warn('RoomEnvironment fallback:', e);
    }

    // 7. Lighting
    this.setupLighting();

    // 8. Add Groups
    this.scene.add(this.streetsGroup);
    this.scene.add(this.parksGroup);
    this.scene.add(this.realBuildingsGroup);
    this.scene.add(this.contextGroup);
    this.scene.add(this.labelsGroup);
    this.scene.add(this.treesGroup);
    this.scene.add(this.documentsGroup);
    this.scene.add(this.photosGroup);

    // 9. Build real terrain, real OSM highways, and real building envelopes!
    const t0 = performance.now();
    this.buildWorld();
    if (import.meta.env.DEV) console.info(`[3D] model built in ${Math.round(performance.now() - t0)} ms`);

    // 10. Event Listeners
    this.bindEvents();

    this.requestRender();
  }

  private setupLighting() {
    // Late-morning Mediterranean sun from the south-east: hard light, crisp shadows under every balcony
    const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.9);
    sunLight.position.set(260, 420, 300);
    if (!this.isSoftwareGl) {
      sunLight.castShadow = true;
      const sm = this.isMobile ? 2048 : 4096;
      sunLight.shadow.mapSize.set(sm, sm);
      sunLight.shadow.camera.near = 50;
      sunLight.shadow.camera.far = 1400;
      const d = 520;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0003;
      sunLight.shadow.normalBias = 0.06;
    }
    this.sun = sunLight;
    this.scene.add(sunLight);

    // Sky light from above, warm bounce from the pale ground and walls
    const hemiLight = new THREE.HemisphereLight(0xcfe2f5, 0xb8a98c, 0.8);
    this.scene.add(hemiLight);

    // Soft fill from the sea side so shaded facades keep their detail
    const fillLight = new THREE.DirectionalLight(0xcfe0f0, 0.45);
    fillLight.position.set(-300, 180, -200);
    this.scene.add(fillLight);
  }

  /**
   * Builds the whole physical model: terrain painted from the land parcels, every building of the block
   * (selectable) and of its surroundings (context), garden walls, vegetation and parked cars.
   */
  private buildWorld() {
    const shadows = !this.isSoftwareGl;
    const unpack = (flat: number[]): P2[] => {
      const out: P2[] = [];
      for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i] / 10, z: flat[i + 1] / 10 });
      return out;
    };

    const block: ModelBuilding[] = ALL_BUILDINGS.map((b) => ({
      id: b.id,
      parts: b.polygons.map((rings) => rings.map((ring) => ring.map(([lat, lng]) => latLngToWorld(lat, lng)))),
      roofMean: b.roofHeight,
      top: b.height,
      floors: b.levels,
      year: b.yearBuilt ?? undefined,
      pilotis: b.pilotis,
      kind: b.kind,
      name: b.name,
      preserved: !!b.preservation,
    }));
    const context: ModelBuilding[] = GIS_CONTEXT.map((c, i) => ({
      id: `c-${i}`,
      parts: c.p.map((rings) => rings.map(unpack)),
      roofMean: c.rm,
      top: c.rx,
      floors: c.f,
      year: c.y,
      pilotis: c.pl === 1,
      kind: c.k,
      name: c.n,
    }));

    const site = new Site([...block, ...context].flatMap((b) => b.parts.map((p) => p[0])));
    this.site = site;

    // Ground
    const maxTex = this.renderer.capabilities.maxTextureSize;
    const groundTex = paintGround(site, this.isSoftwareGl || this.isMobile ? 2048 : Math.min(4096, maxTex));
    groundTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.groundMesh = buildGround(groundTex);
    this.groundMesh.receiveShadow = shadows;
    this.streetsGroup.add(this.groundMesh);

    // Buildings: one material for everything (facade atlas x vertex colour)
    const atlas = getFacadeAtlas(this.isSoftwareGl ? 1024 : 2048);
    atlas.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.9, metalness: 0 });
    this.buildingMaterial = mat;
    const white = whiteUV();

    block.forEach((mb, i) => {
      const builder = new MeshBuilder(white);
      const info = buildBuilding(builder, mb, site);
      if (!builder.vertexCount) return;
      const mesh = new THREE.Mesh(builder.build(), mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.userData = { type: 'building', id: mb.id };
      this.realBuildingsGroup.add(mesh);

      const b = ALL_BUILDINGS[i];
      const chissinAddr = b.addresses.find((a) => a.street === 'חיסין');
      if (chissinAddr) {
        const center = latLngToWorld(b.centerCoordinates.lat, b.centerCoordinates.lng);
        const label = this.createAddressSprite(`${chissinAddr.number}${chissinAddr.entrance}`);
        label.position.set(center.x, info.top + 3.2, center.z);
        this.labelsGroup.add(label);
      }
    });

    const ctxBuilder = new MeshBuilder(white);
    for (const c of context) buildBuilding(ctxBuilder, c, site, true);
    buildFences(ctxBuilder, site);
    buildGardenFeatures(ctxBuilder);
    const ctxMesh = new THREE.Mesh(ctxBuilder.build(), mat);
    ctxMesh.castShadow = shadows;
    ctxMesh.receiveShadow = shadows;
    ctxMesh.userData = { type: 'context' };
    this.contextGroup.add(ctxMesh);

    this.treesGroup.add(buildVegetation(site, !this.isSoftwareGl, shadows));
    this.streetsGroup.add(buildCars(site, shadows));
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
    // Photo bubbles first in the list so they win over buildings behind them
    this.photosGroup.children.forEach((g) => g.traverse((c) => c.userData?.isPhotoBubble && this.interactiveMeshes.unshift(c)));
  }

  /**
   * Floating photo bubbles at the place each photo was taken, with a stem down to the ground.
   */
  public setPhotoMarkers(markers: PhotoMarker[], loadThumb: ThumbnailLoader) {
    const key = markers.map((m) => `${m.docId}:${m.lat.toFixed(6)}:${m.lng.toFixed(6)}:${m.y.toFixed(1)}`).join('|');
    if (key === this.photoKey) return;
    this.photoKey = key;
    while (this.photosGroup.children.length) {
      const o = this.photosGroup.children[0];
      this.photosGroup.remove(o);
      o.traverse((c) => {
        if (c instanceof THREE.Sprite) {
          c.material.map?.dispose();
          c.material.dispose();
        }
      });
      this.disposeObject(o);
    }

    const stemMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.6 });
    for (const m of markers) {
      const w = latLngToWorld(m.lat, m.lng);
      const ground = groundHeight(w.x, w.z);
      const camY = Math.max(m.y, ground + 0.5);
      const bubbleY = camY + 5;

      const g = new THREE.Group();
      g.userData = { type: 'photo', docId: m.docId };

      const stemH = Math.max(0.1, bubbleY - 2.6 - ground);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, stemH, 6), stemMat);
      stem.position.set(w.x, ground + stemH / 2, w.z);
      g.add(stem);
      // camera position marker (useful for photos from balconies / roofs)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), stemMat);
      eye.position.set(w.x, camY, w.z);
      g.add(eye);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20).rotateX(-Math.PI / 2), dotMat);
      dot.position.set(w.x, ground + 0.2, w.z);
      g.add(dot);

      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const draw = (img: ImageBitmap | null) => {
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 256, 256);
        ctx.save();
        ctx.beginPath();
        ctx.arc(128, 128, 118, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.clip();
        if (img) {
          const sc = Math.max(236 / img.width, 236 / img.height);
          const iw = img.width * sc;
          const ih = img.height * sc;
          ctx.drawImage(img, 128 - iw / 2, 128 - ih / 2, iw, ih);
        } else {
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 110px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📷', 128, 136);
        }
        ctx.restore();
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(128, 128, 118, 0, Math.PI * 2);
        ctx.stroke();
      };
      draw(null);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.scale.set(5.2, 5.2, 1);
      sprite.position.set(w.x, bubbleY, w.z);
      sprite.renderOrder = 20;
      sprite.userData = { isPhotoBubble: true };
      g.add(sprite);
      this.photosGroup.add(g);

      loadThumb(m.fileId, m.thumbnailLink).then((img) => {
        if (!img) return;
        draw(img);
        tex.needsUpdate = true;
        this.requestRender();
      });
    }
    this.updateInteractiveMeshes();
    this.requestRender();
  }

  public focusPoint(lat: number, lng: number, y: number) {
    const w = latLngToWorld(lat, lng);
    const look = new THREE.Vector3(w.x, y + 3, w.z);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const pos = look.clone().add(dir.multiplyScalar(55));
    pos.y = Math.max(pos.y, y + 20);
    this.startCameraTransition(pos, look);
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
    if (this.buildingMaterial) this.buildingMaterial.wireframe = active;
    this.requestRender();
  }

  /** Returns the building id under the pointer (via a building mesh or a document pin). */
  private pickTarget(): { type: 'building' | 'photo'; id: string } | null {
    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(this.interactiveMeshes, false);
    // Bubbles are drawn on top of everything, so give them priority over closer buildings
    const photoHit = hits.find((h) => h.object.userData?.isPhotoBubble);
    if (photoHit) return { type: 'photo', id: photoHit.object.parent!.userData.docId };
    for (const hit of hits) {
      let curr: THREE.Object3D | null = hit.object;
      while (curr && curr !== this.scene) {
        if (curr.userData?.type === 'buildingPin') return { type: 'building', id: curr.userData.buildingId };
        if (curr.userData?.type === 'building') return { type: 'building', id: curr.userData.id };
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
        dom.style.cursor = this.pickTarget() ? 'pointer' : 'default';
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
        for (const g of [this.realBuildingsGroup, this.contextGroup]) {
          g.traverse((c) => {
            if (c instanceof THREE.Mesh) targets.push(c);
          });
        }
        const hits = _raycaster.intersectObjects(targets, false);
        if (hits.length > 0) {
          const point = hits[0].point;
          const coords = worldToLatLng(point.x, point.z);
          // A click on the ground means eye level; on a roof / wall, just above that surface
          this.callbacks.onGeotagPickPoint?.(coords.lat, coords.lng, point.y + 1.6);
          this.setGeotagMode(false);
        }
        return;
      }

      const target = this.pickTarget();
      if (target?.type === 'photo') {
        this.callbacks.onSelectPhoto?.(target.id);
        return;
      }
      const id = target?.id;
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
