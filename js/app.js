// ========================================================
// CORTIFY - Lógica do painel
// ========================================================

const state = {
  user: null,
  profile: null,
  clientes: [],
  servicos: [],
  pacotes: [],
  currentClienteId: null,
};

// ========== INICIALIZAÇÃO ==========
(async function init() {
  state.user = await bf.requireAuth();

  try {
    state.profile = await bf.getProfile(state.user.id);
  } catch (e) {
    bf.toast("Erro ao carregar perfil. Tente sair e entrar de novo.", "error");
    return;
  }

  // Verifica acesso
  if (!bf.hasAccess(state.profile)) {
    showAccessDenied();
    return;
  }

  renderTrialBanner();
  await loadInitialData();
  renderDashboard();

  // Suporte ao botão voltar do navegador
  window.addEventListener("popstate", handleNavigate);
  handleNavigate();
})();

// ========== ACESSO BLOQUEADO ==========
function showAccessDenied() {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:20px">
      <div style="max-width:500px;text-align:center;background:var(--bg-card);border:1px solid var(--line);border-radius:16px;padding:40px">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(224,116,116,0.1);color:var(--red);display:grid;place-items:center;margin:0 auto 20px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1 class="font-display" style="font-size:26px;font-weight:700;margin-bottom:8px">Acesso expirado</h1>
        <p style="color:var(--text-soft);font-size:14px;line-height:1.6;margin-bottom:24px">
          Seu período grátis acabou ou seu pagamento não está em dia.<br><br>
          Para reativar, faça um PIX de <strong style="color:var(--gold)">${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}</strong> para a chave:<br>
          <code style="background:var(--bg-soft);padding:8px 12px;border-radius:6px;display:inline-block;margin-top:8px;color:var(--gold)">${window.APP_CONFIG.pixKey}</code><br><br>
          Depois envie o comprovante no WhatsApp:
        </p>
        <a href="${bf.whatsappLink(window.APP_CONFIG.whatsappAdmin, 'Olá! Fiz o pagamento do Cortify, segue o comprovante.')}" target="_blank" class="btn btn-primary btn-lg">
          Enviar comprovante
        </a>
        <button onclick="logout()" style="display:block;margin:20px auto 0;background:transparent;border:none;color:var(--text-dim);font-size:12px;cursor:pointer;font-family:inherit">
          Sair
        </button>
      </div>
    </div>
  `;
}

// ========== TRIAL BANNER ==========
function renderTrialBanner() {
  const banner = document.getElementById("trialBanner");
  if (state.profile.subscription_status === "TRIAL") {
    const days = bf.trialDaysLeft(state.profile);
    banner.innerHTML = `
      <div class="trial-banner">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;border-radius:8px;background:rgba(212,168,87,0.2);color:var(--gold);display:grid;place-items:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600">
              ${days === 0 ? "Trial expira hoje" : `Trial: faltam ${days} ${days === 1 ? "dia" : "dias"}`}
            </div>
            <div style="font-size:12px;color:var(--text-soft);margin-top:2px">
              Após o trial, ${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}/mês via PIX
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigate('conta')">Ativar plano</button>
      </div>
    `;
  } else if (state.profile.subscription_status === "ACTIVE") {
    // Não mostra banner pra quem está pagando
    banner.innerHTML = "";
  }
}

// ========== CARREGAMENTO INICIAL ==========
async function loadInitialData() {
  const [clientesRes, servicosRes, pacotesRes] = await Promise.all([
    sb.from("clientes").select("*, atendimentos(count), pacotes(id, status)").order("nome"),
    sb.from("servicos").select("*").eq("ativo", true).order("nome"),
    sb.from("pacotes")
      .select("*, cliente:clientes(nome, telefone), itens:pacote_itens(*, servico:servicos(nome))")
      .eq("status", "ATIVO")
      .order("created_at", { ascending: false }),
  ]);

  if (clientesRes.error) bf.toast("Erro ao carregar clientes: " + clientesRes.error.message, "error");
  if (servicosRes.error) bf.toast("Erro ao carregar serviços: " + servicosRes.error.message, "error");
  if (pacotesRes.error) bf.toast("Erro ao carregar pacotes: " + pacotesRes.error.message, "error");

  state.clientes = clientesRes.data || [];
  state.servicos = servicosRes.data || [];
  state.pacotes = pacotesRes.data || [];
}

// ========== NAVEGAÇÃO ==========
function navigate(view, opts = {}) {
  // Atualiza URL sem recarregar
  history.pushState({ view, ...opts }, "", `#${view}${opts.id ? `/${opts.id}` : ""}`);
  showView(view, opts);
}

