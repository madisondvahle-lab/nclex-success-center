-- Adds the NUR 235 Test 2 practice exam to Bianca's private dashboard.
insert into student_resources (student_id, title, resource_type, url, note, due_on)
select s.id, 'NUR 235 Test 2 Practice Exam (100 Questions)', 'practice_set', 'bianca-nur235-test2.html',
       'Health and Physical Assessment · Test 2 · October 26, 2026. Scenario-based practice across Eyes, Head and Face, Neck/Lymph/Thyroid, ENMT, and Respiratory Assessment.',
       date '2026-10-26'
from students s
where lower(s.email) = 'bianca.edwards86@gmail.com'
  and not exists (select 1 from student_resources r where r.student_id = s.id and r.url = 'bianca-nur235-test2.html');
