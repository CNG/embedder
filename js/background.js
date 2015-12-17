/**
 * Listens for the app launching then creates the window
 *
 * @see http://developer.chrome.com/apps/app.window.html
 */
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html', {
    id: 'main',
    outerBounds: {
      width: Math.floor(screen.availWidth * 0.8),
      height: Math.floor(screen.availHeight * 0.8)
    },
    minWidth: 500,
    minHeight: 600
  });
});
