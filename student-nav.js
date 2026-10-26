/**
 * Student Portal Navigation Shell Helper
 * Manages responsive drawer behavior, keyboard focus, and dynamic student badges.
 */
(function() {
  'use strict';

  const StudentNav = {
    init: function(options) {
      const opts = options || {};
      const active = opts.active || 'dashboard'; // 'dashboard' | 'practice' | 'lectures' | 'previous-tests' | 'performance'
      const sidebar = document.getElementById('portal-sidebar');
      const toggle = document.getElementById('portal-menu-toggle');
      const closeBtn = document.getElementById('portal-sidebar-close');
      const backdrop = document.getElementById('portal-backdrop');
      const main = document.getElementById('main-content');
      const mobileBar = document.querySelector('.portal-mobile-bar');
      const mobile = window.matchMedia('(max-width: 960px)');

      // Set active nav link
      this.setActive(active);

      // Mobile drawer open/close
      const openDrawer = () => {
        if (!sidebar || !mobile.matches) return;
        sidebar.inert = false;
        sidebar.classList.add('open');
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        document.body.classList.add('portal-drawer-open');
        if (main) main.inert = true;
        if (mobileBar) mobileBar.inert = true;
        if (backdrop) backdrop.classList.add('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        if (closeBtn) closeBtn.focus();
      };

      const closeDrawer = (restoreFocus = true) => {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        sidebar.inert = mobile.matches;
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        document.body.classList.remove('portal-drawer-open');
        if (main) main.inert = false;
        if (mobileBar) mobileBar.inert = false;
        if (backdrop) backdrop.classList.remove('open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          if (restoreFocus) toggle.focus();
        }
      };

      if (toggle) toggle.addEventListener('click', openDrawer);
      if (closeBtn) closeBtn.addEventListener('click', () => closeDrawer());
      if (backdrop) backdrop.addEventListener('click', () => closeDrawer());
      closeDrawer(false);
      mobile.addEventListener('change', () => closeDrawer(false));

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
          closeDrawer();
        }
        if (e.key === 'Tab' && sidebar && sidebar.classList.contains('open')) {
          const items = [...sidebar.querySelectorAll('a[href], button:not([disabled])')]
            .filter(el => el.getClientRects().length);
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });

      // Close drawer when any nav item is clicked on mobile
      document.querySelectorAll('.portal-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          if (window.innerWidth <= 960 && sidebar && sidebar.classList.contains('open')) {
            closeDrawer();
          }
        });
      });

      // Internal in-page anchor smooth scrolling for student-dashboard.html
      if (opts.inPageScroll) {
        this.bindInPageScrolling();
        this.setSectionView('dashboard');
        window.addEventListener('hashchange', () => this.handleInitialHash(window.location.hash));
      }

      // Check if URL has a hash on load to scroll and highlight
      if (window.location.hash) {
        setTimeout(() => {
          this.handleInitialHash(window.location.hash);
        }, 120);
      }
    },

    setActive: function(name) {
      document.querySelectorAll('.portal-nav-item').forEach(el => {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
      });
      const target = document.getElementById('nav-item-' + name);
      if (target) {
        target.classList.add('active');
        target.setAttribute('aria-current', 'page');
      }
    },

    updateStudent: function(student, isPreview) {
      if (!student) return;
      const isNursing = student.student_type === 'nursing_student';
      const name = student.name || 'Student';
      const initial = (name.trim()[0] || 'S').toUpperCase();

      const nameEl = document.getElementById('portal-user-name');
      const avatarEl = document.getElementById('portal-user-avatar');
      const roleEl = document.getElementById('portal-user-role');
      const brandSubEl = document.getElementById('portal-brand-subtitle');
      const practiceLabel = document.getElementById('nav-label-practice');
      const catLink = document.getElementById('nav-item-cat');
      const lecturesLabel = document.getElementById('nav-label-lectures');
      const sidebar = document.getElementById('portal-sidebar');

      if (nameEl) nameEl.textContent = name;
      if (avatarEl) avatarEl.textContent = initial;

      if (sidebar) {
        if (isNursing) {
          sidebar.classList.remove('portal-nclex-theme');
        } else {
          sidebar.classList.add('portal-nclex-theme');
        }
      }

      if (roleEl) {
        if (isPreview) {
          roleEl.textContent = 'Preview Mode';
        } else {
          roleEl.textContent = isNursing ? 'Nursing Student' : 'NCLEX Prep';
        }
      }

      if (brandSubEl) {
        brandSubEl.textContent = isNursing ? 'Nursing Student Hub' : 'NCLEX Success Center';
      }

      if (practiceLabel) {
        practiceLabel.textContent = isNursing ? 'Exam Prep' : 'Create practice';
      }

      if (catLink) catLink.hidden = isNursing;

      if (lecturesLabel) {
        lecturesLabel.textContent = 'Learning Library';
      }
    },

    setSectionView: function(name) {
      const main = document.getElementById('main-content');
      if (main) main.classList.toggle('library-view', name === 'lectures');
    },

    sectionTarget: function(name) {
      const nursing = document.getElementById('portal-nursing');
      const isNursing = nursing && !nursing.classList.contains('hidden');
      const targets = isNursing ? {
        lectures: ['resources-nursing-card', 'class-schedule-card'],
        'previous-tests': ['performance-nursing-card', 'class-schedule-card'],
        performance: ['performance-nursing-card', 'class-schedule-card']
      } : {
        lectures: ['modules-nclex-card'],
        'previous-tests': ['cat-trend-card', 'log-cat-card'],
        performance: ['cat-results-card', 'cat-trend-card', 'log-cat-card']
      };
      return (targets[name] || []).map(id => document.getElementById(id))
        .find(el => el && el.getClientRects().length);
    },

    scrollToSection: function(name) {
      this.setSectionView(name);
      const target = this.sectionTarget(name);
      if (!target) return false;
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      target.scrollIntoView({ behavior, block: 'start' });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      this.setActive(name);
      history.replaceState(null, '', '#' + ({ lectures: 'modules' }[name] || name));
      return true;
    },

    bindInPageScrolling: function() {
      ['dashboard', 'lectures', 'previous-tests', 'performance'].forEach(name => {
        const btn = document.getElementById('nav-item-' + name);
        if (!btn) return;

        btn.addEventListener('click', (e) => {
          if (name === 'dashboard') {
            e.preventDefault();
            this.setSectionView('dashboard');
            const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
            window.scrollTo({ top: 0, behavior });
            this.setActive('dashboard');
            history.replaceState(null, '', window.location.pathname + window.location.search);
            return;
          }
          if (this.scrollToSection(name)) {
            e.preventDefault();
          }
        });
      });
    },

    handleInitialHash: function(hash) {
      if (!hash) {
        this.setSectionView('dashboard');
        this.setActive('dashboard');
        return;
      }
      const clean = hash.replace(/^#/, '');
      const name = { modules: 'lectures', 'previous-tests': 'previous-tests', performance: 'performance' }[clean];
      if (name) {
        this.scrollToSection(name);
        return;
      }
      this.setSectionView('dashboard');
      this.setActive('dashboard');
      const el = document.getElementById(clean);
      if (el && el.getClientRects().length) {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        el.scrollIntoView({ behavior, block: 'start' });
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
    }
  };

  window.StudentNav = StudentNav;
})();
