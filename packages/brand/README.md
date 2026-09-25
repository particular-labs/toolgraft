# ToolGraft brand assets

Website, playground and extension use this same Vite/WXT public directory. Fonts and their OFL
licenses, tokens, brand mark, favicon, icon sizes and the supplied website texture
live here once. `brand.css` owns the palette and surface treatment. Consumer CSS
owns layout and task-specific states.

The logo is authored geometry in icon.svg, matching the supplied site's favicon.
PNG sizes are generated from that SVG by `scripts/generate-brand-icons.mts`.
The texture preserves the supplied website reference; it is not a generated image.
