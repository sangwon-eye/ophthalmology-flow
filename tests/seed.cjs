const fs=require("fs");fs.mkdirSync("data/keys",{recursive:true});const w=(k,v)=>fs.writeFileSync("data/keys/"+k+".json",JSON.stringify({version:1,value:JSON.stringify(v)}));
const d=new Date().toLocaleDateString("sv-SE");
w("doctors",["김선웅","나상훈","이종혁"]);
w("doctor-prefs",{"김선웅":{roomNo:"3"},"나상훈":{roomNo:"5",cr:true},"이종혁":{roomNo:"7"}});
const T=(id,name,short,roomId,order,extra={})=>({id,name,short,roomId,order,options:[],popupOnClick:false,machine:"",...extra});
w("settings",{rooms:[{id:"B",name:"31번방",patientName:"정밀검사실",showPriority:true},{id:"C",name:"6번방",patientName:"안구건조증 검사실",showPriority:false}],
 tests:[{id:"ark",name:"ARK",short:"ARK",roomId:"vision",order:0,builtin:"ark",options:[],popupOnClick:false,machine:""},
  T("vf","시야검사 (VF)","VF","B",0),T("oct","OCT","OCT","B",1,{options:["Macular","Disc","Angio"],popupOnClick:true,machine:"OCT"}),T("wfp","안저촬영 (WFP)","WFP","B",2),
  {id:"gat",name:"안압 (GAT)",short:"GAT",roomId:"B",order:3,builtin:"gat",options:[],popupOnClick:false},T("fag","FAG","FAG","B",4),
  T("idra","IDRA","IDRA","C",0),T("fp","FP","FP","B",5),T("asoct","AS-OCT","AS-OCT","B",6),T("spec","Specular","Specular","B",7),T("bscan","B-scan","B-scan","B",8),T("res","연구","연구","B",9)],
 procedures:[{id:"p1",name:"교수 처치",performer:"prof"},{id:"p2",name:"전공의 처치",performer:"resident"}],dilationWaitMin:15,lateGraceMin:0});
const names=["원성옥","신종희","박영수","최민지","정대현","강서윤","조현우","윤지아","장민호","임수빈","한지훈","오세영","서준호","권나은","황도윤","송하린"];
const docs=["김선웅","나상훈","이종혁"];
const list=names.map((n,i)=>{const r=`${String(9+Math.floor(i/4)).padStart(2,"0")}:${String((i%4)*15).padStart(2,"0")}`;
 const base={id:String(6100000+i*37),name:n,date:d,doctor:docs[i%3],reservation:r,checkin:"",assigned:{visionIop:true},done:{},doneAt:{},drops:[],procedures:[],queueKey:540+i*15,firstVisit:i===5};
 if(i<3) return base;
 if(i<6) return {...base,checkin:"08:5"+i};
 if(i<11) return {...base,checkin:"08:4"+(i-6),done:{visionIop:true},measure:{ucva:{od:"0.5",os:"0.6"},nct:{od:"15",os:"16"}},assigned:{visionIop:true,oct:true,wfp:i%2===0,vf:i===7,gat:i===8,idra:i===9},detail:{oct:{options:["Macular","Disc"],note:"",eye:"OU",eyes:{}}},dilateOverride:i===8?true:undefined,orders:i===6?{all:{at:Date.now(),tests:["oct","wfp"]}}:undefined,staffMemo:i===9?"타과 진료 다녀오심":""};
 if(i<14) return {...base,checkin:"08:3"+(i-11),done:{visionIop:true,oct:true},assigned:{visionIop:true,oct:true},measure:{ucva:{od:"0.8",os:"0.7"},nct:{od:"14",os:"15"}},calledRoom:i===11?base.doctor:null};
 return {...base,checkin:"08:20",done:{visionIop:true,oct:true},assigned:{visionIop:true,oct:true},seen:true,seenAt:Date.now(),procedures:[{uid:"x"+i,procId:"p2",name:"전공의 처치",performer:"resident",note:"",done:false,doneAt:null,orderedAt:1}]};
});
w("daily-patients",list);
