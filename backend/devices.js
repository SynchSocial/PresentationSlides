// devices.js — catalog + scoring metadata + 2-source resolver
// Each device gets TWO buy sources (a brand/primary store + Amazon) so prices
// can be averaged. You can hard-pin exact product URLs via `device.sources`.

export const SYSTEMS = ["NES","SNES","Genesis","GB/GBC","GBA","PS1","NDS","N64","Dreamcast","PSP","Saturn","GameCube","PS2","Wii","3DS","Switch"];

// status: 2 = full speed, 1 = playable w/ compromise, 0 = chokes
const P = {
  ssd202:  [2,2,2,2,2,2,1,0,0,0,0,0,0,0,0,0],
  a33:     [2,2,2,2,2,2,0,0,0,0,0,0,0,0,0,0],
  h700:    [2,2,2,2,2,2,1,1,1,1,1,0,0,0,0,0],
  a133p:   [2,2,2,2,2,2,1,1,1,1,1,0,0,0,0,0],
  rk3566:  [2,2,2,2,2,2,2,1,1,1,1,0,0,0,0,0],
  rk3326s: [2,2,2,2,2,2,1,1,1,1,0,0,0,0,0,0],
  t618:    [2,2,2,2,2,2,2,2,2,2,2,1,1,0,1,0],
  t820:    [2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,0],
  g99:     [2,2,2,2,2,2,2,2,2,2,1,1,1,0,1,0],
  d1100:   [2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,1],
  sd865:   [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  d8300:   [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  sd8g2:   [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  g2gen2:  [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  g3x:     [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  sd8elite:[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
};
const emu = (profile, overrides = {}) => {
  const o = {};
  SYSTEMS.forEach((s, i) => (o[s] = P[profile][i]));
  Object.assign(o, overrides);
  return o;
};

// brand -> primary store search builder (source A)
const STORE = {
  Anbernic:  n => ({ store: "Anbernic",  url: `https://anbernic.com/search?q=${encodeURIComponent(n)}` }),
  Retroid:   n => ({ store: "GoRetroid", url: `https://www.goretroid.com/search?q=${encodeURIComponent(n)}` }),
  Miyoo:     n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
  MagicX:    n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
  Powkiddy:  n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
  TrimUI:    n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
  GKD:       n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
  AYANEO:    n => ({ store: "AYANEO",    url: `https://www.ayaneo.com/search?q=${encodeURIComponent(n)}` }),
  AYN:       n => ({ store: "AYN",       url: `https://www.ayn.hk/search?q=${encodeURIComponent(n)}` }),
  Mangmi:    n => ({ store: "AliExpress", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(n)}` }),
};
const amazon = n => ({ store: "Amazon", url: `https://www.amazon.com/s?k=${encodeURIComponent(n)}` });

// Build the 2 sources for a device (explicit override wins)
export function sourcesFor(d) {
  if (d.sources && d.sources.length) return d.sources.slice(0, 2);
  const primary = (STORE[d.brand] || amazon)(d.name);
  return [primary, amazon(d.name)];
}

// ── Screen spec parsing ──────────────────────────────────────────────────────
// Derive { size, resolution, aspect, w, h } from a device's `screen` string
// (e.g. '3.2" 1024×768 120Hz'). Falls back to res tokens (1080p/720p/750p) and
// finally an explicit `device.res` override ("960×544") when the string has no
// pixels. Aspect snaps to the nearest common ratio so odd panels read cleanly
// (1334×750 -> 16:9), else shows the exact reduced ratio.
const COMMON_RATIOS = [[16,9],[16,10],[21,9],[5,3],[3,2],[5,4],[4,3],[1,1]];
const RES_TOKENS = { "1080p": [1920,1080], "720p": [1280,720], "750p": [1334,750] };

function aspectLabel(w, h) {
  const W = Math.max(w, h), H = Math.min(w, h);
  const r = W / H;
  for (const [a, b] of COMMON_RATIOS) {
    if (Math.abs(r - a / b) / (a / b) < 0.02) return `${a}:${b}`;
  }
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const d = gcd(W, H);
  return `${W / d}:${H / d}`;
}

export function screenSpec(d) {
  const str = d.screen || "";
  const size = (str.match(/[\d.]+"/) || [null])[0];

  let w, h;
  const wh = str.match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/i);
  if (wh) { w = +wh[1]; h = +wh[2]; }
  else {
    const tok = Object.keys(RES_TOKENS).find(t => str.includes(t));
    if (tok) { [w, h] = RES_TOKENS[tok]; }
    else if (d.res) {
      const m = d.res.match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/i);
      if (m) { w = +m[1]; h = +m[2]; }
    }
  }

  return {
    size: size || null,
    resolution: w && h ? `${w}×${h}` : null,
    aspect: w && h ? aspectLabel(w, h) : null,
    w: w || null,
    h: h || null,
  };
}

export const DEVICES = [
  { id:"miniplus", name:"Miyoo Mini Plus", brand:"Miyoo", chip:"SigmaStar SSD202D", ram:"128MB", screen:'3.5" 640×480', form:"Vertical", os:"Linux", tier:"Budget", msrp:55, street:52, hr:null, emu:emu("ssd202") },
  { id:"miniflip", name:"Miyoo Mini Flip", brand:"Miyoo", chip:"SigmaStar SSD202D", ram:"128MB", screen:'2.8" 750×560', form:"Clamshell", os:"Linux", tier:"Budget", msrp:70, street:70, hr:null, emu:emu("ssd202") },
  { id:"a30", name:"Miyoo A30", brand:"Miyoo", chip:"Allwinner A33", ram:"512MB", screen:'2.8" 640×480', form:"Horizontal", os:"Linux", tier:"Budget", msrp:55, street:48, hr:null, emu:emu("a33") },
  { id:"minizero28", name:"MagicX Mini Zero 28", brand:"MagicX", chip:"Allwinner A133P", ram:"2GB", screen:'2.8" 640×480', form:"Candybar", os:"Android/Linux", tier:"Budget", msrp:65, street:60, hr:null, emu:emu("a133p") },
  { id:"trimuibrick", name:"TrimUI Brick", brand:"TrimUI", chip:"Allwinner A133P", ram:"1GB", screen:'3.2" 1024×768', form:"Vertical", os:"Linux", tier:"Budget", msrp:80, street:80, hr:null, emu:emu("a133p") },
  { id:"trimuismartpro", name:"TrimUI Smart Pro", brand:"TrimUI", chip:"Allwinner A133P", ram:"1GB", screen:'4.96" 1280×720', form:"Horizontal", os:"Linux", tier:"Budget", msrp:96, street:70, hr:null, emu:emu("a133p",{N64:1}) },
  { id:"rgb30", name:"Powkiddy RGB30", brand:"Powkiddy", chip:"Rockchip RK3566", ram:"1GB", screen:'4" 720×720', form:"Square", os:"Linux", tier:"Budget", msrp:90, street:80, hr:null, emu:emu("rk3566") },
  { id:"gkdpixel2", name:"GKD Pixel 2", brand:"GKD", chip:"Rockchip RK3326S", ram:"1GB", screen:'2.4" 640×480', form:"Vertical micro", os:"Linux", tier:"Budget", msrp:90, street:80, hr:null, emu:emu("rk3326s") },
  { id:"rg35xxsp", name:"Anbernic RG35XX SP", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'3.5" 640×480', form:"Clamshell", os:"Linux", tier:"Budget", msrp:65, street:60, hr:null, tracked:true, emu:emu("h700") },
  { id:"rg35xxh", name:"Anbernic RG35XX H", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'3.5" 640×480', form:"Horizontal (dual stick)", os:"Linux", tier:"Budget", msrp:68, street:60, hr:null, tracked:true, emu:emu("h700",{N64:1}) },
  { id:"rg40xxh", name:"Anbernic RG40XX H", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'4.0" 640×480', form:"Horizontal (dual stick)", os:"Linux", tier:"Budget", msrp:67, street:66, hr:null, tracked:true, emu:emu("h700") },
  { id:"rgcubexx", name:"Anbernic RG CubeXX", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'3.95" 720×720', form:"Square", os:"Linux", tier:"Budget", msrp:67, street:63, hr:null, tracked:true, emu:emu("h700") },
  { id:"rg34xx", name:"Anbernic RG34XX", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'3.4" 720×480', form:"Horizontal", os:"Linux", tier:"Budget", msrp:73, street:68, hr:null, emu:emu("h700") },
  { id:"rg28xx", name:"Anbernic RG28XX", brand:"Anbernic", chip:"Allwinner H700", ram:"1GB", screen:'2.83" 640×480', form:"Horizontal micro", os:"Linux", tier:"Budget", msrp:55, street:55, hr:null, emu:emu("h700") },
  { id:"rgslide", name:"Anbernic RG Slide", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'4.7" 1280×960 120Hz', form:"Slider", os:"Android 13", tier:"Mid", msrp:190, street:156, hr:259, tracked:true, emu:emu("t820") },
  { id:"mangmiairx", name:"Mangmi Air X", brand:"Mangmi", chip:"Snapdragon 662", ram:"4GB", screen:'5.5" 1080p', form:"Horizontal", os:"Android", tier:"Mid", msrp:106, street:100, hr:107, emu:emu("g99",{Saturn:0,"3DS":0}) },
  { id:"rg405m", name:"Anbernic RG405M", brand:"Anbernic", chip:"Unisoc T618", ram:"4GB", screen:'4.0" 640×480', form:"Horizontal", os:"Android", tier:"Mid", msrp:120, street:110, hr:145, emu:emu("t618") },
  { id:"rg405v", name:"Anbernic RG405V", brand:"Anbernic", chip:"Unisoc T618", ram:"4GB", screen:'4.0" 640×480 OLED', form:"Vertical", os:"Android", tier:"Mid", msrp:120, street:115, hr:145, emu:emu("t618") },
  { id:"rg505", name:"Anbernic RG505", brand:"Anbernic", chip:"Unisoc T618", ram:"4GB", screen:'4.0" OLED', res:"960×544", form:"Vertical", os:"Android", tier:"Mid", msrp:158, street:120, hr:140, emu:emu("t618") },
  { id:"rgcube", name:"Anbernic RG Cube", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'3.95" 720×720', form:"Square", os:"Android 13", tier:"Mid", msrp:170, street:135, hr:253, emu:emu("t820") },
  { id:"rg556", name:"Anbernic RG556", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'5.48" 1080p AMOLED', form:"Horizontal", os:"Android", tier:"Mid", msrp:185, street:180, hr:256, emu:emu("t820") },
  { id:"rg406h", name:"Anbernic RG406H", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'4.0" 960×720', form:"Horizontal", os:"Android", tier:"Mid", msrp:168, street:150, hr:256, emu:emu("t820") },
  { id:"rg406v", name:"Anbernic RG406V", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'4.0" 960×720', form:"Vertical", os:"Android", tier:"Mid", msrp:168, street:160, hr:256, emu:emu("t820") },
  { id:"rg476h", name:"Anbernic RG476H", brand:"Anbernic", chip:"Unisoc T820", ram:"8GB", screen:'4.7" 120Hz', form:"Horizontal", os:"Android", tier:"Mid", msrp:165, street:163, hr:262, emu:emu("t820") },
  { id:"miyooflip", name:"Miyoo Flip", brand:"Miyoo", chip:"Rockchip RK3566", ram:"1GB", screen:'3.5" 640×480', form:"Clamshell", os:"Linux", tier:"Mid", msrp:90, street:85, hr:null, emu:emu("rk3566") },
  { id:"pocketmicro", name:"AYANEO Pocket Micro", brand:"AYANEO", chip:"MediaTek Helio G99", ram:"8GB", screen:'3.5" 960×640', form:"Micro", os:"Android 13", tier:"Mid", msrp:269, street:220, hr:null, emu:emu("g99") },
  { id:"rp4pro", name:"Retroid Pocket 4 Pro", brand:"Retroid", chip:"MediaTek Dimensity 1100", ram:"8GB", screen:'4.7" 750p', form:"Horizontal", os:"Android", tier:"High", msrp:199, street:179, hr:344, emu:emu("d1100") },
  { id:"rpflip2", name:"Retroid Pocket Flip 2", brand:"Retroid", chip:"Dimensity 1100 / 8300", ram:"8GB", screen:'4.7" AMOLED', form:"Clamshell", os:"Android", tier:"High", msrp:229, street:199, hr:355, emu:emu("d1100") },
  { id:"rpmini", name:"Retroid Pocket Mini V2", brand:"Retroid", chip:"Snapdragon 865", ram:"6GB", screen:'3.92" AMOLED', form:"Horizontal", os:"Android 13", tier:"High", msrp:199, street:189, hr:null, emu:emu("sd865") },
  { id:"rp5", name:"Retroid Pocket 5", brand:"Retroid", chip:"Snapdragon 865", ram:"8GB", screen:'5.5" 1080p AMOLED', form:"Horizontal", os:"Android 13", tier:"High", msrp:219, street:199, hr:440, emu:emu("sd865") },
  { id:"rg557", name:"Anbernic RG557", brand:"Anbernic", chip:"MediaTek Dimensity 8300", ram:"8GB", screen:'5.48" 1080p AMOLED', form:"Horizontal", os:"Android 14", tier:"High", msrp:300, street:279, hr:441, emu:emu("d8300") },
  { id:"rg477m", name:"Anbernic RG477M", brand:"Anbernic", chip:"MediaTek Dimensity 8300", ram:"8GB", screen:'4.7" 120Hz', form:"Horizontal", os:"Android", tier:"High", msrp:254, street:251, hr:444, emu:emu("d8300") },
  { id:"rp6", name:"Retroid Pocket 6", brand:"Retroid", chip:"Snapdragon 8 Gen 2", ram:"8GB", screen:'5.5" 1080p 120Hz AMOLED', form:"Horizontal", os:"Android", tier:"High", msrp:244, street:244, hr:602, emu:emu("sd8g2") },
  { id:"odin2", name:"AYN Odin 2", brand:"AYN", chip:"Snapdragon 8 Gen 2", ram:"8GB", screen:'6.0" 1080p', form:"Horizontal", os:"Android 13", tier:"High", msrp:299, street:299, hr:610, emu:emu("sd8g2") },
  { id:"rpg2", name:"Retroid Pocket G2", brand:"Retroid", chip:"Snapdragon G2 Gen 2", ram:"8GB", screen:'4.7"', form:"Horizontal", os:"Android", tier:"High", msrp:209, street:200, hr:541, emu:emu("g2gen2") },
  { id:"pockets", name:"AYANEO Pocket S", brand:"AYANEO", chip:"Snapdragon G3x Gen 2", ram:"12GB", screen:'6" 1080p', form:"Horizontal", os:"Android", tier:"High", msrp:419, street:400, hr:564, emu:emu("g3x") },
  { id:"odin3", name:"AYN Odin 3", brand:"AYN", chip:"Snapdragon 8 Elite", ram:"12GB", screen:'6.x" AMOLED', form:"Horizontal", os:"Android", tier:"High", msrp:339, street:339, hr:888, emu:emu("sd8elite") },
];

export const HR_MAX = 888;
export function scoreOf(d, price) {
  const pts = SYSTEMS.reduce((a, s) => a + d.emu[s], 0);
  const emu100 = (pts / (SYSTEMS.length * 2)) * 100;
  const parts = [emu100];
  if (d.hr != null) parts.push((d.hr / HR_MAX) * 100);
  const composite = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { emu100: +emu100.toFixed(1), composite: +composite.toFixed(1), value: +((composite / price) * 10).toFixed(2) };
}
