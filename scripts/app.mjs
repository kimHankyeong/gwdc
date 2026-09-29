// Turnkey online launcher: no API secrets, local DB, Python or workers required.
import {spawn} from 'node:child_process';
const url='https://gwdc-team11.vercel.app/';
try{
 const response=await fetch(url+'api/health',{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const health=await response.json();
 if(health.orderMode!=='SIMULATION'||!health.configured?.auth)throw Error('Unexpected service configuration');
 console.log('구매 앱: '+url+' (주문은 시뮬레이션)');
 if(!health.configured?.audit)console.log('Sepolia 감사 연결 미완료: 최종 주문은 차단됩니다.');
 if(!process.argv.includes('--check')){
  const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
  const child=spawn(command,[url],{detached:true,stdio:'ignore',windowsHide:true});
  child.on('error',()=>console.log('위 주소를 브라우저에서 열어주세요.'));child.unref();
 }
}catch(error){console.error('앱 연결 실패: '+error.message);process.exitCode=1;}
