"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Users, HardDrive, Activity, Archive, ArrowRight,
  TrendingUp, Clock
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <div className="text-rose-500 font-bold text-xl">Access Denied or Error</div>
        <p className="text-slate-500">{error}</p>
        <button onClick={() => router.push("/dashboard")} className="btn-secondary px-6 py-2">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Console</h1>
        <p className="text-slate-500 mt-1">Enterprise Analytics & System Overview</p>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            title: "Total Users",
            value: stats?.totalUsers || 0,
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-100",
          },
          {
            title: "App Data Storage",
            value: formatBytes(stats?.totalStorageBytes || 0),
            icon: HardDrive,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-100",
          },
          {
            title: "Server Disk",
            value: formatBytes(stats?.serverStorageConsumedBytes || 0),
            subValue: `of ${formatBytes(stats?.serverStorageTotalBytes || 0)}`,
            progress: stats?.serverStorageTotalBytes ? (stats.serverStorageConsumedBytes / stats.serverStorageTotalBytes) * 100 : 0,
            icon: HardDrive,
            color: "text-rose-600",
            bg: "bg-rose-50",
            border: "border-rose-100",
          },
          {
            title: "Media Processed",
            value: stats?.totalMediaCount || 0,
            icon: Archive,
            color: "text-amber-600",
            bg: "bg-amber-50",
            border: "border-amber-100",
          },
          {
            title: "Active Pipelines",
            value: stats?.activePipelines || 0,
            icon: Activity,
            color: "text-brand-600",
            bg: "bg-brand-50",
            border: "border-brand-100",
          },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`bg-white rounded-2xl border ${stat.border} p-5 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-slate-500 leading-tight">{stat.title}</p>
                <div className="flex flex-wrap items-baseline gap-x-1.5 mt-0.5">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">{stat.value}</h3>
                  {stat.subValue && <span className="text-[10px] font-semibold text-slate-400">{stat.subValue}</span>}
                </div>
                {stat.progress !== undefined && (
                  <div className="mt-2.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${stat.progress > 85 ? 'bg-rose-500' : 'bg-brand-500'}`} 
                      style={{ width: `${Math.min(100, Math.max(0, stat.progress))}%` }} 
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">User Activity</h3>
              <p className="text-sm text-slate-500">Active users over the last 7 days</p>
            </div>
            <TrendingUp className="text-slate-400 w-5 h-5" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.activeUsersByDay || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <RechartsTooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Storage Growth</h3>
              <p className="text-sm text-slate-500">Bytes uploaded over the last 30 days</p>
            </div>
            <HardDrive className="text-slate-400 w-5 h-5" />
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.storageByDay || []}>
                <defs>
                  <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => formatBytes(val as number, 0)}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(label: any) => new Date(label).toLocaleDateString()}
                  formatter={(value: any) => [formatBytes(value as number), 'Storage']}
                />
                <Area type="monotone" dataKey="size" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSize)" />
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
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">User Directory</h3>
            <p className="text-sm text-slate-500">Detailed analytics per user</p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase font-bold text-slate-500 tracking-wider">
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
            <tbody className="divide-y divide-slate-100 text-sm">
              {users.map((user) => (
                <tr key={user.id} className={`hover:bg-slate-50 transition-colors group ${user.isBlocked ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{user.name || 'Unnamed User'}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium text-xs">
                    {user.city || user.country ? `${user.city || ''}, ${user.country || ''}` : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{user.batchCount}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <span className="font-bold text-brand-600">{formatBytes(user.storageUsed || 0)}</span> / {formatBytes(user.storageLimitBytes || 5368709120)}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const limit = user.storageLimitBytes || 5368709120;
                      const remaining = Math.max(0, limit - user.storageUsed);
                      const percentUsed = Math.min(100, (user.storageUsed / limit) * 100);
                      return (
                        <div className="flex flex-col gap-1 w-24">
                          <span className="text-xs font-semibold text-slate-600">{formatBytes(remaining)}</span>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${percentUsed > 90 ? 'bg-rose-500' : percentUsed > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {user.isBlocked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">Blocked</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Active</span>
                      )}
                      {!user.isPaid && user.trialEndsAt && new Date(user.trialEndsAt) < new Date() ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">Trial Expired</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Clock className="w-4 h-4" />
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
                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors"
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
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${user.isBlocked ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                      >
                        {user.isBlocked ? 'Unblock Account' : 'Block Account'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 border border-slate-200"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Manage Storage Limit</h3>
            </div>
            
            <p className="text-sm text-slate-500 mb-6">
              Assign a new storage quota in Gigabytes (GB). If you reduce the limit below the user's current usage, the excess older files will be securely migrated to external cloud storage and removed from their active DropRoute account.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Quota (GB)</label>
              <input 
                type="number"
                min="1"
                step="1"
                value={newStorageGB}
                onChange={(e) => setNewStorageGB(parseFloat(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-900 font-semibold"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditingStorageUserId(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
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
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/25 flex items-center gap-2 disabled:opacity-50"
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
