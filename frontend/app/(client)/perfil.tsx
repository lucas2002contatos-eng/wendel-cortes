import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, clearSession, getUser, getToken, setSession } from "@/src/api";
import { Badge, GhostButton, GoldButton, STATUS_LABELS, statusTone } from "@/src/ui";

const fmtBr = (d?: string) => (d ? d.split("-").reverse().join("/") : "");

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<any>(null);
  const [apts, setApts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const u = await getUser(); setUser(u);
    try { setApts(await api("/appointments/me")); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logout = async () => { await clearSession(); router.replace("/(auth)/login"); };
  const [edit, setEdit] = useState<any | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const saveProfile = async () => {
    setEditErr(null);
    try {
      const u = await api("/auth/me", { method: "PUT", body: JSON.stringify(edit) });
      const t = await getToken(); if (t) await setSession(t, u);
      setUser(u); setEdit(null);
    } catch (e: any) { setEditErr(e.message); }
  };
  const cancel = async (id: string) => {
    try { await api(`/appointments/${id}/cancel`, { method: "POST" }); await load(); }
    catch (e: any) { alert(e.message); }
  };

  const upcoming = apts.filter((a) => !["cancelado", "concluido", "nao_compareceu"].includes(a.status));
  const history = apts.filter((a) => ["cancelado", "concluido", "nao_compareceu"].includes(a.status));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"], paddingHorizontal: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{user?.name?.[0] || "?"}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.meta}>{user?.phone}</Text>
            <Text style={styles.meta}>{user?.email}</Text>
          </View>
          <Pressable testID="edit-profile-btn" onPress={() => setEdit(edit ? null : { name: user?.name || "", phone: user?.phone || "" })} style={styles.cancelBtn}>
            <Icon name={edit ? "x" : "edit-2"} size={16} color={colors.onSurface} />
          </Pressable>
        </View>
        {edit && (
          <View style={styles.apt}>
            <View style={{ flex: 1 }}>
              <Text style={styles.meta}>Nome</Text>
              <TextInput testID="profile-name-input" style={styles.input} value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} />
              <Text style={styles.meta}>Telefone (WhatsApp)</Text>
              <TextInput testID="profile-phone-input" style={styles.input} keyboardType="phone-pad" value={edit.phone} onChangeText={(v) => setEdit({ ...edit, phone: v })} />
              {editErr && <Text style={{ color: colors.onError, marginTop: 6 }}>{editErr}</Text>}
              <GoldButton testID="profile-save-btn" label="Salvar dados" onPress={saveProfile} style={{ marginTop: spacing.md }} />
            </View>
          </View>
        )}

        <Text style={styles.sec}>Próximos atendimentos</Text>
        {upcoming.length === 0 ? <Text style={styles.empty}>Nenhum agendamento futuro.</Text> :
          upcoming.map((a) => (
            <View key={a.id} style={styles.apt}>
              <View style={{ flex: 1 }}>
                <Text style={styles.aptSvc}>{a.service_name}</Text>
                <Text style={styles.aptMeta}>{a.barber_name ? `com ${a.barber_name} · ` : ""}{fmtBr(a.date)} · {a.time} · R$ {Number(a.price).toFixed(2)}</Text>
                <View style={{ marginTop: 6 }}><Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} /></View>
              </View>
              <Pressable testID={`cancel-${a.id}`} onPress={() => cancel(a.id)} style={styles.cancelBtn}>
                <Icon name="x" size={16} color={colors.onError} />
              </Pressable>
            </View>
          ))
        }

        <Text style={styles.sec}>Histórico</Text>
        {history.length === 0 ? <Text style={styles.empty}>Sem histórico ainda.</Text> :
          history.map((a) => (
            <View key={a.id} style={styles.apt}>
              <View style={{ flex: 1 }}>
                <Text style={styles.aptSvc}>{a.service_name}</Text>
                <Text style={styles.aptMeta}>{a.status === "concluido" ? "realizado" : STATUS_LABELS[a.status]?.toLowerCase()}{a.barber_name ? ` com ${a.barber_name}` : ""} — {fmtBr(a.date)} — {a.time}</Text>
                <View style={{ marginTop: 6, flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <Badge label={STATUS_LABELS[a.status]} tone={statusTone(a.status)} />
                  {a.used_mensal && <Badge label={a.mensal_consumed ? "Consumiu 1 corte do ciclo mensal" : "Cliente Mensal"} tone="gold" />}
                </View>
              </View>
            </View>
          ))
        }

        <GhostButton testID="logout-btn" label="Sair" onPress={logout} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginBottom: spacing.xl },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: colors.onBrandPrimary, fontSize: 28, fontWeight: "800" },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { color: colors.muted, fontStyle: "italic" },
  apt: { flexDirection: "row", alignItems: "center", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: spacing.sm },
  aptSvc: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  aptMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  cancelBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 4, marginBottom: spacing.sm, minHeight: 44 },
});
