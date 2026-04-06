import * as React from 'react';
import { BookOpen, ChevronRight, Hash, MessageCircle, Pin } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { apiFetch, getSecurityHeaders } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface Section {
	id: number;
	name: string;
	description: string;
	image_url: string;
	icon: string;
	color: string;
	announcement: string;
	post_count: number;
}

function SectionCard({ section }: { section: Section }) {
	const color = section.color || '#6366f1';
	return (
		<a
			href={`/?category_id=${section.id}`}
			className="block group card-post p-0 overflow-hidden"
			style={{ borderRadius: '12px' }}
		>
			<div
				className="relative h-28 overflow-hidden flex items-end"
				style={{
					background: section.image_url
						? `url(${section.image_url}) center/cover`
						: `linear-gradient(135deg, ${color}22, ${color}55)`,
				}}
			>
				<div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
				{section.announcement && (
					<div className="relative z-10 flex items-center gap-1.5 px-3 pb-2 text-white text-xs font-medium">
						<Pin className="h-3 w-3 flex-shrink-0" />
						<span className="truncate">{section.announcement}</span>
					</div>
				)}
			</div>
			<div className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
							<h3 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
								{section.icon && <span className="mr-1">{section.icon}</span>}
								{section.name}
							</h3>
						</div>
						{section.description && (
							<p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{section.description}</p>
						)}
					</div>
					<ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
				</div>
				<div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-border/50">
					<span className="flex items-center gap-1 text-xs text-muted-foreground">
						<MessageCircle className="h-3 w-3" />
						{section.post_count ?? 0} 帖
					</span>
				</div>
			</div>
		</a>
	);
}

export function SectionsPage() {
	const token = getToken();
	const user = React.useMemo(() => getUser(), [token]);
	const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

	const [sections, setSections] = React.useState<Section[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState('');
	const [showForm, setShowForm] = React.useState(false);
	const [formName, setFormName] = React.useState('');
	const [formDesc, setFormDesc] = React.useState('');
	const [formColor, setFormColor] = React.useState('#6366f1');
	const [formIcon, setFormIcon] = React.useState('');
	const [formImageUrl, setFormImageUrl] = React.useState('');
	const [formLoading, setFormLoading] = React.useState(false);
	const [formError, setFormError] = React.useState('');

	async function load() {
		setLoading(true);
		try {
			const data = await apiFetch<Section[]>('/forum/sections');
			setSections(Array.isArray(data) ? data : []);
		} catch {
			try {
				const cats = await apiFetch<any[]>('/categories');
				setSections(Array.isArray(cats) ? cats.map(c => ({
					id: c.id, name: c.name, description: '', image_url: '', icon: '',
					color: '#6366f1', announcement: '', post_count: 0
				})) : []);
			} catch (e: any) {
				setError(e.message);
			}
		} finally {
			setLoading(false);
		}
	}

	React.useEffect(() => { load(); }, []);

	async function createSection() {
		if (!formName.trim()) return;
		setFormLoading(true);
		setFormError('');
		try {
			await apiFetch('/forum/sections', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ name: formName.trim(), description: formDesc.trim(), color: formColor, icon: formIcon.trim(), image_url: formImageUrl.trim() }),
			});
			setFormName(''); setFormDesc(''); setFormIcon(''); setFormImageUrl('');
			setShowForm(false);
			load();
		} catch (e: any) {
			setFormError(e.message);
		} finally {
			setFormLoading(false);
		}
	}

	return (
		<PageShell currentUser={user}>
			<div className="mx-auto max-w-5xl px-4 py-8">
				<div className="flex items-center justify-between mb-6">
					<div>
						<div className="flex items-center gap-2 mb-1">
							<Hash className="h-5 w-5 text-primary" />
							<h1 className="text-2xl font-bold" style={{ fontFamily: "'Noto Serif SC', serif" }}>论坛板块</h1>
						</div>
						<p className="text-sm text-muted-foreground">选择感兴趣的板块参与讨论</p>
					</div>
					{isAdmin && (
						<button className="btn-gradient px-4 py-2 rounded-lg text-sm font-medium text-white" onClick={() => setShowForm(!showForm)}>
							{showForm ? '取消' : '＋ 新建板块'}
						</button>
					)}
				</div>

				{showForm && isAdmin && (
					<div className="card-elevated p-5 mb-6 rounded-xl">
						<h3 className="text-sm font-semibold mb-4">新建论坛板块</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<label className="block text-xs text-muted-foreground mb-1">板块名称 *</label>
								<input className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：技术交流" />
							</div>
							<div>
								<label className="block text-xs text-muted-foreground mb-1">图标 Emoji</label>
								<input className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" value={formIcon} onChange={e => setFormIcon(e.target.value)} placeholder="例如：💻" />
							</div>
							<div className="sm:col-span-2">
								<label className="block text-xs text-muted-foreground mb-1">板块简介</label>
								<input className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="简短描述这个板块的主题" />
							</div>
							<div>
								<label className="block text-xs text-muted-foreground mb-1">主题色</label>
								<div className="flex items-center gap-2">
									<input type="color" className="w-9 h-9 rounded-lg border border-border cursor-pointer" value={formColor} onChange={e => setFormColor(e.target.value)} />
									<span className="text-xs text-muted-foreground">{formColor}</span>
								</div>
							</div>
							<div>
								<label className="block text-xs text-muted-foreground mb-1">封面图片 URL</label>
								<input className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" value={formImageUrl} onChange={e => setFormImageUrl(e.target.value)} placeholder="https://..." />
							</div>
						</div>
						{formError && <p className="text-xs text-destructive mt-3">{formError}</p>}
						<div className="flex gap-2 mt-4">
							<button className="btn-gradient px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" onClick={createSection} disabled={formLoading || !formName.trim()}>
								{formLoading ? '创建中…' : '创建板块'}
							</button>
							<button className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors" onClick={() => setShowForm(false)}>取消</button>
						</div>
					</div>
				)}

				{error && <div className="text-center py-12"><p className="text-destructive">{error}</p></div>}

				{loading && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{[1,2,3,4,5,6].map(i => (
							<div key={i} className="card-elevated overflow-hidden" style={{ borderRadius: '12px' }}>
								<div className="skeleton h-28" />
								<div className="p-4 space-y-2">
									<div className="skeleton h-4 w-3/4" />
									<div className="skeleton h-3 w-full" />
								</div>
							</div>
						))}
					</div>
				)}

				{!loading && !error && (
					<>
						{sections.length === 0 ? (
							<div className="text-center py-16">
								<BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
								<p className="text-muted-foreground">暂无板块</p>
								{isAdmin && <p className="text-xs text-muted-foreground mt-1">点击右上角按钮创建第一个板块</p>}
							</div>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								{sections.map(s => <SectionCard key={s.id} section={s} />)}
							</div>
						)}
					</>
				)}
			</div>
		</PageShell>
	);
}
