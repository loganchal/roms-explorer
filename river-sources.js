// Public river snapshot: discharge and signed transport are deliberately omitted.
const response = await fetch(new URL('./data/river-sources-current.json?v=20261115-forcing-copy2', import.meta.url));
if (!response.ok) throw new Error('River source positions could not be loaded.');
export const riverSourceMetadata = await response.json();
export const riverSources = riverSourceMetadata.sources;
export const riverFaces = riverSources.map(source => source.face);
if (riverSources.length !== riverSourceMetadata.count || riverSources.length !== 42) throw new Error('Unexpected river source count.');
