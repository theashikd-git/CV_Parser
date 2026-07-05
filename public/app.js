pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let TAX = { SECTORS: [], SKILLS: [], DONORS: [] };
const root = document.getElementById('root');

/* ---------- utilities ---------- */
function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => t.className = 'toast', 2000);
}
async function api(path, method = 'GET', body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed: ' + res.status));
  return data;
}
function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function initials(name) { return (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'; }

/* ---------- boot ---------- */
(async function boot() {
  try { TAX = await api('/taxonomy'); } catch {}
  try {
    const me = await api('/me');
    if (me.loggedIn) return enterApp(me.role);
  } catch {}
  renderAuth('login', 'candidate');
})();

/* ---------- AUTH ---------- */
function renderAuth(mode, role) {
  root.innerHTML = `
    <div class="auth-wrap"><div class="auth-box">
      <div class="auth-logo">Xpie</div>
      <div class="auth-tag">CV profiles & project matching</div>
      <div class="seg">
        <button id="segLogin" class="${mode==='login'?'on':''}">Log in</button>
        <button id="segReg" class="${mode==='register'?'on':''}">Create account</button>
      </div>
      <div id="authErr"></div>
      ${mode==='register' ? `
        <div class="field"><label>I am a…</label>
          <div class="role-pick">
            <div class="role-opt ${role==='candidate'?'on':''}" data-r="candidate">Candidate</div>
            <div class="role-opt ${role==='agent'?'on':''}" data-r="agent">Agency</div>
          </div>
        </div>` : ''}
      <div class="field"><label>Email</label><input type="email" id="au_email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input type="password" id="au_pass" placeholder="${mode==='register'?'At least 6 characters':'Your password'}"></div>
      <button class="btn" style="width:100%;" id="au_submit">${mode==='register'?'Create account':'Log in'}</button>
      <div class="auth-switch">
        ${mode==='login' ? `New here? <a id="toReg">Create an account</a>` : `Already have an account? <a id="toLogin">Log in</a>`}
      </div>
      <div class="auth-footer">Designed and developed by <span class="fb">Xpie Team</span></div>
    </div></div>`;

  let selRole = role;
  document.getElementById('segLogin').onclick = () => renderAuth('login', selRole);
  document.getElementById('segReg').onclick = () => renderAuth('register', selRole);
  const toReg = document.getElementById('toReg'); if (toReg) toReg.onclick = () => renderAuth('register', selRole);
  const toLogin = document.getElementById('toLogin'); if (toLogin) toLogin.onclick = () => renderAuth('login', selRole);
  root.querySelectorAll('.role-opt').forEach(o => o.onclick = () => { selRole = o.dataset.r; renderAuth('register', selRole); });

  document.getElementById('au_submit').onclick = async () => {
    const email = document.getElementById('au_email').value.trim();
    const password = document.getElementById('au_pass').value;
    const errBox = document.getElementById('authErr');
    errBox.innerHTML = '';
    try {
      if (mode === 'register') {
        const r = await api('/register', 'POST', { email, password, role: selRole });
        enterApp(r.role);
      } else {
        const r = await api('/login', 'POST', { email, password });
        enterApp(r.role);
      }
    } catch (e) {
      errBox.innerHTML = `<div class="auth-err">${esc(e.message)}</div>`;
    }
  };
}

function shell(role, inner) {
  return `
    <div class="nav">
      <div class="brand">Xpie <span>${role}</span></div>
      <div class="nav-right">
        <span class="role-badge ${role}">${role==='agent'?'Agency account':'Candidate account'}</span>
        <button class="lnk" id="logoutBtn">Log out</button>
      </div>
    </div>
    <div class="wrap" id="viewWrap">${inner}</div>
    <div class="app-footer">Designed and developed by <span class="fb">Xpie Team</span></div>`;
}
function wireShell() {
  document.getElementById('logoutBtn').onclick = async () => { await api('/logout', 'POST'); renderAuth('login', 'candidate'); };
}

function enterApp(role) {
  if (role === 'candidate') renderCandidate();
  else renderAgent();
}

/* ---------- CANDIDATE ---------- */
let profile = null;
async function renderCandidate() {
  root.innerHTML = shell('candidate', `<div class="empty"><span class="spinner"></span> Loading your profile…</div>`);
  wireShell();
  try { profile = await api('/profile'); } catch (e) { toast(e.message, true); return; }
  drawCandidate();
}

function drawCandidate() {
  const p = profile;
  const wrap = document.getElementById('viewWrap');
  wrap.innerHTML = `
    <div class="eyebrow">My Europass-style profile</div>
    <h1>Your living CV</h1>
    <p class="sub">Fill it in manually, or upload a CV file to auto-fill the fields, then edit. Agencies match their projects against this profile — update it any time.</p>

    <div class="card">
      <h2>Auto-fill from a CV file</h2>
      <p class="sub" style="margin-bottom:14px;">Optional. Upload a PDF or DOCX and we'll pre-fill the sections below. You can edit everything afterward.</p>
      <div class="dropzone" id="dz"><div class="dz-text">Drop a CV here or click to browse</div><div class="dz-sub">PDF, DOCX, or .txt</div></div>
      <input type="file" id="cvFile" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" class="hidden">
      <div id="parseStatus" class="sub" style="margin:10px 0 0;"></div>
    </div>

    <div class="card">
      <h2>Personal information</h2>
      <div class="row2">
        <div class="field"><label>Full name</label><input id="f_full_name" value="${esc(p.full_name)}"></div>
        <div class="field"><label>Email</label><input id="f_email" value="${esc(p.email)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Phone</label><input id="f_phone" value="${esc(p.phone)}"></div>
        <div class="field"><label>Address</label><input id="f_address" value="${esc(p.address)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>Nationality</label><input id="f_nationality" value="${esc(p.nationality)}"></div>
        <div class="field"><label>Date of birth</label><input id="f_dob" value="${esc(p.date_of_birth)}" placeholder="DD/MM/YYYY"></div>
      </div>
    </div>

    <div class="card">
      <h2>About me</h2>
      <div class="field"><textarea id="f_about" rows="3" placeholder="A short professional summary (3-4 sentences).">${esc(p.about_me)}</textarea></div>
    </div>

    <div class="card">
      <h2>Work experience</h2>
      <div id="workWrap"></div>
      <button class="addbtn" id="addWork">+ Add work experience</button>
    </div>

    <div class="card">
      <h2>Education &amp; training</h2>
      <div id="eduWrap"></div>
      <button class="addbtn" id="addEdu">+ Add education</button>
    </div>

    <div class="card">
      <h2>Languages</h2>
      <p class="sub" style="margin-bottom:12px;">Use CEFR levels (A1–C2) or "Native".</p>
      <div id="langWrap"></div>
      <button class="addbtn" id="addLang">+ Add language</button>
    </div>

    <div class="card">
      <h2>Skills</h2>
      <div class="field"><label>Digital skills</label><input id="f_digital" value="${esc(p.digital_skills)}" placeholder="Software, tools, programming languages"></div>
      <div class="field"><label>Other skills <span class="hint">communication, organisational, job-related</span></label><textarea id="f_other" rows="2">${esc(p.other_skills)}</textarea></div>
    </div>

    <div class="card">
      <h2>Additional information</h2>
      <div class="field"><textarea id="f_additional" rows="2" placeholder="Certifications, publications, memberships, awards…">${esc(p.additional_info)}</textarea></div>
    </div>

    <div style="display:flex;gap:10px;position:sticky;bottom:16px;">
      <button class="btn" id="saveBtn" style="flex:1;">Save profile</button>
    </div>`;

  drawWork(); drawEdu(); drawLang();
  wrap.querySelectorAll('.tags').forEach(g => g.querySelectorAll('.tagbtn').forEach(b => b.onclick = () => b.classList.toggle('sel')));

  document.getElementById('addWork').onclick = () => { profile.work_experience.push({ title:'', organization:'', location:'', start_date:'', end_date:'', description:'' }); drawWork(); };
  document.getElementById('addEdu').onclick = () => { profile.education.push({ degree:'', institution:'', year:'' }); drawEdu(); };
  document.getElementById('addLang').onclick = () => { profile.languages.push({ language:'', level:'' }); drawLang(); };
  document.getElementById('saveBtn').onclick = saveProfile;
  setupUpload();
}

function drawWork() {
  const box = document.getElementById('workWrap');
  box.innerHTML = profile.work_experience.map((w, i) => `
    <div class="repeat">
      <button class="rm" data-i="${i}">Remove</button>
      <div class="row2">
        <div class="field"><label>Job title</label><input data-f="title" data-i="${i}" value="${esc(w.title)}"></div>
        <div class="field"><label>Organization</label><input data-f="organization" data-i="${i}" value="${esc(w.organization)}"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Location</label><input data-f="location" data-i="${i}" value="${esc(w.location)}"></div>
        <div class="field"><label>Start</label><input data-f="start_date" data-i="${i}" value="${esc(w.start_date)}" placeholder="2019"></div>
        <div class="field"><label>End</label><input data-f="end_date" data-i="${i}" value="${esc(w.end_date)}" placeholder="Present"></div>
      </div>
      <div class="field"><label>Description</label><textarea data-f="description" data-i="${i}" rows="2">${esc(w.description)}</textarea></div>
    </div>`).join('') || `<p class="sub">No entries yet.</p>`;
  bindRepeat(box, 'work_experience', drawWork);
}
function drawEdu() {
  const box = document.getElementById('eduWrap');
  box.innerHTML = profile.education.map((e, i) => `
    <div class="repeat">
      <button class="rm" data-i="${i}">Remove</button>
      <div class="row2">
        <div class="field"><label>Degree / qualification</label><input data-f="degree" data-i="${i}" value="${esc(e.degree)}"></div>
        <div class="field"><label>Institution</label><input data-f="institution" data-i="${i}" value="${esc(e.institution)}"></div>
      </div>
      <div class="field"><label>Year</label><input data-f="year" data-i="${i}" value="${esc(e.year)}" placeholder="2015"></div>
    </div>`).join('') || `<p class="sub">No entries yet.</p>`;
  bindRepeat(box, 'education', drawEdu);
}
function drawLang() {
  const box = document.getElementById('langWrap');
  box.innerHTML = profile.languages.map((l, i) => `
    <div class="repeat">
      <button class="rm" data-i="${i}">Remove</button>
      <div class="row2">
        <div class="field"><label>Language</label><input data-f="language" data-i="${i}" value="${esc(l.language)}"></div>
        <div class="field"><label>Level</label><input data-f="level" data-i="${i}" value="${esc(l.level)}" placeholder="C1 / Native"></div>
      </div>
    </div>`).join('') || `<p class="sub">No entries yet.</p>`;
  bindRepeat(box, 'languages', drawLang);
}
function bindRepeat(box, key, redraw) {
  box.querySelectorAll('[data-f]').forEach(inp => {
    inp.oninput = () => { profile[key][+inp.dataset.i][inp.dataset.f] = inp.value; };
  });
  box.querySelectorAll('.rm').forEach(btn => {
    btn.onclick = () => { profile[key].splice(+btn.dataset.i, 1); redraw(); };
  });
}

function collectProfile() {
  const val = id => document.getElementById(id).value;
  return {
    full_name: val('f_full_name'), email: val('f_email'), phone: val('f_phone'),
    address: val('f_address'), nationality: val('f_nationality'), date_of_birth: val('f_dob'),
    about_me: val('f_about'),
    work_experience: profile.work_experience, education: profile.education, languages: profile.languages,
    digital_skills: val('f_digital'), other_skills: val('f_other'),
    additional_info: val('f_additional')
  };
}
async function saveProfile() {
  const payload = collectProfile();
  try {
    await api('/profile', 'PUT', payload);
    Object.assign(profile, payload);
    toast('Profile saved');
  } catch (e) { toast(e.message, true); }
}

/* ---------- CV upload + parse ---------- */
function setupUpload() {
  const dz = document.getElementById('dz');
  const input = document.getElementById('cvFile');
  dz.onclick = () => input.click();
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleCV(e.dataTransfer.files[0]); });
  input.onchange = e => { if (e.target.files.length) handleCV(e.target.files[0]); input.value = ''; };
}
async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt') return await file.text();
  if (ext === 'pdf') {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }
  if (ext === 'docx') {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value;
  }
  throw new Error('Unsupported file type: .' + ext);
}

