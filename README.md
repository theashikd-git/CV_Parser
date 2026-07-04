<<<<<<< HEAD
# Vantage Point

A two-sided CV matching platform.

- **Candidates** register, build a Europass-style CV profile (personal info, about me,
  work experience, education, languages, skills), and can auto-fill it by uploading a
  PDF/DOCX CV. Their profile stays editable and searchable. They don't pick matching
  tags — the system derives what it needs from their CV content automatically.
- **Agencies** register, post projects by uploading a requirement document (ToR) or
  typing the requirement, and get an **AI-ranked shortlist** of candidates scored against
  that requirement — each with a fit score and a short written explanation of strengths
  and gaps — so nobody reads 200 CVs by hand.

Everything is saved to a local database file and persists between restarts. Real
individual accounts with hashed passwords. Runs entirely on one machine.

## What's inside

- `server.js` — the backend (Express): accounts, profiles, projects, matching, CV parsing.
- `database.js` — a zero-dependency local database that saves to `db/vantage.json`.
  No database server to install, no native compilation — runs on any machine with Node.
- `taxonomy.js` — the shared list of sectors, skills, and donors used for tagging + matching.
- `public/` — the frontend (one page that adapts to candidate vs agency).

## Setup

1. **Install Node.js** (version 18 or later) from https://nodejs.org

2. **Install dependencies** — open a terminal in this folder and run:
   ```
   npm install
   ```

3. **Create your config file:**
   - Mac/Linux: `cp .env.example .env`
   - Windows: `copy .env.example .env`

4. **Edit `.env`:**
   - `SESSION_SECRET` — change it to any random string.
   - `GEMINI_API_KEY` — optional. If you add a free key from
     https://aistudio.google.com/apikey , candidates can upload a CV and have it
     auto-fill their profile. If you leave it blank, everything still works —
     candidates just fill the form manually.

5. **Start it:**
   ```
   npm start
   ```

6. Open **http://localhost:3000** in your browser.

## Trying it out

1. Open the site, click **Create account**, choose **Candidate**, register, and build
   a profile (or upload a CV to auto-fill it). Save.
2. Log out. Create another account as an **Agency**.
3. As the agency, post a project — pick the required sectors, skills, and donor.
4. Click the project to see the ranked shortlist of all candidates in the system.

Register a few candidates with different backgrounds to see the ranking change per project.

## How matching works

When an agency opens a project, the system reads each candidate's full profile and the
project's requirement text and asks Gemini to score the fit (0–100) with a short honest
explanation of strengths and gaps. This is the main matching path and **needs a
GEMINI_API_KEY** set.

If no key is set (or the AI call fails or hits a rate limit), it falls back to a free
keyword-overlap ranking using tags auto-derived from each CV, so you still get a usable
ordering. The shortlist tells you which mode was used.

Because AI scoring reads every candidate against every project you open, it uses API
calls — one call per shortlist (all candidates are scored together in a single request).
The free Gemini tier is fine for normal use; very large candidate pools use more tokens.

## Notes / limits

- This is a local single-machine build. Data lives in `db/vantage.json`. Back that file
  up if the data matters — deleting it wipes everything.
- Passwords are hashed (bcrypt). Sessions use a signed cookie. For a public deployment
  you'd want HTTPS and a stronger session store, but for local use this is fine.
- CV auto-fill uses Google Gemini's free tier (rate-limited). The raw file is parsed to
  text in your browser; only the text is sent for structuring. The file itself isn't stored.
- To reset everything to empty, stop the server and delete `db/vantage.json`.
=======
# Vantage Point — CV Section Parser

An ATS-style CV parser. Upload a PDF, DOCX, or .txt CV, and it gets broken into
the structured sections a real applicant tracking system stores — contact info,
summary, work experience, education, skills, and certifications — shown
side-by-side with the original text, highlighted to show where each section
came from.

## How it's structured

- `public/index.html` — the frontend. Extracts text from the uploaded file
  in the browser (pdf.js for PDFs, mammoth.js for DOCX), then sends that text
  to your own backend for parsing.
- `server.js` — a small Express server. Holds your free Gemini API key and
  calls Google's Gemini model on the frontend's behalf. The frontend never
  sees your key.
- `package.json` — dependencies.

This split exists because the Gemini API does not allow direct calls from
a browser (no CORS, on purpose — this protects API keys from being exposed in
client-side code). The frontend always talks to your own server, never to
Google directly.

This project uses **Google's Gemini API**, which has a genuinely free tier —
no credit card required to get started, with daily/per-minute rate limits.

## Setup

1. **Install Node.js** (version 18 or later) if you don't have it:
   https://nodejs.org

2. **Install dependencies**, from inside this folder:
   ```bash
   npm install
   ```

3. **Add your free API key**:
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and replace `your-gemini-key-here` with a real key from
   https://aistudio.google.com/apikey — sign in with any Google account,
   click "Create API key." No credit card needed for the free tier.

4. **Start the server**:
   ```bash
   npm start
   ```

5. Open **http://localhost:3000** in your browser. Upload a CV and try it.

## Deploying to your own site

This is a normal Node.js app, so it runs on most hosting providers that
support Node — Render, Railway, Fly.io, a VPS with PM2/systemd, etc.

The general pattern on any of them:
1. Push this folder to a Git repo (or upload directly, depending on the host).
2. Set the `GEMINI_API_KEY` environment variable in the host's dashboard —
   do **not** commit your `.env` file or put the key in any frontend file.
3. Set the start command to `npm start` (or `node server.js`).
4. Most hosts auto-detect the `PORT` environment variable; the server already
   reads `process.env.PORT`, so this should work without changes.

## Notes

- This uses Gemini's free tier, which has rate limits (requests per minute
  and per day). If you parse a lot of CVs back-to-back and hit a limit,
  the server will return an error — wait a bit and try again, or upgrade
  to a paid Gemini plan for higher limits.
- CVs are capped at 14,000 characters of extracted text before being sent to
  Gemini, to keep requests fast and within reasonable token limits. Very long
  CVs will be truncated at that point.
- No data is stored anywhere — each upload is parsed and the result is shown
  in the browser only. Nothing is saved to disk or a database in this version.
- If a CV doesn't parse well, check the browser console and the server's
  terminal output — both log errors with detail.
>>>>>>> da7e240b7c51e458a1ffb5435f0d68dc07962c54
