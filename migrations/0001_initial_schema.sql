PRAGMA foreign_keys = OFF;

-- ============================================================
-- CForum Complete Schema (v1+v2 Merged)
-- Single source of truth — 0002 has been removed
-- ============================================================

DROP TABLE IF EXISTS comment_likes;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS appreciations;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS category_moderators;
DROP TABLE IF EXISTS moderation_queue;
DROP TABLE IF EXISTS emoji_items;
DROP TABLE IF EXISTS emoji_packs;
DROP TABLE IF EXISTS link_requests;
DROP TABLE IF EXISTS captcha_store;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS nonces;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS audit_logs;

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  display_role TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  reset_token TEXT,
  reset_token_expires INTEGER,
  pending_email TEXT,
  email_change_token TEXT,
  avatar_url TEXT,
  nickname TEXT,
  email_notifications INTEGER DEFAULT 1,
  uid TEXT UNIQUE,
  signature TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  custom_link TEXT DEFAULT '',
  custom_link_approved INTEGER DEFAULT 0,
  custom_link_pending TEXT DEFAULT '',
  ban_reason TEXT,
  banned_until INTEGER,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  coin_balance INTEGER DEFAULT 100,
  e2e_public_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- CATEGORIES (Forum Sections)
-- ────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  announcement TEXT DEFAULT '',
  announcement_post_id INTEGER,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- POSTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id INTEGER,
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,
  image_urls TEXT DEFAULT '[]',
  review_status TEXT DEFAULT 'approved',
  review_label TEXT DEFAULT '',
  review_reason TEXT DEFAULT '',
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  last_comment_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- ────────────────────────────────────────────────────────────
-- COMMENTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  parent_id INTEGER,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  floor_number INTEGER,
  like_count INTEGER DEFAULT 0,
  image_urls TEXT DEFAULT '[]',
  is_hidden INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'approved',
  review_label TEXT DEFAULT '',
  is_encrypted INTEGER DEFAULT 0,
  encryption_hint TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (parent_id) REFERENCES comments(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- ────────────────────────────────────────────────────────────
-- LIKES (Post)
-- ────────────────────────────────────────────────────────────
CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ────────────────────────────────────────────────────────────
-- COMMENT LIKES
-- ────────────────────────────────────────────────────────────
CREATE TABLE comment_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- FOLLOWS
-- ────────────────────────────────────────────────────────────
CREATE TABLE follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ────────────────────────────────────────────────────────────
-- BOOKMARKS
-- ────────────────────────────────────────────────────────────
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);

-- ────────────────────────────────────────────────────────────
-- APPRECIATIONS (Virtual tips)
-- ────────────────────────────────────────────────────────────
CREATE TABLE appreciations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  post_id INTEGER,
  amount INTEGER NOT NULL DEFAULT 1,
  message TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
);
CREATE INDEX idx_appreciations_receiver ON appreciations(receiver_id);

-- ────────────────────────────────────────────────────────────
-- REPORTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  resolved_by INTEGER,
  resolved_at TIMESTAMP,
  resolution_note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

-- ────────────────────────────────────────────────────────────
-- CATEGORY MODERATORS
-- ────────────────────────────────────────────────────────────
CREATE TABLE category_moderators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  level TEXT DEFAULT 'sub_mod',
  granted_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_id, user_id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- MODERATION QUEUE
-- ────────────────────────────────────────────────────────────
CREATE TABLE moderation_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  content_text TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  ai_score REAL,
  ai_labels TEXT DEFAULT '[]',
  ai_reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending_ai',
  assigned_to INTEGER,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  review_note TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES users(id)
);
CREATE INDEX idx_modq_status ON moderation_queue(status);
CREATE INDEX idx_modq_content ON moderation_queue(content_type, content_id);
CREATE INDEX idx_modq_assigned ON moderation_queue(assigned_to, status);

