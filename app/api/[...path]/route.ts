import { env } from 'cloudflare:workers';
import { baseline, recordIndex, plotIndex } from '@/lib/baseline';
import { calculateStock, observationFlags, summarizeRound, isValidDate, toCsv, METHOD_ID } from '@/lib/domain';
import type { Round, Observation, ObservationInput, Evidence } from '@/lib/types';

export const dynamic = 'force-dynamic';
const NO_CACHE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_CACHE });
const db = () => { if (!env.DB) throw new HttpError(503, 'ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่ ข้อมูลที่ยังไม่ส่งจะคงอยู่ในเครื่อง'); return env.DB; };
const bucket = () => { if (!env.BUCKET) throw new HttpError(503,'พื้นที่เก็บหลักฐานยังไม่พร้อม'); return env.BUCKET; };
const text = (value: unknown, max: number, required = false) => { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400,'ข้อความไม่ครบหรือยาวเกินกำหนด'); return value.trim(); };
const uuid = (v: unknown) => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(v)) throw new HttpError(400,'รหัสรายการไม่ถูกต้อง'); return v; };
async function hash(v: unknown) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v))); return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join(''); }
function roundFrom(r: Record<string, unknown>): Round { return { id: String(r.id), name: String(r.name), date: String(r.date), plotIds: JSON.parse(String(r.plot_ids)), notes: String(r.notes), status: r.status as Round['status'], createdAt: String(r.created_at), updatedAt: String(r.updated_at), lockedAt: r.locked_at ? String(r.locked_at) : null, version: Number(r.version) }; }
function evidenceFrom(e: Record<string, unknown>): Evidence { return {id:String(e.id),roundId:String(e.round_id),recordId:String(e.record_id),fileName:String(e.file_name),mimeType:String(e.mime_type),size:Number(e.size),createdAt:String(e.created_at),url:'/api/evidence/'+e.id}; }
async function getRound(id: string) { const r = await db().prepare('SELECT * FROM survey_rounds WHERE id=?').bind(id).first<Record<string, unknown>>(); if(!r) throw new HttpError(404,'ไม่พบรอบสำรวจ'); return roundFrom(r); }
async function getObservations(roundId?: string): Promise<Observation[]> { const q = roundId ? db().prepare('SELECT payload FROM observations WHERE round_id=?').bind(roundId) : db().prepare('SELECT payload FROM observations'); const r = await q.all<{payload:string}>(); return r.results.map(x=>JSON.parse(x.payload)); }
async function getEvidence(roundId?: string): Promise<Evidence[]> { const q = roundId ? db().prepare('SELECT * FROM evidence WHERE round_id=? ORDER BY created_at').bind(roundId) : db().prepare('SELECT * FROM evidence ORDER BY created_at'); return (await q.all<Record<string,unknown>>()).results.map(evidenceFrom); }
async function receipt(id: string, requestHash: string) { const r = await db().prepare('SELECT * FROM operation_receipts WHERE operation_id=?').bind(id).first<{request_hash:string,response:string}>(); if(r && r.request_hash !== requestHash) throw new HttpError(409,'รหัสการส่งข้อมูลนี้ถูกใช้กับข้อมูลคนละชุด กรุณาตรวจรายการค้างส่ง'); return r ? JSON.parse(r.response) : null; }
async function requestBody(request: Request) { if(!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415,'ต้องส่งข้อมูลเป็น JSON'); const raw=await request.text(); if(raw.length>100000) throw new HttpError(413,'ข้อมูลมากเกินไป'); try {const v=JSON.parse(raw); if(!v || typeof v!=='object' || Array.isArray(v)) throw new Error(); return v;} catch {throw new HttpError(400,'รูปแบบข้อมูลไม่ถูกต้อง');} }

function authorize(request: Request) {
  const user = request.headers.get('oai-authenticated-user-id');
  // The development branch is compiled out of production; hosted identity belongs to Sites.
  const actor = user || (process.env.NODE_ENV === 'development' ? 'development-preview' : null);
  if (!actor) throw new HttpError(401,'กรุณาเข้าสู่ระบบ ChatGPT เพื่อเปิดข้อมูลส่วนตัว');
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const allowed = [new URL(request.url).origin, 'https://mangrove-mrv-baseline.gon1122.chatgpt.site'];
    if (process.env.NODE_ENV === 'development') allowed.push('http://terminal.local:4173');
    if (origin && !allowed.includes(origin)) throw new HttpError(403,'แหล่งคำขอไม่ตรงกับเว็บนี้');
  }
  return actor;
}

