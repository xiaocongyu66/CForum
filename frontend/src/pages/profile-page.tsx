/**
 * CForum - User Profile Page
 * Route: /profile?uid=xxx  or  /user/:uid
 */

import * as React from 'react';
import { Heart, Link2, MessageCircle, Star, UserCheck, UserPlus, Award, Bell, BellOff } from 'lucide-react';

import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, formatDate, getSecurityHeaders, type Post } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: number;
  uid: string;
  username: string;
  nickname?: string;
  avatar_url?: string;
  bio?: string;
  signature?: string;
  custom_link?: string;
  custom_link_approved?: number;
  role: string;
  display_role?: string;
  coin_balance?: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  comment_count: number;
  created_at: string;
  isFollowing?: boolean;
}

// ─── Appreciate Dialog ────────────────────────────────────────────────────────

function AppreciateDialog({
  postId,
  receiverName,
  onClose,
}: {
  postId: number;
  receiverName: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = React.useState('5');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function submit() {
    setLoading(true);
    setError('');
    try {
      await apiFetch(`/posts/${postId}/appreciate`, {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify({ amount: parseInt(amount) || 1, message }),
      });
      alert('赞赏成功！');
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-lg">赞赏 {receiverName}</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">硬币数量</label>
          <div className="flex gap-2 flex-wrap">
            {[1, 5, 10, 20, 50].map((n) => (
              <button
                key={n}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  amount === String(n)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:border-primary'
                }`}
                onClick={() => setAmount(String(n))}
              >
                {n}
              </button>
            ))}
            <Input
              className="w-20 h-8 text-sm"
              type="number"
              min={1}
              max={100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">留言（可选）</label>
          <Input
            placeholder="感谢内容..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={100}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? '处理中...' : '确认赞赏'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────

export function ProfilePage() {
  const token = getToken();
  const currentUser = React.useMemo(() => getUser(), [token]);

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [totalPosts, setTotalPosts] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [tab, setTab] = React.useState<'posts' | 'about'>('posts');
  const [appreciatePostId, setAppreciatePostId] = React.useState<number | null>(null);

  // Custom link form
  const [linkUrl, setLinkUrl] = React.useState('');
  const [linkLabel, setLinkLabel] = React.useState('');
  const [linkLoading, setLinkLoading] = React.useState(false);
  const [linkMsg, setLinkMsg] = React.useState('');

  function getUidFromPath() {
    const p = new URLSearchParams(window.location.search);
    return p.get('uid') || p.get('id') ||
      window.location.pathname.split('/').pop() || '';
  }

  const uid = getUidFromPath();
  const isOwnProfile = currentUser && profile && currentUser.id === profile.id;

  const load = React.useCallback(async () => {
    if (!uid) { setError('用户不存在'); setLoading(false); return; }
    setLoading(true);
    try {
      const prof = await apiFetch<UserProfile>(`/users/${uid}/profile`);
      setProfile(prof);
      const data = await apiFetch<{ posts: Post[]; total: number }>(
        `/users/${uid}/posts?limit=20`
      );
      setPosts(data.posts);
      setTotalPosts(data.total);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  React.useEffect(() => { void load(); }, [load]);

  async function toggleFollow() {
    if (!profile) return;
    try {
      if (profile.isFollowing) {
        await apiFetch(`/follow/${profile.id}`, {
          method: 'DELETE',
          headers: getSecurityHeaders('DELETE'),
        });
      } else {
        await apiFetch(`/follow/${profile.id}`, {
          method: 'POST',
          headers: getSecurityHeaders('POST'),
          body: JSON.stringify({}),
        });
      }
      setProfile((p) => p ? {
        ...p,
        isFollowing: !p.isFollowing,
        follower_count: p.isFollowing ? p.follower_count - 1 : p.follower_count + 1,
      } : p);
    } catch (e: any) {
      alert(String(e?.message || e));
    }
  }

  async function submitCustomLink() {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);
    setLinkMsg('');
    try {
      await apiFetch('/me/custom-link', {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify({ url: linkUrl, label: linkLabel }),
      });
      setLinkMsg('链接已提交审核，通过后将显示在你的主页');
    } catch (e: any) {
      setLinkMsg(String(e?.message || e));
    } finally {
      setLinkLoading(false);
    }
  }

  const roleLabel: Record<string, string> = {
    admin: '管理员', super_admin: '超级管理员',
    moderator: '版主', user: '用户',
  };

  if (loading) return (
    <PageShell>
      <div className="flex justify-center py-20 text-muted-foreground">加载中...</div>
    </PageShell>
  );

  if (error || !profile) return (
    <PageShell>
      <div className="text-center py-20 text-destructive">{error || '用户不存在'}</div>
    </PageShell>
  );

  return (
    <PageShell>
      {appreciatePostId && (
        <AppreciateDialog
          postId={appreciatePostId}
          receiverName={profile.nickname || profile.username}
          onClose={() => setAppreciatePostId(null)}
        />
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Profile Header ───────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="h-28 bg-gradient-to-br from-primary/20 to-primary/5" />
          <CardContent className="relative pt-0 pb-6 px-6">
            {/* Avatar */}
            <div className="absolute -top-10 left-6">
              <div className="w-20 h-20 rounded-full border-4 border-background overflow-hidden bg-muted">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground select-none">
                    {(profile.nickname || profile.username)[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mb-2 mt-1">
              {currentUser && !isOwnProfile && (
                <Button
                  variant={profile.isFollowing ? 'outline' : 'default'}
                  size="sm"
                  onClick={toggleFollow}
                >
                  {profile.isFollowing
                    ? <><BellOff className="w-4 h-4 mr-1" />已关注</>
                    : <><UserPlus className="w-4 h-4 mr-1" />关注</>
                  }
                </Button>
              )}
              {isOwnProfile && (
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/settings'}>
                  编辑资料
                </Button>
              )}
            </div>

            {/* Name & Info */}
            <div className="mt-8 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">
                  {profile.nickname || profile.username}
                </h1>
                <span className="text-sm text-muted-foreground">@{profile.username}</span>
                {profile.role !== 'user' && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {roleLabel[profile.role] || profile.display_role || profile.role}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">UID: {profile.uid}</p>
              {profile.bio && <p className="text-sm text-foreground/80 mt-1">{profile.bio}</p>}
              {profile.signature && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-2 mt-1">
                  {profile.signature}
                </p>
              )}
              {profile.custom_link && profile.custom_link_approved === 1 && (
                <a
                  href={profile.custom_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                >
                  <Link2 className="w-3 h-3" />
                  {profile.custom_link.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 pt-4 border-t border-border text-center">
              {[
                ['帖子', profile.post_count],
                ['评论', profile.comment_count],
                ['关注', profile.following_count],
                ['粉丝', profile.follower_count],
              ].map(([label, val]) => (
                <div key={label as string} className="flex-1">
                  <div className="font-semibold text-base">{val ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-border">
          {(['posts', 'about'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'posts' ? `帖子 (${totalPosts})` : '关于'}
            </button>
          ))}
        </div>

        {/* ── Posts Tab ─────────────────────────────────────────────────── */}
        {tab === 'posts' && (
          <div className="space-y-3">
            {posts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">还没有发帖</p>
            ) : posts.map((post) => (
              <Card key={post.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`/post?id=${post.id}`}
                      className="font-medium hover:text-primary transition-colors line-clamp-1 flex-1"
                    >
                      {post.title}
                    </a>
                    {currentUser && !isOwnProfile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-yellow-500 hover:text-yellow-600"
                        onClick={() => setAppreciatePostId(post.id)}
                      >
                        <Award className="w-4 h-4 mr-1" />
                        赞赏
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />{post.like_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />{post.comment_count || 0}
                    </span>
                    <span>{formatDate(post.created_at)}</span>
                    {post.category_name && (
                      <span className="text-primary/70"># {post.category_name}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── About Tab ────────────────────────────────────────────────── */}
        {tab === 'about' && (
          <Card>
            <CardContent className="py-4 px-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted-foreground">注册时间</div>
                <div>{formatDate(profile.created_at)}</div>
                <div className="text-muted-foreground">角色</div>
                <div>{roleLabel[profile.role] || profile.role}</div>
                {profile.coin_balance !== undefined && (
                  <>
                    <div className="text-muted-foreground">硬币</div>
                    <div>{profile.coin_balance} 枚</div>
                  </>
                )}
              </div>

              {/* Custom link submission for own profile */}
              {isOwnProfile && (
                <div className="border-t border-border pt-4 space-y-2">
                  <h4 className="font-medium">自定义个人链接</h4>
                  <p className="text-xs text-muted-foreground">提交后需经管理员审核</p>
                  <Input
                    placeholder="https://your-website.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                  <Input
                    placeholder="链接说明（可选）"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                  />
                  {linkMsg && (
                    <p className={`text-xs ${linkMsg.includes('审核') ? 'text-green-500' : 'text-destructive'}`}>
                      {linkMsg}
                    </p>
                  )}
                  <Button size="sm" onClick={submitCustomLink} disabled={linkLoading}>
                    {linkLoading ? '提交中...' : '提交审核'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
