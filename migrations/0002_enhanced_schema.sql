-- ============================================================
-- CForum Enhanced Schema v2 - Feature Completion Migration
-- Run after 0001_initial_schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. EXTEND USERS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS uid TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_link TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_link_approved INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_link_pending TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS post_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;
-- Role expansion: 'user' | 'moderator' | 'super_admin' (admin kept for compat)
-- sub_moderator is stored in category_moderators table
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_role TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_public_key TEXT;  -- Client-side E2E public key

-- ────────────────────────────────────────────────────────────
-- 2. EXTEND CATEGORIES TABLE (Forum Sections)
-- ────────────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_visible INTEGER DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS announcement_post_id INTEGER;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS post_count INTEGER DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- 3. EXTEND POSTS TABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_urls TEXT DEFAULT '[]';   -- JSON array of image keys
ALTER TABLE posts ADD COLUMN IF NOT EXISTS bookmark_count INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_locked INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_hidden INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';
  -- 'pending' | 'approved' | 'rejected' | 'ai_flagged' | 'manual_review'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_label TEXT DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_reason TEXT DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_comment_at TIMESTAMP;

-- ────────────────────────────────────────────────────────────
-- 4. EXTEND COMMENTS TABLE (Floor-style like Bilibili)
-- ────────────────────────────────────────────────────────────
ALTER TABLE comments ADD COLUMN IF NOT EXISTS floor_number INTEGER;       -- sequential floor #
ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS image_urls TEXT DEFAULT '[]';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_hidden INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS review_label TEXT DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_encrypted INTEGER DEFAULT 0;  -- E2E encrypted content
ALTER TABLE comments ADD COLUMN IF NOT EXISTS encryption_hint TEXT;            -- key hint for client

-- ────────────────────────────────────────────────────────────
-- 5. FOLLOWS SYSTEM
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ────────────────────────────────────────────────────────────
-- 6. BOOKMARKS / COLLECTIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

-- ────────────────────────────────────────────────────────────
-- 7. APPRECIATIONS (赞赏 / Tips) - Virtual points only
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appreciations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  post_id INTEGER,
  amount INTEGER NOT NULL DEFAULT 1,   -- virtual points
  message TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_appreciations_receiver ON appreciations(receiver_id);

-- Virtual coin balance per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS coin_balance INTEGER DEFAULT 100;

-- ────────────────────────────────────────────────────────────
-- 8. COMMENT LIKES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- 9. REPORTS CHANNEL
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,   -- 'post' | 'comment' | 'user'
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',  -- 'pending' | 'resolved' | 'dismissed'
  resolved_by INTEGER,
  resolved_at TIMESTAMP,
  resolution_note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

-- ────────────────────────────────────────────────────────────
-- 10. CATEGORY MODERATORS (Sub/Section Moderators)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS category_moderators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  level TEXT DEFAULT 'sub_mod',  -- 'mod' | 'sub_mod'
  granted_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, user_id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- 11. MODERATION QUEUE (AI + Manual Review)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,   -- 'post' | 'comment'
  content_id INTEGER NOT NULL,
  content_text TEXT NOT NULL,   -- snapshot for review
  author_id INTEGER NOT NULL,
  ai_score REAL,                -- 0.0–1.0 risk score
  ai_labels TEXT DEFAULT '[]',  -- JSON array of labels
  ai_reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending_ai',
  -- 'pending_ai' | 'pending_human' | 'approved' | 'rejected'
  assigned_to INTEGER,          -- moderator user_id
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  review_note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_modq_status ON moderation_queue(status);
CREATE INDEX IF NOT EXISTS idx_modq_content ON moderation_queue(content_type, content_id);

-- ────────────────────────────────────────────────────────────
-- 12. CUSTOM EMOJI (Twikoo-compatible)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emoji_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  twikoo_url TEXT DEFAULT '',  -- Twikoo emoji pack JSON URL
  is_builtin INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emoji_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,           -- image URL or Twikoo link
  shortcode TEXT NOT NULL,     -- :shortcode:
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pack_id) REFERENCES emoji_packs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_emoji_shortcode ON emoji_items(shortcode);

-- ────────────────────────────────────────────────────────────
-- 13. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  -- 'comment' | 'like' | 'follow' | 'appreciation' | 'mention'
  -- | 'report_resolved' | 'post_approved' | 'post_rejected'
  actor_id INTEGER,
  ref_type TEXT,     -- 'post' | 'comment' | 'user'
  ref_id INTEGER,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read);

-- ────────────────────────────────────────────────────────────
-- 14. CUSTOM LINK REQUESTS (审核)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS link_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  label TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  reject_reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- 15. CAPTCHA STORE (Math / Image CAPTCHA)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS captcha_store (
  id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  type TEXT DEFAULT 'math',  -- 'math' | 'image'
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- 16. EXPAND SETTINGS with new keys
-- ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO settings (key, value) VALUES
  -- SMTP
  ('smtp_host', ''),
  ('smtp_port', '465'),
  ('smtp_user', ''),
  ('smtp_pass_encrypted', ''),
  ('smtp_from', ''),
  ('smtp_from_name', '论坛管理员'),
  -- Background
  ('bg_image_api', ''),         -- random bg api URL, blank = default
  ('bg_image_fixed', ''),       -- fixed bg override
  -- AI Moderation
  ('ai_moderation_enabled', '0'),
  ('ai_moderation_key', ''),    -- API key (encrypted at rest)
  ('ai_moderation_provider', 'openai'),  -- 'openai' | 'custom'
  ('ai_moderation_endpoint', 'https://api.openai.com/v1/moderations'),
  ('ai_threshold_auto_approve', '0.2'),
  ('ai_threshold_human_review', '0.6'),
  -- Registration
  ('captcha_type', 'turnstile'),  -- 'turnstile' | 'math' | 'image' | 'none'
  ('registration_open', '1'),
  ('require_email_verify', '1'),
  -- E2E Encryption
  ('e2e_enabled', '0'),
  ('e2e_server_public_key', ''),  -- ECDH server public key (base64)
  -- Forum appearance
  ('forum_name', 'CForum'),
  ('forum_description', ''),
  ('forum_logo_url', ''),
  ('footer_text', ''),
  ('theme_accent_color', '#6366f1'),
  -- Post moderation
  ('post_review_enabled', '0'),    -- require review before publish
  ('comment_review_enabled', '0'),
  -- Open API
  ('api_enabled', '1'),
  ('api_rate_limit', '60'),        -- req/min per IP
  -- Twikoo emoji
  ('twikoo_emoji_enabled', '1'),
  ('twikoo_emoji_url', 'https://cdn.jsdelivr.net/gh/shuhaocode/Twikoo-emoji@main/');

-- ────────────────────────────────────────────────────────────
-- 17. INDEXES for performance
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_review ON posts(review_status);
CREATE INDEX IF NOT EXISTS idx_posts_category_last ON posts(category_id, last_comment_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_floor ON comments(post_id, floor_number);
CREATE INDEX IF NOT EXISTS idx_modq_assigned ON moderation_queue(assigned_to, status);

-- ────────────────────────────────────────────────────────────
-- 18. GENERATE UIDs FOR EXISTING USERS (idempotent)
-- ────────────────────────────────────────────────────────────
-- This must be run via a one-time script; D1 doesn't support
-- UPDATE with RANDOM UUID in SQL directly.
-- Use the admin endpoint /api/admin/migrate/generate-uids instead.
