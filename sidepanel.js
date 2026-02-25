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
    const pStatusSelect = document.getElementById('status');
    const pNotesTextarea = document.getElementById('notes');
    const pFollowUpInput = document.getElementById('followUpDate');
    const globalSyncBtn = document.getElementById('globalSyncBtn');
    const syncBadge = document.getElementById('syncBadge');

    // Load Settings
    const settings = await chrome.storage.local.get(['webhookUrl']);

    // Initial Request
    requestProspectDetection();
    updateSyncBadge(); // Update badge on load

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

    // --- Profile Local Storage Logic ---

    async function loadProfileData(username) {
        if (!username) return;
        const key = `profile_${username}`;
        const result = await chrome.storage.local.get([key]);
        const profile = result[key] || {};

        // Fill form with stored data (or empty)
        pStatusSelect.value = profile.status || "";
        pNotesTextarea.value = profile.note || "";
        pFollowUpInput.value = profile.followUpDate || "";
    }

    async function saveProfileData() {
        const username = pNameInput.value;
        if (!username) return;

        const key = `profile_${username}`;
        const profile = {
            status: pStatusSelect.value,
            note: pNotesTextarea.value,
            followUpDate: pFollowUpInput.value,
            lastUpdated: new Date().toISOString(),
            synced: false // Mark as unsynced on change
        };

        const dataToSave = {};
        dataToSave[key] = profile;
        await chrome.storage.local.set(dataToSave);
        console.log(`Données locales sauvegardées pour ${username}`);
        updateSyncBadge();
    }

    // Auto-save on any change
    [pStatusSelect, pNotesTextarea, pFollowUpInput].forEach(el => {
        el.addEventListener('input', saveProfileData);
    });
    // For select and date, 'change' is sometimes more reliable
    [pStatusSelect, pFollowUpInput].forEach(el => {
        el.addEventListener('change', saveProfileData);
    });

    globalSyncBtn.addEventListener('click', async () => {
        if (!settings.webhookUrl) {
            showMessage('URL Webhook manquante', 'error');
            return;
        }

        const allData = await chrome.storage.local.get(null);
        const unsyncedProfiles = Object.keys(allData)
            .filter(key => key.startsWith('profile_') && allData[key].synced === false)
            .map(key => ({ key, username: key.replace('profile_', ''), ...allData[key] }));

        if (unsyncedProfiles.length === 0) {
            showMessage('Tout est déjà synchronisé', 'success');
            return;
        }

        try {
            globalSyncBtn.disabled = true;
            globalSyncBtn.classList.add('syncing');

            const dataToSend = unsyncedProfiles.map(profile => ({
                handle: profile.username,
                status: profile.status,
                note: profile.note,
                followUpDate: profile.followUpDate || null,
                source: "Instagram Extension (Bulk)",
                timestamp: new Date().toISOString()
            }));

            const res = await fetch(settings.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });

            if (res.ok) {
                // Mark all as synced locally
                for (const profile of unsyncedProfiles) {
                    profile.synced = true;
                    const updateObj = {};
                    const { key, username, ...cleanProfile } = profile;
                    updateObj[key] = cleanProfile;
                    await chrome.storage.local.set(updateObj);
                }
                showMessage(`${unsyncedProfiles.length} profils envoyés !`, 'success');
            } else {
                console.error(`Erreur synchro globale: ${res.status}`);
                showMessage(`Erreur: ${res.status}`, 'error');
            }
        } catch (err) {
            console.error('Erreur globale synchro:', err);
            showMessage('Erreur réseau lors de la synchro', 'error');
        } finally {
            globalSyncBtn.disabled = false;
            globalSyncBtn.classList.remove('syncing');
            updateSyncBadge();
        }
    });

    async function updateSyncBadge() {
        const allData = await chrome.storage.local.get(null);
        const unsyncedCount = Object.keys(allData)
            .filter(key => key.startsWith('profile_') && allData[key].synced === false)
            .length;

        if (unsyncedCount > 0) {
            syncBadge.innerText = unsyncedCount;
            syncBadge.classList.remove('hidden');
        } else {
            syncBadge.classList.add('hidden');
        }
    }

    // Listen for events from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "PROSPECT_DETECTED") {
            prospectNameDisplay.innerText = message.name;
            pNameInput.value = message.name;
            prospectStatusDisplay.innerText = "Prospect détecté";
            loadProfileData(message.name); // Load stored data instantly
        } else if (message.type === "NO_CONVERSATION") {
            prospectNameDisplay.innerText = "Hors conversation";
            prospectStatusDisplay.innerText = "Ouvrez un DM";
            pNameInput.value = "";
            pStatusSelect.value = "";
            pNotesTextarea.value = "";
            pFollowUpInput.value = "";
        }
    });

    function showMessage(text, type) {
        messageEl.innerText = text;
        messageEl.className = type; // This will correctly set it to 'success' or 'error'
        messageEl.classList.remove('hidden');
        setTimeout(() => messageEl.classList.add('hidden'), 3500);
    }
});
