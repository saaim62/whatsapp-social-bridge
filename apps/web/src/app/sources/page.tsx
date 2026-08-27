"use client";

import { useState, useEffect } from "react";
import { API_URL, fetchWithAuth } from "@/lib/api";
import { Search, RefreshCw, Radio, Users, User, Power, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SourcesPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const fetchSources = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const toggleSource = async (id: string, currentStatus: boolean) => {
    // Optimistic UI update
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isEnabled: !currentStatus } : s))
    );
    try {
      await fetchWithAuth(`${API_URL}/api/sources/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !currentStatus }),
      });
    } catch (err) {
      console.error(err);
      // Revert on error
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isEnabled: currentStatus } : s))
      );
    }
  };

  const deleteSource = async (id: string) => {
    // Optimistic UI update
    const previous = [...sources];
    setSources(sources.filter(s => s.id !== id));
    try {
      await fetchWithAuth(`${API_URL}/api/sources/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error(err);
      setSources(previous);
      alert("Failed to delete source");
    }
  };

  const saveSourceName = async (id: string) => {
    if (!editName.trim()) return;
    const previous = [...sources];
    setSources(sources.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
    setEditingId(null);
    try {
      await fetchWithAuth(`${API_URL}/api/sources/${id}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
    } catch (err) {
      console.error(err);
      setSources(previous);
      alert("Failed to update name");
    }
  };

  const syncGroups = async () => {
    setSyncing(true);
    try {
      const res = await fetchWithAuth(`${API_URL}/api/sources/sync`, { method: "POST" });
      if (res.ok) {
        await fetchSources();
      } else {
        alert("Failed to sync. Make sure your WhatsApp is connected.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to sync groups");
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredSources.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} sources?`)) return;
    
    setIsDeletingBulk(true);
    const idsToDelete = Array.from(selectedIds);
    const previous = [...sources];
    
    setSources(sources.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
    
    try {
      const res = await fetchWithAuth(`${API_URL}/api/sources/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    } catch (err) {
      console.error(err);
      setSources(previous);
      alert("Failed to delete selected sources");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const filteredSources = sources.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.jid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getIcon = (type: string) => {
    switch (type) {
      case "GROUP": return <Users className="w-5 h-5 text-brand-500" />;
      case "CHANNEL": return <Radio className="w-5 h-5 text-violet-500" />;
      default: return <User className="w-5 h-5 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">Allowed Sources</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Toggle which groups or channels are allowed to forward products to the bridge.
            Messages from disabled sources will be completely ignored.
          </p>
        </div>
        
        <button
          onClick={syncGroups}
          disabled={syncing}
          className="btn-gradient flex items-center justify-center gap-2 px-5 py-2.5 shadow-sm disabled:opacity-50 w-full sm:w-auto"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {syncing ? "Syncing..." : "Sync Contacts & Groups"}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filteredSources.length > 0 && selectedIds.size === filteredSources.length}
                onChange={handleSelectAll}
                className="w-4 h-4 text-brand-500 rounded border-slate-300 focus:ring-brand-500"
              />
              Select All
            </label>
            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={isDeletingBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {filteredSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Users className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-medium">No sources found.</p>
              <p className="text-sm mt-1 text-center max-w-sm">
                Try clicking "Sync WhatsApp Groups" to pull your active groups, or receive a message from a new group to auto-register it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <AnimatePresence>
                {filteredSources.map((source) => (
                  <motion.div
                    key={source.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      source.isEnabled 
                        ? 'bg-brand-50/30 border-brand-100 shadow-sm' 
                        : 'bg-white border-slate-100 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-4 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(source.id)}
                        onChange={() => toggleSelection(source.id)}
                        className="w-4 h-4 text-brand-500 rounded border-slate-300 focus:ring-brand-500 ml-2"
                      />
                      <div className={`p-2.5 rounded-xl ${
                        source.isEnabled ? 'bg-white shadow-sm' : 'bg-slate-50'
                      }`}>
                        {getIcon(source.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {editingId === source.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveSourceName(source.id)}
                              className="px-2 py-1 text-sm font-bold text-slate-900 bg-white border border-brand-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-full"
                              autoFocus
                            />
                            <button onClick={() => saveSourceName(source.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/name cursor-pointer" onClick={() => {
                            setEditingId(source.id);
                            setEditName(source.name);
                          }}>
                            <p className="font-bold text-slate-900 truncate">
                              {source.name}
                            </p>
                            <Pencil className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                          </div>
                        )}
                        <p className="text-xs font-medium text-slate-500 truncate mt-0.5 font-mono">
                          {source.jid}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => deleteSource(source.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleSource(source.id, source.isEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                          source.isEnabled ? 'bg-brand-500' : 'bg-slate-200'
                        }`}
                      >
                        <span className="sr-only">Toggle Source</span>
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                            source.isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
