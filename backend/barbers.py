"""Barbers module — CRUD, work schedule, blocks, availability helpers and reports.

Mounted from server.py via `make_barbers_router(db, get_current_user, require_admin, now_utc)`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

DATE_RE = r"^\d{4}-\d{2}-\d{2}$"
TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"

SLOT_STEP_MIN = 30
ACTIVE_APT_STATUSES_EXCLUDED = ["cancelado", "nao_compareceu"]


# ----------------------------------------------------------------- models ---
class WorkHour(BaseModel):
    weekday: int = Field(ge=0, le=6)  # 0=Mon..6=Sun
    enabled: bool = True
    start: str = Field("09:00", pattern=TIME_RE)
    end: str = Field("18:00", pattern=TIME_RE)


def default_work_hours() -> List[dict]:
    return [{"weekday": i, "enabled": i < 6, "start": "09:00", "end": "18:00"} for i in range(7)]


class BarberBody(BaseModel):
    name: str
    phone: Optional[str] = ""
    photo_url: Optional[str] = ""
    description: Optional[str] = ""
    active: bool = True
    work_hours: Optional[List[WorkHour]] = None
    commission_pct: Optional[float] = None  # prepared for future commission feature
    service_ids: List[str] = []  # services this barber performs (empty = all)
    pix_key: Optional[str] = ""
    pix_key_type: Optional[str] = Field("aleatoria", pattern="^(cpf|cnpj|telefone|email|aleatoria)$")
    pix_holder_name: Optional[str] = Field("", max_length=25)
    archived: bool = False


class BarberActiveBody(BaseModel):
    active: bool


class BarberBlockBody(BaseModel):
    date: str = Field(pattern=DATE_RE)
    time: str = Field(pattern=TIME_RE)
    reason: Optional[str] = Field("", max_length=200)


class DayOverrideBody(BaseModel):
    date: str = Field(pattern=DATE_RE)
    working: bool
    start: Optional[str] = Field(None, pattern=TIME_RE)
    end: Optional[str] = Field(None, pattern=TIME_RE)


def parse_date(d: str) -> datetime:
    try:
        return datetime.strptime(d, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise HTTPException(400, "Data inválida (use AAAA-MM-DD)")


# ---------------------------------------------------------------- helpers ---
def _t(s: str) -> datetime:
    return datetime.strptime(s, "%H:%M")


def overlaps(t1: str, d1: int, t2: str, d2: int) -> bool:
    a, b = _t(t1), _t(t1) + timedelta(minutes=d1)
    c, d = _t(t2), _t(t2) + timedelta(minutes=d2)
    return a < d and c < b


async def working_window(db, barber: dict, d: str) -> Optional[dict]:
    """Return {"start","end"} if barber works on date d (respecting day overrides), else None."""
    if not barber.get("active", True):
        return None
    wd = parse_date(d).weekday()
    wh = next((h for h in barber.get("work_hours", []) if h["weekday"] == wd), None)
    ov = await db.barber_day_overrides.find_one({"barber_id": barber["id"], "date": d}, {"_id": 0})
    if ov is not None:
        if not ov["working"]:
            return None
        return {
            "start": ov.get("start") or (wh["start"] if wh else "09:00"),
            "end": ov.get("end") or (wh["end"] if wh else "18:00"),
        }
    if not wh or not wh.get("enabled", True):
        return None
    return {"start": wh["start"], "end": wh["end"]}


async def available_barbers(db, d: str) -> List[dict]:
    """Active barbers working on date d, each with its window."""
    out = []
    async for b in db.barbers.find({"active": True, "archived": {"$ne": True}}, {"_id": 0}).sort("name", 1):
        w = await working_window(db, b, d)
        if w:
            out.append({**b, "window": w})
    return out


async def barber_busy_intervals(db, barber_id: str, d: str) -> List[tuple]:
    apts = await db.appointments.find(
        {"barber_id": barber_id, "date": d, "status": {"$nin": ACTIVE_APT_STATUSES_EXCLUDED}},
        {"_id": 0, "time": 1, "duration_min": 1},
    ).to_list(500)
    blocks = await db.barber_blocks.find({"barber_id": barber_id, "date": d}, {"_id": 0, "time": 1}).to_list(200)
    global_blocks = await db.blocked_slots.find({"date": d}, {"_id": 0, "time": 1}).to_list(200)
    busy = [(a["time"], a.get("duration_min", SLOT_STEP_MIN)) for a in apts]
    busy += [(b["time"], SLOT_STEP_MIN) for b in blocks + global_blocks]
    return busy


async def barber_free_slots(db, barber: dict, d: str, duration_min: int) -> List[str]:
    window = barber.get("window") or await working_window(db, barber, d)
    if not window:
        return []
    busy = await barber_busy_intervals(db, barber["id"], d)
    slots = []
    cur, end = _t(window["start"]), _t(window["end"])
    while cur + timedelta(minutes=duration_min) <= end:
        t = cur.strftime("%H:%M")
        if not any(overlaps(t, duration_min, bt, bd) for bt, bd in busy):
            slots.append(t)
        cur += timedelta(minutes=SLOT_STEP_MIN)
    return slots


async def is_barber_slot_free(db, barber: dict, d: str, time: str, duration_min: int) -> bool:
    window = await working_window(db, barber, d)
    if not window:
        return False
    if _t(time) < _t(window["start"]) or _t(time) + timedelta(minutes=duration_min) > _t(window["end"]):
        return False
    busy = await barber_busy_intervals(db, barber["id"], d)
    return not any(overlaps(time, duration_min, bt, bd) for bt, bd in busy)


# ----------------------------------------------------------------- router ---
def make_barbers_router(db, get_current_user, require_admin, now_utc, audit) -> APIRouter:
    r = APIRouter()

    @r.get("/barbers")
    async def list_barbers(user: dict = Depends(get_current_user)):
        q = {} if user["role"] == "admin" else {"active": True, "archived": {"$ne": True}}
        proj = {"_id": 0} if user["role"] == "admin" else {"_id": 0, "pix_key": 0, "pix_key_type": 0, "pix_holder_name": 0, "phone": 0, "commission_pct": 0}
        return await db.barbers.find(q, proj).sort("name", 1).to_list(200)

    @r.get("/barbers/available/{d}")
    async def barbers_available(d: str, _: dict = Depends(get_current_user)):
        parse_date(d)
        return await available_barbers(db, d)

    @r.post("/barbers")
    async def create_barber(body: BarberBody, user: dict = Depends(require_admin)):
        doc = body.model_dump()
        doc["work_hours"] = [h.model_dump() for h in body.work_hours] if body.work_hours else default_work_hours()
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now_utc().isoformat()
        await db.barbers.insert_one(doc.copy())
        doc.pop("_id", None)
        await audit(user, "barber.create", "barber", doc["id"], None, {k: v for k, v in doc.items() if k != "pix_key"} | {"pix_key": "***" if doc.get("pix_key") else ""})
        return doc

    @r.put("/barbers/{bid}")
    async def update_barber(bid: str, body: BarberBody, user: dict = Depends(require_admin)):
        doc = body.model_dump()
        if body.work_hours is None:
            doc.pop("work_hours")
        else:
            doc["work_hours"] = [h.model_dump() for h in body.work_hours]
        before = await db.barbers.find_one({"id": bid}, {"_id": 0})
        if not before:
            raise HTTPException(404, "Barbeiro não encontrado")
        await db.barbers.update_one({"id": bid}, {"$set": doc})
        b = await db.barbers.find_one({"id": bid}, {"_id": 0})
        changed = {k: b.get(k) for k in doc if before.get(k) != b.get(k)}
        if changed:
            await audit(user, "barber.update", "barber", bid, {k: before.get(k) for k in changed}, changed)
        # keep denormalized name in sync
        await db.appointments.update_many({"barber_id": bid}, {"$set": {"barber_name": b["name"]}})
        await db.queue.update_many({"barber_id": bid}, {"$set": {"barber_name": b["name"]}})
        return b

    @r.patch("/barbers/{bid}/active")
    async def set_barber_active(bid: str, body: BarberActiveBody, user: dict = Depends(require_admin)):
        res = await db.barbers.update_one({"id": bid}, {"$set": {"active": body.active}})
        if res.matched_count == 0:
            raise HTTPException(404, "Barbeiro não encontrado")
        await audit(user, "barber.active", "barber", bid, {"active": not body.active}, {"active": body.active})
        return await db.barbers.find_one({"id": bid}, {"_id": 0})

    @r.delete("/barbers/{bid}")
    async def delete_barber(bid: str, user: dict = Depends(require_admin)):
        """Delete when safe; barbers with service history are archived (history preserved)."""
        b = await db.barbers.find_one({"id": bid}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Barbeiro não encontrado")
        used = await db.appointments.count_documents({"barber_id": bid}) + await db.queue.count_documents({"barber_id": bid})
        if used:
            await db.barbers.update_one({"id": bid}, {"$set": {"archived": True, "active": False}})
            await db.users.delete_many({"role": "barber", "barber_id": bid})
            await audit(user, "barber.archive", "barber", bid, {"archived": False}, {"archived": True, "active": False})
            return {"ok": True, "archived": True, "message": f"{b['name']} possui {used} atendimento(s) no histórico e foi arquivado em vez de excluído."}
        await db.barbers.delete_one({"id": bid})
        await db.barber_blocks.delete_many({"barber_id": bid})
        await db.barber_day_overrides.delete_many({"barber_id": bid})
        await db.users.delete_many({"role": "barber", "barber_id": bid})
        await audit(user, "barber.delete", "barber", bid, {"name": b["name"]}, None)
        return {"ok": True, "archived": False}

    # ---- blocks
    @r.post("/barbers/{bid}/blocks")
    async def add_block(bid: str, body: BarberBlockBody, _: dict = Depends(require_admin)):
        if not await db.barbers.find_one({"id": bid}):
            raise HTTPException(404, "Barbeiro não encontrado")
        doc = {**body.model_dump(), "id": str(uuid.uuid4()), "barber_id": bid}
        await db.barber_blocks.insert_one(doc.copy())
        doc.pop("_id", None)
        return doc

    @r.get("/barbers/{bid}/blocks")
    async def list_barber_blocks(bid: str, from_date: Optional[str] = None, _: dict = Depends(require_admin)):
        q = {"barber_id": bid}
        if from_date:
            q["date"] = {"$gte": from_date}
        return await db.barber_blocks.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(500)

    @r.delete("/barbers/blocks/{block_id}")
    async def delete_block(block_id: str, _: dict = Depends(require_admin)):
        await db.barber_blocks.delete_one({"id": block_id})
        return {"ok": True}

    # ---- day overrides (who works on a specific date)
    @r.put("/barbers/{bid}/day-override")
    async def set_day_override(bid: str, body: DayOverrideBody, _: dict = Depends(require_admin)):
        if not await db.barbers.find_one({"id": bid}):
            raise HTTPException(404, "Barbeiro não encontrado")
        doc = {**body.model_dump(), "barber_id": bid}
        await db.barber_day_overrides.update_one({"barber_id": bid, "date": body.date}, {"$set": doc}, upsert=True)
        return {k: v for k, v in doc.items() if k != "_id"}

    @r.delete("/barbers/{bid}/day-override/{d}")
    async def clear_day_override(bid: str, d: str, _: dict = Depends(require_admin)):
        await db.barber_day_overrides.delete_one({"barber_id": bid, "date": d})
        return {"ok": True}

    @r.get("/barbers/schedule/{d}")
    async def day_schedule(d: str, _: dict = Depends(require_admin)):
        """All barbers with working status for date d (admin daily staffing view)."""
        parse_date(d)
        out = []
        async for b in db.barbers.find({}, {"_id": 0}).sort("name", 1):
            ov = await db.barber_day_overrides.find_one({"barber_id": b["id"], "date": d}, {"_id": 0})
            w = await working_window(db, b, d)
            out.append({**b, "working": w is not None, "window": w, "override": ov})
        return out

    # ---- reports
    @r.get("/admin/reports/barbers")
    async def barber_reports(from_date: Optional[str] = None, to_date: Optional[str] = None, _: dict = Depends(require_admin)):
        q = {"status": "concluido"}
        if from_date or to_date:
            q["date"] = {}
            if from_date:
                q["date"]["$gte"] = from_date
            if to_date:
                q["date"]["$lte"] = to_date
        apts = await db.appointments.find(q, {"_id": 0}).to_list(5000)
        barbers = await db.barbers.find({}, {"_id": 0}).to_list(200)
        by_id = {b["id"]: b for b in barbers}
        stats: dict = {}
        for a in apts:
            bid = a.get("barber_id") or "sem_barbeiro"
            s = stats.setdefault(bid, {
                "barber_id": bid,
                "barber_name": a.get("barber_name") or by_id.get(bid, {}).get("name") or "Sem barbeiro",
                "active": by_id.get(bid, {}).get("active", False),
                "commission_pct": by_id.get(bid, {}).get("commission_pct"),
                "atendimentos": 0, "clientes": set(), "faturamento": 0.0, "cortes_mensal": 0, "servicos": {},
            })
            s["atendimentos"] += 1
            s["clientes"].add(a["user_id"])
            s["faturamento"] += float(a.get("price", 0) or 0)
            if a.get("used_mensal"):
                s["cortes_mensal"] += 1
            s["servicos"][a["service_name"]] = s["servicos"].get(a["service_name"], 0) + 1
        for b in barbers:  # include barbers with zero activity
            stats.setdefault(b["id"], {
                "barber_id": b["id"], "barber_name": b["name"], "active": b.get("active", True),
                "commission_pct": b.get("commission_pct"),
                "atendimentos": 0, "clientes": set(), "faturamento": 0.0, "cortes_mensal": 0, "servicos": {},
            })
        out = []
        for s in stats.values():
            pct = s.get("commission_pct")
            out.append({
                **s,
                "clientes": len(s["clientes"]),
                "servicos": [{"name": k, "count": v} for k, v in sorted(s["servicos"].items(), key=lambda kv: -kv[1])],
                "comissao_estimada": round(s["faturamento"] * pct / 100, 2) if pct else None,
            })
        out.sort(key=lambda x: (-x["atendimentos"], x["barber_name"]))
        return {"from": from_date, "to": to_date, "barbers": out}

    return r
