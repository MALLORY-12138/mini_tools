const MENU_ROOT = "mini-tools-root";
const MENU_COUNTRY = "mini-tools-country";
const MENU_EXCHANGE = "mini-tools-exchange";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: "Mini Tools",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_COUNTRY,
      parentId: MENU_ROOT,
      title: "查地区",
      contexts: ["selection"],
    });

    chrome.contextMenus.create({
      id: MENU_EXCHANGE,
      parentId: MENU_ROOT,
      title: "查汇率",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) {
    return;
  }

  const actionByMenuId = {
    [MENU_COUNTRY]: "lookupCountry",
    [MENU_EXCHANGE]: "lookupExchange",
  };
  const action = actionByMenuId[info.menuItemId];
  if (!action) {
    return;
  }

  await sendLookupMessage(tab.id, {
    type: "miniToolsLookup",
    action,
    selectionText: info.selectionText,
  });
});

async function sendLookupMessage(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "miniToolsPing" });
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["src/styles.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"],
    });
  }

  await chrome.tabs.sendMessage(tabId, payload);
}
