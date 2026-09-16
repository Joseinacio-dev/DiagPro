import assert from 'node:assert/strict'
import test from 'node:test'
import { DIAG_IA_BUBBLE_SIZE, DIAG_IA_ICON_SIZE, DIAG_IA_POSITION_KEY, defaultPosition, loadDiagIaPosition, panelPosition, positionBounds, saveDiagIaPosition, snapPosition } from './diagIaPosition.mjs'

test('posição padrão atual é preservada no canto inferior direito acima do rodapé', () => {
  const bounds = positionBounds({ viewportWidth: 1280, viewportHeight: 800, contentLeft: 200, footerHeight: 36 })
  const position = defaultPosition(bounds)
  assert.equal(DIAG_IA_BUBBLE_SIZE, 52)
  assert.equal(DIAG_IA_ICON_SIZE, 28)
  assert.equal(position.x, bounds.right)
  assert.equal(position.y, bounds.bottom - 34)
})

test('bolha permanece livre no centro e usa snap suave perto das bordas', () => {
  const bounds = positionBounds({ viewportWidth: 1366, viewportHeight: 768 })
  assert.equal(snapPosition({ x: 700, y: 300 }, bounds).x, 700)
  assert.equal(snapPosition({ x: bounds.left + 8, y: 300 }, bounds).x, bounds.left)
  assert.equal(snapPosition({ x: bounds.right - 8, y: 300 }, bounds).x, bounds.right)
})

test('posição proporcional é persistida e restaurada após redimensionamento', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  const original = positionBounds({ viewportWidth: 1280, viewportHeight: 800 })
  saveDiagIaPosition(storage, { x: 700, y: 400 }, original)
  assert.equal(values.has(DIAG_IA_POSITION_KEY), true)
  const smaller = positionBounds({ viewportWidth: 900, viewportHeight: 600 })
  const restored = loadDiagIaPosition(storage, smaller)
  assert.ok(restored.x >= smaller.left && restored.x <= smaller.right)
  assert.ok(restored.y >= smaller.top && restored.y <= smaller.bottom)
})

test('painel escolhe o lado útil e nunca fica cortado', () => {
  const bounds = positionBounds({ viewportWidth: 1280, viewportHeight: 800 })
  const rightBubble = panelPosition({ x: bounds.right, y: bounds.bottom }, bounds)
  const leftBubble = panelPosition({ x: bounds.left, y: bounds.top }, bounds)
  assert.equal(rightBubble.side, 'left')
  assert.equal(leftBubble.side, 'right')
  for (const panel of [rightBubble, leftBubble]) {
    assert.ok(panel.left >= 12 && panel.left + 420 <= bounds.viewportWidth)
    assert.ok(panel.top >= 12 && panel.top + 600 <= bounds.viewportHeight - 36)
  }
})
