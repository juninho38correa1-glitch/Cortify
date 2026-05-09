// ===========================================
// CONFIG SUPABASE — preencha com seus valores
// ===========================================
// Como pegar:
// 1. Crie conta em supabase.com
// 2. Crie um projeto
// 3. Vá em Project Settings > API
// 4. Copie a "Project URL" e a "anon public key"
// ===========================================

window.SUPABASE_CONFIG = {
  url: "https://rfdfgzkajsuvunxzhuhd.supabase.co",
  anonKey: "sb_publishable_FdJEu-yKfRmXHRoROvaNfw_S-y6y2h5"
};

// PIX para receber pagamentos manuais
window.APP_CONFIG = {
  pixKey: "44997230700",      // sua chave PIX
  pixName: "Osmar Correa Junior",                // nome no PIX
  whatsappAdmin: "5544997230700",         // seu whats pra receber comprovante
  monthlyPrice: 79.00,
  trialDays: 7,

  // VAPID Public Key para Push Notifications
  // Gere com: npx web-push generate-vapid-keys
  // (deixe vazio se não quiser ativar push notifications ainda)
  vapidPublicKey: "BAul5pB9TiGyaUUXKmPv3f90Prw6ApGvYLZ675COmu-1IPee6-Ah0doKcuVrIOTixfO09567Ro2heW2l4zKaA2A"
};