function handleNavigate() {
  const hash = window.location.hash.replace("#", "");
  const [view, id] = hash.split("/");
  showView(view || "dashboard", id ? { id } : {});
}

function showView(view, opts = {}) {
  // Esconde tudo
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".side-link").forEach((l) => l.classList.remove("active"));

  // Mostra view específica
  let viewId = `view-${view}`;
  if (view === "cliente-detail" && opts.id) {
    viewId = "view-cliente-detail";
    state.currentClienteId = opts.id;
    renderClienteDetail(opts.id);
  } else if (view === "clientes") {
    renderClientes();
    if (opts.new) openClienteModal();
  } else if (view === "dashboard") {
    renderDashboard();
  } else if (view === "pacotes") {
    renderPacotes();
  } else if (view === "conta") {
    renderConta();
  }

  const el = document.getElementById(viewId);
  if (el) el.classList.add("active");

  // Atualiza sidebar
  const sideLink = document.querySelector(`.side-link[data-view="${view}"]`);
  if (sideLink) sideLink.classList.add("active");
  else if (view === "cliente-detail") {
    document.querySelector('.side-link[data-view="clientes"]')?.classList.add("active");
  }
}

// ========== DASHBOARD ==========
function renderDashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = state.profile.name?.split(" ")[0] || "barbeiro";
  document.getElementById("greeting").textContent = `${greeting}, ${firstName}`;
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  // Stats hoje
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  sb.from("atendimentos")
    .select("valor_avulso, pago_via_pacote")
    .gte("data", hoje.toISOString())
    .then(({ data }) => {
      const fat = (data || []).reduce((acc, a) => acc + (a.valor_avulso ? Number(a.valor_avulso) : 0), 0);
      document.getElementById("statFaturamento").textContent = bf.formatBRL(fat);
      document.getElementById("statAtendimentos").textContent = (data || []).length;
    });

  document.getElementById("statClientes").textContent = state.clientes.length;
  document.getElementById("statPacotes").textContent = state.pacotes.length;
}

