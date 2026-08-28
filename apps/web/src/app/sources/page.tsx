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
      <div className="flex h-full min-h-[500px] items-center justify-center">
        <Loader2 className="w-8 h-8 text-electric-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Header Panel */}
      <div className="glass-card p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b-2 border-b-electric-cyan/20">
        <div>
          <h2 className="text-2xl font-heading font-bold text-white flex items-center gap-3">
            <Power className="w-6 h-6 text-electric-cyan" />
            Active Data Sources
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Configure which node clusters are authorized to transmit payload streams into the bridge.
            Disconnected nodes will have their packets dropped at the firewall.
          </p>
        </div>
        
        <button
          onClick={syncGroups}
          disabled={syncing}
          className="btn-glow flex items-center justify-center gap-2 px-6 py-3 w-full sm:w-auto"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {syncing ? "Synchronizing Nodes..." : "Sync Device Nodes"}
        </button>
      </div>

      {/* Main Board */}
      <div className="glass-card overflow-hidden flex flex-col min-h-[500px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-graphite-border bg-graphite/40 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Query by Node ID or Alias..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-graphite-darker/50 border border-graphite-border rounded-xl text-sm text-white focus:outline-none focus:border-electric-cyan transition-all placeholder-slate-500"
            />
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-400 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={filteredSources.length > 0 && selectedIds.size === filteredSources.length}
                onChange={handleSelectAll}
                className="w-4 h-4 text-electric-cyan rounded border-slate-600 bg-graphite-darker checked:bg-electric-cyan focus:ring-electric-cyan"
              />
              Select All Nodes
            </label>
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleBulkDelete}
                  disabled={isDeletingBulk}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                >
                  {isDeletingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Purge ({selectedIds.size})
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Node Grid */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-graphite-darker/30">
          {filteredSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <div className="w-20 h-20 mb-4 rounded-3xl bg-graphite border border-graphite-border flex items-center justify-center shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-electric-cyan/5 blur-xl" />
                <Power className="w-8 h-8 text-slate-600 relative z-10" />
              </div>
              <p className="font-heading font-bold text-white text-lg mb-2">No Active Nodes</p>
              <p className="text-sm text-center max-w-sm text-slate-400">
                Execute a node sync or connect a primary device to populate the matrix.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {filteredSources.map((source) => (
                  <motion.div
                    key={source.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`flex items-center justify-between p-4 rounded-xl border backdrop-blur-md transition-all duration-300 ${
                      source.isEnabled 
                        ? 'bg-electric-cyan/5 border-electric-cyan/30 shadow-[0_0_15px_rgba(0,255,255,0.05)]' 
                        : 'bg-graphite/40 border-graphite-border opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-4 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(source.id)}
                        onChange={() => toggleSelection(source.id)}
                        className="w-4 h-4 text-electric-cyan rounded border-slate-600 bg-graphite-darker checked:bg-electric-cyan focus:ring-electric-cyan ml-1 cursor-pointer"
                      />
                      
                      {/* Node Icon */}
                      <div className={`p-3 rounded-xl border relative overflow-hidden transition-colors duration-500 ${
                        source.isEnabled 
                          ? 'bg-graphite border-electric-cyan/30' 
                          : 'bg-graphite-darker border-graphite-border'
                      }`}>
                        {source.isEnabled && (
                           <div className="absolute inset-0 bg-electric-cyan/10 blur-md" />
                        )}
                        <div className="relative z-10">
                          {getIcon(source.type)}
                        </div>
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        {editingId === source.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveSourceName(source.id)}
                              className="px-2 py-1 text-sm font-bold text-white bg-graphite-darker border border-electric-cyan rounded focus:outline-none w-full"
                              autoFocus
                            />
                            <button onClick={() => saveSourceName(source.id)} className="p-1.5 text-electric-emerald bg-electric-emerald/10 hover:bg-electric-emerald/20 border border-electric-emerald/20 rounded-md transition-colors">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 bg-graphite hover:text-white border border-graphite-border rounded-md transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/name cursor-pointer" onClick={() => {
                            setEditingId(source.id);
                            setEditName(source.name);
                          }}>
                            <p className={`font-bold truncate transition-colors ${
                               source.isEnabled ? 'text-white' : 'text-slate-300'
                            }`}>
                              {source.name}
                            </p>
                            <Pencil className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                          </div>
                        )}
                        <p className="text-xs font-medium text-slate-400 truncate mt-1 font-mono flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${source.isEnabled ? 'bg-electric-cyan shadow-[0_0_5px_#00E5FF]' : 'bg-slate-600'}`} />
                          {source.jid}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => deleteSource(source.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                        title="Purge Node"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      {/* Hardware Toggle */}
                      <button
                        onClick={() => toggleSource(source.id, source.isEnabled)}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 shadow-inner outline-none ${
                          source.isEnabled 
                            ? 'bg-electric-cyan/20 border border-electric-cyan/50' 
                            : 'bg-graphite-darker border border-graphite-border'
                        }`}
                      >
                        <span className="sr-only">Toggle Node Power</span>
                        <span
                          className={`inline-block h-6 w-6 transform rounded-full transition-transform duration-300 shadow-md ${
                            source.isEnabled 
                              ? 'translate-x-7 bg-electric-cyan shadow-[0_0_10px_#00E5FF]' 
                              : 'translate-x-1 bg-slate-500'
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
