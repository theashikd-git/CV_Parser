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
      <div class="auth-logo">Vantage Point</div>
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
      <div class="brand">Vantage Point <span>${role}</span></div>
      <div class="nav-right">
        <span class="role-badge ${role}">${role==='agent'?'Agency account':'Candidate account'}</span>
        <button class="lnk" id="logoutBtn">Log out</button>
      </div>
    </div>
    <div class="wrap" id="viewWrap">${inner}</div>`;
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
      <input type="file" id="cvFile" accept=".pdf,.docx,.txt" class="hidden">
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
async function handleCV(file) {
  const status = document.getElementById('parseStatus');
  status.innerHTML = `<span class="spinner"></span> Extracting text…`;
  let text;
  try { text = await extractText(file); }
  catch (e) { status.textContent = 'Could not read file: ' + e.message; return; }
  if (!text.trim()) { status.textContent = 'No readable text found in that file.'; return; }

  status.innerHTML = `<span class="spinner"></span> Reading your CV and filling the form…`;
  try {
    const { parsed } = await api('/parse-cv', 'POST', { cvText: text.slice(0, 14000) });
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
let agentTab = 'projects';
let projects = [];
let candidatePool = [];
let selectedProjectId = null;

async function renderAgent() {
  root.innerHTML = shell('agent', `<div class="empty"><span class="spinner"></span> Loading…</div>`);
  wireShell();
  drawAgent();
}
async function drawAgent() {
  const wrap = document.getElementById('viewWrap');
  wrap.innerHTML = `
    <div class="eyebrow">Agency workspace</div>
    <h1>Projects &amp; matching</h1>
    <p class="sub">Post a project, then open it to get an instant ranked shortlist of candidates.</p>
    <div class="tabs">
      <button class="tab ${agentTab==='projects'?'active':''}" id="tabP">Projects</button>
      <button class="tab ${agentTab==='pool'?'active':''}" id="tabC">Candidate pool</button>
    </div>
    <div id="agentBody"><div class="empty"><span class="spinner"></span> Loading…</div></div>`;
  document.getElementById('tabP').onclick = () => { agentTab='projects'; drawAgent(); };
  document.getElementById('tabC').onclick = () => { agentTab='pool'; drawAgent(); };
  if (agentTab === 'projects') await drawProjectsTab();
  else await drawPoolTab();
}

async function drawProjectsTab() {
  try { projects = await api('/projects'); } catch (e) { toast(e.message, true); }
  const body = document.getElementById('agentBody');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 360px;gap:22px;align-items:start;">
      <div>
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Your projects — click one to shortlist</div>
        <div id="projList"></div>
        <div id="shortlistArea" style="margin-top:20px;"></div>
      </div>
      <div class="card">
        <h2>New project</h2>
        <div class="field"><label>Title</label><input id="np_title" placeholder="e.g. Tax Reform Team Leader"></div>
        <div class="row2">
          <div class="field"><label>Client</label><input id="np_client" placeholder="World Bank"></div>
          <div class="field"><label>Duration</label><input id="np_duration" placeholder="8 months"></div>
        </div>
        <div class="field"><label>Location</label><input id="np_location" placeholder="East Africa"></div>
        <div class="field">
          <label>Requirement document <span class="hint">upload a ToR (PDF/DOCX/txt)</span></label>
          <div class="dropzone" id="np_dz"><div class="dz-text">Drop the project document here or click</div><div class="dz-sub">Its text becomes the requirement candidates are matched against</div></div>
          <input type="file" id="np_file" accept=".pdf,.docx,.txt" class="hidden">
          <div id="np_fileStatus" class="sub" style="margin:8px 0 0;"></div>
        </div>
        <div class="field"><label>Requirement text <span class="hint">auto-filled from the file, or type/paste directly</span></label><textarea id="np_notes" rows="6" placeholder="Describe the role, required expertise, sectors, donor experience, languages…"></textarea></div>
        <button class="btn" style="width:100%;" id="postProj">Post project</button>
      </div>
    </div>`;
  setupProjectUpload();
  document.getElementById('postProj').onclick = postProject;
  drawProjList();
  if (selectedProjectId) loadShortlist(selectedProjectId);
}

function setupProjectUpload() {
  const dz = document.getElementById('np_dz');
  const input = document.getElementById('np_file');
  dz.onclick = () => input.click();
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleProjectFile(e.dataTransfer.files[0]); });
  input.onchange = e => { if (e.target.files.length) handleProjectFile(e.target.files[0]); input.value = ''; };
}
async function handleProjectFile(file) {
  const status = document.getElementById('np_fileStatus');
  status.innerHTML = `<span class="spinner"></span> Extracting text…`;
  try {
    const text = await extractText(file);
    if (!text.trim()) { status.textContent = 'No readable text found in that file.'; return; }
    const notes = document.getElementById('np_notes');
    notes.value = text.trim();
    status.textContent = `Loaded "${file.name}" — review the requirement text below, then post.`;
  } catch (e) {
    status.textContent = 'Could not read file: ' + e.message;
  }
}

