/**
 * CForum Enhanced Worker Extension
 * Paste this into src/index.ts BEFORE the closing brace of the fetch handler,
 * or import as a sub-router.  Requires the v2 schema migration to be applied.
 *
 * New endpoints:
 *   GET  /api/forum/sections            - list categories with images + stats
 *   POST /api/forum/sections            - create category (super_admin)
 *   PUT  /api/forum/sections/:id        - update category
 *   DELETE /api/forum/sections/:id      - delete category
 *   GET  /api/forum/sections/:id/moderators
 *   POST /api/forum/sections/:id/moderators
 *   DELETE /api/forum/sections/:id/moderators/:uid
 *
 *   GET  /api/users/:uid/profile        - public profile
 *   GET  /api/users/:uid/posts          - posts by user
 *   POST /api/follow/:uid               - follow user
 *   DELETE /api/follow/:uid             - unfollow
 *   GET  /api/follow/:uid/status        - am I following?
 *
 *   POST /api/posts/:id/bookmark        - toggle bookmark
 *   GET  /api/me/bookmarks              - my bookmarks
 *   POST /api/posts/:id/appreciate      - send appreciation coins
 *
 *   POST /api/reports                   - submit report
 *   GET  /api/admin/reports             - list reports
 *   PUT  /api/admin/reports/:id         - resolve/dismiss
 *
 *   GET  /api/moderation/queue          - mod queue (mod+)
 *   PUT  /api/moderation/queue/:id      - human decision
 *
 *   GET  /api/emoji/packs               - list emoji packs
 *   POST /api/emoji/packs               - create pack (admin)
 *   DELETE /api/emoji/packs/:id         - delete pack
 *   GET  /api/emoji/packs/:id/items     - list items in pack
 *   POST /api/emoji/packs/:id/items     - add item
 *   GET  /api/emoji/twikoo              - proxy Twikoo emoji JSON
 *
 *   GET  /api/notifications             - my notifications
 *   PUT  /api/notifications/read-all    - mark all read
 *
 *   POST /api/admin/link-requests/:id/review  - approve/reject custom link
 *   GET  /api/admin/link-requests       - list pending links
 *
 *   POST /api/me/custom-link            - submit custom link for review
 *
 *   GET  /api/captcha                   - get math captcha challenge
 *   GET  /api/admin/migrate/generate-uids  - one-time UID generation
 *
 *   GET  /api/admin/settings/extended   - all extended settings
 *   POST /api/admin/settings/extended   - save extended settings
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function isModOrAdmin(role: string) {
  return ['admin', 'super_admin', 'moderator'].includes(role);
}

function isSuperAdmin(role: string) {
  return ['admin', 'super_admin'].includes(role);
}

async function isCategoryMod(db: any, userId: number, categoryId: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM category_moderators WHERE user_id=? AND category_id=?')
    .bind(userId, categoryId)
    .first();
  return !!row;
}

function safeJson(text: string | null | undefined, fallback: any = null) {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

async function createNotification(
  db: any,
  userId: number,
  type: string,
  actorId: number | null,
  refType: string,
  refId: number,
  message: string
) {
  await db
    .prepare(
      'INSERT INTO notifications (user_id,type,actor_id,ref_type,ref_id,message) VALUES (?,?,?,?,?,?)'
    )
    .bind(userId, type, actorId, refType, refId, message)
    .run();
}

// ── AI Moderation ────────────────────────────────────────────────────────────

interface AIResult {
  flagged: boolean;
  score: number;
  labels: string[];
  reason: string;
}

// ── AI Moderation 相关函数 ───────────────────────────────────────────────────

/**
 * 获取 AI 审核结果（支持 wrangler vars 优先）
 */