// Render PDF pages to base64 PNG images — used for scanned/image-only PDFs that have no text layer.
// Returns up to `maxPages` images to keep the request size reasonable.
async function pdfToImages(file, maxPages) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = Math.min(pdf.numPages, maxPages || 5);
  const images = [];
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // scale 2 = decent OCR resolution
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    images.push(dataUrl.split(',')[1]); // strip the data: prefix, keep base64
  }
  return images;
}

// For an image file (jpg/png), read it as base64 directly.
function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handleCV(file) {
  const status = document.getElementById('parseStatus');
  const ext = file.name.split('.').pop().toLowerCase();
  status.innerHTML = `<span class="spinner"></span> Extracting text…`;

  let text = '';
  let images = null;
  try {
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      // A photo/scan uploaded as an image → go straight to image OCR.
      images = [await imageFileToBase64(file)];
    } else {
      text = await extractText(file);
      // If a PDF has (almost) no text, it's a scanned image → render pages and OCR them.
      if (ext === 'pdf' && text.trim().length < 40) {
        status.innerHTML = `<span class="spinner"></span> Looks like a scanned document — reading the pages…`;
        images = await pdfToImages(file, 5);
        text = '';
      }
    }
  } catch (e) {
    status.textContent = 'Could not read file: ' + e.message;
    return;
  }
  if (!text.trim() && !images) { status.textContent = 'No readable content found in that file.'; return; }

  status.innerHTML = `<span class="spinner"></span> Reading your CV and filling the form…`;
  try {
    const body = images ? { images } : { cvText: text.slice(0, 14000) };
    const { parsed } = await api('/parse-cv', 'POST', body);
    applyParsed(parsed);
    profile.cv_filename = file.name;
    status.textContent = 'Done — fields filled in below. Review, edit, then Save profile.';
  } catch (e) {
    status.textContent = 'Auto-fill failed: ' + e.message + ' — you can still fill the form manually.';
  }
}
function applyParsed(d) {
  const setIf = (id, v) => { if (v) document.getElementById(id).value = v; };
  setIf('f_full_name', d.full_name); setIf('f_email', d.email); setIf('f_phone', d.phone);
  setIf('f_address', d.address); setIf('f_nationality', d.nationality); setIf('f_about', d.about_me);
  setIf('f_digital', d.digital_skills);
  if (Array.isArray(d.work_experience) && d.work_experience.length) profile.work_experience = d.work_experience;
  if (Array.isArray(d.education) && d.education.length) profile.education = d.education;
  if (Array.isArray(d.languages) && d.languages.length) profile.languages = d.languages;
  drawWork(); drawEdu(); drawLang();
  // Tags are derived silently and kept on the profile object (not shown to the candidate).
  if (Array.isArray(d.sectors)) profile.sectors = d.sectors;
  if (Array.isArray(d.skill_tags)) profile.skill_tags = d.skill_tags;
  if (Array.isArray(d.donor_tags)) profile.donor_tags = d.donor_tags;
}


