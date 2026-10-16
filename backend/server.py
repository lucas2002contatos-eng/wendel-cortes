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
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from barbers import make_barbers_router, available_barbers, barber_free_slots, is_barber_slot_free
from admin_config import make_config_router, pix_for_appointment, pix_for_subscription, DEFAULT_PLAN, DEFAULT_PIX, DEFAULT_GENERAL

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET ausente ou muito curto (mínimo 32 caracteres). Defina um valor aleatório forte em backend/.env")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")  # usado só na primeira criação do admin
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "false").lower() == "true"  # contas/dados de demonstração
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
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
    payload = {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


# --- simple in-memory brute-force protection for /auth/login (per IP and per e-mail)
LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW = timedelta(minutes=15)
_login_failures: dict = {}


def _login_blocked(key: str) -> bool:
    rec = _login_failures.get(key)
    if not rec:
        return False
    count, first = rec
    if now_utc() - first > LOGIN_WINDOW:
        _login_failures.pop(key, None)
        return False
    return count >= LOGIN_MAX_FAILURES


def _login_failed(key: str) -> None:
    count, first = _login_failures.get(key, (0, now_utc()))
    if now_utc() - first > LOGIN_WINDOW:
        count, first = 0, now_utc()
    _login_failures[key] = (count + 1, first)


def parse_date_or_400(d: str) -> date:
    try:
        return datetime.strptime(d, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(400, "Data inválida (use AAAA-MM-DD)")


def validate_time_or_400(t: str) -> str:
    try:
        datetime.strptime(t, "%H:%M")
    except (ValueError, TypeError):
        raise HTTPException(400, "Horário inválido (use HH:MM)")
    return t


def public_queue_entry(e: dict, viewer_id: str) -> dict:
    """Queue entry as seen by a client: own entry complete, others anonymized (no phone/user_id)."""
    if e["user_id"] == viewer_id:
        return e
    parts = (e.get("client_name") or "").split()
    short = parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "") if parts else "Cliente"
    return {k: v for k, v in {**e, "client_name": short}.items() if k not in ("client_phone", "user_id")}


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
        raise HTTPException(403, "Apenas o Administrador Fundador pode realizar esta ação")
    return user


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    """Admin (founder) or barber. Barbers are scoped to their own barber_id by the endpoints."""
    if user.get("role") not in ("admin", "barber"):
        raise HTTPException(403, "Acesso restrito à equipe")
    return user


def barber_scope(user: dict) -> Optional[str]:
    return user.get("barber_id") if user.get("role") == "barber" else None


async def audit(user: dict, action: str, entity: str, entity_id: str, before, after) -> None:
    """Persist an administrative change (who / when / what / before / after)."""
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "at": now_utc().isoformat(),
        "user_id": user.get("id"), "user_name": user.get("name"), "role": user.get("role"),
        "action": action, "entity": entity, "entity_id": entity_id, "before": before, "after": after,
    })


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
    price: float = Field(ge=0)
    duration_min: int = Field(30, ge=5, le=480)
    active: bool = True
    archived: bool = False
    image_url: Optional[str] = ""


class AppointmentBody(BaseModel):
    service_id: str
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    payment_method: Literal["pix", "cartao", "dinheiro", "mensal"]
    barber_id: Optional[str] = None  # None/"any" = qualquer barbeiro


class UpdateStatusBody(BaseModel):
    status: Literal[
        "agendado", "pagamento_pendente", "pago", "cliente_chegou",
        "em_atendimento", "concluido", "cancelado", "nao_compareceu"
    ]


class QueueJoinBody(BaseModel):
    service_id: str
    barber_id: Optional[str] = None  # None/"any" = fila mais curta


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
    plan_id: Optional[str] = None  # which monthly plan (None = cheapest active plan)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


class CancelPolicyBody(BaseModel):
    hours: int


class ShopInfoBody(BaseModel):
    name: Optional[str] = "WENDEL CORTES"
    whatsapp: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    instagram: Optional[str] = ""
    about: Optional[str] = ""


DEFAULT_SHOP = {
    "name": "WENDEL CORTES",
    "whatsapp": "5511999999999",
    "phone": "",
    "address": "",
    "instagram": "",
    "about": "Barbearia especializada em cortes clássicos e modernos, barba e cuidados masculinos.",
}


# =============================== auth =========================================
@api.post("/auth/register")
async def register(body: RegisterBody):
    if len(body.password) < 6:
        raise HTTPException(400, "A senha deve ter pelo menos 6 caracteres")
    if await db.users.find_one({"email": body.email.lower()}):
        # neutral message to avoid account enumeration
        raise HTTPException(400, "Não foi possível criar a conta com estes dados. Se você já tem cadastro, faça login.")
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
async def login(body: LoginBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    email = body.email.lower()
    if _login_blocked(f"ip:{ip}") or _login_blocked(f"email:{email}"):
        raise HTTPException(429, "Muitas tentativas. Tente novamente em 15 minutos.")
    u = await db.users.find_one({"email": email})
    if not u or not verify_password(body.password, u["password_hash"]):
        _login_failed(f"ip:{ip}"); _login_failed(f"email:{email}")
        raise HTTPException(401, "Credenciais inválidas")
    _login_failures.pop(f"ip:{ip}", None); _login_failures.pop(f"email:{email}", None)
    token = make_token(u["id"], u["role"])
    u.pop("_id", None); u.pop("password_hash", None)
    return {"token": token, "user": u}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class ProfileBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=8, max_length=20)


