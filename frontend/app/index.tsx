import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, getToken, getUser } from "@/src/api";
import { GoldButton, GhostButton } from "@/src/ui";
import { openWhatsApp, contactMsg } from "@/src/whatsapp";

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const MODE_LABEL: Record<string, string> = { agenda: "Agendamento", fila: "Fila por chegada", fechado: "Fechado" };

/** Public landing page — visitors see it before signing in. */
export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 900;
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const user = await getUser();
      if (token && user) {
        router.replace(user.role === "admin" ? "/(admin)/dashboard" : "/(client)/home");
        return;
      }
      setReady(true);
      try { setInfo(await api("/public/info")); } catch {}
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }

  const shop = info?.shop || {};
  const services: any[] = info?.services || [];
  const days: any[] = info?.days || [];
  const svcWidth = wide ? "31.5%" : width >= 600 ? "48%" : "100%";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing["3xl"] }}>
        {/* Hero */}
        <View style={[styles.hero, { minHeight: wide ? 520 : 460, paddingTop: insets.top + spacing.xl }]}>
          <Image
            source="https://images.unsplash.com/photo-1726835498689-b4f6dbcdbdfb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600"
            style={StyleSheet.absoluteFill as any}
            contentFit="cover"
          />
          <LinearGradient colors={["rgba(10,10,10,0.35)", "rgba(10,10,10,0.97)"]} style={StyleSheet.absoluteFill as any} />
          <View style={[styles.container, { flex: 1, justifyContent: "flex-end", paddingBottom: spacing["2xl"] }]}>
            <View style={[styles.topBar]}>
              <Text style={styles.topBrand}>WENDEL <Text style={{ color: colors.brandPrimary }}>CORTES</Text></Text>
              <Pressable testID="landing-login-top" onPress={() => router.push("/(auth)/login")} style={styles.topLogin}>
                <Icon name="log-in" size={16} color={colors.brandPrimary} />
                <Text style={styles.topLoginTxt}>Entrar</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }} />
            <Image source={require("../assets/images/logo.jpeg")} style={[styles.logo, wide && { width: 260, height: 253 }]} contentFit="contain" />
            <Text style={styles.heroKicker}>BARBEARIA · DESDE 2017</Text>
            <Text style={[styles.heroSub, wide && { maxWidth: 560 }]}>{shop.about || "Cortes clássicos e modernos, barba e cuidados masculinos."}</Text>
            <View style={[styles.heroActions, wide && { flexDirection: "row" }]}>
              <GoldButton testID="landing-register-btn" icon="calendar" label="Agendar horário" onPress={() => router.push("/(auth)/register")} style={wide ? { minWidth: 220 } : undefined} />
              <GhostButton testID="landing-login-btn" label="Já tenho conta" onPress={() => router.push("/(auth)/login")} style={wide ? { minWidth: 200 } : undefined} />
            </View>
          </View>
        </View>

        {/* Services */}
        <View style={styles.container}>
          <Text style={styles.sec}>Serviços e preços</Text>
          {!info ? <ActivityIndicator color={colors.brandPrimary} /> : (
            <View style={styles.grid}>
              {services.map((s) => (
                <View key={s.id} style={[styles.svcCard, { width: svcWidth as any }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={styles.svcName}>{s.name}</Text>
                    <Text style={styles.svcPrice}>R$ {Number(s.price).toFixed(2)}</Text>
                  </View>
                  {s.description ? <Text style={styles.svcDesc}>{s.description}</Text> : null}
                  <Text style={styles.svcMeta}>{s.duration_min} min</Text>
                </View>
              ))}
            </View>
          )}

          {/* Monthly plan */}
          {info && (
            <View style={styles.plan}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planLabel}>CLIENTE MENSAL</Text>
                <Text style={styles.planTitle}>{info.monthly_cuts} cortes por mês</Text>
                <Text style={styles.planSub}>Assine e garanta seu visual sempre em dia com prioridade e economia.</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.planPrice}>R$ {Number(info.monthly_price).toFixed(2)}</Text>
                <Text style={styles.planPer}>/mês</Text>
              </View>
            </View>
          )}

          {/* Hours + Address */}
          <View style={[styles.twoCol, wide && { flexDirection: "row" }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sec}>Horário de funcionamento</Text>
              <View style={styles.card}>
                {days.map((d, i) => (
                  <View key={d.weekday} style={[styles.dayRow, i < days.length - 1 && styles.dayRowBorder]}>
                    <Text style={styles.dayName}>{DAYS[d.weekday]}</Text>
                    {d.mode === "fechado" ? (
                      <Text style={styles.dayClosed}>Fechado</Text>
                    ) : (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.dayHours}>{d.open_time} – {d.close_time}</Text>
                        <Text style={styles.dayMode}>{MODE_LABEL[d.mode]}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.sec}>Onde estamos</Text>
              <View style={styles.card}>
                <View style={styles.infoRow}>
                  <Icon name="map-pin" size={18} color={colors.brandPrimary} />
                  <Text style={styles.infoTxt}>{shop.address || "Endereço em breve"}</Text>
                </View>
                {shop.instagram ? (
                  <View style={styles.infoRow}>
                    <Icon name="instagram" size={18} color={colors.brandPrimary} />
                    <Text style={styles.infoTxt}>{shop.instagram}</Text>
                  </View>
                ) : null}
                <View style={styles.infoRow}>
                  <Icon name="phone" size={18} color={colors.brandPrimary} />
                  <Text style={styles.infoTxt}>{formatPhone(shop.whatsapp)}</Text>
                </View>
                <Pressable testID="landing-whatsapp-btn" onPress={() => openWhatsApp(shop.whatsapp, contactMsg())} style={styles.waBtn}>
                  <Icon name="message-circle" size={18} color={colors.onSurface} />
                  <Text style={styles.waTxt}>Falar no WhatsApp</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <Text style={styles.footer}>© {new Date().getFullYear()} WENDEL CORTES · Barbearia</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function formatPhone(p?: string) {
  const d = (p || "").replace(/\D/g, "");
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return p || "";
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  container: { width: "100%", maxWidth: 1040, alignSelf: "center", paddingHorizontal: spacing.xl },
  hero: { justifyContent: "flex-end", overflow: "hidden" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topBrand: { color: colors.onSurface, fontSize: 14, fontWeight: "700", letterSpacing: 3 },
  topLogin: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary, minHeight: 44 },
  topLoginTxt: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  heroKicker: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 4, fontWeight: "700", marginTop: spacing.lg },
  logo: { width: 200, height: 195, borderRadius: 28, marginTop: spacing.xl },
  heroSub: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, marginTop: spacing.lg },
  heroActions: { gap: spacing.md, marginTop: spacing.xl },
  sec: { color: colors.muted, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", marginTop: spacing["2xl"], marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  svcCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, gap: 4 },
  svcName: { color: colors.onSurface, fontSize: 16, fontWeight: "700", flex: 1 },
  svcPrice: { color: colors.brandPrimary, fontSize: 16, fontWeight: "800" },
  svcDesc: { color: colors.muted, fontSize: 13 },
  svcMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  plan: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary, borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl },
  planLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  planTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 4 },
  planSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 6 },
  planPrice: { color: colors.brandPrimary, fontSize: 26, fontWeight: "800" },
  planPer: { color: colors.muted, fontSize: 12 },
  twoCol: { gap: spacing.xl },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  dayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dayName: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  dayHours: { color: colors.onSurface, fontSize: 14, fontVariant: ["tabular-nums"] as any },
  dayMode: { color: colors.brandPrimary, fontSize: 11, marginTop: 2 },
  dayClosed: { color: colors.muted, fontSize: 14, fontStyle: "italic" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  infoTxt: { color: colors.onSurface, fontSize: 14, flex: 1 },
  waBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.success, paddingVertical: 14, borderRadius: radius.md, minHeight: 48 },
  waTxt: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  footer: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: spacing["3xl"] },
});
