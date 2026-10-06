import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Switch, StyleSheet, ActivityIndicator, Platform, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, BACKEND_URL } from "@/src/api";
import { Badge, GoldButton, GhostButton } from "@/src/ui";
import { refreshBranding, Logo } from "@/src/branding";
import { openWhatsApp } from "@/src/whatsapp";

const fmtDt = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export function Flash({ ok, err }: { ok?: string | null; err?: string | null }) {
  return <>{err ? <Text style={s.err}>{err}</Text> : null}{ok ? <Text style={s.ok}>{ok}</Text> : null}</>;
}
function useFlash() {
  const [ok, setOk] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const flash = (m: string) => { setOk(m); setErr(null); setTimeout(() => setOk(null), 2500); };
  return { ok, err, setErr, flash };
}

// ------------------------------------------------------------- Identidade Visual
export function BrandingSection() {
  const { ok, err, setErr, flash } = useFlash();
  const [hist, setHist] = useState<any>(null);
  const [preview, setPreview] = useState<{ kind: string; uri: string; base64: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api("/admin/branding/history").then(setHist).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const pick = async (kind: "logo" | "favicon") => {
    setErr(null);
    if (Platform.OS !== "web") {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) { setErr("Permita o acesso às fotos para enviar o logo (Ajustes do aparelho → Permissões)."); return; }
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const type = a.mimeType || (a.uri.startsWith("data:") ? a.uri.slice(5, a.uri.indexOf(";")) : "image/png");
    const base64 = a.base64 || (a.uri.startsWith("data:") ? a.uri.split(",")[1] : "");
    if (!base64) { setErr("Não foi possível ler a imagem"); return; }
    setPreview({ kind, uri: a.uri, base64, type });
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      await api(`/admin/branding/${preview.kind}`, { method: "POST", body: JSON.stringify({ data_base64: preview.base64, content_type: preview.type }) });
      setPreview(null); await refreshBranding(); await load(); flash(preview.kind === "logo" ? "Novo logo salvo e aplicado em todo o site!" : "Novo favicon salvo!");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const restore = async (kind: string, id: string) => {
    try { await api(`/admin/branding/${kind}/restore/${id}`, { method: "POST" }); await refreshBranding(); await load(); flash("Versão restaurada"); } catch (e: any) { setErr(e.message); }
  };

  return (
    <View>
      <Flash ok={ok} err={err} />
      <View style={[s.card, { alignItems: "center" }]}>
        <Text style={s.lbl}>Logo atual (aparece em todo o site)</Text>
        <Logo size={140} />
        {preview?.kind === "logo" && (
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text style={s.lbl}>Prévia do novo logo</Text>
            <Image source={preview.uri} style={{ width: 140, height: 140, borderRadius: 20 }} contentFit="contain" />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" }}>
          <GoldButton testID="pick-logo-btn" icon="image" label="Alterar logo" onPress={() => pick("logo")} />
          {preview?.kind === "logo" && <GoldButton testID="confirm-logo-btn" icon="check" label={busy ? "Salvando..." : "Confirmar e salvar"} disabled={busy} onPress={confirm} />}
          {preview?.kind === "logo" && <GhostButton label="Cancelar" onPress={() => setPreview(null)} />}
        </View>
        <Text style={s.hint}>A imagem é usada exatamente como enviada; apenas o tamanho se adapta ao espaço, sem distorcer.</Text>
      </View>

      <View style={[s.card, { alignItems: "center" }]}>
        <Text style={s.lbl}>Favicon / ícone do site</Text>
        {hist?.current?.favicon ? <Image source={`${BACKEND_URL}/api/public/branding/favicon?id=${hist.current.favicon.asset_id}`} style={{ width: 48, height: 48 }} contentFit="contain" /> : <Text style={s.hint}>Nenhum favicon personalizado</Text>}
        {preview?.kind === "favicon" && <Image source={preview.uri} style={{ width: 48, height: 48, marginTop: spacing.sm }} contentFit="contain" />}
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap", justifyContent: "center" }}>
          <GoldButton testID="pick-favicon-btn" icon="star" label="Alterar favicon" onPress={() => pick("favicon")} />
          {preview?.kind === "favicon" && <GoldButton testID="confirm-favicon-btn" icon="check" label={busy ? "Salvando..." : "Confirmar"} disabled={busy} onPress={confirm} />}
        </View>
      </View>

      <Text style={s.sec}>Histórico de versões</Text>
      {!hist ? <ActivityIndicator color={colors.brandPrimary} /> : hist.history.length === 0 ? <Text style={s.hint}>Nenhuma imagem enviada ainda.</Text> :
        hist.history.map((h: any) => (
          <View key={h.id} style={[s.card, { flexDirection: "row", alignItems: "center", gap: spacing.md }]}>
            <Image source={`${BACKEND_URL}/api/public/branding/${h.kind}?id=${h.id}`} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{h.kind === "logo" ? "Logo" : "Favicon"} · {fmtDt(h.created_at)}</Text>
              <Text style={s.hint}>{(h.size / 1024).toFixed(0)} KB · por {h.by}</Text>
            </View>
            {hist.current?.[h.kind]?.asset_id === h.id ? <Badge label="Em uso" tone="gold" /> :
              <Pressable testID={`restore-${h.id}`} onPress={() => restore(h.kind, h.id)} style={s.btnGhost}><Text style={s.btnGhostTxt}>Restaurar</Text></Pressable>}
          </View>
        ))}
    </View>
  );
}

// ------------------------------------------------------------- Cliente Mensal (plano)
export function PlanSection({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const { ok, err, setErr, flash } = useFlash();
  const [plan, setPlan] = useState<any>(settings?.plan || {});
  const [subs, setSubs] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  useEffect(() => { setPlan(settings?.plan || {}); }, [settings]);
  useEffect(() => { api("/admin/subscriptions").then(setSubs).catch(() => {}); api("/services").then(setServices).catch(() => {}); }, []);

  const save = async () => {
    setErr(null);
    try {
      const saved = await api("/admin/plan", { method: "PUT", body: JSON.stringify({ ...plan, price: Number(plan.price), cuts: Number(plan.cuts), cycle_days: Number(plan.cycle_days) }) });
      setPlan(saved); onSaved(); flash("Plano atualizado! Novos ciclos usarão estas regras.");
    } catch (e: any) { setErr(e.message); }
  };
  const adjust = async () => {
    try {
      await api(`/admin/subscriptions/${editing.id}`, { method: "PUT", body: JSON.stringify({ cuts_used: Number(editing.cuts_used), cuts_total: Number(editing.cuts_total), status: editing.status, note: editing.note || "Ajuste manual" }) });
      setEditing(null); setSubs(await api("/admin/subscriptions")); flash("Assinatura ajustada (registrado no histórico)");
    } catch (e: any) { setErr(e.message); }
  };
  const toggleSvc = (id: string) => setPlan({ ...plan, allowed_service_ids: (plan.allowed_service_ids || []).includes(id) ? plan.allowed_service_ids.filter((x: string) => x !== id) : [...(plan.allowed_service_ids || []), id] });

  return (
    <View>
      <Flash ok={ok} err={err} />
      <View style={s.card}>
        <Text style={s.lbl}>Nome do plano</Text><TextInput testID="plan-name-input" style={s.input} value={plan.name} onChangeText={(v) => setPlan({ ...plan, name: v })} placeholderTextColor={colors.muted} />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}><Text style={s.lbl}>Preço (R$)</Text><TextInput testID="plan-price-input" style={s.input} keyboardType="decimal-pad" value={String(plan.price ?? "")} onChangeText={(v) => setPlan({ ...plan, price: v.replace(",", ".") })} placeholderTextColor={colors.muted} /></View>
          <View style={{ flex: 1 }}><Text style={s.lbl}>Cortes por ciclo</Text><TextInput testID="plan-cuts-input" style={s.input} keyboardType="number-pad" value={String(plan.cuts ?? "")} onChangeText={(v) => setPlan({ ...plan, cuts: v })} placeholderTextColor={colors.muted} /></View>
          <View style={{ flex: 1 }}><Text style={s.lbl}>Ciclo (dias)</Text><TextInput testID="plan-cycle-input" style={s.input} keyboardType="number-pad" value={String(plan.cycle_days ?? "")} onChangeText={(v) => setPlan({ ...plan, cycle_days: v })} placeholderTextColor={colors.muted} /></View>
        </View>
        <Text style={s.lbl}>Descrição</Text><TextInput testID="plan-desc-input" style={[s.input, { minHeight: 60 }]} multiline value={plan.description} onChangeText={(v) => setPlan({ ...plan, description: v })} placeholderTextColor={colors.muted} />
        <Text style={s.lbl}>Regras de utilização</Text><TextInput testID="plan-rules-input" style={[s.input, { minHeight: 60 }]} multiline value={plan.rules} onChangeText={(v) => setPlan({ ...plan, rules: v })} placeholderTextColor={colors.muted} />
        <Text style={s.lbl}>Serviços permitidos (nenhum marcado = todos)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 }}>
          {services.map((sv) => { const on = (plan.allowed_service_ids || []).includes(sv.id); return (
            <Pressable key={sv.id} testID={`plan-svc-${sv.name}`} onPress={() => toggleSvc(sv.id)} style={[s.chip, on && s.chipSel]}><Text style={[s.chipTxt, on && { color: colors.onBrandPrimary }]}>{sv.name}</Text></Pressable>
          ); })}
        </View>
        <View style={[s.rowBetween, { marginTop: spacing.md }]}><Text style={{ color: colors.onSurface, fontWeight: "600" }}>Plano ativo (disponível para novos assinantes)</Text><Switch testID="plan-active-switch" value={plan.active !== false} onValueChange={(v) => setPlan({ ...plan, active: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} /></View>
        <GoldButton testID="plan-save-btn" label="Salvar plano" onPress={save} style={{ marginTop: spacing.lg }} />
        <Text style={s.hint}>Ciclos já iniciados mantêm as regras da época (histórico preservado).</Text>
      </View>

      <Text style={s.sec}>Assinantes ({subs.length})</Text>
      {subs.map((sb) => (
        <View key={sb.id} style={s.card} testID={`sub-${sb.client_name}`}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{sb.client_name}</Text>
              <Text style={s.hint}>{sb.plan_name || "Cliente Mensal"} · R$ {Number(sb.price).toFixed(2)} · {sb.payment_method?.toUpperCase()}</Text>
              <Text style={s.hint}>Ciclo: {fmtDt(sb.period_start).slice(0, 5)} → {fmtDt(sb.period_end).slice(0, 5)} · Usados {sb.cuts_used}/{sb.cuts_total} · Restam {Math.max(0, sb.cuts_total - sb.cuts_used)}</Text>
            </View>
            <Badge label={sb.status} tone={sb.status === "active" ? "success" : sb.status === "pending_payment" ? "warning" : "default"} />
          </View>
          {editing?.id === sb.id ? (
            <View style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Text style={s.lbl}>Usados</Text><TextInput testID="sub-used-input" style={s.input} keyboardType="number-pad" value={String(editing.cuts_used)} onChangeText={(v) => setEditing({ ...editing, cuts_used: v })} /></View>
                <View style={{ flex: 1 }}><Text style={s.lbl}>Total</Text><TextInput testID="sub-total-input" style={s.input} keyboardType="number-pad" value={String(editing.cuts_total)} onChangeText={(v) => setEditing({ ...editing, cuts_total: v })} /></View>
              </View>
              <Text style={s.lbl}>Status</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: 4 }}>
                {["active", "pending_payment", "cancelled", "expired"].map((st) => <Pressable key={st} testID={`sub-status-${st}`} onPress={() => setEditing({ ...editing, status: st })} style={[s.chip, editing.status === st && s.chipSel]}><Text style={[s.chipTxt, editing.status === st && { color: colors.onBrandPrimary }]}>{st}</Text></Pressable>)}
              </View>
              <Text style={s.lbl}>Motivo (fica no histórico)</Text><TextInput testID="sub-note-input" style={s.input} value={editing.note || ""} onChangeText={(v) => setEditing({ ...editing, note: v })} placeholder="Ex.: cortesia, correção..." placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Pressable testID="sub-save-btn" onPress={adjust} style={s.btn}><Text style={s.btnTxt}>Salvar ajuste</Text></Pressable>
                <Pressable onPress={() => setEditing(null)} style={s.btnGhost}><Text style={s.btnGhostTxt}>Cancelar</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              <Pressable testID={`sub-adjust-${sb.client_name}`} onPress={() => setEditing({ ...sb, note: "" })} style={s.btnGhost}><Text style={s.btnGhostTxt}>Ajustar</Text></Pressable>
              {sb.admin_history?.length > 0 && <Text style={[s.hint, { alignSelf: "center" }]}>{sb.admin_history.length} ajuste(s) no histórico</Text>}
            </View>
          )}
          {sb.usage_history?.length > 0 && <Text style={[s.hint, { marginTop: 6 }]}>Último uso: {sb.usage_history[sb.usage_history.length - 1].service_name} com {sb.usage_history[sb.usage_history.length - 1].barber_name} em {sb.usage_history[sb.usage_history.length - 1].date}</Text>}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------- PIX
export function PixSection({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const { ok, err, setErr, flash } = useFlash();
  const [pix, setPix] = useState<any>(settings?.pix || {});
  useEffect(() => { setPix(settings?.pix || {}); }, [settings]);
  const save = async () => {
    setErr(null);
    try { setPix(await api("/admin/pix", { method: "PUT", body: JSON.stringify(pix) })); onSaved(); flash("Configuração PIX salva!"); } catch (e: any) { setErr(e.message); }
  };
  return (
    <View>
      <Flash ok={ok} err={err} />
      <View style={s.card}>
        <Text style={s.lbl}>Modo de recebimento</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
          {[{ k: "shop", l: "PIX padrão da barbearia" }, { k: "barber", l: "PIX individual por barbeiro" }].map((m) => (
            <Pressable key={m.k} testID={`pix-mode-${m.k}`} onPress={() => setPix({ ...pix, mode: m.k })} style={[s.chip, pix.mode === m.k && s.chipSel, { flex: 1, alignItems: "center" }]}><Text style={[s.chipTxt, pix.mode === m.k && { color: colors.onBrandPrimary }]}>{m.l}</Text></Pressable>
          ))}
        </View>
        <Text style={s.hint}>{pix.mode === "barber" ? "O QR Code usa a chave PIX do barbeiro escolhido (cadastrada na aba Barbeiros). Se o barbeiro não tiver chave, usa a chave padrão abaixo." : "Todos os pagamentos PIX vão para a chave principal da barbearia."}</Text>
        <Text style={s.sec}>Chave PIX principal da barbearia</Text>
        <Text style={s.lbl}>Tipo da chave</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: 4 }}>
          {["cpf", "cnpj", "telefone", "email", "aleatoria"].map((t) => <Pressable key={t} testID={`pix-type-${t}`} onPress={() => setPix({ ...pix, key_type: t })} style={[s.chip, pix.key_type === t && s.chipSel]}><Text style={[s.chipTxt, pix.key_type === t && { color: colors.onBrandPrimary }]}>{t}</Text></Pressable>)}
        </View>
        <Text style={s.lbl}>Chave</Text><TextInput testID="pix-key-input" style={s.input} autoCapitalize="none" value={pix.key} onChangeText={(v) => setPix({ ...pix, key: v })} placeholder="CPF, telefone, e-mail ou chave aleatória" placeholderTextColor={colors.muted} />
        <Text style={s.lbl}>Nome do favorecido (até 25 letras)</Text><TextInput testID="pix-holder-input" style={s.input} maxLength={25} value={pix.holder_name} onChangeText={(v) => setPix({ ...pix, holder_name: v })} placeholderTextColor={colors.muted} />
        <Text style={s.lbl}>Cidade (até 15 letras)</Text><TextInput testID="pix-city-input" style={s.input} maxLength={15} value={pix.city} onChangeText={(v) => setPix({ ...pix, city: v })} placeholderTextColor={colors.muted} />
        <GoldButton testID="pix-save-btn" label="Salvar PIX" onPress={save} style={{ marginTop: spacing.lg }} />
        <Text style={s.hint}>O QR Code gerado segue o padrão oficial PIX (BR Code) com o valor exato do atendimento. Estrutura pronta para integração futura com API de pagamentos.</Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------- Pagamentos
const PAY_LABEL: Record<string, string> = { aguardando_pagamento: "Aguardando PIX", pendente_confirmacao: "Pendente (presencial)", pago: "Pago", expirado: "Expirado", cancelado: "Cancelado" };
export function PaymentsSection({ canSeeAll = true }: { canSeeAll?: boolean }) {
  const { ok, err, setErr, flash } = useFlash();
  const [filter, setFilter] = useState("pendentes");
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => {
    const st = filter === "pendentes" ? "all" : filter;
    try { const d = await api(`/admin/payments?status=${st}`); if (filter === "pendentes") d.items = d.items.filter((a: any) => ["aguardando_pagamento", "pendente_confirmacao"].includes(a.payment_status)); setData(d); } catch {}
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  const set = async (a: any, st: string) => {
    try { await api(`/appointments/${a.id}/payment`, { method: "PUT", body: JSON.stringify({ payment_status: st }) }); await load(); flash(`Pagamento de ${a.client_name}: ${PAY_LABEL[st]}`); } catch (e: any) { setErr(e.message); }
  };
  return (
    <View>
      <Flash ok={ok} err={err} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {[["pendentes", "Pendentes"], ["pago", "Confirmados"], ["aguardando_pagamento", "PIX aguardando"], ["cancelado", "Cancelados"], ["all", "Todos"]].map(([k, l]) => (
          <Pressable key={k} testID={`pay-filter-${k}`} onPress={() => setFilter(k)} style={[s.chip, filter === k && s.chipSel]}><Text style={[s.chipTxt, filter === k && { color: colors.onBrandPrimary }]}>{l}</Text></Pressable>
        ))}
      </ScrollView>
      {data && <Text style={[s.hint, { marginTop: spacing.sm }]}>Confirmado: R$ {data.totals.pago.toFixed(2)} · Pendente: R$ {data.totals.pendente.toFixed(2)}</Text>}
      {!data ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} /> : data.items.length === 0 ? <Text style={[s.hint, { marginTop: spacing.lg }]}>Nenhum pagamento neste filtro.</Text> :
        data.items.map((a: any) => (
          <View key={a.id} style={s.card} testID={`payment-${a.id}`}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{a.client_name} · R$ {Number(a.price).toFixed(2)}</Text>
                <Text style={s.hint}>{a.service_name} · {a.barber_name} · {a.date.split("-").reverse().join("/")} {a.time} · {a.payment_method.toUpperCase()}</Text>
                {a.payment_updated_by && <Text style={s.hint}>Atualizado por {a.payment_updated_by} em {fmtDt(a.payment_updated_at)}</Text>}
              </View>
              <Badge label={PAY_LABEL[a.payment_status] || a.payment_status} tone={a.payment_status === "pago" ? "success" : a.payment_status === "cancelado" ? "default" : "warning"} />
            </View>
            {a.payment_status !== "pago" && a.status !== "cancelado" && (
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                <Pressable testID={`pay-confirm-${a.id}`} onPress={() => set(a, "pago")} style={s.btn}><Icon name="check" size={14} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>Confirmar pagamento</Text></Pressable>
                {canSeeAll && <Pressable testID={`pay-cancel-${a.id}`} onPress={() => set(a, "cancelado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>Cancelar</Text></Pressable>}
              </View>
            )}
            {a.payment_status === "pago" && canSeeAll && <Pressable testID={`pay-revert-${a.id}`} onPress={() => set(a, "pendente_confirmacao")} style={[s.btnGhost, { alignSelf: "flex-start", marginTop: spacing.sm }]}><Text style={s.btnGhostTxt}>Marcar como pendente</Text></Pressable>}
          </View>
        ))}
    </View>
  );
}

// ------------------------------------------------------------- Configurações gerais (agenda / fila / notificações)
export function GeneralSection({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const { ok, err, setErr, flash } = useFlash();
  const [g, setG] = useState<any>(settings?.general || {});
  const [cancelHours, setCancelHours] = useState(String(settings?.cancel_hours ?? 2));
  useEffect(() => { setG(settings?.general || {}); setCancelHours(String(settings?.cancel_hours ?? 2)); }, [settings]);
  const save = async () => {
    setErr(null);
    try {
      await api("/admin/general", { method: "PUT", body: JSON.stringify({ ...g, pix_expires_min: Number(g.pix_expires_min || 30) }) });
      await api("/settings/cancel-hours", { method: "PUT", body: JSON.stringify({ hours: Number(cancelHours) }) });
      onSaved(); flash("Configurações salvas!");
    } catch (e: any) { setErr(e.message); }
  };
  const Row = ({ k, l, d }: any) => (
    <View style={[s.rowBetween, { paddingVertical: spacing.sm }]}>
      <View style={{ flex: 1, paddingRight: spacing.md }}><Text style={{ color: colors.onSurface, fontWeight: "600" }}>{l}</Text><Text style={s.hint}>{d}</Text></View>
      <Switch testID={`general-${k}`} value={g[k] !== false} onValueChange={(v) => setG({ ...g, [k]: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} />
    </View>
  );
  return (
    <View>
      <Flash ok={ok} err={err} />
      <View style={s.card}>
        <Text style={s.sec}>Agenda</Text>
        <Row k="allow_any_barber" l='Opção "Qualquer barbeiro"' d="Permite ao cliente agendar/entrar na fila sem escolher um barbeiro específico." />
        <Text style={s.lbl}>Cancelamento permitido até (horas antes)</Text><TextInput testID="general-cancel-hours" style={s.input} keyboardType="number-pad" value={cancelHours} onChangeText={setCancelHours} />
        <Text style={s.sec}>Fila</Text>
        <Row k="auto_call_next" l="Chamar próximo automaticamente" d="Ao concluir um atendimento, o próximo da fila do mesmo barbeiro é chamado." />
        <Text style={s.sec}>Notificações / WhatsApp</Text>
        <Row k="whatsapp_auto" l="Abrir WhatsApp com mensagem pronta" d="Após agendar ou entrar na fila, abre o WhatsApp com a confirmação pré-preenchida (sem custo, via link)." />
        <Text style={s.sec}>Pagamentos</Text>
        <Text style={s.lbl}>Validade do PIX (minutos)</Text><TextInput testID="general-pix-expires" style={s.input} keyboardType="number-pad" value={String(g.pix_expires_min ?? 30)} onChangeText={(v) => setG({ ...g, pix_expires_min: v })} />
        <GoldButton testID="general-save-btn" label="Salvar configurações" onPress={save} style={{ marginTop: spacing.lg }} />
      </View>
    </View>
  );
}

// ------------------------------------------------------------- Auditoria
export function AuditSection() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api("/admin/audit?limit=200").then(setItems).catch(() => setItems([])); }, []);
  const fmtVal = (v: any) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 160) : String(v));
  return (
    <View>
      {!items ? <ActivityIndicator color={colors.brandPrimary} /> : items.length === 0 ? <Text style={s.hint}>Nenhuma alteração registrada ainda.</Text> :
        items.map((a) => (
          <View key={a.id} style={s.card} testID={`audit-${a.id}`}>
            <View style={s.rowBetween}><Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 12 }}>{a.action}</Text><Text style={s.hint}>{fmtDt(a.at)}</Text></View>
            <Text style={{ color: colors.onSurface, fontSize: 13, marginTop: 2 }}>{a.user_name} ({a.role}) · {a.entity}{a.entity_id && a.entity_id !== "main" ? ` #${String(a.entity_id).slice(0, 8)}` : ""}</Text>
            <Text style={s.hint}>Antes: {fmtVal(a.before)}</Text>
            <Text style={s.hint}>Depois: {fmtVal(a.after)}</Text>
          </View>
        ))}
    </View>
  );
}

// ------------------------------------------------------------- Recuperação de senha (códigos pendentes)
export function ResetCodesSection() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = useCallback(() => api("/admin/password-resets").then(setItems).catch(() => setItems([])), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  return (
    <View>
      <Text style={s.hint}>Quando um cliente pede “Esqueci minha senha”, o código aparece aqui por 30 minutos. Confirme a identidade e envie pelo WhatsApp.</Text>
      {!items ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.md }} /> : items.length === 0 ? <Text style={[s.hint, { marginTop: spacing.md }]}>Nenhuma solicitação pendente.</Text> :
        items.map((r) => (
          <View key={r.id} style={s.card} testID={`reset-${r.email}`}>
            <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{r.client_name} · {r.email}</Text>
            <Text style={s.hint}>Código: <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 16, letterSpacing: 3 }}>{r.code}</Text> · expira {fmtDt(r.expires_at)}</Text>
            {!!r.client_phone && <Pressable testID={`reset-wa-${r.email}`} onPress={() => openWhatsApp(r.client_phone, `Olá ${r.client_name}! Seu código para redefinir a senha no site da WENDEL CORTES é: ${r.code} (válido por 30 minutos). Acesse "Esqueci minha senha" e informe este código.`)} style={[s.btn, { alignSelf: "flex-start", marginTop: spacing.sm }]}><Icon name="message-circle" size={14} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>Enviar pelo WhatsApp</Text></Pressable>}
          </View>
        ))}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.md },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.lg, marginBottom: spacing.xs },
  lbl: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  hint: { color: colors.muted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 4, minHeight: 44 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, minHeight: 40 },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, minHeight: 40, justifyContent: "center" },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
  ok: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
});
