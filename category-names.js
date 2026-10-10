/* Shared NCLEX Client Needs category names. Canonical names follow the official NCLEX-RN test plan / CPR. */
(function(){
  var NAMES=['Management of Care','Safety and Infection Control','Health Promotion and Maintenance','Psychosocial Integrity','Basic Care and Comfort','Pharmacological and Parenteral Therapies','Reduction of Risk Potential','Physiological Adaptation'];
  var RULES=[[/management of care|^mgmt/i,0],[/safety|infection/i,1],[/health promotion/i,2],[/psychosocial/i,3],[/basic care|comfort/i,4],[/pharmacolog|parenteral/i,5],[/reduction of risk|risk potential/i,6],[/physiological adaptation|physiologic adaptation/i,7]];
  function index(name){var s=String(name==null?'':name);for(var i=0;i<RULES.length;i++)if(RULES[i][0].test(s))return i;return -1}
  function canon(name,fallback){var i=index(name);return i>=0?NAMES[i]:(fallback===undefined?name:fallback)}
  window.NCLEXCats={NAMES:NAMES,index:index,canon:canon};
})();
