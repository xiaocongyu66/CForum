/**
 * CForum – Emoji Plaza
 * Twikoo-compatible emoji pack browser + custom pack manager
 * Route: /emoji-plaza
 */

import * as React from 'react';
import { Plus, Trash2, ExternalLink, Search, Upload } from 'lucide-react';

import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, getSecurityHeaders } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

interface EmojiPack {
  id: number;
  name: string;
  description: string;
  cover_url: string;
  twikoo_url: string;
  item_count: number;
  is_builtin: number;
  is_active: number;
}

interface EmojiItem {
  id: number;
  pack_id: number;
  name: string;
  url: string;
  shortcode: string;
}

// ─── Twikoo pack import ───────────────────────────────────────────────────────

async function fetchTwikooEmoji(url: string): Promise<EmojiItem[]> {
  try {
    const data = await apiFetch<any>(`/emoji/twikoo?url=${encodeURIComponent(url)}`);
    if (Array.isArray(data)) {
      return data.map((item: any, i: number) => ({
        id: i,
        pack_id: 0,
        name: item.icon || item.name || `emoji_${i}`,
        url: item.url || item.src || '',
        shortcode: item.key || item.name?.toLowerCase().replace(/\s+/g, '_') || `emoji_${i}`,
      })).filter((e) => e.url);
    }
  } catch { /* */ }
  return [];
}

// ─── Pack Detail View ─────────────────────────────────────────────────────────

