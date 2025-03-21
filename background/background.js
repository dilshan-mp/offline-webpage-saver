// background.js - FIXED
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'savePage') {
    if (!request.tabId) {
      sendResponse({success: false, error: 'No tab ID provided'});
      return false;
    }
    
    savePage(request.url, request.title, request.tabId, sendResponse);
    return true; // Keep the message channel open for the async response
  } else if (request.action === 'createClonedTab') {
    createClonedTab(request.html, request.title, sendResponse);
    return true; // Keep the message channel open
  }
});

function createClonedTab(html, title, callback) {
  // Create a blob URL for the HTML content
  const blob = new Blob([html], {type: 'text/html'});
  const url = URL.createObjectURL(blob);
  
  // Open a new tab with the cloned content
  chrome.tabs.create({url: url}, function(tab) {
    if (callback) callback({success: true, tabId: tab.id});
  });
}

function savePage(url, title, tabId, callback) {
  // Execute the content script in the tab to get resources
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: getAllResources
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error("Error executing script:", chrome.runtime.lastError);
      if (callback) callback({success: false, error: chrome.runtime.lastError.message});
      return;
    }
    
    if (!results || results.length === 0) {
      if (callback) callback({success: false, error: 'No results from script execution'});
      return;
    }
    
    const resources = results[0].result;
    
    // Create HTML file with embedded resources
    const htmlContent = generateHtmlWithEmbeddedResources(url, title, resources);
    
    // Create sanitized filename based on title
    const filename = (title || 'webpage')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50) + '.html';
    
    // Create a blob for the HTML content
    const blob = new Blob([htmlContent], {type: 'text/html'});
    const blobUrl = URL.createObjectURL(blob);
    
    // Use chrome.downloads API to save the HTML file
    chrome.downloads.download({
      url: blobUrl,
      filename: 'offline_pages/' + filename,
      saveAs: false
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        if (callback) callback({success: false, error: chrome.runtime.lastError.message});
        return;
      }
      
      // Save reference to storage
      chrome.storage.local.get('savedPages', function(data) {
        const savedPages = data.savedPages || [];
        savedPages.push({
          url: url,
          title: title,
          localPath: 'chrome://downloads', // We can't get the actual file path in MV3
          downloadId: downloadId,
          savedAt: new Date().toISOString()
        });
        
        chrome.storage.local.set({savedPages: savedPages}, function() {
          if (callback) callback({success: true, downloadId: downloadId});
        });
      });
    });
  });
}

function generateHtmlWithEmbeddedResources(url, title, resources) {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || url)}</title>
  <style>
    /* Embedded CSS styles */
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .offline-banner {
      background-color: #f8f9fa;
      padding: 10px;
      margin-bottom: 20px;
      border-radius: 4px;
      border: 1px solid #ddd;
      font-size: 14px;
    }
    .offline-banner a {
      color: #1a73e8;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>

  <!-- Embedded CSS from page -->
  <style>
    ${resources.css.join('\n')}
  </style>
</head>
<body>
  <div class="offline-banner">
    This is an offline copy of <a href="${escapeHtml(url)}">${escapeHtml(url)}</a> saved on ${new Date().toLocaleString()}.
  </div>

  <!-- Main content -->
  ${resources.html}

  <!-- Embedded JavaScript -->
  <script>
    ${resources.js.join('\n')}
  </script>

  ${resources.images.map(img => `<img src="${img.dataUri}" alt="${escapeHtml(img.alt)}">`).join('\n')}

</body>
</html>`;

  return html;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// This function will be executed in the context of the web page
// This function will be executed in the context of the web page
async function getAllResources() {
  const resources = {
    html: document.documentElement.outerHTML,
    css: [],
    js: [],
    images: []
  };

  // Extract CSS from stylesheets
  const styleSheets = Array.from(document.styleSheets);
  styleSheets.forEach(styleSheet => {
    try {
      if (styleSheet.cssRules) {
        const cssText = Array.from(styleSheet.cssRules)
          .map(rule => rule.cssText)
          .join('\n');
        resources.css.push(cssText);
      }
    } catch (e) {
      // Skip cross-origin stylesheets that can't be accessed
    }
  });

  // Extract inline stylesheets
  const styleElements = Array.from(document.querySelectorAll('style'));
  styleElements.forEach(style => {
    resources.css.push(style.textContent);
  });

  // Extract images and convert to data URIs
  const images = Array.from(document.querySelectorAll('img'));
  for (const img of images) {  // Use a loop to allow `await`
    if (img.src) {
      try {
        const dataUri = await getImageDataUri(img.src);
        if(dataUri) {
            resources.images.push({
                src: img.src,
                alt: img.alt || '',
                dataUri: dataUri
              });
        }
      } catch (e) {
        console.warn('Failed to fetch image:', img.src, e); // Log failures
      }
    }
  }

  // Extract inline JavaScript
  const scriptElements = Array.from(document.querySelectorAll('script'));
  scriptElements.forEach(script => {
    if (!script.src && script.textContent) {
      resources.js.push(script.textContent);
    }
  });

  return resources;
}

async function getImageDataUri(url) {
  try {
    const response = await fetch(url, {mode: 'cors'});
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to get data URI for", url, e);
    return null;
  }
}