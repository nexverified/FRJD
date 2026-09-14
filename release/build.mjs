import {mkdir,writeFile,copyFile,cp} from 'node:fs/promises';
import {build} from 'esbuild';
import {createPages,aliases} from './pages.mjs';
await mkdir('dist/server',{recursive:true});await mkdir('dist/client/assets',{recursive:true});await mkdir('dist/client/release',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['release/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:true});
for(const name of ['warehouse_storefront','pallet_packages','business_license'])await copyFile(`assets/${name}.jpg`,`dist/client/assets/${name}.jpg`);
for(const name of ['site.css','client.js'])await copyFile('release/'+name,'dist/client/release/'+name);
await writeFile('dist/client/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="5" fill="#143d80"/><path d="M11 9h21v6H18v5h11v6H18v7h-7z" fill="white"/><path d="M28 5h7v5h-7z" fill="#d89b39"/></svg>');
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
// Keep the canonical Corporate-V2 HTML routes in sync with the launch release.
const origin=process.env.FRJD_SITE_ORIGIN||'https://frjd-sourcing.bright-amber-9810.chatgpt.site';
for(const [name,html]of Object.entries(createPages()))await writeFile(name,html.replaceAll('__SITE_ORIGIN__',origin));
for(const [name,target]of Object.entries(aliases))await writeFile(name,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=/${target}"><title>Page moved | FRJD</title><link rel="canonical" href="${origin}/${target}"></head><body><p>This information has moved to <a href="/${target}">FRJD’s current service page</a>.</p></body></html>`);
console.log('Built FRJD Worker, canonical pages, aliases, three source assets and database migrations.');
