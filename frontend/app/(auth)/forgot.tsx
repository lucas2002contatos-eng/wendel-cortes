import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { GoldButton } from "@/src/ui";
import { Logo } from "@/src/branding";

/** Password recovery: request a 6-digit code (relayed by the barbershop), then set a new password. */
export default function Forgot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const request = async () => {
    setErr(null); setLoading(true);
    try {
      const r = await api("/auth/forgot", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setMsg(r.message); setStep(2);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    setErr(null);
    if (pw.length < 6) { setErr("A nova senha deve ter pelo menos 6 caracteres"); return; }
    if (pw !== pw2) { setErr("As senhas não coincidem"); return; }
    setLoading(true);
    try {
      const r = await api("/auth/reset", { method: "POST", body: JSON.stringify({ email: email.trim(), code: code.trim(), new_password: pw }) });
      setMsg(r.message);
      setTimeout(() => router.replace("/(auth)/login"), 1500);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xl, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <Pressable testID="forgot-back" onPress={() => router.back()} style={styles.back}><Icon name="arrow-left" size={18} color={colors.muted} /><Text style={styles.backTxt}>Voltar ao login</Text></Pressable>
        <View style={{ alignItems: "center", marginBottom: spacing.xl }}><Logo size={110} /></View>
        <Text style={styles.title}>Recuperar senha</Text>
        <Text style={styles.sub}>{step === 1 ? "Informe o e-mail cadastrado. A barbearia enviará um código de 6 dígitos (válido por 30 minutos) pelo seu WhatsApp." : "Digite o código recebido e crie uma nova senha."}</Text>

        {step === 1 ? (
          <>
            <Text style={styles.lbl}>E-mail</Text>
            <TextInput testID="forgot-email-input" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" placeholderTextColor={colors.muted} />
            {err && <Text style={styles.err}>{err}</Text>}
            <GoldButton testID="forgot-submit" label={loading ? "Enviando..." : "Solicitar código"} disabled={loading || !email} onPress={request} style={{ marginTop: spacing.lg }} />
          </>
        ) : (
          <>
            {msg && <Text style={styles.ok}>{msg}</Text>}
            <Text style={styles.lbl}>Código (6 dígitos)</Text>
            <TextInput testID="reset-code-input" style={[styles.input, { letterSpacing: 6, textAlign: "center", fontSize: 20 }]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.muted} />
            <Text style={styles.lbl}>Nova senha</Text>
            <TextInput testID="reset-password-input" style={styles.input} value={pw} onChangeText={setPw} secureTextEntry placeholder="mínimo 6 caracteres" placeholderTextColor={colors.muted} />
            <Text style={styles.lbl}>Confirmar nova senha</Text>
            <TextInput testID="reset-password2-input" style={styles.input} value={pw2} onChangeText={setPw2} secureTextEntry placeholder="repita a senha" placeholderTextColor={colors.muted} />
            {err && <Text style={styles.err}>{err}</Text>}
            <GoldButton testID="reset-submit" label={loading ? "Salvando..." : "Salvar nova senha"} disabled={loading || code.length !== 6} onPress={reset} style={{ marginTop: spacing.lg }} />
            <Pressable testID="forgot-again" onPress={() => { setStep(1); setMsg(null); setErr(null); }} style={{ marginTop: spacing.md, alignItems: "center", minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: colors.onSurfaceSecondary, fontSize: 13 }}>Não recebeu? Solicitar novamente</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, marginBottom: spacing.md },
  backTxt: { color: colors.muted, fontSize: 13 },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "700" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 14, marginTop: spacing.sm, lineHeight: 20, marginBottom: spacing.md },
  lbl: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  input: { color: colors.onSurface, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, marginTop: 4, minHeight: 48 },
  err: { color: colors.onError, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm, marginTop: spacing.md },
  ok: { color: colors.onSuccess, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.sm },
});
