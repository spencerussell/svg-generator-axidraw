export const UNIT_TO_MM = { mm: 1, cm: 10, in: 25.4 }

// [width_mm, height_mm]
export const DOC_PRESETS_MM = {
  'square':    [150,    150  ],
  'letter-p':  [215.9,  279.4],
  'letter-l':  [279.4,  215.9],
  'tabloid-p': [279.4,  431.8],
  'tabloid-l': [431.8,  279.4],
  'a4-p':      [210,    297  ],
  'a4-l':      [297,    210  ],
  'a3-p':      [297,    420  ],
  'a3-l':      [420,    297  ],
}

/** Format a mm value for display in the given unit */
export function mmToDisplay(mm, unit, decimals) {
  const dp = decimals ?? (unit === 'mm' ? 1 : 3)
  return (mm / UNIT_TO_MM[unit]).toFixed(dp)
}

/** Swap the orientation suffix of a preset key (letter-p <-> letter-l) */
export function swapPresetOrientation(preset) {
  if (preset.endsWith('-p')) return preset.slice(0, -2) + '-l'
  if (preset.endsWith('-l')) return preset.slice(0, -2) + '-p'
  return preset
}
