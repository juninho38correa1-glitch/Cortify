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
  } else if (view === "pacote-detail" && opts.id) {
    viewId = "view-pacote-detail";
    renderPacoteDetail(opts.id);
  } else if (view === "clientes") {
    renderClientes();
    if (opts.new) openClienteModal();
  } else if (view === "dashboard") {
    renderDashboard();
  } else if (view === "pacotes") {
    renderPacotes();
  } else if (view === "agenda") {
    renderAgenda();
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
  } else if (view === "pacote-detail") {
    document.querySelector('.side-link[data-view="pacotes"]')?.classList.add("active");
  }
}

// ========== DASHBOARD ==========
let dashPeriodo = 'hoje';

function setDashPeriodo(periodo) {
  dashPeriodo = periodo;
  document.querySelectorAll('.tab-btn[data-periodo]').forEach(b => {
    b.classList.toggle('active', b.dataset.periodo === periodo);
  });
  renderDashboard();
}

function getDateRange(periodo) {
  const agora = new Date();
  const fim = new Date(agora);
  fim.setHours(23, 59, 59, 999);

  let inicio = new Date(agora);
  let inicioPrev, fimPrev;
  let label = '';

  if (periodo === 'hoje') {
    inicio.setHours(0, 0, 0, 0);
    inicioPrev = new Date(inicio);
    inicioPrev.setDate(inicioPrev.getDate() - 1);
    fimPrev = new Date(fim);
    fimPrev.setDate(fimPrev.getDate() - 1);
    label = 'hoje';
  } else if (periodo === 'semana') {
    inicio.setDate(inicio.getDate() - 6);
    inicio.setHours(0, 0, 0, 0);
    inicioPrev = new Date(inicio);
    inicioPrev.setDate(inicioPrev.getDate() - 7);
    fimPrev = new Date(inicio);
    fimPrev.setMilliseconds(-1);
    label = 'últimos 7 dias';
  } else if (periodo === 'mes') {
    inicio.setDate(inicio.getDate() - 29);
    inicio.setHours(0, 0, 0, 0);
    inicioPrev = new Date(inicio);
    inicioPrev.setDate(inicioPrev.getDate() - 30);
    fimPrev = new Date(inicio);
    fimPrev.setMilliseconds(-1);
    label = 'últimos 30 dias';
  } else if (periodo === 'ano') {
    inicio.setMonth(inicio.getMonth() - 11);
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    inicioPrev = new Date(inicio);
    inicioPrev.setFullYear(inicioPrev.getFullYear() - 1);
    fimPrev = new Date(inicio);
    fimPrev.setMilliseconds(-1);
    label = 'últimos 12 meses';
  }

  return { inicio, fim, inicioPrev, fimPrev, label };
}

