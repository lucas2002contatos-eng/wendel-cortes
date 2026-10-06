import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Switch, ActivityIndicator, Alert, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { Badge, GoldButton, GhostButton } from "@/src/ui";
import { BarberAvatar } from "@/src/components/barber-picker";

const WD_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WD_CHIP = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const defaultHours = () => Array.from({ length: 7 }, (_, i) => ({ weekday: i, enabled: i < 6, start: "09:00", end: "18:00" }));
const emptyForm = () => ({ name: "", phone: "", photo_url: "", description: "", active: true, work_hours: defaultHours(), commission_pct: "", pix_key: "", pix_key_type: "aleatoria", pix_holder_name: "", service_ids: [] });
function fmt(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
const fmtBr = (s: string) => s.split("-").reverse().join("/");

function confirmAsync(title: string, msg: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${msg}`));
  return new Promise((res) => Alert.alert(title, msg, [{ text: "Cancelar", style: "cancel", onPress: () => res(false) }, { text: "Confirmar", style: "destructive", onPress: () => res(true) }]));
}

function hoursSummary(wh: any[]) {
  const on = (wh || []).filter((h) => h.enabled);
  if (on.length === 0) return "Sem horários";
  const groups: string[] = [];
  let i = 0;
  while (i < on.length) {
    let j = i;
    while (j + 1 < on.length && on[j + 1].weekday === on[j].weekday + 1 && on[j + 1].start === on[i].start && on[j + 1].end === on[i].end) j++;
    groups.push(`${WD_SHORT[on[i].weekday]}${j > i ? `–${WD_SHORT[on[j].weekday]}` : ""} ${on[i].start}–${on[i].end}`);
    i = j + 1;
  }
  return groups.join(" · ");
}

type Tab = "team" | "schedule" | "blocks";

export default function Barbeiros() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("team");
  const [barbers, setBarbers] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<any | null>(null); // form state (new or existing)
  const [account, setAccount] = useState<any | null>(null);
  const [acc, setAcc] = useState({ email: "", password: "" });
  const [accMsg, setAccMsg] = useState<string | null>(null);
  const openEdit = async (b: any) => {
    setErr(null); setAccMsg(null); setAcc({ email: "", password: "" }); setAccount(null);
    setEditing({ ...b, commission_pct: b.commission_pct ?? "", work_hours: b.work_hours?.length ? b.work_hours : defaultHours() });
    try { const a = await api(`/admin/barbers/${b.id}/account`); setAccount(a); if (a) setAcc({ email: a.email, password: "" }); } catch {}
  };
  const saveAccount = async () => {
    setErr(null); setAccMsg(null);
    try { const a = await api(`/admin/barbers/${editing.id}/account`, { method: "POST", body: JSON.stringify(acc) }); setAccount(a); setAcc({ ...acc, password: "" }); setAccMsg(`Acesso ${account ? "redefinido" : "criado"}: ${a.email}`); }
    catch (e: any) { setErr(e.message); }
  };
  const removeAccount = async () => {
    try { await api(`/admin/barbers/${editing.id}/account`, { method: "DELETE" }); setAccount(null); setAcc({ email: "", password: "" }); setAccMsg("Acesso removido"); } catch (e: any) { setErr(e.message); }
  };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // schedule (day staffing)
  const [dates] = useState<Date[]>(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }));
  const [selDate, setSelDate] = useState<string>(fmt(new Date()));
  const [schedule, setSchedule] = useState<any[] | null>(null);

  // blocks
  const [blockBarber, setBlockBarber] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [blockForm, setBlockForm] = useState({ date: fmt(new Date()), time: "12:00", reason: "" });

  const load = useCallback(async () => {
    try {
      const list = await api("/barbers");
      setBarbers(list);
      if (!blockBarber && list.length) setBlockBarber(list[0].id);
    } catch (e: any) { setErr(e.message); }
  }, [blockBarber]);
  const loadSchedule = useCallback(async () => {
    try { setSchedule(await api(`/barbers/schedule/${selDate}`)); } catch {}
  }, [selDate]);
  const loadBlocks = useCallback(async () => {
    if (!blockBarber) return;
    try { setBlocks(await api(`/barbers/${blockBarber}/blocks?from_date=${fmt(new Date())}`)); } catch {}
  }, [blockBarber]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { if (tab === "schedule") loadSchedule(); }, [tab, loadSchedule]));
  useFocusEffect(useCallback(() => { if (tab === "blocks") loadBlocks(); }, [tab, loadBlocks]));

  const flash = (m: string) => { setOk(m); setErr(null); setTimeout(() => setOk(null), 2500); };

  const save = async () => {
    if (!editing.name.trim()) { setErr("Informe o nome do barbeiro"); return; }
    setSaving(true); setErr(null);
    const body = { ...editing, commission_pct: editing.commission_pct === "" ? null : Number(editing.commission_pct), pix_key_type: editing.pix_key_type || "aleatoria", service_ids: editing.service_ids || [] };
    try {
      if (editing.id) await api(`/barbers/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/barbers", { method: "POST", body: JSON.stringify(body) });
      setEditing(null); await load(); flash(editing.id ? "Barbeiro atualizado!" : "Barbeiro cadastrado!");
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (b: any) => {
    try { await api(`/barbers/${b.id}/active`, { method: "PATCH", body: JSON.stringify({ active: !b.active }) }); await load(); flash(b.active ? `${b.name} desativado` : `${b.name} ativado`); }
    catch (e: any) { setErr(e.message); }
  };

  const remove = async (b: any) => {
    if (!(await confirmAsync("Excluir barbeiro", `Excluir ${b.name}? Os atendimentos já registrados serão mantidos.`))) return;
    try { await api(`/barbers/${b.id}`, { method: "DELETE" }); await load(); flash("Barbeiro excluído"); } catch (e: any) { setErr(e.message); }
  };

  const setOverride = async (b: any, working: boolean | null) => {
    try {
      if (working === null) await api(`/barbers/${b.id}/day-override/${selDate}`, { method: "DELETE" });
      else await api(`/barbers/${b.id}/day-override`, { method: "PUT", body: JSON.stringify({ date: selDate, working }) });
      await loadSchedule();
    } catch (e: any) { setErr(e.message); }
  };

  const addBlock = async () => {
    if (!blockBarber) return;
    setErr(null);
    try { await api(`/barbers/${blockBarber}/blocks`, { method: "POST", body: JSON.stringify(blockForm) }); await loadBlocks(); flash("Horário bloqueado"); }
    catch (e: any) { setErr(e.message); }
  };
  const removeBlock = async (id: string) => {
    try { await api(`/barbers/blocks/${id}`, { method: "DELETE" }); await loadBlocks(); } catch (e: any) { setErr(e.message); }
  };

  const updHour = (wd: number, patch: any) => setEditing({ ...editing, work_hours: editing.work_hours.map((h: any) => (h.weekday === wd ? { ...h, ...patch } : h)) });

  // ------------------------------------------------------------- form view
  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]} keyboardShouldPersistTaps="handled">
          <Pressable testID="barber-form-back" onPress={() => setEditing(null)} style={styles.back}><Icon name="arrow-left" size={18} color={colors.muted} /><Text style={styles.backTxt}>Voltar</Text></Pressable>
          <Text style={styles.h1}>{editing.id ? "Editar barbeiro" : "Novo barbeiro"}</Text>

          <View style={[styles.card, { alignItems: "center", gap: spacing.sm }]}>
            <BarberAvatar barber={editing} size={84} />
            <Text style={styles.hint}>A foto é carregada a partir do link informado abaixo.</Text>
          </View>

          <Text style={styles.lbl}>Nome *</Text>
          <TextInput testID="barber-name-input" style={styles.input} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} placeholder="Ex.: Wendel" placeholderTextColor={colors.muted} />
          <Text style={styles.lbl}>Telefone</Text>
          <TextInput testID="barber-phone-input" style={styles.input} value={editing.phone} onChangeText={(v) => setEditing({ ...editing, phone: v })} keyboardType="phone-pad" placeholder="11999999999" placeholderTextColor={colors.muted} />
          <Text style={styles.lbl}>Link da foto</Text>
          <TextInput testID="barber-photo-input" style={styles.input} value={editing.photo_url} onChangeText={(v) => setEditing({ ...editing, photo_url: v })} autoCapitalize="none" placeholder="https://..." placeholderTextColor={colors.muted} />
          <Text style={styles.lbl}>Descrição</Text>
          <TextInput testID="barber-desc-input" style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]} multiline value={editing.description} onChangeText={(v) => setEditing({ ...editing, description: v })} placeholder="Especialidades, experiência..." placeholderTextColor={colors.muted} />
          <Text style={styles.lbl}>Comissão (%) — opcional, preparado para uso futuro</Text>
          <TextInput testID="barber-commission-input" style={styles.input} value={String(editing.commission_pct ?? "")} onChangeText={(v) => setEditing({ ...editing, commission_pct: v.replace(",", ".") })} keyboardType="decimal-pad" placeholder="Ex.: 40" placeholderTextColor={colors.muted} />

          <Text style={styles.sec}>PIX do barbeiro (usado quando o modo PIX for "individual por barbeiro")</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
            {["cpf", "cnpj", "telefone", "email", "aleatoria"].map((t) => (
              <Pressable key={t} testID={`barber-pix-type-${t}`} onPress={() => setEditing({ ...editing, pix_key_type: t })} style={[styles.chip, (editing.pix_key_type || "aleatoria") === t && styles.chipSel]}><Text style={[styles.chipTxt, (editing.pix_key_type || "aleatoria") === t && { color: colors.onBrandPrimary }]}>{t}</Text></Pressable>
            ))}
          </View>
          <Text style={styles.lbl}>Chave PIX</Text>
          <TextInput testID="barber-pix-key-input" style={styles.input} autoCapitalize="none" value={editing.pix_key || ""} onChangeText={(v) => setEditing({ ...editing, pix_key: v })} placeholder="Deixe vazio para usar a chave da barbearia" placeholderTextColor={colors.muted} />
          <Text style={styles.lbl}>Nome do favorecido (até 25 letras)</Text>
          <TextInput testID="barber-pix-holder-input" style={styles.input} maxLength={25} value={editing.pix_holder_name || ""} onChangeText={(v) => setEditing({ ...editing, pix_holder_name: v })} placeholder={editing.name || "Nome"} placeholderTextColor={colors.muted} />

          {editing.id && (
            <>
              <Text style={styles.sec}>Conta de acesso ao site</Text>
              <Text style={styles.hint}>{account ? `Acesso ativo: ${account.email}. Informe uma nova senha para redefinir.` : "O barbeiro ainda não tem login. Crie um e-mail e senha para ele acessar a própria agenda e fila."}</Text>
              <Text style={styles.lbl}>E-mail de acesso</Text>
              <TextInput testID="barber-account-email" style={styles.input} autoCapitalize="none" keyboardType="email-address" value={acc.email} onChangeText={(v) => setAcc({ ...acc, email: v })} placeholder="barbeiro@email.com" placeholderTextColor={colors.muted} />
              <Text style={styles.lbl}>Senha {account ? "(nova)" : ""}</Text>
              <TextInput testID="barber-account-password" style={styles.input} secureTextEntry value={acc.password} onChangeText={(v) => setAcc({ ...acc, password: v })} placeholder="mínimo 6 caracteres" placeholderTextColor={colors.muted} />
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                <Pressable testID="barber-account-save" onPress={saveAccount} style={styles.btn}><Icon name="key" size={14} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>{account ? "Redefinir acesso" : "Criar acesso"}</Text></Pressable>
                {account && <Pressable testID="barber-account-remove" onPress={removeAccount} style={[styles.btnGhost, { borderColor: colors.error }]}><Text style={[styles.btnGhostTxt, { color: colors.onError }]}>Remover acesso</Text></Pressable>}
              </View>
              {accMsg && <Text style={styles.okTxt}>{accMsg}</Text>}
            </>
          )}

          <View style={[styles.rowBetween, { marginTop: spacing.lg }]}>
            <Text style={styles.lblInline}>Barbeiro ativo</Text>
            <Switch testID="barber-active-switch" value={editing.active} onValueChange={(v) => setEditing({ ...editing, active: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} />
          </View>

          <Text style={styles.sec}>Horários de trabalho</Text>
          {editing.work_hours.map((h: any) => (
            <View key={h.weekday} style={styles.hourRow}>
              <Switch testID={`wh-${h.weekday}-switch`} value={h.enabled} onValueChange={(v) => updHour(h.weekday, { enabled: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} />
              <Text style={styles.hourDay}>{WD_SHORT[h.weekday]}</Text>
              <TextInput testID={`wh-${h.weekday}-start`} style={[styles.timeInput, !h.enabled && { opacity: 0.4 }]} editable={h.enabled} value={h.start} onChangeText={(v) => updHour(h.weekday, { start: v })} placeholder="09:00" placeholderTextColor={colors.muted} />
              <Text style={{ color: colors.muted }}>–</Text>
              <TextInput testID={`wh-${h.weekday}-end`} style={[styles.timeInput, !h.enabled && { opacity: 0.4 }]} editable={h.enabled} value={h.end} onChangeText={(v) => updHour(h.weekday, { end: v })} placeholder="18:00" placeholderTextColor={colors.muted} />
            </View>
          ))}

          {err && <Text style={styles.errTxt}>{err}</Text>}
          <GoldButton testID="barber-save-btn" label={saving ? "Salvando..." : "Salvar barbeiro"} disabled={saving} onPress={save} style={{ marginTop: spacing.xl }} />
          <GhostButton label="Cancelar" onPress={() => setEditing(null)} style={{ marginTop: spacing.sm }} />
        </ScrollView>
      </View>
    );
  }

  // ------------------------------------------------------------- main view
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Barbeiros</Text>
        <Text style={styles.subTitle}>Equipe, escala do dia e bloqueios de horário</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.lg }}>
          {([{ k: "team", l: "Equipe" }, { k: "schedule", l: "Escala do dia" }, { k: "blocks", l: "Bloqueios" }] as { k: Tab; l: string }[]).map((t) => (
            <Pressable key={t.k} testID={`barbers-tab-${t.k}`} onPress={() => setTab(t.k)} style={[styles.chip, tab === t.k && styles.chipSel]}>
              <Text style={[styles.chipTxt, tab === t.k && { color: colors.onBrandPrimary }]}>{t.l}</Text>
            </Pressable>
          ))}
        </View>
        {ok && <Text style={styles.okTxt}>{ok}</Text>}
        {err && !editing && <Text style={styles.errTxt}>{err}</Text>}

        {tab === "team" && (
          <>
            <GoldButton testID="new-barber-btn" icon="user-plus" label="Novo barbeiro" onPress={() => { setErr(null); setEditing(emptyForm()); }} />
            {barbers === null ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> :
              barbers.length === 0 ? <Text style={styles.empty}>Nenhum barbeiro cadastrado.</Text> :
              barbers.map((b) => (
                <View key={b.id} style={[styles.card, !b.active && { opacity: 0.7 }]} testID={`barber-card-${b.name}`}>
                  <View style={{ flexDirection: "row", gap: spacing.md, alignItems: "center" }}>
                    <BarberAvatar barber={b} size={52} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{b.name}</Text>
                      {!!b.description && <Text style={styles.desc} numberOfLines={2}>{b.description}</Text>}
                      <Text style={styles.meta}>{hoursSummary(b.work_hours)}</Text>
                      {!!b.phone && <Text style={styles.meta}>{b.phone}</Text>}
                    </View>
                    <Badge label={b.archived ? "Arquivado" : b.active ? "Ativo" : "Inativo"} tone={b.active ? "success" : "default"} />
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                    <Pressable testID={`edit-barber-${b.name}`} onPress={() => openEdit(b)} style={styles.btn}><Icon name="edit-2" size={14} color={colors.onBrandPrimary} /><Text style={styles.btnTxt}>Editar</Text></Pressable>
                    <Pressable testID={`toggle-barber-${b.name}`} onPress={() => toggleActive(b)} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>{b.active ? "Desativar" : "Ativar"}</Text></Pressable>
                    <Pressable testID={`blocks-barber-${b.name}`} onPress={() => { setBlockBarber(b.id); setTab("blocks"); }} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>Bloqueios</Text></Pressable>
                    <Pressable testID={`delete-barber-${b.name}`} onPress={() => remove(b)} style={[styles.btnGhost, { borderColor: colors.error }]}><Text style={[styles.btnGhostTxt, { color: colors.onError }]}>Excluir</Text></Pressable>
                  </View>
                </View>
              ))}
          </>
        )}

        {tab === "schedule" && (
          <>
            <Text style={styles.sec}>Quem trabalha em</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {dates.map((d) => { const ds = fmt(d); const s = selDate === ds; return (
                <Pressable key={ds} testID={`sched-date-${ds}`} onPress={() => setSelDate(ds)} style={[styles.dateChip, s && styles.dateChipSel]}>
                  <Text style={[styles.dateDay, s && { color: colors.onBrandPrimary }]}>{WD_CHIP[d.getDay()]}</Text>
                  <Text style={[styles.dateNum, s && { color: colors.onBrandPrimary }]}>{d.getDate()}</Text>
                </Pressable>
              ); })}
            </ScrollView>
            {schedule === null ? <ActivityIndicator color={colors.brandPrimary} /> : schedule.map((b) => (
              <View key={b.id} style={styles.card} testID={`sched-${b.name}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <BarberAvatar barber={b} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{b.name}{!b.active ? " (inativo)" : ""}</Text>
                    <Text style={styles.meta}>{b.working ? `Trabalha · ${b.window.start}–${b.window.end}` : "Folga neste dia"}{b.override ? " · ajuste manual" : ""}</Text>
                  </View>
                  <Badge label={b.working ? "Disponível" : "Folga"} tone={b.working ? "success" : "default"} />
                </View>
                {b.active && (
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
                    <Pressable testID={`sched-toggle-${b.name}`} onPress={() => setOverride(b, !b.working)} style={styles.btn}><Text style={styles.btnTxt}>{b.working ? "Marcar folga" : "Marcar como trabalhando"}</Text></Pressable>
                    {b.override && <Pressable testID={`sched-reset-${b.name}`} onPress={() => setOverride(b, null)} style={styles.btnGhost}><Text style={styles.btnGhostTxt}>Usar horário padrão</Text></Pressable>}
                  </View>
                )}
              </View>
            ))}
            <Text style={styles.hint}>Barbeiros marcados como disponíveis aparecem para os clientes no agendamento e na fila deste dia.</Text>
          </>
        )}

        {tab === "blocks" && (
          <>
            <Text style={styles.sec}>Barbeiro</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {(barbers || []).map((b) => (
                <Pressable key={b.id} testID={`block-barber-${b.name}`} onPress={() => setBlockBarber(b.id)} style={[styles.chip, blockBarber === b.id && styles.chipSel]}>
                  <Text style={[styles.chipTxt, blockBarber === b.id && { color: colors.onBrandPrimary }]}>{b.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.card}>
              <Text style={styles.lbl}>Data (AAAA-MM-DD)</Text>
              <TextInput testID="block-date-input" style={styles.input} value={blockForm.date} onChangeText={(v) => setBlockForm({ ...blockForm, date: v })} placeholder="2026-10-10" placeholderTextColor={colors.muted} />
              <Text style={styles.lbl}>Horário (HH:MM)</Text>
              <TextInput testID="block-time-input" style={styles.input} value={blockForm.time} onChangeText={(v) => setBlockForm({ ...blockForm, time: v })} placeholder="12:00" placeholderTextColor={colors.muted} />
              <Text style={styles.lbl}>Motivo (opcional)</Text>
              <TextInput testID="block-reason-input" style={styles.input} value={blockForm.reason} onChangeText={(v) => setBlockForm({ ...blockForm, reason: v })} placeholder="Almoço, compromisso..." placeholderTextColor={colors.muted} />
              <GoldButton testID="block-save-btn" icon="lock" label="Bloquear horário" onPress={addBlock} style={{ marginTop: spacing.md }} />
              <Text style={styles.hint}>Cada bloqueio reserva 30 minutos. Para um período maior, adicione vários horários.</Text>
            </View>
            <Text style={styles.sec}>Bloqueios futuros</Text>
            {blocks.length === 0 ? <Text style={styles.empty}>Nenhum bloqueio.</Text> : blocks.map((bl) => (
              <View key={bl.id} style={[styles.card, { flexDirection: "row", alignItems: "center", gap: spacing.md }]} testID={`block-${bl.id}`}>
                <Icon name="lock" size={16} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, flex: 1 }}>{fmtBr(bl.date)} às {bl.time}{bl.reason ? ` · ${bl.reason}` : ""}</Text>
                <Pressable testID={`unblock-${bl.id}`} onPress={() => removeBlock(bl.id)} style={styles.iconBtn}><Icon name="trash-2" size={16} color={colors.onError} /></Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"], width: "100%", maxWidth: 760, alignSelf: "center" },
  h1: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  subTitle: { color: colors.muted, marginTop: 4 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md, minHeight: 44 },
  backTxt: { color: colors.muted, fontSize: 13 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.md },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  desc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostTxt: { color: colors.onSurface, fontWeight: "600", fontSize: 12 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.error },
  lbl: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  lblInline: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hourRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  hourDay: { color: colors.onSurface, width: 36, fontWeight: "600" },
  timeInput: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, width: 72, textAlign: "center", fontVariant: ["tabular-nums"] as any },
  hint: { color: colors.muted, fontSize: 11, marginTop: spacing.md },
  empty: { color: colors.muted, fontStyle: "italic", marginTop: spacing.lg },
  errTxt: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
  okTxt: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.md },
  dateChip: { width: 60, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  dateChipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  dateDay: { color: colors.muted, fontSize: 10, letterSpacing: 1 },
  dateNum: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
});
