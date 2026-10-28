/** Each beat ends on a player choice / visible response. Limits are inactivity exits. */
export type BeatKind='meet'|'parting'|'search'|'rest'|'bow'|'encore';
export type Beat={id:BeatKind;max:number;line:string};
const meet:Beat={id:'meet',max:24,line:'现在，请把这个人带到门口。门似乎在等你们。'};
const parting:Beat={id:'parting',max:15,line:'门只让一位先走。你要自己过去，还是叫上搭档？'};
const search:Beat={id:'search',max:18,line:'他又在看门了。从他身后经过，或者叫他一声。'};
const bow:Beat={id:'bow',max:18,line:'旁白决定谢幕。去圈里陪他，或者说：还没演完。'};
export const FOLLOW_BEATS:Record<'student'|'teacher',Beat[]>={
  student:[meet,parting,search,bow,{id:'encore',max:18,line:'好，舞台还给影子。尽兴以后，收住脚步或说：就演到这里。'}],
  teacher:[meet,parting,search,
    {id:'rest',max:14,line:'身体先坐下了。陪他歇一下，或者叫他起来。'},bow,
    {id:'encore',max:20,line:'这一段由你即兴。收住脚步，或说：就演到这里。'},
  ],
};