/* ---------- AGENT ---------- */
let agentSection = 'projects';   // 'projects' | 'cvs' | 'sorting'
let projects = [];
let candidatePool = [];
let sortProjectId = null;
let projectModalId = null;
let cvModalUserId = null;

async function renderAgent() {
  root.innerHTML = shell('agent', `<div class="empty"><span class="spinner"></span> Loading…</div>`);
  wireShell();
  drawAgent();
}
async function drawAgent() {
  const wrap = document.getElementById('viewWrap');
  wrap.innerHTML = `
    <div class="eyebrow">Agency workspace</div>
    <h1>${agentSection==='projects'?'Projects':agentSection==='cvs'?'CVs':'Sorting'}</h1>
    <p class="sub">${
      agentSection==='projects' ? 'All your projects. Click a project to open its original document.' :
      agentSection==='cvs' ? 'Everyone in the candidate pool. Click a CV to see the full profile.' :
      'Pick a project and rank the candidates against it.'}</p>
    <div class="tabs">
      <button class="tab ${agentSection==='projects'?'active':''}" id="tabProjects">Projects</button>
      <button class="tab ${agentSection==='cvs'?'active':''}" id="tabCvs">CVs</button>
      <button class="tab ${agentSection==='sorting'?'active':''}" id="tabSorting">Sorting</button>
    </div>
    <div id="agentBody"><div class="empty"><span class="spinner"></span> Loading…</div></div>`;
  document.getElementById('tabProjects').onclick = () => { agentSection='projects'; drawAgent(); };
  document.getElementById('tabCvs').onclick = () => { agentSection='cvs'; drawAgent(); };
  document.getElementById('tabSorting').onclick = () => { agentSection='sorting'; drawAgent(); };
  if (agentSection === 'projects') await drawProjectsSection();
  else if (agentSection === 'cvs') await drawCvsSection();
  else await drawSortingSection();
}

