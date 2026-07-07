require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const store = require('./database');
const { SECTORS, SKILLS, DONORS } = require('./taxonomy');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== TEST MODE =====
// When true, login is skipped: the front-end shows a Candidate/Agent toggle and
// signs in to fixed test accounts automatically. Set to false to require real login again.
const TEST_MODE = true;
// =====================

app.use(express.json({ limit: '30mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- helpers ---------- */
function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in.' });
    if (role && req.session.role !== role) return res.status(403).json({ error: 'Wrong account type for this action.' });
    next();
  };
}

/* ---------- auth ---------- */
app.post('/api/register', (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password || !['candidate', 'agent'].includes(role))
    return res.status(400).json({ error: 'Email, password, and a valid role are required.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (store.findUserByEmail(email.toLowerCase()))
    return res.status(409).json({ error: 'An account with that email already exists.' });

  const hash = bcrypt.hashSync(password, 10);
  const user = store.createUser(email.toLowerCase(), hash, role);
  if (role === 'candidate') store.createProfile(user.id, email.toLowerCase());

  req.session.userId = user.id;
  req.session.role = role;
  res.json({ ok: true, role });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = store.findUserByEmail(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const user = store.findUserById(req.session.userId);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, id: user.id, email: user.email, role: user.role });
});

app.get('/api/taxonomy', (req, res) => res.json({ SECTORS, SKILLS, DONORS }));

// Tells the front-end whether test mode is on (so it can show the toggle instead of login).
app.get('/api/config', (req, res) => res.json({ testMode: TEST_MODE }));

// Test-mode auto-login. Creates fixed test accounts the first time, then logs in as one.
// Only works while TEST_MODE is true.
app.post('/api/test-login', (req, res) => {
  if (!TEST_MODE) return res.status(403).json({ error: 'Test mode is off.' });
  const role = req.body && req.body.role === 'agent' ? 'agent' : 'candidate';
  const email = role === 'agent' ? 'test-agent@xpie.local' : 'test-candidate@xpie.local';

  // Find the fixed test account, or create it if it doesn't exist yet.
  let user = store.findUserByEmail(email);
  if (!user) {
    const hash = bcrypt.hashSync('test-mode-password', 10);
    user = store.createUser(email, hash, role);
    if (role === 'candidate') store.createProfile(user.id, email);
  }

  req.session.userId = user.id;
  req.session.role = role;
  res.json({ ok: true, role });
});

/* ---------- derive tags from profile text (cheap, keyword-based) ---------- */
function profileText(p) {
  const parts = [p.about_me, p.other_skills, p.digital_skills, p.additional_info];
  (p.work_experience || []).forEach(w => parts.push(w.title, w.organization, w.description));
  (p.education || []).forEach(e => parts.push(e.degree, e.institution));
  return parts.filter(Boolean).join(' ').toLowerCase();
}
function deriveTags(p) {
  const text = profileText(p);
  const pick = list => list.filter(item => text.includes(item.toLowerCase()));
  return { sectors: pick(SECTORS), skill_tags: pick(SKILLS), donor_tags: pick(DONORS) };
}

/* ---------- candidate profile ---------- */
app.get('/api/profile', requireAuth('candidate'), (req, res) => {
  const p = store.getProfile(req.session.userId);
  if (!p) return res.status(404).json({ error: 'Profile not found.' });
  res.json(p);
});

app.put('/api/profile', requireAuth('candidate'), (req, res) => {
  const b = req.body || {};
  const base = {
    full_name: b.full_name || '', email: b.email || '', phone: b.phone || '',
    address: b.address || '', nationality: b.nationality || '', date_of_birth: b.date_of_birth || '',
    about_me: b.about_me || '',
    work_experience: Array.isArray(b.work_experience) ? b.work_experience : [],
    education: Array.isArray(b.education) ? b.education : [],
    languages: Array.isArray(b.languages) ? b.languages : [],
    digital_skills: b.digital_skills || '', other_skills: b.other_skills || '',
    additional_info: b.additional_info || ''
  };
  // Derive matching tags silently from the CV content, merged with any tags parsing already set.
  const derived = deriveTags(base);
  const existing = store.getProfile(req.session.userId) || {};
  const merge = (a, b2) => Array.from(new Set([...(a || []), ...(b2 || [])]));
  base.sectors = merge(existing.sectors, derived.sectors);
  base.skill_tags = merge(existing.skill_tags, derived.skill_tags);
  base.donor_tags = merge(existing.donor_tags, derived.donor_tags);
  store.updateProfile(req.session.userId, base);
  res.json({ ok: true });
});

// Save the current form as a BRAND-NEW candidate (used by "Save as new candidate").
// Each call adds a separate person to the pool, so you can load many CVs for testing.
app.post('/api/candidates/new', requireAuth('candidate'), (req, res) => {
  const b = req.body || {};
  const base = {
    full_name: b.full_name || '', email: b.email || '', phone: b.phone || '',
    address: b.address || '', nationality: b.nationality || '', date_of_birth: b.date_of_birth || '',
    about_me: b.about_me || '',
    work_experience: Array.isArray(b.work_experience) ? b.work_experience : [],
    education: Array.isArray(b.education) ? b.education : [],
    languages: Array.isArray(b.languages) ? b.languages : [],
    digital_skills: b.digital_skills || '', other_skills: b.other_skills || '',
    additional_info: b.additional_info || '', cv_filename: b.cv_filename || ''
  };
  if (!base.full_name.trim()) return res.status(400).json({ error: 'Please add at least a name before saving.' });
  // Derive matching tags from the CV content, plus any tags parsing already suggested.
  const derived = deriveTags(base);
  const merge = (a, b2) => Array.from(new Set([...(a || []), ...(b2 || [])]));
  base.sectors = merge(b.sectors, derived.sectors);
  base.skill_tags = merge(b.skill_tags, derived.skill_tags);
  base.donor_tags = merge(b.donor_tags, derived.donor_tags);
  const created = store.addCandidateFromData(base);
  res.json({ ok: true, user_id: created.user_id });
});

/* ---------- CV parse (Gemini) ---------- */
let ai = null;
if (process.env.GEMINI_API_KEY) {
  const { GoogleGenAI } = require('@google/genai');
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

app.post('/api/parse-cv', requireAuth('candidate'), async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'CV auto-fill is not configured (no GEMINI_API_KEY set). Fill the form manually instead.' });
  const { cvText, images } = req.body || {};
  const hasImages = Array.isArray(images) && images.length > 0;
  if ((!cvText || !cvText.trim()) && !hasImages) return res.status(400).json({ error: 'No text or images supplied.' });

  const { Type } = require('@google/genai');
  const schema = {
    type: Type.OBJECT,
    properties: {
      full_name: { type: Type.STRING, nullable: true },
      email: { type: Type.STRING, nullable: true },
      phone: { type: Type.STRING, nullable: true },
      address: { type: Type.STRING, nullable: true },
      nationality: { type: Type.STRING, nullable: true },
      about_me: { type: Type.STRING, nullable: true },
      work_experience: {
        type: Type.ARRAY, items: {
          type: Type.OBJECT, properties: {
            title: { type: Type.STRING }, organization: { type: Type.STRING },
            location: { type: Type.STRING, nullable: true },
            start_date: { type: Type.STRING, nullable: true }, end_date: { type: Type.STRING, nullable: true },
            description: { type: Type.STRING, nullable: true }
          }
        }
      },
      education: {
        type: Type.ARRAY, items: {
          type: Type.OBJECT, properties: {
            degree: { type: Type.STRING }, institution: { type: Type.STRING }, year: { type: Type.STRING, nullable: true }
          }
        }
      },
      languages: {
        type: Type.ARRAY, items: {
          type: Type.OBJECT, properties: { language: { type: Type.STRING }, level: { type: Type.STRING, nullable: true } }
        }
      },
      digital_skills: { type: Type.STRING, nullable: true },
      sectors: { type: Type.ARRAY, items: { type: Type.STRING } },
      skill_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      donor_tags: { type: Type.ARRAY, items: { type: Type.STRING } }
    }
  };

  const instructions = `You are a CV parser for a Europass-style profile system. Extract the CV text into structured fields.
For "sectors", "skill_tags", and "donor_tags", choose only values that plausibly match from these controlled lists (infer from the CV, don't invent new ones):
SECTORS: ${SECTORS.join(', ')}
SKILLS: ${SKILLS.join(', ')}
DONORS: ${DONORS.join(', ')}
For languages, use CEFR levels (A1-C2) or "Native" when you can infer them. Do not invent content not supported by the CV.`;

  // Build the request: either the extracted text, or the scanned page images (Gemini reads them via OCR).
  let contents;
  if (hasImages) {
    const parts = [{ text: instructions + '\n\nThe CV is provided as scanned page image(s). Read the text from the images and extract the fields.' }];
    images.slice(0, 5).forEach(b64 => parts.push({ inlineData: { mimeType: 'image/png', data: b64 } }));
    contents = [{ role: 'user', parts }];
  } else {
    contents = `${instructions}\n\nCV text:\n"""\n${cvText.slice(0, 14000)}\n"""`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { responseMimeType: 'application/json', responseSchema: schema }
    });
    const parsed = JSON.parse(response.text);
    // Persist the AI-inferred matching tags straight to the profile (kept invisibly).
    const existing = store.getProfile(req.session.userId) || {};
    const merge = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));
    store.updateProfile(req.session.userId, {
      sectors: merge(existing.sectors, Array.isArray(parsed.sectors) ? parsed.sectors : []),
      skill_tags: merge(existing.skill_tags, Array.isArray(parsed.skill_tags) ? parsed.skill_tags : []),
      donor_tags: merge(existing.donor_tags, Array.isArray(parsed.donor_tags) ? parsed.donor_tags : [])
    });
    res.json({ parsed });
  } catch (err) {
    console.error('parse-cv error:', err);
    res.status(500).json({ error: err.message || 'Parsing failed.' });
  }
});

