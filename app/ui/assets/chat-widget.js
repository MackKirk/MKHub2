/**
 * MK Hub chat widget. Initialized via window.__initMKHubChat(hostElement) from React.
 * English UI only. WebSocket: /chat/ws/chat
 */
(function () {
  if (typeof window === 'undefined') return;

  window.__initMKHubChat = function initMKHubChat(hostEl) {
    const token = localStorage.getItem('user_token');
    if (!token) return;
    const existingPanel = document.getElementById('mkhub-chat-panel');
    if (existingPanel) existingPanel.remove();

    const api = async (method, path, body) => {
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
      const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) return null;
      const ct = r.headers.get('Content-Type') || '';
      if (ct.includes('application/json')) return await r.json();
      return await r.text();
    };

    const css = `
  .mkchat-fab{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:28px;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(209,22,22,.25);cursor:pointer;z-index:2147483000;transition:transform .2s}
  .mkchat-fab.mkchat-fab--dock{position:relative;right:auto;bottom:auto;width:100%;min-height:44px;height:auto;border-radius:8px;padding:10px 12px;justify-content:flex-start;gap:10px}
  .mkchat-fab.mkchat-fab--dock .mkchat-fab-label{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mkchat-fab.mkchat-fab--dock .mkchat-fab-label.is-hidden{display:none}
  .mkchat-fab:hover{transform:scale(1.02)}
  .mkchat-fab .badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:10px;padding:2px 6px;font-size:11px;font-weight:600;display:none}
  .mkchat-fab.mkchat-fab--dock .badge{top:4px;right:8px}
  .mkchat-panel{position:fixed;left:12px;bottom:12px;right:auto;width:min(720px,calc(100vw - 24px));height:min(580px,calc(100vh - 24px));max-height:calc(100vh - 24px);max-width:calc(100vw - 24px);background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.2);overflow:hidden;display:none;z-index:2147483000;font-family:Montserrat,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .mkchat-panel.open{display:flex;flex-direction:column}
  .mkchat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;min-height:56px;flex-shrink:0}
  .mkchat-header-title{font-weight:600;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:8px}
  .mkchat-header-title .avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #d11616}
  .mkchat-header-actions{display:flex;align-items:center;gap:8px}
  .mkchat-close{width:32px;height:32px;border:none;background:transparent;cursor:pointer;font-size:24px;line-height:1;color:#64748b;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background .2s}
  .mkchat-close:hover{background:#f1f5f9}
  .mkchat-body{display:flex;flex:1;min-height:0;overflow:hidden}
  .mkchat-sidebar{width:min(280px,36vw);border-right:1px solid #e5e7eb;background:#f6f7f9;display:flex;flex-direction:column;overflow:hidden;min-height:0}
  .mkchat-sidebar-header{padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}
  .mkchat-sidebar-header h3{margin:0 0 8px 0;font-size:16px;font-weight:600;color:#0f172a}
  .mkchat-sidebar-search{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box}
  .mkchat-sidebar-search:focus{border-color:#d11616}
  .mkchat-sidebar-search::placeholder{color:#9ca3af}
  .mkchat-new-chat{width:calc(100% - 24px);padding:10px 16px;margin:8px 12px;border:none;border-radius:8px;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(209,22,22,.2);transition:transform .2s;flex-shrink:0}
  .mkchat-new-chat:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(209,22,22,.3)}
  .mkchat-conv-list{flex:1;min-height:0;overflow-y:auto;padding:8px 0}
  .mkchat-conv-item{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent}
  .mkchat-conv-item:hover{background:#f1f5f9}
  .mkchat-conv-item.active{background:#fff;border-left-color:#d11616}
  .mkchat-conv-avatar{width:40px;height:40px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#334155;overflow:hidden;flex-shrink:0;border:2px solid #e5e7eb}
  .mkchat-conv-avatar img{width:100%;height:100%;object-fit:cover}
  .mkchat-conv-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .mkchat-conv-name{font-weight:600;font-size:14px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mkchat-conv-preview{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mkchat-conv-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
  .mkchat-conv-time{font-size:11px;color:#9ca3af}
  .mkchat-date-separator{text-align:center;padding:8px 0;font-size:12px;color:#64748b;font-weight:500}
  .mkchat-unread{background:#d11616;color:#fff;border-radius:12px;padding:2px 6px;font-size:11px;font-weight:600;min-width:18px;text-align:center}
  .mkchat-main{flex:1;display:flex;flex-direction:column;background:#fff;overflow:hidden;min-height:0}
  .mkchat-main.empty{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px}
  .mkchat-chat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;min-height:56px;flex-shrink:0}
  .mkchat-chat-title{font-weight:600;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:10px}
  .mkchat-chat-title .avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #d11616}
  .mkchat-chat-actions{display:flex;gap:6px}
  .mkchat-btn-icon{width:32px;height:32px;border:none;background:transparent;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#64748b;transition:background .2s}
  .mkchat-btn-icon:hover{background:#f1f5f9}
  .mkchat-messages{flex:1;min-height:0;overflow-y:auto;padding:16px;background:#f6f7f9;display:flex;flex-direction:column;gap:8px;min-width:0}
  .mkchat-message{display:flex;gap:8px;align-items:flex-start;width:100%;min-width:0;box-sizing:border-box}
  .mkchat-message.mine{flex-direction:row-reverse}
  .mkchat-message.mine .mkchat-message-body{align-items:flex-end}
  .mkchat-message-body{display:flex;flex-direction:column;flex:1 1 0;min-width:0;max-width:calc(100% - 36px)}
  .mkchat-message-avatar{width:28px;height:28px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#334155;overflow:hidden;flex-shrink:0;flex-grow:0}
  .mkchat-message-avatar img{width:100%;height:100%;object-fit:cover}
  .mkchat-message-bubble{display:block;width:fit-content;max-width:100%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;box-sizing:border-box;word-break:normal;overflow-wrap:break-word;white-space:pre-wrap}
  .mkchat-message:not(.mine) .mkchat-message-bubble{background:#fff;color:#0f172a;border:1px solid #e5e7eb}
  .mkchat-message.mine .mkchat-message-bubble{background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff}
  .mkchat-message-time{font-size:11px;color:#9ca3af;margin-top:4px;padding:0 4px}
  .mkchat-chat-title .avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #d11616;flex-shrink:0}
  .mkchat-chat-title .avatar-placeholder{width:36px;height:36px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#334155;flex-shrink:0;border:2px solid #d11616}
  .mkchat-input-area{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
  .mkchat-input-area input{flex:1;min-width:0;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;transition:border-color .2s}
  .mkchat-input-area input:focus{border-color:#d11616}
  .mkchat-input-area button{padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(209,22,22,.2);transition:transform .2s}
  .mkchat-input-area button:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(209,22,22,.3)}
  .mkchat-load-more{padding:12px;text-align:center;flex-shrink:0}
  .mkchat-load-more button{padding:8px 16px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;color:#64748b;transition:all .2s}
  .mkchat-load-more button:hover{background:#f1f5f9;border-color:#d11616;color:#d11616}
  .mkchat-msg-search-wrap{padding:8px 16px;border-bottom:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;gap:8px;flex-shrink:0}
  .mkchat-msg-search{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box}
  .mkchat-msg-search:focus{border-color:#d11616}
  .mkchat-search-results{max-height:240px;overflow-y:auto;background:#f8fafc;border-radius:8px;padding:4px}
  .mkchat-search-result-item{padding:10px 12px;border-radius:6px;cursor:pointer;transition:background .15s;border-bottom:1px solid #e5e7eb}
  .mkchat-search-result-item:last-child{border-bottom:none}
  .mkchat-search-result-item:hover{background:#e2e8f0}
  .mkchat-search-result-meta{font-size:11px;color:#64748b;margin-bottom:4px}
  .mkchat-search-result-content{font-size:13px;color:#0f172a}
  .mkchat-search-result-goto{font-size:11px;color:#d11616;margin-top:4px}
  .mkchat-user-list{flex:1;min-height:0;overflow-y:auto;padding:8px}
  .mkchat-user-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s}
  .mkchat-user-item:hover{background:#f1f5f9}
  .mkchat-user-item input[type="checkbox"]{width:18px;height:18px;cursor:pointer}
  .mkchat-group-builder{padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;flex-shrink:0}
  .mkchat-group-builder input{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;font-size:14px;box-sizing:border-box}
  .mkchat-selected-users{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .mkchat-selected-tag{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1f5f9;border:1px solid #e5e7eb;font-size:13px}
  .mkchat-selected-tag button{border:none;background:transparent;cursor:pointer;color:#64748b;font-size:16px;line-height:1;padding:0;margin-left:4px}
  .mkchat-group-builder button{padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px}
  .mkchat-ws-status{font-size:11px;color:#94a3b8;padding:0 8px}
  `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'mkchat-fab mkchat-fab--dock';
    fab.setAttribute('aria-label', 'Open messages');
    fab.innerHTML =
      '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg><span class="mkchat-fab-label">Messages</span><span class="badge" id="mkchatBadge">0</span>';

    if (hostEl) hostEl.appendChild(fab);
    else document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'mkhub-chat-panel';
    panel.className = 'mkchat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Hub messages');
    panel.innerHTML = `
    <div class="mkchat-header">
      <div class="mkchat-header-title" id="mkChatTitle">Messages</div>
      <div class="mkchat-header-actions">
        <span class="mkchat-ws-status" id="mkWsStatus" title="Connection status"></span>
        <button type="button" id="mkGroupInfo" class="mkchat-btn-icon" title="Group info" style="display:none">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>
        <button type="button" id="mkchatClose" class="mkchat-close" title="Close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="mkchat-body">
      <div class="mkchat-sidebar">
        <div class="mkchat-sidebar-header">
          <h3>Conversations</h3>
          <input type="text" id="mkSidebarSearch" class="mkchat-sidebar-search" placeholder="Search conversations…" />
        </div>
        <button type="button" class="mkchat-new-chat" id="mkNewChat">+ New chat</button>
        <div class="mkchat-conv-list" id="mkConvList"></div>
      </div>
      <div class="mkchat-main" id="mkMain">
        <div class="mkchat-main empty" id="mkEmptyState">Select a conversation or start a new chat.</div>
        <div class="mkchat-chat-header" id="mkChatHeader" style="display:none">
          <div class="mkchat-chat-title" id="mkChatTitleInner"></div>
          <div class="mkchat-chat-actions">
            <button type="button" id="mkGroupInfoChat" class="mkchat-btn-icon" title="Group info" style="display:none">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </button>
          </div>
        </div>
        <div class="mkchat-msg-search-wrap" id="mkMsgSearchWrap" style="display:none">
          <input type="text" id="mkMsgSearch" class="mkchat-msg-search" placeholder="Search in this conversation…" />
          <div class="mkchat-search-results" id="mkSearchResults"></div>
        </div>
        <div class="mkchat-messages" id="mkMsgs" style="display:none">
          <div class="mkchat-load-more"><button type="button" id="mkLoadMore" style="display:none">Load older messages</button></div>
        </div>
        <div class="mkchat-input-area" id="mkInputArea" style="display:none">
          <input id="mkInput" type="text" placeholder="Type a message…" autocomplete="off" />
          <button type="button" id="mkSend">Send</button>
        </div>
        <div class="mkchat-user-list" id="mkUserList" style="display:none"></div>
        <div class="mkchat-group-builder" id="mkGroupBuilder" style="display:none">
          <input id="mkGroupTitle" placeholder="Group name (optional)" />
          <div class="mkchat-selected-users" id="mkSelectedUsers"></div>
          <button type="button" id="mkCreateGroup">Create group</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(panel);

    function updatePanelPosition() {
      try {
        const r = fab.getBoundingClientRect();
        const pad = 8;
        const vw = window.innerWidth;
        const maxW = Math.min(720, vw - 24);
        let left = r.right + pad;
        if (left + maxW > vw - 12) left = vw - 12 - maxW;
        left = Math.max(12, left);
        panel.style.left = Math.round(left) + 'px';
        panel.style.bottom = '12px';
      } catch (_) {
        panel.style.left = '12px';
        panel.style.bottom = '12px';
      }
    }
    window.addEventListener('resize', updatePanelPosition);

    const badge = document.getElementById('mkchatBadge');
    const convListEl = panel.querySelector('#mkConvList');
    const emptyState = panel.querySelector('#mkEmptyState');
    const chatHeader = panel.querySelector('#mkChatHeader');
    const chatTitleInner = panel.querySelector('#mkChatTitleInner');
    const msgsEl = panel.querySelector('#mkMsgs');
    const inputArea = panel.querySelector('#mkInputArea');
    const userListEl = panel.querySelector('#mkUserList');
    const inputEl = panel.querySelector('#mkInput');
    const sendBtn = panel.querySelector('#mkSend');
    const closeBtn = panel.querySelector('#mkchatClose');
    const newChatBtn = panel.querySelector('#mkNewChat');
    const groupBuilder = panel.querySelector('#mkGroupBuilder');
    const selWrap = panel.querySelector('#mkSelectedUsers');
    const btnCreateGroup = panel.querySelector('#mkCreateGroup');
    const groupTitle = panel.querySelector('#mkGroupTitle');
    const groupInfoBtn = panel.querySelector('#mkGroupInfo');
    const groupInfoChatBtn = panel.querySelector('#mkGroupInfoChat');
    const msgSearchWrap = panel.querySelector('#mkMsgSearchWrap');
    const sidebarSearchEl = panel.querySelector('#mkSidebarSearch');
    const msgSearchEl = panel.querySelector('#mkMsgSearch');
    const searchResultsEl = panel.querySelector('#mkSearchResults');
    const wsStatusEl = panel.querySelector('#mkWsStatus');

    let conversations = [];
    let users = [];
    let activeConv = null;
    let earliestTs = null;
    let me = null;
    let selected = new Map();
    let currentMode = 'empty';
    let sidebarSearchQuery = '';
    let messageSearchQuery = '';
    let messageSearchTimer = 0;
    let searchResults = [];
    /** @type {WebSocket|null} */
    let ws = null;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    const MAX_BACKOFF_MS = 30000;
    let convReloadTimer = null;
    let lastConvFetchTime = 0;
    const CONV_THROTTLE_MS = 2800;
    let fallbackPollTimer = null;
    let groupActionMode = 'create';

    function setBadge(total) {
      const n = Math.max(0, Number(total) || 0);
      if (n > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = String(n);
      } else {
        badge.style.display = 'none';
      }
    }

    function updateWsStatus(text) {
      if (wsStatusEl) wsStatusEl.textContent = text;
    }

    function scrollMessagesToBottom() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          msgsEl.scrollTop = msgsEl.scrollHeight;
        });
      });
    }

    function scheduleConversationReload() {
      if (convReloadTimer) clearTimeout(convReloadTimer);
      const now = Date.now();
      const elapsed = now - lastConvFetchTime;
      const delay = elapsed >= CONV_THROTTLE_MS ? 0 : CONV_THROTTLE_MS - elapsed;
      convReloadTimer = setTimeout(async () => {
        convReloadTimer = null;
        lastConvFetchTime = Date.now();
        await loadConversations();
      }, delay);
    }

    function patchConversationList(cid, messageRow) {
      const idx = conversations.findIndex((c) => c.id === cid);
      if (idx < 0) return;
      const prev = conversations[idx];
      const lm = {
        id: messageRow.id,
        sender_id: messageRow.sender_id,
        content: messageRow.content,
        created_at: messageRow.created_at,
      };
      conversations[idx] = { ...prev, last_message: lm, updated_at: messageRow.created_at };
      renderConversations();
    }

    function stopFallbackPoll() {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    }

    function startFallbackPoll() {
      stopFallbackPoll();
      fallbackPollTimer = setInterval(async () => {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        const unread = await api('GET', '/chat/unread_count');
        if (unread && typeof unread.total === 'number') setBadge(unread.total);
      }, 90000);
    }

    function connectWebSocket() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = wsProto + '://' + location.host + '/chat/ws/chat?token=' + encodeURIComponent(token);
      try {
        ws = new WebSocket(url);
      } catch (e) {
        updateWsStatus('Offline');
        scheduleReconnect();
        startFallbackPoll();
        return;
      }

      ws.onopen = function () {
        reconnectAttempt = 0;
        updateWsStatus('Live');
        stopFallbackPoll();
      };

      ws.onmessage = async function (e) {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === 'unread_count') {
            const total = (msg.data && msg.data.total) || 0;
            setBadge(total);
            return;
          }
          if (msg.event === 'message_new') {
            const cm = msg.data && msg.data.message;
            const cid = msg.data && msg.data.conversation_id;
            if (cm && cid) patchConversationList(cid, cm);

            if (activeConv && cid === activeConv.id && cm) {
              appendMessage(cm);
              markRead(activeConv.id);
            } else {
              const unread = await api('GET', '/chat/unread_count');
              if (unread && typeof unread.total === 'number') setBadge(unread.total);
            }
            scheduleConversationReload();
            return;
          }
          if (msg.event === 'conversation_updated') {
            lastConvFetchTime = Date.now();
            await loadConversations();
            if (msg.data && msg.data.left) {
              if (activeConv && String(activeConv.id) === String(msg.data.left)) {
                activeConv = null;
                currentMode = 'empty';
                emptyState.style.display = 'flex';
                chatHeader.style.display = 'none';
                if (msgSearchWrap) msgSearchWrap.style.display = 'none';
                msgsEl.style.display = 'none';
                inputArea.style.display = 'none';
                userListEl.style.display = 'none';
                groupBuilder.style.display = 'none';
              }
              return;
            }
            if (activeConv && currentMode === 'chat') {
              const u = conversations.find((c) => c.id === activeConv.id);
              if (u) {
                activeConv = u;
                const avatarUrl =
                  (u.avatar_url && withFileAccessToken(u.avatar_url)) || (u.other_user && getAvatarUrl(u.other_user));
                const avatar = avatarUrl
                  ? `<img src="${escapeHtml(avatarUrl)}" class="avatar" alt="" />`
                  : `<div class="avatar-placeholder">${escapeHtml(fmtInitials(u.title || ''))}</div>`;
                chatTitleInner.innerHTML = `${avatar}<span>${escapeHtml(u.title || 'Conversation')}</span>`;
                groupInfoBtn.style.display = u.is_group ? 'inline-flex' : 'none';
                groupInfoChatBtn.style.display = u.is_group ? 'inline-flex' : 'none';
              }
            }
          }
        } catch (err) {
          console.error('Hub chat WS handler error:', err);
        }
      };

      ws.onerror = function () {
        updateWsStatus('Error');
      };

      ws.onclose = function () {
        ws = null;
        updateWsStatus('Reconnecting…');
        startFallbackPoll();
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_BACKOFF_MS);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connectWebSocket, delay);
    }

    const escapeHtml = (text) => {
      if (text == null || text === '') return '';
      return String(text).replace(/[<>&]/g, (s) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]));
    };

    const fmtInitials = (name) => {
      const parts = (name || '').trim().split(/\s+/).filter(Boolean);
      const letters = parts
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join('');
      return letters || '?';
    };

    const formatDateLabel = (dateStr) => {
      const d = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (dDay.getTime() === today.getTime()) return 'Today';
      if (dDay.getTime() === yesterday.getTime()) return 'Yesterday';
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const relativeTime = (dateStr) => {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return 'Now';
      if (diffMins < 60) return diffMins + ' min ago';
      if (diffHours < 24) return diffHours + ' h ago';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return diffDays + ' days ago';
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    };

    /** Same as frontend api.ts: <img> cannot send Bearer; /files/* accepts access_token query. */
    const withFileAccessToken = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (!url.startsWith('/files/')) return url;
      if (url.indexOf('access_token=') >= 0) return url;
      const tok = localStorage.getItem('user_token');
      if (!tok) return url;
      const sep = url.indexOf('?') >= 0 ? '&' : '?';
      return url + sep + 'access_token=' + encodeURIComponent(tok);
    };

    const getAvatarUrl = (user) => {
      let raw = null;
      if (user && user.avatar_url) raw = user.avatar_url;
      else if (user && user.profile_photo_file_id) raw = `/files/${user.profile_photo_file_id}/thumbnail?w=80`;
      return raw ? withFileAccessToken(raw) : null;
    };

    const getFilteredConversations = () => {
      const q = (sidebarSearchQuery || '').trim().toLowerCase();
      if (!q) return conversations;
      return conversations.filter((c) => {
        const title = (c.title || '').toLowerCase();
        const preview = (c.last_message && c.last_message.content ? String(c.last_message.content) : '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
    };

    const renderConversations = () => {
      convListEl.innerHTML = '';
      const list = getFilteredConversations();
      list.forEach((c) => {
        const el = document.createElement('div');
        el.className = 'mkchat-conv-item' + (activeConv && c.id === activeConv.id ? ' active' : '');
        const avatarUrl =
          (c.avatar_url && withFileAccessToken(c.avatar_url)) || (c.other_user && getAvatarUrl(c.other_user));
        const avatar = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" class="mkchat-conv-avatar" alt="" />`
          : `<div class="mkchat-conv-avatar">${fmtInitials(c.title || '')}</div>`;
        const raw = c.last_message && c.last_message.content != null ? String(c.last_message.content) : '';
        el.innerHTML = `
        ${avatar}
        <div class="mkchat-conv-info">
          <div class="mkchat-conv-name">${escapeHtml(c.title || 'Conversation')}</div>
          <div class="mkchat-conv-preview">${raw ? escapeHtml(raw).slice(0, 60) + (raw.length > 60 ? '\u2026' : '') : ''}</div>
        </div>
        <div class="mkchat-conv-meta">
          ${c.last_message && c.last_message.created_at ? `<span class="mkchat-conv-time">${escapeHtml(relativeTime(c.last_message.created_at))}</span>` : ''}
          ${c.unread > 0 ? `<span class="mkchat-unread">${c.unread}</span>` : ''}
        </div>
      `;
        el.addEventListener('click', () => openConversation(c));
        convListEl.appendChild(el);
      });
    };

    const renderUsers = () => {
      userListEl.innerHTML = '';
      users.forEach((u) => {
        const el = document.createElement('div');
        el.className = 'mkchat-user-item';
        const avatarUrl = getAvatarUrl(u);
        const avatar = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" class="mkchat-conv-avatar" alt="" />`
          : `<div class="mkchat-conv-avatar">${fmtInitials(u.name || u.username)}</div>`;
        const isBuilder = currentMode === 'group-builder';
        el.innerHTML = `
        ${avatar}
        <div class="mkchat-conv-info" style="flex:1">
          <div class="mkchat-conv-name">${escapeHtml(u.name || u.username)}</div>
          <div class="mkchat-conv-preview">${escapeHtml(u.username)}</div>
        </div>
        ${isBuilder ? `<input type="checkbox" data-uid="${escapeHtml(u.id)}" ${selected.has(u.id) ? 'checked' : ''} />` : ''}
      `;
        if (isBuilder) {
          const inp = el.querySelector('input');
          inp.addEventListener('change', (ev) => {
            if (ev.target.checked) selected.set(u.id, u);
            else selected.delete(u.id);
            renderSelected();
          });
        } else {
          el.addEventListener('click', async () => {
            const conv = await api('POST', '/chat/conversations', { participant_user_id: u.id });
            if (conv && conv.id) {
              lastConvFetchTime = Date.now();
              mergeConversation(conv);
              showChat(conv);
            }
          });
        }
        userListEl.appendChild(el);
      });
    };

    const appendMessage = (m) => {
      if (!activeConv || !m) return;
      if (m.id && msgsEl.querySelector('[data-msg-id="' + String(m.id) + '"]')) return;
      const mine = me && String(m.sender_id) === String(me.id);
      const msgDate = m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : '';
      const loadMoreContainer = msgsEl.querySelector('.mkchat-load-more');
      const lastMsg = loadMoreContainer ? loadMoreContainer.nextElementSibling : msgsEl.querySelector('.mkchat-message');
      let lastDate = null;
      if (lastMsg && lastMsg.classList.contains('mkchat-message')) lastDate = lastMsg.getAttribute('data-date');
      else if (lastMsg && lastMsg.classList.contains('mkchat-date-separator')) {
        const prev = lastMsg.previousElementSibling;
        if (prev && prev.classList.contains('mkchat-message')) lastDate = prev.getAttribute('data-date');
      }
      let insertAfter = null;
      if (msgDate && msgDate !== lastDate) {
        const sep = document.createElement('div');
        sep.className = 'mkchat-date-separator';
        sep.textContent = formatDateLabel(m.created_at);
        const messageNodes = msgsEl.querySelectorAll('.mkchat-message');
        const lastMessageEl = messageNodes.length ? messageNodes[messageNodes.length - 1] : null;
        if (lastMessageEl) lastMessageEl.insertAdjacentElement('afterend', sep);
        else if (loadMoreContainer) loadMoreContainer.insertAdjacentElement('afterend', sep);
        else msgsEl.appendChild(sep);
        insertAfter = sep;
      } else {
        const messages = msgsEl.querySelectorAll('.mkchat-message');
        const lastMessageEl = messages.length ? messages[messages.length - 1] : null;
        insertAfter = lastMessageEl || loadMoreContainer;
      }
      const wrap = document.createElement('div');
      wrap.className = 'mkchat-message' + (mine ? ' mine' : '');
      if (m.id) wrap.setAttribute('data-msg-id', String(m.id));
      if (msgDate) wrap.setAttribute('data-date', msgDate);
      const membersDetail = activeConv?.members_detail || conversations.find((c) => c.id === activeConv?.id)?.members_detail || [];
      const sender = membersDetail.find((mem) => String(mem.id) === String(m.sender_id));
      const senderName = sender?.name || sender?.username || 'User';
      const avatarUrl = sender && getAvatarUrl(sender);
      const avatar = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" class="mkchat-message-avatar" alt="" />`
        : `<div class="mkchat-message-avatar">${fmtInitials(senderName)}</div>`;
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      wrap.innerHTML = `
      ${!mine ? avatar : ''}
      <div class="mkchat-message-body">
        <div class="mkchat-message-bubble">${escapeHtml(m.content || '')}</div>
        <div class="mkchat-message-time" style="text-align:${mine ? 'right' : 'left'}">${time}</div>
      </div>
      ${mine ? avatar : ''}
    `;
      if (insertAfter) insertAfter.insertAdjacentElement('afterend', wrap);
      else msgsEl.appendChild(wrap);
      scrollMessagesToBottom();
    };

    function wireLoadMore(btn) {
      if (!btn) return;
      btn.onclick = () => {
        if (activeConv && earliestTs) loadMessages(activeConv.id, earliestTs);
      };
    }

    const loadMessages = async (cid, before) => {
      try {
        const url = before
          ? `/chat/conversations/${cid}/messages?before=${encodeURIComponent(before)}`
          : `/chat/conversations/${cid}/messages`;
        const rows = await api('GET', url);

        if (!rows || !Array.isArray(rows)) {
          if (!before) {
            earliestTs = null;
            msgsEl.innerHTML =
              '<div class="mkchat-load-more"><button type="button" id="mkLoadMore" style="display:none">Load older messages</button></div>';
            wireLoadMore(document.getElementById('mkLoadMore'));
          }
          return;
        }

        if (!before) {
          earliestTs = null;
          msgsEl.innerHTML =
            '<div class="mkchat-load-more"><button type="button" id="mkLoadMore" style="display:none">Load older messages</button></div>';
          wireLoadMore(document.getElementById('mkLoadMore'));
        }

        const loadMoreContainer = msgsEl.querySelector('.mkchat-load-more');
        if (!loadMoreContainer) {
          msgsEl.innerHTML =
            '<div class="mkchat-load-more"><button type="button" id="mkLoadMore" style="display:none">Load older messages</button></div>';
          return;
        }

        const conv = conversations.find((c) => c.id === cid) || activeConv;
        const membersDetail = conv?.members_detail || [];

        if (rows.length === 0 && !before) {
          const btn = document.getElementById('mkLoadMore');
          if (btn) btn.style.display = 'none';
          return;
        }

        const getDay = (m) => (m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : '');

        const buildMessageWrap = (m) => {
          const msgDate = getDay(m);
          const mine = me && String(m.sender_id) === String(me.id);
          const wrap = document.createElement('div');
          wrap.className = 'mkchat-message' + (mine ? ' mine' : '');
          if (m.id) wrap.setAttribute('data-msg-id', String(m.id));
          if (msgDate) wrap.setAttribute('data-date', msgDate);
          const sender = membersDetail.find((mem) => String(mem.id) === String(m.sender_id));
          const senderName = sender?.name || sender?.username || 'User';
          const avatarUrl = sender && getAvatarUrl(sender);
          const avatar = avatarUrl
            ? `<img src="${escapeHtml(avatarUrl)}" class="mkchat-message-avatar" alt="" />`
            : `<div class="mkchat-message-avatar">${fmtInitials(senderName)}</div>`;
          const time = new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          wrap.innerHTML = `
          ${!mine ? avatar : ''}
          <div class="mkchat-message-body">
            <div class="mkchat-message-bubble">${escapeHtml(m.content || '')}</div>
            <div class="mkchat-message-time" style="text-align:${mine ? 'right' : 'left'}">${time}</div>
          </div>
          ${mine ? avatar : ''}
        `;
          return wrap;
        };

        if (before) {
          const insertRowPrepend = (m, needSep, msgDate) => {
            if (needSep && msgDate) {
              const sep = document.createElement('div');
              sep.className = 'mkchat-date-separator';
              sep.textContent = formatDateLabel(m.created_at);
              loadMoreContainer.insertAdjacentElement('beforebegin', sep);
            }
            const wrap = buildMessageWrap(m);
            loadMoreContainer.insertAdjacentElement('beforebegin', wrap);
          };
          for (let i = rows.length - 1; i >= 0; i--) {
            const m = rows[i];
            const msgDate = getDay(m);
            const prevDate = i > 0 ? getDay(rows[i - 1]) : null;
            const needSep = msgDate && msgDate !== prevDate;
            insertRowPrepend(m, needSep, msgDate);
          }
        } else {
          let anchor = loadMoreContainer;
          let lastDate = null;
          rows.forEach((m) => {
            const msgDate = getDay(m);
            const needSep = msgDate && msgDate !== lastDate;
            if (needSep) lastDate = msgDate;
            if (needSep && msgDate) {
              const sep = document.createElement('div');
              sep.className = 'mkchat-date-separator';
              sep.textContent = formatDateLabel(m.created_at);
              anchor.insertAdjacentElement('afterend', sep);
              anchor = sep;
            }
            const wrap = buildMessageWrap(m);
            anchor.insertAdjacentElement('afterend', wrap);
            anchor = wrap;
          });
        }

        if (rows.length > 0) {
          earliestTs = rows[0].created_at;
          const btn = document.getElementById('mkLoadMore');
          if (btn) {
            btn.style.display = 'inline-block';
            wireLoadMore(btn);
          }
        } else {
          const btn = document.getElementById('mkLoadMore');
          if (btn) btn.style.display = 'none';
        }

        if (!before) scrollMessagesToBottom();
      } catch (err) {
        console.error('Error loading messages:', err);
        if (!before) {
          msgsEl.innerHTML =
            '<div class="mkchat-load-more"><div style="padding:20px;text-align:center;color:#64748b">Could not load messages.</div><button type="button" id="mkLoadMore" style="display:none">Load older messages</button></div>';
        }
      }
    };

    const markRead = async (cid) => {
      try {
        await api('POST', `/chat/conversations/${cid}/read`);
      } catch (e) {}
    };

    const showChat = (conv) => {
      currentMode = 'chat';
      activeConv = conv;
      emptyState.style.display = 'none';
      chatHeader.style.display = 'flex';
      msgSearchWrap.style.display = 'block';
      msgsEl.style.display = 'flex';
      inputArea.style.display = 'flex';
      userListEl.style.display = 'none';
      groupBuilder.style.display = 'none';
      groupActionMode = 'create';
      btnCreateGroup.textContent = 'Create group';
      if (msgSearchEl) msgSearchEl.placeholder = 'Search in this conversation…';
      messageSearchQuery = '';
      searchResults = [];
      if (msgSearchEl) msgSearchEl.value = '';
      renderSearchResults();
      const avatarUrl =
        (conv.avatar_url && withFileAccessToken(conv.avatar_url)) ||
        (conv.other_user && getAvatarUrl(conv.other_user));
      const avatar = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" class="avatar" alt="" />`
        : `<div class="avatar-placeholder">${escapeHtml(fmtInitials(conv.title || ''))}</div>`;
      chatTitleInner.innerHTML = `${avatar}<span>${escapeHtml(conv.title || 'Conversation')}</span>`;
      groupInfoBtn.style.display = conv.is_group ? 'inline-flex' : 'none';
      groupInfoChatBtn.style.display = conv.is_group ? 'inline-flex' : 'none';
      loadMessages(conv.id);
      markRead(conv.id);
      renderConversations();
    };

    const showUsers = () => {
      currentMode = 'users';
      activeConv = null;
      emptyState.style.display = 'none';
      chatHeader.style.display = 'none';
      msgsEl.style.display = 'none';
      inputArea.style.display = 'none';
      userListEl.style.display = 'block';
      groupBuilder.style.display = 'none';
      renderUsers();
    };

    const showGroupBuilder = (opts) => {
      const keepConv = opts && opts.keepConversation;
      currentMode = 'group-builder';
      if (!keepConv) activeConv = null;
      emptyState.style.display = 'none';
      chatHeader.style.display = 'none';
      msgSearchWrap.style.display = 'none';
      msgsEl.style.display = 'none';
      inputArea.style.display = 'none';
      userListEl.style.display = 'block';
      groupBuilder.style.display = 'block';
      selected.clear();
      renderSelected();
      renderUsers();
    };

    const renderSearchResults = () => {
      if (!searchResultsEl || !msgsEl || !inputArea) return;
      if (searchResults.length === 0) {
        searchResultsEl.innerHTML =
          messageSearchQuery.length >= 2
            ? '<div class="mkchat-search-result-item" style="cursor:default;color:#64748b">No results.</div>'
            : '';
        msgsEl.style.display = 'flex';
        inputArea.style.display = 'flex';
        return;
      }
      msgsEl.style.display = 'none';
      inputArea.style.display = 'none';
      searchResultsEl.innerHTML = searchResults
        .map((r) => {
          const dateStr = r.created_at
            ? new Date(r.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
            : '';
          const contentSnippet =
            escapeHtml(r.content || '').slice(0, 120) + (r.content && r.content.length > 120 ? '\u2026' : '');
          return `<div class="mkchat-search-result-item" data-conv-id="${escapeHtml(r.conversation_id)}">
        <div class="mkchat-search-result-meta">${escapeHtml(r.conversation_title)} \u2022 ${escapeHtml(r.sender_name)} \u2022 ${escapeHtml(dateStr)}</div>
        <div class="mkchat-search-result-content">${contentSnippet}</div>
        <div class="mkchat-search-result-goto">Open conversation</div>
      </div>`;
        })
        .join('');
      searchResultsEl.querySelectorAll('.mkchat-search-result-item[data-conv-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const cid = el.getAttribute('data-conv-id');
          const conv = conversations.find((c) => c.id === cid);
          if (conv) {
            messageSearchQuery = '';
            searchResults = [];
            if (msgSearchEl) msgSearchEl.value = '';
            renderSearchResults();
            openConversation(conv);
          }
        });
      });
    };

    const openConversation = async (conv) => {
      const inList = conversations.some((c) => c.id === conv.id);
      if (conversations.length === 0 || !inList) {
        lastConvFetchTime = Date.now();
        await loadConversations();
      }
      const found = conversations.find((c) => c.id === conv.id) || conv;
      showChat(found);
    };

    const loadConversations = async () => {
      const rows = await api('GET', '/chat/conversations');
      if (!rows) return;
      conversations = rows.map((c) => ({ ...c }));
      renderConversations();
    };

    const mergeConversation = (conv) => {
      if (!conv || !conv.id) return;
      conversations = [conv, ...conversations.filter((c) => c.id !== conv.id)];
      renderConversations();
    };

    const loadUsers = async (q) => {
      const rows = await api('GET', '/chat/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      if (!rows) return;
      users = rows;
      if (currentMode === 'users' || currentMode === 'group-builder') renderUsers();
    };

    const renderSelected = () => {
      selWrap.innerHTML = '';
      selected.forEach((u) => {
        const tag = document.createElement('div');
        tag.className = 'mkchat-selected-tag';
        tag.innerHTML = `<span>${escapeHtml(u.name || u.username)}</span><button type="button" aria-label="Remove">×</button>`;
        tag.querySelector('button').addEventListener('click', () => {
          selected.delete(u.id);
          renderSelected();
          renderUsers();
        });
        selWrap.appendChild(tag);
      });
    };

    function setFabLabelCollapsed(collapsed) {
      const lbl = fab.querySelector('.mkchat-fab-label');
      if (lbl) lbl.classList.toggle('is-hidden', !!collapsed);
    }

    function onSidebarCollapsed(ev) {
      try {
        const d = ev && ev.detail;
        if (d && typeof d.collapsed === 'boolean') setFabLabelCollapsed(d.collapsed);
      } catch (_) {}
    }
    window.addEventListener('mkhub-sidebar-collapsed', onSidebarCollapsed);

    fab.addEventListener('click', () => {
      const isOpen = panel.classList.contains('open');
      if (isOpen) {
        panel.classList.remove('open');
        currentMode = 'empty';
        activeConv = null;
        emptyState.style.display = 'flex';
        chatHeader.style.display = 'none';
        if (msgSearchWrap) msgSearchWrap.style.display = 'none';
        msgsEl.style.display = 'none';
        inputArea.style.display = 'none';
        userListEl.style.display = 'none';
        groupBuilder.style.display = 'none';
      } else {
        updatePanelPosition();
        panel.classList.add('open');
        if (!activeConv && currentMode === 'empty') {
          emptyState.style.display = 'flex';
        }
        lastConvFetchTime = Date.now();
        loadConversations();
      }
    });
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      currentMode = 'empty';
      activeConv = null;
      emptyState.style.display = 'flex';
      chatHeader.style.display = 'none';
      if (msgSearchWrap) msgSearchWrap.style.display = 'none';
      msgsEl.style.display = 'none';
      inputArea.style.display = 'none';
      userListEl.style.display = 'none';
      groupBuilder.style.display = 'none';
    });
    newChatBtn.addEventListener('click', () => {
      showUsers();
      loadUsers('');
    });
    sendBtn.addEventListener('click', async () => {
      const text = (inputEl.value || '').trim();
      if (!text || !activeConv) return;
      inputEl.value = '';
      const resp = await api('POST', `/chat/conversations/${activeConv.id}/messages`, { content: text });
      if (resp && resp.message) {
        appendMessage(resp.message);
        scrollMessagesToBottom();
        patchConversationList(activeConv.id, resp.message);
        scheduleConversationReload();
      }
    });
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendBtn.click();
      }
    });

    btnCreateGroup.addEventListener('click', async () => {
      const ids = Array.from(selected.keys());
      if (!ids.length) return;
      if (groupActionMode === 'add-to-active') {
        if (!activeConv) return;
        const updated = await api('POST', `/chat/conversations/${activeConv.id}/members`, { add_user_ids: ids });
        groupActionMode = 'create';
        btnCreateGroup.textContent = 'Create group';
        lastConvFetchTime = Date.now();
        if (updated && updated.id) {
          mergeConversation(updated);
          showChat(updated);
        }
        return;
      }
      const title = (groupTitle.value || '').trim() || null;
      const conv = await api('POST', '/chat/conversations', { is_group: true, title, member_user_ids: ids });
      if (conv && conv.id) {
        lastConvFetchTime = Date.now();
        mergeConversation(conv);
        showChat(conv);
      }
    });

    const showGroupInfo = async () => {
      if (!activeConv || !activeConv.is_group) return;
      const action = prompt('Type "title" to rename, "add" to add members, or "leave" to leave the group.');
      if (!action) return;
      const a = action.toLowerCase();
      if (a === 'title') {
        const t = prompt('New group title:', activeConv.title || '');
        if (t != null) {
          const updated = await api('PATCH', `/chat/conversations/${activeConv.id}`, { title: t });
          if (updated && updated.id) {
            lastConvFetchTime = Date.now();
            mergeConversation(updated);
            showChat(updated);
          }
        }
      } else if (a === 'add') {
        groupActionMode = 'add-to-active';
        btnCreateGroup.textContent = 'Add to group';
        showGroupBuilder({ keepConversation: true });
        loadUsers('');
      } else if (a === 'leave') {
        if (confirm('Leave this group? You will stop receiving messages here.')) {
          const leftId = activeConv.id;
          await api('POST', `/chat/conversations/${activeConv.id}/leave`);
          activeConv = null;
          currentMode = 'empty';
          emptyState.style.display = 'flex';
          chatHeader.style.display = 'none';
          msgsEl.style.display = 'none';
          inputArea.style.display = 'none';
          groupActionMode = 'create';
          btnCreateGroup.textContent = 'Create group';
          lastConvFetchTime = Date.now();
          conversations = conversations.filter((c) => c.id !== leftId);
          renderConversations();
        }
      }
    };
    groupInfoBtn.addEventListener('click', showGroupInfo);
    groupInfoChatBtn.addEventListener('click', showGroupInfo);

    if (sidebarSearchEl) {
      sidebarSearchEl.addEventListener('input', () => {
        sidebarSearchQuery = sidebarSearchEl.value || '';
        renderConversations();
      });
    }

    if (msgSearchEl) {
      msgSearchEl.addEventListener('input', () => {
        messageSearchQuery = (msgSearchEl.value || '').trim();
        clearTimeout(messageSearchTimer);
        if (messageSearchQuery.length < 2) {
          searchResults = [];
          renderSearchResults();
          return;
        }
        messageSearchTimer = setTimeout(async () => {
          const url =
            '/chat/search?q=' +
            encodeURIComponent(messageSearchQuery) +
            (activeConv ? '&conversation_id=' + encodeURIComponent(activeConv.id) : '') +
            '&limit=30';
          const data = await api('GET', url);
          searchResults = Array.isArray(data) ? data : [];
          renderSearchResults();
        }, 300);
      });
    }

    (async function bootstrap() {
      try {
        const meResp = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token } });
        if (meResp.ok) me = await meResp.json();
        lastConvFetchTime = Date.now();
        await loadConversations();
        const unread = await api('GET', '/chat/unread_count');
        if (unread && typeof unread.total === 'number') setBadge(unread.total);
        connectWebSocket();
      } catch (e) {
        /* ignore */
      }
    })();
  };
})();
