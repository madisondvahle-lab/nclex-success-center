/* Reads CAT / readiness reports (PDF text or screenshots) into overall + per-category scores.
   Everything runs in the browser; results always go to a confirm screen before saving. */
(function(){
  var C=window.NCLEXCats;
  function clean(t){return String(t||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()}
  function parseText(raw){
    var t=clean(raw),out={platform:'',label:'',overall:null,cats:{},counts:{}};
    if(!t)return out;
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
  async function readFile(file){
    var text=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name)?await pdfText(file):await imageText(file);
    return parseText(text);
  }
  window.AssessmentImport={parseText:parseText,readFile:readFile};
})();
