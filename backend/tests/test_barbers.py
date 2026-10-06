"""Multi-barber system tests (iteration 3).

Coverage:
  * GET /barbers, /barbers/available/{d}
  * GET /agenda/available/{d}?barber_id=any
  * Booking with specific barber vs 'any' (conflict only for same barber)
  * Mensal reserved-at-booking, consumed-on-concluido with usage_history
  * Queue per-barber with auto-call-next on complete
  * Admin barber CRUD, work_hours, active toggle, blocks, day overrides
  * /admin/reports/barbers aggregation
Today in this environment is 2026-10-03 (Saturday, fila mode). Agenda-mode: Mon-Fri.
"""
import os
import uuid
import time as time_mod
import pytest
import requests
from datetime import date, datetime, timedelta

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://cortes-agendamentos.preview.emergentagent.com").rstrip("/") + "/api"


def H(t):
    return {"Authorization": f"Bearer {t}"}


# -------- helpers ----------
def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _ensure_client(name, email):
    """Register (or login) a test client; returns token."""
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "cliente123"})
    if r.status_code == 200:
        return r.json()["token"]
    r = requests.post(f"{BASE}/auth/register", json={"name": name, "phone": "11900000000", "email": email, "password": "cliente123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _next_weekday(wd: int) -> date:
    """Return the next date (strictly in the future, so always bookable) with given weekday."""
    d = date.today() + timedelta(days=1)
    while d.weekday() != wd:
        d += timedelta(days=1)
    return d


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@wendelcortes.com", "admin123")


@pytest.fixture(scope="module")
def carlos_token():
    return _login("carlos@test.com", "cliente123")


@pytest.fixture(scope="module")
def jackson_token():
    return _login("joao@test.com", "cliente123")


@pytest.fixture(scope="module")
def rafael_token():
    return _login("rafael@test.com", "cliente123")


@pytest.fixture(scope="module")
def lucas_token():
    return _login("lucas@test.com", "cliente123")


@pytest.fixture(scope="module")
def marcos_token():
    return _login("marcos@test.com", "cliente123")


@pytest.fixture(scope="module")
def services(carlos_token):
    r = requests.get(f"{BASE}/services", headers=H(carlos_token))
    assert r.status_code == 200
    return {s["name"]: s for s in r.json()}


@pytest.fixture(scope="module")
def barbers(carlos_token):
    r = requests.get(f"{BASE}/barbers", headers=H(carlos_token))
    assert r.status_code == 200
    return {b["name"]: b for b in r.json()}


# =============================================================== 1. list ====
class TestBarbersList:
    def test_list_contains_wendel_and_joao(self, carlos_token):
        r = requests.get(f"{BASE}/barbers", headers=H(carlos_token))
        assert r.status_code == 200
        names = [b["name"] for b in r.json()]
        assert "Wendel" in names
        assert "Jackson" in names

    def test_available_tuesday_has_both(self, carlos_token):
        d = _next_weekday(1).isoformat()  # Tuesday
        r = requests.get(f"{BASE}/barbers/available/{d}", headers=H(carlos_token))
        assert r.status_code == 200
        names = [b["name"] for b in r.json()]
        assert "Wendel" in names and "Jackson" in names

    def test_available_monday_only_wendel(self, carlos_token):
        d = _next_weekday(0).isoformat()  # Monday
        r = requests.get(f"{BASE}/barbers/available/{d}", headers=H(carlos_token))
        assert r.status_code == 200
        names = [b["name"] for b in r.json()]
        assert "Wendel" in names
        assert "Jackson" not in names


# =========================================================== 2. agenda any =
class TestAgendaAny:
    def test_any_slot_has_both_barbers(self, carlos_token, services):
        d = _next_weekday(1).isoformat()  # Tuesday both working
        corte = services["Corte"]
        r = requests.get(f"{BASE}/agenda/available/{d}?service_id={corte['id']}&barber_id=any", headers=H(carlos_token))
        assert r.status_code == 200
        data = r.json()
        assert data["mode"] == "agenda"
        # find 10:00 slot (both start by 10:00: Wendel 09, Jackson 10)
        slot10 = next((s for s in data["slots"] if s["time"] == "10:00"), None)
        assert slot10 is not None, f"no 10:00 slot: {data['slots'][:3]}"
        option_names = [b["name"] for b in slot10["barbers"]]
        assert "Wendel" in option_names and "Jackson" in option_names


# =============================================== 3-5. conflict scope by barber =
@pytest.fixture(scope="module")
def booking_tuesday_date():
    # 21 days ahead Tuesday to avoid any prior booking collisions in persistent DB
    return (_next_weekday(1) + timedelta(days=14)).isoformat()


class TestPerBarberConflict:
    def test_different_barbers_same_time_both_ok(self, carlos_token, jackson_token, services, barbers, booking_tuesday_date):
        corte = services["Corte"]
        d = booking_tuesday_date
        time = "14:00"
        r1 = requests.post(f"{BASE}/appointments",
                           json={"service_id": corte["id"], "date": d, "time": time, "payment_method": "pix", "barber_id": barbers["Wendel"]["id"]},
                           headers=H(carlos_token))
        assert r1.status_code == 200, r1.text
        assert r1.json()["barber_name"] == "Wendel"
        r2 = requests.post(f"{BASE}/appointments",
                           json={"service_id": corte["id"], "date": d, "time": time, "payment_method": "pix", "barber_id": barbers["Jackson"]["id"]},
                           headers=H(jackson_token))
        assert r2.status_code == 200, r2.text
        assert r2.json()["barber_name"] == "Jackson"

    def test_same_barber_same_time_conflict(self, rafael_token, services, barbers, booking_tuesday_date):
        corte = services["Corte"]
        d = booking_tuesday_date
        r = requests.post(f"{BASE}/appointments",
                          json={"service_id": corte["id"], "date": d, "time": "14:00", "payment_method": "pix", "barber_id": barbers["Wendel"]["id"]},
                          headers=H(rafael_token))
        assert r.status_code == 409, r.text

    def test_wendel_14_excluded_but_15_still_free(self, carlos_token, services, barbers, booking_tuesday_date):
        corte_barba = services["Corte + Barba"]  # 60min
        d = booking_tuesday_date
        wid = barbers["Wendel"]["id"]
        r = requests.get(f"{BASE}/agenda/available/{d}?service_id={corte_barba['id']}&barber_id={wid}", headers=H(carlos_token))
        times = [s["time"] for s in r.json()["slots"]]
        # 14:00 occupied + overlap 13:30 blocked for a 60-min service starting 13:30
        assert "14:00" not in times
        assert "13:30" not in times
        # 15:00 should still be available (14:00 corte is 30min → 14:30 free)
        assert "15:00" in times


# ========================================================= 6. 'any' auto-pick =
class TestAnyAutoPick:
    def test_any_booking_picks_a_barber(self, lucas_token, services):
        corte = services["Corte"]
        d = _next_weekday(1).isoformat()
        slots = requests.get(f"{BASE}/agenda/available/{d}?service_id={corte['id']}&barber_id=any", headers=H(lucas_token)).json()["slots"]
        # pick a late slot likely free
        free_time = next((s["time"] for s in slots if s["time"] >= "17:00"), slots[-1]["time"])
        r = requests.post(f"{BASE}/appointments",
                          json={"service_id": corte["id"], "date": d, "time": free_time, "payment_method": "pix"},
                          headers=H(lucas_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("barber_id")
        assert body.get("barber_name") in ("Wendel", "Jackson")


# =========================================================== 7. mensal flow =
class TestMensal:
    def test_mensal_reserved_at_booking_consumed_on_concluido(self, admin_token, services, barbers):
        """Full lifecycle for carlos: book mensal, verify no consume, admin complete → consume + usage_history."""
        tok = _login("carlos@test.com", "cliente123")
        sub_before = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
        used_before = sub_before["cuts_used"]
        corte = services["Corte"]
        wid = barbers["Wendel"]["id"]
        # pick a Monday far enough to be free
        d = (_next_weekday(0) + timedelta(days=14)).isoformat()
        slots = requests.get(f"{BASE}/agenda/available/{d}?service_id={corte['id']}&barber_id={wid}", headers=H(tok)).json()["slots"]
        assert slots
        time_pick = slots[-1]["time"]
        r = requests.post(f"{BASE}/appointments",
                          json={"service_id": corte["id"], "date": d, "time": time_pick, "payment_method": "mensal", "barber_id": wid},
                          headers=H(tok))
        assert r.status_code == 200, r.text
        apt = r.json()
        assert apt["status"] == "agendado"
        assert apt["used_mensal"] is True
        assert apt["mensal_consumed"] is False
        # subscription cuts_used unchanged
        sub_mid = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
        assert sub_mid["cuts_used"] == used_before

        # admin: em_atendimento → concluido
        for st in ["em_atendimento", "concluido"]:
            r2 = requests.put(f"{BASE}/appointments/{apt['id']}/status", json={"status": st}, headers=H(admin_token))
            assert r2.status_code == 200, r2.text

        sub_after = requests.get(f"{BASE}/subscription/me", headers=H(tok)).json()
        assert sub_after["cuts_used"] == used_before + 1
        hist = sub_after.get("usage_history") or []
        assert hist, "usage_history empty"
        last = hist[-1]
        for k in ["barber_name", "service_name", "date", "time", "cycle_start", "cut_number"]:
            assert k in last, f"usage_history missing {k}"
        assert last["service_name"] == "Corte"
        assert last["barber_name"] == "Wendel"


# ============================================================= 8-9. queue ===
@pytest.fixture(scope="module")
def unique_client_token():
    """Create a brand-new client (no prior queue entry) for queue tests."""
    email = f"test_queue_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={"name": "TEST Queue", "phone": "11900000000", "email": email, "password": "cliente123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


class TestQueuePerBarber:
    def test_join_wendel_and_jackson_independent_queues(self, lucas_token, unique_client_token, services, barbers):
        """lucas joins Wendel queue, fresh client joins Jackson queue → independent positions."""
        corte = services["Corte"]
        today_info = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
        if today_info["mode"] != "fila":
            pytest.skip("today is not fila mode")
        # ensure lucas not already in queue (leave if is)
        my = today_info.get("my_entry")
        if my:
            requests.post(f"{BASE}/queue/{my['id']}/leave", headers=H(lucas_token))
        r1 = requests.post(f"{BASE}/queue/join",
                           json={"service_id": corte["id"], "barber_id": barbers["Wendel"]["id"]},
                           headers=H(lucas_token))
        assert r1.status_code == 200, r1.text
        entry1 = r1.json()
        assert entry1["barber_name"] == "Wendel"
        assert entry1.get("position") is not None

        r2 = requests.post(f"{BASE}/queue/join",
                           json={"service_id": corte["id"], "barber_id": barbers["Jackson"]["id"]},
                           headers=H(unique_client_token))
        assert r2.status_code == 200, r2.text
        entry2 = r2.json()
        assert entry2["barber_name"] == "Jackson"
        assert entry2.get("position") is not None and entry2["position"] >= 1
        # queue positions must be independent between barbers — verify by checking the Jackson entry is in Jackson's group only
        today2 = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
        jackson_q = next((q for q in today2["queues"] if q["barber_name"] == "Jackson"), None)
        wendel_q = next((q for q in today2["queues"] if q["barber_name"] == "Wendel"), None)
        assert jackson_q and any(e["id"] == entry2["id"] for e in jackson_q["entries"])
        assert wendel_q and not any(e["id"] == entry2["id"] for e in wendel_q["entries"])

        # queue/today returns per-barber groups
        today2 = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
        assert "queues" in today2
        qbarbers = {q["barber_name"] for q in today2["queues"]}
        assert {"Wendel", "Jackson"}.issubset(qbarbers)

    def test_admin_call_start_complete_calls_next_same_barber(self, admin_token, lucas_token, services, barbers):
        today_info = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
        if today_info["mode"] != "fila":
            pytest.skip("not fila mode")
        wendel_queue = next((q for q in today_info["queues"] if q["barber_name"] == "Wendel"), None)
        assert wendel_queue, "no Wendel queue group"
        waiting = [e for e in wendel_queue["entries"] if e["status"] == "aguardando"]
        if len(waiting) < 2:
            # add another waiting Wendel client (register fresh)
            email = f"test_wq_{uuid.uuid4().hex[:8]}@test.com"
            tok2 = requests.post(f"{BASE}/auth/register", json={"name": "TEST WQ", "phone": "11900", "email": email, "password": "cliente123"}).json()["token"]
            corte = services["Corte"]
            requests.post(f"{BASE}/queue/join",
                          json={"service_id": corte["id"], "barber_id": barbers["Wendel"]["id"]},
                          headers=H(tok2))
            today_info = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
            wendel_queue = next(q for q in today_info["queues"] if q["barber_name"] == "Wendel")
            waiting = [e for e in wendel_queue["entries"] if e["status"] == "aguardando"]
        first = waiting[0]
        expected_next_id = waiting[1]["id"]

        r = requests.post(f"{BASE}/queue/{first['id']}/call", headers=H(admin_token))
        assert r.status_code == 200
        r = requests.post(f"{BASE}/queue/{first['id']}/start", headers=H(admin_token))
        assert r.status_code == 200
        r = requests.post(f"{BASE}/queue/{first['id']}/complete", json={"use_mensal": False}, headers=H(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("next_called"), "no next_called returned"
        assert body["next_called"]["id"] == expected_next_id

        # verify Jackson queue not affected
        today2 = requests.get(f"{BASE}/queue/today", headers=H(lucas_token)).json()
        jackson_q = next((q for q in today2["queues"] if q["barber_name"] == "Jackson"), None)
        if jackson_q and jackson_q["entries"]:
            assert all(e["status"] in ("aguardando",) for e in jackson_q["entries"] if e["status"] != "chamado" or e.get("auto_called") is not True), "Jackson queue was auto-affected"


# =============================================== 10-13. admin barber CRUD ===
class TestAdminBarbersCrud:
    _pedro_id = None

    def test_create_pedro_saturday_only(self, admin_token, carlos_token):
        wh = [{"weekday": i, "enabled": i == 5, "start": "09:00", "end": "18:00"} for i in range(7)]
        r = requests.post(f"{BASE}/barbers",
                          json={"name": "TEST_Pedro", "phone": "11911112222", "description": "test barber", "work_hours": wh},
                          headers=H(admin_token))
        assert r.status_code == 200, r.text
        pedro = r.json()
        TestAdminBarbersCrud._pedro_id = pedro["id"]
        # Pedro present on Saturday
        sat = _next_weekday(5).isoformat()
        avail = requests.get(f"{BASE}/barbers/available/{sat}", headers=H(carlos_token)).json()
        assert any(b["name"] == "TEST_Pedro" for b in avail)
        # not on Monday
        mon = _next_weekday(0).isoformat()
        avail2 = requests.get(f"{BASE}/barbers/available/{mon}", headers=H(carlos_token)).json()
        assert not any(b["name"] == "TEST_Pedro" for b in avail2)

    def test_deactivate_hides_from_client(self, admin_token, carlos_token):
        bid = TestAdminBarbersCrud._pedro_id
        assert bid
        r = requests.patch(f"{BASE}/barbers/{bid}/active", json={"active": False}, headers=H(admin_token))
        assert r.status_code == 200
        # client view should not list it
        names = [b["name"] for b in requests.get(f"{BASE}/barbers", headers=H(carlos_token)).json()]
        assert "TEST_Pedro" not in names
        sat = _next_weekday(5).isoformat()
        avail = requests.get(f"{BASE}/barbers/available/{sat}", headers=H(carlos_token)).json()
        assert not any(b["name"] == "TEST_Pedro" for b in avail)

    def test_update_workhours_jackson_monday(self, admin_token, carlos_token, barbers):
        joao = barbers["Jackson"]
        # enable Monday
        new_wh = [{"weekday": i, "enabled": (0 <= i <= 5), "start": "10:00", "end": "20:00"} for i in range(7)]
        r = requests.put(f"{BASE}/barbers/{joao['id']}",
                         json={"name": joao["name"], "phone": joao.get("phone", ""), "work_hours": new_wh},
                         headers=H(admin_token))
        assert r.status_code == 200, r.text
        mon = _next_weekday(0).isoformat()
        avail = requests.get(f"{BASE}/barbers/available/{mon}", headers=H(carlos_token)).json()
        assert any(b["name"] == "Jackson" for b in avail)
        # restore (Tue-Sat only)
        restore_wh = [{"weekday": i, "enabled": (1 <= i <= 5), "start": "10:00", "end": "20:00"} for i in range(7)]
        r2 = requests.put(f"{BASE}/barbers/{joao['id']}",
                          json={"name": joao["name"], "phone": joao.get("phone", ""), "work_hours": restore_wh},
                          headers=H(admin_token))
        assert r2.status_code == 200

    def test_block_hides_slot_delete_restores(self, admin_token, carlos_token, services, barbers):
        wendel = barbers["Wendel"]
        tue = _next_weekday(1).isoformat()
        # add block 11:00 on Wendel
        r = requests.post(f"{BASE}/barbers/{wendel['id']}/blocks",
                          json={"date": tue, "time": "11:00", "reason": "test"},
                          headers=H(admin_token))
        assert r.status_code == 200, r.text
        block_id = r.json()["id"]
        corte = services["Corte"]
        slots = requests.get(f"{BASE}/agenda/available/{tue}?service_id={corte['id']}&barber_id={wendel['id']}", headers=H(carlos_token)).json()["slots"]
        times = [s["time"] for s in slots]
        assert "11:00" not in times
        # delete and verify restored
        rd = requests.delete(f"{BASE}/barbers/blocks/{block_id}", headers=H(admin_token))
        assert rd.status_code == 200
        slots2 = requests.get(f"{BASE}/agenda/available/{tue}?service_id={corte['id']}&barber_id={wendel['id']}", headers=H(carlos_token)).json()["slots"]
        assert "11:00" in [s["time"] for s in slots2]

    def test_day_override_adds_and_removes(self, admin_token, carlos_token, barbers):
        joao = barbers["Jackson"]
        # add positive override for next Monday
        mon = _next_weekday(0).isoformat()
        r = requests.put(f"{BASE}/barbers/{joao['id']}/day-override",
                         json={"date": mon, "working": True, "start": "10:00", "end": "20:00"},
                         headers=H(admin_token))
        assert r.status_code == 200
        avail = requests.get(f"{BASE}/barbers/available/{mon}", headers=H(carlos_token)).json()
        assert any(b["name"] == "Jackson" for b in avail)
        # negative override on next Tuesday
        tue = (_next_weekday(1) + timedelta(days=7)).isoformat()
        r2 = requests.put(f"{BASE}/barbers/{joao['id']}/day-override",
                          json={"date": tue, "working": False},
                          headers=H(admin_token))
        assert r2.status_code == 200
        avail2 = requests.get(f"{BASE}/barbers/available/{tue}", headers=H(carlos_token)).json()
        assert not any(b["name"] == "Jackson" for b in avail2)
        # cleanup overrides
        requests.delete(f"{BASE}/barbers/{joao['id']}/day-override/{mon}", headers=H(admin_token))
        requests.delete(f"{BASE}/barbers/{joao['id']}/day-override/{tue}", headers=H(admin_token))

    def test_zz_cleanup_pedro(self, admin_token):
        """Cleanup test barber at end."""
        bid = TestAdminBarbersCrud._pedro_id
        if bid:
            r = requests.delete(f"{BASE}/barbers/{bid}", headers=H(admin_token))
            assert r.status_code == 200


# ============================================================ 14. reports ===
class TestBarberReports:
    def test_admin_barber_reports_shape(self, admin_token):
        r = requests.get(f"{BASE}/admin/reports/barbers", headers=H(admin_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "barbers" in data
        # expect at least Wendel + Jackson listed (even if zero activity)
        names = [b["barber_name"] for b in data["barbers"]]
        assert "Wendel" in names
        assert "Jackson" in names
        for b in data["barbers"]:
            for k in ["atendimentos", "clientes", "faturamento", "servicos"]:
                assert k in b, f"missing {k} in report"
            assert isinstance(b["servicos"], list)
