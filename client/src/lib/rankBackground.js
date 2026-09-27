/**
 * The Home screen sits on a live background that belongs to your rank. Each
 * tier gets its own generator (a WebGL custom element, or plain CSS layers
 * for Bronze) and its own dark and light palette; the theme switch retints
 * the same field rather than swapping it, so the change eases over instead
 * of cutting.
 *
 * `load` pulls the shader in only when a runner of that tier opens Home —
 * each one is a self-contained module that registers its element on import.
 * `blur` and `inset` soften the field enough that type stays readable on
 * top: the element bleeds past the edges so the blur never shows a rim.
 */
export const RANK_BACKGROUNDS = {
  bronze: {
    element: null,
    dark: { bg: '#16100a', scrim: '22,16,10', veil: [0.6, 0.1, 0.18, 0.7, 0.8], glow: 'rgba(212,132,74,0.5)', grid: 'rgba(255,180,74,0.09)' },
    light: { bg: '#faf6f1', scrim: '250,246,241', veil: [0.66, 0.12, 0.18, 0.72, 0.82], glow: 'rgba(232,178,120,0.55)', grid: 'rgba(178,114,74,0.13)' },
  },
  silver: {
    element: 'halftone-dots',
    load: () => import('./shaders/halftone-dots.js'),
    speed: 2, res: 0.6, inset: -12, blur: 3,
    dark: { colors: '#111111,#525252,#D4D4D4,#FAFAFA', grain: 0.04, bg: '#111111', scrim: '17,17,17', veil: [0.66, 0.14, 0.2, 0.72, 0.8] },
    light: { colors: '#FAFAFB,#DFE3E7,#A6B0B9,#67737E', grain: 0.03, bg: '#fafafa', scrim: '250,250,250', veil: [0.68, 0.12, 0.18, 0.74, 0.84] },
  },
  gold: {
    element: 'neuro-noise',
    load: () => import('./shaders/neuro-noise.js'),
    speed: 1.5, res: 0.6, inset: -32, blur: 9,
    dark: { colors: '#07030D,#FFDA79,#D62976,#2A0A48', grain: 0.03, bg: '#07030d', scrim: '7,3,13', veil: [0.66, 0.16, 0.22, 0.72, 0.8] },
    light: { colors: '#FCFAF3,#F6E9C4,#EAD088,#C89B3C', grain: 0.02, bg: '#fcf9f0', scrim: '252,250,243', veil: [0.68, 0.12, 0.18, 0.74, 0.84] },
  },
  sapphire: {
    element: 'mesh-drift',
    load: () => import('./shaders/mesh-drift.js'),
    speed: 1.5, res: 0.5, inset: -48, blur: 20,
    dark: { colors: '#000000,#1F51FF,#00E5FF,#EAFDFF', grain: 0.04, bg: '#02010a', scrim: '2,1,10', veil: [0.66, 0.14, 0.2, 0.72, 0.8] },
    light: { colors: '#F8FCFE,#E4F2FB,#BFE3F6,#8CC8EC', grain: 0.03, bg: '#f6f0f1', scrim: '251,248,246', veil: [0.72, 0.2, 0.28, 0.78, 0.86] },
  },
  amethyst: {
    element: 'fluted-glass',
    load: () => import('./shaders/fluted-glass.js'),
    speed: 1.5, res: 0.5, inset: -48, blur: 20,
    dark: { colors: '#070310,#1F0F3D,#5B2FA8,#A97BE8', grain: 0.09, bg: '#070310', scrim: '7,3,16', veil: [0.66, 0.14, 0.2, 0.72, 0.8] },
    light: { colors: '#FAF9FB,#F1EFF9,#DFD8F2,#C3B2E8', grain: 0.05, bg: '#f2f0f6', scrim: '250,250,247', veil: [0.72, 0.2, 0.28, 0.78, 0.86] },
  },
  diamond: {
    element: 'water-caustics',
    load: () => import('./shaders/water-caustics.js'),
    speed: 1, res: 0.6, inset: -48, blur: 16,
    dark: { colors: '#101820,#536878,#B8E1FF,#FFFFFF', grain: 0.04, bg: '#101820', scrim: '16,24,32', veil: [0.66, 0.14, 0.2, 0.72, 0.8] },
    light: { colors: '#FBFDFF,#E3F1FC,#B8E1FF,#536878', grain: 0.03, bg: '#f3f8fc', scrim: '247,251,253', veil: [0.72, 0.2, 0.28, 0.78, 0.86] },
  },
}

export const rankBackground = (tierKey) =>
  RANK_BACKGROUNDS[tierKey] ?? RANK_BACKGROUNDS.bronze

/**
 * The veil over the field: heavy at the top (header) and bottom (Duel
 * button, tab bar), thin through the middle where the crystal floats.
 */
export function scrimGradient({ scrim, veil }) {
  const [top, upper, mid, low, bottom] = veil
  return `linear-gradient(180deg, rgba(${scrim},${top}) 0%, rgba(${scrim},${upper}) 30%, rgba(${scrim},${mid}) 58%, rgba(${scrim},${low}) 88%, rgba(${scrim},${bottom}) 100%)`
}
