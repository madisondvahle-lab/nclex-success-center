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
      var score=finiteScore(row.score),peer=finitePeer(row.peer_score,row.peer_score_unit),count=finiteCount(row.question_count);
      result.categories[category]={
        score:score,
        peer_score:peer,
        peer_score_unit:row.peer_score_unit||null,
        question_count:count
      };
      if(score==null||peer==null||!row.peer_score_unit||count==null)result.missingCategories.push(category);
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
        peer_score:finitePeer(row.peer_score,row.peer_score_unit),
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
  function finitePeer(value,unit){
    var number=Number(value);
    return value!==''&&value!=null&&Number.isFinite(number)&&number>=0&&
      (unit==='points'||number<=100)?number:null;
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
        peer_score_unit:percentages.length===2?'percent':null,
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
  function peerValue(text,headerText){
    var valueMatch=String(text||'').match(/^\s*(\d+(?:\.\d+)?)\s*(%)?\s*$/);
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
  function cropCanvas(bitmap,x,y,width,height,invertBadge,preserveColors){
    var scale=3,canvas=document.createElement('canvas');
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    var context=canvas.getContext('2d',{willReadFrequently:true});
    context.imageSmoothingEnabled=true;
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
  async function recognizeCell(worker,canvas){
    var result=await worker.recognize(canvas);
    return String(result.data.text||'').trim();
  }
  function archerTableBounds(canvas){
    var width=canvas.width,height=canvas.height;
    var pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
    var headers=[],borders=[];
    function runs(values){
      var result=[];
      values.forEach(function(y){
        var last=result[result.length-1];
        if(last&&y===last.end+1)last.end=y;
        else result.push({start:y,end:y});
      });
      return result;
    }
    for(var y=0;y<height;y++){
      var dark=0,border=0,samples=0;
      for(var x=0;x<width;x+=4){
        var offset=(y*width+x)*4,r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
        samples++;
        if(r<85&&g<100&&b<115&&g>=r&&b>=r)dark++;
        if(r>=210&&r<235&&g>=215&&g<240&&b>=225&&b<250)border++;
      }
      if(dark/samples>.65)headers.push(y);
      if(border/samples>.7)borders.push(y);
    }
    var header=runs(headers).filter(function(run){return run.end-run.start>=14})
      .sort(function(a,b){return (b.end-b.start)-(a.end-a.start)})[0];
    if(!header)return null;
    var lines=runs(borders).filter(function(run){return run.start>header.end});
    var rows=[],start=header.end+1;
    lines.forEach(function(line){
      if(line.start-start>=20)rows.push({top:start,bottom:line.start});
      start=line.end+1;
    });
    return {header:header,rows:rows};
  }
  function badgeCanvas(bitmap,x,y,width,height){
    var canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    var context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,x,y,width,height,0,0,width,height);
    var image=context.getImageData(0,0,width,height),data=image.data;
    // Keep white glyphs inside each colored badge, not the white page around it.
    for(var row=0;row<height;row++){
      var left=width,right=-1;
      for(var column=0;column<width;column++){
        var index=(row*width+column)*4;
        if(Math.max(data[index],data[index+1],data[index+2])-Math.min(data[index],data[index+1],data[index+2])>65){
          left=Math.min(left,column);right=column;
        }
      }
      for(var col=0;col<width;col++){
        var offset=(row*width+col)*4;
        var value=col>left&&col<right&&Math.min(data[offset],data[offset+1],data[offset+2])>210?0:255;
        data[offset]=data[offset+1]=data[offset+2]=value;
      }
    }
    context.putImageData(image,0,0);
    var scaled=document.createElement('canvas');
    scaled.width=width*3;scaled.height=height*3;
    scaled.getContext('2d').drawImage(canvas,0,0,scaled.width,scaled.height);
    return scaled;
  }
  async function readArcherImage(file,expectedSection){
    if(!window.Tesseract||typeof Tesseract.createWorker!=='function')throw new Error('The screenshot OCR engine is unavailable.');
    var bitmap=await createImageBitmap(file),worker;
    try{
      worker=await Tesseract.createWorker('eng');
      await worker.setParameters({tessedit_pageseg_mode:'6'});
      var sourceCanvas=document.createElement('canvas');
      sourceCanvas.width=bitmap.width;sourceCanvas.height=bitmap.height;
      sourceCanvas.getContext('2d').drawImage(bitmap,0,0);
      var recognized=await worker.recognize(sourceCanvas),data=recognized.data||{},text=String(data.text||'');
      var words=data.words||[];
      var width=bitmap.width,height=bitmap.height,table=archerTableBounds(sourceCanvas);
      if(!table||!table.rows.length)throw new Error('Could not locate a complete Archer report table. Enter verified values manually.');
      await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
      var headerData=(await worker.recognize(cropCanvas(bitmap,0,table.header.start,width,table.header.end-table.header.start+1,true))).data;
      var headerGroups=groupWordRows(headerData.words||[]);
      var scoreX=headerCenter(headerGroups,/your\s+score/i,width*3);
      var peerX=headerCenter(headerGroups,/peer\s+score/i,width*3);
      var countX=headerCenter(headerGroups,/(?:ques\.?\s*)?usage/i,width*3);
      if(scoreX==null||peerX==null||countX==null)throw new Error('Could not identify Your Score, Peer Score, and Ques. Usage columns. Enter verified values manually.');
      var centers=[scoreX,peerX,countX].sort(function(a,b){return a-b});
      var gap=Math.min(centers[1]-centers[0],centers[2]-centers[1]);
      if(gap<=0)throw new Error('The report columns overlap. Enter verified values manually.');
      var selectedText='';
      if(table.header.start>=60){
        await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
        selectedText=await recognizeCell(worker,badgeCanvas(bitmap,0,0,Math.round(width*.25),60));
      }
      var selectedTab=selectedText.match(/\b(classic|ngn)\s*\(\s*(\d+)\s*\)/i);
      var section=selectedTab?selectedTab[1].toLowerCase():activeSectionFromWords(bitmap,words)||
        (/your\s+answers/i.test(headerData.text||'')?'classic':expectedSection);
      if(section!==expectedSection){
        return {section:section,view:null,categories:{},subjects:{},reviewRequired:true,warning:'This screenshot is selected as '+section.toUpperCase()+', not '+expectedSection.toUpperCase()+'. No values were imported.'};
      }
      var view=activeViewFromWords(bitmap,words)||activeViewFromPixels(bitmap);
      async function readAt(xRatio,yRatio,widthRatio,heightRatio,parser,pageMode,characterWhitelist,invertBadge,preserveColors){
        var x=Math.max(0,Math.min(width-1,Math.round(width*xRatio)));
        var y=Math.max(0,Math.min(height-1,Math.round(height*yRatio)));
        var cropWidth=Math.max(18,Math.min(width-x,Math.round(width*widthRatio)));
        var cropHeight=Math.max(14,Math.min(height-y,Math.round(height*heightRatio)));
        await worker.setParameters({tessedit_pageseg_mode:pageMode||'8',tessedit_char_whitelist:characterWhitelist||'0123456789%'});
        return parser(await recognizeCell(worker,invertBadge
          ?badgeCanvas(bitmap,x,y,cropWidth,cropHeight)
          :cropCanvas(bitmap,x,y,cropWidth,cropHeight,false,preserveColors)));
      }
      var extracted=[];
      for(var row of table.rows){
        var top=row.top+2,cellHeight=row.bottom-top;
        await worker.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
        var label=await recognizeCell(worker,cropCanvas(bitmap,0,top,Math.round(width*(centers[0]-gap*.45)),cellHeight));
        label=label.split(/\r?\n/).filter(function(line){return !/needs\s+focus/i.test(line)})
          .map(function(line){return line.replace(/^[^A-Za-z]+/,'').trim()}).filter(Boolean).join(' ');
        if(!label)continue;
        async function cell(center,badge){
          var x=Math.max(0,Math.round(width*(center-gap*.35)));
          var cropWidth=Math.min(width-x,Math.round(width*gap*.7));
          await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.%'});
          return recognizeCell(worker,badge
            ?badgeCanvas(bitmap,x,top,cropWidth,cellHeight)
            :cropCanvas(bitmap,x,top,cropWidth,cellHeight));
        }
        var peer=peerValue(await cell(peerX,false),headerData.text);
        extracted.push({
          label:label,category:categoryInLine(label),subject:label,
          score:parsePercentText(await cell(scoreX,true)),
          peer_score:peer.value,peer_score_unit:peer.unit,
          question_count:parseIntegerText(await cell(countX,false))
        });
      }
      if(!view&&extracted.length&&extracted.every(function(row){return row.category}))view='client_need';
      if(!view){
        return {section:section,view:null,categories:{},subjects:{},reviewRequired:true,warning:'Could not reliably identify whether Subject/Lesson or Client Need is selected. No values were imported.'};
      }
      var metadata={};
      metadata.question_count=selectedTab?Number(selectedTab[2]):null;
      var hasSummary=table.header.start>height*.35&&/max\s+score|correct\s+incorrect/i.test(text);
      if(hasSummary&&view==='client_need'&&section==='classic'){
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
      }else if(hasSummary&&view==='client_need'&&section==='ngn'){
        metadata.overall_percent=await readAt(.1597,.09,.034,.032,parsePercentText);
        var earned=await readAt(.16,.337,.047,.035,parseIntegerText,'7');
        var possible=await readAt(.217,.337,.047,.035,parseIntegerText,'7');
        if(earned!=null&&possible!=null&&possible>0&&earned<=possible){
          metadata.overall_points={earned_points:earned,possible_points:possible};
        }
      }else if(hasSummary&&view==='subject_lesson'&&section==='classic'){
        var classicOverall=text.match(/your\s+score\s+(\d{1,3})\s*%/i);
        metadata.overall_percent=classicOverall?finiteScore(classicOverall[1]):null;
      }else if(hasSummary&&view==='subject_lesson'&&section==='ngn'){
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
      try{if(worker)await worker.terminate()}
      finally{bitmap.close()}
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