@api.put("/auth/me")
async def update_me(body: ProfileBody, user: dict = Depends(get_current_user)):
    """Clients/staff edit only their own allowed data (name and phone)."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name.strip(), "phone": body.phone.strip()}})
    await db.appointments.update_many({"user_id": user["id"], "status": {"$nin": ["concluido", "cancelado", "nao_compareceu"]}}, {"$set": {"client_name": body.name.strip(), "client_phone": body.phone.strip()}})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})


class PasswordBody(BaseModel):
    new_password: str = Field(min_length=6, max_length=72)


@api.put("/auth/password")
async def change_password(body: PasswordBody, user: dict = Depends(require_admin)):
    """Admin changes own password (already authenticated — no current password required)."""
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await audit(user, "senha_alterada", "user", user["id"], None, {"email": user.get("email")})
    return {"ok": True}


# =============================== services ====================================
@api.get("/services")
async def list_services(user: dict = Depends(get_current_user)):
    items = await db.services.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    if user["role"] != "admin":
        items = [s for s in items if s.get("active", True) and not s.get("archived")]
    return items


@api.post("/services")
async def create_service(body: ServiceBody, user: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_utc().isoformat()
    await db.services.insert_one(doc.copy())
    doc.pop("_id", None)
    await audit(user, "service.create", "service", doc["id"], None, doc)
    return doc


@api.put("/services/{sid}")
async def update_service(sid: str, body: ServiceBody, user: dict = Depends(require_admin)):
    before = await db.services.find_one({"id": sid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Serviço não encontrado")
    await db.services.update_one({"id": sid}, {"$set": body.model_dump()})
    after = await db.services.find_one({"id": sid}, {"_id": 0})
    changed = {k: after.get(k) for k in body.model_dump() if before.get(k) != after.get(k)}
    if changed:
        await audit(user, "service.update", "service", sid, {k: before.get(k) for k in changed}, changed)
    return after


@api.delete("/services/{sid}")
async def delete_service(sid: str, user: dict = Depends(require_admin)):
    """Delete when safe; services with history are archived instead (history preserved)."""
    svc = await db.services.find_one({"id": sid}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    used = await db.appointments.count_documents({"service_id": sid})
    if used:
        await db.services.update_one({"id": sid}, {"$set": {"archived": True, "active": False}})
        await audit(user, "service.archive", "service", sid, svc, {"archived": True, "active": False})
        return {"ok": True, "archived": True, "message": f"Serviço possui {used} atendimento(s) no histórico e foi arquivado em vez de excluído."}
    await db.services.delete_one({"id": sid})
    await audit(user, "service.delete", "service", sid, svc, None)
    return {"ok": True, "archived": False}


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
    s["shop"] = {**DEFAULT_SHOP, **(s.get("shop") or {})}
    s["plan"] = {**DEFAULT_PLAN, **(s.get("plan") or {})}
    s["general"] = {**DEFAULT_GENERAL, **(s.get("general") or {})}
    pix = {**DEFAULT_PIX, **(s.get("pix") or {})}
    if user["role"] != "admin":  # key is sensitive config: staff/clients only see the mode
        pix = {"mode": pix["mode"], "configured": bool(pix["key"])}
    s["pix"] = pix
    return s


@api.put("/settings/shop")
async def update_shop_info(body: ShopInfoBody, user: dict = Depends(require_admin)):
    s = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    before = {**DEFAULT_SHOP, **(s.get("shop") or {})}
    shop = body.model_dump()
    shop["whatsapp"] = "".join(ch for ch in shop["whatsapp"] if ch.isdigit())
    if len(shop["whatsapp"]) < 10:
        raise HTTPException(400, "Número de WhatsApp inválido (use DDD + número)")
    if len(shop["whatsapp"]) <= 11:
        shop["whatsapp"] = "55" + shop["whatsapp"]
    await db.settings.update_one({"id": "main"}, {"$set": {"shop": shop}}, upsert=True)
    await audit(user, "shop.update", "settings", "main", before, shop)
    return shop


@api.get("/public/info")
async def public_info():
    """Public barbershop info for the landing page (no auth)."""
    s = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    services = await db.services.find({"active": {"$ne": False}, "archived": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "description": 1, "price": 1, "duration_min": 1, "image_url": 1}).sort("name", 1).to_list(200)
    days = sorted(s.get("days", []), key=lambda d: d["weekday"])
    shop = {**DEFAULT_SHOP, **(s.get("shop") or {})}
    plan = {**DEFAULT_PLAN, **(s.get("plan") or {})}
    plans = await db.plans.find({"active": True, "archived": {"$ne": True}}, {"_id": 0}).sort("price", 1).to_list(100)
    branding = s.get("branding") or {}
    return {
        "name": shop.get("name") or "WENDEL CORTES",
        "shop": shop,
        "days": days,
        "monthly_price": plan["price"],
        "monthly_cuts": plan["cuts"],
        "plan": plan,
        "plans": plans,
        "services": services,
        "general": {**DEFAULT_GENERAL, **(s.get("general") or {})},
        "pix_mode": ({**DEFAULT_PIX, **(s.get("pix") or {})})["mode"],
        "branding": {k: {"version": v.get("version"), "url": f"/api/public/branding/{k}?id={v.get('asset_id')}"} for k, v in branding.items()},
    }


@api.put("/settings/day")
async def update_day(body: DayConfigBody, user: dict = Depends(require_admin)):
    s = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    before = next((d for d in s.get("days", []) if d["weekday"] == body.weekday), None)
    await db.settings.update_one({"id": "main"}, {"$pull": {"days": {"weekday": body.weekday}}})
    await db.settings.update_one({"id": "main"}, {"$push": {"days": body.model_dump()}})
    await audit(user, "hours.day.update", "settings", f"day:{body.weekday}", before, body.model_dump())
    return await db.settings.find_one({"id": "main"}, {"_id": 0})


@api.put("/settings/cancel-hours")
async def update_cancel_hours(body: CancelPolicyBody, user: dict = Depends(require_admin)):
    s = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    await db.settings.update_one({"id": "main"}, {"$set": {"cancel_hours": body.hours}})
    await audit(user, "cancel_hours.update", "settings", "main", {"cancel_hours": s.get("cancel_hours")}, {"cancel_hours": body.hours})
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
@api.get("/agenda/available/{d}")
async def available_slots(d: str, service_id: str, barber_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Available slots for date d and service. barber_id=None/'any' → union across working barbers
    (each slot tells which barber will attend)."""
    try:
        dobj = datetime.strptime(d, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(400, "Data inválida")
    wd = dobj.weekday()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    if not day_cfg or day_cfg["mode"] != "agenda":
        return {"mode": day_cfg["mode"] if day_cfg else "fechado", "slots": [], "barbers": []}
    svc = await db.services.find_one({"id": service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    barbers = await available_barbers(db, d)
    if barber_id and barber_id != "any":
        barbers = [b for b in barbers if b["id"] == barber_id]
    # per-slot: pick the barber with fewer appointments that day (simple load balancing)
    load = {}
    for b in barbers:
        load[b["id"]] = await db.appointments.count_documents({"barber_id": b["id"], "date": d, "status": {"$nin": ["cancelado", "nao_compareceu"]}})
    by_time: dict = {}
    for b in barbers:
        for t in await barber_free_slots(db, b, d, svc["duration_min"]):
            by_time.setdefault(t, []).append(b)
    slots = []
    for t in sorted(by_time):
        options = sorted(by_time[t], key=lambda b: (load[b["id"]], b["name"]))
        chosen = options[0]
        slots.append({
            "time": t, "barber_id": chosen["id"], "barber_name": chosen["name"],
            "barbers": [{"id": b["id"], "name": b["name"]} for b in options],
        })
    return {"mode": "agenda", "slots": slots, "barbers": [{"id": b["id"], "name": b["name"], "photo_url": b.get("photo_url", ""), "window": b["window"]} for b in barbers]}


async def resolve_barber(d: str, time: str, duration_min: int, barber_id: Optional[str]) -> dict:
    """Validate (or auto-pick) a barber free at d/time. Raises 409 when none is free."""
    if barber_id and barber_id != "any":
        barber = await db.barbers.find_one({"id": barber_id}, {"_id": 0})
        if not barber or not barber.get("active", True):
            raise HTTPException(404, "Barbeiro não encontrado ou inativo")
        if not await is_barber_slot_free(db, barber, d, time, duration_min):
            raise HTTPException(409, f"{barber['name']} não está disponível neste horário")
        return barber
    candidates = await available_barbers(db, d)
    free = []
    for b in candidates:
        if await is_barber_slot_free(db, b, d, time, duration_min):
            free.append(b)
    if not free:
        raise HTTPException(409, "Nenhum barbeiro disponível neste horário")
    loads = []
    for b in free:
        n = await db.appointments.count_documents({"barber_id": b["id"], "date": d, "status": {"$nin": ["cancelado", "nao_compareceu"]}})
        loads.append((n, b["name"], b))
    loads.sort(key=lambda x: (x[0], x[1]))
    return loads[0][2]


async def mensal_cuts_available(user_id: str) -> tuple:
    """(subscription, remaining cuts counting pending mensal appointments not yet consumed)."""
    sub = await active_subscription(user_id)
    if not sub:
        return None, 0
    reserved = await db.appointments.count_documents({
        "user_id": user_id, "used_mensal": True, "mensal_consumed": {"$ne": True},
        "status": {"$nin": ["cancelado", "nao_compareceu", "concluido"]},
    })
    return sub, sub["cuts_total"] - sub["cuts_used"] - reserved


@api.post("/appointments")
async def create_appointment(body: AppointmentBody, user: dict = Depends(get_current_user)):
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    wd = parse_date_or_400(body.date).weekday()
    validate_time_or_400(body.time)
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    if not day_cfg or day_cfg["mode"] != "agenda":
        raise HTTPException(400, "Este dia não aceita agendamentos")
    barber = await resolve_barber(body.date, body.time, svc["duration_min"], body.barber_id)
    general = {**DEFAULT_GENERAL, **(settings.get("general") or {})}
    if (not body.barber_id or body.barber_id == "any") and not general.get("allow_any_barber", True):
        raise HTTPException(400, "Escolha um barbeiro específico")

    used_mensal = False
    if body.payment_method == "mensal":
        sub, remaining = await mensal_cuts_available(user["id"])
        if not sub:
            raise HTTPException(400, "Assinatura Cliente Mensal não está ativa")
        if remaining <= 0:
            raise HTTPException(400, "Você já utilizou (ou reservou) todos os cortes do ciclo atual")
        used_mensal = True

    status = "agendado" if used_mensal else "pagamento_pendente"
    # payment: PIX is paid online (awaiting), card/cash are paid in person (pending until staff confirms)
    payment_status = "pago" if used_mensal else ("aguardando_pagamento" if body.payment_method == "pix" else "pendente_confirmacao")
    apt = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "service_id": svc["id"],
        "service_name": svc["name"],
        "barber_id": barber["id"],
        "barber_name": barber["name"],
        "price": 0 if used_mensal else svc["price"],
        "date": body.date,
        "time": body.time,
        "duration_min": svc["duration_min"],
        "payment_method": body.payment_method,
        "payment_status": payment_status,
        "status": status,
        "used_mensal": used_mensal,
        "mensal_consumed": False,
        "created_at": now_utc().isoformat(),
    }
    await db.appointments.insert_one(apt.copy())
    apt.pop("_id", None)
    if body.payment_method == "pix" and not used_mensal:
        apt["pix"] = await pix_for_appointment(db, apt)
    await send_push([user["id"]], {"title": "Agendamento confirmado", "message": f"{svc['name']} com {barber['name']} em {body.date} às {body.time}"})
    return apt


@api.get("/appointments/me")
async def my_appointments(user: dict = Depends(get_current_user)):
    items = await db.appointments.find({"user_id": user["id"]}, {"_id": 0}).sort([("date", -1), ("time", -1)]).to_list(500)
    return items


@api.get("/appointments")
async def list_appointments(date: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, barber_id: Optional[str] = None, user: dict = Depends(require_staff)):
    q: dict = {}
    if date:
        q["date"] = date
    elif from_date or to_date:
        q["date"] = {}
        if from_date:
            q["date"]["$gte"] = from_date
        if to_date:
            q["date"]["$lte"] = to_date
    scope = barber_scope(user)
    if scope:
        q["barber_id"] = scope  # barbers only ever see their own agenda
    elif barber_id and barber_id != "all":
        q["barber_id"] = barber_id
    items = await db.appointments.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(2000)
    return items


@api.put("/appointments/{aid}/status")
async def update_appointment_status(aid: str, body: UpdateStatusBody, user: dict = Depends(require_staff)):
    apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Não encontrado")
    scope = barber_scope(user)
    if scope and apt.get("barber_id") != scope:
        raise HTTPException(403, "Este atendimento pertence a outro barbeiro")
    patch = {"status": body.status}
    if body.status == "pago":
        patch["payment_status"] = "pago"
    await db.appointments.update_one({"id": aid}, {"$set": patch})
    apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if body.status == "concluido" and apt.get("used_mensal") and not apt.get("mensal_consumed"):
        # Cliente Mensal: cut is consumed only when the service is actually completed
        await consume_monthly_cut(apt["user_id"], apt)
        apt["mensal_consumed"] = True
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
    if apt.get("used_mensal") and apt.get("mensal_consumed"):
        await db.subscriptions.update_one(
            {"user_id": apt["user_id"], "status": "active"},
            {"$inc": {"cuts_used": -1}, "$pull": {"usage_history": {"appointment_id": aid}}},
        )
    return {"ok": True}


@api.post("/appointments/{aid}/confirm-presence")
async def confirm_presence(aid: str, user: dict = Depends(get_current_user)):
    apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
    if not apt:
        raise HTTPException(404, "Não encontrado")
    if apt["user_id"] != user["id"]:
        raise HTTPException(403, "Não autorizado")
    if apt["status"] in ("cancelado", "concluido", "nao_compareceu"):
        raise HTTPException(400, "Este agendamento não pode mais ser confirmado")
    await db.appointments.update_one(
        {"id": aid},
        {"$set": {"presence_confirmed": True, "presence_confirmed_at": now_utc().isoformat()}},
    )
    return await db.appointments.find_one({"id": aid}, {"_id": 0})


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


async def consume_monthly_cut(user_id: str, apt: dict):
    """Register one used cut with full details (client, barber, service, date/time, cycle)."""
    sub = await active_subscription(user_id)
    if not sub:
        return
    record = {
        "appointment_id": apt["id"],
        "client_name": apt.get("client_name"),
        "barber_id": apt.get("barber_id"),
        "barber_name": apt.get("barber_name"),
        "service_name": apt.get("service_name"),
        "date": apt.get("date"),
        "time": apt.get("time"),
        "cycle_start": sub["period_start"],
        "cycle_end": sub["period_end"],
        "cut_number": sub["cuts_used"] + 1,
        "at": now_utc().isoformat(),
    }
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$inc": {"cuts_used": 1}, "$push": {"usage_history": record}},
    )
    await db.appointments.update_one({"id": apt["id"]}, {"$set": {"mensal_consumed": True, "mensal_cycle_start": sub["period_start"]}})


@api.post("/subscription")
async def create_subscription(body: SubscriptionCreateBody, user: dict = Depends(get_current_user)):
    existing = await active_subscription(user["id"])
    if existing:
        raise HTTPException(400, "Você já possui uma assinatura ativa")
    if await db.subscriptions.find_one({"user_id": user["id"], "status": "pending_payment"}):
        raise HTTPException(400, "Você já tem uma assinatura aguardando pagamento. Pague na barbearia para ativá-la.")
    # Resolve the plan SERVER-SIDE. Prices/cuts/cycle always come from the DB, never from the client.
    plan = None
    if body.plan_id:
        plan = await db.plans.find_one({"id": body.plan_id}, {"_id": 0})
        if not plan or plan.get("archived") or not plan.get("active", True):
            raise HTTPException(400, "Plano indisponível")
    if not plan:  # default = cheapest active plan
        plan = await db.plans.find_one({"active": True, "archived": {"$ne": True}}, {"_id": 0}, sort=[("price", 1)])
    if not plan:  # legacy fallback (settings.plan) if plans collection is empty
        settings = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
        plan = {**DEFAULT_PLAN, **(settings.get("plan") or {})}
        if not plan.get("active", True):
            raise HTTPException(400, "O plano Cliente Mensal não está disponível no momento")
    price = float(plan["price"])
    cuts = int(plan["cuts"])
    cycle_days = int(plan.get("cycle_days") or DEFAULT_PLAN["cycle_days"])
    sid = str(uuid.uuid4())
    # Every method (PIX, cartão, dinheiro) is confirmed at the shop by the admin (no simulated payment).
    sub = {
        "id": sid,
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "plan_id": plan.get("id"),
        "plan_name": plan["name"],
        "plan_snapshot": plan,  # preserves the exact terms agreed for this cycle
        "price": price,
        "cuts_total": cuts,
        "cuts_used": 0,
        "payment_method": body.payment_method,
        "payment_status": "aguardando_pagamento" if body.payment_method == "pix" else "pendente_confirmacao",
        "status": "pending_payment",
        "txid": sid.replace("-", "")[:25],  # used to match an eventual PIX provider webhook
        "period_start": now_utc().isoformat(),
        "period_end": (now_utc() + timedelta(days=cycle_days)).isoformat(),
        "usage_history": [],
        "created_at": now_utc().isoformat(),
    }
    await db.subscriptions.insert_one(sub.copy())
    sub.pop("_id", None)
    if body.payment_method == "pix":
        sub["pix"] = await pix_for_subscription(db, sub)  # valid BR Code QR; stays pending until confirmed
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
async def mark_sub_paid(sid: str, user: dict = Depends(require_admin)):
    """Admin confirms the payment received at the shop → plan becomes active from now."""
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Assinatura não encontrada")
    if sub["status"] != "pending_payment":
        raise HTTPException(400, "Esta assinatura não está aguardando pagamento")
    cycle_days = (sub.get("plan_snapshot") or {}).get("cycle_days") or DEFAULT_PLAN["cycle_days"]
    patch = {
        "status": "active",
        "period_start": now_utc().isoformat(),
        "period_end": (now_utc() + timedelta(days=cycle_days)).isoformat(),
        "paid_at": now_utc().isoformat(),
        "paid_confirmed_by": user.get("name"),
    }
    await db.subscriptions.update_one({"id": sid}, {"$set": patch})
    await audit(user, "subscription.mark_paid", "subscription", sid, {"status": sub["status"]}, patch)
    await send_push([sub["user_id"]], {"title": "Assinatura ativada", "message": f"{sub['plan_name']} ativo! {sub['cuts_total']} cortes disponíveis."})
    return {"ok": True}


@api.put("/subscription/{sid}/cancel")
async def cancel_sub(sid: str, user: dict = Depends(require_admin)):
    """Admin cancels a subscription that was never paid (or an active one)."""
    sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "Assinatura não encontrada")
    if sub["status"] not in ("pending_payment", "active"):
        raise HTTPException(400, "Esta assinatura não pode ser cancelada")
    await db.subscriptions.update_one({"id": sid}, {"$set": {"status": "canceled", "canceled_at": now_utc().isoformat()}})
    await audit(user, "subscription.cancel", "subscription", sid, {"status": sub["status"]}, {"status": "canceled"})
    return {"ok": True}


