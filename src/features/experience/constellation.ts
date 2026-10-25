/**
 * Thirty star positions tracing the numerals "3" and "0", in a 2D space roughly
 * x ∈ [-3, 3], y ∈ [-2, 2]. Star n (1–30) is POINTS[n - 1].
 */
function arc(cx: number, cy: number, r: number, from: number, to: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = ((from + ((to - from) * i) / (count - 1)) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })
}

function ellipse(cx: number, cy: number, rx: number, ry: number, count: number) {
  // Starts at the top and runs clockwise.
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI / 2 - (2 * Math.PI * i) / count
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const
  })
}

const three = [...arc(-1.55, 0.92, 0.9, 150, -90, 7), ...arc(-1.55, -0.92, 0.9, 60, -150, 7)]
const zero = ellipse(1.45, 0, 1.0, 1.82, 16)

export const POINTS: ReadonlyArray<readonly [number, number]> = [...three, ...zero]

/** The faint lines joining the stars: the two arcs of the "3" and the closed "0". */
export const STROKES = [POINTS.slice(0, 7), POINTS.slice(7, 14), [...POINTS.slice(14), POINTS[14]!]]