-- ────────────────────────────────────────────────────────────
-- EMOJI PACKS
-- ────────────────────────────────────────────────────────────
CREATE TABLE emoji_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  twikoo_url TEXT DEFAULT '',
  is_builtin INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE emoji_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  shortcode TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pack_id) REFERENCES emoji_packs(id) ON DELETE CASCADE
);
CREATE INDEX idx_emoji_shortcode ON emoji_items(shortcode);

-- ────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor_id INTEGER,
  ref_type TEXT,
  ref_id INTEGER,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_notif_user_unread ON notifications(user_id, is_read);

-- ────────────────────────────────────────────────────────────
-- LINK REQUESTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE link_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  label TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  reject_reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
-- CAPTCHA STORE
-- ────────────────────────────────────────────────────────────
CREATE TABLE captcha_store (
  id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  type TEXT DEFAULT 'math',
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);

-- ────────────────────────────────────────────────────────────
-- SETTINGS
-- ────────────────────────────────────────────────────────────
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ────────────────────────────────────────────────────────────
-- NONCES
-- ────────────────────────────────────────────────────────────
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- ────────────────────────────────────────────────────────────
-- SESSIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  jti TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_posts_review ON posts(review_status);
CREATE INDEX idx_posts_category_last ON posts(category_id, last_comment_at DESC);
CREATE INDEX idx_comments_floor ON comments(post_id, floor_number);

-- ────────────────────────────────────────────────────────────
-- SETTINGS DEFAULTS
-- ────────────────────────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('turnstile_enabled', '0'),
  ('smtp_host', ''),
  ('smtp_port', '465'),
  ('smtp_user', ''),
  ('smtp_pass_encrypted', ''),
  ('smtp_from', ''),
  ('smtp_from_name', '论坛管理员'),
  ('bg_image_api', ''),
  ('bg_image_fixed', ''),
  ('ai_moderation_enabled', '0'),
  ('ai_moderation_key', ''),
  ('ai_moderation_provider', 'openai'),
  ('ai_moderation_endpoint', 'https://api.openai.com/v1/moderations'),
  ('ai_threshold_auto_approve', '0.2'),
  ('ai_threshold_human_review', '0.6'),
  ('captcha_type', 'turnstile'),
  ('registration_open', '1'),
  ('require_email_verify', '1'),
  ('e2e_enabled', '0'),
  ('e2e_server_public_key', ''),
  ('forum_name', 'CForum'),
  ('forum_description', ''),
  ('forum_logo_url', ''),
  ('footer_text', ''),
  ('theme_accent_color', '#6366f1'),
  ('post_review_enabled', '0'),
  ('comment_review_enabled', '0'),
  ('api_enabled', '1'),
  ('api_rate_limit', '60'),
  ('twikoo_emoji_enabled', '1'),
  ('twikoo_emoji_url', 'https://cdn.jsdelivr.net/gh/shuhaocode/Twikoo-emoji@main/');

-- ────────────────────────────────────────────────────────────
-- SEED DATA
-- ────────────────────────────────────────────────────────────
-- Admin: admin@adysec.com / Admin@123
INSERT INTO users (email, username, password, role, verified, nickname, uid) VALUES
  ('admin@adysec.com', 'Admin', 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7', 'admin', 1, 'System Admin', 'admin-001'),
  ('alice@example.com', 'Alice', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'user', 1, 'Alice Wonderland', 'alice-001'),
  ('bob@example.com', 'Bob', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'user', 0, NULL, 'bob-001');

INSERT INTO categories (name, description, color) VALUES
  ('General', '综合讨论', '#6366f1'),
  ('Tech', '技术交流', '#0ea5e9'),
  ('Random', '随机话题', '#f59e0b');

INSERT INTO posts (author_id, title, content, category_id) VALUES
  (1, 'Welcome to CForum', 'This is an official announcement from the admin.', 1),
  (2, 'Hello World', 'This is the first post by Alice!', 2);

PRAGMA foreign_keys = ON;
