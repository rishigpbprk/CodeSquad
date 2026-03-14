const users = [];
let currentUser = null;
const creditPool = [];
const ledger = [];
const activityFeed = [];
const STORAGE_KEY = 'carbonChainData';

const industryFactors = {
  energy: 0.95,
  manufacturing: 0.80,
  transport: 0.70,
  agriculture: 0.85,
  technology: 0.90,
};

const renderSystemActivity = () => {
  const systemActivityNode = document.getElementById('systemActivityLog');
  if (!systemActivityNode) return;
  systemActivityNode.innerHTML = '';
  if (!activityFeed.length) {
    systemActivityNode.innerHTML = '<li>No system activity yet.</li>';
    return;
  }

  activityFeed.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${entry.timestamp} - ${entry.message}`;
    if (entry.buyer || entry.seller) {
      li.textContent += ` [Buyer: ${entry.buyer || 'N/A'} | Seller: ${entry.seller || 'N/A'}]`;
    }
    systemActivityNode.append(li);
  });
};

const addSystemActivity = (activity) => {
  if (!activity) return;
  const entry = {
    timestamp: new Date().toLocaleString(),
    buyer: activity.buyer || null,
    seller: activity.seller || null,
    message: activity.message || 'Activity recorded',
  };
  activityFeed.unshift(entry);
  renderSystemActivity();
};

const log = (msg, userScoped = false, event = null) => {
  const logEl = document.getElementById('activityLog');
  if (logEl) {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
    logEl.prepend(li);
  }

  if (event) {
    addSystemActivity({
      buyer: event.buyer || null,
      seller: event.seller || null,
      message: msg,
    });
  } else {
    addSystemActivity({ message: msg });
  }

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

  let res;
  try {
    res = await fetch(url, config);
  } catch (err) {
    const msg = 'Cannot reach backend. Please start server at http://localhost:3000 and refresh.';
    throw new Error(`${msg} (${err.message})`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  try {
    return await res.json();
  } catch (err) {
    throw new Error('Invalid JSON response from API: ' + err.message);
  }
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
  const marketplace = document.getElementById('marketplace');
  const activity = document.getElementById('activity');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const dashboardLogoutBtn = document.getElementById('dashboardLogoutBtn');
  const loginMessage = document.getElementById('loginMessage');
  const currentLoginInfo = document.getElementById('currentLoginInfo');

  if (currentUser) {
    if (authPanel) authPanel.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    if (marketplace) marketplace.classList.add('hidden');
    if (activity) activity.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (dashboardLogoutBtn) dashboardLogoutBtn.classList.remove('hidden');
    if (currentLoginInfo) currentLoginInfo.textContent = `${currentUser.username} (${translateRole(currentUser.role)})`;

    const sidebarUsername = document.getElementById('sidebarUsername');
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    if (sidebarUsername) sidebarUsername.textContent = currentUser.username;
    if (sidebarUserRole) sidebarUserRole.textContent = translateRole(currentUser.role);

      const dashboardTitle = document.getElementById('dashboardTitle');
      const welcomeText = document.getElementById('welcomeText');
      const roleBanner = document.getElementById('roleBanner');

      if (dashboardTitle) dashboardTitle.textContent = `${currentUser.role === 'admin' ? 'Admin' : 'User'} Dashboard`;
      if (welcomeText) welcomeText.textContent = `Logged in as ${currentUser.username} (${currentUser.role})`;
      if (roleBanner) roleBanner.textContent = `${currentUser.role.toUpperCase()}`;

    renderUserProfile();
    renderUserHistory();
    renderSummary();
    renderMarketplace();
    renderRoleSection();
    renderSystemActivity();
    if (document.getElementById('blockchainLedger')) renderLedger();

    if (loginMessage) loginMessage.textContent = '';
    if (loginBtn) loginBtn.disabled = true;
    document.getElementById('loginBlock')?.classList.add('hidden');
    document.getElementById('registerBlock')?.classList.add('hidden');
  } else {
    if (authPanel) authPanel.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (marketplace) marketplace.classList.add('hidden');
    if (activity) activity.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    const dashboardLogoutBtn = document.getElementById('dashboardLogoutBtn');
    if (dashboardLogoutBtn) dashboardLogoutBtn.classList.add('hidden');
    if (currentLoginInfo) currentLoginInfo.textContent = 'None';
    if (loginMessage) loginMessage.textContent = 'Please log in or register to continue.';
    document.getElementById('loginBlock')?.classList.remove('hidden');
    document.getElementById('registerBlock')?.classList.add('hidden');
    renderSystemActivity();

    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (loginBtn) loginBtn.disabled = false;
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
  if (!profileDetails) return;

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
  if (!historyEl) return;

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

  // Ensure only buy/sell events appear for buyer/seller history views
  const display = filtered.length ? filtered : ['No buy/sell history yet.'];
  display.slice(0, 12).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry;
    historyEl.append(li);
  });
};

const renderRoleSection = () => {
  const roleSection = document.getElementById('roleSection');
  if (!roleSection) return;

  if (!currentUser) {
    roleSection.innerHTML = '<p>Please log in to access role-specific actions.</p>';
    return;
  }

  if (currentUser.role === 'buyer') {
    const availableCredits = creditPool.reduce((sum, item) => sum + (item.credits || 0), 0);
    roleSection.innerHTML = `
      <div><strong>Buyer Panel</strong></div>
      <div>Marketplace total available credits: <strong>${availableCredits.toFixed(2)}</strong></div>
      <div>${availableCredits <= 0 ? 'No credits available right now. Sellers must add credit listings.' : ''}</div>
      <button id="toMarketplace" class="btn btn-primary" style="margin-top: 8px;">Go to Marketplace</button>
    `;

    const toMarketplace = document.getElementById('toMarketplace');
    if (toMarketplace) {
      toMarketplace.addEventListener('click', () => switchSection('marketplace'));
    }
    return;
  }

  if (currentUser.role === 'seller') {
    roleSection.innerHTML = `
      <div><strong>Seller Panel</strong></div>
      <div>You can list carbon credit projects below.</div>
      <form id="createCreditForm" style="margin-top:8px;">
        <input id="projectName" type="text" placeholder="Project Name" required style="width:100%; margin-bottom:6px;" />
        <select id="projectType" required style="width:100%; margin-bottom:6px;">
          <option value="">Select Type</option>
          <option value="tree_plantation">Tree Plantation</option>
          <option value="renewable_energy">Renewable Energy</option>
          <option value="waste_management">Waste Management</option>
          <option value="efficiency">Energy Efficiency</option>
        </select>
        <input id="projectImpact" type="number" placeholder="Estimated Credits (tCO2e)" min="1" step="0.01" required style="width:100%; margin-bottom:6px;" />
        <button type="submit" class="btn btn-primary">List Project</button>
      </form>
      <div class="small" id="sellerStatus"></div>
    `;

    const form = document.getElementById('createCreditForm');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const projectName = document.getElementById('projectName')?.value.trim();
        const projectType = document.getElementById('projectType')?.value;
        const projectImpact = parseFloat(document.getElementById('projectImpact')?.value);
        const status = document.getElementById('sellerStatus');

        if (!projectName || !projectType || !projectImpact || projectImpact <= 0) {
          if (status) status.textContent = 'Please enter valid project details.';
          return;
        }

        try {
          await apiFetch('/api/credits', {
            method: 'POST',
            body: { projectName, projectType, impact: projectImpact, owner: currentUser.username }
          });
          if (status) status.textContent = 'Listing submitted for verification.';
          log(`Project ${projectName} listed by ${currentUser.username}.`, true, { seller: currentUser.username });
          await loadState();
          setAuthUI();
        } catch (error) {
          if (status) status.textContent = `Listing failed: ${error.message}`;
        }
      });
    }

    return;
  }

  if (currentUser.role === 'admin') {
    const pendingCount = creditPool.filter((c) => !c.verified && c.status === 'pending').length;
    roleSection.innerHTML = `
      <div><strong>Admin Panel</strong></div>
      <div>Pending approval items: <strong>${pendingCount}</strong></div>
      <div>Use the marketplace panel to Approve / Decline, and add/min credits on verified assets.</div>
      <button id="toMarketplace" class="btn btn-primary" style="margin-top: 8px;">Go to Marketplace</button>
    `;
    const toMarketplace = document.getElementById('toMarketplace');
    if (toMarketplace) toMarketplace.addEventListener('click', () => switchSection('marketplace'));
    return;
  }

  roleSection.innerHTML = '<p>Admin has full access to marketplace and analytics.</p>';
};

// Verification workflow removed per request (generate/verify/marketplace removed).

const setTab = (tabId) => {
  document.querySelectorAll('.tabpane').forEach((pane) => {
    if (pane && pane.classList) pane.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    if (btn && btn.classList) btn.classList.remove('active');
  });
  const selectedPane = document.getElementById(tabId);
  if (selectedPane && selectedPane.classList) selectedPane.classList.add('active');
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (selectedBtn && selectedBtn.classList) selectedBtn.classList.add('active');
};

const switchSection = (sectionId) => {
  document.querySelectorAll('main > section').forEach((section) => {
    if (section && section.classList) section.classList.add('hidden');
  });
  const target = document.getElementById(sectionId);
  if (target && target.classList) target.classList.remove('hidden');
  document.querySelectorAll('.nav-links a').forEach((link) => {
    if (link && link.classList) link.classList.toggle('active', link.dataset.target === sectionId);
  });
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

  const totalEmissionValue = document.getElementById('totalEmissionValue');
  const operationValue = document.getElementById('operationValue');
  const transportValue = document.getElementById('transportValue');
  const supplyValue = document.getElementById('supplyValue');

  if (totalEmissionValue) totalEmissionValue.textContent = `${(totalCredits * 10).toFixed(0)} tCO2e`;
  if (operationValue) operationValue.textContent = `${(totalCredits * 0.3).toFixed(0)} tCO2e`;
  if (transportValue) transportValue.textContent = `${(totalCredits * 0.4).toFixed(0)} tCO2e`;
  if (supplyValue) supplyValue.textContent = `${(totalCredits * 0.3).toFixed(0)} tCO2e`;

  const totalEmissions = document.getElementById('totalEmissions');
  const operationsEmissions = document.getElementById('operationsEmissions');
  const transportEmissions = document.getElementById('transportEmissions');
  const supplyEmissions = document.getElementById('supplyEmissions');

  if (totalEmissions) totalEmissions.textContent = `${(totalCredits * 10).toFixed(0)}`;
  if (operationsEmissions) operationsEmissions.textContent = `${(totalCredits * 0.3).toFixed(0)}`;
  if (transportEmissions) transportEmissions.textContent = `${(totalCredits * 0.4).toFixed(0)}`;
  if (supplyEmissions) supplyEmissions.textContent = `${(totalCredits * 0.3).toFixed(0)}`;
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

const renderMarketplace = () => {
  const marketEl = document.getElementById('marketplaceList') || document.getElementById('dashboardMarketplaceList');
  if (!marketEl) return;

  if (!creditPool.length) {
    marketEl.innerHTML = '<p>No carbon credit listings yet. Sellers can list projects to kickstart the marketplace.</p>';
    return;
  }

  marketEl.innerHTML = '';
  creditPool.forEach((item) => {
    const card = document.createElement('div');
    card.className = `card ${item.verified ? 'verified' : ''}`;

    const remaining = Math.max(0, item.credits || 0);
    const isPending = !item.verified && item.status === 'pending';

    card.innerHTML = `
      <h4>${item.projectName || 'Unnamed Project'}${item.verified ? '' : item.status === 'declined' ? ' (declined)' : ' (pending verification)'}</h4>
      <p><strong>Type:</strong> ${item.projectTypeLabel || getTypeLabel(item.projectType)}</p>
      <p><strong>Owner:</strong> ${item.owner}</p>
      <p><strong>Available:</strong> ${remaining.toFixed(2)}</p>
      <p><strong>Status:</strong> ${item.verified ? 'Verified' : item.status || 'Pending'}</p>
      <small>${item.soldOut ? 'Sold out' : ''}</small>
    `;

    if (currentUser && currentUser.role === 'buyer' && item.verified && remaining > 0) {
      const buyContainer = document.createElement('div');
      buyContainer.className = 'smaller';
      buyContainer.innerHTML = `
        <label>Quantity <input type="number" min="0.01" step="0.01" value="1" class="qty-input" style="width: 100px; margin-left: 8px;"></label>
        <button class="btn btn-primary" style="margin-top: 8px;">Buy</button>
      `;

      const qtyInput = buyContainer.querySelector('.qty-input');
      const buyBtn = buyContainer.querySelector('button');
      buyBtn.addEventListener('click', async () => {
        const qty = parseFloat(qtyInput.value);
        if (!qty || qty <= 0) {
          alert('Enter a valid positive quantity.');
          return;
        }
        if (qty > remaining) {
          alert(`Credit out of range. Available: ${remaining.toFixed(2)}, requested: ${qty.toFixed(2)}.`);
          return;
        }

        try {
          await apiFetch(`/api/credits/${item.id}/purchase`, {
            method: 'PUT',
            body: { buyer: currentUser.username, qty }
          });

          if (qty === remaining) {
            alert(`Transaction completed: ${item.projectName} is now sold out (0 credits left).`);
          } else {
            alert(`Transaction completed: bought ${qty.toFixed(2)} credits from ${item.projectName}.`);
          }

          log(`Bought ${qty} credits from ${item.projectName} (seller ${item.owner}).`, true, {
            buyer: currentUser.username,
            seller: item.owner,
          });
          await loadState();
          setAuthUI();
        } catch (err) {
          alert(`Purchase failed: ${err.message}`);
        }
      });

      card.appendChild(buyContainer);
    }

    if (currentUser && currentUser.role === 'admin') {
      const adminControls = document.createElement('div');
      adminControls.className = 'smaller';
      adminControls.innerHTML = `
        <div style="margin-top:10px;">
          <strong>Admin actions:</strong>
          <button class="btn btn-secondary" data-action="approve" style="margin-left:6px;">Approve</button>
          <button class="btn btn-secondary" data-action="decline" style="margin-left:6px;">Decline</button>
        </div>
        <div style="margin-top:8px;">
          <button class="btn btn-secondary" data-action="add">+ Add credits</button>
          <button class="btn btn-secondary" data-action="minus" style="margin-left:6px;">- Reduce credits</button>
        </div>
      `;

      const btnApprove = adminControls.querySelector('[data-action="approve"]');
      const btnDecline = adminControls.querySelector('[data-action="decline"]');
      const btnAdd = adminControls.querySelector('[data-action="add"]');
      const btnMinus = adminControls.querySelector('[data-action="minus"]');

      if (btnApprove) {
        btnApprove.addEventListener('click', async () => {
          if (!isPending) {
            alert('Only pending items can be approved.');
            return;
          }
          await apiFetch(`/api/credits/${item.id}/verify`, { method: 'PUT', body: { action: 'accept', admin: currentUser.username } });
          log(`Admin approved ${item.projectName}.`, false, { seller: item.owner });
          await loadState(); setAuthUI();
        });
      }

      if (btnDecline) {
        btnDecline.addEventListener('click', async () => {
          if (!isPending) {
            alert('Only pending items can be declined.');
            return;
          }
          await apiFetch(`/api/credits/${item.id}/verify`, { method: 'PUT', body: { action: 'decline', admin: currentUser.username } });
          log(`Admin declined ${item.projectName}.`, false, { seller: item.owner });
          await loadState(); setAuthUI();
        });
      }

      if (btnAdd) {
        btnAdd.addEventListener('click', async () => {
          const add = parseFloat(prompt('Add how many credits?', '10'));
          if (!add || add <= 0) {
            alert('Enter a valid addition amount.');
            return;
          }
          item.credits = (item.credits || 0) + add;
          item.soldOut = false;
          await saveState();
          log(`Admin added ${add} credits to ${item.projectName}.`, false);
          await loadState(); setAuthUI();
        });
      }

      if (btnMinus) {
        btnMinus.addEventListener('click', async () => {
          const dec = parseFloat(prompt('Reduce how many credits?', '10'));
          if (!dec || dec <= 0) {
            alert('Enter a valid decrement amount.');
            return;
          }
          if (dec > (item.credits || 0)) {
            alert('Cannot reduce below zero.');
            return;
          }
          item.credits = Math.max(0, (item.credits || 0) - dec);
          item.soldOut = item.credits === 0;
          await saveState();
          log(`Admin reduced ${dec} credits from ${item.projectName}.`, false);
          await loadState(); setAuthUI();
        });
      }

      card.appendChild(adminControls);
    }

    marketEl.appendChild(card);
  });
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

    if (currentUser) {
      log(`User ${currentUser.username} has been forcefully logged out before new login by ${name}.`, true, {
        seller: currentUser.username,
        buyer: name,
      });
      currentUser = null;
      setAuthUI();
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

  const dashboardLogoutBtn = document.getElementById('dashboardLogoutBtn');
  if (dashboardLogoutBtn) {
    dashboardLogoutBtn.addEventListener('click', () => {
      if (currentUser) log(`User ${currentUser.username} logged out.`, true);
      currentUser = null;
      setAuthUI();
    });
  }

  const showLoginLink = document.getElementById('showLoginLink');
  const showRegisterLink = document.getElementById('showRegisterLink');

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById('loginBlock')?.classList.remove('hidden');
      document.getElementById('registerBlock')?.classList.add('hidden');
      document.getElementById('loginMessage')?.classList.remove('hidden');
    });
  }

  if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById('registerBlock')?.classList.remove('hidden');
      document.getElementById('loginBlock')?.classList.add('hidden');
      document.getElementById('loginMessage')?.classList.remove('hidden');
    });
  }

  // Generate/verify/marketplace forms removed as requested.

  const calcBtn = document.getElementById('calcBtn');
  if (calcBtn) {
    calcBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const impact = parseFloat(document.getElementById('calcImpact')?.value);
      const factor = parseFloat(document.getElementById('calcFactor')?.value);
      const calcResult = document.getElementById('calcResult');

      if (!impact || impact <= 0 || !factor || factor < 0.85 || factor > 1) {
        if (calcResult) calcResult.textContent = 'Enter valid values.';
        return;
      }

      const credits = (impact * factor).toFixed(2);
      if (calcResult) calcResult.textContent = `Estimated carbon credits: ${credits} tCO2e`;
    });
  }

  const industryCalcForm = document.getElementById('industryCalcForm');
  if (industryCalcForm) {
    industryCalcForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const industry = document.getElementById('industryType')?.value;
      const emission = parseFloat(document.getElementById('industryEmission')?.value);
      const resultNode = document.getElementById('industryCalcResult');

      if (!industry || !industryFactors[industry] || !emission || emission <= 0) {
        if (resultNode) resultNode.textContent = 'Please select an industry and enter positive emission values.';
        return;
      }

      const physicalFactor = industryFactors[industry];
      const estimatedCredits = (emission * physicalFactor).toFixed(2);
      if (resultNode) resultNode.textContent = `Industry calculator result (${industry}): ${estimatedCredits} credits (factor ${physicalFactor}).`;
    });
  }

  const createCreditForm = document.getElementById('createCreditForm');
  if (createCreditForm) {
    createCreditForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentUser || currentUser.role !== 'seller') {
        alert('Only sellers can list a new project.');
        return;
      }

      const projectName = document.getElementById('projectName')?.value.trim();
      const projectType = document.getElementById('projectType')?.value;
      const projectImpact = parseFloat(document.getElementById('projectImpact')?.value);
      const msg = document.getElementById('loginMessage');

      if (!projectName || !projectType || !projectImpact || projectImpact <= 0) {
        if (msg) msg.textContent = 'Please enter valid project details.';
        return;
      }

      try {
        await apiFetch('/api/credits', {
          method: 'POST',
          body: { projectName, projectType, impact: projectImpact, owner: currentUser.username }
        });

        log(`Project ${projectName} listed for verification by ${currentUser.username}.`, true, {
          seller: currentUser.username,
          message: `Project ${projectName} listed for verification`,
        });
        document.getElementById('projectName').value = '';
        document.getElementById('projectImpact').value = '';
        await loadState();
        setAuthUI();
      } catch (err) {
        if (msg) msg.textContent = `Failed to list project: ${err.message}`;
      }
    });
  }

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

  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = link.dataset.target;
      if (target) switchSection(target);
    });
  });

  document.querySelectorAll('.panel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (target) switchSection(target);
      document.querySelectorAll('.panel-btn').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  setAuthUI();

  // show dashboard on login state, else show auth panel
  if (currentUser) {
    switchSection('dashboard');
  } else {
    switchSection('authPanel');
  }
};

window.addEventListener('DOMContentLoaded', init);