/* ---------- parse project document (agent) ---------- */
app.post('/api/parse-project', requireAuth('agent'), async (req, res) => {
  const { docText, images } = req.body || {};
  const hasImages = Array.isArray(images) && images.length > 0;
  if ((!docText || !docText.trim()) && !hasImages) return res.status(400).json({ error: 'No text or images supplied.' });
  if (!ai) return res.status(503).json({ error: 'no Gemini key set' });

  const { Type } = require('@google/genai');
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, nullable: true },
      client: { type: Type.STRING, nullable: true },
      duration: { type: Type.STRING, nullable: true },
      location: { type: Type.STRING, nullable: true },
      requirement_text: { type: Type.STRING, nullable: true }
    }
  };
  const instructions = `You are reading a consultancy project document / Terms of Reference (ToR). Extract these fields if present:
- title: the role or assignment title (e.g. "Tax Reform Team Leader"), NOT the whole document heading
- client: the funding or contracting organisation (e.g. "World Bank", "ADB", a government ministry)
- duration: the assignment length or level of effort (e.g. "8 months", "120 working days")
- location: the country or region of the assignment (e.g. "East Africa", "Kenya")
- requirement_text: a clean plain-text version of the full requirement / scope of work from the document (only fill this when reading from images; otherwise you may leave it null)
Use null for anything not clearly stated. Do not guess wildly.`;

  let contents;
  if (hasImages) {
    const parts = [{ text: instructions + '\n\nThe document is provided as scanned page image(s). Read the text from the images and extract the fields, including requirement_text.' }];
    images.slice(0, 5).forEach(b64 => parts.push({ inlineData: { mimeType: 'image/png', data: b64 } }));
    contents = [{ role: 'user', parts }];
  } else {
    contents = `${instructions}\n\nDocument:\n"""\n${docText.slice(0, 14000)}\n"""`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { responseMimeType: 'application/json', responseSchema: schema }
    });
    res.json({ parsed: JSON.parse(response.text) });
  } catch (err) {
    console.error('parse-project error:', err);
    res.status(500).json({ error: err.message || 'Parsing failed.' });
  }
});

