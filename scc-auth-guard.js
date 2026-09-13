/* ============================================================
   TIB Systems — SAP Controls & Compliance
   Standalone auth + enrollment guard.
   Independent of the Controls Consulting Trainee Console (ctm_enrollments) --
   this course is sold and gated separately. Shares the same Supabase Auth
   user pool (one login directory across TIB products is fine and normal),
   but enrollment is checked against its own dedicated table,
   sapexec_scc_enrollments, so a Trainee Console account with no row here
   gets no access, and vice versa.
   ============================================================ */
(function () {
  const SUPABASE_URL = 'https://blfgwysgekfqhcafofhe.supabase.co';
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZmd3eXNnZWtmcWhjYWZvZmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyODY0NDksImV4cCI6MjA5NTg2MjQ0OX0.HPdIMd-X30QBufoL9BVSVte6s_Fc-OOKIq9MbwLrzcI";
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  window.__sccSb = sb;

  // Hide the page immediately so nothing flashes before the gate resolves.
  const hideStyle = document.createElement('style');
  hideStyle.id = 'scc-guard-hide';
  hideStyle.textContent = 'html{visibility:hidden !important;}';
  document.head.appendChild(hideStyle);

  const gateCss = document.createElement('style');
  gateCss.textContent = `
    #scc-gate-overlay{position:fixed;inset:0;z-index:9999;background:var(--navy,#1F3864);
      display:flex;align-items:center;justify-content:center;padding:20px;
      font-family:'DM Sans',-apple-system,sans-serif;visibility:visible;}
    #scc-gate-overlay.hidden{display:none;}
    .scc-gate-card{width:100%;max-width:380px;background:#fff;color:var(--grey-800,#1E2A38);
      padding:34px 32px;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,0.35);}
    .scc-gate-card .scc-mark{font-family:'DM Serif Display',serif;font-style:italic;
      color:var(--amber-deep,#9E470D);font-size:20px;display:block;margin-bottom:2px;}
    .scc-gate-card .scc-sub{font-size:11px;letter-spacing:1.2px;text-transform:uppercase;
      color:var(--grey-500,#566278);margin-bottom:24px;display:block;}
    .scc-gate-card h2{font-family:'DM Serif Display',serif;font-size:19px;margin:0 0 6px;
      color:var(--navy,#1F3864);}
    .scc-gate-card p.scc-hint{font-size:13px;color:var(--grey-500,#566278);margin:0 0 18px;line-height:1.5;}
    .scc-gate-card label{display:block;font-size:11px;letter-spacing:0.4px;text-transform:uppercase;
      color:var(--amber-deep,#9E470D);font-weight:700;margin:12px 0 6px;}
    .scc-gate-card input{width:100%;padding:10px 12px;border:1px solid var(--grey-200,#C8D0DF);
      background:var(--off-white,#F7F8FC);font-size:14px;border-radius:4px;
      font-family:inherit;color:inherit;box-sizing:border-box;}
    .scc-gate-card input:focus{outline:2px solid var(--teal,#1F7A8C);outline-offset:1px;}
    .scc-gate-btn{width:100%;margin-top:20px;padding:11px;background:var(--navy,#1F3864);
      color:#fff;border:none;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;}
    .scc-gate-btn:hover{background:var(--navy-deep,#152849);}
    .scc-switch-line{margin-top:14px;font-size:12.5px;color:var(--grey-500,#566278);text-align:center;}
    .scc-switch-line a{color:var(--teal,#1F7A8C);cursor:pointer;text-decoration:underline;}
    .scc-gate-msg{margin-top:14px;font-size:12.5px;padding:9px 11px;border-radius:4px;line-height:1.5;}
    .scc-gate-msg.error{background:var(--color-error-light,#FDEDEC);color:var(--color-error,#C62A1F);
      border:1px solid rgba(198,42,31,0.3);}
    .scc-gate-msg.info{background:var(--teal-faint,#EBF6F8);color:var(--teal-deep,#155E6E);
      border:1px solid rgba(31,122,140,0.3);}
    .scc-gate-msg.hidden{display:none;}
    .scc-not-enrolled .scc-icon{font-size:28px;margin-bottom:10px;text-align:center;}
    .scc-signout-link{margin-top:16px;display:inline-block;font-size:12.5px;color:var(--teal,#1F7A8C);
      cursor:pointer;text-decoration:underline;}
    #scc-loading{position:fixed;inset:0;z-index:9998;background:var(--navy,#1F3864);color:#B9C6E0;
      display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:13px;}
    #scc-loading.hidden{display:none;}
  `;
  document.head.appendChild(gateCss);

  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'scc-loading';
  loadingDiv.textContent = 'Loading…';

  const overlay = document.createElement('div');
  overlay.id = 'scc-gate-overlay';
  overlay.className = 'hidden';

  let mode = 'signin'; // 'signin' | 'signup'

  function renderAuthCard() {
    overlay.innerHTML = `
      <div class="scc-gate-card">
        <span class="scc-mark">TIB Systems</span>
        <span class="scc-sub">SAP Controls &amp; Compliance</span>
        <h2 id="scc-auth-title">Trainee Sign In</h2>
        <p class="scc-hint" id="scc-auth-hint">Sign in with the email and password used when you purchased this elective.</p>
        <label for="scc-email">Email</label>
        <input id="scc-email" type="email" autocomplete="email" placeholder="you@company.com" />
        <label for="scc-password">Password</label>
        <input id="scc-password" type="password" autocomplete="current-password" placeholder="••••••••" />
        <button class="scc-gate-btn" id="scc-auth-submit">Sign In</button>
        <div class="scc-switch-line">
          <span id="scc-switch-text">New here?</span>
          <a id="scc-switch-link">Create an account</a>
        </div>
        <div class="scc-gate-msg hidden" id="scc-auth-msg"></div>
      </div>
    `;
    overlay.classList.remove('hidden');

    document.getElementById('scc-switch-link').onclick = () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      document.getElementById('scc-auth-title').textContent = mode === 'signup' ? 'Create Your Account' : 'Trainee Sign In';
      document.getElementById('scc-auth-hint').textContent = mode === 'signup'
        ? 'Use the email you purchased this elective with.'
        : 'Sign in with the email and password used when you purchased this elective.';
      document.getElementById('scc-auth-submit').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
      document.getElementById('scc-switch-text').textContent = mode === 'signup' ? 'Already have an account?' : 'New here?';
      document.getElementById('scc-switch-link').textContent = mode === 'signup' ? 'Sign in' : 'Create an account';
      clearMsg();
    };

    document.getElementById('scc-auth-submit').onclick = submitAuth;
    ['scc-email', 'scc-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
    });
  }

  function showMsg(text, type) {
    const el = document.getElementById('scc-auth-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'scc-gate-msg ' + type;
  }
  function clearMsg() {
    const el = document.getElementById('scc-auth-msg');
    if (el) el.className = 'scc-gate-msg hidden';
  }

  async function submitAuth() {
    const email = document.getElementById('scc-email').value.trim();
    const password = document.getElementById('scc-password').value;
    if (!email || !password) { showMsg('Enter your email and password.', 'error'); return; }

    const btn = document.getElementById('scc-auth-submit');
    btn.disabled = true;
    clearMsg();

    const { error } = mode === 'signup'
      ? await sb.auth.signUp({ email, password })
      : await sb.auth.signInWithPassword({ email, password });

    btn.disabled = false;

    if (error) {
      showMsg(error.message || 'Something went wrong.', 'error');
      return;
    }

    if (mode === 'signup') {
      showMsg('Account created. Checking your enrollment…', 'info');
    }
    await runCheck();
  }

  function renderNotEnrolled(email) {
    overlay.innerHTML = `
      <div class="scc-gate-card scc-not-enrolled">
        <span class="scc-mark">TIB Systems</span>
        <span class="scc-sub">SAP Controls &amp; Compliance</span>
        <div class="scc-icon">🔒</div>
        <h2>Not Yet Enrolled</h2>
        <p class="scc-hint">You're signed in as <b>${email}</b>, but this account isn't enrolled in SAP Controls &amp; Compliance. This is a separate purchase from the SAP Testing Execution Guide / Controls Consulting Mastery courses — contact TIB if you believe this is an error.</p>
        <span class="scc-signout-link" id="scc-signout">Sign out</span>
      </div>
    `;
    overlay.classList.remove('hidden');
    document.getElementById('scc-signout').onclick = async () => {
      await sb.auth.signOut();
      mode = 'signin';
      renderAuthCard();
    };
  }

  function unlock() {
    overlay.classList.add('hidden');
    const hide = document.getElementById('scc-guard-hide');
    if (hide) hide.remove();
    document.documentElement.style.visibility = 'visible';
  }

  async function setUserEmail() {
    const { data: { session } } = await sb.auth.getSession();
    window.__sccUserEmail = (session && session.user && session.user.email) || null;
  }

  async function checkEnrollment(email) {
    try {
      const { data, error } = await sb
        .from('sapexec_scc_enrollments')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (error) return false;
      return !!data;
    } catch (e) {
      return false;
    }
  }

  async function runCheck() {
    loadingDiv.classList.remove('hidden');
    overlay.classList.add('hidden');

    const { data: { session } } = await sb.auth.getSession();
    loadingDiv.classList.add('hidden');

    if (!session) {
      renderAuthCard();
      return;
    }

    const email = session.user.email;
    const enrolled = await checkEnrollment(email);
    if (enrolled) {
      await setUserEmail();
      unlock();
    } else {
      renderNotEnrolled(email);
    }
  }

  function mount() {
    document.body.appendChild(loadingDiv);
    document.body.appendChild(overlay);
    runCheck();
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
})();
