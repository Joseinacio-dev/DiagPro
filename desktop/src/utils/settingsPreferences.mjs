export const UI_PREFERENCES_KEY = 'diagpro_ui_preferences_v1'
export const DEFAULT_UI_PREFERENCES = Object.freeze({ notifications: true })

export function loadUiPreferences(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(UI_PREFERENCES_KEY) || 'null')
    return { notifications: parsed?.notifications !== false }
  } catch {
    return { ...DEFAULT_UI_PREFERENCES }
  }
}

export function saveUiPreferences(storage, preferences) {
  const safe = { notifications: preferences?.notifications !== false }
  storage?.setItem(UI_PREFERENCES_KEY, JSON.stringify(safe))
  return safe
}
