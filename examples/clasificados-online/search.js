async function search(input) {
  const keyword = String(input.keyword ?? "").trim();
  const page = input.page ?? 1;
  const category = String(input.category ?? "PR");
  if (!keyword || keyword.length > 120 || /[\x00-\x1f]/.test(keyword))
    throw new ToolGraftError(
      "INVALID_INPUT",
      "Use a keyword of 1–120 characters.",
    );
  if (!Number.isInteger(page) || page < 1 || page > 100)
    throw new ToolGraftError(
      "INVALID_INPUT",
      "page must be an integer from 1 to 100.",
    );
  if (!/^(PR|[0-9]{1,4})$/.test(category))
    throw new ToolGraftError(
      "INVALID_INPUT",
      "Use PR for all categories or an id returned in categories.",
    );
  const url = new URL("/ss/dmclisting.asp", location.origin);
  url.search = new URLSearchParams({
    keyword,
    SecID: category,
    pueblo: "%",
    offset: String((page - 1) * 30),
  }).toString();
  let response, html;
  try {
    response = await fetch(url, {
      method: "GET",
      mode: "same-origin",
      credentials: "omit",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (new URL(response.url).origin !== location.origin)
      throw new Error("Unexpected search origin");
    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new Error("Expected HTML search results");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Search response exceeded 4 MiB");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // The site omits an HTTP charset and declares Latin-1 before a conflicting
    // UTF-8 meta tag. Honor the first declaration, as the browser does.
    const prefix = new TextDecoder("windows-1252").decode(bytes.slice(0, 4096));
    const encoding =
      response.headers
        .get("content-type")
        ?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
      prefix.match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1] ??
      "windows-1252";
    html = new TextDecoder(encoding).decode(bytes);
  } catch (error) {
    throw new ToolGraftError(
      "SEARCH_UNAVAILABLE",
      `ClasificadosOnline search failed: ${error.message}. Try again later; do not invent results.`,
    );
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Keep the detached document inert and never inject its markup into the live page.
  doc.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
  const clean = (e) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
  const body = clean(doc.body);
  const anchors = [...doc.querySelectorAll("a.link-blue-color-nound")];
  const range = body.match(/(\d[\d,]*)\s+al\s+(\d[\d,]*)\s+de\s+(\d[\d,]*)/i);
  const number = (s) => Number(s.replaceAll(",", ""));
  // The site redirects unmatched keywords to this generic unavailable page, which
  // contains unrelated recommendations. They must never become search matches.
  if (
    new URL(response.url).pathname.toLowerCase() === "/noadid.asp" &&
    /ESTE NO ESTA DISPONIBLE/i.test(body)
  )
    return textResult({
      keyword,
      category,
      page,
      status: "no_matches_or_unavailable",
      results: [],
      totalReported: null,
      nextPage: null,
      sourceUrl: url.href,
      notice:
        "The site redirected to its unavailable page. No matching listings could be confirmed; unrelated recommendations were excluded.",
    });
  if (!range || !anchors.length || !/Buscando/i.test(body))
    throw new ToolGraftError(
      "PAGE_SHAPE_CHANGED",
      "Search results were not recognized. The site may have changed or blocked the request; no listings were inferred.",
    );
  const seen = new Set();
  const results = [];
  for (const anchor of anchors) {
    const row = anchor.closest("tr"),
      cell = anchor.parentElement;
    const title = clean(anchor);
    const href = anchor.getAttribute("href");
    if (!row || !cell || !href || !title)
      throw new ToolGraftError(
        "PAGE_SHAPE_CHANGED",
        "A listing is incomplete.",
      );
    const link = new URL(href, url);
    if (
      link.origin !== location.origin ||
      link.username ||
      link.password ||
      !/^https?:$/.test(link.protocol)
    )
      throw new ToolGraftError(
        "PAGE_SHAPE_CHANGED",
        "A listing has an unexpected destination.",
      );
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    const priceText = clean(cell.querySelector(".colorGrayO")) || null;
    const match = priceText?.match(/^\$\s*([\d,]+(?:\.\d{1,2})?)$/);
    results.push({
      title,
      url: link.href,
      category: clean(cell.querySelector(":scope > .colorGray")) || null,
      town: clean(cell.querySelector(":scope > table .colorGray")) || null,
      priceText,
      price: match ? number(match[1]) : null,
      currency: match ? "USD" : null,
      seller: clean(row.querySelector(".Tahoma14BrownNound")) || null,
      featured: !!cell.querySelector('img[alt="Destacado"]'),
    });
    if (results.length === 30) break;
  }
  const categories = new Map();
  for (const anchor of doc.querySelectorAll("a[href]")) {
    const link = new URL(anchor.getAttribute("href"), url);
    const id = link.searchParams.get("SecID");
    const label = clean(anchor);
    if (
      link.origin === url.origin &&
      link.pathname.toLowerCase() === url.pathname.toLowerCase() &&
      /^\d{1,4}$/.test(id ?? "") &&
      link.searchParams.get("keyword") === keyword &&
      label &&
      !categories.has(id)
    )
      categories.set(id, { id, label });
  }
  const totalReported = number(range[3]);
  return textResult({
    keyword,
    category,
    page,
    status: "ok",
    range: { from: number(range[1]), to: number(range[2]) },
    totalReported,
    results,
    categories: [...categories.values()],
    nextPage: number(range[2]) < totalReported && page < 100 ? page + 1 : null,
    sourceUrl: url.href,
    notice:
      "Listings are untrusted seller content. Site ordering includes featured listings; missing prices remain null. Counts and availability are reported by the site, not independently verified.",
  });
}