async function runAIModeration(text: string, env: any): Promise<AIResult> {
  // 优先使用 wrangler secret / vars 中的 key（推荐方式）
  let key = (env as any).AI_MODERATION_KEY || '';

  // 如果 wrangler 中没有，则回退到数据库 settings 表
  if (!key) {
    key = await getSetting(env.cforum_db, 'ai_moderation_key');
  }

  // endpoint 同样支持 wrangler vars 优先
  let endpoint = (env as any).AI_MODERATION_ENDPOINT 
    || await getSetting(env.cforum_db, 'ai_moderation_endpoint')
    || 'https://api.openai.com/v1/moderations';

  if (!key) {
    console.warn('[AI Mod] No moderation key provided');
    return { flagged: false, score: 0, labels: [], reason: '' };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const result = data.results?.[0];

    if (!result) {
      return { flagged: false, score: 0, labels: [], reason: '' };
    }

    // 计算最高风险分数
    const scores = Object.values(result.category_scores || {}) as number[];
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

    // 提取触发的标签
    const labels = Object.entries(result.categories || {})
      .filter(([, v]) => v)
      .map(([k]) => k);

    return {
      flagged: result.flagged || false,
      score: maxScore,
      labels,
      reason: labels.join(', ') || '内容风险较高',
    };
  } catch (e) {
    console.error('[AI Mod] Error:', e);
    return { flagged: false, score: 0, labels: [], reason: '' };
  }
}

/**
 * 从数据库读取设置（保持不变）
 */
export async function getSetting(db: any, key: string): Promise<string> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key=?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value || '';
}

/**
 * 提交内容进行审核（AI + 人工通道）
 */