/* ===== SECTION 1: PROJECTS ===== */
async function drawProjectsSection() {
  try { projects = await api('/projects'); } catch (e) { toast(e.message, true); }
  const body = document.getElementById('agentBody');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 360px;gap:22px;align-items:start;">
      <div id="projListWrap"></div>
      <div class="card">
        <h2>New project</h2>
        <div class="field"><label>Title</label><input id="np_title" placeholder="e.g. Tax Reform Team Leader"></div>
        <div class="row2">
          <div class="field"><label>Client</label><input id="np_client" placeholder="World Bank"></div>
          <div class="field"><label>Duration</label><input id="np_duration" placeholder="8 months"></div>
        </div>
        <div class="field"><label>Location</label><input id="np_location" placeholder="East Africa"></div>
        <div class="field">
          <label>Requirement document <span class="hint">PDF/DOCX/txt</span></label>
          <div class="dropzone" id="np_dz"><div class="dz-text">Drop the project document here or click</div><div class="dz-sub">Stored and viewable later; its text is used for matching</div></div>
          <input type="file" id="np_file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" class="hidden">
          <div id="np_fileStatus" class="sub" style="margin:8px 0 0;"></div>
        </div>
        <div class="field"><label>Requirement text <span class="hint">auto-filled from the file, or type/paste</span></label><textarea id="np_notes" rows="6" placeholder="Describe the role, required expertise, sectors, donor experience, languages…"></textarea></div>
        <button class="btn" style="width:100%;" id="postProj">Post project</button>
      </div>
    </div>
    <div id="projectModal"></div>`;
  setupProjectUpload();
  document.getElementById('postProj').onclick = postProject;
  drawProjectCards();
}

// Holds the pending upload for a new project (base64 + meta), so we can store the original file.
let pendingProjectFile = null;

function setupProjectUpload() {
  const dz = document.getElementById('np_dz');
  const input = document.getElementById('np_file');
  dz.onclick = () => input.click();
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleProjectFile(e.dataTransfer.files[0]); });
  input.onchange = e => { if (e.target.files.length) handleProjectFile(e.target.files[0]); input.value = ''; };
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function handleProjectFile(file) {
  const status = document.getElementById('np_fileStatus');
  const ext = file.name.split('.').pop().toLowerCase();
  status.innerHTML = `<span class="spinner"></span> Reading file…`;
  try {
    const b64 = await fileToBase64(file);
    pendingProjectFile = { file_base64: b64, file_name: file.name, file_mime: file.type || '' };

    let text = '';
    let images = null;
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      images = [b64];
    } else {
      text = await extractText(file);
      if (ext === 'pdf' && text.trim().length < 40) {
        status.innerHTML = `<span class="spinner"></span> Looks like a scanned document — reading the pages…`;
        images = await pdfToImages(file, 5);
        text = '';
      }
    }
    if (text.trim()) document.getElementById('np_notes').value = text.trim();

    status.innerHTML = `<span class="spinner"></span> Extracting project details…`;
    try {
      const body = images ? { images } : { docText: text.slice(0, 14000) };
      const { parsed } = await api('/parse-project', 'POST', body);
      const fillIfEmpty = (id, v) => { const el = document.getElementById(id); if (v && !el.value.trim()) el.value = v; };
      fillIfEmpty('np_title', parsed.title);
      fillIfEmpty('np_client', parsed.client);
      fillIfEmpty('np_duration', parsed.duration);
      fillIfEmpty('np_location', parsed.location);
      // For scanned docs, also drop the OCR'd requirement text into the notes box if we got it.
      if (images && parsed.requirement_text && !document.getElementById('np_notes').value.trim()) {
        document.getElementById('np_notes').value = parsed.requirement_text;
      }
      status.textContent = `Loaded "${file.name}" — details auto-filled. Review everything, then post.`;
    } catch (e) {
      status.textContent = `Loaded "${file.name}". Auto-fill unavailable (${e.message}) — fill fields manually.`;
    }
  } catch (e) {
    status.textContent = 'Could not read file: ' + e.message;
    pendingProjectFile = null;
  }
}

function projectSummary(p) {
  // a short one-line summary from notes
  const t = (p.notes || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 120 ? t.slice(0, 120) + '…' : t) : 'No requirement text.';
}

function drawProjectCards() {
  const wrap = document.getElementById('projListWrap');
  if (!projects.length) { wrap.innerHTML = `<div class="empty"><div class="et">No projects yet</div>Create your first project on the right.</div>`; return; }
  wrap.innerHTML = projects.map(p => `
    <div class="proj-item" data-open="${p.id}" style="cursor:pointer;">
      <div style="flex:1;min-width:0;">
        <h4>${esc(p.title)}</h4>
        <div class="pm">${esc(p.client||'—')} · ${esc(p.duration||'—')}${p.location?' · '+esc(p.location):''}</div>
        <div style="font-size:12px;color:var(--sage);margin-top:6px;line-height:1.5;">${esc(projectSummary(p))}</div>
        <div style="margin-top:7px;">${p.file_stored ? `<span class="pill donor">📎 ${esc(p.file_name||'document')}</span>` : `<span class="pill">no file</span>`}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <span class="mono" style="font-size:11px;color:var(--terracotta);">open →</span>
        <button class="btn danger sm" data-del="${p.id}">Delete</button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('[data-open]').forEach(item => {
    item.onclick = (e) => { if (e.target.dataset.del) return; openProjectModal(+item.dataset.open); };
  });
  wrap.querySelectorAll('[data-del]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    await api('/projects/' + b.dataset.del, 'DELETE');
    projects = projects.filter(p => p.id !== +b.dataset.del);
    drawProjectCards();
    toast('Project deleted');
  });
}

