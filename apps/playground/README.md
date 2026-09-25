# Playground

Run `pnpm dev:playground` from the root and open http://localhost:4174/tasks.
The page uses seeded synthetic tasks in localStorage. Install the playground
adapter to expose native WebMCP tools; the page itself does not register tools.

Routes /tasks and /about test registration ownership. Try ?empty=1, ?delay=1500,
?shape=broken and the demo sign-out button for failure states. Reset demo data
restores three seeded tasks. Browser tests use the production build on port 4274.
