// ================== Dev-Detective ==================
// Vanilla JS GitHub search client using native fetch() + async/await.

const API = "https://api.github.com";

// OPTIONAL: GitHub Personal Access Token to raise the 60 req/hour limit.
// Keep this EMPTY in any code you push to GitHub. Never commit a real token.
const TOKEN = "";

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);
const output = $("output");
const statusEl = $("status");
const searchForm = $("searchForm");
const battleForm = $("battleForm");
const modeToggle = $("modeToggle");

// ---------- Small helpers ----------

// Build an element safely. textContent never runs HTML, so API data can't inject scripts (XSS-safe).
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  children.forEach((c) => c && node.append(c));
  return node;
}

// Turns "2023-01-25T12:00:00Z" into "25 Jan 2023".
function formatDate(isoString) {
  if (!isoString) return "Unknown";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }); // en-GB gives "25 Jan 2023"
}

// Only allow http(s) links so a weird "blog" value can't become a javascript: link.
function safeUrl(raw) {
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

// Add up stargazers_count across all repos using reduce().
function calculateTotalStars(repos) {
  return repos.reduce((total, repo) => total + repo.stargazers_count, 0);
}

// ---------- API layer ----------

// fetch() only rejects on network failure. For 404/403 we must check response.ok ourselves.
async function fetchJson(url) {
  const headers = { Accept: "application/vnd.github+json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch {
    const err = new Error("Network error");
    err.type = "network";
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    const rateLimited = response.status === 403 || response.status === 429;
    err.type = response.status === 404 ? "notfound" : rateLimited ? "ratelimit" : "http";
    throw err;
  }
  return response.json(); // also async, so we await it
}

const fetchUser = (username) => fetchJson(`${API}/users/${encodeURIComponent(username)}`);

// Endpoint chaining: we use repos_url from the first response to make the second request.
const fetchRepos = (reposUrl, perPage = 5) =>
  fetchJson(`${reposUrl}?sort=created&direction=desc&per_page=${perPage}`);

// ---------- UI states ----------

function announce(text) { statusEl.textContent = text; }

function showLoading(text = "Loading...") {
  output.replaceChildren(
    el("div", { class: "card message" },
      el("div", { class: "spinner", "aria-hidden": "true" }),
      el("p", { text }))
  );
  announce(text);
}

function showError(title, detail) {
  output.replaceChildren(
    el("div", { class: "card message error", role: "alert" },
      el("h2", { text: title }),
      el("p", { text: detail }))
  );
  announce(`${title}. ${detail}`);
}

// Convert any thrown error into a friendly message.
function showFriendlyError(err, username) {
  switch (err.type) {
    case "notfound":
      return showError("User Not Found", `No GitHub user named "${username}". Check the spelling and try again.`);
    case "ratelimit":
      return showError("Rate limit reached", "GitHub allows 60 requests per hour without a token. Wait a while or add a token in script.js.");
    case "network":
      return showError("Connection problem", "Could not reach GitHub. Check your internet and try again.");
    default:
      return showError("Something went wrong", "GitHub returned an unexpected response. Please try again.");
  }
}

function setBusy(busy) {
  $("searchBtn").disabled = busy;
  $("battleBtn").disabled = busy;
}

// ---------- Rendering ----------

function renderProfileCard(user) {
  const site = safeUrl(user.blog);
  return el("article", { class: "card profile" },
    el("img", { src: user.avatar_url, alt: `${user.login}'s avatar` }),
    el("div", {},
      el("h2", { text: user.name || user.login }),
      el("p", { class: "login", text: `@${user.login}` }),
      el("p", { text: user.bio || "No bio available" }),
      el("p", { class: "meta", text: `Joined ${formatDate(user.created_at)}` }),
      el("p", { class: "meta" },
        site
          ? el("a", { href: site, target: "_blank", rel: "noopener noreferrer", text: user.blog })
          : "No portfolio")
    )
  );
}

function renderRepos(repos) {
  const wrap = el("section", { class: "card repos" }, el("h3", { text: "Latest repositories" }));
  if (repos.length === 0) {
    wrap.append(el("p", { class: "meta", text: "No public repositories yet." }));
    return wrap;
  }
  const list = el("ul");
  repos.slice(0, 5).forEach((repo) => {
    const info = [repo.language, `★ ${repo.stargazers_count}`, formatDate(repo.created_at)]
      .filter(Boolean).join("  |  ");
    list.append(el("li", {},
      el("a", { href: repo.html_url, target: "_blank", rel: "noopener noreferrer", text: repo.name }),
      el("span", { class: "info", text: info })));
  });
  wrap.append(list);
  return wrap;
}

function renderFighter(user, stars, result) {
  const label = { winner: "Winner", loser: "Loser", tie: "Tie" }[result];
  return el("article", { class: `card fighter ${result}` },
    el("img", { src: user.avatar_url, alt: `${user.login}'s avatar` }),
    el("h2", { text: user.name || user.login }),
    el("p", { class: "login", text: `@${user.login}` }),
    el("span", { class: "badge", text: label }),
    el("p", { class: "stars", text: `★ ${stars}` }),
    el("p", { class: "meta", text: "total stars" }));
}

// ---------- single search ----------

async function handleSearch(event) {
  event.preventDefault();
  const username = $("username").value.trim();
  if (!username) return showError("Enter a username", "Type a GitHub username such as octocat.");

  setBusy(true);
  showLoading();
  try {
    const user = await fetchUser(username); // 1st request
    const results = [renderProfileCard(user)];

    try {
      const repos = await fetchRepos(user.repos_url); // 2nd request (chained)
      results.push(renderRepos(repos));
    } catch {
      // A repo failure should not hide the profile we already have.
      results.push(el("p", { class: "meta", text: "Could not load repositories." }));
    }
    output.replaceChildren(...results);
    announce(`Showing profile for ${user.login}`);
  } catch (err) {
    showFriendlyError(err, username);
  } finally {
    setBusy(false); 
  }
}

// -------- Battle Mode ----------

// Loads one user + all their repos. Returns {error} instead of throwing,
// so one missing user doesn't stop the whole Promise.all().
async function loadContender(username) {
  try {
    const user = await fetchUser(username);
    const repos = await fetchRepos(user.repos_url, 100);
    return { user, stars: calculateTotalStars(repos) };
  } catch (err) {
    return { error: err, username };
  }
}

async function handleBattle(event) {
  event.preventDefault();
  const name1 = $("user1").value.trim();
  const name2 = $("user2").value.trim();
  if (!name1 || !name2) return showError("Two usernames needed", "Fill in both fields to start a battle.");

  setBusy(true);
  showLoading("Loading both fighters...");
  try {
    // Both fighters load at the same time, which is faster than one after the other.
    const [a, b] = await Promise.all([loadContender(name1), loadContender(name2)]);

    const failed = [a, b].find((r) => r.error);
    if (failed) return showFriendlyError(failed.error, failed.username);

    const tie = a.stars === b.stars;
    const aResult = tie ? "tie" : a.stars > b.stars ? "winner" : "loser";
    const bResult = tie ? "tie" : b.stars > a.stars ? "winner" : "loser";
    const headline = tie
      ? "It's a tie!"
      : `${(a.stars > b.stars ? a : b).user.login} wins!`;

    output.replaceChildren(
      el("p", { class: "banner", text: headline }),
      el("div", { class: "arena" },
        renderFighter(a.user, a.stars, aResult),
        renderFighter(b.user, b.stars, bResult)));
    announce(headline);
  } finally {
    setBusy(false);
  }
}

// ---------- Mode toggle + events ----------

modeToggle.addEventListener("click", () => {
  const on = modeToggle.getAttribute("aria-pressed") !== "true";
  modeToggle.setAttribute("aria-pressed", String(on));
  modeToggle.textContent = `Battle Mode: ${on ? "on" : "off"}`;
  searchForm.hidden = on;
  battleForm.hidden = !on;
  output.replaceChildren();
});

searchForm.addEventListener("submit", handleSearch);
battleForm.addEventListener("submit", handleBattle);
