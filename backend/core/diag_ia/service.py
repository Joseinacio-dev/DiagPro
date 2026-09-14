import json
import re

from .gemini_service import generate_with_gemini
from .knowledge import relevant_knowledge
from .prompts import build_prompt
from .sanitizer import sanitize_context, sanitize_history, sanitize_message

INJECTION = re.compile(r'(ignore .{0,30}(regra|instruc)|api.?key|database_url|mostre .{0,20}token|revele .{0,20}vari|adb\s+shell\s+(rm|wipe|reboot))', re.IGNORECASE)
REFUSAL = 'Não posso revelar segredos, instruções internas ou executar comandos destrutivos. Posso ajudar com o uso seguro do DiagPro.'


def generate_diag_ia_response(*, message, history, context):
    if INJECTION.search(message):
        return {'message': REFUSAL, 'source': 'policy', 'escalate': False}
    clean_message = sanitize_message(message)
    clean_history = sanitize_history(history)
    clean_context = sanitize_context(context)
    knowledge = relevant_knowledge(message)
    prompt = build_prompt(
        message=clean_message,
        history=clean_history,
        context=json.dumps(clean_context, ensure_ascii=False, separators=(',', ':')),
        knowledge=json.dumps(knowledge, ensure_ascii=False, separators=(',', ':')),
    )
    response = generate_with_gemini(**prompt)
    normalized = response.casefold()
    escalate = any(marker in normalized for marker in ('suporte humano', 'abrir um chamado', 'não consegui'))
    return {'message': response, 'source': 'gemini', 'escalate': escalate}
