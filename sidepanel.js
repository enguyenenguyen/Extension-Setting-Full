document.addEventListener('DOMContentLoaded', async () => {
    const mainView = document.getElementById('mainView');
    const settingsView = document.getElementById('settingsView');
    const settingsBtn = document.getElementById('settingsBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const debugBtn = document.getElementById('debugBtn');
    const backBtn = document.getElementById('backBtn');
    const prospectForm = document.getElementById('prospectForm');
    const prospectNameDisplay = document.getElementById('prospectName');
    const prospectStatusDisplay = document.getElementById('prospectStatus');
    const pNameInput = document.getElementById('pName');
    const messageEl = document.getElementById('message');

    // Load Settings
    const settings = await chrome.storage.local.get(['webhookUrl']);

    // Initial Request
    requestProspectDetection();

    // Refresh Logic
    refreshBtn.addEventListener('click', () => {
        prospectNameDisplay.innerText = "Recherche...";
        requestProspectDetection();
    });

    debugBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "DUMP_DIAGNOSTICS" });
                showMessage('Logs générés dans la console IG', 'success');
            }
        });
    });

    function requestProspectDetection() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CURRENT_PROSPECT" }).catch(() => { });
            }
        });
    }

    // Navigation
    settingsBtn.addEventListener('click', () => {
        mainView.classList.add('hidden');
        settingsView.classList.remove('hidden');
        document.getElementById('webhookUrl').value = settings.webhookUrl || '';
    });

    backBtn.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        mainView.classList.remove('hidden');
    });

    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        const newSettings = {
            webhookUrl: document.getElementById('webhookUrl').value
        };
        await chrome.storage.local.set(newSettings);
        Object.assign(settings, newSettings);
        showMessage('Config sauvegardée', 'success');
        settingsView.classList.add('hidden');
        mainView.classList.remove('hidden');
    });

    // Listen for events from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "PROSPECT_DETECTED") {
            prospectNameDisplay.innerText = message.name;
            pNameInput.value = message.name;
            prospectStatusDisplay.innerText = "Prospect détecté";
        } else if (message.type === "NO_CONVERSATION") {
            prospectNameDisplay.innerText = "Hors conversation";
            prospectStatusDisplay.innerText = "Ouvrez un DM";
        }
    });

    // WEBHOOK POST
    prospectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!settings.webhookUrl) {
            showMessage('URL Webhook manquante', 'error');
            return;
        }

        const rawData = {
            handle: pNameInput.value,
            status: document.getElementById('status').value,
            note: document.getElementById('notes').value,
            followUpDate: document.getElementById('followUpDate').value || null,
            source: "Instagram Extension",
            timestamp: new Date().toISOString()
        };

        // Filter out empty fields (except handle, source, and timestamp which are mandatory)
        const data = {};
        for (const [key, value] of Object.entries(rawData)) {
            if (value !== "" && value !== null && value !== undefined) {
                data[key] = value;
            }
        }

        try {
            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.innerText = "Envoi...";

            const res = await fetch(settings.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                showMessage('Données envoyées !', 'success');
                document.getElementById('notes').value = "";
                document.getElementById('followUpDate').value = "";
            } else {
                showMessage(`Erreur: ${res.status}`, 'error');
            }
        } catch (err) {
            showMessage(`Erreur réseau`, 'error');
        } finally {
            document.getElementById('submitBtn').disabled = false;
            document.getElementById('submitBtn').innerHTML = `<span>Envoyer les données</span><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        }
    });

    function showMessage(text, type) {
        messageEl.innerText = text;
        messageEl.className = type; // This will correctly set it to 'success' or 'error'
        messageEl.classList.remove('hidden');
        setTimeout(() => messageEl.classList.add('hidden'), 3500);
    }
});
