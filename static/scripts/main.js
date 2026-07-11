// --- SOUND SYSTEM ---
const AudioManager = {
  soundFiles: {
    paper: 'sounds/paper.mp3',
    click: 'sounds/click.mp3',
    type: 'sounds/typing.mp3'
  },
  soundVolumes: {
    paper: 0.3,
    click: 0.2,
    type: 0.2
  },
  masters: {},
  audioPool: {},
  getMaster(type) {
    if (!this.masters[type]) {
      const audio = new Audio(this.soundFiles[type]);
      audio.preload = 'auto';
      audio.volume = this.soundVolumes[type] || 0.3;
      this.masters[type] = audio;
      this.audioPool[type] = [];
    }
    return this.masters[type];
  },
  play(type) {
    try {
      if (!this.soundFiles[type]) return;
      const master = this.getMaster(type);
      const pool = this.audioPool[type];
      let instance = pool.find(a => a.readyState >= 2 && a.paused);
      if (!instance) {
        instance = master.cloneNode(true);
        instance.volume = master.volume;
        pool.push(instance);
      }
      instance.currentTime = 0;
      instance.play().catch((err) => {
        console.error('Sound playback failed for', type, err);
      });
    } catch (error) {
      console.error('AudioManager error:', error);
    }
  }
};

function playSound(type) {
  AudioManager.play(type);
}

const recipeGrid = document.getElementById('recipe-grid');
const collectionsList = document.getElementById('collections-list');
const searchInput = document.getElementById('search-input');
const viewTitle = document.getElementById('view-title');
const ariaAnnouncer = document.getElementById('search-status');

// Modals
const recipeViewModal = document.getElementById('recipe-view-modal');
const editorModal = document.getElementById('editor-modal');
const cookingMode = document.getElementById('cooking-mode');

// View Elements
const viewRecipeTitle = document.getElementById('view-recipe-title');
const viewRecipeMeta = document.getElementById('view-recipe-meta');
const viewInstructions = document.getElementById('view-instructions');
const viewIngredientsList = document.getElementById('view-ingredients-list');
const viewServingsCount = document.getElementById('view-servings-count');

let currentRecipes = [];
let currentViewRecipe = null;
let currentBaseServings = 4;
let currentServings = 4;
let currentCookingRecipe = null;
let cookingTimerInterval = null;
let cookingTimerRemaining = 0;
let currentStepIndex = 0;
let currentGalleryIndex = 0;
let currentGalleryImages = [];
let galleryStartX = null;
let screenWakeLock = null;
let vegetableSpotlight = null;

const RECIPES_QUERY_CACHE_KEY = 'htmeal_last_recipe_query';
const RECIPE_CACHE_SIZE_LIMIT = 20;
const RECIPE_RENDER_CHUNK = 30;
const recipeCacheOrder = [];
let currentRecipeRenderIndex = 0;
let currentRecipeRenderList = [];
let recipeAutoLoading = false;

const USERNAME_PATTERN = /^[A-Za-zÀ-ÿ0-9 _.-]{3,30}$/;
const SESSION_TOKEN_STORAGE_KEY = 'htmeal_session_token';
const AppState = {
  currentUser: '',
  apiCache: { recipesByQuery: {}, collections: null },
  lastRecipeQuery: '',
  searchDebounceTimer: null
};
function isValidUsername(name) {
  const normalized = String(name || '').trim();
  return USERNAME_PATTERN.test(normalized);
}

