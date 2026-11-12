// Keep the first paint independent of the scene's large data download.
const veil = document.getElementById("entrance");
const viewport = document.getElementById("viewport");
let failed = false;
const returningToModel=document.documentElement.dataset.modelReturn==="true";

function showFailure(error) {
    if (failed || !veil.isConnected) return;
    failed = true;
    veil.classList.remove("is-leaving");
    veil.classList.add("has-error");
    veil.setAttribute("role", "alert");
    document.getElementById("entrance-message").textContent = "The scene couldn’t open. Please try again.";
    document.getElementById("entrance-recovery").hidden = false;
    document.getElementById("entrance-error").textContent = String(error?.message || error || "Unable to load the model.");
}

document.getElementById("entrance-retry").addEventListener("click", () => location.reload());
window.addEventListener("error", (event) => {
    if (event.error || event.message) showFailure(event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => showFailure(event.reason));

// Two frames let the veil paint before parsing/initializing model data.
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
try {
    await nextFrame();
    await nextFrame();
    const minimumEntranceEnd = performance.now() + (returningToModel ? 0 : 3500);
    await new Promise((resolve, reject) => {
        const data = document.createElement("script");
        data.src = "scene_data.js";
        data.onload = resolve;
        data.onerror = () => reject(new Error("The model data could not be downloaded. Check your connection and try again."));
        document.body.appendChild(data);
    });
    const { mountAssembly } = await import("./assembly_scene.js?v=20261112-anomaly-faces");
    mountAssembly();
    history.replaceState({...history.state,modelVisited:true},"",location.href); // Returns after UI setup and the first successful WebGL render.
    await nextFrame();
    await nextFrame();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, minimumEntranceEnd - performance.now())));
    if (!failed) {
        viewport.classList.remove("scene-pending");
        viewport.setAttribute("aria-busy", "false");
        document.dispatchEvent(new Event("model-entrance-finished"));
        veil.classList.add("is-leaving");
        // Keep input/focus behind the veil until its visual exit finishes.
        const finish = () => {
            if (failed) return;
            viewport.inert = false;
            veil.remove();
        };
        if (returningToModel || matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
        else veil.addEventListener("transitionend", event => {
            if (event.target === veil && event.propertyName === "opacity") finish();
        });
    }
} catch (error) {
    showFailure(error);
}
