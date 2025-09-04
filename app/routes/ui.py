from fastapi import APIRouter
from fastapi.responses import HTMLResponse


router = APIRouter(tags=["ui"])


@router.get("/ui", response_class=HTMLResponse)
def ui_root() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>MK Hub</title>
<script>
const token = localStorage.getItem('user_token');
if (token) { location.replace('/ui/home'); } else { location.replace('/ui/login'); }
</script>
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
async function login(ev){ev.preventDefault(); const r = await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:document.getElementById('id').value,password:document.getElementById('pw').value})}); const j = await r.json(); if(j.access_token){ localStorage.setItem('user_token', j.access_token); location.href='/ui/home'; } else { document.getElementById('out').textContent=JSON.stringify(j,null,2); }}
function forgot(){ const id = (document.getElementById('id').value||'').trim(); if(!id){ alert('Enter username or email'); return; } fetch('/auth/password/forgot?identifier='+encodeURIComponent(id),{method:'POST'}).then(()=>{ alert('If the account exists, a reset email was sent.'); }); }
</script>
<button onclick="forgot()">Forgot password?</button>
"""
    return HTMLResponse(content=html)


@router.get("/ui/register", response_class=HTMLResponse)
def ui_register() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>Register</title>
<h2>Accept Invite</h2>
<form onsubmit="reg(event)">
  <input id="token" type="hidden" />
  <div class="row">
    <input id="first" placeholder="first name" required />
    <input id="last" placeholder="last name" required />
  </div>
  <input id="email" placeholder="personal email (from invite)" type="email" readonly />
  <div class="row">
    <input id="preferred" placeholder="preferred name" />
    <input id="phone" placeholder="phone" />
  </div>
  <div class="row">
    <input id="mobile" placeholder="mobile phone" />
    <input id="dob" placeholder="date of birth (YYYY-MM-DD)" />
  </div>
  <div class="row">
    <input id="address1" placeholder="address line 1" />
    <input id="address2" placeholder="address line 2" />
  </div>
  <div class="row">
    <input id="city" placeholder="city" />
    <input id="province" placeholder="province/state" />
  </div>
  <div class="row">
    <input id="postal" placeholder="postal code" />
    <input id="country" placeholder="country" />
  </div>
  <input id="pw" type="password" placeholder="new password" required />
  <button>Register</button>
</form>
<div id="msg"></div>
<script>
// Pre-fill token from query string if present
const qp = new URLSearchParams(location.search);
document.getElementById('token').value = qp.get('token') || '';
// Lookup invite details and lock email field
if (qp.get('token')) {
  fetch('/auth/invite/' + encodeURIComponent(qp.get('token')))
    .then(r => r.json())
    .then(j => { if (j && j.email_personal) { document.getElementById('email').value = j.email_personal; } })
    .catch(() => {});
}

async function reg(ev){
  ev.preventDefault();
  const t = document.getElementById('token').value;
  const pw = document.getElementById('pw').value;
  const first = document.getElementById('first').value;
  const last = document.getElementById('last').value;
  const profile = {
    preferred_name: document.getElementById('preferred').value || null,
    phone: document.getElementById('phone').value || null,
    mobile_phone: document.getElementById('mobile').value || null,
    date_of_birth: document.getElementById('dob').value || null,
    address_line1: document.getElementById('address1').value || null,
    address_line2: document.getElementById('address2').value || null,
    city: document.getElementById('city').value || null,
    province: document.getElementById('province').value || null,
    postal_code: document.getElementById('postal').value || null,
    country: document.getElementById('country').value || null,
  };
  const r = await fetch('/auth/register', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ invite_token:t, password:pw, first_name:first, last_name:last, profile }) });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    if (j.access_token) {
      localStorage.setItem('user_token', j.access_token);
      location.href = '/ui';
    } else {
      document.getElementById('msg').textContent = JSON.stringify(j);
    }
  } catch(e) {
    document.getElementById('msg').textContent = txt;
  }
}
</script>
"""
    return HTMLResponse(content=html)