function getStoredSessionUser() {
  try {
    return localStorage.getItem('htmeal_session_user') || '';
  } catch (error) {
    return '';
  }
}
function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
}
function saveStoredSessionUser(name) {
  try {
    if (name) {
      localStorage.setItem('htmeal_session_user', name);
    } else {
      localStorage.removeItem('htmeal_session_user');
    }
  } catch (error) {
    console.warn('Kon sessie niet bewaren', error);
  }
}
function saveStoredSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Kon sessietoken niet bewaren', error);
  }
}
function getCurrentUserName() {
  return AppState.currentUser || '';
}
function getKnownUsers() {
  try {
    const raw = localStorage.getItem('htmeal_user_list');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function announce(message) {
  if (!ariaAnnouncer) return;
  ariaAnnouncer.textContent = '';
  window.requestAnimationFrame(() => {
    ariaAnnouncer.textContent = message;
  });
}
function saveKnownUsers(list) {
  try {
    localStorage.setItem('htmeal_user_list', JSON.stringify(list.slice(0, 10)));
  } catch (error) {
    console.error('Kon bekende gebruikers niet opslaan', error);
  }
}
function addKnownUser(name) {
  const normalized = (name || '').trim();
  if (!normalized) return;
  const canonical = normalized;
  const users = getKnownUsers()
    .map(user => String(user || '').trim())
    .filter(Boolean)
    .filter(user => user.toLowerCase() !== canonical.toLowerCase());
  users.unshift(canonical);
  saveKnownUsers(users);
}
function updateUserDisplay() {
  const badge = document.getElementById('current-user-badge');
  const button = document.getElementById('btn-change-user');
  const name = getCurrentUserName();
  if (badge) {
    badge.innerHTML = name ? `Ingelogd als: <strong>${name}</strong>` : 'Geen gebruiker geselecteerd';
  }
  if (button) {
    button.textContent = name ? 'Account' : 'Inloggen';
  }
  window.currentCookbookUser = name;
}
function setCurrentUser(name) {
  const normalized = (name || '').trim();
  if (!normalized || !isValidUsername(normalized)) {
    AppState.currentUser = '';
    saveStoredSessionUser('');
    saveStoredSessionToken('');
    updateUserDisplay();
    return false;
  }
  AppState.currentUser = normalized;
  saveStoredSessionUser(normalized);
  updateUserDisplay();
  return true;
}
function getUserHeaders(isJson = false) {
  const headers = {
    Accept: 'application/json'
  };
  const currentUser = getCurrentUserName();
  const sessionToken = getStoredSessionToken();
  if (currentUser) {
    headers['X-User'] = currentUser;
  }
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

async function apiFetch(url, options = {}) {
  const init = {
    credentials: 'same-origin',
    headers: {
      ...getUserHeaders(options.isJson),
      ...options.headers
    },
    ...options
  };

  if (options.body && typeof options.body === 'object' && init.headers['Content-Type'] === 'application/json') {
    init.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, init);
    return response;
  } catch (error) {
    console.error('apiFetch failed:', error, url, init);
    throw error;
  }
}
window.getUserHeaders = getUserHeaders;
window.apiFetch = apiFetch;
updateUserDisplay();
const loginModal = document.getElementById('login-modal');
const authPanel = document.getElementById('auth-panel');
const accountPanel = document.getElementById('account-panel');
const accountUserNameText = document.getElementById('account-user-name');
const deleteAccountButton = document.getElementById('btn-delete-account');
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginCloseButton = document.getElementById('btn-close-login');
const loginLogoutButton = document.getElementById('btn-logout');
const knownUsersContainer = document.getElementById('known-users');

async function refreshAuthStatus() {
  try {
    const res = await apiFetch('/api/auth/status');
    if (!res.ok) {
      setCurrentUser('');
      saveStoredSessionToken('');
      showAuthModalState();
      return false;
    }

    const data = await res.json();
    const username = (data && data.user) ? String(data.user).trim() : '';
    if (username) {
      setCurrentUser(username);
      showAuthModalState();
      return true;
    }

    setCurrentUser('');
    saveStoredSessionToken('');
    showAuthModalState();
    return false;
  } catch (error) {
    console.error('Could not refresh auth status', error);
    return false;
  }
}

function renderKnownUsers() {
  if (!knownUsersContainer) return;
  const users = getKnownUsers();
  knownUsersContainer.innerHTML = '';
  if (!users.length) {
    knownUsersContainer.innerHTML = '<div style="color: var(--color-text-muted);">Nog geen gebruikers opgeslagen.</div>';
    return;
  }
  users.forEach(user => {
    const wrapper = document.createElement('div');
    wrapper.style = 'display:flex; gap:8px; align-items:center;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.style = 'padding: 0.5rem 0.75rem; text-align: left; flex:1;';
    btn.textContent = user;
    btn.addEventListener('click', () => {
      setCurrentUser(user);
      closeManagedModal(loginModal);
      AppState.apiCache.recipesByQuery = {};
      AppState.apiCache.collections = null;
      fetchRecipes(AppState.lastRecipeQuery);
      fetchCollections(true);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn';
    del.style = 'padding: 0.25rem 0.5rem; background: transparent; color: var(--color-accent); border: 1px solid rgba(230, 34, 34, 0.25);';
    del.textContent = '✖';
    del.title = `Verwijder gebruiker ${user}`;
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Weet je zeker dat je gebruiker '${user}' wilt verwijderen? Dit zal favorieten en eigendom ontkoppelen.`)) return;
      try {
        const res = await apiFetch('/api/delete_user', {
          method: 'POST',
          isJson: true,
          body: { user }
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          alert('Kon gebruiker niet verwijderen: ' + (data.error || res.statusText));
          return;
        }
        // Remove from known users list in localStorage
        const list = getKnownUsers().filter(u => u !== user);
        saveKnownUsers(list);
        renderKnownUsers();
        // If current user deleted themself, clear state
        if (getCurrentUserName() === user) {
          setCurrentUser('');
          AppState.apiCache.recipesByQuery = {};
          AppState.apiCache.collections = null;
          fetchRecipes(AppState.lastRecipeQuery);
        }
      } catch (err) {
        console.error(err);
        alert('Fout bij verwijderen gebruiker');
      }
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(del);
    knownUsersContainer.appendChild(wrapper);
  });
}
function showAuthModalState() {
  const loggedIn = !!getCurrentUserName();
  if (authPanel) authPanel.style.display = loggedIn ? 'none' : 'grid';
  if (accountPanel) accountPanel.style.display = loggedIn ? 'grid' : 'none';
  if (accountUserNameText) accountUserNameText.textContent = getCurrentUserName() || '';
  const title = document.getElementById('login-modal-title');
  const submit = document.getElementById('btn-login-submit');
  const toggle = document.getElementById('btn-toggle-register');
  if (loggedIn) {
    if (title) title.textContent = 'Account';
    if (submit) submit.textContent = 'Inloggen';
    if (toggle) toggle.style.display = 'none';
  } else {
    if (title) title.textContent = isRegisterMode ? 'Registreer' : 'Inloggen';
    if (submit) submit.textContent = isRegisterMode ? 'Account aanmaken' : 'Inloggen';
    if (toggle) toggle.style.display = 'inline';
  }
}

function openLoginModal() {
  if (!loginModal) return;
  if (loginUsernameInput) {
    loginUsernameInput.value = getCurrentUserName();
  }
  const error = document.getElementById('login-error');
  if (error) error.textContent = '';
  showAuthModalState();
  openManagedModal(loginModal);
}
function closeLoginModal() {
  if (!getCurrentUserName()) return;
  closeManagedModal(loginModal);
}
// Hide closing if user is required and no user is selected.
let isRegisterMode = false;
if (loginCloseButton) {
  loginCloseButton.addEventListener('click', closeLoginModal);
}
const toggleRegisterBtn = document.getElementById('btn-toggle-register');
if (toggleRegisterBtn) {
  toggleRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('login-modal-title');
    const submit = document.getElementById('btn-login-submit');
    const toggle = document.getElementById('btn-toggle-register');
    const known = document.getElementById('known-users-section');
    if (isRegisterMode) {
      title.textContent = 'Registreer';
      submit.textContent = 'Account aanmaken';
      toggle.textContent = 'Terug naar inloggen';
      if (known) known.style.display = 'none';
    } else {
      title.textContent = 'Inloggen';
      submit.textContent = 'Inloggen';
      toggle.textContent = 'Registreer hier';
      if (known) known.style.display = 'block';
    }
  });
}
if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = (loginUsernameInput ? loginUsernameInput.value.trim() : '').trim();
    const password = (document.getElementById('login-password') ? document.getElementById('login-password').value : '').trim();
    const error = document.getElementById('login-error');
    
    if (!username || !password) {
      if (error) error.textContent = 'Gebruikersnaam en wachtwoord zijn verplicht.';
      return;
    }
    
    try {
      if (!isValidUsername(username)) {
        if (error) error.textContent = 'Gebruik een geldige gebruikersnaam (3-30 letters, cijfers, spaties of ._-).';
        return;
      }
      if (password.length < 6) {
        if (error) error.textContent = 'Wachtwoord moet ten minste 6 tekens bevatten.';
        return;
      }
      const action = isRegisterMode ? 'register' : 'login';
      const res = await apiFetch('/api/auth', {
        method: 'POST',
        isJson: true,
        body: { username, password, action }
      });
      const data = await parseJsonResponse(res, {});
      
      if (!res.ok || data.error) {
        if (error) error.textContent = data.error || 'Authentificatie mislukt';
        return;
      }
      
      if (error) error.textContent = '';
      const loggedInUser = (data && data.username) ? String(data.username).trim() : username;
      setCurrentUser(loggedInUser);
      saveStoredSessionToken(data && data.session_token ? String(data.session_token).trim() : '');
      addKnownUser(loggedInUser);
      showAuthModalState();
      closeManagedModal(loginModal);
      AppState.apiCache.recipesByQuery = {};
      AppState.apiCache.collections = null;
      fetchRecipes(AppState.lastRecipeQuery);
      fetchCollections(true);
    } catch (e) {
      console.error(e);
      if (error) error.textContent = 'Verbindingsfout. Probeer opnieuw.';
    }
  });
}

const VEGETABLE_SEARCH_SYNONYMS = {
  'tomaat': ['tomaat', 'tomaten', 'tomato', 'tomatoes', 'toma'],
  'paprika': ['paprika', 'paprikaes', 'paprikas', 'bell pepper', 'bell peppers', 'sweet pepper', 'sweet peppers', 'pepper', 'peppers'],
  'courgette': ['courgette', 'courgettes', 'zucchini', 'zucchinis'],
  'komkommer': ['komkommer', 'komkommers', 'cucumber', 'cucumbers'],
  'aubergine': ['aubergine', 'aubergines', 'eggplant', 'eggplants'],
  'sperzieboon': ['sperzieboon', 'sperziebonen', 'green bean', 'green beans', 'string bean', 'string beans', 'snap bean', 'snap beans'],
  'snijboon': ['snijboon', 'snijbonen', 'runner bean', 'runner beans'],
  'boerenkool': ['boerenkool', 'kale'],
  'spruiten': ['spruiten', 'brussels sprout', 'brussels sprouts'],
  'asperge': ['asperge', 'asperges', 'asparagus'],
  'prei': ['prei', 'leek', 'leeks'],
  'witlof': ['witlof', 'chicory', 'endive', 'endives'],
  'pastinaak': ['pastinaak', 'parsnip', 'parsley root'],
  'maïs': ['maïs', 'mais', 'corn', 'maize']
};

function normalizeQuery(q) {
  return (q || '').trim().toLowerCase();
}

function normalizeVegetableSearch(veg) {
  const lower = normalizeQuery(veg);
  const match = Object.entries(VEGETABLE_SEARCH_SYNONYMS).find(([key, values]) => values.includes(lower));
  return match ? match[1][0] : lower;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function parseJsonResponse(response, fallback = {}) {
  const text = await response.text();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Kon JSON-reactie niet parsen', error, text);
    return { error: 'Unexpected server response' };
  }
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

function focusModal(modal) {
  if (!modal) return;
  const focusable = getFocusableElements(modal);
  if (focusable.length) {
    focusable[0].focus();
    return;
  }
  modal.focus();
}

function trapFocus(modal) {
  if (!modal) return;
  const focusable = getFocusableElements(modal);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  modal.addEventListener('keydown', function(event) {
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function openManagedModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  if (modal === cookingMode && cookingTimerInterval) {
    hideCookingTimerOverlay();
  }
  focusModal(modal);
  trapFocus(modal);
}

const cookingTimerOverlay = document.getElementById('cooking-timer-overlay');
let cookingTimerDrag = { active: false, offsetX: 0, offsetY: 0, moved: false };

function initCookingTimerDrag() {
  if (!cookingTimerOverlay) return;
  cookingTimerOverlay.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#btn-return-to-cooking')) return;
    cookingTimerDrag.active = true;
    cookingTimerDrag.moved = false;
    const rect = cookingTimerOverlay.getBoundingClientRect();
    cookingTimerDrag.offsetX = event.clientX - rect.left;
    cookingTimerDrag.offsetY = event.clientY - rect.top;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('pointermove', (event) => {
    if (!cookingTimerDrag.active) return;
    const dx = event.clientX - cookingTimerDrag.offsetX;
    const dy = event.clientY - cookingTimerDrag.offsetY;
    if (!cookingTimerDrag.moved && (Math.abs(dx - cookingTimerOverlay.offsetLeft) > 4 || Math.abs(dy - cookingTimerOverlay.offsetTop) > 4)) {
      cookingTimerDrag.moved = true;
    }
    const maxX = window.innerWidth - cookingTimerOverlay.offsetWidth - 8;
    const maxY = window.innerHeight - cookingTimerOverlay.offsetHeight - 8;
    cookingTimerOverlay.style.left = `${Math.min(Math.max(8, dx), maxX)}px`;
    cookingTimerOverlay.style.top = `${Math.min(Math.max(8, dy), maxY)}px`;
    cookingTimerOverlay.style.right = 'unset';
    cookingTimerOverlay.style.bottom = 'unset';
  });

  document.addEventListener('pointerup', () => {
    if (cookingTimerDrag.active) {
      cookingTimerDrag.active = false;
      document.body.style.userSelect = '';
    }
  });
}

initCookingTimerDrag();

function closeManagedModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  if (modal === cookingMode) {
    releaseWakeLock();
    if (cookingTimerInterval) {
      renderCookingTimerOverlay(document.getElementById('cooking-step-text')?.textContent || 'Timer actief');
      showCookingTimerOverlay();
    }
  }
}

function initModalKeyHandlers() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (loginModal?.classList.contains('active') && !getCurrentUserName()) {
      return;
    }

    if (editorModal?.classList.contains('active')) {
      closeManagedModal(editorModal);
      return;
    }

    if (recipeViewModal?.classList.contains('active')) {
      closeManagedModal(recipeViewModal);
      return;
    }

    if (cookingMode?.classList.contains('active')) {
      closeManagedModal(cookingMode);
    }
  });
}

function showCookingTimerOverlay() {
  if (!cookingTimerOverlay) return;
  cookingTimerOverlay.classList.add('active');
}

function hideCookingTimerOverlay() {
  if (!cookingTimerOverlay) return;
  cookingTimerOverlay.classList.remove('active');
}

function renderCookingTimerOverlay(stepText) {
  if (!cookingTimerOverlay) return;
  cookingTimerOverlay.innerHTML = `
    <div class="timer-mini">
      <strong id="cooking-timer-overlay-display">${formatTimerValue(cookingTimerRemaining)}</strong>
      <p class="timer-step">${escapeHtml(stepText)}</p>
      <button id="btn-return-to-cooking">Kookmodus</button>
    </div>
  `;
  const overlayButton = document.getElementById('btn-return-to-cooking');
  if (overlayButton) {
    overlayButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (currentCookingRecipe) {
        hideCookingTimerOverlay();
        openManagedModal(cookingMode);
      }
    });
  }
  cookingTimerOverlay.onclick = (event) => {
    if (cookingTimerDrag.moved) {
      cookingTimerDrag.moved = false;
      return;
    }
    if (event.target.closest('#btn-return-to-cooking')) return;
    if (currentCookingRecipe) {
      hideCookingTimerOverlay();
      openManagedModal(cookingMode);
    }
  };
}

function saveLastRecipeQuery(query) {
  try { localStorage.setItem(RECIPES_QUERY_CACHE_KEY, query || ''); } catch(e) {}
}

function loadLastRecipeQuery() {
  try { return localStorage.getItem(RECIPES_QUERY_CACHE_KEY) || ''; } catch(e) { return ''; }
}

function renderLoadingState(message = 'Laden van recepten...') {
  recipeGrid.innerHTML = `<p class="meta-text">${message}</p>`;
}

function renderErrorState(message) {
  recipeGrid.innerHTML = `<p class="meta-text" style="color: var(--color-accent);">${message}</p>`;
}

function debounce(fn, delay = 250) {
  clearTimeout(AppState.searchDebounceTimer);
  AppState.searchDebounceTimer = setTimeout(fn, delay);
}

const TAG_ALIASES = {
  'zonder vlees/vis': 'vegetarisch',
  'zonder vlees en vis': 'vegetarisch',
  'zonder vlees': 'vegetarisch',
  'zonder vis': 'vegetarisch',
  'vegetarisch': 'vegetarisch',
  'veggie': 'vegetarisch',
  'vegan': 'vegan',
  'italiaans': 'italiaans',
  'mediterraan': 'mediterraan'
};

const EXCLUDED_TAGS = new Set([
  'wat eten we vandaag',
  'bakken',
  'koken',
  'braden',
  'roerbakken',
  'stomen',
  'grillen',
  'roosteren',
  'sudderen',
  'smoren',
  'roerbak',
  'airfryer',
  'gratineren',
  'stoofpot',
  'snel',
  'easy',
  'gezond',
  'lunch',
  'diner',
  'ontbijt',
  'snelle maaltijd',
  'simpel',
  'budget',
  'maaltijd',
  'tussendoor'
]);

function normalizeTag(tag) {
  if (!tag) return '';
  const cleaned = tag.trim().toLowerCase();
  if (!cleaned) return '';
  if (EXCLUDED_TAGS.has(cleaned)) return '';
  return TAG_ALIASES[cleaned] || cleaned;
}

function collectTagCounts(recipes) {
  const tagsMap = {};

  recipes.forEach(r => {
    (r.tags || []).forEach(t => {
      const tag = normalizeTag(t);
      if (!tag) return;
      tagsMap[tag] = (tagsMap[tag] || 0) + 1;
    });
  });

  return tagsMap;
}

function buildCollectionEntries(tagsMap) {
  const grouped = [];
  const groups = [
    {
      label: 'italiaans / mediterraan',
      tags: ['italiaans', 'mediterraan'],
      search: 'italiaans'
    },
    {
      label: 'vegetarisch',
      tags: ['vegetarisch'],
      search: 'vegetarisch'
    }
  ];

  const remaining = { ...tagsMap };

  groups.forEach(group => {
    const present = group.tags.filter(tag => remaining[tag]);
    if (present.length > 1) {
      const count = present.reduce((sum, tag) => sum + remaining[tag], 0);
      grouped.push({ display: group.label, query: group.search, count });
      present.forEach(tag => delete remaining[tag]);
    }
  });

  Object.entries(remaining).forEach(([tag, count]) => {
    grouped.push({ display: tag, query: tag, count });
  });

  return grouped.sort((a, b) => b.count - a.count);
}

async function renderCollectionSidebar(recipes) {
  const tagsMap = collectTagCounts(recipes);
  const sortedTagEntries = buildCollectionEntries(tagsMap);

  collectionsList.innerHTML = '';
  // Add Mijn favorieten to Ontdek section for logged-in users
  const me = getCurrentUserName();
  if (me) {
    const ontdekList = document.getElementById('ontdek-list');
    const existingFav = ontdekList?.querySelector('[data-favorites-item]');
    if (!existingFav && ontdekList) {
      const favLi = document.createElement('li');
      favLi.className = 'nav-item';
      favLi.style.fontWeight = '700';
      favLi.textContent = 'Mijn favorieten';
      favLi.setAttribute('data-favorites-item', 'true');
      favLi.onclick = () => { fetchFavorites(); closeMobileSidebar(); };
      ontdekList.appendChild(favLi);
    }
  }
  const topTags = sortedTagEntries.slice(0, 12);
  topTags.forEach(({ display, query, count }) => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `<span>${display}</span><span class="collection-count">${count}</span>`;
    li.onclick = () => { searchInput.value = query; fetchRecipes(query); closeMobileSidebar(); };
    collectionsList.appendChild(li);
  });
  if (sortedTagEntries.length > 12) {
    const more = document.createElement('li');
    more.className = 'nav-item';
    more.style.fontWeight = '700';
    more.textContent = 'Meer collecties...';
    more.onclick = () => {
      more.remove();
      sortedTagEntries.slice(12).forEach(({ display, query, count }) => {
        const extraLi = document.createElement('li');
        extraLi.className = 'nav-item';
        extraLi.innerHTML = `<span>${display}</span><span class="collection-count">${count}</span>`;
        extraLi.onclick = () => { searchInput.value = query; fetchRecipes(query); closeMobileSidebar(); };
        collectionsList.appendChild(extraLi);
      });
    };
    collectionsList.appendChild(more);
  }
}

async function fetchFavorites() {
  const user = getCurrentUserName();
  if (!user) {
    openLoginModal();
    return;
  }
  renderLoadingState('Laden van favorieten...');
  try {
    const res = await apiFetch('/api/favorites');
    if (!res.ok) throw new Error('Kon favorieten niet laden');
    const favs = await res.json();
    currentRecipes = favs;
    renderRecipes(currentRecipes);
    document.getElementById('hero-section').style.display = 'none';
    viewTitle.innerHTML = `<span class="de-stijl-block ds-yellow" style="width:12px; height:12px; margin-right:12px;"></span>Mijn favorieten`;
  } catch (e) {
    console.error(e);
    renderErrorState('Kon favorieten niet laden');
  }
}

async function toggleFavorite(recipeId, shouldAdd) {
  const currentUser = getCurrentUserName();
  if (!currentUser) {
    openLoginModal();
    return;
  }
  const method = 'POST';
  try {
    const res = await apiFetch('/api/favorite', {
      method,
      isJson: true,
      body: { recipeId, action: shouldAdd ? 'add' : 'remove' }
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      if (data.error === 'Gebruikersnaam vereist') {
        openLoginModal();
        return;
      }
      if (res.status === 429) {
        alert('Te veel verzoeken, probeer het later opnieuw.');
        return;
      }
      alert('Kon favoriet niet bijwerken: ' + (data.error || res.statusText));
      return;
    }
    // Update currentRecipes and cached entries
    const updated = data.recipe;
    for (let i = 0; i < currentRecipes.length; i++) {
      if (String(currentRecipes[i].id) === String(updated.id)) {
        currentRecipes[i] = updated;
        break;
      }
    }
    // also update AppState.apiCache entries
    Object.keys(AppState.apiCache.recipesByQuery).forEach(k => {
      AppState.apiCache.recipesByQuery[k] = AppState.apiCache.recipesByQuery[k].map(r => r.id === updated.id ? updated : r);
    });
    // Update currentViewRecipe if it's the same recipe
    if (currentViewRecipe && String(currentViewRecipe.id) === String(updated.id)) {
      currentViewRecipe = updated;
      openRecipeView(updated);
    }
    renderRecipes(currentRecipes);
    
    // Show achievement unlock notifications
    if (data.awarded_achievements && data.awarded_achievements.length > 0) {
      data.awarded_achievements.forEach(achievementId => {
        // Fetch the achievement details from the achievements endpoint
        apiFetch('/api/achievements')
          .then(r => r.json())
          .then(d => {
            const achievement = d.achievements?.find(a => a.id === achievementId);
            if (achievement) {
              showAchievementUnlocked(achievement);
            }
          })
          .catch(e => console.error('Error fetching achievement:', e));
      });
    }
  } catch (e) {
    console.error(e);
    alert('Fout bij bijwerken favoriet');
  }
}

function toggleFavButtonClick() {
  if (!currentViewRecipe) return;
  const favoritedBy = currentViewRecipe.favorited_by || [];
  const currentUser = getCurrentUserName();
  const userIsFan = currentUser && favoritedBy.includes(currentUser);
  const shouldAdd = !userIsFan;
  toggleFavorite(currentViewRecipe.id, shouldAdd);
}

async function initApp() {
  const initialQuery = loadLastRecipeQuery();
  if (initialQuery) searchInput.value = initialQuery;
  const tasks = [fetchRecipes(initialQuery)];
  if (initialQuery) {
    tasks.push(fetchCollections());
  }
  await Promise.all(tasks);
}

initApp();

async function fetchCollections(force = false) {
  if (AppState.apiCache.collections && !force) {
    return AppState.apiCache.collections;
  }

  try {
    const res = await apiFetch('/api/recipes');
    if (!res.ok) throw new Error('Kan collecties niet laden');
    const recipes = await res.json();
    AppState.apiCache.collections = recipes;
    renderCollectionSidebar(recipes);
    return recipes;
  } catch (error) {
    console.error('Kan collecties niet laden', error);
    collectionsList.innerHTML = '<li class="nav-item" style="color: var(--color-text-muted);">Collecties niet beschikbaar</li>';
    return [];
  }
}

function openRecipeViewById(recipeId) {
  if(!recipeId) return;
  const recipe = currentRecipes.find(r => String(r.id) === String(recipeId));
  if(recipe) openRecipeView(recipe);
}

async function renderHeroSection(recipes) {
  const heroSection = document.getElementById('hero-section');
  if(!heroSection) return;

  const spotlight = await getVegetableSpotlight();
  const shuffled = [...recipes].sort(() => Math.random() - 0.5);
  const hasFeaturedCollection = Math.random() < 0.45;
  const heroRecipe = shuffled.find(r => r.image) || recipes[0] || null;
  const spotlightFallbackImage = spotlight?.spotlightImage || (spotlight?.seasonalVeggies?.[0]?.image) || 'assets/img/tomaat.webp';
  const heroImage = heroRecipe?.image || spotlightFallbackImage;
  const heroImageAlt = heroRecipe?.image
    ? `Receptfoto voor ${escapeHtml(heroRecipe.title)}`
    : `Seizoensgroenteafbeelding voor ${spotlight ? escapeHtml(spotlight.featured) : 'de seizoensgroente'}`;

  const tagCounts = {};
  recipes.forEach(r => {
    (r.tags || []).forEach(t => {
      const tag = t.trim().toLowerCase();
      if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const topTagEntries = Object.entries(tagCounts)
    .map(([tag, count]) => [normalizeTag(tag), count])
    .filter(([tag]) => tag)
    .reduce((acc, [tag, count]) => {
      acc[tag] = (acc[tag] || 0) + count;
      return acc;
    }, {});
  const sortedTopTags = Object.entries(topTagEntries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

  heroSection.innerHTML = '';
  if(!heroRecipe) return;

  const previewCard = document.createElement('div');
  previewCard.className = 'hero-card';
  previewCard.innerHTML = `
    <div>
      <span style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-text-muted); letter-spacing: 0.12em; text-transform: uppercase;">Top collecties</span>
      <h3>Populaire tags en thema's</h3>
      <p>Blader door de meest gebruikte collecties.</p>
      <div class="hero-collection-tags">${sortedTopTags.map(([tag, count]) => `<button type="button" class="btn btn-secondary collection-preview-tag" data-tag="${tag}">${tag} (${count})</button>`).join('')}</div>
    </div>
  `;
  heroSection.appendChild(previewCard);

  if(hasFeaturedCollection) {
    const featured = document.createElement('div');
    featured.className = 'hero-card hero-spotlight-card';
    featured.innerHTML = `
      <div>
        <span class="hero-card-label">Seizoenshoogtepunt</span>
        <h3>De groente van het seizoen is ${spotlight ? escapeHtml(spotlight.featured) : 'tomaat'}!</h3>
        <p>${spotlight ? `Probeer dit seizoen ${escapeHtml(spotlight.featured)} in een heerlijk recept.` : 'Ontdek een recept dat past bij het seizoen.'}</p>
      </div>
      <button type="button" class="btn btn-primary">Bekijk collectie</button>
    `;

    featured.querySelector('button').onclick = () => {
      const tag = heroRecipe.tags && heroRecipe.tags[0] ? heroRecipe.tags[0] : '';
      searchInput.value = tag;
      fetchRecipes(tag);
    };

    const imageCard = document.createElement('div');
    imageCard.className = 'hero-image-card hero-image-card--compact';
    imageCard.innerHTML = `
      <img src="${heroImage}" alt="${heroImageAlt}">
      <div class="hero-image-overlay"><span>${heroRecipe.title}</span></div>
    `;
    imageCard.onclick = () => openRecipeView(heroRecipe);

    const seasonalCard = document.createElement('div');
    seasonalCard.className = 'hero-card hero-seasonal-card';
    seasonalCard.innerHTML = `
      <div>
        <span class="hero-card-label">Seizoensgroenten</span>
        <h3>Wat is nu op z'n best?</h3>
        <p class="seasonal-card-copy">De groenten die nu op hun lekkerst zijn.</p>
        <div class="seasonal-veg-grid">
          ${spotlight && spotlight.seasonalVeggies && spotlight.seasonalVeggies.length > 0 ? spotlight.seasonalVeggies.map(v => `
            <button type="button" class="seasonal-veg-item" data-vegetable="${escapeHtml(v.name)}">
              <div class="seasonal-veg-image">
                ${v.image ? `<img src="${v.image}" alt="${escapeHtml(v.name)}">` : '<div class="seasonal-veg-fallback"></div>'}
                <span>${escapeHtml(v.name)}</span>
              </div>
            </button>
          `).join('') : '<div class="seasonal-veg-empty">Moment geduld, er zijn nog geen afbeeldingen beschikbaar.</div>'}
        </div>
      </div>
    `;

    heroSection.appendChild(featured);
    heroSection.appendChild(imageCard);
    heroSection.appendChild(seasonalCard);
    seasonalCard.querySelectorAll('.seasonal-veg-item').forEach(button => {
      button.addEventListener('click', () => {
        const veg = button.dataset.vegetable;
        if (!veg) return;
        const query = normalizeVegetableSearch(veg);
        searchInput.value = veg;
        fetchRecipes(query);
      });
    });
  } else {
    const card = document.createElement('div');
    card.className = 'hero-card';
    card.innerHTML = `
      <div>
        <span style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-text-muted); letter-spacing: 0.12em; text-transform: uppercase;">Willekeurige keuze</span>
        <h3>Een recept dat je nu moet proberen</h3>
        <p>${heroRecipe.description || 'Een frisse selectie uit HTMeal, rechtstreeks naar je tafel.'}</p>
      </div>
    `;
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-primary';
    viewButton.textContent = 'Bekijk recept';
    viewButton.onclick = () => openRecipeView(heroRecipe);
    card.appendChild(viewButton);

    const imageCard = document.createElement('div');
    imageCard.className = 'hero-image-card';
    imageCard.innerHTML = `
      <img src="${heroImage}" alt="${heroImageAlt}">
      <div class="hero-image-overlay"><span>${heroRecipe.title}</span></div>
    `;
    imageCard.onclick = () => openRecipeView(heroRecipe);

    heroSection.appendChild(card);
    heroSection.appendChild(imageCard);

    const seasonalCard = document.createElement('div');
    seasonalCard.className = 'hero-card hero-seasonal-card';
    seasonalCard.innerHTML = `
      <div>
        <span class="hero-card-label">Seizoensgroenten</span>
        <h3>Wat is nu op z'n best?</h3>
        <div class="seasonal-veg-grid">
          ${spotlight && spotlight.seasonalVeggies && spotlight.seasonalVeggies.length > 0 ? spotlight.seasonalVeggies.map(v => `
            <button type="button" class="seasonal-veg-item" data-vegetable="${escapeHtml(v.name)}">
              <div class="seasonal-veg-image">
                ${v.image ? `<img src="${v.image}" alt="${escapeHtml(v.name)}">` : '<div class="seasonal-veg-fallback"></div>'}
                <span>${escapeHtml(v.name)}</span>
              </div>
            </button>
          `).join('') : '<div class="seasonal-veg-empty">Moment geduld, er zijn nog geen afbeeldingen beschikbaar.</div>'}
        </div>
      </div>
    `;
    heroSection.appendChild(seasonalCard);
    seasonalCard.querySelectorAll('.seasonal-veg-item').forEach(button => {
      button.addEventListener('click', () => {
        const veg = button.dataset.vegetable;
        if (!veg) return;
        const query = normalizeVegetableSearch(veg);
        searchInput.value = veg;
        fetchRecipes(query);
      });
    });
  }
  heroSection.querySelectorAll('.collection-preview-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      searchInput.value = tag;
      fetchRecipes(tag);
    });
  });}

async function fetchRecipes(query = '') {
  const normalized = normalizeQuery(query);
  AppState.lastRecipeQuery = query;
  renderLoadingState();

  if (AppState.apiCache.recipesByQuery[normalized]) {
    currentRecipes = [...AppState.apiCache.recipesByQuery[normalized]];
    if (!normalized) currentRecipes = shuffleArray(currentRecipes);
    renderRecipes(currentRecipes);
    if (!normalized) {
      renderHeroSection(currentRecipes);
      document.getElementById('hero-section').style.display = 'grid';
    } else {
      document.getElementById('hero-section').style.display = 'none';
    }
    const titleText = query ? query : 'Alle recepten';
    const blockColor = query ? 'ds-blue' : 'ds-yellow';
    viewTitle.innerHTML = `<span class="de-stijl-block ${blockColor}" style="width:12px; height:12px; margin-right:12px;"></span>${titleText}`;
    saveLastRecipeQuery(query);
    return;
  }

  try {
    const res = await apiFetch(`/api/recipes?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Kan recepten niet laden');
    const recipes = await res.json();
    AppState.apiCache.recipesByQuery[normalized] = recipes;
    const existingIndex = recipeCacheOrder.indexOf(normalized);
    if (existingIndex >= 0) recipeCacheOrder.splice(existingIndex, 1);
    recipeCacheOrder.push(normalized);
    if (recipeCacheOrder.length > RECIPE_CACHE_SIZE_LIMIT) {
      const oldest = recipeCacheOrder.shift();
      delete AppState.apiCache.recipesByQuery[oldest];
    }
    currentRecipes = normalized ? recipes : shuffleArray(recipes);
    renderRecipes(currentRecipes);
    if (!normalized) {
      renderHeroSection(currentRecipes);
      document.getElementById('hero-section').style.display = 'grid';
      if (!AppState.apiCache.collections) {
        AppState.apiCache.collections = recipes;
        renderCollectionSidebar(recipes);
      }
    } else {
      document.getElementById('hero-section').style.display = 'none';
    }
    const titleText = query ? query : 'Alle recepten';
    const blockColor = query ? 'ds-blue' : 'ds-yellow';
    viewTitle.innerHTML = `<span class="de-stijl-block ${blockColor}" style="width:12px; height:12px; margin-right:12px;"></span>${titleText}`;
    saveLastRecipeQuery(query);
  } catch (e) {
    console.error('Kon recepten niet laden', e);
    renderErrorState('Kon recepten niet laden. Controleer je verbinding of probeer opnieuw.');
  }
}

function closeMobileSidebar() {
  if (window.innerWidth <= 980 && sidebar) {
    sidebar.classList.remove('open');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('active');
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'false');
  }
}

function openMobileSidebar() {
  if (sidebar) {
    sidebar.classList.add('open');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.classList.add('active');
    if (sidebarToggle) sidebarToggle.setAttribute('aria-expanded', 'true');
  }
}

function clearSearchAndGoHome() {
  searchInput.value = '';
  fetchRecipes('');
  closeMobileSidebar();
}

// Brand animation - HTMeal <-> Home
function initializeBrandAnimation() {
  const brandEl = document.getElementById('brand-home');
  if (!brandEl) return;
  
  const brandText = brandEl.querySelector('.brand-text');
  const originalText = 'HTMeal';
  const hoverText = 'Home';
  let isAnimating = false;
  
  function animateToText(fromText, toText, callback) {
    if (isAnimating) return;
    isAnimating = true;
    
    const fromChars = fromText.split('');
    const toChars = toText.split('');
    const maxLen = Math.max(fromChars.length, toChars.length);
    
    let step = 0;
    const animationInterval = setInterval(() => {
      let displayText = '';
      
      for (let i = 0; i < maxLen; i++) {
        if (i < step && toChars[i]) {
          displayText += toChars[i];
        } else if (i >= step && fromChars[i]) {
          displayText += fromChars[i];
        }
      }
      
      brandText.textContent = displayText;
      step++;
      
      if (step > maxLen) {
        clearInterval(animationInterval);
        brandText.textContent = toText;
        isAnimating = false;
        if (callback) callback();
      }
    }, 80);
  }
  
  brandEl.addEventListener('mouseenter', () => {
    if (!isAnimating && brandText.textContent === originalText) {
      animateToText(originalText, hoverText);
    }
  });
  
  brandEl.addEventListener('mouseleave', () => {
    if (!isAnimating && brandText.textContent !== originalText) {
      animateToText(brandText.textContent, originalText);
    }
  });
}

// Initialize brand animation when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeBrandAnimation);
} else {
  initializeBrandAnimation();
}

async function getVegetableSpotlight() {
  if (vegetableSpotlight) return vegetableSpotlight;
  try {
    const res = await apiFetch('/api/groentenkalender');
    if (!res.ok) throw new Error('Kan groentenkalender niet laden');
    const data = await res.json();
    vegetableSpotlight = formatVegetableSpotlight(data);
    return vegetableSpotlight;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function chooseRandomImage(imageEntry) {
  if (!imageEntry) return null;
  if (Array.isArray(imageEntry)) {
    return imageEntry[Math.floor(Math.random() * imageEntry.length)];
  }
  return imageEntry;
}

function getVegetableImagePath(vegetable, imageMap) {
  if (!vegetable) return null;
  if (vegetable.image) return chooseRandomImage(vegetable.image);
  const key = String(vegetable.name || '').trim().toLowerCase();
  if (!key || !imageMap) return null;
  return chooseRandomImage(imageMap[key]);
}

function formatVegetableSpotlight(data) {
  if (!data || !Array.isArray(data.calendar) || data.calendar.length === 0) return null;
  const today = new Date();
  const monthNames = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  const currentMonth = monthNames[today.getMonth()];
  let spotlight = data.calendar.find(entry => String(entry.month).toLowerCase() === currentMonth);
  if (!spotlight) spotlight = data.calendar[0];
  const imageMap = Object.fromEntries(Object.entries(data.vegetableImages || {}).map(([name, img]) => [String(name).toLowerCase(), img]));
  const featured = spotlight.featured || (spotlight.vegetables && spotlight.vegetables[0] && spotlight.vegetables[0].name) || '';
  const featuredEntry = (spotlight.vegetables || []).find(v => String(v.name).toLowerCase() === String(featured).toLowerCase()) || {};
  const featuredStatus = featuredEntry.status || '';
  const seasonalVeggies = (spotlight.vegetables || [])
    .filter(v => v.name && typeof v.status === 'string' && v.status.toLowerCase().includes('seizoen'))
    .slice(0, 6)
    .map(v => ({
      ...v,
      image: getVegetableImagePath(v, imageMap),
      name: v.name
    }));
  const seizoensgroente = seasonalVeggies.map(v => v.name).join(', ');
  const description = `Deze week is ${featured}${featuredStatus ? ` (${featuredStatus})` : ''} in de groentenspotlight.`;
  const subline = `${featured}${featuredStatus ? ` (${featuredStatus})` : ''} is seizoensgroente in week ${spotlight.week} van ${spotlight.month}.`;
  const spotlightImage = getVegetableImagePath(featuredEntry, imageMap) || (seasonalVeggies[0] && seasonalVeggies[0].image) || null;
  return { featured, month: spotlight.month, week: spotlight.week, subline, description, featuredStatus, seizoensgroente, seasonalVeggies, spotlightImage };
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    screenWakeLock = await navigator.wakeLock.request('screen');
    screenWakeLock.addEventListener('release', () => {
      screenWakeLock = null;
    });
  } catch (err) {
    console.warn('Wake lock kan niet worden aangevraagd:', err);
  }
}

function releaseWakeLock() {
  if (!screenWakeLock) return;
  screenWakeLock.release().catch(() => {}).finally(() => {
    screenWakeLock = null;
  });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && cookingMode.classList.contains('active')) {
    requestWakeLock();
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange);

function normalizeRecipeNotes(recipe) {
  if (!recipe) return [];
  const notesFromArray = Array.isArray(recipe.notes) ? recipe.notes : [];
  if (notesFromArray.length) {
    return notesFromArray
      .map(entry => {
        if (typeof entry === 'string') {
          return entry.trim() ? { text: entry.trim(), author: '' } : null;
        }
        if (entry && typeof entry === 'object') {
          const text = typeof entry.text === 'string' ? entry.text.trim() : '';
          const author = typeof entry.author === 'string' ? entry.author.trim() : '';
          return text ? { text, author } : null;
        }
        return null;
      })
      .filter(Boolean);
  }
  const legacyNote = typeof recipe.note === 'string' ? recipe.note.trim() : '';
  return legacyNote ? [{ text: legacyNote, author: recipe.owner || '' }] : [];
}

function getRecipeNotes(recipe) {
  return normalizeRecipeNotes(recipe);
}

function getCurrentUserDisplayName() {
  return getCurrentUserName() || 'Gast';
}

function buildNoteEntry(text, author = getCurrentUserDisplayName()) {
  return { text: text.trim(), author: author.trim() || 'Gast' };
}

function getRecipeNotePreview(recipe) {
  const notes = getRecipeNotes(recipe);
  if (!notes.length) return '';
  const latest = notes[notes.length - 1];
  const text = latest.text.length > 80 ? latest.text.slice(0, 80) + '…' : latest.text;
  return latest.author ? `${latest.author}: ${text}` : text;
}

function renderRecipeNotesMarkup(recipe) {
  const notes = getRecipeNotes(recipe);
  if (!notes.length) return '';
  return `
    <div style="display:grid; gap:8px; margin:8px 0 10px;">
      ${notes.map(note => `
        <div style="background: var(--color-primary-soft); border-left: 3px solid var(--color-primary); padding: 8px 10px; border-radius: 4px;">
          <div style="font-size: 0.8rem; color: var(--color-text); margin-bottom: 4px;">${escapeHtml(note.author || 'Notitie')}</div>
          <div style="font-size: 0.95rem; color: var(--color-text); white-space: pre-wrap;">${escapeHtml(note.text)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecipeCard(recipe, index) {
  const card = document.createElement('article');
  
  // Magazine-style visual randomness
  let classes = ['recipe-card'];
  if (index % 7 === 0) classes.push('washi-tape');
  if (recipe.title.toLowerCase().includes('quick') || index % 11 === 0) classes.push('sticky-note');
  
  card.className = classes.join(' ');
  card.onclick = () => openRecipeView(recipe);
  
  // Try tags first, fallback to collections
  const tagsList = recipe.tags && recipe.tags.length > 0 ? recipe.tags : recipe.collections || [];
  const tags = tagsList.slice(0, 3).map(t => `<span class="tag clickable" onclick='onCollectionTagClick(event, ${JSON.stringify(t)})'>${t}</span>`).join('');
  
  const primaryImage = getPrimaryRecipeImage(recipe);
  let imgHtml = '';
  if (primaryImage) {
      imgHtml = `<div class="recipe-card-image"><img src="${primaryImage}" loading="lazy" alt="Afbeelding van het recept ${escapeHtml(recipe.title)}"></div>`;
  }
  const notePreview = getRecipeNotePreview(recipe);
  const noteHtml = notePreview ? `<div class="recipe-card-note">${escapeHtml(notePreview)}</div>` : '';
  
  // Favorite stickers
  const favoritedBy = recipe.favorited_by || [];
  const currentUser = getCurrentUserName();
  const userIsFan = currentUser && favoritedBy.includes(currentUser);
  let stickersHtml = '';
  if (favoritedBy.length > 0) {
    const stickerList = favoritedBy.map(name => {
      const stickerText = name === currentUser ? 'Jouw favoriet' : `${escapeHtml(name)}'s favoriet`;
      const bgColor = name === currentUser ? 'var(--color-primary-soft)' : 'var(--color-secondary-soft)';
      const textColor = name === currentUser ? 'var(--color-accent)' : 'var(--color-secondary)';
      return `<span class="favorite-sticker" style="background: ${bgColor}; color: ${textColor}; display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; margin-right: 6px; margin-bottom: 4px; font-weight: 500;">${stickerText}</span>`;
    }).join('');
    stickersHtml = `<div class="recipe-card-stickers" style="margin-bottom: 8px;">${stickerList}</div>`;
  }
  
  card.innerHTML = `
    ${imgHtml}
    <h3 class="recipe-card-title">${escapeHtml(recipe.title || 'Ongetiteld')}</h3>
    <p class="meta-text" style="color: var(--color-text); text-transform:none; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(recipe.description || '')}</p>
    ${stickersHtml}
    ${noteHtml}
    <div class="recipe-card-meta meta-text" style="margin-bottom: 12px;">
      <span>${recipe.cooking_time ? recipe.cooking_time + 'm' : ''}</span>
      <span>${recipe.servings ? recipe.servings + ' pers.' : ''}</span>
    </div>
    <div class="recipe-card-meta" style="margin-top:auto;">${tags}</div>
  `;
  return card;
}

function appendRecipeCards(limit = RECIPE_RENDER_CHUNK) {
  if (recipeAutoLoading) return;
  if (currentRecipeRenderIndex >= currentRecipeRenderList.length) return;

  recipeAutoLoading = true;
  const fragment = document.createDocumentFragment();
  const end = Math.min(currentRecipeRenderIndex + limit, currentRecipeRenderList.length);
  for (let idx = currentRecipeRenderIndex; idx < end; idx++) {
    fragment.appendChild(renderRecipeCard(currentRecipeRenderList[idx], idx));
  }
  currentRecipeRenderIndex = end;
  recipeGrid.appendChild(fragment);
  recipeAutoLoading = false;
}

function handleRecipeScroll() {
  if (recipeAutoLoading || currentRecipeRenderIndex >= currentRecipeRenderList.length) return;
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 700;
  if (nearBottom) {
    appendRecipeCards();
  }
}

function renderRecipes(recipes) {
  recipeGrid.innerHTML = '';
  currentRecipeRenderList = recipes;
  currentRecipeRenderIndex = 0;
  if (recipes.length === 0) {
    recipeGrid.innerHTML = '<p class="meta-text">Geen recepten gevonden. Probeer een andere zoekopdracht.</p>';
    announce(AppState.lastRecipeQuery ? `Geen recepten gevonden voor ${AppState.lastRecipeQuery}.` : 'Geen recepten gevonden.');
    return;
  }
  appendRecipeCards();
  announce(`${recipes.length} recepten geladen voor ${AppState.lastRecipeQuery || 'je zoekopdracht'}.`);
}

window.onCollectionTagClick = function(event, tag) {
  event.stopPropagation();
  searchInput.value = tag;
  fetchRecipes(tag);
  closeMobileSidebar();
};

// --- RECIPE VIEW ---
function canEditRecipe(recipe) {
  if (!recipe) return false;
  return !!getCurrentUserName();
}

function animateRecipeTransition(callback) {
  const modal = recipeViewModal;
  const body = modal.querySelector('.recipe-modal-body');
  if (body) {
    body.style.animation = 'recipeTransitionOut 0.3s ease-out forwards';
    setTimeout(() => {
      callback();
      body.style.animation = 'recipeTransitionIn 0.3s ease-out forwards';
    }, 300);
  } else {
    callback();
  }
}

function openRecipeView(recipe) {
  currentViewRecipe = recipe;
  currentGalleryIndex = 0;
  currentGalleryImages = getRecipeImages(recipe);
  
  // Add arrow key navigation for recipes
  if (!window.recipeViewKeyHandler) {
    window.recipeViewKeyHandler = (e) => {
      if (!currentViewRecipe || !recipeViewModal.classList.contains('active')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const currentIndex = currentRecipes.findIndex(r => String(r.id) === String(currentViewRecipe.id));
        if (currentIndex === -1) return;
        let nextIndex = currentIndex + (e.key === 'ArrowRight' ? 1 : -1);
        if (nextIndex < 0) nextIndex = currentRecipes.length - 1;
        if (nextIndex >= currentRecipes.length) nextIndex = 0;
        animateRecipeTransition(() => openRecipeView(currentRecipes[nextIndex]));
      }
    };
    document.addEventListener('keydown', window.recipeViewKeyHandler);
  }

  const tagsHtml = (recipe.tags || []).map(t => `<span class="recipe-tag clickable" onclick='onCollectionTagClick(event, ${JSON.stringify(t)})'>${escapeHtml(t)}</span>`).join('');
  const notesHtml = renderRecipeNotesMarkup(recipe) ? `<div class="recipe-note-card"><strong>Notities</strong>${renderRecipeNotesMarkup(recipe)}</div>` : '';
  const currentOwner = recipe.owner ? String(recipe.owner).trim() : null;
  const ownerInfo = currentOwner ? `<div class="recipe-owner" style="font-size: 0.8rem; color: var(--color-text-muted);">Toegevoegd door ${escapeHtml(currentOwner)}</div>` : '';
  const canEdit = canEditRecipe(recipe);
  
  // Favorite button and stickers
  const currentUser = getCurrentUserName();
  const favoritedBy = recipe.favorited_by || [];
  const userIsFan = currentUser && favoritedBy.includes(currentUser);
  const favButtonText = userIsFan ? 'In favorieten' : 'Favoriet';
  const favButtonClass = userIsFan ? 'btn btn-small btn-favorite-active' : 'btn btn-small btn-favorite';
  const favButtonHtml = currentUser ? `<button onclick="toggleFavButtonClick()" class="${favButtonClass}">${favButtonText}</button>` : '';
  
  // Show all users who favorited
  let stickersHtml = '';
  if (favoritedBy.length > 0) {
    const stickerLabels = favoritedBy.map(name => name === currentUser ? 'Jou' : escapeHtml(name)).join(', ');
    stickersHtml = `<div style="margin-top: 8px; font-size: 0.95rem; color: var(--color-accent);">Favoriet van: ${stickerLabels}</div>`;
  }

  viewRecipeTitle.innerHTML = `
    <div class="recipe-title-row">
      <div>
        <h1>${escapeHtml(recipe.title)}</h1>
        <div class="recipe-tags">${tagsHtml}</div>
      </div>
      ${notesHtml}
    </div>
    <div style="margin-top: 16px; display:flex; justify-content:flex-start; align-items:center; gap: 12px; flex-wrap:wrap;">
      <div style="display:flex; flex-wrap:wrap; gap: 10px; align-items:center;">
        ${ownerInfo}
        ${favButtonHtml}
      </div>
      <div style="display:flex; gap: 8px; align-items:center; flex-wrap:wrap;">
        <button onclick="printRecipe(currentViewRecipe)" class="btn" type="button" title="Print dit recept">Afdrukken</button>
        ${canEdit ? `<button onclick="editCurrentRecipe()" class="btn btn-primary">Bewerk recept</button>` : `<span style="font-size:0.95rem; color: var(--color-text-muted);">Log in om dit recept te bewerken</span>`}
      </div>
    </div>
  `;

  const gallery = document.getElementById('view-recipe-gallery');
  if (gallery) {
    renderRecipeGallery(recipe, gallery);
  }

  viewRecipeMeta.innerHTML = `
    <div class="recipe-meta-row">
      <div class="recipe-card-stats">
        <div class="recipe-card-stat"><small>TIJD</small><strong>${recipe.cooking_time || '??'} M</strong></div>
        <div class="recipe-card-stat"><small>PERSONEN</small><strong>${recipe.servings || 4}</strong></div>
      </div>
      <div class="recipe-meta-actions">
        <div class="recipe-source">
          <span>BRON:</span>
          ${(() => {
            if (!recipe.source) return '<span class="recipe-no-source">Onbekend</span>';
            try {
              const url = new URL(recipe.source);
              return `<a href="${escapeHtml(recipe.source)}" target="_blank">${escapeHtml(url.hostname.replace(/^www\./, ''))}</a>`;
            } catch {
              return `<span>${escapeHtml(recipe.source)}</span>`;
            }
          })()}
        </div>
      </div>
    </div>
  `;
  
  currentServings = recipe.servings || 4;
  currentBaseServings = currentServings;
  viewServingsCount.textContent = currentServings;
  
  renderIngredients();
  
  viewInstructions.innerHTML = '';
  if(recipe.instructions) {
    recipe.instructions.forEach((inst, idx) => {
      const div = document.createElement('div');
      div.className = 'instruction-step';
      div.innerHTML = `<div class="step-num">${idx + 1}.</div><div>${inst}</div>`;
      viewInstructions.appendChild(div);
    });
  }
  
  playSound('paper');
  
  // Add or update navigation arrows
  const modal = recipeViewModal;
  let prevArrow = modal.querySelector('.recipe-nav-prev');
  let nextArrow = modal.querySelector('.recipe-nav-next');
  
  if (!prevArrow) {
    prevArrow = document.createElement('button');
    prevArrow.className = 'recipe-nav-prev';
    prevArrow.innerHTML = '‹';
    prevArrow.style.cssText = `
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.25);
      color: #fff;
      border: 2px solid rgba(255, 255, 255, 0.4);
      font-size: 1.8rem;
      padding: 8px 10px;
      cursor: pointer;
      z-index: 100;
      transition: all 0.3s ease;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
    `;
    prevArrow.onmouseover = () => {
      prevArrow.style.background = 'rgba(0, 0, 0, 0.5)';
      prevArrow.style.borderColor = 'rgba(255, 255, 255, 0.8)';
      prevArrow.style.transform = 'translateY(-50%) scale(1.1)';
    };
    prevArrow.onmouseout = () => {
      prevArrow.style.background = 'rgba(0, 0, 0, 0.25)';
      prevArrow.style.borderColor = 'rgba(255, 255, 255, 0.4)';
      prevArrow.style.transform = 'translateY(-50%) scale(1)';
    };
    prevArrow.onclick = (e) => {
      e.stopPropagation();
      const currentIndex = currentRecipes.findIndex(r => String(r.id) === String(currentViewRecipe.id));
      if (currentIndex > 0) {
        animateRecipeTransition(() => openRecipeView(currentRecipes[currentIndex - 1]));
      } else if (currentIndex >= 0) {
        animateRecipeTransition(() => openRecipeView(currentRecipes[currentRecipes.length - 1]));
      }
    };
    modal.appendChild(prevArrow);
  }
  
  if (!nextArrow) {
    nextArrow = document.createElement('button');
    nextArrow.className = 'recipe-nav-next';
    nextArrow.innerHTML = '›';
    nextArrow.style.cssText = `
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.25);
      color: #fff;
      border: 2px solid rgba(255, 255, 255, 0.4);
      font-size: 1.8rem;
      padding: 8px 10px;
      cursor: pointer;
      z-index: 100;
      transition: all 0.3s ease;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
    `;
    nextArrow.onmouseover = () => {
      nextArrow.style.background = 'rgba(0, 0, 0, 0.5)';
      nextArrow.style.borderColor = 'rgba(255, 255, 255, 0.8)';
      nextArrow.style.transform = 'translateY(-50%) scale(1.1)';
    };
    nextArrow.onmouseout = () => {
      nextArrow.style.background = 'rgba(0, 0, 0, 0.25)';
      nextArrow.style.borderColor = 'rgba(255, 255, 255, 0.4)';
      nextArrow.style.transform = 'translateY(-50%) scale(1)';
    };
    nextArrow.onclick = (e) => {
      e.stopPropagation();
      const currentIndex = currentRecipes.findIndex(r => String(r.id) === String(currentViewRecipe.id));
      if (currentIndex < currentRecipes.length - 1) {
        animateRecipeTransition(() => openRecipeView(currentRecipes[currentIndex + 1]));
      } else if (currentIndex >= 0) {
        animateRecipeTransition(() => openRecipeView(currentRecipes[0]));
      }
    };
    modal.appendChild(nextArrow);
  }
  
  openManagedModal(recipeViewModal);
}

function renderRecipeGallery(recipe, gallery) {
  currentGalleryImages = getRecipeImages(recipe);

  if (currentGalleryImages.length === 0) {
    gallery.innerHTML = `<div class="recipe-gallery-placeholder" tabindex="0">Geen foto beschikbaar. Klik hier om er eentje toe te voegen.</div>`;
    const placeholderEl = gallery.querySelector('.recipe-gallery-placeholder');
    if (placeholderEl) {
      placeholderEl.addEventListener('click', () => editCurrentRecipe());
      placeholderEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editCurrentRecipe();
        }
      });
    }
    return;
  }

  const track = document.createElement('div');
  track.className = 'recipe-gallery-track';
  // Position track by pixel offset for reliable transitions
  const galleryWidth = gallery.clientWidth || 0;
  track.style.transform = `translateX(-${currentGalleryIndex * galleryWidth}px)`;

  currentGalleryImages.forEach((src, index) => {
      const item = document.createElement('div');
      item.className = 'recipe-gallery-item';
      item.innerHTML = `<img src="${escapeHtml(src)}" loading="lazy" alt="Foto ${index + 1} van ${escapeHtml(recipe.title)}">`;
      item.addEventListener('click', () => openImageLightbox(index));
      track.appendChild(item);
    });
  gallery.innerHTML = '';
  gallery.appendChild(track);

  // If the browser supports CSS scroll-snap, enable a scroll-based fallback
  const supportsScrollSnap = typeof CSS !== 'undefined' && (CSS.supports('scroll-snap-type', 'x mandatory') || CSS.supports('scroll-snap-type', 'x proximity'));
  if (supportsScrollSnap) {
    gallery.classList.add('gallery-scroll-snap');
    gallery.style.overflowX = 'auto';
    gallery.style.webkitOverflowScrolling = 'touch';
    gallery.style.scrollBehavior = 'smooth';
    // remove transform-based positioning to allow native scrolling
    track.style.transform = '';
    track.style.transition = 'none';
    // ensure children have fixed width
    requestAnimationFrame(() => {
      const containerRect = gallery.getBoundingClientRect();
      const containerWidth = Math.max(0, Math.round(containerRect.width));
      const itemEls = Array.from(track.children || []);
      itemEls.forEach((el) => {
        el.style.flex = '0 0 ' + containerWidth + 'px';
        el.style.maxWidth = containerWidth + 'px';
        el.style.boxSizing = 'border-box';
        el.style.scrollSnapAlign = 'center';
      });
    });
  }

  // Ensure items are exactly the gallery width to avoid visible seams between slides
  requestAnimationFrame(() => {
    const containerRect = gallery.getBoundingClientRect();
    const containerWidth = Math.max(0, Math.round(containerRect.width));
    const itemEls = Array.from(track.children || []);
    if (itemEls.length) {
      itemEls.forEach((el) => {
        el.style.flex = '0 0 ' + containerWidth + 'px';
        el.style.maxWidth = containerWidth + 'px';
        el.style.boxSizing = 'border-box';
      });
      track.style.width = (containerWidth * itemEls.length) + 'px';
      // Position the track exactly at the current index
      track.style.transform = `translateX(-${currentGalleryIndex * containerWidth}px)`;
    }
  });

  if (currentGalleryImages.length > 1) {
    const indicator = document.createElement('div');
    indicator.className = 'recipe-gallery-indicator';
    indicator.style.cssText = 'margin-top: 10px; font-size: 0.82rem; color: var(--color-text-muted);';
    indicator.textContent = `${currentGalleryImages.length} foto's • klik of gebruik pijlen`;
    gallery.appendChild(indicator);

    const nav = document.createElement('div');
    nav.className = 'recipe-gallery-nav';
    nav.innerHTML = `
      <button type="button" class="gallery-prev" aria-label="Vorige foto">◀</button>
      <button type="button" class="gallery-next" aria-label="Volgende foto">▶</button>
    `;
    gallery.appendChild(nav);

    const prevBtn = nav.querySelector('.gallery-prev');
    const nextBtn = nav.querySelector('.gallery-next');
    const updateIndicator = () => {
      indicator.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length} foto's • klik of gebruik pijlen`;
    };
    if (prevBtn) prevBtn.onclick = () => changeGalleryIndex(-1, track, updateIndicator);
    if (nextBtn) nextBtn.onclick = () => changeGalleryIndex(1, track, updateIndicator);

    gallery.addEventListener('pointerdown', (event) => {
      galleryStartX = event.clientX;
    });
    gallery.addEventListener('pointerup', (event) => {
      if (galleryStartX === null) return;
      const delta = event.clientX - galleryStartX;
      galleryStartX = null;
      if (Math.abs(delta) > 40) {
        changeGalleryIndex(delta < 0 ? 1 : -1, track, updateIndicator);
      }
    });

    gallery.addEventListener('pointerleave', () => {
      galleryStartX = null;
    });
  }
}

