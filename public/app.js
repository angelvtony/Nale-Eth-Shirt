'use strict';

const PALETTE = [
  { name: 'Navy', hex: '#1f3a68' },
  { name: 'White', hex: '#f4f4f1' },
  { name: 'Sky blue', hex: '#8fc1e8' },
  { name: 'Black', hex: '#1c1c1e' },
  { name: 'Grey', hex: '#9a9fa6' },
  { name: 'Olive', hex: '#6b7a46' },
  { name: 'Maroon', hex: '#7a2336' },
  { name: 'Pink', hex: '#ff8fb3' },
  { name: 'Lavender', hex: '#b9a6e0' },
  { name: 'Beige', hex: '#d9c3a0' }
];

const COLOR_MAP = new Map(PALETTE.map(c => [c.name, c.hex]));

const WIN_LINES = [
  'Looking sharp tomorrow!',
  'Locked in. Nobody can steal it now.',
  'Great pick. The office is lucky.',
  'Done! You are the only one in this colour.'
];

const TAKEN_LINES = [
  '{n} got there first. Pick another!',
  'Twin alert! {n} already claimed this one.',
  'Too late, {n} is wearing it. Try a different colour.',
  'Nope, that is {n}\'s colour tomorrow.'
];

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');

function initTheme() {
  const urlParams = new URLSearchParams(window.location.search);
  const themeParam = urlParams.get('theme');
  const storedTheme = localStorage.getItem('nale_theme');

  const themeToApply = themeParam || storedTheme;
  if (themeToApply === 'dark' || themeToApply === 'light') {
    document.documentElement.setAttribute('data-theme', themeToApply);
    updateThemeIcon(themeToApply);
  } else {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    updateThemeIcon(isDark ? 'dark' : 'light');
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
}

function updateThemeIcon(theme) {
  if (!themeIcon) return;
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const currentAttr = document.documentElement.getAttribute('data-theme');
  const isCurrentlyDark = currentAttr === 'dark' || (!currentAttr && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const nextTheme = isCurrentlyDark ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('nale_theme', nextTheme);
  updateThemeIcon(nextTheme);
}

initTheme();

function getOrCreateToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramToken = urlParams.get('token');
  if (paramToken && paramToken.trim()) {
    localStorage.setItem('nale_token', paramToken.trim());
    return paramToken.trim();
  }

  let token = localStorage.getItem('nale_token');
  if (!token || typeof token !== 'string' || token.length < 10) {
    if (crypto && crypto.randomUUID) {
      token = crypto.randomUUID();
    } else {
      token = 't_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    localStorage.setItem('nale_token', token);
  }
  return token;
}

let currentToken = getOrCreateToken();

const pillDate = document.getElementById('pill-date');
const pillReady = document.getElementById('pill-ready');
const clotheslineList = document.getElementById('clothesline-list');
const feedbackArea = document.getElementById('feedback-area');
const offlineBar = document.getElementById('offline-bar');

const loadingCard = document.getElementById('loading-card');
const joinCard = document.getElementById('join-card');
const joinForm = document.getElementById('join-form');
const joinNameInput = document.getElementById('join-name-input');
const teamCodeGroup = document.getElementById('team-code-group');
const joinCodeInput = document.getElementById('join-code-input');
const joinSubmitBtn = document.getElementById('join-submit-btn');

const pickCard = document.getElementById('pick-card');
const pickHeading = document.getElementById('pick-heading');
const paletteGrid = document.getElementById('palette-grid');
const surpriseBtn = document.getElementById('surprise-btn');
const clearPickBtn = document.getElementById('clear-pick-btn');
const leaveTeamBtn = document.getElementById('leave-team-btn');
const shirtSvgTemplate = document.getElementById('shirt-svg-template');

let appState = {
  day: '',
  dayLabel: '',
  needCode: false,
  me: null,
  members: []
};

let isOnline = true;
let eventSource = null;
let feedbackTimeout = null;

function setFeedback(message, type = 'success', autoClearMs = 4500) {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout);
    feedbackTimeout = null;
  }

  feedbackArea.textContent = message;
  feedbackArea.className = 'feedback-area ' + (type === 'error' ? 'feedback-error' : 'feedback-success');

  if (autoClearMs > 0) {
    feedbackTimeout = setTimeout(() => {
      feedbackArea.textContent = '';
      feedbackArea.className = 'feedback-area';
    }, autoClearMs);
  }
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function fireConfetti(originX, originY) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const container = document.getElementById('confetti-container');
  if (!container) return;

  const count = 22;
  const colors = PALETTE.map(p => p.hex);
  const startX = originX !== undefined ? originX : window.innerWidth / 2;
  const startY = originY !== undefined ? originY : window.innerHeight / 2;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.left = startX + 'px';
    piece.style.top = startY + 'px';

    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 140;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance + 40;
    const rot = (Math.random() * 720 - 360) + 'deg';

    piece.style.setProperty('--dx', `${dx}px`);
    piece.style.setProperty('--dy', `${dy}px`);
    piece.style.setProperty('--rot', rot);

    container.appendChild(piece);

    setTimeout(() => {
      if (piece.parentNode) {
        piece.remove();
      }
    }, 1000);
  }
}

