import * as React from 'react';
import { Bell, BellOff, Check, Heart, MessageCircle, UserPlus, Award, AlertCircle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { apiFetch, formatDate, getSecurityHeaders } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface Notification {
	id: number;
	type: string;
	actor_id: number | null;
	actor_name?: string;
	ref_type: string;
	ref_id: number;
	message: string;
	is_read: number;
	created_at: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
	like: <Heart className="h-4 w-4 text-rose-500" />,
	comment: <MessageCircle className="h-4 w-4 text-blue-500" />,
	follow: <UserPlus className="h-4 w-4 text-green-500" />,
	appreciation: <Award className="h-4 w-4 text-amber-500" />,
	post_approved: <Check className="h-4 w-4 text-green-500" />,
	post_rejected: <AlertCircle className="h-4 w-4 text-destructive" />,
	report_resolved: <Check className="h-4 w-4 text-muted-foreground" />,
};

export function NotificationsPage() {
	const token = getToken();
	const user = React.useMemo(() => getUser(), [token]);
	const [notifs, setNotifs] = React.useState<Notification[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [markingAll, setMarkingAll] = React.useState(false);

	React.useEffect(() => {
		if (!token) { window.location.href = '/login'; return; }
		load();
	}, [token]);

	async function load() {
		setLoading(true);
		try {
			const data = await apiFetch<Notification[]>('/notifications', { headers: getSecurityHeaders('GET') });
			setNotifs(Array.isArray(data) ? data : []);
		} catch {
		} finally {
			setLoading(false);
		}
	}

	async function markAllRead() {
		setMarkingAll(true);
		try {
			await apiFetch('/notifications/read-all', { method: 'PUT', headers: getSecurityHeaders('PUT') });
			setNotifs(n => n.map(x => ({ ...x, is_read: 1 })));
		} catch {}
		setMarkingAll(false);
	}

	function getHref(n: Notification) {
		if (n.ref_type === 'post') return `/post?id=${n.ref_id}`;
		if (n.ref_type === 'user') return `/profile?uid=${n.ref_id}`;
		return '#';
	}

	const unread = notifs.filter(n => !n.is_read).length;

	return (
		<PageShell currentUser={user}>
			<div className="mx-auto max-w-2xl px-4 py-8">
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-2">
						<Bell className="h-5 w-5 text-primary" />
						<h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Serif SC', serif" }}>通知</h1>
						{unread > 0 && (
							<span className="badge badge-primary">{unread}</span>
						)}
					</div>
					{unread > 0 && (
						<button
							className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
							onClick={markAllRead}
							disabled={markingAll}
						>
							<Check className="h-3.5 w-3.5" />
							全部标为已读
						</button>
					)}
				</div>

				{loading && (
					<div className="space-y-3">
						{[1,2,3].map(i => (
							<div key={i} className="card-elevated p-4 flex gap-3">
								<div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
								<div className="flex-1 space-y-2">
									<div className="skeleton h-4 w-3/4" />
									<div className="skeleton h-3 w-1/3" />
								</div>
							</div>
						))}
					</div>
				)}

				{!loading && notifs.length === 0 && (
					<div className="text-center py-16">
						<BellOff className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
						<p className="text-muted-foreground">暂无通知</p>
					</div>
				)}

				{!loading && notifs.length > 0 && (
					<div className="space-y-2">
						{notifs.map(n => (
							<a
								key={n.id}
								href={getHref(n)}
								className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-150 ${
									n.is_read
										? 'border-border/50 bg-card hover:bg-muted/30'
										: 'border-primary/20 bg-primary/5'
								}`}
							>
								<div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
									{TYPE_ICON[n.type] || <Bell className="h-4 w-4 text-muted-foreground" />}
								</div>
								<div className="flex-1 min-w-0">
									<p className={`text-sm ${n.is_read ? 'text-foreground/80' : 'text-foreground font-medium'}`}>
										{n.message}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{formatDate(n.created_at)}
									</p>
								</div>
								{!n.is_read && (
									<div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
								)}
							</a>
						))}
					</div>
				)}
			</div>
		</PageShell>
	);
}