/* ---------- projects (agent) ---------- */
app.get('/api/projects', requireAuth('agent'), (req, res) => {
  res.json(store.projectsByAgent(req.session.userId));
});
app.post('/api/projects', requireAuth('agent'), (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.title.trim()) return res.status(400).json({ error: 'Project title is required.' });
  const p = store.createProject(req.session.userId, {
    title: b.title.trim(), client: b.client || '', duration: b.duration || '', location: b.location || '',
    notes: b.notes || '',
    sectors: Array.isArray(b.sectors) ? b.sectors : [],
    skill_tags: Array.isArray(b.skill_tags) ? b.skill_tags : [],
    donor_tags: Array.isArray(b.donor_tags) ? b.donor_tags : []
  });
  // Optionally attach the original uploaded requirement file (sent as base64).
  if (b.file_base64 && b.file_name) {
    try {
      store.saveProjectFile(p.id, b.file_base64, b.file_name, b.file_mime || '');
    } catch (e) {
      console.error('saveProjectFile error:', e.message);
    }
  }
  res.json({ ok: true, id: p.id });
});
app.delete('/api/projects/:id', requireAuth('agent'), (req, res) => {
  store.deleteProject(Number(req.params.id), req.session.userId);
  res.json({ ok: true });
});
// Serve the original uploaded requirement document for a project.
app.get('/api/projects/:id/file', requireAuth('agent'), (req, res) => {
  const proj = store.getProject(Number(req.params.id), req.session.userId);
  if (!proj || !proj.file_stored) return res.status(404).send('No file for this project.');
  const fp = store.getProjectFilePath(proj.file_stored);
  if (!fp) return res.status(404).send('File not found.');
  if (proj.file_mime) res.type(proj.file_mime);
  res.sendFile(fp);
});

