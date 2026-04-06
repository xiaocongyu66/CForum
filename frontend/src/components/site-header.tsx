import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getUser, logout, type User } from '@/lib/auth';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';
import {
	Home, LogIn, LogOut, Moon, Settings, Shield, Sun, Smile,
	User as UserIcon, UserPlus, MessageSquare, LayoutGrid, Bell
} from 'lucide-react';

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
					<a href="/" className="mr-2 flex items-center gap-2 text-foreground">
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
						<a href="/sections" className="nav-link">
							<LayoutGrid className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">板块</span>
						</a>
						<a href="/emoji-plaza" className="nav-link">
							<Smile className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">表情包</span>
						</a>
					</nav>
				</div>

				{/* Right Actions */}
				<div className="flex items-center gap-1.5">
					{/* Notifications bell (logged in) */}
					{user && (
						<a
							href="/notifications"
							title="通知"
							className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
						>
							<Bell className="h-4 w-4" />
						</a>
					)}

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
							<a href={`/profile?uid=${user?.uid || user?.id}`} className="flex items-center gap-2 px-2 rounded-lg hover:bg-muted transition-colors">
								{user.avatar_url ? (
									<img
										src={user.avatar_url}
										alt=""
										className="h-7 w-7 rounded-full object-cover ring-2 ring-primary/20"
										loading="lazy"
										referrerPolicy="no-referrer"
									/>
								) : (
									<div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
										{(user.username || 'U')[0].toUpperCase()}
									</div>
								)}
								<span className="hidden text-sm font-medium sm:inline max-w-[100px] truncate">{user.username}</span>
							</a>

							<Separator orientation="vertical" className="h-5" />

							{(user.role === 'admin' || user.role === 'super_admin') && (
								<a
									href="/admin"
									title="管理后台"
									className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
								>
									<Shield className="h-4 w-4" />
								</a>
							)}

							<a
								href="/settings"
								title="设置"
								className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
							>
								<Settings className="h-4 w-4" />
							</a>

							<Button
								variant="ghost"
								size="sm"
								className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
								onClick={() => {
									logout();
									onLogout?.();
									window.location.href = '/login';
								}}
							>
								<LogOut className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">退出</span>
							</Button>
						</>
					) : (
						<>
							<Button variant="ghost" size="sm" className="h-8 gap-1.5" asChild>
								<a href="/login">
									<LogIn className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">登录</span>
								</a>
							</Button>
							<Button size="sm" className="h-8 gap-1.5 btn-gradient border-0" asChild>
								<a href="/register">
									<UserPlus className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">注册</span>
								</a>
							</Button>
						</>
					)}
				</div>
			</div>
		</header>
	);
}
