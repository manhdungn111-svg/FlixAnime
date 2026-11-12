/**
 * FlixAnime — AnimeVietsub browser adapter
 * Port of the public-page parsing portions identified in Animevietsub.cs3.
 *
 * IMPORTANT:
 * - Browser requests need same-origin deployment or an authorized CORS backend.
 * - This module does NOT bypass Cloudflare, harvest clearance cookies, decrypt
 *   protected playlists, or intercept protected video requests.
 * - A server/iframe that blocks embedding must be opened on its official page.
 */

const DEFAULTS = {
  baseURL: "https://animevietsub.site",
  // Set this to your own same-origin backend, e.g. "/api/animevietsub?url="
  // Backend must fetch only public pages you are authorized to access.
  proxyURL: "",
  timeout: 15000,
};

export class AnimeVietSub {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.baseURL = this.options.baseURL.replace(/\/+$/, "");
  }

  absolute(url) {
    if (!url) return "";
    try { return new URL(url, this.baseURL).href; }
    catch { return ""; }
  }

  async request(url, init = {}) {
    const target = this.absolute(url);
    if (!target) throw new Error("URL AnimeVietsub không hợp lệ");
    const requestURL = this.options.proxyURL
      ? `${this.options.proxyURL}${encodeURIComponent(target)}`
      : target;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeout);
    try {
      const response = await fetch(requestURL, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          ...(init.headers || {}),
        },
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`AnimeVietsub HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("AnimeVietsub phản hồi quá lâu");
      if (error instanceof TypeError) {
        throw new Error("Trình duyệt bị chặn CORS hoặc website không truy cập được. Hãy dùng backend cùng origin hợp lệ.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async html(url, init) {
    const response = await this.request(url, init);
    return new DOMParser().parseFromString(await response.text(), "text/html");
  }

  async search(query) {
    const q = String(query || "").trim();
    if (!q) return [];
    // Provider code includes /ajax/suggest and /tim-kiem/ search paths.
    const suggestURL = `/ajax/suggest?keysearch=${encodeURIComponent(q)}`;
    try {
      const response = await this.request(suggestURL, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const raw = await response.text();
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const cards = this.parseCards(doc);
      if (cards.length) return cards;
      try {
        const json = JSON.parse(raw);
        const html = json.html || json.data || json.result || "";
        if (typeof html === "string") {
          const fragment = new DOMParser().parseFromString(html, "text/html");
          const found = this.parseCards(fragment);
          if (found.length) return found;
        }
      } catch {}
    } catch (error) {
      // Fall through to the normal search page; do not evade access controls.
      if (/Cloudflare|CORS/.test(error.message)) throw error;
    }

    const doc = await this.html(`/tim-kiem/${encodeURIComponent(q)}/`);
    return this.parseCards(doc);
  }

  parseCards(doc) {
    const selectors = [
      ".TPost", ".movie-item", ".item", ".list-film .item",
      ".film-item", ".MovieList .TPost", ".search-item",
    ];
    const nodes = [...new Set(selectors.flatMap(s => [...doc.querySelectorAll(s)]))];
    return nodes.map(node => {
      const a = node.querySelector('a[href*="xem-phim"], a[href]');
      const img = node.querySelector("img");
      const title = (a?.getAttribute("title") || img?.getAttribute("alt") ||
        node.querySelector("h2,h3,.title")?.textContent || "").trim();
      const url = this.absolute(a?.getAttribute("href"));
      if (!url || !title) return null;
      return {
        title,
        url,
        poster: this.absolute(img?.getAttribute("data-src") ||
          img?.getAttribute("data-original") || img?.getAttribute("src")),
        quality: node.querySelector(".quality,.Qlty")?.textContent.trim() || "",
        episodeLabel: node.querySelector(".episode,.ep")?.textContent.trim() || "",
      };
    }).filter(Boolean).filter((item, i, arr) =>
      arr.findIndex(x => x.url === item.url) === i);
  }

  async getDetails(url) {
    const doc = await this.html(url);
    const title = (
      doc.querySelector("h1")?.textContent ||
      doc.querySelector('meta[property="og:title"]')?.content || ""
    ).trim();
    const poster = this.absolute(
      doc.querySelector('meta[property="og:image"]')?.content ||
      doc.querySelector(".poster img")?.getAttribute("src") ||
      doc.querySelector(".TPost .Image img")?.getAttribute("src")
    );
    const description = (
      doc.querySelector(".content p, .TPost .Description, .detail-content")?.textContent ||
      doc.querySelector('meta[name="description"]')?.content || ""
    ).trim();

    const info = [...doc.querySelectorAll("ul.InfoList li, .ss-info p")]
      .map(el => el.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);

    return {
      title, url: this.absolute(url), poster, description, info,
      genres: [...doc.querySelectorAll('a[href*="the-loai"], a[href*="genre"]')]
        .map(a => a.textContent.trim()).filter(Boolean),
      episodes: this.parseEpisodes(doc),
    };
  }

  parseEpisodes(doc) {
    const selector =
      "ul.list-episode > li > a.btn-episode, div.list-episode a, .list-episode a";
    const links = [...doc.querySelectorAll(selector)];
    const unique = new Map();
    for (const a of links) {
      const url = this.absolute(a.getAttribute("href"));
      if (!url || unique.has(url)) continue;
      const label = (a.textContent || a.getAttribute("title") || "").trim();
      const match = label.match(/(?:tập|episode|ep)?\s*([\d.]+)/i);
      unique.set(url, {
        title: label || `Tập ${unique.size + 1}`,
        number: match ? Number(match[1]) : unique.size + 1,
        url,
        active: a.matches(".active"),
      });
    }
    return [...unique.values()].sort((a, b) => a.number - b.number);
  }

  async getEpisodeSources(episodeURL) {
    const doc = await this.html(episodeURL);
    const servers = [...doc.querySelectorAll("div.server-group, li.backup-server")]
      .map(group => {
        const name = group.querySelector("h3.server-name, h3.server-title, .server-name")
          ?.textContent.trim() || "Server";
        const links = [...group.querySelectorAll("a[href], [data-link], [data-src]")]
          .map(el => {
            const raw = el.getAttribute("href") || el.getAttribute("data-link") ||
              el.getAttribute("data-src");
            return {
              label: (el.textContent || name).trim(),
              url: this.absolute(raw),
            };
          }).filter(x => x.url);
        return { name, links };
      }).filter(group => group.links.length);

    const iframe = doc.querySelector("iframe[src]");
    const iframeURL = this.absolute(iframe?.getAttribute("src"));
    const direct = [...doc.querySelectorAll('video source[src], a[href*=".m3u8"]')]
      .map(el => this.absolute(el.getAttribute("src") || el.getAttribute("href")))
      .filter(Boolean);

    return {
      servers,
      iframeURL,
      directSources: [...new Set(direct)],
      // This is a server/iframe discovery result, not proof of a playable stream.
      note: "Nguồn iframe cần được máy chủ cho phép nhúng. Không tự giải mã playlist được bảo vệ.",
    };
  }
}

/** Convenience instance for simple websites. */
export const animeVietSub = new AnimeVietSub();
