<script lang="ts">
  import { onMount } from 'svelte';
  import { getLogs, clearLogs, inflateBase64 } from '../lib/api';
  import { connectWebsocket } from '../lib/ws';
  import { fade, slide } from 'svelte/transition';

  let logs: any[] = [];
  let seenLogs = new Set<string>();
  let loading = true;
  let loadingMore = false;
  let activeLog: any = null;
  let error = '';

  let currentPage = 1;
  let totalPages = 1;
  let totalRecords = 0;

  let searchQuery = '';
  let searchTimeout: any;

  function handleScroll(e: any) {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    // Trigger 50px before absolute bottom intersection
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      if (!loadingMore && currentPage < totalPages) {
        loadPage(currentPage + 1);
      }
    }
  }

  function onSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadPage(1, true);
    }, 300);
  }

  async function loadPage(page: number, reset = false) {
    if (reset) {
      loading = true;
      logs = [];
      seenLogs.clear();
      activeLog = null;
    } else {
      loadingMore = true;
    }

    try {
      const res = await getLogs(page, 50, searchQuery);
      
      const incomingLogs = res.data || [];
      const newLogs = incomingLogs.filter((log: any) => !seenLogs.has(log.id));
      
      for (const log of newLogs) {
        seenLogs.add(log.id);
      }
      
      logs = [...logs, ...newLogs];
      
      currentPage = res.meta?.page || 1;
      totalPages = res.meta?.totalPages || 1;
      totalRecords = res.meta?.total || 0;

      if (reset && logs.length > 0) activeLog = logs[0];
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  onMount(async () => {
    await loadPage(1);

    try {
      const socket = await connectWebsocket();
      if (socket) {
        socket.on('new_request', (data) => {
          if (searchQuery && !data.path.toLowerCase().includes(searchQuery.toLowerCase())) {
            return;
          }

          if (data.body) {
            data.body = inflateBase64(data.body, data.bodyType);
          }

          if (!seenLogs.has(data.id)) {
            logs = [data, ...logs];
            seenLogs.add(data.id);
            totalRecords += 1;
          }
        });
      }
    } catch (e: any) {
      console.error('WebSocket connection failed:', e);
    }
  });

  function formatTime(isoString: string) {
    return new Date(isoString).toLocaleTimeString();
  }

  function getMethodColor(method: string) {
    const list: Record<string, string> = {
      GET: 'text-blue-400',
      POST: 'text-green-400',
      PUT: 'text-yellow-400',
      DELETE: 'text-red-400',
    };
    return list[method] || 'text-gray-400';
  }

  async function handleClearAll() {
    if (confirm("Are you sure you want to permanently clear all request logs? This cannot be undone.")) {
      loading = true;
      try {
        await clearLogs();
        logs = [];
        seenLogs.clear();
        totalRecords = 0;
        activeLog = null;
        currentPage = 1;
        totalPages = 1;
      } catch (e: any) {
        error = e.message;
      } finally {
        loading = false;
      }
    }
  }

  function copyBody(body: any) {
    const text = typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body);
    navigator.clipboard.writeText(text);
  }

  function downloadBody(body: any, id: string) {
    const text = typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payload-${id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="flex h-full w-full bg-[#1e1e1e]">
  
  <!-- Left Sidebar: Request List -->
  <div class="w-80 flex flex-col border-r border-white/5 bg-[#181818] shrink-0">
    <div class="px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0 bg-black/20">
      <div class="flex items-center gap-2 w-full pr-2">
        <svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <input 
          type="text" 
          placeholder="Search..." 
          bind:value={searchQuery}
          on:input={onSearchInput}
          class="bg-transparent border-none outline-none text-xs text-slate-300 w-full placeholder-slate-600 font-mono"
        />
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <button on:click={handleClearAll} title="Clear All Requests" class="text-slate-500 hover:text-red-400 transition-colors active:scale-95" aria-label="Clear All Requests">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto" on:scroll={handleScroll}>
      {#if loading}
        <div class="p-8 flex justify-center">
          <div class="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
        </div>
      {:else if error}
        <div class="p-4 text-xs text-red-400 text-center">{error}</div>
      {:else if logs.length === 0}
        <div class="p-8 text-center text-slate-500 text-xs">Waiting for incoming traffic...</div>
      {:else}
        <div class="flex flex-col gap-px">
          {#each logs as log (log.id)}
            <button 
              in:slide|local={{ duration: 250 }}
              on:click={() => activeLog = log}
              class="w-full text-left px-4 py-3 border-b border-white/[0.02] transition-colors flex flex-col gap-1.5 {activeLog?.id === log.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-white/5 border-l-2 border-l-transparent'}"
            >
              <div class="flex justify-between items-center w-full">
                <span class={`font-mono text-xs font-bold ${getMethodColor(log.method)}`}>{log.method}</span>
                <span class="text-slate-500 font-mono text-[10px]">{formatTime(log.timestamp || log.createdAt)}</span>
              </div>
              <span class="font-mono text-xs text-slate-300 truncate w-full">{log.path}</span>
            </button>
          {/each}
          {#if loadingMore}
            <div class="p-4 flex justify-center border-b border-white/[0.02]">
              <div class="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Main View: Request Details -->
  <div class="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
    {#if !activeLog}
      <div class="w-full h-full flex flex-col items-center justify-center text-slate-500">
        <svg class="w-16 h-16 opacity-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p class="text-sm">Select a request to inspect</p>
      </div>
    {:else}
      <!-- Header block -->
      <div class="px-6 py-4 border-b border-white/5 bg-[#1a1a1a] flex gap-4 items-center shrink-0">
        <span class={`font-mono text-lg font-bold ${getMethodColor(activeLog.method)}`}>{activeLog.method}</span>
        <span class="text-slate-200 font-mono text-sm tracking-wide truncate">{activeLog.path}</span>
      </div>

      <!-- Detail Panes -->
      <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        
        <!-- Metadata -->
        <div class="grid grid-cols-2 gap-4 max-w-2xl">
          <div class="bg-black/20 border border-white/5 rounded-lg p-3">
            <h4 class="text-[10px] text-slate-500 uppercase font-medium mb-1">Timestamp</h4>
            <span class="font-mono text-xs text-slate-300">{new Date(activeLog.timestamp || activeLog.createdAt).toISOString()}</span>
          </div>
          <div class="bg-black/20 border border-white/5 rounded-lg p-3">
            <h4 class="text-[10px] text-slate-500 uppercase font-medium mb-1">Log ID</h4>
            <span class="font-mono text-xs text-slate-300 truncate">{activeLog.id}</span>
          </div>
        </div>

        <!-- Query Parameters -->
        {#if activeLog?.query && Object.keys(activeLog.query).length > 0}
          <div class="flex flex-col gap-2">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Query Parameters</h3>
            <div class="bg-[#141414] border border-white/10 rounded-lg overflow-hidden">
              {#each Object.entries(activeLog.query) as [key, val]}
                <div class="flex border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <div class="w-1/3 min-w-[200px] border-r border-white/5 px-4 py-2 font-mono text-xs text-purple-400">{key}</div>
                  <div class="flex-1 px-4 py-2 font-mono text-xs text-slate-300 break-all">{val}</div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Headers -->
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Headers</h3>
          <div class="bg-[#141414] border border-white/10 rounded-lg overflow-hidden">
            {#each Object.entries(activeLog.headers || {}) as [key, val]}
              <div class="flex border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <div class="w-1/3 min-w-[200px] border-r border-white/5 px-4 py-2 font-mono text-xs text-blue-300">{key}</div>
                <div class="flex-1 px-4 py-2 font-mono text-xs text-slate-300 break-all">{val}</div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Body -->
        <div class="flex flex-col gap-2 flex-grow min-h-[300px]">
          <div class="flex items-center justify-between pl-1">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Body Data</h3>
            <div class="flex items-center gap-2">
              {#if activeLog.body}
                <button on:click={() => copyBody(activeLog.body)} class="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1 rounded font-mono uppercase transition-colors active:scale-95">Copy</button>
                <button on:click={() => downloadBody(activeLog.body, activeLog.id)} class="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1 rounded font-mono uppercase transition-colors active:scale-95">Download</button>
              {/if}
              <span class="text-[10px] bg-white/10 text-white px-2 py-1 rounded font-mono uppercase ml-2">{activeLog.bodyType}</span>
            </div>
          </div>
          
          <div class="bg-[#141414] border border-white/10 rounded-lg flex-1 overflow-hidden flex flex-col p-4 relative content-start">
            {#if activeLog.body}
              <pre class="font-mono text-xs text-left text-green-300 break-words whitespace-pre-wrap overflow-auto h-full outline-none">{typeof activeLog.body === 'object' ? JSON.stringify(activeLog.body, null, 2) : activeLog.body}</pre>
            {:else}
              <span class="text-slate-500 italic text-sm m-auto">No body content</span>
            {/if}
          </div>
        </div>

      </div>
    {/if}
  </div>
</div>