/* ---------- candidate pool + matching (agent) ---------- */
app.get('/api/candidates', requireAuth('agent'), (req, res) => {
  res.json(store.allCandidateProfiles());
});

// Cheap keyword fallback when AI is unavailable: overlap of derived tags with words in the requirement.
function keywordScore(cand, requirementText) {
  const req = (requirementText || '').toLowerCase();
  const tags = [...(cand.sectors || []), ...(cand.skill_tags || []), ...(cand.donor_tags || [])];
  if (!tags.length) return { total: 0, strengths: [], gaps: [] };
  const hits = tags.filter(t => req.includes(t.toLowerCase()));
  const total = Math.round((hits.length / Math.max(tags.length, 1)) * 100);
  return { total, strengths: hits, gaps: tags.filter(t => !hits.includes(t)) };
}

function candidateSummaryForAI(c) {
  const work = (c.work_experience || []).map(w => `${w.title||''} at ${w.organization||''} (${w.start_date||''}-${w.end_date||''}): ${w.description||''}`).join('; ');
  const edu = (c.education || []).map(e => `${e.degree||''}, ${e.institution||''} ${e.year||''}`).join('; ');
  const langs = (c.languages || []).map(l => `${l.language||''} (${l.level||''})`).join(', ');
  return `Name: ${c.full_name||'(unnamed)'}
Location: ${c.address||''} | Nationality: ${c.nationality||''}
About: ${c.about_me||''}
Work experience: ${work}
Education: ${edu}
Languages: ${langs}
Digital skills: ${c.digital_skills||''}
Other skills: ${c.other_skills||''}
Additional: ${c.additional_info||''}`;
}

