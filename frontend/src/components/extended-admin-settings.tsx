/**
 * CForum – Extended Admin Settings Panel
 * Drop this component into admin-page.tsx as a new tab section.
 * Renders SMTP config, AI moderation, forum branding, security,
 * captcha, background API, emoji, and more.
 */

import * as React from 'react';
import { Save, RefreshCw, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, getSecurityHeaders } from '@/lib/api';

interface ExtSettings {
  // SMTP
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_from: string;
  smtp_from_name: string;
  // Background
  bg_image_api: string;
  bg_image_fixed: string;
  // AI Moderation
  ai_moderation_enabled: string;
  ai_moderation_provider: string;
  ai_moderation_endpoint: string;
  ai_threshold_auto_approve: string;
  ai_threshold_human_review: string;
  // Registration / Captcha
  captcha_type: string;
  registration_open: string;
  require_email_verify: string;
  // E2E
  e2e_enabled: string;
  // Forum appearance
  forum_name: string;
  forum_description: string;
  forum_logo_url: string;
  footer_text: string;
  theme_accent_color: string;
  // Content moderation
  post_review_enabled: string;
  comment_review_enabled: string;
  // Open API
  api_enabled: string;
  api_rate_limit: string;
  // Twikoo emoji
  twikoo_emoji_enabled: string;
  twikoo_emoji_url: string;
}

type SectionKey = 'forum' | 'smtp' | 'captcha' | 'ai' | 'moderation' | 'background' | 'security' | 'api' | 'emoji';

