import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const pages=require('../public-pages.js');
const origin='https://traces.brownyx.com';

function escapeHtml(value) {
 return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function replaceExactlyOnce(source, pattern, replacement, label) {
 const globalPattern=new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:`${pattern.flags}g`);
 const matches=[...source.matchAll(globalPattern)];
 if(matches.length!==1)throw new Error(`Expected one ${label}; found ${matches.length}`);
 return source.replace(pattern,()=>replacement);
}

export function renderPublicPage(template,page) {
 const canonical=`${origin}${page.path}`;
 let html=template;
 html=replaceExactlyOnce(html,/<title\b[^>]*>[\s\S]*?<\/title>/gi,`<title>${escapeHtml(page.title)}</title>`,'title');
 html=replaceExactlyOnce(html,/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/gi,`<meta name="description" content="${escapeHtml(page.description)}" />`,'description');
 html=replaceExactlyOnce(html,/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi,'<meta name="robots" content="index,follow" />','robots directive');
 html=replaceExactlyOnce(html,/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi,`<link rel="canonical" href="${canonical}" />`,'canonical');
 for(const [property,value] of [['og:title',page.title],['og:description',page.description],['og:url',canonical]]) {
  const pattern=new RegExp(`<meta\\b(?=[^>]*\\bproperty=["']${property}["'])[^>]*>`,'gi');
  html=replaceExactlyOnce(html,pattern,`<meta property="${property}" content="${escapeHtml(value)}" />`,property);
 }
 html=replaceExactlyOnce(html,/<main\b[^>]*class=["']seo-fallback["'][^>]*>[\s\S]*?<\/main>/i,
  `<main class="seo-fallback"><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.summary)}</p><a href="/">Enter the artwork</a></main>`,'public fallback content');
 return html;
}

export async function generatePublicPages(distRoot) {
 const root=resolve(distRoot);
 const template=await readFile(resolve(root,'index.html'),'utf8');
 const outputs=[];
 for(const page of pages) {
  const target=page.path==='/'?resolve(root,'index.html'):resolve(root,page.path.slice(1),'index.html');
  outputs.push([target,renderPublicPage(template,page)]);
 }
 // Preserve the old /art entry point as a crawlable alias of the homepage.
 outputs.push([resolve(root,'art','index.html'),renderPublicPage(template,pages[0])]);
 for(const [target,html] of outputs) {
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,html,'utf8');
 }
 return outputs.map(([target])=>target);
}
