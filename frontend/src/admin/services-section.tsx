import { useState } from "react";
import { View, Text, TextInput, Pressable, Platform, Alert } from "react-native";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing } from "@/src/theme";
import { api } from "@/src/api";
import { Badge, GoldButton } from "@/src/ui";
import { Flash, s } from "@/src/admin/config-sections";

const empty = () => ({ name: "", description: "", price: "", duration_min: "30", image_url: "" });

function confirmAsync(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((res) => Alert.alert(title, msg, [{ text: "Cancelar", style: "cancel", onPress: () => res(false) }, { text: "Confirmar", style: "destructive", onPress: () => res(true) }]));
}

/** Founder admin: full control of services (create / edit / activate / archive / delete). Prices live in the DB. */
export function ServicesSection({ services, onChanged }: { services: any[]; onChanged: () => void }) {
  const [form, setForm] = useState<any | null>(null); // null = closed; {id?} = editing/creating
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const flash = (m: string) => { setOk(m); setErr(null); setTimeout(() => setOk(null), 2500); };

  const save = async () => {
    setErr(null);
    const body = { name: form.name.trim(), description: form.description || "", price: Number(String(form.price).replace(",", ".")), duration_min: Number(form.duration_min), image_url: form.image_url || "", active: form.active ?? true, archived: form.archived ?? false };
    if (!body.name || isNaN(body.price) || !body.duration_min) { setErr("Informe nome, preço e duração válidos"); return; }
    try {
      if (form.id) await api(`/services/${form.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/services", { method: "POST", body: JSON.stringify(body) });
      setForm(null); onChanged(); flash(form.id ? "Serviço atualizado! Novos agendamentos já usam o novo valor." : "Serviço criado!");
    } catch (e: any) { setErr(e.message); }
  };
  const patch = async (sv: any, p: any, msg: string) => {
    try { await api(`/services/${sv.id}`, { method: "PUT", body: JSON.stringify({ ...sv, ...p }) }); onChanged(); flash(msg); } catch (e: any) { setErr(e.message); }
  };
  const remove = async (sv: any) => {
    if (!(await confirmAsync("Excluir serviço", `Excluir "${sv.name}"? Se houver atendimentos no histórico, ele será arquivado (histórico preservado).`))) return;
    try { const r = await api(`/services/${sv.id}`, { method: "DELETE" }); onChanged(); flash(r.archived ? r.message : "Serviço excluído"); } catch (e: any) { setErr(e.message); }
  };

  const visible = services.filter((x) => !x.archived);
  const archived = services.filter((x) => x.archived);

  return (
    <View>
      <Flash ok={ok} err={err} />
      {form ? (
        <View style={s.card}>
          <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 16 }}>{form.id ? "Editar serviço" : "Novo serviço"}</Text>
          <Text style={s.lbl}>Nome *</Text><TextInput testID="svc-name-input" style={s.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Ex.: Corte Degradê" placeholderTextColor={colors.muted} />
          <Text style={s.lbl}>Descrição</Text><TextInput testID="svc-desc-input" style={s.input} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Opcional" placeholderTextColor={colors.muted} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}><Text style={s.lbl}>Preço (R$) *</Text><TextInput testID="svc-price-input" style={s.input} keyboardType="decimal-pad" value={String(form.price)} onChangeText={(v) => setForm({ ...form, price: v })} placeholder="40,00" placeholderTextColor={colors.muted} /></View>
            <View style={{ flex: 1 }}><Text style={s.lbl}>Duração (min) *</Text><TextInput testID="svc-duration-input" style={s.input} keyboardType="number-pad" value={String(form.duration_min)} onChangeText={(v) => setForm({ ...form, duration_min: v })} placeholderTextColor={colors.muted} /></View>
          </View>
          <Text style={s.lbl}>Link da imagem (opcional)</Text><TextInput testID="svc-image-input" style={s.input} autoCapitalize="none" value={form.image_url} onChangeText={(v) => setForm({ ...form, image_url: v })} placeholder="https://..." placeholderTextColor={colors.muted} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <GoldButton testID="svc-save-btn" label="Salvar" onPress={save} style={{ flex: 1 }} />
            <Pressable testID="svc-cancel-btn" onPress={() => setForm(null)} style={[s.btnGhost, { justifyContent: "center" }]}><Text style={s.btnGhostTxt}>Cancelar</Text></Pressable>
          </View>
        </View>
      ) : (
        <GoldButton testID="new-service-btn" icon="plus" label="Novo serviço" onPress={() => setForm(empty())} />
      )}

      {visible.map((sv) => (
        <View key={sv.id} style={s.card} testID={`service-${sv.name}`}>
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 15 }}>{sv.name}</Text>
              <Text style={s.hint}>R$ {Number(sv.price).toFixed(2)} · {sv.duration_min} min{sv.description ? ` · ${sv.description}` : ""}</Text>
            </View>
            <Badge label={sv.active ? "Ativo" : "Inativo"} tone={sv.active ? "success" : "default"} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
            <Pressable testID={`svc-edit-${sv.name}`} onPress={() => setForm({ ...sv, price: String(sv.price), duration_min: String(sv.duration_min) })} style={s.btn}><Icon name="edit-2" size={13} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>Editar</Text></Pressable>
            <Pressable testID={`svc-toggle-${sv.name}`} onPress={() => patch(sv, { active: !sv.active }, sv.active ? "Serviço desativado" : "Serviço ativado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>{sv.active ? "Desativar" : "Ativar"}</Text></Pressable>
            <Pressable testID={`svc-archive-${sv.name}`} onPress={() => patch(sv, { archived: true, active: false }, "Serviço arquivado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>Arquivar</Text></Pressable>
            <Pressable testID={`svc-delete-${sv.name}`} onPress={() => remove(sv)} style={[s.btnGhost, { borderColor: colors.error }]}><Text style={[s.btnGhostTxt, { color: colors.onError }]}>Excluir</Text></Pressable>
          </View>
        </View>
      ))}

      {archived.length > 0 && (
        <>
          <Text style={s.sec}>Arquivados ({archived.length})</Text>
          {archived.map((sv) => (
            <View key={sv.id} style={[s.card, { opacity: 0.75 }]}>
              <View style={s.rowBetween}>
                <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{sv.name} · R$ {Number(sv.price).toFixed(2)}</Text>
                <Pressable testID={`svc-unarchive-${sv.name}`} onPress={() => patch(sv, { archived: false, active: true }, "Serviço restaurado")} style={s.btnGhost}><Text style={s.btnGhostTxt}>Restaurar</Text></Pressable>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
