const users = [];
let currentUser = null;
const creditPool = [];
const ledger = [];
const STORAGE_KEY = 'carbonChainData';

const log = (msg, userScoped = false) => {
  const logEl = document.getElementById('activityLog');
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
  logEl.prepend(li);
  if (userScoped && currentUser) {
    currentUser.history.unshift(`${new Date().toLocaleTimeString()} - ${msg}`);
    renderUserHistory();
  }
};

const simpleHash = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `block-${Math.abs(hash).toString(16)}`;
};

const apiFetch = async (path, options = {}) => {
  const url = `http://localhost:3000${path}`;
  const config = { headers: { 'Content-Type': 'application/json' }, ...options };
  if (config.body && typeof config.body !== 'string') config.body = JSON.stringify(config.body);
  const res = await fetch(url, config);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
};

const saveState = async () => {
  const payload = { users, creditPool, ledger };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  try {
    await apiFetch('/api/state', { method: 'PUT', body: payload });
  } catch (err) {
    console.warn('Cannot sync with backend:', err.message);
  }
};

const loadState = async () => {
  try {
    const parsed = await apiFetch('/api/state');
    if (parsed && parsed.users && parsed.creditPool && parsed.ledger) {
      users.length = 0;
      parsed.users.forEach((item) => { if (item && item.username) users.push(item); });
      creditPool.length = 0;
      parsed.creditPool.forEach((item) => { if (item && item.id) creditPool.push(item); });
      ledger.length = 0;
      parsed.ledger.forEach((item) => { if (item && item.tx) ledger.push(item); });
      return;
    }
  } catch (err) {
    console.warn('Backend load failed, falling back to localStorage:', err.message);
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.users) && parsed.users.length) {
      users.length = 0;
      parsed.users.forEach((item) => { if (item && item.username) users.push(item); });
    }
    if (Array.isArray(parsed.creditPool)) {
      creditPool.length = 0;
      parsed.creditPool.forEach((item) => { if (item && item.id) creditPool.push(item); });
    }
    if (Array.isArray(parsed.ledger)) {
      ledger.length = 0;
      parsed.ledger.forEach((item) => { if (item && item.tx) ledger.push(item); });
    }
    log('Loaded state from localStorage.');
  } catch (err) {
    console.warn('Failed to load saved state', err);
  }
};

const getUserByName = (username) => users.find((u) => u.username.toLowerCase() === username.toLowerCase());

const setAuthUI = () => {
  const authPanel = document.getElementById('authPanel');
  const dashboard = document.getElementById('dashboard');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginMessage = document.getElementById('loginMessage');

  if (currentUser) {
    authPanel.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    document.getElementById('dashboardTitle').textContent = `${currentUser.role === 'admin' ? 'Admin' : 'User'} Dashboard`;
    document.getElementById('welcomeText').textContent = `Logged in as ${currentUser.username} (${currentUser.role})`;
    document.getElementById('roleBanner').textContent = `${currentUser.role.toUpperCase()}`;

    renderUserProfile();
    renderUserHistory();
    if (document.getElementById('blockchainLedger')) renderLedger();

    loginMessage.textContent = '';
    loginBtn.disabled = true;
  } else {
    authPanel.classList.remove('hidden');
    dashboard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    loginMessage.textContent = 'Please log in or register to continue.';
    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    loginBtn.disabled = false;
  }
};

const translateRole = (role) => {
  if (role === 'admin') return 'Administrator';
  if (role === 'seller') return 'Seller';
  if (role === 'buyer') return 'Buyer';
  return 'User';
};

const renderUserProfile = () => {
  const profileDetails = document.getElementById('profileDetails');
  if (!currentUser) {
    profileDetails.innerHTML = '<p>Not logged in</p>';
    return;
  }

  const sales = currentUser.creditsSold || 0;
  const buys = currentUser.creditsBought || 0;

  let extraStats = '';
  if (currentUser.role === 'buyer') {
    extraStats = `<p><strong>Credits Bought:</strong> ${buys}</p>`;
  } else if (currentUser.role === 'seller') {
    extraStats = `<p><strong>Credits Sold:</strong> ${sales}</p>`;
  }

  profileDetails.innerHTML = `
    <p><strong>Name:</strong> ${currentUser.username}</p>
    <p><strong>Role:</strong> ${translateRole(currentUser.role)}</p>
    ${extraStats}
    <p><strong>Account Activities:</strong> ${currentUser.history.length}</p>
  `;
};

