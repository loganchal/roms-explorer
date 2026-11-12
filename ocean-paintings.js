/* The entrance and control strip share one decoded painting at a time. */
(async () => {
    const root = document.documentElement;
    if (root.dataset.theme !== "etretat") return;

    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const storageKey = "ocean-model-next-painting";
    let paintings = [{ id: "ngv", url: "/assets/monet/ngv.webp" }];
    try {
        const response = await fetch("/assets/monet/rotation.json");
        if (response.ok) {
            const catalogue = await response.json();
            if (Array.isArray(catalogue) && catalogue.length) paintings = catalogue;
        }
    } catch {}

    let nextIndex = 0;
    try {
        const saved = Number(sessionStorage.getItem(storageKey));
        if (Number.isInteger(saved) && saved >= 0) nextIndex = saved % paintings.length;
    } catch {}

    let prepared;
    let busy = false;
    let timer;

    function prepare(index) {
        if (prepared?.index === index) return prepared.promise;
        const image = new Image();
        image.src = paintings[index].url;
        const promise = image.decode();
        promise.catch(() => {});
        prepared = { index, image, promise };
        return promise;
    }

    async function advance() {
        if (busy) return;
        busy = true;
        const index = nextIndex;
        nextIndex = (index + 1) % paintings.length;
        try {
            await prepare(index);
            root.style.setProperty("--ocean-painting", 'url("' + paintings[index].url + '")');
            root.dataset.oceanPainting = paintings[index].id;
            root.dataset.oceanArt = "ready";
            try {
                sessionStorage.setItem(storageKey, String(nextIndex));
            } catch {}
        } catch {
            // Retain the current picture if the next one cannot be decoded.
        } finally {
            busy = false;
            prepare(nextIndex);
        }
    }

    function schedule() {
        clearInterval(timer);
        if (!preference.matches && !document.hidden) timer = setInterval(advance, 8000);
    }

    await advance();
    schedule();
    preference.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
})();
