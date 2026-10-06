"""Security-focused tests (iteration 4): SEC-001..SEC-005 + hardening.

Covers:
 - Login no pre-fill isn't a backend concern (verified in frontend tests)
 - SEC-002: /queue/today anonymization for other clients
 - SEC-003: tokens signed with old/wrong secret → 401, exp ≈ 7 days
 - SEC-004: /seed requires admin, idempotent
 - SEC-005: appointment/barber/agenda/schedule input validation
 - Hardening: register weak password, neutral duplicate message, /register-push 401, rate limit 429, CORS
"""
import os
import time
import uuid
import requests
import jwt as pyjwt
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://cortes-agendamentos.preview.emergentagent.com").rstrip("/") + "/api"


# ---------- helpers ----------
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@wendelcortes.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def carlos_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "carlos@test.com", "password": "cliente123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(t):
    return {"Authorization": f"Bearer {t}"}


# =========================================================================
# SEC-002 — /queue/today anonymization
# =========================================================================
class TestQueueAnonymization:
    def test_client_sees_others_abbreviated_without_phone(self):
        tok = carlos_token()
        r = requests.get(f"{BASE}/queue/today", headers=auth(tok))
        assert r.status_code == 200, r.text
        data = r.json()
        entries = data.get("entries", [])
        if not entries:
            pytest.skip("No queue entries today")
        me = next((e for e in entries if (data.get("my_entry") or {}).get("id") == e.get("id")), None)
        others = [e for e in entries if e is not me]
        # own entry (if present) keeps phone + user_id
        if me is not None:
            assert "client_phone" in me
        for e in others:
            assert "client_phone" not in e, f"other entry leaked client_phone: {e}"
            assert "user_id" not in e, f"other entry leaked user_id: {e}"
            name = e.get("client_name", "")
            # abbreviated: either single first name or 'First X.'
            parts = name.split()
            assert len(parts) <= 2, f"name not abbreviated: {name!r}"
            if len(parts) == 2:
                assert parts[1].endswith(".") and len(parts[1]) == 2, f"second token not initial: {name!r}"

    def test_queues_entries_also_anonymized_for_client(self):
        tok = carlos_token()
        data = requests.get(f"{BASE}/queue/today", headers=auth(tok)).json()
        my_id = (data.get("my_entry") or {}).get("id")
        for q in data.get("queues", []):
            for e in q.get("entries", []):
                if e.get("id") == my_id:
                    continue
                assert "client_phone" not in e
                assert "user_id" not in e

    def test_admin_sees_full_entries(self):
        tok = admin_token()
        data = requests.get(f"{BASE}/queue/today", headers=auth(tok)).json()
        for e in data.get("entries", []):
            # admin keeps phone + user_id
            assert "client_phone" in e, f"admin missing phone: {e}"
            assert "user_id" in e, f"admin missing user_id: {e}"


# =========================================================================
# SEC-003 — JWT secret / expiration
# =========================================================================
class TestJWT:
    def test_old_dev_secret_token_rejected(self):
        payload = {"sub": "x", "role": "client", "exp": int(time.time()) + 60}
        bad = pyjwt.encode(payload, "dev-secret", algorithm="HS256")
        r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401, r.text

    def test_random_secret_token_rejected(self):
        payload = {"sub": "x", "role": "client", "exp": int(time.time()) + 60}
        bad = pyjwt.encode(payload, "another-wrong-secret-" + uuid.uuid4().hex, algorithm="HS256")
        r = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401

    def test_valid_token_accepted(self):
        tok = carlos_token()
        r = requests.get(f"{BASE}/auth/me", headers=auth(tok))
        assert r.status_code == 200
        assert r.json()["email"] == "carlos@test.com"

    def test_token_expires_in_about_7_days(self):
        tok = carlos_token()
        # decode without verification to inspect exp
        payload = pyjwt.decode(tok, options={"verify_signature": False})
        delta = payload["exp"] - payload.get("iat", int(time.time()))
        # we didn't set iat; use issued-around-now assumption instead
        if "iat" not in payload:
            delta = payload["exp"] - int(time.time())
        seven_days = 7 * 24 * 3600
        assert abs(delta - seven_days) < 60 * 60, f"exp delta={delta}s (expected ~{seven_days}s)"


# =========================================================================
# SEC-004 — /seed protected + idempotent
# =========================================================================
class TestSeedProtection:
    def test_seed_without_token_401(self):
        r = requests.post(f"{BASE}/seed")
        assert r.status_code == 401

    def test_seed_with_client_token_403(self):
        tok = carlos_token()
        r = requests.post(f"{BASE}/seed", headers=auth(tok))
        assert r.status_code == 403

    def test_seed_admin_idempotent(self):
        tok = admin_token()
        before_services = requests.get(f"{BASE}/services", headers=auth(tok)).json()
        before_barbers = requests.get(f"{BASE}/barbers", headers=auth(tok)).json()
        r = requests.post(f"{BASE}/seed", headers=auth(tok))
        assert r.status_code == 200, r.text
        after_services = requests.get(f"{BASE}/services", headers=auth(tok)).json()
        after_barbers = requests.get(f"{BASE}/barbers", headers=auth(tok)).json()
        assert len(after_services) == len(before_services), f"services duplicated: {len(before_services)} → {len(after_services)}"
        assert len(after_services) == 7, f"expected 7 default services, got {len(after_services)}"
        assert len(after_barbers) == len(before_barbers)


