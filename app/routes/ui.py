from fastapi import APIRouter
from fastapi.responses import HTMLResponse


router = APIRouter(tags=["ui"])


@router.get("/ui", response_class=HTMLResponse)
def ui_root() -> HTMLResponse:
    html = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MK Hub - Minimal UI</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 24px; }
    h2 { margin-top: 28px; }
    form { display: grid; gap: 8px; margin: 12px 0; max-width: 420px; }
    input, button { padding: 8px 10px; font-size: 14px; }
    .row { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
    .card { border: 1px solid #e1e1e1; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .ok { color: #087443; }
    .err { color: #b71c1c; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
    .muted { color: #777; font-size: 12px; }
  </style>
  <script>
    const api = {
      login: async (identifier, password) => fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) }).then(r => r.json()),
      me: async (token) => fetch('/auth/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r => r.json()),
      invite: async (email, token) => fetch('/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ email_personal: email }) }).then(async r => { const txt = await r.text(); try { return JSON.parse(txt); } catch { return { error: txt || ('HTTP ' + r.status) }; }}),
      register: async (invite_token, password) => fetch('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite_token, password }) }).then(async r => { const txt = await r.text(); try { return JSON.parse(txt); } catch { return { error: txt || ('HTTP ' + r.status) }; }}),
      validateInvite: async (token) => fetch('/auth/invite/' + encodeURIComponent(token)).then(r => r.json())
    };

    function set(id, txt) { document.getElementById(id).textContent = txt; }
    function val(id) { return document.getElementById(id).value; }
    function show(id) { document.getElementById(id).style.display = 'block'; }
    function hide(id) { document.getElementById(id).style.display = 'none'; }

    async function adminLogin(ev) {
      ev.preventDefault();
      set('adminMsg', '');
      try {
        const data = await api.login(val('adminUser'), val('adminPass'));
        if (data.access_token) {
          localStorage.setItem('admin_token', data.access_token);
          set('adminMsg', 'Logged in');
          set('adminMsg', setClass('adminMsg', 'ok'));
          show('inviteCard');
        } else {
          set('adminMsg', JSON.stringify(data)); setClass('adminMsg', 'err');
        }
      } catch (e) { set('adminMsg', String(e)); setClass('adminMsg', 'err'); }
    }

    async function sendInvite(ev) {
      ev.preventDefault();
      set('inviteMsg', '');
      const token = localStorage.getItem('admin_token');
      if (!token) { set('inviteMsg', 'Login as admin first'); setClass('inviteMsg', 'err'); return; }
      try {
        const res = await api.invite(val('inviteEmail'), token);
        if (res.invite_token) {
          document.getElementById('inviteToken').value = res.invite_token;
          set('inviteMsg', 'Invite created'); setClass('inviteMsg', 'ok');
          show('registerCard');
        } else {
          set('inviteMsg', typeof res === 'object' ? JSON.stringify(res) : String(res)); setClass('inviteMsg', 'err');
        }
      } catch (e) { set('inviteMsg', String(e)); setClass('inviteMsg', 'err'); }
    }

    async function register(ev) {
      ev.preventDefault();
      set('registerMsg', '');
      try {
        const res = await api.register(val('inviteToken'), val('registerPass'));
        if (res.access_token) {
          localStorage.setItem('user_token', res.access_token);
          set('registerMsg', 'Registered'); setClass('registerMsg', 'ok');
          show('meCard');
        } else {
          set('registerMsg', typeof res === 'object' ? JSON.stringify(res) : String(res)); setClass('registerMsg', 'err');
        }
      } catch (e) { set('registerMsg', String(e)); setClass('registerMsg', 'err'); }
    }

    async function whoAmI() {
      set('meMsg', '');
      const token = localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      if (!token) { set('meMsg', 'No token'); setClass('meMsg', 'err'); return; }
      try {
        const res = await api.me(token);
        document.getElementById('meOut').textContent = JSON.stringify(res, null, 2);
      } catch (e) { set('meMsg', String(e)); setClass('meMsg', 'err'); }
    }

    function setClass(id, cls) {
      const el = document.getElementById(id);
      el.className = cls;
      return el.textContent;
    }
  </script>
  </head>
<body>
  <h1>MK Hub - Minimal Auth UI</h1>
  <p class="muted">Use this page to test invite → register → login → me.</p>

  <div class="card">
    <h2>1) Admin Login</h2>
    <form onsubmit="adminLogin(event)">
      <input id="adminUser" placeholder="admin username or email" required />
      <input id="adminPass" placeholder="password" type="password" required />
      <button type="submit">Login</button>
    </form>
    <div id="adminMsg" class="muted"></div>
  </div>

  <div id="inviteCard" class="card" style="display:none">
    <h2>2) Create Invite</h2>
    <form onsubmit="sendInvite(event)">
      <input id="inviteEmail" placeholder="personal email for invite" type="email" required />
      <button type="submit">Send Invite</button>
    </form>
    <div class="row">
      <input id="inviteToken" readonly placeholder="invite token will appear here" />
    </div>
    <div id="inviteMsg" class="muted"></div>
  </div>

  <div id="registerCard" class="card" style="display:none">
    <h2>3) Register New User</h2>
    <form onsubmit="register(event)">
      <input id="registerPass" placeholder="new user password" type="password" required />
      <button type="submit">Register</button>
    </form>
    <div id="registerMsg" class="muted"></div>
  </div>

  <div id="meCard" class="card" style="display:none">
    <h2>4) Who am I?</h2>
    <button onclick="whoAmI()">Fetch /auth/me</button>
    <pre id="meOut" style="white-space:pre-wrap"></pre>
    <div id="meMsg" class="muted"></div>
  </div>

  <p class="muted">Tip: after admin login, invite a real email, then register with the token.</p>
</body>
</html>
    """
    return HTMLResponse(content=html)


@router.get("/ui/login", response_class=HTMLResponse)
def ui_login() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>Login</title>
<form onsubmit="login(event)">
  <input id="id" placeholder="username or email" required />
  <input id="pw" type="password" placeholder="password" required />
  <button>Login</button>
</form>
<pre id="out"></pre>
<script>
async function login(ev){ev.preventDefault(); const r = await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:document.getElementById('id').value,password:document.getElementById('pw').value})}); const j = await r.json(); if(j.access_token){ localStorage.setItem('user_token', j.access_token); location.href='/ui'; } else { document.getElementById('out').textContent=JSON.stringify(j,null,2); }}
</script>
"""
    return HTMLResponse(content=html)


@router.get("/ui/register", response_class=HTMLResponse)
def ui_register(token: str | None = None) -> HTMLResponse:
    html = f"""
<!doctype html>
<meta charset='utf-8'>
<title>Register</title>
<h2>Accept Invite</h2>
<form onsubmit="reg(event)">
  <input id="token" placeholder="invite token" value="{token or ''}" required />
  <input id="pw" type="password" placeholder="new password" required />
  <button>Register</button>
</form>
<div id="msg"></div>
<script>
async function reg(ev){ev.preventDefault(); const t=document.getElementById('token').value; const pw=document.getElementById('pw').value; const r = await fetch('/auth/register', {{method:'POST', headers:{{'Content-Type':'application/json'}}, body: JSON.stringify({{invite_token:t, password:pw}})}}); const txt = await r.text(); try {{ const j = JSON.parse(txt); if(j.access_token){{ localStorage.setItem('user_token', j.access_token); location.href='/ui'; }} else {{ document.getElementById('msg').textContent = JSON.stringify(j); }} }} catch(e) {{ document.getElementById('msg').textContent = txt; }} }
</script>
"""
    return HTMLResponse(content=html)