async function renderDashboard() {
  // Saudação
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = state.profile.name?.split(" ")[0] || "barbeiro";
  document.getElementById("greeting").textContent = `${greeting}, ${firstName}`;
  document.getElementById("todayLabel").textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  const range = getDateRange(dashPeriodo);
  const container = document.getElementById('dashContent');
  container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  // Busca todos os dados em paralelo
  const [
    atendRes, atendPrevRes,
    pkgRes, pkgPrevRes,
    proxAgendaRes,
    pacotesAtivosRes,
    aniversariantesRes,
  ] = await Promise.all([
    sb.from("atendimentos")
      .select("*, cliente:clientes(nome), servico:servicos(nome, preco)")
      .gte("data", range.inicio.toISOString())
      .lte("data", range.fim.toISOString())
      .order("data", { ascending: false }),
    sb.from("atendimentos")
      .select("valor_avulso, pago_via_pacote")
      .gte("data", range.inicioPrev.toISOString())
      .lte("data", range.fimPrev.toISOString()),
    sb.from("pacotes")
      .select("*, cliente:clientes(nome)")
      .gte("created_at", range.inicio.toISOString())
      .lte("created_at", range.fim.toISOString())
      .eq("pago", true),
    sb.from("pacotes")
      .select("valor_total")
      .gte("created_at", range.inicioPrev.toISOString())
      .lte("created_at", range.fimPrev.toISOString())
      .eq("pago", true),
    // Próximos agendamentos só se for hoje
    dashPeriodo === 'hoje'
      ? sb.from("agendamentos")
          .select("*, cliente:clientes(nome, telefone), servico:servicos(nome)")
          .gte("inicio", new Date().toISOString())
          .eq("status", "AGENDADO")
          .order("inicio", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] }),
    // Pacotes ativos pra alertas
    sb.from("pacotes")
      .select("id, nome, cliente:clientes(id, nome, telefone), data_validade, itens:pacote_itens(quantidade_total, quantidade_usada)")
      .eq("status", "ATIVO"),
    // Aniversariantes do mês
    sb.from("clientes").select("id, nome, telefone, aniversario").not("aniversario", "is", null),
  ]);

  const atendimentos = atendRes.data || [];
  const atendPrev = atendPrevRes.data || [];
  const pacotes = pkgRes.data || [];
  const pacotesPrev = pkgPrevRes.data || [];
  const proximos = proxAgendaRes.data || [];
  const pacotesAtivos = pacotesAtivosRes.data || [];
  const todosAniversariantes = aniversariantesRes.data || [];

  // CÁLCULOS
  const fatAvulso = atendimentos.reduce((acc, a) => acc + (a.valor_avulso ? Number(a.valor_avulso) : 0), 0);
  const fatPacote = pacotes.reduce((acc, p) => acc + Number(p.valor_total), 0);
  const fatTotal = fatAvulso + fatPacote;

  const fatAvulsoPrev = atendPrev.reduce((acc, a) => acc + (a.valor_avulso ? Number(a.valor_avulso) : 0), 0);
  const fatPacotePrev = pacotesPrev.reduce((acc, p) => acc + Number(p.valor_total), 0);
  const fatTotalPrev = fatAvulsoPrev + fatPacotePrev;

  const variacao = fatTotalPrev > 0
    ? Math.round(((fatTotal - fatTotalPrev) / fatTotalPrev) * 100)
    : (fatTotal > 0 ? null : 0);

  const clientesUnicos = new Set(atendimentos.map(a => a.cliente_id)).size;
  const consumosPacote = atendimentos.filter(a => a.pago_via_pacote).length;

  // Top clientes
  const totaisPorCliente = {};
  atendimentos.forEach(a => {
    if (!a.cliente_id) return;
    if (!totaisPorCliente[a.cliente_id]) {
      totaisPorCliente[a.cliente_id] = { nome: a.cliente?.nome, total: 0, count: 0 };
    }
    totaisPorCliente[a.cliente_id].total += Number(a.valor_avulso || 0);
    totaisPorCliente[a.cliente_id].count++;
  });
  pacotes.forEach(p => {
    if (!p.cliente_id) return;
    if (!totaisPorCliente[p.cliente_id]) {
      totaisPorCliente[p.cliente_id] = { nome: p.cliente?.nome, total: 0, count: 0 };
    }
    totaisPorCliente[p.cliente_id].total += Number(p.valor_total);
  });
  const topClientes = Object.entries(totaisPorCliente)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  // Top serviços
  const totaisPorServico = {};
  atendimentos.forEach(a => {
    if (!a.servico_id) return;
    if (!totaisPorServico[a.servico_id]) {
      totaisPorServico[a.servico_id] = { nome: a.servico?.nome, total: 0, count: 0 };
    }
    totaisPorServico[a.servico_id].count++;
    totaisPorServico[a.servico_id].total += Number(a.valor_avulso || 0);
  });
  const topServicos = Object.entries(totaisPorServico)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  // Alertas
  const pacotesAcabando = pacotesAtivos.filter(p => {
    const total = (p.itens || []).reduce((acc, i) => acc + i.quantidade_total, 0);
    const usado = (p.itens || []).reduce((acc, i) => acc + i.quantidade_usada, 0);
    const restantes = total - usado;
    return restantes <= 1 && restantes > 0;
  });

  const proxFimMs = 7 * 24 * 60 * 60 * 1000;
  const pacotesVencendo = pacotesAtivos.filter(p => {
    if (!p.data_validade) return false;
    const ms = new Date(p.data_validade) - new Date();
    return ms > 0 && ms < proxFimMs;
  });

  // Aniversariantes do mês
  const mesAtual = new Date().getMonth();
  const aniversariantes = todosAniversariantes.filter(c => {
    const m = new Date(c.aniversario).getMonth();
    return m === mesAtual;
  }).slice(0, 5);

  // Gráfico - barras por dia/semana/mês conforme o filtro
  const chartData = await buildChartData(dashPeriodo, range);

  // Variação visual
  const variacaoHTML = variacao === null ? '' :
    variacao === 0 ? `<div class="stat-foot">vs período anterior</div>` :
    variacao > 0
      ? `<div class="stat-foot" style="color:var(--green)">↑ ${variacao}% vs anterior</div>`
      : `<div class="stat-foot" style="color:var(--red)">↓ ${Math.abs(variacao)}% vs anterior</div>`;

  // RENDER FINAL
  container.innerHTML = `
    <!-- Linha principal de receita -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card gold" style="grid-column:span 2;min-width:280px">
        <div class="stat-label">Faturamento · ${range.label}</div>
        <div class="stat-num" style="font-size:36px">${bf.formatBRL(fatTotal)}</div>
        ${fatPacote > 0 || fatAvulso > 0 ? `<div class="stat-foot">${bf.formatBRL(fatAvulso)} avulso · ${bf.formatBRL(fatPacote)} pacote</div>` : ''}
        ${variacaoHTML}
      </div>
      <div class="stat-card">
        <div class="stat-label">Atendimentos</div>
        <div class="stat-num">${atendimentos.length}</div>
        <div class="stat-foot">${clientesUnicos} cliente${clientesUnicos !== 1 ? 's' : ''} único${clientesUnicos !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pacotes vendidos</div>
        <div class="stat-num">${pacotes.length}</div>
        <div class="stat-foot">${consumosPacote} consumo${consumosPacote !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- Gráfico de receita -->
    ${chartData.bars.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="block-h" style="margin-bottom:12px">
          <h3>Receita por ${chartData.tipo}</h3>
        </div>
        <div class="chart-bars">
          ${chartData.bars.map(b => `
            <div class="bar-col" title="${b.label}: ${bf.formatBRL(b.valor)}">
              <div class="bar" style="height:${b.altura}%"></div>
              <span class="bar-label">${b.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Próximos atendimentos (só hoje) -->
    ${dashPeriodo === 'hoje' && proximos.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="block-h">
          <h3>Próximos atendimentos</h3>
          <a onclick="navigate('agenda')" style="cursor:pointer;color:var(--gold);font-size:12px">Ver agenda →</a>
        </div>
        ${proximos.map(p => {
          const horario = new Date(p.inicio).toTimeString().slice(0, 5);
          return `
            <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line-soft)">
              <div style="font-family:'Playfair Display';font-size:20px;font-weight:700;color:var(--gold);min-width:60px">${horario}</div>
              <div style="flex:1">
                <div style="font-size:14px;font-weight:600">${escapeHtml(p.cliente?.nome || '?')}</div>
                <div style="font-size:11px;color:var(--text-soft);margin-top:2px">${escapeHtml(p.servico?.nome || '?')}</div>
              </div>
              <a href="${bf.whatsappLink(p.cliente?.telefone, `Oi ${p.cliente?.nome?.split(' ')[0] || ''}, lembrando do seu horário às ${horario}!`)}" target="_blank" class="icon-btn" title="WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              </a>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <!-- 2 colunas: top clientes + top serviços -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:18px;margin-bottom:20px">
      <div class="card">
        <div class="block-h"><h3>Top clientes</h3></div>
        ${topClientes.length === 0 ? `
          <p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px 10px">Sem dados no período</p>
        ` : topClientes.map(([id, c], i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft);cursor:pointer" onclick="navigate('cliente-detail', { id: '${id}' })">
            <div style="width:24px;height:24px;border-radius:50%;background:${i === 0 ? 'var(--gold)' : 'var(--bg-card)'};color:${i === 0 ? '#0a0a0a' : 'var(--text-soft)'};display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0">${i+1}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${escapeHtml(c.nome || '?')}</div>
              <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${c.count} atend.</div>
            </div>
            <div style="font-family:'Playfair Display';font-size:15px;font-weight:700;color:var(--gold)">${bf.formatBRL(c.total)}</div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="block-h"><h3>Top serviços</h3></div>
        ${topServicos.length === 0 ? `
          <p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px 10px">Sem dados no período</p>
        ` : topServicos.map(([id, s], i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft)">
            <div style="width:24px;height:24px;border-radius:50%;background:${i === 0 ? 'var(--gold)' : 'var(--bg-card)'};color:${i === 0 ? '#0a0a0a' : 'var(--text-soft)'};display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0">${i+1}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${escapeHtml(s.nome || '?')}</div>
              <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${s.count} vez${s.count !== 1 ? 'es' : ''}</div>
            </div>
            <div style="font-family:'Playfair Display';font-size:15px;font-weight:700;color:var(--gold)">${bf.formatBRL(s.total)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Alertas -->
    ${(pacotesAcabando.length + pacotesVencendo.length + aniversariantes.length) > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="block-h"><h3>⚠️ Atenção</h3></div>
        ${pacotesAcabando.map(p => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft)">
            <div style="width:30px;height:30px;border-radius:8px;background:rgba(212,168,87,0.15);color:var(--gold);display:grid;place-items:center;flex-shrink:0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <div style="flex:1;font-size:12px;color:var(--text-soft)">
              <strong style="color:var(--text)">${escapeHtml(p.cliente?.nome || '?')}</strong> está com pacote acabando — ofereça renovação
            </div>
            <a href="${bf.whatsappLink(p.cliente?.telefone, `Oi ${p.cliente?.nome?.split(' ')[0] || ''}! Vi aqui que seu pacote está acabando. Quer já garantir o próximo?`)}" target="_blank" class="btn btn-ghost btn-sm" onclick="event.stopPropagation()">Avisar</a>
          </div>
        `).join('')}
        ${pacotesVencendo.map(p => {
          const dias = Math.ceil((new Date(p.data_validade) - new Date()) / (1000 * 60 * 60 * 24));
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft)">
              <div style="width:30px;height:30px;border-radius:8px;background:rgba(224,116,116,0.1);color:var(--red);display:grid;place-items:center;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style="flex:1;font-size:12px;color:var(--text-soft)">
                Pacote de <strong style="color:var(--text)">${escapeHtml(p.cliente?.nome || '?')}</strong> vence em ${dias} dia${dias !== 1 ? 's' : ''}
              </div>
            </div>
          `;
        }).join('')}
        ${aniversariantes.map(c => {
          const dia = new Date(c.aniversario).getDate();
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft)">
              <div style="width:30px;height:30px;border-radius:8px;background:rgba(111,207,151,0.1);color:var(--green);display:grid;place-items:center;flex-shrink:0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>
              </div>
              <div style="flex:1;font-size:12px;color:var(--text-soft)">
                🎉 <strong style="color:var(--text)">${escapeHtml(c.nome)}</strong> faz aniversário dia ${dia}
              </div>
              <a href="${bf.whatsappLink(c.telefone, `Parabéns, ${c.nome.split(' ')[0]}! 🎉 Hoje é seu dia. Aparece pra um corte com mimo da casa.`)}" target="_blank" class="btn btn-ghost btn-sm" onclick="event.stopPropagation()">Parabenizar</a>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <!-- Atalhos -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:14px">
      <a class="card" style="cursor:pointer;text-decoration:none;color:inherit" onclick="navigate('clientes', { new: true })">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--gold-dim);color:var(--gold);display:grid;place-items:center;margin-bottom:10px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <h3 class="font-display" style="font-size:16px;font-weight:600;margin-bottom:4px">Cadastrar cliente</h3>
      </a>
      <a class="card" style="cursor:pointer;text-decoration:none;color:inherit" onclick="navigate('agenda')">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--gold-dim);color:var(--gold);display:grid;place-items:center;margin-bottom:10px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
        </div>
        <h3 class="font-display" style="font-size:16px;font-weight:600;margin-bottom:4px">Ir pra agenda</h3>
      </a>
      <a class="card" style="cursor:pointer;text-decoration:none;color:inherit" onclick="navigate('pacotes')">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--gold-dim);color:var(--gold);display:grid;place-items:center;margin-bottom:10px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <h3 class="font-display" style="font-size:16px;font-weight:600;margin-bottom:4px">Ver pacotes ativos</h3>
      </a>
    </div>
  `;
}

// Constrói dados do gráfico baseado no período
async function buildChartData(periodo, range) {
  if (periodo === 'hoje') {
    // Não vale gráfico pra um dia só, mostra últimos 7 dias pra contexto
    const inicio7 = new Date();
    inicio7.setDate(inicio7.getDate() - 6);
    inicio7.setHours(0, 0, 0, 0);

    const [atendRes, pkgRes] = await Promise.all([
      sb.from("atendimentos").select("data, valor_avulso").gte("data", inicio7.toISOString()),
      sb.from("pacotes").select("created_at, valor_total").gte("created_at", inicio7.toISOString()).eq("pago", true),
    ]);

    const buckets = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio7);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { label: d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3), valor: 0 };
    }

    (atendRes.data || []).forEach(a => {
      const key = new Date(a.data).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].valor += Number(a.valor_avulso || 0);
    });
    (pkgRes.data || []).forEach(p => {
      const key = new Date(p.created_at).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].valor += Number(p.valor_total);
    });

    const bars = Object.values(buckets);
    const max = Math.max(...bars.map(b => b.valor), 1);
    bars.forEach(b => b.altura = (b.valor / max) * 100);
    return { tipo: 'dia (últimos 7)', bars };
  }

  if (periodo === 'semana' || periodo === 'mes') {
    const dias = periodo === 'semana' ? 7 : 30;
    const inicio = range.inicio;

    const buckets = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = {
        label: dias <= 14 ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : d.getDate() % 5 === 0 ? d.getDate() + '' : '',
        valor: 0,
      };
    }

    const [atendRes, pkgRes] = await Promise.all([
      sb.from("atendimentos").select("data, valor_avulso").gte("data", inicio.toISOString()).lte("data", range.fim.toISOString()),
      sb.from("pacotes").select("created_at, valor_total").gte("created_at", inicio.toISOString()).lte("created_at", range.fim.toISOString()).eq("pago", true),
    ]);

    (atendRes.data || []).forEach(a => {
      const key = new Date(a.data).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].valor += Number(a.valor_avulso || 0);
    });
    (pkgRes.data || []).forEach(p => {
      const key = new Date(p.created_at).toISOString().slice(0, 10);
      if (buckets[key]) buckets[key].valor += Number(p.valor_total);
    });

    const bars = Object.values(buckets);
    const max = Math.max(...bars.map(b => b.valor), 1);
    bars.forEach(b => b.altura = (b.valor / max) * 100);
    return { tipo: 'dia', bars };
  }

  if (periodo === 'ano') {
    // Por mês
    const inicio = range.inicio;
    const buckets = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(inicio);
      d.setMonth(d.getMonth() + i);
      const key = d.toISOString().slice(0, 7);
      buckets[key] = { label: d.toLocaleDateString("pt-BR", { month: "short" }), valor: 0 };
    }

    const [atendRes, pkgRes] = await Promise.all([
      sb.from("atendimentos").select("data, valor_avulso").gte("data", inicio.toISOString()),
      sb.from("pacotes").select("created_at, valor_total").gte("created_at", inicio.toISOString()).eq("pago", true),
    ]);

    (atendRes.data || []).forEach(a => {
      const key = new Date(a.data).toISOString().slice(0, 7);
      if (buckets[key]) buckets[key].valor += Number(a.valor_avulso || 0);
    });
    (pkgRes.data || []).forEach(p => {
      const key = new Date(p.created_at).toISOString().slice(0, 7);
      if (buckets[key]) buckets[key].valor += Number(p.valor_total);
    });

    const bars = Object.values(buckets);
    const max = Math.max(...bars.map(b => b.valor), 1);
    bars.forEach(b => b.altura = (b.valor / max) * 100);
    return { tipo: 'mês', bars };
  }

  return { tipo: '', bars: [] };
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
        const pct = totalServicos > 0 ? (usados / totalServicos) * 100 : 0;
        return `
          <div class="card" style="cursor:pointer" onclick="navigate('pacote-detail', { id: '${p.id}' })">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="avatar avatar-sm">${bf.getInitials(p.cliente?.nome || "?")}</div>
                  <div>
                    <div style="font-size:14px;font-weight:600">${escapeHtml(p.cliente?.nome || "?")}</div>
                    <div style="font-size:11px;color:var(--text-soft)">${escapeHtml(p.nome)} · ${bf.formatBRL(p.valor_total)}</div>
                  </div>
                </div>
                <div class="pacote-progress" style="margin-top:12px"><div class="pacote-progress-fill" style="width:${pct}%"></div></div>
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

// ========== PACOTE DETAIL VIEW ==========
async function renderPacoteDetail(id) {
  const container = document.getElementById("pacoteDetailContent");
  container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  // Busca pacote completo
  const [pacoteRes, consumosRes] = await Promise.all([
    sb.from("pacotes")
      .select("*, cliente:clientes(id, nome, telefone), itens:pacote_itens(*, servico:servicos(nome, preco))")
      .eq("id", id)
      .single(),
    sb.from("pacote_consumos")
      .select("*, atendimento:atendimentos(servico:servicos(nome, preco)), pacote_item:pacote_itens(servico:servicos(nome))")
      .eq("pacote_id", id)
      .order("data", { ascending: false }),
  ]);

  if (pacoteRes.error || !pacoteRes.data) {
    container.innerHTML = `<div class="empty"><h2>Pacote não encontrado</h2></div>`;
    return;
  }

  const pacote = pacoteRes.data;
  const consumos = consumosRes.data || [];
  const totalServicos = pacote.itens.reduce((acc, i) => acc + i.quantidade_total, 0);
  const usados = pacote.itens.reduce((acc, i) => acc + i.quantidade_usada, 0);
  const restantes = totalServicos - usados;
  const pct = totalServicos > 0 ? (usados / totalServicos) * 100 : 0;

  // Valor por serviço (média) — útil pra ver economia
  const valorMedio = totalServicos > 0 ? Number(pacote.valor_total) / totalServicos : 0;

  // Validade
  let validadeInfo = '';
  if (pacote.data_validade) {
    const ms = new Date(pacote.data_validade) - new Date();
    const dias = Math.ceil(ms / (1000 * 60 * 60 * 24));
    validadeInfo = dias > 0
      ? `<span style="color:${dias < 7 ? 'var(--red)' : 'var(--text-soft)'}">vence em ${dias} dia${dias !== 1 ? 's' : ''} (${formatDateBR(pacote.data_validade)})</span>`
      : `<span style="color:var(--red)">venceu em ${formatDateBR(pacote.data_validade)}</span>`;
  }

  container.innerHTML = `
    <div class="card-gradient" style="margin-bottom:20px">
      <div style="display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap">
        <div class="avatar avatar-lg">${bf.getInitials(pacote.cliente?.nome || "?")}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-family:'Playfair Display';font-size:24px;font-weight:700">${escapeHtml(pacote.nome)}</div>
          <div style="font-size:13px;color:var(--text-soft);margin-top:4px">
            <a onclick="navigate('cliente-detail', { id: '${pacote.cliente?.id}' })" style="cursor:pointer;color:var(--gold)">${escapeHtml(pacote.cliente?.nome || '?')}</a>
          </div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:8px;display:flex;gap:14px;flex-wrap:wrap">
            <span>📅 Iniciado em ${formatDateBR(pacote.data_inicio)}</span>
            ${pacote.data_validade ? `<span>⏰ ${validadeInfo}</span>` : '<span>⏰ Sem validade</span>'}
            <span>💰 ${bf.formatBRL(pacote.valor_total)}</span>
            <span>${pacote.pago ? '✅ Pago' : '⚠️ Pendente'}</span>
          </div>
        </div>
        <div style="text-align:right">
          <span class="pill ${pacote.status === 'ATIVO' ? 'pill-gold' : pacote.status === 'ENCERRADO' ? 'pill-green' : 'pill-dim'}">${pacote.status}</span>
        </div>
      </div>

      <!-- Progresso -->
      <div style="margin-top:20px">
        <div class="pacote-progress" style="height:10px"><div class="pacote-progress-fill" style="width:${pct}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:14px">
          <div>
            <div style="font-family:'Playfair Display';font-size:32px;font-weight:700;color:var(--gold);line-height:1">${restantes}</div>
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600;margin-top:4px">Restantes</div>
          </div>
          <div style="text-align:center">
            <div style="font-family:'Playfair Display';font-size:32px;font-weight:700;color:var(--text-soft);line-height:1">${usados}</div>
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600;margin-top:4px">Usados</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'Playfair Display';font-size:32px;font-weight:700;color:var(--text-soft);line-height:1">${totalServicos}</div>
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600;margin-top:4px">Total</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detalhamento dos serviços do pacote -->
    <div class="card" style="margin-bottom:20px">
      <div class="block-h"><h3>Serviços inclusos no pacote</h3></div>
      ${pacote.itens.map(item => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-soft)">
          <div>
            <div style="font-size:13px;font-weight:600">${escapeHtml(item.servico?.nome || '?')}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${bf.formatBRL(item.servico?.preco || 0)} avulso</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'Playfair Display';font-size:18px;font-weight:700;color:var(--gold)">
              ${item.quantidade_total - item.quantidade_usada}<span style="color:var(--text-dim);font-size:13px">/${item.quantidade_total}</span>
            </div>
          </div>
        </div>
      `).join("")}
    </div>

    <!-- Histórico de consumos -->
    <div class="card">
      <div class="block-h">
        <h3>Histórico de uso</h3>
        <span class="pill pill-dim">${consumos.length} ${consumos.length === 1 ? 'consumo' : 'consumos'}</span>
      </div>
      ${consumos.length === 0 ? `
        <p style="text-align:center;color:var(--text-soft);font-size:13px;padding:20px">
          Nenhum consumo registrado ainda. Quando você finalizar um atendimento usando esse pacote, vai aparecer aqui.
        </p>
      ` : consumos.map(c => {
        const data = new Date(c.data);
        const servicoUsado = c.atendimento?.servico?.nome || c.pacote_item?.servico?.nome || 'Serviço';
        const valorEvitado = c.atendimento?.servico?.preco || 0;
        return `
          <div style="display:flex;gap:14px;padding:12px 0;border-bottom:1px solid var(--line-soft)">
            <div style="font-family:'JetBrains Mono', monospace;font-size:11px;color:var(--text-dim);min-width:110px;line-height:1.5">
              ${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}<br>
              ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">${escapeHtml(servicoUsado)}</div>
              <div style="font-size:11px;color:var(--gold);margin-top:2px">via pacote · cliente economizou ${bf.formatBRL(valorEvitado)}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ========== CONTA / CONFIGURAÇÕES ==========
async function renderConta() {
  if (contaTab === 'servicos') {
    return renderServicos();
  }
  return renderContaPrincipal();
}

async function renderServicos() {
  const container = document.getElementById("contaContent");
  container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  const todos = await loadAllServicos();

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
      <div>
        <p style="font-size:13px;color:var(--text-soft)">${todos.length} serviço${todos.length !== 1 ? 's' : ''} cadastrado${todos.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openServicoModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo serviço
      </button>
    </div>
    ${todos.length === 0 ? `
      <div class="empty">
        <h2>Nenhum serviço ainda</h2>
        <p>Cadastre os serviços que você oferece pra começar a usar o sistema.</p>
        <button class="btn btn-primary" onclick="openServicoModal()">+ Cadastrar primeiro serviço</button>
      </div>
    ` : `
      <div style="display:grid;gap:10px">
        ${todos.map(s => `
          <div class="card" style="cursor:pointer;${!s.ativo ? 'opacity:0.5' : ''}" onclick='openServicoModal(${escapeJsonForAttr(s)})'>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:14px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <div style="font-size:15px;font-weight:600">${escapeHtml(s.nome)}</div>
                  ${!s.ativo ? '<span class="pill pill-dim" style="font-size:10px">Inativo</span>' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-soft);margin-top:2px">
                  ${s.duracao_min || 30} min · duração padrão
                </div>
              </div>
              <div style="text-align:right">
                <div style="font-family:'Playfair Display';font-size:22px;font-weight:700;color:var(--gold)">${bf.formatBRL(s.preco)}</div>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `}
  `;
}

function renderContaPrincipal() {
  const profile = state.profile;
  const isTrial = profile.subscription_status === "TRIAL";
  const isActive = profile.subscription_status === "ACTIVE";
  const days = isTrial ? bf.trialDaysLeft(profile) : 0;

  // Datas
  const dataCadastro = formatDateBR(profile.created_at);
  const trialIni = formatDateBR(profile.created_at);
  const trialFim = profile.trial_ends_at ? formatDateBR(profile.trial_ends_at) : '';
  const pagoAte = profile.paid_until ? formatDateBR(profile.paid_until) : '';
  const diasParaVencer = profile.paid_until
    ? Math.ceil((new Date(profile.paid_until) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  document.getElementById("contaContent").innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;margin-bottom:20px">
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
          <div style="margin-bottom:10px">
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">WhatsApp</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${bf.formatPhone((profile.phone || "").replace(/^55/, ""))}</div>
          </div>
          <div>
            <div style="font-size:10px;letter-spacing:1.5px;color:var(--text-dim);text-transform:uppercase;font-weight:600">Cliente desde</div>
            <div style="color:var(--text);font-size:14px;margin-top:2px">${dataCadastro}</div>
          </div>
        </div>
      </div>

      <div class="${isTrial ? "card-gold" : "card-gradient"}">
        <div class="block-h">
          <h3>Plano</h3>
          ${isTrial ? '<span class="pill pill-gold">TRIAL</span>' : isActive ? '<span class="pill pill-green">ATIVO</span>' : '<span class="pill pill-red">EXPIRADO</span>'}
        </div>

        ${isTrial ? `
          <div style="font-family:'Playfair Display';font-size:36px;font-weight:700;color:var(--gold);line-height:1">${days} ${days === 1 ? "dia" : "dias"}</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:6px">restantes do seu trial grátis</div>

          <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line);display:grid;gap:8px;font-size:12px">
            <div style="display:flex;justify-content:space-between;color:var(--text-soft)">
              <span>Início do trial:</span>
              <strong style="color:var(--text)">${trialIni}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-soft)">
              <span>Fim do trial:</span>
              <strong style="color:var(--text)">${trialFim}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-soft)">
              <span>Mensalidade após:</span>
              <strong style="color:var(--gold)">${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}</strong>
            </div>
          </div>

          <div style="margin-top:18px;background:rgba(0,0,0,0.3);padding:14px;border-radius:8px;font-size:12px;color:var(--text-soft);line-height:1.6">
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
        ` : isActive ? `
          <div style="font-family:'Playfair Display';font-size:36px;font-weight:700;color:var(--gold);line-height:1">${bf.formatBRL(window.APP_CONFIG.monthlyPrice)}<span style="font-size:14px;color:var(--text-soft);font-weight:400">/mês</span></div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:6px">Plano Único · Cortify</div>

          <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line);display:grid;gap:8px;font-size:12px">
            <div style="display:flex;justify-content:space-between;color:var(--text-soft)">
              <span>Próximo vencimento:</span>
              <strong style="color:var(--text)">${pagoAte}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--text-soft)">
              <span>Dias restantes:</span>
              <strong style="color:${diasParaVencer < 7 ? 'var(--red)' : 'var(--green)'}">${diasParaVencer} ${diasParaVencer === 1 ? 'dia' : 'dias'}</strong>
            </div>
          </div>

          ${diasParaVencer < 7 ? `
            <div style="margin-top:14px;background:rgba(212,168,87,0.08);border:1px solid rgba(212,168,87,0.25);padding:12px;border-radius:8px;font-size:12px;color:var(--text-soft);line-height:1.5">
              ⚠️ Sua mensalidade vence em ${diasParaVencer} dia${diasParaVencer !== 1 ? 's' : ''}. Faça o PIX e envie o comprovante.
            </div>
            <a href="${bf.whatsappLink(window.APP_CONFIG.whatsappAdmin, 'Olá! Quero renovar meu plano Cortify. Vou enviar o comprovante do PIX.')}" target="_blank" class="btn btn-primary" style="width:100%;margin-top:10px">
              Renovar via PIX
            </a>
          ` : ''}
        ` : `
          <div style="font-family:'Playfair Display';font-size:30px;font-weight:700;color:var(--red);line-height:1">Expirado</div>
          <div style="font-size:12px;color:var(--text-soft);margin-top:6px">Sua conta foi bloqueada por falta de pagamento</div>
        `}
      </div>
    </div>

    <!-- Histórico de pagamentos -->
    <div class="card">
      <div class="block-h"><h3>Histórico de pagamentos</h3></div>
      <div id="paymentsList">
        <div style="text-align:center;color:var(--text-soft);padding:20px;font-size:13px">Carregando...</div>
      </div>
    </div>
  `;

  // Carrega histórico de pagamentos async
  loadPaymentHistory();
}

async function loadPaymentHistory() {
  const { data, error } = await sb
    .from("platform_payments")
    .select("*")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false });

  const list = document.getElementById("paymentsList");
  if (!list) return;

  if (error || !data || data.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:13px">Nenhum pagamento registrado ainda</div>`;
    return;
  }

  list.innerHTML = data.map(p => {
    const data = p.paid_at || p.created_at;
    const ate = p.expires_at ? formatDateBR(p.expires_at) : '—';
    const statusColor = p.status === 'CONFIRMED' ? 'var(--green)' : p.status === 'PENDING' ? 'var(--gold)' : 'var(--red)';
    const statusLabel = p.status === 'CONFIRMED' ? '✓ Confirmado' : p.status === 'PENDING' ? '⏳ Pendente' : '✗ Rejeitado';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--line-soft);font-size:13px">
        <div>
          <div style="font-weight:600">${bf.formatBRL(p.amount)} · ${p.method}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${formatDateBR(data)} · acesso até ${ate}</div>
        </div>
        <div style="font-size:11px;color:${statusColor};font-weight:600">${statusLabel}</div>
      </div>
    `;
  }).join("");
}

// ========== AGENDA ==========

let agendaCurrentDate = new Date();
let agendaView = 'dia'; // 'dia' ou 'semana'
const HORARIO_INICIO = 8;  // 08:00
const HORARIO_FIM = 20;    // 20:00
const SLOT_MIN = 30;       // slot de 30 minutos

function changeAgendaDay(delta) {
  const dias = agendaView === 'semana' ? 7 : 1;
  agendaCurrentDate.setDate(agendaCurrentDate.getDate() + (delta * dias));
  renderAgenda();
}

function goToToday() {
  agendaCurrentDate = new Date();
  renderAgenda();
}

function setAgendaView(view) {
  agendaView = view;
  document.getElementById("tabDia").classList.toggle("active", view === "dia");
  document.getElementById("tabSemana").classList.toggle("active", view === "semana");
  renderAgenda();
}

async function renderAgenda() {
  if (agendaView === 'semana') {
    return renderAgendaSemana();
  }
  return renderAgendaDia();
}

async function renderAgendaDia() {
  const dateLabel = document.getElementById("agendaDateLabel");
  const list = document.getElementById("agendaList");
  const count = document.getElementById("agendaCount");

  const inicio = new Date(agendaCurrentDate);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(agendaCurrentDate);
  fim.setHours(23, 59, 59, 999);

  // Label do dia
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.round((inicio - hoje) / (1000 * 60 * 60 * 24));
  let prefixo = "";
  if (diff === 0) prefixo = "Hoje · ";
  else if (diff === 1) prefixo = "Amanhã · ";
  else if (diff === -1) prefixo = "Ontem · ";

  dateLabel.textContent = prefixo + agendaCurrentDate.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long",
  });

  list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  const { data: agendamentos, error } = await sb
    .from("agendamentos")
    .select("*, cliente:clientes(id, nome, telefone), servico:servicos(nome, preco)")
    .gte("inicio", inicio.toISOString())
    .lte("inicio", fim.toISOString())
    .order("inicio", { ascending: true });

  if (error) {
    list.innerHTML = `<div style="color:var(--red);padding:20px">Erro: ${error.message}</div>`;
    return;
  }

  // Pacotes ativos por cliente
  const clienteIds = (agendamentos || []).map(a => a.cliente_id);
  let pacotesPorCliente = {};
  if (clienteIds.length > 0) {
    const { data: pks } = await sb.from("pacotes")
      .select("cliente_id, id, nome, itens:pacote_itens(quantidade_total, quantidade_usada, servico_id)")
      .in("cliente_id", clienteIds)
      .eq("status", "ATIVO");
    (pks || []).forEach(p => {
      if (!pacotesPorCliente[p.cliente_id]) pacotesPorCliente[p.cliente_id] = [];
      pacotesPorCliente[p.cliente_id].push(p);
    });
  }

  count.textContent = `${(agendamentos || []).length} ${(agendamentos || []).length === 1 ? "agendamento" : "agendamentos"}`;

  // Monta a timeline com slots de 30 min
  const slots = [];
  for (let h = HORARIO_INICIO; h < HORARIO_FIM; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      const slotInicio = new Date(agendaCurrentDate);
      slotInicio.setHours(h, m, 0, 0);
      const slotFim = new Date(slotInicio.getTime() + SLOT_MIN * 60 * 1000);
      slots.push({ inicio: slotInicio, fim: slotFim });
    }
  }

  // Para cada slot, verifica se tem agendamento que inicia nele
  const slotsHTML = slots.map(slot => {
    const ag = (agendamentos || []).find(a => {
      const aIni = new Date(a.inicio);
      return aIni >= slot.inicio && aIni < slot.fim;
    });

    const horarioStr = slot.inicio.toTimeString().slice(0, 5);

    if (!ag) {
      // Slot vago
      return `
        <div class="slot-empty" onclick="openAgendamentoModalAtTime('${horarioStr}')">
          <div class="slot-time">${horarioStr}</div>
          <div class="slot-content">
            <span style="color:var(--text-dim);font-size:12px">+ Adicionar agendamento</span>
          </div>
        </div>
      `;
    }

    // Slot ocupado
    const dt = new Date(ag.inicio);
    const aFim = new Date(ag.fim);
    const aFimStr = aFim.toTimeString().slice(0, 5);
    const isFinalizado = ag.status === "FINALIZADO";
    const isCancelado = ag.status === "CANCELADO" || ag.status === "FALTOU";

    const pacotesCliente = pacotesPorCliente[ag.cliente_id] || [];
    const pacoteCobre = pacotesCliente.find(p =>
      p.itens.some(i => i.servico_id === ag.servico_id && i.quantidade_usada < i.quantidade_total)
    );
    const temPacoteAtivo = pacotesCliente.length > 0;

    const opacityCls = isFinalizado ? 'opacity:0.55' : (isCancelado ? 'opacity:0.4' : '');

    return `
      <div class="slot-filled" style="${opacityCls}">
        <div class="slot-time" style="color:${isFinalizado ? 'var(--green)' : 'var(--gold)'}">${horarioStr}</div>
        <div class="slot-content">
          <div class="appt-card ${isFinalizado ? 'done' : ''} ${isCancelado ? 'cancelled' : ''}">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div style="font-size:14px;font-weight:600">${escapeHtml(ag.cliente?.nome || "?")}</div>
                ${isFinalizado ? '<span class="pill pill-green" style="font-size:10px">Finalizado</span>' : ''}
                ${isCancelado ? `<span class="pill pill-red" style="font-size:10px">${ag.status}</span>` : ''}
                ${pacoteCobre && !isFinalizado && !isCancelado ? `
                  <span class="pill pill-gold" style="font-size:10px">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Pacote
                  </span>
                ` : ''}
              </div>
              <div style="font-size:11px;color:var(--text-soft);margin-top:2px">
                ${escapeHtml(ag.servico?.nome || "?")} · até ${aFimStr} · ${bf.formatBRL(ag.servico?.preco || 0)}
              </div>
            </div>
            ${!isFinalizado && !isCancelado ? `
              <div style="display:flex;gap:4px">
                <a href="${bf.whatsappLink(ag.cliente?.telefone, `Oi ${ag.cliente?.nome?.split(' ')[0] || ''}, lembrando do seu horário às ${horarioStr}!`)}" target="_blank" class="icon-btn" style="width:30px;height:30px" title="WhatsApp" onclick="event.stopPropagation()">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </a>
                <button class="btn btn-ghost btn-sm" style="padding:6px 10px;font-size:11px" onclick='event.stopPropagation();openAgendamentoModal(${escapeJsonForAttr(ag)})'>Editar</button>
                <button class="btn btn-success btn-sm" style="padding:6px 10px;font-size:11px" onclick='event.stopPropagation();openFinalizarModal(${escapeJsonForAttr({ ...ag, _temPacote: temPacoteAtivo })})'>✓ Finalizar</button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = `<div class="agenda-timeline">${slotsHTML}</div>`;
}

async function renderAgendaSemana() {
  const dateLabel = document.getElementById("agendaDateLabel");
  const list = document.getElementById("agendaList");
  const count = document.getElementById("agendaCount");

  // Calcula início e fim da semana (segunda a domingo)
  const dia = agendaCurrentDate.getDay();
  const diff = dia === 0 ? -6 : 1 - dia; // ajusta pra começar segunda
  const inicio = new Date(agendaCurrentDate);
  inicio.setDate(inicio.getDate() + diff);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  fim.setHours(0, 0, 0, 0);

  dateLabel.textContent = `${inicio.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${new Date(fim.getTime() - 1).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;

  list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-soft)">Carregando...</div>`;

  const { data: agendamentos, error } = await sb
    .from("agendamentos")
    .select("*, cliente:clientes(nome, telefone), servico:servicos(nome, preco)")
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString())
    .order("inicio", { ascending: true });

  if (error) {
    list.innerHTML = `<div style="color:var(--red);padding:20px">Erro: ${error.message}</div>`;
    return;
  }

  count.textContent = `${(agendamentos || []).length} ${(agendamentos || []).length === 1 ? "agendamento na semana" : "agendamentos na semana"}`;

  // Agrupa por dia
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    dias.push(d);
  }

  const diasHTML = dias.map(d => {
    const dStart = new Date(d);
    dStart.setHours(0, 0, 0, 0);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);

    const ags = (agendamentos || []).filter(a => {
      const ai = new Date(a.inicio);
      return ai >= dStart && ai <= dEnd;
    });

    const isHoje = d.toDateString() === new Date().toDateString();
    const nomeDia = d.toLocaleDateString("pt-BR", { weekday: "short" });
    const numDia = d.getDate();

    return `
      <div class="week-day ${isHoje ? 'today' : ''}">
        <div class="week-day-header">
          <div class="week-day-name">${nomeDia}</div>
          <div class="week-day-num">${numDia}</div>
        </div>
        <div class="week-day-body">
          ${ags.length === 0 ? `
            <div style="text-align:center;color:var(--text-dim);font-size:11px;padding:18px 8px;border:1px dashed var(--line-soft);border-radius:6px;cursor:pointer" onclick='goToDayInWeek("${d.toISOString()}")'>vazio</div>
          ` : ags.map(a => {
            const ai = new Date(a.inicio);
            const horario = ai.toTimeString().slice(0, 5);
            const isFinalizado = a.status === "FINALIZADO";
            const isCancelado = a.status === "CANCELADO" || a.status === "FALTOU";
            return `
              <div class="week-appt ${isFinalizado ? 'done' : ''} ${isCancelado ? 'cancelled' : ''}" onclick='goToDayInWeek("${d.toISOString()}")'>
                <div class="week-appt-time">${horario}</div>
                <div class="week-appt-name">${escapeHtml(a.cliente?.nome || "?")}</div>
                <div class="week-appt-svc">${escapeHtml(a.servico?.nome || "?")}</div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  list.innerHTML = `<div class="week-grid">${diasHTML}</div>`;
}

function goToDayInWeek(dateIso) {
  agendaCurrentDate = new Date(dateIso);
  setAgendaView('dia');
}

// Abre modal já com horário pré-selecionado
function openAgendamentoModalAtTime(horario) {
  openAgendamentoModal();
  const form = document.getElementById("agendamentoForm");
  form.horario.value = horario;
}

// ========== MODAL AGENDAMENTO ==========
function openAgendamentoModal(agendamento = null) {
  const form = document.getElementById("agendamentoForm");
  const title = document.getElementById("agendamentoModalTitle");
  const deleteBtn = document.getElementById("deleteAgBtn");

  form.reset();

  // Popula selects
  const clienteSel = document.getElementById("agClienteSelect");
  clienteSel.innerHTML = `<option value="">Selecione...</option>` +
    state.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");

  const servicoSel = document.getElementById("agServicoSelect");
  servicoSel.innerHTML = `<option value="">Selecione...</option>` +
    state.servicos.map(s => `<option value="${s.id}" data-duracao="${s.duracao_min || 30}">${escapeHtml(s.nome)} · ${bf.formatBRL(s.preco)}</option>`).join("");

  // Auto-preenche duração ao escolher serviço
  servicoSel.onchange = function() {
    const opt = this.selectedOptions[0];
    if (opt && opt.dataset.duracao) {
      form.duracao.value = opt.dataset.duracao;
    }
  };

  if (agendamento) {
    title.textContent = "Editar agendamento";
    deleteBtn.style.display = "inline-flex";
    deleteBtn.dataset.id = agendamento.id;

    const inicio = new Date(agendamento.inicio);
    const fim = new Date(agendamento.fim);
    const duracao = Math.round((fim - inicio) / (1000 * 60));

    form.id.value = agendamento.id;
    form.cliente_id.value = agendamento.cliente_id;
    form.servico_id.value = agendamento.servico_id;
    form.data.value = inicio.toISOString().split("T")[0];
    form.horario.value = inicio.toTimeString().slice(0, 5);
    form.duracao.value = duracao;
    form.observacao.value = agendamento.observacao || "";
  } else {
    title.textContent = "Novo agendamento";
    deleteBtn.style.display = "none";
    form.id.value = "";
    form.data.value = agendaCurrentDate.toISOString().split("T")[0];
    form.duracao.value = 30;
  }

  document.getElementById("agendamentoModal").classList.add("open");
}

async function saveAgendamento(e) {
  e.preventDefault();
  const btn = document.getElementById("agSaveBtn");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  const fd = new FormData(e.target);
  const data = fd.get("data");
  const horario = fd.get("horario");
  const duracao = parseInt(fd.get("duracao"));

  const inicio = new Date(`${data}T${horario}:00`);
  const fim = new Date(inicio.getTime() + duracao * 60 * 1000);

  const id = fd.get("id");

  // Validação de conflito
  const { data: conflitos } = await sb
    .from("agendamentos")
    .select("id, inicio, fim, cliente:clientes(nome)")
    .neq("id", id || "00000000-0000-0000-0000-000000000000")
    .neq("status", "CANCELADO")
    .neq("status", "FALTOU")
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString());

  if (conflitos && conflitos.length > 0) {
    const c = conflitos[0];
    const inicioConf = new Date(c.inicio).toTimeString().slice(0, 5);
    const fimConf = new Date(c.fim).toTimeString().slice(0, 5);
    if (!confirm(`⚠️ Conflito de horário!\n\nJá existe agendamento de ${c.cliente.nome} de ${inicioConf} às ${fimConf}.\n\nQuer agendar mesmo assim?`)) {
      btn.disabled = false;
      btn.textContent = "Salvar";
      return;
    }
  }

  const payload = {
    user_id: state.user.id,
    cliente_id: fd.get("cliente_id"),
    servico_id: fd.get("servico_id"),
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    observacao: fd.get("observacao")?.trim() || null,
  };

  let result;
  if (id) {
    result = await sb.from("agendamentos").update(payload).eq("id", id).select().single();
  } else {
    result = await sb.from("agendamentos").insert(payload).select().single();
  }

  btn.disabled = false;
  btn.textContent = "Salvar";

  if (result.error) {
    bf.toast("Erro: " + result.error.message, "error");
    return;
  }

  bf.toast(id ? "Agendamento atualizado" : "Agendamento criado", "success");
  closeModal("agendamentoModal");

  agendaCurrentDate = new Date(data + "T12:00:00");
  renderAgenda();
}

async function deleteAgendamento() {
  const id = document.getElementById("deleteAgBtn").dataset.id;
  if (!confirm("Excluir esse agendamento?")) return;

  const { error } = await sb.from("agendamentos").delete().eq("id", id);
  if (error) { bf.toast("Erro: " + error.message, "error"); return; }

  bf.toast("Agendamento excluído", "success");
  closeModal("agendamentoModal");
  renderAgenda();
}

// ========== MODAL FINALIZAR ATENDIMENTO ==========
async function openFinalizarModal(ag) {
  document.getElementById("finalizarSub").textContent =
    `${ag.cliente?.nome} · ${new Date(ag.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  // Busca TODOS os pacotes ativos do cliente
  const { data: pacotes } = await sb
    .from("pacotes")
    .select("*, itens:pacote_itens(*, servico:servicos(nome))")
    .eq("cliente_id", ag.cliente_id)
    .eq("status", "ATIVO");

  const servicoPreco = ag.servico?.preco || 0;

  let pacotesHTML = "";
  if (pacotes && pacotes.length > 0) {
    pacotesHTML = pacotes.map(p => {
      // Pega qualquer item disponível do pacote
      const item = p.itens.find(i => i.quantidade_usada < i.quantidade_total);
      if (!item) return ''; // pacote sem itens disponíveis

      const restantes = item.quantidade_total - item.quantidade_usada;
      const totalGeral = p.itens.reduce((acc, i) => acc + i.quantidade_total, 0);
      const usadosGeral = p.itens.reduce((acc, i) => acc + i.quantidade_usada, 0);
      const restantesGeral = totalGeral - usadosGeral;

      return `
        <button class="card-gold" style="text-align:left;cursor:pointer;font-family:inherit;color:var(--text);border:1px solid rgba(212,168,87,0.5)" onclick='confirmarFinalizar(${escapeJsonForAttr({ agendamento_id: ag.id, cliente_id: ag.cliente_id, servico_id: ag.servico_id, pago_via_pacote: true, pacote_id: p.id, pacote_item_id: item.id })})'>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              ${escapeHtml(p.nome)}
            </div>
            <div style="font-family:'Playfair Display';font-size:18px;color:var(--gold);font-weight:700">${restantesGeral}<span style="color:var(--text-soft);font-size:12px">/${totalGeral}</span></div>
          </div>
          <div style="font-size:12px;color:var(--text-soft);line-height:1.5">
            ${restantesGeral} restante${restantesGeral !== 1 ? 's' : ''} · sem cobrança hoje
          </div>
        </button>
      `;
    }).filter(Boolean).join("");
  }

  document.getElementById("finalizarBody").innerHTML = `
    ${pacotesHTML ? `
      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:10px">Usar pacote do cliente</div>
      <div style="display:grid;gap:10px;margin-bottom:18px">${pacotesHTML}</div>
    ` : ''}

    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-dim);font-weight:600;margin-bottom:10px">Cobrar avulso</div>
    <div style="display:grid;gap:10px">
      <button class="card" style="text-align:left;cursor:pointer;font-family:inherit;color:var(--text);border-color:var(--line)" onclick='confirmarFinalizar(${escapeJsonForAttr({ agendamento_id: ag.id, cliente_id: ag.cliente_id, servico_id: ag.servico_id, valor_avulso: servicoPreco, forma_pagamento: "DINHEIRO" })})'>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:600;font-size:14px">💵 Dinheiro</div>
          <div style="font-family:'Playfair Display';font-size:18px;font-weight:700;color:var(--gold)">${bf.formatBRL(servicoPreco)}</div>
        </div>
      </button>
      <button class="card" style="text-align:left;cursor:pointer;font-family:inherit;color:var(--text);border-color:var(--line)" onclick='confirmarFinalizar(${escapeJsonForAttr({ agendamento_id: ag.id, cliente_id: ag.cliente_id, servico_id: ag.servico_id, valor_avulso: servicoPreco, forma_pagamento: "PIX" })})'>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:600;font-size:14px">💸 PIX</div>
          <div style="font-family:'Playfair Display';font-size:18px;font-weight:700;color:var(--gold)">${bf.formatBRL(servicoPreco)}</div>
        </div>
      </button>
      <button class="card" style="text-align:left;cursor:pointer;font-family:inherit;color:var(--text);border-color:var(--line)" onclick='confirmarFinalizar(${escapeJsonForAttr({ agendamento_id: ag.id, cliente_id: ag.cliente_id, servico_id: ag.servico_id, valor_avulso: servicoPreco, forma_pagamento: "CARTAO" })})'>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:600;font-size:14px">💳 Cartão</div>
          <div style="font-family:'Playfair Display';font-size:18px;font-weight:700;color:var(--gold)">${bf.formatBRL(servicoPreco)}</div>
        </div>
      </button>
    </div>
    <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:8px">
      <button type="button" class="btn btn-danger btn-sm" onclick='cancelarAgendamento("${ag.id}")'>Marcar como faltou</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="closeModal('finalizarModal')">Fechar</button>
    </div>
  `;

  document.getElementById("finalizarModal").classList.add("open");
}

async function confirmarFinalizar(payload) {
  const data = {
    user_id: state.user.id,
    cliente_id: payload.cliente_id,
    servico_id: payload.servico_id,
    agendamento_id: payload.agendamento_id,
    pago_via_pacote: payload.pago_via_pacote || false,
    pacote_id: payload.pacote_id || null,
    valor_avulso: payload.valor_avulso || null,
    forma_pagamento: payload.forma_pagamento || null,
  };

  // Cria atendimento
  const { data: atend, error: e1 } = await sb.from("atendimentos").insert(data).select().single();
  if (e1) { bf.toast("Erro: " + e1.message, "error"); return; }

  // Se foi via pacote, debita o item específico
  if (payload.pago_via_pacote && payload.pacote_id && payload.pacote_item_id) {
    const { data: itemAtual } = await sb.from("pacote_itens").select("*").eq("id", payload.pacote_item_id).single();

    if (itemAtual) {
      await sb.from("pacote_consumos").insert({
        pacote_id: payload.pacote_id,
        pacote_item_id: payload.pacote_item_id,
        atendimento_id: atend.id,
      });
      await sb.from("pacote_itens").update({
        quantidade_usada: itemAtual.quantidade_usada + 1,
      }).eq("id", payload.pacote_item_id);

      // Verifica encerramento
      const { data: itensAtualizados } = await sb.from("pacote_itens").select("*").eq("pacote_id", payload.pacote_id);
      if (itensAtualizados.every(i => i.quantidade_usada >= i.quantidade_total)) {
        await sb.from("pacotes").update({ status: "ENCERRADO" }).eq("id", payload.pacote_id);
        bf.toast("Pacote encerrado! Hora de oferecer renovação 🎉", "success");
      }
    }
  }

  // Marca agendamento como finalizado
  await sb.from("agendamentos").update({ status: "FINALIZADO" }).eq("id", payload.agendamento_id);

  bf.toast("✓ Atendimento finalizado", "success");
  closeModal("finalizarModal");
  await loadInitialData();
  renderAgenda();
}

async function cancelarAgendamento(id) {
  if (!confirm("Marcar como falta? O cliente vai ficar marcado como ausente.")) return;
  const { error } = await sb.from("agendamentos").update({ status: "FALTOU" }).eq("id", id);
  if (error) { bf.toast("Erro: " + error.message, "error"); return; }
  bf.toast("Marcado como falta", "success");
  closeModal("finalizarModal");
  renderAgenda();
}

// ========== SERVIÇOS ==========
let contaTab = 'conta';

function setContaTab(tab) {
  contaTab = tab;
  document.getElementById("cfgTabConta").classList.toggle("active", tab === "conta");
  document.getElementById("cfgTabServicos").classList.toggle("active", tab === "servicos");
  renderConta();
}

function openServicoModal(servico = null) {
  const form = document.getElementById("servicoForm");
  const title = document.getElementById("servicoModalTitle");
  const toggleBtn = document.getElementById("deleteServicoBtn");

  form.reset();

  if (servico) {
    title.textContent = "Editar serviço";
    form.id.value = servico.id;
    form.nome.value = servico.nome;
    form.preco.value = servico.preco;
    form.duracao_min.value = servico.duracao_min || 30;

    toggleBtn.style.display = "inline-flex";
    toggleBtn.textContent = servico.ativo ? "Desativar" : "Ativar";
    toggleBtn.dataset.id = servico.id;
    toggleBtn.dataset.ativo = servico.ativo;
  } else {
    title.textContent = "Novo serviço";
    form.id.value = "";
    form.duracao_min.value = 30;
    toggleBtn.style.display = "none";
  }

  document.getElementById("servicoModal").classList.add("open");
}

async function saveServico(e) {
  e.preventDefault();
  const btn = document.getElementById("servicoSaveBtn");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  const fd = new FormData(e.target);
  const payload = {
    user_id: state.user.id,
    nome: fd.get("nome").trim(),
    preco: parseFloat(fd.get("preco")),
    duracao_min: parseInt(fd.get("duracao_min")) || 30,
  };

  const id = fd.get("id");
  let result;
  if (id) {
    result = await sb.from("servicos").update(payload).eq("id", id).select().single();
  } else {
    payload.ativo = true;
    result = await sb.from("servicos").insert(payload).select().single();
  }

  btn.disabled = false;
  btn.textContent = "Salvar";

  if (result.error) {
    bf.toast("Erro: " + result.error.message, "error");
    return;
  }

  bf.toast(id ? "Serviço atualizado" : "Serviço cadastrado", "success");
  closeModal("servicoModal");
  await loadInitialData();
  renderConta();
}

async function toggleServicoAtivo() {
  const btn = document.getElementById("deleteServicoBtn");
  const id = btn.dataset.id;
  const ativo = btn.dataset.ativo === "true";

  const acao = ativo ? "desativar" : "ativar";
  if (!confirm(`Tem certeza que quer ${acao} esse serviço?\n\n${ativo ? 'Ele não vai aparecer na criação de agendamentos e pacotes.' : 'Ele volta a aparecer nas listas.'}`)) return;

  const { error } = await sb.from("servicos").update({ ativo: !ativo }).eq("id", id);
  if (error) { bf.toast("Erro: " + error.message, "error"); return; }

  bf.toast(`Serviço ${ativo ? 'desativado' : 'ativado'}`, "success");
  closeModal("servicoModal");
  await loadInitialData();
  renderConta();
}

// Carrega TODOS os serviços (incluindo inativos) pra a aba de configuração
async function loadAllServicos() {
  const { data, error } = await sb.from("servicos").select("*").order("nome");
  if (error) return [];
  return data || [];
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
// Agenda
window.changeAgendaDay = changeAgendaDay;
window.goToToday = goToToday;
window.setAgendaView = setAgendaView;
window.goToDayInWeek = goToDayInWeek;
window.openAgendamentoModal = openAgendamentoModal;
window.openAgendamentoModalAtTime = openAgendamentoModalAtTime;
window.saveAgendamento = saveAgendamento;
window.deleteAgendamento = deleteAgendamento;
window.openFinalizarModal = openFinalizarModal;
window.confirmarFinalizar = confirmarFinalizar;
window.cancelarAgendamento = cancelarAgendamento;
// Serviços
window.setContaTab = setContaTab;
window.openServicoModal = openServicoModal;
window.saveServico = saveServico;
window.toggleServicoAtivo = toggleServicoAtivo;
// Dashboard
window.setDashPeriodo = setDashPeriodo;
