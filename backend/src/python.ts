import { spawn } from "node:child_process";
import path from "node:path";
import { AppError } from "./errors.js";
export class PythonEvaluator {
  private running = 0;
  constructor(private executable: string, private root: string) {}
  async evaluate(input: Record<string, unknown>): Promise<any> {
    if (this.running >= 4) throw new AppError("COMPUTE_BUSY",429);
    this.running++;
    try {
      return await new Promise((resolve,reject) => {
        const child = spawn(this.executable, ["-I",path.resolve(this.root,"python_worker/main.py")],
          {shell:false,windowsHide:true,env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT}});
        let out=""; let settled=false;
        const fail=()=>{ if(settled)return; settled=true; child.kill(); reject(new AppError("EVALUATION_FAILED")); };
        const timer=setTimeout(fail,5000);
        child.on("error",fail);
        child.stdout.on("data",b=>{out+=b.toString();if(Buffer.byteLength(out)>262144)fail();});
        child.stderr.resume();
        child.on("close",code=>{
          clearTimeout(timer);if(settled)return;
          if(code!==0)return fail();
          try { const r=JSON.parse(out);
            if(typeof r.allowed!=="boolean" || !Array.isArray(r.reasonCodes) ||
               r.policyDigest!==input.policyDigest || r.inputDigest!==input.inputDigest) return fail();
            settled=true;resolve(r);
          } catch { fail(); }
        });
        child.stdin.on("error",fail);
        child.stdin.end(JSON.stringify({operation:"evaluate",...input}));
      });
    } finally { this.running--; }
  }
}
