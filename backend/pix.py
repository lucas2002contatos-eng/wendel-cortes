"""PIX BR Code (EMV® QRCPS-MPM) static payload generator — valid 'Copia e Cola' / QR content."""
import re
import unicodedata


def _tlv(tag: str, value: str) -> str:
    return f"{tag}{len(value):02d}{value}"


def _ascii(s: str, max_len: int) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9 .\-]", "", s).strip()
    return (s or "WENDEL CORTES")[:max_len]


def crc16_ccitt(data: str) -> str:
    crc = 0xFFFF
    for ch in data.encode("utf-8"):
        crc ^= ch << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def build_pix_payload(key: str, amount: float, merchant_name: str, city: str = "SAO PAULO", txid: str = "***", description: str = "") -> str:
    """Build a static PIX payload. `key` may be CPF/CNPJ/phone/e-mail/random key (already normalized)."""
    gui = _tlv("00", "br.gov.bcb.pix") + _tlv("01", key[:77])
    if description:
        gui += _tlv("02", _ascii(description, 40))
    payload = (
        _tlv("00", "01")
        + _tlv("26", gui)
        + _tlv("52", "0000")
        + _tlv("53", "986")
        + (_tlv("54", f"{amount:.2f}") if amount and amount > 0 else "")
        + _tlv("58", "BR")
        + _tlv("59", _ascii(merchant_name, 25))
        + _tlv("60", _ascii(city, 15).upper())
        + _tlv("62", _tlv("05", re.sub(r"[^A-Za-z0-9]", "", txid)[:25] or "***"))
        + "6304"
    )
    return payload + crc16_ccitt(payload)


def normalize_pix_key(key: str, key_type: str) -> str:
    key = (key or "").strip()
    if key_type in ("cpf", "cnpj"):
        return re.sub(r"\D", "", key)
    if key_type == "telefone":
        digits = re.sub(r"\D", "", key)
        if not digits.startswith("55"):
            digits = "55" + digits
        return "+" + digits
    return key
