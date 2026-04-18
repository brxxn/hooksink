import vm from 'vm';
import { vmExecutionDuration } from './metrics';

export async function executeDynamicRoute(scriptContent: string, req: any) {
  const end = vmExecutionDuration.startTimer();
  try {
    // We isolate execution context using Node's native vm.
    // The user administrator is trusted.
    const context = {
      request: {
        method: req.method,
        path: req.path,
        headers: req.headers,
        query: req.query,
        body: req.body,
      },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"status": "ok"}',
      },
      require
    };

    vm.createContext(context);
    
    // Execute script synchronously
    // In actual implementation, if await is needed inside the script, we can wrap it in an async IIFE.
    const script = new vm.Script(scriptContent);
    script.runInContext(context, { timeout: 1000 }); // 1s timeout

    end();
    return context.response;
  } catch (err: any) {
    end();
    return {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: `Execution Error: ${err.message}`
    };
  }
}