function changeGalleryIndex(delta, track, onChange) {
  if (!currentGalleryImages.length) return;
  currentGalleryIndex = (currentGalleryIndex + delta + currentGalleryImages.length) % currentGalleryImages.length;
  if (track) {
    // calculate using the gallery's visible width so we always snap exactly
    const container = track.parentElement;
    let width = 0;
    if (container) width = Math.round(container.clientWidth || container.getBoundingClientRect().width || 0);
    // fallback to first child width if container width is zero
    if (!width && track.children && track.children.length) {
      const first = track.children[0];
      const rect = first.getBoundingClientRect();
      width = Math.round(rect.width) || Math.round(parseInt(first.style.flexBasis || 0, 10)) || 0;
    }
    // If using scroll-snap fallback, set scrollLeft on the gallery instead of transform
    const galleryEl = container;
    if (galleryEl && galleryEl.classList && galleryEl.classList.contains('gallery-scroll-snap')) {
      try {
        galleryEl.scrollLeft = currentGalleryIndex * width;
      } catch (e) {
        track.style.transform = `translateX(-${currentGalleryIndex * width}px)`;
      }
    } else {
      track.style.transform = `translateX(-${currentGalleryIndex * width}px)`;
    }
  }
  if (onChange) {
    onChange();
  }
}

