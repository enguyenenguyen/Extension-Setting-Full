chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listener for messages from content scripts if needed for background processing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  if (message.type === "PROSPECT_DETECTED") {
    // We could store it here or just let the sidepanel listener handle it
    // side panel must be open to receive messages via chrome.runtime.sendMessage
  }
});
