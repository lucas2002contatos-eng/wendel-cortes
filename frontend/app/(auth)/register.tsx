import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { api, setSession } from "@/src/api";
import { GoldButton } from "@/src/ui";
import Icon from "@react-native-vector-icons/feather";

export default function Register() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await api("/auth/register", { method: "POST", body: JSON.stringify({ name, phone, email, password }) });
      await setSession(res.token, res.user);
      router.replace("/(client)/home");
    } catch (e: any) {
      setErr(e.message || "Erro ao cadastrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={{ marginBottom: spacing.xl }}>
            <Icon name="arrow-left" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.h1}>Criar conta</Text>
          <Text style={styles.sub}>Preencha seus dados para começar</Text>

          <Text style={styles.label}>Nome completo</Text>
          <TextInput testID="reg-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Telefone / WhatsApp</Text>
          <TextInput testID="reg-phone-input" style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="11 99999-9999" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>E-mail</Text>
          <TextInput testID="reg-email-input" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="voce@exemplo.com" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Senha</Text>
          <TextInput testID="reg-password-input" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Mínimo 6 caracteres" placeholderTextColor={colors.muted} />

          {err ? <Text style={styles.err}>{err}</Text> : null}
          <GoldButton testID="reg-submit-btn" label={loading ? "Criando..." : "Criar conta"} onPress={submit} disabled={loading} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.onSurface, fontSize: 28, fontWeight: "700" },
  sub: { color: colors.muted, marginTop: 6, marginBottom: spacing.xl },
  label: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, color: colors.onSurface, fontSize: 15,
  },
  err: { color: colors.onError, marginTop: spacing.md, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.sm },
});
