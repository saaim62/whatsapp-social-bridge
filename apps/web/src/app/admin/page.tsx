"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Users, HardDrive, Activity, Archive, ArrowRight,
  TrendingUp, Clock, Cloud
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";
import { API_URL, fetchWithAuth } from "@/lib/api";

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Storage Modal State
  const [editingStorageUserId, setEditingStorageUserId] = useState<string | null>(null);
  const [newStorageGB, setNewStorageGB] = useState<number>(5);
  const [isUpdatingStorage, setIsUpdatingStorage] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, usersRes] = await Promise.all([
          fetchWithAuth(`${API_URL}/api/admin/stats`),
          fetchWithAuth(`${API_URL}/api/admin/users`)
        ]);

        if (statsRes.status === 403 || usersRes.status === 403) {
          router.push("/dashboard");
          return;
        }

        if (!statsRes.ok || !usersRes.ok) {
          throw new Error("Failed to fetch admin data");
        }

        const [statsData, usersData] = await Promise.all([
          statsRes.json(),
          usersRes.json()
        ]);

        setStats(statsData);
        setUsers(usersData);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-electric-cyan"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <div className="text-electric-magenta font-bold text-xl">Access Denied or Error</div>
        <p className="text-slate-400">{error}</p>
        <button onClick={() => router.push("/dashboard")} className="btn-glow px-6 py-2 rounded-xl border border-electric-cyan/30 text-electric-cyan hover:bg-electric-cyan/10 transition-colors">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-extrabold text-white tracking-tight">Admin Console</h1>
        <p className="text-slate-400 mt-1 font-medium">Enterprise Analytics & System Overview</p>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            title: "Total Users",
            value: stats?.totalUsers || 0,
            icon: Users,
            color: "text-electric-cyan",
            bg: "bg-electric-cyan/10",
            border: "border-electric-cyan/20",
          },
          {
            title: "App Data Storage",
            value: formatBytes(stats?.totalStorageBytes || 0),
            icon: HardDrive,
            color: "text-electric-emerald",
            bg: "bg-electric-emerald/10",
            border: "border-electric-emerald/20",
          },
          {
            title: "Server Disk",
            value: formatBytes(stats?.serverStorageConsumedBytes || 0),
            subValue: `of ${formatBytes(stats?.serverStorageTotalBytes || 0)}`,
            progress: stats?.serverStorageTotalBytes ? (stats.serverStorageConsumedBytes / stats.serverStorageTotalBytes) * 100 : 0,
            icon: HardDrive,
            color: "text-electric-magenta",
            bg: "bg-electric-magenta/10",
            border: "border-electric-magenta/20",
          },
          {
            title: "Media Processed",
            value: stats?.totalMediaCount || 0,
            icon: Archive,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
          },
          {
            title: "Active Pipelines",
            value: stats?.activePipelines || 0,
            icon: Activity,
            color: "text-brand-400",
            bg: "bg-brand-500/10",
            border: "border-brand-500/20",
          },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`glass-card rounded-2xl border ${stat.border} p-5 hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] hover:border-electric-cyan/40 transition-all`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} border ${stat.border}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-400 leading-tight uppercase tracking-widest">{stat.title}</p>
                <div className="flex flex-wrap items-baseline gap-x-1.5 mt-1">
                  <h3 className="text-lg sm:text-xl font-heading font-bold text-white">{stat.value}</h3>
                  {stat.subValue && <span className="text-[10px] font-semibold text-slate-500">{stat.subValue}</span>}
                </div>
                {stat.progress !== undefined && (
                  <div className="mt-2.5 w-full bg-graphite-darker rounded-full h-1.5 overflow-hidden border border-graphite-border">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${stat.progress > 85 ? 'bg-electric-magenta shadow-[0_0_5px_#FF00FF]' : 'bg-electric-cyan shadow-[0_0_5px_#00F0FF]'}`} 
                      style={{ width: `${Math.min(100, Math.max(0, stat.progress))}%` }} 
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Cloudflare R2 Cloud Storage */}
      {stats?.r2Accounts && stats.r2Accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.r2Accounts.map((acc: any, i: number) => {
            const usagePercent = acc.limitBytes ? (acc.usageBytes / acc.limitBytes) * 100 : 0;
            return (
              <motion.div
                key={acc.id || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="glass-card rounded-2xl border border-sky-500/20 p-5 bg-sky-950/10 hover:border-sky-500/40 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white uppercase tracking-wider">Cloudflare R2 Account {i + 1}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-semibold">Active</span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">Bucket: {acc.bucketName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-heading text-white">{formatBytes(acc.usageBytes || 0)}</div>
                    <div className="text-[10px] text-slate-500 font-medium">of {formatBytes(acc.limitBytes)}</div>
                  </div>
                </div>
                <div className="mt-3.5 w-full bg-graphite-darker rounded-full h-2 overflow-hidden border border-graphite-border">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(2, usagePercent))}%` }}
                  />
                </div>
                {acc.publicUrl && (
                  <p className="text-[10px] text-slate-500 font-mono mt-2 truncate">CDN: {acc.publicUrl}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-6 rounded-2xl border border-graphite-border shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-heading font-bold text-white">User Activity</h3>
              <p className="text-sm text-slate-400">Active users over the last 7 days</p>
            </div>
            <TrendingUp className="text-electric-cyan w-5 h-5" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.activeUsersByDay || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <RechartsTooltip 
                  cursor={{ fill: '#1e293b' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' }}
                  labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                  itemStyle={{ color: '#00F0FF' }}
                />
                <Bar dataKey="count" fill="#00F0FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 rounded-2xl border border-graphite-border shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-heading font-bold text-white">Storage Growth</h3>
              <p className="text-sm text-slate-400">Bytes uploaded over the last 30 days</p>
            </div>
            <HardDrive className="text-electric-emerald w-5 h-5" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.storageByDay || []}>
                <defs>
                  <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00FFA3" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00FFA3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => formatBytes(val as number, 0)}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' }}
                  labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                  formatter={(value: any) => [formatBytes(value as number), 'Storage']}
                  itemStyle={{ color: '#00FFA3' }}
                />
                <Area type="monotone" dataKey="size" stroke="#00FFA3" strokeWidth={3} fillOpacity={1} fill="url(#colorSize)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Users Data Table */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]"
      >
        <div className="px-6 py-5 border-b border-graphite-border bg-graphite/40 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-heading font-bold text-white">User Directory</h3>
            <p className="text-sm text-slate-400">Detailed analytics per user</p>
          </div>
        </div>
        
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-graphite-border bg-graphite-darker/50 text-xs uppercase font-bold text-slate-400 tracking-wider">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Batches</th>
                <th className="px-6 py-4">Storage (Used / Limit)</th>
                <th className="px-6 py-4">Remaining</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-border/50 text-sm">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-graphite-darker/30 transition-colors group ${user.isBlocked ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{user.name || 'Unnamed User'}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[10px] uppercase tracking-widest font-bold ${
                      user.role === 'ADMIN' ? 'bg-brand-500/20 border-brand-500/30 text-brand-400' : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-medium text-xs">
                    {user.city || user.country ? `${user.city || ''}, ${user.country || ''}` : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-medium">{user.batchCount}</td>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                    <span className="font-bold text-electric-cyan">{formatBytes(user.storageUsed || 0)}</span> / {formatBytes(user.storageLimitBytes || 5368709120)}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const limit = user.storageLimitBytes || 5368709120;
                      const remaining = Math.max(0, limit - user.storageUsed);
                      const percentUsed = Math.min(100, (user.storageUsed / limit) * 100);
                      return (
                        <div className="flex flex-col gap-1.5 w-24">
                          <span className="text-xs font-mono font-semibold text-slate-400">{formatBytes(remaining)}</span>
                          <div className="h-1 w-full bg-graphite-darker rounded-full overflow-hidden border border-graphite-border">
                            <div 
                              className={`h-full rounded-full shadow-[0_0_5px_currentColor] ${percentUsed > 90 ? 'bg-electric-magenta text-electric-magenta' : percentUsed > 75 ? 'bg-amber-500 text-amber-500' : 'bg-electric-emerald text-electric-emerald'}`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      {user.isBlocked ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider bg-red-500/10 border-red-500/20 text-red-400">Blocked</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider bg-electric-emerald/10 border-electric-emerald/20 text-electric-emerald">Active</span>
                      )}
                      {!user.isPaid && user.trialEndsAt && new Date(user.trialEndsAt) < new Date() ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border-amber-500/20 text-amber-500">Trial Expired</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(user.lastActiveAt).toLocaleString(undefined, { 
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          setEditingStorageUserId(user.id);
                          setNewStorageGB((user.storageLimitBytes || 5368709120) / (1024 * 1024 * 1024));
                        }}
                        className="px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-bold bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/20 hover:bg-electric-cyan/20 transition-colors"
                      >
                        Manage Storage
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            await fetchWithAuth(`${API_URL}/api/admin/users/${user.id}/block`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ isBlocked: !user.isBlocked })
                            });
                            setUsers(users.map(u => u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u));
                          } catch (err) {
                            alert("Failed to update user block status");
                          }
                        }}
                        className={`px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-bold border transition-colors ${user.isBlocked ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'}`}
                      >
                        {user.isBlocked ? 'Unblock Account' : 'Block Account'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Storage Management Modal */}
      {editingStorageUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 border border-graphite-border relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand-500 via-electric-cyan to-brand-500" />
            <div className="flex items-center gap-3 mb-4 mt-2">
              <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-heading font-bold text-white">Manage Storage Limit</h3>
            </div>
            
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Assign a new storage quota in Gigabytes (GB). If you reduce the limit below the user's current usage, the excess older files will be securely migrated to external cloud storage and removed from their active DropRoute account.
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">New Quota (GB)</label>
              <input 
                type="number"
                min="1"
                step="1"
                value={newStorageGB}
                onChange={(e) => setNewStorageGB(parseFloat(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-graphite-border bg-graphite-darker/50 focus:bg-graphite focus:outline-none focus:border-electric-cyan focus:ring-1 focus:ring-electric-cyan transition-all text-white font-mono"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditingStorageUserId(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-graphite transition-colors"
                disabled={isUpdatingStorage}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsUpdatingStorage(true);
                  try {
                    const bytes = newStorageGB * 1024 * 1024 * 1024;
                    const res = await fetchWithAuth(`${API_URL}/api/admin/users/${editingStorageUserId}/storage`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ storageLimitBytes: bytes })
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setUsers(users.map(u => u.id === editingStorageUserId ? { ...u, storageLimitBytes: data.storageLimitBytes } : u));
                      setEditingStorageUserId(null);
                    } else {
                      alert("Failed to update storage.");
                    }
                  } catch (e) {
                    alert("Error updating storage.");
                  } finally {
                    setIsUpdatingStorage(false);
                  }
                }}
                disabled={isUpdatingStorage}
                className="btn-glow px-5 py-2 rounded-xl text-sm font-bold bg-brand-500 text-white hover:bg-brand-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isUpdatingStorage ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
