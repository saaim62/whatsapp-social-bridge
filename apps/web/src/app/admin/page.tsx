'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  CreditCard,
  Timer,
  Lock,
  Package,
  Send,
  AlertTriangle,
  Database,
  RefreshCw,
  Shield,
  Crown,
  Search,
  X,
  HardDrive,
  Megaphone,
  ScrollText,
  Server,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Ban,
  Gift,
  CalendarPlus,
  UserCog,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { API_URL, fetchWithAuth } from '@/lib/api';
import { useNotifications } from '@/contexts/NotificationContext';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const formatBytes = (bytes: number, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
  );
};

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const timeAgo = (d?: string | null) => {
  if (!d) return 'never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? '1 day ago' : `${days} days ago`;
};

/** Fill a date series with zeros so charts show the full window. */
const fillDays = (rows: { date: string; count: number }[], days: number) => {
  const byDay = new Map<string, number>();
  (rows || []).forEach((r) => {
    byDay.set(new Date(r.date).toDateString(), r.count);
  });
  const out: { label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    out.push({
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      count: byDay.get(d.toDateString()) || 0,
    });
  }
  return out;
};

const PLAN_STYLES: Record<string, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  TRIAL: 'bg-gold-500/10 text-gold-300 border-gold-500/30',
  EXPIRED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  BLOCKED: 'bg-red-600/20 text-red-300 border-red-500/40',
};

const AUDIT_LABELS: Record<string, string> = {
  SET_ROLE: 'Role changed',
  EXTEND_TRIAL: 'Trial extended',
  GRANT_COMP: 'Comp granted',
  REVOKE_COMP: 'Comp revoked',
  BLOCK: 'User blocked',
  UNBLOCK: 'User unblocked',
  SET_STORAGE: 'Storage limit set',
};

const auditDetailText = (entry: any) => {
  const d = entry.details || {};
  switch (entry.action) {
    case 'SET_ROLE':
      return `${d.from || '?'} → ${d.to || '?'}`;
    case 'EXTEND_TRIAL':
      return `+${d.days} days (ends ${fmtDate(d.trialEndsAt)})`;
    case 'SET_STORAGE':
      return formatBytes(d.storageLimitBytes || 0);
    default:
      return '';
  }
};

const FILTERS = [
  { key: 'all', label: 'All users' },
  { key: 'paid', label: 'Paid' },
  { key: 'trial', label: 'On trial' },
  { key: 'expired', label: 'Expired' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'team', label: 'Team' },
];

