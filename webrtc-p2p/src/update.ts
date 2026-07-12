/**
 * Manual "check for update" for the installed PWA. The service worker is registered
 * with autoUpdate (skipWaiting + clientsClaim), so once a new version is fetched it
 * activates immediately — we just have to trigger the check and reload into it.
 */
export async function checkForAppUpdate(onStatus: (s: string) => void): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    onStatus("This browser can't install updates — just reload the page.");
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    // Not installed / SW not active (e.g. dev server): a plain reload gets the latest.
    onStatus("No installed copy detected — reloading the latest…");
    setTimeout(() => location.reload(), 600);
    return;
  }

  onStatus("Checking for a new version…");
  let reloading = false;
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    onStatus("Updating — reloading…");
    setTimeout(() => location.reload(), 300);
  };
  // When the new worker takes control, reload so the fresh assets are used.
  navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);

  try {
    await reg.update();
  } catch {
    onStatus("Couldn't check — are you online?");
    return;
  }

  const fresh = reg.installing ?? reg.waiting;
  if (fresh) {
    onStatus("Update found — installing…");
    fresh.addEventListener("statechange", () => {
      if (fresh.state === "activated") reloadOnce();
    });
    // Safety net in case controllerchange doesn't fire (some browsers).
    setTimeout(() => {
      if (!reloading && (reg.waiting || navigator.serviceWorker.controller !== null)) reloadOnce();
    }, 4000);
  } else {
    onStatus("You're on the latest version ✓");
  }
}
