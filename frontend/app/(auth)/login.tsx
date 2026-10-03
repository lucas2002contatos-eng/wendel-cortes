import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from "react-native";
import { useRouter, Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import Icon from "@react-native-vector-icons/feather";
import { colors, spacing, radius } from "@/src/theme";
import { api, setSession } from "@/src/api";
import { GoldButton } from "@/src/ui";

export default function Login() {
  const [email, setEmail] = useState("admin@wendelcortes.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await setSession(res.token, res.user);
      if (res.user.role === "admin") router.replace("/(admin)/dashboard");
      else router.replace("/(client)/home");
    } catch (e: any) {
      setErr(e.message || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image
        source="https://images.unsplash.com/photo-1726835498689-b4f6dbcdbdfb?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
        style={StyleSheet.absoluteFill as any}
        contentFit="cover"
      />
      <LinearGradient
        colors={["rgba(10,10,10,0.6)", "rgba(10,10,10,0.98)"]}
        style={StyleSheet.absoluteFill as any}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.xl }}>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Pressable testID="login-back-home" onPress={() => router.replace("/")} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.xl, minHeight: 44 }}>
              <Icon name="arrow-left" size={18} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Voltar ao início</Text>
            </Pressable>
            <Image source={require("../../assets/images/logo.jpeg")} style={{ width: 150, height: 146, borderRadius: 22 }} contentFit="contain" />
            <View style={{ height: 1, backgroundColor: colors.brandPrimary, width: 80, marginVertical: spacing.xl }} />
            <Text style={styles.h1}>Bem-vindo</Text>
            <Text style={styles.sub}>Acesse sua conta para agendar e acompanhar seus atendimentos.</Text>

            <View style={{ marginTop: spacing["2xl"] }}>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                testID="login-email-input"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="voce@exemplo.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <Text style={styles.label}>Senha</Text>
              <TextInput
                testID="login-password-input"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <GoldButton
                testID="login-submit-button"
                label={loading ? "Entrando..." : "Entrar"}
                onPress={submit}
                disabled={loading}
                style={{ marginTop: spacing.lg }}
              />
              <Link href="/(auth)/register" asChild>
                <Pressable testID="go-register-link" style={{ marginTop: spacing.lg, alignItems: "center" }}>
                  <Text style={{ color: colors.brandPrimary, fontSize: 14 }}>Criar uma conta</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { color: colors.onSurface, fontSize: 42, fontWeight: "300", letterSpacing: 6 },
  brandBottom: { color: colors.brandPrimary, fontSize: 42, fontWeight: "800", letterSpacing: 6 },
  h1: { color: colors.onSurface, fontSize: 22, fontWeight: "600" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 6 },
  label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.onSurface,
    fontSize: 15,
  },
  err: { color: colors.onError, marginTop: spacing.md, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm },
});
