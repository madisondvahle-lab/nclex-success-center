(function(){
  function fromBankRow(question){
    const itemType=question.item_type||'mcq';
    let options,answer;
    if(itemType==='mcq'){
      options=[question.option_a,question.option_b,question.option_c,question.option_d];
      answer=['a','b','c','d'].indexOf(String(question.correct_answer||'').toLowerCase());
      if(!Number.isInteger(answer)||answer<0||options.some(option=>!String(option||'').trim()))return null;
    }else if(itemType==='sata'){
      options=question.item_data?.options;
      answer=question.item_data?.correct;
      if(!Array.isArray(options)||options.length<4||options.some(option=>!String(option||'').trim())||
        !Array.isArray(answer)||!answer.length||
        answer.some(index=>!Number.isInteger(index)||index<0||index>=options.length)||
        new Set(answer).size!==answer.length)return null;
    }else return null;
    return {itemType,options,answer};
  }

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

  window.PracticeQuestionSelection={filter:filter,matchesDifficulty:matchesDifficulty,fromBankRow:fromBankRow};
})();
