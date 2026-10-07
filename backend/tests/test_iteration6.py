"""Iteration 6 backend tests: image upload, password recovery via email, PIX auto-confirm webhook."""
import base64
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://cortes-agendamentos.preview.emergentagent.com").rstrip("/") + "/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


# Tiny valid 1x1 PNG (89 bytes)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@wendelcortes.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def carlos_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "carlos@test.com", "password": "cliente123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ========================================================= IMAGES ===========
class TestImageUpload:
    def test_admin_upload_png_returns_url(self, admin_token):
        r = requests.post(f"{BASE}/admin/images", headers=H(admin_token),
                          json={"data_base64": TINY_PNG_B64, "content_type": "image/png"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and "url" in body
        assert body["url"].startswith("/api/public/images/")
        # GET it back
        img_url = BASE.replace("/api", "") + body["url"]
        g = requests.get(img_url)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("image/png")
        # keep for next tests
        TestImageUpload.last_url = body["url"]

    def test_client_upload_forbidden(self, carlos_token):
        r = requests.post(f"{BASE}/admin/images", headers=H(carlos_token),
                          json={"data_base64": TINY_PNG_B64, "content_type": "image/png"})
        assert r.status_code == 403, r.text

    def test_invalid_base64_returns_400(self, admin_token):
        r = requests.post(f"{BASE}/admin/images", headers=H(admin_token),
                          json={"data_base64": "@@@not-base64@@@", "content_type": "image/png"})
        assert r.status_code == 400

    def test_barber_photo_persists_and_shows_to_client(self, admin_token, carlos_token):
        # Upload image
        up = requests.post(f"{BASE}/admin/images", headers=H(admin_token),
                           json={"data_base64": TINY_PNG_B64, "content_type": "image/png"}).json()
        url = up["url"]
        barbers = requests.get(f"{BASE}/barbers", headers=H(admin_token)).json()
        wendel = next(b for b in barbers if "Wendel" in b["name"])
        prev = wendel.get("photo_url", "")
        r = requests.put(f"{BASE}/barbers/{wendel['id']}", headers=H(admin_token),
                         json={"name": wendel["name"], "phone": wendel.get("phone", ""), "photo_url": url,
                               "pix_key": wendel.get("pix_key", ""), "pix_key_type": wendel.get("pix_key_type", "aleatoria"),
                               "pix_holder_name": wendel.get("pix_holder_name", "")})
        assert r.status_code == 200, r.text
        # Client should see photo_url in GET /barbers
        cb = requests.get(f"{BASE}/barbers", headers=H(carlos_token)).json()
        wc = next(b for b in cb if b["id"] == wendel["id"])
        assert wc.get("photo_url") == url
        # restore
        requests.put(f"{BASE}/barbers/{wendel['id']}", headers=H(admin_token),
                     json={"name": wendel["name"], "phone": wendel.get("phone", ""), "photo_url": prev,
                           "pix_key": wendel.get("pix_key", ""), "pix_key_type": wendel.get("pix_key_type", "aleatoria"),
                           "pix_holder_name": wendel.get("pix_holder_name", "")})

    def test_service_image_persists_and_public_info(self, admin_token):
        up = requests.post(f"{BASE}/admin/images", headers=H(admin_token),
                           json={"data_base64": TINY_PNG_B64, "content_type": "image/png"}).json()
        url = up["url"]
        svcs = requests.get(f"{BASE}/services", headers=H(admin_token)).json()
        corte = next(s for s in svcs if s["name"] == "Corte")
        prev = corte.get("image_url", "")
        r = requests.put(f"{BASE}/services/{corte['id']}", headers=H(admin_token),
                         json={"name": corte["name"], "duration_min": corte["duration_min"], "price": corte["price"],
                               "icon": corte.get("icon", "cut"), "image_url": url, "active": corte.get("active", True)})
        assert r.status_code == 200, r.text
        info = requests.get(f"{BASE}/public/info").json()
        info_corte = next(s for s in info["services"] if s["id"] == corte["id"])
        assert info_corte.get("image_url") == url
        # restore
        requests.put(f"{BASE}/services/{corte['id']}", headers=H(admin_token),
                     json={"name": corte["name"], "duration_min": corte["duration_min"], "price": corte["price"],
                           "icon": corte.get("icon", "cut"), "image_url": prev, "active": corte.get("active", True)})


# ================================================= PASSWORD RECOVERY ========
class TestPasswordRecoveryEmail:
    def test_forgot_accepted_and_record_has_email_sent_flag(self, admin_token):
        # Use carlos (seed user) — real email domain is @test.com; email_sent may be False (expected)
        r = requests.post(f"{BASE}/auth/forgot", json={"email": "carlos@test.com"})
        assert r.status_code == 200
        assert "código" in r.json().get("message", "").lower() or "codigo" in r.json().get("message", "").lower()
        resets = requests.get(f"{BASE}/admin/password-resets", headers=H(admin_token)).json()
        rec = next((x for x in resets if x["email"] == "carlos@test.com"), None)
        assert rec is not None
        assert "email_sent" in rec
        assert isinstance(rec["email_sent"], bool)
        assert "code" in rec and len(rec["code"]) == 6
        TestPasswordRecoveryEmail.code = rec["code"]

    def test_reset_with_code_works_then_restores(self, admin_token):
        code = TestPasswordRecoveryEmail.code
        new_pw = "cliente123NEW"
        r = requests.post(f"{BASE}/auth/reset", json={"email": "carlos@test.com", "code": code, "new_password": new_pw})
        assert r.status_code == 200, r.text
        # login with new
        lr = requests.post(f"{BASE}/auth/login", json={"email": "carlos@test.com", "password": new_pw})
        assert lr.status_code == 200
        # restore to cliente123 via new forgot/reset
        requests.post(f"{BASE}/auth/forgot", json={"email": "carlos@test.com"})
        resets = requests.get(f"{BASE}/admin/password-resets", headers=H(admin_token)).json()
        rec = next(x for x in resets if x["email"] == "carlos@test.com")
        rr = requests.post(f"{BASE}/auth/reset",
                           json={"email": "carlos@test.com", "code": rec["code"], "new_password": "cliente123"})
        assert rr.status_code == 200
        lr2 = requests.post(f"{BASE}/auth/login", json={"email": "carlos@test.com", "password": "cliente123"})
        assert lr2.status_code == 200


# =================================================== PIX AUTO-CONFIRM =======
class TestPixWebhook:
    def test_set_provider_returns_secret_and_path(self, admin_token):
        r = requests.put(f"{BASE}/admin/pix-provider", headers=H(admin_token),
                         json={"provider": "mercadopago", "access_token": "TEST_TOKEN_123", "auto_confirm": True})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["provider"] == "mercadopago"
        assert body.get("webhook_secret")
        assert body["webhook_path"].startswith("/api/webhooks/pix/mercadopago?secret=")
        assert body["access_token"] == "***"
        TestPixWebhook.secret = body["webhook_secret"]
        # GET returns same
        g = requests.get(f"{BASE}/admin/pix-provider", headers=H(admin_token)).json()
        assert g["webhook_secret"] == body["webhook_secret"]
        assert g["access_token"] == "***"

    def _book_pix_appointment(self, token):
        d = date.today()
        # future Tuesday Wendel
        while d.weekday() != 1 or d <= date.today():
            d += timedelta(days=1)
        d += timedelta(days=14)  # push far out to reduce collisions
        barbers = requests.get(f"{BASE}/barbers", headers=H(token)).json()
        wendel = next(b for b in barbers if "Wendel" in b["name"])
        svcs = requests.get(f"{BASE}/services", headers=H(token)).json()
        corte = next(s for s in svcs if s["name"] == "Corte")
        slots = requests.get(
            f"{BASE}/agenda/available/{d.isoformat()}?service_id={corte['id']}&barber_id={wendel['id']}",
            headers=H(token)
        ).json().get("slots", [])
        assert slots, "No slots available"
        for slot in slots[::-1]:  # try from last
            time_val = slot["time"] if isinstance(slot, dict) else slot
            payload = {"service_id": corte["id"], "date": d.isoformat(), "time": time_val,
                       "barber_id": wendel["id"], "payment_method": "pix"}
            r = requests.post(f"{BASE}/appointments", json=payload, headers=H(token))
            if r.status_code == 200:
                return r.json()
        raise AssertionError(f"Could not book pix appointment: {r.text}")

    def test_webhook_marks_paid(self, admin_token, carlos_token):
        apt = self._book_pix_appointment(carlos_token)
        assert apt["payment_method"] == "pix"
        assert apt["payment_status"] == "aguardando_pagamento"
        txid = apt["id"].replace("-", "")[:25]
        secret = TestPixWebhook.secret
        # wrong secret → 401
        bad = requests.post(f"{BASE}/webhooks/pix/mercadopago?secret=WRONG",
                            json={"data": {"external_reference": txid, "status": "approved"}})
        assert bad.status_code == 401
        # correct → 200 paid
        ok = requests.post(f"{BASE}/webhooks/pix/mercadopago?secret={secret}",
                           json={"data": {"external_reference": txid, "status": "approved"}})
        assert ok.status_code == 200, ok.text
        body = ok.json()
        assert body["payment_status"] == "pago"
        # client polling
        ps = requests.get(f"{BASE}/appointments/{apt['id']}/payment-status", headers=H(carlos_token))
        assert ps.status_code == 200
        assert ps.json()["payment_status"] == "pago"
        # audit log contains payment.webhook.paid
        audit = requests.get(f"{BASE}/admin/audit?entity=appointment", headers=H(admin_token)).json()
        assert any(a.get("action") == "payment.webhook.paid" and a.get("entity_id") == apt["id"] for a in audit), \
            "Expected payment.webhook.paid audit entry"
        TestPixWebhook.second_apt = None  # placeholder

    def test_pending_status_ignored(self, admin_token, carlos_token):
        apt = self._book_pix_appointment(carlos_token)
        txid = apt["id"].replace("-", "")[:25]
        secret = TestPixWebhook.secret
        r = requests.post(f"{BASE}/webhooks/pix/mercadopago?secret={secret}",
                          json={"data": {"external_reference": txid, "status": "pending"}})
        assert r.status_code == 200
        assert "ignored" in r.json()
        # payment_status unchanged
        ps = requests.get(f"{BASE}/appointments/{apt['id']}/payment-status", headers=H(carlos_token)).json()
        assert ps["payment_status"] == "aguardando_pagamento"

    def test_unknown_txid_404(self, admin_token):
        secret = TestPixWebhook.secret
        r = requests.post(f"{BASE}/webhooks/pix/mercadopago?secret={secret}",
                          json={"data": {"external_reference": "nonexistent1234567890xyz", "status": "approved"}})
        assert r.status_code == 404

    def test_auto_confirm_disabled_returns_ignored(self, admin_token, carlos_token):
        # disable
        r = requests.put(f"{BASE}/admin/pix-provider", headers=H(admin_token),
                        json={"provider": "mercadopago", "access_token": "***", "auto_confirm": False})
        assert r.status_code == 200
        secret = r.json()["webhook_secret"]
        apt = self._book_pix_appointment(carlos_token)
        txid = apt["id"].replace("-", "")[:25]
        wh = requests.post(f"{BASE}/webhooks/pix/mercadopago?secret={secret}",
                           json={"data": {"external_reference": txid, "status": "approved"}})
        assert wh.status_code == 200
        assert "ignored" in wh.json()
        # restore auto_confirm True (keep mercadopago, empty token per spec)
        requests.put(f"{BASE}/admin/pix-provider", headers=H(admin_token),
                     json={"provider": "mercadopago", "access_token": "", "auto_confirm": True})

    def test_payment_status_client_scoping(self, admin_token, carlos_token):
        # Another client should NOT be able to poll carlos's appointment
        apt = self._book_pix_appointment(carlos_token)
        joao = requests.post(f"{BASE}/auth/login",
                             json={"email": "joao@test.com", "password": "cliente123"}).json()["token"]
        r = requests.get(f"{BASE}/appointments/{apt['id']}/payment-status", headers=H(joao))
        assert r.status_code == 403
