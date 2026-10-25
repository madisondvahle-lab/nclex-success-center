/* Reads CAT / readiness reports (PDF text or screenshots) into overall + per-category scores.
   Everything runs in the browser; results always go to a confirm screen before saving. */
(function(){
  var C=window.NCLEXCats;
  function clean(t){return String(t||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()}
  function parseText(raw){
    var t=clean(raw),out={platform:'',label:'',overall:null,cats:{},counts:{}};
    if(!t)return out;
    var ar=t.match(/Archer Review Test Report/i)&&t.match(/Average Peer Score:\s*(\d+)%\s*Your Score:\s*(\d+)%/i);
    if(ar){
      var ng=t.match(/NGN\s+Average Peer Score:\s*(\d+)\s*Your Score:\s*(\d+)/i),res=t.match(/Your Result\s*:\s*(\w+)/i),id=t.match(/Test Id\s*:\s*(\d+)/i),dt=t.match(/Completed on\s*:\s*(\d{4}-\d{2}-\d{2})/i);
      var classic=Number(ar[2]),nn=ng?Number(ng[2]):null;
      var cq=(t.split(/NGN Questions/i)[0].match(/\s\d+\s+\d{4,5}\s+[A-Z]/g)||[]).length,nq=(t.split(/NGN Questions/i)[1]||'').match(/\s\d+\s+\d{5}\s/g);nq=nq?nq.length:0;
      out.platform='archer';out.date=dt?dt[1]:'';out.result=res?res[1]:'';
      out.overall=null;
      out.sections={classic:{overall_percent:classic,question_count:cq||null},ngn:{overall_percent:nn,question_count:nq||null}};
      out.label='CAT'+(id?' ('+id[1]+')':'')+' · Classic '+classic+'%'+(nn!=null?' / NGN '+nn+'%':'')+(res?' · '+res[1]:'');
      out.note='Archer Classic and NGN percentages are separate. A combined score needs actual earned and possible points; enter both sections separately.';
      return out;
    }
    var tid=t.match(/TestId\s*:\s*(\d+)/i);
    var pts=t.match(/Points Scored\s+(\d+)\s*\/\s*(\d+)/i);
    if(/Level of Preparedness|TestId|Points Scored/i.test(t)){out.platform='uworld'}
    else if(/archer/i.test(t))out.platform='archer';
    else if(/kaplan/i.test(t))out.platform='kaplan';
    if(pts){out.overall=Math.round(pts[1]/pts[2]*100);out.label='CAT'+(tid?' (Test '+tid[1]+')':'')+' · '+pts[1]+'/'+pts[2]}
    var re=/([A-Za-z][A-Za-z ,&\/-]*?)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\((\d+)%\)/g,m;
    while((m=re.exec(t))){var i=C.index(m[1].slice(-60));if(i<0)continue;var n=C.NAMES[i];if(out.cats[n]!=null)continue;out.cats[n]=Number(m[5]);out.counts[n]=Number(m[2])}
    if(!Object.keys(out.cats).length){
      var re2=/([A-Za-z][A-Za-z ,&\/-]{5,70}?)[\s:|-]+(\d{1,3}(?:\.\d+)?)\s*%/g;
      while((m=re2.exec(t))){var j=C.index(m[1].slice(-60));if(j<0)continue;var nm=C.NAMES[j];if(out.cats[nm]==null&&Number(m[2])<=100)out.cats[nm]=Number(m[2])}
    }
    return out;
  }
  var ARCHER_CATEGORY_RULES=[
    /management\s+of\s+care/i,
    /safety\s*(?:&|and)?\s*infection\s*(?:control|prevention)/i,
    /health\s+promotion\s*(?:(?:&|and)\s*maintenance)?/i,
    /psychosocial\s+integrity/i,
    /basic\s+care\s*(?:(?:&|and)\s*comfort)?/i,
    /pharmacological\s*(?:(?:&|and)\s*parenteral\s*therapies)?|parenteral\s+therapies/i,
    /reduction\s+of\s+risk\s+potential/i,
    /physiological\s+adaptation/i
  ];
  function categoryInLine(value){
    for(var i=0;i<ARCHER_CATEGORY_RULES.length;i++){
      if(ARCHER_CATEGORY_RULES[i].test(value))return C.NAMES[i];
    }
    return null;
  }
  function parseArcherRows(section,rows,metadata){
    var result={section:section,categories:{},reviewRequired:true,missingCategories:[],ambiguousCategories:[],missingFields:[]},ambiguous={};
    (rows||[]).forEach(function(row){
      var category=C.canon(row.category,'');
      if(!category||C.index(category)<0||ambiguous[category])return;
      if(result.categories[category]){
        delete result.categories[category];
        result.ambiguousCategories.push(category);
        ambiguous[category]=true;
        return;
      }
      var score=finiteScore(row.score),peer=finiteScore(row.peer_score),count=finiteCount(row.question_count);
      result.categories[category]={
        score:score,
        peer_score:peer,
        peer_score_unit:row.peer_score_unit||null,
        question_count:count
      };
      if(score==null||peer==null||count==null)result.missingCategories.push(category);
    });
    if(metadata){
      result.question_count=finiteCount(metadata.question_count);
      result.overall_points=pointValues(metadata.overall_points);
      result.overall_percent=finiteScore(metadata.overall_percent);
      result.result_counts=metadata.result_counts||null;
    }
    if(result.question_count==null)result.missingFields.push('question_count');
    if(result.overall_percent==null)result.missingFields.push('overall_percent');
    if(section==='ngn'&&!result.overall_points)result.missingFields.push('overall_points');
    if(section==='classic'&&(!result.result_counts||['correct','incorrect','omitted'].some(function(field){return finiteCount(result.result_counts[field])==null}))){
      result.missingFields.push('result_counts');
    }
    C.NAMES.forEach(function(category){
      if(!result.categories[category]&&!result.ambiguousCategories.includes(category)){
        result.missingCategories.push(category);
      }
    });
    return result;
  }
  function parseArcherSubjectRows(section,rows,metadata){
    var subjects={},ambiguousSubjects=[];
    (rows||[]).forEach(function(row){
      var name=clean(row.subject);
      if(!name)return;
      if(subjects[name]){
        delete subjects[name];
        ambiguousSubjects.push(name);
        return;
      }
      if(ambiguousSubjects.indexOf(name)>=0)return;
      subjects[name]={
        score:finiteScore(row.score),
        peer_score:finiteScore(row.peer_score),
        peer_score_unit:row.peer_score_unit||null,
        question_count:finiteCount(row.question_count)
      };
    });
    var result={section:section,view:'subject_lesson',subjects:subjects,ambiguousSubjects:ambiguousSubjects,reviewRequired:true,missingSubjects:[],missingFields:[]};
    Object.keys(subjects).forEach(function(name){
      var subject=subjects[name];
      if(subject.score==null||subject.peer_score==null||subject.peer_score_unit==null||subject.question_count==null)result.missingSubjects.push(name);
    });
    if(metadata){
      result.question_count=finiteCount(metadata.question_count);
      result.overall_percent=finiteScore(metadata.overall_percent);
      result.overall_points=pointValues(metadata.overall_points);
      result.result_counts=metadata.result_counts||null;
    }
    if(result.question_count==null)result.missingFields.push('question_count');
    if(result.overall_percent==null)result.missingFields.push('overall_percent');
    if(section==='ngn'&&!result.overall_points)result.missingFields.push('overall_points');
    return result;
  }
  function finiteScore(value){
    var number=Number(value);
    return value!==''&&value!=null&&Number.isFinite(number)&&number>=0&&number<=100?number:null;
  }
  function finiteCount(value){
    var number=Number(value);
    return value!==''&&value!=null&&Number.isInteger(number)&&number>=0?number:null;
  }
  function pointValues(value){
    if(!value)return null;
    var earned=Number(value.earned_points),possible=Number(value.possible_points);
    return Number.isFinite(earned)&&Number.isFinite(possible)&&earned>=0&&possible>0&&earned<=possible
      ?{earned_points:earned,possible_points:possible}:null;
  }
  function parseArcherStats(raw){
    var lines=String(raw||'').split(/\r?\n/).map(function(line){return line.trim()}).filter(Boolean);
    var rows=[],scoreFirst=true;
    var header=lines.find(function(line){return /your\s+score/i.test(line)&&/peer\s+score/i.test(line)});
    if(header)scoreFirst=header.search(/your\s+score/i)<header.search(/peer\s+score/i);
    lines.forEach(function(line){
      var category=categoryInLine(line);
      if(!category)return;
      var percentages=(line.match(/\b\d{1,3}(?:\.\d+)?\s*%/g)||[])
        .map(function(value){return finiteScore(value.replace('%','').trim())})
        .filter(function(value){return value!=null});
      var tail=line.replace(ARCHER_CATEGORY_RULES[C.index(category)],'');
      var countMatch=tail.match(/(?:\d{1,3}\s*%\s*){1,2}(\d{1,3})(?=\s|$)/);
      rows.push({
        category:category,
        score:percentages.length===2?percentages[scoreFirst?0:1]:null,
        peer_score:percentages.length===2?percentages[scoreFirst?1:0]:null,
        question_count:countMatch?Number(countMatch[1]):null
      });
    });
    return parseArcherRows(null,rows);
  }
  function wordText(word){return String(word&&word.text||'').trim()}
  function wordCenter(word){return (Number(word.bbox.y0)+Number(word.bbox.y1))/2}
  function groupWordRows(words){
    var groups=[];
    (words||[]).filter(function(word){return word&&word.bbox&&wordText(word)}).sort(function(a,b){return wordCenter(a)-wordCenter(b)}).forEach(function(word){
      var center=wordCenter(word),group=groups.find(function(item){return Math.abs(item.center-center)<=20});
      if(!group){group={center:center,words:[]};groups.push(group)}
      group.words.push(word);
      group.center=group.words.reduce(function(sum,item){return sum+wordCenter(item)},0)/group.words.length;
    });
    groups.forEach(function(group){
      group.words.sort(function(a,b){return a.bbox.x0-b.bbox.x0});
      group.text=group.words.map(wordText).join(' ');
    });
    return groups;
  }
  function activeLabeledTab(bitmap,words,labels){
    var canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    canvas.width=bitmap.width;canvas.height=bitmap.height;context.drawImage(bitmap,0,0);
    function labelBox(pattern){
      var matching=(words||[]).filter(function(word){return pattern.test(wordText(word))&&word.bbox});
      if(!matching.length)return null;
      return matching.reduce(function(box,word){
        box.x0=Math.min(box.x0,word.bbox.x0);box.y0=Math.min(box.y0,word.bbox.y0);
        box.x1=Math.max(box.x1,word.bbox.x1);box.y1=Math.max(box.y1,word.bbox.y1);
        return box;
      },{x0:Infinity,y0:Infinity,x1:0,y1:0});
    }
    function selectedPixels(box){
      if(!box)return 0;
      var x0=Math.max(0,Math.floor(box.x0-14)),x1=Math.min(bitmap.width,Math.ceil(box.x1+14));
      var y0=Math.max(0,Math.floor(box.y0-9)),y1=Math.min(bitmap.height,Math.ceil(box.y1+9));
      var data=context.getImageData(x0,y0,x1-x0,y1-y0).data,count=0;
      for(var i=0;i<data.length;i+=4){
        if(data[i]<100&&data[i+1]>115&&data[i+2]>120&&data[i+2]-data[i]>45)count++;
      }
      return count;
    }
    var ordered=labels.map(function(label){return selectedPixels(labelBox(label.pattern))});
    if(!ordered.length)return null;
    var sorted=ordered.slice().sort(function(a,b){return b-a});
    if(sorted[0]<24||sorted[0]-sorted[1]<8)return null;
    return labels[ordered.indexOf(sorted[0])].value;
  }
  function activeViewFromWords(bitmap,words){
    return activeLabeledTab(bitmap,words,[
      {value:'subject_lesson',pattern:/^(?:subject\/lesson|subject|lesson)$/i},
      {value:'client_need',pattern:/^(?:client|need|needs)$/i}
    ]);
  }
  function activeViewFromPixels(bitmap){
    var canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    canvas.width=bitmap.width;canvas.height=bitmap.height;context.drawImage(bitmap,0,0);
    var image=context.getImageData(0,0,bitmap.width,bitmap.height).data;
    function strongestTab(start,end){
      var x0=Math.floor(bitmap.width*start),x1=Math.floor(bitmap.width*end),strongest=0;
      for(var y=0;y<bitmap.height;y++){
        var count=0;
        for(var x=x0;x<x1;x++){
          var offset=(y*bitmap.width+x)*4;
          if(image[offset]<100&&image[offset+1]>115&&image[offset+2]>140&&image[offset+2]-image[offset+1]>25)count++;
        }
        strongest=Math.max(strongest,count);
      }
      return strongest;
    }
    var subject=strongestTab(.005,.08),client=strongestTab(.075,.15);
    if(Math.max(subject,client)<35||Math.abs(subject-client)<15)return null;
    return subject>client?'subject_lesson':'client_need';
  }
  function headerCenter(groups,pattern,width){
    var group=(groups||[]).find(function(item){return pattern.test(item.text)});
    if(!group)return null;
    var matching=group.words.filter(function(word){return pattern.test(wordText(word))});
    if(!matching.length&&pattern.source.indexOf('your')>=0){
      var your=group.words.findIndex(function(word){return /^your$/i.test(wordText(word))});
      if(your>=0){
        var score=group.words.slice(your+1).find(function(word){return /^score$/i.test(wordText(word))});
        if(score)return (group.words[your].bbox.x0+score.bbox.x1)/2/width;
      }
    }
    if(!matching.length&&pattern.source.indexOf('peer')>=0){
      var peer=group.words.findIndex(function(word){return /^peer$/i.test(wordText(word))});
      if(peer>=0){
        var scoreWord=group.words.slice(peer+1).find(function(word){return /^score$/i.test(wordText(word))});
        if(scoreWord)return (group.words[peer].bbox.x0+scoreWord.bbox.x1)/2/width;
      }
    }
    if(!matching.length&&pattern.source.indexOf('usage')>=0){
      matching=group.words.filter(function(word){return /usage/i.test(wordText(word))});
    }
    if(!matching.length)return null;
    return matching.reduce(function(sum,word){return sum+(word.bbox.x0+word.bbox.x1)/2},0)/matching.length/width;
  }
  function subjectNameFromRow(group,scoreCenter,width){
    if(/your\s+score|peer\s+score|ques\.?\s*usage|time\s+spent|subject\s*\/\s*lesson|client\s+need/i.test(group.text))return '';
    var words=group.words.filter(function(word){
      var text=wordText(word),center=(word.bbox.x0+word.bbox.x1)/2/width;
      return center>.03&&center<scoreCenter-.12&&!/^[+•·-]+$/.test(text)&&
        !/^(?:needs|neads|focus|cieed|©|®|j|\||\(|\)|\[|\]|\{|\})+$/i.test(text);
    });
    return clean(words.map(wordText).join(' ')).replace(/^[^A-Za-z0-9]+/,'').replace(/\s*[+•·-]+$/,'');
  }
  function peerValue(text,headerText){
    var valueMatch=String(text||'').match(/^\s*(\d{1,3}(?:\.\d+)?)\s*(%)?\s*$/);
    if(!valueMatch)return {value:null,unit:null};
    var value=Number(valueMatch[1]);
    if(!Number.isFinite(value)||value<0)return {value:null,unit:null};
    if(valueMatch[2])return value<=100?{value:value,unit:'percent'}:{value:null,unit:null};
    if(/peer(?:\s+average)?\s*(?:score\s*)?(?:\(%\)|%|percent(?:age)?)/i.test(headerText||''))return value<=100?{value:value,unit:'percent'}:{value:null,unit:null};
    if(/peer\s*(?:average\s*)?points/i.test(headerText||''))return {value:value,unit:'points'};
    return {value:null,unit:null};
  }
  function activeSectionFromWords(bitmap,words){
    return activeLabeledTab(bitmap,words,[
      {value:'classic',pattern:/^classic(?:\s*\(\d+\))?$/i},
      {value:'ngn',pattern:/^ngn(?:\s*\(\d+\))?$/i}
    ]);
  }
  function activeSectionFromPixels(bitmap){
    var canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    canvas.width=bitmap.width;canvas.height=bitmap.height;context.drawImage(bitmap,0,0);
    var y=Math.max(0,Math.min(bitmap.height-1,Math.round(bitmap.height*0.039)));
    function tealCount(start,end){
      var image=context.getImageData(start,y,end-start,1).data,count=0;
      for(var i=0;i<image.length;i+=4){
        if(image[i+1]>120&&image[i+1]>image[i+2]+8&&image[i]<110&&image[i+1]-image[i]>55)count++;
      }
      return count;
    }
    var classic=tealCount(0,Math.min(120,bitmap.width)),ngn=tealCount(115,Math.min(230,bitmap.width));
    if(Math.max(classic,ngn)<20||Math.abs(classic-ngn)<12)return null;
    return classic>ngn?'classic':'ngn';
  }
  function cropCanvas(bitmap,x,y,width,height,invertBadge,preserveColors){
    var scale=8,canvas=document.createElement('canvas');
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    var context=canvas.getContext('2d',{willReadFrequently:true});
    context.imageSmoothingEnabled=false;
    context.drawImage(bitmap,x,y,width,height,0,0,canvas.width,canvas.height);
    if(preserveColors)return canvas;
    var image=context.getImageData(0,0,canvas.width,canvas.height),min=255,max=0;
    for(var i=0;i<image.data.length;i+=4){
      var gray=Math.round(.299*image.data[i]+.587*image.data[i+1]+.114*image.data[i+2]);
      min=Math.min(min,gray);max=Math.max(max,gray);
      image.data[i]=image.data[i+1]=image.data[i+2]=invertBadge?(gray>170?0:255):gray;
    }
    if(!invertBadge){
      var range=Math.max(1,max-min);
      for(var j=0;j<image.data.length;j+=4){
        var value=Math.max(0,Math.min(255,Math.round((image.data[j]-min)*255/range)));
        image.data[j]=image.data[j+1]=image.data[j+2]=value;
      }
    }
    context.putImageData(image,0,0);
    return canvas;
  }
  function parsePercentText(text){
    var match=String(text||'').match(/^\s*(\d{1,3})\s*%\s*$/);
    return match?finiteScore(match[1]):null;
  }
  function parseIntegerText(text){
    var match=String(text||'').match(/^\s*(\d{1,3})\s*$/);
    return match?finiteCount(match[1]):null;
  }
  function parsePointText(text){
    var match=String(text||'').match(/^\s*(\d{1,3}(?:\.\d+)?)\s*$/);
    var value=match?Number(match[1]):null;
    return value!=null&&Number.isFinite(value)&&value>=0?value:null;
  }
  function valueFromWords(words,xRatio,rowY,width,parser){
    var candidates=(words||[]).filter(function(word){
      var centerX=(word.bbox.x0+word.bbox.x1)/2/width;
      return Math.abs(centerX-xRatio)<=.035&&Math.abs(wordCenter(word)-rowY)<=18;
    }).map(function(word){return parser(wordText(word))}).filter(function(value){return value!=null});
    var unique=Array.from(new Set(candidates));
    return unique.length===1?unique[0]:null;
  }
  async function recognizeCell(worker,canvas){
    var result=await worker.recognize(canvas);
    return String(result.data.text||'').trim();
  }
  async function readArcherImage(file,expectedSection){
    if(!window.Tesseract||typeof Tesseract.createWorker!=='function')throw new Error('The screenshot OCR engine is unavailable.');
    var bitmap=await createImageBitmap(file),worker=await Tesseract.createWorker('eng');
    try{
      await worker.setParameters({tessedit_pageseg_mode:'6'});
      var sourceCanvas=document.createElement('canvas');
      sourceCanvas.width=bitmap.width;sourceCanvas.height=bitmap.height;
      sourceCanvas.getContext('2d').drawImage(bitmap,0,0);
      var recognized=await worker.recognize(sourceCanvas),data=recognized.data||{},text=String(data.text||'');
      var words=data.words||[],groups=groupWordRows(words),rows=[];
      var wordSection=activeSectionFromWords(bitmap,words),pixelSection=activeSectionFromPixels(bitmap);
      var section=wordSection||pixelSection||expectedSection;
      if(section!==expectedSection){
        return {section:section,view:null,categories:{},subjects:{},reviewRequired:true,warning:'This screenshot is selected as '+section.toUpperCase()+', not '+expectedSection.toUpperCase()+'. No values were imported.'};
      }
      var view=activeViewFromWords(bitmap,words)||activeViewFromPixels(bitmap);
      if(!view){
        return {section:section,view:null,categories:{},subjects:{},reviewRequired:true,warning:'Could not reliably identify whether Subject/Lesson or Client Need is selected. No values were imported.'};
      }
      var width=bitmap.width,height=bitmap.height;
      var tableHeader=groups.find(function(group){
        return /your\s+score/i.test(group.text)&&/peer\s+score/i.test(group.text)&&/usage/i.test(group.text)&&!/max\s+score/i.test(group.text);
      });
      var scoreHeader=tableHeader?headerCenter([tableHeader],/your\s+score/i,width):null;
      var peerHeader=tableHeader?headerCenter([tableHeader],/peer\s+score/i,width):null;
      var countHeader=tableHeader?headerCenter([tableHeader],/(?:ques\.?\s*)?usage/i,width):null;
      var columns=section==='classic'
        ?{scoreX:.394,scoreW:.045,peerX:.518,peerW:.045,countX:.644,countW:.031}
        :{scoreX:.4932,scoreW:.0284,peerX:.612,peerW:.039,countX:.757,countW:.018};
      if(view==='subject_lesson'){
        columns={
          scoreX:scoreHeader==null?(section==='classic'?.357:.435):scoreHeader,
          peerX:peerHeader==null?(section==='classic'?.478:.58):peerHeader,
          countX:countHeader==null?(section==='classic'?.608:.739):countHeader,
          scoreW:.042,peerW:.05,countW:.045
        };
      }
      async function readAt(xRatio,yRatio,widthRatio,heightRatio,parser,pageMode,characterWhitelist,invertBadge,preserveColors){
        var x=Math.max(0,Math.min(width-1,Math.round(width*xRatio)));
        var y=Math.max(0,Math.min(height-1,Math.round(height*yRatio)));
        var cropWidth=Math.max(18,Math.min(width-x,Math.round(width*widthRatio)));
        var cropHeight=Math.max(14,Math.min(height-y,Math.round(height*heightRatio)));
        await worker.setParameters({tessedit_pageseg_mode:pageMode||'8',tessedit_char_whitelist:characterWhitelist||'0123456789%'});
        return parser(await recognizeCell(worker,cropCanvas(bitmap,x,y,cropWidth,cropHeight,invertBadge,preserveColors)));
      }
      groups.forEach(function(group){
        var category=view==='client_need'?categoryInLine(group.text):null;
        var subject=view==='subject_lesson'?subjectNameFromRow(group,columns.scoreX,width):'';
        if(view==='client_need'&&!category||view==='subject_lesson'&&!subject)return;
        var yValues=group.words.filter(function(word){
          var x=(word.bbox.x0+word.bbox.x1)/2/width;
          return x>columns.scoreX-.015&&x<columns.countX+columns.countW+.02;
        }).map(wordCenter);
        if(view==='subject_lesson'&&!yValues.length)return;
        var labelY=subject?group.words.filter(function(word){
          var center=(word.bbox.x0+word.bbox.x1)/2/width,text=wordText(word);
          return center>.03&&center<columns.scoreX-.12&&
            !/^(?:needs|neads|focus|cieed|©|®|j|\||\(|\)|\[|\]|\{|\})+$/i.test(text);
        }).map(wordCenter):[];
        var sortedValues=yValues.slice().sort(function(a,b){return a-b});
        var sortedLabels=labelY.slice().sort(function(a,b){return a-b});
        var rowY=sortedValues.length?sortedValues[Math.floor(sortedValues.length/2)]:group.center;
        var labelRowY=sortedLabels.length?sortedLabels[Math.floor(sortedLabels.length/2)]:null;
        rows.push({category:category,subject:subject,rowY:rowY,labelRowY:labelRowY});
      });
      var extracted=[];
      var peerHeaderText=(groups.find(function(group){return /peer\s+score/i.test(group.text)})||{}).text||'';
      for(var row of rows){
        var top=Math.max(0,Math.round(row.rowY-15)),cellHeight=Math.min(36,height-top);
        async function cell(xRatio,widthRatio,pageMode,characterWhitelist,invertBadge){
          var x=Math.max(0,Math.min(width-1,Math.round(width*xRatio)));
          var cropWidth=Math.max(18,Math.min(width-x,Math.round(width*widthRatio)));
          await worker.setParameters({
            tessedit_pageseg_mode:pageMode||'8',
            tessedit_char_whitelist:characterWhitelist||'0123456789%'
          });
          return recognizeCell(worker,cropCanvas(bitmap,x,top,cropWidth,cellHeight,invertBadge));
        }
        var scoreText=await cell(columns.scoreX-columns.scoreW/2,columns.scoreW,'7','0123456789%',true);
        var score=finiteScore(parsePercentText(scoreText));
        if(score==null){
          scoreText=await cell(columns.scoreX-columns.scoreW/2,columns.scoreW,'7');
          score=parsePercentText(scoreText);
        }
        if(score==null&&section==='ngn'&&row.labelRowY!=null){
          var labelTop=Math.max(0,Math.round(row.labelRowY-15));
          await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789%'});
          var labelScore=await recognizeCell(worker,cropCanvas(
            bitmap,
            Math.max(0,Math.round(width*(columns.scoreX-columns.scoreW/2))),
            labelTop,
            Math.min(width-Math.round(width*(columns.scoreX-columns.scoreW/2)),Math.round(width*columns.scoreW)),
            Math.min(36,height-labelTop),
            true
          ));
          score=parsePercentText(labelScore);
        }
        var peerFromWords=valueFromWords(words,columns.peerX,row.rowY,width,parsePercentText);
        var peerText=await cell(
          columns.peerX-columns.peerW/2,columns.peerW,section==='ngn'?'7':'8',
          '0123456789.%'
        );
        var peerScore=parsePercentText(peerText);
        if(peerFromWords!=null){
          if(peerFromWords>=10)peerScore=peerFromWords;
          else if(peerScore===peerFromWords)peerScore=peerFromWords;
          else if(peerScore!=null&&peerScore>=10&&peerScore%10===peerFromWords)peerScore=peerScore;
          else peerScore=null;
        }else if(peerScore!=null&&peerScore<10){
          peerScore=null;
        }
        var peer=peerFromWords!=null&&peerScore===peerFromWords
          ?{value:peerScore,unit:'percent'}:peerValue(peerText,peerHeaderText);
        if(peerFromWords!=null&&peerScore==null||peer.value!=null&&peer.unit==='percent'&&peer.value<10&&peerScore==null){
          peer={value:null,unit:null};
        }else if(peerScore!=null){
          peer.value=peerScore;
          if(peerFromWords!=null)peer.unit='percent';
        }
        var countFromWords=valueFromWords(words,columns.countX,row.rowY,width,parseIntegerText);
        var countText=await cell(columns.countX-columns.countW/2,columns.countW,'7','0123456789');
        var countFromCrop=parseIntegerText(countText);
        var questionCount=countFromWords!=null&&countFromCrop!=null&&countFromWords!==countFromCrop
          ?null:countFromWords??countFromCrop;
        var extractedRow={
          score:score,
          peer_score:peer.value,
          peer_score_unit:peer.unit,
          question_count:questionCount==null?parseIntegerText(countText):questionCount
        };
        if(view==='client_need')extractedRow.category=row.category;
        else extractedRow.subject=row.subject;
        extracted.push(extractedRow);
      }
      var metadata={};
      var tabCount=text.match(new RegExp(section+'\\s*\\((\\d+)\\)','i'));
      metadata.question_count=tabCount?Number(tabCount[1]):pixelSection||wordSection
        ?await readAt(section==='classic'?.005:.064,.008,.07,.06,parseIntegerText,'7','0123456789',false,true)
        :null;
      if(view==='client_need'&&section==='classic'){
        metadata.overall_percent=await readAt(.139,.09,.026,.032,parsePercentText);
        var correct=await readAt(.139,.354,.028,.031,parseIntegerText);
        var incorrect=await readAt(.187,.354,.028,.031,parseIntegerText);
        var omitted=await readAt(.237,.354,.028,.031,parseIntegerText);
        var countMatch=text.match(/Correct\s+Incorrect[.:]?\s+Omitted\s+(\d+)\s+(\d+)\s+(\d+|[Oo°])/i);
        metadata.result_counts=countMatch
          ?{correct:Number(countMatch[1]),incorrect:Number(countMatch[2]),omitted:/^[Oo°]$/.test(countMatch[3])?0:Number(countMatch[3])}
          :{correct:correct,incorrect:incorrect,omitted:omitted};
        if(Object.values(metadata.result_counts).every(function(value){return value==null})){
          metadata.result_counts=null;
        }
      }else if(view==='client_need'&&section==='ngn'){
        metadata.overall_percent=await readAt(.1597,.09,.034,.032,parsePercentText);
        var earned=await readAt(.16,.337,.047,.035,parseIntegerText,'7');
        var possible=await readAt(.217,.337,.047,.035,parseIntegerText,'7');
        if(earned!=null&&possible!=null&&possible>0&&earned<=possible){
          metadata.overall_points={earned_points:earned,possible_points:possible};
        }
      }else if(view==='subject_lesson'&&section==='classic'){
        var classicOverall=text.match(/your\s+score\s+(\d{1,3})\s*%/i);
        metadata.overall_percent=classicOverall?finiteScore(classicOverall[1]):null;
      }else if(view==='subject_lesson'&&section==='ngn'){
        metadata.overall_percent=await readAt(.1597,.09,.034,.04,parsePercentText,'7','0123456789%',true);
        var earnedPoints=await readAt(.166,.35,.026,.032,parseIntegerText,'7','0123456789');
        var possiblePoints=await readAt(.224,.35,.03,.032,parseIntegerText,'7','0123456789');
        if(earnedPoints!=null&&possiblePoints!=null&&possiblePoints>0&&earnedPoints<=possiblePoints){
          metadata.overall_points={earned_points:earnedPoints,possible_points:possiblePoints};
        }
      }
      var result=view==='client_need'
        ?parseArcherRows(section,extracted,metadata)
        :parseArcherSubjectRows(section,extracted,metadata);
      result.view=view;
      result.reviewRequired=true;
      var hasMissing=view==='client_need'
        ?result.missingCategories.length||result.ambiguousCategories.length||result.missingFields.length
        :result.missingSubjects.length||result.ambiguousSubjects.length||result.missingFields.length;
      result.warning=hasMissing
        ?'Some rows or fields were not recognized reliably. Verify every candidate and review all blank fields.'
        :'Review every extracted value against the screenshot before saving.';
      return result;
    }finally{
      await worker.terminate();
      bitmap.close();
    }
  }
  function load(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src;s.onload=res;s.onerror=function(){rej(new Error('Could not load reader'))};document.head.appendChild(s)})}
  async function pdfText(file){
    if(!window.pdfjsLib){await load('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'}
    var doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,out='';
    for(var p=1;p<=doc.numPages;p++){var tc=await (await doc.getPage(p)).getTextContent();out+=tc.items.map(function(i){return i.str}).join(' ')+' '}
    return out;
  }
  async function imageText(file){
    if(!window.Tesseract)await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    var r=await Tesseract.recognize(file,'eng');return r.data.text;
  }
  async function readArcherStats(file,section){
    if(!file||(!/^image\/(png|jpeg)$/i.test(file.type)&&!/\.(png|jpe?g)$/i.test(file.name)))throw new Error('Choose a PNG, JPG, or JPEG screenshot.');
    if(section!=='classic'&&section!=='ngn')throw new Error('Choose whether the screenshot is Classic or NGN before reading it.');
    if(!window.Tesseract)await load('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    return readArcherImage(file,section);
  }
  async function readFile(file){
    var text=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name)?await pdfText(file):await imageText(file);
    return parseText(text);
  }
  var CPR_ANCH=[/management of care/,/infection prevention|safety and/,/health promotion/,/psychosocial|integrity:/,/basic care|comfort:/,/pharmacolog|parenteral therap/,/reduction of risk|risk potential/,/physiolog/];
  var LV={ABOVE:'above_passing',NEAR:'near_passing',BELOW:'below_passing'};
  // NCSBN Candidate Performance Report: returns one rating per test-plan category, or none when it cannot be sure.
  function parseCPR(raw){
    var t=clean(raw),res={date:'',ratings:{},sure:false};
    var d=t.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);if(d)res.date=(d[3].length===2?'20'+d[3]:d[3])+'-'+d[1]+'-'+d[2];
    var cj=t.search(/clinical judgment/i),body=cj>0?t.slice(0,cj):t;
    var lv=(body.match(/\b(ABOVE|NEAR|BELOW)\b(?=\s+THE\b|\s+PASSING)/g)||[]).map(function(x){return LV[x.split(/\s/)[0]]});
    var lower=body.toLowerCase(),pos=CPR_ANCH.map(function(r){var m=lower.search(r);return m});
    if(lv.length===8&&pos.every(function(p){return p>=0})){C.NAMES.forEach(function(n,i){res.ratings[n]=lv[i]});res.sure=true}
    return res;
  }
  async function readCPR(file){
    var text=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name)?await pdfText(file):await imageText(file);
    return parseCPR(text);
  }
  window.AssessmentImport={parseText:parseText,parseArcherStats:parseArcherStats,parseArcherRows:parseArcherRows,parseArcherSubjectRows:parseArcherSubjectRows,readArcherStats:readArcherStats,readFile:readFile,parseCPR:parseCPR,readCPR:readCPR};
})();
