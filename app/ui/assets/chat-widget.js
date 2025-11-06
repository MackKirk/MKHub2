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
  .mkchat-fab{position:fixed;right:18px;bottom:18px;width:52px;height:52px;border-radius:26px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.2);cursor:pointer;z-index:2147483000}
  .mkchat-fab .badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:10px;padding:2px 6px;font-size:11px;display:none}
  .mkchat-panel{position:fixed;right:18px;bottom:78px;width:340px;max-height:60vh;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 24px rgba(0,0,0,.18);overflow:hidden;display:none;z-index:2147483000}
  .mkchat-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e5e7eb;background:#f8fafc}
  .mkchat-tabs{display:flex;gap:8px;padding:8px 8px;border-bottom:1px solid #f1f5f9}
  .mkchat-tabs button{flex:1;padding:6px 8px;border-radius:6px;border:1px solid #e5e7eb;background:#fff;cursor:pointer}
  .mkchat-tabs button.active{background:#2563eb;color:#fff;border-color:#2563eb}
  .mkchat-body{display:flex;gap:8px;height:360px}
  .mkchat-list{width:42%;border-right:1px solid #e5e7eb;overflow:auto}
  .mkchat-list .search{padding:8px;border-bottom:1px solid #f1f5f9}
  .mkchat-list .search input{width:100%;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px}
  .mkchat-list .item{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #f8fafc;cursor:pointer}
  .mkchat-list .item:hover{background:#f8fafc}
  .mkchat-avatar{width:28px;height:28px;border-radius:50%;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#334155;overflow:hidden}
  .mkchat-item-right{margin-left:auto;font-size:12px;color:#64748b}
  .mkchat-unread{background:#ef4444;color:#fff;border-radius:10px;padding:0 6px;font-size:11px}
  .mkchat-chat{flex:1;display:flex;flex-direction:column}
  .mkchat-messages{flex:1;overflow:auto;padding:8px 12px;background:#f8fafc}
  .mkchat-load{padding:8px 12px;text-align:center}
  .mkchat-input{display:flex;gap:8px;padding:8px;border-top:1px solid #e5e7eb;background:#fff}
  .mkchat-input input{flex:1;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px}
  .mkchat-input button{padding:8px 12px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.className = 'mkchat-fab';
  fab.innerHTML = '<svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg><span class="badge" id="mkchatBadge">0</span>';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'mkchat-panel';
  panel.innerHTML = `
    <div class="mkchat-header">
      <div id="mkChatTitle" style="font-weight:600">Messages</div>
      <div>
        <button id="mkGroupInfo" title="Info" style="display:none;border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:4px 8px;margin-right:6px;cursor:pointer">Info</button>
        <button id="mkchatClose" style="border:none;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:#334155">×</button>
      </div>
    </div>
    <div class="mkchat-tabs">
      <button id="mkTabConv" class="active">Conversas</button>
      <button id="mkTabUsers">Usuários</button>
    </div>
    <div class="mkchat-body">
      <div class="mkchat-list">
        <div class="search">
          <div style="display:flex;gap:6px;align-items:center">
            <input id="mkUserSearch" placeholder="Buscar usuários..." style="flex:1" />
            <button id="mkNewGroup" title="Novo grupo" style="border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:6px 8px;cursor:pointer">+ Grupo</button>
          </div>
          <div id="mkGroupBuilder" style="display:none;margin-top:6px">
            <input id="mkGroupTitle" placeholder="Título do grupo (opcional)" style="width:100%;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px" />
            <div id="mkSelectedUsers" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px"></div>
            <button id="mkCreateGroup" style="border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:6px;padding:6px 8px;cursor:pointer">Criar grupo</button>
          </div>
        </div>
        <div id="mkList"></div>
      </div>
      <div class="mkchat-chat">
        <div class="mkchat-load"><button id="mkLoadMore" style="display:none;border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer">Carregar anteriores</button></div>
        <div id="mkMsgs" class="mkchat-messages"></div>
        <div class="mkchat-input">
          <input id="mkInput" placeholder="Escreva uma mensagem..." />
          <button id="mkSend">Enviar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const badge = document.getElementById('mkchatBadge');
  const listEl = panel.querySelector('#mkList');
  const msgsEl = panel.querySelector('#mkMsgs');
  const loadBtn = panel.querySelector('#mkLoadMore');
  const inputEl = panel.querySelector('#mkInput');
  const sendBtn = panel.querySelector('#mkSend');
  const closeBtn = panel.querySelector('#mkchatClose');
  const tabConv = panel.querySelector('#mkTabConv');
  const tabUsers = panel.querySelector('#mkTabUsers');
  const userSearch = panel.querySelector('#mkUserSearch');
  const btnNewGroup = panel.querySelector('#mkNewGroup');
  const builder = panel.querySelector('#mkGroupBuilder');
  const selWrap = panel.querySelector('#mkSelectedUsers');
  const btnCreateGroup = panel.querySelector('#mkCreateGroup');
  const groupTitle = panel.querySelector('#mkGroupTitle');
  const groupInfoBtn = panel.querySelector('#mkGroupInfo');
  const chatTitleEl = panel.querySelector('#mkChatTitle');

  let currentTab = 'convs';
  let conversations = [];
  let users = [];
  let activeConv = null;
  let earliestTs = null;
  let me = null;
  let selected = new Map(); // id -> user

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(wsProto + '://' + location.host + '/ws/chat?token=' + encodeURIComponent(token));
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'unread_count') {
        const total = (msg.data && msg.data.total) || 0;
        if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = String(total); }
        else { badge.style.display = 'none'; }
      } else if (msg.event === 'message_new') {
        const cm = msg.data && msg.data.message;
        const cid = msg.data && msg.data.conversation_id;
        if (activeConv && cid === activeConv.id) {
          appendMessage(cm);
          // mark as read immediately
          markRead(activeConv.id);
        }
        // refresh conversation previews
        loadConversations();
      } else if (msg.event === 'conversation_updated') {
        // On any conversation update, refresh list; if active matches, refresh title/members
        loadConversations().then(()=>{
          if (activeConv) { openConversation(activeConv); }
        });
      }
    } catch (err) {}
  };

  const fmtInitials = (name) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    const letters = parts.slice(0,2).map(p => p[0].toUpperCase()).join('');
    return letters || '?';
  };

  const renderList = () => {
    listEl.innerHTML = '';
    if (currentTab === 'convs') {
      conversations.forEach(c => {
        const el = document.createElement('div'); el.className = 'item';
        const otherId = (c.members || []).find(m => m !== (me && me.id || ''));
        el.innerHTML = `
          <div class="mkchat-avatar" data-cid="${c.id}">${fmtInitials(c.title || '')}</div>
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-weight:600">${c.title || 'Conversa'}</div>
            <div style="font-size:12px;color:#64748b;max-width:160px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${c.last_message ? c.last_message.content : ''}</div>
          </div>
          <div class="mkchat-item-right">${c.unread ? '<span class="mkchat-unread">'+c.unread+'</span>' : ''}</div>
        `;
        el.addEventListener('click', () => openConversation(c));
        listEl.appendChild(el);
      });
    } else {
      users.forEach(u => {
        const el = document.createElement('div'); el.className = 'item';
        const avatar = u.avatar_url ? '<img src="'+u.avatar_url+'" class="mkchat-avatar" />' : '<div class="mkchat-avatar">'+fmtInitials(u.name||u.username)+'</div>';
        el.innerHTML = `
          ${avatar}
          <div style="display:flex;flex-direction:column">
            <div style="font-weight:600">${u.name || u.username}</div>
            <div style="font-size:12px;color:#64748b">${u.username}</div>
          </div>
          ${builder.style.display==='block' ? `<input type="checkbox" data-uid="${u.id}" style="margin-left:auto" ${selected.has(u.id)?'checked':''}/>` : ''}
        `;
        if (builder.style.display !== 'block') {
          el.addEventListener('click', async () => {
            const conv = await api('POST', '/chat/conversations', { participant_user_id: u.id });
            if (conv && conv.id) {
              currentTab = 'convs'; tabUsers.classList.remove('active'); tabConv.classList.add('active');
              await loadConversations();
              const found = conversations.find(c => c.id === conv.id) || conv;
              openConversation(found);
            }
          });
        } else {
          el.addEventListener('change', (ev) => {
            const cb = ev.target.closest('input[type="checkbox"]');
            if (!cb) return;
            if (cb.checked) selected.set(u.id, u); else selected.delete(u.id);
            renderSelected();
          });
        }
        listEl.appendChild(el);
      });
    }
  };

  const appendMessage = (m, toTop=false) => {
    const mine = (window.MK_CURRENT_USER_ID && m.sender_id === window.MK_CURRENT_USER_ID);
    const wrap = document.createElement('div');
    wrap.style = 'display:flex;margin:6px 0;';
    wrap.innerHTML = `
      <div style="margin-left:${mine?'auto':'0'};max-width:76%;background:${mine?'#2563eb':'#e5e7eb'};color:${mine?'#fff':'#0f172a'};padding:8px 10px;border-radius:10px">${(m.content||'').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
    `;
    if (toTop) msgsEl.prepend(wrap); else msgsEl.appendChild(wrap);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  };

  const loadMessages = async (cid, before) => {
    const url = before ? `/chat/conversations/${cid}/messages?before=${encodeURIComponent(before)}` : `/chat/conversations/${cid}/messages`;
    const rows = await api('GET', url);
    if (!rows) return;
    if (!before) msgsEl.innerHTML = '';
    rows.forEach(m => appendMessage(m, !!before));
    if (rows.length > 0) {
      earliestTs = rows[0].created_at;
      loadBtn.style.display = 'inline-block';
    } else {
      loadBtn.style.display = 'none';
    }
  };

  const markRead = async (cid) => { try{ await api('POST', `/chat/conversations/${cid}/read`); }catch(e){} };

  const openConversation = async (conv) => {
    activeConv = conv;
    chatTitleEl.textContent = conv.title || (conv.is_group ? 'Grupo' : 'Conversa');
    groupInfoBtn.style.display = conv.is_group ? 'inline-block' : 'none';
    await loadMessages(conv.id);
    await markRead(conv.id);
  };

  const loadConversations = async () => {
    const rows = await api('GET', '/chat/conversations');
    if (!rows) return;
    // build titles (for 1-1, show other user's name if available in cache)
    conversations = rows.map(c => ({ ...c }));
    renderList();
  };

  let searchTimer = 0;
  const loadUsers = async (q) => {
    const rows = await api('GET', '/chat/users' + (q ? ('?q=' + encodeURIComponent(q)) : ''));
    if (!rows) return;
    users = rows;
    renderList();
  };

  // Events
  fab.addEventListener('click', () => { panel.style.display = panel.style.display ? '' : 'block'; panel.style.display = 'block'; });
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });
  tabConv.addEventListener('click', () => { currentTab = 'convs'; tabConv.classList.add('active'); tabUsers.classList.remove('active'); renderList(); });
  tabUsers.addEventListener('click', () => { currentTab = 'users'; tabUsers.classList.add('active'); tabConv.classList.remove('active'); renderList(); });
  sendBtn.addEventListener('click', async () => {
    const text = (inputEl.value || '').trim();
    if (!text || !activeConv) return;
    const resp = await api('POST', `/chat/conversations/${activeConv.id}/messages`, { content: text });
    if (resp && resp.message) { appendMessage(resp.message); inputEl.value=''; }
  });
  inputEl.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); } });
  loadBtn.addEventListener('click', () => { if (activeConv && earliestTs) loadMessages(activeConv.id, earliestTs); });
  userSearch.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(userSearch.value || ''), 250);
  });
  btnNewGroup.addEventListener('click', () => {
    selected.clear(); renderSelected();
    builder.style.display = builder.style.display==='block' ? 'none' : 'block';
    renderList();
  });
  const renderSelected = () => {
    selWrap.innerHTML='';
    selected.forEach(u => {
      const tag = document.createElement('div');
      tag.style = 'display:flex;align-items:center;gap:6px;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;background:#f8fafc';
      tag.innerHTML = `<span>${u.name||u.username}</span><button title="remover" style="border:none;background:transparent;cursor:pointer;font-size:14px;color:#64748b">×</button>`;
      tag.querySelector('button').addEventListener('click', ()=>{ selected.delete(u.id); renderSelected(); renderList(); });
      selWrap.appendChild(tag);
    });
  };
  btnCreateGroup.addEventListener('click', async () => {
    const ids = Array.from(selected.keys());
    if (!ids.length) return;
    const title = (groupTitle.value || '').trim() || null;
    const conv = await api('POST', '/chat/conversations', { is_group: true, title, member_user_ids: ids });
    if (conv && conv.id) {
      currentTab = 'convs'; tabUsers.classList.remove('active'); tabConv.classList.add('active');
      builder.style.display = 'none'; selected.clear(); renderSelected();
      await loadConversations();
      const found = conversations.find(c => c.id === conv.id) || conv;
      openConversation(found);
    }
  });
  groupInfoBtn.addEventListener('click', async () => {
    if (!activeConv) return;
    // Basic inline manager actions: rename, add members (uses builder), leave
    const action = prompt('Ações: digite "title" para renomear, "add" para adicionar membros, "leave" para sair.');
    if (!action) return;
    if (action.toLowerCase() === 'title') {
      const t = prompt('Novo título do grupo:', activeConv.title || '');
      if (t != null) {
        const updated = await api('PATCH', `/chat/conversations/${activeConv.id}`, { title: t });
        if (updated && updated.id) { activeConv = updated; chatTitleEl.textContent = updated.title || 'Grupo'; await loadConversations(); }
      }
    } else if (action.toLowerCase() === 'add') {
      currentTab = 'users'; tabUsers.classList.add('active'); tabConv.classList.remove('active');
      builder.style.display = 'block'; selected.clear(); renderSelected(); renderList();
      // Reuse builder UI to add, but wire Create to add-members
      btnCreateGroup.textContent = 'Adicionar ao grupo';
      const handler = async () => {
        const ids = Array.from(selected.keys());
        if (!ids.length || !activeConv) return;
        await api('POST', `/chat/conversations/${activeConv.id}/members`, { add_user_ids: ids });
        builder.style.display = 'none'; btnCreateGroup.textContent = 'Criar grupo'; btnCreateGroup.removeEventListener('click', handler);
        selected.clear(); renderSelected();
        currentTab = 'convs'; tabConv.classList.add('active'); tabUsers.classList.remove('active');
        await loadConversations(); openConversation(activeConv);
      };
      btnCreateGroup.addEventListener('click', handler, { once: true });
    } else if (action.toLowerCase() === 'leave') {
      if (confirm('Sair deste grupo?')){
        await api('POST', `/chat/conversations/${activeConv.id}/leave`);
        activeConv = null; msgsEl.innerHTML=''; await loadConversations();
        currentTab = 'convs'; tabConv.classList.add('active'); tabUsers.classList.remove('active');
      }
    }
  });

  // Bootstrap
  (async function init(){
    try{
      // fetch current user to mark own messages
      const meResp = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token }});
      if (meResp.ok) { me = await meResp.json(); window.MK_CURRENT_USER_ID = me && me.id; }
      await loadConversations();
      const unread = await api('GET', '/chat/unread_count');
      const total = unread && unread.total || 0;
      if (total > 0) { badge.style.display = 'inline-block'; badge.textContent = String(total); }
      else { badge.style.display = 'none'; }
      // Preload some users
      await loadUsers('');
    }catch(e){ /* ignore */ }
  })();
})(); 

