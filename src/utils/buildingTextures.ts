import * as THREE from 'three';

// Cache generated textures to avoid redundant GPU allocations
const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Procedurally generates authentic Tel Aviv Bauhaus / White City facade texture
 * with horizontal ribbon windows, louvers (תריסים), concrete sun-breakers, and floor slabs.
 */
export function getFacadeTexture(levels: number = 4, isHighlighted: boolean = false): THREE.CanvasTexture {
  const key = `facade-${levels}-${isHighlighted}`;
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. Base stucco wall color (Warm cream / off-white characteristic of the White City)
  ctx.fillStyle = isHighlighted ? '#ffffff' : '#f5f2eb';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle plaster grain
  ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
  for (let i = 0; i < 3000; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    ctx.fillRect(rx, ry, 2, 2);
  }

  const floorHeight = 512 / levels;

  // 2. Render each floor with windows, balconies, and shade overhangs
  for (let l = 0; l < levels; l++) {
    const yTop = l * floorHeight;
    const isGround = l === levels - 1; // ground floor at bottom of canvas (v=0)

    // Floor separation concrete slab line (Bevel)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, yTop, 512, 7);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, yTop + 7, 512, 3);

    if (isGround) {
      // Ground floor: Entrance lobby glass & pilotis
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, yTop + floorHeight - 14, 512, 14);

      // Entrance glass door / large windows
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(140, yTop + 14, 232, floorHeight - 28);

      // Warm interior lobby light reflection
      ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.fillRect(150, yTop + 20, 212, floorHeight - 40);

      // Lobby door mullions
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.strokeRect(140, yTop + 14, 232, floorHeight - 28);
      ctx.beginPath();
      ctx.moveTo(256, yTop + 14);
      ctx.lineTo(256, yTop + floorHeight - 14);
      ctx.stroke();

      // Side concrete pillars (Pilotis)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(30, yTop + 6, 26, floorHeight - 10);
      ctx.fillRect(456, yTop + 6, 26, floorHeight - 10);
    } else {
      // Upper residential floors: Continuous Bauhaus ribbon windows
      const winY = yTop + floorHeight * 0.24;
      const winH = floorHeight * 0.48;

      // Concrete sun-visor (brise-soleil / כרכוב הצללה)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(15, winY - 9, 482, 9);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(15, winY, 482, 4);

      // 4 Window openings with high contrast glass and frames
      const numWindows = 4;
      const winWidth = 92;
      const spacing = (512 - numWindows * winWidth) / (numWindows + 1);

      for (let w = 0; w < numWindows; w++) {
        const wx = spacing + w * (winWidth + spacing);

        // Dark window frame
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx, winY, winWidth, winH);

        // Glass pane with dark sky reflection
        const grad = ctx.createLinearGradient(wx, winY, wx + winWidth, winY + winH);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(0.3, '#0f172a');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(wx + 3, winY + 3, winWidth - 6, winH - 6);

        // Horizontal window blinds / louvers (תריסים)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        for (let s = 8; s < winH - 6; s += 9) {
          ctx.fillRect(wx + 4, winY + s, winWidth - 8, 2);
        }
      }

      // Continuous Balcony Handrail band
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, yTop + floorHeight - 18, 462, 15);
      ctx.fillStyle = '#475569';
      ctx.fillRect(25, yTop + floorHeight - 20, 462, 3);
    }
  }

  // 3. Vertical Thermometer Stairwell Window Stripe
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(238, 12, 36, 512 - 24);
  ctx.fillStyle = '#0369a1';
  ctx.fillRect(242, 16, 28, 512 - 32);
  // Grid mullions
  ctx.fillStyle = '#0f172a';
  for (let gy = 20; gy < 500; gy += 22) {
    ctx.fillRect(242, gy, 28, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

/**
 * Procedurally generates authentic Tel Aviv rooftop texture with water drainage tiles
 */
export function getRoofTexture(): THREE.CanvasTexture {
  const key = 'roof-texture-v2';
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Weathered rooftop bitumen / gravel wash
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 256, 256);

  // Rooftop tile paving grid
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Weathering stains and patches
  ctx.fillStyle = 'rgba(100, 116, 139, 0.15)';
  ctx.beginPath();
  ctx.arc(70, 90, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(175, 150, 48, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

/**
 * Procedural ground satellite / aerial orthophoto texture matching the Simplex 3D captures
 */
export function getSatelliteGroundTexture(): THREE.CanvasTexture {
  const key = 'satellite-ground-v2';
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Base urban ground (light sand/pavement)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 1024, 1024);

  // Urban asphalt road networks
  ctx.fillStyle = '#334155';
  // Ben Zion Boulevard (horizontal broad corridor)
  ctx.fillRect(0, 470, 1024, 60);
  // King George Street (diagonal / vertical crossing)
  ctx.fillRect(200, 0, 70, 1024);
  // Dizengoff / Habima approach
  ctx.fillRect(720, 0, 80, 1024);

  // Green boulevard promenade in the center of Ben Zion
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(0, 488, 1024, 24);

  // Lush green garden of Gan Chissin in the center
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.ellipse(512, 512, 130, 90, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Walking paths in Gan Chissin (warm sand gravel)
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(512, 512, 90, 60, -0.15, 0, Math.PI * 2);
  ctx.stroke();

  // Residential back courtyards with trees and gardens
  const residentialCourtyards = [
    [360, 360, 55],
    [430, 300, 65],
    [640, 380, 60],
    [680, 600, 70],
    [390, 660, 65],
    [290, 530, 50],
    [820, 390, 75],
  ];
  ctx.fillStyle = '#22c55e';
  residentialCourtyards.forEach(([gx, gy, gr]) => {
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Habima Square (warm golden stone plaza)
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(780, 260, 220, 220);

  // Habima sunken garden / reflecting pool
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(840, 320, 90, 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}
