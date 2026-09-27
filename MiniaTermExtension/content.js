let currentTargetUrl = null;
let currentHref = location.href;
let debounceTimer = null;

// 1. Detect if this is an auth page OR a policy update banner
function hasLegalPrompt() {
  const hasPasswordField = document.querySelector('input[type="password"]') !== null;
  if (hasPasswordField) return true;

  const authUrlPatterns = [
    '/signup', '/sign-up', '/register', '/join', 
    '/login', '/signin', '/sign-in', '/auth', 
    '/create-account', 'creating-your-account', 
    'account-setup', 'account-creation', 'new-account', 'register-now'
  ];
  const pathname = window.location.pathname.toLowerCase();
  const matchesAuthUrl = authUrlPatterns.some(route => pathname.includes(route));
  
  const hasEmailOrUserInput = document.querySelector(
    'input[type="email"], input[name*="user"], input[name*="email"], input[id*="email"], input[id*="user"]'
  ) !== null;

  if (matchesAuthUrl && hasEmailOrUserInput) return true;

  // Use textContent instead of innerText for 10x faster non-blocking reads
  const pageText = (document.body ? document.body.textContent : "").toLowerCase();
  const updatePhrases = [
    "updated our terms",
    "updated our privacy",
    "changes to our terms",
    "changes to our privacy",
    "we've updated",
    "we have updated",
    "our terms have changed"
  ];

  return updatePhrases.some(phrase => pageText.includes(phrase));
}

// 2. Scan the page for Terms or Privacy links
function scanLegalLinks() {
  const links = Array.from(document.querySelectorAll('a'));
  let termsUrl = null;
  let privacyUrl = null;

  for (const link of links) {
    const text = (link.textContent || '').toLowerCase().trim();
    const href = link.href;

    if (!href || href.startsWith('javascript:') || href === '#') continue;

    if (!termsUrl && (text.includes('terms') || text.includes('conditions') || text.includes('tos') || text.includes('user agreement'))) {
      termsUrl = href;
    }
    if (!privacyUrl && (text.includes('privacy policy') || text.includes('privacy'))) {
      privacyUrl = href;
    }
  }

  return { termsUrl, privacyUrl };
}

// 3. Main runner (safely wrapped without disconnecting the observer)
function checkAndTrigger() {
  if (!hasLegalPrompt()) return;
  if (document.getElementById('tc-audit-modal')) return;

  const { termsUrl, privacyUrl } = scanLegalLinks();
  const detectedUrl = termsUrl || privacyUrl;

  if (detectedUrl) {
    currentTargetUrl = detectedUrl;
    showModal("⏳ Automatically analyzing Terms & Conditions...");
    requestAudit(currentTargetUrl, "English");
  }
}

// 4. Request the AI analysis from background.js
function requestAudit(url, language) {
  const contentDiv = document.getElementById('tc-modal-content');
  if (contentDiv) {
    contentDiv.style.color = '#94a3b8';
    contentDiv.style.fontStyle = 'italic';
    contentDiv.innerText = `⏳ Generating summary in ${language}...`;
  }

  chrome.runtime.sendMessage({ action: "audit_terms", url: url, language: language }, (response) => {
    if (response && response.success) {
      updateModal(response.data);
    } else {
      updateModal(`❌ Error: ${response ? response.error : "Failed to load audit."}`);
    }
  });
}

function updateModal(text) {
  const contentDiv = document.getElementById('tc-modal-content');
  if (contentDiv) {
    contentDiv.style.color = '#e2e8f0';
    contentDiv.style.fontStyle = 'normal';
    contentDiv.innerHTML = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
}

// 5. Injected Floating Card UI
function showModal(initialText) {
  if (document.getElementById('tc-audit-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'tc-audit-modal';

  Object.assign(modal.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '370px',
    maxHeight: '480px',
    overflowY: 'auto',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    padding: '18px',
    borderRadius: '16px',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
    zIndex: '2147483647',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    lineHeight: '1.6',
    border: '1px solid #334155'
  });

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #334155;padding-bottom:10px;">
      <strong style="font-size:14px;color:#f8fafc;">🛡️ MiniaTerm</strong>
      
      <div style="display:flex;align-items:center;gap:8px;">
        <select id="tc-lang-select" style="background:#1e293b;color:#f8fafc;border:1px solid #475569;border-radius:6px;font-size:11px;padding:3px 6px;cursor:pointer;">
          <option value="English" selected>English</option>
          <option value="Spanish">Español</option>
          <option value="French">Français</option>
          <option value="German">Deutsch</option>
          <option value="Chinese">中文</option>
          <option value="Japanese">日本語</option>
        </select>
        <button id="tc-modal-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:0;line-height:1;">✕</button>
      </div>
    </div>
    <div id="tc-modal-content" style="color: #94a3b8; font-style: italic;">${initialText}</div>
  `;

  document.body.appendChild(modal);

  // Close button
  document.getElementById('tc-modal-close').addEventListener('click', () => modal.remove());

  // Language switcher
  document.getElementById('tc-lang-select').addEventListener('change', (e) => {
    const selectedLang = e.target.value;
    if (currentTargetUrl) {
      requestAudit(currentTargetUrl, selectedLang);
    }
  });
}

// 6. Debounced continuous listeners
function debouncedCheck() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    checkAndTrigger();
  }, 400);
}

// Initial scan on script load
debouncedCheck();

// Watch for dynamic DOM elements appearing (React/Vue auth modals)
const observer = new MutationObserver(() => {
  debouncedCheck();
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true
});

// Watch for client-side SPA route shifts (URL changes without hard reloads)
setInterval(() => {
  if (location.href !== currentHref) {
    currentHref = location.href;
    const existingModal = document.getElementById('tc-audit-modal');
    if (existingModal) existingModal.remove();
    debouncedCheck();
  }
}, 500);