const renderUserHistory = () => {
  const historyEl = document.getElementById('userHistory');
  historyEl.innerHTML = '';
  if (!currentUser || !currentUser.history.length) {
    historyEl.innerHTML = '<li>No activity yet for this user.</li>';
    return;
  }

  const isBuyer = currentUser.role === 'buyer';
  const isSeller = currentUser.role === 'seller';

  const filtered = currentUser.history.filter((entry) => {
    const lower = entry.toLowerCase();
    if (isBuyer && lower.includes('bought')) return true;
    if (isSeller && lower.includes('sold')) return true;
    if (!isBuyer && !isSeller) return true; // admin gets full history
    return false;
  });

  if (!filtered.length) {
    historyEl.innerHTML = '<li>No buy/sell history yet.</li>';
    return;
  }

  filtered.slice(0, 12).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    historyEl.append(li);
  });
};

// Verification workflow removed per request (generate/verify/marketplace removed).

const setTab = (tabId) => {
  document.querySelectorAll('.tabpane').forEach((pane) => pane.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
  const selectedPane = document.getElementById(tabId);
  if (selectedPane) selectedPane.classList.add('active');
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (selectedBtn) selectedBtn.classList.add('active');
};

const renderSummary = () => {
  const summaryGrid = document.getElementById('summaryGrid');
  if (!summaryGrid) return;
  const totalProjects = creditPool.length;
  const totalCredits = creditPool.reduce((acc, c) => acc + (c.credits || 0), 0);
  const verifiedCount = creditPool.filter((c) => c.verified).length;
  const soldCount = creditPool.filter((c) => c.soldOut).length;

  summaryGrid.innerHTML = `
    <div class="summary-item"><strong>${totalProjects}</strong> Projects</div>
    <div class="summary-item"><strong>${totalCredits.toFixed(2)}</strong> Total Credits</div>
    <div class="summary-item"><strong>${verifiedCount}</strong> Verified</div>
    <div class="summary-item"><strong>${soldCount}</strong> Sold Out</div>
  `;
};

const renderLedger = () => {
  const ledgerNode = document.getElementById('blockchainLedger');
  if (!ledgerNode) return;
  ledgerNode.innerHTML = '';
  if (!ledger.length) {
    ledgerNode.innerHTML = '<li>No blocks recorded yet.</li>';
    return;
  }

  ledger.slice().reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.timestamp} | ${entry.tx}`;
    ledgerNode.append(li);
  });
};

// Marketplace workflow removed per request (generate/verify/marketplace removed).
const renderMarketplace = () => {
  // no-op
};

const getTypeLabel = (value) => {
  const map = {
    tree_plantation: 'Tree Plantation',
    renewable_energy: 'Renewable Energy',
    waste_management: 'Waste Management',
    efficiency: 'Energy Efficiency',
  };
  return map[value] || 'Unknown';
};

const init = async () => {
  await loadState();

  document.getElementById('loginBtn').addEventListener('click', async () => {
    const name = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    const msg = document.getElementById('loginMessage');

    if (!name || !password) {
      msg.textContent = 'Please fill username and password.';
      return;
    }

    try {
      const resp = await apiFetch('/api/login', { method: 'POST', body: { username: name, password } });
      currentUser = resp.user;
      log(`User ${currentUser.username} logged in.`, true);
      setAuthUI();
    } catch (error) {
      msg.textContent = error.message;
    }
  });

  document.getElementById('registerBtn').addEventListener('click', async () => {
    const newName = document.getElementById('regUsernameInput').value.trim();
    const newPwd = document.getElementById('regPasswordInput').value;
    const role = document.getElementById('regRoleSelect').value;
    const msg = document.getElementById('loginMessage');

    if (!newName || !newPwd || !role) {
      msg.textContent = 'Please fill in all registration details.';
      return;
    }

    try {
      const resp = await apiFetch('/api/register', { method: 'POST', body: { username: newName, password: newPwd, role } });
      users.push(resp.user);
      await saveState();

      msg.textContent = 'Registration successful! You can now log in.';
      document.getElementById('regUsernameInput').value = '';
      document.getElementById('regPasswordInput').value = '';
      document.getElementById('usernameInput').value = newName;
      document.getElementById('passwordInput').value = '';

      log(`New user registered: ${newName} as ${role}.`, true);
    } catch (error) {
      msg.textContent = error.message;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (currentUser) log(`User ${currentUser.username} logged out.`, true);
    currentUser = null;
    setAuthUI();
  });

  document.getElementById('showLoginLink').addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('loginBlock').classList.remove('hidden');
  });

  // Generate/verify/marketplace forms removed as requested.

  const calcForm = document.getElementById('calcForm');
  if (calcForm) {
    calcForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const impact = parseFloat(document.getElementById('calcImpact').value);
      const factor = parseFloat(document.getElementById('calcFactor').value);

      if (!impact || impact <= 0 || !factor || factor < 0.85 || factor > 1) {
        alert('Enter valid values.');
        return;
      }

      const credits = (impact * factor).toFixed(2);
      document.getElementById('calcResult').textContent = `Estimated carbon credits: ${credits} tCO2e`;
    });
  }

  // Refresh marketplace button removed.

  setAuthUI();
};

window.addEventListener('DOMContentLoaded', init);
