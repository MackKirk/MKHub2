from fastapi import APIRouter


# Placeholder router; static HTML is served from app/ui via StaticFiles
router = APIRouter(tags=["ui"])


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
