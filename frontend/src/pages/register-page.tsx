import * as React from 'react';

import { TurnstileWidget } from '@/components/turnstile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';
import { UserPlus, Mail, Lock, User, MessageSquare, CheckCircle2 } from 'lucide-react';

export function RegisterPage() {
	const { config } = useConfig();
	const [email, setEmail] = React.useState('');
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [success, setSuccess] = React.useState('');

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}

		setLoading(true);
		try {
			const res = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/register', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					email,
					username,
					password,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
				throw new Error(data?.error || '注册失败');
			}
			setSuccess('注册成功！请前往邮箱完成验证后再登录。');
			setEmail('');
			setUsername('');
			setPassword('');
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
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
				<div className="absolute -top-40 -right-40 h-96 w-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, hsl(270 60% 65%), transparent)' }} />
				<div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, hsl(237 55% 65%), transparent)' }} />
			</div>

			<main className="relative flex flex-1 items-center justify-center px-4 py-12">
				<div className="w-full max-w-[420px]">
					{/* Logo */}
					<div className="mb-8 flex flex-col items-center gap-3">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg">
							<MessageSquare className="h-7 w-7 text-white" />
						</div>
						<div className="text-center">
							<h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Noto Serif SC', serif" }}>
								加入 CForum
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">创建您的账号，开始探索社区</p>
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

							{success ? (
								<div className="flex flex-col items-center gap-4 py-6 text-center">
									<div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
										<CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
									</div>
									<div>
										<p className="font-semibold text-foreground">注册成功！</p>
										<p className="mt-1 text-sm text-muted-foreground">{success}</p>
									</div>
									<a
										href="/login"
										className="btn-gradient mt-2 inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold"
									>
										前往登录
									</a>
								</div>
							) : (
								<form className="space-y-4" onSubmit={handleSubmit}>
									<div className="space-y-1.5">
										<Label htmlFor="register-username" className="text-sm font-medium">
											用户名 <span className="font-normal text-muted-foreground">(最多 20 字符)</span>
										</Label>
										<div className="relative">
											<User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												id="register-username"
												name="username"
												type="text"
												maxLength={20}
												value={username}
												onChange={(e) => setUsername(e.target.value)}
												placeholder="您的昵称"
												className="pl-9"
												required
											/>
										</div>
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="register-email" className="text-sm font-medium">邮箱</Label>
										<div className="relative">
											<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												id="register-email"
												name="email"
												type="email"
												autoComplete="email"
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												placeholder="your@email.com"
												className="pl-9"
												required
											/>
										</div>
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="register-password" className="text-sm font-medium">
											密码 <span className="font-normal text-muted-foreground">(8-16 字符)</span>
										</Label>
										<div className="relative">
											<Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
											<Input
												id="register-password"
												name="password"
												type="password"
												autoComplete="new-password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												placeholder="设置密码"
												className="pl-9"
												required
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
												<UserPlus className="h-4 w-4" />
												创建账号
											</>
										)}
									</button>
								</form>
							)}

							{!success && (
								<div className="mt-5 border-t border-border/50 pt-4 text-center text-sm">
									<span className="text-muted-foreground">已有账号？</span>
									{' '}
									<a href="/login" className="font-medium text-primary hover:underline">
										立即登录
									</a>
								</div>
							)}
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
