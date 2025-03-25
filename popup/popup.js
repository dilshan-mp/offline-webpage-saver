// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const saveButton = document.getElementById('saveButton');
    const statusElement = document.getElementById('status');
    const pagesList = document.getElementById('pagesList');
    const clearAllButton = document.getElementById('clearAllTextButton');

    loadSavedPages();

    saveButton.addEventListener('click', saveCurrentPage);
    clearAllButton.addEventListener('click', clearAllSavedPages);

    function saveCurrentPage() {
        statusElement.textContent = 'Saving page...';

        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs || !tabs[0]) {
                statusElement.textContent = 'Error: No active tab found';
                return;
            }

            const tab = tabs[0];
            const url = tab.url;
            const title = tab.title;

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
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

                const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50) + '.html';
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const blobUrl = URL.createObjectURL(blob);

                chrome.downloads.download({
                    url: blobUrl,
                    filename: 'saved_pages/' + filename,
                    saveAs: false
                }, function(downloadId) {
                    if (chrome.runtime.lastError) {
                        statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
                        return;
                    }

                    savePage(url, title, downloadId);
                    statusElement.textContent = 'Page saved successfully!';
                });
            });
        });
    }

    function savePage(url, title, downloadId) {
        chrome.storage.local.get({ savedPages: [] }, function(data) {
            const savedPages = data.savedPages;
            savedPages.push({
                url: url,
                title: title,
                downloadId: downloadId,
                date: new Date().toISOString()
            });

            chrome.storage.local.set({ savedPages: savedPages }, function() {
                loadSavedPages();
            });
        });
    }

    function loadSavedPages() {
        chrome.storage.local.get({ savedPages: [] }, function(data) {
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



    async function clearAllSavedPages() {
        if (!confirm("Are you sure you want to clear all saved pages? This cannot be undone.")) {
            return;
        }

        statusElement.textContent = 'Clearing saved pages...';

        try {
            const data = await chrome.storage.local.get({ savedPages: [] });
            const savedPages = data.savedPages;

            // Use Promise.all to wait for all removals to complete
            await Promise.all(savedPages.map(page => removePage(page)));

            // Clear storage *after* all removals are done
            await chrome.storage.local.set({ savedPages: [] });
            loadSavedPages();
            statusElement.textContent = 'All pages cleared!';
        } catch (error) {
            console.error("Error clearing saved pages:", error);
            statusElement.textContent = 'Error clearing saved pages. See console for details.';
        }
    }


    // Helper function to remove a single page (wrapped in a Promise)
    function removePage(page) {
        return new Promise(async (resolve, reject) => {
            if (page.downloadId) {
                try {
                    await new Promise((res, rej) => {
                        chrome.downloads.removeFile(page.downloadId, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Error removing file:", chrome.runtime.lastError);
                                // Don't reject; resolve to continue with other deletions
                            }
                            res();
                        });
                    });

                    await new Promise((res, rej) => {
                         chrome.downloads.erase({ id: page.downloadId },(e)=>{
                            if (chrome.runtime.lastError) {
                                console.error("Error erasing download:", chrome.runtime.lastError);
                            }
                            res();
                         });
                    });
                    resolve(); // Resolve after successful removal and erasure
                } catch (error) {
                    console.error("Error in removePage:", error);
                    resolve();  //resolve even on error.
                }
            } else {
                resolve(); // Resolve immediately if there's no downloadId
            }
        });
    }


    function escapeHTML(str) {
        return str
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#39;');
    }
});

function getPageContent() {
    let styles = '';
    const styleElements = document.querySelectorAll('style');
    for (const style of styleElements) {
        styles += '<style>' + style.textContent + '</style>\n';
    }

    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of linkElements) {
        styles += '<link rel="stylesheet" href="' + link.href + '">\n';
    }

    const bodyContent = document.body.innerHTML;
    return { styles: styles, body: bodyContent };
}