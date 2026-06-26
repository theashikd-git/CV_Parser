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
