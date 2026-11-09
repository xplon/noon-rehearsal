/** Observable choices and outcomes. Silence never means refusal. */
export type StoryMemory={
  order:'unanswered'|'body-first'|'shadow-first';
  orderSource:'none'|'player'|'system'|'movement';
  door:'untried'|'in-progress'|'passed-together'|'declined'|'unfinished';
  rehearsal:'unasked'|'accepted'|'declined'|'interrupted'|'unanswered'|'unavailable'|'performed';
  assistance:'none'|'requested'|'system';
  endingSource:'none'|'player'|'completed'|'system-budget'|'host';
  encounter:'unseen'|'overlapped'|'kept-apart'|'body-approached';
  reunion:'unresolved'|'reunited'|'alongside';
  withdrawals:number;
  returns:number;
};
export const freshMemory=():StoryMemory=>({order:'unanswered',orderSource:'none',door:'untried',rehearsal:'unasked',assistance:'none',endingSource:'none',encounter:'unseen',reunion:'unresolved',withdrawals:0,returns:0});
export const readingTime=(text:string)=>Math.max(2.6,Math.min(5.6,1.2+[...text].length/7.5));
