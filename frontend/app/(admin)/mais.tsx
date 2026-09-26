import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, clearSession } from "@/src/api";
import { GhostButton } from "@/src/ui";

export default function Mais() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"services" | "settings" | "clients" | "finance">("services");
  const router = useRouter();

  const [services, setServices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [finance, setFinance] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [s, cfg, c, f] = await Promise.all([api("/services"), api("/settings"), api("/admin/clients"), api("/admin/finance")]);
      setServices(s); setSettings(cfg); setClients(c); setFinance(f);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const updateSvc = async (id: string, patch: any) => {
    const s = services.find((x) => x.id === id); if (!s) return;
    await api(`/services/${id}`, { method: "PUT", body: JSON.stringify({ ...s, ...patch }) });
    await load();
  };
  const updateDay = async (weekday: number, mode: string) => {
    const d = settings.days.find((x: any) => x.weekday === weekday);
    await api("/settings/day", { method: "PUT", body: JSON.stringify({ weekday, mode, open_time: d.open_time, close_time: d.close_time }) });
    await load();
  };
  const logout = async () => { await clearSession(); router.replace("/(auth)/login"); };

  const DAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
        <Text style={styles.h1}>Mais</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          {[
            { k: "services", l: "Serviços" },
            { k: "settings", l: "Horários" },
            { k: "clients", l: "Clientes" },
            { k: "finance", l: "Financeiro" },
          ].map((t) => (
            <Pressable key={t.k} testID={`tab-${t.k}`} onPress={() => setTab(t.k as any)} style={[styles.chip, tab === t.k && styles.chipSel]}>
              <Text style={[styles.chipTxt, tab === t.k && { color: colors.onBrandPrimary }]}>{t.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"] }}>
        {tab === "services" && services.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.meta}>{s.duration_min} min</Text>
              </View>
              <Pressable testID={`toggle-${s.id}`} onPress={() => updateSvc(s.id, { active: !s.active })} style={[styles.pill, { backgroundColor: s.active ? colors.brandPrimary : colors.surfaceTertiary }]}>
                <Text style={{ color: s.active ? colors.onBrandPrimary : colors.muted, fontWeight: "700", fontSize: 12 }}>{s.active ? "ATIVO" : "INATIVO"}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>Preço R$</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" defaultValue={String(s.price)} onEndEditing={(e) => updateSvc(s.id, { price: Number(e.nativeEvent.text) })} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lbl}>Duração (min)</Text>
                <TextInput style={styles.input} keyboardType="number-pad" defaultValue={String(s.duration_min)} onEndEditing={(e) => updateSvc(s.id, { duration_min: Number(e.nativeEvent.text) })} />
              </View>
            </View>
          </View>
        ))}

        {tab === "settings" && settings && (
          <View>
            <Text style={styles.sec}>Modo de operação por dia</Text>
            {settings.days.sort((a: any, b: any) => a.weekday - b.weekday).map((d: any) => (
              <View key={d.weekday} style={styles.card}>
                <Text style={styles.name}>{DAYS[d.weekday]}</Text>
                <Text style={styles.meta}>{d.open_time} - {d.close_time}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
                  {["agenda", "fila", "fechado"].map((m) => (
                    <Pressable key={m} testID={`day-${d.weekday}-${m}`} onPress={() => updateDay(d.weekday, m)} style={[styles.modeChip, d.mode === m && styles.modeChipSel]}>
                      <Text style={[styles.chipTxt, d.mode === m && { color: colors.onBrandPrimary }]}>{m.toUpperCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Text style={[styles.sec, { marginTop: spacing.lg }]}>Cancelamento mínimo: {settings.cancel_hours}h</Text>
          </View>
        )}

        {tab === "clients" && clients.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.meta}>{c.phone} · {c.email}</Text>
          </View>
        ))}

        {tab === "finance" && finance && (
          <View style={{ gap: spacing.md }}>
            <View style={styles.card}><Text style={styles.lbl}>Hoje</Text><Text style={styles.big}>R$ {Number(finance.today).toFixed(2)}</Text></View>
            <View style={styles.card}><Text style={styles.lbl}>Últimos 7 dias</Text><Text style={styles.big}>R$ {Number(finance.week).toFixed(2)}</Text></View>
            <View style={styles.card}><Text style={styles.lbl}>Últimos 30 dias</Text><Text style={styles.big}>R$ {Number(finance.month).toFixed(2)}</Text></View>
            <View style={styles.card}>
              <Text style={styles.lbl}>Por método</Text>
              {Object.entries(finance.by_method).map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ color: colors.onSurface }}>{k.toUpperCase()}</Text>
                  <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>R$ {Number(v).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <GhostButton testID="admin-logout" label="Sair" onPress={logout} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 26, fontWeight: "700" },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md },
  chip: { paddingHorizontal: 14, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  chipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  modeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  modeChipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  lbl: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  big: { color: colors.brandPrimary, fontSize: 26, fontWeight: "800", marginTop: 4 },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
});
