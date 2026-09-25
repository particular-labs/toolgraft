export {};
const status = document.querySelector<HTMLElement>("#registry-status")!;
const list = document.querySelector("#registry")!;
try {
  const response = await fetch("./registry/index.v1.json", {
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      "Registry builds are not published yet. Build locally using the authoring guide.",
    );
  const index = await response.json();
  for (const entry of index.entries) {
    const article = document.createElement("article");
    const h = document.createElement("h2");
    h.textContent = entry.title;
    const p = document.createElement("p");
    p.textContent = `${entry.version} · ${entry.runtime} · ${entry.review}`;
    const sites = document.createElement("p");
    sites.textContent = entry.matches.join(", ");
    article.append(h, p, sites);
    if (/^packages\/[a-z0-9.-]+\/[0-9.]+\/adapter\.tgz$/.test(entry.artifact)) {
      const a = document.createElement("a");
      a.href = "./registry/" + entry.artifact;
      a.textContent = "Download exact package";
      article.append(a);
    }
    list.append(article);
  }
  status.textContent = `${index.entries.length} versioned builds. Public review status is shown per package.`;
} catch (e) {
  status.textContent =
    e instanceof Error
      ? e.message
      : "Registry unavailable. Please try again later.";
}
