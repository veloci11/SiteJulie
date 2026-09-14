// Disposable browser-only compiled-module overrides; never edits app source or data.
import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const output='artifacts/home-framing-variants';await mkdir(output,{recursive:true});
const chunkPath='.next/static/chunks/37eavk59g4u4r.js';const compiled=await readFile(chunkPath,'utf8');
const variants=[{name:'chosen-yaw244-portrait',x:3.3,z:8.2,yaw:225,portraitYaw:244}];
const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try {
 for(const variant of variants){
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const yaw=viewport.width<700?(variant.portraitYaw??variant.yaw+15):variant.yaw;
   const js=compiled.replace('[0,7.2]',`[${variant.x},${variant.z}]`).replace('Math.PI+Math.PI/30',`${yaw}*Math.PI/180`);
   if(js===compiled)throw new Error('Fixture replacement missing');
   const page=await browser.newPage({viewport,reducedMotion:'reduce',deviceScaleFactor:1.5});
   await page.route('**/37eavk59g4u4r.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:js}));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3000/');
   const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-navigation-state','arrived',{timeout:60000});
   await expect(page.locator('.visit-shell')).toHaveAttribute('data-arrival-state','live',{timeout:60000});
   const pose=await canvas.evaluate(c=>({...c.dataset}));
   const path=`${output}/${variant.name}-${viewport.width}.png`;
   await page.screenshot({path});results.push({variant,viewport,yaw,path,pose,errors});await page.close();
  }
 }
 await writeFile(`${output}/report.json`,JSON.stringify(results,null,2));console.log(results.map(({variant,viewport,yaw,errors})=>({variant,viewport,yaw,errors})));
}finally{await browser.close();}
