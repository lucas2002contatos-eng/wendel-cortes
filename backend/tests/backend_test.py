"""WENDEL CORTES backend tests."""
import os
import pytest
import requests
from datetime import date, timedelta

BASE = "https://wendel-web-app.preview.emergentagent.com/api"

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

def H(t): return {"Authorization": f"Bearer {t}"}

def test_admin_login():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@wendelcortes.com", "password": "admin123"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"

def test_client_login():
    r = requests.post(f"{BASE}/auth/login", json={"email": "carlos@test.com", "password": "cliente123"})
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "client"

def test_register_new_client():
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={"name":"TEST User","phone":"11900000000","email":email,"password":"pass123"})
    assert r.status_code == 200
    assert "token" in r.json()

def test_services_list(carlos_token):
    r = requests.get(f"{BASE}/services", headers=H(carlos_token))
    assert r.status_code == 200
    services = r.json()
    names = [s["name"] for s in services]
    for expected in ["Alisante","Barba","Corte","Corte + Barba","Limpeza de Pele","Progressiva","Sobrancelha"]:
        assert expected in names, f"Missing {expected}"
    assert len(services) >= 7

def test_agenda_available_slots(carlos_token):
    # find next Monday (agenda mode)
    d = date.today()
    while d.weekday() != 0:
        d += timedelta(days=1)
    if d == date.today():
        d += timedelta(days=7)
    svcs = requests.get(f"{BASE}/services", headers=H(carlos_token)).json()
    corte = next(s for s in svcs if s["name"] == "Corte")
    r = requests.get(f"{BASE}/agenda/available/{d.isoformat()}?service_id={corte['id']}", headers=H(carlos_token))
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] == "agenda"
    assert len(data["slots"]) > 0

def test_appointment_create_and_duplicate(carlos_token):
    d = date.today()
    while d.weekday() != 0:
        d += timedelta(days=1)
    if d == date.today():
        d += timedelta(days=7)
    d = d + timedelta(days=7)  # further out to avoid conflicts
    svcs = requests.get(f"{BASE}/services", headers=H(carlos_token)).json()
    corte = next(s for s in svcs if s["name"] == "Corte")
    slots = requests.get(f"{BASE}/agenda/available/{d.isoformat()}?service_id={corte['id']}", headers=H(carlos_token)).json()["slots"]
    assert slots
    slot = slots[-1]  # last slot to avoid future test collisions
    time_val = slot["time"] if isinstance(slot, dict) else slot
    barber_val = slot.get("barber_id") if isinstance(slot, dict) else None
    payload = {"service_id": corte["id"], "date": d.isoformat(), "time": time_val, "payment_method": "pix"}
    if barber_val:
        payload["barber_id"] = barber_val
    r1 = requests.post(f"{BASE}/appointments", json=payload, headers=H(carlos_token))
    assert r1.status_code == 200, r1.text
    r2 = requests.post(f"{BASE}/appointments", json=payload, headers=H(carlos_token))
    assert r2.status_code == 409

def test_subscription_me_carlos(carlos_token):
    r = requests.get(f"{BASE}/subscription/me", headers=H(carlos_token))
    assert r.status_code == 200
    s = r.json()
    assert s is not None
    assert s["cuts_total"] == 4
    assert 0 <= s["cuts_used"] <= s["cuts_total"]

def test_queue_today(carlos_token):
    r = requests.get(f"{BASE}/queue/today", headers=H(carlos_token))
    assert r.status_code == 200
    data = r.json()
    assert data["mode"] in ["agenda","fila","fechado"]

def test_queue_join_behavior(carlos_token):
    # depends on day mode
    today_info = requests.get(f"{BASE}/queue/today", headers=H(carlos_token)).json()
    svcs = requests.get(f"{BASE}/services", headers=H(carlos_token)).json()
    corte = next(s for s in svcs if s["name"] == "Corte")
    r = requests.post(f"{BASE}/queue/join", json={"service_id": corte["id"]}, headers=H(carlos_token))
    if today_info["mode"] != "fila":
        assert r.status_code == 400  # queue not active today
    else:
        # first join ok or already in
        assert r.status_code in [200, 400]
        r2 = requests.post(f"{BASE}/queue/join", json={"service_id": corte["id"]}, headers=H(carlos_token))
        assert r2.status_code == 400

def test_admin_dashboard(admin_token):
    r = requests.get(f"{BASE}/admin/dashboard", headers=H(admin_token))
    assert r.status_code == 200
    for k in ["appointments_total","appointments_done","queue_waiting","revenue_today","active_subscriptions"]:
        assert k in r.json()

def test_admin_subscriptions(admin_token):
    r = requests.get(f"{BASE}/admin/subscriptions", headers=H(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1

def test_settings_day_update(admin_token):
    r = requests.put(f"{BASE}/settings/day", json={"weekday":0,"mode":"agenda","open_time":"09:00","close_time":"20:00"}, headers=H(admin_token))
    assert r.status_code == 200
    days = r.json()["days"]
    m = next(d for d in days if d["weekday"] == 0)
    assert m["mode"] == "agenda"

def test_appointment_mensal_flow():
    """Mensal cut is now consumed only when status becomes 'concluido' (reserved at booking)."""
    tok = requests.post(f"{BASE}/auth/login", json={"email":"joao@test.com","password":"cliente123"}).json()["token"]
    admin_tok = requests.post(f"{BASE}/auth/login", json={"email":"admin@wendelcortes.com","password":"admin123"}).json()["token"]
    sub_before = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
    used_before = sub_before["cuts_used"]
    svcs = requests.get(f"{BASE}/services", headers=H(tok)).json()
    corte = next(s for s in svcs if s["name"] == "Corte")
    d = date.today()
    while d.weekday() != 0:
        d += timedelta(days=1)
    d = d + timedelta(days=21)
    slots = requests.get(f"{BASE}/agenda/available/{d.isoformat()}?service_id={corte['id']}", headers=H(tok)).json()["slots"]
    assert slots
    slot = slots[-2]
    time_val = slot["time"] if isinstance(slot, dict) else slot
    bar_val = slot.get("barber_id") if isinstance(slot, dict) else None
    payload = {"service_id": corte["id"], "date": d.isoformat(), "time": time_val, "payment_method": "mensal"}
    if bar_val:
        payload["barber_id"] = bar_val
    r = requests.post(f"{BASE}/appointments", json=payload, headers=H(tok))
    if r.status_code == 400 and "ciclo" in r.text:
        pytest.skip("joao's mensal cycle exhausted by prior test runs")
    assert r.status_code == 200, r.text
    apt = r.json()
    assert apt["status"] == "agendado"
    # cuts_used unchanged until completion
    sub_mid = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
    assert sub_mid["cuts_used"] == used_before
    # admin completes → consume
    for st in ["em_atendimento", "concluido"]:
        requests.put(f"{BASE}/appointments/{apt['id']}/status", json={"status": st}, headers=H(admin_tok))
    sub_after = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
    assert sub_after["cuts_used"] == used_before + 1
