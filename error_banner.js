// Shared error banner: without a build step / dev tools safety net, a
// silently-thrown error in the module script would just leave a black
// viewport. Requires a #err element in the page (see explorer.css).
window.addEventListener("error", (e) => {
    const el = document.getElementById("err");
    if (!el) return;
    el.style.display = "block";
    el.textContent += `${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n`;
});
window.addEventListener("unhandledrejection", (e) => {
    const el = document.getElementById("err");
    if (!el) return;
    el.style.display = "block";
    el.textContent += `unhandled rejection: ${e.reason && e.reason.stack || e.reason}\n`;
});
