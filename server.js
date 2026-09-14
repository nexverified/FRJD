// Corporate-V2 local preview; production uses release/worker.mjs.
import('./release/preview.mjs').catch(error => { console.error(error.message); process.exitCode=1; });
