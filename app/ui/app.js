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
  const html = await fetch('/ui/sidebar.html').then(r => r.text());
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
  } catch (e) {}

  if (enforceProfile && !location.pathname.endsWith('/ui/profile.html')) {
    try {
      const pr = await fetch('/auth/me/profile', { headers: { Authorization: 'Bearer ' + token } });
      if (pr.ok) {
        const data = await pr.json();
        const p = data && data.profile ? data.profile : null;
        const first = p && p.first_name ? p.first_name : (data && data.user && data.user.first_name);
        const last = p && p.last_name ? p.last_name : (data && data.user && data.user.last_name);
        if (!first || !last) {
          location.href = '/ui/profile.html';
          return;
        }
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


