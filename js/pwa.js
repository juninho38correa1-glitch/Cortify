// ============================================
// CORTIFY - PWA & Push Notifications
// ============================================

window.bfPwa = (function() {

  // ===== REGISTRO DO SERVICE WORKER =====
  async function register() {
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker não suportado neste navegador');
      return null;
    }

    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      console.log('[PWA] Service Worker registrado:', reg.scope);
      return reg;
    } catch (err) {
      console.error('[PWA] Falha ao registrar SW:', err);
      return null;
    }
  }

  // ===== PROMPT DE INSTALAÇÃO =====
  let deferredPrompt = null;

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Mostra o botão de instalar (se existir na tela)
      const btn = document.getElementById('btnInstallPwa');
      if (btn) btn.style.display = 'inline-flex';
    });

    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App instalado!');
      deferredPrompt = null;
      const btn = document.getElementById('btnInstallPwa');
      if (btn) btn.style.display = 'none';
      if (window.bf?.toast) window.bf.toast('App instalado com sucesso! 🎉', 'success');
    });
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      // iOS não tem prompt, mostra instrução
      if (isIOS() && !isStandalone()) {
        showIOSInstallInstructions();
        return;
      }
      if (window.bf?.toast) window.bf.toast('App já está instalado ou seu navegador não suporta instalação.', 'info');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Resultado da instalação:', outcome);
    deferredPrompt = null;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function showIOSInstallInstructions() {
    const html = `
      <div style="text-align:left;font-size:14px;line-height:1.6">
        <p style="margin-bottom:12px"><strong>Instalar no iPhone:</strong></p>
        <ol style="padding-left:20px;color:var(--text-soft)">
          <li>Toque no ícone de compartilhar (⎙) na barra do Safari</li>
          <li>Role e toque em <strong>"Adicionar à Tela de Início"</strong></li>
          <li>Confirme em "Adicionar"</li>
        </ol>
        <p style="margin-top:12px;font-size:12px;color:var(--text-dim)">Depois, abra pelo ícone Cortify na sua tela inicial. Vai funcionar como um app de verdade.</p>
      </div>
    `;
    showModal('Como instalar no iPhone', html);
  }

  function showAndroidInstallInstructions() {
    const html = `
      <div style="text-align:left;font-size:14px;line-height:1.6">
        <p style="margin-bottom:12px"><strong>Instalar no Android:</strong></p>
        <ol style="padding-left:20px;color:var(--text-soft)">
          <li>Toque nos 3 pontinhos (⋮) no canto do navegador</li>
          <li>Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></li>
          <li>Confirme em "Instalar"</li>
        </ol>
      </div>
    `;
    showModal('Como instalar no Android', html);
  }

  function showModal(title, body) {
    // Modal genérico de instrução
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:grid;place-items:center;padding:20px`;
    overlay.innerHTML = `
      <div style="background:#131313;border:1px solid #232323;border-radius:14px;padding:24px;max-width:420px;width:100%">
        <h3 style="font-family:'Playfair Display';font-size:20px;font-weight:600;margin-bottom:14px">${title}</h3>
        ${body}
        <button style="margin-top:18px;width:100%;padding:12px;background:linear-gradient(135deg,#d4a857,#e8c47b);color:#0a0a0a;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-family:inherit;font-size:14px" onclick="this.parentElement.parentElement.remove()">Entendi</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // ===== PUSH NOTIFICATIONS =====

  // Chave VAPID pública (configurada em config.js como window.APP_CONFIG.vapidPublicKey)
  function getVapidKey() {
    return window.APP_CONFIG?.vapidPublicKey || '';
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Verifica suporte a notificações
  function isNotificationSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }

  // Estado da permissão
  function getPermissionState() {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission; // 'default', 'granted', 'denied'
  }

  // Pede permissão e cria subscription
  async function subscribePush(supabase, userId) {
    if (!isNotificationSupported()) {
      return { success: false, error: 'Notificações não suportadas neste navegador' };
    }

    const vapidKey = getVapidKey();
    if (!vapidKey) {
      return { success: false, error: 'VAPID key não configurada (admin precisa configurar)' };
    }

    try {
      // Pede permissão
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { success: false, error: 'Permissão negada' };
      }

      // Pega o registro do SW
      const reg = await navigator.serviceWorker.ready;

      // Cria subscription (ou pega existente)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
      }

      // Salva no Supabase
      const subJson = sub.toJSON();
      const { error } = await supabase
        .from('notification_subscriptions')
        .upsert({
          user_id: userId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent,
        }, { onConflict: 'endpoint' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Cancela subscription
  async function unsubscribePush(supabase, userId) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase.from('notification_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Verifica se já está inscrito
  async function isSubscribed() {
    if (!isNotificationSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  }

  // ===== TESTAR notificação local (sem servidor) =====
  function testLocalNotification() {
    if (Notification.permission !== 'granted') {
      alert('Você precisa permitir notificações primeiro.');
      return;
    }
    new Notification('Cortify · Teste', {
      body: 'Se você está vendo isso, as notificações estão funcionando! 🎉',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
    });
  }

  return {
    register,
    setupInstallPrompt,
    promptInstall,
    isIOS,
    isStandalone,
    isNotificationSupported,
    getPermissionState,
    subscribePush,
    unsubscribePush,
    isSubscribed,
    testLocalNotification,
    showAndroidInstallInstructions,
    showIOSInstallInstructions,
  };
})();
