import * as THREE from 'three';

// Screen-space annotations stay legible while their endpoints follow the model.
export function createPartsLabels({ viewport, camera, components, onInteract }) {
    const overlay = document.createElement('div');
    overlay.className = 'parts-labels';
    overlay.hidden = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    overlay.append(svg);
    const point = new THREE.Vector3();
    const labels = components.map((component, index) => {
        const link = document.createElement('a');
        link.className = 'parts-label';
        link.href = component.href;
        link.addEventListener("pointerenter", () => onInteract?.());
        link.addEventListener("focus", () => onInteract?.());
        link.addEventListener("pointerdown", ev => ev.stopPropagation());
        const text = document.createElement('span');
        text.textContent = component.title;
        link.append(text);
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrow.setAttribute('viewBox', '0 0 20 20');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = '<path d="M4 16 16 4M5 4h11v11"/>';
        link.append(arrow);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '2');
        svg.append(line, dot);
        overlay.append(link);
        return { ...component, index, link, line, dot };
    });
    viewport.append(overlay);
    viewport.classList.add('parts-labels-ready');
    window.modelLanguage?.refresh();

    function endpoint(item, width, height) {
        // Choose a visible edge vertex, rather than pointing into empty space
        // at the centre of a hollow boundary or tidal frame.
        const right = item.index % 2 === 1;
        let chosen = null, edge = right ? -Infinity : Infinity;
        const objects = item.sources();
        for (const obj of objects) {
            const positions = obj.geometry?.attributes.position;
            const indices = obj.geometry?.index;
            const count = indices?.count || positions?.count || 1;
            const stride = Math.max(1, Math.floor(count / 160));
            for (let i = 0; i < count; i += stride) {
                if (positions) point.fromBufferAttribute(positions, indices ? indices.getX(i) : i);
                else point.set(0, 0, 0);
                obj.localToWorld(point);
                point.project(camera);
                if (point.z < -1 || point.z > 1) continue;
                if ((right && point.x > edge) || (!right && point.x < edge)) {
                    edge = point.x;
                    chosen = { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
                }
            }
        }
        return chosen;
    }
    function update(active) {
        overlay.hidden = !active;
        if (!active) return;
        const width = viewport.clientWidth, height = viewport.clientHeight;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const mobile = width <= 640;
        const placed = [[], []];
        for (const item of labels) {
            const anchor = endpoint(item, width, height);
            if (!anchor) continue;
            const right = item.index % 2 === 1;
            const w = item.link.offsetWidth, h = item.link.offsetHeight;
            const inset = mobile ? 14 : Math.max(30, width * .105);
            const x = right ? width - inset - w : inset;
            const mobileOffset = [-130, -175, 65, 75][item.index];
            let y = Math.round(Math.max(mobile ? 90 : 205, Math.min(height - (mobile ? 195 : 85), mobile ? anchor.y + mobileOffset : anchor.y - h - 15)));
            for (const prev of placed[+right]) if (Math.abs(y - prev) < h + 18) y = prev + h + 18;
            placed[+right].push(y);
            item.link.style.transform = `translate(${x}px,${y}px)`;
            const verticallyAligned = anchor.x >= x && anchor.x <= x + w;
            const startX = verticallyAligned ? anchor.x : right ? x : x + w;
            const startY = verticallyAligned ? (anchor.y > y + h ? y + h : y) : y + h / 2;
            item.line.setAttribute('d', `M${startX},${startY} L${anchor.x},${anchor.y}`);
            item.dot.setAttribute('cx', anchor.x);
            item.dot.setAttribute('cy', anchor.y);
        }
    }
    return { update, element: overlay };
}
