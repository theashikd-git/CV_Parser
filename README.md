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
