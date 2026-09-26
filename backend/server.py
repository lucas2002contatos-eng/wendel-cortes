"""WENDEL CORTES - Backend API
Complete barbershop management: auth, services, agenda, queue, monthly subscription, payments, push.
"""
import os
import logging
import uuid
from datetime import datetime, timedelta, timezone, date, time as dtime
from pathlib import Path
from typing import Optional, List, Literal

import bcrypt
import httpx
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
PUSH_BASE_URL = "https://integrations.emergentagent.com"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Wendel Cortes API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("wendel")

_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


# =============================== helpers =====================================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


async def send_push(recipients: List[str], data: dict) -> None:
    if not recipients:
        return
    try:
        payload = {"recipients": recipients, "data": data}
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code >= 400:
            logger.warning(f"push send failed {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"push error: {e}")


# =============================== models ======================================
class RegisterBody(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ServiceBody(BaseModel):
    name: str
    description: Optional[str] = ""
    price: float
    duration_min: int = 30
    active: bool = True


class AppointmentBody(BaseModel):
    service_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    payment_method: Literal["pix", "cartao", "dinheiro", "mensal"]


class UpdateStatusBody(BaseModel):
    status: Literal[
        "agendado", "pagamento_pendente", "pago", "cliente_chegou",
        "em_atendimento", "concluido", "cancelado", "nao_compareceu"
    ]


class QueueJoinBody(BaseModel):
    service_id: str


class DayConfigBody(BaseModel):
    weekday: int  # 0=Mon..6=Sun
    mode: Literal["agenda", "fila", "fechado"]
    open_time: Optional[str] = "09:00"
    close_time: Optional[str] = "20:00"


class BlockedSlotBody(BaseModel):
    date: str
    time: str
    reason: Optional[str] = ""


class SubscriptionCreateBody(BaseModel):
    payment_method: Literal["pix", "cartao", "dinheiro"]


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


class CancelPolicyBody(BaseModel):
    hours: int


# =============================== auth =========================================
@api.post("/auth/register")
async def register(body: RegisterBody):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "E-mail já cadastrado")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "name": body.name,
        "phone": body.phone,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "role": "client",
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    token = make_token(uid, "client")
    return {"token": token, "user": {k: v for k, v in doc.items() if k != "password_hash" and k != "_id"}}


@api.post("/auth/login")
async def login(body: LoginBody):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Credenciais inválidas")
    token = make_token(u["id"], u["role"])
    u.pop("_id", None); u.pop("password_hash", None)
    return {"token": token, "user": u}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# =============================== services ====================================
@api.get("/services")
async def list_services(user: dict = Depends(get_current_user)):
    items = await db.services.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    if user["role"] != "admin":
        items = [s for s in items if s.get("active", True)]
    return items


@api.post("/services")
async def create_service(body: ServiceBody, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_utc().isoformat()
    await db.services.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.put("/services/{sid}")
async def update_service(sid: str, body: ServiceBody, _: dict = Depends(require_admin)):
    r = await db.services.update_one({"id": sid}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Serviço não encontrado")
    return await db.services.find_one({"id": sid}, {"_id": 0})


@api.delete("/services/{sid}")
async def delete_service(sid: str, _: dict = Depends(require_admin)):
    await db.services.delete_one({"id": sid})
    return {"ok": True}


# =============================== settings ====================================
@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"id": "main"}, {"_id": 0})
    if not s:
        s = {
            "id": "main",
            "cancel_hours": 2,
            "monthly_price": 89.90,
            "monthly_cuts": 4,
            "days": [
                {"weekday": 0, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 1, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 2, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 3, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 4, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 5, "mode": "fila", "open_time": "09:00", "close_time": "18:00"},
                {"weekday": 6, "mode": "fechado", "open_time": "09:00", "close_time": "18:00"},
            ],
        }
        await db.settings.insert_one(s.copy())
        s.pop("_id", None)
    return s


@api.put("/settings/day")
async def update_day(body: DayConfigBody, _: dict = Depends(require_admin)):
    await db.settings.update_one({"id": "main"}, {"$pull": {"days": {"weekday": body.weekday}}})
    await db.settings.update_one({"id": "main"}, {"$push": {"days": body.model_dump()}})
    return await db.settings.find_one({"id": "main"}, {"_id": 0})


@api.put("/settings/cancel-hours")
async def update_cancel_hours(body: CancelPolicyBody, _: dict = Depends(require_admin)):
    await db.settings.update_one({"id": "main"}, {"$set": {"cancel_hours": body.hours}})
    return {"ok": True}


@api.post("/settings/block")
async def block_slot(body: BlockedSlotBody, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    await db.blocked_slots.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/settings/blocks/{d}")
async def list_blocks(d: str, _: dict = Depends(require_admin)):
    return await db.blocked_slots.find({"date": d}, {"_id": 0}).to_list(500)


# =============================== agenda / appointments =======================
def gen_slots(open_t: str, close_t: str, duration_min: int) -> List[str]:
    fmt = "%H:%M"
    o = datetime.strptime(open_t, fmt)
    c = datetime.strptime(close_t, fmt)
    slots = []
    cur = o
    while cur + timedelta(minutes=duration_min) <= c:
        slots.append(cur.strftime(fmt))
        cur += timedelta(minutes=duration_min)
    return slots


@api.get("/agenda/available/{d}")
async def available_slots(d: str, service_id: str, user: dict = Depends(get_current_user)):
    """Return available time slots for date d and service."""
    try:
        dobj = datetime.strptime(d, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(400, "Data inválida")
    wd = dobj.weekday()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    if not day_cfg or day_cfg["mode"] != "agenda":
        return {"mode": day_cfg["mode"] if day_cfg else "fechado", "slots": []}
    svc = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    all_slots = gen_slots(day_cfg["open_time"], day_cfg["close_time"], svc["duration_min"])
    booked = await db.appointments.find(
        {"date": d, "status": {"$nin": ["cancelado", "nao_compareceu"]}}, {"_id": 0, "time": 1}
    ).to_list(500)
    blocked = await db.blocked_slots.find({"date": d}, {"_id": 0, "time": 1}).to_list(200)
    taken = {b["time"] for b in booked} | {b["time"] for b in blocked}
    avail = [s for s in all_slots if s not in taken]
    return {"mode": "agenda", "slots": avail}


@api.post("/appointments")
async def create_appointment(body: AppointmentBody, user: dict = Depends(get_current_user)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    # Check slot free
    existing = await db.appointments.find_one({
        "date": body.date, "time": body.time,
        "status": {"$nin": ["cancelado", "nao_compareceu"]}
    })
    if existing:
        raise HTTPException(409, "Horário já ocupado")
    blocked = await db.blocked_slots.find_one({"date": body.date, "time": body.time})
    if blocked:
        raise HTTPException(409, "Horário bloqueado")

    used_mensal = False
    if body.payment_method == "mensal":
        sub = await active_subscription(user["id"])
        if not sub:
            raise HTTPException(400, "Assinatura Cliente Mensal não está ativa")
        if sub["cuts_used"] >= sub["cuts_total"]:
            raise HTTPException(400, "Você já utilizou todos os cortes do ciclo atual")
        used_mensal = True

    status = "pago" if body.payment_method == "mensal" else (
        "pagamento_pendente" if body.payment_method == "dinheiro" else "pagamento_pendente"
    )
    apt = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "service_id": svc["id"],
        "service_name": svc["name"],
        "price": 0 if used_mensal else svc["price"],
        "date": body.date,
        "time": body.time,
        "duration_min": svc["duration_min"],
        "payment_method": body.payment_method,
        "status": status,
        "used_mensal": used_mensal,
        "created_at": now_utc().isoformat(),
    }
    await db.appointments.insert_one(apt.copy())
    if used_mensal:
        await consume_monthly_cut(user["id"], apt["id"])
    apt.pop("_id", None)
    await send_push([user["id"]], {"title": "Agendamento confirmado", "message": f"{svc['name']} em {body.date} às {body.time}"})
    return apt


@api.get("/appointments/me")
async def my_appointments(user: dict = Depends(get_current_user)):
    items = await db.appointments.find({"user_id": user["id"]}, {"_id": 0}).sort([("date", -1), ("time", -1)]).to_list(500)
    return items


@api.get("/appointments")
async def list_appointments(date: Optional[str] = None, _: dict = Depends(require_admin)):
    q = {}
    if date:
        q["date"] = date
    items = await db.appointments.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return items


@api.put("/appointments/{aid}/status")
async def update_appointment_status(aid: str, body: UpdateStatusBody, _: dict = Depends(require_admin)):
    r = await db.appointments.update_one({"id": aid}, {"$set": {"status": body.status}})
    if r.matched_count == 0:
        raise HTTPException(404, "Não encontrado")
    apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    await send_push([apt["user_id"]], {"title": "Atualização do agendamento", "message": f"Status: {body.status}"})
    return apt


@api.post("/appointments/{aid}/cancel")
async def cancel_appointment(aid: str, user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Não encontrado")
    if user["role"] != "admin" and apt["user_id"] != user["id"]:
        raise HTTPException(403, "Não autorizado")
    if user["role"] != "admin":
        settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
        hrs = settings.get("cancel_hours", 2)
        apt_dt = datetime.strptime(f"{apt['date']} {apt['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone(timedelta(hours=-3)))
        if apt_dt - now_utc() < timedelta(hours=hrs):
            raise HTTPException(400, f"Cancelamento permitido até {hrs}h antes do horário")
    await db.appointments.update_one({"id": aid}, {"$set": {"status": "cancelado"}})
    if apt.get("used_mensal"):
        await db.subscriptions.update_one(
            {"user_id": apt["user_id"], "status": "active"},
            {"$inc": {"cuts_used": -1}, "$pull": {"usage_history": {"appointment_id": aid}}},
        )
    return {"ok": True}


# =============================== monthly subscription =======================
async def active_subscription(user_id: str) -> Optional[dict]:
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": "active"}, {"_id": 0})
    if not sub:
        return None
    end = datetime.fromisoformat(sub["period_end"])
    if end < now_utc():
        await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
        return None
    return sub


async def consume_monthly_cut(user_id: str, appointment_id: str):
    sub = await active_subscription(user_id)
    if not sub:
        return
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$inc": {"cuts_used": 1}, "$push": {"usage_history": {"appointment_id": appointment_id, "at": now_utc().isoformat()}}},
    )


@api.post("/subscription")
async def create_subscription(body: SubscriptionCreateBody, user: dict = Depends(get_current_user)):
    existing = await active_subscription(user["id"])
    if existing:
        raise HTTPException(400, "Você já possui uma assinatura ativa")
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    price = settings.get("monthly_price", 89.90)
    cuts = settings.get("monthly_cuts", 4)
    status = "active" if body.payment_method in ("pix", "cartao") else "pending_payment"
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "price": price,
        "cuts_total": cuts,
        "cuts_used": 0,
        "payment_method": body.payment_method,
        "status": status,
        "period_start": now_utc().isoformat(),
        "period_end": (now_utc() + timedelta(days=30)).isoformat(),
        "usage_history": [],
        "created_at": now_utc().isoformat(),
    }
    await db.subscriptions.insert_one(sub.copy())
    sub.pop("_id", None)
    if status == "active":
        await send_push([user["id"]], {"title": "Assinatura ativada", "message": "Cliente Mensal ativo! 4 cortes disponíveis."})
    return sub


@api.get("/subscription/me")
async def my_subscription(user: dict = Depends(get_current_user)):
    sub = await db.subscriptions.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if not sub:
        return None
    # refresh status if expired
    if sub["status"] == "active":
        end = datetime.fromisoformat(sub["period_end"])
        if end < now_utc():
            await db.subscriptions.update_one({"id": sub["id"]}, {"$set": {"status": "expired"}})
            sub["status"] = "expired"
    return sub


@api.put("/subscription/{sid}/mark-paid")
async def mark_sub_paid(sid: str, _: dict = Depends(require_admin)):
    await db.subscriptions.update_one({"id": sid}, {"$set": {"status": "active"}})
    return {"ok": True}


@api.get("/admin/subscriptions")
async def list_subscriptions(_: dict = Depends(require_admin)):
    subs = await db.subscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return subs


# =============================== queue ========================================
@api.get("/queue/today")
async def queue_today(user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    wd = date.today().weekday()
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    mode = day_cfg["mode"] if day_cfg else "fechado"
    entries = await db.queue.find(
        {"date": today, "status": {"$in": ["aguardando", "chamado", "em_atendimento"]}},
        {"_id": 0},
    ).sort("joined_at", 1).to_list(200)
    my_entry = next((e for e in entries if e["user_id"] == user["id"]), None)
    my_pos = None
    if my_entry:
        waiting = [e for e in entries if e["status"] == "aguardando"]
        for i, e in enumerate(waiting):
            if e["user_id"] == user["id"]:
                my_pos = i + 1
                break
    return {"mode": mode, "entries": entries, "my_entry": my_entry, "my_position": my_pos, "total_waiting": len([e for e in entries if e["status"] == "aguardando"])}


@api.post("/queue/join")
async def join_queue(body: QueueJoinBody, user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    wd = date.today().weekday()
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    if not day_cfg or day_cfg["mode"] != "fila":
        raise HTTPException(400, "Fila não está ativa hoje")
    dup = await db.queue.find_one({
        "user_id": user["id"], "date": today,
        "status": {"$in": ["aguardando", "chamado", "em_atendimento"]}
    })
    if dup:
        raise HTTPException(400, "Você já está na fila")
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "service_id": svc["id"],
        "service_name": svc["name"],
        "date": today,
        "status": "aguardando",
        "joined_at": now_utc().isoformat(),
    }
    await db.queue.insert_one(entry.copy())
    entry.pop("_id", None)
    await send_push([user["id"]], {"title": "Você entrou na fila", "message": f"Aguarde ser chamado para {svc['name']}"})
    return entry


@api.post("/queue/{qid}/leave")
async def leave_queue(qid: str, user: dict = Depends(get_current_user)):
    e = await db.queue.find_one({"id": qid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Não encontrado")
    if user["role"] != "admin" and e["user_id"] != user["id"]:
        raise HTTPException(403, "Não autorizado")
    await db.queue.update_one({"id": qid}, {"$set": {"status": "cancelado"}})
    return {"ok": True}


@api.post("/queue/{qid}/call")
async def call_queue(qid: str, _: dict = Depends(require_admin)):
    e = await db.queue.find_one({"id": qid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Não encontrado")
    await db.queue.update_one({"id": qid}, {"$set": {"status": "chamado", "called_at": now_utc().isoformat()}})
    await send_push([e["user_id"]], {"title": "É a sua vez!", "message": "O barbeiro está pronto para atendê-lo."})
    return {"ok": True}


@api.post("/queue/{qid}/start")
async def start_queue(qid: str, _: dict = Depends(require_admin)):
    await db.queue.update_one({"id": qid}, {"$set": {"status": "em_atendimento", "started_at": now_utc().isoformat()}})
    return {"ok": True}


class CompleteQueueBody(BaseModel):
    use_mensal: bool = False


@api.post("/queue/{qid}/complete")
async def complete_queue(qid: str, body: CompleteQueueBody, _: dict = Depends(require_admin)):
    e = await db.queue.find_one({"id": qid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Não encontrado")
    used_mensal = False
    if body.use_mensal:
        sub = await active_subscription(e["user_id"])
        if sub and sub["cuts_used"] < sub["cuts_total"]:
            used_mensal = True
    svc = await db.services.find_one({"id": e["service_id"]}, {"_id": 0}) or {"price": 0}
    apt = {
        "id": str(uuid.uuid4()),
        "user_id": e["user_id"],
        "client_name": e["client_name"],
        "client_phone": e["client_phone"],
        "service_id": e["service_id"],
        "service_name": e["service_name"],
        "price": 0 if used_mensal else svc.get("price", 0),
        "date": e["date"],
        "time": now_utc().strftime("%H:%M"),
        "duration_min": svc.get("duration_min", 30),
        "payment_method": "mensal" if used_mensal else "dinheiro",
        "status": "concluido",
        "used_mensal": used_mensal,
        "from_queue": True,
        "created_at": now_utc().isoformat(),
    }
    await db.appointments.insert_one(apt.copy())
    if used_mensal:
        await consume_monthly_cut(e["user_id"], apt["id"])
    await db.queue.update_one({"id": qid}, {"$set": {"status": "concluido", "completed_at": now_utc().isoformat()}})
    return {"ok": True}


@api.post("/queue/{qid}/noshow")
async def noshow_queue(qid: str, _: dict = Depends(require_admin)):
    await db.queue.update_one({"id": qid}, {"$set": {"status": "nao_compareceu"}})
    return {"ok": True}


# =============================== payments / dashboard =======================
@api.get("/admin/dashboard")
async def admin_dashboard(_: dict = Depends(require_admin)):
    today = date.today().isoformat()
    apts = await db.appointments.find({"date": today}, {"_id": 0}).to_list(500)
    done = [a for a in apts if a["status"] == "concluido"]
    pending_pay = [a for a in apts if a["status"] == "pagamento_pendente"]
    revenue = sum(a.get("price", 0) for a in done)
    q = await db.queue.find({"date": today, "status": {"$in": ["aguardando", "chamado", "em_atendimento"]}}, {"_id": 0}).to_list(200)
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    return {
        "date": today,
        "appointments_total": len(apts),
        "appointments_done": len(done),
        "queue_waiting": len(q),
        "revenue_today": revenue,
        "pending_payments": len(pending_pay),
        "active_subscriptions": active_subs,
        "upcoming": sorted([a for a in apts if a["status"] in ["agendado", "pago", "pagamento_pendente"]], key=lambda x: x["time"])[:10],
    }


@api.get("/admin/clients")
async def list_clients(_: dict = Depends(require_admin)):
    users = await db.users.find({"role": "client"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api.get("/admin/finance")
async def finance(_: dict = Depends(require_admin)):
    today = date.today().isoformat()
    week_ago = (date.today() - timedelta(days=7)).isoformat()
    month_ago = (date.today() - timedelta(days=30)).isoformat()
    all_apts = await db.appointments.find({"status": {"$in": ["pago", "concluido"]}}, {"_id": 0}).to_list(2000)
    def sum_since(since):
        return sum(a.get("price", 0) for a in all_apts if a["date"] >= since)
    by_method = {"pix": 0.0, "cartao": 0.0, "dinheiro": 0.0, "mensal": 0.0}
    for a in all_apts:
        by_method[a.get("payment_method", "dinheiro")] = by_method.get(a.get("payment_method", "dinheiro"), 0) + a.get("price", 0)
    return {
        "today": sum_since(today),
        "week": sum_since(week_ago),
        "month": sum_since(month_ago),
        "by_method": by_method,
        "active_subscriptions": await db.subscriptions.count_documents({"status": "active"}),
    }


# =============================== push registration =========================
@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"push register failed: {e}")
    return {"status": "registered"}


# =============================== seed =========================================
@api.post("/seed")
async def seed():
    """Idempotent demo data seed."""
    # admin
    admin = await db.users.find_one({"email": "admin@wendelcortes.com"})
    if not admin:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id, "name": "Wendel Cortes", "phone": "11999999999",
            "email": "admin@wendelcortes.com", "password_hash": hash_password("admin123"),
            "role": "admin", "created_at": now_utc().isoformat(),
        })

    # settings
    if not await db.settings.find_one({"id": "main"}):
        await db.settings.insert_one({
            "id": "main",
            "cancel_hours": 2, "monthly_price": 89.90, "monthly_cuts": 4,
            "days": [
                {"weekday": 0, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 1, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 2, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 3, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 4, "mode": "agenda", "open_time": "09:00", "close_time": "20:00"},
                {"weekday": 5, "mode": "fila", "open_time": "09:00", "close_time": "18:00"},
                {"weekday": 6, "mode": "fechado", "open_time": "09:00", "close_time": "18:00"},
            ],
        })

    # services
    default_services = [
        {"name": "Alisante", "description": "Alisamento capilar profissional", "price": 120.0, "duration_min": 60},
        {"name": "Barba", "description": "Aparo e desenho de barba", "price": 35.0, "duration_min": 30},
        {"name": "Corte", "description": "Corte masculino clássico ou moderno", "price": 45.0, "duration_min": 30},
        {"name": "Corte + Barba", "description": "Combo corte e barba", "price": 70.0, "duration_min": 60},
        {"name": "Limpeza de Pele", "description": "Limpeza facial detox", "price": 90.0, "duration_min": 45},
        {"name": "Progressiva", "description": "Progressiva masculina", "price": 150.0, "duration_min": 90},
        {"name": "Sobrancelha", "description": "Design de sobrancelha", "price": 25.0, "duration_min": 15},
    ]
    for s in default_services:
        if not await db.services.find_one({"name": s["name"]}):
            doc = {**s, "id": str(uuid.uuid4()), "active": True, "created_at": now_utc().isoformat()}
            await db.services.insert_one(doc)

    # sample clients
    sample_clients = [
        ("Carlos Silva", "11987654321", "carlos@test.com"),
        ("João Pereira", "11988887777", "joao@test.com"),
        ("Rafael Costa", "11966665555", "rafael@test.com"),
        ("Marcos Souza", "11955554444", "marcos@test.com"),
        ("Lucas Almeida", "11944443333", "lucas@test.com"),
    ]
    client_ids = []
    for n, p, e in sample_clients:
        u = await db.users.find_one({"email": e})
        if not u:
            uid = str(uuid.uuid4())
            await db.users.insert_one({
                "id": uid, "name": n, "phone": p, "email": e,
                "password_hash": hash_password("cliente123"),
                "role": "client", "created_at": now_utc().isoformat(),
            })
            client_ids.append((uid, n, p))
        else:
            client_ids.append((u["id"], u["name"], u["phone"]))

    # subscriptions with varying cuts_used
    for i, (uid, n, p) in enumerate(client_ids):
        if await db.subscriptions.find_one({"user_id": uid}):
            continue
        cuts_used = i  # 0,1,2,3,4
        status = "active" if i < 4 else "active"  # all active but varying cuts
        if i == 4:
            status = "pending_payment"
        await db.subscriptions.insert_one({
            "id": str(uuid.uuid4()), "user_id": uid, "client_name": n, "client_phone": p,
            "price": 89.90, "cuts_total": 4, "cuts_used": min(cuts_used, 4),
            "payment_method": "pix", "status": status,
            "period_start": now_utc().isoformat(),
            "period_end": (now_utc() + timedelta(days=30)).isoformat(),
            "usage_history": [], "created_at": now_utc().isoformat(),
        })

    # sample appointments today (agenda mode weekdays)
    corte = await db.services.find_one({"name": "Corte"})
    barba = await db.services.find_one({"name": "Barba"})
    today = date.today().isoformat()
    if corte and client_ids and not await db.appointments.find_one({"date": today}):
        sample_apts = [
            (client_ids[0], corte, "10:00", "pago", "pix"),
            (client_ids[1], barba, "10:30", "pagamento_pendente", "dinheiro"),
            (client_ids[2], corte, "11:00", "concluido", "cartao"),
        ]
        for (uid, n, p), svc, t, st, pm in sample_apts:
            await db.appointments.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid, "client_name": n, "client_phone": p,
                "service_id": svc["id"], "service_name": svc["name"],
                "price": svc["price"], "date": today, "time": t,
                "duration_min": svc["duration_min"], "payment_method": pm,
                "status": st, "used_mensal": False,
                "created_at": now_utc().isoformat(),
            })

    # sample queue entries (for demo, add to today's queue)
    if corte and client_ids and not await db.queue.find_one({"date": today}):
        for i, (uid, n, p) in enumerate(client_ids[:4]):
            await db.queue.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid, "client_name": n, "client_phone": p,
                "service_id": corte["id"], "service_name": corte["name"],
                "date": today, "status": "aguardando",
                "joined_at": (now_utc() + timedelta(seconds=i)).isoformat(),
            })

    return {"ok": True, "admin_email": "admin@wendelcortes.com"}


# =============================== boot =========================================
@api.get("/")
async def root():
    return {"app": "Wendel Cortes API", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await seed()
        logger.info("Seed OK")
    except Exception as e:
        logger.warning(f"Seed error: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
    await _push_client.aclose()
