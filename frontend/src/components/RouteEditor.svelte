<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authFetch } from '../lib/api';
  import loader from '@monaco-editor/loader';

  let routes: any[] = [];
  let isEditing = false;
  let activeRoute: any = null;

  const DEFAULT_JS = `/**
 * Hooksink Sandbox Interceptor
 * 
 * You have full access to standard JavaScript APIs.
 * The incoming HTTP request is exposed logically via the \`req\` object natively:
 * - request.method   (e.g., 'POST')
 * - request.path     (e.g., '/custom-webhook')
 * - request.headers  (e.g., req.headers['content-type'])
 * - request.query    (e.g., { id: req.query.id })
 * - request.body     (e.g., '{"raw": true}') (Note: Parsed natively as a UTF-8 string)
 * 
 * Must modify global response object.
 */

response = {
  status: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ received: true, method: request.method })
};`

  // Form State
  let routePath = '/';
  let isRegex = false;
  let handlerType = 'JAVASCRIPT';
  let editorContent = DEFAULT_JS;
  let fileData: string | null = null;
  let fileName: string = '';
  // Header building
  let headerKey = '';
  let headerValue = '';
  let responseHeaders: Record<string, string> = {};

  async function loadRoutes() {
    const res = await authFetch('/routes');
    if (res.ok) {
      routes = await res.json();
    }
  }

  onMount(loadRoutes);

  function editRoute(route: any) {
    activeRoute = route;
    isEditing = true;
    routePath = route.path;
    isRegex = !!route.isRegex;
    handlerType = route.handlerType;
    editorContent = route.content || DEFAULT_JS;
    fileData = route.fileData || null;
    responseHeaders = route.responseHeaders || {};
    fileName = route.fileData ? 'Stored File Buffer' : '';
  }

  function createNew() {
    activeRoute = null;
    isEditing = true;
    routePath = '/custom';
    isRegex = false;
    handlerType = 'JAVASCRIPT';
    editorContent = DEFAULT_JS;
    fileData = null;
    fileName = '';
    responseHeaders = { 'Content-Type': 'application/json' };
  }

  function monacoAction(node: HTMLElement, initialContent: string) {
    let editor: any;
    loader.init().then(monaco => {
      editor = monaco.editor.create(node, {
        value: initialContent,
        language: 'javascript',
        theme: 'vs-dark',
        minimap: { enabled: false },
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        padding: { top: 16 },
        automaticLayout: true
      });
      editor.onDidChangeModelContent(() => {
        const val = editor.getValue();
        if (editorContent !== val) editorContent = val;
      });
    });

    return {
      update(newContent: string) {
        if (editor && editor.getValue() !== newContent) {
          editor.setValue(newContent);
        }
      },
      destroy() {
        if (editor) editor.dispose();
      }
    };
  }

  async function saveRoute() {
    const payload = {
      path: routePath,
      isRegex,
      handlerType,
      content: editorContent,
      fileData,
      responseHeaders
    };

    const url = activeRoute ? `/routes/${activeRoute.id}` : '/routes';
    const method = activeRoute ? 'PUT' : 'POST';

    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      await loadRoutes();
      isEditing = false;
    } else {
      alert('Failed to save route. Check console.');
      console.error(await res.text());
    }
  }

  function handleFileUpload(e: any) {
    const file = e.target.files[0];
    if (!file) return;
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64str = event.target?.result?.toString().split(',')[1];
      if (base64str) fileData = base64str;
    };
    reader.readAsDataURL(file);
  }

  function addHeader() {
    if (headerKey.trim() && headerValue.trim()) {
      responseHeaders = { ...responseHeaders, [headerKey.trim()]: headerValue.trim() };
      headerKey = '';
      headerValue = '';
    }
  }

  function removeHeader(key: string) {
    const newHeaders = { ...responseHeaders };
    delete newHeaders[key];
    responseHeaders = newHeaders;
  }
</script>

