import {mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {createPages,aliases} from './pages.mjs';

const output='pages-dist';
const basePath='/FRJD';
const siteOrigin='https://nexverified.github.io'+basePath;
const apiOrigin='https://frjd-sourcing.bhuvanraju66.chatgpt.site';

await rm(output,{recursive:true,force:true});
await mkdir(output+'/release',{recursive:true});
await mkdir(output+'/assets',{recursive:true});

for(const [name,source] of Object.entries(createPages())){
  const html=source
    .replaceAll('__SITE_ORIGIN__',siteOrigin)
    .replace(/\b(href|src|action)="\/(?!\/)/g,`$1="${basePath}/`)
    .replace('</head>',`<meta name="frjd-api-origin" content="${apiOrigin}"></head>`);
  if(/\b(?:href|src|action)="\/(?!FRJD\/)/.test(html))throw Error('A page link or asset is missing the GitHub Pages base path: '+name);
  await writeFile(output+'/'+name,html);
}

for(const [name,target] of Object.entries(aliases)){
  await writeFile(output+'/'+name,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${basePath}/${target}"><title>Page moved | FRJD</title><link rel="canonical" href="${siteOrigin}/${target}"></head><body><p>This page has moved to <a href="${basePath}/${target}">FRJD’s current service page</a>.</p></body></html>`);
}

for(const name of ['warehouse_storefront','pallet_packages','business_license'])await copyFile(`assets/${name}.jpg`,`${output}/assets/${name}.jpg`);
for(const name of ['site.css','client.js','request.js'])await copyFile(`release/${name}`,`${output}/release/${name}`);
await copyFile('dist/client/favicon.svg',`${output}/favicon.svg`);
await writeFile(output+'/.nojekyll','');
await writeFile(output+'/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(createPages()).filter(name=>!['404.html','request.html'].includes(name)).map(name=>`<url><loc>${siteOrigin}/${name==='index.html'?'':name}</loc></url>`).join('')}</urlset>`);
await writeFile(output+'/robots.txt',`User-agent: *\nDisallow: ${basePath}/request.html\nSitemap: ${siteOrigin}/sitemap.xml\n`);
console.log('Built GitHub Pages site at '+siteOrigin+'/');