function updatePills(state) {
  if (state.dayLabel) {
    pillDate.textContent = 'For ' + state.dayLabel;
  } else if (state.day) {
    pillDate.textContent = 'For ' + state.day;
  } else {
    pillDate.textContent = 'For tomorrow';
  }

  const total = state.members ? state.members.length : 0;
  const ready = state.members ? state.members.filter(m => Boolean(m.color)).length : 0;
  pillReady.textContent = `${ready} of ${total} ready`;
}

function renderClothesline(state) {
  clotheslineList.replaceChildren();

  const members = state.members || [];
  const myId = state.me ? state.me.id : null;

  if (members.length === 0) {
    const item = document.createElement('div');
    item.className = 'clothesline-item clothesline-empty';

    const hangerClone = shirtSvgTemplate.content.cloneNode(true);
    const shirtSvg = hangerClone.querySelector('.shirt-svg');
    shirtSvg.classList.add('shirt-unpicked');

    const meta = document.createElement('div');
    meta.className = 'shirt-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'shirt-name';
    nameEl.textContent = 'Nobody yet';

    const colorEl = document.createElement('span');
    colorEl.className = 'shirt-color-label';
    colorEl.textContent = 'Be the first!';

    meta.appendChild(nameEl);
    meta.appendChild(colorEl);

    item.appendChild(hangerClone);
    item.appendChild(meta);
    clotheslineList.appendChild(item);
    return;
  }

  members.forEach((member, index) => {
    const item = document.createElement('div');
    item.className = 'clothesline-item';
    item.style.animationDelay = `${(index * 0.45) % 3.6}s`;

    const hangerClone = shirtSvgTemplate.content.cloneNode(true);
    const shirtSvg = hangerClone.querySelector('.shirt-svg');
    const shirtBody = hangerClone.querySelector('.shirt-body');

    if (member.color && COLOR_MAP.has(member.color)) {
      shirtSvg.classList.add('shirt-picked');
      shirtBody.style.fill = COLOR_MAP.get(member.color);
    } else {
      shirtSvg.classList.add('shirt-unpicked');
      shirtBody.style.fill = 'transparent';
    }

    const meta = document.createElement('div');
    meta.className = 'shirt-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'shirt-name';
    nameEl.textContent = member.name;

    if (myId && String(member.id) === String(myId)) {
      nameEl.classList.add('is-me');
    }

    const colorEl = document.createElement('span');
    colorEl.className = 'shirt-color-label';
    colorEl.textContent = member.color ? member.color : 'Still thinking...';

    meta.appendChild(nameEl);
    meta.appendChild(colorEl);

    item.appendChild(hangerClone);
    item.appendChild(meta);
    clotheslineList.appendChild(item);
  });
}

