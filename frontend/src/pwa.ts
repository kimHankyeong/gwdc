import './pwa.css';
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let deferred:InstallEvent|null=null;
export function mountAppControls(){
 document.getElementById('app-controls')?.remove();
 const box=document.createElement('div');box.id='app-controls';
 box.innerHTML=`<p id="connection-status" role="status" ${navigator.onLine?'hidden':''}>오프라인입니다. 연결 후 다시 시도하세요.</p>${matchMedia('(display-mode: standalone)').matches?'':'<button id="install-app" type="button">앱 설치</button>'}<dialog id="install-help" aria-labelledby="install-title"><h2 id="install-title">앱으로 사용하기</h2><p>안드로이드 Chrome: 메뉴 → 앱 설치</p><p>윈도우 Edge: 메뉴 → 앱 → 이 사이트를 앱으로 설치</p><p>설치 메뉴가 없으면 브라우저에서 그대로 사용할 수 있습니다. 구매 기능은 인터넷 연결이 필요합니다.</p><form method="dialog"><button autofocus>닫기</button></form></dialog>`;
 document.body.append(box);
 box.querySelector('#install-app')?.addEventListener('click',async()=>{
  if(deferred){const prompt=deferred;deferred=null;try{await prompt.prompt();await prompt.userChoice;}catch{(box.querySelector('dialog') as HTMLDialogElement).showModal();}}
  else (box.querySelector('dialog') as HTMLDialogElement).showModal();
 });
}
window.addEventListener('beforeinstallprompt',ev=>{ev.preventDefault();deferred=ev as InstallEvent;});
window.addEventListener('appinstalled',()=>{deferred=null;mountAppControls();});
for(const name of ['online','offline'])window.addEventListener(name,()=>{const el=document.getElementById('connection-status');if(el)el.hidden=navigator.onLine;});
if('serviceWorker' in navigator && import.meta.env.PROD)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(()=>{});});
