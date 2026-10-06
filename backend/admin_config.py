"""Admin configuration module — branding (logo/favicon), Cliente Mensal plan, PIX, payments,
audit log, barber accounts, password recovery. Mounted from server.py via make_config_router(ctx)."""
from __future__ import annotations

import base64
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field

from pix import build_pix_payload, normalize_pix_key

MAX_IMAGE_BYTES = 2 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon", "image/svg+xml"}

DEFAULT_PLAN = {
    "name": "Cliente Mensal", "price": 89.90, "cuts": 4, "cycle_days": 30,
    "description": "Assinatura mensal com cortes inclusos e prioridade no atendimento.",
    "rules": "Os cortes são descontados apenas quando o atendimento é concluído. Cortes não utilizados não acumulam para o próximo ciclo.",
    "allowed_service_ids": [], "active": True,
}
DEFAULT_PIX = {"mode": "shop", "key": "", "key_type": "aleatoria", "holder_name": "WENDEL CORTES", "city": "SAO PAULO"}
DEFAULT_GENERAL = {"allow_any_barber": True, "whatsapp_auto": True, "auto_call_next": True, "pix_expires_min": 30}


# ----------------------------------------------------------------- models ---
class ImageUploadBody(BaseModel):
    data_base64: str
    content_type: str


class PlanBody(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    price: float = Field(ge=0)
    cuts: int = Field(ge=1, le=100)
    cycle_days: int = Field(ge=7, le=365)
    description: Optional[str] = ""
    rules: Optional[str] = ""
    allowed_service_ids: List[str] = []
    active: bool = True


class SubscriptionAdjustBody(BaseModel):
    cuts_used: Optional[int] = Field(None, ge=0)
    cuts_total: Optional[int] = Field(None, ge=1)
    status: Optional[str] = Field(None, pattern="^(active|pending_payment|cancelled|expired)$")
    period_end: Optional[str] = None
    note: Optional[str] = ""


class PixBody(BaseModel):
    mode: str = Field(pattern="^(shop|barber)$")
    key: str = ""
    key_type: str = Field("aleatoria", pattern="^(cpf|cnpj|telefone|email|aleatoria)$")
    holder_name: str = Field("WENDEL CORTES", max_length=25)
    city: str = Field("SAO PAULO", max_length=15)


class PaymentStatusBody(BaseModel):
    payment_status: str = Field(pattern="^(aguardando_pagamento|pago|expirado|cancelado|pendente_confirmacao)$")


class GeneralBody(BaseModel):
    allow_any_barber: bool = True
    whatsapp_auto: bool = True
    auto_call_next: bool = True
    pix_expires_min: int = Field(30, ge=5, le=1440)


class BarberAccountBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=6)