function renderPaletteGrid(state) {
  paletteGrid.replaceChildren();

  const members = state.members || [];
  const myId = state.me ? state.me.id : null;

  const colorHolderMap = new Map();
  for (const m of members) {
    if (m.color) {
      colorHolderMap.set(m.color, m);
    }
  }

  PALETTE.forEach(c => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'swatch-tile';
    tile.dataset.color = c.name;

    const holder = colorHolderMap.get(c.name);
    const isMine = holder && myId && String(holder.id) === String(myId);
    const isTaken = holder && !isMine;

    let statusText = 'Free';
    let ariaLabel = `${c.name}, free`;

    if (isMine) {
      tile.classList.add('is-mine');
      statusText = 'Yours!';
      ariaLabel = `${c.name}, your pick`;
    } else if (isTaken) {
      tile.classList.add('is-taken');
      statusText = `Taken by ${holder.name}`;
      ariaLabel = `${c.name}, taken by ${holder.name}`;
    }

    tile.setAttribute('aria-label', ariaLabel);

    const swatchCircle = document.createElement('div');
    swatchCircle.className = 'swatch-circle';
    swatchCircle.style.backgroundColor = c.hex;

    const nameEl = document.createElement('div');
    nameEl.className = 'swatch-name';
    nameEl.textContent = c.name;

    const statusEl = document.createElement('div');
    statusEl.className = 'swatch-status';
    statusEl.textContent = statusText;

    tile.appendChild(swatchCircle);
    tile.appendChild(nameEl);
    tile.appendChild(statusEl);

    tile.addEventListener('click', (evt) => {
      handleTileClick(c.name, tile, evt);
    });

    paletteGrid.appendChild(tile);
  });
}

function renderApp(state) {
  updatePills(state);
  renderClothesline(state);

  loadingCard.classList.add('hidden');

  if (!state.me) {
    joinCard.classList.remove('hidden');
    pickCard.classList.add('hidden');

    if (state.needCode) {
      teamCodeGroup.classList.remove('hidden');
      joinCodeInput.required = true;
    } else {
      teamCodeGroup.classList.add('hidden');
      joinCodeInput.required = false;
    }
  } else {
    joinCard.classList.add('hidden');
    pickCard.classList.remove('hidden');

    pickHeading.textContent = `Hi, ${state.me.name}! Pick tomorrow's colour`;
    renderPaletteGrid(state);
  }
}

async function handleTileClick(colorName, tileElement, evt) {
  const members = appState.members || [];
  const myId = appState.me ? appState.me.id : null;
  const holder = members.find(m => m.color === colorName);
  const isMine = holder && myId && String(holder.id) === String(myId);

  if (isMine) {
    setFeedback(`You're already wearing ${colorName}! Looking good.`);
    return;
  }

  if (holder) {
    tileElement.classList.remove('shake');
    void tileElement.offsetWidth;
    tileElement.classList.add('shake');

    const template = getRandomItem(TAKEN_LINES);
    const line = template.replace('{n}', holder.name);
    setFeedback(line, 'error');
    return;
  }

  const rect = tileElement.getBoundingClientRect();
  const clickX = evt && evt.clientX ? evt.clientX : rect.left + rect.width / 2;
  const clickY = evt && evt.clientY ? evt.clientY : rect.top + rect.height / 2;

  await claimColor(colorName, clickX, clickY);
}

async function claimColor(colorName, clickX, clickY) {
  try {
    const res = await fetch('/api/pick', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': currentToken
      },
      body: JSON.stringify({ color: colorName })
    });

    const data = await res.json();

    if (res.ok) {
      const winLine = getRandomItem(WIN_LINES);
      setFeedback(`${colorName}! ${winLine}`, 'success');
      fireConfetti(clickX, clickY);
      await fetchState();
    } else if (res.status === 409) {
      const holderName = data.by || 'Someone';
      const template = getRandomItem(TAKEN_LINES);
      const line = template.replace('{n}', holderName);
      setFeedback(line, 'error');
      await fetchState();
    } else {
      setFeedback(data.error || 'Could not pick this colour. Please try again.', 'error');
    }
  } catch (err) {
    setFeedback('Network error. Check your connection.', 'error');
  }
}

async function fetchState() {
  try {
    const res = await fetch('/api/state', {
      headers: {
        'X-Token': currentToken
      }
    });

    if (!res.ok) throw new Error('State fetch failed: ' + res.status);

    const data = await res.json();
    appState = data;
    setOnlineStatus(true);
    renderApp(appState);
  } catch (err) {
    setOnlineStatus(false);
  }
}

