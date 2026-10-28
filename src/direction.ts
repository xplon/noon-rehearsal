/** Playable dramatic beats. Time bounds protect a scene, not a hidden countdown UI. */
export type BeatKind='meet'|'cross'|'around'|'rest'|'bow'|'encore'|'door';
export type Beat={id:BeatKind;min:number;max:number;line:string};
export const FOLLOW_BEATS:Record<'student'|'teacher',Beat[]>={
  student:[
    {id:'meet',min:15,max:18,line:'很好。现在请把这个人带到门口。'},
    {id:'cross',min:17,max:20,line:'门认错了领队。先带他去左边的候场圈。'},
    {id:'around',min:17,max:20,line:'从他背后绕过去。他得先找到你。'},
    {id:'door',min:15,max:18,line:'再去一次门口。这回，等等后面的那位。'},
  ],
  teacher:[
    {id:'meet',min:14,max:18,line:'很好。现在请把这个人带到门口。'},
    {id:'cross',min:18,max:22,line:'门认错了领队。先带他去左边的候场圈。'},
    {id:'rest',min:12,max:14,line:'这一段先不安排去处。看看搭档想做什么。'},
    {id:'around',min:18,max:22,line:'从他背后绕过去。他得先找到你。'},
    {id:'bow',min:20,max:24,line:'中间留了一个谢幕圈。演员有自己的位置。'},
    {id:'encore',min:18,max:20,line:'还有一段返场。请影子随意带路。'},
  ],
};
