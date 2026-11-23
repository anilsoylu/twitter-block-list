import { syncBlocklist, type RefreshBlocklistMessage } from '@/utils/blocklist';

const ALARM_NAME = 'refresh-blocklist';
const ALARM_PERIOD_MINUTES = 360;

function isRefreshMessage(message: unknown): message is RefreshBlocklistMessage {
  return (message as RefreshBlocklistMessage | null)?.type === 'refresh-blocklist';
}

export default defineBackground(() => {
  // Listeners must be registered synchronously so a restarted worker receives the event that woke it.
  browser.runtime.onInstalled.addListener(() => {
    void syncBlocklist();
  });

  browser.runtime.onStartup.addListener(() => {
    void syncBlocklist();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void syncBlocklist();
  });

  // Chrome does not accept a returned Promise here, so respond via sendResponse and keep the channel open.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRefreshMessage(message)) return;
    void syncBlocklist().then(sendResponse);
    return true;
  });

  void browser.alarms.get(ALARM_NAME).then((alarm) => {
    if (!alarm) void browser.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  });
});