// Ensure gallery items and track are sized exactly to the container to avoid seams
function updateGalleryLayout(gallery, track) {
  if (!gallery || !track) return;
  const containerWidth = Math.max(0, Math.round(gallery.clientWidth || gallery.getBoundingClientRect().width || 0));
  const items = Array.from(track.children || []);
  if (!items.length) return;
  items.forEach((el) => {
    el.style.flex = '0 0 ' + containerWidth + 'px';
    el.style.maxWidth = containerWidth + 'px';
    el.style.boxSizing = 'border-box';
  });
  track.style.width = (containerWidth * items.length) + 'px';
  // force reflow then snap exactly
  track.getBoundingClientRect();
  track.style.transform = `translateX(-${currentGalleryIndex * containerWidth}px)`;
}

// Bind a single resize handler to keep layout correct across resizes/orientation changes
if (!window._recipeGalleryResizeBound) {
  window._recipeGalleryResizeBound = true;
  window.addEventListener('resize', () => {
    const gallery = document.getElementById('view-recipe-gallery');
    if (!gallery) return;
    const track = gallery.querySelector('.recipe-gallery-track');
    if (track) updateGalleryLayout(gallery, track);
  });
}

function renderEditorPhotoPreviews() {
  const previewContainer = document.getElementById('photo-preview-container');
  const hiddenInput = document.getElementById('edit-images');
  if (!previewContainer || !hiddenInput) return;

  const images = (currentEditorImages || []).filter(Boolean);
  const renderNow = () => {
    previewContainer.innerHTML = '';
    if (!images.length) {
      hiddenInput.value = '';
      return;
    }

    images.forEach((src, index) => {
      const preview = document.createElement('div');
      preview.className = 'photo-preview';
      preview.innerHTML = `
        <div class="photo-preview-placeholder">Foto ${index + 1}</div>
        <button type="button" class="photo-preview-remove" aria-label="Verwijder foto" data-index="${index}">&times;</button>
      `;
      const previewImage = document.createElement('img');
      previewImage.alt = `Foto ${index + 1} van het recept`;
      previewImage.loading = 'lazy';
      previewImage.decoding = 'async';
      previewImage.style.display = 'none';
      previewImage.addEventListener('load', () => {
        previewImage.style.display = 'block';
        preview.querySelector('.photo-preview-placeholder')?.remove();
      });
      preview.insertBefore(previewImage, preview.firstChild);

      preview.querySelector('button').onclick = (event) => {
        event.stopPropagation();
        const imageIndex = Number(event.currentTarget.dataset.index || index);
        const removedImage = currentEditorImages[imageIndex];
        currentEditorImages.splice(imageIndex, 1);
        const primaryImageInput = document.getElementById('edit-image');
        if (primaryImageInput && removedImage && primaryImageInput.value === removedImage) {
          primaryImageInput.value = '';
        }
        renderEditorPhotoPreviews();
        void persistRecipeImageState(currentEditorImages, primaryImageInput?.value || '');
      };
      previewContainer.appendChild(preview);
      requestAnimationFrame(() => {
        previewImage.src = src;
      });
    });

    hiddenInput.value = JSON.stringify(images);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNow, { once: true });
  } else {
    requestAnimationFrame(renderNow);
  }
}

