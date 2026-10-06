import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { api, clearSession } from "@/src/api";
import { GhostButton, GoldButton } from "@/src/ui";
import { refreshBranding } from "@/src/branding";
import { ServicesSection } from "@/src/admin/services-section";
import { BrandingSection, PlanSection, PixSection, PaymentsSection, GeneralSection, AuditSection, ResetCodesSection } from "@/src/admin/config-sections";

export default function Mais() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<string>("branding");
  const [reportDays, setReportDays] = useState<number>(30);
  const [reports, setReports] = useState<any>(null);
  useEffect(() => {
    if (tab !== "reports") return;
    setReports(null);
    const from = reportDays ? new Date(Date.now() - reportDays * 86400000).toISOString().slice(0, 10) : "";
    api(`/admin/reports/barbers${from ? `?from_date=${from}` : ""}`).then(setReports).catch(() => setReports({ barbers: [] }));
  }, [tab, reportDays]);
  const router = useRouter();

  const [services, setServices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [finance, setFinance] = useState<any>(null);
  const [shop, setShop] = useState<any>({ whatsapp: "", address: "", instagram: "", about: "" });
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const [shopErr, setShopErr] = useState<string | null>(null);
  const [savingShop, setSavingShop] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, cfg, c, f] = await Promise.all([api("/services"), api("/settings"), api("/admin/clients"), api("/admin/finance")]);
      setServices(s); setSettings(cfg); setClients(c); setFinance(f);
      if (cfg?.shop) setShop(cfg.shop);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveShop = async () => {
    setShopMsg(null); setShopErr(null); setSavingShop(true);
    try {
      const saved = await api("/settings/shop", { method: "PUT", body: JSON.stringify(shop) });
      setShop(saved);
      refreshBranding();
      setShopMsg("Dados da barbearia salvos!");
    } catch (e: any) { setShopErr(e.message); }
    finally { setSavingShop(false); }
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
      <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <Text style={styles.h1}>Configurações da Barbearia</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Centro de controle do Administrador Fundador</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}>
          {[
            { k: "branding", l: "Identidade Visual" },
            { k: "shop", l: "Informações" },
            { k: "services", l: "Serviços" },
            { k: "plan", l: "Cliente Mensal" },
            { k: "team", l: "Equipe / Barbeiros" },
            { k: "payments", l: "Pagamentos" },
            { k: "pix", l: "PIX" },
            { k: "settings", l: "Horários" },
            { k: "general", l: "Agenda · Fila · Notificações" },
            { k: "clients", l: "Clientes" },
            { k: "resets", l: "Recuperação de senha" },
            { k: "finance", l: "Financeiro" },
            { k: "reports", l: "Relatórios" },
            { k: "audit", l: "Auditoria" },
          ].map((t) => (
            <Pressable key={t.k} testID={`tab-${t.k}`} onPress={() => (t.k === "team" ? router.push("/(admin)/barbeiros") : setTab(t.k as any))} style={[styles.chip, tab === t.k && styles.chipSel]}>
              <Text style={[styles.chipTxt, tab === t.k && { color: colors.onBrandPrimary }]}>{t.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing["3xl"], width: "100%", maxWidth: 760, alignSelf: "center" }}>
        {tab === "services" && <ServicesSection services={services} onChanged={load} />}

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

        {tab === "shop" && (
          <View>
            <Text style={styles.sec}>Dados públicos da barbearia</Text>
            <View style={styles.card}>
              <Text style={styles.lbl}>Nome da barbearia</Text>
              <TextInput testID="shop-name-input" style={styles.input} value={shop.name || ""} onChangeText={(v) => setShop({ ...shop, name: v })} placeholder="WENDEL CORTES" placeholderTextColor={colors.muted} />
              <Text style={[styles.lbl, { marginTop: spacing.md }]}>Telefone fixo / contato</Text>
              <TextInput testID="shop-phone-input" style={styles.input} keyboardType="phone-pad" value={shop.phone || ""} onChangeText={(v) => setShop({ ...shop, phone: v })} placeholder="(11) 0000-0000" placeholderTextColor={colors.muted} />
              <Text style={[styles.lbl, { marginTop: spacing.md }]}>WhatsApp (com DDD)</Text>
              <TextInput
                testID="shop-whatsapp-input"
                style={styles.input}
                keyboardType="phone-pad"
                placeholder="11999999999"
                placeholderTextColor={colors.muted}
                value={shop.whatsapp}
                onChangeText={(v) => setShop({ ...shop, whatsapp: v })}
              />
              <Text style={styles.hint}>Usado no botão “Falar no WhatsApp” da página inicial e nas confirmações.</Text>

              <Text style={[styles.lbl, { marginTop: spacing.md }]}>Endereço</Text>
              <TextInput
                testID="shop-address-input"
                style={styles.input}
                placeholder="Rua, número - Bairro, Cidade"
                placeholderTextColor={colors.muted}
                value={shop.address}
                onChangeText={(v) => setShop({ ...shop, address: v })}
              />

              <Text style={[styles.lbl, { marginTop: spacing.md }]}>Instagram</Text>
              <TextInput
                testID="shop-instagram-input"
                style={styles.input}
                autoCapitalize="none"
                placeholder="@suabarbearia"
                placeholderTextColor={colors.muted}
                value={shop.instagram}
                onChangeText={(v) => setShop({ ...shop, instagram: v })}
              />

              <Text style={[styles.lbl, { marginTop: spacing.md }]}>Sobre a barbearia</Text>
              <TextInput
                testID="shop-about-input"
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                multiline
                placeholder="Breve descrição exibida na página inicial"
                placeholderTextColor={colors.muted}
                value={shop.about}
                onChangeText={(v) => setShop({ ...shop, about: v })}
              />

              {shopErr && <Text style={styles.errTxt}>{shopErr}</Text>}
              {shopMsg && <Text style={styles.okTxt}>{shopMsg}</Text>}
              <GoldButton testID="shop-save-btn" label={savingShop ? "Salvando..." : "Salvar"} disabled={savingShop} onPress={saveShop} style={{ marginTop: spacing.lg }} />
            </View>
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

        {tab === "branding" && <BrandingSection />}
        {tab === "plan" && settings && <PlanSection settings={settings} onSaved={load} />}
        {tab === "pix" && settings && <PixSection settings={settings} onSaved={load} />}
        {tab === "payments" && <PaymentsSection />}
        {tab === "general" && settings && <GeneralSection settings={settings} onSaved={load} />}
        {tab === "audit" && <AuditSection />}
        {tab === "resets" && <ResetCodesSection />}

        {tab === "reports" && (
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {[{ k: 7, l: "7 dias" }, { k: 30, l: "30 dias" }, { k: 0, l: "Tudo" }].map((p) => (
                <Pressable key={p.k} testID={`report-period-${p.k}`} onPress={() => setReportDays(p.k)} style={[styles.modeChip, reportDays === p.k && styles.modeChipSel]}>
                  <Text style={[styles.chipTxt, reportDays === p.k && { color: colors.onBrandPrimary }]}>{p.l}</Text>
                </Pressable>
              ))}
            </View>
            {!reports ? <ActivityIndicator color={colors.brandPrimary} /> : reports.barbers.length === 0 ? <Text style={{ color: colors.muted }}>Sem atendimentos no período.</Text> :
              reports.barbers.map((r: any) => (
                <View key={r.barber_id} style={styles.card} testID={`report-${r.barber_name}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={styles.name}>{r.barber_name}</Text>
                    <Text style={styles.big}>R$ {Number(r.faturamento).toFixed(2)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                    <View><Text style={styles.lbl}>Atendimentos</Text><Text style={styles.kpi}>{r.atendimentos}</Text></View>
                    <View><Text style={styles.lbl}>Clientes</Text><Text style={styles.kpi}>{r.clientes}</Text></View>
                    <View><Text style={styles.lbl}>Cortes mensais</Text><Text style={styles.kpi}>{r.cortes_mensal}</Text></View>
                    {r.comissao_estimada != null && <View><Text style={styles.lbl}>Comissão ({r.commission_pct}%)</Text><Text style={styles.kpi}>R$ {Number(r.comissao_estimada).toFixed(2)}</Text></View>}
                  </View>
                  {r.servicos.length > 0 && (
                    <View style={{ marginTop: spacing.sm }}>
                      {r.servicos.map((s: any) => (
                        <View key={s.name} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                          <Text style={{ color: colors.onSurfaceSecondary, fontSize: 13 }}>{s.name}</Text>
                          <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>{s.count}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
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
  kpi: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 4 },
  hint: { color: colors.muted, fontSize: 11, marginTop: 6 },
  errTxt: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
  okTxt: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
});
