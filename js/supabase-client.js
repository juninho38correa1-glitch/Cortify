// Cliente Supabase global - usado por todas as páginas
// Depende: js/config.js + CDN supabase

(function() {
  if (!window.SUPABASE_CONFIG || window.SUPABASE_CONFIG.url.includes("SEU-PROJETO")) {
    document.body.innerHTML = `
      <div style="background:#0a0a0a;color:#f5f5f5;min-height:100vh;display:grid;place-items:center;font-family:system-ui;padding:20px">
        <div style="max-width:500px;text-align:center">
          <h1 style="color:#d4a857;font-size:32px;margin-bottom:16px">⚠️ Configuração necessária</h1>
          <p style="color:#a8a8a8;line-height:1.6">
            Você precisa configurar o Supabase antes de usar o sistema.<br><br>
            Edite o arquivo <code style="color:#d4a857">js/config.js</code> com a URL e a chave do seu projeto Supabase.<br><br>
            Veja o passo a passo em <strong>docs/SETUP.md</strong>
          </p>
        </div>
      </div>
    `;
    throw new Error("Supabase not configured");
  }

  window.sb = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );
})();

// Helpers globais
window.bf = {
  // Toast simples
  toast(message, type = "info") {
    const colors = {
      info: "#1a1a1a",
      success: "#1a3a2a",
      error: "#3a1a1a"
    };
    const el = document.createElement("div");
    el.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:9999;
      background:${colors[type]};color:#f5f5f5;
      padding:12px 18px;border-radius:8px;
      border:1px solid #2a2a2a;
      box-shadow:0 10px 30px rgba(0,0,0,0.4);
      animation:slideIn 0.2s ease;
      font-family:system-ui;font-size:14px;
      max-width:340px;
    `;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s";
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },

  formatBRL(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(typeof value === "string" ? parseFloat(value) : value);
  },

  formatPhone(phone) {
    const d = (phone || "").replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return phone;
  },

  cleanPhone(phone) {
    const d = (phone || "").replace(/\D/g, "");
    if (d.startsWith("55")) return d;
    return "55" + d;
  },

  whatsappLink(phone, message) {
    const clean = this.cleanPhone(phone);
    const text = message ? "?text=" + encodeURIComponent(message) : "";
    return `https://wa.me/${clean}${text}`;
  },

  getInitials(name) {
    return (name || "")
      .split(" ").filter(Boolean).slice(0, 2)
      .map(n => n[0].toUpperCase()).join("");
  },

  // Garante autenticação ou redireciona pra login
  async requireAuth() {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) {
      window.location.href = "index.html";
      throw new Error("Not authenticated");
    }
    return session.user;
  },

  // Verifica status da assinatura
  async getProfile(userId) {
    const { data, error } = await window.sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  },

  // Verifica se usuário ainda tem acesso (trial ou pago)
  hasAccess(profile) {
    if (profile.subscription_status === "ACTIVE") return true;
    if (profile.subscription_status === "TRIAL") {
      return new Date(profile.trial_ends_at) > new Date();
    }
    return false;
  },

  // Dias restantes do trial
  trialDaysLeft(profile) {
    if (profile.subscription_status !== "TRIAL") return 0;
    const ms = new Date(profile.trial_ends_at) - new Date();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }
};

// Animação CSS pro toast
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(style);
