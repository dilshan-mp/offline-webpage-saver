// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const saveButton = document.getElementById('saveButton');
  const statusElement = document.getElementById('status');
  const pagesList = document.getElementById('pagesList');

  // Load saved pages
  loadSavedPages();

  // Add click handler for save button
  saveButton.addEventListener('click', function() {
    saveCurrentPage();
  });

  // Function to save the current page
  function saveCurrentPage() {
    statusElement.textContent = 'Saving page...';

    // Get current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) {
        statusElement.textContent = 'Error: No active tab found';
        return;
      }

      const tab = tabs[0];
      const url = tab.url;
      const title = tab.title;

      // Execute script to get page content
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: getPageContent
      }, function(results) {
        if (chrome.runtime.lastError) {
          statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }

        if (!results || !results[0]) {
          statusElement.textContent = 'Error: Could not get page content';
          return;
        }

        const pageContent = results[0].result;
        
        // Generate HTML file
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHTML(title)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .banner {
      background: #f0f0f0;
      padding: 10px;
      margin-bottom: 20px;
      border-radius: 5px;
    }
    img { max-width: 100%; height: auto; }
  </style>
  ${pageContent.styles}
</head>
<body>
  <div class="banner">
    This is an offline copy of <a href="${escapeHTML(url)}">${escapeHTML(url)}</a> saved on ${new Date().toLocaleString()}.
  </div>
  ${pageContent.body}
</body>
</html>`;

        // Create a sanitized filename
        const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50) + '.html';
        
        // Create a blob with the HTML content
        const blob = new Blob([htmlContent], {type: 'text/html'});
        const blobUrl = URL.createObjectURL(blob);

        // Download the file
        chrome.downloads.download({
          url: blobUrl,
          filename: 'saved_pages/' + filename,
          saveAs: false
        }, function(downloadId) {
          if (chrome.runtime.lastError) {
            statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
            return;
          }
          
          // Save to storage
          savePage(url, title, downloadId);
          statusElement.textContent = 'Page saved successfully!';
        });
      });
    });
  }

  // Function to save page info to storage
  function savePage(url, title, downloadId) {
    chrome.storage.local.get({savedPages: []}, function(data) {
      const savedPages = data.savedPages;
      savedPages.push({
        url: url,
        title: title,
        downloadId: downloadId,
        date: new Date().toISOString()
      });
      
      chrome.storage.local.set({savedPages: savedPages}, function() {
        loadSavedPages();
      });
    });
  }

  // Function to load saved pages
  function loadSavedPages() {
    chrome.storage.local.get({savedPages: []}, function(data) {
      const savedPages = data.savedPages;
      
      pagesList.innerHTML = '';
      
      if (savedPages.length === 0) {
        pagesList.innerHTML = '<li>No pages saved yet</li>';
        return;
      }
      
      savedPages.forEach(function(page, index) {
        const li = document.createElement('li');
        
        const link = document.createElement('a');
        link.textContent = page.title || page.url;
        link.href = '#';
        link.title = page.url;
        link.onclick = function() {
          chrome.downloads.show(page.downloadId);
          return false;
        };
        
        li.appendChild(link);
        pagesList.appendChild(li);
      });
    });
  }

  // Helper function to escape HTML
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});

// Function to get page content - will be executed in page context
function getPageContent() {
  // Get all styles
  let styles = '';
  
  // Get inline styles
  const styleElements = document.querySelectorAll('style');
  for (const style of styleElements) {
    styles += '<style>' + style.textContent + '</style>\n';
  }
  
  // Get linked stylesheets
  const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of linkElements) {
    styles += '<link rel="stylesheet" href="' + link.href + '">\n';
  }
  
  // Get body content
  const bodyContent = document.body.innerHTML;
  
  return {
    styles: styles,
    body: bodyContent
  };
}