const QUEUE_NAMES: Record<string, string> = {
  'batch-processing': 'Batch processing',
  'history-sync-queue': 'WhatsApp history sync',
  'image-blur': 'Image blur',
};

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'gold',
  delay = 0,
}: any) {
  const tones: Record<string, string> = {
    gold: 'text-gold-400 bg-gold-500/10 border-gold-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span className={`p-2 rounded-lg border ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-heading font-bold text-white tracking-tight">
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </motion.div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'OWNER')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-gold-500/15 text-gold-300 border-gold-500/40">
        <Crown className="w-3 h-3" /> OWNER
      </span>
    );
  if (role === 'ADMIN')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-500/10 text-sky-300 border-sky-500/30">
        <Shield className="w-3 h-3" /> ADMIN
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-white/5 text-slate-400 border-white/10">
      USER
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminConsole() {
  const { addToast } = useNotifications();
  const [me, setMe] = useState<any>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [system, setSystem] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  const [users, setUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [usersLoading, setUsersLoading] = useState(false);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [storageGB, setStorageGB] = useState(5);
  const [pickerUserId, setPickerUserId] = useState('');

  const isOwner = me?.role === 'OWNER';

  const loadUsers = useCallback(async (p: number, f: string, q: string) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: '20',
        filter: f,
      });
      if (q) params.set('search', q);
      const res = await fetchWithAuth(`${API_URL}/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setUsersTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    const [statsRes, systemRes, auditRes, teamRes, pickerRes] =
      await Promise.all([
        fetchWithAuth(`${API_URL}/api/admin/stats`),
        fetchWithAuth(`${API_URL}/api/admin/system`),
        fetchWithAuth(`${API_URL}/api/admin/audit?limit=30`),
        fetchWithAuth(`${API_URL}/api/admin/team`),
        fetchWithAuth(
          `${API_URL}/api/admin/users?page=1&pageSize=100&filter=all`,
        ),
      ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (systemRes.ok) setSystem(await systemRes.json());
    if (auditRes.ok) setAudit(await auditRes.json());
    if (teamRes.ok) setTeam(await teamRes.json());
    if (pickerRes.ok) {
      const d = await pickerRes.json();
      setAllUsers(d.users || []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/admin/me`);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.role === 'ADMIN' || data.role === 'OWNER')) {
            setMe(data);
          }
        }
      } finally {
        setMeLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (me) {
      loadAll();
      loadUsers(1, 'all', '');
    }
  }, [me, loadAll, loadUsers]);

  // Debounced search / filter changes
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => {
      setPage(1);
      loadUsers(1, filter, search);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter]);

  const changePage = (p: number) => {
    const next = Math.min(Math.max(p, 1), totalPages);
    setPage(next);
    loadUsers(next, filter, search);
  };

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/admin/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
        setStorageGB(
          Math.max(
            1,
            Math.round((data.storageLimitBytes || 5368709120) / 1073741824),
          ),
        );
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAfterAction = async (userId?: string) => {
    await Promise.all([loadAll(), loadUsers(page, filter, search)]);
    if (userId) openDetail(userId);
  };

  const runAction = async (
    key: string,
    fn: () => Promise<boolean>,
    successMsg: string,
    userId?: string,
  ) => {
    setBusy(key);
    try {
      const ok = await fn();
      if (ok) {
        addToast({ title: successMsg, type: 'success' } as any);
        await refreshAfterAction(userId);
      } else {
        addToast({
          title: 'Action failed',
          message: 'The server rejected the request.',
          type: 'error',
        } as any);
      }
    } finally {
      setBusy(null);
    }
  };

  const extendTrial = (user: any) =>
    runAction(
      'extend',
      async () => {
        const res = await fetchWithAuth(
          `${API_URL}/api/admin/users/${user.id}/extend-trial`,
          {
            method: 'POST',
            body: JSON.stringify({ days: 30 }),
          },
        );
        return res.ok;
      },
      `Trial extended 30 days for ${user.email}`,
      user.id,
    );

  const togglePaid = (user: any) => {
    if (
      !user.isPaid ||
      window.confirm(
        `Revoke complimentary access for ${user.email}? They will fall back to their trial state.`,
      )
    ) {
      return runAction(
        'paid',
        async () => {
          const res = await fetchWithAuth(
            `${API_URL}/api/admin/users/${user.id}/paid`,
            {
              method: 'POST',
              body: JSON.stringify({ isPaid: !user.isPaid }),
            },
          );
          return res.ok;
        },
        user.isPaid
          ? `Comp revoked for ${user.email}`
          : `Comp access granted to ${user.email}`,
        user.id,
      );
    }
  };

  const toggleBlock = (user: any) => {
    if (
      user.isBlocked ||
      window.confirm(
        `Block ${user.email}? They will be signed out of the product and unable to log in.`,
      )
    ) {
      return runAction(
        'block',
        async () => {
          const res = await fetchWithAuth(
            `${API_URL}/api/admin/users/${user.id}/block`,
            {
              method: 'PATCH',
              body: JSON.stringify({ isBlocked: !user.isBlocked }),
            },
          );
          return res.ok;
        },
        user.isBlocked ? `${user.email} unblocked` : `${user.email} blocked`,
        user.id,
      );
    }
  };

  const saveStorage = (user: any) =>
    runAction(
      'storage',
      async () => {
        const res = await fetchWithAuth(
          `${API_URL}/api/admin/users/${user.id}/storage`,
          {
            method: 'POST',
            body: JSON.stringify({ storageLimitBytes: storageGB * 1073741824 }),
          },
        );
        return res.ok;
      },
      `Storage limit set to ${storageGB} GB for ${user.email}`,
      user.id,
    );

  const setRole = (userId: string, role: string, email: string) => {
    const verb =
      role === 'ADMIN'
        ? `Make ${email} an admin? They will get full console access (but cannot manage admins).`
        : `Remove admin access from ${email}?`;
    if (!window.confirm(verb)) return;
    return runAction(
      `role-${userId}`,
      async () => {
        const res = await fetchWithAuth(`${API_URL}/api/admin/team/role`, {
          method: 'POST',
          body: JSON.stringify({ userId, role }),
        });
        return res.ok;
      },
      role === 'ADMIN'
        ? `${email} is now an admin`
        : `${email} is no longer an admin`,
    );
  };

  /* ------------------------------------------------------------ states */
  if (!meLoaded) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold-500" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="glass-panel rounded-3xl p-10 max-w-lg mx-auto mt-16 text-center">
        <Lock className="w-10 h-10 text-gold-400 mx-auto mb-4" />
        <h2 className="text-xl font-heading font-bold text-white">
          Admin access required
        </h2>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          This console is restricted to DropRoute admins. If you run this
          product, sign in with the owner account.
        </p>
      </div>
    );
  }

  const signupData = fillDays(stats?.signupsByDay || [], 14);
  const activityData = fillDays(stats?.activeUsersByDay || [], 7);
  const pipeline = Object.entries(stats?.batchesByStatus || {}).sort(
    (a: any, b: any) => b[1] - a[1],
  );
  const pipelineMax = Math.max(1, ...pipeline.map((p: any) => p[1]));
  const pickerCandidates = allUsers.filter(
    (u) => u.role === 'USER' && !team.some((t) => t.id === u.id),
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-white tracking-tight flex items-center gap-3">
            Admin Console
            <RoleBadge role={me.role} />
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Signed in as {me.email}
            {isOwner
              ? ' — you own this product.'
              : ' — admin access. Role management is owner-only.'}
          </p>
        </div>
        <button
          onClick={() => {
            loadAll();
            loadUsers(page, filter, search);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-slate-200 hover:bg-white/[0.08] transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Total users"
          value={stats?.totalUsers ?? '—'}
          sub={`+${stats?.signups7d ?? 0} in the last 7 days · +${stats?.signups30d ?? 0} in 30`}
          delay={0}
        />
        <KpiCard
          icon={CreditCard}
          label="Paid users"
          value={stats?.users?.paid ?? '—'}
          tone="emerald"
          sub={`MRR ≈ $${stats?.mrrEstimate ?? 0} · ${stats?.trialConversion ?? 0}% trial conversion`}
          delay={0.05}
        />
        <KpiCard
          icon={Timer}
          label="Active trials"
          value={stats?.users?.trialActive ?? '—'}
          tone="sky"
          sub={`${stats?.users?.expired ?? 0} expired / locked · ${stats?.users?.blocked ?? 0} blocked`}
          delay={0.1}
        />
        <KpiCard
          icon={Package}
          label="Products ingested"
          value={stats?.totalBatches ?? '—'}
          tone="violet"
          sub={`${stats?.publications?.published ?? 0} posts published · ${stats?.sourcesEnabled ?? 0} sources live`}
          delay={0.15}
        />
        <KpiCard
          icon={HardDrive}
          label="Media stored"
          value={formatBytes(stats?.totalStorageBytes || 0)}
          sub={`${(stats?.totalMediaCount ?? 0).toLocaleString()} files across all users`}
          delay={0.2}
        />
        <KpiCard
          icon={Send}
          label="Publications"
          value={stats?.publications?.total ?? '—'}
          tone="sky"
          sub={`${stats?.publications?.published ?? 0} published successfully`}
          delay={0.25}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Failed publications"
          value={stats?.publications?.failedLast7d ?? '—'}
          tone={
            (stats?.publications?.failedLast7d ?? 0) > 0 ? 'rose' : 'emerald'
          }
          sub={`${stats?.publications?.failed ?? 0} all-time · ${stats?.failedBatches ?? 0} failed batches`}
          delay={0.3}
        />
        <KpiCard
          icon={UserCog}
          label="Team"
          value={stats?.users?.team ?? '—'}
          sub={
            isOwner
              ? 'You can add or remove admins below'
              : 'Managed by the owner'
          }
          delay={0.35}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 xl:col-span-1">
          <h3 className="text-sm font-bold text-white mb-1">
            Signups — last 14 days
          </h3>
          <p className="text-xs text-slate-500 mb-4">New accounts per day</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={24}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: '#111',
                    border: '1px solid rgba(217,165,33,0.3)',
                    borderRadius: 12,
                    color: '#fff',
                  }}
                  cursor={{ fill: 'rgba(217,165,33,0.08)' }}
                />
                <Bar
                  dataKey="count"
                  fill="#d9a521"
                  radius={[4, 4, 0, 0]}
                  name="Signups"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 xl:col-span-1">
          <h3 className="text-sm font-bold text-white mb-1">
            Active users — last 7 days
          </h3>
          <p className="text-xs text-slate-500 mb-4">Accounts active per day</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={24}
                />
                <RechartsTooltip
                  contentStyle={{
                    background: '#111',
                    border: '1px solid rgba(56,189,248,0.3)',
                    borderRadius: 12,
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#38bdf8"
                  fill="rgba(56,189,248,0.15)"
                  name="Active users"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-1">
            Pipeline by status
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Every product batch, by stage
          </p>
          <div className="space-y-3">
            {pipeline.length === 0 && (
              <p className="text-sm text-slate-500">No batches yet.</p>
            )}
            {pipeline.map(([status, count]: any) => (
              <div key={status}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium tracking-wide">
                    {status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-500">{count}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${status === 'FAILED' ? 'bg-rose-500' : status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-gradient-to-r from-gold-400 to-gold-600'}`}
                    style={{ width: `${(count / pipelineMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Users */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-gold-400" /> Users
            <span className="text-slate-500 font-medium">({usersTotal})</span>
          </h3>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or name…"
              className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 outline-none w-64"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.key
                  ? 'bg-gold-500/15 text-gold-300 border-gold-500/40'
                  : 'bg-white/[0.03] text-slate-400 border-white/10 hover:bg-white/[0.06]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <th className="py-3 pr-4 font-semibold">User</th>
                <th className="py-3 pr-4 font-semibold">Plan</th>
                <th className="py-3 pr-4 font-semibold">Role</th>
                <th className="py-3 pr-4 font-semibold text-right">Products</th>
                <th className="py-3 pr-4 font-semibold text-right">Sources</th>
                <th className="py-3 pr-4 font-semibold">Storage</th>
                <th className="py-3 pr-4 font-semibold">Last active</th>
                <th className="py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const pct =
                  u.storageLimitBytes > 0
                    ? Math.min(100, (u.storageUsed / u.storageLimitBytes) * 100)
                    : 0;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-b from-gold-300 to-gold-600 flex items-center justify-center text-black font-bold text-sm shrink-0">
                          {(u.name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate flex items-center gap-1.5">
                            {u.name || '—'}
                            {u.isEmailVerified && (
                              <BadgeCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${PLAN_STYLES[u.planStatus] || PLAN_STYLES.EXPIRED}`}
                      >
                        {u.planStatus}
                      </span>
                      {u.planStatus === 'TRIAL' && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          ends {fmtDate(u.trialEndsAt)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 pr-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="py-3.5 pr-4 text-right text-slate-300">
                      {u.batchCount}
                    </td>
                    <td className="py-3.5 pr-4 text-right text-slate-300">
                      {u.sourceCount}
                    </td>
                    <td className="py-3.5 pr-4">
                      <div className="text-xs text-slate-300">
                        {formatBytes(u.storageUsed)}{' '}
                        <span className="text-slate-500">
                          / {formatBytes(u.storageLimitBytes)}
                        </span>
                      </div>
                      <div className="h-1.5 w-28 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct > 90 ? 'bg-rose-500' : 'bg-gold-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-400 text-xs whitespace-nowrap">
                      {timeAgo(u.lastActiveAt)}
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => openDetail(u.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold text-slate-200 hover:bg-gold-500/10 hover:text-gold-300 hover:border-gold-500/30 transition-colors"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    {usersLoading ? 'Loading…' : 'No users match this view.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => changePage(page - 1)}
              disabled={page <= 1}
              className="p-2 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 disabled:opacity-40 hover:bg-white/[0.08] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => changePage(page + 1)}
              disabled={page >= totalPages}
              className="p-2 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300 disabled:opacity-40 hover:bg-white/[0.08] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Team + System row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Team */}
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
            <UserCog className="w-4 h-4 text-gold-400" /> Admin team
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {isOwner
              ? 'You are the owner. Only you can grant or revoke admin access — admins can run this console but can never manage admins.'
              : 'Only the owner can add or remove admins. You can view the team but not change it.'}
          </p>
          <div className="space-y-2.5">
            {team.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white font-medium truncate flex items-center gap-2">
                    {m.email}
                    {m.id === me.id && (
                      <span className="text-[10px] text-gold-400 font-bold">
                        (YOU)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    since {fmtDate(m.createdAt)} · active{' '}
                    {timeAgo(m.lastActiveAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={m.role} />
                  {isOwner && m.role === 'ADMIN' && (
                    <button
                      onClick={() => setRole(m.id, 'USER', m.email)}
                      disabled={busy === `role-${m.id}`}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                    >
                      Remove admin
                    </button>
                  )}
                </div>
              </div>
            ))}
            {team.length === 0 && (
              <p className="text-sm text-slate-500">No team members yet.</p>
            )}
          </div>

          {isOwner && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <label className="text-xs font-semibold text-slate-400 block mb-2">
                Add an admin
              </label>
              <div className="flex gap-2">
                <select
                  value={pickerUserId}
                  onChange={(e) => setPickerUserId(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500/50 [&>option]:bg-neutral-900"
                >
                  <option value="">Select a user…</option>
                  {pickerCandidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const u = pickerCandidates.find(
                      (x) => x.id === pickerUserId,
                    );
                    if (u) setRole(u.id, 'ADMIN', u.email);
                  }}
                  disabled={!pickerUserId || busy === `role-${pickerUserId}`}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                >
                  Make admin
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                Ownership itself is never granted here — it is set at the
                database level, so no console account can mint another owner.
              </p>
            </div>
          )}
        </div>

        {/* System */}
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-gold-400" /> System health
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {system
              ? `Checked ${timeAgo(system.checkedAt)} · API uptime ${Math.floor((system.uptimeSeconds || 0) / 60)} min`
              : 'Loading…'}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Database', ok: system?.database === 'up' },
              { label: 'Redis / queues', ok: system?.redis === 'up' },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3 flex items-center gap-2.5"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${s.ok ? 'bg-emerald-400' : 'bg-rose-500'} animate-pulse`}
                />
                <span className="text-sm text-slate-200 font-medium">
                  {s.label}
                </span>
                <span
                  className={`ml-auto text-xs font-bold ${s.ok ? 'text-emerald-300' : 'text-rose-300'}`}
                >
                  {system ? (s.ok ? 'UP' : 'DOWN') : '…'}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 mb-4">
            {Object.entries(system?.queues || {}).map(([name, q]: any) => (
              <div
                key={name}
                className="flex items-center justify-between text-sm rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2.5"
              >
                <span className="text-slate-300 font-medium">
                  {QUEUE_NAMES[name] || name}
                </span>
                <span className="text-xs text-slate-500">
                  <span className="text-slate-300 font-semibold">
                    {q.waiting}
                  </span>{' '}
                  waiting ·{' '}
                  <span className="text-slate-300 font-semibold">
                    {q.active}
                  </span>{' '}
                  active ·{' '}
                  <span
                    className={
                      q.failed > 0
                        ? 'text-rose-300 font-semibold'
                        : 'text-slate-300 font-semibold'
                    }
                  >
                    {q.failed}
                  </span>{' '}
                  failed
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {(system?.r2Accounts || stats?.r2Accounts || []).map(
              (acc: any, i: number) => {
                const pct = acc.limitBytes
                  ? Math.min(100, (acc.usageBytes / acc.limitBytes) * 100)
                  : 0;
                return (
                  <div key={acc.id || i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-sky-400" /> R2
                        storage {acc.id} · {acc.bucketName}
                      </span>
                      <span className="text-slate-500">
                        {formatBytes(acc.usageBytes)} /{' '}
                        {formatBytes(acc.limitBytes)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? 'bg-rose-500' : 'bg-sky-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              },
            )}
            <p className="text-xs text-slate-500">
              Uploads on server:{' '}
              {formatBytes(stats?.serverStorageConsumedBytes || 0)}
              {stats?.serverStorageTotalBytes
                ? ` of ${formatBytes(stats.serverStorageTotalBytes)}`
                : ''}
              {' · '}Failed batches:{' '}
              <span className="text-slate-300 font-semibold">
                {system?.failedBatches ?? '—'}
              </span>
              {' · '}Failed publications (7d):{' '}
              <span className="text-slate-300 font-semibold">
                {system?.failedPublications7d ?? '—'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Audit log */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
          <ScrollText className="w-4 h-4 text-gold-400" /> Audit log
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Every privileged action, who did it, and to whom. Nothing here can be
          edited from the console.
        </p>
        <div className="space-y-2">
          {audit.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2.5 text-sm"
            >
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-white/5 text-gold-300 border-gold-500/30">
                {AUDIT_LABELS[entry.action] || entry.action}
              </span>
              <span className="text-slate-300">
                <span className="font-medium text-white">
                  {entry.actorEmail}
                </span>
                {entry.targetEmail && (
                  <>
                    {' '}
                    →{' '}
                    <span className="font-medium text-white">
                      {entry.targetEmail}
                    </span>
                  </>
                )}
              </span>
              {auditDetailText(entry) && (
                <span className="text-xs text-slate-500">
                  {auditDetailText(entry)}
                </span>
              )}
              <span className="ml-auto text-xs text-slate-600 whitespace-nowrap">
                {timeAgo(entry.createdAt)}
              </span>
            </div>
          ))}
          {audit.length === 0 && (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Activity className="w-4 h-4" /> No admin actions recorded yet —
              the first one will appear here.
            </p>
          )}
        </div>
      </div>

      {/* User detail modal */}
      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-obsidian/80 backdrop-blur-sm p-4"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="glass-panel w-full max-w-2xl rounded-3xl border-white/10 max-h-[88dvh] overflow-y-auto custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {detailLoading || !detail ? (
                <div className="p-14 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-gold-500" />
                </div>
              ) : (
                <div className="p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-heading font-bold text-white truncate">
                        {detail.name || detail.email}
                      </h3>
                      <p className="text-sm text-slate-400 truncate">
                        {detail.email}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${PLAN_STYLES[detail.planStatus]}`}
                        >
                          {detail.planStatus}
                        </span>
                        <RoleBadge role={detail.role} />
                        {!detail.isEmailVerified && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border bg-white/5 text-slate-400 border-white/10">
                            EMAIL UNVERIFIED
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setDetail(null)}
                      className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                    {[
                      { label: 'Joined', value: fmtDate(detail.createdAt) },
                      {
                        label: 'Last active',
                        value: timeAgo(detail.lastActiveAt),
                      },
                      {
                        label: 'Trial ends',
                        value: detail.isPaid
                          ? '— (paid)'
                          : fmtDate(detail.trialEndsAt),
                      },
                      {
                        label: 'Location',
                        value:
                          [detail.city, detail.country]
                            .filter(Boolean)
                            .join(', ') || '—',
                      },
                      { label: 'Products', value: detail.batchCount },
                      { label: 'Sources', value: detail.sourceCount },
                      {
                        label: 'Social accounts',
                        value: detail.socialAccountCount,
                      },
                      {
                        label: 'Margin rule',
                        value: detail.settings
                          ? `${detail.settings.marginType === 'PERCENT' ? '+' : 'Rs. '}${detail.settings.marginValue}${detail.settings.marginType === 'PERCENT' ? '%' : ''}`
                          : '—',
                      },
                    ].map((f) => (
                      <div
                        key={f.label}
                        className="rounded-xl bg-white/[0.03] border border-white/5 px-3.5 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                          {f.label}
                        </div>
                        <div className="text-sm text-white font-medium mt-1 truncate">
                          {f.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-6">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                      Account actions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => extendTrial(detail)}
                        disabled={busy === 'extend'}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm font-semibold hover:bg-sky-500/20 transition-colors disabled:opacity-50"
                      >
                        <CalendarPlus className="w-4 h-4" /> Extend trial +30
                        days
                      </button>
                      <button
                        onClick={() => togglePaid(detail)}
                        disabled={busy === 'paid'}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        <Gift className="w-4 h-4" />{' '}
                        {detail.isPaid
                          ? 'Revoke comp access'
                          : 'Grant comp access'}
                      </button>
                      {detail.role !== 'OWNER' && detail.id !== me.id && (
                        <button
                          onClick={() => toggleBlock(detail)}
                          disabled={busy === 'block'}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-semibold hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        >
                          <Ban className="w-4 h-4" />{' '}
                          {detail.isBlocked ? 'Unblock user' : 'Block user'}
                        </button>
                      )}
                      {isOwner && detail.role === 'USER' && (
                        <button
                          onClick={() =>
                            setRole(detail.id, 'ADMIN', detail.email)
                          }
                          disabled={busy === `role-${detail.id}`}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500/10 border border-gold-500/30 text-gold-300 text-sm font-semibold hover:bg-gold-500/20 transition-colors disabled:opacity-50"
                        >
                          <Shield className="w-4 h-4" /> Make admin
                        </button>
                      )}
                      {isOwner && detail.role === 'ADMIN' && (
                        <button
                          onClick={() =>
                            setRole(detail.id, 'USER', detail.email)
                          }
                          disabled={busy === `role-${detail.id}`}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/15 text-slate-200 text-sm font-semibold hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                        >
                          <Shield className="w-4 h-4" /> Remove admin
                        </button>
                      )}
                    </div>
                    <div className="flex items-end gap-2 mt-4">
                      <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                          Storage limit — currently{' '}
                          {formatBytes(detail.storageUsed)} used of{' '}
                          {formatBytes(detail.storageLimitBytes)}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={1024}
                            value={storageGB}
                            onChange={(e) =>
                              setStorageGB(Number(e.target.value))
                            }
                            className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-gold-500/50"
                          />
                          <span className="text-sm text-slate-400">GB</span>
                        </div>
                      </div>
                      <button
                        onClick={() => saveStorage(detail)}
                        disabled={busy === 'storage'}
                        className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/15 text-sm font-semibold text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                      >
                        Save limit
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-2">
                      Lowering a limit never deletes the user&apos;s media — it
                      only gates future uploads.
                    </p>
                  </div>

                  {/* Recent batches */}
                  <div className="mt-6">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                      Recent products
                    </h4>
                    <div className="space-y-2">
                      {(detail.recentBatches || []).map((b: any) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2.5 text-sm"
                        >
                          <span className="text-slate-300 truncate">
                            {b.senderName || 'Unknown source'}
                          </span>
                          <span className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-slate-500">
                              {b.mediaCount} files · {timeAgo(b.createdAt)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${b.status === 'FAILED' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : b.status === 'PUBLISHED' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-slate-300 border-white/10'}`}
                            >
                              {b.status}
                            </span>
                          </span>
                        </div>
                      ))}
                      {(detail.recentBatches || []).length === 0 && (
                        <p className="text-sm text-slate-500">
                          No products ingested yet.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Per-user audit trail */}
                  {(detail.auditTrail || []).length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Admin history for this user
                      </h4>
                      <div className="space-y-2">
                        {detail.auditTrail.map((entry: any) => (
                          <div
                            key={entry.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2.5"
                          >
                            <span className="text-slate-300 font-medium">
                              {AUDIT_LABELS[entry.action] || entry.action}
                            </span>
                            <span className="text-xs text-slate-500">
                              by {entry.actorEmail} · {auditDetailText(entry)}
                            </span>
                            <span className="ml-auto text-xs text-slate-600">
                              {timeAgo(entry.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex items-center gap-2 text-xs text-slate-600">
                    <Megaphone className="w-3.5 h-3.5" />
                    Every action on this screen is written to the audit log.
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
