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
    const interaction=question.item_data?.tabs?.length ? {
      ...question.item_data,type:itemType,stem:question.stem,rationale:question.rationale,
      options,correct:Array.isArray(answer)?answer:[answer]
    } : undefined;
    return {itemType,options,answer,optionRationales:question.option_rationales || {},...(interaction?{interaction}:{})};
  }

  function matchesDifficulty(question, difficulty){
    if(!difficulty||difficulty==='all')return true;
    const value=String(question.difficulty||'medium').trim().toLowerCase();
    if(difficulty==='medium-hard')return value==='medium'||value==='hard';
    return value===difficulty;
  }

  function questionCount(question){
    const count=Number(question?.questionCount);
    return Number.isInteger(count)&&count>0?count:1;
  }

  function filter(questions, filters){
    const studyAreas=new Set((filters.studyAreas||[]).map(value=>String(value||'').trim()));
    const categories=new Set((filters.categories||[]).map(value=>String(value||'').trim()));
    const topics=new Set((filters.topics||[]).map(value=>String(value||'').trim()));
    const itemTypes=new Set((filters.itemTypes||[]).map(value=>String(value||'').trim()));
    return (questions||[]).filter(question=>{
      const studyArea=String(question.studyArea||'').trim();
      const category=String(question.nclexCategory||'').trim();
      const topic=String(question.topic||'').trim();
      const itemType=String(question.itemType||'mcq').trim();
      return (!studyAreas.size||studyAreas.has(studyArea))&&
        (!categories.size||categories.has(category))&&
        (!topics.size||topics.has(topic))&&
        (!itemTypes.size||itemTypes.has(itemType))&&
        matchesDifficulty(question,filters.difficulty);
    });
  }

  function questionModeForId(id, latestAttempts){
    const latest=latestAttempts&&latestAttempts.get(String(id));
    if(!latest)return 'unused';
    if(latest.marked_for_review)return 'marked';
    const selected=latest.selected_answer;
    if(selected==null||(Array.isArray(selected)&&!selected.length))return 'omitted';
    if(typeof latest.correct==='boolean')return latest.correct?'correct':'incorrect';
    const expected=latest.correct_answer;
    if(expected==null)return 'incorrect';
    const normalize=value=>Array.isArray(value)?value.map(Number).sort((a,b)=>a-b):value;
    return JSON.stringify(normalize(selected))===JSON.stringify(normalize(expected))?'correct':'incorrect';
  }

  function questionMode(question, latestAttempts){
    if(question.itemType!=='case'||!Array.isArray(question.childIds)||!question.childIds.length){
      return questionModeForId(question.id,latestAttempts);
    }
    const modes=question.childIds.map(id=>questionModeForId(id,latestAttempts));
    if(modes.every(mode=>mode==='unused'))return 'unused';
    if(modes.includes('marked'))return 'marked';
    if(modes.includes('omitted'))return 'omitted';
    if(modes.includes('incorrect'))return 'incorrect';
    return 'correct';
  }

  function filterByModes(questions, modes, latestAttempts){
    const selected=new Set((modes||[]).map(value=>String(value||'').trim()));
    if(!selected.size)return [];
    return (questions||[]).filter(question=>selected.has(questionMode(question,latestAttempts)));
  }

  function countByMode(questions, latestAttempts){
    const counts={unused:0,incorrect:0,marked:0,omitted:0,correct:0};
    (questions||[]).forEach(question=>{counts[questionMode(question,latestAttempts)]+=questionCount(question)});
    return counts;
  }

  function splitByUsage(questions, latestAttempts){
    const unused=[],practiced=[];
    (questions||[]).forEach(question=>{
      (questionMode(question,latestAttempts)==='unused'?unused:practiced).push(question);
    });
    return {unused:unused,practiced:practiced};
  }

  function selectByUsage(questions, count, latestAttempts, categoryWeights){
    const {unused,practiced}=splitByUsage(questions,latestAttempts);
    const chosen=[],chosenIds=new Set();
    let remaining=count;
    const addFrom=(pool,amount)=>{
      const shuffled=pool.slice();
      for(let i=shuffled.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
      }
      shuffled.sort((a,b)=>questionCount(b)-questionCount(a));
      for(const question of shuffled){
        if(remaining<=0||amount<=0)return;
        if(chosenIds.has(String(question.id)))continue;
        const weight=questionCount(question);
        if(weight>remaining)continue;
        chosen.push(question);
        chosenIds.add(String(question.id));
        remaining-=weight;
        amount-=weight;
      }
    };
    if(categoryWeights){
      Object.entries(categoryWeights).forEach(([category,weight])=>{
        addFrom(unused.filter(question=>question.category===category),Math.max(1,Math.round(count*weight)));
      });
    }
    addFrom(unused,remaining);
    addFrom(practiced,remaining);
    return chosen;
  }

  function summarizeLatestAttempts(results){
    const latest=new Map();
    (results||[]).forEach(result=>{
      (Array.isArray(result.answer_details)?result.answer_details:[]).forEach(detail=>{
        if(detail.question_id&&!latest.has(String(detail.question_id)))latest.set(String(detail.question_id),detail);
      });
      (Array.isArray(result.missed_question_ids)?result.missed_question_ids:[]).forEach(id=>{
        if(id&&!latest.has(String(id)))latest.set(String(id),{selected_answer:'legacy-missed',correct:false});
      });
    });
    return latest;
  }

  window.PracticeQuestionSelection={
    filter:filter,
    filterByModes:filterByModes,
    countByMode:countByMode,
    matchesDifficulty:matchesDifficulty,
    questionMode:questionMode,
    questionCount:questionCount,
    summarizeLatestAttempts:summarizeLatestAttempts,
    splitByUsage:splitByUsage,
    selectByUsage:selectByUsage,
    fromBankRow:fromBankRow
  };
})();