function Section({
  title,
  sectionKey,
  active,
  onClick,
  children,
}: {
  title: string;
  sectionKey: SectionKey;
  active: SectionKey;
  onClick: (k: SectionKey) => void;
  children: React.ReactNode;
}) {
  const open = active === sectionKey;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex justify-between items-center px-4 py-3 bg-muted/30
                   hover:bg-muted/60 transition-colors text-left font-medium text-sm"
        onClick={() => onClick(open ? ('__none__' as any) : sectionKey)}
      >
        {title}
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

export function ExtendedAdminSettings() {
  const [settings, setSettings] = React.useState<Partial<ExtSettings>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [activeSection, setActiveSection] = React.useState<SectionKey>('forum');
  const [showSmtpPass, setShowSmtpPass] = React.useState(false);
  const [smtpTestLoading, setSmtpTestLoading] = React.useState(false);
  const [smtpTestResult, setSmtpTestResult] = React.useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<ExtSettings>('/admin/settings/extended', {
          headers: getSecurityHeaders('GET'),
        });
        setSettings(data);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function set<K extends keyof ExtSettings>(key: K, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function setBool(key: keyof ExtSettings, value: boolean) {
    set(key, value ? '1' : '0');
  }

  function boolVal(key: keyof ExtSettings) {
    return settings[key] === '1' || settings[key] === 'true';
  }

  async function save() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch('/admin/settings/extended', {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify(settings),
      });
      setSuccess('设置已保存');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function testSmtp() {
    setSmtpTestLoading(true);
    setSmtpTestResult('');
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>('/admin/test-smtp', {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify({}),
      });
      setSmtpTestResult(result.ok ? '✅ SMTP 测试成功' : `❌ ${result.message}`);
    } catch (e: any) {
      setSmtpTestResult(`❌ ${e?.message || e}`);
    } finally {
      setSmtpTestLoading(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      {(error || success) && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
          error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'
        }`}>
          {error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {error || success}
        </div>
      )}

      {/* ── Forum Appearance ─────────────────────────────────────────────── */}
      <Section title="🎨 论坛外观" sectionKey="forum" active={activeSection} onClick={setActiveSection}>
        <Field label="论坛名称"><Input value={settings.forum_name || ''} onChange={(e) => set('forum_name', e.target.value)} /></Field>
        <Field label="论坛描述"><Input value={settings.forum_description || ''} onChange={(e) => set('forum_description', e.target.value)} /></Field>
        <Field label="Logo URL"><Input value={settings.forum_logo_url || ''} placeholder="https://..." onChange={(e) => set('forum_logo_url', e.target.value)} /></Field>
        <Field label="页脚文字"><Input value={settings.footer_text || ''} onChange={(e) => set('footer_text', e.target.value)} /></Field>
        <Field label="主题色">
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={settings.theme_accent_color || '#6366f1'}
              onChange={(e) => set('theme_accent_color', e.target.value)}
              className="w-10 h-8 rounded cursor-pointer border border-border"
            />
            <Input
              value={settings.theme_accent_color || '#6366f1'}
              onChange={(e) => set('theme_accent_color', e.target.value)}
              className="w-32"
            />
          </div>
        </Field>
      </Section>

      {/* ── SMTP ─────────────────────────────────────────────────────────── */}
      <Section title="📧 SMTP 邮件配置" sectionKey="smtp" active={activeSection} onClick={setActiveSection}>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700
                        rounded-lg px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
          ⚠️ SMTP 密码请通过 Wrangler secrets 设置（<code>SMTP_PASS</code>），不要在此保存明文密码。
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SMTP 服务器"><Input value={settings.smtp_host || ''} placeholder="smtp.gmail.com" onChange={(e) => set('smtp_host', e.target.value)} /></Field>
          <Field label="端口"><Input value={settings.smtp_port || '465'} placeholder="465" onChange={(e) => set('smtp_port', e.target.value)} /></Field>
          <Field label="用户名"><Input value={settings.smtp_user || ''} placeholder="you@example.com" onChange={(e) => set('smtp_user', e.target.value)} /></Field>
          <Field label="发件人地址"><Input value={settings.smtp_from || ''} placeholder="noreply@example.com" onChange={(e) => set('smtp_from', e.target.value)} /></Field>
        </div>
        <Field label="发件人名称"><Input value={settings.smtp_from_name || ''} placeholder="论坛管理员" onChange={(e) => set('smtp_from_name', e.target.value)} /></Field>
        <div className="flex gap-2 items-center">
          <Button variant="outline" size="sm" onClick={testSmtp} disabled={smtpTestLoading}>
            {smtpTestLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
            测试 SMTP
          </Button>
          {smtpTestResult && <span className="text-sm">{smtpTestResult}</span>}
        </div>
      </Section>

      {/* ── Captcha ───────────────────────────────────────────────────────── */}
      <Section title="🛡️ 注册验证码" sectionKey="captcha" active={activeSection} onClick={setActiveSection}>
        <Field label="验证码类型">
          <select
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
            value={settings.captcha_type || 'turnstile'}
            onChange={(e) => set('captcha_type', e.target.value)}
          >
            <option value="turnstile">Cloudflare Turnstile（推荐）</option>
            <option value="math">数学算式验证码</option>
            <option value="none">关闭验证码（不推荐）</option>
          </select>
        </Field>
        <Toggle
          label="开放注册"
          checked={boolVal('registration_open')}
          onChange={(v) => setBool('registration_open', v)}
          description="关闭后，只有管理员能创建新账号"
        />
        <Toggle
          label="要求邮箱验证"
          checked={boolVal('require_email_verify')}
          onChange={(v) => setBool('require_email_verify', v)}
        />
      </Section>

      {/* ── AI Moderation ────────────────────────────────────────────────── */}
      <Section title="🤖 AI 内容审核" sectionKey="ai" active={activeSection} onClick={setActiveSection}>
        <Toggle
          label="启用 AI 审核"
          checked={boolVal('ai_moderation_enabled')}
          onChange={(v) => setBool('ai_moderation_enabled', v)}
          description="AI 判断内容风险，高风险转人工审核"
        />
        <Field label="AI 提供商">
          <select
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm"
            value={settings.ai_moderation_provider || 'openai'}
            onChange={(e) => set('ai_moderation_provider', e.target.value)}
          >
            <option value="openai">OpenAI Moderation API</option>
            <option value="custom">自定义接口</option>
          </select>
        </Field>
        <Field label="API Endpoint">
          <Input
            value={settings.ai_moderation_endpoint || 'https://api.openai.com/v1/moderations'}
            onChange={(e) => set('ai_moderation_endpoint', e.target.value)}
          />
        </Field>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700
                        rounded-lg px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300">
          AI API 密钥通过 Wrangler secret <code>AI_MODERATION_KEY</code> 设置。
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="自动通过阈值" description="低于此分数自动通过 (0–1)">
            <Input
              type="number" min="0" max="1" step="0.05"
              value={settings.ai_threshold_auto_approve || '0.2'}
              onChange={(e) => set('ai_threshold_auto_approve', e.target.value)}
            />
          </Field>
          <Field label="转人工阈值" description="高于此分数转人工 (0–1)">
            <Input
              type="number" min="0" max="1" step="0.05"
              value={settings.ai_threshold_human_review || '0.6'}
              onChange={(e) => set('ai_threshold_human_review', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* ── Content Moderation ───────────────────────────────────────────── */}
      <Section title="📋 发布审核" sectionKey="moderation" active={activeSection} onClick={setActiveSection}>
        <Toggle
          label="帖子发布需审核"
          checked={boolVal('post_review_enabled')}
          onChange={(v) => setBool('post_review_enabled', v)}
          description="新帖发布前需经 AI 或人工审核"
        />
        <Toggle
          label="评论发布需审核"
          checked={boolVal('comment_review_enabled')}
          onChange={(v) => setBool('comment_review_enabled', v)}
        />
      </Section>

      {/* ── Background ───────────────────────────────────────────────────── */}
      <Section title="🖼️ 背景图" sectionKey="background" active={activeSection} onClick={setActiveSection}>
        <Field
          label="随机背景 API URL"
          description="每次刷新从此 API 获取背景图，留空则使用默认背景"
        >
          <Input
            value={settings.bg_image_api || ''}
            placeholder="https://api.example.com/random-bg"
            onChange={(e) => set('bg_image_api', e.target.value)}
          />
        </Field>
        <Field
          label="固定背景图 URL"
          description="设置后覆盖随机背景"
        >
          <Input
            value={settings.bg_image_fixed || ''}
            placeholder="https://..."
            onChange={(e) => set('bg_image_fixed', e.target.value)}
          />
        </Field>
      </Section>

      {/* ── Security ─────────────────────────────────────────────────────── */}
      <Section title="🔐 端到端加密" sectionKey="security" active={activeSection} onClick={setActiveSection}>
        <Toggle
          label="启用 E2E 加密"
          checked={boolVal('e2e_enabled')}
          onChange={(v) => setBool('e2e_enabled', v)}
          description="允许用户发送端到端加密消息（使用 ECDH P-256 + AES-GCM）"
        />
        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
          <p>E2E 加密流程：</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>客户端生成 ECDH P-256 密钥对，私钥由用户密码派生密钥加密后存于本地</li>
            <li>公钥上传至服务器，用于其他用户加密消息</li>
            <li>服务器<strong>永远无法</strong>解密加密内容</li>
          </ul>
        </div>
      </Section>

      {/* ── Open API ─────────────────────────────────────────────────────── */}
      <Section title="🌐 Open API" sectionKey="api" active={activeSection} onClick={setActiveSection}>
        <Toggle
          label="启用 Open API"
          checked={boolVal('api_enabled')}
          onChange={(v) => setBool('api_enabled', v)}
          description="允许第三方 App 通过 /api/* 接入论坛"
        />
        <Field label="速率限制 (请求/分钟)">
          <Input
            type="number" min="1" max="600"
            value={settings.api_rate_limit || '60'}
            onChange={(e) => set('api_rate_limit', e.target.value)}
          />
        </Field>
      </Section>

      {/* ── Twikoo Emoji ─────────────────────────────────────────────────── */}
      <Section title="😀 Twikoo 表情" sectionKey="emoji" active={activeSection} onClick={setActiveSection}>
        <Toggle
          label="启用 Twikoo 表情"
          checked={boolVal('twikoo_emoji_enabled')}
          onChange={(v) => setBool('twikoo_emoji_enabled', v)}
        />
        <Field label="Twikoo CDN 基础URL">
          <Input
            value={settings.twikoo_emoji_url || ''}
            placeholder="https://cdn.jsdelivr.net/gh/..."
            onChange={(e) => set('twikoo_emoji_url', e.target.value)}
          />
        </Field>
      </Section>

      {/* Save */}
      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? (
          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />保存中...</>
        ) : (
          <><Save className="w-4 h-4 mr-2" />保存所有设置</>
        )}
      </Button>
    </div>
  );
}