# ----------------------------------------------------------------- router ---
def make_config_router(db, get_current_user, require_admin, require_staff, now_utc, hash_password, audit) -> APIRouter:
    r = APIRouter()

    async def settings_doc() -> dict:
        return await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}

    # ---------------------------------------------------------- branding ---
    @r.post("/admin/branding/{kind}")
    async def upload_branding(kind: str, body: ImageUploadBody, user: dict = Depends(require_admin)):
        if kind not in ("logo", "favicon"):
            raise HTTPException(404, "Tipo inválido")
        if body.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(400, "Formato de imagem não suportado (use PNG, JPG, WEBP ou ICO)")
        try:
            raw = base64.b64decode(body.data_base64.split(",")[-1], validate=True)
        except Exception:
            raise HTTPException(400, "Imagem inválida")
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(400, "Imagem muito grande (máximo 2 MB)")
        asset = {"id": str(uuid.uuid4()), "kind": kind, "content_type": body.content_type, "size": len(raw),
                 "data": raw, "created_at": now_utc().isoformat(), "by": user["name"]}
        await db.branding_assets.insert_one(asset)
        s = await settings_doc()
        before = (s.get("branding") or {}).get(kind)
        version = int((before or {}).get("version", 0)) + 1
        current = {"asset_id": asset["id"], "version": version, "content_type": body.content_type, "updated_at": asset["created_at"]}
        await db.settings.update_one({"id": "main"}, {"$set": {f"branding.{kind}": current}}, upsert=True)
        await audit(user, f"branding.{kind}.update", "settings", "main", before, current)
        return current

    @r.get("/public/branding/{kind}")
    async def get_branding(kind: str, id: Optional[str] = None):
        s = await settings_doc()
        asset_id = id or ((s.get("branding") or {}).get(kind) or {}).get("asset_id")
        if not asset_id:
            raise HTTPException(404, "Sem imagem personalizada")
        a = await db.branding_assets.find_one({"id": asset_id, "kind": kind})
        if not a:
            raise HTTPException(404, "Imagem não encontrada")
        return Response(content=bytes(a["data"]), media_type=a["content_type"],
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @r.get("/admin/branding/history")
    async def branding_history(_: dict = Depends(require_admin)):
        items = await db.branding_assets.find({}, {"_id": 0, "data": 0}).sort("created_at", -1).to_list(100)
        s = await settings_doc()
        return {"current": s.get("branding") or {}, "history": items}

    @r.post("/admin/branding/{kind}/restore/{asset_id}")
    async def restore_branding(kind: str, asset_id: str, user: dict = Depends(require_admin)):
        a = await db.branding_assets.find_one({"id": asset_id, "kind": kind}, {"_id": 0, "data": 0})
        if not a:
            raise HTTPException(404, "Versão não encontrada")
        s = await settings_doc()
        before = (s.get("branding") or {}).get(kind)
        current = {"asset_id": asset_id, "version": int((before or {}).get("version", 0)) + 1,
                   "content_type": a["content_type"], "updated_at": now_utc().isoformat()}
        await db.settings.update_one({"id": "main"}, {"$set": {f"branding.{kind}": current}}, upsert=True)
        await audit(user, f"branding.{kind}.restore", "settings", "main", before, current)
        return current

    @r.delete("/admin/branding/{kind}")
    async def reset_branding(kind: str, user: dict = Depends(require_admin)):
        s = await settings_doc()
        before = (s.get("branding") or {}).get(kind)
        await db.settings.update_one({"id": "main"}, {"$unset": {f"branding.{kind}": ""}})
        await audit(user, f"branding.{kind}.reset", "settings", "main", before, None)
        return {"ok": True}

    # -------------------------------------------------------------- plan ---
    @r.put("/admin/plan")
    async def update_plan(body: PlanBody, user: dict = Depends(require_admin)):
        s = await settings_doc()
        before = {**DEFAULT_PLAN, **(s.get("plan") or {})}
        plan = body.model_dump()
        # keep legacy fields in sync (used by older code paths / public info)
        await db.settings.update_one({"id": "main"}, {"$set": {"plan": plan, "monthly_price": plan["price"], "monthly_cuts": plan["cuts"]}}, upsert=True)
        await audit(user, "plan.update", "settings", "main", before, plan)
        return plan

    @r.put("/admin/subscriptions/{sid}")
    async def adjust_subscription(sid: str, body: SubscriptionAdjustBody, user: dict = Depends(require_admin)):
        sub = await db.subscriptions.find_one({"id": sid}, {"_id": 0})
        if not sub:
            raise HTTPException(404, "Assinatura não encontrada")
        patch = {k: v for k, v in body.model_dump().items() if v is not None and k != "note"}
        if not patch:
            raise HTTPException(400, "Nada para alterar")
        entry = {"at": now_utc().isoformat(), "by": user["name"], "note": body.note or "", "changes": patch,
                 "before": {k: sub.get(k) for k in patch}}
        await db.subscriptions.update_one({"id": sid}, {"$set": patch, "$push": {"admin_history": entry}})
        await audit(user, "subscription.adjust", "subscription", sid, entry["before"], patch)
        return await db.subscriptions.find_one({"id": sid}, {"_id": 0})

    # --------------------------------------------------------------- pix ---
    @r.put("/admin/pix")
    async def update_pix(body: PixBody, user: dict = Depends(require_admin)):
        s = await settings_doc()
        before = {**DEFAULT_PIX, **(s.get("pix") or {})}
        pix = body.model_dump()
        pix["key"] = normalize_pix_key(pix["key"], pix["key_type"])
        await db.settings.update_one({"id": "main"}, {"$set": {"pix": pix}}, upsert=True)
        await audit(user, "pix.update", "settings", "main", before, pix)
        return pix

    @r.get("/appointments/{aid}/pix")
    async def appointment_pix(aid: str, user: dict = Depends(get_current_user)):
        apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
        if not apt:
            raise HTTPException(404, "Agendamento não encontrado")
        if user["role"] == "client" and apt["user_id"] != user["id"]:
            raise HTTPException(403, "Não autorizado")
        return await pix_for_appointment(db, apt)

    # ---------------------------------------------------------- payments ---
    @r.get("/admin/payments")
    async def list_payments(status: Optional[str] = None, from_date: Optional[str] = None, to_date: Optional[str] = None, user: dict = Depends(require_staff)):
        q: dict = {"status": {"$ne": "cancelado"}} if status != "cancelado" else {}
        if status and status != "all":
            q["payment_status"] = status
        if from_date or to_date:
            q["date"] = {}
            if from_date:
                q["date"]["$gte"] = from_date
            if to_date:
                q["date"]["$lte"] = to_date
        if user["role"] == "barber":
            q["barber_id"] = user.get("barber_id")
        items = await db.appointments.find(q, {"_id": 0}).sort([("date", -1), ("time", -1)]).to_list(1000)
        for a in items:
            a.setdefault("payment_status", "pago" if a["status"] in ("pago", "concluido", "em_atendimento", "cliente_chegou") else "aguardando_pagamento")
        totals = {"pago": 0.0, "pendente": 0.0}
        for a in items:
            if a.get("payment_status") == "pago":
                totals["pago"] += float(a.get("price") or 0)
            elif a.get("payment_status") in ("aguardando_pagamento", "pendente_confirmacao"):
                totals["pendente"] += float(a.get("price") or 0)
        return {"items": items, "totals": totals}

    @r.put("/appointments/{aid}/payment")
    async def set_payment_status(aid: str, body: PaymentStatusBody, user: dict = Depends(require_staff)):
        apt = await db.appointments.find_one({"id": aid}, {"_id": 0})
        if not apt:
            raise HTTPException(404, "Agendamento não encontrado")
        if user["role"] == "barber" and apt.get("barber_id") != user.get("barber_id"):
            raise HTTPException(403, "Você só pode confirmar pagamentos dos seus atendimentos")
        patch = {"payment_status": body.payment_status, "payment_updated_at": now_utc().isoformat(), "payment_updated_by": user["name"]}
        if body.payment_status == "pago" and apt["status"] == "pagamento_pendente":
            patch["status"] = "pago"
        if body.payment_status == "cancelado" and apt["status"] in ("pagamento_pendente", "agendado"):
            patch["status"] = "cancelado"
        await db.appointments.update_one({"id": aid}, {"$set": patch})
        await audit(user, "payment.status", "appointment", aid, {"payment_status": apt.get("payment_status"), "status": apt["status"]}, patch)
        return await db.appointments.find_one({"id": aid}, {"_id": 0})

    # ----------------------------------------------------------- general ---
    @r.put("/admin/general")
    async def update_general(body: GeneralBody, user: dict = Depends(require_admin)):
        s = await settings_doc()
        before = {**DEFAULT_GENERAL, **(s.get("general") or {})}
        g = body.model_dump()
        await db.settings.update_one({"id": "main"}, {"$set": {"general": g}}, upsert=True)
        await audit(user, "general.update", "settings", "main", before, g)
        return g

    # ------------------------------------------------------------- audit ---
    @r.get("/admin/audit")
    async def list_audit(limit: int = 200, entity: Optional[str] = None, _: dict = Depends(require_admin)):
        q = {"entity": entity} if entity else {}
        return await db.audit_logs.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 1000))

    # --------------------------------------------------- barber accounts ---
    @r.get("/admin/barbers/{bid}/account")
    async def get_barber_account(bid: str, _: dict = Depends(require_admin)):
        u = await db.users.find_one({"role": "barber", "barber_id": bid}, {"_id": 0, "password_hash": 0})
        return u

    @r.post("/admin/barbers/{bid}/account")
    async def upsert_barber_account(bid: str, body: BarberAccountBody, user: dict = Depends(require_admin)):
        barber = await db.barbers.find_one({"id": bid}, {"_id": 0})
        if not barber:
            raise HTTPException(404, "Barbeiro não encontrado")
        email = body.email.lower()
        other = await db.users.find_one({"email": email})
        if other and other.get("barber_id") != bid:
            raise HTTPException(400, "Este e-mail já está em uso por outra conta")
        existing = await db.users.find_one({"role": "barber", "barber_id": bid})
        if existing:
            await db.users.update_one({"id": existing["id"]}, {"$set": {"email": email, "password_hash": hash_password(body.password), "name": barber["name"], "phone": barber.get("phone", "")}})
            uid = existing["id"]; action = "barber.account.reset"
        else:
            uid = str(uuid.uuid4())
            await db.users.insert_one({"id": uid, "name": barber["name"], "phone": barber.get("phone", ""), "email": email,
                                       "password_hash": hash_password(body.password), "role": "barber", "barber_id": bid,
                                       "created_at": now_utc().isoformat()})
            action = "barber.account.create"
        await audit(user, action, "barber", bid, None, {"email": email})
        return {"id": uid, "email": email, "barber_id": bid, "role": "barber"}

    @r.delete("/admin/barbers/{bid}/account")
    async def delete_barber_account(bid: str, user: dict = Depends(require_admin)):
        res = await db.users.delete_one({"role": "barber", "barber_id": bid})
        await audit(user, "barber.account.delete", "barber", bid, None, {"deleted": res.deleted_count})
        return {"ok": True}

    # --------------------------------------------------- password reset ----
    @r.post("/auth/forgot")
    async def forgot_password(body: ForgotBody):
        email = body.email.lower()
        u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
        if u:
            code = f"{secrets.randbelow(10**6):06d}"
            await db.password_resets.delete_many({"email": email})
            await db.password_resets.insert_one({
                "id": str(uuid.uuid4()), "email": email, "user_id": u["id"], "client_name": u["name"], "client_phone": u.get("phone", ""),
                "code_hash": hash_password(code), "code": code,  # plain code visible only to the founder admin to relay via WhatsApp
                "expires_at": (now_utc() + timedelta(minutes=30)).isoformat(), "created_at": now_utc().isoformat(), "used": False,
            })
        return {"ok": True, "message": "Se o e-mail estiver cadastrado, um código de recuperação (válido por 30 minutos) será enviado a você pela barbearia via WhatsApp."}

    @r.post("/auth/reset")
    async def reset_password(body: ResetBody):
        email = body.email.lower()
        rec = await db.password_resets.find_one({"email": email, "used": False}, sort=[("created_at", -1)])
        if not rec or rec["expires_at"] < now_utc().isoformat() or rec["code"] != body.code:
            raise HTTPException(400, "Código inválido ou expirado")
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(body.new_password)}})
        await db.password_resets.update_one({"id": rec["id"]}, {"$set": {"used": True, "code": None}})
        return {"ok": True, "message": "Senha alterada com sucesso. Faça login com a nova senha."}

    @r.get("/admin/password-resets")
    async def pending_resets(_: dict = Depends(require_admin)):
        now = now_utc().isoformat()
        return await db.password_resets.find({"used": False, "expires_at": {"$gt": now}}, {"_id": 0, "code_hash": 0}).sort("created_at", -1).to_list(100)

    return r


