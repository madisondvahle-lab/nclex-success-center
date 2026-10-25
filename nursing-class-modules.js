(function () {
  'use strict';

  function classes(student, schedules = []) {
    const legacyClasses = String(student.email || '').toLowerCase() === 'bianca.edwards86@gmail.com'
      ? ['NUR 215', 'NUR 235']
      : ['NUR 312', 'NUR 321', 'NUR 416'];
    return [...new Set([...legacyClasses, ...schedules.map(item => item.class_code)])]
      .filter(Boolean).map(code => ({ code, name: code }));
  }

  function moduleResources(resources, catalog, classCode) {
    const urls = new Set(catalog.map(module => module.guide_url).filter(Boolean));
    return resources.filter(resource => resource.resource_type === 'study_guide' &&
      resource.class_code && urls.has(resource.url) &&
      (classCode === undefined || resource.class_code === classCode));
  }

  function assignedKeys(resources, catalog, classCode) {
    const urls = new Set(moduleResources(resources, catalog, classCode).map(resource => resource.url));
    return catalog.filter(module => urls.has(module.guide_url)).map(module => module.module_key);
  }

  async function assign(db, student, classCode, modules) {
    if (student.student_type !== 'nursing_student' || !classCode) {
      throw new Error('Choose a nursing-school student and class before assigning modules.');
    }
    for (const module of modules) {
      if (!module.guide_url) throw new Error('This module does not have a student guide link: ' + module.name);
      const { data, error } = await db.from('student_resources').select('id')
        .eq('student_id', student.id).eq('class_code', classCode)
        .eq('resource_type', 'study_guide').eq('url', module.guide_url).limit(1);
      if (error) throw new Error('Could not check class module assignments: ' + error.message);
      if (!data?.length) {
        const { error: saveError } = await db.from('student_resources').insert({
          student_id: student.id,
          class_code: classCode,
          resource_type: 'study_guide',
          title: module.name,
          url: module.guide_url,
          note: 'Success Center module assigned for ' + classCode + '.'
        });
        if (saveError) throw new Error('Could not assign ' + module.name + ' to ' + classCode +
          ': ' + saveError.message + '. Some assignments may already be saved; retrying will keep them.');
      }
    }
  }

  window.NursingClassModules = { classes, moduleResources, assignedKeys, assign };
})();
