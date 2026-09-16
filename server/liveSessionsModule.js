import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function isAdmin(userId) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'INVALID_TOKEN' });
  req.user = user;
  next();
}

export async function adminOnly(req, res, next) {
  if (!(await isAdmin(req.user.id))) return res.status(403).json({ error: 'ADMIN_REQUIRED' });
  next();
}

export async function checkCourseAccess(req, res, next) {
  const courseId = req.params.courseId || req.body.course_id;
  if (!courseId) return res.status(400).json({ error: 'COURSE_ID_REQUIRED' });
  if (await isAdmin(req.user.id)) return next();
  const { data } = await supabase.from('enrollments').select('id').eq('course_id', courseId).eq('user_id', req.user.id).maybeSingle();
  if (!data) return res.status(403).json({ error: 'COURSE_ACCESS_DENIED' });
  next();
}

// Student: course-scoped sessions. meet_url is intentionally never selected here.
router.get('/courses/:courseId/live-sessions', auth, checkCourseAccess, async (req, res) => {
  const { data, error } = await supabase
    .from('live_sessions')
    .select('id,course_id,title,description,starts_at,duration_minutes,capacity,default_max_entries,created_at,updated_at')
    .eq('course_id', req.params.courseId)
    .order('starts_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Student: secure entry. Supabase RPC checks time window, course access, capacity and entry quota.
router.post('/live-sessions/:id/enter', auth, async (req, res) => {
  const { data, error } = await supabase.rpc('enter_live_session', { p_session_id: req.params.id });
  if (error) {
    const status = {
      COURSE_ACCESS_DENIED: 403,
      SESSION_NOT_STARTED: 409,
      SESSION_EXPIRED: 410,
      ENTRY_LIMIT_REACHED: 409,
      CAPACITY_FULL: 409,
      SESSION_NOT_FOUND: 404
    }[error.message] || 400;
    return res.status(status).json({ error: error.message });
  }
  res.json(data);
});

router.post('/live-sessions/:id/reentry-request', auth, async (req, res) => {
  const { data, error } = await supabase.rpc('request_reentry', { p_session_id: req.params.id });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: data });
});

// Admin: create, edit and delete sessions.
router.get('/admin/live-sessions', auth, adminOnly, async (_req, res) => {
  const { data, error } = await supabase.from('live_sessions').select('*').order('starts_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/admin/live-sessions', auth, adminOnly, async (req, res) => {
  const { course_id, title, description = '', starts_at, duration_minutes = 120, capacity = 20, default_max_entries = 1, meet_url } = req.body;
  if (!course_id || !title || !starts_at || !meet_url) return res.status(400).json({ error: 'REQUIRED_FIELDS_MISSING' });
  const { data, error } = await supabase.from('live_sessions').insert({ course_id, title, description, starts_at, duration_minutes, capacity, default_max_entries, meet_url }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/admin/live-sessions/:id', auth, adminOnly, async (req, res) => {
  const allowed = ['course_id', 'title', 'description', 'starts_at', 'duration_minutes', 'capacity', 'default_max_entries', 'meet_url'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('live_sessions').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/admin/live-sessions/:id', auth, adminOnly, async (req, res) => {
  const { error } = await supabase.from('live_sessions').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Admin: grant emergency second entry.
router.post('/live-sessions/:id/grant-reentry', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.rpc('admin_grant_reentry', { p_session_id: req.params.id, p_user_id: req.body.user_id });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: data });
});

router.get('/admin/live-sessions/:id/logs', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('session_logs').select('id,session_id,user_id,entry_count,max_entries,last_entered_at,emergency_requested,emergency_resolved_at').eq('session_id', req.params.id).order('last_entered_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Student assignments.
router.get('/courses/:courseId/assignments', auth, checkCourseAccess, async (req, res) => {
  const { data, error } = await supabase.from('assignments').select('id,course_id,title,description,deadline,attachment_url,is_grades_published,created_at').eq('course_id', req.params.courseId).order('deadline');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.get('/assignments/:id/submission', auth, async (req, res) => {
  const { data: assignment } = await supabase.from('assignments').select('course_id,is_grades_published').eq('id', req.params.id).maybeSingle();
  if (!assignment) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
  if (!(await isAdmin(req.user.id))) {
    const { data: enrollment } = await supabase.from('enrollments').select('id').eq('course_id', assignment.course_id).eq('user_id', req.user.id).maybeSingle();
    if (!enrollment) return res.status(403).json({ error: 'COURSE_ACCESS_DENIED' });
  }
  const { data: submission, error } = await supabase.from('assignment_submissions').select('id,file_url,note,status,score,feedback,graded_at').eq('assignment_id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (submission && !assignment.is_grades_published && !(await isAdmin(req.user.id))) {
    delete submission.score;
    delete submission.feedback;
    delete submission.graded_at;
  }
  res.json({ assignment, submission });
});

router.post('/assignments/:id/submissions', auth, async (req, res) => {
  const { data: assignment } = await supabase.from('assignments').select('course_id').eq('id', req.params.id).maybeSingle();
  if (!assignment) return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
  const { data: enrollment } = await supabase.from('enrollments').select('id').eq('course_id', assignment.course_id).eq('user_id', req.user.id).maybeSingle();
  if (!enrollment) return res.status(403).json({ error: 'COURSE_ACCESS_DENIED' });
  const { file_url, note = '' } = req.body;
  if (!file_url) return res.status(400).json({ error: 'FILE_REQUIRED' });
  const { data, error } = await supabase.from('assignment_submissions').upsert({ assignment_id: req.params.id, user_id: req.user.id, file_url, note, status: 'pending', score: null, feedback: null, graded_at: null }, { onConflict: 'assignment_id,user_id' }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Admin: assignment CRUD and grading.
router.get('/admin/assignments', auth, adminOnly, async (_req, res) => {
  const { data, error } = await supabase.from('assignments').select('*').order('deadline', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/admin/assignments', auth, adminOnly, async (req, res) => {
  const { course_id, title, description = '', deadline, attachment_url = '' } = req.body;
  if (!course_id || !title || !deadline) return res.status(400).json({ error: 'REQUIRED_FIELDS_MISSING' });
  const { data, error } = await supabase.from('assignments').insert({ course_id, title, description, deadline, attachment_url, is_grades_published: false }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.patch('/admin/assignments/:id', auth, adminOnly, async (req, res) => {
  const allowed = ['course_id', 'title', 'description', 'deadline', 'attachment_url', 'is_grades_published'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('assignments').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/admin/assignments/:id', auth, adminOnly, async (req, res) => {
  const { error } = await supabase.from('assignments').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

router.get('/admin/assignments/:id/submissions', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('assignment_submissions').select('id,assignment_id,user_id,file_url,note,status,score,feedback,graded_at').eq('assignment_id', req.params.id).order('graded_at', { ascending: false, nullsFirst: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.patch('/admin/submissions/:id/grade', auth, adminOnly, async (req, res) => {
  const score = Number(req.body.score);
  if (!Number.isFinite(score) || score < 0 || score > 5) return res.status(400).json({ error: 'SCORE_MUST_BE_0_TO_5' });
  const { data, error } = await supabase.from('assignment_submissions').update({ status: 'graded', score, feedback: req.body.feedback || '', graded_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/admin/courses/:courseId/assignments/:id/publish-grades', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('assignments').update({ is_grades_published: true, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('course_id', req.params.courseId).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
