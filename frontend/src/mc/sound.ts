import type {Manifest} from './assets';
/**
 * 舞台音效：拉杆、钟、翻书、脚步都用游戏音效文件；只有椅子滑动的摩擦声用 WebAudio 合成（游戏里没有椅子）。
 * 静音时一个声音都不出，暂停时全部停住。
 */
const SYNTH=new Set(['prop.chair.slide']);
/** 交互器件换回了游戏方块，导演发出的语义事件映射到游戏音效。 */
const REMAP:Record<string,string>={'prop.mic.button':'block.lever.click','prop.podium.button':'block.lever.click','prop.desk.bell':'block.bell.use'};
export class Sounds {
  private active=new Set<HTMLAudioElement>();private muted=true;private paused=false;private ctx:AudioContext|null=null;private voices=new Set<AudioScheduledSourceNode>();
  private music:HTMLAudioElement|null=null;private song=0;private retryAt=0;private playlist:string[];private ambient=false;private ducked=false;private animalAt=6000;private animal=0;
  /** 轻快的曲目（第 12.10 节）；records/cat 最欢快，出结果后优先放。 */
  constructor(private manifest:Manifest){this.playlist=Object.entries(manifest.sounds).filter(([key])=>key.startsWith('music.game:')).sort(([a],[b])=>a.localeCompare(b)).flatMap(([,files])=>files);}
  configure(muted:boolean,paused:boolean,session='running'){
    if(muted&&!this.muted)this.stop();this.muted=muted;
    if(paused!==this.paused){this.paused=paused;for(const audio of this.active)if(paused)audio.pause();else if(!muted)void audio.play().catch(()=>{});if(this.ctx)void (paused?this.ctx.suspend():this.ctx.resume()).catch(()=>{});}
    // 等开场和出结果后正常放；辩论进行中压低约 10 dB 但不停（鹦鹉跟着音乐跳舞，音乐在放就有生命感）。
    this.ambient=!muted&&!paused&&(session==='waiting'||session==='finished');
    this.ducked=!muted&&!paused&&session==='running';
    if(!this.ambient&&!this.ducked){this.music?.pause();return;}
    if(!this.playlist.length)return;
    // 出结果要立刻换上欢快的曲子配合庆祝（缺陷 8）：换曲决定必须排在播放重试节流（retryAt）前面，
    // 否则自动播放被浏览器拦住的那一秒里换曲永远轮不到，结果出来了还在放原曲。
    const wantHappy=session==='finished';
    if(!this.music||this.music.dataset.happy!==String(wantHappy)){
      this.music?.pause();this.music=null;
      const audio=new Audio('/mc/'+this.pick(wantHappy));
      audio.dataset.happy=String(wantHappy);audio.onended=()=>{this.song++;this.music=null;};
      this.music=audio;this.retryAt=0;
    }
    this.music.volume=this.ambient?.035:.011;
    if(this.music.paused&&performance.now()>=this.retryAt){this.retryAt=performance.now()+1000;void this.music.play().catch(()=>{/* 用户首次操作之前浏览器可能不允许播放，稍后再试。 */});}
  }
  private pick(happy:boolean){
    if(happy){const songs=this.playlist.filter(p=>/records\/cat|records\/chirp/.test(p));if(songs.length)return songs[this.song%songs.length];}
    return this.playlist[this.song%this.playlist.length];
  }
  get musicActive(){return !this.muted&&!this.paused&&!!this.music&&!this.music.paused&&!this.music.ended;}
  /** 动物只在无人发言的空闲时轻声叫，间隔至少 22 秒；暂停和静音沿用同一开关。 */
  animals(now:number,idle:boolean){
    if(!idle){this.animalAt=now+6000;return;}
    if(this.muted||this.paused||now<this.animalAt)return;
    this.animalAt=now+22000+Math.random()*12000;this.play(this.animal++%2?'entity.parrot.ambient':'entity.cat.purr');
  }
  play(event:string){
    if(this.muted||this.paused)return;
    event=REMAP[event]??event;
    if(SYNTH.has(event)){this.synth(event);return;}
    const list=this.manifest.sounds[event];if(!list?.length)return;const audio=new Audio('/mc/'+list[Math.floor(Math.random()*list.length)]);audio.volume=event.startsWith('entity.')?.025:event==='ui.toast.challenge_complete'?.25:.35;this.active.add(audio);audio.onended=()=>this.active.delete(audio);audio.onerror=()=>this.active.delete(audio);void audio.play().catch(()=>this.active.delete(audio));
  }
  private synth(event:string){
    try{this.ctx??=new AudioContext();}catch{return;}
    const ctx=this.ctx,now=ctx.currentTime,out=ctx.createGain();out.connect(ctx.destination);
    let count=0;const track=(n:AudioScheduledSourceNode)=>{count++;this.voices.add(n);n.onended=()=>{this.voices.delete(n);n.disconnect();if(--count===0)out.disconnect();};};
    if(event==='prop.chair.slide'){
      const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*.28),ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/data.length)*.012;
      const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter();noise.buffer=buffer;filter.type='lowpass';filter.frequency.value=1100;noise.connect(filter).connect(out);noise.start(now);track(noise);
    }
  }
  stop(){this.music?.pause();for(const a of this.active){a.pause();a.removeAttribute('src');a.load();}this.active.clear();for(const v of this.voices){try{v.stop();}catch{/* 已经停了 */}}this.voices.clear();}
  dispose(){this.stop();void this.ctx?.close().catch(()=>{});this.ctx=null;}
  get playing(){return [...this.active].filter(a=>!a.paused&&!a.ended).length+this.voices.size+(this.music&&!this.music.paused&&!this.music.ended?1:0);}
}
