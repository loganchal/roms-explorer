/* The entrance and control strip share one decoded painting at a time. */
(async () => {
    const root = document.documentElement;
    if (root.dataset.theme !== "etretat") return;
    if(root.dataset.modelReturn) {
        try {
            const art=JSON.parse(sessionStorage.getItem("ocean-model-active-art"));
            if(art?.url?.startsWith("/assets/monet/")) {
                root.style.setProperty("--ocean-painting",'url("'+art.url+'")');
                root.style.setProperty("--ocean-strip-size",art.size);
                root.style.setProperty("--ocean-strip-position",art.position);
                root.dataset.oceanPainting=art.id;root.dataset.oceanArt="ready";
            }
        } catch(_) {}
        return;
    }

    let locked = false;
    let timer;
    document.addEventListener("model-entrance-finished", () => {
        locked = true;
        clearInterval(timer);
    });
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const storageKey = "ocean-model-next-painting";
    const stripCrops = {
        ngv: ["150% auto", "0% 75%"],
        courtauld: ["180% auto", "100% 78%"],
        "port-coton": ["200% auto", "100% 82%"],
        varengeville: ["100% auto", "50% 20%"],
        bordighera: ["600% auto", "70% 49%"],
        "cliff-walk": ["320% auto", "0% 62%"],
        etretat: ["300% auto", "0% 72%"]
    };
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
        if (busy || locked) return;
        busy = true;
        const index = nextIndex;
        nextIndex = (index + 1) % paintings.length;
        try {
            await prepare(index);
            if (locked) return;
            root.style.setProperty("--ocean-painting", 'url("' + paintings[index].url + '")');
            const crop = stripCrops[paintings[index].id] || ["100% auto", "50% 68%"];
            root.style.setProperty("--ocean-strip-size", crop[0]);
            root.style.setProperty("--ocean-strip-position", crop[1]);
            root.dataset.oceanPainting = paintings[index].id;
            root.dataset.oceanArt = "ready";
            try { sessionStorage.setItem("ocean-model-active-art",JSON.stringify({url:paintings[index].url,id:paintings[index].id,size:crop[0],position:crop[1]})); } catch(_) {}
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
        if (!locked && !preference.matches && !document.hidden) timer = setInterval(advance, 8000);
    }

    await advance();
    schedule();
    preference.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
})();
