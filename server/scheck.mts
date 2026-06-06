import { buildSolvableGame, mulberry32, solveGame, chooseBotPlay, playCard } from "@dsc/shared";
function bots(n){return Array.from({length:n},(_,i)=>({id:`b${i}`,name:`B${i}`,isBot:true}));}
function heur(s){for(let i=0;i<80&&s.phase==='playing';i++)s=playCard(s,s.turn,chooseBotPlay(s,s.turn));return s.phase==='won';}
for (const n of [2,3]) {
  let line=`n=${n} `;
  for (const lv of [0,2,4,6,8]) {
    let solv=0, heu=0; const N=10; const t0=Date.now();
    for (let s=0;s<N;s++){
      const seed=300+s*13+lv*101+n*7;
      const g=buildSolvableGame(bots(n),lv,mulberry32(seed));
      if (heur(structuredClone(g))) heu++;
      if (solveGame(structuredClone(g),{nodes:120000})) solv++;
    }
    line+=`L${lv}:solver ${solv}/${N} heur ${heu}/${N} (${Date.now()-t0}ms)  `;
  }
  console.log(line);
}
