// Function that runs directly inside the active webpage
function scanPageForLegalLinks() {
  const termsKeywords = ['terms of service', 'terms and conditions', 'terms of use', 'tos', 'terms', 'conditions', 'user agreement', 'user terms' ];
  const privacyKeywords = ['privacy policy', 'privacy notice', 'privacy statement'];

  const allLinks = Array.from(document.querySelectorAll('a'));
  let termsUrl = null;
  let privacyUrl = null;

  for (let link of allLinks) {
    const text = link.innerText.toLowerCase().trim();
    const href = link.href.toLowerCase();

    if (!termsUrl && termsKeywords.some(k => text.includes(k) || href.includes(k.replace(/ /g, '-')))) {
      termsUrl = link.href;
    }

    if (!privacyUrl && privacyKeywords.some(k => text.includes(k) || href.includes(k.replace(/ /g, '-')))) {
      privacyUrl = link.href;
    }
  }

  return { terms: termsUrl, privacy: privacyUrl };
}

// When the popup opens, ask Chrome to execute the scan function on the active tab
document.addEventListener('DOMContentLoaded', async () => {
  const resultsContainer = document.getElementById('results');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    resultsContainer.innerText = "Cannot scan this page.";
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scanPageForLegalLinks
  }, (results) => {
    if (!results || !results[0] || !results[0].result) {
      resultsContainer.innerText = "No links detected.";
      return;
    }

    const { terms, privacy } = results[0].result;

    let html = '';

    // Terms section
    html += '<div class="item">';
    if (terms) {
      html += `<span class="found">✔ Terms & Conditions Detected</span>`;
      html += `<a href="${terms}" target="_blank">Open Link</a>`;
    } else {
      html += `<span class="not-found">✖ Terms & Conditions Not Found</span>`;
    }
    html += '</div>';

    // Privacy section
    html += '<div class="item">';
    if (privacy) {
      html += `<span class="found">✔ Privacy Policy Detected</span>`;
      html += `<a href="${privacy}" target="_blank">Open Link</a>`;
    } else {
      html += `<span class="not-found">✖ Privacy Policy Not Found</span>`;
    }
    html += '</div>';

    resultsContainer.innerHTML = html;
  });
});