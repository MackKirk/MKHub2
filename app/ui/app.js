function getTokenOrRedirect() {
  const token = localStorage.getItem('user_token');
  if (!token) {
    location.href = '/ui/login.html';
    throw new Error('redirect');
  }
  return token;
}

async function initSidebar(active, enforceProfile=true) {
  const mount = document.getElementById('sidebar');
  if (!mount) return;
  const html = await fetch('/ui/sidebar.html?v=' + Date.now()).then(r => r.text());
  mount.outerHTML = html;
  const nav = document.getElementById('nav-' + active);
  if (nav) nav.classList.add('active');

  const token = localStorage.getItem('user_token');
  if (!token) {
    location.href = '/ui/login.html';
    return;
  }
  const resp = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  if (resp.status === 401) {
    localStorage.removeItem('user_token');
    location.href = '/ui/login.html';
    return;
  }
  try {
    const user = await resp.json();
    const hello = document.getElementById('hello');
    if (hello) hello.textContent = 'Hello, ' + (user.username || 'user');
    const tbUser = document.getElementById('tbUser');
    if (tbUser) tbUser.textContent = (user.username || user.email_personal || '');
    const tbAvatar = document.getElementById('tbAvatar');
    if (tbAvatar){
      // Try profile photo if provided later; fallback to logo circle
      try{
        const pr = await fetch('/auth/me/profile', { headers: { Authorization: 'Bearer ' + token } }).then(x=>x.json());
        const fid = pr && pr.profile && pr.profile.profile_photo_file_id;
        if (fid){ tbAvatar.src = '/files/' + fid + '/thumbnail?w=80'; }
      }catch(e){}
    }
    // Reveal sidebar links based on permissions or admin role
    const roles = (user.roles || []).map(r => (r || '').toLowerCase());
    const isAdmin = roles.includes('admin');
    const perms = new Set(user.permissions || []);
    document.querySelectorAll('.side a[data-perm]').forEach(a => {
      const need = a.getAttribute('data-perm');
      const hasAlt = need === 'users:read' && perms.has('users:write');
      if (isAdmin || (need && (perms.has(need) || hasAlt))) {
        a.style.display = 'block';
      }
    });
  } catch (e) {}

  if (enforceProfile && !location.pathname.endsWith('/ui/profile.html')) {
    try {
      const pr = await fetch('/auth/me/profile', { headers: { Authorization: 'Bearer ' + token } });
      if (pr.ok) {
        const data = await pr.json();
        const p = data && data.profile ? data.profile : null;
        const first = p && p.first_name ? p.first_name : (data && data.user && data.user.first_name);
        const last = p && p.last_name ? p.last_name : (data && data.user && data.user.last_name);
        // Required fields that the employee can fill (admin-only fields excluded)
        // Optional: phone, address_line2, termination_date
        const required = [
          'preferred_name','gender','date_of_birth','marital_status','nationality',
          'mobile_phone','address_line1','city','province','postal_code','country',
          'sin_number','work_permit_status','visa_status',
          'emergency_contact_name','emergency_contact_relationship','emergency_contact_phone'
        ];
        const missing = [];
        if (!first) missing.push('first_name');
        if (!last) missing.push('last_name');
        if (!p) {
          missing.push(...required);
        } else {
          for (const k of required) { if (!p[k]) missing.push(k); }
        }
        if (missing.length) { location.href = '/ui/profile.html'; return; }
      }
    } catch (e) {}
  }

  const logoutBtn = document.querySelector('.side button');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('user_token');
    location.href = '/ui/login.html';
  });
}

window.MKHubUI = { getTokenOrRedirect, initSidebar };


