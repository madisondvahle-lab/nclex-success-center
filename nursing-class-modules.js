(function () {
  'use strict';

  function classes(student, enrollments = []) {
    return [...new Set(enrollments.map(item => item.class_code))]
      .filter(Boolean).map(code => ({ code, name: code }));
  }

  function moduleResources(resources, catalog, classCode) {
    const urls = new Set(catalog.map(module => module.guide_url).filter(Boolean));
    return resources.filter(resource => resource.resource_type === 'study_guide' &&
      resource.class_code && urls.has(resource.url) &&
      (classCode === undefined || resource.class_code === classCode));
  }

  function assignedKeys(assignments, classCode) {
    return assignments.filter(item => classCode === undefined || item.class_code === classCode)
      .map(item => item.module_key);
  }

  async function save(db, student, classCode, moduleKeys) {
    if (student.student_type !== 'nursing_student' || !classCode) {
      throw new Error('Choose a nursing-school student and class before assigning modules.');
    }
    const { error } = await db.rpc('save_nursing_class_modules', {
      p_student: student.id, p_class: classCode, p_modules: moduleKeys
    });
    if (error) throw new Error('Could not save class modules: ' + error.message +
      '. Reload to verify the saved selections before retrying. Check that the course-module migration is installed.');
  }

  window.NursingClassModules = { classes, moduleResources, assignedKeys, save };
})();