// ========== CLIENTES ==========
function renderClientes() {
  const container = document.getElementById("clientesList");
  const search = document.getElementById("searchClientes")?.value.toLowerCase() || "";

  const filtered = state.clientes.filter((c) => {
    if (!search) return true;
    return (
      c.nome.toLowerCase().includes(search) ||
      c.telefone.includes(search.replace(/\D/g, ""))
    );
  });

  document.getElementById("clientesCount").textContent =
    `${state.clientes.length} ${state.clientes.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}`;

  if (state.clientes.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <h2>Nenhum cliente ainda</h2>
        <p>Comece cadastrando seus clientes pra criar pacotes e organizar seus atendimentos.</p>
        <button class="btn btn-primary" onclick="openClienteModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Cadastrar primeiro cliente
        </button>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-soft)">
        Nenhum cliente encontrado para "${search}"
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="clients-grid">
      ${filtered.map((c) => `
        <div class="client-card" onclick="navigate('cliente-detail', { id: '${c.id}' })">
          <div class="avatar avatar-md">${bf.getInitials(c.nome)}</div>
          <div class="client-info">
            <div class="client-name">${escapeHtml(c.nome)}</div>
            <div class="client-phone">${bf.formatPhone(c.telefone.replace(/^55/, ""))}</div>
            <div class="client-meta">
              <span style="color:var(--text-dim)">${c.atendimentos[0]?.count || 0} atend.</span>
              ${c.pacotes.filter(p => p.status === 'ATIVO').length > 0 ? `
                <span class="pill pill-gold" style="font-size:10px">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                  ${c.pacotes.filter(p => p.status === 'ATIVO').length}
                </span>
              ` : ""}
            </div>
          </div>
          <a href="${bf.whatsappLink(c.telefone)}" target="_blank" onclick="event.stopPropagation()" class="icon-btn" title="WhatsApp">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </a>
        </div>
      `).join("")}
    </div>
  `;
}

// ========== MODAL CLIENTE ==========
function openClienteModal(cliente = null) {
  const form = document.getElementById("clienteForm");
  const title = document.getElementById("clienteModalTitle");

  form.reset();
  if (cliente) {
    title.textContent = "Editar cliente";
    form.id.value = cliente.id;
    form.nome.value = cliente.nome;
    form.telefone.value = cliente.telefone.replace(/^55/, "");
    form.email.value = cliente.email || "";
    form.aniversario.value = cliente.aniversario ? cliente.aniversario.split("T")[0] : "";
    form.observacoes.value = cliente.observacoes || "";
  } else {
    title.textContent = "Novo cliente";
    form.id.value = "";
  }

  document.getElementById("clienteModal").classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

async function saveCliente(e) {
  e.preventDefault();
  const btn = document.getElementById("clienteSaveBtn");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  const fd = new FormData(e.target);
  const phone = fd.get("telefone").replace(/\D/g, "");

  if (phone.length < 10 || phone.length > 11) {
    bf.toast("Telefone inválido", "error");
    btn.disabled = false;
    btn.textContent = "Salvar";
    return;
  }

  const payload = {
    user_id: state.user.id,
    nome: fd.get("nome").trim(),
    telefone: "55" + phone,
    email: fd.get("email")?.trim() || null,
    aniversario: fd.get("aniversario") || null,
    observacoes: fd.get("observacoes")?.trim() || null,
  };

  const id = fd.get("id");
  let result;
  if (id) {
    result = await sb.from("clientes").update(payload).eq("id", id).select().single();
  } else {
    result = await sb.from("clientes").insert(payload).select().single();
  }

  btn.disabled = false;
  btn.textContent = "Salvar";

  if (result.error) {
    bf.toast(result.error.message.includes("duplicate") ? "Já existe cliente com esse telefone" : result.error.message, "error");
    return;
  }

  bf.toast(id ? "Cliente atualizado" : "Cliente cadastrado", "success");
  closeModal("clienteModal");
  await loadInitialData();

  if (id) {
    renderClienteDetail(id);
  } else {
    navigate("cliente-detail", { id: result.data.id });
  }
}

async function deleteCliente(id, nome) {
  if (!confirm(`Tem certeza que quer excluir ${nome}?\n\nIsso vai remover TODOS os pacotes, agendamentos e histórico desse cliente.`)) return;

  const { error } = await sb.from("clientes").delete().eq("id", id);
  if (error) {
    bf.toast(error.message, "error");
    return;
  }

  bf.toast("Cliente excluído", "success");
  await loadInitialData();
  navigate("clientes");
}

// ========== CLIENTE DETAIL ==========
async function renderClienteDetail(id) {
  const container = document.getElementById("clienteDetailContent");
  container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  // Busca dados completos
  const [clienteRes, atendimentosRes, pacotesRes] = await Promise.all([
    sb.from("clientes").select("*").eq("id", id).single(),
    sb.from("atendimentos")
      .select("*, servico:servicos(nome)")
      .eq("cliente_id", id)
      .order("data", { ascending: false })
      .limit(20),
    sb.from("pacotes")
      .select("*, itens:pacote_itens(*, servico:servicos(nome))")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (clienteRes.error || !clienteRes.data) {
    container.innerHTML = `<div class="empty"><h2>Cliente não encontrado</h2></div>`;
    return;
  }

  const cliente = clienteRes.data;
  const atendimentos = atendimentosRes.data || [];
  const pacotes = pacotesRes.data || [];

  const totalGasto = pacotes.reduce((acc, p) => acc + Number(p.valor_total), 0)
    + atendimentos.reduce((acc, a) => acc + (a.valor_avulso ? Number(a.valor_avulso) : 0), 0);

  container.innerHTML = `
    <div class="client-header-card">
      <div class="avatar avatar-xl">${bf.getInitials(cliente.nome)}</div>
      <div class="client-header-info" style="flex:1;min-width:200px">
        <h1>${escapeHtml(cliente.nome)}</h1>
        <div class="client-header-meta">
          <span>${bf.formatPhone(cliente.telefone.replace(/^55/, ""))}</span>
          ${cliente.email ? `<span>${escapeHtml(cliente.email)}</span>` : ""}
          ${cliente.aniversario ? `<span>🎂 ${formatDateBR(cliente.aniversario, true)}</span>` : ""}
        </div>
        ${cliente.observacoes ? `<p style="color:var(--text-soft);font-size:13px;font-style:italic;margin-top:10px;max-width:500px">"${escapeHtml(cliente.observacoes)}"</p>` : ""}
        <div class="client-header-actions">
          <a href="${bf.whatsappLink(cliente.telefone)}" target="_blank" class="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            WhatsApp
          </a>
          <button class="btn btn-primary" onclick='openPacoteModal("${cliente.id}", ${JSON.stringify(cliente.nome)})'>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Vender pacote
          </button>
          <button class="btn btn-ghost" onclick='openClienteModal(${escapeJsonForAttr(cliente)})'>
            Editar
          </button>
          <button class="btn btn-danger btn-sm" onclick='deleteCliente("${cliente.id}", ${JSON.stringify(cliente.nome)})'>
            Excluir
          </button>
        </div>
      </div>
      <div class="client-stats">
        <div style="font-size:10px;color:var(--text-dim);letter-spacing:1.5px;text-transform:uppercase;font-weight:600">Total gasto</div>
        <div class="client-total">${bf.formatBRL(totalGasto)}</div>
        <div style="font-size:11px;color:var(--text-soft);margin-top:2px">${atendimentos.length} atendimento${atendimentos.length !== 1 ? "s" : ""}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(380px, 1fr));gap:20px">
      <div>
        <div class="block-h">
          <h3>Pacotes</h3>
          <span class="pill pill-gold">${pacotes.filter(p => p.status === "ATIVO").length} ativo${pacotes.filter(p => p.status === "ATIVO").length !== 1 ? "s" : ""}</span>
        </div>
        ${pacotes.length === 0 ? `
          <div class="empty" style="padding:30px 16px">
            <p style="margin-bottom:14px">Nenhum pacote ainda.</p>
            <button class="btn btn-primary btn-sm" onclick='openPacoteModal("${cliente.id}", ${JSON.stringify(cliente.nome)})'>+ Vender primeiro pacote</button>
          </div>
        ` : pacotes.map(p => renderPacoteCard(p)).join("")}
      </div>

      <div>
        <div class="block-h">
          <h3>Histórico</h3>
          <span class="pill pill-dim">${atendimentos.length} registro${atendimentos.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="card">
          ${atendimentos.length === 0 ? `
            <p style="color:var(--text-soft);font-size:13px;text-align:center;padding:20px">
              Sem atendimentos registrados ainda.
            </p>
          ` : atendimentos.map(a => `
            <div class="history-row">
              <div class="history-date">${formatDateBR(a.data)}</div>
              <div style="flex:1">
                <div class="history-title">${escapeHtml(a.servico?.nome || "Serviço")}</div>
                <div class="history-sub">${a.pago_via_pacote ? "via pacote" : "Avulso"}</div>
              </div>
              <div style="font-size:13px;font-weight:600;color:${a.valor_avulso ? "var(--gold)" : "var(--text-dim)"}">
                ${a.valor_avulso ? bf.formatBRL(a.valor_avulso) : "—"}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderPacoteCard(p) {
  const totalServicos = p.itens.reduce((acc, i) => acc + i.quantidade_total, 0);
  const usados = p.itens.reduce((acc, i) => acc + i.quantidade_usada, 0);
  const pct = totalServicos > 0 ? (usados / totalServicos) * 100 : 0;
  const ativo = p.status === "ATIVO";

  return `
    <div class="pacote-card" style="${!ativo ? "opacity:0.65" : ""}">
      <div class="pacote-card-header">
        <div>
          <h3>${escapeHtml(p.nome)}</h3>
          <div style="font-size:11px;color:var(--text-soft);margin-top:2px">
            ${bf.formatBRL(p.valor_total)} ·
            ${p.pago ? "pago" : "PENDENTE"} ·
            ${formatDateBR(p.data_inicio)}
            ${p.data_validade ? ` · vence ${formatDateBR(p.data_validade)}` : ""}
          </div>
        </div>
        <span class="pill ${
          p.status === "ATIVO" ? "pill-gold" :
          p.status === "ENCERRADO" ? "pill-green" : "pill-dim"
        }">
          ${p.status}
        </span>
      </div>
      ${ativo ? `
        <div class="pacote-progress"><div class="pacote-progress-fill" style="width:${pct}%"></div></div>
        <div class="pacote-items">
          ${p.itens.map(item => `
            <div class="pacote-item">
              <div class="pacote-item-num">${item.quantidade_total - item.quantidade_usada}<span style="color:var(--text-dim);font-size:13px">/${item.quantidade_total}</span></div>
              <div class="pacote-item-lbl">${escapeHtml(item.servico?.nome || "Serviço")}</div>
              ${item.quantidade_usada < item.quantidade_total ? `
                <button onclick='consumirItem("${item.id}", "${p.id}", "${state.currentClienteId}", ${JSON.stringify(item.servico?.nome || "Serviço")})'>
                  Marcar 1
                </button>
              ` : `<div style="font-size:9px;color:var(--text-dim);margin-top:4px">Usado</div>`}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// ========== CONSUMIR ITEM DO PACOTE ==========
async function consumirItem(itemId, pacoteId, clienteId, servicoNome) {
  if (!confirm(`Marcar 1 ${servicoNome} consumido neste pacote?`)) return;

  // Busca item atualizado
  const { data: item, error: e1 } = await sb.from("pacote_itens").select("*").eq("id", itemId).single();
  if (e1) { bf.toast("Erro: " + e1.message, "error"); return; }

  if (item.quantidade_usada >= item.quantidade_total) {
    bf.toast("Esse item já foi todo consumido", "error");
    return;
  }

  // Cria atendimento + consumo + atualiza item em sequência
  // (Em produção isso seria uma RPC transactional, mas com RLS funciona)
  const { data: atend, error: e2 } = await sb.from("atendimentos").insert({
    user_id: state.user.id,
    cliente_id: clienteId,
    servico_id: item.servico_id,
    pago_via_pacote: true,
    pacote_id: pacoteId,
  }).select().single();

  if (e2) { bf.toast("Erro: " + e2.message, "error"); return; }

  await sb.from("pacote_consumos").insert({
    pacote_id: pacoteId,
    pacote_item_id: itemId,
    atendimento_id: atend.id,
  });

  await sb.from("pacote_itens").update({
    quantidade_usada: item.quantidade_usada + 1,
  }).eq("id", itemId);

  // Verifica se o pacote inteiro foi consumido pra encerrar
  const { data: itensAtualizados } = await sb.from("pacote_itens").select("*").eq("pacote_id", pacoteId);
  const tudoConsumido = itensAtualizados.every(i => i.quantidade_usada >= i.quantidade_total);
  if (tudoConsumido) {
    await sb.from("pacotes").update({ status: "ENCERRADO" }).eq("id", pacoteId);
    bf.toast("Pacote concluído! Hora de oferecer renovação 🎉", "success");
  } else {
    bf.toast(`✓ 1 ${servicoNome} marcado como usado`, "success");
  }

  await loadInitialData();
  renderClienteDetail(clienteId);
}

// ========== MODAL VENDER PACOTE ==========
function openPacoteModal(clienteId, clienteNome) {
  const form = document.getElementById("pacoteForm");
  form.reset();
  form.cliente_id.value = clienteId;
  document.getElementById("pacoteModalCliente").textContent = "Cliente: " + clienteNome;

  // Popula serviços
  const list = document.getElementById("servicosList");
  list.innerHTML = state.servicos.map(s => `
    <div class="qty-row" data-servico-id="${s.id}">
      <div class="qty-info">
        <div class="qty-name">${escapeHtml(s.nome)}</div>
        <div class="qty-price">${bf.formatBRL(s.preco)} · avulso</div>
      </div>
      <div class="qty-control">
        <button type="button" onclick="changeQty(this, -1)">−</button>
        <span class="qty-num">0</span>
        <button type="button" onclick="changeQty(this, 1)">+</button>
      </div>
    </div>
  `).join("");

  // Reset pagamento tabs
  document.querySelectorAll("#pagamentoTabs .tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('#pagamentoTabs .tab-btn[data-forma="DINHEIRO"]').classList.add("active");
  form.forma_pagamento.value = "DINHEIRO";
  form.pago.value = "true";

  document.getElementById("pacoteModal").classList.add("open");
}

function changeQty(btn, delta) {
  const span = btn.parentElement.querySelector(".qty-num");
  let val = parseInt(span.textContent) + delta;
  if (val < 0) val = 0;
  if (val > 99) val = 99;
  span.textContent = val;
  // Auto-calcula valor sugerido
  autoCalcValor();
}

function autoCalcValor() {
  let total = 0;
  document.querySelectorAll("#servicosList .qty-row").forEach(row => {
    const id = row.dataset.servicoId;
    const qty = parseInt(row.querySelector(".qty-num").textContent);
    const servico = state.servicos.find(s => s.id === id);
    if (servico && qty) total += Number(servico.preco) * qty;
  });
  // Aplica desconto sugerido de ~12% (preço de pacote)
  const sugerido = total * 0.88;
  const valorInput = document.querySelector('#pacoteForm input[name="valor_total"]');
  if (valorInput && total > 0) valorInput.value = sugerido.toFixed(2);
}

function selectPagamento(btn) {
  document.querySelectorAll("#pagamentoTabs .tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const form = document.getElementById("pacoteForm");
  form.forma_pagamento.value = btn.dataset.forma;
  form.pago.value = btn.dataset.pago;
}

async function savePacote(e) {
  e.preventDefault();
  const btn = document.getElementById("pacoteSaveBtn");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  const fd = new FormData(e.target);
  const cliente_id = fd.get("cliente_id");
  const nome = fd.get("nome").trim();
  const valor_total = parseFloat(fd.get("valor_total"));
  const validade_dias = fd.get("validade_dias");

  // Coleta itens com qty > 0
  const itens = [];
  document.querySelectorAll("#servicosList .qty-row").forEach(row => {
    const qty = parseInt(row.querySelector(".qty-num").textContent);
    if (qty > 0) {
      itens.push({ servico_id: row.dataset.servicoId, quantidade_total: qty });
    }
  });

  if (itens.length === 0) {
    bf.toast("Adicione pelo menos um serviço", "error");
    btn.disabled = false;
    btn.textContent = "Confirmar venda";
    return;
  }

  // Cria pacote
  const dataValidade = validade_dias
    ? new Date(Date.now() + parseInt(validade_dias) * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: pacote, error: e1 } = await sb.from("pacotes").insert({
    user_id: state.user.id,
    cliente_id,
    nome,
    valor_total,
    forma_pagamento: fd.get("forma_pagamento"),
    pago: fd.get("pago") === "true",
    data_validade: dataValidade,
  }).select().single();

  if (e1) {
    bf.toast("Erro: " + e1.message, "error");
    btn.disabled = false;
    btn.textContent = "Confirmar venda";
    return;
  }

  // Cria itens
  const { error: e2 } = await sb.from("pacote_itens").insert(
    itens.map(i => ({ ...i, pacote_id: pacote.id }))
  );

  if (e2) {
    bf.toast("Pacote criado mas erro ao salvar itens: " + e2.message, "error");
  } else {
    bf.toast("Pacote criado!", "success");
  }

  btn.disabled = false;
  btn.textContent = "Confirmar venda";
  closeModal("pacoteModal");
  await loadInitialData();
  if (state.currentClienteId === cliente_id) {
    renderClienteDetail(cliente_id);
  }
}

// ========== PACOTES VIEW ==========
function renderPacotes() {
  const container = document.getElementById("pacotesList");
  document.getElementById("pacotesCount").textContent =
    `${state.pacotes.length} pacote${state.pacotes.length !== 1 ? "s" : ""} ativo${state.pacotes.length !== 1 ? "s" : ""}`;

  if (state.pacotes.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <h2>Nenhum pacote ativo</h2>
        <p>Vá até um cliente e clique em "Vender pacote" para começar.</p>
        <button class="btn btn-primary" onclick="navigate('clientes')">Ir para clientes</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:grid;gap:14px">
      ${state.pacotes.map(p => {
        const totalServicos = p.itens.reduce((acc, i) => acc + i.quantidade_total, 0);
        const usados = p.itens.reduce((acc, i) => acc + i.quantidade_usada, 0);
        return `
          <div class="card" style="cursor:pointer" onclick="navigate('cliente-detail', { id: '${p.cliente_id}' })">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar avatar-sm">${bf.getInitials(p.cliente?.nome || "?")}</div>
                  <div>
                    <div style="font-size:14px;font-weight:600">${escapeHtml(p.cliente?.nome || "?")}</div>
                    <div style="font-size:11px;color:var(--text-soft)">${escapeHtml(p.nome)}</div>
                  </div>
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-family:'Playfair Display';font-size:22px;font-weight:700;color:var(--gold)">
                  ${totalServicos - usados}<span style="color:var(--text-dim);font-size:14px">/${totalServicos}</span>
                </div>
                <div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;text-transform:uppercase">restantes</div>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ========== CONTA / CONFIGURAÇÕES ==========
function renderConta() {
  const profile = state.profile;
  const isTrial = profile.subscription_status === "TRIAL";
  const days = isTrial ? bf.trialDaysLeft(profile) : 0;

  document.getElementById("contaContent").innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px">
      <div class="card-gradient">
        <div class="block-h"><h3>Sua conta</h3></div>
        <div style="font-size:13px;color:var(--text-soft)">
          <div style="margin-bottom:10px">
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">Nome</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${escapeHtml(profile.name || "—")}</div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">Barbearia</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${escapeHtml(profile.barbershop_name || "—")}</div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">Email</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${escapeHtml(profile.email)}</div>
          </div>
          <div>
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">WhatsApp</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${bf.formatPhone((profile.phone || "").replace(/^55/, ""))}</div>
          </div>
        </div>
      </div>

      <div class="${isTrial ? "card-gold" : "card-gradient"}">
        <div class="block-h"><h3>Plano</h3></div>
        ${isTrial ? `
          <div style="font-family:'Playfair Display';font-size:30px;font-weight:700;color:var(--gold)">${days} ${days === 1 ? "dia" : "dias"}</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:4px">restantes do seu trial grátis</div>
          <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--line)">
            <div style="font-size:13px;line-height:1.6">
              Após o trial, o sistema custa <strong style="color:var(--gold)">${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}/mês</strong>.
            </div>
            <div style="margin-top:14px;background:rgba(0,0,0,0.3);padding:14px;border-radius:8px;font-size:12px;color:var(--text-soft);line-height:1.6">
              <div style="font-weight:600;color:var(--text);margin-bottom:8px">Como ativar:</div>
              1. Faça PIX de ${bf.formatBRL(window.APP_CONFIG.monthlyPrice)} para:<br>
              <code style="background:var(--bg-soft);padding:4px 8px;border-radius:4px;color:var(--gold);display:inline-block;margin-top:4px">${window.APP_CONFIG.pixKey}</code><br>
              <span style="color:var(--text-dim);font-size:11px">${window.APP_CONFIG.pixName}</span><br><br>
              2. Envie o comprovante no WhatsApp<br>
              3. Em até 24h sua conta é ativada
            </div>
            <a href="${bf.whatsappLink(window.APP_CONFIG.whatsappAdmin, 'Olá! Quero ativar meu plano Cortify. Vou enviar o comprovante do PIX.')}" target="_blank" class="btn btn-primary" style="width:100%;margin-top:14px">
              Já paguei · Enviar comprovante
            </a>
          </div>
        ` : `
          <div style="display:flex;align-items:center;gap:8px;font-size:14px">
            <span class="pill pill-green">ATIVO</span>
            <span style="color:var(--text-soft);font-size:13px">Plano Único</span>
          </div>
          <div style="font-family:'Playfair Display';font-size:30px;font-weight:700;color:var(--gold);margin-top:10px">${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}<span style="font-size:14px;color:var(--text-soft)">/mês</span></div>
          ${profile.paid_until ? `<div style="font-size:12px;color:var(--text-soft);margin-top:6px">Próxima cobrança: ${formatDateBR(profile.paid_until)}</div>` : ""}
        `}
      </div>
    </div>

    <div style="margin-top:20px;padding:18px;border:1px dashed var(--line);border-radius:12px;text-align:center;color:var(--text-soft);font-size:13px">
      Em breve: editar dados pessoais, mudar senha, configurar templates de WhatsApp.
    </div>
  `;
}

// ========== LOGOUT ==========
async function logout() {
  if (!confirm("Tem certeza que quer sair?")) return;
  await sb.auth.signOut();
  window.location.href = "index.html";
}

// ========== UTILS ==========
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJsonForAttr(obj) {
  return JSON.stringify(obj).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

function formatDateBR(dateStr, dayMonthOnly = false) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (dayMonthOnly) {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Expor funções globais necessárias pros onclick inline
window.navigate = navigate;
window.openClienteModal = openClienteModal;
window.closeModal = closeModal;
window.saveCliente = saveCliente;
window.deleteCliente = deleteCliente;
window.openPacoteModal = openPacoteModal;
window.savePacote = savePacote;
window.changeQty = changeQty;
window.selectPagamento = selectPagamento;
window.consumirItem = consumirItem;
window.renderClientes = renderClientes;
window.logout = logout;