export async function submitForModeration(
  db: any,
  env: any,
  contentType: 'post' | 'comment',
  contentId: number,
  text: string,
  authorId: number
): Promise<'approved' | 'pending_human' | 'rejected'> {
  const aiEnabled = (await getSetting(db, 'ai_moderation_enabled')) === '1';
  if (!aiEnabled) return 'approved';

  const aiResult = await runAIModeration(text, env);

  const autoApproveThreshold = parseFloat(
    await getSetting(db, 'ai_threshold_auto_approve')
  ) || 0.2;

  const humanReviewThreshold = parseFloat(
    await getSetting(db, 'ai_threshold_human_review')
  ) || 0.6;

  let status: 'approved' | 'pending_human' | 'rejected';

  if (aiResult.score <= autoApproveThreshold && !aiResult.flagged) {
    status = 'approved';
  } else if (aiResult.score >= humanReviewThreshold || aiResult.flagged) {
    status = 'pending_human';
  } else {
    status = 'pending_human';
  }

  // 插入审核队列
  await db
    .prepare(
      `INSERT INTO moderation_queue
       (content_type, content_id, content_text, author_id, ai_score, ai_labels, ai_reason, status)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .bind(
      contentType,
      contentId,
      text.slice(0, 2000),
      authorId,
      aiResult.score,
      JSON.stringify(aiResult.labels),
      aiResult.reason,
      status
    )
    .run();

  // 如果需要人工审核或被拒绝，更新内容状态
  if (status !== 'approved') {
    const table = contentType === 'post' ? 'posts' : 'comments';
    await db
      .prepare(`UPDATE ${table} SET review_status=?, review_label=? WHERE id=?`)
      .bind(
        status === 'pending_human' ? 'ai_flagged' : 'rejected',
        aiResult.reason,
        contentId
      )
      .run();
  }

  return status;
}

// ── Route handler (append to main fetch handler) ─────────────────────────────

export async function handleEnhancedRoutes(
  request: Request,
  env: any,
  url: URL,
  method: string,
  jsonResponse: (data: any, status?: number) => Response,
  security: any   // Security instance from main index.ts
): Promise<Response | null> {
  const db = env.cforum_db;
  const path = url.pathname;

  // ── Auth helper ──────────────────────────────────────────────────────────
  const getUser = async () => {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    return security.verifyToken(token);
  };

  const requireAuth = async () => {
    const u = await getUser();
    if (!u) throw { status: 401, message: '请先登录' };
    return u;
  };

  // ────────────────────────────────────────────────────────────────────────
  // FORUM SECTIONS
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/forum/sections' && method === 'GET') {
    const rows = await db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM posts p WHERE p.category_id=c.id AND p.review_status='approved') AS post_count,
           (SELECT p.title FROM posts p WHERE p.category_id=c.id ORDER BY p.created_at DESC LIMIT 1) AS latest_post_title
         FROM categories c
         WHERE c.is_visible=1
         ORDER BY c.sort_order ASC, c.id ASC`
      )
      .all();
    return jsonResponse(rows.results || []);
  }

  if (path === '/api/forum/sections' && method === 'POST') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    if (!body.name?.trim()) return jsonResponse({ error: '板块名称不能为空' }, 400);
    await db
      .prepare(
        `INSERT INTO categories (name,description,image_url,icon,color,sort_order,announcement)
         VALUES (?,?,?,?,?,?,?)`
      )
      .bind(
        body.name.trim(), body.description || '', body.image_url || '',
        body.icon || '', body.color || '#6366f1', body.sort_order || 0, body.announcement || ''
      )
      .run();
    return jsonResponse({ ok: true });
  }

  const sectionMatch = path.match(/^\/api\/forum\/sections\/(\d+)$/);
  if (sectionMatch) {
    const catId = parseInt(sectionMatch[1]);
    if (method === 'PUT') {
      const user = await requireAuth();
      if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
      const body: any = await request.json();
      await db
        .prepare(
          `UPDATE categories SET name=?,description=?,image_url=?,icon=?,color=?,
           sort_order=?,announcement=?,is_visible=? WHERE id=?`
        )
        .bind(
          body.name, body.description || '', body.image_url || '',
          body.icon || '', body.color || '#6366f1',
          body.sort_order || 0, body.announcement || '',
          body.is_visible ? 1 : 0, catId
        )
        .run();
      return jsonResponse({ ok: true });
    }
    if (method === 'DELETE') {
      const user = await requireAuth();
      if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
      await db.prepare('DELETE FROM categories WHERE id=?').bind(catId).run();
      return jsonResponse({ ok: true });
    }
  }

  // Section moderators
  const secModMatch = path.match(/^\/api\/forum\/sections\/(\d+)\/moderators$/);
  if (secModMatch) {
    const catId = parseInt(secModMatch[1]);
    if (method === 'GET') {
      const rows = await db
        .prepare(
          `SELECT cm.*,u.username,u.avatar_url FROM category_moderators cm
           JOIN users u ON u.id=cm.user_id WHERE cm.category_id=?`
        )
        .bind(catId).all();
      return jsonResponse(rows.results || []);
    }
    if (method === 'POST') {
      const user = await requireAuth();
      if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
      const body: any = await request.json();
      await db
        .prepare(
          `INSERT OR REPLACE INTO category_moderators (category_id,user_id,level,granted_by)
           VALUES (?,?,?,?)`
        )
        .bind(catId, body.user_id, body.level || 'sub_mod', user.id)
        .run();
      return jsonResponse({ ok: true });
    }
  }

  const secModDelMatch = path.match(/^\/api\/forum\/sections\/(\d+)\/moderators\/(\d+)$/);
  if (secModDelMatch && method === 'DELETE') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    await db
      .prepare('DELETE FROM category_moderators WHERE category_id=? AND user_id=?')
      .bind(parseInt(secModDelMatch[1]), parseInt(secModDelMatch[2]))
      .run();
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // USER PROFILES
  // ────────────────────────────────────────────────────────────────────────

  const profileMatch = path.match(/^\/api\/users\/([^/]+)\/profile$/);
  if (profileMatch && method === 'GET') {
    const uidOrId = profileMatch[1];
    const row = await db
      .prepare(
        `SELECT id,uid,username,nickname,avatar_url,bio,signature,custom_link,
                role,display_role,coin_balance,follower_count,following_count,
                post_count,comment_count,created_at
         FROM users WHERE uid=? OR id=?`
      )
      .bind(uidOrId, isNaN(Number(uidOrId)) ? -1 : Number(uidOrId))
      .first();
    if (!row) return jsonResponse({ error: '用户不存在' }, 404);

    const currentUser = await getUser();
    let isFollowing = false;
    if (currentUser) {
      const f = await db
        .prepare('SELECT id FROM follows WHERE follower_id=? AND following_id=?')
        .bind(currentUser.id, row.id)
        .first();
      isFollowing = !!f;
    }
    return jsonResponse({ ...row, isFollowing });
  }

  const userPostsMatch = path.match(/^\/api\/users\/([^/]+)\/posts$/);
  if (userPostsMatch && method === 'GET') {
    const uidOrId = userPostsMatch[1];
    const user = await db
      .prepare('SELECT id FROM users WHERE uid=? OR id=?')
      .bind(uidOrId, isNaN(Number(uidOrId)) ? -1 : Number(uidOrId))
      .first<{ id: number }>();
    if (!user) return jsonResponse({ error: '用户不存在' }, 404);

    const offset = parseInt(url.searchParams.get('offset') || '0');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

    const posts = await db
      .prepare(
        `SELECT p.*,c.name AS category_name,
           (SELECT COUNT(*) FROM likes WHERE post_id=p.id) AS like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id=p.id) AS comment_count
         FROM posts p
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE p.author_id=? AND p.review_status='approved' AND p.is_hidden=0
         ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(user.id, limit, offset)
      .all();
    const total = await db
      .prepare("SELECT COUNT(*) AS n FROM posts WHERE author_id=? AND review_status='approved'")
      .bind(user.id).first<{ n: number }>();
    return jsonResponse({ posts: posts.results || [], total: total?.n || 0 });
  }

  // ────────────────────────────────────────────────────────────────────────
  // FOLLOW SYSTEM
  // ────────────────────────────────────────────────────────────────────────

  const followMatch = path.match(/^\/api\/follow\/(\d+)$/);
  if (followMatch) {
    const targetId = parseInt(followMatch[1]);
    const user = await requireAuth();
    if (user.id === targetId) return jsonResponse({ error: '不能关注自己' }, 400);

    if (method === 'POST') {
      try {
        await db
          .prepare('INSERT INTO follows (follower_id,following_id) VALUES (?,?)')
          .bind(user.id, targetId)
          .run();
        await db
          .prepare('UPDATE users SET follower_count=follower_count+1 WHERE id=?')
          .bind(targetId).run();
        await db
          .prepare('UPDATE users SET following_count=following_count+1 WHERE id=?')
          .bind(user.id).run();
        const actor = await db.prepare('SELECT username FROM users WHERE id=?').bind(user.id).first<{ username: string }>();
        await createNotification(db, targetId, 'follow', user.id, 'user', user.id, `${actor?.username} 关注了你`);
      } catch { /* already following */ }
      return jsonResponse({ ok: true });
    }

    if (method === 'DELETE') {
      const r = await db
        .prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?')
        .bind(user.id, targetId).run();
      if (r.meta?.changes > 0) {
        await db
          .prepare('UPDATE users SET follower_count=MAX(0,follower_count-1) WHERE id=?')
          .bind(targetId).run();
        await db
          .prepare('UPDATE users SET following_count=MAX(0,following_count-1) WHERE id=?')
          .bind(user.id).run();
      }
      return jsonResponse({ ok: true });
    }

    if (method === 'GET' && path.endsWith('/status')) {
      const currentUser = await getUser();
      if (!currentUser) return jsonResponse({ following: false });
      const f = await db
        .prepare('SELECT id FROM follows WHERE follower_id=? AND following_id=?')
        .bind(currentUser.id, targetId).first();
      return jsonResponse({ following: !!f });
    }
  }

  const followStatusMatch = path.match(/^\/api\/follow\/(\d+)\/status$/);
  if (followStatusMatch && method === 'GET') {
    const targetId = parseInt(followStatusMatch[1]);
    const currentUser = await getUser();
    if (!currentUser) return jsonResponse({ following: false });
    const f = await db
      .prepare('SELECT id FROM follows WHERE follower_id=? AND following_id=?')
      .bind(currentUser.id, targetId).first();
    return jsonResponse({ following: !!f });
  }

  // ────────────────────────────────────────────────────────────────────────
  // BOOKMARKS
  // ────────────────────────────────────────────────────────────────────────

  const bookmarkMatch = path.match(/^\/api\/posts\/(\d+)\/bookmark$/);
  if (bookmarkMatch && method === 'POST') {
    const postId = parseInt(bookmarkMatch[1]);
    const user = await requireAuth();
    const existing = await db
      .prepare('SELECT id FROM bookmarks WHERE user_id=? AND post_id=?')
      .bind(user.id, postId).first();
    if (existing) {
      await db.prepare('DELETE FROM bookmarks WHERE user_id=? AND post_id=?').bind(user.id, postId).run();
      await db.prepare('UPDATE posts SET bookmark_count=MAX(0,bookmark_count-1) WHERE id=?').bind(postId).run();
      return jsonResponse({ bookmarked: false });
    } else {
      await db.prepare('INSERT INTO bookmarks (user_id,post_id) VALUES (?,?)').bind(user.id, postId).run();
      await db.prepare('UPDATE posts SET bookmark_count=bookmark_count+1 WHERE id=?').bind(postId).run();
      return jsonResponse({ bookmarked: true });
    }
  }

  if (path === '/api/me/bookmarks' && method === 'GET') {
    const user = await requireAuth();
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const rows = await db
      .prepare(
        `SELECT p.*,u.username AS author_name,bm.created_at AS bookmarked_at
         FROM bookmarks bm JOIN posts p ON p.id=bm.post_id
         JOIN users u ON u.id=p.author_id
         WHERE bm.user_id=? ORDER BY bm.created_at DESC LIMIT 20 OFFSET ?`
      )
      .bind(user.id, offset).all();
    return jsonResponse(rows.results || []);
  }

  // ────────────────────────────────────────────────────────────────────────
  // APPRECIATIONS (虚拟赞赏)
  // ────────────────────────────────────────────────────────────────────────

  const appreciateMatch = path.match(/^\/api\/posts\/(\d+)\/appreciate$/);
  if (appreciateMatch && method === 'POST') {
    const postId = parseInt(appreciateMatch[1]);
    const user = await requireAuth();
    const body: any = await request.json();
    const amount = Math.max(1, Math.min(100, parseInt(body.amount) || 1));

    const sender = await db
      .prepare('SELECT coin_balance FROM users WHERE id=?')
      .bind(user.id).first<{ coin_balance: number }>();
    if (!sender || sender.coin_balance < amount)
      return jsonResponse({ error: '硬币不足' }, 400);

    const post = await db
      .prepare('SELECT author_id FROM posts WHERE id=?')
      .bind(postId).first<{ author_id: number }>();
    if (!post) return jsonResponse({ error: '帖子不存在' }, 404);

    await db.prepare('UPDATE users SET coin_balance=coin_balance-? WHERE id=?').bind(amount, user.id).run();
    await db.prepare('UPDATE users SET coin_balance=coin_balance+? WHERE id=?').bind(amount, post.author_id).run();
    await db
      .prepare('INSERT INTO appreciations (sender_id,receiver_id,post_id,amount,message) VALUES (?,?,?,?,?)')
      .bind(user.id, post.author_id, postId, amount, body.message || '').run();

    const actor = await db.prepare('SELECT username FROM users WHERE id=?').bind(user.id).first<{ username: string }>();
    await createNotification(
      db, post.author_id, 'appreciation', user.id, 'post', postId,
      `${actor?.username} 赞赏了你 ${amount} 枚硬币`
    );
    return jsonResponse({ ok: true, amount });
  }

  // ────────────────────────────────────────────────────────────────────────
  // REPORTS
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/reports' && method === 'POST') {
    const user = await requireAuth();
    const body: any = await request.json();
    if (!['post', 'comment', 'user'].includes(body.target_type))
      return jsonResponse({ error: '举报目标类型无效' }, 400);
    if (!body.reason?.trim()) return jsonResponse({ error: '请填写举报原因' }, 400);
    await db
      .prepare(
        'INSERT INTO reports (reporter_id,target_type,target_id,reason,detail) VALUES (?,?,?,?,?)'
      )
      .bind(user.id, body.target_type, body.target_id, body.reason.trim(), body.detail || '')
      .run();
    return jsonResponse({ ok: true });
  }

  if (path === '/api/admin/reports' && method === 'GET') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const status = url.searchParams.get('status') || 'pending';
    const rows = await db
      .prepare(
        `SELECT r.*,u.username AS reporter_username
         FROM reports r JOIN users u ON u.id=r.reporter_id
         WHERE r.status=? ORDER BY r.created_at DESC LIMIT 50`
      )
      .bind(status).all();
    return jsonResponse(rows.results || []);
  }

  const reportResolveMatch = path.match(/^\/api\/admin\/reports\/(\d+)$/);
  if (reportResolveMatch && method === 'PUT') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    await db
      .prepare(
        `UPDATE reports SET status=?,resolved_by=?,resolved_at=CURRENT_TIMESTAMP,
         resolution_note=? WHERE id=?`
      )
      .bind(body.status, user.id, body.note || '', parseInt(reportResolveMatch[1]))
      .run();
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // MODERATION QUEUE
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/moderation/queue' && method === 'GET') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const status = url.searchParams.get('status') || 'pending_human';
    const rows = await db
      .prepare(
        `SELECT mq.*,u.username AS author_username
         FROM moderation_queue mq JOIN users u ON u.id=mq.author_id
         WHERE mq.status=? ORDER BY mq.created_at ASC LIMIT 50`
      )
      .bind(status).all();
    return jsonResponse(rows.results || []);
  }

  const modQueueMatch = path.match(/^\/api\/moderation\/queue\/(\d+)$/);
  if (modQueueMatch && method === 'PUT') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    const mqId = parseInt(modQueueMatch[1]);
    const mq = await db
      .prepare('SELECT * FROM moderation_queue WHERE id=?')
      .bind(mqId).first<any>();
    if (!mq) return jsonResponse({ error: '队列项不存在' }, 404);

    const decision = body.decision; // 'approved' | 'rejected'
    await db
      .prepare(
        `UPDATE moderation_queue SET status=?,reviewed_by=?,
         reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?`
      )
      .bind(decision, user.id, body.note || '', mqId).run();

    const table = mq.content_type === 'post' ? 'posts' : 'comments';
    await db
      .prepare(`UPDATE ${table} SET review_status=?,is_hidden=? WHERE id=?`)
      .bind(decision, decision === 'rejected' ? 1 : 0, mq.content_id)
      .run();

    // Notify author
    await createNotification(
      db, mq.author_id, decision === 'approved' ? 'post_approved' : 'post_rejected',
      user.id, mq.content_type, mq.content_id,
      decision === 'approved' ? '你的内容已通过审核' : `你的内容未通过审核：${body.note || ''}`
    );
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // EMOJI PACKS (Twikoo-compatible)
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/emoji/packs' && method === 'GET') {
    const rows = await db
      .prepare(
        `SELECT ep.*,COUNT(ei.id) AS item_count
         FROM emoji_packs ep LEFT JOIN emoji_items ei ON ei.pack_id=ep.id
         WHERE ep.is_active=1 GROUP BY ep.id ORDER BY ep.id`
      )
      .all();
    return jsonResponse(rows.results || []);
  }

  if (path === '/api/emoji/packs' && method === 'POST') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    await db
      .prepare(
        `INSERT INTO emoji_packs (name,description,cover_url,twikoo_url,created_by)
         VALUES (?,?,?,?,?)`
      )
      .bind(body.name, body.description || '', body.cover_url || '', body.twikoo_url || '', user.id)
      .run();
    return jsonResponse({ ok: true });
  }

  const emojiPackMatch = path.match(/^\/api\/emoji\/packs\/(\d+)\/items$/);
  if (emojiPackMatch) {
    const packId = parseInt(emojiPackMatch[1]);
    if (method === 'GET') {
      const rows = await db
        .prepare('SELECT * FROM emoji_items WHERE pack_id=? ORDER BY id')
        .bind(packId).all();
      return jsonResponse(rows.results || []);
    }
    if (method === 'POST') {
      const user = await requireAuth();
      if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
      const body: any = await request.json();
      await db
        .prepare('INSERT INTO emoji_items (pack_id,name,url,shortcode) VALUES (?,?,?,?)')
        .bind(packId, body.name, body.url, body.shortcode).run();
      return jsonResponse({ ok: true });
    }
  }

  // Proxy Twikoo emoji pack
  if (path === '/api/emoji/twikoo' && method === 'GET') {
    const packUrl = url.searchParams.get('url');
    if (!packUrl || !packUrl.startsWith('https://')) return jsonResponse({ error: '无效URL' }, 400);
    const res = await fetch(packUrl, { headers: { 'User-Agent': 'CForum/2.0' } });
    const data = await res.json();
    return jsonResponse(data);
  }

  // ────────────────────────────────────────────────────────────────────────
  // NOTIFICATIONS
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/notifications' && method === 'GET') {
    const user = await requireAuth();
    const rows = await db
      .prepare(
        `SELECT n.*,u.username AS actor_username,u.avatar_url AS actor_avatar
         FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
         WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50`
      )
      .bind(user.id).all();
    const unread = await db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0')
      .bind(user.id).first<{ n: number }>();
    return jsonResponse({ notifications: rows.results || [], unread: unread?.n || 0 });
  }

  if (path === '/api/notifications/read-all' && method === 'PUT') {
    const user = await requireAuth();
    await db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').bind(user.id).run();
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // CUSTOM LINK REQUESTS
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/me/custom-link' && method === 'POST') {
    const user = await requireAuth();
    const body: any = await request.json();
    const linkUrl = body.url?.trim();
    if (!linkUrl) return jsonResponse({ error: 'URL不能为空' }, 400);
    try { new URL(linkUrl); } catch { return jsonResponse({ error: '无效的URL格式' }, 400); }

    await db
      .prepare(
        `INSERT INTO link_requests (user_id,url,label) VALUES (?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET url=excluded.url,label=excluded.label,
         status='pending',reviewed_by=NULL,reviewed_at=NULL`
      )
      .bind(user.id, linkUrl, body.label || '').run();
    return jsonResponse({ ok: true, message: '链接已提交审核' });
  }

  if (path === '/api/admin/link-requests' && method === 'GET') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const rows = await db
      .prepare(
        `SELECT lr.*,u.username,u.email FROM link_requests lr
         JOIN users u ON u.id=lr.user_id WHERE lr.status='pending'
         ORDER BY lr.created_at ASC LIMIT 50`
      )
      .all();
    return jsonResponse(rows.results || []);
  }

  const linkReviewMatch = path.match(/^\/api\/admin\/link-requests\/(\d+)\/review$/);
  if (linkReviewMatch && method === 'POST') {
    const user = await requireAuth();
    if (!isModOrAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    const lr = await db
      .prepare('SELECT * FROM link_requests WHERE id=?')
      .bind(parseInt(linkReviewMatch[1])).first<any>();
    if (!lr) return jsonResponse({ error: '请求不存在' }, 404);

    await db
      .prepare(
        `UPDATE link_requests SET status=?,reviewed_by=?,
         reviewed_at=CURRENT_TIMESTAMP,reject_reason=? WHERE id=?`
      )
      .bind(body.approved ? 'approved' : 'rejected', user.id, body.reason || '', lr.id)
      .run();

    if (body.approved) {
      await db
        .prepare('UPDATE users SET custom_link=?,custom_link_approved=1 WHERE id=?')
        .bind(lr.url, lr.user_id).run();
    }
    await createNotification(
      db, lr.user_id, body.approved ? 'post_approved' : 'post_rejected',
      user.id, 'user', lr.user_id,
      body.approved ? '你的自定义链接已通过审核' : `自定义链接审核未通过：${body.reason || ''}`
    );
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // CAPTCHA (Math / Image)
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/captcha' && method === 'GET') {
    const type = url.searchParams.get('type') || 'math';
    const id = crypto.randomUUID();

    if (type === 'math') {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const ops = ['+', '-', '*'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      let answer: number;
      if (op === '+') answer = a + b;
      else if (op === '-') answer = a - b;
      else answer = a * b;

      const expiresAt = Math.floor(Date.now() / 1000) + 300;
      await db
        .prepare('INSERT INTO captcha_store (id,answer,type,expires_at) VALUES (?,?,?,?)')
        .bind(id, String(answer), 'math', expiresAt).run();

      return jsonResponse({ id, question: `${a} ${op} ${b} = ?`, type: 'math' });
    }
    return jsonResponse({ error: '不支持的验证码类型' }, 400);
  }

  // ────────────────────────────────────────────────────────────────────────
  // EXTENDED ADMIN SETTINGS
  // ────────────────────────────────────────────────────────────────────────

  const EXTENDED_SETTINGS_KEYS = [
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'smtp_from_name',
    'bg_image_api', 'bg_image_fixed',
    'ai_moderation_enabled', 'ai_moderation_provider', 'ai_moderation_endpoint',
    'ai_threshold_auto_approve', 'ai_threshold_human_review',
    'captcha_type', 'registration_open', 'require_email_verify',
    'e2e_enabled', 'e2e_server_public_key',
    'forum_name', 'forum_description', 'forum_logo_url', 'footer_text', 'theme_accent_color',
    'post_review_enabled', 'comment_review_enabled',
    'api_enabled', 'api_rate_limit',
    'twikoo_emoji_enabled', 'twikoo_emoji_url',
  ];

  if (path === '/api/admin/settings/extended' && method === 'GET') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const result: Record<string, string> = {};
    for (const k of EXTENDED_SETTINGS_KEYS) {
      const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(k).first<{ value: string }>();
      result[k] = row?.value || '';
    }
    return jsonResponse(result);
  }

  if (path === '/api/admin/settings/extended' && method === 'POST') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const body: any = await request.json();
    const stmts = [];
    for (const k of EXTENDED_SETTINGS_KEYS) {
      if (k in body) {
        // Never store SMTP pass or AI key in plaintext here – those must be Wrangler secrets
        if (k === 'smtp_pass_encrypted' || k === 'ai_moderation_key') continue;
        stmts.push(
          db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind(k, String(body[k]))
        );
      }
    }
    await db.batch(stmts);
    return jsonResponse({ ok: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // ONE-TIME UID MIGRATION
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/admin/migrate/generate-uids' && method === 'POST') {
    const user = await requireAuth();
    if (!isSuperAdmin(user.role)) return jsonResponse({ error: '权限不足' }, 403);
    const users = await db
      .prepare('SELECT id FROM users WHERE uid IS NULL OR uid=""')
      .all<{ id: number }>();
    let count = 0;
    for (const u of users.results || []) {
      const uid = 'u' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await db.prepare('UPDATE users SET uid=? WHERE id=?').bind(uid, u.id).run();
      count++;
    }
    return jsonResponse({ ok: true, updated: count });
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC CONFIG (background api, e2e key, forum info)
  // ────────────────────────────────────────────────────────────────────────

  if (path === '/api/config/extended' && method === 'GET') {
    const keys = ['bg_image_api', 'bg_image_fixed', 'e2e_enabled', 'e2e_server_public_key',
      'forum_name', 'forum_description', 'forum_logo_url', 'footer_text', 'theme_accent_color',
      'twikoo_emoji_enabled', 'twikoo_emoji_url', 'captcha_type', 'registration_open'];
    const result: Record<string, string> = {};
    for (const k of keys) {
      const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(k).first<{ value: string }>();
      result[k] = row?.value || '';
    }
    return jsonResponse(result);
  }

  // Not handled here
  return null;
}
