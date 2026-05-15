// ============================================
// CORTIFY - Admin: Planos e Cupons
// ============================================

let allPlans = [];
let allCoupons = [];

// ========== TAB SWITCHING ==========
function setAdminTab(tab) {
  document.getElementById('adminTabUsers').classList.toggle('active', tab === 'users');
  document.getElementById('adminTabPlans').classList.toggle('active', tab === 'plans');
  document.getElementById('adminTabCoupons').classList.toggle('active', tab === 'coupons');

  document.getElementById('adminViewUsers').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('adminViewPlans').style.display = tab === 'plans' ? 'block' : 'none';
  document.getElementById('adminViewCoupons').style.display = tab === 'coupons' ? 'block' : 'none';

  if (tab === 'plans') loadPlans();
  if (tab === 'coupons') loadCoupons();
}

// ========== PLANS ==========
async function loadPlans() {
  const container = document.getElementById('plansList');
  container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-soft)">Carregando...</div>`;

  // Busca planos e versões em queries separadas (mais robusto que join)
  const [plansRes, versionsRes, subsRes] = await Promise.all([
    sb.from('plans').select('*').order('display_order'),
    sb.from('plan_versions').select('*'),
    sb.from('subscriptions').select('plan_id, status')
  ]);

  if (plansRes.error) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--red)">Erro ao carregar planos: ${plansRes.error.message}</div>`;
    return;
  }

  const plans = plansRes.data || [];
  const versions = versionsRes.data || [];
  const subs = subsRes.data || [];

  // Mapeia versão atual de cada plano
  const versionById = {};
  versions.forEach(v => { versionById[v.id] = v; });

  // Anexa current_version manualmente
  plans.forEach(p => {
    p.current_version = p.current_version_id ? versionById[p.current_version_id] : null;
  });

  // Conta subscriptions
  const countsByPlan = {};
  subs.forEach(s => {
    if (!countsByPlan[s.plan_id]) countsByPlan[s.plan_id] = { active: 0, total: 0 };
    countsByPlan[s.plan_id].total++;
    if (s.status === 'ACTIVE' || s.status === 'TRIAL') countsByPlan[s.plan_id].active++;
  });

  allPlans = plans;

  if (plans.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-soft)">Nenhum plano cadastrado ainda. Crie o primeiro.</div>`;
    return;
  }

  container.innerHTML = plans.map(p => {
    const v = p.current_version;
    const counts = countsByPlan[p.id] || { active: 0, total: 0 };
    const priceStr = v ? `R$ ${Number(v.price).toFixed(2).replace('.', ',')}` : '—';
    const cycleStr = v ? (v.billing_cycle === 'YEARLY' ? '/ano' : '/mês') : '';

    return `
      <div style="background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <h3 style="font-family:'Playfair Display';font-size:18px;font-weight:600">${escapeHtmlAdmin(p.name)}</h3>
              ${!p.active ? '<span class="pill pill-red" style="font-size:10px">INATIVO</span>' : ''}
              ${!p.visible ? '<span class="pill pill-dim" style="font-size:10px">OCULTO</span>' : ''}
              ${p.plan_kind === 'BARBEARIA' ? '<span class="pill pill-gold" style="font-size:10px">BARBEARIA</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;font-family:'JetBrains Mono', monospace">/${p.slug}</div>
            ${p.description ? `<p style="font-size:12px;color:var(--text-soft);margin-bottom:10px">${escapeHtmlAdmin(p.description)}</p>` : ''}
            <div style="display:flex;gap:18px;font-size:12px;flex-wrap:wrap">
              <div><span style="color:var(--text-dim)">Preço:</span> <strong style="color:var(--gold)">${priceStr}${cycleStr}</strong></div>
              <div><span style="color:var(--text-dim)">Trial:</span> ${v?.trial_days || 0} dias</div>
              <div><span style="color:var(--text-dim)">Versão:</span> v${v?.version_number || 1}</div>
              <div><span style="color:var(--text-dim)">Ativos:</span> ${counts.active}/${counts.total}</div>
            </div>
            ${v?.per_seat_pricing ? `<div style="margin-top:6px;font-size:11px;color:var(--text-dim)">Cobrança por barbeiro · Mín. ${v.min_seats}${v.max_seats ? ` · Máx. ${v.max_seats}` : ''}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm" onclick="viewPlanVersions('${p.id}')" title="Ver histórico de versões">📜 v${v?.version_number || 1}</button>
            <button class="btn btn-ghost btn-sm" onclick="editPlan('${p.id}')">Editar</button>
            ${counts.total === 0 ? `<button class="icon-btn" onclick="deletePlan('${p.id}')" title="Excluir" style="color:var(--red)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
          </div>
        </div>

        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line-soft)">
          <details>
            <summary style="font-size:11px;color:var(--text-dim);cursor:pointer">Ver features liberadas</summary>
            <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:6px;font-size:11px">
              ${renderFeatures(v?.features || {})}
            </div>
          </details>
        </div>
      </div>
    `;
  }).join('');
}

