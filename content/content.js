chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'ping') {
    sendResponse({status: 'ready'});
    return true;
  }
  
  if (request.action === 'clonePage') {
    try {
      // Clone the page
      const clonedHtml = document.documentElement.outerHTML;
      
      // Create a new tab with the cloned content
      chrome.runtime.sendMessage({
        action: 'createClonedTab',
        html: clonedHtml,
        title: document.title
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error creating cloned tab:", chrome.runtime.lastError);
          sendResponse({success: false, error: chrome.runtime.lastError.message});
        } else {
          sendResponse({success: true});
        }
      });
      
      return true; // Keep the message channel open
    } catch (e) {
      console.error("Error in clonePage:", e);
      sendResponse({success: false, error: e.message});
      return true;
    }
  }
});