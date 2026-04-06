/**
 * CForum CAPTCHA Component
 * Supports: Cloudflare Turnstile | Math equation | Image text CAPTCHA
 */

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type CaptchaType = 'turnstile' | 'math' | 'none';

export interface CaptchaValue {
  type: CaptchaType;
  token?: string;    // Turnstile: turnstile token
  id?: string;       // Math: captcha id
  answer?: string;   // Math: user answer
}

interface CaptchaProps {
  type: CaptchaType;
  siteKey?: string;       // Turnstile site key
  onChange: (val: CaptchaValue) => void;
  onError?: (msg: string) => void;
}

// ─── Turnstile (re-export / thin wrapper) ────────────────────────────────────
// Requires the existing <TurnstileWidget> in your codebase.
// Just re-use it wrapped.

// ─── Math CAPTCHA Component ──────────────────────────────────────────────────
function MathCaptcha({ onChange }: { onChange: (val: CaptchaValue) => void }) {
  const [question, setQuestion] = React.useState('');
  const [captchaId, setCaptchaId] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setAnswer('');
    try {
      const data = await apiFetch<{ id: string; question: string }>('/captcha?type=math');
      setQuestion(data.question);
      setCaptchaId(data.id);
    } catch {
      setQuestion('加载失败，请刷新');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  React.useEffect(() => {
    onChange({ type: 'math', id: captchaId, answer });
  }, [captchaId, answer, onChange]);

  return (
    <div className="space-y-2">
      <Label>验证码</Label>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 bg-muted rounded-md px-4 py-2 font-mono text-lg select-none
                     border border-border tracking-widest text-center"
          style={{ letterSpacing: '0.15em', minWidth: 140 }}
          aria-label="math captcha question"
        >
          {loading ? '...' : question}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={load}
          disabled={loading}
          aria-label="刷新验证码"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <Input
        type="text"
        inputMode="numeric"
        placeholder="请输入计算结果"
        value={answer}
        onChange={(e) => setAnswer(e.target.value.trim())}
        autoComplete="off"
        maxLength={10}
      />
    </div>
  );
}

// ─── Main CaptchaWidget ──────────────────────────────────────────────────────

export function CaptchaWidget({ type, siteKey, onChange }: CaptchaProps) {
  if (type === 'none') return null;

  if (type === 'math') {
    return <MathCaptcha onChange={onChange} />;
  }

  // Turnstile – dynamic load
  if (type === 'turnstile') {
    // Lazy-load turnstile script
    React.useEffect(() => {
      if (document.getElementById('cf-turnstile-script')) return;
      const s = document.createElement('script');
      s.id = 'cf-turnstile-script';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      document.head.appendChild(s);
    }, []);

    const containerRef = React.useRef<HTMLDivElement>(null);
    const widgetId = React.useRef<string | null>(null);

    React.useEffect(() => {
      if (!siteKey || !containerRef.current) return;
      let mounted = true;

      const tryRender = () => {
        const w = (window as any).turnstile;
        if (!w || !containerRef.current || !mounted) return;
        widgetId.current = w.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => onChange({ type: 'turnstile', token }),
          'error-callback': () => onChange({ type: 'turnstile', token: '' }),
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        });
      };

      const interval = setInterval(() => {
        if ((window as any).turnstile) { clearInterval(interval); tryRender(); }
      }, 200);

      return () => {
        mounted = false;
        clearInterval(interval);
        if (widgetId.current && (window as any).turnstile) {
          try { (window as any).turnstile.remove(widgetId.current); } catch { /* */ }
        }
      };
    }, [siteKey, onChange]);

    return <div ref={containerRef} className="my-2" />;
  }

  return null;
}

// ─── Validator helper ────────────────────────────────────────────────────────

export async function validateCaptcha(val: CaptchaValue): Promise<{ ok: boolean; error?: string }> {
  if (val.type === 'none') return { ok: true };

  if (val.type === 'turnstile') {
    if (!val.token) return { ok: false, error: '请完成人机验证' };
    return { ok: true };
  }

  if (val.type === 'math') {
    if (!val.id || !val.answer) return { ok: false, error: '请完成验证码' };
    return { ok: true };  // Server-side validated on submit
  }

  return { ok: true };
}