app.get('/api/projects/:id/shortlist', requireAuth('agent'), async (req, res) => {
  const proj = store.getProject(Number(req.params.id), req.session.userId);
  if (!proj) return res.status(404).json({ error: 'Project not found.' });
  const candidates = store.allCandidateProfiles();
  if (!candidates.length) return res.json({ project: proj, ranked: [], mode: 'none' });

  const requirement = proj.notes || proj.title;

  // Build a fingerprint of the inputs. If it matches the cached one, reuse the saved ranking
  // instead of calling the AI again (saves API calls, time, and memory churn).
  const fingerprint = makeFingerprint(proj, candidates);
  if (req.query.refresh !== '1') {
    const cached = store.getShortlistCache(proj.id);
    if (cached && cached.fingerprint === fingerprint) {
      return res.json({ ...cached.result, cached: true, cachedAt: cached.cachedAt });
    }
  }

  // Try AI scoring first.
  if (ai) {
    try {
      const { Type } = require('@google/genai');
      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            score: { type: Type.INTEGER },
            reasoning: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      };
      const candBlocks = candidates.map((c, i) => `--- CANDIDATE ${i} ---\n${candidateSummaryForAI(c)}`).join('\n\n');
      const prompt = `You are screening candidates for a consultancy assignment. Score each candidate 0-100 on fit to the requirement, and explain honestly (referencing their real experience), including gaps.

PROJECT: ${proj.title} | Client: ${proj.client||'-'} | Location: ${proj.location||'-'}

REQUIREMENT:
"""
${requirement.slice(0, 8000)}
"""

CANDIDATES:
${candBlocks.slice(0, 24000)}

Return a JSON array, one object per candidate, each with: index (the CANDIDATE number), score (0-100 integer), reasoning (2-3 sentences, specific and honest about fit and gaps), strengths (short strings), gaps (short strings). Order does not matter; include every candidate.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: schema }
      });
      const scores = JSON.parse(response.text);
      const byIndex = {};
      scores.forEach(s => { byIndex[s.index] = s; });
      const ranked = candidates.map((c, i) => {
        const s = byIndex[i] || { score: 0, reasoning: 'No score returned.', strengths: [], gaps: [] };
        return {
          candidate: publicCand(c),
          total: Math.max(0, Math.min(100, s.score || 0)),
          reasoning: s.reasoning || '',
          strengths: s.strengths || [],
          gaps: s.gaps || []
        };
      }).sort((a, b) => b.total - a.total);
      const result = { project: proj, ranked, mode: 'ai' };
      store.saveShortlistCache(proj.id, fingerprint, result);
      return res.json({ ...result, cached: false });
    } catch (err) {
      console.error('AI shortlist error, falling back to keyword scoring:', err.message);
      // fall through to keyword fallback
    }
  }

  // Fallback: keyword scoring.
  const ranked = candidates.map(c => {
    const s = keywordScore(c, requirement);
    return { candidate: publicCand(c), total: s.total, reasoning: '', strengths: s.strengths, gaps: s.gaps };
  }).sort((a, b) => b.total - a.total);
  const result = { project: proj, ranked, mode: 'fallback' };
  store.saveShortlistCache(proj.id, fingerprint, result);
  res.json({ ...result, cached: false });
});

// Fingerprint = project fields that affect matching + a signature of every candidate profile.
// Any edit to the project or to any candidate changes this string, so the cache auto-invalidates.
function makeFingerprint(proj, candidates) {
  const projPart = [proj.title, proj.client, proj.location, proj.notes].join('|');
  const candPart = candidates
    .map(c => `${c.user_id}:${c.updated_at || ''}`)
    .sort()
    .join(',');
  return simpleHash(projPart + '||' + candPart);
}
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function publicCand(c) {
  return {
    user_id: c.user_id,
    full_name: c.full_name, email: c.email, phone: c.phone,
    address: c.address, nationality: c.nationality, date_of_birth: c.date_of_birth,
    about_me: c.about_me,
    work_experience: c.work_experience, education: c.education, languages: c.languages,
    digital_skills: c.digital_skills, other_skills: c.other_skills, additional_info: c.additional_info,
    sectors: c.sectors, skill_tags: c.skill_tags, donor_tags: c.donor_tags,
    cv_filename: c.cv_filename
  };
}

app.listen(PORT, () => {
  console.log(`Xpie running at http://localhost:${PORT}`);
  if (!ai) console.log('(Note: GEMINI_API_KEY not set  CV auto-fill disabled, manual entry still works.)');
});
