import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { Badge, Card, GoldButton, STATUS_LABELS, statusTone } from "@/src/ui";
import { Logo, useBranding } from "@/src/branding";

function fmtDate(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [nextApt, setNextApt] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const branding = useBranding();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const load = useCallback(async () => {
    const u = await getUser();
    setUser(u);
    try {
      const s = await api("/subscription/me");
      setSub(s);
      const apts = await api("/appointments/me");
      const upcoming = apts.filter((a: any) => ["agendado", "pago", "pagamento_pendente"].includes(a.status))
        .sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
      setNextApt(upcoming[0] || null);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const remaining = sub ? sub.cuts_total - sub.cuts_used : 0;
  const isSubActive = sub && sub.status === "active";

  const todayStr = fmtDate(new Date());
  const tomorrowStr = fmtDate(new Date(Date.now() + 86400000));
  const reminderWhen = nextApt?.date === todayStr ? "hoje" : nextApt?.date === tomorrowStr ? "amanhã" : null;

  const confirmPresence = async () => {
    if (!nextApt) return;
    setConfirming(true);
    try {
      const updated = await api(`/appointments/${nextApt.id}/confirm-presence`, { method: "POST" });
      setNextApt(updated);
    } catch {}
    finally { setConfirming(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Logo size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
            <Text style={styles.brand}>{branding.name.toUpperCase()}</Text>
          </View>
        </View>

        {/* Cliente Mensal hero */}
        <Pressable testID="mensal-hero" onPress={() => router.push("/(client)/mensal")} style={{ marginHorizontal: spacing.xl }}>
          <View style={styles.hero}>
            <Image
              source="https://images.unsplash.com/photo-1605497788044-5a32c7078486?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
              style={StyleSheet.absoluteFill as any}
              contentFit="cover"
            />
            <LinearGradient
              colors={["rgba(10,10,10,0.4)", "rgba(10,10,10,0.95)"]}
              style={StyleSheet.absoluteFill as any}
            />
            <View style={{ padding: spacing.xl }}>
              <Text style={styles.heroLabel}>CLIENTE MENSAL</Text>
              {isSubActive ? (
                <>
                  <Text style={styles.heroBig}>{remaining}<Text style={{ color: colors.muted, fontSize: 22 }}> / {sub.cuts_total}</Text></Text>
                  <Text style={styles.heroCaption}>cortes restantes neste ciclo</Text>
                  <Badge label="Plano ativo" tone="gold" />
                </>
              ) : (
                <>
                  <Text style={styles.heroTitle}>Assine e tenha 4 cortes/mês</Text>
                  <Text style={styles.heroCaption}>Toque para conhecer o plano</Text>
                </>
              )}
            </View>
          </View>
        </Pressable>

        {/* Reminder: appointment today/tomorrow */}
        {nextApt && reminderWhen && (
          <View testID="reminder-card" style={styles.reminder}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Icon name="bell" size={18} color={colors.brandPrimary} />
              <Text style={styles.reminderLabel}>LEMBRETE</Text>
            </View>
            <Text style={styles.reminderTitle}>
              Seu {nextApt.service_name} é {reminderWhen} às <Text style={{ color: colors.brandPrimary }}>{nextApt.time}</Text>
            </Text>
            {nextApt.presence_confirmed ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm }}>
                <Icon name="check-circle" size={16} color={colors.onSuccess} />
                <Text style={styles.reminderOk}>Presença confirmada. Te esperamos!</Text>
              </View>
            ) : (
              <>
                <Text style={styles.reminderSub}>Confirme sua presença para garantirmos seu horário.</Text>
                <GoldButton
                  testID="confirm-presence-btn"
                  icon="check"
                  label={confirming ? "Confirmando..." : "Confirmar presença"}
                  disabled={confirming}
                  onPress={confirmPresence}
                  style={{ marginTop: spacing.md }}
                />
              </>
            )}
          </View>
        )}

        {/* Next appointment */}
        {nextApt && (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <Text style={styles.section}>Próximo atendimento</Text>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aptSvc}>{nextApt.service_name}</Text>
                  <Text style={styles.aptTime}>{nextApt.date} · {nextApt.time}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Badge label={STATUS_LABELS[nextApt.status]} tone={statusTone(nextApt.status)} />
                  {nextApt.presence_confirmed && <Badge label="Presença confirmada" tone="success" />}
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* Quick actions */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
          <Text style={styles.section}>O que deseja fazer?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            <QuickAction testID="qa-agendar" icon="calendar" label="Agendar horário" onPress={() => router.push("/(client)/agendar")} />
            <QuickAction testID="qa-fila" icon="users" label="Entrar na fila" onPress={() => router.push("/(client)/fila")} />
            <QuickAction testID="qa-mensal" icon="award" label="Cliente Mensal" onPress={() => router.push("/(client)/mensal")} />
            <QuickAction testID="qa-perfil" icon="user" label="Meu perfil" onPress={() => router.push("/(client)/perfil")} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.qa}>
      <Icon name={icon} size={22} color={colors.brandPrimary} />
      <Text style={styles.qaLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hello: { color: colors.muted, fontSize: 13, letterSpacing: 1 },
  brand: { color: colors.onSurface, fontSize: 22, fontWeight: "700", letterSpacing: 2, marginTop: 2 },
  section: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md },
  hero: { height: 200, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: colors.border },
  heroLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  heroBig: { color: colors.onSurface, fontSize: 48, fontWeight: "800", marginTop: 4 },
  heroCaption: { color: colors.muted, fontSize: 13, marginBottom: spacing.md },
  heroTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "700", marginTop: 4 },
  aptSvc: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  aptTime: { color: colors.muted, fontSize: 13, marginTop: 4 },
  reminder: { marginHorizontal: spacing.xl, marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  reminderLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  reminderTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700", marginTop: spacing.sm },
  reminderSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  reminderOk: { color: colors.onSuccess, fontSize: 13, fontWeight: "600" },
  qa: {
    width: "48%", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, minHeight: 90,
  },
  qaLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
});
