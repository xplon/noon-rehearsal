/** Limits recover an unanswered invitation; they are never minimum scene lengths. */
export type BeatKind='meet'|'parting'|'partner'|'duet'|'rest'|'correction'|'bow'|'encore';
export type Beat={id:BeatKind;idle:number;max:number;line:string};
const meet:Beat={id:'meet',idle:14,max:38,line:'好，带上你的搭档。我们从那扇门离场。'};
const parting:Beat={id:'parting',idle:10,max:30,line:'先过门，或叫上搭档。你们自己商量。'};
const partner:Beat={id:'partner',idle:10,max:36,line:'他先来找你。接下来，换他走在前面。'};
const duet:Beat={id:'duet',idle:12,max:36,line:'这次他来留门。你决定，要不要过去。'};
const rest:Beat={id:'rest',idle:10,max:20,line:'刚才追得有点急。他想坐一会儿。'};
const correction:Beat={id:'correction',idle:8,max:14,line:'我把顺序排乱了。回到刚才，我们重来。'};
const bow:Beat={id:'bow',idle:9,max:25,line:'到这里，算演完了吗？靠近搭档，或说：还没演完。'};
const encore:Beat={id:'encore',idle:9,max:30,line:'你来鞠一躬，他来接。走一段再停下，或点一起谢幕。'};
export const FOLLOW_BEATS:Record<'student'|'teacher',Beat[]>={
  student:[meet,parting,partner,duet,bow,encore],
  teacher:[meet,parting,partner,duet,rest,correction,bow,encore],
};
/** These are observed events, not inferred attitudes or personality scores. */
export type StoryMemory={
  departure:'undecided'|'together'|'ahead'|'unanswered';
  reunion:'none'|'returned'|'called'|'body-found'|'stayed-close'|'waited';
  door:'untested'|'counted-two'|'held-open'|'passed-together'|'declined';
  rest:'none'|'together'|'called'|'left'|'self-ended';
  askedForMore:boolean;
};
export const freshMemory=():StoryMemory=>({departure:'undecided',reunion:'none',door:'untested',rest:'none',askedForMore:false});
export const readingTime=(text:string)=>Math.max(2.6,Math.min(5.6,1.2+[...text].length/7.5));
