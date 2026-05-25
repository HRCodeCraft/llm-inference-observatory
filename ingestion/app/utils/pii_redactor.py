import re

_EMAIL_RE = re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b')
_PHONE_RE = re.compile(
    r'(?:\+91[\s\-]?)?(?:\(?[6-9]\d{9}\)?|'
    r'\+?(?:[0-9][\s\-]?){7,14}[0-9])'
)
_CARD_RE = re.compile(r'\b(?:\d[ \-]?){13,19}\b')
_AADHAAR_RE = re.compile(r'\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b')
_NAME_RE = re.compile(r'(?i)(my name is\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)')


def redact(text: str) -> str:
    if not text:
        return text
    text = _NAME_RE.sub(lambda m: m.group(1) + "[NAME]", text)
    text = _EMAIL_RE.sub("[EMAIL]", text)
    text = _AADHAAR_RE.sub("[ID]", text)
    text = _CARD_RE.sub("[CARD]", text)
    text = _PHONE_RE.sub("[PHONE]", text)
    return text


def preview(text: str, length: int = 200) -> str:
    if not text:
        return ""
    return redact(text[:length])
