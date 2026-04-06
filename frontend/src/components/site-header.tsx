import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getUser, logout, type User } from '@/lib/auth';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';
import { Home, LogIn, LogOut, Moon, Settings, Shield, Sun, Smile, User as UserIcon, UserPlus, MessageSquare } from 'lucide-react';

export function SiteHeader({
	currentUser,
	onLogout
}: {
	currentUser: User | null;
	onLogout?: () => void;
}) {
	const user = currentUser ?? getUser();
	const [theme, setTheme] = React.useState<Theme>(() => getTheme());

	React.useEffect(() => {
		function onThemeChange(e: Event) {
			const next = (e as CustomEvent).detail;
			if (next === 'light' || next === 'dark') setTheme(next);
		}
		window.addEventListener('theme-change', onThemeChange as any);
		setTheme(getTheme());
		return () => window.removeEventListener('theme-change', onThemeChange as any);
	}, []);

	return (
		<header className="site-header">
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
				{/* Logo + Left Nav */}
				<div className="flex items-center gap-1">
					{/* Logo */}
					<a
						href="/"
						className="mr-2 flex items-center gap-2 text-foreground"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shadow-sm">
							<MessageSquare className="h-4 w-4 text-white" />
						</div>
						<span className="hidden text-base font-bold tracking-tight sm:inline" style={{ fontFamily: "'Noto Serif SC', serif" }}>
							CForum
						</span>
					</a>

					<nav className="flex items-center gap-0.5">
						<a href="/" className="nav-link">
							<Home className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">主页</span>
						</a>
						<a href="/emoji-plaza" className="nav-link">
							<Smile className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">表情包</span>
						</a>
					</nav>
				</div>

				{/* Right Actions */}
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={toggleTheme}
						title="切换主题"
						className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
					>
						{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
					</button>

					{user ? (
						<>
							{/* Avatar + Name */}
							<div className="flex items-center gap-2 px-2">
								{user.avatar_url ? (
									<img
										src={user.avatar_url}
										alt=""
										className="h-7 w-7 rounded-full object-cover ring-2 ring-primary/20"
										loading="lazy"
										referrerPolicy="no-referrer"
									/>
								) : (
									<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
										<UserIcon className="h-3.5 w-3.5" />
									</span>
								)}
								<span className="hidden max-w-[100px] truncate text-sm font-medium text-foreground sm:inline">
									{user.username}
								</span>
								{(user.role === 'admin' || user.role === 'super_admin') && (
									<span className="badge badge-admin">
										<Shield className="h-2.5 w-2.5" />
										管理员
									</span>
								)}
							</div>

							<Separator orientation="vertical" className="h-5 opacity-50" />

							<a
								href="/profile?uid=me"
								title="个人主页"
								className="nav-link"
							>
								<UserIcon className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">主页</span>
							</a>

							{(user.role === 'admin' || user.role === 'super_admin') && (
								<a href="/admin" title="管理后台" className="nav-link">
									<Shield className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">管理</span>
								</a>
							)}

							<a href="/settings" title="设置" className="nav-link">
								<Settings className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">设置</span>
							</a>

							<Separator orientation="vertical" className="h-5 opacity-50" />

							<button
								type="button"
								title="退出"
								onClick={() => {
									logout();
									onLogout?.();
									window.location.href = '/';
								}}
								className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-destructive transition-all hover:bg-destructive/8 hover:bg-red-50 dark:hover:bg-red-950/30"
							>
								<LogOut className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">退出</span>
							</button>
						</>
					) : (
						<>
							<a
								href="/login"
								className="nav-link"
							>
								<LogIn className="h-3.5 w-3.5" />
								<span>登录</span>
							</a>
							<a
								href="/register"
								className="btn-gradient inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium"
							>
								<UserPlus className="h-3.5 w-3.5" />
								<span>注册</span>
							</a>
						</>
					)}
				</div>
			</div>
		</header>
	);
}
