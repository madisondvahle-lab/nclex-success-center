(function(){
  function sameAnswer(selected,correct){
    if(Array.isArray(selected)&&Array.isArray(correct)){
      return selected.length===correct.length&&selected.every(value=>correct.includes(value));
    }
    return selected!==undefined&&selected!==null&&correct!==undefined&&correct!==null&&String(selected)===String(correct);
  }

  function normalize(details){
    if(!Array.isArray(details))return [];
    return details.map(item=>{
      const selected=item.selected??item.selected_answer;
      const correct=item.correct_answer??item.correctAnswer;
      const isCorrect=typeof item.is_correct==='boolean'
        ?item.is_correct
        :typeof item.correct==='boolean'
          ?item.correct
          :sameAnswer(selected,correct);
      return {
        ...item,
        id:item.id??item.question_id,
        selected,
        correct,
        is_correct:isCorrect
      };
    });
  }

  window.PracticeReviewData={normalize:normalize};
})();