function setOnlineStatus(online) {
  isOnline = online;
  if (online) {
    offlineBar.classList.add('hidden');
  } else {
    offlineBar.classList.remove('hidden');
  }
}

joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = joinNameInput.value.replace(/\s+/g, ' ').trim();
  const code = joinCodeInput.value.trim();

  if (!name || name.length < 1 || name.length > 24) {
    setFeedback('Name must be between 1 and 24 characters', 'error');
    return;
  }

  joinSubmitBtn.disabled = true;

  try {
    const res = await fetch('/api/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': currentToken
      },
      body: JSON.stringify({ name, code })
    });

    const data = await res.json();

    if (res.ok) {
      if (data.token) {
        localStorage.setItem('nale_token', data.token);
      }
      setFeedback(`Welcome aboard, ${data.me.name}!`, 'success');
      await fetchState();
    } else {
      setFeedback(data.error || 'Failed to join team', 'error');
    }
  } catch (err) {
    setFeedback('Cannot reach the server. Please check your connection.', 'error');
  } finally {
    joinSubmitBtn.disabled = false;
  }
});

surpriseBtn.addEventListener('click', async () => {
  const members = appState.members || [];
  const takenColors = new Set(members.filter(m => Boolean(m.color)).map(m => m.color));
  const freeColors = PALETTE.filter(p => !takenColors.has(p.name));

  if (freeColors.length === 0) {
    setFeedback('All 10 colours are already taken!', 'error');
    return;
  }

  const chosen = getRandomItem(freeColors);
  const targetTile = paletteGrid.querySelector(`[data-color="${chosen.name}"]`);
  let cx, cy;
  if (targetTile) {
    const r = targetTile.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
  }

  await claimColor(chosen.name, cx, cy);
});

clearPickBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/pick', {
      method: 'DELETE',
      headers: {
        'X-Token': currentToken
      }
    });

    if (res.ok) {
      setFeedback('Pick cleared! The clothesline is open.', 'success');
      await fetchState();
    } else {
      const data = await res.json();
      setFeedback(data.error || 'Could not clear pick.', 'error');
    }
  } catch (err) {
    setFeedback('Network error while clearing pick.', 'error');
  }
});

leaveTeamBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Leave the team? Your shirt and pick will be removed.');
  if (!confirmed) return;

  try {
    const res = await fetch('/api/leave', {
      method: 'POST',
      headers: {
        'X-Token': currentToken
      }
    });

    if (res.ok) {
      localStorage.removeItem('nale_token');
      currentToken = (crypto && crypto.randomUUID) ? crypto.randomUUID() : 't_' + Math.random().toString(36).substring(2);
      localStorage.setItem('nale_token', currentToken);
      appState.me = null;

      setupSSE();

      setFeedback('You left the team. Come back anytime!', 'success');
      await fetchState();
    } else {
      const data = await res.json();
      setFeedback(data.error || 'Could not leave team.', 'error');
    }
  } catch (err) {
    setFeedback('Network error while leaving team.', 'error');
  }
});

function setupSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const sseUrl = `/api/events?token=${encodeURIComponent(currentToken)}`;
  eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && data.members) {
        appState.day = data.day || appState.day;
        appState.dayLabel = data.dayLabel || appState.dayLabel;
        appState.needCode = data.needCode !== undefined ? data.needCode : appState.needCode;
        appState.members = data.members;

        if (data.me !== undefined && data.me !== null) {
          appState.me = data.me;
        } else if (appState.me) {
          const stillExists = data.members.find(m => String(m.id) === String(appState.me.id));
          if (!stillExists) {
            appState.me = null;
          }
        }
        setOnlineStatus(true);
        renderApp(appState);
      }
    } catch {
    }
  };

  eventSource.onerror = () => {
    setOnlineStatus(false);
  };

  eventSource.onopen = () => {
    setOnlineStatus(true);
  };
}

setInterval(() => {
  fetchState();
}, 20000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fetchState();
  }
});

window.addEventListener('focus', () => {
  fetchState();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
    });
  });
}

fetchState().then(() => {
  setupSSE();
});
