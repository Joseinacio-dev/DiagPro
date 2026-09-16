const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf8')
}

test('Suporte aparece após Plano e assinatura na seção SISTEMA', () => {
  const layout = source('src/layouts/AppLayout.jsx')
  const settings = layout.indexOf("label: 'Configurações'")
  const subscription = layout.indexOf("label: 'Plano e assinatura'")
  const support = layout.indexOf("label: 'Suporte'")
  assert.ok(settings >= 0 && settings < subscription && subscription < support)
})

test('página Suporte contém blocos profissionais e não inventa canal humano', () => {
  const page = source('src/pages/SupportPage.jsx')
  for (const content of ['Central de ajuda e diagnóstico do DiagPro', 'Diag IA', 'Diagnóstico técnico', 'Ajuda rápida', 'Suporte humano', 'Em breve']) {
    assert.ok(page.includes(content), content)
  }
})

test('bolha reduzida possui tooltip, acessibilidade, abertura e fechamento', () => {
  const component = source('src/components/DiagIaAssistant.jsx')
  const css = source('src/components/DiagIaAssistant.css')
  assert.ok(component.includes('Diag IA — Suporte inteligente'))
  assert.ok(component.includes('onPointerMove'))
  assert.ok(component.includes('onOpenChange?.(!open)'))
  assert.ok(component.includes('Fechar Diag IA'))
  assert.match(css, /width:\s*52px;\s*height:\s*52px/)
  assert.equal(css.includes('Diag IA</'), false)
})

test('Diag IA possui pergunta livre, chamado seguro e controles de exportação', () => {
  const component = source('src/components/DiagIaAssistant.jsx')
  for (const content of ['Pergunte sobre o DiagPro', 'Abrir chamado', 'Prévia do chamado', 'Copiar resumo', 'Exportar JSON', 'suporte humano em breve']) assert.ok(component.includes(content), content)
})

test('Diag IA prioriza conversa, recolhe contexto técnico e oferece modo expandido', () => {
  const component = source('src/components/DiagIaAssistant.jsx')
  const css = source('src/components/DiagIaAssistant.css')
  assert.ok(component.includes('diag-ia-conversation'))
  assert.ok(component.includes('<details className="diag-ia-context">'))
  assert.ok(component.includes('Expandir Diag IA'))
  assert.ok(component.includes('Recolher Diag IA'))
  assert.ok(css.includes('.diag-ia-panel.expanded'))
})

test('Diag IA online informa consentimento, carregamento e preserva fallback', () => {
  const component = source('src/components/DiagIaAssistant.jsx')
  const service = source('src/services/diagIa.mjs')
  for (const content of ['Ativar IA online', 'Continuar localmente', 'Diag IA está analisando…']) {
    assert.ok(component.includes(content), content)
  }
  assert.ok(component.includes('diagpro_diag_ia_online_consent_v1'))
  assert.ok(service.includes('base local'))
})

test('configurações comuns não expõem termos técnicos sensíveis', () => {
  const settings = source('src/pages/SettingsPage.jsx')
  for (const forbidden of ['DJANGO_SECRET_KEY', 'DATABASE_URL', 'MERCADO_PAGO_ACCESS_TOKEN', 'rediss://', 'postgresql://']) {
    assert.equal(settings.includes(forbidden), false)
  }
  assert.ok(settings.includes("label: 'Administração'"))
})