function renderFeatures(features) {
  const labels = {
    'max_clientes': 'Máx. clientes',
    'max_barbeiros': 'Máx. barbeiros',
    'max_servicos': 'Máx. serviços',
    'can_use_public_page': 'Página pública',
    'can_use_packages': 'Pacotes',
    'can_export_pdf': 'Exportar PDF',
    'can_send_email_marketing': 'Email marketing',
    'can_use_loyalty_system': 'Fidelidade',
    'can_use_whatsapp_api': 'WhatsApp API',
    'can_have_logo': 'Logo personalizado',
    'can_manage_team': 'Gerenciar equipe',
    'can_view_team_dashboard': 'Dashboard equipe',
    'support_priority': 'Suporte',
  };

  return Object.entries(features).map(([key, value]) => {
    const label = labels[key] || key;
    let display;
    if (typeof value === 'boolean') {
      display = value ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--red)">✗</span>';
    } else if (key.startsWith('max_') && Number(value) >= 999) {
      display = '<span style="color:var(--gold)">∞</span>';
    } else {
      display = `<strong>${value}</strong>`;
    }
    return `<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg-soft);border-radius:4px"><span style="color:var(--text-dim)">${label}</span>${display}</div>`;
  }).join('');
}

function openPlanModal() {
  document.getElementById('planModalTitle').textContent = 'Novo plano';
  const form = document.getElementById('planForm');
  form.reset();
  form.querySelector('input[name="plan_id"]').value = '';
  form.querySelector('input[name="active"]').checked = true;
  form.querySelector('input[name="visible"]').checked = true;
  form.querySelector('input[name="feat_can_use_public_page"]').checked = true;
  form.querySelector('input[name="feat_can_use_packages"]').checked = true;
  form.querySelector('input[name="feat_can_have_logo"]').checked = true;
  form.querySelector('input[name="feat_max_clientes"]').value = 999999;
  form.querySelector('input[name="feat_max_servicos"]').value = 999;
  form.querySelector('input[name="trial_days"]').value = 7;
  togglePerSeatFields();
  document.getElementById('planModal').classList.add('open');
}

function togglePerSeatFields() {
  const kind = document.querySelector('select[name="plan_kind"]')?.value;
  const isBarbearia = kind === 'BARBEARIA';
  document.getElementById('perSeatToggleField').style.display = isBarbearia ? 'block' : 'none';
  document.getElementById('perSeatField').style.display = isBarbearia ? 'block' : 'none';
  document.getElementById('maxSeatsField').style.display = isBarbearia ? 'block' : 'none';
}