function compressImageToDataUrl(file) {
  // Use a Web Worker if available to avoid blocking the main thread
  return new Promise((resolve, reject) => {
    if (window.Worker) {
      try {
        const workerUrl = 'scripts/image-worker.js';
        const worker = new Worker(workerUrl);
        const fr = new FileReader();
        const id = Math.random().toString(36).slice(2, 9);
        fr.onload = () => {
          worker.postMessage({ id, fileBuffer: fr.result, fileType: file.type, maxWidth: 1400, maxHeight: 1400 }, [fr.result]);
        };
        worker.onmessage = (e) => {
          const d = e.data || {};
          if (d.id !== id) return;
          if (d.error) {
            reject(new Error(d.error));
            worker.terminate();
            return;
          }
          resolve(d.dataUrl);
          worker.terminate();
        };
        fr.onerror = (err) => reject(err);
        fr.readAsArrayBuffer(file);
      } catch (err) {
        console.warn('Worker failed, falling back to main-thread compress', err);
      }
    }

    // Fallback: main-thread compression
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1400;
        const maxHeight = 1400;
        let width = img.width;
        let height = img.height;
        const ratio = Math.min(1, maxWidth / width, maxHeight / height);
        if (ratio < 1) {
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = 'image/webp';
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Kon afbeelding niet comprimeren'));
            return;
          }
          const fileReader = new FileReader();
          fileReader.onload = () => resolve(fileReader.result);
          fileReader.onerror = reject;
          fileReader.readAsDataURL(blob);
        }, mimeType, 0.78);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processUploadedImages(files) {
  const validFiles = Array.from(files || []).filter((file) => file && file.type && file.type.startsWith('image/'));
  if (!validFiles.length) return;

  for (const file of validFiles) {
    try {
      const compressed = await compressImageToDataUrl(file);
      currentEditorImages.push(compressed);
    } catch (error) {
      console.warn('Kon afbeelding niet verwerken', error);
    }
  }

  renderEditorPhotoPreviews();
  void persistRecipeImageState(currentEditorImages, document.getElementById('edit-image').value || '');
}

function setupExtraImageUploader() {
  const addPhotoBtn = document.getElementById('btn-add-photo');
  const fileInput = document.getElementById('edit-image-file');
  const previewContainer = document.getElementById('photo-preview-container');

  if (!addPhotoBtn || !fileInput || !previewContainer) return;

  addPhotoBtn.onclick = () => {
    fileInput.click();
  };

  previewContainer.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (event) => {
    await processUploadedImages(event.target.files || []);
    event.target.value = '';
  });

  previewContainer.addEventListener('dragenter', (event) => {
    event.preventDefault();
    previewContainer.classList.add('drag-over');
  });

  previewContainer.addEventListener('dragover', (event) => {
    event.preventDefault();
    previewContainer.classList.add('drag-over');
  });

  previewContainer.addEventListener('dragleave', () => {
    previewContainer.classList.remove('drag-over');
  });

  previewContainer.addEventListener('drop', async (event) => {
    event.preventDefault();
    previewContainer.classList.remove('drag-over');
    await processUploadedImages(event.dataTransfer.files || []);
  });
}

