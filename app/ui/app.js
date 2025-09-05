function getTokenOrRedirect() {
  const token = localStorage.getItem('user_token');
  if (!token) {
    location.href = '/ui/login.html';
    throw new Error('redirect');
  }
  return token;
}

async function initSidebar(active) {
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

  const logoutBtn = document.querySelector('.side button');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('user_token');
    location.href = '/ui/login.html';
  });
}

window.MKHubUI = { getTokenOrRedirect, initSidebar };


