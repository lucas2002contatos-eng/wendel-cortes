import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getUser } from "@/src/api";
import { Badge, Card, STATUS_LABELS, statusTone } from "@/src/ui";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [nextApt, setNextApt] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
          <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
          <Text style={styles.brand}>WENDEL <Text style={{ color: colors.brandPrimary }}>CORTES</Text></Text>
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
                <Badge label={STATUS_LABELS[nextApt.status]} tone={statusTone(nextApt.status)} />
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
  brand: { color: colors.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: 3, marginTop: 4 },
  section: { color: colors.muted, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md },
  hero: { height: 200, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: colors.border },
  heroLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  heroBig: { color: colors.onSurface, fontSize: 48, fontWeight: "800", marginTop: 4 },
  heroCaption: { color: colors.muted, fontSize: 13, marginBottom: spacing.md },
  heroTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "700", marginTop: 4 },
  aptSvc: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  aptTime: { color: colors.muted, fontSize: 13, marginTop: 4 },
  qa: {
    width: "48%", backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, minHeight: 90,
  },
  qaLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
});