function openProjectModal(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const modal = document.getElementById('projectModal');
  const fileView = p.file_stored
    ? `<iframe src="/api/projects/${p.id}/file#view=FitH&toolbar=1" style="width:100%;height:78vh;border:1px solid var(--line);border-radius:8px;background:#fff;"></iframe>
       <div style="margin-top:10px;"><a class="btn ghost sm" href="/api/projects/${p.id}/file" target="_blank">Open document in a new tab</a></div>`
    : `<div class="empty">No document was uploaded for this project.</div>`;
  modal.innerHTML = `
    <div class="modal-backdrop" id="mBack">
      <div class="modal modal-wide">
        <div class="modal-head">
          <div><div class="serif" style="font-size:18px;font-weight:600;">${esc(p.title)}</div>
          <div style="font-size:12px;color:var(--sage);margin-top:2px;">${esc(p.client||'—')} · ${esc(p.duration||'—')}${p.location?' · '+esc(p.location):''}</div></div>
          <button class="lnk" id="mClose">Close</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h2 style="font-size:14px;margin:0;">Original document</h2>
          </div>
          ${fileView}
          <h2 style="font-size:14px;margin-top:20px;">Requirement text</h2>
          <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;color:var(--ink);">${esc(p.notes||'—')}</div>
        </div>
      </div>
    </div>`;
  const close = () => modal.innerHTML = '';
  document.getElementById('mClose').onclick = close;
  document.getElementById('mBack').onclick = (e) => { if (e.target.id === 'mBack') close(); };
}