function PackDetail({
  pack,
  onBack,
  isAdmin,
}: {
  pack: EmojiPack;
  onBack: () => void;
  isAdmin: boolean;
}) {
  const [items, setItems] = React.useState<EmojiItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [twikooItems, setTwikooItems] = React.useState<EmojiItem[]>([]);

  const [addName, setAddName] = React.useState('');
  const [addUrl, setAddUrl] = React.useState('');
  const [addShortcode, setAddShortcode] = React.useState('');
  const [addLoading, setAddLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<EmojiItem[]>(`/emoji/packs/${pack.id}/items`);
        setItems(data);
        if (pack.twikoo_url) {
          const tw = await fetchTwikooEmoji(pack.twikoo_url);
          setTwikooItems(tw);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [pack]);

  const allItems = [...items, ...twikooItems];
  const filtered = allItems.filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.shortcode.toLowerCase().includes(search.toLowerCase())
  );

  async function addItem() {
    if (!addName || !addUrl || !addShortcode) return;
    setAddLoading(true);
    try {
      await apiFetch(`/emoji/packs/${pack.id}/items`, {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify({ name: addName, url: addUrl, shortcode: addShortcode }),
      });
      const data = await apiFetch<EmojiItem[]>(`/emoji/packs/${pack.id}/items`);
      setItems(data);
      setAddName(''); setAddUrl(''); setAddShortcode('');
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setAddLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>← 返回</Button>
        <h2 className="font-semibold text-lg">{pack.name}</h2>
        {pack.twikoo_url && (
          <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300
                           px-2 py-0.5 rounded-full">Twikoo</span>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="搜索表情包..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : (
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
          {filtered.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className="group relative aspect-square rounded-lg overflow-hidden
                         border border-border hover:border-primary/50 cursor-pointer
                         flex items-center justify-center bg-muted/30"
              title={`:${item.shortcode}:`}
            >
              <img
                src={item.url}
                alt={item.name}
                className="w-full h-full object-contain p-1"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100
                              transition-opacity flex items-end justify-center pb-1">
                <span className="text-white text-[9px] truncate px-1">{item.shortcode}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              {search ? '没有匹配的表情' : '暂无表情'}
            </div>
          )}
        </div>
      )}

      {/* Admin: Add item */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-sm">添加表情</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="名称" value={addName} onChange={(e) => setAddName(e.target.value)} />
              <Input placeholder="shortcode (无冒号)" value={addShortcode} onChange={(e) => setAddShortcode(e.target.value)} />
              <Input placeholder="图片URL" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} />
            </div>
            <Button size="sm" onClick={addItem} disabled={addLoading}>
              <Plus className="w-4 h-4 mr-1" />
              添加
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Emoji Plaza ─────────────────────────────────────────────────────────

export function EmojiPlazaPage() {
  const token = getToken();
  const user = React.useMemo(() => getUser(), [token]);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [packs, setPacks] = React.useState<EmojiPack[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedPack, setSelectedPack] = React.useState<EmojiPack | null>(null);

  // Create pack form
  const [showCreate, setShowCreate] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newDesc, setNewDesc] = React.useState('');
  const [newCover, setNewCover] = React.useState('');
  const [newTwikooUrl, setNewTwikooUrl] = React.useState('');
  const [createLoading, setCreateLoading] = React.useState(false);

  const loadPacks = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<EmojiPack[]>('/emoji/packs');
      setPacks(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { void loadPacks(); }, []);

  async function createPack() {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      await apiFetch('/emoji/packs', {
        method: 'POST',
        headers: getSecurityHeaders('POST'),
        body: JSON.stringify({
          name: newName, description: newDesc,
          cover_url: newCover, twikoo_url: newTwikooUrl,
        }),
      });
      setNewName(''); setNewDesc(''); setNewCover(''); setNewTwikooUrl('');
      setShowCreate(false);
      await loadPacks();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setCreateLoading(false);
    }
  }

  // PRESET Twikoo pack URLs
  const TWIKOO_PRESETS = [
    { name: 'Bilibili 表情', url: 'https://cdn.jsdelivr.net/gh/shuhaocode/Twikoo-emoji@main/owo.json' },
    { name: 'Emojis 合集', url: 'https://cdn.jsdelivr.net/gh/shuhaocode/Twikoo-emoji@main/tieba.json' },
    { name: '斗图表情', url: 'https://cdn.jsdelivr.net/gh/shuhaocode/Twikoo-emoji@main/kaomoji.json' },
  ];

  if (selectedPack) {
    return (
      <PageShell>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <PackDetail pack={selectedPack} onBack={() => setSelectedPack(null)} isAdmin={isAdmin} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🎭 表情包广场</h1>
            <p className="text-muted-foreground text-sm mt-1">浏览 Twikoo 兼容表情包</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(!showCreate)} size="sm">
              <Plus className="w-4 h-4 mr-1" />新建表情包
            </Button>
          )}
        </div>

        {/* Create form */}
        {isAdmin && showCreate && (
          <Card>
            <CardHeader><CardTitle className="text-sm">创建新表情包</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>名称 *</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="表情包名称" />
                </div>
                <div className="space-y-1">
                  <Label>封面图URL</Label>
                  <Input value={newCover} onChange={(e) => setNewCover(e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Twikoo JSON URL</Label>
                <Input value={newTwikooUrl} onChange={(e) => setNewTwikooUrl(e.target.value)} placeholder="https://cdn.jsdelivr.net/..." />
                <div className="flex gap-2 flex-wrap mt-1">
                  {TWIKOO_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className="text-xs text-primary hover:underline"
                      onClick={() => setNewTwikooUrl(p.url)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>描述</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="可选说明" />
              </div>
              <div className="flex gap-2">
                <Button onClick={createPack} disabled={createLoading}>
                  {createLoading ? '创建中...' : '确认创建'}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pack grid */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">加载中...</div>
        ) : packs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            暂无表情包{isAdmin ? '，点击新建按钮添加' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {packs.map((pack) => (
              <Card
                key={pack.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all overflow-hidden"
                onClick={() => setSelectedPack(pack)}
              >
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {pack.cover_url ? (
                    <img
                      src={pack.cover_url}
                      alt={pack.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">
                      🎭
                    </div>
                  )}
                  {pack.twikoo_url && (
                    <span className="absolute top-1 right-1 text-xs bg-blue-600 text-white
                                     px-1.5 py-0.5 rounded-full">Twikoo</span>
                  )}
                </div>
                <CardContent className="py-2 px-3">
                  <p className="font-medium text-sm truncate">{pack.name}</p>
                  <p className="text-xs text-muted-foreground">{pack.item_count ?? 0} 个表情</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Twikoo info */}
        <Card className="border-dashed">
          <CardContent className="py-4 px-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-1">
              <ExternalLink className="w-4 h-4" /> Twikoo 表情使用说明
            </p>
            <p>在评论中用 <code className="bg-muted px-1 rounded">:shortcode:</code> 插入表情，或点击工具栏表情按钮选择。</p>
            <p>Twikoo 表情包 JSON 格式兼容，可导入任何 Twikoo CDN 链接。</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
