/** Deterministic theatre time: pausing and scrubbing reproduce the same wind/door pose. */
export function courtyardMotion(t:number){
  const elapsed=t-9,cycle=Math.floor(Math.max(0,elapsed)/26),phase=elapsed<0?-1:elapsed%26;
  const pulse=phase>=0&&phase<3.4?Math.sin(Math.PI*phase/3.4)**2:0;
  return {doorAngle:-.065*pulse,doorCycle:elapsed<0?-1:cycle,doorActive:pulse>.0001,wind:Math.sin(t*.72)*.022+Math.sin(t*1.13+.8)*.009+pulse*.012};
}
