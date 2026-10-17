# Dev-Detective

GitHub profile search client built with vanilla HTML, CSS and JavaScript (native `fetch` + `async/await`).

## Run
Open `index.html` in a browser. No build step.

## Features
- **Phase 1:** search a username, profile card (avatar, name, bio, join date, portfolio), loading spinner, "User Not Found" on 404.
- **Phase 2:** chained request via `repos_url`, 5 latest repos as new-tab links, `formatDate()` helper.
- **Phase 3:** Battle Mode with `Promise.all()`, total stars via `reduce()`, green Winner / red Loser (neutral on tie).

## Rate limits
Unauthenticated GitHub requests are limited to 60 per hour. Optionally set `TOKEN` in `script.js` for local testing. Never commit a real token.

## Demo tips
- Loading state: DevTools > Network > set throttling to "Slow 3G", then search.
- 404 state: search `asdkjh12398xyz`.
