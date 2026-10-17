(function(){
  function matchesDifficulty(question, difficulty){
    if(!difficulty||difficulty==='all')return true;
    const value=String(question.difficulty||'medium').trim().toLowerCase();
    if(difficulty==='medium-hard')return value==='medium'||value==='hard';
    return value===difficulty;
  }

  function filter(questions, filters){
    const studyAreas=new Set((filters.studyAreas||[]).map(value=>String(value||'').trim()));
    const categories=new Set((filters.categories||[]).map(value=>String(value||'').trim()));
    const topics=new Set((filters.topics||[]).map(value=>String(value||'').trim()));
    return (questions||[]).filter(question=>{
      const studyArea=String(question.studyArea||'').trim();
      const category=String(question.nclexCategory||'').trim();
      const topic=String(question.topic||'').trim();
      return (!studyAreas.size||studyAreas.has(studyArea))&&
        (!categories.size||categories.has(category))&&
        (!topics.size||topics.has(topic))&&
        matchesDifficulty(question,filters.difficulty);
    });
  }

  window.PracticeQuestionSelection={filter:filter,matchesDifficulty:matchesDifficulty};
})();