function openImageLightbox(index = 0) {
  if (!currentGalleryImages.length) return;
  const lightbox = document.createElement('div');
  lightbox.className = 'recipe-image-lightbox';
  lightbox.innerHTML = `
    <div class="recipe-image-lightbox-backdrop"></div>
    <div class="recipe-image-lightbox-content">
      <button type="button" class="recipe-image-lightbox-close" aria-label="Sluit foto">×</button>
      <button type="button" class="recipe-image-lightbox-nav recipe-image-lightbox-nav-prev" aria-label="Vorige foto">←</button>
      <img src="${currentGalleryImages[index]}" alt="Vergrote foto">
      <button type="button" class="recipe-image-lightbox-nav recipe-image-lightbox-nav-next" aria-label="Volgende foto">→</button>
    </div>
  `;
  document.body.appendChild(lightbox);

  const imageEl = lightbox.querySelector('img');
  const counterEl = document.createElement('div');
  counterEl.className = 'recipe-image-lightbox-counter';
  counterEl.style.cssText = 'position:absolute; bottom:18px; left:50%; transform:translateX(-50%); color:#fff; background:rgba(0,0,0,0.5); padding:6px 10px; border-radius:999px; font-size:0.9rem;';
  lightbox.querySelector('.recipe-image-lightbox-content').appendChild(counterEl);

  let currentLightboxIndex = index;
  const updateImage = (nextIndex) => {
    currentLightboxIndex = (nextIndex + currentGalleryImages.length) % currentGalleryImages.length;
    imageEl.src = currentGalleryImages[currentLightboxIndex];
    imageEl.alt = `Vergrote foto ${currentLightboxIndex + 1} van ${currentGalleryImages.length}`;
    counterEl.textContent = `${currentLightboxIndex + 1} / ${currentGalleryImages.length}`;
  };

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    lightbox.remove();
  };

  lightbox.querySelector('.recipe-image-lightbox-backdrop').onclick = close;
  lightbox.querySelector('.recipe-image-lightbox-close').onclick = close;
  lightbox.querySelector('.recipe-image-lightbox-nav-prev').onclick = () => {
    updateImage(currentLightboxIndex - 1);
  };
  lightbox.querySelector('.recipe-image-lightbox-nav-next').onclick = () => {
    updateImage(currentLightboxIndex + 1);
  };

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      updateImage(currentLightboxIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      updateImage(currentLightboxIndex - 1);
    }
  }

  updateImage(currentLightboxIndex);
  document.addEventListener('keydown', onKeydown);
}

initModalKeyHandlers();

function renderIngredients() {
  if(!currentViewRecipe) return;
  viewServingsCount.textContent = currentServings;
  viewIngredientsList.innerHTML = '';
  
  const ratio = currentServings / currentBaseServings;
  
  (currentViewRecipe.ingredients || []).forEach(ing => {
    let amtStr = "";
    let unitAndName = "";
    
    if (typeof ing === 'string') {
        const match = ing.trim().match(/^([\d.,]+)\s+(.*)/);
        const fracMatch = ing.trim().match(/^(\d+)\/(\d+)\s+(.*)/);
        
        if (fracMatch) {
            let val = (parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * ratio;
            amtStr = val % 1 === 0 ? val.toString() : val.toFixed(1);
            unitAndName = fracMatch[3];
        } else if (match) {
            let numStr = match[1].replace(',', '.');
            let val = parseFloat(numStr) * ratio;
            if(!isNaN(val)) {
                amtStr = val % 1 === 0 ? val.toString() : val.toFixed(1);
                unitAndName = match[2];
            } else {
                unitAndName = ing;
            }
        } else {
            unitAndName = ing;
        }
    } else {
        // Object based ingredient
        amtStr = ing.amount;
        if(amtStr && !isNaN(parseFloat(amtStr))) {
          let calc = parseFloat(amtStr) * ratio;
          amtStr = calc % 1 === 0 ? calc : calc.toFixed(1);
        }
        unitAndName = `${ing.unit || ''} ${ing.name || ''}`.trim();
    }
    
    viewIngredientsList.innerHTML += `
      <label class="receipt-item">
        <input type="checkbox">
        <span class="ingredient-text"><b>${amtStr || ''}</b> ${unitAndName}</span>
      </label>
    `;
  });
  
  // Add Boodschappen copy button
  const existingBtn = document.getElementById('btn-copy-shopping-list');
  if (existingBtn) existingBtn.remove();
  
  const copyBtn = document.createElement('button');
  copyBtn.id = 'btn-copy-shopping-list';
  copyBtn.className = 'btn';
  copyBtn.style.marginTop = '24px';
  copyBtn.style.width = '100%';
  copyBtn.style.border = '1px dashed rgba(17, 17, 17, 0.15)';
  copyBtn.style.background = 'transparent';
  copyBtn.textContent = 'Boodschappen kopiëren';
  copyBtn.onclick = () => {
      const items = [];
      viewIngredientsList.querySelectorAll('.receipt-item').forEach(el => {
          const cb = el.querySelector('input[type="checkbox"]');
          if (cb && !cb.checked) {
              items.push('- ' + el.querySelector('.ingredient-text').textContent.trim());
          }
      });
      if(items.length > 0) {
          navigator.clipboard.writeText("Boodschappenlijstje:\n" + items.join('\n')).then(() => {
              copyBtn.textContent = 'Gekopieerd!';
              setTimeout(() => copyBtn.textContent = 'Boodschappen kopiëren', 2000);
          });
      } else {
          copyBtn.textContent = 'Alles is al geselecteerd!';
          setTimeout(() => copyBtn.textContent = 'Boodschappen kopiëren', 2000);
      }
  };
  viewIngredientsList.parentNode.appendChild(copyBtn);
}

document.getElementById('btn-servings-minus').onclick = () => {
  if(currentServings > 1) { currentServings--; renderIngredients(); }
};
document.getElementById('btn-servings-plus').onclick = () => {
  currentServings++; renderIngredients();
};
document.getElementById('btn-close-view').onclick = () => {
  closeManagedModal(recipeViewModal);
};

const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.getElementById('btn-toggle-sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.onclick = () => {
    if (sidebar.classList.contains('open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  };
}

const sidebarBackdrop = document.getElementById('sidebar-backdrop');
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeMobileSidebar);
}

const sidebarClose = document.getElementById('btn-close-sidebar');
if (sidebarClose) {
  sidebarClose.addEventListener('click', closeMobileSidebar);
}

if (sidebar) {
  sidebar.addEventListener('click', (event) => {
    const target = event.target;
    const actionable = target.closest('.nav-item, #btn-open-import, .brand');
    if (actionable && window.innerWidth <= 980) {
      closeMobileSidebar();
    }
  });
}

// --- COOKING MODE ---
document.getElementById('btn-start-cooking').onclick = () => {
  startCookingMode(currentViewRecipe);
};
function printRecipe(recipe) {
  if (!recipe || !recipe.title) return;
  
  // Set document title for PDF filename
  const originalTitle = document.title;
  document.title = `${recipe.title}_htmeal`;
  
  // Add a small footer with timestamp to the recipe modal
  const modal = document.getElementById('recipe-view-modal');
  const footer = document.createElement('div');
  footer.className = 'print-footer';
  footer.innerHTML = `<p>Afgedrukt op ${new Date().toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`;
  
  const recipeModalBody = modal.querySelector('.recipe-modal-body');
  if (recipeModalBody) {
    recipeModalBody.appendChild(footer);
  }
  
  // Mark modal for printing
  modal.classList.add('print-only');
  
  // Trigger print dialog
  window.print();
  
  // Restore after print dialog closes (with small delay)
  setTimeout(() => {
    if (footer.parentNode) {
      footer.remove();
    }
    modal.classList.remove('print-only');
    document.title = originalTitle;
  }, 500);
}
function startCookingMode(recipe) {
  if(!recipe || !recipe.instructions || recipe.instructions.length === 0) return;
  currentCookingRecipe = recipe;
  currentStepIndex = 0;
  updateCookingStep();
  closeManagedModal(recipeViewModal);
  openManagedModal(cookingMode);
  requestWakeLock();
}
function stopCookingTimer() {
  if (cookingTimerInterval) {
    clearInterval(cookingTimerInterval);
    cookingTimerInterval = null;
  }
  cookingTimerRemaining = 0;
  const panel = document.getElementById('cooking-timer-panel');
  if (panel) panel.innerHTML = '';
  hideCookingTimerOverlay();
}
function formatTimerValue(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
function updateCookingTimer(stepText) {
  stopCookingTimer();
  const match = stepText.match(/(\d+)\s*min(?:ute)?s?/i);
  const panel = document.getElementById('cooking-timer-panel');
  if (!panel) return;
  if (!match) {
    panel.innerHTML = '';
    return;
  }
  const minutes = Number(match[1]);
  const duration = minutes > 0 ? minutes * 60 : 0;
  if (!duration) {
    panel.innerHTML = '';
    return;
  }

  panel.innerHTML = `
    <div class="cooking-timer-card">
      <div class="cooking-timer-clock">
        <strong class="cooking-timer-value" id="cooking-timer-display">${formatTimerValue(duration)}</strong>
      </div>
      <button class="btn btn-primary cooking-timer-button" id="btn-start-step-timer">Start timer</button>
    </div>
  `;

  const button = document.getElementById('btn-start-step-timer');
  if (button) {
    button.onclick = () => {
      if (cookingTimerInterval) {
        stopCookingTimer();
        button.textContent = `Start ${minutes}m timer`;
        return;
      }
      cookingTimerRemaining = duration;
      button.textContent = 'Stop timer';
      renderCookingTimerOverlay(stepText);
      hideCookingTimerOverlay();
      cookingTimerInterval = setInterval(() => {
        cookingTimerRemaining -= 1;
        const display = document.getElementById('cooking-timer-display');
        if (display) display.textContent = formatTimerValue(cookingTimerRemaining);
        const overlayDisplay = document.getElementById('cooking-timer-overlay-display');
        if (overlayDisplay) overlayDisplay.textContent = formatTimerValue(cookingTimerRemaining);
        if (cookingTimerRemaining <= 0) {
          stopCookingTimer();
          button.textContent = `Start ${minutes}m timer`;
          if (window.playSound) window.playSound('click');
        }
      }, 1000);
    };
  }
}
function updateCookingStep() {
  if(!currentCookingRecipe) return;
  const steps = currentCookingRecipe.instructions;
  const nextBtn = document.getElementById('next-step-btn');
  if(currentStepIndex >= steps.length) {
    document.getElementById('cooking-step-text').textContent = "Eet smakelijk.";
    document.getElementById('cooking-step-meta').textContent = "Klaar met koken";
    stopCookingTimer();
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }
  if (nextBtn) nextBtn.style.display = 'block';
  document.getElementById('cooking-step-meta').textContent = `Stap ${currentStepIndex + 1} van ${steps.length} — ${currentCookingRecipe.title}`;
  const stepText = steps[currentStepIndex];
  document.getElementById('cooking-step-text').textContent = stepText;
  updateCookingTimer(stepText);
}
document.getElementById('next-step-btn').onclick = () => { currentStepIndex++; updateCookingStep(); };
document.getElementById('prev-step-btn').onclick = () => { if(currentStepIndex > 0) { currentStepIndex--; updateCookingStep(); } };
document.getElementById('btn-return-to-recipe').onclick = () => {
  closeManagedModal(cookingMode);
  if (currentViewRecipe) recipeViewModal.classList.add('active');
};
document.getElementById('exit-cooking-mode').onclick = () => {
  closeManagedModal(cookingMode);
  if (!cookingTimerInterval) {
    currentCookingRecipe = null;
  }
};

// --- EDITOR & IMPORT ---

let currentEditTags = [];
let currentEditorImages = [];

function getRecipeImages(recipe) {
  const seen = new Set();
  const sources = [];
  const pushUnique = (value) => {
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        sources.push(trimmed);
      }
    }
  };

  if (Array.isArray(recipe?.images)) {
    recipe.images.forEach(pushUnique);
  }
  if (Array.isArray(recipe?.extra_images)) {
    recipe.extra_images.forEach(pushUnique);
  }
  pushUnique(recipe?.image);
  pushUnique(recipe?.extra_image);
  return sources;
}

