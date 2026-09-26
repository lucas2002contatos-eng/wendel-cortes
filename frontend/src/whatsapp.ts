import { Linking, Platform } from "react-native";

// Barbershop WhatsApp — client can also send confirmation to their own number
export const SHOP_WHATSAPP = "5511999999999"; // pode ser editado pelo barbeiro depois

export function sanitizePhone(p: string): string {
  const digits = (p || "").replace(/\D/g, "");
  if (!digits) return "";
  // If it starts with 55 keep, otherwise prepend BR
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function waLink(phone: string, message: string): string {
  const p = sanitizePhone(phone);
  const m = encodeURIComponent(message);
  return `https://wa.me/${p}?text=${m}`;
}

export async function openWhatsApp(phone: string, message: string) {
  const url = waLink(phone, message);
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported || Platform.OS === "web") {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(url);
    }
  } catch {
    // silent fail
  }
}

export function bookingMsg(name: string, service: string, date: string, time: string, payment: string) {
  const pMap: any = { pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro (pagar no local)", mensal: "Cliente Mensal" };
  return `Olá ${name}! Seu agendamento na WENDEL CORTES foi confirmado:\n\n• Serviço: ${service}\n• Data: ${date}\n• Horário: ${time}\n• Pagamento: ${pMap[payment] || payment}\n\nAté breve!`;
}

export function queueMsg(name: string, service: string, pos: number) {
  return `Olá ${name}! Você entrou na fila da WENDEL CORTES.\n\n• Serviço: ${service}\n• Posição atual: ${pos}º\n\nAcompanhe pelo app. Avisaremos quando for sua vez.`;
}
