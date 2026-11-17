import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { defineVideo } from '../lib/index.mjs';

// A local documentary treatment for the shared day-story contract. Supply a
// validated brief and private asset resolver; neither is embedded in this recipe.
const briefFile = process.env.DAY_STORY_FILE;
if (!briefFile) throw new Error('Set DAY_STORY_FILE to a validated day-story JSON file.');
const brief = JSON.parse(fs.readFileSync(briefFile, 'utf8'));
const assets = process.env.DAY_STORY_ASSETS ? JSON.parse(fs.readFileSync(process.env.DAY_STORY_ASSETS, 'utf8')) : {};
const speechCli = process.env.DAY_STORY_SPEECH_CLI;
if (!speechCli) throw new Error('Set DAY_STORY_SPEECH_CLI to a local speech-generation CLI entrypoint.');
const colors = { codex: '#8aebcc', claude: '#e7ac7a', agy: '#a9baff', opencode: '#e7d781' };
const labels = { codex: 'Codex', claude: 'Claude', agy: 'Antigravity', opencode: 'OpenCode' };
const providerCounts = Object.fromEntries(Object.keys(labels).map(provider => [provider, brief.sources.sessions.filter(s => s.provider === provider).length]));
const timeStart = Date.parse(brief.day.startAt), timeEnd = Date.parse(brief.day.endAt);
const lanes = Object.keys(labels).map(provider => ({ provider, label: labels[provider], color: colors[provider], count: providerCounts[provider],
  points: brief.sources.segments.filter(segment => brief.sources.sessions.find(s => s.id === segment.sessionId)?.provider === provider)
    .flatMap(segment => [segment.startAt, segment.endAt]).filter(Boolean).map(at => Math.max(0, Math.min(100, (Date.parse(at) - timeStart) / (timeEnd - timeStart) * 100))) }));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0d141a;color:#eff3ef;font-family:'Segoe UI',Arial,sans-serif;overflow:hidden}
