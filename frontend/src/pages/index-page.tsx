import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Filter, Heart, MessageCircle, MoreVertical, PenSquare, Pin, RefreshCw, Search, Shield, SlidersHorizontal, Trash2, User, X } from 'lucide-react';

import { TurnstileWidget } from '@/components/turnstile';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfig } from '@/hooks/use-config';
import { apiFetch, formatDate, getSecurityHeaders, type Category, type Post } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';
import { attachFancybox, highlightCodeBlocks, renderMarkdownToHtml } from '@/lib/markdown';
import { validateText } from '@/lib/validators';

export function IndexPage() {
	const { config } = useConfig();
	const token = getToken();
	const user = React.useMemo(() => getUser(), [token]);
	const [banner, setBanner] = React.useState<string>('');
	const [categories, setCategories] = React.useState<Category[]>([]);
	const [selectedCategory, setSelectedCategory] = React.useState<string>(() => {
		const params = new URLSearchParams(window.location.search);
		return params.get('category_id') || params.get('category') || '';
	});
	const [searchInput, setSearchInput] = React.useState<string>('');
	const [searchQuery, setSearchQuery] = React.useState<string>('');
	const [posts, setPosts] = React.useState<Post[]>([]);
	const [totalPosts, setTotalPosts] = React.useState<number>(0);
	const [pageOffset, setPageOffset] = React.useState<number>(0);
	const [loading, setLoading] = React.useState<boolean>(true);
	const [error, setError] = React.useState<string>('');
	const pageLimit = 10;
	const [jumpTo, setJumpTo] = React.useState<string>('');

	const [newTitle, setNewTitle] = React.useState('');
	const [newContent, setNewContent] = React.useState('');
	const [newCategoryId, setNewCategoryId] = React.useState<string>('');
	const [previewOpen, setPreviewOpen] = React.useState(true);
	const [createOpen, setCreateOpen] = React.useState(false);
	const [createLoading, setCreateLoading] = React.useState(false);
	const [createError, setCreateError] = React.useState('');
	const [uploadLoading, setUploadLoading] = React.useState(false);
	const [uploadError, setUploadError] = React.useState('');

	function insertIntoContent(insertText: string) {
		if (newContentRef.current) {
			const el = newContentRef.current;
			const start = el.selectionStart;
			const end = el.selectionEnd;
			const before = newContent.slice(0, start);
			const after = newContent.slice(end);
			const updated = before + insertText + after;
			setNewContent(updated);
			setTimeout(() => {
				el.selectionStart = el.selectionEnd = start + insertText.length;
				el.focus();
			}, 0);
		} else {
			setNewContent(newContent + insertText);
		}
	}

	function applyEdit(transform: (text: string, start: number, end: number) => { text: string; selectionStart: number; selectionEnd: number }) {
		const el = newContentRef.current;
		const start = el ? el.selectionStart : newContent.length;
		const end = el ? el.selectionEnd : newContent.length;
		const result = transform(newContent, start, end);
		setNewContent(result.text);
		setTimeout(() => {
			const target = newContentRef.current;
			if (!target) return;
			target.selectionStart = result.selectionStart;
			target.selectionEnd = result.selectionEnd;
			target.focus();
		}, 0);
	}

	function wrapSelection(prefix: string, suffix: string, placeholder: string) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end) || placeholder;
			const next = text.slice(0, start) + prefix + selected + suffix + text.slice(end);
			const selectionStart = start + prefix.length;
			const selectionEnd = selectionStart + selected.length;
			return { text: next, selectionStart, selectionEnd };
		});
	}

	function wrapBlock(fence: string) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end);
			const block = `${fence}\n${selected}\n${fence}`;
			const next = text.slice(0, start) + block + text.slice(end);
			const selectionStart = start + fence.length + 1;
			const selectionEnd = selectionStart + selected.length;
			return { text: next, selectionStart, selectionEnd };
		});
	}

	function transformLines(transform: (line: string, index: number, lines: string[]) => string) {
		applyEdit((text, start, end) => {
			const lineStart = text.lastIndexOf('\n', start - 1) + 1;
			const lineEnd = text.indexOf('\n', end);
			const endIndex = lineEnd === -1 ? text.length : lineEnd;
			const segment = text.slice(lineStart, endIndex);
			const lines = segment.split('\n');
			const nextSegment = lines.map(transform).join('\n');
			const next = text.slice(0, lineStart) + nextSegment + text.slice(endIndex);
			return { text: next, selectionStart: lineStart, selectionEnd: lineStart + nextSegment.length };
		});
	}

	function setHeading(level: number) {
		transformLines((line) => {
			const cleaned = line.replace(/^\s{0,3}#{1,6}\s+/, '');
			if (level === 0) return cleaned;
			return `${'#'.repeat(level)} ${cleaned}`;
		});
	}

	function toggleBlockquote() {
		transformLines((line) => (line.startsWith('> ') ? line.slice(2) : `> ${line}`));
	}

	function toggleList(ordered: boolean) {
		transformLines((line, index) => {
			if (ordered) {
				if (/^\d+\.\s+/.test(line)) return line.replace(/^\d+\.\s+/, '');
				return `${index + 1}. ${line}`;
			}
			if (/^[-*+]\s+/.test(line)) return line.replace(/^[-*+]\s+/, '');
			return `- ${line}`;
		});
	}

	function indentLines() { transformLines((line) => `  ${line}`); }
	function outdentLines() { transformLines((line) => line.replace(/^(\t| {1,2})/, '')); }

	function insertLink(isImage: boolean) {
		applyEdit((text, start, end) => {
			const selected = text.slice(start, end) || (isImage ? 'alt' : 'text');
			const link = isImage ? `![${selected}](url)` : `[${selected}](url)`;
			const next = text.slice(0, start) + link + text.slice(end);
			const urlStart = start + (isImage ? 2 : 1) + selected.length + 2;
			const urlEnd = urlStart + 3;
			return { text: next, selectionStart: urlStart, selectionEnd: urlEnd };
		});
	}

	function insertTable() {
		applyEdit((text, start, end) => {
			const table = `| Header | Header |\n| --- | --- |\n| Cell | Cell |`;
			const next = text.slice(0, start) + table + text.slice(end);
			return { text: next, selectionStart: start + 2, selectionEnd: start + 8 };
		});
	}

	function handleEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		const isMod = e.ctrlKey || e.metaKey;
		if (!isMod) return;
		const key = e.key.toLowerCase();
		const shift = e.shiftKey;
		if (!shift && key === 'b') { e.preventDefault(); wrapSelection('**', '**', 'text'); return; }
		if (!shift && key === 'i') { e.preventDefault(); wrapSelection('*', '*', 'text'); return; }
		if (!shift && key === 'u') { e.preventDefault(); wrapSelection('<u>', '</u>', 'text'); return; }
		if (!shift && key === 'k') { e.preventDefault(); insertLink(false); return; }
		if (!shift && key === 't') { e.preventDefault(); insertTable(); return; }
		if (shift && key === 'i') { e.preventDefault(); insertLink(true); return; }
		if (!shift && key === '0') { e.preventDefault(); setHeading(0); return; }
		if (!shift && key === '1') { e.preventDefault(); setHeading(1); return; }
		if (!shift && key === '2') { e.preventDefault(); setHeading(2); return; }
		if (!shift && key === '3') { e.preventDefault(); setHeading(3); return; }
		if (shift && key === 'k') { e.preventDefault(); wrapBlock('```'); return; }
		if (shift && key === 'm') { e.preventDefault(); wrapBlock('$$'); return; }
		if (shift && key === 'q') { e.preventDefault(); toggleBlockquote(); return; }
		if (shift && key === '[') { e.preventDefault(); toggleList(true); return; }
		if (shift && key === ']') { e.preventDefault(); toggleList(false); return; }
		if (!shift && key === '[') { e.preventDefault(); outdentLines(); return; }
		if (!shift && key === ']') { e.preventDefault(); indentLines(); return; }
		if (shift && (e.code === 'Backquote' || key === '`')) { e.preventDefault(); wrapSelection('`', '`', 'code'); return; }
		if (e.altKey && shift && e.code === 'Digit5') { e.preventDefault(); wrapSelection('~~', '~~', 'text'); return; }
	}

	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const previewRef = React.useRef<HTMLDivElement | null>(null);
	const newContentRef = React.useRef<HTMLTextAreaElement | null>(null);
	const [adminMenuPostId, setAdminMenuPostId] = React.useState<number | null>(null);
	const [adminActionPostId, setAdminActionPostId] = React.useState<number | null>(null);
	const [sortOption, setSortOption] = React.useState('time_desc');
	const listTopRef = React.useRef<HTMLDivElement | null>(null);
	const lastOffsetRef = React.useRef<number | null>(null);

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;

	const fetchCategories = React.useCallback(async () => {
		try {
			const list = await apiFetch<Category[]>('/categories');
			setCategories(list);
		} catch {
			setCategories([]);
		}
	}, []);

	const fetchPosts = React.useCallback(
		async (offset: number) => {
			setLoading(true);
			setError('');
			try {
				const sortBy = sortOption === 'likes_desc' ? 'likes' : sortOption === 'comments_desc' ? 'comments' : sortOption === 'views_desc' ? 'views' : 'time';
				const sortDir = sortOption === 'time_asc' ? 'asc' : 'desc';
				const categoryParam = selectedCategory ? `&category_id=${encodeURIComponent(selectedCategory)}` : '';
				const searchParam = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
				const sortParam = `&sort_by=${encodeURIComponent(sortBy)}&sort_dir=${encodeURIComponent(sortDir)}`;
				const res = await fetch(`/api/posts?limit=${pageLimit}&offset=${offset}${categoryParam}${searchParam}${sortParam}`);
				if (!res.ok) {
					let msg = `加载帖子失败 (${res.status})`;
					try { const body = await res.text(); if (body) msg += `: ${body}`; } catch {}
					throw new Error(msg);
				}
				const data = (await res.json()) as any;
				const list: Post[] = Array.isArray(data) ? data : (data.posts as Post[]);
				const total = Array.isArray(data) ? list.length : Number(data.total || 0);
				const processed = list.map((p) => ({ ...p, like_count: p.like_count || 0, comment_count: p.comment_count || 0 }));
				setPosts(processed);
				setTotalPosts(total);
				setPageOffset(offset);
			} catch (e: any) {
				setError(String(e?.message || e));
			} finally {
				setLoading(false);
			}
		},
		[selectedCategory, searchQuery, sortOption]
	);

	React.useEffect(() => { fetchCategories(); }, [fetchCategories]);
	React.useEffect(() => { fetchPosts(0); }, [fetchPosts]);

	React.useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('verified') === 'true') {
			setBanner('邮箱验证成功，现在可以登录。');
			params.delete('verified');
			window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
		} else if (params.get('email_changed') === 'true') {
			setBanner('邮箱更换成功。');
			params.delete('email_changed');
			window.history.replaceState({}, document.title, `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
		}
	}, []);

	React.useEffect(() => {
		if (!previewOpen) return;
		const el = previewRef.current;
		if (!el) return;
		highlightCodeBlocks(el);
		const cleanup = attachFancybox(el);
		return cleanup;
	}, [previewOpen, newContent]);

	React.useEffect(() => {
		if (adminMenuPostId == null) return;
		function close() { setAdminMenuPostId(null); }
		document.addEventListener('mousedown', close);
		document.addEventListener('touchstart', close);
		return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
	}, [adminMenuPostId]);

	React.useEffect(() => {
		if (lastOffsetRef.current !== null && lastOffsetRef.current !== pageOffset && !loading) {
			listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
		lastOffsetRef.current = pageOffset;
	}, [pageOffset, loading]);

	async function adminTogglePin(post: Post) {
		if (!user || user.role !== 'admin') return;
		setAdminActionPostId(post.id);
		try {
			await apiFetch(`/admin/posts/${post.id}/pin`, { method: 'POST', headers: getSecurityHeaders('POST'), body: JSON.stringify({ pinned: !post.is_pinned }) });
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch { return; } finally { setAdminActionPostId(null); }
	}

	async function adminDeletePost(post: Post) {
		if (!user || user.role !== 'admin') return;
		if (!confirm('确定要删除这个帖子吗？此操作无法撤销。')) return;
		setAdminActionPostId(post.id);
		try {
			await apiFetch(`/admin/posts/${post.id}`, { method: 'DELETE', headers: getSecurityHeaders('DELETE') });
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch { return; } finally { setAdminActionPostId(null); }
	}

	async function adminMovePost(post: Post, categoryId: number | null) {
		if (!user || user.role !== 'admin') return;
		setAdminActionPostId(post.id);
		try {
			await apiFetch(`/admin/posts/${post.id}/move`, { method: 'POST', headers: getSecurityHeaders('POST'), body: JSON.stringify({ category_id: categoryId }) });
			setAdminMenuPostId(null);
			await fetchPosts(pageOffset);
		} catch { return; } finally { setAdminActionPostId(null); }
	}

	async function createPost(e: React.FormEvent) {
		e.preventDefault();
		if (!user) { window.location.href = '/login'; return; }
		setCreateError('');
		const titleErr = validateText(newTitle, '标题');
		if (titleErr) return setCreateError(titleErr);
		const contentErr = validateText(newContent, '内容');
		if (contentErr) return setCreateError(contentErr);
		if (newTitle.length > 30) return setCreateError('标题过长 (最多 30 字符)');
		if (newContent.length > 3000) return setCreateError('内容过长 (最多 3000 字符)');
		if (turnstileActive && !turnstileToken) return setCreateError('请完成验证码验证');

		setCreateLoading(true);
		try {
			await apiFetch<{ success: boolean }>('/posts', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ title: newTitle, content: newContent, category_id: newCategoryId ? Number(newCategoryId) : null, 'cf-turnstile-response': turnstileToken })
			});
			setNewTitle('');
			setNewContent('');
			setNewCategoryId('');
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
			setCreateOpen(false);
			await fetchPosts(0);
		} catch (e: any) {
			setCreateError(String(e?.message || e));
			setTurnstileToken('');
			setTurnstileResetKey((v) => v + 1);
		} finally {
			setCreateLoading(false);
		}
	}

	const currentPage = Math.floor(pageOffset / pageLimit) + 1;
	const totalPages = Math.max(1, Math.ceil(totalPosts / pageLimit));
	const pages: Array<number | 'ellipsis'> = [];
	if (totalPages <= 7) {
		for (let p = 1; p <= totalPages; p++) pages.push(p);
	} else {
		const start = Math.max(2, currentPage - 2);
		const end = Math.min(totalPages - 1, currentPage + 2);
		pages.push(1);
		if (start > 2) pages.push('ellipsis');
		for (let p = start; p <= end; p++) pages.push(p);
		if (end < totalPages - 1) pages.push('ellipsis');
		pages.push(totalPages);
	}

	function getCoverImageUrl(markdown: string) {
		const mdMatch = markdown.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
		const htmlMatch = markdown.match(/<img[^>]+src=["']([^"']+)["']/i);
		let url = mdMatch?.[1] || htmlMatch?.[1] || '';
		if (!url) return '';
		if (!/^https?:\/\//i.test(url) && !url.startsWith('/') && !url.startsWith('data:')) {
			url = `/r2/${url.replace(/^\/+/, '')}`;
		}
		return url;
	}

	const sortLabels: Record<string, string> = {
		time_desc: '最新发布', time_asc: '最早发布', likes_desc: '最多点赞', comments_desc: '最多评论', views_desc: '最多观看'
	};

	return (
		<PageShell>
			<div className="space-y-6">
				{/* Banner */}
				{banner && (
					<div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
						<span className="text-base">✓</span>
						<span className="font-medium">{banner}</span>
					</div>
				)}

				{/* Page Header */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h1 className="text-3xl font-bold tracking-tight gradient-text" style={{ fontFamily: "'Noto Serif SC', serif" }}>
							CForum
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">由 Cloudflare Workers、Pages、D1、R2 提供服务</p>
					</div>

					{/* Filters Row */}
					<div className="flex flex-wrap items-center gap-2">
						<div className="flex items-center gap-1.5">
							<Filter className="h-3.5 w-3.5 text-muted-foreground" />
							<select
								className="h-8 rounded-lg border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
								value={selectedCategory}
								onChange={(e) => { setSelectedCategory(e.target.value); setPageOffset(0); }}
							>
								<option value="">全部分类</option>
								<option value="uncategorized">未分类</option>
								{categories.map((c) => (
									<option key={c.id} value={String(c.id)}>{c.name}</option>
								))}
							</select>
						</div>

						<div className="flex items-center gap-1.5">
							<SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
							<select
								className="h-8 rounded-lg border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
								value={sortOption}
								onChange={(e) => { setSortOption(e.target.value); setPageOffset(0); }}
							>
								{Object.entries(sortLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
							</select>
						</div>

						<form
							className="flex items-center gap-1.5"
							onSubmit={(e) => { e.preventDefault(); setPageOffset(0); setSearchQuery(searchInput.trim()); }}
						>
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									placeholder="搜索标题/内容"
									className="h-8 w-44 pl-8 text-sm"
								/>
							</div>
							<Button variant="outline" size="sm" type="submit" disabled={loading} className="h-8 w-8 p-0">
								<Search className="h-3.5 w-3.5" />
							</Button>
							{(searchInput || searchQuery) && (
								<Button variant="outline" size="sm" type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); setPageOffset(0); }} disabled={loading} className="h-8 w-8 p-0">
									<X className="h-3.5 w-3.5" />
								</Button>
							)}
						</form>

						<Button variant="ghost" size="sm" onClick={() => fetchPosts(0)} disabled={loading} className="h-8 w-8 p-0">
							<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
						</Button>
					</div>
				</div>

				{/* Create Post Card */}
				{user ? (
					<div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
						<div
							className="flex cursor-pointer items-center justify-between px-5 py-4 transition-colors hover:bg-muted/30"
							onClick={() => setCreateOpen((v) => !v)}
						>
							<div className="flex items-center gap-3">
								<div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-sm">
									<PenSquare className="h-4 w-4 text-white" />
								</div>
								<div>
									<p className="font-semibold text-foreground">发布新帖</p>
									<p className="text-xs text-muted-foreground">分享你的想法和内容</p>
								</div>
							</div>
							<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/80">
								{createOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
							</div>
						</div>

						{createOpen && (
							<div className="border-t bg-muted/10 px-5 pb-5 pt-4">
								{createError && (
									<div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
										<span className="mt-0.5">⚠</span>
										<span>{createError}</span>
									</div>
								)}
								<form className="space-y-4" onSubmit={createPost}>
									<div className="grid gap-4 sm:grid-cols-2">
										<div className="space-y-1.5">
											<Label htmlFor="new-title" className="text-sm font-medium">标题 <span className="font-normal text-muted-foreground">(最多30字)</span></Label>
											<Input id="new-title" maxLength={30} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="帖子标题" className="h-9" required />
										</div>
										<div className="space-y-1.5">
											<Label htmlFor="new-category" className="text-sm font-medium">分类 <span className="font-normal text-muted-foreground">(可选)</span></Label>
											<select
												id="new-category"
												className="h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
												value={newCategoryId}
												onChange={(e) => setNewCategoryId(e.target.value)}
											>
												<option value="">无分类</option>
												{categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
											</select>
										</div>
									</div>

									<div className="space-y-1.5">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<Label htmlFor="new-content" className="text-sm font-medium">内容 <span className="font-normal text-muted-foreground">(支持 Markdown)</span></Label>
											<div className="flex items-center gap-2">
												<span className="text-xs text-muted-foreground">Ctrl+B/I/U, Ctrl+1/2/3</span>
												<button type="button" onClick={() => setPreviewOpen((v) => !v)} className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors">
													{previewOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
													{previewOpen ? '关闭预览' : '预览'}
												</button>
											</div>
										</div>
										<div className={previewOpen ? 'grid gap-3 lg:grid-cols-2' : ''}>
											<div className="space-y-2">
												<Textarea
													id="new-content"
													ref={newContentRef}
													value={newContent}
													onChange={(e) => setNewContent(e.target.value)}
													onKeyDown={handleEditorKeyDown}
													rows={10}
													className="min-h-[200px] font-mono text-sm"
													placeholder="开始写作..."
													required
												/>
												<p className="text-xs text-muted-foreground">Ctrl+T 表格，Ctrl+Shift+K 代码块，Ctrl+Shift+Q 引用</p>
											</div>
											{previewOpen && (
												<div className="rounded-xl border bg-card/50 p-4">
													<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">预览</p>
													<div
														ref={previewRef}
														className="prose max-w-none break-words [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1"
														dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(newContent || '') }}
													/>
												</div>
											)}
										</div>
									</div>

									{/* Image Upload */}
									<div className="space-y-1.5">
										<Label className="text-sm font-medium text-muted-foreground">上传图片 <span className="font-normal">(最大 2MB)</span></Label>
										<input
											type="file"
											accept="image/*"
											className="block w-full rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary hover:border-primary/30 transition-colors"
											onChange={async (e) => {
												const file = e.target.files && e.target.files[0];
												if (!file) return;
												setUploadError('');
												if (file.size > 2 * 1024 * 1024) { setUploadError('文件过大 (最大 2MB)'); return; }
												setUploadLoading(true);
												try {
													const formData = new FormData();
													formData.append('file', file);
													formData.append('type', 'post');
													const res = await fetch('/api/upload', { method: 'POST', headers: getSecurityHeaders('POST', null), body: formData });
													const data = await res.json();
													if (!res.ok) throw new Error(data?.error || '上传失败');
													insertIntoContent(`\n\n![](${data.url})\n\n`);
													setPreviewOpen(true);
												} catch (err: any) {
													setUploadError(String(err?.message || err));
												} finally {
													setUploadLoading(false);
												}
											}}
										/>
										{uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
										{uploadLoading && <p className="text-sm text-muted-foreground animate-pulse">上传中…</p>}
									</div>

									<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

									<div className="flex justify-end">
										<button
											type="submit"
											disabled={createLoading}
											className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
										>
											{createLoading ? (
												<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />发布中...</>
											) : (
												<><PenSquare className="h-4 w-4" />发布帖子</>
											)}
										</button>
									</div>
								</form>
							</div>
						)}
					</div>
				) : (
					<div className="rounded-2xl border bg-card px-6 py-5 shadow-sm">
						<p className="text-sm text-muted-foreground">
							<a className="font-semibold text-primary hover:underline" href="/login">登录</a>
							{' '}或{' '}
							<a className="font-semibold text-primary hover:underline" href="/register">注册</a>
							{' '}后可发布、点赞和评论。
						</p>
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
						{error}
					</div>
				)}

				{/* Post List */}
				<div className="space-y-3">
					<div ref={listTopRef} />
					{loading ? (
						<>
							{[...Array(4)].map((_, i) => (
								<div key={i} className="rounded-2xl border bg-card p-5">
									<div className="flex gap-4">
										<div className="flex-1 space-y-3">
											<div className="skeleton h-5 w-3/4" />
											<div className="skeleton h-4 w-1/2" />
											<div className="flex gap-3">
												<div className="skeleton h-6 w-16" />
												<div className="skeleton h-6 w-16" />
												<div className="skeleton h-6 w-16" />
											</div>
										</div>
									</div>
								</div>
							))}
						</>
					) : posts.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
								<MessageCircle className="h-6 w-6" />
							</div>
							<p className="font-medium text-foreground">暂无帖子</p>
							<p className="text-sm text-muted-foreground">成为第一个发帖的人吧！</p>
						</div>
					) : (
						posts.map((p) => {
							const coverUrl = getCoverImageUrl(p.content || '');
							const isAdmin = user?.role === 'admin';
							const menuOpen = adminMenuPostId === p.id;
							const actionLoading = adminActionPostId === p.id;
							return (
								<div key={p.id} className="card-post">
									<div className="p-5">
										<div className="flex gap-4">
											{coverUrl && (
												<img
													src={coverUrl}
													alt=""
													className="h-20 w-28 shrink-0 rounded-xl object-cover shadow-sm"
													loading="lazy"
													referrerPolicy="no-referrer"
												/>
											)}
											<div className="min-w-0 flex-1 space-y-2">
												{/* Title Row */}
												<div className="flex items-start justify-between gap-2">
													<div className="flex min-w-0 flex-wrap items-center gap-2">
														{p.is_pinned && (
															<span className="badge badge-pinned">
																<Pin className="h-2.5 w-2.5" />
																置顶
															</span>
														)}
														<a
															className="truncate text-base font-semibold text-foreground hover:text-primary transition-colors"
															href={`/post?id=${p.id}`}
														>
															{p.title}
														</a>
													</div>

													{isAdmin && (
														<div className="relative shrink-0">
															<button
																type="button"
																disabled={actionLoading}
																onMouseDown={(e) => e.stopPropagation()}
																onTouchStart={(e) => e.stopPropagation()}
																onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAdminMenuPostId((cur) => (cur === p.id ? null : p.id)); }}
																className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
															>
																<MoreVertical className="h-4 w-4" />
															</button>
															{menuOpen && (
																<div
																	className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border bg-card p-1.5 shadow-lg"
																	onMouseDown={(e) => e.stopPropagation()}
																	onTouchStart={(e) => e.stopPropagation()}
																	onClick={(e) => e.stopPropagation()}
																>
																	<button type="button" disabled={actionLoading} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50" onClick={() => void adminTogglePin(p)}>
																		<Pin className="h-3.5 w-3.5" />
																		{p.is_pinned ? '取消置顶' : '置顶'}
																	</button>
																	<button type="button" disabled={actionLoading} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50" onClick={() => void adminDeletePost(p)}>
																		<Trash2 className="h-3.5 w-3.5" />
																		删除帖子
																	</button>
																	<div className="my-1 h-px bg-border" />
																	<p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">移动到分类</p>
																	<button type="button" disabled={actionLoading} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50" onClick={() => void adminMovePost(p, null)}>未分类</button>
																	{categories.map((c) => (
																		<button key={c.id} type="button" disabled={actionLoading} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50" onClick={() => void adminMovePost(p, c.id)}>{c.name}</button>
																	))}
																</div>
															)}
														</div>
													)}
												</div>

												{/* Meta Row */}
												<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
													<span className="inline-flex items-center gap-1.5">
														{p.author_avatar ? (
															<img src={p.author_avatar} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-border" loading="lazy" referrerPolicy="no-referrer" />
														) : (
															<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
																<User className="h-3 w-3" />
															</span>
														)}
														<span className="truncate font-medium text-foreground/80">{p.author_name}</span>
														{p.author_role === 'admin' && (
															<span className="badge badge-admin">
																<Shield className="h-2.5 w-2.5" />
															</span>
														)}
													</span>
													{p.category_name && (
														<>
															<span className="opacity-40">·</span>
															<span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">{p.category_name}</span>
														</>
													)}
													<span className="opacity-40">·</span>
													<span className="text-xs whitespace-nowrap">{formatDate(p.created_at)}</span>
												</div>

												{/* Stats Row */}
												<div className="flex items-center gap-2">
													<span className="stat-chip likes">
														<Heart className="h-3.5 w-3.5" />
														{p.like_count || 0}
													</span>
													<span className="stat-chip comments">
														<MessageCircle className="h-3.5 w-3.5" />
														{p.comment_count || 0}
													</span>
													<span className="stat-chip views">
														<Eye className="h-3.5 w-3.5" />
														{p.view_count || 0}
													</span>
												</div>
											</div>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>

				{/* Pagination */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage <= 1 || loading}
							onClick={() => fetchPosts(Math.max(0, pageOffset - pageLimit))}
							className="h-8 w-8 p-0 rounded-lg"
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-1">
							{pages.map((p, idx) =>
								p === 'ellipsis' ? (
									<span key={`e-${idx}`} className="w-8 text-center text-sm text-muted-foreground">…</span>
								) : (
									<button
										key={p}
										disabled={loading}
										onClick={() => fetchPosts((p - 1) * pageLimit)}
										className={`h-8 min-w-[32px] rounded-lg px-2 text-sm font-medium transition-all ${p === currentPage ? 'btn-gradient' : 'border border-border bg-background text-foreground hover:bg-muted'} disabled:opacity-50`}
									>
										{p}
									</button>
								)
							)}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= totalPages || loading}
							onClick={() => fetchPosts(pageOffset + pageLimit)}
							className="h-8 w-8 p-0 rounded-lg"
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>

					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							const parsed = Number.parseInt(jumpTo, 10);
							if (!Number.isFinite(parsed)) return;
							const next = Math.min(Math.max(parsed, 1), totalPages);
							setJumpTo(String(next));
							fetchPosts((next - 1) * pageLimit);
						}}
					>
						<span className="text-sm text-muted-foreground whitespace-nowrap">
							第 <span className="font-medium text-foreground">{currentPage}</span> / <span className="font-medium text-foreground">{totalPages}</span> 页
						</span>
						<Input
							value={jumpTo}
							onChange={(e) => setJumpTo(e.target.value)}
							inputMode="numeric"
							placeholder="跳页"
							className="h-8 w-16 text-center text-sm"
						/>
						<Button variant="outline" size="sm" type="submit" disabled={loading} className="h-8">
							跳转
						</Button>
					</form>
				</div>
			</div>
		</PageShell>
	);
}
