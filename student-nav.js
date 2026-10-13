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

      // Set active nav link
      this.setActive(active);

      // Mobile drawer open/close
      const openDrawer = () => {
        if (!sidebar) return;
        sidebar.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        if (closeBtn) closeBtn.focus();
      };

      const closeDrawer = () => {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
        if (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      };

      if (toggle) toggle.addEventListener('click', openDrawer);
      if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
      if (backdrop) backdrop.addEventListener('click', closeDrawer);

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
          closeDrawer();
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
        practiceLabel.textContent = isNursing ? 'Exam Prep' : 'NCLEX Review';
      }

      if (lecturesLabel) {
        lecturesLabel.textContent = isNursing ? 'Study Guides & Modules' : 'Learning Library';
      }
    },

    bindInPageScrolling: function() {
      const scrollTargets = {
        'nav-item-dashboard': null, // Top of page
        'nav-item-lectures': ['modules', 'modules-nursing', 'modules-nclex'],
        'nav-item-previous-tests': ['previous-tests', 'progress-nursing', 'cat-trend-card', 'log-cat-card'],
        'nav-item-performance': ['performance', 'progress-nursing', 'cat-results-card', 'cat-trend-card']
      };

      Object.entries(scrollTargets).forEach(([navId, targetIds]) => {
        const btn = document.getElementById(navId);
        if (!btn) return;

        btn.addEventListener('click', (e) => {
          // If dashboard link on dashboard page, smooth scroll to top
          if (navId === 'nav-item-dashboard') {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this.setActive('dashboard');
            try { history.replaceState(null, '', window.location.pathname); } catch(err) {}
            return;
          }

          if (!targetIds) return;

          // Find first visible matching target
          let targetEl = null;
          for (const id of targetIds) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
              targetEl = el;
              break;
            }
          }

          if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Add temporary focus or highlight
            targetEl.setAttribute('tabindex', '-1');
            targetEl.focus({ preventScroll: true });
            const navKey = navId.replace('nav-item-', '');
            this.setActive(navKey);
            try { history.replaceState(null, '', '#' + targetEl.id); } catch(err) {}
          }
        });
      });
    },

    handleInitialHash: function(hash) {
      if (!hash) return;
      const clean = hash.replace(/^#/, '');
      let el = document.getElementById(clean);
      if (!el) {
        if (clean === 'modules') el = document.getElementById('modules-nursing') || document.getElementById('modules-nclex');
        if (clean === 'previous-tests') el = document.getElementById('progress-nursing') || document.getElementById('cat-trend-card') || document.getElementById('log-cat-card');
        if (clean === 'performance') el = document.getElementById('progress-nursing') || document.getElementById('cat-results-card');
      }
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        if (clean === 'modules') this.setActive('lectures');
        else if (clean === 'previous-tests') this.setActive('previous-tests');
        else if (clean === 'performance') this.setActive('performance');
      }
    }
  };

  window.StudentNav = StudentNav;
})();
