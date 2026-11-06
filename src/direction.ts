/** Observable choices and outcomes. Silence never means refusal. */
export type StoryMemory={
  order:'unanswered'|'body-first'|'shadow-first';
  orderSource:'none'|'player'|'system';
  door:'untried'|'in-progress'|'passed-together'|'declined'|'unfinished';
  rehearsal:'unasked'|'accepted'|'declined'|'interrupted'|'unanswered'|'unavailable';
  assistance:'none'|'requested'|'system';
  endingSource:'none'|'player'|'completed'|'system-budget'|'host';
};
export const freshMemory=():StoryMemory=>({order:'unanswered',orderSource:'none',door:'untried',rehearsal:'unasked',assistance:'none',endingSource:'none'});
export const readingTime=(text:string)=>Math.max(2.6,Math.min(5.6,1.2+[...text].length/7.5));