function drawProjList() {
  const list = document.getElementById('projList');
  if (!projects.length) { list.innerHTML = `<div class="empty"><div class="et">No projects yet</div>Create your first project on the right.</div>`; return; }
  list.innerHTML = projects.map(p => `
    <div class="proj-item ${selectedProjectId===p.id?'active':''}" data-id="${p.id}">
      <div>
        <h4>${esc(p.title)}</h4>
        <div class="pm">${esc(p.client||'—')} · ${esc(p.duration||'—')}${p.location?' · '+esc(p.location):''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span class="mono" style="font-size:11px;color:var(--terracotta);">${selectedProjectId===p.id?'shortlisting':'shortlist →'}</span>
        <button class="btn danger sm" data-del="${p.id}">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.proj-item').forEach(item => {
    item.onclick = (e) => { if (e.target.dataset.del) return; selectedProjectId = +item.dataset.id; drawProjList(); loadShortlist(selectedProjectId); };
  });
  list.querySelectorAll('[data-del]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    await api('/projects/' + b.dataset.del, 'DELETE');
    if (selectedProjectId === +b.dataset.del) { selectedProjectId = null; document.getElementById('shortlistArea').innerHTML = ''; }
    projects = projects.filter(p => p.id !== +b.dataset.del);
    drawProjList();
    toast('Project deleted');
  });
}

async function postProject() {
  const val = id => document.getElementById(id).value;
  const title = val('np_title').trim();
  if (!title) { toast('Give the project a title first', true); return; }
  const notes = val('np_notes').trim();
  if (!notes) { toast('Add requirement text or upload a document', true); return; }
  try {
    const r = await api('/projects', 'POST', {
      title, client: val('np_client'), duration: val('np_duration'), location: val('np_location'), notes
    });
    toast('Project posted');
    selectedProjectId = r.id;
    await drawProjectsTab();
    loadShortlist(r.id);
  } catch (e) { toast(e.message, true); }
}

async function loadShortlist(projId) {
  const area = document.getElementById('shortlistArea');
  area.innerHTML = `<div class="empty"><span class="spinner"></span> Reading CVs and scoring against the requirement… this can take a few seconds.</div>`;
  let data;
  try { data = await api('/projects/' + projId + '/shortlist'); }
  catch (e) { area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const { project, ranked, mode } = data;
  const strong = ranked.filter(r => r.total >= 50).length;

  if (!ranked.length) { area.innerHTML = `<div class="empty"><div class="et">No candidates in the system yet</div>Once candidates register and build profiles, they'll be scored here.</div>`; return; }

  area.innerHTML = `
    <h2 class="serif">Ranked shortlist · ${esc(project.title)}</h2>
    <div class="scorecard">
      <div class="stat"><div class="sv">${ranked.length}</div><div class="sl">candidates scored</div></div>
      <div class="stat"><div class="sv">${strong}</div><div class="sl">strong matches (50+)</div></div>
      <div class="stat"><div class="sv">~${ranked.length} min</div><div class="sl">manual screening saved</div></div>
    </div>
    ${mode === 'fallback' ? `<div class="sub" style="margin:-8px 0 16px;color:var(--bad);">AI scoring unavailable (no Gemini key or quota) — showing a basic keyword-based ranking instead.</div>` : ''}
    ${ranked.map((r, i) => `
      <div class="rank-card ${i===0&&r.total>0?'top':''}">
        <div class="rank-top">
          <div style="display:flex;gap:12px;">
            <div class="rank-badge">${i+1}</div>
            <div>
              <div style="font-weight:600;font-size:14.5px;" class="serif">${esc(r.candidate.full_name||'(unnamed candidate)')}</div>
              <div style="font-size:11.5px;color:var(--sage);margin-top:1px;">${esc(r.candidate.address||'—')}${r.candidate.nationality?' · '+esc(r.candidate.nationality):''}</div>
            </div>
          </div>
          <div class="score">${r.total}<span class="lbl">fit</span></div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${r.total}%;"></div></div>
        ${r.reasoning ? `<div class="match-row" style="color:var(--ink);">${esc(r.reasoning)}</div>` : ''}
        ${Array.isArray(r.strengths) && r.strengths.length ? `<div class="match-row" style="margin-top:6px;"><b style="font-weight:600;">Strengths:</b> <span class="ok">${r.strengths.map(esc).join(', ')}</span></div>` : ''}
        ${Array.isArray(r.gaps) && r.gaps.length ? `<div class="match-row"><b style="font-weight:600;">Gaps:</b> <span style="color:var(--sage);">${r.gaps.map(esc).join(', ')}</span></div>` : ''}
      </div>`).join('')}`;
}

async function drawPoolTab() {
  const body = document.getElementById('agentBody');
  try { candidatePool = await api('/candidates'); } catch (e) { toast(e.message, true); }
  if (!candidatePool.length) { body.innerHTML = `<div class="empty"><div class="et">No candidates yet</div>Candidates who register and build a profile will appear here.</div>`; return; }
  body.innerHTML = `<div class="cand-grid">${candidatePool.map(c => `
    <div class="cand">
      <div class="ch"><div class="avatar">${initials(c.full_name)}</div><div><div class="cn">${esc(c.full_name||'(unnamed)')}</div><div class="cl">${esc(c.address||'—')}${c.nationality?' · '+esc(c.nationality):''}</div></div></div>
      <div class="tags" style="gap:5px;">
        ${c.sectors.slice(0,3).map(s => `<span class="pill sector">${esc(s)}</span>`).join('')}
        ${c.skill_tags.slice(0,3).map(s => `<span class="pill skill">${esc(s)}</span>`).join('')}
        ${c.donor_tags.slice(0,2).map(s => `<span class="pill donor">${esc(s)}</span>`).join('')}
      </div>
      ${c.about_me ? `<div style="font-size:11.5px;color:var(--sage);margin-top:10px;line-height:1.5;">${esc(c.about_me.slice(0,140))}${c.about_me.length>140?'…':''}</div>` : ''}
    </div>`).join('')}</div>`;
}