async function editPlan(planId) {
  const plan = allPlans.find(p => p.id === planId);
  if (!plan) return;
  const v = plan.current_version;

  document.getElementById('planModalTitle').textContent = `Editar: ${plan.name}`;
  const form = document.getElementById('planForm');
  form.querySelector('input[name="plan_id"]').value = plan.id;
  form.querySelector('input[name="name"]').value = plan.name || '';
  form.querySelector('input[name="slug"]').value = plan.slug || '';
  form.querySelector('textarea[name="description"]').value = plan.description || '';
  form.querySelector('select[name="plan_kind"]').value = plan.plan_kind || 'AUTONOMO';
  form.querySelector('input[name="price"]').value = v?.price || '';
  form.querySelector('select[name="billing_cycle"]').value = v?.billing_cycle || 'MONTHLY';
  form.querySelector('input[name="trial_days"]').value = v?.trial_days || 7;
  form.querySelector('input[name="per_seat_pricing"]').checked = v?.per_seat_pricing || false;
  form.querySelector('input[name="min_seats"]').value = v?.min_seats || 1;
  form.querySelector('input[name="max_seats"]').value = v?.max_seats || '';
  form.querySelector('input[name="active"]').checked = plan.active !== false;
  form.querySelector('input[name="visible"]').checked = plan.visible !== false;

  // Features
  const f = v?.features || {};
  const featCheckboxes = ['can_use_public_page', 'can_use_packages', 'can_export_pdf', 
    'can_send_email_marketing', 'can_use_loyalty_system', 'can_use_whatsapp_api', 
    'can_have_logo', 'can_manage_team'];
  featCheckboxes.forEach(name => {
    const cb = form.querySelector(`input[name="feat_${name}"]`);
    if (cb) cb.checked = f[name] === true;
  });
  form.querySelector('input[name="feat_max_clientes"]').value = f.max_clientes || 999999;
  form.querySelector('input[name="feat_max_servicos"]').value = f.max_servicos || 999;
  form.querySelector('textarea[name="notes"]').value = v?.notes || '';

  togglePerSeatFields();
  document.getElementById('planModal').classList.add('open');
}

async function savePlan(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const planId = fd.get('plan_id');

  // Monta features
  const features = {
    max_clientes: parseInt(fd.get('feat_max_clientes')) || 999999,
    max_barbeiros: fd.get('plan_kind') === 'BARBEARIA' ? 999 : 1,
    max_servicos: parseInt(fd.get('feat_max_servicos')) || 999,
    can_use_public_page: fd.get('feat_can_use_public_page') === 'on',
    can_use_packages: fd.get('feat_can_use_packages') === 'on',
    can_export_pdf: fd.get('feat_can_export_pdf') === 'on',
    can_send_email_marketing: fd.get('feat_can_send_email_marketing') === 'on',
    can_use_loyalty_system: fd.get('feat_can_use_loyalty_system') === 'on',
    can_use_whatsapp_api: fd.get('feat_can_use_whatsapp_api') === 'on',
    can_have_logo: fd.get('feat_can_have_logo') === 'on',
    can_manage_team: fd.get('feat_can_manage_team') === 'on',
  };

  const planData = {
    slug: String(fd.get('slug')).toLowerCase().trim(),
    name: String(fd.get('name')).trim(),
    description: String(fd.get('description') || '').trim() || null,
    plan_kind: fd.get('plan_kind'),
    active: fd.get('active') === 'on',
    visible: fd.get('visible') === 'on',
  };

  try {
    let actualPlanId = planId;

    if (!planId) {
      // CRIAR plano novo
      const { data: newPlan, error: planErr } = await sb
        .from('plans')
        .insert(planData)
        .select()
        .single();

      if (planErr) throw planErr;
      actualPlanId = newPlan.id;
    } else {
      // ATUALIZA dados gerais do plano (não recria versão)
      const { error: updErr } = await sb
        .from('plans')
        .update(planData)
        .eq('id', planId);
      if (updErr) throw updErr;
    }

    // Cria nova versão via RPC
    const { data: newVersionId, error: vErr } = await sb.rpc('create_plan_version', {
      p_plan_id: actualPlanId,
      p_price: parseFloat(fd.get('price')),
      p_billing_cycle: fd.get('billing_cycle'),
      p_trial_days: parseInt(fd.get('trial_days')) || 7,
      p_features: features,
      p_per_seat_pricing: fd.get('per_seat_pricing') === 'on',
      p_min_seats: parseInt(fd.get('min_seats')) || 1,
      p_max_seats: fd.get('max_seats') ? parseInt(fd.get('max_seats')) : null,
      p_notes: String(fd.get('notes') || '').trim() || null,
    });

    if (vErr) throw vErr;

    bf.toast(planId ? 'Plano atualizado (nova versão criada)' : 'Plano criado', 'success');
    closeModalAdmin('planModal');
    loadPlans();
  } catch (err) {
    bf.toast('Erro: ' + err.message, 'error');
  }
}

