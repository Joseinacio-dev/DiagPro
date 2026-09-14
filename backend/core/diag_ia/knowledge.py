"""Base oficial e versionada do produto enviada seletivamente ao Gemini."""
KNOWLEDGE_VERSION = '2026.09.1'

TOPICS = {
    '01_PRODUTO': 'DiagPro é um desktop Windows para assistência técnica Android, ligado a um backend online para conta, licença e histórico.',
    '02_LOGIN': 'Login normal usa usuário/e-mail e senha. Nunca solicitar ou repetir senha.',
    '03_GOOGLE_OAUTH': 'Continuar com Google abre autorização externa e termina em uma sessão JWT do DiagPro.',
    '04_CONTA': 'A conta autenticada delimita seus próprios registros e permissões.',
    '05_PLANOS': 'Plano é a oferta de recursos. Consultar em Sistema > Plano e assinatura.',
    '06_LICENCAS': 'Licença autoriza uso e pode ter estado/limites. Nunca inventar estado ou validade.',
    '07_ASSINATURA': 'Assinatura vincula plano e licença à conta; ausência de plano deve ser confirmada na tela.',
    '08_ADB': 'Estados: AUTHORIZED pronto; DISCONNECTED reconectar; UNAUTHORIZED autorizar; OFFLINE reconectar; MULTIPLE selecionar; ADB_UNAVAILABLE indisponível; ERROR falha.',
    '09_CONEXAO_ANDROID': 'Usar cabo de dados, opções do desenvolvedor, Depuração USB, aparelho desbloqueado e autorização RSA.',
    '10_DISPOSITIVOS': 'Principal > Dispositivos mostra conexão atual e histórico; histórico não prova conexão atual.',
    '11_SCANNER_RAPIDO': 'Rápido coleta módulos essenciais indicados na tela; não executa todos os módulos.',
    '12_SCANNER_COMPLETO': 'Completo solicita Identificação, Sistema, Aplicativos, Permissões, Arquivos, Segurança, Persistência, Bateria, Armazenamento, Desempenho e Consolidação.',
    '13_SCANNER_PERSONALIZADO': 'Personalizado executa somente os módulos escolhidos.',
    '14_APLICATIVOS': 'Apps reais são separados entre usuário e sistema, com packageName real.',
    '15_PERMISSOES': 'Permissões são sinais técnicos; isoladamente não confirmam malware.',
    '16_ARQUIVOS': 'Somente metadados acessíveis são analisados. Não há leitura de conteúdo privado.',
    '17_SEGURANCA': 'Nunca afirmar segurança absoluta. Preferir: nenhuma ameaça foi confirmada nos sinais acessíveis analisados.',
    '18_FINDINGS': 'Finding é achado técnico para revisão, não confirmação automática de vírus.',
    '19_COBERTURA': 'Cobertura mede alcance real. Concluído, parcial, indisponível, falhou e cancelado têm significados distintos.',
    '20_BATERIA': 'Bateria usa leituras disponíveis no Android e não faz recalibração física.',
    '21_ARMAZENAMENTO': 'Total, usado e livre vêm de fontes do Android; diferem da RAM e da capacidade comercial.',
    '22_DESEMPENHO': 'Sinais de RAM/desempenho não provam isoladamente defeito ou lentidão.',
    '23_LIMPEZA': 'Limpeza Profunda é inspeção/preview quando assim indicada; não prometer exclusão real.',
    '24_OTIMIZACAO': 'Otimização apresenta inspeções/orientações; não prometer ganho ou alteração não confirmada.',
    '25_GERENCIAR_APPS': 'Somente app do usuário pode ser removido, com preview e confirmação; app de sistema é protegido.',
    '26_BACKUP': 'Backup só ocorreu se a tela confirmar execução e destino; disponibilidade depende da versão/permissões.',
    '27_RELATORIOS': 'Gestão > Relatórios mostra diagnósticos persistidos e detalhes.',
    '28_HISTORICO': 'Resultado local não deve ser invalidado por falha ao salvar o histórico online.',
    '29_CONFIGURACOES': 'Sistema > Configurações contém preferências, notificações, inicialização e versão.',
    '30_SUPORTE': 'Sistema > Suporte oferece ajuda e diagnóstico técnico sanitizado.',
    '31_DIAG_IA': 'Assistente orientativo; não executa ações destrutivas nem acessa conteúdo privado.',
    '32_INSTALACAO_WINDOWS': 'Desktop é instalado no Windows da assistência; ADB local e backend online têm responsabilidades separadas.',
    '33_ERROS_COMUNS': '401 sessão/credencial; 403 permissão; 429 limite; 500 interno; 503 indisponibilidade temporária.',
    '34_LIMITACOES_ATUAIS': 'Android moderno limita acesso por scoped storage, SELinux e áreas privadas.',
    '35_PERFIL_ADMIN': 'Admin vê opções técnicas adicionais, nunca segredos, tokens ou comandos inseguros.',
    '36_PERFIL_ASSISTENCIA': 'Perfil comum vê operações necessárias, licença, suporte e ajuda.',
}

GROUPS = {
    'plan': ('05_', '06_', '07_', '33_'), 'adb': ('08_', '09_', '10_', '33_', '34_'),
    'scan': ('11_', '12_', '13_', '15_', '16_', '17_', '18_', '19_', '34_'),
    'apps': ('14_', '15_', '17_', '25_'), 'actions': ('20_', '21_', '22_', '23_', '24_', '25_', '26_'),
    'account': ('02_', '03_', '04_', '33_'), 'support': ('29_', '30_', '31_', '33_', '35_', '36_'),
    'reports': ('27_', '28_'), 'install': ('01_', '32_', '33_'),
}


def relevant_knowledge(message):
    text = message.casefold()
    matches = []
    routing = {
        'plan': ('plano', 'licen', 'assinatura'), 'adb': ('adb', 'conect', 'offline', 'celular', 'usb'),
        'scan': ('scan', 'finding', 'cobertura', 'amea', 'virus', 'parcial'),
        'apps': ('app', 'aplicativo', 'remov'), 'actions': ('bateria', 'armazen', 'ram', 'limpeza', 'otimiz', 'backup'),
        'account': ('login', 'google', 'conta', 'sessao'), 'support': ('suporte', 'chamado', 'configur'),
        'reports': ('relatorio', 'historico'), 'install': ('instal', 'windows', 'diagpro'),
    }
    for group, terms in routing.items():
        if any(term in text for term in terms):
            matches.extend(GROUPS[group])
    prefixes = tuple(dict.fromkeys(matches)) or ('01_', '31_', '33_', '34_')
    return {key: value for key, value in TOPICS.items() if key.startswith(prefixes)}
