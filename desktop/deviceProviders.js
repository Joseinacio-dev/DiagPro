function createAndroidBatteryProvider({ collect }) {
  if (typeof collect !== 'function') throw new TypeError('AndroidBatteryProvider requer coletor ADB.')
  return {
    platform: 'android', status: 'available',
    inspect: () => collect('Bateria atual', ['dumpsys', 'battery']),
  }
}

function createIOSBatteryProvider() {
  return {
    platform: 'ios', status: 'not_implemented',
    inspect: async () => ({
      label: 'Bateria do iPhone', status: 'unavailable', fields: [],
      reason: 'Suporte a iPhone ainda não implementado. Nenhum dado foi coletado.',
    }),
  }
}

module.exports = { createAndroidBatteryProvider, createIOSBatteryProvider }
