(function () {
  'use strict';

  const originalRenderUploads = window.renderUploads;
  if (typeof originalRenderUploads !== 'function') return;

  window.renderUploads = function (items, insights, categories) {
    originalRenderUploads(items, insights, categories);
    const cards = document.querySelectorAll('#uploads article.upload');
    cards.forEach((card, index) => {
      const item = items[index];
      const files = item?.assessment_report_files || [];
      if (!files.length) return;
      const section = document.createElement('div');
      section.className = 'muted';
      section.style.marginTop = '8px';
      section.innerHTML = files.map((file, fileIndex) => {
        const sectionLabel = file.section === 'classic' ? 'Classic'
          : file.section === 'ngn' ? 'NGN' : 'Source report';
        const viewLabel = file.report_view === 'subject_lesson' ? 'Subject/Lesson'
          : file.report_view === 'client_need' ? 'Client Need' : '';
        const label = viewLabel ? `${sectionLabel} · ${viewLabel} screenshot`
          : `${sectionLabel} screenshot`;
        return `<button class="link" type="button" data-archer-report="${fileIndex}">${label}: ${String(file.original_filename || 'report').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])} →</button>`;
      }).join('');
      card.appendChild(section);
      section.querySelectorAll('[data-archer-report]').forEach(button => {
        button.addEventListener('click', () => {
          const file = files[Number(button.dataset.archerReport)];
          if (file?.storage_path && typeof window.openReport === 'function') window.openReport(file.storage_path);
        });
      });
    });
  };
}());