async def pix_for_appointment(db, apt: dict) -> dict:
    """Resolve PIX key (shop or barber) and build payload for an appointment."""
    s = await db.settings.find_one({"id": "main"}, {"_id": 0}) or {}
    pix = {**DEFAULT_PIX, **(s.get("pix") or {})}
    general = {**DEFAULT_GENERAL, **(s.get("general") or {})}
    shop_name = ((s.get("shop") or {}).get("name")) or "WENDEL CORTES"
    key, key_type, holder = pix["key"], pix["key_type"], pix["holder_name"] or shop_name
    source = "shop"
    if pix["mode"] == "barber" and apt.get("barber_id"):
        b = await db.barbers.find_one({"id": apt["barber_id"]}, {"_id": 0})
        if b and b.get("pix_key"):
            key, key_type, holder, source = b["pix_key"], b.get("pix_key_type", "aleatoria"), b.get("pix_holder_name") or b["name"], "barber"
    if not key:
        return {"available": False, "reason": "Chave PIX ainda não configurada pela barbearia."}
    amount = float(apt.get("price") or 0)
    payload = build_pix_payload(normalize_pix_key(key, key_type), amount, holder, pix.get("city") or "SAO PAULO", txid=apt["id"].replace("-", "")[:25], description=apt.get("service_name", ""))
    return {"available": True, "payload": payload, "amount": amount, "key": key, "key_type": key_type, "holder_name": holder,
            "source": source, "expires_min": general["pix_expires_min"], "payment_status": apt.get("payment_status")}
