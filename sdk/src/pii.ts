const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+91[\s\-]?)?(?:\(?[6-9]\d{9}\)?|\+?(?:[0-9][\s\-]?){7,14}[0-9])/g;
const CARD_RE = /\b(?:\d[ \-]?){13,19}\b/g;
const AADHAAR_RE = /\b[2-9]\d{3}[\s\-]?\d{4}[\s\-]?\d{4}\b/g;
const NAME_RE = /(my name is\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

export function redact(text: string): string {
  if (!text) return text;
  return text
    .replace(NAME_RE, (_, prefix) => prefix + "[NAME]")
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(AADHAAR_RE, "[ID]")
    .replace(CARD_RE, "[CARD]")
    .replace(PHONE_RE, "[PHONE]");
}

export function preview(text: string, length = 200): string {
  if (!text) return "";
  return redact(text.slice(0, length));
}
