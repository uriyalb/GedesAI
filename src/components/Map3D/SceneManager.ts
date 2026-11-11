import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BuildingPlot, GeotaggedDocument, ViewPreset } from '../../types/index.ts';
import { REAL_BUILDINGS, REAL_HIGHWAYS, REAL_PARKS, RealBuildingEnvelope } from '../../data/realWorldBlock.ts';
import { latLngToWorld, worldToLatLng } from '../../utils/geo.ts';
import { getFacadeTexture, getRoofTexture, getSatelliteGroundTexture } from '../../utils/buildingTextures.ts';

// Pre-allocated reusable vectors for zero GC in render loop
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export interface SceneCallbacks {
  onSelectDocument: (doc: GeotaggedDocument | null) => void;
  onHoverDocument: (doc: GeotaggedDocument | null, screenPos?: { x: number; y: number }) => void;
  onSelectBuilding: (building: BuildingPlot | null) => void;
  onGeotagPickPoint: (lat: number, lng: number, elevation: number) => void;
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
  private rooftopElementsGroup = new THREE.Group();
  private groundMesh: THREE.Mesh | null = null;
  private selectionHighlightBox: THREE.BoxHelper | null = null;

  // Data & State
  private buildings: BuildingPlot[] = [];
  private documents: GeotaggedDocument[] = [];
  private selectedDocId: string | null = null;
  private isGeotagModeActive = false;
  private showTrees = true;
  private isArchitecturalMode = false;
  private showRooftops = true;

  // Render loop control
  private renderBusy = false;
  private renderDirty = false;
  private animFrameId = 0;
  private transitionTarget: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

  private callbacks: SceneCallbacks;
  private interactiveMeshes: THREE.Object3D[] = [];
  private pinMeshesMap = new Map<string, THREE.Group>();

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
    this.controls.minDistance = 15;
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
    this.scene.add(this.rooftopElementsGroup);
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

  private buildTerrain() {
    // Broad Urban Ground Plane with authentic aerial orthophoto texture
    const groundGeo = new THREE.PlaneGeometry(1600, 1600);
    const satelliteTex = getSatelliteGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: satelliteTex,
      roughness: 0.9,
      metalness: 0.05,
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.y = 0;
    this.groundMesh.receiveShadow = !this.isSoftwareGl;
    this.streetsGroup.add(this.groundMesh);
  }

  /**
   * Builds real OpenStreetMap road polylines and pavements
   */
  private buildRealHighways() {
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // asphalt
      roughness: 0.8,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const chissinRoadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // darker asphalt for highlighted Chissin St
      roughness: 0.7,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    REAL_HIGHWAYS.forEach((hwy) => {
      if (hwy.points.length < 2) return;
      const isChissin = hwy.name.includes('חיסין');
      const isBenZion = hwy.name.includes('בן ציון');
      const isDizengoff = hwy.name.includes('דיזנגוף');

      const width = isBenZion ? 16 : isChissin ? 12 : 10;
      const mat = isChissin ? chissinRoadMat : roadMat;

      // Build continuous road ribbon geometry
      const worldPts = hwy.points.map((p) => latLngToWorld(p.lat, p.lng));

      for (let i = 0; i < worldPts.length - 1; i++) {
        const p1 = worldPts[i];
        const p2 = worldPts[i + 1];

        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.5) continue;

        const roadSegGeo = new THREE.PlaneGeometry(width, len);
        const roadSeg = new THREE.Mesh(roadSegGeo, mat);
        roadSeg.rotation.x = -Math.PI / 2;
        roadSeg.rotation.z = Math.atan2(dx, dz);
        roadSeg.position.set((p1.x + p2.x) / 2, 0.05, (p1.z + p2.z) / 2);
        roadSeg.receiveShadow = !this.isSoftwareGl;
        this.streetsGroup.add(roadSeg);
      }
    });
  }

  /**
   * Builds real public gardens (Gan Chissin, Habima Square)
   */
  private buildRealParks() {
    REAL_PARKS.forEach((park) => {
      if (park.polygon.length < 3) return;
      const worldPts = park.polygon.map((p) => latLngToWorld(p.lat, p.lng));

      const shape = new THREE.Shape();
      shape.moveTo(worldPts[0].x, -worldPts[0].z);
      for (let i = 1; i < worldPts.length; i++) {
        shape.lineTo(worldPts[i].x, -worldPts[i].z);
      }
      shape.closePath();

      const isHabima = park.name.includes('הבימה') || park.name.includes('יעקב');
      const parkColor = isHabima ? 0xf1f5f9 : 0x86efac; // Habima stone vs green garden
      const parkGeo = new THREE.ShapeGeometry(shape);
      const parkMat = new THREE.MeshStandardMaterial({
        color: parkColor,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });

      const mesh = new THREE.Mesh(parkGeo, parkMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.08;
      mesh.receiveShadow = !this.isSoftwareGl;
      this.parksGroup.add(mesh);
    });

    // Populate trees in Gan Chissin & Ben Zion promenade
    this.populateRealTrees();
  }

  private populateRealTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a29, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x166534, // dense ficus green
      roughness: 0.7,
    });

    // Cluster trees in Gan Chissin (Center of block around lat: 32.0738, lng: 34.7770)
    const ganChissinCenter = latLngToWorld(32.07385, 34.77695);
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (i % 3);
      const radius = 5 + (i % 7) * 4.5;
      const tx = ganChissinCenter.x + Math.cos(angle) * radius;
      const tz = ganChissinCenter.z + Math.sin(angle) * radius;

      const tree = this.createProceduralTree(tx, tz, trunkMat, foliageMat);
      this.treesGroup.add(tree);
    }

    // Double row of trees along Ben Zion Boulevard
    for (let step = -120; step <= 140; step += 18) {
      [-7, 7].forEach((sideOffset) => {
        const tree = this.createProceduralTree(step, -60 + sideOffset, trunkMat, foliageMat);
        this.treesGroup.add(tree);
      });
    }
  }

  private createProceduralTree(
    x: number,
    z: number,
    trunkMat: THREE.Material,
    foliageMat: THREE.Material
  ): THREE.Group {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 4.2, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.1;
    tree.add(trunk);

    const foliage1 = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 8), foliageMat);
    foliage1.position.set(0, 4.8, 0);
    tree.add(foliage1);

    const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), foliageMat);
    foliage2.position.set(1.1, 4.4, 0.3);
    tree.add(foliage2);

    return tree;
  }

  /**
   * Constructs all real 175 OpenStreetMap 3D building envelopes with authentic textures,
   * Bauhaus balconies, pilotis, and Tel Aviv rooftops!
   */
  private buildRealBuildings() {
    // Clear previous
    while (this.realBuildingsGroup.children.length > 0) {
      const obj = this.realBuildingsGroup.children[0];
      this.realBuildingsGroup.remove(obj);
      this.disposeObject(obj);
    }
    while (this.rooftopElementsGroup.children.length > 0) {
      const obj = this.rooftopElementsGroup.children[0];
      this.rooftopElementsGroup.remove(obj);
      this.disposeObject(obj);
    }

    // Cached materials
    const roofTex = getRoofTexture();
    const roofMat = new THREE.MeshStandardMaterial({
      map: roofTex,
      roughness: 0.85,
      metalness: 0.05,
    });

    const facadeMatCache = new Map<string, THREE.MeshStandardMaterial>();
    const getFacadeMat = (levels: number, isHighlighted: boolean) => {
      const key = `${levels}-${isHighlighted}`;
      if (!facadeMatCache.has(key)) {
        const tex = getFacadeTexture(levels, isHighlighted);
        facadeMatCache.set(
          key,
          new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.75,
            metalness: 0.05,
          })
        );
      }
      return facadeMatCache.get(key)!;
    };

    const rooftopClutterMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.7,
    });
    const waterHeaterTankMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.2,
    });
    const solarCollectorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // dark solar panel
      roughness: 0.2,
      metalness: 0.8,
    });
    const pergolaMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.8,
    });
    const balconyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.7,
      metalness: 0.05,
    });
    const pilotiMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.6,
      metalness: 0.1,
    });

    REAL_BUILDINGS.forEach((b) => {
      if (b.polygon.length < 3) return;

      const isChissinBuilding =
        b.street.includes('חיסין') ||
        (b.center.lat >= 32.0731 && b.center.lat <= 32.0747 && b.center.lng >= 34.7762 && b.center.lng <= 34.7785);

      // Convert GIS points to local coordinates
      const worldPts = b.polygon.map((p) => latLngToWorld(p.lat, p.lng));
      const centerWorld = latLngToWorld(b.center.lat, b.center.lng);

      // Create 2D shape relative to building center
      const shape = new THREE.Shape();
      shape.moveTo(worldPts[0].x - centerWorld.x, -(worldPts[0].z - centerWorld.z));
      for (let i = 1; i < worldPts.length; i++) {
        shape.lineTo(worldPts[i].x - centerWorld.x, -(worldPts[i].z - centerWorld.z));
      }
      shape.closePath();

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: b.height,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.15,
        bevelThickness: 0.15,
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Normalize UV mapping for realistic architectural facade windows and roof drainage tiles
      const uvAttr = geo.attributes.uv;
      if (uvAttr && geo.groups.length >= 2) {
        // Roof cap UV scaling (group 0)
        const roofGroup = geo.groups[0];
        for (let i = roofGroup.start; i < roofGroup.start + roofGroup.count; i++) {
          uvAttr.setXY(i, uvAttr.getX(i) * 0.18, uvAttr.getY(i) * 0.18);
        }
        // Side walls UV scaling & vertical level alignment (group 1)
        const sideGroup = geo.groups[1];
        for (let i = sideGroup.start; i < sideGroup.start + sideGroup.count; i++) {
          const u = uvAttr.getX(i);
          const v = uvAttr.getY(i);
          // Map v to 0 (ground level) .. 1 (roof level)
          const normalizedV = Math.max(0, Math.min(1, (1 - v) / b.height));
          const scaledU = u / 12.0; // 12 meters facade width per window bay
          uvAttr.setXY(i, scaledU, normalizedV);
        }
        uvAttr.needsUpdate = true;
      }

      geo.rotateX(-Math.PI / 2); // Three.js extrudes in Z, -PI/2 rotates upwards to +Y height!
      geo.computeBoundingBox();
      const bBox = geo.boundingBox || new THREE.Box3();

      const clampedLevels = Math.min(Math.max(b.levels, 2), 7);
      const facadeMat = getFacadeMat(clampedLevels, isChissinBuilding);

      // Multi-material: index 0 = roof/bottom caps, index 1 = side facade walls
      const mesh = new THREE.Mesh(geo, [roofMat, facadeMat]);
      mesh.position.set(centerWorld.x, 0, centerWorld.z);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = !this.isSoftwareGl;
      mesh.userData = {
        type: 'building',
        id: b.id,
        street: b.street,
        housenumber: b.housenumber,
        height: b.height,
        levels: b.levels,
        center: b.center,
      };

      // Architectural crisp edge lines (Apple Maps 3D style)
      const edgeGeo = new THREE.EdgesGeometry(geo, 25);
      const edgeMat = new THREE.LineBasicMaterial({
        color: isChissinBuilding ? 0x0284c7 : 0x64748b,
        transparent: true,
        opacity: isChissinBuilding ? 0.75 : 0.4,
      });
      const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
      mesh.add(edgeLines);

      this.realBuildingsGroup.add(mesh);

      // Add 3D Bauhaus Architectural features for Chissin Street buildings
      if (isChissinBuilding) {
        this.addBauhausArchitecturalFeatures(
          mesh,
          bBox,
          b.height,
          clampedLevels,
          balconyMat,
          pilotiMat
        );
      }

      // Rooftop Authentic Tel Aviv Clutter (Elevator rooms, Solar water heaters, Pergolas, AC units)
      if (this.showRooftops && b.height < 55) {
        this.addRooftopDetails(
          mesh,
          bBox,
          b.height,
          isChissinBuilding,
          rooftopClutterMat,
          waterHeaterTankMat,
          solarCollectorMat,
          pergolaMat
        );
      }

      // Floating address billboard for Chissin buildings
      if (isChissinBuilding && b.housenumber) {
        const labelSprite = this.createAddressSprite(b.housenumber);
        labelSprite.position.set(centerWorld.x, b.height + 4.5, centerWorld.z);
        this.realBuildingsGroup.add(labelSprite);
      }
    });
  }

  private addBauhausArchitecturalFeatures(
    mesh: THREE.Mesh,
    bBox: THREE.Box3,
    height: number,
    levels: number,
    balconyMat: THREE.Material,
    pilotiMat: THREE.Material
  ) {
    const floorH = height / levels;
    const frontZ = bBox.max.z;
    const buildingWidth = Math.max(8, bBox.max.x - bBox.min.x);
    const balconyW = Math.min(buildingWidth * 0.55, 7.5);

    // 1. Cantilevered Balconies on residential levels (Floors 1..levels-1)
    for (let l = 1; l < levels; l++) {
      const balconyY = l * floorH;
      // Front balcony
      const balconyGeo = new THREE.BoxGeometry(balconyW, 0.9, 1.8);
      const balcony = new THREE.Mesh(balconyGeo, balconyMat);
      balcony.position.set(0, balconyY + 0.45, frontZ + 0.85);
      balcony.castShadow = !this.isSoftwareGl;
      mesh.add(balcony);

      // Curved edge trim on balcony
      const curveGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.9, 12, 1, false, 0, Math.PI);
      const curve = new THREE.Mesh(curveGeo, balconyMat);
      curve.rotation.y = Math.PI / 2;
      curve.position.set(balconyW / 2, balconyY + 0.45, frontZ + 0.85);
      mesh.add(curve);
    }

    // 2. Ground Floor Concrete Pilotis (עמודי בטון)
    const pilotiGeo = new THREE.CylinderGeometry(0.32, 0.32, floorH * 0.95, 10);
    const spacing = balconyW * 0.38;
    [-spacing, 0, spacing].forEach((offset) => {
      const piloti = new THREE.Mesh(pilotiGeo, pilotiMat);
      piloti.position.set(offset, (floorH * 0.95) / 2, frontZ - 0.3);
      piloti.castShadow = !this.isSoftwareGl;
      mesh.add(piloti);
    });
  }

  private addRooftopDetails(
    mesh: THREE.Mesh,
    bBox: THREE.Box3,
    height: number,
    isChissin: boolean,
    clutterMat: THREE.Material,
    tankMat: THREE.Material,
    solarMat: THREE.Material,
    pergolaMat: THREE.Material
  ) {
    const roofY = height;
    const halfW = (bBox.max.x - bBox.min.x) * 0.25;
    const halfD = (bBox.max.z - bBox.min.z) * 0.25;

    // 1. Rooftop Elevator / Stairwell Penthouse Box with overhanging canopy
    const penthouseGeo = new THREE.BoxGeometry(4.4, 2.7, 3.6);
    const penthouse = new THREE.Mesh(penthouseGeo, clutterMat);
    penthouse.position.set(halfW * 0.3, roofY + 1.35, halfD * 0.3);
    mesh.add(penthouse);

    const canopyGeo = new THREE.BoxGeometry(5.0, 0.2, 4.2);
    const canopy = new THREE.Mesh(canopyGeo, clutterMat);
    canopy.position.set(halfW * 0.3, roofY + 2.75, halfD * 0.3);
    mesh.add(canopy);

    // 2. Battery of Solar Water Heaters (דודי שמש וקולטים מוטים לדרום)
    const heaterOffsets = [
      { x: -Math.max(2.2, halfW), z: -Math.max(1.5, halfD) },
      { x: 0, z: -Math.max(1.8, halfD) },
      { x: Math.max(2.2, halfW), z: -Math.max(1.5, halfD) },
    ];

    heaterOffsets.forEach((pos) => {
      // Cylinder water tank
      const tankGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.35, 10);
      const tank = new THREE.Mesh(tankGeo, tankMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(pos.x, roofY + 0.85, pos.z - 0.7);
      mesh.add(tank);

      // Angled dark solar collector
      const solarGeo = new THREE.BoxGeometry(1.25, 0.07, 1.45);
      const solar = new THREE.Mesh(solarGeo, solarMat);
      solar.rotation.x = 0.52; // angled towards the sun (south)
      solar.position.set(pos.x, roofY + 0.45, pos.z);
      mesh.add(solar);
    });

    // 3. Concrete Pergola (פרגולת קורות בטון על הגג)
    if (isChissin) {
      for (let beam = 0; beam < 5; beam++) {
        const beamGeo = new THREE.BoxGeometry(0.18, 0.32, 4.6);
        const pergolaBeam = new THREE.Mesh(beamGeo, pergolaMat);
        pergolaBeam.position.set(-2.0 + beam * 0.9, roofY + 2.2, halfD * 0.7);
        mesh.add(pergolaBeam);
      }
      const girderGeo = new THREE.BoxGeometry(4.2, 0.25, 0.25);
      const girder = new THREE.Mesh(girderGeo, pergolaMat);
      girder.position.set(-0.2, roofY + 2.4, halfD * 0.7);
      mesh.add(girder);
    }

    // 4. Outdoor AC Compressor Units (מנועי מזגנים)
    const acGeo = new THREE.BoxGeometry(0.85, 0.65, 0.45);
    const ac = new THREE.Mesh(acGeo, clutterMat);
    ac.position.set(halfW * 0.8, roofY + 0.35, -halfD * 0.5);
    mesh.add(ac);
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

    docs.forEach((doc) => {
      const pinGroup = this.createDocumentPin(doc);
      this.documentsGroup.add(pinGroup);
      this.pinMeshesMap.set(doc.id, pinGroup);
    });

    this.updateInteractiveMeshes();
    this.requestRender();
  }

  private createDocumentPin(doc: GeotaggedDocument): THREE.Group {
    const pinGroup = new THREE.Group();
    const worldPos = latLngToWorld(doc.coordinates.lat, doc.coordinates.lng);
    const elevation = doc.coordinates.elevation || 17;

    pinGroup.position.set(worldPos.x, elevation, worldPos.z);
    pinGroup.userData = { type: 'document', id: doc.id, data: doc };

    // Category colors
    let pinColor = 0x3b82f6; // blue: architectural
    if (doc.category === 'permit') pinColor = 0xf59e0b; // amber
    if (doc.category === 'preservation') pinColor = 0x10b981; // emerald
    if (doc.category === 'cadastral') pinColor = 0x8b5cf6; // purple
    if (doc.category === 'photo') pinColor = 0xec4899; // pink
    if (doc.category === 'facade') pinColor = 0x06b6d4; // cyan

    // 1. Vertical indicator needle
    const needleGeo = new THREE.CylinderGeometry(0.12, 0.02, 6.0, 8);
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.8,
      roughness: 0.2,
    });
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.position.y = -3.0;
    pinGroup.add(needle);

    // 2. Glowing Head Sphere
    const headGeo = new THREE.SphereGeometry(1.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: pinColor,
      roughness: 0.2,
      metalness: 0.4,
      emissive: pinColor,
      emissiveIntensity: 0.35,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.userData = { isPinHead: true, docId: doc.id };
    headMesh.castShadow = !this.isSoftwareGl;
    pinGroup.add(headMesh);

    // 3. Floating Ring Indicator (Toroid)
    const ringGeo = new THREE.TorusGeometry(2.0, 0.15, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: pinColor,
      transparent: true,
      opacity: 0.65,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    pinGroup.add(ringMesh);

    // 4. Ground Contact Beacon Circle
    const beaconGeo = new THREE.RingGeometry(0.8, 1.8, 16);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: pinColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.rotation.x = -Math.PI / 2;
    beacon.position.y = -elevation + 0.05;
    pinGroup.add(beacon);

    // 5. Document Badge
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 384;
    labelCanvas.height = 110;
    const ctx = labelCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(8, 8, 368, 94, 16);
      ctx.fill();

      ctx.strokeStyle = `#${pinColor.toString(16).padStart(6, '0')}`;
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(42, 55, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'left';
      const truncatedTitle = doc.titleHe.length > 18 ? doc.titleHe.substring(0, 18) + '...' : doc.titleHe;
      ctx.fillText(truncatedTitle, 72, 48);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px sans-serif';
      ctx.fillText(`${doc.year} • ${doc.addressHe}`, 72, 82);
    }

    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const labelMat = new THREE.SpriteMaterial({
      map: labelTex,
      transparent: true,
      depthTest: false,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.scale.set(7.5, 2.2, 1);
    labelSprite.position.set(0, 2.8, 0);
    pinGroup.add(labelSprite);

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
    this.selectedDocId = doc.id;
    const worldPos = latLngToWorld(doc.coordinates.lat, doc.coordinates.lng);
    const targetElevation = doc.coordinates.elevation || 17;

    const targetPos = new THREE.Vector3(
      worldPos.x + 24,
      targetElevation + 20,
      worldPos.z + 36
    );
    const targetLookAt = new THREE.Vector3(worldPos.x, targetElevation, worldPos.z);

    this.startCameraTransition(targetPos, targetLookAt);
    this.highlightPin(doc.id);
  }

  public focusBuilding(building: BuildingPlot) {
    const worldPos = latLngToWorld(building.centerCoordinates.lat, building.centerCoordinates.lng);

    const targetPos = new THREE.Vector3(
      worldPos.x + 35,
      building.height + 28,
      worldPos.z + 50
    );
    const targetLookAt = new THREE.Vector3(worldPos.x, building.height / 2, worldPos.z);

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
      case 'street':
        targetPos.set(10, 6, -15);
        targetLook.set(20, 6, 40);
        break;
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

  private highlightPin(docId: string | null) {
    this.pinMeshesMap.forEach((pinGroup, id) => {
      const isSelected = id === docId;
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
    if (!building) {
      this.highlightBuilding(null);
      return;
    }
    let foundMesh: THREE.Object3D | null = null;
    this.realBuildingsGroup.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.userData?.type === 'building' &&
        (child.userData.id === building.id ||
          (building.number > 0 && child.userData.housenumber === building.number.toString()))
      ) {
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

  private bindEvents() {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isGeotagModeActive) return;

      _raycaster.setFromCamera(_pointer, this.camera);
      const intersects = _raycaster.intersectObjects(this.interactiveMeshes, false);

      let hoveredDoc: GeotaggedDocument | null = null;
      for (const hit of intersects) {
        let current: THREE.Object3D | null = hit.object;
        while (current && current !== this.scene) {
          if (current.userData?.type === 'document') {
            hoveredDoc = current.userData.data;
            break;
          }
          current = current.parent;
        }
        if (hoveredDoc) break;
      }

      if (hoveredDoc) {
        dom.style.cursor = 'pointer';
        this.callbacks.onHoverDocument(hoveredDoc, { x: e.clientX, y: e.clientY });
      } else {
        dom.style.cursor = 'default';
        this.callbacks.onHoverDocument(null);
      }
    });

    let pointerDownPos = { x: 0, y: 0 };

    dom.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      // User is interacting directly — cancel any programmatic camera transition
      this.transitionTarget = null;
    });

    dom.addEventListener('wheel', () => {
      // User is zooming with wheel — cancel any programmatic camera transition immediately
      this.transitionTarget = null;
    }, { passive: true });

    dom.addEventListener('click', (e) => {
      // If the pointer moved more than 5px between pointerdown and click,
      // this was a drag/pan/zoom gesture — do NOT select anything!
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 5) return;

      const rect = dom.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointer, this.camera);

      // Geotag Placement Mode: pick coordinate on roof or terrain
      if (this.isGeotagModeActive) {
        const targets: THREE.Object3D[] = [];
        if (this.groundMesh) targets.push(this.groundMesh);
        this.realBuildingsGroup.traverse((c) => {
          if (c instanceof THREE.Mesh) targets.push(c);
        });

        const hits = _raycaster.intersectObjects(targets, false);
        if (hits.length > 0) {
          const point = hits[0].point;
          const coords = worldToLatLng(point.x, point.z);
          this.callbacks.onGeotagPickPoint(coords.lat, coords.lng, Math.max(point.y + 1.5, 2));
          this.setGeotagMode(false);
        }
        return;
      }

      // Normal mode
      const hits = _raycaster.intersectObjects(this.interactiveMeshes, false);
      if (hits.length > 0) {
        let clickedDoc: GeotaggedDocument | null = null;
        let clickedBuilding: BuildingPlot | null = null;

        for (const hit of hits) {
          let curr: THREE.Object3D | null = hit.object;
          while (curr && curr !== this.scene) {
            if (curr.userData?.type === 'document') {
              clickedDoc = curr.userData.data;
              break;
            }
            if (curr.userData?.type === 'building') {
              let bData = this.buildings.find(
                (b) => (b.number > 0 && b.number.toString() === curr?.userData?.housenumber) || b.id === curr?.userData?.id
              );
              if (!bData) {
                const u = curr.userData;
                const bNum = parseInt(u.housenumber) || 0;
                bData = {
                  id: u.id || `b-osm-${Math.random()}`,
                  number: bNum,
                  street: u.street || (bNum > 0 ? 'Chissin' : 'Chissin Block'),
                  streetHe: u.street || (bNum > 0 ? 'רחוב חיסין' : 'מתחם רחוב חיסין'),
                  centerCoordinates: {
                    lat: u.center?.lat || 32.0738,
                    lng: u.center?.lng || 34.7774,
                    elevation: u.height,
                  },
                  height: u.height || 15,
                  levels: u.levels || Math.max(Math.round((u.height || 15) / 3.4), 3),
                  yearBuilt: 1936,
                  architect: 'Arch. International Style',
                  architectHe: 'אדריכלות הסגנון הבינלאומי (באוהאוס)',
                  style: 'Bauhaus / International',
                  descriptionHe: '',
                  preservationStatus: 'Standard',
                  width: 18,
                  depth: 16,
                  rotation: 0,
                  hasCurvedBalcony: true,
                  hasPilotis: true,
                  hasRoofPergola: true,
                };
              }
              clickedBuilding = bData;
              this.highlightBuilding(curr);
              break;
            }
            curr = curr.parent;
          }
          if (clickedDoc || clickedBuilding) break;
        }

        if (clickedDoc) {
          this.callbacks.onSelectDocument(clickedDoc);
          this.highlightPin(clickedDoc.id);
          this.highlightBuilding(null);
          return;
        }

        if (clickedBuilding) {
          this.callbacks.onSelectBuilding(clickedBuilding);
          return;
        }
      }

      this.callbacks.onSelectDocument(null);
      this.callbacks.onSelectBuilding(null);
      this.highlightPin(null);
      this.highlightBuilding(null);
    });

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
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
