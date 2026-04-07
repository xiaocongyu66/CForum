import * as React from 'react';

import { TurnstileWidget } from '@/components/turnstile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';
import { setToken, setUser } from '@/lib/auth';
import { LogIn, Mail, Lock, KeyRound, MessageSquare } from 'lucide-react';

export function LoginPage() {
	const { config } = useConfig();
	const [email, setEmail] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [totpCode, setTotpCode] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}
		setLoading(true);
		try {
			const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/login', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					email,
					password,
					totp_code: totpCode,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
				if (data?.error === 'TOTP_REQUIRED') {
					setError('请输入 2FA 验证码');
					return;
				}
				throw new Error(data?.error || '登录失败');
			}

			setUser(data.user);
			setToken(data.token);
			window.location.href = '/';
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-dvh flex flex-col" style={{ background: 'linear-gradient(135deg, hsl(237 55% 97%) 0%, hsl(270 60% 97%) 50%, hsl(36 22% 97%) 100%)' }}>
			{/* Decorative background */}
			<div className="pointer-events-none fixed inset-0 overflow-hidden">
				<div className="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(237 55% 65%), transparent)' }} />
				<div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, hsl(270 60% 65%), transparent)' }} />
			</div>

			<main className="relative flex flex-1 items-center justify-center px-4 py-12">
				<div className="w-full max-w-[400px]">
					{/* Logo */}
					<div className="mb-8 flex flex-col items-center gap-3">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg">
							<MessageSquare className="h-7 w-7 text-white" />
						</div>
						<div className="text-center">
							<h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Noto Serif SC', serif" }}>
								欢迎回来
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">登录您的 CForum 账号</p>
						</div>
					</div>

					<div className="form-card">
						<div className="form-card-body">
							{error && (
								<div className="mb-5 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
									<span className="mt-0.5 text-base leading-none">⚠</span>
									<span>{error}</span>
								</div>
							)}

							<form className="space-y-4" onSubmit={handleSubmit}>
								<div className="space-y-1.5">
									<Label htmlFor="login-email" className="text-sm font-medium">邮箱</Label>
									<div className="relative">
										<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="login-email"
											name="email"
											type="email"
											autoComplete="username"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											placeholder="your@email.com"
											className="pl-9"
											required
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="login-password" className="text-sm font-medium">密码</Label>
									<div className="relative">
										<Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="login-password"
											name="password"
											type="password"
											autoComplete="current-password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											placeholder="••••••••"
											className="pl-9"
											required
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="login-totp" className="text-sm font-medium text-muted-foreground">
										双重验证码 <span className="font-normal opacity-70">(若已开启)</span>
									</Label>
									<div className="relative">
										<KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
										<Input
											id="login-totp"
											name="totp_code"
											type="text"
											inputMode="numeric"
											pattern="\d*"
											maxLength={6}
											placeholder="6位数字（选填）"
											autoComplete="one-time-code"
											value={totpCode}
											onChange={(e) => setTotpCode(e.target.value)}
											className="pl-9"
										/>
									</div>
								</div>

								<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

								<button
									type="submit"
									disabled={loading}
									className="btn-gradient mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{loading ? (
										<>
											<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
											处理中...
										</>
									) : (
										<>
											<LogIn className="h-4 w-4" />
											登录
										</>
									)}
								</button>
							</form>

							<div className="mt-5 flex items-center justify-between border-t border-border/50 pt-4 text-sm">
								<a href="/register" className="font-medium text-primary hover:underline">
									没有账号？注册
								</a>
								<a href="/forgot" className="text-muted-foreground hover:text-foreground hover:underline">
									忘记密码？
								</a>
							</div>
						</div>
					</div>

					<p className="mt-6 text-center text-xs text-muted-foreground">
						由 Cloudflare Workers & Pages 驱动
					</p>
				</div>
			</main>
		</div>
	);
}