.shell{position:relative;width:1280px;height:720px;padding:32px 52px 90px;background:radial-gradient(ellipse at 78% 10%,#24443d55,transparent 55%),#0d141a}
.grain{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(#ffffff0b .6px,transparent .6px);background-size:6px 6px}
header{position:relative;display:flex;justify-content:space-between;align-items:center;font:600 12px 'Segoe UI';letter-spacing:.19em;color:#a2b2b5}
.brand{display:flex;align-items:center;gap:12px}.mark{width:13px;height:13px;background:#8aebcc;transform:rotate(45deg)}
.chapter{display:flex;align-items:center;gap:18px}.line{width:160px;height:2px;background:#314046}.fill{height:100%;background:#8aebcc;transition:width .7s}
main{position:relative;padding-top:44px;height:540px}.kicker{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8aebcc;font-weight:650}
h1{font-size:60px;line-height:1.04;letter-spacing:-2.8px;margin:16px 0 20px;font-weight:750;max-width:1020px}
.muted{color:#a8b9bf;font-size:19px;line-height:1.5;max-width:760px}.large{font-size:86px;max-width:930px}.accent{color:#8aebcc}
.tag{display:inline-block;padding:8px 12px;border:1px solid #62797c55;border-radius:5px;color:#b7c7c8;font-size:12px;letter-spacing:.07em}
.stats{display:flex;gap:55px;margin-top:34px}.stat strong{display:block;font-size:58px;letter-spacing:-3px;font-weight:650}.stat span{display:block;color:#95a9af;font-size:12px;letter-spacing:.11em;text-transform:uppercase;margin-top:5px}
.hero-rule{position:absolute;width:330px;height:330px;border:1px solid #8aebcc20;border-radius:50%;right:25px;top:120px;pointer-events:none;animation:spin 30s linear infinite}.hero-rule:after{content:'';position:absolute;top:42px;right:31px;width:12px;height:12px;background:#8aebcc;border-radius:50%;box-shadow:0 0 35px #8aebcc88}.hero-rule:before{content:'';position:absolute;inset:28px;border:1px dashed #8aebcc20;border-radius:50%}@keyframes spin{to{transform:rotate(360deg)}}
.lanes{margin-top:34px}.lane{display:grid;grid-template-columns:155px 1fr 70px;gap:24px;align-items:center;margin:24px 0}.name{font-size:17px;font-weight:600}.track{height:22px;position:relative;border-bottom:1px solid #415157;background:repeating-linear-gradient(90deg,transparent,transparent calc(25% - 1px),#ffffff0b calc(25% - 1px),#ffffff0b 25%)}.dot{position:absolute;width:6px;height:6px;border-radius:50%;bottom:-3px;box-shadow:0 0 10px #ffffff18}.count{color:#a6b7bc;font-size:20px}.axis{margin-left:179px;margin-right:94px;display:flex;justify-content:space-between;color:#6e858d;font-size:12px}.fine{font-size:12px;line-height:1.5;color:#82999f;margin-top:22px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:44px}.split h1{font-size:54px}.cards{display:grid;gap:14px;padding-top:10px}.card{padding:22px 25px;border:1px solid #53666d66;background:#17242c88;border-radius:12px}.card small{font-size:11px;letter-spacing:.16em;color:#8aebcc}.card strong{display:block;font-size:25px;margin:9px 0}.card p{color:#a8b9bf;font-size:16px;line-height:1.45;margin:0}
.media-layout{display:grid;grid-template-columns:305px 1fr;gap:32px;align-items:center;height:425px}.media-layout h1{font-size:48px;letter-spacing:-2px}.media-layout .muted{font-size:17px}.screen{border:1px solid #59707566;border-radius:12px;overflow:hidden;background:black;box-shadow:0 24px 60px #0008;position:relative}.screen video{width:100%;display:block;aspect-ratio:16/9;object-fit:contain}.recorded{font-size:10px;letter-spacing:.16em;color:#9aadb2;padding:10px 14px;background:#142029;display:flex;justify-content:space-between}
.quote{font-size:56px;line-height:1.2;letter-spacing:-1.7px;max-width:1050px;margin:32px 0;color:#f2dfc9}.quote:before{content:'“';color:#e7ac7a}.quote:after{content:'”';color:#e7ac7a}.strike{color:#81969d;text-decoration:line-through}.resolve{margin-top:22px;font-size:25px;color:#8aebcc}.bottom{position:absolute;bottom:72px;left:52px;right:52px;display:flex;justify-content:space-between;border-top:1px solid #53666d55;padding-top:12px;font-size:10px;letter-spacing:.12em;color:#7f969d}.enter{animation:enter .6s ease-out}@keyframes enter{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
</style></head><body><div class="shell"><div class="grain"></div><header><div class="brand"><div class="mark"></div>BRUNO / DEVELOPMENT DIARY</div><div class="chapter"><span id="date"></span><div class="line"><div class="fill" id="fill"></div></div><span id="number"></span></div></header><main id="content"></main><div class="bottom"><span id="foot-left">SAMPLED CONVERSATIONS · EDITORIAL PILOT</span><span>LOCAL NARRATION / REAL RECORDED EXCERPTS</span></div></div><script>
window.showChapter = async ({chapter,index,total,count,lanes,mediaData}) => {
 document.querySelector('#date').textContent='SUNDAY / 15 NOVEMBER 2026';document.querySelector('#number').textContent=String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');document.querySelector('#fill').style.width=((index+1)/total*100)+'%';
 const main=document.querySelector('#content'); main.className='enter';main.replaceChildren();
 const el=(tag,cls,text,parent=main)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;parent.appendChild(n);return n;};
 const kicker=(text,parent)=>el('div','kicker',text,parent);const title=(text,parent,cls='')=>el('h1',cls,text,parent);const p=(text,parent)=>el('div','muted',text,parent);
 if(chapter.id==='intro'){kicker('The day in fragments. The story in focus.');title(chapter.title,main,'large');p('Flight systems. Cross-model experiments. A clearer way to see the whole day.');const stats=el('div','stats');for(const [n,label]of [[count,'dated sessions sampled'],[4,'providers'],['15 NOV','one development day']]){const s=el('div','stat','',stats);el('strong','',String(n),s);el('span','',label,s);}el('div','hero-rule');}
 else if(chapter.id==='timeline'){kicker('The pattern across the machine');title(chapter.title);const container=el('div','lanes');for(const lane of lanes){const row=el('div','lane','',container);const name=el('div','name',lane.label,row);name.style.color=lane.color;const track=el('div','track','',row);for(const point of lane.points){const dot=el('i','dot','',track);dot.style.left=point+'%';dot.style.background=lane.color;}el('div','count',String(lane.count),row);}const axis=el('div','axis');for(const time of['00:00','06:00','12:00','18:00','24:00'])el('span','',time,axis);el('div','fine','Observed conversation endpoints, including consultations and smoke tests. Dots are not hours worked.');}
 else if(chapter.id==='flight'){const split=el('div','split');const left=el('div','','',split);kicker('Bruno’s Space Program',left);title(chapter.title,left);p('Steering, recovery and re-entry were connected parts of the same problem.',left);el('div','tag','DISCUSSION SUMMARY / NOT A FLIGHT REPLAY',left);const cards=el('div','cards','',split);for(const [small,heading,body]of[['CONTROL','Authority before automation','Grid fins, engine gimbal and reusable landing controllers.'],['DIAGNOSIS','Zero throttle ≠ engine off','A lit jet’s idle thrust became the useful debugging distinction.'],['VISUALS','Re-entry, now visible','Plasma and heating work continued; visual and performance checks remained.']]){const card=el('div','card','',cards);el('small','',small,card);el('strong','',heading,card);el('p','',body,card);}}
 else if(mediaData){const layout=el('div','media-layout');const left=el('div','','',layout);kicker(chapter.id==='agents'?'Cross-provider collaboration':'A reusable visual ingredient',left);title(chapter.title,left);p(chapter.id==='agents'?'Different models. One conversation. A recorded experiment with a little personality.':'A blocked route. A detour. Ten tonnes delivered. The work becomes something you can watch.',left);el('div','tag','RECORDED EXCERPT · 15 NOV',left);const screen=el('div','screen','',layout);const video=el('video','','',screen);video.muted=true;video.playsInline=true;video.src=mediaData.url;const note=el('div','recorded','',screen);el('span','',chapter.id==='agents'?'MODEL DISCUSSION / ARCHIVED FOOTAGE':'VOLCANO FREIGHT / ARCHIVED FOOTAGE',note);el('span','','ORIGINAL AUDIO MUTED',note);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Media did not load')),15000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Media load failed'));};});video.currentTime=mediaData.start;await video.play();video.ontimeupdate=()=>{if(video.currentTime>=mediaData.end)video.currentTime=mediaData.start;};}
 else if(chapter.id==='detour'){kicker('Progress also meant correcting the process');title(chapter.title);el('div','quote','im not asking a "project picker"');el('div','fine','User request · 23:29 · quoted excerpt from the day’s conversation');el('div','resolve','The target: the feel of the whole day, including what got stuck.');}
 else{kicker('What the day added up to');title(chapter.title);const cards=el('div','cards');cards.style.gridTemplateColumns='repeat(3,1fr)';for(const [label,body]of[['Flight systems','More questions tested against the actual game.'],['Connected agents','Shared ways to ask, compare and review.'],['A coherent story','The next step is a repeatable daily recap.']]){const c=el('div','card','',cards);el('strong','',label,c);el('p','',body,c);}el('div','fine','First editorial pilot · partial source coverage · usage not assessed · no inferred working-hour total');}
};</script></body></html>`;

const audioProvider = {
  id: 'local-ae-kokoro', version: '1', options: { engine: 'kokoro', voice: 'af_heart', cli: speechCli },
  async synthesize({ text, outputPath, signal }) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [speechCli, 'speech', 'generate', text, '--engine', 'kokoro', '--voice', 'af_heart', '--out', outputPath, '--json'], { signal, windowsHide: true });
      let stderr = ''; child.stderr.on('data', b => { stderr += b; }); child.stdout.resume();
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`Local narration failed: ${stderr.slice(-1000)}`)));
    });
    return outputPath;
  },
};

export default defineVideo({
  viewport: { width: 1280, height: 720 }, captureFps: 10, pointer: { x: 1260, y: 700 }, audioProvider,
  segments: brief.story.chapters.map(chapter => ({ id: chapter.id, caption: chapter.title, narration: chapter.narration })),
  async ready(page) { await page.setContent(html); await page.waitForFunction(() => typeof window.showChapter === 'function'); },
  async run({ page, video }) {
    for (const [index, chapter] of brief.story.chapters.entries()) {
      await video.segment(chapter.id, async () => {
        const selection = chapter.media[0]; let mediaData;
        if (selection) {
          const source = brief.sources.media.find(item => item.id === selection.mediaId);
          const file = assets[source?.assetRef]; if (!file) throw new Error('Selected media asset could not be resolved.');
          const bytes = fs.readFileSync(path.resolve(file));
          mediaData = { url: `data:video/mp4;base64,${bytes.toString('base64')}`, start: selection.startSeconds ?? 0, end: selection.endSeconds ?? source.durationSeconds };
        }
        await page.evaluate(payload => window.showChapter(payload), { chapter, index, total: brief.story.chapters.length, count: brief.sources.sessions.length, lanes, mediaData });
        await video.hold(900);
      });
    }
  },
});