@api.get("/admin/subscriptions")
async def list_subscriptions(_: dict = Depends(require_admin)):
    subs = await db.subscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return subs


# =============================== queue ========================================
QUEUE_ACTIVE = ["aguardando", "chamado", "em_atendimento"]


def _queue_position(entries: List[dict], entry: dict) -> Optional[int]:
    """Position of entry within its barber's waiting list (1-based)."""
    waiting = [e for e in entries if e["status"] == "aguardando" and e.get("barber_id") == entry.get("barber_id")]
    for i, e in enumerate(waiting):
        if e["id"] == entry["id"]:
            return i + 1
    return None


async def _auto_call_next(barber_id: Optional[str], today: str):
    """After a completion, automatically call the next waiting client of the same barber's queue."""
    nxt = await db.queue.find_one({"date": today, "barber_id": barber_id, "status": "aguardando"}, {"_id": 0}, sort=[("joined_at", 1)])
    if nxt:
        await db.queue.update_one({"id": nxt["id"]}, {"$set": {"status": "chamado", "called_at": now_utc().isoformat(), "auto_called": True}})
        await send_push([nxt["user_id"]], {"title": "É a sua vez!", "message": f"{nxt.get('barber_name') or 'O barbeiro'} está pronto para atendê-lo."})
    return nxt


