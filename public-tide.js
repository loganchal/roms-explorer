// Public NOAA station example. No MetOcean harmonic fields are included.
const response = await fetch(new URL('./data/public-tide-example.json?v=20261115-forcing-copy2', import.meta.url));
if (!response.ok) throw new Error('The public tide example could not be loaded.');
export const publicTide = await response.json();
export const TIDE_NAMES = publicTide.constituents.map(c => c.name);
export const TIDE_PERIOD_HOURS = publicTide.constituents.map(c => c.period);
export function exampleTideFields(size) {
    return Object.fromEntries(publicTide.constituents.map(c => [c.name, {
        amp: new Float32Array(size).fill(c.amplitude),
        phase: new Float32Array(size).fill(c.phase),
    }]));
}