async function postProject() {
  const val = id => document.getElementById(id).value;
  const title = val('np_title').trim();
  if (!title) { toast('Give the project a title first', true); return; }
  const notes = val('np_notes').trim();
  if (!notes && !pendingProjectFile) { toast('Add requirement text or upload a document', true); return; }
  const payload = { title, client: val('np_client'), duration: val('np_duration'), location: val('np_location'), notes };
  if (pendingProjectFile) Object.assign(payload, pendingProjectFile);
  try {
    await api('/projects', 'POST', payload);
    toast('Project posted');
    pendingProjectFile = null;
    await drawProjectsSection();
  } catch (e) { toast(e.message, true); }
}

/* ===== SECTION 2: CVs ===== */
function designation(c) {
  const w = (c.work_experience || [])[0];
  if (w && (w.title || w.organization)) return [w.title, w.organization].filter(Boolean).join(', ');
  return c.nationality ? c.nationality : '—';
}
async function drawCvsSection() {
  const body = document.getElementById('agentBody');
  try { candidatePool = await api('/candidates'); } catch (e) { toast(e.message, true); }
  if (!candidatePool.length) { body.innerHTML = `<div class="empty"><div class="et">No CVs yet</div>Candidates who register and build a profile appear here.</div>`; return; }
  body.innerHTML = `
    <div class="field" style="max-width:340px;"><input id="cvSearch" placeholder="Search by name, designation, or skill…"></div>
    <div class="cand-grid" id="cvGrid"></div>
    <div id="cvModal"></div>`;
  const draw = (filter) => {
    const f = (filter || '').toLowerCase();
    const list = candidatePool.filter(c => {
      if (!f) return true;
      const hay = [c.full_name, designation(c), c.about_me, ...(c.skill_tags||[]), ...(c.sectors||[])].join(' ').toLowerCase();
      return hay.includes(f);
    });
    const grid = document.getElementById('cvGrid');
    if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">No matches.</div>`; return; }
    grid.innerHTML = list.map(c => `
      <div class="cand" data-cv="${c.user_id}" style="cursor:pointer;">
        <div class="ch"><div class="avatar">${initials(c.full_name)}</div>
          <div><div class="cn">${esc(c.full_name||'(unnamed)')}</div><div class="cl">${esc(designation(c))}</div></div></div>
        ${c.about_me ? `<div style="font-size:11.5px;color:var(--sage);line-height:1.5;">${esc(c.about_me.slice(0,130))}${c.about_me.length>130?'…':''}</div>` : `<div style="font-size:11.5px;color:var(--sage);">No summary yet.</div>`}
        <div class="tags" style="gap:5px;margin-top:10px;">
          ${(c.sectors||[]).slice(0,3).map(s => `<span class="pill sector">${esc(s)}</span>`).join('')}
          ${(c.skill_tags||[]).slice(0,2).map(s => `<span class="pill skill">${esc(s)}</span>`).join('')}
        </div>
      </div>`).join('');
    grid.querySelectorAll('[data-cv]').forEach(el => el.onclick = () => openCvModalByUserId(+el.dataset.cv));
  };
  draw('');
  document.getElementById('cvSearch').oninput = (e) => draw(e.target.value);
}

function openCvModalByUserId(userId) {
  const c = candidatePool.find(x => x.user_id === userId);
  if (c) renderCvModal(c);
}

