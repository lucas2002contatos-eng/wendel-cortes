import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Switch, Platform, Alert } from "react-native";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { Badge, GoldButton } from "@/src/ui";
import { Flash, s } from "@/src/admin/config-sections";

const empty = () => ({ name: "", description: "", price: "", cuts: "4", cycle_days: "30", rules: "", allowed_service_ids: [] as string[], active: true });

function confirmAsync(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((res) => Alert.alert(title, msg, [{ text: "Cancelar", style: "cancel", onPress: () => res(false) }, { text: "Confirmar", style: "destructive", onPress: () => res(true) }]));
}

/** Founder admin: full control of monthly plans (create / edit / price / services / activate / deactivate / delete)
 *  plus manual adjustment of existing subscribers. Plans with subscribers are archived, never deleted. */
export function PlansSection({ onChanged }: { onChanged?: () => void }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null); // null = closed; object = creating/editing
  const [editing, setEditing] = useState<any | null>(null); // subscriber being adjusted
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flash = (m: string) => { setOk(m); setErr(null); setTimeout(() => setOk(null), 2500); };

  const load = async () => {
    try {
      const [p, sv, sb] = await Promise.all([api("/plans"), api("/services"), api("/admin/subscriptions")]);
      setPlans(p); setServices(sv); setSubs(sb);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const bodyFrom = (f: any) => ({
    name: String(f.name || "").trim(), description: f.description || "",
    price: Number(String(f.price).replace(",", ".")), cuts: Number(f.cuts), cycle_days: Number(f.cycle_days),
    rules: f.rules || "", allowed_service_ids: f.allowed_service_ids || [], active: f.active ?? true, archived: f.archived ?? false,
  });

  const save = async () => {
    setErr(null);
    const body = bodyFrom(form);
    if (!body.name || isNaN(body.price) || !body.cuts || !body.cycle_days) { setErr("Informe nome, preço, cortes e ciclo válidos"); return; }
    try {
      if (form.id) await api(`/admin/plans/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/admin/plans", { method: "POST", body: JSON.stringify(body) });
      setForm(null); await load(); onChanged?.(); flash(form.id ? "Plano atualizado! Assinantes atuais mantêm os termos já contratados." : "Plano criado!");
    } catch (e: any) { setErr(e.message); }
  };
  const patch = async (p: any, delta: any, msg: string) => {
    try { await api(`/admin/plans/${p.id}`, { method: "PUT", body: JSON.stringify({ ...bodyFrom(p), ...delta }) }); await load(); onChanged?.(); flash(msg); } catch (e: any) { setErr(e.message); }
  };
  const remove = async (p: any) => {
    if (!(await confirmAsync("Excluir plano", `Excluir "${p.name}"? Se houver assinantes, ele será arquivado (histórico preservado).`))) return;
    try { const r = await api(`/admin/plans/${p.id}`, { method: "DELETE" }); await load(); onChanged?.(); flash(r.archived ? r.message : "Plano excluído"); } catch (e: any) { setErr(e.message); }
  };
  const toggleSvc = (id: string) => setForm({ ...form, allowed_service_ids: (form.allowed_service_ids || []).includes(id) ? form.allowed_service_ids.filter((x: string) => x !== id) : [...(form.allowed_service_ids || []), id] });
  const adjust = async () => {
    try {
      await api(`/admin/subscriptions/${editing.id}`, { method: "PUT", body: JSON.stringify({ cuts_used: Number(editing.cuts_used), cuts_total: Number(editing.cuts_total), status: editing.status, note: editing.note || "Ajuste manual" }) });
      setEditing(null); setSubs(await api("/admin/subscriptions")); flash("Assinatura ajustada (registrado no histórico)");
    } catch (e: any) { setErr(e.message); }
  };

  const svcName = (id: string) => services.find((x) => x.id === id)?.name || id;
  const visible = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);

  return (
    <View>
      <Flash ok={ok} err={err} />
      {form ? (
        <View style={s.card}>
          <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 16 }}>{form.id ? "Editar plano" : "Novo plano"}</Text>
          <Text style={s.lbl}>Nome do plano *</Text>
          <TextInput testID="plan-name-input" style={s.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Ex.: Plano Barba & Cabelo" placeholderTextColor={colors.muted} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Text style={s.lbl}>Preço (R$) *</Text><TextInput testID="plan-price-input" style={s.input} keyboardType="decimal-pad" value={String(form.price)} onChangeText={(v) => setForm({ ...form, price: v })} placeholder="89,90" placeholderTextColor={colors.muted} /></View>
            <View style={{ flex: 1 }}><Text style={s.lbl}>Cortes / ciclo *</Text><TextInput testID="plan-cuts-input" style={s.input} keyboardType="number-pad" value={String(form.cuts)} onChangeText={(v) => setForm({ ...form, cuts: v })} placeholderTextColor={colors.muted} /></View>
            <View style={{ flex: 1 }}><Text style={s.lbl}>Ciclo (dias) *</Text><TextInput testID="plan-cycle-input" style={s.input} keyboardType="number-pad" value={String(form.cycle_days)} onChangeText={(v) => setForm({ ...form, cycle_days: v })} placeholderTextColor={colors.muted} /></View>
          </View>
          <Text style={s.lbl}>Descrição</Text>
          <TextInput testID="plan-desc-input" style={[s.input, { minHeight: 60 }]} multiline value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Opcional" placeholderTextColor={colors.muted} />
          <Text style={s.lbl}>Regras de utilização</Text>
          <TextInput testID="plan-rules-input" style={[s.input, { minHeight: 60 }]} multiline value={form.rules} onChangeText={(v) => setForm({ ...form, rules: v })} placeholder="Opcional" placeholderTextColor={colors.muted} />
          <Text style={s.lbl}>Serviços incluídos (nenhum marcado = todos)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 }}>
            {services.map((sv) => { const on = (form.allowed_service_ids || []).includes(sv.id); return (
              <Pressable key={sv.id} testID={`plan-svc-${sv.name}`} onPress={() => toggleSvc(sv.id)} style={[s.chip, on && s.chipSel]}><Text style={[s.chipTxt, on && { color: colors.onBrandPrimary }]}>{sv.name}</Text></Pressable>
            ); })}
          </View>
          <View style={[s.rowBetween, { marginTop: spacing.md }]}>
            <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Plano ativo (disponível para novos assinantes)</Text>
            <Switch testID="plan-active-switch" value={form.active !== false} onValueChange={(v) => setForm({ ...form, active: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <GoldButton testID="plan-save-btn" label="Salvar" onPress={save} style={{ flex: 1 }} />
            <Pressable testID="plan-cancel-btn" onPress={() => setForm(null)} style={[s.btnGhost, { justifyContent: "center" }]}><Text style={s.btnGhostTxt}>Cancelar</Text></Pressable>
          </View>
        </View>
      ) : (
        <GoldButton testID="new-plan-btn" icon="plus" label="Novo plano" onPress={() => setForm(empty())} />
      )}

      {visible.map((p) => (
        <View key={p.id} style={s.card} testID={`plan-${p.name}`}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 15 }}>{p.name}</Text>
              <Text style={s.hint}>R$ {Number(p.price).toFixed(2)} · {p.cuts} cortes / {p.cycle_days} dias{p.description ? ` · ${p.description}` : ""}</Text>
              {(p.allowed_service_ids || []).length > 0 && <Text style={s.hint}>Serviços: {(p.allowed_service_ids || []).map(svcName).join(", ")}</Text>}
            </View>
            <Badge label={p.active ? "Ativo" : "Inativo"} tone={p.active ? "success" : "default"} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Pressable testID={`plan-edit-${p.name}`} onPress={() => setForm({ ...p, price: String(p.price), cuts: String(p.cuts), cycle_days: String(p.cycle_days) })} style={s.btn}><Icon name="edit-2" size={13} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>Editar</Text></Pressable>
            <Pressable testID={`plan-toggle-${p.name}`} onPress={() => patch(p, { active: !p.active }, p.active ? "Plano desativado" : "Plano ativado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>{p.active ? "Desativar" : "Ativar"}</Text></Pressable>
            <Pressable testID={`plan-delete-${p.name}`} onPress={() => remove(p)} style={[s.btnGhost, { borderColor: colors.error }]}><Text style={[s.btnGhostTxt, { color: colors.onError }]}>Excluir</Text></Pressable>
          </View>
        </View>
      ))}

      {archived.length > 0 && (
        <>
          <Text style={s.sec}>Arquivados ({archived.length})</Text>
          {archived.map((p) => (
            <View key={p.id} style={[s.card, { opacity: 0.75 }]}>
              <View style={s.rowBetween}>
                <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{p.name} · R$ {Number(p.price).toFixed(2)}</Text>
                <Pressable testID={`plan-unarchive-${p.name}`} onPress={() => patch(p, { archived: false, active: true }, "Plano restaurado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>Restaurar</Text></Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={s.sec}>Assinantes ({subs.length})</Text>
      {subs.map((sb) => (
        <View key={sb.id} style={s.card} testID={`sub-${sb.client_name}`}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{sb.client_name}</Text>
              <Text style={s.hint}>{sb.plan_name || "Cliente Mensal"} · R$ {Number(sb.price).toFixed(2)} · {sb.payment_method?.toUpperCase()}</Text>
              <Text style={s.hint}>Usados {sb.cuts_used}/{sb.cuts_total} · Restam {Math.max(0, sb.cuts_total - sb.cuts_used)}</Text>
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
                {["active", "pending_payment", "canceled", "expired"].map((st) => <Pressable key={st} testID={`sub-status-${st}`} onPress={() => setEditing({ ...editing, status: st })} style={[s.chip, editing.status === st && s.chipSel]}><Text style={[s.chipTxt, editing.status === st && { color: colors.onBrandPrimary }]}>{st}</Text></Pressable>)}
              </View>
              <Text style={s.lbl}>Motivo (fica no histórico)</Text>
              <TextInput testID="sub-note-input" style={s.input} value={editing.note || ""} onChangeText={(v) => setEditing({ ...editing, note: v })} placeholder="Ex.: cortesia, correção..." placeholderTextColor={colors.muted} />
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
        </View>
      ))}
      <Text style={[s.hint, { marginTop: spacing.md }]}>Dica: a confirmação de pagamento (PIX, cartão ou dinheiro) das assinaturas pendentes é feita na aba &quot;Mensalistas&quot;.</Text>
    </View>
  );
}