async function createRound(body: Record<string, unknown>, actor: string) {
  const op=uuid(body.operationId), name=text(body.name,160,true), notes=text(body.notes??'',3000);
  if(!isValidDate(body.date)) throw new HttpError(400,'วันที่รอบสำรวจไม่ถูกต้อง');
  if(!Array.isArray(body.plotIds) || !body.plotIds.length || body.plotIds.length>32 || body.plotIds.some(x=>typeof x!=='string'||!plotIndex.has(x))) throw new HttpError(400,'กรุณาเลือกแปลงตัวอย่างที่มีในเบสไลน์');
  const plotIds=[...new Set(body.plotIds as string[])].sort();
  const requestHash=await hash(['createRound',name,body.date,plotIds,notes]); const old=await receipt(op,requestHash); if(old) return old;
  const now=new Date().toISOString();
  const round:Round={id:'r_'+op,name,date:body.date,plotIds,notes,status:'open',version:1,createdAt:now,updatedAt:now,lockedAt:null};
  const result={round};
  try { await db().batch([
    db().prepare('INSERT INTO survey_rounds(id,name,date,plot_ids,notes,status,version,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(round.id,name,round.date,JSON.stringify(plotIds),notes,'open',1,now,now,actor),
    db().prepare('INSERT INTO audit_events(id,round_id,action,actor,payload,created_at) VALUES(?,?,?,?,?,?)').bind(op,round.id,'round_created',actor,JSON.stringify(round),now),
    db().prepare('INSERT INTO operation_receipts(operation_id,request_hash,response,created_at) VALUES(?,?,?,?)').bind(op,requestHash,JSON.stringify(result),now),
  ]); } catch(error) { const retry=await receipt(op,requestHash); if(retry) return retry; throw error; }
  return result;
}

async function saveObservation(body: Record<string, unknown>, actor: string) {
  const operationId=uuid(body.operationId), roundId=text(body.roundId,140,true), recordId=text(body.recordId,80,true);
  const record=recordIndex.get(recordId); if(!record) throw new HttpError(404,'ไม่พบรายการเบสไลน์');
  const round=await getRound(roundId);
  if(!round.plotIds.includes(record.plotId)) throw new HttpError(400,'รายการนี้ไม่อยู่ในแปลงที่เลือกรอบสำรวจ');
  if(typeof body.status!=='string'||!['alive','dead','not_found','unmeasurable'].includes(body.status)) throw new HttpError(400,'สถานะต้นไม่ถูกต้อง');
  if(typeof body.inputType!=='string'||!['dbh','gbh'].includes(body.inputType)) throw new HttpError(400,'ชนิดการวัดไม่ถูกต้อง');
  if(!isValidDate(body.observedOn)) throw new HttpError(400,'วันที่วัดไม่ถูกต้อง');
  const observer=text(body.observer,120,true), notes=text(body.notes??'',3000);
  const expected=body.expectedVersion;
  if(typeof expected!=='number'||!Number.isSafeInteger(expected)||expected<0) throw new HttpError(400,'รุ่นข้อมูลไม่ถูกต้อง');
  if(typeof body.identityConfirmed!=='boolean'||typeof body.samePomConfirmed!=='boolean') throw new HttpError(400,'กรุณาระบุการยืนยันตัวตนและจุดวัด');
  const rawValue=body.status==='alive'?body.rawValue:null;
  if(body.status==='alive' && (typeof rawValue!=='number'||!Number.isFinite(rawValue)||rawValue<=0||rawValue>10000)) throw new HttpError(400,'ขนาดต้นไม้ต้องเป็นตัวเลขมากกว่าศูนย์');
  const pomM=body.pomM===null||body.pomM===undefined?null:body.pomM;
  if(pomM!==null&&(typeof pomM!=='number'||!Number.isFinite(pomM)||pomM<=0||pomM>50)) throw new HttpError(400,'ความสูงจุดวัดไม่ถูกต้อง');
  if(body.status!=='alive'&&!notes) throw new HttpError(400,'กรุณาระบุหมายเหตุของสถานะนี้');
  const clean={roundId,recordId,status:body.status,inputType:body.inputType,rawValue,pomM,observedOn:body.observedOn,observer,notes,identityConfirmed:body.identityConfirmed,samePomConfirmed:body.samePomConfirmed,expectedVersion:expected} as Omit<ObservationInput,'operationId'>;
  const requestHash=await hash(['observation',clean]); const old=await receipt(operationId,requestHash); if(old) return old;
  if(round.status==='locked') throw new HttpError(409,'รอบนี้ล็อกแล้ว กรุณาสร้างรอบใหม่เพื่อเก็บข้อมูลเพิ่มเติม');
  const dbhCm=rawValue===null?null:body.inputType==='gbh'?Number(rawValue)/Math.PI:Number(rawValue);
  const now=new Date().toISOString(), id=roundId+':'+recordId;
  const {expectedVersion:_,...value}=clean;
  const observation:Observation={...value,id,dbhCm,version:expected+1,updatedAt:now,stockTco2e:body.status==='alive'?calculateStock(dbhCm,record.woodDensity):null,flags:observationFlags(record,clean,dbhCm)};
  const response={observation}; const payload=JSON.stringify(observation);
  try {
    const results=await db().batch([
      db().prepare(`INSERT INTO observations(id,round_id,record_id,payload,version,updated_at)
        SELECT ?,?,?,?,?,? FROM survey_rounds WHERE id=? AND status='open'
        AND (?=0 OR EXISTS(SELECT 1 FROM observations WHERE id=? AND version=?))
        ON CONFLICT(round_id,record_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at
        WHERE observations.version=? AND ?>0`).bind(id,roundId,recordId,payload,expected+1,now,roundId,expected,id,expected,expected,expected),
      db().prepare('INSERT INTO audit_events(id,round_id,record_id,action,actor,payload,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(operationId,roundId,recordId,expected?'observation_revised':'observation_created',actor,payload,now),
      db().prepare('UPDATE survey_rounds SET version=version+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)').bind(now,roundId,operationId),
      db().prepare('INSERT INTO operation_receipts(operation_id,request_hash,response,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)').bind(operationId,requestHash,JSON.stringify(response),now,operationId),
    ]);
    if(!results[0].meta.changes) throw new HttpError(409,'ข้อมูลถูกแก้ไขหรือล็อกจากอีกหน้าต่างแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนตัดสินใจบันทึกใหม่');
  } catch(error) {const retry=await receipt(operationId,requestHash); if(retry) return retry; throw error;}
  return response;
}

async function reportFor(roundId: string) {
  const round=await getRound(roundId);
  if(round.status==='locked') {
    const row=await db().prepare('SELECT snapshot FROM report_snapshots WHERE round_id=?').bind(roundId).first<{snapshot:string}>();
    if(!row) throw new HttpError(503,'ไม่พบฉบับรายงานที่ล็อก กรุณาติดต่อผู้ดูแล');
    const pointer=JSON.parse(row.snapshot); const object=await bucket().get(pointer.objectKey);
    if(!object) throw new HttpError(503,'หลักฐานรายงานที่ล็อกยังไม่พร้อม');
    return JSON.parse(await object.text());
  }
  const [observations,evidence]=await Promise.all([getObservations(roundId),getEvidence(roundId)]);
  return {round,observations,evidence,summary:summarizeRound(baseline,round,observations),source:{fileName:baseline.meta.fileName,sha256:baseline.meta.sha256,baselineYearBE:baseline.meta.baselineYearBE,measurementDate:null,methodId:METHOD_ID},baselineRecords:baseline.records.filter(r=>round.plotIds.includes(r.plotId)),plots:baseline.plots.filter(p=>round.plotIds.includes(p.id)),createdAt:new Date().toISOString(),locked:false};
}
async function lockRound(id: string, body: Record<string, unknown>, actor: string) {
  const round=await getRound(id);
  if(round.status==='locked') return {round,snapshot:await reportFor(id)};
  if(body.expectedVersion!==round.version) throw new HttpError(409,'รอบสำรวจมีข้อมูลใหม่ กรุณาโหลดข้อมูลล่าสุดก่อนล็อก');
  const snapshot=await reportFor(id);
  if(snapshot.summary.recorded!==snapshot.summary.expected) throw new HttpError(400,'ยังบันทึกสถานะไม่ครบทุกแถวในแปลงที่เลือก สามารถส่งออกรายงานร่างได้ก่อน');
  const unresolved=snapshot.observations.filter((o:Observation)=>o.status==='alive'&&(!o.identityConfirmed||!o.pomM||(!o.samePomConfirmed&&!o.notes)));
  if(unresolved.length) throw new HttpError(400,`ยังมี ${unresolved.length} รายการที่ต้องยืนยันตัวตน จุดวัด หรือเหตุผลที่เปรียบเทียบไม่ได้`);
  const now=new Date().toISOString(), event=crypto.randomUUID(), key='reports/'+id+'/'+event+'.json';
  const lockedRound={...round,status:'locked' as const,lockedAt:now,updatedAt:now,version:round.version+1};
  const frozen={...snapshot,round:lockedRound,locked:true,createdAt:now};
  await bucket().put(key,JSON.stringify(frozen),{httpMetadata:{contentType:'application/json'}});
  try {
    const results=await db().batch([
      db().prepare("UPDATE survey_rounds SET status='locked',locked_at=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND status='open'").bind(now,now,id,round.version),
      db().prepare('INSERT INTO report_snapshots(round_id,snapshot,source_hash,created_at) SELECT ?,?,?,? WHERE changes()=1').bind(id,JSON.stringify({objectKey:key}),baseline.meta.sha256,now),
      db().prepare('INSERT INTO audit_events(id,round_id,action,actor,payload,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM report_snapshots WHERE round_id=? AND created_at=?)').bind(event,id,'round_locked',actor,JSON.stringify({version:lockedRound.version,sourceHash:baseline.meta.sha256}),now,id,now),
    ]);
    if(!results[0].meta.changes) {await bucket().delete(key); throw new HttpError(409,'มีข้อมูลเปลี่ยนระหว่างเตรียมรายงาน กรุณาโหลดแล้วล็อกใหม่');}
  } catch(error) {
    // A transport error can occur after D1 commits. Keep the immutable object;
    // removing it here could destroy an already referenced report.
    throw error;
  }
  return {round:lockedRound,snapshot:frozen};
}

async function uploadEvidence(request: Request, actor: string) {
  if(Number(request.headers.get('content-length')||0)>6*1024*1024) throw new HttpError(413,'รูปต้องไม่เกิน 5 MB');
  const form=await request.formData(); const roundId=text(form.get('roundId'),140,true), recordId=text(form.get('recordId'),80,true), file=form.get('file');
  if(!(file instanceof File)||file.size===0||file.size>5*1024*1024) throw new HttpError(400,'เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');
  const round=await getRound(roundId), record=recordIndex.get(recordId);
  if(!record||!round.plotIds.includes(record.plotId)) throw new HttpError(400,'รูปนี้ไม่อยู่ในขอบเขตรอบสำรวจ');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'image/webp':null;
  if(!mime) throw new HttpError(415,'รองรับไฟล์ภาพ JPG, PNG และ WebP เท่านั้น');
  const operation=form.get('operationId'); const id=operation?uuid(operation):crypto.randomUUID();
  const checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const old=await db().prepare('SELECT * FROM evidence WHERE id=?').bind(id).first<Record<string,unknown>>();
  if(old) {
    const object=await bucket().head(String(old.object_key));
    if(old.round_id!==roundId||old.record_id!==recordId||object?.customMetadata?.sha256!==checksum) throw new HttpError(409,'รหัสหลักฐานซ้ำกับไฟล์คนละชุด');
    return {evidence:evidenceFrom(old)};
  }
  if(round.status==='locked') throw new HttpError(409,'รอบนี้ล็อกแล้ว เพิ่มหลักฐานไม่ได้');
  const key='evidence/'+id+'/'+crypto.randomUUID(), now=new Date().toISOString(), fileName=file.name.slice(0,200);
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{sha256:checksum}});
  try {
    const results=await db().batch([
      db().prepare("INSERT INTO evidence(id,round_id,record_id,object_key,file_name,mime_type,size,created_at) SELECT ?,?,?,?,?,?,?,? FROM survey_rounds WHERE id=? AND status='open'").bind(id,roundId,recordId,key,fileName,mime,file.size,now,roundId),
      db().prepare('UPDATE survey_rounds SET version=version+1,updated_at=? WHERE id=? AND changes()=1').bind(now,roundId),
      db().prepare('INSERT INTO audit_events(id,round_id,record_id,action,actor,payload,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind('e_'+id,roundId,recordId,'evidence_added',actor,JSON.stringify({id,fileName,size:file.size}),now),
    ]);
    if(!results[0].meta.changes) {await bucket().delete(key);throw new HttpError(409,'รอบสำรวจล็อกแล้ว');}
  } catch(error) {
    // An upload retry or an ambiguous D1 response must not delete an object
    // that may have become committed. Distinct attempt keys avoid overwrites.
    const committed=await db().prepare('SELECT * FROM evidence WHERE id=?').bind(id).first<Record<string,unknown>>().catch(()=>null);
    if(committed && committed.round_id===roundId && committed.record_id===recordId) {
      const object=await bucket().head(String(committed.object_key));
      if(object?.customMetadata?.sha256===checksum) return {evidence:evidenceFrom(committed)};
      throw new HttpError(409,'รหัสหลักฐานซ้ำกับไฟล์คนละชุด');
    }
    throw error;
  }
  return {evidence:{id,roundId,recordId,fileName,mimeType:mime,size:file.size,createdAt:now,url:'/api/evidence/'+id}};
}

async function handle(request: Request): Promise<Response> {
  try {
    const actor=authorize(request), url=new URL(request.url), path=url.pathname.replace(/^\/api\//,'').split('/');
    if(request.method==='GET') {
      if(path[0]==='baseline') return json(baseline);
      if(path[0]==='state') {const [rows,observations,evidence]=await Promise.all([db().prepare('SELECT * FROM survey_rounds ORDER BY created_at DESC').all<Record<string,unknown>>(),getObservations(),getEvidence()]);return json({rounds:rows.results.map(roundFrom),observations,evidence});}
      if(path[0]==='reports'&&path[1]) return json(await reportFor(path[1]));
      if(path[0]==='audit'&&path[1]) {await getRound(path[1]);const rows=await db().prepare('SELECT * FROM audit_events WHERE round_id=? ORDER BY created_at').bind(path[1]).all();return json({events:rows.results});}
      if(path[0]==='evidence'&&path[1]) {const e=await db().prepare('SELECT * FROM evidence WHERE id=?').bind(path[1]).first<Record<string,unknown>>();if(!e) throw new HttpError(404,'ไม่พบรูป');const object=await bucket().get(String(e.object_key));if(!object) throw new HttpError(404,'ไม่พบไฟล์รูป');return new Response(object.body,{headers:{...NO_CACHE,'Content-Type':String(e.mime_type),'Content-Disposition':'inline'}});}
      if(path[0]==='export') {
        const id=url.searchParams.get('roundId'), type=url.searchParams.get('type')||'csv';
        if(id&&!/^r_[a-zA-Z0-9_-]{12,100}$/.test(id)) throw new HttpError(400,'รหัสรอบสำรวจไม่ถูกต้อง');
        if(type==='json') {const data=id?await reportFor(id):baseline;return new Response(JSON.stringify(data,null,2),{headers:{...NO_CACHE,'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="mrv-${id||'baseline'}.json"`}});}
        let rows:unknown[][];
        if(id) {const report=await reportFor(id);const source=new Map<string,typeof baseline.records[number]>((report.baselineRecords||baseline.records).map((r:typeof baseline.records[number])=>[r.id,r]));rows=[['round','record_id','plot','tag','species','source_sheet','source_row','baseline_dbh_cm','baseline_stock_tco2e','status','input_type','raw_value_cm','current_dbh_cm','pom_m','observed_on','observer','identity_confirmed','same_pom_confirmed','current_stock_tco2e','flags','notes','revision','report_status']];for(const o of report.observations as Observation[]){const r=source.get(o.recordId)!;rows.push([report.round.name,o.recordId,r.plotId,r.tag,r.species,r.plotId,r.row,r.dbhCm,r.stockTco2e,o.status,o.inputType,o.rawValue,o.dbhCm,o.pomM,o.observedOn,o.observer,o.identityConfirmed,o.samePomConfirmed,o.stockTco2e,o.flags.join('|'),o.notes,o.version,report.locked?'locked':'draft']);}}
        else rows=[['record_id','plot','tag','species','dbh_cm','source_count_marker','wood_density','agb_kg','bgb_kg','stock_tco2e','source_sheet','source_row','flags','notes'],...baseline.records.map(r=>[r.id,r.plotId,r.tag,r.species,r.dbhCm,r.countMarker,r.woodDensity,r.agbKg,r.bgbKg,r.stockTco2e,r.plotId,r.row,r.flags.join('|'),r.note])];
        return new Response(toCsv(rows),{headers:{...NO_CACHE,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="mrv-${id||'baseline'}.csv"`}});
      }
    } else if(request.method==='POST') {
      if(path[0]==='evidence') return json(await uploadEvidence(request,actor),201);
      const body=await requestBody(request);
      if(path[0]==='rounds'&&path[1]&&path[2]==='lock') return json(await lockRound(path[1],body,actor));
      if(path[0]==='rounds'&&path.length===1) return json(await createRound(body,actor),201);
      if(path[0]==='observations') return json(await saveObservation(body,actor));
    }
    throw new HttpError(404,'ไม่พบรายการที่ร้องขอ');
  } catch(error) {
    if(error instanceof HttpError) return json({error:error.message},error.status);
    console.error('MRV API failure',error instanceof Error?error.message:'unknown');
    return json({error:'บันทึกหรือโหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่ รายการที่ยังไม่ส่งจะคงอยู่ในเครื่อง'},503);
  }
}
export const GET=handle;
export const POST=handle;