@router.get("/ui/home", response_class=HTMLResponse)
def ui_home() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>Home</title>
<style>
body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;display:flex;min-height:100vh}
.side{width:220px;background:#0f172a;color:#fff;padding:16px}
.side h3{margin:0 0 12px 0;font-size:16px}
.side button{width:100%;margin:6px 0;padding:8px;border:0;border-radius:6px;background:#334155;color:#fff;cursor:pointer}
.main{flex:1;padding:20px}
.muted{color:#777}
</style>
<div class="side">
  <h3>MK Hub</h3>
  <div id="hello" class="muted"></div>
  <button onclick="gotoProfile()">My Information</button>
  <button onclick="gotoInvite()">Invite Users</button>
  <button onclick="logout()">Logout</button>
</div>
<div class="main">
  <h2>Welcome</h2>
  <p class="muted">This is your home. More options coming soon.</p>
</div>
<script>
const token = localStorage.getItem('user_token');
if(!token){ location.href='/ui/login'; }
fetch('/auth/me', { headers:{ Authorization:'Bearer '+token } }).then(r=>r.json()).then(u=>{ document.getElementById('hello').textContent = 'Hello, ' + (u.username || 'user'); });
function gotoProfile(){ location.href='/ui/profile'; }
function gotoInvite(){ location.href='/ui/invite'; }
function logout(){ localStorage.removeItem('user_token'); location.href='/ui/login'; }
</script>
"""
    return HTMLResponse(content=html)


@router.get("/ui/profile", response_class=HTMLResponse)
def ui_profile() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>My Profile</title>
<h2>My Profile</h2>
<form onsubmit="save(event)">
  <div class=\"row\"> <input id=\"first\" placeholder=\"first name\" readonly /> <input id=\"last\" placeholder=\"last name\" readonly /> </div>
  <input id=\"preferred\" placeholder=\"preferred name\" />
  <div class=\"row\"> <input id=\"phone\" placeholder=\"phone\" /> <input id=\"mobile\" placeholder=\"mobile\" /> </div>
  <div class=\"row\"> <input id=\"dob\" placeholder=\"date of birth YYYY-MM-DD\" /> <input id=\"job\" placeholder=\"job title\" /> </div>
  <div class=\"row\"> <input id=\"address1\" placeholder=\"address line 1\" /> <input id=\"address2\" placeholder=\"address line 2\" /> </div>
  <div class=\"row\"> <input id=\"city\" placeholder=\"city\" /> <input id=\"province\" placeholder=\"province\" /> </div>
  <div class=\"row\"> <input id=\"postal\" placeholder=\"postal code\" /> <input id=\"country\" placeholder=\"country\" /> </div>
  <button>Save</button> <a href=\"/ui/home\">Back</a>
</form>
<pre id=\"msg\"></pre>
<script>
const token = localStorage.getItem('user_token');
if(!token){ location.href='/ui/login'; }
fetch('/auth/me/profile', { headers:{ Authorization:'Bearer '+token }}).then(r=>r.json()).then(d=>{
  if(d){
    const p = d.profile || {};
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.value = v || ''};
    set('first', p.first_name || (d.user && d.user.first_name) || '');
    set('last', p.last_name || (d.user && d.user.last_name) || '');
    set('preferred', p.preferred_name);
    set('phone', p.phone); set('mobile', p.mobile_phone); set('dob', p.date_of_birth);
    set('job', p.job_title); set('address1', p.address_line1); set('address2', p.address_line2);
    set('city', p.city); set('province', p.province); set('postal', p.postal_code); set('country', p.country);
  }
});

async function save(ev){
  ev.preventDefault();
  const body = {
    first_name: document.getElementById('first').value || null,
    last_name: document.getElementById('last').value || null,
    preferred_name: document.getElementById('preferred').value || null,
    phone: document.getElementById('phone').value || null,
    mobile_phone: document.getElementById('mobile').value || null,
    date_of_birth: document.getElementById('dob').value || null,
    job_title: document.getElementById('job').value || null,
    address_line1: document.getElementById('address1').value || null,
    address_line2: document.getElementById('address2').value || null,
    city: document.getElementById('city').value || null,
    province: document.getElementById('province').value || null,
    postal_code: document.getElementById('postal').value || null,
    country: document.getElementById('country').value || null,
  };
  const r = await fetch('/auth/me/profile', { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify(body) });
  const txt = await r.text();
  document.getElementById('msg').textContent = txt;
}
</script>
"""
    return HTMLResponse(content=html)


@router.get("/ui/invite", response_class=HTMLResponse)
def ui_invite() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>Invite Users</title>
<h2>Invite Users</h2>
<form onsubmit=\"send(ev)\"> <input id=\"email\" type=\"email\" placeholder=\"personal email\" required /> <button>Invite</button> <a href=\"/ui/home\">Back</a></form>
<pre id=\"msg\"></pre>
<script>
const token = localStorage.getItem('user_token');
if(!token){ location.href='/ui/login'; }
async function send(ev){ ev.preventDefault(); const email=document.getElementById('email').value; const r = await fetch('/auth/invite',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ email_personal: email })}); const txt = await r.text(); document.getElementById('msg').textContent = txt; }
</script>
"""
    return HTMLResponse(content=html)


@router.get("/ui/password-reset", response_class=HTMLResponse)
def ui_password_reset() -> HTMLResponse:
    html = """
<!doctype html>
<meta charset='utf-8'>
<title>Password Reset</title>
<h2>Reset Password</h2>
<form onsubmit=\"resetpw(event)\"> <input id=\"token\" placeholder=\"token\" required /> <input id=\"pw\" type=\"password\" placeholder=\"new password\" required /> <button>Reset</button></form>
<pre id=\"msg\"></pre>
<script>
const qp = new URLSearchParams(location.search); document.getElementById('token').value = qp.get('token') || '';
async function resetpw(ev){ ev.preventDefault(); const t=document.getElementById('token').value; const pw=document.getElementById('pw').value; const r = await fetch('/auth/password/reset?token='+encodeURIComponent(t)+'&new_password='+encodeURIComponent(pw), { method:'POST' }); const txt = await r.text(); document.getElementById('msg').textContent = txt; }
</script>
"""
    return HTMLResponse(content=html)
