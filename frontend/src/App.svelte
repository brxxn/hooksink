<script lang="ts">
  import RequestLog from './components/RequestLog.svelte';
  import RouteEditor from './components/RouteEditor.svelte';
  
  let activeTab: 'logs' | 'routes' = 'logs';
</script>

<div class="h-screen w-screen flex flex-col bg-[#0a0a0b] overflow-hidden text-slate-200">
  <!-- Thin Edge-to-Edge Topbar -->
  <header class="h-14 bg-[#141415] border-b border-white/5 flex items-center justify-between px-4 shrink-0 z-20">
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-2">
        <span class="text-xl leading-none">🪝</span>
        <span class="font-semibold tracking-wide text-white">hook<span class="text-slate-400">sink</span></span>
      </div>

      <!-- Navigation Tabs inline in topbar -->
      <nav class="flex items-center gap-1 border-l border-white/10 pl-6">
        <button 
          on:click={() => activeTab = 'logs'}
          class="px-3 py-1.5 rounded text-xs font-medium transition-colors {activeTab === 'logs' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}"
        >
          Logs
        </button>
        <button 
          on:click={() => activeTab = 'routes'}
          class="px-3 py-1.5 rounded text-xs font-medium transition-colors {activeTab === 'routes' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}"
        >
          Routes
        </button>
      </nav>
    </div>
  </header>

  <!-- Main Application Body -->
  <main class="flex-1 overflow-hidden relative flex flex-col">
    {#if activeTab === 'logs'}
      <RequestLog />
    {:else}
      <RouteEditor />
    {/if}
  </main>
</div>
