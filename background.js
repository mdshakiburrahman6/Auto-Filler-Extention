chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onInstalled.addListener(d => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