function renderCvModal(c) {
  // Ensure a modal container exists even when called from the Sorting section.
  let modal = document.getElementById('cvModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cvModal';
    document.body.appendChild(modal);
  }
  const workHtml = (c.work_experience||[]).map(w => `
    <div class="repeat" style="margin-bottom:8px;">
      <div style="font-weight:600;font-size:13px;">${esc(w.title||'—')}</div>
      <div style="font-size:11.5px;color:var(--sage);">${esc(w.organization||'')}${w.location?' · '+esc(w.location):''} ${w.start_date||w.end_date?`· ${esc(w.start_date||'')}–${esc(w.end_date||'')}`:''}</div>
      ${w.description?`<div style="font-size:12px;margin-top:5px;line-height:1.5;">${esc(w.description)}</div>`:''}
    </div>`).join('') || '<div class="sub">None listed.</div>';
  const eduHtml = (c.education||[]).map(e => `
    <div style="font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line-soft);">
      <b style="font-weight:600;">${esc(e.degree||'—')}</b> — ${esc(e.institution||'')} ${e.year?`(${esc(e.year)})`:''}</div>`).join('') || '<div class="sub">None listed.</div>';
  const langHtml = (c.languages||[]).map(l => `<span class="pill">${esc(l.language||'')}${l.level?' · '+esc(l.level):''}</span>`).join(' ') || '<span class="sub">None listed.</span>';
  const contactBits = [c.email, c.phone].filter(Boolean).map(esc).join(' · ');
  modal.innerHTML = `
    <div class="modal-backdrop" id="cvBack">
      <div class="modal">
        <div class="modal-head">
          <div><div class="serif" style="font-size:18px;font-weight:600;">${esc(c.full_name||'(unnamed)')}</div>
          <div style="font-size:12px;color:var(--sage);margin-top:2px;">${esc(designation(c))}${c.address?' · '+esc(c.address):''}${c.nationality?' · '+esc(c.nationality):''}</div></div>
          <button class="lnk" id="cvClose">Close</button>
        </div>
        <div class="modal-body">
          ${contactBits?`<div style="font-size:12px;color:var(--sage);margin-bottom:14px;">${contactBits}</div>`:''}
          ${c.about_me?`<h2 style="font-size:14px;">About</h2><div style="font-size:13px;line-height:1.6;margin-bottom:16px;">${esc(c.about_me)}</div>`:''}
          <h2 style="font-size:14px;">Work experience</h2>${workHtml}
          <h2 style="font-size:14px;margin-top:16px;">Education</h2>${eduHtml}
          <h2 style="font-size:14px;margin-top:16px;">Languages</h2><div class="tags" style="gap:6px;">${langHtml}</div>
          ${c.digital_skills?`<h2 style="font-size:14px;margin-top:16px;">Digital skills</h2><div style="font-size:12.5px;">${esc(c.digital_skills)}</div>`:''}
          ${c.other_skills?`<h2 style="font-size:14px;margin-top:16px;">Other skills</h2><div style="font-size:12.5px;">${esc(c.other_skills)}</div>`:''}
          ${c.additional_info?`<h2 style="font-size:14px;margin-top:16px;">Additional</h2><div style="font-size:12.5px;">${esc(c.additional_info)}</div>`:''}
          <h2 style="font-size:14px;margin-top:16px;">Tags</h2>
          <div class="tags" style="gap:5px;">
            ${(c.sectors||[]).map(s=>`<span class="pill sector">${esc(s)}</span>`).join('')}
            ${(c.skill_tags||[]).map(s=>`<span class="pill skill">${esc(s)}</span>`).join('')}
            ${(c.donor_tags||[]).map(s=>`<span class="pill donor">${esc(s)}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  const close = () => modal.innerHTML = '';
  document.getElementById('cvClose').onclick = close;
  document.getElementById('cvBack').onclick = (e) => { if (e.target.id === 'cvBack') close(); };
}

/* ===== SECTION 3: SORTING ===== */
async function drawSortingSection() {
  const body = document.getElementById('agentBody');
  try { projects = await api('/projects'); } catch (e) { toast(e.message, true); }
  if (!projects.length) { body.innerHTML = `<div class="empty"><div class="et">No projects to sort by</div>Create a project in the Projects section first.</div>`; return; }
  body.innerHTML = `
    <div class="card">
      <div class="field"><label>Search projects</label><input id="sortSearch" placeholder="Type a project title…"></div>
      <div class="field"><label>Select a project to rank candidates against</label>
        <select id="sortSelect"></select>
      </div>
      <button class="btn" id="runSort">Rank candidates</button>
    </div>
    <div id="sortResults" style="margin-top:18px;"></div>`;
  const fillSelect = (filter) => {
    const f = (filter||'').toLowerCase();
    const opts = projects.filter(p => !f || p.title.toLowerCase().includes(f));
    const sel = document.getElementById('sortSelect');
    sel.innerHTML = opts.map(p => `<option value="${p.id}">${esc(p.title)} — ${esc(p.client||'')}</option>`).join('') || `<option value="">No matching projects</option>`;
    if (sortProjectId && opts.some(p => p.id === sortProjectId)) sel.value = sortProjectId;
  };
  fillSelect('');
  document.getElementById('sortSearch').oninput = (e) => fillSelect(e.target.value);
  document.getElementById('runSort').onclick = () => {
    const sel = document.getElementById('sortSelect');
    if (!sel.value) { toast('Pick a project first', true); return; }
    sortProjectId = +sel.value;
    loadSortResults(sortProjectId);
  };
  if (sortProjectId) { document.getElementById('sortSelect').value = sortProjectId; loadSortResults(sortProjectId); }
}