function getPrimaryRecipeImage(recipe) {
  return getRecipeImages(recipe)[0] || '';
}

function getRecipeImageAltText(recipe, index) {
  return `Foto ${index + 1} van ${escapeHtml(recipe?.title || 'recept')}`;
}

function buildRecipeImageState(recipe, images, primaryImageOverride = '') {
  const nextRecipe = { ...(recipe || {}) };
  const finalImages = (images || []).filter(Boolean);
  const primaryImage = primaryImageOverride || finalImages[0] || '';

  nextRecipe.image = primaryImage;
  nextRecipe.images = finalImages;

  if (finalImages.length) {
    nextRecipe.extra_images = finalImages.filter((src) => src !== primaryImage);
  } else {
    delete nextRecipe.extra_images;
  }

  if (primaryImage) {
    delete nextRecipe.extra_image;
  } else {
    delete nextRecipe.extra_image;
  }

  return nextRecipe;
}

function syncRecipeImageUiState(images, primaryImageOverride = '') {
  if (!currentViewRecipe) return null;

  const updatedRecipe = buildRecipeImageState(currentViewRecipe, images, primaryImageOverride);
  Object.assign(currentViewRecipe, updatedRecipe);

  const recipeIndex = currentRecipes.findIndex((recipe) => String(recipe.id) === String(currentViewRecipe.id));
  if (recipeIndex >= 0) {
    currentRecipes[recipeIndex] = currentViewRecipe;
  }

  const gallery = document.getElementById('view-recipe-gallery');
  if (gallery && recipeViewModal.classList.contains('active')) {
    renderRecipeGallery(currentViewRecipe, gallery);
  }

  return updatedRecipe;
}

async function persistRecipeImageState(images, primaryImageOverride = '') {
  if (!currentViewRecipe || !canEditRecipe(currentViewRecipe)) return;

  const updatedRecipe = syncRecipeImageUiState(images, primaryImageOverride);
  if (!updatedRecipe) return;

  try {
    const res = await apiFetch('/api/recipe', { method: 'POST', isJson: true, body: { recipe: updatedRecipe } });
    if (!res.ok) {
      console.warn('Kon receptenfoto niet opslaan', await res.text().catch(() => ''));
    }
  } catch (error) {
    console.warn('Kon receptenfoto niet opslaan', error);
  }
}

function renderEditTags() {
    const container = document.getElementById('edit-tags-container');
    const input = document.getElementById('edit-tags-input');
    
    // Remove existing pills
    container.querySelectorAll('.tag-pill').forEach(el => el.remove());
    
    currentEditTags.forEach((tag, idx) => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.style = "background: var(--color-paper-alt); padding: 4px 10px; border-radius: 16px; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-family: var(--font-sans);";
        pill.innerHTML = `<span>${tag}</span><button type="button" style="background:none; border:none; cursor:pointer; font-weight:bold; opacity:0.5; padding:0; line-height:1; font-size:1.1rem;" onclick="removeEditTag(${idx})">&times;</button>`;
        container.insertBefore(pill, input);
    });
}

window.removeEditTag = function(idx) {
    currentEditTags.splice(idx, 1);
    renderEditTags();
};

const tagInput = document.getElementById('edit-tags-input');
if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = e.target.value.trim().replace(/^#/, ''); // Strip # if user types it
            if (val && !currentEditTags.includes(val)) {
                currentEditTags.push(val);
                e.target.value = '';
                renderEditTags();
            }
        } else if (e.key === 'Backspace' && e.target.value === '' && currentEditTags.length > 0) {
            currentEditTags.pop();
            renderEditTags();
        }
    });
}

document.getElementById('btn-open-import').onclick = () => {
  currentViewRecipe = null;
  document.getElementById('import-text').value = '';
  document.getElementById('edit-title').value = '';
  document.getElementById('edit-image').value = '';
  document.getElementById('edit-desc').value = '';
  document.getElementById('edit-source').value = '';
  currentEditTags = [];
  renderEditTags();
  if(tagInput) tagInput.value = '';
  document.getElementById('edit-ingredients').value = '';
  document.getElementById('edit-instructions').value = '';
  document.getElementById('edit-servings').value = 4;
  document.getElementById('edit-time').value = '';
  currentEditorImages = [];
  renderEditorPhotoPreviews();
  document.getElementById('btn-delete-recipe').style.display = 'none';
  openManagedModal(editorModal);
};
document.getElementById('btn-close-editor').onclick = () => {
  closeManagedModal(editorModal);
};

const importTextInput = document.getElementById('import-text');
const importButton = document.getElementById('btn-run-import');
if (importTextInput && importButton) {
  importButton.textContent = 'Plak';
  importTextInput.addEventListener('input', () => {
    const text = importTextInput.value.trim();
    importButton.textContent = text && /https?:\/\/|www\./i.test(text) ? 'Plakken' : 'Plak';
  });
}

document.getElementById('btn-run-import').onclick = async () => {
  const text = document.getElementById('import-text').value;
  if(!text) return;
  
  const status = document.getElementById('import-status');
  const btn = document.getElementById('btn-run-import');
  const ogText = btn.textContent;
  btn.textContent = 'Parsing...';
  if (status) status.textContent = 'Recept wordt geïmporteerd…';

  try {
    const res = await apiFetch('/api/import', { method: 'POST', isJson: true, body: { text } });
    if (!res.ok) throw new Error('Import mislukt');
    const recipe = await res.json();
    if (!recipe || !recipe.title) {
      throw new Error('Geen geldig recept gevonden');
    }
    populateEditor(recipe);
    if (status) status.textContent = 'Import succesvol. Controleer de velden en sla op.';
  } catch (error) {
    console.error('Import error', error);
    if (status) status.textContent = 'Kon recept niet importeren. Probeer een andere URL of inhoud.';
  } finally {
    btn.textContent = ogText;
  }
};

function populateEditor(recipe) {
  document.getElementById('edit-title').value = recipe.title || '';
  document.getElementById('edit-image').value = recipe.image || '';
  document.getElementById('edit-desc').value = recipe.description || '';
  document.getElementById('edit-note').value = '';
  document.getElementById('edit-note').placeholder = 'Typ een nieuwe notitie voor dit recept...';
  document.getElementById('edit-source').value = recipe.source || '';
  
  currentEditTags = [...(recipe.tags || [])];
  renderEditTags();
  if(tagInput) tagInput.value = '';
  
  document.getElementById('edit-servings').value = recipe.servings || 4;
  document.getElementById('edit-time').value = recipe.cooking_time || '';
  
  if(recipe.ingredients) {
    document.getElementById('edit-ingredients').value = recipe.ingredients.map(i => typeof i === 'string' ? i : `${i.amount || ''} ${i.unit || ''} ${i.name || ''}`.trim()).join('\n');
  }
  if(recipe.instructions) {
    document.getElementById('edit-instructions').value = recipe.instructions.join('\n');
  }

  currentEditorImages = getRecipeImages(recipe);
  renderEditorPhotoPreviews();
}

function editCurrentRecipe() {
  if(!currentViewRecipe || !canEditRecipe(currentViewRecipe)) return;
  populateEditor(currentViewRecipe);
  document.getElementById('btn-delete-recipe').style.display = canEditRecipe(currentViewRecipe) ? 'block' : 'none';
  closeManagedModal(recipeViewModal);
  openManagedModal(editorModal);
  requestAnimationFrame(() => {
    renderEditorPhotoPreviews();
  });
}

