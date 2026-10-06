import fs from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';

/** Source pixels, not system font outlines. Timestamp is fixed for repeatable imports. */
export async function buildFont(jar, unifont, output) {
  const glyphs = new Map();
  const decode = new TextDecoder();
  const providers = JSON.parse(decode.decode(jar['assets/minecraft/font/include/default.json'])).providers;
  for (const p of providers.filter(p => p.type === 'bitmap')) {
    const file = 'assets/minecraft/textures/' + p.file.replace('minecraft:', '');
    const png = PNG.sync.read(Buffer.from(jar[file]));
    const rows = p.chars.map(s => Array.from(s));
    const w = png.width / rows[0].length, h = png.height / rows.length;
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const cp = rows[y][x].codePointAt(0);
      if (!cp || glyphs.has(cp)) continue;
      const pixels = Array.from({ length: h }, (_, yy) => Array.from({ length: w }, (_, xx) => png.data[((y*h+yy)*png.width+x*w+xx)*4+3] > 0));
      const right = Math.max(0, ...pixels.flatMap(row => row.flatMap((v, i) => v ? [i+1] : [])));
      glyphs.set(cp, { pixels, unit: 128 * (p.height ?? 8) / h, ascent: (p.ascent ?? 7) * 128, advance: (right * (p.height ?? 8) / h + 1) * 128 });
    }
  }
  const wanted = new Set();
  for (let i=32;i<127;i++) wanted.add(i);
  const gb = new TextDecoder('gb18030');
  for(let a=0xb0;a<=0xf7;a++) for(let b=0xa1;b<=0xfe;b++) {
    const s=gb.decode(Uint8Array.of(a,b)); if(s.length===1 && s!=='�') wanted.add(s.codePointAt(0));
  }
  for(let i=0x3000;i<=0x303f;i++) wanted.add(i);
  for(let i=0xff00;i<=0xffef;i++) wanted.add(i);
  for(const c of '·—“”‘’…→「」▾！？○●■') wanted.add(c.codePointAt(0));
  const zip = unzipSync(unifont);
  for(const name of Object.keys(zip).filter(n=>n.endsWith('.hex')).sort()) {
    for(const line of decode.decode(zip[name]).split(/\r?\n/)) {
      const [code, bits] = line.split(':'); const cp=parseInt(code,16);
      if(!wanted.has(cp) || glyphs.has(cp) || !bits) continue;
      const width=bits.length===64?16:8;
      const pixels=Array.from({length:16},(_,y)=>{const row=parseInt(bits.slice(y*width/4,(y+1)*width/4),16);return Array.from({length:width},(_,x)=>!!(row & (1 << (width-1-x))));});
      glyphs.set(cp,{pixels,unit:64,ascent:896,advance:(width+1)*64});
    }
  }
  const out=[new opentype.Glyph({name:'.notdef',advanceWidth:1024,path:new opentype.Path()})];
  for(const [cp,g] of [...glyphs].sort(([a],[b])=>a-b)) {
    const p=new opentype.Path();
    g.pixels.forEach((row,y)=>{ for(let x=0;x<row.length;x++) if(row[x]) {const start=x;while(x+1<row.length && row[x+1])x++;const l=start*g.unit,r=(x+1)*g.unit,t=g.ascent-y*g.unit,b=t-g.unit;p.moveTo(l,b);p.lineTo(l,t);p.lineTo(r,t);p.lineTo(r,b);p.close();} });
    out.push(new opentype.Glyph({name:'uni'+cp.toString(16),unicode:cp,advanceWidth:g.advance,path:p}));
  }
  const font=new opentype.Font({familyName:'MCFont',styleName:'Regular',unitsPerEm:1024,ascender:896,descender:-128,glyphs:out});
  font.createdTimestamp=1;
  await fs.mkdir(output,{recursive:true});
  // opentype also puts the current time in head.modified and its checksums.
  // Freeze only the synchronous serializer, restore Date before any I/O.
  const NativeDate=globalThis.Date;
  let bytes;
  try {globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[0]));}static now(){return 0;}};bytes=Buffer.from(font.toArrayBuffer());}
  finally {globalThis.Date=NativeDate;}
  await fs.writeFile(path.join(output,'mc.ttf'),bytes);
  return out.length;
}
