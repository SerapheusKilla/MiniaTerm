const GEMINI_API_KEY = "AQ.Ab8RN6K2dw3Pz9D7TjfMbBcy4eWadnjkU6etJ1FsMv4NPrvgHg";


// Fast SHA-256 hashing using the browser's native Web Crypto API
async function computeHash(text) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "audit_terms") {
    handleAudit(request.url, request.language || "English")
      .then(analysis => sendResponse({ success: true, data: analysis }))
      .catch(err => {
        console.error("Audit error:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep message channel open for async response
  }
});

async function handleAudit(targetUrl, language) {
  // 1. Download the Terms & Conditions page
  const pageResponse = await fetch(targetUrl);
  const rawHtml = await pageResponse.text();

  // 2. Clean out HTML tags, scripts, styles, and extra whitespace
  const cleanText = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 20000); // Truncate to first 20k characters

  // 3. Compute unique hash of the cleaned text
  const contentHash = await computeHash(cleanText);
  // Cache key includes both the text fingerprint and selected language
  const cacheKey = `tc_hash_${contentHash}_${language.toLowerCase()}`;

  // 4. Check local cache first
  const cachedData = await chrome.storage.local.get([cacheKey]);
  if (cachedData[cacheKey]) {
    console.log(`Serving cached audit for hash: ${contentHash} in ${language}`);
    return cachedData[cacheKey];
  }

  // 5. Send to Gemini if not cached
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${"AQ.Ab8RN6K2dw3Pz9D7TjfMbBcy4eWadnjkU6etJ1FsMv4NPrvgHg"}`;

  const promptText = `You are a consumer rights assistant. Read this Terms of Service/Privacy agreement:
${cleanText}

Respond entirely in the ${language} language using clean markdown:
1. **Summary:** A 1 to 2 sentence plain-language summary of what the user is agreeing to.
2. **Things to Note:** 3 to 4 or as many as needed concise bullet points highlighting key red flags (e.g., selling data to third parties, forced arbitration, training AI on user uploads, or recurring charges) Also, include a hyperlink that shows the specific clause per bullet.`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }]
    })
  });

  const aiData = await response.json();

  if (aiData.error) {
    throw new Error(aiData.error.message || JSON.stringify(aiData.error));
  }

  if (!aiData.candidates || !aiData.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error("Invalid response format received from Gemini.");
  }

  const analysis = aiData.candidates[0].content.parts[0].text;

  // 6. Cache the result for next time
  await chrome.storage.local.set({ [cacheKey]: analysis });

  return analysis;
}