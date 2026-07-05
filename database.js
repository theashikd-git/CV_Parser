// Tiny zero-dependency persistence layer.
// Stores all data in db/vantage.json and writes on every change.
// Project requirement files (PDF/DOCX/txt) are stored as real files in db/project_files/.
// No native compilation, installs and runs on any machine with Node.

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'db');
const DB_FILE = path.join(DB_DIR, 'vantage.json');
const FILES_DIR = path.join(DB_DIR, 'project_files');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

let data;
function load() {
  try {
    data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    data = { users: [], profiles: [], projects: [], seq: { users: 0, projects: 0 } };
  }
  data.users ||= [];
  data.profiles ||= [];
  data.projects ||= [];
  data.seq ||= { users: 0, projects: 0 };
  data.shortlistCache ||= {}; // { [projectId]: { fingerprint, result, cachedAt } }
}
function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
load();

const store = {
  /* users */
  findUserByEmail(email) {
    return data.users.find(u => u.email === email) || null;
  },
  findUserById(id) {
    return data.users.find(u => u.id === id) || null;
  },
  createUser(email, password_hash, role) {
    const id = ++data.seq.users;
    const user = { id, email, password_hash, role, created_at: new Date().toISOString() };
    data.users.push(user);
    persist();
    return user;
  },

  /* profiles */
  createProfile(user_id, email) {
    const profile = {
      user_id, full_name: '', email: email || '', phone: '', address: '', nationality: '',
      date_of_birth: '', about_me: '', work_experience: [], education: [], languages: [],
      digital_skills: '', other_skills: '', sectors: [], skill_tags: [], donor_tags: [],
      additional_info: '', cv_filename: '', updated_at: new Date().toISOString()
    };
    data.profiles.push(profile);
    persist();
    return profile;
  },
  getProfile(user_id) {
    return data.profiles.find(p => p.user_id === user_id) || null;
  },
  updateProfile(user_id, fields) {
    const p = data.profiles.find(pr => pr.user_id === user_id);
    if (!p) return null;
    Object.assign(p, fields, { updated_at: new Date().toISOString() });
    persist();
    return p;
  },
  allCandidateProfiles() {
    const candidateIds = new Set(data.users.filter(u => u.role === 'candidate').map(u => u.id));
    return data.profiles.filter(p => candidateIds.has(p.user_id));
  },

  /* projects */
  createProject(agent_id, fields) {
    const id = ++data.seq.projects;
    const project = { id, agent_id, created_at: new Date().toISOString(), ...fields };
    data.projects.push(project);
    persist();
    return project;
  },
  projectsByAgent(agent_id) {
    return data.projects.filter(p => p.agent_id === agent_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getProject(id, agent_id) {
    return data.projects.find(p => p.id === id && p.agent_id === agent_id) || null;
  },
  deleteProject(id, agent_id) {
    const proj = data.projects.find(p => p.id === id && p.agent_id === agent_id);
    if (!proj) return;
    if (proj.file_stored) {
      const fp = path.join(FILES_DIR, proj.file_stored);
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    data.projects = data.projects.filter(p => !(p.id === id && p.agent_id === agent_id));
    if (data.shortlistCache) delete data.shortlistCache[id];
    persist();
  },

  /* project files (the original uploaded requirement document) */
  saveProjectFile(projectId, base64Data, originalName, mimeType) {
    const ext = (originalName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const stored = `project_${projectId}.${ext}`;
    fs.writeFileSync(path.join(FILES_DIR, stored), Buffer.from(base64Data, 'base64'));
    const proj = data.projects.find(p => p.id === projectId);
    if (proj) {
      proj.file_stored = stored;
      proj.file_name = originalName;
      proj.file_mime = mimeType || '';
      persist();
    }
    return stored;
  },
  getProjectFilePath(stored) {
    if (!stored) return null;
    const fp = path.join(FILES_DIR, stored);
    return fs.existsSync(fp) ? fp : null;
  },

  /* shortlist cache — avoids re-running the AI ranking when nothing changed */
  getShortlistCache(projectId) {
    return (data.shortlistCache && data.shortlistCache[projectId]) || null;
  },
  saveShortlistCache(projectId, fingerprint, result) {
    data.shortlistCache ||= {};
    data.shortlistCache[projectId] = { fingerprint, result, cachedAt: new Date().toISOString() };
    persist();
  }
};

module.exports = store;
