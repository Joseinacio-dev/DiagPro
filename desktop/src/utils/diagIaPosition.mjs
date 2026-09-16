export const DIAG_IA_BUBBLE_SIZE = 52
export const DIAG_IA_ICON_SIZE = 28
export const DIAG_IA_POSITION_KEY = 'diagpro_diag_ia_position_v2'
export const DIAG_IA_PANEL_WIDTH = 420
export const DIAG_IA_PANEL_HEIGHT = 600

export function clamp(value, minimum, maximum) {
  const numeric = Number(value)
  return Math.min(Math.max(Number.isFinite(numeric) ? numeric : minimum, minimum), Math.max(minimum, maximum))
}

export function positionBounds({ viewportWidth, viewportHeight, contentLeft = 200, footerHeight = 36, horizontalMargin = 24, verticalMargin = 16 }) {
  return {
    left: Math.min(contentLeft + horizontalMargin, Math.max(horizontalMargin, viewportWidth - DIAG_IA_BUBBLE_SIZE - horizontalMargin)),
    right: Math.max(horizontalMargin, viewportWidth - DIAG_IA_BUBBLE_SIZE - horizontalMargin),
    top: verticalMargin,
    bottom: Math.max(verticalMargin, viewportHeight - footerHeight - DIAG_IA_BUBBLE_SIZE - verticalMargin),
    viewportWidth,
    viewportHeight,
  }
}

export function defaultPosition(bounds) {
  return { edge: 'right', x: bounds.right, y: clamp(bounds.bottom - 34, bounds.top, bounds.bottom) }
}

export function constrainPosition(position, bounds) {
  const x = clamp(position?.x, bounds.left, bounds.right)
  const y = clamp(position?.y, bounds.top, bounds.bottom)
  const edge = Math.abs(x - bounds.left) <= Math.abs(x - bounds.right) ? 'left' : 'right'
  return { edge, x, y }
}

export function snapPosition(position, bounds, threshold = 22) {
  const constrained = constrainPosition(position, bounds)
  if (Math.abs(constrained.x - bounds.left) <= threshold) return { ...constrained, edge: 'left', x: bounds.left }
  if (Math.abs(constrained.x - bounds.right) <= threshold) return { ...constrained, edge: 'right', x: bounds.right }
  return constrained
}

export function panelPosition(position, bounds, { width = DIAG_IA_PANEL_WIDTH, height = DIAG_IA_PANEL_HEIGHT, gap = 12 } = {}) {
  const availableRight = bounds.viewportWidth - (position.x + DIAG_IA_BUBBLE_SIZE + gap)
  const availableLeft = position.x - gap
  const openRight = availableRight >= width || availableRight >= availableLeft
  const maxLeft = Math.max(12, bounds.viewportWidth - width - 12)
  const left = openRight ? clamp(position.x + DIAG_IA_BUBBLE_SIZE + gap, 12, maxLeft) : clamp(position.x - width - gap, 12, maxLeft)
  const maxTop = Math.max(12, bounds.viewportHeight - height - 48)
  return { side: openRight ? 'right' : 'left', left, top: clamp(position.y - 90, 12, maxTop) }
}

export function loadDiagIaPosition(storage, bounds) {
  try {
    const parsed = JSON.parse(storage?.getItem(DIAG_IA_POSITION_KEY) || 'null')
    if (!parsed || !Number.isFinite(parsed.xRatio) || !Number.isFinite(parsed.yRatio)) return defaultPosition(bounds)
    const width = Math.max(1, bounds.right - bounds.left)
    const height = Math.max(1, bounds.bottom - bounds.top)
    return constrainPosition({ x: bounds.left + clamp(parsed.xRatio, 0, 1) * width, y: bounds.top + clamp(parsed.yRatio, 0, 1) * height }, bounds)
  } catch {
    return defaultPosition(bounds)
  }
}

export function saveDiagIaPosition(storage, position, bounds) {
  if (!bounds) return
  const width = Math.max(1, bounds.right - bounds.left)
  const height = Math.max(1, bounds.bottom - bounds.top)
  const safe = constrainPosition(position, bounds)
  storage?.setItem(DIAG_IA_POSITION_KEY, JSON.stringify({
    xRatio: Number(((safe.x - bounds.left) / width).toFixed(4)),
    yRatio: Number(((safe.y - bounds.top) / height).toFixed(4)),
  }))
}
