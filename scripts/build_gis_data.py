#!/usr/bin/env python3
"""
Rebuilds the 3D-model data files in src/data from the Tel Aviv-Yafo municipal GIS
(gisn.tel-aviv.gov.il, IView2 MapServer). Run from the repository root:

    python3 scripts/build_gis_data.py [cache-dir]

What it writes
  gisBuildings.ts  adds roof statistics to the block's buildings (rm = mean roof height, rx = top of roof
                   structures, both metres above the ground, from the municipal surface model)
  gisContext.ts    the buildings around the block (not selectable, drawn as surroundings)
  gisParcels.ts    land parcels (building lots vs. street space) - used for yards, fences and sidewalks
  gisGardens.ts    public gardens and boulevard strips
  gisTrees.ts      adds the species group to every tree and trees for the surroundings
  terrain.ts       ground elevation grid covering the block and its surroundings

Layers: 513 buildings, 524 parcels, 551 public gardens, 574 tree canopies 2024, 628 street-tree inventory.
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = 'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'src', 'data')
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.gis-cache')

LAT0, LNG0 = 32.07380, 34.77740  # CHISSIN_CENTER (src/utils/geo.ts)
M_LAT, M_LNG = 111320.0, 94330.0
REF = 21.06  # metres above sea level of scene y = 0 (kept from the first terrain model)
MARGIN = 150.0  # metres of surroundings around the block


def to_xz(lng, lat):
    return ((lng - LNG0) * M_LNG, -(lat - LAT0) * M_LAT)


def fetch(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 - network hiccups: retry with backoff
            if i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))


def query(layer, bbox, tiles=1, extra=None):
    """All features of a layer intersecting bbox (lng0, lat0, lng1, lat1), fetched in tiles and de-duplicated."""
    os.makedirs(CACHE, exist_ok=True)
    cache = os.path.join(CACHE, f'l{layer}.json')
    if os.path.exists(cache):
        return json.load(open(cache, encoding='utf-8'))
    feats, seen = [], set()
    for ix in range(tiles):
        for iy in range(tiles):
            x0 = bbox[0] + (bbox[2] - bbox[0]) * ix / tiles
            x1 = bbox[0] + (bbox[2] - bbox[0]) * (ix + 1) / tiles
            y0 = bbox[1] + (bbox[3] - bbox[1]) * iy / tiles
            y1 = bbox[1] + (bbox[3] - bbox[1]) * (iy + 1) / tiles
            off = 0
            while True:
                params = dict(where='1=1', geometry=f'{x0},{y0},{x1},{y1}', geometryType='esriGeometryEnvelope',
                              inSR=4326, outSR=4326, spatialRel='esriSpatialRelIntersects', outFields='*', f='json',
                              geometryPrecision=7, resultOffset=off, resultRecordCount=500)
                params.update(extra or {})
                d = fetch(BASE + f'{layer}/query?' + urllib.parse.urlencode(params))
                if 'error' in d:
                    raise RuntimeError(d['error'])
                for f in d['features']:
                    key = json.dumps(f['attributes'], sort_keys=True, ensure_ascii=False)
                    if key not in seen:
                        seen.add(key)
                        feats.append(f)
                if not d.get('exceededTransferLimit'):
                    break
                off += len(d['features'])
    json.dump(feats, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
    return feats


def ring_area(r):
    return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


def centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r)):
        x0, y0 = r[i]
        x1, y1 = r[(i + 1) % len(r)]
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-9:
        return (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    return (cx / (3 * a), cy / (3 * a))


def inside(pt, ring):
    x, y = pt
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def simplify(ring, tol):
    """Drops the closing vertex and points closer than tol to the line through their neighbours."""
    r = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring[:]
    changed = True
    while changed and len(r) > 4:
        changed = False
        for i in range(len(r)):
            a, b, c = r[i - 1], r[i], r[(i + 1) % len(r)]
            dx, dy = c[0] - a[0], c[1] - a[1]
            ln = math.hypot(dx, dy)
            d = abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / ln if ln > 1e-6 else math.hypot(b[0] - a[0], b[1] - a[1])
            if d < tol:
                del r[i]
                changed = True
                break
    return r


def dm(ring):
    """Scene metres -> flat list of decimetre integers."""
    out = []
    for x, z in ring:
        out += [round(x * 10), round(z * 10)]
    return out


def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


HEADER = '// AUTO-GENERATED by scripts/build_gis_data.py from the Tel Aviv-Yafo municipal GIS (gisn.tel-aviv.gov.il, IView2 MapServer).\n'


def main():
    # ---- the block's buildings (already in the repo) ----
    src = open(os.path.join(DATA, 'gisBuildings.ts'), encoding='utf-8').read()
    lines = src.split('\n')
    block = {}
    for ln in lines:
        if ln.strip().startswith('{"id"'):
            o = json.loads(ln.strip().rstrip(','))
            block[o['id']] = o
    lats = [p[0] for o in block.values() for poly in o['p'] for ring in poly for p in ring]
    lngs = [p[1] for o in block.values() for poly in o['p'] for ring in poly for p in ring]
    bbox = (min(lngs) - MARGIN / M_LNG, min(lats) - MARGIN / M_LAT, max(lngs) + MARGIN / M_LNG, max(lats) + MARGIN / M_LAT)
    X0, Z1 = to_xz(bbox[0], bbox[1])
    X1, Z0 = to_xz(bbox[2], bbox[3])
    print('extent (scene m):', round(X0), round(Z0), round(X1), round(Z1))

    buildings = query(513, bbox, tiles=2)
    parcels = query(524, bbox, tiles=2)
    gardens = query(551, bbox)
    inventory = query(628, bbox, tiles=2)
    canopies = query(574, bbox, tiles=4, extra={'maxAllowableOffset': 0.000004, 'outFields': 'OBJECTID'})
    print('buildings', len(buildings), 'parcels', len(parcels), 'gardens', len(gardens), 'inventory', len(inventory), 'canopies', len(canopies))

    def roof_stats(a):
        mean, mx = a.get('dsm_mean'), a.get('dsm_max')
        h = a.get('gova_simplex_2019') or a.get('gova_mpi_2009') or 0
        if not mean or not mx or mean < 1.5:
            # no surface-model statistics: the surveyed height includes roof structures and the lowest ground point
            mx = max(2.5, h - 2.5) if h > 9 else max(2.2, h)
            mean = mx - 2.6 if mx > 9 else mx
        return round(mean, 1), round(max(mx, mean), 1)

    # ---- 1. roof statistics for the block's buildings ----
    by_id = {'t-%d' % f['attributes']['id_binyan']: f for f in buildings}
    out = []
    for ln in lines:
        if ln.strip().startswith('{"id"'):
            o = json.loads(ln.strip().rstrip(','))
            f = by_id.get(o['id'])
            if f:
                o['rm'], o['rx'] = roof_stats(f['attributes'])
            out.append('  ' + js(o) + ',')
        else:
            out.append(ln)
    text = '\n'.join(out)
    if 'rm?: number' not in text:
        text = text.replace('//   n: name;', '//   rm / rx: mean roof height and top of roof structures above the ground (m), municipal surface model;\n//   n: name;')
        text = text.replace('  h: number;\n  b: number;', '  h: number;\n  rm?: number;\n  rx?: number;\n  b: number;')
    open(os.path.join(DATA, 'gisBuildings.ts'), 'w', encoding='utf-8').write(text)

    # ---- 2. surrounding buildings ----
    ctx = []
    all_pts = []  # (x, z, ground elevation) for the terrain
    for f in buildings:
        a = f['attributes']
        rings = [[to_xz(*p) for p in r] for r in f['geometry']['rings']]
        outer = max(rings, key=lambda r: abs(ring_area(r)))
        c = centroid(outer)
        if abs(ring_area(outer)) > 25:
            # Ground level under a building: surveyed roof top minus the height of that top above the ground in
            # the surface model. (min_height alone is noisy: basements, sunken yards.)
            if a.get('max_height') and a.get('dsm_max') and a['dsm_max'] > 2:
                all_pts.append((c[0], c[1], a['max_height'] - a['dsm_max'] - REF))
            elif a.get('min_height') is not None:
                all_pts.append((c[0], c[1], a['min_height'] - REF))
        if 't-%d' % a['id_binyan'] in block:
            continue
        if not (X0 <= c[0] <= X1 and Z0 <= c[1] <= Z1):
            continue
        mean, mx = roof_stats(a)
        if mx < 2 or abs(ring_area(outer)) < 6:
            continue
        # ArcGIS polygons: clockwise rings are outer boundaries, counter-clockwise ones are holes
        parts = []
        for r in rings:
            s = simplify(r, 0.25)
            if len(s) < 3 or abs(ring_area(s)) < 4:
                continue
            if ring_area(r) < 0 or not parts:  # outer ring (clockwise in lng/lat = negative in x, -lat... see note)
                parts.append([dm(s)])
            else:
                parts[-1].append(dm(s))
        o = {'p': parts, 'rm': mean, 'rx': mx}
        if a.get('ms_komot'):
            o['f'] = a['ms_komot']
        if a.get('year'):
            o['y'] = a['year']
        if (a.get('t_amudim') or '').strip() not in ('', 'לא'):
            o['pl'] = 1
        kind = (a.get('t_sug_mivne') or '').strip()
        if kind and kind != 'מבנה רגיל':
            o['k'] = kind
        name = (a.get('shem_mivne') or '').strip()
        if name:
            o['n'] = name
        ctx.append(o)
    # Ring orientation: decide outer/hole by containment instead of trusting the winding
    for o in ctx:
        rings = [r for part in o['p'] for r in part]
        rings.sort(key=lambda r: -abs(ring_area(list(zip(r[0::2], r[1::2])))))
        parts = []
        for r in rings:
            pts = list(zip(r[0::2], r[1::2]))
            host = next((p for p in parts if inside(pts[0], list(zip(p[0][0::2], p[0][1::2])))), None)
            if host:
                host.append(r)
            else:
                parts.append([r])
        o['p'] = parts
    with open(os.path.join(DATA, 'gisContext.ts'), 'w', encoding='utf-8') as fh:
        fh.write(HEADER)
        fh.write('// Buildings surrounding the block (layer 513) - drawn as context, not selectable.\n')
        fh.write('// p: parts, each [outer ring, ...holes]; a ring is a flat list of x, z scene coordinates in decimetres.\n')
        fh.write('// rm / rx: mean roof height and top of roof structures above the ground (m); f: floors; y: year built;\n')
        fh.write('// pl: 1 = open ground floor on columns; k: type if not a regular building; n: name.\n')
        fh.write('export interface GisContextBuilding {\n  p: number[][][];\n  rm: number;\n  rx: number;\n  f?: number;\n  y?: number;\n  pl?: number;\n  k?: string;\n  n?: string;\n}\n\n')
        fh.write('export const GIS_CONTEXT: GisContextBuilding[] = [\n')
        for o in ctx:
            fh.write('  ' + js(o) + ',\n')
        fh.write('];\n')
    print('context buildings', len(ctx))

    # ---- 3. parcels ----
    b_centroids = []
    for f in buildings:
        a = f['attributes']
        rings = [[to_xz(*p) for p in r] for r in f['geometry']['rings']]
        outer = max(rings, key=lambda r: abs(ring_area(r)))
        kind = (a.get('t_sug_mivne') or '').strip()
        if abs(ring_area(outer)) > 40 and kind in ('מבנה רגיל', 'מבנה ציבור', ''):
            b_centroids.append(centroid(outer))
    lots = []
    for f in parcels:
        rings = [[to_xz(*p) for p in r] for r in f['geometry']['rings']]
        outer = max(rings, key=lambda r: abs(ring_area(r)))
        area = abs(ring_area(outer))
        c = centroid(outer)
        if area < 30 or not (X0 - 40 <= c[0] <= X1 + 40 and Z0 - 40 <= c[1] <= Z1 + 40):
            continue
        xs = [p[0] for p in outer]
        zs = [p[1] for p in outer]
        n_b = sum(1 for bc in b_centroids if min(xs) <= bc[0] <= max(xs) and min(zs) <= bc[1] <= max(zs) and inside(bc, outer))
        # Streets and squares are parcels too: large, with (almost) no buildings on them
        perim = sum(math.hypot(outer[i][0] - outer[i - 1][0], outer[i][1] - outer[i - 1][1]) for i in range(len(outer)))
        compact = 4 * math.pi * area / (perim * perim)
        is_lot = n_b > 0 and not (area > 4500 and n_b <= 2) and not (compact < 0.12)
        lots.append([1 if is_lot else 0, dm(simplify(outer, 0.2))])
    with open(os.path.join(DATA, 'gisParcels.ts'), 'w', encoding='utf-8') as fh:
        fh.write(HEADER)
        fh.write('// Land parcels (layer 524). Each entry: [building lot 1 / street, square or garden 0, outline as a flat\n')
        fh.write('// list of x, z scene coordinates in decimetres].\n')
        fh.write('export type GisParcel = [number, number[]];\n')
        fh.write('export const GIS_PARCELS: GisParcel[] = ' + js(lots) + ';\n')
    print('parcels', len(lots), 'lots', sum(l[0] for l in lots))

    # ---- 4. gardens ----
    gs = []
    for f in gardens:
        a = f['attributes']
        label = (a.get('shem_gan_tazuga') or '').strip()
        name = (a.get('shem_gan') or '').strip()
        for r in f['geometry']['rings']:
            ring = simplify([to_xz(*p) for p in r], 0.3)
            if len(ring) >= 3 and abs(ring_area(ring)) > 40:
                gs.append({'n': name, 't': 'strip' if 'פס' in label else 'garden', 'p': dm(ring)})
    with open(os.path.join(DATA, 'gisGardens.ts'), 'w', encoding='utf-8') as fh:
        fh.write(HEADER)
        fh.write('// Public gardens and boulevard strips (layer 551). p: outline as a flat list of x, z scene coordinates\n')
        fh.write('// in decimetres; t: "garden" or "strip" (planted boulevard median).\n')
        fh.write("export interface GisGarden {\n  n: string;\n  t: 'garden' | 'strip';\n  p: number[];\n}\n")
        fh.write('export const GIS_GARDENS: GisGarden[] = ' + js(gs) + ';\n')
    print('gardens', len(gs))

    # ---- 5. terrain ----
    # Ground elevation = lowest point of every building; drop outliers (basements, bridges) against the neighbours
    pts = []
    for i, (x, z, e) in enumerate(all_pts):
        near = sorted(all_pts, key=lambda q: (q[0] - x) ** 2 + (q[1] - z) ** 2)[1:9]
        med = sorted(q[2] for q in near)[len(near) // 2]
        pts.append((x, z, med if abs(e - med) > 2.0 else e))
    cell = 8.0
    gx0, gz1 = X0 - 80, Z1 + 80
    nx = int(math.ceil((X1 + 80 - gx0) / cell)) + 1
    nz = int(math.ceil((gz1 - (Z0 - 80)) / cell)) + 1
    grid = [[0.0] * nx for _ in range(nz)]
    for j in range(nz):
        north = -gz1 + j * cell  # rows go from south to north
        z = -north
        for i in range(nx):
            x = gx0 + i * cell
            near = sorted(((q[0] - x) ** 2 + (q[1] - z) ** 2, q[2]) for q in pts)[:8]
            w = [1.0 / (d + 80.0) for d, _ in near]
            grid[j][i] = sum(wi * e for wi, (_, e) in zip(w, near)) / sum(w)
    for _ in range(2):  # light smoothing: streets and yards are graded, not stepped
        g2 = [row[:] for row in grid]
        for j in range(nz):
            for i in range(nx):
                s = n = 0.0
                for dj in (-1, 0, 1):
                    for di in (-1, 0, 1):
                        jj, ii = j + dj, i + di
                        if 0 <= jj < nz and 0 <= ii < nx:
                            wgt = 2.0 if (dj == 0 and di == 0) else 1.0
                            s += grid[jj][ii] * wgt
                            n += wgt
                g2[j][i] = s / n
        grid = g2
    flat = [round(v, 2) for row in grid for v in row]
    with open(os.path.join(DATA, 'terrain.ts'), 'w', encoding='utf-8') as fh:
        fh.write(HEADER)
        fh.write('// Ground elevation grid interpolated from the ground level under every building of the block and its\n')
        fh.write('// surroundings (layer 513: surveyed roof top minus the roof height above ground in the surface model).\n')
        fh.write('// The block sits on the kurkar ridge: ~9 m above sea level at King George, ~16 m at Dizengoff / Chissin,\n')
        fh.write('// rising to ~28 m at the top of Chissin street next to Habima.\n')
        fh.write('// Values are metres relative to the scene origin (CHISSIN_CENTER), sampled every `cell` metres.\n')
        fh.write('export const TERRAIN = {\n')
        fh.write(f'  ref: {REF}, // absolute elevation (m above sea level) of y = 0\n')
        fh.write(f'  x0: {round(gx0, 2)}, // scene x of column 0\n')
        fh.write(f'  y0: {round(-gz1, 2)}, // northing (m) of row 0; scene z = -northing\n')
        fh.write(f'  cell: {cell},\n  nx: {nx},\n  nz: {nz},\n')
        fh.write('  // row-major, rows go from south to north\n')
        fh.write('  h: ' + js(flat) + ',\n};\n')
    print('terrain', nx, 'x', nz, 'range', min(flat), max(flat))

    def ground(x, z):
        fx = min(max((x - gx0) / cell, 0), nx - 1.001)
        fy = min(max((-z + gz1) / cell, 0), nz - 1.001)
        i, j = int(fx), int(fy)
        tx, ty = fx - i, fy - j
        return (grid[j][i] * (1 - tx) * (1 - ty) + grid[j][i + 1] * tx * (1 - ty)
                + grid[j + 1][i] * (1 - tx) * ty + grid[j + 1][i + 1] * tx * ty)

    # ---- 6. trees ----
    # Species groups: 0 mixed broadleaf, 1 ficus (dense boulevard canopy), 2 olive / grey-green garden tree,
    # 3 upright (brachychiton, bombax), 4 cypress, 5 palm
    def group(name):
        name = name or ''
        if 'פיקוס' in name:
            return 1
        if 'זית' in name or 'אקליפטוס' in name:
            return 2
        if 'ברכי' in name or 'ברכיטון' in name or 'בומב' in name:
            return 3
        if 'ברוש' in name:
            return 4
        if 'תמר' in name or 'דקל' in name or 'ושינגטוניה' in name or 'צייקס' in name:
            return 5
        return 0

    inv = [(*to_xz(f['geometry']['x'], f['geometry']['y']), group(f['attributes'].get('tree_name'))) for f in inventory if f.get('geometry')]
    garden_rings = [(g['t'], list(zip(g['p'][0::2], g['p'][1::2]))) for g in gs]

    def guess(x, z, r, seed):
        for t, ring in garden_rings:
            if inside((x * 10, z * 10), ring):
                return 1 if t == 'strip' else (2 if seed % 3 else 0)
        # private yards: mostly mixed broadleaf, some cypresses and the odd palm
        if r < 2.2 and seed % 9 == 0:
            return 4
        if seed % 23 == 0:
            return 5
        return 0 if seed % 4 else 2

    tsrc = open(os.path.join(DATA, 'gisTrees.ts'), encoding='utf-8').read()
    m = re.search(r'GIS_TREES: GisTree\[\] = (\[\[.*\]\]);', tsrc, re.S)
    old = json.loads(m.group(1))
    trees = []
    for k, t in enumerate(old):
        lat, lng, r, h, palm = t[0], t[1], t[2], t[3], t[4]
        x, z = to_xz(lng, lat)
        best = min(inv, key=lambda q: (q[0] - x) ** 2 + (q[1] - z) ** 2) if inv else None
        if palm:
            sp = 5
        elif best and math.hypot(best[0] - x, best[1] - z) < 3.5:
            sp = best[2]
        else:
            sp = guess(x, z, r, k * 7 + 3)
        trees.append([round(x, 1), round(z, 1), r, h, sp])
    n_old = len(trees)
    # Surroundings (and gaps): fill mapped canopies that have no tree yet
    cells = {}
    for t in trees:
        cells.setdefault((int(t[0] // 12), int(t[1] // 12)), []).append(t)

    def free(x, z, r):
        for cx in range(int((x - 12) // 12), int((x + 12) // 12) + 1):
            for cz in range(int((z - 12) // 12), int((z + 12) // 12) + 1):
                for t in cells.get((cx, cz), ()):
                    if math.hypot(t[0] - x, t[1] - z) < (t[2] + r) * 0.8:
                        return False
        return True

    def add(x, z, r, seed):
        if not (X0 <= x <= X1 and Z0 <= z <= Z1) or not free(x, z, r):
            return
        best = min(inv, key=lambda q: (q[0] - x) ** 2 + (q[1] - z) ** 2) if inv else None
        sp = best[2] if best and math.hypot(best[0] - x, best[1] - z) < max(3.5, r) else guess(x, z, r, seed)
        h = round(min(17.0, 4.2 + r * 1.65), 1)
        if sp == 5:
            h = round(9 + (seed % 5), 1)
        t = [round(x, 1), round(z, 1), round(r, 1), h, sp]
        trees.append(t)
        cells.setdefault((int(x // 12), int(z // 12)), []).append(t)

    seed = 11
    for f in canopies:
        for r in f['geometry'].get('rings', []):
            ring = [to_xz(*p) for p in r]
            area = abs(ring_area(ring))
            if area < 7:
                continue
            seed += 1
            if area < 70:
                c = centroid(ring)
                add(c[0], c[1], min(5.0, math.sqrt(area / math.pi)), seed)
                continue
            xs = [p[0] for p in ring]
            zs = [p[1] for p in ring]
            step = 7.5
            j = 0
            zz = min(zs) + step / 2
            while zz < max(zs):
                xx = min(xs) + step / 2 + (step / 2 if j % 2 else 0)
                while xx < max(xs):
                    if inside((xx, zz), ring):
                        seed += 1
                        add(xx + ((seed * 37) % 20 - 10) / 10, zz + ((seed * 53) % 20 - 10) / 10, 3.6 + (seed % 5) * 0.4, seed)
                    xx += step
                zz += step * 0.87
                j += 1
    with open(os.path.join(DATA, 'gisTrees.ts'), 'w', encoding='utf-8') as fh:
        fh.write(HEADER)
        fh.write('// Trees from layer 628 (municipal street-tree inventory, with species) at their surveyed positions, sized\n')
        fh.write('// from layer 574 (tree canopies mapped from 2024 aerial imagery). Canopies with no inventory tree (mostly\n')
        fh.write('// private yards) are filled with trees spaced inside the canopy outline.\n')
        fh.write('// Format: [x, z (scene metres), canopy radius (m), height (m), species group]\n')
        fh.write('// Species groups: 0 mixed broadleaf, 1 ficus, 2 olive / grey-green garden tree, 3 upright (brachychiton,\n')
        fh.write('// bombax), 4 cypress, 5 palm. Groups come from the inventory where a tree is listed, otherwise from the\n')
        fh.write('// place the canopy stands in (boulevard strip, public garden, private yard).\n')
        fh.write('export type GisTree = [number, number, number, number, number];\n')
        fh.write('export const GIS_TREES: GisTree[] = ' + js(trees) + ';\n')
    print('trees', len(trees), '(block:', n_old, ') by group', [sum(1 for t in trees if t[4] == g) for g in range(6)])


if __name__ == '__main__':
    main()