async function loadSortResults(projId, forceRefresh) {
  const area = document.getElementById('sortResults');
  area.innerHTML = `<div class="empty"><span class="spinner"></span> ${forceRefresh ? 'Re-ranking from scratch…' : 'Loading ranking…'}</div>`;
  let data;
  try { data = await api('/projects/' + projId + '/shortlist' + (forceRefresh ? '?refresh=1' : '')); }
  catch (e) { area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const { project, ranked, mode, cached, cachedAt } = data;
  if (!ranked.length) { area.innerHTML = `<div class="empty"><div class="et">No candidates to rank</div>Once candidates build profiles, they'll be scored here.</div>`; return; }
  const strong = ranked.filter(r => r.total >= 50).length;
  const when = cachedAt ? new Date(cachedAt).toLocaleString() : '';
  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <h2 class="serif" style="margin:0;">Ranked candidates · ${esc(project.title)}</h2>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="mono" style="font-size:11px;color:var(--sage);">${cached ? 'saved result' + (when ? ' · ' + esc(when) : '') : 'freshly ranked'}</span>
        <button class="btn ghost sm" id="rerankBtn">Re-rank</button>
      </div>
    </div>
    <div class="scorecard" style="margin-top:14px;">
      <div class="stat"><div class="sv">${ranked.length}</div><div class="sl">candidates scored</div></div>
      <div class="stat"><div class="sv">${strong}</div><div class="sl">strong matches (50+)</div></div>
      <div class="stat"><div class="sv">~${ranked.length} min</div><div class="sl">manual screening saved</div></div>
    </div>
    ${cached ? `<div class="sub" style="margin:-4px 0 16px;color:var(--sage);">Reused a saved ranking — nothing changed since last time, so no new AI scoring was run. Click Re-rank to force a fresh scoring.</div>` : ''}
    ${mode === 'fallback' ? `<div class="sub" style="margin:-8px 0 16px;color:var(--bad);">AI scoring unavailable (no Gemini key or quota) — showing a basic keyword-based ranking instead.</div>` : ''}
    ${ranked.map((r, i) => `
      <div class="rank-card ${i===0&&r.total>0?'top':''}" data-rank="${i}" style="cursor:pointer;">
        <div class="rank-top">
          <div style="display:flex;gap:12px;">
            <div class="rank-badge">${i+1}</div>
            <div>
              <div style="font-weight:600;font-size:14.5px;" class="serif">${esc(r.candidate.full_name||'(unnamed candidate)')}</div>
              <div style="font-size:11.5px;color:var(--sage);margin-top:1px;">${esc(r.candidate.address||'—')}${r.candidate.nationality?' · '+esc(r.candidate.nationality):''}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="score">${r.total}<span class="lbl">fit</span></div>
            <div class="mono" style="font-size:10px;color:var(--terracotta);margin-top:2px;">view full CV →</div>
          </div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${r.total}%;"></div></div>
        ${r.reasoning ? `<div class="match-row" style="color:var(--ink);">${esc(r.reasoning)}</div>` : ''}
        ${Array.isArray(r.strengths) && r.strengths.length ? `<div class="match-row" style="margin-top:6px;"><b style="font-weight:600;">Strengths:</b> <span class="ok">${r.strengths.map(esc).join(', ')}</span></div>` : ''}
        ${Array.isArray(r.gaps) && r.gaps.length ? `<div class="match-row"><b style="font-weight:600;">Gaps:</b> <span style="color:var(--sage);">${r.gaps.map(esc).join(', ')}</span></div>` : ''}
      </div>`).join('')}`;
  // Clicking a ranked candidate opens their full CV.
  document.querySelectorAll('#sortResults [data-rank]').forEach(card => {
    card.onclick = () => renderCvModal(ranked[+card.dataset.rank].candidate);
  });
  const rb = document.getElementById('rerankBtn');
  if (rb) rb.onclick = () => loadSortResults(projId, true);
}
