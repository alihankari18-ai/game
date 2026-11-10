import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createEngine, RuleError } from './engine.mjs';
mkdirSync('data',{recursive:true});
const engine=createEngine(process.env.GAME_DB||'data/development-v02.sqlite');
const root=resolve('dist');
const csvCell=x=>'"'+String(x==null?'':typeof x==='object'?JSON.stringify(x):x).replaceAll('"','""')+'"';
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const url=new URL(req.url,'http://localhost');
  const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
  try{
    if(url.pathname.startsWith('/api/')){
      if(req.headers['sec-fetch-site']==='cross-site')throw new RuleError('Cross-site request rejected',403);
      const token=(req.headers.authorization||'').replace(/^Bearer /,'');
      let body={};
      if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new RuleError('Request too large',413);}try{body=JSON.parse(raw);}catch{throw new RuleError('Invalid JSON');}}
      if(url.pathname==='/api/session'&&req.method==='POST')return send(201,engine.create(body));
      if(url.pathname==='/api/state'&&req.method==='GET')return send(200,engine.state(token));
      if(url.pathname==='/api/command'&&req.method==='POST')return send(200,engine.command(token,body));
      if(url.pathname==='/api/session'&&req.method==='DELETE'){engine.remove(token);return send(200,{deleted:true});}
      if(url.pathname==='/api/export'&&req.method==='GET'){
        const data=engine.export(token);const format=url.searchParams.get('format');
        if(format==='csv'||format==='sessions'){
          const rows=format==='sessions'?[{...data.metadata,...data.session}]:data.events;const cols=Object.keys(rows[0]||{});
          return send(200,'\uFEFF'+[cols.map(csvCell).join(','),...rows.map(row=>cols.map(c=>csvCell(row[c])).join(','))].join('\r\n'),'text/csv; charset=utf-8');
        }return send(200,data);
      }
      throw new RuleError('Not found',404);
    }
    if(!['GET','HEAD'].includes(req.method))throw new RuleError('Method not allowed',405);
    let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+sep))throw new RuleError('Not found',404);
    if(!existsSync(file)||statSync(file).isDirectory())file=resolve(root,'index.html');
    if(!existsSync(file))return send(503,'Алдымен npm run build пәрменін орындаңыз.','text/plain; charset=utf-8');
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    return send(200,readFileSync(file),types[extname(file)]||'application/octet-stream');
  }catch(e){send(e instanceof RuleError?e.status:500,{error:e instanceof RuleError?e.message:'Сақтау қатесі. Әрекетті қайта көріңіз.'});}
});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Ортақ қала 0.2: development server ready (dev data only).'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{engine.close();process.exit();}));