async function deletePlan(planId) {
  if (!confirm('Excluir esse plano permanentemente?\n\nSó pode ser excluído se NINGUÉM estiver usando.')) return;

  // Primeiro tenta apagar versões
  await sb.from('plan_versions').delete().eq('plan_id', planId);
  const { error } = await sb.from('plans').delete().eq('id', planId);

  if (error) {
    bf.toast('Erro: ' + error.message + '. Pode haver subscriptions usando esse plano.', 'error');
    return;
  }

  bf.toast('Plano excluído', 'success');
  loadPlans();
}

async function viewPlanVersions(planId) {
  const { data: versions } = await sb
    .from('plan_versions')
    .select('*')
    .eq('plan_id', planId)
    .order('version_number', { ascending: false });

  if (!versions || versions.length === 0) {
    alert('Nenhuma versão encontrada.');
    return;
  }

  const text = versions.map(v => {
    const date = new Date(v.created_at).toLocaleDateString('pt-BR');
    const active = !v.effective_until;
    return `v${v.version_number} ${active ? '(ATUAL)' : ''} - R$ ${Number(v.price).toFixed(2)} - ${v.billing_cycle} - ${date}`;
  }).join('\n');

  alert(`Histórico de versões:\n\n${text}`);
}

// ========== COUPONS ==========
async function loadCoupons() {
  const container = document.getElementById('couponsList');
  container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-soft)">Carregando...</div>`;

  const { data: coupons, error } = await sb
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--red)">Erro: ${error.message}</div>`;
    return;
  }

  allCoupons = coupons || [];

  if (allCoupons.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-soft)">Nenhum cupom cadastrado ainda. Crie o primeiro.</div>`;
    return;
  }

  container.innerHTML = allCoupons.map(c => {
    const valor = c.discount_type === 'PERCENT' ? `${c.discount_value}% off` : `R$ ${Number(c.discount_value).toFixed(2)} off`;
    const usos = c.max_redemptions ? `${c.times_redeemed}/${c.max_redemptions}` : `${c.times_redeemed} usos`;
    const expirado = c.valid_until && new Date(c.valid_until) < new Date();
    const esgotado = c.max_redemptions && c.times_redeemed >= c.max_redemptions;

    return `
      <div style="background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <code style="font-family:'JetBrains Mono', monospace;font-size:14px;font-weight:700;color:var(--gold);background:rgba(212,168,87,0.1);padding:3px 8px;border-radius:6px">${c.code}</code>
            ${!c.active ? '<span class="pill pill-red" style="font-size:10px">INATIVO</span>' : ''}
            ${expirado ? '<span class="pill pill-red" style="font-size:10px">EXPIRADO</span>' : ''}
            ${esgotado ? '<span class="pill pill-red" style="font-size:10px">ESGOTADO</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text-soft)">${escapeHtmlAdmin(c.description || '—')}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:4px">
            <strong style="color:var(--gold)">${valor}</strong> · ${c.duration === 'ONCE' ? '1 vez' : c.duration === 'FOREVER' ? 'Vitalício' : `${c.duration_in_months || '?'} meses`} · ${usos}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="editCoupon('${c.id}')">Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleCouponActive('${c.id}', ${!c.active})" style="color:${c.active ? 'var(--red)' : 'var(--green)'}">${c.active ? 'Desativar' : 'Ativar'}</button>
          ${c.times_redeemed === 0 ? `<button class="icon-btn" onclick="deleteCoupon('${c.id}')" title="Excluir" style="color:var(--red)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openCouponModal() {
  document.getElementById('couponModalTitle').textContent = 'Novo cupom';
  const form = document.getElementById('couponForm');
  form.reset();
  form.querySelector('input[name="coupon_id"]').value = '';
  form.querySelector('input[name="active"]').checked = true;
  toggleDurationField();
  document.getElementById('couponModal').classList.add('open');
}

function toggleDurationField() {
  const duration = document.querySelector('select[name="duration"]')?.value;
  document.getElementById('durationMonthsField').style.display = duration === 'REPEATING' ? 'block' : 'none';
}

async function editCoupon(couponId) {
  const c = allCoupons.find(x => x.id === couponId);
  if (!c) return;

  document.getElementById('couponModalTitle').textContent = `Editar: ${c.code}`;
  const form = document.getElementById('couponForm');
  form.querySelector('input[name="coupon_id"]').value = c.id;
  form.querySelector('input[name="code"]').value = c.code;
  form.querySelector('input[name="description"]').value = c.description || '';
  form.querySelector('select[name="discount_type"]').value = c.discount_type;
  form.querySelector('input[name="discount_value"]').value = c.discount_value;
  form.querySelector('select[name="duration"]').value = c.duration;
  form.querySelector('input[name="duration_in_months"]').value = c.duration_in_months || '';
  form.querySelector('input[name="max_redemptions"]').value = c.max_redemptions || '';
  form.querySelector('input[name="valid_until"]').value = c.valid_until ? c.valid_until.slice(0, 16) : '';
  form.querySelector('input[name="active"]').checked = c.active;

  toggleDurationField();
  document.getElementById('couponModal').classList.add('open');
}

async function saveCoupon(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const couponId = fd.get('coupon_id');

  const data = {
    code: String(fd.get('code')).toUpperCase().trim(),
    description: String(fd.get('description') || '').trim() || null,
    discount_type: fd.get('discount_type'),
    discount_value: parseFloat(fd.get('discount_value')),
    duration: fd.get('duration'),
    duration_in_months: fd.get('duration_in_months') ? parseInt(fd.get('duration_in_months')) : null,
    max_redemptions: fd.get('max_redemptions') ? parseInt(fd.get('max_redemptions')) : null,
    valid_until: fd.get('valid_until') ? new Date(fd.get('valid_until')).toISOString() : null,
    active: fd.get('active') === 'on',
  };

  try {
    if (couponId) {
      const { error } = await sb.from('coupons').update(data).eq('id', couponId);
      if (error) throw error;
    } else {
      data.created_by = state.user.id;
      const { error } = await sb.from('coupons').insert(data);
      if (error) throw error;
    }

    bf.toast(couponId ? 'Cupom atualizado' : 'Cupom criado', 'success');
    closeModalAdmin('couponModal');
    loadCoupons();
  } catch (err) {
    bf.toast('Erro: ' + err.message, 'error');
  }
}

async function toggleCouponActive(couponId, newState) {
  const { error } = await sb.from('coupons').update({ active: newState }).eq('id', couponId);
  if (error) { bf.toast('Erro: ' + error.message, 'error'); return; }
  bf.toast(newState ? 'Cupom ativado' : 'Cupom desativado', 'success');
  loadCoupons();
}

async function deleteCoupon(couponId) {
  if (!confirm('Excluir esse cupom permanentemente?')) return;
  const { error } = await sb.from('coupons').delete().eq('id', couponId);
  if (error) { bf.toast('Erro: ' + error.message, 'error'); return; }
  bf.toast('Cupom excluído', 'success');
  loadCoupons();
}

// ========== UTILS ==========
function escapeHtmlAdmin(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function closeModalAdmin(id) {
  document.getElementById(id)?.classList.remove('open');
}

// Listeners pra toggles dinâmicos
document.addEventListener('change', (e) => {
  if (e.target.name === 'plan_kind') togglePerSeatFields();
  if (e.target.name === 'duration') toggleDurationField();
});

// Globals
window.setAdminTab = setAdminTab;
window.openPlanModal = openPlanModal;
window.editPlan = editPlan;
window.savePlan = savePlan;
window.deletePlan = deletePlan;
window.viewPlanVersions = viewPlanVersions;
window.openCouponModal = openCouponModal;
window.editCoupon = editCoupon;
window.saveCoupon = saveCoupon;
window.toggleCouponActive = toggleCouponActive;
window.deleteCoupon = deleteCoupon;
window.closeModalAdmin = closeModalAdmin;
window.togglePerSeatFields = togglePerSeatFields;
window.toggleDurationField = toggleDurationField;
