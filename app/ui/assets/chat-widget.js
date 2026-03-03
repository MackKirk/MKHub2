(function () {
  const token = localStorage.getItem('user_token');
  if (!token) return;

  const api = async (method, path, body) => {
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
    const r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { return null; }
    const ct = r.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) return await r.json();
    return await r.text();
  };

  const css = `
  .mkchat-fab{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:28px;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(209,22,22,.25);cursor:pointer;z-index:2147483000;transition:transform .2s}
  .mkchat-fab:hover{transform:scale(1.05)}
  .mkchat-fab .badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:10px;padding:2px 6px;font-size:11px;font-weight:600;display:none}
  .mkchat-panel{position:fixed;right:18px;bottom:86px;width:720px;height:580px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.2);overflow:hidden;display:none;z-index:2147483000;font-family:Montserrat,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .mkchat-panel.open{display:flex;flex-direction:column}
  .mkchat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;min-height:56px}
  .mkchat-header-title{font-weight:600;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:8px}
  .mkchat-header-title .avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #d11616}
  .mkchat-header-actions{display:flex;align-items:center;gap:8px}
  .mkchat-close{width:32px;height:32px;border:none;background:transparent;cursor:pointer;font-size:24px;line-height:1;color:#64748b;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background .2s}
  .mkchat-close:hover{background:#f1f5f9}
  .mkchat-body{display:flex;flex:1;overflow:hidden}
  .mkchat-sidebar{width:280px;border-right:1px solid #e5e7eb;background:#f6f7f9;display:flex;flex-direction:column;overflow:hidden}
  .mkchat-sidebar-header{padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff}
  .mkchat-sidebar-header h3{margin:0 0 8px 0;font-size:16px;font-weight:600;color:#0f172a}
  .mkchat-sidebar-search{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box}
  .mkchat-sidebar-search:focus{border-color:#d11616}
  .mkchat-sidebar-search::placeholder{color:#9ca3af}
  .mkchat-new-chat{width:100%;padding:10px 16px;margin:8px 12px;border:none;border-radius:8px;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(209,22,22,.2);transition:transform .2s}
  .mkchat-new-chat:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(209,22,22,.3)}
  .mkchat-conv-list{flex:1;overflow-y:auto;padding:8px 0}
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
  .mkchat-main{flex:1;display:flex;flex-direction:column;background:#fff;overflow:hidden}
  .mkchat-main.empty{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px}
  .mkchat-chat-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#fff;min-height:56px}
  .mkchat-chat-title{font-weight:600;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:10px}
  .mkchat-chat-title .avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #d11616}
  .mkchat-chat-actions{display:flex;gap:6px}
  .mkchat-btn-icon{width:32px;height:32px;border:none;background:transparent;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#64748b;transition:background .2s}
  .mkchat-btn-icon:hover{background:#f1f5f9}
  .mkchat-messages{flex:1;overflow-y:auto;padding:16px;background:#f6f7f9;display:flex;flex-direction:column;gap:8px}
  .mkchat-message{display:flex;gap:8px;align-items:flex-start}
  .mkchat-message.mine{flex-direction:row-reverse}
  .mkchat-message.mine .mkchat-message-body{align-self:flex-end}
  .mkchat-message-body{min-width:0;max-width:100%;display:flex;flex-direction:column}
  .mkchat-message-avatar{width:28px;height:28px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#334155;overflow:hidden;flex-shrink:0}
  .mkchat-message-avatar img{width:100%;height:100%;object-fit:cover}
  .mkchat-message-bubble{max-width:70%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word}
  .mkchat-message:not(.mine) .mkchat-message-bubble{background:#fff;color:#0f172a;border:1px solid #e5e7eb}
  .mkchat-message.mine .mkchat-message-bubble{background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff}
  .mkchat-message-time{font-size:11px;color:#9ca3af;margin-top:4px;padding:0 4px}
  .mkchat-chat-title .avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #d11616;flex-shrink:0}
  .mkchat-chat-title .avatar-placeholder{width:36px;height:36px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#334155;flex-shrink:0;border:2px solid #d11616}
  .mkchat-input-area{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff}
  .mkchat-input-area input{flex:1;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;transition:border-color .2s}
  .mkchat-input-area input:focus{border-color:#d11616}
  .mkchat-input-area button{padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(209,22,22,.2);transition:transform .2s}
  .mkchat-input-area button:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(209,22,22,.3)}
  .mkchat-load-more{padding:12px;text-align:center}
  .mkchat-load-more button{padding:8px 16px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;color:#64748b;transition:all .2s}
  .mkchat-load-more button:hover{background:#f1f5f9;border-color:#d11616;color:#d11616}
  .mkchat-msg-search-wrap{padding:8px 16px;border-bottom:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column;gap:8px}
  .mkchat-msg-search{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box}
  .mkchat-msg-search:focus{border-color:#d11616}
  .mkchat-search-results{max-height:240px;overflow-y:auto;background:#f8fafc;border-radius:8px;padding:4px}
  .mkchat-search-result-item{padding:10px 12px;border-radius:6px;cursor:pointer;transition:background .15s;border-bottom:1px solid #e5e7eb}
  .mkchat-search-result-item:last-child{border-bottom:none}
  .mkchat-search-result-item:hover{background:#e2e8f0}
  .mkchat-search-result-meta{font-size:11px;color:#64748b;margin-bottom:4px}
  .mkchat-search-result-content{font-size:13px;color:#0f172a}
  .mkchat-search-result-goto{font-size:11px;color:#d11616;margin-top:4px}
  .mkchat-user-list{flex:1;overflow-y:auto;padding:8px}
  .mkchat-user-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s}
  .mkchat-user-item:hover{background:#f1f5f9}
  .mkchat-user-item input[type="checkbox"]{width:18px;height:18px;cursor:pointer}
  .mkchat-group-builder{padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff}
  .mkchat-group-builder input{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;font-size:14px}
  .mkchat-selected-users{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .mkchat-selected-tag{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1f5f9;border:1px solid #e5e7eb;font-size:13px}
  .mkchat-selected-tag button{border:none;background:transparent;cursor:pointer;color:#64748b;font-size:16px;line-height:1;padding:0;margin-left:4px}
  .mkchat-group-builder button{padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(90deg,#d11616,#ee2b2b);color:#fff;font-weight:600;cursor:pointer;font-size:14px}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.className = 'mkchat-fab';
  fab.innerHTML = '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg><span class="badge" id="mkchatBadge">0</span>';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'mkchat-panel';
  panel.innerHTML = `
    <div class="mkchat-header">
      <div class="mkchat-header-title" id="mkChatTitle">Messages</div>
      <div class="mkchat-header-actions">
        <button id="mkGroupInfo" class="mkchat-btn-icon" title="Group info" style="display:none">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>
        <button id="mkchatClose" class="mkchat-close" title="Close">×</button>
      </div>
    </div>
    <div class="mkchat-body">
      <div class="mkchat-sidebar">
        <div class="mkchat-sidebar-header">
          <h3>Conversations</h3>
          <input type="text" id="mkSidebarSearch" class="mkchat-sidebar-search" placeholder="Buscar conversas..." />
        </div>
        <button class="mkchat-new-chat" id="mkNewChat">+ New Chat</button>
        <div class="mkchat-conv-list" id="mkConvList"></div>
      </div>
      <div class="mkchat-main" id="mkMain">
        <div class="mkchat-main empty" id="mkEmptyState">Select a conversation or start a new chat</div>
        <div class="mkchat-chat-header" id="mkChatHeader" style="display:none">
          <div class="mkchat-chat-title" id="mkChatTitleInner"></div>
          <div class="mkchat-chat-actions">
            <button id="mkGroupInfoChat" class="mkchat-btn-icon" title="Group info" style="display:none">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </button>
          </div>
        </div>
        <div class="mkchat-msg-search-wrap" id="mkMsgSearchWrap" style="display:none">
          <input type="text" id="mkMsgSearch" class="mkchat-msg-search" placeholder="Buscar nesta conversa..." />
          <div class="mkchat-search-results" id="mkSearchResults"></div>
        </div>
        <div class="mkchat-messages" id="mkMsgs" style="display:none">
          <div class="mkchat-load-more"><button id="mkLoadMore" style="display:none">Load older messages</button></div>
        </div>
        <div class="mkchat-input-area" id="mkInputArea" style="display:none">
          <input id="mkInput" placeholder="Type a message..." />
          <button id="mkSend">Send</button>
        </div>
        <div class="mkchat-user-list" id="mkUserList" style="display:none"></div>
        <div class="mkchat-group-builder" id="mkGroupBuilder" style="display:none">
          <input id="mkGroupTitle" placeholder="Group name (optional)" />
          <div class="mkchat-selected-users" id="mkSelectedUsers"></div>
          <button id="mkCreateGroup">Create Group</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const badge = document.getElementById('mkchatBadge');
  const convListEl = panel.querySelector('#mkConvList');
  const mainEl = panel.querySelector('#mkMain');
  const emptyState = panel.querySelector('#mkEmptyState');
  const chatHeader = panel.querySelector('#mkChatHeader');
  const chatTitleInner = panel.querySelector('#mkChatTitleInner');
  const msgsEl = panel.querySelector('#mkMsgs');
  const inputArea = panel.querySelector('#mkInputArea');
  const userListEl = panel.querySelector('#mkUserList');
  const loadBtn = panel.querySelector('#mkLoadMore');
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
  const chatTitleEl = panel.querySelector('#mkChatTitle');
  const sidebarSearchEl = panel.querySelector('#mkSidebarSearch');
  const msgSearchWrap = panel.querySelector('#mkMsgSearchWrap');
  const msgSearchEl = panel.querySelector('#mkMsgSearch');
  const searchResultsEl = panel.querySelector('#mkSearchResults');

  let conversations = [];
  let users = [];
  let activeConv = null;
  let earliestTs = null;
  let me = null;
  let selected = new Map();
  let currentMode = 'empty'; // 'empty', 'chat', 'users', 'group-builder'
  let sidebarSearchQuery = '';
  let messageSearchQuery = '';
  let messageSearchTimer = 0;
  let searchResults = [];

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(wsProto + '://' + location.host + '/ws/chat?token=' + encodeURIComponent(token));
  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'unread_count') {
        const total = (msg.data && msg.data.total) || 0;
        if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = String(total); }
        else { badge.style.display = 'none'; }
      } else if (msg.event === 'message_new') {
        const cm = msg.data && msg.data.message;
        const cid = msg.data && msg.data.conversation_id;
        
        // Always update unread count
        const unread = await api('GET', '/chat/unread_count');
        const total = unread && unread.total || 0;
        if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = String(total); }
        else { badge.style.display = 'none'; }
        
        // If this message is for the active conversation, append it
        if (activeConv && cid === activeConv.id) {
          appendMessage(cm);
          markRead(activeConv.id);
          // Update unread count again after marking as read
          const unreadAfter = await api('GET', '/chat/unread_count');
          const totalAfter = unreadAfter && unreadAfter.total || 0;
          if (totalAfter > 0) { badge.style.display = 'inline-block'; badge.textContent = String(totalAfter); }
          else { badge.style.display = 'none'; }
        }
        
        // Always reload conversations to update previews
        await loadConversations();
      } else if (msg.event === 'conversation_updated') {
        await loadConversations();
        if (activeConv) {
          const updated = conversations.find(c => c.id === activeConv.id);
          if (updated) { activeConv = updated; showChat(updated); }
        }
      }
    } catch (err) {
      console.error('WebSocket error:', err);
    }
  };

  const escapeHtml = (text) => {
    if (text == null || text === '') return '';
    return String(text).replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]));
  };

  const fmtInitials = (name) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
    return letters || '?';
  };

  const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dDay.getTime() === today.getTime()) return 'Hoje';
    if (dDay.getTime() === yesterday.getTime()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const relativeTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return diffMins + ' min';
    if (diffHours < 24) return diffHours + ' h';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return diffDays + ' dias';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getAvatarUrl = (user) => {
    if (user && user.avatar_url) return user.avatar_url;
    if (user && user.profile_photo_file_id) return `/files/${user.profile_photo_file_id}/thumbnail?w=80`;
    return null;
  };

  const getFilteredConversations = () => {
    const q = (sidebarSearchQuery || '').trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c => {
      const title = (c.title || '').toLowerCase();
      const preview = (c.last_message && c.last_message.content ? String(c.last_message.content) : '').toLowerCase();
      return title.includes(q) || preview.includes(q);
    });
  };

  const renderConversations = () => {
    convListEl.innerHTML = '';
    const list = getFilteredConversations();
    list.forEach(c => {
      const el = document.createElement('div');
      el.className = 'mkchat-conv-item' + (activeConv && c.id === activeConv.id ? ' active' : '');
      const avatarUrl = c.avatar_url || (c.other_user && getAvatarUrl(c.other_user));
      const avatar = avatarUrl 
        ? `<img src="${avatarUrl}" class="mkchat-conv-avatar" />`
        : `<div class="mkchat-conv-avatar">${fmtInitials(c.title || '')}</div>`;
      el.innerHTML = `
        ${avatar}
        <div class="mkchat-conv-info">
          <div class="mkchat-conv-name">${escapeHtml(c.title || 'Conversation')}</div>
          <div class="mkchat-conv-preview">${c.last_message ? escapeHtml(c.last_message.content).slice(0, 60) + (c.last_message.content.length > 60 ? '\u2026' : '') : ''}</div>
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
    users.forEach(u => {
      const el = document.createElement('div');
      el.className = 'mkchat-user-item';
      const avatarUrl = getAvatarUrl(u);
      const avatar = avatarUrl
        ? `<img src="${avatarUrl}" class="mkchat-conv-avatar" />`
        : `<div class="mkchat-conv-avatar">${fmtInitials(u.name || u.username)}</div>`;
      const isBuilder = currentMode === 'group-builder';
      el.innerHTML = `
        ${avatar}
        <div class="mkchat-conv-info" style="flex:1">
          <div class="mkchat-conv-name">${u.name || u.username}</div>
          <div class="mkchat-conv-preview">${u.username}</div>
        </div>
        ${isBuilder ? `<input type="checkbox" data-uid="${u.id}" ${selected.has(u.id) ? 'checked' : ''} />` : ''}
      `;
      if (isBuilder) {
        el.querySelector('input').addEventListener('change', (ev) => {
          if (ev.target.checked) selected.set(u.id, u);
          else selected.delete(u.id);
          renderSelected();
        });
      } else {
        el.addEventListener('click', async () => {
          const conv = await api('POST', '/chat/conversations', { participant_user_id: u.id });
          if (conv && conv.id) {
            await loadConversations();
            const found = conversations.find(c => c.id === conv.id) || conv;
            openConversation(found);
          }
        });
      }
      userListEl.appendChild(el);
    });
  };

  const appendMessage = (m) => {
    if (!activeConv) return;
    const mine = (me && m.sender_id === me.id);
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
      if (loadMoreContainer) loadMoreContainer.insertAdjacentElement('afterend', sep);
      else msgsEl.appendChild(sep);
      insertAfter = sep;
    } else {
      const messages = msgsEl.querySelectorAll('.mkchat-message');
      const lastMessageEl = messages.length ? messages[messages.length - 1] : null;
      insertAfter = lastMessageEl || loadMoreContainer;
    }
    const wrap = document.createElement('div');
    wrap.className = 'mkchat-message' + (mine ? ' mine' : '');
    if (msgDate) wrap.setAttribute('data-date', msgDate);
    const membersDetail = activeConv?.members_detail || conversations.find(c => c.id === activeConv?.id)?.members_detail || [];
    const sender = membersDetail.find(mem => mem.id === String(m.sender_id));
    const senderName = sender?.name || sender?.username || 'User';
    const avatarUrl = sender && getAvatarUrl(sender);
    const avatar = avatarUrl
      ? `<img src="${avatarUrl}" class="mkchat-message-avatar" />`
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
    setTimeout(() => { msgsEl.scrollTop = msgsEl.scrollHeight; }, 10);
  };

  const loadMessages = async (cid, before) => {
    try {
      const url = before ? `/chat/conversations/${cid}/messages?before=${encodeURIComponent(before)}` : `/chat/conversations/${cid}/messages`;
      const rows = await api('GET', url);
      
      if (!rows || !Array.isArray(rows)) {
        if (!before) {
          // Clear and show empty state
          earliestTs = null;
          msgsEl.innerHTML = '<div class="mkchat-load-more"><button id="mkLoadMore" style="display:none">Load older messages</button></div>';
          const btn = document.getElementById('mkLoadMore');
          if (btn) {
            btn.addEventListener('click', () => { 
              if (activeConv && earliestTs) {
                loadMessages(activeConv.id, earliestTs);
              }
            });
          }
        }
        return;
      }
      
      if (!before) {
        // Reset state for new conversation
        earliestTs = null;
        msgsEl.innerHTML = '<div class="mkchat-load-more"><button id="mkLoadMore" style="display:none">Load older messages</button></div>';
        const btn = document.getElementById('mkLoadMore');
        if (btn) {
          btn.addEventListener('click', () => { 
            if (activeConv && earliestTs) {
              loadMessages(activeConv.id, earliestTs);
            }
          });
        }
      }
      
      const loadMoreContainer = msgsEl.querySelector('.mkchat-load-more');
      if (!loadMoreContainer) {
        // If container doesn't exist, recreate it
        msgsEl.innerHTML = '<div class="mkchat-load-more"><button id="mkLoadMore" style="display:none">Load older messages</button></div>';
        return;
      }
      
      // Use the conversation from the list or activeConv
      const conv = conversations.find(c => c.id === cid) || activeConv;
      const membersDetail = conv?.members_detail || [];
      
      if (rows.length === 0 && !before) {
        // No messages - show empty state but keep container
        const btn = document.getElementById('mkLoadMore');
        if (btn) btn.style.display = 'none';
        return;
      }
      
      const getDay = (m) => m.created_at ? new Date(m.created_at).toISOString().slice(0, 10) : '';
      const insertRow = (m, needSep, msgDate) => {
        if (needSep && msgDate) {
          const sep = document.createElement('div');
          sep.className = 'mkchat-date-separator';
          sep.textContent = formatDateLabel(m.created_at);
          if (before) loadMoreContainer.insertAdjacentElement('beforebegin', sep);
          else loadMoreContainer.insertAdjacentElement('afterend', sep);
        }
        const mine = (me && m.sender_id === me.id);
        const wrap = document.createElement('div');
        wrap.className = 'mkchat-message' + (mine ? ' mine' : '');
        if (msgDate) wrap.setAttribute('data-date', msgDate);
        const sender = membersDetail.find(mem => mem.id === String(m.sender_id));
        const senderName = sender?.name || sender?.username || 'User';
        const avatarUrl = sender && getAvatarUrl(sender);
        const avatar = avatarUrl
          ? `<img src="${avatarUrl}" class="mkchat-message-avatar" />`
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
        if (before) loadMoreContainer.insertAdjacentElement('beforebegin', wrap);
        else loadMoreContainer.insertAdjacentElement('afterend', wrap);
      };
      if (before) {
        for (let i = rows.length - 1; i >= 0; i--) {
          const m = rows[i];
          const msgDate = getDay(m);
          const prevDate = i > 0 ? getDay(rows[i - 1]) : null;
          const needSep = msgDate && (msgDate !== prevDate);
          insertRow(m, needSep, msgDate);
        }
      } else {
        let lastDate = null;
        rows.forEach(m => {
          const msgDate = getDay(m);
          const needSep = msgDate && msgDate !== lastDate;
          if (needSep) lastDate = msgDate;
          insertRow(m, needSep, msgDate);
        });
      }
      
      if (rows.length > 0) {
        // Update earliestTs to the oldest message in the batch
        // When loading initial messages, rows[0] is the oldest
        // When loading older messages, rows[0] is also the oldest (and older than current earliestTs)
        earliestTs = rows[0].created_at;
        const btn = document.getElementById('mkLoadMore');
        if (btn) btn.style.display = 'inline-block';
      } else {
        // No more messages to load
        const btn = document.getElementById('mkLoadMore');
        if (btn) btn.style.display = 'none';
      }
      
      if (!before) {
        // Scroll to bottom after loading initial messages
        setTimeout(() => {
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }, 50);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      if (!before) {
        msgsEl.innerHTML = '<div class="mkchat-load-more"><div style="padding:20px;text-align:center;color:#64748b">Error loading messages</div><button id="mkLoadMore" style="display:none">Load older messages</button></div>';
      }
    }
  };

  const markRead = async (cid) => { try { await api('POST', `/chat/conversations/${cid}/read`); } catch (e) {} };

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
    if (msgSearchEl) msgSearchEl.placeholder = activeConv ? 'Buscar nesta conversa...' : 'Buscar...';
    messageSearchQuery = '';
    searchResults = [];
    if (msgSearchEl) msgSearchEl.value = '';
    renderSearchResults();
    const avatarUrl = conv.avatar_url || (conv.other_user && getAvatarUrl(conv.other_user));
    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" class="avatar" alt="" />`
      : `<div class="avatar-placeholder">${escapeHtml(fmtInitials(conv.title || ''))}</div>`;
    chatTitleInner.innerHTML = `${avatar}<span>${escapeHtml(conv.title || 'Conversation')}</span>`;
    groupInfoBtn.style.display = conv.is_group ? 'inline-flex' : 'none';
    groupInfoChatBtn.style.display = conv.is_group ? 'inline-flex' : 'none';
    // Ensure activeConv is set before loading messages
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

  const showGroupBuilder = () => {
    currentMode = 'group-builder';
    activeConv = null;
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
      searchResultsEl.innerHTML = messageSearchQuery.length >= 2 ? '<div class="mkchat-search-result-item" style="cursor:default;color:#64748b">Nenhum resultado.</div>' : '';
      msgsEl.style.display = 'flex';
      inputArea.style.display = 'flex';
      return;
    }
    msgsEl.style.display = 'none';
    inputArea.style.display = 'none';
    searchResultsEl.innerHTML = searchResults.map(r => {
      const dateStr = r.created_at ? new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      const contentSnippet = escapeHtml(r.content || '').slice(0, 120) + (r.content && r.content.length > 120 ? '\u2026' : '');
      return `<div class="mkchat-search-result-item" data-conv-id="${escapeHtml(r.conversation_id)}">
        <div class="mkchat-search-result-meta">${escapeHtml(r.conversation_title)} \u2022 ${escapeHtml(r.sender_name)} \u2022 ${escapeHtml(dateStr)}</div>
        <div class="mkchat-search-result-content">${contentSnippet}</div>
        <div class="mkchat-search-result-goto">Ir para conversa</div>
      </div>`;
    }).join('');
    searchResultsEl.querySelectorAll('.mkchat-search-result-item[data-conv-id]').forEach(el => {
      el.addEventListener('click', () => {
        const cid = el.getAttribute('data-conv-id');
        const conv = conversations.find(c => c.id === cid);
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
    await loadConversations();
    const found = conversations.find(c => c.id === conv.id) || conv;
    showChat(found);
  };

  const loadConversations = async () => {
    const rows = await api('GET', '/chat/conversations');
    if (!rows) return;
    conversations = rows.map(c => ({ ...c }));
    renderConversations();
  };

  let searchTimer = 0;
  const loadUsers = async (q) => {
    const rows = await api('GET', '/chat/users' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
    if (!rows) return;
    users = rows;
    if (currentMode === 'users' || currentMode === 'group-builder') renderUsers();
  };

  const renderSelected = () => {
    selWrap.innerHTML = '';
    selected.forEach(u => {
      const tag = document.createElement('div');
      tag.className = 'mkchat-selected-tag';
      tag.innerHTML = `<span>${u.name || u.username}</span><button>×</button>`;
      tag.querySelector('button').addEventListener('click', () => {
        selected.delete(u.id);
        renderSelected();
        renderUsers();
      });
      selWrap.appendChild(tag);
    });
  };

  // Events
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
      panel.classList.add('open');
      if (!activeConv && currentMode === 'empty') {
        emptyState.style.display = 'flex';
      }
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
    inputEl.value = ''; // Clear input immediately for better UX
    const resp = await api('POST', `/chat/conversations/${activeConv.id}/messages`, { content: text });
    if (resp && resp.message) { 
      appendMessage(resp.message);
      // Ensure scroll to bottom after sending
      setTimeout(() => {
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }, 10);
    }
  });
  inputEl.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
  btnCreateGroup.addEventListener('click', async () => {
    const ids = Array.from(selected.keys());
    if (!ids.length) return;
    const title = (groupTitle.value || '').trim() || null;
    const conv = await api('POST', '/chat/conversations', { is_group: true, title, member_user_ids: ids });
    if (conv && conv.id) {
      await loadConversations();
      const found = conversations.find(c => c.id === conv.id) || conv;
      openConversation(found);
    }
  });
  const showGroupInfo = async () => {
    if (!activeConv || !activeConv.is_group) return;
    const action = prompt('Actions: type "title" to rename, "add" to add members, "leave" to leave.');
    if (!action) return;
    if (action.toLowerCase() === 'title') {
      const t = prompt('New group title:', activeConv.title || '');
      if (t != null) {
        const updated = await api('PATCH', `/chat/conversations/${activeConv.id}`, { title: t });
        if (updated && updated.id) {
          activeConv = updated;
          await loadConversations();
          showChat(updated);
        }
      }
    } else if (action.toLowerCase() === 'add') {
      showGroupBuilder();
      btnCreateGroup.textContent = 'Add to Group';
      const handler = async () => {
        const ids = Array.from(selected.keys());
        if (!ids.length || !activeConv) return;
        await api('POST', `/chat/conversations/${activeConv.id}/members`, { add_user_ids: ids });
        await loadConversations();
        const updated = conversations.find(c => c.id === activeConv.id);
        if (updated) showChat(updated);
      };
      btnCreateGroup.replaceWith(btnCreateGroup.cloneNode(true));
      document.getElementById('mkCreateGroup').addEventListener('click', handler, { once: true });
    } else if (action.toLowerCase() === 'leave') {
      if (confirm('Leave this group?')) {
        await api('POST', `/chat/conversations/${activeConv.id}/leave`);
        activeConv = null;
        currentMode = 'empty';
        emptyState.style.display = 'flex';
        chatHeader.style.display = 'none';
        msgsEl.style.display = 'none';
        inputArea.style.display = 'none';
        await loadConversations();
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
        const url = '/chat/search?q=' + encodeURIComponent(messageSearchQuery) + (activeConv ? '&conversation_id=' + encodeURIComponent(activeConv.id) : '') + '&limit=30';
        const data = await api('GET', url);
        searchResults = Array.isArray(data) ? data : [];
        renderSearchResults();
      }, 300);
    });
  }

  // Bootstrap
  (async function init() {
    try {
      const meResp = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      if (meResp.ok) { me = await meResp.json(); }
      await loadConversations();
      const unread = await api('GET', '/chat/unread_count');
      const total = unread && unread.total || 0;
      if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = String(total); }
      else { badge.style.display = 'none'; }
    } catch (e) { /* ignore */ }
  })();
})();
