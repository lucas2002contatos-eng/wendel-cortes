"""Emergent-managed transactional e-mail (Resend proxy). Templates are server-side only."""
import os
import re
import ipaddress
import logging
import httpx
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant by design
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "WENDEL CORTES")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Unsafe URL host: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


def email_enabled() -> bool:
    return bool(EMAIL_KEY)


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    """Send through the managed proxy. Returns provider id or None (never raises to callers)."""
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:  # log only; the reset code is still available to the admin as fallback
        logger.error(f"Email send failed: {e}")
        return None


def password_reset_html(name: str, code: str, minutes: int = 30) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" style="background:#0a0a0a;padding:24px 0"><tr><td align="center">'
        '<table role="presentation" width="100%" style="max-width:520px;background:#141414;border:1px solid #2a2a2a;border-radius:12px">'
        '<tr><td style="padding:28px;font-family:Arial,sans-serif;color:#f2f2f2">'
        f'<p style="margin:0 0 8px;font-size:12px;letter-spacing:3px;color:#d4af37">{brand}</p>'
        f'<h2 style="margin:0 0 16px;font-size:20px">Redefinição de senha</h2>'
        f'<p style="margin:0 0 16px;color:#cfcfcf">Olá {escape(name)}, use o código abaixo no site para criar uma nova senha. '
        f'Ele vale por {minutes} minutos e só pode ser usado uma vez.</p>'
        f'<p style="margin:0 0 20px;font-size:34px;font-weight:bold;letter-spacing:10px;color:#d4af37">{escape(code)}</p>'
        '<p style="margin:0 0 8px;color:#9a9a9a;font-size:13px">Se você não pediu esta redefinição, ignore este e-mail — sua senha continua a mesma.</p>'
        f'<p style="margin:16px 0 0;font-size:12px;color:#777">Enviado por {brand}. Nunca pedimos sua senha ou dados de cartão por e-mail.</p>'
        '</td></tr></table></td></tr></table>'
    )
