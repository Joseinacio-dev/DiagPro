"""Allowlist de dados técnicos que podem chegar ao provedor de IA."""
import re

PROHIBITED_KEY = re.compile(
    r'password|senha|token|secret|authorization|cookie|database|redis|api_key|client_secret|serial|path|content',
    re.IGNORECASE,
)
SENSITIVE_VALUE = re.compile(
    r'(?i)\b(password|senha|token|secret|segredo|api[_ -]?key|authorization|cookie|database_url|redis_url)\b'
    r'\s*(?:é|=|:)\s*\S+|\b(?:postgres(?:ql)?|redis|rediss)://\S+',
)
TEXT_FIELDS = {
    'manufacturer': 80, 'model': 100, 'androidVersion': 30, 'adbState': 40,
    'scanMode': 30, 'scanStatus': 40, 'coverageStatus': 40, 'apiStatus': 30,
    'licenseStatus': 40, 'diagproVersion': 40,
}
INTEGER_FIELDS = {'findingsCount': 100000, 'riskScore': 100, 'appsFound': 100000, 'filesAnalyzed': 100000}
STATUS_VALUES = {'completed', 'partial', 'unavailable', 'failed', 'canceled', 'not_applicable', 'not_supported'}


def _safe_text(value, limit):
    if not isinstance(value, str):
        return None
    normalized = re.sub(r'[\r\n\t]+', ' ', value)
    return SENSITIVE_VALUE.sub('[REMOVIDO]', normalized).strip()[:limit] or None


def sanitize_message(value):
    return _safe_text(value, 1000) or ''


def sanitize_context(value):
    if not isinstance(value, dict):
        return {}
    clean = {'deviceConnected': value.get('deviceConnected') is True}
    for key, limit in TEXT_FIELDS.items():
        text = _safe_text(value.get(key), limit)
        if text is not None:
            clean[key] = text
    for key, maximum in INTEGER_FIELDS.items():
        number = value.get(key)
        if isinstance(number, int) and not isinstance(number, bool):
            clean[key] = max(0, min(maximum, number))
    statuses = value.get('moduleStatuses')
    if isinstance(statuses, dict):
        clean['moduleStatuses'] = {
            _safe_text(name, 50): status
            for name, status in list(statuses.items())[:30]
            if not PROHIBITED_KEY.search(str(name)) and _safe_text(name, 50) and status in STATUS_VALUES
        }
    limitations = value.get('limitations')
    if isinstance(limitations, list):
        clean['limitations'] = [text for item in limitations[:15] if (text := _safe_text(item, 180))]
    return clean


def sanitize_history(value, limit=8):
    if not isinstance(value, list):
        return []
    result = []
    for item in value[-limit:]:
        if not isinstance(item, dict) or item.get('role') not in {'user', 'assistant'}:
            continue
        content = _safe_text(item.get('content'), 1200)
        if content:
            result.append({'role': item['role'], 'content': content})
    return result
