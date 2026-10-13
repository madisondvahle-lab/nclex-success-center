/* Extracts cautious receipt-field suggestions in the browser; nothing is saved here. */
(function(){
  var scriptLoads={};
  var PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var PDF_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var OCR_PDF_PAGE_LIMIT=2;
  var PDF_TEXT_PAGE_LIMIT=5;

  function loadScript(url,ready){
    if(ready())return Promise.resolve();
    if(!scriptLoads[url]){
      scriptLoads[url]=new Promise(function(resolve,reject){
        var script=document.createElement('script');
        script.src=url;
        script.onload=resolve;
        script.onerror=function(){delete scriptLoads[url];reject(new Error('The receipt reader could not be downloaded. Check your connection and try again.'))};
        document.head.appendChild(script);
      });
    }
    return scriptLoads[url].then(function(){
      if(!ready())throw new Error('The receipt reader did not start correctly.');
    });
  }

  function parseDate(value){
    var match=value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/),year,month,day;
    if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3])}
    else{
      match=value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
      if(match){month=Number(match[1]);day=Number(match[2]);year=Number(match[3]);if(year<100)year+=2000}
    }
    if(!match){
      var monthNames={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
      match=value.match(/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:,)?\s+(20\d{2})\b/i);
      if(match){month=monthNames[match[1].toLowerCase()];day=Number(match[2]);year=Number(match[3])}
      else{
        match=value.match(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(20\d{2})\b/i);
        if(match){day=Number(match[1]);month=monthNames[match[2].toLowerCase()];year=Number(match[3])}
      }
    }
    if(!match)return null;
    var date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  }

  function dateSuggestion(text){
    var lines=text.split(/\r?\n/).map(function(line){return line.trim()}).filter(Boolean);
    var candidates=[];
    lines.forEach(function(line,index){
      var parsed=parseDate(line);
      if(!parsed)return;
      var lower=line.toLowerCase();
      if(/\bdue date\b|\bexpiration date\b|\bexpires\b/.test(lower))return;
      var score=/\b(paid|payment|purchase|transaction|receipt)\s*(date)?\b/.test(lower)?4:0;
      if(/\b(invoice|order|billing)\s*date\b/.test(lower))score=Math.max(score,3);
      candidates.push({date:parsed,score:score,index:index});
    });
    candidates.sort(function(a,b){return b.score-a.score||a.index-b.index});
    return candidates.length?candidates[0].date:'';
  }

  function parseMoney(line){
    var match=line.match(/(?:\$|USD\s*)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i);
    if(!match)match=line.match(/\b(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*USD\b/i);
    if(!match)return null;
    var amount=Number(match[1].replace(/,/g,''));
    return Number.isFinite(amount)&&amount>0?amount.toFixed(2):null;
  }

  function amountSuggestion(text){
    var lines=text.split(/\r?\n/).map(function(line){return line.trim()}).filter(Boolean);
    var candidates=[];
    lines.forEach(function(line,index){
      var lower=line.toLowerCase();
      if(/\b(subtotal|tax|discount|tip|balance forward|previous balance)\b/.test(lower))return;
      var amount=parseMoney(line);
      if(amount){
        var score=/\b(amount paid|total paid|payment total|total charged|amount charged|grand total)\b/.test(lower)?6:0;
        if(/\b(total|amount due)\b/.test(lower))score=Math.max(score,3);
        candidates.push({amount:amount,score:score,index:index});
      }else if(/\b(amount paid|total paid|payment total|total charged|amount charged|grand total|total|amount due)\b/.test(lower)&&index+1<lines.length){
        var nextAmount=parseMoney(lines[index+1]);
        if(nextAmount)candidates.push({amount:nextAmount,score:/\b(amount paid|total paid|payment total|total charged|amount charged|grand total)\b/.test(lower)?5:2,index:index});
      }
    });
    candidates.sort(function(a,b){return b.score-a.score||b.index-a.index});
    return candidates.length?candidates[0].amount:'';
  }

  function merchantSuggestion(text){
    var lines=text.split(/\r?\n/).map(function(line){return line.replace(/\s+/g,' ').trim()}).filter(Boolean).slice(0,12);
    var ignore=/^(invoice|receipt|payment receipt|order confirmation|tax invoice|statement|paid|thank you|billing statement)\b/i;
    for(var i=0;i<lines.length;i++){
      var line=lines[i].replace(/^[#*|:\s-]+|[#*|:\s-]+$/g,'');
      if(line.length<2||line.length>70||ignore.test(line))continue;
      if(/https?:\/\/|www\.|@|^\d|^\$|invoice\s*(number|no\.?|#)|account\s*(number|no\.?)/i.test(line))continue;
      if(!/[a-z]/i.test(line))continue;
      return line;
    }
    return '';
  }

  function categorySuggestion(merchant,text){
    var combined=(merchant+' '+text.slice(0,2500)).toLowerCase();
    return /\b(github|copilot|openai|chatgpt|zoom|calendly|adobe|canva|microsoft|google workspace|dropbox|notion|slack|quickbooks|xero|mailchimp|grammarly|loom|webflow|squarespace)\b/.test(combined)
      ?'Software & subscriptions':'';
  }

  function parse(text){
    var merchant=merchantSuggestion(text);
    return {
      merchant:merchant,
      date:dateSuggestion(text),
      amount:amountSuggestion(text),
      category:categorySuggestion(merchant,text)
    };
  }

  async function pdfText(file,onProgress){
    await loadScript(PDFJS_URL,function(){return !!window.pdfjsLib});
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDF_WORKER_URL;
    var documentTask=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
    var pdf=await documentTask.promise;
    var pages=[];
    var pageCount=Math.min(pdf.numPages,PDF_TEXT_PAGE_LIMIT);
    for(var number=1;number<=pageCount;number++){
      if(onProgress)onProgress('Checking receipt text (page '+number+' of '+pageCount+')…');
      var page=await pdf.getPage(number);
      var content=await page.getTextContent();
      pages.push(content.items.map(function(item){return item.str+(item.hasEOL?'\n':' ')}).join(' '));
    }
    return {text:pages.join('\n'),pdf:pdf};
  }

  async function imageText(image,worker,onProgress){
    var result=await worker.recognize(image,{logger:function(info){
      if(onProgress&&info.status==='recognizing text')onProgress('Reading receipt text ('+Math.round(info.progress*100)+'%)…');
    }});
    return result.data.text;
  }

  async function read(file,onProgress){
    var isPdf=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name);
    if(isPdf){
      var extracted=await pdfText(file,onProgress);
      var direct=parse(extracted.text);
      if(direct.date&&direct.amount&&direct.merchant)return direct;
      await loadScript(TESSERACT_URL,function(){return !!window.Tesseract});
      var worker=await window.Tesseract.createWorker('eng');
      var pages=[];
      try{
        var count=Math.min(extracted.pdf.numPages,OCR_PDF_PAGE_LIMIT);
        for(var pageNumber=1;pageNumber<=count;pageNumber++){
          if(onProgress)onProgress('Reading receipt image (page '+pageNumber+' of '+count+')…');
          var page=await extracted.pdf.getPage(pageNumber);
          var viewport=page.getViewport({scale:1.4});
          var canvas=document.createElement('canvas');
          canvas.width=Math.ceil(viewport.width);
          canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport:viewport}).promise;
          pages.push(await imageText(canvas,worker,onProgress));
          canvas.width=0;
          canvas.height=0;
        }
      }finally{
        await worker.terminate();
      }
      var scanned=parse(pages.join('\n'));
      return {
        merchant:direct.merchant||scanned.merchant,
        date:direct.date||scanned.date,
        amount:direct.amount||scanned.amount,
        category:direct.category||scanned.category
      };
    }
    await loadScript(TESSERACT_URL,function(){return !!window.Tesseract});
    var imageWorker=await window.Tesseract.createWorker('eng');
    try{
      return parse(await imageText(file,imageWorker,onProgress));
    }finally{
      await imageWorker.terminate();
    }
  }

  window.FinanceReceiptOCR={read:read,parse:parse};
})();