@api.get("/queue/today")
async def queue_today(user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    wd = date.today().weekday()
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    mode = day_cfg["mode"] if day_cfg else "fechado"
    entries = await db.queue.find({"date": today, "status": {"$in": QUEUE_ACTIVE}}, {"_id": 0}).sort("joined_at", 1).to_list(500)
    barbers = await available_barbers(db, today)
    # keep barbers that have entries even if no longer "available" so admin can manage them
    known = {b["id"] for b in barbers}
    for e in entries:
        if e.get("barber_id") and e["barber_id"] not in known:
            b = await db.barbers.find_one({"id": e["barber_id"]}, {"_id": 0})
            if b:
                barbers.append({**b, "window": None}); known.add(b["id"])
    queues = []
    for b in barbers:
        mine = [e for e in entries if e.get("barber_id") == b["id"]]
        queues.append({
            "barber_id": b["id"], "barber_name": b["name"], "photo_url": b.get("photo_url", ""),
            "description": b.get("description", ""), "window": b.get("window"),
            "entries": mine, "waiting": len([e for e in mine if e["status"] == "aguardando"]),
        })
    my_entry = next((e for e in entries if e["user_id"] == user["id"]), None)
    my_pos = _queue_position(entries, my_entry) if my_entry else None
    scope = barber_scope(user)
    if scope:
        # barbers see only their own queue (the founder admin sees all)
        queues = [q for q in queues if q["barber_id"] == scope]
        entries = [e for e in entries if e.get("barber_id") == scope]
    elif user["role"] == "client":
        # clients only see their own full entry; others are anonymized (no phone / user id)
        entries = [public_queue_entry(e, user["id"]) for e in entries]
        for q in queues:
            q["entries"] = [public_queue_entry(e, user["id"]) for e in q["entries"]]
    ahead = behind = None
    if my_entry and my_pos:
        same = [e for e in await db.queue.find({"date": today, "barber_id": my_entry.get("barber_id"), "status": "aguardando"}, {"_id": 0, "id": 1}).sort("joined_at", 1).to_list(500)]
        ahead, behind = my_pos - 1, len(same) - my_pos
    return {
        "mode": mode, "entries": entries, "queues": queues,
        "my_entry": my_entry, "my_position": my_pos, "ahead": ahead, "behind": behind,
        "my_barber_name": my_entry.get("barber_name") if my_entry else None,
        "total_waiting": len([e for e in entries if e["status"] == "aguardando"]),
    }


@api.post("/queue/join")
async def join_queue(body: QueueJoinBody, user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    settings = await db.settings.find_one({"id": "main"}, {"_id": 0})
    wd = date.today().weekday()
    day_cfg = next((x for x in settings["days"] if x["weekday"] == wd), None)
    if not day_cfg or day_cfg["mode"] != "fila":
        raise HTTPException(400, "Fila não está ativa hoje")
    dup = await db.queue.find_one({"user_id": user["id"], "date": today, "status": {"$in": QUEUE_ACTIVE}})
    if dup:
        raise HTTPException(400, "Você já está na fila")
    svc = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Serviço não encontrado")
    barbers = await available_barbers(db, today)
    if not barbers:
        raise HTTPException(400, "Nenhum barbeiro trabalhando hoje")
    if body.barber_id and body.barber_id != "any":
        barber = next((b for b in barbers if b["id"] == body.barber_id), None)
        if not barber:
            raise HTTPException(400, "Este barbeiro não está atendendo hoje")
    else:
        # "Qualquer barbeiro": shortest waiting queue wins
        loads = []
        for b in barbers:
            n = await db.queue.count_documents({"date": today, "barber_id": b["id"], "status": {"$in": QUEUE_ACTIVE}})
            loads.append((n, b["name"], b))
        loads.sort(key=lambda x: (x[0], x[1]))
        barber = loads[0][2]
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "client_name": user["name"],
        "client_phone": user["phone"],
        "service_id": svc["id"],
        "service_name": svc["name"],
        "barber_id": barber["id"],
        "barber_name": barber["name"],
        "date": today,
        "status": "aguardando",
        "joined_at": now_utc().isoformat(),
    }
    await db.queue.insert_one(entry.copy())
    entry.pop("_id", None)
    entries = await db.queue.find({"date": today, "status": {"$in": QUEUE_ACTIVE}}, {"_id": 0}).sort("joined_at", 1).to_list(500)
    entry["position"] = _queue_position(entries, entry)
    await send_push([user["id"]], {"title": "Você entrou na fila", "message": f"Fila do {barber['name']} · {entry['position']}º lugar · {svc['name']}"})
    return entry


@api.post("/queue/{qid}/leave")
async def leave_queue(qid: str, user: dict = Depends(get_current_user)):
    e = await db.queue.find_one({"id": qid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Não encontrado")
    if user["role"] != "admin" and e["user_id"] != user["id"]:
        if not (user["role"] == "barber" and e.get("barber_id") == user.get("barber_id")):
            raise HTTPException(403, "Não autorizado")
    await db.queue.update_one({"id": qid}, {"$set": {"status": "cancelado"}})
    return {"ok": True}


async def staff_queue_entry(qid: str, user: dict) -> dict:
    e = await db.queue.find_one({"id": qid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Não encontrado")
    scope = barber_scope(user)
    if scope and e.get("barber_id") != scope:
        raise HTTPException(403, "Esta fila pertence a outro barbeiro")
    return e


@api.post("/queue/{qid}/call")
async def call_queue(qid: str, user: dict = Depends(require_staff)):
    e = await staff_queue_entry(qid, user)
    await db.queue.update_one({"id": qid}, {"$set": {"status": "chamado", "called_at": now_utc().isoformat()}})
    await send_push([e["user_id"]], {"title": "É a sua vez!", "message": "O barbeiro está pronto para atendê-lo."})
    return {"ok": True}


@api.post("/queue/{qid}/start")
async def start_queue(qid: str, user: dict = Depends(require_staff)):
    await staff_queue_entry(qid, user)
    await db.queue.update_one({"id": qid}, {"$set": {"status": "em_atendimento", "started_at": now_utc().isoformat()}})
    return {"ok": True}


class CompleteQueueBody(BaseModel):
    use_mensal: bool = False


@api.post("/queue/{qid}/complete")
async def complete_queue(qid: str, body: CompleteQueueBody, user: dict = Depends(require_staff)):
    e = await staff_queue_entry(qid, user)
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
        "barber_id": e.get("barber_id"),
        "barber_name": e.get("barber_name"),
        "price": 0 if used_mensal else svc.get("price", 0),
        "date": e["date"],
        "time": now_utc().astimezone(timezone(timedelta(hours=-3))).strftime("%H:%M"),
        "duration_min": svc.get("duration_min", 30),
        "payment_method": "mensal" if used_mensal else "dinheiro",
        "status": "concluido",
        "used_mensal": used_mensal,
        "mensal_consumed": False,
        "from_queue": True,
        "created_at": now_utc().isoformat(),
    }
    await db.appointments.insert_one(apt.copy())
    if used_mensal:
        await consume_monthly_cut(e["user_id"], apt)
    await db.queue.update_one({"id": qid}, {"$set": {"status": "concluido", "completed_at": now_utc().isoformat()}})
    nxt = await _auto_call_next(e.get("barber_id"), e["date"])
    return {"ok": True, "next_called": {"id": nxt["id"], "client_name": nxt["client_name"]} if nxt else None}


@api.post("/queue/{qid}/noshow")
async def noshow_queue(qid: str, user: dict = Depends(require_staff)):
    e = await staff_queue_entry(qid, user)
    await db.queue.update_one({"id": qid}, {"$set": {"status": "nao_compareceu"}})
    nxt = await _auto_call_next(e.get("barber_id"), e["date"]) if e["status"] == "chamado" else None
    return {"ok": True, "next_called": {"id": nxt["id"], "client_name": nxt["client_name"]} if nxt else None}


# =============================== payments / dashboard =======================
@api.get("/admin/dashboard")
async def admin_dashboard(user: dict = Depends(require_staff)):
    today = date.today().isoformat()
    scope = barber_scope(user)
    aq: dict = {"date": today}
    if scope:
        aq["barber_id"] = scope
    apts = await db.appointments.find(aq, {"_id": 0}).to_list(500)
    done = [a for a in apts if a["status"] == "concluido"]
    pending_pay = [a for a in apts if a.get("payment_status") in ("aguardando_pagamento", "pendente_confirmacao") or a["status"] == "pagamento_pendente"]
    revenue = sum(a.get("price", 0) for a in done)
    qq: dict = {"date": today, "status": {"$in": ["aguardando", "chamado", "em_atendimento"]}}
    if scope:
        qq["barber_id"] = scope
    q = await db.queue.find(qq, {"_id": 0}).to_list(200)
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    working = await available_barbers(db, today)
    return {
        "date": today,
        "appointments_total": len(apts),
        "appointments_done": len(done),
        "queue_waiting": len(q),
        "revenue_today": revenue,
        "pending_payments": len(pending_pay),
        "active_subscriptions": active_subs,
        "barbers_working": [{"id": b["id"], "name": b["name"], "window": b["window"]} for b in working],
        "clients_total": await db.users.count_documents({"role": "client"}),
        "upcoming": sorted([a for a in apts if a["status"] in ["agendado", "pago", "pagamento_pendente", "cliente_chegou"]], key=lambda x: x["time"])[:10],
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
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    payload = {**body.model_dump(), "user_id": user["id"]}  # bind to the authenticated user
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=payload)
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"push register failed: {e}")
    return {"status": "registered"}


# =============================== seed =========================================
@api.post("/seed")
async def seed_endpoint(_: dict = Depends(require_admin)):
    """Re-run the idempotent seed (admin only)."""
    return await seed()


async def seed():
    """Idempotent seed: admin + settings + services + barbers always; demo clients/data only when SEED_DEMO_DATA=true."""
    # admin (password from ADMIN_PASSWORD env; only used when the account does not exist yet)
    admin = await db.users.find_one({"email": "admin@wendelcortes.com"})
    if not admin:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id, "name": "Wendel Cortes", "phone": "11999999999",
            "email": "admin@wendelcortes.com", "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "created_at": now_utc().isoformat(),
        })
        if ADMIN_PASSWORD == "admin123":
            logger.warning("Admin criado com a senha padrão. Defina ADMIN_PASSWORD no .env antes de publicar!")

    # settings
    if not await db.settings.find_one({"id": "main"}):
        await db.settings.insert_one({
            "id": "main",
            "cancel_hours": 2, "monthly_price": 89.90, "monthly_cuts": 4,
            "shop": DEFAULT_SHOP,
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

    # plans collection (multiple editable monthly plans). Non-destructive: migrate the legacy
    # single plan (settings.plan) into the collection only when it is empty. Existing subscribers
    # keep their own plan_snapshot, so their agreed terms are never changed.
    if await db.plans.count_documents({}) == 0:
        s_doc = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
        base = {**DEFAULT_PLAN, **(s_doc.get("plan") or {})}
        await db.plans.insert_one({
            "id": str(uuid.uuid4()),
            "name": base.get("name") or "Cliente Mensal",
            "description": base.get("description") or "",
            "price": float(base.get("price") or 0),
            "cuts": int(base.get("cuts") or 4),
            "cycle_days": int(base.get("cycle_days") or 30),
            "rules": base.get("rules") or "",
            "allowed_service_ids": base.get("allowed_service_ids") or [],
            "active": base.get("active", True),
            "archived": False,
            "created_at": now_utc().isoformat(),
            "migrated_from_settings": True,
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

    # barbers (Wendel: Mon–Sat 09–18 · João: Tue–Sat 10–20)
    if await db.barbers.count_documents({}) == 0:
        wendel_hours = [{"weekday": i, "enabled": i < 6, "start": "09:00", "end": "18:00"} for i in range(7)]
        barbers_seed = [
            {"id": str(uuid.uuid4()), "name": "Wendel", "phone": "", "photo_url": "",
             "description": "Fundador · especialista em cortes clássicos e degradê", "active": True,
             "work_hours": wendel_hours, "commission_pct": None, "created_at": now_utc().isoformat()},
        ]
        if SEED_DEMO_DATA:  # extra demo barber only in development
            joao_hours = [{"weekday": i, "enabled": 1 <= i <= 5, "start": "10:00", "end": "20:00"} for i in range(7)]
            barbers_seed.append({"id": str(uuid.uuid4()), "name": "João", "phone": "11988880000", "photo_url": "",
                                 "description": "Barba, navalha e visagismo", "active": True,
                                 "work_hours": joao_hours, "commission_pct": None, "created_at": now_utc().isoformat()})
        await db.barbers.insert_many(barbers_seed)
    wendel = await db.barbers.find_one({"name": "Wendel"}, {"_id": 0}) or await db.barbers.find_one({}, {"_id": 0})
    # migrate legacy records without barber → Wendel
    if wendel:
        await db.appointments.update_many({"barber_id": {"$exists": False}}, {"$set": {"barber_id": wendel["id"], "barber_name": wendel["name"]}})
        await db.queue.update_many({"barber_id": {"$exists": False}}, {"$set": {"barber_id": wendel["id"], "barber_name": wendel["name"]}})

    if not SEED_DEMO_DATA:
        logger.info("Seed OK (sem dados de demonstração)")
        return {"ok": True, "admin": "admin@wendelcortes.com", "demo": False}

    # ---------------- demo data below (development only: SEED_DEMO_DATA=true) ----------------
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
                "barber_id": wendel["id"] if wendel else None, "barber_name": wendel["name"] if wendel else None,
                "price": svc["price"], "date": today, "time": t,
                "duration_min": svc["duration_min"], "payment_method": pm,
                "status": st, "used_mensal": False,
                "created_at": now_utc().isoformat(),
            })

    # sample queue entries (for demo, add to today's queue)
    if corte and client_ids and not await db.queue.find_one({"date": today}):
        barbers = await db.barbers.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(10)
        for i, (uid, n, p) in enumerate(client_ids[:4]):
            b = barbers[i % len(barbers)] if barbers else None
            await db.queue.insert_one({
                "id": str(uuid.uuid4()), "user_id": uid, "client_name": n, "client_phone": p,
                "service_id": corte["id"], "service_name": corte["name"],
                "barber_id": b["id"] if b else None, "barber_name": b["name"] if b else None,
                "date": today, "status": "aguardando",
                "joined_at": (now_utc() + timedelta(seconds=i)).isoformat(),
            })

    return {"ok": True, "admin_email": "admin@wendelcortes.com"}


# =============================== boot =========================================
@api.get("/")
async def root():
    return {"app": "Wendel Cortes API", "status": "ok"}


app.include_router(api)
app.include_router(make_barbers_router(db, get_current_user, require_admin, now_utc, audit), prefix="/api")
app.include_router(make_config_router(db, get_current_user, require_admin, require_staff, now_utc, hash_password, audit), prefix="/api")
app.add_middleware(
    CORSMiddleware,
    # Bearer tokens are used (no cookies), so credentials are only allowed when origins are explicit (CORS_ORIGINS env)
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_origins=CORS_ORIGINS,
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
