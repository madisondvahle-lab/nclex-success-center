-- Adds the NUR 215 practice link to Bianca's dashboard.
insert into student_resources (student_id, title, resource_type, url, note)
select s.id, 'NUR 215 Practice Questions (100)', 'practice_set', 'bianca-nur215.html',
       'Foundations of Professional Practice: communication, ethics, legal, leadership, delegation. Tutor or exam mode.'
from students s
where lower(s.email) = 'bianca.edwards86@gmail.com'
  and not exists (select 1 from student_resources r where r.student_id = s.id and r.url = 'bianca-nur215.html');
