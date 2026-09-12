import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors=[];
page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR',e.message); });
page.on('console', m => { if(m.type()==='error') { errors.push(m.text()); console.log('CONSOLE',m.text().slice(0,350)); } });
try {
await page.goto('http://localhost:3100', {waitUntil:'domcontentloaded', timeout:90000});
await page.getByRole('link',{name:'Try the live demo',exact:true}).waitFor();
await page.screenshot({path:'data/gate8/landing-desktop.png', fullPage:true});
console.log('LANDING', await page.locator('h1').innerText());
await page.getByRole('link',{name:'Try the live demo',exact:true}).click();
await page.getByRole('button',{name:'Verify cashflow',exact:true}).waitFor();
await page.waitForTimeout(2000);
await page.getByRole('button',{name:'Verify cashflow',exact:true}).click();
await Promise.race([
  page.getByRole('link',{name:'See position and remaining capacity'}).waitFor({timeout:120000}),
  page.locator('main').getByRole('alert').waitFor({timeout:120000}),
]);
console.log('VERIFY',await page.locator('main').innerText());
await page.screenshot({path:'data/gate8/verify-desktop.png',fullPage:true});
await page.getByRole('link',{name:'See position and remaining capacity'}).click({timeout:3000});
await page.getByRole('button',{name:'Check an overdraw',exact:true}).waitFor({timeout:60000});
await page.getByRole('button',{name:'Check an overdraw',exact:true}).click();
await page.getByRole('link',{name:'See activity',exact:true}).waitFor({timeout:60000});
console.log('POSITION',await page.locator('main').innerText());
await page.screenshot({path:'data/gate8/position-desktop.png',fullPage:true});
await page.getByRole('link',{name:'See activity',exact:true}).click();
await page.waitForURL('**/activity/**');
await page.getByRole('heading',{name:'Activity',exact:true}).waitFor();
await page.getByText('Settled on Creditcoin',{exact:true}).first().waitFor({timeout:60000});
console.log('ACTIVITY',await page.locator('main').innerText());
await page.screenshot({path:'data/gate8/activity-desktop.png',fullPage:true});
writeFileSync('data/gate8/browser-desktop-result.json',JSON.stringify({passed:true,errors,recordedAt:new Date().toISOString()},null,2));
} catch(e) {
console.log('FAILED',e.message,'BODY',await page.locator('main').innerText().catch(()=>''));
await page.screenshot({path:'data/gate8/browser-failure.png',fullPage:true});
writeFileSync('data/gate8/browser-desktop-result.json',JSON.stringify({passed:false,error:e.message,errors,recordedAt:new Date().toISOString()},null,2));
process.exitCode=1;
} finally {await browser.close();}


