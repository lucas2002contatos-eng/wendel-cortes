"""New feature tests for iteration 2: public/info, settings/shop, confirm-presence."""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta

BASE = os.environ.get("EXPO_BACKEND_URL", "https://cortes-agendamentos.preview.emergentagent.com").rstrip("/") + "/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


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


@pytest.fixture(scope="module")
def joao_token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "joao@test.com", "password": "cliente123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# =============================== /api/public/info ============================
class TestPublicInfo:
    def test_public_info_no_auth(self):
        r = requests.get(f"{BASE}/public/info")
        assert r.status_code == 200, r.text
        data = r.json()
        # required keys
        for k in ["name", "shop", "days", "monthly_price", "monthly_cuts", "services"]:
            assert k in data, f"missing {k}"
        assert data["name"] == "WENDEL CORTES"
        # shop keys
        for k in ["whatsapp", "address", "instagram", "about"]:
            assert k in data["shop"], f"shop missing {k}"
        # days sorted weekday 0..6
        wds = [d["weekday"] for d in data["days"]]
        assert wds == sorted(wds)
        assert len(data["days"]) >= 5
        # services with price
        assert isinstance(data["services"], list)
        assert len(data["services"]) >= 1
        s0 = data["services"][0]
        for k in ["id", "name", "price", "duration_min"]:
            assert k in s0
        assert isinstance(data["monthly_price"], (int, float))


# =============================== PUT /api/settings/shop ======================
class TestShopUpdate:
    def test_admin_normalizes_whatsapp(self, admin_token):
        payload = {
            "whatsapp": "(11) 98888-7777",
            "address": "Rua Teste TEST_shop, 123 - São Paulo",
            "instagram": "@wendelcortes_test",
            "about": "TEST_about - barbearia premium",
        }
        r = requests.put(f"{BASE}/settings/shop", json=payload, headers=H(admin_token))
        assert r.status_code == 200, r.text
        shop = r.json()
        assert shop["whatsapp"] == "5511988887777"
        assert shop["address"] == payload["address"]
        assert shop["instagram"] == payload["instagram"]
        assert shop["about"] == payload["about"]
        # verify persistence via public/info
        info = requests.get(f"{BASE}/public/info").json()
        assert info["shop"]["whatsapp"] == "5511988887777"
        assert info["shop"]["address"] == payload["address"]
        assert info["shop"]["instagram"] == payload["instagram"]
        assert info["shop"]["about"] == payload["about"]

    def test_admin_rejects_short_whatsapp(self, admin_token):
        r = requests.put(
            f"{BASE}/settings/shop",
            json={"whatsapp": "1234", "address": "x", "instagram": "x", "about": "x"},
            headers=H(admin_token),
        )
        assert r.status_code == 400, r.text

    def test_non_admin_forbidden(self, carlos_token):
        r = requests.put(
            f"{BASE}/settings/shop",
            json={"whatsapp": "11988887777", "address": "x", "instagram": "x", "about": "x"},
            headers=H(carlos_token),
        )
        assert r.status_code == 403, r.text

    def test_no_auth_forbidden(self):
        r = requests.put(
            f"{BASE}/settings/shop",
            json={"whatsapp": "11988887777", "address": "x", "instagram": "x", "about": "x"},
        )
        assert r.status_code in (401, 403), r.text

    def test_ten_digits_gets_55_prefix(self, admin_token):
        r = requests.put(
            f"{BASE}/settings/shop",
            json={"whatsapp": "1198887777", "address": "TEST_addr2", "instagram": "@x", "about": "y"},
            headers=H(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["whatsapp"] == "551198887777"


# =============================== confirm-presence ============================
def _find_or_create_appointment_for_today(token: str) -> str:
    """Return an appointment id for `today` for this user (create one if none)."""
    apts = requests.get(f"{BASE}/appointments/me", headers=H(token)).json()
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    for a in apts:
        if a.get("date") in (today, tomorrow) and a.get("status") in ("agendado", "pago", "pagamento_pendente"):
            return a["id"]
    # need to create one: find a day-mode with agenda near future
    svcs = requests.get(f"{BASE}/services", headers=H(token)).json()
    corte = next(s for s in svcs if s["name"] == "Corte")
    for offset in range(0, 14):
        d = date.today() + timedelta(days=offset)
        try:
            avail = requests.get(f"{BASE}/agenda/available/{d.isoformat()}?service_id={corte['id']}", headers=H(token)).json()
        except Exception:
            continue
        if avail.get("mode") != "agenda":
            continue
        for slot in avail.get("slots", []):
            time_val = slot["time"] if isinstance(slot, dict) else slot
            bar_val = slot.get("barber_id") if isinstance(slot, dict) else None
            payload = {"service_id": corte["id"], "date": d.isoformat(), "time": time_val, "payment_method": "pix"}
            if bar_val:
                payload["barber_id"] = bar_val
            r = requests.post(
                f"{BASE}/appointments",
                json=payload,
                headers=H(token),
            )
            if r.status_code == 200:
                return r.json()["id"]
    raise RuntimeError("could not create appointment for confirm-presence test")


class TestConfirmPresence:
    def test_owner_confirms_presence(self, carlos_token):
        aid = _find_or_create_appointment_for_today(carlos_token)
        r = requests.post(f"{BASE}/appointments/{aid}/confirm-presence", headers=H(carlos_token))
        assert r.status_code == 200, r.text
        apt = r.json()
        assert apt["presence_confirmed"] is True
        assert "presence_confirmed_at" in apt
        # verify via GET list
        me = requests.get(f"{BASE}/appointments/me", headers=H(carlos_token)).json()
        got = next(a for a in me if a["id"] == aid)
        assert got["presence_confirmed"] is True

    def test_other_user_forbidden(self, carlos_token, joao_token):
        aid = _find_or_create_appointment_for_today(carlos_token)
        r = requests.post(f"{BASE}/appointments/{aid}/confirm-presence", headers=H(joao_token))
        assert r.status_code == 403, r.text

    def test_admin_agenda_shows_confirmed(self, carlos_token, admin_token):
        aid = _find_or_create_appointment_for_today(carlos_token)
        requests.post(f"{BASE}/appointments/{aid}/confirm-presence", headers=H(carlos_token))
        # find the date of this appointment
        me = requests.get(f"{BASE}/appointments/me", headers=H(carlos_token)).json()
        apt = next(a for a in me if a["id"] == aid)
        r = requests.get(f"{BASE}/appointments?date={apt['date']}", headers=H(admin_token))
        assert r.status_code == 200, r.text
        found = [a for a in r.json() if a["id"] == aid]
        assert found, "admin cannot see the appointment"
        assert found[0].get("presence_confirmed") is True

    def test_nonexistent_appointment_404(self, carlos_token):
        r = requests.post(f"{BASE}/appointments/{uuid.uuid4().hex}/confirm-presence", headers=H(carlos_token))
        assert r.status_code == 404, r.text
