# ROMS extension domain explorer

Interactive 3D view of a NZ 5 km ROMS ocean-model domain.

**Live:** https://loganchalmers.net/roms-explorer/

Static export from a private thesis codebase — no build step, open
`index.html` to run locally.

## Entrance

The guided view paints a lightweight paper entrance before downloading the scene
payload. It reveals the model only after `mountAssembly()` has initialized the
controls and completed its first render, then fades the entrance over 1.2 seconds.
Fine currents drift beside the horizon while ink and rust traces travel along it;
their repeating motion is atmospheric rather than a download-progress indicator.
Reduced-motion visitors get an immediate reveal. Download, module, or rendering
failures retain the entrance with retry, home, and technical-detail controls.
