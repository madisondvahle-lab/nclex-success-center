(function () {
  const db = supabase.createClient(
    'https://pmjwwktwlsqpetwfvolb.supabase.co',
    'sb_publishable_MDgerX5UJd44TlYgMOalDw_DqNMvxfT'
  );

  function formatDate(value) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function daysUntil(value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${value}T00:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function getCountdownCopy(value) {
    if (!value) {
      return {
        eyebrow: 'Personalize your plan',
        title: 'Add your NCLEX date',
        detail: 'Your countdown and study priorities will update here once you set your target date.'
      };
    }
    const days = daysUntil(value);
    if (days === 0) return { eyebrow: 'NCLEX day is here', title: 'Your NCLEX is today', detail: `Target date: ${formatDate(value)}. You are ready for this.` };
    if (days === 1) return { eyebrow: 'Countdown', title: '1 day until NCLEX', detail: `Your target date is ${formatDate(value)}.` };
    if (days > 1) return { eyebrow: 'Countdown', title: `${days} days until NCLEX`, detail: `Your target date is ${formatDate(value)}.` };
    return { eyebrow: 'Date update needed', title: 'Update your NCLEX date', detail: `The saved date (${formatDate(value)}) has passed.` };
  }

  function addStyles() {
    if (document.getElementById('nclex-countdown-styles')) return;
    const style = document.createElement('style');
    style.id = 'nclex-countdown-styles';
    style.textContent = `
      .nclex-countdown-card{display:flex;gap:18px;align-items:center;justify-content:space-between;margin:0 0 26px;padding:20px 22px;border:1px solid #9de5dc;border-radius:16px;background:linear-gradient(135deg,#effcf9,#f5fbff);box-shadow:0 8px 20px rgba(13,148,136,.08)}
      .nclex-countdown-copy{display:flex;gap:14px;align-items:flex-start}.nclex-countdown-icon{display:grid;place-items:center;flex:0 0 auto;width:42px;height:42px;border-radius:12px;background:#ccfbf1;font-size:22px}.nclex-countdown-eyebrow{margin:0 0 4px;color:#0f766e;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.nclex-countdown-title{margin:0;color:#17324d;font-size:20px;line-height:1.15}.nclex-countdown-detail{margin:5px 0 0;color:#476275;font-size:13px;line-height:1.45}.nclex-date-button{padding:9px 12px;border:1px solid #5eead4;border-radius:9px;color:#115e59;background:#fff;font:700 13px inherit;cursor:pointer;white-space:nowrap}.nclex-date-button:hover{background:#f0fdfa}.nclex-date-editor{display:none;align-items:end;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid #cceee9}.nclex-date-editor.open{display:flex}.nclex-date-editor label{display:grid;gap:5px;flex:1;color:#476275;font-size:12px;font-weight:700}.nclex-date-editor input{min-height:38px;padding:7px 9px;border:1px solid #a7c7d4;border-radius:8px;color:#17324d;background:#fff;font:14px inherit}.nclex-date-status{min-height:18px;margin:8px 0 0;color:#0f766e;font-size:12px}.nclex-date-status.error{color:#b4233a}@media(max-width:620px){.nclex-countdown-card{align-items:flex-start;flex-direction:column}.nclex-date-editor{width:100%;align-items:stretch;flex-direction:column}.nclex-date-button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function updateKyleSpecificCopy(value) {
    const copy = getCountdownCopy(value);
    const headerCountdown = document.querySelector('.header-countdown');
    if (headerCountdown) headerCountdown.textContent = `⚡ ${copy.title}${value ? ` · ${formatDate(value)}` : ''}`;
    const urgentBox = document.querySelector('.info-box-urgent .info-text-urgent');
    if (urgentBox) {
      urgentBox.replaceChildren();
      const strong = document.createElement('strong');
      strong.textContent = value ? `${copy.title}. ` : 'Your personalized NCLEX plan starts here. ';
      urgentBox.appendChild(strong);
      urgentBox.append(document.createTextNode(value ? 'Complete your diagnostic so your final study plan is targeted to your timeline.' : 'Set your NCLEX date above, then complete your diagnostic to target your study plan.'));
    }
  }

  function renderCountdown(container, student) {
    const value = student.nclex_target_date || '';
    const copy = getCountdownCopy(value);
    container.innerHTML = `
      <div class="nclex-countdown-copy">
        <div class="nclex-countdown-icon" aria-hidden="true">📅</div>
        <div>
          <p class="nclex-countdown-eyebrow">${copy.eyebrow}</p>
          <h2 class="nclex-countdown-title">${copy.title}</h2>
          <p class="nclex-countdown-detail">${copy.detail}</p>
        </div>
      </div>
      <button class="nclex-date-button" type="button">${value ? 'Update date' : 'Set date'}</button>
      <div style="width:100%">
        <form class="nclex-date-editor">
          <label>NCLEX target date<input type="date" value="${value}" min="${new Date().toISOString().slice(0, 10)}" required></label>
          <button class="nclex-date-button" type="submit">Save date</button>
        </form>
        <p class="nclex-date-status" aria-live="polite"></p>
      </div>
    `;

    const toggle = container.querySelector('.nclex-date-button');
    const form = container.querySelector('.nclex-date-editor');
    const input = form.querySelector('input');
    const status = container.querySelector('.nclex-date-status');
    toggle.addEventListener('click', () => {
      form.classList.toggle('open');
      if (form.classList.contains('open')) input.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submittedDate = input.value;
      status.className = 'nclex-date-status';
      status.textContent = 'Saving your NCLEX date…';
      const { data, error } = await db.rpc('update_my_nclex_target_date', { new_target_date: submittedDate });
      if (error) {
        status.className = 'nclex-date-status error';
        status.textContent = 'Unable to save your date. Please try again or contact Madison.';
        return;
      }
      student.nclex_target_date = data;
      renderCountdown(container, student);
      updateKyleSpecificCopy(student.nclex_target_date);
    });

    updateKyleSpecificCopy(value);
  }

  function mountCountdown(student) {
    const main = document.querySelector('main');
    if (!main || document.getElementById('nclex-countdown-card')) return false;
    addStyles();
    const container = document.createElement('section');
    container.id = 'nclex-countdown-card';
    container.className = 'nclex-countdown-card';
    main.prepend(container);
    renderCountdown(container, student);
    return true;
  }

  async function boot() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;
    const { data: student } = await db
      .from('students')
      .select('name,nclex_target_date')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!student) return;
    if (mountCountdown(student)) return;
    const observer = new MutationObserver(() => {
      if (mountCountdown(student)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 10000);
  }

  boot();
})();