<div class="flex h-full w-full bg-[#1e1e1e] overflow-hidden">
  
  <!-- Sidebar -->
  <div class="w-80 border-r border-white/5 bg-black/20 flex flex-col shrink-0">
    <div class="p-4 border-b border-white/5 flex gap-2 justify-between items-center bg-[#1a1a1a]">
      <h2 class="text-sm font-semibold tracking-wider uppercase text-slate-300">Routing Table</h2>
      <button on:click={createNew} class="text-xs bg-accent text-white px-3 py-1.5 rounded font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-accent/20">
        + Route
      </button>
    </div>
    
    <div class="flex-1 overflow-y-auto">
      {#each routes as route}
        <button 
          on:click={() => editRoute(route)}
          class="w-full text-left px-4 py-3 border-b border-white/[0.02] flex items-center justify-between transition-colors {activeRoute?.id === route.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-white/5 border-l-2 border-l-transparent'}"
        >
          <span class="font-mono text-xs text-slate-200 truncate pr-2">{route.path}</span>
          <div class="flex gap-1 shrink-0">
            {#if route.isRegex}
              <span class="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/20">RegEx</span>
            {/if}
            <span class="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border border-white/10 text-slate-400 bg-white/5">{route.handlerType}</span>
          </div>
        </button>
      {/each}
      {#if routes.length === 0}
        <div class="p-6 text-slate-500 text-xs italic text-center">No intercept rules defined.</div>
      {/if}
    </div>
  </div>

  <!-- Main View -->
  <div class="flex-1 flex flex-col bg-[#1e1e1e] overflow-hidden relative">
    {#if isEditing}
      <!-- Editor Header Configuration -->
      <div class="h-auto border-b border-white/5 bg-[#18181A] shrink-0 p-6 flex flex-col gap-6">
        
        <!-- Path Header Row -->
        <div class="flex items-center gap-4">
          <div class="flex-1 flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Intercept Path</label>
            <div class="flex items-center gap-2">
              <input 
                type="text" 
                bind:value={routePath} 
                class="flex-1 px-4 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                placeholder="/api/webhook"
              />
              <label class="flex items-center gap-2 px-4 py-2.5 bg-black/20 border border-white/10 rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                <input type="checkbox" bind:checked={isRegex} class="accent-accent" />
                <span class="text-xs font-semibold text-slate-300 uppercase">RegEx</span>
              </label>
            </div>
          </div>
          <div class="w-48 flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Action Type</label>
            <select bind:value={handlerType} class="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white font-medium text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer">
              <option value="JAVASCRIPT">Javascript Runtime</option>
              <option value="STATIC">Serve Static File</option>
            </select>
          </div>
        </div>

      </div>

      <!-- Main Config Canvas -->
      {#if handlerType === 'JAVASCRIPT'}
        <div class="flex-1 right-0 w-full overflow-hidden relative">
          <div use:monacoAction={editorContent} class="absolute inset-0"></div>
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">
          <!-- File Attach -->
          <div class="flex flex-col gap-2">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Serve File Attachment</h3>
            <div class="border-2 border-dashed border-white/10 rounded-xl p-8 flex flex-col items-center justify-center bg-black/20 hover:bg-white/[0.02] transition-colors relative">
              <input type="file" on:change={handleFileUpload} class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <svg class="w-8 h-8 text-accent mb-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              <span class="text-white font-medium">{fileName || 'Drag and drop a file, or click to browse'}</span>
              <span class="text-slate-500 text-xs mt-1">Binary will be natively buffered via PostgreSQL</span>
            </div>
          </div>

          <!-- Strict Headers -->
          <div class="flex flex-col gap-2">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Forced Response Headers</h3>
            <div class="bg-black/20 border border-white/10 rounded-xl overflow-hidden flex flex-col p-4 gap-4">
              <div class="flex gap-2">
                <input bind:value={headerKey} placeholder="Content-Type" class="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-accent" />
                <input bind:value={headerValue} placeholder="image/png" class="flex-[2] px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-accent" />
                <button on:click={addHeader} class="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-medium transition-colors">Add</button>
              </div>
              {#if Object.keys(responseHeaders).length > 0}
                <div class="flex flex-col gap-1 mt-2">
                  {#each Object.entries(responseHeaders) as [key, val]}
                    <div class="flex items-center justify-between bg-black/40 border border-white/5 rounded-lg px-4 py-2 group">
                      <span class="font-mono text-xs"><span class="text-blue-300">{key}</span>: <span class="text-green-300">{val}</span></span>
                      <button on:click={() => removeHeader(key)} class="text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <!-- Bottom Toolbar -->
      <div class="p-4 border-t border-white/5 bg-[#141414] flex justify-end gap-3 shrink-0">
        <button on:click={() => isEditing = false} class="px-6 py-2 rounded-lg text-slate-300 text-sm font-medium hover:bg-white/5 border border-transparent transition-colors">
          Cancel
        </button>
        <button on:click={saveRoute} class="px-6 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-accent/20">
          Save Execution Rule
        </button>
      </div>
    {:else}
      <div class="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
        <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 rotate-3 shadow-2xl">
          <svg class="w-8 h-8 opacity-40 text-accent -rotate-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        <p class="text-sm">Select an active intercept route or create a new one.</p>
        <button on:click={createNew} class="text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2 rounded font-medium transition-colors">
          Create Empty Route
        </button>
      </div>
    {/if}
  </div>
</div>
