console.log("IG CRM Extension: Content script loaded.");

let lastUrl = location.href;
const observer = new MutationObserver(() => {
    if (lastUrl !== location.href) {
        lastUrl = location.href;
        console.log("IG CRM Extension: URL changed, starting detection pass.");
        detectProspect();
    }
});
observer.observe(document, { subtree: true, childList: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_CURRENT_PROSPECT") detectProspect();
    else if (request.type === "DUMP_DIAGNOSTICS") dumpAllRoles();
});

detectProspect();

function detectProspect() {
    if (!location.href.includes("/direct/t/")) {
        chrome.runtime.sendMessage({ type: "NO_CONVERSATION" });
        return;
    }
    // High frequency detection for the first 5 seconds
    [300, 1000, 2500, 5000].forEach(delay => setTimeout(performDetection, delay));
}

function getSafeText(el) {
    if (!el) return "";
    try {
        return (el.innerText || el.textContent || "").trim();
    } catch (e) {
        return "";
    }
}

function performDetection() {
    console.log("IG CRM Extension: Running detection...");

    // Priority 1: Find the handle in the link URL (most stable)
    const links = document.querySelectorAll('a[href^="/"]:not([href="/"])');
    const ignoredPaths = ['/direct/', '/explore/', '/reels/', '/p/', '/stories/', '/emails/'];

    let candidates = [];
    links.forEach(a => {
        const rect = a.getBoundingClientRect();
        // Look for links in the right Pane (X > 250) and Header area (Y < 150)
        if (rect.left > 250 && rect.top >= 0 && rect.top < 150) {
            const href = a.getAttribute('href');
            if (!ignoredPaths.some(path => href.startsWith(path))) {
                const handle = href.replace(/\//g, '');
                if (handle && handle.length > 1) {
                    candidates.push({ handle: handle, y: rect.top });
                }
            }
        }
    });

    if (candidates.length > 0) {
        // Sort by Y position to get the top-most (likely the main name)
        candidates.sort((a, b) => a.y - b.y);
        console.log("IG CRM Extension: Found handle in URL:", candidates[0].handle);
        chrome.runtime.sendMessage({ type: "PROSPECT_DETECTED", name: candidates[0].handle });
        return;
    }

    // Priority 2: Fallback to text scanning if URL strategy fails
    const textIgnored = ['réels', 'reels', 'publications', 'posts', 'appel', 'vidéo', 'audio', 'suivie', 'suivi', 'votre', 'amis', 'abonné', 'en ligne', 'il y a', 'rechercher', 'messages', 'entrer', 'informations', 'conversation'];

    const all = document.body.querySelectorAll('a, span[role="link"], div[role="button"], h1, h2');
    let bestText = null;
    let minY = Infinity;

    all.forEach(el => {
        const rect = el.getBoundingClientRect();
        const text = getSafeText(el);
        if (rect.left > 250 && rect.top >= 0 && rect.top < 120 && text.length > 1 && text.length < 50 && !text.includes('\n')) {
            if (!textIgnored.some(word => text.toLowerCase().includes(word))) {
                if (rect.top < minY) {
                    minY = rect.top;
                    bestText = text;
                }
            }
        }
    });

    if (bestText) {
        console.log("IG CRM Extension: Found name in Text:", bestText);
        chrome.runtime.sendMessage({ type: "PROSPECT_DETECTED", name: bestText });
    } else {
        console.log("IG CRM Extension: Could not detect anything in this pass.");
    }
}

function dumpAllRoles() {
    console.log("--- START GLOBAL DIAGNOSTICS ---");
    const elements = document.querySelectorAll('[role], a, button, h1, h2, header');
    elements.forEach((el, i) => {
        try {
            const rect = el.getBoundingClientRect();
            const text = getSafeText(el).substring(0, 60);
            const role = el.getAttribute('role') || "no-role";
            const tag = el.tagName;
            const href = el.getAttribute('href') || "no-href";
            if (rect.top >= 0 && rect.top < 500) {
                console.log(`[${tag}][${role}] X=${rect.left.toFixed(0)} Y=${rect.top.toFixed(0)} Href=${href}: ${text}`);
            }
        } catch (err) { }
    });
    console.log("--- END GLOBAL DIAGNOSTICS ---");
}
