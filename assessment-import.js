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
      out.overall=nn!=null&&cq&&nq?Math.round((classic*cq+nn*nq)/(cq+nq)):classic;
      out.label='CAT'+(id?' ('+id[1]+')':'')+' · Classic '+classic+'%'+(nn!=null?' / NGN '+nn+'%':'')+(res?' · '+res[1]:'');
      out.note='Archer reports do not include category percentages. Add them below if you have them.';
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
  window.AssessmentImport={parseText:parseText,readFile:readFile,parseCPR:parseCPR,readCPR:readCPR};
})();