document.getElementById('btn-delete-recipe').onclick = async () => {
  if(!currentViewRecipe) return;
  if(confirm("Are you sure you want to delete this recipe?")) {
    const recipeId = String(currentViewRecipe.id);
    try {
      const res = await apiFetch('/api/recipe', { method: 'POST', isJson: true, body: { action: "delete", recipe: currentViewRecipe } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert('Kon recept niet verwijderen: ' + (data.error || res.statusText));
        return;
      }

      currentRecipes = currentRecipes.filter(recipe => String(recipe.id) !== recipeId);
      AppState.apiCache.recipesByQuery = {};
      AppState.apiCache.collections = null;
      currentViewRecipe = null;
      editorModal.classList.remove('active');
      recipeViewModal.classList.remove('active');
      fetchRecipes(AppState.lastRecipeQuery || searchInput.value || '');
    } catch (error) {
      console.error('Kon recept niet verwijderen', error);
      alert('Kon recept niet verwijderen.');
    }
  }
};

document.getElementById('btn-save-recipe').onclick = async () => {
  const title = document.getElementById('edit-title').value;
  const image = document.getElementById('edit-image').value;
  const desc = document.getElementById('edit-desc').value;
  const source = document.getElementById('edit-source').value;
  const servings = parseInt(document.getElementById('edit-servings').value) || 4;
  const time = parseInt(document.getElementById('edit-time').value) || 30;
  
  // also get any un-entered text in the tag input
  const pendingTag = tagInput && tagInput.value.trim().replace(/^#/, '');
  if (pendingTag && !currentEditTags.includes(pendingTag)) {
      currentEditTags.push(pendingTag);
  }
  const tags = [...currentEditTags];
  
  const note = document.getElementById('edit-note').value.trim();
  const ingsText = document.getElementById('edit-ingredients').value.split('\n').filter(l => l.trim());
  const instText = document.getElementById('edit-instructions').value.split('\n').filter(l => l.trim());
  
  const recipe = currentViewRecipe ? { ...currentViewRecipe } : {};
  const existingNotes = getRecipeNotes(recipe);
  const notes = [...existingNotes];
  if (note) {
    notes.push(buildNoteEntry(note, getCurrentUserName() || 'Gast'));
  }
  recipe.title = title;
  const finalImages = currentEditorImages.filter(Boolean);
  const primaryImage = image || finalImages[0] || '';

  const imageStateRecipe = buildRecipeImageState(recipe, finalImages, primaryImage);
  Object.assign(recipe, imageStateRecipe);

  recipe.description = desc;
  recipe.notes = notes;
  recipe.note = notes.length ? notes[notes.length - 1].text : '';
  recipe.source = source;
  recipe.tags = tags;
  recipe.servings = servings;
  recipe.cooking_time = time;
  recipe.ingredients = ingsText; 
  recipe.instructions = instText;
  
  try {
    const res = await apiFetch('/api/recipe', { method: 'POST', isJson: true, body: { recipe } });
    const data = await parseJsonResponse(res, {});
    if (!res.ok) {
      alert('Kon recept niet opslaan: ' + (data.error || res.statusText));
      return;
    }
    
    // Show achievement unlock notifications
    if (data.awarded_achievements && data.awarded_achievements.length > 0) {
      data.awarded_achievements.forEach(achievementId => {
        // Fetch the achievement details from the achievements endpoint
        apiFetch('/api/achievements')
          .then(r => r.json())
          .then(d => {
            const achievement = d.achievements?.find(a => a.id === achievementId);
            if (achievement) {
              showAchievementUnlocked(achievement);
            }
          })
          .catch(e => console.error('Error fetching achievement:', e));
      });
    }
  } catch (error) {
    console.error('Recept opslaan mislukt', error);
    alert('Kon recept niet opslaan. Controleer of de server werkt en probeer opnieuw.');
    return;
  }
  
  AppState.apiCache.recipesByQuery = {};
  saveLastRecipeQuery(AppState.lastRecipeQuery);
  await fetchCollections(true);
  editorModal.classList.remove('active');
  fetchRecipes(AppState.lastRecipeQuery); // refresh current view
};

setupExtraImageUploader();
window.addEventListener('scroll', handleRecipeScroll, { passive: true });
window.addEventListener('resize', handleRecipeScroll);

document.getElementById('btn-change-user')?.addEventListener('click', () => {
  openLoginModal();
});

loginLogoutButton?.addEventListener('click', () => {
  logout();
});

document.getElementById('btn-view-achievements')?.addEventListener('click', () => {
  showAchievementsModal();
});

document.getElementById('btn-close-achievements')?.addEventListener('click', () => {
  closeManagedModal(document.getElementById('achievements-modal'));
});

document.getElementById('btn-close-achievement-detail')?.addEventListener('click', () => {
  closeManagedModal(document.getElementById('achievement-detail-modal'));
});

deleteAccountButton?.addEventListener('click', () => {
  deleteAccount();
});

async function logout() {
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch (e) {
    console.warn('Logout failed', e);
  }
  setCurrentUser('');
  saveStoredSessionToken('');
  AppState.apiCache.recipesByQuery = {};
  AppState.apiCache.collections = null;
  fetchRecipes(AppState.lastRecipeQuery);
  fetchCollections(true);
  openLoginModal();
}

async function deleteAccount() {
  const user = getCurrentUserName();
  if (!user) return;
  if (!confirm(`Weet je zeker dat je account '${user}' wilt verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
  try {
    const res = await apiFetch('/api/delete_user', { method: 'POST', isJson: true, body: { user } });
    const data = await res.json();
    if (!res.ok || data.error) {
      alert('Kon account niet verwijderen: ' + (data.error || res.statusText));
      return;
    }
    await logout();
  } catch (e) {
    console.error(e);
    alert('Fout bij het verwijderen van het account');
  }
}

async function showAchievementsModal() {
  const user = getCurrentUserName();
  if (!user) return;
  
  try {
    const res = await apiFetch('/api/achievements');
    if (!res.ok) {
      alert('Kon prestaties niet laden');
      return;
    }
    const data = await res.json();
    const achievements = data.achievements || [];
    const progress = data.progress || {};
    
    // Update progress bar
    document.getElementById('achievements-earned').textContent = progress.earned || 0;
    document.getElementById('achievements-total').textContent = progress.total || 0;
    document.getElementById('achievements-percentage').textContent = `${progress.percentage || 0}% ontgrendeld`;
    const bar = document.getElementById('achievements-bar');
    if (bar) bar.style.width = `${progress.percentage || 0}%`;
    
    // Render achievements as a grid with badges
    const list = document.getElementById('achievements-list');
    if (!list) return;
    
    // Split into earned and unearned
    const earned = achievements.filter(a => a.earned);
    const unearned = achievements.filter(a => !a.earned);
    
    // De Stijl color scheme
    const rarityColors = {
      'common': { bg: '#fff9e6', border: '#ffcc00', text: '#111111' },
      'rare': { bg: '#eaf4ff', border: '#0055a4', text: '#0055a4' },
      'epic': { bg: '#fff4f4', border: '#e62222', text: '#e62222' }
    };
    
    const buildAchievementBadge = (achievement, isEarned) => {
      const colors = rarityColors[achievement.rarity] || rarityColors['common'];
      const earnedDate = achievement.earned_at ? new Date(achievement.earned_at).toLocaleDateString('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
      
      const style = isEarned 
        ? `background: ${colors.bg}; border: 2px solid ${colors.border}; color: ${colors.text}; opacity: 1;`
        : `background: #f8f6f0; border: 2px solid #111111; color: rgba(17, 17, 17, 0.6); opacity: 0.72;`;
      
      return `
        <div style="padding: var(--space-2); text-align: center; cursor: pointer; transition: all 0.2s; ${style}" 
             data-achievement-id="${achievement.id}" 
             title="Klik voor details">
          <div style="font-size: 2rem; margin-bottom: 4px; line-height: 1;"><i class="${achievement.icon}"></i></div>
          <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 2px; line-height: 1.2; word-wrap: break-word; word-break: break-word;">${escapeHtml(achievement.title)}</div>
          ${isEarned ? `<div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px;">${earnedDate}</div>` : '<div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px;">🔒</div>'}
        </div>
      `;
    };
    
    let html = '';
    
    // Earned achievements section
    if (earned.length > 0) {
      html += '<div style="margin-bottom: var(--space-4);">';
      html += '<div style="font-size: 0.85rem; font-weight: 700; color: var(--color-accent); margin-bottom: var(--space-2); text-transform: uppercase;">Ontgrendeld</div>';
      html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: var(--space-2);">';
      html += earned.map(a => buildAchievementBadge(a, true)).join('');
      html += '</div></div>';
    }
    
    // Unearned achievements section
    if (unearned.length > 0) {
      html += '<div>';
      html += '<div style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted); margin-bottom: var(--space-2); text-transform: uppercase;">Te ontgrendelen</div>';
      html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: var(--space-2);">';
      html += unearned.map(a => buildAchievementBadge(a, false)).join('');
      html += '</div></div>';
    }
    
    if (achievements.length === 0) {
      html = '<div style="text-align: center; padding: var(--space-4); color: var(--color-text-muted);">Geen prestaties beschikbaar.</div>';
    }
    
    list.innerHTML = html;
    
    // Add click handlers to achievement badges
    document.querySelectorAll('[data-achievement-id]').forEach(badge => {
      badge.addEventListener('click', () => {
        const id = badge.getAttribute('data-achievement-id');
        const achievement = achievements.find(a => a.id === id);
        if (achievement) {
          showAchievementDetail(achievement);
        }
      });
    });
    
    // Open modal
    const modal = document.getElementById('achievements-modal');
    if (modal) {
      openManagedModal(modal);
    }
  } catch (e) {
    console.error('Error loading achievements:', e);
    alert('Kon prestaties niet laden');
  }
}

function showAchievementDetail(achievement) {
  const modal = document.getElementById('achievement-detail-modal');
  if (!modal) return;
  
  const titleEl = document.getElementById('achievement-detail-title');
  const iconEl = document.getElementById('achievement-detail-icon');
  const descEl = document.getElementById('achievement-detail-description');
  const storyEl = document.getElementById('achievement-detail-story');
  const statusEl = document.getElementById('achievement-detail-status');
  
  if (titleEl) titleEl.innerHTML = `<i class="${achievement.icon}"></i> ${escapeHtml(achievement.title)}`;
  if (iconEl) iconEl.innerHTML = `<i class="${achievement.icon}"></i>`;
  if (descEl) descEl.textContent = achievement.description;
  if (storyEl) storyEl.textContent = achievement.detail;
  
  if (statusEl) {
    if (achievement.earned) {
      const earnedDate = new Date(achievement.earned_at).toLocaleDateString('nl-NL', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      statusEl.innerHTML = `<strong>Ontgrendeld op:</strong> ${earnedDate}`;
      statusEl.style.background = '#f8f6f0';
      statusEl.style.borderLeft = '4px solid #5c9e31';
    } else {
      statusEl.innerHTML = `<strong>Status:</strong> Nog te ontgrendelen`;
      statusEl.style.background = '#fff9e6';
      statusEl.style.borderLeft = '4px solid #ffcc00';
    }
  }
  
  openManagedModal(modal);
}

// Show animated achievement unlock notification
function showAchievementUnlocked(achievement) {
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'achievement-unlock-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #e62222;
    padding: 48px 40px;
    border: 8px solid #000000;
    text-align: center;
    z-index: 10001;
    animation: achievementUnlockIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    max-width: 550px;
    width: 90%;
  `;
  
  notification.innerHTML = `
    <style>
      @keyframes achievementUnlockIn {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5) rotateZ(-15deg);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.05) rotateZ(2deg);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1) rotateZ(0deg);
        }
      }
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
      
      #achievement-unlock-notification .close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
        border: 3px solid #fff;
        background: #ffcc00;
        font-size: 24px;
        font-weight: bold;
        color: #000;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
      }
      #achievement-unlock-notification .close-btn:hover {
        background: #000;
        color: #ffcc00;
        transform: rotate(90deg);
      }
      #achievement-unlock-notification .content {
        position: relative;
        z-index: 2;
      }
      #achievement-unlock-notification .achievement-icon {
        font-size: 4.5rem;
        margin-bottom: 20px;
        color: #ffcc00;
        animation: pulse 1.5s ease-in-out infinite;
      }
      #achievement-unlock-notification .achievement-header {
        font-size: 0.85rem;
        font-weight: 800;
        color: #ffcc00;
        margin-bottom: 12px;
        letter-spacing: 4px;
        font-family: var(--font-pixel);
        text-transform: uppercase;
      }
      #achievement-unlock-notification .achievement-title {
        font-size: 2.2rem;
        font-weight: 900;
        color: #fff;
        margin-bottom: 16px;
        font-family: var(--font-sans);
        letter-spacing: -0.5px;
      }
      #achievement-unlock-notification .achievement-detail {
        font-size: 1rem;
        color: #fff;
        font-family: var(--font-sans);
        line-height: 1.6;
        margin-bottom: 24px;
      }
      #achievement-unlock-notification .btn-achievements {
        background: #ffcc00;
        color: #000;
        border: 3px solid #000;
        padding: 12px 28px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: var(--font-sans);
      }
      #achievement-unlock-notification .btn-achievements:hover {
        background: #0055a4;
        color: #fff;
        transform: translateY(-2px);
      }
    </style>
    
    <button class="close-btn" aria-label="Sluiten">✕</button>
    
    <div class="content">
      <div class="achievement-icon">
        <i class="${achievement.icon}"></i>
      </div>
      <div class="achievement-header">Prestatie Ontgrendeld!</div>
      <div class="achievement-title">${escapeHtml(achievement.title)}</div>
      <div class="achievement-detail">${escapeHtml(achievement.detail)}</div>
      <button class="btn-achievements">Bekijk Prestaties</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Create backdrop to ensure modal is on top and cursor visible
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 10000;
    pointer-events: none;
  `;
  document.body.appendChild(backdrop);
  
  // Close button handler
  const closeBtn = notification.querySelector('.close-btn');
  const closeNotification = () => {
    notification.remove();
    backdrop.remove();
  };
  closeBtn.addEventListener('click', closeNotification);
  backdrop.addEventListener('click', closeNotification);
  
  // Achievements button handler
  const btnAchievements = notification.querySelector('.btn-achievements');
  btnAchievements.addEventListener('click', () => {
    closeNotification();
    showAchievementsModal();
  });
  
  // Play sound if available
  if (window.playSound) {
    window.playSound('paper');
  }
}

refreshAuthStatus().then((loggedIn) => {
  if (!loggedIn) {
    openLoginModal();
  }
});

searchInput.addEventListener('input', (e) => {
  const query = e.target.value;
  debounce(() => fetchRecipes(query), 200);
});

document.addEventListener('keydown', (e) => {
  if (cookingMode.classList.contains('active')) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      currentStepIndex++;
      updateCookingStep();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentStepIndex > 0) {
        currentStepIndex--;
        updateCookingStep();
      }
      return;
    }
  }
  if(e.key === 'Escape') {
    if (cookingMode.classList.contains('active') && cookingTimerInterval) {
      closeManagedModal(cookingMode);
      return;
    }
    recipeViewModal.classList.remove('active');
    editorModal.classList.remove('active');
    cookingMode.classList.remove('active');
    if (!cookingTimerInterval) {
      stopCookingTimer();
    }
  }
});
