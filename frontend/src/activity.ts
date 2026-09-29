export function activitySteps(run:any,working=false):string[]{
 if(!run)return [];
 const steps=['요청 접수 · 정책 v'+run.policy_version+' 적용'];
 if(run.constraints)steps.push('구매 조건 정리됨');
 if(run.candidates?.length)steps.push('검색 후보 '+run.candidates.length+'개 확인');
 const evaluations=run.evaluations??[];
 if(evaluations.length)steps.push('정책·금액 검사 '+evaluations.length+'건 · 허용 '+evaluations.filter((x:any)=>x.result?.allowed).length+'건');
 if(run.question&&run.state==='NEEDS_INPUT')steps.push('추가 정보 요청');
 if(run.constraint_approval)steps.push('사용자 조건 승인 확인');
 if(run.intents?.length)steps.push('모의 견적 준비됨');
 if(run.receipts?.length)steps.push('모의 주문 기록 생성됨 · 온체인 상태는 기록에서 확인');
 if(run.error_code)steps.push('진행 중단 · '+run.error_code);
 else if(working)steps.push('AI 작업 응답을 기다리는 중…');
 return steps;
}
export function transactionLink(report:any):string|null{
 return String(report?.chainId)==='11155111'&&/^0x[0-9a-fA-F]{64}$/.test(report?.txHash??'')?'https://sepolia.etherscan.io/tx/'+report.txHash:null;
}
