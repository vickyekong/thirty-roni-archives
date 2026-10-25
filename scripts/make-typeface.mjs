// Builds the three.js typeface JSON used by the opening's 3D "30".
//
// Run once (no project dependency needed):
//   mkdir -p /tmp/typeface && cd /tmp/typeface && npm i opentype.js@1 @fontsource/cormorant-garamond@5
//   NODE_PATH=/tmp/typeface/node_modules node scripts/make-typeface.mjs \
//     /tmp/typeface/node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff \
//     src/features/experience/three/cormorant-digits.typeface.json
//
// Only the glyphs in CHARS are kept. Cormorant Garamond is licensed under the SIL OFL 1.1
// (see src/features/experience/three/OFL.txt).
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const opentype = require('opentype.js')

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/make-typeface.mjs <font.woff> <out.json>')
  process.exit(1)
}

const CHARS = '0123456789'
const font = opentype.loadSync(input)
const scale = 1000 / font.unitsPerEm
const r = (n) => Math.round(n * scale)

const glyphs = {}
for (const ch of CHARS) {
  const glyph = font.charToGlyph(ch)
  const parts = []
  for (const c of glyph.getPath(0, 0, font.unitsPerEm).commands) {
    // opentype paths are y-down at this size; typeface outlines are y-up.
    if (c.type === 'M') parts.push('m', r(c.x), r(-c.y))
    else if (c.type === 'L') parts.push('l', r(c.x), r(-c.y))
    else if (c.type === 'Q') parts.push('q', r(c.x), r(-c.y), r(c.x1), r(-c.y1))
    else if (c.type === 'C') parts.push('b', r(c.x), r(-c.y), r(c.x1), r(-c.y1), r(c.x2), r(-c.y2))
  }
  const box = glyph.getBoundingBox()
  glyphs[ch] = { ha: r(glyph.advanceWidth), x_min: r(box.x1), x_max: r(box.x2), o: parts.join(' ') }
}

const head = font.tables.head
const post = font.tables.post
const json = {
  glyphs,
  familyName: font.names.fontFamily?.en ?? 'Cormorant Garamond',
  ascender: r(font.ascender),
  descender: r(font.descender),
  underlinePosition: r(post.underlinePosition),
  underlineThickness: r(post.underlineThickness),
  boundingBox: { xMin: r(head.xMin), yMin: r(head.yMin), xMax: r(head.xMax), yMax: r(head.yMax) },
  resolution: 1000,
  cssFontWeight: 'normal',
  cssFontStyle: 'normal',
  original_font_information: { license: 'SIL Open Font License 1.1', copyright: font.names.copyright?.en ?? '' },
}

writeFileSync(output, JSON.stringify(json))
console.log(`wrote ${output} (${CHARS.length} glyphs)`)