# =========================================================================
# SEC-005 — input validation
# =========================================================================
class TestInputValidation:
    def test_appointment_bad_date_400(self):
        tok = carlos_token()
        svc = requests.get(f"{BASE}/services", headers=auth(tok)).json()[0]
        r = requests.post(f"{BASE}/appointments", headers=auth(tok), json={
            "service_id": svc["id"], "date": "xx", "time": "10:00", "payment_method": "pix",
        })
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_appointment_bad_time_400(self):
        tok = carlos_token()
        svc = requests.get(f"{BASE}/services", headers=auth(tok)).json()[0]
        r = requests.post(f"{BASE}/appointments", headers=auth(tok), json={
            "service_id": svc["id"], "date": "2026-10-05", "time": "25:99", "payment_method": "pix",
        })
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_barber_block_bad_date_422(self):
        tok = admin_token()
        barbers = requests.get(f"{BASE}/barbers", headers=auth(tok)).json()
        bid = barbers[0]["id"]
        r = requests.post(f"{BASE}/barbers/{bid}/blocks", headers=auth(tok), json={
            "date": "not-a-date", "time": "10:00",
        })
        assert r.status_code in (400, 422)

    def test_barber_block_bad_time_422(self):
        tok = admin_token()
        barbers = requests.get(f"{BASE}/barbers", headers=auth(tok)).json()
        bid = barbers[0]["id"]
        r = requests.post(f"{BASE}/barbers/{bid}/blocks", headers=auth(tok), json={
            "date": "2026-10-05", "time": "99:99",
        })
        assert r.status_code in (400, 422)

    def test_update_barber_bad_work_hours_422(self):
        tok = admin_token()
        barbers = requests.get(f"{BASE}/barbers", headers=auth(tok)).json()
        b = barbers[0]
        bad = dict(b)
        bad["work_hours"] = [{"weekday": 0, "enabled": True, "start": "abc", "end": "18:00"}]
        # pydantic will reject (TIME_RE)
        r = requests.put(f"{BASE}/barbers/{b['id']}", headers=auth(tok), json={
            "name": b["name"], "phone": b.get("phone", ""), "photo_url": b.get("photo_url", ""),
            "description": b.get("description", ""), "active": b.get("active", True),
            "work_hours": bad["work_hours"],
        })
        assert r.status_code in (400, 422), f"got {r.status_code}: {r.text}"

    def test_barbers_available_bad_date_400(self):
        tok = carlos_token()
        r = requests.get(f"{BASE}/barbers/available/not-a-date", headers=auth(tok))
        assert r.status_code == 400, r.text

    def test_barbers_schedule_bad_date_400(self):
        tok = admin_token()
        r = requests.get(f"{BASE}/barbers/schedule/bad", headers=auth(tok))
        assert r.status_code == 400, r.text


# =========================================================================
# Hardening — register weak pw, neutral duplicate, push 401, CORS
# =========================================================================
class TestHardening:
    def test_register_weak_password_400(self):
        email = f"TEST_weak_{uuid.uuid4().hex[:6]}@x.com"
        r = requests.post(f"{BASE}/auth/register", json={
            "name": "TEST Weak", "phone": "11900000000", "email": email, "password": "abc",
        })
        assert r.status_code == 400
        assert "pelo menos 6" in r.json().get("detail", "")

    def test_register_duplicate_neutral_message(self):
        r = requests.post(f"{BASE}/auth/register", json={
            "name": "Dup", "phone": "11900000000", "email": "carlos@test.com", "password": "cliente123",
        })
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        # neutral message — must NOT contain the leaky phrase
        assert "já cadastrado" not in detail, f"leaky message: {detail!r}"

    def test_register_push_requires_auth(self):
        r = requests.post(f"{BASE}/register-push", json={
            "user_id": "x", "platform": "web", "device_token": "t",
        })
        assert r.status_code == 401

    def test_cors_origin_is_not_credentialed_wildcard(self):
        r = requests.options(
            f"{BASE}/auth/login",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        acao = r.headers.get("access-control-allow-origin", "")
        acac = r.headers.get("access-control-allow-credentials", "")
        # Must be wildcard (or absent) AND must NOT be credentialed
        assert acac.lower() != "true", f"ACAC must not be true, got {acac!r}"
        # ACAO may be '*' or the echoed origin for non-credentialed — the key safety is not credentialed
        # (if ACAO were the echoed evil origin AND credentials=true that would be the bug)
        # per request we additionally require ACAO='*'
        assert acao == "*", f"expected ACAO '*', got {acao!r}"


# =========================================================================
# Rate limit — MUST RUN LAST (locks IP for 15min); uses throwaway email.
# =========================================================================
@pytest.mark.order("last")
class TestRateLimitLast:
    def test_rate_limit_429_after_10_failures(self):
        email = f"ratelimit-test-{uuid.uuid4().hex[:6]}@x.com"
        statuses = []
        for i in range(11):
            r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "wrong-pw"})
            statuses.append(r.status_code)
        # first 10 failures should be 401, then 429
        assert statuses[-1] == 429, f"last status not 429: {statuses}"
        assert 401 in statuses[:10], f"expected some 401 among first 10: {statuses}"
