import * as React from 'react';

import { SiteHeader } from '@/components/site-header';
import { getUser, type User } from '@/lib/auth';
import { useConfig } from '@/hooks/use-config';

export function PageShell({
	children
}: {
	children: React.ReactNode;
}) {
	const [user, setUser] = React.useState<User | null>(() => getUser());
	const { config } = useConfig();
	const [generatedSecret, setGeneratedSecret] = React.useState<string>('');

	React.useEffect(() => {
		if (config && config.jwt_secret_configured === false && !generatedSecret) {
			const arr = new Uint8Array(32);
			crypto.getRandomValues(arr);
			const secret = btoa(String.fromCharCode(...arr));
			setGeneratedSecret(secret);
		}
	}, [config, generatedSecret]);

	return (
		<div className="min-h-dvh" style={{ background: 'hsl(var(--background))' }}>
			<SiteHeader currentUser={user} onLogout={() => setUser(null)} />
			{config && config.jwt_secret_configured === false && (
				<div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/40 dark:text-amber-300">
					<span className="font-semibold">⚠ 配置提醒：</span>JWT secret 未设置！请在 Cloudflare Worker secrets 中设置
					<strong> JWT_SECRET</strong>（≥32位）。建议值：
					<code className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs break-all dark:bg-amber-900/50">{generatedSecret}</code>
				</div>
			)}
			<main className="mx-auto w-full max-w-5xl px-4 py-8 page-enter">
				{children}
			</main>
		</div>
	);
}
