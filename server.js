require('dotenv').config();
const express = require('express');
<<<<<<< HEAD
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const store = require('./database');
const { SECTORS, SKILLS, DONORS } = require('./taxonomy');
=======
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const path = require('path');
>>>>>>> da7e240b7c51e458a1ffb5435f0d68dc07962c54

const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
app.use(express.json({ limit: '2mb' }));
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

/* ---------- CV parse (Gemini) ---------- */
let ai = null;
if (process.env.GEMINI_API_KEY) {
  const { GoogleGenAI } = require('@google/genai');
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

app.post('/api/parse-cv', requireAuth('candidate'), async (req, res) => {
  if (!ai) return res.status(503).json({ error: 'CV auto-fill is not configured (no GEMINI_API_KEY set). Fill the form manually instead.' });
  const { cvText } = req.body || {};
  if (!cvText || !cvText.trim()) return res.status(400).json({ error: 'No text supplied.' });

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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${instructions}\n\nCV text:\n"""\n${cvText.slice(0, 14000)}\n"""`,
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
  res.json({ ok: true, id: p.id });
});
app.delete('/api/projects/:id', requireAuth('agent'), (req, res) => {
  store.deleteProject(Number(req.params.id), req.session.userId);
  res.json({ ok: true });
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
      return res.json({ project: proj, ranked, mode: 'ai' });
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
  res.json({ project: proj, ranked, mode: 'fallback' });
});

function publicCand(c) {
  return {
    full_name: c.full_name, address: c.address, nationality: c.nationality, about_me: c.about_me,
    sectors: c.sectors, skill_tags: c.skill_tags, donor_tags: c.donor_tags,
    languages: c.languages, cv_filename: c.cv_filename
  };
}

app.listen(PORT, () => {
  console.log(`Vantage Point running at http://localhost:${PORT}`);
  if (!ai) console.log('(Note: GEMINI_API_KEY not set — CV auto-fill disabled, manual entry still works.)');
=======
if (!process.env.GEMINI_API_KEY) {
  console.error('\n[ERROR] GEMINI_API_KEY is not set.');
  console.error('Copy .env.example to .env and add your free key from https://aistudio.google.com/apikey, then restart.\n');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PARSE_INSTRUCTIONS = `You are an ATS (applicant tracking system) resume parser. Parse the given CV/resume text into structured sections, and identify the exact substrings in the original text that correspond to each section so they can be highlighted on a UI.

CRITICAL: every "source_snippet" field MUST be an exact, verbatim substring copied from the CV text you are given (not paraphrased), so it can be located with a string search. If a section genuinely is not present in the CV, use null (for contact/summary) or an empty array (for experience/education/skills.items/certifications.items), and source_snippet should be null in that case. Do not invent content that is not in the CV.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    contact: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, nullable: true },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true },
        location: { type: Type.STRING, nullable: true },
        linkedin: { type: Type.STRING, nullable: true },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    summary: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, nullable: true },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          organization: { type: Type.STRING },
          location: { type: Type.STRING, nullable: true },
          start_date: { type: Type.STRING, nullable: true },
          end_date: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          source_snippet: { type: Type.STRING },
        },
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          degree: { type: Type.STRING },
          institution: { type: Type.STRING },
          location: { type: Type.STRING, nullable: true },
          year: { type: Type.STRING, nullable: true },
          source_snippet: { type: Type.STRING },
        },
      },
    },
    skills: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
    certifications: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        source_snippet: { type: Type.STRING, nullable: true },
      },
    },
  },
};

app.post('/api/parse-cv', async (req, res) => {
  try {
    const { cvText } = req.body;

    if (!cvText || typeof cvText !== 'string' || !cvText.trim()) {
      return res.status(400).json({ error: 'cvText is required and must be a non-empty string.' });
    }

    const truncated = cvText.slice(0, 14000);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${PARSE_INSTRUCTIONS}\n\nCV text:\n"""\n${truncated}\n"""`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text);

    res.json({ parsed, charsProcessed: truncated.length });
  } catch (err) {
    console.error('parse-cv error:', err);
    res.status(500).json({ error: err.message || 'Failed to parse CV.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Vantage Point CV parser running at http://localhost:${PORT}`);
>>>>>>> da7e240b7c51e458a1ffb5435f0d68dc07962c54
});
