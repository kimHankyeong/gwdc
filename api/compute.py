"""Private deterministic evaluator and DDGS service. Never merchant ordering."""
from http.server import BaseHTTPRequestHandler
import os, json, hmac, threading
from python_worker.main import evaluate
from ddgs import DDGS
slots = threading.BoundedSemaphore(2)
class handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def respond(self, status, data):
        body=json.dumps(data,separators=(',',':')).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        secret=os.environ.get('INTERNAL_API_SECRET','')
        if not secret or not hmac.compare_digest(self.headers.get('Authorization',''), 'Bearer '+secret):
            return self.respond(401,{'error':'UNAUTHORIZED'})
        if not slots.acquire(blocking=False):return self.respond(429,{'error':'COMPUTE_BUSY'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=32768:return self.respond(413,{'error':'INVALID_INPUT'})
            data=json.loads(self.rfile.read(size))
            if data.get('operation')=='evaluate':result=evaluate(data)
            elif data.get('operation')=='search':
                query=data.get('query','');page=data.get('page',1)
                if not isinstance(query,str) or not 0<len(query)<=600 or len(query.split())>75 or type(page)!=int or not 1<=page<=10:
                    return self.respond(400,{'error':'INVALID_INPUT'})
                rows=DDGS(timeout=12,verify=True).text(query,backend='duckduckgo',max_results=10,page=page)
                result={'provider':'ddgs','backend':'duckduckgo','results':[{'href':str(r.get('href','')),'title':str(r.get('title','')),'body':str(r.get('body',''))[:2000]} for r in rows[:10]]}
            else:return self.respond(400,{'error':'INVALID_OPERATION'})
            return self.respond(200,result)
        except Exception:return self.respond(503,{'error':'COMPUTE_UNAVAILABLE'})
        finally:slots.release()
