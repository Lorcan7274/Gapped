/**
 * The in-run map's look: a quiet 3D city in the app's own paper and ink —
 * extruded buildings, faint streets, your route as the one strong line.
 *
 * Tiles are OpenFreeMap's (OpenStreetMap data in the OpenMapTiles schema):
 * free, no key, no quota; attribution is required, and the map shows it.
 */
export const TILES_URL = 'https://tiles.openfreemap.org/planet'
export const ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'

const PALETTE = {
  light: {
    ground: '#efeee9', water: '#dcdfe0', park: '#e6e7df', road: '#ffffff', roadCase: '#dedcd4',
    building: '#e9e8e3', route: '#101010', glow: '#ffffff', me: '#101010', ghost: '#a43f5e', halo: '#fafaf7',
  },
  dark: {
    ground: '#0e0e0d', water: '#16191b', park: '#131412', road: '#2a2926', roadCase: '#1b1a18',
    building: '#1f1e1c', route: '#f3f2ec', glow: '#cf5f82', me: '#f3f2ec', ghost: '#cf5f82', halo: '#121211',
  },
}

export const EMPTY = { type: 'FeatureCollection', features: [] }

const palette = (theme) => PALETTE[theme] ?? PALETTE.light

/**
 * The style the map starts with: only local data — your route and markers —
 * so it loads instantly and works with no signal at all. The city is added
 * on top afterwards (cityLayers), and a failed tile never blanks the run.
 */
export function mapStyle(theme) {
  const c = palette(theme)
  return {
    version: 8,
    light: { anchor: 'viewport', color: '#ffffff', intensity: theme === 'dark' ? 0.25 : 0.35 },
    sources: {
      route: { type: 'geojson', data: EMPTY },
      marks: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': c.ground } },
      {
        id: 'route-glow', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.glow, 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.7 },
      },
      {
        id: 'route', type: 'line', source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.route, 'line-width': 3.5 },
      },
      {
        id: 'ghost', type: 'circle', source: 'marks', filter: ['==', ['get', 'kind'], 'ghost'],
        paint: {
          'circle-radius': 10, 'circle-color': c.ghost, 'circle-opacity': 0.5,
          'circle-stroke-color': c.ghost, 'circle-stroke-width': 1.5, 'circle-pitch-alignment': 'map',
        },
      },
      {
        id: 'me', type: 'circle', source: 'marks', filter: ['==', ['get', 'kind'], 'me'],
        paint: {
          'circle-radius': 8, 'circle-color': c.me,
          'circle-stroke-color': c.halo, 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map',
        },
      },
    ],
  }
}

/** The city under the route: added after load, beneath 'route-glow'. */
export const CITY_SOURCE = { type: 'vector', url: TILES_URL, attribution: ATTRIBUTION }

export function cityLayers(theme) {
  const c = palette(theme)
  return [
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c.park } },
    {
      id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': c.water },
    },
    {
      id: 'road-case', type: 'line', source: 'omt', 'source-layer': 'transportation',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.roadCase, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 1.5, 18, 22] },
    },
    {
      id: 'road', type: 'line', source: 'omt', 'source-layer': 'transportation',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 13, 0.8, 18, 18] },
    },
    {
      id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-extrusion-color': c.building,
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ]
}

/** Recolour a live map for a theme switch, without rebuilding it. */
export function applyTheme(map, theme) {
  const c = palette(theme)
  const paint = {
    ground: { 'background-color': c.ground },
    park: { 'fill-color': c.park },
    water: { 'fill-color': c.water },
    'road-case': { 'line-color': c.roadCase },
    road: { 'line-color': c.road },
    buildings: { 'fill-extrusion-color': c.building },
    'route-glow': { 'line-color': c.glow },
    route: { 'line-color': c.route },
    ghost: { 'circle-color': c.ghost, 'circle-stroke-color': c.ghost },
    me: { 'circle-color': c.me, 'circle-stroke-color': c.halo },
  }
  for (const [id, props] of Object.entries(paint)) {
    if (!map.getLayer(id)) continue
    for (const [prop, value] of Object.entries(props)) map.setPaintProperty(id, prop, value)
  }
}
