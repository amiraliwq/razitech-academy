import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function auth(req,res,next){
  const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token) return res.status(401).json({error:'AUTH_REQUIRED'});
  const {data:{user},error}=await supabase.auth.getUser(token);
  if(error||!user) return res.status(401).json({error:'INVALID_TOKEN'});
  req.user=user; next();
}

export async function checkCourseAccess(req,res,next){
  const courseId=req.params.courseId||req.body.course_id;
  if(!courseId) return res.status(400).json({error:'COURSE_ID_REQUIRED'});
  const {data:p}=await supabase.from('profiles').select('role').eq('id',req.user.id).maybeSingle();
  if(p?.role==='admin') return next();
  const {data}=await supabase.from('enrollments').select('id').eq('course_id',courseId).eq('user_id',req.user.id).maybeSingle();
  if(!data) return res.status(403).json({error:'COURSE_ACCESS_DENIED'});
  next();
}

router.get('/courses/:courseId/live-sessions',auth,checkCourseAccess,async(req,res)=>{
  const {data,error}=await supabase.from('live_sessions').select('id,course_id,title,description,starts_at,duration_minutes,capacity,default_max_entries,created_at,updated_at').eq('course_id',req.params.courseId).order('starts_at');
  if(error) return res.status(500).json({error:error.message}); res.json(data||[]);
});

router.post('/live-sessions/:id/enter',auth,async(req,res)=>{
  const {data,error}=await supabase.rpc('enter_live_session',{p_session_id:req.params.id});
  if(error){ const map={COURSE_ACCESS_DENIED:403,SESSION_NOT_STARTED:409,SESSION_EXPIRED:410,ENTRY_LIMIT_REACHED:409,CAPACITY_FULL:409,SESSION_NOT_FOUND:404}; const code=map[error.message]||400; return res.status(code).json({error:error.message}); }
  res.json(data);
});

router.post('/live-sessions/:id/reentry-request',auth,async(req,res)=>{ const {data,error}=await supabase.rpc('request_reentry',{p_session_id:req.params.id}); if(error)return res.status(400).json({error:error.message}); res.json({ok:data}); });
router.post('/live-sessions/:id/grant-reentry',auth,async(req,res)=>{ const {data,error}=await supabase.rpc('admin_grant_reentry',{p_session_id:req.params.id,p_user_id:req.body.user_id}); if(error)return res.status(403).json({error:error.message}); res.json({ok:data}); });

router.get('/courses/:courseId/assignments',auth,checkCourseAccess,async(req,res)=>{ const {data,error}=await supabase.from('assignments').select('id,course_id,title,description,deadline,attachment_url,is_grades_published,created_at').eq('course_id',req.params.courseId).order('deadline'); if(error)return res.status(500).json({error:error.message}); res.json(data||[]); });
router.get('/assignments/:id/submission',auth,async(req,res)=>{ const {data:a}=await supabase.from('assignments').select('course_id,is_grades_published').eq('id',req.params.id).maybeSingle(); if(!a)return res.status(404).json({error:'ASSIGNMENT_NOT_FOUND'}); const {data:s,error}=await supabase.from('assignment_submissions').select('id,file_url,note,status,score,feedback,graded_at').eq('assignment_id',req.params.id).eq('user_id',req.user.id).maybeSingle(); if(error)return res.status(500).json({error:error.message}); if(s&&!a.is_grades_published){delete s.score; delete s.feedback; delete s.graded_at;} res.json({assignment:a,submission:s}); });
router.post('/assignments/:id/submissions',auth,async(req,res)=>{ const {data:a}=await supabase.from('assignments').select('course_id').eq('id',req.params.id).maybeSingle(); if(!a)return res.status(404).json({error:'ASSIGNMENT_NOT_FOUND'}); const {data:en}=await supabase.from('enrollments').select('id').eq('course_id',a.course_id).eq('user_id',req.user.id).maybeSingle(); if(!en)return res.status(403).json({error:'COURSE_ACCESS_DENIED'}); const {file_url,note=''}=req.body; if(!file_url)return res.status(400).json({error:'FILE_REQUIRED'}); const {data,error}=await supabase.from('assignment_submissions').upsert({assignment_id:req.params.id,user_id:req.user.id,file_url,note,status:'pending',score:null,feedback:null,graded_at:null},{onConflict:'assignment_id,user_id'}).select().single(); if(error)return res.status(400).json({error:error.message}); res.json(data); });

router.post('/admin/courses/:courseId/assignments/:id/publish-grades',auth,async(req,res)=>{ const {data:p}=await supabase.from('profiles').select('role').eq('id',req.user.id).maybeSingle(); if(p?.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'}); const {data,error}=await supabase.from('assignments').update({is_grades_published:true,updated_at:new Date().toISOString()}).eq('id',req.params.id).eq('course_id',req.params.courseId).select().single(); if(error)return res.status(400).json({error:error.message}); res.json(data); });

export default router;
